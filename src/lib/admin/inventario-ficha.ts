/**
 * Ficha SENCILLA del producto — 25-sep-2026 (API 0.0.36).
 *
 * Pedido del cliente con capturas de `/admin/inventory/<id>`: «al entrar
 * algún producto nos están llenando de información repetida 😅 … Solo
 * necesitamos el apartado de: Compras | Ventas | Resumen de ventas» · «En el
 * tipo de cambio, que sea los mismos que usan en las cotizaciones (Tipo de
 * cambio del día de la venta)» · «la hoja de información del producto debe
 * ser mucho más sencilla: la descripción detallada · a cuánto se ha comprado
 * · en cuánto se ha estado vendiendo · dinero generado por ese producto» ·
 * «que los precios se ajusten en automático al último registrado».
 *
 * La REGLA es del API (fuente única `inventario-cardex.util.ts`): el costo
 * de un producto es su ÚLTIMO PRECIO DE COMPRA (congelado en cada salida al
 * registrarla) y todo movimiento en dólares se convierte con el T.C. OFICIAL
 * de su día —el mismo de las cotizaciones—. El panel NO calcula costo, T.C.,
 * utilidad ni sumas entre monedas: aquí solo se REDACTA lo que llega.
 *
 * PURO (prueba `__tests__/inventario-ficha.test.ts`): ningún componente
 * redacta estas frases a mano.
 */

import { fmtDateOnly } from "@/lib/datetime";
import { fmtTc } from "@/lib/format";
import { cantidadConUnidad } from "./inventario-eliminar";
import {
  fmtPrecioUnitario,
  margenParaTexto,
  numeroONulo,
  pctTxt,
  textoMonto,
} from "./inventario-utilidad";
import type {
  DineroGenerado,
  MonedaInventario,
  OrigenVenta,
  PrecioVigenteFicha,
  SalidaDependiente,
} from "@/types/inventory";

// ───────────────────────── Formatos ─────────────────────────

/**
 * PRECIO UNITARIO con su moneda, de 2 a 4 decimales («$26.5625 USD»,
 * «$1,658.33 MXN»). Vive en `inventario-utilidad.ts` (base de los formatos de
 * dinero del inventario, sin ciclos con `inventario-eliminar.ts`); se
 * re-exporta aquí porque es el formato de la ficha.
 */
export { fmtPrecioUnitario };

/** T.C. como texto de la ficha: «T.C. 17.0115» (siempre con `fmtTc`). */
export function textoTc(tc: number | string | null | undefined): string | null {
  const t = fmtTc(tc);
  return t ? `T.C. ${t}` : null;
}

// ───────────────────────── Descripción ─────────────────────────

/** «Aeronave/uso:» sin importar mayúsculas, acentos ni espacios alrededor. */
const MARCA_AERONAVE_USO = /a[eé]r[oó]n[aá]v[eé]\s*\/\s*[uú]s[oó]\s*:/i;

/**
 * La descripción de la carga VTF-INV-001 trae el uso al final («… clima
 * cálido. Aeronave/uso: C205 / T206 / T206H / Seneca V.»): se parte para
 * pintar ese tramo en su propio renglón. Sin marcador, todo es `texto`.
 */
export function partirDescripcion(desc: string | null | undefined): {
  texto: string;
  aeronaveUso: string | null;
} {
  const s = (desc ?? "").trim();
  const m = MARCA_AERONAVE_USO.exec(s);
  if (!m) return { texto: s, aeronaveUso: null };
  const texto = s.slice(0, m.index).trim();
  const uso = s
    .slice(m.index + m[0].length)
    .trim()
    .replace(/\.$/, "")
    .trim();
  return { texto, aeronaveUso: uso || null };
}

export const ETIQUETA_AERONAVE_USO = "Aeronave / uso";

// ───────────────────────── Precio vigente ─────────────────────────

export const ETIQUETA_PRECIO = "Último precio de compra";
export const CHIP_PRECIO_VIGENTE = "Precio vigente";
export const TITULO_CHIP_PRECIO_VIGENTE =
  "Último precio de compra: con este precio se valúa la existencia y se cobra la siguiente salida.";
