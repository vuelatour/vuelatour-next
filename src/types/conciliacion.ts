import type {
  CandidatoIngresoAbono,
  CategoriaIngreso,
  MonedaIngreso,
} from "@/types/ingresos";

export type TipoMovimientoBancario = "CARGO" | "ABONO";

export interface MovimientoGasto {
  id: string;
  monto: string;
  moneda: string;
  categoria: string;
  fecha_gasto: string | null;
  proveedor?: { nombre: string | null } | null;
  /** Vuelo al que pertenece el gasto conciliado (para verificar de un clic). */
  vuelo_id?: string | null;
  vuelo?: { folio: number | null } | null;
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS): suma de los cargos ligados al
      gasto y lo que falta para cubrirlo. Sin ellos (API sin desplegar) la UI
      se comporta como hoy — leerlos SIEMPRE por `estadoParcialDeGasto`. */
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  /** 1 CARGO ↔ N GASTOS (2-oct-2026, ADITIVOS del API 0.0.52) — solo en
      `MovimientoBancario.gastos[]`: lo que ESTE cargo aporta a ESE gasto
      (en la moneda de la CUENTA; en el 1↔1 cruzado USD↔MXN son los pesos),
      el lugar y la primera línea de las notas (los 29 «Pago VIP SAESA» no
      tienen proveedor: el nombre vive en las notas). `moneda` (arriba) es
      la del GASTO. Se leen SIEMPRE por `lib/admin/conciliacion-lote.ts`. */
  monto_parte?: string | number | null;
  lugar?: string | null;
  notas?: string | null;
  notas_primera_linea?: string | null;
  /** NÚMERO DE FACTURA del gasto (5-oct-2026, ADITIVO del API 0.0.57), ya
      resuelto por la fuente única del API (`folioComprobanteDeGasto`):
      serie-folio del CFDI ligado ⇒ folio del ticket ⇒ folio de la IA ⇒
      «CFDI <uuid>». Viene en `gasto` y en cada `gastos[]`. Se rotula SIEMPRE
      con `lib/admin/conciliacion-folio.ts`; sin él no se pinta nada. */
  folio_comprobante?: string | null;
  /** Medio de pago del gasto ligado (6-oct-2026, ADITIVO del API 0.0.63, en
      `gasto` y en cada `gastos[]`): un gasto en EFECTIVO u otro medio no
      bancario solo se liga con una justificación, y la columna lo marca con
      `badgeVinculoNoBancario` (`lib/admin/conciliacion-no-bancario.ts`).
      Ausente = API previo: no se pinta nada. */
  medio_pago?: string | null;
  /** En qué balance y en qué mes vive el gasto (13-oct-2026, punto 5):
      ADITIVO, API 0.0.75, en `gasto` y en cada `gastos[]`. Ausente = API
      previo o lectura fallida: sin enlaces. null = no vive en ningún
      balance. Se lee SIEMPRE con `lib/admin/conciliacion-balance.ts`. */
  balance?: UbicacionBalanceGasto | null;
}

/** Hoja del libro del AVIÓN donde vive un gasto (informativo, punto 5). */
export type HojaBalanceAvion =
  | "reporte_horas"
  | "combustible"
  | "gastos_indirectos"
  | "refacciones"
  | "permisos";

/** PRIMERA hoja del balance de la FLOTA donde aparece un gasto (informativo). */
export type HojaBalanceGeneral =
  | "reporte_horas"
  | "combustible"
  | "otros_gastos"
  | "repartidos"
  | "inventario";

/**
 * «¿En qué libro y en qué mes vive este gasto?» (13-oct-2026, API 0.0.75,
 * punto 5). Lo decide SOLO el API (`common/ubicacion-balance-gasto.util.ts`,
 * espejo de los libros): el panel no deduce hojas ni meses, solo arma los
 * enlaces «Ver en balance…» de Conciliación con esto.
 */
export interface UbicacionBalanceGasto {
  /** Mes calendario completo: 'YYYY-MM-01' … último día del mes. */
  periodo: { desde: string; hasta: string };
  /** De qué fecha sale el mes: la del vuelo (día Cancún) o la del gasto. */
  eje: "vuelo" | "gasto";
  /** Balances de avión donde aparece, ordenados por matrícula (null = no se
      pudo leer; es cosmética). */
  aviones: { id: string; matricula: string | null }[];
  /** ¿Aparece en el balance de la flota? */
  general: boolean;
  hoja_avion?: HojaBalanceAvion | null;
  hoja_general?: HojaBalanceGeneral | null;
}

/** Cómo quedó cada gasto tras ligar un cargo (respuesta del PATCH, 0.0.52). */
export interface GastoEstadoParte {
  gasto_id: string;
  /** Lo que el cargo aporta a ese gasto (moneda de la cuenta). */
  monto_parte: string | number;
  /** Moneda de la parte (= la de la cuenta del cargo). */
  moneda?: string | null;
  /** Los cargos ligados CUBREN el gasto (regla del API, tolerancia 1.00). */
  gasto_conciliado?: boolean | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
}

/**
 * Gasto NO bancario ligado con justificación (6-oct-2026, ADITIVO de la
 * RESPUESTA del PATCH `movimientos/:id`, API 0.0.63): viaja SOLO cuando
 * entró un gasto en efectivo u otro medio no bancario. `notas_anotadas:
 * false` = la liga YA quedó pero la razón NO se pudo escribir en las notas
 * (el API no deshace la liga): el panel lo avisa en ámbar. Se lee SIEMPRE por
 * `toastsTrasVincular` (`lib/admin/conciliacion-no-bancario.ts`).
 */
export interface VinculoNoBancarioRespuesta {
  gasto_ids: string[];
  notas_anotadas: boolean;
}

/** Un cobro de vuelo pagado por un abono con VARIOS cobros (12-oct-2026, API 0.0.71). */
export interface MovimientoCobroParte {
  cobro_id: string;
  /** NETO del cobro en un lote (monto − comisión); el abono completo con una sola parte. */
  monto_parte: number | string;
  vuelo_id?: string | null;
  folio?: number | null;
  cliente?: string | null;
  /** timestamptz: formatear en hora Cancún. */
  fecha_cobro?: string | null;
  fecha_vuelo?: string | null;
  monto?: number | string | null;
  moneda?: string | null;
  metodo_cobro?: string | null;
  comision_banco_monto?: number | string | null;
  neto?: number | string | null;
}

