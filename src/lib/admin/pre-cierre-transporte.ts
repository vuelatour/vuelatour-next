/**
 * PRE-CIERRE → «Vuelos con transporte pagado sin transporte cotizado»
 * (15-oct-2026, PEDIDO 4 del cliente: «pasa que no se cotizó el transporte
 * pero luego sí se pide»; espejo de
 * `profit-sharing/transporte-pagado-sin-cotizar.util.ts` del API).
 *
 * Es una SEÑAL: el API decide QUÉ gastos parecen transporte de pasajeros
 * (`common/transporte-pasajeros.util.ts`) y si la cotización ya trae un extra
 * de transporte; manda cada gasto con su texto (≤ 60) y los montos por
 * moneda, NUNCA sumados entre sí. Aquí solo cómo se PINTA cada chip y a dónde
 * lleva. PURO: el panel no calcula dinero, solo formatea.
 */
import { fmtMonto } from "@/lib/format";
import {
  folioChipPrecierre,
  montosPorMonedaTexto,
  type ChipPreCierre,
} from "@/lib/admin/pre-cierre-tua-pagada";

export const CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR = "transporte_pagado_sin_cotizar";

/**
 * «Resolver →»: la LISTA de cotizaciones del periodo (el transporte se cobra
 * como extra en la cotización). Solo la base: el PEDIDO 2 anexa los ids.
 */
export function hrefPrecierreTransporte(p: { desde: string; hasta: string }): string {
  const sp = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  return `/admin/quotes?${sp.toString()}`;
}

/** Tope del texto del gasto DENTRO del chip (el `title` lleva el texto completo del API). */
export const CHIP_TEXTO_TRANSPORTE_MAX = 28;

export interface GastoTransportePrecierre {
  id: string;
  texto: string;
  monto: number;
  moneda: string;
}

/** Vuelo del renglón tal como lo manda el API (todo opcional por tolerancia). */
export interface VueloTransportePrecierre {
  id: string;
  folio: number;
  fecha_vuelo?: string | null;
  matricula?: string | null;
  monto_mxn?: number | null;
  monto_usd?: number | null;
  gastos?: GastoTransportePrecierre[] | null;
}

function recortar(texto: string, max: number): string {
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/**
 * 1 gasto ⇒ «#190 ($400 MXN · Transporte Chetumal a Carl's…)» (texto
 * recortado a 28 + «…»); varios ⇒ «#404 ($700 MXN · 2 gastos)» (montos del
 * API por moneda, « + » entre monedas); sin gastos ni montos ⇒ «#190». Lleva
 * a la cotización del vuelo (`/admin/quotes/<id>`), donde se agrega el extra.
 */
export function chipVueloTransporte(v: VueloTransportePrecierre): ChipPreCierre {
  const gastos = Array.isArray(v.gastos) ? v.gastos : [];
  const montos = montosPorMonedaTexto(v.monto_mxn, v.monto_usd);
  const unoTexto = gastos.length === 1 ? (gastos[0].texto ?? "").trim() : "";
  const partes = [
    ...(montos ? [montos] : []),
    ...(gastos.length > 1
      ? [`${gastos.length} gastos`]
      : unoTexto
        ? [recortar(unoTexto, CHIP_TEXTO_TRANSPORTE_MAX)]
        : []),
  ];
  const folio = folioChipPrecierre(v.folio);
  const texto = partes.length > 0 ? `${folio} (${partes.join(" · ")})` : folio;

  const avion = v.matricula?.trim() ? ` · ${v.matricula.trim()}` : "";
  const detalleGastos = gastos
    .map((g) => {
      const m = Number.isFinite(g.monto) && g.monto > 0 ? fmtMonto(g.monto, g.moneda) : null;
      const t = (g.texto ?? "").trim();
      return [m, t || null].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("; ");
  const detalle = detalleGastos || montos || "";
  return {
    texto,
    href: `/admin/quotes/${v.id}`,
    title:
      `Transporte pagado sin cotizar${avion}${detalle ? `: ${detalle}` : ""}. ` +
      "Revisa si se cobró; si no, agrégalo como extra en la cotización o anótalo en «Seguimiento de la cotización».",
  };
}
