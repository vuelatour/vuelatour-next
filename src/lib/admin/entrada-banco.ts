/**
 * «CONCILIACIÓN AL REVÉS» de una ENTRADA de dinero —cobro de vuelo, parte de un
 * sobre, cobro de un anticipo o ingreso— (15-oct-2026, API 0.0.78, invariante
 * 78 del API). Módulo PURO (sin React ni red; prueba
 * `__tests__/entrada-banco.test.ts` con las respuestas REALES de
 * `entrada-banco.fixtures.ts`): FUENTE ÚNICA de la hoja «Conciliación con el
 * banco» que abren el badge de Ingresos y el de las tarjetas «Cobros» del
 * vuelo y de la cotización. Ningún componente redacta estas frases.
 *
 * Pedido del usuario: «y me hace falta que si doy clic en Conciliado vea el
 * detalle de con qué estado de cuenta se concilio y sus detalles». Los datos
 * los arma el API (`GET /v1/conciliacion/cobros/:id` e `/ingresos/:id`): aquí
 * JAMÁS se suma ni se decide un estado — estado, cobertura, la parte de cada
 * abono, la diferencia del lote, el cuadre del ingreso, el T.C. de un cruce,
 * los cobros del mismo día con su suma y el «el cruce no corrió» vienen del
 * API; solo se formatea y se elige qué frase aplica. Lo común con la hoja de
 * Gastos vive en `hoja-banco.ts`; las URLs al abono son las del 0.0.78
 * (`hrefAbonoDeCobro`, `hrefBuscarAbonoQueFalta` de `cobro-banco.ts`).
 */

