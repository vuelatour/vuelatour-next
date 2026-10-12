/**
 * `/admin/reportes` — los balances al frente (12-oct-2026). FUENTE ÚNICA PURA
 * (sin React ni red) de los textos y reglas NUEVOS de la pantalla: rótulos de
 * las tres secciones, los tiles de la flota y de cada avión, los atajos de
 * periodo («Este mes» / «Mes pasado») y lo que se dice cuando un catálogo no
 * cargó.
 *
 * Pedido textual del cliente: «esta pantalla de la ruta /admin/reportes
 * mejoremos la UI para que sea más limpio e intuitivo acceder a las opciones
 * de balance por avión y general que son las 2 cosas que más se consultan
 * aquí». Criterio: lo que más se consulta va arriba y a UN clic; «Ver en
 * pantalla» primero (prioridad a la vista, pedido del 12-oct).
 *
 * Aquí no hay dinero, horas ni conteos: solo textos, orden y enlaces. Los
 * libros (nombre, detalle, archivo, ruta) siguen en `reportes-balance.ts`;
 * los enlaces de la vista en `balance-vista.ts`.
 */
import { textoDegradado } from "@/lib/api/degradar";
import type { Aircraft } from "@/types/aircraft";
import { hrefReportesDesdeVista, periodoDefaultVista, textoPeriodoVista } from "./balance-vista";
import { etiquetaMes, mesActual, mesAnterior, rangoMesPasado } from "./reparto-pagos";

// =============================================================================
// Cabecera y rótulos de sección
// =============================================================================

/** Subtítulo bajo «Reportes» (para quien abre los balances). */
export const SUBTITULO_REPORTES =
  "Elige el periodo y abre o descarga el balance que necesites. Más abajo: el cierre del mes y otros reportes.";

/**
 * Subtítulo para un rol que NO abre los balances (la sección de abajo le
 * pinta la card con candado): la cabecera no lo invita a algo que no puede.
 */
export const SUBTITULO_REPORTES_SIN_BALANCES =
  "Elige el periodo. Aquí están el pre-cierre, el cierre del mes y otros reportes.";

/** Rótulos (`<h2>` tipo kicker) de las tres secciones, de arriba abajo. */
export const KICKER_BALANCES = "Balances";
export const KICKER_CIERRE = "Cierre del mes";
export const KICKER_OTROS = "Otros reportes";

// =============================================================================
// Card «Balance por avión»
// =============================================================================

export const TITULO_BALANCE_POR_AVION = "Balance por avión";

/** Una línea bajo el título de la card (la larga va en el plegable). */
export const DESCRIPCION_BALANCE_POR_AVION =
  "El libro completo de cada avión en el periodo elegido arriba: ábrelo en pantalla o descárgalo en Excel.";

/**
 * La descripción larga de siempre de la card del avión, en minúscula inicial
 * para ir tras «Balance por avión:» dentro de «¿Qué trae cada libro?».
 */
export const DETALLE_BALANCE_POR_AVION =
  "libro completo de un avión en el periodo — reporte de horas (ventas, tacómetros, costos por vuelo), cobranza, combustible, gastos indirectos (incluye la parte repartida a mano), refacciones de bodega, permisos y balance con socios. Incluye la hoja de pendientes de captura para completar el mes.";

/** `aria-label` de la grilla de aviones. */
export const ARIA_LISTA_AVIONES = "Aviones";

/** Texto visible del botón de descarga de cada tile (el nombre largo va en `title`). */
export const ETIQUETA_EXCEL_AVION = "Excel";

/** Badge del avión dado de baja: se lista igual (su libro histórico sirve). */
export const MARCA_AVION_INACTIVO = "Inactiva";
export const TITULO_AVION_INACTIVO = "Avión dado de baja: su balance histórico se abre igual";

/** Carga OK y lista vacía (nunca cuando la carga falló). */
export const TEXTO_SIN_AVIONES =
  "No hay aviones dados de alta: regístralos en Flota → Aeronaves para ver su balance aquí.";

/** `title` + `aria-label` del botón Excel de un avión. */
export function tituloExcelAvion(matricula: string): string {
  return `Descargar el balance de ${matricula} en Excel`;
}

/** Nombre accesible de cada «Ver en pantalla» (flota y avión): el texto visible es el mismo para todos. */
export function ariaVerEnPantalla(que: string): string {
  return `Ver en pantalla · ${que}`;
}

// =============================================================================
// Card «Cierre y reparto del periodo»
// =============================================================================

/** La descripción de siempre, precedida de la remisión al pre-cierre (que ahora vive justo arriba). */
export const DESCRIPCION_CIERRE_REPARTO =
  "Revisa primero el pre-cierre de arriba. Luego elige el mes y descarga: PDF de reparto para socios, reporte mensual por avión en Excel, libro «Dinero» y el paquete de cierre (.zip con el Excel + XML/PDF de las facturas timbradas del periodo). Los estados de cuenta del banco se anexan a mano (no se almacenan en el sistema).";

// =============================================================================
// Catálogos que no cargaron (regla «degradar POR TARJETA», sin mentir)
// =============================================================================

/** Etiquetas para `Degradaciones.opcional(...)`: se leen dentro de «No se pudieron cargar …». */
export const ETIQUETA_DEGRADADO_AVIONES = "los aviones";
export const ETIQUETA_DEGRADADO_VUELOS = "los vuelos recientes";
export const ETIQUETA_DEGRADADO_USUARIO = "tu usuario";

/**
 * La frase del aviso para UNA etiqueta, garantizada como texto: `textoDegradado`
 * devuelve `null` solo con la lista vacía y aquí siempre va una etiqueta. El
 * `string | null` del contrato se resuelve en este único lugar (sin
 * `as string`), así que a la UI nunca llega un `null`.
 */
