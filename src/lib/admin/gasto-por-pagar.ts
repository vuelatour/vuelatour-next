/**
 * Gastos «por pagar» (fecha a futuro) — 19-oct-2026, API 0.0.95, contrato §7.
 *
 * Pedido del cliente: «que se puedan capturar gastos a futuro en la app y en
 * el admin, a veces yo anoto cosas que ya sé que voy a pagar en efectivo al
 * día siguiente para que no se me olvide». Decisiones (no se vuelven a
 * preguntar): hasta fin de mes, para todos los roles, con estado «por pagar».
 * La fecha del gasto es la FECHA DEL PAGO (13-oct-2026): un gasto con fecha
 * futura todavía no se paga; nace «por pagar» y se confirma con «Marcar
 * pagado» (la fecha queda la del pago real, ≤ hoy).
 *
 * El API decide TODO (invariante «por pagar» del API): el estado
 * (`estado_pago` 'PAGADO' | 'POR_PAGAR' | 'VENCIDO'), el tope de fecha
 * (`config.gasto_fecha_max`), el filtro `?por_pagar=1`, el renglón del
 * pre-cierre y la caja chica. Aquí solo se PINTA y se decide la UI: la
 * capacidad, la nota de la captura, cuándo se pide la confirmación de «fecha
 * futura», el chip, el diálogo «Marcar pagado» y sus textos.
 *
 * SKEW: la CAPACIDAD es `config.gastos_por_pagar === true` de `/v1/me`. Sin
 * ella (API previo o migración pendiente) TODO queda como antes: sin nota,
 * la confirmación de siempre, sin filtro, sin chip (ninguna llave nueva
 * viaja). PURO: sin React ni red.
 */
import { todayCancun } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import { fechaGastoSospechosa } from "@/lib/admin/fecha-gasto";
import { diaMas } from "@/lib/admin/conciliacion-auto";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { MSG_SERVIDOR_NO_RESPONDIO, esErrorTecnico } from "@/lib/admin/errores-tecnicos";

// =============================================================================
// Capacidad (`/v1/me` → config)
// =============================================================================

/** Lo que el panel sabe del API: ¿hay gastos por pagar? y el tope de la fecha. */
export interface CapacidadPorPagar {
  /** `config.gastos_por_pagar === true` (migración + API 0.0.95). */
  habilitado: boolean;
  /** `config.gasto_fecha_max` («YYYY-MM-DD», día Cancún) o null. */
  fechaMax: string | null;
}

/** Sin capacidad: el comportamiento de siempre. */
export const SIN_CAPACIDAD_POR_PAGAR: CapacidadPorPagar = Object.freeze({
  habilitado: false,
  fechaMax: null,
});

type MeConfigPorPagar =
  | { config?: { gastos_por_pagar?: unknown; gasto_fecha_max?: unknown } | null }
  | null
  | undefined;

/**
 * La capacidad desde `/v1/me` (validada): solo `true` estricto enciende; un
 * tope que no es un día real se ignora (sin tope, el API decide al guardar).
 */
export function capacidadPorPagarDeMe(me: MeConfigPorPagar): CapacidadPorPagar {
  const c = me?.config ?? null;
  if (c?.gastos_por_pagar !== true) return SIN_CAPACIDAD_POR_PAGAR;
  const tope = typeof c.gasto_fecha_max === "string" && esDiaValido(c.gasto_fecha_max) ? c.gasto_fecha_max : null;
  return { habilitado: true, fechaMax: tope };
}

// =============================================================================
// La fecha de la captura (alta y «Verificar / editar»)
// =============================================================================

