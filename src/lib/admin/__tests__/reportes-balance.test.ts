/**
 * Card «Balance mensual y balance general» de `/admin/reportes` (6-oct-2026,
 * API 0.0.64). Pedido del cliente: «me pueden poner otro botón para bajar el
 * balance general; el que ya tenemos que se renombre a "Balance mensual" y el
 * nuevo botón sea el "Balance general"». Costo por hora confirmado: «es el
 * total de todos los gastos, entre el tiempo volado, entre el tipo de cambio
 * del día, entre 1.16 (para sacar subtotal)».
 *
 * Se custodia:
 *  1. los textos (título, una línea por libro, nota y etiquetas: copia del
 *     contrato);
 *  2. archivo y parámetros de cada botón: la MISMA ruta, `modo` distinto y
 *     el periodo de la página;
 *  3. la paridad de los modos y de la ruta con el API (si el repo hermano
 *     está al lado);
 *  4. el cableado de la página: dos botones en orden, todo sale del helper y
 *     el título viejo ya no se pinta.
 *
 * Desde el 12-oct-2026 («los balances a un clic») además: el hero de
 * balances va ANTES del cierre, los aviones llegan a la grilla ORDENADOS, un
 * catálogo que no cargó se DICE (nunca «sin aviones»/«sin vuelos»), y los
 * balances solo se OFRECEN a quien puede abrirlos (ADMIN y ANALISTA, como el
 * API); sin `/me` se ofrece todo.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODOS_BALANCE_VUELATOUR,
  NOTA_BALANCE_VUELATOUR,
  RUTA_BALANCE_VUELATOUR,
  TITULO_CARD_BALANCE_VUELATOUR,
  TITULO_DETALLE_LIBROS,
  archivoBalanceVuelaTour,
  librosBalanceVuelaTour,
  lineaDescripcionBalance,
} from "../reportes-balance";
import { TEXTO_BALANCES_SIN_PERMISO, textoPeriodoVista } from "../balance-vista";
import {
  SUBTITULO_REPORTES,
  SUBTITULO_REPORTES_SIN_BALANCES,
  type AvionBalanceItem,
} from "../reportes-ui";

/** Lo que recibe cada `ExcelExportButton` de la página (testigo). */
interface PropsBotonExcel {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
}
const botonesExcel: PropsBotonExcel[] = [];

/** Lo que recibe la grilla de aviones (testigo). */
interface PropsPicker {
  aircraft: AvionBalanceItem[];
  disponibles?: boolean;
  desde: string;
  hasta: string;
}
const pickerProps: PropsPicker[] = [];

/** Lo que recibe el selector de vuelo (testigo). */
interface PropsVuelos {
  flights: unknown[];
  fallo?: boolean;
}
const vueloProps: PropsVuelos[] = [];

/** Respuestas del API, reemplazables por prueba (se restauran en `afterEach`). */
const api = {
  aviones: async (): Promise<{ data: unknown[]; count: number }> => ({ data: [], count: 0 }),
  vuelos: async (): Promise<{ data: unknown[]; count: number }> => ({ data: [], count: 0 }),
  me: async (): Promise<{ rol: string }> => ({ rol: "ADMIN" }),
};
const apiDefault = { ...api };

