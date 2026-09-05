import type { MetodoPago, TipoParada, TipoTarifa, TuaLinea } from "@/types/quote";
import type {
  AvionArmado,
  AvionGrupoDetalle,
  GrupoDetalle,
  MonedaGrupo,
  MotivoCongelado,
  RepartoExtraGrupo,
  RotacionesGrupo,
} from "@/types/grupos";
import { isoToCancunInput } from "@/lib/datetime";
import { MOTIVO_CONGELADO_LABEL } from "@/lib/admin/grupos-ui";
import { METODOS_PAGO } from "@/lib/admin/metodos-pago";

/**
 * Tipos del FORMULARIO de la cotización de GRUPO (wizard de una pantalla).
 * Solo estado de captura: los totales, el consolidado, las salidas
 * escalonadas y el precio por persona los devuelve el API (`/v1/grupos/armar`)
 * y el panel únicamente los pinta.
 *
 * Fechas: los campos de fecha guardan el string de `datetime-local`
 * ("YYYY-MM-DDTHH:mm", pared Cancún) y se convierten con
 * `cancunInputToIso` SOLO al armar el payload.
 */

// =====================================================================
// Catálogos que recibe el formulario (viewmodels serializables del server)
// =====================================================================

export interface ClienteOption {
  id: string;
  nombre: string;
  es_broker: boolean;
  es_interno?: boolean;
  rfc: string | null;
}

export interface AeronaveOption {
  id: string;
  matricula: string;
  modelo: string;
  asientos: number;
  velocidad_crucero_kts: number;
  tarifa_hora_pub_usd: number | null;
  tarifa_hora_broker_usd: number | null;
  /** false = dada de baja (solo aparece en revise si un hijo la usa). */
  activa: boolean;
}

export interface PilotoOption {
  id: string;
  nombre: string;
  es_piloto_externo?: boolean;
}

export interface AeropuertoOption {
  iata: string;
  nombre: string;
  latitud: number | string | null;
  longitud: number | string | null;
}

export interface RutaOption {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  tramos?: { origen_iata: string; destino_iata: string; millas_nauticas: number }[];
}

// =====================================================================
// Valores del formulario
// =====================================================================

/** Tramo de la plantilla comercial (sin pasajeros ni fecha: los fija el armador). */
export interface PlantillaTramoForm {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: number | null;
  tipo_parada: TipoParada;
  servicio_notas: string;
  /** Nota operativa del tramo (la ve el piloto). */
  notas: string;
  /** Oculto en el PDF del cliente (se cobra igual). */
  pdf_oculto: boolean;
}

export interface ExtraGrupoForm {
  /** Llave estable de React (id del API o generada al agregar). */
  uid: string;
  /** Id del API (revise): conservarlo mantiene la liga con los hijos. */
  id?: string;
  concepto: string;
  /** Unitario NATIVO en `moneda`. "" = sin capturar. */
  unitario: number | "";
  /** Solo cuando NO es por persona. */
  cantidad: number | "";
  moneda: MonedaGrupo;
  aplica_iva: boolean;
  por_persona: boolean;
  reparto: RepartoExtraGrupo;
}

export interface AvionForm {
  /** Llave estable de React (vuelo_id del hijo o generada al agregar). */
  uid: string;
  /** Hijo existente (solo revise). null = avión nuevo. */
  vuelo_id: string | null;
  /** Folio del hijo (solo revise, informativo). */
  folio: number | null;
  aeronave_id: string;
  pax: number;
  rotaciones: RotacionesGrupo;
  piloto_id: string | null;
  copiloto_id: string | null;
  /** datetime-local explícito; "" = la escalona el armador. */
  fecha_salida_plan: string;
  tarifa_hora_override_usd: number | null;
  tiempo_cobrable_override_hr: number | null;
  /** Usarlo aunque tenga discrepancia ALTA (confirmado por la oficina). */
  aceptar_discrepancia_alta: boolean;
  /** Solo revise: el hijo NO se edita desde el grupo (motivo). null = editable. */
  congelado: MotivoBloqueoAvion | null;
  /** Solo revise: precio/tarifa vigentes del hijo (informativos). */
  total_actual_usd: number | null;
  tarifa_actual_usd: number | null;
}

export interface GrupoFormValues {
  cliente_id: string;
  nombre: string;
  /** datetime-local (pared Cancún). */
  fecha_vuelo: string;
  pasajeros_total: number | "";
  tarifa_tipo: TipoTarifa;
  metodo_pago: MetodoPago;
  metodo_pago_detalle: string;
  tc_usd_mxn: number | "";
  pase_abordar: boolean;
  escalas_plantilla: PlantillaTramoForm[];
  extras_grupo: ExtraGrupoForm[];
  /** Pre-IVA; negativo = descuento. */
  ajuste_grupo_usd: number | "";
  /** TUAS capturadas por aeropuerto (misma línea del cotizador de un avión);
   *  vacío = catálogo. Solo viajan las completas (ver `tuasLineasAPayload`). */
  tuas_lineas: TuaLinea[];
  aviones: AvionForm[];
  notas: string;
  notas_internas: string;
  /** Solo alta: los hijos nacen RESERVA (flota apartada, precio abierto). */
  apartar: boolean;
  pdf_mostrar_anexo_aviones: boolean;
  pdf_mostrar_subtotal_por_avion: boolean;
  pdf_mostrar_precio_por_persona: boolean;
  pdf_mostrar_tarifa: boolean;
  /** Solo revise (obligatorio, ≥3). */
  motivo: string;
  /** Solo revise: aplicar solo a los hijos editables si hay congelados. */
  solo_editables: boolean;
}

