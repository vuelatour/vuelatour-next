/**
 * FACTURAS EMITIDAS (registro manual), «Necesito factura» y comprobante del
 * cobro — lógica PURA del panel (24-sep-2026). Prueba:
 * `__tests__/facturas-emitidas.test.ts`.
 *
 * Pedidos del cliente:
 *  - Ale: «necesita las facturas emitidas … que haya una de facturas emitidas
 *    para las que hace Mari manualmente … por orden del número de la factura
 *    … saber que esas facturas ya están emitidas, que no hay unas duplicadas
 *    … Mari las estaría adjuntando en PDF».
 *  - Itzi: «que haya algo que yo marque así como de necesito factura … y a
 *    Mari le salga una alertita … el pendiente de factura … visualmente
 *    afuerita nada más diga el número de la factura y ya si le picas ves el
 *    PDF».
 *
 * Aquí NO se decide nada que el API ya decide (duplicados, «por facturar»,
 * alertas, huecos, semáforo del API): el panel pinta lo que llega. Lo que sí
 * vive aquí es lo que solo el PANEL necesita: leer/validar los filtros de la
 * URL, prellenar el formulario sin pisar lo tecleado, comparar lo leído del
 * archivo contra lo capturado (misma `claveCompacta` que el API, para que el
 * aviso ámbar y el 409 no discrepen), los textos es-MX y abrir el PDF sin que
 * Safari bloquee la ventana.
 */

import { fmtMonto, fmtUsd } from "@/lib/format";
import { CANCUN_TZ } from "@/lib/datetime";
import { esDiaValido, rangoFiltro, uuidFiltro, valorDeCatalogo } from "./url-params";
import { MAX_BYTES_FACTURA, textoPesoExcedido } from "./factura-cliente";
import { estadoCobroSemaforo, type EstadoCobroSemaforo } from "./cobros";
import type {
  AlertaFactura,
  CamposLeidosFactura,
  CobroResumen,
  EstatusFacturaEmitida,
  FacturaEmitida,
  FacturaEmitidaDatos,
  HuecoSerie,
  MetodoPagoFactura,
  MonedaFactura,
  OrdenFacturas,
  SolicitudFactura,
} from "@/types/facturas-emitidas";

// =============================================================================
// Roles (espejo de los @Roles del API; el gate real es el API)
// =============================================================================

type RolLike = string | null | undefined;

/** Roles que ven el registro «Facturas emitidas» (clase del controller). */
export const ROLES_FACTURAS_EMITIDAS = ["ADMIN", "FACTURACION"] as const;

/** Registrar/editar/cancelar facturas: ADMIN y FACTURACION. */
export function puedeRegistrarFactura(rol: RolLike): boolean {
  return rol === "ADMIN" || rol === "FACTURACION";
}

/** «Necesito factura»: oficina que edita cotizaciones/vuelos o factura. */
export function puedePedirFactura(rol: RolLike): boolean {
  return rol === "ADMIN" || rol === "COORDINADOR" || rol === "FACTURACION";
}

/** Abrir el PDF de una factura (`archivo-url` admite COORDINADOR). */
export function puedeVerPdfFactura(rol: RolLike): boolean {
  return rol === "ADMIN" || rol === "COORDINADOR" || rol === "FACTURACION";
}

/** Adjuntar/reemplazar el comprobante de un cobro ya registrado. */
export function puedeAdjuntarComprobante(rol: RolLike): boolean {
  return rol === "ADMIN" || rol === "COORDINADOR" || rol === "FACTURACION";
}

// =============================================================================
// Filtros de la URL (validados ANTES de hablar con el API, `url-params.ts`)
// =============================================================================

export const ALERTAS_FILTRO = [
  "duplicado_vuelo",
  "sin_pdf",
  "sin_vuelo",
  "vuelo_cancelado",
] as const;
export type AlertaFiltro = (typeof ALERTAS_FILTRO)[number];

export const ESTATUS_FACTURA: readonly EstatusFacturaEmitida[] = ["VIGENTE", "CANCELADA"];
export const ORDENES_FACTURAS: readonly OrdenFacturas[] = ["folio_desc", "folio_asc", "fecha_desc"];
/** Las más recientes arriba (decisión del orquestador; un clic lo invierte). */
export const ORDEN_DEFAULT: OrdenFacturas = "folio_desc";
/** Valor especial del filtro de serie: facturas SIN serie. */
export const SIN_SERIE = "SIN_SERIE";
/** Valor especial del filtro de emisora: facturas sin razón social identificada. */
export const SIN_EMISORA = "SIN_EMISORA";
/** Valor del selector «Razón social que emite» para «Otra / no es de VuelaTour» (⇒ null). */
export const EMISORA_OTRA = "__OTRA__";

