/**
 * Recálculo local de la hoja en pantalla (16-oct-2026, AFAC por vuelo).
 * Pedido: «pero falta que el remanente se ajuste cuando se agregue el costo
 * real del egreso, no?» — captura del #364 (N4142R): reservado $3,619.98,
 * costo real tecleado $3,000.00 y el remanente todavía en $3,619.98.
 */
import { describe, expect, it } from "vitest";
import type { LibroExcelCelda, LibroExcelEstilo, LibroExcelHoja } from "@/types/libro-excel";
import {
  FONDO_NEGATIVO,
  TEXTO_NEGATIVO,
  TITULO_CELDA_RECALCULADA,
  llaveCelda,
  recalcularDependientes,
  redondearExcel,
  referenciasDeFormula,
  textoDineroComoLibro,
} from "../libro-recalculo";
import {
  CONCEPTO_AFAC_REAL_CAPTURADO_AHORA,
  CONCEPTO_AFAC_REAL_GUARDANDO,
  CONCEPTO_AFAC_REAL_POR_CAPTURAR,
  SIN_CAMBIOS_AFAC,
  conceptoAfacLocal,
  prepararHojaAfac,
  textoCambiosGuardadosAfac,
  type CambiosAfac,
} from "../libro-afac";
import { estiloCeldaCss, tituloCelda } from "../libro-excel";

const ESTILOS: LibroExcelEstilo[] = [
  { nf: "#,##0.00" },
  { nf: '"$"#,##0.00' },
  { nf: "#,##0.00", bg: FONDO_NEGATIVO, co: TEXTO_NEGATIVO },
  { nf: "0.00####" },
];

const V364 = "5e2a0f36-0000-4000-8000-000000000364";
const V365 = "5e2a0f36-0000-4000-8000-000000000365";

const vinculo = (vueloId: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: "afac_real",
  campo: "costo_real_mxn",
  vuelo_id: vueloId,
  clave: "#364 · Mike Nelson",
  matricula: "N4142R",
  valor: null,
  reservado_mxn: 3619.98,
  editable: true,
  motivo: null,
  mes: "2026-10",
  capturado_por: null,
  capturado_at: null,
  ...extra,
});

const n = (r: number, c: number, v: number | null, f?: string, s = 0): LibroExcelCelda => ({
  r,
  c,
  v,
  t: v === null ? "" : textoDineroComoLibro(v, ESTILOS[s].nf) ?? String(v),
  s,
  ...(f ? { f } : {}),
});
const txt = (r: number, c: number, v: string): LibroExcelCelda => ({ r, c, v, t: v });

/** «otros movimientos» con dos filas AFAC por vuelo (21 y 22), TOTALES (40)
 *  y el bloque «AFAC DEL PERIODO» (43–46), con las fórmulas que escribe
 *  pyservices (`pinta`, TOTALES, `_bloque_afac_periodo`). */
function hojaOm(): LibroExcelHoja {
  const celdas: LibroExcelCelda[] = [
    txt(20, 1, "SECCIÓN AFAC POR VUELO"),
    // #364 por capturar: reservado 3,619.98, remanente = reservado.
    txt(21, 1, "#364 · Mike Nelson"),
    txt(21, 3, CONCEPTO_AFAC_REAL_POR_CAPTURAR),
    { r: 21, c: 4, v: null, t: "", s: 0, vinculo: vinculo(V364) },
    txt(21, 6, "AFAC reservado N4142R · 2.13 h × 100 USD/hr × 17.0 T.C."),
    n(21, 7, 3619.98),
    n(21, 9, 3619.98, "=ROUND(G21-D21,2)"),
    // #365 ya capturado: 1,000 de 1,200.
    txt(22, 1, "#365 · Beh Kay"),
    txt(22, 3, "AFAC costo real · capturó Ale el 16/10/2026"),
    { r: 22, c: 4, v: 1000, t: "1,000.00", s: 0, vinculo: vinculo(V365, { valor: 1000, reservado_mxn: 1200 }) },
    n(22, 7, 1200),
    n(22, 9, 200, "=ROUND(G22-D22,2)"),
    // Una fila normal de otros movimientos (no depende de AFAC).
    n(23, 4, 500),
    n(23, 7, 800),
    n(23, 9, 300, "=ROUND(G23-D23,2)"),
    // TOTALES.
    txt(40, 1, "TOTALES"),
    n(40, 4, 1500, "=ROUND(SUM(D4:D39),2)"),
    n(40, 7, 5619.98, "=ROUND(SUM(G4:G39),2)"),
    n(40, 9, 4119.98, "=ROUND(G40-D40,2)"),
    // AFAC DEL PERIODO.
    txt(43, 1, "AFAC por vuelo"),
    n(43, 4, 1000, "=ROUND(SUM(D21:D22),2)"),
    n(43, 7, 4819.98, "=ROUND(SUM(G21:G22),2)"),
    n(43, 9, 3819.98, "=ROUND(SUM(I21:I22),2)"),
    n(44, 4, 2500),
    n(45, 4, 2500, "=ROUND(SUM(D44:D44),2)"),
    n(46, 4, 1500, "=ROUND(D45-D43,2)"),
    // Fórmulas que el recálculo NO sabe evaluar: se quedan como vinieron y
    // lo que depende de ellas también.
    n(48, 4, 1000, "=AVERAGE(D21:D22)"),
    n(49, 4, 2000, "=ROUND(D48*2,2)"),
    n(50, 4, 77, "='otros gastos'!$C$5"),
  ];
  return {
    nombre: "otros movimientos",
    pestana: null,
    cuadricula: true,
    inmovilizar: { filas: 3, columnas: 1 },
    max_fila: 50,
    max_col: 10,
    columnas: [],
    filas: [],
    combinadas: [],
    celdas,
  };
}

