/**
 * Editar los datos de un piloto desde «Pilotos» (2-oct-2026, contrato
 * «Pilotos: editar datos + tarjetas», API 0.0.52 sin migración).
 *
 * Pedido de la oficina: la coordinación cambia la tarjeta corp. y los datos
 * de contacto de los PILOTOS sin esperar a un ADMIN. El API abrió
 * `PATCH /v1/users/:id` a COORDINADOR, acotado a nombre, teléfono, nombre
 * corto y tarjeta (libre o ya del piloto) de un piloto de base o externo; un
 * usuario de oficina que también vuela (Pablo Canales) sigue siendo solo de
 * ADMIN. EL CANDADO ES EL API: aquí solo se OFRECE el botón y se arma el
 * cuerpo; sin `/me` (falló la lectura) el botón se ofrece igual y el API
 * decide.
 *
 * Fuente ÚNICA (PURA, sin React ni red) de:
 *  - quién ve el botón y los textos del diálogo en modo piloto;
 *  - el cuerpo del PATCH en los DOS modos del diálogo de usuario: la tarjeta
 *    y el apodo viajan solo si cambiaron (`null` = quitar), `tiene_fondo_caja`
 *    NUNCA viaja (lo mantiene Caja chica) y `es_piloto`/`es_piloto_externo`
 *    solo si cambiaron (y `es_piloto` jamás si el servidor no lo mandó);
 *  - la traducción de los errores del guardado.
 *
 * La tarjeta del gasto se SELLA al capturarlo: cambiar la del piloto NO toca
 * los gastos anteriores (por eso el diálogo lo dice).
 */
import type { Rol } from "@/types/me";
import type { User } from "@/types/users";
import { APODO_API_VIEJO, apodoParaPayload, esRechazoPorApodo, normalizarApodo } from "@/lib/admin/usuario-apodo";
import { MSG_SERVIDOR_NO_RESPONDIO, esErrorTecnico } from "@/lib/admin/errores-tecnicos";

// ===== Quién ve el botón =====

/**
 * ¿Se ofrece «Editar datos»? ADMIN y COORDINADOR; sin rol conocido (`/me`
 * no cargó) también — el gate real es el API, y esconder el botón por una
 * lectura fallida dejaría a la coordinación sin salida.
 */
export function puedeEditarPiloto(rol: Rol | null | undefined): boolean {
  return rol == null || rol === "ADMIN" || rol === "COORDINADOR";
}

// ===== Textos =====

export const BOTON_EDITAR_PILOTO = "Editar datos";

export function tituloDialogoPiloto(nombre: string): string {
  return `Editar datos de ${nombre}`;
}

export const DESCRIPCION_DIALOGO_PILOTO =
  "Nombre, teléfono, nombre corto del calendario y tarjeta corp. Cambiar la tarjeta no modifica los gastos que ya se capturaron.";

export const HINT_TARJETA_PILOTO =
  "Si la tarjeta nueva no aparece, primero dala de alta en Tesorería → Tarjetas corp. (solo ADMIN)";

export const TOAST_PILOTO_ACTUALIZADO = "Datos del piloto actualizados";

/** Hint del switch «También es piloto» cuando el servidor no manda el dato. */
export const HINT_ES_PILOTO_NO_DISPONIBLE = "No disponible con este servidor";

/** 403 sin código de negocio: el API todavía no acepta a la coordinación. */
export const MSG_EDITAR_PILOTO_API_VIEJO =
  "Tu usuario todavía no puede editar datos de pilotos (falta actualizar el servidor). Pide el cambio a un ADMIN.";

/** Respaldo del 403 `SOLO_ADMIN_EDITA_USUARIOS` si el API no manda texto útil. */
export const MSG_SOLO_ADMIN_EDITA_USUARIOS = "Ese usuario es de oficina: solo un ADMIN lo edita";

/** Respaldo del 403 `TARJETA_DE_OTRO_USUARIO` si el API no manda texto útil. */
export const MSG_TARJETA_DE_OTRO_USUARIO =
  "Esa tarjeta es de otra persona: un ADMIN la reasigna desde Tarjetas corp.";

