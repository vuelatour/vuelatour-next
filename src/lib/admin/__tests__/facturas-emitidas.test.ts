import { describe, expect, it, vi } from "vitest";
import {
  ALERTA_DE_FILTRO,
  EMISORA_OTRA,
  ETIQUETAS_ALERTA,
  ORDEN_DEFAULT,
  SIN_EMISORA,
  SIN_SERIE,
  abrirArchivoFirmado,
  cambiosDeEdicion,
  claveCompacta,
  clasificarArchivosFactura,
  datosDeFormulario,
  diferenciasLecturaVsFactura,
  diferenciasLecturaVsFormulario,
  esHeicPath,
  esNoDisponible,
  esPdfPath,
  etiquetaSerieFolio,
  fechaCortaCancun,
  filtrosFacturasDeUrl,
  hayFiltrosFacturas,
  hrefFacturas,
  mensajeErrorFactura,
  motivoComprobanteInvalido,
  motivoValido,
  parseMonto,
  prellenarSinPisar,
  puedeAdjuntarComprobante,
  puedePedirFactura,
  puedeRegistrarFactura,
  puedeVerPdfFactura,
  queryDeFiltros,
  semaforoDeCobro,
  textoCanceladas,
  textoFacturaPedidaAlta,
  textoFaltanDatosFiscales,
  textoFalloSolicitudAlta,
  textoHuecos,
  textoNotificados,
  textoPdfDeOtraFactura,
  textoPedidaPor,
  textoSolicitud,
  tipoComprobante,
  unirNombres,
  validarFormularioFactura,
  valoresDeFactura,
  valoresDeLectura,
  valoresVacios,
  type ValoresFormularioFactura,
} from "@/lib/admin/facturas-emitidas";
import type {
  CamposLeidosFactura,
  CobroResumen,
  FacturaEmitida,
  HuecoSerie,
} from "@/types/facturas-emitidas";

const UUID_A = "D08B6837-A3B5-45AF-96E1-36F07FBA8FAF";
const EMISORA = "fd3c53fb-0000-4000-8000-000000000001";
const CLIENTE = "11111111-2222-4333-8444-555555555555";
const VUELO = "dc204a2f-6342-43f1-9406-f76dc1302b97";

function campos(p: Partial<CamposLeidosFactura> = {}): CamposLeidosFactura {
  return {
    serie: null,
    folio: null,
    uuid: null,
    fecha_emision: null,
    emisor_rfc: null,
    emisor_nombre: null,
    receptor_rfc: null,
    receptor_nombre: null,
    moneda: null,
    subtotal: null,
    iva: null,
    total: null,
    metodo_pago: null,
    forma_pago: null,
    ...p,
  };
}

function factura(p: Partial<FacturaEmitida> = {}): FacturaEmitida {
  return {
    id: "f-1",
    serie: "A",
    folio: "123",
    folio_num: 123,
    etiqueta: "A-123",
    uuid: UUID_A,
    fecha_emision: "2026-09-24",
    estatus: "VIGENTE",
    emisor_rfc: null,
    emisor_nombre: "AERO CHARTER CANCUN",
    emisora: { id: EMISORA, razon_social: "Aero Charter Cancun S.A. de C.V." },
    receptor_rfc: "MMA150622P83",
    receptor_nombre: "MAQAR MACHINERY",
    cliente: { id: CLIENTE, nombre: "Maqar" },
    moneda: "USD",
    subtotal: 6940,
    iva: 1110.4,
    total: 8050.4,
    metodo_pago: "PPD",
    forma_pago: "99",
    notas: null,
    es_parcial: false,
    pdf: { nombre: "A-123.pdf", subido_at: "2026-09-24T19:02:00.000Z", subido_por_nombre: "Mary Cruz" },
    xml: null,
    archivos_anteriores: 0,
    vuelos: [
      {
        id: VUELO,
        folio: 341,
        fecha_vuelo: "2026-09-27T14:00:00+00:00",
        estado: "CONFIRMADO",
        cliente_nombre: "Maqar",
        total: { usd: 8050.4, mxn: 136856.8 },
        cobro: {
          monto_total_usd: 8050.4,
          total_cobrado_usd: 8050.4,
          sin_tc_count: 0,
          cobrado: true,
          cotizacion_abierta: false,
          estado_vuelo: "CONFIRMADO",
          es_interno: false,
          semaforo: { key: "COBRADO", label: "Cobrado", color: "verde" },
        },
        otras_vigentes: [],
      },
    ],
    alertas: [],
    cancelada: null,
    created_at: "2026-09-24T19:02:00.000Z",
    created_por_nombre: "Mary Cruz",
    updated_at: "2026-09-24T19:02:00.000Z",
    ...p,
  };
}

