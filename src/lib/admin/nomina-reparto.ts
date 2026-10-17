/**
 * Nómina: reparto en PARTES IGUALES entre aviones (16-oct-2026, API 0.0.90) —
 * FUENTE ÚNICA PURA del diálogo «Repartir entre aviones» y del resumen
 * «Repartido / Sin repartir / Por avión» de `/admin/nomina` (sin React ni red;
 * prueba `__tests__/nomina-reparto.test.ts`).
 *
 * Decisión del cliente (16-oct-2026): la nómina ya NO sale en Gastos; se suma
 * por mes o quincena y se reparte en PARTES IGUALES entre los aviones que se
 * elijan, por lotes o todo de una vez. Cada pago se reparte por separado y el
 * residuo de centavos rota (lo decide el API). Solo la nómina repartida cuenta
 * en los libros.
 *
 * Aquí NO se calcula ningún monto del reparto: la vista previa y el resultado
 * son los de `POST /v1/expenses/reparto-iguales` (con `simular: true` para la
 * vista previa). Lo único que se suma son montos YA registrados (los del
 * gasto y sus partes guardadas), en CENTAVOS y por moneda (`nomina.ts`).
 */
import { fmtDateOnly } from "@/lib/datetime";
import { esUuid } from "@/lib/admin/url-params";
import {
  centavosDeMonto,
  montoNomina,
  quincenaDeFecha,
  totalesPorMoneda,
  type PorMoneda,
} from "@/lib/admin/nomina";
import type {
  CuerpoRepartoIguales,
  RespuestaRepartoIguales,
} from "@/types/reparto-iguales";

// ═══════════════════════════════ Topes (espejo del DTO del API) ═══════════════════════════════

export const TOPE_GASTOS_REPARTO_IGUALES = 200;
export const TOPE_AVIONES_REPARTO_IGUALES = 20;

/** Ruta del API. */
export const RUTA_REPARTO_IGUALES = "/v1/expenses/reparto-iguales";

/** Roles que reparten (espejo del `@Roles` de la ruta). */
export const ROLES_REPARTO_NOMINA = ["ADMIN", "COORDINADOR", "FACTURACION"] as const;

/** ¿Este rol ve el botón «Repartir entre aviones»? Sin rol ⇒ se ofrece (el API es el candado). */
export function puedeRepartirNomina(rol: string | null | undefined): boolean {
  if (rol == null || rol === "") return true;
  return (ROLES_REPARTO_NOMINA as readonly string[]).includes(rol);
}

// ═══════════════════════════════ Validación ANTES de la red ═══════════════════════════════

export const MSG_SIN_PAGOS = "Elige al menos un pago de nómina.";
export const MSG_DEMASIADOS_PAGOS = `Elige a lo más ${TOPE_GASTOS_REPARTO_IGUALES} pagos por reparto.`;
export const MSG_DEMASIADOS_AVIONES = `Elige a lo más ${TOPE_AVIONES_REPARTO_IGUALES} aviones.`;
export const MSG_IDS_INVALIDOS = "Hay un pago o un avión que no es válido: recarga la página.";
export const MSG_REPETIDOS = "Hay un pago o un avión repetido: recarga la página.";

function listaDeUuids(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !esUuid(x)) return null;
    out.push(x.toLowerCase());
  }
  return out;
}

const hayRepetidos = (xs: readonly string[]): boolean => new Set(xs).size !== xs.length;

/**
 * Valida y arma el cuerpo EXACTO (1..200 pagos, 0..20 aviones, uuid sin
 * repetir, `simular` solo `true`). Lo usa la server action ANTES de llamar
 * al API: con datos inválidos no sale nada a la red.
 */
export function validarCuerpoRepartoIguales(
  input: unknown,
): { ok: true; cuerpo: CuerpoRepartoIguales } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: MSG_IDS_INVALIDOS };
  const { gasto_ids, aeronave_ids, simular } = input as Record<string, unknown>;
  const gastos = listaDeUuids(gasto_ids);
  const aviones = listaDeUuids(aeronave_ids);
  if (!gastos || !aviones) return { ok: false, error: MSG_IDS_INVALIDOS };
  if (gastos.length === 0) return { ok: false, error: MSG_SIN_PAGOS };
  if (gastos.length > TOPE_GASTOS_REPARTO_IGUALES) return { ok: false, error: MSG_DEMASIADOS_PAGOS };
  if (aviones.length > TOPE_AVIONES_REPARTO_IGUALES) return { ok: false, error: MSG_DEMASIADOS_AVIONES };
  if (hayRepetidos(gastos) || hayRepetidos(aviones)) return { ok: false, error: MSG_REPETIDOS };
  if (simular !== undefined && typeof simular !== "boolean") return { ok: false, error: MSG_IDS_INVALIDOS };
  const cuerpo: CuerpoRepartoIguales = { gasto_ids: gastos, aeronave_ids: aviones };
  if (simular === true) cuerpo.simular = true;
  return { ok: true, cuerpo };
}