export interface MovimientoBancario {
  id: string;
  cuenta_bancaria_id: string;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: string;
  descripcion: string | null;
  referencia: string | null;
  conciliado: boolean;
  gasto_id: string | null;
  cobro_id: string | null;
  /** ABONO conciliado contra el SOBRE de un grupo (cobro_grupo), excluyente
      con `cobro_id`. Aditivo (API previo no lo manda). */
  cobro_grupo_id?: string | null;
  /** Conciliado por CLASIFICACIÓN (no corresponde a ningún vuelo). */
  clasificacion_id?: string | null;
  clasificacion?: { nombre: string } | null;
  origen: string;
  notas: string | null;
  created_at: string;
  /** PASARELA (Paywise, aditivo 9-sep-2026): bruto cobrado al cliente y
      comisión retenida en este abono; `monto` sigue siendo el NETO
      depositado. null en cuentas de banco. */
  monto_bruto?: string | number | null;
  comision_monto?: string | number | null;
  gasto?: MovimientoGasto | null;
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS de la RESPUESTA de
      `PATCH /v1/conciliacion/movimientos/:id`): cómo quedó el GASTO tras
      ligar/desvincular este cargo — `gasto_conciliado` = los cargos ligados
      CUBREN su monto; `monto_vinculado` = suma ligada; `faltante` = lo que
      falta. Un gasto parcial sigue en «Gastos sin banco». */
  gasto_conciliado?: boolean | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  /** 1 CARGO ↔ N GASTOS (2-oct-2026, ADITIVOS del API 0.0.52; ausentes =
      API previo y la fila se pinta como antes). Fuente única de la liga:
      la tabla puente del API; `gasto_id`/`gasto` quedan como ESPEJO solo
      cuando hay EXACTAMENTE una parte (con 2+ vienen NULL).
      - `gastos_n`: cuántos gastos paga este cargo.
      - `gastos`: el detalle de cada parte (`monto_parte`, lugar, nota…).
      - `gastos_suma`: Σ monto_parte; `gastos_diferencia` = |monto| − Σ (el
        centavo del lote: SAESA factura 2,231.375 y el banco cobra 4,462.75
        por dos); null si hay una parte cruzada de moneda.
      - `gastos_estado`: SOLO en la respuesta del PATCH — cómo quedó cada
        gasto (cubierto o parcial).
      Se leen SIEMPRE por `lib/admin/conciliacion-lote.ts`. */
  gastos_n?: number | null;
  gastos?: MovimientoGasto[] | null;
  gastos_suma?: number | string | null;
  gastos_diferencia?: number | string | null;
  gastos_estado?: GastoEstadoParte[] | null;
  /** SOLO en la respuesta del PATCH (6-oct-2026, API 0.0.63): ver
      `VinculoNoBancarioRespuesta`. Ausente = no entró ningún gasto no
      bancario (o API previo). */
  vinculo_no_bancario?: VinculoNoBancarioRespuesta | null;
  /** Cobro de vuelo conciliado (ABONOS): detalle + navegación al vuelo. */
  cobro?: {
    monto?: string | null;
    moneda?: string | null;
    metodo_cobro?: string | null;
    fecha_cobro?: string | null;
    vuelo_id: string | null;
    vuelo?: { folio: number | null } | null;
  } | null;
  /** 1 ABONO ↔ N COBROS (12-oct-2026, ADITIVOS del API 0.0.71; ausentes =
      API previo y la fila se pinta como antes). Fuente única de la liga: la
      tabla puente del API; `cobro_id`/`cobro` quedan como ESPEJO solo cuando
      hay EXACTAMENTE una parte (con 2+ vienen NULL).
      - `cobros_n`: cuántos cobros paga este abono.
      - `cobros`: el detalle de cada parte (vuelo, folio, cliente, montos).
      - `cobros_suma`: Σ monto_parte; `cobros_diferencia` = |monto| − Σ.
      - `cobros_estado`: SOLO en la respuesta del PATCH …/cobro.
      Se leen SIEMPRE por `lib/admin/conciliacion-cobros-lote.ts`. */
  cobros_n?: number | null;
  cobros?: MovimientoCobroParte[] | null;
  cobros_suma?: number | string | null;
  cobros_diferencia?: number | string | null;
  cobros_estado?: MovimientoCobroParte[] | null;
  /** Sobre de grupo conciliado (ABONOS): detalle + navegación al grupo.
      Aditivo; null cuando la liga es por cobro de vuelo o gasto. */
  cobro_grupo?: SobreConciliacion | null;
  /** INGRESOS (24-sep-2026, ADITIVOS): ABONO conciliado contra un ingreso
      registrado (otro ingreso o anticipo), excluyente con gasto/cobro/sobre/
      clasificación. Ausentes = API previo o sin la migración. */
  ingreso_id?: string | null;
  ingreso?: {
    id: string;
    folio: number;
    categoria: CategoriaIngreso;
    monto: number;
    moneda: MonedaIngreso;
    descripcion: string;
  } | null;
  /** POR QUÉ sigue pendiente (ADITIVOS del 15-sep-2026, siempre opcionales):
      `motivo_pendiente` = código del API ('SIN_CANDIDATOS' | 'SE_PUEDE_CRUZAR' | 'AMBIGUO' |
      'SOLO_PARCIAL' | 'GASTO_YA_CUBIERTO' | 'FUERA_DE_VENTANA' |
      'NO_ES_DE_VUELO' | 'ERROR'), `candidatos_n` = cuántos gastos/cobros
      cuadraban y `auto_match_error` = el error que tumbó SU cruce (el resto
      del lote sí se procesó). Se leen SIEMPRE por `motivoPendienteDe`
      (`lib/admin/conciliacion-auto.ts`): sin ellos, badge «Pendiente». */
  motivo_pendiente?: string | null;
  candidatos_n?: number | null;
  auto_match_error?: string | null;
  /** ADITIVO (13-oct-2026, API 0.0.75): el texto de la regla USD↔MXN para
      un CARGO pendiente de una cuenta en pesos («El gasto en USD de $422.86
      USD daría T.C. 21.14 · oficial 17.01 (+24.3 %): fuera de ±2 %, no se
      liga.»). Lo lee `motivoPendienteDe`: en AMBIGUO / SE_PUEDE_CRUZAR
      reemplaza el texto genérico del tooltip; en SIN_CANDIDATOS se agrega. */
  motivo_detalle?: string | null;
  /** ADITIVO (13-oct-2026, API 0.0.75): CARGO con EXACTAMENTE una parte
      cruzada (gasto en USD pagado con este cargo en pesos): su T.C.
      implícito contra el T.C. OFICIAL del día del cargo. Ausente si la
      lectura de oficiales falló. Lo pinta `marcaLigaCruzada`
      (`lib/admin/conciliacion-tc.ts`): «⚠ …» ámbar si quedó fuera de lugar. */
  tc_cruce?: TcCruceUsd | null;
  /** Conciliado por una REGLA automática (traspaso interno, comisión del
      banco…): el API deja `notas = 'Regla: <patrón>'`; este flag es el
      camino explícito si el API lo manda. */
  clasificacion_auto?: boolean | null;
  /** CARGO DEVUELTO ↔ SU DEVOLUCIÓN (30-sep-2026, ADITIVOS del API 0.0.44):
      en el ABONO, `reverso_de_id` apunta al CARGO que devuelve y
      `reverso_de` trae su ficha; en el CARGO, `revertido_por` trae la ficha
      del abono. Los dos quedan conciliados con la clasificación «Reverso de
      un cargo». Ausentes = API previo (la fila se pinta como antes). Se leen
      SIEMPRE por `lib/admin/conciliacion-reverso.ts`. */
  reverso_de_id?: string | null;
  reverso_de?: MovimientoReversoRef | null;
  revertido_por?: MovimientoReversoRef | null;
  /** CONCEPTO DEL SPEI (13-oct-2026, ADITIVO del API 0.0.75): solo en las
      filas cuya descripción cita una factura («SEL TRANSF. INTERBANCARIA
      SPEI BANORTE fact vip 7360»). El NÚMERO lo lee el API
      (`factura-concepto.util.ts`): el panel NO parsea, solo rotula con
      `lib/admin/conciliacion-factura-concepto.ts`. Ausente = API previo o
      el texto no cita factura: la celda de siempre. */
  factura_concepto?: FacturaConceptoMovimiento | null;
}

