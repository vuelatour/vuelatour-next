import { describe, expect, it } from "vitest";
import {
  CODIGO_API_SIN_VARIAS,
  LIMITE_LOTE_B64,
  MAX_BYTES_ARCHIVO_FACTURA,
  TEXTO_API_SIN_VARIAS,
  TEXTO_SOLO_UNA_FACTURA,
  archivosDeGrupos,
  avisosDeRespuesta,
  combinarResultados,
  cuerpoLegado,
  decidirSubida,
  detalleFactura,
  emparejarArchivosFactura,
  esRechazoArchivos,
  esVariasNoDisponible,
  etiquetaFactura,
  facturaDesdeRecibida,
  facturasDeRespuesta,
  largoBase64,
  nFacturasDeFila,
  nombreBaseFactura,
  nombreDeGrupo,
  partirEnLotes,
  pistasDeXmlCfdi,
  resultadoDeRespuestaSubida,
  textoChipFacturas,
  textoContenidoGrupo,
  textoFalloLotes,
  textoQuitarFactura,
  textoResultadoSubida,
  textoSeAgregan,
  tipoArchivoFactura,
  tituloChipFacturas,
  variasDeRespuesta,
  type FacturaDeGasto,
} from "../facturas-gasto";

const arch = (name: string, size = 1000, type = "") => ({ name, size, type });

const factura = (over: Partial<FacturaDeGasto> = {}): FacturaDeGasto => ({
  id: "f1",
  principal: false,
  serie: null,
  folio: null,
  uuid_fiscal: null,
  emisor_nombre: null,
  total: null,
  moneda: null,
  fecha_emision: null,
  pdf_url: null,
  xml_url: null,
  nombre: null,
  ...over,
});

