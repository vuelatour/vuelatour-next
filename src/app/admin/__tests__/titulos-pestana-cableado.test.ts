import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as T from "@/lib/admin/titulos-pestana";

/**
 * GUARDIÁN de los títulos de pestaña (14-oct-2026).
 *
 * Pedido del cliente: «estaría genial que en cada pestaña del navegador se
 * ponga el nombre de lo que se está consultando en esa pantalla, para
 * guiarnos cuando tengamos varias pestañas abiertas en los navegadores».
 * Hasta hoy TODAS las páginas de /admin decían «Vuelatour Admin».
 *
 * Reglas que se vigilan aquí (los TEXTOS los congela
 * `lib/admin/__tests__/titulos-pestana.test.ts`):
 *  1. Toda página de /admin exporta `metadata` (título fijo) o
 *     `generateMetadata` (título de la URL), salvo las EXCEPCIONES con
 *     motivo; también `/login` y `/auth/auth-error`.
 *  2. Todas importan su título de `@/lib/admin/titulos-pestana`: ninguna arma
 *     el texto a mano (ni comillas, ni plantillas, ni « · » en el título).
 *  3. El head NUNCA lee el API (ni `/me`). En producción cada <Link> visible
 *     PRECARGA su ruta y, como todas tienen loading.tsx, la precarga corta en
 *     el loading pero SÍ resuelve el head: `generateMetadata` corre SIN la
 *     página, sin render con el cual memoizar el GET. Leer ahí el API era una
 *     lectura nueva por cada fila visible de una tabla (vuelos, cotizaciones,
 *     bodega), siete libros completos al abrir Reportes y un `/me` por cada
 *     vista (el menú precarga Estadísticas e Ingresos), y otra vez en cada
 *     router.refresh() de RefreshOnFocus. `generateMetadata` solo valida la
 *     URL con la MISMA función que la página.
 *  4. `generateMetadata` NUNCA lanza: ni throw, ni notFound(), ni redirect()
 *     (un throw ahí manda la pantalla al error boundary).
 *  5. Lo que necesita DATOS (folio, cliente, matrícula, el tablero del rol)
 *     lo pone la página con `<TituloPestana titulo={tituloVuelo(…)} />`, con
 *     lo que ELLA ya cargó; su `metadata` es el genérico de esa misma familia
 *     («Vuelo» = `tituloVuelo()`), que es lo que se ve mientras carga.
 *  6. `<TituloPestana>` solo vive en páginas (nunca en un layout ni en un
 *     componente compartido) y el layout de /admin no pone título: el sufijo
 *     « · Vuelatour» lo pone el template del layout raíz.
 */

const APP = join(__dirname, "..", ".."); // src/app
const RAIZ = join(APP, "admin"); // src/app/admin
const SRC = join(APP, ".."); // src

/** Páginas que NO llevan título (nunca pintan una pantalla), con su motivo. */
const EXCEPCIONES: Record<string, string> = {
  "quotes/[id]/revise/page.tsx":
    "Solo redirige al detalle de la cotización (conserva el query string): nunca pinta una pantalla.",
  "quotes/grupo/[id]/editar/page.tsx":
    "Solo redirige al detalle del grupo con ?revisar=1: nunca pinta una pantalla.",
};

