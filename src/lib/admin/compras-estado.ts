/**
 * COMPRAS: el flujo que se ve (21-oct-2026, API 0.0.102, invariante 101 del
 * API). Pedido del cliente: «mejorar el módulo para que se haga el registro
 * de la compra y compras abiertas (muy confuso y difícil de entender) y el
 * estatus de si ya llegó y agregó al inventario para mapear todo el flujo. Y
 * que no se registre la compra en gastos hasta que le den en un botón de
 * "Registrar gasto" y les pida poner sí o sí el tipo de cambio».
 *
 * FUENTE ÚNICA (PURA, prueba `__tests__/compras-estado.test.ts`) de: las
 * pestañas de la lista y qué compra cae en cada una, las etiquetas de
 * RECEPCIÓN («Pedida, sin recibir» / «Recibida en bodega · fecha») y de
 * GASTO («Sin gasto registrado» / «Gasto registrado · $X» / «Gasto parcial»),
 * la línea de pasos del detalle con la acción que sigue, y los textos y la
 * validación del T.C. de «Registrar gasto» (espejo de la banda del API). El
 * panel NO calcula estados ni totales: pinta `gasto_estado`, `total_factura`
 * y compañía tal como los manda el API.
 */
import { fmtDateOnly, isoToCancunInput } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { PESTANAS_COMPRAS, type FiltroCompras } from "@/lib/admin/titulos-pestana";
import {
  fmtMontoMoneda,
  toNum,
  type CompraConGastoRegistrado,
  type CompraDetalle,
  type CompraGastoEstado,
  type CompraListItem,
  type EntradaDesdeGastoResultado,
  type GastoCandidatoCompra,
} from "@/types/compras";

export { PESTANAS_COMPRAS, type FiltroCompras };

// ===== Pestañas de la lista =====

export const FILTRO_COMPRAS_DEFAULT: FiltroCompras = "por-recibir";
export const ORDEN_PESTANAS_COMPRAS: readonly FiltroCompras[] = ["por-recibir", "sin-gasto", "completas", "todas"];

/** `?f=` de la URL: lo que no es una pestaña cae al default (jamás un 400). */
export function filtroComprasDeUrl(f: string | undefined): FiltroCompras {
  return f === "sin-gasto" || f === "completas" || f === "todas" ? f : FILTRO_COMPRAS_DEFAULT;
}

export function hrefPestanaCompras(f: FiltroCompras): string {
  return f === FILTRO_COMPRAS_DEFAULT ? "/admin/inventory/compras" : `/admin/inventory/compras?f=${f}`;
}

/** La cabecera: el flujo en una línea. */
export const AYUDA_FLUJO_COMPRAS =
  "Registra la compra cuando la pides, recíbela en bodega cuando llega y registra (o vincula) su gasto cuando la pagas: cada compra dice qué le falta.";

export const AYUDA_PESTANA_COMPRAS: Readonly<Record<FiltroCompras, string>> = {
  "por-recibir": "Pedidas y todavía sin recibir en bodega.",
  "sin-gasto": "Sin su gasto de mercancía en Gastos (o con el gasto incompleto).",
  completas: "Recibidas en bodega y con su gasto registrado.",
  todas: "Todas las compras.",
};

export const VACIO_PESTANA_COMPRAS: Readonly<Record<FiltroCompras, { titulo: string; descripcion: string }>> = {
  "por-recibir": {
    titulo: "Nada por recibir",
    descripcion: "Todo lo pedido ya está en bodega. Cuando pidas refacciones, pulsa «Registrar compra».",
  },
  "sin-gasto": {
    titulo: "Todas las compras tienen su gasto",
    descripcion: "Cada compra ya está en Gastos (registrado o vinculado).",
  },
  completas: {
    titulo: "Sin compras completas",
    descripcion: "Una compra está completa cuando ya se recibió en bodega y tiene su gasto registrado.",
  },
  todas: {
    titulo: "Sin compras",
    descripcion: "Aquí verás las compras de refacciones con su recepción en bodega y su gasto.",
  },
};

