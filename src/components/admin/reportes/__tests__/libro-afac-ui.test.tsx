/**
 * AFAC por vuelo EDITABLE en el libro en pantalla (16-oct-2026, API 0.0.89,
 * invariante 90 del API; cambio del cliente: «la columna nueva que te pedí
 * mejor que sea en la columna de egreso»). pyservices marca la celda EGRESO
 * (D) de cada fila «AFAC por vuelo» con `vinculo` `afac_real`; el RESERVADO
 * (G) no lleva vínculo. Aquí:
 *  1. el marcado (render estático): qué celda se ofrece para capturar y por
 *     qué otra no; sin celdas `afac_real` el libro sale BYTE A BYTE igual;
 *  2. el cableado (lectura del fuente, el runner no tiene DOM): doble clic,
 *     teclado, el cuadro encima de la celda, guardar sin revalidar, UN
 *     refresco diferido, la confirmación de «quitar» y la página.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibroExcel as LibroExcelJson, LibroExcelCelda } from "@/types/libro-excel";
import {
  TITULO_CELDA_AFAC_EDITABLE,
  TITULO_CELDA_AFAC_SIN_ROL,
} from "@/lib/admin/libro-afac";

vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: (p: { filename: string; label?: string }) => <button data-descarga={p.filename}>{p.label}</button>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/reportes/actions", () => ({
  guardarCostoRealAfacAction: async () => ({ ok: false }),
  quitarCostoRealAfacAction: async () => ({ ok: false }),
}));
// La confirmación sin portal: abierta ⇒ caja testigo; cerrada ⇒ nada.
vi.mock("@/components/ui/alert-dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-alerta="">{children}</div> : null,
    AlertDialogAction: Caja,
    AlertDialogCancel: Caja,
    AlertDialogContent: Caja,
    AlertDialogDescription: Caja,
    AlertDialogFooter: Caja,
    AlertDialogHeader: Caja,
    AlertDialogTitle: Caja,
  };
});

const { LibroExcel } = await import("../libro-excel");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const V236 = "5e2a0f36-0000-4000-8000-000000000236";
const V223 = "5e2a0f36-0000-4000-8000-000000000223";
const CERRADO = "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.";

const vinculo = (extra: Record<string, unknown> = {}) => ({
  tipo: "afac_real",
  campo: "costo_real_mxn",
  vuelo_id: V236,
  clave: "#236 · Ambulancia Internacional",
  matricula: "N621TX",
  valor: null,
  reservado_mxn: 4427.8,
  editable: true,
  motivo: null,
  mes: "2026-09",
  capturado_por: null,
  capturado_at: null,
  ...extra,
});

/** «otros movimientos» en chico: fila AFAC de #236 (sin real) y de #223 (mes cerrado, con real). */
function libroOm(extraD: LibroExcelCelda[] = []): LibroExcelJson {
  return {
    version: 1,
    titulo: "Balance general · 2026-09-01 a 2026-09-30",
    archivo: "balance-general.xlsx",
    generado: "2026-10-16T19:00:00.000Z",
    ancho_columna_default: 8.43,
    alto_fila_default: 15,
    estilos: [{ b: true }, { nf: "#,##0.00" }],
    hojas: [
      {
        nombre: "otros movimientos",
        pestana: null,
        cuadricula: true,
        inmovilizar: { filas: 3, columnas: 1 },
        max_fila: 6,
        max_col: 10,
        columnas: [],
        filas: [],
        combinadas: [],
        celdas: [
          { r: 3, c: 4, v: "EGRESO", t: "EGRESO", s: 0 },
          { r: 3, c: 7, v: "INGRESO", t: "INGRESO", s: 0 },
          { r: 5, c: 1, v: "#236 · Ambulancia Internacional", t: "#236 · Ambulancia Internacional" },
          { r: 5, c: 3, v: "AFAC costo real · por capturar", t: "AFAC costo real · por capturar" },
          { r: 5, c: 4, v: null, t: "", s: 1, vinculo: vinculo() },
          { r: 5, c: 7, v: 4427.8, t: "4,427.80", s: 1 },
          { r: 5, c: 9, v: 4427.8, t: "4,427.80", s: 1, f: "=ROUND(G5-D5,2)" },
          {
            r: 6,
            c: 4,
            v: 1650,
            t: "1,650.00",
            s: 1,
            n: "Capturó Ale el 16/10/2026",
            vinculo: vinculo({ vuelo_id: V223, clave: "#223 · Morena Mia", valor: 1650, reservado_mxn: 1700, editable: false, motivo: CERRADO }),
          },
          { r: 6, c: 7, v: 1700, t: "1,700.00", s: 1 },
          ...extraD,
        ],
      },
    ],
  };
}

