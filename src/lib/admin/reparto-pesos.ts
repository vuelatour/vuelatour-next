/**
 * REPARTO EN PESOS (18-oct-2026, API 0.0.93) — FUENTE ÚNICA PURA (sin React
 * ni red) de la pantalla `/admin/profit-sharing` cuando el API manda la
 * bandera raíz `reparto_en_pesos: true`.
 *
 * Pedido del cliente: «…debe venir todo en pesos porque casi siempre se les
 * transfiere a los socios en pesos mexicanos, y que los dólares solo sean
 * informativos pero no los que llamen primero la atención.»
 *
 * Reglas:
 *  - Los NÚMEROS los manda el API (llaves `*_mxn` ADITIVAS, cálculo nativo en
 *    pesos: venta al T.C. de la cotización, gastos MXN tal cual, USD a su
 *    T.C.). El panel NO convierte ni recalcula: formatea y, a lo más, suma en
 *    CENTAVOS lo que ya viene para el total de la flota (como hoy suma los
 *    dólares en `kpi-strip.tsx`).
 *  - Con la bandera: pesos = la cifra principal; dólares = dato informativo
 *    («≈ $X USD», gris y más chico). Un monto cuyo peso no llegó (sin T.C.)
 *    se pinta en dólares CON su sufijo y lo dice: jamás se inventa un peso.
 *  - Sin la bandera (API ≤ 0.0.92) todo es exactamente lo de siempre
 *    (`montoPrincipal` devuelve `fmtUsd` sin informativo y los componentes
 *    conservan su marcado byte a byte; lo congela el golden de
 *    `components/admin/profit-sharing/__tests__/reparto-pesos.test.tsx`).
 *  - La cuenta corriente de socios («Pagos a socios», «Socios · por
 *    entregar») sigue en dólares por decisión del usuario: aquí no se toca.
 *
 * Ningún componente redacta estos textos a mano. Prueba:
 * `lib/admin/__tests__/reparto-pesos.test.ts`.
 */

import { fmtMonto, fmtMxn, fmtTc, fmtUsd } from "@/lib/format";
import type {
  AvionReparto,
  DetalleOtroIngresoAvion,
} from "@/types/profit-sharing";

// =============================================================================
// Bandera
// =============================================================================

/** ¿El reparto viene en pesos? Solo `true` estricto (API 0.0.93+). */
export function repartoEnPesos(
  data: { reparto_en_pesos?: boolean | null } | null | undefined,
): boolean {
  return data?.reparto_en_pesos === true;
}

// =============================================================================
// Monto principal / informativo
// =============================================================================

/** Un monto listo para pintar: la cifra principal y, debajo, el dato informativo. */
export interface MontoDoble {
  /** Lo que se ve primero: pesos con la bandera (o dólares con su sufijo si
   *  el peso no llegó); `fmtUsd` de siempre sin la bandera. */
  principal: string;
  /** El dato informativo en gris («≈ $70.12 USD»); null sin la bandera. */
  informativo: string | null;
  /** Con la bandera, el API no mandó los pesos de este monto (sin T.C.). */
  sinPesos: boolean;
  /** El número de la cifra principal (para colores: 0 tenue, negativo rojo). */
  valor: number | null;
}

/** Texto informativo cuando el peso de un monto no llegó. */
export const TEXTO_SIN_PESOS = "sin T.C. para pasarlo a pesos";

const numero = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Dólares con su sufijo SIEMPRE («$8,050.40 USD»): junto a pesos, «$» solo confunde. */
export function textoUsd(usd: number | null | undefined): string {
  return fmtMonto(usd, "USD");
}

/** «≈ $70.12 USD» (con `deduccion`, «≈ −$70.12 USD»). */
export function informativoUsd(
  usd: number | null | undefined,
  opts: { deduccion?: boolean } = {},
): string | null {
  const n = numero(usd);
  if (n === null) return null;
  return `≈ ${opts.deduccion ? "−" : ""}${textoUsd(n)}`;
}

/** « · al T.C. 17.25» (vacío sin T.C.: nunca se inventa uno). */
export function textoAlTc(tc: number | null | undefined): string {
  const t = fmtTc(tc);
  return t ? ` · al T.C. ${t}` : "";
}

