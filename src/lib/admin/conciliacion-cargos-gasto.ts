/**
 * «VINCULAR A UN GASTO…» CON VARIOS CARGOS (14-oct-2026, API 0.0.77,
 * invariante 76 del API). Pedido textual: «Necesitamos poder seleccionar
 * varias filas de conciliaciones pendientes para todo eso ponerlas a un solo
 * gasto, si no existe el gasto que permita crearlo por la cantidad de la suma
 * de todas las que se seleccionaron.»
 *
 * La SUMA de los cargos, los gastos candidatos, su orden y si la suma CUBRE,
 * deja PARCIAL o EXCEDE a cada gasto los calcula el API
 * (`POST cargos/gastos-candidatos`, solo lectura); la liga es UNA transacción
 * del API (`POST gastos/:id/cargos`, RPC todo o nada). El panel NO decide:
 * pinta la respuesta, enseña los avisos que manda el API (cargos con su
 * propio gasto) y traduce los errores. Jamás suma dinero para decidir.
 *
 * PURO (sin React ni red; prueba `__tests__/conciliacion-cargos-gasto.test.ts`,
 * con la paridad contra el API cuando el repo hermano está al lado). Importa
 * de `conciliacion-seleccion`, `conciliacion-omision` y `conciliacion-lote`;
 * nunca al revés. «Créalo por la suma» (paso 4, al final del archivo) suma
 * aquí su prellenado, el paso de los posibles duplicados y sus textos.
 */

import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { MEDIO_DOMICILIADO } from "@/lib/admin/medios-pago";
import { fmtDateOnly } from "@/lib/datetime";
import type {
  CandidatoGastoPorSuma,
  CargoConCandidatoPropio,
  CargosGastosCandidatosResponse,
  CargosResumen,
  ConciliacionAlCrear,
  GastoCandidato,
  LigarCargosGastoRespuesta,
  MovimientoBancario,
} from "@/types/conciliacion";
import { descripcionCandidatoGasto } from "./conciliacion-auto";
import {
  MSG_SESION_EXPIRADA,
  esRutaInexistente,
  fichaCandidatoGasto,
  textoExcluidosCandidatos,
  textoTruncado,
  type AvisoExcluidos,
  type ResultadoAccionLote,
  type TipoEstadoBuscador,
} from "./conciliacion-lote";
import { mediosBancariosEnFrase, montoNotaVinculo } from "./conciliacion-no-bancario";
import {
  DIAS_DUPLICADOS,
  TEXTO_BUSCANDO_DUPLICADOS,
  duplicadosDeCandidatos,
  pareceCargoRecurrente,
} from "./gasto-desde-cargo";
import {
  MSG_OPCION_NO_ACTIVA,
  MSG_SIN_PERMISO_CONCILIAR,
  esDtoSinOmision,
  fechaCortaMovimiento,
} from "./conciliacion-omision";
import { fmtMontoConciliacion, numeroDe } from "./conciliacion-parcial";
import { MAX_CARGOS_A_GASTO, MIN_CARGOS_A_GASTO } from "./conciliacion-seleccion";
import { esErrorTecnico } from "./errores-tecnicos";

const fmt = (v: unknown, moneda?: string | null) => fmtMontoConciliacion(v, moneda ?? null);

