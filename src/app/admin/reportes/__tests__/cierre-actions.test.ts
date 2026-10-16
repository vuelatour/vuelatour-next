/**
 * Actions del CIERRE DE MES (16-oct-2026, API 0.0.88; revisión adversaria):
 * `cerrarMesAction` y `reabrirMesAction` contra un `apiServer` simulado.
 * Reglas que prueban:
 *  - lo inválido (periodo, motivo) NO sale a la red;
 *  - el cuerpo es exactamente `{confirmar:true, vuelos_esperados}` /
 *    `{confirmar:true, motivo}` (el DTO del API exige `confirmar` booleano);
 *  - SOLO el éxito revalida (Reportes, balance en pantalla y reparto): un
 *    rechazo deja el diálogo montado para repintar la previa nueva;
 *  - el rechazo conserva `code`, `details` y `status` (PREVIA_CAMBIO trae la
 *    previa en `details`) y el `message` del API tal cual;
 *  - nunca lanzan (la red caída ⇒ `SIN_CONEXION`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { cerrarMesAction, reabrirMesAction, previaCierreAction } = await import("../actions");

const V316 = "0b6f5f4e-6a0e-4d0c-9a51-1d2c3b4a5e6f";
const V337 = "1c7a6b5d-7b1f-4e1d-8b62-2e3d4c5b6a7f";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("cerrarMesAction", () => {
  it("periodo inválido ⇒ error sin llamar al API ni revalidar", async () => {
    const r = await cerrarMesAction("2026-13", [V316]);
    expect(r.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("manda confirmar:true y los ids que el diálogo MOSTRÓ; el éxito revalida las 3 vistas", async () => {
    const data = { cierre: { periodo: "2026-09", estado: "CERRADO", version: 1 }, diferidos: [{ id: V316 }] };
    apiServer.mockResolvedValueOnce(data);
    const r = await cerrarMesAction("2026-09", [V316, V337]);
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer).toHaveBeenCalledWith("/v1/cierres/2026-09", {
      method: "POST",
      body: { confirmar: true, vuelos_esperados: [V316, V337] },
    });
    expect(r).toEqual({ ok: true, data });
    expect(revalidatePath.mock.calls.map((c) => c[0]).sort()).toEqual([
      "/admin/profit-sharing",
      "/admin/reportes",
      "/admin/reportes/balance",
    ]);
  });

  it("sin vuelos que pasen, igual manda la lista VACÍA (el API compara contra lo que hay hoy)", async () => {
    apiServer.mockResolvedValueOnce({ cierre: {}, diferidos: [] });
    await cerrarMesAction("2026-09", []);
    expect(apiServer.mock.calls[0][1].body).toEqual({ confirmar: true, vuelos_esperados: [] });
  });

  it("409 PREVIA_CAMBIO: conserva code/details/status y el message; NO revalida", async () => {
    const details = { previa: { periodo: "2026-09", listo: true, vuelos_que_pasan: [] } };
    apiServer.mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        code: "PREVIA_CAMBIO",
        message:
          "La lista de vuelos que pasan al mes siguiente cambió desde que abriste el diálogo: revísala y vuelve a confirmar.",
        details,
      }),
    );
    const r = await cerrarMesAction("2026-09", [V316]);
    expect(r).toEqual({
      ok: false,
      error:
        "La lista de vuelos que pasan al mes siguiente cambió desde que abriste el diálogo: revísala y vuelve a confirmar.",
      code: "PREVIA_CAMBIO",
      details,
      status: 409,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("la red caída ⇒ SIN_CONEXION (no lanza, no revalida)", async () => {
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    const r = await cerrarMesAction("2026-09", [V316]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("SIN_CONEXION");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("reabrirMesAction", () => {
  it("motivo corto (tras recortar) ⇒ error sin llamar al API", async () => {
    const r = await reabrirMesAction("2026-09", "  abc   ");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/al menos 5/);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("manda confirmar:true y el motivo recortado; el éxito revalida", async () => {
    apiServer.mockResolvedValueOnce({ cierre: { periodo: "2026-09", estado: "REABIERTO" }, revertidos: 5, no_revertidos: [] });
    const r = await reabrirMesAction("2026-09", "  Faltó un gasto de septiembre  ");
    expect(apiServer).toHaveBeenCalledWith("/v1/cierres/2026-09/reabrir", {
      method: "POST",
      body: { confirmar: true, motivo: "Faltó un gasto de septiembre" },
    });
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("409 MES_SIGUIENTE_CERRADO: el texto del API tal cual y sin revalidar", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        code: "MES_SIGUIENTE_CERRADO",
        message: "Octubre 2026 ya está cerrado: reábrelo primero.",
        details: { periodo_siguiente: "2026-10" },
      }),
    );
    const r = await reabrirMesAction("2026-09", "Corregir un cobro");
    expect(r).toMatchObject({ ok: false, code: "MES_SIGUIENTE_CERRADO", error: "Octubre 2026 ya está cerrado: reábrelo primero." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("previaCierreAction (skew)", () => {
  it("API 0.0.87 (404 «Cannot GET») ⇒ el texto de «necesita el API 0.0.88», nunca una previa vacía", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot GET /v1/cierres/2026-09/previa" }),
    );
    const r = await previaCierreAction("2026-09");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/API 0\.0\.88/);
  });

  it("API sin la migración (503 CIERRE_NO_DISPONIBLE) ⇒ su propio texto", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "CIERRE_NO_DISPONIBLE", message: "El cierre de mes no está disponible" }),
    );
    const r = await previaCierreAction("2026-09");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/base de datos/);
  });
});
