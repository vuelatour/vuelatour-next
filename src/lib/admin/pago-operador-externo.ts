/**
 * «Es el pago al operador externo» en Gastos (27-oct-2026, API 0.0.110,
 * invariante 110 del API) — regla PURA del panel.
 *
 * Caso real #453 (oscar02-251026, Simon Herrera, 25-oct-2026): la oficina
 * cotizó «lo que cobra el operador» en $840 USD; al pagarle, Simon cobró
 * 840 + IVA al T.C. del día = $18,182.00 MXN, capturado como gasto del
 * vuelo. El API solo reconocía el pago si coincidía ±1 % con lo cotizado, así
 * que el Balance general sumó los dos en OPERACIONES. Pedido de la oficina:
 * «que lo que yo ponga en la cotización sea informativo … y que tome nada
 * más de referencia el gasto que puso Ale».
 *
 * Regla: el gasto que la oficina MARCA es el costo real del operador en los
 * libros (balance, reporte por vuelo, reparto); el costo cotizado en la
 * cotización queda como referencia del margen al cotizar y como nota (no se
 * suma dos veces aunque difiera por IVA, tipo de cambio o pago en partes —
 * cada parte se marca). Solo en un gasto CON vuelo cubierto por externo y de
 * una categoría que resta en las columnas del vuelo (espejo de
 * `gastoRestaEnColumnasDelVuelo` del API); solo OFICINA (ADMIN / FACTURACION
 * / COORDINADOR, `ROLES_PAGO_OPERADOR_EXTERNO`; el API lo revalida). En el
 * alta se marca SOLA cuando el vuelo es externo y la categoría es
 * Operaciones (`pagoOperadorPorDefecto`): la oficina solo supervisa. La llave
 * viaja SOLO si la casilla se ve (y en el PATCH, solo si cambió): un API
 * previo rechaza toda llave desconocida (`forbidNonWhitelisted`) ⇒ el panel
 * se despliega DESPUÉS del API 0.0.110. En «Verificar / editar», además, solo
 * si el gasto trae la llave (`apiConPagoOperador`).
 */
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_PAGO_VENDEDOR,
  CATEGORIA_OTROS_MOVIMIENTOS,
} from "@/lib/admin/categorias-gasto";

/** Quién marca el pago al operador (espejo de `ROLES_PAGO_OPERADOR_EXTERNO` del API). */
export const ROLES_PAGO_OPERADOR_EXTERNO: readonly string[] = ["ADMIN", "FACTURACION", "COORDINADOR"];

/** Categorías del vuelo que NUNCA restan en sus columnas (espejo del API). */
const CATEGORIAS_FUERA_DE_COLUMNAS: ReadonlySet<string> = new Set(["TUAS", "GAS", "PERMISO", "INDIRECTO"]);

/** La categoría con la que la oficina captura el pago al operador: se marca sola. */
export const CATEGORIA_PAGO_OPERADOR_POR_DEFECTO = "OPERACIONES";

export const AYUDA_PAGO_OPERADOR =
  "Con la marca, este gasto es el costo real del vuelo: el costo cotizado en la cotización deja de sumarse en el balance, el reporte del vuelo y el reparto (no se cuenta doble aunque difiera por IVA o tipo de cambio). Si el pago va en partes, marca cada parte.";
export const CHIP_PAGO_OPERADOR = "Pago operador";
export const TITULO_CHIP_PAGO_OPERADOR =
  "Pago al operador externo: es el costo real del vuelo; el costo cotizado no se suma además";
/** Etiqueta del campo en el historial del gasto (bitácora). */
export const ETIQUETA_HISTORIAL_PAGO_OPERADOR = "Pago al operador externo";
export const NOTA_PAGO_OPERADOR_SE_QUITA =
  "Al guardar se quitará la marca «pago al operador externo»: solo un gasto de un vuelo cubierto por externo, con una categoría del vuelo, puede serlo (el costo cotizado volverá a sumarse).";
/** Ficha del vuelo (card «Apoyo externo»). */
export const ETIQUETA_PAGADO_AL_OPERADOR = "Pagado al operador (gastos marcados)";
export const NOTA_PAGADO_AL_OPERADOR =
  "Es el costo real del vuelo en los libros; el costo cotizado de arriba es solo referencia y ya no se suma.";
export const NOTA_SIN_PAGO_MARCADO =
  "Cuando captures el pago al operador en Gastos, deja marcado «Es el pago al operador externo»: los libros tomarán ese gasto como el costo real y el cotizado de arriba quedará solo como referencia.";
/** Etiqueta del costo cotizado (cotización, ficha del vuelo, «Cubrir con externo»). */
export const ETIQUETA_COSTO_COTIZADO = "Lo que cobra el operador externo (costo cotizado)";
export const HINT_COSTO_COTIZADO =
  "En su moneda · interno, no lo ve el cliente · referencia del margen al cotizar: el costo real es el gasto que la oficina marque «pago al operador externo»";