/** Una línea, sin espacios de más, recortada con «…». */
function unaLinea(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// ───────────────────────────── Espejos del API ─────────────────────────────

/** = `MENSAJE_LOTE_CARGOS_INVALIDO` del API (DTO y servicio; prueba de paridad). */
export const MSG_LOTE_CARGOS_INVALIDO =
  "Elige de 2 a 50 cargos sin repetir (con uno, usa «Vincular gasto» del menú ⋯).";
/** = el `@IsUUID` del DTO `ListaCargosGastoDto` (prueba de paridad). */
export const MSG_CARGO_INVALIDO = "Algún cargo de la selección no es válido: recarga la página.";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La lista de cargos antes de la red (espejo del DTO del API: 2..50 uuid sin
 * repetir; el API también deduplica sin distinguir mayúsculas). null = válida.
 */
export function errorListaCargosGasto(ids: unknown): string | null {
  if (!Array.isArray(ids) || ids.length < MIN_CARGOS_A_GASTO || ids.length > MAX_CARGOS_A_GASTO) {
    return MSG_LOTE_CARGOS_INVALIDO;
  }
  if (!ids.every((x) => typeof x === "string" && RE_UUID.test(x))) return MSG_CARGO_INVALIDO;
  if (new Set(ids.map((x) => (x as string).toLowerCase())).size !== ids.length) return MSG_LOTE_CARGOS_INVALIDO;
  return null;
}

// ───────────────────────────── Encabezado y cargos ─────────────────────────────

/**
 * «Vincular 2 cargos a un gasto» · con 1 (quitaron los demás de la selección):
 * «Vincular 1 cargo a un gasto».
 */
export function tituloVincularCargos(n: number): string {
  return n === 1 ? "Vincular 1 cargo a un gasto" : `Vincular ${n} cargos a un gasto`;
}

export const DESCRIPCION_VINCULAR_CARGOS =
  "Los cargos se suman y pagan UN gasto (una factura cobrada en varios cargos).";

/** Mientras el API no ha sumado (o si no pudo): solo el conteo, nunca una suma del panel. Con 1: «1 cargo seleccionado». */
export function textoCargosSinSuma(n: number): string {
  return n === 1 ? "1 cargo seleccionado" : `${n} cargos seleccionados`;
}

/** Nombre accesible de la lista de cargos del diálogo. */
export const ETIQUETA_LISTA_CARGOS = "Cargos que se vincularán";

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Las fechas de los cargos (días de pared): «03 ago 2026» (el mismo día) ·
 * «del 10 al 12 ago 2026» · «del 30 sep al 01 oct 2026» · «del 30 dic 2025 al
 * 02 ene 2026».
 */
export function textoFechasCargos(min: string | null | undefined, max: string | null | undefined): string {
  const a = RE_DIA.exec(String(min ?? ""));
  const b = RE_DIA.exec(String(max ?? ""));
  if (!a || !b) {
    const solo = a ?? b;
    return solo ? fmtDateOnly(solo[0]) : "";
  }
  if (a[0] === b[0]) return fmtDateOnly(b[0]);
  if (a[1] !== b[1]) return `del ${fmtDateOnly(a[0])} al ${fmtDateOnly(b[0])}`;
  if (a[2] !== b[2]) return `del ${fechaCortaMovimiento(a[0])} al ${fmtDateOnly(b[0])}`;
  return `del ${a[3]} al ${fmtDateOnly(b[0])}`;
}

/** El alias de una cuenta: el que mandó el API o, si no, el de la página. */
function aliasDe(c: { id: string; alias: string | null }, aliasPorCuenta?: Readonly<Record<string, string>> | null) {
  return (c.alias ?? aliasPorCuenta?.[c.id] ?? "").trim();
}

/**
 * El encabezado con la suma DEL API: «2 cargos de GASTOS GNRAL · suman
 * $400.00 MXN · 03 ago 2026»; varias cuentas: «2 cargos de 2 cuentas · …»;
 * sin alias: «2 cargos · …».
 */
export function encabezadoCargos(
  r: CargosResumen,
  aliasPorCuenta?: Readonly<Record<string, string>> | null,
): string {
  const n = r.n || r.ids?.length || 0;
  const cuentas = Array.isArray(r.cuentas) ? r.cuentas : [];
  const unaCuenta = cuentas.length === 1 ? aliasDe(cuentas[0], aliasPorCuenta) : "";
  const de = cuentas.length > 1 ? ` de ${cuentas.length} cuentas` : unaCuenta ? ` de ${unaCuenta}` : "";
  const fechas = textoFechasCargos(r.fecha_min, r.fecha_max);
  return `${n} cargos${de} · suman ${fmtMontoConciliacion(r.suma)} ${r.moneda}${fechas ? ` · ${fechas}` : ""}`;
}

/**
 * Un cargo de la lista: «03 ago · MERPAGO*AGREGADOR · ref 0025830577» y, aparte
 * (a la derecha), «$120.00» (« USD» fuera de pesos). Con `alias` (la selección
 * mezcla cuentas) va después de la fecha.
 */
export function lineaCargoVincular(
  m: Pick<MovimientoBancario, "fecha" | "descripcion" | "referencia" | "monto">,
  alias: string | null | undefined,
  moneda: string | null | undefined,
): { texto: string; monto: string } {
  const desc = unaLinea(m.descripcion, 60);
  const ref = unaLinea(m.referencia, 30);
  const partes = [
    fechaCortaMovimiento(m.fecha),
    (alias ?? "").trim(),
    desc,
    ref && !desc.includes(ref) ? `ref ${ref}` : "",
  ].filter(Boolean);
  return { texto: partes.join(" · "), monto: fmt(Math.abs(numeroDe(m.monto)), moneda) };
}

/** «Los cargos son de 2 cuentas (GASTOS GNRAL, EJE SCOTIA).» (sin todos los alias, sin la lista); null con una. */
export function avisoVariasCuentas(
  cuentas: ReadonlyArray<{ id: string; alias: string | null }> | null | undefined,
  aliasPorCuenta?: Readonly<Record<string, string>> | null,
): string | null {
  const lista = Array.isArray(cuentas) ? cuentas : [];
  if (lista.length <= 1) return null;
  const nombres = lista.map((c) => aliasDe(c, aliasPorCuenta));
  return nombres.every(Boolean)
    ? `Los cargos son de ${lista.length} cuentas (${nombres.join(", ")}).`
    : `Los cargos son de ${lista.length} cuentas.`;
}

/**
 * Aviso ÁMBAR con `cargos_con_candidato_propio` del API (caso falso de
 * Cozumel: 62.91 × 2 = 125.82): «2 de los cargos tienen un gasto que cuadra
 * solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por
 * uno desde su menú ⋯.» null sin ninguno (o sin el dato: ver la nota gris).
 */
export function avisoCargosConCandidatoPropio(
  lista: readonly CargoConCandidatoPropio[] | null | undefined,
): string | null {
  const n = Array.isArray(lista) ? lista.length : 0;
  if (n === 0) return null;
  return n === 1
    ? "1 de los cargos tiene un gasto que cuadra solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por uno desde su menú ⋯."
    : `${n} de los cargos tienen un gasto que cuadra solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por uno desde su menú ⋯.`;
}

/** `cargos_con_candidato_propio: null`: el API no pudo revisarlo (nota gris; jamás «ninguno»). */
export const NOTA_CANDIDATO_PROPIO_NO_VERIFICADO = "No se pudo revisar si algún cargo tiene su propio gasto.";

/** Junto al cargo que tiene su propio gasto: «tiene un gasto que cuadra solo» · «tiene 2 gastos que cuadran solos». */
export function marcaCandidatoPropio(c: Pick<CargoConCandidatoPropio, "motivo" | "candidatos_n">): string {
  if (c.motivo === "AMBIGUO") {
    const n = typeof c.candidatos_n === "number" && c.candidatos_n > 1 ? c.candidatos_n : null;
    return n ? `tiene ${n} gastos que cuadran solos` : "tiene varios gastos que cuadran solos";
  }
  return "tiene un gasto que cuadra solo";
}

// ───────────────────────────── La lista de gastos ─────────────────────────────

/** «Busca por monto (400.00), proveedor o nota» (sin la suma del API: sin el ejemplo). */
export function placeholderBuscarSuma(suma: number | null | undefined): string {
  const s = Math.abs(numeroDe(suma));
  return s > 0 ? `Busca por monto (${s.toFixed(2)}), proveedor o nota` : "Busca por monto, proveedor o nota";
}

/** «Gastos sin conciliar · ±30 días de los cargos». */
export function textoVentanaSuma(dias: number): string {
  return `Gastos sin conciliar · ±${dias} días de los cargos`;
}

export const BOTON_AMPLIAR_120 = "Ampliar a ±120 días";

/** Nota al pie: qué gastos salen y por qué no los de efectivo. */
export function notaVentanaSuma(dias: number): string {
  return `Gastos bancarios (${mediosBancariosEnFrase()}) sin conciliar, en la moneda de los cargos y con fecha ±${dias} días de los cargos; primero los que la suma cubre. Un gasto en efectivo no sale aquí: se vincula cargo por cargo desde el menú ⋯.`;
}

/** La lectura de candidatos falló: se dice y se ofrece «Reintentar» (jamás la lista vacía). */
export const TEXTO_CANDIDATOS_NO_CARGARON = "No se pudo cargar la lista de gastos: vuelve a intentarlo.";

/**
 * Qué pinta la lista. El ERROR va antes que el vacío (una lectura fallida
 * jamás se pinta como «ningún gasto»).
 */
export function estadoListaSuma(s: {
  cargando: boolean;
  error: string | null | undefined;
  q: string | null | undefined;
  resultados: number;
  truncado?: boolean | null;
  dias: number;
}): { tipo: TipoEstadoBuscador; texto: string } {
  const q = (s.q ?? "").trim();
  if (s.cargando) {
    return { tipo: "cargando", texto: q ? `Buscando «${q}»…` : "Buscando los gastos que pagaron los cargos…" };
  }
  if (s.error) return { tipo: "error", texto: s.error };
  if (s.resultados === 0) {
    return q
      ? { tipo: "vacio_con_q", texto: `Ningún gasto sin conciliar coincide con «${q}» en ±${s.dias} días de los cargos.` }
      : { tipo: "vacio_sin_q", texto: `Ningún gasto sin conciliar coincide en ±${s.dias} días de los cargos.` };
  }
  return { tipo: "lista", texto: s.truncado ? textoTruncado(s.resultados) : "" };
}

export type TonoGuia = "ok" | "aviso" | "error";

/**
 * La guía de cada candidato según el `resultado` del API (solo lee
 * `resultado`, `faltante_tras` y `excedente`): verde «Queda cubierto», ámbar
 * «Quedaría parcial: le faltarían $50.00», rojo «Se pasa por $20.00: el
 * sistema no lo acepta». NUNCA apaga el botón: decide el API. Un resultado
 * que el panel no conoce ⇒ sin guía.
 */
export function guiaResultado(
  c: Pick<CandidatoGastoPorSuma, "resultado" | "faltante_tras" | "excedente" | "moneda">,
): { tono: TonoGuia; texto: string } | null {
  switch (c.resultado) {
    case "CUBRE":
      return { tono: "ok", texto: "Queda cubierto" };
    case "PARCIAL":
      return { tono: "aviso", texto: `Quedaría parcial: le faltarían ${fmt(c.faltante_tras, c.moneda)}` };
    case "EXCEDE":
      return { tono: "error", texto: `Se pasa por ${fmt(c.excedente, c.moneda)}: el sistema no lo acepta` };
    default:
      return null;
  }
}

/** ¿Algún candidato queda cubierto con la suma? (sin ninguno, la lista enseña los gastos del mismo monto que no entraron). */
export function hayCandidatoQueCubre(cands: readonly Pick<CandidatoGastoPorSuma, "resultado">[]): boolean {
  return cands.some((c) => c.resultado === "CUBRE");
}

/**
 * La segunda línea del candidato: la de siempre (tarjeta, factura, lugar o
 * nota, matrícula, vuelo, pago parcial) + «capturó Itzi».
 */
export function descripcionCandidatoSuma(c: GastoCandidato): string | null {
  const partes = [
    descripcionCandidatoGasto(fichaCandidatoGasto(c)),
    c.capturado_por ? `capturó ${c.capturado_por}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** El gasto dentro del resumen: «Comida · $400.00 · 03 ago 2026 · vuelo #104». */
export function etiquetaGastoResumen(
  c: Pick<CandidatoGastoPorSuma, "categoria" | "monto" | "moneda" | "fecha" | "fecha_gasto" | "vuelo_folio">,
): string {
  const fecha = c.fecha ?? c.fecha_gasto ?? null;
  return [
    c.categoria ? categoriaGastoLabel(c.categoria) : null,
    fmt(c.monto, c.moneda),
    fecha ? fmtDateOnly(fecha) : null,
    c.vuelo_folio != null ? `vuelo #${c.vuelo_folio}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El resumen VISIBLE antes del botón (es la confirmación de la acción
 * masiva): «Se vincularán 2 cargos ($400.00) al gasto «Comida · $400.00 · 03
 * ago 2026 · vuelo #104» y, según la suma, el gasto queda cubierto.»
 * (PARCIAL: «… quedará parcial: le faltarán $50.00.»; EXCEDE: dice que el
 * sistema no lo acepta). La suma es la del API.
 */
export function textoResumenVincularCargos(p: {
  n: number;
  suma: number;
  moneda: string | null | undefined;
  gasto: CandidatoGastoPorSuma;
}): string {
  const cargos = `${p.n} cargos (${fmt(p.suma, p.moneda)})`;
  const gasto = `«${etiquetaGastoResumen(p.gasto)}»`;
  switch (p.gasto.resultado) {
    case "CUBRE":
      return `Se vincularán ${cargos} al gasto ${gasto} y, según la suma, el gasto queda cubierto.`;
    case "PARCIAL":
      return `Se vincularán ${cargos} al gasto ${gasto} y, según la suma, quedará parcial: le faltarán ${fmt(
        p.gasto.faltante_tras,
        p.gasto.moneda,
      )}.`;
    case "EXCEDE":
      return `Los ${cargos} se pasarían por ${fmt(p.gasto.excedente, p.gasto.moneda)} del gasto ${gasto}: el sistema no lo acepta. Elige otro gasto o revisa la selección.`;
    default:
      return `Se vincularán ${cargos} al gasto ${gasto}.`;
  }
}

/** «Vincular los 2 cargos» · con 1: «Vincular el cargo» (el clic dice que con uno se usa «Vincular gasto»). */
export function botonVincularCargos(n: number): string {
  return n === 1 ? "Vincular el cargo" : `Vincular los ${n} cargos`;
}

/** El clic sin un gasto elegido lo explica (el botón nunca se apaga por eso). */
export const TEXTO_ELIGE_GASTO = "Elige el gasto que pagaron los cargos.";

/**
 * El gasto elegido JUNTO con los cargos (`idsClave`) para los que el API
 * calculó su ficha: su `resultado`, `faltante_tras` y `excedente` son de ESA
 * suma.
 */
export interface ElegidoSuma {
  idsClave: string;
  candidato: CandidatoGastoPorSuma;
}

/**
 * La ficha del elegido que vale para ESTOS cargos (revisión del 15-oct-2026):
 * la más reciente de la respuesta vigente o, si la búsqueda lo dejó fuera, la
 * que se eligió —calculada para la MISMA suma—. Si los cargos cambiaron (se
 * quitó uno: OTRA suma y quizá otra ventana de fechas), la ficha vieja ya no
 * sirve: el resumen diría «queda cubierto» con un `resultado` de la suma
 * anterior cuando el API lo dejaría PARCIAL ⇒ null (hay que volver a elegir).
 */
export function fichaElegidaVigente(
  elegido: ElegidoSuma | null | undefined,
  idsClave: string,
  resultados: readonly CandidatoGastoPorSuma[],
): CandidatoGastoPorSuma | null {
  if (!elegido || elegido.idsClave !== idsClave) return null;
  return resultados.find((c) => c.id === elegido.candidato.id) ?? elegido.candidato;
}

/** El clic en «Vincular los N cargos» mientras el API vuelve a leer la lista. */
export const TEXTO_ESPERA_LISTA_SUMA = "Espera a que termine de cargar la lista de gastos.";
/** Sin la suma del API para ESTOS cargos no hay resumen, y el resumen ES la confirmación. */
export const TEXTO_ESPERA_SUMA_CARGOS = "Espera a que se actualice la suma de los cargos y vuelve a elegir el gasto.";

/**
 * Por qué «Vincular los N cargos» todavía no liga (el botón nunca se apaga:
 * el clic lo dice). El resumen visible («Se vincularán 2 cargos ($400.00) al
 * gasto «…»…») ES la confirmación de la acción masiva: sin él —o con la lista
 * cargándose— no se llama al API. null = se puede ligar.
 */
export function motivoNoVincularCargos(s: {
  unSolo: boolean;
  cargando: boolean;
  /** Hay un gasto elegido CON ficha para estos cargos (`fichaElegidaVigente`). */
  elegido: boolean;
  /** El resumen (la confirmación) está a la vista. */
  conResumen: boolean;
}): string | null {
  if (s.unSolo) return TEXTO_UN_SOLO_CARGO;
  if (s.cargando) return TEXTO_ESPERA_LISTA_SUMA;
  if (!s.elegido) return TEXTO_ELIGE_GASTO;
  if (!s.conResumen) return TEXTO_ESPERA_SUMA_CARGOS;
  return null;
}

/**
 * El toast del éxito: «2 cargos vinculados al gasto» + «El gasto quedó
 * cubierto ($400.00).» / «El gasto quedó PARCIAL: faltan $50.00 de $450.00.»
 * (de `gasto_estado` del API). Re-envío idéntico (`idempotente`): «Los 2
 * cargos ya estaban vinculados a ese gasto».
 */
export function toastCargosVinculados(
  r: LigarCargosGastoRespuesta | null | undefined,
  n: number,
): { titulo: string; descripcion?: string } {
  const total = Math.max(0, Math.trunc(n));
  const nuevos = Array.isArray(r?.nuevos) ? r.nuevos.length : total;
  const ya = total - nuevos;
  const titulo =
    r?.idempotente === true
      ? `Los ${total} cargos ya estaban vinculados a ese gasto`
      : nuevos > 0 && ya > 0
        ? `${nuevos} ${nuevos === 1 ? "cargo vinculado" : "cargos vinculados"} al gasto (${ya} ya lo ${ya === 1 ? "estaba" : "estaban"})`
        : `${total} cargos vinculados al gasto`;
  const e = r?.gasto_estado;
  if (!e) return { titulo };
  const moneda = e.moneda || null;
  return {
    titulo,
    descripcion: e.cubierto
      ? `El gasto quedó cubierto (${fmt(e.monto, moneda)}).`
      : `El gasto quedó PARCIAL: faltan ${fmt(e.faltante, moneda)} de ${fmt(e.monto, moneda)}.`,
  };
}

// ───────────────────────────── Errores ─────────────────────────────

/** Lo que se agrega a un rechazo del API que no lo dice ya (todo o nada: no se escribió nada). */
export const TEXTO_NO_SE_VINCULO = "No se vinculó ningún cargo.";
/** Red o 5xx al ligar: la RPC es todo o nada, pero la respuesta se perdió. */
export const TEXTO_INCIERTO_VINCULAR = "No se pudo confirmar si se vincularon: revisa la lista antes de reintentar.";
/** Un 4xx sin texto útil. */
export const TEXTO_RECHAZO_VINCULAR = "No se vinculó ningún cargo: vuelve a intentarlo; si sigue igual, avisa a sistemas.";
/** Quedó uno solo en la selección del diálogo. */
export const TEXTO_UN_SOLO_CARGO = "Con un solo cargo usa «Vincular gasto» desde su menú ⋯.";

/** «Quitar esos 2 de la selección» · con 1: «Quitar ese cargo de la selección». */
export function botonQuitarNoPendientes(n: number): string {
  return n === 1 ? "Quitar ese cargo de la selección" : `Quitar esos ${n} de la selección`;
}

/** Códigos con los que el API (o la server action) dice que esto todavía no está activo. */
const CODIGOS_NO_ACTIVA = new Set([
  "RUTA_NO_DISPONIBLE",
  "CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE",
  "CONCILIACION_PARTES_NO_DISPONIBLE",
]);

/**
 * ¿«Varios cargos → un gasto» todavía no está activo? Ruta inexistente (API
 * ≤ 0.0.76: 404 «Cannot POST …»), DTO previo o el 503 con código estable
 * (API nuevo sin la migración; se responde ANTES de escribir nada).
 */
export function esCargosNoActivo(r: ResultadoAccionLote | null | undefined): boolean {
  if (!r) return false;
  return CODIGOS_NO_ACTIVA.has(r.code ?? "") || esRutaInexistente(r) || esDtoSinOmision(r);
}

/** «MOVIMIENTO_NO_PENDIENTE: …» ⇒ «…» (el código no se pinta). */
function sinPrefijoCodigo(mensaje: string | null | undefined): string {
  return (mensaje ?? "").trim().replace(/^[A-Z][A-Z_]{2,}:\s*/, "");
}

function detalles(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

/** Ids de `details` (cadenas u objetos con `id`), sin repetir. */
function idsDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const ids = lista
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x as { id?: unknown }).id : null))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)];
}

