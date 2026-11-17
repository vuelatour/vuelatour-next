/**
 * «PASAR ESTOS TRAMOS AL VUELO» (17-nov-2026, API 0.0.141, invariante 136 del
 * API; caso REAL #478).
 *
 * Reporte de la oficina con las capturas de la cotización y del vuelo #478:
 * «no salen los demás tramos y no se actualiza a lo que acabo de poner en la
 * cotización». El vuelo nació como RESERVA con su propio tramo (CUN → MHL):
 * un vuelo así es de «ruta operativa» y la cotización solo calcula su precio,
 * NO escribe sus tramos. La banda azul solo ofrecía el sentido contrario
 * («Cotizar con estos tramos»: del vuelo a la cotización).
 *
 * FUENTE ÚNICA (PURA) de cuándo se ofrece el botón, cuándo se apaga y de
 * todos sus textos. La REGLA y la escritura son del API
 * (`POST /v1/quotes/:id/tramos-al-vuelo`): aquí solo se decide si el botón
 * tiene sentido para no ofrecer algo que el API va a rechazar; si aun así lo
 * rechaza, se pinta SU mensaje.
 *
 * NUNCA es automático: la regla del cliente es que la cotización no toca la
 * operación, y hay vuelos donde las dos rutas son distintas a propósito.
 */
import { estadoVueloVolado } from "./avion-cotizado";
import { puedeEditarCotizacion } from "./quote-sheet-interna";

export const ETIQUETA_PASAR_TRAMOS = "Pasar estos tramos al vuelo";

export const TITULO_BOTON_PASAR_TRAMOS =
  "Lleva al vuelo los tramos guardados de la cotización, con sus pasajeros y horarios. El precio no cambia.";

export const MOTIVO_GUARDA_PRIMERO =
  "Guarda primero los cambios de la cotización: al vuelo se pasan los tramos ya guardados.";

export const TITULO_CONFIRMAR_PASAR_TRAMOS =
  "¿Pasar los tramos de la cotización al vuelo?";

export const BOTON_CONFIRMAR_PASAR_TRAMOS = "Sí, pasarlos al vuelo";

export const TEXTO_PASAR_TRAMOS_NO_DISPONIBLE =
  "Todavía no está disponible: falta actualizar el sistema. Mientras, edita los tramos desde el vuelo.";

/** Lo que responde `POST /v1/quotes/:id/tramos-al-vuelo`. */
export interface TramosAlVueloRespuesta {
  ok: boolean;
  vuelo_id: string;
  folio: number;
  tramos: number;
  /** «CUN → CTM → MHL → CTM → CUN». */
  ruta: string;
  ruta_anterior: string;
  avisos: string[];
}

/** Lo mínimo de la cotización guardada para decidir. */
export interface QuoteParaPasarTramos {
  estado?: string | null;
  itinerario_operativo?: boolean | null;
  combinado_con_id?: string | null;
  grupo_id?: string | null;
  grupo?: unknown;
  calculo_snapshot?: {
    ruta?: {
      escalas?: ReadonlyArray<{
        origen_iata?: string | null;
        destino_iata?: string | null;
      }> | null;
    } | null;
  } | null;
  escalas?: ReadonlyArray<{
    orden?: number | null;
    origen_iata?: string | null;
    destino_iata?: string | null;
    taco_salida?: unknown;
    taco_llegada?: unknown;
    cancelada_at?: string | null;
    solo_operativa?: boolean | null;
  }> | null;
}

export type EstadoPasarTramos =
  | { visible: false }
  | {
      visible: true;
      /** false = se ve pero apagado (hay cambios sin guardar). */
      habilitado: boolean;
      /** Por qué está apagado (va al `title`); null si está encendido. */
      motivo: string | null;
      /** Lo que el vuelo va a tener: «CUN → CTM → MHL → CTM → CUN». */
      rutaCotizada: string;
      /** Lo que el vuelo tiene hoy: «CUN → MHL» («—» sin tramos). */
      rutaVuelo: string;
    };

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Una ruta en palabras: encadenada («CUN → CTM → MHL») cuando cada tramo sale
 * de donde llegó el anterior; si no, tramo por tramo. Espejo de `rutaEnTexto`
 * del API (`quotes/tramos-al-vuelo.util.ts`).
 */
