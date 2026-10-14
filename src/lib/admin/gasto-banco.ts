/**
 * «CONCILIACIÓN AL REVÉS» de un gasto (13-oct-2026, API 0.0.75). Módulo PURO
 * (sin React ni red; prueba `__tests__/gasto-banco.test.ts`): FUENTE ÚNICA de
 * roles, textos, fichas y URLs de la hoja «Conciliación con el banco» que
 * abre el badge de la columna «Banco» de Gastos (y de Compras). Ningún
 * componente redacta estas frases.
 *
 * Pedido de la oficina: desde el gasto, ver CON QUÉ cargo del banco se
 * concilió, de qué cuenta y de qué estado de cuenta (para descargarlo), y si
 * no se concilió, por qué y dónde buscarlo. Los datos los arma el API
 * (`GET /v1/conciliacion/gastos/:id`, lector único de la puente): aquí JAMÁS
 * se suma ni se recalcula — suma, faltante, aporte (`monto_parte`),
 * diferencia del lote y T.C. (el GUARDADO en el gasto) vienen del API.
 */

import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { diaMas } from "@/lib/admin/conciliacion-auto";
import { estadoBancoGasto, type EstadoBancoInfo, type GastoParaBanco } from "@/lib/admin/conciliacion-estado";
import { etiquetaFolioComprobante } from "@/lib/admin/conciliacion-folio";
import {
  MSG_GASTO_INVALIDO,
  VENTANA_CARGO_DIAS,
  esRutaInexistente,
  lineaGastoLote,
  type LineaGastoLote,
} from "@/lib/admin/conciliacion-lote";
import { ETIQUETA_INCLUIR_NO_BANCARIOS, esMedioNoBancario } from "@/lib/admin/conciliacion-no-bancario";
import { fmtMontoConciliacion, numeroDe } from "@/lib/admin/conciliacion-parcial";
import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { esDiaValido } from "@/lib/admin/url-params";
import { fmtDate, fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { fmtTc } from "@/lib/format";
import type { CargoDeGasto, ConciliacionDeGasto } from "@/types/conciliacion";

// ───────────────────────────── Roles ─────────────────────────────

/** Espejo de `ROLES_CONCILIACION` del API (= el menú «Conciliación»). */
export const ROLES_DETALLE_BANCO_GASTO = ["ADMIN", "FACTURACION"] as const;

/**
 * ¿Se ofrece el clic del badge? Sin rol conocido (`/me` falló) SÍ: es la
 * convención de `gasto-acciones.ts` — el API es el candado y su 403 tiene
 * texto. Con rol, solo ADMIN y FACTURACION.
 */
export function puedeVerDetalleBancoGasto(rol: string | null | undefined): boolean {
  if (rol == null || rol === "") return true;
  return (ROLES_DETALLE_BANCO_GASTO as readonly string[]).includes(rol);
}

// ───────────────────────────── Textos fijos ─────────────────────────────

export const TITULO_HOJA_BANCO = "Conciliación con el banco";
export const TEXTO_CARGANDO_BANCO = "Buscando el cargo en los estados de cuenta…";
export const TEXTO_ESTADO_CAMBIO =
  "El estado cambió desde que abriste la página: recarga para ver la lista al día.";
export const BOTON_RECARGAR = "Recargar";
export const BOTON_REINTENTAR_BANCO = "Reintentar";
export const NOTA_ESPEJO = "Detalle simplificado: la base de datos todavía no tiene la conciliación por partes.";
export const BOTON_VER_EN_CONCILIACION = "Ver en Conciliación";
export const TITULO_VER_EN_CONCILIACION = "Abre Conciliación en otra pestaña con este cargo primero y resaltado";
export const TITULO_DESCARGAR_ESTADO_CUENTA =
  "Descarga el archivo original del banco (el enlace se genera al hacer clic y vence en 1 hora)";
export const TEXTO_DESCARGANDO = "Abriendo…";
export const TEXTO_NO_ABRIO_PESTANA = "El navegador no abrió la pestaña";
export const ACCION_DESCARGAR = "Descargar";
export const TITULO_REGISTRO_LIGA =
  "Quién hizo la liga: a mano, o quien importó el estado de cuenta o capturó el gasto cuando el sistema la cruzó solo.";
export const TEXTO_LIGA_ANTERIOR = "Liga anterior al 2 oct 2026: el sistema todavía no guardaba quién la hizo.";
export const TITULO_QUE_HACER = "¿Qué hacer?";
export const INTRO_SIN_CONCILIAR =
  "Se cruza solo al importar el estado de cuenta, cuando el monto y la fecha coinciden (hasta 3 días de diferencia). Si no se cruzó, revisa:";
export const CAUSAS_SIN_CONCILIAR = [
  "Que el estado de cuenta de esas fechas ya esté importado.",
  "Que el banco no haya cobrado otro monto u otra fecha (propina, comisión, cargo días después).",
  "Que un solo cargo no pague varios gastos (se vincula en Conciliación como un lote).",
  "Que el cargo no esté ligado a OTRO gasto (posible duplicado): ábrelo con «Ver los cargos ya conciliados».",
  "Que no se haya pagado con otra tarjeta o cuenta.",
] as const;
export const NOTA_USD_PAGADO_EN_PESOS =
  "La compra está en dólares: si se pagó desde una cuenta en pesos, el cargo aparece en pesos; búscalo por la fecha.";
export const INTRO_PARCIAL =
  "Si el resto se pagó en otro cargo del banco, búscalo en Conciliación y vincúlalo a este gasto desde ese cargo.";
export const NOTA_NO_BANCARIO_PARCIAL = `Al vincular el cargo que falta, enciende «${ETIQUETA_INCLUIR_NO_BANCARIOS}» y escribe la razón.`;
export const NOTA_CRUZAR_PENDIENTES =
  "Si el estado de cuenta de ese periodo ya está importado, prueba «Cruzar pendientes» en Conciliación.";
export const BOTON_BUSCAR_CARGO = "Buscar el cargo en Conciliación";
export const BOTON_BUSCAR_FALTANTE = "Buscar el cargo que falta en Conciliación";
export const BOTON_VER_YA_CONCILIADOS = "Ver los cargos ya conciliados de esas fechas";
export const MSG_DETALLE_BANCO_API_VIEJO =
  "El servidor todavía no tiene este detalle (falta actualizar el API). Mientras, búscalo en Conciliación.";
export const MSG_DETALLE_BANCO_SIN_PERMISO = "Solo Administración y Facturación ven el detalle del banco.";
export const MSG_GASTO_YA_NO_EXISTE = "Ese gasto ya no existe: recarga la página.";
export const MSG_SESION_EXPIRO = "Tu sesión expiró. Recarga la página e inicia sesión.";
export const MSG_DETALLE_BANCO_FALLO = "No se pudo cargar el detalle del banco. Vuelve a intentarlo.";
export const MSG_ESTADO_CUENTA_NO_EXISTE = "El archivo del estado de cuenta ya no existe.";
export const MSG_ESTADO_CUENTA_FALLO = "No se pudo generar la descarga del estado de cuenta. Vuelve a intentarlo.";
export const TITULO_EXCEL_GASTOS_CON_BANCO =
  "Exporta con los filtros de la pantalla. Administración y Facturación reciben además el número de factura, el cargo del banco y el estado de cuenta de cada gasto (pestaña «Cargos del banco»).";
export const TEXTO_LOTE_SIN_DETALLE =
  "No se pudo leer el detalle de los otros gastos que paga el cargo; vuelve a abrir esta ventana.";

/** «Ver los cargos ya conciliados»: ±7 días (hoy, a lo más ~222 movimientos). */
export const VENTANA_YA_CONCILIADOS_DIAS = 7;
/** Margen del cruce automático (± días entre el gasto y el cargo). */
const MARGEN_CRUCE_DIAS = 3;

// ───────────────────────────── La fila ─────────────────────────────

/** Lo que la hoja sabe del gasto ANTES de que conteste el API (fila de Gastos o pago de Compras). */
export type GastoBancoFila = GastoParaBanco & {
  id: string;
  categoria?: string | null;
  fecha_gasto?: string | null;
  tarjeta_terminacion?: string | null;
  vuelo?: { folio: string | number | null } | null;
};

const fmt = (v: unknown, moneda?: string | null) => fmtMontoConciliacion(v, moneda ?? null);

/**
 * Nombre accesible del badge-botón: EMPIEZA con el texto visible (WCAG
 * 2.5.3): «Conciliado: ver la conciliación con el banco del gasto de
 * $2,801.40 del 28 sep 2026».
 */
export function etiquetaBotonBanco(
  e: Pick<EstadoBancoInfo, "label">,
  g: { monto: string | number; moneda?: string | null; fecha_gasto?: string | null },
): string {
  const fecha = g.fecha_gasto ? fmtDateOnly(g.fecha_gasto) : null;
  return `${e.label}: ver la conciliación con el banco del gasto de ${fmt(g.monto, g.moneda)}${fecha ? ` del ${fecha}` : ""}`;
}

/** «Operaciones · $2,801.40 · 28 sep 2026 · vuelo #345 · Factura A-0411» (sin vacíos). */
export function descripcionHojaBanco(
  g: {
    categoria?: string | null;
    monto: string | number;
    moneda?: string | null;
    fecha_gasto?: string | null;
    vuelo_folio?: number | null;
    vuelo?: { folio: string | number | null } | null;
    folio_comprobante?: string | null;
  } | null | undefined,
): string {
  if (!g) return "";
  const folio = g.vuelo_folio ?? g.vuelo?.folio ?? null;
  return [
    g.categoria ? categoriaGastoLabel(g.categoria) : null,
    fmt(g.monto, g.moneda),
    g.fecha_gasto ? fmtDateOnly(g.fecha_gasto) : null,
    folio != null && folio !== "" ? `vuelo #${folio}` : null,
    etiquetaFolioComprobante(g.folio_comprobante),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** «Pagado con: Transferencia» / «Pagado con: Tarjeta corporativa ****4929». */
export function lineaPagoGasto(
  g: { medio_pago?: string | null; tarjeta_terminacion?: string | null } | null | undefined,
): string | null {
  const medio = g?.medio_pago ?? "";
  if (!medio) return null;
  const tarjeta = medio === "TARJETA_CORP" && g?.tarjeta_terminacion ? ` ****${g.tarjeta_terminacion}` : "";
  return `Pagado con: ${medioPagoLabel(medio)}${tarjeta}`;
}

// ───────────────────────────── Resumen del estado ─────────────────────────────

export type TonoEstadoBanco = "ok" | "aviso" | "pendiente" | "neutro";

/**
 * Una frase del estado, con su tono (9 ramas). El cruzado va ANTES que «N
 * cargos»: en un cruzado la vista dice `suma` 0 por definición y jamás se
 * escribe «suman $0.00».
 */
export function resumenEstadoBanco(r: ConciliacionDeGasto): { texto: string; tono: TonoEstadoBanco } {
  const g = r.gasto;
  const cargos = Array.isArray(r.cargos) ? r.cargos : [];
  const medio = g.medio_pago ? medioPagoLabel(g.medio_pago) : "sin medio de pago";
  if (r.estado === "NO_APLICA") {
    return { texto: "Este pago no se concilia con el banco (efectivo, personal o bodega).", tono: "neutro" };
  }
  if (r.estado === "SIN_CONCILIAR") {
    return { texto: `Sin conciliar: ningún cargo del banco está ligado a este pago (${medio}).`, tono: "pendiente" };
  }
  if (r.estado === "PARCIAL") {
    if (!r.vista) return { texto: "Pago parcial: los cargos ligados no cubren el gasto.", tono: "aviso" };
    return {
      texto: `Pago parcial: los cargos ligados suman ${fmt(r.vista.suma, g.moneda)}; faltan ${fmt(
        r.vista.faltante,
        g.moneda,
      )} de ${fmt(g.monto, g.moneda)}.`,
      tono: "aviso",
    };
  }
  // CONCILIADO
  if (cargos.length === 0) {
    return { texto: "Marcado como conciliado, pero no tiene ningún cargo del banco ligado.", tono: "aviso" };
  }
  const cruzado = cargos.find((c) => c.parte?.cruzada === true);
  if (cruzado) {
    const monedaCargo = cruzado.parte?.moneda ?? cruzado.moneda ?? "otra moneda";
    return { texto: `Conciliado: compra en ${g.moneda} pagada con un cargo en ${monedaCargo}.`, tono: "ok" };
  }
  if (esMedioNoBancario(g.medio_pago)) {
    return {
      texto: `Conciliado con justificación: se pagó fuera del banco (${medio}) y se ligó a un cargo sin cambiar su medio de pago.`,
      tono: "ok",
    };
  }
  if (cargos.length === 1 && cargos[0].lote) {
    const otros = Math.max(1, Number(cargos[0].lote.gastos_n) - 1);
    return {
      texto: `Conciliado: lo paga un cargo del banco junto con ${otros} ${otros === 1 ? "gasto más" : "gastos más"}.`,
      tono: "ok",
    };
  }
  if (cargos.length === 1) return { texto: "Conciliado con 1 cargo del banco.", tono: "ok" };
  if (!r.vista) return { texto: `Conciliado con ${cargos.length} cargos del banco.`, tono: "ok" };
  return {
    texto: `Conciliado con ${cargos.length} cargos del banco: suman ${fmt(r.vista.suma, g.moneda)} de ${fmt(
      g.monto,
      g.moneda,
    )}.`,
    tono: "ok",
  };
}

// ───────────────────────────── Ficha de cada cargo ─────────────────────────────

/** Etiqueta del botón de descarga según el formato del archivo. */
export function etiquetaDescargaEstadoCuenta(formato: string | null | undefined): string {
  const f = (formato ?? "").trim().toLowerCase();
  if (f === "pdf") return "Descargar estado de cuenta (PDF)";
  if (f === "xlsx" || f === "xls") return "Descargar estado de cuenta (Excel)";
  if (f === "csv") return "Descargar estado de cuenta (CSV)";
  return "Descargar estado de cuenta";
}

export type ArchivoDeCargo =
  | { tipo: "ARCHIVO"; nombre: string; detalle: string; estadoCuentaId: string; etiquetaDescarga: string }
  | { tipo: "SIN_ARCHIVO"; texto: string }
  | { tipo: "NO_LEIDO"; texto: string };

export interface LineaLoteHoja extends LineaGastoLote {
  /** Es ESTE gasto (va sin enlace y con «(este gasto)»). */
  esEste: boolean;
}

export interface LoteHoja {
  /** «4 gastos · suman $11,205.60». */
  titulo: string;
  lineas: LineaLoteHoja[];
  /** «Diferencia con el cargo: $0.02 (el banco cobró de más; ningún gasto se ajusta).» */
  diferencia: string | null;
  /** El API no pudo leer los otros gastos del lote. */
  sinDetalle: string | null;
}

export interface FichaCargoGasto {
  key: string;
  /** «Cargo del 30 sep 2026». */
  titulo: string;
  /** «$11,205.60». */
  monto: string;
  /** «EJE SCOTIA · Scotiabank (MXN)» (+ « · pasarela de pago»). */
  cuenta: string | null;
  /** «Leyenda del banco: «…» · Ref. …» o «Sin leyenda del banco». */
  leyenda: string;
  /** Lo que el cargo aporta a ESTE gasto (null si no hay nada que decir). */
  aporte: string | null;
  lote: LoteHoja | null;
  justificacion: string | null;
  notas: string | null;
  archivo: ArchivoDeCargo;
  /** «Registró la liga: …» o la nota de las ligas anteriores al 2-oct-2026. */
  registro: string | null;
  /** «Ver en Conciliación»: la fila PRIMERO y resaltada. */
  href: string;
}

/** «Ver en Conciliación»: cuenta + día del cargo, `mov` y `gasto` — SIN `mvq` (la búsqueda es difusa). */
export function hrefCargoEnConciliacion(
  c: Pick<CargoDeGasto, "movimiento_id" | "fecha"> & { cuenta?: { id?: string | null } | null },
  gastoId: string,
): string {
  return hrefConciliacion({
    cuenta: c.cuenta?.id ?? null,
    desde: c.fecha,
    hasta: c.fecha,
    mov: c.movimiento_id,
    gasto: gastoId,
  });
}

/** El archivo del que salió el cargo o, si no hay, el motivo REAL (por origen y día Cancún). */
function archivoDeCargo(c: CargoDeGasto): ArchivoDeCargo {
  const ec = c.estado_cuenta;
  if (ec && ec.id) {
    const detalle = [
      `Importado el ${fmtDateTime(ec.importado_at)}${ec.importado_por ? ` por ${ec.importado_por}` : ""}`,
      c.orden_archivo != null ? `línea ${c.orden_archivo} del archivo` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      tipo: "ARCHIVO",
      nombre: ec.filename,
      detalle,
      estadoCuentaId: ec.id,
      etiquetaDescarga: etiquetaDescargaEstadoCuenta(ec.formato),
    };
  }
  const cuando = c.creado_at ? ` el ${fmtDate(c.creado_at)}` : "";
  const quien = c.creado_por ? ` por ${c.creado_por}` : "";
  if (c.sin_archivo === "IMPORTADO_SIN_ARCHIVO") {
    return {
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este cargo se importó${cuando}${quien} sin el archivo original del banco.`,
    };
  }
  if (c.sin_archivo === "CAPTURA_MANUAL") {
    return {
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo: este cargo se capturó a mano${cuando}${quien}; no viene de un estado de cuenta.`,
    };
  }
  return { tipo: "NO_LEIDO", texto: "Estado de cuenta archivado (no se pudo leer su detalle)." };
}

/** El lote del cargo con TODAS sus líneas (la de este gasto marcada). */
function loteDeCargo(c: CargoDeGasto, gastoId: string): LoteHoja | null {
  const l = c.lote;
  if (!l) return null;
  const n = Math.max(Number(l.gastos_n) || 0, Array.isArray(l.gastos) ? l.gastos.length : 0);
  const moneda = c.parte?.moneda ?? c.moneda ?? null;
  const dif = l.gastos_diferencia != null ? numeroDe(l.gastos_diferencia) : 0;
  return {
    titulo: `${n} gastos${l.gastos_suma != null ? ` · suman ${fmt(l.gastos_suma, moneda)}` : ""}`,
    lineas: (Array.isArray(l.gastos) ? l.gastos : []).filter(Boolean).map((g, i) => ({
      ...lineaGastoLote(g, i),
      esEste: (g.id ?? "").toLowerCase() === gastoId.toLowerCase(),
    })),
    diferencia:
      Math.abs(dif) >= 0.005
        ? `Diferencia con el cargo: ${fmt(Math.abs(dif), moneda)} (el banco cobró ${dif > 0 ? "de más" : "de menos"}; ningún gasto se ajusta).`
        : null,
    sinDetalle: l.gastos === null ? TEXTO_LOTE_SIN_DETALLE : null,
  };
}

/**
 * La tarjeta de UN cargo: fecha y monto, cuenta (pasarela), leyenda y
 * referencia del banco, lo que aporta a este gasto, el lote completo, la
 * justificación de un no bancario, las notas, el estado de cuenta (o por qué
 * no hay archivo), quién registró la liga y «Ver en Conciliación».
 */
export function fichaCargoGasto(c: CargoDeGasto, r: ConciliacionDeGasto): FichaCargoGasto {
  const g = r.gasto;
  const cuenta = c.cuenta
    ? `${c.cuenta.alias} · ${c.cuenta.banco} (${c.cuenta.moneda})${c.cuenta.tipo === "PASARELA" ? " · pasarela de pago" : ""}`
    : null;
  const desc = (c.descripcion ?? "").trim();
  const ref = (c.referencia ?? "").trim();
  const leyenda = `${desc ? `Leyenda del banco: «${desc}»` : "Sin leyenda del banco"}${ref ? ` · Ref. ${ref}` : ""}`;
  const parte = c.parte;
  const varios = (Array.isArray(r.cargos) ? r.cargos.length : 0) > 1;
  let aporte: string | null = null;
  if (parte?.cruzada) {
    const tc = fmtTc(g.tc_gasto);
    aporte = `Compra de ${fmt(g.monto, g.moneda)} pagada con este cargo de ${fmt(c.monto, c.moneda)} · ${
      tc ? `T.C. ${tc} (el guardado en el gasto)` : "el gasto no tiene el T.C. guardado"
    }`;
  } else if (c.lote) {
    aporte = `Este cargo paga ${c.lote.gastos_n} gastos; a este le tocan ${fmt(parte?.monto_parte, parte?.moneda)}.`;
  } else if (varios) {
    aporte = `Este cargo aporta ${fmt(parte?.monto_parte, parte?.moneda)} de ${fmt(g.monto, g.moneda)}.`;
  } else if (parte && Math.abs(numeroDe(parte.monto_parte) - numeroDe(g.monto)) >= 0.005) {
    aporte = `Este cargo cubre ${fmt(parte.monto_parte, parte.moneda)} de ${fmt(g.monto, g.moneda)}.`;
  }
  const j = c.justificacion;
  const reg = parte?.registro ?? null;
  return {
    key: c.movimiento_id,
    titulo: `Cargo del ${fmtDateOnly(c.fecha)}`,
    monto: fmt(c.monto, c.moneda),
    cuenta,
    leyenda,
    aporte,
    lote: loteDeCargo(c, g.id),
    justificacion: j
      ? `Ligado con justificación (pago en ${j.medio}): «${j.razon}» — ${j.firmante}${j.fecha ? `, ${j.fecha}` : ""}.`
      : null,
    notas: c.notas_oficina ? `Notas del cargo: ${c.notas_oficina}` : null,
    archivo: archivoDeCargo(c),
    registro: reg
      ? `Registró la liga: ${reg.por ?? "sin usuario"} · ${fmtDateTime(reg.at)}`
      : r.fuente === "PUENTE"
        ? TEXTO_LIGA_ANTERIOR
        : null,
    href: hrefCargoEnConciliacion(c, g.id),
  };
}

// ───────────────────────────── «¿Qué hacer?» ─────────────────────────────

/** «2801.4», «564», «8939.38»: el monto como lo escribe la búsqueda de la tabla. */
export function montoParaBusquedaTabla(n: number | string | null | undefined): string {
  return String(Math.round(numeroDe(n) * 100) / 100);
}

/**
 * «Buscar el cargo en Conciliación»: pendientes de ±30 días con el monto ya
 * escrito en el buscador (`?mvq=`; en un PARCIAL, lo que falta y la cuenta de
 * sus cargos). Un gasto en dólares va SIN monto (el cargo viene en pesos).
 */
export function hrefBuscarCargoEnConciliacion(
  g: { fecha_gasto?: string | null; monto: string | number; moneda?: string | null },
  opts: { faltante?: number | string | null; cuenta?: string | null } = {},
): string {
  const dia = esDiaValido(g.fecha_gasto) ? (g.fecha_gasto as string) : null;
  const monto = opts.faltante != null && numeroDe(opts.faltante) > 0 ? opts.faltante : g.monto;
  return hrefConciliacion({
    f: "pendientes",
    cuenta: opts.cuenta ?? null,
    desde: dia ? diaMas(dia, -VENTANA_CARGO_DIAS) : null,
    hasta: dia ? diaMas(dia, VENTANA_CARGO_DIAS) : null,
    buscar: g.moneda === "MXN" ? montoParaBusquedaTabla(monto) : null,
  });
}

/** «Ver los cargos ya conciliados de esas fechas»: ±7 días con el monto (si sale ligado a OTRO gasto, es un posible duplicado). */
export function hrefVerYaConciliados(g: {
  fecha_gasto?: string | null;
  monto: string | number;
  moneda?: string | null;
}): string {
  const dia = esDiaValido(g.fecha_gasto) ? (g.fecha_gasto as string) : null;
  return hrefConciliacion({
    f: "conciliados",
    desde: dia ? diaMas(dia, -VENTANA_YA_CONCILIADOS_DIAS) : null,
    hasta: dia ? diaMas(dia, VENTANA_YA_CONCILIADOS_DIAS) : null,
    buscar: g.moneda === "MXN" ? montoParaBusquedaTabla(g.monto) : null,
  });
}

export interface EnlaceHoja {
  etiqueta: string;
  href: string;
  titulo: string;
}

export interface AccionesPendiente {
  intro: string;
  causas: string[];
  extraUsd: string | null;
  notaNoBancario: string | null;
  buscar: EnlaceHoja;
  conciliados: EnlaceHoja;
}

/** La única cuenta de una lista (por id), o null si son 0 o varias. */
function cuentaUnica(ids: readonly (string | null | undefined)[]): string | null {
  const unicas = [...new Set(ids.filter((x): x is string => !!x))];
  return unicas.length === 1 ? unicas[0] : null;
}

/**
 * El bloque «¿Qué hacer?» de un gasto SIN_CONCILIAR, PARCIAL o conciliado
 * sin cargos: causas posibles, la nota del USD, los dos enlaces (pendientes
 * ±30 días con el monto; conciliados ±7 días) y, en un no bancario parcial,
 * cómo vincular el cargo que falta. null en cualquier otro caso.
 */
export function accionesPendiente(r: ConciliacionDeGasto): AccionesPendiente | null {
  const g = r.gasto;
  const cargos = Array.isArray(r.cargos) ? r.cargos : [];
  const parcial = r.estado === "PARCIAL";
  const aplica = r.estado === "SIN_CONCILIAR" || parcial || (r.estado === "CONCILIADO" && cargos.length === 0);
  if (!aplica) return null;
  const cuentaPaywise =
    g.medio_pago === "PAYWISE"
      ? cuentaUnica((r.ultimos_movimientos ?? []).filter((u) => u?.cuenta?.tipo === "PASARELA").map((u) => u.cuenta.id))
      : null;
  const cuenta = parcial ? cuentaUnica(cargos.map((c) => c.cuenta?.id)) : cuentaPaywise;
  const faltante = parcial ? (r.vista?.faltante ?? null) : null;
  const dia = g.fecha_gasto && esDiaValido(g.fecha_gasto) ? fmtDateOnly(g.fecha_gasto) : null;
  const mxn = g.moneda === "MXN";
  const montoBusqueda = faltante != null && numeroDe(faltante) > 0 ? faltante : g.monto;
  const filtroBuscar = mxn ? `, filtrados por ${fmt(montoBusqueda, g.moneda)}` : "";
  const filtroConciliados = mxn ? `, filtrados por ${fmt(g.monto, g.moneda)}` : "";
  return {
    intro: parcial ? INTRO_PARCIAL : INTRO_SIN_CONCILIAR,
    causas: parcial ? [] : [...CAUSAS_SIN_CONCILIAR],
    extraUsd: g.moneda && g.moneda !== "MXN" ? NOTA_USD_PAGADO_EN_PESOS : null,
    notaNoBancario: parcial && esMedioNoBancario(g.medio_pago) ? NOTA_NO_BANCARIO_PARCIAL : null,
    buscar: {
      etiqueta: parcial ? BOTON_BUSCAR_FALTANTE : BOTON_BUSCAR_CARGO,
      href: hrefBuscarCargoEnConciliacion(g, { faltante, cuenta }),
      titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
        dia ? ` del ${dia}` : ""
      }${filtroBuscar}.${mxn ? " Borra la búsqueda si el cargo trae otro monto (propina, comisión o varios gastos)." : ""}`,
    },
    conciliados: {
      etiqueta: BOTON_VER_YA_CONCILIADOS,
      href: hrefVerYaConciliados(g),
      titulo: `Abre en otra pestaña los cargos ya conciliados de ${VENTANA_YA_CONCILIADOS_DIAS} días antes y después${
        dia ? ` del ${dia}` : ""
      }${filtroConciliados}: si el cargo está ligado a OTRO gasto, puede ser un gasto duplicado.`,
    },
  };
}

/**
 * ¿Hasta qué día hay estado de cuenta importado? Para PAYWISE solo cuentan
 * las cuentas PASARELA; para lo demás, las de BANCO. `aviso` = el gasto es
 * posterior a lo importado o cae en los 3 días de margen; `detalle` = el
 * último movimiento importado por cuenta. null sin `ultimos_movimientos`
 * (no aplica o la lectura falló: no se afirma nada).
 */
export function textoCoberturaImportada(r: ConciliacionDeGasto): { aviso: string | null; detalle: string | null } | null {
  if (!Array.isArray(r.ultimos_movimientos)) return null;
  const paywise = r.gasto.medio_pago === "PAYWISE";
  const cuentas = r.ultimos_movimientos.filter(
    (u) => u?.cuenta && (paywise ? u.cuenta.tipo === "PASARELA" : u.cuenta.tipo !== "PASARELA"),
  );
  const conFecha = cuentas.filter((u) => esDiaValido(u.ultima_fecha));
  if (conFecha.length === 0) {
    return { aviso: "Todavía no hay estados de cuenta importados en las cuentas de este tipo de pago.", detalle: null };
  }
  const masReciente = [...conFecha].sort((a, b) =>
    (a.ultima_fecha as string) < (b.ultima_fecha as string) ? 1 : (a.ultima_fecha as string) > (b.ultima_fecha as string) ? -1 : 0,
  )[0];
  const ultima = masReciente.ultima_fecha as string;
  const detalle = `Último movimiento importado por cuenta: ${cuentas
    .map((u) => `${u.cuenta.alias} ${u.ultima_fecha && esDiaValido(u.ultima_fecha) ? fmtDateOnly(u.ultima_fecha) : "sin movimientos"}`)
    .join(" · ")}`;
  const dia = r.gasto.fecha_gasto && esDiaValido(r.gasto.fecha_gasto) ? r.gasto.fecha_gasto : null;
  let aviso: string | null = null;
  if (dia && dia > ultima) {
    aviso = `Ningún estado de cuenta importado llega todavía al ${fmtDateOnly(dia)} (el más reciente es ${
      masReciente.cuenta.alias
    }, hasta el ${fmtDateOnly(ultima)}). Impórtalo en Conciliación: el gasto se cruza solo si el monto y la fecha coinciden.`;
  } else if (dia && diaMas(dia, MARGEN_CRUCE_DIAS) > ultima) {
    aviso = `El estado de cuenta importado más reciente llega al ${fmtDateOnly(
      ultima,
    )}: si el banco registró el cargo unos días después del gasto, todavía no está importado.`;
  }
  return { aviso, detalle };
}

// ───────────────────────────── Alertas y errores ─────────────────────────────

/** El texto de cada alerta del API (un código nuevo ⇒ el de respaldo, jamás el código). */
export function textoAlertaConciliacionGasto(codigo: string): string {
  switch (codigo) {
    case "CONCILIADO_SIN_CARGOS":
      return "Está marcado como conciliado, pero no tiene ningún cargo del banco ligado (se marcó a mano o con datos viejos). Revísalo en Conciliación.";
    case "ESTADO_DESFASADO":
      return "El estado guardado del gasto no coincide con sus cargos ligados. Avisa a sistemas; no lo corrijas a mano.";
    case "TC_NO_REGISTRADO":
      return "Compra en dólares pagada en pesos, pero el gasto no tiene el tipo de cambio guardado. Avisa a sistemas.";
    case "LOTE_SIN_DETALLE":
      return TEXTO_LOTE_SIN_DETALLE;
    default:
      return "Revisa este gasto en Conciliación.";
  }
}

/** Lo que devuelve la action al fallar. */
export interface ResultadoDetalleBanco {
  ok?: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
}

/** El error al abrir la hoja: qué decir, si «Reintentar» y si ofrecer «Buscar el cargo en Conciliación». */
export function mensajeErrorDetalleBanco(r: ResultadoDetalleBanco): {
  texto: string;
  reintentable: boolean;
  buscarEnConciliacion: boolean;
} {
  if (r.code === "RUTA_NO_DISPONIBLE" || esRutaInexistente({ status: r.status, error: r.error })) {
    return { texto: MSG_DETALLE_BANCO_API_VIEJO, reintentable: false, buscarEnConciliacion: true };
  }
  if (r.code === "GASTO_INVALIDO") return { texto: MSG_GASTO_INVALIDO, reintentable: false, buscarEnConciliacion: false };
  if (r.status === 403) return { texto: MSG_DETALLE_BANCO_SIN_PERMISO, reintentable: false, buscarEnConciliacion: false };
  if (r.status === 404 || r.code === "GASTO_NO_EXISTE") {
    return { texto: MSG_GASTO_YA_NO_EXISTE, reintentable: false, buscarEnConciliacion: false };
  }
  if (r.status === 401) return { texto: MSG_SESION_EXPIRO, reintentable: false, buscarEnConciliacion: false };
  return { texto: MSG_DETALLE_BANCO_FALLO, reintentable: true, buscarEnConciliacion: false };
}

/** El error al generar la descarga del estado de cuenta. */
export function mensajeErrorDescargaEstadoCuenta(r: ResultadoDetalleBanco): string {
  return r.status === 404 ? MSG_ESTADO_CUENTA_NO_EXISTE : MSG_ESTADO_CUENTA_FALLO;
}

/**
 * ¿El estado del API ya no es el que pinta la fila? (alguien concilió o
 * desvinculó con la página abierta). Si la fila no trae `monto_vinculado` ni
 * `faltante` (Compras o un API previo) solo se compara «cubierto»: sin esos
 * datos la fila no puede saber de un parcial y no se avisa en falso.
 */
export function estadoCambio(r: ConciliacionDeGasto, fila: GastoParaBanco): boolean {
  const local = estadoBancoGasto(fila).value;
  if (fila.monto_vinculado == null && fila.faltante == null) {
    return (r.estado === "CONCILIADO") !== (local === "CONCILIADO");
  }
  return r.estado !== local;
}

/** El `title` del botón «Exportar Excel» de Gastos (solo a quien recibe el detalle del banco). */
export function tituloExcelGastos(rol: string | null | undefined): string | undefined {
  return puedeVerDetalleBancoGasto(rol) ? TITULO_EXCEL_GASTOS_CON_BANCO : undefined;
}
