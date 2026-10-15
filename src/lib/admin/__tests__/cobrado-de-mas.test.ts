/**
 * «COBRADO DE MÁS» con su causa (14-oct-2026, API 0.0.78, invariante 77) —
 * `lib/admin/cobrado-de-mas.ts`. Los textos del aviso los arma el API (aquí
 * van copiados del `cobradoDeMas` del API para los casos reales de prod del
 * 14-oct: #217 IVA no cotizado, #81 comisión del link, #259 redondeo del T.C.
 * y el #315 de antes de la corrección con el cobro de $977.45 de la #332).
 * El panel solo elige el tono, arma el enlace y la frase de los cobros sin
 * T.C. También: el renglón del pre-cierre y la vista previa del formulario de
 * cobro («Rebasa el pendiente», D21).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CobradoDeMasVuelo } from "@/types/flights";
import {
  AYUDA_REBASA_PENDIENTE,
  CLASES_AVISO_COBRADO_DE_MAS,
  CLASES_INFO_COBRADO_DE_MAS,
  CLAVE_PRECIERRE_COBRADOS_DE_MAS,
  hrefPrecierreCobradosDeMas,
  lineaExplicadosPreCierre,
  presentacionCobradoDeMas,
  sufijoCausaPreCierre,
  TEXTO_COBRO_RETENIDO,
  TEXTO_CUBRE_PENDIENTE,
  TEXTO_SALDO_AL_GUARDAR,
  textoSinTcCobradoDeMas,
  tituloCausaPreCierre,
  vistaPreviaMontoCobro,
} from "../cobrado-de-mas";

const VUELO_332 = "5b6c7d8e-3332-4a7b-8c9d-0e1f2a3b4c5d";

const IVA_217: CobradoDeMasVuelo = {
  excedente_usd: 495.99,
  cobrado_usd: 3595.99,
  total_usd: 3100,
  causa: "IVA_NO_COTIZADO",
  causa_etiqueta: "IVA que la cotización no lleva",
  requiere_revision: true,
  tono: "AVISO",
  titulo: "Cobrado de más: $495.99 USD",
  explicacion:
    "Lo cobrado ($3,595.99 USD) rebasa el monto total ($3,100.00 USD). Posible causa: el cliente pagó el total más 16 % de IVA ($3,100.00 × 1.16 = $3,596.00 USD) y esta cotización no lleva IVA.",
  que_hacer:
    "Si se le facturó con IVA, corrige la cotización para que lleve IVA (así el IVA no cuenta como venta). Si no se le facturó, el cliente tiene un saldo a favor: regístralo como reembolso o aplícalo a su siguiente vuelo.",
  referencia: null,
  sin_tc: null,
};

const COMISION_81: CobradoDeMasVuelo = {
  excedente_usd: 214.26,
  cobrado_usd: 2714.26,
  total_usd: 2500,
  causa: "COMISION_PAGADA_POR_CLIENTE",
  causa_etiqueta: "comisión del link pagada por el cliente",
  requiere_revision: false,
  tono: "INFO",
  titulo: "Cobrado de más: $214.26 USD",
  explicacion:
    "Es la comisión del link de pago, que pagó el cliente: sin la comisión, lo cobrado cuadra con el total.",
  que_hacer: "No hay nada que corregir.",
  referencia: null,
  sin_tc: null,
};

const OTRO_VUELO_315: CobradoDeMasVuelo = {
  excedente_usd: 56.99,
  cobrado_usd: 4232.24,
  total_usd: 4175.25,
  causa: "OTRO_VUELO_DEL_CLIENTE",
  causa_etiqueta: "pago de otro vuelo del cliente",
  requiere_revision: true,
  tono: "AVISO",
  titulo: "Cobrado de más: $56.99 USD",
  explicacion:
    "Lo cobrado ($4,232.24 USD) rebasa el monto total ($4,175.25 USD). Posible causa: el cobro de $977.45 MXN del vuelo #332 del mismo cliente sigue sin banco y equivale a lo cobrado de más: puede que un cobro de este vuelo incluya el pago de ese vuelo.",
  que_hacer:
    "En Conciliación desvincula el depósito, corrige el cobro de este vuelo para que solo lleve lo suyo y vuelve a vincular el depósito marcando los cobros de los dos vuelos.",
  referencia: { vuelo_id: VUELO_332, folio: 332, cobro_id: "c-332", monto: 977.45, moneda: "MXN" },
  sin_tc: null,
};

describe("el aviso de la card", () => {
  it("AVISO (requiere revisión): caja ámbar con el título, la causa y «Qué hacer» del API", () => {
    const p = presentacionCobradoDeMas(IVA_217);
    expect(p).toMatchObject({
      tono: "AVISO",
      clases: CLASES_AVISO_COBRADO_DE_MAS,
      titulo: "Cobrado de más: $495.99 USD",
      cuerpo: IVA_217.explicacion,
      queHacer: IVA_217.que_hacer,
      enlace: null,
      sinTc: null,
    });
    expect(CLASES_AVISO_COBRADO_DE_MAS).toContain("border-amber-500/50");
    expect(CLASES_AVISO_COBRADO_DE_MAS).toContain("bg-amber-500/10");
  });

  it("INFO (explicado): UNA línea gris (textos.cobrado_de_mas.linea_info)", () => {
    const p = presentacionCobradoDeMas(COMISION_81);
    expect(p?.tono).toBe("INFO");
    expect(p?.clases).toBe(CLASES_INFO_COBRADO_DE_MAS);
    expect(p?.linea).toBe(
      "Cobrado de más: $214.26 USD — es la comisión del link de pago, que pagó el cliente: sin la comisión, lo cobrado cuadra con el total. No hay nada que corregir.",
    );
    const redondeo = presentacionCobradoDeMas({
      ...COMISION_81,
      excedente_usd: 8.47,
      causa: "REDONDEO_TC",
      causa_etiqueta: "redondeo del tipo de cambio",
      titulo: "Cobrado de más: $8.47 USD",
      explicacion: "Diferencia por tipo de cambio o redondeo del pago en pesos (menos de $10.00 USD).",
    });
    expect(redondeo?.linea).toBe(
      "Cobrado de más: $8.47 USD — diferencia por tipo de cambio o redondeo del pago en pesos (menos de $10.00 USD). No hay nada que corregir.",
    );
  });

  it("otro vuelo del cliente: enlace «Ver el vuelo #332» a su card de cobros", () => {
    expect(presentacionCobradoDeMas(OTRO_VUELO_315)?.enlace).toEqual({
      href: `/admin/flights/${VUELO_332}#cobros`,
      texto: "Ver el vuelo #332",
    });
    // Sin folio: «Ver el otro vuelo»; un id que no es uuid no arma enlace.
    expect(
      presentacionCobradoDeMas({ ...OTRO_VUELO_315, referencia: { vuelo_id: VUELO_332, folio: null } })?.enlace?.texto,
    ).toBe("Ver el otro vuelo");
    expect(
      presentacionCobradoDeMas({ ...OTRO_VUELO_315, referencia: { vuelo_id: "332", folio: 332 } })?.enlace,
    ).toBeNull();
  });

  it("sin bloque (sin aviso, API previo o rol de campo) o sin título: nada — jamás se deduce", () => {
    expect(presentacionCobradoDeMas(null)).toBeNull();
    expect(presentacionCobradoDeMas(undefined)).toBeNull();
    expect(presentacionCobradoDeMas({ ...IVA_217, titulo: "" })).toBeNull();
  });

  it("sin `tono` decide `requiere_revision` (falla hacia lo visible)", () => {
    expect(presentacionCobradoDeMas({ ...COMISION_81, tono: undefined as never })?.tono).toBe("INFO");
    expect(presentacionCobradoDeMas({ ...IVA_217, tono: undefined as never })?.tono).toBe("AVISO");
  });

  it("cobros en pesos sin T.C. (números del API)", () => {
    expect(textoSinTcCobradoDeMas({ n: 1, mxn: 3400 })).toBe(
      "Además hay 1 cobro en pesos sin T.C. ($3,400 MXN) que no entró a la cuenta.",
    );
    expect(textoSinTcCobradoDeMas({ n: 2, mxn: 5100.5 })).toBe(
      "Además hay 2 cobros en pesos sin T.C. ($5,100.50 MXN) que no entraron a la cuenta.",
    );
    expect(textoSinTcCobradoDeMas(null)).toBeNull();
    expect(textoSinTcCobradoDeMas({ n: 0, mxn: 0 })).toBeNull();
    expect(presentacionCobradoDeMas({ ...IVA_217, sin_tc: { n: 1, mxn: 3400 } })?.sinTc).toContain("1 cobro en pesos");
  });
});

describe("pre-cierre «Vuelos cobrados de más»", () => {
  it("clave del API, «Resolver →» a los vuelos del periodo y sufijo de la causa", () => {
    expect(CLAVE_PRECIERRE_COBRADOS_DE_MAS).toBe("vuelos_cobrados_de_mas");
    expect(hrefPrecierreCobradosDeMas({ desde: "2026-08-01", hasta: "2026-08-31" })).toBe(
      "/admin/flights?desde=2026-08-01&hasta=2026-08-31",
    );
    expect(sufijoCausaPreCierre("IVA_NO_COTIZADO")).toBe("· IVA");
    expect(sufijoCausaPreCierre("COBRO_DUPLICADO")).toBe("· duplicado");
    expect(sufijoCausaPreCierre("SOBRE_DE_GRUPO")).toBe("· sobre");
    expect(sufijoCausaPreCierre("SIN_CAUSA_CLARA")).toBe("· revisar");
    expect(sufijoCausaPreCierre("OTRA_COSA")).toBe("");
    expect(sufijoCausaPreCierre(undefined)).toBe("");
    expect(tituloCausaPreCierre({ causa_etiqueta: "IVA que la cotización no lleva" })).toBe(
      "Posible causa: IVA que la cotización no lleva. Revisa la card de cobros del vuelo.",
    );
    expect(tituloCausaPreCierre({})).toBeUndefined();
  });

  it("la línea gris de los explicados, agrupada por causa (textos.pre_cierre.explicados)", () => {
    expect(
      lineaExplicadosPreCierre([
        { folio: 81, causa_etiqueta: "comisión del link pagada por el cliente" },
        { folio: 84, causa_etiqueta: "comisión del link pagada por el cliente" },
      ]),
    ).toBe("Además: #81 y #84 (comisión del link pagada por el cliente) no requieren acción.");
    expect(lineaExplicadosPreCierre([{ folio: 111, causa_etiqueta: "redondeo del tipo de cambio" }])).toBe(
      "Además: #111 (redondeo del tipo de cambio) no requiere acción.",
    );
    expect(
      lineaExplicadosPreCierre([
        { folio: 81, causa_etiqueta: "comisión del link pagada por el cliente" },
        { folio: 259, causa_etiqueta: "redondeo del tipo de cambio" },
        { folio: 285, causa_etiqueta: "redondeo del tipo de cambio" },
      ]),
    ).toBe(
      "Además: #81 (comisión del link pagada por el cliente) y #259 y #285 (redondeo del tipo de cambio) no requieren acción.",
    );
    expect(lineaExplicadosPreCierre([])).toBeNull();
    expect(lineaExplicadosPreCierre(undefined)).toBeNull();
  });

  it("más de 10 explicados: los primeros 10 y «y N más»", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => ({ folio: 100 + i, causa_etiqueta: "redondeo del tipo de cambio" }));
    const l = lineaExplicadosPreCierre(muchos);
    expect(l).toContain("#100, #101");
    expect(l).toContain("y #109 (redondeo del tipo de cambio) y 2 más no requieren acción.");
    expect(l).not.toContain("#110");
  });

  it("paridad: la clave es la del API (si el repo hermano ya trae el 0.0.78)", () => {
    const p = path.resolve(
      __dirname,
      "../../../../../vuelatour-api/src/modules/profit-sharing/vuelos-cobrados-de-mas.util.ts",
    );
    if (!existsSync(p)) return;
    expect(readFileSync(p, "utf8")).toContain(`CLAVE_PRECIERRE_COBRADOS_DE_MAS = '${CLAVE_PRECIERRE_COBRADOS_DE_MAS}'`);
  });
});

describe("vista previa del formulario de cobro (D21)", () => {
  const base = { montoTotalUsd: 4175.25, cancelado: false, enEdicion: false };

  it("alta: rebasa el pendiente por más de $1.00 ⇒ ámbar con la ayuda del depósito de otro vuelo", () => {
    expect(vistaPreviaMontoCobro({ ...base, usdEquivalente: 4232.24, pendingUsd: 4175.25 })).toEqual({
      tono: "rebasa",
      texto: "Rebasa el pendiente por $56.99 USD: el vuelo quedará cobrado de más.",
      ayuda: AYUDA_REBASA_PENDIENTE,
    });
    expect(AYUDA_REBASA_PENDIENTE).toBe(
      "Si el depósito también pagó otro vuelo, registra aquí solo lo de este vuelo y el resto como cobro del otro; en Conciliación el depósito se vincula a los dos cobros.",
    );
  });

  it("alta: los bordes de la tolerancia ($1.00, la de la bandera `cobrado`)", () => {
    const v = (usd: number) => vistaPreviaMontoCobro({ ...base, usdEquivalente: usd, pendingUsd: 100 });
    expect(v(101).tono).toBe("cubre");
    expect(v(101.01).tono).toBe("rebasa");
    expect(v(101.01).texto).toBe("Rebasa el pendiente por $1.01 USD: el vuelo quedará cobrado de más.");
    expect(v(99).texto).toBe(TEXTO_CUBRE_PENDIENTE);
    expect(v(98.99)).toEqual({ tono: "queda", texto: "Quedará pendiente $1.01 USD.", ayuda: null });
    expect(v(50).texto).toBe("Quedará pendiente $50 USD.");
  });

  it("alta: vuelo cancelado (cobro retenido) y vuelo sin precio fijo (nunca «cobrado de más»)", () => {
    expect(vistaPreviaMontoCobro({ ...base, cancelado: true, usdEquivalente: 900, pendingUsd: 0 })).toEqual({
      tono: "neutro",
      texto: TEXTO_COBRO_RETENIDO,
      ayuda: null,
    });
    // Cliente interno ($0) y cotización ABIERTA (el precio se cierra al final
    // del viaje): el API tampoco avisa «cobrado de más».
    expect(
      vistaPreviaMontoCobro({ ...base, montoTotalUsd: 0, usdEquivalente: 500, pendingUsd: 0 }).texto,
    ).toBe(TEXTO_CUBRE_PENDIENTE);
    expect(
      vistaPreviaMontoCobro({ ...base, cotizacionAbierta: true, usdEquivalente: 4232.24, pendingUsd: 4175.25 }).tono,
    ).toBe("cubre");
    expect(
      vistaPreviaMontoCobro({
        ...base,
        cotizacionAbierta: true,
        enEdicion: true,
        saldoUsd: 0,
        montoUsdOriginal: 100,
        usdEquivalente: 900,
        pendingUsd: 0,
      }).tono,
    ).toBe("cubre");
    // Con pendiente de verdad, «Quedará pendiente» igual que hoy.
    expect(
      vistaPreviaMontoCobro({ ...base, cotizacionAbierta: true, usdEquivalente: 100, pendingUsd: 600 }).texto,
    ).toBe("Quedará pendiente $500 USD.");
  });

  it("corrección con `monto_usd`: contra el saldo SIN este cobro", () => {
    // Vuelo de $4,175.25 cobrado exacto con dos cobros; el de $3,976.38 USD
    // se corrige a $4,033.37 USD ⇒ quedaría cobrado de más por $56.99.
    const e = { ...base, enEdicion: true, pendingUsd: 0, saldoUsd: 0, montoUsdOriginal: 3976.38 };
    expect(vistaPreviaMontoCobro({ ...e, usdEquivalente: 4033.37 })).toEqual({
      tono: "rebasa",
      texto: "Con este cambio el vuelo quedará cobrado de más por $56.99 USD.",
      ayuda: AYUDA_REBASA_PENDIENTE,
    });
    expect(vistaPreviaMontoCobro({ ...e, usdEquivalente: 3976.38 }).texto).toBe(TEXTO_CUBRE_PENDIENTE);
    expect(vistaPreviaMontoCobro({ ...e, usdEquivalente: 2276.38 }).texto).toBe("Quedará pendiente $1,700 USD.");
    // Un vuelo ya cobrado de más por otros cobros (saldo negativo) también lo dice.
    expect(vistaPreviaMontoCobro({ ...e, saldoUsd: -20, usdEquivalente: 3976.38 }).texto).toBe(
      "Con este cambio el vuelo quedará cobrado de más por $20 USD.",
    );
  });

  it("corrección sin `monto_usd` (API previo o pesos sin T.C.) o cancelado: el texto de siempre", () => {
    const e = { ...base, enEdicion: true, pendingUsd: 0, usdEquivalente: 9999 };
    expect(vistaPreviaMontoCobro({ ...e, saldoUsd: 0, montoUsdOriginal: null }).texto).toBe(TEXTO_SALDO_AL_GUARDAR);
    expect(vistaPreviaMontoCobro({ ...e, saldoUsd: 0 }).texto).toBe(TEXTO_SALDO_AL_GUARDAR);
    expect(vistaPreviaMontoCobro({ ...e, saldoUsd: null, montoUsdOriginal: 100 }).texto).toBe(TEXTO_SALDO_AL_GUARDAR);
    expect(vistaPreviaMontoCobro({ ...e, cancelado: true, saldoUsd: 0, montoUsdOriginal: 100 }).texto).toBe(
      TEXTO_SALDO_AL_GUARDAR,
    );
    expect(TEXTO_SALDO_AL_GUARDAR).toBe("El saldo del vuelo se recalcula al guardar.");
  });
});
