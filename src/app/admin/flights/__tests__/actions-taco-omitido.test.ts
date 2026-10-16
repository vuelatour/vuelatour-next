/**
 * Server actions del tacómetro OMITIDO (15-oct-2026, API 0.0.81):
 * `omitirTacoAction`, `deshacerOmisionTacoAction` e
 * `iniciarYCompletarVueloAction`. Contrato: ruta y método exactos, body como
 * OBJETO (`apiFetch` serializa), nunca lanzan, copian `status` (un 404
 * «Cannot POST» = API previo) y revalidan el vuelo, la lista y Tacómetros en
 * vivo. «Iniciar y completar» tolera VUELO_YA_INICIADO y, si el complete
 * falla tras iniciar, lo DICE y revalida igual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { ERROR_API_PREVIO_OMITIR, errorDeOmision } from "@/lib/admin/taco-omitido";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { omitirTacoAction, deshacerOmisionTacoAction, iniciarYCompletarVueloAction } =
  await import("../actions");

const VUELO = "a1b2c3d4-3000-4a7b-8c9d-0e1f2a3b4c5d";
const ESCALA = "7d022d2a-3383-4bba-abbe-142acadfe9a1";
const RESP = {
  escala: { id: ESCALA, taco_omitido_at: "2026-10-15T15:40:00Z" },
  vuelo: { id: VUELO, folio: 300, estado: "EN_VUELO", completable: true, requiere_iniciar: false, omitidos: 1 },
};
const err = (statusCode: number, code: string, message: string) =>
  new ApiError({ statusCode, code, message });

const revalidados = () => revalidatePath.mock.calls.map((c) => c[0]);

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("omitirTacoAction", () => {
  it("POST …/legs/:id/taco/omitir con { motivo } recortado (objeto) y revalida taco-live", async () => {
    apiServer.mockResolvedValueOnce(RESP);
    const r = await omitirTacoAction(VUELO, ESCALA, "  Falló el tacómetro  ");
    expect(r).toEqual({ ok: true, data: RESP });
    expect(apiServer).toHaveBeenCalledWith(`/v1/flights/legs/${ESCALA}/taco/omitir`, {
      method: "POST",
      body: { motivo: "Falló el tacómetro" },
    });
    expect(revalidados()).toEqual(
      expect.arrayContaining(["/admin/flights", `/admin/flights/${VUELO}`, "/admin/taco-live"]),
    );
  });

  it("404 «Cannot POST» (API previo): copia status ⇒ el toast dice que falta el API", async () => {
    apiServer.mockRejectedValueOnce(err(404, "NOT_FOUND", "Cannot POST /v1/flights/legs/x/taco/omitir"));
    const r = await omitirTacoAction(VUELO, ESCALA, "Falló el tacómetro");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(errorDeOmision(r)).toBe(ERROR_API_PREVIO_OMITIR);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 de negocio: code, details y status tal cual; nunca lanza ante un error de red", async () => {
    apiServer.mockRejectedValueOnce(
      err(409, "TACO_YA_OMITIDO", "Este tramo ya tiene el tacómetro omitido…"),
    );
    const r = await omitirTacoAction(VUELO, ESCALA, "Falló el tacómetro");
    expect(r).toMatchObject({ ok: false, code: "TACO_YA_OMITIDO", status: 409 });
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    const r2 = await omitirTacoAction(VUELO, ESCALA, "Falló el tacómetro");
    expect(r2).toMatchObject({ ok: false, error: "fetch failed" });
    expect(r2.status).toBeUndefined();
  });
});

describe("deshacerOmisionTacoAction", () => {
  it("DELETE …/legs/:id/taco/omitir sin body y revalida taco-live", async () => {
    apiServer.mockResolvedValueOnce(RESP);
    const r = await deshacerOmisionTacoAction(VUELO, ESCALA);
    expect(r.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledWith(`/v1/flights/legs/${ESCALA}/taco/omitir`, {
      method: "DELETE",
    });
    expect(revalidados()).toContain("/admin/taco-live");
  });

  it("copia status en el fallo", async () => {
    apiServer.mockRejectedValueOnce(err(409, "TACO_NO_OMITIDO", "Este tramo no tiene el tacómetro omitido: no hay nada que deshacer."));
    const r = await deshacerOmisionTacoAction(VUELO, ESCALA);
    expect(r).toMatchObject({ ok: false, status: 409, code: "TACO_NO_OMITIDO" });
  });
});

describe("iniciarYCompletarVueloAction", () => {
  it("start y luego complete; revalida", async () => {
    apiServer.mockResolvedValueOnce({ id: VUELO, estado: "EN_VUELO" });
    apiServer.mockResolvedValueOnce({ id: VUELO, estado: "COMPLETADO" });
    const r = await iniciarYCompletarVueloAction(VUELO);
    expect(r).toEqual({ ok: true, data: { id: VUELO, estado: "COMPLETADO" } });
    expect(apiServer.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [`/v1/flights/${VUELO}/start`, { method: "POST" }],
      [`/v1/flights/${VUELO}/complete`, { method: "POST" }],
    ]);
    expect(revalidados()).toEqual(
      expect.arrayContaining([`/admin/flights/${VUELO}`, "/admin/taco-live"]),
    );
  });

  it("409 VUELO_YA_INICIADO se tolera y completa igual", async () => {
    apiServer.mockRejectedValueOnce(err(409, "VUELO_YA_INICIADO", "No se puede iniciar un vuelo en estado EN_VUELO."));
    apiServer.mockResolvedValueOnce({ id: VUELO, estado: "COMPLETADO" });
    const r = await iniciarYCompletarVueloAction(VUELO);
    expect(r.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledTimes(2);
  });

  it("otro fallo del start: NO llama complete ni revalida", async () => {
    apiServer.mockRejectedValueOnce(err(400, "BAD_REQUEST", "No se puede iniciar sin piloto_id asignado"));
    const r = await iniciarYCompletarVueloAction(VUELO);
    expect(r).toMatchObject({ ok: false, status: 400, error: "No se puede iniciar sin piloto_id asignado" });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("inició pero el complete falló: lo dice, copia status y revalida (queda EN VUELO)", async () => {
    apiServer.mockResolvedValueOnce({ id: VUELO, estado: "EN_VUELO" });
    apiServer.mockRejectedValueOnce(err(409, "FALTAN_LLEGADAS", "Faltan lecturas de llegada"));
    const r = await iniciarYCompletarVueloAction(VUELO);
    expect(r).toMatchObject({ ok: false, status: 409, code: "FALTAN_LLEGADAS" });
    expect(r.error).toBe(
      "El vuelo ya quedó EN VUELO, pero no se pudo completar: Faltan lecturas de llegada. Pulsa «Completar vuelo».",
    );
    expect(revalidados()).toContain(`/admin/flights/${VUELO}`);
  });
});
