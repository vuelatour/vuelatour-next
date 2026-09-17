const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dec = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function fmtUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return usd.format(n);
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
