/**
 * CAMBIAR EL CLIENTE de un vuelo / cotización que ya existe (27-nov-2026).
 *
 * Pedido de la oficina (Itzel y Jimmy, WhatsApp): «Nos podrían habilitar
 * cambiar de cliente cuando un vuelo o cotización ya existe? porque no nos
 * deja». La regla y los avisos son del API (`PATCH /v1/flights/:id/cliente`,
 * `FlightsService.cambiarCliente`); aquí viven SOLO los textos y las
 * decisiones de pantalla, PUROS (sin React), con test.
 *
 * Lo que el operador tiene que entender antes de confirmar:
 *  - cambia de QUIÉN es el vuelo (lista, PDF, recibos, ID del vuelo);
 *  - el PRECIO no cambia: la cotización conserva lo pactado; si el cliente
 *    nuevo tiene otra tarifa, el API lo avisa DESPUÉS de guardar;
 *  - queda anotado quién lo cambió y cuándo (notas internas del vuelo).
 */
import { ROLES_EDITAN_COTIZACION } from "@/lib/admin/quote-sheet-interna";

/** Respuesta de `PATCH /v1/flights/:id/cliente` (lo que el panel usa). */
export interface ResultadoCambioCliente {
  id: string;
  folio: number;
  cliente_id: string;
  /** true = ya era ese cliente: el API no escribió nada. */
  sin_cambio: boolean;
  /** Avisos ámbar del API (tarifa preferencial, interno, broker, recibos…). */
  avisos: string[];
  cliente_anterior: { id: string | null; nombre: string | null };
  cliente: { id: string; nombre: string | null };
}

/** Cliente del catálogo que ofrece el diálogo. */
export interface ClienteParaCambio {
  id: string;
  nombre: string;
  es_broker?: boolean | null;
  es_interno?: boolean | null;
}

/**
 * Quién ve «Cambiar cliente»: los mismos roles que GUARDAN una cotización
 * (`@Roles(ADMIN, COORDINADOR)` del endpoint; DIRECCION pasa el guard). Sin
 * rol (`/me` falló) NO se ofrece: es un botón nuevo y el API decidiría igual,
 * pero un botón que siempre rebota confunde.
 */
export function puedeCambiarCliente(rol: string | null | undefined): boolean {
  return !!rol && ROLES_EDITAN_COTIZACION.has(rol.toUpperCase());
}

export const ETIQUETA_CAMBIAR_CLIENTE = "Cambiar cliente";
export const TITULO_BOTON_CAMBIAR_CLIENTE =
  "Cambia de quién es este vuelo. El precio de la cotización no se mueve.";

/** Con cambios sin guardar en la cotización, primero se guardan o descartan. */
export const TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS =
  "Guarda o descarta primero tus cambios de la cotización; después cambia el cliente.";

export const ETIQUETA_SELECTOR_CLIENTE = "Cliente nuevo";
export const PLACEHOLDER_SELECTOR_CLIENTE = "Elige el cliente";
export const TEXTO_CARGANDO_CLIENTES = "Cargando clientes…";
export const TEXTO_CLIENTES_NO_CARGARON =
  "No se pudieron cargar los clientes. Pulsa «Reintentar».";
export const TEXTO_SIN_OTROS_CLIENTES =
  "No hay otro cliente activo que elegir. Da de alta al cliente en Clientes y vuelve.";

/** «¿Cambiar el cliente del vuelo #501?» / «…de la cotización #501?». */
export function tituloCambiarCliente(p: {
  folio: number | string;
  esCotizacion?: boolean;
}): string {
  return p.esCotizacion
    ? `Cambiar el cliente de la cotización #${p.folio}`
    : `Cambiar el cliente del vuelo #${p.folio}`;
}

/** Lo que NO cambia y lo que sí — se lee antes de elegir. */
export const EXPLICACION_CAMBIAR_CLIENTE =
  "Cambia de quién es el vuelo: así saldrá en las listas, el PDF, los recibos y el ID del vuelo. El precio NO cambia: la cotización conserva lo pactado. Queda anotado quién hizo el cambio y cuándo.";

/**
 * Hijo de una cotización de GRUPO: el cliente es del grupo completo. El API
 * lo rechaza (409 `VUELO_DE_GRUPO`); el diálogo lo dice sin ofrecer el botón.
 */
export function bloqueoCambiarClientePorGrupo(
  grupoFolio: number | string | null | undefined,
): string {
  const g = grupoFolio != null && grupoFolio !== "" ? ` G-${grupoFolio}` : "";
  return `Este vuelo es parte de la cotización de grupo${g}: el cliente es el del grupo completo y no se cambia avión por avión.`;
}

