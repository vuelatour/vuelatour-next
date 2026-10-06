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
