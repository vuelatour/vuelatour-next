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
import { cuentaParaAlta } from "@/lib/admin/cuentas-gasto";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { PESTANAS_COMPRAS, type FiltroCompras } from "@/lib/admin/titulos-pestana";
import {
  fmtMontoMoneda,
  toNum,
  type AgregarGastoCompraInput,
  type CompraConGastoRegistrado,
  type CompraDetalle,
  type CompraGastoEstado,
  type CompraListItem,
  type CompraRol,
  type CompraRolOtro,
  type EntradaDesdeGastoResultado,
  type GastoCandidatoCompra,
  type Numeric,
  type RegistrarGastoCompraInput,
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
  "sin-gasto": "Sin su gasto de mercancía registrado (o con el gasto incompleto).",
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
    descripcion: "Cada compra ya tiene su gasto (registrado o vinculado).",
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
  return `Se crea UN gasto de Refacción${monto ? ` por ${monto}` : ""} (líneas + cargos impresos en la factura), ligado a esta compra como su factura de mercancía. Si ese gasto ya se capturó suelto en Gastos, usa «${BOTON_VINCULAR_GASTO}».`;
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
export const HINT_CANDIDATOS = "Gastos capturados sueltos en Gastos que todavía no pertenecen a ninguna compra (ni son cargos de bodega).";
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

// ===== Los gastos de una compra, uno por uno (4-nov-2026, API 0.0.120, invariante 116 del API) =====
//
// Pedido de la oficina (Pablo Canales, video del 4-nov-2026): el envío de UPS
// «no me deja cambiarlo a pesos, no me deja subir el comprobante y no aparece
// en Gastos». Regla: la compra se queda como contenedor; cada pago (la
// factura de las refacciones, el envío, la aduana…) se registra UNO POR UNO
// como gasto real en Gastos, en su moneda y con su comprobante, y el total
// de la compra es informativo.

/** Qué paga un gasto agregado a la compra (todo menos la mercancía). */
export const ROL_OTRO_GASTO_OPTIONS: ReadonlyArray<{ value: CompraRolOtro; label: string; description: string }> = [
  { value: "ENVIO", label: "Envío (UPS, DHL, FedEx…)", description: "Nace como gasto de Paquetería." },
  { value: "IMPUESTOS", label: "Impuestos / aduana", description: "Nace como gasto «Otros gastos VuelaTour»." },
  { value: "OTRO", label: "Otro cargo", description: "Nace como gasto «Otros gastos VuelaTour»." },
];

export const ETIQUETA_ROL_OTRO_GASTO: Readonly<Record<CompraRolOtro, string>> = {
  ENVIO: "Envío",
  IMPUESTOS: "Impuestos / aduana",
  OTRO: "Otro cargo",
};

/** Los campos que comparten «Registrar gasto», «Agregar gasto» y «Ya la pagué» de Registrar compra. */
export interface FormGastoCompra {
  tc: string;
  fecha: string;
  medio: string;
  tarjeta: string;
  cuenta: string;
  proveedor: string;
  folio: string;
  notas: string;
}

/** «Agregar gasto»: además qué pagó, cuánto y en qué moneda (la de SU factura). */
export interface FormOtroGastoCompra extends FormGastoCompra {
  rol: CompraRolOtro;
  monto: string;
  moneda: "MXN" | "USD";
}

/** El T.C. con el que abre el formulario: el de la compra; si no, el oficial de hoy; si no, vacío. */
export function tcInicialCompra(tcCompra: Numeric | null | undefined, tcOficialHoy: number | null | undefined): string {
  const deCompra = tcCompra == null ? 0 : toNum(tcCompra);
  if (deCompra > 0) return String(deCompra);
  return tcOficialHoy != null && tcOficialHoy > 0 ? String(tcOficialHoy) : "";
}

export function formGastoCompraVacio(p: { tc: string; fecha: string; proveedor?: string; folio?: string }): FormGastoCompra {
  return {
    tc: p.tc,
    fecha: p.fecha,
    medio: "",
    tarjeta: "",
    cuenta: "",
    proveedor: p.proveedor ?? "",
    folio: p.folio ?? "",
    notas: "",
  };
}

/** Arranca como ENVÍO en PESOS: el caso de siempre (UPS cobra en pesos aunque la compra sea en dólares). */
export function formOtroGastoCompraVacio(p: { tc: string; fecha: string }): FormOtroGastoCompra {
  return { ...formGastoCompraVacio(p), rol: "ENVIO", monto: "", moneda: "MXN" };
}

export const MSG_FECHA_PAGO_REQUERIDA = "Captura la fecha del pago.";
export const MSG_MEDIO_REQUERIDO = "Elige el medio de pago";
export const MSG_MONTO_REQUERIDO = "Captura el monto que pagaste (mayor a cero).";

export type VeredictoCuerpo<T> = { ok: true; cuerpo: T } | { ok: false; error: string };

/** «1,850.50» / «1850,50» ⇒ 1850.5 a centavos; nada válido ⇒ null. */
export function montoDeTexto(txt: string | null | undefined): number | null {
  const limpio = String(txt ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!limpio) return null;
  // Con coma Y punto, la coma es de miles; solo coma, es decimal.
  const normal = limpio.includes(".") ? limpio.replace(/,/g, "") : limpio.replace(",", ".");
  const n = Number(normal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Lo común de los tres formularios: T.C. en banda, fecha, medio, tarjeta/cuenta según el medio, proveedor, folio, notas. */
function cuerpoComunGastoCompra(
  f: FormGastoCompra,
  fotoPath: string | null | undefined,
): VeredictoCuerpo<Omit<RegistrarGastoCompraInput, "tc_usd_mxn"> & { tc_usd_mxn: number }> {
  const tc = validarTcCompra(f.tc);
  if (!tc.ok) return { ok: false, error: tc.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { ok: false, error: MSG_FECHA_PAGO_REQUERIDA };
  if (!f.medio) return { ok: false, error: `${MSG_MEDIO_REQUERIDO}.` };
  const cuenta = cuentaParaAlta(f.medio, f.cuenta);
  return {
    ok: true,
    cuerpo: {
      tc_usd_mxn: tc.tc,
      fecha_gasto: f.fecha,
      medio_pago: f.medio,
      ...(f.medio === "TARJETA_CORP" && f.tarjeta ? { tarjeta_terminacion: f.tarjeta } : {}),
      ...(cuenta ? { cuenta_bancaria_id: cuenta } : {}),
      ...(f.proveedor ? { proveedor_id: f.proveedor } : {}),
      ...(f.folio.trim() ? { folio_ticket: f.folio.trim().slice(0, 60) } : {}),
      ...(f.notas.trim() ? { notas: f.notas.trim() } : {}),
      ...(fotoPath ? { foto_url: fotoPath } : {}),
    },
  };
}

/** Lo que viaja a `registrar-gasto` (el monto lo calcula el API). */
export function cuerpoRegistrarGastoCompra(
  f: FormGastoCompra,
  fotoPath?: string | null,
): VeredictoCuerpo<RegistrarGastoCompraInput> {
  return cuerpoComunGastoCompra(f, fotoPath);
}

/** Lo que viaja a `POST /v1/compras/:id/gastos`: el monto y la moneda de SU factura más lo común. */
export function cuerpoAgregarGastoCompra(
  f: FormOtroGastoCompra,
  fotoPath?: string | null,
): VeredictoCuerpo<AgregarGastoCompraInput> {
  const monto = montoDeTexto(f.monto);
  if (monto == null) return { ok: false, error: MSG_MONTO_REQUERIDO };
  const comun = cuerpoComunGastoCompra(f, fotoPath);
  if (!comun.ok) return comun;
  return {
    ok: true,
    cuerpo: { rol: f.rol, monto, moneda: f.moneda === "USD" ? "USD" : "MXN", ...comun.cuerpo },
  };
}

// ===== «Agregar gasto» (el diálogo) =====

export const BOTON_AGREGAR_GASTO = "Agregar gasto";
export const TITULO_BOTON_AGREGAR_GASTO = "El envío, la aduana u otro cargo de esta compra: nace como un gasto más de la compra";

export function tituloAgregarGasto(folio: number): string {
  return `Agregar un gasto a la compra #${folio}`;
}

export const DESCRIPCION_AGREGAR_GASTO =
  "Otro pago de esta compra (el envío, la aduana, otro cargo): se crea como un gasto normal —con su moneda, su comprobante y su cruce con el banco— y queda ligado a la compra. La factura de las refacciones se registra con «Registrar gasto».";
export const ETIQUETA_QUE_PAGASTE = "¿Qué pagaste?";
export const ETIQUETA_MONTO_GASTO = "Monto pagado";
export const ETIQUETA_MONEDA_GASTO = "Moneda";
export const HINT_MONEDA_GASTO = "La de la factura de este pago: UPS cobra en pesos aunque la compra sea en dólares.";
export const ETIQUETA_COMPROBANTE = "Comprobante (foto o PDF)";
export const HINT_COMPROBANTE = "Opcional: queda en el gasto. También se puede subir después desde «Ver / editar».";
export const HINT_PROVEEDOR_OTRO_GASTO = "El de ESTE pago (UPS, el agente aduanal…), no el de las refacciones.";
export const HINT_TC_OTRO_GASTO = "Con él el cargo entra al costo de las refacciones aunque la compra esté en otra moneda.";

export function textoConfirmarAgregarGasto(p: {
  folio: number;
  rol: CompraRolOtro;
  monto: number;
  moneda: string;
  tc: number;
  fecha: string;
  medio: string;
}): string {
  const equivalente = textoEquivalente(p.monto, p.moneda, p.tc);
  return `Se crea un gasto por ${fmtMontoMoneda(p.monto, p.moneda)}${
    equivalente ? ` (${equivalente} al T.C. ${p.tc})` : ""
  } con fecha ${fmtDateOnly(p.fecha)}, pagado por ${medioPagoLabel(p.medio)}, y queda ligado a la compra #${p.folio} como ${ETIQUETA_ROL_OTRO_GASTO[p.rol].toLowerCase()}.`;
}

export function toastGastoAgregado(
  r: Pick<CompraConGastoRegistrado, "folio" | "gasto_registrado" | "tc_compra_fijado">,
  rol: CompraRolOtro,
): string {
  const g = r.gasto_registrado;
  return `Gasto agregado a la compra #${r.folio} por ${fmtMontoMoneda(g.monto, g.moneda)} (${ETIQUETA_ROL_OTRO_GASTO[rol].toLowerCase()}): quedó en «Gastos de compras»${
    r.tc_compra_fijado ? " · el tipo de cambio quedó también en la compra" : ""
  }.`;
}

// ===== La tarjeta «Gastos de esta compra» =====

export const TITULO_GASTOS_COMPRA = "Gastos de esta compra";
export const DESCRIPCION_GASTOS_COMPRA =
  "Cada pago es un gasto con su comprobante y su cruce con el banco: la factura de las refacciones, el envío, la aduana… El total de la compra es informativo.";
export const VACIO_GASTOS_COMPRA =
  "Todavía no hay gastos ligados. «Registrar gasto» crea el de la factura de las refacciones; «Agregar gasto», el envío, la aduana u otro cargo; «Vincular gasto ya registrado», uno capturado suelto en Gastos.";
export const ETIQUETA_SUMA_GASTOS = "Suma de los gastos ligados (por moneda)";
export const ETIQUETA_TOTAL_COMPRA = "Total de la compra (informativo)";
export const TITULO_ABRIR_GASTO = "Ver / editar este gasto (se abre resaltado en Gastos)";

// ===== «Cargos impresos en ESTA factura» (lo que confundió a la oficina) =====

export const TITULO_CARGOS_FACTURA = "Envío e impuestos impresos en ESTA factura";
export function descripcionCargosFactura(moneda: string): string {
  return `Solo los renglones que vienen en la misma factura de las refacciones (Shipping, Tax…), en ${moneda}: suman al gasto de la mercancía y se reparten al costo de cada línea.`;
}
export const AVISO_CARGOS_APARTE =
  "Si el envío o la aduana se pagaron APARTE (otra factura, otro cargo del banco), no van aquí: regístralos con «Agregar gasto».";
export const VACIO_CARGOS_FACTURA = "Sin cargos impresos en la factura.";

/** Etiquetas del resumen (lo calcula el API; aquí solo se nombra). */
export const ETIQUETAS_RESUMEN_COMPRA = {
  mercancia: "Refacciones (líneas)",
  cargosFactura: "Envío e impuestos en la misma factura",
  cargosPagos: "Otros gastos ligados (envío, aduana…)",
  total: "Total de la compra (costo en bodega)",
} as const;

// ===== «Registrar compra»: ¿Y el pago? =====

export type OpcionPagoCompra = "ahora" | "despues" | "vincular";
export const PAGO_COMPRA_DEFAULT: OpcionPagoCompra = "ahora";
export const ETIQUETA_Y_EL_PAGO = "¿Y el pago?";
export const OPCIONES_PAGO_COMPRA: ReadonlyArray<{ value: OpcionPagoCompra; label: string; description: string }> = [
  {
    value: "ahora",
    label: "Ya la pagué: registrar su gasto ahora",
    description:
      "Se crea la compra y, enseguida, su gasto por el total de las líneas, con la fecha, el medio y el comprobante de abajo.",
  },
  {
    value: "despues",
    label: "Todavía no la pago",
    description: "Queda «Pedida, sin recibir» y «Sin gasto registrado»: lo registras desde la compra cuando la pagues.",
  },
  {
    value: "vincular",
    label: "La factura ya está en Gastos: vincularla",
    description: HINT_VINCULAR_GASTO_ENTRADA,
  },
];
export const MSG_LINEAS_SIN_COSTO_PARA_GASTO =
  "Para registrar el gasto ahora captura el costo de las líneas (o elige «Todavía no la pago»).";

/** ¿Alguna línea trae costo > 0? Sin eso el API rechaza el gasto (COMPRA_SIN_MONTO). */
export function lineasConCosto(f: Pick<FormRegistrarCompra, "lineas">): boolean {
  return f.lineas.some((l) => (l.nombre.trim() || l.item_id) && Number(l.costo_unitario) > 0);
}

export function textoConfirmarCompraConGasto(p: {
  lineas: number;
  moneda: string;
  tc: number;
  fecha: string;
  medio: string;
  /** «Ya está en bodega»: las líneas entran al inventario en el mismo paso. */
  recibir?: boolean;
}): string {
  return `Se registra la compra con ${p.lineas} ${p.lineas === 1 ? "línea" : "líneas"} y, enseguida, su gasto de Refacción en ${p.moneda} por el total de la factura (lo calcula el API) al T.C. ${p.tc}, con fecha ${fmtDateOnly(p.fecha)} y pagado por ${medioPagoLabel(p.medio)}.${
    p.recibir ? " Las líneas entran a bodega de inmediato." : ""
  }`;
}

export function toastCompraConGasto(c: Pick<CompraConGastoRegistrado, "folio" | "gasto_registrado">): string {
  const g = c.gasto_registrado;
  return `Compra #${c.folio} registrada y su gasto por ${fmtMontoMoneda(g.monto, g.moneda)} quedó en «Gastos de compras».`;
}

/** La compra nació pero su gasto no: se dice completo (no un toast que desaparece). */
export function avisoCompraSinGasto(folio: number, error: string | null | undefined): string {
  const motivo = (error ?? "").trim();
  return `La compra #${folio} quedó registrada, pero su gasto NO: ${motivo ? `${motivo} ` : ""}Regístralo desde la compra con «Registrar gasto».`;
}

// =============================================================================
// Gastos de compras: apartados de Gastos (6-nov-2026, API 0.0.122, invariante
// 118 del API). Pedido del dueño: «los gastos que se hacen de las compras
// siempre los vamos a mantener independientes, no en Gastos… para la
// conciliación sí debemos ver los gastos de las compras… como lo hicimos con
// la nómina». La lista de Compras enseña TODOS los pagos ligados a una compra
// (`GET /v1/expenses?solo_compras=true`), con enlace a su compra y a «Ver /
// editar» (Gastos enfocado, que en esa vista sí los incluye).
// =============================================================================

export const TITULO_GASTOS_DE_COMPRAS = "Gastos de compras";
export const DESCRIPCION_GASTOS_DE_COMPRAS =
  "Todo lo pagado por las compras de refacciones: la factura de la mercancía, el envío, la aduana. No salen en Gastos (se llevan aquí, como la nómina en su módulo), pero sí cuentan en conciliación, balance y reportes.";
export const VACIO_GASTOS_DE_COMPRAS = "Todavía no hay gastos ligados a una compra.";
export const ETIQUETA_VER_EDITAR_GASTO = "Ver / editar";
export const TITULO_VER_EDITAR_GASTO = "Abre el gasto en Gastos (enfocado) para verificarlo o corregirlo";
export const TEXTO_GASTO_CONCILIADO = "Conciliado";
export const TEXTO_GASTO_SIN_CONCILIAR = "Sin conciliar";
/** Tope de la lista (los más recientes); el API ordena por fecha del gasto. */
export const TOPE_GASTOS_DE_COMPRAS = 100;

/** «Se muestran los 100 más recientes de 123.» (null si caben todos). */
export function avisoTopeGastosDeCompras(mostrados: number, total: number): string | null {
  return total > mostrados ? `Se muestran los ${mostrados} más recientes de ${total}.` : null;
}

/** Qué pagó este gasto dentro de la compra (todos los roles, también la mercancía). */
export const ETIQUETA_ROL_COMPRA: Readonly<Record<CompraRol, string>> = {
  MERCANCIA: "Factura de mercancía",
  ...ETIQUETA_ROL_OTRO_GASTO,
};

export function etiquetaRolCompra(rol: CompraRol | string | null | undefined): string {
  if (!rol) return "—";
  return (ETIQUETA_ROL_COMPRA as Record<string, string>)[rol] ?? rol;
}

// =============================================================================
// «Compra directa» desde Inventario/Tienda (6-nov-2026). Pedido del dueño:
// «un botón para registrar un gasto desde ahí sin que entre a una compra,
// porque se compró directamente». Lo que se compró directo y ya está en
// bodega se captura en UN paso: la compra (sigue siendo el contenedor del
// costo), su gasto (en «Gastos de compras», invariante 118) y la entrada al
// inventario (`POST /compras/:id/recibir`). El mismo diálogo de «Registrar
// compra» con `modo="directa"`: el pago es siempre «ahora» y «Ya está en
// bodega» viene marcado; en Compras el checkbox existe pero nace sin marcar.
// =============================================================================

export type ModoRegistrarCompra = "compras" | "directa";

export const TITULO_COMPRA_DIRECTA = "Compra directa";
export const TITULO_BOTON_COMPRA_DIRECTA =
  "Compraste refacciones y ya las tienes: en un paso quedan la compra, su gasto y la entrada a bodega (sin entrar a Compras)";
export const DESCRIPCION_COMPRA_DIRECTA =
  "Para lo que se compró directo y ya está aquí: captura qué compraste y cómo lo pagaste. Quedan registrados la compra, su gasto (en «Gastos de compras») y la entrada al inventario, sin pasar por Compras.";
export const ETIQUETA_COMO_SE_PAGO = "¿Cómo se pagó?";
export const ETIQUETA_RECIBIR_AHORA = "Ya está en bodega: dar entrada al inventario ahora";
export const HINT_RECIBIR_AHORA =
  "Las unidades de cada línea entran al stock con su costo. Si todavía no llega, déjalo sin marcar y recíbela desde Compras cuando llegue.";
export const BOTON_COMPRA_DIRECTA = "Registrar compra directa";

export function recibirAhoraDefault(modo: ModoRegistrarCompra): boolean {
  return modo === "directa";
}

export function tituloRegistrarCompra(modo: ModoRegistrarCompra): string {
  return modo === "directa" ? TITULO_COMPRA_DIRECTA : TITULO_REGISTRAR_COMPRA;
}

export function descripcionRegistrarCompra(modo: ModoRegistrarCompra): string {
  return modo === "directa" ? DESCRIPCION_COMPRA_DIRECTA : DESCRIPCION_REGISTRAR_COMPRA;
}

/** El texto del botón que registra, según lo que va a pasar. */
export function etiquetaBotonRegistrarCompra(p: { modo: ModoRegistrarCompra; conGasto: boolean; recibir: boolean }): string {
  if (p.modo === "directa") return BOTON_COMPRA_DIRECTA;
  if (p.conGasto && p.recibir) return "Registrar compra, su gasto y la entrada";
  if (p.conGasto) return "Registrar compra y su gasto";
  if (p.recibir) return "Registrar compra y recibirla";
  return TITULO_REGISTRAR_COMPRA;
}

/** Todo salió: compra, gasto y entrada (un solo toast). */
export function toastCompraDirecta(c: Pick<CompraConGastoRegistrado, "folio" | "gasto_registrado">, lineas: number): string {
  const g = c.gasto_registrado;
  return `Compra directa #${c.folio} registrada: gasto por ${fmtMontoMoneda(g.monto, g.moneda)} y ${lineas} ${lineas === 1 ? "línea ya está" : "líneas ya están"} en el inventario.`;
}

/** Compra (y gasto) registrados, pero la entrada a bodega falló: se dice completo. */
export function avisoCompraSinRecepcion(folio: number, error: string | null | undefined): string {
  const motivo = (error ?? "").trim();
  return `La compra #${folio} quedó registrada, pero NO entró a bodega: ${motivo ? `${motivo} ` : ""}Recíbela desde Compras con «Ya llegó: recibir en bodega».`;
}

/** Compra recibida en el mismo paso (sin gasto: «Todavía no la pago»). */
export function toastCompraRecibida(folio: number, lineas: number): string {
  return `Compra #${folio} registrada y recibida: ${lineas} ${lineas === 1 ? "línea ya está" : "líneas ya están"} en el inventario.`;
}
