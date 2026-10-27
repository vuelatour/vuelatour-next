import type { CompraRef, CompraRol } from "./compras";
import type { ConciliacionAlCrear } from "./conciliacion";
import type { FacturaDeGasto } from "@/lib/admin/facturas-gasto";

/**
 * @deprecated Desde el 21-oct-2026 (API 0.0.102, invariante 101) el panel NO
 * manda el bloque `inventario` en el alta: una refacción es un gasto normal y
 * la bodega se alimenta desde Compras. El API conserva la respuesta por
 * compatibilidad; el tipo se queda solo para leerla si algún cliente viejo la
 * provocara.
 */
export interface GastoInventarioResultado {
  item_id: string | null;
  item_nombre: string | null;
  item_creado: boolean;
  compra_id: string | null;
  compra_folio: number | null;
  entrada_id: string | null;
  precio_venta_guardado: boolean;
  salida: { movimiento_id: string; gasto_id: string | null; monto: number; moneda: string } | null;
  error: "NO_DISPONIBLE" | "ITEM" | "COMPRA" | "RECIBIR" | "SALIDA" | null;
  avisos: string[];
}

export interface Gasto {
  id: string;
  vuelo_id: string | null;
  /** Compra de refacciones de la que este gasto es un PAGO (mercancía,
   *  envío, impuestos u otro). Los gastos que comparten compra_id se ven
   *  como UNA compra en la bandeja; cada uno conserva su factura y su cruce
   *  bancario. Opcionales por skew de deploy. */
  compra_id?: string | null;
  compra_rol?: CompraRol | null;
  compra?: CompraRef | null;
  aeronave_id: string | null;
  usuario_captura_id: string | null;
  categoria: string;
  /** TOTAL PAGADO (ticket + propina): lo que llega al banco. Fuente única
   *  para reparto/reportes/conciliación. */
  monto: string;
  /** Propina incluida en monto (sub-parte informativa). monto − propina =
   *  importe del ticket/factura. */
  propina: string | null;
  moneda: "MXN" | "USD";
  tc_gasto: string | null;
  fecha_gasto: string | null;
  proveedor_id: string | null;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  /** ADITIVO (API 0.0.100, invariante 98): la cuenta de donde salió el pago
   *  (solo transferencia, pago domiciliado o Paywise). Ausente = API previo. */
  cuenta_bancaria_id?: string | null;
  /** Embed de la lista (`cuenta:cuenta_bancaria!cuenta_bancaria_id(...)`). */
  cuenta?: { alias: string; banco?: string | null; moneda?: string | null; tipo?: string | null } | null;
  /** Folio/remisión del ticket (llave anti-duplicados; puede venir de la IA). */
  folio_ticket: string | null;
  /** Detalle de cargas de combustible (categoria GAS). */
  litros: string | null;
  tipo_combustible: "TURBOSINA" | "AVGAS" | null;
  lugar: string | null;
  fecha_hora_carga: string | null;
  /** Enum de Postgres FACTURA | VALE | SIN_COMPROBANTE. La UI son DOS
   *  opciones (14-sep-2026): «Con comprobante» = FACTURA (lo que ya manda la
   *  app con foto) y «Sin comprobante»; VALE es LEGADO y se LEE como «con
   *  comprobante». Leerlo SIEMPRE vía @/lib/admin/comprobante-badge
   *  (hayComprobante / etiquetaComprobante / textoComprobante). */
  estatus_comprobante: string;
  /** Seguimiento de oficina: PENDIENTE | SOLICITADA | FACTURADA |
   *  NO_FACTURABLE (semáforo "¿ya facturé este gasto?"). Independiente del
   *  comprobante del piloto. Etiquetas y colores en
   *  @/lib/admin/facturacion-estatus. */
  estatus_facturacion?: string;
  foto_url: string | null;
  /** Lectura IA del comprobante (jsonb: matricula, conceptos, folio…). */
  valor_ia_extraido: Record<string, unknown> | null;
  /** ADITIVO (API 0.0.75 con la migración 20261013000008): TUA incluida
   *  fijada por OFICINA (string numérico de PostgREST o número, CON IVA, en la
   *  moneda del gasto). null = usar la lectura de la IA; 0 = la factura no
   *  cobra TUA; undefined = API sin la columna ⇒ el panel NO pinta ni manda
   *  el campo. Leerla SIEMPRE vía `@/lib/admin/tua-incluida`. */
  tua_incluida?: string | number | null;
  /** ADITIVO (API 0.0.75, solo en GET lista y detalle): la TUA que separa la
   *  LECTURA de la IA (ignora la cifra de oficina); informativo. El panel no
   *  la recalcula. */
  tua_detectada_ia?: number | null;
  /** ADITIVO (16-oct-2026, API 0.0.89 + migración 20261016000005,
   *  invariante 90): «Pago de AFAC» — lo paga VuelaTour y NO le resta a
   *  ningún avión (es el comprobante bancario de los costos reales AFAC que
   *  se capturan por vuelo en el Balance general). Solo en categoría
   *  PERMISO (trigger en la BD). undefined = API sin la columna ⇒ el panel no
   *  pinta ni manda la casilla. Leerlo SIEMPRE vía `@/lib/admin/pago-afac`. */
  es_pago_afac?: boolean;
  /** ADITIVO (27-oct-2026, API 0.0.110 + migración 20261027000001,
   *  invariante 110): «Es el pago al operador externo» — este gasto es el
   *  costo REAL del operador que cubrió el vuelo; el costo cotizado de la
   *  cotización deja de sumarse en los libros. Solo con vuelo cubierto por
   *  externo (trigger en la BD). undefined = API previo ⇒ el panel no pinta
   *  ni manda la casilla. Leerlo SIEMPRE vía `@/lib/admin/pago-operador-externo`. */
  es_pago_operador_externo?: boolean;
  /** ADITIVOS (19-oct-2026, API 0.0.95, gastos «por pagar»): la columna y
   *  el estado que CALCULA el API (conciliado ⇒ PAGADO; fecha < hoy ⇒
   *  VENCIDO). Sin la migración no viajan ⇒ el panel no pinta nada. Leerlos
   *  SIEMPRE vía `@/lib/admin/gasto-por-pagar` (`estadoPagoDe`,
   *  `chipEstadoPago`). */
  por_pagar?: boolean;
  estado_pago?: "PAGADO" | "POR_PAGAR" | "VENCIDO" | string;
  /** Sello de la última escritura: viaja como `if_updated_at` (CAS del API,
   *  409 CONFLICTO_VERSION) al marcar pagado. */
  updated_at?: string | null;
  /** ADITIVO, solo en la respuesta del alta con `inventario` (ver el tipo). */
  inventario?: GastoInventarioResultado | null;
  /** ADITIVO (API 0.0.77), solo en la respuesta del alta con
   *  `conciliar_con_movimientos` («Créalo por la suma» de Conciliación): los
   *  cargos que quedaron ligados y cómo quedó el gasto. Se lee SIEMPRE por
   *  `lib/admin/conciliacion-cargos-gasto.ts#textoExitoCrearSuma`. */
  conciliacion?: ConciliacionAlCrear | null;
  conciliado: boolean;
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS): un gasto puede tener N cargos
   *  del banco ligados (misma moneda); `conciliado` solo es true cuando lo
   *  CUBREN. `monto_vinculado` = suma ligada, `faltante` = lo que falta.
   *  Opcionales por skew de deploy: leerlos vía `estadoParcialDeGasto`
   *  (@/lib/admin/conciliacion-parcial). */
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  duplicado_sospechado: boolean;
  /** Prellenado con IA desde la app (flujo admin): pendiente del visto bueno. */
  requiere_visto_bueno?: boolean;
  visto_bueno_at?: string | null;
  /** Quién subió el gasto: PILOTO | MECANICO | OFICINA | SISTEMA (pistas) | VISITANTE. */
  origen: string | null;
  /** Aterrizaje al que corresponde (gastos de pista). */
  escala_id: string | null;
  /** Factura recibida que lo ampara (amarre 1 factura → N gastos). Desde el
   *  API 0.0.86 es la PRINCIPAL: el gasto puede tener varias (`facturas`). */
  factura_recibida_id: string | null;
  /** ADITIVO (API 0.0.86, lista de gastos): cuántas facturas lo amparan.
   *  Sin la llave (API previo) ⇒ 1 si hay principal. Leerlo SIEMPRE vía
   *  `nFacturasDeFila` (@/lib/admin/facturas-gasto). */
  facturas_n?: number | null;
  /** ADITIVO (API 0.0.86, solo en el detalle `GET /v1/expenses/:id`): las
   *  facturas del gasto. Leerlo vía `facturasDeRespuesta`. */
  facturas?: FacturaDeGasto[];
  notas: string | null;
  /** Llegada al servidor (gatea la ventana de edición). */
  created_at: string;
  /** Momento REAL de captura (7-sep-2026): la app lo manda al guardar aunque
   *  esté sin señal; panel/masivo/sistema = created_at. SOLO auditoría y
   *  lectura (no toca dinero ni candados). Opcional por skew de deploy: leerlo
   *  SIEMPRE vía capturadoEnDe() (@/lib/admin/gastos-captura). */
  capturado_en?: string | null;
  /** Sello de confirmación del PANEL (oficina): quién confirmó y cuándo.
   *  Solo viaja a roles de oficina (el API lo recorta a campo) y puede no
   *  venir aún (skew de deploy): SIEMPRE opcional con fallback. Cualquier
   *  edición desde un rol de campo lo limpia (oficina re-confirma). */
  verificado_por?: string | null;
  verificado_at?: string | null;
  /** Join del sello — PostgREST puede devolverlo como arreglo: leerlo
   *  SIEMPRE vía verificadorNombre(). */
  verificador?: { nombre: string } | Array<{ nombre: string }> | null;
  proveedor?: { nombre: string } | null;
  aeronave?: { matricula: string } | null;
  captura?: { nombre: string } | null;
  /** `fecha_vuelo` (ADITIVO, API 0.0.96): `timestamptz` de la salida; la
   *  tabla de Gastos pinta su día Cancún bajo «Vuelo #375». Con un API previo
   *  no viaja y no se pinta nada. */
  vuelo?: {
    folio: string | null;
    fecha_vuelo?: string | null;
    /** ADITIVOS (API 0.0.110): el vuelo cubierto por externo y su operador,
     *  para ofrecer «Es el pago al operador externo» en «Verificar / editar»
     *  aunque el vuelo quede fuera de la lista de vuelos cercanos. */
    es_externo?: boolean | null;
    operador_externo?: string | null;
  } | null;
  /** Reparto entre aviones (tabla hija): la fila del gasto NUNCA se parte —
   *  conciliación y anti-duplicados siguen viendo un solo gasto. El monto de
   *  cada parte va en la MONEDA del gasto (numeric → puede llegar string).
   *  Opcional por skew de deploy: sin campo = comportamiento clásico. */
  repartos?: GastoRepartoParte[];
}

