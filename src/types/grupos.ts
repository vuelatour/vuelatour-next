/**
 * Cotización de GRUPO (4-sep-2026, Enfoque A) — tipos 1:1 con el contrato
 * del API `/v1/grupos` (vuelatour-api/src/modules/groups).
 *
 * Principio rector: la cabecera `vuelo_grupo` NO tiene dinero ni estado;
 * cada peso vive en un vuelo hijo (uno por avión) y el API devuelve el
 * consolidado, los totales y el precio por persona YA calculados. El panel
 * SOLO PINTA: jamás recalcular totales en cliente.
 *
 * Fechas: ISO (el panel convierte pared Cancún con `cancunInputToIso` /
 * `isoToCancunInput` de `@/lib/datetime`).
 */

import type { MetodoPago, QuoteBreakdown, TipoParada, TipoTarifa, TuaLinea } from "./quote";
import type { EstadoVuelo } from "./quotes-persisted";

// =====================================================================
// Enumeraciones
// =====================================================================

/** Estado del grupo DERIVADO de sus hijos (la cabecera no lo guarda). */
export type EstadoGrupo =
  | "RESERVA"
  | "COTIZADO"
  | "CONFIRMADO_PARCIAL"
  | "CONFIRMADO"
  | "EN_CURSO"
  | "COMPLETADO"
  | "CANCELADO";

/**
 * Cómo se materializa un extra del grupo en los hijos:
 * - POR_PAX (default): por persona ⇒ cada hijo recibe cantidad = sus pax.
 *   Con cantidad explícita equivale a PROPORCIONAL.
 * - PROPORCIONAL: el monto total se reparte por pax con pesos exactos
 *   (residuo al ancla).
 * - ANCLA: toda la línea al avión ancla.
 */
export type RepartoExtraGrupo = "POR_PAX" | "ANCLA" | "PROPORCIONAL";

export type MonedaGrupo = "USD" | "MXN";

/** 2 = doble rotación (el avión da dos vueltas porque no cabe todo). */
export type RotacionesGrupo = 1 | 2;

/** Modo de reemplazo de avión de un hijo. */
export type ModoReemplazoAvion = "SIMPLE" | "ULTIMO_MINUTO";

/** Semáforo BÁSICO de cobro que manda el API por hijo (el panel puede
 *  recomponer `estadoCobroSemaforo` con las entradas crudas). */
export type SemaforoCobroBasico = "gris" | "verde" | "ambar" | "rojo";

/** Por qué un hijo NO se puede revisar/cancelar desde el grupo. */
export type MotivoCongelado = "ya facturado" | "ya cobrado" | "mes cerrado" | "COMPLETADO";

export type EstadoPermisoHijo = "no_aplica" | "pendiente" | "emitido";

// =====================================================================
// Inputs (DTOs del API) — el ValidationPipe es whitelist + forbidNonWhitelisted:
// mandar un campo que no esté aquí = 400.
// =====================================================================

/**
 * Tramo de la PLANTILLA comercial común del grupo (= EscalaInputDto).
 * `pasajeros` y `fecha_salida_plan` NO se mandan: los fija el armador por
 * avión. `pdf_oculto` sí viaja (el hijo lo hereda en sus tramos).
 */
export interface EscalaPlantillaInput {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_ferry?: boolean;
  requiere_pernocta?: boolean;
  pernocta_costo_usd?: number;
  tipo_parada?: TipoParada;
  servicio_notas?: string;
  notas?: string;
  pdf_oculto?: boolean;
}

/** Extra de la CABECERA (nunca guarda un monto total: se materializa). */
export interface ExtraGrupoInput {
  /** Conservarlo al revisar mantiene la liga con las líneas ya
   *  materializadas en los hijos; si falta el server lo genera. */
  id?: string;
  /** 1..120 caracteres. */
  concepto: string;
  /** Cantidad TOTAL del grupo (≥0). Obligatoria si por_persona=false; con
   *  por_persona=true se ignora (cantidad = pasajeros_total). */
  cantidad?: number;
  /** Precio unitario NATIVO en `moneda` (≥0). */
  unitario: number;
  /** Default USD. */
  moneda?: MonedaGrupo;
  /** Default true. */
  aplica_iva?: boolean;
  /** Default true ⇒ cantidad total = pasajeros_total. */
  por_persona?: boolean;
  /** Default POR_PAX. */
  reparto?: RepartoExtraGrupo;
}

/** Un avión del grupo (= un vuelo hijo). */
export interface AvionGrupoInput {
  /** SOLO al revisar: id del hijo existente. Sin él es un avión NUEVO; los
   *  hijos vivos que no vengan en la lista se CANCELAN. */
  vuelo_id?: string;
  /** Aeronave propia activa. */
  aeronave_id: string;
  /** Personas de ESTE avión en todas sus vueltas (int ≥1). Σ pax ==
   *  pasajeros_total al crear (409 PAX_NO_CUADRAN). */
  pax: number;
  /** Default 1. 2 exige plantilla ida y vuelta. */
  rotaciones?: RotacionesGrupo;
  piloto_id?: string | null;
  copiloto_id?: string | null;
  /** Tarifa por hora pactada para este avión (USD). */
  tarifa_hora_override_usd?: number;
  /** Horas cobrables pactadas (≤48). */
  tiempo_cobrable_override_hr?: number;
  /** ISO. Si falta, el armador escalona (10 min entre aviones; el de doble
   *  vuelta primero). */
  fecha_salida_plan?: string;
  /** Usar el avión AUNQUE tenga discrepancia ALTA sin resolver (409
   *  SQUAWK_ALTA_SIN_RESOLVER sin ella al escribir; en preview es aviso). */
  aceptar_discrepancia_alta?: boolean;
}

