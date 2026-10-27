import type { PorPagarCajaItem } from "@/lib/admin/gasto-por-pagar";
import type { UbicacionBalanceGasto } from "@/types/conciliacion";

export type TipoMovimientoCaja = "REPOSICION" | "REINTEGRO" | "AJUSTE";
export type MonedaCaja = "MXN" | "USD";

export interface CajaUsuario {
  nombre: string;
  email: string;
  rol: string;
}

export interface CajaFondo {
  /** Caja al revés: `saldo` = lo POR REPONER (sube al gastar, 0 al reponer). */
  es_acumulada?: boolean;
  id: string;
  usuario_id: string;
  moneda: MonedaCaja;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  usuario?: CajaUsuario | null;
  saldo: number;
  /** Monto nominal del fondo (a cuánto se repone). Null = sin fijar. */
  monto_fondo?: number | string | null;
  /** Última REPOSICIÓN registrada; null si nunca ha habido. */
  ultima_reposicion?: { fecha: string; monto: number } | null;
  /** Caja MADRE que fondea a esta (espejos automáticos). Null = sin vínculo. */
  fondo_origen_id?: string | null;
}

export interface CajaMovimiento {
  id: string;
  fondo_id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  moneda: MonedaCaja;
  fecha: string;
  autorizado_por: string | null;
  referencia: string | null;
  notas: string | null;
  registrado_por: string;
  created_at: string;
  autorizado?: { nombre: string } | null;
  registrado?: { nombre: string } | null;
  /** Espejo de un fondeo automático: sigue a su origen, no se edita directo. */
  espejo_de_id?: string | null;
}

export interface HistorialEntry {
  id: string;
  fecha: string;
  origen: "caja" | "gasto";
  tipo: string;
  monto: number;
  descripcion: string | null;
  saldo: number;
  /**
   * Lo POR REPONER tras esta entrada (≥ 0), fuente única del API
   * (`porReponerCaja`); ADITIVO desde el 5-sep-2026.
   */
  por_reponer?: number | null;
  /** Vuelo del gasto en efectivo (null en movimientos de caja). */
  vuelo_id?: string | null;
  vuelo_folio?: number | null;
  /**
   * ¿En qué balance, mes y hoja vive el gasto? (15-oct-2026, ADITIVO; solo en
   * las entradas `origen: "gasto"`). Lo decide SOLO el API
   * (`ubicacionBalanceDeGasto`, invariante 72): la misma forma que
   * `GET /v1/conciliacion/movimientos`. Sin la llave (API previo o lectura
   * caída) ⇒ sin línea ni enlaces; `null` ⇒ no vive en ninguna celda con
   * vínculo (sin enlaces).
   */
  balance?: UbicacionBalanceGasto | null;
  /**
   * ¿A QUIÉN se repuso? (15-oct-2026, ADITIVO; invariante 83 del API). Solo
   * en las entradas `origen: "caja"` cuyo movimiento es un ESPEJO de una
   * reposición en una caja hija: la caja de esa reposición y su dueño, con
   * el nombre VIVO (`usuario.nombre`). `null` = la reposición o su caja no
   * volvieron en la lectura. Sin la llave (API previo, lectura caída o
   * entrada que no es espejo) ⇒ el renglón dice lo de siempre (o la
   * referencia «Fondeo a X»; ver `repuestoADeEntrada`).
   */
  repuesto_a?: RepuestoA | null;
}

/** La caja hija (y su dueño) de la reposición que originó un espejo. */
export interface RepuestoA {
  fondo_id: string;
  usuario_id: string;
  nombre: string | null;
}

/**
 * Una caja que ESTA caja fondea (15-oct-2026, invariante 83 del API): las
 * hijas ACTIVAS con `fondo_origen_id` = este fondo, ordenadas por nombre.
 * `por_reponer` (≥ 0) es la última fila del libro de esa caja: la MISMA cifra
 * que su tarjeta «Por reponer» y que su Excel de lo pendiente. El panel no la
 * recalcula.
 */
export interface CajaFondeada {
  fondo_id: string;
  usuario_id: string;
  nombre: string | null;
  moneda: MonedaCaja;
  activo: boolean;
  por_reponer: number;
  ultima_reposicion: { fecha: string; monto: number } | null;
  /**
   * Fondo consolidado de la caja madre (27-oct-2026, ADITIVOS del API
   * 0.0.109; ausentes = API previo): fondo asignado, si es acumulada, el
   * efectivo que conserva (saldo crudo de su libro) y sus gastos pendientes.
   * Se pintan con `lib/admin/caja-chica-madre.ts`; el panel no suma nada.
   */
  monto_fondo?: number | null;
  es_acumulada?: boolean;
  saldo_libro?: number;
  gastos_pendientes?: ConteoMontoCaja;
}

/** «N movimientos por $X» (X positivo), tal como lo manda el API. */
export interface ConteoMontoCaja {
  n: number;
  total: number;
}

/**
 * FONDO CONSOLIDADO de una caja MADRE (27-oct-2026, API 0.0.109, ADITIVO):
 * lo que la oficina pidió ver de un vistazo — fondo total, lo asignado a los
 * colaboradores, lo que debe estar en la caja madre, lo que salió desde la
 * última reposición (por solicitar) y si el libro cuadra con el fondo. TODO
 * lo calcula el API (`resumenCajaMadre`) sumando libros que ya existen; aquí
 * solo se formatea.
 */
export interface ResumenCajaMadre {
  fondo_total: number | null;
  cajas: number;
  asignado_colaboradores: number;
  fondo_propio: number | null;
  efectivo_colaboradores: number;
  pendiente_colaboradores: number;
  gastos_pendientes_colaboradores: ConteoMontoCaja;
  gastos_pendientes: ConteoMontoCaja;
  entregas_pendientes: ConteoMontoCaja;
  otros_pendientes: number;
  por_solicitar: number;
  efectivo_libro: number;
  efectivo_esperado: number | null;
  diferencia: number | null;
}

export interface CajaFondoListResponse {
  data: CajaFondo[];
  count: number;
  limit: number;
  offset: number;
}

export interface CajaFondoDetail extends CajaFondo {
  movimientos: CajaMovimiento[];
  historial: HistorialEntry[];
  /**
   * Cajas que ESTA caja fondea (15-oct-2026, ADITIVO; última llave del
   * detalle). `[]` = no fondea a nadie; `null` = falló una lectura; ausente =
   * API previo. Con `null`/ausente el panel NO ofrece el selector ni dice
   * «no fondea» (ver `cajasParaReponer`).
   */
  cajas_fondeadas?: CajaFondeada[] | null;
  /**
   * Fondo consolidado de la caja MADRE (27-oct-2026, API 0.0.109, ADITIVO):
   * solo cuando fondea a alguien; `null` = la lectura de las hijas cayó;
   * ausente = API previo o caja que no fondea. Ver `resumenMadreDeFondo`.
   */
  resumen_madre?: ResumenCajaMadre | null;
  /**
   * Gastos EFECTIVO «por pagar» vigentes (19-oct-2026, API 0.0.95, ADITIVO):
   * NO son del libro (no tocan saldo ni lo por reponer) hasta marcarlos
   * pagados. Ausente = API previo. Leerlo vía `porPagarDeFondo`.
   */
  por_pagar?: PorPagarCajaItem[] | null;
  /** Σ de `por_pagar` en la moneda del fondo (la calcula el API). */
  por_pagar_total?: number | string | null;
}
