"use client";

import "@/styles/cotizacion-fuente.css";
import "@/styles/cotizacion-interna.css";
import "@/styles/cotizacion-interna-pantalla.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  BANDA_INTERNA,
  MARCA_AGUA_INTERNA,
  SIN_DATO,
  ajustePositivoUsd,
  avionCotizadoTxt,
  avionUtilizadoTxt,
  comisionVendedorCanonicaUsd,
  conceptoCanonico,
  conceptoComisionVendedor,
  diaLargo,
  hayAjuste,
  horasTxt,
  moneyInterno,
  motivoAjuste,
  opComisionVendedor,
  tarifaFicha,
} from "@/lib/admin/quote-sheet-interna";
import { EMPRESA_DEFAULT, TZ_NOTA, fechaLegible } from "@/lib/admin/quote-sheet";
import { tuasMxnSinTc } from "@/lib/admin/tuas";
import { montoExtraActivo } from "@/lib/admin/extras";
import { cn } from "@/lib/utils";
import type { QuoteBreakdown } from "@/types/quote";
import type { CotizacionInterna } from "@/types/quotes-interno";
import {
  CampoFecha,
  CampoNumero,
  CampoSelect,
  CampoTextoLargo,
  UI,
  type CampoSelectOption,
} from "./quote-sheet-fields";
import { DIALECTO_INTERNA, QuoteSheetDesglose } from "./quote-sheet-desglose";
import { QuoteSheetInternaTramos } from "./quote-sheet-interna-tramos";
import { QuoteSheetInternaCobros } from "./quote-sheet-interna-cobros";
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

/**
 * LA HOJA INTERNA como formulario (Fase 2.2 del rediseño del cotizador,
 * 22-sep-2026). Pedido del cliente: «en la página de la cotización
 * cambiaremos el formato de la pantalla para que NO se vea como el PDF de la
 * cotización que se entrega al cliente, más bien que se parezca a la
 * cotización INTERNA, que es la más completa, y podamos manejar gran parte de
 * cómo va evolucionando la cotización en la misma hoja, aprovechando que el
 * formato es igual al que manejaban antes en un Excel».
 *
 * El `<div class="cot-interna">` que ve el operador ES el documento interno:
 * MISMO marcado y clases que `cotizacion_interna_pdf._cuerpo_interno_html`
 * (banda roja, header con folio/versión/estado, tres tarjetas de resumen,
 * ficha en dos columnas, TRAMOS COTIZADOS con las seis columnas del Excel,
 * DESGLOSE + HORAS COTIZADAS, COBROS, notas y pie) y MISMO CSS
 * (`styles/cotizacion-interna.css`, sincronizado con
 * `npm run sync:hoja-interna-css`).
 *
 * DE DÓNDE SALE CADA NÚMERO — y aquí no se calcula ninguno:
 *  - lo que se mueve al teclear (tramos costeados, TUAS, extras, IVA, total
 *    USD/MXN) viene del `breakdown` de `POST /v1/quotes/calculate`;
 *  - lo que es identidad o historia (quién cotizó, piloto/copiloto, avión
 *    utilizado, cobros con su comisión y su «Registró», notas internas) viene
 *    de `GET /v1/quotes/:id/interno`, el MISMO payload que imprime el PDF.
 * Con un API previo, `interno` llega null y esos bloques se pintan vacíos o
 * con «—»: jamás un número inventado.
 *
 * QUÉ SE EDITA EN 2.2: exactamente lo que ya editaba la hoja del cliente —
 * cliente, avión cotizado, pasajeros, fecha del vuelo, itinerario (con las
 * MILLAS por fin en la tabla), extras, descuento, IVA %, T.C. y las notas al
 * cliente. Tarifa, horas, comisión del vendedor, método de cobro, toggles del
 * PDF y operador externo siguen capturándose en el panel «Interno · no se
 * imprime» hasta la Fase 2.3; desde aquí solo se SEÑALAN (`onAbrirInterno`).
 *
 * POR QUÉ LA BANDA ROJA Y LA MARCA DE AGUA (riesgo 8 del diseño): esta
 * pantalla enseña comisiones, costo del operador externo, neto VuelaTour y
 * cobros. Sin una separación inequívoca, alguien acabaría mandándosela al
 * cliente. La marca de agua «INTERNA» es exclusiva de la pantalla; la banda,
 * la misma del papel.
 */
