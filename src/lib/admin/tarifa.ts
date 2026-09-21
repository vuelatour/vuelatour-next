/**
 * TARIFA POR HORA — 6 decimales y rehidratación sin perder centavos (22-sep-2026)
 * ===============================================================================
 *
 * TERCERA pieza de la MISMA familia: T.C. (17-sep, `lib/format.ts::fmtTc`,
 * 6 decimales) → HORAS pactadas (22-sep, `lib/admin/horas.ts`, 8 decimales) →
 * TARIFA. El invariante es uno solo:
 *
 *      lo que se PERSISTE es EXACTAMENTE lo que se usó para MULTIPLICAR.
 *
 * El caso real (#105, COMPLETADO y cobrado): la oficina tecleó
 * **989.583333** $/hr para cerrar el SERVICIO AÉREO en $2,375.00 con 2.4 hr.
 * El motor multiplicó con la tarifa completa (2.4 × 989.583333 = 2,375.00
 * exacto) pero la BD la guardaba en `numeric(10,2)` y el snapshot como
 * `round2(...)`: quedó 989.58. Al reabrir, el panel rehidrataba ESE 989.58 en
 * «$/hr — SOLO esta cotización», el motor recalculaba 2.4 × 989.58 =
 * **2,374.99** y guardar sin tocar nada bajaba el total un centavo.
 * Exactamente el bug de la #322, pero por el otro factor del producto.
 *
 * AL PROBARLO EN PANTALLA: #105 lleva un descuento de $200.00 y $0 de IVA,
 * así que la TotalBar dice **$2,175.00** y la línea «Servicio aéreo»
 * $2,375.00. Las dos son correctas; con la tarifa truncada el par bajaba a
 * $2,174.99 / $2,374.99. No esperar $2,375.00 en la barra de total.
 *
 * Desde hoy el API persiste la tarifa con 6 decimales (`numeric(14,6)` en
 * `vuelo.tarifa_hora_usd` y `cotizacion_version_history.tarifa_hora_usd`, y
 * `calculo_snapshot.tarifa.usd_por_hora` a 6). Este módulo es la FUENTE ÚNICA
 * del panel para (a) rehidratar el valor persistido MÁS PRECISO, (b) no
 * confundir el eco truncado de un API a medio desplegar con una edición real
 * y (c) los pocos textos donde la tarifa aparece DENTRO de una multiplicación
 * —ahí se escribe completa, porque si no la cuenta no cuadra a la vista—.
 *
 * PRESENTACIÓN: en todo lo demás la tarifa se sigue pintando con `fmtUsd`
 * (2 decimales) y la hoja la imprime con `moneyPdf`, carácter por carácter
 * como el `_money` de pyservices. Este módulo NO cambia ningún PDF.
 *
 * Módulo PURO: sin React, sin red, sin `lib/format` (lo usan el diff de
 * versiones —puro a propósito— y componentes cliente). Congelado en
 * `__tests__/tarifa.test.ts`.
 */

import { HORAS_DECIMALES, fmtHorasDecimal } from "@/lib/admin/horas";

/** Decimales canónicos de una tarifa $/hr: los mismos que persiste el API. */
export const TARIFA_DECIMALES = 6;

/** Media unidad del último decimal: dos tarifas que difieren menos son la MISMA. */
export const TARIFA_EPSILON = 5e-7;

/**
 * Tolerancia de 2 decimales = lo que el API persistía ANTES del 22-sep-2026
 * (`numeric(10,2)`). Sirve para reconocer «es el mismo número, solo que
 * truncado» (989.58 vs 989.583333) y decidir cuál de los dos guarda más
 * precisión.
 */
export const TARIFA_EPSILON_2 = 5e-3;

/** Redondeo a `TARIFA_DECIMALES` (6) decimales. */
export function round6(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Tarifa normalizada a 6 decimales o `null` (vacío, no numérica, negativa).
 * El CERO se CONSERVA: «$0/hr» es un valor real del cliente INTERNO («Poner
 * todo en $0») y confundirlo con «sin capturar» borraría ese cambio del diff.
 */
export function normalizarTarifa(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return round6(n);
}

/**
 * Tarifa PACTADA utilizable o `null`: como `normalizarTarifa` pero el cero
 * también es `null`. Es el `Number(q.tarifa_hora_usd) > 0` que la
 * rehidratación del cotizador ya exigía: una tarifa 0 persistida es el cliente
 * interno —se resuelve por su propio camino— y rehidratarla como override
 * cambiaría en silencio el comportamiento de esas cotizaciones.
 */
export function tarifaPactadaONull(v: unknown): number | null {
  const n = normalizarTarifa(v);
  return n === null || n <= 0 ? null : n;
}

/** ¿Es la MISMA tarifa? (comparación a 6 decimales, no `===` de floats). */
export function mismaTarifa(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  tolerancia = TARIFA_EPSILON,
): boolean {
  const x = normalizarTarifa(a);
  const y = normalizarTarifa(b);
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) <= tolerancia;
}

