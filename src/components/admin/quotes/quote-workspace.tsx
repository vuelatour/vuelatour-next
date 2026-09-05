"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BoltIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GrupoBadge } from "@/components/admin/grupos/grupo-badge";
import { QuoteActionsBar } from "@/components/admin/quotes/quote-actions-bar";
import {
  QuoteCalculator,
  type AircraftOption,
  type AirportOption,
  type RouteOption,
} from "@/components/admin/quotes/quote-calculator";
import { QuoteCobrosCard } from "@/components/admin/quotes/quote-cobros-card";
import { QuoteEscalaPdfFecha } from "@/components/admin/quotes/quote-escala-pdf-fecha";
import { QuoteEscalaPdfToggle } from "@/components/admin/quotes/quote-escala-pdf-toggle";
import { QuotePresenceIndicator } from "@/components/admin/quotes/quote-presence-indicator";
import { QuoteQuickAdjustCard } from "@/components/admin/quotes/quote-quick-adjust-card";
import { QuoteVersionsTimeline } from "@/components/admin/quotes/quote-versions-timeline";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { candadoRevision, RAZON_REVISION } from "@/lib/admin/quote-revision";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import {
  cotizacionEditablePorFecha,
  fmtDateOnly,
  fmtDateTime,
  TZ_LABEL,
} from "@/lib/datetime";
import { combinadoFolio, type FlightCobro } from "@/types/flights";
import type { VueloConGrupo } from "@/types/grupos";
import type {
  CotizacionVersion,
  PersistedEscala,
  PersistedQuote,
} from "@/types/quotes-persisted";

/**
 * PÁGINA ÚNICA de la cotización (pedido del cliente, 5-sep-2026): una sola
 * cara. La cotización se abre en el formato completo del cotizador en
 * LECTURA y «Revisar» habilita la edición AHÍ MISMO (motivo + Guardar /
 * Cancelar en la barra del total) — sin saltar a otra página donde "se
 * revuelve todo porque cambia el orden de dónde está todo".
 *
 * Lo que vivía solo en el detalle sigue aquí y en el mismo sitio: barra de
 * acciones (PDF, confirmar, cancelar, ver vuelo), presencia, badges de
 * grupo/combinado, AJUSTE RÁPIDO (intacto, prominente en la columna
 * lateral; en pausa mientras se revisa), cobros, historial de versiones,
 * operación (fechas de solicitud/confirmación/cancelación) y los toggles de
 * PDF por tramo (dentro de la sección Tramos del cotizador, en lectura).
 *
 * `?revisar=1` abre directo en edición (links viejos a /revise redirigen
 * aquí); si no se puede revisar, abre en lectura y explica por qué.
 */
