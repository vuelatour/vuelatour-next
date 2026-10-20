/**
 * PROVEEDOR EN LÍNEA DESDE EL GASTO (20-oct-2026, API 0.0.100, invariante 98
 * del API). PURO: sin React ni red.
 *
 * Pedido del cliente (punto 5 de la lista del 20-oct-2026): «debemos tener la
 * forma rápida y ágil desde el select de proveedores de poder crear y editar
 * alguno sin salir a otra página». Decisión: toda la oficina (ADMIN,
 * FACTURACION, COORDINADOR) crea y corrige proveedores desde el gasto; dar de
 * baja sigue en «Proveedores».
 *
 * El API responde 409 `PROVEEDOR_DUPLICADO` (con el existente) si el nombre
 * ya lo usa OTRO proveedor activo (sin acentos, mayúsculas ni signos): el
 * panel lo elige en vez de duplicarlo. La misma normalización vive aquí para
 * avisar ANTES de mandar.
 */

export const ROLES_EDITAN_PROVEEDOR = ["ADMIN", "FACTURACION", "COORDINADOR"] as const;

/** ¿Este rol crea/corrige proveedores desde el gasto? Sin rol: no se ofrece. */
export function puedeEditarProveedor(rol: string | null | undefined): boolean {
  return (ROLES_EDITAN_PROVEEDOR as readonly string[]).includes(rol ?? "");
}

/** Espejo EXACTO de `normalizarNombreProveedor` del API. */
export function normalizarNombreProveedor(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

export interface ProveedorOpcion {
  id: string;
  nombre: string;
}

/** El proveedor (otro) que ya usa ese nombre, o null. */
export function proveedorConMismoNombre(
  nombre: string,
  lista: readonly ProveedorOpcion[],
  excepto?: string | null,
): ProveedorOpcion | null {
  const clave = normalizarNombreProveedor(nombre);
  if (!clave) return null;
  return (
    lista.find((p) => p.id !== excepto && normalizarNombreProveedor(p.nombre) === clave) ?? null
  );
}

/** Valor centinela de «＋ Agregar proveedor…» (jamás viaja al API). */
export const VALOR_AGREGAR_PROVEEDOR = "__agregar_proveedor__";
export const ETIQUETA_AGREGAR_PROVEEDOR = "＋ Agregar proveedor…";
export const ETIQUETA_EDITAR_PROVEEDOR = "Editar proveedor";
export const TITULO_EDITAR_PROVEEDOR = "Corregir el proveedor elegido";

export const TIPOS_PROVEEDOR = [
  { value: "NACIONAL", label: "Nacional (con RFC)" },
  { value: "EXTRANJERO", label: "Extranjero" },
  { value: "GENERICO_LOCAL", label: "Genérico / local (sin RFC)" },
] as const;

export interface FormProveedorRapido {
  nombre: string;
  tipo: string;
  rfc: string;
  telefono: string;
  email: string;
}

export const FORM_PROVEEDOR_VACIO: FormProveedorRapido = {
  nombre: "",
  tipo: "NACIONAL",
  rfc: "",
  telefono: "",
  email: "",
};

export const TITULO_PROVEEDOR_NUEVO = "Agregar proveedor";
export const TITULO_PROVEEDOR_EDITAR = "Editar proveedor";
export const DESCRIPCION_PROVEEDOR_RAPIDO =
  "Queda disponible en todos los gastos. Dirección, contacto y notas se completan en «Proveedores».";
export const BOTON_GUARDAR_PROVEEDOR_NUEVO = "Agregar proveedor";
export const BOTON_GUARDAR_PROVEEDOR_EDITAR = "Guardar cambios";

/** Errores del formulario (los límites del DTO del API). */
export function erroresProveedorRapido(
  f: FormProveedorRapido,
  lista: readonly ProveedorOpcion[],
  excepto?: string | null,
): Partial<Record<keyof FormProveedorRapido, string>> {
  const e: Partial<Record<keyof FormProveedorRapido, string>> = {};
  const nombre = f.nombre.trim();
  if (!nombre) e.nombre = "Escribe el nombre del proveedor.";
  else if (nombre.length > 200) e.nombre = "Máximo 200 caracteres.";
  else {
    const otro = proveedorConMismoNombre(nombre, lista, excepto);
    if (otro) e.nombre = `Ya existe «${otro.nombre}»: elígelo de la lista.`;
  }
  if (!TIPOS_PROVEEDOR.some((t) => t.value === f.tipo)) e.tipo = "Elige el tipo.";
  const rfc = f.rfc.trim();
  if (rfc && (rfc.length < 12 || rfc.length > 13)) e.rfc = "El RFC tiene 12 o 13 caracteres.";
  const email = f.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Revisa el correo.";
  return e;
}

/**
 * Cuerpo del POST (alta) o del PATCH (edición, SOLO lo que cambió contra la
 * base). En la edición, vaciar un campo opcional manda `null`.
 */
export function cuerpoProveedorRapido(
  f: FormProveedorRapido,
  base?: FormProveedorRapido | null,
): Record<string, string | null> {
  const limpio = {
    nombre: f.nombre.trim(),
    tipo: f.tipo,
    rfc: f.rfc.trim().toUpperCase(),
    telefono: f.telefono.trim(),
    email: f.email.trim(),
  };
  if (!base) {
    const cuerpo: Record<string, string> = { nombre: limpio.nombre, tipo: limpio.tipo };
    if (limpio.rfc) cuerpo.rfc = limpio.rfc;
    if (limpio.telefono) cuerpo.telefono = limpio.telefono;
    if (limpio.email) cuerpo.email = limpio.email;
    return cuerpo;
  }
  const antes = {
    nombre: base.nombre.trim(),
    tipo: base.tipo,
    rfc: base.rfc.trim().toUpperCase(),
    telefono: base.telefono.trim(),
    email: base.email.trim(),
  };
  const cuerpo: Record<string, string | null> = {};
  for (const k of Object.keys(limpio) as Array<keyof typeof limpio>) {
    if (limpio[k] !== antes[k]) {
      cuerpo[k] = limpio[k] === "" && k !== "nombre" && k !== "tipo" ? null : limpio[k];
    }
  }
  return cuerpo;
}

/** Formulario desde la ficha del API (`GET /v1/providers/:id`). */
export function formDeProveedor(p: Record<string, unknown>): FormProveedorRapido {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    nombre: s(p.nombre),
    tipo: s(p.tipo) || "NACIONAL",
    rfc: s(p.rfc),
    telefono: s(p.telefono),
    email: s(p.email),
  };
}

