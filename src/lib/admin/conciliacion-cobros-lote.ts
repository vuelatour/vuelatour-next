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
 *
 * UN COBRO, VARIOS ABONOS (14-oct-2026, API 0.0.78, invariante 77): la guía
 * de UN cobro marcado sale del veredicto del API (`al_vincular`:
 * `guiaAlVincular`), la suma de un lote va por lo que le FALTA a cada cobro,
 * los toasts leen `cobros_estado[]` / `cobros_liberados[]` y la bandeja pinta
 * el estado del cobro de cada abono. Ningún número se recalcula aquí.
 */
import { fmtMonto, fmtTc, fmtUsd } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fechasCandidatoCobro } from "@/lib/admin/ingresos-ui";
import { esTextoTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import { toleranciaLote } from "@/lib/admin/conciliacion-lote";
import { coincideBusqueda } from "@/lib/admin/busqueda";
import { montoParaBusquedaTabla } from "@/lib/admin/gasto-banco";
import { hrefBuscarAbonoQueFalta, saleEnCobrosSinBanco, TEXTO_FALTANTE_FUERA_DE_SIN_BANCO } from "@/lib/admin/cobro-banco";
import type {
  CandidatoCobro,
  CandidatoCobroVuelo,
  CandidatosCobroResponse,
  CobroLiberado,
  MovimientoBancario,
  MovimientoCobroParte,
} from "@/types/conciliacion";
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
/** Número del API o null (ausente, vacío o no numérico): jamás un 0 inventado. */
const numeroONull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Montos a centavos ENTEROS (solo para comparar). */
const aCentavos = (n: number) => Math.round(n * 100);
/** `details` de un error del API como objeto (lo demás ⇒ vacío). */
const detallesDe = (d: unknown): Record<string, unknown> =>
  d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : {};

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
    // UN COBRO, VARIOS ABONOS (API 0.0.78): un cobro PARCIAL también se
    // encuentra por lo que le FALTA («Buscar $977.45» de la guía) y por «parcial».
    c.tipo === "COBRO_VUELO" && c.parcial === true ? `parcial ${c.faltante ?? ""}` : null,
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
  /** Σ de lo que le FALTA a cada cobro (sin otros abonos = su neto). */
  suma: number;
  /** |abono| − Σ (positiva = faltan cobros). */
  diferencia: number;
  tolerancia: number;
  cuadra: boolean;
  faltan: boolean;
  sePasa: boolean;
  monedasMezcladas: boolean;
  moneda: string | null;
  abono: number;
  /** Algún cobro ya tenía abonos (API 0.0.78): la suma es de lo que le FALTA a cada uno. */
  porFaltante: boolean;
}

/** Lo que la suma guía lee de cada cobro marcado (`faltante`/`parcial`: API 0.0.78). */
export interface CobroParaSumaLote {
  neto: number | string;
  moneda: string | null;
  faltante?: number | null;
  parcial?: boolean;
}

/**
 * Estado de la suma de los COBROS marcados contra el abono. GUÍA visual:
 * nunca apaga el botón — el API valida con la misma tolerancia y responde
 * `ABONO_NO_CUADRA` si no. Con UN cobro no hay cuadre (regla de siempre).
 * Con el API 0.0.78 cada cobro entra por lo que le FALTA fuera de este abono
 * (`faltante`, que manda el API; sin él, su neto: la regla de siempre).
 */
export function estadoLoteAbono(input: {
  montoAbono: string | number;
  monedaCuenta?: string | null;
  cobros: readonly CobroParaSumaLote[];
}): EstadoLoteAbono {
  const n = input.cobros.length;
  const moneda = input.monedaCuenta ?? null;
  const abono = centavos(Math.abs(numeroDe(input.montoAbono)));
  const monedasMezcladas = input.cobros.some((c) => moneda != null && c.moneda != null && c.moneda !== moneda);
  const suma = centavos(input.cobros.reduce((acc, c) => acc + numeroDe(c.faltante ?? c.neto), 0));
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
    porFaltante: input.cobros.some((c) => c.parcial === true),
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
  const base = `${e.n} cobros suman ${fmtMonto(e.suma, m)}${e.porFaltante ? " (lo que le falta a cada uno)" : ""}`;
  if (e.cuadra) {
    const dif = Math.abs(e.diferencia) >= 0.005 ? ` (diferencia ${fmtMonto(Math.abs(e.diferencia), m)})` : "";
    return { texto: `${base} · cuadra con el abono de ${abono}${dif}`, tono: "verde" };
  }
  if (e.faltan) return { texto: `${base} · faltan ${fmtMonto(e.diferencia, m)} para el abono de ${abono}`, tono: "ambar" };
  return { texto: `${base} · se pasan ${fmtMonto(-e.diferencia, m)} del abono de ${abono}`, tono: "rojo" };
}

/** Botón de UN cobro que quedaría PARCIAL (abre la confirmación). */
export const BOTON_VINCULAR_PARCIAL = "Vincular como parcial…";

/** Texto del botón según lo marcado. */
export function botonVincularAbono(seleccion: readonly OpcionAbono[]): string {
  if (seleccion.length === 0) return "Vincular";
  if (seleccion.length === 1) {
    const o = seleccion[0];
    if (o.tipo === "INGRESO") return "Vincular el ingreso";
    if (o.c.tipo === "COBRO_VUELO" && o.c.al_vincular?.estado === "PARCIAL") return BOTON_VINCULAR_PARCIAL;
    return o.c.tipo === "SOBRE_GRUPO" ? "Vincular el pago del grupo" : "Vincular el cobro";
  }
  return `Vincular ${seleccion.length} cobros`;
}

/** La nota bajo la lista (API 0.0.78 con la migración: un cobro acepta varios abonos). */
export const NOTA_VARIOS_COBROS =
  "Marca varios cobros cuando el cliente hizo UN depósito por varios vuelos (la suma debe cuadrar con el abono). Si el cliente pagó UN cobro en varias transferencias, vincula cada transferencia al mismo cobro: queda «Conciliado parcial» hasta completarlo.";
/** La de siempre: sin la capacidad `cobros_parciales` el segundo abono de un cobro no se acepta. */
export const NOTA_VARIOS_COBROS_SIN_PARCIALES =
  "Marca varios cobros cuando el cliente hizo UN depósito por varios vuelos: la suma de sus netos debe cuadrar con el abono.";

/** La nota según la capacidad del API (`movimiento.cobros_parciales`). */
export function notaVariosCobros(cobrosParciales: boolean | null | undefined): string {
  return cobrosParciales === true ? NOTA_VARIOS_COBROS : NOTA_VARIOS_COBROS_SIN_PARCIALES;
}

/**
 * Toast tras vincular: «Abono conciliado con 2 cobros: vuelos #379 y #380».
 * Con la respuesta del API 0.0.78 (`cobros_estado[]`, `comision_corregida`)
 * UN cobro dice cómo quedó: «… queda conciliado PARCIAL (faltan $1,700
 * MXN).», «… quedó conciliado completo con 2 abonos.» o «Comisión corregida a
 * $1,200 y abono vinculado: …». Sin ella, el texto de siempre.
 */
