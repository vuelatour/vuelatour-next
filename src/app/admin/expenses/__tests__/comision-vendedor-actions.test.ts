/**
 * «Comisión del vendedor» (28-sep-2026) en las server actions de Gastos:
 *
 *  1. `buscarVuelosCercanosAction` sin `opts` pide la ventana de SIEMPRE
 *     (±15 días, 100 vuelos: Paywise y demás llamadas sin cambio); con la
 *     ventana de la comisión pide 90 días atrás, 15 adelante y 500 vuelos
 *     (el tope del API). El argumento viene del cliente ⇒ se acota.
 *  2. `createGastoAction` manda la categoría y el vuelo al API y refresca
 *     también el detalle del vuelo (alta desde «Gastos del vuelo»).
 *  3. `verifyGastoAction` manda categoría + vuelo en el MISMO PATCH.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { VENTANA_VUELOS_COMISION } from "@/lib/admin/categorias-gasto";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { buscarVuelosCercanosAction, createGastoAction, verifyGastoAction } = await import(
  "../actions"
);

const VUELO = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const GASTO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("buscarVuelosCercanosAction", () => {
  it("sin opts: la ventana de siempre (±15 días, 100 vuelos)", async () => {
    apiServer.mockResolvedValue({ data: [] });
    await buscarVuelosCercanosAction("2026-09-28");
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/flights");
    expect(init.searchParams).toEqual({ desde: "2026-09-13", hasta: "2026-10-13", limit: 100 });
  });

  it("comisión del vendedor: 90 días atrás, 15 adelante, 500 vuelos", async () => {
    apiServer.mockResolvedValue({ data: [] });
    await buscarVuelosCercanosAction("2026-09-28", VENTANA_VUELOS_COMISION);
    expect(apiServer.mock.calls[0][1].searchParams).toEqual({
      desde: "2026-06-30",
      hasta: "2026-10-13",
      limit: 500,
    });
  });

  it("el argumento del cliente se acota (limit ≤ 500, días 0–366, enteros)", async () => {
    apiServer.mockResolvedValue({ data: [] });
    await buscarVuelosCercanosAction("2026-09-28", {
      diasAtras: 5000,
      diasAdelante: -3,
      limit: 99999,
    });
    const sp = apiServer.mock.calls[0][1].searchParams;
    expect(sp.limit).toBe(500);
    expect(sp.hasta).toBe("2026-09-28");
    expect(sp.desde).toBe("2025-09-27");
    apiServer.mockClear();
    await buscarVuelosCercanosAction("2026-09-28", {
      diasAtras: Number.NaN,
      limit: 7.9,
    });
    expect(apiServer.mock.calls[0][1].searchParams).toEqual({
      desde: "2026-09-13",
      hasta: "2026-10-13",
      limit: 7,
    });
  });

  it("mapea la lista y deja los cancelados al final", async () => {
    apiServer.mockResolvedValue({
      data: [
        {
          id: "a",
          folio: 317,
          estado: "CANCELADO",
          aeronave_id: "av",
          aeronave_matricula: "N4142R",
          origen_iata: "CUN",
          destino_iata: "MID",
          fecha_vuelo: "2026-09-20",
        },
        {
          id: "b",
          folio: 318,
          estado: "COMPLETADO",
          aeronave_id: "av",
          aeronave_matricula: "N4142R",
          origen_iata: "CUN",
          destino_iata: "CUN",
          ruta_iatas: ["CUN", "MID", "CUN"],
          fecha_vuelo: "2026-09-21",
        },
      ],
    });
    const res = await buscarVuelosCercanosAction("2026-09-28", VENTANA_VUELOS_COMISION);
    expect(res.ok).toBe(true);
    expect(res.data?.map((v) => v.id)).toEqual(["b", "a"]);
    expect(res.data?.[0].ruta).toBe("CUN→MID→CUN");
  });
});

describe("createGastoAction con «Comisión del vendedor»", () => {
  it("POST con categoría y vuelo; refresca Gastos y el detalle del vuelo", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    const res = await createGastoAction({
      categoria: "COMISION_VENDEDOR",
      monto: 2030,
      moneda: "MXN",
      fecha_gasto: "2026-09-28",
      medio_pago: "TRANSFERENCIA",
      vuelo_id: VUELO,
      aeronave_id: "",
      proveedor_id: "",
      notas: "",
    });
    expect(res.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/expenses");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({
      categoria: "COMISION_VENDEDOR",
      monto: 2030,
      moneda: "MXN",
      fecha_gasto: "2026-09-28",
      medio_pago: "TRANSFERENCIA",
      vuelo_id: VUELO,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/expenses");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/flights", "layout");
  });

  it("el 400 GASTO_REQUIERE_VUELO del API llega tal cual al toast", async () => {
    const msg =
      "Esta categoría es del vuelo: elige el vuelo. «Comisión del vendedor» siempre se registra con el vuelo al que pertenece.";
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "GASTO_REQUIERE_VUELO", message: msg }),
    );
    const res = await createGastoAction({
      categoria: "COMISION_VENDEDOR",
      monto: 2030,
      moneda: "MXN",
      fecha_gasto: "2026-09-28",
      medio_pago: "TRANSFERENCIA",
    });
    expect(res).toEqual({ ok: false, error: msg });
  });
});

describe("verifyGastoAction: reclasificar a comisión", () => {
  it("categoría y vuelo viajan en el MISMO PATCH", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    const res = await verifyGastoAction(GASTO, {
      categoria: "COMISION_VENDEDOR",
      vuelo_id: VUELO,
      verificado: true,
    });
    expect(res.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/expenses/${GASTO}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toEqual({
      categoria: "COMISION_VENDEDOR",
      vuelo_id: VUELO,
      verificado: true,
    });
  });
});
