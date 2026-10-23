/**
 * CIERRE DE MES formal (16-oct-2026, API 0.0.88) — FUENTE ÚNICA PURA del
 * panel (sin React ni red): roles, textos es-MX, qué mes cierra la vista,
 * el badge de estado, los motivos por los que no se puede cerrar, los
 * enlaces y la lectura defensiva de las respuestas del API.
 *
 * Pedido del cliente: «Necesito una opción para cerrar el mes que no es el
 * corriente, para el mes anterior … y los vuelos que aún no se cobren se
 * marquen en el balance y se muevan para el siguiente mes hasta que se cobre
 * y complete». Decisiones ya tomadas: el vuelo pasa COMPLETO (venta, gastos
 * del vuelo, comisiones; las horas se quedan), un cobro parcial también pasa,
 * mes cerrado = bloqueado para capturas (409 `MES_CERRADO`), «Reabrir» solo
 * ADMIN con confirmación.
 *
 * Aquí NO hay dinero calculado: los montos y las leyendas («Pasa a octubre
 * 2026 · pendiente de cobro: …» o, si el vuelo ya se cobró después del
 * corte, «Pasa a octubre 2026 · cobrado el 14-oct, después del 30-sep (…)»)
 * los arma el API y el panel los copia.
 *
 * CIERRE POR AVIÓN (23-oct-2026, API 0.0.104, invariante 105). Pedido del
 * cliente: «eliminar la burbuja independiente de cierre de mes, y poner un
 * botón de cierre de mes individual en cada avión». El cierre es por AVIÓN
 * y por mes (`cierre_mes_avion`); la fila global del mes la deriva el API al
 * cerrar el último avión activo. El panel: chip por avión en cada tile de
 * «Balance por avión», chip de la flota («Parcial · 3 de 7») en «Balance
 * mensual», y el diálogo de siempre con un `alcance` (un avión o la flota).
 * FALLBACK: con `por_avion` ≠ true (API previo o sin la migración) el panel
 * ofrece SOLO el flujo global de hoy (`modoCierreDelApi` = 'GLOBAL').
 */
import type {
  CierreAvionAditivo,
  CierrePeriodoAditivo,
  CierresRespuesta,
  EstadoCierreAvion,
  EstadoCierreMes,
  MesCierre,
  MesCierreAvion,
  MotivoNoCerrable,
  PreviaCierre,
  VueloDiferido,
  VueloDiferidoMarca,
} from "@/types/cierres";
import { fmtMonto } from "@/lib/format";
import { esMesValido, etiquetaMes, mesDePeriodo, rangoDeMes, sumarMeses } from "./reparto-pagos";
import { hrefReportesDesdeVista } from "./balance-vista";
import { atajoAntesDelInicio, type InicioOficial } from "./inicio-oficial";
import { esErrorTecnico } from "./errores-tecnicos";

// =============================================================================
// Roles (ESPEJO del `@Roles` de `CierresController`, contrato §3)
// =============================================================================

/** `POST /v1/cierres/:periodo`. */
export const ROLES_CIERRAN_MES = ["ADMIN", "FACTURACION"] as const;
/** `POST /v1/cierres/:periodo/reabrir`. */
export const ROLES_REABREN_MES = ["ADMIN"] as const;

/** ¿Se le OFRECE «Cerrar <mes>»? Sin rol (`/me` falló) sí: el API es el candado. */
export function puedeCerrarMes(rol?: string | null): boolean {
  if (!rol) return true;
  return (ROLES_CIERRAN_MES as readonly string[]).includes(rol);
}

/** ¿Se le OFRECE «Reabrir mes»? Misma regla. */
export function puedeReabrirMes(rol?: string | null): boolean {
  if (!rol) return true;
  return (ROLES_REABREN_MES as readonly string[]).includes(rol);
}

// =============================================================================
// Meses y fechas (es-MX, hora Cancún)
// =============================================================================

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** «2026-09» ⇒ «septiembre 2026» (para ir dentro de una frase). Inválido ⇒ tal cual. */
export function mesEnMinuscula(mes: string): string {
  if (!esMesValido(mes)) return mes;
  const e = etiquetaMes(mes);
  return `${e[0].toLowerCase()}${e.slice(1)}`;
}

/** «2026-09» ⇒ «sep-2026» (chips cortos). */
export function mesCorto(mes: string): string {
  if (!esMesValido(mes)) return mes;
  return `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]}-${mes.slice(0, 4)}`;
}

/**
 * timestamptz ⇒ «16-oct-2026» en día Cancún (determinista: sin depender del
 * nombre corto que Intl dé al mes). Inválido ⇒ «—».
 */
export function fechaCortaCancun(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cancun",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? "0");
  const m = n("month");
  if (m < 1 || m > 12) return "—";
  return `${n("day")}-${MESES_CORTOS[m - 1]}-${n("year")}`;
}

/** «2026-09» ⇒ «30-sep» (el corte del cobro: último día del mes). */
export function ultimoDiaCorto(mes: string): string {
  const r = rangoDeMes(mes);
  if (!r) return mes;
  return `${Number(r.hasta.slice(8, 10))}-${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]}`;
}

/**
 * «2026-10-04» ⇒ «4-oct» (espejo de `diaCortoDeDia` del API). El API manda
 * la fecha del cobro posterior y el corte como DÍA Cancún `YYYY-MM-DD`;
 * cualquier otra cosa ⇒ null (jamás se adivina el día de un timestamp).
 */