/** Sub de una DEVOLUCION/AJUSTE en COMPRAS (con la regla nueva no fijan precio). */
export const SUB_NO_CAMBIA_PRECIO = "no cambia el precio";

/**
 * «Precio vigente $21.25 USD · la siguiente salida se cobra a $26.5625 USD
 * (+25 %)». Con precio fijo del producto: «… se cobra a su precio de venta
 * $350.00 MXN». Sin la siguiente salida: solo el precio vigente.
 */
export function textoPrecioVigente(
  pv: Pick<PrecioVigenteFicha, "unitario" | "moneda" | "siguiente_salida"> | null | undefined,
  margenPct?: number | null,
): string | null {
  if (!pv) return null;
  const precio = `${CHIP_PRECIO_VIGENTE} ${fmtPrecioUnitario(pv.unitario, pv.moneda)}`;
  const sig = pv.siguiente_salida;
  // El API manda el objeto siempre; sin precio calculable, solo el vigente.
  if (!sig || numeroONulo(sig.venta_unitaria) == null) return precio;
  const venta = fmtPrecioUnitario(sig.venta_unitaria, sig.moneda ?? pv.moneda);
  switch (sig.origen as OrigenVenta) {
    case "PRECIO_PRODUCTO":
    case "PRECIO_CAPTURADO":
      return `${precio} · la siguiente salida se cobra a su precio de venta ${venta}`;
    case "A_COSTO":
      return `${precio} · la siguiente salida se cobra a costo (${venta}, sin utilidad)`;
    default:
      return `${precio} · la siguiente salida se cobra a ${venta} (+${pctTxt(margenParaTexto(margenPct))} %)`;
  }
}

// ───────────────────────── Tablas ─────────────────────────

/** Sub del T.C. de una COMPRA: «T.C. 17.0115» · «T.C. 17.51 (captura en pesos)». */
export function subTcCompra(
  moneda: MonedaInventario | string | null | undefined,
  tc: number | string | null | undefined,
): string | null {
  const t = textoTc(tc);
  if (!t) return null;
  return moneda === "MXN" ? `${t} (captura en pesos)` : t;
}

/** Aviso de una fila en dólares que sigue sin T.C. (solo filas sin migrar). */
export const SUB_SIN_TC = "sin T.C. · no se cuenta en pesos";

/**
 * «+ $49,749.90 MXN cargados a costo (30 cuarto (qt))». Sin la cantidad del
 * API (versión previa) se dicen las SALIDAS, no unidades inventadas.
 */
export function textoCargadoACosto(
  mxn: number | null | undefined,
  opts: { unidades?: number | null; salidas?: number; unidad?: string | null },
): string | null {
  const m = numeroONulo(mxn);
  if (m == null) return null;
  const u = numeroONulo(opts.unidades);
  const cuantas =
    u != null
      ? cantidadConUnidad(u, opts.unidad)
      : opts.salidas != null
        ? `${opts.salidas} ${opts.salidas === 1 ? "salida" : "salidas"}`
        : null;
  return `+ ${textoMonto(m, "MXN", { signo: false })} cargados a costo${cuantas ? ` (${cuantas})` : ""}`;
}

/** «utilidad +$1,084.24 MXN». */
export function textoUtilidadVenta(v: number, moneda: MonedaInventario): string {
  return `utilidad ${textoMonto(v, moneda)}`;
}

/**
 * «bajo el mínimo (mín. 30)» — el ÚNICO rastro de la tira de KPIs que se
 * conserva: al quitar «Stock actual» (que se pintaba ámbar) la ficha ya no
 * avisaba de un faltante, y es la señal de reorden.
 */
export function textoBajoMinimo(
  bajoStock: boolean | null | undefined,
  minimo: number | string | null | undefined,
): string | null {
  if (!bajoStock) return null;
  const m = numeroONulo(minimo);
  return m != null
    ? `bajo el mínimo (mín. ${m.toLocaleString("es-MX", { maximumFractionDigits: 3 })})`
    : "bajo el mínimo";
}

// ───────────────────────── Dinero generado ─────────────────────────

export const TITULO_DINERO = "Dinero generado por este producto";
export const SIN_VENTAS = "Todavía no se ha vendido este producto.";