// ===== Recepción y gasto (badges) =====

export type TonoEstado = "verde" | "ambar" | "rojo" | "gris";

export interface RecepcionCompra {
  estado: "PEDIDA" | "RECIBIDA";
  etiqueta: string;
  tono: TonoEstado;
}

export const ETIQUETA_PEDIDA = "Pedida, sin recibir";
export const ETIQUETA_RECIBIDA = "Recibida en bodega";

/** Día Cancún de un instante ISO; una fecha ilegible no pinta nada. */
function diaDe(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const local = isoToCancunInput(iso);
  return local ? local.slice(0, 10) : null;
}

export function recepcionDe(c: Pick<CompraListItem, "estado" | "recibida_at">): RecepcionCompra {
  if (c.estado === "RECIBIDA") {
    const dia = diaDe(c.recibida_at);
    return {
      estado: "RECIBIDA",
      etiqueta: dia ? `${ETIQUETA_RECIBIDA} · ${fmtDateOnly(dia)}` : ETIQUETA_RECIBIDA,
      tono: "verde",
    };
  }
  return { estado: "PEDIDA", etiqueta: ETIQUETA_PEDIDA, tono: "ambar" };
}

export interface GastoCompra {
  estado: CompraGastoEstado | "DESCONOCIDO";
  etiqueta: string;
  tono: TonoEstado;
}

export const ETIQUETA_SIN_GASTO = "Sin gasto registrado";
export const ETIQUETA_GASTO_REGISTRADO = "Gasto registrado";
export const ETIQUETA_GASTO_PARCIAL = "Gasto parcial";
export const DETALLE_FALTA_MERCANCIA = "falta la factura de mercancía";

/**
 * Qué dice la compra de su gasto. Con un API previo (sin `gasto_estado`) no se
 * inventa: «N pagos ligados» / «Sin pagos», en gris.
 */
export function gastoDe(
  c: Pick<CompraListItem, "gasto_estado" | "gasto_mercancia" | "gasto_faltante" | "moneda" | "n_pagos">,
): GastoCompra {
  const estado = c.gasto_estado;
  if (!estado) {
    return {
      estado: "DESCONOCIDO",
      etiqueta: c.n_pagos > 0 ? `${c.n_pagos} ${c.n_pagos === 1 ? "pago ligado" : "pagos ligados"}` : "Sin pagos",
      tono: "gris",
    };
  }
  if (estado === "SIN_GASTO") return { estado, etiqueta: ETIQUETA_SIN_GASTO, tono: "rojo" };
  const mercancia = c.gasto_mercancia == null ? null : toNum(c.gasto_mercancia);
  if (estado === "REGISTRADO") {
    return {
      estado,
      etiqueta:
        mercancia != null && mercancia > 0
          ? `${ETIQUETA_GASTO_REGISTRADO} · ${fmtMontoMoneda(mercancia, c.moneda)}`
          : ETIQUETA_GASTO_REGISTRADO,
      tono: "verde",
    };
  }
  const faltante = c.gasto_faltante == null ? null : toNum(c.gasto_faltante);
  return {
    estado,
    etiqueta:
      mercancia != null && mercancia > 0 && faltante != null && faltante > 0
        ? `${ETIQUETA_GASTO_PARCIAL} · faltan ${fmtMontoMoneda(faltante, c.moneda)}`
        : `${ETIQUETA_GASTO_PARCIAL} · ${DETALLE_FALTA_MERCANCIA}`,
    tono: "ambar",
  };
}

export const ETIQUETA_SIN_LINEAS = "Sin líneas";
export const TITULO_SIN_LINEAS = "La compra no tiene refacciones capturadas: agrégalas en su detalle o elimínala.";

export function esSinLineas(c: Pick<CompraListItem, "n_lineas">): boolean {
  return c.n_lineas === 0;
}