const nombreDe = (n: string | null | undefined, respaldo: string): string => {
  const t = (n ?? "").trim();
  return t || respaldo;
};

/** Resumen que acompaña al botón de confirmar: «De: A → A: B». */
export function resumenCambioCliente(p: {
  anterior: string | null | undefined;
  nuevo: string | null | undefined;
}): { de: string; a: string } {
  return {
    de: nombreDe(p.anterior, "Sin cliente"),
    a: nombreDe(p.nuevo, "—"),
  };
}

/** Marca de la opción en el selector («Broker», «Interno · operación propia»). */
export function descripcionClienteOpcion(c: ClienteParaCambio): string | undefined {
  const marcas: string[] = [];
  if (c.es_interno) marcas.push("Interno · operación propia");
  if (c.es_broker) marcas.push("Broker");
  return marcas.length > 0 ? marcas.join(" · ") : undefined;
}

/**
 * Opciones del selector: el catálogo SIN el cliente actual (elegir el mismo
 * no cambia nada), en orden alfabético es-MX.
 */
export function opcionesClienteParaCambio(
  clientes: readonly ClienteParaCambio[],
  clienteActualId: string | null | undefined,
): { value: string; label: string; description?: string }[] {
  return clientes
    .filter((c) => c.id !== clienteActualId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX", { sensitivity: "base" }))
    .map((c) => ({
      value: c.id,
      label: c.nombre,
      description: descripcionClienteOpcion(c),
    }));
}

/** Toast de éxito. `sin_cambio` (ya era ese cliente) no presume un cambio. */
export function toastCambioCliente(
  r: Pick<ResultadoCambioCliente, "folio" | "sin_cambio" | "cliente">,
): string {
  const nombre = nombreDe(r.cliente?.nombre, "el cliente elegido");
  return r.sin_cambio
    ? `El vuelo #${r.folio} ya era de ${nombre}: no se cambió nada.`
    : `Vuelo #${r.folio}: ahora es de ${nombre}. El precio no cambió.`;
}

/** Respaldo en es-MX por código, para cuando el API no manda texto. */
const RESPALDO_POR_CODIGO: Record<string, string> = {
  CLIENTE_NO_EXISTE:
    "El cliente elegido ya no existe. Elige otro cliente y vuelve a intentar.",
  CLIENTE_INACTIVO:
    "Ese cliente está dado de baja: reactívalo en Clientes o elige otro.",
  VUELO_FACTURADO:
    "El vuelo ya tiene factura a nombre de su cliente: cancela la factura antes de cambiar el cliente.",
  VUELO_DE_GRUPO:
    "Este vuelo es parte de una cotización de grupo: el cliente es el del grupo completo.",
  MES_CERRADO:
    "El mes de este vuelo ya está cerrado. Reábrelo en Reportes para corregir.",
  CONFLICTO_VERSION:
    "Alguien modificó este vuelo mientras lo tenías abierto. Cierra, revisa cómo quedó y vuelve a intentar.",
  VUELO_NO_EXISTE: "Este vuelo ya no existe.",
};

export const TEXTO_CAMBIAR_CLIENTE_API_VIEJO =
  "Esta opción necesita la versión nueva del sistema (API). Avisa a sistemas; no se cambió nada.";

/**
 * Texto del rechazo: manda el MENSAJE del API (es quien nombra la factura, el
 * grupo o el mes); por código hay respaldo. Un 404 SIN código es la RUTA que
 * no existe (API sin desplegar) — nunca «el vuelo no existe».
 */
export function mensajeErrorCambioCliente(e: {
  code?: string | null;
  error?: string | null;
  status?: number | null;
}): string {
  const code = (e.code ?? "").trim();
  const texto = (e.error ?? "").trim();
  const esRutaInexistente =
    e.status === 404 && !RESPALDO_POR_CODIGO[code] && /cannot patch/i.test(texto);
  if (esRutaInexistente) return TEXTO_CAMBIAR_CLIENTE_API_VIEJO;
  if (texto && !/cannot patch/i.test(texto)) return texto;
  return RESPALDO_POR_CODIGO[code] ?? "No se pudo cambiar el cliente. Intenta de nuevo.";
}

/** ¿El rechazo pide recargar la pantalla (lo que se ve ya no es lo guardado)? */
export function errorCambioClientePideRecargar(code: string | null | undefined): boolean {
  return code === "CONFLICTO_VERSION" || code === "VUELO_NO_EXISTE";
}
