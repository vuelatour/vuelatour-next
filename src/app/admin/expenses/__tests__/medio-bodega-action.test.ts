/**
 * Verificación del lote 2 (14-oct-2026): «Verificar / editar» de un gasto de
 * BODEGA (salida de inventario). El DTO del API no acepta BODEGA en el PATCH
 * (`UpdateGastoDto` hereda el `IsEnum(MedioPago)` del alta, sin BODEGA) y el
 * diálogo manda SIEMPRE el medio del formulario: en prod los 20 gastos BODEGA
 * no se podían verificar ni editar («medio_pago must be one of…»).
 *
 *  1. `verifyGastoAction` omite el medio que el API no acepta: el PATCH sale
 *     sin `medio_pago` y el API conserva el guardado.
 *  2. Un medio que sí acepta (el cambio deliberado de un gasto de bodega a
 *     efectivo, o cualquier gasto normal) viaja como siempre.
 *  3. El diálogo solo ofrece «Bodega (inventario)» a un gasto que ya lo es y
 *     la IA solo puede proponer un medio que el API acepta (cableado).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { verifyGastoAction } = await import("../actions");

const GASTO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("verifyGastoAction: el medio que el API no acepta no viaja", () => {
  it("gasto de BODEGA: el PATCH sale SIN medio_pago (el API conserva el guardado)", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    const res = await verifyGastoAction(GASTO, {
      categoria: "REFACCION",
      monto: "350",
      moneda: "USD",
      medio_pago: "BODEGA",
      tarjeta_terminacion: null,
      verificado: true,
    });
    expect(res.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/expenses/${GASTO}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toEqual({
      categoria: "REFACCION",
      monto: 350,
      moneda: "USD",
      tarjeta_terminacion: null,
      verificado: true,
    });
    expect(init.body).not.toHaveProperty("medio_pago");
  });

  it("un medio que el API sí acepta viaja como siempre (también al cambiar uno de bodega)", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    for (const medio of ["EFECTIVO", "DOMICILIADO", "TARJETA_CORP", "PAYWISE"]) {
      apiServer.mockClear();
      await verifyGastoAction(GASTO, { medio_pago: medio, verificado: true });
      expect(apiServer.mock.calls[0][1].body, medio).toEqual({ medio_pago: medio, verificado: true });
    }
  });

  it("sin medio en el formulario no se inventa ninguno", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    await verifyGastoAction(GASTO, { verificado: false });
    expect(apiServer.mock.calls[0][1].body).toEqual({ verificado: false });
  });
});

describe("cableado del diálogo «Verificar / editar»", () => {
  const fuente = readFileSync(
    path.resolve(__dirname, "../../../../components/admin/expenses/expense-verify-dialog.tsx"),
    "utf8",
  );

  it("las opciones del medio son POR GASTO (BODEGA solo si ya lo es)", () => {
    expect(fuente).toMatch(/options=\{opcionesMedioVerificacion\(gasto\.medio_pago\)\}/);
    expect(fuente).not.toMatch(/\bMEDIOS_VERIFICACION\b/);
    expect(fuente).not.toMatch(/options=\{MEDIOS\}/);
  });

  it("la IA solo propone un medio que el API acepta", () => {
    expect(fuente).toMatch(/medioPagoAceptadoPorApi\(ai\.medio_pago\)/);
  });
});
