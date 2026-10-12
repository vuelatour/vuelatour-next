/**
 * Abonos sin identificar EN CONCILIACIÓN con las MISMAS opciones que
 * Ingresos → «Por conciliar» (12-oct-2026). Pedido del cliente: «la sección
 * de ingresos sí tenemos muchas opciones para conciliar ese ingreso, pero
 * en Conciliación no vienen las mismas opciones, necesitamos las mismas
 * opciones en Conciliación también» y «en los abonos no tiene la opción de
 * sugerir con IA».
 *
 * El menú de Ingresos (`AbonoAcciones`) trabaja sobre un `AbonoPendiente`
 * del API; la bandeja de Conciliación tiene `MovimientoBancario`. Este
 * helper PURO traduce uno al otro con lo que la bandeja ya sabe (cuenta,
 * fecha, monto, bruto/comisión, descripción, referencia, notas); lo que solo
 * calcula `GET conciliacion/abonos-pendientes` (motivo, candidatos, posible
 * duplicado, cliente/categoría sugeridos) va en null — ninguno de los
 * diálogos del menú lo exige y nunca se inventa un motivo.
 */
import type { CatalogosIngreso } from "@/components/admin/ingresos/registrar-ingreso-dialog";
import type { MovimientoBancario } from "@/types/conciliacion";
import type { AbonoPendiente, MonedaIngreso } from "@/types/ingresos";

/** Lo que la bandeja sabe de cada cuenta (del catálogo de la página). */
export interface CuentaDeAbono {
  alias: string | null;
  moneda: string | null;
  tipo: string | null;
}

/** Lo que `MovimientoActions` necesita para montar el menú de Ingresos. */
export interface AbonosConciliacion {
  catalogos: CatalogosIngreso;
  /** Cuentas para el selector de la IA (las mismas de «Cruzar pendientes»). */
  cuentasIa: { id: string; label: string }[];
  cuentas: Record<string, CuentaDeAbono>;
}

export function monedaIngresoDe(moneda: string | null | undefined): MonedaIngreso | null {
  return moneda === "USD" ? "USD" : moneda === "MXN" ? "MXN" : null;
}

function numeroONull(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ABONO que sigue sin identificar: ni conciliado ni ligado a nada. */
export function esAbonoPendiente(m: MovimientoBancario): boolean {
  return (
    m.tipo === "ABONO" &&
    m.conciliado !== true &&
    m.gasto_id == null &&
    m.cobro_id == null &&
    m.cobro_grupo_id == null &&
    m.ingreso_id == null &&
    m.clasificacion_id == null
  );
}

/** El movimiento como lo espera el menú de Ingresos. */
export function abonoPendienteDeMovimiento(
  m: MovimientoBancario,
  cuenta?: CuentaDeAbono | null,
): AbonoPendiente {
  return {
    id: m.id,
    cuenta_bancaria_id: m.cuenta_bancaria_id,
    cuenta_alias: cuenta?.alias ?? null,
    cuenta_moneda: monedaIngresoDe(cuenta?.moneda),
    cuenta_tipo: cuenta?.tipo === "PASARELA" ? "PASARELA" : cuenta?.tipo === "BANCO" ? "BANCO" : null,
    fecha: m.fecha.slice(0, 10),
    monto: Number(m.monto) || 0,
    monto_bruto: numeroONull(m.monto_bruto),
    comision_monto: numeroONull(m.comision_monto),
    descripcion: m.descripcion ?? null,
    referencia: m.referencia ?? null,
    notas: m.notas ?? null,
    patron: null,
    motivo_pendiente: null,
    candidatos_n: null,
    exactos_manual: null,
    posible_duplicado_de: null,
    cliente_sugerido: null,
    categoria_sugerida: null,
  };
}

/** Cuentas de la página ⇒ mapa por id para el menú (alias, moneda, tipo). */
export function cuentasDeAbonos(
  cuentas: ReadonlyArray<{ id: string; alias: string; moneda: string; tipo?: string | null }>,
): Record<string, CuentaDeAbono> {
  return Object.fromEntries(
    cuentas.map((c) => [c.id, { alias: c.alias, moneda: c.moneda, tipo: c.tipo ?? null }]),
  );
}
