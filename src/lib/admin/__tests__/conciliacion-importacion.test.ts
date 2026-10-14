/**
 * Re-subir un estado de cuenta ya importado (13-oct-2026, API 0.0.75): la
 * vista previa, los botones según el caso, el detalle de lo que NO se
 * completó y cuándo el diálogo se queda abierto. Todo redacta lo que mandó el
 * API; nada se cuenta en el panel.
 */
import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import {
  BOTON_COMPLETAR_CONCEPTOS,
  BOTON_IMPORTAR_Y_CONCILIAR,
  DESCRIPCION_IMPORT_REPETIDO,
  MSG_API_SIN_ENRIQUECER,
  PIE_GEMELOS_ABONOS,
  PIE_GEMELOS_CARGOS,
  PIE_NO_ENCONTRADOS,
  PIE_NUEVOS_MISMO_DIA,
  TEXTO_SUGERIR_RECRUCE,
  TITULO_DETALLE_GEMELOS,
  TITULO_DETALLE_VINCULO,
  TITULO_NO_ENCONTRADOS,
  TITULO_NUEVOS_MISMO_DIA,
  botonesImportacion,
  debeQuedarseAbierto,
  esDtoSinEnriquecer,
  lineasDetalleImport,
  movimientosParaImportar,
  textoVistaPreviaImport,
} from "@/lib/admin/conciliacion-importacion";
import type { EnriquecimientoOmitido, VistaPreviaImportacion } from "@/types/conciliacion";

const vp = (over: Partial<VistaPreviaImportacion> = {}): VistaPreviaImportacion => ({
  total: 98,
  ya_estaban: 96,
  nuevos: 2,
  nuevos_mismo_dia_y_monto: 2,
  se_enriquecen: 70,
  enriquecimiento_omitidos: 0,
  moneda: "MXN",
  omitidos: [],
  nuevos_detalle: [
    { orden_archivo: 40, fecha: "2026-09-21", tipo: "CARGO", monto: 16, descripcion: "04266QGJ580051065430", mismo_dia_y_monto: true },
    { orden_archivo: 41, fecha: "2026-09-21", tipo: "CARGO", monto: 1017, descripcion: "04266QF5580051069411", mismo_dia_y_monto: true },
  ],
  enriquecibles_detalle: [],
  ...over,
});

const gemelos = (over: Partial<EnriquecimientoOmitido> = {}): EnriquecimientoOmitido => ({
  motivo: "GEMELOS",
  fecha: "2026-09-07",
  tipo: "CARGO",
  monto: 1118.12,
  moneda: "MXN",
  movimiento_ids: ["m1", "m2"],
  conceptos: ["SEL TRANSF. INTERBANCARIA SPEI BANORTE fact vip 7350", "SEL TRANSF. INTERBANCARIA SPEI BANORTE fact vip 7351"],
  facturas: ["Factura 7350", "Factura 7351"],
  ...over,
});

