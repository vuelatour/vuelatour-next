/**
 * Aviso de saldo de créditos de IA (1-oct-2026). Caso REAL de producción:
 * checkpoint de $21.39 (5-sep) − $20.52 consumidos = ≈ $0.87 USD, con $7.44
 * de consumo en la última semana — la app ya respondía «Claude no disponible
 * (400)» y la pantalla no avisaba nada. El estimado se queda ALTO (las
 * lecturas que fallan no se registran): ese caso es CRÍTICO (rojo), no «bajo».
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_RITMO_IA,
  ETIQUETA_ACTUALIZAR_SALDO_IA,
  TEXTO_SALDO_IA_AGOTADO,
  TEXTO_SALDO_IA_DESCONOCIDO,
  UMBRAL_SALDO_IA_ATENCION_USD,
  UMBRAL_SALDO_IA_BAJO_USD,
  UMBRAL_SALDO_IA_CRITICO_USD,
  consumoEnRangoIa,
  diasRestantesIa,
  estadoSaldoIa,
  muestraBandaSaldoIa,
  rangoCubre,
  rangoUltimosDiasIa,
  textoDiasRestantesIa,
  tonoSaldoIa,
} from "../ia-saldo";

const SALDO_PROD = 21.39 - 20.52; // 0.8699999999999974 en punto flotante
const CONSUMO_7D_PROD = 7.44;

describe("estadoSaldoIa — el caso real del 1-oct-2026", () => {
  it("$0.87 con $7.44 en 7 días ⇒ CRÍTICO (rojo): la IA ya estaba rechazando por saldo", () => {
    const e = estadoSaldoIa(SALDO_PROD, CONSUMO_7D_PROD);
    expect(e.nivel).toBe("critico");
    expect(tonoSaldoIa(e.nivel)).toBe("rojo");
    expect(e.texto).toBe(
      "Saldo de créditos de IA por agotarse: quedan ≈ $0.87 USD (menos de 1 día al ritmo de la última semana). La estimación no cuenta las lecturas que fallan, así que la lectura de tickets puede estar fallando ya: recarga en Anthropic y actualiza el saldo aquí.",
    );
    expect(e.texto).not.toContain("0 días");
  });

  it("la cuenta de días: 0.87 / (7.44 / 7) = 0.82 ⇒ 0 días enteros", () => {
    expect(diasRestantesIa(SALDO_PROD, CONSUMO_7D_PROD)).toBe(0);
  });
});

describe("estadoSaldoIa — niveles", () => {
  it("umbrales: $50 atención, $5 bajo, $1 crítico", () => {
    expect(UMBRAL_SALDO_IA_ATENCION_USD).toBe(50);
    expect(UMBRAL_SALDO_IA_BAJO_USD).toBe(5);
    expect(UMBRAL_SALDO_IA_CRITICO_USD).toBe(1);
    expect(estadoSaldoIa(50, 7.44)).toEqual({ nivel: "ok", texto: null });
    expect(estadoSaldoIa(120, 7.44)).toEqual({ nivel: "ok", texto: null });
    expect(estadoSaldoIa(49.99, null).nivel).toBe("atencion");
    expect(estadoSaldoIa(5, 7.44).nivel).toBe("atencion");
    expect(estadoSaldoIa(4.99, null).nivel).toBe("bajo");
    expect(estadoSaldoIa(1, null).nivel).toBe("bajo");
    expect(estadoSaldoIa(0.99, null).nivel).toBe("critico");
  });

  it("agotado: ≤ 0 al centavo (también negativo: el estimado puede pasarse)", () => {
    for (const s of [0, -0.5, -3.2, 0.004]) {
      expect(estadoSaldoIa(s, 7.44)).toEqual({
        nivel: "agotado",
        texto: TEXTO_SALDO_IA_AGOTADO,
      });
    }
    expect(TEXTO_SALDO_IA_AGOTADO).toBe(
      "Sin saldo de créditos de IA: la lectura de tickets y las sugerencias dejan de funcionar hasta recargar en Anthropic (Plans & Billing) y actualizar el saldo aquí.",
    );
    // Un centavo todavía es saldo: crítico, no agotado.
    expect(estadoSaldoIa(0.005, null).nivel).toBe("critico");
  });

  it("crítico SIN ritmo (menos de $1): rojo y sin inventar días", () => {
    const e = estadoSaldoIa(0.6, null);
    expect(e.nivel).toBe("critico");
    expect(e.texto).toBe(
      "Saldo de créditos de IA por agotarse: quedan ≈ $0.60 USD. La estimación no cuenta las lecturas que fallan, así que la lectura de tickets puede estar fallando ya: recarga en Anthropic y actualiza el saldo aquí.",
    );
    // Con menos de $1 manda el monto aunque el ritmo diga «días»: cuando la
    // IA ya rechaza, el consumo registrado cae y el ritmo deja de servir.
    expect(estadoSaldoIa(0.9, 0.7).nivel).toBe("critico");
    expect(estadoSaldoIa(0.9, 0.7).texto).not.toContain("días");
  });

  it("crítico CON saldo mayor a $5 si no alcanza ni un día al ritmo de la semana", () => {
    // 8 / (70 / 7) = 0.8 ⇒ menos de 1 día
    const e = estadoSaldoIa(8, 70);
    expect(e.nivel).toBe("critico");
    expect(e.texto).toContain("quedan ≈ $8 USD (menos de 1 día al ritmo de la última semana)");
  });

  it("desconocido: sin saldo estimado (sin checkpoint) o dato ilegible", () => {
    for (const s of [null, undefined, Number.NaN]) {
      expect(estadoSaldoIa(s as number | null, 7.44)).toEqual({
        nivel: "desconocido",
        texto: TEXTO_SALDO_IA_DESCONOCIDO,
      });
    }
    // Vocabulario del panel («captura», «Actualizar saldo»), no «checkpoint».
    expect(TEXTO_SALDO_IA_DESCONOCIDO).toBe(
      "Todavía no se captura el saldo: entra a Anthropic, copia tu saldo y captúralo con «Actualizar saldo» para estimarlo.",
    );
    expect(TEXTO_SALDO_IA_DESCONOCIDO).not.toMatch(/checkpoint/i);
    expect(TEXTO_SALDO_IA_DESCONOCIDO).toContain(`«${ETIQUETA_ACTUALIZAR_SALDO_IA}»`);
  });

  it("bajo SIN ritmo (sin consumo en 7 días o sin dato): no inventa días", () => {
    const esperado =
      "Saldo bajo de créditos de IA: quedan ≈ $3.50 USD. Recarga en Anthropic y actualiza el saldo aquí.";
    expect(estadoSaldoIa(3.5, null).texto).toBe(esperado);
    expect(estadoSaldoIa(3.5, undefined).texto).toBe(esperado);
    expect(estadoSaldoIa(3.5, 0).texto).toBe(esperado);
    expect(estadoSaldoIa(3.5, -1).texto).toBe(esperado);
    expect(estadoSaldoIa(3.5).texto).toBe(esperado);
  });

  it("bajo con ritmo: «alrededor de 1 día» y «unos N días» (redondeo hacia abajo)", () => {
    // 1.50 / (7 / 7) = 1.5 ⇒ 1 día
    expect(estadoSaldoIa(1.5, 7).texto).toBe(
      "Saldo bajo de créditos de IA: quedan ≈ $1.50 USD (alrededor de 1 día al ritmo de la última semana). Recarga en Anthropic y actualiza el saldo aquí.",
    );
    // 4.20 / (7.44 / 7) = 3.95 ⇒ 3 días
    expect(estadoSaldoIa(4.2, 7.44).texto).toBe(
      "Saldo bajo de créditos de IA: quedan ≈ $4.20 USD (unos 3 días al ritmo de la última semana). Recarga en Anthropic y actualiza el saldo aquí.",
    );
    // Saldo entero: fmtUsd no pinta «.00».
    expect(estadoSaldoIa(2, 1.4).texto).toContain("quedan ≈ $2 USD (unos 10 días");
  });

  it("atención (< $50): solo dice para cuántos días alcanza, si se puede medir", () => {
    // 15 / (7.44 / 7) = 14.1 ⇒ 14 días
    expect(estadoSaldoIa(15, 7.44)).toEqual({
      nivel: "atencion",
      texto: "Al ritmo de la última semana alcanza para unos 14 días.",
    });
    expect(estadoSaldoIa(15, null)).toEqual({ nivel: "atencion", texto: null });
  });

  it("textoDiasRestantesIa: la regla congelada", () => {
    expect(textoDiasRestantesIa(0)).toBe("menos de 1 día");
    expect(textoDiasRestantesIa(1)).toBe("alrededor de 1 día");
    expect(textoDiasRestantesIa(2)).toBe("unos 2 días");
    expect(textoDiasRestantesIa(30)).toBe("unos 30 días");
  });
});

describe("UN solo color para el saldo (número de la tarjeta y banda)", () => {
  it("tono por nivel", () => {
    expect(tonoSaldoIa("agotado")).toBe("rojo");
    expect(tonoSaldoIa("critico")).toBe("rojo");
    expect(tonoSaldoIa("bajo")).toBe("ambar");
    expect(tonoSaldoIa("atencion")).toBe("ambar");
    expect(tonoSaldoIa("ok")).toBe("neutro");
    expect(tonoSaldoIa("desconocido")).toBe("apagado");
  });

  it("banda solo en agotado, crítico y bajo; «atención» solo colorea el número", () => {
    expect(muestraBandaSaldoIa("agotado")).toBe(true);
    expect(muestraBandaSaldoIa("critico")).toBe(true);
    expect(muestraBandaSaldoIa("bajo")).toBe(true);
    expect(muestraBandaSaldoIa("atencion")).toBe(false);
    expect(muestraBandaSaldoIa("ok")).toBe(false);
    expect(muestraBandaSaldoIa("desconocido")).toBe(false);
  });

  it("la etiqueta de la captura es UNA: «Actualizar saldo»", () => {
    expect(ETIQUETA_ACTUALIZAR_SALDO_IA).toBe("Actualizar saldo");
  });
});

describe("consumo de los últimos 7 días (hora Cancún)", () => {
  it("rango [hoy − 6, hoy], cruzando mes y año", () => {
    expect(DIAS_RITMO_IA).toBe(7);
    expect(rangoUltimosDiasIa("2026-10-01")).toEqual({
      desde: "2026-09-25",
      hasta: "2026-10-01",
    });
    expect(rangoUltimosDiasIa("2026-09-20")).toEqual({
      desde: "2026-09-14",
      hasta: "2026-09-20",
    });
    expect(rangoUltimosDiasIa("2027-01-03")).toEqual({
      desde: "2026-12-28",
      hasta: "2027-01-03",
    });
  });

  it("rangoCubre: el mes en pantalla contiene (o no) los 7 días", () => {
    const septiembre = { desde: "2026-09-01", hasta: "2026-09-30" };
    expect(rangoCubre(septiembre, rangoUltimosDiasIa("2026-09-20"))).toBe(true);
    // 1-oct: la semana cae en dos meses ⇒ hace falta otra lectura.
    expect(rangoCubre({ desde: "2026-10-01", hasta: "2026-10-31" }, rangoUltimosDiasIa("2026-10-01"))).toBe(false);
    // Mes pasado en pantalla ⇒ no contiene la semana de hoy.
    expect(rangoCubre(septiembre, rangoUltimosDiasIa("2026-10-15"))).toBe(false);
  });

  it("suma solo los días del rango y acepta `numeric` como texto", () => {
    const porDia = [
      { dia: "2026-09-24", costo_usd: 9.99 }, // fuera
      { dia: "2026-09-25", costo_usd: 0.9 },
      { dia: "2026-09-28", costo_usd: "2.5" },
      { dia: "2026-09-30", costo_usd: 2.37 },
      { dia: "2026-10-01", costo_usd: 1.67 },
      { dia: "2026-10-02", costo_usd: 5 }, // fuera
    ];
    const total = consumoEnRangoIa(porDia, rangoUltimosDiasIa("2026-10-01"));
    expect(total).toBeCloseTo(7.44, 10);
  });

  it("sin serie (resumen que no cargó) ⇒ null, nunca 0", () => {
    expect(consumoEnRangoIa(null, rangoUltimosDiasIa("2026-10-01"))).toBeNull();
    expect(consumoEnRangoIa(undefined, rangoUltimosDiasIa("2026-10-01"))).toBeNull();
    // Serie vacía = el API leyó y no hubo llamadas: 0 de verdad.
    expect(consumoEnRangoIa([], rangoUltimosDiasIa("2026-10-01"))).toBe(0);
  });
});