const pintar = (libro: LibroExcelJson, props: { pantalla?: boolean; edicionAfac?: boolean } = {}) =>
  renderToStaticMarkup(<LibroExcel libro={libro} {...props} />);

const td = (html: string, ref: string): string =>
  html.match(new RegExp(`<td(?=[^>]*data-ref="${ref}")[^>]*>[\\s\\S]*?</td>`))?.[0] ?? "";

describe("marcado: qué celda se captura (render estático)", () => {
  it("con `pantalla` y permiso: la celda EGRESO del vuelo es editable (clase, estado y tooltip); el RESERVADO no se toca", () => {
    const html = pintar(libroOm(), { pantalla: true, edicionAfac: true });
    const d5 = td(html, "D5");
    expect(d5).toContain("xl-edicion-editable");
    expect(d5).toContain('data-edicion="editable"');
    expect(d5).toContain(`title="${esc(TITULO_CELDA_AFAC_EDITABLE)}"`);
    expect(td(html, "G5")).not.toContain("data-edicion");
    expect(td(html, "G5")).not.toContain("xl-edicion");
    // El remanente sigue siendo lo que manda el libro (el panel no calcula).
    expect(td(html, "I5")).toContain(">4,427.80</td>");
  });

  it("mes cerrado (el API manda `editable:false` y el motivo): bloqueada, con la nota y el motivo en el tooltip y su valor", () => {
    const d6 = td(pintar(libroOm(), { pantalla: true, edicionAfac: true }), "D6");
    expect(d6).toContain("xl-edicion-bloqueada");
    expect(d6).toContain('data-edicion="bloqueada"');
    expect(d6).toContain(`title="${esc(`Capturó Ale el 16/10/2026\n${CERRADO}`)}"`);
    expect(d6).toContain(">1,650.00</td>");
  });

  it("sin permiso (ANALISTA, o API sin la migración) o fuera de la vista «pantalla»: bloqueada con el texto del rol", () => {
    for (const props of [{ pantalla: true, edicionAfac: false }, { pantalla: true }, { pantalla: false, edicionAfac: true }]) {
      const d5 = td(pintar(libroOm(), props), "D5");
      expect(d5).toContain('data-edicion="bloqueada"');
      expect(d5).toContain(`title="${esc(TITULO_CELDA_AFAC_SIN_ROL)}"`);
    }
  });

  it("al montar no hay cuadro de edición, ni confirmación, ni estado en la barra", () => {
    const html = pintar(libroOm(), { pantalla: true, edicionAfac: true });
    expect(html).not.toContain("xl-editor-afac");
    expect(html).not.toContain("data-alerta");
    expect(html).not.toContain("xl-afac-estado");
    // Siguen siendo SOLO dos regiones vivas (nombre y fx).
    expect((html.match(/aria-live=/g) ?? []).length).toBe(2);
  });

  it("una celda con un vínculo que no es del contrato es de solo lectura (sin estado)", () => {
    const raro: LibroExcelCelda = { r: 4, c: 4, v: null, t: "", vinculo: { tipo: "afac_real", vuelo_id: "no-uuid" } };
    expect(td(pintar(libroOm([raro]), { pantalla: true, edicionAfac: true }), "D4")).not.toContain("data-edicion");
  });

  it("SKEW: un libro SIN celdas `afac_real` (pyservices o API previos) sale BYTE A BYTE igual con o sin permiso", () => {
    const sinAfac = libroOm();
    sinAfac.hojas[0].celdas = sinAfac.hojas[0].celdas.filter((c) => !c.vinculo);
    expect(pintar(sinAfac, { pantalla: true, edicionAfac: true })).toBe(pintar(sinAfac, { pantalla: true }));
    expect(pintar(sinAfac, { pantalla: true, edicionAfac: true })).not.toContain("data-edicion");
  });
});

