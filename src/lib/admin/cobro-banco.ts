/**
 * UN COBRO, VARIOS ABONOS: el ESTADO de un cobro contra el banco (14-oct-2026,
 * API 0.0.78, invariante 77 del API). Módulo PURO (sin React ni red; prueba
 * `__tests__/cobro-banco.test.ts`): FUENTE ÚNICA del badge de las cards de
 * cobros del vuelo y de la cotización (texto, clases y tooltip), del renglón
 * «Banco» debajo de cada cobro (con sus enlaces a Conciliación), del texto del
 * abono que trae de más y del chip «Parcial · faltan $X» de Ingresos. Ningún
 * componente redacta estas frases.
 *
 * Pedido del cliente: «que un cobro acepte varios abonos, el aviso de
 * «Conciliado parcial»…». «Conciliado» de un cobro = CUBIERTO (Σ de sus
 * abonos en su moneda ≥ neto − $1.00); con abonos que no lo cubren es PARCIAL
 * y dice cuánto falta. TODO número —estado, neto, lo vinculado, lo que falta,
 * lo que sobra y los abonos— lo manda el API (`common/cobro-banco.util.ts`):
 * aquí JAMÁS se suma ni se recalcula, solo se formatea (`fmtMonto`,
 * `fmtDateOnly`) y se eligen clases. Con un API previo (sin
 * `conciliacion_estado`) todo queda como antes: `conciliado` ⇒ «Conciliado»
 * y nada más (ni «Sin conciliar» ni renglón «Banco»).
 */

import { diaMas } from "@/lib/admin/conciliacion-auto";
import { numeroDe } from "@/lib/admin/conciliacion-parcial";
import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import { montoParaBusquedaTabla } from "@/lib/admin/hoja-banco";
import { TITULO_SIN_CONCILIAR_ENTRADA } from "@/lib/admin/ingresos-ui";
import { esDiaValido, uuidFiltro } from "@/lib/admin/url-params";
import { fmtDateOnly, isoToCancunInput } from "@/lib/datetime";
import { fmtDecimal, fmtMonto, fmtUsd } from "@/lib/format";
import type { AbonoDeCobroCorto, CobroConciliacionDeAbono, CobroSinBanco } from "@/types/conciliacion";
import type { AbonoBancoDeCobro, EstadoBancoCobro, FlightCobro } from "@/types/flights";
import type { ParcialEntrada } from "@/types/ingresos";

// ───────────────────────────── El cobro ─────────────────────────────

/** Lo que este módulo lee de un cobro (una fila de `FlightCobro` sirve). */
export type CobroBanco = Pick<
  FlightCobro,
  | "monto"
  | "moneda"
  | "fecha_cobro"
  | "conciliado"
  | "conciliado_via"
  | "anticipo"
  | "cobro_grupo"
  | "cobro_grupo_id"
  | "conciliacion_estado"
  | "ligado_banco"
  | "neto_banco"
  | "monto_vinculado"
  | "faltante"
  | "sobrante"
  | "abonos_banco"
>;

/**
 * Tolerancia de «cubierto» del API (`TOLERANCIA_COBRO_BANCO`, $1.00 — la de
 * `regla_cobro_cubierto`): un sobrante de centavos no se avisa (la etiqueta
 * del Excel del API usa el mismo corte).
 */
export const TOLERANCIA_COBRO_BANCO = 1;

const ESTADOS_BANCO_COBRO: readonly EstadoBancoCobro[] = [
  "CONCILIADO",
  "PARCIAL",
  "VIA_ANTICIPO",
  "SIN_CONCILIAR",
  "NO_BANCARIO",
];

/** Número del API o null (ausente, vacío o no numérico): jamás un 0 inventado. */
function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function centavos(n: number): number {
  return Math.round(n * 100);
}

function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** «a», «a y b», «a, b y c». */
function listaEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Parte de un sobre de grupo (misma regla que `esParteDeSobre` de la card). */
function esParteDeSobre(c: Pick<CobroBanco, "cobro_grupo" | "cobro_grupo_id">): boolean {
  return c.cobro_grupo != null || c.cobro_grupo_id != null;
}

/**
 * Estado del cobro contra el banco: el que manda el API
 * (`conciliacion_estado`) o, con un API previo, el de siempre
 * (`conciliado` ⇒ CONCILIADO; si no, null = sin badge, como hoy). Un valor
 * que el panel no conoce se trata como API previo.
 */
