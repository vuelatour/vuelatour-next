import { describe, expect, it } from "vitest";
import {
  VARS_GOOGLE_SYNC,
  chipSyncGoogle,
  syncEsAutomatica,
  tituloBotonResync,
  toastResyncFallo,
  toastResyncGoogle,
} from "@/lib/admin/calendar-sync";
import type { CalendarSyncCola, CalendarSyncEstado } from "@/types/calendar";

/**
 * C5 del pedido del 12-sep-2026: la oficina tiene que ENTERARSE de si el
 * calendario del sistema está llegando al Google Calendar de operaciones.
 *
 * Lo que se prueba: los textos exactos del chip y del toast, que «no
 * disponible» (API viejo) NUNCA se confunda con «apagado», que las fechas se
 * pinten en hora de Cancún y no en UTC, y que el desglose por tipo del API
 * nuevo y el `{enabled,total}` del viejo se cuenten sin inventar nada.
 */

const CALENDARIO = "aerochartercancunflightplanner@gmail.com";

const base: CalendarSyncEstado = {
  enabled: true,
  calendar_id: CALENDARIO,
  ultimo_reconcile_at: null,
  ultimo_resync_at: null,
  ultimo_resumen: null,
};

describe("chipSyncGoogle", () => {
  it("apagado CON motivo del API: el chip dice el motivo (sin entrar a los logs)", () => {
    const chip = chipSyncGoogle({
      enabled: false,
      calendar_id: null,
      ultimo_reconcile_at: null,
      ultimo_resync_at: null,
      ultimo_resumen: null,
      motivo: "No se pudo leer la credencial: GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido (…)",
    });
    expect(chip.tono).toBe("apagado");
    expect(chip.texto).toContain("No se pudo leer la credencial");
    expect(chip.texto).not.toContain("faltan las variables");
  });

  it("sin estado (API viejo: 404) dice «no disponible», nunca «apagado»", () => {
    const chip = chipSyncGoogle(null);
    expect(chip.tono).toBe("desconocido");
    expect(chip.texto).toBe("Google Calendar: estado no disponible");
    expect(chip.texto).not.toMatch(/apagado|activo/i);
    expect(chip.detalle).toBeNull();
    expect(chip.titulo).toMatch(/despliegue del API/i);
  });

  it("apagado: ámbar, texto del contrato y las 3 variables de Railway", () => {
    const chip = chipSyncGoogle({ ...base, enabled: false, calendar_id: null });
    expect(chip.tono).toBe("apagado");
    expect(chip.texto).toBe(
      "Google Calendar: apagado — faltan las variables en Railway",
    );
    expect(chip.titulo).toContain(VARS_GOOGLE_SYNC);
    expect(chip.titulo).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
  });

  it("activo: nombra el calendario destino", () => {
    const chip = chipSyncGoogle(base);
    expect(chip.tono).toBe("activo");
    expect(chip.texto).toBe(`Google Calendar: activo · ${CALENDARIO}`);
    // Lo que el sistema publica y el candado de C7 (manuales intactos).
    expect(chip.titulo).toMatch(/mantenimientos con fecha/);
    expect(chip.titulo).toMatch(/a mano en Google no se tocan/);
  });

  it("activo sin corridas: lo dice en lugar de fingir una fecha", () => {
    expect(chipSyncGoogle(base).detalle).toBe(
      "Aún no ha corrido ninguna sincronización desde el último reinicio del servidor.",
    );
  });

  it("las fechas van en hora de Cancún (UTC−5), no en UTC", () => {
    const chip = chipSyncGoogle({
      ...base,
      // 14:15 UTC = 09:15 en Cancún.
      ultimo_reconcile_at: "2026-09-12T14:15:00Z",
      ultimo_resync_at: "2026-09-12T21:40:00Z", // 16:40 Cancún
    });
    // `fmtDateTime` es-MX ⇒ "12 sep 2026, 9:15 a.m." (hora de pared Cancún).
    expect(chip.detalle).toContain("9:15");
    expect(chip.detalle).toContain("4:40");
    // Ni la hora UTC (14:15 / 21:40) ni su versión de 12 h (2:15 / 9:40).
    expect(chip.detalle).not.toContain("14:15");
    expect(chip.detalle).not.toContain("21:40");
    expect(chip.detalle).not.toContain("2:15");
    expect(chip.detalle).not.toContain("9:40");
    expect(chip.detalle).toContain("hora de Cancún");
    expect(chip.detalle).toMatch(/última revisión automática/);
    expect(chip.detalle).toMatch(/última re-sincronización manual/);
  });

  it("solo una de las dos corridas: no inventa la otra", () => {
    const chip = chipSyncGoogle({ ...base, ultimo_resync_at: "2026-09-12T21:40:00Z" });
    expect(chip.detalle).toMatch(/última re-sincronización manual/);
    expect(chip.detalle).not.toMatch(/revisión automática/);
  });

  it("el último resumen se resume en el tooltip (sin ceros)", () => {
    const chip = chipSyncGoogle({
      ...base,
      ultimo_resumen: { vuelos: 42, descansos: 0, eventos: 2, mantenimientos: 1, errores: 1 },
    });
    expect(chip.titulo).toContain("Último resultado: 42 vuelos · 2 eventos · 1 mantenimiento");
    expect(chip.titulo).toContain("1 con error");
    expect(chip.titulo).not.toContain("0 descansos");
  });
});

