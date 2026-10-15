/**
 * CONCILIACIÓN AL REVÉS DE UNA ENTRADA DE DINERO (15-oct-2026, API 0.0.78,
 * invariante 78 del API) — respuesta de `GET /v1/conciliacion/cobros/:id` y
 * `GET /v1/conciliacion/ingresos/:id`.
 *
 * COPIA 1:1 de `vuelatour-api/src/modules/conciliacion/abonos-de-entrada.util.ts`
 * (si cambia allá, cambia aquí en el MISMO lote). Archivo propio: el 0.0.77 y
 * el 0.0.78 agregan al FINAL de `types/conciliacion.ts`. Se lee SIEMPRE por
 * `lib/admin/entrada-banco.ts`: ningún número se recalcula en el panel. Los
 * montos son `number`; las fechas DATE vienen `YYYY-MM-DD` (días Cancún) y
 * los timestamptz se pintan en hora Cancún. Jamás viajan `numero_cuenta`,
 * `clabe`, `storage_path`, `foto_voucher_url`, `archivo_path` ni notas crudas.
 */
import type {
  CuentaDeCargo,
  EstadoCuentaDeCargo,
  MotivoSinArchivo,
  MovimientoCobroParte,
  RegistroLiga,
  SobreConciliacion,
  UltimoMovimientoCuenta,
} from "@/types/conciliacion";

/** = `EntradaDinero.origen` de la lista de Ingresos. */
export type OrigenEntrada = "COBRO_VUELO" | "INGRESO";

/** Los 5 valores de la lista (`estadoBancoCobro` del API): la hoja dice lo mismo. */
export type EstadoBancoEntrada = "CONCILIADO" | "PARCIAL" | "VIA_ANTICIPO" | "SIN_CONCILIAR" | "NO_BANCARIO";

/**
 * DIRECTO = puente (o espejo `cobro_id`); SOBRE = `movimiento_bancario.cobro_grupo_id`;
 * ANTICIPO = el abono del anticipo (`ingreso_id`); INGRESO = `movimiento_bancario.ingreso_id` (1 ↔ 1).
 */
export type ViaEntrada = "DIRECTO" | "SOBRE" | "ANTICIPO" | "INGRESO";

/** PUENTE = `movimiento_bancario_cobro`; ESPEJO = sin 20261012000002; COLUMNA = liga 1 ↔ 1 por diseño. */
export type FuenteEntrada = "PUENTE" | "ESPEJO" | "COLUMNA";

/** Por qué una liga no dice quién la hizo (el panel jamás inventa un nombre). */
export type SinRegistroLiga = "ANTERIOR_AL_CORTE" | "NO_SE_GUARDA" | "SIN_BITACORA" | "NO_LEIDO";

/**
 * Avisos de la hoja (solo hechos guardados). Sin TC_NO_REGISTRADO: un cobro en
 * USD jamás guarda T.C. (97/97 en prod) y el de uno en MXN es el de VENTA.
 */
export type AlertaConciliacionEntrada = "CONCILIADO_SIN_ABONOS" | "ABONO_CON_SOBRANTE" | "LOTE_SIN_DETALLE";

export interface EntradaDeConciliacion {
  origen: OrigenEntrada;
  /** cobro_id | ingreso_id. */
  id: string;
  /** 'Vuelo #332' | 'ING-3' (mismas reglas que la lista). */
  etiqueta: string;
  /** 'COBRO_VUELO' | CategoriaIngreso. */
  categoria: string;
  /** 'Cobro de vuelo' | etiqueta de la categoría del ingreso. */
  categoria_etiqueta: string;
  /** YYYY-MM-DD Cancún: día de `fecha_cobro` | `ingreso.fecha`. */
  dia: string;
  /** Bruto; reembolso negativo. */
  monto: number;
  /** > 0 o null (cobro: comision_banco_monto; ingreso: comision_monto). */
  comision: number | null;
  /** Cobro: LA fórmula del neto (`netoDeCobro`); ingreso: `netoIngreso`. */
  neto: number;
  moneda: "MXN" | "USD";
  /**
   * Cobro MXN: su T.C. de VENTA guardado; cobro USD: null SIEMPRE. Informativo:
   * JAMÁS se usa ni se rotula como el T.C. de un cruce (ver `liga.tc_implicito`).
   */
  tc_usd_mxn: number | null;
  metodo: string;
  metodo_etiqueta: string;
  /** Tal cual la lista (cobro: cliente del vuelo; ingreso: cliente ?? pagador). */
  cliente_nombre: string | null;
  /** Cobro: referencia ?? 1.ª línea de notas (regla de la lista); ingreso: descripción. */
  concepto: string | null;
  vuelo_id: string | null;
  vuelo_folio: number | null;
  /** Solo INGRESO (su `cuenta_bancaria_id`); null = efectivo / caja. */
  cuenta: CuentaDeCargo | null;
  /** Solo COBRO: el texto CAPTURADO («HSBC Dólares»), NO es FK. */
  cuenta_destino: string | null;
  registrado_por_nombre: string | null;
  /** `created_at` del cobro / del ingreso («se registró después de importar»). */
  registrado_at: string | null;
  /** monto < 0. */
  es_reembolso: boolean;
  /** Solo INGRESO (`deleted_at`). */
  dado_de_baja: boolean;
}