// ═══════════════════════════════ Pagos del mes (lo ya registrado) ═══════════════════════════════

/** Lo que el diálogo y el resumen leen de cada gasto (un `Gasto` del API sirve tal cual). */
export interface GastoNominaReparto {
  id: string;
  fecha_gasto?: string | null;
  notas?: string | null;
  monto?: string | number | null;
  moneda?: string | null;
  vuelo_id?: string | null;
  repartos?: ReadonlyArray<{
    aeronave_id: string;
    monto: string | number;
    aeronave?: { matricula: string } | null;
  }> | null;
}

export interface PagoNomina {
  id: string;
  fecha: string | null;
  /** Primera línea de las notas (a quién y qué quincena). */
  nota: string;
  monto: number;
  moneda: string;
  /** Un pago ligado a un vuelo no se reparte (el API responde GASTO_CON_VUELO). */
  repartible: boolean;
  /** Matrículas del reparto GUARDADO (vacío = sin repartir). */
  aviones: string[];
}

const textoLimpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function primeraLinea(notas: string | null | undefined): string {
  return textoLimpio(notas).split(/\r?\n/)[0]?.trim() ?? "";
}

export function pagoNominaDeGasto(g: GastoNominaReparto): PagoNomina {
  const aviones = (g.repartos ?? []).map((p) => textoLimpio(p.aeronave?.matricula) || "¿?");
  return {
    id: g.id,
    fecha: typeof g.fecha_gasto === "string" ? g.fecha_gasto.slice(0, 10) : null,
    nota: primeraLinea(g.notas),
    monto: centavosDeMonto(g.monto) / 100,
    moneda: textoLimpio(g.moneda),
    repartible: !g.vuelo_id,
    aviones,
  };
}

export const ESTADO_SIN_REPARTIR = "Sin repartir";

/** «Sin repartir» · «Repartido: N4142R, N621TX». */
export function estadoPagoNomina(p: Pick<PagoNomina, "aviones">): string {
  return p.aviones.length === 0 ? ESTADO_SIN_REPARTIR : `Repartido: ${p.aviones.join(", ")}`;
}

export const TEXTO_PAGO_CON_VUELO = "Ligado a un vuelo: no se reparte";
export const SIN_NOTA = "Sin notas";

/** Renglón del pago en la lista: «15 oct 2026 · Luis 1a oct · $5,000 MXN». */
export function lineaPagoNomina(p: PagoNomina): string {
  return [fmtDateOnly(p.fecha), p.nota || SIN_NOTA, montoNomina(p.monto, p.moneda)].join(" · ");
}

// ═══════════════════════════════ Paso 1: ¿Qué pagos? ═══════════════════════════════

export type ChipPagosNomina = "mes" | "q1" | "q2" | "sin_repartir";

export const CHIPS_PAGOS_NOMINA: ReadonlyArray<{ valor: ChipPagosNomina; etiqueta: string }> = [
  { valor: "mes", etiqueta: "Todo el mes" },
  { valor: "q1", etiqueta: "1ª quincena" },
  { valor: "q2", etiqueta: "2ª quincena" },
  { valor: "sin_repartir", etiqueta: "Solo sin repartir" },
];

/** «Solo sin repartir» si hay alguno; si no, «Todo el mes». */
export function chipInicialNomina(pagos: readonly PagoNomina[]): ChipPagosNomina {
  return pagos.some((p) => p.repartible && p.aviones.length === 0) ? "sin_repartir" : "mes";
}

/** Los pagos REPARTIBLES que marca un chip (los ligados a un vuelo, nunca). */
export function idsDeChip(pagos: readonly PagoNomina[], chip: ChipPagosNomina): string[] {
  return pagos
    .filter((p) => {
      if (!p.repartible) return false;
      if (chip === "sin_repartir") return p.aviones.length === 0;
      if (chip === "q1" || chip === "q2") return quincenaDeFecha(p.fecha) === (chip === "q1" ? 1 : 2);
      return true;
    })
    .map((p) => p.id);
}

/** El chip que describe lo marcado (null si la selección no es la de ningún chip). */
export function chipDeSeleccion(
  pagos: readonly PagoNomina[],
  seleccion: ReadonlySet<string>,
): ChipPagosNomina | null {
  for (const { valor } of CHIPS_PAGOS_NOMINA) {
    const ids = idsDeChip(pagos, valor);
    if (ids.length > 0 && ids.length === seleccion.size && ids.every((id) => seleccion.has(id))) return valor;
  }
  return null;
}

