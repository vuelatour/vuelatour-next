/**
 * «Resolver →» del renglón BLOQUEANTE `gastos_por_pagar` del pre-cierre
 * (revisión del lote «por pagar», 19-oct-2026, acuerdo 1 entre repos).
 *
 * Gastos SIEMPRE excluye la nómina (`excluir_categoria=NOMINA`, 16-oct-2026:
 * vive en su módulo), pero el renglón la cuenta: una nómina por pagar
 * bloqueaba el cierre y «Resolver →» abría Gastos vacío. El API manda la llave
 * ADITIVA `ids_nomina` (el subconjunto de `ids` cuya categoría es NOMINA) y
 * aquí se decide a dónde lleva cada parte:
 *  - sin `ids_nomina` (API previo) o vacía ⇒ como siempre: Gastos «Por
 *    pagar» con el foco de todos los `ids`;
 *  - TODOS los ids son de nómina ⇒ Nómina en el mes del periodo, con el foco;
 *  - mezcla ⇒ Gastos con el foco de los ids que SÍ salen ahí, y el aviso
 *    «N son de Nómina: resuélvelos en Nómina» con su liga (el foco de los de
 *    nómina). Cada destino recibe en `pcn` cuántos le tocan: así su franja
 *    dice «2 por resolver · 2 en esta vista», no «3 … 1 ya no está».
 *
 * Gastos va SIN `desde`/`hasta` (`hrefPrecierreGastosPorPagar`): el API
 * cuenta el renglón por el mes CONTABLE del gasto y su `fecha_gasto` puede
 * caer en otro mes; los `ids` dicen cuáles son. PURO: sin React ni red.
 */
import { esUuid } from "./url-params";
import { hrefPrecierreGastosPorPagar } from "./gasto-por-pagar";
import { hrefPrecierreNominaSinRepartir } from "./nomina";
import { ETIQUETA_IR_A_NOMINA } from "./gastos-vista";
import {
  anexarFocoPreCierre,
  focoDeItem,
  hrefResolverItem,
  idsDeItemPreCierre,
  type ItemPreCierreResolver,
  type PeriodoPreCierre,
} from "./pre-cierre-resolver";

/** El renglón tal como lo manda el API (todo opcional: cualquier versión). */
export interface ItemPreCierrePorPagar extends ItemPreCierreResolver {
  /** ADITIVO (API 0.0.95, revisión del lote): ids de `ids` que son NOMINA. */
  ids_nomina?: unknown;
}

/** La parte de nómina de una MEZCLA: el aviso y su liga a Nómina con el foco. */
export interface AvisoNominaPorPagar {
  texto: string;
  href: string;
  etiqueta: string;
}

export interface ResolverPorPagar {
  /** «Resolver →» (con foco); null si el renglón no tiene destino. */
  href: string | null;
  /** Solo en una mezcla (unos de nómina, otros no); si no, null. */
  nomina: AvisoNominaPorPagar | null;
}

/** El texto del enlace del aviso: «Ir a Nómina →». */
export const ETIQUETA_RESOLVER_EN_NOMINA = `${ETIQUETA_IR_A_NOMINA} →`;

/**
 * «1 es de Nómina: resuélvelo en Nómina» / «2 son de Nómina: resuélvelos en
 * Nómina». Con los ids recortados por el API (`ids_truncado`) puede haber
 * más que los que se ven: «Al menos 2 son de Nómina…».
 */
export function avisoNominaPorPagar(n: number, alMenos = false): string {
  const pre = alMenos ? "Al menos " : "";
  return n === 1
    ? `${pre}1 es de Nómina: resuélvelo en Nómina`
    : `${pre}${n} son de Nómina: resuélvelos en Nómina`;
}

/** uuids válidos de un valor del API, en minúsculas y sin repetir (basura fuera). */
function uuidsDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of valor) {
    if (typeof v !== "string") continue;
    const id = v.trim().toLowerCase();
    if (!esUuid(id) || vistos.has(id)) continue;
    vistos.add(id);
    out.push(id);
  }
  return out;
}

/**
 * A dónde lleva «Resolver →» del renglón `gastos_por_pagar` (ver la cabecera).
 * `baseGastos` es el destino de siempre (`LINK_POR_CLAVE` de la card): sin él,
 * no hay enlace, como `hrefResolverItem`. Un renglón informativo o con la
 * lectura FALLIDA lleva la base intacta (no hay qué resaltar ni qué repartir).
 */
export function resolverPrecierreGastosPorPagar(
  item: ItemPreCierrePorPagar,
  periodo: PeriodoPreCierre,
  baseGastos: string | null | undefined = hrefPrecierreGastosPorPagar(),
): ResolverPorPagar {
  if (!baseGastos) return { href: null, nomina: null };
  if (item.informativo === true || item.lectura_fallida === true) {
    return { href: baseGastos, nomina: null };
  }
  const ids = idsDeItemPreCierre(item);
  const enIds = new Set(ids);
  // Solo cuentan los de nómina que también vienen en `ids` (el contrato dice
  // que son un subconjunto; un id suelto no se inventa).
  const idsNomina = uuidsDe(item.ids_nomina).filter((id) => enIds.has(id));
  if (idsNomina.length === 0) {
    return { href: hrefResolverItem(item, periodo, baseGastos), nomina: null };
  }
  const foco = focoDeItem(item, periodo);
  const hrefNomina = hrefPrecierreNominaSinRepartir(periodo);
  const truncado = item.ids_truncado === true;
  const deNomina = new Set(idsNomina);
  // Todos de nómina (y el API no recortó la lista): «Resolver →» a Nómina.
  if (!truncado && idsNomina.length === ids.length) {
    return { href: anexarFocoPreCierre(hrefNomina, foco), nomina: null };
  }
  // Mezcla: Gastos con los que SÍ salen ahí; la nómina, en su aviso.
  const idsGastos = ids.filter((id) => !deNomina.has(id));
  const href = anexarFocoPreCierre(baseGastos, {
    ...foco,
    ids: idsGastos,
    // Recortada, la cuenta exacta de lo que va a Gastos no se sabe: manda el API.
    count: truncado ? foco.count : idsGastos.length,
  });
  return {
    href,
    nomina: {
      texto: avisoNominaPorPagar(idsNomina.length, truncado),
      href: anexarFocoPreCierre(hrefNomina, { ...foco, ids: idsNomina, count: idsNomina.length }),
      etiqueta: ETIQUETA_RESOLVER_EN_NOMINA,
    },
  };
}
