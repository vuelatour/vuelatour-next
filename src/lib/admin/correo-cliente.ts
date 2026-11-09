/**
 * CORREOS AL CLIENTE — reglas y textos PUROS del panel (9-nov-2026, API
 * 0.0.133). Fuente única de: roles, etiquetas y colores del estado, la línea
 * de cada envío, los textos de la card «Correo al cliente», de la vista
 * previa, del reenvío y de la pantalla «Correos enviados». Ningún componente
 * redacta estas frases a mano.
 *
 * Por qué existe: el API mandaba SOLO un «Vuelo confirmado» al cliente al
 * confirmar la cotización y la oficina lo descubrió por accidente. Pidieron:
 * «que se cancele el envío automático; que solo se mande cuando ellos le den
 * en enviar de forma manual, solo si se requiere, y saber si se mandó o no y
 * con qué contenido» y «¿en dónde veo que se enviaron? ¿desde qué correo?».
 * Desde el 0.0.133 el API no manda nada al confirmar: el correo sale solo
 * cuando alguien lo pide aquí, después de ver la vista previa.
 *
 * El panel SOLO pinta: si se puede enviar (estado del vuelo, correo del
 * cliente, servicio apagado) lo decide el API (`puede_enviar` + `motivo`).
 * Los 409 se leen por `code`, nunca por el texto del mensaje.
 *
 * PURO (sin React ni red): `__tests__/correo-cliente.test.ts`.
 */
import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { esDiaValido, esUuid, rangoFiltro } from "@/lib/admin/url-params";
import type { Rol } from "@/types/me";
import type {
  CodigoCorreoNoEnviable,
  CorreoCliente,
  EnvioCorreoConfirmacion,
  UltimoEnvioCorreo,
  VistaPreviaCorreoConfirmacion,
} from "@/types/correos-cliente";

// ═══════════════════════════════ Roles ═══════════════════════════════

/**
 * Quién VE los correos (espejo del `@Roles` de los GET del API, con
 * `DIRECCION` explícito como en las demás listas del panel). También es la
 * lista del ítem «Correos enviados» del menú.
 */
export const ROLES_VEN_CORREOS_CLIENTE = [
  "DIRECCION",
  "ADMIN",
  "COORDINADOR",
  "FACTURACION",
  "ANALISTA",
] as const satisfies readonly Rol[];

/** Quién ENVÍA (espejo del `@Roles` del POST). */
export const ROLES_ENVIAN_CORREO_CLIENTE = [
  "DIRECCION",
  "ADMIN",
  "COORDINADOR",
] as const satisfies readonly Rol[];

export function puedeVerCorreosCliente(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_VEN_CORREOS_CLIENTE as readonly string[]).includes(rol);
}

/**
 * Sin rol (`/me` falló) NO se ofrece enviar: es un correo que le llega al
 * cliente, así que la duda se resuelve a favor de no mandarlo.
 */
export function puedeEnviarCorreoCliente(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_ENVIAN_CORREO_CLIENTE as readonly string[]).includes(rol);
}

// ═══════════════════════════════ Textos fijos ═══════════════════════════════

export const TITULO_CORREO_CLIENTE = "Correo al cliente";
/** La leyenda que la oficina pidió ver siempre: nada sale solo. */
export const LEYENDA_CORREO_MANUAL =
  "Los correos al cliente NO se envían solos. Solo sale uno cuando alguien pulsa Enviar aquí.";
export const TEXTO_SIN_CORREOS = "No se le ha enviado ningún correo al cliente.";
/** La lectura falló: NO es lo mismo que «no se ha enviado nada». */
export const TEXTO_HISTORIAL_NO_CARGO =
  "No se pudo consultar si ya se le envió un correo al cliente. No significa que no se haya enviado: pulsa Reintentar.";
/** El API todavía no tiene las rutas (panel desplegado antes que el API). */
export const TEXTO_CORREOS_NO_DISPONIBLE =
  "El registro de correos al cliente todavía no está disponible: el sistema se está actualizando. Vuelve a intentarlo en unos minutos.";
export const TEXTO_SOLO_LECTURA_CORREO =
  "Solo Dirección, Administración y Coordinación pueden enviar correos al cliente.";

