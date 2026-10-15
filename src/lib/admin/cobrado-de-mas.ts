/**
 * «COBRADO DE MÁS» CON SU CAUSA (14-oct-2026, API 0.0.78, invariante 77 del
 * API). Módulo PURO (sin React ni red; prueba `__tests__/cobrado-de-mas.test.ts`).
 * Pedido del cliente: «…y la de «cobrado de más» en la card».
 *
 * El excedente, la causa probable y TODOS sus textos (`titulo`, `explicacion`,
 * `que_hacer`, en es-MX y con «Posible causa», nunca afirmando) los arma el
 * API en `snapshot.cobrado_de_mas` (la cifra es la MISMA que el balance manda
 * a «otros movimientos» de VuelaTour). Aquí JAMÁS se calcula: el panel solo
 * elige el tono —AVISO ámbar y visible si requiere revisión; INFO en una
 * línea gris si está explicado (comisión del link pagada por el cliente,
 * redondeo del T.C.)—, arma el enlace al otro vuelo y redacta la frase de
 * los cobros en pesos sin T.C. con los números del API.
 *
 * También vive aquí lo del renglón NO bloqueante «Vuelos cobrados de más» del
 * pre-cierre (sufijo de la causa en cada chip y la línea gris de los
 * explicados) y la vista previa «Rebasa el pendiente / Cubre el pendiente /
 * Quedará pendiente» del formulario de cobro: la única resta que hace el
 * panel, con números del API (pendiente, `monto_usd`, monto total y cobrado),
 * como ya hacía «Quedará pendiente»; el API recalcula al guardar.
 */

import { TOLERANCIA_COBRO_USD } from "@/lib/admin/cobros";
import { esUuid } from "@/lib/admin/url-params";
import { fmtMonto, fmtUsd } from "@/lib/format";
import type { CausaCobradoDeMas, CobradoDeMasVuelo } from "@/types/flights";