/** Títulos FIJOS: `export const metadata: Metadata = { title: <constante> };`. */
const ESTATICAS: Record<string, string> = {
  "page.tsx": "TITULOS_SECCION.inicio",
  "account/page.tsx": "TITULOS_PAGINA.miCuenta",
  "aircraft/[id]/page.tsx": "TITULOS_DETALLE.avion",
  "aircraft/page.tsx": "TITULOS_SECCION.aeronaves",
  "airports/page.tsx": "TITULOS_SECCION.aeropuertos",
  "alertas/page.tsx": "TITULOS_SECCION.alertas",
  "bank-accounts/page.tsx": "TITULOS_SECCION.cuentasBancarias",
  "caja-chica/[id]/page.tsx": "TITULOS_SECCION.cajaChica",
  "caja-chica/page.tsx": "TITULOS_SECCION.cajaChica",
  "cards/page.tsx": "TITULOS_SECCION.tarjetas",
  "clients/page.tsx": "TITULOS_SECCION.clientes",
  "combustibles/page.tsx": "TITULOS_SECCION.combustibles",
  "configuracion/page.tsx": "TITULOS_SECCION.configuracion",
  "dashboards/page.tsx": "TITULOS_SECCION.estadisticas",
  "distancias/page.tsx": "TITULOS_SECCION.distancias",
  "document-types/page.tsx": "TITULOS_SECCION.tiposDocumento",
  "engines/page.tsx": "TITULOS_SECCION.motores",
  "expirations/page.tsx": "TITULOS_SECCION.vencimientos",
  "facturas-emitidas/page.tsx": "TITULOS_SECCION.facturasEmitidas",
  "facturas-recibidas/page.tsx": "TITULOS_SECCION.facturasRecibidas",
  "facturas/page.tsx": "TITULOS_SECCION.facturacionAutomatica",
  "flights/[id]/page.tsx": "TITULOS_DETALLE.vuelo",
  "flights/page.tsx": "TITULOS_SECCION.vuelos",
  "gastos-personales/page.tsx": "TITULOS_SECCION.gastosPersonales",
  "ingenieria/page.tsx": "TITULOS_SECCION.ingenieria",
  "ingresos/page.tsx": "TITULOS_SECCION.ingresos",
  "inventory/[id]/page.tsx": "TITULOS_DETALLE.producto",
  "inventory/compras/[id]/page.tsx": "TITULOS_DETALLE.compra",
  "inventory/page.tsx": "TITULOS_SECCION.inventario",
  "issuing-entities/page.tsx": "TITULOS_SECCION.entidadesFiscales",
  "multas/page.tsx": "TITULOS_SECCION.multas",
  "nomina/page.tsx": "TITULOS_SECCION.nomina",
  "otros-gastos/page.tsx": "TITULOS_SECCION.otrosGastos",
  "pilots/[id]/page.tsx": "TITULOS_DETALLE.piloto",
  "pilots/page.tsx": "TITULOS_SECCION.pilotos",
  "profit-sharing/aviones/[id]/historico/page.tsx": "TITULOS_DETALLE.historicoAvion",
  "profit-sharing/aviones/[id]/page.tsx": "TITULOS_DETALLE.repartoAvion",
  "profit-sharing/socios/[id]/page.tsx": "TITULOS_DETALLE.socio",
  "profit-sharing/socios/page.tsx": "TITULOS_SECCION.pagosSocios",
  "propellers/page.tsx": "TITULOS_SECCION.helices",
  "providers/page.tsx": "TITULOS_SECCION.proveedores",
  "quotes/[id]/page.tsx": "TITULOS_DETALLE.cotizacion",
  "quotes/grupo/[id]/page.tsx": "TITULOS_DETALLE.grupo",
  "quotes/grupo/nueva/page.tsx": "TITULOS_PAGINA.grupoNuevo",
  "quotes/grupo/page.tsx": "TITULOS_PAGINA.grupos",
  "quotes/new/page.tsx": "TITULOS_PAGINA.cotizacionNueva",
  "quotes/page.tsx": "TITULOS_SECCION.cotizaciones",
  "reportes/page.tsx": "TITULOS_SECCION.reportes",
  "routes/page.tsx": "TITULOS_SECCION.rutas",
  "users/page.tsx": "TITULOS_SECCION.usuarios",
};

interface DeLaUrl {
  /** Función de `titulos-pestana` que arma el texto. */
  titulo: string;
  /**
   * Validación de la URL que `generateMetadata` llama Y la página también:
   * si divergen, el título describe otra cosa que la pantalla.
   */
  compartidas: string[];
}

