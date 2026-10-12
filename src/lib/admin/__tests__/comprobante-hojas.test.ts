import { describe, expect, it } from "vitest";
import {
  MAX_HOJAS_COMPROBANTE,
  aceptarArchivosComprobante,
  archivosDelComprobante,
  hojasDe,
  nombreCorto,
  textoHojas,
  tituloHojas,
  valorIaConHojas,
} from "../comprobante-hojas";

const archivo = (name: string, type: string, size = 1000) => {
  const f = new File([new Uint8Array(size)], name, { type });
  return f;
};

describe("comprobante con varias hojas", () => {
  it("hojasDe lee fotos_adicionales sin repetir el principal ni vacíos", () => {
    expect(
      hojasDe({
        foto_url: "oficina/a.pdf",
        valor_ia_extraido: { fotos_adicionales: ["oficina/b.pdf", "oficina/a.pdf", "", "oficina/b.pdf", 3] },
      }),
    ).toEqual(["oficina/b.pdf"]);
    expect(hojasDe({ foto_url: "x", valor_ia_extraido: null })).toEqual([]);
    expect(hojasDe({ foto_url: "x", valor_ia_extraido: { fotos_adicionales: "no" } })).toEqual([]);
    expect(archivosDelComprobante({ foto_url: "a", valor_ia_extraido: { fotos_adicionales: ["b", "c"] } })).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(archivosDelComprobante({ foto_url: null, valor_ia_extraido: { fotos_adicionales: ["b"] } })).toEqual(["b"]);
  });

  it("valorIaConHojas conserva la lectura de la IA y funde las hojas; sin nada no viaja", () => {
    expect(valorIaConHojas({ monto: 10, disponible: true, motivo: "x" }, ["p2", "p2", "p3"])).toEqual({
      monto: 10,
      fotos_adicionales: ["p2", "p3"],
    });
    expect(valorIaConHojas({ monto: 10, fotos_adicionales: ["viejo"] }, [])).toEqual({ monto: 10 });
    expect(valorIaConHojas(null, [])).toBeUndefined();
    expect(valorIaConHojas(null, ["p2"])).toEqual({ fotos_adicionales: ["p2"] });
  });

  it("textos de la columna", () => {
    expect(textoHojas(0)).toBeNull();
    expect(textoHojas(1)).toBe("+1 hoja");
    expect(textoHojas(4)).toBe("+4 hojas");
    expect(tituloHojas(2)).toContain("2 hojas más");
  });

  it("aceptarArchivosComprobante: tipos, peso y tope, sin descartar en silencio", () => {
    const ok = aceptarArchivosComprobante([archivo("a.pdf", "application/pdf"), archivo("b.jpg", "image/jpeg")], 0);
    expect(ok).toEqual({ ok: true, archivos: expect.any(Array) });
    if (ok.ok) expect(ok.archivos.map((f) => f.name)).toEqual(["a.pdf", "b.jpg"]);
    const malo = aceptarArchivosComprobante(
      [archivo("c.heic", "image/heic"), archivo("d.pdf", "application/pdf", 11 * 1024 * 1024), archivo("e.pdf", "application/pdf")],
      0,
    );
    expect(malo.ok).toBe(false);
    if (!malo.ok) {
      expect(malo.archivos.map((f) => f.name)).toEqual(["e.pdf"]);
      expect(malo.mensaje).toContain("c.heic");
      expect(malo.mensaje).toContain("d.pdf");
    }
    const muchos = Array.from({ length: MAX_HOJAS_COMPROBANTE + 2 }, (_, i) => archivo(`t${i}.pdf`, "application/pdf"));
    const tope = aceptarArchivosComprobante(muchos, 1);
    expect(tope.ok).toBe(false);
    if (!tope.ok) {
      expect(tope.archivos).toHaveLength(MAX_HOJAS_COMPROBANTE - 1);
      expect(tope.mensaje).toContain("se quedaron fuera");
    }
  });

  it("nombreCorto recorta conservando la extensión", () => {
    expect(nombreCorto("factura.pdf")).toBe("factura.pdf");
    expect(nombreCorto("un-nombre-de-archivo-larguisimo-de-la-gasolinera-del-aeropuerto.pdf", 30)).toMatch(/^un-nombre-de-archivo-larg.*…\.pdf$/);
  });
});