export function estadoBancoCobro(
  c: Pick<CobroBanco, "conciliacion_estado" | "conciliado">,
): EstadoBancoCobro | null {
  const e = c.conciliacion_estado;
  if (typeof e === "string" && (ESTADOS_BANCO_COBRO as readonly string[]).includes(e)) return e;
  return c.conciliado === true ? "CONCILIADO" : null;
}

// ───────────────────────────── El badge ─────────────────────────────

export const TEXTO_BADGE_CONCILIADO = "Conciliado";
export const TEXTO_BADGE_PARCIAL = "Conciliado parcial";
export const TEXTO_BADGE_SIN_CONCILIAR = "Sin conciliar";

/**
 * Texto del badge: «Conciliado» · «Conciliado parcial · faltan $1,700 MXN» ·
 * «Sin conciliar» · null (no bancario o API previo sin conciliar: sin
 * badge). Un cobro de un anticipo o parte de un sobre conciliado dice
 * «Conciliado», como hoy.
 */
export function textoBadgeCobro(
  c: Pick<CobroBanco, "conciliacion_estado" | "conciliado" | "faltante" | "moneda">,
): string | null {
  switch (estadoBancoCobro(c)) {
    case "CONCILIADO":
    case "VIA_ANTICIPO":
      return TEXTO_BADGE_CONCILIADO;
    case "PARCIAL": {
      const f = numeroONull(c.faltante);
      return f != null && f > 0
        ? `${TEXTO_BADGE_PARCIAL} · faltan ${fmtMonto(f, c.moneda)}`
        : TEXTO_BADGE_PARCIAL;
    }
    case "SIN_CONCILIAR":
      return TEXTO_BADGE_SIN_CONCILIAR;
    default:
      return null;
  }
}

/** Clases (con sus variantes oscuras) de los tres badges. */
export const CLASE_BADGE_COBRO = {
  CONCILIADO: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PARCIAL: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  SIN_CONCILIAR: "border-rose-500/40 text-rose-600 dark:text-rose-400",
} as const;

/** Verde (conciliado, también vía anticipo o sobre) · ámbar (parcial) · rosa sin fondo (sin conciliar) · "" (sin badge). */
export function claseBadgeCobro(estado: EstadoBancoCobro | null | undefined): string {
  switch (estado) {
    case "CONCILIADO":
    case "VIA_ANTICIPO":
      return CLASE_BADGE_COBRO.CONCILIADO;
    case "PARCIAL":
      return CLASE_BADGE_COBRO.PARCIAL;
    case "SIN_CONCILIAR":
      return CLASE_BADGE_COBRO.SIN_CONCILIAR;
    default:
      return "";
  }
}

/** Tooltip de siempre (API previo o sin el detalle de los abonos). */
export const TITULO_CONCILIADO_MOVIMIENTO = "Conciliado con un movimiento bancario";
export const TITULO_CONCILIADO_SOBRE = "El sobre del grupo está conciliado con un movimiento bancario";
/**
 * «Sin conciliar» de la TARJETA = el de Ingresos (R11 de la conciliación al
 * revés de una entrada, 15-oct-2026): UN solo texto para el mismo estado. El
 * del 0.0.78 («… Se cruza solo al importar el estado de cuenta…») era falso
 * para un cobro registrado DESPUÉS de importar (#383, #404): los cobros no
 * tienen cruce «al revés».
 */
export const TITULO_SIN_CONCILIAR_COBRO = TITULO_SIN_CONCILIAR_ENTRADA;
/** «Sin conciliar» de la PARTE de un sobre: el abono se liga al sobre, nunca a la parte. */
export const TITULO_SIN_CONCILIAR_SOBRE =
  "El sobre del grupo todavía no tiene ningún abono del banco vinculado: en Conciliación el abono se vincula al sobre completo, no a cada vuelo.";

/** «15 sep 2026» de un abono (DATE del banco). */
function fechaAbono(a: Pick<AbonoBancoDeCobro, "fecha">): string {
  const dia = typeof a.fecha === "string" ? a.fecha.slice(0, 10) : "";
  return esDiaValido(dia) ? fmtDateOnly(dia) : "sin fecha";
}

/**
 * Moneda con que se pintan los montos de los ABONOS: la del cobro, salvo el
 * único caso en que el abono viene de una cuenta en OTRA moneda (1 ↔ 1,
 * «cruzado»): ahí el API manda `monto_vinculado` = el neto del cobro y la
 * parte en la moneda de la cuenta, que no coinciden ⇒ sin sufijo (la moneda
 * de la cuenta no se adivina). Con 2+ abonos o en un lote la moneda es por
 * regla la del cobro.
 */
