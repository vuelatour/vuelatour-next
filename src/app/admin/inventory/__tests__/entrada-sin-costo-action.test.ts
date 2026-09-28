/**
 * Entrada inicial SIN costo (28-sep-2026): el movimiento que arma
 * `decidirEntradaInicial` (USD 0) llega al API TAL CUAL por
 * `createMovimientoAction`. El riesgo: que el esquema o `stripEmpty` se coman
 * el 0 (el API respondería 400 «costo_unitario_usd es requerido») o que se
 * cuele un T.C./costo en pesos. El API acepta el 0 (`@Min(0)`, CHECK `>= 0`
 * en BD) y lo lista en `sin_costo=true`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decidirEntradaInicial } from "@/lib/admin/inventario-entrada-inicial";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { createMovimientoAction } = await import("../actions");

const ITEM = "3f2c1b0a-1111-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
  apiServer.mockResolvedValue({ id: "m1" });
});

describe("createMovimientoAction · entrada inicial", () => {
  it("costo PENDIENTE ⇒ POST con moneda USD y costo_unitario_usd 0 (sin pesos ni T.C.)", async () => {
    const d = decidirEntradaInicial({ cantidad: "12", costo: "", moneda: "MXN", tc: "17.5" });
    if (d.tipo !== "COSTO_PENDIENTE") throw new Error("se esperaba COSTO_PENDIENTE");
    const res = await createMovimientoAction(ITEM, {
      ...d.movimiento,
      fecha_movimiento: "2026-09-28",
      notas: "Stock inicial (alta del ítem)",
    });
    expect(res.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/inventory/items/${ITEM}/movimientos`);
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({
      tipo: "ENTRADA",
      cantidad: 12,
      moneda: "USD",
      costo_unitario_usd: 0,
      fecha_movimiento: "2026-09-28",
      notas: "Stock inicial (alta del ítem)",
    });
    expect(init.body).not.toHaveProperty("tc_usd_mxn");
    expect(init.body).not.toHaveProperty("costo_unitario_mxn");
  });

  it("costo > 0 en MXN ⇒ el cuerpo de siempre (pesos + T.C.)", async () => {
    const d = decidirEntradaInicial({ cantidad: "6", costo: "350", moneda: "MXN", tc: "17.5" });
    if (d.tipo !== "CON_COSTO") throw new Error("se esperaba CON_COSTO");
    await createMovimientoAction(ITEM, { ...d.movimiento, fecha_movimiento: "2026-09-28" });
    expect(apiServer.mock.calls[0][1].body).toEqual({
      tipo: "ENTRADA",
      cantidad: 6,
      moneda: "MXN",
      costo_unitario_mxn: 350,
      tc_usd_mxn: 17.5,
      fecha_movimiento: "2026-09-28",
    });
  });

  it("costo > 0 en USD ⇒ costo_unitario_usd con su número", async () => {
    const d = decidirEntradaInicial({ cantidad: "30", costo: "110", moneda: "USD" });
    if (d.tipo !== "CON_COSTO") throw new Error("se esperaba CON_COSTO");
    await createMovimientoAction(ITEM, d.movimiento);
    expect(apiServer.mock.calls[0][1].body).toEqual({
      tipo: "ENTRADA",
      cantidad: 30,
      moneda: "USD",
      costo_unitario_usd: 110,
    });
  });
});

describe("createMovimientoAction · «Registrar movimiento» → ENTRADA con el costo pendiente", () => {
  it("el cuerpo que arma el diálogo tras confirmar llega como USD 0, sin pesos ni T.C. (aunque se hayan tecleado)", async () => {
    // Lo que `movimiento-dialog.tsx` guarda en `sinCosto.cuerpo`: el
    // formulario completo (defaults) + el reemplazo de la rama PENDIENTE.
    const cuerpo = {
      tipo: "ENTRADA",
      cantidad: "4",
      empaque_id: "",
      cantidad_empaques: "",
      para_flota: false,
      aeronave_id: "",
      proveedor_id: "",
      fecha_movimiento: "",
      referencia: "",
      notas: "",
      // Rama PENDIENTE (antes venía moneda MXN, «0» en pesos y un T.C.).
      moneda: "USD",
      costo_unitario_usd: 0,
      costo_unitario_mxn: "",
      tc_usd_mxn: undefined,
    };
    const res = await createMovimientoAction(ITEM, cuerpo);
    expect(res.ok).toBe(true);
    const body = apiServer.mock.calls[0][1].body;
    expect(body).toMatchObject({ tipo: "ENTRADA", cantidad: 4, moneda: "USD", costo_unitario_usd: 0 });
    expect(body).not.toHaveProperty("costo_unitario_mxn");
    expect(body).not.toHaveProperty("tc_usd_mxn");
  });
});
