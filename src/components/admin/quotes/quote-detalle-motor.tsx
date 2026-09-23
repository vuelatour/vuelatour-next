"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteDesgloseCard } from "@/components/admin/quotes/quote-desglose-card";
import { QuotePlegable } from "@/components/admin/quotes/quote-plegable";
import { textoCantidadUnitario } from "@/lib/admin/extras";
import { fmtHorasDecimal, fmtHorasMinutos } from "@/lib/admin/horas";
import { moneyTarifa } from "@/lib/admin/tarifa";
import { fmtDecimal, fmtMxn, fmtTc, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuoteBreakdown } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";

/**
 * DETALLE DEL CÁLCULO (motor) en un `<details>` DEBAJO del papel (Fase 2.3 ·
 * BLOQUE C, 22-sep-2026; antes, el sub-bloque «Detalle del cálculo» del panel
 * lateral «Interno · no se imprime»).
 *
 * Fuera del documento a propósito: es DEPURACIÓN — el breakdown canónico del
 * motor tal cual (recibo en el orden de la suma, tramos, tiempos, tarifa e
 * IVA) para cuadrar un número cuando algo no coincide. El papel ya dice lo
 * que se cobra; esto dice CÓMO salió. Plegado por defecto y nunca desmontado.
 *
 * Aquí NO se calcula dinero: cada cifra sale del `breakdown` o de la versión
 * guardada (`QuoteDesgloseCard`, que lee los montos PERSISTIDOS).
 */