export interface ErrorCargosGasto {
  titulo: string;
  /** «No se vinculó ningún cargo.» cuando el texto del API no lo dice ya. */
  descripcion?: string;
  /** Red o 5xx: no se sabe si quedó (todo o nada en el API, pero la respuesta se perdió). */
  incierto: boolean;
  /** La tabla quedó vieja: un `router.refresh()` al cerrar (de inmediato si es incierto). */
  refrescar: boolean;
  /** Los faltantes pudieron cambiar: se vuelve a pedir la lista SIN perder lo elegido. */
  recargarLista: boolean;
  /** El gasto elegido ya no existe: se suelta. */
  soltarGasto: boolean;
  /** Los que el API nombró (no pendientes, inexistentes, abonos, omitido): «Quitar esos N…». */
  quitarIds: string[];
}

/**
 * El error de LIGAR en palabras del operador. Orden: sin conexión ⇒
 * incierto; ruta inexistente o 503 de la migración ⇒ «todavía no está
 * activa»; 401/403; red o 5xx ⇒ incierto (la RPC pudo correr); 4xx ⇒ el texto
 * del API + «No se vinculó ningún cargo.» (todo o nada), con los ids que
 * nombró para quitarlos de la selección.
 */
export function mensajeErrorCargosGasto(r: ResultadoAccionLote): ErrorCargosGasto {
  const base: ErrorCargosGasto = {
    titulo: "",
    incierto: false,
    refrescar: false,
    recargarLista: false,
    soltarGasto: false,
    quitarIds: [],
  };
  if (r.code === "SIN_CONEXION") return { ...base, titulo: TEXTO_INCIERTO_VINCULAR, incierto: true, refrescar: true };
  if (esCargosNoActivo(r)) return { ...base, titulo: MSG_OPCION_NO_ACTIVA };
  if (r.status === 401) return { ...base, titulo: MSG_SESION_EXPIRADA };
  if (r.status === 403) return { ...base, titulo: MSG_SIN_PERMISO_CONCILIAR };
  if (r.status == null || r.status >= 500) {
    return { ...base, titulo: TEXTO_INCIERTO_VINCULAR, incierto: true, refrescar: true };
  }
  const d = detalles(r.details);
  const texto = esErrorTecnico({ error: r.error, code: r.code }) ? "" : sinPrefijoCodigo(r.error);
  const titulo = texto || TEXTO_RECHAZO_VINCULAR;
  const e: ErrorCargosGasto = {
    ...base,
    titulo,
    ...(/^No se vincul/i.test(titulo) ? {} : { descripcion: TEXTO_NO_SE_VINCULO }),
  };
  switch (r.code) {
    case "MOVIMIENTO_NO_PENDIENTE":
      return { ...e, refrescar: true, quitarIds: idsDe(d.movimientos) };
    case "MOVIMIENTO_NO_EXISTE":
      return { ...e, refrescar: true, quitarIds: idsDe(d.faltan) };
    case "MOVIMIENTO_OMITIDO":
      return { ...e, refrescar: true, quitarIds: idsDe([d.movimiento_id]) };
    case "SOLO_CARGOS":
      return { ...e, quitarIds: idsDe(d.abonos) };
    case "GASTO_NO_EXISTE":
      return { ...e, refrescar: true, recargarLista: true, soltarGasto: true };
    case "LOTE_INVALIDO":
    case "GASTO_INVALIDO":
      return e;
    default:
      // Una regla rechazó la liga (se pasa, otra moneda, no bancario, ya
      // cubierto, al mismo tiempo…): nada se escribió y los faltantes
      // pudieron cambiar.
      return { ...e, recargarLista: true };
  }
}

