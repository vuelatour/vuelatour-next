/**
 * Menú ⋯ de un gasto (`components/admin/expenses/expense-actions.tsx`): quién
 * ve cada acción, cómo se llama el botón para un lector de pantalla y qué
 * dice un rechazo por rol. PURO (sin React ni red).
 *
 * 1-oct-2026: Combustibles estrenó el menú (antes solo Gastos). La pantalla
 * la ven ADMIN, COORDINADOR y FACTURACION, pero el API no deja a todos hacer
 * todo: FACTURACION confirmaba «Eliminar» y le salía, en inglés, «Required
 * role: ADMIN | COORDINADOR | PILOTO | MECANICO | VISITANTE. Current:
 * FACTURACION». Ahora el menú esconde lo que el rol no puede hacer y, si aun
 * así llega un 403 por rol, se dice en español.
 */
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";

/** Espejo del `@Roles` de `DELETE /v1/expenses/:id`. */
export const ROLES_ELIMINAN_GASTO = [
  "ADMIN",
  "COORDINADOR",
  "PILOTO",
  "MECANICO",
  "VISITANTE",
] as const;

/** Espejo del `@Roles` de `POST /v1/expenses/:id/visto-bueno`. */
export const ROLES_VISTO_BUENO_GASTO = ["ADMIN", "FACTURACION", "ANALISTA"] as const;

/**
 * Sin rol conocido (la página no lo pasó o `/me` falló) NO se esconde nada:
 * el API sigue siendo el candado, y esconder por falta de dato le quitaría
 * la acción a quien sí puede.
 */
function rolIncluido(rol: string | null | undefined, roles: readonly string[]): boolean {
  return rol == null || rol === "" || roles.includes(rol);
}

export function puedeEliminarGasto(rol: string | null | undefined): boolean {
  return rolIncluido(rol, ROLES_ELIMINAN_GASTO);
}

export function puedeDarVistoBuenoGasto(rol: string | null | undefined): boolean {
  return rolIncluido(rol, ROLES_VISTO_BUENO_GASTO);
}

/**
 * Nombre accesible del botón ⋯: dice DE QUÉ gasto son las acciones (la tabla
 * tiene uno por renglón; «Acciones» repetido no distingue ninguno).
 */
export function etiquetaAccionesGasto(g: {
  monto: string | number | null;
  moneda: string | null;
  fecha_gasto: string | null;
}): string {
  const partes = ["Acciones del gasto"];
  const monto = fmtMonto(g.monto, g.moneda);
  if (monto !== "—") partes.push(`de ${monto}`);
  if (g.fecha_gasto) partes.push(`del ${fmtDateOnly(g.fecha_gasto)}`);
  return partes.join(" ");
}

export const TEXTO_SIN_PERMISO_GASTO =
  "Tu rol no tiene permiso para esta acción. Pide a un administrador que la haga.";

/**
 * Mensaje de error de una acción sobre gastos para el toast: el 403 del
 * `RolesGuard` del API («Required role: … Current: …», en inglés) se dice en
 * español; cualquier otro mensaje del API pasa tal cual (ya viene en es-MX y
 * explica el candado: conciliado, en compra, repartido…).
 */
export function mensajeErrorAccionGasto(status: number | null | undefined, mensaje: string): string {
  if (status === 403 && /^Required role\b/i.test(mensaje.trim())) return TEXTO_SIN_PERMISO_GASTO;
  return mensaje;
}
