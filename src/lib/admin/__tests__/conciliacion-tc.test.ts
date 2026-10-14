/**
 * Compras en dólares contra el T.C. oficial del día (13-oct-2026, API
 * 0.0.75). La regla es del API; aquí se custodia que el panel PINTE lo que
 * manda: capacidad pegajosa, tonos de la 3.ª línea del candidato, la marca de
 * una liga cruzada, el aviso al marcar UNO lejos (no bloquea), el sufijo de
 * moneda y los textos exactos.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_TC_SIN_LECTURA,
  AVISO_VINCULAR_SIN_LECTURA,
  BOTON_VINCULAR_DE_TODOS_MODOS,
  NOTA_COMPRAS_USD,
  PLACEHOLDER_BUSCAR_GASTO_CON_USD,
  PLACEHOLDER_BUSCAR_GASTO_SIN_TC,
  SUFIJO_TITULO_LIGA_SOSPECHOSA,
  apiCruzaConOficial,
  avisoTcSinLectura,
  avisoVincularCruzado,
  lineaTcCandidato,
  marcaLigaCruzada,
  sufijoMonedaLigada,
  textoAvisoVincularCruzado,
} from "@/lib/admin/conciliacion-tc";
import { NOTA_VENTANA_CARGO } from "@/lib/admin/conciliacion-lote";
import type { TcCruceUsd } from "@/types/conciliacion";
import { TUBO_CERCA, TUBO_LEJOS } from "./tc-cruce.fixtures";

const SIN_OFICIAL: TcCruceUsd = {
  ...TUBO_CERCA,
  tc_oficial: null,
  tc_oficial_fecha: null,
  tc_oficial_fuente: null,
  desvio_pct: null,
  nivel: "SIN_OFICIAL",
  texto: "T.C. 17.55 · sin T.C. oficial del día",
  titulo: "T.C. exacto 17.550770 (pesos del cargo ÷ dólares del gasto) · sin T.C. oficial del día del cargo: no se puede comparar",
};

const FUERA_DE_BANDA: TcCruceUsd = {
  ...TUBO_CERCA,
  tc_implicito: 11.509631,
  en_banda: false,
  desvio_pct: -37.5,
  nivel: "LEJOS",
  fuera_de_lugar: true,
  texto: "T.C. 11.51 · oficial 18.41 (−37.5 %): fuera de la banda 15–25",
};

describe("apiCruzaConOficial: la capacidad del API 0.0.75", () => {
  it("la raíz `tc_oficial` presente (aunque sea null) ⇒ sí; ausente ⇒ no", () => {
    expect(apiCruzaConOficial({ tc_oficial: null })).toBe(true);
    expect(apiCruzaConOficial({ tc_oficial: { tc: 17.0077, fecha_dato: "2026-09-01", fuente: "open.er-api" } })).toBe(true);
    expect(apiCruzaConOficial({ candidatos: [] })).toBe(false);
    expect(apiCruzaConOficial(null)).toBe(false);
    expect(apiCruzaConOficial(undefined)).toBe(false);
  });
});

describe("lineaTcCandidato: la 3.ª línea del candidato cruzado", () => {
  it("CERCA y SIN_OFICIAL en tono normal; LEJOS o fuera de banda en ámbar", () => {
    expect(lineaTcCandidato({ tc_cruce: TUBO_CERCA })).toEqual({
      texto: TUBO_CERCA.texto,
      titulo: TUBO_CERCA.titulo,
      tono: "normal",
    });
    expect(lineaTcCandidato({ tc_cruce: SIN_OFICIAL })?.tono).toBe("normal");
    expect(lineaTcCandidato({ tc_cruce: TUBO_LEJOS })?.tono).toBe("ambar");
    expect(lineaTcCandidato({ tc_cruce: { ...FUERA_DE_BANDA, nivel: "CERCA" } })?.tono).toBe("ambar");
  });

  it("sin `tc_cruce` (API previo o gasto en pesos) ⇒ null", () => {
    expect(lineaTcCandidato({})).toBeNull();
    expect(lineaTcCandidato({ tc_cruce: null })).toBeNull();
    expect(lineaTcCandidato(null)).toBeNull();
  });
});

describe("marcaLigaCruzada: la liga en la bandeja", () => {
  it("fuera de lugar ⇒ «⚠ …» ámbar con el tooltip que manda al pre-cierre", () => {
    expect(marcaLigaCruzada(TUBO_LEJOS)).toEqual({
      texto: "⚠ T.C. 21.14 · oficial 17.01 (+24.3 %): lejos del oficial",
      titulo: `${TUBO_LEJOS.titulo}\nRevisa que este cargo sea esa compra: el pre-cierre lista estas ligas. El sistema no corrige nada solo.`,
      tono: "ambar",
    });
    expect(SUFIJO_TITULO_LIGA_SOSPECHOSA.startsWith("\n")).toBe(true);
  });

  it("cuadra ⇒ el texto tenue; sin tc ⇒ null", () => {
    expect(marcaLigaCruzada(TUBO_CERCA)).toEqual({ texto: TUBO_CERCA.texto, titulo: TUBO_CERCA.titulo, tono: "tenue" });
    expect(marcaLigaCruzada(null)).toBeNull();
    expect(marcaLigaCruzada(undefined)).toBeNull();
  });
});

describe("avisoVincularCruzado: solo con EXACTAMENTE UN marcado lejos", () => {
  it("uno LEJOS ⇒ aviso + el T.C. + «Vincular de todos modos» (la tolerancia sale del tc_cruce)", () => {
    expect(avisoVincularCruzado([{ tc_cruce: TUBO_LEJOS }])).toEqual({
      texto:
        "El tipo de cambio de este gasto en dólares queda a más de ±2 % del oficial del día del cargo: confirma que este cargo sea esa compra antes de vincular (a veces el banco cobra un poco más que el oficial).",
      detalle: TUBO_LEJOS.texto,
      boton: "Vincular de todos modos",
    });
    expect(avisoVincularCruzado([{ tc_cruce: { ...TUBO_LEJOS, tolerancia_pct: 3 } }])?.texto).toContain("±3 %");
    expect(textoAvisoVincularCruzado(2.5)).toContain("±2.5 %");
    expect(BOTON_VINCULAR_DE_TODOS_MODOS).toBe("Vincular de todos modos");
  });

  it("null con 0 marcados, con 2, con uno CERCA, SIN_OFICIAL o sin tc_cruce", () => {
    expect(avisoVincularCruzado([])).toBeNull();
    expect(avisoVincularCruzado([{ tc_cruce: TUBO_LEJOS }, { tc_cruce: TUBO_LEJOS }])).toBeNull();
    expect(avisoVincularCruzado([{ tc_cruce: TUBO_CERCA }])).toBeNull();
    expect(avisoVincularCruzado([{ tc_cruce: SIN_OFICIAL }])).toBeNull();
    expect(avisoVincularCruzado([{}])).toBeNull();
    expect(avisoVincularCruzado(null)).toBeNull();
  });
});

/** La lectura del oficial FALLÓ (revisión del lote 2, 14-oct-2026): el tubo
 *  del caso Aircraft Spruce, +24.3 % real, que antes salía en gris como
 *  «sin T.C. oficial del día». */
