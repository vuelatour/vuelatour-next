import { z } from "zod";

export const CategoriaEnum = z.enum([
  "GAS",
  "ATERRIZAJE",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "PILOTO_EXTERNO",
  "FIJO",
  // Gasto de la operación SIN vuelo (avión opcional). Por ahora fuera del
  // reparto y de la bandeja de pendientes (tratamiento por decidir).
  "INDIRECTO",
  // Nómina del personal (ago-2026): SIN vuelo; avión OPCIONAL (se conserva
  // si aplica a uno). Repartible entre aviones desde Otros gastos.
  "NOMINA",
  // Servicio/mantenimiento DE UN AVIÓN sin vuelo (ago-2026): sin vuelo;
  // el avión SÍ se conserva (cae en su hoja de Gastos indirectos).
  "SERVICIOS",
  // Gasto PERSONAL del dueño: no es de la empresa ni de los aviones —
  // SIEMPRE sin vuelo y sin avión (el API lo exige); seguimiento en la
  // pantalla Gastos personales.
  "PERSONAL_DUENO",
  // Gasolina de VEHÍCULOS (27-ago): gasolinera — nunca combustible de
  // aviación. Sin vuelo ni avión; se administra en Otros gastos.
  "GASOLINA",
  // Gasto de un VISITANTE de trabajo (fondo de visita / tarjeta corporativa):
  // jamás lleva vuelo ni avión; vive en Otros gastos y es repartible a mano.
  "VISITA",
  "OTRO",
]);

export const MedioPagoEnum = z.enum([
  "EFECTIVO",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
  "TRANSFERENCIA",
  // Plataforma de pago de servicios aeroportuarios (recibos Paywise).
  "PAYWISE",
  // Cargo automático por salida de bodega (no es egreso bancario).
  "BODEGA",
]);

export const EstatusEnum = z.enum(["FACTURA", "VALE", "SIN_COMPROBANTE"]);

/** Seguimiento de oficina "¿ya facturé este gasto?" — independiente del
 *  comprobante que entregó el piloto (ese NO se toca al marcarlo). */
export const FacturacionEnum = z.enum([
  "PENDIENTE",
  "SOLICITADA",
  "FACTURADA",
]);

export const GastoVerifySchema = z.object({
  // Monto/moneda/fecha editables: si la IA marcó ⚠ discrepancia contra lo
  // que capturó el piloto, la oficina corrige aquí el dato bueno.
  monto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive().optional(),
  ),
  // Propina incluida en monto (monto = ticket + propina; monto es lo que
  // llega al banco). 0 explícito = quitar la propina.
  propina: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0, "Propina inválida").optional(),
  ),
  /** Litros cargados (combustible): corrige aquí un GAS capturado sin litros
   *  (el balance no calcula $/litro sin ellos). */
  litros: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("Litros inválidos").optional(),
  ),
  moneda: z.enum(["MXN", "USD"]).optional(),
  fecha_gasto: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  categoria: CategoriaEnum.optional(),
  medio_pago: MedioPagoEnum.optional(),
  // Con TARJETA_CORP: corregir qué tarjeta pagó (el server la sella al
  // capturar con la tarjeta asignada al capturador; aquí oficina la ajusta).
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "4 dígitos")
    .optional()
    .or(z.literal("")),
  estatus_comprobante: EstatusEnum.optional(),
  estatus_facturacion: FacturacionEnum.optional(),
  // null explícito = DESLIGAR (sobrevive a stripEmpty; "" se descarta).
  // Lo usa la reclasificación a PERSONAL_DUENO: quitar avión/vuelo/escala
  // en el MISMO PATCH que cambia la categoría (el candado del API valida el
  // estado efectivo — por separado rechazaría el orden).
  aeronave_id: z.string().uuid().nullable().optional().or(z.literal("")),
  vuelo_id: z.string().uuid().nullable().optional().or(z.literal("")),
  escala_id: z.string().uuid().nullable().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  /** Folio/remisión del ticket: candado anti-duplicados del API (409 si ya existe). */
  folio_ticket: z.string().max(60).optional().or(z.literal("")),
  // TC MXN→USD del gasto: sin él, un gasto MXN queda FUERA del balance USD
  // del reparto (y bloquea el pre-cierre). Aquí es donde se corrige.
  tc_gasto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("TC inválido").optional(),
  ),
  notas: z.string().max(2000).optional().or(z.literal("")),
  /** Sello de confirmación del PANEL: true = confirmar (el API sella quién y
   *  cuándo), false = retirar el sello. Solo oficina puede mandarlo; ambos
   *  valores sobreviven a stripEmpty (solo tira "" y undefined). */
  verificado: z.boolean().optional(),
  duplicado_sospechado: z.boolean().optional(),
  /** Lectura fresca de la IA (botón Reanalizar): viaja JUNTO con la
   *  verificación — los reportes derivan de este jsonb el desglose
   *  Operación/TUA/FBO, así que solo se persiste cuando el humano guarda. */
  valor_ia_extraido: z.record(z.string(), z.unknown()).optional(),
  /** Candado de fecha antigua (> 365 días atrás): el usuario CONFIRMÓ la
   *  fecha corregida en el diálogo. Solo se manda cuando es true. */
  permitir_fecha_antigua: z.boolean().optional(),
});

