import { z } from "zod";
import { MEDIOS_CAPTURA_VALUES } from "@/lib/admin/medios-pago";
import { esUuid } from "@/lib/admin/url-params";
import { MAX_CARGOS_A_GASTO, MIN_CARGOS_A_GASTO } from "@/lib/admin/conciliacion-seleccion";
import {
  MSG_CARGO_INVALIDO,
  MSG_LLAVE_CAPTURA_REQUERIDA,
  MSG_LOTE_CARGOS_INVALIDO,
} from "@/lib/admin/conciliacion-cargos-gasto";

export const CategoriaEnum = z.enum([
  "GAS",
  "ATERRIZAJE",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  // Comisariato (13-oct-2026, API 0.0.75): snacks/bebidas de los PASAJEROS,
  // gasto directo del vuelo (columna OTROS del balance del avión). El API
  // 0.0.74 la rechaza (IsEnum): el panel sale DESPUÉS del API.
  "COMISARIATO",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  "PILOTO_EXTERNO",
  // «Comisión del vendedor (VuelaTour)» (28-sep-2026, API 0.0.39): pago al
  // VENDEDOR que paga VuelaTour. SIEMPRE con vuelo (400 GASTO_REQUIERE_VUELO
  // para todos los roles); el avión se hereda del vuelo solo como
  // referencia. No es costo del avión ni va a «otros gastos»: en «otros
  // movimientos» del Balance general se aparea con la comisión cobrada (sin
  // él esa fila no lleva egreso). Monto libre, varios por vuelo.
  "COMISION_VENDEDOR",
  // «Comisión del vendedor (avión)» (13-oct-2026, API 0.0.74, invariante 61
  // del API): el pago al vendedor que CARGA EL AVIÓN del vuelo (columna
  // COMISIONES de su balance y reparto a socios). Exige vuelo a TODOS los
  // roles, como la de VuelaTour. El API 0.0.73 la rechaza con el 400 de
  // IsEnum: el panel sale DESPUÉS del API 0.0.74.
  "COMISION_VENDEDOR_AVION",
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
  // Pago domiciliado (13-oct-2026, API 0.0.75 + migración 20261013000009):
  // cargo automático a la cuenta; bancario. El API 0.0.74 lo rechaza
  // (IsEnum): el panel sale DESPUÉS del API.
  "DOMICILIADO",
  // Cargo automático por salida de bodega (no es egreso bancario).
  "BODEGA",
]);

/** Comprobante del gasto. DOS opciones en la UI (14-sep-2026): «Con
 *  comprobante» GUARDA `FACTURA` y «Sin comprobante» `SIN_COMPROBANTE`.
 *  `VALE` se conserva en el enum porque es LEGADO (gastos históricos y la
 *  carga masiva de combustibles): el panel lo LEE como «con comprobante» y
 *  jamás lo escribe — sin él aquí, verificar un gasto viejo lo mutaría.
 *  Sin migración: el enum de Postgres sigue igual. */
export const EstatusEnum = z.enum(["FACTURA", "VALE", "SIN_COMPROBANTE"]);

/** Seguimiento de oficina "¿ya facturé este gasto?" — independiente del
 *  comprobante que entregó el piloto (ese NO se toca al marcarlo).
 *  `NO_FACTURABLE` (14-sep-2026, «No requiere factura») necesita la migración
 *  20260914000002: sin ella el API responde 400 con un mensaje claro y el
 *  panel lo muestra tal cual (nunca 500). */