const SIN_LECTURA: TcCruceUsd = {
  ...SIN_OFICIAL,
  tc_implicito: 21.140283,
  texto: "T.C. 21.14 · no se pudo leer el T.C. oficial del día",
  titulo:
    "T.C. exacto 21.140283 (pesos del cargo ÷ dólares del gasto) · no se pudo leer el T.C. oficial del día del cargo: no se comprobó; vuelve a abrir «Vincular gasto» para compararlo",
  lectura_fallida: true,
};

describe("lectura FALLIDA del T.C. oficial (≠ «sin dato»)", () => {
  it("la 3.ª línea va en ámbar y el aviso al marcarlo ofrece «Vincular de todos modos»", () => {
    expect(lineaTcCandidato({ tc_cruce: SIN_LECTURA })).toEqual({
      texto: SIN_LECTURA.texto,
      titulo: SIN_LECTURA.titulo,
      tono: "ambar",
    });
    expect(avisoVincularCruzado([{ tc_cruce: SIN_LECTURA }])).toEqual({
      texto: AVISO_VINCULAR_SIN_LECTURA,
      detalle: "T.C. 21.14 · no se pudo leer el T.C. oficial del día",
      boton: BOTON_VINCULAR_DE_TODOS_MODOS,
    });
    // Un SIN_OFICIAL de verdad (sin dato ese día) sigue sin aviso y en gris.
    expect(avisoVincularCruzado([{ tc_cruce: SIN_OFICIAL }])).toBeNull();
    expect(lineaTcCandidato({ tc_cruce: SIN_OFICIAL })?.tono).toBe("normal");
  });

  it("la raíz `tc_oficial_lectura_fallida` ⇒ aviso del diálogo; sin ella (o false) ⇒ nada", () => {
    expect(avisoTcSinLectura({ tc_oficial: null, tc_oficial_lectura_fallida: true })).toBe(AVISO_TC_SIN_LECTURA);
    expect(avisoTcSinLectura({ tc_oficial: null })).toBeNull();
    expect(avisoTcSinLectura({ tc_oficial_lectura_fallida: false })).toBeNull();
    expect(avisoTcSinLectura(null)).toBeNull();
    expect(AVISO_TC_SIN_LECTURA).toBe(
      "No se pudo leer el T.C. oficial del día del cargo: las compras en dólares salen sin compararse contra él y no se pueden buscar por su monto en pesos. Cierra y vuelve a abrir «Vincular gasto» para compararlas.",
    );
    expect(AVISO_VINCULAR_SIN_LECTURA).toBe(
      "No se pudo comprobar el tipo de cambio de este gasto en dólares contra el oficial del día del cargo (la lectura falló): confirma que este cargo sea esa compra antes de vincular, o vuelve a abrir «Vincular gasto» para compararlo.",
    );
    // El buscador ya no promete la búsqueda en pesos.
    expect(PLACEHOLDER_BUSCAR_GASTO_SIN_TC).toBe(
      "Busca por monto (las compras en dólares, por su monto en dólares), proveedor o nota",
    );
    expect(PLACEHOLDER_BUSCAR_GASTO_SIN_TC).not.toContain("en pesos");
  });
});

