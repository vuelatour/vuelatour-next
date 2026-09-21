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

// ---------------------------------------------------------------------------
// ¿Este renglón entra al total? (21-sep-2026)
// ---------------------------------------------------------------------------

/**
 * Estado de captura de un renglón de extras. FUENTE ÚNICA: con esto se decide
 * qué viaja al motor (`extrasAPayload`), qué leyenda pinta la hoja y qué
 * bloquea el guardado — si el filtro y el aviso vivieran en sitios distintos
 * volverían a divergir, que es justo el bug del 21-sep-2026 (la hoja pintaba
 * «$35.00» en la columna de importes, el total no lo sumaba y al guardar el
 * renglón se descartaba en silencio).
 *
 * - `ok`: entra al total y se imprime.
 * - `vacio`: sin nombre Y sin monto — renglón recién agregado; NO molesta.
 * - `sin_nombre`: hay monto capturado pero falta el concepto (el API exige
 *   `concepto` de 1–120 caracteres).
 * - `sin_monto`: hay concepto pero no hay nada que cobrar (monto/unitario 0).
 * - `mxn_sin_tc`: renglón en pesos sin T.C.; el motor lo rechazaría con 400 y
 *   tiraría el preview, así que se retiene fuera del cálculo.
 */
export type EstadoExtra = "ok" | "vacio" | "sin_nombre" | "sin_monto" | "mxn_sin_tc";

/** Estados en los que el renglón tiene ALGO capturado y aun así no cuenta. */
export type MotivoExtraFuera = Exclude<EstadoExtra, "ok" | "vacio">;

/**
 * Textos ÚNICOS de los renglones que no entran al total (es-MX). El de
 * `mxn_sin_tc` es el que ya usaba la hoja: se reutiliza, no se duplica.
 */
export const TEXTO_EXTRA_FUERA: Record<MotivoExtraFuera, string> = {
  sin_nombre: "Falta el nombre: no se suma ni se imprime",
  sin_monto: "Falta el monto: no se suma ni se imprime",
  mxn_sin_tc: "Captura el T.C. en «Total MXN»: sin él el renglón no entra al total",
};

export function estadoExtra(
  e: ExtraConcepto,
  opts: { tcCapturado: boolean },
): EstadoExtra {
  const conNombre = (e.concepto ?? "").trim() !== "";
  const conMonto = montoExtraActivo(e) > 0;
  if (!conNombre && !conMonto) return "vacio";
  if (!conNombre) return "sin_nombre";
  if (!conMonto) return "sin_monto";
  if (e.moneda === "MXN" && !opts.tcCapturado) return "mxn_sin_tc";
  return "ok";
}

/** Campo que falta capturar para que el renglón cuente. */
export type CampoFaltanteExtra = "concepto" | "monto" | "unitario" | "tc";

/** Renglón con dinero o nombre capturado que NO entra al total, y por qué. */
export interface ExtraFueraDelTotal {
  /** Índice en la lista del form (el mismo del renglón en la hoja). */
  indice: number;
  estado: MotivoExtraFuera;
  /** Texto en es-MX de `TEXTO_EXTRA_FUERA`. */
  motivo: string;
  /** Concepto ya recortado ("" cuando es justo lo que falta). */
  concepto: string;
  /** Monto NATIVO vivo del renglón (0 cuando lo que falta es el monto). */
  monto: number;
  moneda: "USD" | "MXN";
  campo: CampoFaltanteExtra;
  /** Línea materializada del GRUPO: aquí está bloqueada, se corrige allá. */
  deGrupo: boolean;
}

function campoFaltante(e: ExtraConcepto, estado: MotivoExtraFuera): CampoFaltanteExtra {
  if (estado === "sin_nombre") return "concepto";
  if (estado === "mxn_sin_tc") return "tc";
  return extraUsaUnitario(e) ? "unitario" : "monto";
}

/**
 * Renglones que el operador ya empezó a capturar y que el total NO incluye
 * (ni el PDF imprime). Los `vacio` quedan fuera a propósito: un renglón recién
 * agregado no es un error. Es el complemento exacto de `extrasAPayload`.
 */
export function extrasFueraDelTotal(
  list: ExtraConcepto[] | null | undefined,
  opts: { tcCapturado: boolean },
): ExtraFueraDelTotal[] {
  const out: ExtraFueraDelTotal[] = [];
  (list ?? []).forEach((e, indice) => {
    const estado = estadoExtra(e, opts);
    if (estado === "ok" || estado === "vacio") return;
    out.push({
      indice,
      estado,
      motivo: TEXTO_EXTRA_FUERA[estado],
      concepto: (e.concepto ?? "").trim(),
      monto: montoExtraActivo(e),
      moneda: e.moneda === "MXN" ? "MXN" : "USD",
      campo: campoFaltante(e, estado),
      deGrupo: esExtraDeGrupo(e),
    });
  });
  return out;
}