describe("facturas de un gasto: contrato con el API", () => {
  it("facturasDeRespuesta: null sin la llave (API 0.0.85); arreglo normalizado con la principal primero", () => {
    expect(facturasDeRespuesta({ id: "g1", factura_recibida_id: "f1" })).toBeNull();
    expect(facturasDeRespuesta(null)).toBeNull();
    expect(facturasDeRespuesta({ facturas: [] })).toEqual([]);
    const lista = facturasDeRespuesta({
      facturas: [
        { id: "b", principal: false, total: "1200.50", moneda: "MXN", serie: "FCUN", folio: "1299719" },
        { id: "a", principal: true, total: 100, pdf_url: "recibidas/a.pdf" },
        { id: "b", principal: false },
        { nada: 1 },
        "x",
      ],
    });
    expect(lista?.map((f) => f.id)).toEqual(["a", "b"]);
    expect(lista?.[1].total).toBe(1200.5);
    expect(lista?.[1].serie).toBe("FCUN");
    expect(lista?.[0].pdf_url).toBe("recibidas/a.pdf");
  });

  it("facturaDesdeRecibida (API previo): principal y el nombre del PDF sale de las notas", () => {
    const f = facturaDesdeRecibida({
      id: "r1",
      total: null,
      pdf_url: "recibidas/x.pdf",
      xml_url: null,
      notas: "Factura en PDF (sin XML): ACC_FCUN_1299718.pdf",
    });
    expect(f?.principal).toBe(true);
    expect(f?.nombre).toBe("ACC_FCUN_1299718.pdf");
    expect(facturaDesdeRecibida(null)).toBeNull();
  });

  it("nFacturasDeFila: facturas_n del API nuevo; con el previo, 1 si hay principal", () => {
    expect(nFacturasDeFila({ facturas_n: 5, factura_recibida_id: "f" })).toBe(5);
    expect(nFacturasDeFila({ factura_recibida_id: "f" })).toBe(1);
    expect(nFacturasDeFila({ factura_recibida_id: null })).toBe(0);
    // Incoherente (principal sin conteo) ⇒ al menos 1: jamás «sin factura» con principal.
    expect(nFacturasDeFila({ facturas_n: 0, factura_recibida_id: "f" })).toBe(1);
  });

  it("resultadoDeRespuestaSubida: respuesta nueva y la de siempre", () => {
    const nueva = resultadoDeRespuestaSubida(
      {
        facturas: [{ id: "a", principal: true }],
        agregadas: 4,
        ya_existian: 1,
        avisos: ["Las facturas suman $10; el gasto es $20", " ", 3],
        detalle: [{ resultado: "NUEVA" }, { resultado: "EXISTENTE" }, { resultado: "YA_EN_ESTE_GASTO" }],
        facturas_multiples: true,
      },
      "VARIAS",
    );
    expect(nueva).toMatchObject({ modo: "VARIAS", agregadas: 4, reutilizadas: 1, ya_existian: 1 });
    expect(nueva.avisos).toEqual(["Las facturas suman $10; el gasto es $20"]);
    expect(nueva.facturas?.length).toBe(1);
    // 0.0.86 con la migración pendiente: la nueva REEMPLAZÓ ⇒ LEGADO.
    expect(resultadoDeRespuestaSubida({ agregadas: 1, ya_existian: 0, facturas_multiples: false }, "VARIAS").modo).toBe(
      "LEGADO",
    );
    // Respuesta de siempre: `ya_existia` = ya estaba en el BUZÓN (se amarró igual).
    expect(resultadoDeRespuestaSubida({ id: "x", ya_existia: true }, "LEGADO")).toMatchObject({
      agregadas: 1,
      reutilizadas: 1,
      ya_existian: 0,
      facturas: null,
    });
    expect(resultadoDeRespuestaSubida({ id: "x" }, "LEGADO")).toMatchObject({ agregadas: 1, reutilizadas: 0 });
  });

  it("variasDeRespuesta y avisosDeRespuesta (detalle 0.0.86)", () => {
    expect(variasDeRespuesta({ facturas: [], facturas_multiples: false })).toBe(false);
    expect(variasDeRespuesta({ facturas: [], facturas_multiples: true })).toBe(true);
    expect(variasDeRespuesta({ facturas: [] })).toBe(true);
    expect(variasDeRespuesta({ id: "g" })).toBeNull();
    expect(avisosDeRespuesta({ facturas_avisos: ["A", "A", " ", 2, "B"] })).toEqual(["A", "B"]);
    expect(avisosDeRespuesta({ avisos: ["C"] }, "avisos")).toEqual(["C"]);
    expect(avisosDeRespuesta({})).toEqual([]);
  });

  it("cuerpoLegado: el shape de siempre, pdf_nombre solo con PDF", () => {
    expect(cuerpoLegado("g", { xml_b64: "X", pdf_b64: "P", nombre: "a.pdf" })).toEqual({
      gasto_id: "g",
      xml_b64: "X",
      pdf_b64: "P",
      pdf_nombre: "a.pdf",
    });
    expect(cuerpoLegado("g", { xml_b64: "X", nombre: "a.xml" })).toEqual({ gasto_id: "g", xml_b64: "X" });
  });
});

describe("skew con el API 0.0.85", () => {
  it("esRechazoArchivos reconoce el 400 del DTO viejo y nada más", () => {
    expect(esRechazoArchivos(400, "property archivos should not exist")).toBe(true);
    expect(esRechazoArchivos(400, "property archivos.0.xml_b64 must be a string")).toBe(false);
    expect(esRechazoArchivos(409, "property archivos should not exist")).toBe(false);
    expect(esRechazoArchivos(400, null)).toBe(false);
  });

  it("esVariasNoDisponible: el 503 del 0.0.86 con la migración pendiente", () => {
    expect(esVariasNoDisponible(503, "FACTURAS_GASTO_NO_DISPONIBLE")).toBe(true);
    expect(esVariasNoDisponible(503, "SERVICE_UNAVAILABLE")).toBe(false);
    expect(esVariasNoDisponible(409, "FACTURAS_GASTO_NO_DISPONIBLE")).toBe(false);
  });

  it("decidirSubida: con el API previo solo cabe UNA factura; sin saber, se intenta", () => {
    expect(decidirSubida({ varias: false, nGrupos: 1 })).toEqual({ ok: true });
    expect(decidirSubida({ varias: false, nGrupos: 2 })).toEqual({ ok: false, mensaje: TEXTO_SOLO_UNA_FACTURA });
    expect(decidirSubida({ varias: null, nGrupos: 5 })).toEqual({ ok: true });
    expect(decidirSubida({ varias: true, nGrupos: 10 })).toEqual({ ok: true });
    expect(decidirSubida({ varias: true, nGrupos: 11 }).ok).toBe(false);
    expect(decidirSubida({ varias: true, nGrupos: 0 }).ok).toBe(false);
    expect(CODIGO_API_SIN_VARIAS).toBeTruthy();
    expect(TEXTO_API_SIN_VARIAS).toMatch(/No se subió nada/);
  });
});

