import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_AGREGAR_CUENTA,
  FORM_CUENTA_VACIO,
  MEDIOS_CON_CUENTA,
  OPCION_SIN_CUENTA,
  VALOR_AGREGAR_CUENTA,
  cuentaParaAlta,
  cuentaParaPatch,
  cuentaSugeridaParaMedio,
  cuerpoCuentaRapida,
  erroresCuentaRapida,
  etiquetaOpcionCuenta,
  medioLlevaCuenta,
  mensajeErrorCuentaRapida,
  opcionesSelectorCuenta,
  puedeAgregarCuenta,
  sufijoCuentaPago,
  textoCuentaAgregada,
  type OpcionCuentaGasto,
} from "@/lib/admin/cuentas-gasto";
import { textoPagoCorto } from "@/lib/admin/medios-pago";

/** Cuentas REALES de prod (20-oct-2026), sin números completos. */
const C = (o: Partial<OpcionCuentaGasto> & { id: string; alias: string }): OpcionCuentaGasto => ({
  banco: null,
  moneda: "MXN",
  tipo: "BANCO",
  razon_social: "AEROCHARTER",
  activa: true,
  terminacion: null,
  ...o,
});
const HSBC = C({ id: "c-hsbc", alias: "HSBC Pesos", banco: "HSBC" });
const PAYWISE = C({ id: "c-pw", alias: "Paywise", banco: "Paywise", tipo: "PASARELA" });
const AMEX = C({ id: "c-amex", alias: "American Express Ale", banco: "American Express", terminacion: "2006", razon_social: "OTRA" });
const SCOTIA_USD = C({ id: "c-susd", alias: "SCOTIA USD", banco: "Scotiabank", moneda: "USD", activa: false });
const GASTOS = C({ id: "c-gg", alias: "GASTOS GNRAL", banco: "Scotiabank" });

