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
  AVISO_FOLIO_NO_DISPONIBLE,
  FACTURA_CLIENTE_ESTADOS,
  LIMITE_FOLIO_FACTURA,
  MAX_BYTES_FACTURA,
  bloqueadoPorCfdi,
  confirmarSubida,
  datosDeCfdi,
  estadoFacturaCliente,
  estatusFacturaCliente,
  folioAEnviar,
  megasDe,
  mensajeFalloSubidaFactura,
  motivoArchivoInvalido,
  normalizarFolio,
  ofreceCapturarFolio,
  soportaFolio,
  textoArchivoFactura,
  textoDeXmlBytes,
  textoFacturaGuardada,
  textoPesoExcedido,
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

// ============================ FOLIO (24-sep-2026) ============================
//
// Palabras del cliente: «subí la factura de un vuelo, peroooo al momento de
// descargar el reporte en Excel sí aparece la columna de factura (del vuelo)
// pero no aparece el folio de la factura que subí en el registro».

/**
 * CFDI 4.0 con la ESTRUCTURA del XML real que el API usa en su spec (el
 * huérfano de `facturas/recibidas/`, AEROPUERTO DE MERIDA FECMID-90255): BOM,
 * declaración, `cfdi:Comprobante` con Serie/Folio entre NoCertificado y
 * Certificado, y el `tfd:TimbreFiscalDigital` dentro de `cfdi:Complemento`.
 * Mismo texto que `factura-cliente.folio.spec.ts` del API: si el parser del
 * panel y el del API dejaran de coincidir, el prellenado mentiría.
 */
const CFDI_40 =
  '﻿<?xml version="1.0" encoding="utf-8"?>' +
  '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'Version="4.0" Fecha="2026-06-03T09:47:41" Moneda="MXN" TipoCambio="1" ' +
  'SubTotal="215.30" Total="249.75" FormaPago="28" TipoDeComprobante="I" ' +
  'MetodoPago="PUE" LugarExpedicion="97295" Exportacion="01" ' +
  'NoCertificado="00001000000704178991" Serie="FECMID" Folio="90255" ' +
  'Certificado="MIIGITCCBAmgAwIBAgIUMDAwMDEwMDAwMDA3MDQxNzg5OTEwDQYJKoZIhvcNAQELBQAw" ' +
  'Sello="U7DK/58P3ybSzHadJ6C3gzqFD50641FB5LEjdw==">' +
  '<cfdi:Emisor Rfc="AME980401BI7" Nombre="AEROPUERTO DE MERIDA" RegimenFiscal="601"/>' +
  '<cfdi:Complemento><tfd:TimbreFiscalDigital ' +
  'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" ' +
  'UUID="df1bfb5f-4d88-4f51-ac50-a7b72299128e" FechaTimbrado="2026-06-03T10:48:06"/>' +
  '</cfdi:Complemento></cfdi:Comprobante>';

describe("folio: normalización (espejo del API)", () => {
  it("recorta, colapsa espacios y quita controles; vacío ⇒ null", () => {
    expect(normalizarFolio("  A-1234  ")).toBe("A-1234");
    expect(normalizarFolio("A   12\t34")).toBe("A 12 34");
    expect(normalizarFolio("A\u0000B")).toBe("A B");
    expect(normalizarFolio("   ")).toBeNull();
    expect(normalizarFolio(null)).toBeNull();
    expect(normalizarFolio(1234)).toBe("1234");
  });

  it("no cambia mayúsculas y topa en 40", () => {
    expect(normalizarFolio("fac-a1")).toBe("fac-a1");
    expect(normalizarFolio("X".repeat(60))).toHaveLength(LIMITE_FOLIO_FACTURA);
  });
});

describe("folio: ¿el API ya lo soporta?", () => {
  it("la LLAVE decide, no el valor", () => {
    expect(soportaFolio({ estatus: "FACTURADO", archivo: null, folio: null })).toBe(true);
    expect(soportaFolio({ estatus: "FACTURADO", archivo: null, folio: "A-1" })).toBe(true);
    // API 0.0.28: el bloque no trae la llave ⇒ ni se ofrece ni se manda.
    expect(soportaFolio({ estatus: "FACTURADO", archivo: null })).toBe(false);
    expect(soportaFolio(null)).toBe(false);
    expect(soportaFolio(undefined)).toBe(false);
  });

  it("«Agregar folio» sin archivo solo con seguimiento (caso #297)", () => {
    expect(ofreceCapturarFolio({ estatus: "FACTURADO", tieneArchivo: false })).toBe(true);
    expect(ofreceCapturarFolio({ estatus: "ELABORADA_ENVIADA", tieneArchivo: false })).toBe(true);
    expect(ofreceCapturarFolio({ estatus: "SIN_FACTURA", tieneArchivo: false })).toBe(false);
    expect(ofreceCapturarFolio({ estatus: "SIN_FACTURA", tieneArchivo: true })).toBe(true);
  });
});

