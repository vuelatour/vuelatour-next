import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CANDADO (29-sep-2026): un archivo en base64 NUNCA viaja como argumento
 * suelto de una server action.
 *
 * React (`decodeReply`, el que deserializa los argumentos en el servidor)
 * suma la longitud de los TEXTOS que van directos en la lista de argumentos
 * y, si pasa de 1,000,000 caracteres con más de un argumento, revienta con
 * «Maximum array nesting exceeded» — que el usuario ve como el error genérico
 * «An error occurred in the Server Components render». Así falló la
 * importación del estado de cuenta con un PDF de 1.18 MB (1.6 M caracteres en
 * base64); los menores a ~750 KB pasaban y por eso nadie lo había visto.
 * Un texto DENTRO de un objeto no cuenta para ese límite.
 *
 * Regla: toda action exportada con DOS o más parámetros no puede tener un
 * parámetro `string` cuyo nombre cargue el contenido de un archivo (base64 /
 * b64). Se manda un objeto `{ filename, fileBase64 }`. Con UN solo parámetro
 * React no aplica el límite, pero se documenta igual.
 */

const RAIZ = join(__dirname, "..");

function archivosActions(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) {
      if (nombre === "__tests__" || nombre === "node_modules") continue;
      out.push(...archivosActions(ruta));
    } else if (nombre === "actions.ts") {
      out.push(ruta);
    }
  }
  return out;
}

/** Firmas `export async function xAction(<params>)` con sus parámetros crudos. */
function firmas(src: string): Array<{ nombre: string; params: string }> {
  const re = /export async function (\w+)\s*\(([\s\S]*?)\)\s*:\s*Promise/g;
  const res: Array<{ nombre: string; params: string }> = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    res.push({ nombre: m[1], params: m[2] });
  }
  return res;
}

/** Parámetros de primer nivel (separa por comas fuera de llaves/paréntesis). */
function parametrosDePrimerNivel(params: string): string[] {
  const out: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const ch of params) {
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") nivel++;
    if (ch === "}" || ch === ")" || ch === "]" || ch === ">") nivel--;
    if (ch === "," && nivel === 0) {
      out.push(actual.trim());
      actual = "";
    } else {
      actual += ch;
    }
  }
  if (actual.trim()) out.push(actual.trim());
  // Comentarios /** … */ pegados al parámetro no cuentan como parámetro.
  return out.map((p) => p.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean);
}

// Solo nombres que cargan el CONTENIDO de un archivo (base64 / b64): un
// `imageId` o un `pdf_fecha` son ids y fechas cortas, no archivos.
const PARAM_ARCHIVO = /^(\w*(base64|b64)\w*)\??\s*:\s*string\b/i;

describe("server actions: los archivos en base64 viajan dentro de un objeto", () => {
  const archivos = archivosActions(RAIZ);

  it("hay actions que revisar", () => {
    expect(archivos.length).toBeGreaterThan(5);
  });

  it("ninguna action con 2+ parámetros recibe un archivo como string suelto", () => {
    const culpables: string[] = [];
    for (const ruta of archivos) {
      const src = readFileSync(ruta, "utf8");
      for (const f of firmas(src)) {
        const params = parametrosDePrimerNivel(f.params);
        if (params.length < 2) continue;
        for (const p of params) {
          if (PARAM_ARCHIVO.test(p)) {
            culpables.push(`${ruta.replace(RAIZ, "")} → ${f.nombre}(${p.split(":")[0].trim()})`);
          }
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  it("parseEstadoCuentaAction recibe UN objeto con filename y fileBase64", () => {
    const src = readFileSync(join(RAIZ, "conciliacion", "actions.ts"), "utf8");
    const f = firmas(src).find((x) => x.nombre === "parseEstadoCuentaAction");
    expect(f).toBeDefined();
    const params = parametrosDePrimerNivel(f!.params);
    expect(params).toHaveLength(1);
    expect(params[0]).toMatch(/^input\s*:\s*\{/);
    expect(params[0]).toMatch(/fileBase64\s*:\s*string/);
  });

  it("el diálogo de importación llama a la action con el objeto", () => {
    const dialogo = readFileSync(
      join(RAIZ, "..", "..", "components", "admin", "conciliacion", "import-dialog.tsx"),
      "utf8",
    );
    const llamadas = dialogo.match(/parseEstadoCuentaAction\(\s*\{/g) ?? [];
    expect(llamadas.length).toBe(2);
    expect(dialogo).not.toMatch(/parseEstadoCuentaAction\(\s*[a-zA-Z.]+\s*,/);
  });
});
