"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EllipsisHorizontalIcon, LockClosedIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EXTRAS_SUGERIDOS } from "@/components/admin/quotes/extras-editor";
import { cantidadEfectiva, esExtraDeGrupo, extraUsaUnitario } from "@/lib/admin/extras";
import { folioTexto } from "@/lib/admin/grupos-ui";
import {
  descuentoImpresoUsd,
  esExtraSintetizado,
  etiquetaExtra,
  moneyPdf,
  montoExtraImpreso,
  numero2,
  numeroG,
  piezasConceptoTua,
  porcentajeEntero,
  servicioAereoImpresoUsd,
  subtotalSinIvaUsd,
  tuasDetalleLegado,
} from "@/lib/admin/quote-sheet";
import { upsertTuaLinea } from "@/lib/admin/tuas";
import { cn } from "@/lib/utils";
import type { ExtraConcepto, QuoteBreakdown, TuaLinea, TuasAeropuerto, TuasFila } from "@/types/quote";
import {
  CampoHoja,
  CampoNumero,
  DetalleFila,
  UI,
  enfocarPorAriaLabel,
  enterCierra,
  posicionBajoAncla,
  useCerrarFuera,
  useFocoPopover,
} from "./quote-sheet-fields";
import type { OnAbrirInterno, OnCambioHoja, QuoteSheetValores } from "./quote-sheet-types";

/** Tooltip del atajo «ajustar» junto a «Servicio aéreo» (tarifa y horas NO se editan en la hoja). */
const TITULO_AJUSTAR_TARIFA = "Tarifa por hora y horas cobrables se ajustan en Interno › Tarifa y horas";

/**
 * DESGLOSE de la hoja editable (form-as-document, 8-sep-2026): la MISMA
 * `<table class="totales">` del PDF, fila por fila y en el mismo orden
 * (Servicio aéreo · TUAS · extras · Viáticos · Descuento · Subtotal · IVA ·
 * Total · Total MXN), donde lo editable se captura en su posición final:
 * el unitario de cada TUA dentro de su concepto, concepto/monto/moneda de
 * cada extra, el descuento, el % de IVA en su etiqueta y el T.C. en la línea
 * «Total MXN». TODOS los montos vienen del breakdown de `/calculate`; aquí
 * solo se pintan en su celda `.val` (`moneyPdf` = `_money` del armador).
 *
 * Filas FANTASMA (`data-cot-ui`, no se imprimen): descuento en 0, TUA
 * exenta (con «capturar»), Total MXN sin T.C., «+ Agregar concepto».
 */
export interface QuoteSheetDesgloseProps {
  breakdown: QuoteBreakdown | null;
  valores: Pick<
    QuoteSheetValores,
    | "tuas_lineas"
    | "cobrar_tuas"
    | "extras"
    | "descuento_usd"
    | "iva_pct_override"
    | "tc_usd_mxn"
    | "pdf_mostrar_tarifa"
    | "pasajeros"
  >;
  onCambio: OnCambioHoja;
  lectura: boolean;
  moneda?: string;
  /** Lectura sin breakdown (snapshot de un motor viejo): totales persistidos. */
  totalRespaldo?: { total_usd: number | null; total_mxn: number | null };
  /** Liga del hijo con su grupo (extras `origen='GRUPO'` bloqueados). */
  grupo?: { id: string; folio: number | string | null } | null;
  /** id DOM del input de T.C. (ancla `tc-usd-mxn-field` del cotizador). */
  idTc?: string;
  /**
   * Atajo a «Interno › Tarifa y horas» junto a «Servicio aéreo» (feedback
   * 9-sep-2026). Solo en edición; sin la prop no se pinta.
   */
  onAbrirInterno?: OnAbrirInterno;
}