function monedaDeAbonos(c: Pick<CobroBanco, "moneda" | "monto_vinculado" | "abonos_banco">): string | null {
  const abonos = c.abonos_banco ?? [];
  const mv = numeroONull(c.monto_vinculado);
  if (abonos.length === 1 && mv != null && centavos(numeroDe(abonos[0].monto_parte)) !== centavos(mv)) {
    return null;
  }
  return c.moneda ?? null;
}

function tituloAnticipo(c: Pick<CobroBanco, "anticipo">): string {
  const etiqueta = textoONull(c.anticipo?.etiqueta);
  return `Conciliado vía el anticipo${etiqueta ? ` ${etiqueta}` : ""}: el anticipo ya está conciliado con su abono del banco.`;
}

/** «Sin conciliar» de un cobro que salió de un ANTICIPO: el abono se liga al anticipo, nunca al cobro. */
function tituloSinConciliarAnticipo(c: Pick<CobroBanco, "anticipo">): string {
  const etiqueta = textoONull(c.anticipo?.etiqueta);
  return `Salió del anticipo${etiqueta ? ` ${etiqueta}` : ""}, que todavía no está conciliado con su abono del banco: en Conciliación el abono se vincula al anticipo, no a este cobro.`;
}

/** «15 sep 2026 · EJE SCOTIA» (sin el alias de la cuenta, solo la fecha). */
function lugarAbono(a: AbonoBancoDeCobro): string {
  const cuenta = textoONull(a.cuenta_alias);
  return `${fechaAbono(a)}${cuenta ? ` · ${cuenta}` : ""}`;
}

/**
 * Tooltip del badge (textos.badge del 0.0.78): con UN abono, la fecha, la
 * cuenta y el monto (o, en un lote, «$68,205.55 MXN de un abono de $69,183
 * MXN … que pagó 2 cobros»); con VARIOS, cada uno; en un PARCIAL, lo que el
 * banco respalda, lo que falta y qué hacer. Sobre, anticipo y API previo: los
 * de siempre. null = sin badge.
 */
export function tituloBadgeCobro(c: CobroBanco): string | null {
  const estado = estadoBancoCobro(c);
  const abonos = c.abonos_banco ?? [];
  const m = c.moneda ?? null;
  switch (estado) {
    case "VIA_ANTICIPO":
      return tituloAnticipo(c);
    case "CONCILIADO": {
      if (esParteDeSobre(c)) return TITULO_CONCILIADO_SOBRE;
      if (c.conciliado_via === "ANTICIPO") return tituloAnticipo(c);
      if (abonos.length === 0) return TITULO_CONCILIADO_MOVIMIENTO;
      const ma = monedaDeAbonos(c);
      if (abonos.length === 1) {
        const a = abonos[0];
        const cuenta = textoONull(a.cuenta_alias);
        const n = Math.trunc(numeroDe(a.cobros_n));
        const abono = numeroONull(a.monto_abono);
        if (n >= 2 && abono != null) {
          return `Conciliado con el banco: ${fmtMonto(a.monto_parte, ma)} de un abono de ${fmtMonto(abono, ma)} del ${fechaAbono(a)}${cuenta ? ` (${cuenta})` : ""} que pagó ${n} cobros.`;
        }
        return `Conciliado con el banco: abono del ${fechaAbono(a)}${cuenta ? ` en ${cuenta}` : ""} por ${fmtMonto(a.monto_parte, ma)}.`;
      }
      const lista = abonos.map((a) => {
        const cuenta = textoONull(a.cuenta_alias);
        return `${fechaAbono(a)} · ${fmtMonto(a.monto_parte, ma)}${cuenta ? ` (${cuenta})` : ""}`;
      });
      return `Conciliado con ${abonos.length} abonos del banco: ${listaEs(lista)}.`;
    }
    case "PARCIAL": {
      const mv = numeroONull(c.monto_vinculado);
      const neto = numeroONull(c.neto_banco);
      const f = numeroONull(c.faltante);
      const cuales =
        abonos.length === 0
          ? null
          : abonos.length === 1
            ? `1 abono: ${lugarAbono(abonos[0])}`
            : `${abonos.length} abonos: ${listaEs(abonos.map(lugarAbono))}`;
      const respaldo =
        mv != null
          ? `El banco respalda ${fmtMonto(mv, m)}${neto != null ? ` de ${fmtMonto(neto, m)}` : ""}`
          : "El banco respalda solo una parte de este cobro";
      const falta =
        f != null && f > 0
          ? `Faltan ${fmtMonto(f, m)}: vincula el otro abono en Conciliación cuando llegue.`
          : "Vincula el abono que falta en Conciliación cuando llegue.";
      return `${respaldo}${cuales ? ` (${cuales})` : ""}. ${falta} Mientras, este cobro sale en «Cobros sin banco».`;
    }
    case "SIN_CONCILIAR":
      if (esParteDeSobre(c)) return TITULO_SIN_CONCILIAR_SOBRE;
      if (c.anticipo) return tituloSinConciliarAnticipo(c);
      return TITULO_SIN_CONCILIAR_COBRO;
    default:
      return null;
  }
}

