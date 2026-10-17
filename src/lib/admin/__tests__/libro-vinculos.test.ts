/**
 * Llegada desde Conciliación a la CELDA de un gasto (13-oct-2026, API 0.0.75,
 * punto 5): qué celda gana, qué cuenta la celda y los textos EXACTOS de la
 * franja. Los montos son los del API (en pesos): aquí nada se suma.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LibroExcel, LibroExcelCelda, LibroExcelHoja, LibroExcelVinculo } from "@/types/libro-excel";
import {
  ALTO_FRANJA_PX,
  ETIQUETA_QUITAR_FRANJA_GASTO,
  PRIORIDAD_ROL_VINCULO,
  TEXTO_GASTO_NO_ENCONTRADO,
  TEXTO_LIBRO_SIN_VINCULOS,
  TITULO_FRANJA_GASTO,
  buscarCeldaDeGasto,
  claveSalto,
  franjaDeLlegada,
  llegadaAGasto,
  textoFranjaGasto,
  type HallazgoGasto,
} from "../libro-vinculos";

// Caso de QA de prod: OPERACIONES $1,899.09 del vuelo #430 de N4142R; su
// celda suma 3 gastos (y lleva además la TUA anotada, que NO suma).
const G_430 = "2a3e7a09-5d1c-4b7e-9f00-000000000430";
const G_430_B = "2a3e7a09-5d1c-4b7e-9f00-00000000043b";
const G_430_C = "2a3e7a09-5d1c-4b7e-9f00-00000000043c";
const G_TUA = "7f1d0c11-0000-4000-8000-00000000070a";
// Una factura repartida: operación $67.14 + FBO $87.00 = $154.14.
const G_MIXTA = "c0ffee00-0000-4000-8000-000000000154";
const G_USD = "0d011a00-0000-4000-8000-000000000001";
const G_PERMISO = "9e9e9e9e-0000-4000-8000-000000002549";
const G_REPARTO = "37471011-0000-4000-8000-000000016240";

const v = (id: string, rol: LibroExcelVinculo["rol"] | string, extra: Partial<LibroExcelVinculo> = {}) =>
  ({ tipo: "gasto", id, rol, ...extra }) as LibroExcelVinculo;

const celda = (r: number, c: number, vinculos?: LibroExcelVinculo[], extra: Partial<LibroExcelCelda> = {}) =>
  ({ r, c, v: null, t: "", ...(vinculos ? { vinculos } : {}), ...extra }) as LibroExcelCelda;

const hoja = (nombre: string, celdas: LibroExcelCelda[]): LibroExcelHoja => ({
  nombre,
  pestana: null,
  cuadricula: true,
  inmovilizar: null,
  max_fila: 40,
  max_col: 14,
  columnas: [],
  filas: [],
  combinadas: [],
  celdas,
});

const libro = (hojas: LibroExcelHoja[], extra: Partial<LibroExcel> = {}): LibroExcel => ({
  version: 1,
  titulo: "Balance N4142R · 2026-10-01 a 2026-10-31",
  archivo: "balance-N4142R-2026-10-01-2026-10-31.xlsx",
  generado: null,
  ancho_columna_default: 8.43,
  alto_fila_default: 15,
  estilos: [],
  hojas,
  vinculos_gasto: true,
  ...extra,
});

const FILA_430 = "#430 · Beh Kay";
const FILA_431 = "#431 · Corporativo Sur";

/** El libro de un avión: hoja de vuelos, permisos y gastos indirectos. */
const LIBRO_AVION = libro([
  hoja("reporte horas N4142R", [
    celda(5, 1, undefined, { v: FILA_430, t: FILA_430 }),
    celda(5, 4, [
      v(G_430, "suma", { monto_mxn: 1899.09, fila: FILA_430, columna: "OPERACIONES" }),
      v(G_430_B, "suma", { monto_mxn: 500, fila: FILA_430, columna: "OPERACIONES" }),
      v(G_430_C, "suma", { monto_mxn: 250.5, fila: FILA_430, columna: "OPERACIONES" }),
      v(G_TUA, "nota", { monto_mxn: null, gasto_mxn: 1300, fila: FILA_430, columna: "OPERACIONES" }),
    ]),
    celda(5, 6, [v(G_USD, "sin_tc", { monto_mxn: null, fila: FILA_430, columna: "OTROS" })]),
    celda(6, 4, [v(G_MIXTA, "suma", { monto_mxn: 67.14, gasto_mxn: 154.14, fila: FILA_431, columna: "OPERACIONES" })]),
    celda(6, 6, [v(G_MIXTA, "suma", { monto_mxn: 87, gasto_mxn: 154.14, fila: FILA_431, columna: "OTROS" })]),
  ]),
  hoja("permisos", [celda(9, 4, [v(G_PERMISO, "fila", { monto_mxn: 2549, columna: "MONTO MXN" })])]),
  hoja("Gastos Indirectos", [
    celda(4, 4, [v(G_REPARTO, "fila", { monto_mxn: 8120, parte: "reparto", columna: "MONTO MXN" })]),
  ]),
]);

