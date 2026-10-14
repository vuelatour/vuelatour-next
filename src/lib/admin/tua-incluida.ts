/**
 * «TUA INCLUIDA EN ESTE GASTO» (13-oct-2026, API 0.0.75 + migración
 * 20261013000008) — textos y reglas PURAS del campo de «Verificar / editar».
 *
 * Caso real (#383): la factura del aeropuerto trae la TUA DENTRO del total y
 * la IA la leyó con la etiqueta corrida («Autobuses» en vez de «Tarifa
 * TUA»): el balance cargó la TUA al avión como operación. Desde el 0.0.75 la
 * oficina puede FIJAR la TUA de un gasto (`gasto.tua_incluida`, con IVA, en
 * la moneda del gasto) y esa cifra MANDA sobre la lectura de la IA:
 *
 *   1) `tua_incluida` de oficina: null = usar la lectura de la IA; 0 = esta
 *      factura no cobra TUA; > 0 = esa TUA (topada al ticket sin propina).
 *   2) renglón de la IA reconocido como TUA.
 *   3) `valor_ia_extraido.tua_monto` (TUA leída aparte) SOLO si ningún
 *      renglón es TUA y la tabla cuadra.
 *
 * El panel NO calcula ninguna TUA: lo que la lectura separa lo dice el API
 * (`tua_detectada_ia` en el gasto, `tua_detectada` en una lectura fresca) y
 * `tua_monto` crudo solo se ENSEÑA como sugerencia. Aquí solo viven los
 * textos es-MX, la validación local (MISMOS textos que los 400 del API) y
 * qué viaja en el PATCH.
 *
 * Skew de deploy: con un API sin la columna, el gasto NO trae la llave
 * `tua_incluida` y el campo ni se pinta ni viaja (cero 400).
 * Prueba: `__tests__/tua-incluida.test.ts`.
 */

import { fmtMonto } from "@/lib/format";
import type { Gasto } from "@/types/expenses";

/**
 * Categorías donde la oficina puede fijar la TUA: las facturas de AEROPUERTO.
 * COPIA de `CATEGORIAS_TUA_INCLUIDA` de
 * `vuelatour-api/src/common/desglose-gasto.util.ts` (el test de paridad lee
 * el repo hermano). Fuera de la lista el API responde 400
 * `TUA_INCLUIDA_NO_APLICA` y, al reclasificar, limpia la cifra solo.
 */
export const CATEGORIAS_TUA_INCLUIDA: readonly string[] = Object.freeze([
  "OPERACIONES",
  "ATERRIZAJE",
  "FBO",
]);

export function categoriaAdmiteTuaIncluida(cat: string | null | undefined): boolean {
  return typeof cat === "string" && CATEGORIAS_TUA_INCLUIDA.includes(cat);
}

/** Etiqueta del campo (el 400 del API la cita entre «»). */
export const ETIQUETA_TUA_INCLUIDA = "TUA incluida en este gasto";

/** Mismos textos que el CHECK/DTO del API y que el zod de Verificar. */
export const MSG_TUA_INCLUIDA_NEGATIVA = "La TUA incluida no puede ser negativa.";
export const MSG_TUA_INCLUIDA_INVALIDA = "La TUA incluida no es un número válido.";

const SUFIJO_SIN_VUELO =
  " Este gasto no tiene vuelo: la TUA solo se separa cuando el gasto está ligado a un vuelo.";

/** Redondeo a centavos que no se cae con 1.005 (mismo truco que el API). */
function centavos(n: number): number {
  const r = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  return n < 0 ? -r : r;
}

/** La TUA fijada por oficina como número (PostgREST manda numeric como
 *  string); null = sin fijar (o un valor que no es dinero). */
function tuaFijada(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? centavos(n) : null;
}

/**
 * ¿El API ya trae la columna? (0.0.75 CON la migración aplicada). La llave
 * existe aunque valga null; sin ella el panel no pinta ni manda el campo.
 */
export function apiConTuaIncluida(g: Pick<Gasto, "tua_incluida">): boolean {
  return g.tua_incluida !== undefined;
}

