/**
 * «Vincular gasto» con un gasto que NO pasó por el banco (efectivo, dinero
 * personal) — 6-oct-2026, API 0.0.63.
 *
 * Caso real (prod): cargo de $212.00 del 07-sep-2026 (ASUR CANCUN, cuenta
 * GASTOS GNRAL). Ningún piloto capturó ese estacionamiento; el 27 y el 28-sep
 * hubo dos estacionamientos de $212.00 pagados en EFECTIVO y Mari los facturó
 * para no perder la deducción. Decisión del cliente: el cargo se liga a uno
 * de ellos SIN cambiar el medio de pago (cambiarlo movería la caja de los
 * pilotos) y con un comentario de por qué.
 *
 * La REGLA es del API (`MEDIOS_BANCARIOS`, 400 `JUSTIFICACION_REQUERIDA`, 409
 * `GASTO_BODEGA`, la nota que se anota en el cargo y en el gasto). Este
 * módulo es PURO (sin React ni red) y es la FUENTE ÚNICA del panel para:
 *   - qué medio es «no bancario» (`esMedioNoBancario`, espejo de
 *     `MEDIOS_BANCARIOS` del API) y cómo se rotula («Efectivo», «Personal
 *     Pablo»…; un código desconocido es «Otro medio», JAMÁS el código);
 *   - si el API ya sabe incluirlos (`apiOfreceNoBancarios`): sin señal (API
 *     previo) el interruptor no aparece y el diálogo es el de siempre;
 *   - el interruptor, la insignia de la fila, el campo «¿Por qué…?» (10 a 300
 *     caracteres, `estadoJustificacion`) y lo que viaja
 *     (`justificacionParaEnviar`: SOLO con un gasto no bancario marcado);
 *   - la insignia de la columna «Conciliación» con la justificación que el
 *     API anotó en el cargo (`badgeVinculoNoBancario`) y la línea extra de la
 *     confirmación de desvincular (`textoDesvincularNoBancario`).
 * Los errores del API (`JUSTIFICACION_REQUERIDA`, `GASTO_BODEGA`) se redactan
 * en `conciliacion-lote.ts` junto a los demás errores de «Vincular gasto».
 * Ningún componente redacta estas frases a mano.
 */

import { MEDIO_PAGO_LABELS } from "@/lib/admin/medios-pago";

// ───────────────────────────── Medios ─────────────────────────────

/**
 * Espejo de `MEDIOS_BANCARIOS` del API (`gastos-candidatos.util.ts`): los
 * únicos medios que tocan el banco. Todo lo demás (EFECTIVO, PERSONAL_*,
 * BODEGA) es «no bancario». Si el API cambia la lista, cambia aquí.
 */
export const MEDIOS_BANCARIOS_CONCILIACION: readonly string[] = ["TARJETA_CORP", "TRANSFERENCIA", "PAYWISE"];

/** Salida de inventario: nunca pasa por el banco ni se vincula (409 `GASTO_BODEGA`). */
export const MEDIO_BODEGA = "BODEGA";

const limpio = (m: string | null | undefined) => (typeof m === "string" ? m.trim() : "");

/** ¿El medio NO toca el banco? (EFECTIVO, PERSONAL_*, BODEGA o uno desconocido). Vacío ⇒ false. */
export function esMedioNoBancario(medio: string | null | undefined): boolean {
  const m = limpio(medio);
  return m !== "" && !MEDIOS_BANCARIOS_CONCILIACION.includes(m);
}

/** ¿Es una salida de bodega (inventario)? */
export function esMedioBodega(medio: string | null | undefined): boolean {
  return limpio(medio) === MEDIO_BODEGA;
}

/**
 * ¿El candidato NO pasó por el banco? Manda `no_bancario` del API (0.0.63);
 * sin él (API previo, fichas de la IA) se deduce del `medio_pago`.
 */
export function esCandidatoNoBancario(
  c: { no_bancario?: boolean | null; medio_pago?: string | null } | null | undefined,
): boolean {
  if (!c) return false;
  if (typeof c.no_bancario === "boolean") return c.no_bancario;
  return esMedioNoBancario(c.medio_pago);
}

/** «Efectivo», «Personal Pablo», «Bodega (inventario)»… y «Otro medio» si el panel no lo conoce. */
export function etiquetaMedioNoBancario(medio: string | null | undefined): string {
  return MEDIO_PAGO_LABELS[limpio(medio)] ?? "Otro medio";
}

/** «Pagado en efectivo» / «Pagado con Personal Pablo» / «Salida de bodega (inventario)». */
function pagadoCon(medio: string | null | undefined): string {
  const m = limpio(medio);
  if (m === "EFECTIVO") return "Pagado en efectivo";
  if (m === MEDIO_BODEGA) return "Salida de bodega (inventario)";
  return MEDIO_PAGO_LABELS[m] ? `Pagado con ${MEDIO_PAGO_LABELS[m]}` : "Pagado con otro medio";
}