describe("toastResyncGoogle", () => {
  it("apagada: avisa que NO se mandó nada y qué falta", () => {
    const t = toastResyncGoogle({ enabled: false });
    expect(t.tono).toBe("warning");
    expect(t.texto).toBe("La sincronización con Google Calendar está apagada");
    expect(t.detalle).toContain("No se mandó nada");
    expect(t.detalle).toContain(VARS_GOOGLE_SYNC);
  });

  it("API nuevo: conteos por tipo, singular/plural y la nota de C7", () => {
    const t = toastResyncGoogle({
      enabled: true,
      calendar_id: CALENDARIO,
      vuelos: 42,
      descansos: 3,
      eventos: 2,
      mantenimientos: 1,
      errores: 0,
      nota: "Los eventos capturados a mano en Google no se modifican.",
    });
    expect(t.tono).toBe("success");
    expect(t.texto).toBe("Google Calendar actualizado");
    expect(t.detalle).toContain("Enviado a Google: 42 vuelos · 3 descansos · 2 eventos · 1 mantenimiento.");
    expect(t.detalle).toContain(`Calendario: ${CALENDARIO}.`);
    expect(t.detalle).toContain("Los eventos capturados a mano en Google no se modifican.");
  });

  it("dice la VENTANA que se publicó, en días Cancún y sin corrimiento", () => {
    const t = toastResyncGoogle({
      enabled: true,
      vuelos: 128,
      desde: "2026-08-13",
      hasta: "2027-09-12",
    });
    // El día NO se corre a 12 ago / 11 sep por zona horaria.
    expect(t.detalle).toContain("Ventana: 13 ago 2026 a 12 sep 2027.");
    expect(t.detalle).not.toContain("12 ago 2026");
  });

  it("sin ventana en la respuesta (API viejo) no inventa una", () => {
    const t = toastResyncGoogle({ enabled: true, total: 7 });
    expect(t.detalle).not.toContain("Ventana:");
  });

  it("los tipos en 0 no se pintan", () => {
    const t = toastResyncGoogle({ enabled: true, vuelos: 5, descansos: 0, eventos: 0, mantenimientos: 0 });
    expect(t.detalle).toContain("Enviado a Google: 5 vuelos.");
    expect(t.detalle).not.toContain("0 descansos");
  });

  it("todo en 0: dice que no había nada, no «0 vuelos»", () => {
    const t = toastResyncGoogle({
      enabled: true,
      vuelos: 0,
      descansos: 0,
      eventos: 0,
      mantenimientos: 0,
    });
    expect(t.tono).toBe("success");
    expect(t.detalle).toContain("No había nada que sincronizar en la ventana");
    expect(t.detalle).not.toContain("0 vuelos");
  });

  it("con errores: tono de aviso y cuántos quedaron fuera", () => {
    const uno = toastResyncGoogle({ enabled: true, vuelos: 10, errores: 1 });
    expect(uno.tono).toBe("warning");
    expect(uno.texto).toBe("Google Calendar actualizado con avisos");
    expect(uno.detalle).toContain("1 evento quedó sin publicar");
    const varios = toastResyncGoogle({ enabled: true, vuelos: 10, errores: 3 });
    expect(varios.detalle).toContain("3 eventos quedaron sin publicar");
  });

  it("API viejo {enabled,total}: cuenta vuelos y avisa que falta el resto", () => {
    const t = toastResyncGoogle({ enabled: true, total: 7 });
    expect(t.tono).toBe("success");
    expect(t.detalle).toContain("Enviado a Google: 7 vuelos.");
    expect(t.detalle).toMatch(/todavía solo sincroniza vuelos/);
    expect(toastResyncGoogle({ enabled: true, total: 1 }).detalle).toContain("1 vuelo.");
  });

  it("respuesta sin conteos: lo admite en vez de inventar un número", () => {
    const t = toastResyncGoogle({ enabled: true });
    expect(t.detalle).toBe("El API no devolvió conteos de lo sincronizado.");
  });

  it("sin respuesta = el mismo texto de falla genérica", () => {
    expect(toastResyncGoogle(null)).toEqual(toastResyncFallo());
    expect(toastResyncGoogle(null).tono).toBe("error");
  });
});

