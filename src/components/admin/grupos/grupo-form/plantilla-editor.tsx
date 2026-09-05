"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { getDistanciasAction } from "@/app/admin/distancias/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RutaRapidaInput } from "@/components/admin/ruta-rapida-input";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import { haversineNm } from "@/lib/admin/geo";
import { cn } from "@/lib/utils";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { Airport } from "@/types/airports";
import {
  PERNOCTA_COSTO_DEFAULT_USD,
  tramoVacio,
  type AeropuertoOption,
  type PlantillaTramoForm,
  type RutaOption,
} from "./types";

/**
 * Editor de la RUTA PLANTILLA del grupo: los tramos comunes que vuela cada
 * avión (origen/destino/millas, ferry, pernocta, parada de servicio, nota al
 * piloto y ocultar en PDF). A propósito NO captura pasajeros ni fecha por
 * tramo: los fija el armador por avión (pax de cada avión, salidas
 * escalonadas). Misma ruta rápida "CUN, CZA, CUN"+Enter y mismo autollenado
 * de millas (catálogo de distancias → rutas guardadas → haversine) que el
 * cotizador de un avión.
 *
 * `lectura` (página única del grupo, 5-sep-2026): los mismos tramos en el
 * mismo orden pero como texto legible (sin inputs, sin agregar/quitar, sin
 * ruta rápida); no consulta el catálogo de distancias ni rellena millas.
 */
