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
  bloqueDeCelda,
  desplazarSeleccion,
  encabezadosDeSeleccion,
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
  congelarHoja,
  describirInmovilizar,
  inmovilizarDesdeSeleccion,
  mismoInmovilizar,
  opcionInmovilizarPaneles,
  tituloInmovilizar,
  ETIQUETA_INMOVILIZAR,
  INMOVILIZAR_FILA_SUPERIOR,
  OPCION_INMOVILIZAR_COLUMNA,
  OPCION_INMOVILIZAR_DEL_LIBRO,
  OPCION_INMOVILIZAR_FILA,
  OPCION_INMOVILIZAR_SIN_CELDA,
  OPCION_MOVILIZAR,
  SIN_INMOVILIZAR,
  ANCHO_MAXIMO_COLUMNA_PX,
  ANCHO_MINIMO_COLUMNA_PX,
  HOLGURA_AUTOAJUSTE_PX,
  TITULO_MANIJA_COLUMNA,
  anchoArrastrePx,
  anchoAutoajustePx,
  aplicarAnchos,
  cajaHorizontalPx,
  celdasParaAutoajuste,
  claveAnchosHoja,
  conAnchoColumna,
  fuenteCanvas,
  limitarAnchoColumnaPx,
  nombreManijaColumna,
  renglonesTexto,
  type AnchosColumnas,
  ANCHO_LIBRE_MINIMO_PX,
  GROSOR_BORDE_CELDA_PX,
  MARGEN_ARRASTRE_MARCO_PX,
  coordenadaDeReferencia,
  estiloRecorteCss,
  limitesArrastre,
  mismasColumnasFijas,
  topeAnchoColumnaPx,
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

