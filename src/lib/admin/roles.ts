import type { Rol } from "@/types/me";

/**
 * ROLES «DIRECCIÓN» Y «ADMINISTRACIÓN» (6-nov-2026, API 0.0.126, invariante
 * 122 del API). Pedido del dueño: «un nuevo rol que sea Super usuario o
 * Dirección … se le dará a Ale Canales y Pablo Canales; los demás que están de
 * ADMIN sean de Administración».
 *
 *  - DIRECCION ve TODO el menú (`filterNavGroupsForRole`) y el API le deja
 *    pasar cualquier ruta. ADMIN = «Administración» (la oficina): todo menos
 *    los MÓDULOS SOLO DE DIRECCIÓN (`MODULOS_SOLO_DIRECCION`); en el
 *    expediente del avión ve solo los gastos; no ve la caja chica de
 *    Dirección; no da el rol de Dirección ni edita a quien lo tiene.
 *  - El código del rol sigue siendo `ADMIN` (la BD y el API no lo renombran);
 *    lo que cambia es la ETIQUETA y el alcance. Toda pantalla que muestre un
 *    rol usa `etiquetaRol`.
 *  - El candado real es el API; el panel esconde lo que responderá 403 y pinta
 *    `PantallaSoloDireccion` donde antes había un 404 o un error.
 *  - NÓMINA POR PERSONA (12-nov-2026, API 0.0.137, invariante 132 del API):
 *    Dirección puede abrirle el módulo de Nómina a alguien de Administración
 *    en Configuración → «Acceso a Nómina». No es un rol: llega en
 *    `/me.permisos.nomina` (`lib/admin/nomina.ts#puedeVerNomina`,
 *    `lib/admin/acceso-nomina.ts`).
 *
 * PURO (sin React ni red): `__tests__/roles.test.ts`.
 */

export const ROL_DIRECCION: Rol = "DIRECCION";
export const ROL_ADMINISTRACION: Rol = "ADMIN";

export const ETIQUETA_ROL: Record<Rol, string> = {
  DIRECCION: "Dirección",
  ADMIN: "Administración",
  COORDINADOR: "Coordinación",
  ANALISTA: "Analista",
  FACTURACION: "Facturación",
  PILOTO: "Piloto",
  SOCIO: "Socio",
  MECANICO: "Mecánico",
  VISITANTE: "Visitante",
};

/** Etiqueta es-MX del rol; un código desconocido (API más nuevo) sale tal cual. */
export function etiquetaRol(rol: string | null | undefined): string {
  if (!rol) return "";
  return (ETIQUETA_ROL as Record<string, string>)[rol] ?? rol;
}

export const DESCRIPCION_ROL: Record<Rol, string> = {
  DIRECCION:
    "Acceso total (Ale y Pablo): además, Estadísticas, Ingresos, Nómina, Gastos personales, Reparto y Pagos a socios.",
  ADMIN:
    "La oficina: todo menos Estadísticas, Ingresos, Nómina (salvo que Dirección le dé acceso en Configuración), Gastos personales, Reparto y Pagos a socios.",
  COORDINADOR: "Solicitudes, cotizaciones y operación diaria.",
  ANALISTA: "Lectura amplia para análisis y reportes.",
  FACTURACION: "CFDI, conciliación, caja chica y cuentas bancarias.",
  PILOTO: "Operativos: app móvil.",
  SOCIO: "Lectura + PDFs de reparto.",
  MECANICO: "App: combustible e inventario.",
  VISITANTE: "Solo gastos de visita desde la app (fondo + tarjeta); sin acceso a vuelos.",
};

export function descripcionRol(rol: string | null | undefined): string {
  if (!rol) return "";
  return (DESCRIPCION_ROL as Record<string, string>)[rol] ?? "";
}

export interface OpcionRol {
  value: Rol;
  label: string;
  description: string;
}