export function PlantillaEditor({
  value,
  onChange,
  routes,
  airports,
  onAeropuertoCreado,
  disabled = false,
  lectura = false,
}: {
  value: PlantillaTramoForm[];
  onChange: (tramos: PlantillaTramoForm[]) => void;
  routes: RutaOption[];
  airports: AeropuertoOption[];
  onAeropuertoCreado?: (airport: Airport) => void;
  disabled?: boolean;
  lectura?: boolean;
}) {
  const airportOptions = useMemo(
    () => airports.map((a) => ({ value: a.iata, label: a.iata, description: a.nombre })),
    [airports],
  );

  // Catálogo de distancias por aerovía (fuente prioritaria). Hasta que
  // responda, no se cae al haversine: una ruta aplicada en frío congelaría la
  // distancia directa (más corta que la aerovía).
  const [distanciasCatalogo, setDistanciasCatalogo] = useState<Map<string, number>>(new Map());
  const [catalogoListo, setCatalogoListo] = useState(false);
  useEffect(() => {
    // En lectura no hay nada que autollenar: no se consulta el catálogo.
    if (lectura) return;
    let alive = true;
    getDistanciasAction()
      .then((r) => {
        if (!alive || !r.ok || !r.data) return;
        const map = new Map<string, number>();
        for (const d of r.data) {
          const o = d.origen_iata.toUpperCase();
          const dd = d.destino_iata.toUpperCase();
          const nm = Number(d.millas_nauticas);
          if (!nm) continue;
          map.set(`${o}-${dd}`, nm);
          if (!map.has(`${dd}-${o}`)) map.set(`${dd}-${o}`, nm);
        }
        for (const d of r.data) {
          map.set(
            `${d.origen_iata.toUpperCase()}-${d.destino_iata.toUpperCase()}`,
            Number(d.millas_nauticas),
          );
        }
        setDistanciasCatalogo(map);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setCatalogoListo(true);
      });
    return () => {
      alive = false;
    };
  }, [lectura]);

  const nmByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of routes) {
      for (const t of r.tramos ?? []) {
        const o = t.origen_iata.toUpperCase();
        const d = t.destino_iata.toUpperCase();
        const nm = Number(t.millas_nauticas);
        if (!nm) continue;
        if (!map.has(`${o}-${d}`)) map.set(`${o}-${d}`, nm);
        if (!map.has(`${d}-${o}`)) map.set(`${d}-${o}`, nm);
      }
    }
    return map;
  }, [routes]);

  const coordByIata = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const a of airports) {
      if (a.latitud == null || a.longitud == null) continue;
      const lat = Number(a.latitud);
      const lon = Number(a.longitud);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      map.set(a.iata.toUpperCase(), { lat, lon });
    }
    return map;
  }, [airports]);

  const lookupNm = (origen: string, destino: string): number | null => {
    if (!origen || !destino) return null;
    const o = origen.toUpperCase();
    const d = destino.toUpperCase();
    const catalogo = distanciasCatalogo.get(`${o}-${d}`);
    if (catalogo != null) return catalogo;
    const saved = nmByPair.get(`${o}-${d}`);
    if (saved != null) return saved;
    const co = coordByIata.get(o);
    const cd = coordByIata.get(d);
    if (!co || !cd || !catalogoListo) return null;
    return Math.round(haversineNm(co.lat, co.lon, cd.lat, cd.lon) * 100) / 100;
  };

  // Rellena millas faltantes cuando cambian los EXTREMOS o llega el catálogo
  // (no al teclear millas: no pelea con la captura manual).
  const endpointsKey =
    value.map((l) => `${l.origen_iata}-${l.destino_iata}`).join("|") +
    `#z${value.filter((l) => l.origen_iata && l.destino_iata && !(Number(l.millas_nauticas) > 0)).length}`;
  useEffect(() => {
    if (lectura) return;
    let changed = false;
    const next = value.map((l) => {
      if (Number(l.millas_nauticas) > 0 || !l.origen_iata || !l.destino_iata) return l;
      const nm = lookupNm(l.origen_iata, l.destino_iata);
      if (nm === null) return l;
      changed = true;
      return { ...l, millas_nauticas: nm };
    });
    if (changed) onChange(next);
    // lookupNm depende de los mapas incluidos; value se cubre con endpointsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointsKey, nmByPair, coordByIata, distanciasCatalogo, catalogoListo, lectura]);

  const updateLeg = (idx: number, patch: Partial<PlantillaTramoForm>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    if (patch.destino_iata !== undefined && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], origen_iata: patch.destino_iata };
    }
    if (patch.destino_iata !== undefined || patch.origen_iata !== undefined) {
      const nm = lookupNm(next[idx].origen_iata, next[idx].destino_iata);
      if (nm !== null) next[idx].millas_nauticas = nm;
    }
    onChange(next);
  };

  const addLeg = () => {
    const last = value[value.length - 1];
    onChange([...value, tramoVacio(last?.destino_iata ?? "CUN")]);
  };

  const removeLeg = (idx: number) => {
    if (value.length <= 1) return;
    const next = value.filter((_, i) => i !== idx);
    if (idx > 0 && idx <= next.length - 1) {
      next[idx] = { ...next[idx], origen_iata: next[idx - 1].destino_iata };
    }
    onChange(next);
  };

  // Captura que se perdería al reemplazar por la ruta rápida (el esqueleto
  // origen/destino/millas no cuenta: reponerlo cuesta un Enter).
  const hayDatosTramos = value.some(
    (l) =>
      l.notas !== "" ||
      l.servicio_notas !== "" ||
      l.es_ferry ||
      l.requiere_pernocta ||
      l.tipo_parada === "SERVICIO" ||
      l.pdf_oculto,
  );

  const aplicarRutaRapida = (codigos: string[]) => {
    const next: PlantillaTramoForm[] = [];
    for (let i = 0; i < codigos.length - 1; i++) {
      next.push({
        ...tramoVacio(codigos[i]),
        destino_iata: codigos[i + 1],
        millas_nauticas: lookupNm(codigos[i], codigos[i + 1]) ?? 0,
      });
    }
    onChange(next);
  };

  const nmTotal = value.reduce((acc, l) => acc + (Number(l.millas_nauticas) || 0), 0);
  const primero = value[0];
  const ultimo = value[value.length - 1];
  const fueraDeCun =
    !!primero?.origen_iata &&
    !!ultimo?.destino_iata &&
    (primero.origen_iata !== "CUN" || ultimo.destino_iata !== "CUN");
  // Doble vuelta solo aplica a plantillas de ida y vuelta (par de tramos que
  // cierran en el origen): se avisa aquí para que no sorprenda en Aviones.
  const idaYVuelta =
    value.length >= 2 &&
    value.length % 2 === 0 &&
    !!primero?.origen_iata &&
    primero.origen_iata === ultimo?.destino_iata;

  if (lectura) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Es la ruta que vuela CADA avión del grupo. Los pasajeros por tramo y la
          hora de salida de cada avión los pone el armador (sección Aviones).
        </p>
        {fueraDeCun && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            La ruta comercial normalmente abre y cierra en CUN (hoy:{" "}
            {primero.origen_iata} → … → {ultimo.destino_iata}).
          </p>
        )}
        <ol className="space-y-1.5">
          {value.map((leg, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === value.length - 1;
            const sobrevuelo = !!leg.origen_iata && leg.origen_iata === leg.destino_iata;
            return (
              <li
                key={idx}
                className={cn(
                  "rounded-lg border border-brand-600/40 bg-card px-3 py-2 space-y-1",
                  leg.pdf_oculto && "border-dashed opacity-90",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground/70">
                      Tramo {idx + 1}
                      {isFirst && " · salida"}
                      {isLast && value.length > 1 && " · llegada"}
                    </span>
                    <span className="font-mono text-sm font-semibold">
                      {leg.origen_iata || "—"} → {leg.destino_iata || "—"}
                    </span>
                    {leg.es_ferry && (
                      <Badge variant="outline" className="text-[10px]" title="Cobra tiempo y calzos, sin pasajeros ni TUAS">
                        ferry
                      </Badge>
                    )}
                    {leg.requiere_pernocta && (
                      <Badge variant="outline" className="text-[10px]" title="El piloto duerme fuera tras este tramo (viático por avión)">
                        pernocta{" "}
                        {fmtUsd(leg.pernocta_costo_usd ?? PERNOCTA_COSTO_DEFAULT_USD)}
                      </Badge>
                    )}
                    {leg.tipo_parada === "SERVICIO" && (
                      <Badge variant="outline" className="text-[10px]">
                        parada de servicio
                      </Badge>
                    )}
                    {sobrevuelo && (
                      <Badge variant="outline" className="text-[10px] text-sky-600 dark:text-sky-400">
                        sobrevuelo
                      </Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        leg.pdf_oculto ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                      )}
                      title={
                        leg.pdf_oculto
                          ? "Oculto en el PDF del cliente (se cobra igual)."
                          : "Visible en el PDF del cliente."
                      }
                    >
                      {leg.pdf_oculto ? (
                        <EyeSlashIcon className="h-3.5 w-3.5" />
                      ) : (
                        <EyeIcon className="h-3.5 w-3.5" />
                      )}
                      {leg.pdf_oculto ? "Oculto en PDF" : "En PDF"}
                    </span>
                    <span className={cn("font-mono shrink-0", leg.millas_nauticas > 0 ? "text-foreground" : "text-amber-600 dark:text-amber-400")}>
                      {leg.millas_nauticas > 0 ? `${fmtDecimal(leg.millas_nauticas)} NM` : "sin millas"}
                    </span>
                  </span>
                </div>
                {(leg.servicio_notas || leg.notas) && (
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {leg.tipo_parada === "SERVICIO" && leg.servicio_notas && (
                      <p>
                        <span className="font-medium text-foreground/70">Servicio:</span>{" "}
                        <span className="whitespace-pre-wrap">{leg.servicio_notas}</span>
                      </p>
                    )}
                    {leg.notas && (
                      <p>
                        <span className="font-medium text-foreground/70">Nota al piloto:</span>{" "}
                        {leg.notas}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-right text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{fmtDecimal(nmTotal)}</span> NM ·{" "}
          {value.length} {value.length === 1 ? "tramo" : "tramos"}
          {idaYVuelta ? " · ida y vuelta (admite doble vuelta)" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!disabled && (
        <RutaRapidaInput
          airports={airports}
          hayDatos={hayDatosTramos}
          onAplicar={aplicarRutaRapida}
          onAeropuertoCreado={onAeropuertoCreado}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Es la ruta que vuela CADA avión del grupo. Los pasajeros por tramo y la
        hora de salida de cada avión los pone el armador (sección Aviones).
      </p>
      {fueraDeCun && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          La ruta comercial normalmente abre y cierra en CUN (hoy:{" "}
          {primero.origen_iata} → … → {ultimo.destino_iata}).
        </p>
      )}
      <div className="space-y-2">
        {value.map((leg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === value.length - 1;
          return (
            <div
              key={idx}
              className={cn(
                "rounded-lg border border-brand-600/40 bg-card p-3 space-y-2",
                leg.pdf_oculto && "border-dashed opacity-90",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/70">
                  Tramo {idx + 1}
                  {isFirst && " · salida"}
                  {isLast && value.length > 1 && " · llegada"}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => updateLeg(idx, { pdf_oculto: !leg.pdf_oculto })}
                    title={
                      leg.pdf_oculto
                        ? "Oculto en el PDF del cliente (se cobra igual). Clic para mostrarlo."
                        : "Visible en el PDF del cliente. Clic para ocultarlo (se sigue cobrando)."
                    }
                    className={cn(
                      "inline-flex items-center gap-1 text-xs transition-colors",
                      leg.pdf_oculto
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {leg.pdf_oculto ? (
                      <EyeSlashIcon className="h-3.5 w-3.5" />
                    ) : (
                      <EyeIcon className="h-3.5 w-3.5" />
                    )}
                    {leg.pdf_oculto ? "Oculto en PDF" : "En PDF"}
                  </button>
                  {value.length > 1 && !disabled && (
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
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr_120px] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Origen
                  </Label>
                  <SearchableSelect
                    options={airportOptions}
                    value={leg.origen_iata}
                    onChange={(v) => updateLeg(idx, { origen_iata: v })}
                    placeholder="IATA"
                    disabled={disabled || !isFirst}
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
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Millas náuticas
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={disabled}
                    value={leg.millas_nauticas || ""}
                    onChange={(e) =>
                      updateLeg(idx, { millas_nauticas: Number(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                    className={cn(leg.millas_nauticas > 0 ? "" : "border-amber-500/40")}
                  />
                </div>
              </div>
              {leg.origen_iata && leg.origen_iata === leg.destino_iata && (
                <p className="text-[11px] text-sky-600 dark:text-sky-400">
                  Mismo aeropuerto: tramo de <strong>sobrevuelo</strong>. Las millas
                  definen el tiempo cobrado.
                </p>
              )}

              <div className="rounded-md border border-border bg-navy-800/60 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">Ferry (vacío)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Cobra tiempo y calzos, sin pasajeros ni TUAS.
                    </p>
                  </div>
                  <Switch
                    disabled={disabled}
                    checked={leg.es_ferry}
                    onCheckedChange={(c) => updateLeg(idx, { es_ferry: c })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs font-medium">Pernocta</Label>
                    <p className="text-[10px] text-muted-foreground">
                      El piloto duerme fuera tras este tramo (viático por avión).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {leg.requiere_pernocta && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={disabled}
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
                      disabled={disabled}
                      checked={leg.requiere_pernocta}
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
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Parada de servicio</Label>
                    <Switch
                      disabled={disabled}
                      checked={leg.tipo_parada === "SERVICIO"}
                      onCheckedChange={(c) =>
                        updateLeg(idx, {
                          tipo_parada: c ? "SERVICIO" : "NORMAL",
                          ...(c ? {} : { servicio_notas: "" }),
                        })
                      }
                    />
                  </div>
                  {leg.tipo_parada === "SERVICIO" && (
                    <Textarea
                      rows={2}
                      disabled={disabled}
                      value={leg.servicio_notas}
                      onChange={(e) => updateLeg(idx, { servicio_notas: e.target.value })}
                      placeholder="Ej. aterriza a cambiar llanta"
                      className="text-sm"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Nota al piloto (opcional)</Label>
                  <Input
                    disabled={disabled}
                    value={leg.notas}
                    onChange={(e) => updateLeg(idx, { notas: e.target.value })}
                    placeholder="Ej. cargar gasolina aquí"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={addLeg} className="gap-1.5">
              <PlusIcon className="h-3.5 w-3.5" />
              Agregar tramo
            </Button>
          )}
          {onAeropuertoCreado && !disabled && (
            <AirportQuickCreateButton onCreated={onAeropuertoCreado} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{fmtDecimal(nmTotal)}</span> NM ·{" "}
          {value.length} {value.length === 1 ? "tramo" : "tramos"}
          {idaYVuelta ? " · ida y vuelta (admite doble vuelta)" : ""}
        </p>
      </div>
    </div>
  );
}