// ===== Cargo devuelto ↔ devolución (30-sep-2026, API 0.0.44) =====

/** La otra mitad de una pareja cargo ↔ devolución. */
export interface MovimientoReversoRef {
  id: string;
  /** DATE `YYYY-MM-DD` (día de pared del banco). */
  fecha: string;
  descripcion: string | null;
}

/**
 * Candidato para emparejar: un CARGO (visto desde el abono,
 * `GET movimientos/:id/reverso-candidatos`) o un ABONO (visto desde el
 * cargo; lo arma el panel con la lista de pendientes de la cuenta).
 */
export interface CandidatoReverso {
  id: string;
  fecha: string;
  descripcion: string | null;
  referencia: string | null;
  monto: string | number;
  /** ADITIVO del API: el que elegiría «Emparejar devoluciones» (a lo más
      uno). El diálogo lo preselecciona; ausente = el primero de la lista. */
  sugerido?: boolean;
}

/** Respuesta de `POST movimientos/:abonoId/reverso` (los dos actualizados). */
export interface ParejaReverso {
  abono: MovimientoBancario;
  cargo: MovimientoBancario;
}

/** Qué pasó con UN abono en «Emparejar devoluciones». */
export interface ReversoAutoDetalle {
  abono_id: string;
  cargo_id: string | null;
  /** EMPAREJADO | SIN_CANDIDATO | AMBIGUO | ERROR (tolerante). */
  resultado: string;
  motivo?: string | null;
}

/** Respuesta de `POST /v1/conciliacion/reversos/auto`. */
export interface ReversosAutoResultado {
  emparejados: number;
  sin_candidato: number;
  ambiguos: number;
  /** Tolerado por si el API lo agrega. */
  errores?: number | null;
  detalle?: ReversoAutoDetalle[] | null;
}

// ===== Cruce automático y sugerencias IA (15-sep-2026) =====

/** Qué pasó con UN movimiento en el cruce automático. */
export interface AutoMatchDetalle {
  movimiento_id: string;
  /** CONCILIADO | AMBIGUO | SIN_CANDIDATO | TRASPASO | ERROR (tolerante). */
  resultado?: string | null;
  /** Con qué criterio se ligó: MONTO | TARJETA | DESCRIPCION | REGLA | … */
  criterio?: string | null;
  gasto_id?: string | null;
  cobro_id?: string | null;
  candidatos_n?: number | null;
  motivo?: string | null;
  error?: string | null;
  fecha?: string | null;
  monto?: string | number | null;
  descripcion?: string | null;
}

/**
 * Resultado de `POST /v1/conciliacion/auto-match` («Cruzar pendientes»): el
 * lote NUNCA se cae por un movimiento — lo que falla se cuenta en `errores`
 * y se explica en `detalle`.
 */
export interface AutoMatchResultado {
  revisados: number;
  conciliados: number;
  ambiguos: number;
  sin_candidato: number;
  /** Clasificados por regla (traspasos internos, comisiones…). Aditivo. */
  traspasos?: number | null;
  /** Devoluciones del banco emparejadas con su cargo (criterio REVERSO,
      30-sep-2026). Aditivo: también puede venir solo en `por_criterio`. */
  reversos?: number | null;
  /** El gasto candidato ya no admitía el cargo (409 legítimo). Aditivo. */
  rechazados?: number | null;
  errores: number;
  detalle?: AutoMatchDetalle[] | null;
  /** {MONTO: 15, TARJETA: 4, …} — desglose del cruce. Aditivo. */
  por_criterio?: Record<string, number> | null;
  /** Si el API lo corre como JOB (mismo diálogo de progreso). Aditivo. */
  job_id?: string | null;
  /** true = se alcanzó el tope de la corrida y quedan pendientes sin revisar. */
  truncado?: boolean | null;
}

/** Gasto candidato para vincular un CARGO (sugerencia y «Vincular gasto»). */
export interface GastoCandidato {
  id: string;
  fecha?: string | null;
  fecha_gasto?: string | null;
  monto: string | number;
  moneda?: string | null;
  proveedor?: string | null;
  categoria?: string | null;
  lugar?: string | null;
  notas?: string | null;
  notas_primera_linea?: string | null;
  tarjeta_terminacion?: string | null;
  matricula?: string | null;
  vuelo_folio?: number | null;
  medio_pago?: string | null;
  conciliado?: boolean | null;
  tc_implicito?: number | string | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  /** ADITIVOS (2-oct-2026, `gastos-candidatos` del API 0.0.52; `nota` y
      `capturado_por` ya los mandaba `sugerir`): `cruzado` = gasto en USD
      contra una cuenta en MXN (T.C. implícito 15–25): solo se liga 1 a 1,
      nunca dentro de un lote; `nota` = primera línea de las notas. */
  cruzado?: boolean | null;
  nota?: string | null;
  capturado_por?: string | null;
  /** NÚMERO DE FACTURA del candidato (5-oct-2026, ADITIVO del API 0.0.57 en
      `gastos-candidatos` y `sugerir`), misma fuente única que
      `MovimientoGasto.folio_comprobante`. Lo rotula `descripcionCandidatoGasto`. */
  folio_comprobante?: string | null;
  /** ADITIVO (6-oct-2026, API 0.0.63): el gasto NO pasó por el banco
      (EFECTIVO, PERSONAL_*; BODEGA jamás viaja). Solo llega con
      `incluir_no_bancarios=true`, DESPUÉS de los bancarios; vincularlo exige
      `justificacion`. Se lee SIEMPRE por `esCandidatoNoBancario` (sin el
      campo decide `medio_pago`). */
  no_bancario?: boolean | null;
  /** ADITIVO (13-oct-2026, API 0.0.75), solo cuando el concepto del cargo
      cita una factura: el folio del gasto (factura recibida, `folio_ticket`,
      folio de la IA o «fact NNNN» en la 1.ª línea de las notas) es el número
      que dice el banco. Es una SEÑAL dentro de su nivel de monto: pinta ★ y
      su renglón, jamás marca ni preselecciona (el orden lo da el API). */
  coincide_factura?: boolean | null;
  /** ADITIVO (13-oct-2026, API 0.0.75): candidato CRUZADO (gasto en USD
      contra una cuenta en pesos) evaluado contra el T.C. OFICIAL del día del
      cargo. Lo pinta `lineaTcCandidato` (tercera línea del candidato). */
  tc_cruce?: TcCruceUsd | null;
}

