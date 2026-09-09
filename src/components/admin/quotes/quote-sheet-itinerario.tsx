"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseCodigosRuta } from "@/components/admin/ruta-rapida-input";
import { useLookupNm } from "@/hooks/use-lookup-nm";
import type { MapaEstado } from "@/hooks/use-quote-mapa-svg";
import { fechaDia, tramosVisibles } from "@/lib/admin/quote-sheet";
import { cn } from "@/lib/utils";
import type { EscalaInput } from "@/types/quote";
import {
  CampoDia,
  CampoHoja,
  CampoSelect,
  DetalleFila,
  UI,
  enfocarPorAriaLabel,
  enterCierra,
  posicionBajoAncla,
  useCerrarFuera,
  useFocoPopover,
  type CampoSelectOption,
} from "./quote-sheet-fields";
import type { AeropuertoHoja, RutaHoja, TramoPdfAccesores } from "./quote-sheet-types";

const PERNOCTA_COSTO_DEFAULT_USD = 150;

/**
 * ITINERARIO de la hoja editable (form-as-document, 8-sep-2026): la MISMA
 * tabla del PDF (`# · Tramo · [Fecha]`) con el mapa al lado, donde cada
 * fila se edita en su lugar (origen/destino con el selector de aeropuerto
 * invisible en reposo). Lo que el PDF NO imprime (pax por tramo, NM, ferry,
 * pernocta, servicio, nota al piloto, fecha/hora de salida, ojito/fecha del
 * PDF) vive FUERA del área impresa: marcas suaves en el margen izquierdo de
 * la fila y un popover de detalle («⋯»); eliminar (🗑) solo al hover. La
 * fila «+ Agregar tramo» (con la ruta rápida «CUN, HOL, CUN ⏎») va dentro
 * del `<tbody>` y no se imprime.
 *
 * Reglas heredadas de `QuoteLegsEditor`: continuidad (el destino de un tramo
 * es el origen del siguiente; el primero es libre), millas autocompletadas
 * (`useLookupNm`), ferry sin pax. Variantes del PDF respetadas: sin puntos
 * de mapa → tabla sola; `mostrar_itinerario=false` → «La ruta» solo mapa;
 * sin tramos → ninguna sección (en edición, una tabla fantasma para poder
 * empezar).
 */
export interface QuoteSheetItinerarioProps {
  legs: EscalaInput[];
  onLegsChange: (legs: EscalaInput[]) => void;
  aeropuertos: AeropuertoHoja[];
  rutas?: RutaHoja[];
  lectura: boolean;
  pdf: TramoPdfAccesores;
  mostrarItinerario: boolean;
  mapa: { svg: string | null; estado: MapaEstado; error?: string | null };
  defaultOrigin?: string;
}

