/**
 * HORAS PACTADAS — captura amigable y precisión de 8 decimales (22-sep-2026)
 * ==========================================================================
 *
 * Pedido del cliente (cotizaciones #322 y #302, misma ruta y misma tarifa):
 * «no me lo redondea en la primer captura… revisa ese error y corrígelo». En
 * la #302 el subtotal salía $1,400.00 y en la #322 $1,399.98 con los MISMOS
 * datos. La causa NO era el motor: el motor multiplica con la precisión
 * completa (2.333333333 × 600 = 1400.00), pero lo que se PERSISTÍA eran las
 * horas a 4 decimales. Al reabrir la cotización el panel rehidrataba ese
 * 2.3333 y el cálculo en vivo daba 2.3333 × 600 = 1399.98; si se guardaba,
 * el descuadre quedaba grabado. Misma familia que el T.C. de 4 decimales
 * corregido el 17-sep (`lib/format.ts::fmtTc`).
 *
 * INVARIANTE: lo que se persiste es EXACTAMENTE lo que se usó para
 * multiplicar. El API pasó `tiempo_cobrable_hr` a `numeric(14,8)`; aquí el
 * panel deja de recortar ese número en el camino de ida (lo que viaja al
 * API) y lo pinta con formatos de PRESENTACIÓN explícitos.
 *
 * Además, capturar «2.333333333» a mano es imposible en la práctica: el
 * campo «Cobrable pactado» acepta ahora HORAS:MINUTOS («2:20» ⇒ 2.33333333),
 * que es como el operador piensa el tiempo pactado.
 *
 * Módulo PURO: sin React, sin red, sin `lib/format` (para que lo pueda usar
 * también el diff de versiones, que es puro a propósito). Congelado en
 * `__tests__/horas.test.ts`.
 */

/** Decimales canónicos de unas horas pactadas: los mismos que persiste el API. */
export const HORAS_DECIMALES = 8;

/** Media unidad del último decimal: dos horas que difieren menos son la MISMA. */
export const HORAS_EPSILON = 5e-9;

/**
 * Tolerancia de 4 decimales = lo que el API persistía ANTES del 22-sep-2026.
 * Sirve para reconocer «es el mismo número, solo que truncado» (2.3333 vs
 * 2.33333333) y decidir cuál de los dos guarda más precisión.
 */
export const HORAS_EPSILON_4 = 5e-5;

/** Máximo razonable de horas pactadas en una cotización (el input lo usa). */
export const HORAS_MAXIMO = 48;

/** Redondeo a `HORAS_DECIMALES` (8) decimales. */
export function round8(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1e8) / 1e8;
}

/**
 * Número de horas utilizable o `null`: descarta vacío, no numérico, negativo
 * y cero (cero = «sin pactar», el motor cae a la regla).
 */
export function horasONull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return round8(n);
}

/** ¿Son las MISMAS horas? (comparación a 8 decimales, no `===` de floats). */
export function mismasHoras(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  tolerancia = HORAS_EPSILON,
): boolean {
  const x = horasONull(a);
  const y = horasONull(b);
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) <= tolerancia;
}

// ---------------------------------------------------------------------------
// FORMATOS (presentación: aquí SÍ se recorta, porque nadie multiplica con esto)
// ---------------------------------------------------------------------------

/** Quita los ceros de cola de un `toFixed` ("2.3300" → "2.33", "3.00" → "3"). */
function sinCerosDeCola(txt: string): string {
  return txt.includes(".") ? txt.replace(/0+$/, "").replace(/\.$/, "") : txt;
}

/**
 * Horas como decimal, sin ceros de cola: `fmtHorasDecimal(2.33333333)` con el
 * default de 4 → «2.3333»; con 8 → «2.33333333». Vacío/NaN → cadena vacía
 * (quien llama decide si pinta «—»).
 */
export function fmtHorasDecimal(
  v: number | string | null | undefined,
  maxDecimales = 4,
): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "";
  return sinCerosDeCola(n.toFixed(Math.max(0, Math.min(HORAS_DECIMALES, maxDecimales))));
}

/**
 * Horas en lenguaje de reloj: 2.33333333 → «2 h 20 min», 0.5 → «30 min»,
 * 3 → «3 h». Cuando el número NO cae en un minuto exacto se antepone «≈»
 * (jamás se afirma una equivalencia que no es): 2.34 → «≈ 2 h 20 min».
 * Vacío → cadena vacía.
 */
