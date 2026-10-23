/**
 * RECALCULAR LA BANDERA «COBRADO» (22-oct-2026, API 0.0.102): la lib pura de
 * la tarjeta de Configuración — lectura defensiva de la respuesta, textos del
 * resumen y de los errores.
 */
import { describe, expect, it } from "vitest";
import {
  TEXTO_RECALCULO_API_PREVIO,
  TEXTO_RECALCULO_SESION,
  TEXTO_RECALCULO_SIN_PERMISO,
  TEXTO_RECALCULO_SIN_RESPUESTA,
  folioTexto,
  mensajeErrorRecalculo,
  normalizarResultadoRecalculo,
  resumenRecalculo,
  textoCambio,
  toastRecalculo,
} from "@/lib/admin/recalcular-cobrado";

const V = (folio: number | null, antes: boolean, despues: boolean) => ({ id: `v-${folio ?? "x"}`, folio, antes, despues });

describe("normalizarResultadoRecalculo (lectura defensiva)", () => {
  it("forma del API ⇒ tal cual; filas raras se limpian; basura ⇒ null", () => {
    const r = normalizarResultadoRecalculo({
      revisados: 3,
      cambiados: [{ id: "a", folio: 332, antes: false, despues: true }, { sin_id: true }, null],
      errores: [{ id: "b", folio: null, error: "boom" }, { raro: 1 }],
    });
    expect(r).toEqual({
      revisados: 3,
      cambiados: [{ id: "a", folio: 332, antes: false, despues: true }],
      errores: [
        { id: "b", folio: null, error: "boom" },
        { id: "", folio: null, error: "error desconocido" },
      ],
    });
    expect(normalizarResultadoRecalculo(null)).toBeNull();
    expect(normalizarResultadoRecalculo({ revisados: "3" })).toBeNull();
    expect(normalizarResultadoRecalculo({ revisados: 3, cambiados: [], errores: "no" })).toBeNull();
  });
});

describe("textos", () => {
  it("folio y cambio", () => {
    expect(folioTexto({ folio: 332 })).toBe("#332");
    expect(folioTexto({ folio: null })).toBe("vuelo");
    expect(textoCambio(V(332, false, true))).toBe("#332: pendiente → cobrado");
    expect(textoCambio(V(null, true, false))).toBe("vuelo: cobrado → pendiente");
  });

  it("resumen: sin cambios, mixto, singulares y errores", () => {
    expect(resumenRecalculo({ revisados: 412, cambiados: [], errores: [] })).toBe(
      "Se revisaron 412 vuelos y ninguna bandera cambió.",
    );
    expect(
      resumenRecalculo({
        revisados: 412,
        cambiados: [V(1, false, true), V(2, false, true), V(3, true, false)],
        errores: [],
      }),
    ).toBe("Se revisaron 412 vuelos; cambiaron 3 (2 pasaron a cobrado, 1 pasó a pendiente).");
    expect(
      resumenRecalculo({ revisados: 1, cambiados: [V(9, false, true)], errores: [{ id: "e", folio: 9, error: "x" }] }),
    ).toBe("Se revisaron 1 vuelo; cambió 1 (1 pasó a cobrado). 1 vuelo con error.");
    expect(toastRecalculo({ revisados: 2, cambiados: [], errores: [] })).toBe(
      "Bandera «cobrado» recalculada. Se revisaron 2 vuelos y ninguna bandera cambió.",
    );
  });

  it("errores: 401/403/404 con texto propio; red ⇒ «puede haber corrido»; el message del API tal cual", () => {
    expect(mensajeErrorRecalculo({ ok: false, status: 401 })).toBe(TEXTO_RECALCULO_SESION);
    expect(mensajeErrorRecalculo({ ok: false, status: 403, error: "Forbidden resource" })).toBe(TEXTO_RECALCULO_SIN_PERMISO);
    expect(mensajeErrorRecalculo({ ok: false, status: 404, error: "Cannot POST /v1/flights/recalcular-cobrado" })).toBe(
      TEXTO_RECALCULO_API_PREVIO,
    );
    expect(mensajeErrorRecalculo({ ok: false, code: "SIN_CONEXION" })).toBe(TEXTO_RECALCULO_SIN_RESPUESTA);
    expect(mensajeErrorRecalculo({ ok: false, error: "fetch failed" })).toBe(TEXTO_RECALCULO_SIN_RESPUESTA);
    expect(mensajeErrorRecalculo({ ok: false, status: 400, error: " El rango no es válido. " })).toBe("El rango no es válido.");
  });
});
