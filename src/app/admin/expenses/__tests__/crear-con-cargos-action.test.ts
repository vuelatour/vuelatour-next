/**
 * «Créalo por la suma» en la server action del alta (14-oct-2026, API 0.0.77,
 * invariante 76 del API): `createGastoAction` con `conciliar_con_movimientos`
 * (2..50) + `client_request_id`.
 *
 *  1. El schema deja pasar las dos llaves con los textos del DTO del API (y
 *     exige la llave con los cargos); sin ellas, el alta de siempre.
 *  2. El POST lleva las dos llaves; con ellas la action NO revalida (la llama
 *     un diálogo de Conciliación que sigue abierto: hace UN router.refresh() al
 *     cerrar) y el fallo conserva code/status/details.
 *  3. Sin la llave, la action es la de SIEMPRE: revalida lo mismo y su fallo
 *     sigue siendo `{ ok: false, error }`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { GastoCreateSchema } from "../schema";
import {
  MSG_CARGO_INVALIDO,
  MSG_LLAVE_CAPTURA_REQUERIDA,
  MSG_LOTE_CARGOS_INVALIDO,
} from "@/lib/admin/conciliacion-cargos-gasto";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { createGastoAction } = await import("../actions");

/** HSBC Pesos 30-sep (prod): 2f95e45b $649.00 + 61baed07 $103.84 = $752.84. */
const RENTA = "2f95e45b-0000-4000-8000-000000000649";
const IVA = "61baed07-0000-4000-8000-000000000103";
const LLAVE = "9b2c7a10-1d2e-4f30-8a4b-5c6d7e8f9a0b";
const GASTO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";
const AVION = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";

const base = {
  categoria: "OPERACIONES",
  monto: 752.84,
  moneda: "MXN",
  fecha_gasto: "2026-09-30",
  medio_pago: "TRANSFERENCIA",
  notas: "Pagado en 2 cargos del banco (HSBC Pesos): 30-sep C ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84",
};
const conCargos = { ...base, conciliar_con_movimientos: [RENTA, IVA], client_request_id: LLAVE };

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("schema del alta: las dos llaves del alta por la suma", () => {
  const errores = (raw: unknown) => {
    const r = GastoCreateSchema.safeParse(raw);
    return r.success ? null : r.error.flatten().fieldErrors;
  };

  it("pasan tal cual (2..50 cargos sin repetir + la llave); sin ellas, el alta de siempre", () => {
    const r = GastoCreateSchema.safeParse(conCargos);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.conciliar_con_movimientos).toEqual([RENTA, IVA]);
      expect(r.data.client_request_id).toBe(LLAVE);
    }
    const normal = GastoCreateSchema.safeParse(base);
    expect(normal.success).toBe(true);
    if (normal.success) {
      expect(normal.data).not.toHaveProperty("conciliar_con_movimientos");
      expect(normal.data).not.toHaveProperty("client_request_id");
    }
    // La llave sola (idempotencia del alta de siempre) también se acepta.
    expect(GastoCreateSchema.safeParse({ ...base, client_request_id: LLAVE }).success).toBe(true);
    const cincuenta = Array.from({ length: 50 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(GastoCreateSchema.safeParse({ ...conCargos, conciliar_con_movimientos: cincuenta }).success).toBe(true);
  });

  it("con los cargos la llave es OBLIGATORIA (el texto del 400 del API)", () => {
    expect(errores({ ...base, conciliar_con_movimientos: [RENTA, IVA] })).toEqual({
      client_request_id: [MSG_LLAVE_CAPTURA_REQUERIDA],
    });
    expect(errores({ ...conCargos, client_request_id: "no-es-uuid" })).toEqual({
      client_request_id: [MSG_LLAVE_CAPTURA_REQUERIDA],
    });
  });

  it("uno solo, más de 50, repetidos (sin distinguir mayúsculas) o un id que no es uuid ⇒ los textos del DTO", () => {
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    for (const ids of [[RENTA], cincuentaYUno, [RENTA, RENTA.toUpperCase()]]) {
      expect(errores({ ...conCargos, conciliar_con_movimientos: ids })).toEqual({
        conciliar_con_movimientos: [MSG_LOTE_CARGOS_INVALIDO],
      });
    }
    expect(errores({ ...conCargos, conciliar_con_movimientos: [RENTA, "nada"] })?.conciliar_con_movimientos).toEqual([
      MSG_CARGO_INVALIDO,
    ]);
  });
});

