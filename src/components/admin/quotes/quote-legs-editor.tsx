"use client";

import { useEffect, useMemo, useState } from "react";
import { getDistanciasAction } from "@/app/admin/distancias/actions";
import { PlusIcon, TrashIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { fmtDecimal } from "@/lib/format";
import type { EscalaInput } from "@/types/quote";

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

const EARTH_RADIUS_NM = 3440.065;

/** Distancia ortodrómica (great-circle) en millas náuticas entre dos coordenadas. */
function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
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
}: {
  value: EscalaInput[];
  onChange: (legs: EscalaInput[]) => void;
  routes?: RouteOption[];
  airports: AirportOption[];
  defaultOrigin?: string;
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

  // Mapa par origen-destino → NM, construido desde los tramos de las rutas
  // Catálogo de distancias por aerovía (fuente prioritaria del autollenado:
  // la distancia directa queda corta cuando hay que volar por aerovía).
  const [distanciasCatalogo, setDistanciasCatalogo] = useState<
    Map<string, number>
  >(new Map());
  useEffect(() => {
    let alive = true;
    getDistanciasAction().then((r) => {
      if (!alive || !r.ok || !r.data) return;
      const map = new Map<string, number>();
      for (const d of r.data) {
        const o = d.origen_iata.toUpperCase();
        const dd = d.destino_iata.toUpperCase();
        const nm = Number(d.millas_nauticas);
        if (!nm) continue;
        map.set(`${o}-${dd}`, nm);
        // La aerovía de regreso puede diferir: solo se asume simétrica si el
        // par inverso no está cargado explícitamente.
        if (!map.has(`${dd}-${o}`)) map.set(`${dd}-${o}`, nm);
      }
      // Reaplica los pares explícitos por si el inverso pisó alguno.
      for (const d of r.data) {
        map.set(
          `${d.origen_iata.toUpperCase()}-${d.destino_iata.toUpperCase()}`,
          Number(d.millas_nauticas),
        );
      }
      setDistanciasCatalogo(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // guardadas (cada tramo es one-way). Ambos sentidos comparten millas.
  const nmByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of routes ?? []) {
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

  // Coordenadas por IATA (para calcular distancia cuando no hay ruta guardada).
  const coordByIata = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const a of airports) {
      const lat = Number(a.latitud);
      const lon = Number(a.longitud);
      if (a.latitud == null || a.longitud == null) continue;
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      map.set(a.iata.toUpperCase(), { lat, lon });
    }
    return map;
  }, [airports]);

  /**
   * Millas náuticas del par: primero busca en los tramos de rutas guardadas
   * (dato medido); si no existe, calcula la distancia ortodrómica con las
   * coordenadas del catálogo (editable después).
   */
  const lookupNm = (origen: string, destino: string): number | null => {
    if (!origen || !destino) return null;
    const o = origen.toUpperCase();
    const d = destino.toUpperCase();
    // 1) Catálogo de distancias por aerovía (dato validado por operaciones).
    const catalogo = distanciasCatalogo.get(`${o}-${d}`);
    if (catalogo != null) return catalogo;
    const saved = nmByPair.get(`${o}-${d}`);
    if (saved != null) return saved;
    const co = coordByIata.get(o);
    const cd = coordByIata.get(d);
    if (!co || !cd) return null;
    return Math.round(haversineNm(co.lat, co.lon, cd.lat, cd.lon) * 100) / 100;
  };

  // Rellena millas faltantes en tramos ya completos (origen+destino) — p. ej.
  // al hidratar una plantilla o al cargar el catálogo de coordenadas. Se dispara
  // solo cuando cambian los EXTREMOS, no al teclear millas (no pelea con la
  // captura manual).
  const endpointsKey = value
    .map((l) => `${l.origen_iata}-${l.destino_iata}`)
    .join("|");
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
    // lookupNm depende de nmByPair/coordByIata/distanciasCatalogo (incluidos);
    // value se cubre con endpointsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointsKey, nmByPair, coordByIata, distanciasCatalogo]);

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

  const nmTotal = value.reduce((acc, l) => acc + (Number(l.millas_nauticas) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((leg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === value.length - 1;
          const originLocked = !isFirst; // los origenes intermedios vienen del tramo previo
          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Tramo {idx + 1}
                  {isFirst && " · salida"}
                  {isLast && value.length > 1 && " · llegada"}
                </span>
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
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Pasajeros
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={leg.es_ferry}
                    value={leg.es_ferry ? 0 : (leg.pasajeros ?? "")}
                    onChange={(e) =>
                      updateLeg(idx, {
                        pasajeros: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="usa global"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Fecha y hora del tramo (opcional)
                </Label>
                <Input
                  type="datetime-local"
                  value={leg.fecha_salida_plan ?? ""}
                  onChange={(e) =>
                    updateLeg(idx, {
                      fecha_salida_plan: e.target.value || null,
                    })
                  }
                />
              </div>

              {/* Nota operativa de este tramo para el piloto (la ve en su app). */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Nota del tramo para el piloto (opcional)
                </Label>
                <Textarea
                  rows={2}
                  value={leg.notas ?? ""}
                  onChange={(e) =>
                    updateLeg(idx, { notas: e.target.value || null })
                  }
                  placeholder='Ej. "Cargar gasolina aquí", "revisar llanta"…'
                />
              </div>

              {/* Manifiesto por tramo: los pasajeros pueden cambiar entre escalas. */}
              {!leg.es_ferry && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Nombres de pasajeros (opcional)
                  </Label>
                  <Textarea
                    rows={3}
                    value={(leg.pasajeros_nombres ?? []).join("\n")}
                    onChange={(e) =>
                      updateLeg(idx, {
                        pasajeros_nombres: e.target.value.split("\n"),
                      })
                    }
                    placeholder={"Uno por línea (puede ir vacío)\nJuan Pérez\nMaría López"}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Específico de este tramo. Útil para permisos; puede ir vacío.
                  </p>
                </div>
              )}

              {/* Detalle del tramo: ferry, pernocta, parada de servicio */}
              <div className="rounded-md bg-background/60 border border-border/60 p-2 space-y-2">
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

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLeg}
          className="gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar tramo
        </Button>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{fmtDecimal(nmTotal)}</span> NM totales ·{" "}
          {value.length} {value.length === 1 ? "tramo" : "tramos"}
        </p>
      </div>
    </div>
  );
}
