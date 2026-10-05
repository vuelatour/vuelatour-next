/**
 * Cotización con FECHA NUEVA ⇒ ¿mover también el vuelo operativo? (5-oct-2026)
 *
 * Pedido del cliente: «al momento de actualizar/editar la fecha de una
 * cotización y cuando se guarde de manera correcta, aparezca un pequeño modal
 * que diga: se actualizó la fecha de cotización, ¿desea que la fecha del vuelo
 * operativo se actualice también? Mostrar la fecha del vuelo operativo al
 * momento… mencionar que esto será solo para fecha, y que las horas de los
 * tramos se tienen que editar desde el vuelo operativo. Sobre todo necesito
 * que esto no agregue nada a la estructura de la hoja de cotización».
 *
 * Por qué hace falta: `POST /v1/quotes/:id/revise` escribe `vuelo.fecha_vuelo`
 * (la «Fecha del vuelo» que imprime el PDF) pero NO mueve los tramos
 * (`escala.fecha_salida_plan`, con hora): el panel manda la fecha de la escala
 * VIVA y el API la conserva. Resultado: la cotización dice el día nuevo y la
 * operación (tramos, app del piloto, calendario) sigue en el viejo. El modal
 * deja que la oficina lo decida; el «Sí» llama a
 * `POST /v1/flights/:id/tramos/alinear-fecha` (API 0.0.55), que corre CADA
 * tramo vivo los mismos días conservando su hora de pared en Cancún.
 *
 * PURO (sin React ni red): la decisión, los textos y los errores viven aquí;
 * el diálogo (`components/admin/quotes/reagendar-tramos-dialog.tsx`), el
 * workspace y la banda del detalle del vuelo
 * (`components/admin/flights/fecha-operativa-banda.tsx`, revisión 5-oct-2026:
 * si contestaron «No», ahí se mueve en un clic) solo los pintan. Ningún
 * componente redacta estas frases.
 */