// ───────────────────────────── Enlaces a Conciliación ─────────────────────────────

/** «Buscar el abono que falta»: de 7 días antes a 30 después del cobro (días de Cancún). */
export const VENTANA_ABONO_ANTES_DIAS = 7;
export const VENTANA_ABONO_DESPUES_DIAS = 30;

/**
 * El abono en Conciliación (pestaña «Conciliados», su cuenta y su día, con
 * `?mov=` para que salga PRIMERO y resaltado). Sin fecha o sin cuenta válidas
 * esos filtros no van (la URL nunca lleva basura). `cobroId` (15-oct-2026, R12
 * de la conciliación al revés de una entrada, opcional): agrega `?cobro=` para
 * que la línea de ESE cobro dentro del lote del abono salga resaltada; sin
 * él, la URL del 0.0.78 byte a byte. La hoja «Conciliación con el banco» de
 * cobros e ingresos la REUTILIZA (no hay otro constructor de esta URL).
 */
export function hrefAbonoDeCobro(
  a: Pick<AbonoBancoDeCobro, "movimiento_id" | "cuenta_bancaria_id" | "fecha">,
  opts: { cobroId?: string | null } = {},
): string {
  const dia = typeof a.fecha === "string" && esDiaValido(a.fecha.slice(0, 10)) ? a.fecha.slice(0, 10) : null;
  return hrefConciliacion({
    f: "conciliados",
    cuenta: uuidFiltro(a.cuenta_bancaria_id ?? undefined) ?? null,
    desde: dia,
    hasta: dia,
    mov: a.movimiento_id,
    cobro: opts.cobroId ?? null,
  });
}

/** Día de pared (Cancún) del cobro; null si no se lee. */
function diaCancunDeCobro(iso: string | null | undefined): string | null {
  const dia = isoToCancunInput(iso).slice(0, 10);
  return esDiaValido(dia) ? dia : null;
}

/** La entrada de «Buscar el abono que falta»: el cobro de la tarjeta (`fecha_cobro`) o la entrada de la hoja (`dia`, ya día Cancún). */
export interface FaltanteDeCobro {
  fecha_cobro?: string | null;
  /** YYYY-MM-DD Cancún (la hoja: `entrada.dia`); manda sobre `fecha_cobro`. */
  dia?: string | null;
  faltante?: number | string | null;
}

/**
 * «Buscar el abono que falta» de un PARCIAL: pendientes de 7 días antes a 30
 * después del cobro (días de Cancún) con lo que falta ya escrito en el
 * buscador (`?mvq=`, «1700» o «977.45»). null sin faltante. La entrada se
 * generalizó (15-oct-2026, R12) a `{ dia, faltante }` para que la hoja de la
 * entrada la REUTILICE: con `dia` la URL es la misma que la de la tarjeta.
 */
export function hrefBuscarAbonoQueFalta(c: FaltanteDeCobro): string | null {
  const f = numeroONull(c.faltante);
  if (f == null || !(f > 0)) return null;
  const dia = c.dia && esDiaValido(c.dia) ? c.dia : diaCancunDeCobro(c.fecha_cobro);
  return hrefConciliacion({
    f: "pendientes",
    desde: dia ? diaMas(dia, -VENTANA_ABONO_ANTES_DIAS) : null,
    hasta: dia ? diaMas(dia, VENTANA_ABONO_DESPUES_DIAS) : null,
    buscar: montoParaBusquedaTabla(f),
  });
}

// ───────────────────────────── El renglón «Banco» ─────────────────────────────

