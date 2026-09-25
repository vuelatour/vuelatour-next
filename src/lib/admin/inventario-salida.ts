/**
 * SALIDA de bodega a un avión: qué precio viaja al API y qué se le dice al
 * operador — 25-sep-2026 (utilidad de la tienda VuelaTour).
 *
 * Regla del API (`precioVentaDeSalida`, decisión del cliente): el avión
 * paga, en este orden, (1) el precio tecleado en la salida (> 0), (2) el
 * precio de venta del producto, (3) el costo + margen de la tienda (25 % por
 * defecto, en Configuración). **0 explícito = a costo, sin utilidad.** Desde
 * el API 0.0.36 (25-sep-2026) el costo es el ÚLTIMO PRECIO DE COMPRA de la
 * fecha de la salida (ya no FIFO).
 *
 * EL BUG QUE EVITA ESTE MÓDULO: el diálogo de antes mandaba `venta_unitaria:
 * "0"` cuando el precio iba vacío («vacío = a costo»). Con el API nuevo
 * eso haría que TODA salida del panel quedara a costo — cero utilidad, justo
 * lo contrario de lo que pidió el cliente. Vacío ahora se OMITE (el API
 * decide) y «a costo» es una casilla explícita.
 *
 * PURO (prueba `__tests__/inventario-salida.test.ts`): ningún componente
 * redacta estas frases ni arma el payload de la venta a mano.
 */

import { fmtMxn, fmtUsd } from "@/lib/format";
import type { InventarioMovimiento, OrigenVenta } from "@/types/inventory";
import { margenParaTexto, pctTxt } from "./inventario-utilidad";

export const ETIQUETA_A_COSTO = "Cargar a costo, sin utilidad";

/** Placeholder del precio: qué pasa si se deja vacío. */
export function placeholderVenta(p: {
  precioProducto?: number | null;
  margenPct?: number | null;
}): string {
  if (p.precioProducto != null && p.precioProducto > 0) return "Vacío = precio del producto";
  return `Vacío = último precio de compra + ${pctTxt(margenParaTexto(p.margenPct))} %`;
}

/** Ayuda bajo el precio de la salida. */
export function hintVentaSalida(margenPct?: number | null): string {
  return `El avión paga este precio. Vacío: último precio de compra + ${pctTxt(margenParaTexto(margenPct))} % (utilidad de la tienda).`;
}

/** Ayuda del «Precio de venta unitario» del PRODUCTO (formulario del ítem). */
export function hintPrecioVentaProducto(margenPct?: number | null): string {
  return (
    "Lo que paga el avión al sacar la pieza de bodega; el costo (último precio de compra) queda para el inventario. " +
    `Vacío = cada salida se cobra al último precio de compra + ${pctTxt(margenParaTexto(margenPct))} % (utilidad de la tienda).`
  );
}

/**
 * Precio de venta del PRODUCTO: «$350.00 MXN», «$62.50 USD», «Último precio
 * de compra + 25 %» (sin precio, con margen) o «A costo» (sin precio y SIN
 * margen conocido = API previo, donde la salida va a costo).
 */
export function textoPrecioVentaProducto(p: {
  precio: number | string | null | undefined;
  moneda: "MXN" | "USD" | null | undefined;
  margenPct: number | null | undefined;
}): string {
  const n = p.precio == null || p.precio === "" ? null : Number(p.precio);
  if (n != null && Number.isFinite(n) && n > 0) {
    return p.moneda === "USD" ? `${fmtUsd(n)} USD` : fmtMxn(n);
  }
  if (typeof p.margenPct === "number" && Number.isFinite(p.margenPct)) {
    return p.margenPct > 0 ? `Último precio de compra + ${pctTxt(p.margenPct)} %` : "A costo";
  }
  return "A costo";
}

/** Ayuda de la casilla «Cargar a costo, sin utilidad». */
export const HINT_A_COSTO =
  "El avión paga solo el costo de la pieza (su último precio de compra); la tienda no gana nada en esta salida.";

/** Placeholder del precio con «a costo» marcado. */
export const PLACEHOLDER_A_COSTO = "A costo";

/** Ayuda del avión en la salida. */
export function hintAvionSalida(margenPct?: number | null): string {
  return (
    "Se registra como gasto de refacción del avión y sale en su reporte mensual " +
    `(al precio de venta; vacío: último precio de compra + ${pctTxt(margenParaTexto(margenPct))} %).`
  );
}