describe("cableado del libro (lectura del fuente)", () => {
  const src = leer("components/admin/reportes/libro-excel.tsx");
  const edicion = leer("components/admin/reportes/libro-afac-edicion.tsx");
  const css = leer("styles/libro-excel.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("la hoja que se PINTA sale de `prepararHojaAfac` (memo) y la cuadrícula se arma igual que siempre", () => {
    expect(src).toMatch(
      /const hoja = useMemo\(\s*\(\) =>\s*hojaDelLibro\s*\?\s*prepararHojaAfac\(hojaDelLibro, \{\s*cambios: afac\.cambios,\s*puedeEditar: puedeEditarAfac,\s*estilos: libro\.estilos,\s*\}\)\s*: null,\s*\[hojaDelLibro, afac\.cambios, puedeEditarAfac, libro\.estilos\],?\s*\);/,
    );
    expect(src).toContain("const puedeEditarAfac = pantalla && edicionAfac;");
    expect(src).toMatch(/^ {2}edicionAfac = false,$/m);
  });

  it("doble clic (2.º clic del delegado), Enter/F2/un dígito y Supr abren o piden quitar SOLO en una celda «editable»", () => {
    const clic = src.match(/const alClicCuerpo = \(e: MouseEvent<HTMLTableSectionElement>\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(clic).toContain("if (sel && e.detail === 2) abrirEdicionAfac(sel, null);");
    expect(src).toMatch(/const onKeyDown = \(e: KeyboardEvent<HTMLDivElement>\) => \{\s*if \(puedeEditarAfac && teclaCeldaAfac\(e\)\) return;/);
    const editable = src.match(/const celdaAfacEditable = \(sel: Seleccion \| null\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(editable).toContain('celda?.edicion?.estado === "editable"');
    const tecla = src.match(/const teclaCeldaAfac = \(e: KeyboardEvent<HTMLDivElement>\): boolean => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(tecla).toContain("teclaEdicionAfac(e)");
    expect(tecla).toContain("if (vinculo.valor !== null) afac.pedirQuitar(vinculo);");
  });

  it("el cuadro va ENCIMA de la celda con su rectángulo REAL (medido en el manejador) y dentro del marco", () => {
    const abrir = src.match(/const abrirEdicionAfac = \(sel: Seleccion, tecleado: string \| null\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(abrir).toContain("cajaEditorAfac(td.getBoundingClientRect(), el.getBoundingClientRect(), el)");
    expect(abrir).toContain("texto: tecleado ?? textoEdicionInicial(vinculo.valor)");
    expect(src).toMatch(/<\/table>\s*\{\/\*[\s\S]*?\*\/\}\s*\{afac\.editor \? \(\s*<EditorCeldaAfac/);
    // La barra de fórmulas enseña lo que se teclea.
    expect(src).toContain("{afac.editor ? afac.editor.texto : contenidoBarraFormulas(celdaSeleccionada)}");
    // `.xl-marco` es el bloque contenedor del cuadro; el cuadro, absoluto y debajo de lo inmovilizado.
    expect(css).toMatch(/^\.xl-marco\s*\{[^}]*position:\s*relative;/m);
    expect(css).toMatch(/\.xl-editor-afac\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*1;/);
  });

  it("Enter/Tab terminan y mueven la selección como Excel; el foco vuelve al marco", () => {
    const terminar = src.match(/const terminarEdicionAfac = \(fin: FinEdicionAfac\): boolean => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(terminar).toContain("marco.current?.focus({ preventScroll: true });");
    expect(terminar).toContain('fin.tipo === "enter" ? (fin.atras ? "ArrowUp" : "ArrowDown")');
    expect(terminar).toContain("seleccionar(desplazarSeleccion(vista, { r: ed.r, c: ed.c }, tecla));");
  });

  it("el refresco diferido y la confirmación viven SOLO con la captura habilitada; useRouter sigue en un solo lugar del libro", () => {
    expect(src).toMatch(/\{puedeEditarAfac \? \(\s*<>\s*<RefrescoDiferidoAfac marca=\{afac\.marcaRefresco\} \/>/);
    expect(src).toContain("contenedor={enPantallaCompleta ? raiz : null}");
    expect((src.match(/useRouter\(\)/g) ?? []).length).toBe(1);
  });

  it("libro-afac-edicion: guarda SIN revalidar, revierte en un rechazo, avisa el 409 y vuelve a leer tras un fallo incierto", () => {
    expect(edicion).toContain("guardarCostoRealAfacAction({ vueloId: id, monto })");
    expect(edicion).toContain("quitarCostoRealAfacAction({ vueloId: id })");
    expect(edicion).toContain("setCambios((prev) => restaurarCambioAfac(prev, id, anterior));");
    expect(edicion).toContain("if (!toastMesCerradoSiAplica(r)) toast.error(texto);");
    // Revisión 16-oct-2026: también relee tras un 409/400/404 que dice que el libro quedó viejo.
    expect(edicion).toContain("if (falloAfacPideRefresco(r)) setMarcaRefresco((n) => n + 1);");
    expect(edicion).toContain(".catch(sinConexion)");
    // Los cambios locales se depuran al llegar un libro NUEVO, en el render (sin efecto).
    expect(edicion).toMatch(/if \(libro !== libroVisto\) \{\s*setLibroVisto\(libro\);\s*setCambios\(\(prev\) => depurarCambiosAfac\(prev, libro\)\);/);
    const actions = leer("app/admin/reportes/actions.ts");
    const afacActions = actions.slice(actions.indexOf("export async function guardarCostoRealAfacAction"));
    expect(afacActions).not.toContain("revalidatePath(");
  });

  it("revisión 16-oct-2026: con el cuadro abierto y un libro NUEVO, si la celda ya es de otro vuelo o se bloqueó, se cierra SIN guardar", () => {
    // El hook recibe la hoja CRUDA que se enseña (la del libro nuevo).
    expect(src).toMatch(/const hojaDelLibro = libro\.hojas\[hojaIdx\] \?\? null;[\s\S]*?const afac = useEdicionAfac\(libro, hojaDelLibro\);/);
    const ajuste = edicion.match(/if \(libro !== libroVisto\) \{([\s\S]*?)\n {2}\}\n/)?.[1] ?? "";
    expect(ajuste).toContain("const vigente = revisarEditorAfac(editor, hoja, depurarCambiosAfac(cambios, libro));");
    expect(ajuste).toMatch(/if \(!vigente\) \{\s*setEditor\(null\);\s*setAviso\(MSG_AFAC_CELDA_CAMBIO\);/);
    // Cerrar NO pasa por `terminar` (no guarda): solo se suelta el cuadro.
    expect(ajuste).not.toContain("terminar(");
    expect(ajuste).not.toContain("enviar(");
  });

  it("revisión 16-oct-2026: la barra dice por qué no se captura la celda AFAC seleccionada (tooltip de la bloqueada)", () => {
    expect(src).toContain(
      'celdaSeleccionada?.edicion?.estado === "bloqueada" ? celdaSeleccionada.edicion.titulo : null',
    );
    expect(css).toMatch(/\.xl-afac-estado\[data-tono="bloqueada"\]\s*\{/);
  });

  it("UN refresco 15 s después del ÚLTIMO guardado (cada guardado lo reprograma; desmontar lo cancela)", () => {
    const refresco = edicion.slice(edicion.indexOf("export function RefrescoDiferidoAfac"));
    expect(refresco).toMatch(
      /useEffect\(\(\) => \{\s*if \(marca === 0\) return;\s*const t = window\.setTimeout\(\(\) => router\.refresh\(\), RETRASO_REFRESCO_AFAC_MS\);\s*return \(\) => window\.clearTimeout\(t\);\s*\}, \[marca, router\]\);/,
    );
  });

  it("el cuadro: ninguna tecla sube al marco; Enter/Tab/Esc; salir con clic guarda, cambiar de ventana NO", () => {
    const editor = edicion.slice(edicion.indexOf("export function EditorCeldaAfac"), edicion.indexOf("export function ConfirmarQuitarAfacDialog"));
    expect(editor).toContain("e.stopPropagation();");
    expect(editor).toContain('if (e.key === "Enter" || e.key === "Tab") {');
    expect(editor).toContain('fin({ tipo: "cancelar" });');
    expect(editor).toContain('if (typeof document !== "undefined" && !document.hasFocus()) return;');
    expect(editor).toContain('inputMode="decimal"');
  });

  it("la página: `edicionAfac` = rol de oficina + `config.afac_real` (de `/me`, cacheado; si falla, nadie edita)", () => {
    const page = leer("app/admin/reportes/balance/page.tsx");
    expect(page).toContain("const edicionAfac = puedeEditarAfacReal(me);");
    const libroJsx = page.match(/<LibroExcel\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(libroJsx).toContain("edicionAfac={edicionAfac}");
    expect(page).toMatch(/const me = await getMe\(\)\.catch\(/);
  });

  it("CSS: las reglas de edición no tocan el position de una celda (las fijas siguen sticky)", () => {
    const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
    const deEdicion = reglas.filter(([sel]) => /xl-edicion-/.test(sel));
    expect(deEdicion.length).toBeGreaterThanOrEqual(3);
    for (const [sel, cuerpo] of deEdicion) expect(cuerpo, sel).not.toMatch(/position\s*:/);
  });
});