export interface QuoteSheetInternaProps {
  valores: QuoteSheetValores;
  onCambio: OnCambioHoja;
  breakdown: QuoteBreakdown | null;
  /** El motor está calculando: importes atenuados (nunca vacíos). */
  calculando?: boolean;
  errorMotor?: string | null;
  /** Bloqueada (cobrada, facturada…): todo como texto, sin inputs. */
  lectura?: boolean;
  documento: DocumentoHoja;
  catalogos: {
    clientes?: ClienteHoja[];
    aeronaves: AeronaveHoja[];
    aeropuertos: AeropuertoHoja[];
    rutas?: RutaHoja[];
  };
  tramosPdf?: TramoPdfAccesores;
  pasajerosPorTramo?: { max: number } | null;
  totalRespaldo?: { total_usd: number | null; total_mxn: number | null };
  grupo?: { id: string; folio: number | string | null } | null;
  clienteExtra?: ReactNode;
  onAbrirInterno?: OnAbrirInterno;
  /** Payload de `GET /v1/quotes/:id/interno`; null en el alta o con API previo. */
  interno?: CotizacionInterna | null;
  escala?: number;
  papel?: boolean;
  className?: string;
  ids?: { pasajeros?: string; tc?: string };
}

/** Ancho del papel CARTA a 96 dpi (el `@page` del PDF interno es Letter). */
export const HOJA_INTERNA_ANCHO_PX = 816;