// =====================================================================
// Bloqueo de una fila en revisión
// =====================================================================

/**
 * Por qué una fila de avión NO se edita desde el wizard: los motivos de
 * `congelado` que manda el API (facturado / cobrado / mes cerrado) MÁS los
 * hijos que ya salieron. El API solo marca `congelado` por dinero; un hijo
 * COMPLETADO o EN_VUELO no se puede quitar (409 HIJOS_CONGELADOS) ni tiene
 * sentido recotizarlo, así que aquí también se bloquea.
 */
export type MotivoBloqueoAvion = MotivoCongelado | "EN_VUELO";

export const MOTIVO_BLOQUEO_LABEL: Record<MotivoBloqueoAvion, string> = {
  ...MOTIVO_CONGELADO_LABEL,
  EN_VUELO: "en vuelo",
};

/** Motivo de bloqueo de un hijo del detalle (null = editable). */
export function bloqueoDeHijo(a: AvionGrupoDetalle): MotivoBloqueoAvion | null {
  if (a.congelado) return a.congelado;
  if (a.estado === "COMPLETADO") return "COMPLETADO";
  if (a.estado === "EN_VUELO") return "EN_VUELO";
  return null;
}

// =====================================================================
// Llaves de React para filas agregadas en runtime
// =====================================================================

let seqUid = 0;
/** Llave local (no viaja al API). */
export function nuevoUid(prefix: string): string {
  seqUid += 1;
  return `${prefix}-${Date.now().toString(36)}-${seqUid}`;
}

// =====================================================================
// Defaults
// =====================================================================

export const PERNOCTA_COSTO_DEFAULT_USD = 150;

export function tramoVacio(origen = "CUN"): PlantillaTramoForm {
  return {
    origen_iata: origen,
    destino_iata: "",
    millas_nauticas: 0,
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: "",
    notas: "",
    pdf_oculto: false,
  };
}

export function extraVacio(concepto = ""): ExtraGrupoForm {
  return {
    uid: nuevoUid("extra"),
    concepto,
    unitario: "",
    cantidad: "",
    moneda: "USD",
    aplica_iva: true,
    por_persona: true,
    reparto: "POR_PAX",
  };
}

/** Avión nuevo a partir de una aeronave elegida (pax sugerido por el padre). */
export function avionNuevo(aeronaveId: string, pax: number): AvionForm {
  return {
    uid: nuevoUid("avion"),
    vuelo_id: null,
    folio: null,
    aeronave_id: aeronaveId,
    pax: Math.max(1, Math.floor(pax)),
    rotaciones: 1,
    piloto_id: null,
    copiloto_id: null,
    fecha_salida_plan: "",
    tarifa_hora_override_usd: null,
    tiempo_cobrable_override_hr: null,
    aceptar_discrepancia_alta: false,
    congelado: null,
    total_actual_usd: null,
    tarifa_actual_usd: null,
  };
}

/**
 * Adopta la propuesta del armador (POST /armar sin aviones) como filas
 * editables. Piloto/copiloto NO se preasignan (el sugerido se ofrece en la
 * fila); la salida queda en automático (el armador la escalona).
 */
export function avionDeArmado(a: AvionArmado): AvionForm {
  return {
    uid: a.vuelo_id ?? nuevoUid("avion"),
    vuelo_id: a.vuelo_id,
    folio: null,
    aeronave_id: a.aeronave.id,
    pax: a.pax,
    rotaciones: a.rotaciones,
    piloto_id: a.piloto_id,
    copiloto_id: a.copiloto_id,
    fecha_salida_plan: "",
    tarifa_hora_override_usd: null,
    tiempo_cobrable_override_hr: null,
    aceptar_discrepancia_alta: false,
    congelado: null,
    total_actual_usd: null,
    tarifa_actual_usd: null,
  };
}

export function defaultsNuevoGrupo(): GrupoFormValues {
  return {
    cliente_id: "",
    nombre: "",
    fecha_vuelo: "",
    pasajeros_total: "",
    tarifa_tipo: "PUBLICO",
    metodo_pago: "TRANSFERENCIA",
    metodo_pago_detalle: "",
    tc_usd_mxn: "",
    pase_abordar: false,
    escalas_plantilla: [tramoVacio()],
    extras_grupo: [],
    ajuste_grupo_usd: "",
    tuas_lineas: [],
    aviones: [],
    notas: "",
    notas_internas: "",
    apartar: false,
    pdf_mostrar_anexo_aviones: true,
    pdf_mostrar_subtotal_por_avion: false,
    pdf_mostrar_precio_por_persona: true,
    pdf_mostrar_tarifa: false,
    motivo: "",
    solo_editables: false,
  };
}

