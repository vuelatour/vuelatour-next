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
  "#F0DCDB": "Externo",
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

/**
 * Number opcional que ADMITE null explícito: "" → se omite (el action lo
 * descarta), null pasa tal cual (= borrar el valor en el PATCH). El z.null()
 * va primero: z.coerce.number() convertiría null en 0.
 */
const optionalNonNegativeNullable = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.null().or(z.coerce.number().min(0, "No puede ser negativo")).optional(),
);

/** Como el anterior pero exige > 0 (HP de motor). */
const optionalPositiveNullable = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z
    .null()
    .or(z.coerce.number().int("Entero").min(1, "Debe ser mayor a 0"))
    .optional(),
);

/** Características comerciales: TEXTAREA "una por línea" → arreglo limpio. */
const caracteristicasLineas = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string") return undefined;
    return v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  z
    .array(z.string().max(80, "Máx. 80 caracteres por línea"))
    .max(8, "Máx. 8 líneas")
    .optional(),
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
  // Ficha comercial del PDF de cotización (26-ago v2): tarjeta "De un
  // vistazo" + tira de características en la hoja del avión.
  motor_hp: optionalPositiveNullable,
  caracteristicas: caracteristicasLineas,
  tarifa_hora_pub_usd: optionalNonNegative,
  tarifa_hora_broker_usd: optionalNonNegative,
  reserva_overhaul_hr_usd: optionalNonNegative,
  // Aportación AFAC (USD/hr cobrada): provisión por matrícula extranjera.
  // Nullable: en edición, vaciar el campo manda null para borrar la config.
  permiso_afac_usd_hr: optionalNonNegativeNullable,
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
  servicio_horas_base: optionalNonNegative,
});

export type AircraftFormValues = z.input<typeof AircraftFormSchema>;

// ===== Programa de servicio por ETAPAS (editor de la card Tacómetros) =====
// Fuente de verdad: el PATCH manda servicio_etapas y el API deriva
// servicio_intervalos — NUNCA mandar los dos.
export const ServicioEtapaSchema = z.object({
  intervalo_hr: z.coerce.number().positive("Debe ser mayor a 0"),
  nombre: z.string().max(80, "Máximo 80 caracteres").optional().or(z.literal("")),
  tareas: z
    .array(z.string().min(1).max(120, "Cada tarea: máximo 120 caracteres"))
    .max(40, "Máximo 40 tareas por etapa")
    .optional(),
});

export const ServicioProgramaEtapasSchema = z.object({
  servicio_etapas: z.array(ServicioEtapaSchema),
  servicio_horas_base: z.coerce.number().min(0, "No puede ser negativo"),
});
export type ServicioProgramaEtapasValues = z.input<typeof ServicioProgramaEtapasSchema>;

/** Base histórica del planeador (tiempo total = base + hobbs − ref). */
export const PlaneadorBaseSchema = z.object({
  planeador_horas_base: z.coerce.number().min(0, "No puede ser negativo"),
  planeador_taco_ref: z.coerce.number().min(0, "No puede ser negativo"),
});
export type PlaneadorBaseValues = z.input<typeof PlaneadorBaseSchema>;

// ===== Traslado / overhaul de componentes (motores y hélices) =====
export const TransplantSchema = z.object({
  aeronave_destino_id: z.string().uuid("Selecciona la aeronave destino"),
  posicion_destino: z.enum([
    "UNICO",
    "IZQUIERDO",
    "DERECHO",
    "UNICA",
    "IZQUIERDA",
    "DERECHA",
  ]),
  motivo: z.string().min(3, "Describe el motivo (mínimo 3 caracteres)").max(500),
});
export type TransplantValues = z.input<typeof TransplantSchema>;

export const OverhaulSchema = z.object({
  /** YYYY-MM-DD; vacío = hoy (Cancún) en el API. */
  fecha: z.string().optional().or(z.literal("")),
  motivo: z.string().max(500).optional().or(z.literal("")),
  tbo_horas: optionalPositive,
  /** Nuevo límite calendario del TBO; null explícito lo borra. */
  tbo_fecha: z.string().nullable().optional().or(z.literal("")),
});
export type OverhaulValues = z.input<typeof OverhaulSchema>;

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
  // nullable: al editar, vaciar el campo manda null para BORRAR el valor
  // guardado (el "" se descarta en stripEmpty y no borraría nada).
  fabricante: z.string().max(50).nullable().optional().or(z.literal("")),
  modelo: z.string().max(50).nullable().optional().or(z.literal("")),
  horas_totales: optionalNonNegative,
  // TURM en marco del COMPONENTE (horas de vida en su últ. overhaul). El
  // `turm` legado (taco del avión) ya NO se captura desde los forms.
  turm_componente: optionalNonNegative,
  tbo_horas: z.coerce.number().min(1, "Debe ser mayor a 0"),
  // Límite CALENDARIO del overhaul (TBO por tiempo, ej. 12 años). Vaciar al
  // editar manda null para borrar la fecha guardada.
  tbo_fecha: z.string().nullable().optional().or(z.literal("")),
  notas: z.string().max(2000).nullable().optional().or(z.literal("")),
});
export type EngineFormValues = z.input<typeof EngineFormSchema>;

// ===== Hélices =====
const PosicionHeliceEnum = z.enum(["UNICA", "IZQUIERDA", "DERECHA"]);
export const PropellerFormSchema = z.object({
  posicion: PosicionHeliceEnum,
  numero_serie: z.string().min(1, "Requerido").max(50),
  fabricante: z.string().max(50).nullable().optional().or(z.literal("")),
  modelo: z.string().max(50).nullable().optional().or(z.literal("")),
  horas_totales: optionalNonNegative,
  // TURM en marco del COMPONENTE (ver EngineFormSchema).
  turm_componente: optionalNonNegative,
  tbo_horas: optionalPositive,
  tbo_fecha: z.string().nullable().optional().or(z.literal("")),
  notas: z.string().max(2000).nullable().optional().or(z.literal("")),
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
  // null explícito = quitar la copia (el API borra el archivo del bucket).
  archivo_url: z.string().max(1000).nullable().optional().or(z.literal("")),
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
