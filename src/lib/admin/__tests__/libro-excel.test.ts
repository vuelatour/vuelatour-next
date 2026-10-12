/**
 * Modelo de pantalla de un libro de Excel (12-oct-2026). Lo que se custodia:
 * las medidas de Excel (ancho 8.43 ⇒ 64 px, alto 15 pt ⇒ 20 px, letras de
 * columna), que las ocultas no se pintan, que las combinadas se resuelven en
 * `colSpan`/`rowSpan` sobre su primera celda visible, los desplazamientos de
 * los paneles inmovilizados, el estilo ⇒ CSS y la regla del texto que asoma.
 */
import { describe, expect, it } from "vitest";
import type { LibroExcel, LibroExcelEstilo, LibroExcelHoja } from "@/types/libro-excel";
import {
  ALTO_LETRAS_PX,
  ANCHO_NUMERACION_PX,
  BORDE_CELDA,
  COLUMNAS_MINIMAS,
  FILAS_MINIMAS,
  alineacionHorizontal,
  altoFilaPx,
  anchoColumnaPx,
  contenidoBarraFormulas,
  cuadriculaHoja,
  desbordaTexto,
  desplazarSeleccion,
  estiloCeldaCss,
  letraColumna,
  referenciaCelda,
  textoHojas,
  tituloCelda,
} from "../libro-excel";

function hoja(p: Partial<LibroExcelHoja> = {}): LibroExcelHoja {
  return {
    nombre: "hoja",
    pestana: null,
    cuadricula: true,
    inmovilizar: null,
    max_fila: 1,
    max_col: 1,
    columnas: [],
    filas: [],
    combinadas: [],
    celdas: [],
    ...p,
  };
}

function libro(estilos: LibroExcelEstilo[] = []): Pick<
  LibroExcel,
  "estilos" | "ancho_columna_default" | "alto_fila_default"
> {
  return { estilos, ancho_columna_default: 8.43, alto_fila_default: 15 };
}

const celdaEn = (vista: ReturnType<typeof cuadriculaHoja>, r: number, c: number) =>
  vista.filas.find((f) => f.r === r)?.celdas.find((x) => x.c === c);

