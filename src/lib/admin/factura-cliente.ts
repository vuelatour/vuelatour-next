/**
 * FACTURA DEL SERVICIO, por vuelo (22-sep-2026).
 *
 * Pedido del cliente: «quisiera agregar por cada vuelo las opciones para
 * identificar vuelos **facturado**, **sin factura**, **factura elaborada y
 * enviada**, y que pueda yo también **subir la factura del servicio** a un
 * lado».
 *
 * Hasta hoy el vuelo solo tenía `facturado` (boolean) = «el sistema timbró un
 * CFDI». Eso deja fuera el caso real de la oficina: la factura se elabora en
 * otro lado (o la emite el contador) y se manda por correo; el vuelo no está
 * «sin factura» pero tampoco tiene CFDI en el sistema. De ahí el tercer
 * estado, que es MANUAL y lo lleva la oficina:
 *
 *   SIN_FACTURA · ELABORADA_ENVIADA · FACTURADO
 *
 * **El CFDI manda**: cuando `vuelo.facturado = true` el estatus queda en
 * FACTURADO y el selector se bloquea (el API responde 409 `VUELO_CON_CFDI` si
 * alguien intenta bajarlo). Al revés no: marcar FACTURADO a mano NO timbra
 * nada — es seguimiento de oficina, igual que el semáforo de los gastos.
 *
 * Módulo PURO (sin React ni `lib/format`): lo usan la card «Cobro» del vuelo
 * (cliente) y las páginas server. Prueba en `__tests__/factura-cliente.test.ts`.
 */

export type EstatusFacturaCliente = "SIN_FACTURA" | "ELABORADA_ENVIADA" | "FACTURADO";

export interface EstadoFacturaCliente {
  value: EstatusFacturaCliente;
  /** Corta: badge de la card y de las listas. */
  label: string;
  /** Larga: opciones del selector. */
  labelForm: string;
  /** Clases del pill del badge. */
  pill: string;
  /** Qué significa (tooltip del selector). */
  ayuda: string;
}

/** Sin dato NUNCA se afirma «facturado» (mismo criterio que los gastos). */
export const FACTURA_CLIENTE_DEFAULT: EstatusFacturaCliente = "SIN_FACTURA";

export const FACTURA_CLIENTE_ESTADOS: EstadoFacturaCliente[] = [
  {
    value: "SIN_FACTURA",
    label: "Sin factura",
    labelForm: "Sin factura",
    pill: "border-border text-muted-foreground",
    ayuda: "Todavía no se elaboró la factura de este servicio.",
  },
  {
    value: "ELABORADA_ENVIADA",
    label: "Factura elaborada y enviada",
    labelForm: "Factura elaborada y enviada",
    pill: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ayuda:
      "La factura ya se hizo y se mandó al cliente, aunque el CFDI no se haya timbrado desde el sistema.",
  },
  {
    value: "FACTURADO",
    label: "Facturado",
    labelForm: "Facturado",
    pill: "border-brand-600/30 bg-brand-600/15 text-brand-600 dark:text-brand-400",
    ayuda: "El servicio quedó facturado. Si el CFDI se timbró aquí, el sistema lo marca solo.",
  },
];

/** Ficha del estado; valor desconocido o ausente ⇒ Sin factura (conservador). */
export function estadoFacturaCliente(
  value: string | null | undefined,
): EstadoFacturaCliente {
  return (
    FACTURA_CLIENTE_ESTADOS.find((e) => e.value === value) ?? FACTURA_CLIENTE_ESTADOS[0]
  );
}

/** Archivo de la factura del servicio, tal como lo manda el API. */
export interface ArchivoFacturaCliente {
  path: string;
  nombre: string | null;
  subida_at: string | null;
  subida_por_nombre?: string | null;
}

/** Bloque ADITIVO del snapshot / de la lista de vuelos. */
export interface FacturaClienteSnapshot {
  estatus: string;
  archivo: ArchivoFacturaCliente | null;
  /** Folio de la factura (API 0.0.29+; llave AUSENTE = API previo). */
  folio?: string | null;
  /** UUID fiscal del XML timbrado (API 0.0.29+). */
  uuid?: string | null;
}

/**
 * Estatus VIGENTE de un vuelo, con la tolerancia al API previo.
 *
 * - Con `factura_cliente` (API nuevo) manda su `estatus`, salvo que el CFDI
 *   diga otra cosa: `facturado = true` ⇒ FACTURADO siempre (el snapshot puede
 *   ir un instante atrás del timbrado).
 * - Sin `factura_cliente` (API previo) se cae a `facturado`, que es lo ÚNICO
 *   que ese API sabe: exactamente la pantalla de hoy.
 */