export const BOTON_ENVIAR_CONFIRMACION = "Enviar confirmación al cliente";
export const BOTON_VER_CONTENIDO = "Ver contenido";
export const BOTON_CANCELAR_ENVIO = "Cancelar";
export const BOTON_CERRAR = "Cerrar";
export const BOTON_REINTENTAR = "Reintentar";
export const TEXTO_ENVIANDO = "Enviando…";

export const TITULO_VISTA_PREVIA = "Enviar confirmación al cliente";
export const DESCRIPCION_VISTA_PREVIA =
  "Revisa el correo antes de mandarlo. No se envía nada hasta que pulses el botón de abajo.";
export const TEXTO_CARGANDO_VISTA_PREVIA = "Preparando la vista previa del correo…";
export const TITULO_CONTENIDO_CORREO = "Contenido del correo";
export const DESCRIPCION_CONTENIDO_ENVIADO = "Esto es exactamente lo que se le mandó al cliente.";
export const DESCRIPCION_CONTENIDO_FALLIDO =
  "Esto es lo que se intentó mandar. El correo NO le llegó al cliente.";
export const TEXTO_SIN_CONTENIDO = "Este correo no tiene contenido guardado.";
/** `title` del iframe (lectores de pantalla). */
export const TITULO_MARCO_CORREO = "Contenido del correo (solo lectura)";

export const ETIQUETA_DE = "De";
export const ETIQUETA_PARA = "Para";
export const ETIQUETA_ASUNTO = "Asunto";

/**
 * Descripción del toast al CONFIRMAR una cotización: antes ese clic mandaba
 * el correo; ahora hay que decir que no salió nada y dónde pedirlo.
 */
export const DESCRIPCION_TOAST_CONFIRMAR =
  "No se envió ningún correo al cliente. Si lo necesitas, usa «Enviar confirmación al cliente».";
/** Lo mismo al confirmar un GRUPO (antes salía un correo por cada avión). */
export const DESCRIPCION_TOAST_CONFIRMAR_GRUPO =
  "No se envió ningún correo al cliente. Si lo necesitas, envíalo desde «Correo al cliente» en el vuelo de cada avión.";

// ═══════════════════════════════ Piezas ═══════════════════════════════

/** Nombre legible o null: vacío, solo espacios o un uuid NO se pintan. */
export function nombreLimpio(nombre: string | null | undefined): string | null {
  const n = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
  if (!n || esUuid(n)) return null;
  return n;
}

/** «#412» o «—» (un correo de un vuelo que ya no existe llega sin folio). */
export function folioTexto(folio: number | null | undefined): string {
  return typeof folio === "number" && Number.isFinite(folio) ? `#${folio}` : "—";
}

/** A dónde lleva el folio de la tabla «Correos enviados». */
export function hrefVueloDeCorreo(correo: Pick<CorreoCliente, "vuelo_id">): string {
  return `/admin/flights/${correo.vuelo_id}`;
}

const ETIQUETA_TIPO: Record<string, string> = {
  CONFIRMACION_VUELO: "Confirmación del vuelo",
};