/** «Es el pago al operador externo (Simon Herrera)». */
export function etiquetaPagoOperador(operador: string | null | undefined): string {
  const op = operador?.trim();
  return `Es el pago al operador externo${op ? ` (${op})` : ""}`;
}

/** ¿La categoría resta en las columnas del vuelo? (espejo del API). */
export function categoriaPuedeSerPagoOperador(cat: string | null | undefined): boolean {
  return (
    !!cat &&
    !CATEGORIAS_FUERA_DE_COLUMNAS.has(cat) &&
    !CATEGORIAS_EMPRESA.has(cat) &&
    !CATEGORIAS_PAGO_VENDEDOR.has(cat) &&
    cat !== CATEGORIA_OTROS_MOVIMIENTOS
  );
}

/** «¿Este gasto es el pago al operador externo?» (espejo de `esPagoOperadorExterno` del API). */
export function esPagoOperadorExterno(
  g: { es_pago_operador_externo?: boolean | null } | null | undefined,
): boolean {
  return g?.es_pago_operador_externo === true;
}

/** ¿El API mandó la llave? (= API 0.0.110+; sin ella no se pinta ni se manda). */
export function apiConPagoOperador(g: object | null | undefined): boolean {
  return (
    !!g && typeof (g as { es_pago_operador_externo?: unknown }).es_pago_operador_externo === "boolean"
  );
}

/** ¿Este usuario puede marcar/desmarcar? (rol de oficina; el API lo revalida). */
export function puedeMarcarPagoOperador(me: { rol?: string | null } | null | undefined): boolean {
  return typeof me?.rol === "string" && ROLES_PAGO_OPERADOR_EXTERNO.includes(me.rol);
}

/** Vuelo elegido en los selectores de gasto: ¿externo? y su operador. */
export function vueloExternoDe(
  v: { es_externo?: boolean | null; operador_externo?: string | null } | null | undefined,
): { externo: boolean; operador: string | null } {
  return { externo: v?.es_externo === true, operador: v?.operador_externo?.trim() || null };
}

/** ¿Se enseña la casilla? Vuelo externo + categoría del vuelo + quien puede marcar. */
export function casillaPagoOperadorVisible(p: {
  vueloExterno: boolean;
  categoria: string | null | undefined;
  puedeMarcar: boolean;
}): boolean {
  return p.puedeMarcar && p.vueloExterno && categoriaPuedeSerPagoOperador(p.categoria);
}

/** Alta: marcada SOLA cuando el vuelo es externo y la categoría es Operaciones. */
export function pagoOperadorPorDefecto(p: {
  vueloExterno: boolean;
  categoria: string | null | undefined;
}): boolean {
  return p.vueloExterno && p.categoria === CATEGORIA_PAGO_OPERADOR_POR_DEFECTO;
}

/** Alta: la llave viaja SOLO marcada y visible (el default del API es false). */
export function pagoOperadorParaAlta(p: { visible: boolean; marcado: boolean }): true | undefined {
  return p.visible && p.marcado ? true : undefined;
}

/** PATCH: la llave viaja SOLO si la casilla se ve y cambió respecto a la
 *  base del diálogo (el API la ignora si es igual, pero un eco no debe tocar
 *  el candado del mes ni la bitácora). */
export function pagoOperadorParaPatch(p: {
  visible: boolean;
  marcado: boolean;
  actual: boolean;
}): boolean | undefined {
  if (!p.visible) return undefined;
  return p.marcado === p.actual ? undefined : p.marcado;
}

/** ¿Avisar que al guardar se quita la marca? (estaba marcado y el vuelo ya
 *  no es externo o la categoría no es del vuelo: el trigger / el API la quita). */
export function pagoOperadorSeQuita(p: {
  actual: boolean;
  vueloExterno: boolean;
  categoria: string | null | undefined;
}): boolean {
  return p.actual && !(p.vueloExterno && categoriaPuedeSerPagoOperador(p.categoria));
}

/** Σ por moneda de los gastos MARCADOS (ficha del vuelo): solo lo capturado,
 *  en su moneda, sin convertir (los libros ya lo cuentan). */
export function pagosAlOperadorPorMoneda(
  gastos: ReadonlyArray<{
    es_pago_operador_externo?: boolean | null;
    moneda: string;
    monto: string | number;
  }>,
): Array<{ moneda: string; total: number; n: number }> {
  const acc = new Map<string, { total: number; n: number }>();
  for (const g of gastos) {
    if (!esPagoOperadorExterno(g)) continue;
    const cur = acc.get(g.moneda) ?? { total: 0, n: 0 };
    cur.total = Math.round((cur.total + Number(g.monto)) * 100) / 100;
    cur.n += 1;
    acc.set(g.moneda, cur);
  }
  return [...acc.entries()].map(([moneda, v]) => ({ moneda, ...v }));
}
