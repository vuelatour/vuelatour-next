import type { ExtraConcepto } from "@/types/quote";

/**
 * Helpers PUROS de los conceptos extra (4-sep-2026, cantidad × unitario y
 * líneas de GRUPO). Sin React, sin red y SIN dinero calculado que se
 * persista: el monto de un renglón con unitario lo deriva el MOTOR
 * (round2(cantidad × unitario)); aquí solo se decide qué modo tiene el
 * renglón, si está bloqueado y qué texto se pinta. `montoReferencia` es
 * una referencia visual para el input deshabilitado — nunca viaja al API
 * ni entra a un total.
 */

/** Renglón materializado desde la cotización de GRUPO: se edita solo allá. */
export function esExtraDeGrupo(e: Pick<ExtraConcepto, "origen">): boolean {
  return e.origen === "GRUPO";
}

/** Renglón en modo cantidad × unitario (el motor deriva el monto). */
export function extraUsaUnitario(
  e: Pick<ExtraConcepto, "unitario" | "cantidad" | "por_persona">,
): boolean {
  return e.unitario != null && (e.cantidad != null || e.por_persona === true);
}

/**
 * Cantidad que aplicará el motor: con `por_persona` en una cotización de
 * un avión son los pasajeros del vuelo; si no, la capturada.
 */
export function cantidadEfectiva(
  e: Pick<ExtraConcepto, "cantidad" | "por_persona">,
  pasajeros: number | null | undefined,
): number | null {
  if (e.por_persona === true) return pasajeros != null && pasajeros > 0 ? pasajeros : null;
  return e.cantidad != null ? Number(e.cantidad) : null;
}

/**
 * Monto NATIVO "vivo" del renglón para reglas de captura (¿tiene algo que
 * cobrar?, ¿es MXN sin TC?): el unitario en modo cantidad × unitario, el
 * monto tecleado en modo monto. No es un total.
 */
export function montoExtraActivo(e: ExtraConcepto): number {
  return extraUsaUnitario(e) ? Number(e.unitario) || 0 : Number(e.monto_usd) || 0;
}

/**
 * Referencia visual del monto derivado (cantidad × unitario, 2 decimales)
 * para el input deshabilitado del editor. El valor que cuenta es el que
 * devuelve el motor en el breakdown.
 */
export function montoReferencia(
  e: ExtraConcepto,
  pasajeros: number | null | undefined,
): number | null {
  if (!extraUsaUnitario(e)) return null;
  const c = cantidadEfectiva(e, pasajeros);
  if (c == null) return null;
  return Math.round(c * (Number(e.unitario) || 0) * 100) / 100;
}

/**
 * Normaliza extras PERSISTIDOS para el editor: monto NATIVO (un renglón MXN
 * persistido trae el canon USD en monto_usd y los pesos en monto_nativo),
 * moneda explícita, IVA default y los campos de cantidad × unitario / grupo
 * tal cual vienen (sin inventar ninguno).
 */
export function normalizarExtrasEditor(
  list: ExtraConcepto[] | null | undefined,
): ExtraConcepto[] {
  return (list ?? []).map((e) => ({
    concepto: e.concepto,
    monto_usd: Number(e.monto_nativo ?? e.monto_usd) || 0,
    moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
    aplica_iva: e.aplica_iva ?? true,
    ...(e.cantidad != null ? { cantidad: Number(e.cantidad) } : {}),
    ...(e.unitario != null ? { unitario: Number(e.unitario) } : {}),
    ...(e.por_persona != null ? { por_persona: e.por_persona === true } : {}),
    ...(e.origen ? { origen: e.origen } : {}),
    ...(e.grupo_extra_id ? { grupo_extra_id: e.grupo_extra_id } : {}),
  }));
}

/**
 * Renglones que SÍ viajan al API: con concepto y algo que cobrar (monto o
 * unitario > 0). Un renglón MXN sin TC se retiene (el motor lo rechazaría
 * con 400 y tiraría el preview). Las líneas de GRUPO viajan tal cual (el
 * API las ancla de todos modos). Nunca se recalcula el monto derivado.
 */
export function extrasAPayload(
  list: ExtraConcepto[] | null | undefined,
  opts: { tcCapturado: boolean },
): ExtraConcepto[] {
  return (list ?? [])
    .filter(
      (e) =>
        e.concepto.trim() &&
        montoExtraActivo(e) > 0 &&
        (e.moneda !== "MXN" || opts.tcCapturado),
    )
    .map((e) => {
      const usaUnitario = extraUsaUnitario(e);
      return {
        concepto: e.concepto.trim(),
        // Monto NATIVO en la moneda del renglón (nombre legado monto_usd). Con
        // unitario el motor lo ignora y lo deriva.
        monto_usd: Number(e.monto_usd) || 0,
        moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
        aplica_iva: e.aplica_iva ?? true,
        ...(usaUnitario
          ? {
              unitario: Number(e.unitario),
              ...(e.por_persona === true
                ? { por_persona: true }
                : { cantidad: Number(e.cantidad) }),
            }
          : {}),
        ...(e.origen ? { origen: e.origen } : {}),
        ...(e.grupo_extra_id ? { grupo_extra_id: e.grupo_extra_id } : {}),
      };
    });
}

/**
 * Monto UNITARIO para leyendas de operación, siempre con 2 decimales:
 * "$85.00" / "$1,750.00" (USD) o "$330.60 MXN". Fuente única del texto
 * «cantidad × unitario» de extras, TUAS y consolidado de grupo.
 */
export function fmtMontoUnitario(
  valor: number | string | null | undefined,
  moneda: "USD" | "MXN" | null | undefined,
): string {
  const n = Number(valor) || 0;
  return moneda === "MXN"
    ? `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "44 × $85.00" / "9 × $1,200.00 MXN" para leyendas (sin total). */
export function textoCantidadUnitario(
  e: Pick<ExtraConcepto, "cantidad" | "unitario" | "moneda" | "por_persona">,
  pasajeros?: number | null,
): string | null {
  if (e.unitario == null) return null;
  const c = cantidadEfectiva(e, pasajeros);
  const monto = fmtMontoUnitario(e.unitario, e.moneda);
  const cant = c != null ? String(c) : e.por_persona ? "por persona" : "?";
  return `${cant} × ${monto}`;
}