/** Body de POST /v1/grupos/armar (preview sin escribir). */
export interface ArmarGrupoInput {
  cliente_id: string;
  /** ISO (pared Cancún ya convertida con cancunInputToIso). */
  fecha_vuelo: string;
  /** int 1..500 */
  pasajeros_total: number;
  /** 1..20 tramos. */
  escalas_plantilla: EscalaPlantillaInput[];
  tarifa_tipo: TipoTarifa;
  /** Decide el IVA como el cotizador. */
  metodo_pago: MetodoPago;
  /** Obligatorio con metodo_pago = OTRO (≤80). Se persiste en cada hijo. */
  metodo_pago_detalle?: string;
  /** TC MXN por USD del grupo (>0). */
  tc_usd_mxn?: number;
  pase_abordar?: boolean;
  /** ≤30 */
  extras_grupo?: ExtraGrupoInput[];
  /** Pre-IVA, negativo = descuento; repartido por base gravable con pesos
   *  exactos (residuo al ancla). Máx 2 decimales. */
  ajuste_grupo_usd?: number;
  /**
   * TUAS capturadas POR AEROPUERTO (5-sep-2026): MISMO `TuaLinea` del
   * cotizador de un avión (≤20). Viajan tal cual al motor de cada hijo, que
   * resuelve su exención XA/XB/N con SU matrícula. Una línea MXN > 0 exige
   * `tc_usd_mxn` (400 del motor, igual que el cotizador).
   */
  tuas_lineas?: TuaLinea[];
  /** ≤20. Vacío/omitido en /armar ⇒ el server PROPONE flota. */
  aviones?: AvionGrupoInput[];
}

/** Body de POST /v1/grupos. `aviones` OBLIGATORIO y Σ pax == pasajeros_total. */
export interface CreateGrupoInput extends ArmarGrupoInput {
  /** 2..120 */
  nombre: string;
  aviones: AvionGrupoInput[];
  /** Visibles al cliente (PDF), ≤2000. */
  notas?: string;
  /** ≤2000 */
  notas_internas?: string;
  /** Los hijos nacen RESERVA con precio calculado y cotización abierta;
   *  confirmar el grupo los promueve. Default false = nacen COTIZADO. */
  apartar?: boolean;
  /** Default true. */
  pdf_mostrar_anexo_aviones?: boolean;
  /** Default false. */
  pdf_mostrar_subtotal_por_avion?: boolean;
  /** Default true. */
  pdf_mostrar_precio_por_persona?: boolean;
  /** Default false. */
  pdf_mostrar_tarifa?: boolean;
}

/**
 * Body de POST /v1/grupos/:id/revise. Todo opcional salvo `motivo`; lo que
 * no viaja se conserva. `aviones[]`: con vuelo_id actualiza ese hijo; sin
 * vuelo_id crea; hijos vivos ausentes se CANCELAN; omitir la lista =
 * re-materializar los vivos tal como están. `extras_grupo` REEMPLAZA la
 * lista completa.
 */
export interface ReviseGrupoInput {
  /** 3..500 (obligatorio). */
  motivo: string;
  nombre?: string;
  fecha_vuelo?: string;
  pasajeros_total?: number;
  escalas_plantilla?: EscalaPlantillaInput[];
  tarifa_tipo?: TipoTarifa;
  metodo_pago?: MetodoPago;
  metodo_pago_detalle?: string;
  tc_usd_mxn?: number;
  pase_abordar?: boolean;
  extras_grupo?: ExtraGrupoInput[];
  ajuste_grupo_usd?: number;
  /** Omitido = conserva las de la cabecera; `[]` = volver al catálogo. */
  tuas_lineas?: TuaLinea[];
  /** 1..20 */
  aviones?: AvionGrupoInput[];
  /** Si hay hijos congelados, aplicar SOLO a los editables en vez de 409
   *  HIJOS_CONGELADOS (el total del grupo cambia; el API avisa). */
  solo_editables?: boolean;
  notas?: string;
  notas_internas?: string;
  pdf_mostrar_anexo_aviones?: boolean;
  pdf_mostrar_subtotal_por_avion?: boolean;
  pdf_mostrar_precio_por_persona?: boolean;
  pdf_mostrar_tarifa?: boolean;
}

/** Query de GET /v1/grupos. */
export interface ListGruposQuery {
  cliente_id?: string;
  /** YYYY-MM-DD (día Cancún) por fecha_vuelo. */
  desde?: string;
  hasta?: string;
  /** Estado DERIVADO (filtra en memoria). */
  estado?: EstadoGrupo;
  /** Nombre o folio ("G-12" / "12"). */
  q?: string;
  /** 1..200 (50). */
  limit?: number;
  /** ≥0 (0). */
  offset?: number;
}

export interface CancelGrupoInput {
  /** 3..500 */
  motivo: string;
}

export interface FechaGrupoInput {
  /** ISO; cada hijo conserva su desfase escalonado. */
  fecha_vuelo: string;
}

export interface QuitarAvionInput {
  /** ≤500 (default "Quitado del grupo"). */
  motivo?: string;
}

