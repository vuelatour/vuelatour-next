/**
 * ESTADO VISIBLE de la sincronización sistema → Google Calendar (pedido del
 * cliente 12-sep-2026: «queremos que se sincronicen los vuelos, eventos,
 * mantenimientos, etc. que tenemos en el calendario del sistema de VuelaTour
 * al Google Calendar de aerochartercancunflightplanner@gmail.com»).
 *
 * Segunda parte del pedido (12-sep-2026): «el calendario debe sincronizarse de
 * forma AUTOMÁTICA cada que se realizan cambios, sin sincronización manual».
 * El API pasó de hooks best-effort a una COLA PERSISTENTE en la BD (triggers)
 * drenada por un worker cada 20 s con reintentos: el panel ya no solo dice si
 * la sync está encendida, dice si es AUTOMÁTICA y si hay cambios EN ESPERA
 * (los que la app offline sube al reconectar entran por la misma cola).
 *
 * FUENTE ÚNICA de los textos en es-MX que ve la oficina junto al botón
 * «Re-sincronizar Google» del calendario:
 * - `chipSyncGoogle` ← GET /v1/calendar/sync-estado (chip de estado).
 * - `toastResyncGoogle` ← POST /v1/calendar/resync (toast del backfill).
 *
 * Helpers PUROS (sin fetch, sin React) para poder probarlos con vitest:
 * reciben la respuesta del API y devuelven qué decir y en qué tono. `ahora` es
 * un parámetro (epoch ms) y no una lectura escondida del reloj, para que la
 * regla de «lleva más de 15 min en espera» se pruebe sin fingir el tiempo.
 *
 * Tolerancia a un API viejo (el panel se despliega antes que el API):
 * - `sync-estado` 404 / 403 ⇒ `estado = null` ⇒ «estado no disponible». JAMÁS
 *   se pinta «apagado» sin que el API lo afirme (sería mentir a la oficina).
 * - `resync` viejo devuelve `{enabled, total}` (solo vuelos redondos) ⇒ el
 *   toast lo dice tal cual y avisa que los demás tipos llegan con el
 *   siguiente despliegue; no se inventan conteos por tipo.
 * - `cola` AUSENTE (API que no sabe de colas) ⇒ el chip se comporta como
 *   antes (verde con el calendario), no se afirma nada de la cola.
 * - `cola: null` (el API sí sabe, pero la migración de la cola no está
 *   aplicada) ⇒ ámbar «sin cola (migración pendiente)»: la sync funciona al
 *   momento pero un fallo de Google se corrige hasta la madrugada.
 *
 * C7 del contrato: los eventos que la oficina capturó A MANO en ese Google
 * Calendar no se tocan (ni se borran ni se deduplican). El API lo repite en
 * `nota` y el toast la muestra tal como venga.
 *
 * Fechas SIEMPRE en hora de Cancún (`fmtDateTime`), nunca en la TZ del
 * navegador ni del servidor de Vercel (UTC).
 */

import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import type {
  CalendarResyncResultado,
  CalendarResyncResumen,
  CalendarSyncCola,
  CalendarSyncEstado,
} from "@/types/calendar";

/** Las 3 variables que enciende la sync en Railway (las pone el usuario). */
export const VARS_GOOGLE_SYNC =
  "GOOGLE_CALENDAR_SYNC_ENABLED, GOOGLE_CALENDAR_ID y GOOGLE_SERVICE_ACCOUNT_JSON";

/** Qué publica el sistema (mismo listado que el calendario del panel). */
const QUE_SE_PUBLICA =
  "vuelos, descansos de piloto, eventos de flota y mantenimientos con fecha";

/**
 * Minutos que un cambio puede llevar en la cola sin que el chip se alarme. El
 * worker drena cada 20 s, así que 15 min ya significa que Google o la red
 * están fallando y alguien tiene que enterarse.
 */
export const MINUTOS_ESPERA_AMBAR = 15;

export type TonoSyncGoogle = "activo" | "apagado" | "atencion" | "desconocido";