export function QuoteSheetDesglose({
  breakdown,
  valores,
  onCambio,
  lectura,
  moneda = "USD",
  totalRespaldo,
  grupo,
  idTc = "tc-usd-mxn-field",
  onAbrirInterno,
}: QuoteSheetDesgloseProps) {
  const b = breakdown;
  const val = (n: number | null | undefined) => (n == null ? "—" : moneyPdf(n));

  // ----- Servicio aéreo (derivado; etiqueta con horas × tarifa solo si el toggle lo pide) -----
  const servicio = servicioAereoImpresoUsd(b);
  const conTarifa =
    valores.pdf_mostrar_tarifa &&
    !!b &&
    Number(b.tiempos.cobrable_hr) > 0 &&
    Number(b.tarifa.usd_por_hora) > 0;
  const etiquetaServicio = conTarifa
    ? `Servicio aéreo (${numeroG(b!.tiempos.cobrable_hr)} h × ${moneyPdf(b!.tarifa.usd_por_hora)}/hr)`
    : "Servicio aéreo";
  // Atajo «ajustar» (croma, no se imprime): si la etiqueta impresa ya trae
  // «(h × $/hr)» —toggle «mostrar tarifa» encendido— o no hay cálculo, solo
  // «ajustar»; si no, antepone las horas × tarifa del breakdown para que el
  // operador VEA con qué se está cobrando el servicio aéreo.
  const textoAjustar =
    conTarifa || !b
      ? "ajustar"
      : `${numero2(b.tiempos.cobrable_hr)} h × ${moneyPdf(b.tarifa.usd_por_hora)}/hr · ajustar`;

  // ----- TUAS por aeropuerto -----
  const filas: TuasFila[] = b?.tuas.filas ?? [];
  // Snapshot LEGADO sin `filas`: el PDF imprime los conceptos TUAS del
  // desglose canónico; aquí van como texto (sin unitario editable).
  const detalleLegado = tuasDetalleLegado(b);
  const tuasConTotal = filas.length > 1 || detalleLegado.length > 1;
  const lineaPorIata = useMemo(
    () => new Map((valores.tuas_lineas ?? []).map((l) => [l.iata, l])),
    [valores.tuas_lineas],
  );
  const setTua = (iata: string, monto: number | null, mon: "USD" | "MXN") =>
    onCambio("tuas_lineas", upsertTuaLinea(valores.tuas_lineas, iata, monto, mon));
  // Aeropuertos del itinerario SIN fila contable (exentos / en $0): fantasma.
  const aeropuertosSinFila: TuasAeropuerto[] = (() => {
    if (!b || lectura) return [];
    const lista =
      b.tuas.aeropuertos ??
      [b.tuas.origen, ...(b.tuas.intermedios ?? []), b.tuas.destino].filter(Boolean);
    const conFila = new Set(filas.map((f) => f.iata));
    const vistos = new Set<string>();
    return lista.filter((a) => {
      if (!a || conFila.has(a.iata) || vistos.has(a.iata)) return false;
      vistos.add(a.iata);
      return true;
    });
  })();

  // ----- Extras -----
  const extras = valores.extras ?? [];
  const setExtras = (next: ExtraConcepto[]) => onCambio("extras", next);
  const updateExtra = (idx: number, patch: Partial<ExtraConcepto>) => {
    const next = [...extras];
    next[idx] = { ...next[idx], ...patch };
    setExtras(next);
  };
  const addExtra = (concepto = "") => {
    setExtras([...extras, { concepto, monto_usd: 0, moneda: "USD", aplica_iva: true }]);
    // Sugerido (concepto ya escrito) → al monto; en blanco → al concepto.
    enfocarPorAriaLabel(concepto ? `Monto del extra ${extras.length + 1} (USD)` : `Concepto del extra ${extras.length + 1}`);
  };
  const removeExtra = (idx: number) => setExtras(extras.filter((_, i) => i !== idx));
  // Extras sintetizados por el motor (comisión BillPocket) tras los capturados.
  const sintetizados = (b?.extras ?? []).filter(esExtraSintetizado);
  // Popover de un extra: el ancla es el «⋯» que lo abrió (llega con el evento).
  const [detalle, setDetalle] = useState<{ idx: number; ancla: HTMLButtonElement } | null>(null);
  const detalleExtra = detalle?.idx ?? null;

  // ----- Descuento, IVA, T.C. -----
  const descuentoCapturado = Number(valores.descuento_usd) || 0;
  const descuentoImpreso = b ? descuentoImpresoUsd(b) : descuentoCapturado;
  const filaDescuentoImpresa = lectura ? descuentoImpreso > 0 : descuentoCapturado > 0 || descuentoImpreso > 0;
  const ivaPctMotor = b ? Math.round(b.iva.porcentaje * 10000) / 100 : null;
  const ivaOverridePct =
    valores.iva_pct_override != null ? Math.round(Number(valores.iva_pct_override) * 10000) / 100 : null;
  const ivaPctMostrado = ivaOverridePct ?? ivaPctMotor;
  const totalUsd = b ? Number(b.totales.total_usd) : (totalRespaldo?.total_usd ?? null);
  const totalMxn = b ? (b.totales.total_mxn ?? null) : (totalRespaldo?.total_mxn ?? null);
  const tc = Number(valores.tc_usd_mxn) > 0 ? Number(valores.tc_usd_mxn) : null;
  const filaMxnImpresa = totalMxn != null;

  return (
    <>
      <h2>Desglose</h2>
      <table className="totales">
        <tbody>
          {/* Servicio aéreo. La etiqueta impresa NO cambia; en edición, EN
              LA LÍNEA (`.cot-acciones`, como «+ nuevo cliente»: en el margen
              izquierdo —74 px— «1.60 h × $650.00/hr · ajustar» se saldría
              del papel y en el derecho caería sobre el monto) va el atajo a
              Interno › Tarifa y horas, donde SÍ se ajustan tarifa y horas. */}
          <tr className="cot-fila">
            <td className="lbl">
              {etiquetaServicio}
              {!lectura && onAbrirInterno && (
                <span className="cot-acciones" {...UI}>
                  {/* Espacio real = oportunidad de salto antes del «·». */}
                  {" "}
                  <span className="cot-sep">·</span>
                  <button
                    type="button"
                    className="cot-liga"
                    data-guard-exempt
                    onClick={() => onAbrirInterno("tarifa")}
                    title={TITULO_AJUSTAR_TARIFA}
                    aria-label={`${textoAjustar} — ${TITULO_AJUSTAR_TARIFA}`}
                  >
                    {textoAjustar}
                  </button>
                </span>
              )}
            </td>
            <td className="val">{val(servicio)}</td>
          </tr>

          {/* TUAS: sin filas → línea única; una → su concepto; varias → detalle + total */}
          {filas.length === 0 && detalleLegado.length === 0 && (
            <tr className="cot-fila">
              <td className="lbl cot-ancla">
                TUAS
                {!lectura && !valores.cobrar_tuas && (
                  <span className="cot-margen" {...UI}>
                    <span className="cot-marca" title="Switch «Se cobran TUAS» apagado (Interno)">
                      no se cobran
                    </span>
                  </span>
                )}
              </td>
              <td className="val">{val(b ? b.tuas.total_usd : null)}</td>
            </tr>
          )}
          {filas.length === 0 &&
            detalleLegado.map((concepto, i) => (
              <tr key={`leg-${i}`} className="cot-fila">
                <td className="lbl">{concepto}</td>
                <td className="val">{detalleLegado.length === 1 ? val(b!.tuas.total_usd) : ""}</td>
              </tr>
            ))}
          {filas.map((f) => (
            <FilaTua
              key={f.iata}
              fila={f}
              linea={lineaPorIata.get(f.iata)}
              lectura={lectura}
              disabled={!valores.cobrar_tuas}
              onChange={setTua}
              valor={filas.length === 1 ? val(b!.tuas.total_usd) : ""}
            />
          ))}
          {tuasConTotal && (
            <tr className="cot-fila">
              <td className="lbl">TUAS (total)</td>
              <td className="val">{val(b!.tuas.total_usd)}</td>
            </tr>
          )}
          {aeropuertosSinFila.map((a) => (
            <FilaTuaExenta
              key={a.iata}
              air={a}
              linea={lineaPorIata.get(a.iata)}
              paxGlobal={b?.tuas.pasajeros ?? (Number(valores.pasajeros) || 0)}
              disabled={!valores.cobrar_tuas}
              onChange={setTua}
            />
          ))}

          {/* Extras capturados */}
          {extras.map((e, idx) => {
            const bloqueado = esExtraDeGrupo(e);
            const unitario = extraUsaUnitario(e);
            const impreso = montoExtraImpreso(e, idx, b);
            const soloLectura = lectura || bloqueado;
            const cantidad = cantidadEfectiva(e, Number(valores.pasajeros) > 0 ? Number(valores.pasajeros) : null);
            if (lectura) {
              // Texto EXACTO del PDF (`ExtraPdf`): "{concepto}[ · $X MXN]" + monto USD.
              return (
                <tr key={idx} className="cot-fila">
                  <td className="lbl">
                    {etiquetaExtra({
                      concepto: e.concepto,
                      moneda: e.moneda,
                      monto_nativo: impreso.monto_nativo ?? undefined,
                    })}
                  </td>
                  <td className="val">{val(impreso.monto_usd)}</td>
                </tr>
              );
            }
            return (
              <tr key={idx} className="cot-fila">
                <td className="lbl cot-ancla">
                  <CampoHoja
                    value={e.concepto}
                    onChange={(v) => updateExtra(idx, { concepto: v })}
                    placeholder="Concepto"
                    ariaLabel={`Concepto del extra ${idx + 1}`}
                    lectura={soloLectura}
                    minCh={8}
                  />
                  {e.moneda === "MXN" && (
                    <>
                      {" · $"}
                      {unitario ? (
                        numero2(impreso.monto_nativo ?? 0)
                      ) : (
                        <CampoNumero
                          value={Number(e.monto_usd) || 0}
                          onChange={(n) => updateExtra(idx, { monto_usd: n ?? 0 })}
                          formato={numero2}
                          ariaLabel={`Monto en pesos del extra ${idx + 1}`}
                          lectura={soloLectura}
                          min={0}
                          minCh={4}
                        />
                      )}
                      {" MXN"}
                    </>
                  )}
                  {!lectura && (
                    <span className="cot-margen" {...UI}>
                      {bloqueado ? (
                        <span className="cot-marca" title={`Se edita desde el grupo ${grupo ? folioTexto(grupo.folio) : ""}`}>
                          <LockClosedIcon /> grupo
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="cot-margen__accion cot-margen__accion--peligro"
                            onClick={() => removeExtra(idx)}
                            aria-label={`Quitar extra ${e.concepto || idx + 1}`}
                            title="Quitar concepto"
                          >
                            <TrashIcon />
                          </button>
                          <button
                            type="button"
                            className="cot-margen__accion"
                            onClick={(ev) => {
                              const ancla = ev.currentTarget;
                              setDetalle((v) => (v?.idx === idx ? null : { idx, ancla }));
                            }}
                            aria-expanded={detalleExtra === idx}
                            aria-label={`Detalle del extra ${e.concepto || idx + 1} (cantidad × precio, moneda, IVA)`}
                            title="Cantidad × precio · moneda · IVA"
                          >
                            <EllipsisHorizontalIcon />
                          </button>
                        </>
                      )}
                      {unitario && (
                        <span className="cot-marca" style={{ textTransform: "none" }} title="Cantidad × precio unitario (el motor deriva el monto)">
                          {e.por_persona ? `${cantidad ?? "?"}p` : (cantidad ?? "?")} × {numero2(e.unitario ?? 0)}
                        </span>
                      )}
                      {e.aplica_iva === false && (
                        <span className="cot-marca" title="Fuera de la base de IVA">
                          sin IVA
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="val">
                  {e.moneda === "MXN" || unitario ? (
                    val(b ? impreso.monto_usd : e.moneda === "MXN" ? null : impreso.monto_usd)
                  ) : (
                    <>
                      $
                      <CampoNumero
                        value={Number(e.monto_usd) || 0}
                        onChange={(n) => updateExtra(idx, { monto_usd: n ?? 0 })}
                        formato={numero2}
                        ariaLabel={`Monto del extra ${idx + 1} (USD)`}
                        lectura={soloLectura}
                        min={0}
                        minCh={4}
                      />
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {sintetizados.map((e, i) => (
            <tr key={`sint-${i}`} className="cot-fila">
              <td className="lbl">{e.concepto}</td>
              <td className="val">{moneyPdf(e.monto_usd)}</td>
            </tr>
          ))}
          {!lectura && (
            <tr className="cot-fila cot-fila-agregar" {...UI}>
              <td className="lbl" colSpan={2}>
                <button type="button" className="cot-btn" onClick={() => addExtra("")}>
                  + Agregar concepto
                </button>
                {EXTRAS_SUGERIDOS.map((s) => (
                  <span key={s}>
                    <span className="cot-sep">·</span>
                    <button type="button" className="cot-btn" onClick={() => addExtra(s)} title={`Agregar «${s}»`}>
                      {s}
                    </button>
                  </span>
                ))}
              </td>
            </tr>
          )}

          {/* Viáticos por pernocta (derivado del itinerario) */}
          {Number(b?.totales.viaticos_pernocta_usd) > 0 && (
            <tr className="cot-fila">
              <td className="lbl">Viáticos por pernocta</td>
              <td className="val">{moneyPdf(b!.totales.viaticos_pernocta_usd)}</td>
            </tr>
          )}

          {/* Descuento: impreso si > 0; fantasma para capturar */}
          {(filaDescuentoImpresa || !lectura) && (
            <tr className={cn("cot-fila", !filaDescuentoImpresa && "cot-fila--fantasma")} {...(!filaDescuentoImpresa ? UI : {})}>
              <td className="lbl">Descuento</td>
              <td className="val">
                {lectura ? (
                  `−${moneyPdf(descuentoImpreso)}`
                ) : (
                  <>
                    −$
                    <CampoNumero
                      value={descuentoCapturado > 0 ? descuentoCapturado : null}
                      onChange={(n) => onCambio("descuento_usd", n != null && n > 0 ? n : null)}
                      formato={numero2}
                      placeholder="0.00"
                      ariaLabel="Descuento (USD, fuera de IVA)"
                      title="Negociado («ciérramelo en 750»). Fuera de IVA; sale como línea en el PDF."
                      min={0}
                      minCh={4}
                    />
                  </>
                )}
              </td>
            </tr>
          )}

          <tr className="sub-row cot-fila">
            <td className="lbl">Subtotal (sin IVA)</td>
            <td className="val">{val(subtotalSinIvaUsd(b))}</td>
          </tr>

          {/* IVA (% editable en la etiqueta) */}
          <tr className="cot-fila">
            <td className="lbl cot-ancla">
              {lectura ? (
                `IVA (${porcentajeEntero(ivaPctMostrado ?? 0)}%)`
              ) : (
                <>
                  {"IVA ("}
                <CampoNumero
                  value={ivaPctMostrado}
                  onChange={(n) =>
                    onCambio(
                      "iva_pct_override",
                      n == null ? null : Math.round(Math.min(100, Math.max(0, n)) * 100) / 10000,
                    )
                  }
                  formato={(n) => porcentajeEntero(n)}
                  placeholder="auto"
                  ariaLabel="IVA % (vacío = según método de pago)"
                  title="Vacío = según método de pago (Interno › Cobro)"
                  min={0}
                  max={100}
                  minCh={2}
                />
                  {"%)"}
                </>
              )}
              {!lectura && ivaOverridePct != null && (
                <span className="cot-margen" {...UI}>
                  <span className="cot-marca" title="IVA forzado a mano (vacío = según método de pago)">
                    manual
                  </span>
                </span>
              )}
            </td>
            <td className="val">{val(b ? b.totales.iva_usd : null)}</td>
          </tr>

          <tr className="total-row cot-fila">
            <td>{`Total (${moneda})`}</td>
            <td className="val">{val(totalUsd)}</td>
          </tr>

          {/* Total MXN: impreso con T.C.; fantasma para capturarlo */}
          {(filaMxnImpresa || !lectura) && (
            <tr className={cn("total-mxn cot-fila", !filaMxnImpresa && "cot-fila--fantasma")} {...(!filaMxnImpresa ? UI : {})}>
              <td className="cot-ancla">
                {lectura ? (
                  `Total MXN${tc != null ? ` (T.C. ${numeroG(tc)})` : ""}`
                ) : (
                  <>
                    {"Total MXN (T.C. "}
                    <CampoNumero
                      id={idTc}
                      value={tc}
                      onChange={(n) => onCambio("tc_usd_mxn", n != null && n > 0 ? n : null)}
                      formato={numeroG}
                      placeholder="18.50"
                      ariaLabel="Tipo de cambio (MXN por USD)"
                      title="Opcional · si el pago entrará en pesos. Requerido con TUAS/extras en MXN."
                      min={0}
                      minCh={5}
                    />
                    )
                  </>
                )}
              </td>
              <td className="val">{totalMxn != null ? `${moneyPdf(totalMxn)} MXN` : "—"}</td>
            </tr>
          )}
        </tbody>
      </table>

      {detalle && extras[detalle.idx] && (
        <DetalleExtra
          idx={detalle.idx}
          extra={extras[detalle.idx]}
          ancla={detalle.ancla}
          onCerrar={() => setDetalle(null)}
          onChange={(patch) => updateExtra(detalle.idx, patch)}
          onModo={(unitario) => {
            const i = detalle.idx;
            const e = extras[i];
            const next = [...extras];
            if (unitario) {
              next[i] = {
                ...e,
                monto_usd: 0,
                unitario: Number(e.monto_usd) > 0 ? Number(e.monto_usd) : 0,
                cantidad: 1,
                por_persona: false,
              };
            } else {
              const { unitario: _u, cantidad: _c, por_persona: _p, ...resto } = e;
              void _u;
              void _c;
              void _p;
              next[i] = { ...resto, monto_usd: 0 };
            }
            setExtras(next);
          }}
          tcCapturado={tc != null}
        />
      )}
    </>
  );
}

/**
 * Fila de TUA por aeropuerto: el concepto EXACTO del desglose canónico
 * («TUA CUN · $25.00 × 4 pax») con el unitario como input invisible. Vacío =
 * vuelve al catálogo; "0" = capturada en $0; la moneda se cambia en el
 * margen (fantasma). El pax y el total son del motor.
 */
function FilaTua({
  fila,
  linea,
  lectura,
  disabled,
  onChange,
  valor,
}: {
  fila: TuasFila;
  linea?: TuaLinea;
  lectura: boolean;
  disabled: boolean;
  onChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
  /** Texto de la celda `.val` ("" con varias filas: el total va aparte). */
  valor: string;
}) {
  const p = piezasConceptoTua(fila);
  const moneda = linea?.moneda ?? fila.moneda;
  const capturada = !!linea;
  return (
    <tr className="cot-fila">
      <td className="lbl cot-ancla">
        {lectura ? (
          `${p.antes}${p.unitario}${p.despues}`
        ) : (
          <>
          {p.antes}
          <CampoNumero
            value={Number(fila.monto_pax)}
            onChange={(n) => onChange(fila.iata, n, moneda)}
            formato={(n) => n.toFixed(2)}
            placeholder="0.00"
            ariaLabel={`TUA por pasajero en ${fila.iata} (${moneda})`}
            title={capturada ? "Capturado para esta cotización. Vacío = vuelve al catálogo." : "Monto del catálogo. Teclea para capturar uno distinto."}
            disabled={disabled}
            min={0}
            minCh={4}
          />
          {p.despues}
          {/* En la línea (no en el margen: a 12 px se saldría del papel). */}
          {capturada && (
            <span className="cot-acciones" {...UI}>
              {" "}
              <span className="cot-sep">·</span>
              <button
                type="button"
                className="cot-liga"
                onClick={() => onChange(fila.iata, null, moneda)}
                title="Quitar la captura: vuelve al monto del catálogo"
              >
                capturado · quitar
              </button>
            </span>
          )}
          </>
        )}
        {!lectura && (
          <span className="cot-margen" {...UI}>
            <select
              className="cot-in cot-fantasma"
              value={moneda}
              disabled={disabled}
              aria-label={`Moneda de la TUA en ${fila.iata}`}
              onChange={(e) => onChange(fila.iata, linea?.monto_pax ?? Number(fila.monto_pax), e.target.value === "MXN" ? "MXN" : "USD")}
              style={{ fontSize: 10 }}
            >
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
            {!capturada && fila.tc_aplicado != null && (
              <span className="cot-marca" title={`Convertido con T.C. ${fila.tc_aplicado}`}>
                T.C. {numeroG(fila.tc_aplicado)}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="val">{valor}</td>
    </tr>
  );
}

/** Aeropuerto sin fila contable (exento o en $0): fantasma con «capturar». */
function FilaTuaExenta({
  air,
  linea,
  paxGlobal,
  disabled,
  onChange,
}: {
  air: TuasAeropuerto;
  linea?: TuaLinea;
  paxGlobal: number;
  disabled: boolean;
  onChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
}) {
  const [capturar, setCapturar] = useState(false);
  const moneda = linea?.moneda ?? (air.moneda === "MXN" ? "MXN" : "USD");
  const abierto = capturar || !!linea;
  return (
    <tr className="cot-fila cot-fila--fantasma" {...UI}>
      <td className="lbl cot-ancla">
        {`TUA ${air.iata} · `}
        {abierto ? (
          <>
            $
            <CampoNumero
              value={linea ? Number(linea.monto_pax) : null}
              onChange={(n) => onChange(air.iata, n, moneda)}
              formato={(n) => n.toFixed(2)}
              placeholder="0.00"
              ariaLabel={`TUA por pasajero en ${air.iata} (${moneda})`}
              disabled={disabled}
              min={0}
              minCh={4}
            />
            {moneda === "MXN" ? " MXN" : ""} × {paxGlobal} pax
            <span className="cot-tenue"> · el motor decide si aplica</span>
          </>
        ) : (
          <>
            <span className="cot-tenue" title={air.razon}>
              exento
            </span>
            {!disabled && (
              <button type="button" className="cot-liga" onClick={() => setCapturar(true)} title={air.razon}>
                capturar
              </button>
            )}
          </>
        )}
      </td>
      <td className="val" />
    </tr>
  );
}

/** Popover de un extra: cantidad × precio, por persona, moneda e IVA. */
function DetalleExtra({
  idx,
  extra: e,
  ancla,
  onCerrar,
  onChange,
  onModo,
  tcCapturado,
}: {
  idx: number;
  extra: ExtraConcepto;
  ancla: HTMLButtonElement | null;
  onCerrar: () => void;
  onChange: (patch: Partial<ExtraConcepto>) => void;
  onModo: (unitario: boolean) => void;
  tcCapturado: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCerrarFuera(true, onCerrar, ref, ancla);
  useFocoPopover(ref, ancla);
  const pos = useMemo(() => posicionBajoAncla(ancla), [ancla]);
  const unitario = extraUsaUnitario(e);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Detalle del extra ${e.concepto || idx + 1}`}
      data-guard-exempt
      className="absolute z-50 w-[21rem] max-w-[calc(100vw-1rem)] space-y-2.5 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      style={pos}
      onKeyDown={enterCierra(onCerrar)}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {e.concepto || "Concepto"} <span className="normal-case tracking-normal">· no se imprime</span>
      </p>
      <DetalleFila label="Modo">
        <label className="flex items-center gap-2 text-xs">
          <Switch size="sm" checked={unitario} onCheckedChange={(v) => onModo(v)} />
          <span className="text-muted-foreground">cantidad × precio unitario</span>
        </label>
      </DetalleFila>
      {unitario && (
        <>
          <DetalleFila label="Cantidad">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                disabled={e.por_persona === true}
                value={e.por_persona ? "" : (e.cantidad ?? "")}
                placeholder={e.por_persona ? "pasajeros" : "1"}
                aria-label="Cantidad"
                className="h-8 w-20 text-right font-mono"
                onChange={(ev) => onChange({ cantidad: ev.target.value === "" ? undefined : Number(ev.target.value) })}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <Switch
                  size="sm"
                  checked={e.por_persona === true}
                  onCheckedChange={(v) => onChange({ por_persona: v, ...(v ? { cantidad: undefined } : { cantidad: e.cantidad ?? 1 }) })}
                />
                por persona
              </label>
            </div>
          </DetalleFila>
          <DetalleFila label="Precio unitario">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={e.unitario ?? ""}
              aria-label="Precio unitario"
              className="h-8 w-28 text-right font-mono"
              onChange={(ev) => onChange({ unitario: ev.target.value === "" ? 0 : Number(ev.target.value) })}
            />
          </DetalleFila>
        </>
      )}
      <DetalleFila label="Moneda" hint={e.moneda === "MXN" && !tcCapturado ? "Captura el T.C. en «Total MXN»: sin él el renglón no entra al total." : undefined}>
        <select
          value={e.moneda ?? "USD"}
          aria-label="Moneda del extra"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs font-medium outline-none focus-visible:border-ring dark:bg-input/30"
          onChange={(ev) => onChange({ moneda: ev.target.value === "MXN" ? "MXN" : "USD" })}
        >
          <option value="USD">USD</option>
          <option value="MXN">MXN</option>
        </select>
      </DetalleFila>
      <DetalleFila label="IVA">
        <label className="flex items-center gap-2 text-xs">
          <Switch size="sm" checked={e.aplica_iva !== false} onCheckedChange={(v) => onChange({ aplica_iva: v })} />
          <span className="text-muted-foreground">{e.aplica_iva === false ? "fuera de la base de IVA" : "entra a la base de IVA"}</span>
        </label>
      </DetalleFila>
    </div>,
    document.body,
  );
}
