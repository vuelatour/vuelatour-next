/**
 * Medios de pago del GASTO — fuente única `lib/admin/medios-pago.ts`.
 *
 * 13-oct-2026 (API 0.0.75, migración 20261013000009): «Pago domiciliado»
 * (`DOMICILIADO`), pedido del cliente: «a la hora de vincular un gasto… no
 * viene en método de pago algo que diga Pago domiciliado». Cargo automático
 * a la cuenta (suscripciones, seguros, servicios): BANCARIO, se concilia
 * como una transferencia, sin tarjeta, solo lo registra la oficina.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AYUDA_MEDIO_DOMICILIADO,
  MEDIO_DOMICILIADO,
  MEDIO_PAGO_LABELS,
  MEDIOS_CAPTURA,
  MEDIOS_CAPTURA_VALUES,
  MEDIOS_VERIFICACION,
  ayudaMedioPago,
  medioPagoAceptadoPorApi,
  medioPagoLabel,
  opcionesMedioVerificacion,
  textoPagoCorto,
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

/**
 * Verificación del lote 2 (14-oct-2026): el DTO del API (`MedioPago`, alta Y
 * PATCH — `UpdateGastoDto extends PartialType(CreateGastoDto)`) NO acepta
 * BODEGA (lo pone solo la salida de inventario). «Verificar / editar» mandaba
 * siempre el medio del formulario: en los 20 gastos BODEGA de prod el PATCH
 * rebotaba con «medio_pago must be one of the following values: …» y no se
 * podían verificar ni editar.
 */
describe("BODEGA no viaja al API", () => {
  it("el API acepta EXACTAMENTE los medios de captura", () => {
    for (const m of MEDIOS_CAPTURA_VALUES) expect(medioPagoAceptadoPorApi(m), m).toBe(true);
    for (const m of ["BODEGA", "", "INVENTADO", "efectivo", null, undefined]) {
      expect(medioPagoAceptadoPorApi(m), String(m)).toBe(false);
    }
  });

  it("«Bodega (inventario)» solo se ofrece a un gasto que YA es de bodega", () => {
    expect(opcionesMedioVerificacion("BODEGA").map((m) => m.value)).toEqual([
      ...MEDIOS_CAPTURA_VALUES,
      "BODEGA",
    ]);
    for (const actual of ["EFECTIVO", "TRANSFERENCIA", "DOMICILIADO", "", null, undefined]) {
      expect(opcionesMedioVerificacion(actual).map((m) => m.value), String(actual)).toEqual([
        ...MEDIOS_CAPTURA_VALUES,
      ]);
    }
  });

  // Repo hermano del API (solo en el workspace local; en Vercel se omite).
  const DTO = path.resolve(
    __dirname,
    "../../../../../vuelatour-api/src/modules/expenses/dto/expenses.dto.ts",
  );
  const fuente = existsSync(DTO) ? readFileSync(DTO, "utf8") : null;
  it.skipIf(!fuente)("paridad: el enum `MedioPago` del DTO del API == los medios de captura", () => {
    const src = fuente ?? "";
    const ini = src.indexOf("export enum MedioPago {");
    expect(ini).toBeGreaterThanOrEqual(0);
    const bloque = src.slice(ini, src.indexOf("\n}", ini));
    const valores = [...bloque.matchAll(/^\s*([A-Z_]+)\s*=\s*'([A-Z_]+)'/gm)].map((m) => m[2]);
    expect(valores.length).toBeGreaterThan(0);
    expect([...valores].sort()).toEqual([...MEDIOS_CAPTURA_VALUES].sort());
    expect(valores).not.toContain("BODEGA");
  });

  // `MEDIO_PAGO_LABEL` del API (`common/medio-pago.util.ts`, columna PAGO de
  // los balances) dice lo MISMO que el panel: paridad manual que ahora vigila
  // el test cuando el repo hermano está al lado.
  const UTIL = path.resolve(__dirname, "../../../../../vuelatour-api/src/common/medio-pago.util.ts");
  const util = existsSync(UTIL) ? readFileSync(UTIL, "utf8") : null;
  it.skipIf(!util)("paridad: `MEDIO_PAGO_LABEL` del API == `MEDIO_PAGO_LABELS` del panel", () => {
    const src = util ?? "";
    const ini = src.indexOf("export const MEDIO_PAGO_LABEL");
    expect(ini).toBeGreaterThanOrEqual(0);
    const bloque = src.slice(ini, src.indexOf("};", ini));
    const api: Record<string, string> = {};
    for (const m of bloque.matchAll(/^\s*([A-Z_]+):\s*'([^']*)',?\s*$/gm)) api[m[1]] = m[2];
    expect(Object.keys(api).length).toBe(Object.keys(MEDIO_PAGO_LABELS).length);
    expect(api).toEqual({ ...MEDIO_PAGO_LABELS });
  });
});

/**
 * Medio de pago CORTO bajo el monto en la tabla única de Gastos (14-oct-2026;
 * la columna «Pago» desapareció). La terminación solo con tarjeta corporativa,
 * con la convención de Conciliación («Tarjeta ****2865»).
 */
describe("textoPagoCorto", () => {
  it("los 8 medios: texto corto y title largo", () => {
    const casos: Array<[string, string, string]> = [
      ["EFECTIVO", "Efectivo", "Efectivo"],
      ["TARJETA_CORP", "Tarjeta", "Tarjeta corporativa"],
      ["TRANSFERENCIA", "Transferencia", "Transferencia"],
      ["PAYWISE", "Paywise", "Paywise"],
      ["DOMICILIADO", "Domiciliado", "Pago domiciliado"],
      ["PERSONAL_PABLO", "Personal Pablo", "Personal Pablo"],
      ["PERSONAL_ALE", "Personal Ale", "Personal Ale"],
      ["BODEGA", "Bodega", "Bodega (inventario)"],
    ];
    expect(casos.map((c) => c[0]).sort()).toEqual([...ENUM_PROD].sort());
    for (const [medio, texto, title] of casos) {
      expect(textoPagoCorto(medio), medio).toEqual({ texto, title });
    }
  });

  it("terminación SOLO con tarjeta corporativa (recortada)", () => {
    expect(textoPagoCorto("TARJETA_CORP", "2865")).toEqual({
      texto: "Tarjeta ****2865",
      title: "Tarjeta corporativa ****2865",
    });
    expect(textoPagoCorto("TARJETA_CORP", " 0593 ")).toEqual({
      texto: "Tarjeta ****0593",
      title: "Tarjeta corporativa ****0593",
    });
    expect(textoPagoCorto("TARJETA_CORP", "")).toEqual({ texto: "Tarjeta", title: "Tarjeta corporativa" });
    expect(textoPagoCorto("TARJETA_CORP", null)).toEqual({ texto: "Tarjeta", title: "Tarjeta corporativa" });
    expect(textoPagoCorto("EFECTIVO", "2865")).toEqual({ texto: "Efectivo", title: "Efectivo" });
    expect(textoPagoCorto("TRANSFERENCIA", "2865")).toEqual({ texto: "Transferencia", title: "Transferencia" });
  });

  it("medio desconocido ⇒ su código; sin medio ⇒ null", () => {
    expect(textoPagoCorto("CHEQUE")).toEqual({ texto: "CHEQUE", title: "CHEQUE" });
    expect(textoPagoCorto(null)).toBeNull();
    expect(textoPagoCorto(undefined)).toBeNull();
    expect(textoPagoCorto("")).toBeNull();
  });
});