describe("emparejar XML ↔ PDF", () => {
  it("tipo y nombre base", () => {
    expect(tipoArchivoFactura({ name: "A.PDF", type: "" })).toBe("PDF");
    expect(tipoArchivoFactura({ name: "a", type: "application/xml" })).toBe("XML");
    expect(tipoArchivoFactura({ name: "a.jpg", type: "image/jpeg" })).toBeNull();
    expect(nombreBaseFactura(" ACC123_FCUN_1299718.PDF ")).toBe("acc123_fcun_1299718");
    expect(nombreBaseFactura("x.tar.xml")).toBe("x.tar");
  });

  it("el caso ASA: 5 PDF + 5 XML con el mismo nombre base ⇒ 5 facturas PDF + XML", () => {
    const folios = ["1299718", "1299719", "1299720", "1299721", "1299722"];
    const archivos = [
      ...folios.map((f) => arch(`ACC123_FCUN_${f}.pdf`)),
      ...folios.map((f) => arch(`ACC123_FCUN_${f}.xml`)),
    ];
    const r = emparejarArchivosFactura(archivos);
    expect(r.mensaje).toBeNull();
    expect(r.grupos).toHaveLength(5);
    for (const g of r.grupos) {
      expect(g.pdf?.name.replace(".pdf", "")).toBe(g.xml?.name.replace(".xml", ""));
      expect(g.porPista).toBe(false);
    }
    expect(archivosDeGrupos(r.grupos)).toHaveLength(10);
  });

  it("UN PDF y UN XML con nombres distintos son la misma factura (el caso de siempre) y se dice", () => {
    const r = emparejarArchivosFactura([arch("FCUN-1299718.pdf"), arch("6f9a-uuid.xml")]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].pdf?.name).toBe("FCUN-1299718.pdf");
    expect(r.grupos[0].xml?.name).toBe("6f9a-uuid.xml");
    expect(r.grupos[0].porPista).toBe(true);
  });

  it("por pistas del XML (folio o UUID en el nombre del PDF) cuando hay varios sueltos", () => {
    const x1 = arch("A.xml");
    const x2 = arch("B.xml");
    const pistas = (f: { name: string }) => (f.name === "A.xml" ? ["1299718"] : ["abcd1234-uuid"]);
    const r = emparejarArchivosFactura(
      [arch("factura FCUN 1299718.pdf"), arch("abcd1234-uuid.pdf"), x1, x2, arch("otra.pdf")],
      { pistas },
    );
    expect(r.grupos).toHaveLength(3);
    const conXml = r.grupos.filter((g) => g.xml);
    expect(conXml.map((g) => [g.pdf?.name, g.xml?.name])).toEqual([
      ["factura FCUN 1299718.pdf", "A.xml"],
      ["abcd1234-uuid.pdf", "B.xml"],
    ]);
    expect(r.grupos.find((g) => g.pdf?.name === "otra.pdf")?.xml).toBeNull();
  });

  it("varios sueltos sin pistas NO se emparejan al azar", () => {
    const r = emparejarArchivosFactura([arch("a.pdf"), arch("b.pdf"), arch("c.xml"), arch("d.xml")]);
    expect(r.grupos).toHaveLength(4);
    expect(r.grupos.every((g) => !(g.pdf && g.xml))).toBe(true);
  });

  it("rechaza (diciéndolo) tipos ajenos, vacíos, pesados, repetidos y lo que pase de 10", () => {
    const r = emparejarArchivosFactura([
      arch("foto.jpg", 10, "image/jpeg"),
      arch("vacio.pdf", 0),
      arch("enorme.pdf", MAX_BYTES_ARCHIVO_FACTURA + 1),
      arch("a.pdf"),
      arch("A.PDF"),
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.mensaje).toContain("foto.jpg (no es PDF ni XML)");
    expect(r.mensaje).toContain("vacio.pdf (está vacío)");
    expect(r.mensaje).toContain("enorme.pdf (pesa más de 8 MB)");
    expect(r.mensaje).toContain("A.PDF (repetido");
    const once = emparejarArchivosFactura(Array.from({ length: 12 }, (_, i) => arch(`f${i}.pdf`)));
    expect(once.grupos).toHaveLength(10);
    expect(once.mensaje).toContain("2 facturas se quedaron fuera");
  });

  it("pistasDeXmlCfdi lee UUID, serie y folio (un folio corto no cuenta solo)", () => {
    const xml =
      '<cfdi:Comprobante Serie="FCUN" Folio="1299718" Total="3601.77"><tfd:TimbreFiscalDigital UUID="6F9A0000-1111-2222-3333-444455556666"/></cfdi:Comprobante>';
    const p = pistasDeXmlCfdi(xml);
    expect(p).toContain("6f9a0000-1111-2222-3333-444455556666");
    expect(p).toContain("fcun1299718");
    expect(p).toContain("fcun_1299718");
    expect(p).toContain("1299718");
    expect(pistasDeXmlCfdi('<x Folio="12"/>')).toEqual([]);
  });

  it("textos de la lista previa", () => {
    expect(textoContenidoGrupo({ pdf: 1, xml: 1 })).toBe("PDF + XML");
    expect(textoContenidoGrupo({ pdf: 1, xml: null })).toMatch(/solo PDF/);
    expect(textoContenidoGrupo({ pdf: null, xml: 1 })).toBe("solo XML");
    expect(nombreDeGrupo({ pdf: { name: "a.pdf" }, xml: { name: "a.xml" } })).toBe("a.pdf");
    expect(nombreDeGrupo({ pdf: null, xml: { name: "a.xml" } })).toBe("a.xml");
  });
});