export interface FiltrosFacturas {
  q?: string;
  desde?: string;
  hasta?: string;
  cliente_id?: string;
  /** uuid | SIN_EMISORA */
  emisora_id?: string;
  /** MAYÚSCULAS | SIN_SERIE */
  serie?: string;
  estatus?: EstatusFacturaEmitida;
  alerta?: AlertaFiltro;
  orden: OrdenFacturas;
  vuelo_id?: string;
  /** Vuelo a resaltar en «Por facturar» (link de la notificación). No va al API. */
  resaltar?: string;
}

type ParamsUrl = Record<string, string | string[] | undefined>;

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Filtros de `/admin/facturas-emitidas` leídos de la URL. Lo inválido se
 * IGNORA (regla de `url-params.ts`): un enlace viejo nunca tumba la pantalla.
 */
export function filtrosFacturasDeUrl(sp: ParamsUrl): FiltrosFacturas {
  const q = (uno(sp.q) ?? "").trim().slice(0, 100);
  const d = uno(sp.desde);
  const h = uno(sp.hasta);
  // Solo días de pared (la columna `fecha_emision` es date); un rango al revés
  // se corrige en vez de mandarle al API un 400 RANGO_INVALIDO.
  const rango = rangoFiltro(esDiaValido(d) ? d : undefined, esDiaValido(h) ? h : undefined);
  const emisora = uno(sp.emisora_id);
  const serieCruda = (uno(sp.serie) ?? "").trim().toUpperCase();
  const serie =
    serieCruda === SIN_SERIE
      ? SIN_SERIE
      : serieCruda && serieCruda.length <= 25
        ? serieCruda
        : undefined;
  return {
    q: q || undefined,
    desde: rango.desde,
    hasta: rango.hasta,
    cliente_id: uuidFiltro(uno(sp.cliente_id)),
    emisora_id: emisora === SIN_EMISORA ? SIN_EMISORA : uuidFiltro(emisora),
    serie,
    estatus: valorDeCatalogo(uno(sp.estatus), ESTATUS_FACTURA),
    alerta: valorDeCatalogo(uno(sp.alerta), ALERTAS_FILTRO),
    orden: valorDeCatalogo(uno(sp.orden), ORDENES_FACTURAS) ?? ORDEN_DEFAULT,
    vuelo_id: uuidFiltro(uno(sp.vuelo_id)),
    resaltar: uuidFiltro(uno(sp.resaltar)),
  };
}

/**
 * Query del API (lista y Excel) desde filtros YA validados. `resaltar` no
 * viaja (es solo del panel) y el orden por defecto no se repite.
 */
export function queryDeFiltros(f: FiltrosFacturas): Record<string, string | undefined> {
  return {
    q: f.q,
    desde: f.desde,
    hasta: f.hasta,
    cliente_id: f.cliente_id,
    emisora_id: f.emisora_id,
    serie: f.serie,
    estatus: f.estatus,
    alerta: f.alerta,
    orden: f.orden !== ORDEN_DEFAULT ? f.orden : undefined,
    vuelo_id: f.vuelo_id,
  };
}

/** ¿Hay algún filtro activo (el orden no cuenta)? */
export function hayFiltrosFacturas(f: FiltrosFacturas): boolean {
  const q = queryDeFiltros(f);
  return Object.entries(q).some(([k, v]) => k !== "orden" && !!v);
}

/**
 * Liga a la página con los filtros actuales más `cambios` (`undefined`/"" =
 * quitar ese filtro). La usan los chips del resumen y los enlaces internos.
 */
