/**
 * SEGUIMIENTO DE LA COTIZACIÓN — reglas PURAS del panel (29-sep-2026,
 * API 0.0.43). Fuente única de: roles, orden de la lista, contadores,
 * etiquetas/colores del estado, textos del badge y del banner, validación y
 * tolerancia al API previo. La card del detalle del vuelo
 * (`flight-seguimiento-card.tsx`), la cabecera del vuelo y el banner del
 * cotizador (`quote-seguimiento-banda.tsx`) solo pintan lo que sale de aquí.
 *
 * Por qué existe: la oficina anotaba en WhatsApp lo que había que cobrar
 * aparte («los pax pidieron transporte, no está en la cotización») y nada lo
 * recordaba al cerrar el mes. Ahora la nota vive en el vuelo, tiene estado
 * (PENDIENTE → RESUELTA) y, mientras esté PENDIENTE y afecte la cotización,
 * el cotizador la grita en ámbar y el pre-cierre la lista (aviso NO
 * bloqueante, lo arma el API).
 */
import { fmtDateTime } from "@/lib/datetime";
import type {
  SeguimientoContadores,
  SeguimientoNota,
  SeguimientoPendienteDetalle,
  SeguimientoUsuario,
} from "@/types/seguimiento";

// ═══════════════════════════════ Roles ═══════════════════════════════

/**
 * Espejo del `@Roles` de POST/PATCH/DELETE del API. SOCIO y ANALISTA solo
 * LEEN (GET): la card se les pinta sin formulario ni acciones.
 */
export const ROLES_EDITAN_SEGUIMIENTO = ["ADMIN", "COORDINADOR", "FACTURACION"] as const;

/**
 * ¿Se ofrece anotar / resolver / eliminar? Sin rol (`/me` falló) SÍ se
 * ofrece, como `puedeEditarCotizacion`: el gate real es el API (403) y una
 * falla pasajera de `/me` no debe esconder la herramienta a la oficina.
 */
export function puedeEditarSeguimiento(rol: string | null | undefined): boolean {
  if (!rol) return true;
  return (ROLES_EDITAN_SEGUIMIENTO as readonly string[]).includes(rol);
}

// ═══════════════════════════════ Límites ═══════════════════════════════

/** Espejo del CHECK de BD: `length(btrim(texto)) between 1 and 1000`. */
export const TEXTO_NOTA_MAX = 1000;
/** Espejo del CHECK de BD: `length(resolucion) <= 500`. */
export const RESOLUCION_MAX = 500;

/** Error legible del texto de la nota o null si es válido. */
export function validarTextoNota(texto: string): string | null {
  const t = texto.trim();
  if (t.length === 0) return "Escribe qué hay que agregar o cobrar.";
  if (t.length > TEXTO_NOTA_MAX) return `Máximo ${TEXTO_NOTA_MAX} caracteres.`;
  return null;
}

/** Error legible de la resolución (opcional) o null si es válida. */
export function validarResolucion(resolucion: string): string | null {
  if (resolucion.trim().length > RESOLUCION_MAX) return `Máximo ${RESOLUCION_MAX} caracteres.`;
  return null;
}

// ═══════════════════════════════ Lista ═══════════════════════════════

/** RESUELTA es el único estado cerrado; cualquier otro se trata como abierto
    (conservador: un estado desconocido nunca esconde un pendiente). */
export function esResuelta(n: Pick<SeguimientoNota, "estado">): boolean {
  return n.estado === "RESUELTA";
}

/**
 * Normaliza la respuesta del GET: el contrato dice «lista», pero se acepta
 * también `{ data: [...] }` (forma de las listas paginadas del API) para no
 * pintar «sin notas» por una diferencia de envoltura.
 */
export function normalizarNotas(raw: unknown): SeguimientoNota[] {
  if (Array.isArray(raw)) return raw as SeguimientoNota[];
  const data = (raw as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as SeguimientoNota[]) : [];
}