import { fechaLargaDia, isoToCancunInput } from "@/lib/datetime";
import { estadoVueloVolado } from "@/lib/admin/avion-cotizado";
import { esErrorTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";

// ───────────────────────────── Tipos ─────────────────────────────

/** Tramo mínimo que lee la decisión (tolera escalas parciales del API). */
export interface TramoConFecha {
  orden?: number | null;
  fecha_salida_plan?: string | null;
  cancelada_at?: string | null;
  taco_salida?: unknown;
  taco_llegada?: unknown;
}

/**
 * Lo mínimo de una cotización (`PersistedQuote` cumple esta forma): estado,
 * la fecha del vuelo de la cotización y las escalas VIVAS del vuelo.
 */
export interface CotizacionConFechas {
  estado?: string | null;
  fecha_vuelo?: string | null;
  escalas?: ReadonlyArray<TramoConFecha> | null;
}

/** Por qué NO se pregunta (para pruebas y diagnóstico; la UI no lo pinta). */
export type MotivoSinPregunta =
  | "sin_cambio"
  /** Solo la banda del detalle del vuelo: el vuelo no tiene `fecha_vuelo`. */
  | "sin_fecha"
  | "cancelado"
  | "ya_volo"
  | "sin_tramos"
  | "mismo_dia";

export type DecisionReagendar =
  | {
      preguntar: true;
      /** `fecha_vuelo` de la cotización recién guardada (ISO). */
      nuevaFecha: string;
      /** `fecha_salida_plan` del primer tramo vivo con fecha (ISO). */
      fechaOperativa: string;
    }
  | {
      preguntar: false;
      motivo: MotivoSinPregunta;
      nuevaFecha: string | null;
      fechaOperativa: string | null;
    };

/** Un tramo en la respuesta de `POST /v1/flights/:id/tramos/alinear-fecha`. */
export interface TramoAlineado {
  id: string;
  orden: number;
  origen_iata: string | null;
  destino_iata: string | null;
  fecha_salida_plan_antes: string | null;
  fecha_salida_plan: string | null;
}

/** Respuesta del API 0.0.55 (contrato del 5-oct-2026, 1:1). */
export interface AlineacionFechaTramos {
  vuelo_id: string;
  folio: number | null;
  /** Días calendario Cancún que se corrió la operación; `null` = no había
   *  ningún tramo con fecha (el tramo 1 recibió la fecha del vuelo). */
  delta_dias: number | null;
  fecha_objetivo: string | null;
  tramos: TramoAlineado[];
  fecha_traslado_final: string | null;
  tramos_movidos: number;
}

// ───────────────────────────── Fechas ─────────────────────────────

/**
 * Día de PARED en Cancún («YYYY-MM-DD») de un instante ISO. Un día suelto
 * «YYYY-MM-DD» ya ES pared y no pasa por la zona; vacío o ilegible ⇒ `null`.
 * Reutiliza `isoToCancunInput` (fuente única de la conversión a Cancún).
 */
export function diaCancunDe(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const txt = iso.trim();
  if (!txt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  const pared = isoToCancunInput(txt);
  return pared ? pared.slice(0, 10) : null;
}

/**
 * «7 de octubre de 2026» (día Cancún). Sin `Date` ni `toLocaleDateString`:
 * el día sale de `diaCancunDe` y el texto de `fechaLargaDia` (`lib/datetime`,
 * tabla única de meses). Ilegible ⇒ «—».
 */
export function fechaLargaCancun(iso: string | null | undefined): string {
  return fechaLargaDia(diaCancunDe(iso));
}

/**
 * Fecha del VUELO OPERATIVO: `fecha_salida_plan` del primer tramo VIVO (no
 * cancelado) por `orden` que tenga fecha. Misma referencia que usa el API
 * para calcular cuántos días se corre la operación. `null` si ninguno.
 */
export function fechaOperativaDe(
  quote: CotizacionConFechas | null | undefined,
): string | null {
  const clave = (t: TramoConFecha, i: number) =>
    Number.isFinite(Number(t.orden)) && t.orden != null ? Number(t.orden) : i;
  const vivos = (quote?.escalas ?? [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.cancelada_at)
    .sort((a, b) => clave(a.t, a.i) - clave(b.t, b.i));
  for (const { t } of vivos) {
    if (diaCancunDe(t.fecha_salida_plan)) return (t.fecha_salida_plan ?? "").trim();
  }
  return null;
}

// ───────────────────────────── Decisión ─────────────────────────────

/**
 * Regla COMPARTIDA del modal (al guardar la cotización) y de la banda del
 * detalle del vuelo: dado el día nuevo, ¿hay una operación que mover? `null`
 * = sí; si no, el motivo. Orden: cancelado ⇒ ya voló ⇒ sin tramos con fecha
 * ⇒ la operación ya está en ese día.
 */
function motivoSinDesfase(
  vuelos: ReadonlyArray<CotizacionConFechas | null | undefined>,
  diaNuevo: string,
  fechaOperativa: string | null,
): MotivoSinPregunta | null {
  const cancelado = (q: CotizacionConFechas | null | undefined) =>
    (q?.estado ?? "").toUpperCase() === "CANCELADO";
  if (vuelos.some(cancelado)) return "cancelado";
  if (vuelos.some((q) => estadoVueloVolado(q).yaVolo)) return "ya_volo";
  const diaOperativo = diaCancunDe(fechaOperativa);
  if (!fechaOperativa || !diaOperativo) return "sin_tramos";
  if (diaOperativo === diaNuevo) return "mismo_dia";
  return null;
}

/**
 * ¿Se pregunta si mover el vuelo operativo? SOLO cuando:
 *  1. el DÍA Cancún de `fecha_vuelo` cambió entre la cotización que se abrió
 *     (`antes`) y la que devolvió el guardado (`despues`), y hay día nuevo;
 *  2. el vuelo NO está cancelado (el API respondería 409 `VUELO_CANCELADO`);
 *  3. el vuelo NO ha volado (`estadoVueloVolado`, espejo del API: un vuelo
 *     volado conserva sus fechas — invariante 24-sep #338);
 *  4. hay fecha operativa (algún tramo vivo con fecha) y su día ≠ el nuevo.
 *
 * La fecha operativa sale de `despues.escalas` (revise devuelve las escalas
 * YA escritas); si esa respuesta no las trae, de `antes`.
 */
export function decidirPreguntaReagendar(input: {
  antes: CotizacionConFechas | null | undefined;
  despues: CotizacionConFechas | null | undefined;
}): DecisionReagendar {
  const { antes, despues } = input;
  const nuevaFecha = (despues?.fecha_vuelo ?? "").trim() || null;
  const fechaOperativa = fechaOperativaDe(
    Array.isArray(despues?.escalas) ? despues : antes,
  );
  const no = (motivo: MotivoSinPregunta): DecisionReagendar => ({
    preguntar: false,
    motivo,
    nuevaFecha,
    fechaOperativa,
  });

  const diaNuevo = diaCancunDe(nuevaFecha);
  if (!diaNuevo || diaNuevo === diaCancunDe(antes?.fecha_vuelo)) return no("sin_cambio");

  const motivo = motivoSinDesfase([antes, despues], diaNuevo, fechaOperativa);
  if (motivo) return no(motivo);
  return { preguntar: true, nuevaFecha: nuevaFecha as string, fechaOperativa: fechaOperativa as string };
}

export type DecisionBandaFechaOperativa =
  | {
      mostrar: true;
      /** `fecha_vuelo` del vuelo (la «Fecha del vuelo» de la cotización). */
      fechaCotizacion: string;
      /** `fecha_salida_plan` del primer tramo vivo con fecha. */
      fechaOperativa: string;
    }
  | {
      mostrar: false;
      motivo: MotivoSinPregunta;
      fechaCotizacion: string | null;
      fechaOperativa: string | null;
    };

/**
 * BANDA del detalle del vuelo (revisión 5-oct-2026): si en el modal la
 * oficina contestó «No», el modal no vuelve a salir (la cotización ya tiene
 * la fecha nueva), así que el detalle del vuelo ofrece mover la operación en
 * UN clic en lugar de editar tramo por tramo. MISMA regla que el modal
 * (`motivoSinDesfase`), pero sin «antes/después»: se muestra cuando el día
 * Cancún de `fecha_vuelo` ≠ el de la fecha operativa y el vuelo no está
 * cancelado ni ha volado. Sin `fecha_vuelo` ⇒ `sin_fecha`.
 */
export function decidirBandaFechaOperativa(
  vuelo: CotizacionConFechas | null | undefined,
): DecisionBandaFechaOperativa {
  const fechaCotizacion = (vuelo?.fecha_vuelo ?? "").trim() || null;
  const fechaOperativa = fechaOperativaDe(vuelo);
  const diaCotizacion = diaCancunDe(fechaCotizacion);
  const motivo: MotivoSinPregunta | null = !diaCotizacion
    ? "sin_fecha"
    : motivoSinDesfase([vuelo], diaCotizacion, fechaOperativa);
  if (motivo) return { mostrar: false, motivo, fechaCotizacion, fechaOperativa };
  return {
    mostrar: true,
    fechaCotizacion: fechaCotizacion as string,
    fechaOperativa: fechaOperativa as string,
  };
}

// ───────────────────────────── Textos ─────────────────────────────

export const TITULO_REAGENDAR = "Se actualizó la fecha de la cotización";

/** Cuerpo del modal con las DOS fechas (día Cancún, «7 de octubre de 2026»). */
export function textoReagendar(
  nuevaFecha: string | null | undefined,
  fechaOperativa: string | null | undefined,
): string {
  return (
    `La cotización ahora dice el ${fechaLargaCancun(nuevaFecha)}. ` +
    `El vuelo operativo (sus tramos) sigue programado para el ${fechaLargaCancun(fechaOperativa)}. ` +
    "¿Quieres mover también el vuelo operativo a la fecha nueva?"
  );
}

export const NOTA_SOLO_FECHA =
  "Solo cambia la fecha: cada tramo conserva su hora. Las horas de los tramos " +
  "se editan desde el detalle del vuelo. Si no lo mueves ahora, puedes hacerlo " +
  "después desde el vuelo.";

export const BOTON_MOVER = "Sí, mover el vuelo operativo";
export const BOTON_MOVIENDO = "Moviendo el vuelo operativo…";
export const BOTON_SOLO_COTIZACION = "No, solo la cotización";

export const TOAST_NO_MOVIDO =
  "La operación no cambió: puedes moverla después desde el detalle del vuelo";

export const TOAST_YA_ESTABA = "El vuelo operativo ya estaba en esa fecha";

/**
 * Cierre SIN mover después de un error que pudo dejar tramos movidos (503
 * `TRAMOS_NO_MOVIDOS`, respuesta perdida, servidor caído): no se afirma que
 * «la operación no cambió» porque puede que sí (revisión 5-oct-2026).
 */
export const TOAST_REVISA_TRAMOS =
  "Revisa las fechas de los tramos del vuelo: puede que algunos ya se hayan movido";

// ── Variante del DETALLE DEL VUELO (banda ámbar + el mismo diálogo) ──

/** Dónde se abre el diálogo: al guardar la cotización o desde el vuelo. */
export type ContextoReagendar = "cotizacion" | "vuelo";

export const BOTON_BANDA_MOVER = "Mover el vuelo operativo a la fecha de la cotización";

/** Texto de la banda ámbar del detalle del vuelo (las DOS fechas). */
export function textoBandaFechaOperativa(
  fechaCotizacion: string | null | undefined,
  fechaOperativa: string | null | undefined,
): string {
  return (
    `La cotización dice el ${fechaLargaCancun(fechaCotizacion)}, pero el vuelo ` +
    `operativo (sus tramos) sigue programado para el ${fechaLargaCancun(fechaOperativa)}.`
  );
}

/** Roles que pueden mover el vuelo operativo (los del endpoint del API). */
const ROLES_MUEVEN_OPERATIVO = new Set(["ADMIN", "COORDINADOR"]);

/** ¿Este rol ve el botón de la banda? (el API igual responde 403 a otros). */
export function puedeMoverVueloOperativo(rol: string | null | undefined): boolean {
  return ROLES_MUEVEN_OPERATIVO.has((rol ?? "").toUpperCase());
}

/** La banda sin botón (otro rol): a quién pedírselo. */
export const NOTA_BANDA_SIN_PERMISO =
  "Pide a administración o a coordinación que mueva el vuelo operativo.";

export const TITULO_MOVER_DESDE_VUELO = BOTON_BANDA_MOVER;

/** Cuerpo del diálogo abierto desde el detalle del vuelo. */
export function textoMoverDesdeVuelo(
  fechaCotizacion: string | null | undefined,
  fechaOperativa: string | null | undefined,
): string {
  return (
    `La cotización dice el ${fechaLargaCancun(fechaCotizacion)}. ` +
    `El vuelo operativo (sus tramos) sigue programado para el ${fechaLargaCancun(fechaOperativa)}. ` +
    "¿Quieres mover el vuelo operativo a la fecha de la cotización?"
  );
}

export const NOTA_SOLO_FECHA_VUELO =
  "Solo cambia la fecha: cada tramo conserva su hora. Las horas se editan " +
  "tramo por tramo en este mismo vuelo.";

export const BOTON_AHORA_NO = "Ahora no";

export interface TextosDialogoReagendar {
  titulo: string;
  descripcion: string;
  nota: string;
  botonMover: string;
  botonMoviendo: string;
  botonNo: string;
}

/** Todos los textos del diálogo según dónde se abre (fuente única). */
export function textosDialogoReagendar(
  contexto: ContextoReagendar,
  nuevaFecha: string | null | undefined,
  fechaOperativa: string | null | undefined,
): TextosDialogoReagendar {
  if (contexto === "vuelo") {
    return {
      titulo: TITULO_MOVER_DESDE_VUELO,
      descripcion: textoMoverDesdeVuelo(nuevaFecha, fechaOperativa),
      nota: NOTA_SOLO_FECHA_VUELO,
      botonMover: BOTON_MOVER,
      botonMoviendo: BOTON_MOVIENDO,
      botonNo: BOTON_AHORA_NO,
    };
  }
  return {
    titulo: TITULO_REAGENDAR,
    descripcion: textoReagendar(nuevaFecha, fechaOperativa),
    nota: NOTA_SOLO_FECHA,
    botonMover: BOTON_MOVER,
    botonMoviendo: BOTON_MOVIENDO,
    botonNo: BOTON_SOLO_COTIZACION,
  };
}

/**
 * Toast al cerrar SIN mover («No» / «Ahora no» / Esc). `quizaMovio` = en este
 * diálogo hubo un error que pudo dejar tramos movidos ⇒ texto neutro. Desde
 * la cotización, sin error: `TOAST_NO_MOVIDO`. Desde el vuelo, sin error: nada
 * (la banda sigue a la vista; cerrar no necesita aviso).
 */
export function toastAlCerrarSinMover(p: {
  contexto: ContextoReagendar;
  quizaMovio: boolean;
}): string | null {
  if (p.quizaMovio) return TOAST_REVISA_TRAMOS;
  return p.contexto === "vuelo" ? null : TOAST_NO_MOVIDO;
}

/**
 * Toast tras mover: «Vuelo operativo movido: 3 tramos ahora salen el 7 de
 * octubre de 2026». Un viaje de varios días (los tramos quedan en días
 * distintos) dice «a partir del …» para no afirmar que todos salen ese día.
 * `delta_dias = 0` o nada movido ⇒ «ya estaba en esa fecha».
 */
export function toastReagendado(res: AlineacionFechaTramos | null | undefined): string {
  const movidos = Number(res?.tramos_movidos ?? 0);
  if (!res || res.delta_dias === 0 || !Number.isFinite(movidos) || movidos <= 0) {
    return TOAST_YA_ESTABA;
  }
  const tramos = Array.isArray(res.tramos) ? res.tramos : [];
  const referencia =
    diaCancunDe(res.fecha_objetivo) != null
      ? res.fecha_objetivo
      : (tramos.find((t) => diaCancunDe(t.fecha_salida_plan))?.fecha_salida_plan ?? null);
  const dias = new Set(
    tramos.map((t) => diaCancunDe(t.fecha_salida_plan)).filter((d): d is string => d != null),
  );
  const cuantos = movidos === 1 ? "1 tramo ahora sale" : `${movidos} tramos ahora salen`;
  if (!referencia) return `Vuelo operativo movido: ${cuantos} en la fecha nueva`;
  const cuando = dias.size > 1 ? "a partir del" : "el";
  return `Vuelo operativo movido: ${cuantos} ${cuando} ${fechaLargaCancun(referencia)}`;
}

// ───────────────────────────── Errores ─────────────────────────────

export const MSG_REAGENDAR_API_VIEJO =
  "Falta actualizar el servidor: mueve la fecha desde el detalle del vuelo";

/** Respaldo = texto EXACTO del API (`MENSAJE_VUELO_YA_VOLO`, alinear-fecha.util.ts). */
export const MSG_REAGENDAR_YA_VOLO =
  "La operación ya empezó: la fecha de cada tramo se edita desde el vuelo.";

/** Respaldo = texto EXACTO del API (`MENSAJE_VUELO_CANCELADO`). */
export const MSG_REAGENDAR_CANCELADO =
  "El vuelo está cancelado: no hay operación que mover.";

/** Código del 503 del API cuando la escritura falló a medio camino. */
export const CODE_TRAMOS_NO_MOVIDOS = "TRAMOS_NO_MOVIDOS";

export const MSG_REAGENDAR_SIN_PERMISO =
  "Tu usuario no puede mover el vuelo operativo: pide a un administrador o a " +
  "coordinación que lo haga desde el detalle del vuelo.";

export const MSG_REAGENDAR_VUELO_INVALIDO =
  "No se reconoce el vuelo. Recarga la página.";

export const MSG_REAGENDAR_SESION =
  "Tu sesión venció: recarga la página y vuelve a intentarlo.";

export const MSG_REAGENDAR_GENERICO =
  "No se pudo mover el vuelo operativo. Vuelve a intentarlo; si sigue igual, " +
  "mueve la fecha desde el detalle del vuelo.";

/** Validación de class-validator o del RolesGuard (inglés): nunca se pinta. */
const RE_INGLES_API = /\b(should not exist|must be|must match|Required role)\b/i;

/** Rechazos de negocio cuyo texto del API se pinta TAL CUAL (con respaldo). */
const RESPALDO_POR_CODIGO: Record<string, string> = {
  VUELO_YA_VOLO: MSG_REAGENDAR_YA_VOLO,
  VUELO_CANCELADO: MSG_REAGENDAR_CANCELADO,
};

/**
 * Error del «Sí» en es-MX. `VUELO_YA_VOLO` / `VUELO_CANCELADO` ⇒ el texto del
 * API (o su respaldo si llegara técnico); 404 «Cannot POST …» (API previo,
 * sin la ruta) ⇒ «Falta actualizar el servidor…»; técnico o de red ⇒
 * `MSG_SERVIDOR_NO_RESPONDIO`; inglés de validación ⇒ genérico. Cualquier
 * otro mensaje en español del API (p. ej. 404 `VUELO_NO_EXISTE`) va tal cual.
 */
export function mensajeErrorReagendar(r: {
  error?: string | null;
  code?: string | null;
  status?: number | null;
}): string {
  const msg = (r.error ?? "").trim();
  const code = (r.code ?? "").trim();
  const respaldo = RESPALDO_POR_CODIGO[code];
  if (respaldo) return esErrorTecnico(r) || RE_INGLES_API.test(msg) ? respaldo : msg;
  if (r.status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return MSG_REAGENDAR_API_VIEJO;
  }
  if (r.status === 401) return MSG_REAGENDAR_SESION;
  if (r.status === 403) return MSG_REAGENDAR_SIN_PERMISO;
  if (esErrorTecnico(r)) return MSG_SERVIDOR_NO_RESPONDIO;
  if (RE_INGLES_API.test(msg)) return MSG_REAGENDAR_GENERICO;
  return msg;
}

/**
 * ¿El error pudo dejar el vuelo operativo (parcial o totalmente) movido? Sí
 * con el 503 `TRAMOS_NO_MOVIDOS` (el API dice si revirtió, pero «algunos
 * quedaron» es posible), cualquier 5xx y los fallos técnicos o de red (la
 * respuesta se perdió DESPUÉS de que el API escribió, o la server action
 * reventó). Entonces el panel refresca (el cotizador limpio se resetea con lo
 * que REALMENTE quedó en la BD: un guardado posterior no revierte tramos) y
 * el cierre sin mover usa `TOAST_REVISA_TRAMOS`. Un 4xx de negocio no.
 */
export function errorPuedeHaberMovido(r: {
  error?: string | null;
  code?: string | null;
  status?: number | null;
}): boolean {
  if ((r.code ?? "").trim() === CODE_TRAMOS_NO_MOVIDOS) return true;
  if (r.status != null && r.status >= 500) return true;
  if (r.status != null && r.status >= 400) return false;
  return esErrorTecnico(r);
}

/** Lo que devuelve `alinearFechaTramosAction` (`ActionResult` cumple esta forma). */
export interface ResultadoAlinearAction {
  ok: boolean;
  data?: AlineacionFechaTramos;
  error?: string;
  code?: string;
  status?: number;
}

export type ResultadoMoverOperativo =
  | { ok: true; toast: string }
  | { ok: false; error: string; refrescar: boolean };

/**
 * El «Sí» del diálogo, sin React: llama a la action (inyectada) y traduce el
 * resultado. NUNCA lanza: si la llamada a la server action revienta en el
 * cliente («Failed to find Server Action» tras un deploy de Vercel, red
 * caída) se trata como error técnico — antes el throw escapaba de la
 * transición y React mandaba la cotización entera al error boundary
 * (revisión 5-oct-2026).
 */
export async function moverVueloOperativo(
  llamar: () => Promise<ResultadoAlinearAction>,
): Promise<ResultadoMoverOperativo> {
  let res: ResultadoAlinearAction;
  try {
    res = await llamar();
  } catch (err) {
    res = { ok: false, error: err instanceof Error ? err.message : "" };
  }
  if (res?.ok) return { ok: true, toast: toastReagendado(res.data) };
  const r = res ?? { ok: false };
  return { ok: false, error: mensajeErrorReagendar(r), refrescar: errorPuedeHaberMovido(r) };
}
