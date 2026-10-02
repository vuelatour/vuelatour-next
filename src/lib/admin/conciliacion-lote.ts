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
 *     `MOVIMIENTO_CON_LOTE`, `GASTO_YA_CUBIERTO`…).
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
import { MSG_SERVIDOR_NO_RESPONDIO, esErrorTecnico } from "@/lib/admin/errores-tecnicos";
import { fmtDateOnly } from "@/lib/datetime";
import type {
  GastoCandidato,
  GastoEstadoParte,
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

/** Nota al pie: qué se ofrece y cómo se usa. */
export function NOTA_VENTANA_CARGO(dias: number): string {
  return `Gastos bancarios (tarjeta, transferencia, PayWise) sin conciliar, en la moneda de la cuenta y con fecha ±${dias} días del cargo; sin búsqueda, primero los que cuadran con su monto. Si el cargo pagó varias facturas, márcalas todas: deben sumar el cargo.`;
}

/** Hubo más candidatos que el tope: la búsqueda los encuentra. */
export function textoTruncado(n: number): string {
  return `Se muestran los primeros ${n}: escribe el monto, el proveedor o la nota para encontrar el que buscas.`;
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
      : { tipo: "vacio_sin_q", texto: `No hay gastos bancarios pendientes en ±${dias} días del cargo. ${salida}` };
  }
  return { tipo: "lista", texto: s.truncado ? textoTruncado(s.resultados) : "" };
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

export interface MensajeErrorVincular {
  titulo: string;
  descripcion?: string;
  /** La fila de atrás está vieja: refrescar la bandeja. */
  recargar: boolean;
  /** El API no sabe de lotes: el diálogo pasa a la lista de siempre. */
  apiSinLote: boolean;
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
}

export interface ResumenLoteFila {
  /** «3 gastos · $8,404.20». */
  titulo: string;
  lineas: LineaGastoLote[];
  /** «y 2 más» (null si caben). */
  mas: string | null;
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

/** Una línea del lote: lo que ESTE cargo pagó de ese gasto. */
export function lineaGastoLote(g: MovimientoGasto, i = 0): LineaGastoLote {
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
  return { key: g.id || `g${i}`, href: hrefGastoConciliado(g), principal, secundaria };
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
  const lineas = gastos.slice(0, MAX_LINEAS_LOTE).map((g, i) => lineaGastoLote(g, i));
  const resto = n - lineas.length;
  const dif = m.gastos_diferencia != null ? numeroDe(m.gastos_diferencia) : 0;
  return {
    titulo: `${n} gastos · ${fmt(total, moneda)}`,
    lineas,
    mas: resto > 0 ? `y ${resto} más` : null,
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
 * notas, folios y montos de TODOS los gastos del cargo («SAESA», «#315» o
 * «2801.40» encuentran el cargo que los paga).
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
        String(g.monto ?? ""),
        g.monto_parte != null ? String(g.monto_parte) : null,
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