describe("textoVistaPreviaImport", () => {
  it("re-subir septiembre: ya estaban, se completa el concepto y 2 nuevas de misma fecha y monto", () => {
    const t = textoVistaPreviaImport(vp());
    expect(t.titulo).toBe("Antes de importar: 98 líneas");
    expect(t.lineas).toEqual([
      "96 ya estaban importadas (no se duplican)",
      "a 70 se les agregará el concepto del banco",
      "2 nuevas",
    ]);
    expect(t.tono).toBe("aviso");
    expect(t.aviso).toBe(
      "Revisa las nuevas: si este archivo es del mismo periodo que ya subiste, una línea «nueva» puede ser un duplicado (la IA la leyó distinta). Las marcadas con «misma fecha y monto» casi seguro son un movimiento que ya estaba: usa «Solo completar conceptos».",
    );
    expect(t.nuevas).toEqual([
      { texto: `${fmtDateOnly("2026-09-21")} · Cargo · ${fmtMonto(16, "MXN")} · 04266QGJ580051065430`, mismoDia: true },
      { texto: `${fmtDateOnly("2026-09-21")} · Cargo · ${fmtMonto(1017, "MXN")} · 04266QF5580051069411`, mismoDia: true },
    ]);
    expect(t.masNuevas).toBe(0);
  });

  it("singulares, gemelos y vínculos que no recibirán concepto", () => {
    const t = textoVistaPreviaImport(
      vp({
        total: 3,
        ya_estaban: 1,
        nuevos: 1,
        nuevos_mismo_dia_y_monto: 0,
        se_enriquecen: 1,
        enriquecimiento_omitidos: 3,
        omitidos: [
          gemelos(),
          { ...gemelos(), motivo: "VINCULO_NO_BANCARIO", movimiento_ids: ["m3"], monto: 212 },
        ],
        nuevos_detalle: [
          { orden_archivo: 1, fecha: "2026-09-21", tipo: "ABONO", monto: 500, descripcion: null, mismo_dia_y_monto: false },
        ],
      }),
    );
    expect(t.titulo).toBe("Antes de importar: 3 líneas");
    expect(t.lineas).toEqual([
      "1 ya estaba importada (no se duplica)",
      "a 1 se le agregará el concepto del banco",
      "2 del mismo día y monto no recibirán concepto (no se sabe cuál es cuál)",
      "1 cargo vinculado a un gasto en efectivo conserva su descripción (su justificación la cita)",
      "1 nueva",
    ]);
    // Sin «misma fecha y monto» el aviso no recomienda «Solo completar conceptos».
    expect(t.aviso).not.toContain("Solo completar conceptos");
    expect(t.nuevas[0]).toEqual({ texto: `${fmtDateOnly("2026-09-21")} · Abono · ${fmtMonto(500, "MXN")}`, mismoDia: false });
  });

  it("primera importación (nada ya estaba): tono info, sin aviso; «y N más» contra el conteo real", () => {
    const detalle = Array.from({ length: 7 }, (_, i) => ({
      orden_archivo: i + 1,
      fecha: "2026-10-01",
      tipo: "CARGO" as const,
      monto: 10 + i,
      descripcion: `ASUR CANCUN ${i}`,
      mismo_dia_y_monto: false,
    }));
    const t = textoVistaPreviaImport(
      vp({ total: 120, ya_estaban: 0, nuevos: 120, nuevos_mismo_dia_y_monto: 0, se_enriquecen: 0, nuevos_detalle: detalle }),
    );
    expect(t.lineas).toEqual(["120 nuevas"]);
    expect(t.tono).toBe("info");
    expect(t.aviso).toBeNull();
    expect(t.nuevas).toHaveLength(5);
    expect(t.masNuevas).toBe(115);
  });

  it("lo que no alcanzó a venir en el detalle se dice como total, sin inventarle un motivo", () => {
    const t = textoVistaPreviaImport(vp({ enriquecimiento_omitidos: 5, omitidos: [gemelos()] }));
    expect(t.lineas).toContain("2 del mismo día y monto no recibirán concepto (no se sabe cuál es cuál)");
    expect(t.lineas).toContain("3 más no recibirán concepto");
  });

  it("todo ya estaba: «0 nuevas»", () => {
    const t = textoVistaPreviaImport(vp({ ya_estaban: 98, nuevos: 0, nuevos_mismo_dia_y_monto: 0, nuevos_detalle: [] }));
    expect(t.lineas[t.lineas.length - 1]).toBe("0 nuevas");
    expect(t.tono).toBe("info");
  });
});

describe("botonesImportacion (orden de pintado, el principal al final)", () => {
  it("sin vista previa (API previo o error): el de siempre", () => {
    expect(botonesImportacion(null)).toEqual([{ accion: "IMPORTAR", texto: BOTON_IMPORTAR_Y_CONCILIAR, principal: true }]);
  });

  it("nada ya importado: el de siempre", () => {
    expect(botonesImportacion(vp({ ya_estaban: 0, nuevos: 98 }))).toEqual([
      { accion: "IMPORTAR", texto: "Importar y conciliar", principal: true },
    ]);
  });

  it("todo ya estaba y hay qué completar: solo «Completar conceptos»", () => {
    expect(botonesImportacion(vp({ nuevos: 0, nuevos_mismo_dia_y_monto: 0 }))).toEqual([
      { accion: "SOLO_CONCEPTOS", texto: BOTON_COMPLETAR_CONCEPTOS, principal: true },
    ]);
  });

  it("todo ya estaba y no hay nada que completar: el de siempre (solo archiva)", () => {
    expect(botonesImportacion(vp({ nuevos: 0, nuevos_mismo_dia_y_monto: 0, se_enriquecen: 0 }))).toEqual([
      { accion: "IMPORTAR", texto: "Importar y conciliar", principal: true },
    ]);
  });

  it("TODAS las nuevas con misma fecha y monto: el principal es «Solo completar conceptos»", () => {
    expect(botonesImportacion(vp())).toEqual([
      { accion: "IMPORTAR", texto: "Importar también las 2 nuevas", principal: false },
      { accion: "SOLO_CONCEPTOS", texto: "Solo completar conceptos (no agrega las 2 nuevas)", principal: true },
    ]);
    expect(botonesImportacion(vp({ nuevos: 1, nuevos_mismo_dia_y_monto: 1 }))).toEqual([
      { accion: "IMPORTAR", texto: "Importar también la nueva", principal: false },
      { accion: "SOLO_CONCEPTOS", texto: "Solo completar conceptos (no agrega la nueva)", principal: true },
    ]);
  });

  it("nuevas de verdad (no todas de misma fecha y monto): el principal es «Importar y conciliar»", () => {
    expect(botonesImportacion(vp({ nuevos: 3, nuevos_mismo_dia_y_monto: 1 }))).toEqual([
      { accion: "SOLO_CONCEPTOS", texto: "Solo completar conceptos (no agrega las 3 nuevas)", principal: false },
      { accion: "IMPORTAR", texto: "Importar y conciliar", principal: true },
    ]);
  });
});

