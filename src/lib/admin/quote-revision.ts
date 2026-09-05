import { cotizacionEditablePorFecha } from "@/lib/datetime";
import type { PersistedEscala, PersistedQuote } from "@/types/quotes-persisted";

/**
 * Candados de «Revisar» una cotización (FUENTE ÚNICA, 5-sep-2026): los
 * mismos booleanos y las mismas razones se pintan en la barra de acciones,
 * en la barra del total del cotizador en lectura y al abrir con
 * `?revisar=1`. Regla vigente:
 *
 * - Revisable mientras no se haya cobrado/facturado (ajustes de última hora)
 *   y solo dentro de la ventana de edición: vuelo del mes corriente o
 *   anterior (hora Cancún) — más atrás pertenece a cierres pasados.
 * - CANCELADA también se revisa (decisión del equipo, 1-sep-2026): el vuelo
 *   no salió pero la parte financiera existió; en balances la venta es LO
 *   COBRADO, así que el cobro NO bloquea — solo la factura (CFDI ancla) y la
 *   ventana de mes. El backend valida lo mismo.
 * - Vuelo de SERVICIO (taller/parada técnica sin pasajeros) no se cotiza: el
 *   backend rechaza igual con 409.
 */

export const RAZON_REVISION = {
  mesCerrado:
    "El vuelo es de un mes ya cerrado (anterior al mes pasado): la cotización ya no puede ajustarse.",
  cobrado:
    "El vuelo ya tiene cobros registrados: la cotización no puede revisarse.",
  facturado:
    "La cotización ya está facturada (CFDI): ya no puede revisarse.",
  servicio:
    "Vuelo de servicio (taller/parada técnica sin pasajeros): no es del cliente y no se cotiza.",
  cancelada:
    "El vuelo está cancelado: la revisión solo ajusta el desglose para efectos financieros/documentales. En balances la venta sigue siendo lo cobrado y el vuelo NO se reactiva.",
} as const;

export interface CandadoRevision {
  /** Se puede entrar a revisar (todos los candados abiertos). */
  canRevise: boolean;
  esCancelada: boolean;
  bloqueadaPorMes: boolean;
  /** Cobrado (sin factura): la revisión cambiaría un total YA cobrado. */
  bloqueadaPorCobro: boolean;
  bloqueadaPorFactura: boolean;
  esVueloServicio: boolean;
  /** Razón legible cuando NO se puede revisar; null cuando sí. */
  razon: string | null;
  /** Texto del botón: "Revisar" / "Revisar (cancelada)". */
  label: string;
}

/** Vuelo de SERVICIO: escalas activas, alguna de servicio y ninguna con pax. */
export function esVueloDeServicio(
  escalas: PersistedEscala[] | null | undefined,
): boolean {
  const activas = (escalas ?? []).filter((e) => !e.cancelada_at);
  return (
    activas.length > 0 &&
    activas.some((e) => e.tipo_parada === "SERVICIO") &&
    activas.every((e) => !(Number(e.pasajeros) > 0))
  );
}

export function candadoRevision(
  q: Pick<PersistedQuote, "estado" | "cobrado" | "facturado" | "fecha_vuelo"> & {
    escalas?: PersistedEscala[] | null;
  },
): CandadoRevision {
  const enVentana = cotizacionEditablePorFecha(q.fecha_vuelo);
  const esCancelada = q.estado === "CANCELADO";
  const revisableSinVentana = esCancelada
    ? !q.facturado
    : !q.cobrado && !q.facturado;
  const esVueloServicio = esVueloDeServicio(q.escalas);
  const bloqueadaPorMes = revisableSinVentana && !enVentana;
  const bloqueadaPorCobro = !esCancelada && q.cobrado && !q.facturado;
  const bloqueadaPorFactura = q.facturado;
  const canRevise = revisableSinVentana && enVentana && !esVueloServicio;
  const razon = esVueloServicio
    ? RAZON_REVISION.servicio
    : bloqueadaPorFactura
      ? RAZON_REVISION.facturado
      : bloqueadaPorCobro
        ? RAZON_REVISION.cobrado
        : bloqueadaPorMes
          ? RAZON_REVISION.mesCerrado
          : null;
  return {
    canRevise,
    esCancelada,
    bloqueadaPorMes,
    bloqueadaPorCobro,
    bloqueadaPorFactura,
    esVueloServicio,
    razon,
    label: esCancelada ? "Revisar (cancelada)" : "Revisar",
  };
}
