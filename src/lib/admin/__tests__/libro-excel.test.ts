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
  esTeclaNavegacionHoja,
  estiloCeldaCss,
  filasPorPagina,
  geometriaCelda,
  letraColumna,
  referenciaCelda,
  scrollParaVerCelda,
  textoHojas,
  tituloCelda,
  type MedidasMarco,
  ETIQUETA_ACTUALIZANDO_LIBRO as ETIQUETA_ACTUALIZANDO,
  ETIQUETA_ACTUALIZAR_LIBRO as ETIQUETA_ACTUALIZAR,
  TITULO_ACTUALIZAR_LIBRO as TITULO_ACTUALIZAR,
  TOAST_LIBRO_ACTUALIZADO as TOAST_ACTUALIZADO,
  resolverHojaIdx,
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

describe("desplazarSeleccion: PageUp/PageDown y Home/End (revisión 13-oct-2026)", () => {
  // 40 filas visibles de 20 px (la hoja mínima), 14 columnas.
  const vista = cuadriculaHoja(hoja({ max_fila: 1, max_col: 1 }), libro());

  it("esTeclaNavegacionHoja: flechas, PageUp/PageDown y Home/End; nada más", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]) {
      expect(esTeclaNavegacionHoja(k), k).toBe(true);
    }
    for (const k of ["Enter", "Escape", "Tab", " ", "a", "F5"]) expect(esTeclaNavegacionHoja(k), k).toBe(false);
  });

  it("PageDown/PageUp saltan `filasPorPagina` filas y se quedan en el borde; sin la opción, una fila", () => {
    expect(desplazarSeleccion(vista, { r: 7, c: 2 }, "PageDown", { filasPorPagina: 14 })).toEqual({ r: 21, c: 2 });
    expect(desplazarSeleccion(vista, { r: 21, c: 2 }, "PageDown", { filasPorPagina: 14 })).toEqual({ r: 35, c: 2 });
    expect(desplazarSeleccion(vista, { r: 35, c: 2 }, "PageDown", { filasPorPagina: 14 })).toEqual({ r: 40, c: 2 });
    expect(desplazarSeleccion(vista, { r: 21, c: 2 }, "PageUp", { filasPorPagina: 14 })).toEqual({ r: 7, c: 2 });
    expect(desplazarSeleccion(vista, { r: 7, c: 2 }, "PageUp", { filasPorPagina: 14 })).toEqual({ r: 1, c: 2 });
    expect(desplazarSeleccion(vista, { r: 7, c: 2 }, "PageDown")).toEqual({ r: 8, c: 2 });
    // Una página de 0 o fraccionaria cuenta como mínimo 1.
    expect(desplazarSeleccion(vista, { r: 7, c: 2 }, "PageDown", { filasPorPagina: 0 })).toEqual({ r: 8, c: 2 });
    expect(desplazarSeleccion(vista, { r: 7, c: 2 }, "PageDown", { filasPorPagina: 2.9 })).toEqual({ r: 9, c: 2 });
  });

  it("Home/End: primera/última columna de la fila; con Ctrl/⌘, A1 y la última celda visible", () => {
    expect(desplazarSeleccion(vista, { r: 7, c: 5 }, "Home")).toEqual({ r: 7, c: 1 });
    expect(desplazarSeleccion(vista, { r: 7, c: 5 }, "End")).toEqual({ r: 7, c: 14 });
    expect(desplazarSeleccion(vista, { r: 7, c: 5 }, "Home", { conControl: true })).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 7, c: 5 }, "End", { conControl: true })).toEqual({ r: 40, c: 14 });
  });

  it("la secuencia del hallazgo: PageDown, PageDown, ↓ ya NO vuelve a donde empezó (y el marco sigue a la celda)", () => {
    const marco: MedidasMarco = { scrollLeft: 0, scrollTop: 0, clientWidth: 600, clientHeight: 300 };
    let sel = { r: 7, c: 2 };
    let scroll = marco;
    const pulsar = (tecla: "PageDown" | "ArrowDown") => {
      sel = desplazarSeleccion(vista, sel, tecla, {
        filasPorPagina: filasPorPagina(vista, scroll, sel.r, "abajo"),
      });
      const d = scrollParaVerCelda(vista, sel, scroll);
      if (d) scroll = { ...scroll, ...d };
    };
    pulsar("PageDown");
    // Zona libre = 300 − 22 = 278 px ⇒ caben 13 filas de 20 px.
    expect(sel).toEqual({ r: 20, c: 2 });
    expect(scroll.scrollTop).toBeGreaterThan(0);
    pulsar("PageDown");
    expect(sel).toEqual({ r: 33, c: 2 });
    const arriba = scroll.scrollTop;
    pulsar("ArrowDown");
    expect(sel).toEqual({ r: 34, c: 2 });
    expect(scroll.scrollTop).toBeGreaterThanOrEqual(arriba);
  });
});

