import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  DESCRIPCION_POR_PAGAR_CAJA,
  TITULO_POR_PAGAR_CAJA,
  chipEstadoPago,
  textoConteoPorPagarCaja,
  type PorPagarCajaItem,
} from "@/lib/admin/gasto-por-pagar";
import { BotonMarcarPagado, ChipEstadoPagoGasto } from "@/components/admin/expenses/marcar-pagado";

/**
 * Caja chica (detalle del fondo): «Por pagar (aún no sale de la caja)»
 * (19-oct-2026, API 0.0.95, contrato §5/§7). La lista y el total son los
 * ADITIVOS del API (`por_pagar[]` y `por_pagar_total`): estos gastos en
 * efectivo NO son del libro hasta marcarlos pagados, así que el bloque NO
 * toca saldos ni lo por reponer. Sin hooks (la página es de servidor); el
 * botón «Marcar pagado» es el MISMO diálogo de Gastos. La página solo lo
 * monta con `porPagarDeFondo(fondo)` (sin la llave ⇒ no existe).
 */
export function PorPagarCaja({
  items,
  total,
  moneda,
  versiones = {},
}: {
  items: PorPagarCajaItem[];
  /** `por_pagar_total` del API (en la moneda del fondo); null = no vino. */
  total: number | null;
  moneda: string;
  /** `updated_at` por id (de los gastos que la página ya leyó): el control de versión. */
  versiones?: Record<string, string | null | undefined>;
}) {
  return (
    <Card data-por-pagar-caja="">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">{TITULO_POR_PAGAR_CAJA}</CardTitle>
        <p className="text-xs text-muted-foreground">{DESCRIPCION_POR_PAGAR_CAJA}</p>
      </CardHeader>
      <CardContent className="p-0">
        <ul role="list" className="divide-y divide-border border-t border-border">
          {items.map((it) => {
            const chip = chipEstadoPago(it);
            return (
              <li
                key={it.id}
                data-por-pagar-item={it.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm"
              >
                {chip ? (
                  <ChipEstadoPagoGasto chip={chip} />
                ) : (
                  <span className="text-xs text-muted-foreground">{fmtDateOnly(it.fecha_gasto)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{it.categoria ? categoriaGastoLabel(it.categoria) : "Gasto"}</span>
                  {it.concepto && <span className="text-muted-foreground"> · {it.concepto}</span>}
                </span>
                <span className="font-medium tabular-nums">{fmtMonto(it.monto, it.moneda)}</span>
                <BotonMarcarPagado
                  gasto={{
                    id: it.id,
                    fecha_gasto: it.fecha_gasto,
                    monto: it.monto,
                    moneda: it.moneda,
                    categoria: it.categoria,
                    estado_pago: it.estado_pago,
                    updated_at: versiones[it.id] ?? null,
                  }}
                />
              </li>
            );
          })}
        </ul>
        <p
          data-por-pagar-total=""
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-sm"
        >
          <span className="text-muted-foreground">{textoConteoPorPagarCaja(items.length)}</span>
          {total !== null && <span className="font-semibold tabular-nums">{fmtMonto(total, moneda)}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