export interface LigaDeAbono {
  via: ViaEntrada;
  /**
   * DIRECTO: lo que ESTE abono aporta a ESTE cobro (`monto_parte` de la puente;
   * en ESPEJO, |abono|). SOBRE / ANTICIPO / INGRESO: null (el abono respalda el TODO).
   */
  monto_parte: number | null;
  /** La de la cuenta del abono. */
  moneda: string | null;
  /** DIRECTO: moneda de la cuenta ≠ moneda del cobro (hoy 0 casos). */
  cruzada: boolean;
  /** Solo cruzada: `tcImplicitoCobro` del 0.0.78 (round6). null sin cruce. Jamás `entrada.tc_usd_mxn`. */
  tc_implicito: number | null;
  /** Solo INGRESO: `montoCuadraIngreso`, la MISMA regla con la que se ligó. */
  cuadre: { por: "NETO" | "BRUTO" | null; diferencia: number; tolerancia: number } | null;
  registro: RegistroLiga | null;
  /** null también en ESPEJO (no se dice nada, como en gastos). */
  sin_registro: SinRegistroLiga | null;
}

/** Solo vía DIRECTO con `cobros_n` ≥ 2. */
export interface LoteDeAbono {
  cobros_n: number;
  /**
   * `cobros[]` de GET movimientos (`anotarCobrosDeAbonos`) TAL CUAL, con los
   * aditivos del 0.0.78 (`cobro_estado`, `cobro_neto`, `cobro_faltante`,
   * `cobro_abonos_n`); INCLUYE este cobro. null = no se pudo leer (alerta
   * LOTE_SIN_DETALLE). El API lo tipa como `Record<string, unknown>[]`: es la
   * forma de `MovimientoCobroParte` (la misma que pinta la bandeja).
   */
  cobros: MovimientoCobroParte[] | null;
  cobros_suma: number | null;
  /** |abono| − Σ partes; jamás ajusta un cobro. */
  cobros_diferencia: number | null;
}

/** Un abono del banco de la entrada (base COMPARTIDA con el cargo de un gasto: `aMovimientoDetalle`). */
export interface AbonoDeEntrada {
  movimiento_id: string;
  /** DATE del banco. */
  fecha: string;
  /** 'ABONO'. */
  tipo: string;
  /** |monto| en la moneda de SU cuenta (pasarela = neto depositado). */
  monto: number;
  moneda: string | null;
  descripcion: string | null;
  referencia: string | null;
  conciliado: boolean;
  /** 'IMPORTADO' | 'MANUAL'. */
  origen: string | null;
  /** timestamptz: cuándo se importó o capturó el abono. */
  creado_at: string | null;
  /** Quien importó o capturó el abono. */
  creado_por: string | null;
  orden_archivo: number | null;
  /** JAMÁS trae número de cuenta ni CLABE. */
  cuenta: CuentaDeCargo | null;
  /** JAMÁS trae `storage_path`. */
  estado_cuenta: EstadoCuentaDeCargo | null;
  sin_archivo: MotivoSinArchivo | null;
  /** Solo si la importación de la pasarela lo guardó (hoy 0 filas). */
  monto_bruto: number | null;
  /** `comisionPaywise(mov)` (hoy null en todo prod). */
  comision_pasarela: number | null;
  liga: LigaDeAbono;
  lote: LoteDeAbono | null;
  /** Notas del abono SIN las líneas canónicas (vínculo y «Omitido de la conciliación»). */
  notas_oficina: string | null;
}

