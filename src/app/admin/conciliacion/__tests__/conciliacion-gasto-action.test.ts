/**
 * `conciliacionDeGastoAction` (13-oct-2026, conciliación al revés, API
 * 0.0.75): `GET /v1/conciliacion/gastos/:id` sin caché; un id que no es uuid
 * no llama al API; un 404 «Cannot GET» (API previo) ⇒ `RUTA_NO_DISPONIBLE`;
 * los demás errores conservan code y status; nunca lanza.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_DETALLE_BANCO_API_VIEJO } from "@/lib/admin/gasto-banco";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { conciliacionDeGastoAction } = await import("../actions");

const GASTO = "4e29c476-a956-440f-bd83-2c70f78279d4";

beforeEach(() => apiServer.mockReset());

describe("conciliacionDeGastoAction", () => {
  it("ruta y sin caché", async () => {
    apiServer.mockResolvedValue({ estado: "CONCILIADO", cargos: [] });
    const r = await conciliacionDeGastoAction(GASTO);
    expect(apiServer).toHaveBeenCalledWith(`/v1/conciliacion/gastos/${GASTO}`, { cache: "no-store" });
    expect(r).toEqual({ ok: true, data: { estado: "CONCILIADO", cargos: [] } });
  });

  it("un id que no es uuid ⇒ GASTO_INVALIDO sin llamar al API", async () => {
    const r = await conciliacionDeGastoAction("nada");
    expect(r).toEqual({ ok: false, code: "GASTO_INVALIDO", status: 400, error: "Gasto inválido." });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("404 «Cannot GET …» (API previo) ⇒ RUTA_NO_DISPONIBLE con el texto del API viejo", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot GET /v1/conciliacion/gastos/${GASTO}` }),
    );
    expect(await conciliacionDeGastoAction(GASTO)).toEqual({
      ok: false,
      code: "RUTA_NO_DISPONIBLE",
      status: 404,
      error: MSG_DETALLE_BANCO_API_VIEJO,
    });
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("404 GASTO_NO_EXISTE, 403 y 502 conservan code y status; nunca lanza", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "GASTO_NO_EXISTE", message: "Ese gasto ya no existe: recarga la página." }),
    );
    expect(await conciliacionDeGastoAction(GASTO)).toMatchObject({ ok: false, code: "GASTO_NO_EXISTE", status: 404 });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Required role: ADMIN | FACTURACION" }));
    expect(await conciliacionDeGastoAction(GASTO)).toMatchObject({ ok: false, status: 403 });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "BAD_GATEWAY", message: "Bad Gateway" }));
    expect(await conciliacionDeGastoAction(GASTO)).toMatchObject({ ok: false, status: 502 });
    apiServer.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(conciliacionDeGastoAction(GASTO)).resolves.toMatchObject({ ok: false });
  });
});