describe("toastResyncFallo", () => {
  it("403 explica que es acción de administrador", () => {
    for (const s of [401, 403]) {
      const t = toastResyncFallo(s);
      expect(t.tono).toBe("error");
      expect(t.texto).toBe("No tienes permiso para re-sincronizar");
      expect(t.detalle).toMatch(/administrador/i);
    }
  });

  it("404 = el API de este ambiente todavía no tiene la ruta", () => {
    const t = toastResyncFallo(404);
    expect(t.texto).toMatch(/todavía no tiene la re-sincronización/);
    expect(t.detalle).toMatch(/siguiente despliegue del API/);
  });

  it("falla de red: dice que el calendario del panel sigue igual", () => {
    const t = toastResyncFallo();
    expect(t.texto).toBe("No se pudo re-sincronizar con Google Calendar");
    expect(t.detalle).toMatch(/calendario del panel no se afecta/);
  });
});

/**
 * Segunda parte del pedido del 12-sep-2026: «el calendario debe sincronizarse
 * de forma AUTOMÁTICA cada que se realizan cambios, sin sincronización
 * manual». El API ahora encola cada cambio en la BD (triggers) y un worker la
 * drena con reintentos; el chip tiene que decir tres cosas distintas SIN
 * confundirlas:
 *  - automática y al día (verde),
 *  - automática pero con cambios ATORADOS (ámbar, con el error y desde cuándo),
 *  - encendida pero SIN cola porque falta la migración (ámbar, no verde: un
 *    fallo de Google se corregiría hasta la madrugada).
 * Y un API viejo (sin `cola` ni `automatica`) debe seguir pintándose como antes.
 */
