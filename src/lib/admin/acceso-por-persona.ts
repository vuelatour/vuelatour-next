/**
 * ACCESO POR PERSONA A UN MÓDULO DE DIRECCIÓN (12-nov-2026) — FUENTE ÚNICA
 * PURA de las tarjetas de Configuración «Acceso a Nómina» (API 0.0.137,
 * invariante 132 del API) y «Acceso a Gastos personales» (API 0.0.138,
 * invariante 133). Sin React ni red; prueba
 * `__tests__/acceso-por-persona.test.ts`.
 *
 * Pedidos de Dirección, el mismo día y sobre Configuración: «necesito otro
 * componente para que los usuarios con rol de dirección puedan habilitar o
 * deshabilitar a algunos usuarios el módulo de nómina, porque por ejemplo
 * ahorita le acaban de autorizar el acceso a Mary, pero no sé si es para
 * siempre o temporal, mejor poder controlarlo desde configuración» y, con
 * esa tarjeta ya en uso, «y venga otro para gastos personales».
 *
 * UNA sola pieza para los dos: lo que cambia de un módulo a otro vive en
 * `MODULOS_ACCESO_POR_PERSONA` (nombre, textos propios, ruta y códigos). Un
 * tercer módulo es un renglón ahí, nunca otra copia de esto.
 *
 * Qué decide el API (el panel solo lo pinta):
 *  - A cada módulo entran por su rol los de siempre (Nómina: Dirección,
 *    Coordinación y Facturación; Gastos personales: Dirección y
 *    Coordinación).
 *  - De ADMINISTRACIÓN entra solo quien Dirección encienda en la tarjeta de
 *    ESE módulo. Son listas independientes: tener un acceso no da el otro.
 *  - Solo Dirección cambia las listas; Administración las ve de solo lectura.
 *  - A cada persona le llega en `/me.permisos.<id>` (menú y pantalla:
 *    `nomina.ts#puedeVerNomina`, `roles.ts#puedeVerGastosPersonales`).
 */
import { diffListaIds } from "@/lib/admin/lista-ids";
import { unirNombres } from "@/lib/admin/facturas-emitidas";

/** Tope de ids por guardado (espejo del `@ArrayMaxSize` del DTO del API). */
export const TOPE_ACCESO_POR_PERSONA = 50;

export interface PersonaAcceso {
  id: string;
  nombre: string;
  rol?: string;
}

/**
 * Respuesta de GET/PUT `/v1/config/acceso-nomina` y
 * `/v1/config/acceso-gastos-personales` (la misma forma).
 */
export interface AccesoPorPersona {
  /** Ids guardados en la lista. */
  usuario_ids: string[];
  /** Los que el API pudo nombrar (también quien ya se dio de baja). */
  usuarios: { id: string; nombre: string }[];
  /** Administración ACTIVA: a quién se le puede dar el acceso. */
  candidatos: PersonaAcceso[];
  /** Oficina activa que ya entra por su rol (informativo). */
  por_rol?: PersonaAcceso[];
  /** ¿Quien consulta puede cambiarla? (= es de Dirección). */
  puede_modificar: boolean;
  /** Sello de la lista: se regresa tal cual en el PUT (`null` = nunca guardada). */
  version?: string | null;
  actualizado_at?: string | null;
  actualizado_por_nombre?: string | null;
}

// ═══════════════════════════════ Los módulos ═══════════════════════════════

/**
 * Los módulos con acceso por persona, en el orden en que salen en
 * Configuración. El id ES la llave del permiso en `/me.permisos`.
 */
export const IDS_ACCESO_POR_PERSONA = ["nomina", "gastos_personales"] as const;

export type IdAccesoPorPersona = (typeof IDS_ACCESO_POR_PERSONA)[number];

/** Lo ÚNICO que cambia de una tarjeta a otra. */
export interface ModuloAccesoPorPersona {
  id: IdAccesoPorPersona;
  /** Clave de la fila en `configuracion_sistema` (tiene sección propia). */
  clave: string;
  /** Ruta del API de la lista (GET y PUT). */
  ruta: string;
  /** Nombre del módulo dentro de una frase: «Nómina», «Gastos personales». */
  nombre: string;
  /** Título de la tarjeta. */
  titulo: string;
  /** Qué abre, que se puede quitar cuando sea y qué NO abre. */
  descripcion: string;
  /** Código del 403 propio del PUT (quien guarda no es de Dirección). */
  codigoSoloDireccion: string;
  /** Código del 409 (otro de Dirección cambió la lista después). */
  codigoCambio: string;
}