const hallazgo = (l: LibroExcel, id: string): HallazgoGasto => {
  const h = buscarCeldaDeGasto(l, id);
  expect(h, `no se encontró ${id}`).not.toBeNull();
  return h as HallazgoGasto;
};

describe("buscarCeldaDeGasto", () => {
  it("la celda que ES su monto (`fila`) de una hoja POSTERIOR gana a la que lo suma en una anterior", () => {
    const l = libro([
      hoja("reporte horas FLOTA", [celda(3, 4, [v(G_PERMISO, "suma", { monto_mxn: 2549 })])]),
      hoja("vacía", []),
      hoja("permisos", [celda(9, 4, [v(G_PERMISO, "fila", { monto_mxn: 2549 })])]),
    ]);
    const h = hallazgo(l, G_PERMISO);
    expect([h.hojaIdx, h.hojaNombre, h.r, h.c, h.vinculo.rol]).toEqual([2, "permisos", 9, 4, "fila"]);
    expect(PRIORIDAD_ROL_VINCULO).toEqual({ fila: 0, suma: 1, nota: 2, sin_tc: 3 });
  });

  it("en empate de rol gana la hoja, luego la fila y luego la columna (sin depender del orden del arreglo)", () => {
    const id = G_430;
    const l = libro([
      hoja("A", [
        celda(9, 2, [v(id, "suma")]),
        celda(4, 7, [v(id, "suma")]),
        celda(4, 6, [v(id, "suma")]),
      ]),
      hoja("B", [celda(1, 1, [v(id, "suma")])]),
    ]);
    const h = hallazgo(l, id);
    expect([h.hojaIdx, h.r, h.c]).toEqual([0, 4, 6]);
    // Rol desconocido (contrato futuro) va al final, pero se encuentra.
    const raro = libro([hoja("A", [celda(2, 2, [v(id, "otro")]), celda(8, 8, [v(id, "sin_tc")])])]);
    expect(hallazgo(raro, id).r).toBe(8);
    expect(hallazgo(libro([hoja("A", [celda(2, 2, [v(id, "otro")])])]), id).r).toBe(2);
  });

  it("un id ausente ⇒ null; las celdas sin vínculos (o con basura) se ignoran; el id no distingue mayúsculas", () => {
    expect(buscarCeldaDeGasto(LIBRO_AVION, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(buscarCeldaDeGasto(LIBRO_AVION, "")).toBeNull();
    const basura = libro([
      hoja("A", [
        celda(1, 1),
        { ...celda(2, 2), vinculos: "x" as unknown as LibroExcelVinculo[] },
        celda(3, 3, [null as unknown as LibroExcelVinculo, { tipo: "cobro", id: G_430, rol: "fila" } as never]),
        celda(4, 4, [v("", "fila")]),
      ]),
    ]);
    expect(buscarCeldaDeGasto(basura, G_430)).toBeNull();
    expect(buscarCeldaDeGasto(libro([]), G_430)).toBeNull();
    expect(hallazgo(LIBRO_AVION, G_430.toUpperCase()).c).toBe(4);
  });

  it("enCelda cuenta ids distintos; sumanEnCelda solo los que suman; renglones cuenta (hoja, fila)", () => {
    const h = hallazgo(LIBRO_AVION, G_430);
    expect(h.enCelda).toBe(4);
    expect(h.sumanEnCelda).toBe(3);
    expect(h.renglones).toBe(1);
    // Un repartido del libro general: remanente en «otros gastos» y una fila
    // por avión en «repartidos a aviones» ⇒ 3 renglones.
    const general = libro([
      hoja("otros gastos", [celda(3, 4, [v(G_REPARTO, "fila", { monto_mxn: 1000, parte: "remanente" })])]),
      hoja("repartidos a aviones", [
        celda(2, 4, [v(G_REPARTO, "fila", { monto_mxn: 2000, parte: "reparto" })]),
        celda(3, 4, [v(G_REPARTO, "fila", { monto_mxn: 2000, parte: "reparto" })]),
      ]),
    ]);
    const r = hallazgo(general, G_REPARTO);
    expect([r.hojaNombre, r.r, r.renglones]).toEqual(["otros gastos", 3, 3]);
    // Operación + FBO de una factura en la MISMA fila cuentan un renglón.
    expect(hallazgo(LIBRO_AVION, G_MIXTA).renglones).toBe(1);
  });

  it("otrasColumnas: la operación y el FBO de una factura repartida en la misma fila ⇒ [«OTROS»]", () => {
    const h = hallazgo(LIBRO_AVION, G_MIXTA);
    expect([h.c, h.vinculo.columna]).toEqual([4, "OPERACIONES"]);
    expect(h.otrasColumnas).toEqual(["OTROS"]);
    expect(hallazgo(LIBRO_AVION, G_430).otrasColumnas).toEqual([]);
  });
});

describe("llegadaAGasto", () => {
  it("un id que no es uuid ⇒ null (se ignora); un uuid ⇒ hallazgo y si el libro marca gastos", () => {
    expect(llegadaAGasto(LIBRO_AVION, "nada")).toBeNull();
    expect(llegadaAGasto(LIBRO_AVION, null)).toBeNull();
    expect(llegadaAGasto(LIBRO_AVION, undefined)).toBeNull();
    const l = llegadaAGasto(LIBRO_AVION, G_PERMISO);
    expect(l?.gastoId).toBe(G_PERMISO);
    expect(l?.hallazgo?.hojaNombre).toBe("permisos");
    expect(l?.libroMarcaGastos).toBe(true);
    const sinBandera = llegadaAGasto(libro([], { vinculos_gasto: undefined }), G_PERMISO);
    expect(sinBandera).toEqual({ gastoId: G_PERMISO, hallazgo: null, libroMarcaGastos: false });
  });
});

describe("textoFranjaGasto: los textos EXACTOS", () => {
  it("una celda que suma varios gastos (el caso de QA del vuelo #430)", () => {
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_430))).toBe(
      "Gasto $1,899.09 MXN · hoja «reporte horas N4142R» · fila #430 · Beh Kay · OPERACIONES · la celda suma 3 gastos",
    );
  });

  it("la PARTE de una factura repartida: el gasto, lo que va en esta celda y dónde está la otra parte", () => {
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_MIXTA))).toBe(
      "Gasto $154.14 MXN · en esta celda $67.14 MXN · hoja «reporte horas N4142R» · fila #431 · Corporativo Sur · OPERACIONES · otra parte en OTROS",
    );
    // La unión de TOTAL PARA PROVEEDOR (PESOS): monto = gasto ⇒ sin «en esta celda».
    const union = libro([
      hoja("reporte horas FLOTA", [
        celda(6, 20, [
          v(G_MIXTA, "suma", { monto_mxn: 154.14, gasto_mxn: 154.14, fila: FILA_431, columna: "TOTAL PARA PROVEEDOR (PESOS)" }),
        ]),
      ]),
    ]);
    expect(textoFranjaGasto(hallazgo(union, G_MIXTA))).toBe(
      "Gasto $154.14 MXN · hoja «reporte horas FLOTA» · fila #431 · Corporativo Sur · TOTAL PARA PROVEEDOR (PESOS)",
    );
  });

  it("el MONTO de su fila: gasto, parte del reparto, remanente (con sus renglones) y USD sin T.C.", () => {
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_PERMISO))).toBe("Gasto $2,549.00 MXN · hoja «permisos» · fila 9");
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_REPARTO))).toBe(
      "Parte del reparto manual: $8,120.00 MXN · hoja «Gastos Indirectos» · fila 4",
    );
    const general = libro([
      hoja("otros gastos", [celda(3, 4, [v(G_REPARTO, "fila", { monto_mxn: 1000, parte: "remanente" })])]),
      hoja("repartidos a aviones", [
        celda(2, 4, [v(G_REPARTO, "fila", { monto_mxn: 2000, parte: "reparto" })]),
        celda(3, 4, [v(G_REPARTO, "fila", { monto_mxn: 2000, parte: "reparto" })]),
      ]),
    ]);
    expect(textoFranjaGasto(hallazgo(general, G_REPARTO))).toBe(
      "Remanente del reparto manual: $1,000.00 MXN · hoja «otros gastos» · fila 3 · aparece en 3 renglones de este libro",
    );
    const usd = libro([hoja("refacciones", [celda(7, 4, [v(G_USD, "fila", { monto_mxn: null })])])]);
    expect(textoFranjaGasto(hallazgo(usd, G_USD))).toBe(
      "Gasto en USD sin tipo de cambio (no suma en pesos) · hoja «refacciones» · fila 7",
    );
  });

  it("la nota (TUA o extensión de horario) y el USD sin T.C. de la hoja de vuelos no dicen que sumen", () => {
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_TUA))).toBe(
      "Anotado sin sumar ($1,300.00 MXN): TUA o extensión de horario, traslado al cliente · hoja «reporte horas N4142R» · fila #430 · Beh Kay · OPERACIONES",
    );
    expect(textoFranjaGasto(hallazgo(LIBRO_AVION, G_USD))).toBe(
      "Gasto en USD sin tipo de cambio: aún no suma en esta celda (captura su T.C. en Gastos) · hoja «reporte horas N4142R» · fila #430 · Beh Kay · OTROS",
    );
    const sinMonto = libro([hoja("h", [celda(5, 4, [v(G_TUA, "nota")])])]);
    expect(textoFranjaGasto(hallazgo(sinMonto, G_TUA))).toBe(
      "Anotado sin sumar: TUA o extensión de horario, traslado al cliente · hoja «h» · fila 5 · columna D",
    );
  });

  it("rol desconocido: lo mínimo cierto", () => {
    const raro = libro([hoja("x", [celda(5, 3, [v(G_430, "otro", { fila: FILA_430 })])])]);
    expect(textoFranjaGasto(hallazgo(raro, G_430))).toBe("Gasto · hoja «x» · fila #430 · Beh Kay");
  });
});

