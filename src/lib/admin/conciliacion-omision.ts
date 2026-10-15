/**
 * «OMITIR LA CONCILIACIÓN» en el panel (14-oct-2026, API 0.0.77, invariante
 * 75 del API). Pedido textual: «Necesitamos una opción de pendientes de
 * conciliar venga una opción de Omitir la conciliación.»
 *
 * Un movimiento omitido = clasificación canónica «Omitido de la
 * conciliación» + la línea firmada al inicio de sus notas («Omitido de la
 * conciliación: <motivo> — <usuario>, dd-mmm-aaaa»). La línea, el estado de
 * cada movimiento, los riesgos y las escrituras son del API (RPC todo o
 * nada); el panel NO arma la línea ni decide nada: pinta la omisión que el
 * API leyó (`omision`), pide el motivo, enseña la revisión de riesgos y
 * traduce las respuestas.
 *
 * PURO (sin React ni red; prueba `__tests__/conciliacion-omision.test.ts`,
 * con la paridad contra el API cuando el repo hermano está al lado). Los
 * totales de la selección viven en `conciliacion-seleccion.ts` (esta
 * dirección de importación: nunca al revés).
 */

import type {
  ConciliacionResumenCuenta,
  MovimientoBancario,
  MovimientoEnErrorOmision,
  OmisionMovimiento,
} from "@/types/conciliacion";
import { esErrorTecnico } from "./errores-tecnicos";
import { MSG_SESION_EXPIRADA, esRutaInexistente } from "./conciliacion-lote";
import { fmtMontoConciliacion, numeroDe } from "./conciliacion-parcial";
import { textoGruposResumen, type ResumenSeleccion } from "./conciliacion-seleccion";

// ───────────────────────────── Espejos del API ─────────────────────────────

/** Nombre de la clasificación canónica (= `CLASIFICACION_OMITIDO` del API; prueba de paridad). */
export const CLASIFICACION_OMITIDO = "Omitido de la conciliación";
/** Motivo: 10..300 caracteres, recortado (= DTO `OmitirMovimientosDto`). */
export const MOTIVO_OMISION_MIN = 10;
export const MOTIVO_OMISION_MAX = 300;
/** = `MENSAJE_OPCION_NO_ACTIVA` del API: ruta inexistente o la migración sin aplicar. */
export const MSG_OPCION_NO_ACTIVA = "Esta opción todavía no está activa: avisa a sistemas.";
/** Códigos estables del API (503) cuando falta la migración 20261014000002. */
const CODIGOS_NO_ACTIVA = new Set(["RUTA_NO_DISPONIBLE", "CONCILIACION_OMITIR_NO_DISPONIBLE"]);

/**
 * ¿Es la canónica? (espejo de `esClasificacionOmitida` del API: recortado,
 * espacios colapsados y en minúsculas es-MX, con acentos). El catálogo de
 * «Clasificar» la filtra con esto aunque el API 0.0.77 ya no la mande.
 */
export function esClasificacionOmitida(nombre: string | null | undefined): boolean {
  if (typeof nombre !== "string") return false;
  return (
    nombre.replace(/\s+/g, " ").trim().toLocaleLowerCase("es-MX") ===
    CLASIFICACION_OMITIDO.toLocaleLowerCase("es-MX")
  );
}

// ───────────────────────────── La fila ─────────────────────────────

/** ¿Está omitido? (`omision` del API, nunca por el nombre de la clasificación). */
export function esOmitido(
  m: Pick<MovimientoBancario, "omision"> | null | undefined,
): m is Pick<MovimientoBancario, "omision"> & { omision: OmisionMovimiento } {
  return m?.omision != null;
}

/**
 * ¿El API ya sabe omitir? El 0.0.77 manda la LLAVE `omision` en TODA fila
 * (null o la omisión); un API ≤ 0.0.76 no la manda y entonces no se ofrece
 * nada de lo nuevo (ni casillas, ni «Omitir…», ni «Deshacer…»).
 */
export function apiConOmision(movs: ReadonlyArray<object | null | undefined>): boolean {
  return movs.some((m) => m != null && Object.prototype.hasOwnProperty.call(m, "omision"));
}

export const ETIQUETA_BADGE_OMITIDO = "Omitido";