export const ETIQUETA_VER_ABONO = "ver";
export const ETIQUETA_VER_EL_ABONO = "Ver el abono";
export const TITULO_VER_ABONO = "Abre Conciliación en otra pestaña con este abono primero y resaltado";
export const ETIQUETA_BUSCAR_ABONO_QUE_FALTA = "Buscar el abono que falta";

/** Tooltip de «Buscar el abono que falta». */
export function tituloBuscarAbonoQueFalta(c: Pick<CobroBanco, "fecha_cobro" | "faltante" | "moneda">): string {
  const dia = diaCancunDeCobro(c.fecha_cobro);
  const f = numeroONull(c.faltante);
  return `Abre Conciliación en otra pestaña con los abonos pendientes de ${VENTANA_ABONO_ANTES_DIAS} días antes a ${VENTANA_ABONO_DESPUES_DIAS} días después${
    dia ? ` del ${fmtDateOnly(dia)}` : " del cobro"
  }${f != null ? `, filtrados por ${fmtMonto(f, c.moneda)}` : ""}. Borra la búsqueda si el abono trae otro monto.`;
}

/**
 * El abono (o los abonos) de un cobro trae MÁS que el cobro: una liga vieja
 * de antes del 0.0.78 (hoy el API rechaza un abono mayor que lo que falta).
 * FUENTE ÚNICA del texto (la conciliación al revés de Ingresos lo reutiliza).
 */
export function textoSobranteCobro(d: {
  montoVinculado: unknown;
  sobrante: unknown;
  moneda: string | null | undefined;
  /** Cuántos abonos tiene el cobro (1 si no se sabe). */
  abonos?: number | null;
}): string {
  const n = Math.max(1, Math.trunc(numeroDe(d.abonos)));
  const vinculado = fmtMonto(numeroDe(d.montoVinculado), d.moneda);
  const sobra = fmtMonto(numeroDe(d.sobrante), d.moneda);
  return n === 1
    ? `El abono vinculado (${vinculado}) trae ${sobra} más que este cobro: ¿pagó también otro vuelo? Desvincúlalo en Conciliación y vuelve a vincularlo marcando los dos cobros.`
    : `Los ${n} abonos vinculados (${vinculado}) traen ${sobra} más que este cobro: ¿alguno pagó también otro vuelo? Desvincúlalo en Conciliación y vuelve a vincularlo marcando los dos cobros.`;
}

export type PiezaLineaBanco =
  | { tipo: "texto"; texto: string }
  | { tipo: "enlace"; texto: string; href: string; titulo: string };

export interface LineaBancoCobro {
  /** aviso = ámbar (parcial o abono que trae de más); neutro = gris. */
  tono: "aviso" | "neutro";
  piezas: PiezaLineaBanco[];
}