describe("franjaDeLlegada: tres estados honestos", () => {
  it("encontrado ⇒ verde con la celda; el título lo presenta", () => {
    const f = franjaDeLlegada(llegadaAGasto(LIBRO_AVION, G_PERMISO)!);
    expect(f).toEqual({
      texto: "Gasto $2,549.00 MXN · hoja «permisos» · fila 9",
      tono: "ok",
      titulo: `${TITULO_FRANJA_GASTO}: Gasto $2,549.00 MXN · hoja «permisos» · fila 9`,
    });
  });

  it("el libro marca gastos y no está ⇒ ámbar «no está en este libro»; sin la bandera ⇒ ámbar «falta actualizar el servidor»", () => {
    const ausente = "00000000-0000-4000-8000-000000000000";
    expect(franjaDeLlegada(llegadaAGasto(LIBRO_AVION, ausente)!)).toEqual({
      texto: TEXTO_GASTO_NO_ENCONTRADO,
      tono: "aviso",
      titulo: TEXTO_GASTO_NO_ENCONTRADO,
    });
    expect(franjaDeLlegada(llegadaAGasto({ ...LIBRO_AVION, vinculos_gasto: undefined }, ausente)!)).toEqual({
      texto: TEXTO_LIBRO_SIN_VINCULOS,
      tono: "aviso",
      titulo: TEXTO_LIBRO_SIN_VINCULOS,
    });
    expect(TEXTO_GASTO_NO_ENCONTRADO).toContain("Ver en balance…");
    expect(TEXTO_LIBRO_SIN_VINCULOS).toContain("falta actualizar el servidor");
    expect(ETIQUETA_QUITAR_FRANJA_GASTO).toBe("Quitar aviso");
  });
});

