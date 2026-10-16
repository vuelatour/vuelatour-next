/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» entre cotizaciones — 24-sep-2026.
 *
 * Pedido de Itzi (audio): «ya le piqué al vuelo del 20 de septiembre. Y si
 * hay una flechita arriba, pues me brinca el siguiente vuelito, ya sea de ese
 * mismo día o … hasta el siguiente día … estando adentro de la cotización me
 * pueda brincar a la siguiente».
 *
 * Quién decide QUÉ vuelo es el vecino: el API (`GET /v1/quotes/:id/vecinos`,
 * orden cronológico por fecha de vuelo con empate por folio, MISMOS filtros
 * que la lista). Aquí solo vive lo del panel, todo PURO (prueba
 * `__tests__/quote-navegacion.test.ts`):
 *  - qué filtros de la lista viajan al detalle y cómo se escriben en la URL
 *    (la lista y el detalle leen la MISMA función: si divergen, la flecha
 *    recorre otra cosa que la lista de donde vino);
 *  - los textos de las flechas («#341 · 27 sep · Maqar»);
 *  - cuándo una tecla ←/→ es un atajo y cuándo es del campo que tiene el foco.
 *
 * RANGO DE FECHAS de la lista — 13-oct-2026 (pedido del cliente: «Desde /
 * Hasta» en Cotizaciones). El rango vive en la URL (`?desde`/`?hasta`, día
 * Cancún `YYYY-MM-DD` sobre `fecha_vuelo`) y FORMA PARTE de `FILTROS_LISTA` a
 * propósito: si no viajara a `/vecinos`, la flecha brincaría a un vuelo FUERA
 * de lo que la lista enseña. «Este mes» va del 1 al ÚLTIMO día del mes
 * (incluye los días por venir), a diferencia de Conciliación/Ingresos (1 →
 * hoy): aquí la fecha es la del VUELO y hay vuelos futuros, por eso tampoco
 * se recorta nunca a hoy. Con rango, las cotizaciones SIN fecha de vuelo
 * quedan fuera (regla del API); la nota bajo la barra lo dice.
 */

import { fmtDateOnly } from "@/lib/datetime";
import { diaMas } from "./conciliacion-auto";
import { fechaCortaCancun } from "./facturas-emitidas";
import { fechaCompleta } from "./periodo-selector";
import { esDiaValido, estadoFiltro, uuidFiltro } from "./url-params";
import type { QuoteVecino } from "@/types/quote-vecinos";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import {
  ajustarRangoAlInicio,
  recortarAtajos,
  textoDesdeInicio,
  type InicioOficial,
} from "./inicio-oficial";

/**
 * Filtros de la BARRA de la lista de cotizaciones que respetan las flechas.
 * La búsqueda rápida LOCAL de la tabla (`tq`) NO está aquí: filtra en el
 * navegador sobre lo ya cargado y el API no la conoce. `desde`/`hasta` van AL
 * FINAL para que las URLs de antes se escriban igual que siempre.
 */
export const FILTROS_LISTA = ["estado", "cliente_id", "q", "grupo_id", "desde", "hasta"] as const;
export type FiltroLista = (typeof FILTROS_LISTA)[number];

export interface FiltrosListaCotizaciones {
  estado?: EstadoVuelo;
  cliente_id?: string;
  q?: string;
  grupo_id?: string;
  /** Día Cancún `YYYY-MM-DD` sobre `fecha_vuelo` (13-oct-2026); un solo extremo vale. */
  desde?: string;
  hasta?: string;
}

/** Tope del texto de búsqueda que viaja en la URL de las flechas. */
export const Q_MAX = 100;

type ParamsDeUrl = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Filtros de la lista YA VALIDADOS desde los `searchParams` de Next (mismas
 * reglas que `lib/admin/url-params.ts`): un estado fuera del catálogo o un id
 * que no es uuid se IGNORAN (no se mandan al API, que respondería 400);
 * `q` se recorta y se topa a `Q_MAX`; el rango pasa por
 * `rangoListaCotizaciones`. Lo que queda vacío no viaja.
 */
export function filtrosListaDeParams(
  sp: ParamsDeUrl,
  inicio: InicioOficial = null,
): FiltrosListaCotizaciones {
  const f: FiltrosListaCotizaciones = {};
  const estado = estadoFiltro(primero(sp.estado));
  if (estado) f.estado = estado;
  const cliente = uuidFiltro(primero(sp.cliente_id));
  if (cliente) f.cliente_id = cliente;
  const grupo = uuidFiltro(primero(sp.grupo_id));
  if (grupo) f.grupo_id = grupo;
  const q = (primero(sp.q) ?? "").trim().slice(0, Q_MAX).trim();
  if (q) f.q = q;
  const r = rangoListaCotizaciones(primero(sp.desde), primero(sp.hasta), inicio);
  if (r.desde) f.desde = r.desde;
  if (r.hasta) f.hasta = r.hasta;
  return f;
}

/**
 * Query string (SIN «?») de los filtros, en el orden fijo de `FILTROS_LISTA`
 * para que la misma combinación produzca siempre la misma URL. Vacío si no
 * hay filtros.
 */
export function qsFiltrosLista(f: FiltrosListaCotizaciones): string {
  const sp = new URLSearchParams();
  for (const k of FILTROS_LISTA) {
    const v = f[k];
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

/** Liga al detalle de una cotización conservando los filtros de la lista. */
export function hrefCotizacion(id: string, qs: string): string {
  return qs ? `/admin/quotes/${id}?${qs}` : `/admin/quotes/${id}`;
}

/** Liga de regreso a la lista con los mismos filtros. */
export function hrefListaCotizaciones(qs: string): string {
  return qs ? `/admin/quotes?${qs}` : "/admin/quotes";
}

// =============================================================================
// Rango de fechas de la lista (13-oct-2026)
// =============================================================================

export interface RangoListaCotizaciones {
  desde?: string;
  hasta?: string;
  /** Inicio oficial (16-oct-2026): el rango de la URL caía antes del inicio
   *  y se movió (la página pinta el aviso). Solo existe si es `true`. */
  ajustado?: true;
}

/**
 * Rango de la URL ya VALIDADO para el API: solo días reales `YYYY-MM-DD`
 * (`esDiaValido`; un ISO con hora se ignora porque el DTO del API no lo
 * acepta), un día que no existe se IGNORA (regla de `url-params`: un enlace
 * viejo no tumba la pantalla), invertido se intercambia en vez de dejar que
 * el API responda 400, y un solo extremo vale. NUNCA se recorta a hoy: aquí
 * la fecha es la del vuelo y hay vuelos por venir.
 */
export function rangoListaCotizaciones(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  inicio: InicioOficial = null,
): RangoListaCotizaciones {
  let d = esDiaValido(desde) ? (desde as string) : undefined;
  let h = esDiaValido(hasta) ? (hasta as string) : undefined;
  if (d && h && d > h) [d, h] = [h, d];
  // Inicio oficial (16-oct-2026, API 0.0.84): un extremo anterior se sube
  // (agosto entero ⇒ el mes del inicio completo: la fecha es la del vuelo y
  // hay vuelos por venir). Sin rango no se inventa uno: el API ya recorta.
  const aj = ajustarRangoAlInicio({ desde: d, hasta: h }, inicio, "");
  const out: RangoListaCotizaciones = {};
  if (aj.desde) out.desde = aj.desde;
  if (aj.hasta) out.hasta = aj.hasta;
  if (aj.ajustado) out.ajustado = true;
  return out;
}

export function hayRangoLista(r: RangoListaCotizaciones): boolean {
  return !!(r.desde || r.hasta);
}

/** Solo el rango de unos filtros ya validados (para los textos de la página). */
export function rangoDeFiltros(f: FiltrosListaCotizaciones): RangoListaCotizaciones {
  const out: RangoListaCotizaciones = {};
  if (f.desde) out.desde = f.desde;
  if (f.hasta) out.hasta = f.hasta;
  return out;
}

/** Copia SIN `desde`/`hasta` (la relectura cuando el API previo rechaza el rango). */
export function sinRango<T extends RangoListaCotizaciones>(f: T): Omit<T, "desde" | "hasta"> {
  return Object.fromEntries(
    Object.entries(f).filter(([k]) => k !== "desde" && k !== "hasta"),
  ) as Omit<T, "desde" | "hasta">;
}

export type CampoRangoLista = "desde" | "hasta";

/**
 * El rango que resulta de cambiar UN extremo desde la barra: si el nuevo
 * «desde» queda después de «hasta», «hasta» lo sigue (y al revés) — la MISMA
 * regla de `periodoAlCambiar` del selector de Reportes. Con el intercambio,
 * pasar de 01–15 oct a 20–31 oct tecleando primero «desde = 20» dejaba 15–20
 * (lo tecleado se iba al otro campo). Una URL tecleada a mano sí se corrige
 * por intercambio en `rangoListaCotizaciones`.
 */
export function rangoAlCambiarCampo(
  actual: RangoListaCotizaciones,
  campo: CampoRangoLista,
  valor: string,
): RangoListaCotizaciones {
  if (campo === "desde") {
    const hasta = actual.hasta && actual.hasta < valor ? valor : actual.hasta;
    return hasta ? { desde: valor, hasta } : { desde: valor };
  }
  const desde = actual.desde && actual.desde > valor ? valor : actual.desde;
  return desde ? { desde, hasta: valor } : { hasta: valor };
}

export type ClavePeriodoCotizaciones = "mes" | "anterior" | "30";

export interface PeriodoRapidoCotizaciones {
  clave: ClavePeriodoCotizaciones;
  etiqueta: "Este mes" | "Mes pasado" | "Próximos 30 días";
  desde: string;
  hasta: string;
}

/**
 * Periodos rápidos de la barra (días Cancún). «Este mes» = del 1 al ÚLTIMO
 * día del mes (con los días por venir: la fecha es la del vuelo); «Mes
 * pasado» = el mes anterior completo; «Próximos 30 días» = hoy → hoy + 30.
 */
export function periodosRapidosCotizaciones(
  hoy: string,
  inicio: InicioOficial = null,
): PeriodoRapidoCotizaciones[] {
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  // 32 días después del día 1 cae SIEMPRE en el mes siguiente; el día 1 de
  // ese mes menos uno es el último día de este (febrero bisiesto incluido).
  const inicioMesSiguiente = `${diaMas(inicioMes, 32).slice(0, 7)}-01`;
  const finMes = diaMas(inicioMesSiguiente, -1);
  const finMesAnterior = diaMas(inicioMes, -1);
  const inicioMesAnterior = `${finMesAnterior.slice(0, 7)}-01`;
  // Inicio oficial (16-oct-2026): sin «Mes pasado» entero antes del inicio.
  return recortarAtajos<PeriodoRapidoCotizaciones>(
    [
      { clave: "mes", etiqueta: "Este mes", desde: inicioMes, hasta: finMes },
      { clave: "anterior", etiqueta: "Mes pasado", desde: inicioMesAnterior, hasta: finMesAnterior },
      { clave: "30", etiqueta: "Próximos 30 días", desde: hoy, hasta: diaMas(hoy, 30) },
    ],
    inicio,
  );
}

/** «con fecha de vuelo del 01 oct 2026 al 31 oct 2026» · «… desde el …» · «… hasta el …» · null. */
export function textoRangoCotizaciones(r: RangoListaCotizaciones): string | null {
  if (r.desde && r.hasta)
    return `con fecha de vuelo del ${fmtDateOnly(r.desde)} al ${fmtDateOnly(r.hasta)}`;
  if (r.desde) return `con fecha de vuelo desde el ${fmtDateOnly(r.desde)}`;
  if (r.hasta) return `con fecha de vuelo hasta el ${fmtDateOnly(r.hasta)}`;
  return null;
}

const plural = (count: number) => (count === 1 ? "cotización" : "cotizaciones");

/** Encabezado de la lista: «12 cotizaciones con fecha de vuelo del … al ….» / «312 cotizaciones (todas las fechas).». */
export function textoEncabezadoCotizaciones(
  count: number,
  r: RangoListaCotizaciones,
  inicio: InicioOficial = null,
): string {
  const rango = textoRangoCotizaciones(r);
  if (rango) return `${count} ${plural(count)} ${rango}.`;
  // Inicio oficial (16-oct-2026): ya no son «todas las fechas».
  return inicio
    ? `${count} ${plural(count)} (${textoDesdeInicio(inicio)}).`
    : `${count} ${plural(count)} (todas las fechas).`;
}

/** Nota bajo la barra: qué periodo se ve y que las SIN fecha no entran al periodo. */
export function notaRangoCotizaciones(
  r: RangoListaCotizaciones,
  opts: { ignorado?: boolean; inicio?: InicioOficial } = {},
): string {
  const rango = opts.ignorado ? null : textoRangoCotizaciones(r);
  if (rango) {
    return (
      `Mostrando cotizaciones ${rango}. Las que no tienen fecha de vuelo no entran al ` +
      "periodo: quítalo con «Limpiar» para verlas. Las flechas del detalle recorren " +
      "este mismo periodo."
    );
  }
  if (opts.inicio) {
    return (
      `Sin periodo: se muestran las cotizaciones ${textoDesdeInicio(opts.inicio)}; ` +
      "las que no tienen fecha de vuelo van al inicio de la tabla."
    );
  }
  return (
    "Sin periodo: se muestran las cotizaciones de todas las fechas; las que no " +
    "tienen fecha de vuelo van al inicio de la tabla."
  );
}

/** Estado vacío de la lista: con periodo dice cómo salir de él; sin periodo, los textos de siempre. */
export function textoVacioCotizaciones(r: RangoListaCotizaciones): {
  titulo: string;
  descripcion: string;
} {
  const rango = textoRangoCotizaciones(r);
  if (rango) {
    return {
      titulo: "Sin cotizaciones en el periodo",
      descripcion: `No hay cotizaciones ${rango}. Cambia el periodo o quítalo con «Limpiar».`,
    };
  }
  return {
    titulo: "Sin cotizaciones",
    descripcion: "Cuando guardes una cotización aparecerá aquí con su folio e historial.",
  };
}

/** Banner ámbar de la lista cuando el API previo rechazó `desde`/`hasta` y se releyó sin rango. */
export const MSG_RANGO_API_VIEJO =
  "El filtro de fechas estará disponible cuando se actualice el servidor. " +
  "Mientras tanto se muestran las cotizaciones de todas las fechas.";

export const TITULO_FECHA_VUELO = "Fecha del vuelo (día de Cancún)";
export const ETIQUETA_GRUPO_FECHAS = "Periodo del vuelo";

/**
 * ¿El 400 es el de un API que todavía no conoce `desde`/`hasta` en
 * `GET /quotes` y `/vecinos` (`forbidNonWhitelisted`: «property desde should
 * not exist»)? Espejo de `esApiSinTramosBase`: se mira el TEXTO porque
 * class-validator no manda código; el mensaje puede llegar como string o como
 * lista. Cualquier otro status (un 502 del deploy, un 500) o un 400 de OTRO
 * campo ⇒ false: ese error sube como siempre y nunca se disfraza de lista.
 */
export function esApiSinRangoFechas(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { status, message } = err as { status?: unknown; message?: unknown };
  if (status !== 400) return false;
  const texto = Array.isArray(message) ? message.join(" ") : String(message ?? "");
  if (!/\b(desde|hasta)\b/i.test(texto)) return false;
  return /should not exist|no debe existir|not allowed|property/i.test(texto);
}

// -----------------------------------------------------------------------------
// Campo `type="date"` de la barra: BORRADOR (patrón de `PeriodSelector`,
// 12-oct-2026, «se traba el calendario»). Sin él, tecleando el año
// («0002-10-01») la lista navegaría a cada tecla y el input se pisaría.
// -----------------------------------------------------------------------------

export interface BorradorCampoFecha {
  /** Valor de la URL con el que se escribió el borrador: cuando la URL cambia, caduca. */
  base: string;
  valor: string;
}

export type PasoCampoFecha =
  | { tipo: "aplicar"; valor: string }
  | { tipo: "borrador"; valor: string };

/** Al teclear: una fecha COMPLETA (día real, año ≥ 2000) se aplica tras la pausa; lo demás —también «»— es borrador. */
export function pasoCampoFecha(valor: string): PasoCampoFecha {
  return fechaCompleta(valor) ? { tipo: "aplicar", valor } : { tipo: "borrador", valor };
}

export type PasoAlSalirCampoFecha =
  | { tipo: "limpiar" }
  | { tipo: "aplicar"; valor: string }
  | { tipo: "descartar" };

/**
 * Al salir del campo / Enter: vacío con algo en la URL ⇒ limpiar ese
 * extremo; completa y distinta de la URL ⇒ aplicar ya; igual a la URL o
 * incompleta ⇒ descartar el borrador (vuelve lo que está en la URL).
 */
export function pasoAlSalirCampoFecha(visible: string, deUrl: string): PasoAlSalirCampoFecha {
  if (visible === "" && deUrl !== "") return { tipo: "limpiar" };
  if (visible !== deUrl && fechaCompleta(visible)) return { tipo: "aplicar", valor: visible };
  return { tipo: "descartar" };
}

/** Lo que enseña el input: el borrador manda solo mientras su base siga siendo la URL (sin efectos). */
export function valorVisibleCampoFecha(
  deUrl: string,
  borrador: BorradorCampoFecha | null,
): string {
  return borrador && borrador.base === deUrl ? borrador.valor : deUrl;
}

/**
 * Los borradores CADUCAN en cuanto la URL del campo deja el valor con el que
 * se escribieron (revisión del 14-oct-2026): llegó la navegación, o Atrás /
 * «Quitar filtros» / el menú la cambiaron. Antes solo se OCULTABAN y
 * revivían cuando la URL volvía a ese valor: el campo enseñaba una fecha que
 * NO estaba aplicada, con la marca de filtro activo y sin «Limpiar», y salir
 * del campo la volvía a aplicar. Devuelve el MISMO objeto si nada caducó (la
 * barra lo usa para ajustar su estado en el render, sin bucles).
 */
export function borradoresVigentes<C extends string>(
  borradores: Record<C, BorradorCampoFecha | null>,
  deUrl: Record<C, string>,
): Record<C, BorradorCampoFecha | null> {
  let caduco = false;
  const out = { ...borradores };
  for (const campo of Object.keys(borradores) as C[]) {
    const b = borradores[campo];
    if (b && b.base !== deUrl[campo]) {
      out[campo] = null;
      caduco = true;
    }
  }
  return caduco ? out : borradores;
}

// -----------------------------------------------------------------------------
// Navegaciones ENCADENADAS antes de que la URL se mueva (revisión 13-oct-2026)
// -----------------------------------------------------------------------------

/** La última consulta PEDIDA con `router.replace` y la URL viva que había al pedirla. */
export interface ConsultaPendiente {
  /** `useSearchParams().toString()` en el momento de pedirla. */
  base: string;
  /** La query string que se pidió. */
  consulta: string;
}

/**
 * Sobre qué query string se arma la SIGUIENTE navegación de la barra.
 * `useSearchParams` sigue devolviendo la URL ANTERIOR mientras una navegación
 * está en vuelo (la página es dinámica y espera al servidor), así que dos
 * cambios dentro de esa latencia —«Desde = 20» + Enter, Tab, «Hasta = 31»—
 * se armaban los dos sobre la URL vieja y el segundo pisaba al primero (la
 * lista quedaba 01–31 y el 20 tecleado desaparecía sin aviso). Mientras la
 * URL viva siga siendo la que había al pedir la última consulta, se parte de
 * ESA consulta; en cuanto la URL se mueve (llegó esa navegación u otra),
 * manda la viva. Sin pendiente, la viva. Misma idea que el borrador del
 * campo: una base que caduca sola.
 */
export function consultaBaseParaNavegar(
  viva: string,
  pendiente: ConsultaPendiente | null,
): string {
  return pendiente !== null && pendiente.base === viva ? pendiente.consulta : viva;
}

/**
 * La consulta pendiente CADUCA en cuanto la URL viva deja su `base`
 * (revisión del 14-oct-2026): llegó esa navegación u otra. Antes se quedaba
 * guardada y `consultaBaseParaNavegar` la REVIVÍA cuando la URL volvía a esa
 * base por FUERA de la barra (chip «Avión ✕», «Quitar filtros», Atrás, el
 * menú): el siguiente clic se perdía («nada cambió») o regresaba un filtro que
 * el operador ya había quitado. La barra la llama en un efecto sobre la URL.
 */
export function pendienteVigente(
  viva: string,
  pendiente: ConsultaPendiente | null,
): ConsultaPendiente | null {
  return pendiente !== null && pendiente.base === viva ? pendiente : null;
}

// =============================================================================
// Textos de las flechas
// =============================================================================

/** «#341 · 27 sep» (fecha del vuelo en hora Cancún). */
export function textoCortoVecino(v: Pick<QuoteVecino, "folio" | "fecha_vuelo">): string {
  const fecha = fechaCortaCancun(v.fecha_vuelo);
  return fecha ? `#${v.folio} · ${fecha}` : `#${v.folio}`;
}

/** «#341 · 27 sep · Maqar» (sin cliente, sin la última parte; nunca «null»). */
export function textoVecino(v: QuoteVecino): string {
  const cliente = v.cliente_nombre?.trim();
  return cliente ? `${textoCortoVecino(v)} · ${cliente}` : textoCortoVecino(v);
}

export type DireccionFlecha = "anterior" | "siguiente";

/** Explicación de las flechas apagadas cuando la cotización no tiene fecha. */
export const MSG_SIN_FECHA =
  "Esta cotización no tiene fecha de vuelo: ponle fecha para brincar entre vuelos.";

/**
 * Tooltip / `aria-label` de una flecha. Con vecino dice ADÓNDE lleva («Vuelo
 * siguiente: #341 · 27 sep · Maqar»); sin vecino dice POR QUÉ está apagada.
 * `conFiltros` distingue «no hay más» de «no hay más con estos filtros».
 */
export function tituloFlecha(
  dir: DireccionFlecha,
  vecino: QuoteVecino | null,
  opts: { sinFecha?: boolean; conFiltros?: boolean } = {},
): string {
  if (opts.sinFecha) return MSG_SIN_FECHA;
  const nombre = dir === "anterior" ? "Vuelo anterior" : "Vuelo siguiente";
  if (vecino) return `${nombre}: ${textoVecino(vecino)}`;
  const cual = dir === "anterior" ? "un vuelo anterior" : "un vuelo siguiente";
  return opts.conFiltros
    ? `No hay ${cual} con estos filtros`
    : `No hay ${cual}`;
}

/** Subtítulo corto bajo una flecha apagada (se ve sin pasar el mouse). */
export function subtituloFlechaApagada(opts: { sinFecha?: boolean }): string {
  return opts.sinFecha ? "Sin fecha" : "No hay más";
}

// =============================================================================
// Atajo de teclado ←/→
// =============================================================================

export interface TeclaPulsada {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

export interface ContextoFoco {
  /** `tagName` del elemento con el foco (null = nada / el body). */
  etiqueta: string | null;
  /** `isContentEditable` del elemento con el foco. */
  editable: boolean;
  /** `role` del elemento con el foco (o de su contenedor de grupo). */
  rol: string | null;
  /** Hay un diálogo, menú o lista desplegable abiertos. */
  hayCapaAbierta: boolean;
}

/** Etiquetas donde ←/→ mueven el cursor o cambian el valor. */
const ETIQUETAS_CON_FLECHAS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
/** Roles ARIA donde ←/→ tienen significado propio. */
const ROLES_CON_FLECHAS = new Set([
  "slider",
  "spinbutton",
  "radio",
  "radiogroup",
  "tab",
  "tablist",
  "menuitem",
  "option",
  "combobox",
  "textbox",
  "listbox",
  "grid",
  "gridcell",
]);

/**
 * ¿Esta tecla es el atajo de una flecha? Solo ←/→ SIN modificadores, sin
 * autorrepetición y SOLO cuando el foco no está en algo que ya usa esas
 * teclas (un campo del cotizador —la hoja está hecha de inputs—, un select,
 * un grupo de pestañas…) ni hay un diálogo o menú abiertos. Ante la duda,
 * NO es atajo: brincar de cotización mientras se escribe sería peor que no
 * tener atajo. (Con cambios sin guardar, el clic que dispara el atajo pasa
 * por el MISMO guard que el clic del mouse.)
 */
export function direccionDeTecla(
  t: TeclaPulsada,
  ctx: ContextoFoco,
): DireccionFlecha | null {
  if (t.key !== "ArrowLeft" && t.key !== "ArrowRight") return null;
  if (t.altKey || t.ctrlKey || t.metaKey || t.shiftKey) return null;
  if (t.repeat || t.defaultPrevented) return null;
  if (ctx.hayCapaAbierta || ctx.editable) return null;
  if (ctx.etiqueta && ETIQUETAS_CON_FLECHAS.has(ctx.etiqueta.toUpperCase())) return null;
  if (ctx.rol && ROLES_CON_FLECHAS.has(ctx.rol)) return null;
  return t.key === "ArrowLeft" ? "anterior" : "siguiente";
}