/** Tipo del correo en es-MX; un tipo que el panel aún no conoce sale tal cual. */
export function etiquetaTipoCorreo(tipo: string | null | undefined): string {
  if (!tipo) return "Correo";
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

// ═══════════════════════════════ Estado ═══════════════════════════════

export const ETIQUETA_ENVIADO = "Enviado";
export const ETIQUETA_FALLIDO = "No se envió";

const CLASE_ENVIADO =
  "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
const CLASE_FALLIDO = "bg-destructive/10 text-destructive border-destructive/40";
const CLASE_DESCONOCIDO = "border-border text-muted-foreground";

export function esCorreoFallido(correo: Pick<CorreoCliente, "estado">): boolean {
  return correo.estado === "FALLIDO";
}

/** Etiqueta y color del badge: ENVIADO verde, FALLIDO rojo. */
export function estadoCorreoUi(estado: string | null | undefined): { label: string; cls: string } {
  if (estado === "ENVIADO") return { label: ETIQUETA_ENVIADO, cls: CLASE_ENVIADO };
  if (estado === "FALLIDO") return { label: ETIQUETA_FALLIDO, cls: CLASE_FALLIDO };
  // Estado que el panel aún no conoce: se pinta tal cual, sin color de éxito.
  return { label: estado || "—", cls: CLASE_DESCONOCIDO };
}

/**
 * La línea de un envío: «Enviado el 09/11/2026, 10:40 a.m. por Itzel a
 * correo@x.com». Un FALLIDO lo dice desde la primera palabra: «No se envió:
 * intento del 09/11/2026, 10:40 a.m. por Itzel a correo@x.com». Sin nombre
 * (usuario que ya no existe) se omite el «por …»; nunca un uuid.
 */
export function lineaEnvio(
  correo: Pick<CorreoCliente, "estado" | "created_at" | "enviado_por_nombre" | "destinatario">,
): string {
  const cuando = fmtDateTime(correo.created_at);
  const quien = nombreLimpio(correo.enviado_por_nombre);
  const cola = `${quien ? ` por ${quien}` : ""} a ${correo.destinatario?.trim() || "—"}`;
  return esCorreoFallido(correo)
    ? `No se envió: intento del ${cuando}${cola}`
    : `Enviado el ${cuando}${cola}`;
}

/** «Motivo: …» de un FALLIDO (null si el correo sí salió). */
export function textoErrorCorreo(correo: Pick<CorreoCliente, "estado" | "error">): string | null {
  if (!esCorreoFallido(correo)) return null;
  const error = correo.error?.trim();
  return error ? `Motivo: ${error}` : "Motivo: el servicio de correo no dio más detalle.";
}

/** Cuántos salieron y cuántos fallaron (para el resumen de la card). */
export function contarCorreos(correos: readonly Pick<CorreoCliente, "estado">[]): {
  enviados: number;
  fallidos: number;
} {
  let enviados = 0;
  let fallidos = 0;
  for (const c of correos) {
    if (c.estado === "ENVIADO") enviados++;
    else if (c.estado === "FALLIDO") fallidos++;
  }
  return { enviados, fallidos };
}

/**
 * Resumen de la card: «Se le ha enviado 1 correo al cliente.» / «… 2 correos
 * …». Con puros fallidos lo dice sin rodeos: al cliente NO le ha llegado nada.
 */
export function textoResumenCorreos(correos: readonly Pick<CorreoCliente, "estado">[]): string {
  const { enviados, fallidos } = contarCorreos(correos);
  if (enviados === 0 && fallidos === 0) return TEXTO_SIN_CORREOS;
  if (enviados === 0) {
    return fallidos === 1
      ? "Al cliente no le ha llegado ningún correo: el único intento falló."
      : `Al cliente no le ha llegado ningún correo: los ${fallidos} intentos fallaron.`;
  }
  const base =
    enviados === 1
      ? "Se le ha enviado 1 correo al cliente."
      : `Se le han enviado ${enviados} correos al cliente.`;
  if (fallidos === 0) return base;
  return `${base} ${fallidos === 1 ? "Otro intento falló." : `Otros ${fallidos} intentos fallaron.`}`;
}

/** «De»: desde qué correo salió (la pregunta de la oficina). */
export function textoRemitente(remitente: string | null | undefined): string {
  return remitente?.trim() || "—";
}

/** «Para»: el correo y, si se sabe, de quién es: «ana@x.com (Ana Ruiz)». */
export function textoDestinatario(
  destinatario: string | null | undefined,
  clienteNombre?: string | null,
): string {
  const correo = destinatario?.trim();
  if (!correo) return "—";
  const nombre = nombreLimpio(clienteNombre);
  return nombre ? `${correo} (${nombre})` : correo;
}

// ═══════════════════════════════ Vista previa y envío ═══════════════════════════════

const MOTIVO_POR_CODIGO: Record<CodigoCorreoNoEnviable, string> = {
  SIN_CLIENTE: "Esta cotización no tiene cliente: no hay a quién enviarle el correo.",
  SIN_EMAIL:
    "El cliente no tiene correo capturado. Agrégalo en Clientes y vuelve a intentarlo.",
  ESTADO_NO_CONFIRMADO:
    "La confirmación solo se puede enviar cuando el vuelo está confirmado o en reserva.",
  CORREO_APAGADO:
    "El envío de correos está apagado en el sistema. Avisa a sistemas para encenderlo.",
};
const MOTIVO_GENERICO = "Por ahora no se puede enviar este correo.";

/**
 * Por qué no se puede enviar. Manda el `motivo` del API (ya viene en es-MX);
 * si no llegó, el texto del `codigo`; y si tampoco, uno genérico.
 */
export function motivoNoEnviable(
  dato: { codigo?: string | null; motivo?: string | null } | null | undefined,
): string {
  const motivo = dato?.motivo?.trim();
  if (motivo) return motivo;
  const codigo = dato?.codigo;
  return (codigo && (MOTIVO_POR_CODIGO as Record<string, string>)[codigo]) || MOTIVO_GENERICO;
}

/** ¿Este vuelo ya tiene un correo ENVIADO? (el siguiente es un reenvío). */
export function esReenvio(
  vista: Pick<VistaPreviaCorreoConfirmacion, "enviados"> | null | undefined,
): boolean {
  return Number(vista?.enviados) > 0;
}

/** Botón que envía: «Enviar correo» o, si ya salió uno, «Enviar otra vez». */
export function textoBotonEnviar(reenvio: boolean): string {
  return reenvio ? "Enviar otra vez" : "Enviar correo";
}

/**
 * Aviso ámbar del reenvío: «Ya se envió el 09/11/2026, 10:40 a.m. por Itzel a
 * correo@x.com. ¿Enviarlo otra vez?». Con varios envíos dice cuántos y cuándo
 * fue el último. Sin el dato del último envío no inventa fecha.
 */
export function avisoReenvio(
  ultimo: UltimoEnvioCorreo | null | undefined,
  enviados?: number | null,
): string {
  const pregunta = "¿Enviarlo otra vez?";
  if (!ultimo || !ultimo.created_at) {
    return `Este correo ya se le envió al cliente. ${pregunta}`;
  }
  const quien = nombreLimpio(ultimo.enviado_por_nombre);
  const detalle = `el ${fmtDateTime(ultimo.created_at)}${quien ? ` por ${quien}` : ""}${
    ultimo.destinatario?.trim() ? ` a ${ultimo.destinatario.trim()}` : ""
  }`;
  const n = Number(enviados);
  return n > 1
    ? `Ya se envió ${n} veces; la última, ${detalle}. ${pregunta}`
    : `Ya se envió ${detalle}. ${pregunta}`;
}

/** `details.ultimo_envio` del 409 `CORREO_YA_ENVIADO`, leído sin confiar en la forma. */
export function ultimoEnvioDeDetalles(details: unknown): UltimoEnvioCorreo | null {
  const u = (details as { ultimo_envio?: unknown } | null | undefined)?.ultimo_envio;
  if (!u || typeof u !== "object") return null;
  const { created_at, enviado_por_nombre, destinatario } = u as Record<string, unknown>;
  if (typeof created_at !== "string" || !created_at) return null;
  return {
    created_at,
    enviado_por_nombre: typeof enviado_por_nombre === "string" ? enviado_por_nombre : null,
    destinatario: typeof destinatario === "string" ? destinatario : "",
  };
}

export const CODIGO_CORREO_YA_ENVIADO = "CORREO_YA_ENVIADO";
export const CODIGO_CORREO_NO_ENVIABLE = "CORREO_NO_ENVIABLE";

export const MENSAJE_ENVIADO_DEFAULT = "Correo enviado al cliente.";
export const MENSAJE_FALLIDO_DEFAULT =
  "No se pudo enviar el correo. Quedó registrado como «No se envió»; puedes intentarlo otra vez.";
export const MENSAJE_ENVIO_NO_DISPONIBLE =
  "El envío de correos todavía no está disponible: el sistema se está actualizando. Vuelve a intentarlo en unos minutos.";
export const MENSAJE_ENVIO_SIN_PERMISO = "Tu usuario no puede enviar correos al cliente.";
export const MENSAJE_ENVIO_INCIERTO =
  "No se pudo confirmar si el correo se envió (el sistema no respondió). Revisa la lista de envíos antes de intentarlo otra vez.";
export const MENSAJE_VISTA_PREVIA_ERROR =
  "No se pudo preparar la vista previa del correo. No se envió nada; intenta de nuevo.";
export const MENSAJE_VISTA_PREVIA_SIN_PERMISO = "Tu usuario no puede ver los correos al cliente.";

/** Lo que devuelve una server action del panel (subconjunto de `ActionResult`). */
export interface RespuestaAccion<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  code?: string;
  details?: unknown;
}

