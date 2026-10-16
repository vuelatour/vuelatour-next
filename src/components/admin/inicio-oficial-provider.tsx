"use client";

import { createContext, useContext } from "react";
import type { InicioOficial } from "@/lib/admin/inicio-oficial";

/**
 * Inicio oficial del sistema para componentes cliente (16-oct-2026, API
 * 0.0.84). Lo monta `AdminShell` con `me.config?.inicio_oficial` ya
 * validado. Fuera del Provider (tests, pantallas públicas) vale `null` ⇒
 * comportamiento de siempre.
 */
const InicioOficialContext = createContext<InicioOficial>(null);

export function InicioOficialProvider({
  inicio,
  children,
}: {
  inicio: InicioOficial;
  children: React.ReactNode;
}) {
  return <InicioOficialContext.Provider value={inicio}>{children}</InicioOficialContext.Provider>;
}

/** «AAAA-MM-DD» del inicio oficial, o `null` (sin piso). */
export function useInicioOficial(): InicioOficial {
  return useContext(InicioOficialContext);
}