function textoNoCargo(etiqueta: string): string {
  const texto = textoDegradado([etiqueta]);
  if (texto === null) throw new Error(`textoNoCargo: etiqueta vacía «${etiqueta}»`);
  return texto;
}

/** Dentro de la card del avión cuando el catálogo NO cargó: la MISMA frase del aviso de arriba. */
export const TEXTO_AVIONES_NO_CARGARON = textoNoCargo(ETIQUETA_DEGRADADO_AVIONES);

/** Párrafo guía del selector de vuelo cuando los vuelos NO cargaron (en vez de «Elige un vuelo…»). */
export const TEXTO_VUELOS_NO_CARGARON = textoNoCargo(ETIQUETA_DEGRADADO_VUELOS);

/** `emptyText` del selector de vuelo con fallo (en vez de «Sin vuelos en el rango reciente»). */
export const EMPTY_VUELOS_NO_CARGARON = "Los vuelos no cargaron: recarga la página";

// =============================================================================
// Card «Exports de operación»: «Horas por piloto» solo a quien el API se lo da
// =============================================================================

/**
 * ESPEJO del `@Roles(Rol.ADMIN, Rol.COORDINADOR)` de
 * `GET /v1/dashboards/horas-piloto/export` (`dashboards.controller.ts`; la
 * paridad la congela `reportes-ui.test.ts`). ANALISTA y FACTURACION entran a
 * Reportes por el menú y ese botón siempre les respondía 403.
 */
export const ROLES_EXPORTAN_HORAS_PILOTO = ["ADMIN", "COORDINADOR"] as const;

/** ¿Se le OFRECE «Horas por piloto» a este rol? Sin rol (`/me` falló) sí: el API es el candado. */
export function puedeExportarHorasPiloto(rol?: string | null): boolean {
  if (!rol) return true;
  return (ROLES_EXPORTAN_HORAS_PILOTO as readonly string[]).includes(rol);
}

// =============================================================================
// Tiles por avión
// =============================================================================

/** Lo que cada tile necesita (serializable: viaja del Server Component al picker). */
export interface AvionBalanceItem {
  id: string;
  matricula: string;
  modelo: string;
  activa: boolean;
  /** `color_calendario` de la BD (hex) o null: el punto de color solo se pinta con hex. */
  color: string | null;
}

/** De la fila de `GET /v1/aircraft` a los 5 campos del tile. Color vacío o null ⇒ null. */
export function avionBalanceDeAeronave(
  a: Pick<Aircraft, "id" | "matricula" | "modelo" | "activa" | "color_calendario">,
): AvionBalanceItem {
  const color = a.color_calendario?.trim();
  return {
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    activa: a.activa,
    color: color ? color : null,
  };
}

/**
 * Orden de la grilla: activos primero (matrícula A–Z), inactivos al final (A–Z
 * entre sí). Devuelve una COPIA y nunca filtra: el libro histórico de un avión
 * dado de baja sirve.
 */
export function ordenarAvionesBalance(items: readonly AvionBalanceItem[]): AvionBalanceItem[] {
  return [...items].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    return a.matricula.localeCompare(b.matricula, "es-MX");
  });
}

// =============================================================================
// Atajos de periodo («Este mes» / «Mes pasado»): enlaces puros
// =============================================================================

/** `aria-label` del grupo de atajos. */
export const ARIA_ATAJOS_PERIODO = "Atajos de periodo";
export const ETIQUETA_ATAJO_ESTE_MES = "Este mes";
export const ETIQUETA_ATAJO_MES_PASADO = "Mes pasado";

export interface AtajoPeriodo {
  clave: "este-mes" | "mes-pasado";
  /** «Este mes · Octubre 2026» / «Mes pasado · Septiembre 2026». */
  etiqueta: string;
  /** `/admin/reportes?desde&hasta` (navegación de servidor, sin estado). */
  href: string;
  /** Coincidencia EXACTA de desde y hasta con el periodo de la página. */
  activo: boolean;
  /** «Del 01 oct 2026 al 12 oct 2026» (tooltip). */
  title: string;
}

/**
 * Los dos atajos para `hoy` (Cancún, `YYYY-MM-DD`): «Este mes» = del 1 a HOY
 * (el mismo corte del periodo por defecto) y «Mes pasado» = el mes calendario
 * anterior completo. `hoy` inválido ⇒ ninguno.
 */
export function atajosPeriodoReportes(hoy: string, desde: string, hasta: string): AtajoPeriodo[] {
  const mesHoy = mesActual(hoy);
  const mesPasado = mesAnterior(hoy);
  const rangoPasado = rangoMesPasado(hoy);
  if (!mesHoy || !mesPasado || !rangoPasado) return [];
  const esteMes = periodoDefaultVista(hoy);
  const atajo = (
    clave: AtajoPeriodo["clave"],
    etiqueta: string,
    mes: string,
    r: { desde: string; hasta: string },
  ): AtajoPeriodo => ({
    clave,
    etiqueta: `${etiqueta} · ${etiquetaMes(mes)}`,
    href: hrefReportesDesdeVista(r.desde, r.hasta),
    activo: desde === r.desde && hasta === r.hasta,
    title: textoPeriodoVista(r.desde, r.hasta),
  });
  return [
    atajo("este-mes", ETIQUETA_ATAJO_ESTE_MES, mesHoy, esteMes),
    atajo("mes-pasado", ETIQUETA_ATAJO_MES_PASADO, mesPasado, rangoPasado),
  ];
}