/** Qué pasó al pedir el ENVÍO, ya clasificado para pintarlo. */
export type ResultadoEnvioCorreo =
  /** Salió: toast verde con el mensaje del API. */
  | { tipo: "enviado"; mensaje: string }
  /** El proveedor falló: quedó como FALLIDO; mensaje en rojo + «Motivo: …». */
  | { tipo: "fallido"; mensaje: string; motivo: string | null }
  /** 409 `CORREO_YA_ENVIADO`: alguien ya lo mandó; se pregunta por el reenvío. */
  | { tipo: "ya-enviado"; ultimo: UltimoEnvioCorreo | null }
  /** 409 `CORREO_NO_ENVIABLE`: ya no se puede (sin correo, estado…). */
  | { tipo: "no-enviable"; mensaje: string }
  /** No se sabe si salió (red/5xx) o el API lo rechazó por otra razón. */
  | { tipo: "error"; mensaje: string };

/**
 * Clasifica la respuesta del POST. Los 409 se distinguen por `code` (NUNCA
 * por el texto del mensaje). Un 5xx o un fallo de red es INCIERTO: no se
 * afirma que no salió, se manda a revisar la lista.
 */
export function resultadoEnvio(
  res: RespuestaAccion<EnvioCorreoConfirmacion> | null | undefined,
): ResultadoEnvioCorreo {
  if (res?.ok) {
    const mensaje = res.data?.mensaje?.trim();
    if (res.data?.enviado === true) {
      return { tipo: "enviado", mensaje: mensaje || MENSAJE_ENVIADO_DEFAULT };
    }
    return {
      tipo: "fallido",
      mensaje: mensaje || MENSAJE_FALLIDO_DEFAULT,
      // La línea «Motivo: …» ya redactada (null si el API no mandó el registro).
      motivo: res.data?.correo
        ? textoErrorCorreo({ estado: "FALLIDO", error: res.data.correo.error })
        : null,
    };
  }
  if (res?.code === CODIGO_CORREO_YA_ENVIADO) {
    return { tipo: "ya-enviado", ultimo: ultimoEnvioDeDetalles(res.details) };
  }
  if (res?.code === CODIGO_CORREO_NO_ENVIABLE) {
    const codigo = (res.details as { codigo?: unknown } | null | undefined)?.codigo;
    return {
      tipo: "no-enviable",
      mensaje: motivoNoEnviable({
        motivo: res.error,
        codigo: typeof codigo === "string" ? codigo : null,
      }),
    };
  }
  if (res?.status === 404) return { tipo: "error", mensaje: MENSAJE_ENVIO_NO_DISPONIBLE };
  if (res?.status === 401 || res?.status === 403) {
    return { tipo: "error", mensaje: MENSAJE_ENVIO_SIN_PERMISO };
  }
  // 4xx restante: el API lo rechazó y dice por qué. Sin status o 5xx: incierto.
  const status = res?.status;
  if (typeof status === "number" && status >= 400 && status < 500 && res?.error?.trim()) {
    return { tipo: "error", mensaje: res.error.trim() };
  }
  return { tipo: "error", mensaje: MENSAJE_ENVIO_INCIERTO };
}

