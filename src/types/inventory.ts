export type TipoMovimiento = "ENTRADA" | "SALIDA" | "DEVOLUCION" | "AJUSTE";

/** Moneda de un monto del inventario (jamás se suman entre sí). */
export type MonedaInventario = "MXN" | "USD";

/**
 * Regla de COSTO del API (0.0.36, 25-sep-2026): el costo de un producto es
 * su ÚLTIMO PRECIO DE COMPRA. AUSENTE = API previo (costo FIFO): el panel
 * conserva los textos viejos solo donde el dato lo exija.
 */
export type ReglaCosto = "ULTIMO_PRECIO";

/**
 * Último precio de compra (API 0.0.36, `costoVigenteEn`): la ENTRADA con
 * costo > 0 más reciente. Conserva la MONEDA de la compra.
 */
export interface CostoVigente {
  movimiento_id: string | null;
  /** YYYY-MM-DD de la compra. */
  fecha: string;
  moneda: MonedaInventario;
  /** En `moneda`, tal cual se capturó (hasta 4 decimales). */
  unitario: number;
  unitario_usd: number;
  /** Pesos nativos si la compra fue en MXN; null si fue en USD. */
  unitario_mxn: number | null;
  /** T.C. de la compra (capturado u oficial de su día). */
  tc_compra: number | null;
}

/** T.C. oficial de hoy (la misma fuente que las cotizaciones). */
export interface TcHoy {
  tc: number;
  fecha_dato: string | null;
  fuente: string | null;
}

/**
 * SALIDA que se cobró con el precio de una compra (409
 * `ENTRADA_CON_SALIDAS` al «Editar costo» sin confirmar, API 0.0.36).
 */
export interface SalidaDependiente {
  id: string;
  fecha: string;
  cantidad: number;
  /** El costo GUARDADO en la salida (lo que se cobró), en `moneda`. */
  costo_unitario: number;
  moneda: MonedaInventario;
  /** Costo guardado 0 ⇒ la salida no generó cargo al avión. */
  sin_cargo: boolean;
  /** Matrícula, 'FLOTA' o '—'. */
  vendido_a: string;
}

/** Foto extra del producto en el bucket inventario-fotos. */
export interface InventarioFoto {
  url: string;
  path: string;
}

/**
 * Presentación/empaque de un ítem (caja de 6, tarima…). `factor` = unidades
 * del ítem que contiene; `codigo` = código de barras del EMPAQUE (distinto al
 * de la unidad). Un movimiento por empaque rebaja factor × cantidad_empaques
 * unidades — la cantidad en unidades sigue siendo la fuente única del cardex.
 */
export interface InventarioEmpaque {
  id: string;
  nombre: string;
  factor: number;
  codigo: string | null;
  activo: boolean;
}