/** Body de POST /v1/grupos/:id/aviones/:vueloId/reemplazar. */
export interface ReemplazarAvionInput {
  aeronave_id: string;
  piloto_id?: string;
  /** SIMPLE = mismo vuelo (assign + blanket selectivo a tramos).
   *  ULTIMO_MINUTO = clon del vuelo (el original queda CANCELADO; el clon
   *  conserva liga y ancla). */
  modo: ModoReemplazoAvion;
  /** Recotizar con el avión nuevo (solo si el hijo no está congelado; si lo
   *  está o es false, el precio se conserva y queda precio_desactualizado). */
  recotizar: boolean;
  /** ≤500 */
  motivo?: string;
  aceptar_discrepancia_alta?: boolean;
}

// =====================================================================
// Respuestas — piezas compartidas
// =====================================================================

/** Plantilla NORMALIZADA que devuelve el API (cabecera y armado). */
export interface PlantillaTramo {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  pernocta_costo_usd?: number | null;
  tipo_parada?: TipoParada | null;
  servicio_notas?: string | null;
  notas?: string | null;
  pdf_oculto?: boolean | null;
}

/** Extra de la cabecera ya normalizado (con id). */
export interface ExtraGrupoDef {
  id: string;
  concepto: string;
  /** null ⇒ por persona (= pasajeros_total). */
  cantidad: number | null;
  /** Unitario NATIVO en `moneda`. */
  unitario: number;
  moneda: MonedaGrupo;
  aplica_iva: boolean;
  por_persona: boolean;
  reparto: RepartoExtraGrupo;
}

/** Tramo ya resuelto para UN hijo (pax por tramo; ferry ⇒ 0). */
export interface TramoHijo {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  pasajeros: number;
  es_ferry: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: number | null;
  tipo_parada: TipoParada;
  servicio_notas: string | null;
  notas: string | null;
  pdf_oculto: boolean | null;
  /** ISO | null */
  fecha_salida_plan: string | null;
}

/** Línea de extra MATERIALIZADA en un hijo (viaja a `vuelo.extras[]`). */
export interface ExtraLineaHijo {
  concepto: string;
  /** Monto NATIVO (solo cuando NO viene cantidad × unitario). */
  monto_usd: number;
  cantidad?: number;
  unitario?: number;
  moneda: MonedaGrupo;
  aplica_iva: boolean;
  por_persona?: boolean;
  origen: "GRUPO";
  grupo_extra_id: string;
}

export interface DiscrepanciaAlta {
  id: string;
  descripcion: string;
}

export interface PersonaRef {
  id: string;
  nombre: string | null;
}

// ---------------------------------------------------------------------
// OPERACIÓN VISIBLE de cada línea (5-sep-2026): los números que el panel
// pinta "sutilmente" al lado del monto («44 pax × $20.85», «1.50 h ×
// $1,750.00», «16 % de $18,622.00»). Los arma el API desde los snapshots
// persistidos de los hijos; aquí SOLO se formatean (nunca se recalcula).
// ---------------------------------------------------------------------

export interface OperacionServicio {
  tipo: "SERVICIO";
  aviones: number;
  horas_total_hr: number;
}

/** Un hijo dentro del apartado TUAS de un aeropuerto. */
export interface TuasAvionConsolidado {
  key: string;
  posicion: number | null;
  matricula: string | null;
  modelo: string | null;
  pax: number;
  /** Unitario NATIVO que pagó el hijo (null si exento). */
  unitario: number | null;
  moneda: MonedaGrupo | null;
  unitario_usd: number | null;
  monto_usd: number;
  exento: boolean;
  /** Razón del motor ("Matrícula N exenta en CUN", "monto capturado"…). */
  razon: string | null;
}

export interface OperacionTuas {
  tipo: "TUAS";
  iata: string;
  /** Pax que SÍ pagaron TUA en este aeropuerto (Σ filas de los hijos). */
  pax_gravados: number;
  /** Pax de aviones exentos (prefijo XA/XB/N o pase de abordar). */
  pax_exentos: number;
  /** Unitario NATIVO común a todos los aviones gravados; null cuando NO es
   *  uniforme entre aviones (entonces manda `detalle_por_avion`). */
  unitario: number | null;
  moneda: MonedaGrupo | null;
  /** Unitario en USD (igual a `unitario` si la línea es USD). */
  unitario_usd: number | null;
  /** Σ total nativo cuando la moneda es uniforme; null si mezcla monedas. */
  total_nativo: number | null;
  aviones_exentos: {
    key: string;
    posicion: number | null;
    matricula: string | null;
    modelo: string | null;
    pax: number;
    razon: string | null;
  }[];
  detalle_por_avion: TuasAvionConsolidado[];
}

export interface OperacionExtra {
  tipo: "EXTRA";
  /** Cantidad TOTAL del grupo y unitario NATIVO común; null si no aplica. */
  cantidad: number | null;
  unitario: number | null;
  moneda: MonedaGrupo;
}

export interface OperacionIva {
  tipo: "IVA";
  /** Porcentaje 0-100 (16); null si los hijos no coinciden o no lo traen. */
  pct: number | null;
  /** Σ bases gravables de los hijos con IVA; null si algún snapshot no la trae. */
  base_usd: number | null;
}

export interface OperacionPernocta {
  tipo: "PERNOCTA";
  /** Paradas con pernocta (Σ tramos de los hijos). */
  paradas: number;
  /** Costo por parada cuando es uniforme; null si varía. */
  unitario_usd: number | null;
}