/** Cargo del banco con el que YA está conciliado un gasto excluido (de la puente). */
export interface CargoConciliadoExcluido {
  movimiento_id: string;
  /** Fecha del cargo (YYYY-MM-DD). */
  fecha: string | null;
  /** Lo que ESE cargo aporta al gasto. */
  monto: number | string;
  /** Moneda de la CUENTA del cargo. */
  moneda: string | null;
  /** Alias de la cuenta del cargo («GASTOS GNRAL»). */
  cuenta: string | null;
}

/**
 * Un gasto del MISMO monto que el cargo que NO entró a la lista de
 * candidatos (6-oct-2026, API 0.0.63; el API manda hasta 5 por motivo, en
 * orden de fecha).
 */
export interface GastoExcluidoCandidato {
  id: string;
  fecha_gasto?: string | null;
  monto: number | string;
  moneda?: string | null;
  medio_pago?: string | null;
  categoria?: string | null;
  /** Para ligar al vuelo (`/admin/flights/:id`); null = gasto sin vuelo. */
  vuelo_id?: string | null;
  vuelo_folio?: number | null;
  /** SOLO en `YA_CONCILIADO`: los cargos con los que ya está (el más viejo
      primero). `[]` = conciliado sin cargo en la puente; `null` = el API no
      pudo leer la puente (no se dice con qué cargo). */
  conciliado_con?: CargoConciliadoExcluido[] | null;
}

/**
 * Un grupo de `excluidos`: `motivo` = `EFECTIVO_U_OTRO_MEDIO` (medio de pago
 * no bancario) | `YA_CONCILIADO` | `OTRA_MONEDA` | `FUERA_DE_VENTANA` (en
 * ±120 días pero fuera de los ±`dias` pedidos). Un motivo nuevo del API se
 * pinta con una frase genérica, NUNCA con el código. `n` = cuántos son en
 * total (puede ser mayor que `gastos.length`).
 */
export interface ExcluidosCandidatos {
  motivo: string;
  n: number;
  gastos: GastoExcluidoCandidato[];
}

/**
 * Respuesta de `GET /v1/conciliacion/movimientos/:id/gastos-candidatos`
 * (2-oct-2026, API 0.0.52): gastos bancarios SIN conciliar en la moneda de
 * la cuenta (y, en una cuenta MXN sin búsqueda, los USD con T.C. implícito
 * 15–25 marcados `cruzado`), con fecha ±`dias` del cargo. Sin `q`, primero
 * los que cuadran con el cargo. `truncado` = hubo más que el `limite`.
 */
export interface GastosCandidatosResponse {
  movimiento: {
    id: string;
    fecha: string;
    monto: number | string;
    /** Moneda de la CUENTA del cargo. */
    moneda: string | null;
  };
  ventana: { desde: string; hasta: string };
  candidatos: GastoCandidato[];
  truncado: boolean;
  /** ADITIVO (6-oct-2026, API 0.0.63), SOLO con `candidatos` VACÍO: los
      gastos del MISMO monto (el del cargo o, si `q` es un monto, el de `q`)
      en ±120 días que no entraron, agrupados por motivo. Ausente (API previo,
      o la lectura extra falló) ⇒ el vacío de siempre. Lo redacta
      `textoExcluidosCandidatos`. */
  excluidos?: ExcluidosCandidatos[] | null;
  /** ADITIVO, viaja con `excluidos`: el monto con el que el API los buscó. */
  excluidos_monto?: number | null;
  /** ADITIVO (13-oct-2026, API 0.0.75), solo cuando el concepto del cargo
      cita una factura: qué dice el banco y los gastos ±120 días con esa
      factura que NO salen como candidatos (`otros_gastos`, misma forma que
      `excluidos`; null = no se pudo leer). Lo redacta
      `avisoFacturaEnCandidatos`. */
  factura_concepto?: FacturaConceptoCandidatos | null;
  /** ADITIVO (13-oct-2026, API 0.0.75), SIEMPRE presente desde ese API:
      T.C. oficial del día del cargo (null en cuentas no MXN, sin dato o con
      lectura fallida). Su PRESENCIA es la capacidad del API
      (`apiCruzaConOficial`, pegajosa): solo entonces el diálogo pinta el
      placeholder y la nota de las compras en dólares. */
  tc_oficial?: TcOficialDelDia | null;
  /** ADITIVO (revisión del lote 2, 14-oct-2026): SOLO cuando la LECTURA del
      T.C. oficial del día del cargo FALLÓ (≠ «no hay dato»). Entonces las
      compras en dólares salen sin compararse (`tc_cruce.lectura_fallida`) y
      no se pudieron buscar por su monto en pesos: el diálogo lo dice en
      ámbar y no promete esa búsqueda. Ausente = la lectura funcionó o API
      previo. */
  tc_oficial_lectura_fallida?: true | null;
}

/** Respuesta de `POST /v1/conciliacion/movimientos/:id/sugerir`. */
export interface SugerenciaConciliacion {
  /** false = la IA no está configurada o falló: quedan los candidatos. */
  disponible: boolean;
  gasto_id_sugerido: string | null;
  confianza: number;
  razon: string | null;
  /** Hechos citados por la IA («terminación 0577 == tarjeta del gasto»). */
  evidencias?: string[] | null;
  candidatos: GastoCandidato[];
  /** 2.ª y 3.ª opción de la IA. OJO: NO son fichas de gasto — el API manda
      `{gasto_id, confianza, razon}` y sus ids YA vienen en `candidatos`
      (los valida contra ellos). Aditivo. */
  alternativas?: Array<{ gasto_id: string; confianza: number; razon: string }> | null;
  /** Frase en español de por qué ningún candidato encaja (la redacta
      pyservices, NO es un código). Solo cuando no hay sugerido. Aditivo. */
  motivo_sin_match?: string | null;
}

