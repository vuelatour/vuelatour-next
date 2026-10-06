/**
 * Conciliación: 1 CARGO del banco ↔ N GASTOS («lote») — 2-oct-2026, API 0.0.52.
 *
 * Caso real (prod, 2-oct): 29 gastos «Pago VIP SAESA» capturados por Jimmy Chi
 * el 30-sep y 7 SPEI del 24-sep en GASTOS GNRAL que pagan VARIOS a la vez:
 * 8,404.20 = 3 × 2,801.40; 4,462.75 = 2,231.37 + 2,231.38 (o 2 × 2,231.37 +
 * 0.01: SAESA factura 2,231.375); 2,236.25 = 2 × 1,118.12 + 0.01. Hasta hoy un
 * cargo solo se ligaba a UN gasto y esos cargos se quedaban «Pendientes» para
 * siempre.
 *
 * La REGLA vive en el API y en la BD (tabla puente `movimiento_bancario_gasto`,
 * `recalcular_gasto_conciliado`, `conciliacion_ligar_cargo_gastos`): el panel
 * NUNCA decide si un lote cuadra. Este módulo es PURO (sin React ni red) y es
 * la FUENTE ÚNICA del panel para:
 *   - leer la liga de un movimiento (`gastosLigadosDe`, `tieneGastoLigado`,
 *     `numeroGastosDe`) — con un lote `gasto_id` viene NULL (es espejo solo con
 *     una parte), así que NADIE vuelve a preguntar `gasto_id != null` a solas;
 *   - la GUÍA visual de la suma mientras se marcan gastos (`estadoLoteCargo`,
 *     `textoSumaLote`): verde cuadra / ámbar faltan / rojo se pasa — nunca
 *     apaga el botón, el API es el que acepta o rechaza;
 *   - todos los textos es-MX del diálogo, de la columna «Conciliación», del
 *     menú y de los errores del API (`CARGO_NO_CUADRA`, `LOTE_MONEDA_DISTINTA`,
 *     `MOVIMIENTO_CON_LOTE`, `GASTO_YA_CUBIERTO`…);
 *   - por qué un gasto del MISMO monto no sale en la lista vacía (efectivo,
 *     ya conciliado, otra moneda, fuera de la ventana): `textoExcluidosCandidatos`
 *     sobre `excluidos` del API 0.0.63 (6-oct-2026), con «Mostrar estos
 *     gastos» para los que están en efectivo (`AvisoExcluidos.mostrar`);
 *   - los errores de vincular un gasto que NO pasó por el banco
 *     (`JUSTIFICACION_REQUERIDA`, `GASTO_BODEGA`). El resto de esa regla
 *     (medios, interruptor, justificación, insignias) vive en
 *     `conciliacion-no-bancario.ts`.
 * Ningún componente redacta estas frases a mano. Todos los campos del API son
 * ADITIVOS: sin ellos (API previo) la UI se comporta como antes.
 */

import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  descripcionCandidatoGasto,
  etiquetaCandidatoGasto,
  primeraLinea,
  type GastoCandidatoConciliacion,
} from "@/lib/admin/conciliacion-auto";
import {
  TOLERANCIA_CONCILIACION,
  fmtMontoConciliacion,
  numeroDe,
  textoGastoYaCubierto,
  toastVinculoGasto,
  type RespuestaVinculoGasto,
} from "@/lib/admin/conciliacion-parcial";
import { etiquetaFolioComprobante, tituloFolioComprobante } from "@/lib/admin/conciliacion-folio";
import { MSG_SERVIDOR_NO_RESPONDIO, esErrorTecnico } from "@/lib/admin/errores-tecnicos";
import { MEDIO_PAGO_LABELS, medioPagoLabel } from "@/lib/admin/medios-pago";
import {
  MSG_JUSTIFICACION_API_VIEJO,
  MSG_NO_BANCARIOS_API_VIEJO,
  badgeVinculoNoBancario,
  esCandidatoNoBancario,
  esMedioBodega,
  esMedioNoBancario,
  etiquetaMedioNoBancario,
  noBancariosDeDetalle,
  type BadgeVinculoNoBancario,
  type GastoNoBancarioDetalle,
} from "@/lib/admin/conciliacion-no-bancario";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import { fmtDateOnly } from "@/lib/datetime";
import type {
  CargoConciliadoExcluido,
  ExcluidosCandidatos,
  GastoCandidato,
  GastoEstadoParte,
  GastoExcluidoCandidato,
  MovimientoGasto,
  SugerenciaConciliacion,
} from "@/types/conciliacion";

// ───────────────────────────── Constantes ─────────────────────────────

/** Ventana por defecto de los candidatos (± días de la fecha del cargo). */
export const VENTANA_CARGO_DIAS = 30;
/** «Ampliar a 120 días». */
export const VENTANA_AMPLIADA_DIAS = 120;
/** Tope del texto de búsqueda (`@MaxLength(80)` del DTO del API). */
export const LARGO_MAX_BUSQUEDA = 80;
/** Tope de gastos por cargo (`@ArrayMaxSize(50)` del DTO del API). */
export const MAX_GASTOS_LOTE = 50;
/** Espera del buscador antes de preguntar al servidor. */
export const DEBOUNCE_BUSQUEDA_MS = 300;
/** Líneas de detalle que pinta la columna «Conciliación» antes de «y N más». */
export const MAX_LINEAS_LOTE = 3;

/** Redondeo a centavos (evita 0.30000000000000004 en los textos). */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

const EPS = 1e-6;

const fmt = (v: unknown, moneda?: string | null) => fmtMontoConciliacion(v, moneda ?? null);

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ───────────────────────────── Tolerancia ─────────────────────────────

/**
 * Tolerancia del LOTE (N ≥ 2 gastos en un cargo): un centavo por gasto, al
 * menos 0.02 y nunca más de 1.00 — `least(1.00, greatest(0.02, 0.01 × N))`.
 * MISMA fórmula que la BD (`tolerancia_lote`) y el API (`toleranciaLote`):
 * N=2 ⇒ 0.02; N=3 ⇒ 0.03; N=29 ⇒ 0.29. Absorbe el medio centavo de SAESA
 * (factura 2,231.375, el banco cobra 4,462.75 por dos).
 */
export function toleranciaLote(n: number): number {
  const k = Number.isFinite(n) ? n : 0;
  return centavos(Math.min(1, Math.max(0.02, 0.01 * k)));
}

// ─────────────────────── La liga de un movimiento ───────────────────────

/** Lo que el panel necesita de un movimiento para saber qué gastos paga. */
export interface MovimientoConGastos {
  conciliado?: boolean | null;
  monto?: string | number | null;
  /** Notas del CARGO: ahí anota el API la justificación de un gasto en
      efectivo (6-oct-2026); la insignia de la columna las lleva al tooltip. */
  notas?: string | null;
  gasto_id?: string | null;
  gasto?: MovimientoGasto | null;
  gastos_n?: number | null;
  gastos?: readonly MovimientoGasto[] | null;
  gastos_suma?: number | string | null;
  gastos_diferencia?: number | string | null;
}

/**
 * Los gastos que paga el movimiento: `gastos[]` (API 0.0.52) o, sin él, el
 * espejo de siempre (`gasto`). Vacío = sin detalle (no es lo mismo que «sin
 * liga»: un lote sin `gastos[]` por skew de deploy trae `gastos_n`).
 */
export function gastosLigadosDe(m: MovimientoConGastos | null | undefined): MovimientoGasto[] {
  if (!m) return [];
  if (Array.isArray(m.gastos) && m.gastos.length > 0) return m.gastos.filter(Boolean);
  return m.gasto ? [m.gasto] : [];
}

/**
 * ¿El movimiento está ligado a algún gasto? `gastos_n > 0 || gasto_id != null
 * || gastos.length`. Con un lote `gasto_id` es NULL: preguntar solo por
 * `gasto_id` lo pintaría «Pendiente» y ofrecería «Vincular gasto» sobre un
 * cargo que ya paga tres.
 */
export function tieneGastoLigado(
  m: { gastos_n?: number | null; gasto_id?: string | null; gastos?: readonly unknown[] | null } | null | undefined,
): boolean {
  if (!m) return false;
  return (
    (Number(m.gastos_n) || 0) > 0 ||
    m.gasto_id != null ||
    (Array.isArray(m.gastos) && m.gastos.length > 0)
  );
}

