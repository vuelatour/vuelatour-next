/**
 * FACTURA OBLIGATORIA POR CUENTA DE COBRO — espejo del API (`common/
 * cuentas-cobro.ts`, invariante 60; decisión 4 del lote del 13-oct-2026).
 * La tabla de verdad es la MISMA que congela `cuentas-cobro.spec.ts` del API
 * (cuenta manda, sin cuenta decide el método, reembolsos nunca, NETO por
 * cuenta y moneda) y, si el repo hermano está al lado, las dos listas se
 * comparan por regex con su código.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CUENTAS_COBRO } from "@/lib/admin/cobros";
import {
  AYUDA_FACTURA_OBLIGATORIA,
  AYUDA_FACTURA_OBLIGATORIA_CANCELADO,
  CUENTAS_COBRO_EXIGEN_FACTURA,
  METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA,
  avisoRetirarFacturaObligatoria,
  cobroExigeFactura,
  cuentaDeCobroTexto,
  cuentaExigeFactura,
  cuentasQueExigenFactura,
  facturaRegistradaFuera,
  origenCobroTexto,
  origenesQueExigenFactura,
  textoFacturaObligatoria,
  vueloExigeFactura,
} from "@/lib/admin/factura-obligatoria";

describe("cobroExigeFactura — tabla de verdad (== API)", () => {
  it("las cuatro cuentas de banco exigen con CUALQUIER método (hasta BillPocket)", () => {
    for (const cuenta of CUENTAS_COBRO_EXIGEN_FACTURA) {
      for (const metodo of ["BILLPOCKET", "EFECTIVO", "PAYWISE", "DOLARES", "OTRO", "TRANSFERENCIA", null]) {
        expect([cuenta, metodo, cobroExigeFactura({ cuenta_destino: cuenta, metodo_cobro: metodo, monto: 100 })]).toEqual([
          cuenta,
          metodo,
          true,
        ]);
      }
    }
  });

  it("«Paywise» NO exige aunque el método sea transferencia; la cuenta se recorta", () => {
    expect(cobroExigeFactura({ cuenta_destino: "Paywise", metodo_cobro: "TRANSFERENCIA", monto: 100 })).toBe(false);
    expect(cobroExigeFactura({ cuenta_destino: "  HSBC Pesos  ", metodo_cobro: "BILLPOCKET", monto: 1 })).toBe(true);
    expect(cuentaExigeFactura("  Paywise ")).toBe(false);
  });

  it("sin cuenta decide el método: link HSBC / transferencia / cheque exigen; los demás no", () => {
    for (const metodo of ["HSBC_LINK", "TRANSFERENCIA", "CHEQUE"]) {
      for (const cuenta of [undefined, null, ""]) {
        expect(cobroExigeFactura({ cuenta_destino: cuenta, metodo_cobro: metodo, monto: 50 }), metodo).toBe(true);
      }
    }
    for (const metodo of ["BILLPOCKET", "EFECTIVO", "PAYWISE", "DOLARES", "OTRO", null, undefined, ""]) {
      expect(cobroExigeFactura({ metodo_cobro: metodo, monto: 50 }), String(metodo)).toBe(false);
    }
    expect([...METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA]).toEqual(["HSBC_LINK", "TRANSFERENCIA", "CHEQUE"]);
  });

  it("cuenta legada fuera del catálogo ⇒ decide el método", () => {
    expect(cuentaExigeFactura("Banamex")).toBeNull();
    expect(cobroExigeFactura({ cuenta_destino: "Banamex", metodo_cobro: "TRANSFERENCIA", monto: 50 })).toBe(true);
    expect(cobroExigeFactura({ cuenta_destino: "Banamex", metodo_cobro: "BILLPOCKET", monto: 50 })).toBe(false);
  });

  it("monto 0 / reembolso / NaN / vacío ⇒ nunca exige; texto numérico sí cuenta (como llega `FlightCobro.monto`)", () => {
    for (const monto of [0, -100, Number.NaN, undefined, null, "x"]) {
      expect(cobroExigeFactura({ cuenta_destino: "HSBC Pesos", metodo_cobro: "TRANSFERENCIA", monto }), String(monto)).toBe(
        false,
      );
    }
    expect(cobroExigeFactura({ cuenta_destino: "HSBC Pesos", monto: "1000.50" })).toBe(true);
  });

  it("las cuatro son subconjunto del catálogo de cuentas del panel (Paywise fuera)", () => {
    for (const c of CUENTAS_COBRO_EXIGEN_FACTURA) {
      expect(CUENTAS_COBRO.map((x) => x.value as string)).toContain(c);
    }
    expect(CUENTAS_COBRO_EXIGEN_FACTURA).not.toContain("Paywise");
    expect(cuentaExigeFactura(null)).toBeNull();
    expect(cuentaExigeFactura("")).toBeNull();
  });
});

describe("vueloExigeFactura — por el NETO de cada cuenta y moneda (revisión del 13-oct)", () => {
  it("sin cobros o solo reembolsos ⇒ SIN_COBROS; uno que exige ⇒ EXIGE", () => {
    expect(vueloExigeFactura([])).toBe("SIN_COBROS");
    expect(vueloExigeFactura(null)).toBe("SIN_COBROS");
    expect(vueloExigeFactura([{ cuenta_destino: "HSBC Pesos", metodo_cobro: "TRANSFERENCIA", monto: -500 }])).toBe(
      "SIN_COBROS",
    );
    expect(
      vueloExigeFactura([
        { metodo_cobro: "BILLPOCKET", monto: 100 },
        { metodo_cobro: "EFECTIVO", monto: 100 },
        { cuenta_destino: "Scotiabank Dólares", metodo_cobro: "DOLARES", monto: 100 },
      ]),
    ).toBe("EXIGE");
  });

  it("anticipo devuelto COMPLETO en la misma cuenta y moneda ⇒ NO_EXIGE; parcial ⇒ EXIGE; centavos no", () => {
    expect(
      vueloExigeFactura([
        { cuenta_destino: "HSBC Dólares", metodo_cobro: "TRANSFERENCIA", moneda: "USD", monto: 1000 },
        { cuenta_destino: "HSBC Dólares", metodo_cobro: "TRANSFERENCIA", moneda: "USD", monto: -1000 },
      ]),
    ).toBe("NO_EXIGE");
    expect(
      vueloExigeFactura([
        { metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: 5000 },
        { metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: -5000 },
        { metodo_cobro: "BILLPOCKET", moneda: "MXN", monto: 5000 },
      ]),
    ).toBe("NO_EXIGE");
    expect(
      vueloExigeFactura([
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: 1000 },
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: -400 },
      ]),
    ).toBe("EXIGE");
    expect(
      vueloExigeFactura([
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: 0.1 },
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: 0.2 },
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: -0.3 },
      ]),
    ).toBe("NO_EXIGE");
  });

  it("el reembolso solo netea su MISMA cuenta y moneda: en efectivo, en otra moneda o sin moneda ⇒ sigue EXIGE", () => {
    const hsbc = { cuenta_destino: "HSBC Dólares", metodo_cobro: "TRANSFERENCIA", moneda: "USD", monto: 1000 };
    for (const reembolso of [
      { metodo_cobro: "EFECTIVO", moneda: "USD", monto: -1000 },
      { cuenta_destino: "HSBC Dólares", moneda: "MXN", monto: -1000 },
      { cuenta_destino: "HSBC Dólares", monto: -1000 },
    ]) {
      expect(vueloExigeFactura([hsbc, reembolso]), JSON.stringify(reembolso)).toBe("EXIGE");
    }
  });

  it("todos sin exigir ⇒ NO_EXIGE (y el reembolso no cuenta)", () => {
    expect(
      vueloExigeFactura([
        { metodo_cobro: "BILLPOCKET", monto: 100 },
        { cuenta_destino: "Paywise", metodo_cobro: "PAYWISE", monto: 100 },
        { cuenta_destino: "HSBC Pesos", metodo_cobro: "TRANSFERENCIA", monto: -100 },
      ]),
    ).toBe("NO_EXIGE");
  });
});

describe("textos (con las etiquetas de método del panel, == `etiquetaMetodoCobro` del API)", () => {
  it("cuentaDeCobroTexto y origenCobroTexto", () => {
    expect(cuentaDeCobroTexto({ cuenta_destino: "HSBC Pesos" })).toBe("HSBC Pesos");
    expect(cuentaDeCobroTexto({ metodo_cobro: "TRANSFERENCIA" })).toBe("Transferencia sin cuenta destino");
    expect(cuentaDeCobroTexto({ metodo_cobro: "HSBC_LINK" })).toBe("Link de pago (HSBC) sin cuenta destino");
    expect(cuentaDeCobroTexto({ cuenta_destino: "  ", metodo_cobro: "CHEQUE" })).toBe("Cheque sin cuenta destino");
    expect(origenCobroTexto({ cuenta_destino: "HSBC Pesos" })).toBe("en HSBC Pesos");
    expect(origenCobroTexto({ metodo_cobro: "TRANSFERENCIA" })).toBe("por Transferencia");
    expect(origenCobroTexto({ metodo_cobro: "HSBC_LINK" })).toBe("por Link de pago (HSBC)");
    expect(origenCobroTexto({ metodo_cobro: "CHEQUE" })).toBe("por Cheque");
  });

  it("cuentas y orígenes: distintas, en orden, solo donde QUEDÓ dinero (neto por moneda)", () => {
    const cobros = [
      { cuenta_destino: "Scotiabank Pesos", metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: 10 },
      { metodo_cobro: "BILLPOCKET", moneda: "MXN", monto: 10 },
      { metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: 10 },
      { cuenta_destino: "Scotiabank Pesos", metodo_cobro: "CHEQUE", moneda: "MXN", monto: 10 },
      { cuenta_destino: "HSBC Dólares", metodo_cobro: "DOLARES", moneda: "USD", monto: 10 },
      { cuenta_destino: "HSBC Dólares", metodo_cobro: "DOLARES", moneda: "USD", monto: -10 },
    ];
    expect(cuentasQueExigenFactura(cobros)).toEqual(["Scotiabank Pesos", "Transferencia sin cuenta destino"]);
    expect(origenesQueExigenFactura(cobros)).toEqual(["en Scotiabank Pesos", "por Transferencia"]);
    expect(cuentasQueExigenFactura([])).toEqual([]);
  });

  it("chip de la burbuja: «Factura obligatoria: cobro en HSBC Pesos» (plural con 2+; null si no exige)", () => {
    expect(textoFacturaObligatoria([{ cuenta_destino: "HSBC Pesos", metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: "16343.59" }])).toBe(
      "Factura obligatoria: cobro en HSBC Pesos",
    );
    expect(textoFacturaObligatoria([{ metodo_cobro: "HSBC_LINK", moneda: "USD", monto: 904.51 }])).toBe(
      "Factura obligatoria: cobro por Link de pago (HSBC)",
    );
    expect(
      textoFacturaObligatoria([
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: 100 },
        { cuenta_destino: "Scotiabank Dólares", moneda: "USD", monto: 100 },
        { metodo_cobro: "TRANSFERENCIA", moneda: "MXN", monto: 100 },
      ]),
    ).toBe("Factura obligatoria: cobros en HSBC Pesos, en Scotiabank Dólares y por Transferencia");
    // Paywise, efectivo, devuelto completo o sin cobros: nada que decir.
    expect(textoFacturaObligatoria([{ cuenta_destino: "Paywise", metodo_cobro: "PAYWISE", monto: 100 }])).toBeNull();
    expect(
      textoFacturaObligatoria([
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: 1000 },
        { cuenta_destino: "HSBC Pesos", moneda: "MXN", monto: -1000 },
      ]),
    ).toBeNull();
    expect(textoFacturaObligatoria([])).toBeNull();
    expect(textoFacturaObligatoria(undefined)).toBeNull();
  });

  it("ayudas y el aviso de «Retirar»", () => {
    expect(AYUDA_FACTURA_OBLIGATORIA).toContain("HSBC Dólares, HSBC Pesos, Scotiabank Dólares o Scotiabank Pesos");
    expect(AYUDA_FACTURA_OBLIGATORIA).toContain("el pre-cierre lo marca");
    expect(AYUDA_FACTURA_OBLIGATORIA_CANCELADO).toContain("Vuelo cancelado: regístrala directo en Facturas emitidas.");
    expect(avisoRetirarFacturaObligatoria("Factura obligatoria: cobro en HSBC Pesos")).toBe(
      "Ojo: la factura es obligatoria (cobro en HSBC Pesos); el pre-cierre seguirá marcando el vuelo mientras no se registre.",
    );
    expect(avisoRetirarFacturaObligatoria(null)).toBeNull();
  });
});

describe("facturaRegistradaFuera — los pasos de la cascada del API que no son «emitidas VIGENTES»", () => {
  it("CFDI timbrado, folio legado o estatus manual ≠ «Sin factura» ⇒ cumplida", () => {
    expect(facturaRegistradaFuera({ facturado: true })).toBe(true);
    expect(facturaRegistradaFuera({ factura_cliente: { estatus: "FACTURADO" } })).toBe(true);
    expect(facturaRegistradaFuera({ factura_cliente: { estatus: "ELABORADA_ENVIADA" } })).toBe(true);
    expect(facturaRegistradaFuera({ factura_cliente: { estatus: "SIN_FACTURA", folio: "A-0297" } })).toBe(true);
  });

  it("sin nada de eso (o API previo sin el bloque) ⇒ no", () => {
    expect(facturaRegistradaFuera({})).toBe(false);
    expect(facturaRegistradaFuera({ facturado: false, factura_cliente: null })).toBe(false);
    expect(facturaRegistradaFuera({ factura_cliente: { estatus: "SIN_FACTURA", folio: "   " } })).toBe(false);
    expect(facturaRegistradaFuera({ factura_cliente: { estatus: "VALOR_NUEVO" } })).toBe(false);
  });
});

// Repo hermano del API (solo existe en el workspace local).
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src/common/cuentas-cobro.ts");
const fuenteApi = existsSync(API) ? readFileSync(API, "utf8") : null;
const listaApi = (nombre: string): string[] => {
  const bloque = new RegExp(`export const ${nombre}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(fuenteApi ?? "");
  return [...(bloque?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe("espejo del API (lectura del repo hermano)", () => {
  it.skipIf(!fuenteApi)("CUENTAS_COBRO_EXIGEN_FACTURA y METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA == las del panel", () => {
    expect(listaApi("CUENTAS_COBRO_EXIGEN_FACTURA")).toEqual([...CUENTAS_COBRO_EXIGEN_FACTURA]);
    expect(listaApi("METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA")).toEqual([...METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA]);
    // El NETO por cuenta y moneda con su tolerancia de centavos.
    expect(fuenteApi).toContain("const TOLERANCIA_NETO = 0.005;");
  });
});
