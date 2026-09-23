"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ChatBubbleBottomCenterTextIcon,
  EllipsisHorizontalIcon,
  EyeSlashIcon,
  FlagIcon,
  MoonIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLookupNm } from "@/hooks/use-lookup-nm";
import { parseCodigosRuta } from "@/components/admin/ruta-rapida-input";
import {
  SIN_DATO,
  celdaRutaTramo,
  diaMes,
  hhmm,
  millasTxt,
  moneyInterno,
  montoInterno,
  notasTramos,
  pieTramos,
  servicioAereoCanonicoUsd,
} from "@/lib/admin/quote-sheet-interna";
import { tramoCalculado } from "@/lib/admin/quote-sheet";
import { cn } from "@/lib/utils";
import type { EscalaInput, QuoteBreakdown } from "@/types/quote";
import type { CotizacionInterna } from "@/types/quotes-interno";
import {
  CampoDia,
  CampoHoja,
  CampoNumero,
  CampoSelect,
  UI,
  enfocarPorAriaLabel,
  type CampoSelectOption,
} from "./quote-sheet-fields";
import { DetalleTramo } from "./quote-sheet-itinerario";
import type { AeropuertoHoja, OnAbrirInterno, RutaHoja, TramoPdfAccesores } from "./quote-sheet-types";

/**
 * TRAMOS COTIZADOS — la tabla del Excel de la oficina, editable en su lugar
 * (Fase 2.2 del rediseño del cotizador, 22-sep-2026):
 *
 *   RUTA · FECHA · DISTANCIA MILLAS · TIEMPO VUELO · COSTO POR HORA VUELO ·
 *   TOTAL POR TRAMO
 *
 * MISMO marcado y clases que `_tramos_html` de `cotizacion_interna_pdf.py`
 * (`table.grid.tramos`, `td.ruta`, `.num`, `tfoot tr.total`, `tr.ajuste`,
 * `div.nota`): el papel y la pantalla son el mismo documento.
 *
 * QUÉ SE EDITA (lo mismo que ya editaba la hoja del cliente, ni un campo
 * más): origen/destino (con continuidad), la FECHA del PDF, las MILLAS —que
 * hasta hoy estaban enterradas en el popover «⋯» y por eso nadie las
 * corregía— y, desde el margen, el ⋯ (pax, ferry, pernocta, tipo de parada,
 * notas, ojito del PDF) y el 🗑 con confirmación. Abajo, «+ Agregar tramo» y
 * la RUTA RÁPIDA («CUN, HOL, CUN ⏎»).
 *
 * QUÉ NO SE EDITA, y por qué:
 *  - TIEMPO: lo calcula el motor (millas ÷ velocidad + calzos). Se cambia
 *    cambiando las millas o pactando el total.
 *  - COSTO POR HORA: el motor v1.3 cotiza con UNA tarifa por vuelo (decisión
 *    3 del diseño). Un input por fila prometería un precio por tramo que el
 *    motor NO respeta; la tarifa se ajusta en «Tarifa y horas».
 *  - TOTAL POR TRAMO y el PIE (Σ, ajuste + motivo, «Servicio aéreo»): vienen
 *    del API (`tramos-costeados.util.ts`, campos ADITIVOS del breakdown, los
 *    MISMOS que imprime el PDF interno). **Aquí jamás se multiplica
 *    `tiempo × tarifa`**: con dos fuentes, pantalla y papel dirían cifras
 *    distintas del mismo vuelo (riesgo 10 del diseño). Con un API previo esas
 *    celdas pintan «—», nunca un número inventado.
 */
export interface QuoteSheetInternaTramosProps {
  legs: EscalaInput[];
  onLegsChange: (legs: EscalaInput[]) => void;
  aeropuertos: AeropuertoHoja[];
  rutas?: RutaHoja[];
  lectura: boolean;
  pdf: TramoPdfAccesores;
  /** Tramos resueltos por el motor: TIEMPO / COSTO/HR / TOTAL por fila. */
  breakdown: QuoteBreakdown | null;
  /** Payload de `/interno`: los nombres largos y el calzo total del snapshot. */
  interno?: CotizacionInterna | null;
  defaultOrigin?: string;
  onAbrirInterno?: OnAbrirInterno;
}