export function fmtHorasMinutos(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "";
  const minutosExactos = n * 60;
  const min = Math.round(minutosExactos);
  const exacto = Math.abs(minutosExactos - min) <= 1e-6;
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const cuerpo = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return `${exacto ? "" : "≈ "}${signo}${cuerpo}`;
}

/**
 * Texto CANÓNICO para el input: el más legible que representa el valor sin
 * mentir.
 * - Representable en ≤4 decimales → decimal («2.5», «2.3333», «3»).
 * - Si no, pero cae en un minuto exacto → «h:mm» («2:20» para 2.33333333).
 * - Si no → decimal con los 8 decimales («2.33333389»).
 *
 * Así una cotización vieja (2.3333, el número truncado) se ve tal cual —el
 * operador puede notar que le falta precisión— y una nueva pactada en
 * minutos se ve «2:20» en vez de «2.33333333».
 */
export function horasATexto(v: number | string | null | undefined): string {
  const n = horasONull(v);
  if (n === null) return "";
  const corto = Number(n.toFixed(4));
  if (Math.abs(corto - n) <= HORAS_EPSILON) return fmtHorasDecimal(n, 4);
  const min = Math.round(n * 60);
  // `h:mm` SOLO si ese texto se vuelve a leer como el MISMO número (y cabe
  // en el formato que acepta `parseHorasPactadas`): salir del campo nunca
  // puede mover el valor, ni en el octavo decimal.
  if (min >= 1 && min < 6000 && round8(Math.floor(min / 60) + (min % 60) / 60) === n) {
    const h = Math.floor(min / 60);
    return `${h}:${String(min % 60).padStart(2, "0")}`;
  }
  return fmtHorasDecimal(n, HORAS_DECIMALES);
}

// ---------------------------------------------------------------------------
// CAPTURA
// ---------------------------------------------------------------------------

export interface HorasParse {
  /** Horas decimales a 8 decimales, o `null` = campo VACÍO (vuelve a la regla). */
  valor: number | null;
  /** ¿El texto es interpretable? (vacío incluido). */
  valido: boolean;
  /** Texto a medio escribir («2:», «2.»): ni valor ni error todavía. */
  parcial: boolean;
  /** Mensaje en es-MX cuando no es válido ni parcial. */
  error: string | null;
}

const OK = (valor: number | null): HorasParse => ({
  valor,
  valido: true,
  parcial: false,
  error: null,
});
const PARCIAL: HorasParse = { valor: null, valido: false, parcial: true, error: null };
const MAL = (error: string): HorasParse => ({
  valor: null,
  valido: false,
  parcial: false,
  error,
});

const RE_ENTERO = /^\d+$/;
/**
 * Decimal con o sin el cero delante: «0.8», «.8», «,8» y «2,5» (24-sep-2026:
 * la oficina tecleó «.8» para pactar un vuelo corto en menos de la hora
 * mínima y el campo lo rechazaba, así que parecía que no se podía pactar a
 * menos). El motor SÍ acepta un pactado menor a 1 hr: el override manda
 * sobre la hora mínima.
 */
const RE_DECIMAL = /^\d*[.,]\d+$/;
/** A medio escribir: «2.», «0,» y también el «.» o «,» sueltos del inicio. */
const RE_DECIMAL_PARCIAL = /^\d*[.,]$/;
/**
 * `h:mm`. Los minutos se leen SIEMPRE literales, tengan uno o dos dígitos:
 * «2:5» son 2 h **5** min (2.08333333), no 2:50. Es la lectura de un reloj y
 * la única que no adivina; quien quiera 2:50 escribe «2:50». No queda en la
 * sombra: la línea viva bajo el campo dice «= 2 h 5 min · 2.0833 hr × $600.00
 * = $1,250.00» antes de guardar nada. Un «:30» suelto (sin las horas) NO se
 * acepta a propósito —podría ser 30 min o media hora mal tecleada— y cae en
 * el error que enseña los dos formatos válidos.
 */
const RE_HMM = /^(\d{1,2}):(\d{1,2})$/;
const RE_HMM_PARCIAL = /^\d{1,2}:$/;
const RE_H_MIN = /^(\d{1,2})\s*h(?:r|rs|s|oras?)?\.?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutos?)?\.?)?$/i;
const RE_MIN = /^(\d{1,4})\s*(?:m|min|mins|minutos?)\.?$/i;