/** Texto cuando la VISTA PREVIA no cargó (ahí nunca se envió nada). */
export function errorVistaPrevia(
  res: Pick<RespuestaAccion<unknown>, "status"> | null | undefined,
): string {
  if (res?.status === 404) return MENSAJE_ENVIO_NO_DISPONIBLE;
  if (res?.status === 401 || res?.status === 403) return MENSAJE_VISTA_PREVIA_SIN_PERMISO;
  return MENSAJE_VISTA_PREVIA_ERROR;
}

// ═══════════════════════════════ Pantalla «Correos enviados» ═══════════════════════════════

export const TITULO_CORREOS_ENVIADOS = "Correos enviados";
export const DESCRIPCION_CORREOS_ENVIADOS =
  "Todos los correos que se le han mandado a los clientes: cuándo, a quién, desde qué correo, quién lo envió y con qué contenido.";
/** Tope que se le pide al API (`limite`); si hay más, el API marca `truncado`. */
export const LIMITE_CORREOS_ENVIADOS = 200;
/** Días que el API trae por defecto cuando no se elige periodo. */
export const DIAS_DEFAULT_CORREOS = 90;

export const TITULO_SIN_CORREOS_ENVIADOS = "No se ha enviado ningún correo en este periodo";
export const DESCRIPCION_SIN_CORREOS_ENVIADOS =
  "Los correos al cliente no se envían solos: se mandan desde la cotización o el vuelo con «Enviar confirmación al cliente».";