describe("filasPorPagina: las filas que caben en la zona libre del marco", () => {
  it("descuenta las letras y las filas inmovilizadas; cuenta desde la fila dada, hacia abajo o hacia arriba; mínimo 1", () => {
    const vista = cuadriculaHoja(
      hoja({ max_fila: 1, max_col: 1, inmovilizar: { filas: 2, columnas: 0 }, filas: [{ r: 2, alto: 38 }] }),
      libro(),
    );
    // Ocupado arriba = 22 + 20 + 51 = 93; con 300 px quedan 207 ⇒ 10 filas de 20 px.
    expect(filasPorPagina(vista, { clientHeight: 300 }, 7)).toBe(10);
    expect(filasPorPagina(vista, { clientHeight: 300 }, 7, "abajo")).toBe(10);
    // Hacia arriba desde la fila 5: 5, 4, 3 (20 cada una) + 2 (51) + 1 (20) = 131 ⇒ las 5 caben.
    expect(filasPorPagina(vista, { clientHeight: 300 }, 5, "arriba")).toBe(5);
    // Cerca del final cuenta las que quedan.
    expect(filasPorPagina(vista, { clientHeight: 300 }, 38)).toBe(3);
    // Sin medidas (SSR), más fijo que ventana, o fila inexistente ⇒ 1.
    expect(filasPorPagina(vista, { clientHeight: 0 }, 7)).toBe(1);
    expect(filasPorPagina(vista, { clientHeight: 93 }, 7)).toBe(1);
    expect(filasPorPagina(vista, { clientHeight: 300 }, 999)).toBe(1);
    // Una sola fila que no cabe entera también cuenta 1.
    expect(filasPorPagina(vista, { clientHeight: 100 }, 7)).toBe(1);
  });
});