export function estatusFacturaCliente(v: {
  facturado?: boolean | null;
  factura_cliente?: FacturaClienteSnapshot | null;
}): EstatusFacturaCliente {
  if (v.facturado === true) return "FACTURADO";
  const crudo = v.factura_cliente?.estatus;
  if (!crudo) return FACTURA_CLIENTE_DEFAULT;
  return estadoFacturaCliente(crudo).value;
}

/** ¿El estatus lo fija el CFDI y por eso el selector va bloqueado? */
export function bloqueadoPorCfdi(v: { facturado?: boolean | null }): boolean {
  return v.facturado === true;
}

/** Razón del bloqueo, en palabras de operador. */
export const RAZON_BLOQUEO_CFDI =
  "Este vuelo ya tiene un CFDI timbrado en el sistema: su estatus se queda en «Facturado». Si la factura se canceló, cancélala en Facturas.";

/** Extensiones que acepta «Subir factura» (espejo del API). */
export const EXTENSIONES_FACTURA = [".pdf", ".xml"] as const;

/** Tope de tamaño del archivo (espejo del API). */
export const MAX_BYTES_FACTURA = 10 * 1024 * 1024;

/** Megas con UN decimal, como los dice el API («3.2»). */
export function megasDe(bytes: number): string {
  return (Math.max(0, bytes) / 1024 / 1024).toFixed(1);
}

/** «El archivo pesa 12.3 MB y el máximo son 10 MB» (espejo del 413 del API). */
export function textoPesoExcedido(bytes: number): string {
  const max = Math.round(MAX_BYTES_FACTURA / 1024 / 1024);
  return `El archivo pesa ${megasDe(bytes)} MB y el máximo son ${max} MB. Sube el PDF sin las fotos o comprímelo.`;
}

/** Mensaje de rechazo local, antes de gastar la subida. */
export function motivoArchivoInvalido(file: {
  name: string;
  size: number;
}): string | null {
  const nombre = (file.name ?? "").toLowerCase();
  const ok = EXTENSIONES_FACTURA.some((ext) => nombre.endsWith(ext));
  if (!ok) return "La factura se sube en PDF o XML (es el archivo que se manda al cliente).";
  if (!(file.size > 0)) {
    return "El archivo está vacío. Vuelve a descargarlo y súbelo otra vez.";
  }
  if (file.size > MAX_BYTES_FACTURA) return textoPesoExcedido(file.size);
  return null;
}

/**
 * Renglón bajo el archivo: «Folio A-1234 · factura-232.pdf · subió Itzi ·
 * 22 sep 2026». `fecha` lo formatea quien llama (hora Cancún, `fmtDate`) —
 * este módulo es PURO y no conoce zonas horarias. Sin folio el renglón es el
 * de siempre.
 */
export function textoArchivoFactura(
  archivo: ArchivoFacturaCliente | null | undefined,
  fecha?: string | null,
  folio?: string | null,
): string | null {
  if (!archivo) return null;
  const partes: string[] = [];
  const f = normalizarFolio(folio);
  if (f) partes.push(`Folio ${f}`);
  partes.push(archivo.nombre?.trim() || "Factura del servicio");
  const quien = archivo.subida_por_nombre?.trim();
  if (quien) partes.push(`subió ${quien}`);
  if (fecha) partes.push(fecha);
  return partes.join(" · ");
}

// ============================ FOLIO (24-sep-2026) ============================
//
// Palabras del cliente: «subí la factura de un vuelo, peroooo al momento de
// descargar el reporte en Excel sí aparece la columna de factura (del vuelo)
// pero no aparece el folio de la factura que subí en el registro». La factura
// que sube la oficina no guardaba folio en ningún lado; el API 0.0.29 lo
// guarda (`vuelo.factura_folio`) y el Excel lo imprime en «FACTURA
// VUELATOUR». Aquí solo lo que el PANEL necesita: capturarlo, prellenarlo del
// XML y pintarlo.

/** Tope del folio (espejo de `LIMITE_FOLIO_FACTURA` del API). */
export const LIMITE_FOLIO_FACTURA = 40;

/**
 * Folio saneado, ESPEJO de `normalizarFolioFactura` del API: sin caracteres
 * de control ni espacios de sobra, ≤ 40. `null` = vacío (así se BORRA). No
 * cambia mayúsculas: el folio se guarda como lo escribió quien factura.
 */