describe("folio: prellenado desde el XML del CFDI", () => {
  it("CFDI 4.0 real (con BOM): SERIE-FOLIO y UUID en mayúsculas", () => {
    const bytes = new TextEncoder().encode(CFDI_40);
    expect(datosDeCfdi(textoDeXmlBytes(bytes))).toEqual({
      folio: "FECMID-90255",
      uuid: "DF1BFB5F-4D88-4F51-AC50-A7B72299128E",
    });
  });

  it("UTF-16 con BOM también se lee", () => {
    const texto = '<cfdi:Comprobante Serie="C" Folio="5"/>';
    const le = new Uint8Array(2 + texto.length * 2);
    le[0] = 0xff;
    le[1] = 0xfe;
    for (let i = 0; i < texto.length; i++) le[2 + i * 2] = texto.charCodeAt(i);
    expect(datosDeCfdi(textoDeXmlBytes(le))?.folio).toBe("C-5");
  });

  it("no confunde NoCertificado ni FolioFiscalOrig con Folio", () => {
    const xml =
      '<cfdi:Comprobante NoCertificado="999" Serie="A" Folio="12" FolioFiscalOrig="X-1"/>';
    expect(datosDeCfdi(xml)?.folio).toBe("A-12");
  });

  it("solo Folio ⇒ el Folio; solo Serie ⇒ nada; 3.2 en minúsculas", () => {
    expect(datosDeCfdi('<cfdi:Comprobante Folio="1234"/>')?.folio).toBe("1234");
    expect(datosDeCfdi('<cfdi:Comprobante Serie="A"/>')?.folio).toBeNull();
    expect(
      datosDeCfdi("<cfdi:Comprobante version='3.2' serie='B' folio='77'/>")?.folio,
    ).toBe("B-77");
  });

  it("SERIE-FOLIO de más de 40 ⇒ solo el Folio (regla del API)", () => {
    const xml = `<cfdi:Comprobante Serie="${"S".repeat(30)}" Folio="${"9".repeat(15)}"/>`;
    expect(datosDeCfdi(xml)?.folio).toBe("9".repeat(15));
  });

  it("entidades XML y UUID inválido", () => {
    expect(datosDeCfdi('<Comprobante Serie="A&amp;B" Folio="&#49;0"/>')?.folio).toBe("A&B-10");
    expect(
      datosDeCfdi('<cfdi:Comprobante Folio="1"><tfd:TimbreFiscalDigital UUID="no-es"/></cfdi:Comprobante>')?.uuid,
    ).toBeNull();
  });

  it("un XML que no es CFDI no rompe nada: null", () => {
    expect(datosDeCfdi("<factura><total>10</total></factura>")).toBeNull();
    expect(datosDeCfdi("")).toBeNull();
  });
});

describe("folio: qué se MANDA con la subida", () => {
  it("lo tecleado va; vacío no va", () => {
    expect(folioAEnviar({ tecleado: " A-1 " })).toBe("A-1");
    expect(folioAEnviar({ tecleado: "" })).toBeNull();
    expect(folioAEnviar({ tecleado: null })).toBeNull();
  });

  it("igual a lo que el API sacaría del XML ⇒ NO se manda (evita el 409 sin migración)", () => {
    expect(folioAEnviar({ tecleado: "FECMID-90255", extraidoDelXml: "FECMID-90255" })).toBeNull();
    // Corregido a mano: el tecleado gana y SÍ viaja.
    expect(folioAEnviar({ tecleado: "FECMID-90256", extraidoDelXml: "FECMID-90255" })).toBe(
      "FECMID-90256",
    );
  });
});

describe("renglón del archivo con folio", () => {
  it("«Folio A-1234 · factura.pdf · subió Itzi · 23 sep»", () => {
    expect(
      textoArchivoFactura(
        { path: "p", nombre: "factura.pdf", subida_at: null, subida_por_nombre: "Itzi" },
        "23 sep 2026",
        "A-1234",
      ),
    ).toBe("Folio A-1234 · factura.pdf · subió Itzi · 23 sep 2026");
    // Sin folio: el renglón de siempre.
    expect(
      textoArchivoFactura(
        { path: "p", nombre: "factura.pdf", subida_at: null, subida_por_nombre: "Itzi" },
        "23 sep 2026",
        null,
      ),
    ).toBe("factura.pdf · subió Itzi · 23 sep 2026");
  });

  it("toast de éxito", () => {
    expect(textoFacturaGuardada("A-1")).toBe("Factura guardada · folio A-1");
    expect(textoFacturaGuardada(null)).toBe("Factura guardada");
  });
});