/** Monto en negritas de la línea: «$16,263.61 MXN» / «+$3,252.72 MXN». */
export interface PiezaDinero {
  etiqueta: string;
  monto: string;
  tono: "positivo" | "negativo" | "neutro";
}

/** Renglón destacado: «Vendido $16,263.61 MXN · Utilidad +$3,252.72 MXN». */
export function piezasDineroGenerado(d: Pick<DineroGenerado, "vendido_mxn" | "utilidad_mxn">): PiezaDinero[] {
  const vendido = numeroONulo(d.vendido_mxn);
  if (vendido == null) return [];
  const piezas: PiezaDinero[] = [
    { etiqueta: "Vendido", monto: textoMonto(vendido, "MXN", { signo: false }), tono: "neutro" },
  ];
  const u = numeroONulo(d.utilidad_mxn);
  if (u != null) {
    const c = Math.round(u * 100);
    piezas.push({
      etiqueta: "Utilidad",
      monto: textoMonto(u, "MXN"),
      tono: c > 0 ? "positivo" : c < 0 ? "negativo" : "neutro",
    });
  }
  return piezas;
}

/** DINERO_LINEA en texto plano («Vendido $… · Utilidad +$…»). */
export function textoDineroGenerado(d: Pick<DineroGenerado, "vendido_mxn" | "utilidad_mxn">): string {
  const p = piezasDineroGenerado(d);
  return p.length === 0 ? SIN_VENTAS : p.map((x) => `${x.etiqueta} ${x.monto}`).join(" · ");
}

/**
 * «En dólares: vendido $956.25 USD · utilidad +$191.25 USD (al T.C. de cada
 * venta)» — dato SECUNDARIO, jamás sumado a los pesos. Sin ventas
 * dólar-sobre-dólar: null.
 */
export function lineaUsdOriginal(
  vendidoUsd: number | null | undefined,
  utilidadUsd: number | null | undefined,
): string | null {
  const v = numeroONulo(vendidoUsd);
  const u = numeroONulo(utilidadUsd);
  if (v == null && u == null) return null;
  const partes: string[] = [];
  if (v != null) partes.push(`vendido ${textoMonto(v, "USD", { signo: false })}`);
  if (u != null) partes.push(`utilidad ${textoMonto(u, "USD")}`);
  return `En dólares: ${partes.join(" · ")} (al T.C. de cada venta)`;
}

/** «Además se cargaron $49,749.90 MXN a costo (30 cuarto (qt), sin utilidad).» */
export function textoDineroACosto(
  mxn: number | null | undefined,
  unidades: number | null | undefined,
  unidad?: string | null,
): string | null {
  const m = numeroONulo(mxn);
  if (m == null) return null;
  const u = numeroONulo(unidades);
  const cuantas = u != null ? `${cantidadConUnidad(u, unidad)}, sin utilidad` : "sin utilidad";
  return `Además se cargaron ${textoMonto(m, "MXN", { signo: false })} a costo (${cuantas}).`;
}

/** Respaldo: utilidad que solo existe en dólares (filas sin T.C.). */
export function textoUtilidadUsdSinTc(v: number | null | undefined): string | null {
  const n = numeroONulo(v);
  if (n == null) return null;
  return `Utilidad en ventas sin tipo de cambio: ${textoMonto(n, "USD")} (en dólares, no se suma a los pesos).`;
}

/**
 * «Dinero generado» con un API PREVIO (sin el bloque): se arma con los
 * totales de siempre, SIN sumar monedas — los dólares de las ventas sin T.C.
 * van en su propio renglón.
 */