export interface ChipSyncGoogle {
  /** Verde = al día, ámbar = apagada o necesita atención, gris = el API no lo
   *  reporta. */
  tono: TonoSyncGoogle;
  /** Línea del chip. */
  texto: string;
  /** Segunda línea (últimas corridas u hoja de ruta). */
  detalle: string | null;
  /** Tooltip largo: qué significa y qué hacer. */
  titulo: string;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Conteos con al menos 1 (los ceros no se pintan: ruido para la oficina). */
function conteos(r: CalendarResyncResumen): string[] {
  const partes: string[] = [];
  if (r.vuelos) partes.push(plural(r.vuelos, "vuelo", "vuelos"));
  if (r.descansos) partes.push(plural(r.descansos, "descanso", "descansos"));
  if (r.eventos) partes.push(plural(r.eventos, "evento", "eventos"));
  if (r.mantenimientos)
    partes.push(plural(r.mantenimientos, "mantenimiento", "mantenimientos"));
  return partes;
}

/** ¿La respuesta trae el desglose por tipo del API nuevo? */
function tieneDesglose(r: CalendarResyncResumen): boolean {
  return (
    typeof r.vuelos === "number" ||
    typeof r.descansos === "number" ||
    typeof r.eventos === "number" ||
    typeof r.mantenimientos === "number"
  );
}

/** Minutos completos entre `iso` y `ahora`; null si no hay fecha válida. */
function minutosDesde(iso: string | null | undefined, ahora: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}

/** ¿`iso` es una fecha válida posterior a `ahora`? */
function futuro(iso: string | null | undefined, ahora: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t > ahora;
}

/** 42 → «42 min»; 95 → «1 h 35 min» (la oficina no lee «5700 s»). */
function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** El error del API se pinta tal cual pero recortado: el chip no es un log. */
function recorta(txt: string | null | undefined, max = 140): string | null {
  const t = txt?.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Corridas de las redes de seguridad (reconcile nocturno y resync manual). */
function corridasTexto(estado: CalendarSyncEstado): string[] {
  const corridas: string[] = [];
  if (estado.ultimo_reconcile_at)
    corridas.push(`última revisión automática ${fmtDateTime(estado.ultimo_reconcile_at)}`);
  if (estado.ultimo_resync_at)
    corridas.push(`última re-sincronización manual ${fmtDateTime(estado.ultimo_resync_at)}`);
  return corridas;
}

/** «Último resultado: 42 vuelos · 2 eventos · 1 con error.» para el tooltip. */
function ultimoResultadoTexto(estado: CalendarSyncEstado): string {
  const resumen = estado.ultimo_resumen ? conteos(estado.ultimo_resumen) : [];
  if (!resumen.length) return "";
  const errores = estado.ultimo_resumen?.errores ?? 0;
  return ` Último resultado: ${resumen.join(" · ")}${errores ? ` · ${errores} con error` : ""}.`;
}

/** Lo que hay que saber de la cola, ya interpretado (sin textos). */
interface EsperaCola {
  pendientes: number;
  conError: number;
  /** Minutos que lleva esperando el más antiguo (null = no se sabe/no hay). */
  espera: number | null;
  /** Hay que llamar la atención: algo no está subiendo. */
  ambar: boolean;
}

function leerEspera(cola: CalendarSyncCola, ahora: number): EsperaCola {
  const pendientes = Math.max(0, Math.trunc(cola.pendientes ?? 0));
  const conError = Math.max(0, Math.trunc(cola.con_error ?? 0));
  const espera = pendientes > 0 ? minutosDesde(cola.mas_antiguo_at, ahora) : null;
  return {
    pendientes,
    conError,
    espera,
    // Un cambio recién encolado NO es un problema (el worker corre cada 20 s);
    // sí lo es uno que lleva cuarto de hora o que ya falló al menos una vez.
    ambar: conError > 0 || (espera !== null && espera >= MINUTOS_ESPERA_AMBAR),
  };
}

/** «3 cambios en espera» / «Sin cambios en espera». */
function enEsperaTexto(n: number): string {
  return n === 0
    ? "Sin cambios en espera"
    : `${plural(n, "cambio", "cambios")} en espera`;
}

/** Chip cuando la sync es AUTOMÁTICA (cola activa): lo normal a partir de hoy. */
function chipAutomatica(
  estado: CalendarSyncEstado,
  cola: CalendarSyncCola,
  ahora: number,
  calendario: string,
): ChipSyncGoogle {
  const { pendientes, conError, espera, ambar } = leerEspera(cola, ahora);
  const enEspera = Math.max(pendientes, conError);

  // Segunda línea: SOLO lo que la oficina puede accionar. Las corridas de las
  // redes de seguridad (reconcile/resync) se van al tooltip para no tapar el
  // dato importante, que es si hay algo atorado.
  const partes: string[] = [enEsperaTexto(pendientes)];
  let conFecha = false;
  if (pendientes > 0 && espera !== null) {
    partes.push(
      `el más antiguo lleva ${duracion(espera)} (desde ${fmtDateTime(cola.mas_antiguo_at)})`,
    );
    conFecha = true;
  }
  if (conError > 0) {
    const err = recorta(cola.ultimo_error);
    partes.push(`${conError} con error${err ? `: ${err}` : ""}`);
  }
  // Pausa por cuota de Google: solo se pinta si TODAVÍA está vigente (una
  // pausa vencida asustaría por nada).
  const pausada = futuro(cola.pausada_hasta, ahora) ? cola.pausada_hasta : null;
  if (pausada) {
    partes.push(`Google pidió esperar hasta ${fmtDateTime(pausada)}; se reanuda solo`);
    conFecha = true;
  }
  if (pendientes === 0 && cola.ultimo_drenado_at) {
    partes.push(`última subida ${fmtDateTime(cola.ultimo_drenado_at)}`);
    conFecha = true;
  }
  const detalle = `${partes.join(" · ")}${conFecha ? " · hora de Cancún" : ""}`;
  const corridas = corridasTexto(estado);
  const redesEnTooltip = corridas.length
    ? ` Redes de seguridad: ${corridas.join(" · ")} (hora de Cancún).`
    : "";

  if (ambar) {
    return {
      tono: "atencion",
      texto: `Google Calendar: automática · ${enEsperaTexto(enEspera)}`,
      detalle,
      titulo: `${plural(enEspera, "cambio", "cambios")} todavía no ${enEspera === 1 ? "llega" : "llegan"} a ${calendario}. Nada se pierde: la cola los guarda y el sistema los reintenta solo cada pocos segundos, esperando cada vez más entre intentos. Si no bajan a cero en la próxima hora, avisa a soporte; el calendario del panel funciona igual.${redesEnTooltip}`,
    };
  }

  return {
    tono: "activo",
    texto: "Google Calendar: activo · automática",
    detalle,
    titulo: `Cada cambio que se captura (en el panel o en la app, incluidos los que la app sube al reconectar) se publica solo en ${calendario}: ${QUE_SE_PUBLICA}. Si Google falla, el sistema reintenta hasta lograrlo — no hace falta pulsar «Re-sincronizar Google». Los eventos que la oficina capturó a mano en Google no se tocan.${redesEnTooltip}${ultimoResultadoTexto(estado)}`,
  };
}

/**
 * ¿La sync es AUTOMÁTICA (cada cambio se publica solo, con reintentos)? Es
 * `enabled && cola.activa`; el API nuevo lo manda hecho y en un API viejo
 * (sin `cola`) es `false` — nunca se AFIRMA que sea automática sin evidencia.
 */
export function syncEsAutomatica(
  estado: CalendarSyncEstado | null | undefined,
): boolean {
  if (!estado?.enabled) return false;
  return estado.automatica ?? estado.cola?.activa === true;
}

/**
 * Tooltip del botón «Re-sincronizar Google». Con la sync automática el botón
 * deja de ser el camino normal (el cliente pidió «sin sincronización manual»):
 * queda como backfill de la ventana para el arranque o una duda.
 */
export function tituloBotonResync(automatica: boolean): string {
  return automatica
    ? "No hace falta para el día a día: la sincronización ya es automática. Esto vuelve a publicar la ventana completa (hoy−30 días a hoy+1 año), útil para el arranque o si sospechas que falta algo viejo."
    : "Publica en Google la ventana completa (hoy−30 días a hoy+1 año). No duplica nada: volver a pulsarlo es seguro.";
}

/** Chip de estado junto al botón «Re-sincronizar Google». */
export function chipSyncGoogle(
  estado: CalendarSyncEstado | null | undefined,
  /** Epoch ms contra el que se mide la espera de la cola. */
  ahora: number = Date.now(),
): ChipSyncGoogle {
  if (!estado) {
    return {
      tono: "desconocido",
      texto: "Google Calendar: estado no disponible",
      detalle: null,
      titulo:
        "Este ambiente todavía no reporta el estado de la sincronización con Google Calendar. Vuelve a revisar después del siguiente despliegue del API; el botón «Re-sincronizar Google» sigue funcionando.",
    };
  }

  // `cola` ausente = API que no sabe de colas (se pinta como antes);
  // `cola: null` = el API sí sabe, pero la migración no está aplicada.
  const cola = estado.cola ?? null;
  const reportaCola = estado.cola !== undefined || typeof estado.automatica === "boolean";
  const automatica = syncEsAutomatica(estado);

  if (!estado.enabled) {
    // El API (0.0.10+) dice POR QUÉ (variable de encendido, variable
    // faltante o JSON mal pegado) para no tener que entrar a los logs.
    const motivo = estado.motivo?.trim() || null;
    const pendientes = Math.max(0, Math.trunc(cola?.pendientes ?? 0));
    return {
      tono: "apagado",
      texto: motivo
        ? `Google Calendar: apagado — ${motivo}`
        : "Google Calendar: apagado — faltan las variables en Railway",
      detalle:
        "Mientras esté apagado, el sistema no manda nada al calendario de Google (el calendario del panel funciona igual)." +
        // La cola NO se drena ni se descarta con la sync apagada: los cambios
        // esperan. Decirlo evita el miedo de «perdimos lo de hoy».
        (pendientes > 0
          ? ` ${plural(pendientes, "cambio", "cambios")} ${pendientes === 1 ? "quedó" : "quedaron"} en espera y ${pendientes === 1 ? "se publicará" : "se publicarán"} en cuanto se encienda.`
          : ""),
      titulo: `Para encenderla hay que agregar ${VARS_GOOGLE_SYNC} en Railway. En cuanto estén, el sistema publica ${QUE_SE_PUBLICA} y este chip se pone en verde.`,
    };
  }

  const calendario = estado.calendar_id?.trim() || "calendario configurado";

  // Caso normal a partir de hoy: automática con conteos de la cola. (Si el API
  // dijera `automatica:true` sin mandar `cola`, se cae al chip de siempre en
  // lugar de inventar conteos.)
  if (automatica && cola) return chipAutomatica(estado, cola, ahora, calendario);

  const corridas = corridasTexto(estado);
  const ultimoResultado = ultimoResultadoTexto(estado);

  if (automatica) {
    // `automatica` es el flag AUTORITATIVO del API y puede venir SIN `cola`
    // (los conteos no se pudieron leer en ese instante). Se afirma lo que sí
    // se sabe —el espejo es automático— y NO se inventan números.
    return {
      tono: "activo",
      texto: "Google Calendar: activo · automática",
      detalle:
        "Los cambios en espera no se pudieron leer en este momento; la publicación automática sigue corriendo." +
        (corridas.length ? ` ${corridas.join(" · ")} · hora de Cancún.` : ""),
      titulo: `Cada cambio que se captura (en el panel o en la app, incluidos los que la app sube al reconectar) se publica solo en ${calendario}: ${QUE_SE_PUBLICA}. Si Google falla, el sistema reintenta hasta lograrlo — no hace falta pulsar «Re-sincronizar Google».${ultimoResultado}`,
    };
  }

  if (reportaCola && !automatica) {
    // Encendida pero SIN cola: los cambios se publican al momento (hooks) y un
    // fallo de Google se corrige hasta la revisión de la madrugada. No es un
    // error, es una migración pendiente — ámbar para que no se quede así.
    return {
      tono: "atencion",
      texto: "Google Calendar: activo · sin cola (migración pendiente)",
      detalle:
        "Los cambios se publican al momento, pero si Google falla se corrigen hasta la revisión automática de la madrugada." +
        (corridas.length ? ` ${corridas.join(" · ")} · hora de Cancún.` : ""),
      titulo: `Falta aplicar la migración 20260912000002_calendar_sync_cola.sql en Supabase. En cuanto se aplique, el API la detecta solo (revisa cada 10 minutos) y la sincronización pasa a ser automática y con reintentos, sin volver a desplegar. Mientras tanto el sistema publica ${QUE_SE_PUBLICA} en ${calendario}.${ultimoResultado}`,
    };
  }

  const detalle = corridas.length
    ? `${corridas.join(" · ")} · hora de Cancún`
    : "Aún no ha corrido ninguna sincronización desde el último reinicio del servidor.";

  return {
    tono: "activo",
    texto: `Google Calendar: activo · ${calendario}`,
    detalle,
    titulo: `El sistema publica ${QUE_SE_PUBLICA} en ${calendario}. Los eventos que la oficina capturó a mano en Google no se tocan.${ultimoResultado}`,
  };
}

export interface ToastResyncGoogle {
  tono: "success" | "warning" | "error";
  /** Título del toast. */
  texto: string;
  /** Descripción (conteos, nota del API, qué hacer si falló). */
  detalle: string;
}

/**
 * La llamada a `resync` no llegó a responder OK. `status` es el HTTP del API
 * (si hubo): 401/403 = no es ADMIN, 404 = el API viejo no tiene la ruta.
 */
export function toastResyncFallo(status?: number): ToastResyncGoogle {
  // API 0.0.10: 409 = ya hay un barrido en curso (otro resync o el reconcile
  // nocturno). No es un error: se espera y se vuelve a intentar.
  if (status === 409) {
    return {
      tono: "warning",
      texto: "Ya hay una sincronización con Google en curso",
      detalle:
        "El sistema está publicando el calendario en este momento (otro «Re-sincronizar» o la revisión nocturna). Espera unos minutos y vuelve a intentarlo; nada se pierde.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      tono: "error",
      texto: "No tienes permiso para re-sincronizar",
      detalle:
        "La re-sincronización con Google Calendar es de administrador. Pídele a un ADMIN que pulse «Re-sincronizar Google».",
    };
  }
  if (status === 404) {
    return {
      tono: "error",
      texto: "Este ambiente todavía no tiene la re-sincronización",
      detalle:
        "La ruta llega con el siguiente despliegue del API. El calendario del panel funciona igual.",
    };
  }
  return {
    tono: "error",
    texto: "No se pudo re-sincronizar con Google Calendar",
    detalle:
      "Vuelve a intentarlo en un momento. Si sigue fallando, avisa a soporte: el calendario del panel no se afecta.",
  };
}

/** Toast al terminar POST /v1/calendar/resync. `null` = la llamada falló. */
export function toastResyncGoogle(
  res: CalendarResyncResultado | null | undefined,
): ToastResyncGoogle {
  if (!res) return toastResyncFallo();

  const nota = typeof res.nota === "string" && res.nota.trim() ? res.nota.trim() : null;

  if (!res.enabled) {
    return {
      tono: "warning",
      texto: "La sincronización con Google Calendar está apagada",
      detalle: `No se mandó nada al calendario: faltan ${VARS_GOOGLE_SYNC} en Railway. En cuanto estén, vuelve a pulsar «Re-sincronizar Google».`,
    };
  }

  const partes: string[] = [];
  let tono: ToastResyncGoogle["tono"] = "success";

  if (tieneDesglose(res)) {
    const lista = conteos(res);
    partes.push(
      lista.length
        ? `Enviado a Google: ${lista.join(" · ")}.`
        : "No había nada que sincronizar en la ventana: ni vuelos, ni descansos, ni eventos, ni mantenimientos con fecha.",
    );
  } else if (typeof res.total === "number") {
    partes.push(
      `Enviado a Google: ${plural(res.total, "vuelo", "vuelos")}. Este ambiente del API todavía solo sincroniza vuelos: descansos, eventos y mantenimientos llegan con el siguiente despliegue.`,
    );
  } else {
    partes.push("El API no devolvió conteos de lo sincronizado.");
  }

  if (res.errores) {
    tono = "warning";
    partes.push(
      `${plural(res.errores, "evento quedó", "eventos quedaron")} sin publicar; la revisión automática de la madrugada lo reintenta.`,
    );
  }

  // La VENTANA importa: si no se dice, la oficina cree que subió TODO el
  // historial y luego reporta como bug que no ve un vuelo de hace un año.
  if (res.desde && res.hasta)
    partes.push(`Ventana: ${fmtDateOnly(res.desde)} a ${fmtDateOnly(res.hasta)}.`);
  if (res.calendar_id?.trim()) partes.push(`Calendario: ${res.calendar_id.trim()}.`);
  if (nota) partes.push(nota);

  return {
    tono,
    texto:
      tono === "warning"
        ? "Google Calendar actualizado con avisos"
        : "Google Calendar actualizado",
    detalle: partes.join(" "),
  };
}
