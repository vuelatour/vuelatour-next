/**
 * ACCESO A NÓMINA POR PERSONA (12-nov-2026, API 0.0.137, invariante 132 del
 * API) — FUENTE ÚNICA PURA de Configuración → «Acceso a Nómina» (sin React
 * ni red; prueba `__tests__/acceso-nomina.test.ts`).
 *
 * Pedido de Dirección: «necesito otro componente para que los usuarios con
 * rol de dirección puedan habilitar o deshabilitar a algunos usuarios el
 * módulo de nómina, porque por ejemplo ahorita le acaban de autorizar el
 * acceso a Mary, pero no sé si es para siempre o temporal, mejor poder
 * controlarlo desde configuración».
 *
 * Qué decide el API (el panel solo lo pinta):
 *  - Por su rol entran Dirección, Coordinación y Facturación (como siempre).
 *  - De ADMINISTRACIÓN entra solo quien Dirección encienda aquí (lista
 *    `acceso_nomina`). Ese acceso abre el módulo de Nómina completo: ver los
 *    pagos, registrarlos, editarlos, repartirlos entre aviones y exportarlos.
 *    NO abre los gastos personales ni los demás módulos de Dirección.
 *  - Solo Dirección cambia la lista; Administración la ve de solo lectura.
 *  - A cada persona le llega en `/me.permisos.nomina` (menú y pantalla:
 *    `nomina.ts#puedeVerNomina`).
 */
import { diffListaIds } from "@/lib/admin/lista-ids";
import { unirNombres } from "@/lib/admin/facturas-emitidas";

/** Clave de la fila en `configuracion_sistema` (tiene sección propia). */
export const CLAVE_CONFIG_ACCESO_NOMINA = "acceso_nomina";

/** Tope de ids por guardado (espejo del `@ArrayMaxSize` del DTO del API). */
export const TOPE_ACCESO_NOMINA = 50;

export interface PersonaAccesoNomina {
  id: string;
  nombre: string;
  rol?: string;
}

/** Respuesta de GET/PUT /v1/config/acceso-nomina. */
export interface AccesoNomina {
  /** Ids guardados en la lista. */
  usuario_ids: string[];
  /** Los que el API pudo nombrar (también quien ya se dio de baja). */
  usuarios: { id: string; nombre: string }[];
  /** Administración ACTIVA: a quién se le puede dar el acceso. */
  candidatos: PersonaAccesoNomina[];
  /** Oficina activa que ya entra por su rol (informativo). */
  por_rol?: PersonaAccesoNomina[];
  /** ¿Quien consulta puede cambiarla? (= es de Dirección). */
  puede_modificar: boolean;
  /** Sello de la lista: se regresa tal cual en el PUT (`null` = nunca guardada). */
  version?: string | null;
  actualizado_at?: string | null;
  actualizado_por_nombre?: string | null;
}

// ═══════════════════════════════ Textos ═══════════════════════════════

export const TITULO_ACCESO_NOMINA = "Acceso a Nómina";

export const DESCRIPCION_ACCESO_NOMINA =
  "A quién de Administración le das entrada al módulo de Nómina: ver los pagos, registrarlos, repartirlos entre aviones y exportarlos. Enciéndelo o apágalo cuando quieras (por ejemplo, si el acceso es solo por un tiempo); aplica en cuanto guardas. No abre los gastos personales ni los demás módulos de Dirección.";

export const TEXTO_ACCESO_SOLO_DIRECCION = "Solo Dirección puede cambiar quién entra.";

export const TEXTO_ACCESO_SIN_CANDIDATOS = "No hay usuarios activos de Administración.";

export const TEXTO_ACCESO_NO_DISPONIBLE = "Disponible cuando se actualice el API.";

export const TEXTO_ACCESO_FALLO =
  "No se pudo cargar quién entra a Nómina. Recarga la página para reintentar.";

export const TITULO_CONFIRMAR_ACCESO_NOMINA = "¿Cambiar quién entra a Nómina?";

const SIN_NOMBRE = "un usuario dado de baja";

/** Nombre de un id: candidato → resuelto por el API → «un usuario dado de baja». */
export function nombreDeAcceso(
  datos: Pick<AccesoNomina, "usuarios" | "candidatos">,
  id: string,
): string {
  return (
    datos.candidatos.find((c) => c.id === id)?.nombre?.trim() ||
    datos.usuarios.find((u) => u.id === id)?.nombre?.trim() ||
    SIN_NOMBRE
  );
}

/**
 * Quién tiene HOY el acceso por esta lista: los guardados que siguen siendo
 * de Administración activa (los únicos a los que el API deja pasar), en el
 * orden guardado.
 */
export function conAccesoHoy(
  datos: Pick<AccesoNomina, "usuario_ids" | "usuarios" | "candidatos">,
): string[] {
  const candidatos = new Set(datos.candidatos.map((c) => c.id));
  return datos.usuario_ids
    .filter((id) => candidatos.has(id))
    .map((id) => nombreDeAcceso(datos, id));
}

/**
 * Guardados que YA NO son de Administración activa (se dieron de baja o
 * cambiaron de rol): el API no los deja pasar, pero siguen en la lista hasta
 * que se guarde de nuevo.
 */
export function guardadosFueraDeLista(
  datos: Pick<AccesoNomina, "usuario_ids" | "usuarios" | "candidatos">,
): string[] {
  const candidatos = new Set(datos.candidatos.map((c) => c.id));
  return datos.usuario_ids
    .filter((id) => !candidatos.has(id))
    .map((id) => nombreDeAcceso(datos, id));
}