/**
 * Decide la cifra principal y el dato informativo de un monto.
 *  - sin bandera ⇒ `fmtUsd(usd)` (lo de siempre), sin informativo;
 *  - con bandera y pesos ⇒ «$1,234.56 MXN» + «≈ $70.12 USD» (+ « · al T.C. X»);
 *  - con bandera y SIN pesos ⇒ «$70.12 USD» + «sin T.C. para pasarlo a pesos».
 * `deduccion` antepone «−» (las filas de la cascada que restan).
 */
export function montoPrincipal(
  montos: { mxn?: number | null; usd?: number | null },
  enPesos: boolean,
  opts: { deduccion?: boolean; tc?: number | null } = {},
): MontoDoble {
  const usd = numero(montos.usd);
  const signo = opts.deduccion ? "−" : "";
  if (!enPesos) {
    return { principal: `${signo}${fmtUsd(usd)}`, informativo: null, sinPesos: false, valor: usd };
  }
  const mxn = numero(montos.mxn);
  if (mxn === null) {
    return {
      principal: `${signo}${textoUsd(usd)}`,
      informativo: TEXTO_SIN_PESOS,
      sinPesos: true,
      valor: usd,
    };
  }
  const info = informativoUsd(usd, { deduccion: opts.deduccion });
  return {
    principal: `${signo}${fmtMxn(mxn)}`,
    informativo: info === null ? null : `${info}${textoAlTc(opts.tc)}`,
    sinPesos: false,
    valor: mxn,
  };
}

// =============================================================================
// Sumas (solo lo que ya viene; en centavos)
// =============================================================================

/**
 * Σ en CENTAVOS de montos que ya mandó el API. null si falta alguno (no se
 * suma un total a medias: quien llama cae a los dólares y lo dice).
 */
export function sumaCentavos(valores: ReadonlyArray<number | null | undefined>): number | null {
  let centavos = 0;
  for (const v of valores) {
    const n = numero(v);
    if (n === null) return null;
    centavos += Math.round(n * 100);
  }
  return centavos / 100;
}

/** Total de la flota de una llave en pesos (null si a algún avión le falta). */
export function totalFlotaMxn(
  aviones: ReadonlyArray<AvionReparto>,
  llave: (a: AvionReparto) => number | null | undefined,
): number | null {
  return sumaCentavos(aviones.map(llave));
}

/** Gastos del avión en pesos con la MISMA cascada del KPI en dólares. */
export function gastosMxnDeAvion(a: AvionReparto): number | null {
  return sumaCentavos([
    a.ingresos.comisiones_venta_mxn,
    a.gastos.directos_mxn,
    a.gastos.indirectos_mxn,
    a.gastos.permisos_mxn,
    a.gastos.otros_prorrateados_mxn,
  ]);
}

// =============================================================================
// Aviso: dólares que no se pudieron pasar a pesos
// =============================================================================

/** ¿El saldo en pesos de este avión está incompleto? */
export function pesosIncompletos(a: AvionReparto): boolean {
  return (numero(a.pesos_sin_tc_usd) ?? 0) > 0;
}

/** «$120 USD no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.» */
export function avisoPesosSinTc(usd: number): string {
  return `${textoUsd(usd)} no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.`;
}

/** Hint del KPI «Saldo disponible total» cuando algún avión está incompleto en pesos. */
export const HINT_SALDO_PESOS_INCOMPLETO =
  "Incompleto en pesos: revisa el aviso del avión";
export const TITULO_SALDO_PESOS_INCOMPLETO =
  "Algún avión tiene dólares que no se pudieron pasar a pesos (sin tipo de cambio): su card lo dice en ámbar y el total en pesos está incompleto.";

// =============================================================================
// Textos de la pantalla
// =============================================================================

/** Renglón del recuadro informativo de la página. */
export const NOTA_REPARTO_EN_PESOS =
  "Montos en pesos (MXN), que es como se transfiere a los socios; los dólares van en gris solo como referencia. «Pagos a socios» sigue en dólares.";