// La página real descarga con la sesión del navegador y lee el API: aquí
// solo se registra con qué se pintó cada botón y lo demás se apaga.
vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: (p: PropsBotonExcel) => {
    botonesExcel.push(p);
    return null;
  },
}));
vi.mock("@/components/admin/profit-sharing/period-selector", () => ({
  PeriodSelector: () => null,
}));
vi.mock("@/components/admin/profit-sharing/mes-reporte-select", () => ({
  CierreRepartoSection: () => null,
}));
vi.mock("@/components/admin/flights/flight-report-picker", () => ({
  FlightReportPicker: (p: PropsVuelos) => {
    vueloProps.push(p);
    return null;
  },
}));
vi.mock("@/components/admin/reportes/aircraft-balance-picker", () => ({
  AircraftBalancePicker: (p: PropsPicker) => {
    pickerProps.push(p);
    return null;
  },
}));
vi.mock("@/components/admin/reportes/pre-cierre-card", () => ({
  PreCierreCard: () => null,
}));
vi.mock("@/lib/api/flights-server", () => ({
  listFlights: () => api.vuelos(),
}));
vi.mock("@/lib/api/aircraft", () => ({
  listAircraft: () => api.aviones(),
}));
// IMPRESCINDIBLE: `@/lib/api/me` → `./server` → `@/lib/supabase/server` →
// `@/lib/env`, que LANZA «Missing required env var» al importar.
vi.mock("@/lib/api/me", () => ({
  getMe: () => api.me(),
}));

const { default: ReportesPage } = await import("@/app/admin/reportes/page");

afterEach(() => {
  api.aviones = apiDefault.aviones;
  api.vuelos = apiDefault.vuelos;
  api.me = apiDefault.me;
  vi.restoreAllMocks();
});

/** COPIA del contrato (§4) — si cambia un texto, se cambia aquí y en el helper. */
const CONTRATO = {
  titulo: "Balance mensual y balance general",
  ruta: "/v1/aircraft/balance-general.xlsx",
  mensual: {
    etiqueta: "Descargar balance mensual (Excel)",
    linea:
      "Balance mensual: el libro completo de siempre — resumen por avión, hoja de vuelos (reporte de horas) con el desglose de operación, piloto, otros y permiso AFAC, otros movimientos, cobranza, otros gastos de la empresa, repartidos a aviones, inventario de bodega, balance por avión con sus socios y pendientes de captura.",
    resumen:
      "El libro de siempre: resumen por avión, vuelos con desglose, cobranza, gastos, bodega y socios.",
  },
  general: {
    etiqueta: "Descargar balance general (Excel)",
    linea:
      "Balance general: el mismo libro con la hoja de vuelos resumida a costo total y costo por hora (sin desglose de operación/piloto/AFAC). Costo por hora = costo total ÷ tiempo volado ÷ tipo de cambio ÷ 1.16 (dólares sin IVA).",
    resumen:
      "El mismo libro con la hoja de vuelos a costo total y costo por hora. En pantalla puede tardar hasta un minuto.",
  },
  nota: "Los dos consolidan toda la flota en el periodo elegido arriba; el libro de un solo avión se descarga en «Balance por avión».",
  tituloDetalle: "¿Qué trae cada libro?",
} as const;

const EXPORTS = [
  "/v1/inventory/items/export",
  "/v1/inventory/movimientos/export",
  "/v1/dashboards/horas-piloto/export",
  "/v1/expenses/export",
];
/** «Horas por piloto» es `@Roles(ADMIN, COORDINADOR)` en el API: a los demás roles no se les ofrece. */
const EXPORTS_SIN_HORAS_PILOTO = EXPORTS.filter((p) => p !== "/v1/dashboards/horas-piloto/export");

