/**
 * RECALCULAR LA BANDERA «COBRADO» (22-oct-2026, API 0.0.102): la server action
 * de Configuración.
 *  1. `POST /v1/flights/recalcular-cobrado` con body `{}` (todo el histórico);
 *     el éxito normaliza la respuesta y revalida vuelos, reparto, reportes y
 *     configuración;
 *  2. una respuesta rara ⇒ ok:false con texto es-MX y SIN revalidar;
 *  3. los rechazos conservan `code`/`status` (404 de un API previo, 403).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { recalcularCobradoAction } = await import("../actions");
const { TEXTO_RECALCULO_RESPUESTA_RARA } = await import("@/lib/admin/recalcular-cobrado");

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("recalcularCobradoAction", () => {
  it("POST sin rango; normaliza y revalida las 4 vistas", async () => {
    apiServer.mockResolvedValueOnce({
      revisados: 412,
      cambiados: [{ id: "v-1", folio: 332, antes: false, despues: true }],
      errores: [],
    });
    const r = await recalcularCobradoAction();
    expect(apiServer).toHaveBeenCalledWith("/v1/flights/recalcular-cobrado", { method: "POST", body: {} });
    expect(r).toEqual({
      ok: true,
      data: { revisados: 412, cambiados: [{ id: "v-1", folio: 332, antes: false, despues: true }], errores: [] },
    });
    expect(revalidatePath.mock.calls.map((c) => c[0]).sort()).toEqual([
      "/admin/configuracion",
      "/admin/flights",
      "/admin/profit-sharing",
      "/admin/reportes",
    ]);
  });

  it("respuesta rara ⇒ ok:false con texto claro y sin revalidar", async () => {
    apiServer.mockResolvedValueOnce({ hola: 1 });
    const r = await recalcularCobradoAction();
    expect(r).toEqual({ ok: false, error: TEXTO_RECALCULO_RESPUESTA_RARA });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rechazos: conserva code y status (404 API previo, 403)", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot POST" }));
    const r404 = await recalcularCobradoAction();
    expect(r404).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden resource" }));
    const r403 = await recalcularCobradoAction();
    expect(r403).toMatchObject({ ok: false, status: 403 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