/** Solo una compra ABIERTA y sin líneas se elimina desde la lista (el API rechaza las recibidas). */
export function puedeEliminarDesdeLista(c: Pick<CompraListItem, "estado" | "n_lineas">): boolean {
  return c.estado === "ABIERTA" && c.n_lineas === 0;
}

export function textoConfirmarEliminarCompra(c: Pick<CompraListItem, "folio" | "n_pagos">): string {
  const pagos =
    c.n_pagos > 0
      ? ` Sus ${c.n_pagos} ${c.n_pagos === 1 ? "pago ligado NO se borra: vuelve" : "pagos ligados NO se borran: vuelven"} a ser ${c.n_pagos === 1 ? "un gasto suelto" : "gastos sueltos"} en Gastos.`
      : "";
  return `Se borra la compra #${c.folio} (no tiene líneas ni entradas en bodega).${pagos}`;
}

export function estaCompleta(c: Pick<CompraListItem, "estado" | "gasto_estado">): boolean {
  return c.estado === "RECIBIDA" && c.gasto_estado === "REGISTRADO";
}

export function perteneceAPestana(
  c: Pick<CompraListItem, "estado" | "gasto_estado">,
  f: FiltroCompras,
): boolean {
  switch (f) {
    case "por-recibir":
      return c.estado === "ABIERTA";
    case "sin-gasto":
      // Sin el dato (API previo) no se afirma que falte el gasto.
      return c.gasto_estado != null && c.gasto_estado !== "REGISTRADO";
    case "completas":
      return estaCompleta(c);
    default:
      return true;
  }
}

export function filtrarComprasPorPestana<T extends Pick<CompraListItem, "estado" | "gasto_estado">>(
  compras: readonly T[],
  f: FiltroCompras,
): T[] {
  return compras.filter((c) => perteneceAPestana(c, f));
}

export function contarPestanasCompras(
  compras: readonly Pick<CompraListItem, "estado" | "gasto_estado">[],
): Record<FiltroCompras, number> {
  const out = { "por-recibir": 0, "sin-gasto": 0, completas: 0, todas: 0 };
  for (const c of compras) {
    for (const f of ORDEN_PESTANAS_COMPRAS) if (perteneceAPestana(c, f)) out[f] += 1;
  }
  return out;
}

// ===== La línea de pasos del detalle =====

export type EstadoPaso = "hecho" | "pendiente" | "atencion";
export type ClavePaso = "registrada" | "recibida" | "gasto";

export interface PasoCompra {
  clave: ClavePaso;
  titulo: string;
  estado: EstadoPaso;
  detalle: string;
}

export const TITULO_PASOS: Readonly<Record<ClavePaso, string>> = {
  registrada: "Registrada",
  recibida: "Recibida en bodega",
  gasto: "Gasto registrado",
};

type CompraParaPasos = Pick<CompraDetalle, "estado" | "fecha" | "recibida_at" | "moneda"> & {
  lineas: readonly unknown[];
  pagos: readonly unknown[];
  resumen: Pick<CompraDetalle["resumen"], "total_factura" | "gasto_estado" | "gasto_mercancia" | "gasto_faltante">;
};

