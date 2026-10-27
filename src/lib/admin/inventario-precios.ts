/**
 * TARJETA «Precios de este producto» (27-oct-2026). Pedido de la oficina con
 * la captura del filtro CH48108: «Ya no entiendo la parte del inventario 🥹
 * ¿dónde puedo ver el precio vigente?» — el precio vigente solo se veía como
 * un chip chico junto al precio de la compra y como una línea gris al pie del
 * cardex. Ahora la ficha abre con UNA tarjeta de tres datos:
 *
 *   PRECIO VIGENTE (último precio de compra) · SE COBRA AL AVIÓN (en la
 *   siguiente salida) · EXISTENCIA HOY.
 *
 * PURO: solo REDACTA lo que manda el API (`precio_vigente`, `tc_hoy`,
 * `margen_venta_pct`, `totales.existencia_actual`); no calcula precios,
 * T.C. ni valorizados (regla de la ficha: el panel no hace cuentas). Prueba:
 * `__tests__/inventario-precios.test.ts`.
 */
import { fmtDateOnly } from "@/lib/datetime";
import { fmtTc } from "@/lib/format";
import { cantidadConUnidad } from "./inventario-eliminar";
import { textoBajoMinimo } from "./inventario-ficha";
import {
  fmtPrecioUnitario,
  margenParaTexto,
  numeroONulo,
  pctTxt,
  textoMonto,
} from "./inventario-utilidad";
import type { OrigenVenta, PrecioVigenteFicha, TcHoy } from "@/types/inventory";

export const TITULO_TARJETA_PRECIOS = "Precios de este producto";
export const AYUDA_TARJETA_PRECIOS =
  "El precio vigente es el de la última compra: con él se valúa la existencia y se cobra la siguiente salida.";
export const ETIQUETA_PRECIO_VIGENTE = "Precio vigente";
export const SUB_ETIQUETA_PRECIO_VIGENTE = "último precio de compra";
export const ETIQUETA_SE_COBRA = "Se cobra al avión";
export const SUB_ETIQUETA_SE_COBRA = "en la siguiente salida";
export const ETIQUETA_EXISTENCIA_HOY = "Existencia hoy";
export const SIN_PRECIO_VIGENTE =
  "Sin precio vigente: este producto no tiene ninguna compra con costo, así que una salida saldría a costo $0 (sin cargo al avión). Registra la compra o corrige su costo en el cardex.";
export const VENTA_NO_CALCULABLE = "Todavía no se puede calcular";

/** Un dato de la tarjeta: el número grande y sus renglones chicos. */
export interface DatoTarjeta {
  valor: string;
  sub: string[];
  /** Ámbar = algo que atender (sin utilidad, bajo el mínimo). */
  tono?: "ambar";
}

export interface TarjetaPrecios {
  /** null = sin ninguna compra con costo (la tarjeta lo dice en ámbar). */
  vigente: DatoTarjeta | null;
  /** null = sin precio vigente (no hay a qué sumarle el margen). */
  venta: DatoTarjeta | null;
  existencia: DatoTarjeta;
}

/**
 * Renglones bajo el precio vigente: «Entrada del 01 sep 2026 · T.C. 17.0077»
 * y, si la compra fue en dólares, «≈ $783.37 MXN al T.C. de hoy 17.0077»
 * (pesos de HOY que manda el API: `unitario_mxn_hoy`).
 */
export function subPrecioVigente(
  pv: Pick<PrecioVigenteFicha, "fecha" | "moneda" | "tc_compra" | "unitario_mxn_hoy">,
  tcHoy?: Pick<TcHoy, "tc"> | null,
): string[] {
  const lineas: string[] = [];
  const tcCompra = fmtTc(pv.tc_compra);
  const fecha = pv.fecha ? fmtDateOnly(pv.fecha) : null;
  const detalle =
    pv.moneda === "MXN" ? "captura en pesos" : tcCompra ? `T.C. ${tcCompra}` : null;
  if (fecha || detalle) {
    lineas.push([fecha ? `Entrada del ${fecha}` : null, detalle].filter(Boolean).join(" · "));
  }
  const mxnHoy = numeroONulo(pv.unitario_mxn_hoy);
  if (pv.moneda === "USD" && mxnHoy != null) {
    const tc = fmtTc(tcHoy?.tc);
    lineas.push(
      `≈ ${textoMonto(mxnHoy, "MXN", { signo: false })}${tc ? ` al T.C. de hoy ${tc}` : " en pesos de hoy"}`,
    );
  }
  return lineas;
}

/** De dónde sale el precio de la siguiente salida (precedencia del API). */
export function textoOrigenVenta(origen: OrigenVenta | null | undefined, margenPct?: number | null): string {
  switch (origen) {
    case "PRECIO_PRODUCTO":
    case "PRECIO_CAPTURADO":
      return "precio de venta fijo de este producto (se cambia en «Editar»)";
    case "A_COSTO":
      return "a costo, sin utilidad";
    default:
      return `= precio vigente + ${pctTxt(margenParaTexto(margenPct))} % (margen de la tienda, se cambia en Configuración)`;
  }
}

/** Los tres datos de la tarjeta, redactados (el API ya hizo las cuentas). */
export function tarjetaPrecios(p: {
  pv: PrecioVigenteFicha | null | undefined;
  tcHoy?: TcHoy | null;
  margenPct?: number | null;
  existencia: number | string | null | undefined;
  unidad: string | null | undefined;
  bajoStock?: boolean | null;
  stockMinimo?: number | string | null;
}): TarjetaPrecios {
  const pv = p.pv ?? null;
  const vigente: DatoTarjeta | null = pv
    ? { valor: fmtPrecioUnitario(pv.unitario, pv.moneda), sub: subPrecioVigente(pv, p.tcHoy) }
    : null;
  let venta: DatoTarjeta | null = null;
  if (pv) {
    const sig = pv.siguiente_salida;
    const unitaria = numeroONulo(sig?.venta_unitaria);
    venta =
      sig && unitaria != null
        ? {
            valor: fmtPrecioUnitario(unitaria, sig.moneda ?? pv.moneda),
            sub: [textoOrigenVenta(sig.origen, p.margenPct)],
            ...(sig.origen === "A_COSTO" ? { tono: "ambar" as const } : {}),
          }
        : { valor: "—", sub: [VENTA_NO_CALCULABLE] };
  }
  const bajoMinimo = textoBajoMinimo(p.bajoStock, p.stockMinimo);
  const existencia: DatoTarjeta = {
    valor: cantidadConUnidad(numeroONulo(p.existencia) ?? 0, p.unidad ?? null),
    sub: bajoMinimo ? [bajoMinimo] : [],
    ...(bajoMinimo ? { tono: "ambar" as const } : {}),
  };
  return { vigente, venta, existencia };
}