describe("textos de la card", () => {
  it("título nuevo (el viejo era «Balance general VuelaTour»)", () => {
    expect(TITULO_CARD_BALANCE_VUELATOUR).toBe(CONTRATO.titulo);
  });

  it("una línea por libro, en el orden de los botones, y la nota común", () => {
    const libros = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(libros.map(lineaDescripcionBalance)).toEqual([
      CONTRATO.mensual.linea,
      CONTRATO.general.linea,
    ]);
    expect(NOTA_BALANCE_VUELATOUR).toBe(CONTRATO.nota);
  });

  it("el general dice qué quita y cómo sale el costo por hora (la fórmula del cliente)", () => {
    const [mensual, general] = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(general.nombre).toBe("Balance general");
    expect(general.detalle).toContain(
      "el mismo libro con la hoja de vuelos resumida a costo total y costo por hora (sin desglose de operación/piloto/AFAC)",
    );
    expect(general.detalle).toContain("costo total ÷ tiempo volado ÷ tipo de cambio ÷ 1.16");
    // El mensual es el de siempre: sí trae el desglose.
    expect(mensual.nombre).toBe("Balance mensual");
    expect(mensual.detalle.startsWith("el libro completo de siempre")).toBe(true);
    expect(mensual.detalle).toContain("operación, piloto, otros y permiso AFAC");
  });

  it("etiquetas de los botones", () => {
    expect(librosBalanceVuelaTour("2026-09-01", "2026-09-30").map((l) => l.etiqueta)).toEqual([
      CONTRATO.mensual.etiqueta,
      CONTRATO.general.etiqueta,
    ]);
  });

  it("una línea CORTA por libro para el tile y el título del plegable (12-oct-2026)", () => {
    expect(librosBalanceVuelaTour("2026-09-01", "2026-09-30").map((l) => l.resumen)).toEqual([
      CONTRATO.mensual.resumen,
      CONTRATO.general.resumen,
    ]);
    expect(TITULO_DETALLE_LIBROS).toBe(CONTRATO.tituloDetalle);
  });
});