const celda = (h: LibroExcelHoja, r: number, c: number) => h.celdas.find((x) => x.r === r && x.c === c);

describe("recalcularDependientes: como Excel al escribir en una celda (solo fórmulas de la MISMA hoja)", () => {
  it("el caso de la captura: $3,000.00 en el #364 ⇒ remanente $619.98, TOTALES y «AFAC DEL PERIODO» al día", () => {
    const h = hojaOm();
    const cambios: CambiosAfac = { [V364]: { valor: 3000, estado: "guardado", guardadoEn: 1 } };
    const p = prepararHojaAfac(h, { cambios, puedeEditar: true, estilos: ESTILOS });
    expect(celda(p, 21, 4)).toMatchObject({ v: 3000, t: "3,000.00" });
    expect(celda(p, 21, 9)).toMatchObject({ v: 619.98, t: "619.98", f: "=ROUND(G21-D21,2)", recalculada: { negativo: false } });
    expect(celda(p, 40, 4)).toMatchObject({ v: 4500, t: "4,500.00", recalculada: { negativo: false } });
    expect(celda(p, 40, 9)).toMatchObject({ v: 1119.98, t: "1,119.98" });
    expect(celda(p, 43, 4)).toMatchObject({ v: 4000, t: "4,000.00" });
    expect(celda(p, 43, 9)).toMatchObject({ v: 819.98, t: "819.98" });
    // DIFERENCIA = pagado − costo real.
    expect(celda(p, 46, 4)).toMatchObject({ v: -1500, t: "-1,500.00", recalculada: { negativo: true } });
    // El concepto de la fila deja de decir «por capturar».
    expect(celda(p, 21, 3)).toMatchObject({ v: CONCEPTO_AFAC_REAL_CAPTURADO_AHORA, t: CONCEPTO_AFAC_REAL_CAPTURADO_AHORA });
  });

  it("lo que NO depende de la celda tecleada es el MISMO objeto (la otra fila AFAC, la fila normal, G y el reservado)", () => {
    const h = hojaOm();
    const p = prepararHojaAfac(h, {
      cambios: { [V364]: { valor: 3000, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    for (const [r, c] of [
      [21, 7],
      [22, 3],
      [22, 9],
      [23, 9],
      [40, 7],
      [43, 7],
      [45, 4],
      [50, 4],
    ]) {
      expect(celda(p, r, c)).toBe(celda(h, r, c));
    }
  });

  it("una fórmula que no se sabe evaluar se queda como vino, y lo que depende de ella también (nunca un número nuevo encima de uno viejo)", () => {
    const p = prepararHojaAfac(hojaOm(), {
      cambios: { [V364]: { valor: 3000, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 48, 4)).toMatchObject({ v: 1000 });
    expect(celda(p, 48, 4)?.recalculada).toBeUndefined();
    expect(celda(p, 49, 4)).toMatchObject({ v: 2000 });
    expect(celda(p, 49, 4)?.recalculada).toBeUndefined();
  });

  it("costo real MAYOR que el reservado: el remanente queda negativo, con texto «-» y la marca para el rojo", () => {
    const p = prepararHojaAfac(hojaOm(), {
      cambios: { [V364]: { valor: 4000.5, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 21, 9)).toMatchObject({ v: -380.52, t: "-380.52", recalculada: { negativo: true } });
  });

  it("quitar el costo real (DELETE) vuelve el remanente al reservado y el concepto a «por capturar»", () => {
    const p = prepararHojaAfac(hojaOm(), {
      cambios: { [V365]: { valor: null, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 22, 4)).toMatchObject({ v: null, t: "" });
    expect(celda(p, 22, 9)).toMatchObject({ v: 1200, t: "1,200.00" });
    expect(celda(p, 22, 3)?.v).toBe(CONCEPTO_AFAC_REAL_POR_CAPTURAR);
    expect(celda(p, 40, 4)).toMatchObject({ v: 500 });
  });

  it("mientras el PUT no contesta: el número y su recálculo ya se ven; el concepto dice «guardando…»", () => {
    const p = prepararHojaAfac(hojaOm(), {
      cambios: { [V364]: { valor: 3000, estado: "guardando", guardadoEn: null } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 21, 9)?.v).toBe(619.98);
    expect(celda(p, 21, 3)?.v).toBe(CONCEPTO_AFAC_REAL_GUARDANDO);
  });

  it("un cambio local con el MISMO monto que ya trae el libro no recalcula nada (llegó el libro nuevo)", () => {
    const h = hojaOm();
    const p = prepararHojaAfac(h, {
      cambios: { [V365]: { valor: 1000, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 22, 9)).toBe(celda(h, 22, 9));
    expect(celda(p, 40, 4)).toBe(celda(h, 40, 4));
  });

  it("sin cambios locales: nada se recalcula (solo el estado de edición) y la hoja del libro NO se muta", () => {
    const h = hojaOm();
    const p = prepararHojaAfac(h, { cambios: SIN_CAMBIOS_AFAC, puedeEditar: true, estilos: ESTILOS });
    expect(p.celdas.filter((x) => x.recalculada)).toHaveLength(0);
    expect(celda(p, 21, 3)).toBe(celda(h, 21, 3));
    const p2 = prepararHojaAfac(h, {
      cambios: { [V364]: { valor: 3000, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(p2).not.toBe(h);
    expect(celda(h, 21, 9)?.v).toBe(3619.98);
    expect(celda(h, 21, 3)?.v).toBe(CONCEPTO_AFAC_REAL_POR_CAPTURAR);
  });

  it("el concepto solo se cambia si es el «AFAC costo real · …» de su fila, a la izquierda de la celda tecleada", () => {
    const h = hojaOm();
    // Un concepto ajeno (otro texto) en la fila no se toca.
    h.celdas = h.celdas.map((x) => (x.r === 21 && x.c === 3 ? txt(21, 3, "Otra cosa") : x));
    const p = prepararHojaAfac(h, {
      cambios: { [V364]: { valor: 3000, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: ESTILOS,
    });
    expect(celda(p, 21, 3)?.v).toBe("Otra cosa");
  });

  it("formato que no se sabe escribir: la fórmula se queda como vino y sus dependientes también", () => {
    const celdas: LibroExcelCelda[] = [
      n(1, 1, 5),
      { r: 1, c: 2, v: 10, t: "10.00", s: 3, f: "=ROUND(A1*2,2)" },
      n(1, 3, 20, "=ROUND(B1*2,2)"),
    ];
    const cambiadas = new Set([llaveCelda(1, 1)]);
    const conNuevo = celdas.map((x) => (x.c === 1 ? { ...x, v: 7 } : x));
    const out = recalcularDependientes(conNuevo, cambiadas, ESTILOS);
    expect(out).toBe(conNuevo);
  });

  it("una referencia circular no cuelga: se queda como vino", () => {
    const celdas: LibroExcelCelda[] = [n(1, 1, 5), n(1, 2, 1, "=ROUND(C1+A1,2)"), n(1, 3, 1, "=ROUND(B1,2)")];
    const out = recalcularDependientes(celdas, new Set([llaveCelda(1, 1)]), ESTILOS);
    expect(out[1].v).toBe(1);
    expect(out[2].v).toBe(1);
  });
});

describe("piezas del recálculo", () => {
  it("referenciasDeFormula: celdas y rangos de la MISMA hoja; otra hoja no cuenta; una función con dígitos no es celda", () => {
    expect(referenciasDeFormula("=ROUND(G21-D21,2)")).toEqual([llaveCelda(21, 7), llaveCelda(21, 4)]);
    expect(referenciasDeFormula("=ROUND(SUM($D$4:D6),2)")).toEqual([llaveCelda(4, 4), llaveCelda(5, 4), llaveCelda(6, 4)]);
    expect(referenciasDeFormula("='otros gastos'!$C$5+B2")).toEqual([llaveCelda(2, 2)]);
    expect(referenciasDeFormula("=balance!B3")).toEqual([]);
    expect(referenciasDeFormula("=LOG10(A1)")).toEqual([llaveCelda(1, 1)]);
    expect(referenciasDeFormula("=SUM(A1:Z99999)")).toBeNull();
  });

  it("redondearExcel: medio hacia afuera sobre 15 cifras, sin «-0»", () => {
    expect(redondearExcel(1.005, 2)).toBe(1.01);
    expect(redondearExcel(2.675, 2)).toBe(2.68);
    expect(redondearExcel(-2.5, 0)).toBe(-3);
    expect(redondearExcel(0.1 + 0.2, 2)).toBe(0.3);
    expect(redondearExcel(3619.98 - 3000, 2)).toBe(619.98);
    expect(Object.is(redondearExcel(-0.001, 2), 0)).toBe(true);
  });

  it("textoDineroComoLibro: el `formatear` de pyservices para dinero; otro formato ⇒ null", () => {
    expect(textoDineroComoLibro(619.98, "#,##0.00")).toBe("619.98");
    expect(textoDineroComoLibro(-1500, "#,##0.00")).toBe("-1,500.00");
    expect(textoDineroComoLibro(1700, '"$"#,##0.00')).toBe("$1,700.00");
    expect(textoDineroComoLibro(-619.98, '"$"#,##0.00')).toBe("-$619.98");
    expect(textoDineroComoLibro(5, "#,##0.00;[Red]-#,##0.00")).toBe("5.00");
    expect(textoDineroComoLibro(-5, "#,##0.00;[Red]-#,##0.00")).toBeNull();
    expect(textoDineroComoLibro(17.03, "0.00####")).toBeNull();
    expect(textoDineroComoLibro(1, undefined)).toBeNull();
  });

  it("conceptoAfacLocal y el texto de la barra", () => {
    expect(conceptoAfacLocal({ valor: 3000, estado: "guardando" })).toBe("AFAC costo real · guardando…");
    expect(conceptoAfacLocal({ valor: 3000, estado: "guardado" })).toBe("AFAC costo real · capturado ahora");
    expect(conceptoAfacLocal({ valor: null, estado: "guardado" })).toBe("AFAC costo real · por capturar");
    expect(textoCambiosGuardadosAfac(1)).toBe("1 cambio guardado · el resto del libro se actualiza en unos segundos");
  });
});

describe("cómo se pinta una celda recalculada", () => {
  it("negativa: el rojo de los negativos del libro; deja de serlo: se quita; sin la marca, el CSS de siempre", () => {
    const base: LibroExcelCelda = { r: 1, c: 9, v: -5, t: "-5.00", s: 0 };
    const neg = estiloCeldaCss({ ...base, recalculada: { negativo: true } }, ESTILOS[0], { desborda: false });
    expect(neg.backgroundColor).toBe(`#${FONDO_NEGATIVO}`);
    expect(neg.color).toBe(`#${TEXTO_NEGATIVO}`);
    const pos = estiloCeldaCss({ ...base, v: 5, recalculada: { negativo: false } }, ESTILOS[2], { desborda: false });
    expect(pos.backgroundColor).toBeUndefined();
    expect(pos.color).toBeUndefined();
    const igual = estiloCeldaCss(base, ESTILOS[2], { desborda: false });
    expect(igual.backgroundColor).toBe(`#${FONDO_NEGATIVO}`);
    const sinEstilo = estiloCeldaCss({ ...base, recalculada: { negativo: true } }, null, { desborda: false });
    expect(sinEstilo.color).toBe(`#${TEXTO_NEGATIVO}`);
  });

  it("el tooltip dice que el servidor la confirma (después de la fórmula)", () => {
    expect(tituloCelda({ r: 21, c: 9, v: 619.98, t: "619.98", f: "=ROUND(G21-D21,2)", recalculada: { negativo: false } })).toBe(
      `=ROUND(G21-D21,2)\n${TITULO_CELDA_RECALCULADA}`,
    );
    expect(tituloCelda({ r: 21, c: 9, v: 1, t: "1.00", f: "=X" })).toBe("=X");
  });
});