export interface OperacionAjuste {
  tipo: "AJUSTE";
  /** Base sobre la que se aplicó: servicio + TUAS + extras + comisión. */
  base_usd: number;
}

export type OperacionLinea =
  | OperacionServicio
  | OperacionTuas
  | OperacionExtra
  | OperacionIva
  | OperacionPernocta
  | OperacionAjuste;

/** Parte de un hijo (posición/matrícula/modelo) en una línea consolidada. */
export interface ParteAvionConsolidada {
  key: string;
  posicion: number | null;
  matricula: string | null;
  /** ADITIVO 5-sep: API previo no lo manda. */
  modelo?: string | null;
  monto_usd: number;
  /** TIEMPO_VUELO: horas cobrables del hijo. */
  horas_hr?: number;
  /** TIEMPO_VUELO: tarifa efectiva del hijo (solo si el snapshot la trae). */
  tarifa_hora_usd?: number;
  /** TUAS: pax del hijo en ese aeropuerto (gravados o exentos). */
  pax?: number;
  /** TUAS: el hijo quedó exento ahí (entra con monto_usd 0). */
  exento?: boolean;
}

/** Línea del desglose CONSOLIDADO (Σ por clave de los desgloses persistidos). */
export interface LineaConsolidada {
  clave:
    | "TIEMPO_VUELO"
    | "TUAS"
    | "EXTRA"
    | "COMISION_VENDEDOR"
    | "AJUSTE"
    | "IVA"
    | "PERNOCTA"
    | (string & {});
  concepto: string;
  monto_usd: number;
  cantidad?: number;
  unitario?: number;
  moneda?: MonedaGrupo;
  grupo_extra_id?: string;
  iata?: string;
  pax?: number;
  aplica_iva?: boolean;
  /** Parte de cada hijo (posición/matrícula/modelo) en esta línea. */
  por_avion: ParteAvionConsolidada[];
  /** Operación visible (presentación). Ausente en COMISION_VENDEDOR, en la
   *  línea TUAS legado "TUA" y en PERNOCTA sin tramos; también en API previo. */
  operacion?: OperacionLinea;
}

/** Apartado TUAS por aeropuerto (incluye aeropuertos donde TODOS son exentos:
 *  monto 0; el desglose NO los lista). */
export interface TuasAeropuertoConsolidado extends OperacionTuas {
  monto_usd: number;
}

/** Apartado TUAS del grupo (como el del cotizador de un avión). */
export interface ConsolidadoTuas {
  total_usd: number;
  total_mxn_nativo: number;
  /** En orden del itinerario. */
  aeropuertos: TuasAeropuertoConsolidado[];
}

/** Totales del grupo = Σ de los hijos vivos. NUNCA recalcular en cliente. */
export interface Consolidado {
  aviones: number;
  desglose: LineaConsolidada[];
  subtotal_aereo_usd: number;
  tuas_usd: number;
  extras_usd: number;
  pernocta_usd: number;
  comision_vendedor_usd: number;
  ajuste_usd: number;
  iva_usd: number;
  /** Σ totales de hijos. */
  total_usd: number;
  /** Σ; null si algún hijo no tiene TC. */
  total_mxn: number | null;
  /** total / pasajeros_total. */
  por_persona_usd: number | null;
  /** Operación del precio por persona («$21,601.52 ÷ 44»); null sin pax.
   *  ADITIVO 5-sep: ausente en API previo. */
  por_persona?: { total_usd: number; pasajeros_total: number } | null;
  /** Apartado TUAS por aeropuerto. ADITIVO 5-sep: ausente en API previo. */
  tuas?: ConsolidadoTuas;
  /** Σ horas cobrables. */
  horas_total_hr: number;
  verificacion: { suma_lineas_usd: number; total_usd: number; cuadra: boolean };
}

// =====================================================================
// POST /v1/grupos/armar — preview
// =====================================================================

export interface AeronaveArmada {
  id: string;
  matricula: string;
  modelo: string | null;
  asientos: number | null;
  velocidad_crucero_kts: number | null;
  /** Efectiva: override > preferencial > pub/broker. */
  tarifa_hora_usd: number;
}

export interface AvionArmado {
  /** 'nuevo-k' o vuelo_id (estable dentro del armado). */
  key: string;
  posicion: number;
  vuelo_id: string | null;
  aeronave: AeronaveArmada;
  pax: number;
  rotaciones: RotacionesGrupo;
  /** [pax] con 1 rotación; [w1, w2] con 2. */
  pax_por_rotacion: number[];
  piloto_id: string | null;
  copiloto_id: string | null;
  piloto_sugerido: { id: string; nombre: string } | null;
  /** ISO escalonada (doble vuelta primero, +10 min por avión). */
  fecha_salida_plan: string;
  tramos: TramoHijo[];
  extras: ExtraLineaHijo[];
  /** Parte del ajuste del grupo que le tocó. */
  ajuste_final_usd: number;
  es_ancla: boolean;
  avisos: string[];
  requiere_aceptar_discrepancia_alta: boolean;
  discrepancias_alta: DiscrepanciaAlta[];
  /** Breakdown COMPLETO del motor v1.3 para este hijo. */
  calculo: QuoteBreakdown;
}

