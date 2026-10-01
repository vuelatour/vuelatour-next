/**
 * Saldo de créditos de IA (Anthropic): cuándo AVISAR y con qué palabras.
 * PURO (sin React ni red) — lo pinta `configuracion/ia-creditos-section.tsx`.
 *
 * 1-oct-2026: en producción el saldo ESTIMADO quedó en ≈ $0.87 USD (checkpoint
 * de $21.39 del 5-sep menos $20.52 consumidos; $7.44 en la última semana) y la
 * app ya respondía «Claude no disponible (400)» al leer tickets. La sección
 * pintaba el número sin ninguna alerta: nadie se enteró hasta que la lectura
 * dejó de funcionar.
 *
 * El saldo NO se calcula aquí: es `saldo_estimado` de `GET /v1/config/ia-uso`
 * (último checkpoint capturado a mano − consumo registrado después). Aquí
 * solo se decide el NIVEL y se redacta el aviso.
 */
import { fmtUsd } from "@/lib/format";
import { diaMas } from "@/lib/admin/conciliacion-auto";

/**
 * Abajo de este saldo (USD) el número se pinta en ámbar, SIN banda: el aviso
 * previo acordado («< $50 ámbar»), ahora en esta fuente única.
 */
export const UMBRAL_SALDO_IA_ATENCION_USD = 50;

/** Abajo de este saldo (USD) sale la banda ámbar «Saldo bajo». */
export const UMBRAL_SALDO_IA_BAJO_USD = 5;

/**
 * Abajo de este saldo (USD) la banda es ROJA aunque no se pueda medir el
 * ritmo: el estimado se queda ALTO (una llamada que falla consume sin quedar
 * registrada) y, cuando la IA ya rechaza por saldo, el consumo registrado
 * cae — el ritmo deja de ser confiable justo entonces.
 */
export const UMBRAL_SALDO_IA_CRITICO_USD = 1;

/** Días que mide «el ritmo de la última semana» (hoy incluido, en Cancún). */
export const DIAS_RITMO_IA = 7;

/**
 * - `agotado`: ≤ $0 al centavo — banda roja.
 * - `critico`: menos de $1, o no alcanza ni un día al ritmo de la semana —
 *   banda roja: la lectura de tickets puede estar fallando YA (caso real del
 *   1-oct-2026: ≈ $0.87 estimados y Anthropic ya respondía 400 por saldo).
 * - `bajo`: menos de $5 — banda ámbar.
 * - `atencion`: menos de $50 — número en ámbar, sin banda.
 * - `ok`: sin aviso. `desconocido`: sin saldo capturado.
 */
export type NivelSaldoIa = "ok" | "atencion" | "bajo" | "critico" | "agotado" | "desconocido";

export interface EstadoSaldoIa {
  nivel: NivelSaldoIa;
  /** Aviso ya redactado en es-MX; `null` cuando no hay nada que decir. */
  texto: string | null;
}

/** El COLOR del saldo: lo usan el número de la tarjeta Y la banda. */
export type TonoSaldoIa = "rojo" | "ambar" | "neutro" | "apagado";

export function tonoSaldoIa(nivel: NivelSaldoIa): TonoSaldoIa {
  switch (nivel) {
    case "agotado":
    case "critico":
      return "rojo";
    case "bajo":
    case "atencion":
      return "ambar";
    case "desconocido":
      return "apagado";
    default:
      return "neutro";
  }
}

/** ¿Sale la banda de aviso arriba del resumen? (`atencion` solo colorea el número.) */
export function muestraBandaSaldoIa(nivel: NivelSaldoIa): boolean {
  return nivel === "agotado" || nivel === "critico" || nivel === "bajo";
}

/** Botones de la banda y de la tarjeta: UN solo nombre para la captura del saldo. */
export const ETIQUETA_RECARGAR_IA = "Recargar en Anthropic";
export const ETIQUETA_ACTUALIZAR_SALDO_IA = "Actualizar saldo";

export const TEXTO_SALDO_IA_AGOTADO =
  "Sin saldo de créditos de IA: la lectura de tickets y las sugerencias dejan de funcionar hasta recargar en Anthropic (Plans & Billing) y actualizar el saldo aquí.";

export const TEXTO_SALDO_IA_DESCONOCIDO =
  "Todavía no se captura el saldo: entra a Anthropic, copia tu saldo y captúralo con «Actualizar saldo» para estimarlo.";