export function QuoteSheetItinerario({
  legs,
  onLegsChange,
  aeropuertos,
  rutas,
  lectura,
  pdf,
  mostrarItinerario,
  mapa,
  defaultOrigin = "CUN",
}: QuoteSheetItinerarioProps) {
  const oculto = useMemo(
    () => pdf.oculto ?? ((_: number, l: EscalaInput) => l.pdf_oculto === true),
    [pdf.oculto],
  );
  const fechaPdf = useMemo(
    () => pdf.fechaPdf ?? ((_: number, l: EscalaInput) => l.pdf_fecha ?? null),
    [pdf.fechaPdf],
  );
  const visibles = useMemo(() => tramosVisibles(legs, oculto), [legs, oculto]);
  const ordenPorIdx = useMemo(() => new Map(visibles.map((v) => [v.idx, v.orden])), [visibles]);
  const conFecha = visibles.some((v) => !!fechaPdf(v.idx, v.leg));

  const { lookupNm } = useLookupNm(rutas, aeropuertos);
  const opciones = useMemo<CampoSelectOption[]>(
    () => aeropuertos.map((a) => ({ value: a.iata, label: a.iata, description: a.nombre })),
    [aeropuertos],
  );

  // Rellena millas faltantes cuando cambian los EXTREMOS (misma llave que el
  // editor de tramos: incluye el conteo de tramos completos sin millas).
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
    // `legs` se cubre con endpointsKey (no re-correr al teclear millas).
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
    // La fila nueva ya trae el origen (continuidad): el foco va al destino.
    enfocarPorAriaLabel(`Destino del tramo ${legs.length + 1}`);
  };
  const removeLeg = (idx: number) => {
    const next = legs.filter((_, i) => i !== idx);
    if (idx > 0 && idx <= next.length - 1) {
      next[idx] = { ...next[idx], origen_iata: next[idx - 1].destino_iata };
    }
    onLegsChange(next);
  };

  // Ruta rápida en la fila «+ Agregar tramo»: "CUN, HOL, CUN" + Enter.
  const canonico = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aeropuertos) m.set(a.iata.toUpperCase(), a.iata);
    return m;
  }, [aeropuertos]);
  const [rutaRapida, setRutaRapida] = useState("");
  const [rutaError, setRutaError] = useState<string | null>(null);
  const [confirmarRuta, setConfirmarRuta] = useState<string[] | null>(null);
  const hayDatosTramos = legs.some(
    (l) =>
      (l.pasajeros ?? null) !== null ||
      (l.pasajeros_nombres ?? []).some((n) => n.trim() !== "") ||
      (l.notas ?? "") !== "" ||
      (l.servicio_notas ?? "") !== "" ||
      (l.fecha_salida_plan ?? null) !== null ||
      l.es_ferry === true ||
      l.requiere_pernocta === true ||
      l.tipo_parada === "SERVICIO",
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
    const faltan = codigos.filter((c) => !canonico.has(c));
    if (faltan.length > 0) {
      setRutaError(`No está en el catálogo: ${[...new Set(faltan)].join(", ")}.`);
      return;
    }
    const exactos = codigos.map((c) => canonico.get(c)!);
    if (hayDatosTramos) {
      setConfirmarRuta(exactos);
      return;
    }
    aplicarCodigos(exactos);
  };

  // Eliminar: directo si la fila es puro esqueleto; con confirmación si
  // tiene captura (pax, banderas, notas, fechas) — regla del cliente.
  const [confirmarQuitar, setConfirmarQuitar] = useState<number | null>(null);
  const tieneCaptura = (l: EscalaInput) =>
    (l.pasajeros ?? null) !== null ||
    (l.notas ?? "") !== "" ||
    (l.servicio_notas ?? "") !== "" ||
    (l.fecha_salida_plan ?? null) !== null ||
    l.es_ferry === true ||
    l.requiere_pernocta === true ||
    l.tipo_parada === "SERVICIO";
  const pedirQuitar = (idx: number) => {
    if (tieneCaptura(legs[idx])) setConfirmarQuitar(idx);
    else removeLeg(idx);
  };

  // Popover de detalle de UNA fila (fuera del papel, por portal): el ancla
  // es el «⋯» que lo abrió (llega con el evento, nunca se lee un ref al pintar).
  const [detalle, setDetalle] = useState<{ idx: number; ancla: HTMLButtonElement } | null>(null);
  const detalleIdx = detalle?.idx ?? null;

  if (legs.length === 0 && lectura) return null;

  const mapaNode =
    mapa.svg || mapa.estado === "actualizando" ? (
      <div
        className={cn("mapa", mapa.estado === "actualizando" && "mapa--actualizando", !mapa.svg && "mapa--vacio")}
        aria-label="Mapa de la ruta"
        {...(mapa.svg ? { dangerouslySetInnerHTML: { __html: mapa.svg } } : { children: "Dibujando el mapa…" })}
      />
    ) : null;

  const notaMapa =
    !lectura && legs.length > 0 && !mapa.svg && mapa.estado !== "actualizando" ? (
      <span className="cot-margen cot-margen--der" {...UI} style={{ top: "auto", bottom: 0, alignItems: "flex-end" }}>
        <span className="cot-marca" title="Sin coordenadas en el catálogo o tramos sin aeropuerto: el PDF tampoco lleva mapa.">
          {mapa.estado === "error" ? (mapa.error ?? "mapa no disponible") : "sin mapa"}
        </span>
      </span>
    ) : null;

  // ----- Variante «La ruta» (solo mapa) -----
  if (!mostrarItinerario) {
    if (!mapaNode) return null;
    return (
      <>
        <h2>La ruta</h2>
        <div className="mapa-solo">{mapaNode}</div>
      </>
    );
  }

  const columnas = conFecha ? 3 : 2;
  const filas = legs.map((leg, idx) => {
    const estaOculto = oculto(idx, leg);
    const orden = ordenPorIdx.get(idx);
    const fecha = fechaPdf(idx, leg);
    const sobrevuelo = !!leg.origen_iata && leg.origen_iata === leg.destino_iata;
    const sinNm = !!leg.origen_iata && !!leg.destino_iata && !(Number(leg.millas_nauticas) > 0);
    return (
      <tr
        key={idx}
        className={cn("cot-fila", estaOculto && "cot-fila--oculta")}
        {...(estaOculto ? UI : {})}
        title={estaOculto ? "Oculto en el PDF del cliente (se sigue cobrando)" : undefined}
      >
        <td className="cot-ancla">
          {orden ?? "·"}
          {!lectura && (
            <span className="cot-margen" {...UI}>
              <button
                type="button"
                className="cot-margen__accion cot-margen__accion--peligro"
                onClick={() => pedirQuitar(idx)}
                disabled={legs.length <= 1}
                aria-label={`Quitar tramo ${idx + 1}`}
                title="Quitar tramo"
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                className="cot-margen__accion"
                onClick={(e) => {
                  const ancla = e.currentTarget;
                  setDetalle((v) => (v?.idx === idx ? null : { idx, ancla }));
                }}
                aria-expanded={detalleIdx === idx}
                aria-label={`Detalle del tramo ${idx + 1} (pasajeros, millas, ferry, pernocta, servicio, nota, PDF)`}
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
                <span className="cot-marca" title={`Pernocta${leg.pernocta_costo_usd != null ? ` · $${leg.pernocta_costo_usd}` : ""}`}>
                  <MoonIcon />
                </span>
              )}
              {leg.tipo_parada === "SERVICIO" && (
                <span className="cot-marca" title={`Parada de servicio${leg.servicio_notas ? `: ${leg.servicio_notas}` : ""}`}>
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
                <span className="cot-marca cot-marca--aviso" title="Sin millas náuticas: captúralas en el detalle (⋯)">
                  NM?
                </span>
              )}
            </span>
          )}
        </td>
        <td>
          <CampoSelect
            options={opciones}
            value={leg.origen_iata}
            onChange={(v) => updateLeg(idx, { origen_iata: v })}
            placeholder="IATA"
            ariaLabel={`Origen del tramo ${idx + 1}`}
            lectura={lectura}
            disabled={idx > 0}
            title={idx > 0 ? "El origen es el destino del tramo anterior (continuidad)" : undefined}
          />
          {" → "}
          <CampoSelect
            options={opciones}
            value={leg.destino_iata}
            onChange={(v) => updateLeg(idx, { destino_iata: v })}
            placeholder="IATA"
            ariaLabel={`Destino del tramo ${idx + 1}`}
            lectura={lectura}
          />
        </td>
        {conFecha && (
          <td className="fecha">
            {pdf.onFechaPdfChange && !lectura ? (
              <CampoDia
                value={fecha ?? ""}
                onChange={(v) => pdf.onFechaPdfChange!(idx, v || null)}
                ariaLabel={`Fecha del tramo ${idx + 1} en el PDF (solo PDF)`}
                texto={fechaDia(fecha) || "—"}
                disabled={estaOculto}
              />
            ) : (
              fechaDia(fecha) || "—"
            )}
          </td>
        )}
      </tr>
    );
  });

  const filaAgregar = !lectura ? (
    <tr className="cot-fila cot-fila-agregar" {...UI}>
      <td colSpan={columnas} className="cot-ancla">
        <button type="button" className="cot-btn" onClick={addLeg}>
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
          // En línea (la fila no se imprime): en el margen derecho se
          // encimaría sobre el mapa.
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

  const tabla = (
    <table className="grid">
      <thead>
        <tr>
          <th>#</th>
          <th>Tramo</th>
          {conFecha && <th>Fecha</th>}
        </tr>
      </thead>
      <tbody>
        {filas}
        {filaAgregar}
      </tbody>
    </table>
  );

  const cuerpo = mapaNode ? (
    <table className="itin-row">
      <tbody>
        <tr>
          <td className="itin-tabla">{tabla}</td>
          <td className="itin-mapa cot-ancla">
            {mapaNode}
            {notaMapa}
          </td>
        </tr>
      </tbody>
    </table>
  ) : (
    <div className="cot-ancla" style={{ position: "relative" }}>
      {tabla}
      {notaMapa}
    </div>
  );

  const seccion = (
    <>
      <h2>Itinerario</h2>
      {cuerpo}
    </>
  );

  // Tramos vacíos en edición: sección FANTASMA (no se imprime) para poder empezar.
  const fantasma = legs.length === 0;

  return (
    <>
      {fantasma ? <div {...UI}>{seccion}</div> : seccion}
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
        />
      )}
      <AlertDialog open={confirmarQuitar !== null} onOpenChange={(o) => !o && setConfirmarQuitar(null)}>
        <AlertDialogContent data-guard-exempt>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el tramo {confirmarQuitar !== null ? confirmarQuitar + 1 : ""}?</AlertDialogTitle>
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