export function dineroGeneradoDeTotales(t: {
  ventas_mxn: number | null;
  costo_ventas_mxn: number | null;
  utilidad_mxn: number | null;
  ventas_cant: number | null;
  ventas_a_costo_mxn: number | null;
  utilidad_usd?: number | null;
  ventas_sin_utilidad?: number;
}): DineroGenerado {
  return {
    vendido_mxn: numeroONulo(t.ventas_mxn),
    costo_mxn: numeroONulo(t.costo_ventas_mxn),
    utilidad_mxn: numeroONulo(t.utilidad_mxn),
    vendido_usd_original: null,
    utilidad_usd_original: null,
    unidades_vendidas: numeroONulo(t.ventas_cant),
    cargado_a_costo_mxn: numeroONulo(t.ventas_a_costo_mxn),
    unidades_a_costo: null,
    ventas_sin_utilidad: numeroONulo(t.ventas_sin_utilidad) ?? 0,
    utilidad_usd_sin_tc: numeroONulo(t.utilidad_usd),
  };
}

// ───────────────────────── Avisos y notas ─────────────────────────

/**
 * Banda naranja: SOLO si algún movimiento SIGUE sin T.C. (antes de la
 * migración de datos, o un día sin T.C. oficial). No afirma la causa: entre
 * el deploy del API y la migración, «no había T.C. oficial» sería falso.
 */
export function textoBandaSinTc(n: number | null | undefined): string | null {
  const k = numeroONulo(n) ?? 0;
  if (k <= 0) return null;
  return `${k} ${k === 1 ? "movimiento" : "movimientos"} en dólares todavía no ${
    k === 1 ? "tiene" : "tienen"
  } tipo de cambio: sus pesos quedan fuera de los totales (su utilidad se ve en dólares, aparte).`;
}

/** Banda de compras a $0 (se conserva) + el enlace que abre el cardex plegado. */
export const AVISO_COMPRAS_SIN_COSTO =
  "Hay compras sin costo ($0): la utilidad se ve inflada hasta que se complete el costo real de esas entradas.";
export const ENLACE_ABRIR_CARDEX = "Abrir el cardex para corregir el costo";

/**
 * Con un API PREVIO (sin `movimientos_sin_tc`) la banda de siempre, sin
 * afirmar la causa.
 */
export const BANDA_SIN_TC_API_PREVIO =
  "Hay movimientos capturados en dólares sin tipo de cambio: sus pesos quedan fuera de los totales (su utilidad se ve en dólares, aparte).";

/**
 * Nota al pie con un API PREVIO (sin `regla_costo`): ahí el costo SÍ era
 * FIFO y las ventas en dólares sin T.C. no se convertían — el texto viejo es
 * el único que dice la verdad sobre esos números.
 */
export const NOTA_FICHA_API_PREVIO =
  "Montos en pesos, salvo los marcados USD (movimientos en dólares sin tipo de cambio). Utilidad = " +
  "precio de venta al avión − costo FIFO de lo que salió; pesos y dólares nunca se suman.";

/** NOTA_FICHA (con la regla nueva). */
export function notaFicha(margenPct?: number | null): string {
  return (
    "Montos en pesos. Las compras y ventas en dólares se convierten con el tipo de cambio oficial " +
    "de su día (el mismo de las cotizaciones). Utilidad = lo cobrado al avión − el costo de la pieza " +
    "(último precio de compra vigente el día de la salida). Toda salida sin precio se cobra a ese costo " +
    `+ ${pctTxt(margenParaTexto(margenPct))} % (se cambia en Configuración).`
  );
}

// ───────────────────────── Plegables ─────────────────────────

export const PLEGABLE_EMPAQUES = "Empaques y fotos";
export const PLEGABLE_CARDEX = "Cardex completo";
/** Ids (y anclas `#…`) de los plegables de la ficha. */
export const ID_PLEGABLE_EMPAQUES = "empaques-fotos";
export const ID_PLEGABLE_CARDEX = "cardex";

/** «2 empaques · 3 fotos» / «Sin empaques · 1 foto». */
export function resumenPlegableEmpaques(empaques: number, fotos: number): string {
  const e =
    empaques > 0 ? `${empaques} ${empaques === 1 ? "empaque" : "empaques"}` : "Sin empaques";
  const f = fotos > 0 ? `${fotos} ${fotos === 1 ? "foto" : "fotos"}` : "sin fotos";
  return `${e} · ${f}`;
}

/** «14 movimientos · aquí se corrige un costo o se elimina un movimiento». */
export function resumenPlegableCardex(movimientos: number): string {
  const n = Math.max(0, movimientos || 0);
  return `${n} ${n === 1 ? "movimiento" : "movimientos"} · aquí se corrige un costo o se elimina un movimiento`;
}