/** Tooltip: «Omitido por Alejandro Canales el 14-oct-2026: Comisión o IVA del banco»; sin datos, «Omitido de la conciliación». */
export function tituloOmision(o: OmisionMovimiento | null | undefined): string {
  const motivo = o?.motivo?.trim();
  const por = o?.por?.trim();
  const fecha = o?.fecha?.trim();
  if (!motivo || !por || !fecha) return CLASIFICACION_OMITIDO;
  return `Omitido por ${por} el ${fecha}: ${motivo}`;
}

/** Debajo del badge: el motivo o «Sin motivo legible» (línea dañada). */
export function textoMotivoFila(o: OmisionMovimiento | null | undefined): string {
  return o?.motivo?.trim() || "Sin motivo legible";
}

/** Para la búsqueda rápida: «Omitido <motivo> <por>» (buscar «omitido» o el motivo los encuentra). */
export function textoBusquedaOmision(m: Pick<MovimientoBancario, "omision">): string {
  if (!esOmitido(m)) return "";
  return ["Omitido", m.omision.motivo, m.omision.por].filter(Boolean).join(" ");
}

// ───────────────────────────── El diálogo «Omitir la conciliación» ─────────────────────────────

export const SUGERENCIAS_MOTIVO_OMISION: readonly string[] = [
  "Comisión o IVA del banco",
  "Traspaso entre cuentas propias",
  "Movimiento personal (no es de la empresa)",
  "Anterior al uso del sistema (no se concilia)",
  "Duplicado en el estado de cuenta",
];

export type TonoMotivo = "aviso" | "error" | "ok";

/** El contador del motivo (recortado, como el DTO): falta, sobra o vale. */
export function estadoMotivoOmision(t: string | null | undefined): { valido: boolean; texto: string; tono: TonoMotivo } {
  const n = (t ?? "").trim().length;
  if (n < MOTIVO_OMISION_MIN) {
    return {
      valido: false,
      texto: `Escribe por qué no se concilia (mínimo ${MOTIVO_OMISION_MIN} caracteres).`,
      tono: "aviso",
    };
  }
  if (n > MOTIVO_OMISION_MAX) {
    return { valido: false, texto: `Máximo ${MOTIVO_OMISION_MAX} caracteres.`, tono: "error" };
  }
  return {
    valido: true,
    texto: `${n}/${MOTIVO_OMISION_MAX} · Se guarda en las notas con tu nombre y la fecha.`,
    tono: "ok",
  };
}

/** «Omitir la conciliación de 14 movimientos» · con 1: «… de este movimiento». */
export function tituloOmitir(n: number): string {
  return n === 1
    ? "Omitir la conciliación de este movimiento"
    : `Omitir la conciliación de ${n} movimientos`;
}

export const DESCRIPCION_OMITIR =
  "Dejan de contar como pendientes («Faltan …») sin ligarse a ningún gasto, cobro ni ingreso. Quedan como «Omitido» con tu motivo, tu nombre y la fecha, y se regresan a Pendientes desde la pestaña «Omitidos».";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** «24 sep» (día de pared YYYY-MM-DD, sin Intl: determinista). */
export function fechaCortaMovimiento(fecha: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? ""));
  const mes = m ? MESES_CORTOS[Number(m[2]) - 1] : undefined;
  return m && mes ? `${m[3]} ${mes}` : "sin fecha";
}