/** «Con acceso dado aquí: Mary Cruz.» / «Hoy nadie de Administración entra a Nómina.» */
export function textoAccesoActual(nombres: readonly string[]): string {
  const quienes = unirNombres(nombres);
  return quienes
    ? `Con acceso dado aquí: ${quienes}.`
    : "Hoy nadie de Administración entra a Nómina.";
}

/** «Por su rol entran siempre: Alejandro Canales, Diego Ramírez y Pablo Canales.» (sin nadie ⇒ null). */
export function textoEntranPorRol(
  porRol: readonly PersonaAccesoNomina[] | null | undefined,
): string | null {
  const quienes = unirNombres((porRol ?? []).map((p) => p.nombre));
  return quienes ? `Por su rol entran siempre: ${quienes}.` : null;
}

/** Aviso ámbar de los guardados que ya no cuentan. */
export function textoFueraDeLista(nombres: readonly string[]): string {
  return `En la lista, pero ya no son de Administración activa (no entran): ${unirNombres(nombres)}. Pulsa «Guardar» para quitarlos.`;
}

/**
 * Qué se va a guardar: SOLO candidatos (un guardado que se dio de baja no
 * tiene switch y reenviarlo daría 400 `USUARIOS_INVALIDOS` en cada
 * guardado), sin repetir y con el tope del API.
 */
export function idsAGuardarAcceso(
  elegidos: Iterable<string>,
  candidatos: readonly PersonaAccesoNomina[],
): string[] {
  const validos = new Set(candidatos.map((c) => c.id));
  return [...new Set(elegidos)].filter((id) => validos.has(id)).slice(0, TOPE_ACCESO_NOMINA);
}

/** Qué cambia entre lo guardado y lo que se va a guardar. */
export function diffAccesoNomina(
  guardados: readonly string[],
  aGuardar: readonly string[],
): { agregados: string[]; quitados: string[]; cambio: boolean } {
  const { agregados, quitados } = diffListaIds(guardados, aGuardar);
  return { agregados, quitados, cambio: agregados.length > 0 || quitados.length > 0 };
}

/**
 * Texto de la confirmación (regla del cliente: todo lo que quita algo se
 * confirma). Dice con nombre quién gana y quién pierde la entrada.
 */
export function textoConfirmarAccesoNomina(input: {
  agregados: readonly string[];
  quitados: readonly string[];
}): string {
  const partes: string[] = [];
  const entran = unirNombres(input.agregados);
  const salen = unirNombres(input.quitados);
  if (entran) partes.push(`Podrán entrar a Nómina: ${entran}.`);
  if (salen) partes.push(`Dejarán de entrar: ${salen}.`);
  partes.push("Aplica de inmediato; lo puedes cambiar cuando quieras.");
  return partes.join(" ");
}

/** Aviso tras guardar: quién quedó con acceso y cuándo lo verá. */
export function textoGuardadoAccesoNomina(nombres: readonly string[]): string {
  const quienes = unirNombres(nombres);
  return quienes
    ? `Guardado. Con acceso a Nómina: ${quienes}. Lo verán en su menú al recargar la página.`
    : "Guardado. Nadie de Administración entra a Nómina.";
}

/** «Último cambio: 12/11/2026, 3:04 p.m. · Diego Ramírez» (la fecha ya formateada; sin fecha ⇒ null). */
export function textoUltimoCambioAcceso(
  fecha: string | null | undefined,
  quien: string | null | undefined,
): string | null {
  const f = fecha?.trim();
  if (!f || f === "—") return null;
  const q = quien?.trim();
  return q ? `Último cambio: ${f} · ${q}` : `Último cambio: ${f}`;
}

// ═══════════════════════════════ Errores del guardado ═══════════════════════════════

export const ERRORES_ACCESO_NOMINA = {
  SOLO_DIRECCION_ACCESO_NOMINA: "Solo Dirección puede cambiar quién entra a Nómina.",
  USUARIOS_INVALIDOS:
    "Alguno de los usuarios elegidos ya no es de Administración activa. Recarga la página.",
  ACCESO_NOMINA_CAMBIO:
    "Alguien más cambió quién entra a Nómina mientras lo editabas. Recarga y vuelve a intentar.",
} as const;

export const TEXTO_ACCESO_API_VIEJO =
  "Falta actualizar el API para guardar este acceso. Avisa a sistemas.";

export const TEXTO_ACCESO_ERROR = "No se pudo guardar el acceso a Nómina.";

/**
 * Mensaje legible de un rechazo del PUT. Se decide por CÓDIGO; el texto del
 * API manda cuando el código es de los nuestros (es-MX). Un 403 sin código
 * propio es el del guard de roles (texto técnico en inglés): se dice en
 * claro. Un 404 es un API sin desplegar.
 */
export function mensajeErrorAccesoNomina(input: {
  code?: string;
  status?: number;
  error?: string | null;
}): string {
  const api = input.error?.trim();
  if (input.code && input.code in ERRORES_ACCESO_NOMINA) {
    return api || ERRORES_ACCESO_NOMINA[input.code as keyof typeof ERRORES_ACCESO_NOMINA];
  }
  if (input.status === 403) return ERRORES_ACCESO_NOMINA.SOLO_DIRECCION_ACCESO_NOMINA;
  if (input.status === 404) return TEXTO_ACCESO_API_VIEJO;
  return TEXTO_ACCESO_ERROR;
}

/** ¿El rechazo pide repintar la sección con lo que hay hoy en el API? */
export function errorAccesoNominaPideRecargar(input: { code?: string; status?: number }): boolean {
  return (
    input.status === 403 ||
    input.code === "ACCESO_NOMINA_CAMBIO" ||
    input.code === "USUARIOS_INVALIDOS" ||
    input.code === "SOLO_DIRECCION_ACCESO_NOMINA"
  );
}