/** Una propuesta del lote (`POST /v1/conciliacion/sugerir-lote`). */
export interface PropuestaConciliacion {
  movimiento_id: string;
  gasto_id_sugerido: string | null;
  confianza: number;
  razon: string | null;
  evidencias?: string[] | null;
  /** {gasto_id, confianza, razon} del API (no fichas): sus ids están en
      `candidatos`. */
  alternativas?: Array<{ gasto_id: string; confianza?: number; razon?: string }> | null;
  candidatos?: GastoCandidato[] | null;
  /** Fichas embebidas (aditivas): evitan una consulta por fila en el panel. */
  gasto?: GastoCandidato | null;
  movimiento?: {
    id?: string;
    fecha?: string | null;
    monto?: string | number | null;
    tipo?: string | null;
    descripcion?: string | null;
    referencia?: string | null;
    cuenta_bancaria_id?: string | null;
  } | null;
  motivo_sin_match?: string | null;
}

export interface SugerirLoteResponse {
  propuestas: PropuestaConciliacion[];
  /** Cuántos pendientes se revisaron y cuántos quedaron sin propuesta. */
  revisados?: number | null;
  sin_propuesta?: number | null;
  errores?: number | null;
  /** false = el asistente no está configurado (pyservices). */
  disponible?: boolean | null;
  nota?: string | null;
}

/**
 * SOBRE de cobro de GRUPO tal como lo expone conciliación (lista de
 * movimientos y candidatos). El banco concilia contra el sobre (lo que
 * depositó el cliente); las partes por avión nunca se ofrecen.
 */
export interface SobreConciliacion {
  tipo: "SOBRE_GRUPO";
  cobro_grupo_id: string;
  grupo_id: string;
  grupo_folio: number | null;
  grupo_nombre: string | null;
  /** BRUTO en la moneda del sobre. */
  monto: number;
  moneda: string;
  metodo: string;
  /** Alias de `metodo` (paridad con cobro_vuelo). */
  metodo_cobro: string;
  /** timestamptz: formatear en hora Cancún al mostrar. */
  fecha: string;
  /** Alias de `fecha`. */
  fecha_cobro: string;
  referencia: string | null;
  comision_banco_monto: number | null;
  /** Lo que depositó el banco (monto − comisión). */
  neto: number;
  /** Partes (aviones) en las que se partió el sobre. */
  aviones_n: number;
}

/** Cobro de VUELO candidato para conciliar un ABONO a mano
 *  (GET movimientos/:id/candidatos-cobro). Se manda `{cobro_id}` al PATCH. */
export interface CandidatoCobroVuelo {
  tipo: "COBRO_VUELO";
  /** = cobro_id. */
  id: string;
  cobro_id: string;
  vuelo_id: string;
  folio: number | null;
  /** ADITIVO (12-oct-2026): fecha del vuelo (timestamptz), para verla junto a la del cobro. */
  fecha_vuelo?: string | null;
  cliente: string | null;
  /** timestamptz: formatear en hora Cancún al mostrar. */
  fecha_cobro: string;
  /** BRUTO. */
  monto: number;
  moneda: string;
  metodo_cobro: string;
  referencia: string | null;
  comision_banco_monto: number | null;
  /** Lo que depositó el banco (monto − comisión). */
  neto: number;
  /** |neto − monto del abono| (0 = cuadra exacto). */
  dif_monto: number;
}

/** SOBRE de grupo candidato. Se manda `{cobro_grupo_id}` al PATCH. */
export interface CandidatoSobreGrupo extends SobreConciliacion {
  /** = cobro_grupo_id. */
  id: string;
  cliente: string | null;
  /** |neto − monto del abono| (0 = cuadra exacto). */
  dif_monto: number;
  /** ADITIVO (12-oct-2026): fecha del vuelo del grupo. */
  fecha_vuelo?: string | null;
}

export type CandidatoCobro = CandidatoCobroVuelo | CandidatoSobreGrupo;

/** Respuesta de GET /v1/conciliacion/movimientos/:id/candidatos-cobro. */
export interface CandidatosCobroResponse {
  movimiento: {
    id: string;
    fecha: string;
    monto: number;
    tipo: string;
    moneda: string | null;
    cobro_id: string | null;
    cobro_grupo_id: string | null;
    /** ADITIVOS (12-oct-2026, API 0.0.71): cuántos cobros paga ya y cuáles
        (para marcarlos al editar un lote). Ausentes = API previo. */
    cobros_n?: number | null;
    cobro_ids?: string[];
  };
  /** Ordenados por dif_monto asc y luego cercanía de fecha (tope 60). */
  candidatos: CandidatoCobro[];
  /** Cuántos cuadran exacto (dif_monto = 0). */
  exactos: number;
  /** INGRESOS registrados candidatos (24-sep-2026, ADITIVO): vivos, con
      cuenta, sin movimiento, misma moneda; `otra_cuenta` = registrado en una
      cuenta distinta a la del abono (no se liga hasta corregirlo). */
  ingresos?: CandidatoIngresoAbono[];
}

export interface ConciliacionResumenCuenta {
  cuenta_bancaria_id: string;
  alias: string | null;
  banco: string | null;
  moneda: string | null;
  total: number;
  conciliados: number;
  pendientes: number;
  monto_pendiente: number;
  /** ADITIVO (2-oct-2026, API 0.0.52): Σ `gastos_diferencia` de los cargos
      que pagan 2+ gastos (los centavos del lote; jamás se ajusta el gasto). */
  diferencia_lotes?: number | null;
}

export interface MovimientoListResponse {
  data: MovimientoBancario[];
  count: number;
  limit: number;
  offset: number;
}

export interface MovimientoParseado {
  fecha: string | null;
  descripcion: string | null;
  /** Positivo; en formato `paywise` es el NETO depositado. */
  monto: number;
  tipo: TipoMovimientoBancario;
  referencia: string | null;
  /** ADITIVOS (Paywise): solo el formato `paywise` los llena. */
  monto_bruto?: number | null;
  comision?: number | null;
  estatus?: string | null;
}

/**
 * Mapeo MANUAL de columnas para leer un archivo como Paywise cuando la
 * detección por encabezados no lo reconoce: nombres de columna tal como
 * vienen en el archivo (tolerante a mayúsculas/acentos). Exige fecha y
 * bruto o neto (POST /v1/conciliacion/parse `mapeo`).
 */
export interface MapeoColumnasPaywise {
  fecha: string;
  bruto?: string;
  comision?: string;
  neto?: string;
  referencia?: string;
  descripcion?: string;
  estatus?: string;
}

