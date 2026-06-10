import Link from "next/link";
import { fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuoteActionsBar } from "@/components/admin/quotes/quote-actions-bar";
import { QuoteDesgloseCard } from "@/components/admin/quotes/quote-desglose-card";
import { QuoteQuickAdjustCard } from "@/components/admin/quotes/quote-quick-adjust-card";
import { QuotePresenceIndicator } from "@/components/admin/quotes/quote-presence-indicator";
import { QuoteVersionsTimeline } from "@/components/admin/quotes/quote-versions-timeline";
import { getQuote, getQuoteVersions } from "@/lib/api/quotes-server";
import { getClient } from "@/lib/api/clients-server";
import { ApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { EstadoVuelo } from "@/types/quotes-persisted";

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<EstadoVuelo, string> = {
  RESERVA: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  SOLICITUD: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  COTIZADO: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  CONFIRMADO: "bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30",
  EN_VUELO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  COMPLETADO: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADO: "bg-destructive/15 text-destructive border-destructive/30",
};

const ESTADO_LABELS: Record<EstadoVuelo, string> = {
  RESERVA: "Reserva tentativa",
  SOLICITUD: "Solicitud",
  COTIZADO: "Cotizado",
  CONFIRMADO: "Confirmado",
  EN_VUELO: "En vuelo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { id } = await params;

  let quote, versions;
  try {
    [quote, versions] = await Promise.all([getQuote(id), getQuoteVersions(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Cliente — el list endpoint trae cliente_id, no nombre. Lo pedimos aparte.
  let clientNombre: string | null = null;
  try {
    const cli = await getClient(quote.cliente_id);
    clientNombre = cli.nombre;
  } catch {
    // ignorar — el id queda visible si no hay nombre
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/quotes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Cotizaciones
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Cotización <span className="font-mono">#{quote.folio}</span>
              </h1>
              <Badge variant="outline" className={ESTADO_STYLES[quote.estado]}>
                {ESTADO_LABELS[quote.estado]}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                v{quote.cotizacion_version}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {clientNombre ?? quote.cliente_id} · {quote.origen_iata} → {quote.destino_iata} ·{" "}
              {quote.pasajeros} {quote.pasajeros === 1 ? "pasajero" : "pasajeros"}
            </p>
          </div>
          <QuoteActionsBar quote={quote} />
        </div>
        <div className="mt-3">
          <QuotePresenceIndicator quoteId={id} />
        </div>
      </div>

      {quote.estado === "CONFIRMADO" &&
        !quote.es_externo &&
        (!quote.piloto_id || !quote.aeronave_id) &&
        (() => {
          const faltaPiloto = !quote.piloto_id;
          const faltaAvion = !quote.aeronave_id;
          const queFalta =
            faltaPiloto && faltaAvion ? "avión y piloto" : faltaPiloto ? "piloto" : "avión";
          return (
            <div className="flex items-start gap-3 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm text-violet-700 dark:text-violet-300">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <div>
                  <p className="font-medium">Falta asignar el {queFalta} de este vuelo.</p>
                  <p className="text-violet-600/90 dark:text-violet-300/80">
                    La cotización está confirmada. Asigna el {queFalta} en{" "}
                    <span className="font-medium">Vuelos</span>; mientras tanto el vuelo aparece en
                    el calendario en morado (“Sin asignar”).
                  </p>
                </div>
                <Link
                  href="/admin/flights?estado=CONFIRMADO"
                  className={buttonVariants({ size: "sm" })}
                >
                  Ir a Vuelos para asignar
                </Link>
              </div>
            </div>
          );
        })()}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* TOTAL */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Total
                  </p>
                  <p className="text-4xl md:text-5xl font-bold tracking-tight">
                    {fmtUsd(quote.monto_total_usd)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">USD</p>
                </div>
                {quote.monto_total_mxn && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      MXN
                    </p>
                    <p className="text-xl font-semibold">{fmtUsd(quote.monto_total_mxn)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      tc {fmtDecimal(quote.tc_usd_mxn, 4)}
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-sm">
                <Cell label="Subtotal" value={fmtUsd(quote.subtotal_vuelo_usd)} />
                <Cell label="TUAS" value={fmtUsd(quote.tuas_usd)} />
                <Cell
                  label="IVA"
                  value={fmtUsd(quote.iva_usd)}
                  hint={`${(Number(quote.iva_pct) * 100).toFixed(0)}%`}
                />
              </div>
              {(quote.extras?.length ?? 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Conceptos extra
                  </p>
                  {quote.extras!.map((e, i) => (
                    <div
                      key={`${e.concepto}-${i}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">
                        {e.concepto}
                        {e.aplica_iva === false && (
                          <span className="ml-1 text-[10px]">(sin IVA)</span>
                        )}
                      </span>
                      <span className="font-mono">{fmtUsd(e.monto_usd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Desglose canónico para el balance (Jimmy): cajoncito por concepto. */}
          <QuoteDesgloseCard quote={quote} />

          {/* Ajuste rápido: extras y pasajeros sin rearmar el cotizador. */}
          {quote.estado !== "CANCELADO" &&
            quote.estado !== "RESERVA" &&
            !quote.cobrado &&
            !quote.facturado && <QuoteQuickAdjustCard quote={quote} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {quote.tipo === "MULTIESCALA" ? "Itinerario" : "Ruta"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {quote.tipo === "MULTIESCALA" && quote.escalas && quote.escalas.length > 0 ? (
                  <ol className="space-y-1.5">
                    {quote.escalas.map((esc) => (
                      <li
                        key={esc.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono">
                          <span className="text-muted-foreground mr-2">
                            {esc.orden}.
                          </span>
                          {esc.origen_iata} → {esc.destino_iata}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {esc.millas_nauticas
                            ? `${fmtDecimal(esc.millas_nauticas)} NM`
                            : "—"}
                        </span>
                      </li>
                    ))}
                    <li className="pt-2 mt-2 border-t border-border flex items-center justify-between text-xs">
                      <span className="font-semibold">Total</span>
                      <span className="font-mono font-bold">
                        {fmtDecimal(quote.millas_nauticas_one_way)} NM
                      </span>
                    </li>
                  </ol>
                ) : (
                  <>
                    <Row
                      label="Origen → Destino"
                      value={`${quote.origen_iata} → ${quote.destino_iata}`}
                    />
                    <Row
                      label="Millas náuticas"
                      value={
                        quote.millas_nauticas_one_way
                          ? `${fmtDecimal(quote.millas_nauticas_one_way)} NM one-way${
                              quote.es_redondo_auto ? " (× 2)" : ""
                            }`
                          : "—"
                      }
                    />
                    <Row
                      label="Aterrizajes"
                      value={String(quote.num_aterrizajes)}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tarifa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Tipo"
                  value={
                    <Badge variant="outline" className="font-mono text-xs">
                      {quote.tarifa_tipo}
                    </Badge>
                  }
                />
                <Row
                  label="USD / hr"
                  value={fmtUsd(quote.tarifa_hora_usd)}
                />
                <Row
                  label="Tiempo cobrable"
                  value={`${fmtDecimal(quote.tiempo_cobrable_hr, 4)} hr`}
                />
              </CardContent>
            </Card>
          </div>

          {(quote.notas || quote.notas_internas) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {quote.notas && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Notas (visibles en PDF)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{quote.notas}</p>
                  </CardContent>
                </Card>
              )}
              {quote.notas_internas && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Notas internas</CardTitle>
                    <CardDescription className="text-xs">
                      Solo para el equipo. No aparecen en el PDF al cliente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{quote.notas_internas}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Operación</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Cell label="Tipo de vuelo" value={quote.tipo} />
              <Cell
                label="Método de cobro"
                value={quote.metodo_cobro ?? "—"}
              />
              <Cell
                label="Fecha solicitud"
                value={fmtDateTime(quote.fecha_solicitud)}
              />
              <Cell
                label="Traslado inicial"
                value={
                  quote.fecha_vuelo
                    ? fmtDateTime(quote.fecha_vuelo)
                    : "—"
                }
              />
              <Cell
                label="Traslado final"
                value={
                  quote.fecha_traslado_final
                    ? fmtDateTime(quote.fecha_traslado_final)
                    : "—"
                }
              />
              {quote.fecha_confirmacion && (
                <Cell
                  label="Confirmado"
                  value={fmtDateTime(quote.fecha_confirmacion)}
                />
              )}
              {quote.fecha_cancelacion && (
                <Cell
                  label="Cancelado"
                  value={fmtDateTime(quote.fecha_cancelacion)}
                  hint={quote.motivo_cancelacion ?? undefined}
                />
              )}
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">{TZ_LABEL}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Historial</CardTitle>
              <CardDescription className="text-xs">
                {versions.length} {versions.length === 1 ? "versión" : "versiones"}. Cada
                revisión genera un nuevo registro inmutable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuoteVersionsTimeline versions={versions} currentVersion={quote.cotizacion_version} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono">{value}</p>
    </div>
  );
}
