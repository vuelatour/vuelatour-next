/**
 * ESTADO VISIBLE de la sincronización sistema → Google Calendar (pedido del
 * cliente 12-sep-2026: «queremos que se sincronicen los vuelos, eventos,
 * mantenimientos, etc. que tenemos en el calendario del sistema de VuelaTour
 * al Google Calendar de aerochartercancunflightplanner@gmail.com»).
 *
 * FUENTE ÚNICA de los textos en es-MX que ve la oficina junto al botón
 * «Re-sincronizar Google» del calendario:
 * - `chipSyncGoogle` ← GET /v1/calendar/sync-estado (chip de estado).
 * - `toastResyncGoogle` ← POST /v1/calendar/resync (toast del backfill).
 *
 * Helpers PUROS (sin fetch, sin `Date.now()`, sin React) para poder probarlos
 * con vitest: reciben la respuesta del API y devuelven qué decir y en qué tono.
 *
 * Tolerancia a un API viejo (el panel se despliega antes que el API):
 * - `sync-estado` 404 / 403 ⇒ `estado = null` ⇒ «estado no disponible». JAMÁS
 *   se pinta «apagado» sin que el API lo afirme (sería mentir a la oficina).
 * - `resync` viejo devuelve `{enabled, total}` (solo vuelos redondos) ⇒ el
 *   toast lo dice tal cual y avisa que los demás tipos llegan con el
 *   siguiente despliegue; no se inventan conteos por tipo.
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
  CalendarSyncEstado,
} from "@/types/calendar";

/** Las 3 variables que enciende la sync en Railway (las pone el usuario). */
export const VARS_GOOGLE_SYNC =
  "GOOGLE_CALENDAR_SYNC_ENABLED, GOOGLE_CALENDAR_ID y GOOGLE_SERVICE_ACCOUNT_JSON";

/** Qué publica el sistema (mismo listado que el calendario del panel). */
const QUE_SE_PUBLICA =
  "vuelos, descansos de piloto, eventos de flota y mantenimientos con fecha";

export type TonoSyncGoogle = "activo" | "apagado" | "desconocido";

export interface ChipSyncGoogle {
  /** Verde = encendida, ámbar = apagada, gris = el API no lo reporta. */
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

/** Chip de estado junto al botón «Re-sincronizar Google». */
export function chipSyncGoogle(
  estado: CalendarSyncEstado | null | undefined,
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

  if (!estado.enabled) {
    // El API (0.0.10+) dice POR QUÉ (variable de encendido, variable
    // faltante o JSON mal pegado) para no tener que entrar a los logs.
    const motivo = estado.motivo?.trim() || null;
    return {
      tono: "apagado",
      texto: motivo
        ? `Google Calendar: apagado — ${motivo}`
        : "Google Calendar: apagado — faltan las variables en Railway",
      detalle:
        "Mientras esté apagado, el sistema no manda nada al calendario de Google (el calendario del panel funciona igual).",
      titulo: `Para encenderla hay que agregar ${VARS_GOOGLE_SYNC} en Railway. En cuanto estén, el sistema publica ${QUE_SE_PUBLICA} y este chip se pone en verde.`,
    };
  }

  const calendario = estado.calendar_id?.trim() || "calendario configurado";
  const corridas: string[] = [];
  if (estado.ultimo_reconcile_at)
    corridas.push(`última revisión automática ${fmtDateTime(estado.ultimo_reconcile_at)}`);
  if (estado.ultimo_resync_at)
    corridas.push(`última re-sincronización manual ${fmtDateTime(estado.ultimo_resync_at)}`);

  const detalle = corridas.length
    ? `${corridas.join(" · ")} · hora de Cancún`
    : "Aún no ha corrido ninguna sincronización desde el último reinicio del servidor.";

  const resumen = estado.ultimo_resumen ? conteos(estado.ultimo_resumen) : [];
  const errores = estado.ultimo_resumen?.errores ?? 0;
  const ultimoResultado = resumen.length
    ? ` Último resultado: ${resumen.join(" · ")}${errores ? ` · ${errores} con error` : ""}.`
    : "";

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