export interface OpcionDobleRotacion {
  tipo: "DOBLE_ROTACION";
  aeronave_id: string;
  matricula: string;
  posicion: number;
  /** Pax que llevaría (los suyos + los que faltan). */
  pax: number;
  pax_por_rotacion: number[];
  /** Lo que sube el total del hijo (calculado por el motor). */
  costo_delta_usd: number;
  total_hijo_usd: number;
  horas_hr: number;
}

export interface OpcionReactivar {
  tipo: "REACTIVAR";
  aeronave_id: string;
  matricula: string;
  modelo: string | null;
  asientos: number | null;
  /** Sus asientos cubren lo que falta. */
  cubre: boolean;
}

export interface OpcionExterno {
  tipo: "EXTERNO";
  detalle: string;
}

export type OpcionCapacidad = OpcionDobleRotacion | OpcionReactivar | OpcionExterno;

export interface CapacidadArmado {
  /** Σ asientos × rotaciones. */
  asientos_total: number;
  pax_asignados: number;
  /** pasajeros_total − pax_asignados; <0 = sobran. */
  faltan: number;
  /** Solo cuando faltan > 0 (DOBLE_ROTACION ordenadas por costo, ≤4). */
  opciones: OpcionCapacidad[];
}

export interface PilotosArmado {
  activos: number;
  libres: number;
  sin_asignar: number;
  faltan: number;
}

/** Respuesta de POST /v1/grupos/armar. */
export interface ArmadoGrupo {
  cliente: { id: string; nombre: string; es_interno: boolean };
  fecha_vuelo: string;
  pasajeros_total: number;
  escalas_plantilla: PlantillaTramo[];
  tarifa_tipo: TipoTarifa;
  metodo_pago: MetodoPago;
  tc_usd_mxn: number | null;
  pase_abordar: boolean;
  extras_grupo: ExtraGrupoDef[];
  ajuste_grupo_usd: number;
  /** TUAS capturadas NORMALIZADAS (IATA mayúsculas, una por aeropuerto).
   *  ADITIVO 5-sep. */
  tuas_lineas?: TuaLinea[];
  aviones: AvionArmado[];
  consolidado: Consolidado;
  /** "Faltan N pasajeros por acomodar (x de y)", "Faltan pilotos: k de N…" */
  avisos_grupo: string[];
  capacidad: CapacidadArmado;
  pilotos: PilotosArmado;
}

// =====================================================================
// Cabecera, lista y detalle
// =====================================================================