describe("permisos (espejo de los @Roles del API)", () => {
  it("registrar: ADMIN y FACTURACION", () => {
    expect(puedeRegistrarFactura("ADMIN")).toBe(true);
    expect(puedeRegistrarFactura("FACTURACION")).toBe(true);
    expect(puedeRegistrarFactura("COORDINADOR")).toBe(false);
    expect(puedeRegistrarFactura(null)).toBe(false);
  });
  it("pedir, ver PDF y adjuntar comprobante: ADMIN, COORDINADOR y FACTURACION", () => {
    for (const f of [puedePedirFactura, puedeVerPdfFactura, puedeAdjuntarComprobante]) {
      expect(f("ADMIN")).toBe(true);
      expect(f("COORDINADOR")).toBe(true);
      expect(f("FACTURACION")).toBe(true);
      expect(f("SOCIO")).toBe(false);
      expect(f("PILOTO")).toBe(false);
      expect(f(undefined)).toBe(false);
    }
  });
});

describe("filtros de la URL", () => {
  it("lo válido pasa; lo inválido se IGNORA (un enlace viejo no tumba la pantalla)", () => {
    const f = filtrosFacturasDeUrl({
      q: "  A-123  ",
      desde: "2026-09-01",
      hasta: "2026-13-45",
      cliente_id: "no-es-uuid",
      emisora_id: EMISORA,
      serie: " a ",
      estatus: "BORRADA",
      alerta: "sin_pdf",
      orden: "folio_asc",
      vuelo_id: VUELO,
      resaltar: VUELO,
    });
    expect(f).toEqual({
      q: "A-123",
      desde: "2026-09-01",
      hasta: undefined,
      cliente_id: undefined,
      emisora_id: EMISORA,
      serie: "A",
      estatus: undefined,
      alerta: "sin_pdf",
      orden: "folio_asc",
      vuelo_id: VUELO,
      resaltar: VUELO,
    });
  });

  it("rango al revés se corrige; orden desconocido cae al default (más recientes arriba)", () => {
    const f = filtrosFacturasDeUrl({ desde: "2026-09-30", hasta: "2026-09-01", orden: "x" });
    expect(f.desde).toBe("2026-09-01");
    expect(f.hasta).toBe("2026-09-30");
    expect(f.orden).toBe(ORDEN_DEFAULT);
    expect(ORDEN_DEFAULT).toBe("folio_desc");
  });

  it("valores especiales SIN_SERIE y SIN_EMISORA; arreglos toman el primero", () => {
    const f = filtrosFacturasDeUrl({ serie: "sin_serie", emisora_id: SIN_EMISORA, q: ["x", "y"] });
    expect(f.serie).toBe(SIN_SERIE);
    expect(f.emisora_id).toBe(SIN_EMISORA);
    expect(f.q).toBe("x");
  });

  it("q se recorta a 100 y la serie de más de 25 se ignora", () => {
    const f = filtrosFacturasDeUrl({ q: "x".repeat(150), serie: "S".repeat(26) });
    expect(f.q).toHaveLength(100);
    expect(f.serie).toBeUndefined();
  });

  it("query del API: sin `resaltar` y sin el orden por defecto", () => {
    const f = filtrosFacturasDeUrl({ q: "maqar", resaltar: VUELO });
    expect(queryDeFiltros(f)).toEqual({
      q: "maqar",
      desde: undefined,
      hasta: undefined,
      cliente_id: undefined,
      emisora_id: undefined,
      serie: undefined,
      estatus: undefined,
      alerta: undefined,
      orden: undefined,
      vuelo_id: undefined,
    });
    expect(queryDeFiltros({ ...f, orden: "fecha_desc" }).orden).toBe("fecha_desc");
    expect(hayFiltrosFacturas(f)).toBe(true);
    expect(hayFiltrosFacturas(filtrosFacturasDeUrl({ orden: "folio_asc" }))).toBe(false);
  });

  it("href de los chips: agrega y quita filtros, nunca `resaltar`", () => {
    const f = filtrosFacturasDeUrl({ q: "maqar", alerta: "sin_pdf", resaltar: VUELO });
    expect(hrefFacturas(f, { estatus: "VIGENTE", alerta: undefined })).toBe(
      "/admin/facturas-emitidas?q=maqar&estatus=VIGENTE",
    );
    expect(hrefFacturas(filtrosFacturasDeUrl({}))).toBe("/admin/facturas-emitidas");
    expect(hrefFacturas(filtrosFacturasDeUrl({}), { orden: "folio_asc" })).toBe(
      "/admin/facturas-emitidas?orden=folio_asc",
    );
  });

  it("cada alerta del filtro tiene su alerta del API y su chip", () => {
    for (const [filtro, alerta] of Object.entries(ALERTA_DE_FILTRO)) {
      expect(alerta).toBe(filtro.toUpperCase());
      expect(ETIQUETAS_ALERTA[alerta].label.length).toBeGreaterThan(0);
    }
    expect(ETIQUETAS_ALERTA.DUPLICADO_VUELO.label).toBe("Vuelo con 2 facturas");
    expect(ETIQUETAS_ALERTA.VUELO_CANCELADO.title).toContain("cargo por cancelación");
  });
});

