/**
 * FACTURA DEL SERVICIO por vuelo (22-sep-2026).
 *
 * Pedido del cliente: «agregar por cada vuelo las opciones para identificar
 * vuelos facturado, sin factura, factura elaborada y enviada». Lo que se
 * custodia aquí es la TOLERANCIA (un API sin desplegar tiene que pintar
 * exactamente la pantalla de hoy) y que el CFDI mande siempre.
 */
import { describe, expect, it } from "vitest";
import {
  FACTURA_CLIENTE_ESTADOS,
  MAX_BYTES_FACTURA,
  bloqueadoPorCfdi,
  estadoFacturaCliente,
  estatusFacturaCliente,
  motivoArchivoInvalido,
  textoArchivoFactura,
} from "@/lib/admin/factura-cliente";

describe("estatusFacturaCliente", () => {
  it("API SIN el bloque (deploy en dos tiempos): se comporta como hoy", () => {
    expect(estatusFacturaCliente({ facturado: false })).toBe("SIN_FACTURA");
    expect(estatusFacturaCliente({ facturado: true })).toBe("FACTURADO");
    expect(estatusFacturaCliente({})).toBe("SIN_FACTURA");
  });

  it("con el bloque manda su estatus", () => {
    expect(
      estatusFacturaCliente({
        facturado: false,
        factura_cliente: { estatus: "ELABORADA_ENVIADA", archivo: null },
      }),
    ).toBe("ELABORADA_ENVIADA");
  });

  it("el CFDI timbrado gana sobre el estatus manual", () => {
    expect(
      estatusFacturaCliente({
        facturado: true,
        factura_cliente: { estatus: "SIN_FACTURA", archivo: null },
      }),
    ).toBe("FACTURADO");
    expect(bloqueadoPorCfdi({ facturado: true })).toBe(true);
    expect(bloqueadoPorCfdi({ facturado: false })).toBe(false);
  });

  it("un valor desconocido NUNCA se lee como «facturado»", () => {
    expect(
      estatusFacturaCliente({
        facturado: false,
        factura_cliente: { estatus: "LO_QUE_SEA", archivo: null },
      }),
    ).toBe("SIN_FACTURA");
  });
});

describe("catálogo de estados", () => {
  it("son los tres que pidió el cliente, con sus palabras", () => {
    expect(FACTURA_CLIENTE_ESTADOS.map((e) => e.value)).toEqual([
      "SIN_FACTURA",
      "ELABORADA_ENVIADA",
      "FACTURADO",
    ]);
    expect(FACTURA_CLIENTE_ESTADOS.map((e) => e.label)).toEqual([
      "Sin factura",
      "Factura elaborada y enviada",
      "Facturado",
    ]);
    expect(estadoFacturaCliente("FACTURADO").label).toBe("Facturado");
    expect(estadoFacturaCliente(undefined).value).toBe("SIN_FACTURA");
  });
});

describe("archivo de la factura", () => {
  it("acepta PDF y XML, y rechaza lo demás con una razón", () => {
    expect(motivoArchivoInvalido({ name: "factura-232.pdf", size: 1000 })).toBeNull();
    expect(motivoArchivoInvalido({ name: "CFDI.XML", size: 1000 })).toBeNull();
    expect(motivoArchivoInvalido({ name: "foto.jpg", size: 1000 })).toContain("PDF o XML");
    expect(
      motivoArchivoInvalido({ name: "grande.pdf", size: MAX_BYTES_FACTURA + 1 }),
    ).toContain("10 MB");
  });

  it("el renglón dice qué archivo es, quién lo subió y cuándo", () => {
    expect(
      textoArchivoFactura(
        {
          path: "vuelos/v-1/abc.pdf",
          nombre: "factura-232.pdf",
          subida_at: "2026-09-22T18:00:00Z",
          subida_por_nombre: "Itzi",
        },
        "22 sep 2026",
      ),
    ).toBe("factura-232.pdf · subió Itzi · 22 sep 2026");
    // Sin nombre de quien subió no se inventa un «—».
    expect(
      textoArchivoFactura({ path: "p", nombre: null, subida_at: null }, undefined),
    ).toBe("Factura del servicio");
    expect(textoArchivoFactura(null)).toBeNull();
  });
});