export interface InventarioItem {
  id: string;
  nombre: string;
  numero_parte: string | null;
  codigo: string | null;
  categoria: string;
  stock_minimo: number | null;
  /** Presentación del stock: pieza, caja, bote, galón, litro, bolsa… */
  unidad?: string | null;
  /**
   * Precio de VENTA unitario al avión (29-ago-2026): la SALIDA se carga a
   * este precio como gasto BODEGA; el costo (último precio de compra) queda
   * para el inventario. Sin precio, la salida se cobra a ese costo + el margen
   * de la tienda. Opcional por skew de deploy.
   */
  precio_venta?: number | null;
  precio_venta_moneda?: "MXN" | "USD" | null;
  /** Foto del producto (URL pública del bucket inventario-fotos). */
  foto_url?: string | null;
  foto_storage_path?: string | null;
  /** Fotos adicionales (la principal sigue en foto_url). Opcional por skew de deploy. */
  fotos_adicionales?: InventarioFoto[] | null;
  /** Marca / fabricante (AeroShell). */
  marca?: string | null;
  /** Descripción de ficha (contenido, presentación, especificación). */
  descripcion?: string | null;
  /** Empaques (cajas) del ítem. Opcional por skew de deploy. */
  empaques?: InventarioEmpaque[] | null;
  /**
   * Texto A MOSTRAR de la ubicación (25-sep-2026): el nombre del catálogo o,
   * sin él, el texto LEGADO («Bodega Cancún», «Corner»…). null = sin
   * ubicación. La app Flutter lo sigue leyendo tal cual.
   */
  ubicacion: string | null;
  /**
   * ADITIVOS del catálogo de ubicaciones (API 0.0.35 + migración
   * 20260925000001). AUSENTES = API previo o migración sin aplicar: la
   * ubicación se pinta como siempre (texto) y nada se adivina.
   */
  ubicacion_id?: string | null;
  /** = `ubicacion` cuando `ubicacion_id` ≠ null. */
  ubicacion_nombre?: string | null;
  /** = `ubicacion` cuando `ubicacion_id` = null (texto anterior al catálogo). */
  ubicacion_legado?: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Catálogo de ubicaciones de bodega (25-sep-2026): Oficina vieja, Oficina
 * nueva, Locker del aeropuerto, Bodega del taller de Mérida, Bodega del
 * taller de Cozumel. `productos` = ítems ACTIVOS en esa ubicación.
 */
export interface InventarioUbicacion {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  productos: number;
  created_at: string;
  updated_at: string;
}

/** POST /v1/inventory/items/mover-ubicacion. */
export interface MoverUbicacionResultado {
  movidos: number;
  /** Ya estaban en esa ubicación. */
  sin_cambio: number;
  /** Ids que ya no existen (no es error). */
  no_encontrados: string[];
  /** Ids de productos dados de baja (no es error). */
  inactivos: string[];
  ubicacion: { id: string; nombre: string };
}

/**
 * GET /v1/inventory/tienda/resumen — utilidad de la tienda VuelaTour
 * (25-sep-2026). Cada moneda por SEPARADO: jamás se suman. null = no hubo
 * nada en esa moneda (0 es 0).
 */
export interface TiendaResumen {
  /** null = todo el historial. */
  periodo: { desde: string; hasta: string } | null;
  margen_venta_pct: number;
  utilidad_mxn: number | null;
  utilidad_usd: number | null;
  ventas_mxn: number | null;
  ventas_usd: number | null;
  costo_ventas_mxn: number | null;
  costo_ventas_usd: number | null;
  /** Σ salidas a aviones del periodo (con y sin venta). */
  unidades_cargadas: number;
  /** Σ salidas CON venta (las que generan utilidad). */
  unidades_vendidas: number;
  productos_con_ventas: number;
  /** Salidas con venta cuya utilidad no se puede expresar (pesos sobre USD sin T.C.). */
  ventas_sin_utilidad: number;
  con_entradas_sin_costo: boolean;
  /**
   * ADITIVOS API 0.0.36: la utilidad ya cuenta en PESOS (cada venta en
   * dólares convertida con el T.C. oficial de SU día). Lo que era dólar
   * original se informa aparte, como dato secundario (jamás sumado).
   * `utilidad_usd`/`ventas_usd` quedan SOLO para filas sin T.C.
   */
  ventas_usd_original?: number | null;
  costo_ventas_usd_original?: number | null;
  utilidad_usd_original?: number | null;
  regla_costo?: ReglaCosto;
}

/** Ítem enriquecido con stock y valuación calculados por el API. */
export interface InventarioItemWithStock extends InventarioItem {
  stock: number;
  valor_usd: number;
  costo_fifo_actual: number;
  /**
   * Valorizado en pesos REALES (moneda operativa del cliente); el USD es para
   * el reparto. **Cambió de significado el 22-sep-2026** (invariante 8 del
   * API): ya NO incluye lo comprado en dólares sin tipo de cambio — eso viaja
   * en `valor_usd_sin_tc`. Jamás sumar los dos (ver `lib/admin/
   * inventario-valorizado.ts`).
   */
  valor_mxn: number;
  /** ADITIVO: valorizado en DÓLARES de las capas sin T.C. Ausente = API previo. */
  valor_usd_sin_tc?: number;
  /** ADITIVO: `valor_mxn` ya es TODO el valorizado. Ausente = API previo. */
  pesos_exactos?: boolean;
  /**
   * DEPRECADO (API 0.0.36: = `costo_vigente_mxn ?? 0`; nadie lo pinta). Con
   * un API previo era el costo FIFO de la capa más antigua VIVA y traía el
   * número en dólares cuando esa capa se compró en USD sin T.C. (no es una
   * suma de dinero; el API lo cualifica con `pesos_exactos`).
   */
  costo_fifo_mxn_actual: number;
  bajo_stock: boolean;
  /**
   * Ganancia / pérdida del producto (4-sep-2026): la MISMA agregación que la
   * hoja "inventario" del Balance general — Σ ventas al avión CON precio −
   * costo de esas salidas, en MXN. null = nunca vendió con precio (una
   * salida a costo no es venta). Opcionales por skew de deploy.
   */
  salidas_cant?: number | null;
  ventas_mxn?: number | null;
  costo_ventas_mxn?: number | null;
  /** Se conserva por compatibilidad: = `utilidad_mxn`. */
  ganancia_mxn?: number | null;
  /**
   * UTILIDAD DE LA TIENDA (25-sep-2026, API 0.0.35) — ADITIVOS, cada moneda
   * por su lado (jamás se suman). Ausentes = API previo.
   *  - `ventas_cant`: unidades de las salidas CON venta (null = ninguna).
   *  - `utilidad_mxn` / `utilidad_usd`: Σ venta − costo en su moneda (desde
   *    el API 0.0.36 `utilidad_usd` solo trae filas SIN T.C.).
   *  - `ventas_sin_utilidad`: salidas con venta en pesos sobre costo en
   *    dólares sin T.C. (su utilidad no se puede expresar).
   */
  ventas_cant?: number | null;
  utilidad_mxn?: number | null;
  ventas_usd?: number | null;
  costo_ventas_usd?: number | null;
  utilidad_usd?: number | null;
  ventas_sin_utilidad?: number;
  /** Alguna ENTRADA quedó a $0: la ganancia está inflada hasta completar su costo. */
  con_entradas_sin_costo?: boolean;
  /**
   * Algún movimiento está en USD sin tipo de cambio: el API deja en null los
   * montos en pesos afectados (jamás suma USD como MXN); la ganancia puede
   * faltar por eso. Opcional por skew de deploy.
   */
  con_movimientos_sin_tc?: boolean;
  /**
   * ADITIVOS API 0.0.36 (último precio de compra + T.C. del día). Ausentes =
   * API previo.
   *  - `costo_vigente`: último precio de compra (con su moneda).
   *  - `costo_vigente_mxn`: ese precio en pesos HOY (null sin T.C. de hoy).
   *  - `*_usd_original`: lo que se vendió en dólares, en dólares (dato
   *    secundario del tooltip; los pesos ya lo incluyen convertido).
   *  - `movimientos_sin_tc`: filas que siguen sin T.C. (0 tras la migración).
   */
  costo_vigente?: CostoVigente | null;
  costo_vigente_mxn?: number | null;
  ventas_usd_original?: number | null;
  costo_ventas_usd_original?: number | null;
  utilidad_usd_original?: number | null;
  ventas_a_costo_mxn?: number | null;
  salidas_a_costo_cant?: number | null;
  movimientos_sin_tc?: number;
}

export interface InventarioMovimiento {
  id: string;
  item_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario_usd: number;
  /** Moneda en la que se CAPTURÓ el costo (la contabilidad interna es USD). */
  moneda?: "MXN" | "USD";
  costo_unitario_mxn?: number | null;
  tc_usd_mxn?: number | null;
  /** SALIDA con venta: precio unitario que pagó el avión (null = a costo). */
  venta_unitaria?: number | null;
  venta_moneda?: "MXN" | "USD" | null;
  /** Venta total MXN − costo MXN (la manda el API en el detalle del ítem). */
  ganancia_mxn?: number | null;
  /**
   * ADITIVO (25-sep-2026): utilidad de una salida cobrada en dólares sobre
   * costo en dólares (sin T.C.). Nunca viene junto con `ganancia_mxn`.
   */
  ganancia_usd?: number | null;
  /** SALIDA prorrateada a TODA la flota (sin avión específico). */
  para_flota?: boolean | null;
  /**
   * Costo unitario en PESOS con el criterio único del API (costoUnitarioMxnDe):
   * el panel lo pinta tal cual y no convierte monedas. Opcional por skew.
   */
  costo_unitario_mxn_efectivo?: number | null;
  aeronave_id: string | null;
  proveedor_id: string | null;
  fecha_movimiento: string;
  fecha_orden: string | null;
  fecha_cargo_banco: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  /** Capturado por empaque: cantidad (unidades) = cantidad_empaques × factor. */
  empaque_id?: string | null;
  cantidad_empaques?: number | null;
  empaque?: { nombre: string; factor: number } | null;
  aeronave?: { matricula: string } | null;
  proveedor?: { nombre: string } | null;
  item?: { nombre: string; numero_parte: string | null; categoria: string } | null;
  /**
   * DEVOLUCION: parte del cargo que el API NO pudo revertir (null = revirtió
   * todo). Una devolución contra una salida «para todas las matrículas» cae
   * SIEMPRE aquí: esos gastos son N (uno por avión) y se corrigen desde
   * Gastos. El dinero jamás desaparece en silencio, así que el panel lo dice.
   */
  reversion_pendiente?: {
    sin_revertir: number;
    moneda: "MXN" | "USD";
    gastos_sin_tc: number;
  } | null;
  /**
   * Respuesta de `POST items/:id/movimientos` (SALIDA): el gasto BODEGA que
   * se le cargó al avión (`{id, monto, moneda, categoria}`) o, para toda la
   * flota, el resumen del prorrateo (`{prorrateado, aviones, monto_total,
   * gastos}`). null = no hubo cargo (costo 0 o no es salida).
   */
  gasto_generado?: GastoGeneradoSalida | null;
  /**
   * ADITIVOS 25-sep-2026 (API 0.0.35): de dónde salió el precio que pagó el
   * avión y, con MARGEN, el % aplicado. null fuera de SALIDA y en el replay
   * idempotente. Ausentes = API previo.
   */
  venta_origen?: OrigenVenta | null;
  margen_pct?: number | null;
  /**
   * ADITIVOS API 0.0.36 — detalle del ítem (cardex completo):
   *  ENTRADA: `fija_precio` (costo > 0), `es_precio_vigente` (es el último
   *  precio de compra), `salidas_con_este_precio` (cuántas salidas se
   *  cobraron con él) y `salidas_sin_cargo` (cuántas de ellas salieron a $0,
   *  sin cargo al avión). SALIDA: costo y venta ya en pesos con el T.C. del
   *  día de la venta (`tc_venta`).
   */
  fija_precio?: boolean;
  es_precio_vigente?: boolean;
  salidas_con_este_precio?: number;
  salidas_sin_cargo?: number;
  tc_venta?: number | null;
  costo_total?: number | null;
  costo_moneda?: MonedaInventario | null;
  costo_total_mxn?: number | null;
  venta_total_mxn?: number | null;
  ganancia_usd_original?: number | null;
  /**
   * ADITIVOS de la RESPUESTA de `POST items/:id/movimientos` (SALIDA):
   * último precio con que se costeó, T.C. del día de la venta y un aviso
   * (`SIN_COSTO_VIGENTE` = salió a $0 porque el producto no tiene ninguna
   * compra con costo).
   */
  costo_vigente?: CostoVigente | null;
  aviso?: string | null;
  /** Texto es-MX del aviso, redactado por el API (preferido sobre el del panel). */
  aviso_mensaje?: string | null;
  /**
   * ADITIVOS de la RESPUESTA de `PATCH items/:id/movimientos/:movId`
   * («Editar costo»): las salidas que conservan el costo con que se cobraron.
   */
  salidas_conservan_costo?: SalidaDependiente[];
}

/** Precedencia del precio de una SALIDA (API 0.0.35, `precioVentaDeSalida`). */
export type OrigenVenta = "PRECIO_CAPTURADO" | "PRECIO_PRODUCTO" | "MARGEN" | "A_COSTO";

export type GastoGeneradoSalida =
  | { id: string; monto: number; moneda: "MXN" | "USD" | string; categoria?: string }
  | { prorrateado: true; aviones: number; monto_total: number; gastos: number };

export interface InventarioListResponse {
  data: InventarioItemWithStock[];
  count: number;
  limit: number;
  offset: number;
  valor_total_usd: number;
  /** Σ `valor_mxn` — SOLO pesos reales desde el 22-sep-2026 (ver el ítem). */
  valor_total_mxn: number;
  /** ADITIVO: Σ `valor_usd_sin_tc`, en DÓLARES y aparte. Ausente = API previo. */
  valor_total_usd_sin_tc?: number;
  /** Por página, como valor_total_*; el cliente re-suma. Opcionales por skew. */
  ventas_total_mxn?: number;
  ganancia_total_mxn?: number;
  /** ADITIVOS 25-sep-2026 (por página): cada moneda por su lado, jamás sumadas. */
  utilidad_total_mxn?: number | null;
  utilidad_total_usd?: number | null;
  /** Margen vigente de la tienda (% sobre el costo del producto). */
  margen_venta_pct?: number;
  /** ADITIVOS API 0.0.36 (ausentes = API previo). */
  tc_hoy?: TcHoy | null;
  utilidad_total_usd_original?: number | null;
  ventas_total_usd_original?: number | null;
  regla_costo?: ReglaCosto;
}

export interface InventarioItemDetail extends InventarioItemWithStock {
  movimientos: InventarioMovimiento[];
}

/** Fila del bloque COMPRAS del resumen del producto (montos en MXN). */
export interface ResumenCompra {
  movimiento_id: string | null;
  /** YYYY-MM-DD (día Cancún). */
  fecha: string;
  tipo: "ENTRADA" | "DEVOLUCION" | "AJUSTE";
  cantidad: number;
  /** Null cuando la captura fue USD sin TC (`sin_tc`). */
  precio_unitario_mxn: number | null;
  total_mxn: number | null;
  moneda_captura: "MXN" | "USD";
  costo_unitario_capturado: number;
  tc_usd_mxn: number | null;
  /** ENTRADA a $0 (carga masiva sin precio real). */
  sin_costo: boolean;
  /** Capturada en USD sin tipo de cambio: no hay pesos que pintar. */
  sin_tc: boolean;
  proveedor_nombre: string | null;
  aeronave_matricula: string | null;
  referencia: string | null;
  descripcion: string;
  stock_despues: number;
  /** Compra de la que nació la entrada (abre /admin/inventory/compras/:id). */
  compra_id: string | null;
  /**
   * ADITIVOS API 0.0.36: precio y total NATIVOS (en la moneda de la
   * compra), total en dólares, si la fila fija precio y si es el último
   * precio de compra (el vigente). `total_mxn` ya viene lleno para las
   * compras en dólares (T.C. oficial del día de la compra).
   */
  precio_unitario?: number | null;
  moneda?: MonedaInventario | null;
  total?: number | null;
  total_usd?: number | null;
  fija_precio?: boolean;
  es_precio_vigente?: boolean;
}

/** Fila del bloque VENTAS del resumen del producto (montos en MXN). */
export interface ResumenVenta {
  movimiento_id: string | null;
  fecha: string;
  cantidad: number;
  /** Precio de venta unitario; en una salida A COSTO, el costo unitario. */
  precio_unitario_mxn: number | null;
  total_mxn: number | null;
  venta_moneda: "MXN" | "USD" | null;
  venta_unitaria_capturada: number | null;
  /** true = salió SIN precio: el avión pagó el costo (ganancia 0). */
  a_costo: boolean;
  /** Venta USD sin TC o capas USD sin TC: montos en pesos afectados en null. */
  sin_tc: boolean;
  costo_fifo_mxn: number | null;
  ganancia_mxn: number | null;
  /**
   * ADITIVOS 25-sep-2026 (fuente única `ventaDeSalida` del API). Ausentes =
   * API previo.
   *  - `venta_total`: lo cobrado al avión en `venta_moneda` (= monto del gasto).
   *  - `costo_fifo_usd`: costo de la salida en dólares (alias que el API
   *    conserva un release; nombre heredado del FIFO).
   *  - `ganancia_usd`: utilidad en dólares (venta y costo en USD sin T.C.).
   *  - `moneda_utilidad`: en qué moneda cuenta ESTA salida (nunca en las dos).
   *  - `utilidad_incompleta`: venta en pesos sobre costo en dólares sin T.C.
   */
  venta_total?: number | null;
  costo_fifo_usd?: number | null;
  ganancia_usd?: number | null;
  moneda_utilidad?: "MXN" | "USD" | null;
  utilidad_incompleta?: boolean;
  /** Matrícula, 'FLOTA' o '—'. */
  vendido_a: string;
  aeronave_id: string | null;
  para_flota: boolean;
  referencia: string | null;
  descripcion: string;
  remanente: number;
  /** Gasto del avión ligado (null en salidas a la flota: nacen N gastos). */
  gasto_id: string | null;
  /**
   * ADITIVOS API 0.0.36 (venta y costo convertidos con el MISMO T.C. oficial
   * del día de la venta, `tc_venta`):
   *  - `precio_unitario` / `moneda` / `total`: lo cobrado, NATIVO (a costo:
   *    el costo unitario nativo).
   *  - `costo_unitario` / `costo_moneda` / `costo_total` / `costo_mxn`: el
   *    costo GUARDADO en la salida (último precio de compra de su fecha).
   *  - `*_usd_original`: venta, costo y utilidad en dólares cuando las dos
   *    partes son dólares (dato secundario, jamás sumado a los pesos).
   */
  precio_unitario?: number | null;
  moneda?: MonedaInventario | null;
  total?: number | null;
  tc_venta?: number | null;
  costo_unitario?: number | null;
  costo_moneda?: MonedaInventario | null;
  costo_total?: number | null;
  costo_mxn?: number | null;
  venta_total_usd_original?: number | null;
  costo_usd_original?: number | null;
  ganancia_usd_original?: number | null;
}

/** Fila del bloque RESUMEN: un día con movimiento. */
export interface ResumenDia {
  fecha: string;
  entradas_cant: number;
  salidas_cant: number;
  /** Stock al cierre del día (tras el último movimiento del día). */
  existencia_cierre: number;
  ventas_mxn: number | null;
  costo_ventas_mxn: number | null;
  /** Σ ganancia de las salidas con precio del día; null = ese día no vendió. */
  utilidad_mxn: number | null;
  /** ADITIVOS 25-sep-2026: lo mismo en dólares (null = ese día no hubo venta USD). */
  ventas_usd?: number | null;
  costo_ventas_usd?: number | null;
  utilidad_usd?: number | null;
  /** ADITIVO API 0.0.36: utilidad del día en dólares originales (dato secundario). */
  utilidad_usd_original?: number | null;
  /** Algún movimiento del día está en USD sin TC. */
  sin_tc: boolean;
}

/**
 * Precio vigente del producto en la ficha (API 0.0.36): el último precio de
 * compra, su valor en pesos HOY y a cuánto se cobraría la siguiente salida.
 */
export interface PrecioVigenteFicha extends CostoVigente {
  /** Pesos HOY: MXN nativo, o USD × T.C. oficial de hoy; null sin T.C. */
  unitario_mxn_hoy: number | null;
  /**
   * `precioVentaDeSalida` sin precio tecleado. El API manda SIEMPRE el
   * objeto; `venta_unitaria` null = no se sabe a cuánto saldría (se pinta
   * solo el precio vigente).
   */
  siguiente_salida: {
    venta_unitaria: number | null;
    moneda: MonedaInventario | null;
    origen: OrigenVenta | null;
  } | null;
}

/**
 * «Dinero generado por este producto» (API 0.0.36): lo arma el API desde
 * `agregadosDeItem`; el panel NO suma nada. Pesos = moneda canónica; el USD
 * original es dato secundario.
 */
export interface DineroGenerado {
  /** Σ ventas con precio, en pesos (null = nunca vendió). */
  vendido_mxn: number | null;
  costo_mxn: number | null;
  utilidad_mxn: number | null;
  /** Σ de las ventas dólar-sobre-dólar, en dólares (null = ninguna). */
  vendido_usd_original: number | null;
  utilidad_usd_original: number | null;
  unidades_vendidas: number | null;
  /** Salidas SIN precio (a costo), en pesos (null = ninguna). */
  cargado_a_costo_mxn: number | null;
  unidades_a_costo: number | null;
  ventas_sin_utilidad: number;
  /** Respaldo: utilidad que solo existe en dólares (filas sin T.C.). */
  utilidad_usd_sin_tc: number | null;
}

/**
 * GET /v1/inventory/items/:id/resumen — bloques COMPRAS | VENTAS | RESUMEN
 * por día + totales. Los calcula el API con el MISMO costo/utilidad de la
 * hoja Inventario del Balance general y del cardex Excel; el panel solo pinta.
 */
export interface InventarioItemResumen {
  item: {
    id: string;
    nombre: string;
    numero_parte: string | null;
    unidad: string | null;
    categoria: string | null;
    precio_venta: number | null;
    precio_venta_moneda: "MXN" | "USD" | null;
    /** ADITIVOS 25-sep-2026 (misma regla que el listado). */
    ubicacion?: string | null;
    ubicacion_id?: string | null;
    ubicacion_nombre?: string | null;
    ubicacion_legado?: string | null;
  };
  moneda: "MXN";
  /** ADITIVO 25-sep-2026: margen vigente de la tienda (% sobre el costo). */
  margen_venta_pct?: number;
  /** ADITIVOS API 0.0.36 (ausentes = API previo, costo FIFO). */
  regla_costo?: ReglaCosto;
  tc_hoy?: TcHoy | null;
  /** null = el producto no tiene ninguna compra con costo. */
  precio_vigente?: PrecioVigenteFicha | null;
  dinero_generado?: DineroGenerado;
  periodo: { desde: string | null; hasta: string | null } | null;
  compras: ResumenCompra[];
  ventas: ResumenVenta[];
  resumen_diario: ResumenDia[];
  totales: {
    compras_cant: number | null;
    compras_mxn: number | null;
    ventas_cant: number | null;
    /** Σ salidas CON precio (mismo número que el listado y el balance). */
    ventas_mxn: number | null;
    /** Σ (a costo) de las salidas SIN precio — informativo. */
    ventas_a_costo_mxn: number | null;
    costo_ventas_mxn: number | null;
    utilidad_mxn: number | null;
    /** ADITIVOS 25-sep-2026: dólares por su lado (jamás sumados con los pesos). */
    ventas_usd?: number | null;
    costo_ventas_usd?: number | null;
    utilidad_usd?: number | null;
    ventas_sin_utilidad?: number;
    con_entradas_sin_costo: boolean;
    /** Algún movimiento del cardex está en USD sin TC (filas con `sin_tc`). */
    con_movimientos_sin_tc: boolean;
    existencia_actual: number;
    /** SOLO pesos reales desde el 22-sep-2026 (invariante 8 del API). */
    valor_costo_mxn: number;
    /** ADITIVO: la parte del valorizado que está en dólares sin T.C. */
    valor_costo_usd?: number | null;
    /** ADITIVO: alguna capa viva está en dólares sin T.C. */
    valor_sin_tc?: boolean;
    /** ADITIVOS API 0.0.36 (ver `DineroGenerado`). */
    ventas_usd_original?: number | null;
    costo_ventas_usd_original?: number | null;
    utilidad_usd_original?: number | null;
    salidas_a_costo_cant?: number | null;
    unidades_vendidas?: number | null;
    /** Filas con monto ≠ 0 que siguen SIN T.C. (0 tras la migración). */
    movimientos_sin_tc?: number;
  };
}

// ───────── Baja de un movimiento de cardex (21-sep-2026) ─────────

/**
 * Por qué NO se puede eliminar un movimiento. Los decide el API
 * (`eliminar-movimiento.util.ts`): el panel NUNCA los deduce ni recalcula el
 * cardex — solo pinta el veredicto y el mensaje que vienen en la respuesta.
 */
export type CodigoBloqueoEliminacion =
  | "MOVIMIENTO_DE_COMPRA"
  | "STOCK_NEGATIVO"
  | "CAMBIA_COSTO_FIFO"
  | "GASTO_BLOQUEADO"
  | "TIPO_NO_SOPORTADO";

/** Gasto REFACCION/BODEGA que se iría con el movimiento (o que lo bloquea). */
export interface GastoLigadoEliminacion {
  id: string;
  monto: number;
  moneda: string;
  aeronave_matricula: string | null;
  fecha_gasto: string | null;
  /** Ya está conciliado / facturado / dejó de ser de bodega: no se puede borrar. */
  bloqueado: boolean;
  motivo_bloqueo: string | null;
}

/**
 * GET /v1/inventory/items/:id/movimientos/:movId/eliminacion (ADMIN) — vista
 * previa: SOLO lee. `mensaje` ya viene en es-MX y dice qué eliminar primero.
 */
export interface EliminacionMovimientoPreview {
  permitido: boolean;
  codigo_bloqueo: CodigoBloqueoEliminacion | null;
  mensaje: string;
  stock_antes: number;
  stock_despues: number;
  movimiento: {
    tipo: string;
    cantidad: number;
    /** YYYY-MM-DD. */
    fecha: string;
    /** Matrícula, 'FLOTA' (salida prorrateada) o null. */
    aeronave: string | null;
  };
  gastos: GastoLigadoEliminacion[];
  /** La ENTRADA nació de recibir una compra: se corrige desde Compras. */
  de_compra: { folio: number | null } | null;
  /**
   * ADITIVOS API 0.0.36: quitar el movimiento ya no cambia el costo de
   * ninguna salida (cada una guarda el suyo), pero SÍ puede cambiar el
   * último precio de compra (con él se valúa la existencia y se cobra la
   * siguiente salida). `CAMBIA_COSTO_FIFO` deja de emitirse.
   */
  precio_vigente_antes?: CostoVigente | null;
  precio_vigente_despues?: CostoVigente | null;
  cambia_precio_vigente?: boolean;
  regla_costo?: ReglaCosto;
}

/** DELETE /v1/inventory/items/:id/movimientos/:movId (SOLO ADMIN). */
export interface EliminarMovimientoResultado {
  ok: true;
  auditoria_id: string | null;
  gastos_eliminados: number;
  stock_resultante: number;
  valor_usd: number;
  valor_mxn: number;
}

/**
 * GET /v1/inventory/items/:id/movimientos-eliminados (OFICINA) — bitácora:
 * qué se borró, QUIÉN, CUÁNDO y con qué MOTIVO. [] cuando la migración
 * 20260921000001 todavía no está aplicada.
 */
export interface MovimientoEliminado {
  id: string;
  movimiento_id: string;
  tipo: string;
  cantidad: number;
  fecha_movimiento: string;
  aeronave_matricula: string | null;
  motivo: string;
  /** Aditivo del API (uuid del autor); el nombre es lo que se pinta. */
  eliminado_por?: string | null;
  eliminado_por_nombre: string | null;
  eliminado_at: string;
  gastos_eliminados: number;
  monto_gastos: number | null;
  /** Sin la moneda, `monto_gastos` no se puede pintar sin mentir. Aditivo. */
  moneda_gastos?: string | null;
}

/** GET /v1/inventory/codigo/:codigo — un código identifica un ítem O un empaque. */
export interface CodigoLookup {
  tipo: "ITEM" | "EMPAQUE";
  item: InventarioItemDetail;
  empaque: { id: string; nombre: string; factor: number; codigo: string | null } | null;
}

export type ImportarItemEstado = "OK" | "ERROR" | "DUPLICADO";

/** Fila de la alta masiva (preview y confirmación comparten la forma). */
export interface ImportarItemsFila {
  fila: number;
  estado: ImportarItemEstado;
  nombre: string | null;
  codigo: string | null;
  mensajes: string[];
  crear?: {
    item?: {
      nombre?: string;
      marca?: string | null;
      categoria?: string;
      numero_parte?: string | null;
      codigo?: string | null;
      unidad?: string | null;
      ubicacion?: string | null;
      stock_minimo?: number | null;
    } | null;
    empaque?: { nombre: string; factor: number; codigo?: string | null } | null;
    entrada_inicial?: {
      cantidad?: number;
      moneda?: "MXN" | "USD";
      costo_unitario_usd?: number | null;
      costo_unitario_mxn?: number | null;
      tc_usd_mxn?: number | null;
    } | null;
  } | null;
}

export interface ImportarItemsResultado {
  total: number;
  filas: ImportarItemsFila[];
  /** Solo con confirmar=true. */
  creados?: number;
}

export interface MovimientoListResponse {
  data: InventarioMovimiento[];
  count: number;
  limit: number;
  offset: number;
}

export interface CompraLineaExtraida {
  nombre: string;
  numero_parte: string | null;
  cantidad: number;
  precio_unitario_usd: number | null;
  total_usd: number | null;
}

export interface CompraExtraida {
  proveedor: string | null;
  fecha: string | null;
  moneda: string;
  lineas: CompraLineaExtraida[];
  subtotal_usd: number | null;
  shipping_usd: number | null;
  impuestos_usd: number | null;
  total_usd: number | null;
  confianza: number;
  notas: string;
  modelo: string;
}