/** Id que no es uuid: no se llama al API. */
export const MSG_PILOTO_ID_INVALIDO = "No se encontró el piloto. Recarga la página.";

// ===== Cuerpo del PATCH =====

/** Lo único que viaja en modo piloto (= lo que el API acepta del COORDINADOR). */
export const CAMPOS_MODO_PILOTO = ["nombre", "telefono", "apodo", "tarjeta_terminacion"] as const;

export interface ValoresModoPiloto {
  nombre: string;
  telefono?: string | null;
  apodo?: string | null;
  tarjeta_terminacion?: string | null;
}

export interface DeltaTarjeta {
  /** `false` ⇒ la llave NO viaja (mandarla re-sincronizaba el catálogo). */
  cambio: boolean;
  /** `null` = desvincular (el `""` lo tiraría `stripEmpty`). */
  valor: string | null;
}

/** Tarjeta: viaja SOLO si cambió; quitarla manda `null` explícito. */
export function tarjetaParaPayload(
  original: string | null | undefined,
  nueva: string | null | undefined,
): DeltaTarjeta {
  const antes = original ?? "";
  const despues = nueva ?? "";
  if (antes === despues) return { cambio: false, valor: despues === "" ? null : despues };
  return { cambio: true, valor: despues === "" ? null : despues };
}

/**
 * Cuerpo del modo PILOTO: ⊆ {nombre, telefono, apodo, tarjeta_terminacion}.
 * Nombre y teléfono como en el modo usuario (el `""` lo tira la action);
 * tarjeta y apodo solo si cambiaron.
 */
export function payloadModoPiloto(
  user: Pick<User, "tarjeta_terminacion" | "apodo">,
  values: ValoresModoPiloto,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { nombre: values.nombre };
  if (values.telefono !== undefined) payload.telefono = values.telefono;
  const tarjeta = tarjetaParaPayload(user.tarjeta_terminacion, values.tarjeta_terminacion);
  if (tarjeta.cambio) payload.tarjeta_terminacion = tarjeta.valor;
  const apodo = apodoParaPayload(user.apodo, values.apodo);
  if (apodo.cambio) payload.apodo = apodo.valor;
  return payload;
}

/**
 * Cuerpo del modo USUARIO (ADMIN): todo lo del formulario MENOS
 * `tiene_fondo_caja` (nunca viaja: lo mantiene Caja chica y marcarlo a mano
 * dejaba a la persona fuera de «Abrir fondo»). Tarjeta y apodo solo si
 * cambiaron; `es_piloto` / `es_piloto_externo` solo si cambiaron respecto al
 * original y `es_piloto` jamás si el servidor no lo mandó (un `false` por
 * omisión le quitaría el doble rol a quien vuela).
 */
export function payloadModoUsuario(
  user: Pick<User, "tarjeta_terminacion" | "apodo" | "es_piloto" | "es_piloto_externo">,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...values };
  delete payload.tiene_fondo_caja;

  const tarjeta = tarjetaParaPayload(
    user.tarjeta_terminacion,
    values.tarjeta_terminacion as string | null | undefined,
  );
  if (tarjeta.cambio) payload.tarjeta_terminacion = tarjeta.valor;
  else delete payload.tarjeta_terminacion;

  const apodo = apodoParaPayload(user.apodo, values.apodo as string | null | undefined);
  if (apodo.cambio) payload.apodo = apodo.valor;
  else delete payload.apodo;

  if (!banderaCambio(user.es_piloto, values.es_piloto)) delete payload.es_piloto;
  if (!banderaCambio(user.es_piloto_externo, values.es_piloto_externo)) delete payload.es_piloto_externo;
  return payload;
}

/** Una bandera viaja solo si el servidor la mandó y el valor nuevo difiere. */
function banderaCambio(original: boolean | undefined, nuevo: unknown): boolean {
  if (original === undefined || typeof nuevo !== "boolean") return false;
  return nuevo !== original;
}

