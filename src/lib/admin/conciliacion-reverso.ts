/**
 * Conciliación: un CARGO que el banco DEVOLVIÓ y su devolución se concilian
 * JUNTOS (30-sep-2026, API 0.0.44).
 *
 * Pregunta del cliente (captura de Conciliación · GASTOS GNRAL): «¿Cómo puedo
 * conciliar los cargos reembolsados?». Caso real: el 21-sep hay 8 cargos
 * «ASUR CANCUN» de $825.13 (1 con su gasto, 7 sin candidato) y el 23-sep 7
 * abonos «CARGO INDEBIDO 21 SEP 355xx» por el mismo monto. Un cargo devuelto y
 * su devolución se anulan: NO son gasto ni ingreso. Hasta hoy la única salida
 * era clasificar a mano cada uno de los 14.
 *
 * La regla vive en el API (columna `movimiento_bancario.reverso_de_id` en el
 * ABONO, trigger que valida tipo/cuenta/monto, clasificación canónica
 * «Reverso de un cargo»). Este módulo es PURO (sin React ni red): textos
 * es-MX, detección de la descripción de una devolución (ESPEJO de la lista
 * del API) y el orden de los candidatos. Ningún componente redacta estas
 * frases a mano.
 */

import { tieneGastoLigado } from "@/lib/admin/conciliacion-lote";
import { MSG_SERVIDOR_NO_RESPONDIO, esErrorTecnico } from "@/lib/admin/errores-tecnicos";
import { CLASIFICACION_REVERSO } from "@/lib/admin/ingresos-ui";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import type {
  CandidatoReverso,
  MovimientoReversoRef,
  ReversosAutoResultado,
} from "@/types/conciliacion";

/** Ventana del emparejamiento (días): la misma del API. */
export const VENTANA_REVERSO_DIAS = 60;

/** Diferencia de monto tolerada (la del trigger de la BD). */
export const TOLERANCIA_MONTO_REVERSO = 0.005;

/** Nombre canónico de la clasificación (fuente única: `ingresos-ui.ts`). */
export const ETIQUETA_REVERSO = CLASIFICACION_REVERSO;

// ─────────────────────── Descripción de una devolución ───────────────────────

/**
 * Frases con las que el banco rotula una devolución. ESPEJO EXACTO de
 * `PATRONES_DEVOLUCION` del API (`reverso-cruce.util.ts`, la que usa
 * `POST /v1/conciliacion/reversos/auto`): si cambia allá, cambia aquí, o el
 * panel sugeriría un abono que el auto no toca (o callaría uno que sí).
 */
export const PATRONES_DEVOLUCION = [
  "CARGO INDEBIDO",
  "DEVOLUCION",
  "REVERSO",
  "CONTRACARGO",
  "ABONO POR ACLARACION",
  "RECLAMACION",
] as const;