describe("lineasDetalleImport", () => {
  it("gemelos de CARGO: qué facturas dice el archivo y cómo resolverlo", () => {
    const b = lineasDetalleImport({ estado: "LISTO", enriquecimiento: { omitidos: [gemelos()] } });
    expect(b).toEqual([
      {
        clave: "gemelos",
        titulo: TITULO_DETALLE_GEMELOS,
        lineas: [`${fmtDateOnly("2026-09-07")} · 2 cargos de ${fmtMonto(1118.12, "MXN")}: el archivo dice Factura 7350 y Factura 7351`],
        pie: PIE_GEMELOS_CARGOS,
      },
    ]);
  });

  it("gemelos sin factura: los conceptos recortados; de ABONO: comparar en el portal del banco", () => {
    const largo = "SEL TRANSF. INTERBANCARIA SPEI BANORTE PAGO DE SERVICIOS DE TRASLADO AEREO A COZUMEL";
    const b = lineasDetalleImport({
      estado: "LISTO",
      enriquecimiento: {
        omitidos: [gemelos({ tipo: "ABONO", monto: 1700, facturas: [], conceptos: [largo, "TRASPASO"] })],
      },
    });
    expect(b[0].lineas[0]).toContain("2 abonos de");
    expect(b[0].lineas[0]).toContain("…» y «TRASPASO»");
    expect(b[0].pie).toBe(PIE_GEMELOS_ABONOS);
  });

  it("vínculo no bancario, cambios concurrentes y errores", () => {
    const b = lineasDetalleImport({
      estado: "LISTO",
      enriquecimiento: {
        omitidos: [
          gemelos({ motivo: "VINCULO_NO_BANCARIO", fecha: "2026-09-30", monto: 212, movimiento_ids: ["m9"] }),
          gemelos({ motivo: "CAMBIO_CONCURRENTE", movimiento_ids: ["a"] }),
          gemelos({ motivo: "CAMBIO_CONCURRENTE", movimiento_ids: ["b"] }),
          gemelos({ motivo: "ERROR", movimiento_ids: ["c"], detalle: "timeout" }),
        ],
      },
    });
    expect(b.map((x) => x.clave)).toEqual(["vinculo", "concurrente", "error"]);
    expect(b[0]).toEqual({
      clave: "vinculo",
      titulo: TITULO_DETALLE_VINCULO,
      lineas: [
        `${fmtDateOnly("2026-09-30")} · Cargo de ${fmtMonto(212, "MXN")} vinculado a un gasto en efectivo (su justificación cita la descripción del banco)`,
      ],
      pie: null,
    });
    expect(b[1].lineas).toEqual([
      "2 no se completaron porque alguien los editó al mismo tiempo: vuelve a subir el archivo.",
    ]);
    expect(b[2].lineas).toEqual(["1 no se pudo completar: vuelve a subir el archivo."]);
  });

  it("no encontrados (NO se agregaron) con su factura y «y N más» contra el conteo real", () => {
    const detalle = Array.from({ length: 12 }, (_, i) => ({
      orden_archivo: i + 1,
      fecha: "2026-09-21",
      tipo: "CARGO" as const,
      monto: 16,
      moneda: "MXN",
      descripcion: "SEL PAGO DE SERVICIOS",
      referencia: null,
      factura: i === 0 ? "Factura 7360" : null,
    }));
    const b = lineasDetalleImport({ estado: "LISTO", solo_enriquecer: true, no_encontrados: 14, no_encontrados_detalle: detalle });
    expect(b).toHaveLength(1);
    expect(b[0].clave).toBe("no_encontrados");
    expect(b[0].titulo).toBe(TITULO_NO_ENCONTRADOS);
    expect(b[0].lineas[0]).toBe(
      `${fmtDateOnly("2026-09-21")} · Cargo · ${fmtMonto(16, "MXN")} · «SEL PAGO DE SERVICIOS» · Factura 7360`,
    );
    expect(b[0].lineas).toHaveLength(11);
    expect(b[0].lineas[10]).toBe("y 4 más");
    expect(b[0].pie).toBe(PIE_NO_ENCONTRADOS);
  });

  it("nuevos con la misma fecha y monto que otros que ya estaban", () => {
    const b = lineasDetalleImport({
      estado: "LISTO",
      nuevos_mismo_dia_y_monto: 1,
      nuevos_mismo_dia_y_monto_detalle: [
        { orden_archivo: 3, fecha: "2026-09-21", tipo: "CARGO", monto: 16, moneda: "MXN", descripcion: "04266QGJ580051065430" },
      ],
    });
    expect(b).toEqual([
      {
        clave: "mismo_dia",
        titulo: TITULO_NUEVOS_MISMO_DIA,
        lineas: [`${fmtDateOnly("2026-09-21")} · Cargo · ${fmtMonto(16, "MXN")} · «04266QGJ580051065430»`],
        pie: PIE_NUEVOS_MISMO_DIA,
      },
    ]);
  });

  it("job sin las llaves nuevas (API previo) ⇒ nada que decir", () => {
    expect(lineasDetalleImport({ estado: "LISTO" })).toEqual([]);
    expect(lineasDetalleImport(null)).toEqual([]);
  });
});

