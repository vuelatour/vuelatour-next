import { describe, expect, it } from "vitest";
import { fmtTc, TC_DECIMALES } from "@/lib/format";

/**
 * PARIDAD DEL TEXTO DEL T.C. ENTRE REPOS (17-sep-2026).
 *
 * `fmtTc` (panel) tiene que decir EXACTAMENTE lo mismo que `_tc_txt`
 * (pyservices, `app/services/_formato.py`) y guardar la misma precisión que
 * el API (`common/tc.util.ts`, `numeric(12,6)`). La tabla de abajo es la
 * MISMA que congela el test de pyservices
 * (`tests/test_cotizacion_pdf.py::test_tc_txt`): si alguien la mueve en un
 * repo y no en el otro, la hoja editable del panel y el PDF vuelven a
 * imprimir dos T.C. distintos para el mismo dato — que es justo el bug del
 * vuelo #314 que reportó el cliente.
 *
 * El test de fidelidad de la hoja (`components/admin/quotes/__tests__/
 * quote-sheet.test.tsx`, fixture `hoja-tc6`) lo comprueba además de punta a
 * punta contra el HTML REAL que genera pyservices.
 */
describe("fmtTc = `_tc_txt` de pyservices (hasta 6 decimales, sin ceros de cola)", () => {
  it("la precisión canónica es la del API (`numeric(12,6)`)", () => {
    expect(TC_DECIMALES).toBe(6);
  });

  it("tabla congelada (misma que el test de pyservices)", () => {
    // El T.C. con el que 5,885.25 USD dan $100,000.00 MXN (vuelo #314).
    expect(fmtTc(16.991632)).toBe("16.991632");
    // Lo que se veía antes con `:g` / `numeroG` (6 cifras significativas).
    expect(fmtTc(16.9916)).toBe("16.9916");
    expect(fmtTc(17.25)).toBe("17.25");
    expect(fmtTc(18.1)).toBe("18.1");
    // NUNCA «18.000000».
    expect(fmtTc(18.0)).toBe("18");
    expect(fmtTc(0)).toBe("0");
    // Más de 6 decimales: se redondea al 6º (tope de lo que guarda el API).
    expect(fmtTc(16.9916327)).toBe("16.991633");
    expect(fmtTc(null)).toBe("");
  });

  it("vacío/indefinido/no numérico → cadena vacía (quien llama decide el «—»)", () => {
    expect(fmtTc(undefined)).toBe("");
    expect(fmtTc("")).toBe("");
    expect(fmtTc("no-es-numero")).toBe("");
    expect(fmtTc(Number.NaN)).toBe("");
    expect(fmtTc(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("acepta el numeric como string (así llega del API)", () => {
    expect(fmtTc("16.991632")).toBe("16.991632");
    expect(fmtTc("18.1000")).toBe("18.1");
    expect(fmtTc("17.500000")).toBe("17.5");
  });

  it("el T.C. impreso REPRODUCE los pesos (el bug del #314 ya no cabe)", () => {
    // Antes: la hoja imprimía «16.9916» junto a $100,000.00 y quien
    // multiplicaba obtenía 99,999.81.
    expect(Math.round(5885.25 * Number(fmtTc(16.991632)) * 100) / 100).toBe(100000);
    expect(Math.round(5885.25 * 16.9916 * 100) / 100).toBe(99999.81);
  });

  it("es idempotente: reformatear su propia salida no mueve el texto", () => {
    for (const tc of [16.991632, 18, 17.25, 18.1, 0, 16.9916]) {
      expect(fmtTc(fmtTc(tc))).toBe(fmtTc(tc));
    }
  });
});
