/**
 * `/admin/reportes` — los balances al frente (12-oct-2026). Pedido del
 * cliente: «mejoremos la UI para que sea más limpio e intuitivo acceder a las
 * opciones de balance por avión y general que son las 2 cosas que más se
 * consultan aquí».
 *
 * Se custodia: el tile de cada avión (5 campos serializables, color vacío ⇒
 * null), el ORDEN de la grilla (activos A–Z, inactivos al final, nunca se
 * filtra), los atajos «Este mes» / «Mes pasado» como enlaces puros (href,
 * etiqueta, activo, tooltip con el formato REAL de `fmtDateOnly`) y los
 * textos: lo que se dice cuando un catálogo no cargó sale de `textoDegradado`
 * (una sola voz con el aviso de arriba) y ninguna cadena miente «Sin
 * aeronaves» cuando la carga falló.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import { textoDegradado } from "@/lib/api/degradar";
import type { Aircraft } from "@/types/aircraft";
import { hrefReportesDesdeVista, textoPeriodoVista } from "../balance-vista";
import * as ui from "../reportes-ui";
import {
  ARIA_ATAJOS_PERIODO,
  ARIA_LISTA_AVIONES,
  DESCRIPCION_CIERRE_REPARTO,
  DETALLE_BALANCE_POR_AVION,
  EMPTY_VUELOS_NO_CARGARON,
  ETIQUETA_DEGRADADO_AVIONES,
  ETIQUETA_DEGRADADO_USUARIO,
  ETIQUETA_DEGRADADO_VUELOS,
  ETIQUETA_EXCEL_AVION,
  KICKER_BALANCES,
  KICKER_CIERRE,
  KICKER_OTROS,
  MARCA_AVION_INACTIVO,
  ROLES_EXPORTAN_HORAS_PILOTO,
  SUBTITULO_REPORTES,
  SUBTITULO_REPORTES_SIN_BALANCES,
  TEXTO_AVIONES_NO_CARGARON,
  TEXTO_SIN_AVIONES,
  TEXTO_VUELOS_NO_CARGARON,
  TITULO_AVION_INACTIVO,
  TITULO_BALANCE_POR_AVION,
  ariaVerEnPantalla,
  atajosPeriodoReportes,
  avionBalanceDeAeronave,
  ordenarAvionesBalance,
  puedeExportarHorasPiloto,
  tituloExcelAvion,
  type AvionBalanceItem,
} from "../reportes-ui";

/** Una fila COMPLETA de `GET /v1/aircraft` (como la de prod). */
function aeronave(p: Partial<Aircraft> & Pick<Aircraft, "id" | "matricula">): Aircraft {
  return {
    modelo: "Cessna 205",
    pais_registro: "MEXICO",
    num_motores: 1,
    ultimo_taco: 1234.5,
    velocidad_crucero_kts: "120",
    asientos: 5,
    motor_hp: 285,
    caracteristicas: ["Aire acondicionado"],
    tarifa_hora_pub_usd: "650",
    tarifa_hora_broker_usd: "600",
    reserva_overhaul_hr_usd: "25",
    permiso_afac_usd_hr: null,
    color_calendario: "#3B82F6",
    ubicacion_base: "CUN",
    combustible: "AVGAS",
    activa: true,
    notas: null,
    servicio_intervalos: [50, 100],
    servicio_horas_base: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...p,
  } as Aircraft;
}

const UUID = (n: number) => `3f9a1c2e-0000-4000-8000-00000000000${n}`;

/** La flota real (7 aviones; XB-IJP dado de baja), DESORDENADA a propósito. */
const FLOTA: AvionBalanceItem[] = [
  { id: UUID(1), matricula: "XB-PEV", modelo: "Cessna 205", activa: true, color: "#3B82F6" },
  { id: UUID(2), matricula: "XA-VGV", modelo: "Cessna 206", activa: true, color: "#22C55E" },
  { id: UUID(7), matricula: "XB-IJP", modelo: "Cessna 210", activa: false, color: null },
  { id: UUID(3), matricula: "N4142R", modelo: "Piper Seneca V", activa: true, color: "#F59E0B" },
  { id: UUID(4), matricula: "N58BT", modelo: "King Air", activa: true, color: "#8B5CF6" },
  { id: UUID(5), matricula: "N621TX", modelo: "Cessna Caravan", activa: true, color: "#EF4444" },
  { id: UUID(6), matricula: "XB-ANU", modelo: "Cessna 182", activa: true, color: "#8B5E3C" },
];