export function hrefFacturas(
  f: FiltrosFacturas,
  cambios: Partial<Record<keyof FiltrosFacturas, string | undefined>> = {},
): string {
  const base: Record<string, string | undefined> = { ...queryDeFiltros(f), ...cambios };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (k === "resaltar") continue;
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/facturas-emitidas?${qs}` : "/admin/facturas-emitidas";
}

// =============================================================================
// Alertas, huecos y textos del registro
// =============================================================================

/** Alerta del filtro (URL, minúsculas) ⇄ alerta de la fila (API, MAYÚSCULAS). */
export const ALERTA_DE_FILTRO: Record<AlertaFiltro, AlertaFactura> = {
  duplicado_vuelo: "DUPLICADO_VUELO",
  sin_pdf: "SIN_PDF",
  sin_vuelo: "SIN_VUELO",
  vuelo_cancelado: "VUELO_CANCELADO",
};

/** Chips de alerta: etiqueta corta + qué hacer (tooltip). */
export const ETIQUETAS_ALERTA: Record<AlertaFactura, { label: string; title: string }> = {
  DUPLICADO_VUELO: {
    label: "Vuelo con 2 facturas",
    title:
      "Uno de sus vuelos tiene otra factura vigente. Si es anticipo y finiquito, márcalas como «Factura parcial»; si es una re-emisión, cancela la anterior.",
  },
  SIN_PDF: {
    label: "Sin PDF",
    title: "Adjunta el PDF para tener el registro completo (menú ⋯ → Reemplazar PDF).",
  },
  SIN_VUELO: {
    label: "Sin vuelo",
    title: "Liga la factura al vuelo que cubre (menú ⋯ → Editar).",
  },
  VUELO_CANCELADO: {
    label: "Vuelo cancelado",
    title: "Si es la factura del cargo por cancelación, está bien; si no, cancélala.",
  },
};

/** Etiqueta «Serie-Folio» («A-123» o «123» sin serie). */
export function etiquetaSerieFolio(
  serie: string | null | undefined,
  folio: string | number | null | undefined,
): string {
  const f = folio == null ? "" : String(folio).trim();
  const s = (serie ?? "").trim();
  if (!f) return s;
  return s ? `${s}-${f}` : f;
}

/** Arriba de esto los «faltantes» son casi seguro un folio mal capturado. */
export const UMBRAL_SALTO_GRANDE = 200;

/**
 * Texto de los HUECOS de una serie: «Faltan A-104, A-107 (y 3 más)». Con un
 * salto enorme («A-130» → «A-1300», un dígito de más) no se listan cientos de
 * faltantes: se avisa que probablemente un folio se capturó mal.
 */
export function textoHuecos(h: HuecoSerie): string {
  if (h.total_faltantes > UMBRAL_SALTO_GRANDE) {
    const donde = h.serie ? `en la serie ${h.etiqueta_serie}` : "en los folios sin serie";
    return `Hay un salto grande ${donde} (de ${etiquetaSerieFolio(h.serie, h.desde)} a ${etiquetaSerieFolio(h.serie, h.hasta)}): revisa si algún folio se capturó mal.`;
  }
  const lista = h.faltantes.join(", ");
  const resto = h.total_faltantes - h.faltantes.length;
  return `Faltan ${lista}${resto > 0 ? ` (y ${resto} más)` : ""}`;
}

/**
 * Semáforo de cobro de un vuelo del registro con la regla ÚNICA del panel
 * (`estadoCobroSemaforo`): el API manda los INSUMOS; el `semaforo` del API es
 * su espejo para el Excel y aquí no se usa (contrato §11.9).
 */
export function semaforoDeCobro(c: CobroResumen): EstadoCobroSemaforo {
  return estadoCobroSemaforo({
    montoTotalUsd: Number(c.monto_total_usd) || 0,
    cobrado: c.cobrado === true,
    totalCobradoUsd: c.total_cobrado_usd,
    sinTcCount: c.sin_tc_count,
    cotizacionAbierta: c.cotizacion_abierta === true,
    enCotizacion: c.estado_vuelo === "SOLICITUD" || c.estado_vuelo === "COTIZADO",
    cancelado: c.estado_vuelo === "CANCELADO",
    esInterno: c.es_interno === true,
  });
}

// =============================================================================
// Fechas cortas (hora Cancún) y la solicitud de factura
// =============================================================================

const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: CANCUN_TZ,
});

/** «24 sep» en hora Cancún (un instante UTC de la madrugada es el día anterior). */
export function fechaCortaCancun(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return fechaCorta.format(d);
}

/** « por Itzi · 24 sep» (sin nombre: « · 24 sep»; nunca se inventa a nadie). */
function quienYCuando(s: SolicitudFactura): string {
  const nombre = s.solicitada_por?.nombre?.trim();
  const fecha = fechaCortaCancun(s.solicitada_at);
  return `${nombre ? ` por ${nombre}` : ""}${fecha ? ` · ${fecha}` : ""}`;
}

/** Chip ámbar: «Factura pedida por Itzi · 24 sep — pendiente». */
export function textoSolicitud(s: SolicitudFactura): string {
  return `Factura pedida${quienYCuando(s)} — pendiente`;
}

/** Línea gris junto a las facturas ya emitidas: «Pedida por Itzi · 24 sep». */
export function textoPedidaPor(s: SolicitudFactura): string {
  return `Pedida${quienYCuando(s)}`;
}

/** Une nombres en es-MX: «A», «A y B», «A, B y C». */
export function unirNombres(nombres: string[]): string {
  const n = nombres.map((x) => x.trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/** Toast tras «Necesito factura» (a quién se avisó; nunca en silencio). */
export function textoNotificados(notificados: string[] | null | undefined): string {
  const quienes = unirNombres(notificados ?? []);
  return quienes
    ? `Listo: se avisó a ${quienes}.`
    : "Solicitud guardada. Aparece en Facturas emitidas → Por facturar.";
}

/** Toast del ALTA de cotización con «El cliente pide factura». */
export function textoFacturaPedidaAlta(notificados: string[] | null | undefined): string {
  const quienes = unirNombres(notificados ?? []);
  return quienes
    ? `Factura pedida a ${quienes}.`
    : "Factura pedida: aparece en Facturas emitidas → Por facturar.";
}

/** Error del alta cuando la cotización SÍ se creó y la solicitud no. */
export function textoFalloSolicitudAlta(folio: number, error: string | null | undefined): string {
  const motivo = (error ?? "").trim().replace(/\.$/, "") || "error desconocido";
  return `La cotización #${folio} se creó, pero NO se pudo pedir la factura: ${motivo}. Pídela desde la cotización con «Necesito factura».`;
}