function numeroFinito(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Días que alcanza el saldo al ritmo de la última semana:
 * `floor(saldo / (consumo7d / 7))`. `null` cuando no hay ritmo que medir
 * (sin consumo registrado en 7 días, o el dato no llegó): no se inventa una
 * duración.
 */
export function diasRestantesIa(
  saldo: number,
  consumo7d: number | null | undefined,
): number | null {
  const c = numeroFinito(consumo7d);
  if (c == null || !(c > 0)) return null;
  const ritmoDiario = c / DIAS_RITMO_IA;
  return Math.max(0, Math.floor(saldo / ritmoDiario));
}

/**
 * Regla CONGELADA de la duración en el aviso: menos de un día entero ⇒
 * «menos de 1 día» (nunca «0 días», que se lee como «ya se acabó»); uno ⇒
 * «alrededor de 1 día»; más ⇒ «unos N días».
 */
export function textoDiasRestantesIa(dias: number): string {
  if (dias < 1) return "menos de 1 día";
  if (dias === 1) return "alrededor de 1 día";
  return `unos ${dias} días`;
}

/** Nivel del saldo estimado y su aviso (ver `NivelSaldoIa`). */
export function estadoSaldoIa(
  saldo: number | null | undefined,
  consumo7d?: number | null,
): EstadoSaldoIa {
  const s = numeroFinito(saldo);
  if (s == null) return { nivel: "desconocido", texto: TEXTO_SALDO_IA_DESCONOCIDO };
  // ≤ 0 AL CENTAVO: un saldo de $0.004 se pintaría «$0»; decir «quedan ≈ $0
  // USD» como si aún alcanzara sería mentir.
  if (Math.round(s * 100) <= 0) return { nivel: "agotado", texto: TEXTO_SALDO_IA_AGOTADO };
  const dias = diasRestantesIa(s, consumo7d);
  const ritmo = (d: number) => `${textoDiasRestantesIa(d)} al ritmo de la última semana`;
  const quedan = `quedan ≈ ${fmtUsd(s)} USD`;
  if (s < UMBRAL_SALDO_IA_CRITICO_USD || (dias != null && dias < 1)) {
    const duracion = dias != null && dias < 1 ? ` (${ritmo(dias)})` : "";
    return {
      nivel: "critico",
      texto: `Saldo de créditos de IA por agotarse: ${quedan}${duracion}. La estimación no cuenta las lecturas que fallan, así que la lectura de tickets puede estar fallando ya: recarga en Anthropic y actualiza el saldo aquí.`,
    };
  }
  if (s < UMBRAL_SALDO_IA_BAJO_USD) {
    const duracion = dias == null ? "" : ` (${ritmo(dias)})`;
    return {
      nivel: "bajo",
      texto: `Saldo bajo de créditos de IA: ${quedan}${duracion}. Recarga en Anthropic y actualiza el saldo aquí.`,
    };
  }
  if (s < UMBRAL_SALDO_IA_ATENCION_USD) {
    return {
      nivel: "atencion",
      texto: dias == null ? null : `Al ritmo de la última semana alcanza para ${textoDiasRestantesIa(dias)}.`,
    };
  }
  return { nivel: "ok", texto: null };
}

// ─────────────── Consumo de los últimos 7 días (hora Cancún) ───────────────

/** `[hoy − 6, hoy]` en días de pared (YYYY-MM-DD, hoy = `todayCancun()`). */
export function rangoUltimosDiasIa(
  hoy: string,
  dias: number = DIAS_RITMO_IA,
): { desde: string; hasta: string } {
  return { desde: diaMas(hoy, -(dias - 1)), hasta: hoy };
}

/**
 * ¿El rango que ya se pidió al API (el MES que mira la pantalla) contiene los
 * últimos 7 días? Si sí, el consumo sale de su `por_dia` sin otra llamada.
 */
export function rangoCubre(
  pedido: { desde: string; hasta: string },
  buscado: { desde: string; hasta: string },
): boolean {
  return pedido.desde <= buscado.desde && buscado.hasta <= pedido.hasta;
}

/**
 * Suma del costo de los días de `porDia` dentro del rango (USD). `null` si no
 * hay serie (resumen que no cargó): «no se sabe» nunca es 0.
 */
export function consumoEnRangoIa(
  porDia: ReadonlyArray<{ dia?: string | null; costo_usd?: unknown }> | null | undefined,
  rango: { desde: string; hasta: string },
): number | null {
  if (!porDia) return null;
  let total = 0;
  for (const d of porDia) {
    const dia = String(d.dia ?? "").slice(0, 10);
    if (dia < rango.desde || dia > rango.hasta) continue;
    total += numeroFinito(d.costo_usd) ?? 0;
  }
  return total;
}