describe("sufijo de moneda y textos", () => {
  it("« USD» solo en otra moneda; '' en pesos o vacío", () => {
    expect(sufijoMonedaLigada("USD")).toBe(" USD");
    expect(sufijoMonedaLigada("MXN")).toBe("");
    expect(sufijoMonedaLigada(null)).toBe("");
    expect(sufijoMonedaLigada("")).toBe("");
  });

  it("placeholder y nota exactos; sin `cruzaUsd` la nota es byte a byte la de antes", () => {
    expect(PLACEHOLDER_BUSCAR_GASTO_CON_USD).toBe("Busca por monto en pesos o en dólares (2801.40), proveedor o nota");
    expect(NOTA_COMPRAS_USD).toBe(
      " En esta cuenta en pesos también salen las compras en dólares con tarjeta: primero las que cuadran con el tipo de cambio oficial del día del cargo; búscalas por su monto en dólares o en pesos.",
    );
    const antes =
      "Gastos bancarios (tarjeta, transferencia, PayWise o pago domiciliado) sin conciliar, en la moneda de la cuenta y con fecha ±30 días del cargo; sin búsqueda, primero los que cuadran con su monto. Si el cargo pagó varias facturas, márcalas todas: deben sumar el cargo.";
    expect(NOTA_VENTANA_CARGO(30)).toBe(antes);
    expect(NOTA_VENTANA_CARGO(30, false, false)).toBe(antes);
    expect(NOTA_VENTANA_CARGO(30, false, true)).toBe(antes + NOTA_COMPRAS_USD);
    expect(NOTA_VENTANA_CARGO(120, true, true).endsWith(NOTA_COMPRAS_USD)).toBe(true);
  });
});
