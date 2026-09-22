"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EllipsisHorizontalIcon, LockClosedIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EXTRAS_SUGERIDOS } from "@/components/admin/quotes/extras-editor";
import {
  TEXTO_EXTRA_FUERA,
  cantidadEfectiva,
  esExtraDeGrupo,
  estadoExtra,
  extraUsaUnitario,
  type EstadoExtra,
} from "@/lib/admin/extras";
import { folioTexto } from "@/lib/admin/grupos-ui";
import {
  ETIQUETA_BASE_GRAVABLE,
  ETIQUETA_SIN_IVA,
  ETIQUETA_SUBTOTAL,
  TOLERANCIA_USD,
  descuentoImpresoUsd,
  esExtraSintetizado,
  etiquetaExtra,
  moneyPdf,
  montoExtraImpreso,
  numero2,
  numeroG,
  particionarPorIva,
  piezasConceptoTua,
  porcentajeEntero,
  servicioAereoImpresoUsd,
  subtotalSinIvaUsd,
  tuasDetalleLegado,
  type LineaIva,
} from "@/lib/admin/quote-sheet";
import {
  conceptoCanonico,
  moneyInterno,
  opTotalMxnInterna,
  pctG,
  piezasConceptoTuaInterna,
  servicioAereoCanonicoUsd,
} from "@/lib/admin/quote-sheet-interna";
import { moneyTarifa } from "@/lib/admin/tarifa";
import { upsertTuaLinea } from "@/lib/admin/tuas";
import { fmtTc } from "@/lib/format";
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
 * DIALECTO del documento (Fase 2.2, 22-sep-2026): el MISMO editor de
 * desglose sirve a la hoja del CLIENTE y a la HOJA INTERNA. Solo cambian las
 * ETIQUETAS y QUÉ RENGLONES se publican — los campos que se capturan (TUAS,
 * extras, descuento, IVA %, T.C.) son exactamente los mismos, y tienen que
 * serlo: dos editores del mismo dinero es donde se cuela el número que no
 * cuadra.
 *
 * La diferencia de fondo está en `servicioAereo`:
 *  - `IMPRESO` (cliente): «Servicio aéreo» ABSORBE el redondeo y la comisión
 *    del vendedor — el cliente no los ve como conceptos aparte.
 *  - `CANONICO` (interno): «Servicio aéreo» es la línea TIEMPO_VUELO del
 *    desglose v1.3 tal cual, y la comisión del vendedor y el ajuste positivo
 *    se publican en SU renglón. Sin eso, la columna del documento interno no
 *    sumaría su propio total.
 */
export interface DialectoDesglose {
  /** Texto del `<h2>`. */
  titulo: string;
  /** Etiqueta de la fila del total («Total (USD)» · «Total USD»). */
  etiquetaTotal: (moneda: string) => string;
  /** Clase de la fila del total en pesos (`total-mxn` · `mxn-row`). */
  claseFilaMxn: string;
  servicioAereo: "IMPRESO" | "CANONICO";
  /**
   * Texto alrededor del % de IVA, que es un input en su propia etiqueta:
   * el cliente imprime «IVA (16%)» y el interno «IVA 16 %».
   */
  iva: { antes: string; despues: string };
  /**
   * Cómo se escribe el % del IVA: el PDF del CLIENTE usa `{iva_pct:.0f}`
   * (entero, redondeo half-even de Python) y el INTERNO `{iva_pct:g}` (hasta
   * 6 cifras significativas). Con el 16 % de siempre dan lo mismo; con un
   * `iva_pct_override` de 8.5 el cliente imprime «8» y el interno «8.5», y
   * usar el del cliente en la hoja interna la haría mentir.
   */
  pct: (pct: number) => string;
  /**
   * Cómo se escribe el T.C. en la fila del total en pesos: entre paréntesis
   * («Total MXN (T.C. 18.1)», cliente) o como aclaración gris («Total MXN ·
   * T.C. 18.1», interno).
   */
  mxnTc: "PARENTESIS" | "OP";
  /**
   * Concepto de una TUA: «TUA CUN · $25.00 × 4 pax» (cliente, el texto del
   * desglose canónico) o «TUA CUN» + gris «4 pax × $25.00» (interno).
   */
  tua: "CLIENTE" | "INTERNA";
  /** Fila(s) al final de la tabla (el «motor v1.3 · calculado …» del interno). */
  pie?: ReactNode;
}

