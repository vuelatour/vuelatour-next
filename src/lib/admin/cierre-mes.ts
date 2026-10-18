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
 */
import type {
  CierrePeriodoAditivo,
  CierresRespuesta,
  MesCierre,
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

const ESTADOS = new Set(["ABIERTO", "CERRADO", "REABIERTO"]);
const MOTIVOS = new Set([
  "MES_EN_CURSO",
  "MES_ANTERIOR_ABIERTO",
  "YA_CERRADO",
  "PRECIERRE_NO_LISTO",
  "PERIODO_ANTES_DEL_INICIO",
]);

function normalizarMes(raw: unknown): MesCierre | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!esMesValido(m.periodo as string)) return null;
  const estado = typeof m.estado === "string" && ESTADOS.has(m.estado) ? m.estado : "ABIERTO";
  const motivo =
    typeof m.motivo_no_cerrable === "string" && MOTIVOS.has(m.motivo_no_cerrable)
      ? (m.motivo_no_cerrable as MotivoNoCerrable)
      : null;
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
  };
}

/** Lectura DEFENSIVA de la previa: forma mínima o null. */
export function normalizarPrevia(raw: unknown): PreviaCierre | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!esMesValido(p.periodo as string) || typeof p.listo !== "boolean") return null;
  const lista = (v: unknown): VueloDiferido[] =>
    Array.isArray(v) ? v.filter((x): x is VueloDiferido => !!x && typeof x === "object" && "id" in x) : [];
  const motivo =
    typeof p.motivo_no_cerrable === "string" && MOTIVOS.has(p.motivo_no_cerrable)
      ? (p.motivo_no_cerrable as MotivoNoCerrable)
      : null;
  const t = (p.totales && typeof p.totales === "object" ? p.totales : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof t[k] === "number" ? (t[k] as number) : 0);
  return {
    periodo: p.periodo as string,
    estado: typeof p.estado === "string" && ESTADOS.has(p.estado) ? (p.estado as PreviaCierre["estado"]) : "ABIERTO",
    listo: p.listo,
    motivo_no_cerrable: motivo,
    texto_no_cerrable:
      typeof p.texto_no_cerrable === "string" && p.texto_no_cerrable.trim() !== "" ? p.texto_no_cerrable.trim() : null,
    bloqueantes: Array.isArray(p.bloqueantes) ? (p.bloqueantes as PreviaCierre["bloqueantes"]) : [],
    vuelos_que_pasan: lista(p.vuelos_que_pasan),
    vuelos_que_vienen: lista(p.vuelos_que_vienen),
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

export type TonoEstadoCierre = "abierto" | "cerrado" | "reabierto" | "en-curso";

export interface BadgeEstadoCierre {
  tono: TonoEstadoCierre;
  texto: string;
}

/**
 * «Abierto» · «Cerrado el 16-oct-2026 por Ale» · «Reabierto el 17-oct-2026 por
 * Ale (motivo)» · «En curso (se cierra a partir del 1-nov)». Un mes cerrado
 * manda aunque sea el mes en curso (imposible hoy; se deja explícito).
 */
export function badgeEstadoCierre(m: MesCierre | null, mes: string, enCurso: boolean): BadgeEstadoCierre {
  if (m?.estado === "CERRADO") {
    const por = m.cerrado_por?.nombre ? ` por ${m.cerrado_por.nombre}` : "";
    return { tono: "cerrado", texto: `Cerrado el ${fechaCortaCancun(m.cerrado_at)}${por}` };
  }
  if (enCurso) {
    const sig = sumarMeses(mes, 1);
    return {
      tono: "en-curso",
      texto: sig ? `En curso (se cierra a partir del 1-${MESES_CORTOS[Number(sig.slice(5, 7)) - 1]})` : "En curso",
    };
  }
  if (m?.estado === "REABIERTO") {
    const por = m.reabierto_por?.nombre ? ` por ${m.reabierto_por.nombre}` : "";
    const motivo = m.reabierto_motivo ? ` (${m.reabierto_motivo})` : "";
    return { tono: "reabierto", texto: `Reabierto el ${fechaCortaCancun(m.reabierto_at)}${por}${motivo}` };
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
export function mensajeErrorCierre(r: RespuestaAccionCierre, accion: "cerrar" | "reabrir", mes: string): string {
  const m = mesEnMinuscula(mes);
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
    return `No hubo respuesta del servidor. Recarga la página para ver si ${m} ${hecho} antes de volver a intentarlo.`;
  }
  return (r.error ?? "").trim();
}

export type DecisionRespuestaCerrar =
  | { tipo: "exito"; diferidos: number }
  | { tipo: "previa_nueva"; previa: PreviaCierre }
  | { tipo: "error"; texto: string };

/**
 * Qué hace el diálogo con la respuesta de `cerrarMesAction`: éxito (toast y
 * refresca), `PREVIA_CAMBIO` con la previa nueva (repinta, desmarca la
 * casilla) o el error con su texto. Cualquier rechazo deja la pantalla vieja
 * ⇒ el diálogo refresca al cerrarse.
 */
export function decidirRespuestaCerrar(
  r: RespuestaAccionCierre & { data?: { diferidos?: unknown[] } | null },
  mes: string,
): DecisionRespuestaCerrar {
  if (r.ok && r.data) return { tipo: "exito", diferidos: Array.isArray(r.data.diferidos) ? r.data.diferidos.length : 0 };
  if (r.code === CODIGO_PREVIA_CAMBIO) {
    const nueva = previaDeDetails(r.details);
    if (nueva) return { tipo: "previa_nueva", previa: nueva };
  }
  return { tipo: "error", texto: mensajeErrorCierre(r, "cerrar", mes) };
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

/** Toast tras cerrar: «Septiembre 2026 cerrado. 5 vuelos pasan a octubre 2026.» */
export function textoToastCerrado(mes: string, n: number, destino: string): string {
  return `${etiquetaMes(mes)} cerrado. ${fraseVuelosPasan(n, destino)}`;
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
 * debe estar abierto.» (con 0 diferidos se omite la primera parte).
 */
export function textoConfirmacionReabrir(mes: string, nDiferidos: number | null): string {
  const sig = sumarMeses(mes, 1);
  const m = mesEnMinuscula(mes);
  const s = sig ? mesEnMinuscula(sig) : "el mes siguiente";
  const sMay = sig ? etiquetaMes(sig) : "El mes siguiente";
  const regresan =
    nDiferidos && nDiferidos > 0
      ? `Al reabrir, ${nDiferidos === 1 ? "el vuelo que pasó" : `los ${nDiferidos} vuelos que pasaron`} a ${s} regresa${nDiferidos === 1 ? "" : "n"} a ${m} y el mes vuelve a aceptar capturas.`
      : `Al reabrir, ${m} vuelve a aceptar capturas (ningún vuelo había pasado a ${s}).`;
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

export function previaDeDetails(details: unknown): PreviaCierre | null {
  if (!details || typeof details !== "object") return null;
  const d = details as { previa?: unknown };
  return normalizarPrevia(d.previa ?? details);
}

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

/** Badge del periodo en el reparto: «Cerrado el 16-oct por Ale» / «Reabierto» / «Abierto». */
export function textoBadgeCierrePeriodo(cierre: CierrePeriodoAditivo | null | undefined): BadgeEstadoCierre | null {
  if (!cierre || !cierre.disponible || !cierre.periodo) return null;
  if (cierre.estado === "CERRADO") {
    const por = cierre.cerrado_por_nombre ? ` por ${cierre.cerrado_por_nombre}` : "";
    return { tono: "cerrado", texto: `Cerrado el ${fechaCortaCancun(cierre.cerrado_at)}${por}` };
  }
  if (cierre.estado === "REABIERTO") return { tono: "reabierto", texto: "Reabierto" };
  return { tono: "abierto", texto: "Abierto" };
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
