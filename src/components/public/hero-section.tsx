"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, RotateCw, Users } from "lucide-react";
import { geoIdentity, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";

import { cn } from "@/lib/utils";
import peninsulaGeoJSON from "./yucatan-peninsula.json";

/**
 * Hero interactivo "mapa vivo de la Península de Yucatán".
 *
 * Geografía:
 *   - GeoJSON real de los 3 estados (CONABIO 2023, simplificado con mapshaper).
 *   - Proyección d3-geo Mercator, ajustada al viewBox con `fitExtent`.
 *   - Cada ciudad se proyecta desde su [lng, lat] real con la MISMA proyección
 *     → siempre cae geográficamente donde debe.
 *
 * Interacción:
 *   - Autoplay rota destinos cada 4.2s; hover sobre el mapa pausa.
 *   - Click en un destino mata autoplay hasta el botón "Resume".
 *   - Path animado de Cancún al destino activo (cuadrática Bézier, draw-in).
 *   - Mini-card flotante con duración / pax / precio anclada al destino.
 */

const VIEW_W = 600;
const VIEW_H = 500;

const peninsula = peninsulaGeoJSON as FeatureCollection<Geometry>;

// Proyección planar (equirectangular vía geoIdentity). Para un área tan
// pequeña como la Península la distorsión vs Mercator es imperceptible y
// `geoIdentity` evita problemas de winding-order que rompían fitExtent con
// geoMercator. `reflectY(true)` invierte el eje Y porque las latitudes
// crecen hacia el norte (arriba) pero el viewBox SVG crece hacia abajo.
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

const CANCUN = project(-86.85, 21.16);

type LabelSide = "right" | "left" | "above" | "below";

type Destination = {
  id: string;
  name: string;
  /** Coordenadas reales: [lng, lat] en grados decimales. */
  lng: number;
  lat: number;
  duration: string;
  priceFrom: number;
  tagline: string;
  pax: string;
  labelSide: LabelSide;
};

const DESTINATIONS_RAW: Destination[] = [
  {
    id: "isla-mujeres",
    name: "Isla Mujeres",
    lng: -86.7325,
    lat: 21.232,
    duration: "15 min",
    priceFrom: 540,
    tagline: "Turquoise waters & sea turtles.",
    pax: "1-5 pax",
    labelSide: "right",
  },
  {
    id: "holbox",
    name: "Holbox",
    lng: -87.3785,
    lat: 21.523,
    duration: "35 min",
    priceFrom: 1_650,
    tagline: "Pink lagoons & whale sharks.",
    pax: "1-6 pax",
    labelSide: "above",
  },
  {
    id: "cozumel",
    name: "Cozumel",
    lng: -86.9223,
    lat: 20.422,
    duration: "20 min",
    priceFrom: 1_200,
    tagline: "Diving capital of the Caribbean.",
    pax: "1-6 pax",
    labelSide: "right",
  },
  {
    id: "tulum",
    name: "Tulum",
    lng: -87.4658,
    lat: 20.213,
    duration: "25 min",
    priceFrom: 1_400,
    tagline: "Mayan ruins on the beach.",
    pax: "1-6 pax",
    labelSide: "left",
  },
  {
    id: "chichen-itza",
    name: "Chichén Itzá",
    lng: -88.5678,
    lat: 20.6843,
    duration: "30 min",
    priceFrom: 1_850,
    tagline: "A wonder of the world, 30 minutes away.",
    pax: "1-6 pax",
    labelSide: "below",
  },
  {
    id: "merida",
    name: "Mérida",
    lng: -89.6237,
    lat: 20.9674,
    duration: "55 min",
    priceFrom: 2_200,
    tagline: "Colonial capital of Yucatán.",
    pax: "1-9 pax",
    labelSide: "left",
  },
  {
    id: "bacalar",
    name: "Bacalar",
    lng: -88.3937,
    lat: 18.6766,
    duration: "60 min",
    priceFrom: 2_400,
    tagline: "The seven-color lagoon.",
    pax: "1-9 pax",
    labelSide: "right",
  },
];

type ProjectedDestination = Destination & { x: number; y: number };

const DESTINATIONS: ProjectedDestination[] = DESTINATIONS_RAW.map((d) => ({
  ...d,
  ...project(d.lng, d.lat),
}));

const MAP_CENTER = { x: VIEW_W / 2, y: VIEW_H / 2 } as const;

function flightPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const px = -dy / dist;
  const py = dx / dist;
  const arcHeight = dist * 0.25;
  const ax1 = midX + px * arcHeight;
  const ay1 = midY + py * arcHeight;
  const ax2 = midX - px * arcHeight;
  const ay2 = midY - py * arcHeight;
  const d1 = (ax1 - MAP_CENTER.x) ** 2 + (ay1 - MAP_CENTER.y) ** 2;
  const d2 = (ax2 - MAP_CENTER.x) ** 2 + (ay2 - MAP_CENTER.y) ** 2;
  const [cpX, cpY] = d1 > d2 ? [ax1, ay1] : [ax2, ay2];
  return `M ${from.x} ${from.y} Q ${cpX} ${cpY} ${to.x} ${to.y}`;
}

