export type EstadoMantenimiento = "PROGRAMADO" | "EN_TALLER" | "COMPLETADO";

export interface Mantenimiento {
  id: string;
  aeronave_id: string;
  estado: EstadoMantenimiento;
  pais: "MX" | "USA" | null;
  /** Campo legado, derivado de `estado`. */
  tipo: "PROGRAMADO" | "REALIZADO";
  descripcion: string;
  fecha_programada: string | null;
  fecha_realizada: string | null;
  /** Horas a las que ENTRÓ realmente (Hobbs). */
  horas_aeronave: string | null;
  /** Horas a las que DEBÍA entrar (umbral programado). */
  horas_programadas: string | null;
  costo_usd: string | null;
  proveedor: string | null;
  notas: string | null;
  /** Etapa del programa a la que corresponde el servicio (intervalo en hrs). */
  etapa_intervalo_hr?: number | string | null;
  /** Checklist ejecutado: tareas de la etapa marcadas + tareas libres. */
  tareas_realizadas?: string[] | null;
  /** Motor al que aplica el servicio (null/ausente = avión en general). */
  motor_id?: string | null;
  /** Hélice a la que aplica el servicio (null/ausente = avión en general). */
  helice_id?: string | null;
  created_at: string;
}

export interface Vencimiento {
  id: string;
  aeronave_id: string;
  tipo_documento_id: string;
  motor_id: string | null;
  piloto_id: string | null;
  vence_por: "FECHA" | "HORAS" | "PERMANENTE";
  fecha_vencimiento: string | null;
  horas_limite: string | null;
  umbral_alerta_dias: number | null;
  referencia: string | null;
  notas: string | null;
  archivo_url: string | null;
  created_at: string;
  /** Bitácora (18-ago-2026): quién registró y quién editó al último. */
  updated_at?: string | null;
  registrado_por?: string | null;
  actualizado_por?: string | null;
  tipo_documento?: { nombre: string; es_critico: boolean } | null;
}

/** Documento eliminado (borrado suave): restaurable por ADMIN/COORDINADOR. */
export interface VencimientoEliminado {
  id: string;
  fecha_vencimiento: string | null;
  vence_por: "FECHA" | "HORAS" | "PERMANENTE";
  referencia: string | null;
  deleted_at: string | null;
  eliminado_por: string | null;
  tipo_documento?: { nombre?: string } | null;
}

export interface DocumentType {
  id: string;
  nombre: string;
  ambito: string;
  umbral_alerta_dias: number | null;
  es_critico: boolean;
}

export interface FleetUpcoming {
  vencimientos: Array<{
    id: string;
    fecha_vencimiento: string;
    vence_por: string;
    referencia: string | null;
    // null en vencimientos de PILOTO o MOTOR (el avión sale de motor.aeronave).
    aeronave_id: string | null;
    tiene_archivo?: boolean;
    tipo_documento?: { nombre: string; es_critico: boolean } | null;
    aeronave?: { matricula: string } | null;
    piloto?: { nombre: string } | null;
    motor?: {
      posicion?: string | null;
      aeronave_id: string | null;
      aeronave?: { matricula: string } | null;
    } | null;
  }>;
  mantenimientos: Array<{
    id: string;
    descripcion: string;
    fecha_programada: string;
    aeronave_id: string;
    /** Etapa del programa (intervalo en hrs) si el servicio está ligado a una. */
    etapa_intervalo_hr?: number | string | null;
    aeronave?: { matricula: string } | null;
  }>;
}

// ── Mantenimiento unificado (17-nov-2026, API 0.0.140, invariante 135) ──────
// Evidencias (sticker del taller, facturas…) y componentes con vida límite.
// Todo ADITIVO: con un API previo (404) o la migración sin aplicar
// (`disponible: false`) el expediente del avión se comporta como antes.

/** A qué se le cuelga un archivo de ingeniería. */
export type DestinoAdjunto = "MANTENIMIENTO" | "COMPONENTE" | "MOTOR" | "HELICE";

/** Tipo de documento del archivo (catálogo cerrado del API). */
export type EtiquetaAdjunto =
  | "STICKER"
  | "FACTURA"
  | "CERTIFICADO"
  | "ORDEN_TRABAJO"
  | "BITACORA"
  | "OTRO";

/** Archivo de ingeniería. La ruta del bucket NUNCA viaja: se abre con URL firmada. */
export interface AdjuntoIngenieria {
  id: string;
  destino: DestinoAdjunto;
  destino_id: string;
  aeronave_id: string | null;
  /** Nombre original del archivo («sticker-100hrs.pdf»). */
  nombre: string;
  mime: string;
  bytes: number;
  etiqueta: EtiquetaAdjunto | null;
  nota: string | null;
  subido_por_nombre: string | null;
  created_at: string;
}

/** `GET /v1/engineering/aircraft/:id/adjuntos`. */
export interface AdjuntosIngenieriaRespuesta {
  /** false = migración sin aplicar: lo nuevo se esconde y se dice. */
  disponible: boolean;
  adjuntos: AdjuntoIngenieria[];
}