/** Cuántos gastos paga el cargo: `gastos_n` del API o, sin él, lo que se ve. */
export function numeroGastosDe(m: MovimientoConGastos | null | undefined): number {
  if (!m) return 0;
  const n = Number(m.gastos_n);
  if (m.gastos_n != null && Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  const vistos = gastosLigadosDe(m).length;
  return vistos > 0 ? vistos : m.gasto_id != null ? 1 : 0;
}

/** ¿El cargo paga DOS o más gastos (un lote)? */
export function esCargoConLote(m: MovimientoConGastos | null | undefined): boolean {
  return tieneGastoLigado(m) && numeroGastosDe(m) >= 2;
}

/**
 * El gasto de un cargo que paga UNO solo (la fila de siempre): el espejo
 * `gasto` o, si el API solo mandó `gastos[]`, su único elemento. null con un
 * lote o sin detalle.
 */
export function gastoUnicoDe(m: MovimientoConGastos | null | undefined): MovimientoGasto | null {
  if (!m || esCargoConLote(m)) return null;
  if (m.gasto) return m.gasto;
  const lista = gastosLigadosDe(m);
  return lista.length === 1 ? lista[0] : null;
}

// ──────────────────────── Guía de la suma del lote ────────────────────────

/** Un gasto marcado, tal como lo pinta el diálogo. */
export interface GastoParaLote {
  monto: string | number;
  /** Lo que le falta (API): si ya tiene otro cargo, solo entra por esto. */
  faltante?: string | number | null;
  moneda?: string | null;
  /** Gasto USD contra cuenta MXN (solo 1 a 1). */
  cruzado?: boolean | null;
  /** T.C. implícito (cargo ÷ gasto): solo lo traen los cruzados. */
  tc_implicito?: number | string | null;
}

export interface EstadoLoteCargo {
  n: number;
  /** Σ de lo que aporta cada gasto (su faltante o su monto). */
  suma: number;
  /** |cargo| − suma, a centavos (positiva = faltan gastos). */
  diferencia: number;
  /** La tolerancia aplicada: `toleranciaLote(n)` con 2+, 1.00 con uno. */
  tolerancia: number;
  cuadra: boolean;
  /** El cargo es MAYOR que lo marcado: faltan gastos. */
  faltan: boolean;
  /** Con 2+ gastos, lo marcado rebasa el cargo (el API lo rechazará). */
  sePasa: boolean;
  /** Con UN gasto, el cargo cubre solo una parte (pago parcial legítimo). */
  parcial: boolean;
  /** Algún gasto en otra moneda (o cruzado): la suma no aplica. */
  monedasMezcladas: boolean;
  /** Moneda de la cuenta (para los textos). */
  moneda: string | null;
  /** |monto| del cargo, a centavos. */
  cargo: number;
}

/** Lo que un gasto puede recibir de este cargo: su faltante o su monto. */
export function aporteDeGasto(g: GastoParaLote): number {
  return centavos(g.faltante != null ? numeroDe(g.faltante) : numeroDe(g.monto));
}

/**
 * Estado de la suma de los gastos MARCADOS contra el cargo. Es GUÍA visual
 * (verde/ámbar/rojo): nunca decide ni apaga el botón — el API valida con la
 * misma tolerancia y responde `CARGO_NO_CUADRA` si no.
 */
export function estadoLoteCargo(input: {
  montoCargo: string | number;
  monedaCuenta?: string | null;
  gastos: readonly GastoParaLote[];
}): EstadoLoteCargo {
  const gastos = input.gastos.filter(Boolean);
  const n = gastos.length;
  const moneda = input.monedaCuenta ?? null;
  const cargo = centavos(Math.abs(numeroDe(input.montoCargo)));
  const monedasMezcladas = gastos.some(
    (g) => esCandidatoCruzado(g) || (moneda != null && g.moneda != null && g.moneda !== moneda),
  );
  const suma = centavos(gastos.reduce((acc, g) => acc + aporteDeGasto(g), 0));
  const diferencia = centavos(cargo - suma);
  const tolerancia = n >= 2 ? toleranciaLote(n) : TOLERANCIA_CONCILIACION;
  const aplica = n > 0 && !monedasMezcladas;
  const cuadra = aplica && Math.abs(diferencia) <= tolerancia + EPS;
  const faltan = aplica && diferencia > tolerancia + EPS;
  const exceso = aplica && diferencia < -(tolerancia + EPS);
  return {
    n,
    suma,
    diferencia,
    tolerancia,
    cuadra,
    faltan,
    sePasa: exceso && n >= 2,
    parcial: exceso && n === 1,
    monedasMezcladas,
    moneda,
    cargo,
  };
}

export type TonoSumaLote = "verde" | "ambar" | "rojo" | "neutro";

/**
 * La línea de la suma debajo de la lista: «3 gastos suman $8,404.20 · cuadra
 * con el cargo de $8,404.20». null sin gastos marcados.
 */
export function textoSumaLote(e: EstadoLoteCargo): { texto: string; tono: TonoSumaLote } | null {
  if (e.n === 0) return null;
  const moneda = e.moneda;
  const cargo = fmt(e.cargo, moneda);
  if (e.monedasMezcladas) {
    return e.n === 1
      ? {
          texto:
            "Gasto en otra moneda: se vincula 1 a 1 y el sistema guarda el tipo de cambio real del banco.",
          tono: "neutro",
        }
      : {
          texto: `Hay gastos en otra moneda: un cargo con varios gastos exige que todos estén en ${moneda ?? "la moneda de la cuenta"}.`,
          tono: "rojo",
        };
  }
  const base =
    e.n === 1 ? `1 gasto: ${fmt(e.suma, moneda)}` : `${e.n} gastos suman ${fmt(e.suma, moneda)}`;
  if (e.cuadra) {
    const dif = Math.abs(e.diferencia) >= 0.005 ? ` (diferencia ${fmt(Math.abs(e.diferencia), moneda)})` : "";
    return { texto: `${base} · cuadra con el cargo de ${cargo}${dif}`, tono: "verde" };
  }
  if (e.faltan) {
    return { texto: `${base} · faltan ${fmt(e.diferencia, moneda)} para el cargo de ${cargo}`, tono: "ambar" };
  }
  if (e.sePasa) {
    return { texto: `${base} · se pasan ${fmt(-e.diferencia, moneda)} del cargo de ${cargo}`, tono: "rojo" };
  }
  // Un solo gasto MÁS grande que el cargo: pago parcial (legítimo).
  return {
    texto: `${base} · el cargo de ${cargo} cubre una parte: el gasto queda como pago parcial (faltan ${fmt(-e.diferencia, moneda)})`,
    tono: "ambar",
  };
}

// ───────────────────────── Candidatos del diálogo ─────────────────────────

/**
 * Ficha para las etiquetas de siempre (`etiquetaCandidatoGasto` /
 * `descripcionCandidatoGasto`): el API manda la primera línea de las notas
 * como `nota` y esas funciones la leen como `notas_primera_linea`. Sin esto
 * los 29 «Pago VIP SAESA» (sin proveedor ni lugar) serían indistinguibles.
 */
export function fichaCandidatoGasto(c: GastoCandidato): GastoCandidatoConciliacion {
  return { ...c, notas_primera_linea: c.notas_primera_linea ?? c.nota ?? null };
}

/**
 * ¿El candidato es CRUZADO (gasto USD contra cuenta MXN, solo 1 a 1)? La
 * bandera `cruzado` la manda `gastos-candidatos`; las fichas de `sugerir` (la
 * IA) NO la traen, pero sí su `tc_implicito` (> 0 solo en los cruzados: los
 * de la moneda de la cuenta llegan con null). Revisión 2-oct-2026: sin esto,
 * un gasto USD sugerido por la IA entraba a un lote que el API jamás acepta.
 */
export function esCandidatoCruzado(c: {
  cruzado?: boolean | null;
  tc_implicito?: number | string | null;
}): boolean {
  return c.cruzado === true || numeroDe(c.tc_implicito) > 0;
}

/**
 * Por qué un candidato NO puede entrar en un cargo con VARIOS gastos: gasto
 * cruzado (USD contra cuenta MXN, solo 1 a 1) o en otra moneda. null = puede.
 */
export function motivoVetoLote(
  c: Pick<GastoCandidato, "cruzado" | "moneda" | "tc_implicito">,
  monedaCuenta: string | null | undefined,
): string | null {
  if (esCandidatoCruzado(c)) {
    return `Gasto en ${c.moneda ?? "otra moneda"} contra una cuenta en ${monedaCuenta ?? "otra moneda"}: se vincula solo (1 a 1), nunca junto con otros gastos.`;
  }
  if (monedaCuenta && c.moneda && c.moneda !== monedaCuenta) {
    return `Gasto en ${c.moneda} y la cuenta en ${monedaCuenta}: no entra en un cargo con varios gastos.`;
  }
  return null;
}

/**
 * ¿La casilla de esta fila va apagada? Un gasto vetado para el lote se puede
 * marcar SOLO (el 1↔1 cruzado de siempre); si ya hay otro marcado, se apaga.
 * Y si el marcado es el vetado, se apagan los demás. Lo ya marcado nunca se
 * apaga (siempre se puede desmarcar). null = habilitada.
 */
export function bloqueoDeFila(
  c: GastoCandidato,
  monedaCuenta: string | null | undefined,
  marcados: readonly GastoCandidato[],
): string | null {
  if (marcados.some((m) => m.id === c.id)) return null;
  const propio = motivoVetoLote(c, monedaCuenta);
  if (propio && marcados.length > 0) return propio;
  if (marcados.some((m) => motivoVetoLote(m, monedaCuenta) != null)) {
    return "Ya marcaste un gasto en otra moneda: ese se vincula solo. Desmárcalo para elegir varios.";
  }
  return null;
}

/**
 * Los ids que VIAJAN al API: sin repetir y, con 2+, sin los vetados (un
 * vetado jamás viaja dentro de un lote; solo, sí: es el 1↔1 cruzado).
 */
export function idsParaVincular(
  marcados: readonly GastoCandidato[],
  monedaCuenta: string | null | undefined,
): string[] {
  const unicos: GastoCandidato[] = [];
  const vistos = new Set<string>();
  for (const m of marcados) {
    if (!m?.id || vistos.has(m.id)) continue;
    vistos.add(m.id);
    unicos.push(m);
  }
  if (unicos.length < 2) return unicos.map((m) => m.id);
  return unicos.filter((m) => motivoVetoLote(m, monedaCuenta) == null).map((m) => m.id);
}

/**
 * Candado del botón «Vincular N gastos» (revisión 2-oct-2026): si entre los
 * marcados hay un gasto vetado para el lote, `idsParaVincular` lo quitaría y
 * viajarían MENOS gastos de los que dice el botón (y el toast diría «2 gastos
 * vinculados» con 3 marcados). Lo que ve el operador es lo que se liga: no se
 * manda nada y se le dice cuál quitar. null = viajan exactamente los marcados.
 */
export function textoVetadosAlVincular(
  marcados: readonly GastoCandidato[],
  monedaCuenta: string | null | undefined,
): string | null {
  const unicos = new Set(marcados.filter((m) => m?.id).map((m) => m.id)).size;
  const viajan = idsParaVincular(marcados, monedaCuenta).length;
  const fuera = unicos - viajan;
  if (fuera <= 0) return null;
  return fuera === 1
    ? "Quita el gasto en otra moneda: se vincula solo (1 a 1), nunca junto con otros gastos."
    : `Quita los ${fuera} gastos en otra moneda: cada uno se vincula solo (1 a 1), nunca junto con otros gastos.`;
}

/**
 * Lo marcado después de que la IA contestó (revisión 2-oct-2026). La IA
 * PROPONE: su gasto se preselecciona SOLO si no había nada marcado; si la
 * persona ya marcó gastos, el sugerido solo lleva ★ (sumarlo armaba un lote
 * que nadie pidió). Devuelve el MISMO arreglo cuando no cambia nada.
 */
export function marcadosTrasSugerencia(
  prev: GastoCandidato[],
  sugerido: GastoCandidato | null | undefined,
  monedaCuenta: string | null | undefined,
): GastoCandidato[] {
  if (!sugerido?.id) return prev;
  if (prev.length > 0) return prev;
  if (bloqueoDeFila(sugerido, monedaCuenta, prev) != null) return prev;
  return [sugerido];
}

/**
 * Nota bajo la sugerencia cuando NO se preseleccionó (ya había gastos
 * marcados): dónde está y qué hacer. null si el sugerido ya está marcado.
 */
export function textoSugeridoSinMarcar(sugeridoMarcado: boolean, hayMarcados: boolean): string | null {
  if (sugeridoMarcado || !hayMarcados) return null;
  return "No se marcó solo porque ya tenías gastos marcados: búscalo con ★ en la lista y márcalo si este cargo también lo pagó.";
}

/**
 * El gasto que sugirió la IA va AL FRENTE de la lista aunque la búsqueda o la
 * ventana no lo trajeran (su ficha sale de `sugerencia.candidatos`). La IA no
 * trae su propia lista: aporta un ★ dentro de la de siempre.
 */
export function conSugeridoAlFrente(
  resultados: readonly GastoCandidato[],
  sugerido: GastoCandidato | null | undefined,
): GastoCandidato[] {
  if (!sugerido) return [...resultados];
  return [sugerido, ...resultados.filter((r) => r.id !== sugerido.id)];
}

/** La ficha del gasto sugerido por la IA (null si no propuso o no vino). */
export function fichaSugerida(s: SugerenciaConciliacion | null | undefined): GastoCandidato | null {
  const id = s?.gasto_id_sugerido;
  if (!id) return null;
  return (s?.candidatos ?? []).find((c) => c?.id === id) ?? null;
}

/** Los marcados ARRIBA (aunque no coincidan con la búsqueda) y luego el resto. */
export function listaConMarcadosPrimero(
  resultados: readonly GastoCandidato[],
  marcados: readonly GastoCandidato[],
): GastoCandidato[] {
  const ids = new Set(marcados.map((m) => m.id));
  return [...marcados, ...resultados.filter((r) => !ids.has(r.id))];
}

/** «2801.405» ⇒ «2801.41»: redondeo a centavos sobre el TEXTO (sin el 0.4999… de los flotantes). */
function aDosDecimales(entero: string, decimales: string): string {
  if (decimales.length <= 2) return decimales ? `${entero}.${decimales}` : entero;
  const centavosTotales = Math.round(Number(`${entero}${decimales.slice(0, 2)}.${decimales.slice(2)}`));
  return `${Math.trunc(centavosTotales / 100)}.${String(centavosTotales % 100).padStart(2, "0")}`;
}

/**
 * Texto del buscador tal como viaja al API: un MONTO se manda limpio
 * («2,801.40» / «$ 2801.40» ⇒ «2801.40»; «2801» ⇒ «2801», que el API busca en
 * [2801, 2802)); un texto (proveedor, nota) se manda tal cual, sin espacios de
 * más. El API solo entiende un monto con 0, 1 o 2 decimales
 * (`interpretarBusquedaGasto`: `^\d+\.\d{1,2}$`), así que (revisión 2-oct-2026)
 * la coma decimal al estilo europeo se convierte («2.801,40» / «2801,40» ⇒
 * «2801.40») y más de 2 decimales se redondean («2801.405» ⇒ «2801.41»): si
 * no, se buscaba como TEXTO y salía «Ningún gasto pendiente coincide…».
 * Idempotente (el diálogo y la action la aplican los dos).
 */
export function normalizarBusquedaMonto(q: string | null | undefined): string {
  const t = (q ?? "").trim();
  const sinSigno = t.replace(/[$\s]/g, "");
  // Coma DECIMAL (1 o 2 dígitos tras la coma), con puntos de miles opcionales.
  const europeo = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(sinSigno);
  if (europeo) return aDosDecimales(europeo[1].replace(/\./g, ""), europeo[2]);
  const limpio = sinSigno.replace(/,/g, "");
  const numero = /^(\d+)(?:\.(\d*))?$/.exec(limpio);
  if (numero) return aDosDecimales(numero[1], numero[2] ?? "");
  return t.replace(/\s+/g, " ");
}

/** Normaliza y recorta al tope del DTO (80). */
export function busquedaParaApi(q: string | null | undefined): string {
  return normalizarBusquedaMonto(q).slice(0, LARGO_MAX_BUSQUEDA).trim();
}

/** ¿La búsqueda (ya normalizada) es un MONTO que el API entiende? «212» y «2801.40» sí; «ASUR», no. */
export function esBusquedaMonto(q: string | null | undefined): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(busquedaParaApi(q));
}

