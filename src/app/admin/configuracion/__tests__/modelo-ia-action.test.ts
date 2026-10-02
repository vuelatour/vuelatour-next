/**
 * MODELO DE IA (2-oct-2026, API 0.0.51): la server action y la lectura.
 *
 *  1. `setModeloIaAction` = `PUT /v1/config/ia-modelo { modelo }` con el id
 *     NORMALIZADO; `null` = «Volver al del servidor»; revalida Configuración;
 *  2. un id inválido NO sale a la red (misma regla que el API);
 *  3. los errores llegan en es-MX (400 MODELO_INVALIDO, 401 de sesión
 *     vencida, 403, 404 de un API previo, fallo de red);
 *  4. `getModeloIa` NUNCA lanza y distingue ok / no-disponible (404, 401,
 *     403) / fallo (500, red, respuesta rara) — un fallo jamás se disfraza de
 *     «API previo»; el control de flujo de Next sí sube.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { setModeloIaAction } = await import("../actions");
const { getModeloIa } = await import("@/lib/api/configuracion-server");
const {
  TEXTO_ERROR_GUARDAR_MODELO_IA,
  TEXTO_ID_MODELO_INVALIDO,
  TEXTO_MODELO_IA_NO_DISPONIBLE,
  TEXTO_SESION_VENCIDA_MODELO_IA,
  TEXTO_SIN_PERMISO_MODELO_IA,
} = await import("@/lib/admin/ia-modelo");

const RESPUESTA = {
  configurado: "claude-sonnet-4-6",
  default_servidor: "claude-opus-4-8",
  efectivo: "claude-sonnet-4-6",
  catalogo: [],
  actualizado_at: "2026-10-02T15:15:00Z",
  actualizado_por_nombre: "Mari",
  aviso: null,
};

const apiError = (statusCode: number, code: string, message: string) =>
  new ApiError({ statusCode, code, message });

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setModeloIaAction", () => {
  it("PUT con el id normalizado (sin espacios, minúsculas) y revalida Configuración", async () => {
    apiServer.mockResolvedValueOnce(RESPUESTA);
    const res = await setModeloIaAction("  Claude-Sonnet-4-6 ");
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer).toHaveBeenCalledWith("/v1/config/ia-modelo", {
      method: "PUT",
      body: { modelo: "claude-sonnet-4-6" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/configuracion");
    expect(res).toEqual({ ok: true, data: RESPUESTA });
  });

  it("«Volver al del servidor» manda `modelo: null` (la llave SIEMPRE viaja)", async () => {
    apiServer.mockResolvedValueOnce({ ...RESPUESTA, configurado: null, efectivo: "claude-opus-4-8" });
    const res = await setModeloIaAction(null);
    expect(apiServer).toHaveBeenCalledWith("/v1/config/ia-modelo", {
      method: "PUT",
      body: { modelo: null },
    });
    expect(res.ok).toBe(true);
  });

  it("un id fuera de la regla no llega al API", async () => {
    for (const malo of ["gpt-4o", "", "   ", "claude-ab", "claude-opus 4", "__otro__"]) {
      const res = await setModeloIaAction(malo);
      expect(res).toEqual({ ok: false, code: "MODELO_INVALIDO", error: TEXTO_ID_MODELO_INVALIDO });
    }
    expect(apiServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("errores del API en es-MX, sin revalidar", async () => {
    apiServer.mockRejectedValueOnce(apiError(400, "MODELO_INVALIDO", "El id del modelo no es válido…"));
    expect(await setModeloIaAction("claude-opus-9")).toEqual({
      ok: false,
      code: "MODELO_INVALIDO",
      error: TEXTO_ID_MODELO_INVALIDO,
    });
    apiServer.mockRejectedValueOnce(apiError(403, "FORBIDDEN", "Required role: ADMIN. Current: SOCIO"));
    expect((await setModeloIaAction("claude-opus-9")).error).toBe(TEXTO_SIN_PERMISO_MODELO_IA);
    apiServer.mockRejectedValueOnce(apiError(401, "UNAUTHORIZED", "Invalid or expired token"));
    expect((await setModeloIaAction("claude-opus-9")).error).toBe(TEXTO_SESION_VENCIDA_MODELO_IA);
    apiServer.mockRejectedValueOnce(apiError(404, "NOT_FOUND", "Cannot PUT /v1/config/ia-modelo"));
    expect((await setModeloIaAction("claude-opus-9")).error).toBe(TEXTO_MODELO_IA_NO_DISPONIBLE);
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await setModeloIaAction("claude-opus-9")).toEqual({
      ok: false,
      error: TEXTO_ERROR_GUARDAR_MODELO_IA,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("getModeloIa (nunca lanza)", () => {
  it("ok ⇒ los datos tal cual, con no-store", async () => {
    apiServer.mockResolvedValueOnce(RESPUESTA);
    expect(await getModeloIa()).toEqual({ estado: "ok", datos: RESPUESTA });
    expect(apiServer).toHaveBeenCalledWith("/v1/config/ia-modelo", { cache: "no-store" });
  });

  it("404 (API previo), 401 y 403 ⇒ no-disponible: la tarjeta no se monta", async () => {
    for (const [s, c, m] of [
      [404, "NOT_FOUND", "Cannot GET /v1/config/ia-modelo"],
      [401, "UNAUTHORIZED", "x"],
      [403, "FORBIDDEN", "Required role: ADMIN"],
    ] as const) {
      apiServer.mockRejectedValueOnce(apiError(s, c, m));
      expect(await getModeloIa()).toEqual({ estado: "no-disponible" });
    }
  });

  it("500, red o una respuesta sin forma ⇒ fallo (la tarjeta lo DICE)", async () => {
    apiServer.mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR", "Internal server error"));
    expect(await getModeloIa()).toEqual({ estado: "fallo" });
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await getModeloIa()).toEqual({ estado: "fallo" });
    apiServer.mockResolvedValueOnce("<html>");
    expect(await getModeloIa()).toEqual({ estado: "fallo" });
  });

  it("el control de flujo de Next (redirect/notFound) sube intacto", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login" });
    apiServer.mockRejectedValueOnce(redirect);
    await expect(getModeloIa()).rejects.toBe(redirect);
  });
});
