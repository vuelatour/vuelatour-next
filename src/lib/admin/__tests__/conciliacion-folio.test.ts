/**
 * Número de factura en la conciliación (5-oct-2026, API 0.0.57). Pedido del
 * cliente: «al momento de la conciliación me apoyan a poner el número de la
 * factura con la que se enlaza el movimiento». El folio lo resuelve el API
 * (`folio_comprobante`, fuente única `folioComprobanteDeGasto`); aquí se
 * congelan los RÓTULOS del panel con folios reales de prod («FEACZM 72128»
 * de ASUR, «AB1144717») y la columna «Folio» de Facturas recibidas.
 */
import { describe, expect, it } from "vitest";
import {
  ENCABEZADO_FOLIO_RECIBIDA,
  LARGO_REFERENCIA_UUID,
  PLACEHOLDER_BUSCAR_RECIBIDA,
  PREFIJO_FACTURA,
  SIN_FOLIO,
  celdaFolioRecibida,
  etiquetaFolioComprobante,
  folioLimpio,
  referenciaUuid,
  serieFolioDeRecibida,
  textoBusquedaFolioRecibida,
  tituloFolioComprobante,
} from "@/lib/admin/conciliacion-folio";
import {
  descripcionCandidatoGasto,
  etiquetaCandidatoGasto,
} from "@/lib/admin/conciliacion-auto";
import {
  fichaCandidatoGasto,
  lineaGastoLote,
  opcionesRespaldoVincular,
  resumenLoteFila,
  textoBusquedaGastos,
} from "@/lib/admin/conciliacion-lote";
import type { MovimientoGasto } from "@/types/conciliacion";

const UUID = "3f2a9c1e-7b4d-4e8a-9c21-0a1b2c3d4e5f";

describe("folioLimpio / referenciaUuid", () => {
  it("recorta y descarta vacíos o no-texto", () => {
    expect(folioLimpio("  FEACZM-72128 ")).toBe("FEACZM-72128");
    expect(folioLimpio("   ")).toBeNull();
    expect(folioLimpio("")).toBeNull();
    expect(folioLimpio(null)).toBeNull();
    expect(folioLimpio(undefined)).toBeNull();
    expect(folioLimpio({})).toBeNull();
    expect(folioLimpio(411)).toBe("411");
  });

  it("referencia corta del UUID: «…» + los últimos 8 (como la de facturas emitidas)", () => {
    expect(LARGO_REFERENCIA_UUID).toBe(8);
    expect(referenciaUuid(UUID)).toBe("…2c3d4e5f");
    expect(referenciaUuid(UUID)).toBe(`…${UUID.slice(-8)}`);
    expect(referenciaUuid(null)).toBeNull();
    expect(referenciaUuid("  ")).toBeNull();
  });
});

describe("etiquetaFolioComprobante (celda «Conciliación» y candidatos)", () => {
  it("«Factura <folio>» con lo que resolvió el API", () => {
    expect(PREFIJO_FACTURA).toBe("Factura");
    expect(etiquetaFolioComprobante("FEACZM-72128")).toBe("Factura FEACZM-72128");
    expect(etiquetaFolioComprobante("FEACZM 72128")).toBe("Factura FEACZM 72128");
    expect(etiquetaFolioComprobante(" AB1144717 ")).toBe("Factura AB1144717");
    expect(etiquetaFolioComprobante("A-0411")).toBe("Factura A-0411");
  });

  it("sin folio (null, vacío o API previo) ⇒ null: no se pinta nada", () => {
    expect(etiquetaFolioComprobante(null)).toBeNull();
    expect(etiquetaFolioComprobante(undefined)).toBeNull();
    expect(etiquetaFolioComprobante("   ")).toBeNull();
    expect(tituloFolioComprobante(null)).toBeNull();
    expect(tituloFolioComprobante("")).toBeNull();
  });

  it("«CFDI <uuid>» (último recurso del API) se acorta; completo en el tooltip", () => {
    const folio = `CFDI ${UUID}`;
    expect(etiquetaFolioComprobante(folio)).toBe(`Factura CFDI …${UUID.slice(-8)}`);
    expect(tituloFolioComprobante(folio)).toBe(`Factura CFDI ${UUID}`);
    // En mayúsculas también (el SAT las usa).
    expect(etiquetaFolioComprobante(`CFDI ${UUID.toUpperCase()}`)).toBe(
      `Factura CFDI …${UUID.toUpperCase().slice(-8)}`,
    );
  });

  it("un ticket que solo EMPIEZA con «CFDI» no se recorta", () => {
    expect(etiquetaFolioComprobante("CFDI 123")).toBe("Factura CFDI 123");
    expect(tituloFolioComprobante("A-0411")).toBe("Factura A-0411");
  });
});

