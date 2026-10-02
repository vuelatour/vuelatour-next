/**
 * Server actions de 1 CARGO ↔ N GASTOS (2-oct-2026, API 0.0.52). Se custodia
 * el CONTRATO con el API:
 *
 *  1. candidatos = `GET movimientos/:id/gastos-candidatos` con `q` YA
 *     normalizado y recortado a 80, `dias`/`limite` solo si son válidos, sin
 *     caché; un 404 «Cannot GET» (API previo) ⇒ `RUTA_NO_DISPONIBLE`; CUALQUIER
 *     otro fallo vuelve como error y JAMÁS como `data: []`;
 *  2. ligar varios = `PATCH movimientos/:id {gasto_ids}` (sin `gasto_id`),
 *     ids sin repetir y validados antes de la red; 400 «property gasto_ids
 *     should not exist» ⇒ `API_SIN_LOTE`; los 409 conservan code/details;
 *  3. desligar todo sigue siendo `linkMovimientoAction(id, null)`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_LOTE_API_VIEJO } from "@/lib/admin/conciliacion-lote";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { gastosCandidatosAction, linkMovimientoGastosAction, linkMovimientoAction } = await import("../actions");

const CARGO = "c5819d4b-6a3e-4f43-9a5f-0d1b6f6a0001";
const G315 = "a3150000-0000-4000-8000-000000000315";
const G319 = "a3190000-0000-4000-8000-000000000319";
const G326 = "a3260000-0000-4000-8000-000000000326";

const RESPUESTA = {
  movimiento: { id: CARGO, fecha: "2026-09-24", monto: 8404.2, moneda: "MXN" },
  ventana: { desde: "2026-08-25", hasta: "2026-10-24" },
  candidatos: [{ id: G315, fecha: "2026-09-14", monto: 2801.4, moneda: "MXN", nota: "Pago VIP SAESA" }],
  truncado: false,
};

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("gastosCandidatosAction", () => {
  it("ruta, sin caché y sin parámetros de más (el DTO rechaza los desconocidos)", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    const r = await gastosCandidatosAction(CARGO);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/conciliacion/movimientos/${CARGO}/gastos-candidatos`);
    expect(init).toEqual({ searchParams: {}, cache: "no-store" });
    expect(r).toEqual({ ok: true, data: RESPUESTA });
  });

  it("q normalizado («$ 2,801.40» ⇒ «2801.40»), dias y limite", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await gastosCandidatosAction(CARGO, { q: " $ 2,801.40 ", dias: 120, limite: 100 });
    expect(apiServer.mock.calls[0][1].searchParams).toEqual({ q: "2801.40", dias: 120, limite: 100 });
  });

  it("q de más de 80 se recorta; dias/limite fuera de rango no viajan", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await gastosCandidatosAction(CARGO, { q: "SAESA ".repeat(30), dias: 500, limite: 0 });
    const sp = apiServer.mock.calls[0][1].searchParams;
    expect(sp.q.length).toBeLessThanOrEqual(80);
    expect(sp.q.startsWith("SAESA SAESA")).toBe(true);
    expect(sp).not.toHaveProperty("dias");
    expect(sp).not.toHaveProperty("limite");
  });

  it("id inválido: no llama al API", async () => {
    const r = await gastosCandidatosAction("nada");
    expect(r.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("404 «Cannot GET» (API previo) ⇒ RUTA_NO_DISPONIBLE", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: `Cannot GET /v1/conciliacion/movimientos/${CARGO}/gastos-candidatos`,
      }),
    );
    const r = await gastosCandidatosAction(CARGO);
    expect(r).toEqual({ ok: false, code: "RUTA_NO_DISPONIBLE", status: 404, error: MSG_LOTE_API_VIEJO });
  });

  it("502 de Railway ⇒ ok:false SIN data (nunca una lista vacía)", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Application failed to respond" }),
    );
    const r = await gastosCandidatosAction(CARGO);
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.status).toBe(502);
    expect(r.code).toBe("PARSE_ERROR");
  });

  it("400 SOLO_CARGOS y 503 sin la migración conservan code y status", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 400, code: "SOLO_CARGOS", message: "Solo un cargo se liga a gastos." }),
    );
    expect(await gastosCandidatosAction(CARGO)).toMatchObject({ ok: false, code: "SOLO_CARGOS", status: 400 });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "CONCILIACION_PARTES_NO_DISPONIBLE", message: "Falta la migración." }),
    );
    expect(await gastosCandidatosAction(CARGO)).toMatchObject({
      ok: false,
      code: "CONCILIACION_PARTES_NO_DISPONIBLE",
      status: 503,
    });
  });
});

describe("linkMovimientoGastosAction", () => {
  it("PATCH con {gasto_ids} SIN gasto_id, ids sin repetir; revalida Conciliación", async () => {
    apiServer.mockResolvedValue({ id: CARGO, gastos_n: 3, gasto_id: null });
    const r = await linkMovimientoGastosAction(CARGO, [G315, G319, G319, G326]);
    expect(apiServer).toHaveBeenCalledWith(`/v1/conciliacion/movimientos/${CARGO}`, {
      method: "PATCH",
      body: { gasto_ids: [G315, G319, G326] },
    });
    const body = apiServer.mock.calls[0][1].body;
    expect(body).not.toHaveProperty("gasto_id");
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/conciliacion");
  });

  it("ids inválidos, lista vacía o más de 50: no llega al API", async () => {
    expect((await linkMovimientoGastosAction("x", [G315])).ok).toBe(false);
    expect((await linkMovimientoGastosAction(CARGO, [G315, "no-uuid"])).ok).toBe(false);
    expect((await linkMovimientoGastosAction(CARGO, [])).ok).toBe(false);
    const muchos = Array.from({ length: 51 }, (_, i) => `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await linkMovimientoGastosAction(CARGO, muchos)).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("400 «property gasto_ids should not exist» (API previo) ⇒ API_SIN_LOTE", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: "property gasto_ids should not exist" }),
    );
    const r = await linkMovimientoGastosAction(CARGO, [G315, G319]);
    expect(r).toEqual({ ok: false, code: "API_SIN_LOTE", status: 400, error: MSG_LOTE_API_VIEJO });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 CARGO_NO_CUADRA copia code, status y details", async () => {
    const details = {
      monto_cargo: 8404.2,
      suma_gastos: 5602.8,
      diferencia: 2801.4,
      tolerancia: 0.02,
      moneda: "MXN",
      gastos: [
        { id: G315, monto: 2801.4, faltante: 2801.4 },
        { id: G319, monto: 2801.4, faltante: 2801.4 },
      ],
    };
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 409, code: "CARGO_NO_CUADRA", message: "Los 2 gastos no suman el cargo.", details }),
    );
    const r = await linkMovimientoGastosAction(CARGO, [G315, G319]);
    expect(r).toMatchObject({ ok: false, code: "CARGO_NO_CUADRA", status: 409, details });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("linkMovimientoAction (uno, o null = desligar TODO, también un lote)", () => {
  it("intacta: {gasto_id} y {gasto_id: null}", async () => {
    apiServer.mockResolvedValue({ id: CARGO });
    await linkMovimientoAction(CARGO, G315);
    expect(apiServer.mock.calls[0]).toEqual([
      `/v1/conciliacion/movimientos/${CARGO}`,
      { method: "PATCH", body: { gasto_id: G315 } },
    ]);
    await linkMovimientoAction(CARGO, null);
    expect(apiServer.mock.calls[1]).toEqual([
      `/v1/conciliacion/movimientos/${CARGO}`,
      { method: "PATCH", body: { gasto_id: null } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/conciliacion");
  });
});
