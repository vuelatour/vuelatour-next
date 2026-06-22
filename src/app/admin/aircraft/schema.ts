import { z } from "zod";

const PaisEnum = z.enum(["MX", "USA"]);

/**
 * Colores reservados del calendario para estados de vuelo (sin asignar, permiso
 * pendiente, externo, fallback). Una aeronave NO puede usarlos como su color, o
 * sus vuelos se confundirían con esos estados en el calendario.
 */
export const RESERVED_CALENDAR_COLORS: Record<string, string> = {
  "#8B5CF6": "Sin asignar",
  "#F59E0B": "Permiso pendiente",
  "#FFB6C1": "Externo",
  "#9CA3AF": "color de respaldo del sistema",
};

/** Number opcional: "" o undefined → se omite; en otro caso coacciona a número ≥ 0. */
const optionalNonNegative = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0, "No puede ser negativo").optional(),
);

/** Number opcional positivo (> 0): "" → se omite. */
const optionalPositive = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(1, "Debe ser mayor a 0").optional(),
);

export const AircraftFormSchema = z.object({
  matricula: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(10, "Máximo 10 caracteres")
    .transform((v) => v.trim().toUpperCase()),
  modelo: z.string().min(1, "Requerido").max(50),
  pais_registro: PaisEnum,
  num_motores: z.coerce.number().int("Entero").min(1, "Mínimo 1").max(2, "Máximo 2"),
  velocidad_crucero_kts: z.coerce.number().min(1, "Debe ser mayor a 0"),
  asientos: z.coerce.number().int("Entero").min(1, "Debe ser mayor a 0"),
  tarifa_hora_pub_usd: optionalNonNegative,
  tarifa_hora_broker_usd: optionalNonNegative,
  reserva_overhaul_hr_usd: optionalNonNegative,
  color_calendario: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Formato #RRGGBB")
    .refine(
      (v) => !RESERVED_CALENDAR_COLORS[v.toUpperCase()],
      "Color reservado por el sistema (sin asignar / permiso / externo). Elige otro tono.",
    )
    .optional()
    .or(z.literal("")),
  ubicacion_base: z
    .string()
    .min(3, "3-4 letras")
    .max(4, "3-4 letras")
    .transform((v) => v.trim().toUpperCase())
    .optional()
    .or(z.literal("")),
  activa: z.boolean().default(true),
  notas: z.string().max(2000).optional().or(z.literal("")),
  // Programa de servicio por horas (secuencia cíclica de intervalos).
  servicio_intervalos: z.array(z.coerce.number().min(1)).optional(),
  servicio_horas_base: optionalNonNegative,
});

export type AircraftFormValues = z.input<typeof AircraftFormSchema>;

/** Editor del programa de servicio por horas (separado del form principal). */
export const ServicioProgramaSchema = z.object({
  servicio_intervalos: z.array(z.coerce.number().min(1, "Cada intervalo > 0")),
  servicio_horas_base: z.coerce.number().min(0, "No puede ser negativo"),
});
export type ServicioProgramaValues = z.input<typeof ServicioProgramaSchema>;

// ===== Dueños / socios =====
export const OwnerFormSchema = z.object({
  socio_id: z.string().uuid("Selecciona un socio"),
  porcentaje: z.coerce.number().min(0.001, "Mayor a 0").max(100, "Máximo 100"),
  vigente_desde: z.string().min(1, "Requerido"),
  vigente_hasta: z.string().optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});
export type OwnerFormValues = z.input<typeof OwnerFormSchema>;

// ===== Motores =====
const PosicionMotorEnum = z.enum(["UNICO", "IZQUIERDO", "DERECHO"]);
const TipoMotorEnum = z.enum(["PISTON", "TURBINA"]);
export const EngineFormSchema = z.object({
  posicion: PosicionMotorEnum,
  numero_serie: z.string().min(1, "Requerido").max(50),
  tipo: TipoMotorEnum,
  fabricante: z.string().max(50).optional().or(z.literal("")),
  modelo: z.string().max(50).optional().or(z.literal("")),
  horas_totales: optionalNonNegative,
  turm: optionalNonNegative,
  tbo_horas: z.coerce.number().min(1, "Debe ser mayor a 0"),
  notas: z.string().max(2000).optional().or(z.literal("")),
});
export type EngineFormValues = z.input<typeof EngineFormSchema>;

// ===== Hélices =====
const PosicionHeliceEnum = z.enum(["UNICA", "IZQUIERDA", "DERECHA"]);
export const PropellerFormSchema = z.object({
  posicion: PosicionHeliceEnum,
  numero_serie: z.string().min(1, "Requerido").max(50),
  fabricante: z.string().max(50).optional().or(z.literal("")),
  modelo: z.string().max(50).optional().or(z.literal("")),
  horas_totales: optionalNonNegative,
  tbo_horas: optionalPositive,
  notas: z.string().max(2000).optional().or(z.literal("")),
});
export type PropellerFormValues = z.input<typeof PropellerFormSchema>;

// ===== Seguros =====
export const InsuranceFormSchema = z.object({
  aseguradora: z.string().min(1, "Requerido").max(120),
  num_poliza: z.string().min(1, "Requerido").max(80),
  cobertura: z.string().max(2000).optional().or(z.literal("")),
  suma_asegurada_usd: optionalNonNegative,
  prima_usd: optionalNonNegative,
  vigente_desde: z.string().min(1, "Requerido"),
  vigente_hasta: z.string().min(1, "Requerido"),
  archivo_url: z.string().max(1000).optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});
export type InsuranceFormValues = z.input<typeof InsuranceFormSchema>;

// ===== Discrepancias (squawks) =====
export const SquawkFormSchema = z.object({
  descripcion: z.string().min(1, "Requerido").max(2000),
  severidad: z.enum(["BAJA", "MEDIA", "ALTA"]),
  estado: z.enum(["ABIERTA", "EN_PROGRESO", "RESUELTA"]),
  fecha_reporte: z.string().optional().or(z.literal("")),
  resolucion: z.string().max(2000).optional().or(z.literal("")),
  fecha_resolucion: z.string().optional().or(z.literal("")),
  notas: z.string().max(2000).optional().or(z.literal("")),
});
export type SquawkFormValues = z.input<typeof SquawkFormSchema>;
