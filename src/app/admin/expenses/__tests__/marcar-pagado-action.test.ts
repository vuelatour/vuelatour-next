/**
 * «Marcar pagado» (19-oct-2026, API 0.0.95, gastos «por pagar»):
 * `marcarPagadoGastoAction` manda EXACTO `PATCH /v1/expenses/:id {por_pagar:
 * false, fecha_gasto, if_updated_at}`, valida ANTES de la red (uuid y fecha
 * ≤ hoy Cancún), revalida lo mismo que «Verificar / editar» SOLO en el
 * éxito, conserva code/status/details de un rechazo (409 CONFLICTO_VERSION,
 * 400 POR_PAGAR_FECHA_FUTURA, 503 POR_PAGAR_NO_DISPONIBLE, MES_CERRADO) y
 * nunca lanza (sin respuesta ⇒ `SIN_CONEXION`).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

// «Hoy» Cancún = 19-oct-2026 (12:00 hora Cancún).
vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
afterAll(() => vi.useRealTimers());

const { marcarPagadoGastoAction } = await import("../actions");

const G = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";
const rutas = () => revalidatePath.mock.calls.map((c) => c.join(" "));

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("marcarPagadoGastoAction", () => {
  it("PATCH exacto con el control de versión y revalida las pantallas de gastos", async () => {
    apiServer.mockResolvedValueOnce({ id: G, por_pagar: false, estado_pago: "PAGADO" });
    const r = await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19", if_updated_at: "2026-10-18T22:10:00.123Z" });
    expect(r).toMatchObject({ ok: true, data: { id: G, estado_pago: "PAGADO" } });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, opts] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/expenses/${G}`);
    expect(opts.method).toBe("PATCH");
    // Objeto (apiFetch serializa): nunca un JSON.stringify.
    expect(opts.body).toEqual({ por_pagar: false, fecha_gasto: "2026-10-19", if_updated_at: "2026-10-18T22:10:00.123Z" });
    expect(rutas()).toEqual(
      expect.arrayContaining(["/admin/expenses", "/admin/nomina", "/admin/combustibles", "/admin/caja-chica layout", "/admin/flights layout"]),
    );
  });

  it("sin `updated_at` conocido: sin `if_updated_at`; una fecha pasada vale", async () => {
    apiServer.mockResolvedValueOnce({ id: G });
    await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-15", if_updated_at: null });
    expect(apiServer.mock.calls[0][1].body).toEqual({ por_pagar: false, fecha_gasto: "2026-10-15" });
  });

  it("no sale nada a la red con un id inválido ni con una fecha futura o ilegible", async () => {
    expect(await marcarPagadoGastoAction("nope", { fecha_gasto: "2026-10-19" })).toMatchObject({
      ok: false,
      code: "ENTRADA_INVALIDA",
      status: 400,
    });
    const futura = await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-20" });
    expect(futura).toMatchObject({ ok: false, code: "ENTRADA_INVALIDA" });
    expect(futura.error).toMatch(/después de hoy/);
    expect(await marcarPagadoGastoAction(G, { fecha_gasto: "" })).toMatchObject({ ok: false, error: "Elige la fecha del pago." });
    expect(apiServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un rechazo conserva code/status/details y el texto del API; no revalida", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "CONFLICTO_VERSION", message: "Alguien modificó el gasto antes que tú.", details: { vigente: { id: G } } }),
    );
    expect(await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19" })).toEqual({
      ok: false,
      error: "Alguien modificó el gasto antes que tú.",
      code: "CONFLICTO_VERSION",
      status: 409,
      details: { vigente: { id: G } },
    });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "POR_PAGAR_NO_DISPONIBLE", message: "Los gastos por pagar todavía no están activos: avisa a sistemas." }),
    );
    expect(await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19" })).toMatchObject({
      ok: false,
      code: "POR_PAGAR_NO_DISPONIBLE",
      status: 503,
      error: "Los gastos por pagar todavía no están activos: avisa a sistemas.",
    });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "MES_CERRADO", message: "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.", details: { periodo: "2026-09" } }),
    );
    expect(await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19" })).toMatchObject({
      ok: false,
      code: "MES_CERRADO",
      details: { periodo: "2026-09" },
    });
    // 403 del RolesGuard (inglés) ⇒ español.
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Required role: ADMIN. Current: SOCIO" }));
    expect((await marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19" })).error).toBe(
      "Tu rol no tiene permiso para esta acción. Pide a un administrador que la haga.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sin respuesta del API: nunca lanza (`SIN_CONEXION`)", async () => {
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(marcarPagadoGastoAction(G, { fecha_gasto: "2026-10-19" })).resolves.toMatchObject({
      ok: false,
      code: "SIN_CONEXION",
    });
  });
});
