/**
 * PRE-CIERRE → «Vuelos con TUA pagada por Operación sin TUA cobrada al
 * cliente» (15-oct-2026, PEDIDO 4 del cliente; espejo de
 * `profit-sharing/tua-pagada-sin-cobrar.util.ts` del API). Sustituye al
 * renglón retirado `tua_cobrada_sin_pagada`: «el que nos importa es cuando no
 * se cotizó pero sí se pagó nosotros Operación los TUAS».
 *
 * El API decide QUÉ vuelos entran (fuentes únicas: `trasladosPagadosDeGasto`
 * para lo pagado, `particionIngresoVuelo` para lo cobrado) y manda los montos
 * por moneda, NUNCA sumados entre sí. Aquí solo cómo se PINTA cada chip y a
 * dónde lleva. PURO: el panel no calcula dinero, solo formatea.
 */
import { fmtMonto } from "@/lib/format";

export const CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR = "tua_pagada_sin_cobrar";

/**
 * «Resolver →»: la LISTA de cotizaciones del periodo (ahí se abre cada una
 * para encender «Se cobran TUAS» o agregar la TUA como extra). Solo la base:
 * el PEDIDO 2 anexa después los ids de `vuelos[]` para marcarlos en ámbar.
 */
export function hrefPrecierreTuaPagada(p: { desde: string; hasta: string }): string {
  const sp = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  return `/admin/quotes?${sp.toString()}`;
}

export const ETIQUETA_PASE_ABORDAR = "pase de abordar";

/** Vuelo del renglón tal como lo manda el API (todo opcional por tolerancia). */
export interface VueloTuaPagadaPrecierre {
  id: string;
  folio: number;
  fecha_vuelo?: string | null;
  matricula?: string | null;
  tua_pagada_mxn?: number | null;
  tua_pagada_usd?: number | null;
  pase_abordar?: boolean | null;
  gastos_n?: number | null;
}

/** Chip de un vuelo en un renglón del pre-cierre: texto, destino y ayuda. */
export interface ChipPreCierre {
  texto: string;
  href: string;
  title: string;
}

/** Montos del API por moneda, cada uno con `fmtMonto` y unidos por « + » (jamás sumados). */
export function montosPorMonedaTexto(
  mxn: number | null | undefined,
  usd: number | null | undefined,
): string | null {
  const partes = [
    mxn != null && mxn > 0 ? fmtMonto(mxn, "MXN") : null,
    usd != null && usd > 0 ? fmtMonto(usd, "USD") : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" + ") : null;
}

/** «#70» (o «vuelo» si el API no trae folio). */
export function folioChipPrecierre(folio: number): string {
  return folio > 0 ? `#${folio}` : "vuelo";
}

/**
 * «#70 ($2,355.39 MXN · 2 facturas)», «#125 ($430.49 MXN)», «#154 (pase de
 * abordar · $756.48 MXN)»; dos monedas ⇒ «($1,000 MXN + $50 USD)»; sin
 * montos ⇒ «#70». Lleva a la cotización del vuelo (`/admin/quotes/<id>`),
 * donde viven «Se cobran TUAS», «Pase de abordar» y los extras.
 */
export function chipVueloTuaPagada(v: VueloTuaPagadaPrecierre): ChipPreCierre {
  const pase = v.pase_abordar === true;
  const montos = montosPorMonedaTexto(v.tua_pagada_mxn, v.tua_pagada_usd);
  const n = typeof v.gastos_n === "number" && v.gastos_n > 0 ? v.gastos_n : 0;
  const partes = [
    ...(pase ? [ETIQUETA_PASE_ABORDAR] : []),
    ...(montos ? [montos] : []),
    ...(n > 1 ? [`${n} facturas`] : []),
  ];
  const folio = folioChipPrecierre(v.folio);
  const texto = partes.length > 0 ? `${folio} (${partes.join(" · ")})` : folio;

  const facturas = n > 0 ? ` en ${n} ${n === 1 ? "factura" : "facturas"} del aeropuerto` : "";
  const avion = v.matricula?.trim() ? ` · ${v.matricula.trim()}` : "";
  const notaPase = pase
    ? " El pasajero compró su pase de abordar: si él pagó su TUA, revisa la factura en Gastos → «Verificar / editar»."
    : "";
  return {
    texto,
    href: `/admin/quotes/${v.id}`,
    title:
      `TUA pagada por Operación (IVA incluido)${montos ? `: ${montos}` : ""}${facturas}${avion}. ` +
      "La cotización no cobra TUA: ábrela y enciende «Se cobran TUAS» o agrégala como extra con «TUA» en el concepto." +
      notaPase,
  };
}