describe("huecos de la numeración", () => {
  const base: HuecoSerie = {
    emisora: null,
    serie: "A",
    etiqueta_serie: "A",
    desde: 100,
    hasta: 110,
    total_faltantes: 2,
    faltantes: ["A-104", "A-107"],
    truncado: false,
  };

  it("«Faltan A-104, A-107»", () => {
    expect(textoHuecos(base)).toBe("Faltan A-104, A-107");
  });

  it("con más de los que se listan: «(y 3 más)»", () => {
    expect(textoHuecos({ ...base, total_faltantes: 5, truncado: true })).toBe(
      "Faltan A-104, A-107 (y 3 más)",
    );
  });

  it("un salto enorme (un dígito de más) NO lista cientos de faltantes", () => {
    const h = { ...base, desde: 130, hasta: 1300, total_faltantes: 1169, truncado: true };
    expect(textoHuecos(h)).toBe(
      "Hay un salto grande en la serie A (de A-130 a A-1300): revisa si algún folio se capturó mal.",
    );
    expect(textoHuecos({ ...h, serie: null, etiqueta_serie: "(sin serie)" })).toBe(
      "Hay un salto grande en los folios sin serie (de 130 a 1300): revisa si algún folio se capturó mal.",
    );
  });
});

describe("solicitud de factura: textos (hora Cancún)", () => {
  const s = {
    // 25-sep 03:00 UTC = 24-sep 22:00 en Cancún: el día que se pinta es el 24.
    solicitada_at: "2026-09-25T03:00:00.000Z",
    solicitada_por: { id: "u", nombre: "Itzi" },
    nota: null,
    paga_contra_factura: false,
  };

  it("chip ámbar y línea gris", () => {
    expect(fechaCortaCancun(s.solicitada_at)).toBe("24 sep");
    expect(textoSolicitud(s)).toBe("Factura pedida por Itzi · 24 sep — pendiente");
    expect(textoPedidaPor(s)).toBe("Pedida por Itzi · 24 sep");
  });

  it("sin nombre (usuario borrado) no se inventa nadie", () => {
    const sin = { ...s, solicitada_por: null };
    expect(textoSolicitud(sin)).toBe("Factura pedida · 24 sep — pendiente");
    expect(textoPedidaPor(sin)).toBe("Pedida · 24 sep");
  });

  it("a quién se avisó (nunca en silencio)", () => {
    expect(textoNotificados(["Mary Cruz"])).toBe("Listo: se avisó a Mary Cruz.");
    expect(textoNotificados(["Mary Cruz", "Ale", "Diego"])).toBe(
      "Listo: se avisó a Mary Cruz, Ale y Diego.",
    );
    expect(textoNotificados([])).toBe(
      "Solicitud guardada. Aparece en Facturas emitidas → Por facturar.",
    );
    expect(textoFacturaPedidaAlta(["Mary Cruz"])).toBe("Factura pedida a Mary Cruz.");
    expect(textoFacturaPedidaAlta([])).toBe(
      "Factura pedida: aparece en Facturas emitidas → Por facturar.",
    );
  });

  it("el alta dice que la cotización SÍ se creó cuando la solicitud falla", () => {
    expect(textoFalloSolicitudAlta(341, "Sin conexión.")).toBe(
      "La cotización #341 se creó, pero NO se pudo pedir la factura: Sin conexión. Pídela desde la cotización con «Necesito factura».",
    );
  });

  it("utilidades de texto", () => {
    expect(unirNombres(["A", "B"])).toBe("A y B");
    expect(textoCanceladas(1)).toBe("1 cancelada");
    expect(textoCanceladas(2)).toBe("2 canceladas");
    expect(textoFaltanDatosFiscales(["RFC", "Régimen fiscal"])).toBe(
      "Faltan datos fiscales: RFC, Régimen fiscal",
    );
    expect(textoFaltanDatosFiscales([])).toBeNull();
    expect(motivoValido("  ab ")).toBe(false);
    expect(motivoValido("error de captura")).toBe(true);
    expect(etiquetaSerieFolio("A", "123")).toBe("A-123");
    expect(etiquetaSerieFolio(null, 123)).toBe("123");
  });
});