/** Ayuda de «Para todas las matrículas». */
export const HINT_PARA_FLOTA =
  "(el cargo —precio o costo + margen— se reparte en partes iguales entre la flota activa)";

/**
 * Lo que viaja al API como venta de la salida. SOLO la SALIDA lleva venta:
 *  - «a costo» marcado ⇒ `venta_unitaria: 0` (sin moneda: 0 es 0).
 *  - precio vacío ⇒ NADA (el API aplica el precio del producto o el último
 *    precio de compra + margen).
 *  - precio tecleado ⇒ número + su moneda (un 0 tecleado también es «a costo»).
 * Un texto que no es número viaja tal cual para que el esquema lo rechace
 * con su mensaje (nunca se convierte en silencio a «vacío»).
 */
export function ventaDelFormulario(f: {
  tipo: string;
  venta: string | number | null | undefined;
  aCosto: boolean;
  moneda: "MXN" | "USD";
}): { venta_unitaria?: number | string; venta_moneda?: "MXN" | "USD" } {
  if (f.tipo !== "SALIDA") return {};
  if (f.aCosto) return { venta_unitaria: 0 };
  const txt = String(f.venta ?? "").trim();
  if (txt === "") return {};
  const n = Number(txt);
  if (!Number.isFinite(n)) return { venta_unitaria: txt };
  if (n === 0) return { venta_unitaria: 0 };
  return { venta_unitaria: n, venta_moneda: f.moneda };
}

const montoTxt = (monto: number, moneda: string) =>
  moneda === "USD" ? `${fmtUsd(monto)} USD` : fmtMxn(monto);

/** «(último precio + 25 %)», «(precio del producto)»… `null` = no se sabe (API previo). */
export function etiquetaOrigenVenta(
  origen: OrigenVenta | null | undefined,
  margenPct?: number | null,
): string | null {
  switch (origen) {
    case "MARGEN":
      return `último precio + ${pctTxt(margenParaTexto(margenPct))} %`;
    case "PRECIO_PRODUCTO":
      return "precio del producto";
    case "PRECIO_CAPTURADO":
      return "precio de venta";
    case "A_COSTO":
      return "a costo, sin utilidad";
    default:
      return null;
  }
}

/**
 * Toast de éxito de una SALIDA: «Salida registrada: se cargó $318.75 USD a
 * XA-VGV (último precio + 25 %).» / «…$120.00 MXN repartido entre 6 aviones
 * (precio del producto).». Sin `venta_origen` (API previo) se deduce del
 * movimiento: con venta ⇒ «precio de venta»; sin ella ⇒ «a costo». Sin gasto
 * (costo 0) se dice que no hubo cargo.
 */
export function textoSalidaRegistrada(
  mov: Pick<
    InventarioMovimiento,
    | "gasto_generado"
    | "venta_origen"
    | "margen_pct"
    | "venta_unitaria"
    | "venta_moneda"
    | "moneda"
    | "costo_unitario_mxn"
  >,
  matricula?: string | null,
): string {
  const g = mov.gasto_generado;
  if (!g) return "Salida registrada · sin cargo al avión (la pieza no tiene costo capturado).";
  const conVenta = mov.venta_unitaria != null && Number(mov.venta_unitaria) > 0;
  const origen =
    etiquetaOrigenVenta(mov.venta_origen, mov.margen_pct) ??
    (conVenta ? "precio de venta" : "a costo");
  if ("prorrateado" in g && g.prorrateado) {
    const moneda = conVenta
      ? mov.venta_moneda === "USD"
        ? "USD"
        : "MXN"
      : mov.moneda === "MXN" && mov.costo_unitario_mxn != null
        ? "MXN"
        : "USD";
    return `Salida registrada: se cargó ${montoTxt(Number(g.monto_total), moneda)} repartido entre ${g.aviones} aviones (${origen}).`;
  }
  const uno = g as { monto: number; moneda: string };
  const destino = matricula?.trim() ? `a ${matricula.trim()}` : "al avión";
  return `Salida registrada: se cargó ${montoTxt(Number(uno.monto), String(uno.moneda))} ${destino} (${origen}).`;
}