/** Títulos de la URL: `export async function generateMetadata(…): Promise<Metadata>`, sin red. */
const DE_LA_URL: Record<string, DeLaUrl> = {
  "[...slug]/page.tsx": { titulo: "tituloComodin", compartidas: ["moduloDeRuta"] },
  "calendar/page.tsx": { titulo: "tituloCalendario", compartidas: ["mesDeLaUrl"] },
  "conciliacion/page.tsx": { titulo: "tituloConciliacion", compartidas: ["filtroConciliacionDeUrl"] },
  "expenses/page.tsx": { titulo: "tituloGastos", compartidas: ["filtroGastosDeUrl"] },
  "inventory/compras/page.tsx": { titulo: "tituloCompras", compartidas: ["filtroComprasDeUrl"] },
  "profit-sharing/page.tsx": { titulo: "tituloReparto", compartidas: ["periodoDeLaUrl"] },
  "reportes/balance/page.tsx": {
    titulo: "tituloBalance",
    compartidas: ["parametrosVistaBalance", "periodoDefaultVista"],
  },
  "taco-live/page.tsx": { titulo: "tituloTacometros", compartidas: [] },
};

/**
 * Títulos con DATOS que la página YA cargó:
 * `<TituloPestana titulo={<función>(…)} />` (regla 5).
 */
const CON_DATOS: Record<string, string> = {
  "aircraft/[id]/page.tsx": "tituloAvion",
  "caja-chica/[id]/page.tsx": "tituloCajaChica",
  "dashboards/page.tsx": "tituloEstadisticas",
  "flights/[id]/page.tsx": "tituloVuelo",
  "ingresos/page.tsx": "tituloIngresos",
  "inventory/[id]/page.tsx": "tituloProducto",
  "inventory/compras/[id]/page.tsx": "tituloCompra",
  "pilots/[id]/page.tsx": "tituloPiloto",
  "profit-sharing/aviones/[id]/historico/page.tsx": "tituloHistoricoAvion",
  "profit-sharing/aviones/[id]/page.tsx": "tituloRepartoAvion",
  "profit-sharing/socios/[id]/page.tsx": "tituloSocio",
  "quotes/[id]/page.tsx": "tituloCotizacion",
  "quotes/grupo/[id]/page.tsx": "tituloGrupo",
  "reportes/balance/page.tsx": "tituloBalance",
};

/** Páginas de sesión, fuera de /admin (rutas relativas a `src/app`). */
const SESION: Record<string, string> = {
  "login/page.tsx": "TITULOS_PAGINA.iniciarSesion",
  "auth/auth-error/page.tsx": "TITULOS_PAGINA.errorSesion",
};

// ═══════════════════════════════ Lectura del código ═══════════════════════════════

function archivos(dir: string, base = "", filtro: (nombre: string) => boolean): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "__tests__" || nombre === "node_modules") continue;
      out.push(...archivos(ruta, base ? `${base}/${nombre}` : nombre, filtro));
    } else if (filtro(nombre)) {
      out.push(base ? `${base}/${nombre}` : nombre);
    }
  }
  return out.sort();
}

const paginas = (dir: string) => archivos(dir, "", (n) => n === "page.tsx");

const rutaDe = (archivo: string) =>
  archivo === "page.tsx" ? "/admin" : `/admin/${archivo.replace(/\/page\.tsx$/, "")}`;

const leer = (archivo: string) => readFileSync(join(RAIZ, archivo), "utf8");

/** Índice justo después de la cadena que abre en `i` ('…', "…" o `…${…}…`). */
function finCadena(src: string, i: number): number {
  const q = src[i];
  for (let k = i + 1; k < src.length; k++) {
    const c = src[k];
    if (c === "\\") {
      k++;
      continue;
    }
    if (q === "`" && c === "$" && src[k + 1] === "{") {
      k = cierre(src, k + 1) - 1;
      continue;
    }
    if (c === q) return k + 1;
    if (q !== "`" && c === "\n") return k + 1;
  }
  return src.length;
}