export function pasosCompra(c: CompraParaPasos): PasoCompra[] {
  const n = c.lineas.length;
  const totalFactura = c.resumen.total_factura == null ? null : toNum(c.resumen.total_factura);
  const registrada: PasoCompra =
    n === 0
      ? {
          clave: "registrada",
          titulo: TITULO_PASOS.registrada,
          estado: "atencion",
          detalle: `Registrada el ${fmtDateOnly(c.fecha)} · sin líneas: agrega las refacciones que pediste.`,
        }
      : {
          clave: "registrada",
          titulo: TITULO_PASOS.registrada,
          estado: "hecho",
          detalle: `Registrada el ${fmtDateOnly(c.fecha)} · ${n} ${n === 1 ? "línea" : "líneas"}${
            totalFactura != null ? ` · factura ${fmtMontoMoneda(totalFactura, c.moneda)}` : ""
          }`,
        };
  const recepcion = recepcionDe(c);
  const recibida: PasoCompra =
    recepcion.estado === "RECIBIDA"
      ? { clave: "recibida", titulo: TITULO_PASOS.recibida, estado: "hecho", detalle: recepcion.etiqueta }
      : {
          clave: "recibida",
          titulo: TITULO_PASOS.recibida,
          estado: "pendiente",
          detalle: `${ETIQUETA_PEDIDA}: cuando llegue, pulsa «${ETIQUETA_ACCION.recibir}».`,
        };
  const g = gastoDe({ ...c.resumen, moneda: c.moneda, n_pagos: c.pagos.length });
  const gasto: PasoCompra =
    g.estado === "REGISTRADO"
      ? { clave: "gasto", titulo: TITULO_PASOS.gasto, estado: "hecho", detalle: g.etiqueta }
      : g.estado === "PARCIAL"
        ? { clave: "gasto", titulo: TITULO_PASOS.gasto, estado: "atencion", detalle: g.etiqueta }
        : {
            clave: "gasto",
            titulo: TITULO_PASOS.gasto,
            estado: "pendiente",
            detalle: `${g.estado === "SIN_GASTO" ? ETIQUETA_SIN_GASTO : g.etiqueta}: pulsa «${ETIQUETA_ACCION.gasto}» o vincula uno que ya esté en Gastos.`,
          };
  return [registrada, recibida, gasto];
}

export type AccionCompra = "lineas" | "recibir" | "gasto";

export const ETIQUETA_ACCION: Readonly<Record<AccionCompra, string>> = {
  lineas: "Agregar las líneas",
  recibir: "Ya llegó: recibir en bodega",
  gasto: "Registrar gasto",
};

/** El primer paso que no está hecho (en el orden del flujo); null = completa. */
export function accionSiguiente(pasos: readonly PasoCompra[]): AccionCompra | null {
  for (const p of pasos) {
    if (p.estado === "hecho") continue;
    if (p.clave === "registrada") return "lineas";
    if (p.clave === "recibida") return "recibir";
    return "gasto";
  }
  return null;
}

export const TEXTO_COMPRA_COMPLETA = "Compra completa: en bodega y con su gasto registrado.";

// ===== «Registrar gasto» =====

/** Espejo de la banda del API (`compra-gasto.util.ts`): fuera de ella casi siempre es un dedo de más. */
export const TC_COMPRA_MIN = 15;
export const TC_COMPRA_MAX = 25;

export const MSG_TC_REQUERIDO =
  "Captura el tipo de cambio (pesos por dólar): es obligatorio para registrar el gasto de una compra.";

export function mensajeTcFueraDeRango(tc: number): string {
  return `El tipo de cambio ${tc} está fuera del rango razonable (${TC_COMPRA_MIN} a ${TC_COMPRA_MAX} pesos por dólar): revisa la captura.`;
}

/** El T.C. tecleado: obligatorio, numérico y en banda (mismos textos que el API). */
export function validarTcCompra(txt: string | null | undefined): { ok: true; tc: number } | { ok: false; error: string } {
  const limpio = String(txt ?? "").trim().replace(",", ".");
  const tc = limpio === "" ? NaN : Number(limpio);
  if (!Number.isFinite(tc) || tc <= 0) return { ok: false, error: MSG_TC_REQUERIDO };
  if (tc < TC_COMPRA_MIN || tc > TC_COMPRA_MAX) return { ok: false, error: mensajeTcFueraDeRango(tc) };
  return { ok: true, tc };
}

export const BOTON_REGISTRAR_GASTO = "Registrar gasto";
export const BOTON_VINCULAR_GASTO = "Vincular gasto ya registrado";