export const FacturacionEnum = z.enum([
  "PENDIENTE",
  "SOLICITADA",
  "FACTURADA",
  "NO_FACTURABLE",
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
  /** Combustible (GAS, 1-oct-2026): corregir el tipo y el lugar de una carga
   *  desde Combustibles/Gastos. `lugar` null = QUITARLO (sobrevive a
   *  stripEmpty). Reglas en `lib/admin/combustibles.ts` (camposCargaParaPatch). */
  tipo_combustible: z.enum(["TURBOSINA", "AVGAS"]).optional(),
  lugar: z.string().max(60).nullable().optional(),
  /** Momento de la carga recolocado en el día nuevo cuando se corrige
   *  `fecha_gasto` (misma hora Cancún): el día Cancún de `fecha_hora_carga`
   *  debe ser `fecha_gasto`, como exige la carga masiva del API. */
  fecha_hora_carga: z.iso.datetime({ offset: true }).optional(),
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
  // null explícito = QUITAR la terminación (sobrevive a stripEmpty): el
  // diálogo lo manda siempre que el medio no sea TARJETA_CORP — la BD tiene
  // un CHECK medio↔tarjeta y sin esto el PATCH tronaba con 500.
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "La tarjeta son 4 dígitos")
    .nullable()
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
  /** Hoja principal del comprobante (12-oct-2026): solo viaja cuando el gasto
   *  no tenía ninguna y se agregaron hojas desde «Verificar / editar» (la
   *  primera pasa a ser la principal). */
  foto_url: z.string().max(500).optional().or(z.literal("")),
  /** Sello de confirmación del PANEL: true = confirmar (el API sella quién y
   *  cuándo), false = retirar el sello. Solo oficina puede mandarlo; ambos
   *  valores sobreviven a stripEmpty (solo tira "" y undefined). */
  verificado: z.boolean().optional(),
  duplicado_sospechado: z.boolean().optional(),
  /** Lectura fresca de la IA (botón Reanalizar): viaja JUNTO con la
   *  verificación — los reportes derivan de este jsonb el desglose
   *  Operación/TUA/FBO, así que solo se persiste cuando el humano guarda. */
  valor_ia_extraido: z.record(z.string(), z.unknown()).optional(),
  /** «TUA incluida en este gasto» (13-oct-2026, API 0.0.75 + migración
   *  20261013000008): la cifra de OFICINA manda sobre la lectura de la IA.
   *  null = volver a la lectura de la IA (sobrevive a stripEmpty); 0 = sin
   *  TUA; vacío = no viaja. Sin declararla aquí, el z.object la TIRA y nunca
   *  llega al API. Qué viaja lo decide `tuaIncluidaParaPatch`
   *  (lib/admin/tua-incluida.ts). */
  tua_incluida: z.preprocess(
    (v) =>
      v === undefined || (typeof v === "string" && v.trim() === "")
        ? undefined
        : v === null
          ? null
          : Number(v),
    z
      .number({ error: "La TUA incluida no es un número válido." })
      .min(0, "La TUA incluida no puede ser negativa.")
      .nullable()
      .optional(),
  ),
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
  /** Solo GAS (5-oct-2026): tipo de la carga, prellenado con el combustible
   *  del avión; el API lo ajusta al del avión si no coincide. «» = sin dato. */
  tipo_combustible: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.enum(["TURBOSINA", "AVGAS"]).optional(),
  ),
  moneda: z.enum(["MXN", "USD"]),
  fecha_gasto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha requerida"),
  // SIN valor por defecto (regla del cliente): el formulario abre con "" y
  // el enum (derivado de la fuente única MEDIOS_CAPTURA_VALUES, sin BODEGA)
  // lo rechaza con un mensaje que el diálogo muestra tal cual.
  medio_pago: z.enum(MEDIOS_CAPTURA_VALUES, { error: "Elige el medio de pago" }),
  // Con TARJETA_CORP: cuál tarjeta pagó. Vacío = el server sella la
  // asignada a quien captura (o la del voucher IA).
  tarjeta_terminacion: z
    .string()
    .regex(/^\d{4}$/, "La tarjeta son 4 dígitos")
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
  /** REFACCIÓN a Inventario/Tienda (12-oct-2026, API 0.0.72, invariante 57):
   *  solo al crear; lo arma `payloadInventario` (lib/admin/refaccion-inventario). */
  inventario: z
    .object({
      item_id: z.string().uuid().optional(),
      nombre: z.string().max(200).optional(),
      numero_parte: z.string().max(50).optional(),
      categoria: z.string().max(50).optional(),
      cantidad: z.number().positive(),
      precio_venta: z.number().min(0),
      precio_venta_moneda: z.enum(["MXN", "USD"]),
      vender_al_avion: z.boolean().optional(),
    })
    .optional(),
  /** «Créalo por la suma» (Conciliación, 14-oct-2026, API 0.0.77, invariante
   *  76 del API): los 2..50 cargos del banco que paga este gasto; el API lo
   *  crea SIN auto-cruce y se los liga en la MISMA petición (si la liga
   *  falla, retira el gasto). Mismos textos que el DTO del API. Sin la llave,
   *  el alta de siempre. */
  conciliar_con_movimientos: z
    .array(z.string().refine(esUuid, MSG_CARGO_INVALIDO))
    .min(MIN_CARGOS_A_GASTO, MSG_LOTE_CARGOS_INVALIDO)
    .max(MAX_CARGOS_A_GASTO, MSG_LOTE_CARGOS_INVALIDO)
    .refine((ids) => new Set(ids.map((x) => x.toLowerCase())).size === ids.length, MSG_LOTE_CARGOS_INVALIDO)
    .optional(),
  /** Llave de idempotencia de la captura (uuid): con `conciliar_con_movimientos`
   *  es OBLIGATORIA (400 CLIENT_REQUEST_ID_REQUERIDO del API) y un reintento
   *  con la misma llave no duplica el gasto. */
  client_request_id: z.string().refine(esUuid, MSG_LLAVE_CAPTURA_REQUERIDA).optional(),
}).superRefine((v, ctx) => {
  // Espejo del API: los cargos se ligan SOLO con la llave de la captura.
  if (v.conciliar_con_movimientos !== undefined && !v.client_request_id) {
    ctx.addIssue({ code: "custom", path: ["client_request_id"], message: MSG_LLAVE_CAPTURA_REQUERIDA });
  }
});

export type GastoCreateValues = {
  categoria: string;
  /** En el FORMULARIO este campo es el monto del TICKET (sin propina); al
   *  guardar se envía monto = ticket + propina (total pagado). */
  monto: string;
  propina: string;
  /** Litros cargados (solo categoría GAS): alimenta precio/litro del balance. */
  litros: string;
  /** Solo GAS: «TURBOSINA» | «AVGAS» | «» (sin dato). */
  tipo_combustible: string;
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
  /** Solo GAS: «TURBOSINA» | «AVGAS» | «» (sin dato). */
  tipo_combustible: string;
  /** Solo GAS: aeropuerto/FBO de la carga («CUN»). */
  lugar: string;
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
  /** «TUA incluida en este gasto» (13-oct-2026): vacío = usar la lectura de
   *  la IA; «0» = sin TUA. Solo se pinta con la llave `tua_incluida` del API
   *  y en Operaciones/Aterrizaje/FBO. */
  tua_incluida: string;
};
