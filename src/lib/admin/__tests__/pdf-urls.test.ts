import { describe, expect, it } from "vitest";
import {
  rutaPdfCotizacion,
  rutaPdfGrupo,
  rutaPdfInternoCotizacion,
  rutaReciboCobro,
  rutaReciboDeCobro,
  rutaReciboSobreGrupo,
} from "@/lib/admin/pdf-urls";

const QUOTE = "0d4a2b1c-1111-4222-8333-444455556666";
const COBRO = "11111111-2222-4333-8444-555566667777";
const SOBRE = "99999999-8888-4777-8666-555544443333";

/**
 * Rutas de los PDF del panel: SIEMPRE el proxy (nunca `blob:`), y el botón
 * «Descargar» agrega `?descargar=1` para que el proxy responda `attachment`.
 */
describe("rutas de PDF", () => {
  it("abre el PDF del cliente por el proxy de la cotización", () => {
    expect(rutaPdfCotizacion(QUOTE)).toBe(`/api/quotes/${QUOTE}/pdf`);
  });

  it("agrega ?descargar=1 solo cuando se pide la descarga", () => {
    expect(rutaPdfCotizacion(QUOTE, { descargar: true })).toBe(
      `/api/quotes/${QUOTE}/pdf?descargar=1`,
    );
    expect(rutaPdfCotizacion(QUOTE, { descargar: false })).toBe(`/api/quotes/${QUOTE}/pdf`);
  });

  it("PDF interno y PDF de grupo tienen su propia ruta", () => {
    expect(rutaPdfInternoCotizacion(QUOTE)).toBe(`/api/quotes/${QUOTE}/pdf-interno`);
    expect(rutaPdfGrupo(QUOTE, { descargar: true })).toBe(
      `/api/grupos/${QUOTE}/pdf?descargar=1`,
    );
  });

  it("ninguna ruta apunta al API ni a un blob", () => {
    const todas = [
      rutaPdfCotizacion(QUOTE),
      rutaPdfInternoCotizacion(QUOTE),
      rutaPdfGrupo(QUOTE),
      rutaReciboCobro(COBRO),
      rutaReciboSobreGrupo(SOBRE),
    ];
    for (const r of todas) {
      expect(r.startsWith("/api/")).toBe(true);
      expect(r).not.toContain("blob:");
      expect(r).not.toContain("/v1/");
    }
  });
});

describe("rutaReciboDeCobro", () => {
  it("un cobro suelto usa su propio recibo", () => {
    expect(rutaReciboDeCobro({ id: COBRO })).toBe(`/api/flights/cobros/${COBRO}/recibo`);
  });

  it("una PARTE de un sobre de grupo usa el recibo del SOBRE (el cliente pagó uno solo)", () => {
    expect(rutaReciboDeCobro({ id: COBRO, cobro_grupo: { id: SOBRE } })).toBe(
      `/api/grupos/cobros/${SOBRE}/recibo`,
    );
  });

  it("cobro_grupo nulo = recibo del cobro", () => {
    expect(rutaReciboDeCobro({ id: COBRO, cobro_grupo: null }, { descargar: true })).toBe(
      `/api/flights/cobros/${COBRO}/recibo?descargar=1`,
    );
  });
});