export function tituloRegistrarGasto(folio: number): string {
  return `Registrar el gasto de la compra #${folio}`;
}

/** Qué va a pasar, con el monto que calculó el API (líneas + cargos de la factura). */
export function descripcionRegistrarGasto(c: {
  moneda: string;
  resumen: Pick<CompraDetalle["resumen"], "total_factura">;
}): string {
  const monto = c.resumen.total_factura == null ? null : fmtMontoMoneda(c.resumen.total_factura, c.moneda);
  return `Se crea en Gastos UN gasto de Refacción${monto ? ` por ${monto}` : ""} (líneas + cargos impresos en la factura), ligado a esta compra como su factura de mercancía. Si ese gasto ya existe en Gastos, usa «${BOTON_VINCULAR_GASTO}».`;
}

export const ETIQUETA_TC_COMPRA = "Tipo de cambio (MXN por USD)";
export const HINT_TC_COMPRA =
  "Obligatorio, también en pesos: con él la factura se convierte para el balance y la bodega.";

/** «Sugerido: el oficial de hoy, 18.2345» o nada. */
export function hintTcSugerido(tcOficial: number | null | undefined): string {
  return tcOficial != null && tcOficial > 0
    ? `${HINT_TC_COMPRA} Sugerido: el oficial de hoy, ${tcOficial}.`
    : HINT_TC_COMPRA;
}

export const ETIQUETA_FECHA_PAGO_COMPRA = "Fecha del pago";
export const HINT_FECHA_PAGO_COMPRA = "Esa queda como fecha del gasto. Una fecha futura lo deja «por pagar».";
export const ETIQUETA_FOLIO_COMPRA = "Folio / factura del proveedor";
export const HINT_FOLIO_COMPRA = "Candado anti-duplicados: si ya hay un gasto con este folio, el API lo rechaza (vincúlalo en vez de registrarlo).";

/**
 * El equivalente INFORMATIVO en la otra moneda con el T.C. tecleado («≈
 * $13,194.50»); el número que vale es el que guarda el API.
 */
export function textoEquivalente(monto: number, moneda: string, tc: number | null): string | null {
  if (tc == null || !(tc > 0) || !(monto > 0)) return null;
  return moneda === "USD" ? `≈ ${fmtMxn(monto * tc)}` : `≈ ${fmtUsd(monto / tc)} USD`;
}

export function textoConfirmarRegistrarGasto(p: {
  folio: number;
  monto: number;
  moneda: string;
  tc: number;
  fecha: string;
  medio: string;
}): string {
  const equivalente = textoEquivalente(p.monto, p.moneda, p.tc);
  return `Se crea un gasto de Refacción por ${fmtMontoMoneda(p.monto, p.moneda)}${
    equivalente ? ` (${equivalente} al T.C. ${p.tc})` : ""
  } con fecha ${fmtDateOnly(p.fecha)}, pagado por ${medioPagoLabel(p.medio)}, y queda ligado a la compra #${p.folio} como su factura de mercancía.`;
}

export function toastGastoRegistrado(r: Pick<CompraConGastoRegistrado, "folio" | "gasto_registrado" | "tc_compra_fijado">): string {
  const g = r.gasto_registrado;
  return `Gasto registrado por ${fmtMontoMoneda(g.monto, g.moneda)} y ligado a la compra #${r.folio}${
    r.tc_compra_fijado ? " · el tipo de cambio quedó también en la compra" : ""
  }.`;
}

/** 409 `COMPRA_GASTO_YA_REGISTRADO` del API: se dice y se recarga. */
export const CODIGO_GASTO_YA_REGISTRADO = "COMPRA_GASTO_YA_REGISTRADO";

// ===== «Vincular gasto ya registrado» (selector de candidatos) =====

