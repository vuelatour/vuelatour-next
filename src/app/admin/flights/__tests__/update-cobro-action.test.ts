/**
 * `updateCobroAction` («Corregir cobro», 26-sep-2026): el PATCH al API lleva
 * SOLO lo que cambió (nunca claves `undefined`), va a la ruta correcta, no
 * sale sin cambios ni con un id que no es uuid, revalida el vuelo Y la
 * cotización (misma fila) y nunca lanza: un rechazo del API vuelve con su
 * `code` para que el panel lo pinte en es-MX.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { updateCobroAction } = await import("../actions");

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
const COBRO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("updateCobroAction", () => {
  it("PATCH /v1/flights/cobros/:id con SOLO lo que cambió", async () => {
    apiServer.mockResolvedValue({ id: COBRO, monto: "62805.55" });
    const res = await updateCobroAction(VUELO, COBRO, {
      monto: 62805.55,
      fecha_cobro: "2026-09-17T03:30:00.000Z",
      moneda: undefined,
      referencia: null,
    });
    expect(res.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/flights/cobros/${COBRO}`);
    expect(init.method).toBe("PATCH");
    // `null` = vaciar (se manda); `undefined` = no cambió (no viaja).
    expect(init.body).toEqual({
      monto: 62805.55,
      fecha_cobro: "2026-09-17T03:30:00.000Z",
      referencia: null,
    });
    expect(Object.keys(init.body)).not.toContain("moneda");
  });

  it("de pesos a dólares: `tc_usd_mxn: null` SÍ viaja (quita el T.C.; el API lo acepta)", async () => {
    apiServer.mockResolvedValue({ id: COBRO });
    await updateCobroAction(VUELO, COBRO, { monto: 200, moneda: "USD", tc_usd_mxn: null });
    expect(apiServer.mock.calls[0][1].body).toEqual({ monto: 200, moneda: "USD", tc_usd_mxn: null });
  });

  it("revalida el vuelo y la cotización", async () => {
    apiServer.mockResolvedValue({ id: COBRO });
    await updateCobroAction(VUELO, COBRO, { notas: "ok" });
    const rutas = revalidatePath.mock.calls.map((c) => c[0]);
    expect(rutas).toEqual(
      expect.arrayContaining([
        "/admin/flights",
        `/admin/flights/${VUELO}`,
        "/admin/quotes",
        `/admin/quotes/${VUELO}`,
      ]),
    );
  });

  it("sin cambios o con un id que no es uuid: no llama al API", async () => {
    expect(await updateCobroAction(VUELO, COBRO, {})).toEqual({
      ok: false,
      error: "No hay cambios que guardar.",
    });
    expect(await updateCobroAction(VUELO, COBRO, { monto: undefined })).toMatchObject({ ok: false });
    expect(await updateCobroAction(VUELO, "c-1", { notas: "x" })).toEqual({
      ok: false,
      error: "No se reconoce el cobro. Recarga la página.",
    });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("rechazo del API: no lanza y devuelve code/detalles", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "COBRO_DE_ANTICIPO",
        message:
          "Este cobro salió del anticipo ING-12: para cambiar el monto, desaplícalo y vuelve a aplicarlo desde Ingresos → Anticipos.",
        details: { ingreso_id: "i-1", etiqueta: "ING-12" },
      }),
    );
    const res = await updateCobroAction(VUELO, COBRO, { monto: 1 });
    expect(res).toMatchObject({
      ok: false,
      code: "COBRO_DE_ANTICIPO",
      details: { etiqueta: "ING-12" },
    });
    expect(res.error).toContain("desaplícalo");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