export interface ErrorCandidatosSuma {
  texto: string;
  /** «Reintentar» tiene sentido (red, 5xx, lectura caída). */
  reintentar: boolean;
  /** La tabla quedó vieja (alguno ya no está pendiente o ya no existe): refresh al cerrar. */
  refrescar: boolean;
  /** Los que el API nombró: «Quitar esos N de la selección». */
  quitarIds: string[];
}

/**
 * El error de la LECTURA de candidatos (nada que confirmar). Lo que el API
 * explica (no pendientes, inexistentes, abonos, moneda) se pinta tal cual con
 * su «Quitar…»; red o 5xx ⇒ «No se pudo cargar la lista de gastos…» con
 * «Reintentar» (jamás la lista vacía).
 */
export function mensajeErrorCandidatosSuma(r: ResultadoAccionLote): ErrorCandidatosSuma {
  const base: ErrorCandidatosSuma = { texto: TEXTO_CANDIDATOS_NO_CARGARON, reintentar: false, refrescar: false, quitarIds: [] };
  if (esCargosNoActivo(r)) return { ...base, texto: MSG_OPCION_NO_ACTIVA };
  if (r.status === 401) return { ...base, texto: MSG_SESION_EXPIRADA };
  if (r.status === 403) return { ...base, texto: MSG_SIN_PERMISO_CONCILIAR };
  const d = detalles(r.details);
  const legible = esErrorTecnico({ error: r.error, code: r.code }) ? "" : sinPrefijoCodigo(r.error);
  switch (r.code) {
    case "MOVIMIENTO_NO_PENDIENTE":
      return { ...base, texto: legible || base.texto, refrescar: true, quitarIds: idsDe(d.movimientos) };
    case "MOVIMIENTO_NO_EXISTE":
      return { ...base, texto: legible || base.texto, refrescar: true, quitarIds: idsDe(d.faltan) };
    case "SOLO_CARGOS":
      return { ...base, texto: legible || base.texto, quitarIds: idsDe(d.abonos) };
    default:
      break;
  }
  if (r.code === "SIN_CONEXION" || r.status == null || r.status >= 500) {
    // 503 CUENTA_SIN_MONEDA trae un texto que sí dice qué pasó; lo demás, el genérico.
    return { ...base, texto: r.code === "CUENTA_SIN_MONEDA" && legible ? legible : base.texto, reintentar: true };
  }
  return { ...base, texto: legible || base.texto };
}