describe("candidatos de «Vincular gasto»", () => {
  const base = {
    id: "g1",
    monto: 1840.5,
    moneda: "MXN",
    categoria: "ATERRIZAJE",
    fecha_gasto: "2026-09-21",
    proveedor: "ASUR",
    lugar: "CZM",
    tarjeta_terminacion: "0585",
  };

  it("la descripción incluye «Factura …» justo después de la tarjeta (la línea se recorta)", () => {
    const d = descripcionCandidatoGasto({ ...base, folio_comprobante: "FEACZM-72128" })!;
    expect(d).toBe("Tarjeta ****0585 · Factura FEACZM-72128 · CZM");
  });

  it("sin folio (API previo) la descripción es la de siempre", () => {
    expect(descripcionCandidatoGasto(base)).toBe("Tarjeta ****0585 · CZM");
    expect(descripcionCandidatoGasto({ ...base, folio_comprobante: null })).toBe("Tarjeta ****0585 · CZM");
  });

  it("solo con folio, la descripción ya no es null", () => {
    expect(descripcionCandidatoGasto({ id: "g", monto: 10 })).toBeNull();
    expect(descripcionCandidatoGasto({ id: "g", monto: 10, folio_comprobante: "AB1144717" })).toBe(
      "Factura AB1144717",
    );
  });

  it("la etiqueta principal no cambia (el folio va en la descripción)", () => {
    expect(etiquetaCandidatoGasto({ ...base, folio_comprobante: "FEACZM-72128" })).not.toContain("Factura");
  });

  it("la ficha del API (gastos-candidatos) conserva el folio", () => {
    const ficha = fichaCandidatoGasto({ ...base, nota: "Pago aterrizaje", folio_comprobante: "FEACZM-72128" });
    expect(ficha.folio_comprobante).toBe("FEACZM-72128");
    expect(descripcionCandidatoGasto(ficha)).toContain("Factura FEACZM-72128");
  });

  it("el respaldo con API previo (candidatos de la IA) también lo lleva", () => {
    const ops = opcionesRespaldoVincular([], {
      disponible: true,
      gasto_id_sugerido: "g1",
      confianza: 0.9,
      candidatos: [{ ...base, folio_comprobante: "FEACZM-72128" }],
    } as never);
    expect(ops[0].description).toContain("Factura FEACZM-72128");
  });
});