/** Índice justo después del cierre que empareja la apertura `(`/`{`/`[` en `i`. */
function cierre(src: string, i: number): number {
  const abre = src[i];
  const cierra = abre === "(" ? ")" : abre === "{" ? "}" : "]";
  let nivel = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") {
      k = finCadena(src, k) - 1;
      continue;
    }
    if (c === "/" && src[k + 1] === "/") {
      const n = src.indexOf("\n", k);
      if (n < 0) return src.length;
      k = n;
      continue;
    }
    if (c === "/" && src[k + 1] === "*") {
      const n = src.indexOf("*/", k + 2);
      if (n < 0) return src.length;
      k = n + 1;
      continue;
    }
    if (c === abre) nivel++;
    else if (c === cierra) {
      nivel--;
      if (nivel === 0) return k + 1;
    }
  }
  return src.length;
}

/** El código sin comentarios (las cadenas se conservan tal cual; JSX `{/* … *\/}` también se va). */
function sinComentarios(src: string): string {
  let out = "";
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") {
      const fin = finCadena(src, k);
      out += src.slice(k, fin);
      k = fin - 1;
      continue;
    }
    if (c === "/" && src[k + 1] === "/") {
      const n = src.indexOf("\n", k);
      if (n < 0) break;
      k = n - 1;
      continue;
    }
    if (c === "/" && src[k + 1] === "*") {
      const n = src.indexOf("*/", k + 2);
      if (n < 0) break;
      k = n + 1;
      continue;
    }
    out += c;
  }
  return out;
}

interface Bloque {
  texto: string;
  inicio: number;
  fin: number;
}

