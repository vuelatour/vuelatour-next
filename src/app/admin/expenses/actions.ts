"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { GastoCreateSchema, GastoVerifySchema } from "./schema";
import type { EstatusFacturacion } from "@/lib/admin/facturacion-estatus";
import { listAircraft } from "@/lib/api/aircraft";
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
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
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
 */
export async function createGastoAction(
  raw: unknown,
  reparto?: Array<{ aeronave_id: string; monto: number }>,
): Promise<ActionResult<Gasto> & { repartoError?: string }> {
  const parsed = GastoCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
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
      revalidatePath("/admin/otros-gastos");
    }
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    return repartoError !== undefined
      ? { ok: true, data: created, repartoError }
      : { ok: true, data: created };
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
  conceptos?: { concepto: string; monto: number }[];
  /** Desglose compuesto por el API (regla FBO/TUA) tal como irá en notas. */
  desglose_lineas?: string[];
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
  const parsed = GastoVerifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
    revalidatePath("/admin/flights", "layout");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
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
    revalidatePath("/admin/caja-chica", "layout");
    revalidatePath("/admin/gastos-personales");
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
 */
export async function buscarVuelosCercanosAction(
  fechaGasto: string | null,
): Promise<ActionResult<VueloCercano[]>> {
  try {
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
      searchParams: { desde: dia(-15), hasta: dia(15), limit: 100 },
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
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
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

export interface FacturaDeGastoInput {
  /** XML del CFDI en base64 SIN el prefijo `data:`. De él salen `uuid_fiscal`,
      emisor y total; puede faltar si se sube solo el PDF. */
  xml_b64?: string;
  /** PDF de la factura en base64 (el que manda impreso el proveedor). */
  pdf_b64?: string;
  /** Nombre original del PDF (queda en las notas de la factura). */
  pdf_nombre?: string;
}

export interface FacturaDeGastoResultado {
  factura_id: string;
  /** true = ese CFDI ya estaba en el buzón y solo se le sumó este gasto. */
  ya_existia: boolean;
}

interface RecibidaDeGastoResp {
  id: string;
  ya_existia?: boolean;
}

export async function subirFacturaGastoAction(
  gastoId: string,
  input: FacturaDeGastoInput,
): Promise<ActionResult<FacturaDeGastoResultado>> {
  const xml = input.xml_b64?.trim();
  const pdf = input.pdf_b64?.trim();
  if (!xml && !pdf) {
    return {
      ok: false,
      error: "Elige al menos un archivo: el XML del CFDI o el PDF de la factura.",
    };
  }
  try {
    const factura = await apiServer<RecibidaDeGastoResp>(
      "/v1/invoices/recibidas/de-gasto",
      {
        method: "POST",
        body: {
          gasto_id: gastoId,
          ...(xml ? { xml_b64: xml } : {}),
          ...(pdf ? { pdf_b64: pdf } : {}),
          ...(pdf && input.pdf_nombre ? { pdf_nombre: input.pdf_nombre } : {}),
        },
      },
    );
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/facturas-recibidas");
    revalidatePath("/admin/flights", "layout");
    return {
      ok: true,
      data: { factura_id: factura.id, ya_existia: factura.ya_existia === true },
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * «Ver factura» desde la fila de un gasto ya amarrado: pide la factura
 * recibida y FIRMA su archivo (el bucket `facturas` es privado). Se prefiere
 * el PDF —es el papel que la oficina enseña— y se cae al XML.
 */
export async function verFacturaGastoAction(
  facturaRecibidaId: string,
): Promise<ActionResult<string>> {
  try {
    const factura = await apiServer<{
      xml_url?: string | null;
      pdf_url?: string | null;
    }>(`/v1/invoices/recibidas/${facturaRecibidaId}`);
    const path = factura.pdf_url ?? factura.xml_url ?? null;
    if (!path) {
      return {
        ok: false,
        error: "Esa factura no tiene archivo guardado (se registró sin XML ni PDF).",
      };
    }
    const urls = await apiServer<Record<string, string>>(
      "/v1/invoices/recibidas/file-urls",
      { method: "POST", body: { paths: [path] } },
    );
    const url = urls[path];
    if (!url) return { ok: false, error: "No se pudo abrir el archivo de la factura." };
    return { ok: true, data: url };
  } catch (err) {
    return fail(err);
  }
}
