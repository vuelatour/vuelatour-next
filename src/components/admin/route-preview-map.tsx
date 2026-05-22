"use client";

import { useMemo } from "react";
import { geoIdentity, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import peninsulaGeoJSON from "@/components/public/yucatan-peninsula.json";

/**
 * Preview de ruta sobre la Península de Yucatán para el admin (cotizador y
 * rutas). Reusa el mismo GeoJSON y proyección del hero público. Dibuja los
 * aeropuertos con coordenadas y resalta origen→destino con un arco.
 *
 * Pensado para desktop: el contenedor padre debe ocultarlo en móvil
 * (ej. `hidden xl:block`).
 */

const VIEW_W = 600;
const VIEW_H = 500;

const peninsula = peninsulaGeoJSON as FeatureCollection<Geometry>;

const projection = geoIdentity()
  .reflectY(true)
  .fitExtent(
    [
      [30, 35],
      [VIEW_W - 50, VIEW_H - 35],
    ],
    peninsula,
  );

const pathGen = geoPath(projection);
const STATE_PATHS = peninsula.features
  .map((f) => pathGen(f))
  .filter((d): d is string => Boolean(d));

function project(lng: number, lat: number) {
  const r = projection([lng, lat]);
  return { x: r?.[0] ?? 0, y: r?.[1] ?? 0 };
}

function toPct(x: number, y: number) {
  return { left: (x / VIEW_W) * 100, top: (y / VIEW_H) * 100 };
}

function arc(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const px = -dy / dist;
  const py = dx / dist;
  const h = dist * 0.22;
  return `M ${from.x} ${from.y} Q ${midX + px * h} ${midY + py * h} ${to.x} ${to.y}`;
}

export interface MapAirport {
  iata: string;
  latitud: number | string | null;
  longitud: number | string | null;
}

function coord(a: MapAirport | undefined) {
  if (!a || a.latitud == null || a.longitud == null) return null;
  const lat = Number(a.latitud);
  const lon = Number(a.longitud);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

export function RoutePreviewMap({
  airports,
  originIata,
  destinationIata,
}: {
  airports: MapAirport[];
  originIata?: string;
  destinationIata?: string;
}) {
  const points = useMemo(
    () =>
      airports
        .map((a) => {
          const c = coord(a);
          if (!c) return null;
          return { iata: a.iata, ...project(c.lon, c.lat) };
        })
        .filter((p): p is { iata: string; x: number; y: number } => p !== null),
    [airports],
  );

  const origin = originIata
    ? points.find((p) => p.iata === originIata.toUpperCase())
    : undefined;
  const destination = destinationIata
    ? points.find((p) => p.iata === destinationIata.toUpperCase())
    : undefined;
  const path = origin && destination ? arc(origin, destination) : null;

  return (
    <div className="relative aspect-[6/5] w-full overflow-hidden rounded-xl bg-gradient-to-br from-navy-900/40 to-navy-950 ring-1 ring-navy-800">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="rp-land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a3a5c" />
            <stop offset="100%" stopColor="#102a43" />
          </linearGradient>
        </defs>

        <g fill="url(#rp-land)" stroke="#2d5a8a" strokeWidth="1" strokeLinejoin="round">
          {STATE_PATHS.map((d, i) => (
            <path key={`s-${i}`} d={d} />
          ))}
        </g>

        {/* aeropuertos tenues */}
        <g>
          {points.map((p) => (
            <circle key={p.iata} cx={p.x} cy={p.y} r={2} fill="#9fb3c8" opacity={0.5} />
          ))}
        </g>

        {/* arco origen → destino */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#e63946"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset="100"
            style={{ animation: "rpDraw 0.8s ease-out forwards" }}
          />
        )}
      </svg>

      {/* labels de aeropuertos */}
      {points.map((p) => {
        const pct = toPct(p.x, p.y);
        const isEndpoint = p.iata === origin?.iata || p.iata === destination?.iata;
        return (
          <span
            key={`lbl-${p.iata}`}
            className={`pointer-events-none absolute -translate-x-1/2 translate-y-1.5 whitespace-nowrap text-[9px] font-medium ${
              isEndpoint ? "font-bold text-white" : "text-navy-400"
            }`}
            style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
          >
            {p.iata}
          </span>
        );
      })}

      {/* marcadores origen/destino */}
      {[origin, destination].map((p, idx) =>
        p ? (
          <span
            key={`mk-${idx}-${p.iata}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${toPct(p.x, p.y).left}%`, top: `${toPct(p.x, p.y).top}%` }}
          >
            <span className="block size-3 rounded-full bg-brand-500 ring-2 ring-white shadow-[0_0_12px_rgba(230,57,70,0.7)]" />
          </span>
        ) : null,
      )}

      {!origin || !destination ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-navy-400">
          Selecciona origen y destino para ver la ruta
        </div>
      ) : null}

      <style>{`@keyframes rpDraw { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}