describe("claveSalto (la `key` del libro en la página)", () => {
  it("el mismo libro da la misma clave; otro título u otro archivo, otra; sin gasto ⇒ null", () => {
    const k = claveSalto(G_430, LIBRO_AVION);
    expect(k).toBe(`${G_430}|${LIBRO_AVION.titulo}|${LIBRO_AVION.archivo}`);
    // Un router.refresh() trae un objeto NUEVO con lo mismo: misma clave, no salta.
    expect(claveSalto(G_430, { ...LIBRO_AVION })).toBe(k);
    expect(claveSalto(G_430, { ...LIBRO_AVION, titulo: "Balance N4142R · 2026-09-01 a 2026-09-30" })).not.toBe(k);
    expect(claveSalto(G_430, { ...LIBRO_AVION, archivo: "otro.xlsx" })).not.toBe(k);
    expect(claveSalto(G_430, { ...LIBRO_AVION, archivo: null })).toBe(`${G_430}|${LIBRO_AVION.titulo}|`);
    expect(claveSalto(G_430_B, LIBRO_AVION)).not.toBe(k);
    expect(claveSalto(undefined, LIBRO_AVION)).toBeNull();
    expect(claveSalto(null, LIBRO_AVION)).toBeNull();
  });
});

it("la franja mide 28 px (el CSS y la cuenta del marco lo usan)", () => {
  expect(ALTO_FRANJA_PX).toBe(28);
});