/** Cuerpo `{…}` de `[export] [async] function nombre(…) {…}`. */
function cuerpoFuncion(src: string, nombre: string): Bloque | null {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${nombre}\\s*\\(`).exec(src);
  if (!m) return null;
  const paren = m.index + m[0].length - 1;
  const llave = src.indexOf("{", cierre(src, paren));
  if (llave < 0) return null;
  const fin = cierre(src, llave);
  return { texto: src.slice(llave, fin), inicio: llave, fin };
}

const cuerpoGenerateMetadata = (src: string) =>
  /export\s+async\s+function\s+generateMetadata\s*\(/.test(src) ? cuerpoFuncion(src, "generateMetadata") : null;

/** Objeto `{…}` de `export const metadata: Metadata = {…}`. */
function objetoMetadata(src: string): Bloque | null {
  const m = /export\s+const\s+metadata\s*(?::\s*Metadata\s*)?=\s*/.exec(src);
  if (!m) return null;
  const desde = m.index + m[0].length;
  if (src[desde] !== "{") return null;
  const fin = cierre(src, desde);
  return { texto: src.slice(desde, fin), inicio: desde, fin };
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const llamadaRe = (nombre: string, flags = "") =>
  new RegExp(`(?<![\\w.$])${escapar(nombre)}\\s*\\(`, flags);
const llama = (texto: string, nombre: string) => llamadaRe(nombre).test(texto);

/** Nombres LOCALES importados (no `type`) de `@/lib/api/*`: las lecturas del API (incluye `getMe`). */
function importadosDelApi(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/api\/[^"']+["']/g)) {
    for (const parte of m[1].split(",")) {
      const p = parte.trim();
      if (!p || p.startsWith("type ")) continue;
      out.push((p.split(/\s+as\s+/).pop() ?? p).trim());
    }
  }
  return out;
}

const PROHIBIDOS_EN_METADATA: Array<[RegExp, string]> = [
  [/\bthrow\b/, "throw"],
  [/(?<![\w.$])notFound\s*\(/, "notFound()"],
  [/(?<![\w.$])redirect\s*\(/, "redirect()"],
  [/(?<![\w.$])permanentRedirect\s*\(/, "permanentRedirect()"],
  [/(?<![\w.$])forbidden\s*\(/, "forbidden()"],
  [/(?<![\w.$])unauthorized\s*\(/, "unauthorized()"],
  [/unstable_rethrow\s*\(/, "unstable_rethrow()"],
  [/\bfetch\s*\(/, "fetch()"],
  [/\bapiServer\s*\(/, "apiServer()"],
];

/** Reglas comunes al TEXTO del título: nada armado a mano. */
function esperarSinTextoAMano(archivo: string, bloque: string) {
  expect(bloque, `${archivo}: el título usa comillas; va una constante o función de titulos-pestana`).not.toMatch(
    /\btitle\s*:\s*["'`]/,
  );
  expect(bloque, `${archivo}: plantilla de texto en el título (se arma en titulos-pestana)`).not.toMatch(/`/);
  expect(bloque, `${archivo}: « · » escrito a mano (el separador vive en titulos-pestana)`).not.toMatch(/·/);
}

/** Valor de «TITULOS_DETALLE.vuelo» en el módulo real. */
function constante(ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], T);
}

/** Cada `<TituloPestana …/>` del código (sin comentarios). */
const elementosTituloPestana = (codigo: string) => [...codigo.matchAll(/<TituloPestana\b[^>]*\/>/g)].map((m) => m[0]);

/** El título FIJO de una página: `{ title: <constante> }`, nada más. */
function esperarMetadataFija(archivo: string, codigo: string, esperada: string) {
  expect(codigo, "título FIJO: va con `export const metadata`, no con generateMetadata").not.toMatch(
    /generateMetadata/,
  );
  const obj = objetoMetadata(codigo);
  expect(obj, `${archivo}: falta \`export const metadata: Metadata = { title: ${esperada} };\``).not.toBeNull();
  esperarSinTextoAMano(archivo, obj?.texto ?? "");
  expect((obj?.texto ?? "").replace(/\s+/g, "")).toBe(`{title:${esperada}}`.replace(/\s+/g, ""));
  expect(typeof constante(esperada), `${esperada} no existe en titulos-pestana`).toBe("string");
}

// ═══════════════════════════════ Pruebas ═══════════════════════════════

const TODAS = paginas(RAIZ);

describe("inventario de páginas de /admin", () => {
  it("toda página está clasificada: fija, de la URL o excepción (con su motivo)", () => {
    const clasificadas = new Set([
      ...Object.keys(ESTATICAS),
      ...Object.keys(DE_LA_URL),
      ...Object.keys(EXCEPCIONES),
    ]);
    const sinClasificar = TODAS.filter((p) => !clasificadas.has(p));
    expect(sinClasificar, "página nueva: elige su título en titulos-pestana y clasifícala aquí").toEqual([]);
  });

  it("no hay entradas viejas ni repetidas en la clasificación", () => {
    const todas = [...Object.keys(ESTATICAS), ...Object.keys(DE_LA_URL), ...Object.keys(EXCEPCIONES)];
    expect(new Set(todas).size).toBe(todas.length);
    for (const p of todas) expect(existsSync(join(RAIZ, p)), `${p} ya no existe`).toBe(true);
    for (const p of Object.keys(CON_DATOS)) {
      expect(p in ESTATICAS || p in DE_LA_URL, `${p}: con datos, pero sin título de head`).toBe(true);
    }
  });

  it("cada excepción explica su motivo", () => {
    for (const [p, motivo] of Object.entries(EXCEPCIONES)) {
      expect(motivo.trim().length, p).toBeGreaterThan(20);
    }
  });

  it("el layout de /admin no pone título (el sufijo lo pone el template del layout raíz)", () => {
    const layout = sinComentarios(leer("layout.tsx"));
    expect(layout).not.toMatch(/export\s+const\s+metadata\b/);
    expect(layout).not.toMatch(/generateMetadata/);
    expect(layout).not.toMatch(/TituloPestana/);
  });

  it("<TituloPestana> solo vive en páginas (nunca en un layout ni en un componente compartido)", () => {
    const fuera: string[] = [];
    const todos = archivos(SRC, "", (n) => /\.(ts|tsx)$/.test(n));
    for (const rel of todos) {
      if (rel === "components/admin/titulo-pestana.tsx") continue;
      const codigo = sinComentarios(readFileSync(join(SRC, rel), "utf8"));
      const usa = /<TituloPestana\b/.test(codigo) || /["']@\/components\/admin\/titulo-pestana["']/.test(codigo);
      if (usa && !/^app\/admin\/.+\/page\.tsx$/.test(rel)) fuera.push(rel);
    }
    expect(fuera).toEqual([]);
  });
});

for (const archivo of TODAS) {
  const ruta = rutaDe(archivo);

  if (archivo in EXCEPCIONES) {
    describe(`título de pestaña: ${ruta} (excepción)`, () => {
      it("sigue siendo SOLO una redirección", () => {
        const src = sinComentarios(leer(archivo));
        expect(src, `${archivo}: ${EXCEPCIONES[archivo]}`).toMatch(/(?<![\w.$])redirect\s*\(/);
        expect(src, `${archivo} ya pinta algo: necesita su título`).not.toMatch(/return\s*\(\s*</);
      });
    });
    continue;
  }

  describe(`título de pestaña: ${ruta}`, () => {
    const codigo = sinComentarios(leer(archivo));

    it("importa su título de @/lib/admin/titulos-pestana y el tipo Metadata de next", () => {
      expect(codigo).toMatch(/from\s+["']@\/lib\/admin\/titulos-pestana["']/);
      expect(codigo).toMatch(/import\s+(?:type\s+)?\{[^}]*\bMetadata\b[^}]*\}\s+from\s+["']next["']/);
    });

    const estatica = ESTATICAS[archivo];
    if (estatica) {
      it(`exporta metadata con { title: ${estatica} } (sin leer el API)`, () => {
        esperarMetadataFija(archivo, codigo, estatica);
      });
    }

    const url = DE_LA_URL[archivo];
    if (url) {
      it("exporta `async function generateMetadata(…): Promise<Metadata>` (y no `metadata`)", () => {
        expect(codigo).toMatch(
          /export\s+async\s+function\s+generateMetadata\s*\([\s\S]*?\)\s*:\s*Promise<\s*Metadata\s*>\s*\{/,
        );
        expect(codigo, "no se exportan metadata y generateMetadata a la vez").not.toMatch(
          /export\s+const\s+metadata\b/,
        );
      });

      it(`arma el título con ${url.titulo}() y nada a mano`, () => {
        const cuerpo = cuerpoGenerateMetadata(codigo);
        expect(cuerpo, `${archivo}: falta generateMetadata`).not.toBeNull();
        const texto = cuerpo?.texto ?? "";
        expect(llama(texto, url.titulo), `${archivo}: el título sale de ${url.titulo}()`).toBe(true);
        esperarSinTextoAMano(archivo, texto);
      });

      it("NUNCA lanza ni sale a la red: ni throw, ni notFound(), ni redirect(), ni fetch()", () => {
        const texto = cuerpoGenerateMetadata(codigo)?.texto ?? "";
        expect(texto.length, `${archivo}: falta generateMetadata`).toBeGreaterThan(0);
        for (const [re, nombre] of PROHIBIDOS_EN_METADATA) {
          expect(texto, `${archivo}: ${nombre} dentro de generateMetadata`).not.toMatch(re);
        }
      });

      it("NO lee el API (ni /me): la precarga de cada <Link> corre el head SIN la página", () => {
        const cuerpo = cuerpoGenerateMetadata(codigo);
        const texto = cuerpo?.texto ?? "";
        // Ni directo ni a través de las validaciones locales que comparte con la página.
        const locales = url.compartidas
          .map((n) => cuerpoFuncion(codigo, n)?.texto ?? "")
          .filter(Boolean);
        for (const nombre of importadosDelApi(codigo)) {
          expect(llama(texto, nombre), `${archivo}: ${nombre}() en generateMetadata`).toBe(false);
          for (const local of locales) {
            expect(llama(local, nombre), `${archivo}: ${nombre}() dentro de una validación del head`).toBe(false);
          }
        }
        for (const local of locales) {
          for (const [re, nombre] of PROHIBIDOS_EN_METADATA) {
            if (nombre === "throw") continue;
            expect(local, `${archivo}: ${nombre} dentro de una validación del head`).not.toMatch(re);
          }
        }
      });

      it(`valida la URL con lo MISMO que la página: ${url.compartidas.join(", ") || "(nada que compartir)"}`, () => {
        const cuerpo = cuerpoGenerateMetadata(codigo);
        expect(cuerpo, `${archivo}: falta generateMetadata`).not.toBeNull();
        if (!cuerpo) return;
        const fuera = codigo.slice(0, cuerpo.inicio) + codigo.slice(cuerpo.fin);
        for (const nombre of url.compartidas) {
          expect(llama(cuerpo.texto, nombre), `${archivo}: generateMetadata debe llamar ${nombre}()`).toBe(true);
          expect(llama(fuera, nombre), `${archivo}: la PÁGINA también debe llamar ${nombre}()`).toBe(true);
        }
      });
    }

    const conDatos = CON_DATOS[archivo];
    if (conDatos) {
      it(`pone el título con datos: <TituloPestana titulo={${conDatos}(…)} /> con lo que ya cargó`, () => {
        expect(codigo).toMatch(
          /import\s*\{\s*TituloPestana\s*\}\s*from\s*["']@\/components\/admin\/titulo-pestana["']/,
        );
        const elementos = elementosTituloPestana(codigo);
        expect(elementos.length, `${archivo}: falta <TituloPestana titulo={${conDatos}(…)} />`).toBeGreaterThan(0);
        for (const el of elementos) {
          expect(el, `${archivo}: el título sale de ${conDatos}()`).toMatch(
            new RegExp(`^<TituloPestana\\s+titulo=\\{\\s*${conDatos}\\(`),
          );
          expect(el, `${archivo}: texto a mano en <TituloPestana>`).not.toMatch(/["'`·]/);
        }
      });

      if (estatica) {
        it(`mientras carga dice el genérico de su familia: ${estatica} = ${conDatos}()`, () => {
          const fn = (T as unknown as Record<string, (...a: unknown[]) => string>)[conDatos];
          expect(typeof fn).toBe("function");
          expect(constante(estatica)).toBe(fn());
        });
      }
    } else {
      it("no usa <TituloPestana> (si lo necesita, va en CON_DATOS)", () => {
        expect(codigo).not.toMatch(/<TituloPestana\b/);
      });
    }
  });
}

describe("páginas de sesión (fuera de /admin)", () => {
  const halladas = [...paginas(join(APP, "login")).map((p) => `login/${p}`), ...paginas(join(APP, "auth")).map((p) => `auth/${p}`)];

  it("toda página de /login y /auth tiene su título", () => {
    expect(halladas.sort()).toEqual(Object.keys(SESION).sort());
  });

  for (const [archivo, esperada] of Object.entries(SESION)) {
    it(`${archivo}: metadata con { title: ${esperada} } (no la de «Vuelatour Admin»)`, () => {
      const codigo = sinComentarios(readFileSync(join(APP, archivo), "utf8"));
      expect(codigo.startsWith('"use client"'), `${archivo}: un componente cliente no exporta metadata`).toBe(false);
      expect(codigo).toMatch(/from\s+["']@\/lib\/admin\/titulos-pestana["']/);
      esperarMetadataFija(archivo, codigo, esperada);
    });
  }

  it("las rutas se leen relativas a src/app", () => {
    expect(relative(SRC, APP)).toBe("app");
  });
});
