"use server";

import { revalidatePath } from "next/cache";
import { CODIGO_MES_CERRADO } from "@/lib/admin/mes-cerrado";
import type { z } from "zod";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { mensajeErrorAccionGasto } from "@/lib/admin/gasto-acciones";
import { medioPagoAceptadoPorApi } from "@/lib/admin/medios-pago";
import { esUuid } from "@/lib/admin/url-params";
import {
  MSG_REPARTO_INVALIDO,
  centavosDe,
  estadoRepartoTrasFalla,
  itemsDeRespuesta,
  mismoReparto,
  planGuardadoReparto,
  textoRefuerzoAvion,
  validarItemsReparto,
  type ItemReparto,
  type PasoGuardado,
  type ResultadoGastoConReparto,
} from "@/lib/admin/reparto-gasto";
import {
  CODIGO_API_SIN_VARIAS,
  TEXTO_API_SIN_VARIAS,
  TEXTO_ERROR_FACTURAS,
  TEXTO_QUITAR_NO_DISPONIBLE,
  avisosDeRespuesta,
  cuerpoLegado,
  esRechazoArchivos,
  esVariasNoDisponible,
  facturaDesdeRecibida,
  facturasDeRespuesta,
  resultadoDeRespuestaSubida,
  variasDeRespuesta,
  type ArchivoFacturaEntrada,
  type FacturaDeGasto,
  type ResultadoSubidaFacturas,
} from "@/lib/admin/facturas-gasto";
import { cuerpoMarcarPagado, validarMarcarPagado } from "@/lib/admin/gasto-por-pagar";
import {
  cuerpoCuentaRapida,
  erroresCuentaRapida,
  type FormCuentaRapida,
  type OpcionCuentaGasto,
} from "@/lib/admin/cuentas-gasto";
import {
  cuerpoProveedorRapido,
  erroresProveedorRapido,
  type FormProveedorRapido,
} from "@/lib/admin/proveedores-gasto";
import { GastoCreateSchema, GastoVerifySchema } from "./schema";
import type { EstatusFacturacion } from "@/lib/admin/facturacion-estatus";
import { listAircraft } from "@/lib/api/aircraft";
import { listInventario } from "@/lib/api/inventory-server";
import type { ArticuloParaRefaccion } from "@/lib/admin/refaccion-inventario";
import {
  VENTANA_VUELOS_DEFAULT,
  type VentanaVuelosCercanos,
} from "@/lib/admin/categorias-gasto";
import type {
  Gasto,
  PistaPendiente,
  RepartoResponse,
  TarifaAerodromo,
} from "@/types/expenses";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** SOLO el alta por la suma (`conciliar_con_movimientos`, 14-oct-2026):
   *  código, status y detalle del API. Sin la llave, el fallo de siempre
   *  (solo `error`). */
  code?: string;
  status?: number;
  details?: unknown;
}

function fail<T>(err: unknown): ActionResult<T> {
  // 403 del RolesGuard («Required role: …», en inglés) → español (1-oct-2026).
  // `code`/`details` (ADITIVOS, 16-oct-2026): el candado 409 `MES_CERRADO`
  // (API 0.0.88) se reconoce por el código, nunca por el texto.
  if (isApiError(err))
    return {
      ok: false,
      error: mensajeErrorAccionGasto(err.status, err.message),
      ...(err.code === CODIGO_MES_CERRADO ? { code: err.code, details: err.details, status: err.status } : {}),
    };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/**
 * El fallo del alta por la suma CON código, status y detalle (14-oct-2026,
 * invariante 76 del API): Conciliación decide el texto («No se pudo confirmar
 * si se registró…» ante red o 5xx, «Esta opción todavía no está activa…»,
 * GASTO_SIN_VINCULAR…). Sin status = no hubo respuesta del API.
 */
function failConCodigo<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeErrorAccionGasto(err.status, err.message),
      code: err.code,
      status: err.status,
      details: err.details,
    };
  }
  return fail<T>(err);
}

/** Tira "" y undefined del body. null SOBREVIVE a propósito: es el "quitar"
 *  explícito de los diálogos (desligar avión/vuelo/escala, tarjeta_terminacion
 *  = null cuando el medio deja de ser TARJETA_CORP). */
function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/**
 * Alta manual de gasto desde el panel (la oficina captura gastos operativos).
 *
 * `reparto` (opcional): partes del reparto entre aviones capturadas en el
 * MISMO diálogo (gasto general sin vuelo/avión de categoría repartible). Tras
 * el POST se encadena el PUT del reparto existente — cero mecanismos nuevos
 * de dinero. Si el PUT falla, el gasto YA creado NO se borra (candados de
 * dinero): queda sin asignar en Otros gastos — estado recuperable con su
 * botón Repartir — y el fallo viaja en `repartoError` para el toast.
 *
 * «Créalo por la suma» (Conciliación, 14-oct-2026, API 0.0.77, invariante 76
 * del API): con `conciliar_con_movimientos` (+ `client_request_id`) el API
 * crea el gasto SIN auto-cruce y le liga esos cargos en la MISMA petición
 * (si la liga falla, lo retira). En ese caso la action NO revalida (la llama
 * un diálogo de Conciliación que sigue montado: en Next 16 un
 * `revalidatePath` repinta la página abierta; quien la llama hace UN
 * `router.refresh()` al cerrar) y el fallo conserva code/status/details. Sin
 * la llave, todo como siempre.
 */