describe("prellenado sin pisar", () => {
  it("solo llena lo vacío y NO tocado", () => {
    const v = { ...valoresVacios(), folio: "999", serie: "" };
    const tocados = new Set<keyof ValoresFormularioFactura>(["uuid"]);
    const out = prellenarSinPisar(v, tocados, {
      folio: "123",
      serie: "A",
      uuid: UUID_A,
      total: "7350.69",
    });
    expect(out.folio).toBe("999"); // Mari ya lo escribió
    expect(out.serie).toBe("A");
    expect(out.uuid).toBe(""); // lo tocó (aunque lo haya borrado)
    expect(out.total).toBe("7350.69");
  });

  it("lo que la lectura no trae no borra nada", () => {
    const v = { ...valoresVacios(), total: "100" };
    expect(prellenarSinPisar(v, new Set(), { total: "", iva: undefined })).toEqual(v);
  });

  it("valores de la lectura del PDF del ejemplo", () => {
    const l = valoresDeLectura(
      campos({
        serie: "AAI",
        folio: "26062737",
        uuid: UUID_A.toLowerCase(),
        total: 7350.69,
        subtotal: 6336.8,
        moneda: "USD",
        metodo_pago: "PPD",
      }),
    );
    expect(l).toEqual({
      serie: "AAI",
      folio: "26062737",
      uuid: UUID_A,
      total: "7350.69",
      subtotal: "6336.8",
      moneda: "USD",
      metodo_pago: "PPD",
    });
  });
});

