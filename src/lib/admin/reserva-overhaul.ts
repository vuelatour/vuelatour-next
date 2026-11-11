/**
 * RESERVA DE OVERHAUL CON VIGENCIA — «a partir de» (10-nov-2026, API 0.0.135,
 * invariante 130 del API).
 *
 * Pedido del cliente con la captura del campo «Reserva overhaul USD/hr (por
 * motor)» del formulario del avión: «que pudiéramos ponerle desde cuándo
 * entra en vigor esa reserva de overhaul, porque nomás aparece el monto… que
 * dijera ahí "a partir de" y la fecha a partir de cuándo quiere que afecte».
 * La tarifa era UNA sola y cambiarla movía los meses ya entregados a los
 * socios.
 *
 * El API guarda cada tarifa con su fecha y calcula la reserva de cada vuelo
 * con la tarifa que valía ESE día. El panel solo CAPTURA (tarifa + «A partir
 * de», en el mismo formulario del avión) y ENSEÑA las tarifas guardadas (card
 * de la ficha, con «Eliminar» confirmado). Aquí no se calcula ninguna
 * reserva.
 *
 * Contrato ADITIVO del snapshot (`GET /v1/aircraft/:id/snapshot`):
 * `reserva_overhaul_vigencias: { disponible, vigencias[] }`. Ausente (API
 * previo) o `disponible:false` (falta la migración) ⇒ `null` ⇒ el formulario
 * y la ficha quedan EXACTAMENTE como antes (sin fecha).
 *
 * PURO (sin React ni red): `__tests__/reserva-overhaul.test.ts`.
 */
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto, fmtUsd } from "@/lib/format";
import type { ReservaOverhaulVigencia } from "@/types/aircraft";

// =============================================================================
// Lectura tolerante
// =============================================================================

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Las tarifas con vigencia del avión, la más reciente primero, o `null` si
 * esta ficha NO las maneja (API previo, migración sin aplicar o dato
 * ilegible). ÚNICA puerta: con `null` el formulario no pide fecha y la ficha
 * no pinta la card. Una fila sin id, sin día válido o sin tarifa se descarta.
 */
export function vigenciasDeReserva(raw: unknown): ReservaOverhaulVigencia[] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { disponible?: unknown; vigencias?: unknown };
  if (r.disponible !== true || !Array.isArray(r.vigencias)) return null;
  const out: ReservaOverhaulVigencia[] = [];
  for (const x of r.vigencias) {
    if (!x || typeof x !== "object") continue;
    const v = x as Record<string, unknown>;
    const desde = typeof v.vigente_desde === "string" ? v.vigente_desde.slice(0, 10) : "";
    const porMotor = numero(v.usd_hr_por_motor);
    if (typeof v.id !== "string" || !v.id || !ES_DIA.test(desde) || porMotor == null) continue;
    const motores = Math.max(1, Math.round(numero(v.motores) ?? 1));
    out.push({
      id: v.id,
      vigente_desde: desde,
      usd_hr_por_motor: porMotor,
      motores,
      usd_por_hora: numero(v.usd_por_hora) ?? Math.round(porMotor * motores * 100) / 100,
      notas: typeof v.notas === "string" && v.notas.trim() ? v.notas.trim() : null,
      updated_at: typeof v.updated_at === "string" ? v.updated_at : null,
      vigente_hoy: v.vigente_hoy === true,
      futura: v.futura === true,
    });
  }
  return out.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde));
}

/** La tarifa que vale HOY (la marca el API); null si todavía no empieza ninguna. */
export function vigenciaDeHoy(
  vigencias: readonly ReservaOverhaulVigencia[] | null,
): ReservaOverhaulVigencia | null {
  return vigencias?.find((v) => v.vigente_hoy) ?? null;
}

// =============================================================================
// Roles
// =============================================================================

/**
 * Quién cambia o elimina tarifas: los mismos que editan la ficha del avión
 * (`@Roles(ADMIN)` del API; Dirección pasa todo guard). Sin rol (`/me` falló)
 * NO se ofrece eliminar: es una acción que mueve dinero.
 */
export function puedeEditarReservaOverhaul(rol: string | null | undefined): boolean {
  return rol === "ADMIN" || rol === "DIRECCION";
}

// =============================================================================
// Textos de una tarifa
// =============================================================================

export const ETIQUETA_RESERVA_DESDE = "A partir de";