/**
 * Popover de detalle de un tramo: todo lo que el PDF no imprime. Se monta
 * FUERA del papel (portal a body, anclado al «⋯» de la fila) para que los
 * controles del panel conserven su estilo (dentro de `.cot-hoja` el CSS del
 * PDF fija fuente/color/box-sizing a todo).
 */
function DetalleTramo({
  idx,
  leg,
  ancla,
  onCerrar,
  onChange,
  pdf,
  oculto,
  fechaPdf,
}: {
  idx: number;
  leg: EscalaInput;
  ancla: HTMLButtonElement | null;
  onCerrar: () => void;
  onChange: (patch: Partial<EscalaInput>) => void;
  pdf: TramoPdfAccesores;
  oculto: boolean;
  fechaPdf: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCerrarFuera(true, onCerrar, ref, ancla);
  useFocoPopover(ref, ancla);
  const pos = useMemo(() => posicionBajoAncla(ancla), [ancla]);
  const cerrarConEnter = enterCierra(onCerrar);
  const margenPdf = pdf.margen?.(idx, leg);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Detalle del tramo ${idx + 1}`}
      data-guard-exempt
      className="absolute z-50 w-[22rem] max-w-[calc(100vw-1rem)] space-y-2.5 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      style={pos}
      onKeyDown={cerrarConEnter}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Tramo {idx + 1} · {leg.origen_iata || "?"} → {leg.destino_iata || "?"}{" "}
        <span className="normal-case tracking-normal">· no se imprime</span>
      </p>
      <DetalleFila label="Pasajeros (TUAS)" hint="Vacío = usa los pasajeros del vuelo.">
        <Input
          type="number"
          min={0}
          step={1}
          disabled={leg.es_ferry}
          value={leg.es_ferry ? 0 : (leg.pasajeros ?? "")}
          placeholder="global"
          aria-label="Pasajeros del tramo"
          className="h-8 w-24 text-right font-mono"
          onChange={(e) => onChange({ pasajeros: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </DetalleFila>
      <DetalleFila label="Millas náuticas" hint="Se autocompletan del catálogo de distancias.">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={leg.millas_nauticas || ""}
          placeholder="NM"
          aria-label="Millas náuticas del tramo"
          className={cn("h-8 w-28 text-right font-mono", !(leg.millas_nauticas > 0) && "border-amber-500/60")}
          onChange={(e) => onChange({ millas_nauticas: Number(e.target.value) || 0 })}
        />
      </DetalleFila>
      <DetalleFila label="Ferry (vacío)">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            size="sm"
            checked={leg.es_ferry ?? false}
            onCheckedChange={(v) => onChange({ es_ferry: v, ...(v ? { pasajeros: 0 } : {}) })}
          />
          <span className="text-muted-foreground">sin pasajeros ni TUAS; cobra tiempo</span>
        </label>
      </DetalleFila>
      <DetalleFila label="Pernocta">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Switch
            size="sm"
            checked={leg.requiere_pernocta ?? false}
            onCheckedChange={(v) =>
              onChange({
                requiere_pernocta: v,
                ...(v && leg.pernocta_costo_usd == null ? { pernocta_costo_usd: PERNOCTA_COSTO_DEFAULT_USD } : {}),
              })
            }
          />
          {leg.requiere_pernocta && (
            <span className="inline-flex items-center gap-1">
              $
              <Input
                type="number"
                min={0}
                step="0.01"
                value={leg.pernocta_costo_usd ?? ""}
                aria-label="Viáticos por pernocta (USD)"
                className="h-7 w-24 text-right font-mono"
                onChange={(e) =>
                  onChange({ pernocta_costo_usd: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
              USD
            </span>
          )}
        </div>
      </DetalleFila>
      <DetalleFila label="Parada de servicio">
        <div className="space-y-1">
          <Switch
            size="sm"
            checked={leg.tipo_parada === "SERVICIO"}
            onCheckedChange={(v) => onChange({ tipo_parada: v ? "SERVICIO" : "NORMAL" })}
          />
          {leg.tipo_parada === "SERVICIO" && (
            <Input
              value={leg.servicio_notas ?? ""}
              placeholder="Qué servicio (combustible, comisariato…)"
              aria-label="Notas del servicio"
              className="h-8"
              onChange={(e) => onChange({ servicio_notas: e.target.value || null })}
            />
          )}
        </div>
      </DetalleFila>
      <DetalleFila label="Salida (Cancún)" hint="Fecha y hora planeada del tramo (operativa).">
        <Input
          type="datetime-local"
          value={leg.fecha_salida_plan ?? ""}
          aria-label="Fecha y hora de salida del tramo (hora de Cancún)"
          className="h-8 font-mono text-xs"
          onChange={(e) => onChange({ fecha_salida_plan: e.target.value || null })}
        />
      </DetalleFila>
      <DetalleFila label="Nota al piloto">
        <Textarea
          rows={2}
          value={leg.notas ?? ""}
          placeholder="Ej. cargar gasolina aquí"
          aria-label="Nota operativa del tramo"
          className="text-xs"
          onChange={(e) => onChange({ notas: e.target.value || null })}
        />
      </DetalleFila>
      <div className="border-t border-border pt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">PDF del cliente</p>
        {margenPdf ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">{margenPdf}</div>
        ) : pdf.onOcultoChange || pdf.onFechaPdfChange ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {pdf.onFechaPdfChange && (
              <label className="inline-flex items-center gap-1.5">
                Fecha
                <Input
                  type="date"
                  value={fechaPdf ?? ""}
                  min="2000-01-01"
                  max="2100-12-31"
                  disabled={oculto}
                  aria-label="Fecha del tramo en el PDF (solo PDF)"
                  className="h-7 w-[8.75rem] px-1.5 font-mono text-[11px]"
                  onChange={(e) => pdf.onFechaPdfChange!(idx, e.target.value || null)}
                />
              </label>
            )}
            {pdf.onOcultoChange && (
              <label className="inline-flex items-center gap-1.5">
                <Switch size="sm" checked={oculto} onCheckedChange={(v) => pdf.onOcultoChange!(idx, v)} />
                Ocultar en el PDF (se sigue cobrando)
              </label>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            La fecha y el ojito del PDF por tramo se habilitan al guardar la versión.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