// ═══════════════════════════════ Textos del diálogo ═══════════════════════════════

export const ETIQUETA_BOTON_REPARTIR_NOMINA = "Repartir entre aviones";
export const TITULO_BOTON_REPARTIR_NOMINA =
  "Reparte los pagos de nómina del mes en partes iguales entre los aviones que elijas.";
export const TITULO_DIALOGO_REPARTO_NOMINA = "Repartir la nómina entre aviones";

export function descripcionDialogoRepartoNomina(etiquetaMes: string): string {
  return `Pagos de ${etiquetaMes}. Cada pago se reparte por separado en partes iguales entre los aviones elegidos (los centavos que sobran los reparte el servidor). Solo lo repartido entra al balance de cada avión.`;
}

export const PASO_PAGOS_NOMINA = "1. ¿Qué pagos?";
export const PASO_AVIONES_NOMINA = "2. ¿Entre qué aviones?";
export const PASO_VISTA_PREVIA_NOMINA = "3. Así quedaría";
export const ETIQUETA_SELECCIONAR_TODOS = "Seleccionar todos";
export const ETIQUETA_SELECCIONAR_NINGUNO = "Ninguno";
export const ETIQUETA_TODOS_AVIONES = "Todos";
export const TEXTO_CARGANDO_AVIONES = "Cargando los aviones…";
export const TEXTO_AVIONES_NO_CARGARON =
  "No se pudieron cargar los aviones activos. Vuelve a intentarlo.";
export const ETIQUETA_REINTENTAR = "Reintentar";
export const TEXTO_SIN_AVIONES_ACTIVOS = "No hay aviones activos para repartir.";
export const TEXTO_SIN_PAGOS_MES = "No hay pagos de nómina en este mes.";
export const TEXTO_ELIGE_PAGOS = "Marca al menos un pago.";
export const TEXTO_ELIGE_AVIONES = "Marca al menos un avión para ver cómo quedaría.";
export const TEXTO_CALCULANDO_REPARTO = "Calculando…";
export const TEXTO_VISTA_PREVIA_NO_CARGO =
  "No se pudo calcular la vista previa. Cambia la selección o vuelve a intentarlo.";
export const ETIQUETA_CERRAR = "Cerrar";
export const ETIQUETA_CANCELAR = "Cancelar";
export const TEXTO_REPARTIENDO = "Repartiendo…";
export const TEXTO_QUITANDO = "Quitando…";

/** «12 pagos seleccionados». */
export function textoPagosSeleccionados(n: number): string {
  return n === 1 ? "1 pago seleccionado" : `${n} pagos seleccionados`;
}

/** «Repartir 12 pagos entre 4 aviones». */
export function textoBotonRepartirNomina(pagos: number, aviones: number): string {
  const p = pagos === 1 ? "1 pago" : `${pagos} pagos`;
  const a = aviones === 1 ? "1 avión" : `${aviones} aviones`;
  return `Repartir ${p} entre ${a}`;
}

/** «Quitar el reparto» de los marcados (SIEMPRE con confirmación). */
export const ETIQUETA_QUITAR_REPARTO_NOMINA = "Quitar el reparto";
export const TITULO_CONFIRMAR_QUITAR_NOMINA = "¿Quitar el reparto?";
export function textoConfirmarQuitarNomina(pagos: number): string {
  const p = pagos === 1 ? "El pago elegido queda" : `Los ${pagos} pagos elegidos quedan`;
  return `${p} sin repartir: ningún avión los carga y no entran a ningún balance hasta volver a repartirlos. El pre-cierre del mes lo marcará.`;
}
export const BOTON_CONFIRMAR_QUITAR_NOMINA = "Sí, quitar el reparto";

/** Confirmación cuando algún pago YA estaba repartido (aplicar lo reemplaza). */
export const TITULO_CONFIRMAR_REEMPLAZO_NOMINA = "¿Reemplazar el reparto?";
export function textoConfirmarReemplazoNomina(yaRepartidos: number, aviones: number): string {
  const k = yaRepartidos === 1 ? "1 pago que ya estaba repartido" : `${yaRepartidos} pagos que ya estaban repartidos`;
  const a = aviones === 1 ? "el avión elegido" : `los ${aviones} aviones elegidos`;
  return `Se reemplaza el reparto de ${k}: quedarán en partes iguales entre ${a}.`;
}
export const BOTON_CONFIRMAR_REEMPLAZO_NOMINA = "Sí, reemplazar y repartir";