/** Los importes de la reserva SIEMPRE dicen su moneda: «$55 USD». */
const usd = (n: number): string => fmtMonto(n, "USD");

/** «$55 USD por motor» · «sin reserva» (tarifa 0 = desde ese día no se aparta nada). */
function tarifaPorMotor(usdHr: number): string {
  return usdHr === 0 ? "sin reserva" : `${usd(usdHr)} por motor`;
}

/**
 * La tarifa en palabras: «$55 USD por motor × 2 motores = $110 USD por hora
 * de vuelo», «$400 USD por hora de vuelo» (un motor) o «Sin reserva» (0).
 */
export function textoTarifaVigencia(
  v: Pick<ReservaOverhaulVigencia, "usd_hr_por_motor" | "motores" | "usd_por_hora">,
): string {
  if (v.usd_hr_por_motor === 0) return "Sin reserva";
  if (v.motores <= 1) return `${usd(v.usd_hr_por_motor)} por hora de vuelo`;
  return `${usd(v.usd_hr_por_motor)} por motor × ${v.motores} motores = ${usd(v.usd_por_hora)} por hora de vuelo`;
}

/** «a partir del 01/11/2026». */
export function textoDesdeVigencia(v: Pick<ReservaOverhaulVigencia, "vigente_desde">): string {
  return `a partir del ${fmtDateOnly(v.vigente_desde)}`;
}

export type EstadoVigencia = "VIGENTE" | "FUTURA" | "ANTERIOR";

/** Vigente hoy · todavía no empieza · ya la sustituyó otra. */
export function estadoVigencia(
  v: Pick<ReservaOverhaulVigencia, "vigente_hoy" | "futura">,
): EstadoVigencia {
  if (v.vigente_hoy) return "VIGENTE";
  return v.futura ? "FUTURA" : "ANTERIOR";
}

export const ETIQUETAS_ESTADO_VIGENCIA: Record<EstadoVigencia, string> = {
  VIGENTE: "Vigente hoy",
  FUTURA: "Aún no empieza",
  ANTERIOR: "Anterior",
};

/**
 * «Reserva overhaul» de la ficha: «$55 / hr · a partir del 01/11/2026». Sin
 * tarifas con vigencia (o sin ninguna vigente hoy), el texto de siempre.
 */
export function textoReservaFicha(
  reservaHrUsd: string | number | null | undefined,
  vigencias: readonly ReservaOverhaulVigencia[] | null,
): string {
  const base = `${fmtUsd(reservaHrUsd)} / hr`;
  const hoy = vigenciaDeHoy(vigencias);
  return hoy ? `${base} · ${textoDesdeVigencia(hoy)}` : base;
}

// =============================================================================
// Card «Tarifas de la reserva de overhaul» (ficha del avión)
// =============================================================================

export const TITULO_TARIFAS_RESERVA = "Tarifas de la reserva de overhaul";

export const DESCRIPCION_TARIFAS_RESERVA =
  "Cada tarifa vale para los vuelos a partir de su fecha: la reserva de un vuelo se calcula con la tarifa que valía el día en que voló.";

/** Cómo se agrega o corrige (solo a quien puede editar el avión). */
export const AYUDA_EDITAR_TARIFAS_RESERVA =
  "Para agregar o corregir una tarifa: botón «Editar» del avión → «Reserva overhaul» y «A partir de».";

/** Con una sola tarifa no hay «Eliminar» (el API la rechaza). */
export const AYUDA_UNICA_TARIFA_RESERVA =
  "Es la única tarifa: no se elimina. Para dejar al avión sin reserva, guarda la tarifa en 0 con la fecha desde la que ya no aplica.";

export const TEXTO_SIN_TARIFAS_RESERVA =
  "Este avión no tiene tarifa de reserva de overhaul: no se le aparta nada.";

export const BOTON_ELIMINAR_TARIFA = "Eliminar";

/** ¿Se ofrece «Eliminar» en las filas? Solo con dos o más tarifas. */
export function puedeEliminarVigencia(vigencias: readonly ReservaOverhaulVigencia[]): boolean {
  return vigencias.length >= 2;
}

/** La tarifa que quedaría valiendo justo antes de `dia` (sin contar `sinId`). */
function tarifaAnteriorA(
  vigencias: readonly ReservaOverhaulVigencia[],
  dia: string,
  sinId?: string,
): ReservaOverhaulVigencia | null {
  let mejor: ReservaOverhaulVigencia | null = null;
  for (const v of vigencias) {
    if (v.id === sinId || v.vigente_desde >= dia) continue;
    if (!mejor || v.vigente_desde > mejor.vigente_desde) mejor = v;
  }
  return mejor;
}

