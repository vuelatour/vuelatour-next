import Link from "next/link";
import {
  cotizacionEditablePorFecha,
  fmtDateOnly,
  fmtDateTime,
  TZ_LABEL,
} from "@/lib/datetime";
import { notFound } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
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
import { QuoteCobrosCard } from "@/components/admin/quotes/quote-cobros-card";
import { QuoteDesgloseCard } from "@/components/admin/quotes/quote-desglose-card";
import { getFlightSnapshot } from "@/lib/api/flights-server";
import { combinadoFolio, type FlightSnapshot } from "@/types/flights";
import { QuoteEscalaPdfFecha } from "@/components/admin/quotes/quote-escala-pdf-fecha";
import { QuoteEscalaPdfToggle } from "@/components/admin/quotes/quote-escala-pdf-toggle";
import { QuoteQuickAdjustCard } from "@/components/admin/quotes/quote-quick-adjust-card";
import { QuotePresenceIndicator } from "@/components/admin/quotes/quote-presence-indicator";
import { QuoteVersionsTimeline } from "@/components/admin/quotes/quote-versions-timeline";
import { getQuote, getQuoteVersions } from "@/lib/api/quotes-server";
import { getClient } from "@/lib/api/clients-server";
import { getMe } from "@/lib/api/me";
import { ApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { GrupoBadge } from "@/components/admin/grupos/grupo-badge";
import type { PersistedEscala, PersistedQuote } from "@/types/quotes-persisted";
import type { VueloConGrupo } from "@/types/grupos";

export const dynamic = "force-dynamic";


interface QuoteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const me = await getMe().catch(() => null);
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

  // Cobros del vuelo (misma entidad): visibles desde la cotización porque el
  // desglose "no cambiaba" al registrarse un cobro, y porque un cobro bloquea
  // la revisión — desde aquí se elimina para desbloquear. Best-effort: en
  // SOLICITUD/COTIZADO aún no hay vuelo operativo con cobros.
  let cobrosVuelo: FlightSnapshot | null = null;
  if (quote.estado !== "SOLICITUD" && quote.estado !== "COTIZADO") {
    cobrosVuelo = await getFlightSnapshot(id).catch(() => null);
  }

  // Visibilidad en PDF por tramo (1-sep): el toggle vive AQUÍ (no en el
  // cotizador) y escribe directo en la escala VIVA — la misma que manda en
  // el PDF (escalasVisiblesPdf cruza por orden; el snapshot solo decide si
  // no hay escala viva de ese orden). Solo roles de oficina que editan.
  const puedeEditarPdf = me?.rol === "ADMIN" || me?.rol === "COORDINADOR";
  const escalaVivaPorOrden = new Map<number, PersistedEscala>();
  for (const esc of quote.escalas ?? []) {
    if (!escalaVivaPorOrden.has(esc.orden)) escalaVivaPorOrden.set(esc.orden, esc);
  }
  // Ruta COMERCIAL completa para el encabezado (2-sep-2026): el par corto
  // origen→destino escondía las paradas intermedias. MISMA precedencia que la
  // card de itinerario: (a) con itinerario operativo la ruta cotizada vive en
  // el snapshot del cálculo; (b) si no, las escalas vivas comerciales (sin
  // solo_operativa ni canceladas); (c) fallback al par corto. Vista interna:
  // SIN filtrar pdf_oculto (el PDF tiene su propia fuente, ruta-visible.util).
  const escalasComerciales = (quote.escalas ?? [])
    .filter((e) => !e.solo_operativa && !e.cancelada_at)
    .sort((a, b) => a.orden - b.orden);
  const rutaComercial =
    quote.itinerario_operativo === true &&
    (quote.calculo_snapshot?.tramos?.length ?? 0) > 0
      ? puntosRuta(quote.calculo_snapshot!.tramos!)
      : escalasComerciales.length > 0
        ? puntosRuta(
            escalasComerciales.map((e) => ({
              origen: e.origen_iata,
              destino: e.destino_iata,
            })),
          )
        : [quote.origen_iata, quote.destino_iata];

  // Hijo de una cotización de GRUPO (4-sep): badge con link al grupo. El
  // total de aviones sale del snapshot (meta.grupo) si el API lo selló.
  const quoteConGrupo = quote as PersistedQuote & VueloConGrupo;
  const grupoHijo = grupoDeVuelo(quoteConGrupo);

  // Fecha por tramo para el PDF (3-sep): misma escala VIVA, misma ruta
  // PATCH. Es un 'YYYY-MM-DD' de pared que SOLO imprime el PDF — no toca la
  // ruta operativa ni las fechas de vuelo y no versiona.
  const notaPdfTramos = puedeEditarPdf ? (
    <p className="pt-1 text-[10px] text-muted-foreground">
      La fecha es solo para el PDF del cliente (sin hora). No cambia la ruta
      operativa ni las fechas de vuelo; los tramos ocultos no muestran fecha.
      Lo oculto no aparece en el PDF (la numeración se ajusta sola); el
      precio no cambia.
    </p>
  ) : null;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes">Cotizaciones</BackLink>
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
              {quote.es_externo && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  Externo{quote.operador_externo ? ` · ${quote.operador_externo}` : ""}
                </Badge>
              )}
              {quote.combinado_con_id &&
                (() => {
                  // Vuelo COMBINADO (pernocta): el join puede llegar objeto o
                  // arreglo (PostgREST) o faltar (API vieja).
                  const folioCombinado = combinadoFolio(quote);
                  return (
                    <Link href={`/admin/flights/${quote.combinado_con_id}`}>
                      <Badge
                        variant="outline"
                        className="bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/25 transition-colors"
                        title="Vuelos combinados (estrategia de pernocta): comparten avión, se cancelaron sus tramos ferry vacíos y los precios de ambos clientes no cambiaron. Clic para abrir el otro vuelo."
                      >
                        {folioCombinado != null
                          ? `♻ Combinado con #${folioCombinado}`
                          : "♻ Vuelo combinado"}
                      </Badge>
                    </Link>
                  );
                })()}
              {grupoHijo && (
                <GrupoBadge
                  grupoId={grupoHijo.id}
                  folio={grupoHijo.folio}
                  posicion={quoteConGrupo.grupo_posicion}
                  total={quote.calculo_snapshot?.meta?.grupo?.total_aviones ?? null}
                  nombre={grupoHijo.nombre}
                />
              )}
            </div>
            {/* Ruta comercial COMPLETA (2-sep-2026); en rutas largas el texto
                envuelve — nunca se trunca. */}
            <p className="text-sm text-muted-foreground mt-1">
              {clientNombre ?? quote.cliente_id} · {rutaComercial.join(" → ")} ·{" "}
              {quote.pasajeros} {quote.pasajeros === 1 ? "pasajero" : "pasajeros"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* El acceso al vuelo vive en QuoteActionsBar ("Ver vuelo"): un
                segundo botón aquí duplicaba la misma ruta (y en COTIZADO
                enlazaba a una página que rebota). */}
            <QuoteActionsBar quote={quote} />
          </div>
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
                    <p className="text-xl font-semibold">{fmtMxn(quote.monto_total_mxn)}</p>
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
              {/* TUAS capturadas en pesos: el detalle nativo por aeropuerto
                  (entran al total MXN tal cual, sin re-convertir). */}
              {(() => {
                const filasMxn =
                  quote.calculo_snapshot?.tuas?.filas?.filter(
                    (f) => f.moneda === "MXN",
                  ) ?? [];
                if (filasMxn.length === 0) return null;
                return (
                  <p className="mt-2 text-xs text-muted-foreground">
                    TUAS pagadas en pesos (entran al total MXN tal cual):{" "}
                    {filasMxn
                      .map(
                        (f) =>
                          `TUA ${f.iata} $${f.monto_pax.toFixed(2)} MXN × ${f.pax}`,
                      )
                      .join(" · ")}
                  </p>
                );
              })()}
              {(quote.extras?.length ?? 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Conceptos extra
                  </p>
                  {quote.extras!.map((e, i) => (
                    <div
                      key={`${e.concepto}-${i}`}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-muted-foreground min-w-0 break-words">
                        {e.concepto}
                        {e.aplica_iva === false && (
                          <span className="ml-1 text-[10px]">(sin IVA)</span>
                        )}
                      </span>
                      {/* Renglón MXN: nativo primero, canon USD como hint. */}
                      <span className="font-mono shrink-0">
                        {e.moneda === "MXN" && e.monto_nativo != null ? (
                          <>
                            {fmtMxn(e.monto_nativo)}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              = {fmtUsd(e.monto_usd)}
                            </span>
                          </>
                        ) : (
                          fmtUsd(e.monto_usd)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Desglose canónico para el balance (Jimmy): cajoncito por concepto. */}
          <QuoteDesgloseCard quote={quote} />

          {cobrosVuelo && cobrosVuelo.cobros.length > 0 && (
            <QuoteCobrosCard
              quoteId={quote.id}
              quoteFolio={quote.folio}
              montoTotalUsd={Number(quote.monto_total_usd)}
              totalCobrado={cobrosVuelo.total_cobrado}
              cobros={cobrosVuelo.cobros}
              // Reembolsos: solo roles de oficina.
              puedeReembolsar={me?.rol === "ADMIN" || me?.rol === "COORDINADOR"}
            />
          )}

          {/* Ajuste rápido: extras y pasajeros sin rearmar el cotizador.
              Solo dentro de la ventana de edición (vuelo del mes corriente o
              anterior, hora Cancún): más atrás son cierres pasados.
              CANCELADO queda fuera A PROPÓSITO (1-sep-2026): aunque una
              cancelada ya se puede "Revisar", el ajuste rápido es para
              extras de última hora de vuelos vivos — el camino de una
              cancelada es el cotizador completo (el API también lo rechaza). */}
          {quote.estado !== "CANCELADO" &&
            quote.estado !== "RESERVA" &&
            !quote.cobrado &&
            !quote.facturado &&
            cotizacionEditablePorFecha(quote.fecha_vuelo) && (
              <QuoteQuickAdjustCard quote={quote} />
            )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {quote.tipo === "MULTIESCALA" ? "Itinerario" : "Ruta"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {/* Ruta OPERATIVA (la vuela el piloto): visible aquí mismo,
                    no solo en "Revisar". Es distinta de la comercial cuando
                    el vuelo salió de otra base o lleva ferries. */}
                {(quote.itinerario_operativo === true ||
                  (quote.escalas?.some((e) => e.solo_operativa || e.es_ferry) ??
                    false)) &&
                  (quote.escalas?.length ?? 0) > 0 && (
                    <div className="mb-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                        Ruta operativa (la vuela el piloto — no se cotiza)
                      </p>
                      <ol className="mt-1.5 space-y-1">
                        {[...quote.escalas!]
                          .sort((a, b) => a.orden - b.orden)
                          .map((esc) => (
                            <li key={esc.id} className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-muted-foreground">{esc.orden}.</span>
                              {esc.origen_iata} → {esc.destino_iata}
                              {esc.es_ferry && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                  ferry
                                </Badge>
                              )}
                              {esc.solo_operativa && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-500/40 text-sky-600 dark:text-sky-400">
                                  operativo
                                </Badge>
                              )}
                            </li>
                          ))}
                      </ol>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Abajo está la ruta COMERCIAL (lo que paga el cliente,
                        abre y cierra en CUN). Los tramos se editan en el
                        detalle del vuelo.
                      </p>
                    </div>
                  )}
                {/* Con itinerario OPERATIVO, "Cotizar" NO toca las escalas del
                    piloto (candado a propósito): la ruta COMERCIAL cotizada
                    vive en el snapshot del cálculo. Leer las escalas aquí
                    mostraba la ruta vieja/operativa como si fuera la cotizada. */}
                {quote.itinerario_operativo === true &&
                (quote.calculo_snapshot?.tramos?.length ?? 0) > 0 ? (
                  <>
                    <ol className="space-y-1.5">
                      {quote.calculo_snapshot!.tramos!.map((t) => {
                        // La escala viva de ese orden MANDA (regla del PDF);
                        // sin ella decide el snapshot congelado (sin toggle:
                        // no hay escala que patchear).
                        const viva = escalaVivaPorOrden.get(t.orden);
                        const oculto =
                          viva?.pdf_oculto != null
                            ? viva.pdf_oculto === true
                            : t.pdf_oculto === true;
                        // Fecha del PDF: SOLO de la escala viva (el snapshot
                        // no la conoce); string de pared, sin Date.
                        const pdfFecha = viva?.pdf_fecha ?? null;
                        return (
                          <li
                            key={`${t.orden}-${t.origen}-${t.destino}`}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className={cn("font-mono", oculto && "opacity-60")}>
                              <span className="text-muted-foreground mr-2">{t.orden}.</span>
                              {t.origen} → {t.destino}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-mono text-muted-foreground">
                                {t.millas ? `${fmtDecimal(t.millas)} NM` : "—"}
                              </span>
                              {puedeEditarPdf && viva ? (
                                <QuoteEscalaPdfFecha
                                  quoteId={quote.id}
                                  escalaId={viva.id}
                                  fecha={pdfFecha}
                                  oculto={oculto}
                                />
                              ) : (
                                pdfFecha &&
                                !oculto && (
                                  <span
                                    className="font-mono text-[10px] text-muted-foreground/70"
                                    title="Fecha del tramo en el PDF del cliente (solo PDF)"
                                  >
                                    PDF: {fmtDateOnly(pdfFecha)}
                                  </span>
                                )
                              )}
                              {puedeEditarPdf && viva && (
                                <QuoteEscalaPdfToggle
                                  quoteId={quote.id}
                                  escalaId={viva.id}
                                  oculto={oculto}
                                />
                              )}
                            </span>
                          </li>
                        );
                      })}
                      <li className="pt-2 mt-2 border-t border-border flex items-center justify-between text-xs">
                        <span className="font-semibold">Total</span>
                        <span className="font-mono font-bold">
                          {fmtDecimal(quote.millas_nauticas_one_way)} NM
                        </span>
                      </li>
                    </ol>
                    {notaPdfTramos}
                  </>
                ) : quote.tipo === "MULTIESCALA" && (quote.escalas?.filter((e) => !e.solo_operativa).length ?? 0) > 0 ? (
                  <>
                    <ol className="space-y-1.5">
                      {quote.escalas!.filter((e) => !e.solo_operativa).map((esc) => {
                        const oculto = esc.pdf_oculto === true;
                        const pdfFecha = esc.pdf_fecha ?? null;
                        return (
                          <li
                            key={esc.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className={cn("font-mono", oculto && "opacity-60")}>
                              <span className="text-muted-foreground mr-2">
                                {esc.orden}.
                              </span>
                              {esc.origen_iata} → {esc.destino_iata}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-mono text-muted-foreground">
                                {esc.millas_nauticas
                                  ? `${fmtDecimal(esc.millas_nauticas)} NM`
                                  : "—"}
                              </span>
                              {puedeEditarPdf ? (
                                <QuoteEscalaPdfFecha
                                  quoteId={quote.id}
                                  escalaId={esc.id}
                                  fecha={pdfFecha}
                                  oculto={oculto}
                                />
                              ) : (
                                pdfFecha &&
                                !oculto && (
                                  <span
                                    className="font-mono text-[10px] text-muted-foreground/70"
                                    title="Fecha del tramo en el PDF del cliente (solo PDF)"
                                  >
                                    PDF: {fmtDateOnly(pdfFecha)}
                                  </span>
                                )
                              )}
                              {puedeEditarPdf && (
                                <QuoteEscalaPdfToggle
                                  quoteId={quote.id}
                                  escalaId={esc.id}
                                  oculto={oculto}
                                />
                              )}
                            </span>
                          </li>
                        );
                      })}
                      <li className="pt-2 mt-2 border-t border-border flex items-center justify-between text-xs">
                        <span className="font-semibold">Total</span>
                        <span className="font-mono font-bold">
                          {fmtDecimal(quote.millas_nauticas_one_way)} NM
                        </span>
                      </li>
                    </ol>
                    {notaPdfTramos}
                  </>
                ) : (
                  <>
                    <Row
                      label="Origen → Destino"
                      value={rutaComercial.join(" → ")}
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
                value={
                  quote.metodo_cobro === "OTRO"
                    ? `Otro${quote.metodo_cobro_detalle ? ` — ${quote.metodo_cobro_detalle}` : ""}`
                    : (quote.metodo_cobro ?? "—")
                }
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
                  quote.fecha_traslado_final ? (
                    fmtDateTime(quote.fecha_traslado_final)
                  ) : quote.fecha_fin && quote.fecha_fin !== quote.fecha_vuelo ? (
                    // Sin traslado capturado pero el viaje termina otro día:
                    // fecha_fin la deriva el trigger (GREATEST de los tramos).
                    <>
                      {fmtDateTime(quote.fecha_fin)}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · derivado del itinerario
                      </span>
                    </>
                  ) : (
                    "—"
                  )
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
          {/* Vuelo CUBIERTO por externo: la cotización debe decirlo y mostrar
              los datos del apoyo (operador, costo, margen) sin ir al vuelo. */}
          {quote.es_externo && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="text-sm">Cubierto por operador externo</CardTitle>
                <CardDescription className="text-xs">
                  Otro operador vuela este servicio; VuelaTour cobra al cliente
                  y paga al apoyo. Sin avión propio ni tacómetros; los gastos
                  sí se registran en el vuelo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Operador</span>
                  <span className="font-medium">{quote.operador_externo ?? "—"}</span>
                </div>
                {(quote.avion_externo_modelo || quote.avion_externo_matricula) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Avión</span>
                    <span className="font-mono">
                      {[quote.avion_externo_modelo, quote.avion_externo_matricula]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Lo que cobra el operador externo
                  </span>
                  <span className="font-mono text-right">
                    {Number(quote.costo_externo_usd) > 0
                      ? fmtUsd(Number(quote.costo_externo_usd))
                      : "Sin capturar"}
                    {/* Costo capturado en MXN: el USD es DERIVADO por el API
                        (monto ÷ tc); el nativo se muestra al lado. */}
                    {quote.costo_externo_moneda === "MXN" &&
                      Number(quote.costo_externo_monto) > 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({fmtMxn(Number(quote.costo_externo_monto))}
                          {Number(quote.costo_externo_tc) > 0
                            ? ` · tc ${Number(quote.costo_externo_tc)}`
                            : ""}
                          )
                        </span>
                      )}
                  </span>
                </div>
                {Number(quote.calculo_snapshot?.meta?.total_pactado_usd) > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Precio pactado</span>
                    <span className="font-mono">
                      {fmtUsd(Number(quote.calculo_snapshot!.meta!.total_pactado_usd))}
                    </span>
                  </div>
                )}
                {Number(quote.costo_externo_usd) > 0 && (
                  <div className="flex justify-between gap-2 border-t border-border pt-2">
                    <span className="text-muted-foreground">
                      Margen (total − costo del externo)
                    </span>
                    <span
                      className={
                        Number(quote.monto_total_usd) -
                          Number(quote.costo_externo_usd) >=
                        0
                          ? "font-mono font-semibold text-emerald-600"
                          : "font-mono font-semibold text-destructive"
                      }
                    >
                      {fmtUsd(
                        Number(quote.monto_total_usd) -
                          Number(quote.costo_externo_usd),
                      )}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Antes de IVA/comisiones y otros costos. El operador y su costo
                  se editan en{" "}
                  <Link
                    href={`/admin/flights/${quote.id}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    el vuelo → Editar externo
                  </Link>{" "}
                  (ahí también se regresa a vuelo propio).
                </p>
              </CardContent>
            </Card>
          )}
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
  value: React.ReactNode;
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
