import { numeroDe, textoFaltanteGasto } from "@/lib/admin/conciliacion-parcial";
import { MEDIOS_BANCARIOS_CONCILIACION } from "@/lib/admin/conciliacion-no-bancario";

/**
 * ESTADO DE CONCILIACIÓN CON EL BANCO de un gasto (9-oct-2026; pedido de
 * oficina: «un apartado donde me diga si el gasto está conciliado con el
 * banco»). Módulo PURO (fuente única de la columna «Banco» de Gastos y del
 * filtro «Banco»); espejo de `estado-banco.util.ts` del API, que pinta la
 * misma columna en el Excel.
 *
 *  - CONCILIADO: `gasto.conciliado` true — solo lo escribe la BD cuando los
 *    cargos ligados CUBREN el gasto (también un efectivo ligado con
 *    justificación, 6-oct-2026).
 *  - PARCIAL: hay cargos ligados (`monto_vinculado` > 0, aditivo del API) y
 *    el gasto NO está conciliado — ESPEJO EXACTO de `estado-banco.util.ts`
 *    del API desde el 13-oct-2026 (antes un desfasado con lo ligado ≥ monto −
 *    1 caía aquí en «Sin conciliar» mientras el Excel decía «Parcial»).
 *  - SIN_CONCILIAR: medio bancario (tarjeta corporativa, transferencia,
 *    Paywise, pago domiciliado — `MEDIOS_BANCARIOS_CONCILIACION`) sin cargo
 *    ligado — lo que la oficina persigue.
 *  - NO_APLICA: efectivo / personal / bodega sin cargo: no se concilia.
 */
export type EstadoBanco = "CONCILIADO" | "PARCIAL" | "SIN_CONCILIAR" | "NO_APLICA";

export interface EstadoBancoInfo {
  value: EstadoBanco;
  /** Texto del badge; «—» cuando no aplica. */
  label: string;
  /** Clases del badge (variante outline). */
  cls: string;
  /** Tooltip: qué significa y, en parcial, cuánto falta. */
  title: string;
}

/**
 * Lo que el estado necesita de un gasto: sirve igual para un `Gasto` de la
 * lista que para un `CompraPago` (monto como número) o la fila de la hoja de
 * la conciliación al revés (13-oct-2026).
 */
export type GastoParaBanco = {
  conciliado?: boolean;
  medio_pago?: string | null;
  monto: string | number;
  moneda?: string | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
};

export function estadoBancoGasto(g: GastoParaBanco): EstadoBancoInfo {
  if (g.conciliado === true) {
    return {
      value: "CONCILIADO",
      label: "Conciliado",
      cls: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
      title: "Cubierto por cargo(s) del estado de cuenta del banco",
    };
  }
  // ESPEJO del API: algo ligado y sin conciliar ⇒ PARCIAL (aunque lo ligado
  // ya alcance el monto: ese desfase lo explica la hoja con su alerta).
  if (numeroDe(g.monto_vinculado) > 0) {
    const faltan = textoFaltanteGasto(g);
    return {
      value: "PARCIAL",
      label: "Parcial",
      cls: "border-amber-500/50 text-amber-600 dark:text-amber-400",
      title: faltan
        ? `Cargos del banco ligados que no cubren el gasto: ${faltan}`
        : "Cargos del banco ligados que no cubren el gasto",
    };
  }
  if (MEDIOS_BANCARIOS_CONCILIACION.includes(g.medio_pago ?? "")) {
    return {
      value: "SIN_CONCILIAR",
      label: "Sin conciliar",
      cls: "border-rose-500/50 text-rose-600 dark:text-rose-400",
      title:
        "Pago bancario sin cargo ligado: se cruza al importar el estado de cuenta (Conciliación) o a mano desde el cargo",
    };
  }
  return {
    value: "NO_APLICA",
    label: "—",
    cls: "border-transparent text-muted-foreground",
    title: "Pago que no se concilia con el banco (efectivo, personal o bodega)",
  };
}

/** Valores del filtro «Banco» del listado (querystring `banco`). */
export const FILTRO_BANCO = [
  { value: "conciliados", label: "Conciliados" },
  { value: "sin_conciliar", label: "Sin conciliar" },
] as const;

/** `?banco=` → parámetro `conciliado` del API (undefined = sin filtro). */
export function conciliadoDeFiltroBanco(banco: string | undefined): boolean | undefined {
  if (banco === "conciliados") return true;
  if (banco === "sin_conciliar") return false;
  return undefined;
}

/**
 * ¿El badge abre la «conciliación al revés» (13-oct-2026)? Con todo estado
 * que se concilia; «—» (NO_APLICA) nunca es botón.
 */
export function abreDetalleBanco(v: EstadoBanco): boolean {
  return v === "CONCILIADO" || v === "PARCIAL" || v === "SIN_CONCILIAR";
}

/** Tooltip del badge cuando es botón: el de siempre + qué hace el clic. */
export function tituloBancoConClic(e: EstadoBancoInfo): string {
  return e.value === "SIN_CONCILIAR"
    ? `${e.title}. Clic para ver por qué y buscar el cargo.`
    : `${e.title}. Clic para ver el cargo del banco y su estado de cuenta.`;
}
