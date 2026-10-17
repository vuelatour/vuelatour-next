"use client";

import { createContext, useContext } from "react";

/**
 * AFAC por vuelo (16-oct-2026, API 0.0.89, invariante 90) para componentes
 * cliente: ¿este usuario puede marcar un gasto «Pago de AFAC»? Lo monta
 * `AdminShell` con `puedeEditarAfacReal(me)` (`config.afac_real` de `/v1/me`
 * —la base ya tiene la migración— y rol ADMIN / FACTURACION / COORDINADOR).
 * Fuera del Provider (tests, pantallas públicas) vale false ⇒ la casilla no
 * se pinta y la llave no viaja: comportamiento de siempre.
 */
const AfacRealContext = createContext<boolean>(false);

export function AfacRealProvider({
  puedeMarcarPagoAfac,
  children,
}: {
  puedeMarcarPagoAfac: boolean;
  children: React.ReactNode;
}) {
  return <AfacRealContext.Provider value={puedeMarcarPagoAfac}>{children}</AfacRealContext.Provider>;
}

/** true = ofrecer «Es pago de AFAC» en el formulario de gasto (si es Permiso). */
export function usePuedeMarcarPagoAfac(): boolean {
  return useContext(AfacRealContext);
}