// ───────────────────────────── ¿El API sabe? ─────────────────────────────

/**
 * ¿El API ya sabe incluir gastos no bancarios (0.0.63)? Dos señales: algún
 * candidato trae `no_bancario` (booleano) o la respuesta trae `excluidos`
 * (viaja, aunque sea `[]`, con la lista vacía). Sin ninguna (API previo, o
 * la lista vacía y la lectura de excluidos falló) ⇒ false: el interruptor no
 * aparece y el diálogo es el de siempre.
 */
export function apiOfreceNoBancarios(
  r: { candidatos?: readonly (object | null | undefined)[] | null; excluidos?: unknown } | null | undefined,
): boolean {
  if (!r) return false;
  if (Array.isArray(r.excluidos)) return true;
  return (
    Array.isArray(r.candidatos) &&
    r.candidatos.some((c) => typeof (c as { no_bancario?: unknown } | null | undefined)?.no_bancario === "boolean")
  );
}

// ───────────────────────────── Interruptor ─────────────────────────────

export const ETIQUETA_INCLUIR_NO_BANCARIOS = "Incluir gastos en efectivo y otros medios";

/** Debajo del interruptor encendido. */
export const AYUDA_INCLUIR_NO_BANCARIOS =
  "También salen los gastos en efectivo o pagados con dinero personal (nunca los de bodega), con su medio de pago a la vista. Para vincular uno hay que escribir por qué; su medio de pago no cambia.";

/** Botón bajo la frase de los gastos en efectivo que no salieron (`excluidos`). */
export const BOTON_MOSTRAR_NO_BANCARIOS = "Mostrar estos gastos";

/** Toast al apagar el interruptor con gastos no bancarios marcados (se desmarcan). */
export function textoDesmarcadosNoBancarios(n: number): string {
  return n === 1
    ? "Se desmarcó el gasto en efectivo: ya no está en la lista."
    : `Se desmarcaron ${n} gastos en efectivo u otros medios: ya no están en la lista.`;
}

/** Tooltip de la insignia del candidato: qué es y qué pasa al vincularlo. */
export function tituloBadgeCandidatoNoBancario(medio: string | null | undefined): string {
  return `${pagadoCon(medio)}: no pasó por el banco. Se puede vincular escribiendo por qué; su medio de pago no cambia.`;
}

// ───────────────────────────── Justificación ─────────────────────────────

/** Largo del `@Length(10, 300)` del DTO del API (texto sin espacios de las orillas). */
export const JUSTIFICACION_MIN = 10;
export const JUSTIFICACION_MAX = 300;

export const AYUDA_JUSTIFICACION =
  "No cambia el medio de pago ni la caja del piloto; la razón queda anotada en el cargo y en el gasto.";

export const PLACEHOLDER_JUSTIFICACION =
  "Ej.: Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28 para no perder la deducción.";

/**
 * La justificación tal como viaja: los espacios y saltos de línea se
 * colapsan a uno (el API la anota como UNA línea en el cargo y en el gasto)
 * y sin espacios en las orillas.
 */
export function limpiarJustificacion(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").trim();
}

/** Caracteres de la justificación limpia (por letra: «é» cuenta 1, como el validador del API). */
export function largoJustificacion(texto: string | null | undefined): number {
  return Array.from(limpiarJustificacion(texto)).length;
}

export type TonoJustificacion = "neutro" | "ambar" | "rojo";

export interface EstadoJustificacion {
  /** Entre 10 y 300 caracteres: el botón «Vincular» se enciende. */
  valida: boolean;
  largo: number;
  /** La línea bajo el campo. */
  texto: string;
  tono: TonoJustificacion;
}

/** Estado del campo «¿Por qué…?»: vacía, corta, larga o lista. */
export function estadoJustificacion(texto: string | null | undefined): EstadoJustificacion {
  const largo = largoJustificacion(texto);
  if (largo === 0) {
    return {
      valida: false,
      largo,
      texto: `Obligatoria: de ${JUSTIFICACION_MIN} a ${JUSTIFICACION_MAX} caracteres.`,
      tono: "neutro",
    };
  }
  if (largo < JUSTIFICACION_MIN) {
    return { valida: false, largo, texto: `Escribe al menos ${JUSTIFICACION_MIN} caracteres (van ${largo}).`, tono: "ambar" };
  }
  if (largo > JUSTIFICACION_MAX) {
    return { valida: false, largo, texto: `Máximo ${JUSTIFICACION_MAX} caracteres (van ${largo}).`, tono: "rojo" };
  }
  return { valida: true, largo, texto: `${largo}/${JUSTIFICACION_MAX}`, tono: "neutro" };
}