function unaLinea(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Renglón de la lista del diálogo: «24 sep · GASTOS GNRAL · IVA - COMISIONES
 * · $1.12 (cargo)» (« USD» fuera de pesos; sin alias, sin esa parte).
 */
export function lineaListaOmitir(
  m: Pick<MovimientoBancario, "fecha" | "descripcion" | "monto" | "tipo">,
  alias: string | null | undefined,
  moneda?: string | null,
): string {
  const partes = [
    fechaCortaMovimiento(m.fecha),
    (alias ?? "").trim(),
    unaLinea(m.descripcion, 60),
    `${fmtMontoConciliacion(Math.abs(numeroDe(m.monto)), moneda)} (${m.tipo === "ABONO" ? "abono" : "cargo"})`,
  ].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Un movimiento nombrado en un aviso: «10 ago · ASA CANCUN $3,216.27»
 * (espejo de `lineaMovimientoMensaje` del API: descripción ≤ 40, « USD»
 * fuera de pesos).
 */
export function lineaMovimientoAviso(m: {
  fecha?: string | null;
  descripcion?: string | null;
  monto?: number | string | null;
  moneda?: string | null;
}): string {
  const desc = unaLinea(m.descripcion, 40);
  return [fechaCortaMovimiento(m.fecha ?? null), "·", ...(desc ? [desc] : []), fmtMontoConciliacion(Math.abs(numeroDe(m.monto)), m.moneda)].join(" ");
}

/** «14 movimientos · 14 cargos $56.84 MXN» (el resumen del diálogo). */
export function resumenOmitir(r: ResumenSeleccion): string {
  const cabeza = `${r.n} ${r.n === 1 ? "movimiento" : "movimientos"}`;
  const grupos = textoGruposResumen(r);
  return grupos ? `${cabeza} · ${grupos}` : cabeza;
}

export const TEXTO_REVISANDO = "Revisando si alguno tiene un gasto o un cobro que cuadre…";
export const TEXTO_REVISION_FALLO = "No se pudo revisar si alguno tiene un gasto o un cobro que cuadre.";
export const BOTON_REINTENTAR_REVISION = "Reintentar";

/** «Ojo: 2 podrían conciliarse de verdad» · con 1: «Ojo: 1 podría conciliarse de verdad». */
export function textoAvisoRiesgos(n: number): string {
  return n === 1 ? "Ojo: 1 podría conciliarse de verdad" : `Ojo: ${n} podrían conciliarse de verdad`;
}

/** «Quitar esos 2 de la selección» · con 1: «Quitar ese movimiento de la selección». */
export function botonQuitarRiesgos(n: number): string {
  return n === 1 ? "Quitar ese movimiento de la selección" : `Quitar esos ${n} de la selección`;
}

/** «También omitir estos 2 (revisé que no son el pago de un gasto o un cobro)» · con 1: «… este (… no es …)». */
export function casillaAceptarRiesgos(n: number): string {
  return n === 1
    ? "También omitir este (revisé que no es el pago de un gasto o un cobro)"
    : `También omitir estos ${n} (revisé que no son el pago de un gasto o un cobro)`;
}

/** «2 abonos: si es el pago de un cliente, concílialo en Ingresos → «Por conciliar» en vez de omitirlo.» */
export function avisoAbonosIngresos(n: number): string | null {
  if (!(n > 0)) return null;
  return `${n} ${n === 1 ? "abono" : "abonos"}: si es el pago de un cliente, concílialo en Ingresos → «Por conciliar» en vez de omitirlo.`;
}

/**
 * Los que la revisión encontró ya NO pendientes (o que ya no existen):
 * «1 ya no está pendiente:» · «2 ya no están pendientes:».
 */
export function textoNoPendientesRevision(n: number): string {
  return n === 1 ? "1 ya no está pendiente:" : `${n} ya no están pendientes:`;
}
export const TEXTO_YA_NO_EXISTE = "ya no existe";

/** Desde 20 movimientos la casilla «Revisé la lista» es obligatoria. */
export const MINIMO_REVISAR_MUCHOS = 20;
export function requiereCasillaMuchos(n: number): boolean {
  return n >= MINIMO_REVISAR_MUCHOS;
}
/** «Revisé la lista: omitir los 24 movimientos.» */
export function casillaRevisarMuchos(n: number): string {
  return `Revisé la lista: omitir los ${n} movimientos.`;
}
/** El clic en «Omitir» sin la casilla de 20 o más lo explica. */
export function avisoFaltaRevisarMuchos(n: number): string {
  return `Marca «${casillaRevisarMuchos(n)}» para continuar.`;
}
/**
 * El clic con TODOS con aviso y sin aceptarlos lo explica (nada que mandar).
 * Revisión del 15-oct-2026: desde el ⋯ de UNA fila no hay selección ni
 * «Quitar…» (solo «Cancelar») y el texto iba en plural: «Este movimiento
 * tiene aviso: marca «También omitir este…» si revisaste que no se concilia,
 * o cancela.»; desde la barra, «… o quítalo(s) de la selección.».
 */
export function textoFaltaAceptarRiesgos(p: { n: number; conSeleccion: boolean }): string {
  if (p.n === 1) {
    return `Este movimiento tiene aviso: marca «También omitir este…» si revisaste que no se concilia, o ${
      p.conSeleccion ? "quítalo de la selección" : "cancela"
    }.`;
  }
  return `Todos tienen aviso: marca «También omitir…» si revisaste que no se concilian, o ${
    p.conSeleccion ? "quítalos de la selección" : "cancela"
  }.`;
}
/** El de la barra con varios (el texto de siempre). */
export const TEXTO_FALTA_ACEPTAR_RIESGOS = textoFaltaAceptarRiesgos({ n: 2, conSeleccion: true });

/** Nombre accesible de la lista del diálogo y del de deshacer. */
export const ETIQUETA_LISTA_OMITIR = "Movimientos a omitir";
export const ETIQUETA_LISTA_QUITAR_OMISION = "Movimientos que vuelven a Pendientes";

export const NOTA_OMITIDO_NO_SE_CRUZA =
  "Un movimiento omitido ya no se cruza solo: si después capturas su gasto, deshaz la omisión y vincúlalo.";
export const ETIQUETA_MOTIVO_OMISION = "¿Por qué no se concilian? (obligatorio)";
export const PLACEHOLDER_MOTIVO_OMISION = "Ej. Comisión o IVA del banco";

/**
 * El botón de enviar: «Omitir 14 movimientos» · «Omitir 12 (sin los 2 con
 * aviso)» · «Omitir este movimiento» (n = 1). `n` = la lista; `nSinRiesgo` =
 * los que no tienen aviso; `aceptaRiesgos` = la casilla de los avisos.
 */
export function botonOmitir(p: { n: number; nSinRiesgo: number; aceptaRiesgos: boolean }): string {
  const nRiesgo = Math.max(0, p.n - p.nSinRiesgo);
  if (nRiesgo > 0 && !p.aceptaRiesgos && p.nSinRiesgo > 0) {
    return `Omitir ${p.nSinRiesgo} (${nRiesgo === 1 ? "sin el 1 con aviso" : `sin los ${nRiesgo} con aviso`})`;
  }
  return p.n === 1 ? "Omitir este movimiento" : `Omitir ${p.n} movimientos`;
}
export const TEXTO_OMITIENDO = "Omitiendo…";

/** Toast del éxito: «14 movimientos omitidos de la conciliación» + qué pasó y dónde se deshace. */
export function toastOmitidos(n: number): { titulo: string; descripcion: string } {
  return {
    titulo:
      n === 1 ? "1 movimiento omitido de la conciliación" : `${n} movimientos omitidos de la conciliación`,
    descripcion: "Ya no cuentan en «Faltan». Se deshacen en la pestaña «Omitidos».",
  };
}

/** «Omisión deshecha: 3 movimientos vuelven a Pendientes.» */
export function toastRestaurados(n: number): string {
  return n === 1
    ? "Omisión deshecha: 1 movimiento vuelve a Pendientes."
    : `Omisión deshecha: ${n} movimientos vuelven a Pendientes.`;
}
export const BOTON_DESHACER = "Deshacer";
export const MSG_DESHACER_FALLO = "No se pudo deshacer: hazlo desde la pestaña «Omitidos».";

// ───────────────────────────── «¿Deshacer la omisión…?» ─────────────────────────────

/** «¿Deshacer la omisión de 3 movimientos?» · con 1: «… de este movimiento?». */
export function tituloQuitarOmision(n: number): string {
  return n === 1 ? "¿Deshacer la omisión de este movimiento?" : `¿Deshacer la omisión de ${n} movimientos?`;
}
export const TEXTO_QUITAR_OMISION =
  "Vuelven a «Pendientes» y a contar en «Faltan». De sus notas se quita solo la línea «Omitido de la conciliación…»; lo demás no cambia.";
export const BOTON_CONFIRMAR_QUITAR_OMISION = "Deshacer la omisión";
export const TEXTO_DESHACIENDO = "Deshaciendo…";

// ───────────────────────────── Menú ⋯ ─────────────────────────────

export const MENU_OMITIR = "Omitir la conciliación…";
export const MENU_QUITAR_OMISION = "Deshacer la omisión…";

// ───────────────────────────── Errores ─────────────────────────────

export type AccionOmision = "omitir" | "deshacer";

/** Lo que devuelve una server action de esta sección al fallar. */
export interface ResultadoAccionOmision {
  ok?: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
  details?: unknown;
}

export interface ErrorOmision {
  titulo: string;
  descripcion?: string;
  /** Red o 5xx: no se sabe si se escribió (todo o nada en el API, pero la respuesta se perdió). */
  incierto: boolean;
  /** La lista que se ve ya no es la vigente: un `router.refresh()` (al cerrar o de inmediato si es incierto). */
  refrescar: boolean;
  /** Ids que el API nombró (no pendientes, no omitidos o inexistentes): «Quitar esos N de la selección». */
  quitarIds?: string[];
  /** 409 OMITIR_CON_RIESGO: los avisos del API para pintarlos (se conservan motivo y selección). */
  riesgos?: MovimientoEnErrorOmision[];
}

export const MSG_SIN_PERMISO_CONCILIAR = "Tu usuario no puede conciliar movimientos del banco.";

/** «No se pudo confirmar si se omitieron / si se deshizo: revisa la lista antes de reintentar.» */
export function textoIncierto(accion: AccionOmision): string {
  return accion === "omitir"
    ? "No se pudo confirmar si se omitieron: revisa la lista antes de reintentar."
    : "No se pudo confirmar si se deshizo: revisa la lista antes de reintentar.";
}

/** Un 4xx sin texto útil: nada se escribió (todo o nada). */
function textoRechazoGenerico(accion: AccionOmision): string {
  return accion === "omitir"
    ? "No se omitió ningún movimiento: vuelve a intentarlo; si sigue igual, avisa a sistemas."
    : "No se deshizo ninguna omisión: vuelve a intentarlo; si sigue igual, avisa a sistemas.";
}

/** «MOVIMIENTO_NO_PENDIENTE: …» ⇒ «…» (el código no se pinta). */
function sinPrefijoCodigo(mensaje: string | null | undefined): string {
  return (mensaje ?? "").trim().replace(/^[A-Z][A-Z_]{2,}:\s*/, "");
}

function idsDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x as { id?: unknown }).id : null))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