export function normalizarFolio(x: unknown): string | null {
  if (typeof x !== "string" && typeof x !== "number") return null;
  const limpio = String(x)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return null;
  return limpio.slice(0, LIMITE_FOLIO_FACTURA).trim();
}

/**
 * ¿El API ya sabe de folios? El 0.0.29 manda SIEMPRE la llave `folio` en el
 * bloque (aunque valga `null`); el previo no la conoce y además RECHAZA un
 * campo `folio` en la subida (400 por `forbidNonWhitelisted`). Sin la llave
 * el panel no ofrece ni manda folio: la card queda como estaba.
 */
export function soportaFolio(bloque: FacturaClienteSnapshot | null | undefined): boolean {
  return bloque != null && Object.prototype.hasOwnProperty.call(bloque, "folio");
}

/**
 * ¿Se ofrece «Agregar folio» sin subir nada? Con archivo o con seguimiento
 * (Facturado / Elaborada y enviada): es el caso del #297, que quedó
 * «Facturado» sin papel y el Excel no tenía qué folio poner.
 */
export function ofreceCapturarFolio(p: {
  estatus: EstatusFacturaCliente;
  tieneArchivo: boolean;
}): boolean {
  return p.tieneArchivo || p.estatus !== "SIN_FACTURA";
}

/** Texto de un XML en bytes: UTF-8 (con o sin BOM) o UTF-16 con BOM. */
export function textoDeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const t = new TextDecoder("utf-8").decode(bytes);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

function decodificarEntidadesXml(v: string): string {
  return v.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, ent: string) => {
    const e = ent.toLowerCase();
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
  });
}