/** Una parte del reparto de un gasto entre aviones (fila de gasto_reparto
 *  que viaja embebida en el gasto). El join de matrícula puede faltar. */
export interface GastoRepartoParte {
  aeronave_id: string;
  monto: string | number;
  aeronave?: { matricula: string } | null;
}

/** Nombre de quien confirmó el gasto (tolera el join objeto o arreglo). */
export function verificadorNombre(
  g: Pick<Gasto, "verificador">,
): string | null {
  const v = g.verificador;
  const x = Array.isArray(v) ? v[0] : v;
  return x?.nombre ?? null;
}

export interface GastoListResponse {
  data: Gasto[];
  count: number;
  limit: number;
  offset: number;
}

// ===== Otros gastos (generales OTRO/FIJO/INDIRECTO sin vuelo) =====

/** Totales del periodo POR MONEDA (nunca se mezclan MXN y USD). */
export interface OtrosGastosResumen {
  moneda: string;
  total: string | number;
  asignado_aviones: string | number;
  /** Lo NO asignado a aviones: gasto de la empresa VuelaTour. */
  empresa: string | number;
}

export interface OtrosGastosResponse {
  periodo: { desde: string; hasta: string };
  data: Gasto[];
  resumen: OtrosGastosResumen[];
}

/** Estado del reparto de UN gasto (GET/PUT /v1/expenses/:id/reparto). */
export interface RepartoResponse {
  gasto: {
    id: string;
    categoria: string;
    monto: string | number;
    moneda: string;
    fecha_gasto: string | null;
    notas: string | null;
  };
  /** `matricula` null si el join no la trajo (`getReparto` del API manda
   *  `?? null`): leerla SIEMPRE con respaldo «¿?» (14-oct-2026). */
  items: Array<{ aeronave_id: string; monto: string | number; matricula: string | null }>;
  suma: string | number;
  /** monto − suma: la parte que absorbe VuelaTour (empresa). */
  remanente_empresa: string | number;
}

/** Aterrizaje del periodo sin gasto de pista, con tarifa sugerida. */
export interface PistaPendiente {
  escala_id: string;
  vuelo_id: string;
  folio: string | null;
  orden: number;
  tramo: string;
  destino_iata: string;
  fecha: string | null;
  fecha_gasto: string | null;
  aeronave_id: string | null;
  matricula: string | null;
  modelo: string | null;
  monto_sugerido: number | null;
  moneda: string;
  tarifa_variable: boolean;
}

export interface TarifaAerodromo {
  id: string;
  codigo_iata: string | null;
  modelo: string | null;
  monto: string;
  moneda: string;
  variable: boolean;
  activo: boolean;
  notas: string | null;
}