export const DIALECTO_CLIENTE: DialectoDesglose = {
  titulo: "Desglose",
  etiquetaTotal: (moneda) => `Total (${moneda})`,
  claseFilaMxn: "total-mxn",
  servicioAereo: "IMPRESO",
  iva: { antes: "IVA (", despues: "%)" },
  pct: porcentajeEntero,
  mxnTc: "PARENTESIS",
  tua: "CLIENTE",
};

export const DIALECTO_INTERNA: DialectoDesglose = {
  titulo: "Desglose de la cotización",
  etiquetaTotal: () => "Total USD",
  claseFilaMxn: "mxn-row",
  servicioAereo: "CANONICO",
  iva: { antes: "IVA ", despues: " %" },
  pct: pctG,
  mxnTc: "OP",
  tua: "INTERNA",
};

/**
 * DESGLOSE de la hoja editable (form-as-document, 8-sep-2026): la MISMA
 * `<table class="totales">` del PDF, fila por fila y en el mismo orden
 * (Servicio aéreo · TUAS · extras · Descuento · Subtotal · IVA · [No causan
 * IVA: extras exentos · Viáticos] · Total · Total MXN), donde lo editable se
 * captura en su posición final: el unitario de cada TUA dentro de su
 * concepto, concepto/monto/moneda de cada extra, el descuento, el % de IVA en
 * su etiqueta y el T.C. en la línea «Total MXN». TODOS los montos vienen del
 * breakdown de `/calculate`; aquí solo se pintan en su celda `.val`
 * (`moneyPdf` = `_money` del armador).
 *
 * CONCEPTOS SIN IVA DEBAJO DEL IVA (22-sep-2026, pedido del cliente): el
 * orden lo decide `particionarPorIva` (`lib/admin/quote-sheet.ts`), port
 * EXACTO de la función homónima de `cotizacion_pdf.py` que comparten los tres
 * PDF. Ningún monto cambia: solo su posición y la etiqueta del renglón que va
 * sobre el IVA, que con la partición activa pasa a ser la BASE GRAVABLE
 * («Subtotal gravable»). Cada fila declara con cuánto SUMA al documento: las
 * fantasma, las de detalle sin importe y los renglones que no entran al total
 * declaran 0, así que nunca desbalancean la verificación.
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
  /** Documento que se está pintando (cliente por default; ver `DialectoDesglose`). */
  dialecto?: DialectoDesglose;
  /**
   * Comisión del vendedor ya resuelta por quien llama (solo dialecto
   * `CANONICO`): `{ montoUsd, concepto, op }`. Null = no se pinta el renglón.
   * El monto NUNCA se calcula aquí.
   */
  comisionVendedor?: { montoUsd: number; concepto: string; op: string } | null;
  /** Ajuste canónico POSITIVO (redondeo/pactado), solo dialecto `CANONICO`. */
  ajustePositivo?: { montoUsd: number; concepto: string; op: string } | null;
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
  dialecto = DIALECTO_CLIENTE,
  comisionVendedor = null,
  ajustePositivo = null,
}: QuoteSheetDesgloseProps) {
  const b = breakdown;
  const val = (n: number | null | undefined) => (n == null ? "—" : moneyPdf(n));
  const canonico = dialecto.servicioAereo === "CANONICO";

  // ----- Servicio aéreo (derivado; etiqueta con horas × tarifa solo si el toggle lo pide) -----
  // CLIENTE: la composición IMPRESA (absorbe redondeo y comisión).
  // INTERNO: la línea TIEMPO_VUELO canónica tal cual — los dos números salen
  // del motor, aquí no se suma nada.
  const servicio = canonico ? servicioAereoCanonicoUsd(b) : servicioAereoImpresoUsd(b);
  // El toggle «mostrar tarifa» es del PDF del CLIENTE: el documento INTERNO
  // imprime siempre «Servicio aéreo» a secas (`_concepto_operacion`, clave
  // TIEMPO_VUELO) porque «h × $/hr» ya vive en «Horas cotizadas» y el cliente
  // marcó la repetición. Sin este candado, prender el toggle cambiaba una
  // etiqueta que el papel interno nunca lleva.
  const conTarifa =
    !canonico &&
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
  // La tarifa de ESTE atajo (croma, nunca se imprime) va con todos sus
  // decimales: enseña la multiplicación y con «$989.58» se leería
  // descuadrada. La etiqueta IMPRESA de arriba sigue con `moneyPdf`
  // (2 decimales, paridad carácter por carácter con `_money` de pyservices).
  const textoAjustar =
    conTarifa || !b
      ? "ajustar"
      : `${numero2(b.tiempos.cobrable_hr)} h × ${moneyTarifa(b.tarifa.usd_por_hora)}/hr · ajustar`;

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
  // Lleva el foco al campo del T.C. («Total MXN», más abajo en esta misma
  // tabla) desde la leyenda de un renglón en pesos sin tipo de cambio.
  const enfocarTc = () => {
    const el = document.getElementById(idTc);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el instanceof HTMLInputElement ? el : el?.querySelector("input"))?.focus({ preventScroll: true });
  };
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

  // ===== CUERPO del desglose: conceptos SIN IVA debajo del IVA (22-sep-2026) =====
  // Las filas se arman ANTES de pintarlas para que `particionarPorIva` —el
  // MISMO algoritmo de `cotizacion_pdf.py`, importado de `lib/admin/quote-sheet`—
  // decida cuáles bajan DEBAJO del renglón del IVA. Ningún monto cambia: solo
  // su posición y la etiqueta del renglón que va sobre el IVA (pasa a ser la
  // BASE GRAVABLE). Cada fila declara el monto con el que SUMA al documento:
  // las filas FANTASMA y las de detalle sin importe declaran 0.
  const cuerpo: LineaIva<ReactNode>[] = [];
  const agregarFila = (montoUsd: number, exento: boolean, nodo: ReactNode) => {
    cuerpo.push({ montoUsd, exento, fila: nodo });
  };
  const tuasTotalUsd = b ? Number(b.tuas.total_usd) : 0;

  // --- Servicio aéreo. La etiqueta impresa NO cambia; en edición, EN LA
  //     LÍNEA (`.cot-acciones`, como «+ nuevo cliente»: en el margen
  //     izquierdo —74 px— «1.60 h × $650.00/hr · ajustar» se saldría del
  //     papel y en el derecho caería sobre el monto) va el atajo a Interno ›
  //     Tarifa y horas, donde SÍ se ajustan tarifa y horas. ---
  agregarFila(
    Number(servicio) || 0,
    false,
    <tr key="servicio" className="cot-fila">
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
    </tr>,
  );

  // --- TUAS: sin filas → línea única; una → su concepto; varias → detalle + total ---
  // El documento INTERNO no imprime la línea TUAS cuando vale 0 y no hay
  // detalle por aeropuerto (`_desglose_html`: «exentas o en $0 NO se
  // muestran»). En EDICIÓN se conserva como fila FANTASMA para que el
  // operador siga viendo dónde viven las TUAS: aporta 0 y no se imprime.
  const tuasVacia = canonico && filas.length === 0 && Math.abs(tuasTotalUsd) < 0.005;
  if (filas.length === 0 && detalleLegado.length === 0 && (!tuasVacia || !lectura)) {
    agregarFila(
      tuasVacia ? 0 : tuasTotalUsd,
      false,
      <tr key="tuas" className={cn("cot-fila", tuasVacia && "cot-fila--fantasma")} {...(tuasVacia ? UI : {})}>
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
      </tr>,
    );
  }
  if (filas.length === 0) {
    detalleLegado.forEach((concepto, i) => {
      agregarFila(
        detalleLegado.length === 1 ? tuasTotalUsd : 0,
        false,
        <tr key={`leg-${i}`} className="cot-fila">
          <td className="lbl">{concepto}</td>
          <td className="val">{detalleLegado.length === 1 ? val(b!.tuas.total_usd) : ""}</td>
        </tr>,
      );
    });
  }
  filas.forEach((f) => {
    agregarFila(
      filas.length === 1 ? tuasTotalUsd : 0,
      false,
      <FilaTua
        key={f.iata}
        fila={f}
        linea={lineaPorIata.get(f.iata)}
        lectura={lectura}
        disabled={!valores.cobrar_tuas}
        onChange={setTua}
        valor={filas.length === 1 ? val(b!.tuas.total_usd) : ""}
        interna={dialecto.tua === "INTERNA"}
      />,
    );
  });
  if (tuasConTotal) {
    agregarFila(
      tuasTotalUsd,
      false,
      <tr key="tuas-total" className="cot-fila">
        <td className="lbl">TUAS (total)</td>
        <td className="val">{val(b!.tuas.total_usd)}</td>
      </tr>,
    );
  }
  aeropuertosSinFila.forEach((a) => {
    agregarFila(
      0,
      false,
      <FilaTuaExenta
        key={a.iata}
        air={a}
        linea={lineaPorIata.get(a.iata)}
        paxGlobal={b?.tuas.pasajeros ?? (Number(valores.pasajeros) || 0)}
        disabled={!valores.cobrar_tuas}
        onChange={setTua}
      />,
    );
  });

  // --- Extras capturados ---
  extras.forEach((e, idx) => {
    const bloqueado = esExtraDeGrupo(e);
    const unitario = extraUsaUnitario(e);
    const impreso = montoExtraImpreso(e, idx, b);
    const soloLectura = lectura || bloqueado;
    const cantidad = cantidadEfectiva(e, Number(valores.pasajeros) > 0 ? Number(valores.pasajeros) : null);
    // ¿Este renglón entra al total? (21-sep-2026) — misma regla que
    // `extrasAPayload`. Un renglón que NO cuenta aporta 0 a la partición y
    // se queda donde está aunque venga marcado «sin IVA»: moverlo al bloque
    // «No causan IVA» lo haría parecer parte del total.
    const estado: EstadoExtra = estadoExtra(e, { tcCapturado: tc != null });
    const fuera = estado !== "ok" && estado !== "vacio";
    const montoParticion = fuera ? 0 : Number(impreso.monto_usd) || 0;
    const exento = e.aplica_iva === false;
    if (lectura) {
      // Texto EXACTO del PDF (`ExtraPdf`): "{concepto}[ · $X MXN]" + monto USD.
      agregarFila(
        montoParticion,
        exento,
        <tr key={idx} className="cot-fila">
          <td className="lbl">
            {etiquetaExtra({
              concepto: e.concepto,
              moneda: e.moneda,
              monto_nativo: impreso.monto_nativo ?? undefined,
            })}
          </td>
          <td className="val">{val(impreso.monto_usd)}</td>
        </tr>,
      );
      return;
    }
    // Si el renglón no cuenta, el importe se atenúa y la leyenda lo dice EN
    // LA FILA, en vez de pintar un monto que el total ignora y que al guardar
    // se descartaba en silencio (21-sep-2026).
    // El precio unitario vive en el detalle «⋯», que EDITA: como la
    // marca «1.20 h» del itinerario, esa leyenda NO puede ir exenta
    // del guard de CONFIRMADO/RESERVA (el popover entero sí lo está,
    // así que sin esto la confirmación única se saltaba).
    const abreDetalle = estado === "sin_monto" && unitario;
    // Un renglón de GRUPO se corrige EN EL GRUPO: la leyenda lo dice
    // igual (es cierto que no suma), pero sin clic — aquí no hay campo
    // que enfocar y abrir el detalle saltaría el candado «se edita
    // desde el grupo». El T.C. es la excepción: ese SÍ vive en la hoja.
    const corregibleAqui = !bloqueado || estado === "mxn_sin_tc";
    agregarFila(
      montoParticion,
      exento,
              <tr key={idx} className={cn("cot-fila", fuera && "cot-fila--fuera")}>
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
                  {fuera && (
                    <FueraDelTotal
                      estado={estado as Exclude<EstadoExtra, "ok" | "vacio">}
                      exento={!abreDetalle}
                      nota={corregibleAqui ? undefined : "se corrige en el grupo"}
                      onCorregir={
                        corregibleAqui
                          ? (ancla) => {
                              if (estado === "mxn_sin_tc") {
                                enfocarTc();
                                return;
                              }
                              if (abreDetalle) {
                                // El precio unitario vive en el detalle «⋯»: se
                                // abre anclado a la propia leyenda.
                                setDetalle({ idx, ancla });
                                return;
                              }
                              enfocarPorAriaLabel(
                                estado === "sin_nombre"
                                  ? `Concepto del extra ${idx + 1}`
                                  : e.moneda === "MXN"
                                    ? `Monto en pesos del extra ${idx + 1}`
                                    : `Monto del extra ${idx + 1} (USD)`,
                              );
                            }
                          : undefined
                      }
                    />
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
              </tr>,
    );
  });

  // --- Comisión BillPocket y demás extras SINTETIZADOS por el motor ---
  sintetizados.forEach((e, i) => {
    agregarFila(
      Number(e.monto_usd) || 0,
      e.aplica_iva === false,
      <tr key={`sint-${i}`} className="cot-fila">
        <td className="lbl">{e.concepto}</td>
        <td className="val">{moneyPdf(e.monto_usd)}</td>
      </tr>,
    );
  });

  // --- «+ Agregar concepto» (croma: no se imprime, no suma) ---
  if (!lectura) {
    agregarFila(
      0,
      false,
      <tr key="agregar" className="cot-fila cot-fila-agregar" {...UI}>
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
      </tr>,
    );
  }

  // --- COMISIÓN DEL VENDEDOR: renglón propio SOLO en el documento interno
  //     (el cliente nunca la ve: allá va absorbida en «Servicio aéreo»). El
  //     monto lo resuelve quien llama desde el desglose canónico; aquí solo
  //     se pinta. Gravable: el motor la mete a la base del IVA. ---
  if (canonico && comisionVendedor && Math.abs(comisionVendedor.montoUsd) >= 0.005) {
    agregarFila(
      comisionVendedor.montoUsd,
      false,
      <tr key="comision-vendedor" className="cot-fila">
        <td className="lbl">
          {comisionVendedor.concepto}
          {comisionVendedor.op && <span className="op">{` ${comisionVendedor.op}`}</span>}
        </td>
        <td className="val">{moneyPdf(comisionVendedor.montoUsd)}</td>
      </tr>,
    );
  }

  /** Renglón del DESCUENTO (editable): gravable con monto NEGATIVO, igual que en pyservices. */
  const filaDescuento = () => {
    if (!filaDescuentoImpresa && lectura) return;
    agregarFila(
      -descuentoImpreso,
      false,
      <tr
        key="descuento"
        className={cn("cot-fila", !filaDescuentoImpresa && "cot-fila--fantasma")}
        {...(!filaDescuentoImpresa ? UI : {})}
      >
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
      </tr>,
    );
  };

  // --- AJUSTE canónico POSITIVO (redondeo automático / precio pactado): en
  //     la hoja del CLIENTE va absorbido en «Servicio aéreo», así que solo
  //     existe en el documento interno. Sin él, la columna interna no
  //     sumaría su propio total. ---
  if (canonico && ajustePositivo && ajustePositivo.montoUsd >= 0.005) {
    agregarFila(
      ajustePositivo.montoUsd,
      false,
      <tr key="ajuste" className="cot-fila">
        <td className="lbl">
          {ajustePositivo.concepto}
          {ajustePositivo.op && <span className="op">{` ${ajustePositivo.op}`}</span>}
        </td>
        <td className="val">{moneyPdf(ajustePositivo.montoUsd)}</td>
      </tr>,
    );
  }

  // ORDEN CANÓNICO v1.3: …EXTRA · COMISION_VENDEDOR · AJUSTE · PERNOCTA. La
  // hoja del cliente lleva años imprimiendo la pernocta ANTES del descuento y
  // sus 6 fixtures lo congelan, así que el orden solo se corrige en el
  // documento interno, que es el que se lee contra el Excel de la oficina.
  if (canonico) filaDescuento();

  // --- Viáticos por pernocta (derivado del itinerario). SIEMPRE exento: es
  //     el concepto que el motor publica como «Viáticos por pernocta (sin
  //     IVA)» en el desglose canónico. ---
  if (Number(b?.totales.viaticos_pernocta_usd) > 0) {
    agregarFila(
      Number(b!.totales.viaticos_pernocta_usd),
      true,
      <tr key="pernocta" className="cot-fila">
        {/* El documento INTERNO imprime el concepto CANÓNICO, que trae su
            «(sin IVA)» dentro; la hoja del cliente lleva años con el texto
            corto y sus 6 fixtures lo congelan. */}
        <td className="lbl">
          {(canonico ? conceptoCanonico(b, "PERNOCTA") : null) ?? "Viáticos por pernocta"}
        </td>
        <td className="val">{moneyPdf(b!.totales.viaticos_pernocta_usd)}</td>
      </tr>,
    );
  }

  if (!canonico) filaDescuento();

  // Partición: con exentos (y IVA > 0) el renglón sobre el IVA pasa a ser la
  // BASE GRAVABLE y los exentos bajan debajo. Si las identidades no cuadran
  // —el motor va un debounce atrás, o el AJUSTE mezcla base y redondeo
  // post-IVA— se DEGRADA al layout de siempre. `iva.base_usd` puede faltar en
  // snapshots legados: `particionarPorIva` re-suma la columna.
  const particion = particionarPorIva(
    cuerpo,
    b?.iva?.base_usd,
    b ? Number(b.totales.iva_usd) : 0,
    b ? Number(b.totales.total_usd) : 0,
    // Porcentaje del MOTOR (fracción → %), el mismo que se pinta en la
    // etiqueta del IVA. Solo se usa cuando la base hay que derivarla.
    ivaPctMotor ?? 0,
  );

  // Gris del IVA del documento INTERNO: el renglón impreso sobre el IVA vs la
  // BASE que mandó el motor. Se compara, no se recalcula.
  const subtotalImpreso = particion.activa ? particion.baseUsd : subtotalSinIvaUsd(b);
  const baseMotor = b?.iva?.base_usd;
  const difiereDeLaBase =
    baseMotor != null &&
    Number.isFinite(baseMotor) &&
    (subtotalImpreso == null || Math.abs(subtotalImpreso - Number(baseMotor)) >= TOLERANCIA_USD);
  const ivaOpInterna =
    canonico && difiereDeLaBase
      ? `${pctG(ivaPctMotor ?? 0)} % de ${moneyInterno(Number(baseMotor))}`
      : "";

  // «Total MXN · T.C. 18.1 · incluye $4,022.40 MXN nativos» (documento
  // INTERNO): los renglones capturados en PESOS entran al total SIN pasar por
  // el T.C., así que sin esta frase el total en pesos no cuadra contra el
  // tipo de cambio. Son 14 de 231 cotizaciones en prod. La hoja del CLIENTE
  // nunca la lleva (sus 6 fixtures la congelan sin ella).
  const mxnNativos = canonico ? (b?.totales.mxn_nativos ?? null) : null;
  const opMxnInterna = canonico
    ? opTotalMxnInterna(tc != null ? fmtTc(tc) : "", mxnNativos)
    : "";
  const sufijoMxnNativos =
    canonico && Number(mxnNativos) ? ` · incluye $${numero2(Number(mxnNativos))} MXN nativos` : "";

  return (
    <>
      <h2>{dialecto.titulo}</h2>
      <table className="totales">
        <tbody>
          {particion.gravables.map((ln) => ln.fila)}

          <tr className="sub-row cot-fila">
            <td className="lbl">{particion.activa ? ETIQUETA_BASE_GRAVABLE : ETIQUETA_SUBTOTAL}</td>
            <td className="val">
              {particion.activa ? moneyPdf(particion.baseUsd) : val(subtotalSinIvaUsd(b))}
            </td>
          </tr>

          {/* IVA (% editable en la etiqueta) */}
          <tr className="cot-fila">
            <td className="lbl cot-ancla">
              {lectura ? (
                `${dialecto.iva.antes}${dialecto.pct(ivaPctMostrado ?? 0)}${dialecto.iva.despues}`
              ) : (
                <>
                  {dialecto.iva.antes}
                <CampoNumero
                  value={ivaPctMostrado}
                  onChange={(n) =>
                    onCambio(
                      "iva_pct_override",
                      n == null ? null : Math.round(Math.min(100, Math.max(0, n)) * 100) / 10000,
                    )
                  }
                  formato={(n) => dialecto.pct(n)}
                  placeholder="auto"
                  ariaLabel="IVA % (vacío = según método de pago)"
                  title="Vacío = según método de pago (Interno › Cobro)"
                  min={0}
                  max={100}
                  minCh={2}
                />
                  {dialecto.iva.despues}
                </>
              )}
              {!lectura && ivaOverridePct != null && (
                <span className="cot-margen" {...UI}>
                  <span className="cot-marca" title="IVA forzado a mano (vacío = según método de pago)">
                    manual
                  </span>
                </span>
              )}
              {/* Documento INTERNO: «16 % de $2,987.50» SOLO cuando el
                  renglón de arriba NO es ya la base gravable — si lo es,
                  repetiría el número que está justo encima
                  (`_desglose_html`). La hoja del cliente nunca lo pinta. */}
              {ivaOpInterna && <span className="op">{` ${ivaOpInterna}`}</span>}
            </td>
            <td className="val">{val(b ? b.totales.iva_usd : null)}</td>
          </tr>

          {/* Conceptos que NO causan IVA: van DEBAJO del IVA, bajo su rótulo
              (pedido del cliente 22-sep-2026). Sin exentos —o con las
              identidades rotas— este bloque no existe y la hoja sale
              EXACTAMENTE como antes. */}
          {particion.exentos.length > 0 && (
            <tr className="exentos-row cot-fila">
              <td className="lbl" colSpan={2}>
                {ETIQUETA_SIN_IVA}
              </td>
            </tr>
          )}
          {particion.exentos.map((ln) => ln.fila)}

          <tr className="total-row cot-fila">
            <td>{dialecto.etiquetaTotal(moneda)}</td>
            <td className="val">{val(totalUsd)}</td>
          </tr>

          {/* Total MXN: impreso con T.C.; fantasma para capturarlo */}
          {(filaMxnImpresa || !lectura) && (
            <tr
              className={cn(dialecto.claseFilaMxn, "cot-fila", !filaMxnImpresa && "cot-fila--fantasma")}
              {...(!filaMxnImpresa ? UI : {})}
            >
              <td className="cot-ancla">
                {/* El T.C. va entre paréntesis en la hoja del cliente y como
                    aclaración gris en el documento interno: el MISMO input,
                    dos envoltorios. */}
                {lectura ? (
                  dialecto.mxnTc === "OP" ? (
                    <>
                      {"Total MXN"}
                      {opMxnInterna && <span className="op">{` ${opMxnInterna}`}</span>}
                    </>
                  ) : (
                    `Total MXN${tc != null ? ` (T.C. ${fmtTc(tc)})` : ""}`
                  )
                ) : (
                  <>
                    {dialecto.mxnTc === "OP" ? "Total MXN " : "Total MXN (T.C. "}
                    <TcEnvoltorio op={dialecto.mxnTc === "OP"}>
                      {dialecto.mxnTc === "OP" && "T.C. "}
                      <CampoNumero
                        id={idTc}
                        value={tc}
                        onChange={(n) => onCambio("tc_usd_mxn", n != null && n > 0 ? n : null)}
                        formato={fmtTc}
                        placeholder="18.50"
                        ariaLabel="Tipo de cambio (MXN por USD)"
                        title="Opcional · si el pago entrará en pesos. Requerido con TUAS/extras en MXN."
                        min={0}
                        minCh={5}
                      />
                      {sufijoMxnNativos}
                    </TcEnvoltorio>
                    {dialecto.mxnTc === "OP" ? "" : ")"}
                  </>
                )}
              </td>
              <td className="val">{totalMxn != null ? `${moneyPdf(totalMxn)} MXN` : "—"}</td>
            </tr>
          )}
          {/* Pie del documento interno («motor v1.3 · calculado …»): lo arma
              quien llama, aquí solo se coloca al final de la tabla. */}
          {dialecto.pie}
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
 * LEYENDA de un renglón de extras que NO entra al total (21-sep-2026). Croma
 * de edición (`data-cot-ui`): no se imprime y en LECTURA ni se monta, así que
 * la hoja bloqueada sigue siendo byte a byte el PDF. El clic lleva al campo
 * que falta — nunca cambia el dato por su cuenta.
 *
 * - Sin `onCorregir` (línea de GRUPO) es TEXTO: el aviso sigue siendo cierto,
 *   pero aquí no hay nada que corregir y un clic muerto confunde.
 * - `exento` = el clic solo mueve el foco, así que queda fuera del guard de
 *   CONFIRMADO/RESERVA (el guard se dispara al teclear de verdad). Cuando el
 *   clic ABRE el detalle «⋯» —que edita— va SIN exención, igual que la marca
 *   «1.20 h» del itinerario: si no, la confirmación única se saltaría.
 */
function FueraDelTotal({
  estado,
  onCorregir,
  exento = true,
  nota,
}: {
  estado: Exclude<EstadoExtra, "ok" | "vacio">;
  onCorregir?: (ancla: HTMLButtonElement) => void;
  exento?: boolean;
  nota?: string;
}) {
  const texto = TEXTO_EXTRA_FUERA[estado];
  const TITULO = "Este renglón no se suma al total ni sale en el PDF";
  return (
    <span className="cot-aviso" {...UI}>
      {onCorregir ? (
        <button
          type="button"
          className="cot-aviso__liga"
          {...(exento ? { "data-guard-exempt": "" } : {})}
          onClick={(ev) => onCorregir(ev.currentTarget)}
          title={TITULO}
        >
          {texto}
        </button>
      ) : (
        <span title={TITULO}>{texto}</span>
      )}
      {nota && <span className="cot-aviso__nota"> · {nota}</span>}
    </span>
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
  interna = false,
}: {
  fila: TuasFila;
  linea?: TuaLinea;
  lectura: boolean;
  disabled: boolean;
  onChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
  /** Texto de la celda `.val` ("" con varias filas: el total va aparte). */
  valor: string;
  /** Documento INTERNO: «TUA CUN» + gris «4 pax × $25.00» (`_tua_fila`). */
  interna?: boolean;
}) {
  // Dos documentos, el MISMO unitario editable: solo cambia el envoltorio.
  const pi = piezasConceptoTuaInterna(fila, fila.tc_aplicado ? fmtTc(fila.tc_aplicado) : "");
  const pc = piezasConceptoTua(fila);
  const p = interna
    ? { antes: pi.antes, unitario: Number(fila.monto_pax).toFixed(2), despues: pi.despues }
    : pc;
  const moneda = linea?.moneda ?? fila.moneda;
  const capturada = !!linea;
  return (
    <tr className="cot-fila">
      <td className="lbl cot-ancla">
        {interna && pi.concepto}
        {lectura ? (
          interna ? (
            <span className="op">{` ${p.antes}${p.unitario}${p.despues}`}</span>
          ) : (
            `${p.antes}${p.unitario}${p.despues}`
          )
        ) : (
          <TuaEnvoltorio op={interna}>
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
          </TuaEnvoltorio>
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
              <span className="cot-marca" title={`Convertido con T.C. ${fmtTc(fila.tc_aplicado)}`}>
                T.C. {fmtTc(fila.tc_aplicado)}
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
      <DetalleFila
        label="Moneda"
        hint={e.moneda === "MXN" && !tcCapturado ? `${TEXTO_EXTRA_FUERA.mxn_sin_tc}.` : undefined}
      >
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

/**
 * Envoltorio del T.C. en la fila «Total MXN»: en el documento INTERNO va como
 * aclaración gris (`.op`, igual que en el PDF interno) y en la hoja del
 * cliente en el propio texto, entre paréntesis. El input es el MISMO — y
 * conserva su id ancla (`tc-usd-mxn-field`) en los dos casos.
 */
function TcEnvoltorio({ op, children }: { op: boolean; children: ReactNode }) {
  return op ? <span className="op">{children}</span> : <>{children}</>;
}

/**
 * Envoltorio del detalle de una TUA: en el documento INTERNO cuelga del
 * concepto como aclaración gris («TUA CUN · 4 pax × $25.00»), en la hoja del
 * cliente va en el propio texto. El input del unitario es el MISMO.
 */
function TuaEnvoltorio({ op, children }: { op: boolean; children: ReactNode }) {
  return op ? <span className="op"> {children}</span> : <>{children}</>;
}