// ─────────────────── «¿No está el gasto? Créalo por $X» (paso 4) ───────────────────
//
// «Créalo por la suma» (invariante 76 del API): el alta de SIEMPRE
// (`ExpenseCreateDialog` → `createGastoAction` → `POST /v1/expenses`) con
// `conciliar_con_movimientos` (2..50) y `client_request_id` OBLIGATORIO. El
// API prevalida, crea el gasto SIN auto-cruce y le liga los cargos en la
// MISMA petición; si la liga falla, RETIRA el gasto recién creado («No se
// registró el gasto: …»). Antes del alta va el paso de los POSIBLES
// DUPLICADOS (mismo monto, ±120 días, con los `excluidos` del API: en
// efectivo, ya conciliados, otra moneda…). El prellenado sale de la SUMA DEL
// API; el panel no suma dinero.

/** = `MENSAJE_CLIENT_REQUEST_ID_REQUERIDO` del API (400; prueba de paridad): el schema del alta lo exige con los cargos. */
export const MSG_LLAVE_CAPTURA_REQUERIDA = "Falta la llave de la captura: recarga la página y vuelve a intentarlo.";

/** Los medios que pasan por el banco, en la frase del contexto (los de `MEDIOS_BANCARIOS_CONCILIACION`; prueba). */
export const MEDIOS_BANCARIOS_ALTA_SUMA = "tarjeta corporativa, transferencia, Paywise o pago domiciliado";

