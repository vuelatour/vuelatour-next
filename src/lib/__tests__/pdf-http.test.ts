import { describe, expect, it } from "vitest";
import {
  armarContentDisposition,
  escaparHtml,
  nombreArchivoSeguro,
  nombreDeContentDisposition,
  pideHtml,
} from "@/lib/pdf-http";

/**
 * Cabeceras de los proxies de PDF (bug 11-sep-2026: «Check internet
 * connection» al descargar desde el visor de Chrome). Lo que se prueba aquí
 * es lo PURO: conservar el nombre que manda el API y responder `inline` para
 * ver / `attachment` para descargar.
 */
describe("nombreDeContentDisposition", () => {
  it("lee el filename simple con comillas", () => {
    expect(nombreDeContentDisposition('inline; filename="cotizacion-1234.pdf"')).toBe(
      "cotizacion-1234.pdf",
    );
  });

  it("lee el filename sin comillas", () => {
    expect(nombreDeContentDisposition("attachment; filename=recibo-REC-7.pdf")).toBe(
      "recibo-REC-7.pdf",
    );
  });

  it("prefiere filename* (RFC 5987) y lo decodifica", () => {
    const h = "inline; filename=\"cotizacion.pdf\"; filename*=UTF-8''cotizaci%C3%B3n.pdf";
    expect(nombreDeContentDisposition(h)).toBe("cotización.pdf");
  });

  it("devuelve null sin cabecera", () => {
    expect(nombreDeContentDisposition(null)).toBeNull();
    expect(nombreDeContentDisposition("inline")).toBeNull();
  });
});

describe("nombreArchivoSeguro", () => {
  it("quita rutas y comillas; el salto de línea se vuelve espacio", () => {
    expect(nombreArchivoSeguro('../../etc/"pas\nswd".pdf')).toBe("pas swd.pdf");
  });

  it("agrega .pdf si falta y cae al respaldo si queda vacío", () => {
    expect(nombreArchivoSeguro("cotizacion-12")).toBe("cotizacion-12.pdf");
    expect(nombreArchivoSeguro("   ", "respaldo.pdf")).toBe("respaldo.pdf");
  });
});

describe("armarContentDisposition", () => {
  it("inline por defecto (el visor muestra el PDF)", () => {
    expect(armarContentDisposition("cotizacion-1234.pdf")).toBe(
      'inline; filename="cotizacion-1234.pdf"; filename*=UTF-8\'\'cotizacion-1234.pdf',
    );
  });

  it("attachment cuando se pidió descargar", () => {
    expect(armarContentDisposition("recibo-REC-7.pdf", { descargar: true })).toContain(
      'attachment; filename="recibo-REC-7.pdf"',
    );
  });

  it("manda el nombre con acentos en filename* y ASCII en filename", () => {
    const h = armarContentDisposition("cotización.pdf");
    expect(h).toContain('filename="cotizaci-n.pdf"');
    expect(h).toContain("filename*=UTF-8''cotizaci%C3%B3n.pdf");
  });

  it("nunca rompe la cabecera con comillas ni saltos de línea", () => {
    const h = armarContentDisposition('mal"nombre\n.pdf');
    expect(h).not.toContain("\n");
    expect(h.match(/"/g)).toHaveLength(2);
  });
});

describe("pideHtml / escaparHtml", () => {
  it("detecta una navegación del navegador", () => {
    expect(pideHtml("text/html,application/xhtml+xml,*/*;q=0.8")).toBe(true);
    expect(pideHtml("application/pdf, application/json")).toBe(false);
    expect(pideHtml(null)).toBe(false);
  });

  it("escapa el mensaje del API antes de pintarlo", () => {
    expect(escaparHtml('<script>"x"</script>')).toBe(
      "&lt;script&gt;&quot;x&quot;&lt;/script&gt;",
    );
  });
});