export interface ParsedStatement {
  movimientos: MovimientoParseado[];
  total: number;
  /** csv | excel | pdf | paywise */
  formato: string;
  notas: string;
  modelo: string | null;
  /** Encabezados del archivo tabular (para el mapeo manual). Aditivo. */
  columnas?: string[];
  /** Avisos de la lectura (pyservices; ya llegaban y nadie los declaraba):
      saldos que no cuadran, transferencias leídas SIN su concepto
      (13-oct-2026)… El diálogo de importación los pinta antes de importar. */
  advertencias?: string[];
}

// ===== Auditoría Paywise (GET /v1/conciliacion/paywise/auditoria) =====

export type CriterioCrucePaywise = "YA_CONCILIADO" | "NETO" | "BRUTO" | "REFERENCIA";

/** ABONO importado de una cuenta PASARELA (neto depositado + bruto/comisión). */
export interface PaywiseMovimiento {
  id: string;
  /** DATE YYYY-MM-DD. */
  fecha: string;
  /** NETO depositado. */
  monto: number;
  monto_bruto?: number | null;
  comision_monto?: number | null;
  referencia?: string | null;
  descripcion?: string | null;
  moneda?: string | null;
  cobro_id?: string | null;
  cobro_grupo_id?: string | null;
}

/** Cobro PAYWISE del sistema: cobro de vuelo o sobre de grupo. */
export interface PaywiseCobro {
  tipo: "COBRO_VUELO" | "SOBRE_GRUPO";
  id: string;
  /** ISO timestamptz (formatear en hora Cancún). */
  fecha_cobro: string;
  /** BRUTO que pagó el cliente. */
  monto: number;
  moneda: string;
  metodo_cobro?: string | null;
  comision_banco_monto?: number | null;
  referencia?: string | null;
  vuelo_id?: string | null;
  folio?: number | null;
  grupo_id?: string | null;
  grupo_folio?: number | null;
  cliente?: string | null;
}

export interface PaywiseCruce {
  movimiento: PaywiseMovimiento;
  cobro: PaywiseCobro;
  criterio: CriterioCrucePaywise;
  dif_dias: number;
  /** Neto que el sistema esperaba (bruto − comisión registrada). */
  neto_sistema: number;
  /** Comisión según el archivo (null si no la trae). */
  comision_paywise: number | null;
  comision_sistema: number;
  dif_comision: number | null;
  comision_distinta: boolean;
  dif_bruto: number | null;
  dif_neto: number;
}

export interface PaywiseAmbiguo {
  movimiento: PaywiseMovimiento;
  criterio: Exclude<CriterioCrucePaywise, "YA_CONCILIADO">;
  candidatos: PaywiseCobro[];
}

export interface PaywiseAuditoriaResumen {
  movimientos_paywise: number;
  cobros_sistema: number;
  coinciden: number;
  ya_conciliados: number;
  conciliables: number;
  comision_distinta: number;
  referencia_monto_distinto: number;
  solo_paywise: number;
  solo_sistema: number;
  ambiguos: number;
  movimientos_conciliados_fuera: number;
  cobros_conciliados_fuera: number;
  neto_paywise: number;
  neto_solo_paywise: number;
  bruto_solo_sistema: number;
  dif_comision_total: number;
  conciliados_ahora: number;
  errores: number;
}

export interface PaywiseAuditoria {
  periodo: { desde: string; hasta: string };
  dias: number;
  cuentas: { id: string; alias: string; moneda: string }[];
  resumen: PaywiseAuditoriaResumen;
  coinciden: PaywiseCruce[];
  comision_distinta: PaywiseCruce[];
  referencia_monto_distinto: PaywiseCruce[];
  solo_paywise: PaywiseMovimiento[];
  solo_sistema: PaywiseCobro[];
  ambiguos: PaywiseAmbiguo[];
  errores: { movimiento_id: string; cobro_id: string; tipo: string; error: string }[];
}

/** Cobro bancario sin abono importado (GET /v1/conciliacion/cobros-sin-banco). */
export interface CobroSinBanco extends PaywiseCobro {
  metodo_label: string;
  /** monto − comisión registrada. */
  neto: number;
  /** Cobro que salió de un ANTICIPO aún sin conciliar (24-sep-2026,
      ADITIVO): se concilia el anticipo (Ingresos → Por conciliar), nunca el
      cobro — el API rechaza ligarlo (409 COBRO_DE_ANTICIPO). */
  anticipo?: { ingreso_id: string; etiqueta: string } | null;
}

export interface CobrosSinBancoResponse {
  data: CobroSinBanco[];
  total: number;
  desde: string;
  hasta: string;
  por_moneda: { moneda: string; monto: number }[];
}

/** Estado de cuenta importado: el archivo original queda archivado para
 *  consultarlo/descargarlo después (GET /v1/conciliacion/estados-cuenta). */
export interface EstadoCuentaArchivo {
  id: string;
  cuenta_bancaria_id: string;
  filename: string;
  formato: string | null;
  movimientos_importados: number | null;
  created_at: string;
  cuenta?: { banco: string | null; alias: string | null; moneda: string | null } | null;
}

// ===== Concepto del SPEI y «Factura NNNN» (13-oct-2026, API 0.0.75) =====
//
// Todo es ADITIVO y opcional: un API ≤ 0.0.74 no manda nada de esto y la
// pantalla queda como antes. El NÚMERO de factura lo lee SOLO el API
// (`factura-concepto.util.ts`); el panel rotula con
// `lib/admin/conciliacion-factura-concepto.ts` y redacta la importación con
// `lib/admin/conciliacion-importacion.ts`.

export type TipoFacturaConcepto = "FACTURA" | "PREFACTURA";

export type EstadoLigadosFactura = "COINCIDE" | "PARCIAL" | "NO_COINCIDE" | "SIN_FOLIO";

/** Otro movimiento (cualquier cuenta, mismo tipo, ±120 días) que cita la MISMA factura. */
export interface RepeticionFacturaConcepto {
  movimiento_id: string;
  /** DATE `YYYY-MM-DD`. */
  fecha: string;
  /** |monto| en la moneda de SU cuenta. */
  monto: number;
  /** Alias de su cuenta. */
  cuenta: string | null;
  descripcion: string | null;
  conciliado: boolean;
}

/**
 * `factura_concepto` de una fila de `GET movimientos`: qué factura cita el
 * concepto del banco y si cuadra con los gastos ligados.
 *  - `ligados`: null en los ABONOS, en filas sin gasto y cuando el lote no se
 *    pudo leer; si no, COINCIDE / PARCIAL / NO_COINCIDE / SIN_FOLIO.
 *  - `repetida_en`: null = NO verificado (la lectura falló o llegó a 1,000
 *    filas: jamás «no se repite»); [] = no se repite.
 */