describe("debeQuedarseAbierto", () => {
  it("solo LISTO con algo que leer", () => {
    expect(debeQuedarseAbierto({ estado: "LISTO", enriquecimiento_omitidos: 2 })).toBe(true);
    expect(debeQuedarseAbierto({ estado: "LISTO", no_encontrados: 1 })).toBe(true);
    expect(debeQuedarseAbierto({ estado: "LISTO", nuevos_mismo_dia_y_monto: 2 })).toBe(true);
    expect(debeQuedarseAbierto({ estado: "LISTO", enriquecidos: 85 })).toBe(false);
    expect(debeQuedarseAbierto({ estado: "PROCESANDO", no_encontrados: 1 })).toBe(false);
    expect(debeQuedarseAbierto({ estado: "ERROR", enriquecimiento_omitidos: 2 })).toBe(false);
    expect(debeQuedarseAbierto(null)).toBe(false);
  });
});

describe("lo que viaja y los textos fijos", () => {
  it("movimientosParaImportar: el cuerpo de siempre (solo con fecha, sin campos fuera del DTO)", () => {
    const r = movimientosParaImportar({
      movimientos: [
        { fecha: "2026-09-21", descripcion: "SEL PAGO", monto: 16, tipo: "CARGO", referencia: null, estatus: "x", comision: 0 },
        { fecha: null, descripcion: "sin fecha", monto: 5, tipo: "CARGO", referencia: null },
        { fecha: "2026-09-22", descripcion: null, monto: 100, tipo: "ABONO", referencia: "R1", monto_bruto: 103.5, comision: 3.5 },
      ],
    });
    expect(r).toEqual([
      {
        fecha: "2026-09-21",
        descripcion: "SEL PAGO",
        monto: 16,
        tipo: "CARGO",
        referencia: undefined,
        monto_bruto: undefined,
        comision_monto: 0,
      },
      {
        fecha: "2026-09-22",
        descripcion: undefined,
        monto: 100,
        tipo: "ABONO",
        referencia: "R1",
        monto_bruto: 103.5,
        comision_monto: 3.5,
      },
    ]);
    expect(Object.keys(r[0])).not.toContain("estatus");
    expect(movimientosParaImportar(null)).toEqual([]);
  });

  it("el 400 del DTO previo se reconoce; los textos son los del contrato", () => {
    expect(esDtoSinEnriquecer({ status: 400, error: "property solo_enriquecer should not exist" })).toBe(true);
    expect(esDtoSinEnriquecer({ status: 400, error: "otra cosa" })).toBe(false);
    expect(esDtoSinEnriquecer({ status: 404, error: "property solo_enriquecer should not exist" })).toBe(false);
    expect(MSG_API_SIN_ENRIQUECER).toBe(
      "El servidor todavía no sabe completar conceptos: espera a que termine la actualización e intenta de nuevo.",
    );
    expect(TEXTO_SUGERIR_RECRUCE).toContain("no duplica nada ni reintenta el cruce");
    expect(DESCRIPCION_IMPORT_REPETIDO.startsWith(" Si el archivo ya estaba importado no se duplica nada")).toBe(true);
  });
});