export function QuoteSheetInternaTramos({
  legs,
  onLegsChange,
  aeropuertos,
  rutas,
  lectura,
  pdf,
  breakdown,
  interno = null,
  defaultOrigin = "CUN",
  onAbrirInterno,
}: QuoteSheetInternaTramosProps) {
  const oculto = useMemo(
    () => pdf.oculto ?? ((_: number, l: EscalaInput) => l.pdf_oculto === true),
    [pdf.oculto],
  );
  const fechaPdf = useMemo(
    () => pdf.fechaPdf ?? ((_: number, l: EscalaInput) => l.pdf_fecha ?? null),
    [pdf.fechaPdf],
  );

  const { lookupNm } = useLookupNm(rutas, aeropuertos);
  const opciones = useMemo<CampoSelectOption[]>(
    () => aeropuertos.map((a) => ({ value: a.iata, label: a.iata, description: a.nombre })),
    [aeropuertos],
  );

  // Millas faltantes: mismo autollenado del itinerario del cliente (fuente
  // única `useLookupNm`), disparado por los EXTREMOS de los tramos.
  const endpointsKey =
    legs.map((l) => `${l.origen_iata}-${l.destino_iata}`).join("|") +
    `#z${legs.filter((l) => l.origen_iata && l.destino_iata && !(Number(l.millas_nauticas) > 0)).length}`;
  useEffect(() => {
    if (lectura) return;
    let changed = false;
    const next = legs.map((l) => {
      if (Number(l.millas_nauticas) > 0 || !l.origen_iata || !l.destino_iata) return l;
      const nm = lookupNm(l.origen_iata, l.destino_iata);
      if (nm === null) return l;
      changed = true;
      return { ...l, millas_nauticas: nm };
    });
    if (changed) onLegsChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointsKey, lookupNm, lectura]);

  const updateLeg = (idx: number, patch: Partial<EscalaInput>) => {
    const next = [...legs];
    next[idx] = { ...next[idx], ...patch };
    if (patch.destino_iata !== undefined && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], origen_iata: patch.destino_iata };
    }
    if (patch.destino_iata !== undefined || patch.origen_iata !== undefined) {
      const nm = lookupNm(next[idx].origen_iata, next[idx].destino_iata);
      if (nm !== null) next[idx].millas_nauticas = nm;
    }
    onLegsChange(next);
  };
  const addLeg = () => {
    const last = legs[legs.length - 1];
    onLegsChange([
      ...legs,
      { origen_iata: last?.destino_iata ?? defaultOrigin, destino_iata: "", millas_nauticas: 0 },
    ]);
    enfocarPorAriaLabel(`Destino del tramo ${legs.length + 1}`);
  };
  const removeLeg = (idx: number) => {
    const next = legs.filter((_, i) => i !== idx);
    if (idx > 0 && idx <= next.length - 1) {
      next[idx] = { ...next[idx], origen_iata: next[idx - 1].destino_iata };
    }
    onLegsChange(next);
  };

  // Ruta rápida: «CUN, HOL, CUN» + Enter (mismo canónico del catálogo).
  const canonico = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aeropuertos) m.set(a.iata.toUpperCase(), a.iata);
    return m;
  }, [aeropuertos]);
  const [rutaRapida, setRutaRapida] = useState("");
  const [rutaError, setRutaError] = useState<string | null>(null);
  const [confirmarRuta, setConfirmarRuta] = useState<string[] | null>(null);
  const tieneCaptura = (l: EscalaInput) =>
    (l.pasajeros ?? null) !== null ||
    (l.notas ?? "") !== "" ||
    (l.servicio_notas ?? "") !== "" ||
    (l.fecha_salida_plan ?? null) !== null ||
    l.es_ferry === true ||
    l.requiere_pernocta === true ||
    l.tipo_parada === "SERVICIO";
  const hayDatosTramos = legs.some(
    (l) => tieneCaptura(l) || (l.pasajeros_nombres ?? []).some((n) => n.trim() !== ""),
  );
  const aplicarCodigos = (codigos: string[]) => {
    const next: EscalaInput[] = [];
    for (let i = 0; i < codigos.length - 1; i++) {
      next.push({
        origen_iata: codigos[i],
        destino_iata: codigos[i + 1],
        millas_nauticas: lookupNm(codigos[i], codigos[i + 1]) ?? 0,
      });
    }
    onLegsChange(next);
    setRutaRapida("");
    setRutaError(null);
    setConfirmarRuta(null);
  };
  const armarRutaRapida = () => {
    const codigos = parseCodigosRuta(rutaRapida);
    if (codigos.length < 2) {
      setRutaError("Escribe al menos dos códigos: «CUN, HOL, CUN».");
      return;
    }
    const faltan = codigos.filter((c: string) => !canonico.has(c));
    if (faltan.length > 0) {
      setRutaError(`No está en el catálogo: ${[...new Set(faltan)].join(", ")}.`);
      return;
    }
    const exactos = codigos.map((c: string) => canonico.get(c)!);
    if (hayDatosTramos) {
      setConfirmarRuta(exactos);
      return;
    }
    aplicarCodigos(exactos);
  };

  // Eliminar: directo si la fila es esqueleto; con confirmación si hay
  // captura (regla permanente del cliente).
  const [confirmarQuitar, setConfirmarQuitar] = useState<number | null>(null);
  const pedirQuitar = (idx: number) => {
    if (tieneCaptura(legs[idx])) setConfirmarQuitar(idx);
    else removeLeg(idx);
  };

  const [detalle, setDetalle] = useState<{ idx: number; ancla: HTMLButtonElement } | null>(null);
  const detalleIdx = detalle?.idx ?? null;

  // Nombres largos del snapshot (respaldo de la celda RUTA cuando falta un
  // IATA o la fila es consolidada): cruzados por ORDEN, nunca por posición.
  const internoPorOrden = useMemo(() => {
    const m = new Map<number, CotizacionInterna["tramos_cotizados"][number]>();
    for (const t of interno?.tramos_cotizados ?? []) m.set(t.orden, t);
    return m;
  }, [interno]);

  // ----- Filas -----
  const filas = legs.map((leg, idx) => {
    const estaOculto = oculto(idx, leg);
    const fecha = fechaPdf(idx, leg);
    const sobrevuelo = !!leg.origen_iata && leg.origen_iata === leg.destino_iata;
    const sinNm = !!leg.origen_iata && !!leg.destino_iata && !(Number(leg.millas_nauticas) > 0);
    // Cruce con el motor por índice Y extremos (el breakdown va un debounce
    // atrás): `tramoCalculado` es la fuente única de esa regla.
    const calc = tramoCalculado(breakdown?.tramos ?? null, idx, leg);
    const delSnapshot = internoPorOrden.get(idx + 1);
    const celda = celdaRutaTramo({
      ruta: delSnapshot?.ruta ?? null,
      origen_iata: leg.origen_iata,
      destino_iata: leg.destino_iata,
      origen_nombre: delSnapshot?.origen_nombre ?? null,
      destino_nombre: delSnapshot?.destino_nombre ?? null,
      consolidado: false,
      es_ferry: leg.es_ferry === true,
      pernocta: leg.requiere_pernocta === true,
      pernocta_usd: leg.pernocta_costo_usd ?? null,
    });
    // TIEMPO / COSTO/HR / TOTAL: del API, jamás multiplicados aquí.
    const tiempo = calc?.tiempo_hhmm || (calc ? hhmm(calc.tiempo_hr) : SIN_DATO);
    const tarifa = calc?.tarifa_usd_hr != null ? moneyInterno(calc.tarifa_usd_hr) : SIN_DATO;
    const total = calc?.total_usd != null ? montoInterno(calc.total_usd) : SIN_DATO;
    return (
      <tr
        key={idx}
        className={cn("cot-fila", estaOculto && "cot-fila--oculta")}
        {...(estaOculto ? UI : {})}
        title={estaOculto ? "Oculto en el PDF del cliente (se sigue cobrando)" : undefined}
      >
        <td className="ruta cot-ancla">
          {/* CROMA EN LÍNEA, DENTRO del papel (22-sep-2026, reporte del
              cliente con captura: «no se alcanzan a ver los 3 puntitos para
              las demás opciones en la cotización»). Vivía en `.cot-margen`
              (`right: 100 %`), o sea FUERA del área impresa, y el borde del
              contenedor lo cortaba por más canal que se reservara. Ahora abre
              la celda RUTA: 🗑 · ⋯ · marcas · «CUN–PCE». Sigue siendo croma
              (`data-cot-ui`: el PDF no la imprime) y en LECTURA no se monta,
              así que los fixtures del documento no cambian. */}
          {!lectura && (
            <span className="cot-croma" {...UI}>
              <button
                type="button"
                className="cot-margen__accion cot-margen__accion--peligro cursor-pointer"
                onClick={() => pedirQuitar(idx)}
                disabled={legs.length <= 1}
                aria-label={`Quitar tramo ${idx + 1}`}
                title="Quitar tramo"
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                className="cot-margen__accion cursor-pointer"
                onClick={(e) => {
                  const ancla = e.currentTarget;
                  setDetalle((v) => (v?.idx === idx ? null : { idx, ancla }));
                }}
                aria-expanded={detalleIdx === idx}
                aria-label={`Detalle del tramo ${idx + 1} (pasajeros, ferry, pernocta, servicio, nota, PDF)`}
                title="Detalle del tramo"
              >
                <EllipsisHorizontalIcon />
              </button>
              {leg.pasajeros != null && !leg.es_ferry && (
                <span className="cot-marca" title="Pasajeros de este tramo">
                  {leg.pasajeros}p
                </span>
              )}
              {leg.es_ferry && (
                <span className="cot-marca" title="Ferry (vacío): sin pasajeros ni TUAS">
                  <FlagIcon />
                </span>
              )}
              {leg.requiere_pernocta && (
                <span
                  className="cot-marca"
                  title={`Pernocta${leg.pernocta_costo_usd != null ? ` · $${leg.pernocta_costo_usd}` : ""}`}
                >
                  <MoonIcon />
                </span>
              )}
              {leg.tipo_parada === "SERVICIO" && (
                <span
                  className="cot-marca"
                  title={`Parada de servicio${leg.servicio_notas ? `: ${leg.servicio_notas}` : ""}`}
                >
                  <WrenchScrewdriverIcon />
                </span>
              )}
              {(leg.notas ?? "").trim() !== "" && (
                <span className="cot-marca" title={`Nota al piloto: ${leg.notas}`}>
                  <ChatBubbleBottomCenterTextIcon />
                </span>
              )}
              {sobrevuelo && (
                <span className="cot-marca" title="Sobrevuelo (sale y regresa al mismo aeropuerto)">
                  <ArrowPathIcon />
                </span>
              )}
              {estaOculto && (
                <span className="cot-marca cot-marca--aviso" title="Oculto en el PDF (se sigue cobrando)">
                  <EyeSlashIcon />
                </span>
              )}
              {sinNm && (
                <span className="cot-marca cot-marca--aviso" title="Sin millas náuticas: captúralas en esta fila">
                  NM?
                </span>
              )}
            </span>
          )}
          {/* «CUN–PCE» con guion LARGO, como lo imprime el PDF. En lectura es
              texto; en edición, los dos selectores de IATA en su sitio. */}
          {lectura ? (
            celda.texto
          ) : (
            <>
              <CampoSelect
                options={opciones}
                value={leg.origen_iata}
                onChange={(v) => updateLeg(idx, { origen_iata: v })}
                placeholder="IATA"
                ariaLabel={`Origen del tramo ${idx + 1}`}
                disabled={idx > 0}
                title={idx > 0 ? "El origen es el destino del tramo anterior (continuidad)" : undefined}
              />
              {"–"}
              <CampoSelect
                options={opciones}
                value={leg.destino_iata}
                onChange={(v) => updateLeg(idx, { destino_iata: v })}
                placeholder="IATA"
                ariaLabel={`Destino del tramo ${idx + 1}`}
              />
            </>
          )}
          {celda.marcas && <span className="muted">{` · ${celda.marcas}`}</span>}
        </td>
        <td>
          {pdf.onFechaPdfChange && !lectura ? (
            <CampoDia
              value={fecha ?? ""}
              onChange={(v) => pdf.onFechaPdfChange!(idx, v || null)}
              ariaLabel={`Fecha del tramo ${idx + 1}`}
              texto={diaMes(fecha)}
              disabled={estaOculto}
            />
          ) : (
            diaMes(fecha)
          )}
        </td>
        <td className="num">
          {lectura ? (
            millasTxt(Number(leg.millas_nauticas) || null)
          ) : (
            <CampoNumero
              value={Number(leg.millas_nauticas) > 0 ? Number(leg.millas_nauticas) : null}
              onChange={(n) => updateLeg(idx, { millas_nauticas: n ?? 0 })}
              formato={(n) => millasTxt(n)}
              placeholder="0"
              ariaLabel={`Millas náuticas del tramo ${idx + 1}`}
              title="Millas náuticas: con ellas el motor calcula el tiempo del tramo"
              min={0}
              minCh={3}
            />
          )}
        </td>
        <td className="num">{tiempo}</td>
        <td className="num">{tarifa}</td>
        <td className="num">{total}</td>
      </tr>
    );
  });

  const filaAgregar = !lectura ? (
    <tr className="cot-fila cot-fila-agregar" {...UI}>
      <td colSpan={6}>
        <button type="button" className="cot-btn cursor-pointer" onClick={addLeg}>
          + Agregar tramo
        </button>
        <span className="cot-sep">·</span>
        <CampoHoja
          value={rutaRapida}
          onChange={(v) => {
            setRutaRapida(v);
            if (rutaError) setRutaError(null);
          }}
          onEnter={armarRutaRapida}
          placeholder="o escribe la ruta: CUN, HOL, CUN ⏎"
          ariaLabel="Ruta rápida: códigos IATA separados por coma; Enter arma los tramos"
          minCh={30}
        />
        {rutaError && (
          <span
            role="alert"
            className="cot-marca cot-marca--aviso"
            style={{ marginLeft: 8, textTransform: "none", fontWeight: 400, whiteSpace: "normal" }}
          >
            {rutaError}
          </span>
        )}
      </td>
    </tr>
  ) : null;

  // ----- Pie: Σ del API + ajuste con su motivo + «Servicio aéreo» -----
  const pie = pieTramos(breakdown, legs.map((l) => ({ millas: Number(l.millas_nauticas) || 0 })), servicioAereoCanonicoUsd(breakdown));
  const nota = notasTramos(
    breakdown?.tiempos?.calzos_hr ?? interno?.calzos_hr ?? null,
    (interno?.tramos_cotizados ?? []).some((t) => t.consolidado),
  );

  return (
    <>
      <h2>Tramos cotizados</h2>
      <table className="grid tramos">
        <thead>
          <tr>
            <th>Ruta</th>
            <th>Fecha</th>
            <th className="num">Distancia millas</th>
            <th className="num">Tiempo vuelo</th>
            <th className="num">Costo por hora vuelo</th>
            <th className="num">Total por tramo</th>
          </tr>
        </thead>
        <tbody>
          {filas}
          {filaAgregar}
        </tbody>
        <tfoot>
          <tr className="total">
            <td>TOTAL</td>
            <td />
            <td className="num">{pie.millas}</td>
            <td className="num">{pie.tiempo}</td>
            <td />
            <td className="num">
              {pie.totalUsd != null ? `${montoInterno(pie.totalUsd)} USD` : SIN_DATO}
            </td>
          </tr>
          {pie.hayAjuste && (
            <>
              <tr className="ajuste">
                <td colSpan={5}>
                  {pie.ajusteMotivo}
                  <span className="op">{" servicio aéreo cotizado − Σ tramos"}</span>
                </td>
                <td className="num">{montoInterno(pie.ajusteUsd)}</td>
              </tr>
              <tr className="total">
                <td colSpan={5}>Servicio aéreo</td>
                <td className="num">
                  {pie.servicioAereoUsd != null
                    ? `${montoInterno(pie.servicioAereoUsd)} USD`
                    : SIN_DATO}
                </td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
      <div className="nota">{nota}</div>

      {detalle && legs[detalle.idx] && (
        <DetalleTramo
          idx={detalle.idx}
          leg={legs[detalle.idx]}
          ancla={detalle.ancla}
          onCerrar={() => setDetalle(null)}
          onChange={(patch) => updateLeg(detalle.idx, patch)}
          pdf={pdf}
          oculto={oculto(detalle.idx, legs[detalle.idx])}
          fechaPdf={fechaPdf(detalle.idx, legs[detalle.idx])}
          tramo={tramoCalculado(breakdown?.tramos ?? null, detalle.idx, legs[detalle.idx])}
          onAbrirInterno={onAbrirInterno}
        />
      )}
      <AlertDialog open={confirmarQuitar !== null} onOpenChange={(o) => !o && setConfirmarQuitar(null)}>
        <AlertDialogContent data-guard-exempt>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitar el tramo {confirmarQuitar !== null ? confirmarQuitar + 1 : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este tramo tiene captura (pasajeros, banderas, notas o fechas) que se perderá. El
              siguiente tramo tomará su origen del tramo anterior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmarQuitar !== null) removeLeg(confirmarQuitar);
                setConfirmarQuitar(null);
              }}
            >
              Quitar tramo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmarRuta !== null} onOpenChange={(o) => !o && setConfirmarRuta(null)}>
        <AlertDialogContent data-guard-exempt>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar los tramos capturados?</AlertDialogTitle>
            <AlertDialogDescription>
              La ruta rápida sustituye TODOS los tramos ({confirmarRuta?.join(" → ")}) y se pierden
              pasajeros, banderas, notas y fechas capturadas por tramo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmarRuta && aplicarCodigos(confirmarRuta)}>
              Reemplazar tramos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
