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