function detalles(r: ResultadoAccionOmision): Record<string, unknown> {
  return r.details && typeof r.details === "object" && !Array.isArray(r.details)
    ? (r.details as Record<string, unknown>)
    : {};
}

/**
 * 400 «property movimiento_ids should not exist» (o `motivo`,
 * `aceptar_riesgo_ids`): un DTO previo que no conoce lo de omitir. Igual que
 * una ruta inexistente: nada se escribió y la opción «todavía no está activa».
 */
export function esDtoSinOmision(r: { status?: number | null; error?: string | null }): boolean {
  return (
    r.status === 400 && /property (movimiento_ids|motivo|aceptar_riesgo_ids) should not exist/i.test(r.error ?? "")
  );
}

/** ¿El API no tiene (todavía) lo de omitir? Ruta inexistente, DTO previo o su 503 con código estable. */
export function esOmisionNoActiva(r: ResultadoAccionOmision | null | undefined): boolean {
  if (!r) return false;
  return CODIGOS_NO_ACTIVA.has(r.code ?? "") || esRutaInexistente(r) || esDtoSinOmision(r);
}

/**
 * El error de omitir / deshacer en palabras del operador. Orden: sin
 * conexión ⇒ incierto; ruta inexistente o 503 de la migración ⇒ «todavía no
 * está activa»; 401/403; red o 5xx ⇒ incierto (la respuesta se perdió, la
 * RPC pudo correr); 4xx ⇒ el texto del API (todo o nada: no se escribió
 * nada), con los ids que nombró y, en OMITIR_CON_RIESGO, los avisos.
 */