/** Atributos de la PRIMERA etiqueta de apertura `<prefijo:Nombre …>`. */
function atributosDeNodo(xml: string, nombre: string): Map<string, string> | null {
  const re = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${nombre}\\b([^>]*)>`);
  const m = re.exec(xml);
  if (!m) return null;
  const attrs = new Map<string, string>();
  const reAttr = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let a: RegExpExecArray | null;
  while ((a = reAttr.exec(m[1])) !== null) {
    attrs.set(a[1], decodificarEntidadesXml(a[2] ?? a[3] ?? ""));
  }
  return attrs;
}

const RE_UUID_FISCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Folio y UUID de un CFDI para PRELLENAR el diálogo — ESPEJO de
 * `extraerDatosCfdi` del API (misma regla, para que lo que ve el operador sea
 * lo que el API guardaría): `SERIE-FOLIO` de `cfdi:Comprobante` (o solo el
 * Folio; si `SERIE-FOLIO` pasa de 40, solo el Folio) y el UUID del
 * `tfd:TimbreFiscalDigital`. Tolerante: un XML raro devuelve `null` y la
 * subida sigue — el folio es una ayuda, nunca un requisito.
 */
export function datosDeCfdi(xml: string): { folio: string | null; uuid: string | null } | null {
  const comp = atributosDeNodo(xml, "Comprobante");
  if (!comp) return null;
  const leer = (k: string) => normalizarFolio(comp.get(k) ?? comp.get(k.toLowerCase()));
  const serie = leer("Serie");
  const folio = leer("Folio");
  const tfd = atributosDeNodo(xml, "TimbreFiscalDigital");
  const crudoUuid = (tfd?.get("UUID") ?? tfd?.get("uuid") ?? "").trim();
  const uuid = RE_UUID_FISCAL.test(crudoUuid) ? crudoUuid.toUpperCase() : null;
  let etiqueta: string | null = null;
  if (folio) {
    const completa = [serie, folio].filter(Boolean).join("-");
    etiqueta = completa.length <= LIMITE_FOLIO_FACTURA ? completa : folio;
  }
  return { folio: etiqueta, uuid };
}

/**
 * Qué folio se MANDA con la subida (`null` = no mandar). El tecleado gana en
 * el API, así que solo se manda cuando dice algo distinto de lo que el API
 * sacaría solo del XML: un XML con el campo sin tocar no dispara el 409
 * «folio no disponible» mientras la migración del folio no esté aplicada.
 */
export function folioAEnviar(p: {
  tecleado: string | null | undefined;
  extraidoDelXml?: string | null;
}): string | null {
  const f = normalizarFolio(p.tecleado);
  if (!f) return null;
  if (p.extraidoDelXml && normalizarFolio(p.extraidoDelXml) === f) return null;
  return f;
}

// ===================== RESULTADO DE LA SUBIDA (24-sep-2026) ====================
//
// Defecto latente (revisado con logs el 24-sep-2026): la subida iba por una
// server action y `subir()` no tenía `catch`: cuando la action LANZABA
// —Vercel corta el cuerpo de cualquier función en 4.5 MB con 413
// FUNCTION_PAYLOAD_TOO_LARGE antes de llegar a Next, o se caía la red— no
// salía ningún aviso y el botón volvía a «Subir factura» como si nada. (El
// #297 NO fue esto: su PDF de 50 KB sí se subió y después se QUITÓ con
// «Quitar archivo» — logs de Supabase, ver AGENTS.md.)
// Regla desde hoy: «Factura guardada» SOLO si el API respondió 200 y el
// bloque trae `archivo`; cualquier otra cosa dice qué pasó y que la factura
// NO se guardó.

export interface FalloSubidaFactura {
  /** Sin respuesta del servidor (red caída, CORS). */
  red?: boolean;
  /** El panel canceló la espera (subida colgada). */
  tiempoAgotado?: boolean;
  status?: number | null;
  code?: string | null;
  message?: string | null;
}

const NO_SE_GUARDO = "La factura NO se guardó.";

/** Mensaje es-MX de una subida fallida (siempre dice que NO se guardó). */
export function mensajeFalloSubidaFactura(f: FalloSubidaFactura, bytes?: number): string {
  if (f.tiempoAgotado) {
    return `La subida tardó demasiado y se canceló. ${NO_SE_GUARDO} Revisa tu internet y vuelve a intentarlo.`;
  }
  if (f.red) {
    return `No hay conexión con el servidor. ${NO_SE_GUARDO} Revisa tu internet y vuelve a intentarlo.`;
  }
  const msg = typeof f.message === "string" ? f.message.trim() : "";
  if (f.status === 401) {
    return `Tu sesión expiró. ${NO_SE_GUARDO} Recarga la página, inicia sesión y vuelve a subirla.`;
  }
  if (f.status === 403) {
    return `Tu usuario no puede subir facturas (solo administración, coordinación o facturación). ${NO_SE_GUARDO}`;
  }
  if (f.code === "ARCHIVO_MUY_GRANDE" || f.status === 413) {
    // El API ya dice el peso en español («El archivo pesa 10.4 MB y el máximo
    // son 10 MB.»); un 413 sin cuerpo útil se arma con el peso real.
    const base = msg.startsWith("El archivo")
      ? msg
      : bytes != null
        ? textoPesoExcedido(bytes)
        : "El archivo pesa más de lo permitido.";
    return `${base} ${NO_SE_GUARDO}`;
  }
  if (f.status === 404 && /^Cannot (GET|POST|PATCH|DELETE)\b/.test(msg)) {
    return `El servidor todavía no tiene la subida de facturas por vuelo (falta actualizarlo). ${NO_SE_GUARDO}`;
  }
  // Sin cuerpo JSON (`PARSE_ERROR` de `apiFetch`: HTML de Railway reiniciando)
  // el mensaje es el `statusText` en inglés: no se pinta.
  const tecnico =
    f.code === "PARSE_ERROR" ||
    /^(Internal server error|Request failed|Bad Request|Not Found)$/i.test(msg);
  if (msg && !tecnico) return `${msg.replace(/\.?$/, ".")} ${NO_SE_GUARDO}`;
  return `El servidor respondió con error${f.status ? ` ${f.status}` : ""}. ${NO_SE_GUARDO} Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
}

export type ResultadoSubidaFactura<B> =
  | { ok: true; bloque: B; avisoFolio?: string }
  | { ok: false; error: string; code?: string };

/**
 * ¿La respuesta del API CONFIRMA el archivo? Solo un bloque con `archivo`
 * cuenta como guardado; un 200 raro sin él NO se celebra.
 */
export function confirmarSubida<B extends { archivo?: unknown }>(
  bloque: B | null | undefined,
): ResultadoSubidaFactura<B> {
  if (bloque && typeof bloque === "object" && bloque.archivo) {
    return { ok: true, bloque };
  }
  return {
    ok: false,
    error: `El servidor no confirmó el archivo. ${NO_SE_GUARDO} Vuelve a intentarlo.`,
    code: "SIN_CONFIRMACION",
  };
}

/** El archivo sí se guardó, pero el folio tecleado todavía no se puede. */
export const AVISO_FOLIO_NO_DISPONIBLE =
  "La factura se guardó, pero el folio todavía no se puede guardar (falta una actualización del servidor). Captúralo más tarde con el lápiz.";

/** Texto del toast de éxito: «Factura guardada · folio A-1234». */
export function textoFacturaGuardada(folio?: string | null): string {
  const f = normalizarFolio(folio);
  return f ? `Factura guardada · folio ${f}` : "Factura guardada";
}