/** La primera tarifa que empieza DESPUÉS de `dia` (sin contar `sinId`). */
function tarifaPosteriorA(
  vigencias: readonly ReservaOverhaulVigencia[],
  dia: string,
  sinId?: string,
): ReservaOverhaulVigencia | null {
  let mejor: ReservaOverhaulVigencia | null = null;
  for (const v of vigencias) {
    if (v.id === sinId || v.vigente_desde <= dia) continue;
    if (!mejor || v.vigente_desde < mejor.vigente_desde) mejor = v;
  }
  return mejor;
}

/**
 * Confirmación de «Eliminar» (regla permanente: toda acción destructiva
 * confirma). Dice QUÉ pasa con los vuelos de ese periodo: pasan a la tarifa
 * anterior o se quedan sin reserva, y hasta cuándo.
 */
export function confirmacionEliminarVigencia(
  v: ReservaOverhaulVigencia,
  vigencias: readonly ReservaOverhaulVigencia[],
  matricula: string,
): { titulo: string; descripcion: string; boton: string } {
  const anterior = tarifaAnteriorA(vigencias, v.vigente_desde, v.id);
  const posterior = tarifaPosteriorA(vigencias, v.vigente_desde, v.id);
  const periodo = posterior
    ? `Los vuelos del ${fmtDateOnly(v.vigente_desde)} hasta antes del ${fmtDateOnly(posterior.vigente_desde)}`
    : `Los vuelos desde el ${fmtDateOnly(v.vigente_desde)}`;
  const destino = anterior
    ? `pasan a la tarifa anterior: ${tarifaPorMotor(anterior.usd_hr_por_motor)} (${textoDesdeVigencia(anterior)})`
    : "quedan sin reserva de overhaul";
  return {
    titulo: "¿Eliminar esta tarifa?",
    descripcion: `Se elimina la tarifa de ${matricula || "este avión"} «${textoTarifaVigencia(v)}» que vale ${textoDesdeVigencia(v)}. ${periodo} ${destino}. Cambia el balance, el reparto y la cuenta de los socios en los meses que no estén cerrados.`,
    boton: "Eliminar tarifa",
  };
}

export const TOAST_TARIFA_ELIMINADA = "Tarifa eliminada";
export const TEXTO_FALLO_ELIMINAR_TARIFA =
  "No se pudo eliminar la tarifa. Revisa tu conexión y vuelve a intentar.";

// =============================================================================
// Formulario del avión: tarifa + «A partir de»
// =============================================================================

/** Ayuda fija bajo los dos campos. */
export const AYUDA_RESERVA_DESDE =
  "La tarifa vale para los vuelos a partir de esa fecha; los anteriores conservan la que tenían. Con la misma fecha se corrige la tarifa; con otra fecha se agrega una nueva.";

export const ERROR_RESERVA_SIN_FECHA =
  "Elige desde qué fecha vale esta tarifa («A partir de»).";
export const ERROR_RESERVA_SIN_TARIFA =
  "Captura la tarifa (0 = sin reserva a partir de esa fecha).";
export const ERROR_RESERVA_FECHA_INVALIDA = "Captura una fecha válida.";

/** Texto del campo ⇒ número a centavos, o null si está vacío o no es número. */
function tarifaDeTexto(v: unknown): number | null {
  const n = numero(v);
  return n == null || n < 0 ? null : Math.round(n * 100) / 100;
}

export interface ReservaParaGuardar {
  /** `reserva_overhaul_desde` que viaja al API (undefined = no se manda). */
  desde?: string;
  /** Lo que falta para poder guardar. */
  error?: { campo: "reserva_overhaul_hr_usd" | "reserva_overhaul_desde"; mensaje: string };
}

/**
 * Qué viaja al guardar el formulario (PURO). Si no se tocó ni la tarifa ni
 * la fecha, no se manda fecha (el guardado es el de siempre y el API no
 * escribe nada). Si se tocó cualquiera de las dos, la fecha es OBLIGATORIA:
 * sin ella el API corregiría la tarifa de hoy hacia atrás sin que nadie lo
 * haya decidido — justo lo que el cliente pidió poder controlar.
 */