export function mensajeErrorOmision(r: ResultadoAccionOmision, accion: AccionOmision): ErrorOmision {
  if (r.code === "SIN_CONEXION") return { titulo: textoIncierto(accion), incierto: true, refrescar: true };
  if (esOmisionNoActiva(r)) return { titulo: MSG_OPCION_NO_ACTIVA, incierto: false, refrescar: false };
  if (r.status === 401) return { titulo: MSG_SESION_EXPIRADA, incierto: false, refrescar: false };
  if (r.status === 403) return { titulo: MSG_SIN_PERMISO_CONCILIAR, incierto: false, refrescar: false };
  if (r.status == null || r.status >= 500) {
    return { titulo: textoIncierto(accion), incierto: true, refrescar: true };
  }
  const d = detalles(r);
  const texto = esErrorTecnico({ error: r.error, code: r.code }) ? "" : sinPrefijoCodigo(r.error);
  const titulo = texto || textoRechazoGenerico(accion);
  switch (r.code) {
    case "OMITIR_CON_RIESGO": {
      const riesgos = (Array.isArray(d.movimientos) ? d.movimientos : []).filter(
        (x): x is MovimientoEnErrorOmision =>
          !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string",
      );
      return { titulo, incierto: false, refrescar: false, riesgos };
    }
    case "MOVIMIENTO_NO_PENDIENTE":
    case "MOVIMIENTO_NO_OMITIDO":
      return { titulo, incierto: false, refrescar: true, quitarIds: idsDe(d.movimientos) };
    case "MOVIMIENTO_NO_EXISTE":
      return { titulo, incierto: false, refrescar: true, quitarIds: idsDe(d.faltan) };
    default:
      return { titulo, incierto: false, refrescar: false };
  }
}