describe("chipSyncGoogle · cola automática", () => {
  // 15:00 UTC = 10:00 en Cancún.
  const AHORA = new Date("2026-09-12T15:00:00Z").getTime();

  const cola: CalendarSyncCola = {
    activa: true,
    pendientes: 0,
    con_error: 0,
    mas_antiguo_at: null,
    ultimo_drenado_at: null,
    pausada_hasta: null,
  };

  const conCola = (parcial: Partial<CalendarSyncCola> = {}): CalendarSyncEstado => ({
    ...base,
    cola: { ...cola, ...parcial },
    automatica: true,
  });

  it("automática y al día: verde, «activo · automática» y sin nada en espera", () => {
    const chip = chipSyncGoogle(conCola(), AHORA);
    expect(chip.tono).toBe("activo");
    expect(chip.texto).toBe("Google Calendar: activo · automática");
    expect(chip.detalle).toBe("Sin cambios en espera");
    // Lo que el cliente pidió entender: ya no hay que pulsar nada.
    expect(chip.titulo).toMatch(/se publica solo/);
    expect(chip.titulo).toMatch(/app sube al reconectar/);
    expect(chip.titulo).toMatch(/no hace falta pulsar «Re-sincronizar Google»/i);
    expect(chip.titulo).toMatch(/a mano en Google no se tocan/);
  });

  it("última subida en hora de Cancún, nunca en UTC", () => {
    const chip = chipSyncGoogle(conCola({ ultimo_drenado_at: "2026-09-12T14:55:00Z" }), AHORA);
    expect(chip.tono).toBe("activo");
    expect(chip.detalle).toContain("última subida");
    expect(chip.detalle).toContain("9:55");
    expect(chip.detalle).toContain("hora de Cancún");
    expect(chip.detalle).not.toContain("14:55");
  });

  it("cambios recién encolados NO alarman (el worker corre cada 20 s)", () => {
    const chip = chipSyncGoogle(
      conCola({ pendientes: 2, mas_antiguo_at: "2026-09-12T14:58:00Z" }),
      AHORA,
    );
    expect(chip.tono).toBe("activo");
    expect(chip.texto).toBe("Google Calendar: activo · automática");
    expect(chip.detalle).toContain("2 cambios en espera");
    expect(chip.detalle).toContain("el más antiguo lleva 2 min");
  });

  it("más de 15 min en espera: ámbar y el conteo en el propio chip", () => {
    const chip = chipSyncGoogle(
      conCola({ pendientes: 1, mas_antiguo_at: "2026-09-12T14:20:00Z" }),
      AHORA,
    );
    expect(chip.tono).toBe("atencion");
    expect(chip.texto).toBe("Google Calendar: automática · 1 cambio en espera");
    expect(chip.detalle).toContain("el más antiguo lleva 40 min");
    expect(chip.detalle).toContain("9:20"); // hora de Cancún, no 14:20
    expect(chip.detalle).not.toContain("14:20");
    // Lo importante para la oficina: no se perdió nada y qué hacer.
    expect(chip.titulo).toMatch(/Nada se pierde/);
    expect(chip.titulo).toMatch(/avisa a soporte/);
  });

  it("esperas largas se dicen en horas y minutos", () => {
    const chip = chipSyncGoogle(
      conCola({ pendientes: 3, mas_antiguo_at: "2026-09-12T13:25:00Z" }),
      AHORA,
    );
    expect(chip.texto).toBe("Google Calendar: automática · 3 cambios en espera");
    expect(chip.detalle).toContain("lleva 1 h 35 min");
  });

  it("con_error: ámbar aunque sea reciente, y muestra el texto del error", () => {
    const chip = chipSyncGoogle(
      conCola({
        pendientes: 2,
        con_error: 2,
        mas_antiguo_at: "2026-09-12T14:59:00Z",
        ultimo_error: "Google respondió 403: quota exceeded",
      }),
      AHORA,
    );
    expect(chip.tono).toBe("atencion");
    expect(chip.texto).toBe("Google Calendar: automática · 2 cambios en espera");
    expect(chip.detalle).toContain("2 con error: Google respondió 403: quota exceeded");
  });

  it("un error larguísimo se recorta (el chip no es un log)", () => {
    const chip = chipSyncGoogle(
      conCola({ pendientes: 1, con_error: 1, ultimo_error: "x".repeat(400) }),
      AHORA,
    );
    expect(chip.detalle).toContain("1 con error: ");
    expect(chip.detalle!.length).toBeLessThan(220);
    expect(chip.detalle).toContain("…");
  });

  it("con_error sin texto: no inventa ninguno", () => {
    const chip = chipSyncGoogle(conCola({ pendientes: 1, con_error: 1 }), AHORA);
    expect(chip.detalle).toContain("1 con error");
    expect(chip.detalle).not.toContain("con error:");
  });

  it("pausa por cuota de Google: se dice mientras esté vigente", () => {
    const pausada = chipSyncGoogle(
      conCola({ pendientes: 4, pausada_hasta: "2026-09-12T15:04:00Z" }),
      AHORA,
    );
    expect(pausada.detalle).toContain("Google pidió esperar hasta");
    expect(pausada.detalle).toContain("10:04");
    expect(pausada.detalle).toContain("se reanuda solo");
    // Una pausa YA VENCIDA no se pinta (asustaría por nada).
    const vencida = chipSyncGoogle(
      conCola({ pendientes: 4, pausada_hasta: "2026-09-12T14:50:00Z" }),
      AHORA,
    );
    expect(vencida.detalle).not.toContain("Google pidió esperar");
  });

  it("cola null (migración pendiente): ámbar, NO verde, y dice qué falta", () => {
    const chip = chipSyncGoogle({ ...base, cola: null, automatica: false }, AHORA);
    expect(chip.tono).toBe("atencion");
    expect(chip.texto).toBe("Google Calendar: activo · sin cola (migración pendiente)");
    expect(chip.detalle).toContain("si Google falla se corrigen hasta la revisión automática");
    expect(chip.titulo).toContain("20260912000002_calendar_sync_cola.sql");
    expect(chip.titulo).toMatch(/sin volver a desplegar/);
  });

  it("automatica true SIN conteos: verde «automática» y sin inventar números", () => {
    // El API manda `automatica` como flag autoritativo; `cola` puede venir
    // null si los conteos fallaron en ese instante (revisión adversaria
    // 12-sep-2026). Antes se caía al chip genérico y perdía el «automática».
    const chip = chipSyncGoogle({ ...base, cola: null, automatica: true }, AHORA);
    expect(chip.tono).toBe("activo");
    expect(chip.texto).toBe("Google Calendar: activo · automática");
    expect(chip.detalle).toContain("no se pudieron leer");
    expect(chip.detalle).not.toMatch(/\d+ cambios en espera/);
    expect(chip.texto).not.toContain("migración pendiente");
  });

  it("cola presente pero inactiva = igual que sin cola", () => {
    const chip = chipSyncGoogle(
      { ...base, cola: { ...cola, activa: false }, automatica: false },
      AHORA,
    );
    expect(chip.tono).toBe("atencion");
    expect(chip.texto).toContain("sin cola (migración pendiente)");
  });

  it("API viejo (sin `cola` ni `automatica`): se pinta como antes, sin mentir", () => {
    const chip = chipSyncGoogle(base, AHORA);
    expect(chip.tono).toBe("activo");
    expect(chip.texto).toBe(`Google Calendar: activo · ${CALENDARIO}`);
    expect(chip.texto).not.toContain("automática");
    expect(chip.texto).not.toContain("sin cola");
  });

  it("apagada con cambios encolados: avisa que esperan, no que se perdieron", () => {
    const chip = chipSyncGoogle(
      { ...base, enabled: false, automatica: false, cola: { ...cola, activa: true, pendientes: 5 } },
      AHORA,
    );
    expect(chip.tono).toBe("apagado");
    expect(chip.detalle).toContain("5 cambios quedaron en espera");
    expect(chip.detalle).toContain("se publicarán en cuanto se encienda");
  });

  it("apagada sin cola: el detalle no habla de la cola", () => {
    const chip = chipSyncGoogle({ ...base, enabled: false }, AHORA);
    expect(chip.detalle).not.toContain("en espera");
  });

  it("sin estado sigue siendo «no disponible» aunque haya cola en otros casos", () => {
    expect(chipSyncGoogle(null, AHORA).tono).toBe("desconocido");
  });
});