// ---------------------------------------------------------------------------
// FORMATOS (presentación: aquí SÍ se recorta, porque nadie multiplica con esto)
// ---------------------------------------------------------------------------

/** Quita los ceros de cola de un `toFixed` ("989.580000" → "989.58"). */
function sinCerosDeCola(txt: string): string {
  return txt.includes(".") ? txt.replace(/0+$/, "").replace(/\.$/, "") : txt;
}

/**
 * Tarifa como número PELADO (sin `$` ni separadores de miles), sin ceros de
 * cola: 989.583333 → «989.583333», 650 → «650», "600.00" → «600». Es el texto
 * que se teclea en un `input`, así que sirve de placeholder sin mentir.
 * Vacío/NaN → cadena vacía (quien llama decide si pinta «—»).
 */
export function textoTarifaInput(
  v: number | string | null | undefined,
  maxDecimales = TARIFA_DECIMALES,
): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "";
  return sinCerosDeCola(n.toFixed(Math.max(0, Math.min(TARIFA_DECIMALES, maxDecimales))));
}

const dineroFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tarifaFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: TARIFA_DECIMALES,
});

/**
 * Formateadores del DIFF, uno por precisión (2 → 4 → 6 decimales). Mismo
 * estilo que el `fmtMonto` de `quote-revision.ts`: sin decimales forzados.
 */
const DIFF_FMT: Record<number, Intl.NumberFormat> = {
  2: new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  4: new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 }),
  [TARIFA_DECIMALES]: new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: TARIFA_DECIMALES,
  }),
};

/**
 * Tarifa con `$` y TODOS sus decimales significativos: «$600.00»,
 * «$989.583333». SOLO para los textos que enseñan la MULTIPLICACIÓN
 * («2.4 hr × $989.583333 = $2,375.00»): con «$989.58» la cuenta se lee
 * descuadrada por un centavo y el operador reporta un bug que no existe.
 * Para cualquier otra presentación: `fmtUsd` (2 decimales).
 */
export function moneyTarifa(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  const safe = Number.isFinite(n) ? (n as number) : 0;
  return `${safe < 0 ? "-" : ""}$${tarifaFmt.format(Math.abs(safe))}`;
}

/** «$2,375.00»: importe en USD, dos decimales (el de siempre). */
function moneyUsd2(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  const safe = Number.isFinite(n) ? (n as number) : 0;
  return `${safe < 0 ? "-" : ""}$${dineroFmt.format(Math.abs(safe))}`;
}

/** Cuántos decimales tiene el número ya redondeado a 6. */
function decimalesDe(n: number): number {
  const txt = textoTarifaInput(n, TARIFA_DECIMALES);
  const i = txt.indexOf(".");
  return i < 0 ? 0 : txt.length - i - 1;
}

/** ¿La tarifa trae más de los 2 decimales de siempre? (989.583333 → true). */
export function tarifaConDecimalesFinos(v: number | string | null | undefined): boolean {
  const n = normalizarTarifa(v);
  return n !== null && decimalesDe(n) > 2;
}

// ---------------------------------------------------------------------------
// PERSISTIDO
// ---------------------------------------------------------------------------

/**
 * Tarifa que debe REHIDRATARSE en el cotizador cuando el mismo número llega
 * por dos caminos: el snapshot del cálculo (`calculo_snapshot.tarifa.
 * usd_por_hora`) y la columna del vuelo (`tarifa_hora_usd`).
 *
 * - Si difieren de verdad (> 2.º decimal) manda el SNAPSHOT: es la foto del
 *   cálculo con el que se compuso el dinero impreso.
 * - Si son el mismo número con distinta precisión (989.58 vs 989.583333,
 *   snapshot viejo + columna nueva o al revés) manda el que conserva MÁS
 *   decimales: multiplicar con el truncado es justo el bug de la #105.
 *
 * Misma disciplina que `preferirHorasPersistidas`.
 */
export function preferirTarifaPersistida(
  snapshot: number | string | null | undefined,
  columna: number | string | null | undefined,
): number | null {
  const s = tarifaPactadaONull(snapshot);
  const c = tarifaPactadaONull(columna);
  if (s === null) return c;
  if (c === null) return s;
  if (Math.abs(s - c) > TARIFA_EPSILON_2) return s;
  return decimalesDe(c) > decimalesDe(s) ? c : s;
}

