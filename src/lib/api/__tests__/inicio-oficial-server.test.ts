/**
 * `getInicioOficial` (16-oct-2026, API 0.0.84): lee `config.inicio_oficial`
 * de `/v1/me` (vía `getMe`, ya cacheado por petición). Sin la llave (API
 * previo), con un valor inválido o si `/me` falla ⇒ null ⇒ la página se
 * comporta como hoy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const me = vi.hoisted(() => ({ respuesta: null as unknown, falla: false }));

vi.mock("@/lib/api/me", () => ({
  getMe: async () => {
    if (me.falla) throw new Error("API caído");
    return me.respuesta;
  },
}));

const { getInicioOficial } = await import("../inicio-oficial");

describe("getInicioOficial", () => {
  beforeEach(() => {
    me.falla = false;
    me.respuesta = null;
  });

  it("sin llave (API ≤ 0.0.83) ⇒ null", async () => {
    me.respuesta = { id: "u1", config: { captura_taco_foto_ia: true } };
    expect(await getInicioOficial()).toBeNull();
    me.respuesta = { id: "u1" };
    expect(await getInicioOficial()).toBeNull();
  });

  it("inválida ⇒ null", async () => {
    me.respuesta = { id: "u1", config: { inicio_oficial: "2026-02-30" } };
    expect(await getInicioOficial()).toBeNull();
  });

  it("válida ⇒ la fecha", async () => {
    me.respuesta = { id: "u1", config: { inicio_oficial: "2026-09-01" } };
    expect(await getInicioOficial()).toBe("2026-09-01");
  });

  it("piso apagado (null) ⇒ null", async () => {
    me.respuesta = { id: "u1", config: { inicio_oficial: null } };
    expect(await getInicioOficial()).toBeNull();
  });

  it("/me falla ⇒ null (jamás tumba la página)", async () => {
    me.falla = true;
    expect(await getInicioOficial()).toBeNull();
  });
});