describe("syncEsAutomatica", () => {
  const cola: CalendarSyncCola = {
    activa: true,
    pendientes: 0,
    con_error: 0,
    mas_antiguo_at: null,
    ultimo_drenado_at: null,
    pausada_hasta: null,
  };

  it("true solo con la sync encendida Y la cola activa", () => {
    expect(syncEsAutomatica({ ...base, cola, automatica: true })).toBe(true);
    // Sin el campo `automatica` se deriva de la cola.
    expect(syncEsAutomatica({ ...base, cola })).toBe(true);
  });

  it("false si está apagada, sin cola, con cola inactiva o sin estado", () => {
    expect(syncEsAutomatica({ ...base, enabled: false, cola, automatica: true })).toBe(false);
    expect(syncEsAutomatica({ ...base, cola: null })).toBe(false);
    expect(syncEsAutomatica({ ...base, cola: { ...cola, activa: false } })).toBe(false);
    expect(syncEsAutomatica(base)).toBe(false); // API viejo
    expect(syncEsAutomatica(null)).toBe(false);
  });
});

describe("tituloBotonResync", () => {
  it("con sync automática aclara que el botón ya no es el camino normal", () => {
    expect(tituloBotonResync(true)).toMatch(/No hace falta para el día a día/);
    expect(tituloBotonResync(true)).toMatch(/arranque/);
  });

  it("sin sync automática explica la ventana y que no duplica", () => {
    expect(tituloBotonResync(false)).toMatch(/ventana completa/);
    expect(tituloBotonResync(false)).toMatch(/No duplica nada/);
    expect(tituloBotonResync(false)).not.toMatch(/No hace falta/);
  });
});