/**
 * «2.3333» | «2,5» | «2:20» | «2 h 20 min» | «45 min» → horas decimales a 8
 * decimales. Vacío → `null` (el motor vuelve a la regla). PURA: no toca el
 * DOM ni avisa; quien llama decide qué hacer con `error`/`parcial`.
 *
 * `maximo` (default 48 hr) protege del dedo pegado: «220» en vez de «2:20».
 */
export function parseHorasPactadas(
  texto: string | null | undefined,
  opciones?: { maximo?: number },
): HorasParse {
  const maximo = opciones?.maximo ?? HORAS_MAXIMO;
  const t = (texto ?? "").trim();
  if (t === "") return OK(null);
  if (t.startsWith("-")) return MAL("Las horas no pueden ser negativas.");

  const listo = (v: number): HorasParse => {
    const h = round8(v);
    if (!Number.isFinite(h)) return MAL("Escribe horas decimales (2.5) o h:mm (2:20).");
    if (h > maximo) return MAL(`El máximo son ${maximo} hr. ¿Quisiste escribir h:mm?`);
    return OK(h > 0 ? h : null);
  };

  if (RE_ENTERO.test(t)) return listo(Number(t));
  if (RE_DECIMAL.test(t)) return listo(Number(t.replace(",", ".")));
  if (RE_DECIMAL_PARCIAL.test(t)) return PARCIAL;
  if (RE_HMM_PARCIAL.test(t)) return PARCIAL;

  const hmm = RE_HMM.exec(t);
  if (hmm) {
    const min = Number(hmm[2]);
    if (min > 59) return MAL("Los minutos van de 00 a 59 (p. ej. 2:20).");
    return listo(Number(hmm[1]) + min / 60);
  }

  const hm = RE_H_MIN.exec(t);
  if (hm) {
    const min = hm[2] === undefined ? 0 : Number(hm[2]);
    if (min > 59) return MAL("Los minutos van de 00 a 59 (p. ej. 2 h 20 min).");
    return listo(Number(hm[1]) + min / 60);
  }

  const solo = RE_MIN.exec(t);
  if (solo) return listo(Number(solo[1]) / 60);

  return MAL("Escribe horas decimales (2.5) o h:mm (2:20).");
}

// ---------------------------------------------------------------------------
// PERSISTIDO
// ---------------------------------------------------------------------------

/** Cuántos decimales tiene el número ya redondeado a 8. */
function decimalesDe(n: number): number {
  const txt = fmtHorasDecimal(n, HORAS_DECIMALES);
  const i = txt.indexOf(".");
  return i < 0 ? 0 : txt.length - i - 1;
}

/**
 * Horas pactadas que deben REHIDRATARSE en el cotizador cuando el mismo
 * número llega por dos caminos: el snapshot del cálculo
 * (`calculo_snapshot.tiempos.cobrable_hr`) y la columna del vuelo
 * (`tiempo_cobrable_hr`).
 *
 * - Si difieren de verdad (> 4.º decimal) manda el SNAPSHOT: es la foto del
 *   cálculo con el que se compuso el dinero impreso.
 * - Si son el mismo número con distinta precisión (2.3333 vs 2.33333333,
 *   snapshot viejo + columna nueva o al revés) manda el que conserva MÁS
 *   decimales: multiplicar con el truncado es justo el bug de #322.
 */
export function preferirHorasPersistidas(
  snapshot: number | string | null | undefined,
  columna: number | string | null | undefined,
): number | null {
  const s = horasONull(snapshot);
  const c = horasONull(columna);
  if (s === null) return c;
  if (c === null) return s;
  if (Math.abs(s - c) > HORAS_EPSILON_4) return s;
  return decimalesDe(c) > decimalesDe(s) ? c : s;
}

/**
 * Par de textos para contar un cambio de horas SIN que se lea «2.3333→2.3333»
 * (diff de versiones): se escala la precisión (2 → 4 → 8 decimales) hasta que
 * los dos textos se distingan. Un cambio real de dinero siempre se ve.
 */
export function textoCambioHoras(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): [string, string] {
  const x = horasONull(a);
  const y = horasONull(b);
  const txt = (v: number | null, dec: number) => (v === null ? "—" : fmtHorasDecimal(v, dec));
  for (const dec of [2, 4, HORAS_DECIMALES]) {
    const ta = txt(x, dec);
    const tb = txt(y, dec);
    if (ta !== tb) return [ta, tb];
  }
  return [txt(x, HORAS_DECIMALES), txt(y, HORAS_DECIMALES)];
}