export function QuoteDetalleMotor({
  lectura,
  isRevise,
  initialQuote,
  breakdown,
  loading,
  error,
  hayPayload,
  avion,
  tcUsdMxn,
}: {
  lectura: boolean;
  isRevise: boolean;
  initialQuote?: PersistedQuote;
  breakdown: QuoteBreakdown | null;
  loading: boolean;
  error: string | null;
  /** Hay payload completo para el motor (aeronave, tramos con millas, pax). */
  hayPayload: boolean;
  /** «Cotizado en: Piper Seneca V» — modelo cotizado, nunca matrícula. */
  avion: string | null;
  /** T.C. capturado; solo para el display del total por moneda. */
  tcUsdMxn: number | null;
}) {
  const resumen = breakdown
    ? [
        avion?.replace(/^Cotizado en: /, "") ?? null,
        `Subtotal ${fmtUsd(breakdown.totales.subtotal_vuelo_usd)}`,
        `IVA ${fmtUsd(breakdown.totales.iva_usd)}`,
        `${fmtDecimal(breakdown.tiempos.cobrable_hr)} hr`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Se llena al calcular";

  return (
    <QuotePlegable
      id="detalle"
      titulo="Detalle del cálculo (motor)"
      resumen={resumen}
      aviso={error ? "Error al calcular" : null}
    >
      {/* `seccion-detalle` era el ancla del sub-bloque del panel. */}
      <div id="seccion-detalle" className="scroll-mt-24 space-y-3">
        {lectura && initialQuote ? (
          <>
            {breakdown ? (
              <Preview breakdown={breakdown} loading={false} avion={avion} tcUsdMxn={tcUsdMxn} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Esta versión no guardó el detalle del cálculo (cotización de un motor anterior):
                abajo va el desglose reconstruido desde las columnas guardadas.
              </p>
            )}
            <QuoteDesgloseCard quote={initialQuote} />
          </>
        ) : error ? (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Error al calcular</CardTitle>
              <CardDescription className="text-destructive/80">{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : !hayPayload ? (
          <Card className="border-t-2 border-t-brand-600/60">
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Completa los parámetros
              </CardTitle>
              <CardDescription>Necesito aeronave, ruta y pasajeros para calcular.</CardDescription>
            </CardHeader>
          </Card>
        ) : breakdown ? (
          <>
            <Preview breakdown={breakdown} loading={loading} avion={avion} tcUsdMxn={tcUsdMxn} />
            {isRevise && initialQuote && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                  Desglose de la versión guardada (v{initialQuote.cotizacion_version})
                </p>
                <QuoteDesgloseCard quote={initialQuote} />
              </div>
            )}
          </>
        ) : (
          <PreviewSkeleton />
        )}
      </div>
    </QuotePlegable>
  );
}

/** Fila del desglose tipo recibo del «Detalle del cálculo». */
function FilaTotal({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint ? <span className="text-xs"> · {hint}</span> : null}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * «Detalle del cálculo» (solo lectura): el breakdown canónico del motor tal
 * cual — total, recibo en el orden de la suma, extras, total por moneda,
 * tramos, tiempos, tarifa e IVA. Cero cálculos de dinero aquí.
 */
function Preview({
  breakdown,
  loading,
  avion,
  tcUsdMxn,
}: {
  breakdown: QuoteBreakdown;
  loading: boolean;
  /** «Cotizado en: Piper Seneca V» — modelo cotizado, nunca matrícula. */
  avion?: string | null;
  /** TC capturado; solo para el display del total por moneda. */
  tcUsdMxn: number | null;
}) {
  // Composición del total MXN (motor): componentes USD × tc + nativos MXN.
  const mxnNativos = Number(breakdown.totales.mxn_nativos) || 0;
  const usdDeMxn =
    Math.round(
      ((breakdown.tuas.filas ?? []).filter((f) => f.moneda === "MXN").reduce((acc, f) => acc + f.total_usd, 0) +
        (breakdown.extras ?? []).filter((e) => e.moneda === "MXN").reduce((acc, e) => acc + e.monto_usd, 0)) *
        100,
    ) / 100;
  const componentesUsd = Math.round((breakdown.totales.total_usd - usdDeMxn) * 100) / 100;
  const componentesUsdEnMxn =
    breakdown.totales.total_mxn != null
      ? Math.round((breakdown.totales.total_mxn - mxnNativos) * 100) / 100
      : null;

  return (
    <>
      {/* TOTAL */}
      <Card className={cn("border-t-2 border-t-brand-600/60 transition-opacity", loading && "opacity-60")}>
        <CardContent className="p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-3xl font-bold tracking-tight">{fmtUsd(breakdown.totales.total_usd)}</p>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
              {avion && <p className="text-xs text-muted-foreground mt-1">{avion}</p>}
              {!!breakdown.meta?.comision_vendedor_usd && (
                <p className="text-xs text-muted-foreground mt-2">
                  Comisión vendedor
                  {breakdown.meta.comision_vendedor_nombre ? ` (${breakdown.meta.comision_vendedor_nombre})` : ""}:
                  +{fmtUsd(breakdown.meta.comision_vendedor_usd)} (la paga el cliente)
                  {breakdown.meta.neto_vuelatour_usd != null && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-semibold text-foreground">
                        Neto VuelaTour: {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30">
              {breakdown.tarifa.tipo}
            </Badge>
          </div>
          {/* Desglose tipo RECIBO, en el MISMO orden de la suma canónica. */}
          <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-sm">
            <FilaTotal label="Subtotal vuelo" value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)} />
            <FilaTotal
              label="TUAS"
              hint={`${breakdown.tuas.pasajeros} pax${
                Number(breakdown.tuas.total_mxn_nativo) > 0 ? ", incluye MXN" : ""
              }`}
              value={fmtUsd(breakdown.totales.tuas_total_usd)}
            />
            {!!breakdown.totales.viaticos_pernocta_usd && (
              <FilaTotal
                label="Pernocta"
                hint="viáticos, sin IVA"
                value={fmtUsd(breakdown.totales.viaticos_pernocta_usd)}
              />
            )}
            {!!breakdown.totales.extras_total_usd && (
              <FilaTotal
                label="Extras"
                hint={`${breakdown.extras?.length ?? 0} ${
                  (breakdown.extras?.length ?? 0) === 1 ? "concepto" : "conceptos"
                }`}
                value={fmtUsd(breakdown.totales.extras_total_usd)}
              />
            )}
            {!!breakdown.totales.ajuste_final_usd && (
              <FilaTotal
                label={(breakdown.totales.ajuste_final_usd ?? 0) < 0 ? "Descuento" : "Redondeo"}
                hint="fuera de IVA"
                value={fmtUsd(breakdown.totales.ajuste_final_usd!)}
              />
            )}
            <FilaTotal
              label="IVA"
              hint={breakdown.iva.porcentaje > 0 ? `${(breakdown.iva.porcentaje * 100).toFixed(0)}%` : "0%"}
              value={fmtUsd(breakdown.totales.iva_usd)}
            />
          </div>
          {(breakdown.extras?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {breakdown.extras!.map((e, i) => (
                <div key={`${e.concepto}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground min-w-0 break-words">
                    {e.concepto}
                    {e.unitario != null && (
                      <span className="ml-1 font-mono text-[10px]">
                        · {textoCantidadUnitario(e, e.cantidad ?? null)}
                      </span>
                    )}
                    {e.aplica_iva === false && <span className="ml-1 text-[10px]">(sin IVA)</span>}
                    {e.origen === "GRUPO" && (
                      <span className="ml-1 rounded bg-fuchsia-500/15 px-1 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
                        grupo
                      </span>
                    )}
                  </span>
                  <span className="font-mono shrink-0">
                    {e.moneda === "MXN" && e.monto_nativo != null && (
                      <span className="mr-1.5 text-muted-foreground">{fmtMxn(e.monto_nativo)} =</span>
                    )}
                    {fmtUsd(e.monto_usd)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Total consolidado en MXN (motor ≥1.3.1): EXACTO por composición. */}
          {breakdown.totales.total_mxn != null && (
            <div className="mt-3 rounded-lg border border-border bg-navy-800/50 px-3 py-2 text-sm">
              {mxnNativos > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-foreground/70">Total por moneda</p>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      Componentes USD: {fmtUsd(componentesUsd)}
                      {tcUsdMxn ? ` × tc ${fmtTc(tcUsdMxn)}` : ""}
                    </span>
                    <span className="font-mono shrink-0 text-foreground">
                      {componentesUsdEnMxn != null ? fmtMxn(componentesUsdEnMxn) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Nativos MXN (TUAS/extras en pesos, tal cual)</span>
                    <span className="font-mono shrink-0 text-foreground">{fmtMxn(mxnNativos)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-semibold">
                    <span>Total MXN</span>
                    <span className="font-mono">{fmtMxn(breakdown.totales.total_mxn)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Total MXN{tcUsdMxn ? ` (tc ${fmtTc(tcUsdMxn)})` : ""}
                  </span>
                  <span className="font-mono font-semibold">{fmtMxn(breakdown.totales.total_mxn)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle por tramo (MULTIESCALA) */}
      {breakdown.tramos && breakdown.tramos.length > 0 && (
        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Detalle por tramo</CardTitle>
            <CardDescription className="text-xs">
              Pasajeros, TUAS, ferry, pernocta y paradas de servicio por tramo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakdown.tramos.map((t) => (
              <div key={t.orden} className="rounded-lg border border-border p-2.5 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono">
                    <span className="text-muted-foreground mr-1">{t.orden}.</span>
                    {t.origen} → {t.destino}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {t.es_ferry ? (
                      <Badge variant="outline" className="text-[10px]">
                        Ferry · vacío
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {t.pasajeros} pax
                      </Badge>
                    )}
                    {t.requiere_pernocta && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      >
                        Pernocta · {fmtUsd(t.pernocta_usd)}
                      </Badge>
                    )}
                    {t.tipo_parada === "SERVICIO" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                      >
                        Servicio
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>
                    {fmtDecimal(t.millas)} NM · {fmtDecimal(t.tiempo_hr, 4)} hr
                  </span>
                  <span>TUAS {fmtUsd(t.tuas_usd)}</span>
                </div>
                {t.tipo_parada === "SERVICIO" && t.servicio_notas && (
                  <p className="text-xs text-sky-700 dark:text-sky-300">{t.servicio_notas}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tiempos + Tarifa */}
      <div className="grid gap-4">
        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Tiempos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Vuelo"
              value={`${fmtDecimal(breakdown.tiempos.vuelo_hr, 4)} hr`}
              hint={`${fmtDecimal(breakdown.ruta.millas_nauticas_totales)} NM ÷ ${breakdown.aeronave.velocidad_crucero_kts} kts`}
            />
            <Row
              label="Calzos"
              value={`${fmtDecimal(breakdown.tiempos.calzos_hr, 4)} hr`}
              hint={`${breakdown.ruta.num_aterrizajes} aterrizajes × 0.15 hr`}
            />
            {Number(breakdown.tiempos.sobrevuelo_hr) > 0 && (
              <Row
                label="Sobrevuelo"
                value={`${fmtDecimal(breakdown.tiempos.sobrevuelo_hr!, 4)} hr`}
                hint="Tiempo extra sobre la zona"
              />
            )}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
              <div>
                <p className="font-semibold">Cobrable</p>
                <p className="text-xs text-muted-foreground">
                  {breakdown.tiempos.cobrable_proviene_de_override
                    ? `pactado a mano (${fmtHorasMinutos(breakdown.tiempos.cobrable_hr)}) · la regla daría ${fmtHorasDecimal(breakdown.tiempos.cobrable_hr_regla ?? 0, 4)} hr`
                    : "regla (suma, mínimo 1 hr)"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-semibold">
                  {fmtHorasDecimal(breakdown.tiempos.cobrable_hr, 4)}
                </span>
                <span className="text-xs text-muted-foreground">hr</span>
              </div>
            </div>
            {breakdown.tiempos.cobrable_proviene_de_override &&
              Number(breakdown.tiempos.cobrable_hr) <
                Number(breakdown.tiempos.vuelo_hr) +
                  Number(breakdown.tiempos.calzos_hr) +
                  Number(breakdown.tiempos.sobrevuelo_hr ?? 0) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Ojo: el cobrable pactado es MENOR al tiempo real (vuelo + calzos): se cobraría de menos.
                </p>
              )}
            {breakdown.tiempos.minimo_hora_aplicado && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Vuelo corto: se cobra la hora completa (mínimo 1 hr).
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Tarifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="USD / hr"
              value={fmtUsd(breakdown.tarifa.usd_por_hora)}
              hint={
                breakdown.tarifa.proviene_de_override
                  ? "Ajustada a mano para esta cotización"
                  : breakdown.tarifa.preferencial_cliente
                    ? "Preferencial del cliente"
                    : "Del avión"
              }
            />
            {breakdown.tarifa.preferencial_cliente && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Este cliente tiene tarifa preferencial pactada para este avión; manda sobre la tarifa{" "}
                {breakdown.tarifa.tipo === "PUBLICO" ? "público" : "broker"} default.
              </p>
            )}
            <Row
              label="Subtotal"
              value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)}
              // El hint ENSEÑA la multiplicación del subtotal: la tarifa va
              // completa (`moneyTarifa`), el valor sigue siendo el del motor.
              hint={`${fmtHorasDecimal(breakdown.tiempos.cobrable_hr, 4)} hr × ${moneyTarifa(breakdown.tarifa.usd_por_hora)}`}
              bold
            />
          </CardContent>
        </Card>
      </div>

      {/* IVA */}
      <Card className="border-t-2 border-t-brand-600/60">
        <CardHeader>
          <CardTitle className="text-sm">IVA</CardTitle>
          <CardDescription className="text-xs">{breakdown.iva.nota}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm">
          <Cell label="Porcentaje" value={`${(breakdown.iva.porcentaje * 100).toFixed(2)}%`} />
          <Cell label="Base" value={fmtUsd(breakdown.iva.base_usd)} />
          <Cell label="Monto" value={fmtUsd(breakdown.iva.monto_usd)} bold />
        </CardContent>
      </Card>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <>
      <Card className="border-t-2 border-t-brand-600/60">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-12 w-48" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-t-2 border-t-brand-600/60">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </>
  );
}

function Cell({ label, value, hint, bold }: { label: string; value: string; hint?: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-mono", bold ? "font-bold" : "font-medium")}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value, hint, bold }: { label: string; value: string; hint?: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={cn(bold && "font-semibold")}>{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("font-mono", bold && "font-bold")}>{value}</p>
    </div>
  );
}
