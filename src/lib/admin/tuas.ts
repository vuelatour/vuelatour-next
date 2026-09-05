import type { TuaLinea } from "@/types/quote";

/**
 * Helpers PUROS de las TUAS capturadas por aeropuerto (`tuas_lineas`),
 * compartidos por el cotizador de un avión y la cotización de GRUPO (la
 * captura es la MISMA línea `TuaLinea` en los dos). Sin React, sin red y
 * sin dinero calculado: aquí solo se decide qué líneas viajan al motor.
 */

/**
 * Líneas que SÍ viajan al API. Monto 0 CAPTURADO = pass-through cero (el
 * aeropuerto no cobra): viaja al motor, que lo trata como TUA $0 — no es
 * "volver al catálogo" (eso es no mandar la línea). Una línea MXN > 0 sin
 * TC no puede convertirse (el motor la rechaza con 400 y tiraría el
 * preview): se retiene fuera del cálculo — la UI lo avisa en ámbar y
 * guardar se bloquea. El DTO rechaza 3+ decimales: se redondea a centavos;
 * $0 viaja como USD para que el motor no exija TC por una línea que de
 * todos modos vale cero.
 */
export function tuasLineasAPayload(
  lineas: TuaLinea[] | null | undefined,
  opts: { tcCapturado: boolean },
): TuaLinea[] {
  return (lineas ?? [])
    .filter(
      (l) =>
        l.iata &&
        Number(l.monto_pax) >= 0 &&
        (Number(l.monto_pax) === 0 || l.moneda !== "MXN" || opts.tcCapturado),
    )
    .map((l) => {
      const monto = Math.round(Number(l.monto_pax) * 100) / 100;
      return {
        iata: l.iata.toUpperCase(),
        monto_pax: monto,
        moneda: monto > 0 && l.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
      };
    });
}

/** Líneas MXN > 0 que se quedarían FUERA del cálculo por falta de TC. */
export function tuasMxnSinTc(
  lineas: TuaLinea[] | null | undefined,
  tcCapturado: boolean,
): TuaLinea[] {
  if (tcCapturado) return [];
  return (lineas ?? []).filter((l) => l.moneda === "MXN" && Number(l.monto_pax) > 0);
}

/** Upsert PURO de una línea por aeropuerto; monto null = quitar la línea
 *  (vuelve al monto del catálogo). Misma regla en cotizador y grupo. */
export function upsertTuaLinea(
  lineas: TuaLinea[] | null | undefined,
  iata: string,
  monto: number | null,
  moneda: "USD" | "MXN",
): TuaLinea[] {
  const rest = (lineas ?? []).filter((l) => l.iata !== iata);
  return monto == null ? rest : [...rest, { iata, monto_pax: monto, moneda }];
}