export const TITULO_ERROR_CORREOS_ENVIADOS = "No se pudieron cargar los correos enviados";
export const DESCRIPCION_ERROR_CORREOS_ENVIADOS =
  "El sistema no respondió. No significa que no se haya enviado nada: pulsa Reintentar.";
export const TITULO_CORREOS_NO_DISPONIBLE = "Esta pantalla todavía no está disponible";
export const TITULO_CORREOS_SIN_ACCESO = "Tu usuario no tiene acceso a esta pantalla";
export const DESCRIPCION_CORREOS_SIN_ACCESO =
  "Los correos enviados a clientes los ven Dirección, Administración, Coordinación, Facturación y Analista.";
export const PLACEHOLDER_BUSCAR_CORREOS = "Buscar (folio, cliente, correo, asunto, quién lo envió)…";
export const ETIQUETA_PERIODO_CORREOS = "Periodo";
export const ARIA_PERIODO_CORREOS = "Periodo de los correos";
export const TITULO_ABRIR_VUELO = "Abrir el vuelo de este correo";
export const SECCION_CORREOS_ENVIADOS = "Operación";
export const TEXTO_LIMPIAR_PERIODO_CORREOS = "Quitar periodo";
export const TITULO_LIMPIAR_PERIODO_CORREOS = `Vuelve a los últimos ${DIAS_DEFAULT_CORREOS} días.`;
export const TITULO_FECHA_CORREOS = "Día en que se envió el correo (hora de Cancún).";

/** Primer valor de un parámetro de la URL (Next lo entrega como texto o lista). */
function primero(valor: string | string[] | null | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return typeof v === "string" ? v : undefined;
}

/**
 * `?desde=&hasta=` de «Correos enviados», ya validados: solo DÍAS
 * `AAAA-MM-DD` que existen (el API responde 400 a cualquier otra cosa) y el
 * rango invertido se corrige. Lo inválido se IGNORA: valen los últimos 90
 * días del API.
 */
export function rangoCorreosDeUrl(sp: {
  desde?: string | string[] | null;
  hasta?: string | string[] | null;
}): { desde?: string; hasta?: string } {
  const d = primero(sp.desde);
  const h = primero(sp.hasta);
  return rangoFiltro(esDiaValido(d) ? d : undefined, esDiaValido(h) ? h : undefined);
}

export function hayRangoCorreos(rango: { desde?: string; hasta?: string }): boolean {
  return !!(rango.desde || rango.hasta);
}

/** «1 correo» / «12 correos». */
export function textoConteoCorreos(n: number): string {
  return `${n} ${n === 1 ? "correo" : "correos"}`;
}

/**
 * Qué periodo se está viendo, con el rango EFECTIVO que devolvió el API:
 * «Últimos 90 días (del 11/08/2026 al 09/11/2026)» sin filtro, o «Del
 * 01/11/2026 al 09/11/2026» con filtro.
 */
export function textoPeriodoCorreos(
  efectivo: { desde?: string | null; hasta?: string | null },
  hayFiltro: boolean,
): string {
  const d = efectivo.desde ? fmtDateOnly(efectivo.desde) : null;
  const h = efectivo.hasta ? fmtDateOnly(efectivo.hasta) : null;
  const rango = d && h ? `del ${d} al ${h}` : d ? `desde el ${d}` : h ? `hasta el ${h}` : null;
  if (hayFiltro) return rango ? rango.charAt(0).toUpperCase() + rango.slice(1) : "Periodo elegido";
  return rango
    ? `Últimos ${DIAS_DEFAULT_CORREOS} días (${rango})`
    : `Últimos ${DIAS_DEFAULT_CORREOS} días`;
}

/** Aviso ámbar cuando el API cortó la lista (`truncado`). */
export function textoTruncado(mostrados: number): string {
  return `Se muestran los ${mostrados} correos más recientes del periodo, pero hay más. Elige un periodo más corto para ver los demás.`;
}

/** Texto por fila para la búsqueda rápida de la tabla. */
export function textoBusquedaCorreo(correo: CorreoCliente): string {
  return [
    typeof correo.folio === "number" ? `#${correo.folio} ${correo.folio}` : "",
    nombreLimpio(correo.cliente_nombre) ?? "",
    correo.destinatario ?? "",
    correo.asunto ?? "",
    nombreLimpio(correo.enviado_por_nombre) ?? "",
    estadoCorreoUi(correo.estado).label,
  ]
    .filter(Boolean)
    .join(" ");
}