describe("letras y medidas de Excel", () => {
  it("letras de columna: A, Z, AA, AZ, BA, ZZ, AAA", () => {
    expect([1, 26, 27, 52, 53, 702, 703].map(letraColumna)).toEqual([
      "A",
      "Z",
      "AA",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
    expect(() => letraColumna(0)).toThrow(RangeError);
    expect(referenciaCelda(7, 2)).toBe("B7");
  });

  it("ancho en caracteres ⇒ px (8.43 ⇒ 64, como Excel) y alto en puntos ⇒ px (15 ⇒ 20)", () => {
    expect(anchoColumnaPx(8.43)).toBe(64);
    expect(anchoColumnaPx(30)).toBe(215);
    expect(altoFilaPx(15)).toBe(20);
    expect(altoFilaPx(38)).toBe(51);
  });
});

describe("cuadriculaHoja", () => {
  it("rellena la hoja hasta el mínimo de filas y columnas (la hoja termina en cuadrícula, no en blanco)", () => {
    const v = cuadriculaHoja(hoja({ max_fila: 3, max_col: 2 }), libro());
    expect(v.filas).toHaveLength(FILAS_MINIMAS);
    expect(v.columnas).toHaveLength(COLUMNAS_MINIMAS);
    expect(v.columnas[0]).toEqual({ c: 1, letra: "A", anchoPx: 64, fija: false, leftPx: null });
    expect(v.filas[0].altoPx).toBe(20);
  });

  it("anchos y altos propios; el ancho de la tabla suma la numeración", () => {
    const v = cuadriculaHoja(
      hoja({ columnas: [{ c: 1, ancho: 30 }], filas: [{ r: 2, alto: 38 }] }),
      libro(),
    );
    expect(v.columnas[0].anchoPx).toBe(215);
    expect(v.columnas[1].anchoPx).toBe(64);
    expect(v.filas[1].altoPx).toBe(51);
    expect(v.anchoTablaPx).toBe(ANCHO_NUMERACION_PX + 215 + 64 * (COLUMNAS_MINIMAS - 1));
  });

  it("las filas y columnas ocultas no se pintan (y la numeración salta, como en Excel)", () => {
    const v = cuadriculaHoja(
      hoja({ columnas: [{ c: 2, oculta: true }], filas: [{ r: 2, oculta: true }] }),
      libro(),
    );
    expect(v.columnas.map((x) => x.c).slice(0, 3)).toEqual([1, 3, 4]);
    expect(v.filas.map((x) => x.r).slice(0, 3)).toEqual([1, 3, 4]);
  });

  it("combinadas: colSpan/rowSpan en la primera celda visible y las tapadas no se pintan", () => {
    const v = cuadriculaHoja(
      hoja({
        max_fila: 4,
        max_col: 4,
        combinadas: [
          { r1: 1, c1: 1, r2: 1, c2: 3 },
          { r1: 2, c1: 2, r2: 3, c2: 2 },
        ],
        celdas: [{ r: 1, c: 1, v: "Título", t: "Título" }],
      }),
      libro(),
    );
    expect(celdaEn(v, 1, 1)).toMatchObject({ colSpan: 3, rowSpan: 1 });
    expect(celdaEn(v, 1, 1)?.celda?.t).toBe("Título");
    expect(celdaEn(v, 1, 2)).toBeUndefined();
    expect(celdaEn(v, 1, 3)).toBeUndefined();
    expect(celdaEn(v, 1, 4)).toMatchObject({ colSpan: 1 });
    expect(celdaEn(v, 2, 2)).toMatchObject({ rowSpan: 2 });
    expect(celdaEn(v, 3, 2)).toBeUndefined();
  });

  it("una combinada que cruza una columna oculta se encoge; si su ancla está oculta, el contenido pasa a la primera visible", () => {
    const v = cuadriculaHoja(
      hoja({
        max_fila: 2,
        max_col: 3,
        columnas: [{ c: 2, oculta: true }],
        filas: [{ r: 1, oculta: true }],
        combinadas: [
          { r1: 2, c1: 1, r2: 2, c2: 3 },
          { r1: 1, c1: 3, r2: 2, c2: 3 },
        ],
        celdas: [
          { r: 2, c: 1, v: "ancho", t: "ancho" },
          { r: 1, c: 3, v: "alto", t: "alto" },
        ],
      }),
      libro(),
    );
    // A2:C2 con B oculta ⇒ 2 columnas visibles… pero C2 está tapada por C1:C2.
    expect(celdaEn(v, 2, 1)).toMatchObject({ colSpan: 2 });
    // C1:C2 con la fila 1 oculta ⇒ el contenido de C1 se pinta en C2 con rowSpan 1.
    expect(celdaEn(v, 2, 3)).toMatchObject({ rowSpan: 1, colSpan: 1 });
    expect(celdaEn(v, 2, 3)?.celda?.t).toBe("alto");
  });

  it("paneles inmovilizados (D3 = 2 filas y 3 columnas): fijas con su desplazamiento acumulado", () => {
    const v = cuadriculaHoja(
      hoja({ inmovilizar: { filas: 2, columnas: 3 }, columnas: [{ c: 2, ancho: 30 }] }),
      libro(),
    );
    expect(v.inmovilizar).toEqual({ filas: 2, columnas: 3 });
    expect(v.columnas.slice(0, 4).map((x) => [x.fija, x.leftPx])).toEqual([
      [true, ANCHO_NUMERACION_PX],
      [true, ANCHO_NUMERACION_PX + 64],
      [true, ANCHO_NUMERACION_PX + 64 + 215],
      [false, null],
    ]);
    expect(v.filas.slice(0, 3).map((x) => [x.fija, x.topPx])).toEqual([
      [true, ALTO_LETRAS_PX],
      [true, ALTO_LETRAS_PX + 20],
      [false, null],
    ]);
  });

  it("el estilo se resuelve por índice (sin índice o fuera de la tabla ⇒ null)", () => {
    const v = cuadriculaHoja(
      hoja({
        celdas: [
          { r: 1, c: 1, v: 1, t: "1", s: 0 },
          { r: 1, c: 2, v: 2, t: "2" },
          { r: 1, c: 3, v: 3, t: "3", s: 9 },
        ],
      }),
      libro([{ b: true }]),
    );
    expect(celdaEn(v, 1, 1)?.estilo).toEqual({ b: true });
    expect(celdaEn(v, 1, 2)?.estilo).toBeNull();
    expect(celdaEn(v, 1, 3)?.estilo).toBeNull();
  });

  it("el texto asoma sobre la celda vacía de la derecha; no sobre una con valor ni sobre una combinada", () => {
    const v = cuadriculaHoja(
      hoja({
        max_fila: 3,
        max_col: 4,
        combinadas: [{ r1: 3, c1: 2, r2: 3, c2: 3 }],
        celdas: [
          { r: 1, c: 1, v: "largo", t: "largo" },
          { r: 2, c: 1, v: "largo", t: "largo" },
          { r: 2, c: 2, v: "x", t: "x" },
          { r: 3, c: 1, v: "largo", t: "largo" },
          { r: 1, c: 3, v: 12, t: "12" },
        ],
      }),
      libro(),
    );
    expect(celdaEn(v, 1, 1)?.desborda).toBe(true);
    expect(celdaEn(v, 2, 1)?.desborda).toBe(false);
    expect(celdaEn(v, 3, 1)?.desborda).toBe(false);
    expect(celdaEn(v, 1, 3)?.desborda).toBe(false);
  });
});

describe("desbordaTexto", () => {
  const texto = { r: 1, c: 1, v: "hola", t: "hola" };
  it("solo texto sin ajuste, a la izquierda, sin combinar y con la vecina libre", () => {
    expect(desbordaTexto(texto, null, 1, false)).toBe(true);
    expect(desbordaTexto(texto, null, 1, true)).toBe(false);
    expect(desbordaTexto(texto, { wr: true }, 1, false)).toBe(false);
    expect(desbordaTexto(texto, { ha: "center" }, 1, false)).toBe(false);
    expect(desbordaTexto(texto, { ha: "left" }, 1, false)).toBe(true);
    expect(desbordaTexto(texto, null, 2, false)).toBe(false);
    expect(desbordaTexto({ ...texto, v: 5, t: "5" }, null, 1, false)).toBe(false);
    expect(desbordaTexto({ ...texto, v: "", t: "" }, null, 1, false)).toBe(false);
    expect(desbordaTexto(null, null, 1, false)).toBe(false);
  });
});

describe("estilo ⇒ CSS", () => {
  it("alineación «general»: números a la derecha, booleanos al centro, texto a la izquierda; la explícita manda", () => {
    expect(alineacionHorizontal({ r: 1, c: 1, v: 1, t: "1" }, null)).toBe("right");
    expect(alineacionHorizontal({ r: 1, c: 1, v: true, t: "VERDADERO" }, null)).toBe("center");
    expect(alineacionHorizontal({ r: 1, c: 1, v: "x", t: "x" }, null)).toBe("left");
    expect(alineacionHorizontal(null, null)).toBe("left");
    expect(alineacionHorizontal({ r: 1, c: 1, v: 1, t: "1" }, { ha: "centerContinuous" })).toBe("center");
    expect(alineacionHorizontal({ r: 1, c: 1, v: "x", t: "x" }, { ha: "distributed" })).toBe("justify");
    expect(alineacionHorizontal({ r: 1, c: 1, v: "x", t: "x" }, { ha: "right" })).toBe("right");
  });

  it("sin estilo: solo alineación, espacios preservados y recorte", () => {
    expect(estiloCeldaCss(null, null, { desborda: false })).toEqual({
      textAlign: "left",
      whiteSpace: "pre",
      overflow: "hidden",
    });
    expect(estiloCeldaCss({ r: 1, c: 1, v: "x", t: "x" }, null, { desborda: true }).overflow).toBe(
      "visible",
    );
  });

  it("todo el estilo del libro, como lo pintaría Excel", () => {
    const css = estiloCeldaCss(
      { r: 1, c: 1, v: "x", t: "x" },
      { bg: "0F4C81", co: "FFFFFF", b: true, i: true, u: true, sz: 14, va: "center", wr: true, ind: 2, bd: "lt" },
      { desborda: false },
    );
    expect(css).toEqual({
      textAlign: "left",
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      backgroundColor: "#0F4C81",
      color: "#FFFFFF",
      fontWeight: 700,
      fontStyle: "italic",
      textDecoration: "underline",
      fontSize: "14pt",
      verticalAlign: "middle",
      paddingLeft: "21px",
      borderLeft: BORDE_CELDA,
      borderTop: BORDE_CELDA,
    });
    expect(estiloCeldaCss(null, { bd: "rb" }, { desborda: false })).toMatchObject({
      borderRight: BORDE_CELDA,
      borderBottom: BORDE_CELDA,
    });
  });
});

describe("barra de fórmulas, tooltip y pestañas", () => {
  it("la barra enseña la fórmula si la hay; si no, el valor crudo", () => {
    expect(contenidoBarraFormulas({ r: 1, c: 1, v: 1214.5, t: "1,214.50", f: "=SUM(B3:B4)" })).toBe(
      "=SUM(B3:B4)",
    );
    expect(contenidoBarraFormulas({ r: 1, c: 1, v: 1234.5, t: "1,234.50" })).toBe("1234.5");
    expect(contenidoBarraFormulas({ r: 1, c: 1, v: true, t: "VERDADERO" })).toBe("VERDADERO");
    expect(contenidoBarraFormulas({ r: 1, c: 1, v: null, t: "" })).toBe("");
    expect(contenidoBarraFormulas(null)).toBe("");
  });

  it("el tooltip lleva la nota y, debajo, la fórmula", () => {
    expect(tituloCelda({ r: 1, c: 1, v: 1, t: "1", n: "nota", f: "=A1" })).toBe("nota\n=A1");
    expect(tituloCelda({ r: 1, c: 1, v: 1, t: "1", f: "=A1" })).toBe("=A1");
    expect(tituloCelda({ r: 1, c: 1, v: 1, t: "1" })).toBeUndefined();
    expect(tituloCelda(null)).toBeUndefined();
  });

  it("«1 hoja» / «9 hojas»", () => {
    expect(textoHojas(1)).toBe("1 hoja");
    expect(textoHojas(9)).toBe("9 hojas");
  });
});

describe("desplazarSeleccion", () => {
  const vista = cuadriculaHoja(hoja({ max_fila: 3, max_col: 2, filas: [{ r: 2, oculta: true }] }), libro());

  it("salta las filas ocultas y se queda en los bordes", () => {
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowDown")).toEqual({ r: 3, c: 1 });
    expect(desplazarSeleccion(vista, { r: 3, c: 1 }, "ArrowUp")).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowUp")).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowLeft")).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowRight")).toEqual({ r: 1, c: 2 });
  });

  it("una selección que ya no existe (fila oculta) vuelve a la primera celda", () => {
    expect(desplazarSeleccion(vista, { r: 2, c: 1 }, "ArrowDown")).toEqual({ r: 1, c: 1 });
  });
});
