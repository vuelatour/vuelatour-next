import type { CompraRef, CompraRol } from "./compras";

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
  /** Folio/remisión del ticket (llave anti-duplicados; puede venir de la IA). */
  folio_ticket: string | null;
  /** Detalle de cargas de combustible (categoria GAS). */
  litros: string | null;
  tipo_combustible: "TURBOSINA" | "AVGAS" | null;
  lugar: string | null;
  fecha_hora_carga: string | null;
  estatus_comprobante: string;
  /** Seguimiento de oficina: PENDIENTE | SOLICITADA | FACTURADA (semáforo
   *  "¿ya facturé este gasto?"). Independiente del comprobante del piloto. */
  estatus_facturacion?: string;
  foto_url: string | null;
  /** Lectura IA del comprobante (jsonb: matricula, conceptos, folio…). */
  valor_ia_extraido: Record<string, unknown> | null;
  conciliado: boolean;
  duplicado_sospechado: boolean;
  /** Prellenado con IA desde la app (flujo admin): pendiente del visto bueno. */
  requiere_visto_bueno?: boolean;
  visto_bueno_at?: string | null;
  /** Quién subió el gasto: PILOTO | MECANICO | OFICINA | SISTEMA (pistas) | VISITANTE. */
  origen: string | null;
  /** Aterrizaje al que corresponde (gastos de pista). */
  escala_id: string | null;
  /** Factura recibida que lo ampara (amarre 1 factura → N gastos). */
  factura_recibida_id: string | null;
  notas: string | null;
  created_at: string;
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
  vuelo?: { folio: string | null } | null;
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
  items: Array<{ aeronave_id: string; monto: string | number; matricula: string }>;
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