/**
 * Tarifa $/hr que hay que REHIDRATAR en «$/hr — SOLO esta cotización», o
 * `null` (la tarifa se re-resuelve desde el cliente/avión). Dos condiciones,
 * las dos necesarias:
 *
 * - el snapshot dice que fue override MANUAL (`proviene_de_override`): una
 *   tarifa que salió del avión o de la preferencial del cliente DEBE
 *   re-resolverse al cambiar PUBLICO↔BROKER o de avión;
 * - hay un valor persistido > 0, y se toma el MÁS PRECISO de los dos caminos
 *   (snapshot vs columna) — el centavo de la #105.
 *
 * Lo usan el cotizador de un avión y cualquier flujo que reabra una
 * cotización ya pactada.
 */
export function tarifaOverrideRehidratada(
  snapshotTarifa:
    | { proviene_de_override?: boolean | null; usd_por_hora?: number | string | null }
    | null
    | undefined,
  columna: number | string | null | undefined,
): number | null {
  if (snapshotTarifa?.proviene_de_override !== true) return null;
  return preferirTarifaPersistida(snapshotTarifa.usd_por_hora, columna);
}

/**
 * ¿`entrante` es el ECO TRUNCADO de `persistida`? (989.58 leído de una versión
 * guardada con 2 decimales contra los 989.583333 que de verdad se
 * multiplicaron): difieren, |Δ| ≤ 0.005 y el entrante tiene MENOS decimales.
 *
 * Mismo criterio que `esEcoDeTarifa` del API, que ANCLA ese eco a lo
 * persistido en vez de bajar el total. Aquí sirve para que el diff de
 * versiones no anuncie un cambio que el API va a descartar («Tarifa/hr
 * $989.58→$989.58»).
 */
export function esEcoDeTarifa(
  entrante: number | string | null | undefined,
  persistida: number | string | null | undefined,
): boolean {
  const e = normalizarTarifa(entrante);
  const p = normalizarTarifa(persistida);
  if (e === null || p === null) return false;
  const delta = Math.abs(e - p);
  if (delta <= TARIFA_EPSILON) return false; // es el MISMO número, no un eco
  if (delta > TARIFA_EPSILON_2) return false; // es una edición de verdad
  return decimalesDe(e) < decimalesDe(p);
}

// ---------------------------------------------------------------------------
// TEXTOS
// ---------------------------------------------------------------------------

/**
 * La CUENTA VIVA del motor bajo el campo de tarifa: «2.4 hr × $989.583333 =
 * $2,375.00». Devuelve `null` cuando no hay nada que explicar —tarifa de 2
 * decimales o menos, o faltan datos—: con «$600.00/hr» la multiplicación se
 * ve sola y una línea más solo estorba.
 *
 * Las HORAS van con TODA su precisión (8 decimales, sin ceros de cola) y el
 * IMPORTE es el que devolvió el MOTOR (`subtotal_vuelo_usd`), jamás una
 * multiplicación local: el panel solo pinta dinero que calculó el API. Sin
 * importe (el motor va un debounce atrás) la línea se queda en la cuenta y
 * quien llama dice «calculando…».
 */
export function textoCuentaTarifa(opciones: {
  horas: number | string | null | undefined;
  tarifa: number | string | null | undefined;
  importeUsd?: number | string | null;
}): string | null {
  const t = tarifaPactadaONull(opciones.tarifa);
  if (t === null || !tarifaConDecimalesFinos(t)) return null;
  const h = Number(opciones.horas);
  if (!Number.isFinite(h) || h <= 0) return null;
  const cuenta = `${fmtHorasDecimal(h, HORAS_DECIMALES)} hr × ${moneyTarifa(t)}`;
  const importe =
    opciones.importeUsd === null || opciones.importeUsd === undefined
      ? null
      : Number(opciones.importeUsd);
  if (importe === null || !Number.isFinite(importe)) return cuenta;
  return `${cuenta} = ${moneyUsd2(importe)}`;
}

/**
 * Par de textos para contar un cambio de tarifa SIN que se lea
 * «$989.58→$989.58» (diff de versiones): se escala la precisión (2 → 4 → 6
 * decimales) hasta que los dos textos se distingan. Un cambio real de dinero
 * siempre se ve.
 */
export function textoCambioTarifa(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): [string, string] {
  // El CERO se conserva («$0»): «Tarifa/hr $650→$0» es el cliente interno.
  const x = normalizarTarifa(a);
  const y = normalizarTarifa(b);
  // Mismo formato que el resto del diff (`fmtMonto`): sin decimales forzados,
  // «$650» y «$989.58». Solo se agregan decimales cuando hacen falta.
  const money = (v: number | null, dec: number) =>
    v === null ? "—" : `$${DIFF_FMT[dec]!.format(v)}`;
  for (const dec of [2, 4, TARIFA_DECIMALES]) {
    const ta = money(x, dec);
    const tb = money(y, dec);
    if (ta !== tb) return [ta, tb];
  }
  return [money(x, TARIFA_DECIMALES), money(y, TARIFA_DECIMALES)];
}