/**
 * La búsqueda con la que «Mostrar estos gastos» (6-oct-2026) los TRAE: un
 * monto tecleado se queda (los excluidos se buscaron con él); sin búsqueda o
 * con un TEXTO, el monto de esos gastos («212.00»). Sin monto, la lista con el
 * interruptor podía llenarse con cien gastos del banco (van primero) antes que
 * ellos, y un texto podía esconderlos.
 */
export function busquedaParaMostrarNoBancarios(
  q: string | null | undefined,
  monto: string | number | null | undefined,
): string {
  const actual = busquedaParaApi(q);
  if (esBusquedaMonto(actual)) return actual;
  const m = centavos(Math.abs(numeroDe(monto)));
  return m > 0 ? m.toFixed(2) : actual;
}

/** La búsqueda que puso el interruptor (o «Mostrar estos gastos») y la que había antes. */
export interface BusquedaPuestaPorInterruptor {
  puesta: string;
  previa: string;
}

/**
 * La búsqueda al mover el interruptor «Incluir gastos en efectivo y otros
 * medios» (revisión 6-oct-2026). La lista se corta en 100 y el efectivo va
 * detrás de los del banco: en el caso real (cargo de $212.00 del 07-sep)
 * había 254 gastos del banco sin conciliar a ±30 días y, con el API que los
 * ponía TODOS primero, encenderlo SIN búsqueda no traía ningún gasto en
 * efectivo y parecía no hacer nada. Con el monto, salen con cualquier orden.
 *  - Encenderlo con la búsqueda VACÍA ⇒ el monto del cargo («212.00»), como
 *    «Mostrar estos gastos». Lo tecleado (monto o texto) se respeta.
 *  - Apagarlo ⇒ si la búsqueda sigue siendo la que puso el interruptor,
 *    vuelve la de antes.
 * `auto` = lo que puso el interruptor (para deshacerlo al apagarlo).
 */
export function busquedaAlCambiarNoBancarios(s: {
  activo: boolean;
  /** Lo tecleado (se normaliza como lo que viaja). */
  texto: string | null | undefined;
  montoCargo: string | number | null | undefined;
  auto: BusquedaPuestaPorInterruptor | null | undefined;
}): { q: string; auto: BusquedaPuestaPorInterruptor | null } {
  const actual = busquedaParaApi(s.texto);
  if (!s.activo) {
    return s.auto && actual === s.auto.puesta ? { q: s.auto.previa, auto: null } : { q: actual, auto: null };
  }
  const m = centavos(Math.abs(numeroDe(s.montoCargo)));
  if (actual || !(m > 0)) return { q: actual, auto: null };
  const q = m.toFixed(2);
  return { q, auto: { puesta: q, previa: actual } };
}

// ─────────────────────────── Textos del diálogo ───────────────────────────

export const TITULO_VINCULAR_GASTO = "Vincular gasto";

/** «Cargo de $8,404.20 del 24 sep 2026 · SPEI SAESA. Marca el gasto…». */
export function descripcionVincularGasto(m: {
  monto: string | number;
  fecha: string;
  descripcion?: string | null;
}): string {
  const desc = (m.descripcion ?? "").trim();
  return `Cargo de ${fmt(Math.abs(numeroDe(m.monto)))} del ${fmtDateOnly(m.fecha)}${desc ? ` · ${desc}` : ""}. Marca el gasto que pagó; si pagó varias facturas, márcalas todas.`;
}

export const PLACEHOLDER_BUSCAR_GASTO = "Busca por monto (2801.40), proveedor o nota";

/** «Gastos candidatos · ±30 días». */
export function etiquetaListaCandidatos(dias: number): string {
  return `Gastos candidatos · ±${dias} días`;
}

/** «Ampliar a 120 días». */
export function textoAmpliarVentana(dias: number): string {
  return `Ampliar a ${dias} días`;
}

/**
 * Nota al pie: qué se ofrece y cómo se usa. Con el interruptor de gastos en
 * efectivo encendido (6-oct-2026) dice que también salen y CÓMO encontrarlos
 * (revisión: «sin búsqueda, primero los que cuadran con su monto» era falso
 * para los de efectivo, que el API pone detrás de los del banco y la lista
 * corta en 100: podían ni salir). No promete un orden: lo decide el API.
 */
export function NOTA_VENTANA_CARGO(dias: number, incluyeNoBancarios = false): string {
  if (incluyeNoBancarios) {
    return `Gastos sin conciliar del banco (tarjeta, transferencia, PayWise) y en efectivo u otros medios (nunca bodega), en la moneda de la cuenta y con fecha ±${dias} días del cargo; los de efectivo pueden quedar al final de la lista: para encontrar uno, búscalo por su monto. Si el cargo pagó varias facturas, márcalas todas: deben sumar el cargo.`;
  }
  return `Gastos bancarios (tarjeta, transferencia, PayWise) sin conciliar, en la moneda de la cuenta y con fecha ±${dias} días del cargo; sin búsqueda, primero los que cuadran con su monto. Si el cargo pagó varias facturas, márcalas todas: deben sumar el cargo.`;
}

/** Hubo más candidatos que el tope: la búsqueda los encuentra. */
export function textoTruncado(n: number): string {
  return `Se muestran los primeros ${n}: escribe el monto, el proveedor o la nota para encontrar el que buscas.`;
}

/**
 * Hubo más candidatos que el tope CON el interruptor encendido: los de
 * efectivo pueden no alcanzar a salir (el API los pone detrás de los del
 * banco; revisión 6-oct-2026). Dice con qué monto buscarlos.
 */
export function textoTruncadoNoBancarios(n: number, montoCargo?: string | number | null): string {
  const m = centavos(Math.abs(numeroDe(montoCargo)));
  const monto = m > 0 ? `el monto (${m.toFixed(2)})` : "el monto";
  return `Se muestran los primeros ${n} y los gastos en efectivo pueden quedar fuera: escribe ${monto}, el proveedor o la nota para verlos.`;
}

/** «Vincular 1 gasto» / «Vincular 3 gastos» (sin marcados: «Vincular»). */
export function botonVincularGastos(n: number): string {
  if (n <= 0) return "Vincular";
  return `Vincular ${n} ${plural(n, "gasto", "gastos")}`;
}

export const BOTON_REINTENTAR = "Reintentar";
export const BOTON_CANCELAR = "Cancelar";
export const TEXTO_VINCULANDO = "Vinculando…";
export const TITULO_VER_GASTO_CONCILIADO = "Ver el gasto con el que se concilió";