describe("lotes que quepan en Vercel", () => {
  it("largoBase64", () => {
    expect(largoBase64(3)).toBe(4);
    expect(largoBase64(4)).toBe(8);
    expect(largoBase64(0)).toBe(0);
  });

  it("parte por peso sin separar el PDF de su XML; una factura enorme va sola", () => {
    const g = (pdf: number, xml: number) => ({ pdf: { size: pdf }, xml: { size: xml } });
    const chicos = Array.from({ length: 5 }, () => g(100_000, 10_000));
    expect(partirEnLotes(chicos)).toHaveLength(1);
    const mb = 1024 * 1024;
    const lotes = partirEnLotes([g(2 * mb, 0), g(2 * mb, 0), g(5 * mb, 0), g(1000, 1000)]);
    expect(lotes.map((l) => l.length)).toEqual([1, 1, 1, 1]);
    // Ningún lote con 2+ facturas pasa del tope.
    for (const l of partirEnLotes(Array.from({ length: 9 }, () => g(900_000, 50_000)))) {
      const peso = l.reduce((s, x) => s + largoBase64(x.pdf.size) + largoBase64(x.xml.size), 0);
      if (l.length > 1) expect(peso).toBeLessThanOrEqual(LIMITE_LOTE_B64);
    }
    expect(partirEnLotes(Array.from({ length: 12 }, () => g(10, 10)), LIMITE_LOTE_B64, 10).map((l) => l.length)).toEqual([10, 2]);
  });
});