/**
 * Precarga desde el detalle del grupo (revise). Los hijos vivos entran con
 * su `vuelo_id` (actualizar, no recrear); los cancelados se omiten. La
 * salida por avión queda en automático: el API conserva la del hijo (con el
 * desfase si cambia la fecha del grupo) cuando no viaja explícita.
 */
export function defaultsDesdeGrupo(g: GrupoDetalle): GrupoFormValues {
  const vivos = g.aviones
    .filter((a) => !a.cancelado)
    .sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
  const hayCongelados = vivos.some((a) => bloqueoDeHijo(a) != null);
  return {
    cliente_id: g.cliente_id,
    nombre: g.nombre ?? "",
    fecha_vuelo: isoToCancunInput(g.fecha_vuelo),
    pasajeros_total: g.pasajeros_total,
    tarifa_tipo: g.tarifa_tipo,
    metodo_pago: g.metodo_cobro ?? "TRANSFERENCIA",
    // El detalle manual de OTRO vive en cada hijo (no en la cabecera).
    metodo_pago_detalle: "",
    tc_usd_mxn: g.tc_usd_mxn ?? "",
    pase_abordar: g.pase_abordar,
    escalas_plantilla:
      g.escalas_plantilla.length > 0
        ? g.escalas_plantilla.map((t) => ({
            origen_iata: t.origen_iata,
            destino_iata: t.destino_iata,
            millas_nauticas: Number(t.millas_nauticas) || 0,
            es_ferry: t.es_ferry === true,
            requiere_pernocta: t.requiere_pernocta === true,
            pernocta_costo_usd:
              t.pernocta_costo_usd == null ? null : Number(t.pernocta_costo_usd),
            tipo_parada: t.tipo_parada ?? "NORMAL",
            servicio_notas: t.servicio_notas ?? "",
            notas: t.notas ?? "",
            pdf_oculto: t.pdf_oculto === true,
          }))
        : [tramoVacio()],
    extras_grupo: g.extras_grupo.map((e) => ({
      uid: e.id,
      id: e.id,
      concepto: e.concepto,
      unitario: e.unitario,
      cantidad: e.cantidad ?? "",
      moneda: e.moneda,
      aplica_iva: e.aplica_iva,
      por_persona: e.por_persona,
      reparto: e.reparto,
    })),
    ajuste_grupo_usd: g.ajuste_grupo_usd || "",
    // Precarga de las TUAS capturadas (ya normalizadas por el API); API
    // previo sin el campo ⇒ catálogo.
    tuas_lineas: (g.tuas_lineas ?? []).map((l) => ({
      iata: l.iata,
      monto_pax: Number(l.monto_pax) || 0,
      moneda: l.moneda === "MXN" ? "MXN" : "USD",
    })),
    aviones: vivos.map((a) => ({
      uid: a.vuelo_id,
      vuelo_id: a.vuelo_id,
      folio: a.folio,
      aeronave_id: a.aeronave?.id ?? a.aeronave_cotizada_id ?? "",
      pax: Math.max(1, a.pax ?? a.pasajeros ?? 1),
      rotaciones: a.rotaciones === 2 ? 2 : 1,
      piloto_id: a.piloto?.id ?? null,
      copiloto_id: a.copiloto?.id ?? null,
      fecha_salida_plan: "",
      tarifa_hora_override_usd: null,
      tiempo_cobrable_override_hr: null,
      aceptar_discrepancia_alta: false,
      congelado: bloqueoDeHijo(a),
      total_actual_usd: a.total_usd,
      tarifa_actual_usd: a.tarifa_hora_usd,
    })),
    notas: g.notas ?? "",
    notas_internas: g.notas_internas ?? "",
    apartar: false,
    pdf_mostrar_anexo_aviones: g.pdf_mostrar_anexo_aviones,
    pdf_mostrar_subtotal_por_avion: g.pdf_mostrar_subtotal_por_avion,
    pdf_mostrar_precio_por_persona: g.pdf_mostrar_precio_por_persona,
    pdf_mostrar_tarifa: g.pdf_mostrar_tarifa,
    motivo: "",
    // Con hijos congelados el API exige solo_editables para guardar: arranca
    // prendido y la sección de revisión lo explica.
    solo_editables: hayCongelados,
  };
}

// =====================================================================
// Etiquetas compartidas
// =====================================================================

/** Métodos de pago del selector (fuente única `@/lib/admin/metodos-pago`). */
export const METODOS_PAGO_GRUPO = METODOS_PAGO;

/** Llave con la que el armador identifica la fila i (misma regla del API). */
export function keyDeAvion(a: AvionForm, index: number): string {
  return a.vuelo_id ?? `nuevo-${index + 1}`;
}

/** Σ pax capturados por avión (conteo de personas, no dinero). */
export function sumaPax(aviones: AvionForm[]): number {
  return aviones.reduce((s, a) => s + (Number(a.pax) || 0), 0);
}
