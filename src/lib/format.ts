// DINERO NUNCA CON 1 DECIMAL (24-sep-2026, captura de Itzi: la card de
// cobros decía «Cobrado $8,050.4» y «$136,856.8 MXN»). Regla ÚNICA del panel
// y del API (`common/dinero-texto.util.ts`): se redondea a centavos; si queda
// entero va SIN decimales («$1,200»), si tiene centavos va con EXACTAMENTE 2
// («$8,050.40»). Dos formateadores fijos en vez de `min 0 / max 2`, que era
// justo lo que producía el «.4».
const usdEntero = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const usdCentavos = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dec = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Monto con signo de pesos/dólares: «$1,200» (entero) o «$8,050.40» (con
 * centavos) — jamás «$8,050.4». Redondeo simétrico a centavos (−2.345 ⇒
 * −$2.35, igual que 2.345 ⇒ $2.35) y `-0` (p. ej. −0.001) se pinta «$0».
 * La moneda NO va aquí: úsalo con `fmtMonto(valor, moneda)` cuando el monto
 * puede ser MXN o USD.
 */
export function fmtUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const centavos = Math.sign(n) * Math.round(Math.abs(n) * 100);
  if (centavos === 0) return usdEntero.format(0);
  const redondeado = centavos / 100;
  return centavos % 100 === 0 ? usdEntero.format(redondeado) : usdCentavos.format(redondeado);
}

/**
 * Monto CON su moneda: «$136,856.80 MXN», «$8,050.40 USD», «$1,200 USD».
 * Misma regla de decimales que `fmtUsd`. Sin valor ⇒ «—»; sin moneda ⇒ solo
 * el monto. Es lo que pintan las cards de cobros y el registro de facturas
 * (antes cada card hacía su propio `toLocaleString("en-US")`).
 */
export function fmtMonto(
  value: string | number | null | undefined,
  moneda?: string | null,
): string {
  const txt = fmtUsd(value);
  if (txt === "—") return txt;
  const m = typeof moneda === "string" ? moneda.trim() : "";
  return m ? `${txt} ${m}` : txt;
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Monto en pesos con etiqueta explícita ("$1,322.40 MXN") para no confundirlo con USD. */
export function fmtMxn(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `${mxn.format(n)} MXN`;
}

export function fmtDecimal(
  value: string | number | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

export function fmtPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `${dec.format(n)}%`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-MX").format(value);
}

// ---------------------------------------------------------------------------
// TIPO DE CAMBIO (17-sep-2026)
// ---------------------------------------------------------------------------
/**
 * Decimales canónicos de un T.C. USD→MXN en todo el sistema: los mismos que
 * persiste el API (`numeric(12,6)`, `common/tc.util.ts`) y los mismos que
 * imprime pyservices (`app/services/_formato.py::TC_DECIMALES`).
 */
export const TC_DECIMALES = 6;

/**
 * T.C. USD→MXN como texto: hasta `TC_DECIMALES` decimales y SIN ceros de cola.
 *
 * Por qué existe (pedido del cliente sobre la cotización #314): el operador
 * captura el T.C. con los decimales que hacen cuadrar los pesos
 * (5,885.25 USD × 16.991632 = $100,000.00 MXN), pero la hoja lo pintaba con
 * `numeroG` — el `:g` de Python, seis CIFRAS SIGNIFICATIVAS, o sea «16.9916».
 * Quien volvía a multiplicar con ese texto obtenía $99,999.81 y el documento
 * dejaba de cuadrar consigo mismo: «ese cambio cuando hace la conversión a
 * pesos, no sé por qué cuando son muchos decimales como que siempre cambia a
 * como está en la cotización».
 *
 * Es la traducción LITERAL de `_tc_txt` de pyservices (paridad manual entre
 * repos, congelada en `src/lib/__tests__/format.test.ts` con la misma tabla
 * que el test de allá) para que la hoja del panel y el PDF digan carácter por
 * carácter lo mismo. `null`/vacío/NaN → cadena VACÍA, igual que allá: quien
 * llama decide si pinta «—» o se salta la línea (ningún documento inventa un
 * T.C. que no llegó).
 *
 * Aquí NO se redondea dinero: el total en pesos se LEE de `monto_total_mxn`,
 * jamás se recalcula con este texto.
 */
export function fmtTc(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "";
  const txt = n.toFixed(TC_DECIMALES);
  return txt.includes(".") ? txt.replace(/0+$/, "").replace(/\.$/, "") : txt;
}