/** MAYÚSCULAS, sin acentos, un solo espacio entre palabras. */
export function normalizaDescripcion(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * ¿La descripción del banco dice que es una devolución? ESPEJO de
 * `patronDevolucion` del API: cada frase cuenta como INICIO DE PALABRA
 * («DEVOLUCIONES» entra; «IRREVERSOS» no) y, además, el prefijo del banco
 * «REV …» («REV ASUR MERIDA», «REV.DLO*DIDI»; `patronReverso` del API —
 * «REVOLVENTE» o «PREVIO» no). Revisión adversaria 30-sep-2026: el panel
 * buscaba la frase en cualquier parte y no conocía «REV …», así que la pista
 * «Parece devolución» callaba abonos que «Emparejar devoluciones» sí toca.
 */
export function esDescripcionDevolucion(texto: string | null | undefined): boolean {
  const t = normalizaDescripcion(texto);
  if (t === "") return false;
  const conBordes = ` ${t} `;
  return PATRONES_DEVOLUCION.some((p) => conBordes.includes(` ${p}`)) || /^REV(\s|$)/.test(t);
}

/**
 * Meses que reconoce la leyenda (ESPEJO de `MESES` del API: los largos antes
 * que los cortos, porque la alternancia del regex toma el primero). Se
 * conservan los cortos en inglés que ya aceptaba el panel.
 */
const MESES: ReadonlyArray<readonly [string, number]> = [
  ["SEPTIEMBRE", 9],
  ["SETIEMBRE", 9],
  ["NOVIEMBRE", 11],
  ["DICIEMBRE", 12],
  ["FEBRERO", 2],
  ["OCTUBRE", 10],
  ["AGOSTO", 8],
  ["ENERO", 1],
  ["MARZO", 3],
  ["ABRIL", 4],
  ["JUNIO", 6],
  ["JULIO", 7],
  ["MAYO", 5],
  ["SEPT", 9],
  ["ENE", 1],
  ["JAN", 1],
  ["FEB", 2],
  ["MAR", 3],
  ["ABR", 4],
  ["APR", 4],
  ["MAY", 5],
  ["JUN", 6],
  ["JUL", 7],
  ["AGO", 8],
  ["AUG", 8],
  ["SEP", 9],
  ["OCT", 10],
  ["NOV", 11],
  ["DIC", 12],
  ["DEC", 12],
];
const MES_POR_NOMBRE = new Map<string, number>(MESES);
/** «21 SEP», «21SEPT», «5 SEPTIEMBRE» (con bordes de palabra, como el API). */
const RE_DIA_MES = new RegExp(`(?:^|\\s)(\\d{1,2})\\s?(${MESES.map(([m]) => m).join("|")})(?=\\s|$)`);

/**
 * Pista de fecha dentro de la descripción («CARGO INDEBIDO 21 SEP 35552» →
 * {dia: 21, mes: 9}): el banco suele decir de qué día era el cargo devuelto.
 * null = no trae pista (o no es una fecha válida). Solo ORDENA la lista del
 * diálogo; quién empareja con quién lo decide el API.
 */
export function pistaFechaDevolucion(
  texto: string | null | undefined,
): { dia: number; mes: number } | null {
  const t = normalizaDescripcion(texto);
  const m = RE_DIA_MES.exec(t);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = MES_POR_NOMBRE.get(m[2]);
  if (!mes || dia < 1 || dia > 31) return null;
  return { dia, mes };
}

/** ¿El día `YYYY-MM-DD` es el que dice la pista? */
export function coincidePista(
  pista: { dia: number; mes: number } | null,
  ymd: string | null | undefined,
): boolean {
  if (!pista || !ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return false;
  return Number(ymd.slice(5, 7)) === pista.mes && Number(ymd.slice(8, 10)) === pista.dia;
}

// ─────────────────────────────── Fechas ───────────────────────────────

/** Día de pared ± N días sobre `YYYY-MM-DD` (sin correr el día). */
export function diaMasReverso(ymd: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const fmtDiaCorto = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * «21 sep» de una columna DATE (`YYYY-MM-DD`): el movimiento del banco es un
 * día de pared, se fija a mediodía UTC para no correrlo.
 */
export function diaCorto(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : fmtDiaCorto.format(d);
}

// ─────────────────────── Movimiento emparejado ───────────────────────

/** Lo que el panel necesita de un movimiento para el emparejamiento. */
export interface MovimientoReversoInfo {
  id: string;
  tipo: "CARGO" | "ABONO" | string;
  cuenta_bancaria_id: string;
  fecha: string;
  monto: string | number;
  descripcion?: string | null;
  referencia?: string | null;
  conciliado?: boolean | null;
  gasto_id?: string | null;
  cobro_id?: string | null;
  cobro_grupo_id?: string | null;
  ingreso_id?: string | null;
  clasificacion_id?: string | null;
  notas?: string | null;
  /** 1 cargo ↔ N gastos (2-oct-2026, ADITIVOS del API 0.0.52): con un lote
      `gasto_id` viene NULL (es espejo solo con 1 parte) y la liga se ve en
      `gastos_n` / `gastos`. */
  gastos_n?: number | null;
  gastos?: readonly unknown[] | null;
  /** ADITIVOS del API 0.0.44 (sin ellos, el movimiento no está emparejado). */
  reverso_de_id?: string | null;
  reverso_de?: MovimientoReversoRef | null;
  revertido_por?: MovimientoReversoRef | null;
}

/**
 * ¿Este movimiento está conciliado como pareja cargo ↔ devolución? Con un API
 * previo (sin los aditivos) siempre false: la fila se pinta como antes.
 */
export function esConciliadoPorReverso(m: MovimientoReversoInfo | null | undefined): boolean {
  if (!m) return false;
  return m.reverso_de_id != null || m.reverso_de != null || m.revertido_por != null;
}

/** La otra mitad de la pareja (null si el API no mandó su ficha). */
export function contraparteReverso(m: MovimientoReversoInfo): MovimientoReversoRef | null {
  return m.reverso_de ?? m.revertido_por ?? null;
}

/** ¿Este movimiento es el ABONO (la devolución) de la pareja? */
function esLaDevolucion(m: MovimientoReversoInfo): boolean {
  if (m.reverso_de != null || m.reverso_de_id != null) return true;
  if (m.revertido_por != null) return false;
  return m.tipo === "ABONO";
}

/**
 * Segunda línea de la fila conciliada: «devuelve el cargo del 21 sep · ASUR
 * CANCUN» (en el abono) o «devuelto el 23 sep · CARGO INDEBIDO 21 SEP 35552»
 * (en el cargo).
 */
export function textoParejaReverso(m: MovimientoReversoInfo): string {
  const otra = contraparteReverso(m);
  const devolucion = esLaDevolucion(m);
  if (!otra) return devolucion ? "devuelve un cargo de esta cuenta" : "devuelto por el banco";
  const dia = diaCorto(otra.fecha);
  const desc = (otra.descripcion ?? "").trim();
  const base = devolucion
    ? `devuelve el cargo${dia ? ` del ${dia}` : ""}`
    : `devuelto${dia ? ` el ${dia}` : ""}`;
  return desc ? `${base} · ${desc}` : base;
}

/** «Conciliado con: Reverso de un cargo · devuelve el cargo del 21 sep · ASUR CANCUN». */
export function tituloParejaReverso(m: MovimientoReversoInfo, nombre?: string | null): string {
  const linea = `Conciliado con: ${nombre?.trim() || ETIQUETA_REVERSO} · ${textoParejaReverso(m)}`;
  const notas = (m.notas ?? "").trim();
  return notas ? `${linea}\n${notas}` : linea;
}

/** Fechas del cargo y de la devolución de una pareja (la que falte, vacía). */
function fechasPareja(m: MovimientoReversoInfo): { cargo: string; devolucion: string } {
  const otra = contraparteReverso(m)?.fecha ?? "";
  return esLaDevolucion(m)
    ? { cargo: diaCorto(otra), devolucion: diaCorto(m.fecha) }
    : { cargo: diaCorto(m.fecha), devolucion: diaCorto(otra) };
}

// ─────────────────────────── Menú y diálogos ───────────────────────────

export const MENU_ABONO_DEVOLUCION = "Es la devolución de un cargo";
export const MENU_CARGO_DEVUELTO = "Lo devolvió el banco";
export const MENU_QUITAR_REVERSO = "Quitar emparejamiento";

export const TITULO_QUITAR_REVERSO = "¿Quitar el emparejamiento?";
export const BOTON_QUITAR_REVERSO = "Quitar (los dos a pendiente)";

/**
 * Confirmación antes de deshacer (regla permanente: toda acción que deshace
 * trabajo confirma). Dice que LOS DOS movimientos vuelven a pendiente.
 */
export function textoConfirmarQuitarReverso(m: MovimientoReversoInfo): string {
  const f = fechasPareja(m);
  const cargo = f.cargo ? `El cargo del ${f.cargo}` : "El cargo";
  const devol = f.devolucion ? `su devolución del ${f.devolucion}` : "su devolución";
  return `${cargo} y ${devol} vuelven a quedar Pendientes de conciliar (los dos, no solo esta línea). Úsalo si se emparejaron mal; después puedes volver a emparejarlos.`;
}

export const TOAST_REVERSO_QUITADO = "Emparejamiento quitado: los dos movimientos vuelven a Pendiente";

/** Título del diálogo según el lado desde el que se abre. */
export function tituloDialogoReverso(tipo: string): string {
  return tipo === "ABONO" ? "¿Qué cargo devolvió el banco?" : "¿Con qué abono lo devolvió el banco?";
}

/** Descripción del diálogo: el movimiento de partida y qué va a pasar. */
export function descripcionDialogoReverso(m: MovimientoReversoInfo, moneda?: string | null): string {
  const monto = fmtMonto(m.monto, moneda ?? null);
  const desc = (m.descripcion ?? "").trim();
  const origen = `${m.tipo === "ABONO" ? "Abono" : "Cargo"} de ${monto} del ${fmtDateOnly(m.fecha)}${desc ? ` · ${desc}` : ""}.`;
  const que =
    m.tipo === "ABONO"
      ? "Elige el cargo que el banco devolvió:"
      : "Elige el abono con el que el banco lo devolvió:";
  return `${origen} ${que} los dos quedan conciliados como «${ETIQUETA_REVERSO}» y no cuentan como gasto ni como ingreso.`;
}

/** Sin candidatos: «No hay cargos pendientes por $825.13 en los últimos 60 días». */
export function textoSinCandidatosReverso(tipo: string, monto: string | number, moneda?: string | null): string {
  const m = fmtMonto(monto, moneda ?? null);
  return tipo === "ABONO"
    ? `No hay cargos pendientes por ${m} en los últimos ${VENTANA_REVERSO_DIAS} días`
    : `No hay abonos pendientes por ${m} en los ${VENTANA_REVERSO_DIAS} días siguientes`;
}

/** Qué se ofrece y qué NO (un cargo con gasto nunca se ofrece). */
export function notaCandidatosReverso(tipo: string): string {
  return tipo === "ABONO"
    ? `Solo aparecen cargos PENDIENTES de esta misma cuenta, por el mismo monto y de los ${VENTANA_REVERSO_DIAS} días anteriores. Un cargo ya ligado a un gasto no aparece: si en realidad lo devolvieron, desvincula primero el gasto.`
    : `Solo aparecen abonos PENDIENTES de esta misma cuenta, por el mismo monto y de los ${VENTANA_REVERSO_DIAS} días siguientes; primero los que el banco rotula como devolución.`;
}

/** Botón secundario cuando no hay pareja: el camino de siempre (solo un lado). */
export function textoClasificarSoloUno(tipo: string): string {
  return tipo === "ABONO"
    ? `Clasificar solo este abono como «${ETIQUETA_REVERSO}»`
    : `Clasificar solo este cargo como «${ETIQUETA_REVERSO}»`;
}

/**
 * Cuándo conviene clasificar SOLO un lado. Desde un CARGO lo normal es que la
 * devolución llegue en un estado de cuenta que todavía no se sube: si se
 * clasifica ya, el abono de mañana no tendrá con quién emparejarse
 * (revisión adversaria 30-sep-2026).
 */
export function ayudaClasificarSoloUno(tipo: string): string {
  return tipo === "ABONO"
    ? "Úsalo solo si el cargo no está en el sistema (p. ej. es de un periodo que no se importó): ningún otro movimiento se toca."
    : "Si la devolución llegará en un estado de cuenta que aún no subes, mejor espera: al importarlo, «Emparejar devoluciones» concilia los dos juntos. Clasifícalo solo si la devolución no va a estar en el sistema.";
}

/** Toast tras emparejar: «Cargo del 21 sep y su devolución conciliados». */
export function toastEmparejado(fechaCargo: string | null | undefined): {
  titulo: string;
  descripcion: string;
} {
  const dia = diaCorto(fechaCargo);
  return {
    titulo: `Cargo${dia ? ` del ${dia}` : ""} y su devolución conciliados`,
    descripcion: `Los dos quedan como «${ETIQUETA_REVERSO}»: no cuentan como gasto ni como ingreso.`,
  };
}

/**
 * Los candidatos son IGUALES entre sí (misma fecha, monto y descripción), como
 * los 7 «ASUR CANCUN» del 21-sep: da lo mismo cuál se elija.
 */
export function candidatosIndistinguibles(cands: CandidatoReverso[]): boolean {
  if (cands.length < 2) return false;
  const clave = (c: CandidatoReverso) =>
    `${c.fecha.slice(0, 10)}|${Number(c.monto).toFixed(2)}|${normalizaDescripcion(c.descripcion)}`;
  const primera = clave(cands[0]);
  return cands.every((c) => clave(c) === primera);
}

export function textoIndistinguibles(n: number, tipo: string): string {
  return tipo === "ABONO"
    ? `Los ${n} cargos son iguales (misma fecha, monto y descripción): da lo mismo cuál elijas; los demás quedan para las otras devoluciones.`
    : `Los ${n} abonos son iguales (misma fecha, monto y descripción): da lo mismo cuál elijas; los demás quedan para los otros cargos.`;
}

// ─────────────────────────── Candidatos ───────────────────────────

/** Acepta `[...]`, `{candidatos: [...]}` o `{data: [...]}` (tolerante). */
export function candidatosDeRespuesta(data: unknown): CandidatoReverso[] {
  const lista = Array.isArray(data)
    ? data
    : Array.isArray((data as { candidatos?: unknown })?.candidatos)
      ? (data as { candidatos: unknown[] }).candidatos
      : Array.isArray((data as { data?: unknown })?.data)
        ? (data as { data: unknown[] }).data
        : [];
  return lista
    .filter(
      (c): c is Record<string, unknown> =>
        !!c && typeof (c as { id?: unknown }).id === "string" && typeof (c as { fecha?: unknown }).fecha === "string",
    )
    .map((c) => ({
      id: c.id as string,
      fecha: c.fecha as string,
      descripcion: (c.descripcion as string | null | undefined) ?? null,
      referencia: (c.referencia as string | null | undefined) ?? null,
      monto: (c.monto as string | number | undefined) ?? 0,
      ...(c.sugerido === true ? { sugerido: true } : {}),
    }));
}

/**
 * El candidato que se PRESELECCIONA en el diálogo: el `sugerido` del API (el
 * mismo que elegiría «Emparejar devoluciones»: la fecha que dice la leyenda
 * y, entre cargos idénticos, el más antiguo) y, sin él, el primero de la
 * lista ya ordenada.
 */
export function candidatoPreseleccionado(cands: CandidatoReverso[]): string {
  return cands.find((c) => c.sugerido === true)?.id ?? cands[0]?.id ?? "";
}

/**
 * Para ACEPTAR una propuesta «es la devolución de un cargo» sin diálogo (IA de
 * Ingresos): el cargo que el API sugiere, o el ÚNICO candidato. Varios sin
 * sugerencia ⇒ null (se empareja a mano: el panel no adivina).
 */
export function cargoParaEmparejarSolo(cands: CandidatoReverso[]): string | null {
  const sugeridos = cands.filter((c) => c.sugerido === true);
  if (sugeridos.length === 1) return sugeridos[0].id;
  if (sugeridos.length === 0 && cands.length === 1) return cands[0].id;
  return null;
}

/** Varios cargos posibles y ninguno sugerido: se empareja desde el menú. */
export function textoVariosCargosPosibles(n: number): string {
  return `Hay ${n} cargos posibles por el mismo monto: emparéjala a mano desde el menú (⋯) → «${MENU_ABONO_DEVOLUCION}».`;
}

/**
 * Candidatos para un ABONO (los manda el API, fecha desc): primero los cargos
 * del día que dice la descripción («CARGO INDEBIDO 21 SEP» ⇒ los del 21-sep),
 * el resto en el orden del API.
 */
export function ordenarCargosParaAbono(
  abono: Pick<MovimientoReversoInfo, "descripcion">,
  cands: CandidatoReverso[],
): CandidatoReverso[] {
  const pista = pistaFechaDevolucion(abono.descripcion);
  if (!pista) return cands;
  const si = cands.filter((c) => coincidePista(pista, c.fecha));
  const no = cands.filter((c) => !coincidePista(pista, c.fecha));
  return [...si, ...no];
}

/**
 * Movimiento pendiente de verdad (sin liga, sin clasificación, sin pareja).
 * El gate principal es `conciliado`; la liga a gastos se lee con
 * `tieneGastoLigado` (2-oct-2026): un cargo que paga VARIOS gastos trae
 * `gasto_id` NULL y solo `gastos_n`/`gastos` lo delatan.
 */
function estaPendiente(m: MovimientoReversoInfo): boolean {
  return (
    m.conciliado !== true &&
    !tieneGastoLigado(m) &&
    !m.cobro_id &&
    !m.cobro_grupo_id &&
    !m.ingreso_id &&
    !m.clasificacion_id &&
    !esConciliadoPorReverso(m)
  );
}

/**
 * Candidatos para un CARGO (el panel los arma con la lista de abonos
 * pendientes de la cuenta): misma cuenta, mismo monto, del día del cargo a
 * +60 días. Orden: devolución cuya pista de fecha es la del cargo →
 * devolución → los demás; dentro, del más cercano al más lejano.
 */
export function abonosCandidatosParaCargo(
  cargo: MovimientoReversoInfo,
  movs: MovimientoReversoInfo[],
): CandidatoReverso[] {
  const desde = cargo.fecha.slice(0, 10);
  const hasta = diaMasReverso(desde, VENTANA_REVERSO_DIAS);
  const monto = Number(cargo.monto);
  const rango = (a: MovimientoReversoInfo) => {
    const devol = esDescripcionDevolucion(a.descripcion);
    if (devol && coincidePista(pistaFechaDevolucion(a.descripcion), desde)) return 0;
    return devol ? 1 : 2;
  };
  return movs
    .filter(
      (a) =>
        a.tipo === "ABONO" &&
        a.id !== cargo.id &&
        a.cuenta_bancaria_id === cargo.cuenta_bancaria_id &&
        Math.abs(Number(a.monto) - monto) <= TOLERANCIA_MONTO_REVERSO &&
        a.fecha.slice(0, 10) >= desde &&
        a.fecha.slice(0, 10) <= hasta &&
        estaPendiente(a),
    )
    .sort(
      (a, b) =>
        rango(a) - rango(b) ||
        a.fecha.localeCompare(b.fecha) ||
        (a.descripcion ?? "").localeCompare(b.descripcion ?? ""),
    )
    .map((a) => ({
      id: a.id,
      fecha: a.fecha,
      descripcion: a.descripcion ?? null,
      referencia: a.referencia ?? null,
      monto: a.monto,
    }));
}

// ───────────────────────────── Errores ─────────────────────────────

export interface ResultadoAccionReverso {
  error?: string | null;
  code?: string | null;
  status?: number | null;
  details?: unknown;
}

export interface MensajeErrorReverso {
  titulo: string;
  descripcion?: string;
  /** true = la lista de candidatos o la bandeja ya no es la de pantalla. */
  recargar: boolean;
  /** true = el API todavía no tiene la ruta (se ofrece clasificar a mano). */
  apiSinRuta: boolean;
}

export const MSG_API_SIN_REVERSO =
  "El servidor todavía no tiene el emparejamiento de devoluciones (falta actualizar el API).";

export const MSG_REVERSOS_NO_DISPONIBLE =
  "El emparejado de cargos devueltos todavía no está habilitado en la base de datos (falta aplicar una actualización).";

/**
 * ¿El API todavía no sabe emparejar? Ruta inexistente (404 «Cannot …» = API
 * previo) o 503 `REVERSOS_NO_DISPONIBLE` (API nuevo sin la migración
 * `20260930000001`). En los dos casos la salida es clasificar a mano.
 */
export function esApiSinReverso(r: ResultadoAccionReverso): boolean {
  const msg = (r.error ?? "").trim();
  if (r.status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) return true;
  return r.code === "REVERSOS_NO_DISPONIBLE";
}

/** Rechazo del API en palabras del operador (el motivo del API manda). */
export function mensajeErrorReverso(r: ResultadoAccionReverso): MensajeErrorReverso {
  const msg = (r.error ?? "").trim();
  const motivo =
    typeof (r.details as { motivo?: unknown } | null)?.motivo === "string"
      ? ((r.details as { motivo: string }).motivo || "").trim()
      : "";
  if (esApiSinReverso(r)) {
    return {
      titulo: r.code === "REVERSOS_NO_DISPONIBLE" ? MSG_REVERSOS_NO_DISPONIBLE : MSG_API_SIN_REVERSO,
      descripcion: `Mientras, clasifica cada movimiento con «Clasificar (no es de un vuelo)» → «${ETIQUETA_REVERSO}».`,
      recargar: false,
      apiSinRuta: true,
    };
  }
  if (r.code === "MOVIMIENTO_YA_LIGADO" || r.code === "MOVIMIENTO_EN_REVERSO") {
    return {
      titulo: "Este movimiento ya está conciliado",
      descripcion: msg || "Alguien lo concilió mientras tanto: la lista se actualizó.",
      recargar: true,
      apiSinRuta: false,
    };
  }
  if (r.status === 401) {
    return { titulo: "Tu sesión expiró. Recarga la página e inicia sesión.", recargar: false, apiSinRuta: false };
  }
  if (r.status === 403) {
    return { titulo: "Tu usuario no puede conciliar movimientos del banco.", recargar: false, apiSinRuta: false };
  }
  if (r.status === 404) {
    return {
      titulo: "Uno de los dos movimientos ya no existe",
      descripcion: "Alguien lo borró o lo cambió mientras tanto: la lista se actualizó.",
      recargar: true,
      apiSinRuta: false,
    };
  }
  if (r.status === 409) {
    return {
      titulo: "No se pudieron emparejar",
      descripcion: motivo || msg || "Uno de los dos ya está conciliado con otra cosa: la lista se actualizó.",
      recargar: true,
      apiSinRuta: false,
    };
  }
  // Railway reiniciando (HTML ⇒ PARSE_ERROR), la red o un texto técnico en
  // inglés: nunca se pinta tal cual (revisión adversaria 30-sep-2026: salía
  // «Bad Gateway» o «fetch failed» en el toast).
  // El regex vive en `errores-tecnicos.ts` (fuente única, 2-oct-2026).
  if (esErrorTecnico({ error: msg, code: r.code })) {
    return {
      titulo: MSG_SERVIDOR_NO_RESPONDIO,
      recargar: false,
      apiSinRuta: false,
    };
  }
  return { titulo: msg, recargar: false, apiSinRuta: false };
}

// ─────────────────────── «Emparejar devoluciones» (lote) ───────────────────────

export const BOTON_EMPAREJAR_AUTO = "Emparejar devoluciones";

export const TITULO_BOTON_EMPAREJAR_AUTO =
  "Busca los abonos del banco que devuelven un cargo (CARGO INDEBIDO, DEVOLUCIÓN, REVERSO…) y los concilia con su cargo: no son gasto ni ingreso.";

/** Texto EXACTO de la confirmación (contrato). */
export const CONFIRMAR_EMPAREJAR_AUTO =
  "Se emparejarán automáticamente las devoluciones del banco con su cargo (mismo monto, ±60 días). ¿Continuar?";

export const NOTA_EMPAREJAR_AUTO =
  "Nunca toca un cargo ligado a un gasto. Si una devolución tiene varios cargos posibles en fechas distintas y la descripción no dice de qué día era, se queda pendiente para que la emparejes a mano.";

/** Sin rango en la vista, `POST reversos/auto` toma los abonos de los últimos 90 días (default del DTO del API). */
export const DIAS_AUTO_SIN_RANGO = 90;

/** «Cuenta: GASTOS GNRAL · del 01 sep 2026 al 30 sep 2026» (lo que se va a tocar). */
export function textoAlcanceAuto(a: {
  cuenta?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): string {
  const cuenta = a.cuenta?.trim() ? `Cuenta: ${a.cuenta.trim()}` : "Todas las cuentas";
  const rango =
    a.desde && a.hasta
      ? ` · del ${fmtDateOnly(a.desde)} al ${fmtDateOnly(a.hasta)}`
      : a.desde
        ? ` · desde el ${fmtDateOnly(a.desde)}`
        : a.hasta
          ? ` · hasta el ${fmtDateOnly(a.hasta)}`
          : ` · abonos de los últimos ${DIAS_AUTO_SIN_RANGO} días`;
  return `${cuenta}${rango}.`;
}

const entero = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
};

export interface ResumenReversosAuto {
  titulo: string;
  lineas: string[];
  descripcion: string;
  emparejados: number;
  tono: "exito" | "info";
}

/** Resumen del lote en palabras del operador. */
export function resumenReversosAuto(
  r: Partial<ReversosAutoResultado> | null | undefined,
): ResumenReversosAuto {
  const emparejados = entero(r?.emparejados);
  const sinCandidato = entero(r?.sin_candidato);
  const ambiguos = entero(r?.ambiguos);
  const errores = entero(r?.errores);
  const total = emparejados + sinCandidato + ambiguos + errores;

  const titulo =
    total === 0
      ? "No había devoluciones del banco pendientes de emparejar"
      : emparejados === 0
        ? "Ninguna devolución se pudo emparejar sola"
        : emparejados === 1
          ? "1 devolución quedó conciliada con su cargo"
          : `${emparejados} devoluciones quedaron conciliadas con su cargo`;

  const lineas: string[] = [];
  if (sinCandidato > 0)
    lineas.push(
      `${sinCandidato} sin cargo pendiente por el mismo monto (si el cargo está ligado a un gasto, desvincúlalo primero)`,
    );
  if (ambiguos > 0)
    lineas.push(
      `${ambiguos} con varios cargos posibles en fechas distintas: emparéjala${ambiguos === 1 ? "" : "s"} a mano con «${MENU_ABONO_DEVOLUCION}»`,
    );
  if (errores > 0) lineas.push(`${errores} con error (el resto sí se procesó)`);

  return {
    titulo,
    lineas,
    descripcion: lineas.join(" · "),
    emparejados,
    tono: emparejados > 0 ? "exito" : "info",
  };
}

// ─────────────────────── Pista en la fila pendiente ───────────────────────

/**
 * ABONO pendiente cuya descripción dice «devolución»: se le pinta la pista
 * bajo el badge (el API no calcula motivo para abonos). null = no aplica.
 */
export function pistaPendienteDevolucion(
  m: Pick<MovimientoReversoInfo, "tipo" | "descripcion" | "conciliado">,
): { etiqueta: string; detalle: string } | null {
  if (m.conciliado === true || m.tipo !== "ABONO" || !esDescripcionDevolucion(m.descripcion)) return null;
  return {
    etiqueta: "Parece devolución",
    detalle: `El banco devolvió un cargo: NO es un ingreso. Emparéjalo con su cargo desde el menú (⋯) → «${MENU_ABONO_DEVOLUCION}», o con «${BOTON_EMPAREJAR_AUTO}».`,
  };
}