/** «1 cancelada» / «2 canceladas». */
export function textoCanceladas(n: number): string {
  return `${n} ${n === 1 ? "cancelada" : "canceladas"}`;
}

/** «Faltan datos fiscales: RFC, Régimen fiscal» (vacío ⇒ null). */
export function textoFaltanDatosFiscales(faltan: string[] | null | undefined): string | null {
  const l = (faltan ?? []).filter(Boolean);
  return l.length > 0 ? `Faltan datos fiscales: ${l.join(", ")}` : null;
}

/** Límite de la nota de la solicitud (espejo del CHECK del API). */
export const LIMITE_NOTA_SOLICITUD = 500;

/** Motivo de cancelar/eliminar: 3–500 letras (espejo del API). */
export function motivoValido(m: string | null | undefined): boolean {
  const t = (m ?? "").trim();
  return t.length >= 3 && t.length <= 500;
}

// =============================================================================
// Formulario «Registrar factura»
// =============================================================================

/**
 * Valores del formulario (todo texto, como los inputs). Las llaves son un
 * subconjunto de `FacturaEmitidaDatos` para que «tocados» hable el mismo
 * idioma que el API.
 */
export interface ValoresFormularioFactura {
  /** uuid | "" (sin elegir) | EMISORA_OTRA (⇒ null) */
  emisora_id: string;
  serie: string;
  folio: string;
  uuid: string;
  fecha_emision: string;
  cliente_id: string;
  receptor_rfc: string;
  receptor_nombre: string;
  emisor_rfc: string;
  emisor_nombre: string;
  moneda: "" | MonedaFactura;
  subtotal: string;
  iva: string;
  total: string;
  metodo_pago: "" | MetodoPagoFactura;
  forma_pago: string;
  notas: string;
  es_parcial: boolean;
}

export type CampoFormularioFactura = keyof ValoresFormularioFactura &
  keyof FacturaEmitidaDatos;

export function valoresVacios(): ValoresFormularioFactura {
  return {
    emisora_id: "",
    serie: "",
    folio: "",
    uuid: "",
    fecha_emision: "",
    cliente_id: "",
    receptor_rfc: "",
    receptor_nombre: "",
    emisor_rfc: "",
    emisor_nombre: "",
    moneda: "",
    subtotal: "",
    iva: "",
    total: "",
    metodo_pago: "",
    forma_pago: "",
    notas: "",
    es_parcial: false,
  };
}

function numTxt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "" : String(n);
}

/** Valores del formulario a partir de una factura existente (editar). */
export function valoresDeFactura(f: FacturaEmitida): ValoresFormularioFactura {
  return {
    emisora_id: f.emisora?.id ?? EMISORA_OTRA,
    serie: f.serie ?? "",
    folio: f.folio,
    uuid: f.uuid ?? "",
    fecha_emision: f.fecha_emision,
    cliente_id: f.cliente?.id ?? "",
    receptor_rfc: f.receptor_rfc ?? "",
    receptor_nombre: f.receptor_nombre ?? "",
    emisor_rfc: f.emisor_rfc ?? "",
    emisor_nombre: f.emisor_nombre ?? "",
    moneda: f.moneda,
    subtotal: numTxt(f.subtotal),
    iva: numTxt(f.iva),
    total: numTxt(f.total),
    metodo_pago: f.metodo_pago ?? "",
    forma_pago: f.forma_pago ?? "",
    notas: f.notas ?? "",
    es_parcial: f.es_parcial,
  };
}

/** Lo leído del archivo en forma de valores del formulario (solo lo que vino). */
export function valoresDeLectura(c: CamposLeidosFactura): Partial<ValoresFormularioFactura> {
  const out: Partial<ValoresFormularioFactura> = {};
  if (c.serie) out.serie = c.serie;
  if (c.folio) out.folio = c.folio;
  if (c.uuid) out.uuid = c.uuid.toUpperCase();
  if (c.fecha_emision) out.fecha_emision = c.fecha_emision;
  if (c.receptor_rfc) out.receptor_rfc = c.receptor_rfc;
  if (c.receptor_nombre) out.receptor_nombre = c.receptor_nombre;
  if (c.emisor_rfc) out.emisor_rfc = c.emisor_rfc;
  if (c.emisor_nombre) out.emisor_nombre = c.emisor_nombre;
  if (c.moneda) out.moneda = c.moneda;
  if (c.subtotal != null) out.subtotal = numTxt(c.subtotal);
  if (c.iva != null) out.iva = numTxt(c.iva);
  if (c.total != null) out.total = numTxt(c.total);
  if (c.metodo_pago) out.metodo_pago = c.metodo_pago;
  if (c.forma_pago) out.forma_pago = c.forma_pago;
  return out;
}

function vacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * PRELLENADO SIN PISAR: llena un campo SOLO si está vacío y Mari no lo tocó.
 * Lo que ella ya escribió (aunque luego lo haya borrado) manda sobre la
 * lectura del archivo — la lectura de un PDF puede equivocarse, ella no.
 */
