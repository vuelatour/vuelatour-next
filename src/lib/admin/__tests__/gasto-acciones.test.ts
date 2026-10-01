/**
 * Menú ⋯ de un gasto (1-oct-2026): quién ve «Eliminar» y «Dar visto bueno»
 * (espejo de los `@Roles` del API), el nombre accesible del botón y el 403
 * por rol en español. Combustibles lo ven ADMIN, COORDINADOR y FACTURACION;
 * a FACTURACION le salía «Required role: … Current: FACTURACION» al eliminar.
 */
import { describe, expect, it } from "vitest";
import {
  ROLES_ELIMINAN_GASTO,
  ROLES_VISTO_BUENO_GASTO,
  TEXTO_SIN_PERMISO_GASTO,
  etiquetaAccionesGasto,
  mensajeErrorAccionGasto,
  puedeDarVistoBuenoGasto,
  puedeEliminarGasto,
} from "../gasto-acciones";

describe("roles del menú ⋯ (espejo del API)", () => {
  it("DELETE /v1/expenses/:id y POST :id/visto-bueno", () => {
    expect(ROLES_ELIMINAN_GASTO).toEqual(["ADMIN", "COORDINADOR", "PILOTO", "MECANICO", "VISITANTE"]);
    expect(ROLES_VISTO_BUENO_GASTO).toEqual(["ADMIN", "FACTURACION", "ANALISTA"]);
  });

  it("los roles de oficina que ven Combustibles", () => {
    expect(puedeEliminarGasto("ADMIN")).toBe(true);
    expect(puedeEliminarGasto("COORDINADOR")).toBe(true);
    expect(puedeEliminarGasto("FACTURACION")).toBe(false);
    expect(puedeDarVistoBuenoGasto("ADMIN")).toBe(true);
    expect(puedeDarVistoBuenoGasto("FACTURACION")).toBe(true);
    expect(puedeDarVistoBuenoGasto("COORDINADOR")).toBe(false);
  });

  it("sin rol conocido no se esconde nada (el API sigue siendo el candado)", () => {
    for (const r of [null, undefined, ""]) {
      expect(puedeEliminarGasto(r)).toBe(true);
      expect(puedeDarVistoBuenoGasto(r)).toBe(true);
    }
  });
});

describe("nombre accesible del botón ⋯", () => {
  it("dice de QUÉ gasto son las acciones", () => {
    expect(
      etiquetaAccionesGasto({ monto: "4250.5", moneda: "MXN", fecha_gasto: "2026-10-01" }),
    ).toBe("Acciones del gasto de $4,250.50 MXN del 01 oct 2026");
    expect(etiquetaAccionesGasto({ monto: null, moneda: null, fecha_gasto: null })).toBe(
      "Acciones del gasto",
    );
  });
});

describe("403 por rol en español", () => {
  it("el mensaje del RolesGuard se traduce; los demás pasan tal cual", () => {
    expect(
      mensajeErrorAccionGasto(
        403,
        "Required role: ADMIN | COORDINADOR | PILOTO | MECANICO | VISITANTE. Current: FACTURACION",
      ),
    ).toBe(TEXTO_SIN_PERMISO_GASTO);
    expect(TEXTO_SIN_PERMISO_GASTO).toBe(
      "Tu rol no tiene permiso para esta acción. Pide a un administrador que la haga.",
    );
    // Otro 403 del API (ya en español, explica el candado): tal cual.
    expect(mensajeErrorAccionGasto(403, "El gasto ya está conciliado.")).toBe(
      "El gasto ya está conciliado.",
    );
    expect(mensajeErrorAccionGasto(409, "Required role: X")).toBe("Required role: X");
    expect(mensajeErrorAccionGasto(undefined, "Error")).toBe("Error");
  });
});
