"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { haversineNm } from "@/lib/admin/geo";
import { getDistanciasAction } from "@/app/admin/distancias/actions";

/**
 * Millas náuticas de un par de aeropuertos (FUENTE ÚNICA del autollenado,
 * extraída de `QuoteLegsEditor` el 8-sep-2026 para que la hoja editable
 * autocomplete igual). Prioridad:
 *  1) catálogo de distancias por aerovía (`getDistanciasAction`, dato
 *     validado por operaciones; el par inverso se asume simétrico solo si
 *     no está cargado explícito);
 *  2) tramos de las rutas guardadas (`routes[].tramos`, ambos sentidos);
 *  3) haversine con las coordenadas del catálogo — SOLO cuando el catálogo
 *     de distancias ya respondió (`catalogoListo`): una ruta aplicada en
 *     frío congelaría la distancia directa (más corta que la aerovía).
 * null = sin dato (el operador teclea las millas).
 */
export interface RutaConTramos {
  tramos?: { origen_iata: string; destino_iata: string; millas_nauticas: number }[];
}

export interface AeropuertoConCoords {
  iata: string;
  latitud?: number | string | null;
  longitud?: number | string | null;
}

export function useLookupNm(
  routes: RutaConTramos[] | undefined,
  airports: AeropuertoConCoords[],
): {
  lookupNm: (origen: string, destino: string) => number | null;
  catalogoListo: boolean;
} {
  const [distanciasCatalogo, setDistanciasCatalogo] = useState<Map<string, number>>(new Map());
  const [catalogoListo, setCatalogoListo] = useState(false);
  useEffect(() => {
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
        // Reaplica los pares explícitos por si el inverso pisó alguno.
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
  }, []);

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

  const lookupNm = useCallback(
    (origen: string, destino: string): number | null => {
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
    },
    [distanciasCatalogo, nmByPair, coordByIata, catalogoListo],
  );

  return { lookupNm, catalogoListo };
}
