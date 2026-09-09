"use client";

import "@/styles/cotizacion-fuente.css";
import "@/styles/cotizacion-hoja.css";
import "@/styles/cotizacion-hoja-pantalla.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useQuoteMapaSvg, type MapaEstado } from "@/hooks/use-quote-mapa-svg";
import {
  CLASE_RAIZ_HOJA,
  EMPRESA_DEFAULT,
  HOJA_ANCHO_PX,
  TZ_NOTA,
  avionExternoTexto,
  fechaLegible,
  fechasTrasladoImpresas,
  modelosCotizadosPdf,
  mostrarMatricula,
  puntosRutaVisibles,
  rutaFontSize,
  tramosParaMapa,
  tramosVisibles,
} from "@/lib/admin/quote-sheet";
import { tuasMxnSinTc } from "@/lib/admin/tuas";
import { montoExtraActivo } from "@/lib/admin/extras";
import { cn } from "@/lib/utils";
import type { EscalaInput, QuoteBreakdown } from "@/types/quote";
import { CampoFecha, CampoNumero, CampoSelect, CampoTextoLargo, UI, type CampoSelectOption } from "./quote-sheet-fields";
import { QuoteSheetItinerario } from "./quote-sheet-itinerario";
import { QuoteSheetDesglose } from "./quote-sheet-desglose";
import type {
  AeronaveHoja,
  AeropuertoHoja,
  ClienteHoja,
  DocumentoHoja,
  OnAbrirInterno,
  OnCambioHoja,
  QuoteSheetValores,
  RutaHoja,
  TramoPdfAccesores,
} from "./quote-sheet-types";

export type {
  QuoteSheetValores,
  OnCambioHoja,
  DocumentoHoja,
  TramoPdfAccesores,
  DestinoInterno,
  OnAbrirInterno,
} from "./quote-sheet-types";

/**
 * LA HOJA 1 como formulario (form-as-document, aprobado por el cliente el
 * 8-sep-2026): el `<div class="cot-hoja">` que ve el operador ES la hoja 1
 * que verá el cliente — mismo marcado y clases que `_build_html` de
 * pyservices, mismo CSS (`styles/cotizacion-hoja.css` sincronizado), misma
 * fuente (Arimo incrustada) y el mismo mapa (`POST /api/quotes/mapa-svg`).
 * Cada campo se edita en el lugar exacto donde se imprime; los inputs son
 * invisibles en reposo. Nada fuera del papel excepto la croma de edición en
 * los márgenes y las bandas de estado (error del motor, MXN sin T.C.).
 *
 * La hoja NO conoce react-hook-form ni al motor: recibe `valores` (subconjunto
 * del form) + `onCambio`, el `breakdown` fresco de `/calculate` (todo el
 * dinero viene de ahí) y los catálogos. El cotizador la monta en lugar de
 * las secciones cabecera/ruta/traslados/itinerario/desglose/notas y conserva
 * intactos su debounce a `/calculate`, el diff, Guardar vN, candados y el
 * bloque «Interno · no se imprime».
 *
 * Marcado de la hoja 1 (contrato con pyservices; entre [] lo condicional):
 * marca · header · meta · route + sublínea · TRASLADOS · ITINERARIO (+mapa)
 * · DESGLOSE · [notas] · pie. La hoja 2 («La aeronave», fotos) queda solo en
 * el PDF descargado.
 */