describe("formulario ⇒ datos del API", () => {
  const lleno: ValoresFormularioFactura = {
    ...valoresVacios(),
    emisora_id: EMISORA,
    serie: " a ",
    folio: "  00123  ",
    uuid: UUID_A.toLowerCase(),
    fecha_emision: "2026-09-24",
    cliente_id: CLIENTE,
    receptor_rfc: "mma-150622 p83",
    moneda: "USD",
    subtotal: "6,940",
    iva: "1110.4",
    total: "$8,050.40",
    metodo_pago: "PPD",
    forma_pago: "99",
  };

  it("normaliza como el API", () => {
    const d = datosDeFormulario(lleno, [VUELO]);
    expect(d).toMatchObject({
      serie: "A",
      folio: "00123",
      uuid: UUID_A,
      fecha_emision: "2026-09-24",
      receptor_rfc: "MMA150622P83",
      cliente_id: CLIENTE,
      moneda: "USD",
      subtotal: 6940,
      iva: 1110.4,
      total: 8050.4,
      metodo_pago: "PPD",
      forma_pago: "99",
      notas: null,
      es_parcial: false,
      vuelo_ids: [VUELO],
      emisora_id: EMISORA,
    });
  });

  it("un nombre leído del PDF de más de 300 caracteres se recorta (el emisor no tiene campo visible)", () => {
    const largo = `SEGUROS INBURSA ${"X".repeat(400)}`;
    const d = datosDeFormulario({ ...lleno, emisor_nombre: largo, receptor_nombre: ` ${largo} ` }, []);
    expect(d.emisor_nombre?.length).toBe(300);
    expect(d.receptor_nombre?.length).toBe(300);
    expect(d.emisor_nombre?.startsWith("SEGUROS INBURSA")).toBe(true);
    expect(datosDeFormulario({ ...lleno, emisor_nombre: "  " }, []).emisor_nombre).toBeNull();
  });

  it("«Otra / no es de VuelaTour» manda null explícito; sin elegir no manda la llave", () => {
    expect(datosDeFormulario({ ...lleno, emisora_id: EMISORA_OTRA }, []).emisora_id).toBeNull();
    expect("emisora_id" in datosDeFormulario({ ...lleno, emisora_id: "" }, [])).toBe(false);
  });

  it("validación local", () => {
    expect(validarFormularioFactura(lleno)).toEqual({});
    const e = validarFormularioFactura({
      ...valoresVacios(),
      uuid: "no-es",
      receptor_rfc: "abc",
      total: "0",
      forma_pago: "3",
      subtotal: "x",
    });
    expect(e.folio).toBeDefined();
    expect(e.fecha_emision).toBeDefined();
    expect(e.moneda).toBeDefined();
    expect(e.total).toBeDefined();
    expect(e.uuid).toBeDefined();
    expect(e.receptor_rfc).toBeDefined();
    expect(e.forma_pago).toBeDefined();
    expect(e.subtotal).toBeDefined();
    expect(validarFormularioFactura({ ...lleno, total: "10.123" }).total).toBe(
      "El total va con máximo 2 decimales.",
    );
    expect(parseMonto("")).toBeNull();
    expect(parseMonto("1,160.50")).toBe(1160.5);
    expect(Number.isNaN(parseMonto("abc"))).toBe(true);
  });

  it("EDICIÓN: solo lo que cambió (y nada si no cambió nada)", () => {
    const f = factura();
    const sinCambios = datosDeFormulario(valoresDeFactura(f), f.vuelos.map((v) => v.id));
    expect(cambiosDeEdicion(f, sinCambios)).toEqual({});
    const otro = "22222222-2222-4222-8222-222222222222";
    const conCambios = datosDeFormulario(
      { ...valoresDeFactura(f), total: "8050.41", es_parcial: true },
      [VUELO, otro],
    );
    expect(cambiosDeEdicion(f, conCambios)).toEqual({
      total: 8050.41,
      es_parcial: true,
      vuelo_ids: [VUELO, otro],
    });
  });

  it("una factura sin emisora se edita con «Otra» y no cuenta como cambio", () => {
    const f = factura({ emisora: null });
    const v = valoresDeFactura(f);
    expect(v.emisora_id).toBe(EMISORA_OTRA);
    expect(cambiosDeEdicion(f, datosDeFormulario(v, [VUELO]))).toEqual({});
  });
});

