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

import type { MetodoPago, QuoteBreakdown, TipoParada, TipoTarifa } from "./quote";
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
  /** Parte de cada hijo (posición/matrícula) en esta línea. */
  por_avion: {
    key: string;
    posicion: number | null;
    matricula: string | null;
    monto_usd: number;
  }[];
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
  tipo: "PAX" | "PRECIO_DESACTUALIZADO" | "EXTRAS";
  detalle: string;
  folio?: number | null;
  posicion?: number | null;
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
  cliente: ClienteGrupo | null;
  estado: EstadoGrupo;
  aviones_vivos: number;
  aviones: AvionGrupoDetalle[];
  /** Solo hijos vivos. */
  consolidado: Consolidado;
  /** Σ cobrado de vivos. */
  cobrado_usd: number;
  saldo_usd: number;
  operacion: OperacionGrupo;
  problemas: ProblemaGrupo[];
  /** Detalles de `problemas` + avisos de la acción que respondió. */
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
  | "REVISION_A_MEDIAS";

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