describe("lote (1 cargo ↔ N gastos): un folio por gasto", () => {
  const parte = (id: string, folio: string | null | undefined): MovimientoGasto => ({
    id,
    monto: "2801.40",
    moneda: "MXN",
    categoria: "OPERACIONES",
    fecha_gasto: "2026-09-14",
    vuelo_id: null,
    vuelo: null,
    notas_primera_linea: "Pago VIP SAESA",
    monto_parte: "2801.40",
    ...(folio !== undefined ? { folio_comprobante: folio } : {}),
  });

  it("lineaGastoLote lleva su «Factura …» y el tooltip", () => {
    const l = lineaGastoLote(parte("a", `CFDI ${UUID}`));
    expect(l.factura).toBe(`Factura CFDI …${UUID.slice(-8)}`);
    expect(l.facturaTitulo).toBe(`Factura CFDI ${UUID}`);
  });

  it("sin folio o API previo ⇒ null", () => {
    expect(lineaGastoLote(parte("a", null)).factura).toBeNull();
    expect(lineaGastoLote(parte("a", undefined)).factura).toBeNull();
  });

  it("resumenLoteFila: cada línea con el folio de SU gasto", () => {
    const r = resumenLoteFila({
      monto: "8404.20",
      gastos_n: 3,
      gastos: [parte("a", "S-101"), parte("b", null), parte("c", "S-103")],
    });
    expect(r?.lineas.map((l) => l.factura)).toEqual(["Factura S-101", null, "Factura S-103"]);
  });

  it("la búsqueda rápida encuentra el cargo por el número de factura", () => {
    const t = textoBusquedaGastos({ gastos: [parte("a", "FEACZM-72128"), parte("b", null)] });
    expect(t).toContain("FEACZM-72128");
    expect(textoBusquedaGastos({ gasto: parte("a", `CFDI ${UUID}`) })).toContain(UUID);
  });
});

describe("columna «Folio» de Facturas recibidas", () => {
  it("encabezado y buscador", () => {
    expect(ENCABEZADO_FOLIO_RECIBIDA).toBe("Folio");
    expect(SIN_FOLIO).toBe("—");
    expect(PLACEHOLDER_BUSCAR_RECIBIDA).toBe("Buscar factura (emisor, RFC, folio, UUID, concepto)…");
  });

  it("serie-folio con la regla del API: solo con folio; serie sola no es un número", () => {
    expect(serieFolioDeRecibida({ serie: "A", folio: "0411" })).toBe("A-0411");
    expect(serieFolioDeRecibida({ serie: " FEACZM ", folio: " 72128 " })).toBe("FEACZM-72128");
    expect(serieFolioDeRecibida({ serie: null, folio: "0411" })).toBe("0411");
    expect(serieFolioDeRecibida({ serie: "", folio: "0411" })).toBe("0411");
    expect(serieFolioDeRecibida({ serie: "A", folio: null })).toBeNull();
    expect(serieFolioDeRecibida({ serie: "A", folio: "  " })).toBeNull();
    expect(serieFolioDeRecibida(null)).toBeNull();
  });

  it("con serie-folio: el número y el UUID completo en el tooltip", () => {
    expect(celdaFolioRecibida({ serie: "A", folio: "0411", uuid_fiscal: UUID })).toEqual({
      texto: "A-0411",
      titulo: `UUID ${UUID}`,
    });
    expect(celdaFolioRecibida({ serie: "A", folio: "0411", uuid_fiscal: null })).toEqual({
      texto: "A-0411",
      titulo: null,
    });
  });

  it("API nuevo sin folio (aún sin releer o el CFDI no lo trae): «…últimos 8 del UUID»", () => {
    expect(celdaFolioRecibida({ serie: null, folio: null, uuid_fiscal: UUID })).toEqual({
      texto: `…${UUID.slice(-8)}`,
      titulo: `UUID ${UUID}`,
    });
  });

  it("solo PDF (sin UUID) ⇒ «—»", () => {
    expect(celdaFolioRecibida({ serie: null, folio: null, uuid_fiscal: null })).toEqual({
      texto: "—",
      titulo: null,
    });
  });

  it("API previo (no manda serie ni folio) ⇒ «—» aunque haya UUID", () => {
    expect(celdaFolioRecibida({ uuid_fiscal: UUID })).toEqual({ texto: "—", titulo: null });
  });

  it("el buscador suma la serie-folio (vacío si no hay)", () => {
    expect(textoBusquedaFolioRecibida({ serie: "A", folio: "0411" })).toBe("A-0411");
    expect(textoBusquedaFolioRecibida({ uuid_fiscal: UUID })).toBe("");
  });
});