type MarcadoConMedio = { id: string; no_bancario?: boolean | null; medio_pago?: string | null };

/** ¿Hay algún gasto no bancario entre los marcados? (aparece el campo «¿Por qué…?»). */
export function hayNoBancariosMarcados(marcados: readonly (MarcadoConMedio | null | undefined)[]): boolean {
  return marcados.some((m) => esCandidatoNoBancario(m));
}

/**
 * La pregunta del campo según lo marcado: «¿Por qué se vincula un gasto en
 * efectivo a este cargo?» (el caso real), en plural con varios y con el
 * medio cuando no es efectivo.
 */
export function etiquetaJustificacion(marcados: readonly (MarcadoConMedio | null | undefined)[]): string {
  const nb = marcados.filter((m): m is MarcadoConMedio => esCandidatoNoBancario(m));
  const varios = nb.length >= 2;
  const verbo = varios ? "se vinculan" : "se vincula";
  const medios = [...new Set(nb.map((m) => limpio(m.medio_pago)))];
  let que: string;
  if (medios.length === 1 && medios[0] === "EFECTIVO") {
    que = varios ? "gastos en efectivo" : "un gasto en efectivo";
  } else if (medios.length === 1 && MEDIO_PAGO_LABELS[medios[0]]) {
    const con = `pagado${varios ? "s" : ""} con ${MEDIO_PAGO_LABELS[medios[0]]}`;
    que = varios ? `gastos ${con}` : `un gasto ${con}`;
  } else {
    que = varios ? "gastos que no se pagaron por el banco" : "un gasto que no se pagó por el banco";
  }
  return `¿Por qué ${verbo} ${que} a este cargo?`;
}

/**
 * Lo que viaja como `justificacion`: el texto limpio SOLO si hay un gasto no
 * bancario marcado y es válido; null en lo demás (el cuerpo de siempre, sin
 * la llave: un API previo rechaza llaves desconocidas).
 */
export function justificacionParaEnviar(
  marcados: readonly (MarcadoConMedio | null | undefined)[],
  texto: string | null | undefined,
): string | null {
  if (!hayNoBancariosMarcados(marcados)) return null;
  return estadoJustificacion(texto).valida ? limpiarJustificacion(texto) : null;
}

/** Se intentó vincular un gasto no bancario sin una justificación válida. */
export const MSG_FALTA_JUSTIFICACION =
  "Escribe por qué se vincula el gasto en efectivo (de 10 a 300 caracteres) antes de vincular.";

/**
 * Lo marcado al APAGAR el interruptor: sin los no bancarios (ya no están en
 * la lista; lo marcado es lo que se ve). El MISMO arreglo si no cambia nada.
 */
export function marcadosSinNoBancarios<T extends MarcadoConMedio>(marcados: T[]): T[] {
  const quedan = marcados.filter((m) => !esCandidatoNoBancario(m));
  return quedan.length === marcados.length ? marcados : quedan;
}

/** Un gasto que el API dijo que NO es bancario (`details.gastos_no_bancarios`). */
export interface GastoNoBancarioDetalle {
  id: string;
  medio_pago: string | null;
  fecha_gasto: string | null;
  monto: number | string | null;
}

/** `details.gastos_no_bancarios` del 400 `JUSTIFICACION_REQUERIDA`, saneado (sin ids vacíos ni repetidos). */
export function noBancariosDeDetalle(details: unknown): GastoNoBancarioDetalle[] {
  const lista = (details as { gastos_no_bancarios?: unknown } | null | undefined)?.gastos_no_bancarios;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: GastoNoBancarioDetalle[] = [];
  for (const g of lista as Array<Record<string, unknown> | null | undefined>) {
    const id = typeof g?.id === "string" ? g.id : "";
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      id,
      medio_pago: typeof g?.medio_pago === "string" ? g.medio_pago : null,
      fecha_gasto: typeof g?.fecha_gasto === "string" ? g.fecha_gasto : null,
      monto: typeof g?.monto === "number" || typeof g?.monto === "string" ? g.monto : null,
    });
  }
  return out;
}

/**
 * Tras el 400 `JUSTIFICACION_REQUERIDA` (el medio cambió mientras el diálogo
 * estaba abierto, o la ficha no lo decía): los gastos que el API señaló se
 * marcan como no bancarios con SU medio, y aparece el campo «¿Por qué…?».
 * El MISMO arreglo si no cambia nada.
 */
export function marcadosConNoBancarios<T extends MarcadoConMedio>(
  marcados: T[],
  noBancarios: readonly Pick<GastoNoBancarioDetalle, "id" | "medio_pago">[],
): T[] {
  const porId = new Map(noBancarios.filter((g) => g?.id).map((g) => [g.id, g]));
  let cambio = false;
  const out = marcados.map((m) => {
    const g = porId.get(m.id);
    if (!g || (m.no_bancario === true && (g.medio_pago == null || m.medio_pago === g.medio_pago))) return m;
    cambio = true;
    return { ...m, no_bancario: true, medio_pago: g.medio_pago ?? m.medio_pago ?? null };
  });
  return cambio ? out : marcados;
}

