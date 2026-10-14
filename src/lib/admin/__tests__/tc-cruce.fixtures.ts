/**
 * Fixtures del T.C. oficial del día (13-oct-2026, API 0.0.75) con los datos
 * REALES del caso Aircraft Spruce. No es un archivo de pruebas (vitest solo
 * corre `*.test.ts(x)`): lo comparten `conciliacion-tc.test.ts`,
 * `pre-cierre-tc-usd.test.ts` y las pruebas de componentes.
 */
import type { TcCruceUsd } from "@/types/conciliacion";

/** El tubo Michelin (422.86 USD) con su cargo REAL «AIRCRAFT SPRUCE AND SP» $7,214.14. */
export const TUBO_CERCA: TcCruceUsd = {
  tc_implicito: 17.060351,
  en_banda: true,
  tc_oficial: 17.0077,
  tc_oficial_fecha: "2026-09-01",
  tc_oficial_fuente: "open.er-api",
  desvio_pct: 0.3,
  nivel: "CERCA",
  tolerancia_pct: 2,
  fuera_de_lugar: false,
  texto: "T.C. 17.06 · oficial 17.01 (+0.3 %)",
  titulo:
    "T.C. exacto 17.060351 (pesos del cargo ÷ dólares del gasto) · oficial 17.0077 del 01 sep 2026 · fuente open.er-api · tolerancia ±2 %",
};

/** El mismo tubo contra «ASA CANCUN» $8,939.38 (la liga equivocada que se corrigió el 13-oct). */
export const TUBO_LEJOS: TcCruceUsd = {
  ...TUBO_CERCA,
  tc_implicito: 21.140283,
  desvio_pct: 24.3,
  nivel: "LEJOS",
  fuera_de_lugar: true,
  texto: "T.C. 21.14 · oficial 17.01 (+24.3 %): lejos del oficial",
  titulo:
    "T.C. exacto 21.140283 (pesos del cargo ÷ dólares del gasto) · oficial 17.0077 del 01 sep 2026 · fuente open.er-api · tolerancia ±2 %",
};