/** Cuántos cargos se nombran en las notas del gasto (el resto: «y N más»). */
export const MAX_CARGOS_EN_NOTAS = 10;
/** Tope de las notas del gasto (`notas` ≤ 2,000 en el schema del alta y en el API). */
export const MAX_LARGO_NOTAS = 2000;

/** «¿No está el gasto? Créalo por $400.00» (« USD» fuera de pesos; la suma es la del API). */
export function botonAbrirCrearSuma(suma: unknown, moneda?: string | null): string {
  return `¿No está el gasto? Créalo por ${fmt(Math.abs(numeroDe(suma)), moneda)}`;
}

/** El tooltip del enlace: qué pasa al usarlo. */
export function tituloAbrirCrearSuma(n: number): string {
  return `El gasto no se capturó: créalo prellenado con la suma de los ${n} cargos; al guardar queda vinculado a ellos en un solo paso.`;
}

/** «Crear el gasto con la suma de 2 cargos» (el paso previo y el alta). */
export function tituloCrearSuma(n: number): string {
  return `Crear el gasto con la suma de ${n} cargos`;
}

/** La IA de «sugerir» es por cargo: con varios, el que revisa es el operador. */
export const NOTA_SIN_IA_SUMA = "La IA revisa un cargo a la vez: con varios cargos, revisa tú la lista.";

/**
 * Aviso ÁMBAR del paso «crear» con `cargos_con_candidato_propio` del API:
 * «1 de los cargos tiene un gasto que cuadra solo: quizá ya está capturado
 * por separado; vincúlalo uno por uno en vez de crear uno nuevo.» null sin
 * ninguno (o sin el dato: la nota gris de siempre).
 */
export function avisoCargosConCandidatoPropioCrear(
  lista: readonly CargoConCandidatoPropio[] | null | undefined,
): string | null {
  const n = Array.isArray(lista) ? lista.length : 0;
  if (n === 0) return null;
  return n === 1
    ? "1 de los cargos tiene un gasto que cuadra solo: quizá ya está capturado por separado; vincúlalo uno por uno en vez de crear uno nuevo."
    : `${n} de los cargos tienen un gasto que cuadra solo: quizá ya están capturados por separado; vincúlalos uno por uno en vez de crear uno nuevo.`;
}

/** «Revisé la lista y este gasto NO está registrado: crearlo por $752.84 y vincularle los 2 cargos.» */
export function casillaCrearSuma(n: number, suma: unknown, moneda?: string | null): string {
  return `Revisé la lista y este gasto NO está registrado: crearlo por ${fmt(Math.abs(numeroDe(suma)), moneda)} y vincularle los ${n} cargos.`;
}

/** Al pie del paso previo: qué trae el alta y que es todo o nada. */
export function notaPrellenadoSuma(n: number): string {
  return `El alta se abre con la suma, la fecha del último pago, el medio de pago y las leyendas de los cargos; revisa la categoría, el avión o vuelo y el proveedor. Al guardar se registra el gasto y se vinculan los ${n} cargos en un solo paso: si algo falla, no se registra nada.`;
}

/** «sep» (o «sep 2026» si los años difieren) de un día de pared. */
function mesDe(m: RegExpExecArray, conAnio: boolean): string {
  const mes = fechaCortaMovimiento(m[0]).split(" ")[1] ?? "";
  return conAnio ? `${mes} ${m[1]}` : mes;
}

/**
 * La fecha del gasto quedó en la del ÚLTIMO pago (decisión del 13-oct: la
 * fecha del gasto es la del pago). null el mismo día; «Los cargos son de días
 * distintos (10 y 12 ago): la fecha del gasto quedó en la del último pago (12
 * ago 2026). Cámbiala si la factura dice otra.»; meses distintos: «… (sep y
 * oct): … (01 oct 2026) y el gasto cuenta en ese mes. …».
 */
export function avisoFechasCargos(
  fechaMin: string | null | undefined,
  fechaMax: string | null | undefined,
): string | null {
  const a = RE_DIA.exec(String(fechaMin ?? ""));
  const b = RE_DIA.exec(String(fechaMax ?? ""));
  if (!a || !b || a[0] === b[0]) return null;
  const ultimo = fmtDateOnly(b[0]);
  if (a[1] === b[1] && a[2] === b[2]) {
    return `Los cargos son de días distintos (${a[3]} y ${fechaCortaMovimiento(b[0])}): la fecha del gasto quedó en la del último pago (${ultimo}). Cámbiala si la factura dice otra.`;
  }
  const conAnio = a[1] !== b[1];
  return `Los cargos son de meses distintos (${mesDe(a, conAnio)} y ${mesDe(b, conAnio)}): la fecha del gasto quedó en la del último pago (${ultimo}) y el gasto cuenta en ese mes. Cámbiala si la factura dice otra.`;
}

/** «30-sep» (como las notas del API, sin año); sin fecha legible, nada. */
function fechaNotaCorta(fecha: string | null | undefined): string {
  return RE_DIA.test(String(fecha ?? "")) ? fechaCortaMovimiento(fecha).replace(" ", "-") : "";
}

/**
 * Las notas del gasto: «Pagado en 2 cargos del banco (HSBC Pesos): 30-sep C
 * ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84». Los cargos en orden
 * de fecha; a lo más 10 y «y N más»; nunca más de 2,000 caracteres. El monto
 * de cada cargo es el del banco (texto determinista, sin Intl).
 */
export function notasDeCargos(
  cargos: readonly Pick<MovimientoBancario, "fecha" | "descripcion" | "monto">[],
  alias: string | null | undefined,
  moneda?: string | null,
): string {
  const n = cargos.length;
  const dia = (f: string | null | undefined) => RE_DIA.exec(String(f ?? ""))?.[0] ?? "9999-99-99";
  const orden = [...cargos].sort((x, y) => (dia(x.fecha) < dia(y.fecha) ? -1 : dia(x.fecha) > dia(y.fecha) ? 1 : 0));
  const lineas = orden
    .slice(0, MAX_CARGOS_EN_NOTAS)
    .map((c) =>
      [fechaNotaCorta(c.fecha), unaLinea(c.descripcion, 60), montoNotaVinculo(Math.abs(numeroDe(c.monto)), moneda)]
        .filter(Boolean)
        .join(" "),
    );
  const resto = n - lineas.length;
  const cuenta = (alias ?? "").trim();
  const texto = `Pagado en ${n} ${n === 1 ? "cargo" : "cargos"} del banco${cuenta ? ` (${cuenta})` : ""}: ${lineas.join(" · ")}${
    resto > 0 ? ` y ${resto} más` : ""
  }`;
  return texto.length > MAX_LARGO_NOTAS ? `${texto.slice(0, MAX_LARGO_NOTAS - 1).trimEnd()}…` : texto;
}