interface GrupoCabeceraBase {
  id: string;
  folio: number;
  /** "G-12" */
  folio_texto: string;
  cliente_id: string;
  nombre: string;
  fecha_vuelo: string;
  fecha_fin: string | null;
  pasajeros_total: number;
  tarifa_tipo: TipoTarifa;
  metodo_cobro: MetodoPago | null;
  pase_abordar: boolean;
  vuelo_ancla_id: string | null;
  /** Candado optimista de la revisión. */
  version: number;
  notas: string | null;
  notas_internas: string | null;
  pdf_mostrar_anexo_aviones: boolean;
  pdf_mostrar_subtotal_por_avion: boolean;
  pdf_mostrar_precio_por_persona: boolean;
  pdf_mostrar_tarifa: boolean;
  cancelado_at: string | null;
  cancelado_motivo: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Fila de GET /v1/grupos. */
export interface GrupoListado extends GrupoCabeceraBase {
  /** Crudo de BD en la lista (numeric puede llegar como string): usar
   *  Number() al pintar. En el detalle ya viene normalizado. */
  tc_usd_mxn: number | string | null;
  ajuste_grupo_usd: number | string | null;
  cliente_nombre: string | null;
  estado: EstadoGrupo;
  /** Hijos vivos. */
  aviones: number;
  aviones_cancelados: number;
  /** Σ grupo_pax de hijos vivos. */
  pax_asignados: number;
  /** Σ totales de hijos vivos. */
  total_usd: number;
  cobrados: number;
  facturados: number;
  /** Puntos de la plantilla: ["CUN","CZA","CUN"]. */
  ruta_iatas: string[];
}

export interface GrupoListResponse {
  data: GrupoListado[];
  count: number;
  limit: number;
  offset: number;
}

export interface ClienteGrupo {
  id: string;
  nombre: string;
  razon_social_default: string | null;
  es_interno: boolean;
}

/** Un hijo en el detalle (vivos Y cancelados). */
export interface AvionGrupoDetalle {
  vuelo_id: string;
  folio: number;
  posicion: number | null;
  /** grupo_pax (todas sus vueltas). */
  pax: number | null;
  /** Máx pax por tramo (vuelo.pasajeros). */
  pasajeros: number;
  /** Derivado: 2 si tramos comerciales vivos = 3 × plantilla. */
  rotaciones: number;
  estado: EstadoVuelo;
  cancelado: boolean;
  es_ancla: boolean;
  aeronave: {
    id: string;
    matricula: string;
    modelo: string | null;
    asientos: number | null;
  } | null;
  /** Avión con el que se COTIZÓ (snapshot); ≠ aeronave.id ⇒ voló en otro. */
  aeronave_cotizada_id: string | null;
  piloto: PersonaRef | null;
  copiloto: PersonaRef | null;
  fecha_vuelo: string | null;
  fecha_fin: string | null;
  /** Salida planeada del tramo 1 (ISO). */
  salida_plan: string | null;
  total_usd: number;
  total_mxn: number | null;
  tarifa_hora_usd: number;
  horas_cobrables_hr: number;
  /** vuelo.cobrado */
  cobrado: boolean;
  /** cobrosEnUsd vía flights.cobroStatus. */
  cobrado_usd: number;
  sin_tc_count: number;
  semaforo_cobro: SemaforoCobroBasico;
  facturado: boolean;
  estado_permiso: EstadoPermisoHijo | null;
  cotizacion_version: number;
  /** Vuela en un avión distinto al cotizado sin recotizar. */
  precio_desactualizado: boolean;
  congelado: Exclude<MotivoCongelado, "COMPLETADO"> | null;
  /** Tramos vivos sin taco de llegada. */
  llegadas_faltantes: number;
  tramos_vivos: number;
  gastos: { usd: number; n: number; sin_tc: number };
  /** vuelo.extras crudo (líneas GRUPO + propias). */
  extras: unknown;
}

export interface ProblemaGrupo {
  /** SOBRE (Fase 2): un sobre de cobro descuadrado o con partes en aviones
   *  cancelados (`diagnosticoSobres` del API). */
  tipo: "PAX" | "PRECIO_DESACTUALIZADO" | "EXTRAS" | "SOBRE";
  detalle: string;
  folio?: number | null;
  posicion?: number | null;
  /** Solo tipo SOBRE: el cobro_grupo afectado y su cuadre. */
  sobre_id?: string | null;
  monto?: number | null;
  suma_partes?: number | null;
  partes_en_cancelados?: number | null;
}

export interface OperacionGrupo {
  llegadas_faltantes: { vuelo_id: string; folio: number; posicion: number | null; faltan: number }[];
  gastos_usd: {
    vuelo_id: string;
    folio: number;
    posicion: number | null;
    usd: number;
    n: number;
    sin_tc: number;
  }[];
  permisos: {
    vuelo_id: string;
    folio: number;
    posicion: number | null;
    estado_permiso: EstadoPermisoHijo | null;
  }[];
}

/**
 * Respuesta de GET /v1/grupos/:id y de TODAS las escrituras (create,
 * revise, confirm, cancel, fecha, quitar avión, reemplazar): las acciones
 * anteponen sus avisos propios a `avisos` ("Avión k: …", fallos no fatales).
 */
export interface GrupoDetalle extends GrupoCabeceraBase {
  tc_usd_mxn: number | null;
  ajuste_grupo_usd: number;
  escalas_plantilla: PlantillaTramo[];
  extras_grupo: ExtraGrupoDef[];
  /** TUAS capturadas por aeropuerto (normalizadas desde `vuelo_grupo.tuas_lineas`).
   *  ADITIVO 5-sep: ausente en API previo ⇒ catálogo. */
  tuas_lineas?: TuaLinea[];
  cliente: ClienteGrupo | null;
  estado: EstadoGrupo;
  aviones_vivos: number;
  aviones: AvionGrupoDetalle[];
  /** Solo hijos vivos. */
  consolidado: Consolidado;
  /** Σ cobrado de vivos. */
  cobrado_usd: number;
  saldo_usd: number;
  /**
   * SOBRES de cobro del grupo (Fase 2, 4-sep-2026): agrupación +
   * conciliación; el dinero sigue saliendo de las partes (cobro_vuelo) vía
   * cobrosEnUsd. Ausente = API previo a la Fase 2.
   */
  cobros?: SobreSalida[];
  /** Semáforo BÁSICO del grupo que compone el API con los de sus hijos
   *  vivos (el panel pinta con `semaforoCobroGrupo` = estadoCobroSemaforo). */
  semaforo_cobro_grupo?: SemaforoCobroBasico;
  operacion: OperacionGrupo;
  problemas: ProblemaGrupo[];
  /** Detalles de `problemas` + avisos de la acción que respondió. */
  avisos: string[];
}

// =====================================================================
// SOBRE de cobro del grupo (Fase 2, 4-sep-2026): el pago único del cliente
// (`cobro_grupo`) que el API PARTE en N cobro_vuelo, uno por avión vivo.
// El panel SOLO pinta la partición que manda el API (previsualizar /
// registrar); la Σ local de una partición manual es ayuda visual.
// =====================================================================

/** Cómo se partió (o se partirá) el sobre entre los aviones. */
export type ModoParticionCobro = "LIQUIDACION" | "PROPORCIONAL" | "MANUAL";

/** Una parte dada a mano: `monto` NATIVO con el mismo signo que el sobre
 *  (0 = ese avión no recibe). Σ == monto exacto (el API lo valida). */
export interface ParticionManualItem {
  vuelo_id: string;
  monto: number;
}

/**
 * Body de POST /v1/grupos/:id/cobros y de …/cobros/previsualizar
 * (= CreateCobroGrupoDto, whitelist estricta). `monto` negativo = reembolso
 * del grupo (sin comisión; `notas` = motivo).
 */
export interface CreateCobroGrupoInput {
  /** Monto NATIVO (2 decimales, ≠ 0; negativo = reembolso). */
  monto: number;
  moneda: MonedaGrupo;
  metodo_cobro: MetodoPago;
  /** Necesario con MXN (si falta el API usa el TC del grupo). */
  tc_usd_mxn?: number;
  /** 0..20; se ignora si viaja `comision_banco_monto`. */
  comision_banco_pct?: number;
  /** Comisión como MONTO directo en la moneda del sobre (manda sobre el %). */
  comision_banco_monto?: number;
  /** Una de CUENTAS_COBRO (catálogo fijo). */
  cuenta_destino?: string;
  /** ≤100 */
  referencia?: string;
  foto_voucher_url?: string;
  /** ISO. */
  fecha_cobro?: string;
  /** ≤500; en reembolso es el MOTIVO. */
  notas?: string;
  /** uuid v4: reintento con la misma llave devuelve el sobre YA registrado
   *  (200 + `idempotente: true`) sin duplicar dinero. */
  client_request_id?: string;
  /** Default AUTO (LIQUIDACION si cubre saldos ±1 USD, si no PROPORCIONAL). */
  modo?: "AUTO" | "MANUAL";
  /** Solo con modo MANUAL (≥1). */
  particion_manual?: ParticionManualItem[];
}

/** Parte de un sobre YA registrado (un cobro_vuelo). */
export interface ParteSobre {
  cobro_vuelo_id: string;
  vuelo_id: string;
  folio: number | null;
  posicion: number | null;
  matricula: string | null;
  /** NATIVO en la moneda del sobre (negativo en reembolsos). */
  monto: number;
  /** Peso con el que recibió su parte (6 decimales; Σ ≈ 1). */
  factor: number | null;
  comision_banco_monto: number | null;
  /** La parte quedó en un hijo CANCELADO (quitado del grupo): re-partir. */
  cancelado: boolean;
}

/** Sobre con sus partes (findOne.cobros[], GET /:id/cobros y escrituras). */
export interface SobreSalida {
  id: string;
  grupo_id: string;
  /** BRUTO nativo (negativo = reembolso). */
  monto: number;
  moneda: MonedaGrupo | (string & {});
  metodo_cobro: MetodoPago | (string & {});
  tc_usd_mxn: number | null;
  comision_banco_pct: number | null;
  comision_banco_monto: number | null;
  /** monto − comisión (derivado por el API). */
  neto: number;
  cuenta_destino: string | null;
  referencia: string | null;
  foto_voucher_url: string | null;
  /** ISO. */
  fecha_cobro: string;
  modo_particion: ModoParticionCobro | (string & {});
  registrado_por: string | null;
  notas: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  es_reembolso: boolean;
  partes: ParteSobre[];
  partes_suma: number;
  /** Σ partes == monto (invariante del sobre). */
  cuadra: boolean;
  partes_en_cancelados: number;
  /** El banco enlaza AL SOBRE (movimiento_bancario.cobro_grupo_id). */
  conciliado: boolean;
  movimiento_bancario_id: string | null;
  /** Solo sobres positivos tienen recibo. */
  recibo_disponible: boolean;
}

/** Parte propuesta por el API en la vista previa (aún no escrita). */
export interface PartePrevisualizada {
  vuelo_id: string;
  folio: number | null;
  posicion: number | null;
  matricula: string | null;
  /** NATIVA (2 decimales, ≠ 0; negativa en reembolsos). */
  monto: number;
  /** La misma parte en USD (informativa). */
  monto_usd: number;
  factor: number;
  comision_banco_monto: number | null;
  saldo_antes_usd: number;
  saldo_despues_usd: number;
}

export interface VerificacionParticion {
  suma_partes: number;
  monto: number;
  cuadra: boolean;
  suma_comision: number | null;
  comision: number | null;
  cuadra_comision: boolean;
}

/** Respuesta de POST /v1/grupos/:id/cobros/previsualizar (no escribe). */
export interface PrevisualizacionCobro {
  grupo_id: string;
  folio_texto: string;
  modo_particion: ModoParticionCobro;
  monto: number;
  moneda: MonedaGrupo;
  monto_usd: number;
  tc_usd_mxn: number | null;
  comision_banco_pct: number | null;
  comision_banco_monto: number | null;
  neto: number;
  partes: PartePrevisualizada[];
  verificacion: VerificacionParticion;
  /** Sobrepago, avión que recibiría más que su saldo, cambio de modo… */
  avisos: string[];
}

/** POST /v1/grupos/:id/cobros: 201 nuevo | 200 `idempotente: true`. */
export interface RegistroCobroGrupo {
  sobre: SobreSalida;
  idempotente: boolean;
}

/** DELETE /v1/grupos/cobros/:cobroGrupoId */
export interface EliminacionCobroGrupo {
  ok: true;
  cobro_grupo_id: string;
  grupo_id: string;
  partes_eliminadas: number;
  /** Vuelos hijos cuyas partes se borraron (para revalidar). */
  vuelos: string[];
}

/** POST /v1/grupos/cobros/:cobroGrupoId/repartir */
export interface RepartoCobroGrupo {
  sobre: SobreSalida;
  /** "El sobre pasó de MANUAL a PROPORCIONAL.", sobrepagos… */
  avisos: string[];
}

/** GET /v1/grupos/:id/cobros */
export interface ListaCobrosGrupo {
  grupo_id: string;
  folio_texto: string;
  cobros: SobreSalida[];
  avisos: string[];
}

// =====================================================================
// Liga del HIJO con su grupo (embed que ya viaja en VUELO_COLS de quotes y
// flights). Intersectar con PersistedQuote/FlightListItem cuando el API lo
// mande: `quote as PersistedQuote & VueloConGrupo`.
// =====================================================================

export interface GrupoEmbedVuelo {
  id: string;
  folio: number;
  nombre: string;
  pasajeros_total: number;
}

export interface VueloConGrupo {
  grupo_id?: string | null;
  grupo_posicion?: number | null;
  grupo_pax?: number | null;
  /** PostgREST puede mandarlo como arreglo. */
  grupo?: GrupoEmbedVuelo | GrupoEmbedVuelo[] | null;
}

// =====================================================================
// Errores 409 ESTRUCTURADOS {message, error, details}
// =====================================================================

export type GrupoErrorCode =
  | "CAPACIDAD_EXCEDIDA"
  | "PAX_NO_CUADRAN"
  | "PILOTO_DUPLICADO"
  | "AERONAVE_EN_TALLER"
  | "SQUAWK_ALTA_SIN_RESOLVER"
  | "SIN_FLOTA"
  | "HIJOS_CONGELADOS"
  | "HIJOS_NO_CONFIRMABLES"
  | "REVISION_A_MEDIAS"
  // ---- Sobre de cobro (Fase 2) ----
  /** 409 al editar/borrar POR VUELO un cobro que es parte de un sobre. */
  | "COBRO_DE_GRUPO"
  /** 409 al eliminar un sobre enlazado al banco. */
  | "COBRO_CONCILIADO"
  /** 409 eliminar/re-partir con una parte en hijo de mes cerrado. */
  | "MES_CERRADO"
  /** 409 reembolso: alguna parte supera lo cobrado neto de su avión. */
  | "REEMBOLSO_EXCEDE"
  /** 400 MANUAL: hijo ajeno/cancelado/repetido/signo distinto, o
   *  particion_manual con modo AUTO. */
  | "HIJO_INVALIDO"
  /** 400 MANUAL: Σ partes ≠ monto. */
  | "PARTICION_NO_CUADRA"
  /** 400 comisión ≥ monto, parte ≤ su comisión, o comisión en reembolso. */
  | "COMISION_INVALIDA"
  /** 400 cobro en MXN sin TC (ni en el sobre ni en el grupo). */
  | "SIN_TC"
  /** 400 el grupo no tiene aviones vivos. */
  | "SIN_HIJOS"
  /** 400 monto 0. */
  | "MONTO_CERO";

export interface CapacidadExcedidaDetails {
  aeronave_id: string;
  matricula: string;
  asientos: number;
  pax: number;
  rotaciones: number;
  posicion: number;
  /** Solo en el 409 que emite quotes.create/revise por tramo. */
  tramos?: unknown[];
}

export interface PaxNoCuadranDetails {
  pasajeros_total: number;
  pax_asignados: number;
  /** >0 faltan, <0 sobran. */
  faltan: number;
}

export interface PilotoDuplicadoDetail {
  usuario_id: string;
  nombre: string | null;
  /** Posiciones (1..N) donde se repite. */
  posiciones: number[];
}
export type PilotoDuplicadoDetails = PilotoDuplicadoDetail[];

export interface AeronaveEnTallerDetails {
  aeronave_id: string;
  matricula: string;
  posicion: number;
}

export interface SquawkAltaDetails {
  aeronave_id: string;
  matricula: string;
  posicion: number;
  discrepancias: DiscrepanciaAlta[];
}

export interface HijoCongeladoDetail {
  vuelo_id: string;
  folio: number;
  posicion: number | null;
  motivo: MotivoCongelado;
}
export type HijosCongeladosDetails = HijoCongeladoDetail[];

export interface HijoNoConfirmableDetail {
  vuelo_id: string;
  folio: number;
  estado: EstadoVuelo;
}
export type HijosNoConfirmablesDetails = HijoNoConfirmableDetail[];

/** Reintento seguro: mandar `creados[]` con su vuelo_id en `aviones[]`. */
export interface RevisionAMediasDetails {
  /** La cabecera YA quedó en esta versión. */
  version: number;
  /** Qué quedó aplicado ("avión 1", …). */
  aplicados: string[];
  creados: {
    key: string;
    vuelo_id: string;
    posicion: number | null;
    aeronave_id: string | null;
  }[];
}

export interface CobroDeGrupoDetails {
  cobro_grupo_id: string;
  grupo_id: string;
  grupo_folio: number | string | null;
}

export interface CobroConciliadoDetails {
  cobro_grupo_id: string;
  movimiento_bancario_id: string | null;
}

export interface MesCerradoDetail {
  vuelo_id: string;
  folio: number;
  posicion: number | null;
  fecha_vuelo: string | null;
}
export type MesCerradoDetails = MesCerradoDetail[];

export interface ReembolsoExcedeDetail {
  vuelo_id: string;
  folio: number | null;
  posicion: number | null;
  matricula: string | null;
  /** Lo que devolvería ese avión (USD, positivo). */
  reembolso_usd: number;
  cobrado_usd: number;
}
export type ReembolsoExcedeDetails = ReembolsoExcedeDetail[];

export interface ParticionNoCuadraDetails {
  suma: number;
  monto: number;
  diferencia: number;
}

/**
 * Error del API tal como lo entrega el filtro de excepciones: `error` es el
 * código (los 409 estructurados de arriba; CONFLICT / BAD_REQUEST /
 * NOT_FOUND… para los genéricos) y `details` el detalle por código.
 * `status` 0 = fallo sin respuesta del API (red).
 */
export interface GrupoApiError {
  message: string;
  error: GrupoErrorCode | (string & {});
  details?: unknown;
  status: number;
}

/** Resultado de TODAS las server actions del grupo: nunca lanzan. */
export type GrupoActionResult<T> = { ok: true; data: T } | { ok: false; error: GrupoApiError };
