import { CANCUN_TZ, fmtDateTime } from "@/lib/datetime";
import type { Gasto } from "@/types/expenses";

/**
 * Fecha y hora de CAPTURA de un gasto (pedido del cliente 7-sep-2026):
 * además de la fecha del consumo (`fecha_gasto`) se muestra cuándo se cargó
 * a la app/plataforma. FUENTE ÚNICA del texto que pintan todas las tablas de
 * gastos (gastos, otros gastos, personales, combustibles, gastos del vuelo)
 * y el detalle/verificación.
 *
 * Tres instantes distintos, que NO se mezclan:
 * - `fecha_gasto`   → día del consumo (el ticket).
 * - `capturado_en`  → momento REAL en que la persona lo capturó (la app lo
 *                     manda aunque esté sin señal; panel/masivo = created_at).
 * - `created_at`    → llegada al servidor (sigue gateando la ventana de
 *                     edición; aquí solo se enseña si difiere de la captura).
 *
 * Solo lectura/auditoría: nada de esto toca dinero ni candados.
 */

/** Campos mínimos que necesita el helper (tolerante al skew de deploy). */
export type GastoCaptura = Pick<Gasto, "created_at" | "fecha_gasto"> &
  Partial<Pick<Gasto, "capturado_en" | "origen" | "captura">>;

/** Viewmodel serializable de la línea "Capturado …" (las páginas server
 *  lo arman para las filas planas; las tablas con `Gasto` completo lo
 *  calculan al pintar). */
export interface CapturaLinea {
  /** "Capturado 5 sep 14:32 · Luis · app" */
  texto: string;
  /** true = pista ámbar: el ticket trae otro año o una fecha muy lejana. */
  ambar: boolean;
  /** Tooltip con el dato completo (año, hora Cancún, llegada al servidor). */
  title: string;
}

/** Más de esto entre ticket y captura = se avisa en ámbar (regla 28-ago). */
const DIAS_DESFASE_AMBAR = 120;
/** Hasta aquí es "normal" subirlo después del consumo: no amerita nota. */
const DIAS_DESFASE_NORMAL = 2;
/** Captura y llegada al servidor "coinciden" si difieren ≤ 1 minuto. */
const LLEGADA_MISMO_INSTANTE_MS = 60_000;

/** Desde dónde se capturó, en palabras del operador. */
export function origenCapturaLabel(
  origen: string | null | undefined,
): string | null {
  switch (origen) {
    case "PILOTO":
    case "MECANICO":
    case "VISITANTE":
      return "app";
    case "OFICINA":
      return "panel";
    case "SISTEMA":
      return "sistema";
    default:
      return null;
  }
}

/** Instante de captura: `capturado_en` y, si el API aún no lo manda (skew)
 *  o viene null, la llegada al servidor. */
export function capturadoEnDe(g: GastoCaptura): string | null {
  return g.capturado_en ?? g.created_at ?? null;
}

/** true = la captura llegó al servidor en OTRO momento (más de 1 minuto de
 *  diferencia): típico de una captura sin señal que el outbox subió después. */
export function llegoAlServidorDistinto(g: GastoCaptura): boolean {
  if (!g.capturado_en || !g.created_at) return false;
  const a = Date.parse(g.capturado_en);
  const b = Date.parse(g.created_at);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) > LLEGADA_MISMO_INSTANTE_MS;
}

/** "5 sep 14:32" (hora Cancún), corto para celdas de tabla. */
export function fmtCapturaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const partes = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: CANCUN_TZ,
  }).formatToParts(d);
  const p = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((x) => x.type === tipo)?.value ?? "";
  // "sep." → "sep": el punto de la abreviatura estorba en la celda.
  const mes = p("month").replace(/\.$/, "");
  return `${p("day")} ${mes} ${p("hour")}:${p("minute")}`;
}

