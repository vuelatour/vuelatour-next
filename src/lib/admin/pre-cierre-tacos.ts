/**
 * Pre-cierre → «Tacómetros en revisión»: QUÉ tramos son (14-sep-2026).
 *
 * Pedido del cliente: «en Tacómetros pendientes por revisar (pre-cierre)
 * ¿podría indicar cuáles son?». El item solo decía «· 3»: para saber dónde
 * estaba el problema había que abrir /admin/taco-live y buscarlos a mano.
 *
 * El API agrega al item `tacos_en_revision` dos campos ADITIVOS: `vuelos`
 * (los mismos chips que ya pintan los demás pendientes) y `tramos` (una fila
 * por escala con `revision_requerida`). Este módulo es PURO: solo arma los
 * textos es-MX y el enlace; no decide nada de dinero ni recalcula conteos.
 */

import { fmtDateTimeShort } from "@/lib/datetime";

/** Una escala marcada para revisión (fila del item `tacos_en_revision`). */
export interface PreCierreTacoTramo {
  vuelo_id: string;
  /** Folio del vuelo. El API manda 0 cuando no lo resolvió: 0 = desconocido
   *  (los folios arrancan en 1), no un vuelo «#0». */
  folio: number | null;
  /** Número del tramo dentro del vuelo (1..N). 0 = el API no lo resolvió. */
  orden: number | null;
  origen_iata: string | null;
  destino_iata: string | null;
  /** timestamptz: se pinta en hora Cancún. */
  fecha_salida_plan?: string | null;
  /** Primera línea de `revision_motivo` (el API ya la recorta). */
  motivo?: string | null;
  piloto_nombre?: string | null;
}

export interface LineaTacoTramo {
  key: string;
  vueloId: string;
  href: string;
  /** «#248» o «vuelo» si el folio no llegó (nunca se inventa un número). */
  folio: string;
  /** «T1 CUN → CZM · 14 sep, 01:30 p.m. · Juan Pérez · Sin lectura de llegada». */
  texto: string;
}

/** Tope de líneas antes de resumir con «y N más…» (la card no es un reporte). */
export const MAX_TRAMOS_TACOS = 12;

/** Largo máximo del motivo en la línea: el detalle completo vive en taco-live. */
const MAX_MOTIVO = 90;

/** «CUN → CZM», «CUN → ?» o "" cuando no se conoce ninguno de los dos. */
export function rutaTramo(
  origen: string | null | undefined,
  destino: string | null | undefined,
): string {
  const o = origen?.trim() || null;
  const d = destino?.trim() || null;
  if (!o && !d) return "";
  return `${o ?? "?"} → ${d ?? "?"}`;
}

/** Primera línea del motivo, sin saltos y recortada. */
function motivoCorto(motivo: string | null | undefined): string {
  const linea = (motivo ?? "").split("\n")[0].trim();
  if (!linea) return "";
  return linea.length > MAX_MOTIVO ? `${linea.slice(0, MAX_MOTIVO - 1)}…` : linea;
}

/**
 * Líneas «T1 CUN → CZM · fecha · piloto · motivo», agrupadas por vuelo
 * (folio ascendente) y por orden de tramo, deduplicadas por vuelo+orden.
 *
 * Devuelve cuántas quedaron fuera (`restantes`) para el «y N más…». El
 * total NO se recalcula aquí: se toma del `count` del item (`total`), porque
 * el API topa el arreglo `tramos` (200) mientras que `count` siempre es el
 * número REAL de tramos amarillos — con `tramos.length` un periodo con más
 * de 200 amarillos diría «y 188 más…» cuando son muchos más.
 */
export function lineasTramosTacos(
  tramos: PreCierreTacoTramo[] | null | undefined,
  max: number = MAX_TRAMOS_TACOS,
  total?: number | null,
): { lineas: LineaTacoTramo[]; restantes: number } {
  if (!Array.isArray(tramos) || tramos.length === 0) {
    return { lineas: [], restantes: 0 };
  }

  const vistos = new Set<string>();
  const unicos: PreCierreTacoTramo[] = [];
  for (const t of tramos) {
    if (!t?.vuelo_id) continue;
    const key = `${t.vuelo_id}#${t.orden ?? "?"}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    unicos.push(t);
  }

  // Orden estable: por vuelo (folio, y sin folio al final) y luego por tramo.
  // 0 cuenta como "sin folio" (el API manda 0 cuando no lo resolvió).
  const ordenados = [...unicos].sort((a, b) => {
    const fa = a.folio || Number.MAX_SAFE_INTEGER;
    const fb = b.folio || Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    if (a.vuelo_id !== b.vuelo_id) return a.vuelo_id.localeCompare(b.vuelo_id);
    return (a.orden ?? 0) - (b.orden ?? 0);
  });

  const lineas = ordenados.slice(0, Math.max(0, max)).map((t) => {
    const partes: string[] = [];
    // Los tramos arrancan en 1: orden 0 (o null) es "no lo sé", no «T0».
    const tramo =
      typeof t.orden === "number" && Number.isFinite(t.orden) && t.orden > 0
        ? `T${t.orden}`
        : "Tramo";
    const ruta = rutaTramo(t.origen_iata, t.destino_iata);
    partes.push(ruta ? `${tramo} ${ruta}` : tramo);
    if (t.fecha_salida_plan) partes.push(fmtDateTimeShort(t.fecha_salida_plan));
    const piloto = t.piloto_nombre?.trim();
    if (piloto) partes.push(piloto);
    const motivo = motivoCorto(t.motivo);
    if (motivo) partes.push(motivo);
    return {
      key: `${t.vuelo_id}#${t.orden ?? "?"}`,
      vueloId: t.vuelo_id,
      href: `/admin/flights/${t.vuelo_id}`,
      // 0 y null son «no lo sé»: jamás se pinta «#0» (no existe el vuelo 0).
      folio: t.folio ? `#${t.folio}` : "vuelo",
      texto: partes.join(" · "),
    };
  });

  // `total` (count del API) manda cuando llega y no es MENOR que lo que ya
  // se está pintando (un count viejo/incoherente jamás esconde líneas).
  const totalReal =
    typeof total === "number" && Number.isFinite(total) && total > ordenados.length
      ? total
      : ordenados.length;
  return { lineas, restantes: Math.max(0, totalReal - lineas.length) };
}
