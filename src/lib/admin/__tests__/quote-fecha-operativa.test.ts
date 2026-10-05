/**
 * Cotización con FECHA NUEVA ⇒ ¿mover también el vuelo operativo? (5-oct-2026)
 *
 * Fuente única `lib/admin/quote-fecha-operativa.ts`: cuándo se pregunta (solo
 * si el DÍA Cancún de la fecha de la cotización cambió, el vuelo no voló, no
 * está cancelado y la operación sigue en otro día), las dos fechas del modal,
 * los textos, el toast tras mover y los errores en es-MX.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_AHORA_NO,
  BOTON_BANDA_MOVER,
  BOTON_MOVER,
  BOTON_MOVIENDO,
  BOTON_SOLO_COTIZACION,
  CODE_TRAMOS_NO_MOVIDOS,
  decidirBandaFechaOperativa,
  decidirPreguntaReagendar,
  errorPuedeHaberMovido,
  moverVueloOperativo,
  NOTA_BANDA_SIN_PERMISO,
  NOTA_SOLO_FECHA_VUELO,
  puedeMoverVueloOperativo,
  textoBandaFechaOperativa,
  textoMoverDesdeVuelo,
  textosDialogoReagendar,
  TITULO_MOVER_DESDE_VUELO,
  toastAlCerrarSinMover,
  TOAST_REVISA_TRAMOS,
  diaCancunDe,
  fechaLargaCancun,
  fechaOperativaDe,
  mensajeErrorReagendar,
  MSG_REAGENDAR_API_VIEJO,
  MSG_REAGENDAR_CANCELADO,
  MSG_REAGENDAR_GENERICO,
  MSG_REAGENDAR_SESION,
  MSG_REAGENDAR_SIN_PERMISO,
  MSG_REAGENDAR_YA_VOLO,
  NOTA_SOLO_FECHA,
  textoReagendar,
  TITULO_REAGENDAR,
  TOAST_NO_MOVIDO,
  TOAST_YA_ESTABA,
  toastReagendado,
  type AlineacionFechaTramos,
  type CotizacionConFechas,
  type TramoConFecha,
} from "../quote-fecha-operativa";
import { MSG_SERVIDOR_NO_RESPONDIO } from "../errores-tecnicos";

// Cancún = UTC−5 fijo. 15:00Z = 10:00 Cancún; 03:30Z del 8 = 22:30 del 7.
const OCT5_10H = "2026-10-05T15:00:00.000Z";
const OCT7_10H = "2026-10-07T15:00:00.000Z";
const OCT7_2230 = "2026-10-08T03:30:00.000Z";
const OCT8_08H = "2026-10-08T13:00:00.000Z";

const tramo = (t: TramoConFecha): TramoConFecha => ({
  orden: 1,
  fecha_salida_plan: null,
  cancelada_at: null,
  taco_salida: null,
  taco_llegada: null,
  ...t,
});

const cot = (c: CotizacionConFechas): CotizacionConFechas => ({
  estado: "CONFIRMADO",
  fecha_vuelo: OCT5_10H,
  escalas: [
    tramo({ orden: 1, fecha_salida_plan: OCT5_10H }),
    tramo({ orden: 2, fecha_salida_plan: "2026-10-05T20:00:00.000Z" }),
  ],
  ...c,
});

describe("diaCancunDe / fechaLargaCancun — el día es el de PARED en Cancún", () => {
  it("un instante de la noche UTC es el día anterior en Cancún", () => {
    expect(diaCancunDe(OCT7_2230)).toBe("2026-10-07");
    expect(diaCancunDe(OCT7_10H)).toBe("2026-10-07");
    expect(diaCancunDe("2026-10-08T04:59:00Z")).toBe("2026-10-07");
    expect(diaCancunDe("2026-10-08T05:00:00Z")).toBe("2026-10-08");
  });

  it("un día suelto ya es pared; vacío o ilegible ⇒ null", () => {
    expect(diaCancunDe("2026-10-07")).toBe("2026-10-07");
    expect(diaCancunDe(null)).toBeNull();
    expect(diaCancunDe("  ")).toBeNull();
    expect(diaCancunDe("mañana")).toBeNull();
  });

  it("«d de mes de aaaa» sin corrimiento de día", () => {
    expect(fechaLargaCancun(OCT7_2230)).toBe("7 de octubre de 2026");
    expect(fechaLargaCancun("2026-01-01")).toBe("1 de enero de 2026");
    expect(fechaLargaCancun("2026-09-30T12:00:00-05:00")).toBe("30 de septiembre de 2026");
    expect(fechaLargaCancun(null)).toBe("—");
    expect(fechaLargaCancun("no es fecha")).toBe("—");
  });
});

describe("fechaOperativaDe — primer tramo VIVO por orden con fecha", () => {
  it("ordena por `orden` (no por posición) y salta los cancelados", () => {
    const q = cot({
      escalas: [
        tramo({ orden: 3, fecha_salida_plan: "2026-10-06T15:00:00Z" }),
        tramo({ orden: 1, fecha_salida_plan: "2026-10-03T15:00:00Z", cancelada_at: "2026-10-01T00:00:00Z" }),
        tramo({ orden: 2, fecha_salida_plan: OCT5_10H }),
      ],
    });
    expect(fechaOperativaDe(q)).toBe(OCT5_10H);
  });

  it("un tramo sin fecha no es referencia: sigue con el siguiente", () => {
    const q = cot({
      escalas: [tramo({ orden: 1 }), tramo({ orden: 2, fecha_salida_plan: OCT8_08H })],
    });
    expect(fechaOperativaDe(q)).toBe(OCT8_08H);
  });

  it("sin escalas, sin fechas o todo cancelado ⇒ null", () => {
    expect(fechaOperativaDe(cot({ escalas: [] }))).toBeNull();
    expect(fechaOperativaDe(cot({ escalas: undefined }))).toBeNull();
    expect(fechaOperativaDe(cot({ escalas: [tramo({ orden: 1 })] }))).toBeNull();
    expect(
      fechaOperativaDe(
        cot({ escalas: [tramo({ orden: 1, fecha_salida_plan: OCT5_10H, cancelada_at: "x" })] }),
      ),
    ).toBeNull();
    expect(fechaOperativaDe(null)).toBeNull();
  });
});

describe("decidirPreguntaReagendar — cuándo sale el modal", () => {
  it("CAMBIO REAL: la cotización pasa al 7 y la operación sigue el 5 ⇒ pregunta", () => {
    const antes = cot({});
    const despues = cot({ fecha_vuelo: OCT7_10H });
    expect(decidirPreguntaReagendar({ antes, despues })).toEqual({
      preguntar: true,
      nuevaFecha: OCT7_10H,
      fechaOperativa: OCT5_10H,
    });
  });

  it("SIN CAMBIO de día (solo la hora, aunque cruce la medianoche UTC) ⇒ no pregunta", () => {
    const antes = cot({ fecha_vuelo: OCT7_10H });
    const despues = cot({ fecha_vuelo: OCT7_2230 });
    expect(decidirPreguntaReagendar({ antes, despues })).toMatchObject({
      preguntar: false,
      motivo: "sin_cambio",
    });
    // Misma fecha exacta: tampoco (se guardó otra cosa de la cotización).
    expect(decidirPreguntaReagendar({ antes: cot({}), despues: cot({}) })).toMatchObject({
      preguntar: false,
      motivo: "sin_cambio",
    });
  });

  it("quitar la fecha no es «fecha nueva» ⇒ no pregunta", () => {
    expect(
      decidirPreguntaReagendar({ antes: cot({}), despues: cot({ fecha_vuelo: null }) }),
    ).toMatchObject({ preguntar: false, motivo: "sin_cambio" });
  });

  it("primera fecha (antes no tenía) con tramos en otro día ⇒ pregunta", () => {
    const d = decidirPreguntaReagendar({
      antes: cot({ fecha_vuelo: null }),
      despues: cot({ fecha_vuelo: OCT7_10H }),
    });
    expect(d.preguntar).toBe(true);
  });

  it("MISMO DÍA: la operación ya está en el día nuevo ⇒ no pregunta", () => {
    const antes = cot({ fecha_vuelo: OCT5_10H });
    const despues = cot({
      fecha_vuelo: OCT7_10H,
      escalas: [tramo({ orden: 1, fecha_salida_plan: OCT7_2230 })],
    });
    expect(decidirPreguntaReagendar({ antes, despues })).toMatchObject({
      preguntar: false,
      motivo: "mismo_dia",
      fechaOperativa: OCT7_2230,
    });
  });

  it("YA VOLÓ (estado o tramo vivo con tacómetro) ⇒ no pregunta", () => {
    const despues = cot({ fecha_vuelo: OCT7_10H });
    for (const estado of ["EN_VUELO", "COMPLETADO"]) {
      expect(
        decidirPreguntaReagendar({ antes: cot({ estado }), despues }),
      ).toMatchObject({ preguntar: false, motivo: "ya_volo" });
    }
    const conTaco = cot({
      escalas: [tramo({ orden: 1, fecha_salida_plan: OCT5_10H, taco_salida: "1234.5" })],
    });
    expect(decidirPreguntaReagendar({ antes: conTaco, despues })).toMatchObject({
      preguntar: false,
      motivo: "ya_volo",
    });
    // El tacómetro de un tramo CANCELADO no cuenta (espejo del API).
    const tacoCancelado = cot({
      escalas: [
        tramo({ orden: 1, fecha_salida_plan: OCT5_10H, taco_salida: "1", cancelada_at: "x" }),
        tramo({ orden: 2, fecha_salida_plan: OCT5_10H }),
      ],
    });
    expect(
      decidirPreguntaReagendar({ antes: tacoCancelado, despues: { ...despues, escalas: undefined } })
        .preguntar,
    ).toBe(true);
  });

  it("CANCELADO ⇒ no pregunta (el API respondería 409)", () => {
    expect(
      decidirPreguntaReagendar({
        antes: cot({ estado: "CANCELADO" }),
        despues: cot({ estado: "CANCELADO", fecha_vuelo: OCT7_10H }),
      }),
    ).toMatchObject({ preguntar: false, motivo: "cancelado" });
  });

  it("SIN TRAMOS con fecha ⇒ no pregunta (no hay operación que mover)", () => {
    expect(
      decidirPreguntaReagendar({
        antes: cot({ escalas: [] }),
        despues: cot({ fecha_vuelo: OCT7_10H, escalas: [tramo({ orden: 1 })] }),
      }),
    ).toMatchObject({ preguntar: false, motivo: "sin_tramos", fechaOperativa: null });
  });

  it("la fecha operativa sale de lo que devolvió el GUARDADO; sin escalas, de lo que se abrió", () => {
    // El guardado trae las escalas ya escritas (revise devuelve `escalas`).
    const antes = cot({});
    const despues = cot({
      fecha_vuelo: OCT7_10H,
      escalas: [tramo({ orden: 1, fecha_salida_plan: OCT8_08H })],
    });
    expect(decidirPreguntaReagendar({ antes, despues })).toEqual({
      preguntar: true,
      nuevaFecha: OCT7_10H,
      fechaOperativa: OCT8_08H,
    });
    // Respuesta sin `escalas` (API previo): se usan las de la cotización abierta.
    const sinEscalas = { ...despues, escalas: undefined };
    expect(decidirPreguntaReagendar({ antes, despues: sinEscalas })).toEqual({
      preguntar: true,
      nuevaFecha: OCT7_10H,
      fechaOperativa: OCT5_10H,
    });
  });
});

describe("textos del modal", () => {
  it("título, cuerpo con las DOS fechas, nota y botones (texto del contrato)", () => {
    expect(TITULO_REAGENDAR).toBe("Se actualizó la fecha de la cotización");
    expect(textoReagendar(OCT7_10H, OCT5_10H)).toBe(
      "La cotización ahora dice el 7 de octubre de 2026. El vuelo operativo (sus " +
        "tramos) sigue programado para el 5 de octubre de 2026. ¿Quieres mover " +
        "también el vuelo operativo a la fecha nueva?",
    );
    expect(NOTA_SOLO_FECHA).toBe(
      "Solo cambia la fecha: cada tramo conserva su hora. Las horas de los tramos " +
        "se editan desde el detalle del vuelo. Si no lo mueves ahora, puedes hacerlo " +
        "después desde el vuelo.",
    );
    expect(BOTON_MOVER).toBe("Sí, mover el vuelo operativo");
    expect(BOTON_SOLO_COTIZACION).toBe("No, solo la cotización");
    expect(TOAST_NO_MOVIDO).toBe(
      "La operación no cambió: puedes moverla después desde el detalle del vuelo",
    );
  });

  it("el cuerpo usa el día Cancún (22:30 del 7 no es «8 de octubre»)", () => {
    expect(textoReagendar(OCT7_2230, OCT5_10H)).toContain("ahora dice el 7 de octubre de 2026");
  });
});

describe("toastReagendado — lo que movió el API", () => {
  const res = (r: Partial<AlineacionFechaTramos>): AlineacionFechaTramos => ({
    vuelo_id: "v",
    folio: 364,
    delta_dias: 2,
    fecha_objetivo: OCT7_10H,
    tramos: [
      {
        id: "e1",
        orden: 1,
        origen_iata: "CUN",
        destino_iata: "CET",
        fecha_salida_plan_antes: OCT5_10H,
        fecha_salida_plan: OCT7_10H,
      },
      {
        id: "e2",
        orden: 2,
        origen_iata: "CET",
        destino_iata: "CUN",
        fecha_salida_plan_antes: "2026-10-05T20:00:00Z",
        fecha_salida_plan: "2026-10-07T20:00:00Z",
      },
    ],
    fecha_traslado_final: null,
    tramos_movidos: 2,
    ...r,
  });

  it("varios tramos el mismo día", () => {
    expect(toastReagendado(res({}))).toBe(
      "Vuelo operativo movido: 2 tramos ahora salen el 7 de octubre de 2026",
    );
  });

  it("un solo tramo, en singular", () => {
    expect(toastReagendado(res({ tramos_movidos: 1, tramos: res({}).tramos.slice(0, 1) }))).toBe(
      "Vuelo operativo movido: 1 tramo ahora sale el 7 de octubre de 2026",
    );
  });

  it("viaje de varios días: «a partir del» (no todos salen ese día)", () => {
    const multi = res({
      tramos_movidos: 2,
      tramos: [
        { ...res({}).tramos[0] },
        { ...res({}).tramos[1], fecha_salida_plan: "2026-10-09T20:00:00Z" },
      ],
    });
    expect(toastReagendado(multi)).toBe(
      "Vuelo operativo movido: 2 tramos ahora salen a partir del 7 de octubre de 2026",
    );
  });

  it("delta 0, nada movido o sin respuesta ⇒ «ya estaba en esa fecha»", () => {
    expect(TOAST_YA_ESTABA).toBe("El vuelo operativo ya estaba en esa fecha");
    expect(toastReagendado(res({ delta_dias: 0, tramos_movidos: 0 }))).toBe(TOAST_YA_ESTABA);
    expect(toastReagendado(res({ delta_dias: 0 }))).toBe(TOAST_YA_ESTABA);
    expect(toastReagendado(res({ tramos_movidos: 0 }))).toBe(TOAST_YA_ESTABA);
    expect(toastReagendado(undefined)).toBe(TOAST_YA_ESTABA);
  });

  it("sin fecha objetivo usa la del primer tramo movido", () => {
    expect(toastReagendado(res({ fecha_objetivo: null, delta_dias: null }))).toBe(
      "Vuelo operativo movido: 2 tramos ahora salen el 7 de octubre de 2026",
    );
  });
});

describe("mensajeErrorReagendar — errores del «Sí» en es-MX", () => {
  it("VUELO_YA_VOLO / VUELO_CANCELADO ⇒ el texto del API", () => {
    const yaVolo = "La operación ya empezó: la fecha de cada tramo se edita desde el vuelo.";
    expect(mensajeErrorReagendar({ status: 409, code: "VUELO_YA_VOLO", error: yaVolo })).toBe(yaVolo);
    expect(
      mensajeErrorReagendar({ status: 409, code: "VUELO_CANCELADO", error: "El vuelo #364 está cancelado." }),
    ).toBe("El vuelo #364 está cancelado.");
  });

  it("los respaldos son el texto EXACTO del API (alinear-fecha.util.ts)", () => {
    expect(MSG_REAGENDAR_YA_VOLO).toBe(
      "La operación ya empezó: la fecha de cada tramo se edita desde el vuelo.",
    );
    expect(MSG_REAGENDAR_CANCELADO).toBe("El vuelo está cancelado: no hay operación que mover.");
  });

  it("…y su respaldo si el texto llegara técnico o en inglés", () => {
    expect(mensajeErrorReagendar({ status: 409, code: "VUELO_YA_VOLO", error: "Conflict" })).toBe(
      MSG_REAGENDAR_YA_VOLO,
    );
    expect(mensajeErrorReagendar({ status: 409, code: "VUELO_CANCELADO", error: "" })).toBe(
      MSG_REAGENDAR_CANCELADO,
    );
  });

  it("404 «Cannot POST» (API previo, sin la ruta) ⇒ falta actualizar el servidor", () => {
    expect(
      mensajeErrorReagendar({
        status: 404,
        code: "NOT_FOUND",
        error: "Cannot POST /v1/flights/abc/tramos/alinear-fecha",
      }),
    ).toBe(MSG_REAGENDAR_API_VIEJO);
    expect(MSG_REAGENDAR_API_VIEJO).toBe(
      "Falta actualizar el servidor: mueve la fecha desde el detalle del vuelo",
    );
  });

  it("404 de negocio en español (el vuelo ya no existe) ⇒ tal cual", () => {
    expect(
      mensajeErrorReagendar({ status: 404, code: "VUELO_NO_EXISTE", error: "El vuelo no existe." }),
    ).toBe("El vuelo no existe.");
  });

  it("401 / 403 ⇒ sesión / permiso (nunca «Required role…»)", () => {
    expect(mensajeErrorReagendar({ status: 401, error: "Invalid or expired token" })).toBe(
      MSG_REAGENDAR_SESION,
    );
    expect(
      mensajeErrorReagendar({ status: 403, code: "FORBIDDEN", error: "Required role: ADMIN. Current: SOCIO" }),
    ).toBe(MSG_REAGENDAR_SIN_PERMISO);
  });

  it("técnico o de red ⇒ «El servidor no respondió…»", () => {
    expect(mensajeErrorReagendar({ code: "PARSE_ERROR", error: "Unexpected token <" })).toBe(
      MSG_SERVIDOR_NO_RESPONDIO,
    );
    expect(mensajeErrorReagendar({ error: "fetch failed" })).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    expect(mensajeErrorReagendar({ status: 502, error: "Bad Gateway" })).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    expect(mensajeErrorReagendar({})).toBe(MSG_SERVIDOR_NO_RESPONDIO);
  });

  it("validación en inglés ⇒ genérico; mensaje del API en español ⇒ tal cual", () => {
    expect(
      mensajeErrorReagendar({ status: 400, error: "property fecha_vuelo should not exist" }),
    ).toBe(MSG_REAGENDAR_GENERICO);
    expect(
      mensajeErrorReagendar({ status: 400, code: "SIN_FECHA", error: "El vuelo no tiene fecha." }),
    ).toBe("El vuelo no tiene fecha.");
  });
});

// ───────────────── Revisión 5-oct-2026: «Sí» que nunca lanza ─────────────────

const RES_OK: AlineacionFechaTramos = {
  vuelo_id: "v",
  folio: 364,
  delta_dias: 2,
  fecha_objetivo: OCT7_10H,
  tramos: [
    {
      id: "e1",
      orden: 1,
      origen_iata: "CUN",
      destino_iata: "CET",
      fecha_salida_plan_antes: OCT5_10H,
      fecha_salida_plan: OCT7_10H,
    },
  ],
  fecha_traslado_final: null,
  tramos_movidos: 1,
};

const MSG_503_PARCIAL =
  "No se pudo mover todo el vuelo operativo: algunos tramos quedaron con la fecha nueva y otros no. Revisa las fechas de los tramos en el detalle del vuelo.";

describe("moverVueloOperativo — el «Sí» con la action mockeada", () => {
  it("éxito ⇒ el toast de lo que movió el API (la action se llama UNA vez)", async () => {
    const action = vi.fn(async () => ({ ok: true, data: RES_OK }));
    await expect(moverVueloOperativo(action)).resolves.toEqual({
      ok: true,
      toast: "Vuelo operativo movido: 1 tramo ahora sale el 7 de octubre de 2026",
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("la action LANZA («Failed to find Server Action» tras un deploy) ⇒ no escapa: error técnico y refresca", async () => {
    const action = vi.fn(async () => {
      throw new Error(
        'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.',
      );
    });
    await expect(moverVueloOperativo(action)).resolves.toEqual({
      ok: false,
      error: MSG_SERVIDOR_NO_RESPONDIO,
      refrescar: true,
    });
  });

  it("rechazo sin Error (red caída, valor raro) ⇒ igual de seguro", async () => {
    const r = await moverVueloOperativo(() => Promise.reject("x"));
    expect(r).toEqual({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO, refrescar: true });
  });

  it("503 TRAMOS_NO_MOVIDOS ⇒ el texto del API y refresca (pudo mover algunos)", async () => {
    const r = await moverVueloOperativo(async () => ({
      ok: false,
      status: 503,
      code: CODE_TRAMOS_NO_MOVIDOS,
      error: MSG_503_PARCIAL,
    }));
    expect(r).toEqual({ ok: false, error: MSG_503_PARCIAL, refrescar: true });
  });

  it("respuesta perdida (fetch failed) ⇒ refresca: el API pudo escribir", async () => {
    const r = await moverVueloOperativo(async () => ({ ok: false, error: "fetch failed" }));
    expect(r).toEqual({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO, refrescar: true });
  });

  it("409 de negocio / 404 API previo / 403 ⇒ no refresca (no se escribió nada)", async () => {
    const yaVolo = await moverVueloOperativo(async () => ({
      ok: false,
      status: 409,
      code: "VUELO_YA_VOLO",
      error: MSG_REAGENDAR_YA_VOLO,
    }));
    expect(yaVolo).toEqual({ ok: false, error: MSG_REAGENDAR_YA_VOLO, refrescar: false });
    const viejo = await moverVueloOperativo(async () => ({
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      error: "Cannot POST /v1/flights/abc/tramos/alinear-fecha",
    }));
    expect(viejo).toEqual({ ok: false, error: MSG_REAGENDAR_API_VIEJO, refrescar: false });
    const sinPermiso = await moverVueloOperativo(async () => ({
      ok: false,
      status: 403,
      error: "Required role: ADMIN",
    }));
    expect(sinPermiso).toEqual({ ok: false, error: MSG_REAGENDAR_SIN_PERMISO, refrescar: false });
  });
});

describe("errorPuedeHaberMovido", () => {
  it("TRAMOS_NO_MOVIDOS, 5xx y técnico ⇒ sí; 4xx y validación local ⇒ no", () => {
    expect(errorPuedeHaberMovido({ code: CODE_TRAMOS_NO_MOVIDOS, status: 503, error: MSG_503_PARCIAL })).toBe(true);
    expect(errorPuedeHaberMovido({ status: 500, error: "Internal server error" })).toBe(true);
    expect(errorPuedeHaberMovido({ status: 502, code: "PARSE_ERROR", error: "Bad Gateway" })).toBe(true);
    expect(errorPuedeHaberMovido({ error: "fetch failed" })).toBe(true);
    expect(errorPuedeHaberMovido({})).toBe(true);
    expect(errorPuedeHaberMovido({ status: 409, code: "VUELO_YA_VOLO", error: "x" })).toBe(false);
    expect(errorPuedeHaberMovido({ status: 404, error: "Cannot POST /v1/x" })).toBe(false);
    expect(errorPuedeHaberMovido({ status: 401, error: "Unauthorized" })).toBe(false);
    // uuid inválido: la action ni siquiera salió a la red.
    expect(errorPuedeHaberMovido({ error: "No se reconoce el vuelo. Recarga la página." })).toBe(false);
  });
});

describe("toastAlCerrarSinMover — «No» después de un error", () => {
  it("cotización sin error ⇒ «la operación no cambió»; vuelo sin error ⇒ nada", () => {
    expect(toastAlCerrarSinMover({ contexto: "cotizacion", quizaMovio: false })).toBe(TOAST_NO_MOVIDO);
    expect(toastAlCerrarSinMover({ contexto: "vuelo", quizaMovio: false })).toBeNull();
  });

  it("tras un error que pudo mover ⇒ texto neutro (nunca afirma que no cambió)", () => {
    expect(TOAST_REVISA_TRAMOS).toBe(
      "Revisa las fechas de los tramos del vuelo: puede que algunos ya se hayan movido",
    );
    expect(toastAlCerrarSinMover({ contexto: "cotizacion", quizaMovio: true })).toBe(TOAST_REVISA_TRAMOS);
    expect(toastAlCerrarSinMover({ contexto: "vuelo", quizaMovio: true })).toBe(TOAST_REVISA_TRAMOS);
  });
});

describe("decidirBandaFechaOperativa — banda del detalle del vuelo", () => {
  it("la cotización dice el 7 y la operación sigue el 5 ⇒ banda con las dos fechas", () => {
    const d = decidirBandaFechaOperativa(cot({ fecha_vuelo: OCT7_2230 }));
    expect(d).toEqual({ mostrar: true, fechaCotizacion: OCT7_2230, fechaOperativa: OCT5_10H });
  });

  it("misma regla que el modal: mismo día, ya voló, cancelado, sin tramos, sin fecha ⇒ no", () => {
    const motivo = (c: CotizacionConFechas) => {
      const d = decidirBandaFechaOperativa(c);
      return d.mostrar ? "mostrar" : d.motivo;
    };
    expect(motivo(cot({}))).toBe("mismo_dia");
    expect(motivo(cot({ fecha_vuelo: OCT7_10H, estado: "EN_VUELO" }))).toBe("ya_volo");
    expect(
      motivo(
        cot({
          fecha_vuelo: OCT7_10H,
          escalas: [tramo({ orden: 1, fecha_salida_plan: OCT5_10H, taco_salida: "1234.5" })],
        }),
      ),
    ).toBe("ya_volo");
    expect(motivo(cot({ fecha_vuelo: OCT7_10H, estado: "CANCELADO" }))).toBe("cancelado");
    expect(motivo(cot({ fecha_vuelo: OCT7_10H, escalas: [tramo({ orden: 1 })] }))).toBe("sin_tramos");
    expect(motivo(cot({ fecha_vuelo: null }))).toBe("sin_fecha");
    expect(motivo(cot({ fecha_vuelo: OCT8_08H }))).toBe("mostrar");
    expect(decidirBandaFechaOperativa(null)).toMatchObject({ mostrar: false, motivo: "sin_fecha" });
  });
});

describe("textos de la variante «vuelo» y de la banda", () => {
  it("banda, título, cuerpo, nota y botones", () => {
    expect(BOTON_BANDA_MOVER).toBe("Mover el vuelo operativo a la fecha de la cotización");
    expect(TITULO_MOVER_DESDE_VUELO).toBe(BOTON_BANDA_MOVER);
    expect(textoBandaFechaOperativa(OCT7_2230, OCT5_10H)).toBe(
      "La cotización dice el 7 de octubre de 2026, pero el vuelo operativo (sus tramos) " +
        "sigue programado para el 5 de octubre de 2026.",
    );
    expect(textoMoverDesdeVuelo(OCT7_10H, OCT5_10H)).toBe(
      "La cotización dice el 7 de octubre de 2026. El vuelo operativo (sus tramos) sigue " +
        "programado para el 5 de octubre de 2026. ¿Quieres mover el vuelo operativo a la " +
        "fecha de la cotización?",
    );
    expect(NOTA_SOLO_FECHA_VUELO).toBe(
      "Solo cambia la fecha: cada tramo conserva su hora. Las horas se editan tramo por " +
        "tramo en este mismo vuelo.",
    );
    expect(BOTON_AHORA_NO).toBe("Ahora no");
    expect(NOTA_BANDA_SIN_PERMISO).toBe(
      "Pide a administración o a coordinación que mueva el vuelo operativo.",
    );
  });

  it("textosDialogoReagendar: cotización = textos del contrato; vuelo = su variante", () => {
    expect(textosDialogoReagendar("cotizacion", OCT7_10H, OCT5_10H)).toEqual({
      titulo: TITULO_REAGENDAR,
      descripcion: textoReagendar(OCT7_10H, OCT5_10H),
      nota: NOTA_SOLO_FECHA,
      botonMover: BOTON_MOVER,
      botonMoviendo: BOTON_MOVIENDO,
      botonNo: BOTON_SOLO_COTIZACION,
    });
    expect(textosDialogoReagendar("vuelo", OCT7_10H, OCT5_10H)).toEqual({
      titulo: TITULO_MOVER_DESDE_VUELO,
      descripcion: textoMoverDesdeVuelo(OCT7_10H, OCT5_10H),
      nota: NOTA_SOLO_FECHA_VUELO,
      botonMover: BOTON_MOVER,
      botonMoviendo: BOTON_MOVIENDO,
      botonNo: BOTON_AHORA_NO,
    });
  });

  it("botón de la banda solo para ADMIN y COORDINADOR (los roles del endpoint)", () => {
    expect(puedeMoverVueloOperativo("ADMIN")).toBe(true);
    expect(puedeMoverVueloOperativo("COORDINADOR")).toBe(true);
    for (const rol of ["FACTURACION", "ANALISTA", "SOCIO", "PILOTO", "", null, undefined]) {
      expect(puedeMoverVueloOperativo(rol)).toBe(false);
    }
  });
});