export const PLACEHOLDER_BUSCAR_CANDIDATO = "Buscar por proveedor, folio, notas o monto…";
export const HINT_CANDIDATOS = "Gastos en Gastos que todavía no pertenecen a ninguna compra (ni son cargos de bodega).";
export const TEXTO_SIN_CANDIDATOS = "Ningún gasto coincide en esas fechas. Amplía el rango o registra el gasto desde la compra.";
export const TEXTO_CANDIDATOS_TRUNCADOS = "Hay más gastos de los que se pueden mostrar: acota las fechas o busca por texto.";

/** «02 oct 2026 · Refacción · USD 722.90» con lo demás debajo. */
export function lineaCandidato(g: GastoCandidatoCompra): { titulo: string; detalle: string } {
  return {
    titulo: `${fmtDateOnly(g.fecha_gasto)} · ${categoriaGastoLabel(g.categoria)} · ${fmtMontoMoneda(g.monto, g.moneda)}`,
    detalle: [
      g.proveedor?.nombre ?? null,
      g.descripcion,
      g.folio_ticket ? `Folio ${g.folio_ticket}` : null,
      g.medio_pago ? medioPagoLabel(g.medio_pago) : null,
      g.conciliado ? "Conciliado con el banco" : null,
    ]
      .filter((x): x is string => !!x)
      .join(" · "),
  };
}

// ===== Entrada de inventario vinculada a un gasto =====

export const ETIQUETA_VINCULAR_GASTO_ENTRADA = "Vincular con un gasto ya registrado (opcional)";
export const HINT_VINCULAR_GASTO_ENTRADA =
  "Si la factura ya está en Gastos, elígela: la entrada se registra como compra recibida con ese gasto como su costo.";
export const OPCION_SIN_GASTO_ENTRADA = "Sin vincular (captura el costo abajo)";

/** Con un gasto elegido el costo no se teclea: lo reparte el API. */
export function textoCostoDesdeGasto(g: Pick<GastoCandidatoCompra, "monto" | "moneda">): string {
  return `El costo lo da el gasto: ${fmtMontoMoneda(g.monto, g.moneda)} entre las unidades que entran (lo reparte el API al recibir la compra).`;
}

export function toastEntradaDesdeGasto(r: EntradaDesdeGastoResultado): {
  tipo: "success" | "warning";
  titulo: string;
  descripcion?: string;
} {
  if (r.recibida) {
    return {
      tipo: r.avisos.length > 0 ? "warning" : "success",
      titulo: `Entrada registrada: compra #${r.compra.folio} recibida con su gasto vinculado.`,
      descripcion: r.avisos.length > 0 ? r.avisos.join(" ") : undefined,
    };
  }
  return {
    tipo: "warning",
    titulo: `La compra #${r.compra.folio} quedó registrada con el gasto, pero la pieza NO entró a bodega.`,
    descripcion: r.avisos.join(" "),
  };
}

// ===== «Registrar compra» =====

export const TITULO_REGISTRAR_COMPRA = "Registrar compra";
export const DESCRIPCION_REGISTRAR_COMPRA =
  "El pedido o la factura del proveedor: queda «Pedida, sin recibir». Cuando llegue la recibes en bodega y, cuando la pagues, registras (o vinculas) su gasto.";
export const HINT_TC_COMPRA_OPCIONAL =
  "Opcional al registrar; obligatorio al recibir en pesos y al registrar el gasto.";
export const HINT_LINEAS_COMPRA = "Lo que pediste, con su costo de factura unitario (en la moneda de la compra). Puedes completarlas después en el detalle.";

export interface LineaCompraForm {
  key: string;
  item_id: string;
  nombre: string;
  numero_parte: string;
  cantidad: string;
  costo_unitario: string;
}

export interface FormRegistrarCompra {
  proveedor_id: string;
  fecha: string;
  referencia: string;
  moneda: "USD" | "MXN";
  tc_usd_mxn: string;
  notas: string;
  lineas: LineaCompraForm[];
  /** Gasto ya registrado que paga esta compra (opcional). */
  gasto_mercancia_id: string;
}