/** «N4142R $27,480.37 MXN» (el monto lo calcula el API). */
export function textoParteRepartoNomina(
  matricula: string | null | undefined,
  monto: string | number,
  moneda: string,
): string {
  return `${textoLimpio(matricula) || "¿?"} ${montoNomina(centavosDeMonto(monto) / 100, moneda)}`;
}

/** «12 pagos · $109,921.46 MXN». */
export function textoTotalRepartoNomina(gastosN: number, monto: string | number, moneda: string): string {
  const p = gastosN === 1 ? "1 pago" : `${gastosN} pagos`;
  return `${p} · ${montoNomina(centavosDeMonto(monto) / 100, moneda)}`;
}

export const TITULO_ERRORES_REPARTO = "Pagos que no se pueden repartir";

/** Un error por pago, con el texto del API (MES_CERRADO incluido). */
export interface ErrorPagoReparto {
  gasto_id: string;
  pago: string;
  code: string;
  mensaje: string;
}

/** Errores por pago de la respuesta (vista previa o resultado), con su renglón. */
export function erroresDeRespuestaReparto(
  res: Pick<RespuestaRepartoIguales, "gastos"> | null | undefined,
  pagos: readonly PagoNomina[],
): ErrorPagoReparto[] {
  const porId = new Map(pagos.map((p) => [p.id, p]));
  return (res?.gastos ?? [])
    .filter((g) => !g.ok && g.error)
    .map((g) => {
      const p = porId.get(g.gasto_id);
      return {
        gasto_id: g.gasto_id,
        pago: p
          ? lineaPagoNomina(p)
          : [fmtDateOnly(g.fecha_gasto), montoNomina(centavosDeMonto(g.monto) / 100, g.moneda)].join(" · "),
        code: g.error?.code ?? "ERROR",
        mensaje: textoLimpio(g.error?.message) || "No se pudo repartir este pago.",
      };
    });
}

/** Cuántos de los pagos que se van a REPARTIR ya tenían reparto (pide confirmar el reemplazo). */
export function pagosYaRepartidos(res: Pick<RespuestaRepartoIguales, "gastos"> | null | undefined): number {
  return (res?.gastos ?? []).filter((g) => g.ok && g.ya_repartido).length;
}

// ═══════════════════════════════ Resultado ═══════════════════════════════

// ═══════════════════════════════ Vista previa (debounce + turno) ═══════════════════════════════

/** Espera antes de pedir la vista previa (`simular: true`) tras el último cambio. */
export const ESPERA_VISTA_PREVIA_MS = 400;

/**
 * Llave de la vista previa: pagos y aviones ORDENADOS (el orden de los clics no
 * cuenta) + una versión que se sube para volver a pedirla tras aplicar.
 */
export function claveVistaPreviaNomina(
  gastoIds: readonly string[],
  aeronaveIds: readonly string[],
  version: number,
): string {
  return `${[...gastoIds].sort().join(",")}|${[...aeronaveIds].sort().join(",")}|${version}`;
}

/** Los ids que lleva una llave de `claveVistaPreviaNomina`. */
export function idsDeClaveVistaPrevia(clave: string): { gasto_ids: string[]; aeronave_ids: string[] } {
  const [g = "", a = ""] = clave.split("|");
  return {
    gasto_ids: g ? g.split(",") : [],
    aeronave_ids: a ? a.split(",") : [],
  };
}

/**
 * ¿El resultado NO dice si se escribió? Sin respuesta (red, deploy) o 5xx: pudo
 * escribir antes de perderse la respuesta (las mutaciones no se reintentan).
 */
export function resultadoEsIncierto(r: { ok: boolean; code?: string; status?: number }): boolean {
  if (r.ok) return false;
  if (r.code === CODIGO_SIN_CONEXION) return true;
  return typeof r.status === "number" && r.status >= 500;
}

export const MSG_REPARTO_INCIERTO = "No se pudo confirmar si se repartió: revisa la lista.";
export const MSG_REPARTO_RUTA_NO_DISPONIBLE =
  "Falta actualizar el servidor: el reparto de la nómina todavía no está disponible.";
export const CODIGO_RUTA_NO_DISPONIBLE = "RUTA_NO_DISPONIBLE";
export const CODIGO_SIN_CONEXION = "SIN_CONEXION";