export async function createGastoAction(
  raw: unknown,
  reparto?: Array<{ aeronave_id: string; monto: number }>,
): Promise<ActionResult<Gasto> & { repartoError?: string }> {
  const parsed = GastoCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const conCargos = parsed.data.conciliar_con_movimientos !== undefined;
  try {
    const created = await apiServer<Gasto>("/v1/expenses", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    let repartoError: string | undefined;
    if (reparto && reparto.length > 0) {
      try {
        await apiServer<RepartoResponse>(`/v1/expenses/${created.id}/reparto`, {
          method: "PUT",
          body: { items: reparto },
        });
      } catch (err) {
        repartoError = fail(err).error;
      }
      if (!conCargos) revalidatePath("/admin/otros-gastos");
    }
    if (!conCargos) {
      revalidatePath("/admin/expenses");
      revalidatePath("/admin/caja-chica", "layout");
      revalidatePath("/admin/gastos-personales");
      // «Registrar pago de nómina» (15-oct-2026) da de alta desde la pantalla
      // Nómina: se revalida a mano, como Gastos personales (también cubre el
      // alta con reparto, que además revalida Otros gastos).
      revalidatePath("/admin/nomina");
      // Alta desde «Gastos del vuelo» (p. ej. la «Comisión del vendedor»,
      // 28-sep-2026): el detalle del vuelo también se refresca, igual que al
      // verificar, ligar o borrar un gasto.
      revalidatePath("/admin/flights", "layout");
    }
    return repartoError !== undefined
      ? { ok: true, data: created, repartoError }
      : { ok: true, data: created };
  } catch (err) {
    return conCargos ? failConCodigo(err) : fail(err);
  }
}

/**
 * Artículos ACTIVOS de Inventario/Tienda para el selector de la refacción
 * (12-oct-2026): nombre, nº de parte, existencia y precio de venta de la
 * ficha. Una página de 300 (el tope del API): la bodega cabe de sobra; si
 * algún día no, el artículo se elige como «nuevo» y el API lo cruza por su
 * nº de parte al recibir la compra.
 */
export async function listArticulosRefaccionAction(): Promise<ActionResult<ArticuloParaRefaccion[]>> {
  try {
    const r = await listInventario({ activo: true, limit: 300 });
    return {
      ok: true,
      data: r.data.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        numero_parte: i.numero_parte ?? null,
        unidad: i.unidad ?? null,
        stock: i.stock ?? null,
        precio_venta: i.precio_venta ?? null,
        precio_venta_moneda: i.precio_venta_moneda ?? null,
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

// ===== Lectura IA de facturas (autollenado del alta de gasto) =====

export interface GastoTicketIA {
  disponible: boolean;
  motivo?: string;
  monto?: number | null;
  /** Propina impresa en el ticket (solo si aparece); monto = total del
   *  ticket CON la propina incluida cuando el total impreso la incluye. */
  propina?: number | null;
  moneda?: "MXN" | "USD" | null;
  fecha?: string | null;
  proveedor?: string | null;
  /** Folio/remisión impreso en el ticket (llave anti-duplicados). */
  folio?: string | null;
  concepto?: string | null;
  categoria_sugerida?: string | null;
  medio_pago?: string | null;
  tarjeta_terminacion?: string | null;
  /** Litros cargados si el ticket es de combustible (galones ya convertidos). */
  litros?: number | null;
  /** Tipo de combustible del ticket (ADITIVO, opcional: hoy solo lo lee la
   *  lectura de tickets de combustible). Nunca pisa el del avión. */
  tipo_combustible?: "TURBOSINA" | "AVGAS" | null;
  conceptos?: { concepto: string; monto: number }[];
  /** Desglose compuesto por el API (regla FBO/TUA) tal como irá en notas. */
  desglose_lineas?: string[];
  /** ADITIVO (13-oct-2026, TUA sistémica): TUA CON IVA leída aparte por la
   *  IA (sugerencia; un pyservices previo no la manda). Viaja dentro de la
   *  lectura que se persiste en `valor_ia_extraido`. */
  tua_monto?: number | null;
  /** ADITIVO (API 0.0.75): lo que separaría el desglose con ESTA lectura (lo
   *  calcula el API). Es cálculo, no lectura: NO se persiste. */
  tua_detectada?: number | null;
  matricula?: string | null;
  confianza?: number;
  legible?: boolean;
  notas?: string;
}

/**
 * Lee la factura adjunta (foto o PDF en base64) con la IA de visión y devuelve
 * los datos para prellenar el formulario. Best-effort: disponible=false si la
 * IA no está configurada o el documento no se distingue.
 */
export async function leerFacturaIAAction(input: {
  imageBase64?: string;
  mediaType?: string;
  pdfBase64?: string;
  excelBase64?: string;
  excelFilename?: string;
}): Promise<ActionResult<GastoTicketIA>> {
  try {
    const data = await apiServer<GastoTicketIA>("/v1/vision/gasto-ticket", {
      method: "POST",
      body: input,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Reanaliza el comprobante YA GUARDADO de un gasto (botón del modal
 * Verificar): el API firma la foto, la manda a la IA y refresca
 * `valor_ia_extraido` (fuente del desglose TUA/FBO en reportes); los campos
 * capturados no se tocan — la lectura vuelve para prellenar el formulario y
 * que un humano guarde.
 */
export async function reanalizarComprobanteAction(
  gastoId: string,
): Promise<ActionResult<GastoTicketIA>> {
  try {
    const data = await apiServer<GastoTicketIA>(
      `/v1/expenses/${gastoId}/reanalizar-ia`,
      { method: "POST", cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Gastos de pista (cuotas de aeródromo VIP SAESA) =====

/** Aterrizajes del periodo sin gasto de pista, con tarifa sugerida. */
export async function pistasPendientesAction(
  desde: string,
  hasta: string,
): Promise<ActionResult<{ data: PistaPendiente[] }>> {
  try {
    const data = await apiServer<{ data: PistaPendiente[] }>(
      `/v1/expenses/pistas/pendientes?desde=${desde}&hasta=${hasta}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface GenerarPistaItem {
  escala_id: string;
  monto: number;
  moneda?: string;
  categoria?: string;
  notas?: string;
}

/** Crea los gastos de pista confirmados (origen SISTEMA, uno por aterrizaje). */
export async function generarPistasAction(
  items: GenerarPistaItem[],
): Promise<ActionResult<{ creados: number; resultados: Array<{ escala_id: string; ok: boolean; error?: string }> }>> {
  try {
    const data = await apiServer<{
      creados: number;
      resultados: Array<{ escala_id: string; ok: boolean; error?: string }>;
    }>("/v1/expenses/pistas/generar", { method: "POST", body: { items } });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Tarifario de aeródromos =====

export async function listTarifasAction(): Promise<ActionResult<TarifaAerodromo[]>> {
  try {
    const data = await apiServer<TarifaAerodromo[]>("/v1/expenses/tarifas-aerodromo", {
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function saveTarifaAction(
  id: string | null,
  body: {
    codigo_iata?: string;
    modelo?: string;
    monto: number;
    moneda?: string;
    variable?: boolean;
    activo?: boolean;
  },
): Promise<ActionResult<TarifaAerodromo>> {
  try {
    const data = id
      ? await apiServer<TarifaAerodromo>(`/v1/expenses/tarifas-aerodromo/${id}`, {
          method: "PATCH",
          body,
        })
      : await apiServer<TarifaAerodromo>("/v1/expenses/tarifas-aerodromo", {
          method: "POST",
          body,
        });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTarifaAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/tarifas-aerodromo/${id}`, { method: "DELETE" });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Carga masiva de combustibles (plantilla Excel) =====

export interface CargaCombustibleFilaDatos {
  matricula?: string | null;
  fecha?: string | null;
  litros?: number | null;
  monto?: number | null;
  moneda?: string | null;
  /** La plantilla trae más columnas; el API las devuelve en `datos` y se
   *  reenvían TAL CUAL al confirmar (no recomponer aquí). */
  [extra: string]: unknown;
}

export interface CargaCombustibleFila {
  fila: number;
  ok: boolean;
  errores: string[];
  advertencias: string[];
  datos: CargaCombustibleFilaDatos;
}

export interface CargaCombustiblePreview {
  filas: CargaCombustibleFila[];
  resumen: {
    total: number;
    validas: number;
    con_error: number;
    con_advertencia: number;
  };
}

export interface CargaCombustibleResultado {
  creados: number;
  errores: Array<{ fila: number; error: string }>;
  /**
   * ADITIVO (API 0.0.56, 5-oct-2026): filas CREADAS cuyo tipo de combustible
   * no era el del avión y se guardaron con el del avión (nota «⚠ … — revisar»
   * y visto bueno pendiente). No son errores. Ausente con un API previo.
   */
  avisos?: Array<{ fila: number; aviso: string }>;
}

/** Analiza el archivo de la plantilla (base64) y devuelve la vista previa fila por fila. */
export async function previewCargaCombustiblesAction(input: {
  archivo_base64: string;
  filename: string;
}): Promise<ActionResult<CargaCombustiblePreview>> {
  try {
    const data = await apiServer<CargaCombustiblePreview>(
      "/v1/expenses/combustibles/carga-masiva/preview",
      { method: "POST", body: input },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Crea las cargas de combustible de las filas válidas (las `datos` del preview, tal cual). */
export async function confirmCargaCombustiblesAction(
  filas: CargaCombustibleFilaDatos[],
): Promise<ActionResult<CargaCombustibleResultado>> {
  try {
    const data = await apiServer<CargaCombustibleResultado>(
      "/v1/expenses/combustibles/carga-masiva",
      { method: "POST", body: { filas } },
    );
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyGastoAction(id: string, raw: unknown): Promise<ActionResult<Gasto>> {
  const r = await patchVerificacion(id, raw);
  // La forma de SIEMPRE (sin `status`): `{ ok: false, error }` exacto.
  if (r.ok) return { ok: true, data: r.data };
  if (r.fieldErrors) return { ok: false, fieldErrors: r.fieldErrors };
  // `code`/`details` SOLO en el 409 `MES_CERRADO` (API 0.0.88; `fail` no los
  // pone en ningún otro caso): la forma de siempre para todo lo demás.
  return r.code ? { ok: false, error: r.error, code: r.code, details: r.details } : { ok: false, error: r.error };
}

// El cuerpo de `verifyGastoAction` vive en `patchVerificacion` (justo aquí
// abajo: las declaraciones de función se elevan), que también usa el paso
// GASTO de `guardarGastoConRepartoAction`.

/** Cuerpo del PATCH de «Verificar / editar»: sin "" ni undefined y sin un
 *  medio que el API no acepta. */
function cuerpoVerificacion(data: z.infer<typeof GastoVerifySchema>) {
  const body = stripEmpty(data);
  // BODEGA (y cualquier medio que el DTO del API no acepte) NO viaja: el
  // `UpdateGastoDto` rebota «medio_pago must be one of…» y un gasto de
  // salida de inventario no se podía verificar ni editar. Omitirlo conserva
  // el medio guardado (verificación del lote 2, 14-oct-2026).
  if (!medioPagoAceptadoPorApi(body.medio_pago)) delete body.medio_pago;
  return body;
}

/**
 * El PATCH de «Verificar / editar» (cuerpo ÚNICO de `verifyGastoAction` y del
 * paso GASTO de `guardarGastoConRepartoAction`). Devuelve además el `status`
 * del API para que el guardado con reparto distinga un rechazo (4xx: nada se
 * escribió) de una falla incierta (red o 5xx). NO se exporta.
 */
async function patchVerificacion(
  id: string,
  raw: unknown,
): Promise<ActionResult<Gasto> & { status?: number }> {
  const parsed = GastoVerifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const body = cuerpoVerificacion(parsed.data);
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body,
    });
    revalidarVerificacion();
    return { ok: true, data: updated };
  } catch (err) {
    return isApiError(err) ? { ...fail<Gasto>(err), status: err.status } : fail<Gasto>(err);
  }
}

/**
 * Las pantallas que enseñan un gasto tras el PATCH de «Verificar / editar»
 * (escribió, o pudo escribir: red o 5xx). Prueba de COMPORTAMIENTO en
 * `gasto-con-reparto-action.test.ts`.
 */
function revalidarVerificacion() {
  revalidatePath("/admin/expenses");
  // Una reclasificación entre categorías repartibles se ve en Otros gastos.
  revalidatePath("/admin/otros-gastos");
  // Nómina (15-oct-2026) monta la MISMA tabla con su «Verificar / editar».
  revalidatePath("/admin/nomina");
  // Combustibles ofrece el MISMO menú ⋯ por carga (1-oct-2026).
  revalidatePath("/admin/combustibles");
  revalidatePath("/admin/caja-chica", "layout");
  revalidatePath("/admin/gastos-personales");
  revalidatePath("/admin/flights", "layout");
}

/**
 * Seguimiento de facturación de OFICINA (pedido del cliente, ago 2026):
 * 🔴 PENDIENTE → 🟡 SOLICITADA → 🟢 FACTURADA → ⚪ NO_FACTURABLE («No
 * requiere factura», 14-sep-2026). Campo propio del gasto
 * (estatus_facturacion) — NO toca estatus_comprobante: lo que entregó el
 * piloto se conserva (el toggle viejo lo mutaba y se perdía el registro).
 * Sin confirmación: reversible con el mismo control.
 *
 * NO_FACTURABLE necesita la migración 20260914000002. Si el ambiente no la
 * tiene, el API responde 400 con un mensaje claro («usa Pendiente mientras»)
 * y `fail` lo devuelve tal cual para que el badge lo muestre en el toast.
 */
export async function marcarFacturacionAction(
  id: string,
  estatus: EstatusFacturacion,
): Promise<ActionResult<Gasto>> {
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: { estatus_facturacion: estatus },
    });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/flights", "layout");
    revalidatePath("/admin/caja-chica", "layout");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Descarta la bandera de duplicado con un clic. */
/** Visto bueno de administración a un gasto prellenado con IA (app admin). */
export async function vistoBuenoGastoAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/${id}/visto-bueno`, { method: "POST" });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/combustibles");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function dismissDuplicadoAction(id: string): Promise<ActionResult<Gasto>> {
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: { duplicado_sospechado: false },
    });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface VueloSugerido {
  vuelo_id: string;
  folio: number | null;
  origen_iata: string | null;
  destino_iata: string | null;
  estado: string | null;
  fecha_vuelo: string | null;
  razon?: string | null;
}

export interface SugerirVueloResult {
  sugerido: VueloSugerido | null;
  candidatos: VueloSugerido[];
}

/** Sugiere el vuelo de una carga de combustible (aeronave + momento). */
export async function sugerirVueloAction(
  aeronaveId: string,
  fechaHora: string,
): Promise<ActionResult<SugerirVueloResult>> {
  try {
    const data = await apiServer<SugerirVueloResult>(
      `/v1/expenses/sugerir-vuelo?aeronave_id=${aeronaveId}&fecha_hora=${encodeURIComponent(fechaHora)}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface AsignacionCandidato {
  vuelo_id: string;
  folio: number | null;
  fecha_vuelo: string | null;
  aeronave_id: string | null;
  matricula: string | null;
  ruta: string | null;
  /** CANCELADO = el vuelo ya no voló (sus gastos sí cuentan); opcional por
   *  compatibilidad con un API anterior al campo. */
  estado?: string | null;
}

export interface SugerenciaAsignacion {
  sugerido: AsignacionCandidato | null;
  confianza: number;
  razon: string;
  fuente: "regla" | "ia";
  candidatos: AsignacionCandidato[];
}

/** Sugiere a qué vuelo/avión pertenece un gasto de la bandeja (piloto+fecha; IA si es ambiguo). */
export async function sugerirAsignacionGastoAction(
  gastoId: string,
): Promise<ActionResult<SugerenciaAsignacion>> {
  try {
    const data = await apiServer<SugerenciaAsignacion>(
      `/v1/expenses/${gastoId}/sugerir-asignacion`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface SugerenciaBandeja {
  gasto: {
    id: string;
    fecha_gasto: string | null;
    monto: number | null;
    moneda: string | null;
    categoria: string | null;
    capturo_nombre: string | null;
  };
  sugerido: AsignacionCandidato | null;
  confianza: number;
  razon: string;
  fuente: "regla" | "ia";
  candidatos: AsignacionCandidato[];
}

export interface SugerenciasBandejaResult {
  total_pendientes: number;
  resultados: SugerenciaBandeja[];
}

/** Barrido de TODA la bandeja de pendientes: sugerencia por cada gasto sin avión. */
export async function sugerirAsignacionesBandejaAction(): Promise<
  ActionResult<SugerenciasBandejaResult>
> {
  try {
    const data = await apiServer<SugerenciasBandejaResult>(
      "/v1/expenses/sugerir-asignaciones",
      { method: "POST", body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Aplica en lote las sugerencias palomeadas: avión + vuelo por gasto. */
export async function aplicarAsignacionesAction(
  items: Array<{ gasto_id: string; aeronave_id: string | null; vuelo_id: string }>,
): Promise<
  ActionResult<{ aplicados: number; fallidos: number; errores: string[] }>
> {
  let aplicados = 0;
  let fallidos = 0;
  // Motivo de cada rechazo del API tal cual (p. ej. 400: la escala del gasto
  // pertenece a otro vuelo), para mostrarlo en el toast en vez de un conteo mudo.
  const errores: string[] = [];
  for (const it of items) {
    try {
      await apiServer(`/v1/expenses/${it.gasto_id}`, {
        method: "PATCH",
        body: {
          vuelo_id: it.vuelo_id,
          ...(it.aeronave_id ? { aeronave_id: it.aeronave_id } : {}),
        },
      });
      aplicados += 1;
    } catch (err) {
      fallidos += 1;
      errores.push(fail(err).error ?? "Error desconocido");
    }
  }
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/caja-chica", "layout");
  revalidatePath("/admin/combustibles");
  return { ok: true, data: { aplicados, fallidos, errores } };
}

/**
 * Asigna la aeronave de una carga de combustible. Es LA acción central del
 * modelo por avión/mes: sin avión, la carga no entra al Balance y bloquea el
 * pre-cierre. (Quitar el avión a un GAS lo rechaza el API con 400.)
 */
export async function assignAeronaveGastoAction(
  gastoId: string,
  aeronaveId: string,
): Promise<ActionResult<Gasto>> {
  try {
    const data = await apiServer<Gasto>(`/v1/expenses/${gastoId}`, {
      method: "PATCH",
      body: { aeronave_id: aeronaveId },
    });
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Liga (o desliga) una carga de combustible a un vuelo/cotización. */
export async function assignVueloGastoAction(
  gastoId: string,
  vueloId: string | null,
): Promise<ActionResult<Gasto>> {
  try {
    const data = await apiServer<Gasto>(`/v1/expenses/${gastoId}`, {
      method: "PATCH",
      body: { vuelo_id: vueloId },
    });
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    revalidatePath("/admin/flights", "layout");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGastoAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/${id}`, { method: "DELETE" });
    revalidatePath("/admin/expenses");
    // Combustibles ofrece el MISMO menú ⋯ por carga (1-oct-2026).
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    // Nómina (15-oct-2026): «Eliminar» desde su tabla.
    revalidatePath("/admin/nomina");
    revalidatePath("/admin/flights", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export interface VueloCercano {
  id: string;
  folio: number | null;
  matricula: string | null;
  aeronave_id: string | null;
  ruta: string | null;
  fecha: string | null;
  estado: string | null;
}

/**
 * Vuelos alrededor de la fecha del gasto (±15 días) para asignar A MANO
 * cuando la sugerencia automática no encuentra match.
 *
 * Incluye CANCELADOS (regla del cliente, 28-ago): un vuelo cancelado puede
 * tener gastos reales (se voló a recoger, cancelaron, regresó ferry) y van
 * al balance igual. Se listan AL FINAL para no estorbar en el caso común; la
 * etiqueta "· CANCELADO" la pinta el selector (`vueloCercanoLabel`).
 *
 * `opts` (28-sep-2026): la «Comisión del vendedor» se paga días o semanas
 * DESPUÉS del vuelo — sus diálogos piden `VENTANA_VUELOS_COMISION` (90 días
 * atrás, 15 adelante, 500 vuelos). Sin `opts`, la ventana de siempre
 * (Paywise y demás llamadas no cambian).
 */
export async function buscarVuelosCercanosAction(
  fechaGasto: string | null,
  opts?: Partial<VentanaVuelosCercanos>,
): Promise<ActionResult<VueloCercano[]>> {
  try {
    // Argumento de server action = dato del cliente: se acota (el API
    // rechaza `limit > 500` con 400 y un rango absurdo no sirve a nadie).
    const entero = (v: unknown, def: number, min: number, max: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(max, Math.max(min, Math.trunc(v)))
        : def;
    const ventana = {
      diasAtras: entero(opts?.diasAtras, VENTANA_VUELOS_DEFAULT.diasAtras, 0, 366),
      diasAdelante: entero(
        opts?.diasAdelante,
        VENTANA_VUELOS_DEFAULT.diasAdelante,
        0,
        366,
      ),
      limit: entero(opts?.limit, VENTANA_VUELOS_DEFAULT.limit, 1, 500),
    };
    const base = fechaGasto
      ? new Date(`${fechaGasto.slice(0, 10)}T12:00:00-05:00`)
      : new Date();
    const dia = (offset: number) =>
      new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const res = await apiServer<{
      data: Array<{
        id: string;
        folio: number | null;
        estado: string;
        aeronave_id: string | null;
        aeronave_matricula?: string | null;
        origen_iata: string;
        destino_iata: string;
        ruta_iatas?: string[];
        fecha_vuelo: string | null;
      }>;
    }>("/v1/flights", {
      searchParams: {
        desde: dia(-ventana.diasAtras),
        hasta: dia(ventana.diasAdelante),
        limit: ventana.limit,
      },
      cache: "no-store",
    });
    const data = res.data
      .map((v) => ({
        id: v.id,
        folio: v.folio,
        matricula: v.aeronave_matricula ?? null,
        aeronave_id: v.aeronave_id,
        ruta:
          v.ruta_iatas && v.ruta_iatas.length > 0
            ? v.ruta_iatas.join("→")
            : `${v.origen_iata}→${v.destino_iata}`,
        fecha: v.fecha_vuelo,
        estado: v.estado,
      }))
      // sort es estable: conserva el orden del API dentro de cada grupo.
      .sort(
        (a, b) =>
          Number(a.estado === "CANCELADO") - Number(b.estado === "CANCELADO"),
      );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Reparto de gastos generales entre aviones (Otros gastos) =====

/**
 * Aviones ACTIVOS para el selector del diálogo de reparto (el diálogo se
 * autoabastece: se usa igual desde /admin/otros-gastos y desde el menú ⋯
 * de /admin/expenses).
 */
export async function listAvionesActivosAction(): Promise<
  ActionResult<Array<{ id: string; matricula: string; modelo: string }>>
> {
  try {
    const res = await listAircraft({ activa: true, limit: 100 });
    return {
      ok: true,
      data: res.data.map((a) => ({
        id: a.id,
        matricula: a.matricula,
        modelo: a.modelo,
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

/** Reparto vigente de un gasto (prellena el diálogo). */
export async function getRepartoAction(
  id: string,
): Promise<ActionResult<RepartoResponse>> {
  try {
    const data = await apiServer<RepartoResponse>(`/v1/expenses/${id}/reparto`, {
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Reemplaza TODO el reparto del gasto ([] lo quita: 100% empresa). La fila
 * del gasto nunca se parte — el reparto vive en una tabla hija, así que
 * conciliación y anti-duplicados no se enteran.
 */
export async function saveRepartoAction(
  id: string,
  items: Array<{ aeronave_id: string; monto: number }>,
): Promise<ActionResult<RepartoResponse>> {
  try {
    const data = await apiServer<RepartoResponse>(`/v1/expenses/${id}/reparto`, {
      method: "PUT",
      body: { items },
    });
    revalidatePath("/admin/otros-gastos");
    // Nómina (15-oct-2026): «Repartir entre aviones» desde su tabla.
    revalidatePath("/admin/nomina");
    revalidatePath("/admin/expenses");
    // Caja chica también monta el menú ⋯ (y «Verificar / editar»).
    revalidatePath("/admin/caja-chica", "layout");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Reparto desde «Verificar / editar» (14-oct-2026) =====

/** Motivo de un error del API para las frases del resultado. */
function motivoDeError(err: unknown): string {
  if (isApiError(err)) return mensajeErrorAccionGasto(err.status, err.message);
  return err instanceof Error ? err.message : "";
}

/** GET del reparto vigente (no-store: el panel compara contra lo que hay HOY). */
function leerReparto(id: string): Promise<RepartoResponse> {
  return apiServer<RepartoResponse>(`/v1/expenses/${id}/reparto`, { cache: "no-store" });
}

/** Relectura tras un PUT que falló: null = tampoco se pudo leer. */
async function releerRepartoSinLanzar(id: string): Promise<RepartoResponse | null> {
  try {
    return await leerReparto(id);
  } catch {
    return null;
  }
}

function revalidarReparto() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/otros-gastos");
  revalidatePath("/admin/nomina");
  revalidatePath("/admin/caja-chica", "layout");
}

/**
 * Refuerzo (caso 3 del diseño): el PUT del reparto limpia `gasto.aeronave_id`
 * pero el API no lee el error de esa limpieza. Si el gasto aún trae avión
 * individual, se quita con un PATCH (el candado del API deja pasar `null`).
 * Nunca falla el guardado: devuelve el aviso, o null.
 */
async function reforzarSinAvion(id: string): Promise<string | null> {
  try {
    const g = await apiServer<Gasto>(`/v1/expenses/${id}`, { cache: "no-store" });
    if (!g?.aeronave_id) return null;
    await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: { aeronave_id: null },
    });
    return null;
  } catch (err) {
    return textoRefuerzoAvion(motivoDeError(err));
  }
}

/**
 * Guarda «Verificar / editar» CON un cambio de reparto (crearlo, editarlo o
 * quitarlo) en UN clic. NUNCA lanza.
 *
 *  1. Valida sin red: id, base y nuevo (uuid por avión, sin repetir, monto >
 *     0 con 2 decimales, ≤ 20) y el formulario con `GastoVerifySchema`.
 *  2. Relee el reparto vigente (`GET …/reparto`, no-store).
 *  3. Si difiere de la base del diálogo ⇒ REPARTO_CAMBIO sin escribir nada.
 *  4. `planGuardadoReparto` decide el orden PATCH/PUT que no choca con los
 *     candados del API (o bloquea sin escribir).
 *  5. Ejecuta. Tras CUALQUIER falla del PUT relee el reparto y dice cómo
 *     quedó (igual al pedido ⇒ sigue; igual al anterior; distinto; no se
 *     sabe). Un PATCH con red/5xx es INCIERTO (pudo escribir).
 *  6. Refuerzo del avión individual (si el PATCH lo traía).
 *  7. Revalida Gastos, Otros gastos y Caja chica cuando escribió el reparto.
 *
 * La regla Σ ≤ monto y el remanente son del API: aquí solo se ordenan las
 * dos escrituras que ya existen.
 */
export async function guardarGastoConRepartoAction(
  id: string,
  raw: unknown,
  reparto: { base: ItemReparto[]; nuevo: ItemReparto[] },
  contexto: { riesgoConciliado: boolean },
): Promise<ResultadoGastoConReparto> {
  const pasos: PasoGuardado[] = [];
  const avisos: string[] = [];
  let gastoGuardado = false;
  let gastoData: Gasto | undefined;
  let tocoReparto = false;
  let repartoFinal: RepartoResponse | null = null;
  const resultado = (
    codigo: ResultadoGastoConReparto["codigo"],
    extra: Partial<ResultadoGastoConReparto> = {},
  ): ResultadoGastoConReparto => ({
    ok: codigo === "OK",
    codigo,
    gastoGuardado,
    gastoIncierto: false,
    repartoGuardado: pasos.includes("REPARTO"),
    repartoEstado: null,
    pasos: [...pasos],
    reparto: repartoFinal,
    ...(gastoData ? { data: gastoData } : {}),
    avisos: [...avisos],
    ...extra,
  });
  try {
    // (1) Sin red.
    const base = validarItemsReparto(reparto?.base);
    const nuevo = validarItemsReparto(reparto?.nuevo);
    if (!esUuid(id) || !base || !nuevo) {
      return resultado("BLOQUEO", { error: MSG_REPARTO_INVALIDO, reparto: null });
    }
    const parsed = GastoVerifySchema.safeParse(raw);
    if (!parsed.success) {
      return resultado("GASTO", { fieldErrors: parsed.error.flatten().fieldErrors, reparto: null });
    }
    const body = cuerpoVerificacion(parsed.data);

    // (2) El reparto de HOY.
    let actual: RepartoResponse;
    try {
      actual = await leerReparto(id);
    } catch (err) {
      return resultado("LECTURA", { error: motivoDeError(err), reparto: null });
    }
    repartoFinal = actual;
    const actualItems = itemsDeRespuesta(actual);

    // (3) Otra persona lo cambió mientras se editaba: no se escribe nada.
    if (!mismoReparto(actualItems, base)) return resultado("REPARTO_CAMBIO");

    // (4) El orden que no choca con los candados del API.
    const plan = planGuardadoReparto({
      sumaActualCents: actualItems.reduce((acc, i) => acc + centavosDe(i.monto), 0),
      montoActualCents: centavosDe(actual.gasto?.monto),
      monedaActual: String(actual.gasto?.moneda ?? ""),
      montoNuevoCents: body.monto !== undefined ? centavosDe(body.monto) : null,
      monedaNueva: body.moneda ?? null,
      categoriaNueva: body.categoria ?? String(actual.gasto?.categoria ?? ""),
      patchConAvion: !!body.aeronave_id,
      patchConVuelo: !!body.vuelo_id,
      nuevo,
      riesgoConciliado: contexto?.riesgoConciliado === true,
    });
    if (plan.tipo === "BLOQUEO") return resultado("BLOQUEO", { error: plan.mensaje });

    // (5) Las escrituras, en ese orden.
    for (const [i, paso] of plan.pasos.entries()) {
      if (paso === "GASTO") {
        const r = await patchVerificacion(id, raw);
        if (!r.ok) {
          const incierto = r.status === undefined || r.status >= 500;
          // Red o 5xx: el PATCH pudo escribir. Se revalida para que «cierra y
          // vuelve a abrir el gasto» enseñe lo que de verdad quedó (revisión
          // del 14-oct-2026: sin esto el diálogo se reabría con la fila de
          // ANTES y no había forma de revisar).
          if (incierto) revalidarVerificacion();
          if (i === 0) {
            return incierto
              ? resultado("GASTO_INCIERTO", { gastoIncierto: true, error: r.error })
              : resultado("GASTO", {
                  error: r.error,
                  fieldErrors: r.fieldErrors,
                  // 409 `MES_CERRADO` (API 0.0.88): el diálogo pinta el aviso con enlace.
                  ...(r.code ? { code: r.code, details: r.details } : {}),
                });
          }
          // El reparto ya quedó; el gasto no (o no se sabe).
          revalidarReparto();
          return resultado("PARCIAL_SOLO_REPARTO", {
            gastoIncierto: incierto,
            repartoEstado: "IGUAL_AL_NUEVO",
            error: r.error,
          });
        }
        gastoGuardado = true;
        gastoData = r.data;
        pasos.push("GASTO");
        continue;
      }
      tocoReparto = true;
      try {
        repartoFinal = await apiServer<RepartoResponse>(`/v1/expenses/${id}/reparto`, {
          method: "PUT",
          body: { items: nuevo },
        });
        pasos.push("REPARTO");
      } catch (err) {
        const motivo = motivoDeError(err);
        const releido = await releerRepartoSinLanzar(id);
        const estado = estadoRepartoTrasFalla(
          releido ? itemsDeRespuesta(releido) : null,
          base,
          nuevo,
        );
        if (estado === "IGUAL_AL_NUEVO" && releido) {
          // El PUT sí escribió (la respuesta se perdió): sigue.
          repartoFinal = releido;
          pasos.push("REPARTO");
          continue;
        }
        repartoFinal = releido;
        revalidarReparto();
        return gastoGuardado
          ? resultado("PARCIAL_SIN_REPARTO", { repartoEstado: estado, error: motivo })
          : resultado("SIN_NADA_REPARTO", { repartoEstado: estado, error: motivo });
      }
    }

    // (6) Refuerzo del avión individual (el PATCH lo traía).
    if (nuevo.length > 0 && gastoData?.aeronave_id) {
      const aviso = await reforzarSinAvion(id);
      if (aviso) avisos.push(aviso);
    }
    // (7)
    if (tocoReparto) revalidarReparto();
    return resultado("OK", { repartoEstado: "IGUAL_AL_NUEVO" });
  } catch (err) {
    // Defensivo: algo inesperado a medio camino. Se dice lo que se sabe.
    if (tocoReparto) revalidarReparto();
    const error = motivoDeError(err);
    if (!gastoGuardado && !tocoReparto) return resultado("LECTURA", { error });
    return gastoGuardado
      ? resultado("PARCIAL_SIN_REPARTO", { repartoEstado: "DESCONOCIDO", error })
      : resultado("SIN_NADA_REPARTO", { repartoEstado: "DESCONOCIDO", error });
  }
}

/** Reporte por fila del reparto masivo (el API procesa gasto por gasto). */
export interface RepartoMasivoResultado {
  procesados: number;
  exitos: number;
  errores: Array<{ gasto_id: string; error: string }>;
}

/**
 * Reparto MASIVO por porcentajes: aplica el mismo reparto (% por avión) a
 * todos los gastos seleccionados — cada gasto reparte SU propio monto y el
 * reparto vigente de cada uno se REEMPLAZA. El API reporta éxitos y errores
 * por gasto (no todo-o-nada).
 */
export async function saveRepartoMasivoAction(
  gastoIds: string[],
  items: Array<{ aeronave_id: string; porcentaje: number }>,
): Promise<ActionResult<RepartoMasivoResultado>> {
  try {
    const data = await apiServer<RepartoMasivoResultado>(
      "/v1/expenses/reparto-masivo",
      {
        method: "POST",
        body: { gasto_ids: gastoIds, items },
      },
    );
    revalidatePath("/admin/otros-gastos");
    revalidatePath("/admin/nomina");
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===================== FACTURA DE ESTE GASTO (22-sep-2026) =====================
//
// Pedido del cliente: «en los registros de gastos, además de la opción
// facturada (a un lado), agregar la opción para subir la factura
// correspondiente de dicho gasto».
//
// No hace falta ningún mecanismo nuevo: el buzón de Facturas recibidas ya
// existe. Lo que faltaba era poder hacerlo DESDE la fila del gasto, sin ir al
// buzón, buscar la factura y amarrarla a mano. Es UNA sola llamada:
//
//   POST /v1/invoices/recibidas/de-gasto
//     { gasto_id, xml_b64?, pdf_b64?, pdf_nombre? }  (al menos un archivo)
//     ⇒ la factura recibida + `gastos` amarrados + `ya_existia`
//
// POR QUÉ ESA RUTA Y NO LAS DOS DE SIEMPRE (revisión adversaria 22-sep-2026):
// `POST /recibidas` + `POST /recibidas/:id/amarrar-gastos` parecen suficientes
// y no lo son. (a) `amarrar-gastos` REEMPLAZA la lista completa de gastos de
// la factura: desde la fila de UN gasto desamarraría en silencio a los demás
// que ampara la misma factura (el caso VIP SAESA: una factura, varios
// aterrizajes). (b) El XML sería obligatorio, y hay proveedores que solo
// mandan el PDF. (c) Un UUID ya registrado respondía 409 sin salida cuando es
// justo el caso normal: la MISMA factura amparando otro gasto. (d) No había
// dónde guardar el PDF — el paso `POST /recibidas/:id/pdf` que se intentó NO
// existe en el API, así que cada PDF se perdía con un aviso de que «solo el
// PDF no se guardó».
//
// El amarre dispara el trigger `gasto_sync_facturacion` del API: el gasto
// pasa a 🟢 FACTURADA solo. El panel NO toca `estatus_facturacion` por su
// cuenta — si lo hiciera, tendría dos fuentes para el mismo semáforo.

// VARIAS FACTURAS POR GASTO (16-oct-2026, API 0.0.86): ASA entrega 5 CFDI
// por carga. El POST acepta `archivos[]` (1–10) y AGREGA (nunca reemplaza);
// el detalle del gasto trae `facturas` y nace
// `DELETE /v1/invoices/recibidas/:id/gastos/:gastoId`. Regla pura y textos
// en `lib/admin/facturas-gasto.ts`.
//
// SKEW: contra el API 0.0.85 (DTO sin `archivos` ⇒ 400 «property archivos
// should not exist») la action reintenta con el shape de SIEMPRE solo si es
// UNA factura; con varias NO sube nada y responde CODIGO_API_SIN_VARIAS (con
// el API previo la segunda reemplazaría a la primera en silencio). El 0.0.86
// con la migración pendiente responde 503 FACTURAS_GASTO_NO_DISPONIBLE ante
// varias (no escribe nada) ⇒ el mismo código; con una sola contesta
// `facturas_multiples: false` (REEMPLAZÓ) ⇒ modo LEGADO.
//
// Estas actions NO revalidan: el diálogo de facturas sigue abierto (lista,
// avisos) y quien lo abre hace `router.refresh()` al cerrarlo (convención
// «Red / API» del AGENTS.md).

export interface SubirFacturasGastoInput {
  gastoId: string;
  /** Una entrada por FACTURA (su PDF y/o su XML en base64, sin `data:`). */
  archivos: ArchivoFacturaEntrada[];
  /**
   * ¿Se vale el shape de SIEMPRE si el API rechaza `archivos`? Con el API
   * previo la factura nueva REEMPLAZA a la del gasto: solo si el gasto no
   * tiene factura o el operador CONFIRMÓ el reemplazo (revisión adversaria:
   * subir mientras la lista cargaba reemplazaba sin preguntar).
   */
  permitirLegado?: boolean;
}

export async function subirFacturasGastoAction(
  input: SubirFacturasGastoInput,
): Promise<ActionResult<ResultadoSubidaFacturas>> {
  if (!esUuid(input.gastoId)) return { ok: false, error: "Gasto inválido." };
  const archivos = (input.archivos ?? [])
    .map((a) => ({
      ...(a.xml_b64?.trim() ? { xml_b64: a.xml_b64.trim() } : {}),
      ...(a.pdf_b64?.trim() ? { pdf_b64: a.pdf_b64.trim() } : {}),
      ...(a.nombre?.trim() ? { nombre: a.nombre.trim().slice(0, 200) } : {}),
    }))
    .filter((a) => a.xml_b64 || a.pdf_b64);
  if (archivos.length === 0) {
    return {
      ok: false,
      error: "Elige al menos un archivo: el XML del CFDI o el PDF de la factura.",
    };
  }
  try {
    const resp = await apiServer<unknown>("/v1/invoices/recibidas/de-gasto", {
      method: "POST",
      body: { gasto_id: input.gastoId, archivos },
    });
    return { ok: true, data: resultadoDeRespuestaSubida(resp, "VARIAS") };
  } catch (err) {
    if (isApiError(err) && esVariasNoDisponible(err.status, err.code)) {
      return { ok: false, error: TEXTO_API_SIN_VARIAS, code: CODIGO_API_SIN_VARIAS, status: 503 };
    }
    if (!(isApiError(err) && esRechazoArchivos(err.status, err.message))) return fail(err);
    // API 0.0.85: no conoce `archivos`.
    if (archivos.length !== 1 || input.permitirLegado !== true) {
      return { ok: false, error: TEXTO_API_SIN_VARIAS, code: CODIGO_API_SIN_VARIAS, status: 400 };
    }
    try {
      const resp = await apiServer<unknown>("/v1/invoices/recibidas/de-gasto", {
        method: "POST",
        body: cuerpoLegado(input.gastoId, archivos[0]),
      });
      return { ok: true, data: resultadoDeRespuestaSubida(resp, "LEGADO") };
    } catch (err2) {
      return fail(err2);
    }
  }
}

/** Las facturas del gasto. `varias` = las nuevas se AGREGAN (0.0.86 con la
 *  migración); con el previo se arma la lista con la ÚNICA factura amarrada.
 *  `avisos` = los NO bloqueantes del API (Σ facturas vs monto). */
export interface FacturasDeGastoResultado {
  varias: boolean;
  facturas: FacturaDeGasto[];
  avisos: string[];
}

export async function facturasDeGastoAction(
  gastoId: string,
): Promise<ActionResult<FacturasDeGastoResultado>> {
  if (!esUuid(gastoId)) return { ok: false, error: "Gasto inválido." };
  try {
    const gasto = await apiServer<Record<string, unknown>>(`/v1/expenses/${gastoId}`);
    const lista = facturasDeRespuesta(gasto);
    // API 0.0.86 que NO pudo leer las facturas (bandera sin lista, o
    // `facturas_error`): es un fallo de carga, no «API previo» — tratarlo
    // como previo diría «la reemplaza» y escondería las demás facturas.
    if (!lista && (gasto?.facturas_error === true || typeof gasto?.facturas_multiples === "boolean")) {
      return { ok: false, error: TEXTO_ERROR_FACTURAS };
    }
    if (lista) {
      return {
        ok: true,
        data: {
          varias: variasDeRespuesta(gasto) ?? true,
          facturas: lista,
          avisos: avisosDeRespuesta(gasto),
        },
      };
    }
    const principal =
      typeof gasto?.factura_recibida_id === "string" ? gasto.factura_recibida_id : null;
    if (!principal) return { ok: true, data: { varias: false, facturas: [], avisos: [] } };
    const recibida = await apiServer<unknown>(`/v1/invoices/recibidas/${principal}`);
    const f = facturaDesdeRecibida(recibida);
    return { ok: true, data: { varias: false, facturas: f ? [f] : [], avisos: [] } };
  } catch (err) {
    return fail(err);
  }
}

/** «Quitar de este gasto»: la factura NO se borra (sigue en el buzón). El
 *  panel lo pregunta antes (acción destructiva ⇒ confirmación). */
export async function quitarFacturaDeGastoAction(input: {
  facturaId: string;
  gastoId: string;
}): Promise<ActionResult<null>> {
  if (!esUuid(input.facturaId) || !esUuid(input.gastoId)) {
    return { ok: false, error: "Factura o gasto inválido." };
  }
  try {
    await apiServer(`/v1/invoices/recibidas/${input.facturaId}/gastos/${input.gastoId}`, {
      method: "DELETE",
    });
    return { ok: true, data: null };
  } catch (err) {
    // API previo: la ruta no existe («Cannot DELETE …»).
    if (isApiError(err) && err.status === 404 && /cannot delete/i.test(err.message)) {
      return { ok: false, error: TEXTO_QUITAR_NO_DISPONIBLE };
    }
    // 404 FACTURA_NO_LIGADA / 409 GASTO_FACTURAS_CAMBIARON (otra persona ya
    // la quitó): con código, para que el diálogo recargue la lista.
    return failConCodigo(err);
  }
}

/**
 * «Marcar pagado» (19-oct-2026, API 0.0.95, gastos «por pagar»): `PATCH
 * /v1/expenses/:id` con `{por_pagar: false, fecha_gasto, if_updated_at?}`
 * EXACTO (`cuerpoMarcarPagado`). La fecha es la del PAGO real (≤ hoy
 * Cancún): se valida ANTES de la red junto con el uuid. El API aplica las
 * reglas de un cambio de fecha (mes cerrado, semana, reposición de caja
 * chica…) y el control de versión (409 `CONFLICTO_VERSION`). Nunca lanza;
 * en el éxito revalida lo mismo que «Verificar / editar»; un rechazo
 * conserva code/status/details (el diálogo decide el texto con
 * `mensajeErrorMarcarPagado`) y una falla sin respuesta es `SIN_CONEXION`
 * (pudo escribirse: el diálogo recarga).
 */
export async function marcarPagadoGastoAction(
  id: string,
  input: { fecha_gasto: string; if_updated_at?: string | null },
): Promise<ActionResult<Gasto>> {
  const invalido = validarMarcarPagado(id, input);
  if (invalido) return { ok: false, error: invalido, code: "ENTRADA_INVALIDA", status: 400 };
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: cuerpoMarcarPagado({ fecha_gasto: input.fecha_gasto, if_updated_at: input.if_updated_at }),
    });
    revalidarVerificacion();
    return { ok: true, data: updated };
  } catch (err) {
    if (isApiError(err)) return failConCodigo<Gasto>(err);
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido", code: "SIN_CONEXION" };
  }
}

// ---------------------------------------------------------------------------
// CATÁLOGOS EN LÍNEA DESDE EL GASTO (20-oct-2026, API 0.0.100, invariante 98
// del API): la cuenta de donde salió el pago y el proveedor se eligen, se
// agregan y (el proveedor) se corrigen sin salir del formulario. NO
// revalidan: las llama un diálogo que sigue abierto (el selector actualiza su
// copia local del catálogo). Nunca lanzan; conservan code/status/details.
// ---------------------------------------------------------------------------

function failCatalogo<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      status: err.status,
      details: err.details,
    };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/** Opciones del selector «Cuenta de donde salió» (sin número ni CLABE). */
export async function listCuentasGastoAction(): Promise<ActionResult<OpcionCuentaGasto[]>> {
  try {
    const r = await apiServer<{ data: OpcionCuentaGasto[] }>("/v1/bank-accounts/opciones", {
      cache: "no-store",
    });
    return { ok: true, data: r.data ?? [] };
  } catch (err) {
    return failCatalogo(err);
  }
}

/** Alta rápida de una cuenta bancaria desde el gasto. */
export async function crearCuentaGastoAction(
  form: FormCuentaRapida,
): Promise<ActionResult<OpcionCuentaGasto>> {
  const errores = erroresCuentaRapida(form);
  const primero = Object.values(errores)[0];
  if (primero) return { ok: false, error: primero, code: "ENTRADA_INVALIDA", status: 400 };
  try {
    const r = await apiServer<Record<string, unknown>>("/v1/bank-accounts", {
      method: "POST",
      body: cuerpoCuentaRapida(form),
    });
    const numero = typeof r.numero_cuenta === "string" ? r.numero_cuenta.replace(/\D/g, "") : "";
    return {
      ok: true,
      data: {
        id: String(r.id),
        alias: String(r.alias ?? form.alias.trim()),
        banco: (r.banco as string | null) ?? null,
        moneda: (r.moneda as string | null) ?? null,
        tipo: (r.tipo as string | null) ?? form.tipo,
        razon_social: (r.razon_social as string | null) ?? null,
        activa: r.activa !== false,
        terminacion: numero.length >= 4 ? numero.slice(-4) : null,
      },
    };
  } catch (err) {
    return failCatalogo(err);
  }
}

/** Ficha de un proveedor para corregirlo desde el gasto. */
export async function obtenerProveedorAction(
  id: string,
): Promise<ActionResult<Record<string, unknown>>> {
  if (!esUuid(id)) return { ok: false, error: "Proveedor inválido.", status: 400 };
  try {
    const r = await apiServer<Record<string, unknown>>(`/v1/providers/${id}`, {
      cache: "no-store",
    });
    return { ok: true, data: r };
  } catch (err) {
    return failCatalogo(err);
  }
}

/** Alta rápida (sin `id`) o corrección (con `id`, solo lo que cambió). */
export async function guardarProveedorGastoAction(input: {
  id?: string | null;
  form: FormProveedorRapido;
  base?: FormProveedorRapido | null;
}): Promise<ActionResult<{ id: string; nombre: string }>> {
  const errores = erroresProveedorRapido(input.form, [], input.id ?? null);
  const primero = Object.values(errores)[0];
  if (primero) return { ok: false, error: primero, code: "ENTRADA_INVALIDA", status: 400 };
  if (input.id && !esUuid(input.id)) {
    return { ok: false, error: "Proveedor inválido.", status: 400 };
  }
  try {
    const cuerpo = cuerpoProveedorRapido(input.form, input.id ? (input.base ?? null) : null);
    if (input.id && Object.keys(cuerpo).length === 0) {
      return { ok: true, data: { id: input.id, nombre: input.form.nombre.trim() } };
    }
    const r = await apiServer<Record<string, unknown>>(
      input.id ? `/v1/providers/${input.id}` : "/v1/providers",
      { method: input.id ? "PATCH" : "POST", body: cuerpo },
    );
    return { ok: true, data: { id: String(r.id), nombre: String(r.nombre ?? input.form.nombre.trim()) } };
  } catch (err) {
    return failCatalogo(err);
  }
}