describe("clave compacta (espejo del API) y lo leído vs lo capturado", () => {
  it("«A»+«00123», «A-123» sin serie y «a 123» son la MISMA factura", () => {
    expect(claveCompacta("A", "00123")).toBe("A123");
    expect(claveCompacta(null, "A-123")).toBe("A123");
    expect(claveCompacta("", "a 123")).toBe("A123");
    expect(claveCompacta("A", "/ 124")).toBe("A124");
    expect(claveCompacta("B", "123")).not.toBe(claveCompacta("A", "123"));
    expect(claveCompacta("A", "0")).toBe("A0");
  });

  it("conserva la Ñ y quita acentos (MISMA tabla que el spec del API)", () => {
    expect(claveCompacta("Ñ", "5")).toBe("Ñ5");
    expect(claveCompacta("ñ", "5")).toBe("Ñ5");
    expect(claveCompacta("É", "5")).toBe("E5");
    expect(claveCompacta("Ñ", "5")).not.toBe(claveCompacta("N", "5"));
  });

  it("«El PDF dice A-124 y capturaste A-123.»", () => {
    const v = { ...valoresVacios(), serie: "A", folio: "123", total: "8050.40", moneda: "USD" as const };
    expect(
      diferenciasLecturaVsFormulario(campos({ serie: "A", folio: "124" }), v),
    ).toEqual(["El PDF dice A-124 y capturaste A-123."]);
    // Mismo número escrito distinto: no es diferencia.
    expect(
      diferenciasLecturaVsFormulario(campos({ serie: null, folio: "A-00123", total: 8050.4 }), v),
    ).toEqual([]);
  });

  it("UUID, total y RFC receptor también se comparan", () => {
    const v = {
      ...valoresVacios(),
      uuid: UUID_A,
      total: "8050.40",
      moneda: "USD" as const,
      receptor_rfc: "XAXX010101000",
    };
    const d = diferenciasLecturaVsFormulario(
      campos({
        uuid: "AAAAAAAA-A3B5-45AF-96E1-36F07FBA8FAF",
        total: 7350.69,
        receptor_rfc: "MMA150622P83",
      }),
      v,
      "El XML",
    );
    expect(d).toEqual([
      "El XML dice el folio fiscal AAAAAAAA-A3B5-45AF-96E1-36F07FBA8FAF y capturaste D08B6837-A3B5-45AF-96E1-36F07FBA8FAF.",
      "El XML dice un total de $7,350.69 USD y capturaste $8,050.40 USD.",
      "El XML dice RFC receptor MMA150622P83 y capturaste XAXX010101000.",
    ]);
  });

  it("«Reemplazar PDF»: ¿el nuevo es de otra factura?", () => {
    const f = factura();
    expect(diferenciasLecturaVsFactura(campos({ serie: "A", folio: "123", total: 8050.4 }), f)).toEqual([]);
    const c = campos({ serie: "A", folio: "124", total: 7350.69, moneda: "USD" });
    expect(diferenciasLecturaVsFactura(c, f)).toHaveLength(2);
    expect(textoPdfDeOtraFactura(c)).toBe(
      "Este PDF parece de otra factura (dice A-124, $7,350.69 USD). ¿Reemplazar de todos modos?",
    );
    expect(textoPdfDeOtraFactura(campos())).toBe(
      "Este PDF parece de otra factura. ¿Reemplazar de todos modos?",
    );
  });
});