/** Los alias de las cuentas de los cargos («HSBC Pesos» o «GASTOS GNRAL, EJE SCOTIA»); si falta alguno, nada. */
function aliasDeCuentas(r: CargosResumen, aliasPorCuenta?: Readonly<Record<string, string>> | null): string {
  const cuentas = Array.isArray(r.cuentas) ? r.cuentas : [];
  const nombres = cuentas.map((c) => aliasDe(c, aliasPorCuenta));
  return nombres.length > 0 && nombres.every(Boolean) ? nombres.join(", ") : "";
}

/**
 * El alta prellenada con la SUMA DEL API (`cargos` de `POST
 * cargos/gastos-candidatos`): monto = la suma; moneda = la de las cuentas;
 * fecha = la del ÚLTIMO pago (`fecha_max`); medio = «Pago domiciliado» si
 * TODOS los cargos son automáticos (`pareceCargoRecurrente`, la misma regla
 * del «Créalo» de un cargo), si no tarjeta corporativa SOLO con la
 * terminación común que el API validó contra el catálogo, si no
 * transferencia; notas = las leyendas de los cargos. Categoría, avión o
 * vuelo y proveedor los elige la oficina.
 */
export function prefillGastoDesdeCargos(
  cargos: readonly (Pick<MovimientoBancario, "fecha" | "descripcion" | "monto"> & {
    cuenta_bancaria_id?: string | null;
  })[],
  resumen: CargosResumen,
  aliasPorCuenta?: Readonly<Record<string, string>> | null,
): Partial<GastoCreateValues> {
  const suma = Math.abs(numeroDe(resumen.suma));
  const recurrentes = cargos.length > 0 && cargos.every((c) => pareceCargoRecurrente(c.descripcion));
  const comun = typeof resumen.terminacion_comun === "string" ? resumen.terminacion_comun.trim() : "";
  const terminacion = !recurrentes && /^\d{4}$/.test(comun) ? comun : null;
  const fecha = RE_DIA.exec(String(resumen.fecha_max ?? ""))?.[0] ?? null;
  return {
    monto: suma > 0 ? suma.toFixed(2) : "",
    moneda: resumen.moneda === "USD" ? "USD" : "MXN",
    ...(fecha ? { fecha_gasto: fecha } : {}),
    medio_pago: recurrentes ? MEDIO_DOMICILIADO : terminacion ? "TARJETA_CORP" : "TRANSFERENCIA",
    tarjeta_terminacion: terminacion ?? "",
    // Cuenta de donde salió (20-oct-2026, API 0.0.100): la de los cargos si
    // TODOS son de la misma y el medio la lleva (no con tarjeta).
    ...(() => {
      const cuentas = new Set(cargos.map((c) => c.cuenta_bancaria_id ?? ""));
      const unica = cuentas.size === 1 ? [...cuentas][0] : "";
      return !terminacion && unica ? { cuenta_bancaria_id: unica } : {};
    })(),
    notas: notasDeCargos(cargos, aliasDeCuentas(resumen, aliasPorCuenta), resumen.moneda),
  };
}

/**
 * La nota de contexto del alta: el encabezado con la suma del API + qué pasa
 * al guardar (todo o nada) + que el gasto debe pagarse por el banco.
 */
export function contextoCrearSuma(
  resumen: CargosResumen,
  aliasPorCuenta?: Readonly<Record<string, string>> | null,
): string {
  const n = resumen.n || resumen.ids?.length || 0;
  return `${encabezadoCargos(resumen, aliasPorCuenta)}. Al guardar se vinculan los ${n} cargos en el mismo paso: si la liga falla, el gasto no se registra. Para vincular varios cargos el gasto debe pagarse por el banco (${MEDIOS_BANCARIOS_ALTA_SUMA}).`;
}

/**
 * El aviso del alta al guardar (de `conciliacion` de la respuesta del API):
 * «Gasto registrado y vinculado a 2 cargos · quedó cubierto» / «… · quedó
 * PARCIAL: faltan $X de $Y». Un re-envío con la misma llave (`idempotente`)
 * dice lo mismo: el gasto quedó y está vinculado.
 */
export function textoExitoCrearSuma(g: { conciliacion?: ConciliacionAlCrear | null } | null | undefined): string {
  const c = g?.conciliacion ?? null;
  const n = Array.isArray(c?.movimiento_ids) ? c.movimiento_ids.length : 0;
  const base =
    n > 0 ? `Gasto registrado y vinculado a ${n} ${n === 1 ? "cargo" : "cargos"}` : "Gasto registrado y vinculado a los cargos";
  const e = c?.gasto_estado;
  if (!e) return base;
  const moneda = e.moneda || null;
  return e.cubierto
    ? `${base} · quedó cubierto`
    : `${base} · quedó PARCIAL: faltan ${fmt(e.faltante, moneda)} de ${fmt(e.monto, moneda)}`;
}

// ── Errores del alta por la suma ──

/** Red o 5xx sin código conocido: la petición pudo correr; con la MISMA llave, «Guardar» no duplica. */
export const TEXTO_INCIERTO_CREAR_SUMA =
  "No se pudo confirmar si se registró el gasto: vuelve a pulsar «Guardar» (con esta misma captura no se duplica).";
/** Un 4xx sin texto útil (todo o nada: no se registró nada). */
export const TEXTO_RECHAZO_CREAR_SUMA = "No se registró el gasto: vuelve a intentarlo; si sigue igual, avisa a sistemas.";

export interface ErrorCrearSuma {
  /** Lo que pinta la caja roja del alta (que sigue abierta). */
  texto: string;
  /** Red o 5xx: no se sabe si quedó. */
  incierto: boolean;
  /** La tabla quedó vieja (cargos que ya no están pendientes, un gasto que pudo quedar): refresh al cerrar. */
  refrescar: boolean;
  /** Pudo quedar un gasto registrado: se vuelven a leer los posibles duplicados y la lista de gastos. */
  releer: boolean;
}

/** 400 «property conciliar_con_movimientos should not exist» = el DTO de un API ≤ 0.0.76. */
export function esDtoSinCargosAlta(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 400 && /property conciliar_con_movimientos should not exist/i.test(r.error ?? "");
}