/**
 * ¿El `location.hash` apunta a este plegable? (`#cardex` abre el cardex
 * aunque el enlace esté en la MISMA página: por eso el componente escucha
 * también `hashchange`, no solo el montaje).
 */
export function abrePorHash(hash: string | null | undefined, id: string): boolean {
  const h = (hash ?? "").replace(/^#/, "");
  if (!h) return false;
  try {
    return decodeURIComponent(h) === id;
  } catch {
    return h === id;
  }
}

// ───────────────────────── «Editar costo» (D7) ─────────────────────────

export const TITULO_EDITAR_COSTO = "Corregir el costo de la compra";
export const HINT_TC_OPCIONAL =
  "Vacío = T.C. oficial del día de la compra (el mismo de las cotizaciones).";
export const NOTA_TC_USD = "Se convierte con el T.C. oficial del día de la compra.";
/**
 * El T.C. tecleado SOLO viaja si su campo estaba a la vista: captura en PESOS
 * de una entrada/devolución/ajuste. En dólares el campo se oculta y la nota
 * promete «el T.C. oficial del día de la compra» — pero el API da prioridad a
 * un T.C. que llegue en el cuerpo, así que un valor que quedó de haber
 * tecleado en pesos y luego cambiar a USD se colaría en silencio. En una
 * SALIDA el API usa siempre el oficial del día de la venta. "" = no viaja.
 */
export function tcQueViaja(p: {
  tipo?: string | null;
  moneda?: string | null;
  tc: string | null | undefined;
}): string {
  return p.tipo !== "SALIDA" && p.moneda === "MXN" ? (p.tc ?? "") : "";
}

export const TOAST_COSTO_ACTUALIZADO =
  "Costo actualizado · el valorizado y las siguientes salidas ya usan este precio";
export const BOTON_CONFIRMAR_COSTO = "Guardar de todos modos";

/** AVISO_EDITAR_COSTO. */
export function avisoEditarCosto(n: number): string {
  return (
    `Este precio ya se usó en ${n} ${n === 1 ? "salida" : "salidas"}: conservan su costo y lo que se ` +
    "cobró al avión. El precio nuevo aplica a la existencia y a las siguientes salidas. Si alguna " +
    "salida se cobró mal, elimínala y vuelve a capturarla."
  );
}

/** AVISO_EDITAR_COSTO_SIN_CARGO (renglón propio, en rojo). */
export function avisoEditarCostoSinCargo(m: number): string | null {
  if (!(m > 0)) return null;
  return (
    `${m} de esas salidas ${m === 1 ? "salió" : "salieron"} a costo $0 y NO se ` +
    `${m === 1 ? "cobró" : "cobraron"} al avión: completar este costo no ${m === 1 ? "la cobra" : "las cobra"}. ` +
    `Para ${m === 1 ? "cobrarla, elimínala" : "cobrarlas, elimínalas"} y vuelve a capturarla${m === 1 ? "" : "s"}.`
  );
}

/** Código del 409 del API cuando la compra ya se usó y no se confirmó. */
export const CODIGO_ENTRADA_CON_SALIDAS = "ENTRADA_CON_SALIDAS";

export interface ConfirmacionCosto {
  /** Cuántas salidas se cobraron con este precio. */
  n: number;
  /** Cuántas de ellas salieron SIN cargo ($0). */
  sinCargo: number;
  /** La lista del API (solo tras el 409); [] = solo los conteos del detalle. */
  salidas: SalidaDependiente[];
}

/**
 * Primer «Guardar»: con salidas que ya usaron este precio NO se envía —
 * se muestra el recuadro (el operador lo lee antes). Confirmado, se envía con
 * `confirmar_salidas: true`.
 */
export function decidirGuardarCosto(p: {
  salidasConEstePrecio?: number | null;
  salidasSinCargo?: number | null;
  confirmado: boolean;
}): { tipo: "ENVIAR"; confirmar: boolean } | { tipo: "CONFIRMAR"; confirmacion: ConfirmacionCosto } {
  const n = numeroONulo(p.salidasConEstePrecio) ?? 0;
  if (p.confirmado) return { tipo: "ENVIAR", confirmar: true };
  if (n > 0) {
    return {
      tipo: "CONFIRMAR",
      confirmacion: { n, sinCargo: numeroONulo(p.salidasSinCargo) ?? 0, salidas: [] },
    };
  }
  return { tipo: "ENVIAR", confirmar: false };
}

const esMoneda = (v: unknown): v is MonedaInventario => v === "MXN" || v === "USD";

/** `details.salidas` del 409, validado fila por fila (lo que no cuadre se descarta). */
export function salidasDeConflicto(details: unknown): SalidaDependiente[] {
  const lista = (details as { salidas?: unknown } | null | undefined)?.salidas;
  if (!Array.isArray(lista)) return [];
  const out: SalidaDependiente[] = [];
  for (const raw of lista) {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r.id !== "string" || typeof r.fecha !== "string") continue;
    const cantidad = numeroONulo(r.cantidad);
    const costo = numeroONulo(r.costo_unitario);
    if (cantidad == null || costo == null) continue;
    out.push({
      id: r.id,
      fecha: r.fecha,
      cantidad,
      costo_unitario: costo,
      moneda: esMoneda(r.moneda) ? r.moneda : "USD",
      sin_cargo: r.sin_cargo === true,
      vendido_a: typeof r.vendido_a === "string" && r.vendido_a.trim() ? r.vendido_a : "—",
    });
  }
  return out;
}