export const MODULOS_ACCESO_POR_PERSONA: Readonly<
  Record<IdAccesoPorPersona, ModuloAccesoPorPersona>
> = {
  nomina: {
    id: "nomina",
    clave: "acceso_nomina",
    ruta: "/v1/config/acceso-nomina",
    nombre: "Nómina",
    titulo: "Acceso a Nómina",
    descripcion:
      "A quién de Administración le das entrada al módulo de Nómina: ver los pagos, registrarlos, repartirlos entre aviones y exportarlos. Enciéndelo o apágalo cuando quieras (por ejemplo, si el acceso es solo por un tiempo); aplica en cuanto guardas. No abre los gastos personales ni los demás módulos de Dirección.",
    codigoSoloDireccion: "SOLO_DIRECCION_ACCESO_NOMINA",
    codigoCambio: "ACCESO_NOMINA_CAMBIO",
  },
  gastos_personales: {
    id: "gastos_personales",
    clave: "acceso_gastos_personales",
    ruta: "/v1/config/acceso-gastos-personales",
    nombre: "Gastos personales",
    titulo: "Acceso a Gastos personales",
    descripcion:
      "A quién de Administración le das entrada al módulo de Gastos personales: ver los gastos personales del dueño, registrarlos, corregirlos y exportarlos. Enciéndelo o apágalo cuando quieras (por ejemplo, si el acceso es solo por un tiempo); aplica en cuanto guardas. No abre la Nómina ni los demás módulos de Dirección.",
    codigoSoloDireccion: "SOLO_DIRECCION_ACCESO_GASTOS_PERSONALES",
    codigoCambio: "ACCESO_GASTOS_PERSONALES_CAMBIO",
  },
};

export function esIdAccesoPorPersona(v: unknown): v is IdAccesoPorPersona {
  return typeof v === "string" && (IDS_ACCESO_POR_PERSONA as readonly string[]).includes(v);
}

/**
 * El módulo de un id. `null` si el id no es de los nuestros: a una server
 * action le llega del navegador, así que jamás se indexa a ciegas.
 */
export function moduloAccesoPorPersona(id: unknown): ModuloAccesoPorPersona | null {
  return esIdAccesoPorPersona(id) ? MODULOS_ACCESO_POR_PERSONA[id] : null;
}

/** Las claves de `configuracion_sistema` de estas listas (no son banderas). */
export const CLAVES_CONFIG_ACCESO_POR_PERSONA: readonly string[] = IDS_ACCESO_POR_PERSONA.map(
  (id) => MODULOS_ACCESO_POR_PERSONA[id].clave,
);

// ═══════════════════════════════ Textos ═══════════════════════════════

export const TEXTO_ACCESO_SOLO_DIRECCION = "Solo Dirección puede cambiar quién entra.";

export const TEXTO_ACCESO_SIN_CANDIDATOS = "No hay usuarios activos de Administración.";

export const TEXTO_ACCESO_NO_DISPONIBLE = "Disponible cuando se actualice el API.";

/** «quién entra a Nómina»: cómo se nombra la lista cuando no se pudo cargar. */
export function etiquetaCargaAcceso(m: ModuloAccesoPorPersona): string {
  return `quién entra a ${m.nombre}`;
}

export function textoAccesoFallo(m: ModuloAccesoPorPersona): string {
  return `No se pudo cargar ${etiquetaCargaAcceso(m)}. Recarga la página para reintentar.`;
}

export function tituloConfirmarAcceso(m: ModuloAccesoPorPersona): string {
  return `¿Cambiar quién entra a ${m.nombre}?`;
}

const SIN_NOMBRE = "un usuario dado de baja";

/** Nombre de un id: candidato → resuelto por el API → «un usuario dado de baja». */
export function nombreDeAcceso(
  datos: Pick<AccesoPorPersona, "usuarios" | "candidatos">,
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
  datos: Pick<AccesoPorPersona, "usuario_ids" | "usuarios" | "candidatos">,
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
  datos: Pick<AccesoPorPersona, "usuario_ids" | "usuarios" | "candidatos">,
): string[] {
  const candidatos = new Set(datos.candidatos.map((c) => c.id));
  return datos.usuario_ids
    .filter((id) => !candidatos.has(id))
    .map((id) => nombreDeAcceso(datos, id));
}