/**
 * El error del ALTA por la suma en palabras del operador (el alta sigue
 * abierta con este texto en su caja roja). Orden: sin conexión ⇒ incierto;
 * opción no activa (ruta, DTO previo, 503 de la migración); 401/403;
 * GASTO_SIN_VINCULAR (500: el gasto SÍ quedó, sin los cargos; su texto dice
 * «vuelve a pulsar «Guardar»…») y GASTO_NO_REGISTRADO (500: el API ya lo
 * retiró) con su texto; cualquier otro 5xx o sin status ⇒ incierto; 4xx ⇒ el
 * texto del API («No se registró el gasto: …»; con cargos no pendientes
 * termina «Cancela, quita esos cargos de la selección…»).
 */
export function mensajeErrorCrearSuma(r: ResultadoAccionLote): ErrorCrearSuma {
  const base: ErrorCrearSuma = { texto: "", incierto: false, refrescar: false, releer: false };
  const incierto: ErrorCrearSuma = { texto: TEXTO_INCIERTO_CREAR_SUMA, incierto: true, refrescar: true, releer: true };
  if (r.code === "SIN_CONEXION") return incierto;
  if (esCargosNoActivo(r) || esDtoSinCargosAlta(r)) return { ...base, texto: MSG_OPCION_NO_ACTIVA };
  if (r.status === 401) return { ...base, texto: MSG_SESION_EXPIRADA };
  const legible = esErrorTecnico({ error: r.error, code: r.code }) ? "" : sinPrefijoCodigo(r.error);
  if (r.status === 403) return { ...base, texto: legible || MSG_SIN_PERMISO_CONCILIAR };
  if (r.code === "GASTO_SIN_VINCULAR") {
    return { ...base, texto: legible || TEXTO_INCIERTO_CREAR_SUMA, refrescar: true, releer: true };
  }
  if (r.code === "GASTO_NO_REGISTRADO") return { ...base, texto: legible || TEXTO_RECHAZO_CREAR_SUMA };
  if (r.status == null || r.status >= 500) return incierto;
  switch (r.code) {
    case "MOVIMIENTO_NO_PENDIENTE":
    case "MOVIMIENTO_NO_EXISTE":
    case "MOVIMIENTO_OMITIDO":
      return { ...base, texto: legible || TEXTO_RECHAZO_CREAR_SUMA, refrescar: true };
    case "CLIENT_REQUEST_ID_EN_USO":
      // Esa llave YA registró un gasto (con otros datos): la lista lo debe enseñar.
      return { ...base, texto: legible || TEXTO_RECHAZO_CREAR_SUMA, refrescar: true, releer: true };
    default:
      return { ...base, texto: legible || TEXTO_RECHAZO_CREAR_SUMA };
  }
}

// ── Los posibles duplicados (paso previo) ──

/** La lectura de duplicados falló (o vino sin `excluidos`): la casilla queda bloqueada hasta leerlos. */
export const TEXTO_DUPLICADOS_SUMA_NO_LEIDOS = "No se pudieron revisar los posibles duplicados: vuelve a intentarlo.";
/** El clic en «Crear el gasto» mientras se revisan. */
export const TEXTO_ESPERA_DUPLICADOS = "Espera a que termine la revisión de los posibles duplicados.";
/** El clic en «Crear el gasto» sin la casilla. */
export const TEXTO_FALTA_CASILLA_SUMA = "Marca la casilla: confirma que revisaste la lista y que el gasto NO está registrado.";

/** La búsqueda de duplicados: la suma del API como monto («752.84»: ±0.01 en el API). */
export function qDuplicadosSuma(suma: unknown): string {
  return Math.abs(numeroDe(suma)).toFixed(2);
}

export type EstadoDuplicadosSuma =
  | { tipo: "cargando"; texto: string }
  | { tipo: "error"; texto: string; quitarIds: string[] }
  | { tipo: "listo"; duplicados: GastoCandidato[]; avisos: AvisoExcluidos[] };

/**
 * Qué pinta «Posibles duplicados (mismo monto, ±120 días)»: los candidatos
 * del MISMO monto (`duplicadosDeCandidatos`, la regla del «Créalo» de un
 * cargo) y, en ámbar, los del mismo monto que no son del universo (en
 * efectivo, ya conciliados, otra moneda, fuera de la ventana: los
 * `excluidos` del API, que llegan SIEMPRE). Sin la respuesta, «Buscando…»;
 * si la lectura falló —o vino sin `excluidos`: no se pudieron revisar los de
 * efectivo ni los ya conciliados— es un error (jamás «no hay ninguno»).
 */
export function estadoDuplicadosSuma(
  r: (ResultadoAccionLote & { data?: CargosGastosCandidatosResponse }) | null | undefined,
  suma: unknown,
): EstadoDuplicadosSuma {
  if (!r) return { tipo: "cargando", texto: TEXTO_BUSCANDO_DUPLICADOS };
  if (!r.ok || !r.data) {
    const e = mensajeErrorCandidatosSuma(r);
    return {
      tipo: "error",
      texto: e.texto === TEXTO_CANDIDATOS_NO_CARGARON ? TEXTO_DUPLICADOS_SUMA_NO_LEIDOS : e.texto,
      quitarIds: e.quitarIds,
    };
  }
  const d = r.data;
  if (!Array.isArray(d.excluidos)) return { tipo: "error", texto: TEXTO_DUPLICADOS_SUMA_NO_LEIDOS, quitarIds: [] };
  const monto = Math.abs(numeroDe(d.cargos?.suma ?? suma));
  return {
    tipo: "listo",
    duplicados: duplicadosDeCandidatos(d.candidatos, monto),
    avisos: textoExcluidosCandidatos(d.excluidos, monto, {
      monedaCuenta: d.cargos?.moneda ?? null,
      dias: DIAS_DUPLICADOS,
      montoBuscado: d.excluidos_monto,
      variosCargos: true,
    }),
  };
}

/**
 * Por qué «Crear el gasto» todavía no abre el alta (el botón nunca se apaga:
 * el clic lo dice). null = se puede: la revisión de duplicados terminó bien y
 * la casilla está marcada.
 */
export function motivoNoCrearSuma(s: { confirmado: boolean; duplicados: EstadoDuplicadosSuma }): string | null {
  if (s.duplicados.tipo === "cargando") return TEXTO_ESPERA_DUPLICADOS;
  if (s.duplicados.tipo === "error") return s.duplicados.texto;
  return s.confirmado ? null : TEXTO_FALTA_CASILLA_SUMA;
}