export function QuoteSheetInterna({
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
  totalRespaldo,
  grupo,
  clienteExtra,
  onAbrirInterno,
  interno = null,
  escala,
  papel = true,
  className,
  ids,
}: QuoteSheetInternaProps) {
  const b = breakdown;
  const pdf = useMemo<TramoPdfAccesores>(() => tramosPdf ?? {}, [tramosPdf]);

  // ----- Catálogos -----
  const opcionesAeronave = useMemo<CampoSelectOption[]>(
    () =>
      catalogos.aeronaves.map((a) => ({
        value: a.id,
        label: `${a.matricula} — ${a.modelo}`,
        description: a.descripcion,
        descriptionClassName: a.enTaller
          ? "truncate text-amber-600 dark:text-amber-400"
          : undefined,
        disabled: a.disabled,
        // El documento INTERNO siempre enseña la matrícula (no es el cliente).
        textoImpreso: `${a.modelo} · ${a.matricula}`,
      })),
    [catalogos.aeronaves],
  );
  const opcionesCliente = useMemo<CampoSelectOption[]>(
    () => (catalogos.clientes ?? []).map((c) => ({ value: c.id, label: c.nombre, description: c.descripcion })),
    [catalogos.clientes],
  );
  const clienteEditable = !lectura && (catalogos.clientes?.length ?? 0) > 0;
  const clienteNombre =
    documento.clienteNombre ??
    catalogos.clientes?.find((c) => c.id === valores.cliente_id)?.nombre ??
    interno?.cliente ??
    "";

  // ----- Avisos FUERA del papel (idénticos a los de la hoja del cliente) -----
  const tcCapturado = Number(valores.tc_usd_mxn) > 0;
  const mxnSinTc =
    !lectura &&
    !tcCapturado &&
    (tuasMxnSinTc(valores.tuas_lineas, tcCapturado).length > 0 ||
      valores.extras.some((e) => e.moneda === "MXN" && montoExtraActivo(e) > 0));
  const idTc = ids?.tc ?? "tc-usd-mxn-field";
  const idPasajeros = ids?.pasajeros ?? "pasajeros-field";
  const enfocarTc = () => {
    const el = document.getElementById(idTc) as HTMLInputElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };

  // ----- Escala al ancho del contenedor -----
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
    escala ?? (anchoDisponible > 0 ? Math.min(1, anchoDisponible / HOJA_INTERNA_ANCHO_PX) : 1);
  const altoReservado = altoHoja > 0 ? Math.round(altoHoja * escalaEfectiva) : undefined;

  // ----- Cabecera -----
  const empresa = documento.empresa ?? EMPRESA_DEFAULT;
  const folioTxt = documento.folio != null ? `Folio #${documento.folio}` : "Folio s/n";
  const versionTxt = interno?.version != null ? ` · v${interno.version}` : "";
  const estadoTxt = [interno?.estado_label || interno?.estado || "", documento.tipo]
    .filter(Boolean)
    .join(" · ");

  // ----- Resumen: fecha, avión cotizado, ruta -----
  const fechaVueloDia = valores.fecha_vuelo ? valores.fecha_vuelo.slice(0, 10) : null;
  const fechaGrande = diaLargo(fechaVueloDia ?? interno?.fecha_vuelo ?? null) || "Por definir";
  const finDia = valores.fecha_traslado_final ? valores.fecha_traslado_final.slice(0, 10) : null;
  const fechaFin =
    finDia && fechaVueloDia && finDia !== fechaVueloDia ? diaLargo(finDia) : "";
  const aeronaveSel = catalogos.aeronaves.find((a) => a.id === valores.aeronave_id);
  const avionCotizado = avionCotizadoTxt({
    modelo: aeronaveSel?.modelo ?? interno?.aeronave_cotizada_modelo ?? null,
    matricula: aeronaveSel?.matricula ?? interno?.aeronave_cotizada_matricula ?? null,
  });
  const avionUtilizado = avionUtilizadoTxt(interno?.aeronave_utilizada);
  const difiereAvion = interno?.aeronave_cotizada_vs_utilizada_difiere === true;
  const pax = pasajerosPorTramo ? pasajerosPorTramo.max : Number(valores.pasajeros) || 0;
  const rutaTexto =
    valores.escalas.length > 0
      ? [valores.escalas[0]?.origen_iata, ...valores.escalas.map((e) => e.destino_iata)]
          .filter(Boolean)
          .join(" → ")
      : (interno?.ruta ?? SIN_DATO);

  // ----- Ficha -----
  const tarifa = tarifaFicha({
    tipoLabel: interno?.tarifa_tipo_label ?? b?.tarifa.tipo ?? null,
    tarifaUsdHr: b?.tarifa.usd_por_hora ?? interno?.tarifa_hora_usd ?? null,
    preferencial: b?.tarifa.preferencial_cliente === true || interno?.tarifa_preferencial === true,
    override: b?.tarifa.proviene_de_override === true || interno?.tarifa_override === true,
  });
  const marcas: string[] = [];
  if (interno?.cotizacion_abierta) marcas.push("Cotización abierta");
  if (interno?.itinerario_operativo) marcas.push("Itinerario operativo");
  if (interno?.grupo_folio) {
    marcas.push(
      interno.grupo_posicion && interno.grupo_total_aviones
        ? `Grupo ${interno.grupo_folio} · avión ${interno.grupo_posicion} de ${interno.grupo_total_aviones}`
        : `Grupo ${interno.grupo_folio}`,
    );
  } else if (grupo) {
    marcas.push(`Grupo ${grupo.folio ?? ""}`.trim());
  }
  if (interno?.combinado_con_folio) marcas.push(`Combinado con #${interno.combinado_con_folio}`);

  // ----- Desglose: renglones que SOLO existen en el documento interno -----
  const comisionUsd = comisionVendedorCanonicaUsd(b);
  const comisionVendedor =
    comisionUsd != null && Math.abs(comisionUsd) >= 0.005
      ? {
          montoUsd: comisionUsd,
          // El CONCEPTO es el canónico del motor («Comisión del vendedor
          // (Saab) · $50.00/hr × 2.3 hr»), que es lo que imprime el papel;
          // el nombre solo se cuelga si no venía ya dentro.
          concepto: conceptoComisionVendedor(
            conceptoCanonico(b, "COMISION_VENDEDOR"),
            interno?.comision_vendedor_nombre ?? b?.meta.comision_vendedor_nombre ?? null,
          ),
          op: opComisionVendedor({
            modo: interno?.comision_vendedor_modo ?? b?.meta.comision_vendedor_modo ?? null,
            horas: b?.tiempos.cobrable_hr ?? null,
            tarifaHr:
              interno?.comision_vendedor_tarifa_hr ?? b?.meta.comision_vendedor_tarifa_hr ?? null,
            pagoVendedorUsd: interno?.pago_vendedor_usd ?? null,
            conIva: !!interno?.iva_comision_vendedor_usd,
          }),
        }
      : null;
  const ajusteUsd = ajustePositivoUsd(b);
  const ajustePositivo =
    ajusteUsd != null
      ? {
          montoUsd: ajusteUsd,
          // El motor rotula esta línea «Redondeo» (positiva) o «Descuento»
          // (negativa) y el papel imprime ESE texto: inventar «Ajuste» hacía
          // que pantalla y PDF nombraran distinto el mismo renglón.
          concepto: conceptoCanonico(b, "AJUSTE") ?? "Redondeo",
          op:
            interno?.total_pactado_usd != null
              ? `a precio pactado ${moneyInterno(interno.total_pactado_usd)}`
              : "redondeo automático",
        }
      : null;
  const motorTxt = [
    b?.meta.version_motor ? `motor ${b.meta.version_motor}` : "",
    b?.meta.calculado_at ? `calculado ${fechaLegible(b.meta.calculado_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const pieInterno = [
    interno?.generado_cancun
      ? `Documento interno · generado ${interno.generado_cancun} (hora Cancún)`
      : "Documento interno",
    (interno?.generado_por ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("cot-escenario", className)} ref={escenarioRef} data-guard-exempt={lectura ? "" : undefined}>
      {/* Bandas de estado: FUERA del papel, ancho completo, nunca plegables. */}
      {(errorMotor || mxnSinTc) && (
        <div className="mx-auto mb-3 space-y-2" style={{ maxWidth: HOJA_INTERNA_ANCHO_PX }}>
          {errorMotor && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-medium">Error al calcular:</span> {errorMotor}. La hoja
                conserva los últimos montos.
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
                Hay TUAS o extras en MXN sin tipo de cambio: el total aún NO los incluye y no se
                puede guardar.
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
          width: HOJA_INTERNA_ANCHO_PX,
          transform: escalaEfectiva !== 1 ? `scale(${escalaEfectiva})` : undefined,
          marginLeft:
            escalaEfectiva !== 1
              ? Math.max(0, (anchoDisponible - HOJA_INTERNA_ANCHO_PX * escalaEfectiva) / 2)
              : undefined,
          marginRight: escalaEfectiva !== 1 ? 0 : undefined,
          height: altoReservado,
        }}
      >
        <div
          ref={hojaRef}
          className={cn(
            "cot-interna",
            "cot-interna--pantalla",
            papel && "cot-interna--papel",
            calculando && "cot-interna--calculando",
            lectura && "cot-interna--lectura",
          )}
          role="region"
          aria-label="Hoja interna de la cotización (uso exclusivo de oficina)"
        >
          {/* Marca de agua: SOLO pantalla (el papel ya lleva la banda). */}
          <div className="cot-marca-agua" aria-hidden="true" {...UI}>
            <span>{MARCA_AGUA_INTERNA}</span>
          </div>

          {/* 1 · Cabecera */}
          <div className="header">
            <div className="izq">
              {/* eslint-disable-next-line @next/next/no-img-element -- mismo <img class="logo"> del PDF */}
              <img className="logo" src="/cotizacion/logo-vuelatour-blanco.png" alt="" />
              <div>
                <div className="titulo">Cotización interna</div>
                <div className="sub">{empresa}</div>
              </div>
            </div>
            <div className="folio">
              {`${folioTxt}${versionTxt}`}
              <span className="sub">{estadoTxt}</span>
            </div>
          </div>
          <div className="banda">{BANDA_INTERNA}</div>

          {/* 2 · Tres tarjetas de resumen */}
          <table className="resumen">
            <tbody>
              <tr>
                <td className="fecha">
                  <div className="lbl">Fecha del vuelo</div>
                  <div className="big">
                    <CampoFecha
                      value={valores.fecha_vuelo ?? ""}
                      onChange={(v) => onCambio("fecha_vuelo", v)}
                      ariaLabel="Fecha del vuelo"
                      lectura={lectura}
                      vacio="Por definir"
                      texto={fechaGrande}
                    />
                  </div>
                  {fechaFin && <div className="sub">{`al ${fechaFin}`}</div>}
                  {/* La HORA es dato operativo: se captura aquí y NO se
                      imprime (ni el PDF del cliente ni el interno la llevan). */}
                  {!lectura && (
                    <div className="sub" {...UI}>
                      <span className="cot-tenue">Regreso: </span>
                      <CampoFecha
                        value={valores.fecha_traslado_final ?? ""}
                        onChange={(v) => onCambio("fecha_traslado_final", v)}
                        ariaLabel="Regreso del vuelo"
                        vacio="por confirmar"
                      />
                    </div>
                  )}
                </td>
                <td>
                  <div className="lbl">Avión cotizado</div>
                  <div className="med">
                    <CampoSelect
                      options={opcionesAeronave}
                      value={valores.aeronave_id}
                      onChange={(v) => onCambio("aeronave_id", v)}
                      placeholder="Selecciona aeronave"
                      searchPlaceholder="Buscar aeronave…"
                      ariaLabel="Aeronave cotizada"
                      title="Con este avión se pactó el precio. Cambiarlo recotiza."
                      lectura={lectura}
                      textoFallback={avionCotizado}
                    />
                  </div>
                  {avionUtilizado && (
                    <div className={cn("sub", difiereAvion && "ambar")}>
                      {`Avión utilizado: ${avionUtilizado}`}
                      {difiereAvion && <span className="tag ambar">Distinto al cotizado</span>}
                    </div>
                  )}
                </td>
                <td>
                  <div className="lbl">Ruta cotizada</div>
                  <div className="med">
                    {rutaTexto}
                    <span className="op">
                      {" · "}
                      {lectura || pasajerosPorTramo ? (
                        `${pax} ${pax === 1 ? "pasajero" : "pasajeros"}`
                      ) : (
                        <>
                          <CampoNumero
                            id={idPasajeros}
                            value={Number(valores.pasajeros) > 0 ? Number(valores.pasajeros) : null}
                            onChange={(n) => onCambio("pasajeros", n ?? 0)}
                            formato={(n) => String(n)}
                            placeholder="0"
                            ariaLabel="Pasajeros"
                            title={
                              aeronaveSel?.asientos
                                ? `Máx. ${aeronaveSel.asientos} (${aeronaveSel.modelo})`
                                : undefined
                            }
                            entero
                            min={0}
                            max={aeronaveSel?.asientos || undefined}
                            minCh={1}
                          />
                          {` ${pax === 1 ? "pasajero" : "pasajeros"}`}
                        </>
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 3 · Ficha en dos columnas */}
          <table className="cols">
            <tbody>
              <tr>
                <td className="col">
                  <table className="kv">
                    <tbody>
                      <tr>
                        <td className="k">Cliente</td>
                        <td className="v cot-ancla">
                          {clienteEditable ? (
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
                          ) : (
                            clienteNombre || SIN_DATO
                          )}
                          {interno?.es_broker && <span className="tag">Broker</span>}
                          {interno?.es_interno && <span className="tag ambar">Cliente interno</span>}
                          {clienteExtra && !lectura && (
                            <span className="cot-acciones" {...UI}>
                              {" "}
                              <span className="cot-sep">·</span>
                              {clienteExtra}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="k">Razón social</td>
                        <td className="v">
                          {interno?.razon_social || SIN_DATO}
                          {interno?.cliente_rfc && (
                            <span className="op">{` RFC ${interno.cliente_rfc}`}</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="k">Tarifa</td>
                        <td className="v">
                          {tarifa.texto}
                          {tarifa.marcas && <span className="op">{` ${tarifa.marcas}`}</span>}
                          {!lectura && onAbrirInterno && (
                            <span className="cot-acciones" {...UI}>
                              {" "}
                              <span className="cot-sep">·</span>
                              <button
                                type="button"
                                className="cot-liga"
                                data-guard-exempt
                                onClick={() => onAbrirInterno("tarifa")}
                                title="La tarifa por hora se ajusta en Interno › Tarifa y horas"
                              >
                                ajustar
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td className="col">
                  <table className="kv">
                    <tbody>
                      <tr>
                        <td className="k">Vendedor</td>
                        <td className="v">
                          {interno?.vendedor || SIN_DATO}
                          {interno?.cotizado_por && (
                            <span className="op">{` cotizó ${interno.cotizado_por}`}</span>
                          )}
                        </td>
                      </tr>
                      {(interno?.piloto || interno?.copiloto) && (
                        <tr>
                          <td className="k">Piloto</td>
                          <td className="v">
                            {interno?.piloto || SIN_DATO}
                            {interno?.copiloto && ` · copiloto ${interno.copiloto}`}
                          </td>
                        </tr>
                      )}
                      {marcas.length > 0 && (
                        <tr>
                          <td className="k">Marcas</td>
                          <td className="v">
                            {marcas.map((m) => (
                              <span key={m} className="tag">
                                {m}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )}
                      <tr className="small">
                        <td className="k">Cotizada</td>
                        <td className="v">
                          {fechaLegible(documento.fechaCotizacion)}
                          {interno?.fecha_confirmacion &&
                            ` · confirmada ${fechaLegible(interno.fecha_confirmacion)}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 4 · Tramos cotizados (la tabla del Excel) */}
          <QuoteSheetInternaTramos
            legs={valores.escalas}
            onLegsChange={(legs) => onCambio("escalas", legs)}
            aeropuertos={catalogos.aeropuertos}
            rutas={catalogos.rutas}
            lectura={lectura}
            pdf={pdf}
            breakdown={b}
            interno={interno}
            onAbrirInterno={lectura ? undefined : onAbrirInterno}
          />

          {/* 5 · Desglose (58 %) + Horas cotizadas (42 %) */}
          <table className="cols desglose bloque">
            <tbody>
              <tr>
                <td className="col">
                  <QuoteSheetDesglose
                    breakdown={b}
                    valores={valores}
                    onCambio={onCambio}
                    lectura={lectura}
                    totalRespaldo={totalRespaldo}
                    grupo={grupo}
                    idTc={idTc}
                    onAbrirInterno={lectura ? undefined : onAbrirInterno}
                    dialecto={{
                      ...DIALECTO_INTERNA,
                      pie: motorTxt ? (
                        <tr key="motor" className="cot-fila">
                          <td colSpan={2} className="muted">
                            {motorTxt}
                          </td>
                        </tr>
                      ) : undefined,
                    }}
                    comisionVendedor={comisionVendedor}
                    ajustePositivo={ajustePositivo}
                  />
                </td>
                <td className="col">
                  <HorasCotizadas
                    breakdown={b}
                    interno={interno}
                    lectura={lectura}
                    onAbrirInterno={onAbrirInterno}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 6 · Cobros */}
          <QuoteSheetInternaCobros interno={interno} />

          {/* 7 · NOTAS. El documento interno solo imprime las INTERNAS (las
              del cliente son del otro documento), así que el papel lleva
              exactamente el bloque del PDF y las notas al cliente se capturan
              en un bloque de CROMA (`data-cot-ui`, solo en edición): se
              editan aquí porque aquí se edita todo, pero no se imprimen en
              esta hoja. Las internas se editan en el panel hasta la Fase 2.3. */}
          {interno?.notas_internas && (
            <div className="bloque">
              <h2>Notas internas</h2>
              <div className="notas-txt">{interno.notas_internas}</div>
            </div>
          )}
          {!lectura && (
            <div className="bloque" {...UI}>
              <h2>Notas al cliente 🖨</h2>
              <div className="notas-txt">
                <CampoTextoLargo
                  value={valores.notas}
                  onChange={(v) => onCambio("notas", v)}
                  placeholder="Notas para el cliente (salen en SU PDF, no en esta hoja). Ej. Sujeto a slot en CUN…"
                  ariaLabel="Notas visibles en el PDF"
                />
              </div>
            </div>
          )}

          {/* 8 · Pie. En el PDF vive en `@page` (no en el cuerpo), así que en
              pantalla es croma: `data-cot-ui` para que la comparación con el
              documento de pyservices no lo cuente. */}
          <div className="pie-pantalla" {...UI}>
            {pieInterno}
            <br />
            {TZ_NOTA}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HORAS COTIZADAS — réplica de `_horas_html`: vuelo + calzos + sobrevuelo →
 * cotizadas → cobrables → tarifa. La fila «Cobrables» carga el MOTIVO y el
 * IMPORTE del ajuste («Horas pactadas 1.75 h: +$165.00 sobre Σ tramos»): sin
 * eso, en 6 de cada 10 cotizaciones la tabla de tramos cerraría en «TOTAL Σ
 * tramos» y el desglose en «Servicio aéreo» sin nada que los concilie
 * (riesgo 1 del diseño).
 *
 * Las horas NO se editan aquí en la Fase 2.2: el sobrevuelo y el cobrable
 * pactado siguen en «Interno › Tarifa y horas», y desde esta fila se llega
 * con un clic.
 */