/** «Quedó pendiente: sin candidato.» (el motivo que ya pinta la tabla). */
export function textoMotivoPendienteDialogo(etiqueta: string): string {
  return `Quedó pendiente: ${etiqueta.toLowerCase()}.`;
}

export const MSG_GASTO_INVALIDO = "Gasto inválido.";
export const MSG_ELIGE_UN_GASTO = "Elige al menos un gasto.";
export const MSG_TOPE_GASTOS_LOTE = `Un cargo admite hasta ${MAX_GASTOS_LOTE} gastos.`;
/** La server action ni siquiera salió (sin red, Vercel cortó). */
export const MSG_SIN_CONEXION = "No hubo conexión con el servidor. Vuelve a intentarlo.";

/** Opción del selector de respaldo (forma de `SearchableSelectOption`). */
export interface OpcionGastoRespaldo {
  value: string;
  label: string;
  description?: string;
  descriptionClassName?: string;
}

/**
 * Respaldo con un API previo (sin candidatos ni lotes): la lista precargada
 * de siempre y, si la IA ya contestó, sus candidatos ARRIBA con ★ en el
 * sugerido — un solo gasto por cargo, como hasta hoy.
 */
export function opcionesRespaldoVincular(
  precargados: readonly OpcionGastoRespaldo[],
  sugerencia: SugerenciaConciliacion | null | undefined,
): OpcionGastoRespaldo[] {
  const vistos = new Set<string>();
  const sug = sugerencia?.gasto_id_sugerido ?? null;
  const deIa: OpcionGastoRespaldo[] = [];
  for (const c of sugerencia?.candidatos ?? []) {
    if (!c?.id || vistos.has(c.id)) continue;
    // Un gasto en efectivo pide una razón y el respaldo no tiene dónde
    // escribirla (la página tampoco los precarga; revisión 6-oct-2026).
    if (esCandidatoNoBancario(c)) continue;
    vistos.add(c.id);
    const ficha = fichaCandidatoGasto(c);
    const esSugerido = c.id === sug;
    const desc = descripcionCandidatoGasto(ficha);
    deIa.push({
      value: c.id,
      label: `${esSugerido ? "★ " : ""}${etiquetaCandidatoGasto(ficha)}`,
      description: [esSugerido ? ETIQUETA_SUGERIDO : null, desc].filter(Boolean).join(" · ") || undefined,
      ...(esSugerido ? { descriptionClassName: "truncate text-emerald-600 dark:text-emerald-400 font-medium" } : {}),
    });
  }
  deIa.sort((a, b) => (a.value === sug ? -1 : b.value === sug ? 1 : 0));
  return [...deIa, ...precargados.filter((o) => !vistos.has(o.value))];
}

/** API previo (sin ruta de candidatos o sin `gasto_ids`). */
export const MSG_LOTE_API_VIEJO =
  "El servidor todavía no permite vincular varios gastos a un cargo (falta actualizar el API). Por ahora elige un solo gasto de la lista.";

/**
 * API nuevo SIN la migración (503 `CONCILIACION_PARTES_NO_DISPONIBLE`): lo que
 * falta es la base de datos, no el API (revisión 2-oct-2026: decir «falta
 * actualizar el API» mandaba a sistemas a buscar donde no era).
 */
export const MSG_LOTE_SIN_MIGRACION =
  "La base de datos todavía no tiene esta mejora (vincular varios gastos a un cargo). Por ahora elige un solo gasto de la lista.";

/** El 404 de un movimiento que ya no existe (lo borraron con el diálogo abierto). */
export const MSG_MOVIMIENTO_NO_EXISTE = "Ese movimiento ya no existe: recarga la página.";

// ───────────────────────── Estado del buscador ─────────────────────────

export type TipoEstadoBuscador = "cargando" | "error" | "vacio_sin_q" | "vacio_con_q" | "lista";

/**
 * Qué pinta la lista. El ERROR va ANTES que el vacío: una búsqueda fallida
 * jamás se pinta como «no hay gastos» (regla del panel: nunca pintar sin
 * datos cuando la carga falló).
 */
export function estadoBuscadorGastos(s: {
  cargando: boolean;
  /** Mensaje ya en es-MX (`mensajeErrorBusquedaGastos`) o null. */
  error: string | null | undefined;
  q: string | null | undefined;
  resultados: number;
  truncado?: boolean | null;
  dias?: number;
  /** El interruptor de gastos en efectivo está encendido (el vacío lo dice). */
  incluyeNoBancarios?: boolean;
  /** Monto del cargo: con el interruptor y la lista cortada, con qué buscarlos. */
  montoCargo?: string | number | null;
}): { tipo: TipoEstadoBuscador; texto: string } {
  const q = (s.q ?? "").trim();
  const dias = s.dias ?? VENTANA_CARGO_DIAS;
  if (s.cargando) {
    return { tipo: "cargando", texto: q ? `Buscando «${q}»…` : "Buscando gastos candidatos…" };
  }
  if (s.error) return { tipo: "error", texto: s.error };
  const salida =
    dias < VENTANA_AMPLIADA_DIAS
      ? `Amplía a ${VENTANA_AMPLIADA_DIAS} días o búscalo por monto, proveedor o nota.`
      : "Búscalo por monto, proveedor o nota, o captura el gasto que falta.";
  if (s.resultados === 0) {
    return q
      ? {
          tipo: "vacio_con_q",
          texto: `Ningún gasto pendiente coincide con «${q}» en ±${dias} días del cargo. ${salida}`,
        }
      : {
          tipo: "vacio_sin_q",
          texto: s.incluyeNoBancarios
            ? `No hay gastos pendientes (del banco ni en efectivo) en ±${dias} días del cargo. ${salida}`
            : `No hay gastos bancarios pendientes en ±${dias} días del cargo. ${salida}`,
        };
  }
  if (!s.truncado) return { tipo: "lista", texto: "" };
  return {
    tipo: "lista",
    texto: s.incluyeNoBancarios ? textoTruncadoNoBancarios(s.resultados, s.montoCargo) : textoTruncado(s.resultados),
  };
}

// ────────────── Por qué un gasto del mismo monto NO aparece ──────────────
//
// Caso real (6-oct-2026): cargo de $212.00 del 07-sep (ASUR CANCUN, GASTOS
// GNRAL). La oficina buscó «212» y vio «Ningún gasto pendiente coincide…»,
// pero había TRES gastos de $212.00 (24, 27 y 28-sep, Taxi / estacionamiento
// de ASUR, vuelos #338 y #330) capturados en EFECTIVO, y la lista solo ofrece
// gastos bancarios: creyeron que era un bug. Con la lista VACÍA el API
// (0.0.63) manda `excluidos` y aquí se redacta UNA frase por motivo, con una
// liga por gasto. Sin `excluidos` (API previo) no hay frases: el vacío de
// siempre.

/** Orden de las frases; un motivo que el panel no conoce va al final. */
export const ORDEN_MOTIVOS_EXCLUIDOS = [
  "EFECTIVO_U_OTRO_MEDIO",
  "YA_CONCILIADO",
  "OTRA_MONEDA",
  "FUERA_DE_VENTANA",
] as const;

export const BOTON_VOLVER_A_BUSCAR = "Volver a buscar";
/** Rótulo de las ligas de los gastos que no entraron. */
export const ETIQUETA_LIGAS_EXCLUIDOS = "Abrir:";

/** Liga a un gasto que no entró: su vuelo o, sin vuelo, Gastos de ese día. */
export interface LigaGastoExcluido {
  key: string;
  /** «vuelo #338 (24 sep)» / «gasto del 12 jun». */
  texto: string;
  href: string;
  /** Qué gasto es y adónde lleva (abre en otra pestaña). */
  titulo: string;
}

/** Una frase por motivo, con las ligas de sus gastos (en orden de fecha). */
export interface AvisoExcluidos {
  motivo: string;
  texto: string;
  ligas: LigaGastoExcluido[];
  /**
   * «Mostrar estos gastos» (6-oct-2026): SOLO en `EFECTIVO_U_OTRO_MEDIO`, con
   * el interruptor de gastos en efectivo APAGADO y algún gasto vinculable (no
   * de bodega). `dias` = la ventana con la que salen (la de ahora o ±120 si
   * alguno cae más lejos); `monto` = el de esos gastos, para buscarlos
   * (`busquedaParaMostrarNoBancarios`). null = sin botón.
   */
  mostrar: { dias: number; monto: number } | null;
}

const FMT_DIA_MES = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const FMT_DIA_MES_ANIO = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** «a» · «a y b» · «a, b y c». */
function listaY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «2026-09-24» (o un ISO) ⇒ «2026-09-24»; "" si no es un día real. */
function diaDe(fecha: string | null | undefined): string {
  const ymd = typeof fecha === "string" ? fecha.slice(0, 10) : "";
  return esDiaValido(ymd) ? ymd : "";
}

/**
 * Fechas para una frase: «24, 27 y 28 sep» (un mes), «30 ago, 2 sep y 5 sep»
 * (varios meses) y con año si cruzan de año («28 dic 2025 y 3 ene 2026»). Sin
 * repetir y en orden; lo que no es un día real se ignora.
 */
export function textoFechasCortas(fechas: readonly (string | null | undefined)[]): string {
  const dias = [...new Set(fechas.map(diaDe).filter(Boolean))].sort();
  if (dias.length === 0) return "";
  const utc = dias.map((d) => new Date(`${d}T12:00:00Z`));
  if (new Set(dias.map((d) => d.slice(0, 4))).size > 1) return listaY(utc.map((d) => FMT_DIA_MES_ANIO.format(d)));
  if (new Set(dias.map((d) => d.slice(0, 7))).size > 1) return listaY(utc.map((d) => FMT_DIA_MES.format(d)));
  const mes = FMT_DIA_MES.formatToParts(utc[0]).find((p) => p.type === "month")?.value ?? "";
  return `${listaY(utc.map((d) => String(d.getUTCDate())))} ${mes}`.trim();
}