export function rutaEnTexto(
  tramos: ReadonlyArray<{ origen_iata?: string | null; destino_iata?: string | null }>,
): string {
  const legs = tramos.map((t) => ({
    o: txt(t.origen_iata).toUpperCase() || "?",
    d: txt(t.destino_iata).toUpperCase() || "?",
  }));
  if (legs.length === 0) return "—";
  const encadenada = legs.every((l, i) => i === 0 || legs[i - 1].d === l.o);
  return encadenada
    ? [legs[0].o, ...legs.map((l) => l.d)].join(" → ")
    : legs.map((l) => `${l.o} → ${l.d}`).join(" · ");
}

/**
 * ¿Se ofrece «Pasar estos tramos al vuelo»? Se ESCONDE cuando no tiene
 * sentido (el vuelo ya sigue la cotización, no hay tramos guardados, ya voló,
 * está cancelado, es combinado o de grupo, o el rol no guarda cotizaciones) y
 * se APAGA, visible, cuando hay cambios sin guardar: al vuelo se pasan los
 * tramos GUARDADOS, no lo que hay en pantalla.
 *
 * Mismos candados que el API (`evaluarTramosAlVuelo`); si divergen, manda el
 * 409 del API con su mensaje.
 */
export function estadoPasarTramosAlVuelo(e: {
  quote: QuoteParaPasarTramos | null | undefined;
  rol: string | null | undefined;
  hayCambios: boolean;
}): EstadoPasarTramos {
  const q = e.quote;
  if (!q || q.itinerario_operativo !== true) return { visible: false };
  if (!puedeEditarCotizacion(e.rol)) return { visible: false };
  if (txt(q.estado).toUpperCase() === "CANCELADO") return { visible: false };
  if (estadoVueloVolado(q).yaVolo) return { visible: false };
  if (q.combinado_con_id != null || q.grupo_id != null || q.grupo != null) {
    return { visible: false };
  }
  const cotizados = q.calculo_snapshot?.ruta?.escalas ?? [];
  if (
    cotizados.length === 0 ||
    cotizados.some((t) => !txt(t.origen_iata) || !txt(t.destino_iata))
  ) {
    return { visible: false };
  }
  const vivos = [...(q.escalas ?? [])]
    .filter((t) => !t.cancelada_at && t.solo_operativa !== true)
    .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0));
  return {
    visible: true,
    habilitado: !e.hayCambios,
    motivo: e.hayCambios ? MOTIVO_GUARDA_PRIMERO : null,
    rutaCotizada: rutaEnTexto(cotizados),
    rutaVuelo: rutaEnTexto(vivos),
  };
}

/** Cuerpo de la confirmación: qué sale, qué entra y qué NO cambia. */
export function textoConfirmarPasarTramos(d: {
  rutaVuelo: string;
  rutaCotizada: string;
}): string {
  const sale =
    d.rutaVuelo === "—"
      ? "El vuelo tomará los tramos de la cotización"
      : `El vuelo dejará su ruta de hoy (${d.rutaVuelo}) y tomará la de la cotización`;
  return `${sale}: ${d.rutaCotizada}, con sus pasajeros y horarios. La tripulación recibe aviso del cambio. El precio no cambia. Desde ahora, los tramos del vuelo se actualizan al guardar la cotización.`;
}

/** Toast de éxito. */
export function textoTramosPasados(r: {
  folio?: number | null;
  tramos?: number | null;
  ruta?: string | null;
}): string {
  const n = Number(r.tramos ?? 0);
  const cuantos = n === 1 ? "1 tramo" : `${n} tramos`;
  const vuelo = r.folio != null ? `el vuelo #${r.folio}` : "el vuelo";
  return `Listo: ${vuelo} ahora tiene ${cuantos}${r.ruta ? ` (${r.ruta})` : ""}.`;
}

/**
 * Qué decir cuando el API rechaza. Sus 409 y su 503 ya vienen redactados en
 * es-MX y se pintan TAL CUAL; aquí solo se cubre la ruta que no existe (API
 * previo) y el error sin texto.
 */
export function mensajeErrorPasarTramos(err: {
  error?: string | null;
  status?: number | null;
  code?: string | null;
}): string {
  const texto = txt(err.error);
  if (err.status === 404 && !err.code && /^cannot post /i.test(texto)) {
    return TEXTO_PASAR_TRAMOS_NO_DISPONIBLE;
  }
  return texto || "No se pudieron pasar los tramos al vuelo. Vuelve a intentarlo.";
}