export interface QuoteSheetProps {
  valores: QuoteSheetValores;
  onCambio: OnCambioHoja;
  breakdown: QuoteBreakdown | null;
  /** El motor está calculando: totales atenuados (nunca vacíos). */
  calculando?: boolean;
  /** Error del motor: banda fuera del papel. */
  errorMotor?: string | null;
  /** Bloqueada (cobrada, facturada…): todo como texto, sin inputs. */
  lectura?: boolean;
  documento: DocumentoHoja;
  catalogos: {
    /** Alta: selector de cliente. Omitido/vacío + `documento.clienteNombre` = texto. */
    clientes?: ClienteHoja[];
    aeronaves: AeronaveHoja[];
    aeropuertos: AeropuertoHoja[];
    rutas?: RutaHoja[];
  };
  /** Ojito/fecha del PDF por tramo (alta: form; revisión: escala viva). */
  tramosPdf?: TramoPdfAccesores;
  /** Pasajeros definidos POR TRAMO: el global se pinta derivado (máximo). */
  pasajerosPorTramo?: { max: number } | null;
  /**
   * Mapa ya resuelto: undefined = pedirlo al API (debounce 500 ms, caché);
   * string = usarlo tal cual (p. ej. `extraerMapaSvgDeHtml` de la vista
   * previa con el form limpio); null = sin mapa.
   */
  mapaSvg?: string | null;
  /** false = no pedir el mapa (hoja oculta). */
  mapaActivo?: boolean;
  /** Lectura sin breakdown (snapshot viejo): totales persistidos. */
  totalRespaldo?: { total_usd: number | null; total_mxn: number | null };
  grupo?: { id: string; folio: number | string | null } | null;
  /** Croma junto al cliente (alta: «+ nuevo cliente» · «corregir nombre»), en la línea del campo. */
  clienteExtra?: ReactNode;
  /**
   * Abre «Interno · no se imprime › Tarifa y horas» (feedback 9-sep-2026:
   * «¿dónde se ajusta la hora volada por tramo y la tarifa por hora?»). La
   * hoja NO edita tarifa ni horas — solo las señala: «· ajustar» junto a
   * «Servicio aéreo» y «Pactar horas» en el detalle ⋯ del tramo. Sin la
   * prop (o en lectura) esa croma no se pinta.
   */
  onAbrirInterno?: OnAbrirInterno;
  /** Escala fija (1 = tamaño natural); por default se ajusta al ancho del contenedor. */
  escala?: number;
  /** Fondo/sombra (true por default). */
  papel?: boolean;
  className?: string;
  ids?: { pasajeros?: string; tc?: string };
}