/** Alta manual de gasto desde el panel (gastos operativos que sube la oficina). */
export const GastoCreateSchema = z.object({
  categoria: CategoriaEnum,
  monto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("El monto debe ser mayor a 0"),
  ),
  // REGLA SAGRADA: monto = TOTAL PAGADO (ticket + propina, lo que llega al
  // banco). propina es sub-parte informativa; monto − propina = ticket.
  propina: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0, "Propina inválida").optional(),
  ),
  /** Litros cargados (combustible): alimenta $/litro del balance por avión. */
  litros: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("Litros inválidos").optional(),
  ),
  moneda: z.enum(["MXN", "USD"]),
  fecha_gasto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha requerida"),
  medio_pago: MedioPagoEnum,
  // Con TARJETA_CORP: cuál tarjeta pagó. Vacío = el server sella la
  // asignada a quien captura (o la del voucher IA).
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "4 dígitos")
    .optional()
    .or(z.literal("")),
  estatus_comprobante: EstatusEnum.optional(),
  estatus_facturacion: FacturacionEnum.optional(),
  aeronave_id: z.string().uuid().optional().or(z.literal("")),
  vuelo_id: z.string().uuid().optional().or(z.literal("")),
  proveedor_id: z.string().uuid().optional().or(z.literal("")),
  /** Folio/remisión del ticket: candado anti-duplicados del API (409 si ya existe). */
  folio_ticket: z.string().max(60).optional().or(z.literal("")),
  tc_gasto: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive("TC inválido").optional(),
  ),
  /** Path en el bucket gasto-fotos del comprobante subido por la oficina. */
  foto_url: z.string().max(500).optional().or(z.literal("")),
  /** Lectura cruda de la IA (auditoría/desglose server-side), si la hubo. */
  valor_ia_extraido: z.record(z.string(), z.unknown()).optional(),
  /** Backfill de oficina: registrar el gasto COMO SI lo subiera el piloto del
   *  vuelo (usuario_captura + origen = PILOTO). Requiere vuelo_id con piloto. */
  capturar_como_piloto: z.boolean().optional(),
  /** Candado de fecha antigua (> 365 días atrás): el usuario CONFIRMÓ la
   *  fecha en el diálogo — sin esto el API rechaza fechas de otro año
   *  (auditoría 29-ago: gastos con año 2025 fuera de todos los cortes).
   *  Solo se manda cuando es true. */
  permitir_fecha_antigua: z.boolean().optional(),
  notas: z.string().max(2000).optional().or(z.literal("")),
});

export type GastoCreateValues = {
  categoria: string;
  /** En el FORMULARIO este campo es el monto del TICKET (sin propina); al
   *  guardar se envía monto = ticket + propina (total pagado). */
  monto: string;
  propina: string;
  /** Litros cargados (solo categoría GAS): alimenta precio/litro del balance. */
  litros: string;
  moneda: string;
  fecha_gasto: string;
  medio_pago: string;
  tarjeta_terminacion: string;
  estatus_comprobante: string;
  estatus_facturacion: string;
  aeronave_id: string;
  vuelo_id: string;
  proveedor_id: string;
  /** Folio/remisión del ticket: candado anti-duplicados del API. */
  folio_ticket: string;
  tc_gasto: string;
  notas: string;
};

export type GastoVerifyValues = {
  /** En el FORMULARIO: monto del TICKET (monto − propina); al guardar se
   *  recompone monto = ticket + propina. */
  monto: string;
  propina: string;
  litros: string;
  moneda: string;
  fecha_gasto: string;
  categoria: string;
  medio_pago: string;
  /** Con TARJETA_CORP: con cuál tarjeta se pagó (el server la sella al
   *  capturar; oficina la corrige aquí). */
  tarjeta_terminacion: string;
  estatus_comprobante: string;
  estatus_facturacion: string;
  aeronave_id: string;
  proveedor_id: string;
  folio_ticket: string;
  tc_gasto: string;
  notas: string;
};
