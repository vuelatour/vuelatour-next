/**
 * SELECCIÓN DE MOVIMIENTOS en Conciliación (14-oct-2026, API 0.0.77,
 * invariantes 75 y 76 del API). Pedido textual de la oficina:
 * «Necesitamos una opción de pendientes de conciliar venga una opción de
 * Omitir la conciliación.» y «Necesitamos poder seleccionar varias filas de
 * conciliaciones pendientes para todo eso ponerlas a un solo gasto…».
 *
 * PURO (sin React ni red; prueba `__tests__/conciliacion-seleccion.test.ts`):
 * qué fila lleva casilla (`esSeleccionable`, predicado ÚNICO que comparten la
 * casilla, «Seleccionar los N…» y la poda), el tope por lote, el resumen por
 * tipo y moneda (EN CENTAVOS, nunca suma monedas: es solo guía visual; la
 * suma que decide la calcula el API), qué acción de la barra aplica y por qué
 * no, y TODOS los textos de la selección.
 *
 * La selección vive en la vista «lista» (pestañas «Todos» y «Pendientes»:
 * pendientes LIBRES) o «omitidos» (pestaña «Omitidos»). Nunca en
 * «Conciliados», «Gastos sin banco», «Cobros sin banco» ni Paywise.
 */

import { fmtDateOnly } from "@/lib/datetime";
import type { MovimientoBancario } from "@/types/conciliacion";
import { numeroCobrosDe } from "./conciliacion-cobros-lote";
import { tieneGastoLigado } from "./conciliacion-lote";
import { fmtMontoConciliacion, numeroDe } from "./conciliacion-parcial";
import { esConciliadoPorReverso } from "./conciliacion-reverso";

/** Dónde se selecciona: pendientes libres o la pestaña «Omitidos». */
export type VistaSeleccion = "lista" | "omitidos";

/** Tope por lote = `OMITIR_MAX` del API (omitir y deshacer; prueba de paridad). */
export const TOPE_SELECCION = 200;
/** Varios cargos → un gasto: 2..50 (= `CARGOS_A_GASTO_MIN/MAX` del API). */
export const MIN_CARGOS_A_GASTO = 2;
export const MAX_CARGOS_A_GASTO = 50;

/** La vista de selección de cada pestaña de la página (null = sin casillas). */
export function vistaSeleccionDeFiltro(filtro: string | null | undefined): VistaSeleccion | null {
  if (filtro === "todos" || filtro === "pendientes") return "lista";
  if (filtro === "omitidos") return "omitidos";
  return null;
}

/**
 * Predicado ÚNICO de la selección. «lista» ⇒ PENDIENTE y LIBRE: sin gasto
 * (uno o varios), cobro, sobre, lote de cobros, ingreso, clasificación ni par
 * de devolución. «omitidos» ⇒ trae su omisión (`omision != null`, el mismo
 * criterio de `esOmitido`: aquí en línea para no importar en círculo).
 */
export function esSeleccionable(m: MovimientoBancario, vista: VistaSeleccion): boolean {
  if (vista === "omitidos") return m.omision != null;
  return (
    m.conciliado !== true &&
    !tieneGastoLigado(m) &&
    m.cobro_id == null &&
    m.cobro_grupo_id == null &&
    numeroCobrosDe(m) === 0 &&
    m.ingreso_id == null &&
    m.clasificacion_id == null &&
    !esConciliadoPorReverso(m)
  );
}

/** «Se pueden seleccionar hasta 200 movimientos por lote.» */
export const TEXTO_TOPE_SELECCION = `Se pueden seleccionar hasta ${TOPE_SELECCION} movimientos por lote.`;

/**
 * Marca o desmarca UNA fila. Al pasar el tope NO marca y lo dice. `sel` debe
 * ser la selección VIGENTE (así la poda de lo que dejó de calificar se
 * consolida en la siguiente interacción).
 */
export function alternarSeleccion(
  sel: ReadonlySet<string>,
  id: string,
  tope: number = TOPE_SELECCION,
): { sel: Set<string>; aviso: string | null } {
  const nueva = new Set(sel);
  if (nueva.has(id)) {
    nueva.delete(id);
    return { sel: nueva, aviso: null };
  }
  if (nueva.size >= tope) return { sel: nueva, aviso: TEXTO_TOPE_SELECCION };
  nueva.add(id);
  return { sel: nueva, aviso: null };
}

