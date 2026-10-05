/**
 * Reglas y textos de la pantalla Combustibles (`/admin/combustibles`). PURO:
 * sin React ni red.
 *
 * 1-oct-2026, pedido del cliente con la captura de Combustibles: «no puedo
 * editar un ticket ya subido??? Me apoyan porfa para poder editar». La tabla
 * solo ofrecía «Asignar avión» y «Ligar a vuelo»; desde hoy cada carga lleva
 * el MISMO menú ⋯ de Gastos (`ExpenseActions`: «Verificar / editar» con
 * litros, tipo y lugar de GAS, y «Eliminar» con confirmación). No hay un
 * editor propio de combustibles: dos editores del mismo gasto es donde se
 * cuela el dato que no cuadra.
 */
import { cancunInputToIso, isoToCancunInput } from "@/lib/datetime";

/** Frase de ayuda de la cabecera: dónde se corrige o se borra una carga. */
export const AYUDA_EDITAR_CARGA =
  "Edita o elimina una carga desde el menú ⋯ de su renglón.";

// ─────────────── Tipo de combustible ───────────────

export type TipoCombustible = "TURBOSINA" | "AVGAS";

/** Opciones del selector «Tipo de combustible» (mismas etiquetas que la tabla). */
export const TIPOS_COMBUSTIBLE: ReadonlyArray<{ value: TipoCombustible; label: string }> = [
  { value: "TURBOSINA", label: "Turbosina" },
  { value: "AVGAS", label: "Gasavión" },
];

export function etiquetaTipoCombustible(tipo: string | null | undefined): string | null {
  return TIPOS_COMBUSTIBLE.find((t) => t.value === tipo)?.label ?? null;
}

/** Lugar de la carga como se guarda: sin espacios sobrantes y en mayúsculas («cun » → «CUN»). */
export function normalizarLugarCarga(lugar: string | null | undefined): string {
  return (lugar ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// ─────────────── Fecha de la carga: fecha_gasto ↔ fecha_hora_carga ───────────────
//
// Una carga trae DOS fechas: `fecha_gasto` (el día que cuenta para el mes, el
// filtro y el Balance) y, si la app o la carga masiva la sellaron,
// `fecha_hora_carga` (el momento exacto, para mostrar la hora y sugerir el
// vuelo). Regla del API (carga masiva): el DÍA Cancún de `fecha_hora_carga`
// es `fecha_gasto`. El diálogo «Verificar / editar» solo cambia
// `fecha_gasto`; sin esta regla, la carga se mudaba de mes en el Balance pero
// el renglón seguía diciendo la fecha vieja.

/** Día Cancún (YYYY-MM-DD) de un timestamptz; `null` si no se puede leer. */
export function diaCancunDeCarga(iso: string | null | undefined): string | null {
  const pared = isoToCancunInput(iso);
  return pared ? pared.slice(0, 10) : null;
}

/**
 * La misma hora Cancún de la carga, en el día nuevo (ISO UTC para el API).
 * `null` si la carga no tiene hora o el día nuevo no es YYYY-MM-DD.
 */
export function fechaHoraCargaEnDia(
  fechaHoraCarga: string | null | undefined,
  nuevoDia: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevoDia)) return null;
  const pared = isoToCancunInput(fechaHoraCarga);
  if (!pared) return null;
  return cancunInputToIso(`${nuevoDia}T${pared.slice(11, 16)}`) || null;
}

/**
 * Qué fecha pinta el renglón: la hora de la carga si cae el MISMO día Cancún
 * que `fecha_gasto`; si no (una carga editada antes de esta regla, o sin
 * hora), `fecha_gasto`, que es la que manda en el mes y el Balance.
 */
export function fechaVisibleCarga(c: {
  fecha_hora_carga: string | null;
  fecha_gasto: string | null;
}): { conHora: true; iso: string } | { conHora: false; fecha: string | null } {
  const dia = diaCancunDeCarga(c.fecha_hora_carga);
  const fecha = c.fecha_gasto ? c.fecha_gasto.slice(0, 10) : null;
  if (c.fecha_hora_carga && dia && (!fecha || dia === fecha)) {
    return { conHora: true, iso: c.fecha_hora_carga };
  }
  return { conHora: false, fecha };
}

/** Clave para ordenar las cargas de una matrícula (pared Cancún; sin hora va primero en su día). */
export function claveOrdenCarga(c: {
  fecha_hora_carga: string | null;
  fecha_gasto: string | null;
}): string {
  const v = fechaVisibleCarga(c);
  return v.conHora ? isoToCancunInput(v.iso) : (v.fecha ?? "");
}

/** Momento con el que «Ligar a vuelo» busca vuelos cercanos (mediodía UTC si no hay hora). */
export function momentoParaSugerirVuelo(c: {
  fecha_hora_carga: string | null;
  fecha_gasto: string | null;
}): string | null {
  const v = fechaVisibleCarga(c);
  if (v.conHora) return v.iso;
  return v.fecha ? `${v.fecha}T12:00:00Z` : null;
}