/** «Con acceso dado aquí: Mary Cruz.» / «Hoy nadie de Administración entra a Nómina.» */
export function textoAccesoActual(m: ModuloAccesoPorPersona, nombres: readonly string[]): string {
  const quienes = unirNombres(nombres);
  return quienes
    ? `Con acceso dado aquí: ${quienes}.`
    : `Hoy nadie de Administración entra a ${m.nombre}.`;
}

/** «Por su rol entran siempre: Alejandro Canales, Diego Ramírez y Pablo Canales.» (sin nadie ⇒ null). */
export function textoEntranPorRol(
  porRol: readonly PersonaAcceso[] | null | undefined,
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
  candidatos: readonly PersonaAcceso[],
): string[] {
  const validos = new Set(candidatos.map((c) => c.id));
  return [...new Set(elegidos)]
    .filter((id) => validos.has(id))
    .slice(0, TOPE_ACCESO_POR_PERSONA);
}

/** Qué cambia entre lo guardado y lo que se va a guardar. */
export function diffAcceso(
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
export function textoConfirmarAcceso(
  m: ModuloAccesoPorPersona,
  input: { agregados: readonly string[]; quitados: readonly string[] },
): string {
  const partes: string[] = [];
  const entran = unirNombres(input.agregados);
  const salen = unirNombres(input.quitados);
  if (entran) partes.push(`Podrán entrar a ${m.nombre}: ${entran}.`);
  if (salen) partes.push(`Dejarán de entrar: ${salen}.`);
  partes.push("Aplica de inmediato; lo puedes cambiar cuando quieras.");
  return partes.join(" ");
}

/** Aviso tras guardar: quién quedó con acceso y cuándo lo verá. */
export function textoGuardadoAcceso(m: ModuloAccesoPorPersona, nombres: readonly string[]): string {
  const quienes = unirNombres(nombres);
  return quienes
    ? `Guardado. Con acceso a ${m.nombre}: ${quienes}. Lo verán en su menú al recargar la página.`
    : `Guardado. Nadie de Administración entra a ${m.nombre}.`;
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

/** Respaldo en es-MX de cada código propio del PUT de ESE módulo. */
export function erroresAcceso(m: ModuloAccesoPorPersona): Record<string, string> {
  return {
    [m.codigoSoloDireccion]: `Solo Dirección puede cambiar quién entra a ${m.nombre}.`,
    USUARIOS_INVALIDOS:
      "Alguno de los usuarios elegidos ya no es de Administración activa. Recarga la página.",
    [m.codigoCambio]: `Alguien más cambió quién entra a ${m.nombre} mientras lo editabas. Recarga y vuelve a intentar.`,
  };
}

export const TEXTO_ACCESO_API_VIEJO =
  "Falta actualizar el API para guardar este acceso. Avisa a sistemas.";

export const TEXTO_ACCESO_MODULO_DESCONOCIDO =
  "No se reconoció qué acceso se quería guardar. Recarga la página.";

export function textoAccesoError(m: ModuloAccesoPorPersona): string {
  return `No se pudo guardar el acceso a ${m.nombre}.`;
}

/**
 * Mensaje legible de un rechazo del PUT. Se decide por CÓDIGO; el texto del
 * API manda cuando el código es de los nuestros (es-MX). Un 403 sin código
 * propio es el del guard de roles (texto técnico en inglés): se dice en
 * claro. Un 404 es un API sin desplegar.
 */
export function mensajeErrorAcceso(
  m: ModuloAccesoPorPersona,
  input: { code?: string; status?: number; error?: string | null },
): string {
  const api = input.error?.trim();
  const propios = erroresAcceso(m);
  if (input.code && Object.prototype.hasOwnProperty.call(propios, input.code)) {
    return api || propios[input.code];
  }
  if (input.status === 403) return propios[m.codigoSoloDireccion];
  if (input.status === 404) return TEXTO_ACCESO_API_VIEJO;
  return textoAccesoError(m);
}

/** ¿El rechazo pide repintar la sección con lo que hay hoy en el API? */
export function errorAccesoPideRecargar(
  m: ModuloAccesoPorPersona,
  input: { code?: string; status?: number },
): boolean {
  return (
    input.status === 403 ||
    input.code === m.codigoCambio ||
    input.code === "USUARIOS_INVALIDOS" ||
    input.code === m.codigoSoloDireccion
  );
}