describe("la celda seleccionada no se pierde en una combinada (19-oct-2026)", () => {
  // A1:C1 combinada (título), A3:A5 combinada (vertical), columna E oculta.
  const vista = cuadriculaHoja(
    hoja({
      max_fila: 8,
      max_col: 6,
      columnas: [{ c: 5, oculta: true }],
      combinadas: [
        { r1: 1, c1: 1, r2: 1, c2: 3 },
        { r1: 3, c1: 1, r2: 5, c2: 1 },
      ],
    }),
    libro(),
  );

  it("bloqueDeCelda: la celda misma, el ancla de la combinada que la tapa, y null fuera de lo visible", () => {
    expect(bloqueDeCelda(vista, { r: 2, c: 2 })).toEqual({ r: 2, c: 2, iFila: 1, iCol: 1, rowSpan: 1, colSpan: 1 });
    expect(bloqueDeCelda(vista, { r: 1, c: 1 })).toEqual({ r: 1, c: 1, iFila: 0, iCol: 0, rowSpan: 1, colSpan: 3 });
    // B1 y C1 están TAPADAS por A1:C1; A4 y A5 por A3:A5.
    expect(bloqueDeCelda(vista, { r: 1, c: 3 })).toEqual({ r: 1, c: 1, iFila: 0, iCol: 0, rowSpan: 1, colSpan: 3 });
    expect(bloqueDeCelda(vista, { r: 5, c: 1 })).toEqual({ r: 3, c: 1, iFila: 2, iCol: 0, rowSpan: 3, colSpan: 1 });
    // La columna E está oculta: no hay bloque.
    expect(bloqueDeCelda(vista, { r: 2, c: 5 })).toBeNull();
  });

  it("como en Excel: se sale de una combinada por su borde y caer en una coordenada tapada lleva a su ancla", () => {
    // → desde A1:C1 va a D1 (antes iba a B1, sin <td>: el contorno desaparecía).
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowRight")).toEqual({ r: 1, c: 4 });
    // ← desde D1 vuelve al ancla A1.
    expect(desplazarSeleccion(vista, { r: 1, c: 4 }, "ArrowLeft")).toEqual({ r: 1, c: 1 });
    // ↑ desde B2 entra a la combinada A1:C1 (su ancla), no a B1.
    expect(desplazarSeleccion(vista, { r: 2, c: 2 }, "ArrowUp")).toEqual({ r: 1, c: 1 });
    // ↓ desde A3:A5 sale por abajo, a A6; ↑ desde A6 vuelve a A3.
    expect(desplazarSeleccion(vista, { r: 3, c: 1 }, "ArrowDown")).toEqual({ r: 6, c: 1 });
    expect(desplazarSeleccion(vista, { r: 6, c: 1 }, "ArrowUp")).toEqual({ r: 3, c: 1 });
    // → desde B4 (a la derecha de A3:A5) y ← regresa a la combinada: A3.
    expect(desplazarSeleccion(vista, { r: 4, c: 2 }, "ArrowLeft")).toEqual({ r: 3, c: 1 });
    // Una selección que quedó TAPADA (un libro nuevo con otra combinada) sale desde su bloque.
    expect(desplazarSeleccion(vista, { r: 1, c: 2 }, "ArrowRight")).toEqual({ r: 1, c: 4 });
    expect(desplazarSeleccion(vista, { r: 4, c: 1 }, "ArrowDown")).toEqual({ r: 6, c: 1 });
    // La oculta se salta: → desde D2 va a F2.
    expect(desplazarSeleccion(vista, { r: 2, c: 4 }, "ArrowRight")).toEqual({ r: 2, c: 6 });
  });

  it("en el borde de la hoja, una combinada se queda donde está; Home lleva al ancla de la primera columna", () => {
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowUp")).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 1, c: 1 }, "ArrowLeft")).toEqual({ r: 1, c: 1 });
    expect(desplazarSeleccion(vista, { r: 4, c: 3 }, "Home")).toEqual({ r: 3, c: 1 });
    expect(desplazarSeleccion(vista, { r: 1, c: 4 }, "Home")).toEqual({ r: 1, c: 1 });
  });

  it("encabezadosDeSeleccion: la letra y el número de la celda; una combinada resalta todas sus columnas y filas visibles", () => {
    expect(encabezadosDeSeleccion(vista, { r: 2, c: 4 })).toEqual({ filas: [2], columnas: [4] });
    expect(encabezadosDeSeleccion(vista, { r: 1, c: 2 })).toEqual({ filas: [1], columnas: [1, 2, 3] });
    expect(encabezadosDeSeleccion(vista, { r: 3, c: 1 })).toEqual({ filas: [3, 4, 5], columnas: [1] });
    expect(encabezadosDeSeleccion(vista, null)).toEqual({ filas: [], columnas: [] });
    expect(encabezadosDeSeleccion(vista, { r: 2, c: 5 })).toEqual({ filas: [], columnas: [] });
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

describe("ajustar el ancho de las columnas como en Excel (14-oct-2026): aplicarAnchos", () => {
  // A (30 caracteres = 215 px) y B inmovilizadas, D oculta: visibles A, B, C, E…N.
  const base = cuadriculaHoja(
    hoja({
      max_fila: 6,
      max_col: 6,
      inmovilizar: { filas: 1, columnas: 2 },
      columnas: [
        { c: 1, ancho: 30 },
        { c: 4, oculta: true },
      ],
    }),
    libro(),
  );
  const marco: MedidasMarco = { scrollLeft: 0, scrollTop: 0, clientWidth: 600, clientHeight: 300 };

  it("sin anchos, sin cambios reales, con una columna oculta o un valor no finito ⇒ la MISMA vista", () => {
    expect(aplicarAnchos(base, undefined)).toBe(base);
    expect(aplicarAnchos(base, null)).toBe(base);
    expect(aplicarAnchos(base, {})).toBe(base);
    expect(aplicarAnchos(base, { 2: 64 })).toBe(base); // igual al del libro
    expect(aplicarAnchos(base, { 4: 300 })).toBe(base); // D está oculta: no está en la vista
    expect(aplicarAnchos(base, { 3: Number.NaN })).toBe(base);
  });

  it("columnas y ancho de tabla nuevos REUSANDO las filas; la vista del libro no se toca", () => {
    const v = aplicarAnchos(base, { 2: 100, 3: 300 });
    expect(v).not.toBe(base);
    expect(v.filas).toBe(base.filas);
    expect(v.inmovilizar).toBe(base.inmovilizar);
    expect(v.columnas.slice(0, 4).map((x) => [x.c, x.anchoPx, x.fija, x.leftPx])).toEqual([
      [1, 215, true, ANCHO_NUMERACION_PX],
      [2, 100, true, ANCHO_NUMERACION_PX + 215],
      [3, 300, false, null],
      [5, 64, false, null],
    ]);
    expect(v.anchoTablaPx).toBe(base.anchoTablaPx + (100 - 64) + (300 - 64));
    expect(base.columnas[1].anchoPx).toBe(64);
    expect(base.columnas[2].anchoPx).toBe(64);
  });

  it("el leftPx de lo inmovilizado es la suma de los anchos NUEVOS y geometriaCelda sigue cuadrando con él", () => {
    const v = aplicarAnchos(base, { 1: 80, 2: 150, 7: 333 });
    // A se angostó: B (también fija) se recorre a 46 + 80.
    expect(v.columnas[1].leftPx).toBe(ANCHO_NUMERACION_PX + 80);
    v.columnas.forEach((col, i) => {
      if (!col.fija) return;
      const antes = v.columnas.slice(0, i).reduce((acc, x) => acc + x.anchoPx, 0);
      expect(col.leftPx).toBe(ANCHO_NUMERACION_PX + antes);
      expect(geometriaCelda(v, { r: 3, c: col.c })?.x).toBe(col.leftPx);
    });
    expect(v.anchoTablaPx).toBe(ANCHO_NUMERACION_PX + v.columnas.reduce((acc, x) => acc + x.anchoPx, 0));
    // Una no fija también se mide con los anchos nuevos: H va después de C, E, F y G (333 px).
    expect(geometriaCelda(v, { r: 3, c: 8 })?.x).toBe(ANCHO_NUMERACION_PX + 80 + 150 + 64 * 3 + 333);
  });

  it("scrollParaVerCelda usa los anchos NUEVOS: una columna ensanchada empuja a las de su derecha y una fija ensanchada agranda la zona tapada", () => {
    // Con los anchos del libro, E (x 389, derecha 453) y F (453–517) se ven en 600 px.
    expect(scrollParaVerCelda(base, { r: 3, c: 5 }, marco)).toBeNull();
    expect(scrollParaVerCelda(base, { r: 3, c: 6 }, marco)).toBeNull();
    // C a 300 px ⇒ E queda en 625–689: justo lo necesario, 89.
    expect(scrollParaVerCelda(aplicarAnchos(base, { 3: 300 }), { r: 3, c: 5 }, marco)).toEqual({
      scrollLeft: 89,
      scrollTop: 0,
    });
    // B (fija) a 200 px ⇒ zona fija de 461; F queda en 589–653 ⇒ 53.
    expect(scrollParaVerCelda(aplicarAnchos(base, { 2: 200 }), { r: 3, c: 6 }, marco)).toEqual({
      scrollLeft: 53,
      scrollTop: 0,
    });
  });

  it("los anchos se limitan al mínimo y al tope", () => {
    const v = aplicarAnchos(base, { 3: 5000, 5: 2 });
    expect(v.columnas.find((x) => x.c === 3)?.anchoPx).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(v.columnas.find((x) => x.c === 5)?.anchoPx).toBe(ANCHO_MINIMO_COLUMNA_PX);
    expect([ANCHO_MINIMO_COLUMNA_PX, ANCHO_MAXIMO_COLUMNA_PX]).toEqual([12, 1000]);
    expect(limitarAnchoColumnaPx(64.4)).toBe(64);
  });
});

describe("ajustar el ancho de las columnas (14-oct-2026): qué celdas cuentan y la regla de px", () => {
  const vista = cuadriculaHoja(
    hoja({
      max_fila: 7,
      max_col: 4,
      filas: [{ r: 6, oculta: true }],
      combinadas: [
        { r1: 2, c1: 2, r2: 2, c2: 3 }, // B2:C2 abarca dos columnas: no cuenta (regla de Excel)
        { r1: 3, c1: 2, r2: 4, c2: 2 }, // B3:B4 es de una sola columna: cuenta
      ],
      celdas: [
        { r: 1, c: 2, v: "Concepto", t: "Concepto" },
        { r: 2, c: 2, v: "Título combinado larguísimo", t: "Título combinado larguísimo" },
        { r: 3, c: 2, v: "uno\ndos más largo", t: "uno\ndos más largo" },
        { r: 5, c: 2, v: null, t: "" },
        { r: 6, c: 2, v: "en fila oculta", t: "en fila oculta" },
        { r: 7, c: 2, v: 1234.5, t: "1,234.50" },
        { r: 7, c: 3, v: "otra columna", t: "otra columna" },
      ],
    }),
    libro(),
  );

  it("celdasParaAutoajuste: el texto que SE VE, sin combinadas de varias columnas, sin vacías ni ocultas; renglones por salto de línea", () => {
    const celdas = celdasParaAutoajuste(vista, 2);
    expect(celdas.map((x) => [x.ref, x.renglones])).toEqual([
      ["B1", ["Concepto"]],
      ["B3", ["uno", "dos más largo"]],
      ["B7", ["1,234.50"]],
    ]);
    // iFila/iCelda señalan la celda PINTADA (el componente coteja su data-ref).
    for (const x of celdas) {
      const cv = vista.filas[x.iFila].celdas[x.iCelda];
      expect(referenciaCelda(cv.r, cv.c)).toBe(x.ref);
    }
    // La fila 6 está oculta: B7 es la sexta fila pintada.
    expect(celdas[2].iFila).toBe(5);
    // C2 está tapada por B2:C2 (no tiene <td>); C7 sí cuenta. D no tiene nada.
    expect(celdasParaAutoajuste(vista, 3).map((x) => x.ref)).toEqual(["C7"]);
    expect(celdasParaAutoajuste(vista, 4)).toEqual([]);
    expect(renglonesTexto("a\r\nbb\rccc\nd")).toEqual(["a", "bb", "ccc", "d"]);
    expect(renglonesTexto("solo")).toEqual(["solo"]);
  });

  it("anchoAutoajustePx: el renglón más largo + relleno y borde reales + holgura, el máximo de la columna, hacia arriba", () => {
    expect(HOLGURA_AUTOAJUSTE_PX).toBeGreaterThanOrEqual(4);
    expect(HOLGURA_AUTOAJUSTE_PX).toBeLessThanOrEqual(6);
    expect(anchoAutoajustePx([{ renglonesPx: [80.2, 120.4], cajaPx: 7 }])).toBe(
      Math.ceil(120.4 + 7 + HOLGURA_AUTOAJUSTE_PX),
    );
    // Gana la celda que más necesita CON su caja: 100 + 26 de sangría > 110 + 7.
    expect(
      anchoAutoajustePx([
        { renglonesPx: [110], cajaPx: 7 },
        { renglonesPx: [100], cajaPx: 26 },
      ]),
    ).toBe(126 + HOLGURA_AUTOAJUSTE_PX);
  });

  it("anchoAutoajustePx: sin contenido ⇒ null (vuelve al ancho del libro); tope, mínimo y medidas no finitas", () => {
    expect(anchoAutoajustePx([])).toBeNull();
    expect(anchoAutoajustePx([{ renglonesPx: [0], cajaPx: 7 }])).toBeNull();
    expect(anchoAutoajustePx([{ renglonesPx: [Number.POSITIVE_INFINITY], cajaPx: 7 }])).toBeNull();
    expect(anchoAutoajustePx([{ renglonesPx: [5000], cajaPx: 7 }])).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(anchoAutoajustePx([{ renglonesPx: [1], cajaPx: 0 }])).toBe(ANCHO_MINIMO_COLUMNA_PX);
    expect(anchoAutoajustePx([{ renglonesPx: [Number.NaN, 40], cajaPx: Number.NaN }])).toBe(40 + HOLGURA_AUTOAJUSTE_PX);
  });

  it("la fuente y la caja salen del estilo CALCULADO de la celda; la sangría llega como padding-left", () => {
    expect(
      fuenteCanvas({
        fontStyle: "italic",
        fontWeight: "700",
        fontSize: "18.6667px",
        fontFamily: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',
      }),
    ).toBe('italic 700 18.6667px Calibri, Carlito, "Segoe UI", Arial, sans-serif');
    expect(fuenteCanvas({ fontStyle: "", fontWeight: "", fontSize: "", fontFamily: "" })).toBe(
      "normal 400 11pt Calibri, sans-serif",
    );
    expect(
      cajaHorizontalPx({ paddingLeft: "3px", paddingRight: "3px", borderLeftWidth: "0px", borderRightWidth: "1px" }),
    ).toBe(7);
    // Sangría 2 ⇒ padding-left 21 px (`estiloCeldaCss`): el autoajuste la cuenta una vez.
    const conSangria = estiloCeldaCss({ r: 1, c: 1, v: "x", t: "x" }, { ind: 2 }, { desborda: false });
    expect(
      cajaHorizontalPx({
        paddingLeft: String(conSangria.paddingLeft),
        paddingRight: "3px",
        borderLeftWidth: "0px",
        borderRightWidth: "1px",
      }),
    ).toBe(25);
    expect(
      cajaHorizontalPx({ paddingLeft: "", paddingRight: "3px", borderLeftWidth: "medium", borderRightWidth: "1.5px" }),
    ).toBe(4.5);
  });
});

describe("ajustar el ancho de las columnas (14-oct-2026): arrastre, estado y textos", () => {
  it("anchoArrastrePx: el ancho de antes más lo que se movió el puntero, entero, entre el mínimo y el tope", () => {
    expect(anchoArrastrePx(64, 100, 150)).toBe(114);
    expect(anchoArrastrePx(64, 100, 60)).toBe(24);
    expect(anchoArrastrePx(64, 100, 100.6)).toBe(65);
    expect(anchoArrastrePx(64, 100, 0)).toBe(ANCHO_MINIMO_COLUMNA_PX);
    expect(anchoArrastrePx(64, 0, 5000)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
  });

  it("conAnchoColumna pone o quita (null ⇒ el ancho del libro) sin mutar", () => {
    const antes: AnchosColumnas = { 3: 120 };
    const puesto = conAnchoColumna(antes, 6, 250.4);
    expect(puesto).toEqual({ 3: 120, 6: 250 });
    expect(antes).toEqual({ 3: 120 });
    expect(conAnchoColumna(puesto, 6, null)).toEqual({ 3: 120 });
    expect(conAnchoColumna(puesto, 3, Number.NaN)).toEqual({ 6: 250 });
    expect(conAnchoColumna(undefined, 2, 5)).toEqual({ 2: ANCHO_MINIMO_COLUMNA_PX });
  });

  it("claveAnchosHoja: por TIPO de libro y hoja; el «balance» del general no es el de un avión", () => {
    expect(claveAnchosHoja("general", "balance")).toBe(claveAnchosHoja("general", "balance"));
    expect(claveAnchosHoja("general", "balance")).not.toBe(claveAnchosHoja("avion", "balance"));
    expect(claveAnchosHoja("", "balance")).not.toBe(claveAnchosHoja("general", "balance"));
    expect(claveAnchosHoja("a,b", "c")).not.toBe(claveAnchosHoja("a", "b,c"));
  });

  it("textos de la manija, exactos", () => {
    expect(nombreManijaColumna("F")).toBe("Ajustar el ancho de la columna F");
    expect(nombreManijaColumna("AA")).toBe("Ajustar el ancho de la columna AA");
    expect(TITULO_MANIJA_COLUMNA).toBe("Doble clic: ajustar al contenido · Arrastra para cambiar el ancho");
  });
});

describe("revisión 14-oct-2026: una fila inmovilizada con otra fija debajo NO crece (su texto con ajuste se recorta)", () => {
  // Inmovilizar A5: filas 1–4 fijas. La 1 mide 30 pt = 40 px; las demás, 15 pt = 20 px.
  const AJUSTE: LibroExcelEstilo = { wr: true, ha: "center", va: "center" };
  const v = cuadriculaHoja(
    hoja({
      max_fila: 6,
      max_col: 5,
      inmovilizar: { filas: 4, columnas: 0 },
      filas: [{ r: 1, alto: 30 }],
      combinadas: [
        { r1: 2, c1: 1, r2: 3, c2: 1 }, // A2:A3: debajo de su span queda la fila 4, fija
        { r1: 3, c1: 2, r2: 4, c2: 2 }, // B3:B4: su span llega a la ÚLTIMA fija
      ],
      celdas: [
        { r: 1, c: 1, v: "TOTAL A COBRAR\nMXN", t: "TOTAL A COBRAR\nMXN", s: 0 },
        { r: 1, c: 2, v: "COBRADO", t: "COBRADO", s: 1 },
        { r: 1, c: 3, v: "sin ajuste", t: "sin ajuste" },
        { r: 1, c: 4, v: null, t: "", s: 1 },
        { r: 2, c: 1, v: "combinada", t: "combinada", s: 1 },
        { r: 3, c: 2, v: "hasta la última", t: "hasta la última", s: 1 },
        { r: 4, c: 1, v: "última fija", t: "última fija", s: 1 },
        { r: 5, c: 1, v: "se desplaza", t: "se desplaza", s: 1 },
      ],
    }),
    libro([{ ...AJUSTE, bd: "lrtb" }, AJUSTE]),
  );
  const recorte = (r: number, c: number) => celdaEn(v, r, c)?.altoRecortePx;

  it("el alto de su span menos sus bordes de arriba y de abajo; los altos nominales y los `top` de lo fijo no cambian", () => {
    // A1: 40 px con borde arriba y abajo (bd lrtb) ⇒ 38; B1: solo el de abajo, que lleva TODA celda ⇒ 39.
    expect(recorte(1, 1)).toBe(40 - 2 * GROSOR_BORDE_CELDA_PX);
    expect(recorte(1, 2)).toBe(40 - GROSOR_BORDE_CELDA_PX);
    // A2:A3 (vertical) suma sus dos filas.
    expect(recorte(2, 1)).toBe(20 + 20 - GROSOR_BORDE_CELDA_PX);
    expect(v.filas.slice(0, 5).map((f) => [f.altoPx, f.fija, f.topPx])).toEqual([
      [40, true, ALTO_LETRAS_PX],
      [20, true, ALTO_LETRAS_PX + 40],
      [20, true, ALTO_LETRAS_PX + 60],
      [20, true, ALTO_LETRAS_PX + 80],
      [20, false, null],
    ]);
  });

  it("sin recorte: sin ajuste, sin texto, vacía, la ÚLTIMA fija (nada fijo se le encima), un span que llega a ella y las filas que se desplazan", () => {
    expect(recorte(1, 3)).toBeNull();
    expect(recorte(1, 4)).toBeNull();
    expect(recorte(1, 5)).toBeNull();
    expect(recorte(4, 1)).toBeNull();
    expect(recorte(3, 2)).toBeNull();
    expect(recorte(5, 1)).toBeNull();
    expect(v.filas.filter((f) => !f.fija).flatMap((f) => f.celdas).every((x) => x.altoRecortePx === null)).toBe(true);
  });

  it("un ancho nuevo no lo cambia: aplicarAnchos reusa las filas (y sus recortes)", () => {
    const angosta = aplicarAnchos(v, { 1: 30 });
    expect(angosta).not.toBe(v);
    expect(angosta.filas).toBe(v.filas);
    expect(angosta.filas[0].celdas[0].altoRecortePx).toBe(38);
  });

  it("el bloque enseña RENGLONES COMPLETOS con el interlineado real (`1lh`); si ni uno cabe, el alto disponible", () => {
    expect(estiloRecorteCss(38)).toEqual({ maxHeight: "max(round(down, 38px, 1lh), min(38px, 1lh))" });
    expect(estiloRecorteCss(-3)).toEqual({ maxHeight: "max(round(down, 0px, 1lh), min(0px, 1lh))" });
    // El borde que se descuenta es el de la celda pintada.
    expect(BORDE_CELDA.startsWith(`${GROSOR_BORDE_CELDA_PX}px `)).toBe(true);
  });
});

describe("revisión 14-oct-2026: el cuerpo no se repinta al arrastrar y el clic llega por el data-ref", () => {
  it("coordenadaDeReferencia es la inversa de referenciaCelda; lo que no es una referencia ⇒ null", () => {
    for (const [r, c] of [
      [1, 1],
      [7, 2],
      [40, 26],
      [3, 27],
      [116, 46],
      [9, 52],
      [12, 53],
      [1, 702],
      [5, 703],
    ]) {
      expect(coordenadaDeReferencia(referenciaCelda(r, c))).toEqual({ r, c });
    }
    for (const malo of ["", "7", "B", "b7", "B0", "B07", "7B", "B7 ", "B-7", "B7.5"]) {
      expect(coordenadaDeReferencia(malo), malo).toBeNull();
    }
  });

  it("mismasColumnasFijas: por VALOR (columna y `left`); arrastrar una que se desplaza o la última fija no cambia lo que leen las filas", () => {
    const fijas = [
      { c: 1, leftPx: 46 },
      { c: 2, leftPx: 163 },
    ];
    expect(mismasColumnasFijas(fijas, fijas)).toBe(true);
    expect(mismasColumnasFijas(fijas, fijas.map((x) => ({ ...x })))).toBe(true);
    expect(mismasColumnasFijas(fijas, [{ c: 1, leftPx: 46 }, { c: 2, leftPx: 170 }])).toBe(false);
    expect(mismasColumnasFijas(fijas, [{ c: 1, leftPx: 46 }])).toBe(false);
    expect(mismasColumnasFijas(fijas, [{ c: 1, leftPx: 46 }, { c: 3, leftPx: 163 }])).toBe(false);
    expect(mismasColumnasFijas([], [])).toBe(true);
    const base = cuadriculaHoja(hoja({ max_col: 6, inmovilizar: { filas: 1, columnas: 2 } }), libro());
    const fijasDe = (x: ReturnType<typeof cuadriculaHoja>) => x.columnas.filter((col) => col.fija);
    expect(mismasColumnasFijas(fijasDe(base), fijasDe(aplicarAnchos(base, { 5: 300 })))).toBe(true);
    expect(mismasColumnasFijas(fijasDe(base), fijasDe(aplicarAnchos(base, { 2: 300 })))).toBe(true);
    expect(mismasColumnasFijas(fijasDe(base), fijasDe(aplicarAnchos(base, { 1: 300 })))).toBe(false);
  });
});

describe("revisión 14-oct-2026: lo inmovilizado nunca llena el marco", () => {
  // «reporte horas FLOTA» inmoviliza en D3: A (16 car. = 117 px), B (12 = 89) y C (34 = 243) fijas.
  const flota = cuadriculaHoja(
    hoja({
      max_col: 46,
      inmovilizar: { filas: 2, columnas: 3 },
      columnas: [
        { c: 1, ancho: 16 },
        { c: 2, ancho: 12 },
        { c: 3, ancho: 34 },
      ],
    }),
    libro(),
  );
  const CW = 1045; // el marco en una laptop de 1366 px

  it("una fija: el marco menos la numeración, las OTRAS fijas y la zona libre mínima; una que se desplaza o sin medidas, el tope de siempre", () => {
    expect(flota.columnas.slice(0, 3).map((x) => x.anchoPx)).toEqual([117, 89, 243]);
    expect(topeAnchoColumnaPx(flota, 2, CW)).toBe(CW - ANCHO_NUMERACION_PX - 117 - 243 - ANCHO_LIBRE_MINIMO_PX);
    expect(topeAnchoColumnaPx(flota, 2, CW)).toBe(575);
    expect(topeAnchoColumnaPx(flota, 1, CW)).toBe(CW - ANCHO_NUMERACION_PX - 89 - 243 - ANCHO_LIBRE_MINIMO_PX);
    expect(topeAnchoColumnaPx(flota, 6, CW)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(topeAnchoColumnaPx(flota, 99, CW)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(topeAnchoColumnaPx(flota, 2, 0)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(topeAnchoColumnaPx(flota, 2, Number.NaN)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    // Un marco enorme no pasa del tope de siempre; uno chico no baja del mínimo.
    expect(topeAnchoColumnaPx(flota, 2, 5000)).toBe(ANCHO_MAXIMO_COLUMNA_PX);
    expect(topeAnchoColumnaPx(flota, 2, 400)).toBe(ANCHO_MINIMO_COLUMNA_PX);
    expect(ANCHO_LIBRE_MINIMO_PX).toBe(anchoColumnaPx(8.43));
  });

  it("propiedad: con el tope puesto, numeración + fijas deja SIEMPRE la zona libre mínima (cuando cabe) y el marco sigue a la selección", () => {
    for (const cw of [700, 959, 1045, 1060, 1351, 1800]) {
      for (const c of [1, 2, 3]) {
        const v = aplicarAnchos(flota, { [c]: topeAnchoColumnaPx(flota, c, cw) });
        const fijas = v.columnas.filter((x) => x.fija);
        const fijo = ANCHO_NUMERACION_PX + fijas.reduce((acc, x) => acc + x.anchoPx, 0);
        const otras = ANCHO_NUMERACION_PX + fijas.filter((x) => x.c !== c).reduce((acc, x) => acc + x.anchoPx, 0);
        if (otras + ANCHO_MINIMO_COLUMNA_PX + ANCHO_LIBRE_MINIMO_PX > cw) continue;
        expect(fijo, `${cw} px, columna ${c}`).toBeLessThanOrEqual(cw - ANCHO_LIBRE_MINIMO_PX);
        // Antes, con lo fijo más ancho que el marco, ejeParaVer no movía nada y → no avanzaba.
        const marco = { scrollLeft: 0, scrollTop: 0, clientWidth: cw, clientHeight: 300 };
        expect(scrollParaVerCelda(v, { r: 3, c: 40 }, marco)?.scrollLeft ?? 0, `${cw} px, columna ${c}`).toBeGreaterThan(0);
      }
    }
  });

  it("limitesArrastre: la x hasta el borde VISIBLE del marco menos la manija y el ancho hasta el tope; sin medidas, sin límite", () => {
    expect(MARGEN_ARRASTRE_MARCO_PX).toBe(8);
    expect(limitesArrastre(flota, 2, { izquierdaPx: 280, clientLeft: 0, clientWidth: CW })).toEqual({
      xMaximo: 280 + CW - MARGEN_ARRASTRE_MARCO_PX,
      topePx: 575,
    });
    expect(limitesArrastre(flota, 6, { izquierdaPx: 280, clientLeft: 1, clientWidth: CW })).toEqual({
      xMaximo: 281 + CW - MARGEN_ARRASTRE_MARCO_PX,
      topePx: ANCHO_MAXIMO_COLUMNA_PX,
    });
    expect(limitesArrastre(flota, 2, { izquierdaPx: 0, clientLeft: 0, clientWidth: 0 })).toEqual({
      xMaximo: Number.POSITIVE_INFINITY,
      topePx: ANCHO_MAXIMO_COLUMNA_PX,
    });
  });

  it("anchoArrastrePx con límites: la x se detiene en el borde y el ancho en el tope; ninguno de los dos angosta por sí solo", () => {
    const lim = { xMaximo: 1000, topePx: 300 };
    expect(anchoArrastrePx(89, 500, 600, lim)).toBe(189);
    // Soltar MUY fuera del marco: la x cuenta hasta 1000 (89 + 500 = 589) y el ancho se queda en el tope.
    expect(anchoArrastrePx(89, 500, 5000, lim)).toBe(300);
    expect(anchoArrastrePx(89, 500, 5000, { xMaximo: 1000 })).toBe(589);
    // Agarrada pegada al borde (x inicial más allá del límite): no brinca; solo se puede angostar.
    expect(anchoArrastrePx(120, 1010, 1010, lim)).toBe(120);
    expect(anchoArrastrePx(120, 1010, 1100, lim)).toBe(120);
    expect(anchoArrastrePx(120, 1010, 980, lim)).toBe(90);
    // Ya más ancha que el tope (lo fijo ya llenaba el marco): no se encoge al primer movimiento.
    expect(anchoArrastrePx(400, 500, 501, lim)).toBe(400);
    expect(anchoArrastrePx(400, 500, 450, lim)).toBe(350);
    expect(anchoArrastrePx(89, 500, 0, lim)).toBe(ANCHO_MINIMO_COLUMNA_PX);
  });

  it("anchoAutoajustePx con el tope: una fija no pasa de él; sin contenido sigue siendo null; un tope no finito no cuenta", () => {
    const larga = [{ renglonesPx: [900], cajaPx: 7 }];
    expect(anchoAutoajustePx(larga, 575)).toBe(575);
    expect(anchoAutoajustePx(larga)).toBe(900 + 7 + HOLGURA_AUTOAJUSTE_PX);
    expect(anchoAutoajustePx([{ renglonesPx: [50], cajaPx: 7 }], 575)).toBe(50 + 7 + HOLGURA_AUTOAJUSTE_PX);
    expect(anchoAutoajustePx([], 575)).toBeNull();
    expect(anchoAutoajustePx(larga, Number.NaN)).toBe(900 + 7 + HOLGURA_AUTOAJUSTE_PX);
    expect(anchoAutoajustePx(larga, 3)).toBe(ANCHO_MINIMO_COLUMNA_PX);
  });
});

describe("inmovilizar paneles desde la pantalla (19-oct-2026)", () => {
  it("congelarHoja: undefined o lo mismo ⇒ la MISMA hoja; distinto ⇒ copia con el inmovilizar nuevo", () => {
    const base = hoja({ inmovilizar: { filas: 2, columnas: 1 } });
    expect(congelarHoja(base, undefined)).toBe(base);
    expect(congelarHoja(base, { filas: 2, columnas: 1 })).toBe(base);
    const sin = hoja({ inmovilizar: null });
    expect(congelarHoja(sin, SIN_INMOVILIZAR)).toBe(sin);
    const fila = congelarHoja(sin, INMOVILIZAR_FILA_SUPERIOR);
    expect(fila).not.toBe(sin);
    expect(fila.inmovilizar).toEqual({ filas: 1, columnas: 0 });
    expect(fila.celdas).toBe(sin.celdas);
    // Movilizar lo que el libro trae fijo.
    expect(congelarHoja(base, SIN_INMOVILIZAR).inmovilizar).toEqual({ filas: 0, columnas: 0 });
    // Y `cuadriculaHoja` lo convierte en `fija` como siempre.
    const v = cuadriculaHoja(congelarHoja(sin, { filas: 1, columnas: 2 }), libro());
    expect(v.columnas.filter((c) => c.fija).map((c) => c.c)).toEqual([1, 2]);
    expect(v.filas.filter((f) => f.fija).map((f) => f.r)).toEqual([1]);
  });

  it("desde la celda seleccionada, como Excel: B3 ⇒ filas 1–2 y columna A; A1 ⇒ nada; sin selección ⇒ nada", () => {
    expect(inmovilizarDesdeSeleccion({ r: 3, c: 2 })).toEqual({ filas: 2, columnas: 1 });
    expect(inmovilizarDesdeSeleccion({ r: 1, c: 4 })).toEqual({ filas: 0, columnas: 3 });
    expect(inmovilizarDesdeSeleccion({ r: 5, c: 1 })).toEqual({ filas: 4, columnas: 0 });
    expect(inmovilizarDesdeSeleccion({ r: 1, c: 1 })).toBeNull();
    expect(inmovilizarDesdeSeleccion(null)).toBeNull();
  });

  it("textos: la opción con lo que fijaría, el título con lo vigente y la descripción", () => {
    expect(describirInmovilizar(null)).toBe("nada fijo");
    expect(describirInmovilizar({ filas: 0, columnas: 0 })).toBe("nada fijo");
    expect(describirInmovilizar({ filas: 1, columnas: 0 })).toBe("fila 1");
    expect(describirInmovilizar({ filas: 4, columnas: 0 })).toBe("filas 1–4");
    expect(describirInmovilizar({ filas: 0, columnas: 1 })).toBe("columna A");
    expect(describirInmovilizar({ filas: 2, columnas: 2 })).toBe("filas 1–2 y columnas A–B");
    expect(opcionInmovilizarPaneles({ r: 3, c: 2 })).toBe("Inmovilizar paneles (filas 1–2 y columna A)");
    expect(opcionInmovilizarPaneles({ r: 1, c: 1 })).toBe(OPCION_INMOVILIZAR_SIN_CELDA);
    expect(opcionInmovilizarPaneles(null)).toBe("Inmovilizar paneles (elige una celda que no sea A1)");
    expect(tituloInmovilizar({ filas: 2, columnas: 1 })).toBe(
      "Fija filas o columnas para que no se muevan al desplazar, como en Excel · Hoy: filas 1–2 y columna A",
    );
    expect(mismoInmovilizar(null, { filas: 0, columnas: 0 })).toBe(true);
    expect(mismoInmovilizar({ filas: 1, columnas: 0 }, { filas: 0, columnas: 1 })).toBe(false);
    expect(ETIQUETA_INMOVILIZAR).toBe("Inmovilizar");
    expect(OPCION_INMOVILIZAR_FILA).toBe("Inmovilizar fila superior");
    expect(OPCION_INMOVILIZAR_COLUMNA).toBe("Inmovilizar primera columna");
    expect(OPCION_MOVILIZAR).toBe("Movilizar paneles");
    expect(OPCION_INMOVILIZAR_DEL_LIBRO).toBe("Como viene en el libro");
  });
});