/**
 * «Seleccionar los N…»: REEMPLAZA la selección por las filas que deja la
 * búsqueda (todas las páginas, en su orden: fecha desc) ∩ seleccionables,
 * cortando en el tope (las más recientes) y diciéndolo.
 */
export function seleccionarTodas(
  filas: readonly MovimientoBancario[],
  vista: VistaSeleccion,
  tope: number = TOPE_SELECCION,
): { sel: Set<string>; aviso: string | null } {
  const candidatas = filas.filter((m) => esSeleccionable(m, vista));
  const sel = new Set(candidatas.slice(0, tope).map((m) => m.id));
  return { sel, aviso: candidatas.length > tope ? TEXTO_TOPE_SELECCION : null };
}

/**
 * La selección que SIGUE valiendo con las filas de hoy (derivada en RENDER,
 * sin efectos): las marcadas que siguen en la lista y siguen calificando, en
 * el orden de la lista; `retirados` = cuántas marcadas ya no (otra persona la
 * concilió, un refresh la sacó de la pestaña…).
 */
export function seleccionVigente(
  filas: readonly MovimientoBancario[],
  sel: ReadonlySet<string>,
  vista: VistaSeleccion,
): { vigentes: MovimientoBancario[]; retirados: number } {
  if (sel.size === 0) return { vigentes: [], retirados: 0 };
  const vigentes = filas.filter((m) => sel.has(m.id) && esSeleccionable(m, vista));
  return { vigentes, retirados: Math.max(0, sel.size - vigentes.length) };
}

// ───────────────────────────── Resumen ─────────────────────────────

export type TipoResumen = "CARGO" | "ABONO";

/** Un renglón del resumen: tipo + moneda de la CUENTA (null = no se pudo leer). */
export interface GrupoResumenSeleccion {
  tipo: TipoResumen;
  moneda: string | null;
  n: number;
  /** Σ |monto| en CENTAVOS (enteros: sin 0.30000000000000004). */
  centavos: number;
}

export interface ResumenSeleccion {
  n: number;
  cargos: number;
  abonos: number;
  /** MXN primero, luego las demás monedas (A–Z) y al final la desconocida; cargos antes que abonos. */
  grupos: GrupoResumenSeleccion[];
  /** Monedas DISTINTAS de las cuentas de los cargos (sin la desconocida), MXN primero. */
  monedasCargos: string[];
  /** Cargos cuya cuenta no trajo moneda (no cargaron las cuentas). */
  cargosSinMoneda: number;
}

/** Centavos de |monto| (el monto del banco viene como texto). */
export function centavosDe(monto: unknown): number {
  return Math.round(Math.abs(numeroDe(monto)) * 100);
}

function ordenMoneda(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === "MXN") return -1;
  if (b === "MXN") return 1;
  return a < b ? -1 : 1;
}

