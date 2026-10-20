"use client";

import { createContext, useContext } from "react";
import { puedeAgregarCuenta } from "@/lib/admin/cuentas-gasto";
import { puedeEditarProveedor } from "@/lib/admin/proveedores-gasto";

/**
 * Catálogos en línea desde el gasto (20-oct-2026, API 0.0.100, invariante 98
 * del API): el ROL de quien captura decide si el selector de cuenta ofrece
 * «＋ Agregar cuenta…» y si el de proveedor ofrece agregar y corregir. Lo
 * monta `AdminShell` con `me.rol`. Fuera del Provider (tests, pantallas
 * públicas) vale null ⇒ los selectores de siempre, sin alta ni edición.
 */
const CatalogosGastoContext = createContext<string | null>(null);

export function CatalogosGastoProvider({
  rol,
  children,
}: {
  rol: string | null;
  children: React.ReactNode;
}) {
  return <CatalogosGastoContext.Provider value={rol}>{children}</CatalogosGastoContext.Provider>;
}

/** ¿Ofrecer «＋ Agregar cuenta…» en el gasto? */
export function usePuedeAgregarCuenta(): boolean {
  return puedeAgregarCuenta(useContext(CatalogosGastoContext));
}

/** ¿Ofrecer agregar y corregir proveedores en el gasto? */
export function usePuedeEditarProveedor(): boolean {
  return puedeEditarProveedor(useContext(CatalogosGastoContext));
}
