import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMontoMoneda, toNum, type CompraResumen } from "@/types/compras";

/**
 * Resumen de la compra (lo calcula el API, fuente única): mercancía +
 * cargos = costo puesto en bodega; el factor multiplica el costo de factura
 * de cada línea. Los avisos (sin TC, pagos sin factura…) van en ámbar.
 */
export function CompraResumenCard({ resumen }: { resumen: CompraResumen }) {
  const m = resumen.moneda;
  const factor = toNum(resumen.factor);
  const filas: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }> = [
    { label: "Mercancía (líneas)", value: fmtMontoMoneda(resumen.total_mercancia, m) },
    { label: "Cargos en la factura", value: fmtMontoMoneda(resumen.cargos_factura, m) },
    { label: "Cargos por pagos (envío, impuestos…)", value: fmtMontoMoneda(resumen.cargos_pagos, m) },
    { label: "Total puesto en bodega", value: fmtMontoMoneda(resumen.total, m), strong: true },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Resumen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5 text-sm">
          {filas.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className={f.strong ? "font-medium" : "text-muted-foreground"}>{f.label}</dt>
              <dd className={`tabular-nums ${f.strong ? "text-base font-semibold" : ""}`}>{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <p>
            Factor sobre el costo de factura:{" "}
            <span className="font-mono font-medium text-foreground">× {factor ? factor.toFixed(4) : "1.0000"}</span>
          </p>
          <p className="text-muted-foreground">
            TC:{" "}
            <span className="font-mono">
              {resumen.tc_usd_mxn != null && toNum(resumen.tc_usd_mxn) > 0
                ? toNum(resumen.tc_usd_mxn).toFixed(4)
                : "—"}
            </span>
            {" · "}
            Total USD:{" "}
            <span className="font-mono">
              {resumen.total_usd != null ? fmtMontoMoneda(resumen.total_usd, "USD") : "—"}
            </span>
            {" · "}
            Total MXN:{" "}
            <span className="font-mono">
              {resumen.total_mxn != null ? fmtMontoMoneda(resumen.total_mxn, "MXN") : "—"}
            </span>
          </p>
        </div>
        {resumen.avisos.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {resumen.avisos.map((a) => (
              <li key={a} className="flex items-start gap-1.5">
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