/**
 * `aria-label` del control de la HOJA que hay que corregir (null = el campo
 * del T.C., que tiene id propio `tc-usd-mxn-field`). El precio unitario se
 * edita en el detalle «⋯», así que ahí el foco va al concepto: deja la fila
 * —y su leyenda— a la vista.
 */
export function ariaLabelCampoExtra(f: Pick<ExtraFueraDelTotal, "campo" | "indice" | "moneda">): string | null {
  const n = f.indice + 1;
  if (f.campo === "tc") return null;
  if (f.campo === "monto") {
    return f.moneda === "MXN" ? `Monto en pesos del extra ${n}` : `Monto del extra ${n} (USD)`;
  }
  return `Concepto del extra ${n}`;
}

/** Suma por moneda, escrita («$35.00», «$500.00 MXN», «$35.00 + $500.00 MXN»). */
function montosFuera(fuera: ExtraFueraDelTotal[]): string {
  const usd = fuera.filter((f) => f.moneda === "USD").reduce((a, f) => a + f.monto, 0);
  const mxn = fuera.filter((f) => f.moneda === "MXN").reduce((a, f) => a + f.monto, 0);
  const partes: string[] = [];
  if (usd > 0) partes.push(fmtMontoUnitario(Math.round(usd * 100) / 100, "USD"));
  if (mxn > 0) partes.push(fmtMontoUnitario(Math.round(mxn * 100) / 100, "MXN"));
  return partes.join(" + ");
}

/**
 * Decisión PURA del candado de guardado: ningún renglón con dinero o nombre
 * capturado puede perderse en silencio. La usan TODOS los caminos que
 * persisten extras (alta, guardar versión, «Guardar y ver PDF», Ctrl+S).
 */
export interface BloqueoExtras {
  bloquear: boolean;
  /** Mensaje en es-MX ("" si no bloquea). */
  mensaje: string;
  /** Primer renglón a corregir (para el foco/scroll). */
  primero: ExtraFueraDelTotal | null;
  /** Renglones que FRENAN (los de GRUPO no, ver abajo). */
  fuera: ExtraFueraDelTotal[];
}

export function bloqueoGuardadoExtras(
  list: ExtraConcepto[] | null | undefined,
  opts: { tcCapturado: boolean },
): BloqueoExtras {
  // Las líneas de GRUPO están bloqueadas en esta pantalla (se editan en el
  // grupo): frenar por ellas dejaría la cotización imposible de guardar. La
  // hoja SÍ las marca — el aviso es cierto, el candado sería una trampa. Un
  // renglón de grupo en pesos sin T.C. sigue frenando por `mxnSinTc`, que es
  // lo que de verdad se corrige aquí.
  const fuera = extrasFueraDelTotal(list, opts).filter((f) => !f.deGrupo);
  if (fuera.length === 0) return { bloquear: false, mensaje: "", primero: null, fuera };
  const n = fuera.length;
  const montos = montosFuera(fuera);
  const cabeza =
    n === 1
      ? `Hay 1 concepto que no entra al total${montos ? ` (${montos})` : ""}`
      : `Hay ${n} conceptos que no entran al total${montos ? ` (${montos})` : ""}`;
  const estados = new Set(fuera.map((f) => f.estado));
  const unico = estados.size === 1 ? [...estados][0] : null;
  const arregla =
    unico === "sin_nombre"
      ? n === 1
        ? "ponle nombre o quítalo"
        : "ponles nombre o quítalos"
      : unico === "sin_monto"
        ? n === 1
          ? "ponle monto o quítalo"
          : "ponles monto o quítalos"
        : unico === "mxn_sin_tc"
          ? n === 1
            ? "captura el T.C. en «Total MXN» o quítalo"
            : "captura el T.C. en «Total MXN» o quítalos"
          : n === 1
            ? "ponle nombre y monto o quítalo"
            : "ponles nombre y monto o quítalos";
  return { bloquear: true, mensaje: `${cabeza}: ${arregla}.`, primero: fuera[0], fuera };
}

/**
 * Renglones que SÍ viajan al API: los que `estadoExtra` da por `ok` (con
 * concepto y algo que cobrar; un renglón MXN sin TC se retiene porque el motor
 * lo rechazaría con 400 y tiraría el preview). Las líneas de GRUPO viajan tal
 * cual (el API las ancla de todos modos). Nunca se recalcula el monto
 * derivado. MISMA regla que el aviso de la hoja: un solo `estadoExtra`.
 */
export function extrasAPayload(
  list: ExtraConcepto[] | null | undefined,
  opts: { tcCapturado: boolean },
): ExtraConcepto[] {
  return (list ?? [])
    .filter((e) => estadoExtra(e, opts) === "ok")
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