export interface FacturaConceptoMovimiento {
  tipo: TipoFacturaConcepto;
  /** Como se imprimieron: «7360», «A-123». */
  numeros: string[];
  /** «Factura 7360» · «Facturas 7359 · 7360» · «Prefactura 4409». */
  texto: string;
  /** Palabras junto a la clave («VIP»); null sin ellas. */
  pista: string | null;
  ligados: {
    estado: EstadoLigadosFactura;
    /** Números de los gastos ligados (≤5). */
    folios: string[];
    /** Números del concepto que ningún gasto ligado tiene. */
    faltan: string[];
  } | null;
  repetida_en: RepeticionFacturaConcepto[] | null;
}

/**
 * `factura_concepto` de `gastos-candidatos`: lo que dice el banco y los
 * gastos con esa factura que NO salen como candidatos (forma idéntica a
 * `excluidos`; null = no se pudo leer).
 */
export interface FacturaConceptoCandidatos {
  tipo: TipoFacturaConcepto;
  numeros: string[];
  texto: string;
  pista: string | null;
  otros_gastos: ExcluidosCandidatos[] | null;
}

/** Regla con la que el API completó el concepto de una fila ya importada. */
export type ReglaEnriquecimiento =
  | "UNICO"
  | "MISMO_TEXTO"
  | "INTERCAMBIABLES"
  | "REFERENCIA"
  | "ORDEN_ARCHIVO"
  | "FOLIO";

/** Por qué una fila ya importada NO recibió el concepto. */
export type MotivoSinEnriquecer = "GEMELOS" | "VINCULO_NO_BANCARIO" | "CAMBIO_CONCURRENTE" | "ERROR";

export interface EnriquecimientoOmitido {
  /** Un motivo nuevo del API se tolera (se pinta genérico). */
  motivo: MotivoSinEnriquecer | string;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: number;
  moneda: string | null;
  /** Las filas que se quedaron sin concepto (2 gemelos ⇒ 2 ids). */
  movimiento_ids: string[];
  /** Conceptos distintos que trae el archivo (≤5, ≤160 caracteres). */
  conceptos: string[];
  /** «Factura 7352» de cada concepto que cita una. */
  facturas: string[];
  /** Solo en ERROR (≤200). */
  detalle?: string;
}

/** Una fila a la que se le completó (o se le completaría) el concepto. */
export interface EnriquecimientoDetalle {
  movimiento_id: string;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: number;
  antes: string;
  despues: string;
  regla: ReglaEnriquecimiento | string;
}

/** Línea del archivo que «Solo completar conceptos» no encontró (NO se agregó). */
export interface NoEncontradoImport {
  orden_archivo: number;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: number;
  moneda: string | null;
  descripcion: string | null;
  referencia: string | null;
  /** «Factura 7360» si su concepto cita una. */
  factura: string | null;
}

/** Línea NUEVA con la misma fecha y monto que otra que ya estaba (posible duplicado). */
export interface NuevoMismoDia {
  orden_archivo: number;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: number;
  moneda: string | null;
  descripcion: string | null;
}

/** Línea nueva de la vista previa (la moneda va en la raíz). */
export interface NuevoVistaPrevia {
  orden_archivo: number;
  fecha: string;
  tipo: TipoMovimientoBancario;
  monto: number;
  descripcion: string | null;
  mismo_dia_y_monto: boolean;
}

/**
 * `POST /v1/conciliacion/importar/vista-previa` (API 0.0.75): simula la
 * importación SIN escribir nada.
 */
export interface VistaPreviaImportacion {
  total: number;
  /** Líneas que ya estaban importadas (no se duplican). */
  ya_estaban: number;
  nuevos: number;
  nuevos_mismo_dia_y_monto: number;
  /** A cuántas ya importadas se les completaría el concepto. */
  se_enriquecen: number;
  /** Σ de las filas que se quedarían sin concepto. */
  enriquecimiento_omitidos: number;
  /** Moneda de la cuenta. */
  moneda: string | null;
  /** ≤20. */
  omitidos: EnriquecimientoOmitido[];
  /** ≤50. */
  nuevos_detalle: NuevoVistaPrevia[];
  /** ≤50. */
  enriquecibles_detalle: EnriquecimientoDetalle[];
}

// ===== Compras en dólares contra el T.C. oficial del día (13-oct-2026, API 0.0.75) =====
//
// La regla es del API (`auto-cruce.util.ts`): el panel solo PINTA lo que
// manda (`lib/admin/conciliacion-tc.ts`, `lib/admin/pre-cierre-tc-usd.ts`).

export type NivelTcCruce = "CERCA" | "LEJOS" | "SIN_OFICIAL";

/** T.C. oficial del día del cargo (respaldo de hasta 7 días). */
export interface TcOficialDelDia {
  tc: number;
  /** El día REAL del dato (`YYYY-MM-DD`). */
  fecha_dato: string;
  /** Legible: «open.er-api», «BCE (frankfurter)», «Banxico FIX (histórico)»… */
  fuente: string;
}

/** COPIA 1:1 del `TcCruceUsd` del API (auto-cruce.util.ts). */
export interface TcCruceUsd {
  /** round6(|pesos del cargo| ÷ |dólares del gasto|). */
  tc_implicito: number;
  /** Cociente SIN redondear dentro de [15, 25] (el mismo criterio de la BD). */
  en_banda: boolean;
  tc_oficial: number | null;
  tc_oficial_fecha: string | null;
  tc_oficial_fuente: string | null;
  /** 1 decimal; −0 ⇒ 0. */
  desvio_pct: number | null;
  nivel: NivelTcCruce;
  /** La tolerancia de la regla (2). */
  tolerancia_pct: number;
  /** No en banda o nivel LEJOS. */
  fuera_de_lugar: boolean;
  /** «T.C. 17.06 · oficial 17.01 (+0.3 %)». */
  texto: string;
  /** El detalle exacto (T.C. de 6 decimales, oficial, fecha, fuente, tolerancia). */
  titulo: string;
  /** ADITIVO (revisión del lote 2, 14-oct-2026): la LECTURA del T.C. oficial
      falló (≠ «sin dato»); `nivel` sigue SIN_OFICIAL y `texto` lo dice («…
      no se pudo leer el T.C. oficial del día»). Ámbar y «Vincular de todos
      modos». */
  lectura_fallida?: true | null;
}

/** Item del pre-cierre `gastos_usd_tc_fuera_de_lugar` (= `LigaUsdTcFueraDeLugar` del API). */
export interface LigaUsdTcPreCierre {
  gasto_id: string;
  fecha_gasto: string;
  monto_usd: number;
  tc_gasto: number | null;
  categoria: string | null;
  descripcion_gasto: string;
  vuelo_id: string | null;
  vuelo_folio: number | null;
  movimiento_id: string;
  fecha_cargo: string;
  monto_cargo: number;
  cuenta_bancaria_id: string;
  cuenta: string | null;
  descripcion_cargo: string | null;
  tc_cruce: TcCruceUsd;
  /** El renglón completo, ya redactado por el API. */
  texto: string;
}

