/**
 * Utilidad de la TIENDA VuelaTour — 25-sep-2026.
 *
 * Pedido del cliente: «Producto | Categoría | Stock | Utilidad (de los
 * productos que compramos, el precio que le ponemos en el costo se le saca
 * el 25 % el cual va a ser nuestra utilidad por producto vendido o cargado a
 * un avión). Ya echamos a andar la venta de VuelaTour, que viene siendo la
 * "tienda"; ya se cargaron varios productos en los aviones y necesitamos ver
 * las ganancias de dichos productos».
 *
 * La regla y TODOS los números son del API: toda salida a un avión sin
 * precio se cobra a su costo × (1 + margen) —25 % por defecto, en
 * Configuración— y la utilidad = venta − costo sale de la fuente única
 * `inventario-cardex.util.ts#ventaDeSalida` (la MISMA que el Balance
 * general). Desde el API 0.0.36 (25-sep-2026) el costo es el ÚLTIMO PRECIO
 * DE COMPRA (congelado en la salida) y las ventas en dólares se convierten a
 * pesos con el T.C. oficial del día de la venta: la utilidad cuenta en
 * PESOS y el dólar original es dato secundario (`*_usd_original`). El panel
 * NO recalcula utilidad, costo ni T.C.: solo PINTA lo que manda y suma la
 * MISMA moneda. **Pesos y dólares jamás se suman** (invariante 8 del API):
 * `utilidad_usd` solo trae ya las filas que siguen SIN T.C.
 *
 * Todo aquí es PURO (prueba `__tests__/inventario-utilidad.test.ts`):
 * ningún componente redacta estas frases.
 */

import { fmtMxn, fmtUsd } from "@/lib/format";

export type Moneda = "MXN" | "USD";

/** Margen por defecto (espejo de `MARGEN_VENTA_PCT_DEFAULT` del API). */
export const MARGEN_VENTA_PCT_DEFAULT = 25;

/** Margen para TEXTOS: el del API si vino y es válido; si no, 25. El número real lo decide el API. */
export function margenParaTexto(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100
    ? v
    : MARGEN_VENTA_PCT_DEFAULT;
}

