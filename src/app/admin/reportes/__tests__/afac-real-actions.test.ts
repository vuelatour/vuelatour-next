/**
 * Actions del COSTO REAL AFAC por vuelo (16-oct-2026, API 0.0.89, invariante
 * 90 del API) contra un `apiServer` simulado:
 *  - lo inválido (vuelo que no es uuid, monto negativo / con 3 decimales /
 *    no numérico) NO sale a la red;
 *  - PUT `/v1/flights/:id/afac-real` con el cuerpo EXACTO `{costo_real_mxn}`
 *    (las notas no viajan: el API conserva las que haya) y DELETE sin cuerpo;
 *  - NINGUNA revalida (decisión D10: el libro enseña lo tecleado y pide UN
 *    refresco 15 s después del último guardado);
 *  - el rechazo conserva `code`, `details` y `status` (409 `MES_CERRADO`) y
 *    el `message` del API tal cual; nunca lanzan (red caída ⇒ `SIN_CONEXION`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_MONTO_AFAC_DECIMALES, MSG_MONTO_AFAC_NEGATIVO } from "@/lib/admin/libro-afac";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { guardarCostoRealAfacAction, quitarCostoRealAfacAction } = await import("../actions");

const V236 = "5e2a0f36-0000-4000-8000-000000000236";
const RESPUESTA = {
  vuelo_id: V236,
  folio: 236,
  costo_real_mxn: 4500,
  notas: null,
  capturado_por: { id: "u-ale", nombre: "Ale" },
  capturado_at: "2026-10-16T19:05:00Z",
  updated_at: "2026-10-16T19:05:00Z",
  mes_contable: "2026-09",
  sin_cambios: false,
};

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("guardarCostoRealAfacAction (PUT)", () => {
  it("vuelo o monto inválidos ⇒ error sin llamar al API", async () => {
    expect((await guardarCostoRealAfacAction({ vueloId: "236", monto: 4500 })).ok).toBe(false);
    expect(await guardarCostoRealAfacAction({ vueloId: V236, monto: -1 })).toEqual({
      ok: false,
      error: MSG_MONTO_AFAC_NEGATIVO,
    });
    expect(await guardarCostoRealAfacAction({ vueloId: V236, monto: 4427.805 })).toEqual({
      ok: false,
      error: MSG_MONTO_AFAC_DECIMALES,
    });
    expect((await guardarCostoRealAfacAction({ vueloId: V236, monto: Number.NaN })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("PUT con el cuerpo EXACTO {costo_real_mxn} y SIN revalidar", async () => {
    apiServer.mockResolvedValueOnce(RESPUESTA);
    const r = await guardarCostoRealAfacAction({ vueloId: V236, monto: 4500 });
    expect(apiServer).toHaveBeenCalledWith(`/v1/flights/${V236}/afac-real`, {
      method: "PUT",
      body: { costo_real_mxn: 4500 },
    });
    expect(r).toEqual({ ok: true, data: RESPUESTA });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("0 es un monto válido (AFAC no cobró)", async () => {
    apiServer.mockResolvedValueOnce({ ...RESPUESTA, costo_real_mxn: 0 });
    await guardarCostoRealAfacAction({ vueloId: V236, monto: 0 });
    expect(apiServer.mock.calls[0][1].body).toEqual({ costo_real_mxn: 0 });
  });

  it("409 MES_CERRADO: conserva code/details/status y el texto del API; no revalida", async () => {
    const texto = "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.";
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "MES_CERRADO", message: texto, details: { periodo: "2026-09" } }),
    );
    const r = await guardarCostoRealAfacAction({ vueloId: V236, monto: 4500 });
    expect(r).toEqual({ ok: false, error: texto, code: "MES_CERRADO", details: { periodo: "2026-09" }, status: 409 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("la red caída ⇒ SIN_CONEXION (nunca lanza)", async () => {
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    const r = await guardarCostoRealAfacAction({ vueloId: V236, monto: 4500 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("SIN_CONEXION");
  });
});

describe("quitarCostoRealAfacAction (DELETE)", () => {
  it("vuelo inválido ⇒ error sin llamar al API", async () => {
    expect((await quitarCostoRealAfacAction({ vueloId: "x" })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("DELETE sin cuerpo y SIN revalidar", async () => {
    apiServer.mockResolvedValueOnce({ ...RESPUESTA, costo_real_mxn: null, capturado_por: null, capturado_at: null });
    const r = await quitarCostoRealAfacAction({ vueloId: V236 });
    expect(apiServer).toHaveBeenCalledWith(`/v1/flights/${V236}/afac-real`, { method: "DELETE" });
    expect(r.ok).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un rechazo conserva el código del API", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "AFAC_REAL_NO_DISPONIBLE", message: "El costo real AFAC todavía no está habilitado…" }),
    );
    const r = await quitarCostoRealAfacAction({ vueloId: V236 });
    expect(r).toMatchObject({ ok: false, code: "AFAC_REAL_NO_DISPONIBLE", status: 503 });
  });
});