/** Toast del resultado: «12 pagos repartidos entre 4 aviones» / «… · 2 con error». */
export function toastResultadoRepartoNomina(
  res: Pick<RespuestaRepartoIguales, "quitar" | "aplicados" | "errores" | "aeronaves">,
): { tipo: "success" | "warning" | "error"; texto: string } {
  const errores = res.errores > 0 ? ` · ${res.errores} con error` : "";
  if (res.aplicados === 0) {
    return {
      tipo: "error",
      texto: res.quitar
        ? "No se quitó el reparto de ningún pago: revisa los errores."
        : "Ningún pago se repartió: revisa los errores.",
    };
  }
  const p = res.aplicados === 1 ? "1 pago" : `${res.aplicados} pagos`;
  if (res.quitar) {
    return { tipo: res.errores > 0 ? "warning" : "success", texto: `Reparto quitado de ${p}${errores}` };
  }
  const n = res.aeronaves.length;
  const a = n === 1 ? "1 avión" : `${n} aviones`;
  const verbo = res.aplicados === 1 ? "repartido" : "repartidos";
  return { tipo: res.errores > 0 ? "warning" : "success", texto: `${p} ${verbo} entre ${a}${errores}` };
}

// ═══════════════════════════════ Resumen: Repartido / Sin repartir / Por avión ═══════════════════════════════

export interface PorAvionNomina {
  matricula: string;
  total: PorMoneda[];
}

export interface ResumenRepartoNomina {
  /** Σ de las partes guardadas, por moneda. */
  repartido: PorMoneda[];
  /** Σ de los pagos sin ningún reparto, por moneda. */
  sinRepartir: PorMoneda[];
  /** Lo que un reparto manual dejó sin asignar (monto − Σ partes > 0), por moneda. */
  remanente: PorMoneda[];
  pagosRepartidos: number;
  pagosSinRepartir: number;
  /** Σ de partes por matrícula (A–Z, «¿?» al final) y moneda. */
  porAvion: PorAvionNomina[];
}

function sumar(acumulado: Map<string, number>, moneda: string, centavos: number): void {
  acumulado.set(moneda, (acumulado.get(moneda) ?? 0) + centavos);
}

/**
 * Resumen del reparto con lo YA guardado (`gasto.repartos`): en CENTAVOS y por
 * moneda (MXN y USD jamás se suman). No decide ningún monto: suma partes.
 */
export function resumenRepartoNomina(gastos: readonly GastoNominaReparto[]): ResumenRepartoNomina {
  const repartido = new Map<string, number>();
  const sinRepartir = new Map<string, number>();
  const remanente = new Map<string, number>();
  const porAvion = new Map<string, Map<string, number>>();
  let pagosRepartidos = 0;
  let pagosSinRepartir = 0;

  for (const g of gastos) {
    const moneda = textoLimpio(g.moneda);
    const monto = centavosDeMonto(g.monto);
    const partes = g.repartos ?? [];
    if (partes.length === 0) {
      pagosSinRepartir += 1;
      sumar(sinRepartir, moneda, monto);
      continue;
    }
    pagosRepartidos += 1;
    let suma = 0;
    for (const p of partes) {
      const c = centavosDeMonto(p.monto);
      suma += c;
      sumar(repartido, moneda, c);
      const mat = textoLimpio(p.aeronave?.matricula) || "¿?";
      let porMoneda = porAvion.get(mat);
      if (!porMoneda) {
        porMoneda = new Map();
        porAvion.set(mat, porMoneda);
      }
      sumar(porMoneda, moneda, c);
    }
    if (monto - suma > 0) sumar(remanente, moneda, monto - suma);
  }

  const aviones = [...porAvion.keys()].sort((a, b) =>
    a === "¿?" ? 1 : b === "¿?" ? -1 : a < b ? -1 : a > b ? 1 : 0,
  );
  return {
    repartido: totalesPorMoneda(repartido),
    sinRepartir: totalesPorMoneda(sinRepartir),
    remanente: totalesPorMoneda(remanente),
    pagosRepartidos,
    pagosSinRepartir,
    porAvion: aviones.map((matricula) => ({
      matricula,
      total: totalesPorMoneda(porAvion.get(matricula) ?? new Map()),
    })),
  };
}

export const TITULO_RESUMEN_REPARTO_NOMINA = "Reparto entre aviones";
export const ETIQUETA_REPARTIDO = "Repartido";
export const ETIQUETA_SIN_REPARTIR = "Sin repartir";
export const ETIQUETA_REMANENTE = "Sin asignar de repartos manuales";
export const ETIQUETA_POR_AVION = "Por avión";
export const TEXTO_NADA_REPARTIDO = "Todavía no se reparte ningún pago.";
export const NOTA_SIN_REPARTIR =
  "Lo que está sin repartir no entra a ningún balance y el pre-cierre del mes lo marca: repártelo con «Repartir entre aviones».";