/**
 * Lo que la action manda al API en modo piloto: SOLO los cuatro campos, sin
 * `""`/`undefined` (como `stripEmpty`) pero conservando el `null` explícito
 * (quitar tarjeta o apodo), y el apodo normalizado (`""` ⇒ `null`).
 */
export function cuerpoActualizarPiloto(data: Record<string, unknown>): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {};
  for (const campo of CAMPOS_MODO_PILOTO) {
    const v = data[campo];
    if (v === undefined || v === "") continue;
    cuerpo[campo] = v;
  }
  if (typeof data.apodo === "string") {
    const limpio = normalizarApodo(data.apodo);
    cuerpo.apodo = limpio === "" ? null : limpio;
  }
  return cuerpo;
}

// ===== Selector de tarjeta =====

export interface OpcionTarjeta {
  terminacion: string;
  nombre_titular: string;
  /** Dueño en el catálogo. Ausente = no se sabe (no se filtra). */
  usuario_id?: string | null;
}

/**
 * Tarjetas que la coordinación puede asignar a ESTE piloto: libres o ya
 * suyas (las de otra persona las reasigna un ADMIN y el API las rechazaría).
 * Sin dato del dueño se ofrece: el API decide.
 */
export function opcionesTarjetaPiloto<T extends OpcionTarjeta>(opciones: T[], pilotoId: string): T[] {
  return opciones.filter((o) => o.usuario_id == null || o.usuario_id === pilotoId);
}

// ===== Datos del piloto que cruzan al cliente =====

/**
 * Solo los campos de `User` (la ficha del piloto trae vuelos, gastos,
 * capturas…: no tienen por qué serializarse al componente del diálogo).
 */
export function usuarioParaEdicion(p: User): User {
  const u: User = {
    id: p.id,
    supabase_auth_id: p.supabase_auth_id,
    email: p.email,
    nombre: p.nombre,
    rol: p.rol,
    estado: p.estado,
    tiene_fondo_caja: p.tiene_fondo_caja,
    tarjeta_terminacion: p.tarjeta_terminacion,
    es_piloto_externo: p.es_piloto_externo,
    telefono: p.telefono,
    avatar_url: p.avatar_url,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
  // Opcionales: solo si vinieron (ausente ≠ false / null).
  if (p.es_piloto !== undefined) u.es_piloto = p.es_piloto;
  if (p.apodo !== undefined) u.apodo = p.apodo;
  return u;
}

// ===== Errores =====

export interface FalloEditarPiloto {
  status?: number | null;
  code?: string | null;
  error?: string | null;
}

/**
 * Texto del toast cuando el guardado falla:
 *  - 403 con `SOLO_ADMIN_EDITA_USUARIOS` / `TARJETA_DE_OTRO_USUARIO` ⇒ el
 *    mensaje del API (es-MX), o su respaldo si llegó técnico;
 *  - 403 SIN código de negocio (el RolesGuard de un API viejo) ⇒ falta
 *    actualizar el servidor;
 *  - 400 «property apodo should not exist» ⇒ el aviso del apodo;
 *  - técnico (red, inglés, HTML) ⇒ «El servidor no respondió…»;
 *  - lo demás (400 de la tarjeta no registrada, 404…) ⇒ el mensaje del API.
 */
export function mensajeErrorEditarPiloto(r: FalloEditarPiloto): string {
  if (r.status === 403) {
    if (r.code === "SOLO_ADMIN_EDITA_USUARIOS") {
      return esErrorTecnico(r) ? MSG_SOLO_ADMIN_EDITA_USUARIOS : (r.error as string);
    }
    if (r.code === "TARJETA_DE_OTRO_USUARIO") {
      return esErrorTecnico(r) ? MSG_TARJETA_DE_OTRO_USUARIO : (r.error as string);
    }
    return MSG_EDITAR_PILOTO_API_VIEJO;
  }
  if (r.status === 400 && esRechazoPorApodo(r.error)) return APODO_API_VIEJO;
  if (esErrorTecnico(r)) return MSG_SERVIDOR_NO_RESPONDIO;
  return r.error as string;
}