/** Descripción extra del toast al vincular con justificación. */
export const NOTA_TOAST_JUSTIFICACION = "La razón quedó anotada en el cargo y en el gasto; su medio de pago no cambió.";

/** El toast de siempre y, si viajó una justificación, la nota de que quedó anotada. */
export function conNotaJustificacion(
  t: { titulo: string; descripcion?: string },
  conJustificacion: boolean,
): { titulo: string; descripcion?: string } {
  if (!conJustificacion) return t;
  const previa = (t.descripcion ?? "").trim();
  if (!previa) return { titulo: t.titulo, descripcion: NOTA_TOAST_JUSTIFICACION };
  // «…el gasto queda conciliado.» ya trae punto; «Todos cubiertos» no.
  const union = /[.!?…]$/.test(previa) ? " " : ". ";
  return { titulo: t.titulo, descripcion: `${previa}${union}${NOTA_TOAST_JUSTIFICACION}` };
}

// ───────────────────── Columna «Conciliación» y menú ─────────────────────

export const TITULO_BADGE_VINCULO_NO_BANCARIO = "Vinculado con justificación: ver notas del cargo";

/** Las líneas que el API anotó en las notas del CARGO («Vinculado a gasto en EFECTIVO del 28-sep-2026 (…): <razón> — <quién>, <fecha>»). */
const RE_LINEA_VINCULO = /^Vinculado a gasto en\s/i;

/** Las justificaciones anotadas en el cargo (una por gasto no bancario), en su orden. */
export function lineasVinculoNoBancario(notasCargo: string | null | undefined): string[] {
  if (typeof notasCargo !== "string") return [];
  return notasCargo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => RE_LINEA_VINCULO.test(l));
}

export interface BadgeVinculoNoBancario {
  /** «Efectivo». */
  texto: string;
  /** «Vinculado con justificación: ver notas del cargo» + las líneas de la nota (la tabla no muestra las notas del cargo). */
  titulo: string;
}

/**
 * La insignia junto a un gasto ligado que NO pasó por el banco (`medio_pago`
 * del embed, ADITIVO del API 0.0.63). null con un gasto bancario o sin el
 * campo (API previo): el marcado queda IDÉNTICO al de antes.
 */
export function badgeVinculoNoBancario(
  g: { medio_pago?: string | null } | null | undefined,
  notasCargo?: string | null,
): BadgeVinculoNoBancario | null {
  if (!g || !esMedioNoBancario(g.medio_pago)) return null;
  return {
    texto: etiquetaMedioNoBancario(g.medio_pago),
    titulo: [TITULO_BADGE_VINCULO_NO_BANCARIO, ...lineasVinculoNoBancario(notasCargo)].join("\n"),
  };
}

/**
 * Línea extra de la confirmación de «Desvincular» cuando el cargo paga algún
 * gasto no bancario: el API borra la justificación de los dos lados. null si
 * todos son bancarios (la confirmación de siempre).
 */
export function textoDesvincularNoBancario(gastos: readonly ({ medio_pago?: string | null } | null | undefined)[]): string | null {
  const n = gastos.filter((g) => g && esMedioNoBancario(g.medio_pago)).length;
  if (n === 0) return null;
  return n === 1
    ? "La justificación que se anotó al vincular el gasto en efectivo se borra del cargo y del gasto; su medio de pago sigue igual."
    : `La justificación que se anotó al vincular los ${n} gastos en efectivo u otros medios se borra del cargo y de cada gasto; su medio de pago sigue igual.`;
}

// ───────────────────────────── API previo ─────────────────────────────

/** El API no conoce `incluir_no_bancarios` (400 del DTO): el interruptor no sirve todavía. */
export const MSG_NO_BANCARIOS_API_VIEJO =
  "El servidor todavía no permite incluir gastos en efectivo (falta actualizar el API). Apaga «Incluir gastos en efectivo y otros medios».";

/** El API no conoce `justificacion` (400 del DTO). */
export const MSG_JUSTIFICACION_API_VIEJO =
  "El servidor todavía no permite vincular gastos en efectivo con una justificación (falta actualizar el API).";

/** 400 «property incluir_no_bancarios should not exist» = el DTO del API previo. */
export function esDtoSinNoBancarios(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 400 && /property incluir_no_bancarios should not exist/i.test(r.error ?? "");
}

/** 400 «property justificacion should not exist» = el DTO del API previo. */
export function esDtoSinJustificacion(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 400 && /property justificacion should not exist/i.test(r.error ?? "");
}