/** Día calendario (YYYY-MM-DD) en Cancún de un timestamptz. */
function diaCancun(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CANCUN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Desfase entre el día del ticket y el día de captura (Cancún): + = se
 * capturó DESPUÉS del consumo. `anioRaro` = el ticket quedó fechado en un
 * año anterior al de la captura (la IA leyó "2025"): con el año equivocado
 * el gasto sale de todos los cortes, por eso se grita.
 */
export function desfaseCaptura(
  g: GastoCaptura,
): { dias: number; anioRaro: boolean } | null {
  const cap = capturadoEnDe(g);
  const fecha = g.fecha_gasto;
  if (!cap || !fecha) return null;
  const diaCap = diaCancun(cap);
  if (!diaCap) return null;
  const a = Date.parse(`${diaCap}T12:00:00Z`);
  const b = Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const anioTicket = Number(fecha.slice(0, 4));
  const anioCaptura = Number(diaCap.slice(0, 4));
  return {
    dias: Math.round((a - b) / 86_400_000),
    anioRaro:
      Number.isFinite(anioTicket) &&
      Number.isFinite(anioCaptura) &&
      anioTicket < anioCaptura,
  };
}

/**
 * Texto único de la segunda línea bajo la fecha del consumo:
 * "Capturado 5 sep 14:32 · Luis · app". Sin instante de captura → null
 * (fila vieja sin created_at: no se inventa nada).
 */
export function textoCapturado(g: GastoCaptura): string | null {
  const cap = capturadoEnDe(g);
  if (!cap) return null;
  const partes = [`Capturado ${fmtCapturaCorta(cap)}`];
  const nombre = g.captura?.nombre?.trim();
  if (nombre) partes.push(nombre);
  const origen = origenCapturaLabel(g.origen);
  if (origen) partes.push(origen);
  return partes.join(" · ");
}

/** Frase larga para tooltips y el detalle: "el 05 sep 2026, 14:32 (hora
 *  Cancún) por Luis desde la app · llegó al servidor el …" */
export function detalleCapturado(g: GastoCaptura): string | null {
  const cap = capturadoEnDe(g);
  if (!cap) return null;
  let s = `Capturado el ${fmtDateTime(cap)} (hora Cancún)`;
  const nombre = g.captura?.nombre?.trim();
  if (nombre) s += ` por ${nombre}`;
  const origen = origenCapturaLabel(g.origen);
  if (origen) s += origen === "sistema" ? " por el sistema" : ` desde ${origen === "app" ? "la app" : "el panel"}`;
  if (llegoAlServidorDistinto(g)) {
    s += ` · llegó al servidor el ${fmtDateTime(g.created_at)}`;
  }
  return s;
}

/**
 * Línea completa para las tablas: texto + pista ámbar (28-ago) cuando el
 * ticket trae otro año o una fecha muy lejana de la captura — así "lo que
 * subí hoy" se encuentra aunque esté fechado atrás, y el año equivocado
 * salta a la vista. Compara SIEMPRE contra `capturado_en`.
 */
export function lineaCaptura(g: GastoCaptura): CapturaLinea | null {
  const texto = textoCapturado(g);
  if (!texto) return null;
  const desfase = desfaseCaptura(g);
  const detalle = detalleCapturado(g) ?? texto;
  if (!desfase) return { texto, ambar: false, title: detalle };
  if (desfase.anioRaro) {
    const anio = (g.fecha_gasto ?? "").slice(0, 4);
    return {
      texto: `⚠ año ${anio} · ${texto}`,
      ambar: true,
      title: `Ojo: el ticket quedó fechado en ${anio} — revisa el año. ${detalle}`,
    };
  }
  const abs = Math.abs(desfase.dias);
  if (abs > DIAS_DESFASE_NORMAL) {
    const cuando =
      desfase.dias > 0
        ? `${abs} días después de la fecha del ticket`
        : `${abs} días antes de la fecha del ticket`;
    return {
      texto,
      ambar: abs > DIAS_DESFASE_AMBAR,
      title: `Se capturó ${cuando}. ${detalle}`,
    };
  }
  return { texto, ambar: false, title: detalle };
}

// =============================================================================
// Variante COMPACTA para la tabla de Gastos (14-oct-2026, una sola tabla)
// =============================================================================

/** Orígenes que llevan el DISTINTIVO de color que pidió el cliente (9-jul). */
export type OrigenConDistintivo = "OFICINA" | "SISTEMA" | "VISITANTE";

/**
 * Distintivo de origen (pedido del cliente, 9-jul-2026): los gastos que sube
 * administración, los que genera el sistema (p. ej. pistas) y los de un
 * visitante se distinguen de un vistazo de los capturados en campo. Antes
 * era una insignia de color en la columna «Capturó»; desde la tabla única
 * (14-oct-2026) es el COLOR de la palabra de origen en la tercera línea de
 * la celda «Fecha» («Mary Cruz · panel», con «panel» en el color de
 * «Oficina»), sin ensanchar la columna: una insignia con su etiqueta le
 * quitaba al nombre el espacio que necesita (medido: «Pablo Canales» se
 * cortaba). La etiqueta va en el `title` de la palabra y para el lector de
 * pantalla. Piloto y mecánico no llevan distintivo («app» en gris).
 */
export const DISTINTIVO_ORIGEN: Readonly<Record<OrigenConDistintivo, string>> = {
  OFICINA: "Oficina",
  SISTEMA: "Sistema",
  VISITANTE: "Visitante",
};

/** Qué significa cada distintivo (title de la palabra de origen). */
export const TITULO_DISTINTIVO_ORIGEN: Readonly<Record<OrigenConDistintivo, string>> = {
  OFICINA: "Oficina: lo capturó administración desde el panel.",
  SISTEMA: "Sistema: lo generó el sistema (p. ej. las pistas).",
  VISITANTE: "Visitante: lo capturó un visitante desde la app.",
};

/** El distintivo del origen, o null si no lleva (piloto, mecánico, sin dato). */
export function distintivoOrigen(
  origen: string | null | undefined,
): { codigo: OrigenConDistintivo; etiqueta: string; titulo: string } | null {
  if (origen === "OFICINA" || origen === "SISTEMA" || origen === "VISITANTE") {
    return {
      codigo: origen,
      etiqueta: DISTINTIVO_ORIGEN[origen],
      titulo: TITULO_DISTINTIVO_ORIGEN[origen],
    };
  }
  return null;
}

/**
 * Viewmodel de la celda «Fecha» de Gastos en DOS sublíneas cortas (la
 * columna mide 8rem): «Capturado 14 oct 10:33» y «Mary Cruz · panel». El
 * nombre se trunca y el origen se conserva (con el color de su distintivo);
 * `ambar` y `title` son EXACTAMENTE los de `lineaCaptura` (pista del 28-ago y
 * detalle completo).
 */
export interface CapturaCompacta {
  /** «Capturado 14 oct 10:33» (con «⚠ año 2025 · » delante si el ticket trae otro año). */
  cuando: string;
  /** Quién lo capturó (recortado) o null. */
  nombre: string | null;
  /** «panel», «app» o «sistema» (`origenCapturaLabel`); null sin dato. */
  origen: string | null;
  /** Distintivo de color (Oficina / Sistema / Visitante) o null. */
  distintivo: { codigo: OrigenConDistintivo; etiqueta: string; titulo: string } | null;
  ambar: boolean;
  title: string;
}

/** null cuando `lineaCaptura` es null (fila sin instante de captura: no se inventa). */
export function lineaCapturaCompacta(g: GastoCaptura): CapturaCompacta | null {
  const linea = lineaCaptura(g);
  if (!linea) return null;
  const base = `Capturado ${fmtCapturaCorta(capturadoEnDe(g))}`;
  const desfase = desfaseCaptura(g);
  const cuando = desfase?.anioRaro
    ? `⚠ año ${(g.fecha_gasto ?? "").slice(0, 4)} · ${base}`
    : base;
  return {
    cuando,
    nombre: g.captura?.nombre?.trim() || null,
    origen: origenCapturaLabel(g.origen),
    distintivo: distintivoOrigen(g.origen),
    ambar: linea.ambar,
    title: linea.title,
  };
}