export function toastVinculoCobros(
  seleccion: readonly OpcionAbono[],
  respuesta?: Pick<MovimientoBancario, "cobros_estado" | "comision_corregida"> | null,
): string {
  const despues = textoCobroTrasVincular(seleccion, respuesta);
  if (despues) return despues;
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

/** 400 «property corregir_comision should not exist» de un API previo (lo traduce la action). */
export const MSG_API_SIN_CORREGIR_COMISION =
  "Corregir la comisión desde aquí necesita la versión nueva del servidor: corrígela en el vuelo y vuelve a vincular.";
/** La action ni siquiera respondió: no se sabe si la liga quedó (jamás «no se vinculó»). */
export const MSG_VINCULO_INCIERTO =
  "No se pudo confirmar si el abono quedó vinculado (no hubo respuesta del servidor). La lista se vuelve a cargar: revísala antes de intentarlo de nuevo.";
/**
 * «Corregir la comisión y vincular» sin un veredicto del API (revisión del
 * 15-oct-2026): un 5xx sin código de negocio, HTML o sin respuesta. El API
 * pudo escribir YA la comisión (y hasta la liga) antes de fallar: jamás «no
 * se hizo nada».
 */
export const MSG_COMISION_INCIERTA =
  "No se pudo confirmar si la comisión del cobro y la liga quedaron (el servidor no respondió bien). La lista se vuelve a cargar: revisa el cobro antes de intentarlo de nuevo.";
/** Desvincular sin respuesta del servidor: no se sabe si quedó desvinculado (jamás «no se desvinculó»). */
export const MSG_DESVINCULO_INCIERTO =
  "No se pudo confirmar si el movimiento quedó desvinculado (no hubo respuesta del servidor). La página se vuelve a cargar: revísalo antes de intentarlo de nuevo.";

export interface ErrorVincularCobros {
  titulo: string;
  descripcion?: string;
  /** La lista cambió (ocupado, el abono ya no está así): se recarga y se suelta lo marcado. */
  recargar: boolean;
  apiSinLote: boolean;
  /** Sin respuesta: no se sabe si quedó ligado (la página se pone al día al cerrar). */
  incierto?: boolean;
  /** La liga falló DESPUÉS de corregir la comisión (`details.comision_corregida`, con CUALQUIER código): la comisión YA cambió (API 0.0.78). */
  comisionCorregida?: boolean;
}

/**
 * Texto es-MX del rechazo (el del API gana cuando es claro) y qué hacer. Con
 * `corrigiendoComision` (la liga viajó con `corregir_comision`, revisión del
 * 15-oct-2026) un fallo SIN veredicto del API (`respuestaSinVeredicto`) es
 * INCIERTO: la comisión pudo quedar escrita aunque el API no lo anotara
 * (`conNotaComisionCorregida` solo anota los HttpException).
 */
export function mensajeErrorVincularCobros(
  r: ResultadoVincularCobros,
  opciones: { corrigiendoComision?: boolean } = {},
): ErrorVincularCobros {
  const e = errorVincularCobrosPorCodigo(r);
  if (detallesDe(r.details).comision_corregida != null) return { ...e, comisionCorregida: true };
  if (opciones.corrigiendoComision === true && respuestaSinVeredicto(r)) {
    return { titulo: MSG_COMISION_INCIERTA, recargar: true, apiSinLote: false, incierto: true };
  }
  return e;
}

/** Los códigos con que el API dice QUÉ pasó (sus rechazos de negocio, aunque vengan con un 503). */
const CODIGOS_CON_VEREDICTO: ReadonlySet<string> = new Set([
  "API_SIN_LOTE_COBROS",
  "CONCILIACION_COBROS_NO_DISPONIBLE",
  "ABONO_NO_CUADRA",
  "LOTE_MONEDA_DISTINTA",
  "COBRO_YA_CONCILIADO",
  "COBRO_DE_GRUPO",
  "MOVIMIENTO_CON_LOTE",
  "MOVIMIENTO_YA_LIGADO",
  "LOTE_SOLO_API_NUEVO",
  "ABONO_EXCEDE_COBRO",
  "COMISION_NO_CUADRA",
  "COBRO_MONEDA_DISTINTA",
  "SOBRE_NO_CUADRA",
  "CORREGIR_COMISION_NO_APLICA",
  "CONCILIACION_COBROS_PARCIALES_NO_DISPONIBLE",
  "API_SIN_CORREGIR_COMISION",
]);

/**
 * ¿El fallo NO trae el veredicto del API? Sin respuesta (`SIN_CONEXION`, un
 * texto de red), HTML (`PARSE_ERROR`), la espera cancelada o un 5xx sin
 * código de negocio (el `ERROR` del filtro del API: «fetch failed» hacia la
 * base, un deadlock…). Un 4xx o un código de negocio sí dicen qué pasó.
 */
export function respuestaSinVeredicto(r: ResultadoVincularCobros): boolean {
  const code = r.code ?? "";
  if (code === "SIN_CONEXION" || code === "PARSE_ERROR" || code === "TIEMPO_AGOTADO") return true;
  if (CODIGOS_CON_VEREDICTO.has(code)) return false;
  if (typeof r.status === "number") return r.status >= 500;
  return esTextoTecnico(r.error);
}

function errorVincularCobrosPorCodigo(r: ResultadoVincularCobros): ErrorVincularCobros {
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
  // ── UN COBRO, VARIOS ABONOS (14-oct-2026, API 0.0.78, invariante 77). El
  // título es el texto del API (ya trae los montos); `recargar` = soltar lo
  // marcado. El diálogo vuelve a pedir los candidatos tras CUALQUIER 409 (sin
  // soltar lo marcado si `recargar` es false).
  if (code === "ABONO_EXCEDE_COBRO")
    return {
      titulo: texto || "El abono es mayor que lo que le falta al cobro.",
      descripcion: descripcionAbonoExcede(r.details),
      recargar: false,
      apiSinLote: false,
    };
  if (code === "COMISION_NO_CUADRA") {
    const corregible = detallesDe(r.details).corregible;
    return {
      titulo: texto || "El depósito no cuadra con la comisión registrada del cobro.",
      ...(corregible === false ? {} : { descripcion: "Usa «Corregir la comisión y vincular» o corrígela en el vuelo." }),
      recargar: false,
      apiSinLote: false,
    };
  }
  if (code === "COBRO_MONEDA_DISTINTA")
    return {
      titulo: texto || "El abono está en otra moneda y su tipo de cambio no cuadra con el cobro.",
      recargar: false,
      apiSinLote: false,
    };
  if (code === "SOBRE_NO_CUADRA")
    return { titulo: texto || "El abono no cuadra con el sobre del grupo.", recargar: false, apiSinLote: false };
  if (code === "CORREGIR_COMISION_NO_APLICA")
    return {
      titulo:
        texto ||
        "La comisión solo se corrige al vincular UN cobro de vuelo que todavía no tiene abonos, cuando el depósito es menor o igual que el cobro.",
      recargar: true,
      apiSinLote: false,
    };
  if (code === "CONCILIACION_COBROS_PARCIALES_NO_DISPONIBLE")
    return {
      titulo:
        texto ||
        "Vincular un segundo abono al mismo cobro todavía no está habilitado en la base de datos (falta aplicar una actualización): avisa a sistemas.",
      recargar: false,
      apiSinLote: false,
    };
  if (code === "API_SIN_CORREGIR_COMISION") return { titulo: MSG_API_SIN_CORREGIR_COMISION, recargar: false, apiSinLote: false };
  if (code === "SIN_CONEXION") return { titulo: MSG_VINCULO_INCIERTO, recargar: true, apiSinLote: false, incierto: true };
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
  /**
   * El estado del COBRO con todos sus abonos (API 0.0.78; null sin el dato):
   * «· parcial: faltan $X» (aviso) o «· completa el cobro (2 abonos)» (neutro)
   * pegado a la secundaria (la hoja), y `linea` («Parcial: faltan $X» /
   * «Completa el cobro (2 abonos)») para pintarlo en SU renglón (la bandeja,
   * cuya secundaria se corta a 240 px: revisión del 15-oct-2026).
   */
  sufijo: { texto: string; linea: string; tono: "aviso" | "neutro" } | null;
  /** La línea del cobro que se viene a ver (`?cobro=`, 15-oct-2026): resaltada con « · el que abriste». */
  destacada?: boolean;
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
 * UNA línea del lote de un abono (15-oct-2026: se EXTRAJO de
 * `resumenLoteCobrosFila` para que la bandeja y la hoja «Conciliación con el
 * banco» de una entrada digan lo MISMO): principal «Vuelo #315 · Beh Kay» (el
 * cliente con `trim()`), secundaria «cobro 15 sep 2026 · $68,205.55 MXN» y el
 * sufijo del 0.0.78 («· parcial: faltan $X» / «· completa el cobro (2
 * abonos)»). `href` al vuelo (la bandeja; la hoja usa el ancla `#cobros`).
 */
export function lineaCobroLote(p: MovimientoCobroParte, moneda?: string | null): LineaLoteCobros {
  const cliente = typeof p.cliente === "string" ? p.cliente.trim() : "";
  return {
    key: p.cobro_id,
    href: p.vuelo_id ? `/admin/flights/${p.vuelo_id}` : "/admin/ingresos",
    principal: [`Vuelo #${p.folio ?? "—"}`, cliente].filter(Boolean).join(" · "),
    secundaria:
      [
        fechasCandidatoCobro({ fecha_vuelo: p.fecha_vuelo ?? null, fecha_cobro: p.fecha_cobro ?? null }),
        fmtMonto(numeroDe(p.monto_parte), p.moneda ?? moneda ?? undefined),
      ]
        .filter(Boolean)
        .join(" · ") || "Cobro conciliado",
    sufijo: sufijoEstadoCobroLote(p, moneda),
  };
}

/** Mismo objeto de opciones que `resumenLoteFila` (gastos). */
export interface OpcionesResumenLoteCobros {
  /** Id del cobro que se viene a ver (`?cobro=`): su línea se marca `destacada` y, si quedaba en «y N más», se trae a la vista. */
  destacar?: string | null;
}

/**
 * «2 cobros · $3,500.00» + una línea por cobro (vuelo, cliente; fechas y
 * monto). null si el API no mandó `cobros[]` (skew de deploy). Con
 * `destacar` (15-oct-2026, `?cobro=` desde la hoja de una entrada) la línea
 * de ese cobro va `destacada`; si quedaba más allá de las 3 primeras, se ven
 * las 2 primeras más ESA. Sin opciones, idéntica a la de siempre.
 */
export function resumenLoteCobrosFila(
  m: MovimientoBancario,
  opciones: OpcionesResumenLoteCobros = {},
): ResumenLoteCobros | null {
  const partes: MovimientoCobroParte[] = Array.isArray(m.cobros) ? m.cobros : [];
  if (partes.length === 0) return null;
  const moneda = partes.find((p) => p.moneda)?.moneda ?? undefined;
  const suma = m.cobros_suma != null ? numeroDe(m.cobros_suma) : partes.reduce((a, p) => a + numeroDe(p.monto_parte), 0);
  const destacar = (opciones.destacar ?? "").toLowerCase();
  const iDestacado = destacar ? partes.findIndex((p) => (p.cobro_id ?? "").toLowerCase() === destacar) : -1;
  const visibles =
    iDestacado >= MAX_LINEAS_LOTE_COBROS
      ? [...Array.from({ length: MAX_LINEAS_LOTE_COBROS - 1 }, (_, i) => i), iDestacado]
      : Array.from({ length: Math.min(MAX_LINEAS_LOTE_COBROS, partes.length) }, (_, i) => i);
  const lineas = visibles.map((i) => {
    const l = lineaCobroLote(partes[i], moneda);
    return i === iDestacado ? { ...l, destacada: true } : l;
  });
  const dif = m.cobros_diferencia != null ? numeroDe(m.cobros_diferencia) : null;
  return {
    titulo: `${partes.length} cobros · ${fmtMonto(suma, moneda)}`,
    lineas,
    mas: partes.length > lineas.length ? `y ${partes.length - lineas.length} más` : null,
    diferencia: dif != null && Math.abs(dif) >= 0.005 ? `diferencia ${fmtMonto(Math.abs(dif), moneda)}` : null,
  };
}

/**
 * «· parcial: faltan $1,700 MXN» / «· completa el cobro (2 abonos)» de una
 * línea del lote (textos.bandeja del 0.0.78): el estado del COBRO con TODOS
 * sus abonos, tal como lo manda el API. null sin el dato o sin nada que decir.
 */
export function sufijoEstadoCobroLote(
  p: Pick<MovimientoCobroParte, "cobro_estado" | "cobro_faltante" | "cobro_abonos_n" | "moneda">,
  monedaLote?: string | null,
): LineaLoteCobros["sufijo"] {
  if (p.cobro_estado === "PARCIAL") {
    const f = numeroONull(p.cobro_faltante);
    const faltan = f != null && f > 0 ? `faltan ${fmtMonto(f, p.moneda ?? monedaLote ?? undefined)}` : null;
    return {
      texto: faltan ? ` · parcial: ${faltan}` : " · parcial",
      linea: faltan ? `Parcial: ${faltan}` : "Parcial",
      tono: "aviso",
    };
  }
  const n = Math.trunc(numeroDe(p.cobro_abonos_n));
  if (p.cobro_estado === "CONCILIADO" && n >= 2) {
    return { texto: ` · completa el cobro (${n} abonos)`, linea: `Completa el cobro (${n} abonos)`, tono: "neutro" };
  }
  return null;
}

/**
 * Texto para la búsqueda rápida de la bandeja: folios y clientes del lote y,
 * con el API 0.0.78, «parcial» cuando el cobro de la línea (o el de un abono
 * de UN cobro) quedó conciliado parcial, y el folio de ese cobro.
 */
export function textoBusquedaCobros(m: MovimientoBancario): string {
  const partes = Array.isArray(m.cobros) ? m.cobros : [];
  const conc = m.cobro_conciliacion ?? null;
  return [
    ...partes.map((p) =>
      [p.folio != null ? `#${p.folio}` : null, p.cliente, p.monto_parte, p.cobro_estado === "PARCIAL" ? "parcial" : null]
        .filter(Boolean)
        .join(" "),
    ),
    conc ? [conc.folio != null ? `#${conc.folio}` : null, conc.estado === "PARCIAL" ? "parcial" : null].filter(Boolean).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ───────────────────────── Menú y confirmación ─────────────────────────

export function menuDesvincularCobros(n: number): string {
  return `Desvincular los ${n} cobros`;
}

export function tituloDesvincularCobros(n: number): string {
  return `¿Desvincular los ${n} cobros?`;
}

/**
 * Confirmación de desvincular un LOTE. «vuelven a «Cobros sin banco»» SOLO si
 * todos los cobros del lote salen ahí por su método (revisión del 15-oct-2026:
 * un BillPocket no sale; sin el detalle de los cobros tampoco se promete).
 */
export function textoConfirmarDesvincularCobros(
  n: number,
  partes?: ReadonlyArray<Pick<MovimientoCobroParte, "metodo_cobro">> | null,
): string {
  const lista = Array.isArray(partes) ? partes : [];
  const enSinBanco = lista.length > 0 && lista.every((p) => saleEnCobrosSinBanco(p.metodo_cobro));
  return enSinBanco
    ? `El abono vuelve a quedar pendiente de conciliar y los ${n} ${plural(n, "cobro", "cobros")} vuelven a «Cobros sin banco». No se borra ningún cobro.`
    : `El abono vuelve a quedar pendiente de conciliar y los ${n} ${plural(n, "cobro", "cobros")} quedan libres para vincularse con otro movimiento. No se borra ningún cobro.`;
}

/** UN COBRO, VARIOS ABONOS (API 0.0.78, D22): se suelta ESTE abono; los otros del cobro siguen. */
export const MENU_DESVINCULAR_ESTE_ABONO = "Desvincular este abono del cobro";
export const TITULO_DESVINCULAR_ESTE_ABONO = "¿Desvincular este abono del cobro?";
export const TEXTO_DESVINCULAR_LOTE_CON_PARCIALES = "Los cobros que tienen otros abonos quedan como «Conciliado parcial».";

/**
 * ¿El cobro de este abono (UN cobro) tiene OTROS abonos? Entonces el menú dice
 * «Desvincular este abono del cobro» y la confirmación avisa cómo queda el
 * cobro (`textoConfirmarDesvincularAbono` de `lib/admin/cobro-banco.ts`).
 * Sin `cobro_conciliacion` (API previo o lectura caída) ⇒ false: lo de siempre.
 */
export function abonoConOtrosAbonosDelCobro(m: Pick<MovimientoBancario, "cobro_conciliacion" | "cobros_n">): boolean {
  if (numeroCobrosDe(m) >= 2) return false;
  return Math.trunc(numeroDe(m.cobro_conciliacion?.abonos_n)) >= 2;
}

/** Lote: algún cobro tiene OTROS abonos (quedará parcial al soltarlo) ⇒ la frase extra de la confirmación. */
export function textoExtraDesvincularLote(m: Pick<MovimientoBancario, "cobros">): string | null {
  const partes = Array.isArray(m.cobros) ? m.cobros : [];
  return partes.some((p) => Math.trunc(numeroDe(p.cobro_abonos_n)) >= 2) ? TEXTO_DESVINCULAR_LOTE_CON_PARCIALES : null;
}

/** Moneda de cada cobro que paga el abono (para los toasts: `cobros_liberados` no la trae). */
function monedasDeCobros(m: Pick<MovimientoBancario, "cobro_id" | "cobro" | "cobros">): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of Array.isArray(m.cobros) ? m.cobros : []) if (p.moneda) out.set(p.cobro_id, p.moneda);
  if (m.cobro_id && m.cobro?.moneda) out.set(m.cobro_id, m.cobro.moneda);
  return out;
}

/** «el vuelo #315 queda con pago parcial (faltan $1,700 MXN)» de un cobro liberado PARCIAL. */
function frasePagoParcial(c: CobroLiberado, moneda: string | null | undefined): string {
  const f = numeroONull(c.faltante);
  return `el vuelo #${c.folio ?? "—"} queda con pago parcial${f != null && f > 0 ? ` (faltan ${fmtMonto(f, moneda ?? undefined)})` : ""}`;
}

/**
 * Toast tras DESVINCULAR un abono de cobros (textos.toasts del 0.0.78) con
 * `cobros_liberados[]` (el estado de cada cobro DESPUÉS): «Cobro
 * desvinculado: el vuelo #315 queda con pago parcial (faltan $1,700 MXN).»,
 * «… vuelve a «Cobros sin banco».» o «Abono desvinculado: el cobro del vuelo
 * #315 sigue conciliado con sus otros abonos.». null sin la llave (API previo
 * o lectura caída): quien llama usa el texto de siempre.
 */
export function toastDesvinculoCobros(
  liberados: readonly CobroLiberado[] | null | undefined,
  m: Pick<MovimientoBancario, "cobro_id" | "cobro" | "cobros">,
): string | null {
  if (!Array.isArray(liberados) || liberados.length === 0) return null;
  const monedas = monedasDeCobros(m);
  if (liberados.length === 1) {
    const c = liberados[0];
    const folio = c.folio ?? "—";
    if (c.estado === "PARCIAL") return `Cobro desvinculado: ${frasePagoParcial(c, monedas.get(c.cobro_id))}.`;
    if (c.estado === "SIN_CONCILIAR") return `Cobro desvinculado: el cobro del vuelo #${folio} vuelve a «Cobros sin banco».`;
    if (c.estado === "CONCILIADO") return `Abono desvinculado: el cobro del vuelo #${folio} sigue conciliado con sus otros abonos.`;
    return null;
  }
  const parciales = liberados.filter((c) => c.estado === "PARCIAL");
  const base = `Los ${liberados.length} cobros desvinculados`;
  if (parciales.length === 0) {
    // Solo vuelven a «Cobros sin banco» los que se quedaron sin abonos.
    const todosSinConciliar = liberados.every((c) => c.estado === "SIN_CONCILIAR");
    return todosSinConciliar ? `${base}: vuelven a «Cobros sin banco».` : `${base}.`;
  }
  if (parciales.length === 1) return `${base}; ${frasePagoParcial(parciales[0], monedas.get(parciales[0].cobro_id))}.`;
  return `${base}; ${parciales.length} quedan con pago parcial (siguen ligados a sus otros abonos).`;
}

// ───────────────────────── UN COBRO, VARIOS ABONOS: el diálogo (API 0.0.78) ─────────────────────────
//
// Pedido del cliente: «… la alerta al vincular un abono de otro monto…». Con UN
// cobro marcado manda el veredicto del API para ESTE abono (`al_vincular`,
// espejo del trigger A): PARCIAL pide confirmación; EXCEDE, COMISION_NO_CUADRA,
// YA_CUBIERTO, UN_SOLO_ABONO, MONEDA_DISTINTA y SOBRE_NO_CUADRA APAGAN el botón
// con la razón y salidas de un clic. Es una EXCEPCIÓN deliberada a «la guía
// nunca apaga el botón» (D18): ese veredicto es del API; con 2+ cobros la guía
// del lote sigue sin apagar nunca (manda el 409 ABONO_NO_CUADRA). Los números
// (faltante, sobrante, comisión real, T.C.) son los del API; aquí solo se
// redactan y se eligen tonos.

/**
 * Qué hace el clic en «Vincular…» (D3/D18): nada marcado ⇒ pedir que se
 * marque; el API rechazaría ESTE abono ⇒ nada (el botón ya está apagado y la
 * razón a la vista); PARCIAL ⇒ abrir la confirmación (NO se llama al API
 * hasta «Sí, vincular como parcial»); lo demás ⇒ ligar.
 */
export type PasoAlVincular = "ELEGIR" | "BLOQUEADO" | "CONFIRMAR_PARCIAL" | "LIGAR";

export function pasoAlPulsarVincular(
  marcadas: number,
  guia: Pick<GuiaAlVincular, "bloquea" | "parcial"> | null,
): PasoAlVincular {
  if (marcadas === 0) return "ELEGIR";
  if (guia?.bloquea) return "BLOQUEADO";
  if (guia?.parcial) return "CONFIRMAR_PARCIAL";
  return "LIGAR";
}

/** Clave de una opción de cobro de vuelo (la de `claveOpcion`). */
export function claveDeCobroVuelo(cobroId: string): string {
  return `COBRO_VUELO:${cobroId}`;
}

export const RAZON_BLOQUEO_EXCEDE = "El abono rebasa este cobro: marca también el otro vuelo";
export const RAZON_BLOQUEO_COMISION =
  "El depósito no cuadra con la comisión registrada: corrígela antes de vincular";
/**
 * PARCIAL con `movimiento.cobros_parciales === false` (API 0.0.78 SIN la
 * migración 20261014000003, o tras su reversa): el API acepta el PRIMER abono
 * menor, pero el segundo ya no (el cobro sale de los candidatos y la liga da
 * 503). Prometer «vincula el resto a este mismo cobro» dejaba un callejón sin
 * salida (revisión 2 del 15-oct-2026): el botón se apaga con esta razón.
 */
export const RAZON_BLOQUEO_PARCIAL_SIN_CAPACIDAD =
  "Por ahora un cobro no acepta varios abonos: avisa a sistemas antes de vincular un pago parcial";

export type TipoAccionGuia = "MARCAR_SUGERIDO" | "BUSCAR" | "CORREGIR_COMISION";

/** Salida de un clic bajo la guía. */
export interface AccionGuiaAlVincular {
  tipo: TipoAccionGuia;
  etiqueta: string;
  /** MARCAR_SUGERIDO: el cobro que se marca (está en la lista). */
  cobro_id?: string;
  /** BUSCAR: lo que se escribe en el buscador («977.45»). */
  buscar?: string;
  /** CORREGIR_COMISION: la comisión real que escribiría el API. */
  comision?: number;
}

export interface GuiaAlVincular {
  texto: string;
  tono: TonoSumaAbono;
  /** El API rechazaría ESTE abono con ESTE cobro: el botón principal se apaga (con `razon`). */
  bloquea: boolean;
  /** Por qué está apagado (el `title` del botón). */
  razon: string | null;
  /** PARCIAL: el botón dice «Vincular como parcial…» y pide confirmación. */
  parcial: boolean;
  acciones: AccionGuiaAlVincular[];
}

export interface AbonoGuia {
  monto: number | string;
  /** Moneda de la cuenta del abono. */
  moneda?: string | null;
}

/** Lo que el diálogo sabe hacer: capacidades del API y qué cobros están en su lista. */
export interface CapacidadesGuia {
  /** `movimiento.corregir_comision === true` (un API previo rechazaría la bandera). */
  corregirComision?: boolean;
  /** Ids de los cobros de vuelo que están en la lista (los sugeridos fuera de ella no se ofrecen). */
  enLista?: ReadonlySet<string> | null;
  /** false = sin salidas de un clic (el diálogo legado de un solo cobro). */
  conAcciones?: boolean;
  /**
   * `movimiento.cobros_parciales` del API (0.0.78). SOLO `false` cambia algo:
   * un PARCIAL nuevo se apaga (el resto no se podría vincular). `true` o
   * ausente (API previo, que no manda `al_vincular`) ⇒ como siempre.
   */
  cobrosParciales?: boolean | null;
}

/** «(9.23 %)» de la comisión real sobre el monto del cobro (solo el texto). */
function pctComision(comision: number, monto: number): string {
  return monto > 0 ? ` (${((comision / monto) * 100).toFixed(2)} %)` : "";
}

/** ¿El API aceptaría `corregir_comision` con este abono? (su `comisionRealParaCorregir`: depósito ≤ cobro). */
function corregibleConAbono(c: CandidatoCobroVuelo, abonoAbs: number, monedaAbono: string | null): boolean {
  if (Math.trunc(numeroDe(c.abonos_n)) > 0) return false;
  if (monedaAbono != null && c.moneda != null && monedaAbono !== c.moneda) return false;
  return aCentavos(abonoAbs) <= aCentavos(numeroDe(c.monto)) + 1;
}

/** «(link de pago o pasarela)» y qué hacer, según POR QUÉ el cobro es «de un solo abono». */
function textoUnSoloAbono(folio: string, motivo: string | null | undefined): string {
  const base = `El cobro del vuelo #${folio} se concilia con un solo depósito (link de pago o pasarela) y ya tiene uno.`;
  if (motivo === "PASARELA") {
    return `${base} En la pasarela cada pago es una transacción: registra este pago como otro cobro del vuelo y vincúlalo a él.`;
  }
  if (motivo === "MONEDA_DISTINTA") {
    return `${base} Este abono es de una cuenta en otra moneda: solo concilia UN cobro completo, sin otros abonos.`;
  }
  return `${base} Si el cliente pagó en dos cargos, registra un cobro por cada cargo.`;
}

/** «+19.0 %» / «−3.2 %» (desvío del T.C., 1 decimal como el API). */
function desvioTexto(d: number): string {
  if (d > 0) return `+${d.toFixed(1)} %`;
  if (d < 0) return `−${Math.abs(d).toFixed(1)} %`;
  return "0.0 %";
}

/**
 * La guía de UN cobro marcado, desde el veredicto del API (`al_vincular`).
 * null = sin veredicto (API ≤ 0.0.77, un ingreso, o un sobre que cuadra): el
 * diálogo pinta la suma de siempre (`textoSumaLoteAbono`).
 */
export function guiaAlVincular(
  op: OpcionAbono,
  abono: AbonoGuia,
  capacidades: CapacidadesGuia = {},
): GuiaAlVincular | null {
  if (op.tipo !== "COBRO") return null;
  const abonoAbs = Math.abs(numeroDe(abono.monto));
  const monedaAbono = abono.moneda ?? null;
  const conAcciones = capacidades.conAcciones !== false;
  if (op.c.tipo === "SOBRE_GRUPO") {
    const s = op.c;
    const al = s.al_vincular;
    if (!al || al.estado !== "SOBRE_NO_CUADRA") return null;
    const dif = numeroDe(al.diferencia);
    const texto =
      `El abono (${fmtMonto(abonoAbs, monedaAbono ?? s.moneda)}) no cuadra con el sobre del grupo ${folioTexto(s.grupo_folio)} ` +
      `(${fmtMonto(s.neto, s.moneda)}${numeroDe(s.comision_banco_monto) > 0 ? " después de la comisión" : ""}): ` +
      `${dif < 0 ? "faltan" : "sobran"} ${fmtMonto(Math.abs(dif), s.moneda)}. Revisa que sea el depósito del grupo o corrige el sobre antes de vincular.`;
    return { texto, tono: "rojo", bloquea: true, razon: texto, parcial: false, acciones: [] };
  }
  const c = op.c;
  const al = c.al_vincular;
  if (!al) return null;
  const folio = c.folio != null ? String(c.folio) : "—";
  const m = c.moneda;
  const abonoTxt = fmtMonto(abonoAbs, monedaAbono ?? m);
  const otros = Math.trunc(numeroDe(c.abonos_n));
  const bloqueo = (texto: string, razon: string = texto, acciones: AccionGuiaAlVincular[] = []): GuiaAlVincular => ({
    texto,
    tono: "rojo",
    bloquea: true,
    razon,
    parcial: false,
    acciones: conAcciones ? acciones : [],
  });
  switch (al.estado) {
    case "CONCILIADO": {
      if (otros > 0) {
        const n = otros + 1;
        return {
          texto: `Con este abono el cobro del vuelo #${folio} queda completo (${fmtMonto(c.neto, m)} con ${n} abonos).`,
          tono: "verde",
          bloquea: false,
          razon: null,
          parcial: false,
          acciones: [],
        };
      }
      const dif = numeroDe(c.dif_monto);
      const cuadre =
        dif >= 0.005
          ? `${fmtMonto(c.neto, m)} (diferencia ${fmtMonto(dif, m)} contra el abono, dentro de la tolerancia)`
          : "cuadra con el abono";
      return {
        texto: `1 cobro: ${cuadre} · el cobro del vuelo #${folio} queda conciliado.`,
        tono: "verde",
        bloquea: false,
        razon: null,
        parcial: false,
        acciones: [],
      };
    }
    case "PARCIAL":
      if (capacidades.cobrosParciales === false) {
        return bloqueo(
          `Este abono (${abonoTxt}) es menor que lo que falta del cobro del vuelo #${folio} (${fmtMonto(al.faltante_antes, m)}), ` +
            "pero por ahora el sistema no acepta un segundo abono en el mismo cobro (falta aplicar una actualización): " +
            `si lo vinculas, los ${fmtMonto(al.faltante_despues, m)} que faltan ya no se podrán vincular. ` +
            "No lo vincules como parcial ni registres el resto como otro ingreso: avisa a sistemas.",
          RAZON_BLOQUEO_PARCIAL_SIN_CAPACIDAD,
        );
      }
      return {
        texto:
          `Este abono (${abonoTxt}) es menor que lo que falta del cobro del vuelo #${folio} (${fmtMonto(al.faltante_antes, m)}): ` +
          `el cobro quedará conciliado parcial y faltarán ${fmtMonto(al.faltante_despues, m)}. Cuando llegue el resto, vincúlalo a este mismo cobro.`,
        tono: "ambar",
        bloquea: false,
        razon: null,
        parcial: true,
        acciones: [],
      };
    case "EXCEDE": {
      const sobra = numeroDe(al.sobrante);
      const texto = al.un_solo
        ? `Este abono (${abonoTxt}) es mayor que el cobro del vuelo #${folio} (${fmtMonto(c.monto, m)}), que se concilia con un solo depósito: ` +
          `sobran ${fmtMonto(sobra, m)} sobre lo esperado. Si el depósito pagó también otro vuelo, márcalo también (la suma debe cuadrar con el abono); si el cobro está mal capturado, corrígelo antes de vincular.`
        : `Este abono (${abonoTxt}) es mayor que lo que falta del cobro del vuelo #${folio} (${fmtMonto(al.faltante_antes, m)}): ` +
          `sobran ${fmtMonto(sobra, m)}. Si el depósito pagó también otro vuelo, márcalo también (la suma debe cuadrar con el abono). ` +
          `Si el cobro está mal capturado, corrígelo antes de vincular. Si el otro cobro todavía no está registrado, regístralo en su vuelo por ${fmtMonto(sobra, m)} y vuelve a «Vincular».`;
      const enLista = capacidades.enLista ?? null;
      const sugeridos = (al.sugeridos ?? []).filter((x) => x.cobro_id !== c.cobro_id && (!enLista || enLista.has(x.cobro_id)));
      const acciones: AccionGuiaAlVincular[] = sugeridos.map((x) => ({
        tipo: "MARCAR_SUGERIDO",
        etiqueta: `Agregar el cobro del vuelo #${x.folio ?? "—"}${sugeridos.length > 1 ? ` (${fmtMonto(x.faltante, x.moneda ?? m)})` : ""}`,
        cobro_id: x.cobro_id,
      }));
      if (sobra > 0) {
        acciones.push({ tipo: "BUSCAR", etiqueta: `Buscar ${fmtMonto(sobra)}`, buscar: montoParaBusquedaTabla(sobra) });
      }
      return bloqueo(texto, RAZON_BLOQUEO_EXCEDE, acciones);
    }
    case "COMISION_NO_CUADRA": {
      const monto = numeroDe(c.monto);
      const capturada = numeroDe(c.comision_banco_monto);
      const tras = capturada > 0 ? ` después de la comisión registrada (${fmtMonto(capturada)})` : " (sin comisión registrada)";
      if (aCentavos(abonoAbs) > aCentavos(monto) + 1) {
        // El banco depositó MÁS que el cobro: no hay comisión que corregir hacia arriba.
        return bloqueo(
          `El cobro del vuelo #${folio} (${fmtMonto(monto, m)}) espera un depósito de ${fmtMonto(c.neto, m)}${tras} y el banco depositó ${abonoTxt}, ` +
            "más que el cobro: revisa la comisión registrada (el cliente pudo pagarla aparte) y corrígela en el vuelo antes de vincular.",
          RAZON_BLOQUEO_COMISION,
        );
      }
      // La comisión real es la del API (jamás se resta aquí); sin ella, no se ofrece corregir.
      const real = numeroONull(al.comision_real);
      const corregible = capacidades.corregirComision === true && real != null && corregibleConAbono(c, abonoAbs, monedaAbono);
      const texto =
        `El cobro del vuelo #${folio} espera ${fmtMonto(c.neto, m)}${tras} y el depósito es de ${abonoTxt}` +
        (real != null ? `: la comisión real fue ${fmtMonto(real)}${pctComision(real, monto)}.` : ": la comisión registrada no cuadra con el depósito.") +
        (corregible ? "" : " Corrige la comisión del cobro en el vuelo y vuelve a «Vincular».");
      return bloqueo(
        texto,
        RAZON_BLOQUEO_COMISION,
        corregible && real != null
          ? [{ tipo: "CORREGIR_COMISION", etiqueta: `Corregir la comisión a ${fmtMonto(real)} y vincular`, comision: real }]
          : [],
      );
    }
    case "YA_CUBIERTO": {
      const n = Math.max(1, otros);
      return bloqueo(
        `El cobro del vuelo #${folio} ya está conciliado completo (${fmtMonto(c.neto, m)} con ${n} ${plural(n, "abono", "abonos")}): ` +
          "si este abono es otro pago, regístralo como un cobro nuevo.",
      );
    }
    case "UN_SOLO_ABONO":
      return bloqueo(textoUnSoloAbono(folio, al.motivo));
    case "MONEDA_DISTINTA": {
      const tc = numeroONull(al.tc_implicito);
      const ref = numeroONull(al.tc_referencia);
      const desvio = numeroONull(al.desvio_pct);
      if (al.motivo === "TC_LEJOS" && tc != null && ref != null && desvio != null) {
        return bloqueo(
          `El abono contra el cobro del vuelo #${folio} da un tipo de cambio de ${fmtTc(tc)}, lejos del T.C. de referencia (${fmtTc(ref)}, ${desvioTexto(desvio)}): ` +
            "un abono en otra moneda solo concilia UN cobro completo; si así llegó el dinero, registra el cobro en la moneda del depósito.",
        );
      }
      return bloqueo(
        `El cobro del vuelo #${folio} está en ${m} y el abono en ${monedaAbono ?? "otra moneda"}: el tipo de cambio que resulta` +
          `${tc != null ? ` (${fmtTc(tc)})` : ""} no tiene sentido (se espera entre 15 y 25). Revisa que sea el abono correcto.`,
      );
    }
    default:
      return null;
  }
}

/**
 * El diálogo LEGADO «Vincular cobro» (solo sin los catálogos de Ingresos)
 * elige UN cobro y no corrige comisiones: con EXCEDE o COMISION_NO_CUADRA dice
 * dónde están esas salidas. null en lo demás.
 */
export const PISTA_DIALOGO_LEGADO =
  "Para marcar varios cobros o corregir la comisión desde aquí, usa «Conciliar en Ingresos».";

export function pistaDialogoLegado(op: OpcionAbono): string | null {
  if (op.tipo !== "COBRO" || op.c.tipo !== "COBRO_VUELO") return null;
  const e = op.c.al_vincular?.estado;
  return e === "EXCEDE" || e === "COMISION_NO_CUADRA" ? PISTA_DIALOGO_LEGADO : null;
}

/**
 * La línea corta de cada candidato en la lista (textos.dialogo_vincular):
 * PARCIAL ámbar «si lo vinculas, queda parcial: faltarían $1,700 MXN»,
 * EXCEDE rojo «el abono rebasa este cobro por $977.45 MXN» y una frase corta
 * para los demás rechazos. null = nada que avisar (o API previo).
 */
export function lineaCortaAlVincular(
  op: OpcionAbono,
  opts: {
    /**
     * El candidato está MARCADO junto con otros (2+): la línea habla de ligar
     * el abono a ESE cobro solo y contradecía la suma del lote en verde
     * («cuadra con el abono» vs «el abono rebasa este cobro…»): ahí manda la
     * suma (revisión 2 del 15-oct-2026).
     */
    enLote?: boolean;
    /** `movimiento.cobros_parciales`: con `false` un PARCIAL ya no promete completarse. */
    cobrosParciales?: boolean | null;
  } = {},
): { texto: string; tono: TonoSumaAbono } | null {
  if (op.tipo !== "COBRO") return null;
  if (opts.enLote) return null;
  if (op.c.tipo === "SOBRE_GRUPO") {
    const al = op.c.al_vincular;
    if (!al || al.estado !== "SOBRE_NO_CUADRA") return null;
    const dif = numeroDe(al.diferencia);
    return {
      texto: `el abono no cuadra con el sobre: ${dif < 0 ? "faltan" : "sobran"} ${fmtMonto(Math.abs(dif), op.c.moneda)}`,
      tono: "rojo",
    };
  }
  const c = op.c;
  const al = c.al_vincular;
  if (!al) return null;
  switch (al.estado) {
    case "PARCIAL":
      if (opts.cobrosParciales === false) {
        return { texto: "pago parcial: por ahora el resto no se podría vincular", tono: "rojo" };
      }
      return { texto: `si lo vinculas, queda parcial: faltarían ${fmtMonto(al.faltante_despues, c.moneda)}`, tono: "ambar" };
    case "EXCEDE":
      return { texto: `el abono rebasa este cobro por ${fmtMonto(al.sobrante, c.moneda)}`, tono: "rojo" };
    case "COMISION_NO_CUADRA":
      return { texto: "el depósito no cuadra con la comisión registrada", tono: "rojo" };
    case "YA_CUBIERTO":
      return { texto: "ya está conciliado completo", tono: "rojo" };
    case "UN_SOLO_ABONO":
      return { texto: "se concilia con un solo depósito y ya tiene uno", tono: "rojo" };
    case "MONEDA_DISTINTA":
      return { texto: "el tipo de cambio no cuadra con el cobro", tono: "rojo" };
    default:
      return null;
  }
}

/**
 * «ya conciliado $1,700 de $3,400 (1 abono) · falta $1,700» de un candidato
 * PARCIAL (lo que ya tiene de OTROS abonos, según el API). null si no es parcial.
 */
export function textoYaConciliadoCandidato(
  c: Pick<CandidatoCobroVuelo, "parcial" | "monto_vinculado" | "neto" | "abonos_n" | "faltante">,
): string | null {
  if (c.parcial !== true) return null;
  const n = Math.max(1, Math.trunc(numeroDe(c.abonos_n)));
  return [
    `ya conciliado ${fmtUsd(numeroDe(c.monto_vinculado))} de ${fmtUsd(c.neto)} (${n} ${plural(n, "abono", "abonos")})`,
    numeroONull(c.faltante) != null ? `falta ${fmtUsd(c.faltante)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** «cuadra exacto con el abono» o, en un PARCIAL, «cuadra exacto con lo que falta». */
export function textoCuadraExactoCandidato(c: { parcial?: boolean }): string {
  return c.parcial === true ? "cuadra exacto con lo que falta" : "cuadra exacto con el abono";
}

export interface TextoConfirmacion {
  titulo: string;
  cuerpo: string;
  /** Aviso extra (ámbar) dentro de la confirmación; null sin él. */
  aviso: string | null;
  boton: string;
}

/**
 * «¿Vincular como pago parcial?» (textos.confirmar_parcial): lo que pasará con
 * el cobro, con los números del API (`faltante_antes`/`faltante_despues`).
 */
export function textoConfirmarParcial(
  op: OpcionAbono,
  abono: AbonoGuia & { fecha?: string | null },
): TextoConfirmacion | null {
  if (op.tipo !== "COBRO" || op.c.tipo !== "COBRO_VUELO") return null;
  const c = op.c;
  const al = c.al_vincular;
  if (!al || al.estado !== "PARCIAL") return null;
  const m = c.moneda;
  const fecha = abono.fecha ? ` del ${fmtDateOnly(abono.fecha.slice(0, 10))}` : "";
  const abonoTxt = fmtMonto(Math.abs(numeroDe(abono.monto)), abono.moneda ?? m);
  const cobro =
    Math.trunc(numeroDe(c.abonos_n)) > 0
      ? `de lo que le falta al cobro del vuelo #${c.folio ?? "—"} (${fmtMonto(al.faltante_antes, m)} de ${fmtMonto(c.neto, m)})`
      : `del cobro del vuelo #${c.folio ?? "—"} (${fmtMonto(c.neto, m)})`;
  // «Cobros sin banco» solo lista los métodos de `METODOS_COBROS_SIN_BANCO`:
  // un BillPocket no sale ahí (revisión del 15-oct-2026), no se promete.
  const hastaElResto = saleEnCobrosSinBanco(c.metodo_cobro)
    ? "y seguirá en «Cobros sin banco» hasta que vincules el resto"
    : `hasta que vincules el resto (${TEXTO_FALTANTE_FUERA_DE_SIN_BANCO})`;
  return {
    titulo: "¿Vincular como pago parcial?",
    cuerpo:
      `El abono de ${abonoTxt}${fecha} cubre solo una parte ${cobro}. ` +
      `El cobro quedará «Conciliado parcial · faltan ${fmtMonto(al.faltante_despues, m)}» ${hastaElResto}. ` +
      "Úsalo cuando el cliente pagó el cobro en varias transferencias. Si en realidad son dos cobros distintos, mejor regístralos por separado.",
    aviso: null,
    boton: "Sí, vincular como parcial",
  };
}

/** Arriba de esto la comisión real se ve sospechosa (textos.confirmar_comision.aviso_mayor_15). */
export const UMBRAL_COMISION_SOSPECHOSA = 0.15;
export const AVISO_COMISION_MAYOR_15 =
  "Ojo: la comisión real es mayor que 15 % del cobro. Revisa que sea el depósito correcto antes de seguir.";

/**
 * «¿Corregir la comisión y vincular?» (textos.confirmar_comision): la comisión
 * registrada, lo que depositó el banco, la comisión real (del API) y el aviso
 * si rebasa 15 % del cobro. Es dinero: SIEMPRE se confirma.
 */
export function textoConfirmarCorregirComision(op: OpcionAbono, abono: AbonoGuia): TextoConfirmacion | null {
  if (op.tipo !== "COBRO" || op.c.tipo !== "COBRO_VUELO") return null;
  const c = op.c;
  const al = c.al_vincular;
  if (!al || al.estado !== "COMISION_NO_CUADRA" || al.comision_real == null) return null;
  const m = c.moneda;
  const monto = numeroDe(c.monto);
  const real = numeroDe(al.comision_real);
  const capturada = numeroDe(c.comision_banco_monto);
  const abonoTxt = fmtMonto(Math.abs(numeroDe(abono.monto)), abono.moneda ?? m);
  const registrada =
    capturada > 0
      ? `tiene registrada una comisión de ${fmtMonto(capturada, m)}`
      : "no tiene comisión registrada";
  const queda =
    real > 0.01
      ? `la comisión real fue ${fmtMonto(real, m)}${pctComision(real, monto)}. Se guardará ${fmtMonto(real)} como comisión del cobro y después se vinculará el depósito.`
      : "el banco no descontó comisión. Se quitará la comisión registrada del cobro y después se vinculará el depósito.";
  return {
    titulo: "¿Corregir la comisión y vincular?",
    cuerpo: `El cobro del vuelo #${c.folio ?? "—"} ${registrada} y el banco depositó ${abonoTxt} de ${fmtMonto(monto, m)}: ${queda}`,
    aviso: monto > 0 && real / monto > UMBRAL_COMISION_SOSPECHOSA ? AVISO_COMISION_MAYOR_15 : null,
    boton: "Sí, corregir y vincular",
  };
}

/** La parte del cobro marcado en `cobros_estado[]` de la respuesta (null si no viene). */
function parteDeRespuesta(
  cobroId: string,
  respuesta: Pick<MovimientoBancario, "cobros_estado"> | null | undefined,
): MovimientoCobroParte | null {
  const estados = Array.isArray(respuesta?.cobros_estado) ? respuesta.cobros_estado : [];
  return estados.find((p) => p.cobro_id === cobroId) ?? null;
}

/** UN cobro de vuelo marcado (lo demás ⇒ null). */
function cobroUnicoDe(seleccion: readonly OpcionAbono[]): CandidatoCobroVuelo | null {
  if (seleccion.length !== 1) return null;
  const o = seleccion[0];
  return o.tipo === "COBRO" && o.c.tipo === "COBRO_VUELO" ? o.c : null;
}

/**
 * Cómo quedó UN cobro tras vincular (respuesta del API 0.0.78; textos.toasts):
 * comisión corregida, PARCIAL o completo con 2+ abonos. null = el texto de
 * siempre (lote, sobre, ingreso, API previo o sin nada nuevo que decir).
 */
function textoCobroTrasVincular(
  seleccion: readonly OpcionAbono[],
  respuesta: Pick<MovimientoBancario, "cobros_estado" | "comision_corregida"> | null | undefined,
): string | null {
  const c = cobroUnicoDe(seleccion);
  if (!c || !respuesta) return null;
  const parte = parteDeRespuesta(c.cobro_id, respuesta);
  const moneda = parte?.moneda ?? c.moneda;
  const folio = parte?.folio ?? c.folio ?? "—";
  const f = numeroONull(parte?.cobro_faltante);
  const faltan = f != null && f > 0 ? ` (faltan ${fmtMonto(f, moneda)})` : "";
  const cc = respuesta.comision_corregida ?? null;
  if (cc && cc.cobro_id === c.cobro_id && cc.antes !== cc.despues) {
    const queda =
      parte?.cobro_estado === "PARCIAL"
        ? `queda conciliado PARCIAL${faltan}`
        : parte?.cobro_estado === "CONCILIADO"
          ? "quedó conciliado"
          : "quedó vinculado";
    const accion = cc.despues != null && cc.despues > 0 ? `Comisión corregida a ${fmtMonto(cc.despues)}` : "Comisión quitada";
    return `${accion} y abono vinculado: el cobro del vuelo #${folio} ${queda}.`;
  }
  if (!parte) return null;
  if (parte.cobro_estado === "PARCIAL") return `Abono vinculado: el cobro del vuelo #${folio} queda conciliado PARCIAL${faltan}.`;
  const n = Math.trunc(numeroDe(parte.cobro_abonos_n));
  if (parte.cobro_estado === "CONCILIADO" && n >= 2) {
    return `Abono vinculado: el cobro del vuelo #${folio} quedó conciliado completo con ${n} abonos.`;
  }
  return null;
}

/**
 * La acción del toast tras vincular un PARCIAL: «Buscar el abono que falta»
 * (Conciliación, pendientes de −7/+30 días del cobro con lo que falta en el
 * buscador; se abre en otra pestaña porque la tabla lee la búsqueda al
 * montar). null si el cobro no quedó parcial o sin el dato.
 */
export function accionToastVinculo(
  seleccion: readonly OpcionAbono[],
  respuesta: Pick<MovimientoBancario, "cobros_estado"> | null | undefined,
): { etiqueta: string; href: string } | null {
  const c = cobroUnicoDe(seleccion);
  if (!c) return null;
  const parte = parteDeRespuesta(c.cobro_id, respuesta);
  if (parte?.cobro_estado !== "PARCIAL") return null;
  const href = hrefBuscarAbonoQueFalta({ fecha_cobro: parte.fecha_cobro ?? c.fecha_cobro, faltante: parte.cobro_faltante ?? null });
  return href ? { etiqueta: "Buscar el abono que falta", href } : null;
}

/** «Marca el otro vuelo en la lista (busca $977.45).» de un 409 ABONO_EXCEDE_COBRO. */
function descripcionAbonoExcede(details: unknown): string {
  const d = detallesDe(details);
  const exc = numeroONull(d.excedente);
  const busca = exc != null && exc > 0 ? ` (busca ${fmtMonto(exc)})` : "";
  const sugeridos = Array.isArray(d.sugeridos) ? d.sugeridos : [];
  const primero = detallesDe(sugeridos[0]);
  const folio = numeroONull(primero.folio);
  return folio != null
    ? `Marca también el cobro del vuelo #${folio} en la lista${busca}.`
    : `Marca el otro vuelo en la lista${busca}.`;
}

// ───────────────────────── La bandeja: abono de UN cobro (API 0.0.78) ─────────────────────────

/**
 * La tercera línea de un abono con UN cobro (textos.bandeja del 0.0.78):
 * PARCIAL ⇒ «Pago parcial: este abono $1,700 de $3,400 · faltan $1,700 MXN»
 * (ámbar); completo con 2+ abonos ⇒ «Completa el cobro junto con 1 abono más»
 * (gris). null sin `cobro_conciliacion` (API previo) o sin nada que decir.
 */
export function lineaCobroUnicoBandeja(
  m: Pick<MovimientoBancario, "id" | "monto" | "cobro" | "cobro_conciliacion">,
): { texto: string; tono: "aviso" | "neutro" } | null {
  const conc = m.cobro_conciliacion ?? null;
  if (!conc) return null;
  const moneda = m.cobro?.moneda ?? undefined;
  if (conc.estado === "PARCIAL") {
    const parte = (conc.abonos ?? []).find((a) => a.movimiento_id === m.id)?.monto_parte;
    const este = numeroONull(parte) ?? Math.abs(numeroDe(m.monto));
    const f = numeroONull(conc.faltante);
    return {
      texto: `Pago parcial: este abono ${fmtUsd(este)} de ${fmtUsd(conc.neto)}${f != null && f > 0 ? ` · faltan ${fmtMonto(f, moneda)}` : ""}`,
      tono: "aviso",
    };
  }
  const n = Math.trunc(numeroDe(conc.abonos_n));
  if (conc.estado === "CONCILIADO" && n >= 2) {
    const otros = n - 1;
    return { texto: `Completa el cobro junto con ${otros} ${plural(otros, "abono más", "abonos más")}`, tono: "neutro" };
  }
  return null;
}

// ───────────────────────── Paywise ─────────────────────────

/** «N depósito(s) de Paywise pagan varios cobros (lote)…» (resumen.movimientos_en_lote del 0.0.78). */
export function textoPaywiseEnLote(n: number | null | undefined): string | null {
  const k = Math.trunc(numeroDe(n));
  if (k <= 0) return null;
  return k === 1
    ? "1 depósito de Paywise paga varios cobros (lote): queda fuera del cruce automático; revísalo en la bandeja."
    : `${k} depósitos de Paywise pagan varios cobros (lote): quedan fuera del cruce automático; revísalos en la bandeja.`;
}

/** Fecha corta del abono para los textos (día Cancún). */
export function fechaCortaAbono(fecha: string): string {
  return fmtDateOnly(fecha);
}

// ───────────────────────── Propuestas LIGAR de la IA (revisión del 15-oct-2026) ─────────────────────────
//
// Aceptar una propuesta LIGAR de la IA a un COBRO de vuelo ligaba directo con
// `{cobro_id}`: con un abono MENOR que lo que falta, el API la acepta SIN
// bandera (D3) y el cobro quedaba «Conciliado parcial» sin la confirmación
// «¿Vincular como pago parcial?». Ahora la action lee ANTES el veredicto del
// API para ESE abono (`al_vincular` de `candidatos-cobro`) y decide aquí:
// conciliado ⇒ liga; parcial ⇒ confirmación; un rechazo ⇒ a mano.

/** Ventana de los candidatos que se leen antes de aceptar (la de la IA de abonos y la del diálogo «Vincular»). */
export const VENTANA_PROPUESTA_DIAS = 30;

/** El `code` con que la action pide confirmar el parcial (en `details.candidato` va el cobro con su `al_vincular`). */
export const CODE_CONFIRMAR_PARCIAL = "CONFIRMAR_PARCIAL";
/** El `code` de una propuesta que el API rechazaría: se revisa a mano. */
export const CODE_PROPUESTA_A_MANO = "PROPUESTA_A_MANO";
/** El `code` cuando no se pudo leer el veredicto (no se ligó nada). */
export const CODE_PROPUESTA_SIN_VEREDICTO = "PROPUESTA_SIN_VEREDICTO";

export const MSG_PROPUESTA_PARCIAL =
  "Es un pago parcial: acéptalo con su botón «Aceptar» para confirmarlo (no se vinculó).";
export const MSG_PROPUESTA_SIN_VEREDICTO =
  "No se pudo revisar el cobro antes de vincular (el servidor no respondió). No se vinculó nada: vuelve a intentarlo.";
export const MSG_PROPUESTA_COBRO_NO_ESTA =
  "Ese cobro ya no está entre los candidatos de este abono (pudo conciliarse con otro o cambió su monto). No se vinculó: revísalo a mano con «Vincular a un cobro o ingreso».";
export const SUFIJO_PROPUESTA_A_MANO = " No se vinculó: revísalo a mano con «Vincular a un cobro o ingreso».";

export type PasoPropuestaCobro =
  | { tipo: "LIGAR" }
  | { tipo: "CONFIRMAR_PARCIAL"; candidato: CandidatoCobroVuelo }
  | { tipo: "A_MANO"; texto: string };

/**
 * Qué hacer con una propuesta LIGAR de la IA al cobro `cobroId`, con la
 * respuesta de `candidatos-cobro` de ESE abono:
 *  - API ≤ 0.0.77 (sin la capacidad `cobros_parciales`): la liga de siempre
 *    (no existe el parcial);
 *  - el cobro ya no es candidato ⇒ a mano;
 *  - CONCILIADO (o sin veredicto) ⇒ ligar; PARCIAL ⇒ confirmar;
 *  - cualquier rechazo (EXCEDE, COMISION_NO_CUADRA, …) ⇒ a mano, con la razón
 *    de `guiaAlVincular` (el diálogo tiene las salidas de un clic).
 */
export function pasoPropuestaCobro(
  respuesta: Pick<CandidatosCobroResponse, "movimiento" | "candidatos">,
  cobroId: string,
  abono: AbonoGuia,
): PasoPropuestaCobro {
  if (typeof respuesta.movimiento?.cobros_parciales !== "boolean") return { tipo: "LIGAR" };
  const candidatos = Array.isArray(respuesta.candidatos) ? respuesta.candidatos : [];
  const c = candidatos.find((x): x is CandidatoCobroVuelo => x.tipo === "COBRO_VUELO" && x.cobro_id === cobroId);
  if (!c) return { tipo: "A_MANO", texto: MSG_PROPUESTA_COBRO_NO_ESTA };
  const estado = c.al_vincular?.estado;
  if (estado == null || estado === "CONCILIADO") return { tipo: "LIGAR" };
  const cobrosParciales = respuesta.movimiento.cobros_parciales;
  // Sin la capacidad (`false`) un PARCIAL no se completa: a mano con su razón.
  if (estado === "PARCIAL" && cobrosParciales === true) return { tipo: "CONFIRMAR_PARCIAL", candidato: c };
  const guia = guiaAlVincular({ tipo: "COBRO", c }, abono, { conAcciones: false, cobrosParciales });
  return {
    tipo: "A_MANO",
    texto: `${guia?.texto ?? "El servidor no aceptaría este abono con ese cobro."}${SUFIJO_PROPUESTA_A_MANO}`,
  };
}

/**
 * La lectura de `candidatos-cobro` FALLÓ antes de aceptar una propuesta.
 * Sin veredicto (sin red, HTML, 5xx sin código) ⇒ «el servidor no respondió…
 * vuelve a intentarlo». Un 4xx o un código de negocio SÍ es respuesta
 * (sesión vencida, el abono ya no existe…): su texto es-MX (`fail()`) + «No
 * se vinculó nada.», con su `code` y `status` (revisión 2 del 15-oct-2026:
 * antes todo decía «no respondió» y se reintentaba sin fin).
 */
export function errorLecturaPropuesta(r: ResultadoVincularCobros): {
  ok: false;
  code: string;
  error: string;
  status?: number;
} {
  if (respuestaSinVeredicto(r) || !r.error?.trim()) {
    return { ok: false, code: CODE_PROPUESTA_SIN_VEREDICTO, error: MSG_PROPUESTA_SIN_VEREDICTO };
  }
  const base = r.error.trim();
  const texto = `${base}${/[.!?]$/.test(base) ? "" : "."} No se vinculó nada.`;
  return {
    ok: false,
    code: r.code ?? CODE_PROPUESTA_SIN_VEREDICTO,
    error: texto,
    ...(typeof r.status === "number" ? { status: r.status } : {}),
  };
}

/**
 * Una confirmación de dinero («¿Vincular como pago parcial?», «¿Corregir la
 * comisión y vincular?») vale para el candidato con que se pidió: si lo
 * marcado cambia, no reaparece sola (revisión 2 del 15-oct-2026: se quedaba
 * pegada y salía al volver a marcar el mismo cobro).
 */
export function confirmacionVigente<T extends string>(
  pendiente: { tipo: T; clave: string } | null,
  claveMarcada: string | null,
): T | null {
  if (!pendiente || claveMarcada == null) return null;
  return pendiente.clave === claveMarcada ? pendiente.tipo : null;
}

/**
 * Diálogo LEGADO «Vincular cobro»: la búsqueda de candidatos FALLÓ. Jamás el
 * «Sin cobros ni sobres candidatos» de una lista vacía (el operador creería
 * que no hay nada, o que la liga sin respuesta sí entró).
 */
export function textoCandidatosCobroNoCargaron(r: Pick<ResultadoVincularCobros, "code" | "error">): string {
  if (r.code === "SIN_CONEXION") {
    return "No se pudieron buscar los cobros (sin conexión con el servidor). Esto no quiere decir que no haya candidatos: vuelve a intentarlo.";
  }
  const base = r.error?.trim();
  return `No se pudieron buscar los cobros${base ? `: ${base.replace(/[.]$/, "")}` : ""}. Esto no quiere decir que no haya candidatos: vuelve a intentarlo.`;
}

/** El cobro que viaja en `details.candidato` de un `CONFIRMAR_PARCIAL` (null si no viene bien formado). */
export function candidatoConfirmarParcial(details: unknown): CandidatoCobroVuelo | null {
  const c = detallesDe(details).candidato;
  if (!c || typeof c !== "object") return null;
  const cand = c as Partial<CandidatoCobroVuelo>;
  return cand.tipo === "COBRO_VUELO" && typeof cand.cobro_id === "string" && cand.al_vincular?.estado === "PARCIAL"
    ? (cand as CandidatoCobroVuelo)
    : null;
}