describe("geometriaCelda y scrollParaVerCelda: el marco sigue a la selección", () => {
  // Hoja con paneles inmovilizados (2 filas, 1 columna), anchos y altos propios,
  // una fila oculta y dos combinadas (una cruza la zona fija):
  //   zona fija izquierda = 46 + 215 = 261 · zona fija arriba = 22 + 20 + 51 = 93
  //   columnas B..K = 64 px (B en 261, F en 517, G en 581, I en 709, J en 773) · L = 705 px (en 901)
  //   filas 3.. = 20 px (fila 3 en 93, 8 en 193, 10 en 233, 12 en 273, 13 en 293, 14 en 313)
  const vista = cuadriculaHoja(
    hoja({
      max_fila: 60,
      max_col: 20,
      inmovilizar: { filas: 2, columnas: 1 },
      columnas: [
        { c: 1, ancho: 30 },
        { c: 12, ancho: 100 },
      ],
      filas: [
        { r: 2, alto: 38 },
        { r: 30, oculta: true },
      ],
      combinadas: [
        { r1: 1, c1: 1, r2: 1, c2: 3 },
        { r1: 5, c1: 9, r2: 5, c2: 10 },
      ],
    }),
    libro(),
  );
  const marco = (p: Partial<MedidasMarco> = {}): MedidasMarco => ({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 600,
    clientHeight: 300,
    ...p,
  });

  it("geometriaCelda: x/y acumulan desde la numeración y las letras; combinada ⇒ el span; tapada ⇒ 1×1; oculta ⇒ null", () => {
    expect(geometriaCelda(vista, { r: 3, c: 2 })).toEqual({
      x: 261,
      y: 93,
      ancho: 64,
      alto: 20,
      fijaCol: false,
      fijaFila: false,
    });
    expect(geometriaCelda(vista, { r: 2, c: 1 })).toEqual({
      x: 46,
      y: 42,
      ancho: 215,
      alto: 51,
      fijaCol: true,
      fijaFila: true,
    });
    // I5:J5 combinada: el ancla mide las dos columnas.
    expect(geometriaCelda(vista, { r: 5, c: 9 })).toMatchObject({ x: 709, y: 133, ancho: 128, alto: 20 });
    // J5 está TAPADA por la combinada (no tiene <td>): se trata como 1×1, sin mirar el DOM.
    expect(geometriaCelda(vista, { r: 5, c: 10 })).toMatchObject({ x: 773, y: 133, ancho: 64, alto: 20 });
    // A1:C1 cruza la columna fija: ancho = 215 + 64 + 64.
    expect(geometriaCelda(vista, { r: 1, c: 1 })).toMatchObject({ x: 46, y: 22, ancho: 343, fijaCol: true, fijaFila: true });
    // Fila oculta ⇒ null (y una columna fuera de la hoja también).
    expect(geometriaCelda(vista, { r: 30, c: 2 })).toBeNull();
    expect(geometriaCelda(vista, { r: 3, c: 21 })).toBeNull();
    // La fila oculta no suma: la 31 va justo debajo de la 29.
    const y29 = geometriaCelda(vista, { r: 29, c: 2 })?.y ?? NaN;
    expect(geometriaCelda(vista, { r: 31, c: 2 })?.y).toBe(y29 + 20);
  });

  it("una sola cuenta: la geometría nueva coincide con leftPx/topPx de los paneles inmovilizados", () => {
    for (const col of vista.columnas.filter((x) => x.fija)) {
      expect(geometriaCelda(vista, { r: 3, c: col.c })?.x).toBe(col.leftPx);
    }
    for (const fila of vista.filas.filter((f) => f.fija)) {
      expect(geometriaCelda(vista, { r: fila.r, c: 2 })?.y).toBe(fila.topPx);
    }
    // Y en la hoja D3 de la prueba de los paneles (3 columnas y 2 filas fijas).
    const d3 = cuadriculaHoja(
      hoja({ inmovilizar: { filas: 2, columnas: 3 }, columnas: [{ c: 2, ancho: 30 }] }),
      libro(),
    );
    const fijas = d3.columnas.filter((x) => x.fija);
    expect(fijas.map((x) => geometriaCelda(d3, { r: 1, c: x.c })?.x)).toEqual(fijas.map((x) => x.leftPx));
    expect(d3.filas.filter((f) => f.fija).map((f) => geometriaCelda(d3, { r: f.r, c: 4 })?.y)).toEqual(
      d3.filas.filter((f) => f.fija).map((f) => f.topPx),
    );
  });

  it("ya visible ⇒ null, también en los bordes EXACTOS", () => {
    expect(scrollParaVerCelda(vista, { r: 3, c: 2 }, marco())).toBeNull();
    // Fila 12: y 273, fondo 293 ≤ 300.
    expect(scrollParaVerCelda(vista, { r: 12, c: 2 }, marco())).toBeNull();
    // Fila 8 con scrollTop 100: 193 − 100 = 93 = justo el borde de la zona fija.
    expect(scrollParaVerCelda(vista, { r: 8, c: 2 }, marco({ scrollTop: 100 }))).toBeNull();
    // Columna F: x 517, derecha 581 ≤ 600.
    expect(scrollParaVerCelda(vista, { r: 3, c: 6 }, marco())).toBeNull();
    // Una celda inexistente (fila oculta) tampoco mueve nada.
    expect(scrollParaVerCelda(vista, { r: 30, c: 2 }, marco({ scrollTop: 900 }))).toBeNull();
  });

  it("cortada a la derecha o abajo ⇒ justo lo necesario, pegada al borde", () => {
    // G3: x 581, derecha 645 ⇒ 45 px.
    expect(scrollParaVerCelda(vista, { r: 3, c: 7 }, marco())).toEqual({ scrollLeft: 45, scrollTop: 0 });
    // Fila 13 (fondo 313) ⇒ 13; fila 14 (fondo 333) ⇒ 33.
    expect(scrollParaVerCelda(vista, { r: 13, c: 2 }, marco())).toEqual({ scrollLeft: 0, scrollTop: 13 });
    expect(scrollParaVerCelda(vista, { r: 14, c: 2 }, marco())).toEqual({ scrollLeft: 0, scrollTop: 33 });
    // Los dos ejes a la vez.
    expect(scrollParaVerCelda(vista, { r: 14, c: 7 }, marco())).toEqual({ scrollLeft: 45, scrollTop: 33 });
  });

  it("bajo lo fijo (o por delante) ⇒ pegada a lo fijo, no al borde del marco", () => {
    // Con scrollLeft 45, B3 (x 261) queda bajo la columna A fija ⇒ 261 − 261 = 0.
    expect(scrollParaVerCelda(vista, { r: 3, c: 2 }, marco({ scrollLeft: 45 }))).toEqual({
      scrollLeft: 0,
      scrollTop: 0,
    });
    // Con scrollTop 100, la fila 3 (y 93) queda bajo las filas fijas ⇒ 0.
    expect(scrollParaVerCelda(vista, { r: 3, c: 2 }, marco({ scrollTop: 100 }))).toEqual({
      scrollLeft: 0,
      scrollTop: 0,
    });
    // Con scrollTop 300, la fila 10 (y 233) ⇒ 233 − 93 = 140 (no 233: quedaría bajo lo fijo).
    expect(scrollParaVerCelda(vista, { r: 10, c: 2 }, marco({ scrollTop: 300 }))).toEqual({
      scrollLeft: 0,
      scrollTop: 140,
    });
  });

  it("una celda en columna o fila fija no mueve ese eje", () => {
    // A10: la columna A es fija ⇒ X se queda en 500; Y sí sube a 140.
    expect(scrollParaVerCelda(vista, { r: 10, c: 1 }, marco({ scrollLeft: 500, scrollTop: 300 }))).toEqual({
      scrollLeft: 500,
      scrollTop: 140,
    });
    // B2: la fila 2 es fija ⇒ Y se queda; X ya se ve ⇒ null.
    expect(scrollParaVerCelda(vista, { r: 2, c: 2 }, marco({ scrollTop: 400 }))).toBeNull();
    // A1: fija en los dos ejes ⇒ nunca se mueve.
    expect(scrollParaVerCelda(vista, { r: 1, c: 1 }, marco({ scrollLeft: 900, scrollTop: 900 }))).toBeNull();
  });

  it("una combinada se enseña completa; una celda más ancha que la zona libre se alinea al inicio", () => {
    // I5:J5 (x 709, ancho 128): derecha 837 ⇒ 837 − 600 = 237.
    expect(scrollParaVerCelda(vista, { r: 5, c: 9 }, marco())).toEqual({ scrollLeft: 237, scrollTop: 0 });
    // Tras aplicarlo ya se ve entera: la segunda llamada no mueve nada.
    expect(scrollParaVerCelda(vista, { r: 5, c: 9 }, marco({ scrollLeft: 237 }))).toBeNull();
    // L (x 901, 705 px) no cabe en los 339 px libres ⇒ pegada a lo fijo: 901 − 261 = 640.
    expect(scrollParaVerCelda(vista, { r: 3, c: 12 }, marco())).toEqual({ scrollLeft: 640, scrollTop: 0 });
    expect(scrollParaVerCelda(vista, { r: 3, c: 12 }, marco({ scrollLeft: 640 }))).toBeNull();
  });

  it("marco sin medidas (SSR) o sin zona libre ⇒ no se mueve; nunca devuelve negativos", () => {
    expect(scrollParaVerCelda(vista, { r: 14, c: 7 }, marco({ clientWidth: 0, clientHeight: 0 }))).toBeNull();
    // 200 px de ancho < 261 de zona fija: el eje X no se mueve aunque L esté lejos.
    expect(scrollParaVerCelda(vista, { r: 3, c: 12 }, marco({ clientWidth: 200 }))).toBeNull();
    // Hoja sin paneles fijos y un scroll exagerado: A1 vuelve a 0, nunca a un negativo.
    const sencilla = cuadriculaHoja(hoja(), libro());
    const lejos = marco({ scrollLeft: 5000, scrollTop: 5000 });
    expect(scrollParaVerCelda(sencilla, { r: 1, c: 1 }, lejos)).toEqual({ scrollLeft: 0, scrollTop: 0 });
    for (const f of sencilla.filas) {
      for (const c of sencilla.columnas) {
        const d = scrollParaVerCelda(sencilla, { r: f.r, c: c.c }, lejos);
        expect(d).not.toBeNull();
        expect(d?.scrollLeft).toBeGreaterThanOrEqual(0);
        expect(d?.scrollTop).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("«Actualizar datos» (14-oct-2026): la hoja que se veía sigue al actualizar", () => {
  const hojas = (...nombres: string[]) => nombres.map((nombre) => ({ nombre }));

  it("por NOMBRE: si el libro ganó una hoja antes, se sigue enseñando la misma", () => {
    // Se veía «balance» (posición 2); el libro nuevo trae «otros ingresos aviones» antes.
    const antes = hojas("RESUMEN flota", "reporte horas FLOTA", "balance");
    const despues = hojas("RESUMEN flota", "reporte horas FLOTA", "otros ingresos aviones", "balance");
    expect(resolverHojaIdx(antes, { idx: 2, nombre: "balance" })).toBe(2);
    expect(resolverHojaIdx(despues, { idx: 2, nombre: "balance" })).toBe(3);
  });

  it("si la hoja ya no existe, la misma posición; y si tampoco, la primera", () => {
    const libro = hojas("A", "B", "C");
    expect(resolverHojaIdx(libro, { idx: 1, nombre: "ya no está" })).toBe(1);
    expect(resolverHojaIdx(libro, { idx: 7, nombre: "ya no está" })).toBe(0);
    expect(resolverHojaIdx(libro, { idx: -1, nombre: null })).toBe(0);
    expect(resolverHojaIdx(libro, { idx: 1.5, nombre: null })).toBe(0);
    expect(resolverHojaIdx([], { idx: 3, nombre: "A" })).toBe(0);
  });

  it("con nombres repetidos gana el de la misma posición", () => {
    const libro = hojas("vuelos", "vuelos", "balance");
    expect(resolverHojaIdx(libro, { idx: 1, nombre: "vuelos" })).toBe(1);
    expect(resolverHojaIdx(libro, { idx: 2, nombre: "vuelos" })).toBe(0);
  });

  it("textos del botón, exactos", () => {
    expect(ETIQUETA_ACTUALIZAR).toBe("Actualizar datos");
    expect(ETIQUETA_ACTUALIZANDO).toBe("Actualizando…");
    expect(TITULO_ACTUALIZAR).toBe(
      "Vuelve a leer los datos del libro sin recargar la página: se quedan la hoja, la celda seleccionada y el desplazamiento",
    );
    expect(TOAST_ACTUALIZADO).toBe("Datos actualizados");
  });
});