/** Cuerpo de `POST /v1/engineering/adjuntos` (el archivo ya está en el bucket). */
export interface RegistrarAdjuntoBody {
  destino: DestinoAdjunto;
  destino_id: string;
  storage_path: string;
  nombre: string;
  mime: string;
  bytes: number;
  etiqueta?: EtiquetaAdjunto;
  nota?: string;
}

/** `GET /v1/engineering/adjuntos/:id/url`. */
export interface UrlAdjuntoRespuesta {
  url: string;
  expira_en_s: number;
  nombre: string;
  mime: string;
}

/** Estado de vida de un componente: lo decide el API, el panel solo lo pinta. */
export type EstadoVida =
  | "VENCIDO"
  | "POR_VENCER"
  | "SIN_DATOS"
  | "VIGENTE"
  | "SIN_LIMITE";

/** Derivados de vida (los calcula el API con el Hobbs del avión y hoy en Cancún). */
export interface VidaComponente {
  /** horas_previas + (Hobbs − Hobbs al instalar). */
  horas_en_servicio: number | null;
  /** Negativo = vencido por. */
  horas_restantes: number | null;
  /** YYYY-MM-DD. */
  vence_el: string | null;
  /** 0 = vence hoy; negativo = ya venció. */
  dias_restantes: number | null;
  dias_en_servicio: number | null;
  estado: EstadoVida;
  /** Qué límite decidió el estado. */
  por: "HORAS" | "FECHA" | null;
  /** Campos que faltan para poder calcular. */
  faltantes: string[];
}

export interface ComponenteAeronave {
  id: string;
  aeronave_id: string;
  nombre: string;
  categoria: string | null;
  posicion: string | null;
  numero_parte: string | null;
  numero_serie: string | null;
  fabricante: string | null;
  /** YYYY-MM-DD. */
  fecha_instalacion: string | null;
  /** Hobbs del avión al instalar. */
  horas_aeronave_instalacion: number | null;
  /** Horas que ya traía la pieza (0 = nueva). */
  horas_previas: number;
  limite_horas: number | null;
  limite_meses: number | null;
  /** Fecha EXACTA de vencimiento (manda sobre instalación + meses). */
  fecha_vencimiento: string | null;
  aviso_horas: number;
  aviso_dias: number;
  notas: string | null;
  estado: "INSTALADO" | "RETIRADO";
  fecha_retiro: string | null;
  horas_aeronave_retiro: number | null;
  motivo_retiro: string | null;
  /** A quién sustituyó. */
  reemplaza_a_id: string | null;
  /** Quién lo sustituyó (derivado). */
  reemplazado_por_id: string | null;
  created_at: string;
  updated_at: string;
  actualizado_por_nombre: string | null;
  vida: VidaComponente;
}

/** `GET /v1/engineering/aircraft/:id/components`. */
export interface ComponentesAeronaveRespuesta {
  /** false = migración sin aplicar. */
  disponible: boolean;
  /** Hobbs actual del avión (misma fuente que tacómetros); null = sin lecturas. */
  horas_aeronave: number | null;
  /** Hoy en Cancún, YYYY-MM-DD. */
  hoy: string;
  /** INSTALADOS, ya ordenados por urgencia. */
  componentes: ComponenteAeronave[];
  /** RETIRADOS, el más reciente primero (tope 50). */
  retirados: ComponenteAeronave[];
}

/** Cuerpo de alta / edición (`null` explícito limpia un opcional al editar). */
export interface ComponenteBody {
  nombre?: string;
  categoria?: string | null;
  posicion?: string | null;
  numero_parte?: string | null;
  numero_serie?: string | null;
  fabricante?: string | null;
  fecha_instalacion?: string | null;
  horas_aeronave_instalacion?: number | null;
  horas_previas?: number;
  limite_horas?: number | null;
  limite_meses?: number | null;
  fecha_vencimiento?: string | null;
  aviso_horas?: number;
  aviso_dias?: number;
  notas?: string | null;
}

/** Cuerpo de `POST …/components/:id/retirar`. */
export interface RetirarComponenteBody {
  fecha: string;
  horas_aeronave?: number;
  motivo?: string;
}

/** Datos de la pieza NUEVA en un cambio de componente. */
export interface PiezaNuevaBody {
  numero_parte?: string;
  numero_serie?: string;
  fabricante?: string;
  horas_previas?: number;
  limite_horas?: number | null;
  limite_meses?: number | null;
  fecha_vencimiento?: string | null;
  notas?: string;
}

/** Cuerpo de `POST …/components/:id/reemplazar`. */
export interface ReemplazarComponenteBody extends RetirarComponenteBody {
  nuevo?: PiezaNuevaBody;
}

export interface ReemplazoComponenteRespuesta {
  retirado: ComponenteAeronave;
  nuevo: ComponenteAeronave;
}
