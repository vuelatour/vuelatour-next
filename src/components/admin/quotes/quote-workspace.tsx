"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
  type EstadoEdicionCotizador,
  type RouteOption,
} from "@/components/admin/quotes/quote-calculator";
import { QuoteCobrosCard } from "@/components/admin/quotes/quote-cobros-card";
import { CobroFormSheet } from "@/components/admin/flights/cobro-form-sheet";
import { QuoteEscalaPdfFecha } from "@/components/admin/quotes/quote-escala-pdf-fecha";
import { QuoteEscalaPdfToggle } from "@/components/admin/quotes/quote-escala-pdf-toggle";
import { QuotePresenceIndicator } from "@/components/admin/quotes/quote-presence-indicator";
import { QuoteVersionsTimeline } from "@/components/admin/quotes/quote-versions-timeline";
import type { EscalaPdfPreview } from "@/hooks/use-quote-preview-html";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { aeronavesDeCotizacion } from "@/lib/admin/avion-cotizado";
import { estadoCobroSemaforo, pendienteCobro } from "@/lib/admin/cobros";
import { candadoRevision, RAZON_REVISION } from "@/lib/admin/quote-revision";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import { fmtDateOnly, fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import { combinadoFolio, type FlightCobro } from "@/types/flights";
import type { VueloConGrupo } from "@/types/grupos";
import type {
  CotizacionVersion,
  PersistedEscala,
  PersistedQuote,
} from "@/types/quotes-persisted";

/**
 * PÁGINA ÚNICA de la cotización (5-sep-2026) con EDICIÓN DIRECTA (F0,
 * 8-sep-2026): el documento se abre EDITABLE si `candadoRevision` lo permite
 * — ya no existe «Revisar» ni motivo de entrada. Sin cambios reales no pasa
 * nada (se pinta el snapshot, cero llamadas al motor); al primer cambio la
 * cabecera muestra «v2 → v3 ●» y aparecen Descartar / Guardar → v3 (barra
 * del total y barra de acciones). Guardar pide el motivo (chip + texto) en
 * un diálogo y crea la versión. Bloqueada (cobrada, facturada, mes cerrado,
 * servicio): lectura con 🔒, la razón en la barra del total y «Copiar como
 * nueva cotización».
 *
 * Lo demás sigue aquí: barra de acciones (PDF, confirmar, cancelar, ver
 * vuelo), presencia, badges de grupo/combinado y, DEBAJO de la hoja,
 * cobros, historial y operación. Los toggles de PDF por tramo van al margen
 * de la fila del itinerario de la hoja (`tramoExtra`, también en edición).
 * Ensamble form-as-document (8-sep-2026): la hoja 1 editable ES la vista
 * previa; el panel «Interno · no se imprime» colapsable va a su derecha. La card «Ajuste rápido» se retiró (F3,
 * D2): pasajeros y extras se editan en el documento; el botón de la barra
 * solo lleva al campo de pasajeros.
 *
 * `?revisar=1` (links viejos a /revise) ya no activa nada: se limpia de la
 * URL. El documento se abre editable si el candado lo permite, y si no, la
 * razón se lee en la barra del total.
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
  tcOficial = null,
  tcOficialFecha = null,
  paywiseComisionPct,
}: {
  quote: PersistedQuote;
  versions: CotizacionVersion[];
  clientName: string | null;
  clientEsInterno: boolean;
  aircraft: AircraftOption[];
  routes: RouteOption[];
  airports: AirportOption[];
  /** Cobros del vuelo (misma entidad); [] si el snapshot no cargó. */
  cobros: FlightCobro[];
  totalCobrado: number;
  rol: string | null;
  /** TC oficial de referencia del día de la cotización (respaldo al cobrar
      en MXN cuando la cotización no fijó TC) y su día. */
  tcOficial?: number | null;
  tcOficialFecha?: string | null;
  /** Comisión % sugerida para cobros Paywise (config del sistema). */
  paywiseComisionPct?: number;
}) {
  // Espejo del candado D3 del API: un anticipo parcial (neto > 0) o un cobro
  // MXN sin TC también congelan la edición, no solo la bandera `cobrado`.
  const cobrosInfo = {
    totalCobrado,
    cobrosSinTc: cobros.filter(
      (c) => c.moneda === "MXN" && !c.tc_usd_mxn && !quote.tc_usd_mxn,
    ).length,
  };
  const candado = candadoRevision(quote, cobrosInfo);
  const puedeEditarPdf = rol === "ADMIN" || rol === "COORDINADOR";

  // ---- COBROS junto al total (pedido del cliente 9-sep-2026) ----
  // Registrar: mismos roles que POST /v1/flights/:id/payments en oficina.
  // En SOLICITUD aún no hay precio que cobrar; cancelado registra el cargo
  // por cancelación (sin noción de pendiente, regla 28-ago).
  const puedeRegistrarCobro =
    (rol === "ADMIN" || rol === "COORDINADOR" || rol === "FACTURACION") &&
    quote.estado !== "SOLICITUD";
  const [cobroOpen, setCobroOpen] = useState(false);
  const montoTotalUsd = Number(quote.monto_total_usd) || 0;
  const vueloCancelado = quote.estado === "CANCELADO";
  const pendienteUsd = vueloCancelado ? 0 : pendienteCobro(montoTotalUsd, totalCobrado);
  const semaforoCobro = estadoCobroSemaforo({
    montoTotalUsd,
    cobrado: quote.cobrado,
    totalCobradoUsd: totalCobrado,
    sinTcCount: cobrosInfo.cobrosSinTc,
    cotizacionAbierta: quote.cotizacion_abierta === true,
    enCotizacion: quote.estado === "SOLICITUD" || quote.estado === "COTIZADO",
    cancelado: vueloCancelado,
    esInterno: clientEsInterno,
  });
  const registrarTitle = vueloCancelado
    ? "Vuelo cancelado: registra el cargo por cancelación o el anticipo retenido"
    : "Al registrar un cobro la cotización queda bloqueada para edición";
  const abrirCobro = puedeRegistrarCobro ? () => setCobroOpen(true) : undefined;
  // Edición directa: editable desde el primer render si el candado lo permite.
  const editable = candado.canRevise;

  // Estado de edición que reporta el cotizador (sucio, resumen, acciones).
  const [edicion, setEdicion] = useState<EstadoEdicionCotizador | null>(null);
  const sucio = edicion?.sucio === true;
  const soloPresentacion = sucio && edicion?.soloPresentacion === true;
  // `?revisar=1` (links viejos a /revise, F3): ya no activa nada — solo se
  // limpia de la URL para que favoritos/correos viejos no la arrastren.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("revisar")) return;
    url.searchParams.delete("revisar");
    window.history.replaceState(null, "", url.toString());
  }, []);

  // «Ajuste rápido» de la barra (D2): scroll+focus a los pasajeros del
  // documento (extras y pasajeros se editan ahí y se guardan como versión).
  // Si el cotizador aún no reporta su estado, se va directo al campo.
  const irAjusteRapido = () => {
    if (edicion) {
      edicion.enfocarPasajeros();
      return;
    }
    // En la hoja `pasajeros-field` ES el input invisible (no un contenedor).
    const el = document.getElementById("pasajeros-field");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const ctl = el instanceof HTMLInputElement ? el : el?.querySelector("input");
      ctl?.focus();
    }, 400);
  };

  // CONFIRMADO/RESERVA con tripulación: el primer cambio pide confirmación.
  const requiereConfirmacionEdicion =
    (quote.estado === "CONFIRMADO" || quote.estado === "RESERVA") &&
    !!quote.piloto_id;

  // ===== Derivados de presentación (mismos criterios del detalle anterior) =====
  // Aeronave COTIZADA (modelo del snapshot) vs UTILIZADA (la asignada hoy):
  // control interno, tolera que el API aún no mande los campos nuevos.
  const aeronaves = aeronavesDeCotizacion(quote, aircraft);
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
  /**
   * Ojito/fecha por tramo para la VISTA PREVIA (F1): misma fuente y mismo
   * orden que `tramoExtraLectura` (escala viva manda; snapshot de respaldo).
   * El cotizador solo lo manda en tramos que siguen coincidiendo.
   */
  const escalasPdfPreview: EscalaPdfPreview[] = (() => {
    if (quote.itinerario_operativo === true && !usaSnapshot) return [];
    if (usaSnapshot) {
      return quote.calculo_snapshot!.tramos!.map((t, idx) => {
        const viva = escalaVivaPorOrden.get(t.orden);
        return {
          orden: idx + 1,
          pdf_oculto:
            viva?.pdf_oculto != null ? viva.pdf_oculto === true : t.pdf_oculto === true,
          pdf_fecha: viva?.pdf_fecha ?? null,
        };
      });
    }
    return escalasComerciales.map((esc, idx) => ({
      orden: idx + 1,
      pdf_oculto: esc.pdf_oculto === true,
      pdf_fecha: esc.pdf_fecha ?? null,
    }));
  })();
  const notaTramosLectura = puedeEditarPdf ? (
    <p className="pt-1 text-[10px] text-muted-foreground">
      La fecha es solo para el PDF del cliente (sin hora). No cambia la ruta
      operativa ni las fechas de vuelo; los tramos ocultos no muestran fecha.
      Lo oculto no aparece en el PDF (la numeración se ajusta sola); el
      precio no cambia.
    </p>
  ) : null;

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
              {sucio ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/15 font-mono text-amber-700 dark:text-amber-400"
                  title={
                    soloPresentacion
                      ? `${edicion?.resumen || "Presentación del PDF"} · se guarda sin versión nueva`
                      : edicion?.resumen || "Cambios sin guardar"
                  }
                >
                  {soloPresentacion
                    ? `v${quote.cotizacion_version} · PDF ●`
                    : `v${quote.cotizacion_version} → v${quote.cotizacion_version + 1} ●`}
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-mono">
                  v{quote.cotizacion_version}
                </Badge>
              )}
              {!editable && (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground"
                  title={candado.razon ?? undefined}
                >
                  🔒 Bloqueada
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
              cobrosInfo={cobrosInfo}
              edicion={
                editable
                  ? {
                      sucio,
                      soloPresentacion,
                      canSave: edicion?.canSave === true,
                      saving: edicion?.saving === true,
                      versionSiguiente: quote.cotizacion_version + 1,
                      onGuardar: () => edicion?.guardar(),
                      onDescartar: () => edicion?.descartar(),
                    }
                  : undefined
              }
              // «Ajuste rápido» (D2): atajo al campo de pasajeros del documento;
              // solo tiene sentido si el documento se puede editar.
              onAjusteRapido={editable ? irAjusteRapido : undefined}
              rol={rol}
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

      {/* CANCELADA editable (1-sep-2026 / F0): banda gris — la edición es
          para efectos financieros/documentales; el vuelo NO se reactiva. */}
      {editable && candado.esCancelada && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">
              Vuelo cancelado: los cambios son para efectos financieros/documentales.
            </p>
            <p className="text-muted-foreground">
              No revive tramos ni notifica a la tripulación; en balances la
              venta sigue siendo lo cobrado y el vuelo permanece CANCELADO.
            </p>
          </div>
        </div>
      )}

      {/* La hoja 1 (papel claro sobre el fondo del shell) con el panel
          «Interno · no se imprime» colapsable a su derecha: los pinta el
          cotizador. Cobros, historial y operación van DEBAJO de la hoja
          (ensamble form-as-document, 8-sep-2026). */}
      <QuoteCalculator
        mode="revise"
        aircraft={aircraft}
        routes={routes}
        airports={airports}
        initialQuote={quote}
        clientName={clientName ?? quote.cliente_id}
        clientEsInterno={clientEsInterno}
        bloqueadoRazon={editable ? null : candado.razon}
        requiereConfirmacionEdicion={requiereConfirmacionEdicion}
        onEstadoEdicion={setEdicion}
        // El cotizador ya hace router.refresh() tras guardar; aquí no hay
        // modo que cerrar (la edición es directa).
        onGuardado={() => undefined}
        tramoExtra={tramoExtraLectura}
        notaTramos={notaTramosLectura}
        escalasPdf={escalasPdfPreview}
        cobro={{
          totalCobradoUsd: totalCobrado,
          pendienteUsd,
          semaforo: semaforoCobro,
          onRegistrar: abrirCobro,
          registrarTitle,
        }}
      />

      {/* El MISMO formulario de cobro del detalle del vuelo (cotización =
          vuelo, misma fila). Tras guardar, router.refresh() rehidrata los
          cobros y el candado de edición. */}
      <CobroFormSheet
        open={cobroOpen}
        onOpenChange={setCobroOpen}
        flightId={quote.id}
        flightFolio={quote.folio}
        montoTotalUsd={montoTotalUsd}
        pendingUsd={pendienteUsd}
        cancelado={vueloCancelado}
        tcCotizacion={quote.tc_usd_mxn != null ? Number(quote.tc_usd_mxn) : null}
        tcOficial={tcOficial}
        tcOficialFecha={tcOficialFecha}
        paywiseComisionPct={paywiseComisionPct}
      />

      {/* Debajo de la hoja: cobros (SIEMPRE, también con 0), historial y
          operación. Nada de cobros dentro del papel. */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <QuoteCobrosCard
            quoteId={quote.id}
            quoteFolio={quote.folio}
            montoTotalUsd={montoTotalUsd}
            totalCobrado={totalCobrado}
            cobros={cobros}
            // Reembolsos: solo roles de oficina.
            puedeReembolsar={rol === "ADMIN" || rol === "COORDINADOR"}
            onRegistrar={abrirCobro}
            registrarTitle={registrarTitle}
          />
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm">Historial</CardTitle>
            <CardDescription className="text-xs">
              {versions.length} {versions.length === 1 ? "versión" : "versiones"}. Cada
              guardado con cambios de precio genera un registro inmutable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuoteVersionsTimeline
              versions={versions}
              currentVersion={quote.cotizacion_version}
            />
          </CardContent>
        </Card>

        {/* Operación: lo que no vive en la hoja ni en el panel interno. */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm">Operación</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {/* Control interno (11-sep-2026): con qué avión se PACTÓ el
                precio vs. cuál opera hoy. El PDF del cliente no cambia. */}
            <Cell
              label="Aeronave cotizada"
              value={aeronaves.cotizada ?? "—"}
              hint="Modelo del snapshot vigente: con él se pactó el precio."
            />
            <Cell
              label="Aeronave utilizada"
              value={
                aeronaves.utilizada ? (
                  <span className={aeronaves.difieren ? "text-amber-600 dark:text-amber-400" : ""}>
                    {aeronaves.utilizada}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin asignar</span>
                )
              }
              hint={
                aeronaves.difieren
                  ? "Opera en un avión distinto al cotizado: el precio NO cambia solo."
                  : "La que tiene asignada el vuelo hoy."
              }
            />
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
            {candado.esCancelada && candado.canRevise && !sucio && (
              <p className="col-span-2 text-[11px] text-muted-foreground">
                {RAZON_REVISION.cancelada}
              </p>
            )}
            <p className="col-span-2 px-1 pt-1 text-[11px] text-muted-foreground">
              {TZ_LABEL}
            </p>
          </CardContent>
        </Card>
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
