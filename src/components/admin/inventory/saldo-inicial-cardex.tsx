import { RenglonSaldoInicial } from "@/components/admin/renglon-saldo-inicial";
import { cantidadConUnidad, montoTxt } from "@/lib/admin/inventario-eliminar";
import { normalizarSaldoInicialCardex } from "@/lib/admin/inicio-oficial";

/**
 * «Saldo inicial al 1-sep-2026 · Existencia 12 qt · Último precio de compra
 * $85.00» al pie del cardex del artículo (API 0.0.85, inicio oficial): el
 * estado tras el último movimiento ANTERIOR al inicio, tal cual lo leyó el
 * API del cardex completo (sin recalcular existencia ni FIFO). Sin la llave
 * (API previo) o sin movimientos previos, nada.
 */
export function FilaSaldoInicialCardex({
  saldo,
  unidad,
  className,
}: {
  saldo: unknown;
  unidad?: string | null;
  className?: string;
}) {
  const s = normalizarSaldoInicialCardex(saldo);
  if (!s) return null;
  const piezas = [{ titulo: "Existencia", valor: cantidadConUnidad(s.existencia, unidad) }];
  if (s.costo_vigente) {
    piezas.push({
      titulo: "Último precio de compra",
      valor: montoTxt(s.costo_vigente.unitario, s.costo_vigente.moneda),
    });
  }
  return <RenglonSaldoInicial etiqueta={s.etiqueta} piezas={piezas} className={className} />;
}