/** El error de la REVISIÓN (solo lectura): nada que confirmar; se dice y se ofrece «Reintentar». */
export function mensajeErrorRevision(r: ResultadoAccionOmision): string {
  if (esOmisionNoActiva(r)) return MSG_OPCION_NO_ACTIVA;
  if (r.status === 401) return MSG_SESION_EXPIRADA;
  if (r.status === 403) return MSG_SIN_PERMISO_CONCILIAR;
  if (r.status === 400 && !esErrorTecnico({ error: r.error, code: r.code })) {
    return sinPrefijoCodigo(r.error) || TEXTO_REVISION_FALLO;
  }
  return TEXTO_REVISION_FALLO;
}

// ───────────────────────────── Página: pestaña y tarjetas ─────────────────────────────

/** «Omitidos» / «Omitidos (14)» (sin dato del API: sin número; jamás un 0 inventado). */
export function textoPestanaOmitidos(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? `Omitidos (${n})` : "Omitidos";
}

/**
 * Cuántos omitidos hay en la vista, del resumen por cuenta del API (o de la
 * cuenta filtrada). null = no se sabe: el resumen no cargó, el API es previo
 * (sin la llave) o no pudo leer la canónica (`omitidos: null`).
 */
export function conteoOmitidosDeResumen(
  resumen: readonly ConciliacionResumenCuenta[] | null | undefined,
  cuentaId?: string | null,
): number | null {
  if (!resumen) return null;
  if (resumen.some((c) => c.omitidos === undefined)) return null;
  const filas = cuentaId ? resumen.filter((c) => c.cuenta_bancaria_id === cuentaId) : resumen;
  let total = 0;
  for (const c of filas) {
    if (typeof c.omitidos !== "number" || !Number.isFinite(c.omitidos)) return null;
    total += c.omitidos;
  }
  return total;
}

/** La tarjeta por cuenta: «incluye 14 omitidos» (el número va como enlace a la pestaña). */
export function partesTarjetaOmitidos(n: number | null | undefined): { antes: string; enlace: string } | null {
  if (typeof n !== "number" || !(n > 0)) return null;
  return { antes: "incluye ", enlace: n === 1 ? "1 omitido" : `${n} omitidos` };
}
/** «incluye 1 omitido» / «incluye 14 omitidos» (null con 0 o sin dato). */
export function textoTarjetaOmitidos(n: number | null | undefined): string | null {
  const p = partesTarjetaOmitidos(n);
  return p ? `${p.antes}${p.enlace}` : null;
}
export const TITULO_ENLACE_OMITIDOS = "Ver los movimientos omitidos de esta cuenta";

export const TEXTO_OMITIDOS_NO_DISPONIBLE = "Esta pestaña todavía no está activa: avisa a sistemas.";
export const TEXTO_OMITIDOS_NO_CARGO = "No se pudo consultar la lista de omitidos: recarga la página.";
export const TITULO_VACIO_OMITIDOS = "Sin movimientos omitidos";

/** «No hay movimientos omitidos.» · «… del 01 oct 2026 al 12 oct 2026.» · «… en esta cuenta.» */
export function textoVacioOmitidos(textoRango: string | null | undefined, enCuenta = false): string {
  return `No hay movimientos omitidos${textoRango ? ` ${textoRango}` : ""}${enCuenta ? " en esta cuenta" : ""}.`;
}

/**
 * Por qué no se pudo leer la pestaña: un API previo rechaza la llave
 * (400 «property solo_omitidos should not exist») ⇒ «todavía no está activa»;
 * cualquier otra falla (503 OMITIDOS_NO_DISPONIBLE, red…) ⇒ «no se pudo
 * consultar». Jamás la lista vacía ni el error de página.
 */