function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** «a», «a y b», «a, b y c». */
function listaEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «Es la comisión…» ⇒ «es la comisión…» (una sigla como «IVA …» no se toca). */
function minusculaInicial(s: string): string {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// ───────────────────────────── El aviso de la card ─────────────────────────────

export const ETIQUETA_QUE_HACER = "Qué hacer:";
/** Caja ámbar del AVISO (requiere revisión). */
export const CLASES_AVISO_COBRADO_DE_MAS = "rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs";
/** Línea gris del INFO (explicado: nada que corregir). */
export const CLASES_INFO_COBRADO_DE_MAS = "text-[11px] text-muted-foreground";

export interface PresentacionCobradoDeMas {
  tono: "AVISO" | "INFO";
  clases: string;
  /** «Cobrado de más: $495.99 USD» (del API). */
  titulo: string;
  /** La explicación con la causa probable (del API). */
  cuerpo: string;
  /** «Qué hacer» (del API). */
  queHacer: string;
  /** INFO: la línea gris completa («Cobrado de más: $214.26 USD — es la comisión…»). */
  linea: string;
  /** El otro vuelo de la causa OTRO_VUELO_DEL_CLIENTE («Ver el vuelo #332»). */
  enlace: { href: string; texto: string } | null;
  /** «Además hay N cobro(s) en pesos sin T.C. ($X MXN) que no entraron a la cuenta.» */
  sinTc: string | null;
}

/** Frase de los cobros en pesos que no entraron a la cuenta (números del API). */
export function textoSinTcCobradoDeMas(sinTc: { n?: unknown; mxn?: unknown } | null | undefined): string | null {
  const n = Math.trunc(numeroONull(sinTc?.n) ?? 0);
  if (!(n > 0)) return null;
  const mxn = numeroONull(sinTc?.mxn);
  const monto = mxn != null ? ` (${fmtMonto(mxn, "MXN")})` : "";
  return n === 1
    ? `Además hay 1 cobro en pesos sin T.C.${monto} que no entró a la cuenta.`
    : `Además hay ${n} cobros en pesos sin T.C.${monto} que no entraron a la cuenta.`;
}

/**
 * Cómo se pinta `snapshot.cobrado_de_mas`. null/ausente (sin aviso, API
 * previo o rol de campo) o sin título ⇒ null: el panel JAMÁS lo deduce. AVISO
 * (`requiere_revision`) ⇒ caja ámbar con título, causa, «Qué hacer» y el
 * enlace al otro vuelo; INFO ⇒ una línea gris.
 */
export function presentacionCobradoDeMas(
  aviso: CobradoDeMasVuelo | null | undefined,
): PresentacionCobradoDeMas | null {
  if (!aviso || typeof aviso !== "object") return null;
  const titulo = textoONull(aviso.titulo);
  if (!titulo) return null;
  const cuerpo = textoONull(aviso.explicacion) ?? "";
  const queHacer = textoONull(aviso.que_hacer) ?? "";
  const info = aviso.tono ? aviso.tono === "INFO" : aviso.requiere_revision === false;
  const ref = aviso.referencia ?? null;
  const vueloId = textoONull(ref?.vuelo_id);
  const folio = typeof ref?.folio === "number" && ref.folio > 0 ? ref.folio : null;
  const enlace =
    vueloId && esUuid(vueloId)
      ? {
          href: `/admin/flights/${vueloId}#cobros`,
          texto: folio != null ? `Ver el vuelo #${folio}` : "Ver el otro vuelo",
        }
      : null;
  const linea = cuerpo
    ? `${titulo} — ${minusculaInicial(cuerpo)}${queHacer ? ` ${queHacer}` : ""}`
    : `${titulo}.${queHacer ? ` ${queHacer}` : ""}`;
  return {
    tono: info ? "INFO" : "AVISO",
    clases: info ? CLASES_INFO_COBRADO_DE_MAS : CLASES_AVISO_COBRADO_DE_MAS,
    titulo,
    cuerpo,
    queHacer,
    linea,
    enlace,
    sinTc: textoSinTcCobradoDeMas(aviso.sin_tc),
  };
}

// ───────────────────────────── Pre-cierre ─────────────────────────────

/** COPIA de la clave del API (`CLAVE_PRECIERRE_COBRADOS_DE_MAS`, profit-sharing/vuelos-cobrados-de-mas.util.ts). */
export const CLAVE_PRECIERRE_COBRADOS_DE_MAS = "vuelos_cobrados_de_mas";

/** «Resolver →»: la lista de vuelos DEL PERIODO (cada chip lleva a la card de cobros de su vuelo). */
export function hrefPrecierreCobradosDeMas(p: { desde: string; hasta: string }): string {
  return `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`;
}

const SUFIJO_CAUSA: Record<CausaCobradoDeMas, string> = {
  IVA_NO_COTIZADO: "· IVA",
  COBRO_DUPLICADO: "· duplicado",
  SOBRE_DE_GRUPO: "· sobre",
  SIN_CAUSA_CLARA: "· revisar",
  OTRO_VUELO_DEL_CLIENTE: "· otro vuelo",
  COMISION_PAGADA_POR_CLIENTE: "· comisión",
  REDONDEO_TC: "· redondeo",
};

/** Sufijo del chip «#217 ($495.99) · IVA» (causa desconocida ⇒ ""). */
export function sufijoCausaPreCierre(causa: string | null | undefined): string {
  return causa && Object.prototype.hasOwnProperty.call(SUFIJO_CAUSA, causa)
    ? SUFIJO_CAUSA[causa as CausaCobradoDeMas]
    : "";
}

/** Tooltip del chip: la causa completa del API. */
export function tituloCausaPreCierre(v: { causa_etiqueta?: string | null }): string | undefined {
  const e = textoONull(v.causa_etiqueta);
  return e ? `Posible causa: ${e}. Revisa la card de cobros del vuelo.` : undefined;
}

/** Cuántos folios explicados se nombran (el resto, «y N más»). */
export const MAX_EXPLICADOS_PRECIERRE = 10;

/**
 * La línea gris de los vuelos con la diferencia EXPLICADA (no cuentan en el
 * renglón): «Con la diferencia explicada: #81 y #84 (comisión del link pagada
 * por el cliente).», agrupados por la etiqueta de la causa del API. null sin
 * explicados. Revisión del 15-oct-2026: el `detalle` del API ya cierra con
 * «Además hay N vuelo(s) con la diferencia explicada (…) que no requiere(n)
 * acción.»; esta línea dice CUÁLES (antes empezaba también con «Además:» y
 * repetía «no requiere acción»: parecían dos grupos de vuelos distintos).
 */
export function lineaExplicadosPreCierre(
  explicados: ReadonlyArray<{ folio?: number | null; causa_etiqueta?: string | null }> | null | undefined,
): string | null {
  const lista = Array.isArray(explicados) ? explicados : [];
  if (lista.length === 0) return null;
  const visibles = lista.slice(0, MAX_EXPLICADOS_PRECIERRE);
  const grupos = new Map<string, string[]>();
  for (const v of visibles) {
    const etiqueta = textoONull(v.causa_etiqueta) ?? "diferencia explicada";
    const folio = typeof v.folio === "number" && v.folio > 0 ? `#${v.folio}` : "un vuelo";
    grupos.set(etiqueta, [...(grupos.get(etiqueta) ?? []), folio]);
  }
  const partes = [...grupos.entries()].map(([etiqueta, folios]) => `${listaEs(folios)} (${etiqueta})`);
  const resto = lista.length - visibles.length;
  const cuerpo = resto > 0 ? `${partes.join(", ")} y ${resto} más` : listaEs(partes);
  return `Con la diferencia explicada: ${cuerpo}.`;
}

// ───────────────────────────── Formulario de cobro ─────────────────────────────

export type TonoVistaPreviaCobro = "rebasa" | "cubre" | "queda" | "neutro";

export interface VistaPreviaCobro {
  tono: TonoVistaPreviaCobro;
  texto: string;
  /** Solo al rebasar: qué hacer si el depósito también pagó otro vuelo. */
  ayuda: string | null;
}

export const TEXTO_SALDO_AL_GUARDAR = "El saldo del vuelo se recalcula al guardar.";
export const TEXTO_COBRO_RETENIDO = "Queda como cobro retenido del vuelo cancelado.";
export const TEXTO_CUBRE_PENDIENTE = "Cubre el pendiente — el vuelo se marcará como cobrado.";
export const AYUDA_REBASA_PENDIENTE =
  "Si el depósito también pagó otro vuelo, registra aquí solo lo de este vuelo y el resto como cobro del otro; en Conciliación el depósito se vincula a los dos cobros.";

/** Clases del texto de la vista previa. */
export const CLASE_TEXTO_VISTA_PREVIA: Record<TonoVistaPreviaCobro, string> = {
  rebasa: "font-medium text-amber-700 dark:text-amber-300",
  cubre: "text-green-600 dark:text-green-400",
  queda: "text-muted-foreground",
  neutro: "text-muted-foreground",
};

/** Clases de la caja: ámbar solo cuando rebasa. */
export const CLASE_CAJA_VISTA_PREVIA: Record<TonoVistaPreviaCobro, string> = {
  rebasa: "border-amber-500/50 bg-amber-500/10",
  cubre: "border-border bg-muted/20",
  queda: "border-border bg-muted/20",
  neutro: "border-border bg-muted/20",
};

/**
 * Lo que dice la ficha debajo de «Equivale a $X USD.» (D21). Con la MISMA
 * tolerancia de la bandera `cobrado` ($1.00, `TOLERANCIA_COBRO_USD`):
 * - alta: excedente = lo que equivale − el pendiente; > $1.00 ⇒ «Rebasa el
 *   pendiente por $X USD: el vuelo quedará cobrado de más.» + la ayuda; ≥
 *   −$1.00 ⇒ «Cubre el pendiente…»; si no, «Quedará pendiente $Y USD.»;
 * - corrección con `monto_usd` del API: el saldo SIN este cobro =
 *   (monto total − cobrado) + `monto_usd` y los mismos tres casos (el
 *   primero, «Con este cambio el vuelo quedará cobrado de más por $X
 *   USD.»); sin `monto_usd` (API previo o pesos sin T.C.) ⇒ el texto de
 *   siempre, «El saldo del vuelo se recalcula al guardar.»;
 * - vuelo cancelado: como siempre (cobro retenido / se recalcula al guardar).
 * Sin precio fijo —monto total ≤ 0 (cliente interno) o cotización ABIERTA (el
 * precio se cierra al final del viaje)— nunca dice «cobrado de más»: el API
 * tampoco avisa en esos casos (`cobradoDeMas` ⇒ null).
 */
export function vistaPreviaMontoCobro(p: {
  usdEquivalente: number;
  /** Alta: el pendiente de la página (`pendienteCobro`). */
  pendingUsd: number;
  montoTotalUsd: number;
  cancelado: boolean;
  enEdicion: boolean;
  /** Cotización ABIERTA: el total todavía no es el final. */
  cotizacionAbierta?: boolean;
  /** Corrección: monto total − cobrado del vuelo (sin topar; números del API). */
  saldoUsd?: number | null;
  /** Corrección: el `monto_usd` del cobro que se corrige (API 0.0.78). */
  montoUsdOriginal?: number | null;
}): VistaPreviaCobro {
  if (p.enEdicion) {
    const saldo = numeroONull(p.saldoUsd);
    const original = numeroONull(p.montoUsdOriginal);
    if (p.cancelado || saldo == null || original == null) {
      return { tono: "neutro", texto: TEXTO_SALDO_AL_GUARDAR, ayuda: null };
    }
    return tresCasos(p.usdEquivalente, saldo + original, totalFijo(p), true);
  }
  if (p.cancelado) return { tono: "neutro", texto: TEXTO_COBRO_RETENIDO, ayuda: null };
  return tresCasos(p.usdEquivalente, p.pendingUsd, totalFijo(p), false);
}

/** ¿El vuelo tiene un total FIJO contra el cual «rebasar»? */
function totalFijo(p: { montoTotalUsd: number; cotizacionAbierta?: boolean }): boolean {
  return p.cotizacionAbierta !== true && (Number(p.montoTotalUsd) || 0) > 0;
}

function tresCasos(usd: number, pendiente: number, conTotal: boolean, edicion: boolean): VistaPreviaCobro {
  const tolerancia = Math.round(TOLERANCIA_COBRO_USD * 100);
  const excedente = Math.round(((Number(usd) || 0) - (Number(pendiente) || 0)) * 100);
  if (conTotal && excedente > tolerancia) {
    const x = fmtUsd(excedente / 100);
    return {
      tono: "rebasa",
      texto: edicion
        ? `Con este cambio el vuelo quedará cobrado de más por ${x} USD.`
        : `Rebasa el pendiente por ${x} USD: el vuelo quedará cobrado de más.`,
      ayuda: AYUDA_REBASA_PENDIENTE,
    };
  }
  if (excedente >= -tolerancia) return { tono: "cubre", texto: TEXTO_CUBRE_PENDIENTE, ayuda: null };
  return { tono: "queda", texto: `Quedará pendiente ${fmtUsd(-excedente / 100)} USD.`, ayuda: null };
}