describe("createGastoAction con los cargos («Créalo por la suma»)", () => {
  it("POST con las dos llaves y SIN revalidar (quien la llama hace UN router.refresh() al cerrar)", async () => {
    apiServer.mockResolvedValue({ id: GASTO, conciliacion: { movimiento_ids: [RENTA, IVA] } });
    const res = await createGastoAction({ ...conCargos, aeronave_id: "", vuelo_id: "", proveedor_id: "" });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: GASTO, conciliacion: { movimiento_ids: [RENTA, IVA] } });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/expenses");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({
      ...base,
      conciliar_con_movimientos: [RENTA, IVA],
      client_request_id: LLAVE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("con reparto entre aviones: el PUT de siempre, tampoco revalida", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO }).mockResolvedValueOnce({ items: [] });
    const res = await createGastoAction({ ...conCargos, categoria: "OTRO" }, [{ aeronave_id: AVION, monto: 752.84 }]);
    expect(res).toEqual({ ok: true, data: { id: GASTO } });
    expect(apiServer.mock.calls[1][0]).toBe(`/v1/expenses/${GASTO}/reparto`);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("el fallo del API conserva code, status y details (el diálogo decide el texto)", async () => {
    const msg =
      "No se registró el gasto: 1 de los 2 cargos ya no está pendiente — 30 sep · I.V.A. $103.84 (ya está vinculado a un gasto). Cancela, quita esos cargos de la selección y vuelve a intentarlo.";
    const details = { movimientos: [{ id: IVA, estado: "CON_GASTO" }], compensado: true };
    apiServer.mockRejectedValue(new ApiError({ statusCode: 409, code: "MOVIMIENTO_NO_PENDIENTE", message: msg, details }));
    expect(await createGastoAction(conCargos)).toEqual({
      ok: false,
      error: msg,
      code: "MOVIMIENTO_NO_PENDIENTE",
      status: 409,
      details,
    });
    const sinVincular =
      "El gasto se registró pero NO quedó vinculado a los cargos: vuelve a pulsar «Guardar» para reintentar la liga (no se duplica) o cancela y vincúlalo con «Vincular a un gasto».";
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 500, code: "GASTO_SIN_VINCULAR", message: sinVincular, details: { gasto_id: GASTO } }),
    );
    expect(await createGastoAction(conCargos)).toMatchObject({ ok: false, code: "GASTO_SIN_VINCULAR", status: 500 });
  });

  it("sin respuesta del API (red): sin status ⇒ el diálogo lo trata como incierto; nunca lanza", async () => {
    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    const res = await createGastoAction(conCargos);
    expect(res).toEqual({ ok: false, error: "fetch failed" });
    expect(res.status).toBeUndefined();
  });

  it("el schema rechaza ANTES de la red", async () => {
    const res = await createGastoAction({ ...base, conciliar_con_movimientos: [RENTA, IVA] });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.client_request_id).toEqual([MSG_LLAVE_CAPTURA_REQUERIDA]);
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("createGastoAction SIN los cargos: la de siempre", () => {
  it("revalida Gastos, Caja chica, Gastos personales y el vuelo; con reparto también Otros gastos", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO }).mockResolvedValueOnce({ items: [] });
    await createGastoAction({ ...base, categoria: "OTRO" }, [{ aeronave_id: AVION, monto: 100 }]);
    expect(revalidatePath.mock.calls).toEqual([
      ["/admin/otros-gastos"],
      ["/admin/expenses"],
      ["/admin/caja-chica", "layout"],
      ["/admin/gastos-personales"],
      ["/admin/flights", "layout"],
    ]);
    expect(apiServer.mock.calls[0][1].body).not.toHaveProperty("conciliar_con_movimientos");
  });

  it("el fallo sigue siendo `{ ok: false, error }` (sin code ni status)", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 409, code: "FOLIO_DUPLICADO", message: "Ya existe un gasto con el folio 2622242310." }),
    );
    expect(await createGastoAction(base)).toEqual({ ok: false, error: "Ya existe un gasto con el folio 2622242310." });
  });
});