/**
 * Campos de COMBUSTIBLE que el PATCH de «Verificar / editar» agrega al resto
 * del formulario. Solo viaja lo que cambió:
 *
 * - `fecha_hora_carga`: si la carga tiene hora y se cambió `fecha_gasto`, la
 *   misma hora Cancún en el día nuevo (cualquier categoría: si la reclasifican
 *   y le cambian la fecha, las dos fechas siguen coincidiendo).
 * - `tipo_combustible` y `lugar`: solo si la categoría que se guarda es GAS.
 *   Vaciar el lugar lo QUITA (`null` explícito: «» se tiraría en stripEmpty y
 *   el lugar viejo seguiría vivo). Única excepción a «solo lo que cambió»: un
 *   tipo distinto al del avión (`delAvion`) viaja siempre, para que el API lo
 *   ajuste (5-oct-2026).
 */
export function camposCargaParaPatch(
  original: {
    fecha_gasto: string | null;
    fecha_hora_carga: string | null;
    tipo_combustible: string | null;
    lugar: string | null;
  },
  form: {
    categoria: string;
    fecha_gasto: string;
    tipo_combustible: string;
    lugar: string;
  },
  /** Combustible del avión elegido (5-oct-2026): si el tipo NO coincide, viaja
   *  aunque no haya cambiado — el API solo reaplica su ajuste cuando el PATCH
   *  trae el tipo, y el aviso ámbar promete que al guardar se corrige. */
  delAvion?: TipoCombustible | null,
): { fecha_hora_carga?: string; tipo_combustible?: TipoCombustible; lugar?: string | null } {
  const out: {
    fecha_hora_carga?: string;
    tipo_combustible?: TipoCombustible;
    lugar?: string | null;
  } = {};

  const fechaOriginal = (original.fecha_gasto ?? "").slice(0, 10);
  if (original.fecha_hora_carga && form.fecha_gasto && form.fecha_gasto !== fechaOriginal) {
    const recolocada = fechaHoraCargaEnDia(original.fecha_hora_carga, form.fecha_gasto);
    if (recolocada) out.fecha_hora_carga = recolocada;
  }

  if (form.categoria === "GAS") {
    const tipo = TIPOS_COMBUSTIBLE.find((t) => t.value === form.tipo_combustible)?.value;
    if (tipo && (tipo !== original.tipo_combustible || (delAvion && tipo !== delAvion))) {
      out.tipo_combustible = tipo;
    }
    const lugar = normalizarLugarCarga(form.lugar);
    const lugarOriginal = normalizarLugarCarga(original.lugar);
    if (lugar !== lugarOriginal) out.lugar = lugar === "" ? null : lugar;
  }
  return out;
}

// ─────────────── Combustible de la AERONAVE (5-oct-2026, API 0.0.56) ───────────────
//
// Caso real: Luis capturó desde la app 74 L para el XB-PEV (vuelo #280,
// Chetumal) y eligió «Turbosina»; el PEV (Cessna 205, pistón) solo carga
// gasavión y el Balance del PEV salió con «Combustible TURBOSINA». Desde hoy
// cada avión dice qué combustible carga (`aeronave.combustible`, migración
// 20261005000001, default AVGAS) y el API AJUSTA toda carga GAS a ese valor:
// si alguien eligió el otro, la corrige, le pone la nota «⚠ … — revisar» y la
// marca para visto bueno (`resolverTipoCombustible` del API). El panel:
//
//  - la ficha del avión captura el campo (alta: gasavión por default);
//  - al capturar o verificar una carga con avión, PRELLENA el tipo con el del
//    avión si está vacío (la IA no pisa al avión) y AVISA en ámbar si el
//    operador eligió el otro — no bloquea: el API corrige al guardar.
//
// Las etiquetas son las MISMAS del selector «Tipo de combustible»
// (`TIPOS_COMBUSTIBLE`): el aviso no puede decir «Avgas» bajo un selector que
// ofrece «Gasavión». API previo (sin la columna) ⇒ `combustible` no llega y
// todo esto calla: ni prellenado ni aviso, y la ficha pinta «—».

/** Combustible con el que nace un avión dado de alta desde el panel (pistón). */
export const COMBUSTIBLE_AERONAVE_DEFAULT: TipoCombustible = "AVGAS";

/** Opciones del selector «Combustible» de la ficha del avión (gasavión primero: es el default). */
export const COMBUSTIBLE_AERONAVE_OPCIONES: ReadonlyArray<{ value: TipoCombustible; label: string }> = [
  ...TIPOS_COMBUSTIBLE.filter((t) => t.value === COMBUSTIBLE_AERONAVE_DEFAULT),
  ...TIPOS_COMBUSTIBLE.filter((t) => t.value !== COMBUSTIBLE_AERONAVE_DEFAULT),
];

/** Etiqueta del campo en la ficha, el formulario y el detalle del avión. */
export const ETIQUETA_COMBUSTIBLE_AERONAVE = "Combustible";

