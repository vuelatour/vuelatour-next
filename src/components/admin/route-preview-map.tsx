"use client";

import { useMemo } from "react";
import { geoIdentity, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import peninsulaGeoJSON from "@/components/public/yucatan-peninsula.json";

/**
 * Preview de ruta sobre la Península de Yucatán para el admin (cotizador y
 * rutas). Reusa el mismo GeoJSON y proyección del hero público.
 *
 * Dos modos:
 * - `originIata`/`destinationIata`: un solo arco origen→destino (rutas SIMPLE).
 * - `legs`: itinerario multiescala completo — dibuja cada tramo en orden con su
 *   número de secuencia, tramos ferry punteados, y marca pernocta/servicio en
 *   la parada correspondiente.
 *
 * El mapa hace ZOOM AUTOMÁTICO al área que cubren los puntos del itinerario
 * (con animación); sin tramos/selección se muestra la península completa.
 *
 * Pensado para desktop: el contenedor padre debe ocultarlo en móvil
 * (ej. `hidden lg:block`).
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

interface Pt {
  x: number;
  y: number;
}

/** Transición compartida entre el <g> del SVG y los overlays HTML. */
const ZOOM_MS = 700;
const ZOOM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Arco cuadrático entre dos puntos. `lift` controla qué tanto se separa de la
 * línea recta (para que tramos repetidos A→B / B→A no se encimen). Devuelve el
 * path y el punto medio del arco (para colocar el número de secuencia).
 */
function arc(from: Pt, to: Pt, lift = 0.22) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const px = -dy / dist;
  const py = dx / dist;
  const h = dist * lift;
  const cx = midX + px * h;
  const cy = midY + py * h;
  // Punto del bezier cuadrático en t=0.5: 0.25·P0 + 0.5·C + 0.25·P1.
  const mid = {
    x: 0.25 * from.x + 0.5 * cx + 0.25 * to.x,
    y: 0.25 * from.y + 0.5 * cy + 0.25 * to.y,
  };
  return { d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`, mid };
}

export interface MapAirport {
  iata: string;
  latitud: number | string | null;
  longitud: number | string | null;
}

/** Tramo del itinerario a pintar (subset de EscalaInput). */
export interface MapLeg {
  origen_iata: string;
  destino_iata: string;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  tipo_parada?: "NORMAL" | "SERVICIO" | null;
}

function coord(a: MapAirport | undefined) {
  if (!a || a.latitud == null || a.longitud == null) return null;
  const lat = Number(a.latitud);
  const lon = Number(a.longitud);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

const FERRY_COLOR = "#7da2c1";
const LEG_COLOR = "#e63946";

export function RoutePreviewMap({
  airports,
  originIata,
  destinationIata,
  legs,
}: {
  airports: MapAirport[];
  originIata?: string;
  destinationIata?: string;
  /** Itinerario multiescala. Si se pasa, tiene prioridad sobre origin/destination. */
  legs?: MapLeg[];
}) {
  const points = useMemo(
    () =>
      airports
        .map((a) => {
          const c = coord(a);
          if (!c) return null;
          return { iata: a.iata.toUpperCase(), ...project(c.lon, c.lat) };
        })
        .filter((p): p is { iata: string; x: number; y: number } => p !== null),
    [airports],
  );

  const byIata = useMemo(
    () => new Map(points.map((p) => [p.iata, p])),
    [points],
  );

  // ----- Modo multiescala: tramos completos -----
  const drawnLegs = useMemo(() => {
    if (!legs) return null;
    const out: Array<{
      idx: number;
      esFerry: boolean;
      from: { iata: string; x: number; y: number };
      to: { iata: string; x: number; y: number };
      lift: number;
    }> = [];
    // Cuenta repeticiones del mismo par (sin importar sentido) para separar arcos.
    const pairSeen = new Map<string, number>();
    legs.forEach((leg, idx) => {
      const from = byIata.get(leg.origen_iata?.toUpperCase() ?? "");
      const to = byIata.get(leg.destino_iata?.toUpperCase() ?? "");
      if (!from || !to || from.iata === to.iata) return;
      const key = [from.iata, to.iata].sort().join("-");
      const seen = pairSeen.get(key) ?? 0;
      pairSeen.set(key, seen + 1);
      // Cada repetición del par eleva un poco más el arco para no encimarse.
      out.push({ idx, esFerry: leg.es_ferry === true, from, to, lift: 0.22 + seen * 0.05 });
    });
    return out;
  }, [legs, byIata]);

  /** Paradas del itinerario con sus flags (pernocta/servicio se marcan en el destino del tramo). */
  const stops = useMemo(() => {
    if (!legs) return null;
    const map = new Map<
      string,
      { pernocta: boolean; servicio: boolean; isStart: boolean; isEnd: boolean }
    >();
    const mark = (iata: string | undefined, patch: Partial<{ pernocta: boolean; servicio: boolean; isStart: boolean; isEnd: boolean }>) => {
      const key = iata?.toUpperCase();
      if (!key || !byIata.has(key)) return;
      const cur = map.get(key) ?? {
        pernocta: false,
        servicio: false,
        isStart: false,
        isEnd: false,
      };
      map.set(key, { ...cur, ...patch });
    };
    legs.forEach((leg, idx) => {
      mark(leg.origen_iata, idx === 0 ? { isStart: true } : {});
      mark(leg.destino_iata, {
        ...(idx === legs.length - 1 ? { isEnd: true } : {}),
        ...(leg.requiere_pernocta ? { pernocta: true } : {}),
        ...(leg.tipo_parada === "SERVICIO" ? { servicio: true } : {}),
      });
    });
    return map;
  }, [legs, byIata]);

  // ----- Modo simple: origen → destino -----
  const origin = originIata ? byIata.get(originIata.toUpperCase()) : undefined;
  const destination = destinationIata
    ? byIata.get(destinationIata.toUpperCase())
    : undefined;

  const multiMode = !!legs;
  const hasDrawn = multiMode
    ? (drawnLegs?.length ?? 0) > 0
    : !!(origin && destination);
  const visitedIatas = new Set<string>(
    multiMode
      ? (drawnLegs ?? []).flatMap((l) => [l.from.iata, l.to.iata])
      : [origin?.iata, destination?.iata].filter((v): v is string => !!v),
  );

  // ----- Zoom automático al área del itinerario -----
  // Encuadra los puntos visitados con padding; sin puntos = península completa.
  const zoom = useMemo(() => {
    const focus: Pt[] = multiMode
      ? (drawnLegs ?? []).flatMap((l) => [l.from, l.to])
      : ([origin, destination].filter(Boolean) as Pt[]);
    if (focus.length === 0) return { k: 1, tx: 0, ty: 0 };

    const PAD = 55; // margen alrededor del encuadre (en unidades del viewBox)
    const MIN_W = 220; // encuadre mínimo: evita sobre-acercar pares muy próximos
    const MIN_H = 180;
    let minX = Math.min(...focus.map((p) => p.x)) - PAD;
    let maxX = Math.max(...focus.map((p) => p.x)) + PAD;
    let minY = Math.min(...focus.map((p) => p.y)) - PAD;
    let maxY = Math.max(...focus.map((p) => p.y)) + PAD;
    if (maxX - minX < MIN_W) {
      const cx = (minX + maxX) / 2;
      minX = cx - MIN_W / 2;
      maxX = cx + MIN_W / 2;
    }
    if (maxY - minY < MIN_H) {
      const cy = (minY + maxY) / 2;
      minY = cy - MIN_H / 2;
      maxY = cy + MIN_H / 2;
    }
    const k = Math.min(2.6, Math.min(VIEW_W / (maxX - minX), VIEW_H / (maxY - minY)));
    // Si el itinerario abarca casi todo el mapa, quédate en vista completa.
    if (k <= 1.05) return { k: 1, tx: 0, ty: 0 };
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      k: Math.round(k * 1000) / 1000,
      tx: Math.round((VIEW_W / 2 - k * cx) * 10) / 10,
      ty: Math.round((VIEW_H / 2 - k * cy) * 10) / 10,
    };
  }, [multiMode, drawnLegs, origin, destination]);

  /** Aplica el zoom a un punto (para los overlays HTML, que viven fuera del <g>). */
  const tp = (p: Pt): Pt => ({ x: p.x * zoom.k + zoom.tx, y: p.y * zoom.k + zoom.ty });
  const k = zoom.k;

  const simplePath = !legs && origin && destination ? arc(origin, destination).d : null;

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

        {/* Todo el contenido geográfico vive en este <g>: el zoom anima parejo. */}
        <g
          style={{
            transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${k})`,
            transformOrigin: "0 0",
            transition: `transform ${ZOOM_MS}ms ${ZOOM_EASE}`,
          }}
        >
          <g
            fill="url(#rp-land)"
            stroke="#2d5a8a"
            strokeWidth={1 / k}
            strokeLinejoin="round"
          >
            {STATE_PATHS.map((d, i) => (
              <path key={`s-${i}`} d={d} />
            ))}
          </g>

          {/* aeropuertos tenues */}
          <g>
            {points.map((p) => (
              <circle key={p.iata} cx={p.x} cy={p.y} r={2 / k} fill="#9fb3c8" opacity={0.5} />
            ))}
          </g>

          {/* arco simple origen → destino */}
          {simplePath && (
            <path
              d={simplePath}
              fill="none"
              stroke={LEG_COLOR}
              strokeWidth={2.5 / k}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset="100"
              style={{ animation: "rpDraw 0.8s ease-out forwards" }}
            />
          )}

          {/* itinerario multiescala: un arco por tramo, dibujado en secuencia */}
          {(drawnLegs ?? []).map((l) => {
            const { d } = arc(l.from, l.to, l.lift);
            return (
              <path
                key={`leg-${l.idx}`}
                d={d}
                fill="none"
                stroke={l.esFerry ? FERRY_COLOR : LEG_COLOR}
                strokeWidth={(l.esFerry ? 2 : 2.5) / k}
                strokeLinecap="round"
                pathLength={100}
                // El dash de ferry se aplica tras la animación (ver rpDrawDash).
                strokeDasharray="100"
                strokeDashoffset="100"
                style={{
                  animation: `${l.esFerry ? "rpDrawDash" : "rpDraw"} 0.5s ease-out ${l.idx * 0.18}s forwards`,
                }}
              />
            );
          })}

          {/* número de secuencia de cada tramo */}
          {(drawnLegs ?? []).map((l) => {
            const { mid } = arc(l.from, l.to, l.lift);
            return (
              <g
                key={`seq-${l.idx}`}
                style={{
                  opacity: 0,
                  animation: `rpFade 0.3s ease-out ${l.idx * 0.18 + 0.35}s forwards`,
                }}
              >
                <circle
                  cx={mid.x}
                  cy={mid.y}
                  r={9 / k}
                  fill={l.esFerry ? "#33506b" : "#a4161a"}
                  stroke={l.esFerry ? FERRY_COLOR : "#ff8c94"}
                  strokeWidth={1 / k}
                />
                <text
                  x={mid.x}
                  y={mid.y + 3.5 / k}
                  textAnchor="middle"
                  fontSize={10 / k}
                  fontWeight="700"
                  fill="#fff"
                >
                  {l.idx + 1}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* labels de aeropuertos */}
      {points.map((p) => {
        const isVisited = visitedIatas.has(p.iata);
        const q = tp(p);
        const pct = toPct(q.x, q.y);
        return (
          <span
            key={`lbl-${p.iata}`}
            className={`pointer-events-none absolute -translate-x-1/2 translate-y-1.5 whitespace-nowrap text-[9px] font-medium ${
              isVisited ? "font-bold text-white" : "text-navy-400"
            }`}
            style={{
              left: `${pct.left}%`,
              top: `${pct.top}%`,
              transition: `left ${ZOOM_MS}ms ${ZOOM_EASE}, top ${ZOOM_MS}ms ${ZOOM_EASE}`,
            }}
          >
            {p.iata}
          </span>
        );
      })}

      {/* marcadores: modo simple (origen/destino) */}
      {!multiMode &&
        [origin, destination].map((p, idx) => {
          if (!p) return null;
          const q = tp(p);
          const pct = toPct(q.x, q.y);
          return (
            <span
              key={`mk-${idx}-${p.iata}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${pct.left}%`,
                top: `${pct.top}%`,
                transition: `left ${ZOOM_MS}ms ${ZOOM_EASE}, top ${ZOOM_MS}ms ${ZOOM_EASE}`,
              }}
            >
              <span className="block size-3 rounded-full bg-brand-500 ring-2 ring-white shadow-[0_0_12px_rgba(230,57,70,0.7)]" />
            </span>
          );
        })}

      {/* marcadores: modo multiescala (paradas con flags) */}
      {multiMode &&
        stops &&
        [...stops.entries()].map(([iata, info]) => {
          const p = byIata.get(iata);
          if (!p) return null;
          const q = tp(p);
          const pct = toPct(q.x, q.y);
          const ring = info.pernocta
            ? "ring-amber-400"
            : info.servicio
              ? "ring-sky-400"
              : "ring-white";
          return (
            <span
              key={`mk-${iata}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${pct.left}%`,
                top: `${pct.top}%`,
                transition: `left ${ZOOM_MS}ms ${ZOOM_EASE}, top ${ZOOM_MS}ms ${ZOOM_EASE}`,
              }}
            >
              <span
                className={`block rounded-full bg-brand-500 ring-2 ${ring} shadow-[0_0_12px_rgba(230,57,70,0.7)] ${
                  info.isStart || info.isEnd ? "size-3.5" : "size-3"
                }`}
              />
            </span>
          );
        })}

      {/* leyenda (solo multiescala con tramos especiales) */}
      {multiMode && hasDrawn && (
        <div className="pointer-events-none absolute left-3 bottom-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-navy-300">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-[#e63946]" />
            Tramo
          </span>
          {legs?.some((l) => l.es_ferry) && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${FERRY_COLOR} 0 4px, transparent 4px 7px)`,
                }}
              />
              Ferry
            </span>
          )}
          {legs?.some((l) => l.requiere_pernocta) && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-brand-500 ring-1 ring-amber-400" />
              Pernocta
            </span>
          )}
          {legs?.some((l) => l.tipo_parada === "SERVICIO") && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-brand-500 ring-1 ring-sky-400" />
              Servicio
            </span>
          )}
        </div>
      )}

      {!hasDrawn && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-navy-400">
          {multiMode
            ? "Agrega tramos con origen y destino para ver la ruta"
            : "Selecciona origen y destino para ver la ruta"}
        </div>
      )}

      <style>{`
        @keyframes rpDraw { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
        @keyframes rpDrawDash {
          from { stroke-dashoffset: 100; stroke-dasharray: 100; }
          99% { stroke-dasharray: 100; }
          to { stroke-dashoffset: 0; stroke-dasharray: 1.2 1.6; }
        }
        @keyframes rpFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