export function diaCortoDeDia(dia: string | null | undefined): string | null {
  if (typeof dia !== "string" || !DIA_RE.test(dia)) return null;
  const m = Number(dia.slice(5, 7));
  const d = Number(dia.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${d}-${MESES_CORTOS[m - 1]}`;
}

/**
 * El corte con el que se midió «cobrado al cierre» de un vuelo que pasa a
 * `destino`: el último día del mes ANTERIOR («2026-10» ⇒ «30-sep»). Mes
 * inválido ⇒ null.
 */
export function corteCortoDeDestino(destino: string | null | undefined): string | null {
  const anterior = esMesValido(destino) ? sumarMeses(destino, -1) : null;
  return anterior ? ultimoDiaCorto(anterior) : null;
}

/** `/admin/reportes?desde=YYYY-MM-01&hasta=YYYY-MM-DD` (el mes completo). */
export function hrefReportesMes(mes: string): string | null {
  const r = rangoDeMes(mes);
  return r ? hrefReportesDesdeVista(r.desde, r.hasta) : null;
}

// =============================================================================
// ¿Qué mes cierra la vista? (el periodo de `/admin/reportes`)
// =============================================================================

export interface MesDeVista {
  mes: string;
  /** El mes en curso (Cancún): no se puede cerrar todavía. */
  enCurso: boolean;
}

/**
 * El mes que la card de cierre evalúa: un mes calendario COMPLETO
 * (`mesDePeriodo`) o «Este mes» (del 1 del mes en curso a HOY, el corte del
 * periodo por defecto y del selector de mes). Cualquier otro rango ⇒ null y
 * la card guía a «Mes pasado».
 */
export function mesDeVistaCierre(desde: string, hasta: string, hoy: string): MesDeVista | null {
  const completo = mesDePeriodo(desde, hasta);
  const mesHoy = DIA_RE.test(hoy) ? hoy.slice(0, 7) : null;
  if (completo) return { mes: completo, enCurso: completo === mesHoy };
  if (mesHoy && desde === `${mesHoy}-01` && hasta === hoy) return { mes: mesHoy, enCurso: true };
  return null;
}

/**
 * Guía cuando el periodo NO es un mes: nombra el atajo «Mes pasado · Septiembre
 * 2026» si existe (no está entero antes del inicio oficial); si no, el selector.
 */
export function textoElegirMesCompleto(hoy: string, inicio: InicioOficial = null): string {
  const mesHoy = DIA_RE.test(hoy) ? hoy.slice(0, 7) : null;
  const pasado = mesHoy ? sumarMeses(mesHoy, -1) : null;
  const rango = pasado ? rangoDeMes(pasado) : null;
  if (pasado && rango && !atajoAntesDelInicio(rango, inicio)) {
    return `El cierre es por mes completo: elige «Mes pasado · ${etiquetaMes(pasado)}».`;
  }
  return "El cierre es por mes completo: elige un mes en el selector de abajo.";
}

// =============================================================================
// Carga de `GET /v1/cierres` (nunca se miente: cada fallo tiene su texto)
// =============================================================================

export type EstadoCargaCierres = "ok" | "api-previo" | "sin-migracion" | "sin-permiso" | "error";

export const CODIGO_CIERRE_NO_DISPONIBLE = "CIERRE_NO_DISPONIBLE";

/** 404 «Cannot GET» = API 0.0.87; 503 `CIERRE_NO_DISPONIBLE` = sin la migración. */
export function clasificarFalloCierres(
  status: number | null,
  code: string | null,
  message: string | null,
): EstadoCargaCierres {
  if (status === 401 || status === 403) return "sin-permiso";
  if (status === 404 && /^Cannot (GET|POST)\b/i.test((message ?? "").trim())) return "api-previo";
  if (status === 404 && code === "NOT_FOUND") return "api-previo";
  if (status === 503 && code === CODIGO_CIERRE_NO_DISPONIBLE) return "sin-migracion";
  return "error";
}

export const TEXTO_CIERRE_API_PREVIO =
  "El cierre formal necesita el API 0.0.88 (sistemas está desplegando). El pre-cierre y las descargas siguen disponibles.";
export const TEXTO_CIERRE_SIN_MIGRACION =
  "El cierre formal todavía no está activo en la base de datos (sistemas está desplegando). El pre-cierre y las descargas siguen disponibles.";
export const TEXTO_CIERRE_ERROR =
  "No se pudo leer el estado del cierre; recarga para reintentar. El pre-cierre y las descargas siguen disponibles.";

/** Texto para los estados que NO son `ok` (`sin-permiso` no pinta nada). */
export function textoCargaCierres(estado: EstadoCargaCierres): string | null {
  switch (estado) {
    case "api-previo":
      return TEXTO_CIERRE_API_PREVIO;
    case "sin-migracion":
      return TEXTO_CIERRE_SIN_MIGRACION;
    case "error":
      return TEXTO_CIERRE_ERROR;
    default:
      return null;
  }
}

/** Lectura DEFENSIVA de `GET /v1/cierres`: forma mínima o null. */
export function normalizarCierres(raw: unknown): CierresRespuesta | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.disponible !== "boolean") return null;
  const meses = Array.isArray(r.meses) ? r.meses.flatMap((m) => normalizarMes(m) ?? []) : [];
  return {
    disponible: r.disponible,
    // CIERRE POR AVIÓN: solo `true` literal enciende el flujo por avión.
    por_avion: r.por_avion === true,
    inicio_oficial: typeof r.inicio_oficial === "string" ? r.inicio_oficial : null,
    mes_en_curso: typeof r.mes_en_curso === "string" ? r.mes_en_curso : "",
    meses,
    siguiente_a_cerrar: esMesValido(r.siguiente_a_cerrar as string) ? (r.siguiente_a_cerrar as string) : null,
  };
}

function usuario(raw: unknown): { id: string; nombre: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.nombre !== "string") return null;
  return { id: typeof u.id === "string" ? u.id : "", nombre: u.nombre };
}

/** Estados de la FLOTA (`PARCIAL` desde el cierre por avión, API 0.0.104). */
const ESTADOS = new Set(["ABIERTO", "PARCIAL", "CERRADO", "REABIERTO"]);
/** Estados de UN avión: nunca PARCIAL. */
const ESTADOS_AVION = new Set(["ABIERTO", "CERRADO", "REABIERTO"]);
const MOTIVOS = new Set([
  "MES_EN_CURSO",
  "MES_ANTERIOR_ABIERTO",
  "YA_CERRADO",
  "PRECIERRE_NO_LISTO",
  "PERIODO_ANTES_DEL_INICIO",
]);

function motivoDe(raw: unknown): MotivoNoCerrable | null {
  return typeof raw === "string" && MOTIVOS.has(raw) ? (raw as MotivoNoCerrable) : null;
}

function enteroONada(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

/**
 * Un avión de `meses[].aviones` (API 0.0.104). Sin `aeronave_id` o sin
 * matrícula, o con un estado que el panel no conoce, la fila se DESCARTA:
 * jamás se inventa un estado para un avión.
 */
function normalizarMesAvion(raw: unknown): MesCierreAvion | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.aeronave_id !== "string" || a.aeronave_id === "") return null;
  if (typeof a.matricula !== "string" || a.matricula.trim() === "") return null;
  if (typeof a.estado !== "string" || !ESTADOS_AVION.has(a.estado)) return null;
  return {
    aeronave_id: a.aeronave_id,
    matricula: a.matricula.trim(),
    modelo: typeof a.modelo === "string" ? a.modelo : null,
    // Sin la llave se asume activo (el API lista los activos siempre).
    activa: a.activa !== false,
    estado: a.estado as EstadoCierreAvion,
    cerrado_at: typeof a.cerrado_at === "string" ? a.cerrado_at : null,
    cerrado_por: usuario(a.cerrado_por),
    reabierto_at: typeof a.reabierto_at === "string" ? a.reabierto_at : null,
    reabierto_por: usuario(a.reabierto_por),
    reabierto_motivo: typeof a.reabierto_motivo === "string" ? a.reabierto_motivo : null,
    version: typeof a.version === "number" ? a.version : 0,
    puede_cerrar: a.puede_cerrar === true,
    motivo_no_cerrable: motivoDe(a.motivo_no_cerrable),
    totales: a.totales && typeof a.totales === "object" ? (a.totales as MesCierreAvion["totales"]) : null,
  };
}

function normalizarMes(raw: unknown): MesCierre | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!esMesValido(m.periodo as string)) return null;
  const estado = typeof m.estado === "string" && ESTADOS.has(m.estado) ? m.estado : "ABIERTO";
  const motivo = motivoDe(m.motivo_no_cerrable);
  // CIERRE POR AVIÓN: las tres llaves son ADITIVAS; basura ⇒ sin ellas
  // (el panel se queda con la fila global, nunca inventa aviones).
  const activos = enteroONada(m.aviones_activos);
  const cerrados = enteroONada(m.aviones_cerrados);
  const aviones = Array.isArray(m.aviones) ? m.aviones.flatMap((a) => normalizarMesAvion(a) ?? []) : undefined;
  return {
    periodo: m.periodo as string,
    estado: estado as MesCierre["estado"],
    cerrado_at: typeof m.cerrado_at === "string" ? m.cerrado_at : null,
    cerrado_por: usuario(m.cerrado_por),
    reabierto_at: typeof m.reabierto_at === "string" ? m.reabierto_at : null,
    reabierto_por: usuario(m.reabierto_por),
    reabierto_motivo: typeof m.reabierto_motivo === "string" ? m.reabierto_motivo : null,
    version: typeof m.version === "number" ? m.version : 0,
    puede_cerrar: m.puede_cerrar === true,
    motivo_no_cerrable: motivo,
    totales: m.totales && typeof m.totales === "object" ? (m.totales as MesCierre["totales"]) : null,
    ...(activos !== undefined ? { aviones_activos: activos } : {}),
    ...(cerrados !== undefined ? { aviones_cerrados: cerrados } : {}),
    ...(aviones !== undefined ? { aviones } : {}),
  };
}

/** Lectura DEFENSIVA de la previa: forma mínima o null. */
export function normalizarPrevia(raw: unknown): PreviaCierre | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!esMesValido(p.periodo as string) || typeof p.listo !== "boolean") return null;
  const lista = (v: unknown): VueloDiferido[] =>
    Array.isArray(v) ? v.filter((x): x is VueloDiferido => !!x && typeof x === "object" && "id" in x) : [];
  const motivo = motivoDe(p.motivo_no_cerrable);
  const t = (p.totales && typeof p.totales === "object" ? p.totales : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof t[k] === "number" ? (t[k] as number) : 0);
  // CIERRE POR AVIÓN (API 0.0.104): el alcance de la previa. `aeronave`
  // solo con id Y matrícula (si no, se trata como «toda la flota»).
  const ae = p.aeronave && typeof p.aeronave === "object" ? (p.aeronave as Record<string, unknown>) : null;
  const aeronave =
    ae && typeof ae.id === "string" && typeof ae.matricula === "string"
      ? { id: ae.id, matricula: ae.matricula, modelo: typeof ae.modelo === "string" ? ae.modelo : null }
      : null;
  const alcance = Array.isArray(p.aviones_alcance)
    ? p.aviones_alcance.flatMap((x) => {
        const a = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
        return a && typeof a.aeronave_id === "string" && typeof a.matricula === "string"
          ? [{ aeronave_id: a.aeronave_id, matricula: a.matricula }]
          : [];
      })
    : [];
  return {
    periodo: p.periodo as string,
    estado: typeof p.estado === "string" && ESTADOS.has(p.estado) ? (p.estado as PreviaCierre["estado"]) : "ABIERTO",
    listo: p.listo,
    motivo_no_cerrable: motivo,
    texto_no_cerrable:
      typeof p.texto_no_cerrable === "string" && p.texto_no_cerrable.trim() !== "" ? p.texto_no_cerrable.trim() : null,
    aeronave,
    aviones_alcance: alcance,
    bloqueantes: Array.isArray(p.bloqueantes) ? (p.bloqueantes as PreviaCierre["bloqueantes"]) : [],
    bloqueantes_otros_aviones: Array.isArray(p.bloqueantes_otros_aviones)
      ? (p.bloqueantes_otros_aviones as PreviaCierre["bloqueantes"])
      : [],
    vuelos_que_pasan: lista(p.vuelos_que_pasan),
    vuelos_que_vienen: lista(p.vuelos_que_vienen),
    // INCLUIR EN EL MES (API 0.0.102): sin la llave, [] (API previo).
    vuelos_incluidos: lista(p.vuelos_incluidos),
    totales: {
      vuelos: num("vuelos"),
      completados: num("completados"),
      cancelados: num("cancelados"),
      pasan: num("pasan"),
      pasan_venta_usd: num("pasan_venta_usd"),
      pasan_cobrado_al_corte_usd: num("pasan_cobrado_al_corte_usd"),
      pasan_por_cobrar_usd: num("pasan_por_cobrar_usd"),
      pasan_cobrado_posterior_usd: num("pasan_cobrado_posterior_usd"),
      pasan_mxn: num("pasan_mxn"),
      pasan_usd_nativo: num("pasan_usd_nativo"),
      se_quedan_en_cero: num("se_quedan_en_cero"),
      incluidos: num("incluidos"),
    },
    reparto:
      p.reparto && typeof p.reparto === "object" && Array.isArray((p.reparto as { antes?: unknown }).antes)
        ? (p.reparto as PreviaCierre["reparto"])
        : null,
  };
}

/** El renglón del mes en la lista (null si el API no lo trae). */
export function mesCierreDe(cierres: CierresRespuesta | null, mes: string): MesCierre | null {
  return cierres?.meses.find((m) => m.periodo === mes) ?? null;
}

/** Meses con `estado = 'CERRADO'` (para marcar «(cerrado)» en el selector). */
export function mesesCerrados(cierres: CierresRespuesta | null): string[] {
  return (cierres?.meses ?? []).filter((m) => m.estado === "CERRADO").map((m) => m.periodo);
}

// =============================================================================
// Badge de estado del mes
// =============================================================================

export type TonoEstadoCierre = "abierto" | "parcial" | "cerrado" | "reabierto" | "en-curso";

export interface BadgeEstadoCierre {
  tono: TonoEstadoCierre;
  texto: string;
  /** Tooltip (p. ej. «3 de 7 aviones cerrados»); ausente ⇒ sin `title`. */
  title?: string;
}

/** Lo que el badge necesita de un mes o de un avión del mes (misma forma). */
type FilaEstadoCierre = Pick<
  MesCierre,
  "estado" | "cerrado_at" | "cerrado_por" | "reabierto_at" | "reabierto_por" | "reabierto_motivo"
> &
  Partial<Pick<MesCierre, "aviones_activos" | "aviones_cerrados">>;

/** «Cerrado el 16-oct-2026 por Ale» (fecha Cancún + quién). */
function textoCerradoEl(f: Pick<FilaEstadoCierre, "cerrado_at" | "cerrado_por">): string {
  const por = f.cerrado_por?.nombre ? ` por ${f.cerrado_por.nombre}` : "";
  return `Cerrado el ${fechaCortaCancun(f.cerrado_at)}${por}`;
}

/** «Reabierto el 17-oct-2026 por Ale (motivo)». */
function textoReabiertoEl(f: Pick<FilaEstadoCierre, "reabierto_at" | "reabierto_por" | "reabierto_motivo">): string {
  const por = f.reabierto_por?.nombre ? ` por ${f.reabierto_por.nombre}` : "";
  const motivo = f.reabierto_motivo ? ` (${f.reabierto_motivo})` : "";
  return `Reabierto el ${fechaCortaCancun(f.reabierto_at)}${por}${motivo}`;
}

/** «En curso (se cierra a partir del 1-nov)». */
function badgeEnCurso(mes: string): BadgeEstadoCierre {
  const sig = sumarMeses(mes, 1);
  return {
    tono: "en-curso",
    texto: sig ? `En curso (se cierra a partir del 1-${MESES_CORTOS[Number(sig.slice(5, 7)) - 1]})` : "En curso",
  };
}

/** «3 de 7 aviones cerrados» (solo con los dos conteos del API). */
function textoAvionesCerrados(f: Partial<Pick<MesCierre, "aviones_activos" | "aviones_cerrados">>): string | null {
  if (typeof f.aviones_activos !== "number" || typeof f.aviones_cerrados !== "number") return null;
  return `${f.aviones_cerrados} de ${f.aviones_activos} aviones cerrados`;
}

/**
 * «Abierto» · «Cerrado el 16-oct-2026 por Ale» · «Reabierto el 17-oct-2026 por
 * Ale (motivo)» · «En curso (se cierra a partir del 1-nov)» · «Parcial · 3
 * de 7» (cierre por avión: `title` «3 de 7 aviones cerrados»). Sirve para la
 * fila del mes (flota) y para la de UN avión (`MesCierreAvion`, misma forma).
 * Un mes cerrado manda aunque sea el mes en curso (imposible hoy; se deja
 * explícito).
 */
export function badgeEstadoCierre(m: FilaEstadoCierre | null, mes: string, enCurso: boolean): BadgeEstadoCierre {
  if (m?.estado === "CERRADO") return { tono: "cerrado", texto: textoCerradoEl(m) };
  if (enCurso) return badgeEnCurso(mes);
  if (m?.estado === "REABIERTO") return { tono: "reabierto", texto: textoReabiertoEl(m) };
  if (m?.estado === "PARCIAL") {
    const conteo = textoAvionesCerrados(m);
    return {
      tono: "parcial",
      texto: conteo ? `Parcial · ${m.aviones_cerrados} de ${m.aviones_activos}` : "Parcial",
      title: conteo ?? "Algunos aviones del mes ya están cerrados",
    };
  }
  return { tono: "abierto", texto: "Abierto" };
}

// =============================================================================
// Por qué NO se puede cerrar (espejo EXACTO de `textoMotivoNoCerrable` del
// API: `GET /v1/cierres` solo manda el CÓDIGO; la previa y los 409 traen el
// texto y entonces gana el del API — ver `textoNoCerrableDePrevia`)
// =============================================================================

export function textoMotivoNoCerrable(motivo: MotivoNoCerrable | null, mes: string): string | null {
  if (!motivo) return null;
  switch (motivo) {
    case "MES_EN_CURSO": {
      // EXACTO el texto del 409 del API (`textoMesEnCurso`): «Octubre 2026
      // todavía está en curso: se cierra a partir del 1 de noviembre.»; el año
      // solo cuando cambia («… a partir del 1 de enero de 2027.»).
      const sig = sumarMeses(mes, 1);
      if (!sig) return `${etiquetaMes(mes)} todavía está en curso.`;
      const nombre = mesEnMinuscula(sig).replace(/ \d{4}$/, "");
      const anio = sig.slice(0, 4) === mes.slice(0, 4) ? "" : ` de ${sig.slice(0, 4)}`;
      return `${etiquetaMes(mes)} todavía está en curso: se cierra a partir del 1 de ${nombre}${anio}.`;
    }
    case "MES_ANTERIOR_ABIERTO": {
      const ant = sumarMeses(mes, -1);
      return `Para cerrar ${mesEnMinuscula(mes)} primero cierra ${ant ? mesEnMinuscula(ant) : "el mes anterior"}.`;
    }
    case "YA_CERRADO":
      return `${etiquetaMes(mes)} ya está cerrado.`;
    case "PRECIERRE_NO_LISTO":
      return `Antes de cerrar ${mesEnMinuscula(mes)} resuelve los pendientes que bloquean el pre-cierre.`;
    case "PERIODO_ANTES_DEL_INICIO":
      return `${etiquetaMes(mes)} es anterior al inicio oficial del sistema: no se cierra aquí.`;
  }
}

/** El texto de la previa: el del API (`texto_no_cerrable`) si viene; si no, el espejo. */
export function textoNoCerrableDePrevia(previa: Pick<PreviaCierre, "periodo" | "motivo_no_cerrable" | "texto_no_cerrable">): string | null {
  if (!previa.motivo_no_cerrable) return null;
  return previa.texto_no_cerrable || textoMotivoNoCerrable(previa.motivo_no_cerrable, previa.periodo);
}

/**
 * Texto de por qué la card NO ofrece cerrar. El código manda; un
 * `puede_cerrar:false` con un código que el panel no conoce (API más nuevo)
 * igual deshabilita el botón — nunca se ofrece un cierre que el API negó.
 */
export function textoNoCerrableDeMes(
  m: Pick<MesCierre, "estado" | "puede_cerrar" | "motivo_no_cerrable">,
  mes: string,
  enCurso: boolean,
): string | null {
  if (m.estado === "CERRADO") return null;
  const motivo = enCurso && !m.motivo_no_cerrable ? "MES_EN_CURSO" : m.motivo_no_cerrable;
  if (motivo) return textoMotivoNoCerrable(motivo, mes);
  return m.puede_cerrar ? null : `${etiquetaMes(mes)} todavía no se puede cerrar.`;
}

/** ¿El diálogo puede confirmar? Previa leída, lista, sin motivo y con la casilla. */
export function puedeConfirmarCierre(previa: PreviaCierre | null, entiendo: boolean): boolean {
  return !!previa && previa.listo && !previa.motivo_no_cerrable && previa.estado !== "CERRADO" && entiendo;
}

/** Lo que devuelven las actions del cierre (forma de `ActionResult`). */
export interface RespuestaAccionCierre {
  ok: boolean;
  error?: string | null;
  code?: string | null;
  details?: unknown;
  status?: number | null;
}

/**
 * Texto de un rechazo de «Cerrar» / «Reabrir». El `message` del API va tal
 * cual (es-MX), SALVO lo técnico: sin respuesta, HTML de Railway, «Internal
 * server error», «Forbidden resource»… Un POST sin respuesta pudo haberse
 * aplicado ⇒ se pide recargar ANTES de reintentar (nunca «vuelve a
 * intentarlo» a ciegas sobre una escritura).
 */
export function mensajeErrorCierre(
  r: RespuestaAccionCierre,
  accion: "cerrar" | "reabrir",
  mes: string,
  /** CIERRE POR AVIÓN: la matrícula del alcance (para el 409 `OTRO_AVION_CERRADO`). */
  matricula?: string | null,
): string {
  const m = mesEnMinuscula(mes);
  const que = matricula ? `${matricula} · ${m}` : m;
  const hecho = accion === "cerrar" ? "quedó cerrado" : "quedó reabierto";
  if (r.status === 401) return "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
  if (r.status === 403) {
    return accion === "cerrar"
      ? "Tu usuario no puede cerrar meses: lo hacen administración y facturación."
      : "Solo un administrador puede reabrir un mes.";
  }
  if (clasificarFalloCierres(r.status ?? null, r.code ?? null, r.error ?? null) === "api-previo") {
    return TEXTO_CIERRE_API_PREVIO;
  }
  if (r.status === 503 && r.code === CODIGO_CIERRE_NO_DISPONIBLE) return TEXTO_CIERRE_SIN_MIGRACION;
  if (r.code === "SIN_CONEXION" || esErrorTecnico({ error: r.error, code: r.code })) {
    return `No hubo respuesta del servidor. Recarga la página para ver si ${que} ${hecho} antes de volver a intentarlo.`;
  }
  if (r.code === CODIGO_OTRO_AVION_CERRADO) {
    const legible = textoOtroAvionCerrado(r.details, matricula ?? null);
    if (legible) return legible;
  }
  return (r.error ?? "").trim();
}

export type DecisionRespuestaCerrar =
  | { tipo: "exito"; diferidos: number; incluidos: number; cerrados: string[] }
  | { tipo: "previa_nueva"; previa: PreviaCierre }
  /** CIERRE POR AVIÓN (regla 7): la flota se cerró A MEDIAS (`details.cerrados`). */
  | { tipo: "parcial"; cerrados: string[]; texto: string }
  | { tipo: "error"; texto: string };

/** Las matrículas de una lista del API (`cierres[].matricula`, `details.cerrados`): texto u objetos con `matricula`. */
export function matriculasDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (typeof x === "string") return x.trim() ? [x.trim()] : [];
    const o = x && typeof x === "object" ? (x as { matricula?: unknown }) : null;
    return typeof o?.matricula === "string" && o.matricula.trim() ? [o.matricula.trim()] : [];
  });
}

/**
 * Qué hace el diálogo con la respuesta de `cerrarMesAction`: éxito (toast y
 * refresca; `cerrados` = matrículas de `cierres[]` o de `aeronave`),
 * `PREVIA_CAMBIO` con la previa nueva (repinta, desmarca la casilla), el
 * cierre de la flota que quedó a medias (`details.cerrados`: los que SÍ se
 * cerraron se quedan cerrados ⇒ toast y refresca) o el error con su texto.
 * Cualquier rechazo deja la pantalla vieja ⇒ el diálogo refresca al cerrarse.
 */
export function decidirRespuestaCerrar(
  r: RespuestaAccionCierre & {
    data?: { diferidos?: unknown[]; incluidos?: unknown[]; cierres?: unknown[]; aeronave?: unknown } | null;
  },
  mes: string,
): DecisionRespuestaCerrar {
  if (r.ok && r.data) {
    const deFilas = matriculasDe(r.data.cierres);
    const cerrados = deFilas.length > 0 ? deFilas : matriculasDe([r.data.aeronave]);
    return {
      tipo: "exito",
      diferidos: Array.isArray(r.data.diferidos) ? r.data.diferidos.length : 0,
      incluidos: Array.isArray(r.data.incluidos) ? r.data.incluidos.length : 0,
      cerrados,
    };
  }
  if (r.code === CODIGO_PREVIA_CAMBIO) {
    const nueva = previaDeDetails(r.details);
    if (nueva) return { tipo: "previa_nueva", previa: nueva };
  }
  const texto = mensajeErrorCierre(r, "cerrar", mes);
  const d = r.details && typeof r.details === "object" ? (r.details as { cerrados?: unknown; aeronave?: unknown }) : null;
  const cerrados = matriculasDe(d?.cerrados);
  if (cerrados.length > 0) {
    const fallo = matriculasDe([d?.aeronave])[0] ?? null;
    return { tipo: "parcial", cerrados, texto: textoCierreFlotaParcial(cerrados, fallo, texto) };
  }
  return { tipo: "error", texto };
}

// =============================================================================
// Textos del diálogo «Cerrar <mes>» y de «Reabrir mes»
// =============================================================================

/** Rótulo del mes en la card: «Septiembre 2026». */
export function tituloEstadoCierre(mes: string): string {
  return etiquetaMes(mes);
}

export function etiquetaBotonCerrar(mes: string): string {
  return `Cerrar ${mesEnMinuscula(mes)}`;
}

export const ETIQUETA_BOTON_REABRIR = "Reabrir mes";
export const ETIQUETA_CONFIRMAR_CERRAR = "Cerrar mes";
export const ETIQUETA_CONFIRMAR_REABRIR = "Reabrir";
export const ETIQUETA_CARGANDO_PREVIA = "Revisando el mes…";

/** La descripción de siempre de la card, ampliada con el camino del cierre. */
export const AYUDA_CIERRE_MES =
  "El cierre es por mes completo y en orden: elige «Mes pasado», revisa el pre-cierre, cierra y descarga los reportes. Los vuelos completados que no estén cobrados al último día del mes pasan completos al mes siguiente (venta, gastos del vuelo y comisiones; las horas se quedan en su fecha real).";

export function tituloVuelosQuePasan(destino: string): string {
  return `Vuelos que pasarán a ${mesEnMinuscula(destino)}`;
}

export function tituloVuelosQueVienen(origen: string): string {
  return `Vuelos que vienen de ${mesEnMinuscula(origen)}`;
}

export function textoCheckboxCerrar(mes: string): string {
  return `Entiendo que ${mesEnMinuscula(mes)} quedará bloqueado para capturas`;
}

/**
 * Descripción del diálogo de cierre. Caso #351 (16-oct-2026): los vuelos que
 * pasan NO siempre están por cobrar — los de septiembre cobrados en octubre
 * también pasan —, así que se dice la regla tal cual: sin cobro COMPLETO al
 * corte, aunque se haya cobrado después.
 */
export function textoDescripcionCerrar(mes: string, destino: string): string {
  return `Al cerrar, ${mesEnMinuscula(mes)} queda bloqueado para capturas (gastos, cobros, ingresos, caja chica, cotizaciones). Los vuelos que no estén cobrados completos al ${ultimoDiaCorto(mes)} pasan completos a ${mesEnMinuscula(destino)}, también los que se cobraron después de esa fecha: su dinero cuenta en ese mes.`;
}

/**
 * ¿La cifra «Por cobrar al <corte>» de este vuelo ya se cobró después? Lo
 * dice el API con el motivo (`COBRO_POSTERIOR`): entonces el diálogo la
 * pinta en gris y no en ámbar (caso #351: el ámbar se leía «se debe»).
 */
export function porCobrarYaSeCobro(v: Pick<VueloDiferido, "motivo">): boolean {
  return v.motivo === "COBRO_POSTERIOR";
}

/**
 * Celda «Cobrado después» del diálogo de cierre: «$2,343.20 USD · el 14-oct»
 * con la fecha del cobro posterior que manda el API 0.0.91; sin fecha (API
 * previo) o sin cobro posterior, solo el monto.
 */
export function textoCobradoPosterior(
  v: Pick<VueloDiferido, "cobrado_posterior_usd" | "fecha_cobro_posterior">,
): string {
  const monto = fmtMonto(v.cobrado_posterior_usd, "USD");
  const cuando = (v.cobrado_posterior_usd ?? 0) > 0 ? diaCortoDeDia(v.fecha_cobro_posterior) : null;
  return cuando ? `${monto} · el ${cuando}` : monto;
}

/** «Ningún vuelo pasa…» / «1 vuelo pasa…» / «5 vuelos pasan…». */
function fraseVuelosPasan(n: number, destino: string, tiempo: "presente" | "pasado" = "presente"): string {
  const d = mesEnMinuscula(destino);
  if (n === 0) return tiempo === "presente" ? `Ningún vuelo pasa a ${d}.` : `Ningún vuelo había pasado a ${d}.`;
  const verbo = n === 1 ? "pasa" : "pasan";
  return `${n} vuelo${n === 1 ? "" : "s"} ${verbo} a ${d}.`;
}

/**
 * Toast tras cerrar: «Septiembre 2026 cerrado. 5 vuelos pasan a octubre
 * 2026.» y, con vuelos que se quedaron (21-oct-2026), «… 2 vuelos cobrados
 * después del corte se quedan en septiembre.»
 */
export function textoToastCerrado(mes: string, n: number, destino: string, incluidos = 0): string {
  const base = `${etiquetaMes(mes)} cerrado. ${fraseVuelosPasan(n, destino)}`;
  if (incluidos <= 0) return base;
  const s = incluidos === 1 ? "" : "s";
  return `${base} ${incluidos} vuelo${s} cobrado${s} después del corte se queda${incluidos === 1 ? "" : "n"} en ${mesEnMinuscula(mes)}.`;
}

// ── INCLUIR EN EL MES (21-oct-2026) ──────────────────────────────────────────
// Pedido del cliente: «ya se cobraron varios de los vuelos que no se habían
// cobrado pero se cobraron en octubre… que dé la opción de poder incluirlos
// en septiembre». Solo un vuelo YA cobrado después del corte
// (COBRO_POSTERIOR) puede quedarse; el API rechaza cualquier otro
// (INCLUIR_VUELO_NO_COBRADO) y el diálogo no ofrece la casilla.

/** ¿Se le ofrece «Se queda en <mes>»? Solo COBRO_POSTERIOR. */
export function puedeQuedarseEnMes(v: Pick<VueloDiferido, "motivo">): boolean {
  return v.motivo === "COBRO_POSTERIOR";
}

/** Título de la casilla: «Se queda en septiembre (ya se cobró el 2-oct)». */
export function textoQuedarseEnMes(mes: string, v: Pick<VueloDiferido, "fecha_cobro_posterior">): string {
  const cuando = diaCortoDeDia(v.fecha_cobro_posterior ?? null);
  return `Se queda en ${mesEnMinuscula(mes)} (${cuando ? `ya se cobró el ${cuando}` : "ya se cobró después del corte"})`;
}

/** Título de la tabla de los que se quedan. */
export function tituloVuelosQueSeQuedan(mes: string): string {
  return `Se quedan en ${mesEnMinuscula(mes)} (cobrados después del corte)`;
}

/** Nota bajo la tabla de los que pasan, solo si alguno se puede quedar. */
export function notaQuedarseEnMes(mes: string, destino: string): string {
  return `Los que ya se cobraron después del corte pueden quedarse en ${mesEnMinuscula(mes)}: marca «Se queda» y el reparto de abajo se recalcula. Los demás pasan a ${mesEnMinuscula(destino)}.`;
}

/**
 * Los ids que el diálogo VIO (= `vuelos_esperados`): los que pasan + los que
 * se quedan. Si el conjunto cambió en el servidor, el API responde 409
 * PREVIA_CAMBIO con la previa nueva.
 */
export function idsVistosEnPrevia(previa: Pick<PreviaCierre, "vuelos_que_pasan" | "vuelos_incluidos">): string[] {
  return [...previa.vuelos_que_pasan, ...(previa.vuelos_incluidos ?? [])].map((v) => v.id);
}

/** Toast tras reabrir: «Septiembre 2026 reabierto. 5 vuelos regresan a septiembre.» */
export function textoToastReabierto(mes: string, revertidos: number): string {
  const m = mesEnMinuscula(mes);
  if (revertidos === 0) return `${etiquetaMes(mes)} reabierto. Ningún vuelo regresa; el mes vuelve a aceptar capturas.`;
  return `${etiquetaMes(mes)} reabierto. ${revertidos} vuelo${revertidos === 1 ? "" : "s"} regresa${revertidos === 1 ? "" : "n"} a ${m}.`;
}

/**
 * Confirmación de «Reabrir mes»: «Al reabrir, los 5 vuelos que pasaron a
 * octubre regresan a septiembre y el mes vuelve a aceptar capturas. Octubre
 * debe estar abierto.» Con 0 diferidos se dice que ninguno había pasado; con
 * `null` (el conteo NO se conoce, p. ej. al reabrir varios aviones de un
 * mes parcial) no se afirma ningún número.
 */
export function textoConfirmacionReabrir(mes: string, nDiferidos: number | null): string {
  const sig = sumarMeses(mes, 1);
  const m = mesEnMinuscula(mes);
  const s = sig ? mesEnMinuscula(sig) : "el mes siguiente";
  const sMay = sig ? etiquetaMes(sig) : "El mes siguiente";
  let regresan: string;
  if (nDiferidos === null) {
    regresan = `Al reabrir, los vuelos que pasaron a ${s} regresan a ${m} y el mes vuelve a aceptar capturas.`;
  } else if (nDiferidos > 0) {
    regresan = `Al reabrir, ${nDiferidos === 1 ? "el vuelo que pasó" : `los ${nDiferidos} vuelos que pasaron`} a ${s} regresa${nDiferidos === 1 ? "" : "n"} a ${m} y el mes vuelve a aceptar capturas.`;
  } else {
    regresan = `Al reabrir, ${m} vuelve a aceptar capturas (ningún vuelo había pasado a ${s}).`;
  }
  return `${regresan} ${sMay} debe estar abierto.`;
}

export const MOTIVO_REABRIR_MIN = 5;
export const MOTIVO_REABRIR_MAX = 300;

/** Motivo de reabrir (5–300 tras recortar espacios): texto del error o null. */
export function validarMotivoReabrir(motivo: string): string | null {
  const t = motivo.trim();
  if (t.length < MOTIVO_REABRIR_MIN) return `Escribe el motivo (al menos ${MOTIVO_REABRIR_MIN} letras).`;
  if (t.length > MOTIVO_REABRIR_MAX) return `El motivo no puede pasar de ${MOTIVO_REABRIR_MAX} caracteres.`;
  return null;
}

/**
 * Una línea con los totales de la previa: «91 vuelos: 84 completados y 7
 * cancelados · 5 pasan a octubre 2026 ($16,199.76 USD por cobrar al 30-sep;
 * después se cobraron $16,199.76 USD) · 6 con $0 cierran aquí». Caso #351:
 * sin la segunda mitad, la línea hacía creer que los cinco de septiembre
 * seguían sin cobrar (se cobraron en octubre). La cifra es el total del API
 * (`pasan_cobrado_posterior_usd`); con 0 no se dice nada.
 */
export function resumenPrevia(previa: PreviaCierre): string {
  const t = previa.totales;
  const destino = sumarMeses(previa.periodo, 1) ?? "";
  const partes = [`${t.vuelos} vuelo${t.vuelos === 1 ? "" : "s"}: ${t.completados} completados y ${t.cancelados} cancelados`];
  if (t.pasan > 0) {
    const despues =
      t.pasan_cobrado_posterior_usd > 0
        ? `; después se cobraron ${fmtMonto(t.pasan_cobrado_posterior_usd, "USD")}`
        : "";
    partes.push(
      `${t.pasan} ${t.pasan === 1 ? "pasa" : "pasan"} a ${mesEnMinuscula(destino)} (${fmtMonto(t.pasan_por_cobrar_usd, "USD")} por cobrar al ${ultimoDiaCorto(previa.periodo)}${despues})`,
    );
  } else {
    partes.push(`ninguno pasa a ${mesEnMinuscula(destino)}`);
  }
  if (t.se_quedan_en_cero > 0) partes.push(`${t.se_quedan_en_cero} con $0 cierran aquí`);
  return partes.join(" · ");
}

/** Antes/después del reparto por avión (solo los que cambian ±0.01). */
export interface DeltaRepartoAvion {
  matricula: string;
  antes: number;
  despues: number;
  delta: number;
}

export function deltasReparto(reparto: PreviaCierre["reparto"]): DeltaRepartoAvion[] {
  if (!reparto) return [];
  const despues = new Map(reparto.despues.map((a) => [a.matricula, a.saldo_usd]));
  const out: DeltaRepartoAvion[] = [];
  for (const a of reparto.antes) {
    const d = despues.get(a.matricula) ?? a.saldo_usd;
    if (Math.abs(d - a.saldo_usd) >= 0.01) {
      out.push({ matricula: a.matricula, antes: a.saldo_usd, despues: d, delta: d - a.saldo_usd });
    }
  }
  return out;
}

/** Respuesta 409 `PREVIA_CAMBIO`: la previa nueva viene en `details`. */
export const CODIGO_PREVIA_CAMBIO = "PREVIA_CAMBIO";
export const TEXTO_PREVIA_CAMBIO =
  "La lista de vuelos cambió mientras revisabas: aquí está la nueva. Revísala y vuelve a confirmar.";

/**
 * `title` de un bloqueante de la previa que el API no pudo leer
 * (`lectura_fallida`, API 0.0.95): su conteo se pinta «sin verificar» con
 * `textoConteoPreCierre` y el mes no se cierra mientras siga así.
 */
export const TITULO_BLOQUEANTE_SIN_VERIFICAR =
  "El servidor no pudo leer este renglón: el mes no se puede cerrar hasta verificarlo. Cierra este cuadro y vuelve a abrirlo, o revísalo en el pre-cierre.";

export function previaDeDetails(details: unknown): PreviaCierre | null {
  if (!details || typeof details !== "object") return null;
  const d = details as { previa?: unknown };
  return normalizarPrevia(d.previa ?? details);
}

// =============================================================================
// CIERRE POR AVIÓN (23-oct-2026, API 0.0.104, invariante 105)
// =============================================================================

/**
 * Qué flujo ofrece el panel. `POR_AVION` solo con `por_avion: true` del API
 * (la migración `cierre_mes_avion` aplicada). Con un API previo, sin la
 * migración o sin respuesta ⇒ `GLOBAL`: el flujo de siempre desde la card
 * «Balance mensual», sin botones por avión; los tiles muestran el chip del
 * mes global.
 */
export type ModoCierre = "POR_AVION" | "GLOBAL";

export function modoCierreDelApi(cierres: Pick<CierresRespuesta, "por_avion"> | null | undefined): ModoCierre {
  return cierres?.por_avion === true ? "POR_AVION" : "GLOBAL";
}

/** El avión dentro del mes (null si el API no lo lista: sin fila y no activo, o API previo). */
export function estadoAvionDeMes(m: MesCierre | null | undefined, aeronaveId: string): MesCierreAvion | null {
  return m?.aviones?.find((a) => a.aeronave_id === aeronaveId) ?? null;
}

/** Los aviones ACTIVOS del mes que todavía no están cerrados (los que cierra «Cerrar <mes> (los N aviones abiertos)»). */
export function avionesAbiertosDeMes(m: MesCierre | null | undefined): MesCierreAvion[] {
  return (m?.aviones ?? []).filter((a) => a.activa && a.estado !== "CERRADO");
}

/** Los aviones del mes (activos o no) con fila CERRADO. */
export function avionesCerradosDeMes(m: MesCierre | null | undefined): MesCierreAvion[] {
  return (m?.aviones ?? []).filter((a) => a.estado === "CERRADO");
}

/**
 * Cuántos aviones ACTIVOS siguen abiertos: de la lista si viene; si no, de
 * los conteos `aviones_activos − aviones_cerrados`; sin nada ⇒ null.
 */
export function nAvionesAbiertos(m: MesCierre | null | undefined): number | null {
  if (!m) return null;
  if (m.aviones) return avionesAbiertosDeMes(m).length;
  if (typeof m.aviones_activos === "number" && typeof m.aviones_cerrados === "number") {
    return Math.max(0, m.aviones_activos - m.aviones_cerrados);
  }
  return null;
}

/**
 * Chip de la FLOTA en la card «Balance mensual»: «Abierto · 0 de 7»,
 * «Parcial · 3 de 7», «Cerrado», «Reabierto», «En curso (se cierra a partir
 * del 1-nov)»; el `title` lleva el detalle (quién y cuándo, o el conteo).
 * En modo GLOBAL (API previo) es el badge de siempre («Cerrado el 16-oct-2026
 * por Ale»…).
 */
export function resumenFlota(
  m: MesCierre | null,
  mes: string,
  enCurso: boolean,
  modo: ModoCierre = "POR_AVION",
): BadgeEstadoCierre {
  if (modo === "GLOBAL") return badgeEstadoCierre(m, mes, enCurso);
  const conteo = m ? textoAvionesCerrados(m) : null;
  const sufijo =
    m && typeof m.aviones_activos === "number" && typeof m.aviones_cerrados === "number"
      ? ` · ${m.aviones_cerrados} de ${m.aviones_activos}`
      : "";
  if (m?.estado === "CERRADO") {
    return { tono: "cerrado", texto: "Cerrado", title: [textoCerradoEl(m), conteo].filter(Boolean).join(" · ") };
  }
  if (enCurso) return badgeEnCurso(mes);
  if (m?.estado === "REABIERTO") {
    return { tono: "reabierto", texto: "Reabierto", title: [textoReabiertoEl(m), conteo].filter(Boolean).join(" · ") };
  }
  if (m?.estado === "PARCIAL") {
    return { tono: "parcial", texto: `Parcial${sufijo}`, title: conteo ?? "Algunos aviones del mes ya están cerrados" };
  }
  return { tono: "abierto", texto: `Abierto${sufijo}`, title: conteo ?? "Ningún avión cerrado" };
}

/** Badge del AVIÓN en su tile (misma forma que la fila del mes). Sin fila ⇒ null (nada que decir). */
export function badgeEstadoAvion(avion: MesCierreAvion | null, mes: string, enCurso: boolean): BadgeEstadoCierre | null {
  if (!avion) return null;
  return badgeEstadoCierre(avion, mes, enCurso);
}

/** ¿Se le OFRECE «Cerrar <mes>» en el tile de este avión? Rol + fila del avión no cerrada. */
export function puedeCerrarAvion(avion: MesCierreAvion | null | undefined, rol?: string | null): boolean {
  return !!avion && avion.estado !== "CERRADO" && puedeCerrarMes(rol);
}

/** ¿Se le OFRECE «Reabrir» en el tile de este avión? Rol + fila CERRADO. */
export function puedeReabrirAvion(avion: MesCierreAvion | null | undefined, rol?: string | null): boolean {
  return !!avion && avion.estado === "CERRADO" && puedeReabrirMes(rol);
}

/**
 * Por qué el tile NO ofrece cerrar ESTE avión (botón deshabilitado con el
 * texto): el código de su fila manda (`MES_ANTERIOR_ABIERTO` es por avión:
 * «N621TX: Para cerrar octubre 2026 primero cierra septiembre 2026.»); el
 * mes en curso es el mismo texto para todos; un `puede_cerrar:false` con un
 * código desconocido igual deshabilita.
 */
export function textoNoCerrableDeAvion(avion: MesCierreAvion, mes: string, enCurso: boolean): string | null {
  if (avion.estado === "CERRADO") return null;
  const motivo = enCurso && !avion.motivo_no_cerrable ? "MES_EN_CURSO" : avion.motivo_no_cerrable;
  if (motivo === "MES_EN_CURSO") return textoMotivoNoCerrable(motivo, mes);
  if (motivo) return `${avion.matricula}: ${textoMotivoNoCerrable(motivo, mes)}`;
  return avion.puede_cerrar ? null : `${avion.matricula}: ${etiquetaMes(mes)} todavía no se puede cerrar.`;
}

/** Alcance de un cierre/reapertura: UN avión o, con null, toda la flota (los activos abiertos). */
export interface AlcanceCierre {
  aeronaveId: string;
  matricula: string;
}

/**
 * `vuelos_esperados` de un alcance = los ids que la previa MOSTRÓ (pasan +
 * se quedan, ya limitados por el API a los vuelos que tocan el alcance;
 * incluye los «decididos» por otro avión, que viajan en `vuelos_incluidos`).
 */
export function vuelosEsperadosDeAlcance(previa: Pick<PreviaCierre, "vuelos_que_pasan" | "vuelos_incluidos">): string[] {
  return idsVistosEnPrevia(previa);
}

/** «N4142R, N58BT y N621TX» (es-MX: coma y «y»). */
export function listaMatriculas(matriculas: readonly string[]): string {
  const l = matriculas.filter((m) => typeof m === "string" && m.trim()).map((m) => m.trim());
  if (l.length === 0) return "";
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(", ")} y ${l[l.length - 1]}`;
}

export const AYUDA_CIERRE_AVION =
  "El cierre es por avión y por mes completo, en orden: elige «Mes pasado», revisa el pre-cierre y cierra cada avión desde su tile, o todos los abiertos desde aquí. Al cerrar un avión, sus vuelos completados sin cobro completo al último día del mes pasan completos al mes siguiente (venta, gastos del vuelo y comisiones; las horas se quedan en su fecha real) y ese avión queda bloqueado para capturas en ese mes. Con toda la flota cerrada, el mes queda cerrado.";

/** «Cerrar septiembre 2026 (los 3 aviones abiertos)» / «… (el avión abierto)»; sin conteo, «Cerrar septiembre 2026». */
export function etiquetaBotonCerrarFlota(mes: string, nAbiertos: number | null): string {
  const base = etiquetaBotonCerrar(mes);
  if (nAbiertos === null || nAbiertos <= 0) return base;
  return nAbiertos === 1 ? `${base} (el avión abierto)` : `${base} (los ${nAbiertos} aviones abiertos)`;
}

/** «Reabrir mes» con la flota cerrada; en un mes parcial, «Reabrir los 3 aviones cerrados» / «Reabrir el avión cerrado». */
export function etiquetaBotonReabrirFlota(estado: EstadoCierreMes, nCerrados: number | null): string {
  if (estado === "CERRADO" || nCerrados === null || nCerrados <= 0) return ETIQUETA_BOTON_REABRIR;
  return nCerrados === 1 ? "Reabrir el avión cerrado" : `Reabrir los ${nCerrados} aviones cerrados`;
}

/** Título del diálogo y nombre accesible del botón del tile: «Cerrar septiembre 2026 · N621TX». */
export function tituloCerrarAvion(mes: string, matricula: string): string {
  return `${etiquetaBotonCerrar(mes)} · ${matricula}`;
}

/** «N621TX · septiembre 2026 cerrado» (estado corto del avión). */
export function tituloAvionCerrado(mes: string, matricula: string): string {
  return `${matricula} · ${mesEnMinuscula(mes)} cerrado`;
}

/** Línea del alcance de una previa de la flota: «Cierra N4142R, N58BT y N621TX (3 aviones abiertos).» */
export function textoAlcancePrevia(previa: Pick<PreviaCierre, "aeronave" | "aviones_alcance">): string | null {
  if (previa.aeronave) return null;
  const l = (previa.aviones_alcance ?? []).map((a) => a.matricula);
  if (l.length === 0) return null;
  return l.length === 1
    ? `Cierra ${l[0]} (el único avión abierto).`
    : `Cierra ${listaMatriculas(l)} (${l.length} aviones abiertos).`;
}

export function textoCheckboxCerrarAvion(mes: string, matricula: string): string {
  return `Entiendo que ${matricula} quedará bloqueado para capturas en ${mesEnMinuscula(mes)}`;
}

/** Descripción del diálogo de cierre de UN avión (misma regla que la global, acotada al avión). */
export function textoDescripcionCerrarAvion(mes: string, destino: string, matricula: string): string {
  return `Al cerrar, ${matricula} queda bloqueado para capturas de ${mesEnMinuscula(mes)} (gastos, cobros, ingresos, caja chica y cotizaciones que toquen a este avión). Sus vuelos que no estén cobrados completos al ${ultimoDiaCorto(mes)} pasan completos a ${mesEnMinuscula(destino)}, también los que se cobraron después de esa fecha: su dinero cuenta en ese mes. Un vuelo compartido con otro avión pasa entero.`;
}

/** Toast tras cerrar UN avión: «N621TX · septiembre 2026 cerrado. 2 vuelos pasan a octubre 2026.» */
export function textoToastCerradoAvion(mes: string, matricula: string, n: number, destino: string, incluidos = 0): string {
  return `${matricula} · ${textoToastCerrado(mes, n, destino, incluidos)[0].toLowerCase()}${textoToastCerrado(mes, n, destino, incluidos).slice(1)}`;
}

/** Toast tras cerrar la FLOTA: «Septiembre 2026 cerrado (N4142R, N58BT y N621TX). 5 vuelos pasan a octubre 2026.»; sin matrículas, el de siempre. */
export function textoToastCerradoFlota(
  mes: string,
  cerrados: readonly string[],
  n: number,
  destino: string,
  incluidos = 0,
): string {
  const base = textoToastCerrado(mes, n, destino, incluidos);
  if (cerrados.length === 0) return base;
  return base.replace(`${etiquetaMes(mes)} cerrado.`, `${etiquetaMes(mes)} cerrado (${listaMatriculas(cerrados)}).`);
}

/**
 * El cierre de la flota falló A MEDIAS (regla 7): «Se cerraron N621TX y
 * N58BT; XB-ANU no: <message del API>». Sin saber cuál falló: «Se cerraron
 * N621TX y N58BT; el siguiente no: …».
 */
export function textoCierreFlotaParcial(cerrados: readonly string[], fallo: string | null, error: string): string {
  const quien = fallo ? `${fallo} no` : "el siguiente no";
  const detalle = error.trim() ? `: ${error.trim()}` : ".";
  const verbo = cerrados.length === 1 ? "Se cerró" : "Se cerraron";
  return `${verbo} ${listaMatriculas(cerrados)}; ${quien}${detalle}`;
}

export function tituloReabrirAvion(mes: string, matricula: string): string {
  return `¿Reabrir ${mesEnMinuscula(mes)} · ${matricula}?`;
}

/**
 * Confirmación de reabrir UN avión: «Al reabrir N621TX, los 2 vuelos que
 * pasaron a octubre 2026 regresan a septiembre 2026 y el avión vuelve a
 * aceptar capturas en ese mes. Octubre 2026 de N621TX debe estar abierto.»
 */
export function textoConfirmacionReabrirAvion(mes: string, matricula: string, nDiferidos: number | null): string {
  const sig = sumarMeses(mes, 1);
  const m = mesEnMinuscula(mes);
  const s = sig ? mesEnMinuscula(sig) : "el mes siguiente";
  const sMay = sig ? etiquetaMes(sig) : "El mes siguiente";
  let regresan: string;
  if (nDiferidos === null) {
    regresan = `Al reabrir ${matricula}, sus vuelos que pasaron a ${s} regresan a ${m} y el avión vuelve a aceptar capturas en ese mes.`;
  } else if (nDiferidos > 0) {
    regresan = `Al reabrir ${matricula}, ${nDiferidos === 1 ? "el vuelo que pasó" : `los ${nDiferidos} vuelos que pasaron`} a ${s} regresa${nDiferidos === 1 ? "" : "n"} a ${m} y el avión vuelve a aceptar capturas en ese mes.`;
  } else {
    regresan = `Al reabrir ${matricula}, el avión vuelve a aceptar capturas en ${m} (ningún vuelo suyo había pasado a ${s}).`;
  }
  return `${regresan} ${sMay} de ${matricula} debe estar abierto.`;
}

/** Toast tras reabrir UN avión: «N621TX · septiembre 2026 reabierto. 2 vuelos regresan a septiembre 2026.» */
export function textoToastReabiertoAvion(mes: string, matricula: string, revertidos: number): string {
  const m = mesEnMinuscula(mes);
  if (revertidos === 0) return `${matricula} · ${m} reabierto. Ningún vuelo regresa; el avión vuelve a aceptar capturas.`;
  return `${matricula} · ${m} reabierto. ${revertidos} vuelo${revertidos === 1 ? "" : "s"} regresa${revertidos === 1 ? "" : "n"} a ${m}.`;
}

/** 409 al reabrir un avión (regla 2): otro avión CERRADO comparte un vuelo que pasó de mes. */
export const CODIGO_OTRO_AVION_CERRADO = "OTRO_AVION_CERRADO";

/** Las matrículas de `details` del 409 (`matriculas`, `aviones[]` o `cerrados`), en el orden del API. */
export function matriculasOtroAvionCerrado(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  const d = details as { matriculas?: unknown; aviones?: unknown; cerrados?: unknown };
  return matriculasDe(d.matriculas ?? d.aviones ?? d.cerrados);
}

/**
 * «Primero reabre N58BT: comparte con N621TX un vuelo que pasó de mes al
 * cerrar.» Sin matrículas legibles ⇒ null (se usa el `message` del API).
 */
export function textoOtroAvionCerrado(details: unknown, matricula: string | null): string | null {
  const l = matriculasOtroAvionCerrado(details);
  if (l.length === 0) return null;
  const comparte = l.length === 1 ? "comparte" : "comparten";
  const con = matricula ? ` con ${matricula}` : "";
  return `Primero reabre ${listaMatriculas(l)}: ${comparte}${con} un vuelo que pasó de mes al cerrar.`;
}

/** Nota bajo la matrícula de un vuelo multi-avión: «compartido con N58BT (abierto)». Sin otros aviones ⇒ null. */
export function notaMultiAvion(v: Pick<VueloDiferido, "multi_avion" | "otros_aviones">): string | null {
  const otros = (v.otros_aviones ?? []).filter((o) => o && typeof o.matricula === "string" && o.matricula.trim());
  if (!v.multi_avion && otros.length === 0) return null;
  if (otros.length === 0) return "compartido con otro avión";
  const estado = (e: EstadoCierreAvion) => (e === "CERRADO" ? "cerrado" : e === "REABIERTO" ? "reabierto" : "abierto");
  return `compartido con ${listaMatriculas(otros.map((o) => `${o.matricula} (${estado(o.estado)})`))}`;
}

/** Tooltip de la casilla «Se queda» bloqueada: «Se queda en septiembre 2026 (decidido al cerrar N58BT)». */
export function textoDecididoPor(mes: string, v: Pick<VueloDiferido, "decidido_por">): string | null {
  const por = v.decidido_por?.matricula;
  if (!por) return null;
  return `Se queda en ${mesEnMinuscula(mes)} (decidido al cerrar ${por})`;
}

export const TITULO_BLOQUEANTES_OTROS_AVIONES = "Bloqueantes de otros aviones (no impiden este cierre)";

// =============================================================================
// Chips y marcas (copiadas del API) en reparto, balances, pre-cierre y vuelo
// =============================================================================

export type TonoMarcaCierre = "pasa" | "viene" | "pasaria";

/** El tono del chip por el ARRANQUE del texto del API; otro texto ⇒ null (no se pinta). */
export function tonoMarcaCierre(marca: string | null | undefined): TonoMarcaCierre | null {
  const t = (marca ?? "").trim();
  if (!t) return null;
  // «Pasará a octubre 2026 al cerrar…» (pre-cierre) ANTES que «Pasa a…»
  // (`\b` de JS es ASCII: la «á» no es letra para él).
  if (/^pasar[aá](\s|$)/i.test(t)) return "pasaria";
  if (/^pasa\s/i.test(t)) return "pasa";
  if (/^viene\s/i.test(t)) return "viene";
  if (/^pendiente de cobro\b/i.test(t)) return "pasaria";
  return null;
}

/** Listas de diferidos de `cierre` (reparto y balances usan nombres distintos). */
export function listasDiferidos(cierre: CierrePeriodoAditivo | null | undefined): {
  salen: VueloDiferidoMarca[];
  entran: VueloDiferidoMarca[];
  pasarian: VueloDiferidoMarca[];
} {
  return {
    salen: cierre?.diferidos_salen ?? cierre?.pasan ?? [],
    entran: cierre?.diferidos_entran ?? cierre?.vienen ?? [],
    pasarian: cierre?.pendientes_que_pasarian ?? cierre?.pasarian ?? [],
  };
}

/** Los de un avión (sin matrícula en el elemento ⇒ se queda fuera). */
export function diferidosDelAvion(lista: readonly VueloDiferidoMarca[], matricula: string): VueloDiferidoMarca[] {
  return lista.filter((v) => v.matricula === matricula);
}

/**
 * Badge del periodo en el reparto, el pre-cierre y los balances: «Cerrado el
 * 16-oct por Ale» / «Reabierto» / «Abierto» / «Parcial» (cierre por avión:
 * el `title` nombra los aviones cerrados, `aviones_cerrados`). En el balance
 * por avión `estado` es el del AVIÓN y `estado_flota` va al `title`.
 */
export function textoBadgeCierrePeriodo(cierre: CierrePeriodoAditivo | null | undefined): BadgeEstadoCierre | null {
  if (!cierre || !cierre.disponible || !cierre.periodo) return null;
  const flota = cierre.estado_flota ? textoEstadoFlota(cierre.estado_flota, cierre.aviones_cerrados) : null;
  const conFlota = (b: BadgeEstadoCierre): BadgeEstadoCierre => (flota ? { ...b, title: `Toda la flota: ${flota}` } : b);
  if (cierre.estado === "CERRADO") {
    const por = cierre.cerrado_por_nombre ? ` por ${cierre.cerrado_por_nombre}` : "";
    return conFlota({ tono: "cerrado", texto: `Cerrado el ${fechaCortaCancun(cierre.cerrado_at)}${por}` });
  }
  if (cierre.estado === "REABIERTO") return conFlota({ tono: "reabierto", texto: "Reabierto" });
  if (cierre.estado === "PARCIAL") {
    const lista = (cierre.aviones_cerrados ?? []).filter((m) => typeof m === "string" && m.trim());
    const n = lista.length;
    return {
      tono: "parcial",
      texto: n > 0 ? `Parcial · ${n} avi${n === 1 ? "ón" : "ones"}` : "Parcial",
      title: n > 0 ? `Cerrados: ${listaMatriculas(lista)}` : "Algunos aviones del mes ya están cerrados",
    };
  }
  return conFlota({ tono: "abierto", texto: "Abierto" });
}

/** «Parcial (cerrados: N621TX, N58BT)» / «Cerrada» / «Reabierta» / «Abierta» para el `title`. */
function textoEstadoFlota(estado: EstadoCierreMes, cerrados: string[] | undefined): string {
  switch (estado) {
    case "CERRADO":
      return "cerrada";
    case "REABIERTO":
      return "reabierta";
    case "PARCIAL": {
      const lista = (cerrados ?? []).filter((m) => typeof m === "string" && m.trim());
      return lista.length > 0 ? `parcial (cerrados: ${listaMatriculas(lista)})` : "parcial";
    }
    default:
      return "abierta";
  }
}

/**
 * Badge del cierre de UN avión (`cierre_avion`, API 0.0.104) en las cards
 * del reparto y en la pantalla por avión: «Abierto» / «Cerrado el 16-oct por
 * Ale» / «Reabierto». Sin el bloque (API previo) ⇒ null.
 */
export function badgeCierreAvion(cierreAvion: CierreAvionAditivo | null | undefined): BadgeEstadoCierre | null {
  if (!cierreAvion || typeof cierreAvion !== "object") return null;
  if (cierreAvion.estado === "CERRADO") {
    const por = cierreAvion.cerrado_por_nombre ? ` por ${cierreAvion.cerrado_por_nombre}` : "";
    return { tono: "cerrado", texto: `Cerrado el ${fechaCortaCancun(cierreAvion.cerrado_at)}${por}` };
  }
  if (cierreAvion.estado === "REABIERTO") return { tono: "reabierto", texto: "Reabierto" };
  if (cierreAvion.estado === "ABIERTO") return { tono: "abierto", texto: "Abierto" };
  return null;
}

/**
 * El badge que ve la pantalla de UN avión: el de ESE avión cuando el API lo
 * manda (`cierre.cierre_avion` o `aviones[].cierre_avion`), si no el global
 * del mes (API previo). Con un bloque global sin `periodo` (rango que no es
 * un mes) no hay badge.
 */
export function badgeCierreDelAvion(
  cierre: CierrePeriodoAditivo | null | undefined,
  cierreAvion?: CierreAvionAditivo | null,
): BadgeEstadoCierre | null {
  if (!cierre || !cierre.disponible || !cierre.periodo) return null;
  return badgeCierreAvion(cierre.cierre_avion ?? cierreAvion) ?? textoBadgeCierrePeriodo(cierre);
}

/**
 * ¿Los números de hoy ya no coinciden con lo congelado? Global: con la flota
 * cerrada o parcial (`coincide_con_snapshot` = AND de los aviones cerrados).
 * Por avión: con su propio `coincide_con_snapshot`.
 */
export function noCoincideSnapshot(
  cierre: Pick<CierrePeriodoAditivo, "estado" | "coincide_con_snapshot"> | null | undefined,
): boolean {
  if (!cierre) return false;
  return (cierre.estado === "CERRADO" || cierre.estado === "PARCIAL") && cierre.coincide_con_snapshot === false;
}

export function noCoincideSnapshotAvion(cierreAvion: CierreAvionAditivo | null | undefined): boolean {
  return cierreAvion?.estado === "CERRADO" && cierreAvion.coincide_con_snapshot === false;
}

/*
 * Títulos de las listas del reparto. Caso #351 (16-oct-2026): un vuelo que
 * pasa de mes NO siempre está «pendiente de cobro» (los de septiembre
 * cobrados en octubre pasan igual), así que se dice lo que es cierto de
 * todos: no tenían el cobro completo al corte. Mismo texto que el PDF y el
 * Excel del reparto (pyservices).
 */
export function tituloBloquePasan(destino: string | null | undefined): string {
  if (!destino) return "Pasan al mes siguiente (no se reparten)";
  const corte = corteCortoDeDestino(destino);
  return corte
    ? `Pasan a ${mesEnMinuscula(destino)} (sin cobro completo al ${corte}, no se reparten)`
    : `Pasan a ${mesEnMinuscula(destino)} (no se reparten)`;
}

export function tituloBloqueVienen(origen: string | null | undefined): string {
  return origen ? `Vienen de ${mesEnMinuscula(origen)}` : "Vienen de meses anteriores";
}

export function tituloBloquePasarian(destino: string | null | undefined): string {
  if (!destino) return "Pasarán al mes siguiente al cerrar el mes";
  const corte = corteCortoDeDestino(destino);
  return corte
    ? `Pasarán a ${mesEnMinuscula(destino)} al cerrar el mes (sin cobro completo al ${corte})`
    : `Pasarán a ${mesEnMinuscula(destino)} al cerrar el mes`;
}

/** Aviso rojo del reparto cuando `coincide_con_snapshot === false`. */
export function textoNoCoincideSnapshot(cerradoAt: string | null | undefined): string {
  return `Los números de hoy no coinciden con el cierre del ${fechaCortaCancun(cerradoAt)} (cambió un porcentaje o un tipo de cambio): reabre y vuelve a cerrar.`;
}

/**
 * «#316» del elemento: el reparto manda `folio` numérico; los balances pueden
 * mandarlo como texto («316» o «#316») o solo la `clave`. Sin nada ⇒ «vuelo».
 */
export function folioDiferido(v: Pick<VueloDiferidoMarca, "folio" | "clave">): string {
  if (typeof v.folio === "number") return v.folio > 0 ? `#${v.folio}` : "vuelo";
  const f = typeof v.folio === "string" ? v.folio.trim() : "";
  if (f) return f.startsWith("#") ? f : `#${f}`;
  const c = typeof v.clave === "string" ? v.clave.trim() : "";
  return c ? (c.split(" · ")[0] ?? c) : "vuelo";
}

/** Una línea por vuelo diferido: «#316 · Mike Nelson · N990GG · US$2,076.40». */
export function lineaDiferido(v: VueloDiferidoMarca): string {
  const partes = [folioDiferido(v)];
  if (v.cliente) partes.push(v.cliente);
  if (v.matricula) partes.push(v.matricula);
  if (typeof v.venta_usd === "number") partes.push(fmtMonto(v.venta_usd, "USD"));
  return partes.join(" · ");
}

/** Chips del detalle del vuelo: «Viene de septiembre 2026» / «Pasa a octubre 2026» / «Mes cerrado». */
export function chipsCierreVuelo(
  cierre: { diferido_de?: string | null; diferido_a?: string | null; mes_cerrado?: boolean; cierre?: { cerrado_por_nombre?: string | null; cerrado_at?: string | null } | null } | null | undefined,
): { tono: TonoMarcaCierre | "cerrado"; texto: string; title?: string }[] {
  if (!cierre) return [];
  const out: { tono: TonoMarcaCierre | "cerrado"; texto: string; title?: string }[] = [];
  // Caso #351: el title no dice «pendiente de cobro» (un vuelo cobrado
  // después del corte también pasa); dice lo que es cierto de todos.
  if (cierre.diferido_de) {
    const de = mesEnMinuscula(cierre.diferido_de);
    const corte = esMesValido(cierre.diferido_de) ? ultimoDiaCorto(cierre.diferido_de) : null;
    out.push({
      tono: "viene",
      texto: `Viene de ${de}`,
      title: corte
        ? `Sin cobro completo al ${corte} (cierre de ${de}): su dinero cuenta en el mes al que pasó.`
        : `Sin cobro completo al cerrar ${de}: su dinero cuenta en el mes al que pasó.`,
    });
  }
  if (cierre.diferido_a) {
    const a = mesEnMinuscula(cierre.diferido_a);
    const corte = corteCortoDeDestino(cierre.diferido_a);
    out.push({
      tono: "pasa",
      texto: `Pasa a ${a}`,
      title: corte
        ? `Sin cobro completo al ${corte}: su dinero cuenta en ${a}.`
        : `Sin cobro completo al cierre: su dinero cuenta en ${a}.`,
    });
  }
  if (cierre.mes_cerrado) {
    const c = cierre.cierre;
    const por = c?.cerrado_por_nombre ? ` por ${c.cerrado_por_nombre}` : "";
    out.push({
      tono: "cerrado",
      texto: "Mes cerrado",
      title: `Cerrado el ${fechaCortaCancun(c?.cerrado_at)}${por}: cobros y gastos de este vuelo ya no se capturan. Reábrelo en Reportes para corregir.`,
    });
  }
  return out;
}

// =============================================================================
// Pre-cierre: la leyenda de cada vuelo (`cobros_pendientes`, `vuelos_que_vienen`)
// =============================================================================

export const CLAVE_PRECIERRE_VUELOS_QUE_VIENEN = "vuelos_que_vienen";
export const MAX_LEYENDAS_PRECIERRE = 8;

/** Lo mínimo de un vuelo del pre-cierre para su leyenda (aditivo, API 0.0.88). */
export interface VueloLeyendaPreCierre {
  id: string;
  folio: number;
  leyenda?: string | null;
}

/**
 * Una línea por vuelo con `leyenda` del API («#388 · Pendiente de cobro:
 * pasará a noviembre 2026 al cerrar (cobrado $0.00 de $2,076.40 USD)» o, ya
 * cobrado después del corte, «#351 · Pasará a octubre 2026 al cerrar ·
 * cobrado el 14-oct, después del 30-sep (…)»), tope `max` y «y N más» contra
 * el `count` del renglón (el API puede topar la lista). Sin leyendas (API
 * previo) ⇒ ninguna línea: el renglón se pinta como siempre.
 */
export function lineasLeyendaPreCierre(
  vuelos: readonly VueloLeyendaPreCierre[] | null | undefined,
  count?: number | null,
  max: number = MAX_LEYENDAS_PRECIERRE,
): { lineas: { id: string; folio: string; texto: string; tono: TonoMarcaCierre | null }[]; restantes: number } {
  const con = (vuelos ?? []).filter((v) => typeof v.leyenda === "string" && v.leyenda.trim() !== "");
  if (con.length === 0) return { lineas: [], restantes: 0 };
  const lineas = con.slice(0, max).map((v) => ({
    id: v.id,
    folio: v.folio > 0 ? `#${v.folio}` : "vuelo",
    texto: (v.leyenda as string).trim(),
    tono: tonoMarcaCierre(v.leyenda),
  }));
  const total = Math.max(con.length, typeof count === "number" && Number.isFinite(count) ? count : 0);
  return { lineas, restantes: Math.max(0, total - lineas.length) };
}

// =============================================================================
// Balance en pantalla: chips de una línea junto al título del libro
// =============================================================================

/**
 * «5 pasan a octubre 2026» / «5 vienen de septiembre 2026» / «4 pasarían a
 * noviembre 2026 al cerrar» (conteos de las listas del API; el detalle de cada
 * vuelo está en las celdas del libro). El `title` lista los folios.
 */
export function chipsResumenDiferidos(
  cierre: CierrePeriodoAditivo | null | undefined,
): { tono: TonoMarcaCierre; texto: string; title: string }[] {
  if (!cierre || !cierre.disponible) return [];
  const { salen, entran, pasarian } = listasDiferidos(cierre);
  const folios = (l: VueloDiferidoMarca[]) => l.map(folioDiferido).join(", ");
  const mes = (m: string | undefined, alt: string) => (m && esMesValido(m) ? mesEnMinuscula(m) : alt);
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  // Caso #351: «sin cobro completo al 30-sep» (cierto de todos los que pasan,
  // también de los que ya se cobraron después). El corte: el del API
  // (`corte`, balances 0.0.91) o, sin él, el último día del mes anterior al
  // destino.
  const alCorte = (l: VueloDiferidoMarca[]) => {
    const c = diaCortoDeDia(l.find((v) => typeof v.corte === "string")?.corte) ?? corteCortoDeDestino(l[0]?.destino);
    return c ? `al ${c}` : "al cierre";
  };
  const out: { tono: TonoMarcaCierre; texto: string; title: string }[] = [];
  if (salen.length > 0) {
    out.push({
      tono: "pasa",
      texto: `${n(salen.length, "pasa", "pasan")} a ${mes(salen[0].destino, "el mes siguiente")}`,
      title: `Sin cobro completo ${alCorte(salen)}: no suman en este mes (${folios(salen)}).`,
    });
  }
  if (entran.length > 0) {
    out.push({
      tono: "viene",
      texto: `${n(entran.length, "viene", "vienen")} de ${mes(entran[0].origen, "meses anteriores")}`,
      title: `Vuelos de meses anteriores sin cobro completo al cerrar su mes: suman completos aquí (${folios(entran)}).`,
    });
  }
  if (pasarian.length > 0) {
    out.push({
      tono: "pasaria",
      texto: `${n(pasarian.length, "pasaría", "pasarían")} a ${mes(pasarian[0].destino, "el mes siguiente")} al cerrar`,
      title: `Sin cobro completo ${alCorte(pasarian)}: si el mes se cierra hoy, pasan completos al mes siguiente (${folios(pasarian)}).`,
    });
  }
  return out;
}