export function fallaListaOmitidos(err: unknown): "NO_ACTIVA" | "NO_CARGO" {
  const e = (err ?? {}) as { status?: unknown; message?: unknown };
  return e.status === 400 && /solo_omitidos/i.test(String(e.message ?? "")) ? "NO_ACTIVA" : "NO_CARGO";
}

// ───────────────────────────── «Clasificar» ─────────────────────────────

/** La lectura del catálogo falló: nunca «Aún no hay clasificaciones». */
export const MSG_CLASIFICACIONES_NO_CARGARON = "No se pudieron cargar las clasificaciones: cierra y vuelve a abrir.";

/**
 * `esperado_clasificacion_id` de «Clasificar» / «Quitar clasificación» (API
 * 0.0.77): la clasificación que el panel VIO. El API responde 409
 * MOVIMIENTO_CAMBIO si ya no es la vigente; con `null` entiende «estaba
 * PENDIENTE» (sin clasificación Y sin conciliar). Revisión del 15-oct-2026:
 *  - se CAPTURA al abrir el diálogo o la confirmación (no en cada render: un
 *    `router.refresh()` con el diálogo abierto —RefreshOnFocus— cambiaba el
 *    esperado y el candado nunca saltaba: «Guardar» pisaba sin aviso el
 *    cambio de otra persona y «Quitar clasificación» deshacía una omisión
 *    ajena);
 *  - NO viaja con un API ≤ 0.0.76 (sin la llave `omision`: su DTO la
 *    rechaza) ni para un movimiento `conciliado` SIN clasificación (dato
 *    viejo conciliado sin liga visible): con `null` el API respondería 409
 *    SIEMPRE y la fila ya no se podría clasificar; sin la llave compara
 *    contra lo que acaba de leer, como antes del 0.0.77.
 */
export function esperadoClasificacionDe(
  m: Pick<MovimientoBancario, "clasificacion_id" | "conciliado"> & Partial<Pick<MovimientoBancario, "omision">>,
): { esperado_clasificacion_id?: string | null } {
  if (!apiConOmision([m])) return {};
  if (m.conciliado === true && m.clasificacion_id == null) return {};
  return { esperado_clasificacion_id: m.clasificacion_id ?? null };
}
/** `esperado_clasificacion_id` que no es uuid (no sale a la red). */
export const MSG_CLASIFICACION_ESPERADA_INVALIDA = "Clasificación inválida: recarga la página.";

// ───────────────────────────── Server actions (validación antes de la red) ─────────────────────────────

export const MSG_ELIGE_MOVIMIENTOS = "Elige al menos un movimiento.";
export const MSG_MOVIMIENTOS_REPETIDOS = "Hay movimientos repetidos en la selección.";
export const MSG_MOVIMIENTO_INVALIDO = "Algún movimiento de la selección no es válido: recarga la página.";
export const MSG_MOTIVO_CORTO = `El motivo debe tener al menos ${MOTIVO_OMISION_MIN} caracteres.`;
export const MSG_MOTIVO_LARGO = `El motivo admite hasta ${MOTIVO_OMISION_MAX} caracteres.`;
export const MSG_ACEPTAR_RIESGO_INVALIDO = "Los movimientos con aviso que confirmas deben estar en la selección.";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La lista de movimientos antes de la red (espejo del DTO del API: 1..tope,
 * uuid, sin repetir). null = válida; si no, el texto (los del DTO).
 */
export function errorListaMovimientos(ids: unknown, tope: number): string | null {
  if (!Array.isArray(ids) || ids.length === 0) return MSG_ELIGE_MOVIMIENTOS;
  if (ids.length > tope) return `Se pueden seleccionar hasta ${tope} movimientos por lote.`;
  if (!ids.every((x) => typeof x === "string" && RE_UUID.test(x))) return MSG_MOVIMIENTO_INVALIDO;
  if (new Set(ids.map((x) => (x as string).toLowerCase())).size !== ids.length) return MSG_MOVIMIENTOS_REPETIDOS;
  return null;
}

/** El motivo antes de la red (recortado, 10..300, como el DTO). null = válido. */
export function errorMotivoOmision(motivo: unknown): string | null {
  const t = typeof motivo === "string" ? motivo.trim() : "";
  if (t.length < MOTIVO_OMISION_MIN) return MSG_MOTIVO_CORTO;
  if (t.length > MOTIVO_OMISION_MAX) return MSG_MOTIVO_LARGO;
  return null;
}