/** Moneda de la cuenta del movimiento (null si no se pudo leer). */
export function monedaDeMovimiento(
  m: Pick<MovimientoBancario, "cuenta_bancaria_id">,
  monedaPorCuenta: Readonly<Record<string, string | null | undefined>> | null | undefined,
): string | null {
  const v = monedaPorCuenta?.[m.cuenta_bancaria_id];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Totales por tipo y moneda, en centavos (nunca mezcla monedas). */
export function resumenSeleccion(
  movs: readonly MovimientoBancario[],
  monedaPorCuenta: Readonly<Record<string, string | null | undefined>> | null | undefined,
): ResumenSeleccion {
  const grupos = new Map<string, GrupoResumenSeleccion>();
  let cargos = 0;
  let abonos = 0;
  let cargosSinMoneda = 0;
  const monedasCargos = new Set<string>();
  for (const m of movs) {
    const tipo: TipoResumen = m.tipo === "ABONO" ? "ABONO" : "CARGO";
    const moneda = monedaDeMovimiento(m, monedaPorCuenta);
    if (tipo === "CARGO") {
      cargos += 1;
      if (moneda) monedasCargos.add(moneda);
      else cargosSinMoneda += 1;
    } else {
      abonos += 1;
    }
    const clave = `${tipo}|${moneda ?? ""}`;
    const g = grupos.get(clave) ?? { tipo, moneda, n: 0, centavos: 0 };
    g.n += 1;
    g.centavos += centavosDe(m.monto);
    grupos.set(clave, g);
  }
  return {
    n: movs.length,
    cargos,
    abonos,
    grupos: [...grupos.values()].sort(
      (a, b) => ordenMoneda(a.moneda, b.moneda) || (a.tipo === b.tipo ? 0 : a.tipo === "CARGO" ? -1 : 1),
    ),
    monedasCargos: [...monedasCargos].sort(ordenMoneda),
    cargosSinMoneda,
  };
}

/** «$56.84 MXN» · «$19.72 USD» · «$1.12 (moneda desconocida)». */
export function montoGrupoResumen(centavos: number, moneda: string | null): string {
  const texto = fmtMontoConciliacion(centavos / 100);
  return moneda ? `${texto} ${moneda}` : `${texto} (moneda desconocida)`;
}

/** «14 cargos $56.84 MXN · 1 abono $825.13 MXN» (lo que va después del conteo). */
export function textoGruposResumen(r: ResumenSeleccion): string {
  return r.grupos
    .map((g) => {
      const nombre = g.tipo === "CARGO" ? (g.n === 1 ? "cargo" : "cargos") : g.n === 1 ? "abono" : "abonos";
      return `${g.n} ${nombre} ${montoGrupoResumen(g.centavos, g.moneda)}`;
    })
    .join(" · ");
}

/** «14 seleccionados · 14 cargos $56.84 MXN» · «1 seleccionado · 1 abono $825.13 MXN». */
export function textoResumenSeleccion(r: ResumenSeleccion): string {
  const cabeza = `${r.n} ${r.n === 1 ? "seleccionado" : "seleccionados"}`;
  const grupos = textoGruposResumen(r);
  return grupos ? `${cabeza} · ${grupos}` : cabeza;
}

// ───────────────────────────── Acciones de la barra ─────────────────────────────

export interface AccionSeleccion {
  /** ¿Se abre el diálogo? Si no, `motivo` se ve en la barra y el clic lo repite. */
  aplica: boolean;
  /** Por qué NO aplica (null si aplica o si la acción no es de esta vista). */
  motivo: string | null;
}

export const MOTIVO_VINCULAR_SOLO_CARGOS =
  "Para vincular a un gasto deja solo cargos: los abonos se concilian desde su menú ⋯ o en Ingresos.";
export const MOTIVO_VINCULAR_SIN_MONEDA =
  "No se pudo leer la moneda de las cuentas: recarga la página para vincular varios cargos.";
export const MOTIVO_VINCULAR_TOPE = `Para vincular a un gasto elige hasta ${MAX_CARGOS_A_GASTO} cargos.`;

/** «Los cargos son de cuentas en MXN y USD: un gasto se paga en una sola moneda.» */
export function motivoVincularMonedas(monedas: readonly string[]): string {
  const lista = monedas.length <= 2 ? monedas.join(" y ") : `${monedas.slice(0, -1).join(", ")} y ${monedas[monedas.length - 1]}`;
  return `Los cargos son de cuentas en ${lista}: un gasto se paga en una sola moneda.`;
}

const NO_ES_DE_ESTA_VISTA: AccionSeleccion = { aplica: false, motivo: null };

/**
 * Qué acción de la barra aplica y, si no, POR QUÉ (la barra NO decide: lee
 * esto). Ningún botón se apaga por una regla de negocio: el motivo se ve y
 * el clic lo repite. Vincular: solo cargos, de UNA moneda (las cuentas
 * pueden ser distintas), hasta 50 (con 1, el diálogo de siempre).
 */
export function accionesDeSeleccion(
  r: ResumenSeleccion,
  vista: VistaSeleccion,
): { vincular: AccionSeleccion; omitir: AccionSeleccion; deshacer: AccionSeleccion } {
  const tope: AccionSeleccion =
    r.n > TOPE_SELECCION ? { aplica: false, motivo: TEXTO_TOPE_SELECCION } : { aplica: r.n > 0, motivo: null };
  if (vista === "omitidos") {
    return { vincular: NO_ES_DE_ESTA_VISTA, omitir: NO_ES_DE_ESTA_VISTA, deshacer: tope };
  }
  let vincular: AccionSeleccion;
  if (r.n === 0) vincular = { aplica: false, motivo: null };
  else if (r.abonos > 0) vincular = { aplica: false, motivo: MOTIVO_VINCULAR_SOLO_CARGOS };
  else if (r.cargosSinMoneda > 0) vincular = { aplica: false, motivo: MOTIVO_VINCULAR_SIN_MONEDA };
  else if (r.monedasCargos.length > 1) vincular = { aplica: false, motivo: motivoVincularMonedas(r.monedasCargos) };
  else if (r.cargos > MAX_CARGOS_A_GASTO) vincular = { aplica: false, motivo: MOTIVO_VINCULAR_TOPE };
  else vincular = { aplica: true, motivo: null };
  return { vincular, omitir: tope, deshacer: NO_ES_DE_ESTA_VISTA };
}

// ───────────────────────────── Textos ─────────────────────────────

export const ETIQUETA_REGION_SELECCION = "Movimientos seleccionados";
export const BOTON_VINCULAR_A_GASTO = "Vincular a un gasto…";
export const BOTON_OMITIR = "Omitir…";
export const BOTON_DESHACER_OMISION = "Deshacer la omisión…";
export const BOTON_LIMPIAR = "Limpiar";
export const BOTON_QUITAR_SELECCION = "Quitar selección";
/** Encabezado (solo para el lector de pantalla) de la columna de casillas. */
export const ENCABEZADO_SELECCION = "Seleccionar";

/** Descripción del banco en una sola línea, recortada. */
function descripcionCorta(d: string | null | undefined, max: number): string {
  const t = (d ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * `aria-label` ÚNICO de la casilla: «Seleccionar el cargo de $280.00 MXN del
 * 03 ago 2026 · REST EL TACO LOCO (GASTOS GNRAL)»; abono: «Seleccionar el
 * abono de …»; pestaña Omitidos: «Seleccionar el cargo omitido de …». Sin
 * moneda o sin alias, esa parte no se dice (no se adivina).
 */
export function etiquetaCasillaMovimiento(
  m: Pick<MovimientoBancario, "tipo" | "monto" | "fecha" | "descripcion">,
  alias: string | null | undefined,
  vista: VistaSeleccion,
  moneda?: string | null,
): string {
  const tipo = m.tipo === "ABONO" ? "abono" : "cargo";
  const omitido = vista === "omitidos" ? " omitido" : "";
  const monto = `${fmtMontoConciliacion(Math.abs(numeroDe(m.monto)))}${moneda ? ` ${moneda}` : ""}`;
  const desc = descripcionCorta(m.descripcion, 80);
  const cuenta = (alias ?? "").trim();
  return `Seleccionar el ${tipo}${omitido} de ${monto} del ${fmtDateOnly(m.fecha)}${desc ? ` · ${desc}` : ""}${
    cuenta ? ` (${cuenta})` : ""
  }`;
}

/**
 * El botón ARRIBA de la tabla: «Seleccionar los 14 pendientes de la
 * búsqueda» / «… de la lista»; con 1: «Seleccionar el pendiente de la
 * búsqueda»; pasado el tope: «Seleccionar los 200 más recientes de 252
 * pendientes (máximo por lote)». Pestaña Omitidos: «… omitidos …».
 */
export function textoSeleccionarTodas(p: {
  n: number;
  tope?: number;
  conBusqueda: boolean;
  vista: VistaSeleccion;
}): string {
  const tope = p.tope ?? TOPE_SELECCION;
  const singular = p.vista === "omitidos" ? "omitido" : "pendiente";
  const plural = p.vista === "omitidos" ? "omitidos" : "pendientes";
  const donde = p.conBusqueda ? "de la búsqueda" : "de la lista";
  if (p.n > tope) return `Seleccionar los ${tope} más recientes de ${p.n} ${plural} (máximo por lote)`;
  if (p.n === 1) return `Seleccionar el ${singular} ${donde}`;
  return `Seleccionar los ${p.n} ${plural} ${donde}`;
}

/**
 * Lo marcado que dejó de calificar (un refresh): «1 movimiento ya no está
 * pendiente: se quitó de la selección.» · «3 movimientos ya no están
 * pendientes: se quitaron de la selección.» (Omitidos: «… omitido(s) …»).
 * null con 0.
 */
export function textoSeleccionRetirada(n: number, vista: VistaSeleccion): string | null {
  if (!(n > 0)) return null;
  const estado = vista === "omitidos" ? "omitido" : "pendiente";
  return n === 1
    ? `1 movimiento ya no está ${estado}: se quitó de la selección.`
    : `${n} movimientos ya no están ${estado}s: se quitaron de la selección.`;
}