describe("avionBalanceDeAeronave: el tile solo lleva lo serializable", () => {
  it("de la fila completa del API quedan EXACTAMENTE 5 llaves", () => {
    const item = avionBalanceDeAeronave(aeronave({ id: UUID(1), matricula: "XB-PEV" }));
    expect(item).toEqual({
      id: UUID(1),
      matricula: "XB-PEV",
      modelo: "Cessna 205",
      activa: true,
      color: "#3B82F6",
    });
    expect(Object.keys(item).sort()).toEqual(["activa", "color", "id", "matricula", "modelo"]);
  });

  it("color vacío o null ⇒ null (el punto de color solo se pinta con hex)", () => {
    expect(avionBalanceDeAeronave(aeronave({ id: UUID(1), matricula: "X", color_calendario: "" })).color).toBeNull();
    expect(avionBalanceDeAeronave(aeronave({ id: UUID(1), matricula: "X", color_calendario: "  " })).color).toBeNull();
    expect(avionBalanceDeAeronave(aeronave({ id: UUID(1), matricula: "X", color_calendario: null })).color).toBeNull();
    expect(avionBalanceDeAeronave(aeronave({ id: UUID(7), matricula: "XB-IJP", activa: false })).activa).toBe(false);
  });
});

describe("ordenarAvionesBalance: activos A–Z, inactivos al final", () => {
  it("la flota real desordenada ⇒ el orden de la grilla", () => {
    expect(ordenarAvionesBalance(FLOTA).map((a) => a.matricula)).toEqual([
      "N4142R",
      "N58BT",
      "N621TX",
      "XA-VGV",
      "XB-ANU",
      "XB-PEV",
      "XB-IJP",
    ]);
  });

  it("devuelve una COPIA (no muta la entrada) y nunca descarta un avión", () => {
    const entrada = [...FLOTA];
    const salida = ordenarAvionesBalance(entrada);
    expect(salida).not.toBe(entrada);
    expect(entrada.map((a) => a.matricula)).toEqual(FLOTA.map((a) => a.matricula));
    expect(salida).toHaveLength(FLOTA.length);
    expect(new Set(salida.map((a) => a.id))).toEqual(new Set(FLOTA.map((a) => a.id)));
  });

  it("dos inactivos conservan A–Z entre sí", () => {
    const conDos: AvionBalanceItem[] = [
      ...FLOTA,
      { id: UUID(8), matricula: "N100AA", modelo: "Cessna 172", activa: false, color: null },
    ];
    const m = ordenarAvionesBalance(conDos).map((a) => a.matricula);
    expect(m.slice(-2)).toEqual(["N100AA", "XB-IJP"]);
    expect(m).toHaveLength(8);
  });

  it("una lista vacía sigue vacía", () => {
    expect(ordenarAvionesBalance([])).toEqual([]);
  });
});

