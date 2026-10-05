/**
 * `alinearFechaTramosAction` (5-oct-2026, API 0.0.55): el «Sí, mover el vuelo
 * operativo» del modal que sale al guardar una cotización con otra fecha.
 * Contrato: valida el uuid ANTES de la red, `POST /v1/flights/:id/tramos/
 * alinear-fecha` con body `{}` (objeto: `apiFetch` serializa), nunca lanza,
 * copia `code`/`status` (un 404 «Cannot POST» = API previo se distingue del
 * 404 de negocio) y revalida el vuelo, la lista, la cotización y el
 * calendario.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_REAGENDAR_VUELO_INVALIDO } from "@/lib/admin/quote-fecha-operativa";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { alinearFechaTramosAction } = await import("../actions");

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";

const RESPUESTA = {
  vuelo_id: VUELO,
  folio: 364,
  delta_dias: 2,
  fecha_objetivo: "2026-10-07T15:00:00.000Z",
  tramos: [
    {
      id: "e1",
      orden: 1,
      origen_iata: "CUN",
      destino_iata: "CET",
      fecha_salida_plan_antes: "2026-10-05T15:00:00.000Z",
      fecha_salida_plan: "2026-10-07T15:00:00.000Z",
    },
  ],
  fecha_traslado_final: null,
  tramos_movidos: 1,
};

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("alinearFechaTramosAction", () => {
  it("POST /v1/flights/:id/tramos/alinear-fecha con body {} (objeto, sin stringify)", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    const res = await alinearFechaTramosAction(VUELO);
    expect(res).toEqual({ ok: true, data: RESPUESTA });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/flights/${VUELO}/tramos/alinear-fecha`);
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({});
    expect(typeof init.body).toBe("object");
  });

  it("revalida el vuelo, la lista, la cotización y el calendario", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await alinearFechaTramosAction(VUELO);
    const rutas = revalidatePath.mock.calls.map((c) => c[0]);
    expect(rutas).toEqual(
      expect.arrayContaining([
        `/admin/flights/${VUELO}`,
        "/admin/flights",
        `/admin/quotes/${VUELO}`,
        "/admin/calendar",
      ]),
    );
  });

  it("un id que no es uuid no sale a la red", async () => {
    expect(await alinearFechaTramosAction("364")).toEqual({
      ok: false,
      error: MSG_REAGENDAR_VUELO_INVALIDO,
    });
    expect(await alinearFechaTramosAction("")).toMatchObject({ ok: false });
    expect(apiServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 VUELO_YA_VOLO: nunca lanza, copia code, status y el texto del API; no revalida", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "VUELO_YA_VOLO",
        message: "La operación ya empezó: la fecha de cada tramo se edita desde el vuelo",
      }),
    );
    const res = await alinearFechaTramosAction(VUELO);
    expect(res).toMatchObject({
      ok: false,
      code: "VUELO_YA_VOLO",
      status: 409,
      error: "La operación ya empezó: la fecha de cada tramo se edita desde el vuelo",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("API previo (404 «Cannot POST») llega con su status para decir «falta actualizar el servidor»", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: `Cannot POST /v1/flights/${VUELO}/tramos/alinear-fecha`,
      }),
    );
    const res = await alinearFechaTramosAction(VUELO);
    expect(res).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
    expect(res.error).toMatch(/^Cannot POST/);
  });

  it("un fallo que no es del API (red) tampoco lanza", async () => {
    apiServer.mockRejectedValue(new Error("fetch failed"));
    await expect(alinearFechaTramosAction(VUELO)).resolves.toEqual({
      ok: false,
      error: "fetch failed",
    });
  });
});