function HorasCotizadas({
  breakdown: b,
  interno,
  lectura,
  onAbrirInterno,
}: {
  breakdown: QuoteBreakdown | null;
  interno: CotizacionInterna | null;
  lectura: boolean;
  onAbrirInterno?: OnAbrirInterno;
}) {
  const vuelo = b?.tiempos.vuelo_hr ?? interno?.vuelo_hr ?? null;
  const calzos = b?.tiempos.calzos_hr ?? interno?.calzos_hr ?? null;
  const sobrevuelo = b?.tiempos.sobrevuelo_hr ?? interno?.sobrevuelo_hr ?? null;
  const cotizadas = interno?.horas_cotizadas_hr ?? null;
  const cobrable = b?.tiempos.cobrable_hr ?? interno?.tiempo_cobrable_hr ?? null;
  const tarifaHr = b?.tarifa.usd_por_hora ?? interno?.tarifa_hora_usd ?? null;

  const notas: string[] = [];
  if (b?.tiempos.minimo_hora_aplicado || interno?.hora_minima_aplicada) {
    notas.push("hora mínima aplicada");
  }
  if (b?.tiempos.cobrable_proviene_de_override || interno?.cobrable_override) {
    notas.push("cobrable manual");
  }
  const ajuste = b?.tramos_ajuste_usd ?? null;
  if (hayAjuste(ajuste)) {
    const signo = (ajuste as number) > 0 ? "+" : "−";
    notas.push(
      `${motivoAjuste(b?.tramos_ajuste_motivo)}: ${signo}${moneyInterno(Math.abs(ajuste as number))} sobre Σ tramos`,
    );
  }

  const filas: ReactNode[] = [];
  const fila = (k: string, v: ReactNode, key: string) => (
    <tr key={key}>
      <td className="k">{k}</td>
      <td className="v">{v}</td>
    </tr>
  );
  if (vuelo) filas.push(fila("Vuelo", horasTxt(vuelo), "vuelo"));
  if (calzos) filas.push(fila("Calzos", horasTxt(calzos), "calzos"));
  if (sobrevuelo) {
    filas.push(
      fila(
        "Sobrevuelo",
        <>
          {horasTxt(sobrevuelo)}
          {!lectura && onAbrirInterno && (
            <span className="cot-acciones" {...UI}>
              {" "}
              <span className="cot-sep">·</span>
              <button
                type="button"
                className="cot-liga"
                data-guard-exempt
                onClick={() => onAbrirInterno("sobrevuelo")}
                title="El sobrevuelo se captura en Interno › Tarifa y horas"
              >
                ajustar
              </button>
            </span>
          )}
        </>,
        "sobrevuelo",
      ),
    );
  }
  if (cotizadas != null) filas.push(fila("Cotizadas", horasTxt(cotizadas), "cotizadas"));
  if (cobrable != null) {
    filas.push(
      fila(
        "Cobrables",
        <>
          <b>{horasTxt(cobrable)}</b>
          {notas.length > 0 && <span className="op">{` ${notas.join(" · ")}`}</span>}
          {!lectura && onAbrirInterno && (
            <span className="cot-acciones" {...UI}>
              {" "}
              <span className="cot-sep">·</span>
              <button
                type="button"
                className="cot-liga"
                data-guard-exempt
                onClick={() => onAbrirInterno("cobrable")}
                title="Las horas cobrables se pactan en Interno › Tarifa y horas"
              >
                pactar horas
              </button>
            </span>
          )}
        </>,
        "cobrables",
      ),
    );
  }
  if (tarifaHr != null) filas.push(fila("Tarifa", `${moneyInterno(tarifaHr)}/hr`, "tarifa"));
  if (filas.length === 0) return null;

  return (
    <>
      <h2>Horas cotizadas</h2>
      <table className="kv">
        <tbody>{filas}</tbody>
      </table>
    </>
  );
}