/** Junta los textos seguidos (el marcado queda limpio). */
function compactar(piezas: PiezaLineaBanco[]): PiezaLineaBanco[] {
  const out: PiezaLineaBanco[] = [];
  for (const p of piezas) {
    const ultima = out[out.length - 1];
    if (p.tipo === "texto" && ultima?.tipo === "texto") {
      out[out.length - 1] = { tipo: "texto", texto: ultima.texto + p.texto };
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * El renglón «Banco» debajo del cobro (textos.detalle_banco del 0.0.78), SOLO
 * cuando dice algo que el badge no dice:
 * - PARCIAL: «Banco: $1,700 de $3,400 · abono del 15 sep 2026 (ver) · faltan
 *   $1,700 MXN · Buscar el abono que falta»;
 * - conciliado con 2+ abonos: «Banco: 2 abonos · 15 sep 2026 $1,700 (ver) ·
 *   15 sep 2026 $1,700 (ver)»;
 * - el abono trae de más (liga vieja): `textoSobranteCobro` + «Ver el abono».
 * Los enlaces («ver», «Buscar el abono que falta») solo con `conEnlaces`
 * (ADMIN/FACTURACION: Conciliación es de ellos); sin él, el mismo texto sin
 * ligas. null = no hay renglón (un abono que cuadra, sin abonos o API previo).
 */
export function lineaBancoCobro(c: CobroBanco, opts: { conEnlaces?: boolean } = {}): LineaBancoCobro | null {
  const estado = estadoBancoCobro(c);
  const abonos = c.abonos_banco ?? [];
  const m = c.moneda ?? null;
  const enlaces = opts.conEnlaces === true;
  const piezas: PiezaLineaBanco[] = [];
  const texto = (s: string) => {
    piezas.push({ tipo: "texto", texto: s });
  };
  const ver = (a: AbonoBancoDeCobro) => {
    if (!enlaces) return;
    texto(" (");
    piezas.push({ tipo: "enlace", texto: ETIQUETA_VER_ABONO, href: hrefAbonoDeCobro(a), titulo: TITULO_VER_ABONO });
    texto(")");
  };

  if (estado === "PARCIAL") {
    const mv = numeroONull(c.monto_vinculado);
    const neto = numeroONull(c.neto_banco);
    const f = numeroONull(c.faltante);
    texto(mv != null ? `Banco: ${fmtUsd(mv)}${neto != null ? ` de ${fmtUsd(neto)}` : ""}` : "Banco: pago parcial");
    if (abonos.length > 0) {
      texto(abonos.length === 1 ? " · abono del " : " · abonos del ");
      abonos.forEach((a, i) => {
        if (i > 0) texto(i === abonos.length - 1 ? " y " : ", ");
        texto(fechaAbono(a));
        ver(a);
      });
    }
    if (f != null && f > 0) {
      texto(` · faltan ${fmtMonto(f, m)}`);
      const href = enlaces ? hrefBuscarAbonoQueFalta(c) : null;
      if (href) {
        texto(" · ");
        piezas.push({
          tipo: "enlace",
          texto: ETIQUETA_BUSCAR_ABONO_QUE_FALTA,
          href,
          titulo: tituloBuscarAbonoQueFalta(c),
        });
      }
    }
    return { tono: "aviso", piezas: compactar(piezas) };
  }

  if (estado !== "CONCILIADO") return null;
  const sobrante = numeroONull(c.sobrante);
  const conSobrante = sobrante != null && sobrante > TOLERANCIA_COBRO_BANCO;
  const sobra = () =>
    textoSobranteCobro({
      montoVinculado: c.monto_vinculado,
      sobrante,
      moneda: m,
      abonos: Math.max(abonos.length, 1),
    });
  if (abonos.length >= 2) {
    texto(`Banco: ${abonos.length} abonos`);
    for (const a of abonos) {
      texto(` · ${fechaAbono(a)} ${fmtUsd(a.monto_parte)}`);
      ver(a);
    }
    if (conSobrante) texto(`. ${sobra()}`);
    return { tono: conSobrante ? "aviso" : "neutro", piezas: compactar(piezas) };
  }
  if (!conSobrante) return null;
  texto(sobra());
  if (enlaces && abonos.length === 1) {
    texto(" ");
    piezas.push({
      tipo: "enlace",
      texto: ETIQUETA_VER_EL_ABONO,
      href: hrefAbonoDeCobro(abonos[0]),
      titulo: TITULO_VER_ABONO,
    });
  }
  return { tono: "aviso", piezas: compactar(piezas) };
}

/** El renglón como texto plano (pruebas y lectores). */
export function textoLineaBanco(l: LineaBancoCobro | null): string {
  return l ? l.piezas.map((p) => p.texto).join("") : "";
}

// ───────────────────────────── Ingresos y pre-cierre ─────────────────────────────

/**
 * Chip ámbar «Parcial · faltan $1,700 MXN» de Ingresos, junto al badge «Sin
 * conciliar» de un cobro con abonos que no lo completan
 * (`conciliacion.parcial` del API 0.0.78; ausente/null ⇒ nada, como hoy).
 * Informativo: no es botón.
 */
export function chipParcialEntrada(e: {
  moneda?: string | null;
  conciliacion?: { parcial?: ParcialEntrada | null } | null;
}): { texto: string; titulo: string } | null {
  const p = e.conciliacion?.parcial;
  if (!p) return null;
  const f = numeroONull(p.faltante);
  const mv = numeroONull(p.monto_vinculado);
  const n = Math.max(0, Math.trunc(numeroDe(p.abonos_n)));
  const conFaltante = f != null && f > 0;
  return {
    texto: conFaltante ? `Parcial · faltan ${fmtMonto(f, e.moneda)}` : "Parcial",
    titulo: `Conciliado parcial: el banco respalda ${mv != null ? fmtMonto(mv, e.moneda) : "una parte"} de este cobro${
      n > 0 ? ` (${n === 1 ? "1 abono" : `${n} abonos`})` : ""
    }${conFaltante ? ` y faltan ${fmtMonto(f, e.moneda)}` : ""}. Vincula el abono que falta en Conciliación cuando llegue.`,
  };
}

/**
 * Pre-cierre «Cobros bancarios sin conciliar»: el chip de un cobro PARCIAL
 * («#315 · parcial · faltan $1,700 MXN»; los números del API). null si el
 * cobro no es parcial.
 */
export function chipParcialPreCierre(c: {
  folio?: number | null;
  parcial?: boolean | null;
  faltante?: number | null;
  moneda?: string | null;
}): string | null {
  if (c.parcial !== true) return null;
  const f = numeroONull(c.faltante);
  const quien = typeof c.folio === "number" && c.folio > 0 ? `#${c.folio}` : "cobro";
  return `${quien} · parcial${f != null && f > 0 ? ` · faltan ${fmtMonto(f, c.moneda)}` : ""}`;
}

// ───────────────────────────── Desvincular UN abono (bandeja) ─────────────────────────────

/** «1 abono más» / «2 abonos más». */
function abonosMas(n: number): string {
  return `${n} ${n === 1 ? "abono más" : "abonos más"}`;
}

/**
 * Confirmación de «Desvincular este abono del cobro» (D22, textos.desvincular
 * del 0.0.78) cuando el cobro tiene OTROS abonos: se suelta ESTE abono y el
 * cobro sigue con los demás; `faltante_sin_este` (del API) dice cuánto le
 * faltará. «El abono de $1,700 MXN del 15 sep 2026 vuelve a quedar pendiente.
 * El cobro del vuelo #315 sigue ligado a 1 abono más y queda «Conciliado
 * parcial»: faltarán $1,700 MXN. No se borra ningún cobro.» null si el cobro
 * no tiene otros abonos (o sin el dato): la confirmación de siempre.
 */
export function textoConfirmarDesvincularAbono(
  conc: CobroConciliacionDeAbono | null | undefined,
  abono: { monto: number | string; fecha: string; moneda?: string | null },
): string | null {
  if (!conc) return null;
  const n = Math.trunc(numeroDe(conc.abonos_n));
  if (n < 2) return null;
  const dia = typeof abono.fecha === "string" ? abono.fecha.slice(0, 10) : "";
  const fecha = esDiaValido(dia) ? ` del ${fmtDateOnly(dia)}` : "";
  const quien = conc.folio != null ? `El cobro del vuelo #${conc.folio}` : "El cobro";
  const faltara = numeroONull(conc.faltante_sin_este);
  // Con lo que le falta dentro de la tolerancia de «cubierto» del API, los
  // otros abonos lo siguen cubriendo (solo se elige la frase).
  const queda =
    faltara != null && faltara > TOLERANCIA_COBRO_BANCO
      ? `queda «Conciliado parcial»: faltarán ${fmtMonto(faltara, abono.moneda)}`
      : "sigue conciliado completo";
  return (
    `El abono de ${fmtMonto(Math.abs(numeroDe(abono.monto)), abono.moneda)}${fecha} vuelve a quedar pendiente. ` +
    `${quien} sigue ligado a ${abonosMas(n - 1)} y ${queda}. No se borra ningún cobro.`
  );
}

/**
 * Frase extra de la confirmación de siempre cuando el abono es el ÚNICO del
 * cobro (D22): «El cobro del vuelo #315 vuelve a «Cobros sin banco».». null
 * si el cobro tiene otros abonos o sin el dato (API previo).
 */
export function textoCobroVuelveASinBanco(conc: CobroConciliacionDeAbono | null | undefined): string | null {
  if (!conc || Math.trunc(numeroDe(conc.abonos_n)) > 1) return null;
  return conc.folio != null
    ? `El cobro del vuelo #${conc.folio} vuelve a «Cobros sin banco».`
    : "El cobro vuelve a «Cobros sin banco».";
}

// ───────────────────────────── «Cobros sin banco» (API 0.0.78) ─────────────────────────────

export const ENCABEZADO_COLUMNA_BANCO = "Banco";
export const BADGE_COBRO_PARCIAL = "Parcial";
export const BADGE_COBRO_SIN_ABONO = "Sin abono";
export const TITULO_COBRO_SIN_ABONO = "Ningún abono del banco vinculado todavía.";
export const ETIQUETA_VER_ABONO_SIN_BANCO = "Ver abono";
export const CLASE_BADGE_SIN_ABONO = "border-border text-muted-foreground";

/**
 * ¿El API ya manda el estado contra el banco de cada cobro (`parcial`, API
 * 0.0.78)? Sin él (API previo) la columna «Banco» NO se pinta.
 */
export function conColumnaBancoCobrosSinBanco(rows: readonly Pick<CobroSinBanco, "parcial">[]): boolean {
  return rows.some((c) => typeof c.parcial === "boolean");
}

function listaFechasAbonos(abonos: readonly AbonoDeCobroCorto[]): string {
  return listaEs(
    abonos.map((a) => {
      const dia = typeof a.fecha === "string" ? a.fecha.slice(0, 10) : "";
      return esDiaValido(dia) ? fmtDateOnly(dia) : "sin fecha";
    }),
  );
}

export interface CeldaBancoCobroSinBanco {
  texto: string;
  clase: string;
  titulo: string;
  /** «Ver abono» por cada abono ligado (Conciliación, pestaña «Conciliados», su día, con `?mov=`). */
  enlaces: Array<{ key: string; texto: string; href: string; titulo: string }>;
}

/**
 * La celda «Banco» de «Cobros sin banco» (textos.cobros_sin_banco del 0.0.78):
 * badge ámbar «Parcial» (title: «Conciliado $1,700 MXN de $3,400 MXN con 1
 * abono (15 sep 2026): faltan $1,700 MXN.») + «Ver abono», o badge gris «Sin
 * abono». null sin el dato (API previo).
 */
export function celdaBancoCobroSinBanco(
  c: Pick<CobroSinBanco, "parcial" | "monto_vinculado" | "neto" | "faltante" | "abonos_n" | "abonos" | "moneda">,
): CeldaBancoCobroSinBanco | null {
  if (typeof c.parcial !== "boolean") return null;
  if (!c.parcial) {
    return { texto: BADGE_COBRO_SIN_ABONO, clase: CLASE_BADGE_SIN_ABONO, titulo: TITULO_COBRO_SIN_ABONO, enlaces: [] };
  }
  const abonos = Array.isArray(c.abonos) ? c.abonos : [];
  const n = Math.max(abonos.length, Math.trunc(numeroDe(c.abonos_n)), 1);
  const f = numeroONull(c.faltante);
  const titulo =
    `Conciliado ${fmtMonto(numeroDe(c.monto_vinculado), c.moneda)} de ${fmtMonto(c.neto, c.moneda)} con ${n} ${n === 1 ? "abono" : "abonos"}` +
    `${abonos.length > 0 ? ` (${listaFechasAbonos(abonos)})` : ""}${f != null && f > 0 ? `: faltan ${fmtMonto(f, c.moneda)}` : ""}.`;
  return {
    texto: BADGE_COBRO_PARCIAL,
    clase: CLASE_BADGE_COBRO.PARCIAL,
    titulo,
    enlaces: abonos.map((a) => {
      const dia = typeof a.fecha === "string" ? a.fecha.slice(0, 10) : "";
      return {
        key: a.movimiento_id,
        texto:
          abonos.length > 1 && esDiaValido(dia)
            ? `${ETIQUETA_VER_ABONO_SIN_BANCO} del ${fmtDateOnly(dia)}`
            : ETIQUETA_VER_ABONO_SIN_BANCO,
        // Sin la cuenta (esta lista no la trae): el día y el movimiento bastan.
        href: hrefAbonoDeCobro({ movimiento_id: a.movimiento_id, cuenta_bancaria_id: null, fecha: a.fecha }),
        titulo: "Abre el abono en la pestaña «Conciliados» de Conciliación (primero y resaltado)",
      };
    }),
  };
}

/**
 * «Neto esperado» de un PARCIAL: «$1,700.00 falta (de $3,400.00)» (los
 * números del API, con dos decimales como la columna). null si no es parcial.
 */
export function netoEsperadoParcial(c: Pick<CobroSinBanco, "parcial" | "faltante" | "neto">): string | null {
  if (c.parcial !== true) return null;
  const f = numeroONull(c.faltante);
  if (f == null) return null;
  return `$${fmtDecimal(f, 2)} falta (de $${fmtDecimal(c.neto, 2)})`;
}

/**
 * La línea sobre la tabla: «2 con pago parcial: un abono cubre solo una
 * parte; el resto sigue pendiente.» (cuenta filas, no suma dinero). null sin
 * parciales.
 */
export function lineaParcialesCobrosSinBanco(rows: readonly Pick<CobroSinBanco, "parcial">[]): string | null {
  const n = rows.filter((c) => c.parcial === true).length;
  return n > 0 ? `${n} con pago parcial: un abono cubre solo una parte; el resto sigue pendiente.` : null;
}