/**
 * ¿El fallo es el 409 `ENTRADA_CON_SALIDAS`? Entonces se abre el MISMO
 * recuadro con la lista del API (el dato del detalle estaba viejo).
 */
export function confirmacionDeConflicto(res: {
  status?: number;
  code?: string;
  details?: unknown;
}): ConfirmacionCosto | null {
  if (res.status !== 409 || res.code !== CODIGO_ENTRADA_CON_SALIDAS) return null;
  const salidas = salidasDeConflicto(res.details);
  return {
    n: salidas.length,
    sinCargo: salidas.filter((s) => s.sin_cargo).length,
    salidas,
  };
}

/** «01 sep 2026 · 12 cuarto (qt) · XA-VGV · cobrada a $21.25 USD» / «… · sin cargo». */
export function lineaSalidaDependiente(s: SalidaDependiente, unidad?: string | null): string {
  const destino =
    s.vendido_a === "FLOTA" ? "toda la flota" : s.vendido_a && s.vendido_a !== "—" ? s.vendido_a : null;
  const partes = [fmtDateOnly(s.fecha), cantidadConUnidad(s.cantidad, unidad)];
  if (destino) partes.push(destino);
  partes.push(s.sin_cargo ? "sin cargo ($0)" : `costo ${fmtPrecioUnitario(s.costo_unitario, s.moneda)}`);
  return partes.join(" · ");
}

// ───────────────────────── Aviso de la SALIDA ─────────────────────────

/** Código del aviso del API cuando la salida salió a $0 por falta de compra con costo. */
export const CODIGO_SIN_COSTO_VIGENTE = "SIN_COSTO_VIGENTE";
export const AVISO_SIN_COSTO_VIGENTE =
  "Este producto no tiene ninguna compra con costo: la salida se registró a costo $0 (sin cargo al " +
  "avión). Captura el costo de la compra con «Editar costo».";

/**
 * `aviso` de la respuesta de una salida → texto. Gana el texto que redacta
 * el API (`aviso_mensaje`); si no viene, el del código conocido; un texto
 * suelto del API va tal cual.
 */
export function textoAvisoSalida(
  aviso: string | null | undefined,
  avisoMensaje?: string | null,
): string | null {
  const a = (aviso ?? "").trim();
  if (!a) return null;
  const msg = (avisoMensaje ?? "").trim();
  if (msg) return msg;
  if (a === CODIGO_SIN_COSTO_VIGENTE) return AVISO_SIN_COSTO_VIGENTE;
  // Un código desconocido (MAYÚSCULAS_CON_GUION) no se pinta crudo.
  if (/^[A-Z_]+$/.test(a)) return null;
  return a;
}