describe("cuenta de donde salió el pago (20-oct-2026, API 0.0.100)", () => {
  it("medios que la llevan: transferencia, pago domiciliado y Paywise (espejo del API)", () => {
    expect([...MEDIOS_CON_CUENTA]).toEqual(["TRANSFERENCIA", "DOMICILIADO", "PAYWISE"]);
    expect(medioLlevaCuenta("TRANSFERENCIA")).toBe(true);
    expect(medioLlevaCuenta("TARJETA_CORP")).toBe(false);
    expect(medioLlevaCuenta("EFECTIVO")).toBe(false);
    expect(medioLlevaCuenta("EFECTIVO_EMPRESA")).toBe(false);
    expect(medioLlevaCuenta("")).toBe(false);
  });

  it("paridad con `MEDIOS_CON_CUENTA` del API (si el repo hermano está al lado)", () => {
    const raiz = process.env.VUELATOUR_API_DIR ?? path.resolve(__dirname, "../../../../../vuelatour-api");
    const archivo = path.join(raiz, "src/common/medio-pago.util.ts");
    if (!existsSync(archivo)) return;
    const src = readFileSync(archivo, "utf8");
    // Un checkout del API previo a 0.0.100 todavía no la tiene.
    if (!src.includes("MEDIOS_CON_CUENTA")) return;
    const bloque = /MEDIOS_CON_CUENTA: readonly string\[\] = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
    const api = [...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(api).toEqual([...MEDIOS_CON_CUENTA]);
  });

  it("roles: toda la oficina agrega cuentas; sin rol no se ofrece", () => {
    expect(puedeAgregarCuenta("ADMIN")).toBe(true);
    expect(puedeAgregarCuenta("FACTURACION")).toBe(true);
    expect(puedeAgregarCuenta("COORDINADOR")).toBe(true);
    expect(puedeAgregarCuenta("SOCIO")).toBe(false);
    expect(puedeAgregarCuenta(null)).toBe(false);
  });

  it("etiquetas: moneda o «pasarela», terminación y dada de baja", () => {
    expect(etiquetaOpcionCuenta(HSBC)).toBe("HSBC Pesos · MXN");
    expect(etiquetaOpcionCuenta(PAYWISE)).toBe("Paywise · pasarela");
    expect(etiquetaOpcionCuenta(AMEX)).toBe("American Express Ale · MXN · ****2006");
    expect(etiquetaOpcionCuenta(SCOTIA_USD)).toBe("SCOTIA USD · USD (dada de baja)");
  });

  it("opciones: «Sin indicar» al frente, activas por alias, la actual inactiva y «＋ Agregar» al final", () => {
    const sin = opcionesSelectorCuenta([PAYWISE, HSBC, SCOTIA_USD, GASTOS]);
    expect(sin.map((o) => o.label)).toEqual([
      OPCION_SIN_CUENTA,
      "GASTOS GNRAL · MXN",
      "HSBC Pesos · MXN",
      "Paywise · pasarela",
    ]);
    const con = opcionesSelectorCuenta([HSBC, SCOTIA_USD], { actualId: "c-susd", conAgregar: true });
    expect(con.map((o) => o.value)).toEqual(["", "c-hsbc", "c-susd", VALOR_AGREGAR_CUENTA]);
    expect(con.at(-1)?.label).toBe(ETIQUETA_AGREGAR_CUENTA);
    // El banco va de descripción solo si no está ya en el alias.
    expect(opcionesSelectorCuenta([GASTOS])[1].description).toBe("Scotiabank");
    expect(opcionesSelectorCuenta([HSBC])[1].description).toBeUndefined();
  });

  it("Paywise sugiere la ÚNICA pasarela activa; transferencia no adivina", () => {
    expect(cuentaSugeridaParaMedio("PAYWISE", [HSBC, PAYWISE])).toBe("c-pw");
    expect(cuentaSugeridaParaMedio("TRANSFERENCIA", [HSBC, PAYWISE])).toBeNull();
    expect(cuentaSugeridaParaMedio("PAYWISE", [HSBC])).toBeNull();
    expect(
      cuentaSugeridaParaMedio("PAYWISE", [PAYWISE, C({ id: "c-pw2", alias: "Paywise 2", tipo: "PASARELA" })]),
    ).toBeNull();
  });

  it("alta: solo viaja con un medio que la lleva, nunca el centinela", () => {
    expect(cuentaParaAlta("TRANSFERENCIA", "c-hsbc")).toBe("c-hsbc");
    expect(cuentaParaAlta("EFECTIVO", "c-hsbc")).toBeUndefined();
    expect(cuentaParaAlta("TRANSFERENCIA", "")).toBeUndefined();
    expect(cuentaParaAlta("TRANSFERENCIA", VALOR_AGREGAR_CUENTA)).toBeUndefined();
  });

  it("PATCH: solo si cambió contra la base; cambiar a efectivo con cuenta guardada ⇒ null", () => {
    expect(cuentaParaPatch("TRANSFERENCIA", "c-hsbc", "c-hsbc")).toBeUndefined();
    expect(cuentaParaPatch("TRANSFERENCIA", "c-gg", "c-hsbc")).toBe("c-gg");
    expect(cuentaParaPatch("TRANSFERENCIA", "", "c-hsbc")).toBeNull();
    expect(cuentaParaPatch("EFECTIVO", "c-hsbc", "c-hsbc")).toBeNull();
    expect(cuentaParaPatch("EFECTIVO", "", null)).toBeUndefined();
    expect(cuentaParaPatch("TRANSFERENCIA", "c-hsbc", null)).toBe("c-hsbc");
  });

  it("renglón de Gastos: «Transferencia · HSBC Pesos»; con tarjeta no se pinta", () => {
    expect(sufijoCuentaPago("TRANSFERENCIA", "HSBC Pesos")).toBe(" · HSBC Pesos");
    expect(sufijoCuentaPago("TARJETA_CORP", "HSBC Pesos")).toBe("");
    expect(textoPagoCorto("TRANSFERENCIA", null, "HSBC Pesos")).toEqual({
      texto: "Transferencia · HSBC Pesos",
      title: "Transferencia desde HSBC Pesos",
    });
    expect(textoPagoCorto("TARJETA_CORP", "2865", "HSBC Pesos")).toEqual({
      texto: "Tarjeta ****2865",
      title: "Tarjeta corporativa ****2865",
    });
    // Sin cuenta: lo de siempre.
    expect(textoPagoCorto("TRANSFERENCIA", null)).toEqual({
      texto: "Transferencia",
      title: "Transferencia",
    });
  });

  it("alta rápida: validación con los límites del DTO y cuerpo sin vacíos", () => {
    expect(erroresCuentaRapida(FORM_CUENTA_VACIO)).toMatchObject({
      alias: "Escribe el nombre de la cuenta.",
      banco: "Escribe el banco (o «Paywise»).",
    });
    expect(
      erroresCuentaRapida({ ...FORM_CUENTA_VACIO, alias: "hsbc pesos", banco: "HSBC" }, [HSBC]).alias,
    ).toBe("Ya existe una cuenta «hsbc pesos»: elígela de la lista.");
    expect(
      erroresCuentaRapida({ ...FORM_CUENTA_VACIO, alias: "BBVA", banco: "BBVA", clabe: "123" }).clabe,
    ).toBe("La CLABE son 18 dígitos.");
    expect(erroresCuentaRapida({ ...FORM_CUENTA_VACIO, alias: "BBVA", banco: "BBVA" })).toEqual({});
    expect(
      cuerpoCuentaRapida({ ...FORM_CUENTA_VACIO, alias: " BBVA ", banco: "BBVA", clabe: "0121 8000 1234 5678 91" }),
    ).toEqual({
      alias: "BBVA",
      banco: "BBVA",
      moneda: "MXN",
      razon_social: "AEROCHARTER",
      tipo: "BANCO",
      clabe: "012180001234567891",
    });
  });

  it("errores y toasts", () => {
    expect(
      mensajeErrorCuentaRapida({ code: "CUENTA_ALIAS_DUPLICADO", error: "Ya existe una cuenta con el nombre «HSBC Pesos»: elígela de la lista." }),
    ).toBe("Ya existe una cuenta con el nombre «HSBC Pesos»: elígela de la lista.");
    expect(mensajeErrorCuentaRapida({ status: 403, error: "Forbidden" })).toBe(
      "Tu usuario no puede dar de alta cuentas bancarias.",
    );
    expect(textoCuentaAgregada("BBVA")).toBe("Cuenta «BBVA» agregada y elegida en este gasto.");
  });
});

describe("Conciliación con la cuenta del gasto (API 0.0.100)", () => {
  it("aviso cuando la cuenta del gasto NO es la del cargo; nada si coincide o no hay cuenta", async () => {
    const { avisoCuentaDistinta, descripcionCandidatoGasto } = await import("@/lib/admin/conciliacion-auto");
    expect(avisoCuentaDistinta({ cuenta_bancaria_id: "c-hsbc", cuenta_alias: "HSBC Pesos" }, "c-gg")).toBe(
      "El gasto dice que salió de HSBC Pesos, no de la cuenta de este cargo.",
    );
    expect(avisoCuentaDistinta({ cuenta_bancaria_id: "c-hsbc" }, "c-hsbc")).toBeNull();
    expect(avisoCuentaDistinta({ cuenta_bancaria_id: null }, "c-hsbc")).toBeNull();
    expect(descripcionCandidatoGasto({ id: "g", monto: 100, cuenta_alias: "HSBC Pesos" })).toContain("de HSBC Pesos");
  });

  it("«Buscar el cargo en Conciliación» de un gasto sin conciliar acota a SU cuenta", async () => {
    const { accionesPendiente } = await import("@/lib/admin/gasto-banco");
    const a = accionesPendiente({
      gasto: {
        id: "g1",
        fecha_gasto: "2026-10-15",
        categoria: "OPERACIONES",
        monto: 2801.4,
        moneda: "MXN",
        medio_pago: "TRANSFERENCIA",
        tarjeta_terminacion: null,
        tc_gasto: null,
        conciliado: false,
        vuelo_id: null,
        vuelo_folio: null,
        proveedor: null,
        lugar: null,
        notas_primera_linea: null,
        folio_comprobante: null,
        cuenta_bancaria_id: "11111111-1111-4111-8111-111111111111",
        cuenta_alias: "HSBC Pesos",
      },
      estado: "SIN_CONCILIAR",
      fuente: "PUENTE",
      vista: null,
      cargos: [],
      alertas: [],
      ultimos_movimientos: [],
    } as never);
    const buscar = a?.enlaces?.find?.((e: { href: string }) => e.href.includes("f=pendientes"))?.href
      ?? JSON.stringify(a);
    expect(buscar).toContain("cuenta=11111111-1111-4111-8111-111111111111");
  });
});
