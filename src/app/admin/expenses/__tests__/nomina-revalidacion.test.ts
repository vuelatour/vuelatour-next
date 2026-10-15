/**
 * Nómina: un espacio propio (15-oct-2026). La pantalla monta la MISMA tabla
 * de Gastos (alta, «Verificar / editar», «Repartir entre aviones»,
 * «Eliminar»), así que las server actions que ya revalidaban «Otros gastos»
 * —y el alta y la baja que su pantalla ofrece— revalidan también
 * `/admin/nomina`: tras guardar, la pantalla no se queda vieja. Prueba de
 * COMPORTAMIENTO con `apiServer` y `revalidatePath` simulados (las listas
 * exactas de rutas las congelan `gasto-con-reparto-action.test.ts` y
 * `crear-con-cargos-action.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { createGastoAction, deleteGastoAction, saveRepartoAction, saveRepartoMasivoAction, verifyGastoAction } =
  await import("../actions");

const GASTO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";
const N4142R = "5a82eb4a-086c-4058-97bd-b2aacdc2e942";
const N621TX = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";
const NOMINA = "/admin/nomina";

const rutas = () => revalidatePath.mock.calls.map((c) => c.join(" "));

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("las actions que la tabla de Nómina usa la revalidan", () => {
  it("«Registrar pago de nómina» (createGastoAction): junto a Gastos y Gastos personales", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO });
    const r = await createGastoAction({
      categoria: "NOMINA",
      monto: 6830,
      moneda: "MXN",
      fecha_gasto: "2026-10-15",
      medio_pago: "TRANSFERENCIA",
      notas: "Sueldo · persona 1 · 1a oct",
    });
    expect(r.ok).toBe(true);
    expect(apiServer.mock.calls[0][1].body).toMatchObject({ categoria: "NOMINA", medio_pago: "TRANSFERENCIA" });
    expect(rutas()).toEqual(expect.arrayContaining(["/admin/expenses", "/admin/gastos-personales", NOMINA]));
  });

  it("«Verificar / editar» (verifyGastoAction): con Otros gastos", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO });
    await verifyGastoAction(GASTO, { categoria: "NOMINA", verificado: true });
    expect(rutas()).toEqual(expect.arrayContaining(["/admin/otros-gastos", NOMINA]));
  });

  it("«Repartir entre aviones» (saveRepartoAction y el masivo de Otros gastos)", async () => {
    apiServer.mockResolvedValueOnce({ items: [] });
    await saveRepartoAction(GASTO, [
      { aeronave_id: N4142R, monto: 3415 },
      { aeronave_id: N621TX, monto: 3415 },
    ]);
    expect(rutas()).toEqual(expect.arrayContaining(["/admin/otros-gastos", NOMINA]));
    revalidatePath.mockReset();
    apiServer.mockResolvedValueOnce({ exitos: [], errores: [] });
    await saveRepartoMasivoAction([GASTO], [
      { aeronave_id: N4142R, porcentaje: 50 },
      { aeronave_id: N621TX, porcentaje: 50 },
    ]);
    expect(rutas()).toEqual(expect.arrayContaining(["/admin/otros-gastos", NOMINA]));
  });

  it("«Eliminar» (deleteGastoAction)", async () => {
    apiServer.mockResolvedValueOnce(undefined);
    const r = await deleteGastoAction(GASTO);
    expect(r).toEqual({ ok: true });
    expect(rutas()).toContain(NOMINA);
  });

  it("si el API rechaza, no se revalida nada (tampoco Nómina)", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "GASTO_CONCILIADO", message: "El gasto está conciliado." }),
    );
    const r = await deleteGastoAction(GASTO);
    expect(r).toEqual({ ok: false, error: "El gasto está conciliado." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
