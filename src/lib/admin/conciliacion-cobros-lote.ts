/**
 * 1 ABONO ↔ N COBROS DE VUELO (12-oct-2026, API 0.0.71, invariante 56 del
 * API). Pedido del cliente: «al momento de vincular un cobro o ingreso
 * puedas seleccionar 2 para un solo cobro… hicieron un pago para el vuelo
 * 379 y 380». FUENTE ÚNICA (PURA) del panel: la liga de un abono con sus
 * cobros (`cobros_n` / `cobros[]`, ADITIVOS del API), la selección del
 * diálogo «Vincular» (varios cobros; un sobre o un ingreso van solos), la
 * suma GUÍA contra el abono (la regla real vive en el API), los textos del
 * menú/confirmación/toast y la traducción de los errores del API.
 *
 * El panel NO decide si un lote cuadra: la suma en pantalla es guía visual.
 */
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fechasCandidatoCobro } from "@/lib/admin/ingresos-ui";
import { esTextoTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import { toleranciaLote } from "@/lib/admin/conciliacion-lote";
import { coincideBusqueda } from "@/lib/admin/busqueda";
import type { CandidatoCobro, MovimientoBancario, MovimientoCobroParte } from "@/types/conciliacion";
import type { CandidatoIngresoAbono } from "@/types/ingresos";

/** Tope de cobros por abono (el del DTO y la RPC del API). */
export const MAX_COBROS_LOTE = 50;
export const MSG_TOPE_COBROS_LOTE = `Un abono paga a lo más ${MAX_COBROS_LOTE} cobros.`;

const EPS = 0.000001;
const centavos = (n: number) => Math.round(n * 100) / 100;
const numeroDe = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ───────────────────────── La liga de un movimiento ─────────────────────────

/** Cuántos cobros paga el abono (0 sin la columna o sin partes). */
export function numeroCobrosDe(m: { cobros_n?: number | string | null }): number {
  const n = Math.trunc(numeroDe(m.cobros_n));
  return n > 0 ? n : 0;
}

/** ¿Ligado a un cobro, a un sobre o a varios cobros? */
export function tieneCobroLigado(m: {
  cobro_id?: string | null;
  cobro_grupo_id?: string | null;
  cobros_n?: number | string | null;
}): boolean {
  return m.cobro_id != null || m.cobro_grupo_id != null || numeroCobrosDe(m) > 0;
}

/** Abono que paga VARIOS cobros (su espejo `cobro_id`/`cobro` viene NULL). */
export function esAbonoConLote(m: { tipo: string; cobros_n?: number | string | null }): boolean {
  return m.tipo === "ABONO" && numeroCobrosDe(m) >= 2;
}

// ───────────────────────── Selección del diálogo ─────────────────────────

export type OpcionAbono =
  | { tipo: "COBRO"; c: CandidatoCobro }
  | { tipo: "INGRESO"; c: CandidatoIngresoAbono };

/** Clave única de una opción (la de siempre: «COBRO_VUELO:id», «INGRESO:id»). */
export function claveOpcion(o: OpcionAbono): string {
  return o.tipo === "COBRO" ? `${o.c.tipo}:${o.c.id}` : `INGRESO:${o.c.id}`;
}

/** Un sobre de grupo o un ingreso se vinculan SOLOS (el API no los mezcla). */
export function esOpcionExclusiva(o: OpcionAbono): boolean {
  return o.tipo === "INGRESO" || o.c.tipo === "SOBRE_GRUPO";
}

export function etiquetaCortaOpcion(o: OpcionAbono): string {
  if (o.tipo === "INGRESO") return o.c.etiqueta;
  return o.c.tipo === "SOBRE_GRUPO"
    ? `el pago del grupo ${folioTexto(o.c.grupo_folio)}`
    : `el cobro del vuelo #${o.c.folio ?? "—"}`;
}

/**
 * Marca/desmarca una opción con la regla del API: varios COBROS de vuelo
 * juntos; un sobre o un ingreso van solos. Devuelve la selección nueva y,
 * si se tuvo que quitar algo, el aviso que lo dice.
 */
export function alternarSeleccion(
  seleccion: readonly string[],
  o: OpcionAbono,
  opciones: readonly OpcionAbono[],
): { seleccion: string[]; aviso: string | null } {
  const clave = claveOpcion(o);
  const yaMarcada = seleccion.includes(clave);
  if (yaMarcada) return { seleccion: seleccion.filter((k) => k !== clave), aviso: null };
  const porClave = new Map(opciones.map((x) => [claveOpcion(x), x]));
  const marcadas = seleccion.map((k) => porClave.get(k)).filter((x): x is OpcionAbono => !!x);
  if (esOpcionExclusiva(o)) {
    return {
      seleccion: [clave],
      aviso:
        marcadas.length > 0
          ? `${etiquetaCortaOpcion(o).replace(/^el /, "El ").replace(/^ING/, "ING")} se vincula solo: se quitó lo demás que estaba marcado.`
          : null,
    };
  }
  const exclusivas = marcadas.filter(esOpcionExclusiva);
  if (exclusivas.length > 0) {
    return {
      seleccion: [clave],
      aviso: `Se quitó ${etiquetaCortaOpcion(exclusivas[0])}: un sobre de grupo o un ingreso no se combinan con cobros de vuelo.`,
    };
  }
  if (marcadas.length >= MAX_COBROS_LOTE) return { seleccion: [...seleccion], aviso: MSG_TOPE_COBROS_LOTE };
  return { seleccion: [...seleccion, clave], aviso: null };
}

/** Lo que YA paga el abono (del API) ⇒ claves marcadas al abrir. */
export function seleccionInicial(cobroIds: readonly string[] | null | undefined, opciones: readonly OpcionAbono[]): string[] {
  if (!cobroIds || cobroIds.length === 0) return [];
  const claves = new Set(opciones.map(claveOpcion));
  return cobroIds.map((id) => `COBRO_VUELO:${id}`).filter((k) => claves.has(k));
}

/** Texto con el que se busca una opción (folio, cliente, grupo, método, montos, ING-n). */
export function textoBusquedaOpcion(o: OpcionAbono): string {
  if (o.tipo === "INGRESO") {
    const i = o.c;
    return [i.etiqueta, i.categoria_etiqueta, i.cliente, i.descripcion, i.monto, i.neto, i.cuenta_alias]
      .filter((x) => x != null && x !== "")
      .join(" ");
  }
  const c = o.c;
  return [
    c.tipo === "SOBRE_GRUPO" ? `grupo ${folioTexto(c.grupo_folio)} ${c.grupo_nombre ?? ""}` : `vuelo #${c.folio ?? ""} ${c.folio ?? ""}`,
    c.cliente,
    c.metodo_cobro,
    c.referencia,
    c.monto,
    c.neto,
    c.moneda,
  ]
    .filter((x) => x != null && x !== "")
    .join(" ");
}

export function coincideOpcion(o: OpcionAbono, consulta: string): boolean {
  return coincideBusqueda(textoBusquedaOpcion(o), consulta);
}

// ───────────────────────── La suma contra el abono ─────────────────────────

export interface EstadoLoteAbono {
  n: number;
  suma: number;
  /** |abono| − Σ netos (positiva = faltan cobros). */
  diferencia: number;
  tolerancia: number;
  cuadra: boolean;
  faltan: boolean;
  sePasa: boolean;
  monedasMezcladas: boolean;
  moneda: string | null;
  abono: number;
}

/**
 * Estado de la suma de los COBROS marcados contra el abono. GUÍA visual:
 * nunca apaga el botón — el API valida con la misma tolerancia y responde
 * `ABONO_NO_CUADRA` si no. Con UN cobro no hay cuadre (regla de siempre).
 */
export function estadoLoteAbono(input: {
  montoAbono: string | number;
  monedaCuenta?: string | null;
  cobros: readonly Pick<CandidatoCobro, "neto" | "moneda">[];
}): EstadoLoteAbono {
  const n = input.cobros.length;
  const moneda = input.monedaCuenta ?? null;
  const abono = centavos(Math.abs(numeroDe(input.montoAbono)));
  const monedasMezcladas = input.cobros.some((c) => moneda != null && c.moneda != null && c.moneda !== moneda);
  const suma = centavos(input.cobros.reduce((acc, c) => acc + numeroDe(c.neto), 0));
  const diferencia = centavos(abono - suma);
  const tolerancia = n >= 2 ? toleranciaLote(n) : 0;
  const aplica = n >= 2 && !monedasMezcladas;
  return {
    n,
    suma,
    diferencia,
    tolerancia,
    cuadra: aplica && Math.abs(diferencia) <= tolerancia + EPS,
    faltan: aplica && diferencia > tolerancia + EPS,
    sePasa: aplica && diferencia < -(tolerancia + EPS),
    monedasMezcladas,
    moneda,
    abono,
  };
}

export type TonoSumaAbono = "verde" | "ambar" | "rojo" | "neutro";

/** La línea debajo de la lista: «2 cobros suman $3,500.00 · cuadra con el abono de $3,500.00». */
export function textoSumaLoteAbono(e: EstadoLoteAbono): { texto: string; tono: TonoSumaAbono } | null {
  if (e.n === 0) return null;
  const m = e.moneda ?? undefined;
  const abono = fmtMonto(e.abono, m);
  if (e.n === 1) {
    const dif = Math.abs(e.diferencia) >= 0.005 ? ` (diferencia ${fmtMonto(Math.abs(e.diferencia), m)} contra el abono)` : " · cuadra con el abono";
    return { texto: `1 cobro: ${fmtMonto(e.suma, m)}${dif}`, tono: Math.abs(e.diferencia) >= 0.005 ? "ambar" : "verde" };
  }
  if (e.monedasMezcladas) {
    return {
      texto: `Hay cobros en otra moneda: un abono con varios cobros exige que todos estén en ${e.moneda ?? "la moneda de la cuenta"}.`,
      tono: "rojo",
    };
  }
  const base = `${e.n} cobros suman ${fmtMonto(e.suma, m)}`;
  if (e.cuadra) {
    const dif = Math.abs(e.diferencia) >= 0.005 ? ` (diferencia ${fmtMonto(Math.abs(e.diferencia), m)})` : "";
    return { texto: `${base} · cuadra con el abono de ${abono}${dif}`, tono: "verde" };
  }
  if (e.faltan) return { texto: `${base} · faltan ${fmtMonto(e.diferencia, m)} para el abono de ${abono}`, tono: "ambar" };
  return { texto: `${base} · se pasan ${fmtMonto(-e.diferencia, m)} del abono de ${abono}`, tono: "rojo" };
}

/** Texto del botón según lo marcado. */
export function botonVincularAbono(seleccion: readonly OpcionAbono[]): string {
  if (seleccion.length === 0) return "Vincular";
  if (seleccion.length === 1) {
    const o = seleccion[0];
    if (o.tipo === "INGRESO") return "Vincular el ingreso";
    return o.c.tipo === "SOBRE_GRUPO" ? "Vincular el pago del grupo" : "Vincular el cobro";
  }
  return `Vincular ${seleccion.length} cobros`;
}

export const NOTA_VARIOS_COBROS =
  "Marca varios cobros cuando el cliente hizo UN depósito por varios vuelos: la suma de sus netos debe cuadrar con el abono.";

/** Toast tras vincular: «Abono conciliado con 2 cobros: vuelos #379 y #380». */
export function toastVinculoCobros(seleccion: readonly OpcionAbono[]): string {
  const cobros = seleccion.filter(
    (o): o is Extract<OpcionAbono, { tipo: "COBRO" }> => o.tipo === "COBRO" && o.c.tipo === "COBRO_VUELO",
  );
  if (cobros.length >= 2) {
    const folios = cobros.map((o) => `#${o.c.tipo === "COBRO_VUELO" ? (o.c.folio ?? "—") : "—"}`);
    const lista = folios.length === 2 ? folios.join(" y ") : `${folios.slice(0, -1).join(", ")} y ${folios[folios.length - 1]}`;
    return `Abono conciliado con ${cobros.length} cobros: vuelos ${lista}`;
  }
  const o = seleccion[0];
  if (!o) return "Abono conciliado";
  if (o.tipo === "INGRESO") return `Abono conciliado con ${o.c.etiqueta}`;
  return o.c.tipo === "SOBRE_GRUPO"
    ? `Abono conciliado con el pago del grupo ${folioTexto(o.c.grupo_folio)}`
    : `Abono conciliado con el cobro del vuelo #${o.c.folio ?? "—"}`;
}

// ───────────────────────── Errores del API ─────────────────────────

export const MSG_LOTE_COBROS_API_VIEJO =
  "Vincular un abono a varios cobros necesita la versión nueva del servidor: por ahora vincúlalo a un solo cobro, o avisa a sistemas.";
export const MSG_LOTE_COBROS_SIN_MIGRACION =
  "Vincular un abono a varios cobros todavía no está habilitado en la base de datos (falta aplicar una actualización): por ahora vincúlalo a un solo cobro, o avisa a sistemas.";

export interface ResultadoVincularCobros {
  ok?: boolean;
  error?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

/** Texto es-MX del rechazo (el del API gana cuando es claro) y qué hacer. */
export function mensajeErrorVincularCobros(r: ResultadoVincularCobros): {
  titulo: string;
  descripcion?: string;
  /** La lista cambió (ocupado, el abono ya no está así): se recarga. */
  recargar: boolean;
  apiSinLote: boolean;
} {
  const code = r.code ?? "";
  const texto = r.error ?? "";
  if (code === "API_SIN_LOTE_COBROS") return { titulo: MSG_LOTE_COBROS_API_VIEJO, recargar: false, apiSinLote: true };
  if (code === "CONCILIACION_COBROS_NO_DISPONIBLE")
    return { titulo: MSG_LOTE_COBROS_SIN_MIGRACION, recargar: false, apiSinLote: true };
  if (code === "ABONO_NO_CUADRA")
    return { titulo: texto || "Los cobros marcados no suman lo que depositó el banco.", recargar: false, apiSinLote: false };
  if (code === "LOTE_MONEDA_DISTINTA")
    return { titulo: texto || "Todos los cobros de un lote van en la moneda de la cuenta.", recargar: false, apiSinLote: false };
  if (code === "COBRO_YA_CONCILIADO")
    return {
      titulo: texto || "Ese cobro ya está conciliado con otro movimiento bancario.",
      descripcion: "Desvincúlalo en el otro movimiento si fue un error, o elige otro candidato.",
      recargar: true,
      apiSinLote: false,
    };
  if (code === "COBRO_DE_GRUPO")
    return {
      titulo: texto || "Ese cobro es parte del sobre de un grupo.",
      descripcion: "Elige el sobre del grupo en la lista (aparece como «Grupo …»).",
      recargar: true,
      apiSinLote: false,
    };
  if (code === "MOVIMIENTO_CON_LOTE" || code === "MOVIMIENTO_YA_LIGADO" || code === "LOTE_SOLO_API_NUEVO")
    return { titulo: texto || "Este abono ya está conciliado: recarga la página.", recargar: true, apiSinLote: false };
  if (r.status === 404) return { titulo: "Ese abono ya no existe: recarga la página.", recargar: true, apiSinLote: false };
  if (!texto || esTextoTecnico(texto)) return { titulo: MSG_SERVIDOR_NO_RESPONDIO, recargar: false, apiSinLote: false };
  return { titulo: texto, recargar: r.status === 409, apiSinLote: false };
}

// ───────────────────────── La fila de la bandeja ─────────────────────────

export interface LineaLoteCobros {
  key: string;
  href: string;
  principal: string;
  secundaria: string;
}

export interface ResumenLoteCobros {
  titulo: string;
  lineas: LineaLoteCobros[];
  mas: string | null;
  diferencia: string | null;
}

/** Líneas que pinta la columna «Conciliación» antes de «y N más». */
export const MAX_LINEAS_LOTE_COBROS = 3;

export const TOOLTIP_LOTE_COBROS_SIN_DETALLE =
  "El detalle de los cobros no está disponible en este momento: recarga la página.";
export const TITULO_VER_VUELO_COBRO = "Ver el vuelo cuyo cobro se concilió";

export function textoLoteCobrosSinDetalle(n: number): string {
  return `${n} cobros conciliados`;
}

/**
 * «2 cobros · $3,500.00» + una línea por cobro (vuelo, cliente; fechas y
 * monto). null si el API no mandó `cobros[]` (skew de deploy).
 */
export function resumenLoteCobrosFila(m: MovimientoBancario): ResumenLoteCobros | null {
  const partes: MovimientoCobroParte[] = Array.isArray(m.cobros) ? m.cobros : [];
  if (partes.length === 0) return null;
  const moneda = partes.find((p) => p.moneda)?.moneda ?? undefined;
  const suma = m.cobros_suma != null ? numeroDe(m.cobros_suma) : partes.reduce((a, p) => a + numeroDe(p.monto_parte), 0);
  const lineas = partes.slice(0, MAX_LINEAS_LOTE_COBROS).map((p) => ({
    key: p.cobro_id,
    href: p.vuelo_id ? `/admin/flights/${p.vuelo_id}` : "/admin/ingresos",
    principal: [`Vuelo #${p.folio ?? "—"}`, p.cliente].filter(Boolean).join(" · "),
    secundaria:
      [
        fechasCandidatoCobro({ fecha_vuelo: p.fecha_vuelo ?? null, fecha_cobro: p.fecha_cobro ?? null }),
        fmtMonto(numeroDe(p.monto_parte), p.moneda ?? moneda),
      ]
        .filter(Boolean)
        .join(" · ") || "Cobro conciliado",
  }));
  const dif = m.cobros_diferencia != null ? numeroDe(m.cobros_diferencia) : null;
  return {
    titulo: `${partes.length} cobros · ${fmtMonto(suma, moneda)}`,
    lineas,
    mas: partes.length > MAX_LINEAS_LOTE_COBROS ? `y ${partes.length - MAX_LINEAS_LOTE_COBROS} más` : null,
    diferencia: dif != null && Math.abs(dif) >= 0.005 ? `diferencia ${fmtMonto(Math.abs(dif), moneda)}` : null,
  };
}

/** Texto para la búsqueda rápida de la bandeja (folios y clientes del lote). */
export function textoBusquedaCobros(m: MovimientoBancario): string {
  const partes = Array.isArray(m.cobros) ? m.cobros : [];
  return partes
    .map((p) => [p.folio != null ? `#${p.folio}` : null, p.cliente, p.monto_parte].filter(Boolean).join(" "))
    .join(" ");
}

// ───────────────────────── Menú y confirmación ─────────────────────────

export function menuDesvincularCobros(n: number): string {
  return `Desvincular los ${n} cobros`;
}

export function tituloDesvincularCobros(n: number): string {
  return `¿Desvincular los ${n} cobros?`;
}

export function textoConfirmarDesvincularCobros(n: number): string {
  return `El abono vuelve a quedar pendiente de conciliar y los ${n} ${plural(n, "cobro", "cobros")} vuelven a «Cobros sin banco». No se borra ningún cobro.`;
}

/** Fecha corta del abono para los textos (día Cancún). */
export function fechaCortaAbono(fecha: string): string {
  return fmtDateOnly(fecha);
}