import { diaMas } from "@/lib/admin/conciliacion-auto";
import { lineaCobroLote, type LineaLoteCobros } from "@/lib/admin/conciliacion-cobros-lote";
import { VENTANA_CARGO_DIAS, esRutaInexistente } from "@/lib/admin/conciliacion-lote";
import { fmtMontoConciliacion, numeroDe } from "@/lib/admin/conciliacion-parcial";
import { FILTROS_CONCILIACION, hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import {
  estadoBancoCobro,
  hrefAbonoDeCobro,
  hrefBuscarAbonoQueFalta,
  textoSobranteCobro,
  type CobroBanco,
  type PiezaLineaBanco,
} from "@/lib/admin/cobro-banco";
import { esCuentaCobroPasarela } from "@/lib/admin/cobros";
import { etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { folioTexto } from "@/lib/admin/grupos-ui";
import {
  MSG_DETALLE_BANCO_API_VIEJO,
  MSG_DETALLE_BANCO_FALLO,
  MSG_DETALLE_BANCO_SIN_PERMISO,
  MSG_SESION_EXPIRO,
  NOTA_CRUZAR_PENDIENTES,
  VENTANA_YA_CONCILIADOS_DIAS,
  archivoDeMovimiento,
  montoParaBusquedaTabla,
  type ArchivoDeMovimiento,
  type EnlaceHoja,
  type ResultadoDetalleBanco,
  type TonoEstadoBanco,
} from "@/lib/admin/hoja-banco";
import { hrefPorConciliarIngreso } from "@/lib/admin/ingresos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { esDiaValido } from "@/lib/admin/url-params";
import { fmtDateOnly, fmtDateTime, isoToCancunInput } from "@/lib/datetime";
import { fmtMonto, fmtTc } from "@/lib/format";
import type { MovimientoCobroParte, UltimoMovimientoCuenta } from "@/types/conciliacion";
import type {
  AbonoDeEntrada,
  ConciliacionDeEntrada,
  EntradaDeConciliacion,
  EstadoBancoEntrada,
  MismoDiaCliente,
  CruceNoCorrio,
  OrigenEntrada,
} from "@/types/conciliacion-entrada";
import type { FlightCobro } from "@/types/flights";
import type { EntradaDinero, Ingreso, ParcialEntrada } from "@/types/ingresos";

// ───────────────────────────── Constantes ─────────────────────────────

/** Espejo de `MATCH_DAYS` del API: ± días entre el cobro y el abono en el cruce automático. */
export const MARGEN_CRUCE_ABONO_DIAS = 3;
/** Espejo de `PAYWISE_VENTANA_DIAS` del API (solo «Link de pago (Paywise)» y cuentas PASARELA). */
export const MARGEN_CRUCE_PAYWISE_DIAS = 5;
/** «Mismo cliente, mismo día»: cuántos vuelos se nombran antes de «y N más». */
export const MAX_VUELOS_MISMO_DIA = 5;

export const TEXTO_CARGANDO_ENTRADA = "Buscando el abono en los estados de cuenta…";
export const MSG_ENTRADA_INVALIDA = "Cobro o ingreso inválido.";
export const MSG_COBRO_YA_NO_EXISTE = "Ese cobro ya no existe: recarga la página.";
export const MSG_INGRESO_YA_NO_EXISTE = "Ese ingreso ya no existe: recarga la página.";
export const NOTA_ESPEJO_ENTRADA =
  "Detalle simplificado: la base de datos todavía no tiene la conciliación por partes de los cobros.";
export const NOTA_INGRESO_DADO_DE_BAJA = "Este ingreso está dado de baja.";
export const TITULO_REGISTRO_LIGA_ENTRADA =
  "Quién hizo la liga: a mano, o quien importó el estado de cuenta, pulsó «Cruzar pendientes», concilió en la Auditoría Paywise o registró el ingreso cuando el sistema la cruzó solo.";
export const TEXTO_LIGA_COBRO_ANTERIOR =
  "Liga anterior al 12 oct 2026: el sistema todavía no guardaba quién la hizo.";
export const TEXTO_LIGA_SOBRE_NO_SE_GUARDA = "El sistema no guarda quién liga el abono de un sobre de grupo.";
export const TEXTO_LIGA_SIN_BITACORA = "No quedó registro de quién hizo esta liga.";
export const TEXTO_LIGA_NO_LEIDA = "No se pudo leer quién hizo la liga (vuelve a abrir esta ventana).";
export const TEXTO_LOTE_ENTRADA_SIN_DETALLE =
  "No se pudo leer el detalle de los otros cobros que paga el abono; vuelve a abrir esta ventana.";
export const TEXTO_ALERTA_CONCILIADO_SIN_ABONOS =
  "Aparece como conciliado, pero no se pudo leer el abono del banco (lo acaban de cambiar). Cierra y vuelve a abrir esta ventana.";
export const SUFIJO_ESTE_COBRO = "(este cobro)";
export const TITULO_VUELO_DEL_LOTE = "Abre el vuelo en otra pestaña";

export const INTRO_COBRO_SIN_CONCILIAR =
  "El cruce automático corre al importar el estado de cuenta (o al pulsar «Cruzar pendientes» en Conciliación) y liga este cobro con un abono de una cuenta en su MISMA moneda que trae exactamente lo que debe llegar (el neto, si tiene comisión), con hasta 3 días de diferencia (Paywise: 5, solo para «Link de pago (Paywise)»), cuando es el único cobro, sobre o ingreso que cuadra (con varios, gana el que trae el nombre del cliente en la leyenda). Nunca liga un abono a varios cobros: eso se hace a mano. Si no se cruzó, revisa:";
export const INTRO_PARCIAL_ENTRADA =
  "Si el resto llegó en otra transferencia, búscala en Conciliación y vincúlala a este mismo cobro: queda «Conciliado» al completarse. Si el cliente pagó menos, corrige el cobro (antes desvincula sus abonos en Conciliación).";
export const INTRO_CONCILIADO_SIN_ABONOS =
  "El abono está ligado pero no se pudo leer. Búscalo en Conciliación entre los abonos ya conciliados de esas fechas.";
export const NOTA_COBRO_USD =
  "El cobro está en dólares: búscalo en las cuentas en dólares (si te pagó en pesos, el abono trae otro monto: búscalo por el nombre o por la fecha).";
export const NOTA_COBRO_PAYWISE =
  "Los cobros con link de Paywise se concilian en «Auditoría Paywise» (Conciliación), que además escribe la comisión real del cobro.";

export const BOTON_BUSCAR_ABONO = "Buscar el abono en Conciliación";
export const BOTON_BUSCAR_ABONO_QUE_FALTA = "Buscar el abono que falta en Conciliación";
export const BOTON_VER_ABONOS_CONCILIADOS = "Ver los abonos ya conciliados de esas fechas";
export const BOTON_AUDITORIA_PAYWISE = "Ir a Auditoría Paywise";
export const BOTON_VER_OMITIDOS = "Ver los omitidos de esas fechas";
export const BOTON_CONCILIAR_INGRESO = "Conciliarlo en «Por conciliar»";
export const BOTON_BUSCAR_ABONO_SOBRE = "Buscar el abono del sobre en Conciliación";
export const BOTON_ABRIR_GRUPO = "Abrir el grupo";

/** Causas del cobro «Sin conciliar» que no dependen de la respuesta. */
const CAUSA_REGISTRADO_DESPUES =
  "Que el cobro no se haya registrado DESPUÉS de importar el estado de cuenta de esas fechas: los cobros no se vuelven a intentar solos (prueba «Cruzar pendientes» en Conciliación).";
const CAUSA_VARIOS_VUELOS =
  "Que el cliente no haya pagado varios vuelos en un solo depósito: ese abono se vincula en Conciliación marcando todos los cobros que paga.";
const CAUSA_VARIAS_TRANSFERENCIAS = "Que no haya pagado en varias transferencias: cada una se vincula a este mismo cobro.";
const CAUSA_OTRO_MONTO = "Que el banco no haya depositado otro monto (comisión o tipo de cambio).";
const CAUSA_MISMO_MONTO =
  "Que no haya otro cobro del mismo monto esos días: si la leyenda del banco no trae el nombre del cliente, el cruce automático no adivina y se vincula a mano.";
const CAUSA_LIGADO_A_OTRO =
  "Que el abono no esté ligado a OTRO cobro o ingreso, ni clasificado (p. ej. como traspaso entre cuentas), por error: ábrelo con «Ver los abonos ya conciliados».";
const CAUSA_OMITIDO = "Que el abono no se haya omitido de la conciliación por error (pestaña «Omitidos» de Conciliación).";
const CAUSA_OTRA_CUENTA_COBRO = "Que el dinero no haya entrado a otra cuenta, a la pasarela o en efectivo.";

// ───────────────────────────── Utilidades ─────────────────────────────

const fmt = (v: unknown, moneda?: string | null) => fmtMontoConciliacion(v, moneda ?? null);

/** Monto con su moneda SIEMPRE («$14,000.00 MXN»): solo donde se mezclan dos monedas. */
const fmtConMoneda = (v: unknown, moneda?: string | null) =>
  `${fmtMontoConciliacion(v, null)}${moneda ? ` ${moneda}` : ""}`;

/** Número del API o null (ausente, vacío o no numérico): jamás un 0 inventado. */
function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ¿Dos montos del API difieren en un centavo o más? (decisión de texto, no un cálculo de dinero). */
function difiere(a: unknown, b: unknown): boolean {
  return Math.abs(numeroDe(a) - numeroDe(b)) >= 0.005;
}

function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** «a», «a y b», «a, b y c». */
function listaEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «15 sep 2026» de un día `YYYY-MM-DD` (null si no es un día). */
function fechaDia(dia: string | null | undefined): string | null {
  return typeof dia === "string" && esDiaValido(dia.slice(0, 10)) ? fmtDateOnly(dia.slice(0, 10)) : null;
}

/** Día de pared (Cancún) de un timestamptz; null si no se lee. */
function diaCancun(iso: string | null | undefined): string | null {
  const dia = isoToCancunInput(iso).slice(0, 10);
  return esDiaValido(dia) ? dia : null;
}

/** La única cuenta de una lista (por id), o null si son 0 o varias. */
function cuentaUnica(ids: readonly (string | null | undefined)[]): string | null {
  const unicas = [...new Set(ids.filter((x): x is string => !!x))];
  return unicas.length === 1 ? unicas[0] : null;
}

/** «Vuelo #332» ⇒ «vuelo #332» (para «el cobro del vuelo #332»). */
function minusculaInicial(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** ¿Conciliación ya tiene la pestaña «Omitidos» (0.0.77)? La de `conciliacion-vista.ts`, no la homónima de Ingresos. */
function hayPestanaOmitidos(): boolean {
  return (FILTROS_CONCILIACION as readonly string[]).includes("omitidos");
}

/** El texto plano de unas piezas (pruebas y lectores). */
export function textoDePiezas(piezas: readonly PiezaLineaBanco[] | null | undefined): string {
  return (piezas ?? []).map((p) => p.texto).join("");
}

// ───────────────────────────── La fila ─────────────────────────────

/** Lo que la hoja sabe de la entrada ANTES de que conteste el API (fila de Ingresos o cobro de una tarjeta). */
export interface EntradaBancoFila {
  origen: OrigenEntrada;
  id: string;
  etiqueta: string;
  categoria_etiqueta: string | null;
  monto: number;
  moneda: string;
  dia: string | null;
  cliente: string | null;
  metodo_etiqueta: string | null;
  /** Solo filas de `Ingreso` (su cuenta_bancaria_id): `EntradaDinero` y `FlightCobro` NO traen id de cuenta ⇒ null. */
  cuenta_id: string | null;
  /** El de la lista ya mapeado (PARCIAL desde `parcial`); null = desconocido (tarjeta con un API previo). */
  estado: EstadoBancoEntrada | null;
  faltante: number | null;
  /** El abono que la lista conoce: entra a la llave del modo controlado (cambia al desvincular). */
  movimiento_id: string | null;
  baja: boolean;
}

const ESTADOS_HOJA: readonly EstadoBancoEntrada[] = [
  "CONCILIADO",
  "PARCIAL",
  "VIA_ANTICIPO",
  "SIN_CONCILIAR",
  "NO_BANCARIO",
];

function estadoConocido(v: unknown): EstadoBancoEntrada | null {
  return typeof v === "string" && (ESTADOS_HOJA as readonly string[]).includes(v) ? (v as EstadoBancoEntrada) : null;
}

/**
 * El aditivo `conciliacion.parcial` del 0.0.78 en la lista de Ingresos: el
 * ÚNICO lugar de esta hoja que conoce su forma. null = sin parcial (o API previo).
 */
export function parcialDeEntrada(e: Pick<EntradaDinero, "conciliacion">): ParcialEntrada | null {
  return e.conciliacion?.parcial ?? null;
}

/**
 * El estado de un cobro de una TARJETA (`FlightCobro`) con el vocabulario de la
 * hoja: `estadoBancoCobro` del 0.0.78 (`lib/admin/cobro-banco.ts`) y, SOLO con
 * un API previo (sin `conciliacion_estado`), `conciliado_via === 'ANTICIPO'` ⇒
 * VIA_ANTICIPO. null o NO_BANCARIO ⇒ la tarjeta no pinta badge, como hoy.
 */
export function estadoFilaDeCobroVuelo(
  c: Pick<CobroBanco, "conciliacion_estado" | "conciliado" | "conciliado_via">,
): EstadoBancoEntrada | null {
  const e = estadoBancoCobro(c);
  if (e === "CONCILIADO" && c.conciliacion_estado == null && c.conciliado_via === "ANTICIPO") return "VIA_ANTICIPO";
  return e;
}

/** Fila de «Todos» / «Cobros de vuelos» / «Depósitos…»: SIN_CONCILIAR + `parcial` ⇒ PARCIAL (así no salta «el estado cambió»). */
export function filaBancoDeEntrada(e: EntradaDinero): EntradaBancoFila {
  const parcial = parcialDeEntrada(e);
  const lista = e.conciliacion?.estado;
  return {
    origen: e.origen,
    id: e.id,
    etiqueta: e.etiqueta,
    categoria_etiqueta: e.categoria_etiqueta ?? null,
    monto: numeroDe(e.monto),
    moneda: e.moneda,
    dia: e.dia ?? null,
    cliente: e.cliente_nombre ?? null,
    metodo_etiqueta: e.metodo_etiqueta ?? null,
    cuenta_id: null,
    estado: lista === "SIN_CONCILIAR" && parcial ? "PARCIAL" : estadoConocido(lista),
    faltante: parcial ? numeroONull(parcial.faltante) : null,
    movimiento_id: e.conciliacion?.movimiento_id ?? null,
    baja: false,
  };
}

/** Fila de «Otros ingresos» / «Anticipos» y del detalle `?ingreso=`. */
export function filaBancoDeIngreso(i: Ingreso): EntradaBancoFila {
  return {
    origen: "INGRESO",
    id: i.id,
    etiqueta: i.etiqueta || etiquetaIngreso(i.folio),
    categoria_etiqueta: i.categoria_etiqueta ?? null,
    monto: numeroDe(i.monto),
    moneda: i.moneda,
    dia: i.fecha ?? null,
    cliente: i.cliente_nombre ?? i.pagador ?? null,
    metodo_etiqueta: i.metodo_etiqueta ?? null,
    cuenta_id: i.cuenta_bancaria_id ?? null,
    estado: estadoConocido(i.conciliacion?.estado),
    faltante: null,
    movimiento_id: i.conciliacion?.movimiento_id ?? null,
    baja: !!i.baja,
  };
}

/** Fila de un cobro de la tarjeta «Cobros» del vuelo o de la cotización (el folio y el cliente los sabe la tarjeta). */
export function filaBancoDeCobroVuelo(
  c: FlightCobro,
  ctx: { folio?: number | null; cliente?: string | null } = {},
): EntradaBancoFila {
  const estado = estadoFilaDeCobroVuelo(c);
  return {
    origen: "COBRO_VUELO",
    id: c.id,
    etiqueta: ctx.folio != null ? `Vuelo #${ctx.folio}` : "",
    categoria_etiqueta: "Cobro de vuelo",
    monto: numeroDe(c.monto),
    moneda: c.moneda,
    dia: diaCancun(c.fecha_cobro),
    cliente: textoONull(ctx.cliente),
    metodo_etiqueta: c.metodo_cobro ? metodoPagoLabel(c.metodo_cobro) : null,
    cuenta_id: null,
    estado,
    faltante: estado === "PARCIAL" ? numeroONull(c.faltante) : null,
    movimiento_id: c.movimiento_bancario_id ?? null,
    baja: false,
  };
}

/**
 * ¿El badge abre la hoja? Conciliado, Conciliado vía anticipo, Parcial y Sin
 * conciliar SÍ; «No se concilia uno a uno», «—» y un ingreso dado de baja,
 * NUNCA (no hay abono que mostrar).
 */
export function abreDetalleEntrada(estado: string | null | undefined, opts: { baja?: boolean } = {}): boolean {
  if (opts.baja) return false;
  return estado === "CONCILIADO" || estado === "VIA_ANTICIPO" || estado === "PARCIAL" || estado === "SIN_CONCILIAR";
}

/**
 * Nombre accesible del badge-botón: EMPIEZA con el texto visible (WCAG
 * 2.5.3): «Conciliado: ver la conciliación con el banco del cobro del vuelo
 * #332 de $977.45 del 15 sep 2026» · «… del ingreso ING-3 de $78.00 del 10 sep
 * 2026». En la tarjeta (sin folio): «… del cobro de $977.45 del 15 sep 2026».
 */
export function nombreAccesibleEntrada(
  textoVisible: string,
  f: Pick<EntradaBancoFila, "origen" | "etiqueta" | "monto" | "moneda" | "dia">,
): string {
  const etiqueta = (f.etiqueta ?? "").trim();
  const que =
    f.origen === "INGRESO"
      ? `ingreso${etiqueta ? ` ${etiqueta}` : ""}`
      : `cobro${etiqueta ? ` del ${minusculaInicial(etiqueta)}` : ""}`;
  const fecha = fechaDia(f.dia);
  return `${textoVisible}: ver la conciliación con el banco del ${que} de ${fmt(f.monto, f.moneda)}${fecha ? ` del ${fecha}` : ""}`;
}

// ───────────────────────────── El encabezado ─────────────────────────────

type EncabezadoEntrada = EntradaDeConciliacion | EntradaBancoFila;

function esEntradaDelApi(x: EncabezadoEntrada): x is EntradaDeConciliacion {
  return "cliente_nombre" in x;
}

/** «Vuelo #332 · Cobro de vuelo · $977.45 · 15 sep 2026 · Beh Kay» (el cliente recortado; sin vacíos). */
export function descripcionHojaEntrada(x: EncabezadoEntrada | null | undefined): string {
  if (!x) return "";
  const cliente = esEntradaDelApi(x) ? x.cliente_nombre : x.cliente;
  return [
    textoONull(x.etiqueta),
    textoONull(x.categoria_etiqueta),
    fmt(x.monto, x.moneda),
    fechaDia(x.dia),
    textoONull(cliente),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Con qué se pagó: «Cobrado con: Transferencia · cuenta capturada: Scotiabank
 * Pesos» (la cuenta se omite si ya está en el nombre del método: «Link de
 * pago (Paywise)») · «Entró a: COMBUSTIBLE · Scotiabank (MXN) · Transferencia»
 * · «Entró a: efectivo / caja». Antes de la respuesta, solo el método del
 * cobro (de un ingreso no se sabe la cuenta todavía).
 */
export function lineaPagoEntrada(x: EncabezadoEntrada | null | undefined): string | null {
  if (!x) return null;
  const metodo = textoONull(x.metodo_etiqueta);
  if (x.origen === "INGRESO") {
    if (!esEntradaDelApi(x)) return null;
    if (!x.cuenta) return "Entró a: efectivo / caja";
    return [`Entró a: ${x.cuenta.alias} · ${x.cuenta.banco} (${x.cuenta.moneda})`, metodo].filter(Boolean).join(" · ");
  }
  if (!metodo) return null;
  const cuenta = esEntradaDelApi(x) ? textoONull(x.cuenta_destino) : null;
  const yaEnMetodo = cuenta != null && metodo.toLowerCase().includes(cuenta.toLowerCase());
  return `Cobrado con: ${metodo}${cuenta && !yaEnMetodo ? ` · cuenta capturada: ${cuenta}` : ""}`;
}

/**
 * «Registró el cobro: Itzi · 8 oct 2026, 1:43 p.m.» / «Registró el ingreso: …»;
 * sin nombre, «Registrado el 8 oct 2026, 1:43 p.m.»; sin nombre ni fecha, nada.
 */
export function lineaRegistroEntrada(e: EntradaDeConciliacion | null | undefined): string | null {
  if (!e) return null;
  const quien = textoONull(e.registrado_por_nombre);
  const cuando = textoONull(e.registrado_at) ? fmtDateTime(e.registrado_at) : null;
  if (quien) {
    return `Registró el ${e.origen === "INGRESO" ? "ingreso" : "cobro"}: ${quien}${cuando ? ` · ${cuando}` : ""}`;
  }
  return cuando ? `Registrado el ${cuando}` : null;
}

/**
 * Solo con comisión > 0 (los tres números de `entrada`): «El cliente pagó
 * $12,495.00; la comisión registrada es de $624.76, así que al banco debe
 * llegar el neto: $11,870.24.» / «El ingreso es de $X; …».
 */
export function lineaComisionEntrada(e: EntradaDeConciliacion | null | undefined): string | null {
  if (!e || !(numeroDe(e.comision) > 0)) return null;
  const inicio =
    e.origen === "INGRESO" ? `El ingreso es de ${fmt(e.monto, e.moneda)}` : `El cliente pagó ${fmt(e.monto, e.moneda)}`;
  return `${inicio}; la comisión registrada es de ${fmt(e.comision, e.moneda)}, así que al banco debe llegar el neto: ${fmt(
    e.neto,
    e.moneda,
  )}.`;
}

// ───────────────────────────── Resumen del estado ─────────────────────────────

function etiquetaSobre(r: Pick<ConciliacionDeEntrada, "sobre">): string {
  return folioTexto(r.sobre?.grupo_folio ?? null);
}

/**
 * Una frase del estado, con su tono (las 17 ramas de la spec, en orden). El
 * cruzado va antes que el lote y que «N abonos»; un parcial sin `cobertura`
 * no inventa números.
 */
export function resumenEstadoEntrada(r: ConciliacionDeEntrada): { texto: string; tono: TonoEstadoBanco } {
  const e = r.entrada;
  const abonos = Array.isArray(r.abonos) ? r.abonos : [];
  const cob = r.cobertura;
  const ingreso = e.origen === "INGRESO";
  switch (r.estado) {
    case "NO_BANCARIO":
      if (ingreso) return { texto: "Efectivo / caja: este ingreso no pasa por el banco.", tono: "neutro" };
      if (e.es_reembolso) {
        return { texto: "Es un reembolso al cliente: sale del banco como un cargo y no se concilia aquí.", tono: "neutro" };
      }
      return {
        texto: `Este cobro no se concilia uno a uno con el banco (${e.metodo_etiqueta || "sin método"}).`,
        tono: "neutro",
      };
    case "SIN_CONCILIAR":
      if (ingreso && e.dado_de_baja) return { texto: "Dado de baja: ya no se concilia.", tono: "neutro" };
      if (!ingreso && r.anticipo) {
        return {
          texto: `Sin conciliar: este cobro salió del anticipo ${r.anticipo.etiqueta} y ese anticipo todavía no está ligado a su abono del banco.`,
          tono: "pendiente",
        };
      }
      if (!ingreso && r.sobre) {
        return {
          texto: `Sin conciliar: este cobro es parte del sobre ${etiquetaSobre(r)} y ese sobre todavía no está ligado a su abono del banco.`,
          tono: "pendiente",
        };
      }
      if (ingreso) {
        return {
          texto: `Sin conciliar: ningún abono del banco está ligado a este ingreso (${e.cuenta?.alias ?? e.metodo_etiqueta}).`,
          tono: "pendiente",
        };
      }
      return {
        texto: `Sin conciliar: ningún abono del banco está ligado a este cobro (${e.metodo_etiqueta || "sin método"}).`,
        tono: "pendiente",
      };
    case "PARCIAL":
      if (!cob) return { texto: "Conciliado parcial: los abonos ligados no cubren el cobro.", tono: "aviso" };
      return {
        texto: `Conciliado parcial: los abonos ligados suman ${fmt(cob.monto_vinculado, e.moneda)}; faltan ${fmt(
          cob.faltante,
          e.moneda,
        )} de ${fmt(cob.neto, e.moneda)}.`,
        tono: "aviso",
      };
    case "CONCILIADO":
    case "VIA_ANTICIPO": {
      if (abonos.length === 0) return { texto: "Aparece como conciliado, pero no se pudo leer el abono del banco.", tono: "aviso" };
      if (r.estado === "VIA_ANTICIPO" || r.via === "ANTICIPO") {
        const etiqueta = r.anticipo?.etiqueta ?? "";
        return {
          texto: `Conciliado vía anticipo: este cobro salió del anticipo${etiqueta ? ` ${etiqueta}` : ""}, que está conciliado con un abono del banco.`,
          tono: "ok",
        };
      }
      if (r.via === "SOBRE") {
        return {
          texto: `Conciliado vía el sobre ${etiquetaSobre(r)}: el abono del banco pagó el sobre completo del grupo.`,
          tono: "ok",
        };
      }
      const cruzado = abonos.find((a) => a.liga?.cruzada === true);
      if (cruzado) {
        return {
          texto: `Conciliado: cobro en ${e.moneda} pagado con un abono en ${cruzado.liga.moneda ?? cruzado.moneda ?? "otra moneda"}.`,
          tono: "ok",
        };
      }
      if (abonos.length === 1 && abonos[0].lote) {
        const otros = Math.max(1, Math.trunc(numeroDe(abonos[0].lote.cobros_n)) - 1);
        return {
          texto: `Conciliado: lo paga un abono del banco junto con ${otros} ${otros === 1 ? "cobro más" : "cobros más"}.`,
          tono: "ok",
        };
      }
      if (ingreso && e.categoria === "ANTICIPO_CLIENTE" && abonos.length === 1) {
        return { texto: "Conciliado con 1 abono del banco: respalda el anticipo completo.", tono: "ok" };
      }
      if (abonos.length === 1) return { texto: "Conciliado con 1 abono del banco.", tono: "ok" };
      if (!cob) return { texto: `Conciliado con ${abonos.length} abonos del banco.`, tono: "ok" };
      return {
        texto: `Conciliado con ${abonos.length} abonos del banco: suman ${fmt(cob.monto_vinculado, e.moneda)} de ${fmt(
          cob.neto,
          e.moneda,
        )}.`,
        tono: "ok",
      };
    }
    default:
      return { texto: `Revisa este ${ingreso ? "ingreso" : "cobro"} en Conciliación.`, tono: "aviso" };
  }
}

// ───────────────────────────── Notas y contexto ─────────────────────────────

/** Notas bajo la frase: ESPEJO (con abonos directos) y un ingreso dado de baja con abono. */
export function notasEntrada(r: ConciliacionDeEntrada): string[] {
  const abonos = Array.isArray(r.abonos) ? r.abonos : [];
  const out: string[] = [];
  if (r.fuente === "ESPEJO" && abonos.some((a) => a.liga?.via === "DIRECTO")) out.push(NOTA_ESPEJO_ENTRADA);
  if (r.entrada.origen === "INGRESO" && r.entrada.dado_de_baja && abonos.length > 0) out.push(NOTA_INGRESO_DADO_DE_BAJA);
  return out;
}

/** El enlace al anticipo en Ingresos (pestaña «Anticipos» con su detalle abierto). */
export function hrefAnticipoEnIngresos(ingresoId: string): string {
  return `/admin/ingresos?tab=anticipos&ingreso=${encodeURIComponent(ingresoId)}`;
}

/** El grupo del sobre (el mismo enlace de `CobroSobreNota`). */
function hrefGrupo(grupoId: string): string {
  return `/admin/quotes/grupo/${grupoId}`;
}

function enlaceAbrirGrupo(r: ConciliacionDeEntrada): EnlaceHoja | null {
  if (!r.sobre?.grupo_id) return null;
  return {
    etiqueta: BOTON_ABRIR_GRUPO,
    href: hrefGrupo(r.sobre.grupo_id),
    titulo: "Abre el grupo en otra pestaña: el sobre se edita, re-parte o elimina desde Cobros del grupo",
  };
}

function enlaceAbrirAnticipo(r: ConciliacionDeEntrada): EnlaceHoja | null {
  if (!r.anticipo?.ingreso_id) return null;
  return {
    etiqueta: `Abrir el anticipo ${r.anticipo.etiqueta}`,
    href: hrefAnticipoEnIngresos(r.anticipo.ingreso_id),
    titulo: "Abre el anticipo en Ingresos en otra pestaña",
  };
}

/**
 * El contexto de un cobro que NO se concilia solo: parte de un sobre (el
 * banco concilia el sobre completo) o cobro de un anticipo (el banco
 * concilia el anticipo), con su enlace. null en lo demás.
 */
export function contextoEntrada(r: ConciliacionDeEntrada): { texto: string; enlace: EnlaceHoja | null } | null {
  if (r.entrada.origen !== "COBRO_VUELO") return null;
  if (r.sobre) {
    const nombre = textoONull(r.sobre.grupo_nombre);
    return {
      texto: `Este cobro es parte del sobre ${etiquetaSobre(r)}${nombre ? ` («${nombre}»)` : ""}: el banco concilia el sobre completo, no sus partes.`,
      enlace: enlaceAbrirGrupo(r),
    };
  }
  if (r.anticipo) {
    return {
      texto: `Este cobro salió del anticipo ${r.anticipo.etiqueta}: el banco concilia el anticipo, no el cobro; por eso en Ingresos este cobro se ve en gris y no se suma otra vez.`,
      enlace: enlaceAbrirAnticipo(r),
    };
  }
  return null;
}

// ───────────────────────────── La tarjeta de cada abono ─────────────────────────────

export interface LineaLoteEntrada extends LineaLoteCobros {
  /** Es ESTE cobro: va sin enlace y con «(este cobro)». */
  esEste: boolean;
  /** Al vuelo de la línea en otra pestaña (`/admin/flights/<id>#cobros`); null sin vuelo. */
  hrefVuelo: string | null;
}

export interface LoteEntrada {
  /** «2 cobros · suman $69,183.00». */
  titulo: string;
  lineas: LineaLoteEntrada[];
  /** «Diferencia con el abono: $0.01 (el banco depositó de más; ningún cobro se ajusta).» */
  diferencia: string | null;
  /** El API no pudo leer los otros cobros del lote. */
  sinDetalle: string | null;
}

export interface FichaAbonoEntrada {
  key: string;
  /** «Abono del 15 sep 2026». */
  titulo: string;
  /** «$69,183.00» / «$2,407.00 USD» (moneda de SU cuenta). */
  monto: string;
  /** «EJE SCOTIA · Scotiabank (MXN)» (+ « · pasarela de pago»). */
  cuenta: string | null;
  /** «Leyenda del banco: «…» · Ref. …» o «Sin leyenda del banco». */
  leyenda: string;
  /** Lo que el abono aporta a ESTA entrada (null si no hay nada que decir). */
  aporte: string | null;
  /** «Según el reporte de la pasarela: bruto … · comisión … · depositado …» (solo con esos datos). */
  pasarela: string | null;
  lote: LoteEntrada | null;
  notas: string | null;
  archivo: ArchivoDeMovimiento;
  /** «Registró la liga: …» o por qué no se sabe; null en ESPEJO. */
  registro: string | null;
  /** «Ver en Conciliación»: el abono PRIMERO y resaltado (y, en un lote, la línea de este cobro). */
  href: string;
}

/** El lote del abono con TODAS sus líneas (la de este cobro marcada y sin enlace). */
function loteDeAbono(a: AbonoDeEntrada, e: EntradaDeConciliacion): LoteEntrada | null {
  const l = a.lote;
  if (!l) return null;
  const cobros: MovimientoCobroParte[] = Array.isArray(l.cobros) ? l.cobros.filter(Boolean) : [];
  const n = Math.max(Math.trunc(numeroDe(l.cobros_n)), cobros.length);
  const moneda = a.liga?.moneda ?? a.moneda ?? null;
  const dif = numeroONull(l.cobros_diferencia);
  const id = e.id.toLowerCase();
  return {
    titulo: `${n} cobros${l.cobros_suma != null ? ` · suman ${fmt(l.cobros_suma, moneda)}` : ""}`,
    lineas: cobros.map((p) => {
      const linea = lineaCobroLote(p, moneda);
      // Con los aditivos del 0.0.78, una parte que no es el neto del cobro dice «de $X».
      const deNeto =
        p.cobro_neto != null && difiere(p.monto_parte, p.cobro_neto)
          ? ` de ${fmtMonto(numeroDe(p.cobro_neto), p.moneda ?? moneda ?? undefined)}`
          : "";
      return {
        ...linea,
        secundaria: `${linea.secundaria}${deNeto}`,
        esEste: (p.cobro_id ?? "").toLowerCase() === id,
        hrefVuelo: p.vuelo_id ? `/admin/flights/${p.vuelo_id}#cobros` : null,
      };
    }),
    diferencia:
      dif != null && Math.abs(dif) >= 0.005
        ? `Diferencia con el abono: ${fmt(Math.abs(dif), moneda)} (el banco depositó ${dif > 0 ? "de más" : "de menos"}; ningún cobro se ajusta).`
        : null,
    sinDetalle: l.cobros === null ? TEXTO_LOTE_ENTRADA_SIN_DETALLE : null,
  };
}

/** Lo que el abono aporta a ESTA entrada: la PRIMERA frase que aplica (cruzado, sobre, anticipo, lote, varios, 1 ↔ 1, ingreso). */
function aporteDeAbono(a: AbonoDeEntrada, r: ConciliacionDeEntrada): string | null {
  const e = r.entrada;
  const liga = a.liga;
  if (!liga) return null;
  const abonos = Array.isArray(r.abonos) ? r.abonos : [];
  const parte = liga.monto_parte;
  if (liga.via === "DIRECTO" && liga.cruzada) {
    // El T.C. SOLO con `tc_implicito` (la función del 0.0.78); jamás «el guardado en el cobro».
    const tc = liga.tc_implicito != null ? fmtTc(liga.tc_implicito) : "";
    return `Cobro de ${fmtConMoneda(e.monto, e.moneda)} pagado con este abono de ${fmtConMoneda(
      a.monto,
      liga.moneda ?? a.moneda,
    )} (otra moneda: se concilia uno a uno)${tc ? ` · T.C. implícito ${tc}` : ""}`;
  }
  if (liga.via === "SOBRE" && r.sobre) {
    return `Este abono pagó el sobre ${etiquetaSobre(r)} completo (${fmt(r.sobre.monto, r.sobre.moneda)}); a este cobro le tocan ${fmt(
      e.monto,
      e.moneda,
    )}.`;
  }
  if (liga.via === "ANTICIPO" && r.anticipo) {
    return `Este abono pagó el anticipo ${r.anticipo.etiqueta} (${fmt(r.anticipo.monto, r.anticipo.moneda)}); este cobro aplicó ${fmt(
      e.monto,
      e.moneda,
    )} de ese anticipo.`;
  }
  if (liga.via === "DIRECTO" && parte != null) {
    if (a.lote) {
      const n = Math.trunc(numeroDe(a.lote.cobros_n));
      return difiere(parte, e.neto)
        ? `Este abono pagó ${n} cobros; a este le tocan ${fmt(parte, liga.moneda)} de ${fmt(e.neto, e.moneda)}.`
        : `Este abono pagó ${n} cobros; a este le tocan ${fmt(parte, liga.moneda)}.`;
    }
    if (abonos.length > 1) return `Este abono aporta ${fmt(parte, liga.moneda)} de ${fmt(e.neto, e.moneda)}.`;
    if (difiere(parte, e.neto)) {
      const cob = r.cobertura;
      let texto = `Este abono cubre ${fmt(parte, liga.moneda)} de ${fmt(e.neto, e.moneda)}.`;
      if (cob && cob.cubierto && numeroDe(cob.faltante) >= 0.005) {
        texto += ` Falta ${fmt(cob.faltante, e.moneda)}, dentro de la tolerancia de ${fmt(cob.tolerancia, e.moneda)} (redondeo).`;
      }
      if (cob && numeroDe(cob.sobrante) >= 0.005 && numeroDe(cob.sobrante) <= numeroDe(cob.tolerancia)) {
        texto += ` El banco depositó ${fmt(cob.sobrante, e.moneda)} de más, dentro de la tolerancia de ${fmt(cob.tolerancia, e.moneda)}.`;
      }
      return texto;
    }
    return null;
  }
  if (liga.via === "INGRESO" && liga.cuadre) {
    const partes: string[] = [];
    if (liga.cuadre.por === "BRUTO") partes.push("Cuadra con el monto bruto del ingreso: el banco no descontó la comisión.");
    if (Math.abs(numeroDe(liga.cuadre.diferencia)) >= 0.005) {
      partes.push(
        `Diferencia de ${fmt(Math.abs(numeroDe(liga.cuadre.diferencia)), e.moneda)} con el ingreso, dentro de la tolerancia de ${fmt(
          liga.cuadre.tolerancia,
          e.moneda,
        )}.`,
      );
    }
    return partes.length > 0 ? partes.join(" ") : null;
  }
  return null;
}

/** «Registró la liga: Diego Ramírez · 14 oct 2026, 4:21 p.m.» o el motivo REAL de que no se sepa (nunca un nombre inventado). */
function registroDeAbono(a: AbonoDeEntrada): string | null {
  const liga = a.liga;
  if (!liga) return null;
  if (liga.registro) {
    const de = liga.via === "ANTICIPO" ? "Registró la liga del anticipo" : "Registró la liga";
    return `${de}: ${textoONull(liga.registro.por) ?? "sin usuario"} · ${fmtDateTime(liga.registro.at)}`;
  }
  switch (liga.sin_registro) {
    case "ANTERIOR_AL_CORTE":
      return TEXTO_LIGA_COBRO_ANTERIOR;
    case "NO_SE_GUARDA":
      return TEXTO_LIGA_SOBRE_NO_SE_GUARDA;
    case "SIN_BITACORA":
      return TEXTO_LIGA_SIN_BITACORA;
    case "NO_LEIDO":
      return TEXTO_LIGA_NO_LEIDA;
    default:
      return null;
  }
}

/**
 * La tarjeta de UN abono: fecha y monto, cuenta (pasarela), leyenda y
 * referencia del banco, lo que aporta a esta entrada, lo que dijo la pasarela,
 * el lote completo, las notas, el estado de cuenta (o por qué no hay archivo),
 * quién registró la liga y «Ver en Conciliación» (`hrefAbonoDeCobro` del
 * 0.0.78; en un lote, con `?cobro=` para resaltar la línea de este cobro).
 */
export function fichaAbonoEntrada(a: AbonoDeEntrada, r: ConciliacionDeEntrada): FichaAbonoEntrada {
  const e = r.entrada;
  const cuenta = a.cuenta
    ? `${a.cuenta.alias} · ${a.cuenta.banco} (${a.cuenta.moneda})${a.cuenta.tipo === "PASARELA" ? " · pasarela de pago" : ""}`
    : null;
  const desc = (a.descripcion ?? "").trim();
  const ref = (a.referencia ?? "").trim();
  const leyenda = `${desc ? `Leyenda del banco: «${desc}»` : "Sin leyenda del banco"}${ref ? ` · Ref. ${ref}` : ""}`;
  const monedaAbono = a.liga?.moneda ?? a.moneda ?? null;
  const pasarela =
    a.monto_bruto != null || a.comision_pasarela != null
      ? `Según el reporte de la pasarela: ${[
          a.monto_bruto != null ? `bruto ${fmt(a.monto_bruto, monedaAbono)}` : null,
          a.comision_pasarela != null ? `comisión ${fmt(a.comision_pasarela, monedaAbono)}` : null,
          `depositado ${fmt(a.monto, monedaAbono)}`,
        ]
          .filter(Boolean)
          .join(" · ")}.`
      : null;
  const enLote = a.liga?.via === "DIRECTO" && a.lote != null;
  return {
    key: a.movimiento_id,
    titulo: `Abono del ${fechaDia(a.fecha) ?? "—"}`,
    monto: fmt(a.monto, monedaAbono),
    cuenta,
    leyenda,
    aporte: aporteDeAbono(a, r),
    pasarela,
    lote: loteDeAbono(a, e),
    notas: a.notas_oficina ? `Notas del abono: ${a.notas_oficina}` : null,
    archivo: archivoDeMovimiento(a, "abono"),
    registro: registroDeAbono(a),
    href: hrefAbonoDeCobro(
      { movimiento_id: a.movimiento_id, cuenta_bancaria_id: a.cuenta?.id ?? null, fecha: a.fecha },
      { cobroId: enLote ? e.id : null },
    ),
  };
}

// ───────────────────────────── Alertas y errores ─────────────────────────────

/**
 * El texto de cada alerta del API (un código nuevo ⇒ el de respaldo, jamás el
 * código). ABONO_CON_SOBRANTE usa la MISMA función que el renglón «Banco» de
 * la tarjeta (`textoSobranteCobro`, R13): una sola redacción.
 */
export function textoAlertaConciliacionEntrada(codigo: string, r: ConciliacionDeEntrada): string {
  const ingreso = r.entrada.origen === "INGRESO";
  switch (codigo) {
    case "CONCILIADO_SIN_ABONOS":
      return TEXTO_ALERTA_CONCILIADO_SIN_ABONOS;
    case "ABONO_CON_SOBRANTE":
      if (r.cobertura) {
        return textoSobranteCobro({
          montoVinculado: r.cobertura.monto_vinculado,
          sobrante: r.cobertura.sobrante,
          moneda: r.entrada.moneda,
          abonos: r.cobertura.abonos_n,
        });
      }
      return `Revisa este ${ingreso ? "ingreso" : "cobro"} en Conciliación.`;
    case "LOTE_SIN_DETALLE":
      return TEXTO_LOTE_ENTRADA_SIN_DETALLE;
    default:
      return `Revisa este ${ingreso ? "ingreso" : "cobro"} en Conciliación.`;
  }
}

/** El error al abrir la hoja: qué decir, si «Reintentar» y si ofrecer «Buscar el abono en Conciliación». */
export function mensajeErrorDetalleEntrada(
  r: ResultadoDetalleBanco,
  origen: OrigenEntrada,
): { texto: string; reintentable: boolean; buscarEnConciliacion: boolean } {
  if (r.code === "RUTA_NO_DISPONIBLE" || esRutaInexistente({ status: r.status, error: r.error })) {
    return { texto: MSG_DETALLE_BANCO_API_VIEJO, reintentable: false, buscarEnConciliacion: true };
  }
  if (r.code === "ENTRADA_INVALIDA") return { texto: MSG_ENTRADA_INVALIDA, reintentable: false, buscarEnConciliacion: false };
  if (r.status === 403) return { texto: MSG_DETALLE_BANCO_SIN_PERMISO, reintentable: false, buscarEnConciliacion: false };
  if (r.code === "COBRO_NO_EXISTE") return { texto: MSG_COBRO_YA_NO_EXISTE, reintentable: false, buscarEnConciliacion: false };
  if (r.code === "INGRESO_NO_EXISTE") return { texto: MSG_INGRESO_YA_NO_EXISTE, reintentable: false, buscarEnConciliacion: false };
  if (r.status === 404) {
    return {
      texto: origen === "INGRESO" ? MSG_INGRESO_YA_NO_EXISTE : MSG_COBRO_YA_NO_EXISTE,
      reintentable: false,
      buscarEnConciliacion: false,
    };
  }
  if (r.code === "INGRESOS_NO_DISPONIBLE") {
    return { texto: textoONull(r.error) ?? MSG_DETALLE_BANCO_FALLO, reintentable: true, buscarEnConciliacion: false };
  }
  if (r.status === 401) return { texto: MSG_SESION_EXPIRO, reintentable: false, buscarEnConciliacion: false };
  return { texto: MSG_DETALLE_BANCO_FALLO, reintentable: true, buscarEnConciliacion: false };
}

/**
 * ¿El estado del API ya no es el que pinta la fila? (alguien concilió o
 * desvinculó con la página abierta). Sin estado en la fila (tarjeta con un
 * API previo) no se avisa. CONCILIADO y VIA_ANTICIPO de la lista son los
 * MISMOS valores de la hoja; un parcial de la lista ya viene como PARCIAL.
 */
export function estadoCambioEntrada(r: Pick<ConciliacionDeEntrada, "estado">, fila: Pick<EntradaBancoFila, "estado">): boolean {
  if (fila.estado == null) return false;
  return r.estado !== fila.estado;
}

// ───────────────────────────── URLs de «¿Qué hacer?» ─────────────────────────────

/**
 * «Buscar el abono en Conciliación»: pendientes de ±30 días con el monto
 * escrito en el buscador (`?mvq=`) en LAS DOS monedas (el abono de un cobro
 * en dólares llega en dólares); `cuenta` = la PASARELA única de un cobro
 * PAYWISE, si no, sin cuenta.
 */
export function hrefBuscarAbonoEnConciliacion(
  x: { dia: string | null | undefined; monto: number | string | null | undefined },
  opts: { cuenta?: string | null } = {},
): string {
  const dia = x.dia && esDiaValido(x.dia) ? x.dia : null;
  return hrefConciliacion({
    f: "pendientes",
    cuenta: opts.cuenta ?? null,
    desde: dia ? diaMas(dia, -VENTANA_CARGO_DIAS) : null,
    hasta: dia ? diaMas(dia, VENTANA_CARGO_DIAS) : null,
    buscar: x.monto != null && x.monto !== "" ? montoParaBusquedaTabla(x.monto) : null,
  });
}

/** «Buscar un abono por $59,081.00 (los 2 cobros del día)»: ±30 días del día del cobro con la SUMA que manda el API (sin cuenta). */
export function hrefBuscarAbonoPorSumaDelDia(m: Pick<MismoDiaCliente, "dia" | "suma_netos">): string {
  return hrefBuscarAbonoEnConciliacion({ dia: m.dia, monto: m.suma_netos });
}

/** El nombre del cliente que se busca en la leyenda: recortado, con 3 letras o más; si no, null. */
export function nombreParaBuscar(cliente: string | null | undefined): string | null {
  const t = textoONull(cliente);
  if (!t) return null;
  return (t.match(/\p{L}/gu) ?? []).length >= 3 ? t : null;
}

/** «Buscar abonos con el nombre «Morena Mia»»: pendientes de ±30 días cuya leyenda menciona al cliente (todas las palabras, sin acentos). */
export function hrefBuscarAbonosPorNombre(cliente: string | null | undefined, dia: string | null | undefined): string | null {
  const nombre = nombreParaBuscar(cliente);
  if (!nombre) return null;
  const d = dia && esDiaValido(dia) ? dia : null;
  return hrefConciliacion({
    f: "pendientes",
    desde: d ? diaMas(d, -VENTANA_CARGO_DIAS) : null,
    hasta: d ? diaMas(d, VENTANA_CARGO_DIAS) : null,
    buscar: nombre,
  });
}

/** «Ver los abonos ya conciliados de esas fechas»: ±7 días con el monto (un ingreso, con su cuenta). */
export function hrefVerAbonosConciliados(
  x: { dia: string | null | undefined; monto: number | string | null | undefined },
  opts: { cuenta?: string | null } = {},
): string {
  const dia = x.dia && esDiaValido(x.dia) ? x.dia : null;
  return hrefConciliacion({
    f: "conciliados",
    cuenta: opts.cuenta ?? null,
    desde: dia ? diaMas(dia, -VENTANA_YA_CONCILIADOS_DIAS) : null,
    hasta: dia ? diaMas(dia, VENTANA_YA_CONCILIADOS_DIAS) : null,
    buscar: x.monto != null && x.monto !== "" ? montoParaBusquedaTabla(x.monto) : null,
  });
}

/** «Ver los omitidos de esas fechas» (±30 días; solo si Conciliación ya tiene la pestaña). */
export function hrefVerOmitidos(dia: string | null | undefined): string {
  const d = dia && esDiaValido(dia) ? dia : null;
  return hrefConciliacion({
    f: "omitidos",
    desde: d ? diaMas(d, -VENTANA_CARGO_DIAS) : null,
    hasta: d ? diaMas(d, VENTANA_CARGO_DIAS) : null,
  });
}

/** «Abrir Conciliación del … al …»: la ventana EXACTA del cruce que manda el API (ahí está «Cruzar pendientes»). */
export function hrefConciliacionCruzarPendientes(c: Pick<CruceNoCorrio, "desde" | "hasta">): string {
  return hrefConciliacion({ f: "pendientes", desde: c.desde, hasta: c.hasta });
}

/**
 * «Buscar el abono en Conciliación» desde la FILA (error al cargar o API
 * previo): un parcial busca lo que falta (`hrefBuscarAbonoQueFalta` del
 * 0.0.78); lo demás, el monto de la fila.
 */
export function hrefBuscarDesdeFila(f: Pick<EntradaBancoFila, "dia" | "monto" | "estado" | "faltante">): string {
  if (f.estado === "PARCIAL") {
    const href = hrefBuscarAbonoQueFalta({ dia: f.dia, faltante: f.faltante });
    if (href) return href;
  }
  return hrefBuscarAbonoEnConciliacion({ dia: f.dia, monto: f.monto });
}

// ───────────────────────────── «¿Qué hacer?» ─────────────────────────────

/** El bloque «mismo cliente, mismo día»: el texto con los vuelos (enlaces) y la búsqueda por la suma. */
export interface BloqueMismoDia {
  piezas: PiezaLineaBanco[];
  enlace: EnlaceHoja;
}

/**
 * «Ese día Palma tiene 1 cobro más sin conciliar: Vuelo #380 · $29,540.50. Si
 * los pagó juntos, el abono trae la suma de los netos: $59,081.00.» + «Buscar
 * un abono por $59,081.00 (los 2 cobros del día)». Más de 5 vuelos: los 5
 * primeros y «y N más». Cada vuelo enlaza a su tarjeta de cobros. La suma es
 * `suma_netos` del API: el panel no suma.
 */
export function textoMismoDiaCliente(r: Pick<ConciliacionDeEntrada, "mismo_dia_cliente" | "entrada">): BloqueMismoDia | null {
  const m = r.mismo_dia_cliente;
  if (!m || !Array.isArray(m.cobros)) return null;
  const n = Math.max(Math.trunc(numeroDe(m.n)), m.cobros.length);
  if (n < 1) return null;
  const quien = textoONull(m.cliente) ?? textoONull(r.entrada.cliente_nombre);
  const piezas: PiezaLineaBanco[] = [
    { tipo: "texto", texto: `Ese día ${quien ?? "el cliente"} tiene ${n} ${n === 1 ? "cobro más" : "cobros más"} sin conciliar: ` },
  ];
  const visibles = m.cobros.slice(0, MAX_VUELOS_MISMO_DIA);
  visibles.forEach((c, i) => {
    if (i > 0) piezas.push({ tipo: "texto", texto: ", " });
    const texto = `Vuelo #${c.folio ?? "—"} · ${fmt(c.neto, m.moneda)}`;
    if (c.vuelo_id) {
      piezas.push({ tipo: "enlace", texto, href: `/admin/flights/${c.vuelo_id}#cobros`, titulo: TITULO_VUELO_DEL_LOTE });
    } else {
      piezas.push({ tipo: "texto", texto });
    }
  });
  const resto = n - visibles.length;
  piezas.push({
    tipo: "texto",
    texto: `${resto > 0 ? ` y ${resto} más` : ""}. Si los pagó juntos, el abono trae la suma de los netos: ${fmt(m.suma_netos, m.moneda)}.`,
  });
  const dia = fechaDia(m.dia);
  return {
    piezas,
    enlace: {
      etiqueta: `Buscar un abono por ${fmt(m.suma_netos, m.moneda)} (los ${n + 1} cobros del día)`,
      href: hrefBuscarAbonoPorSumaDelDia(m),
      titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
        dia ? ` del ${dia}` : ""
      }, filtrados por ${fmt(m.suma_netos, m.moneda)}: un solo depósito puede pagar todos los vuelos del cliente de ese día. Si pagó solo algunos, borra la búsqueda y busca por el nombre o por cada monto.`,
    },
  };
}

/**
 * El cobro se registró DESPUÉS de importar abonos pendientes de su ventana
 * (`cruce_no_corrio` del API): «Este cobro se registró el 8 oct 2026, 1:43
 * p.m., cuando ya estaban importados 4 abonos pendientes de esas fechas…» +
 * «Abrir Conciliación del 05 oct 2026 al 11 oct 2026». null sin el bloque.
 */
export function avisoCruceNoCorrio(
  r: Pick<ConciliacionDeEntrada, "cruce_no_corrio" | "entrada">,
): { texto: string; enlace: EnlaceHoja } | null {
  const c = r.cruce_no_corrio;
  if (!c) return null;
  const n = Math.trunc(numeroDe(c.abonos_previos));
  if (n < 1) return null;
  const cuando = textoONull(r.entrada.registrado_at) ? ` el ${fmtDateTime(r.entrada.registrado_at)}` : "";
  const importados = n === 1 ? "ya estaba importado 1 abono pendiente" : `ya estaban importados ${n} abonos pendientes`;
  const desde = fechaDia(c.desde) ?? c.desde;
  const hasta = fechaDia(c.hasta) ?? c.hasta;
  return {
    texto: `Este cobro se registró${cuando}, cuando ${importados} de esas fechas: el cruce automático solo corre al importar y no volvió a intentarlo. Pulsa «Cruzar pendientes» en Conciliación.`,
    enlace: {
      etiqueta: `Abrir Conciliación del ${desde} al ${hasta}`,
      href: hrefConciliacionCruzarPendientes(c),
      titulo: `Abre Conciliación en otra pestaña con los movimientos pendientes del ${desde} al ${hasta}: pulsa «Cruzar pendientes» para que el sistema vuelva a intentar el cruce de esas fechas.`,
    },
  };
}

/** La nota de D17: cuenta capturada «Paywise» con otro método. */
export function notaDestinoPasarela(metodoEtiqueta: string | null | undefined): string {
  return `La cuenta capturada es Paywise pero el método es «${
    textoONull(metodoEtiqueta) ?? "Transferencia"
  }»: los abonos de Paywise solo se cruzan solos con cobros «Link de pago (Paywise)». Si entró por Paywise, vincúlalo a mano en Conciliación (o corrige el método del cobro).`;
}

export interface AccionesPendienteEntrada {
  intro: string;
  /** «Este cobro se registró … cuando ya estaban importados N abonos pendientes…» (arriba, ámbar). */
  aviso: { texto: string; enlace: EnlaceHoja } | null;
  /** Los otros cobros del cliente ese día y su suma (arriba). */
  mismoDia: BloqueMismoDia | null;
  causas: string[];
  notas: string[];
  /** El primero va en negritas (la búsqueda principal). */
  enlaces: EnlaceHoja[];
  cobertura: { aviso: string | null; detalle: string | null } | null;
  notaFinal: string | null;
}

/** El día de referencia de la cobertura y de las búsquedas: el del anticipo / sobre si el cobro sale de ahí. */
function diaDeReferencia(r: ConciliacionDeEntrada): string | null {
  if (r.entrada.origen === "COBRO_VUELO" && r.anticipo && !r.anticipo.conciliado && esDiaValido(r.anticipo.dia)) {
    return r.anticipo.dia;
  }
  if (r.entrada.origen === "COBRO_VUELO" && r.sobre) return diaCancun(r.sobre.fecha_cobro ?? r.sobre.fecha) ?? r.entrada.dia;
  return esDiaValido(r.entrada.dia) ? r.entrada.dia : null;
}

/**
 * Qué cuentas cuentan para «¿hasta qué día hay estado de cuenta?» (las manda
 * el API: solo ACTIVAS): un ingreso ⇒ SU cuenta; un cobro de un anticipo sin
 * conciliar ⇒ la cuenta del anticipo; un cobro PAYWISE ⇒ las PASARELA; un
 * cobro con la cuenta capturada «Paywise» y otro método (D17) ⇒ las PASARELA
 * y las BANCO de su moneda; otro cobro ⇒ las BANCO de su moneda.
 */
function cuentasQueCuentan(r: ConciliacionDeEntrada): UltimoMovimientoCuenta[] {
  const um = (r.ultimos_movimientos ?? []).filter((u) => u?.cuenta);
  const e = r.entrada;
  if (e.origen === "INGRESO") return um.filter((u) => !!e.cuenta && u.cuenta.id === e.cuenta.id);
  if (r.anticipo && !r.anticipo.conciliado) return um.filter((u) => u.cuenta.id === r.anticipo?.cuenta_bancaria_id);
  if (e.metodo === "PAYWISE") return um.filter((u) => u.cuenta.tipo === "PASARELA");
  const pasarelaTambien = esCuentaCobroPasarela(e.cuenta_destino);
  return um.filter(
    (u) =>
      (u.cuenta.tipo !== "PASARELA" && u.cuenta.moneda === e.moneda) || (pasarelaTambien && u.cuenta.tipo === "PASARELA"),
  );
}

/** Margen del cruce de esta entrada: Paywise (método o cuenta pasarela de un ingreso) 5; lo demás 3. */
function margenCruce(r: ConciliacionDeEntrada): number {
  const e = r.entrada;
  if (e.metodo === "PAYWISE") return MARGEN_CRUCE_PAYWISE_DIAS;
  if (e.origen === "INGRESO" && e.cuenta?.tipo === "PASARELA") return MARGEN_CRUCE_PAYWISE_DIAS;
  return MARGEN_CRUCE_ABONO_DIAS;
}

/**
 * ¿Qué hay importado por cuenta? (`ultimos_movimientos` con `primera_fecha`).
 * `detalle` = «Movimientos importados por cuenta: HSBC USD del 01 sep 2026 al
 * 06 oct 2026.» (+ «Sin movimientos importados: …»); sin `primera_fecha`
 * (un API que no la manda), el de Gastos «Último movimiento importado por
 * cuenta: …». `aviso` = el PRIMERO que aplica: ninguna con movimientos; el
 * día es anterior a TODO lo importado; anterior a ALGUNAS cuentas; posterior
 * a lo importado; o dentro del margen del cruce. «del X al Y» no afirma que no
 * haya huecos. null sin `ultimos_movimientos` (no aplica o la lectura falló:
 * no se afirma nada).
 */
export function textoCoberturaEntrada(r: ConciliacionDeEntrada): { aviso: string | null; detalle: string | null } | null {
  if (!Array.isArray(r.ultimos_movimientos)) return null;
  const cuentas = cuentasQueCuentan(r);
  const conMov = cuentas.filter((u) => esDiaValido(u.ultima_fecha));
  if (conMov.length === 0) {
    return { aviso: "Todavía no hay estados de cuenta importados en las cuentas de este tipo de pago.", detalle: null };
  }
  const ingreso = r.entrada.origen === "INGRESO";
  const quien = ingreso ? "ingreso" : "cobro";
  const conPrimera = cuentas.some((u) => u.primera_fecha !== undefined);
  const sinMov = cuentas.filter((u) => !esDiaValido(u.ultima_fecha));
  const detalle = conPrimera
    ? `Movimientos importados por cuenta: ${conMov
        .map((u) =>
          esDiaValido(u.primera_fecha)
            ? `${u.cuenta.alias} del ${fmtDateOnly(u.primera_fecha as string)} al ${fmtDateOnly(u.ultima_fecha as string)}`
            : `${u.cuenta.alias} hasta el ${fmtDateOnly(u.ultima_fecha as string)}`,
        )
        .join(" · ")}.${sinMov.length > 0 ? ` Sin movimientos importados: ${sinMov.map((u) => u.cuenta.alias).join(", ")}.` : ""}`
    : `Último movimiento importado por cuenta: ${cuentas
        .map((u) => `${u.cuenta.alias} ${esDiaValido(u.ultima_fecha) ? fmtDateOnly(u.ultima_fecha as string) : "sin movimientos"}`)
        .join(" · ")}`;
  const dia = diaDeReferencia(r);
  if (!dia) return { aviso: null, detalle };
  const masReciente = [...conMov].sort((a, b) =>
    (a.ultima_fecha as string) < (b.ultima_fecha as string) ? 1 : (a.ultima_fecha as string) > (b.ultima_fecha as string) ? -1 : 0,
  )[0];
  const ultima = masReciente.ultima_fecha as string;
  const conPrimeraValida = conMov.filter((u) => esDiaValido(u.primera_fecha));
  let aviso: string | null = null;
  if (conPrimera && conPrimeraValida.length > 0) {
    const posteriores = conPrimeraValida.filter((u) => (u.primera_fecha as string) > dia);
    if (posteriores.length === conPrimeraValida.length) {
      const masAntigua = [...conPrimeraValida].sort((a, b) =>
        (a.primera_fecha as string) < (b.primera_fecha as string) ? -1 : (a.primera_fecha as string) > (b.primera_fecha as string) ? 1 : 0,
      )[0];
      aviso = `Ningún estado de cuenta importado de estas cuentas llega tan atrás: el más antiguo empieza el ${fmtDateOnly(
        masAntigua.primera_fecha as string,
      )} (${masAntigua.cuenta.alias}) y este ${quien} es del ${fmtDateOnly(dia)}. Importa el estado de cuenta de esas fechas en Conciliación: el ${quien} se cruza solo si el monto y la fecha coinciden.`;
    } else if (posteriores.length > 0) {
      aviso = `Del ${fmtDateOnly(dia)} no hay estado de cuenta importado en ${listaEs(
        posteriores.map((u) => `${u.cuenta.alias} (desde el ${fmtDateOnly(u.primera_fecha as string)})`),
      )}: si el cliente depositó ahí, importa ese periodo en Conciliación.`;
    }
  }
  if (!aviso && dia > ultima) {
    aviso = `Ningún estado de cuenta importado llega todavía al ${fmtDateOnly(dia)} (el más reciente es ${
      masReciente.cuenta.alias
    }, hasta el ${fmtDateOnly(ultima)}). Impórtalo en Conciliación: el ${quien} se cruza solo si el monto y la fecha coinciden.`;
  } else if (!aviso && diaMas(dia, margenCruce(r)) > ultima) {
    aviso = `El estado de cuenta importado más reciente llega al ${fmtDateOnly(
      ultima,
    )}: si el banco registró el abono unos días después del ${quien}, todavía no está importado.`;
  }
  return { aviso, detalle };
}

/** «Ver los abonos ya conciliados de esas fechas» con su `title`. */
function enlaceYaConciliados(
  dia: string | null,
  monto: number | string | null | undefined,
  moneda: string | null | undefined,
  cuenta: string | null,
): EnlaceHoja {
  const fecha = fechaDia(dia);
  return {
    etiqueta: BOTON_VER_ABONOS_CONCILIADOS,
    href: hrefVerAbonosConciliados({ dia, monto }, { cuenta }),
    titulo: `Abre en otra pestaña los abonos ya conciliados de ${VENTANA_YA_CONCILIADOS_DIAS} días antes y después${
      fecha ? ` del ${fecha}` : ""
    }${monto != null ? `, filtrados por ${fmt(monto, moneda)}` : ""}: si el abono está ligado a OTRO cobro o ingreso, puede ser un cobro duplicado.`,
  };
}

/** «Buscar abonos con el nombre «X»» con su `title` (null sin un nombre de 3 letras o más). */
function enlaceNombre(cliente: string | null | undefined, dia: string | null): EnlaceHoja | null {
  const nombre = nombreParaBuscar(cliente);
  const href = hrefBuscarAbonosPorNombre(cliente, dia);
  if (!nombre || !href) return null;
  const fecha = fechaDia(dia);
  return {
    etiqueta: `Buscar abonos con el nombre «${nombre}»`,
    href,
    titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
      fecha ? ` del ${fecha}` : ""
    } cuya leyenda menciona «${nombre}»: un solo abono puede pagar varios vuelos del mismo cliente. Si el depósito no trae el nombre, la lista sale vacía: usa la búsqueda por monto.`,
  };
}

function enlaceOmitidos(dia: string | null): EnlaceHoja | null {
  if (!hayPestanaOmitidos()) return null;
  return {
    etiqueta: BOTON_VER_OMITIDOS,
    href: hrefVerOmitidos(dia),
    titulo: "Abre en otra pestaña los movimientos omitidos de la conciliación de esas fechas.",
  };
}

/** «Conciliarlo en «Por conciliar»» (ingreso o anticipo) con su `title`. */
function enlacePorConciliar(
  etiqueta: string,
  x: { dia: string | null; cuentaId: string | null; cuentaAlias: string | null },
  hoy: string,
): EnlaceHoja | null {
  if (!x.dia) return null;
  return {
    etiqueta,
    href: hrefPorConciliarIngreso({ fecha: x.dia, cuenta_bancaria_id: x.cuentaId }, hoy),
    titulo: `Abre en otra pestaña los abonos por identificar${x.cuentaAlias ? ` de ${x.cuentaAlias}` : ""} de 7 días antes a 30 días después del ${fmtDateOnly(
      x.dia,
    )}.`,
  };
}

/**
 * El bloque «¿Qué hacer?» de una entrada SIN_CONCILIAR, PARCIAL o conciliada
 * sin abonos (null en lo demás y en un ingreso dado de baja): intro, el aviso
 * de «el cruce no corrió», los cobros del mismo día, causas (las que aplican
 * a ESTA entrada), notas (USD, Paywise, cuenta capturada «Paywise»), las
 * búsquedas en Conciliación / «Por conciliar» y qué hay importado por cuenta.
 * `hoy` (día Cancún) acota «Por conciliar».
 */
export function accionesPendienteEntrada(r: ConciliacionDeEntrada, hoy: string): AccionesPendienteEntrada | null {
  const e = r.entrada;
  const abonos = Array.isArray(r.abonos) ? r.abonos : [];
  if (e.dado_de_baja) return null;
  const conciliadoSinAbonos = (r.estado === "CONCILIADO" || r.estado === "VIA_ANTICIPO") && abonos.length === 0;
  if (r.estado !== "SIN_CONCILIAR" && r.estado !== "PARCIAL" && !conciliadoSinAbonos) return null;
  const dia = diaDeReferencia(r);
  const fecha = fechaDia(dia);
  const vacio: AccionesPendienteEntrada = {
    intro: "",
    aviso: null,
    mismoDia: null,
    causas: [],
    notas: [],
    enlaces: [],
    cobertura: null,
    notaFinal: null,
  };

  if (conciliadoSinAbonos) {
    // Vía anticipo: el abono es el del ANTICIPO (su día, su monto y su cuenta).
    const a = r.estado === "VIA_ANTICIPO" ? r.anticipo : null;
    const abrir = a ? enlaceAbrirAnticipo(r) : null;
    return {
      ...vacio,
      intro: INTRO_CONCILIADO_SIN_ABONOS,
      enlaces: [
        a
          ? enlaceYaConciliados(esDiaValido(a.dia) ? a.dia : dia, a.monto, a.moneda, a.cuenta_bancaria_id)
          : enlaceYaConciliados(dia, e.neto, e.moneda, e.origen === "INGRESO" ? (e.cuenta?.id ?? null) : null),
        ...(abrir ? [abrir] : []),
      ],
    };
  }

  const cobertura = textoCoberturaEntrada(r);
  const causaImportado = `Que el estado de cuenta de esas fechas ya esté importado${cobertura ? " (abajo, qué fechas hay por cuenta)" : ""}.`;

  if (e.origen === "INGRESO") {
    const alias = e.cuenta?.alias ?? null;
    const porConciliar = enlacePorConciliar(BOTON_CONCILIAR_INGRESO, { dia, cuentaId: e.cuenta?.id ?? null, cuentaAlias: alias }, hoy);
    return {
      ...vacio,
      intro: `El cruce automático corre al importar el estado de cuenta de ${
        alias ?? "su cuenta"
      } y al registrar el ingreso: liga un abono de esa cuenta que trae el neto o el bruto del ingreso (hasta $1.00 de diferencia), con hasta 3 días de diferencia (pasarela: 5), cuando ningún cobro de vuelo cuadra igual. Si no se cruzó, revisa:`,
      causas: [
        causaImportado,
        "Que el dinero no haya entrado a otra cuenta (corrige la cuenta del ingreso).",
        "Que un cobro de vuelo del mismo monto no lo esté reclamando: en ese caso se vincula a mano.",
        CAUSA_LIGADO_A_OTRO,
        ...(hayPestanaOmitidos() ? [CAUSA_OMITIDO] : []),
      ],
      enlaces: [
        ...(porConciliar ? [porConciliar] : []),
        enlaceYaConciliados(dia, e.neto, e.moneda, e.cuenta?.id ?? null),
      ],
      cobertura,
      notaFinal: NOTA_CRUZAR_PENDIENTES,
    };
  }

  // ── Cobro de vuelo
  if (r.estado === "PARCIAL") {
    const faltante = r.cobertura?.faltante ?? null;
    const hrefFalta = hrefBuscarAbonoQueFalta({ dia: e.dia, faltante });
    const buscar: EnlaceHoja = hrefFalta
      ? {
          etiqueta: BOTON_BUSCAR_ABONO_QUE_FALTA,
          href: hrefFalta,
          titulo: `Abre en otra pestaña los movimientos pendientes de 7 días antes a 30 días después${
            fecha ? ` del ${fecha}` : ""
          }, filtrados por ${fmt(faltante, e.moneda)}, lo que falta.`,
        }
      : {
          etiqueta: BOTON_BUSCAR_ABONO_QUE_FALTA,
          href: hrefBuscarAbonoEnConciliacion({ dia: e.dia, monto: e.neto }),
          titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
            fecha ? ` del ${fecha}` : ""
          }, filtrados por ${fmt(e.neto, e.moneda)}.`,
        };
    const nombre = enlaceNombre(e.cliente_nombre, dia);
    return {
      ...vacio,
      intro: INTRO_PARCIAL_ENTRADA,
      enlaces: [
        buscar,
        ...(nombre ? [nombre] : []),
        enlaceYaConciliados(dia, faltante != null && numeroDe(faltante) > 0 ? faltante : e.neto, e.moneda, null),
      ],
      cobertura,
      notaFinal: NOTA_CRUZAR_PENDIENTES,
    };
  }

  if (r.anticipo) {
    const a = r.anticipo;
    const alias =
      (r.ultimos_movimientos ?? []).find((u) => u?.cuenta?.id === a.cuenta_bancaria_id)?.cuenta.alias ?? null;
    const porConciliar = enlacePorConciliar(
      `Conciliar el anticipo ${a.etiqueta} en «Por conciliar»`,
      { dia: esDiaValido(a.dia) ? a.dia : null, cuentaId: a.cuenta_bancaria_id, cuentaAlias: alias },
      hoy,
    );
    const abrir = enlaceAbrirAnticipo(r);
    return {
      ...vacio,
      intro: `Este cobro salió del anticipo ${a.etiqueta}: su dinero se concilia UNA sola vez, en el anticipo. Vincula el abono al anticipo (no al cobro) en «Por conciliar».`,
      enlaces: [...(porConciliar ? [porConciliar] : []), ...(abrir ? [abrir] : [])],
      cobertura,
      notaFinal: NOTA_CRUZAR_PENDIENTES,
    };
  }

  if (r.sobre) {
    const s = r.sobre;
    const nombre = textoONull(s.grupo_nombre);
    const grupo = enlaceAbrirGrupo(r);
    return {
      ...vacio,
      intro: `Este cobro es parte del sobre ${etiquetaSobre(r)}${
        nombre ? ` («${nombre}»)` : ""
      }: su dinero se concilia UNA sola vez, en el sobre del grupo. Vincula el abono al SOBRE (no a esta parte) en Conciliación.`,
      enlaces: [
        {
          etiqueta: BOTON_BUSCAR_ABONO_SOBRE,
          href: hrefBuscarAbonoEnConciliacion({ dia, monto: s.neto }),
          titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
            fecha ? ` del ${fecha}` : ""
          }, filtrados por ${fmt(s.neto, s.moneda)}, lo que el banco debió depositar por el sobre completo.`,
        },
        ...(grupo ? [grupo] : []),
      ],
      cobertura,
      notaFinal: NOTA_CRUZAR_PENDIENTES,
    };
  }

  // ── Cobro «Sin conciliar» libre (sin sobre ni anticipo)
  const aviso = avisoCruceNoCorrio(r);
  const mismoDia = textoMismoDiaCliente(r);
  const paywise = e.metodo === "PAYWISE";
  const cuentaPaywise = paywise
    ? cuentaUnica((r.ultimos_movimientos ?? []).filter((u) => u?.cuenta?.tipo === "PASARELA").map((u) => u.cuenta.id))
    : null;
  const causas = [
    causaImportado,
    ...(aviso ? [] : [CAUSA_REGISTRADO_DESPUES]),
    mismoDia ? `${CAUSA_VARIOS_VUELOS} Arriba están sus cobros de ese día y su suma.` : CAUSA_VARIOS_VUELOS,
    ...(r.varios_abonos_por_cobro === true ? [CAUSA_VARIAS_TRANSFERENCIAS] : []),
    CAUSA_OTRO_MONTO,
    CAUSA_MISMO_MONTO,
    CAUSA_LIGADO_A_OTRO,
    ...(hayPestanaOmitidos() ? [CAUSA_OMITIDO] : []),
    CAUSA_OTRA_CUENTA_COBRO,
  ];
  const notas = [
    ...(e.moneda === "USD" ? [NOTA_COBRO_USD] : []),
    ...(paywise ? [NOTA_COBRO_PAYWISE] : []),
    ...(!paywise && esCuentaCobroPasarela(e.cuenta_destino) ? [notaDestinoPasarela(e.metodo_etiqueta)] : []),
  ];
  const nombre = enlaceNombre(e.cliente_nombre, dia);
  const omitidos = enlaceOmitidos(dia);
  const enlaces: EnlaceHoja[] = [
    {
      etiqueta: BOTON_BUSCAR_ABONO,
      href: hrefBuscarAbonoEnConciliacion({ dia, monto: e.neto }, { cuenta: cuentaPaywise }),
      titulo: `Abre en otra pestaña los movimientos pendientes de ${VENTANA_CARGO_DIAS} días antes y después${
        fecha ? ` del ${fecha}` : ""
      }, filtrados por ${fmt(e.neto, e.moneda)}. Borra la búsqueda si el abono trae otro monto (varios cobros, comisión o un pago en partes).`,
    },
    ...(nombre ? [nombre] : []),
    enlaceYaConciliados(dia, e.neto, e.moneda, null),
    ...(paywise
      ? [
          {
            etiqueta: BOTON_AUDITORIA_PAYWISE,
            href: hrefConciliacion({ f: "paywise" }),
            titulo: "Abre en otra pestaña la Auditoría Paywise: concilia lo que cuadra y corrige la comisión del cobro.",
          },
        ]
      : []),
    ...(omitidos ? [omitidos] : []),
  ];
  return {
    intro: INTRO_COBRO_SIN_CONCILIAR,
    aviso,
    mismoDia,
    causas,
    notas,
    enlaces,
    cobertura,
    notaFinal: NOTA_CRUZAR_PENDIENTES,
  };
}