/** Opciones del selector de rol (Usuarios), en el orden en que se ofrecen. */
export const OPCIONES_ROL: readonly OpcionRol[] = (
  [
    "DIRECCION",
    "ADMIN",
    "COORDINADOR",
    "ANALISTA",
    "FACTURACION",
    "PILOTO",
    "SOCIO",
    "MECANICO",
    "VISITANTE",
  ] as const
).map((value) => ({ value, label: ETIQUETA_ROL[value], description: DESCRIPCION_ROL[value] }));

export function esDireccion(rol: string | null | undefined): boolean {
  return rol === ROL_DIRECCION;
}

export function esAdministracion(rol: string | null | undefined): boolean {
  return rol === ROL_ADMINISTRACION;
}

/** Lo que antes se escribía `rol === "ADMIN"`: Administración o Dirección. */
export function esAdminODireccion(rol: string | null | undefined): boolean {
  return rol === ROL_ADMINISTRACION || rol === ROL_DIRECCION;
}

/**
 * Las listas `ROLES_*` del panel llevan `"DIRECCION"` explícito; los `@Roles`
 * del API no (su guard la deja pasar siempre). Para las pruebas de PARIDAD
 * con el API: la lista del panel sin Dirección debe ser EXACTAMENTE la del
 * API.
 */
export function sinDireccion(roles: readonly string[]): string[] {
  return roles.filter((r) => r !== ROL_DIRECCION);
}

/**
 * Solo Dirección da el rol de Dirección: a Administración ni se le ofrece la
 * opción (el API respondería 403 `SOLO_DIRECCION_EDITA_DIRECCION`). Sin rol
 * conocido (`/me` caído) se ofrece todo: el API decide.
 */
export function opcionesRolParaActor(rolActor: string | null | undefined): OpcionRol[] {
  if (rolActor == null || esDireccion(rolActor)) return [...OPCIONES_ROL];
  return OPCIONES_ROL.filter((o) => o.value !== ROL_DIRECCION);
}

/** Administración no edita (ni desactiva ni cambia la contraseña) a alguien de Dirección. */
export function puedeEditarUsuario(
  rolActor: string | null | undefined,
  rolUsuario: string | null | undefined,
): boolean {
  if (!esDireccion(rolUsuario)) return true;
  return rolActor == null || esDireccion(rolActor);
}

/** Gastos personales del dueño: Dirección y la coordinación que los captura. */
export function puedeVerGastosPersonales(rol: string | null | undefined): boolean {
  return rol === "DIRECCION" || rol === "COORDINADOR";
}

/** Hrefs del menú que SOLO ve Dirección (de los roles de oficina). */
export const MODULOS_SOLO_DIRECCION = [
  "/admin/dashboards",
  "/admin/ingresos",
  "/admin/nomina",
  "/admin/gastos-personales",
  "/admin/profit-sharing",
  "/admin/profit-sharing/socios",
] as const;

export const TITULO_SOLO_DIRECCION = "Solo Dirección";
export const TEXTO_SOLO_DIRECCION =
  "Esta pantalla la ve solo Dirección (Ale y Pablo). Si necesitas algo de aquí, pídeselo a ellos.";
export const TEXTO_CAJA_SOLO_DIRECCION =
  "Esta caja chica es de Dirección: solo ellos la ven y la editan.";
export const TEXTO_USUARIO_SOLO_DIRECCION =
  "Es un usuario de Dirección: solo Dirección lo edita, lo desactiva o le cambia la contraseña.";
// 12-nov-2026 (API 0.0.137): Dirección puede darle el acceso a alguien de
// Administración; a quien no lo tiene se le dice a quién pedírselo y dónde.
export const TEXTO_NOMINA_SOLO_DIRECCION =
  "La nómina la ve Dirección y a quien Dirección le dé acceso. Si te toca llevarla, pídele a Dirección que te lo dé en Configuración → «Acceso a Nómina».";
