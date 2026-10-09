import { estadoParcialDeGasto, textoFaltanteGasto } from "@/lib/admin/conciliacion-parcial";
import { MEDIOS_BANCARIOS_CONCILIACION } from "@/lib/admin/conciliacion-no-bancario";
import type { Gasto } from "@/types/expenses";

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
 *  - PARCIAL: hay cargos ligados que no cubren (aditivos `monto_vinculado` /
 *    `faltante` del API, vía `estadoParcialDeGasto`).
 *  - SIN_CONCILIAR: medio bancario (tarjeta corporativa, transferencia,
 *    Paywise) sin cargo ligado — lo que la oficina persigue.
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

export function estadoBancoGasto(
  g: Pick<Gasto, "conciliado" | "medio_pago" | "monto"> &
    Partial<Pick<Gasto, "monto_vinculado" | "faltante" | "moneda">>,
): EstadoBancoInfo {
  if (g.conciliado === true) {
    return {
      value: "CONCILIADO",
      label: "Conciliado",
      cls: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
      title: "Cubierto por cargo(s) del estado de cuenta del banco",
    };
  }
  const parcial = estadoParcialDeGasto(g);
  if (parcial?.parcial) {
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