function folioDe(g: GastoExcluidoCandidato): number | null {
  const n = g.vuelo_folio == null ? Number.NaN : Number(g.vuelo_folio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** «vuelo #338» · «vuelos #338 y #330» (sin repetir, en orden de fecha); "" sin vuelos. */
function textoVuelos(gastos: readonly GastoExcluidoCandidato[]): string {
  const folios = [...new Set(gastos.map(folioDe).filter((f): f is number => f != null))];
  if (folios.length === 0) return "";
  return `${plural(folios.length, "vuelo", "vuelos")} ${listaY(folios.map((f) => `#${f}`))}`;
}

/** YA_CONCILIADO: los cargos con los que ya está (`conciliado_con`); [] si el API no los dijo. */
function cargosDe(g: GastoExcluidoCandidato): CargoConciliadoExcluido[] {
  return Array.isArray(g.conciliado_con) ? g.conciliado_con.filter((c) => c != null) : [];
}

/** «pesos» / «dólares» (otra moneda: su código). */
function nombreMoneda(m: string | null | undefined): string {
  if (m === "MXN") return "pesos";
  if (m === "USD") return "dólares";
  return m || "otra moneda";
}

/**
 * El medio dentro de una frase: «efectivo», «bodega (inventario)», «Personal
 * Pablo»; un código que el panel no conoce ⇒ «otro medio de pago» (JAMÁS el
 * código).
 */
function medioEnFrase(m: string | null | undefined): string {
  if (m === "EFECTIVO") return "efectivo";
  if (m === "BODEGA") return "bodega (inventario)";
  return (m && MEDIO_PAGO_LABELS[m]) || "otro medio de pago";
}

/** Días entre dos fechas de pared («YYYY-MM-DD» o ISO), en valor absoluto; null si alguna no es día. */
function distanciaDias(a: string | null | undefined, b: string | null | undefined): number | null {
  const da = diaDe(a);
  const db = diaDe(b);
  if (!da || !db) return null;
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.abs(utc(da) - utc(db)) / 86_400_000;
}

/**
 * La ventana con la que «Mostrar estos gastos» los TRAE: la de ahora o, si
 * alguno cae más lejos del cargo, la ampliada (±120; el API busca los
 * excluidos hasta ahí). Sin la fecha del cargo, la de ahora.
 */
export function ventanaParaMostrarNoBancarios(
  gastos: readonly Pick<GastoExcluidoCandidato, "fecha_gasto">[],
  fechaCargo: string | null | undefined,
  dias: number,
): number {
  const lejos = gastos.some((g) => {
    const d = distanciaDias(fechaCargo, g.fecha_gasto);
    return d != null && d > dias;
  });
  return lejos ? Math.max(dias, VENTANA_AMPLIADA_DIAS) : dias;
}

/** ¿Hay en el grupo algún gasto que el interruptor TRAE (no de bodega)? Sin fichas, se supone que sí. */
function hayVinculables(gastos: readonly GastoExcluidoCandidato[]): boolean {
  return gastos.length === 0 || gastos.some((g) => !esMedioBodega(g.medio_pago));
}

/**
 * Liga de un gasto que no entró, para corregirlo en OTRA pestaña (el diálogo
 * se queda abierto y «Volver a buscar» repite la búsqueda): al vuelo
 * (`hrefGastoConciliado`, donde se edita el gasto) o, sin vuelo —o si el API
 * no mandó su `vuelo_id`—, a Gastos filtrado a ese día.
 */
export function ligaGastoExcluido(g: GastoExcluidoCandidato): LigaGastoExcluido {
  const dia = diaDe(g.fecha_gasto);
  const fecha = textoFechasCortas([dia]);
  const folio = folioDe(g);
  const vueloId = esUuid(g.vuelo_id) ? (g.vuelo_id as string) : null;
  const texto =
    folio != null ? `vuelo #${folio}${fecha ? ` (${fecha})` : ""}` : fecha ? `gasto del ${fecha}` : "gasto";
  const href = vueloId
    ? hrefGastoConciliado({ vuelo_id: vueloId })
    : dia
      ? `/admin/expenses?desde=${dia}&hasta=${dia}`
      : "/admin/expenses";
  const que = [
    g.categoria ? categoriaGastoLabel(g.categoria) : null,
    fmt(g.monto, g.moneda),
    g.medio_pago ? medioPagoLabel(g.medio_pago) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const donde = vueloId
    ? `Abre ${folio != null ? `el vuelo #${folio}` : "su vuelo"} en otra pestaña.`
    : `Abre Gastos${fecha ? ` del ${fecha}` : ""} en otra pestaña.`;
  return { key: g.id, texto, href, titulo: `${que}. ${donde}` };
}

/** La frase de UN motivo (`n` = total del API; `gastos` = los que mandó, en orden). */
function fraseExcluidos(
  motivo: string,
  n: number,
  gastos: readonly GastoExcluidoCandidato[],
  c: { referencia: number; monedaCuenta: string | null; dias: number; incluyeNoBancarios: boolean },
): string {
  const primero = gastos[0];
  // OTRA_MONEDA dice la moneda con palabras: el monto va sin sufijo.
  const monto = primero
    ? fmt(primero.monto, motivo === "OTRA_MONEDA" ? null : primero.moneda)
    : fmt(c.referencia, c.monedaCuenta);
  const cuantos = `${n} ${plural(n, "gasto", "gastos")} de ${monto}`;
  const resto = n - gastos.length;
  const partes = [textoFechasCortas(gastos.map((g) => g.fecha_gasto)), textoVuelos(gastos)].filter(Boolean);
  const det = partes.length ? ` (${partes.join(" · ")}${resto > 0 ? `, y ${resto} más` : ""})` : "";

  switch (motivo) {
    case "EFECTIVO_U_OTRO_MEDIO": {
      const medios = [...new Set(gastos.map((g) => g.medio_pago).filter((m): m is string => !!m))];
      if (medios.length > 0 && medios.every((m) => esMedioBodega(m))) {
        return n === 1
          ? `Hay ${cuantos} con cargo a bodega${det}: es una salida de inventario y nunca pasa por el banco, así que no se concilia.`
          : `Hay ${cuantos} con cargo a bodega${det}: son salidas de inventario y nunca pasan por el banco, así que no se concilian.`;
      }
      const soloEfectivo = medios.length > 0 && medios.every((m) => m === "EFECTIVO");
      const como = soloEfectivo
        ? "en efectivo"
        : `${plural(n, "pagado", "pagados")} con ${medios.length > 0 ? listaY(medios.map(medioEnFrase)) : "otro medio de pago"}`;
      const bodega = medios.some((m) => esMedioBodega(m))
        ? " Los de bodega son salidas de inventario y nunca se vinculan."
        : "";
      if (c.incluyeNoBancarios) {
        // Con el interruptor ENCENDIDO ya salían: si no entran es por otra regla.
        return `Hay ${cuantos} ${como}${det} que no ${plural(n, "entra", "entran")} ni con los gastos en efectivo incluidos: ${plural(n, "puede estar ya conciliado", "pueden estar ya conciliados")}, en otra moneda o fuera de ±${c.dias} días del cargo.${bodega}`;
      }
      const banco = soloEfectivo ? "" : " (tarjeta, transferencia o PayWise)";
      const salida =
        n === 1
          ? "si no, muéstralo y vincúlalo con una justificación (su medio de pago no cambia)."
          : "si no, muéstralos y vincula el que corresponda con una justificación (su medio de pago no cambia).";
      return `Hay ${cuantos} ${como}${det}: la lista solo muestra gastos pagados por el banco${banco}. Si en realidad se pagó con tarjeta o transferencia, corrige el medio de pago del gasto; ${salida}${bodega}`;
    }
    case "YA_CONCILIADO": {
      const ya = n === 1 ? "ya está conciliado" : "ya están conciliados";
      const corrige =
        n === 1
          ? "Si se ligó por error, desvincúlalo en Conciliación y vuelve a buscar."
          : "Si alguno se ligó por error, desvincúlalo en Conciliación y vuelve a buscar.";
      // Con qué cargo, SOLO si el API lo dijo de TODOS los que llegaron (y no
      // hay más): `conciliado_con` null = no pudo leer la puente; [] = sin
      // cargo en la puente. Nunca se presume.
      const conocidos =
        resto === 0 &&
        gastos.length > 0 &&
        gastos.every((g) => {
          const cargos = cargosDe(g);
          return cargos.length > 0 && cargos.every((cg) => diaDe(cg.fecha) !== "");
        });
      if (!conocidos) return `${cuantos}${det} ${ya}. ${corrige}`;
      const cargos = gastos.flatMap(cargosDe);
      const nCargos = new Set(cargos.map((cg) => cg.movimiento_id || cg.fecha)).size;
      const cuentas = [...new Set(cargos.map((cg) => (cg.cuenta ?? "").trim()))];
      const cuenta = cuentas.length === 1 && cuentas[0] ? ` (${cuentas[0]})` : "";
      const con = `${nCargos === 1 ? "con el cargo" : "con los cargos"} del ${textoFechasCortas(cargos.map((cg) => cg.fecha))}${cuenta}`;
      return `${cuantos}${det} ${ya} ${con}. ${corrige}`;
    }
    case "OTRA_MONEDA": {
      const monedas = [...new Set(gastos.map((g) => g.moneda).filter((m): m is string => !!m))];
      const en = monedas.length === 1 ? nombreMoneda(monedas[0]) : "otra moneda";
      const cuenta = c.monedaCuenta
        ? `la cuenta es en ${nombreMoneda(c.monedaCuenta)} (${c.monedaCuenta})`
        : "la cuenta es de otra moneda";
      return `${cuantos} ${plural(n, "está", "están")} en ${en}${det} y ${cuenta}. Si se ${plural(n, "capturó", "capturaron")} con la moneda equivocada, corrige la moneda del gasto y vuelve a buscar.`;
    }
    case "FUERA_DE_VENTANA": {
      const fuera = `${cuantos}${det} ${plural(n, "cae", "caen")} fuera de ±${c.dias} días del cargo`;
      return c.dias < VENTANA_AMPLIADA_DIAS ? `${fuera}: amplía a ${VENTANA_AMPLIADA_DIAS} días.` : `${fuera}.`;
    }
    default:
      // Motivo nuevo del API: frase genérica, JAMÁS el código.
      return `Hay ${cuantos}${det} que no ${plural(n, "entra", "entran")} en la lista de candidatos.`;
  }
}

/**
 * Las frases bajo el vacío de «Vincular gasto»: UNA por motivo de
 * `excluidos` (API 0.0.63), en es-MX y en palabras de la oficina, cada una
 * con las ligas de sus gastos. El monto de cada frase es el de SUS gastos;
 * solo un grupo que llegara sin gastos se rotula con `ctx.montoBuscado`
 * (`excluidos_monto` del API: el de la búsqueda si es un monto) o, sin él,
 * con `montoCargo`. El panel no vuelve a interpretar la búsqueda. Sin
 * `excluidos` (API previo) o sin nada que explicar ⇒ [] y el diálogo queda
 * como antes. Con el interruptor de gastos en efectivo APAGADO
 * (`ctx.incluyeNoBancarios` false) la frase de los gastos en efectivo ofrece
 * «Mostrar estos gastos» (`mostrar`, con la ventana que hace falta según
 * `ctx.fechaCargo`); encendido, dice que no entran por otra regla.
 */
export function textoExcluidosCandidatos(
  excluidos: readonly ExcluidosCandidatos[] | null | undefined,
  montoCargo: string | number,
  ctx: {
    monedaCuenta?: string | null;
    dias?: number | null;
    montoBuscado?: number | string | null;
    /** El interruptor «Incluir gastos en efectivo y otros medios» está encendido. */
    incluyeNoBancarios?: boolean;
    /** Fecha del cargo (YYYY-MM-DD): decide si «Mostrar estos gastos» amplía la ventana. */
    fechaCargo?: string | null;
  } = {},
): AvisoExcluidos[] {
  if (!Array.isArray(excluidos)) return [];
  const buscado = Math.abs(numeroDe(ctx.montoBuscado));
  const c = {
    referencia: buscado > 0 ? buscado : Math.abs(numeroDe(montoCargo)),
    monedaCuenta: ctx.monedaCuenta ?? null,
    dias: ctx.dias ?? VENTANA_CARGO_DIAS,
    incluyeNoBancarios: ctx.incluyeNoBancarios === true,
  };
  const orden = (motivo: string) => {
    const i = (ORDEN_MOTIVOS_EXCLUIDOS as readonly string[]).indexOf(motivo);
    return i < 0 ? ORDEN_MOTIVOS_EXCLUIDOS.length : i;
  };
  const avisos: Array<AvisoExcluidos & { i: number }> = [];
  excluidos.forEach((grupo, i) => {
    if (!grupo || typeof grupo.motivo !== "string" || !grupo.motivo.trim()) return;
    const vistos = new Set<string>();
    const lista: readonly (GastoExcluidoCandidato | null | undefined)[] = Array.isArray(grupo.gastos)
      ? grupo.gastos
      : [];
    const gastos = lista
      .filter((g): g is GastoExcluidoCandidato => {
        if (!g || typeof g.id !== "string" || !g.id || vistos.has(g.id)) return false;
        vistos.add(g.id);
        return true;
      })
      .sort((a, b) => {
        const fa = diaDe(a.fecha_gasto) || "9999";
        const fb = diaDe(b.fecha_gasto) || "9999";
        return fa !== fb ? (fa < fb ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    const nApi = Math.trunc(numeroDe(grupo.n));
    const n = Math.max(nApi, gastos.length);
    if (n <= 0) return;
    const motivo = grupo.motivo.trim();
    const vinculables = gastos.filter((g) => !esMedioBodega(g.medio_pago));
    const mostrar =
      motivo === "EFECTIVO_U_OTRO_MEDIO" && !c.incluyeNoBancarios && hayVinculables(gastos)
        ? {
            dias: ventanaParaMostrarNoBancarios(vinculables, ctx.fechaCargo, c.dias),
            monto: centavos(Math.abs(numeroDe(vinculables[0]?.monto ?? c.referencia))),
          }
        : null;
    avisos.push({
      motivo,
      texto: fraseExcluidos(motivo, n, gastos, c),
      ligas: gastos.map(ligaGastoExcluido),
      mostrar,
      i,
    });
  });
  return avisos
    .sort((a, b) => orden(a.motivo) - orden(b.motivo) || a.i - b.i)
    .map(({ motivo, texto, ligas, mostrar }) => ({ motivo, texto, ligas, mostrar }));
}

// ───────────────────────────── Errores ─────────────────────────────

/** Lo que devuelve una server action de conciliación al fallar. */
export interface ResultadoAccionLote {
  ok?: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
  details?: unknown;
}

/** Códigos con los que el panel sabe que el API no tiene el lote. */
const CODIGOS_SIN_LOTE = new Set([
  "RUTA_NO_DISPONIBLE",
  "API_SIN_LOTE",
  "CONCILIACION_PARTES_NO_DISPONIBLE",
]);

/** 404 «Cannot GET …» = el API todavía no tiene la ruta (API previo). */
export function esRutaInexistente(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test((r.error ?? "").trim());
}

/** 400 «property gasto_ids should not exist» = el DTO del API previo. */
export function esDtoSinLote(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 400 && /property gasto_ids should not exist/i.test(r.error ?? "");
}

/**
 * ¿El API no sabe de lotes? Ruta inexistente, DTO previo o 503
 * `CONCILIACION_PARTES_NO_DISPONIBLE` (API nuevo sin la migración). En los
 * tres casos queda el camino de siempre: un solo gasto.
 */
export function esApiSinLote(r: ResultadoAccionLote | null | undefined): boolean {
  if (!r) return false;
  return CODIGOS_SIN_LOTE.has(r.code ?? "") || esRutaInexistente(r) || esDtoSinLote(r);
}

/**
 * El aviso del respaldo (un solo gasto) según la causa: sin la migración
 * (503 `CONCILIACION_PARTES_NO_DISPONIBLE`) falta la BD; en lo demás (ruta
 * inexistente, DTO previo) falta el API.
 */
export function mensajeApiSinLote(r: ResultadoAccionLote | null | undefined): string {
  return r?.code === "CONCILIACION_PARTES_NO_DISPONIBLE" ? MSG_LOTE_SIN_MIGRACION : MSG_LOTE_API_VIEJO;
}

/**
 * 404 de un movimiento que ya no existe («Movimiento <id> not found» del API,
 * o `MOVIMIENTO_NO_EXISTE`): lo borraron con el diálogo abierto. Un 404
 * «Cannot GET …» NO es esto: es el API previo (`esRutaInexistente`).
 */
export function esMovimientoInexistente(r: ResultadoAccionLote | null | undefined): boolean {
  if (!r || r.status !== 404 || esRutaInexistente(r)) return false;
  return r.code === "MOVIMIENTO_NO_EXISTE" || /not found/i.test(r.error ?? "");
}

/** «CARGO_NO_CUADRA: los 2 gastos…» ⇒ «Los 2 gastos…» (el código no se pinta). */
function sinPrefijoCodigo(mensaje: string | null | undefined): string {
  const t = (mensaje ?? "").trim().replace(/^[A-Z][A-Z_]{2,}:\s*/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Error de la búsqueda (o de cualquier llamada del diálogo) en palabras del operador. */
export function mensajeErrorBusquedaGastos(r: ResultadoAccionLote): string {
  if (esApiSinLote(r)) return mensajeApiSinLote(r);
  if (esMovimientoInexistente(r)) return MSG_MOVIMIENTO_NO_EXISTE;
  // El API previo no conoce el interruptor ni la justificación (6-oct-2026).
  if (r.code === "API_SIN_NO_BANCARIOS") return MSG_NO_BANCARIOS_API_VIEJO;
  if (r.code === "API_SIN_JUSTIFICACION") return MSG_JUSTIFICACION_API_VIEJO;
  if (r.status === 401) return "Tu sesión expiró. Recarga la página e inicia sesión.";
  if (r.status === 403) return "Tu usuario no puede conciliar movimientos del banco.";
  if (esErrorTecnico({ error: r.error, code: r.code })) return MSG_SERVIDOR_NO_RESPONDIO;
  return sinPrefijoCodigo(r.error) || MSG_SERVIDOR_NO_RESPONDIO;
}

/** `details` del 409 CARGO_NO_CUADRA. */
export interface DetalleCargoNoCuadra {
  monto_cargo?: number | string | null;
  suma_gastos?: number | string | null;
  diferencia?: number | string | null;
  tolerancia?: number | string | null;
  moneda?: string | null;
  gastos?: Array<{ id?: string; monto?: number | string | null; faltante?: number | string | null }> | null;
}

/**
 * 409 CARGO_NO_CUADRA: los gastos marcados no suman el cargo (fuera de la
 * tolerancia del lote). Con `details` dice cuánto y qué hacer; los gastos que
 * ya tenían otro cargo entran solo por lo que les falta, y eso se avisa.
 */
export function textoCargoNoCuadra(
  mensaje: string | null | undefined,
  details: unknown,
): { titulo: string; descripcion: string } {
  const d = (details ?? {}) as DetalleCargoNoCuadra;
  const moneda = d.moneda ?? null;
  const gastos = Array.isArray(d.gastos) ? d.gastos.filter(Boolean) : [];
  if (d.monto_cargo == null || d.suma_gastos == null) {
    return {
      titulo: sinPrefijoCodigo(mensaje) || "Los gastos marcados no suman el monto del cargo",
      descripcion: "Revisa la suma debajo de la lista: marca los que faltan o quita los que sobran.",
    };
  }
  const cargo = Math.abs(numeroDe(d.monto_cargo));
  const suma = numeroDe(d.suma_gastos);
  const dif = centavos(cargo - suma);
  const n = gastos.length;
  const titulo = n
    ? `${n === 1 ? "El gasto suma" : `Los ${n} gastos suman`} ${fmt(suma, moneda)} y el cargo es de ${fmt(cargo, moneda)}`
    : `Los gastos suman ${fmt(suma, moneda)} y el cargo es de ${fmt(cargo, moneda)}`;
  const tol = d.tolerancia != null ? ` (se acepta hasta ${fmt(d.tolerancia, moneda)} por los centavos del redondeo)` : "";
  const que =
    dif > 0
      ? "Faltan gastos: marca los que también pagó este cargo."
      : "Sobran gastos: quita los que no pagó este cargo.";
  const conOtroCargo = gastos.filter(
    (g) => g.faltante != null && g.monto != null && numeroDe(g.faltante) < numeroDe(g.monto) - 0.005,
  ).length;
  const nota = conOtroCargo
    ? ` ${conOtroCargo} ${plural(conOtroCargo, "gasto ya tenía", "gastos ya tenían")} otro cargo ligado: ${plural(conOtroCargo, "entra", "entran")} solo por lo que ${plural(conOtroCargo, "le", "les")} falta.`
    : "";
  return {
    titulo,
    descripcion: `Diferencia ${fmt(Math.abs(dif), moneda)}${tol}. ${que}${nota}`,
  };
}

/** `details` del 409 LOTE_MONEDA_DISTINTA. */
export interface DetalleLoteMonedaDistinta {
  gasto_id?: string | null;
  moneda_gasto?: string | null;
  moneda_cuenta?: string | null;
}

/** 409 LOTE_MONEDA_DISTINTA: un gasto de otra moneda no entra en un lote. */
export function textoLoteMonedaDistinta(
  mensaje: string | null | undefined,
  details: unknown,
): { titulo: string; descripcion: string } {
  const d = (details ?? {}) as DetalleLoteMonedaDistinta;
  const titulo =
    d.moneda_gasto && d.moneda_cuenta
      ? `Un gasto está en ${d.moneda_gasto} y la cuenta en ${d.moneda_cuenta}`
      : sinPrefijoCodigo(mensaje) || "Hay un gasto en otra moneda";
  return {
    titulo,
    descripcion:
      "Un cargo con varios gastos exige que todos estén en la moneda de la cuenta. Un gasto en otra moneda se vincula solo (1 a 1) y el sistema guarda el tipo de cambio del banco.",
  };
}

/** 409 MOVIMIENTO_CON_LOTE: el cargo ya paga varios gastos. */
export function textoMovimientoConLote(
  mensaje: string | null | undefined,
  details: unknown,
): { titulo: string; descripcion: string } {
  const n = Number((details as { gastos_n?: unknown } | null)?.gastos_n);
  const conN = Number.isFinite(n) && n >= 2;
  return {
    titulo: conN ? `Este cargo ya paga ${n} gastos` : sinPrefijoCodigo(mensaje) || "Este cargo ya paga varios gastos",
    descripcion: `Desvincúlalos primero desde el menú (⋯) → «${conN ? menuDesvincularGastos(n) : "Desvincular los gastos"}»; la lista se actualizó.`,
  };
}

/**
 * 409 GASTO_YA_CUBIERTO dentro de un lote: el texto de siempre
 * (`textoGastoYaCubierto`) y, si el API dijo CUÁL (`details.gasto_id`), su
 * etiqueta al frente para que la oficina lo desmarque.
 */
export function textoGastoYaCubiertoLote(
  mensaje: string | null | undefined,
  details: unknown,
  etiquetaDe?: (gastoId: string) => string | null | undefined,
): { titulo: string; descripcion: string } {
  const t = textoGastoYaCubierto(sinPrefijoCodigo(mensaje) || null, details);
  const id = (details as { gasto_id?: unknown } | null)?.gasto_id;
  const etiqueta = typeof id === "string" && etiquetaDe ? etiquetaDe(id) : null;
  return etiqueta ? { titulo: t.titulo, descripcion: `Gasto: ${etiqueta}. ${t.descripcion}` } : t;
}

/** «está en efectivo» / «se pagó con Personal Pablo» / «no se pagó por el banco». */
function comoSePagoGasto(medio: string | null | undefined): string {
  if (medio === "EFECTIVO") return "está en efectivo";
  if (!medio) return "no se pagó por el banco";
  return `se pagó con ${medioEnFrase(medio)}`;
}

/**
 * 400 `JUSTIFICACION_REQUERIDA` (6-oct-2026, API 0.0.63): se mandó a ligar un
 * gasto que NO pasó por el banco sin decir por qué (la ficha no lo marcaba o
 * su medio cambió con el diálogo abierto). Con `details.gastos_no_bancarios`
 * dice cuál y cómo se pagó; el diálogo, además, muestra el campo «¿Por qué…?».
 */
export function textoJustificacionRequerida(
  mensaje: string | null | undefined,
  details: unknown,
): { titulo: string; descripcion: string } {
  const lista = noBancariosDeDetalle(details);
  const titulo =
    lista.length >= 2 ? "Escribe por qué se vinculan estos gastos" : "Escribe por qué se vincula este gasto";
  if (lista.length === 1) {
    const g = lista[0];
    const fecha = textoFechasCortas([g.fecha_gasto]);
    return {
      titulo,
      descripcion: `El gasto${fecha ? ` del ${fecha}` : ""} ${comoSePagoGasto(g.medio_pago)}: para vincularlo a un cargo del banco escribe por qué (no cambia el medio de pago).`,
    };
  }
  if (lista.length >= 2) {
    const medios = [...new Set(lista.map((g) => g.medio_pago).filter((m): m is string => !!m))];
    const con = medios.length > 0 ? ` (${listaY(medios.map(medioEnFrase))})` : "";
    return {
      titulo,
      descripcion: `${lista.length} gastos no se pagaron por el banco${con}: para vincularlos a un cargo del banco escribe por qué (no cambia el medio de pago).`,
    };
  }
  const delApi = sinPrefijoCodigo(mensaje);
  return {
    titulo,
    descripcion:
      delApi && !esErrorTecnico({ error: delApi })
        ? delApi
        : "Uno de los gastos no se pagó por el banco: para vincularlo escribe por qué (no cambia el medio de pago).",
  };
}

/** Ids de `details.gastos_bodega[{id, fecha_gasto, monto}]` del 409, sin vacíos ni repetidos. */
function idsBodegaDeDetalle(details: unknown): string[] {
  const lista = (details as { gastos_bodega?: unknown } | null | undefined)?.gastos_bodega;
  if (!Array.isArray(lista)) return [];
  const ids = (lista as Array<{ id?: unknown } | null | undefined>).map((g) => (typeof g?.id === "string" ? g.id : ""));
  return [...new Set(ids.filter(Boolean))];
}

/**
 * 409 `GASTO_BODEGA` (API 0.0.63): una salida de inventario jamás se liga a
 * un cargo del banco. El API manda `details.gastos_bodega[{id, fecha_gasto,
 * monto}]` y un mensaje en es-MX que nombra la fecha («El gasto del 28 sep es
 * una salida de inventario (Bodega): …»). Con la etiqueta de CADA gasto (los
 * marcados) dice cuál quitar; si no, el mensaje del API; si tampoco, el
 * genérico (revisión 6-oct-2026: se leía un `details.gasto_id` que el API no
 * manda y el mensaje se tiraba).
 */
export function textoGastoBodega(
  mensaje: string | null | undefined,
  details: unknown,
  etiquetaDe?: (gastoId: string) => string | null | undefined,
): { titulo: string; descripcion: string } {
  const ids = idsBodegaDeDetalle(details);
  const varios = ids.length >= 2;
  const titulo = varios
    ? "Los gastos de bodega no se vinculan con el banco"
    : "Un gasto de bodega no se vincula con el banco";
  const quitar = varios ? "quítalos de la selección." : "quítalo de la selección.";
  const base = varios
    ? `Son salidas de inventario y nunca pasan por el banco: ${quitar}`
    : `Es una salida de inventario y nunca pasa por el banco: ${quitar}`;
  const etiquetas = etiquetaDe ? ids.map((id) => etiquetaDe(id)).filter((e): e is string => !!e) : [];
  if (ids.length > 0 && etiquetas.length === ids.length) {
    return { titulo, descripcion: `${varios ? "Gastos" : "Gasto"}: ${etiquetas.join("; ")}. ${base}` };
  }
  const delApi = sinPrefijoCodigo(mensaje);
  if (delApi && !esErrorTecnico({ error: delApi })) {
    return { titulo, descripcion: `${delApi} ${quitar.charAt(0).toUpperCase()}${quitar.slice(1)}` };
  }
  return { titulo, descripcion: base };
}

export interface MensajeErrorVincular {
  titulo: string;
  descripcion?: string;
  /** La fila de atrás está vieja: refrescar la bandeja. */
  recargar: boolean;
  /** El API no sabe de lotes: el diálogo pasa a la lista de siempre. */
  apiSinLote: boolean;
  /** SOLO con `JUSTIFICACION_REQUERIDA`: los gastos que el API dijo que no son
      bancarios (el diálogo los marca así y aparece el campo «¿Por qué…?»). */
  noBancarios?: GastoNoBancarioDetalle[];
}

/** Rechazo del API al vincular, en palabras del operador. */
export function mensajeErrorVincularGastos(
  r: ResultadoAccionLote,
  etiquetaDe?: (gastoId: string) => string | null | undefined,
): MensajeErrorVincular {
  if (esApiSinLote(r)) return { titulo: mensajeApiSinLote(r), recargar: false, apiSinLote: true };
  // El cargo ya no existe: cerrar y refrescar la bandeja.
  if (esMovimientoInexistente(r)) return { titulo: MSG_MOVIMIENTO_NO_EXISTE, recargar: true, apiSinLote: false };
  switch (r.code) {
    case "CARGO_NO_CUADRA":
      return { ...textoCargoNoCuadra(r.error, r.details), recargar: false, apiSinLote: false };
    case "LOTE_MONEDA_DISTINTA":
      return { ...textoLoteMonedaDistinta(r.error, r.details), recargar: false, apiSinLote: false };
    case "MOVIMIENTO_CON_LOTE":
      return { ...textoMovimientoConLote(r.error, r.details), recargar: true, apiSinLote: false };
    case "GASTO_YA_CUBIERTO":
      return { ...textoGastoYaCubiertoLote(r.error, r.details, etiquetaDe), recargar: false, apiSinLote: false };
    case "JUSTIFICACION_REQUERIDA":
      return {
        ...textoJustificacionRequerida(r.error, r.details),
        recargar: false,
        apiSinLote: false,
        noBancarios: noBancariosDeDetalle(r.details),
      };
    case "GASTO_BODEGA":
      return { ...textoGastoBodega(r.error, r.details, etiquetaDe), recargar: false, apiSinLote: false };
    case "MOVIMIENTO_YA_LIGADO":
    case "REVERSO_INVALIDO":
      return {
        titulo: "Este movimiento ya está conciliado con otra cosa",
        descripcion: sinPrefijoCodigo(r.error) || "Alguien lo concilió mientras tanto: la lista se actualizó.",
        recargar: true,
        apiSinLote: false,
      };
    default:
      return { titulo: mensajeErrorBusquedaGastos(r), recargar: false, apiSinLote: false };
  }
}

// ─────────────────────────── Toast tras vincular ───────────────────────────

/** Respuesta del PATCH: la fila + `gastos_estado` (API 0.0.52). */
export interface RespuestaVinculoGastos extends RespuestaVinculoGasto {
  monto?: string | number | null;
  gastos_estado?: GastoEstadoParte[] | null;
}

const parteCubierta = (p: GastoEstadoParte) =>
  p.gasto_conciliado != null ? p.gasto_conciliado === true : numeroDe(p.faltante) <= 0;

/**
 * Toast tras vincular. Con 2+ gastos: «3 gastos vinculados · $8,404.20» +
 * «Todos cubiertos» / «2 cubiertos · 1 parcial (faltan $X)». Con uno, el de
 * siempre (`toastVinculoGasto`: cubierto o pago parcial).
 */
export function toastVinculoGastos(r: RespuestaVinculoGastos | null | undefined): {
  titulo: string;
  descripcion?: string;
} {
  const partes = (r?.gastos_estado ?? []).filter(Boolean);
  if (partes.length < 2) return toastVinculoGasto(r ?? null);
  const moneda = partes.find((p) => p.moneda)?.moneda ?? null;
  const total = centavos(partes.reduce((acc, p) => acc + numeroDe(p.monto_parte), 0));
  const titulo = `${partes.length} gastos vinculados · ${fmt(total, moneda)}`;
  const parciales = partes.filter((p) => !parteCubierta(p));
  if (parciales.length === 0) return { titulo, descripcion: "Todos cubiertos" };
  const cubiertos = partes.length - parciales.length;
  const falta = centavos(parciales.reduce((acc, p) => acc + Math.max(0, numeroDe(p.faltante)), 0));
  const descripcion = `${cubiertos} ${plural(cubiertos, "cubierto", "cubiertos")} · ${parciales.length} ${plural(
    parciales.length,
    "parcial",
    "parciales",
  )} (faltan ${fmt(falta, moneda)})`;
  return { titulo, descripcion };
}

// ─────────────────────────── Menú: desvincular ───────────────────────────

/** «Desvincular los 3 gastos». */
export function menuDesvincularGastos(n: number): string {
  return `Desvincular los ${n} gastos`;
}

/** «¿Desvincular los 3 gastos?». */
export function tituloDesvincularGastos(n: number): string {
  return `¿Desvincular los ${n} gastos?`;
}

/** Confirmación (regla permanente: todo lo que deshace trabajo confirma). */
export function textoConfirmarDesvincularGastos(n: number): string {
  return `El cargo vuelve a quedar pendiente de conciliar y los ${n} gastos dejan de estar cubiertos por él (vuelven a «Gastos sin banco»; si alguno tiene otros cargos ligados, se queda como pago parcial).`;
}

/** Toast tras desvincular el lote. */
export function toastDesvinculoGastos(n: number): string {
  return `${n} gastos desvinculados: el cargo vuelve a Pendiente`;
}

// ──────────────────── Columna «Conciliación» de la tabla ────────────────────

export interface LineaGastoLote {
  key: string;
  href: string;
  /** «Operaciones · $2,801.40 · vuelo #315». */
  principal: string;
  /** proveedor ?? lugar ?? nota · fecha. */
  secundaria: string;
  /** «Factura FEACZM-72128» (5-oct-2026, `folio_comprobante` del API 0.0.57);
      null = sin folio o API previo (no se pinta nada). */
  factura: string | null;
  /** Tooltip de `factura` con el folio completo (UUID entero). */
  facturaTitulo: string | null;
  /** Insignia «Efectivo» (6-oct-2026) si ese gasto NO pasó por el banco; null
      con uno bancario o sin `medio_pago` (API previo). */
  medio: BadgeVinculoNoBancario | null;
}

export interface ResumenLoteFila {
  /** «3 gastos · $8,404.20». */
  titulo: string;
  lineas: LineaGastoLote[];
  /** «y 2 más» (null si caben). */
  mas: string | null;
  /** Tooltip de `mas` (5-oct-2026): el NÚMERO DE FACTURA de cada gasto que no
      cabe, uno por renglón («Operaciones · $2,801.40 · vuelo #326 · Factura
      S-104», folio completo). null si ninguno oculto trae folio (o API previo). */
  masTitulo: string | null;
  /** «diferencia $0.01» (null si es 0 o no se sabe). */
  diferencia: string | null;
}

/** Al vuelo del gasto (donde se ve su desglose) o, sin vuelo, a Gastos. */
export function hrefGastoConciliado(g: Pick<MovimientoGasto, "vuelo_id">): string {
  return g.vuelo_id ? `/admin/flights/${g.vuelo_id}` : "/admin/expenses";
}

/** Primera línea de las notas del gasto (la manda el API o se deriva). */
function notaDe(g: MovimientoGasto): string | null {
  return primeraLinea(g.notas_primera_linea ?? g.notas ?? null);
}

/**
 * Una línea del lote: lo que ESTE cargo pagó de ese gasto. `notasCargo` (las
 * del movimiento) alimenta el tooltip de la insignia de un gasto en efectivo.
 */
export function lineaGastoLote(g: MovimientoGasto, i = 0, notasCargo?: string | null): LineaGastoLote {
  const monto = numeroDe(g.monto);
  const parte = g.monto_parte != null ? numeroDe(g.monto_parte) : monto;
  const importe =
    Math.abs(parte - monto) >= 0.005 ? `${fmt(parte, g.moneda)} de ${fmt(monto, g.moneda)}` : fmt(parte, g.moneda);
  const principal = [
    categoriaGastoLabel(g.categoria),
    importe,
    g.vuelo?.folio != null ? `vuelo #${g.vuelo.folio}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const quien = g.proveedor?.nombre ?? g.lugar ?? notaDe(g);
  const secundaria =
    [quien, g.fecha_gasto ? fmtDateOnly(g.fecha_gasto) : null].filter(Boolean).join(" · ") || "Gasto conciliado";
  return {
    key: g.id || `g${i}`,
    href: hrefGastoConciliado(g),
    principal,
    secundaria,
    factura: etiquetaFolioComprobante(g.folio_comprobante),
    facturaTitulo: tituloFolioComprobante(g.folio_comprobante),
    medio: badgeVinculoNoBancario(g, notasCargo),
  };
}

/**
 * Lo que pinta la columna «Conciliación» de un cargo con VARIOS gastos. null
 * si el API no mandó `gastos[]` (skew de deploy): ahí va `textoLoteSinDetalle`.
 */
export function resumenLoteFila(m: MovimientoConGastos): ResumenLoteFila | null {
  const gastos = Array.isArray(m.gastos) ? m.gastos.filter(Boolean) : [];
  if (gastos.length === 0) return null;
  const n = Math.max(numeroGastosDe(m), gastos.length);
  const moneda = gastos.find((g) => g.moneda)?.moneda ?? null;
  const total =
    m.gastos_suma != null
      ? numeroDe(m.gastos_suma)
      : gastos.every((g) => g.monto_parte != null)
        ? centavos(gastos.reduce((acc, g) => acc + numeroDe(g.monto_parte), 0))
        : Math.abs(numeroDe(m.monto));
  const lineas = gastos.slice(0, MAX_LINEAS_LOTE).map((g, i) => lineaGastoLote(g, i, m.notas));
  const resto = n - lineas.length;
  const dif = m.gastos_diferencia != null ? numeroDe(m.gastos_diferencia) : 0;
  // Los gastos que no caben siguen teniendo SU factura: van al tooltip de
  // «y N más» (el contrato pide el folio por gasto, no solo de los primeros).
  const ocultos = gastos
    .slice(MAX_LINEAS_LOTE)
    .map((g, i) => lineaGastoLote(g, MAX_LINEAS_LOTE + i))
    .filter((l) => l.facturaTitulo != null)
    .map((l) => `${l.principal} · ${l.facturaTitulo}`);
  return {
    titulo: `${n} gastos · ${fmt(total, moneda)}`,
    lineas,
    mas: resto > 0 ? `y ${resto} más` : null,
    masTitulo: resto > 0 && ocultos.length > 0 ? ocultos.join("\n") : null,
    diferencia: Math.abs(dif) >= 0.005 ? `diferencia ${fmt(Math.abs(dif), moneda)}` : null,
  };
}

/** Lote sin detalle (API sin `gastos[]`): «3 gastos conciliados». */
export function textoLoteSinDetalle(n: number): string {
  return `${n} ${plural(n, "gasto conciliado", "gastos conciliados")}`;
}

export const TOOLTIP_LOTE_SIN_DETALLE = "detalle no disponible: recarga";

/**
 * Texto para la búsqueda rápida de la tabla: categorías, proveedores, lugar,
 * notas, folios de vuelo, NÚMERO DE FACTURA y montos de TODOS los gastos del
 * cargo («SAESA», «#315», «FEACZM-72128» o «2801.40» encuentran el cargo que
 * los paga).
 */
export function textoBusquedaGastos(m: MovimientoConGastos): string {
  return gastosLigadosDe(m)
    .map((g) =>
      [
        categoriaGastoLabel(g.categoria),
        g.proveedor?.nombre,
        g.lugar,
        notaDe(g),
        g.vuelo?.folio != null ? `#${g.vuelo.folio} vuelo #${g.vuelo.folio}` : null,
        tituloFolioComprobante(g.folio_comprobante),
        String(g.monto ?? ""),
        g.monto_parte != null ? String(g.monto_parte) : null,
        // «efectivo» encuentra los cargos ligados a un gasto en efectivo.
        esMedioNoBancario(g.medio_pago) ? etiquetaMedioNoBancario(g.medio_pago) : null,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

// ─────────────────────────── IA dentro del diálogo ───────────────────────────

export const BOTON_SUGERIR_IA = "Sugerir con IA";
export const BUSCANDO_SUGERENCIA_IA = "Consultando a la IA…";
export const ETIQUETA_SUGERENCIA_IA = "Sugerencia de la IA";
export const ETIQUETA_SUGERIDO = "Sugerido por la IA";
export const NOTA_IA_PROPONE = "Revísala antes de vincular: la IA propone, tú confirmas.";
export const TEXTO_IA_NO_DISPONIBLE =
  "El asistente de IA no está disponible en el servidor: elige el gasto en la lista.";

/** Contestó y NO propuso ninguno: su motivo vale tanto como una propuesta. */
export function textoIaSinPropuesta(motivo: string): string {
  return `La IA no propuso ninguno: ${motivo}`;
}

/** Fallo al pedir la sugerencia (404 API previo, 403 no ADMIN, red…). */
export function textoErrorSugerencia(r: ResultadoAccionLote): { titulo: string; descripcion?: string } {
  if (esMovimientoInexistente(r)) return { titulo: MSG_MOVIMIENTO_NO_EXISTE };
  if (r.status === 404) {
    return {
      titulo: "No se pudo pedir la sugerencia",
      descripcion: "El servidor todavía no tiene esta ayuda (falta desplegar el API).",
    };
  }
  if (r.status === 403) {
    return {
      titulo: "El asistente de conciliación es solo para ADMIN",
      descripcion: "Los gastos de la lista sí puedes marcarlos y vincularlos.",
    };
  }
  return { titulo: mensajeErrorBusquedaGastos(r) };
}