/** Cobertura del cobro del 0.0.78 TAL CUAL (vía directa). */
export interface CoberturaDeCobro {
  neto: number;
  /** Σ partes (cruzado ⇒ neto). */
  monto_vinculado: number;
  /** max(neto − Σ, 0). */
  faltante: number;
  /** max(Σ − neto, 0). */
  sobrante: number;
  /** Σ ≥ neto − tolerancia. */
  cubierto: boolean;
  abonos_n: number;
  cruzado: boolean;
  /** `TOLERANCIA_COBRO_BANCO` (1.00): el panel jamás la escribe a mano. */
  tolerancia: number;
}

/** El cobro salió de un anticipo (conciliado o no). */
export interface AnticipoDeEntrada {
  ingreso_id: string;
  /** 'ING-12'. */
  etiqueta: string;
  monto: number;
  moneda: "MXN" | "USD";
  dia: string;
  cuenta_bancaria_id: string | null;
  /** El anticipo tiene su abono ligado. */
  conciliado: boolean;
}

/** Un cobro «del mismo día» (lo que ya ve quien concilia: id, vuelo, folio, montos). */
export interface CobroMismoDia {
  cobro_id: string;
  vuelo_id: string | null;
  folio: number | null;
  monto: number;
  neto: number;
}

/**
 * Otros cobros SIN conciliar del MISMO cliente, MISMO día Cancún y MISMA
 * moneda: bancarios, positivos, sin liga, sin sobre ni anticipo. Solo cobro
 * SIN_CONCILIAR. Best-effort.
 */
export interface MismoDiaCliente {
  cliente: string | null;
  /** = entrada.dia. */
  dia: string;
  moneda: "MXN" | "USD";
  /** ≤ 10, sin este; por folio. */
  cobros: CobroMismoDia[];
  /** Cuántos OTROS hay (puede ser > cobros.length). */
  n: number;
  /** Σ neto de TODOS (este incluido) con LA fórmula del neto. El panel jamás suma. */
  suma_netos: number;
}

/**
 * El cobro se registró cuando ya estaban importados abonos PENDIENTES de su
 * ventana de cruce: el cruce automático (solo al importar; los cobros no
 * tienen cruce «al revés») no volvió a correr. Solo cobro SIN_CONCILIAR.
 */
export interface CruceNoCorrio {
  /** Abonos pendientes de su ventana importados antes de registrar el cobro (≥ 1). */
  abonos_previos: number;
  /** Día del cobro − MATCH_DAYS (PAYWISE: − PAYWISE_VENTANA_DIAS). */
  desde: string;
  /** Día del cobro + MATCH_DAYS (PAYWISE: + PAYWISE_VENTANA_DIAS). */
  hasta: string;
}

/** Respuesta de `GET /v1/conciliacion/cobros/:id` y `/ingresos/:id`. */
export interface ConciliacionDeEntrada {
  entrada: EntradaDeConciliacion;
  estado: EstadoBancoEntrada;
  /** null = sin liga. */
  via: ViaEntrada | null;
  /** Cobro: COLUMNA si su liga es de sobre/anticipo; si no, PUENTE | ESPEJO. Ingreso: COLUMNA. */
  fuente: FuenteEntrada;
  /** Solo cobros positivos sin sobre ni anticipo y con estado ≠ NO_BANCARIO. */
  cobertura: CoberturaDeCobro | null;
  /** Por fecha y luego movimiento_id; [] sin liga. */
  abonos: AbonoDeEntrada[];
  /** El cobro es parte de un sobre (ligado o no): `normalizarSobre` + aviones_n. */
  sobre: SobreConciliacion | null;
  /** El cobro salió de un anticipo (conciliado o no). */
  anticipo: AnticipoDeEntrada | null;
  alertas: AlertaConciliacionEntrada[];
  /** Solo SIN_CONCILIAR o PARCIAL; cuentas ACTIVAS con `primera_fecha`. null = no aplica o la lectura falló. */
  ultimos_movimientos: UltimoMovimientoCuenta[] | null;
  /** Solo cobro SIN_CONCILIAR; null = no hay otros o la lectura falló. */
  mismo_dia_cliente: MismoDiaCliente | null;
  /** Solo cobro SIN_CONCILIAR; null = 0 abonos previos o la lectura falló. */
  cruce_no_corrio: CruceNoCorrio | null;
  /**
   * La sonda del 0.0.78 en modo ESTRICTO (`cobrosParcialesConfirmados`: «sí»
   * solo con la migración confirmada) Y el cobro NO es «de un solo abono»
   * (comisión > 0, PAYWISE, parte de PASARELA o cruzada). Ingreso, sobre,
   * anticipo o reembolso ⇒ false; sin la migración o con una respuesta dudosa
   * de la sonda ⇒ false.
   */
  varios_abonos_por_cobro: boolean;
}