export function lineaCompraVacia(key: string): LineaCompraForm {
  return { key, item_id: "", nombre: "", numero_parte: "", cantidad: "1", costo_unitario: "" };
}

export function formRegistrarCompraVacio(hoy: string): FormRegistrarCompra {
  return {
    proveedor_id: "",
    fecha: hoy,
    referencia: "",
    moneda: "USD",
    tc_usd_mxn: "",
    notas: "",
    lineas: [lineaCompraVacia("l-1")],
    gasto_mercancia_id: "",
  };
}

export type VeredictoRegistrarCompra =
  | {
      ok: true;
      cuerpo: {
        proveedor_id?: string;
        fecha: string;
        referencia?: string;
        moneda: "USD" | "MXN";
        tc_usd_mxn?: number;
        notas?: string;
        lineas: Array<{ item_id?: string; nombre: string; numero_parte?: string; cantidad: number; costo_unitario: number }>;
        gasto_mercancia_id?: string;
      };
    }
  | { ok: false; error: string };

/**
 * Lo que viaja a `POST /v1/compras` (sin cadenas vacías): las líneas en
 * blanco se descartan; una línea con nombre exige unidades > 0 y costo ≥ 0.
 */
export function cuerpoRegistrarCompra(f: FormRegistrarCompra): VeredictoRegistrarCompra {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { ok: false, error: "Captura la fecha de la compra." };
  const tcTxt = f.tc_usd_mxn.trim();
  const tc = tcTxt === "" ? undefined : Number(tcTxt.replace(",", "."));
  if (tc !== undefined && !(tc > 0)) return { ok: false, error: "El tipo de cambio debe ser mayor a cero (o déjalo vacío)." };
  const lineas: NonNullable<Extract<VeredictoRegistrarCompra, { ok: true }>["cuerpo"]["lineas"]> = [];
  for (const [i, l] of f.lineas.entries()) {
    const nombre = l.nombre.trim();
    const vacia = !nombre && !l.item_id && l.costo_unitario.trim() === "";
    if (vacia) continue;
    if (!nombre && !l.item_id) return { ok: false, error: `Línea ${i + 1}: elige el artículo o escribe su nombre.` };
    const cantidad = Number(l.cantidad);
    if (!(cantidad > 0)) return { ok: false, error: `Línea ${i + 1}: captura cuántas unidades pediste (mayor a 0).` };
    const costo = l.costo_unitario.trim() === "" ? NaN : Number(l.costo_unitario);
    if (!Number.isFinite(costo) || costo < 0) return { ok: false, error: `Línea ${i + 1}: captura el costo unitario de factura (0 si no lo sabes aún).` };
    lineas.push({
      ...(l.item_id ? { item_id: l.item_id } : {}),
      nombre: nombre || "Refacción",
      ...(l.numero_parte.trim() ? { numero_parte: l.numero_parte.trim() } : {}),
      cantidad,
      costo_unitario: Math.round(costo * 10000) / 10000,
    });
  }
  return {
    ok: true,
    cuerpo: {
      ...(f.proveedor_id ? { proveedor_id: f.proveedor_id } : {}),
      fecha: f.fecha,
      ...(f.referencia.trim() ? { referencia: f.referencia.trim().slice(0, 120) } : {}),
      moneda: f.moneda,
      ...(tc !== undefined ? { tc_usd_mxn: tc } : {}),
      ...(f.notas.trim() ? { notas: f.notas.trim() } : {}),
      lineas,
      ...(f.gasto_mercancia_id ? { gasto_mercancia_id: f.gasto_mercancia_id } : {}),
    },
  };
}

export function toastCompraRegistrada(c: Pick<CompraDetalle, "folio" | "lineas">): string {
  return c.lineas.length === 0
    ? `Compra #${c.folio} registrada (pedida, sin recibir) · agrega sus líneas en el detalle.`
    : `Compra #${c.folio} registrada: pedida, sin recibir.`;
}