/** Error del formulario del avión con un valor fuera del catálogo (espejo del CHECK de la BD). */
export const ERROR_COMBUSTIBLE_AERONAVE = `Elige ${COMBUSTIBLE_AERONAVE_OPCIONES.map((o) => o.label).join(" o ")}.`;

/** Ayuda bajo el selector de la ficha del avión. */
export const AYUDA_COMBUSTIBLE_AERONAVE =
  "Las cargas de este avión se guardan con este combustible.";

/** `true` si el valor es un tipo de combustible válido. */
export function esTipoCombustible(v: unknown): v is TipoCombustible {
  return TIPOS_COMBUSTIBLE.some((t) => t.value === v);
}

/** Etiqueta del combustible de un avión; «—» si el API todavía no lo manda. */
export function etiquetaCombustibleAeronave(combustible: string | null | undefined): string {
  return etiquetaTipoCombustible(combustible) ?? "—";
}

/**
 * ¿El API ya manda `combustible` en la flota? Decide si el ALTA de avión
 * muestra y manda el campo: un API previo lo rechazaría (400 por
 * `forbidNonWhitelisted`). Sin aviones no hay cómo saberlo ⇒ `true` (el API
 * sale antes que el panel).
 */
export function apiConCombustible(
  aircraft: ReadonlyArray<{ id: string; combustible?: string | null }>,
): boolean {
  if (aircraft.length === 0) return true;
  return aircraft.some((a) => a.combustible !== undefined);
}

/** Avión de los catálogos que reciben los diálogos de gasto (alta y verificación). */
export interface AvionCatalogoGasto {
  id: string;
  matricula: string;
  /** Ausente = API previo: ni prellenado ni aviso. */
  combustible?: TipoCombustible | null;
}

/**
 * Forma ÚNICA del catálogo de aviones de los diálogos de gasto. Las páginas
 * lo armaban con `{ id, matricula }` y así el combustible se perdía antes de
 * llegar al diálogo: toda página que alimente `ExpenseCreateDialog` o el menú
 * ⋯ (`ExpenseActions`) pasa por aquí.
 */
export function avionCatalogoGasto(a: {
  id: string;
  matricula: string;
  combustible?: string | null;
}): AvionCatalogoGasto {
  return esTipoCombustible(a.combustible)
    ? { id: a.id, matricula: a.matricula, combustible: a.combustible }
    : { id: a.id, matricula: a.matricula };
}

/** Combustible del avión `id` en el catálogo; `null` = sin avión, desconocido o API previo. */
export function combustibleDeAeronave(
  aircraft: ReadonlyArray<{ id: string; combustible?: string | null }>,
  id: string | null | undefined,
): TipoCombustible | null {
  if (!id) return null;
  const c = aircraft.find((a) => a.id === id)?.combustible;
  return esTipoCombustible(c) ? c : null;
}

/**
 * Aviso ÁMBAR bajo el tipo de combustible cuando el operador eligió uno
 * distinto al del avión. No bloquea: el API corrige al guardar y marca la
 * carga para revisión. `null` = nada que avisar (coincide, sin tipo, o el
 * avión no dice su combustible).
 */
export function avisoCombustibleDistinto(
  matricula: string | null | undefined,
  delAvion: TipoCombustible | null | undefined,
  elegido: string | null | undefined,
): string | null {
  if (!delAvion || !esTipoCombustible(elegido) || elegido === delAvion) return null;
  const etiqueta = etiquetaCombustibleAeronave(delAvion);
  const m = (matricula ?? "").trim();
  const sujeto = m ? `El ${m}` : "Este avión";
  return `${sujeto} carga ${etiqueta}: al guardar se corregirá a ${etiqueta} y quedará marcado para revisión.`;
}

/**
 * Qué tipo de combustible debe quedar en el formulario de una carga (alta o
 * verificación) cada vez que cambian la categoría, el avión o llega la IA:
 *
 *  - no es GAS ⇒ no se toca;
 *  - el operador ya eligió uno (o venía guardado) ⇒ ese manda; si no
 *    coincide con el avión lo dice `avisoCombustibleDistinto`;
 *  - vacío, o lo había puesto el sistema (`actualEsSugerido`) ⇒ el del avión;
 *    la IA solo llena cuando el avión no dice nada (si la IA lee otro, manda
 *    el avión: es el mismo ajuste que hará el API);
 *  - sin avión ni IA ⇒ se queda como está.
 */
export function tipoCombustibleSugerido(p: {
  categoria: string;
  delAvion: TipoCombustible | null | undefined;
  /** Valor del formulario («» = vacío). */
  actual: string | null | undefined;
  /** `true` = el valor actual lo puso el sistema (prellenado), no el operador. */
  actualEsSugerido?: boolean;
  /** Tipo leído por la IA del ticket, si lo leyó. */
  ia?: string | null;
}): string {
  const actual = p.actual ?? "";
  if (p.categoria !== "GAS") return actual;
  if (esTipoCombustible(actual) && !p.actualEsSugerido) return actual;
  if (p.delAvion) return p.delAvion;
  if (esTipoCombustible(p.ia)) return p.ia;
  return actual;
}
