"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLookupNm } from "@/hooks/use-lookup-nm";
import {
  PlusIcon,
  TrashIcon,
  ArrowRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RutaRapidaInput } from "@/components/admin/ruta-rapida-input";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import { cn } from "@/lib/utils";
import { fmtDecimal } from "@/lib/format";
import type { EscalaInput } from "@/types/quote";
import type { Airport } from "@/types/airports";

const PERNOCTA_COSTO_DEFAULT_USD = 150;

interface RouteOption {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  /** Tramos de la ruta guardada: fuente preferida para autocompletar NM por par. */
  tramos?: { origen_iata: string; destino_iata: string; millas_nauticas: number }[];
}

interface AirportOption {
  iata: string;
  nombre: string;
  /** Coordenadas del catálogo: permiten autocompletar las millas náuticas. */
  latitud?: number | string | null;
  longitud?: number | string | null;
}

/**
 * Editor de tramos para vuelos MULTIESCALA. El primer origen lo decide el usuario
 * (normalmente CUN). Cada tramo nuevo prellena el origen con el destino del
 * anterior (continuidad obligatoria — el backend valida lo mismo). Las millas
 * náuticas se autocompletan si existe una ruta predefinida CUN-HOL, etc.
 */
export function QuoteLegsEditor({
  value,
  onChange,
  routes,
  airports,
  defaultOrigin = "CUN",
  avisoAnclaCun = false,
  onAeropuertoCreado,
  legExtra,
  legAtenuado,
  variant = "card",
}: {
  value: EscalaInput[];
  onChange: (legs: EscalaInput[]) => void;
  /**
   * `fila` (F2, 8-sep-2026): itinerario EN LÍNEA como la tabla del PDF —
   * `# | [CUN]→[HOL] | NM | Pax | (legExtra: fecha PDF · 👁)` con las
   * banderas ferry / pernocta (+costo) / servicio / nota como chips por
   * fila y el sobrevuelo como badge automático. `card` (default) es el
   * editor de siempre (sheet de rutas).
   */
  variant?: "card" | "fila";
  /** Tramo OCULTO del PDF: la fila se atenúa (no sale en la hoja). */
  legAtenuado?: (idx: number, leg: EscalaInput) => boolean;
  routes?: RouteOption[];
  airports: AirportOption[];
  defaultOrigin?: string;
  /** Cotizador: avisa (sin bloquear) si la ruta comercial no abre/cierra en CUN. */
  avisoAnclaCun?: boolean;
  /**
   * Alta de aeropuerto sin salir del cotizador (28-ago): habilita "Crear XXX"
   * en la ruta rápida y el acceso "+ Nuevo aeropuerto" junto a los tramos. El
   * padre agrega el aeropuerto a `airports` (estado local) y queda
   * seleccionable al instante. Sin coordenadas no hay haversine: las millas
   * quedan en 0 y se teclean.
   */
  onAeropuertoCreado?: (airport: Airport) => void;
  /**
   * Contenido extra en el encabezado de cada tramo (edición directa,
   * 8-sep-2026): aquí cuelgan los toggles de PDF (ocultar / fecha) que
   * antes solo existían en lectura. null = nada para ese tramo.
   */
  legExtra?: (idx: number, leg: EscalaInput) => ReactNode;
}) {
  // Inicializa con un tramo si está vacío.
  useEffect(() => {
    if (value.length === 0) {
      onChange([{ origen_iata: defaultOrigin, destino_iata: "", millas_nauticas: 0 }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const airportOptions = useMemo(
    () =>
      airports.map((a) => ({
        value: a.iata,
        label: a.iata,
        description: a.nombre,
      })),
    [airports],
  );

  // Millas náuticas del par (catálogo de distancias por aerovía → rutas
  // guardadas → haversine cuando el catálogo ya respondió). FUENTE ÚNICA
  // `useLookupNm` (8-sep-2026): la hoja editable (`QuoteSheetItinerario`)
  // autocompleta con la misma regla.
  const { lookupNm } = useLookupNm(routes, airports);

  // Rellena millas faltantes en tramos ya completos (origen+destino) — p. ej.
  // al hidratar una plantilla o al cargar el catálogo de coordenadas. Se dispara
  // solo cuando cambian los EXTREMOS, no al teclear millas (no pelea con la
  // captura manual).
  // La llave incluye el conteo de tramos completos SIN millas: al aplicar
  // una plantilla/importar tramos con los MISMOS extremos pero millas en 0,
  // el efecto debe re-correr (27-ago — antes quedaba atascado en 0).
  const endpointsKey =
    value.map((l) => `${l.origen_iata}-${l.destino_iata}`).join("|") +
    `#z${value.filter((l) => l.origen_iata && l.destino_iata && !(Number(l.millas_nauticas) > 0)).length}`;
  useEffect(() => {
    let changed = false;
    const next = value.map((l) => {
      if (Number(l.millas_nauticas) > 0 || !l.origen_iata || !l.destino_iata) return l;
      const nm = lookupNm(l.origen_iata, l.destino_iata);
      if (nm === null) return l;
      changed = true;
      return { ...l, millas_nauticas: nm };
    });
    if (changed) onChange(next);
    // lookupNm ya es estable por sus fuentes (useCallback en el hook);
    // value se cubre con endpointsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointsKey, lookupNm]);

  const updateLeg = (idx: number, patch: Partial<EscalaInput>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    // Si cambiamos destino, propaga al origen del siguiente tramo (continuidad).
    if (patch.destino_iata !== undefined && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], origen_iata: patch.destino_iata };
    }
    // Autocompleta NM si tenemos ambos extremos y una ruta predefinida coincide.
    if (patch.destino_iata !== undefined || patch.origen_iata !== undefined) {
      const o = next[idx].origen_iata;
      const d = next[idx].destino_iata;
      const nm = lookupNm(o, d);
      if (nm !== null) next[idx].millas_nauticas = nm;
    }
    onChange(next);
  };

  const addLeg = () => {
    const last = value[value.length - 1];
    const newLeg: EscalaInput = {
      origen_iata: last?.destino_iata ?? defaultOrigin,
      destino_iata: "",
      millas_nauticas: 0,
    };
    onChange([...value, newLeg]);
  };

  const removeLeg = (idx: number) => {
    if (value.length <= 1) return;
    const next = value.filter((_, i) => i !== idx);
    // Restaurar continuidad: origen del nuevo siguiente = destino del nuevo previo.
    if (idx > 0 && idx <= next.length - 1) {
      next[idx] = { ...next[idx], origen_iata: next[idx - 1].destino_iata };
    }
    onChange(next);
  };

  // ===== Ruta rápida: "CUN, HOL, CUN" + Enter arma los tramos de golpe =====
  // ¿Hay CAPTURA que se perdería al reemplazar? El esqueleto de ruta
  // (origen/destino/millas) no cuenta: reponerlo cuesta un Enter y en el
  // cotizador la plantilla lo hidrata siempre (el diálogo saldría en todos
  // los usos). Lo irrecuperable son pasajeros, fechas, notas y banderas.
  const hayDatosTramos = value.some(
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

  const aplicarRutaRapida = (codigos: string[]) => {
    const next: EscalaInput[] = [];
    for (let i = 0; i < codigos.length - 1; i++) {
      next.push({
        origen_iata: codigos[i],
        destino_iata: codigos[i + 1],
        // Si el catálogo aún no carga, el efecto de autollenado la completa después.
        millas_nauticas: lookupNm(codigos[i], codigos[i + 1]) ?? 0,
      });
    }
    onChange(next);
  };

  const nmTotal = value.reduce((acc, l) => acc + (Number(l.millas_nauticas) || 0), 0);

  // Resumen del VIAJE por día (multi-día): agrupa los tramos por el día
  // Cancún de su fecha (datetime-local ya viene en pared Cancún); un tramo
  // sin fecha hereda el día del anterior. Solo se pinta con 2+ días.
  const resumenDias = useMemo(() => {
    const dias: { dia: string; tramos: string[]; pernocta: string | null }[] =
      [];
    let diaActual: string | null = null;
    for (const l of value) {
      const d = l.fecha_salida_plan ? l.fecha_salida_plan.slice(0, 10) : null;
      if (d) diaActual = d;
      const key = diaActual ?? "";
      let bucket = dias.find((x) => x.dia === key);
      if (!bucket) {
        bucket = { dia: key, tramos: [], pernocta: null };
        dias.push(bucket);
      }
      if (l.origen_iata && l.destino_iata) {
        bucket.tramos.push(`${l.origen_iata}→${l.destino_iata}`);
        if (l.requiere_pernocta) bucket.pernocta = l.destino_iata;
      }
    }
    return dias.filter((x) => x.dia && x.tramos.length > 0);
  }, [value]);
  const esMultiDia = resumenDias.length > 1;

  // Filas con la NOTA al piloto abierta (solo `fila`): estado de UI. Una
  // nota con texto siempre se muestra; el chip solo abre el campo.
  const [notasAbiertas, setNotasAbiertas] = useState<Set<number>>(() => new Set());
  const abrirNota = (idx: number) =>
    setNotasAbiertas((prev) => (prev.has(idx) ? prev : new Set(prev).add(idx)));
  const cerrarNota = (idx: number) =>
    setNotasAbiertas((prev) => {
      if (!prev.has(idx)) return prev;
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });

  const avisoAnclaNode =
    avisoAnclaCun &&
    value.length > 0 &&
    value[0].origen_iata &&
    value[value.length - 1].destino_iata &&
    (value[0].origen_iata !== "CUN" ||
      value[value.length - 1].destino_iata !== "CUN") ? (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        La ruta comercial normalmente abre y cierra en CUN (hoy:{" "}
        {value[0].origen_iata} → … → {value[value.length - 1].destino_iata}).
      </p>
    ) : null;

  const pieNode = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLeg}
            className="gap-1.5"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {variant === "fila" ? "Tramo" : "Agregar tramo"}
          </Button>
          {onAeropuertoCreado && (
            <AirportQuickCreateButton onCreated={onAeropuertoCreado} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{fmtDecimal(nmTotal)}</span> NM totales ·{" "}
          {value.length} {value.length === 1 ? "tramo" : "tramos"}
        </p>
      </div>

      {esMultiDia && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-3 space-y-1.5">
          <p className="text-xs font-semibold">
            Viaje de {resumenDias.length} días
          </p>
          {resumenDias.map((d, i) => (
            <p key={d.dia} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Día {i + 1} · {d.dia.split("-").reverse().join("/")}:
              </span>{" "}
              {d.tramos.join(" · ")}
              {d.pernocta && (
                <span className="text-amber-600 dark:text-amber-400"> · pernocta en {d.pernocta}</span>
              )}
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Todo el viaje se cotiza y cobra como UN solo vuelo (una hora
            mínima, un folio). La pernocta se marca A MANO en el tramo donde
            el piloto duerme fuera — el sistema no la activa solo.
          </p>
        </div>
      )}
    </>
  );

  if (variant === "fila") {
    const chipCls = (on: boolean, tono: "amber" | "sky" | "neutral" = "neutral") =>
      cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        on
          ? tono === "amber"
            ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : tono === "sky"
              ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-400"
              : "border-foreground/40 bg-muted text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      );
    // `@container` (revisión 8-sep): la fila responde al ancho REAL del
    // editor (≥28rem = una línea; menos = NM/Pax bajan con su etiqueta), no
    // al viewport — con el aside de la página única o la vista previa
    // anclada el documento es mucho más angosto que la ventana. Los controles
    // del PDF (fecha · ojito) viven en la línea de chips: en la cabecera
    // aplastaban los selects de origen/destino.
    return (
      <div className="@container space-y-2">
        <RutaRapidaInput
          airports={airports}
          hayDatos={hayDatosTramos}
          onAplicar={aplicarRutaRapida}
          onAeropuertoCreado={onAeropuertoCreado}
        />
        {avisoAnclaNode}
        {/* Encabezado de la tabla (solo con ancho; en angosto cada fila se lee sola). */}
        <div className="hidden @md:grid @md:grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_4.5rem_2rem] @md:items-end @md:gap-2 px-1 text-[10px] uppercase tracking-wider text-foreground/60">
          <span>#</span>
          <span>Tramo</span>
          <span className="text-right">NM</span>
          <span className="text-right">Pax</span>
          <span />
        </div>
        <ol className="space-y-1.5">
          {value.map((leg, idx) => {
            const isFirst = idx === 0;
            const originLocked = !isFirst;
            const sobrevuelo = !!leg.origen_iata && leg.origen_iata === leg.destino_iata;
            const atenuado = legAtenuado?.(idx, leg) === true;
            const notaVisible = notasAbiertas.has(idx) || (leg.notas ?? "").trim() !== "";
            const extra = legExtra?.(idx, leg);
            return (
              <li
                key={idx}
                className={cn(
                  "rounded-lg border border-border bg-card px-2 py-1.5 space-y-1.5 transition-opacity",
                  atenuado && "opacity-60",
                )}
                title={atenuado ? "Oculto en el PDF del cliente (se sigue cobrando)" : undefined}
              >
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 @md:grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_4.5rem_2rem]">
                  <span className="font-mono text-xs text-muted-foreground">{idx + 1}</span>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                    <SearchableSelect
                      options={airportOptions}
                      value={leg.origen_iata}
                      onChange={(v) => updateLeg(idx, { origen_iata: v })}
                      placeholder="IATA"
                      disabled={originLocked}
                      className="h-8"
                    />
                    <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <SearchableSelect
                      options={airportOptions}
                      value={leg.destino_iata}
                      onChange={(v) => updateLeg(idx, { destino_iata: v })}
                      placeholder="IATA"
                      className="h-8"
                    />
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 @md:col-start-auto @md:contents">
                    <label className="flex items-center gap-1 @md:contents">
                      <span className="text-[10px] uppercase tracking-wider text-foreground/60 @md:hidden">
                        NM
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        aria-label="Millas náuticas"
                        value={leg.millas_nauticas || ""}
                        onChange={(e) =>
                          updateLeg(idx, {
                            millas_nauticas: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="NM"
                        className={cn(
                          "h-8 w-[5.5rem] text-right font-mono",
                          leg.millas_nauticas > 0 ? "" : "border-amber-500/40",
                        )}
                      />
                    </label>
                    <label className="flex items-center gap-1 @md:contents">
                      <span className="text-[10px] uppercase tracking-wider text-foreground/60 @md:hidden">
                        Pax
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        disabled={leg.es_ferry}
                        aria-label="Pasajeros del tramo (TUAS)"
                        title="Pasajeros de ESTE tramo (TUAS). Vacío = usa el global."
                        value={leg.es_ferry ? 0 : (leg.pasajeros ?? "")}
                        onChange={(e) =>
                          updateLeg(idx, {
                            pasajeros:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        placeholder="global"
                        className="h-8 w-[4.5rem] text-right font-mono"
                      />
                    </label>
                    <span className="flex items-center justify-end gap-1.5 @md:justify-self-end">
                      {value.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLeg(idx)}
                          aria-label={`Quitar tramo ${idx + 1}`}
                          title="Quitar tramo"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                </div>
                {/* Banderas por fila: chips (aria-pressed) con su detalle en línea. */}
                <div className="flex flex-wrap items-center gap-1.5 pl-[2.25rem]">
                  <button
                    type="button"
                    aria-pressed={leg.es_ferry ?? false}
                    onClick={() =>
                      updateLeg(idx, {
                        es_ferry: !leg.es_ferry,
                        ...(!leg.es_ferry ? { pasajeros: 0 } : {}),
                      })
                    }
                    title="Ferry (vacío): cobra tiempo y calzos, sin pasajeros ni TUAS."
                    className={chipCls(leg.es_ferry ?? false)}
                  >
                    ⚑ Ferry
                  </button>
                  <button
                    type="button"
                    aria-pressed={leg.requiere_pernocta ?? false}
                    onClick={() =>
                      updateLeg(idx, {
                        requiere_pernocta: !leg.requiere_pernocta,
                        ...(!leg.requiere_pernocta && leg.pernocta_costo_usd == null
                          ? { pernocta_costo_usd: PERNOCTA_COSTO_DEFAULT_USD }
                          : {}),
                      })
                    }
                    title="El piloto pernocta tras este tramo: viático cobrado al cliente (sin IVA)."
                    className={chipCls(leg.requiere_pernocta ?? false, "amber")}
                  >
                    ⛺ Pernocta
                  </button>
                  {leg.requiere_pernocta && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      $
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label="Costo de la pernocta (USD)"
                        value={leg.pernocta_costo_usd ?? ""}
                        onChange={(e) =>
                          updateLeg(idx, {
                            pernocta_costo_usd:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        placeholder={String(PERNOCTA_COSTO_DEFAULT_USD)}
                        className="h-7 w-20 text-right font-mono"
                      />
                      USD
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={leg.tipo_parada === "SERVICIO"}
                    onClick={() =>
                      updateLeg(idx, {
                        tipo_parada: leg.tipo_parada === "SERVICIO" ? "NORMAL" : "SERVICIO",
                        ...(leg.tipo_parada === "SERVICIO" ? { servicio_notas: null } : {}),
                      })
                    }
                    title="Parada de servicio / técnica (cambiar llanta, revisión, carga de material)."
                    className={chipCls(leg.tipo_parada === "SERVICIO", "sky")}
                  >
                    🔧 Servicio
                  </button>
                  <button
                    type="button"
                    aria-pressed={notaVisible}
                    onClick={() => abrirNota(idx)}
                    title="Nota del tramo para el piloto (no se imprime en el PDF)."
                    className={chipCls(notaVisible)}
                  >
                    📝 Nota
                  </button>
                  {sobrevuelo && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-sky-500/40 text-sky-600 dark:text-sky-400"
                      title="Mismo aeropuerto: tramo de sobrevuelo (ej. Zona Hotelera / Isla Mujeres). Las millas definen el tiempo cobrado."
                    >
                      Sobrevuelo
                    </Badge>
                  )}
                  {atenuado && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Oculto en el PDF
                    </Badge>
                  )}
                  {/* Solo PDF (fecha · ojito): a la derecha de los chips, con
                      su etiqueta para que no se confunda con la operación. */}
                  {extra && (
                    <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-foreground/60">
                        PDF
                      </span>
                      {extra}
                    </span>
                  )}
                </div>
                {leg.tipo_parada === "SERVICIO" && (
                  <div className="pl-[2.25rem]">
                    <Input
                      value={leg.servicio_notas ?? ""}
                      onChange={(e) => updateLeg(idx, { servicio_notas: e.target.value })}
                      placeholder="Detalle del servicio · ej. aterriza en Toledo a cambiar llanta"
                      aria-label="Detalle de la parada de servicio"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {notaVisible && (
                  <div className="flex items-center gap-1.5 pl-[2.25rem]">
                    <Input
                      value={leg.notas ?? ""}
                      onChange={(e) => updateLeg(idx, { notas: e.target.value })}
                      placeholder='Nota para el piloto · ej. "cargar gasolina aquí" (no se imprime)'
                      aria-label="Nota del tramo para el piloto"
                      className="h-8 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        updateLeg(idx, { notas: null });
                        cerrarNota(idx);
                      }}
                      aria-label="Quitar la nota del tramo"
                      title="Quitar la nota"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {pieNode}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RutaRapidaInput
        airports={airports}
        hayDatos={hayDatosTramos}
        onAplicar={aplicarRutaRapida}
        onAeropuertoCreado={onAeropuertoCreado}
      />
      {avisoAnclaNode}
      <div className="space-y-2">
        {value.map((leg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === value.length - 1;
          const originLocked = !isFirst; // los origenes intermedios vienen del tramo previo
          return (
            <div
              key={idx}
              className="rounded-lg border border-brand-600/40 bg-card p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/70">
                  Tramo {idx + 1}
                  {isFirst && " · salida"}
                  {isLast && value.length > 1 && " · llegada"}
                </span>
                {legExtra && (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    {legExtra(idx, leg)}
                  </span>
                )}
                {value.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLeg(idx)}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Origen
                  </Label>
                  <SearchableSelect
                    options={airportOptions}
                    value={leg.origen_iata}
                    onChange={(v) => updateLeg(idx, { origen_iata: v })}
                    placeholder="IATA"
                    disabled={originLocked}
                  />
                </div>
                <ArrowRightIcon className="h-4 w-4 text-muted-foreground mb-2" />
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Destino
                  </Label>
                  <SearchableSelect
                    options={airportOptions}
                    value={leg.destino_iata}
                    onChange={(v) => updateLeg(idx, { destino_iata: v })}
                    placeholder="IATA"
                  />
                </div>
              </div>
              {leg.origen_iata &&
                leg.origen_iata === leg.destino_iata && (
                  <p className="text-[11px] text-sky-600 dark:text-sky-400">
                    Mismo aeropuerto: tramo de <strong>sobrevuelo</strong> (ej.
                    Zona Hotelera / Isla Mujeres). Las millas definen el tiempo
                    cobrado.
                  </p>
                )}
              {/* Solo lo COMERCIAL (limpieza 25-ago): fecha/hora, nota al
                  piloto y manifiesto se capturan en lo OPERATIVO. PASAJEROS
                  por tramo SÍ se queda (regresó 26-ago): el TUAS se calcula
                  con el pax de CADA tramo (leg.pasajeros ?? global) y un
                  tramo puede llevar 4 y otro 2. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Millas náuticas
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={leg.millas_nauticas || ""}
                    onChange={(e) =>
                      updateLeg(idx, {
                        millas_nauticas: Number(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className={cn(
                      leg.millas_nauticas > 0 ? "" : "border-amber-500/40",
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Pasajeros (TUAS)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={leg.es_ferry}
                    value={leg.es_ferry ? 0 : (leg.pasajeros ?? "")}
                    onChange={(e) =>
                      updateLeg(idx, {
                        pasajeros:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="usa global"
                  />
                </div>
              </div>

              {/* Detalle del tramo: ferry, pernocta, parada de servicio */}
              <div className="rounded-md border border-border bg-navy-800/60 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">Ferry (vacío)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Cobra tiempo y calzos, sin pasajeros ni TUAS.
                    </p>
                  </div>
                  <Switch
                    checked={leg.es_ferry ?? false}
                    onCheckedChange={(c) =>
                      updateLeg(idx, { es_ferry: c, ...(c ? { pasajeros: 0 } : {}) })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">Pernocta</Label>
                  <div className="flex items-center gap-2">
                    {leg.requiere_pernocta && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={leg.pernocta_costo_usd ?? ""}
                          onChange={(e) =>
                            updateLeg(idx, {
                              pernocta_costo_usd:
                                e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder={String(PERNOCTA_COSTO_DEFAULT_USD)}
                          className="h-8 w-24"
                        />
                      </div>
                    )}
                    <Switch
                      checked={leg.requiere_pernocta ?? false}
                      onCheckedChange={(c) =>
                        updateLeg(idx, {
                          requiere_pernocta: c,
                          ...(c && leg.pernocta_costo_usd == null
                            ? { pernocta_costo_usd: PERNOCTA_COSTO_DEFAULT_USD }
                            : {}),
                        })
                      }
                    />
                  </div>
                </div>

                {/* "Mostrar en PDF" se movió al DETALLE de la cotización
                    (1-sep): el switch aquí rehidrataba del snapshot y un
                    guardado sin la bandera la regresaba a visible. La
                    visibilidad vive en la escala VIVA y el cotizador ya no
                    la manda (el API la conserva cuando no viaja). */}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Parada de servicio</Label>
                    <Switch
                      checked={leg.tipo_parada === "SERVICIO"}
                      onCheckedChange={(c) =>
                        updateLeg(idx, {
                          tipo_parada: c ? "SERVICIO" : "NORMAL",
                          ...(c ? {} : { servicio_notas: null }),
                        })
                      }
                    />
                  </div>
                  {leg.tipo_parada === "SERVICIO" && (
                    <Textarea
                      rows={2}
                      value={leg.servicio_notas ?? ""}
                      onChange={(e) =>
                        updateLeg(idx, { servicio_notas: e.target.value })
                      }
                      placeholder="Ej. aterriza en Toledo a cambiar llanta"
                      className="text-sm"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pieNode}
    </div>
  );
}