describe("atajosPeriodoReportes: «Este mes» y «Mes pasado» como enlaces puros", () => {
  it("con el periodo por defecto (del 1 a hoy) «Este mes» es el activo", () => {
    const atajos = atajosPeriodoReportes("2026-10-12", "2026-10-01", "2026-10-12");
    expect(atajos.map((a) => a.clave)).toEqual(["este-mes", "mes-pasado"]);
    expect(atajos.map((a) => a.activo)).toEqual([true, false]);
    expect(atajos.map((a) => a.etiqueta)).toEqual(["Este mes · Octubre 2026", "Mes pasado · Septiembre 2026"]);
    expect(atajos.map((a) => a.href)).toEqual([
      "/admin/reportes?desde=2026-10-01&hasta=2026-10-12",
      "/admin/reportes?desde=2026-09-01&hasta=2026-09-30",
    ]);
    expect(atajos[0].href).toBe(hrefReportesDesdeVista("2026-10-01", "2026-10-12"));
    // El tooltip con el formato REAL de `fmtDateOnly` («01 oct 2026»), nunca tecleado a mano.
    expect(atajos.map((a) => a.title)).toEqual([
      textoPeriodoVista("2026-10-01", "2026-10-12"),
      textoPeriodoVista("2026-09-01", "2026-09-30"),
    ]);
    expect(atajos[1].title).toBe(`Del ${fmtDateOnly("2026-09-01")} al ${fmtDateOnly("2026-09-30")}`);
  });

  it("con septiembre completo solo «Mes pasado» está activo; con un rango libre ninguno", () => {
    const sep = atajosPeriodoReportes("2026-10-12", "2026-09-01", "2026-09-30");
    expect(sep.map((a) => a.activo)).toEqual([false, true]);
    const libre = atajosPeriodoReportes("2026-10-12", "2026-09-15", "2026-10-05");
    expect(libre.map((a) => a.activo)).toEqual([false, false]);
    // Coincidencia EXACTA: este mes cortado en otro día no es «Este mes».
    const corto = atajosPeriodoReportes("2026-10-12", "2026-10-01", "2026-10-11");
    expect(corto.map((a) => a.activo)).toEqual([false, false]);
  });

  it("cruce de año: en enero el mes pasado es diciembre del año anterior", () => {
    const [esteMes, pasado] = atajosPeriodoReportes("2027-01-05", "2027-01-01", "2027-01-05");
    expect(esteMes.etiqueta).toBe("Este mes · Enero 2027");
    expect(esteMes.activo).toBe(true);
    expect(pasado.etiqueta).toBe("Mes pasado · Diciembre 2026");
    expect(pasado.href).toBe("/admin/reportes?desde=2026-12-01&hasta=2026-12-31");
  });

  it("«hoy» inválido ⇒ ningún atajo (nunca un enlace a un periodo basura)", () => {
    expect(atajosPeriodoReportes("nada", "2026-10-01", "2026-10-12")).toEqual([]);
    expect(atajosPeriodoReportes("2026-13-45", "2026-10-01", "2026-10-12")).toEqual([]);
    expect(atajosPeriodoReportes("", "2026-10-01", "2026-10-12")).toEqual([]);
  });
});