describe("subida: tamaño y mensajes (la factura NUNCA se pierde en silencio)", () => {
  it("el peso se dice con un decimal, como el API", () => {
    expect(megasDe(3.2 * 1024 * 1024)).toBe("3.2");
    expect(textoPesoExcedido(12.3 * 1024 * 1024)).toContain(
      "El archivo pesa 12.3 MB y el máximo son 10 MB",
    );
    expect(motivoArchivoInvalido({ name: "grande.pdf", size: 12.3 * 1024 * 1024 })).toContain(
      "pesa 12.3 MB",
    );
    // Un PDF de factura típico (2.5 MB) pasa: el tope es el del API (10 MB),
    // no los 4.5 MB de Vercel — la subida ya no pasa por Vercel.
    expect(motivoArchivoInvalido({ name: "factura.pdf", size: 2.5 * 1024 * 1024 })).toBeNull();
    expect(motivoArchivoInvalido({ name: "factura.pdf", size: 8 * 1024 * 1024 })).toBeNull();
    expect(motivoArchivoInvalido({ name: "vacia.pdf", size: 0 })).toContain("vacío");
  });

  it("todo fallo dice que la factura NO se guardó", () => {
    const casos = [
      mensajeFalloSubidaFactura({ red: true }),
      mensajeFalloSubidaFactura({ tiempoAgotado: true }),
      mensajeFalloSubidaFactura({ status: 401 }),
      mensajeFalloSubidaFactura({ status: 403 }),
      mensajeFalloSubidaFactura({ status: 413, code: "ARCHIVO_MUY_GRANDE", message: "El archivo pesa 10.4 MB y el máximo son 10 MB." }),
      mensajeFalloSubidaFactura({ status: 413 }, 11 * 1024 * 1024),
      mensajeFalloSubidaFactura({ status: 400, code: "CAMPO_ARCHIVO_INVALIDO", message: "El archivo tiene que ir en el campo «file» del formulario." }),
      mensajeFalloSubidaFactura({ status: 500, code: "INTERNAL_ERROR", message: "Internal server error" }),
      mensajeFalloSubidaFactura({ status: 502, code: "PARSE_ERROR", message: "Bad Gateway" }),
      mensajeFalloSubidaFactura({ status: 404, code: "NOT_FOUND", message: "Cannot POST /v1/flights/x/factura-cliente/archivo" }),
    ];
    for (const m of casos) expect(m).toContain("La factura NO se guardó.");
  });

  it("413 del API: su mensaje con el peso; 413 sin cuerpo: el peso real", () => {
    expect(
      mensajeFalloSubidaFactura({
        status: 413,
        code: "ARCHIVO_MUY_GRANDE",
        message: "El archivo pesa 10.4 MB y el máximo son 10 MB.",
      }),
    ).toBe("El archivo pesa 10.4 MB y el máximo son 10 MB. La factura NO se guardó.");
    expect(mensajeFalloSubidaFactura({ status: 413 }, 11 * 1024 * 1024)).toContain(
      "El archivo pesa 11.0 MB",
    );
  });

  it("nunca pinta el inglés técnico (Railway reiniciando, 500, ruta que no existe)", () => {
    const m502 = mensajeFalloSubidaFactura({ status: 502, code: "PARSE_ERROR", message: "Bad Gateway" });
    expect(m502).not.toContain("Bad Gateway");
    expect(m502).toContain("error 502");
    expect(
      mensajeFalloSubidaFactura({ status: 500, message: "Internal server error" }),
    ).not.toContain("Internal server error");
    expect(
      mensajeFalloSubidaFactura({ status: 404, message: "Cannot POST /v1/x" }),
    ).toContain("falta actualizarlo");
  });

  it("solo un bloque CON archivo cuenta como guardado", () => {
    const b = { estatus: "FACTURADO", archivo: { path: "p", nombre: "f.pdf", subida_at: null } };
    expect(confirmarSubida(b)).toEqual({ ok: true, bloque: b });
    const sin = confirmarSubida({ estatus: "FACTURADO", archivo: null });
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.error).toContain("NO se guardó");
    expect(confirmarSubida(null).ok).toBe(false);
    expect(confirmarSubida(undefined).ok).toBe(false);
  });

  it("aviso cuando el folio no se pudo guardar pero el archivo sí", () => {
    expect(AVISO_FOLIO_NO_DISPONIBLE).toContain("La factura se guardó");
    expect(AVISO_FOLIO_NO_DISPONIBLE).toContain("folio");
  });
});