/** Texto de un rechazo del API. */
export function mensajeErrorProveedorRapido(r: {
  status?: number;
  code?: string;
  error?: string;
}): string {
  if (r.code === "PROVEEDOR_DUPLICADO" && r.error) return r.error;
  if (r.status === 403) return "Tu usuario no puede dar de alta ni corregir proveedores.";
  if (r.status === 404) return "Ese proveedor ya no existe: recarga la página.";
  return r.error || "No se pudo guardar el proveedor.";
}

export function textoProveedorAgregado(nombre: string): string {
  return `Proveedor «${nombre}» agregado y elegido en este gasto.`;
}

export function textoProveedorActualizado(nombre: string): string {
  return `Proveedor «${nombre}» actualizado.`;
}

/**
 * Opciones del selector: «Sin proveedor» no existe como opción (el
 * placeholder lo dice, como siempre); los proveedores en su orden y, con
 * permiso, «＋ Agregar proveedor…» al final.
 */
export function opcionesSelectorProveedor(
  lista: readonly ProveedorOpcion[],
  conAgregar: boolean,
): Array<{ value: string; label: string }> {
  return [
    ...lista.map((p) => ({ value: p.id, label: p.nombre })),
    ...(conAgregar ? [{ value: VALOR_AGREGAR_PROVEEDOR, label: ETIQUETA_AGREGAR_PROVEEDOR }] : []),
  ];
}