/** «25», «12.5»: el % sin ceros de cola. */
export function pctTxt(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

// ───────────────────────── Textos únicos ─────────────────────────

export const ETIQUETA_UTILIDAD = "Utilidad";
export const TITULO_TARJETA_TIENDA = "Utilidad de la tienda";

/**
 * Nota bajo la tarjeta de la tienda (con el margen vigente). `enPesos` = el
 * API ya convierte las ventas en dólares con el T.C. de su día (0.0.36,
 * `regla_costo`); sin él (API previo) se dice lo de siempre: pesos y dólares
 * van por separado.
 */
export function notaUtilidad(margenPct?: number | null, opts: { enPesos?: boolean } = {}): string {
  const margen = `Toda salida sin precio se cobra a ese costo + ${pctTxt(margenParaTexto(margenPct))} % (se cambia en Configuración). `;
  return opts.enPesos
    ? "Utilidad = lo que se cobra al avión − el costo de la pieza (último precio de compra). " +
        margen +
        "Las ventas en dólares se convierten a pesos con el T.C. oficial de su día."
    : "Utilidad = lo que se cobra al avión − el costo de la pieza. " + margen + "Pesos y dólares nunca se suman.";
}

/** La nota con el margen de siempre (25 %). */
export const NOTA_UTILIDAD = notaUtilidad(MARGEN_VENTA_PCT_DEFAULT);

export const AVISO_ENTRADAS_SIN_COSTO =
  "Hay entradas sin costo: la utilidad se ve inflada hasta capturar su costo real.";

/** Aviso cuando hay ventas en pesos sobre costo en dólares sin T.C. */
export function avisoVentasSinUtilidad(n: number): string {
  return (
    `${n} ${n === 1 ? "venta" : "ventas"} en pesos sobre costo en dólares sin tipo de cambio: ` +
    "su utilidad no se puede calcular. Captura el T.C. de la compra con «Editar costo»."
  );
}

/** Aviso de un API PREVIO (sin utilidad en dólares): lo de siempre. */
export const AVISO_SIN_TC_API_PREVIO =
  "Hay movimientos en USD sin tipo de cambio: sus pesos no se cuentan.";

// ───────────────────────── Montos ─────────────────────────

/** Número conocido o null (null, undefined, "" y NaN son «no se sabe»). */
export function numeroONulo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monto con signo y moneda SIEMPRE escrita (`fmtUsd` y `fmtMxn` comparten
 * el «$»): «+$63.75 USD», «−$10.00 MXN», «$0 USD». El menos es el
 * tipográfico «−».
 */
export function textoMonto(v: number, moneda: Moneda, opts: { signo?: boolean } = {}): string {
  const conSigno = opts.signo !== false;
  const centavos = Math.round(Math.abs(v) * 100);
  const abs = centavos / 100;
  const cuerpo = moneda === "USD" ? `${fmtUsd(abs)} USD` : fmtMxn(abs);
  if (!conSigno || centavos === 0) return cuerpo;
  return `${v > 0 ? "+" : "−"}${cuerpo}`;
}

const precioUnitarioFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/**
 * PRECIO UNITARIO con su moneda, de 2 a 4 decimales (así se captura y así lo
 * guarda el cardex): «$26.5625 USD», «$21.25 USD», «$1,658.33 MXN», «$30.00
 * USD». Un TOTAL no va aquí: los totales son dinero y van con `textoMonto`
 * (nunca con 1 decimal, siempre con moneda).
 */
export function fmtPrecioUnitario(
  v: number | string | null | undefined,
  moneda: Moneda | string | null | undefined,
): string {
  const n = numeroONulo(v);
  if (n == null) return "—";
  const m = moneda === "USD" ? "USD" : "MXN";
  const signo = n < 0 ? "−" : "";
  return `${signo}$${precioUnitarioFmt.format(Math.abs(n))} ${m}`;
}

export type Tono = "positivo" | "negativo" | "neutro";

export function tonoDe(v: number | null | undefined): Tono {
  if (v == null || !Number.isFinite(v)) return "neutro";
  const c = Math.round(v * 100);
  return c > 0 ? "positivo" : c < 0 ? "negativo" : "neutro";
}

/** Utilidad en las dos monedas, CADA UNA POR SU LADO. */
export interface UtilidadPartes {
  mxn: number | null;
  usd: number | null;
}

export interface ParteUtilidad {
  moneda: Moneda;
  monto: number;
  texto: string;
  tono: Tono;
}

/** Partes con dato, primero pesos y luego dólares. Nunca una suma de las dos. */
export function partesUtilidad(p: UtilidadPartes): ParteUtilidad[] {
  const out: ParteUtilidad[] = [];
  if (p.mxn != null) out.push({ moneda: "MXN", monto: p.mxn, texto: textoMonto(p.mxn, "MXN"), tono: tonoDe(p.mxn) });
  if (p.usd != null) out.push({ moneda: "USD", monto: p.usd, texto: textoMonto(p.usd, "USD"), tono: tonoDe(p.usd) });
  return out;
}

/** [] (sin ventas) | ['+$1,200.00 MXN'] | ['+$191.25 USD'] | ambas. */
export function lineasUtilidad(p: UtilidadPartes): string[] {
  return partesUtilidad(p).map((x) => x.texto);
}

/** Lo mínimo de un ítem de la lista para su utilidad. */
export interface ItemUtilidad {
  utilidad_mxn?: number | string | null;
  ganancia_mxn?: number | string | null;
  utilidad_usd?: number | string | null;
  salidas_cant?: number | string | null;
  ventas_cant?: number | string | null;
  ventas_sin_utilidad?: number | null;
  con_entradas_sin_costo?: boolean;
  con_movimientos_sin_tc?: boolean;
  /** API 0.0.36: utilidad de las ventas dólar-sobre-dólar, en dólares (solo informativo). */
  utilidad_usd_original?: number | string | null;
  unidad?: string | null;
}

/**
 * Utilidad del producto: pesos (`utilidad_mxn`; con un API previo,
 * `ganancia_mxn`, que es el mismo número) y dólares (`utilidad_usd`).
 */
export function utilidadDeItem(it: ItemUtilidad): UtilidadPartes {
  const mxn = numeroONulo(it.utilidad_mxn) ?? numeroONulo(it.ganancia_mxn);
  return { mxn, usd: numeroONulo(it.utilidad_usd) };
}

/** «1 unidad» / «66 unidades». */
function unidades(n: number): string {
  const txt = n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
  return `${txt} ${n === 1 ? "unidad" : "unidades"}`;
}

/**
 * «En dólares: +$191.25 USD (al T.C. de cada venta)» — lo que la utilidad en
 * pesos vale en los dólares originales (dato secundario, jamás sumado).
 */
export function textoUtilidadUsdOriginal(v: number | string | null | undefined): string | null {
  const n = numeroONulo(v);
  return n == null ? null : `En dólares: ${textoMonto(n, "USD")} (al T.C. de cada venta)`;
}

/**
 * Tooltip de la celda: «66 unidades cargadas a aviones (30 a costo, sin
 * utilidad) · margen vigente 25 % sobre el costo» y, con el API 0.0.36, «.
 * En dólares: +$191.25 USD (al T.C. de cada venta)». Sin salidas: «Sin
 * salidas a aviones · margen …». Con un API previo (sin `ventas_cant`) no se
 * inventa cuántas fueron a costo.
 */
export function tituloUtilidad(it: ItemUtilidad, margenPct?: number | null): string {
  const base = tituloUtilidadBase(it, margenPct);
  const usd = textoUtilidadUsdOriginal(it.utilidad_usd_original);
  return usd ? `${base}. ${usd}` : base;
}

function tituloUtilidadBase(it: ItemUtilidad, margenPct?: number | null): string {
  const margen = `margen vigente ${pctTxt(margenParaTexto(margenPct))} % sobre el costo`;
  const salidas = numeroONulo(it.salidas_cant) ?? 0;
  if (salidas <= 0) return `Sin salidas a aviones · ${margen}`;
  const verbo = salidas === 1 ? "cargada" : "cargadas";
  let texto = `${unidades(salidas)} ${verbo} a aviones`;
  if ("ventas_cant" in it) {
    const vendidas = numeroONulo(it.ventas_cant) ?? 0;
    const aCosto = Math.round((salidas - vendidas) * 1000) / 1000;
    if (aCosto > 0) texto += ` (${aCosto.toLocaleString("es-MX", { maximumFractionDigits: 3 })} a costo, sin utilidad)`;
  }
  return `${texto} · ${margen}`;
}

/**
 * Triángulo ámbar de la celda: por qué la cifra no es de fiar. null = nada
 * que avisar. «sin TC» YA NO se avisa cuando el API manda la utilidad en
 * dólares (esa venta sí tiene utilidad, en su moneda); solo con un API
 * PREVIO se conserva el aviso de siempre.
 */
export function avisoUtilidad(it: ItemUtilidad): string | null {
  const partes: string[] = [];
  if (it.con_entradas_sin_costo) partes.push(AVISO_ENTRADAS_SIN_COSTO);
  const incompletas = numeroONulo(it.ventas_sin_utilidad) ?? 0;
  if (incompletas > 0) partes.push(avisoVentasSinUtilidad(incompletas));
  const apiPrevio = !("utilidad_usd" in it);
  if (apiPrevio && it.con_movimientos_sin_tc) partes.push(AVISO_SIN_TC_API_PREVIO);
  return partes.length > 0 ? partes.join(" ") : null;
}

// ───────────────────────── Tarjeta «Utilidad de la tienda» ─────────────────────────

export interface ResumenTiendaParaTexto {
  utilidad_mxn: number | null;
  utilidad_usd: number | null;
}

/** «+$535.35 USD», «+$1,200.00 MXN · +$535.35 USD» o «Sin ventas en el periodo». */
export function textoUtilidadTienda(r: ResumenTiendaParaTexto): string {
  const lineas = lineasUtilidad({ mxn: numeroONulo(r.utilidad_mxn), usd: numeroONulo(r.utilidad_usd) });
  return lineas.length > 0 ? lineas.join(" · ") : "Sin ventas en el periodo";
}

/**
 * Línea tenue bajo la cifra en pesos de la tarjeta: «≈ +$535.35 USD al T.C.
 * de cada venta» (dato secundario; jamás sumado a los pesos).
 */
export function lineaUsdOriginalTienda(v: number | string | null | undefined): string | null {
  const n = numeroONulo(v);
  return n == null ? null : `≈ ${textoMonto(n, "USD")} al T.C. de cada venta`;
}

/** «48 unidades vendidas a aviones · margen 25 % sobre el costo». */
export function lineaUnidadesTienda(unidadesVendidas: number, margenPct?: number | null): string {
  const n = Math.max(0, unidadesVendidas || 0);
  const txt = n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
  const verbo = n === 1 ? "unidad vendida" : "unidades vendidas";
  return `${txt} ${verbo} a aviones · margen ${pctTxt(margenParaTexto(margenPct))} % sobre el costo`;
}

// ───────────────────────── Periodos de la tarjeta ─────────────────────────

export const PERIODOS_TIENDA = [
  { valor: "todo", etiqueta: "Todo" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mes-anterior", etiqueta: "Mes pasado" },
] as const;
export type PeriodoTienda = (typeof PERIODOS_TIENDA)[number]["valor"];
/** Default: todo el historial (no se escribe en la URL). */
export const PERIODO_TIENDA_DEFAULT: PeriodoTienda = "todo";

/** `?periodo=` → periodo válido; fuera de catálogo o ausente ⇒ «Todo». */
export function periodoTiendaDeUrl(
  v: string | readonly string[] | null | undefined,
): PeriodoTienda {
  const s = Array.isArray(v) ? v[0] : (v as string | null | undefined);
  return (PERIODOS_TIENDA.find((p) => p.valor === s)?.valor ?? PERIODO_TIENDA_DEFAULT) as PeriodoTienda;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Rango en días Cancún (`hoyCancun` = `todayCancun()`, YYYY-MM-DD):
 *  - `todo` ⇒ null (todo el historial).
 *  - `mes` ⇒ del 1.º del mes a HOY.
 *  - `mes-anterior` ⇒ el mes pasado completo.
 */
export function rangoPeriodoTienda(
  periodo: PeriodoTienda,
  hoyCancun: string,
): { desde: string; hasta: string } | null {
  if (periodo === "todo") return null;
  const [y, m] = hoyCancun.slice(0, 10).split("-").map(Number);
  if (periodo === "mes") return { desde: `${y}-${pad(m)}-01`, hasta: hoyCancun.slice(0, 10) };
  const ya = m === 1 ? y - 1 : y;
  const ma = m === 1 ? 12 : m - 1;
  // Día 0 del mes siguiente = último día del mes pasado (UTC puro: sin horas).
  const ultimo = new Date(Date.UTC(ya, ma, 0)).getUTCDate();
  return { desde: `${ya}-${pad(ma)}-01`, hasta: `${ya}-${pad(ma)}-${pad(ultimo)}` };
}

/** Descripción del periodo para la tarjeta («todo el historial», «del 1 al 25 sep»). */
export function textoPeriodoTienda(periodo: PeriodoTienda): string {
  return periodo === "todo"
    ? "todo el historial"
    : periodo === "mes"
      ? "este mes (hasta hoy)"
      : "el mes pasado";
}

// ───────────────────────── Ventas del detalle ─────────────────────────

export const TEXTO_A_COSTO = "A costo · sin utilidad";
