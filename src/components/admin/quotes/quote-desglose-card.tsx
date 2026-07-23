"use client";

import { useState } from "react";
import {
  ClipboardDocumentIcon,
  CheckIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtUsd } from "@/lib/format";
import type { PersistedQuote } from "@/types/quotes-persisted";

interface Linea {
  clave: string;
  concepto: string;
  monto_usd: number;
}

/**
 * Líneas del desglose: usa el desglose canónico del snapshot (motor ≥1.3) y,
 * para cotizaciones anteriores, lo reconstruye desde las columnas guardadas.
 */
function buildLineas(quote: PersistedQuote): Linea[] {
  const canonico = quote.calculo_snapshot?.desglose;
  if (canonico && canonico.length > 0) return canonico;

  const lineas: Linea[] = [
    {
      clave: "TIEMPO_VUELO",
      concepto: `Tiempo de vuelo · ${Number(quote.tiempo_cobrable_hr)} hr × $${Number(quote.tarifa_hora_usd)}/hr`,
      monto_usd: Number(quote.subtotal_vuelo_usd) || 0,
    },
  ];
  if (Number(quote.tuas_usd) > 0) {
    lineas.push({ clave: "TUAS", concepto: "TUAS", monto_usd: Number(quote.tuas_usd) });
  }
  for (const e of quote.extras ?? []) {
    lineas.push({
      clave: "EXTRA",
      concepto: `${e.concepto}${e.aplica_iva === false ? " (sin IVA)" : ""}`,
      monto_usd: Number(e.monto_usd) || 0,
    });
  }
  if (Number(quote.iva_usd) > 0) {
    lineas.push({
      clave: "IVA",
      concepto: `IVA ${(Number(quote.iva_pct) * 100).toFixed(0)}%`,
      monto_usd: Number(quote.iva_usd),
    });
  }
  if (Number(quote.viaticos_pernocta_usd ?? 0) > 0) {
    lineas.push({
      clave: "PERNOCTA",
      concepto: "Viáticos por pernocta (sin IVA)",
      monto_usd: Number(quote.viaticos_pernocta_usd),
    });
  }
  const ajuste = Number(quote.ajuste_final_usd ?? 0);
  if (ajuste !== 0) {
    lineas.push({
      clave: "AJUSTE",
      concepto: ajuste < 0 ? "Descuento" : "Redondeo",
      monto_usd: ajuste,
    });
  }
  return lineas;
}

const CLAVE_LABEL: Record<string, string> = {
  TIEMPO_VUELO: "Tiempo de vuelo",
  TUAS: "TUAS",
  EXTRA: "Extra",
  IVA: "IVA",
  PERNOCTA: "Pernocta",
  AJUSTE: "Ajuste",
  // Regla actual: la comisión se SUMA al precio del cliente, por eso es una
  // línea del desglose canónico (las líneas suman exactamente el total).
  COMISION_VENDEDOR: "Comisión del vendedor",
};

/**
 * Desglose para el balance: cada concepto cobrado al cliente como línea
 * independiente (cajoncito), con verificación de que la suma cuadra con el
 * total y botón para copiarlo y pegarlo en la página de balance.
 */
export function QuoteDesgloseCard({ quote }: { quote: PersistedQuote }) {
  const [copied, setCopied] = useState(false);
  const lineas = buildLineas(quote);
  const suma = Math.round(lineas.reduce((acc, l) => acc + l.monto_usd, 0) * 100) / 100;
  const total = Number(quote.monto_total_usd) || 0;
  const cuadra = Math.abs(suma - total) < 0.01;

  const handleCopy = async () => {
    const filas = [
      ["Folio", `#${quote.folio}`].join("\t"),
      ["Concepto", "Tipo", "USD"].join("\t"),
      ...lineas.map((l) =>
        [l.concepto, CLAVE_LABEL[l.clave] ?? l.clave, l.monto_usd.toFixed(2)].join("\t"),
      ),
      ["TOTAL", "", total.toFixed(2)].join("\t"),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(filas);
      setCopied(true);
      toast.success("Desglose copiado — pégalo en la página de balance");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TableCellsIcon className="h-4 w-4 text-muted-foreground" />
              Desglose para balance
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Cada concepto cobrado al cliente por separado, listo para vaciar
              al balance.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 shrink-0"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {lineas.map((l, i) => (
            <div
              key={`${l.clave}-${i}`}
              className="flex items-start justify-between gap-3 text-sm"
            >
              {/* Las líneas de TUAS por aeropuerto son largas ("TUA PCE ·
                  $330.60 MXN × 4 pax = $1322.40 MXN"): wrap, no truncar. */}
              <span className="text-muted-foreground min-w-0 break-words">
                <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {CLAVE_LABEL[l.clave] ?? l.clave}
                </span>
                {l.concepto}
              </span>
              <span className="font-mono shrink-0">{fmtUsd(l.monto_usd)}</span>
            </div>
          ))}
          <div className="pt-2 mt-1 border-t border-border flex items-center justify-between text-sm">
            <span className="font-semibold">Total cobrado al cliente</span>
            <span className="font-mono font-bold">{fmtUsd(total)}</span>
          </div>
          {/* Comisión del vendedor (interna): regla actual = se SUMA al
              precio (la paga el cliente) y viene como línea COMISION_VENDEDOR
              del desglose; el neto VuelaTour lo manda el motor en meta.
              Cotizaciones viejas (sin esa línea) se calcularon con la regla
              anterior (salía del precio): conservan su signo para no
              contradecir los números guardados. */}
          {(() => {
            const meta = quote.calculo_snapshot?.meta;
            const comision = Number(meta?.comision_vendedor_usd ?? 0);
            if (!(comision > 0)) return null;
            const sumada = lineas.some((l) => l.clave === "COMISION_VENDEDOR");
            const neto =
              meta?.neto_vuelatour_usd ?? (sumada ? null : total - comision);
            return (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Comisión vendedor
                    {meta?.comision_vendedor_nombre
                      ? ` (${meta.comision_vendedor_nombre})`
                      : ""}{" "}
                    · {sumada ? "la paga el cliente" : "interna"}
                  </span>
                  <span className="font-mono">
                    {sumada ? "+" : "−"}
                    {fmtUsd(comision)}
                  </span>
                </div>
                {neto != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Neto VuelaTour</span>
                    <span className="font-mono font-bold">{fmtUsd(neto)}</span>
                  </div>
                )}
              </>
            );
          })()}
          {cuadra ? (
            <p className="text-[11px] text-green-600 dark:text-green-400">
              ✓ Las líneas suman exactamente el total.
            </p>
          ) : (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠ Las líneas suman {fmtUsd(suma)} y el total registrado es{" "}
              {fmtUsd(total)} (cotización de versión anterior del motor —
              re-cotiza o ajusta para regenerar el desglose exacto).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
