/**
 * CORREGIR LA CANTIDAD de una ENTRADA y el reparto de una SALIDA entre
 * ALGUNAS matrículas — textos y decisiones PURAS (27-nov-2026, API 0.0.152,
 * invariante 146 del API).
 *
 * Pedidos de la oficina (Jimmy, WhatsApp 27-nov-2026): «me podrían habilitar
 * poder editar movimientos en el inventario … por error de dedo puse 13, pero
 * ingresaron 12» y «necesito me den la opción de marcar algunas matrículas ya
 * que necesito poner solo 4 matrículas y no todas».
 *
 * La REGLA y los números son del API: el panel jamás recalcula una
 * existencia ni reparte dinero. Aquí solo se decide qué viaja y qué se dice.
 */
import { cantidadConUnidad } from "@/lib/admin/inventario-eliminar";
import type { InventarioMovimiento } from "@/types/inventory";

// ─────────────────────────── Corregir cantidad ───────────────────────────

export const ETIQUETA_CORREGIR_CANTIDAD = "Corregir cantidad";
export const TITULO_CORREGIR_CANTIDAD = "Corregir la cantidad de la entrada";
export const AYUDA_CORREGIR_CANTIDAD =
  "Solo cambia la cantidad de esta entrada: el costo, la fecha y las salidas ya registradas no se mueven. Queda anotado quién la corrigió y cuánto decía antes.";
export const ETIQUETA_CANTIDAD_CORRECTA = "Cantidad correcta";
export const ETIQUETA_MOTIVO_CANTIDAD = "Motivo (opcional)";
export const PLACEHOLDER_MOTIVO_CANTIDAD = "Ej. error de dedo al capturar";
export const MOTIVO_CANTIDAD_MAX = 200;

/** Solo las ENTRADAS se corrigen aquí (una salida lleva su cargo al avión). */
export function puedeCorregirCantidad(m: Pick<InventarioMovimiento, "tipo">): boolean {
  return m.tipo === "ENTRADA";
}

export interface EstadoCantidad {
  /** Número listo para viajar (2 decimales) o null si no se puede guardar. */
  numero: number | null;
  /** Por qué no se puede guardar todavía (null = se puede, o campo vacío). */
  error: string | null;
}

/**
 * Lo tecleado en «Cantidad correcta» contra la cantidad actual: vacío ⇒ sin
 * error pero sin número (el botón espera); texto que no es número, ≤ 0, con
 * más de 2 decimales o IGUAL a la actual ⇒ error que dice qué hacer.
 */