describe("archivos", () => {
  const MB = 1024 * 1024;
  it("un PDF y un XML como máximo", () => {
    const pdf = { name: "A-123.PDF", size: 1000 };
    const xml = { name: "cfdi.xml", size: 500 };
    expect(clasificarArchivosFactura([pdf, xml])).toEqual({ pdf, xml });
    expect(clasificarArchivosFactura([pdf, { ...pdf, name: "otro.pdf" }]).error).toBe(
      "Suelta un solo PDF por factura.",
    );
    expect(clasificarArchivosFactura([xml, xml]).error).toBe("Suelta un solo XML por factura.");
    expect(clasificarArchivosFactura([{ name: "foto.jpg", size: 10 }]).error).toContain("PDF");
    expect(clasificarArchivosFactura([{ name: "a.pdf", size: 11 * MB }]).error).toContain(
      "El archivo pesa 11.0 MB y el máximo son 10 MB",
    );
    expect(clasificarArchivosFactura([{ name: "a.pdf", size: 0 }]).error).toContain("vacío");
  });

  it("comprobante del cobro: foto o PDF, ≤10 MB", () => {
    expect(motivoComprobanteInvalido({ name: "voucher.HEIC", size: 10 })).toBeNull();
    expect(motivoComprobanteInvalido({ name: "voucher.pdf", size: 10 })).toBeNull();
    expect(motivoComprobanteInvalido({ name: "voucher.docx", size: 10 })).toBe(
      "El comprobante se sube como foto (JPG, PNG, WEBP, HEIC) o PDF.",
    );
    expect(motivoComprobanteInvalido({ name: "v.jpg", size: 12 * MB })).toContain("10 MB");
  });

  it("tipo por el path", () => {
    expect(esPdfPath("oficina/v/c/x.PDF")).toBe(true);
    expect(esHeicPath("u/2026-09/a.heif")).toBe(true);
    expect(tipoComprobante("u/a.jpg")).toBe("imagen");
    expect(tipoComprobante("u/a.heic")).toBe("heic");
    expect(tipoComprobante("u/a.pdf?x=1")).toBe("pdf");
  });
});

describe("errores del API en es-MX", () => {
  it("respeta los mensajes del API (ya vienen en español)", () => {
    expect(mensajeErrorFactura("FACTURA_DUPLICADA", "Ya está registrada: A-123 del vuelo #297.", 409)).toBe(
      "Ya está registrada: A-123 del vuelo #297.",
    );
  });
  it("traduce lo técnico", () => {
    expect(mensajeErrorFactura("PARSE_ERROR", "Bad Gateway", 502)).toContain("error 502");
    expect(mensajeErrorFactura(null, "Cannot POST /v1/facturas-emitidas", 404)).toContain(
      "falta actualizarlo",
    );
    expect(mensajeErrorFactura(null, "x", 401)).toContain("sesión");
    expect(mensajeErrorFactura(null, "x", 403)).toContain("permiso");
    expect(mensajeErrorFactura("SIN_CONEXION", null)).toContain("conexión");
    expect(mensajeErrorFactura("TIEMPO_AGOTADO", null)).toContain("tardó");
  });
  it("503 = sin la migración", () => {
    expect(esNoDisponible({ status: 503, code: "FACTURAS_EMITIDAS_NO_DISPONIBLE" })).toBe(true);
    expect(esNoDisponible({ status: 409, code: "FACTURA_DUPLICADA" })).toBe(false);
    // El 503 de Railway en un deploy (HTML ⇒ PARSE_ERROR) es una carga que
    // falló, no «falta la migración».
    expect(esNoDisponible({ status: 503, code: "PARSE_ERROR" })).toBe(false);
  });
});