export function prellenarSinPisar<T extends object>(
  valores: T,
  tocados: ReadonlySet<keyof T>,
  campos: Partial<T>,
): T {
  const out = { ...valores };
  for (const k of Object.keys(campos) as (keyof T)[]) {
    const nuevo = campos[k];
    if (vacio(nuevo)) continue;
    if (tocados.has(k)) continue;
    if (!vacio(out[k])) continue;
    out[k] = nuevo as T[keyof T];
  }
  return out;
}

/** Monto tecleado («7,350.69», «$1 160») ⇒ número; vacío ⇒ null; basura ⇒ NaN. */
export function parseMonto(txt: string | null | undefined): number | null {
  const t = (txt ?? "").replace(/[\s$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

const RE_UUID_FISCAL = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
/** Regex del RFC (idéntica al CHECK de la BD). */
export const RE_RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

/** RFC normalizado como lo guarda el API (MAYÚSCULAS, sin espacios ni guiones). */
export function normalizarRfc(rfc: string | null | undefined): string {
  return (rfc ?? "").toUpperCase().replace(/[\s-]/g, "");
}

function dosDecimalesMax(n: number): boolean {
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

/**
 * Errores de captura ANTES de mandar (espejo de las reglas del API; el API
 * sigue siendo el gate). Llave = campo, valor = mensaje es-MX.
 */
export function validarFormularioFactura(
  v: ValoresFormularioFactura,
): Partial<Record<keyof ValoresFormularioFactura, string>> {
  const e: Partial<Record<keyof ValoresFormularioFactura, string>> = {};
  const folio = v.folio.trim();
  if (!folio) e.folio = "Escribe el folio de la factura.";
  else if (folio.length > 40) e.folio = "El folio es muy largo (máximo 40).";
  if (v.serie.trim().length > 25) e.serie = "La serie es muy larga (máximo 25).";
  if (!esDiaValido(v.fecha_emision)) e.fecha_emision = "Elige la fecha de emisión.";
  if (!v.moneda) e.moneda = "Elige la moneda.";
  const total = parseMonto(v.total);
  if (total == null) e.total = "Escribe el total de la factura.";
  else if (Number.isNaN(total) || !(total > 0)) e.total = "El total debe ser un número mayor a 0.";
  else if (!dosDecimalesMax(total)) e.total = "El total va con máximo 2 decimales.";
  for (const k of ["subtotal", "iva"] as const) {
    const n = parseMonto(v[k]);
    if (n != null && (Number.isNaN(n) || n < 0)) e[k] = "Debe ser un número (0 o más).";
  }
  const uuid = v.uuid.trim().toUpperCase();
  if (uuid && !RE_UUID_FISCAL.test(uuid)) {
    e.uuid = "El folio fiscal tiene la forma 8-4-4-4-12 (ej. D08B6837-A3B5-45AF-96E1-36F07FBA8FAF).";
  }
  const rfc = normalizarRfc(v.receptor_rfc);
  if (rfc && !RE_RFC.test(rfc)) e.receptor_rfc = "RFC inválido (12 o 13 caracteres).";
  if (v.forma_pago.trim() && !/^[0-9]{2}$/.test(v.forma_pago.trim())) {
    e.forma_pago = "La forma de pago son 2 dígitos del SAT (ej. 03, 99).";
  }
  if (v.notas.length > 1000) e.notas = "Las notas van con máximo 1000 caracteres.";
  return e;
}

function textoONull(t: string): string | null {
  const x = t.trim();
  return x ? x : null;
}

/** Tope de emisor_nombre / receptor_nombre (DTO del API y CHECK de la BD). */
export const LIMITE_NOMBRE_FISCAL = 300;

/**
 * Nombre leído del archivo, recortado al tope: el del EMISOR no tiene campo
 * visible en el diálogo, así que un renglón largo que el lector del PDF tomó
 * como nombre acababa en un 400 «Revisa los datos» que Mari no podía
 * corregir.
 */
function nombreFiscal(t: string): string | null {
  const x = textoONull(t);
  return x ? x.slice(0, LIMITE_NOMBRE_FISCAL).trim() : null;
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * `datos` COMPLETOS del alta (y la base de la edición). Normaliza como el
 * API: serie en MAYÚSCULAS, folio con espacios colapsados, UUID en
 * MAYÚSCULAS, RFC sin espacios/guiones, «Otra / no es de VuelaTour» ⇒
 * `emisora_id: null` explícito.
 */
export function datosDeFormulario(
  v: ValoresFormularioFactura,
  vueloIds: string[],
): FacturaEmitidaDatos {
  const subtotal = parseMonto(v.subtotal);
  const iva = parseMonto(v.iva);
  const total = parseMonto(v.total);
  const datos: FacturaEmitidaDatos = {
    serie: textoONull(v.serie.toUpperCase()),
    folio: v.folio.trim().replace(/\s+/g, " "),
    uuid: textoONull(v.uuid.toUpperCase()),
    fecha_emision: v.fecha_emision,
    // El RFC del EMISOR no se captura a mano (viene de la lectura del
    // archivo): si no tiene forma de RFC se manda vacío en vez de bloquear el
    // guardado con un error que Mari no ve en pantalla.
    emisor_rfc: RE_RFC.test(normalizarRfc(v.emisor_rfc)) ? normalizarRfc(v.emisor_rfc) : null,
    emisor_nombre: nombreFiscal(v.emisor_nombre),
    receptor_rfc: textoONull(normalizarRfc(v.receptor_rfc)),
    receptor_nombre: nombreFiscal(v.receptor_nombre),
    cliente_id: textoONull(v.cliente_id),
    moneda: (v.moneda || undefined) as MonedaFactura | undefined,
    subtotal: subtotal == null || Number.isNaN(subtotal) ? null : redondear2(subtotal),
    iva: iva == null || Number.isNaN(iva) ? null : redondear2(iva),
    total: total == null || Number.isNaN(total) ? undefined : redondear2(total),
    metodo_pago: v.metodo_pago || null,
    forma_pago: textoONull(v.forma_pago),
    notas: textoONull(v.notas),
    es_parcial: v.es_parcial,
    vuelo_ids: [...vueloIds],
  };
  // La emisora solo viaja si Mari la eligió (o eligió «Otra»): sin elegir,
  // el API la detecta sola con `verificarEmisor`.
  if (v.emisora_id === EMISORA_OTRA) datos.emisora_id = null;
  else if (v.emisora_id) datos.emisora_id = v.emisora_id;
  return datos;
}

function mismoValor(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  }
  return (a ?? null) === (b ?? null);
}

/**
 * EDICIÓN: solo lo que cambió respecto a la factura original (PATCH). `{}` =
 * nada que cambiar (el API respondería 400 NADA_QUE_CAMBIAR si además no hay
 * archivos).
 */
export function cambiosDeEdicion(
  original: FacturaEmitida,
  nuevos: FacturaEmitidaDatos,
): FacturaEmitidaDatos {
  const base = datosDeFormulario(
    valoresDeFactura(original),
    original.vuelos.map((x) => x.id),
  );
  // La emisora original: la que tiene (o null explícito si no tiene).
  base.emisora_id = original.emisora?.id ?? null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(nuevos) as (keyof FacturaEmitidaDatos)[]) {
    if (!mismoValor(nuevos[k], base[k])) out[k] = nuevos[k];
  }
  return out as FacturaEmitidaDatos;
}

// =============================================================================
// Lo leído del archivo vs lo capturado (aviso ámbar; NO bloquea)
// =============================================================================

/**
 * Clave COMPACTA del número de factura — ESPEJO EXACTO de la del API
 * (`facturas-emitidas.util.ts`): serie + folio en MAYÚSCULAS, sin acentos,
 * sin nada que no sea letra/dígito y sin ceros a la izquierda de cada tramo
 * de dígitos. «A» + «00123», «A-123» sin serie y «a 123» ⇒ «A123». Si cambia
 * aquí, cambia allá: el aviso ámbar del diálogo y el 409 no deben discrepar.
 */
export function claveCompacta(
  serie: string | null | undefined,
  folio: string | null | undefined,
): string {
  // La Ñ se CONSERVA (el API la protege antes de quitar acentos: «Ñ5» ≠
  // «N5»); sin esto la NFD la partía en N + tilde y el aviso ámbar decía
  // «coincide» donde el 409 del API no.
  return `${serie ?? ""}${folio ?? ""}`
    .toUpperCase()
    .replace(/Ñ/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(//g, "Ñ")
    .replace(/[^A-Z0-9Ñ]/g, "")
    .replace(/(^|[^0-9])0+(?=[0-9])/g, "$1");
}

function textoMonto(n: number, moneda?: string | null): string {
  return moneda ? fmtMonto(n, moneda) : fmtUsd(n);
}

interface ComparableFactura {
  serie: string | null | undefined;
  folio: string | null | undefined;
  uuid: string | null | undefined;
  total: number | null | undefined;
  receptor_rfc: string | null | undefined;
  moneda?: string | null;
}

function diferencias(
  leido: CamposLeidosFactura,
  otro: ComparableFactura,
  fuente: string,
  sujeto: string,
): string[] {
  const out: string[] = [];
  const uuidL = (leido.uuid ?? "").trim().toUpperCase();
  const uuidO = (otro.uuid ?? "").trim().toUpperCase();
  if (uuidL && uuidO && uuidL !== uuidO) {
    out.push(`${fuente} dice el folio fiscal ${uuidL} y ${sujeto} ${uuidO}.`);
  }
  if (leido.folio && (otro.folio ?? "").trim()) {
    const kL = claveCompacta(leido.serie, leido.folio);
    const kO = claveCompacta(otro.serie, otro.folio);
    if (kL && kO && kL !== kO) {
      out.push(
        `${fuente} dice ${etiquetaSerieFolio(leido.serie, leido.folio)} y ${sujeto} ${etiquetaSerieFolio(otro.serie, otro.folio)}.`,
      );
    }
  }
  if (leido.total != null && otro.total != null && Number.isFinite(otro.total)) {
    if (Math.abs(leido.total - otro.total) > 0.005) {
      const m = leido.moneda ?? otro.moneda ?? null;
      out.push(
        `${fuente} dice un total de ${textoMonto(leido.total, m)} y ${sujeto} ${textoMonto(otro.total, m)}.`,
      );
    }
  }
  const rfcL = normalizarRfc(leido.receptor_rfc);
  const rfcO = normalizarRfc(otro.receptor_rfc);
  if (rfcL && rfcO && rfcL !== rfcO) {
    out.push(`${fuente} dice RFC receptor ${rfcL} y ${sujeto} ${rfcO}.`);
  }
  return out;
}

/**
 * Banner ámbar del diálogo ANTES de guardar: «El PDF dice A-124 y capturaste
 * A-123.» Compara UUID, número (clave compacta), total y RFC receptor.
 */
export function diferenciasLecturaVsFormulario(
  campos: CamposLeidosFactura,
  valores: ValoresFormularioFactura,
  fuente = "El PDF",
): string[] {
  const total = parseMonto(valores.total);
  return diferencias(
    campos,
    {
      serie: valores.serie,
      folio: valores.folio,
      uuid: valores.uuid,
      total: total == null || Number.isNaN(total) ? null : total,
      receptor_rfc: valores.receptor_rfc,
      moneda: valores.moneda || null,
    },
    fuente,
    "capturaste",
  );
}

/** «Reemplazar PDF» del menú: ¿el PDF nuevo parece de OTRA factura? */
export function diferenciasLecturaVsFactura(
  campos: CamposLeidosFactura,
  factura: Pick<FacturaEmitida, "serie" | "folio" | "uuid" | "total" | "receptor_rfc" | "moneda">,
  fuente = "El PDF",
): string[] {
  return diferencias(
    campos,
    {
      serie: factura.serie,
      folio: factura.folio,
      uuid: factura.uuid,
      total: factura.total,
      receptor_rfc: factura.receptor_rfc,
      moneda: factura.moneda,
    },
    fuente,
    "la factura registrada dice",
  );
}

/** «Este PDF parece de otra factura (dice A-124, $7,350.69). ¿Reemplazar de todos modos?» */
export function textoPdfDeOtraFactura(campos: CamposLeidosFactura): string {
  const partes = [
    campos.folio ? etiquetaSerieFolio(campos.serie, campos.folio) : null,
    campos.total != null ? textoMonto(campos.total, campos.moneda) : null,
  ].filter(Boolean);
  const dice = partes.length > 0 ? ` (dice ${partes.join(", ")})` : "";
  return `Este PDF parece de otra factura${dice}. ¿Reemplazar de todos modos?`;
}

// =============================================================================
// Archivos
// =============================================================================

type ArchivoLike = { name: string; size: number };

/** ¿El path (o nombre) es un PDF? */
export function esPdfPath(path: string | null | undefined): boolean {
  return (path ?? "").toLowerCase().split("?")[0].endsWith(".pdf");
}

/** ¿HEIC/HEIF? Chrome no los pinta: van como enlace, nunca `<img>` roto. */
export function esHeicPath(path: string | null | undefined): boolean {
  const p = (path ?? "").toLowerCase().split("?")[0];
  return p.endsWith(".heic") || p.endsWith(".heif");
}

function extension(nombre: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nombre.trim());
  return m ? m[1].toLowerCase() : "";
}

function motivoTamano(f: ArchivoLike): string | null {
  if (!(f.size > 0)) return "El archivo está vacío. Vuelve a descargarlo y súbelo otra vez.";
  if (f.size > MAX_BYTES_FACTURA) return textoPesoExcedido(f.size);
  return null;
}

/**
 * Lo que se soltó en el diálogo: como máximo UN PDF y UN XML (el
 * multipart del API lleva `pdf` y `xml` con `maxCount: 1`). Devuelve el
 * primer problema en es-MX, o los archivos clasificados.
 */
export function clasificarArchivosFactura<T extends ArchivoLike>(
  archivos: T[],
): { pdf?: T; xml?: T; error?: string } {
  const pdfs = archivos.filter((a) => extension(a.name) === "pdf");
  const xmls = archivos.filter((a) => extension(a.name) === "xml");
  const otros = archivos.filter((a) => !["pdf", "xml"].includes(extension(a.name)));
  if (otros.length > 0) {
    return { error: "La factura se sube en PDF (y el XML del CFDI si lo tienes)." };
  }
  if (pdfs.length > 1) return { error: "Suelta un solo PDF por factura." };
  if (xmls.length > 1) return { error: "Suelta un solo XML por factura." };
  for (const a of [...pdfs, ...xmls]) {
    const m = motivoTamano(a);
    if (m) return { error: m };
  }
  return { pdf: pdfs[0], xml: xmls[0] };
}

/** Extensiones del comprobante de un cobro (espejo del API). */
export const EXTENSIONES_COMPROBANTE = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"] as const;

/** Rechazo local del comprobante del cobro, antes de gastar la subida. */
export function motivoComprobanteInvalido(f: ArchivoLike): string | null {
  const ext = extension(f.name);
  if (!(EXTENSIONES_COMPROBANTE as readonly string[]).includes(ext)) {
    return "El comprobante se sube como foto (JPG, PNG, WEBP, HEIC) o PDF.";
  }
  return motivoTamano(f);
}

/** Cómo se muestra un comprobante según su path. */
export function tipoComprobante(path: string | null | undefined): "pdf" | "heic" | "imagen" {
  if (esPdfPath(path)) return "pdf";
  if (esHeicPath(path)) return "heic";
  return "imagen";
}

// =============================================================================
// Errores del API en es-MX
// =============================================================================

const TECNICO = /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden)$/i;

/**
 * Mensaje es-MX para un error del registro de facturas. El API ya redacta
 * sus errores en español (409 FACTURA_DUPLICADA trae «Ya está registrada:
 * A-123 del vuelo #297.»): se respetan; solo se traduce lo técnico.
 */
export function mensajeErrorFactura(
  code: string | null | undefined,
  message: string | null | undefined,
  status?: number | null,
): string {
  const msg = (message ?? "").trim();
  if (status === 401) return "Tu sesión expiró. Recarga la página e inicia sesión.";
  if (status === 403) {
    return "Tu usuario no tiene permiso para esto (solo administración y facturación).";
  }
  if (code === "SIN_CONEXION") {
    return "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
  }
  if (code === "TIEMPO_AGOTADO") {
    return "El servidor tardó demasiado y se canceló la espera. Vuelve a intentarlo.";
  }
  if (status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). Avisa a sistemas.";
  }
  if (code === "PARSE_ERROR" || !msg || TECNICO.test(msg)) {
    return `El servidor respondió con error${status ? ` ${status}` : ""}. Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
  }
  return msg;
}

/**
 * Evento de ventana para que el badge del menú se recalcule al instante tras
 * pedir, retirar o registrar una factura (el hook del sidebar lo escucha; así
 * ningún componente importa el hook ni su contexto de notificaciones).
 */
export const EVENTO_CONTEO_POR_FACTURAR = "vt:conteo-por-facturar";

export function avisarCambioPorFacturar(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(EVENTO_CONTEO_POR_FACTURAR));
  } catch {
    /* navegador sin Event constructor: el sondeo lo alcanza */
  }
}

/** El API sin la migración de facturas emitidas (503). */
export const CODIGO_NO_DISPONIBLE = "FACTURAS_EMITIDAS_NO_DISPONIBLE";

/**
 * ¿El API dijo «falta la migración»? Se decide por el CÓDIGO, no por el 503
 * a secas: Railway responde 503 («Application failed to respond», cuerpo HTML
 * ⇒ `PARSE_ERROR`) en cada deploy, y eso es una carga que FALLÓ (tarjeta con
 * «Reintentar»), no «todavía no están habilitadas».
 */
export function esNoDisponible(err: { status?: number; code?: string } | null | undefined): boolean {
  return err?.code === CODIGO_NO_DISPONIBLE;
}

// =============================================================================
// Abrir el PDF sin que Safari bloquee la ventana
// =============================================================================

export type ResultadoAbrir =
  | { ok: true; abierta: true }
  | { ok: true; abierta: false; url: string }
  | { ok: false; error: string };

/**
 * Abre un archivo con URL FIRMADA en otra pestaña. La ventana se abre en el
 * MISMO gesto del clic (`about:blank`, síncrono) y DESPUÉS se le asigna la
 * URL: un `window.open` posterior a un `await` lo bloquea Safari (el bloque
 * viejo de factura del vuelo lo hacía así). Si el navegador no dejó abrir la
 * ventana, devuelve la URL para que la pantalla ofrezca un enlace.
 *
 * `abrir` es inyectable para las pruebas; en el navegador es `window.open`.
 */
export async function abrirArchivoFirmado(
  obtenerUrl: () => Promise<{ ok: boolean; data?: string | null; error?: string | null }>,
  abrir: (url: string) => Window | null = (u) => window.open(u, "_blank"),
): Promise<ResultadoAbrir> {
  let w: Window | null = null;
  try {
    w = abrir("about:blank");
  } catch {
    w = null;
  }
  let res: { ok: boolean; data?: string | null; error?: string | null };
  try {
    res = await obtenerUrl();
  } catch {
    res = { ok: false, error: "No se pudo pedir el enlace del archivo." };
  }
  if (!res.ok || !res.data) {
    try {
      w?.close();
    } catch {
      /* la ventana ya no existe */
    }
    return { ok: false, error: res.error || "No se pudo abrir el archivo." };
  }
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* algunos navegadores no dejan tocar opener */
    }
    w.location.href = res.data;
    return { ok: true, abierta: true };
  }
  return { ok: true, abierta: false, url: res.data };
}
