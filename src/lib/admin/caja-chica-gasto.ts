/**
 * Caja chica: lo que el renglón de un GASTO EN EFECTIVO dice del gasto
 * (15-oct-2026). Pedido del cliente con la captura del fondo de Pablo
 * Canales: «aquí necesito más información en la fila sobre el gasto y
 * estaría genial que se mande a la celda en los balances» y «que diga en qué
 * hoja del excel del balance está».
 *
 * PURO y SERIALIZABLE (lo arma la página —server— para la tabla cliente).
 * NO decide nada: cada pieza sale de su fuente única —
 *  - categoría: `categoriaGastoLabel` (`categorias-gasto.ts`);
 *  - avión · vuelo: `estadoAvionGasto` (`gasto-avion.ts`, la MISMA regla y
 *    los mismos textos de la columna «Avión · vuelo» de Gastos);
 *  - comprobante: `textoComprobante` (`comprobante-badge.ts`); la
 *    facturación la pinta `FacturacionBadge` con el gasto completo;
 *  - libro, mes y hoja: el campo `balance` del API (invariante 72: el panel
 *    NUNCA decide libro ni mes) con `enlacesBalanceDeGasto` y
 *    `textoHojaBalanceDeGasto` (`conciliacion-balance.ts`).
 * Ningún monto se calcula ni cambia.
 */
import type { Gasto } from "@/types/expenses";
import type { HistorialEntry } from "@/types/caja-chica";
import { categoriaGastoLabel } from "./categorias-gasto";
import { textoComprobante } from "./comprobante-badge";
import {
  enlacesBalanceDeGasto,
  hayEnlacesBalance,
  textoHojaBalanceDeGasto,
  type EnlacesBalanceDeGasto,
} from "./conciliacion-balance";
import { estadoAvionGasto, etiquetaAvionGasto, type EstadoAvionGasto } from "./gasto-avion";

export interface DetalleGastoFondo {
  /** Etiqueta canónica de la categoría (null si el gasto no se pudo leer). */
  categoria: string | null;
  /** «¿A dónde va el dinero?» (null si el gasto no se pudo leer). */
  avion: EstadoAvionGasto | null;
  /** Moneda del gasto (para los montos del reparto en el title). */
  moneda: string;
  /** Proveedor; sin él, el lugar. */
  proveedorOLugar: string | null;
  /** «Con comprobante» / «Sin comprobante» (null con un valor desconocido). */
  comprobante: string | null;
  /** «Balance de N4142R (oct 2026): hoja «…» · Balance general: hoja «…»». */
  hojaBalance: string | null;
  /** «Ver en balance…» SOLO para quien abre balances; null si no hay o no puede. */
  enlacesBalance: EnlacesBalanceDeGasto | null;
}

/**
 * El detalle de UNA entrada del historial. `null` en los renglones de caja
 * (reposición, reintegro, ajuste): esos quedan como siempre. Sin el gasto
 * completo (no llegó en la lectura de gastos) igual se dicen la hoja y los
 * enlaces: salen de la entrada.
 */
export function detalleGastoFondo(
  entrada: Pick<HistorialEntry, "id" | "origen" | "balance">,
  gasto: Gasto | null,
  opts: { abreBalances: boolean },
): DetalleGastoFondo | null {
  if (entrada.origen !== "gasto") return null;
  const enlaces = opts.abreBalances
    ? enlacesBalanceDeGasto({ id: entrada.id, balance: entrada.balance })
    : null;
  const proveedor = gasto?.proveedor?.nombre?.trim();
  const lugar = gasto?.lugar?.trim();
  return {
    categoria: gasto ? categoriaGastoLabel(gasto.categoria) : null,
    avion: gasto ? estadoAvionGasto(gasto) : null,
    moneda: gasto?.moneda ?? "MXN",
    proveedorOLugar: proveedor || lugar || null,
    comprobante: gasto ? textoComprobante(gasto.estatus_comprobante) : null,
    hojaBalance: textoHojaBalanceDeGasto(entrada.balance),
    enlacesBalance: enlaces && hayEnlacesBalance(enlaces) ? enlaces : null,
  };
}

/** Lo que suma a la búsqueda rápida: categoría, matrículas y proveedor/lugar. */
export function busquedaDetalleGastoFondo(d: DetalleGastoFondo | null | undefined): string {
  if (!d) return "";
  const a = d.avion;
  const matriculas =
    a?.tipo === "REPARTIDO"
      ? a.partes.map((p) => p.matricula ?? "")
      : a?.tipo === "FUERA_DEL_AVION"
        ? [a.referencia ?? ""]
        : [];
  return [d.categoria ?? "", a ? etiquetaAvionGasto(a) : "", ...matriculas, d.proveedorOLugar ?? ""]
    .filter(Boolean)
    .join(" ");
}