describe("semáforo del vuelo con la fuente única del panel", () => {
  const base: CobroResumen = {
    monto_total_usd: 8050.4,
    total_cobrado_usd: 8050.4,
    sin_tc_count: 0,
    cobrado: true,
    cotizacion_abierta: false,
    estado_vuelo: "CONFIRMADO",
    es_interno: false,
    semaforo: { key: "COBRADO", label: "Cobrado", color: "verde" },
  };
  it("cobrado / parcial / sin cobro / cancelado", () => {
    expect(semaforoDeCobro(base).key).toBe("COBRADO");
    expect(
      semaforoDeCobro({ ...base, cobrado: false, total_cobrado_usd: 1000 }),
    ).toMatchObject({ key: "PARCIAL", title: "Cobrado $1,000 de $8,050.40 USD" });
    expect(semaforoDeCobro({ ...base, cobrado: false, total_cobrado_usd: 0 }).key).toBe("SIN_COBROS");
    expect(
      semaforoDeCobro({ ...base, cobrado: false, total_cobrado_usd: 0, estado_vuelo: "CANCELADO" }).key,
    ).toBe("NO_APLICA");
  });
});

describe("abrirArchivoFirmado: la ventana se abre en el MISMO clic", () => {
  function ventana() {
    return { location: { href: "" }, close: vi.fn(), opener: {} as unknown } as unknown as Window & {
      close: ReturnType<typeof vi.fn>;
    };
  }

  it("abre about:blank ANTES de esperar la URL y luego la asigna", async () => {
    const w = ventana();
    const orden: string[] = [];
    const abrir = vi.fn((u: string) => {
      orden.push(`abrir:${u}`);
      return w;
    });
    const res = await abrirArchivoFirmado(async () => {
      orden.push("pedir");
      return { ok: true, data: "https://firmada/a.pdf" };
    }, abrir);
    expect(orden).toEqual(["abrir:about:blank", "pedir"]);
    expect(w.location.href).toBe("https://firmada/a.pdf");
    expect(res).toEqual({ ok: true, abierta: true });
  });

  it("si la URL falla, cierra la ventana vacía y devuelve el error", async () => {
    const w = ventana();
    const res = await abrirArchivoFirmado(
      async () => ({ ok: false, error: "Esta factura no tiene PDF adjunto." }),
      () => w,
    );
    expect(w.close).toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: "Esta factura no tiene PDF adjunto." });
  });

  it("ventana bloqueada: devuelve la URL para ofrecer un enlace", async () => {
    const res = await abrirArchivoFirmado(async () => ({ ok: true, data: "https://x" }), () => null);
    expect(res).toEqual({ ok: true, abierta: false, url: "https://x" });
  });

  it("si pedir la URL LANZA, no revienta", async () => {
    const res = await abrirArchivoFirmado(async () => {
      throw new Error("red");
    }, () => null);
    expect(res.ok).toBe(false);
  });
});

describe("menú: «Facturas emitidas» primero en Tesorería y la automática renombrada", () => {
  it("orden, roles, badge y etiqueta", async () => {
    const { NAV_GROUPS, filterNavGroupsForRole } = await import("@/lib/admin/nav-items");
    const { getPageTitleFromPathname } = await import("@/lib/admin/page-title");
    const tesoreria = NAV_GROUPS.find((g) => g.label === "Tesorería");
    expect(tesoreria?.items[0]).toMatchObject({
      label: "Facturas emitidas",
      href: "/admin/facturas-emitidas",
      roles: ["ADMIN", "FACTURACION"],
      badge: "por_facturar",
    });
    expect(tesoreria?.items.find((i) => i.href === "/admin/facturas")?.label).toBe(
      "Facturación automática",
    );
    // El prefijo de /admin/facturas no se come a /admin/facturas-emitidas.
    expect(getPageTitleFromPathname("/admin/facturas-emitidas")).toBe("Facturas emitidas");
    expect(getPageTitleFromPathname("/admin/facturas")).toBe("Facturación automática");
    // COORDINADOR no ve el registro (ni su badge).
    const coord = filterNavGroupsForRole("COORDINADOR").flatMap((g) => g.items);
    expect(coord.some((i) => i.href === "/admin/facturas-emitidas")).toBe(false);
  });
});
