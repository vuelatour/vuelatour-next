/**
 * `repartoIgualesAction` (16-oct-2026, API 0.0.90): «Repartir entre aviones»
 * de `/admin/nomina`. Contrato: valida ANTES de la red (con datos inválidos
 * no sale nada), `POST /v1/expenses/reparto-iguales` con el cuerpo EXACTO
 * como OBJETO (`apiFetch` serializa), nunca lanza, NO revalida (la llama un
 * diálogo que sigue abierto: quien la llama hace `router.refresh()` al
 * cerrar), un 404 «Cannot POST» de un API previo ⇒ `RUTA_NO_DISPONIBLE` y un
 * fallo sin respuesta ⇒ `SIN_CONEXION` (incierto).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  CODIGO_RUTA_NO_DISPONIBLE,
  CODIGO_SIN_CONEXION,
  MSG_IDS_INVALIDOS,
  MSG_REPARTO_RUTA_NO_DISPONIBLE,
  MSG_SIN_PAGOS,
  resultadoEsIncierto,
} from "@/lib/admin/nomina-reparto";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { repartoIgualesAction } = await import("../actions");

const G1 = "a1b2c3d4-1111-4a7b-8c9d-0e1f2a3b4c5d";
const G2 = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
const A1 = "b1b2c3d4-1111-4a7b-8c9d-0e1f2a3b4c5d";

const RESPUESTA = {
  simulado: true,
  quitar: false,
  aeronaves: [{ id: A1, matricula: "N4142R" }],
  gastos: [],
  totales: [],
  aplicados: 2,
  errores: 0,
};

const apiError = (statusCode: number, message: string, code = "ERROR", details?: unknown) =>
  new ApiError({ statusCode, code, message, details });

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("repartoIgualesAction", () => {
  it("POST con el cuerpo EXACTO (objeto, sin stringify) y no-store; vista previa con simular", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    const res = await repartoIgualesAction({ gasto_ids: [G1, G2], aeronave_ids: [A1], simular: true });
    expect(res).toEqual({ ok: true, data: RESPUESTA });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/expenses/reparto-iguales");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.body).toEqual({ gasto_ids: [G1, G2], aeronave_ids: [A1], simular: true });
    expect(typeof init.body).toBe("object");
  });

  it("aplicar: sin `simular` en el cuerpo; quitar: `aeronave_ids: []`", async () => {
    apiServer.mockResolvedValue({ ...RESPUESTA, simulado: false });
    await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] });
    expect(apiServer.mock.calls[0][1].body).toEqual({ gasto_ids: [G1], aeronave_ids: [A1] });
    apiServer.mockResolvedValue({ ...RESPUESTA, quitar: true, aeronaves: [] });
    await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [] });
    expect(apiServer.mock.calls[1][1].body).toEqual({ gasto_ids: [G1], aeronave_ids: [] });
  });

  it("NO revalida (el diálogo sigue abierto; refresca al cerrar)", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("datos inválidos NO salen a la red", async () => {
    expect(await repartoIgualesAction({ gasto_ids: [], aeronave_ids: [A1] })).toEqual({
      ok: false,
      error: MSG_SIN_PAGOS,
      code: "ENTRADA_INVALIDA",
      status: 400,
    });
    expect(await repartoIgualesAction({ gasto_ids: ["364"], aeronave_ids: [] })).toMatchObject({
      ok: false,
      error: MSG_IDS_INVALIDOS,
    });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("404 «Cannot POST» de un API previo ⇒ RUTA_NO_DISPONIBLE con texto en es-MX", async () => {
    apiServer.mockRejectedValue(apiError(404, "Cannot POST /v1/expenses/reparto-iguales", "NOT_FOUND"));
    const res = await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] });
    expect(res).toEqual({
      ok: false,
      error: MSG_REPARTO_RUTA_NO_DISPONIBLE,
      code: CODIGO_RUTA_NO_DISPONIBLE,
      status: 404,
    });
    expect(resultadoEsIncierto(res)).toBe(false);
  });

  it("400 del API (p. ej. AERONAVE_INACTIVA): su texto, code, status y details", async () => {
    apiServer.mockRejectedValue(
      apiError(400, "El avión XB-IJP no está activo.", "AERONAVE_INACTIVA", { aeronave_ids: [A1] }),
    );
    expect(await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] })).toEqual({
      ok: false,
      error: "El avión XB-IJP no está activo.",
      code: "AERONAVE_INACTIVA",
      status: 400,
      details: { aeronave_ids: [A1] },
    });
  });

  it("texto técnico ⇒ «El servidor no respondió»; un 5xx es incierto", async () => {
    apiServer.mockRejectedValue(apiError(502, "Bad Gateway"));
    const res = await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] });
    expect(res).toMatchObject({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO, status: 502 });
    expect(resultadoEsIncierto(res)).toBe(true);
  });

  it("un fallo que no es del API (red) NUNCA lanza ⇒ SIN_CONEXION (incierto)", async () => {
    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    const res = await repartoIgualesAction({ gasto_ids: [G1], aeronave_ids: [A1] });
    expect(res).toEqual({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO, code: CODIGO_SIN_CONEXION });
    expect(resultadoEsIncierto(res)).toBe(true);
  });
});