// ===== Conciliación AL REVÉS de un gasto (13-oct-2026, API 0.0.75) =====
//
// `GET /v1/conciliacion/gastos/:id` (ADMIN y FACTURACION): desde Gastos, el
// cargo del banco con el que se concilió un gasto, su cuenta, su estado de
// cuenta y su lote. Copia 1:1 del contrato del API. Se leen SIEMPRE por
// `lib/admin/gasto-banco.ts`: ningún número se recalcula en el panel. Los
// montos son `number`; las fechas DATE vienen `YYYY-MM-DD` y los timestamptz
// se pintan en hora Cancún. Nada existente cambia.

/** El estado del API (`estadoBancoGasto` de allá); el del panel es `EstadoBanco`. */
export type EstadoBancoApi = "CONCILIADO" | "PARCIAL" | "SIN_CONCILIAR" | "NO_APLICA";

export type AlertaConciliacionGasto =
  | "CONCILIADO_SIN_CARGOS"
  | "ESTADO_DESFASADO"
  | "TC_NO_REGISTRADO"
  | "LOTE_SIN_DETALLE";

export type MotivoSinArchivo = "IMPORTADO_SIN_ARCHIVO" | "CAPTURA_MANUAL";

/** La fila de `v_gasto_conciliacion` TAL CUAL (en un cruzado, suma 0 y monto_vinculado = monto). */
export interface VistaConciliacionGasto {
  n_partes: number;
  cruzado: boolean;
  suma: number;
  monto_vinculado: number;
  faltante: number;
  cubierto: boolean;
}

/** La cuenta del cargo: JAMÁS trae número de cuenta ni CLABE. */
export interface CuentaDeCargo {
  id: string;
  alias: string;
  banco: string;
  moneda: string;
  tipo: "BANCO" | "PASARELA" | string;
}

/** El estado de cuenta del que salió el cargo: JAMÁS trae `storage_path`. */
export interface EstadoCuentaDeCargo {
  id: string;
  filename: string;
  formato: string | null;
  /** timestamptz. */
  importado_at: string;
  importado_por: string | null;
  movimientos_importados: number;
}

/** Quién hizo la liga (solo partes creadas desde el 2-oct-2026 00:00 Cancún). */
export interface RegistroLiga {
  por: string | null;
  /** timestamptz. */
  at: string;
}

/** La línea «Vinculado a gasto en EFECTIVO …» de ESTE gasto (invariante 48 del API). */
export interface JustificacionVinculoCargo {
  linea: string;
  medio: string;
  razon: string;
  firmante: string;
  /** «06-oct-2026» o null. */
  fecha: string | null;
}

/** El lote que paga el cargo (solo con 2+ gastos). */
export interface LoteDeCargo {
  gastos_n: number;
  /** La forma de GET movimientos (incluye ESTE gasto); null = no se pudo leer. */
  gastos: MovimientoGasto[] | null;
  gastos_suma: number | null;
  /** |cargo| − Σ partes; null con una parte cruzada. Jamás ajusta un gasto. */
  gastos_diferencia: number | null;
}

/** Un cargo del banco ligado al gasto (uno por parte de la puente). */
export interface CargoDeGasto {
  movimiento_id: string;
  /** DATE. */
  fecha: string;
  tipo: "CARGO";
  /** |monto| en la moneda de SU cuenta. */
  monto: number;
  moneda: string | null;
  descripcion: string | null;
  referencia: string | null;
  conciliado: boolean;
  origen: "IMPORTADO" | "MANUAL" | string;
  /** timestamptz: cuándo se importó o capturó el cargo. */
  creado_at: string | null;
  creado_por: string | null;
  orden_archivo: number | null;
  cuenta: CuentaDeCargo | null;
  estado_cuenta: EstadoCuentaDeCargo | null;
  sin_archivo: MotivoSinArchivo | null;
  parte: {
    /** Lo que ESTE cargo aporta a ESTE gasto. */
    monto_parte: number;
    moneda: string | null;
    /** La moneda de la parte es distinta de la del gasto (USD pagado en pesos). */
    cruzada: boolean;
    registro: RegistroLiga | null;
  };
  lote: LoteDeCargo | null;
  justificacion: JustificacionVinculoCargo | null;
  /** Las notas del cargo SIN las líneas del vínculo. */
  notas_oficina: string | null;
}

export interface UltimoMovimientoCuenta {
  cuenta: CuentaDeCargo;
  /** DATE del último movimiento importado (null = sin movimientos). */
  ultima_fecha: string | null;
}

/** Respuesta de `GET /v1/conciliacion/gastos/:id`. */
export interface ConciliacionDeGasto {
  gasto: {
    id: string;
    fecha_gasto: string | null;
    categoria: string;
    monto: number;
    moneda: string;
    medio_pago: string | null;
    tarjeta_terminacion: string | null;
    /** El T.C. GUARDADO en el gasto (nunca monto_parte ÷ monto). */
    tc_gasto: number | null;
    conciliado: boolean;
    vuelo_id: string | null;
    vuelo_folio: number | null;
    proveedor: string | null;
    lugar: string | null;
    notas_primera_linea: string | null;
    folio_comprobante: string | null;
  };
  estado: EstadoBancoApi;
  fuente: "PUENTE" | "ESPEJO";
  vista: VistaConciliacionGasto | null;
  cargos: CargoDeGasto[];
  alertas: AlertaConciliacionGasto[];
  /** Solo SIN_CONCILIAR o PARCIAL (null si falló o no aplica). */
  ultimos_movimientos: UltimoMovimientoCuenta[] | null;
}

/**
 * Respuesta de `PATCH /v1/expenses/:id/fecha` (API 0.0.76, 14-oct-2026,
 * invariante 74): la fecha del PAGO corregida desde «Vincular gasto», SIN
 * auto-cruce. `cambio: false` = el gasto ya tenía esa fecha (no escribió ni
 * movió `updated_at`); `aviso` = la línea de «mes terminado» cuando hubo
 * confirmación; `fecha_hora_carga` = la hora de la carga de combustible tal
 * como quedó (el API la mueve al día nuevo conservando su hora de pared).
 */
export interface CambioFechaGasto {
  id: string;
  fecha_gasto: string;
  fecha_anterior: string;
  cambio: boolean;
  cambia_de_mes: boolean;
  fecha_hora_carga: string | null;
  updated_at: string;
  aviso: string | null;
}

/** `details` del 409 FECHA_GASTO_CONFIRMAR (el texto lo arma el API). */
export interface ConfirmarCambioFechaDetalle {
  cambia_de_mes: boolean;
  mes_antes: string;
  mes_despues: string;
  etiqueta_mes_despues: string;
  meses_terminados: string[];
}
