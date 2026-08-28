import { fmtDateOnly } from "@/lib/datetime";
import type { VueloCercano } from "@/app/admin/expenses/actions";

/**
 * Etiqueta ÚNICA de un vuelo en los selectores de gasto (alta y verificar):
 * folio · matrícula · ruta · fecha, con "· CANCELADO" al final cuando aplica
 * (regla 28-ago: los cancelados sí se listan porque pueden tener gastos).
 */
export function vueloCercanoLabel(v: VueloCercano): string {
  return (
    `#${v.folio ?? "?"} · ${v.matricula ?? "sin avión"} · ${v.ruta ?? ""}` +
    (v.fecha ? ` · ${fmtDateOnly(v.fecha)}` : "") +
    (v.estado === "CANCELADO" ? " · CANCELADO" : "")
  );
}

/** true si el vuelo elegido (por id) está CANCELADO según la lista cargada. */
export function esVueloCancelado(vuelos: VueloCercano[], id: string): boolean {
  return !!id && vuelos.find((v) => v.id === id)?.estado === "CANCELADO";
}

/**
 * Aviso corto bajo el vuelo ligado cuando está CANCELADO: el gasto no se
 * pierde — cuenta igual en el balance del avión (se voló a recoger, cancelaron,
 * regresó ferry…).
 */
export function VueloCanceladoHint({ className }: { className?: string }) {
  // <span block> y no <p>: también se pinta dentro de DialogDescription (<p>),
  // donde un <p> anidado es HTML inválido.
  return (
    <span
      className={`block text-xs text-amber-600 dark:text-amber-400 ${className ?? ""}`}
    >
      Vuelo cancelado: el gasto cuenta igual en el balance.
    </span>
  );
}