export function QuoteSheet({
  valores,
  onCambio,
  breakdown,
  calculando = false,
  errorMotor = null,
  lectura = false,
  documento,
  catalogos,
  tramosPdf,
  pasajerosPorTramo = null,
  mapaSvg,
  mapaActivo = true,
  totalRespaldo,
  grupo,
  clienteExtra,
  onAbrirInterno,
  escala,
  papel = true,
  className,
  ids,
}: QuoteSheetProps) {
  const pdf = useMemo<TramoPdfAccesores>(() => tramosPdf ?? {}, [tramosPdf]);
  const oculto = useMemo(
    () => pdf.oculto ?? ((_: number, l: EscalaInput) => l.pdf_oculto === true),
    [pdf.oculto],
  );

  // ----- Ruta grande y sublínea -----
  const visibles = useMemo(() => tramosVisibles(valores.escalas, oculto), [valores.escalas, oculto]);
  const puntos = useMemo(() => puntosRutaVisibles(visibles), [visibles]);
  const rutaTexto = puntos.join(" → ");
  const ruteFont = rutaFontSize(Math.max(1, puntos.length));
  const pax = pasajerosPorTramo ? pasajerosPorTramo.max : Number(valores.pasajeros) || 0;
  const externo = avionExternoTexto(valores.es_externo, valores.avion_externo_modelo, valores.avion_externo_matricula);
  const matricula = documento.matricula ?? breakdown?.aeronave.matricula ?? null;
  const sublineaExtra = externo ? ` · ${externo}` : mostrarMatricula(matricula) ? ` · ${matricula}` : "";

  // ----- Aeronave cotizada (modelo, jamás matrícula; misma limpieza que
  // `_modelos_cotizados`: sin repetidos ni textos con la matrícula) -----
  const aeronaveSel = catalogos.aeronaves.find((a) => a.id === valores.aeronave_id);
  const modelosApi = modelosCotizadosPdf(documento.modelosCotizados ?? [], matricula);
  const modelos =
    modelosApi.length > 0
      ? modelosApi
      : modelosCotizadosPdf([aeronaveSel?.modelo ?? breakdown?.aeronave.modelo ?? null], matricula);
  const modeloTexto = modelos.join(" · ");
  const opcionesAeronave = useMemo<CampoSelectOption[]>(
    () =>
      catalogos.aeronaves.map((a) => ({
        value: a.id,
        label: `${a.matricula} — ${a.modelo}`,
        description: a.descripcion,
        disabled: a.disabled,
        textoImpreso: a.modelo,
      })),
    [catalogos.aeronaves],
  );
  const opcionesCliente = useMemo<CampoSelectOption[]>(
    () => (catalogos.clientes ?? []).map((c) => ({ value: c.id, label: c.nombre, description: c.descripcion })),
    [catalogos.clientes],
  );
  const clienteEditable = !lectura && (catalogos.clientes?.length ?? 0) > 0;
  const clienteNombre =
    documento.clienteNombre ?? catalogos.clientes?.find((c) => c.id === valores.cliente_id)?.nombre ?? "";

  // ----- Mapa (mismo dibujo del PDF) -----
  const tramosMapa = useMemo(() => tramosParaMapa(valores.escalas, oculto), [valores.escalas, oculto]);
  const mapa = useQuoteMapaSvg({ tramos: tramosMapa, activo: mapaActivo && !lectura, svgFijo: mapaSvg });
  const mapaHoja: { svg: string | null; estado: MapaEstado; error: string | null } = lectura
    ? { svg: mapaSvg ?? null, estado: mapaSvg ? "al_dia" : "sin_mapa", error: null }
    : mapa;

  // ----- Avisos fuera del papel -----
  const tcCapturado = Number(valores.tc_usd_mxn) > 0;
  const mxnSinTc =
    !lectura &&
    !tcCapturado &&
    (tuasMxnSinTc(valores.tuas_lineas, tcCapturado).length > 0 ||
      valores.extras.some((e) => e.moneda === "MXN" && montoExtraActivo(e) > 0));
  const idTc = ids?.tc ?? "tc-usd-mxn-field";
  const enfocarTc = () => {
    const el = document.getElementById(idTc) as HTMLInputElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };

  // ----- Escala al ancho del contenedor (columna angosta) -----
  const escenarioRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  const [altoHoja, setAltoHoja] = useState(0);
  useEffect(() => {
    const esc = escenarioRef.current;
    const hoja = hojaRef.current;
    if (!esc || !hoja || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      setAnchoDisponible(esc.clientWidth);
      setAltoHoja(hoja.offsetHeight);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(esc);
    ro.observe(hoja);
    return () => ro.disconnect();
  }, []);
  const escalaEfectiva =
    escala ?? (anchoDisponible > 0 ? Math.min(1, anchoDisponible / HOJA_ANCHO_PX) : 1);
  const altoReservado = altoHoja > 0 ? Math.round(altoHoja * escalaEfectiva) : undefined;

  // ----- Traslados como los imprime el PDF (primer/último tramo oculto →
  // salida del primer/último VISIBLE; ver `fechasTrasladoImpresas`) -----
  const traslados = useMemo(() => fechasTrasladoImpresas(valores, oculto), [valores, oculto]);

  const notasVacias = valores.notas.trim() === "";
  const empresa = documento.empresa ?? EMPRESA_DEFAULT;
  const idPasajeros = ids?.pasajeros ?? "pasajeros-field";

  return (
    <div className={cn("cot-escenario", className)} ref={escenarioRef} data-guard-exempt={lectura ? "" : undefined}>
      {/* Bandas de estado: FUERA del papel. */}
      {(errorMotor || mxnSinTc) && (
        <div className="mx-auto mb-3 space-y-2" style={{ maxWidth: HOJA_ANCHO_PX }}>
          {errorMotor && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-medium">Error al calcular:</span> {errorMotor}. La hoja conserva los últimos
                montos.
              </p>
            </div>
          )}
          {mxnSinTc && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
            >
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">
                Hay TUAS o extras en MXN sin tipo de cambio: el total aún NO los incluye y no se puede guardar.
              </p>
              <button type="button" onClick={enfocarTc} className="font-medium underline underline-offset-2">
                Capturar T.C.
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="cot-escenario__lienzo"
        style={{
          width: HOJA_ANCHO_PX,
          transform: escalaEfectiva !== 1 ? `scale(${escalaEfectiva})` : undefined,
          marginLeft: escalaEfectiva !== 1 ? Math.max(0, (anchoDisponible - HOJA_ANCHO_PX * escalaEfectiva) / 2) : undefined,
          marginRight: escalaEfectiva !== 1 ? 0 : undefined,
          height: altoReservado,
        }}
      >
        <div
          ref={hojaRef}
          className={cn(
            CLASE_RAIZ_HOJA,
            "cot-hoja--pantalla",
            papel && "cot-hoja--papel",
            calculando && "cot-hoja--calculando",
            lectura && "cot-hoja--lectura",
          )}
          role="region"
          aria-label="Hoja 1 de la cotización (lo que verá el cliente)"
        >
          {/* 1 · Membrete (marca de agua + header) */}
          <div className="marca">
            {/* eslint-disable-next-line @next/next/no-img-element -- mismo <img> del PDF (fidelidad del marcado) */}
            <img src="/cotizacion/logo-vuelatour.png" alt="" />
          </div>
          <div className="header">
            {/* eslint-disable-next-line @next/next/no-img-element -- mismo <img class="logo"> del PDF */}
            <img className="logo" src="/cotizacion/logo-vuelatour-blanco.png" alt="" />
            <div className="titulos">
              <h1>{empresa}</h1>
              <p>Cotización de servicio aéreo</p>
            </div>
          </div>

          {/* 2 · Meta */}
          <div className="meta">
            <div className="cot-ancla">
              {/* Textos como UNA sola cadena: React separa nodos de texto
                  adyacentes con comentarios y «#1042» dejaría de ser contiguo. */}
              <strong>Folio:</strong>
              {` #${documento.folio ?? ""}`}
              {documento.folio == null && !lectura && (
                <span className="cot-tenue" {...UI}>
                  por asignar
                </span>
              )}
              <br />
              <strong>Cliente:</strong>
              {clienteEditable ? (
                <>
                  {" "}
                  <CampoSelect
                    options={opcionesCliente}
                    value={valores.cliente_id}
                    onChange={(v) => onCambio("cliente_id", v)}
                    placeholder="Selecciona cliente"
                    searchPlaceholder="Buscar cliente…"
                    emptyText="Sin clientes activos"
                    ariaLabel="Cliente"
                    textoFallback={clienteNombre}
                  />
                </>
              ) : (
                ` ${clienteNombre}`
              )}
              {clienteExtra && !lectura && (
                // EN LA LÍNEA del campo, a la derecha de «Selecciona cliente»
                // y separadas por «·»: en el margen izquierdo del papel
                // (74 px) los enlaces se salían de la hoja y no se veían.
                <span className="cot-acciones" {...UI}>
                  {/* Espacio real = oportunidad de salto antes del «·» (nombre largo). */}
                  {" "}
                  <span className="cot-sep">·</span>
                  {clienteExtra}
                </span>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <strong>Fecha de cotización:</strong>
              {` ${fechaLegible(documento.fechaCotizacion)}`}
              <br />
              <strong>Tipo:</strong>
              {` ${documento.tipo}`}
              {!externo && (modeloTexto || !lectura) && (
                modeloTexto ? (
                  <>
                    <br />
                    <strong>{`${modelos.length > 1 ? "Aeronaves cotizadas" : "Aeronave cotizada"}:`}</strong>
                    {modelos.length > 1 || lectura ? (
                      ` ${modeloTexto}`
                    ) : (
                      <>
                        {" "}
                      <CampoSelect
                        options={opcionesAeronave}
                        value={valores.aeronave_id}
                        onChange={(v) => onCambio("aeronave_id", v)}
                        placeholder="Selecciona aeronave"
                        searchPlaceholder="Buscar aeronave…"
                        ariaLabel="Aeronave cotizada (el cliente ve el modelo, nunca la matrícula)"
                        title="El cliente ve el MODELO, nunca la matrícula"
                        textoFallback={modeloTexto}
                      />
                      </>
                    )}
                  </>
                ) : (
                  <span {...UI}>
                    <br />
                    <strong className="cot-tenue">Aeronave cotizada:</strong>{" "}
                    <CampoSelect
                      options={opcionesAeronave}
                      value={valores.aeronave_id}
                      onChange={(v) => onCambio("aeronave_id", v)}
                      placeholder="Selecciona aeronave"
                      searchPlaceholder="Buscar aeronave…"
                      ariaLabel="Aeronave cotizada (el cliente ve el modelo, nunca la matrícula)"
                    />
                  </span>
                )
              )}
            </div>
          </div>

          {/* 3 · Ruta grande + sublínea */}
          <div className={cn("route", !rutaTexto && "cot-route--vacia")} style={{ fontSize: ruteFont }}>
            {rutaTexto || (lectura ? "" : "Sin ruta — captura los tramos en el itinerario")}
          </div>
          <div
            style={{ fontSize: 13, color: "#374151" }}
            title={pasajerosPorTramo ? "Pasajeros definidos por tramo: se editan en el detalle (⋯) de cada tramo" : undefined}
          >
            {lectura || pasajerosPorTramo ? (
              `${pax}${pax === 1 ? " pasajero" : " pasajeros"}${sublineaExtra}`
            ) : (
              <>
                <CampoNumero
                  id={idPasajeros}
                  value={Number(valores.pasajeros) > 0 ? Number(valores.pasajeros) : null}
                  onChange={(n) => onCambio("pasajeros", n ?? 0)}
                  formato={(n) => String(n)}
                  placeholder="0"
                  ariaLabel="Pasajeros"
                  title={aeronaveSel?.asientos ? `Máx. ${aeronaveSel.asientos} (${aeronaveSel.modelo})` : undefined}
                  entero
                  min={0}
                  max={aeronaveSel?.asientos || undefined}
                  minCh={1}
                />
                {`${pax === 1 ? " pasajero" : " pasajeros"}${sublineaExtra}`}
              </>
            )}
          </div>

          {/* 4 · Traslados */}
          <h2>Traslados</h2>
          <table className="grid">
            <tbody>
              <tr>
                <td>Traslado inicial</td>
                <td className="cot-ancla">
                  {traslados.inicial.tramoIdx == null ? (
                    <CampoFecha
                      value={valores.fecha_vuelo ?? ""}
                      onChange={(v) => onCambio("fecha_vuelo", v)}
                      ariaLabel="Traslado inicial"
                      lectura={lectura}
                    />
                  ) : (
                    <>
                      {traslados.inicial.texto}
                      {!lectura && <MarcaTrasladoDerivado tramo={traslados.inicial.tramoIdx} primero />}
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <td>Traslado final</td>
                <td className="cot-ancla">
                  {traslados.final.tramoIdx == null ? (
                    <CampoFecha
                      value={valores.fecha_traslado_final ?? ""}
                      onChange={(v) => onCambio("fecha_traslado_final", v)}
                      ariaLabel="Traslado final"
                      lectura={lectura}
                    />
                  ) : (
                    <>
                      {traslados.final.texto}
                      {!lectura && <MarcaTrasladoDerivado tramo={traslados.final.tramoIdx} />}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 5 · Itinerario + mapa */}
          <QuoteSheetItinerario
            legs={valores.escalas}
            onLegsChange={(legs) => onCambio("escalas", legs)}
            aeropuertos={catalogos.aeropuertos}
            rutas={catalogos.rutas}
            lectura={lectura}
            pdf={pdf}
            mostrarItinerario={valores.pdf_mostrar_itinerario !== false}
            mapa={mapaHoja}
            tramos={breakdown?.tramos ?? null}
            onAbrirInterno={lectura ? undefined : onAbrirInterno}
          />

          {/* 6 · Desglose */}
          <QuoteSheetDesglose
            breakdown={breakdown}
            valores={valores}
            onCambio={onCambio}
            lectura={lectura}
            totalRespaldo={totalRespaldo}
            grupo={grupo}
            idTc={idTc}
            onAbrirInterno={lectura ? undefined : onAbrirInterno}
          />

          {/* 7 · Notas (solo si hay texto; fantasma para capturar) */}
          {(!notasVacias || !lectura) && (
            <div className={cn("notas", notasVacias && "cot-fantasma-bloque")} {...(notasVacias ? UI : {})}>
              <strong>Notas:</strong>
              {lectura ? (
                ` ${valores.notas}`
              ) : (
                <>
                  {" "}
              <CampoTextoLargo
                value={valores.notas}
                onChange={(v) => onCambio("notas", v)}
                placeholder="Notas para el cliente (opcional). Ej. Sujeto a slot en CUN…"
                ariaLabel="Notas visibles en el PDF"
              />
                </>
              )}
            </div>
          )}

          {/* 8 · Pie de la hoja 1 (en el PDF vive en @page :first) */}
          <div className="pie-pantalla">
            {TZ_NOTA}
            <br />
            Gracias por volar con VuelaTour, Aero Charter Cancún.
            <br />
            www.vuelatour.com
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Marca del margen cuando la fecha de traslado impresa NO es la del vuelo
 * sino la salida del primer/último tramo VISIBLE (el real está oculto en el
 * PDF): se edita en el detalle «⋯» de ese tramo, no aquí.
 */
function MarcaTrasladoDerivado({ tramo, primero = false }: { tramo: number; primero?: boolean }) {
  return (
    <span className="cot-margen" {...UI}>
      <span
        className="cot-marca"
        title={`El ${primero ? "primer" : "último"} tramo está oculto en el PDF: se imprime la salida planeada del tramo ${
          tramo + 1
        } (edítala en el detalle ⋯ de ese tramo).`}
      >
        del tramo {tramo + 1}
      </span>
    </span>
  );
}