/** Cola del hint del KPI «Venta de aviones cobrada» en pesos; '' sin otros ingresos. */
export function hintKpiOtrosIngresosAvionesPesos(mxn: number | null): string {
  return mxn !== null && mxn > 0 ? ` · + ${fmtMxn(mxn)} otros ingresos de aviones` : "";
}

/** Hint del KPI «Otros ingresos VuelaTour» (siguen en dólares: no se reparten). */
export function hintKpiOtrosVuelatourPesos(pendienteUsd: number): string {
  return pendienteUsd > 0
    ? `TUAs/extras/pernocta/comisión · no se reparten · por cobrar ${textoUsd(pendienteUsd)}`
    : "TUAs/extras/pernocta/comisión · no se reparten";
}

/** Badge «Pendiente $51,750.00 MXN · 1 vuelo(s)» del encabezado de la card. */
export function textoBadgePendientePesos(
  montos: { mxn?: number | null; usd?: number | null },
  vuelos: number,
): string {
  return `Pendiente ${montoPrincipal(montos, true).principal} · ${vuelos} vuelo(s)`;
}

/** Tooltip del badge «Pendiente» con el dato en dólares. */
export function tituloBadgePendientePesos(usd: number): string {
  return `Parte del avión pendiente de cobro (≈ ${textoUsd(usd)}). Los vuelos se cuentan una sola vez (en el avión que reporta el vuelo).`;
}

/** «deuda total del cliente $3,400 USD» (la deuda bruta solo existe en dólares). */
export function textoDeudaTotalPesos(usd: number | null | undefined): string {
  return `deuda total del cliente ${textoUsd(usd)}`;
}

/** «· por cobrar $200 USD» de la línea de otros ingresos VuelaTour. */
export function textoPorCobrarUsd(usd: number | null | undefined): string {
  return `· por cobrar ${textoUsd(usd)}`;
}

/** Tooltip del badge «N gasto(s) sin TC» con la bandera: neutral (cierto en las dos monedas). */
export function tituloGastosSinTcPesos(mxn: number): string {
  return `${fmtMxn(mxn)} en gastos sin tipo de cambio capturado ni TC oficial de referencia para su fecha: quedaron fuera del dato en dólares (USD).`;
}

/** Tooltip del badge «Otros ingresos sin TC» con la bandera. */
export const TITULO_OTROS_INGRESOS_SIN_TC_PESOS =
  "Ingresos del avión en MXN sin tipo de cambio propio ni T.C. oficial disponible para su fecha: quedaron fuera del dato en dólares (USD).";

/** Línea ámbar de una categoría con gastos sin TC, con la bandera. */
export function textoCategoriaSinTcPesos(count: number, mxn: number): string {
  return `${count} sin TC · ${fmtMxn(mxn)} fuera del dato en USD`;
}

/** Encabezado de la columna de montos de «Gastos por categoría» con la bandera. */
export const ENCABEZADO_GASTOS_PESOS = "MXN";

/** Sub-rótulo de una columna que solo existe en dólares (venta del avión). */
export const SUB_COLUMNA_USD = "en USD";

/**
 * Tooltip de la fila «Otros ingresos del avión» en pesos: un renglón por
 * ingreso «ING-4 · concepto · $46,550.80 MXN (≈ $2,586.16 USD)». Sin
 * detalle ⇒ undefined.
 */
export function tituloOtrosIngresosAvionPesos(
  lineas?: DetalleOtroIngresoAvion[] | null,
): string | undefined {
  if (!lineas || lineas.length === 0) return undefined;
  return lineas
    .map((l) => {
      const mxn = numero(l.mxn);
      const usd = numero(l.usd);
      const monto =
        mxn !== null
          ? `${fmtMxn(mxn)}${usd !== null ? ` (≈ ${textoUsd(usd)})` : ""}`
          : usd !== null
            ? `${textoUsd(usd)} (${TEXTO_SIN_PESOS})`
            : "sin T.C.";
      return [l.clave, l.concepto?.trim() || null, monto].filter(Boolean).join(" · ");
    })
    .join("\n");
}
