/**
 * Medios de pago del GASTO — fuente única `lib/admin/medios-pago.ts`.
 *
 * 13-oct-2026 (API 0.0.75, migración 20261013000009): «Pago domiciliado»
 * (`DOMICILIADO`), pedido del cliente: «a la hora de vincular un gasto… no
 * viene en método de pago algo que diga Pago domiciliado». Cargo automático
 * a la cuenta (suscripciones, seguros, servicios): BANCARIO, se concilia
 * como una transferencia, sin tarjeta, solo lo registra la oficina.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_MEDIO_DOMICILIADO,
  MEDIO_DOMICILIADO,
  MEDIO_PAGO_LABELS,
  MEDIOS_CAPTURA,
  MEDIOS_CAPTURA_VALUES,
  MEDIOS_VERIFICACION,
  ayudaMedioPago,
  medioPagoLabel,
} from "@/lib/admin/medios-pago";
import { GastoCreateSchema, MedioPagoEnum } from "@/app/admin/expenses/schema";

/** Enum `public.medio_pago` de prod con la migración 20261013000009 (8 valores). */
const ENUM_PROD = [
  "EFECTIVO",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
  "TRANSFERENCIA",
  "BODEGA",
  "PAYWISE",
  "DOMICILIADO",
];

describe("selector de medios de pago", () => {
  it("captura: orden exacto, «Pago domiciliado» justo después de «Transferencia» y sin BODEGA", () => {
    expect([...MEDIOS_CAPTURA_VALUES]).toEqual([
      "TRANSFERENCIA",
      "DOMICILIADO",
      "PAYWISE",
      "EFECTIVO",
      "TARJETA_CORP",
      "PERSONAL_PABLO",
      "PERSONAL_ALE",
    ]);
    expect(MEDIOS_CAPTURA.map((m) => m.value)).toEqual([...MEDIOS_CAPTURA_VALUES]);
    expect(MEDIOS_CAPTURA.find((m) => m.value === "DOMICILIADO")?.label).toBe("Pago domiciliado");
  });

  it("verificación = captura + BODEGA al final", () => {
    expect(MEDIOS_VERIFICACION.map((m) => m.value)).toEqual([...MEDIOS_CAPTURA_VALUES, "BODEGA"]);
  });

  it("todo valor del enum de prod tiene etiqueta (ninguno cae al código crudo)", () => {
    for (const m of ENUM_PROD) {
      expect(MEDIO_PAGO_LABELS[m], m).toBeTruthy();
      expect(medioPagoLabel(m), m).not.toBe(m);
    }
    expect(Object.keys(MEDIO_PAGO_LABELS).sort()).toEqual([...ENUM_PROD].sort());
    expect(medioPagoLabel(MEDIO_DOMICILIADO)).toBe("Pago domiciliado");
  });

  it("zod: el enum de verificación y el alta lo aceptan", () => {
    expect(MedioPagoEnum.options).toContain("DOMICILIADO");
    expect([...MedioPagoEnum.options].sort()).toEqual([...ENUM_PROD].sort());
    const r = GastoCreateSchema.safeParse({
      categoria: "SERVICIOS",
      monto: "1299",
      moneda: "MXN",
      fecha_gasto: "2026-10-03",
      medio_pago: "DOMICILIADO",
    });
    expect(r.success).toBe(true);
  });

  it("ayuda: solo con «Pago domiciliado»", () => {
    expect(AYUDA_MEDIO_DOMICILIADO).toBe(
      "Cargo automático a la cuenta (suscripción, seguro, servicio). Se concilia con el cargo del banco como una transferencia; no lleva tarjeta.",
    );
    expect(ayudaMedioPago("DOMICILIADO")).toBe(AYUDA_MEDIO_DOMICILIADO);
    for (const m of ["TRANSFERENCIA", "TARJETA_CORP", "EFECTIVO", "", null, undefined]) {
      expect(ayudaMedioPago(m), String(m)).toBeNull();
    }
  });
});
