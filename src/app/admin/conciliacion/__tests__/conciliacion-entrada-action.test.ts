/**
 * `conciliacionDeEntradaAction` (15-oct-2026, API 0.0.78, invariante 78): la
 * ruta según el `origen` (`cobros/:id` o `ingresos/:id`) sin caché; un origen
 * fuera de catálogo o un id que no es uuid ⇒ ENTRADA_INVALIDA SIN llamar al
 * API; un 404 «Cannot GET» (API ≤ 0.0.77) ⇒ RUTA_NO_DISPONIBLE con el texto
 * del API viejo; los demás errores conservan code y status; nunca lanza; no
 * revalida (solo lectura).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_DETALLE_BANCO_API_VIEJO } from "@/lib/admin/hoja-banco";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { conciliacionDeEntradaAction } = await import("../actions");

const COBRO = "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f";
const INGRESO = "ffb57607-77e4-4334-8ee9-94afdba75f91";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("conciliacionDeEntradaAction", () => {
  it("la ruta según el origen, sin caché y sin revalidar", async () => {
    apiServer.mockResolvedValue({ estado: "CONCILIADO", abonos: [] });
    expect(await conciliacionDeEntradaAction("COBRO_VUELO", COBRO)).toEqual({
      ok: true,
      data: { estado: "CONCILIADO", abonos: [] },
    });
    expect(apiServer).toHaveBeenLastCalledWith(`/v1/conciliacion/cobros/${COBRO}`, { cache: "no-store" });
    await conciliacionDeEntradaAction("INGRESO", INGRESO);
    expect(apiServer).toHaveBeenLastCalledWith(`/v1/conciliacion/ingresos/${INGRESO}`, { cache: "no-store" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("origen fuera de catálogo o id que no es uuid ⇒ ENTRADA_INVALIDA sin llamar al API", async () => {
    const invalida = { ok: false, code: "ENTRADA_INVALIDA", status: 400, error: "Cobro o ingreso inválido." };
    expect(await conciliacionDeEntradaAction("COBRO_VUELO", "nada")).toEqual(invalida);
    expect(await conciliacionDeEntradaAction("GASTO" as never, COBRO)).toEqual(invalida);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("404 «Cannot GET …» (API ≤ 0.0.77) ⇒ RUTA_NO_DISPONIBLE con el texto del API viejo", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot GET /v1/conciliacion/cobros/${COBRO}` }),
    );
    expect(await conciliacionDeEntradaAction("COBRO_VUELO", COBRO)).toEqual({
      ok: false,
      code: "RUTA_NO_DISPONIBLE",
      status: 404,
      error: MSG_DETALLE_BANCO_API_VIEJO,
    });
  });

  it("COBRO_NO_EXISTE, INGRESO_NO_EXISTE, 403, 503 INGRESOS_NO_DISPONIBLE y una falla de red: conserva code y status; nunca lanza", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "COBRO_NO_EXISTE", message: "Ese cobro ya no existe: recarga la página." }),
    );
    expect(await conciliacionDeEntradaAction("COBRO_VUELO", COBRO)).toMatchObject({
      ok: false,
      code: "COBRO_NO_EXISTE",
      status: 404,
      error: "Ese cobro ya no existe: recarga la página.",
    });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "INGRESO_NO_EXISTE", message: "Ese ingreso ya no existe: recarga la página." }),
    );
    expect(await conciliacionDeEntradaAction("INGRESO", INGRESO)).toMatchObject({ ok: false, code: "INGRESO_NO_EXISTE", status: 404 });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden resource" }));
    expect(await conciliacionDeEntradaAction("COBRO_VUELO", COBRO)).toMatchObject({ ok: false, status: 403 });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "INGRESOS_NO_DISPONIBLE", message: "Los ingresos todavía no están habilitados…" }),
    );
    expect(await conciliacionDeEntradaAction("INGRESO", INGRESO)).toMatchObject({ ok: false, code: "INGRESOS_NO_DISPONIBLE", status: 503 });
    apiServer.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(conciliacionDeEntradaAction("COBRO_VUELO", COBRO)).resolves.toMatchObject({ ok: false });
  });
});