function toPct(x: number, y: number) {
  return {
    left: (x / VIEW_W) * 100,
    top: (y / VIEW_H) * 100,
  };
}

export function HeroSection() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [autoplayKilled, setAutoplayKilled] = useState(false);

  useEffect(() => {
    if (autoplayPaused || autoplayKilled) return;
    const id = window.setInterval(() => {
      setSelectedIdx((i) => (i + 1) % DESTINATIONS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [autoplayPaused, autoplayKilled]);

  const dest = DESTINATIONS[selectedIdx];
  const path = useMemo(() => flightPath(CANCUN, dest), [dest]);

  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(230,57,70,0.18),transparent_55%),radial-gradient(circle_at_85%_75%,rgba(28,69,135,0.45),transparent_60%)]"
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24 lg:grid lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:pt-24 lg:pb-28">
        <div className="lg:col-span-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-green-500/15 px-3 py-1 text-xs font-medium text-green-400 ring-1 ring-green-500/25">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
            </span>
            Available today
          </span>

          <p className="mt-6 text-base font-medium text-navy-300 sm:text-lg">
            The fastest way to fly to
          </p>
          <h1
            key={dest.id + "-name"}
            className="mt-1 text-6xl font-bold leading-[0.95] tracking-tight text-brand-500 sm:text-7xl lg:text-[5.5rem] xl:text-8xl"
            style={{ animation: "heroFade 0.5s ease-out" }}
          >
            {dest.name}
          </h1>

          <p
            key={dest.id + "-tag"}
            className="mt-5 max-w-md text-base text-navy-200 sm:text-lg"
            style={{ animation: "heroFade 0.6s ease-out" }}
          >
            {dest.tagline}
          </p>

          <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2 text-navy-200">
              <Clock className="size-4 text-navy-400" />
              <span>{dest.duration} flight</span>
            </div>
            <div className="flex items-center gap-2 text-navy-200">
              <Users className="size-4 text-navy-400" />
              <span>{dest.pax}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">
                From
              </span>
              <span
                key={dest.id + "-price"}
                className="text-xl font-bold text-white"
                style={{ animation: "heroFade 0.5s ease-out" }}
              >
                ${dest.priceFrom.toLocaleString()}
                <span className="ml-0.5 text-xs font-medium text-navy-300">
                  USD
                </span>
              </span>
            </div>
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/quote?to=${dest.id}`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 text-base font-semibold text-white shadow-lg shadow-brand-900/40 transition-all hover:-translate-y-0.5 hover:bg-brand-700"
            >
              Book this flight
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/charter-flights"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-navy-700 bg-navy-900/60 px-7 text-base font-semibold text-white transition-colors hover:bg-navy-800"
            >
              All destinations
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-4 text-xs text-navy-400">
            {autoplayKilled ? (
              <button
                type="button"
                onClick={() => setAutoplayKilled(false)}
                className="inline-flex items-center gap-1.5 font-medium text-navy-300 transition-colors hover:text-white"
              >
                <RotateCw className="size-3" />
                Resume tour
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex size-1.5 rounded-full bg-brand-500" />
                Auto-touring · hover the map to lock a destination
              </span>
            )}
          </div>
        </div>

        <div className="mt-10 lg:col-span-7 lg:mt-0">
          <YucatanMap
            destinations={DESTINATIONS}
            selectedIdx={selectedIdx}
            path={path}
            onHover={(i) => setSelectedIdx(i)}
            onSelect={(i) => {
              setSelectedIdx(i);
              setAutoplayKilled(true);
            }}
            onContainerEnter={() => setAutoplayPaused(true)}
            onContainerLeave={() => setAutoplayPaused(false)}
          />
        </div>
      </div>

      <style>{`
        @keyframes heroFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pathDraw {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </section>
  );
}

function YucatanMap({
  destinations,
  selectedIdx,
  path,
  onHover,
  onSelect,
  onContainerEnter,
  onContainerLeave,
}: {
  destinations: ProjectedDestination[];
  selectedIdx: number;
  path: string;
  onHover: (idx: number) => void;
  onSelect: (idx: number) => void;
  onContainerEnter: () => void;
  onContainerLeave: () => void;
}) {
  const selected = destinations[selectedIdx];
  const cancunPct = toPct(CANCUN.x, CANCUN.y);

  return (
    <div
      className="relative aspect-[6/5] w-full rounded-3xl bg-gradient-to-br from-navy-900/40 to-navy-950 ring-1 ring-navy-800"
      onMouseEnter={onContainerEnter}
      onMouseLeave={onContainerLeave}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a3a5c" />
            <stop offset="100%" stopColor="#102a43" />
          </linearGradient>
          <filter id="pathGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sea grid. atmósfera carta aeronáutica. */}
        <g opacity="0.06" stroke="#9fb3c8" strokeWidth="0.5">
          {[100, 200, 300, 400].map((y) => (
            <line key={`h-${y}`} x1="0" y1={y} x2={VIEW_W} y2={y} />
          ))}
          {[150, 300, 450].map((x) => (
            <line key={`v-${x}`} x1={x} y1="0" x2={x} y2={VIEW_H} />
          ))}
        </g>

        {/* Sombra de la península (offset suave). */}
        <g transform="translate(2 4)" opacity="0.55">
          {STATE_PATHS.map((d, i) => (
            <path key={`shadow-${i}`} d={d} fill="#0a1828" />
          ))}
        </g>

        {/* Estados. donde dos paths comparten frontera el stroke se duplica
            sutilmente y se ve la frontera estatal. */}
        <g
          fill="url(#land)"
          stroke="#2d5a8a"
          strokeWidth="1"
          strokeLinejoin="round"
        >
          {STATE_PATHS.map((d, i) => (
            <path key={`state-${i}`} d={d} />
          ))}
        </g>

        {/* Coastline reforzada por encima. */}
        <g
          fill="none"
          stroke="#3a6da8"
          strokeWidth="1.2"
          strokeLinejoin="round"
          opacity="0.45"
        >
          {STATE_PATHS.map((d, i) => (
            <path key={`coast-${i}`} d={d} />
          ))}
        </g>

        {/* Ghost network. todas las rutas desde Cancún muy tenues. */}
        <g
          opacity="0.18"
          fill="none"
          stroke="#9fb3c8"
          strokeWidth="1"
          strokeDasharray="3 5"
        >
          {destinations.map((d) => (
            <path key={`ghost-${d.id}`} d={flightPath(CANCUN, d)} />
          ))}
        </g>

        {/* Path activo animado (remount al cambiar destino). */}
        <path
          key={selected.id}
          d={path}
          fill="none"
          stroke="#e63946"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#pathGlow)"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
          style={{ animation: "pathDraw 0.9s ease-out forwards" }}
        />
      </svg>

      {/* === Overlays HTML. labels y marcadores siempre crujientes === */}

      <div
        className="pointer-events-none absolute size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-2xl"
        style={{ left: `${cancunPct.left}%`, top: `${cancunPct.top}%` }}
      />

      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${cancunPct.left}%`, top: `${cancunPct.top}%` }}
      >
        <span className="relative flex size-4">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
          <span className="relative inline-flex size-4 rounded-full bg-brand-500 ring-2 ring-white shadow-[0_0_20px_rgba(230,57,70,0.8)]" />
        </span>
        <div className="absolute right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 text-right">
          <p className="whitespace-nowrap text-[11px] font-bold leading-none text-white">
            CANCÚN
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[9px] uppercase tracking-wider text-navy-400">
            origin
          </p>
        </div>
      </div>

      {destinations.map((d, i) => (
        <DestinationMarker
          key={d.id}
          dest={d}
          isActive={i === selectedIdx}
          onHover={() => onHover(i)}
          onSelect={() => onSelect(i)}
        />
      ))}

      <FloatingTicket dest={selected} />

      <div className="pointer-events-none absolute right-4 bottom-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-navy-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex size-3 items-center justify-center rounded-full border border-navy-600">
            <span className="block size-1 rounded-full bg-navy-400" />
          </span>
          N
        </span>
        <span className="border-l border-navy-700 pl-3">YUCATÁN · MX</span>
      </div>
    </div>
  );
}

function DestinationMarker({
  dest,
  isActive,
  onHover,
  onSelect,
}: {
  dest: ProjectedDestination;
  isActive: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const pct = toPct(dest.x, dest.y);

  const labelClass = (() => {
    switch (dest.labelSide) {
      case "left":
        return "absolute right-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2 text-right";
      case "above":
        return "absolute bottom-[calc(100%+0.3rem)] left-1/2 -translate-x-1/2 text-center";
      case "below":
        return "absolute top-[calc(100%+0.3rem)] left-1/2 -translate-x-1/2 text-center";
      case "right":
      default:
        return "absolute left-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2";
    }
  })();

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
      style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
      aria-label={`Fly Cancún to ${dest.name}. ${dest.duration}, from $${dest.priceFrom.toLocaleString()} USD`}
      aria-pressed={isActive}
    >
      <span
        className={cn(
          "relative block rounded-full ring-2 transition-all duration-200",
          isActive
            ? "size-3.5 bg-brand-500 ring-white shadow-[0_0_18px_rgba(230,57,70,0.75)]"
            : "size-2.5 bg-white ring-navy-700 group-hover:size-3 group-hover:ring-white",
        )}
      />
      <span
        className={cn(
          "pointer-events-none whitespace-nowrap font-medium leading-tight transition-colors",
          isActive
            ? "text-[11px] font-bold text-white"
            : "text-[10px] text-navy-300 group-hover:text-white",
          labelClass,
        )}
      >
        {dest.name}
      </span>
    </button>
  );
}

function FloatingTicket({ dest }: { dest: ProjectedDestination }) {
  const pct = toPct(dest.x, dest.y);
  const placeRight = pct.left < 55;
  const placeBottom = pct.top < 55;

  return (
    <div
      key={dest.id}
      className="pointer-events-none absolute z-10 w-[170px]"
      style={{
        left: `${pct.left}%`,
        top: `${pct.top}%`,
        transform: `translate(${placeRight ? "1.5rem" : "calc(-100% - 1.5rem)"}, ${placeBottom ? "1rem" : "calc(-100% - 1rem)"})`,
        animation: "heroFade 0.4s ease-out",
      }}
    >
      <div className="rounded-xl border border-navy-700 bg-navy-900/95 p-3 shadow-xl backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">
          {dest.duration} · {dest.pax}
        </p>
        <p className="mt-0.5 text-sm font-bold text-white">{dest.name}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="text-[10px] uppercase tracking-wide text-navy-400">
            From
          </span>
          <span className="text-base font-bold text-white">
            ${dest.priceFrom.toLocaleString()}
            <span className="ml-0.5 text-[10px] text-navy-300">USD</span>
          </span>
        </p>
      </div>
    </div>
  );
}
