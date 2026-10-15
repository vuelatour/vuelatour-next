/**
 * «¿Qué hacer?» de una entrada SIN la pestaña «Omitidos» en Conciliación (un
 * panel sin el 0.0.77): la causa y el enlace «Ver los omitidos de esas
 * fechas» NO se ofrecen. Se lee `FILTROS_CONCILIACION` de
 * `lib/admin/conciliacion-vista.ts` (la homónima de Ingresos es otra cosa).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/conciliacion-vista", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/conciliacion-vista")>()),
  FILTROS_CONCILIACION: ["todos", "pendientes", "conciliados", "sin_banco", "cobros_sin_banco", "paywise"],
}));

const { accionesPendienteEntrada } = await import("@/lib/admin/entrada-banco");
const { respuesta223, respuestaIng3, ULTIMOS_PROD } = await import("./entrada-banco.fixtures");

describe("sin la pestaña «Omitidos»", () => {
  it("ni la causa ni el enlace (cobro e ingreso)", () => {
    const cobro = accionesPendienteEntrada(respuesta223(), "2026-10-15")!;
    expect(cobro.causas.some((c) => c.includes("omitido"))).toBe(false);
    expect(cobro.enlaces.some((l) => l.href.includes("f=omitidos"))).toBe(false);
    const ingreso = accionesPendienteEntrada(
      { ...respuestaIng3(), estado: "SIN_CONCILIAR", via: null, abonos: [], ultimos_movimientos: ULTIMOS_PROD },
      "2026-10-15",
    )!;
    expect(ingreso.causas.some((c) => c.includes("omitido"))).toBe(false);
  });
});