export function reservaParaGuardar(p: {
  /** false = la ficha no maneja vigencias (API previo): nada nuevo. */
  conVigencias: boolean;
  tarifa: unknown;
  desde: unknown;
  tarifaInicial: unknown;
  desdeInicial: unknown;
}): ReservaParaGuardar {
  if (!p.conVigencias) return {};
  const desde = typeof p.desde === "string" ? p.desde.trim() : "";
  const desdeInicial = typeof p.desdeInicial === "string" ? p.desdeInicial.trim() : "";
  const tarifa = tarifaDeTexto(p.tarifa);
  const tarifaInicial = tarifaDeTexto(p.tarifaInicial);
  if (tarifa === tarifaInicial && desde === desdeInicial) return {};
  if (tarifa == null) {
    return { error: { campo: "reserva_overhaul_hr_usd", mensaje: ERROR_RESERVA_SIN_TARIFA } };
  }
  if (!desde) {
    return { error: { campo: "reserva_overhaul_desde", mensaje: ERROR_RESERVA_SIN_FECHA } };
  }
  if (!ES_DIA.test(desde)) {
    return { error: { campo: "reserva_overhaul_desde", mensaje: ERROR_RESERVA_FECHA_INVALIDA } };
  }
  return { desde };
}

export interface VistaPreviaReserva {
  /** `aviso` = cambia lo ya volado o no cambia nada (hay que leerlo). */
  tono: "info" | "aviso";
  texto: string;
}

/**
 * Lo que va a pasar al guardar, en palabras de operador (PURO; null = nada
 * que decir: sin cambios o falta un dato). Tres casos:
 *  - misma fecha que una tarifa guardada ⇒ se CORRIGE esa tarifa (cambia
 *    todos los vuelos desde esa fecha);
 *  - fecha nueva ⇒ tarifa NUEVA desde ese día; se dice qué pasa con los
 *    vuelos anteriores y si después sigue valiendo otra ya guardada;
 *  - fecha nueva con la MISMA tarifa que ya valía ⇒ se avisa que nada cambia
 *    (para que la reserva EMPIECE ese día hay que eliminar la anterior).
 */
export function vistaPreviaReserva(p: {
  vigencias: readonly ReservaOverhaulVigencia[] | null;
  tarifa: unknown;
  desde: unknown;
  tarifaInicial: unknown;
  desdeInicial: unknown;
}): VistaPreviaReserva | null {
  if (!p.vigencias) return null;
  const guardar = reservaParaGuardar({ conVigencias: true, ...p });
  if (!guardar.desde) return null;
  const desde = guardar.desde;
  const tarifa = tarifaDeTexto(p.tarifa) ?? 0;
  const dia = fmtDateOnly(desde);
  const misma = p.vigencias.find((v) => v.vigente_desde === desde);
  if (misma) {
    if (misma.usd_hr_por_motor === tarifa) return null;
    return {
      tono: "aviso",
      texto: `Se corrige la tarifa que vale a partir del ${dia}: de ${tarifaPorMotor(misma.usd_hr_por_motor)} a ${tarifaPorMotor(tarifa)}. Cambia la reserva de todos los vuelos desde esa fecha, en los meses que no estén cerrados.`,
    };
  }
  const anterior = tarifaAnteriorA(p.vigencias, desde);
  const posterior = tarifaPosteriorA(p.vigencias, desde);
  const despues = posterior
    ? ` Desde el ${fmtDateOnly(posterior.vigente_desde)} sigue valiendo la tarifa ya guardada (${tarifaPorMotor(posterior.usd_hr_por_motor)}).`
    : "";
  if (anterior && anterior.usd_hr_por_motor === tarifa) {
    return {
      tono: "aviso",
      texto: `Esa tarifa (${tarifaPorMotor(tarifa)}) ya vale ${textoDesdeVigencia(anterior)}: guardarla con otra fecha no cambia nada. Si la reserva debe EMPEZAR el ${dia}, guarda y después elimina la tarifa anterior en «${TITULO_TARIFAS_RESERVA}» de la ficha.${despues}`,
    };
  }
  const antes = anterior
    ? `Los vuelos anteriores conservan su tarifa (${tarifaPorMotor(anterior.usd_hr_por_motor)}, ${textoDesdeVigencia(anterior)}).`
    : "Los vuelos anteriores a esa fecha quedan sin reserva.";
  return {
    tono: "info",
    texto: `Tarifa nueva a partir del ${dia}: ${tarifaPorMotor(tarifa)}. ${antes}${despues}`,
  };
}