/** Último día del mes de `hoy` («2026-10-19» ⇒ «2026-10-31»; bisiestos). */
export function finDeMesDia(hoy: string): string {
  if (!esDiaValido(hoy)) return hoy;
  const [y, m] = hoy.split("-").map(Number);
  // Día 0 del mes siguiente = último día de este (UTC: sin zona).
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

/**
 * Hasta qué día una fecha futura NO pide la confirmación de «fecha futura»:
 * el fin de mes (el último día del mes sigue aceptando mañana, como la regla
 * de campo del API) y nunca más allá del tope del API. Más allá (oficina
 * hasta hoy + 30), la confirmación de siempre (contrato §7).
 */
export function limiteSinConfirmarPorPagar(hoy: string, fechaMax: string | null): string {
  const finMes = finDeMesDia(hoy);
  const manana = diaMas(hoy, 1);
  const base = finMes > manana ? finMes : manana;
  return fechaMax !== null && fechaMax < base ? fechaMax : base;
}

export interface EvaluacionFechaGasto {
  /** Con la capacidad y fecha > hoy (hasta el tope): la nota ámbar. */
  quedaPorPagar: boolean;
  /** ¿Pide el diálogo «Confirma la fecha del gasto»? */
  pideConfirmacion: boolean;
}

/**
 * La regla ÚNICA de la fecha de un gasto en la captura (alta, «Verificar /
 * editar», refacción, combustible y caja chica viven en esos dos diálogos):
 *  - Sin capacidad (o fecha ≤ hoy): idéntico a hoy — confirma solo una fecha
 *    «sospechosa» (> 60 días atrás o > 2 días a futuro).
 *  - Con capacidad y fecha > hoy: queda POR PAGAR (nota) mientras no pase del
 *    tope del API; no pide confirmación hasta fin de mes (o el tope, si es
 *    antes); más allá, la confirmación de siempre.
 * Una fecha ilegible no decide nada (la valida el formulario).
 */
export function evaluarFechaGasto(
  fecha: string | null | undefined,
  capacidad: CapacidadPorPagar,
  hoy: string = todayCancun(),
): EvaluacionFechaGasto {
  const f = (fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { quedaPorPagar: false, pideConfirmacion: false };
  const sospechosa = fechaGastoSospechosa(f, hoy);
  if (!capacidad.habilitado || f <= hoy) return { quedaPorPagar: false, pideConfirmacion: sospechosa };
  const quedaPorPagar = capacidad.fechaMax === null || f <= capacidad.fechaMax;
  const sinConfirmar = f <= limiteSinConfirmarPorPagar(hoy, capacidad.fechaMax);
  return { quedaPorPagar, pideConfirmacion: sospechosa && !sinConfirmar };
}

/** Nota ámbar EXACTA bajo «Fecha del gasto» (contrato §7). */
export const NOTA_QUEDARA_POR_PAGAR =
  "Quedará POR PAGAR: el día que lo pagues, márcalo pagado (la fecha del gasto es la del pago).";

/**
 * «Verificar / editar» de un gasto que YA está por pagar con una fecha ≤ hoy:
 * cambiar la fecha no lo marca pagado (el API conserva `por_pagar`); se dice
 * cuál es el camino.
 */
export const NOTA_SIGUE_POR_PAGAR =
  "Este gasto sigue POR PAGAR: cambiar la fecha no lo marca pagado. Cuando se pague, usa «Marcar pagado» (menú ⋯ del gasto).";

/**
 * Captura de un gasto que YA está pagado (revisión del 19-oct-2026, P17/P18):
 * «Créalo por la suma» (nace ligado a cargos del banco: el cargo ES el pago)
 * o «Verificar / editar» de un gasto CONCILIADO (el banco prueba el pago; el
 * API lo da por PAGADO). Ninguno puede quedar «por pagar».
 */
export interface GastoYaPagado {
  conCargos?: boolean;
  conciliado?: boolean;
}

/**
 * La capacidad que manda en la FECHA de esa captura: con cargos o conciliado
 * ⇒ como SIN la capacidad (la confirmación de «fecha futura» de siempre y
 * jamás la nota «Quedará POR PAGAR», que sería falsa); si no, la de `/me`.
 */
export function capacidadFechaCaptura(capacidad: CapacidadPorPagar, ctx: GastoYaPagado = {}): CapacidadPorPagar {
  return ctx.conCargos === true || ctx.conciliado === true ? SIN_CAPACIDAD_POR_PAGAR : capacidad;
}

/**
 * «Créalo por la suma» con una fecha futura (P17): con la capacidad el API
 * respondería 400 `POR_PAGAR_FECHA_FUTURA` (un cargo del banco ya es el
 * pago); el panel lo dice bajo la fecha y no deja guardar.
 */
export const MSG_FECHA_FUTURA_CON_CARGOS =
  "Con cargos del banco la fecha del gasto es la del pago (la del último cargo): no puede ser futura.";

/** Error de la fecha de «Créalo por la suma» (o null): con la capacidad y fecha > hoy. Sin ella, como antes. */
export function errorFechaFuturaConCargos(
  fecha: string | null | undefined,
  capacidad: CapacidadPorPagar,
  hoy: string = todayCancun(),
): string | null {
  if (!capacidad.habilitado) return null;
  const f = (fecha ?? "").slice(0, 10);
  return esDiaValido(f) && f > hoy ? MSG_FECHA_FUTURA_CON_CARGOS : null;
}

/** La nota de la captura (o null): fecha nueva, capacidad y el estado GUARDADO (solo en «Verificar / editar»). */
export function notaFechaPorPagar(
  fecha: string | null | undefined,
  capacidad: CapacidadPorPagar,
  estadoGuardado: EstadoPago | null = null,
  hoy: string = todayCancun(),
): string | null {
  if (!capacidad.habilitado) return null;
  if (evaluarFechaGasto(fecha, capacidad, hoy).quedaPorPagar) return NOTA_QUEDARA_POR_PAGAR;
  if (estadoGuardado !== null && estadoGuardado !== "PAGADO") return NOTA_SIGUE_POR_PAGAR;
  return null;
}

// =============================================================================
// Estado de pago (lo calcula el API: `estado_pago`)
// =============================================================================

export type EstadoPago = "PAGADO" | "POR_PAGAR" | "VENCIDO";

const ESTADOS_PAGO: readonly EstadoPago[] = ["PAGADO", "POR_PAGAR", "VENCIDO"];

/** `estado_pago` del API validado; ausente o desconocido ⇒ null (= no se pinta nada). */
export function estadoPagoDe(g: { estado_pago?: unknown } | null | undefined): EstadoPago | null {
  const v = g?.estado_pago;
  return typeof v === "string" && (ESTADOS_PAGO as readonly string[]).includes(v) ? (v as EstadoPago) : null;
}

/** «Por pagar vigente» = el API dice ≠ PAGADO. Sin la llave ⇒ false. */
export function porPagarVigente(g: { estado_pago?: unknown } | null | undefined): boolean {
  const e = estadoPagoDe(g);
  return e !== null && e !== "PAGADO";
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** «20 oct» de un día de pared («YYYY-MM-DD»); ilegible ⇒ null. */
export function diaMesCorto(fecha: string | null | undefined): string | null {
  const f = (fecha ?? "").slice(0, 10);
  if (!esDiaValido(f)) return null;
  return `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}`;
}

/** «20 oct 2026» (para títulos y textos largos). */
function diaMesAnio(fecha: string | null | undefined): string | null {
  const corto = diaMesCorto(fecha);
  return corto ? `${corto} ${(fecha ?? "").slice(0, 4)}` : null;
}

export interface ChipEstadoPago {
  estado: Exclude<EstadoPago, "PAGADO">;
  /** «Por pagar · 20 oct» / «Vencido · 20 oct». */
  texto: string;
  tono: "ambar" | "rojo";
  /** Qué significa y qué hacer. */
  titulo: string;
}

/**
 * El chip junto a la fecha del gasto. Solo con `estado_pago` del API y ≠
 * PAGADO; un conciliado ya llega como PAGADO (el banco prueba el pago).
 */
export function chipEstadoPago(g: { estado_pago?: unknown; fecha_gasto?: string | null }): ChipEstadoPago | null {
  const estado = estadoPagoDe(g);
  if (estado === null || estado === "PAGADO") return null;
  const corto = diaMesCorto(g.fecha_gasto);
  const largo = diaMesAnio(g.fecha_gasto);
  if (estado === "POR_PAGAR") {
    return {
      estado,
      texto: corto ? `Por pagar · ${corto}` : "Por pagar",
      tono: "ambar",
      titulo: `Por pagar${largo ? `: se pagará el ${largo}` : ""}. Cuando se pague, márcalo pagado con la fecha real del pago (la fecha del gasto es la del pago).`,
    };
  }
  return {
    estado,
    texto: corto ? `Vencido · ${corto}` : "Vencido",
    tono: "rojo",
    titulo: `Vencido${largo ? `: debía pagarse el ${largo}` : ""} y nadie lo ha marcado pagado. Márcalo pagado con la fecha real del pago, o elimínalo si no se pagó.`,
  };
}

/** Clases del chip por tono (ámbar = por pagar; rojo = vencido). */
export const CLASES_CHIP_ESTADO_PAGO: Readonly<Record<ChipEstadoPago["tono"], string>> = {
  ambar: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rojo: "border-destructive/50 bg-destructive/10 text-destructive dark:text-red-400",
};

// =============================================================================
// «Marcar pagado» (PATCH /v1/expenses/:id {por_pagar:false, fecha_gasto, if_updated_at})
// =============================================================================

export const TEXTO_MARCAR_PAGADO = "Marcar pagado";
export const TITULO_MARCAR_PAGADO = "Marcar pagado";
export const ETIQUETA_FECHA_PAGO = "Fecha del pago";
export const AYUDA_FECHA_PAGO = "El día en que se pagó (hoy o antes). Esa queda como la fecha del gasto.";
export const TEXTO_GUARDANDO_PAGADO = "Guardando…";
export const TITULO_CHIP_BOTON = "Clic para marcarlo pagado.";

/** Lo que el diálogo necesita del gasto (también sirve un renglón de la caja chica). */
export interface GastoPorPagar {
  id: string;
  fecha_gasto: string | null;
  monto: string | number | null;
  moneda: string | null;
  categoria: string | null;
  /** Para el control de versión (`if_updated_at`); ausente ⇒ no viaja. */
  updated_at?: string | null;
  estado_pago?: unknown;
}

/** «Taxi / estacionamiento · $500 MXN · por pagar el 20 oct 2026» / «… · vencido desde el 15 oct 2026» (descripción del diálogo). */
export function resumenGastoPorPagar(g: GastoPorPagar): string {
  const partes: string[] = [];
  if (g.categoria) partes.push(categoriaGastoLabel(g.categoria));
  const monto = fmtMonto(g.monto, g.moneda);
  if (monto !== "—") partes.push(monto);
  const estado = estadoPagoDe(g);
  const largo = diaMesAnio(g.fecha_gasto);
  if (largo) partes.push(estado === "VENCIDO" ? `vencido desde el ${largo}` : `por pagar el ${largo}`);
  return partes.join(" · ");
}

export const DESCRIPCION_MARCAR_PAGADO =
  "Elige el día en que se pagó: esa queda como la fecha del gasto (la fecha del gasto es la del pago).";

/** Error de la fecha del pago (o null): día real y nunca después de hoy. */
export function errorFechaPago(fecha: string | null | undefined, hoy: string = todayCancun()): string | null {
  const f = (fecha ?? "").trim();
  if (!esDiaValido(f)) return "Elige la fecha del pago.";
  if (f > hoy) return "La fecha del pago no puede ser después de hoy: márcalo pagado el día que se pague.";
  return null;
}

/** Cuerpo EXACTO del PATCH (el control de versión solo si se conoce). */
export function cuerpoMarcarPagado(input: {
  fecha_gasto: string;
  if_updated_at?: string | null;
}): { por_pagar: false; fecha_gasto: string; if_updated_at?: string } {
  return {
    por_pagar: false,
    fecha_gasto: input.fecha_gasto,
    ...(typeof input.if_updated_at === "string" && input.if_updated_at ? { if_updated_at: input.if_updated_at } : {}),
  };
}

/** Validación de la server action ANTES de la red (null = todo bien). */
export function validarMarcarPagado(
  id: unknown,
  input: { fecha_gasto?: unknown } | null | undefined,
  hoy: string = todayCancun(),
): string | null {
  if (typeof id !== "string" || !esUuid(id)) return "Ese gasto no es válido: recarga la página.";
  return errorFechaPago(typeof input?.fecha_gasto === "string" ? input.fecha_gasto : null, hoy);
}

/** Toast del éxito: «Gasto marcado pagado · 19 oct 2026». */
export function toastMarcadoPagado(fecha: string): string {
  const largo = diaMesAnio(fecha);
  return largo ? `Gasto marcado pagado · ${largo}` : "Gasto marcado pagado";
}

export const MSG_MARCAR_PAGADO_INCIERTO =
  "No se pudo confirmar si el gasto quedó marcado pagado: se recargó la lista para ver cómo quedó.";
export const MSG_GASTO_YA_NO_EXISTE = "Ese gasto ya no existe (alguien lo eliminó): se recargó la lista.";
export const MSG_MARCAR_PAGADO_FALLO = `No se pudo marcar pagado. ${MSG_SERVIDOR_NO_RESPONDIO}`;
export const MSG_CONFLICTO_VERSION_PAGADO =
  "Alguien modificó este gasto mientras lo veías: se recargó la lista. Revísalo y vuelve a marcarlo pagado si sigue por pagar.";

/** Lo que devuelve la server action (`ActionResult` con code/status). */
interface ResultadoAccion {
  ok: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
}

export interface ErrorMarcarPagado {
  texto: string;
  /** true ⇒ cerrar el diálogo y recargar (la lista que se ve ya no es la vigente). */
  recargar: boolean;
}

/**
 * Qué decir de un rechazo: los errores del API TAL CUAL (vienen en es-MX:
 * `POR_PAGAR_FECHA_FUTURA`, `POR_PAGAR_NO_DISPONIBLE`, `GASTO_AJENO`…); el
 * 409 `CONFLICTO_VERSION` con su texto y recarga; sin respuesta o un 5xx
 * técnico ⇒ «no se pudo confirmar» y recarga (pudo escribirse); un 404 ⇒
 * recarga; un 4xx técnico (inglés) ⇒ «No se pudo marcar pagado…».
 */
export function mensajeErrorMarcarPagado(r: ResultadoAccion): ErrorMarcarPagado {
  const texto = (r.error ?? "").trim();
  if (r.code === "CONFLICTO_VERSION") {
    return { texto: texto && !esErrorTecnico(r) ? texto : MSG_CONFLICTO_VERSION_PAGADO, recargar: true };
  }
  // Sin respuesta (red, deploy) o un 5xx técnico: el PATCH pudo escribirse.
  if (r.code === "SIN_CONEXION" || r.status == null || (r.status >= 500 && esErrorTecnico(r))) {
    return { texto: MSG_MARCAR_PAGADO_INCIERTO, recargar: true };
  }
  // Un 5xx con texto del API (503 `POR_PAGAR_NO_DISPONIBLE`: «…avisa a
  // sistemas.»): tal cual; se recarga por si acaso.
  if (r.status >= 500) return { texto, recargar: true };
  if (r.status === 404) {
    return { texto: texto && !esErrorTecnico(r) ? texto : MSG_GASTO_YA_NO_EXISTE, recargar: true };
  }
  if (esErrorTecnico(r)) return { texto: MSG_MARCAR_PAGADO_FALLO, recargar: false };
  return { texto, recargar: false };
}

// =============================================================================
// Filtro «Por pagar» de Gastos (`?por_pagar=1`; viaja también al Excel)
// =============================================================================

export const PARAM_POR_PAGAR = "por_pagar";
/** Valor que el panel escribe en la URL. */
export const VALOR_URL_POR_PAGAR = "1";

/** ¿La URL pide «Por pagar»? (`1` o `true`, como acepta el API). */
export function porPagarDeUrl(valor: string | null | undefined): boolean {
  return valor === "1" || valor === "true";
}

export const ETIQUETA_FILTRO_PAGO = "Pago";
export const OPCION_FILTRO_POR_PAGAR = "Por pagar";
export const DESCRIPCION_OPCION_POR_PAGAR = "Con fecha a futuro o vencidos, sin marcar pagados";

export const TITULO_POR_PAGAR_IGNORADO = "El filtro «Por pagar» todavía no está disponible";
export const DESCRIPCION_POR_PAGAR_IGNORADO =
  "El servidor aún no tiene los gastos por pagar: se muestran todos los gastos con los demás filtros.";

/**
 * El vacío de «Por pagar» (acuerdo 1 del lote, 19-oct-2026): Gastos SIEMPRE
 * excluye la nómina (vive en su módulo), así que no puede afirmar que «todos
 * están marcados pagados» — una nómina por pagar no sale aquí.
 */
export const VACIO_POR_PAGAR = {
  titulo: "Sin gastos por pagar",
  descripcion: "Ningún gasto con estos filtros espera su pago. La nómina por pagar se marca en Nómina.",
} as const;

// =============================================================================
// Pre-cierre: renglón BLOQUEANTE `gastos_por_pagar`
// =============================================================================

export const CLAVE_PRECIERRE_GASTOS_POR_PAGAR = "gastos_por_pagar";

/**
 * «Resolver →» = Gastos con el filtro «Por pagar», SIN `desde`/`hasta`
 * (acuerdo 1 del lote, 19-oct-2026): el API cuenta el renglón por el MES
 * CONTABLE del gasto (eje vuelo ⇒ el mes de su vuelo), así que un por pagar
 * del periodo puede traer su `fecha_gasto` (la del pago) en otro mes y el
 * rango lo escondería. Cuáles son lo dicen los `ids` del foco (los agrega
 * `hrefResolverItem`; el periodo viaja en `pcp` para «Volver al
 * pre-cierre»). La nómina va a Nómina: `pre-cierre-por-pagar.ts`.
 */
export function hrefPrecierreGastosPorPagar(): string {
  return `/admin/expenses?${PARAM_POR_PAGAR}=${VALOR_URL_POR_PAGAR}`;
}

/**
 * Nota de la franja del pre-cierre en Gastos para este renglón: el `count` y
 * el detalle del API incluyen la nómina por pagar, que Gastos no enseña.
 */
export const NOTA_VISTA_POR_PAGAR_GASTOS = "La nómina por pagar no sale en Gastos: se marca pagada en Nómina.";

// =============================================================================
// «Historial de gastos» del vuelo: la columna `por_pagar` de la bitácora
// =============================================================================

/** Etiqueta del campo (revisión del 19-oct-2026, P20): «Pago: Por pagar → Pagado». */
export const ETIQUETA_HISTORIAL_POR_PAGAR = "Pago";
export const VALOR_HISTORIAL_POR_PAGAR = "Por pagar";
export const VALOR_HISTORIAL_PAGADO = "Pagado";

/** El valor de `por_pagar` del diff de la bitácora en es-MX (jamás «true»/«false»). */
export function valorHistorialPorPagar(v: unknown): string {
  return v === true ? VALOR_HISTORIAL_POR_PAGAR : VALOR_HISTORIAL_PAGADO;
}

// =============================================================================
// Caja chica: «Por pagar (aún no sale de la caja)» (aditivo del detalle)
// =============================================================================

export interface PorPagarCajaItem {
  id: string;
  fecha_gasto: string | null;
  monto: number | string;
  moneda: string;
  categoria: string | null;
  concepto: string | null;
  estado_pago?: unknown;
}

export const TITULO_POR_PAGAR_CAJA = "Por pagar (aún no sale de la caja)";
export const DESCRIPCION_POR_PAGAR_CAJA =
  "Gastos en efectivo con fecha a futuro (o vencidos) que todavía no se pagan: no cuentan en el saldo ni en lo por reponer hasta marcarlos pagados.";

/**
 * La lista aditiva validada (ordenada por fecha como la manda el API). Sin la
 * llave (API previo), `null` o vacía ⇒ null = el bloque no se pinta.
 */
export function porPagarDeFondo(fondo: {
  por_pagar?: unknown;
  por_pagar_total?: unknown;
}): { items: PorPagarCajaItem[]; total: number | null } | null {
  if (!Array.isArray(fondo.por_pagar) || fondo.por_pagar.length === 0) return null;
  const items = (fondo.por_pagar as unknown[]).filter(
    (x): x is PorPagarCajaItem =>
      !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string",
  );
  if (items.length === 0) return null;
  const t = Number(fondo.por_pagar_total);
  return { items, total: fondo.por_pagar_total == null || !Number.isFinite(t) ? null : t };
}

/** «3 gastos por pagar» / «1 gasto por pagar». */
export function textoConteoPorPagarCaja(n: number): string {
  return `${n} ${n === 1 ? "gasto" : "gastos"} por pagar`;
}