/** Valor del formulario: vacío = usar la lectura de la IA; «700.00» ⇒ «700». */
export function valorFormTuaIncluida(g: Pick<Gasto, "tua_incluida">): string {
  const v = g.tua_incluida;
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && v.trim() === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

/**
 * `tua_monto` de una lectura guardada (TUA con IVA que la IA leyó aparte),
 * a centavos; null si no hay. Solo para PINTAR la sugerencia: lo que la
 * lectura de verdad separa lo dice `tua_detectada_ia` del API.
 */
export function tuaLeidaIa(valorIa: unknown): number | null {
  if (!valorIa || typeof valorIa !== "object") return null;
  const v = (valorIa as { tua_monto?: unknown }).tua_monto;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? centavos(n) : null;
}

const positivo = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Placeholder del campo vacío: lo que separa la IA («IA: 559.63») o «0.00». */
export function placeholderTuaIncluida(detectada: number | null | undefined): string {
  return positivo(detectada) ? `IA: ${detectada.toFixed(2)}` : "0.00";
}

/**
 * Ayuda bajo el campo según lo escrito y lo que leyó la IA (dinero con
 * `fmtMonto`). Sin vuelo se agrega que la TUA solo se separa con vuelo
 * (salvo con 0: «sin TUA» es verdad con o sin vuelo).
 */
export function ayudaTuaIncluida(p: {
  valor: string | null | undefined;
  detectada: number | null | undefined;
  leida: number | null | undefined;
  moneda: string | null | undefined;
  conVuelo: boolean;
}): string {
  const t = (p.valor ?? "").trim();
  if (t !== "" && Number(t) === 0) {
    return "Sin TUA: todo el ticket cuenta como costo del avión aunque la IA haya leído otra cosa.";
  }
  let base: string;
  if (t !== "") {
    base =
      "Esta TUA (IVA incluido) se separa del costo del avión y va a «Otros movimientos» del Balance general, junto a la TUA cobrada al cliente.";
  } else if (positivo(p.detectada)) {
    base = `La IA detectó una TUA de ${fmtMonto(p.detectada, p.moneda)} (IVA incluido) y se separa sola del costo del avión. Escribe otro importe para corregirla, o 0 si esta factura no cobra TUA.`;
  } else if (positivo(p.leida)) {
    base = `La IA leyó una TUA de ${fmtMonto(p.leida, p.moneda)}, pero no la pudo separar del desglose del comprobante. Si es correcta, escríbela aquí.`;
  } else {
    base =
      "La IA no separó ninguna TUA de este comprobante. Si la factura la cobra, escribe aquí el importe con IVA; vacío = sin TUA.";
  }
  return p.conVuelo ? base : `${base}${SUFIJO_SIN_VUELO}`;
}

/**
 * Nota bajo el campo con la cifra GUARDADA (la que manda hoy); null si la
 * oficina no ha fijado nada. `moneda` = la del gasto guardado.
 */
export function notaTuaVigente(
  g: Pick<Gasto, "tua_incluida">,
  moneda: string | null | undefined,
): string | null {
  const v = tuaFijada(g.tua_incluida);
  if (v === null) return null;
  const que = v === 0 ? "sin TUA" : fmtMonto(v, moneda);
  return `Vigente: fijada por oficina (${que}). Borra el valor y guarda para volver a la lectura de la IA.`;
}

/** MISMO texto que el 400 `TUA_INCLUIDA_MAYOR_QUE_TICKET` del API. */
export function mensajeTuaMayorQueTicket(
  tua: number,
  ticket: number,
  moneda: string | null | undefined,
): string {
  return `La TUA incluida (${fmtMonto(tua, moneda)}) no puede ser mayor que el monto del ticket (${fmtMonto(ticket, moneda)}, sin propina).`;
}

/**
 * Validación local ANTES de llamar al API (el API vuelve a validar): número,
 * no negativa y no mayor que el ticket SIN propina. Se compara lo que de
 * verdad viajaría (centavos).
 */
export function errorTuaIncluida(p: {
  valor: number;
  ticket: number;
  moneda: string | null | undefined;
}): string | null {
  if (!Number.isFinite(p.valor)) return MSG_TUA_INCLUIDA_INVALIDA;
  if (p.valor < 0) return MSG_TUA_INCLUIDA_NEGATIVA;
  const tua = centavos(p.valor);
  const ticket = Number.isFinite(p.ticket) ? centavos(p.ticket) : 0;
  if (tua > ticket + 0.005) return mensajeTuaMayorQueTicket(tua, ticket, p.moneda);
  return null;
}

/**
 * Qué viaja en el PATCH de Verificar:
 *  - `undefined` = la llave NO viaja: campo oculto (API sin la columna o
 *    categoría fuera de la lista — al reclasificar, el API la limpia solo) o
 *    sin cambio a centavos;
 *  - `null` = se vació un valor vigente (volver a la lectura de la IA);
 *  - número a 2 decimales = la TUA nueva (0 = sin TUA).
 * Con `monedaCambio` y un valor en el campo viaja el número AUNQUE no cambie:
 * la oficina lo confirma en la moneda nueva (si no viajara, el API lo
 * limpiaría por el cambio de moneda: USD y MXN nunca se mezclan).
 */
export function tuaIncluidaParaPatch(p: {
  visible: boolean;
  valorForm: string | null | undefined;
  actual: string | number | null | undefined;
  monedaCambio: boolean;
}): number | null | undefined {
  if (!p.visible) return undefined;
  const actual = tuaFijada(p.actual);
  const t = (p.valorForm ?? "").trim();
  if (t === "") return actual === null ? undefined : null;
  const n = Number(t);
  // Un texto que no es número no viaja (el diálogo ya lo frenó con
  // `errorTuaIncluida` antes de llegar aquí).
  if (!Number.isFinite(n)) return undefined;
  const nuevo = centavos(n);
  if (p.monedaCambio) return nuevo;
  if (actual !== null && Math.abs(nuevo - actual) < 0.005) return undefined;
  return nuevo;
}