describe("archivo y parámetros de cada libro", () => {
  it("misma ruta para los dos; el `modo` decide el libro y viaja SIEMPRE", () => {
    expect(MODOS_BALANCE_VUELATOUR).toEqual(["mensual", "general"]);
    expect(RUTA_BALANCE_VUELATOUR).toBe(CONTRATO.ruta);
    const libros = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(libros.map((l) => [l.modo, l.path, l.query])).toEqual([
      ["mensual", CONTRATO.ruta, { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" }],
      ["general", CONTRATO.ruta, { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" }],
    ]);
  });

  it("nombre del archivo con el libro y el periodo (el mismo que pone el API)", () => {
    expect(archivoBalanceVuelaTour("mensual", "2026-09-01", "2026-09-30")).toBe(
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    );
    expect(archivoBalanceVuelaTour("general", "2026-10-01", "2026-10-06")).toBe(
      "balance-general-vuelatour-2026-10-01-a-2026-10-06.xlsx",
    );
    expect(librosBalanceVuelaTour("2026-09-01", "2026-09-30").map((l) => l.filename)).toEqual([
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
      "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    ]);
  });

  it("cada llamada arma objetos nuevos (mover el periodo no arrastra el anterior)", () => {
    const a = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    const b = librosBalanceVuelaTour("2026-08-01", "2026-08-31");
    expect(a[0].query).not.toBe(b[0].query);
    expect(a[0].query.desde).toBe("2026-09-01");
    expect(b[1].filename).toBe("balance-general-vuelatour-2026-08-01-a-2026-08-31.xlsx");
  });
});

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("paridad con el API", () => {
  const utilModo = leerApi("modules/aircraft/balance-general-modo.util.ts");
  it.skipIf(!utilModo)("los modos que acepta el API (otro ⇒ 400) son los del panel, en el mismo orden", () => {
    const bloque = utilModo!.match(/MODOS_BALANCE_GENERAL\s*=\s*\[([\s\S]*?)\]/)?.[1];
    expect(bloque, "no se encontró MODOS_BALANCE_GENERAL en el API").toBeTruthy();
    const modosApi = [...bloque!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(modosApi).toEqual([...MODOS_BALANCE_VUELATOUR]);
  });

  const controller = leerApi("modules/aircraft/aircraft.controller.ts");
  it.skipIf(!controller)("la ruta es la del controlador del API (`/v1` + aircraft + balance-general.xlsx)", () => {
    expect(controller).toMatch(/@Controller\(\{\s*path:\s*'aircraft',\s*version:\s*'1'\s*\}\)/);
    expect(controller).toContain("@Get('balance-general.xlsx')");
    expect(RUTA_BALANCE_VUELATOUR).toBe("/v1/aircraft/balance-general.xlsx");
  });
});

/** Texto visible del marcado (sin etiquetas ni entidades básicas). */
function textoVisible(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function pintarPagina(sp: { desde?: string; hasta?: string }) {
  botonesExcel.length = 0;
  pickerProps.length = 0;
  vueloProps.length = 0;
  const el = await ReportesPage({ searchParams: Promise.resolve(sp) });
  return textoVisible(renderToStaticMarkup(el));
}

/** Un fallo del API con su `status` (lo que `apiFetch` lanza). */
const falla = (status: number) => async () => {
  throw Object.assign(new Error(`HTTP ${status}`), { status });
};

const UUID = (n: number) => `3f9a1c2e-0000-4000-8000-00000000000${n}`;

/** La flota real como la manda `GET /v1/aircraft` (solo los campos que usa la página), DESORDENADA. */
const FLOTA_API = [
  { id: UUID(1), matricula: "XB-PEV", modelo: "Cessna 205", activa: true, color_calendario: "#3B82F6" },
  { id: UUID(7), matricula: "XB-IJP", modelo: "Cessna 210", activa: false, color_calendario: null },
  { id: UUID(3), matricula: "N4142R", modelo: "Piper Seneca V", activa: true, color_calendario: "" },
  { id: UUID(2), matricula: "XA-VGV", modelo: "Cessna 206", activa: true, color_calendario: "#22C55E" },
];

const RUTA_PAGINA = path.resolve(__dirname, "../../../app/admin/reportes/page.tsx");

describe("cableado de la página /admin/reportes", () => {
  it("dos botones con `modo` (mensual, general) en la card; los exports de operación siguen igual", async () => {
    await pintarPagina({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(botonesExcel.map((b) => b.path)).toEqual([CONTRATO.ruta, CONTRATO.ruta, ...EXPORTS]);
    const balance = botonesExcel.filter((b) => b.path === CONTRATO.ruta);
    expect(balance).toEqual([
      {
        path: CONTRATO.ruta,
        filename: "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
        label: CONTRATO.mensual.etiqueta,
        query: { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" },
      },
      {
        path: CONTRATO.ruta,
        filename: "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
        label: CONTRATO.general.etiqueta,
        query: { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" },
      },
    ]);
  });

  it("pinta el título nuevo, una línea por libro y la nota; el título y el botón viejos ya no", async () => {
    const texto = await pintarPagina({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(texto).toContain(CONTRATO.titulo);
    expect(texto).toContain(CONTRATO.mensual.linea);
    expect(texto).toContain(CONTRATO.general.linea);
    expect(texto).toContain(CONTRATO.nota);
    expect(texto).not.toContain("Balance general VuelaTour");
  });

  it("los botones reciben el periodo YA validado de la página (fechas al revés se ordenan)", async () => {
    await pintarPagina({ desde: "2026-09-30", hasta: "2026-09-01" });
    const balance = botonesExcel.filter((b) => b.path === CONTRATO.ruta);
    expect(balance.map((b) => b.query)).toEqual([
      { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" },
      { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" },
    ]);
    expect(balance.map((b) => b.filename)).toEqual([
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
      "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    ]);
  });

  it("los textos y los botones salen del helper (ni el título ni las etiquetas se escriben a mano)", () => {
    const src = readFileSync(RUTA_PAGINA, "utf8");
    expect(src).toContain('from "@/lib/admin/reportes-balance"');
    expect(src).toContain("librosBalanceVuelaTour(desde, hasta)");
    expect(src).toContain("{TITULO_CARD_BALANCE_VUELATOUR}");
    expect(src).toContain("{NOTA_BALANCE_VUELATOUR}");
    expect(src).not.toContain("Descargar balance general VuelaTour");
    expect(src).not.toContain("balance-general-vuelatour-");
    expect(src).not.toMatch(/modo[=:]\s*["']/);
  });
});

describe("los balances al frente (12-oct-2026)", () => {
  it("el hero (flota y avión) va ANTES del cierre; el resumen corto de cada libro y el periodo en palabras se pintan", async () => {
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    const cierre = texto.indexOf("Cierre y reparto del periodo");
    expect(cierre).toBeGreaterThan(0);
    expect(texto.indexOf(CONTRATO.titulo)).toBeLessThan(cierre);
    expect(texto.indexOf("Balance por avión")).toBeLessThan(cierre);
    expect(texto).toContain(CONTRATO.mensual.resumen);
    expect(texto).toContain(CONTRATO.general.resumen);
    expect(texto).toContain(CONTRATO.tituloDetalle);
    expect(texto).toContain(textoPeriodoVista("2026-10-01", "2026-10-12"));
    expect(texto).toContain("Revisa primero el pre-cierre de arriba.");
    expect(texto).toContain(SUBTITULO_REPORTES);
    expect(texto).not.toContain(SUBTITULO_REPORTES_SIN_BALANCES);
    // El picker y el selector de vuelo reciben el periodo y «todo cargó».
    expect(pickerProps.at(-1)).toMatchObject({ disponibles: true, aircraft: [], desde: "2026-10-01", hasta: "2026-10-12" });
    expect(vueloProps.at(-1)).toMatchObject({ flights: [], fallo: false });
  });

  it("los aviones llegan a la grilla ORDENADOS (activos A–Z, inactivos al final) y con sus 5 campos", async () => {
    api.aviones = async () => ({ data: FLOTA_API, count: FLOTA_API.length });
    await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    const p = pickerProps.at(-1)!;
    expect(p.disponibles).toBe(true);
    expect(p.aircraft.map((a) => a.matricula)).toEqual(["N4142R", "XA-VGV", "XB-PEV", "XB-IJP"]);
    expect(p.aircraft[0]).toEqual({ id: UUID(3), matricula: "N4142R", modelo: "Piper Seneca V", activa: true, color: null });
    expect(p.aircraft[3]).toEqual({ id: UUID(7), matricula: "XB-IJP", modelo: "Cessna 210", activa: false, color: null });
  });

  it("los aviones NO cargaron (502) ⇒ la grilla lo sabe y la página AVISA; un 403 degrada en silencio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.aviones = falla(502);
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(pickerProps.at(-1)).toMatchObject({ disponibles: false, aircraft: [] });
    expect(texto).toContain("No se pudieron cargar los aviones");
    // El resto de la pantalla sigue: los 6 botones de siempre.
    expect(botonesExcel.map((b) => b.path)).toEqual([CONTRATO.ruta, CONTRATO.ruta, ...EXPORTS]);

    api.aviones = falla(403);
    const silencio = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(pickerProps.at(-1)).toMatchObject({ disponibles: false, aircraft: [] });
    expect(silencio).not.toContain("No se pudieron cargar los aviones");
  });

  it("los vuelos NO cargaron (502) ⇒ el selector lo dice (`fallo`), nunca «Sin vuelos»", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.vuelos = falla(502);
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(vueloProps.at(-1)).toMatchObject({ flights: [], fallo: true });
    expect(texto).toContain("No se pudieron cargar los vuelos recientes");
  });

  it("cableado del fuente: default del periodo, atajos, degradación por tarjeta y el plegable; sin try/catch mudo", () => {
    const src = readFileSync(RUTA_PAGINA, "utf8");
    expect(src).toContain("<TextoPlegable titulo={TITULO_DETALLE_LIBROS}>");
    expect(src).toContain("degradado.opcional(");
    // Inicio oficial (16-oct-2026): los atajos reciben la fecha (sin «Mes pasado» antes del inicio).
    expect(src).toContain("<AtajosPeriodoReportes hoy={hoy} desde={desde} hasta={hasta} inicio={inicio} />");
    expect(src).toContain("periodoDefaultVista(hoy)");
    expect(src).toContain("<PeriodSelector initial={{ desde, hasta }} />");
    expect(src).toContain("<AvisoDegradado faltantes={degradado.faltantes} />");
    expect(src).toContain("fallo={vuelosFallaron}");
    expect(src).toContain("disponibles={avionesDisponibles}");
    // Las dos grillas son listas de verdad para VoiceOver (el preflight quita las viñetas).
    expect(src).toContain('role="list"');
    expect(src).toContain('aria-labelledby="reportes-balances-flota"');
    expect(src).not.toContain("catch {");
    expect(src).not.toContain("currentMonth");
    expect(src).not.toContain("atajoMesPasado");
    expect(src).not.toContain("opacity-");
  });
});

describe("los balances solo se OFRECEN a quien puede abrirlos (ADMIN y ANALISTA, como el API)", () => {
  it("FACTURACION: en lugar del hero, la card con candado; quedan los exports que su rol puede usar", async () => {
    api.me = async () => ({ rol: "FACTURACION" });
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    // Sin «Horas por piloto» (`@Roles(ADMIN, COORDINADOR)`): no se ofrece un botón que responde 403.
    expect(botonesExcel.map((b) => b.path)).toEqual(EXPORTS_SIN_HORAS_PILOTO);
    expect(pickerProps).toHaveLength(0);
    expect(texto).toContain(TEXTO_BALANCES_SIN_PERMISO.titulo);
    expect(texto).toContain("ADMIN y ANALISTA");
    expect(texto).not.toContain(CONTRATO.titulo);
    // La cabecera tampoco lo invita a abrir balances.
    expect(texto).toContain(SUBTITULO_REPORTES_SIN_BALANCES);
    expect(texto).not.toContain(SUBTITULO_REPORTES);
    // El pre-cierre, el cierre y los demás reportes siguen.
    expect(texto).toContain("Cierre y reparto del periodo");
    expect(texto).toContain("Reporte por vuelo");
  });

  it("ANALISTA abre los balances; «Horas por piloto» no se le ofrece (el API se lo niega)", async () => {
    api.me = async () => ({ rol: "ANALISTA" });
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(botonesExcel.map((b) => b.path)).toEqual([CONTRATO.ruta, CONTRATO.ruta, ...EXPORTS_SIN_HORAS_PILOTO]);
    expect(pickerProps).toHaveLength(1);
    expect(texto).toContain(SUBTITULO_REPORTES);
  });

  it("COORDINADOR (sin balances) sí recibe «Horas por piloto»", async () => {
    api.me = async () => ({ rol: "COORDINADOR" });
    await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(botonesExcel.map((b) => b.path)).toEqual(EXPORTS);
    expect(pickerProps).toHaveLength(0);
  });

  it("`/me` caído (502): se ofrece TODO (el API es el candado) y se avisa", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.me = falla(502);
    const texto = await pintarPagina({ desde: "2026-10-01", hasta: "2026-10-12" });
    expect(botonesExcel.map((b) => b.path)).toEqual([CONTRATO.ruta, CONTRATO.ruta, ...EXPORTS]);
    expect(texto).toContain("No se pudo cargar tu usuario");
    expect(texto).not.toContain(TEXTO_BALANCES_SIN_PERMISO.titulo);
  });

  it("cableado del fuente: la decisión y el rol viajan por el helper", () => {
    const src = readFileSync(RUTA_PAGINA, "utf8");
    expect(src).toContain("puedeAbrirBalances(rol)");
    expect(src).toContain("puedeExportarHorasPiloto(rol)");
    expect(src).toContain("rol={rol ?? undefined}");
    expect(src).toContain("{TEXTO_BALANCES_SIN_PERMISO.titulo}");
    expect(src).toContain("{abreBalances ? SUBTITULO_REPORTES : SUBTITULO_REPORTES_SIN_BALANCES}");
  });
});