export function estadoCantidad(texto: string, actual: number): EstadoCantidad {
  const t = texto.trim().replace(",", ".");
  if (t === "") return { numero: null, error: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { numero: null, error: "Escribe la cantidad con números." };
  if (!(n > 0)) {
    return {
      numero: null,
      error: "Debe ser mayor a 0. Si la entrada no existió, elimínala con el bote de basura.",
    };
  }
  if (Math.round(n * 100) / 100 !== n) {
    return { numero: null, error: "Máximo 2 decimales." };
  }
  if (Math.abs(n - actual) < 0.0005) {
    return { numero: null, error: "Es la misma cantidad que ya tiene: no hay nada que corregir." };
  }
  return { numero: n, error: null };
}

/** «Cantidad corregida: 13 → 12 cuarto (qt). Existencia: 120 cuarto (qt).» */
export function toastCantidadCorregida(
  res: { cantidad_antes?: number | null; cantidad_despues?: number | null; stock_resultante?: number | null },
  unidad?: string | null,
): string {
  const antes = res.cantidad_antes;
  const despues = res.cantidad_despues;
  const base =
    antes != null && despues != null
      ? `Cantidad corregida: ${num(Number(antes))} → ${cantidadConUnidad(Number(despues), unidad)}.`
      : "Cantidad corregida.";
  return res.stock_resultante != null
    ? `${base} Existencia: ${cantidadConUnidad(Number(res.stock_resultante), unidad)}.`
    : base;
}

/**
 * Mensaje de un rechazo. El API ya redacta en es-MX qué pasa y qué hacer
 * (compra, existencia negativa con lo mínimo que puede quedar, bodega…): se
 * pinta TAL CUAL. Solo se traduce lo que no trae mensaje útil.
 */
export function mensajeErrorCantidad(r: {
  error?: string;
  status?: number;
  code?: string;
}): string {
  // 404 sin código estable = la RUTA no existe (API sin desplegar).
  if (r.status === 404 && !r.code) {
    return "Todavía no se puede corregir la cantidad desde aquí: falta actualizar el API. Avisa a sistemas.";
  }
  if (r.status === 403) return "Solo Administración puede corregir la cantidad de una entrada.";
  return r.error?.trim() || "No se pudo corregir la cantidad. Intenta de nuevo.";
}

// ─────────────────────────── Ajuste: dice lo que hace ───────────────────────────

/**
 * El AJUSTE SUMA piezas. Hasta el 27-nov-2026 la opción decía «Ajuste / merma
 * (corrección o desecho)» y los TRES ajustes capturados en producción querían
 * QUITAR una pieza: la sumaron.
 */
export const ETIQUETA_TIPO_AJUSTE = "Ajuste (suma piezas a la existencia)";
export const NOTA_AJUSTE_SUMA =
  "El ajuste SUMA piezas (por ejemplo, un sobrante al contar la bodega). Para quitar piezas de una entrada mal capturada usa «Corregir cantidad» en el renglón de esa entrada.";

// ─────────────────────────── Salida para algunas matrículas ───────────────────────────

export const ETIQUETA_REPARTIR = "Repartir entre varias matrículas";
export const HINT_REPARTIR =
  "(el cargo —precio o costo + margen— se divide en partes iguales entre las que marques)";
export const ETIQUETA_LISTA_MATRICULAS = "¿Entre cuáles se reparte?";
export const BOTON_MARCAR_TODAS = "Marcar todas";
export const BOTON_QUITAR_TODAS = "Quitar todas";

/** Qué viaja al API según lo marcado (o por qué todavía no se puede guardar). */
export type DestinoSalida =
  | { tipo: "ERROR"; mensaje: string }
  /** Una sola marcada: es una salida normal a ese avión. */
  | { tipo: "UNA"; aeronave_id: string }
  /** Todas las del catálogo: «toda la flota» de siempre (sin lista). */
  | { tipo: "TODAS" }
  /** Un subconjunto de 2 o más. */
  | { tipo: "ALGUNAS"; aeronave_ids: string[] };

/**
 * Decide el destino de una salida repartida. `catalogo` = las matrículas que
 * ofrece el diálogo (la flota activa); `marcadas` = ids marcados.
 */
export function destinoDeReparto(catalogo: readonly { id: string }[], marcadas: readonly string[]): DestinoSalida {
  const validas = catalogo.map((a) => a.id).filter((id) => marcadas.includes(id));
  if (validas.length === 0) {
    return { tipo: "ERROR", mensaje: "Marca al menos una matrícula para repartir la salida." };
  }
  if (validas.length === 1) return { tipo: "UNA", aeronave_id: validas[0] };
  if (validas.length === catalogo.length) return { tipo: "TODAS" };
  return { tipo: "ALGUNAS", aeronave_ids: validas };
}

/** «4 de 8 marcadas · cada una paga 1/4» (la cuenta del dinero la hace el API). */
export function resumenReparto(total: number, marcadas: number): string {
  if (marcadas === 0) return `Ninguna marcada de ${total}`;
  if (marcadas === 1) return `1 de ${total} marcada · se le carga completa`;
  return `${marcadas} de ${total} marcadas · cada una paga 1/${marcadas}`;
}

/**
 * A quién se cargó una salida en el cardex: las matrículas ELEGIDAS
 * («N4142R, N58BT»), «FLOTA» (toda la flota) o null si no es repartida.
 */
export function etiquetaReparto(
  m: Pick<InventarioMovimiento, "para_flota" | "matriculas_flota">,
): string | null {
  if (!m.para_flota) return null;
  const lista = (m.matriculas_flota ?? []).filter((x) => typeof x === "string" && x.trim() !== "");
  return lista.length > 0 ? lista.join(", ") : "FLOTA";
}

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
