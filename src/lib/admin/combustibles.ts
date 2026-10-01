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
 *   el lugar viejo seguiría vivo).
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
    if (tipo && tipo !== original.tipo_combustible) out.tipo_combustible = tipo;
    const lugar = normalizarLugarCarga(form.lugar);
    const lugarOriginal = normalizarLugarCarga(original.lugar);
    if (lugar !== lugarOriginal) out.lugar = lugar === "" ? null : lugar;
  }
  return out;
}
