"use client";

import { createContext, useContext } from "react";

/**
 * «Es el pago al operador externo» (27-oct-2026, API 0.0.110, invariante 110)
 * para componentes cliente: ¿este usuario puede marcar un gasto como pago al
 * operador externo? Lo monta `AdminShell` con `puedeMarcarPagoOperador(me)`
 * (rol ADMIN / FACTURACION / COORDINADOR). Fuera del Provider (tests,
 * pantallas públicas) vale false ⇒ la casilla no se pinta y la llave no
 * viaja: comportamiento de siempre.
 */
const PagoOperadorContext = createContext<boolean>(false);

export function PagoOperadorProvider({
  puedeMarcar,
  children,
}: {
  puedeMarcar: boolean;
  children: React.ReactNode;
}) {
  return <PagoOperadorContext.Provider value={puedeMarcar}>{children}</PagoOperadorContext.Provider>;
}

/** true = ofrecer «Es el pago al operador externo» en el formulario de gasto (si el vuelo es externo). */
export function usePuedeMarcarPagoOperador(): boolean {
  return useContext(PagoOperadorContext);
}