describe("textos", () => {
  it("lo que no cargó se dice con la MISMA voz del aviso de arriba (textoDegradado)", () => {
    expect(TEXTO_AVIONES_NO_CARGARON).toBe("No se pudieron cargar los aviones; recarga para reintentar.");
    expect(TEXTO_VUELOS_NO_CARGARON).toBe("No se pudieron cargar los vuelos recientes; recarga para reintentar.");
    expect(TEXTO_AVIONES_NO_CARGARON).toBe(textoDegradado([ETIQUETA_DEGRADADO_AVIONES]));
    expect(TEXTO_VUELOS_NO_CARGARON).toBe(textoDegradado([ETIQUETA_DEGRADADO_VUELOS]));
    expect(ETIQUETA_DEGRADADO_AVIONES).toBe("los aviones");
    expect(ETIQUETA_DEGRADADO_VUELOS).toBe("los vuelos recientes");
    expect(ETIQUETA_DEGRADADO_USUARIO).toBe("tu usuario");
    expect(textoDegradado([ETIQUETA_DEGRADADO_USUARIO])).toBe("No se pudo cargar tu usuario; recarga para reintentar.");
    expect(EMPTY_VUELOS_NO_CARGARON).toBe("Los vuelos no cargaron: recarga la página");
  });

  it("nombres accesibles de los controles de cada tile", () => {
    expect(tituloExcelAvion("XB-PEV")).toBe("Descargar el balance de XB-PEV en Excel");
    expect(ariaVerEnPantalla("Balance mensual")).toBe("Ver en pantalla · Balance mensual");
    expect(ariaVerEnPantalla("XB-PEV")).toBe("Ver en pantalla · XB-PEV");
    expect(ETIQUETA_EXCEL_AVION).toBe("Excel");
    expect(MARCA_AVION_INACTIVO).toBe("Inactiva");
    expect(TITULO_AVION_INACTIVO).toBe("Avión dado de baja: su balance histórico se abre igual");
    expect(ARIA_LISTA_AVIONES).toBe("Aviones");
    expect(ARIA_ATAJOS_PERIODO).toBe("Atajos de periodo");
  });

  it("rótulos, subtítulo y la card del avión", () => {
    expect([KICKER_BALANCES, KICKER_CIERRE, KICKER_OTROS]).toEqual(["Balances", "Cierre del mes", "Otros reportes"]);
    expect(SUBTITULO_REPORTES).toBe(
      "Elige el periodo y abre o descarga el balance que necesites. Más abajo: el cierre del mes y otros reportes.",
    );
    expect(TITULO_BALANCE_POR_AVION).toBe("Balance por avión");
    // «Flota» es el GRUPO del menú; la pantalla se llama «Aeronaves».
    expect(TEXTO_SIN_AVIONES).toBe(
      "No hay aviones dados de alta: regístralos en Flota → Aeronaves para ver su balance aquí.",
    );
    // La descripción larga de siempre, en minúscula inicial para ir tras «Balance por avión:»
    // y con raya (no un segundo «:») antes de la lista, como la línea del mensual.
    expect(DETALLE_BALANCE_POR_AVION.startsWith("libro completo de un avión en el periodo — reporte de horas")).toBe(true);
    expect(DETALLE_BALANCE_POR_AVION).not.toContain("periodo:");
    expect(DETALLE_BALANCE_POR_AVION).toContain("pendientes de captura para completar el mes");
    // Hoja «Otros ingresos» del libro del avión (13-oct-2026, API 0.0.75).
    expect(DETALLE_BALANCE_POR_AVION).toContain(
      "permisos, otros ingresos asignados al avión (reembolsos, ventas) y balance con socios",
    );
  });

  it("para un rol sin balances la cabecera no invita a abrirlos", () => {
    expect(SUBTITULO_REPORTES_SIN_BALANCES).toBe(
      "Elige el periodo. Aquí están el pre-cierre, el cierre del mes y otros reportes.",
    );
    expect(SUBTITULO_REPORTES_SIN_BALANCES.toLowerCase()).not.toContain("balance");
  });

  it("la card del cierre remite primero al pre-cierre y conserva la descripción de siempre", () => {
    expect(DESCRIPCION_CIERRE_REPARTO.startsWith("Revisa primero el pre-cierre de arriba.")).toBe(true);
    expect(DESCRIPCION_CIERRE_REPARTO).toContain(
      "elige el mes y descarga: PDF de reparto para socios, reporte mensual por avión en Excel, libro «Dinero» y el paquete de cierre (.zip con el Excel + XML/PDF de las facturas timbradas del periodo). Los estados de cuenta del banco se anexan a mano (no se almacenan en el sistema).",
    );
  });

  it("ninguna cadena exportada miente «Sin aeronaves», dice «no se puede» ni habla de FIFO", () => {
    // (incluye las constantes nuevas: subtítulo sin balances, «Flota → Aeronaves», etc.)
    const cadenas = Object.values(ui).filter((v): v is string => typeof v === "string");
    expect(cadenas.length).toBeGreaterThan(10);
    for (const s of cadenas) {
      expect(s).not.toContain("Sin aeronaves");
      expect(s.toLowerCase()).not.toContain("no se puede");
      expect(s).not.toContain("FIFO");
    }
  });
});

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("«Horas por piloto» solo se OFRECE a quien el API se lo da (ADMIN y COORDINADOR)", () => {
  it("ADMIN y COORDINADOR sí; ANALISTA y FACTURACION (que entran a Reportes) no; sin rol se ofrece", () => {
    expect(puedeExportarHorasPiloto("ADMIN")).toBe(true);
    expect(puedeExportarHorasPiloto("COORDINADOR")).toBe(true);
    for (const rol of ["ANALISTA", "FACTURACION", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeExportarHorasPiloto(rol), rol).toBe(false);
    }
    expect(puedeExportarHorasPiloto(null)).toBe(true);
    expect(puedeExportarHorasPiloto(undefined)).toBe(true);
    expect(puedeExportarHorasPiloto("")).toBe(true);
    expect(ROLES_EXPORTAN_HORAS_PILOTO).toEqual(["ADMIN", "COORDINADOR"]);
  });

  const controller = leerApi("modules/dashboards/dashboards.controller.ts");
  it.skipIf(!controller)("paridad con el API: `horas-piloto/export` lleva EXACTAMENTE esos roles", () => {
    const lineas = controller!.split("\n");
    const i = lineas.findIndex((l) => l.includes("@Get('horas-piloto/export')"));
    expect(i, "no se encontró @Get('horas-piloto/export') en el API").toBeGreaterThanOrEqual(0);
    const ventana = lineas.slice(i + 1, i + 5).join("\n");
    const roles = ventana.match(/@Roles\(([^)]*)\)/)?.[1];
    expect(roles, "sin @Roles tras horas-piloto/export").toBeTruthy();
    const parseados = [...roles!.matchAll(/Rol\.(\w+)/g)].map((m) => m[1]);
    expect(parseados).toEqual([...ROLES_EXPORTAN_HORAS_PILOTO]);
  });
});
