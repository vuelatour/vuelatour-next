"use client";

import { createContext, useContext } from "react";
import { SIN_CAPACIDAD_POR_PAGAR, type CapacidadPorPagar } from "@/lib/admin/gasto-por-pagar";

/**
 * Gastos «por pagar» (19-oct-2026, API 0.0.95) para componentes cliente: la
 * CAPACIDAD (`config.gastos_por_pagar` y `config.gasto_fecha_max` de
 * `/v1/me`). Lo monta `AdminShell` con `capacidadPorPagarDeMe(me)`. Fuera
 * del Provider (pruebas, pantallas públicas) vale «sin capacidad» ⇒ la
 * captura, el filtro y los avisos quedan como siempre.
 */
const PorPagarContext = createContext<CapacidadPorPagar>(SIN_CAPACIDAD_POR_PAGAR);

export function PorPagarProvider({
  capacidad,
  children,
}: {
  capacidad: CapacidadPorPagar;
  children: React.ReactNode;
}) {
  return <PorPagarContext.Provider value={capacidad}>{children}</PorPagarContext.Provider>;
}

/** La capacidad de gastos por pagar del usuario (sin Provider: sin capacidad). */
export function usePorPagar(): CapacidadPorPagar {
  return useContext(PorPagarContext);
}