/**
 * PARIDAD del contrato con los repos hermanos (solo existen en el workspace
 * local; en Vercel se omiten). pyservices ya anota `vinculos`; el API los
 * transporta tal cual (`LibroVistaVinculo`): sus pruebas se omiten hasta que
 * el API traiga el punto 5 (`common/ubicacion-balance-gasto.util.ts`).
 */
const HERMANOS = path.resolve(__dirname, "../../../../..");
const leerHermano = (rel: string): string | null => {
  const p = path.join(HERMANOS, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const TIPOS_PANEL = readFileSync(path.resolve(__dirname, "../../../types/libro-excel.ts"), "utf8");
const ROLES = ["fila", "suma", "nota", "sin_tc"];

/**
 * Llaves de PRIMER nivel de una interfaz TS leída como texto (ordenadas), en
 * una línea o en varias y sin contar lo que digan los comentarios.
 */
function llavesDeInterfaz(src: string, nombre: string): string[] | null {
  const ini = new RegExp(`export interface ${nombre}\\b[^{]*\\{`).exec(src);
  if (!ini) return null;
  let cuerpo = "";
  for (let i = ini.index + ini[0].length, prof = 1; i < src.length; i++) {
    if (src[i] === "{") prof++;
    else if (src[i] === "}" && --prof === 0) break;
    cuerpo += src[i];
  }
  const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const llaves: string[] = [];
  let anidado = 0;
  let tramo = "";
  const cerrarTramo = () => {
    const m = /^\s*(\w+)\??\s*:/.exec(tramo);
    if (m) llaves.push(m[1]);
    tramo = "";
  };
  for (const ch of limpio) {
    if ("{(<[".includes(ch)) anidado++;
    else if ("})>]".includes(ch)) anidado--;
    if (anidado === 0 && (ch === ";" || ch === "\n")) cerrarTramo();
    else tramo += ch;
  }
  cerrarTramo();
  return llaves.sort();
}

describe("paridad del contrato `vinculos` con pyservices y el API (repos hermanos)", () => {
  const libroJson = leerHermano("vuelatour-pyservices/app/services/libro_json.py");
  it.skipIf(!libroJson)("pyservices: el MISMO vínculo (tipo, los 4 roles, parte, fila, columna) y la bandera raíz", () => {
    expect(libroJson).toContain("Celda = {r, c, v, t, f?, s?, n?, vinculo?, vinculos?}");
    expect(libroJson).toContain("{tipo: 'gasto', id, rol: 'fila'|'suma'|'nota'|'sin_tc',");
    expect(libroJson).toContain("monto_mxn?, gasto_mxn?, parte?: 'reparto'|'remanente', fila?,");
    expect(libroJson).toContain('libro["vinculos_gasto"] = True');
    expect(Object.keys(PRIORIDAD_ROL_VINCULO)).toEqual(ROLES);
    expect(llavesDeInterfaz(TIPOS_PANEL, "LibroExcelVinculo")).toEqual(
      ["columna", "fila", "gasto_mxn", "id", "monto_mxn", "parte", "rol", "tipo"],
    );
  });

  const xlsx = leerHermano("vuelatour-pyservices/app/services/balance_avion_xlsx.py");
  it.skipIf(!xlsx)("pyservices: las celdas de fila llevan rol 'fila' y su columna; la unión de TOTAL PARA PROVEEDOR es una por id", () => {
    expect(xlsx).toContain('"rol": "fila"');
    expect(xlsx).toContain('vinculo["parte"] = f.gasto_parte');
    expect(xlsx).toContain("def _vinculos_unidos(");
    expect(xlsx).toContain('columna="MONTO MXN"');
    expect(xlsx).toContain('columna="VENTA AL AVIÓN"');
  });

  const tiposApi = leerHermano("vuelatour-api/src/modules/pyservices/libro-vista.types.ts");
  const puntoCincoApi = leerHermano("vuelatour-api/src/common/ubicacion-balance-gasto.util.ts");
  it.skipIf(!tiposApi || !puntoCincoApi)(
    "API: LibroVistaVinculo / LibroVistaCelda / LibroVista = las copias del panel (se omite hasta el punto 5 del API)",
    () => {
      expect(llavesDeInterfaz(tiposApi!, "LibroVistaVinculo")).toEqual(llavesDeInterfaz(TIPOS_PANEL, "LibroExcelVinculo"));
      // `edicion` y `recalculada` son SOLO del panel (AFAC por vuelo,
      // 16-oct-2026): el API y pyservices jamás los mandan.
      const soloPanel = new Set(["edicion", "recalculada"]);
      expect(llavesDeInterfaz(tiposApi!, "LibroVistaCelda")).toEqual(
        llavesDeInterfaz(TIPOS_PANEL, "LibroExcelCelda").filter((k) => !soloPanel.has(k)),
      );
      // `cierre` (cierre de mes, API 0.0.88) lo copia pyservices a la raíz del
      // libro y el API lo TRANSPORTA sin declararlo en `LibroVista`.
      expect(llavesDeInterfaz(tiposApi!, "LibroVista")).toEqual(
        llavesDeInterfaz(TIPOS_PANEL, "LibroExcel").filter((k) => k !== "cierre"),
      );
      for (const rol of ROLES) expect(tiposApi).toContain(`'${rol}'`);
    },
  );
});
