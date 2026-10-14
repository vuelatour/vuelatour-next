/**
 * `corregirFechaGastoAction` (14-oct-2026, API 0.0.76): `PATCH
 * /v1/expenses/:id/fecha` con el cuerpo como OBJETO y solo sus 2 o 3 llaves;
 * lo inválido no sale a la red; revalida SOLO si la fecha cambió; un 404
 * «Cannot PATCH» (API previo) ⇒ `RUTA_NO_DISPONIBLE`; los demás errores
 * conservan code, status y details; nunca lanza. Reloj fijo en el 14-oct
 * (hoy en Cancún).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  MSG_FECHA_API_VIEJO,
  MSG_FECHA_IGUAL,
  MSG_FECHA_INCOMPLETA,
  MSG_FECHA_MUY_ANTIGUA,
} from "@/lib/admin/conciliacion-fecha-gasto";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { corregirFechaGastoAction } = await import("../actions");

const G = "08c0632c-5711-4f0d-affd-591d756dd9fc";
const RUTA = `/v1/expenses/${G}/fecha`;
const RESPUESTA = {
  id: G,
  fecha_gasto: "2026-10-12",
  fecha_anterior: "2026-10-10",
  cambio: true,
  cambia_de_mes: false,
  fecha_hora_carga: null,
  updated_at: "2026-10-14T17:00:01.123456+00:00",
  aviso: null,
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T17:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("corregirFechaGastoAction", () => {
  it("un id que no es uuid ⇒ GASTO_INVALIDO sin llamar al API", async () => {
    expect(await corregirFechaGastoAction("nada", { fecha: "2026-10-12", fechaAnterior: "2026-10-10" })).toEqual({
      ok: false,
      code: "GASTO_INVALIDO",
      status: 400,
      error: "Gasto inválido.",
    });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("fechas inválidas ⇒ FECHA_INVALIDA con el texto exacto, sin red", async () => {
    const casos: [string, string, string][] = [
      ["", "2026-10-10", MSG_FECHA_INCOMPLETA],
      ["2026-02-30", "2026-10-10", MSG_FECHA_INCOMPLETA],
      ["2026-10-15", "2026-10-10", "La fecha del pago no puede ser posterior a hoy (14 oct 2026)."],
      ["2025-10-13", "2026-10-10", MSG_FECHA_MUY_ANTIGUA],
      ["2026-10-10", "2026-10-10", MSG_FECHA_IGUAL],
      ["2026-10-12", "x", MSG_FECHA_INCOMPLETA],
    ];
    for (const [fecha, fechaAnterior, error] of casos) {
      expect(await corregirFechaGastoAction(G, { fecha, fechaAnterior })).toEqual({
        ok: false,
        code: "FECHA_INVALIDA",
        status: 400,
        error,
      });
    }
    // Sin argumentos útiles tampoco lanza.
    expect(await corregirFechaGastoAction(G, undefined as never)).toMatchObject({ ok: false, code: "FECHA_INVALIDA" });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("OK: PATCH con el cuerpo como OBJETO y solo sus dos llaves; revalida las 5 pantallas", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    const r = await corregirFechaGastoAction(G, { fecha: " 2026-10-12 ", fechaAnterior: "2026-10-10" });
    expect(r).toEqual({ ok: true, data: RESPUESTA });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer).toHaveBeenCalledWith(RUTA, {
      method: "PATCH",
      body: { fecha_gasto: "2026-10-12", fecha_anterior: "2026-10-10" },
    });
    const body = apiServer.mock.calls[0][1].body;
    expect(typeof body).toBe("object");
    expect(Object.keys(body)).toEqual(["fecha_gasto", "fecha_anterior"]);
    expect(revalidatePath.mock.calls).toEqual([
      ["/admin/conciliacion"],
      ["/admin/expenses"],
      ["/admin/combustibles"],
      ["/admin/gastos-personales"],
      ["/admin/flights", "layout"],
    ]);
  });

  it("confirmar true ⇒ viaja confirmar: true; false o ausente ⇒ no viaja", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10", confirmar: true });
    expect(apiServer.mock.calls[0][1].body).toEqual({
      fecha_gasto: "2026-10-12",
      fecha_anterior: "2026-10-10",
      confirmar: true,
    });
    await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10", confirmar: false });
    expect(apiServer.mock.calls[1][1].body).toEqual({ fecha_gasto: "2026-10-12", fecha_anterior: "2026-10-10" });
    await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10" });
    expect("confirmar" in apiServer.mock.calls[2][1].body).toBe(false);
  });

  it("cambio false (ya tenía esa fecha) ⇒ ok SIN revalidar", async () => {
    const igual = { ...RESPUESTA, fecha_anterior: "2026-10-12", cambio: false };
    apiServer.mockResolvedValue(igual);
    expect(await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10" })).toEqual({
      ok: true,
      data: igual,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("si revalidar falla, la fecha YA quedó: responde ok (nunca «no se cambió»)", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("Invariant: static generation store missing");
    });
    expect(await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10" })).toEqual({
      ok: true,
      data: RESPUESTA,
    });
  });

  it("404 «Cannot PATCH …» (API previo) ⇒ RUTA_NO_DISPONIBLE con el texto del API viejo", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot PATCH ${RUTA}` }));
    expect(await corregirFechaGastoAction(G, { fecha: "2026-10-12", fechaAnterior: "2026-10-10" })).toEqual({
      ok: false,
      code: "RUTA_NO_DISPONIBLE",
      status: 404,
      error: MSG_FECHA_API_VIEJO,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 FECHA_GASTO_CONFIRMAR conserva error, code, status y details, y no revalida", async () => {
    const details = {
      cambia_de_mes: true,
      mes_antes: "2026-09",
      mes_despues: "2026-10",
      etiqueta_mes_despues: "octubre 2026",
      meses_terminados: ["2026-09"],
    };
    const message = "Este gasto pasa de septiembre 2026 a octubre 2026. …";
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 409, code: "FECHA_GASTO_CONFIRMAR", message, details }));
    expect(await corregirFechaGastoAction(G, { fecha: "2026-10-02", fechaAnterior: "2026-09-30" })).toEqual({
      ok: false,
      error: message,
      code: "FECHA_GASTO_CONFIRMAR",
      status: 409,
      details,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("CONFLICTO_VERSION, GASTO_NO_EXISTE, 403 y 502 conservan code y status; un fallo de red nunca lanza", async () => {
    const input = { fecha: "2026-10-12", fechaAnterior: "2026-10-10" };
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 409, code: "CONFLICTO_VERSION", message: "Alguien modificó…" }));
    expect(await corregirFechaGastoAction(G, input)).toMatchObject({ ok: false, code: "CONFLICTO_VERSION", status: 409 });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "GASTO_NO_EXISTE", message: "Ese gasto ya no existe: recarga la página." }),
    );
    expect(await corregirFechaGastoAction(G, input)).toMatchObject({ ok: false, code: "GASTO_NO_EXISTE", status: 404 });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Required role: ADMIN | FACTURACION" }));
    expect(await corregirFechaGastoAction(G, input)).toMatchObject({ ok: false, code: "FORBIDDEN", status: 403 });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "BAD_GATEWAY", message: "Bad Gateway" }));
    expect(await corregirFechaGastoAction(G, input)).toMatchObject({ ok: false, code: "BAD_GATEWAY", status: 502 });
    apiServer.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(corregirFechaGastoAction(G, input)).resolves.toEqual({ ok: false, error: "fetch failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
