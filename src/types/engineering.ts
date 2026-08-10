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
  tipo_documento?: { nombre: string; es_critico: boolean } | null;
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
    aeronave?: { matricula: string } | null;
  }>;
}