describe("resultados, avisos y textos", () => {
  it("combinarResultados suma los lotes y dice si alguno fue con el API previo", () => {
    const base = { avisos: [], facturas: null };
    const r = combinarResultados([
      { ...base, modo: "VARIAS", agregadas: 3, reutilizadas: 1, ya_existian: 0 },
      { ...base, modo: "VARIAS", agregadas: 1, reutilizadas: 0, ya_existian: 1 },
    ]);
    expect(r).toEqual({ agregadas: 4, reutilizadas: 1, ya_existian: 1, legado: false });
    expect(
      combinarResultados([{ ...base, modo: "LEGADO", agregadas: 1, reutilizadas: 0, ya_existian: 0 }]).legado,
    ).toBe(true);
  });

  it("textos de la pantalla", () => {
    expect(textoSeAgregan(0)).toBeNull();
    expect(textoSeAgregan(1)).toBe("Se agregan a la factura que ya tiene.");
    expect(textoSeAgregan(5)).toBe("Se agregan a las 5 facturas que ya tiene.");
    expect(textoChipFacturas(1)).toBeNull();
    expect(textoChipFacturas(5)).toBe("5");
    expect(tituloChipFacturas(0)).toMatch(/Subir/);
    expect(tituloChipFacturas(5)).toBe("Este gasto tiene 5 facturas: verlas o subir más");
    expect(etiquetaFactura(factura({ serie: "FCUN", folio: "1299718" }))).toBe("FCUN-1299718");
    expect(etiquetaFactura(factura({ folio: "77" }))).toBe("77");
    expect(etiquetaFactura(factura({ nombre: "ACC_1.pdf" }))).toBe("ACC_1.pdf");
    expect(etiquetaFactura(factura({ uuid_fiscal: "6f9a0000-1111" }))).toBe("UUID 6f9a0000…");
    expect(etiquetaFactura(factura())).toBe("Factura sin folio");
    expect(detalleFactura(factura({ emisor_nombre: "ASA", total: 1200.5, moneda: "MXN", pdf_url: "a", xml_url: "b" }))).toBe(
      "ASA · $1,200.50 MXN · PDF + XML",
    );
    expect(detalleFactura(factura({ pdf_url: "a" }))).toBe("solo PDF");
    expect(textoResultadoSubida({ agregadas: 5, reutilizadas: 0, ya_existian: 0 })).toBe(
      "Se agregaron 5 facturas a este gasto.",
    );
    expect(textoResultadoSubida({ agregadas: 1, reutilizadas: 1, ya_existian: 1 })).toBe(
      "Se agregó 1 factura a este gasto. 1 ya estaba en Facturas recibidas: no se duplicó, solo se le sumó este gasto. 1 ya estaba en este gasto (no se duplicó).",
    );
    expect(textoResultadoSubida({ agregadas: 1, reutilizadas: 0, ya_existian: 0, legado: true })).toBe(
      "Factura amarrada a este gasto.",
    );
    expect(textoResultadoSubida({ agregadas: 0, reutilizadas: 0, ya_existian: 0 })).toMatch(/ya estaban/);
    expect(textoFalloLotes(["a.pdf", "b.pdf", "c.pdf", "d.pdf"], "XML inválido.")).toBe(
      "No se pudo subir a.pdf, b.pdf, c.pdf y 1 más: XML inválido. Siguen en la lista para que lo intentes de nuevo.",
    );
  });

  it("confirmación de «Quitar de este gasto»: no borra la factura y dice qué pasa con la principal", () => {
    const f = factura({ serie: "FCUN", folio: "1", principal: true });
    expect(textoQuitarFactura(f, 1)).toMatch(/NO se borra.*Era la única: el gasto regresa a Pendiente/);
    expect(textoQuitarFactura(f, 3)).toMatch(/Era la principal.*la siguiente/);
    expect(textoQuitarFactura({ ...f, principal: false }, 3)).not.toMatch(/principal|única/);
  });
});