function tiempo(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Orden de la lista: PENDIENTES primero y, dentro de cada grupo, la más
 * reciente arriba (`created_at` desc). El API ya las manda así; se reordena
 * igual (idempotente) para que la card no dependa de ello.
 */
export function ordenarSeguimiento(notas: readonly SeguimientoNota[]): SeguimientoNota[] {
  return [...notas].sort((a, b) => {
    const ra = esResuelta(a) ? 1 : 0;
    const rb = esResuelta(b) ? 1 : 0;
    if (ra !== rb) return ra - rb;
    return tiempo(b.created_at) - tiempo(a.created_at);
  });
}

export interface ConteoSeguimiento {
  /** Notas abiertas. */
  pendientes: number;
  /** Abiertas que hay que reflejar en la cotización. */
  cotizacion: number;
}

/** Cuenta desde la LISTA cargada (la fuente cuando la hay). */
export function contarSeguimiento(notas: readonly SeguimientoNota[]): ConteoSeguimiento {
  let pendientes = 0;
  let cotizacion = 0;
  for (const n of notas) {
    if (esResuelta(n)) continue;
    pendientes += 1;
    if (n.afecta_cotizacion !== false) cotizacion += 1;
  }
  return { pendientes, cotizacion };
}

/** Contador ADITIVO del API → entero ≥ 0, o null si no vino (API previo). */
export function leerContador(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * Conteo para la cabecera del vuelo: la LISTA manda cuando cargó; si no
 * (falló o API previo) se usan los contadores del snapshot; sin ninguno de
 * los dos, null (no se pinta nada — nunca «0» inventado).
 */
export function conteoSeguimientoVuelo(
  notas: readonly SeguimientoNota[] | null,
  respaldo: SeguimientoContadores | null | undefined,
): ConteoSeguimiento | null {
  if (notas) return contarSeguimiento(notas);
  const pendientes = leerContador(respaldo?.seguimiento_pendientes);
  const cotizacion = leerContador(respaldo?.seguimiento_cotizacion_pendientes);
  if (pendientes == null && cotizacion == null) return null;
  return { pendientes: pendientes ?? cotizacion ?? 0, cotizacion: cotizacion ?? 0 };
}

// ═══════════════════════════════ Textos ═══════════════════════════════

export const TITULO_SEGUIMIENTO = "Seguimiento de la cotización";
export const DESCRIPCION_SEGUIMIENTO =
  "Ajustes que se deben cobrar o agregar a la cotización (transporte, extras, cambios) y su seguimiento.";
export const PLACEHOLDER_SEGUIMIENTO =
  "Ej. Los pax pidieron transporte terrestre; no está en la cotización, hay que cobrarlo.";
export const ETIQUETA_AFECTA_COTIZACION = "Debe reflejarse en la cotización";

/** Ancla de la card en el detalle del vuelo (badge de la cabecera, banner, pre-cierre). */
export const ANCLA_SEGUIMIENTO = "seguimiento-cotizacion";

export function hrefSeguimientoVuelo(vueloId: string): string {
  return `/admin/flights/${vueloId}#${ANCLA_SEGUIMIENTO}`;
}

/**
 * Clave del aviso NO bloqueante del pre-cierre (espejo de
 * `CLAVE_PRECIERRE_SEGUIMIENTO` del API): «N vuelo(s) con ajustes pendientes
 * de reflejar en la cotización». Sus chips llevan directo a la card.
 */
export const CLAVE_PRECIERRE_SEGUIMIENTO = "seguimiento_cotizacion_pendiente";

/** Sufijo del chip de un vuelo en ese aviso: «2 ajustes». */
export function textoAjustesPrecierre(notas: number): string {
  return notas === 1 ? "1 ajuste" : `${notas} ajustes`;
}

/** Etiqueta y colores del estado (ámbar = pendiente, verde = resuelta). */
export function estadoSeguimientoUi(estado: string): { label: string; cls: string } {
  if (estado === "RESUELTA") {
    return {
      label: "Resuelta",
      cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
    };
  }
  if (estado === "PENDIENTE") {
    return {
      label: "Pendiente",
      cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    };
  }
  // Estado nuevo del API: se dice tal cual, en el tono de «abierto».
  return {
    label: estado,
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  };
}

/** «Itzi · 29 sep 2026, 14:05» (hora Cancún). Sin nombre: «Alguien». */
export function textoAutoria(
  usuario: SeguimientoUsuario | string | null | undefined,
  iso: string | null | undefined,
): string {
  const nombre =
    (typeof usuario === "string" ? usuario : usuario?.nombre)?.trim() || "Alguien";
  return `${nombre} · ${fmtDateTime(iso)}`;
}

/** Contador del título de la card: «1 pendiente» / «3 pendientes». */
export function textoContadorPendientes(n: number): string {
  return `${n} ${n === 1 ? "pendiente" : "pendientes"}`;
}

/** Badge de la cabecera del vuelo (solo las que afectan la cotización). */
export function textoBadgeCabecera(n: number): string {
  return n === 1 ? "⚠ 1 ajuste pendiente de cotizar" : `⚠ ${n} ajustes pendientes de cotizar`;
}

/** Título del banner del cotizador. */
export function textoBannerSeguimiento(n: number): string {
  return n === 1
    ? "1 ajuste pendiente por reflejar en esta cotización"
    : `${n} ajustes pendientes por reflejar en esta cotización`;
}

// ═══════════════════════════════ Banner ═══════════════════════════════

/** Tope del detalle que manda el API (y que el banner pinta). */
export const MAX_DETALLE_BANNER = 20;

export interface BannerSeguimiento {
  total: number;
  titulo: string;
  items: SeguimientoPendienteDetalle[];
  /** Pendientes que no vinieron en el detalle (el API topa en 20). */
  restantes: number;
}

/**
 * ¿Se pinta el banner del cotizador y con qué? Regla: SIN contador no hay
 * banner (API previo: skew de deploy) y con 0 tampoco — el banner desaparece
 * SOLO cuando ya no hay pendientes. El detalle es opcional: sin él el banner
 * dice cuántos y lleva al vuelo. `respaldo` = el contador del snapshot del
 * vuelo, por si la vista de la cotización no lo trajera.
 */
export function bannerSeguimiento(
  quote: SeguimientoContadores & {
    seguimiento_pendientes_detalle?: SeguimientoPendienteDetalle[] | null;
  },
  respaldo?: SeguimientoContadores | null,
): BannerSeguimiento | null {
  const total =
    leerContador(quote.seguimiento_cotizacion_pendientes) ??
    leerContador(respaldo?.seguimiento_cotizacion_pendientes);
  if (total == null || total <= 0) return null;
  const detalle = Array.isArray(quote.seguimiento_pendientes_detalle)
    ? quote.seguimiento_pendientes_detalle
    : [];
  const items = detalle.slice(0, Math.min(total, MAX_DETALLE_BANNER));
  return {
    total,
    titulo: textoBannerSeguimiento(total),
    items,
    restantes: Math.max(0, total - items.length),
  };
}

// ═══════════════════════════ Concurrencia ═══════════════════════════

/**
 * Código del API (404) cuando la nota no existe o ya se eliminó: otra persona
 * la borró mientras esta pantalla seguía abierta. La card no se queda con el
 * diálogo abierto repitiendo el error: avisa, cierra y refresca la lista.
 */
export const CODIGO_NOTA_INEXISTENTE = "SEGUIMIENTO_NO_EXISTE";

export const AVISO_NOTA_INEXISTENTE =
  "Esa nota ya no existe: alguien más la eliminó. Se actualizó la lista.";

export function esNotaInexistente(
  res: { ok: boolean; code?: string | null } | null | undefined,
): boolean {
  return !!res && !res.ok && res.code === CODIGO_NOTA_INEXISTENTE;
}

// ═══════════════════════════ Confirmaciones ═══════════════════════════

/** Recorta un texto largo para citarlo en un diálogo («…» al final). */
export function recortarTexto(texto: string, max = 120): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Textos del diálogo de ELIMINAR (regla del cliente: toda acción destructiva
 * confirma). Si la nota sigue PENDIENTE y afecta la cotización se dice qué
 * se pierde —el aviso del cotizador y del pre-cierre— y cuál es el camino
 * correcto cuando el ajuste ya se cobró («Marcar resuelta»).
 */
export function confirmacionEliminarSeguimiento(
  nota: Pick<SeguimientoNota, "texto" | "estado" | "afecta_cotizacion">,
): { titulo: string; descripcion: string } {
  const cita = `«${recortarTexto(nota.texto)}»`;
  const avisaCotizacion = !esResuelta(nota) && nota.afecta_cotizacion !== false;
  return {
    titulo: "¿Eliminar esta nota de seguimiento?",
    descripcion: avisaCotizacion
      ? `${cita} dejará de avisarse en la cotización y en el pre-cierre. Si el ajuste ya se agregó o se cobró, mejor usa «Marcar resuelta».`
      : `${cita} se quitará del seguimiento de este vuelo.`,
  };
}