export function QuoteWorkspace({
  quote,
  versions,
  clientName,
  clientEsInterno,
  aircraft,
  routes,
  airports,
  cobros,
  totalCobrado,
  rol,
  revisarInicial,
}: {
  quote: PersistedQuote;
  versions: CotizacionVersion[];
  clientName: string | null;
  clientEsInterno: boolean;
  aircraft: AircraftOption[];
  routes: RouteOption[];
  airports: AirportOption[];
  /** Cobros del vuelo (misma entidad); [] en SOLICITUD/COTIZADO. */
  cobros: FlightCobro[];
  totalCobrado: number;
  rol: string | null;
  /** Llegó con `?revisar=1`: intentar abrir en edición. */
  revisarInicial: boolean;
}) {
  const candado = candadoRevision(quote);
  const puedeEditarPdf = rol === "ADMIN" || rol === "COORDINADOR";

  // Modo: lectura (default) o edición en el lugar. Con ?revisar=1 se abre
  // en edición SOLO si los candados lo permiten; si no, lectura + aviso.
  const [editando, setEditando] = useState(
    () => revisarInicial && candado.canRevise,
  );
  const avisoInicialDado = useRef(false);
  useEffect(() => {
    if (avisoInicialDado.current) return;
    avisoInicialDado.current = true;
    if (revisarInicial && !candado.canRevise) {
      toast.warning("La cotización se abre en lectura", {
        description: candado.razon ?? "No se puede revisar en este momento.",
      });
    }
  }, [revisarInicial, candado.canRevise, candado.razon]);

  // Al salir de edición se limpia `?revisar=1` de la URL (sin navegar) para
  // que un F5 no vuelva a abrir el editor.
  useEffect(() => {
    if (editando || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("revisar")) return;
    url.searchParams.delete("revisar");
    window.history.replaceState(null, "", url.toString());
  }, [editando]);

  const entrarAEdicion = () => {
    if (!candado.canRevise) {
      toast.error(candado.razon ?? "No se puede revisar en este momento.");
      return;
    }
    setEditando(true);
  };

  const irAjusteRapido = () => {
    const el = document.getElementById("ajuste-rapido");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => el?.querySelector("input")?.focus(), 400);
  };

  // ===== Derivados de presentación (mismos criterios del detalle anterior) =====
  const quoteConGrupo = quote as PersistedQuote & VueloConGrupo;
  const grupoHijo = grupoDeVuelo(quoteConGrupo);

  // Ruta COMERCIAL completa para el encabezado (2-sep-2026). MISMA
  // precedencia que los tramos rehidratados del cotizador: (a) con
  // itinerario operativo la ruta cotizada vive en el snapshot; (b) si no,
  // las escalas vivas comerciales; (c) fallback al par corto.
  const escalasComerciales = (quote.escalas ?? []).filter(
    (e) => !e.solo_operativa,
  );
  const usaSnapshot =
    quote.itinerario_operativo === true &&
    (quote.calculo_snapshot?.tramos?.length ?? 0) > 0;
  const rutaComercial = usaSnapshot
    ? puntosRuta(quote.calculo_snapshot!.tramos!)
    : escalasComerciales.filter((e) => !e.cancelada_at).length > 0
      ? puntosRuta(
          escalasComerciales
            .filter((e) => !e.cancelada_at)
            .sort((a, b) => a.orden - b.orden)
            .map((e) => ({ origen: e.origen_iata, destino: e.destino_iata })),
        )
      : [quote.origen_iata, quote.destino_iata];

  // Visibilidad/fecha en PDF por tramo: el toggle escribe DIRECTO en la
  // escala VIVA — la misma que manda en el PDF (escalasVisiblesPdf cruza por
  // orden; el snapshot solo decide si no hay escala viva de ese orden).
  const escalaVivaPorOrden = new Map<number, PersistedEscala>();
  for (const esc of quote.escalas ?? []) {
    if (!escalaVivaPorOrden.has(esc.orden)) escalaVivaPorOrden.set(esc.orden, esc);
  }
  /**
   * Toggles por tramo del itinerario COTIZADO (índice = mismo orden que los
   * tramos que rehidrata el cotizador: snapshot.tramos con itinerario
   * operativo; si no, escalas no operativas en su orden).
   */
  const tramoExtraLectura = (idx: number) => {
    // Itinerario operativo SIN snapshot (reserva/solicitud aún no cotizada):
    // el cotizador rehidrata una ruta comercial SUGERIDA (CUN→destino→CUN),
    // no escalas persistidas — no hay escala viva a la que colgar el toggle
    // sin riesgo de patchear la equivocada. Se cotiza primero.
    if (quote.itinerario_operativo === true && !usaSnapshot) return null;
    let escalaId: string | null = null;
    let oculto = false;
    let pdfFecha: string | null = null;
    if (usaSnapshot) {
      const t = quote.calculo_snapshot!.tramos![idx];
      if (!t) return null;
      const viva = escalaVivaPorOrden.get(t.orden);
      oculto =
        viva?.pdf_oculto != null ? viva.pdf_oculto === true : t.pdf_oculto === true;
      pdfFecha = viva?.pdf_fecha ?? null;
      escalaId = viva?.id ?? null;
    } else {
      const esc = escalasComerciales[idx];
      if (!esc) return null;
      oculto = esc.pdf_oculto === true;
      pdfFecha = esc.pdf_fecha ?? null;
      escalaId = esc.id;
    }
    if (puedeEditarPdf && escalaId) {
      return (
        <>
          <QuoteEscalaPdfFecha
            quoteId={quote.id}
            escalaId={escalaId}
            fecha={pdfFecha}
            oculto={oculto}
          />
          <QuoteEscalaPdfToggle
            quoteId={quote.id}
            escalaId={escalaId}
            oculto={oculto}
          />
        </>
      );
    }
    return (
      <>
        {pdfFecha && !oculto && (
          <span
            className="font-mono text-[10px] text-muted-foreground/70"
            title="Fecha del tramo en el PDF del cliente (solo PDF)"
          >
            PDF: {fmtDateOnly(pdfFecha)}
          </span>
        )}
        {oculto && (
          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
            Oculto en el PDF
          </Badge>
        )}
      </>
    );
  };
  const notaTramosLectura = puedeEditarPdf ? (
    <p className="pt-1 text-[10px] text-muted-foreground">
      La fecha es solo para el PDF del cliente (sin hora). No cambia la ruta
      operativa ni las fechas de vuelo; los tramos ocultos no muestran fecha.
      Lo oculto no aparece en el PDF (la numeración se ajusta sola); el
      precio no cambia.
    </p>
  ) : null;

  // Ajuste rápido: extras y pasajeros sin rearmar el cotizador. Solo dentro
  // de la ventana de edición (mes corriente o anterior, hora Cancún).
  // CANCELADO queda fuera A PROPÓSITO (1-sep-2026): el camino de una
  // cancelada es el cotizador completo (el API también lo rechaza).
  const puedeAjusteRapido =
    quote.estado !== "CANCELADO" &&
    quote.estado !== "RESERVA" &&
    !quote.cobrado &&
    !quote.facturado &&
    cotizacionEditablePorFecha(quote.fecha_vuelo);

  return (
    <div className="space-y-6">
      {/* Cabecera compacta: folio, versión, estado, cliente, grupo, acciones. */}
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
              {editando && (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                >
                  Revisando → v{quote.cotizacion_version + 1}
                </Badge>
              )}
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
            {/* Ruta comercial COMPLETA; en rutas largas el texto envuelve. */}
            <p className="text-sm text-muted-foreground mt-1">
              {clientName ?? quote.cliente_id} · {rutaComercial.join(" → ")} ·{" "}
              {quote.pasajeros} {quote.pasajeros === 1 ? "pasajero" : "pasajeros"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <QuoteActionsBar
              quote={quote}
              onRevisar={entrarAEdicion}
              editando={editando}
              onAjusteRapido={puedeAjusteRapido && !editando ? irAjusteRapido : undefined}
            />
          </div>
        </div>
        <div className="mt-3">
          <QuotePresenceIndicator quoteId={quote.id} />
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

      {/* Revisando una CANCELADA (1-sep-2026): la revisión es para efectos
          financieros/documentales — el vuelo NO se reactiva. */}
      {editando && candado.esCancelada && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Vuelo cancelado: editas la cotización para efectos
              financieros/documentales.
            </p>
            <p className="text-muted-foreground">
              En balances la venta sigue siendo lo cobrado y el vuelo NO se
              reactiva: permanece CANCELADO, sus tramos cancelados no reviven
              y la tripulación no recibe avisos.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* Columna principal: el cotizador completo (lectura ⇄ edición). */}
        <div className="min-w-0">
          <QuoteCalculator
            mode="revise"
            aircraft={aircraft}
            routes={routes}
            airports={airports}
            initialQuote={quote}
            clientName={clientName ?? quote.cliente_id}
            clientEsInterno={clientEsInterno}
            lectura={!editando}
            onRevisar={entrarAEdicion}
            revisarBloqueado={candado.razon}
            revisarLabel={candado.label}
            onCancelar={() => setEditando(false)}
            onGuardado={() => setEditando(false)}
            tramoExtraLectura={tramoExtraLectura}
            notaTramosLectura={notaTramosLectura}
          />
        </div>

        {/* Columna lateral: ajuste rápido (arriba, siempre en el mismo
            lugar), cobros, historial, operación. */}
        <aside className="min-w-0 space-y-6">
          {puedeAjusteRapido &&
            (editando ? (
              <Card
                id="ajuste-rapido"
                className="scroll-mt-24 border-t-2 border-t-brand-600/30 opacity-80"
              >
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BoltIcon className="h-4 w-4 text-muted-foreground" />
                    Ajuste rápido · en pausa
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Estás revisando la cotización completa: los extras y
                    pasajeros se editan ahí. Guarda o cancela la revisión para
                    volver a usar el ajuste rápido.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div id="ajuste-rapido" className="scroll-mt-24">
                <QuoteQuickAdjustCard quote={quote} />
              </div>
            ))}

          {cobros.length > 0 && (
            <QuoteCobrosCard
              quoteId={quote.id}
              quoteFolio={quote.folio}
              montoTotalUsd={Number(quote.monto_total_usd)}
              totalCobrado={totalCobrado}
              cobros={cobros}
              // Reembolsos: solo roles de oficina.
              puedeReembolsar={rol === "ADMIN" || rol === "COORDINADOR"}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Historial</CardTitle>
              <CardDescription className="text-xs">
                {versions.length} {versions.length === 1 ? "versión" : "versiones"}. Cada
                revisión (y cada ajuste rápido) genera un nuevo registro inmutable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuoteVersionsTimeline
                versions={versions}
                currentVersion={quote.cotizacion_version}
              />
            </CardContent>
          </Card>

          {/* Operación: lo que no vive en las secciones del cotizador. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Operación</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Cell label="Tipo de vuelo" value={quote.tipo} />
              <Cell label="Fecha solicitud" value={fmtDateTime(quote.fecha_solicitud)} />
              {quote.fecha_confirmacion && (
                <Cell label="Confirmado" value={fmtDateTime(quote.fecha_confirmacion)} />
              )}
              {quote.fecha_cancelacion && (
                <Cell
                  label="Cancelado"
                  value={fmtDateTime(quote.fecha_cancelacion)}
                  hint={quote.motivo_cancelacion ?? undefined}
                />
              )}
              {candado.esCancelada && !editando && candado.canRevise && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  {RAZON_REVISION.cancelada}
                </p>
              )}
              <p className="col-span-2 px-1 pt-1 text-[11px] text-muted-foreground">
                {TZ_LABEL}
              </p>
            </CardContent>
          </Card>
        </aside>
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
