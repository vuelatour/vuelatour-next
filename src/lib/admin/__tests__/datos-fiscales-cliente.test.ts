/**
 * Badge «RFC / Datos fiscales» de la tabla de clientes (3-nov-2026): a medias
 * dice QUÉ falta. Casos reales del 2-nov-2026: ACP (RFC, razón, régimen y CP
 * sin uso CFDI) y Beh Kay (régimen y uso sin RFC ni CP).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  etiquetaDatosFiscales,
  TEXTO_FISCALES_COMPLETOS,
  TEXTO_FISCALES_SIN_CAPTURAR,
  TITULO_FISCALES_FALTAN,
} from "../datos-fiscales-cliente";
import {
  CAMPOS_FISCALES_CLIENTE,
  datosFiscalesCompletos,
  datosFiscalesFaltantes,
  RFC_EXTRANJERO,
  type DatosFiscalesCliente,
} from "@/types/clients";

const cliente = (p: Partial<DatosFiscalesCliente>): DatosFiscalesCliente => ({
  rfc: null,
  regimen_fiscal_receptor: null,
  uso_cfdi: null,
  codigo_postal: null,
  ...p,
});
const ACP = cliente({ rfc: "ACP900126SF1", regimen_fiscal_receptor: "601", codigo_postal: "06700" });
const BEH = cliente({ regimen_fiscal_receptor: "601", uso_cfdi: "G03" });
const COMPLETO = cliente({
  rfc: "MOD221026JL7",
  regimen_fiscal_receptor: "601",
  uso_cfdi: "G03",
  codigo_postal: "03900",
});

describe("datosFiscalesFaltantes", () => {
  it("lista lo que falta en el orden de los campos; [] = completo", () => {
    expect(datosFiscalesFaltantes(ACP)).toEqual(["Uso CFDI"]);
    expect(datosFiscalesFaltantes(BEH)).toEqual(["RFC", "Código postal"]);
    expect(datosFiscalesFaltantes(cliente({}))).toEqual(
      CAMPOS_FISCALES_CLIENTE.map(([, etiqueta]) => etiqueta),
    );
    expect(datosFiscalesFaltantes(COMPLETO)).toEqual([]);
  });

  it("extranjero (RFC genérico): no falta nada, el API pone régimen/uso/CP", () => {
    expect(datosFiscalesFaltantes(cliente({ rfc: RFC_EXTRANJERO }))).toEqual([]);
  });

  it("datosFiscalesCompletos deriva de la misma regla", () => {
    for (const c of [ACP, BEH, cliente({}), COMPLETO, cliente({ rfc: RFC_EXTRANJERO })]) {
      expect(datosFiscalesCompletos(c)).toBe(datosFiscalesFaltantes(c).length === 0);
    }
  });
});

describe("etiquetaDatosFiscales", () => {
  it("completo / nada capturado / a medias", () => {
    expect(etiquetaDatosFiscales(COMPLETO)).toEqual({ completos: true, texto: TEXTO_FISCALES_COMPLETOS });
    expect(etiquetaDatosFiscales(cliente({ rfc: RFC_EXTRANJERO }))).toEqual({
      completos: true,
      texto: TEXTO_FISCALES_COMPLETOS,
    });
    expect(etiquetaDatosFiscales(cliente({}))).toEqual({
      completos: false,
      texto: TEXTO_FISCALES_SIN_CAPTURAR,
    });
    expect(etiquetaDatosFiscales(ACP)).toEqual({ completos: false, texto: "Falta: Uso CFDI" });
    expect(etiquetaDatosFiscales(BEH)).toEqual({ completos: false, texto: "Faltan: RFC, Código postal" });
    expect(TEXTO_FISCALES_SIN_CAPTURAR).toBe("Faltan datos fiscales");
    expect(TITULO_FISCALES_FALTAN.length).toBeGreaterThan(10);
  });

  it("cableado: la tabla pinta el badge desde la etiqueta y ya no trae el texto fijo", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../components/admin/clients/clients-table.tsx"),
      "utf8",
    );
    expect(src).toContain("const { completos, texto } = etiquetaDatosFiscales(cliente);");
    expect(src).toContain("<BadgeDatosFiscales cliente={c} />");
    expect(src).toContain("title={TITULO_FISCALES_FALTAN}");
    expect(src.split("{texto}").length - 1).toBe(2);
    expect(src).not.toContain("datosFiscalesCompletos(");
  });
});
