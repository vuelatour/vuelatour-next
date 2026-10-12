/**
 * Modelo de PANTALLA de un libro de Excel (12-oct-2026). PURO: sin React,
 * sin red. Recibe el JSON `libro_json` que arma pyservices del MISMO libro
 * openpyxl que se descarga y lo convierte en lo que pinta
 * `components/admin/reportes/libro-excel.tsx`: columnas con su ancho en px,
 * filas con su alto, celdas con sus `colSpan`/`rowSpan` (combinadas), el
 * estilo de cada una como CSS y qué celdas quedan fijas (paneles
 * inmovilizados).
 *
 * Pedido del cliente: «mismo formato, con los mismos colores y estructura
 * para que dé la impresión de que está trabajando sobre el Excel». Por eso
 * aquí NO se decide ningún texto ni ningún número: `t` (el texto formateado)
 * y `v` (el valor) vienen del libro; esto solo traduce medidas y estilos.
 */
import type { CSSProperties } from "react";
import type {
  LibroExcel,
  LibroExcelCelda,
  LibroExcelEstilo,
  LibroExcelHoja,
} from "@/types/libro-excel";

/** Ancho de columna de Excel (caracteres de Calibri 11) → px: 7 px por carácter + 5 de margen. 8.43 ⇒ 64 px, como Excel. */
export const PX_POR_CARACTER = 7;
export const PX_MARGEN_COLUMNA = 5;
/** Columna de numeración de filas (la gris de la izquierda). */
export const ANCHO_NUMERACION_PX = 46;
/** Renglón de letras de columna (el gris de arriba). */
export const ALTO_LETRAS_PX = 22;
/** La hoja se rellena hasta aquí con celdas vacías: un libro «termina» en Excel con cuadrícula, no en blanco. */
export const FILAS_MINIMAS = 40;
export const COLUMNAS_MINIMAS = 14;
/** Verde de la celda seleccionada de Excel. */
export const COLOR_SELECCION = "#217346";
/** Línea de un borde de celda (openpyxl no exporta el color del borde). */
export const BORDE_CELDA = "1px solid #7f7f7f";

/** 1 ⇒ A, 26 ⇒ Z, 27 ⇒ AA (letras de columna de Excel). */
export function letraColumna(c: number): string {
  if (!Number.isInteger(c) || c < 1) throw new RangeError(`Columna inválida: ${c}`);
  let n = c;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/** «B7»: la referencia que Excel enseña en el cuadro de nombres. */
export function referenciaCelda(r: number, c: number): string {
  return `${letraColumna(c)}${r}`;
}

export function anchoColumnaPx(ancho: number): number {
  return Math.max(0, Math.round(ancho * PX_POR_CARACTER + PX_MARGEN_COLUMNA));
}

/** Alto de fila en puntos → px (96 px por pulgada, 72 pt por pulgada): 15 pt ⇒ 20 px. */
export function altoFilaPx(alto: number): number {
  return Math.max(0, Math.round((alto * 96) / 72));
}

export interface ColumnaVista {
  c: number;
  letra: string;
  anchoPx: number;
  /** Columna inmovilizada (a la izquierda de la línea de congelado). */
  fija: boolean;
  /** `left` de la columna fija dentro del marco (px); null si no es fija. */
  leftPx: number | null;
}

export interface CeldaVista {
  r: number;
  c: number;
  colSpan: number;
  rowSpan: number;
  /** La celda del libro (null = vacía, sin estilo). */
  celda: LibroExcelCelda | null;
  estilo: LibroExcelEstilo | null;
  /** Texto sin ajuste que, como en Excel, se deja asomar sobre la celda vacía de la derecha. */
  desborda: boolean;
}

export interface FilaVista {
  r: number;
  altoPx: number;
  fija: boolean;
  /** `top` de la fila fija dentro del marco (px); null si no es fija. */
  topPx: number | null;
  celdas: CeldaVista[];
}

export interface HojaVista {
  columnas: ColumnaVista[];
  filas: FilaVista[];
  /** Ancho total de la tabla (numeración + columnas visibles). */
  anchoTablaPx: number;
  inmovilizar: { filas: number; columnas: number };
}

type DimensionesLibro = Pick<LibroExcel, "estilos" | "ancho_columna_default" | "alto_fila_default">;

const clave = (r: number, c: number): string => `${r}:${c}`;

function rango(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function tieneContenido(celda: LibroExcelCelda | null | undefined): boolean {
  return celda != null && celda.v !== null && celda.v !== "";
}

/**
 * ¿El texto de la celda se deja asomar hacia la derecha? Igual que Excel:
 * texto sin ajuste, alineado a la izquierda, no combinado y con la celda de
 * la derecha vacía (y sin estar ocupada por una combinada). Un número nunca
 * desborda (Excel lo convierte en «####»; aquí se recorta).
 */
export function desbordaTexto(
  celda: LibroExcelCelda | null,
  estilo: LibroExcelEstilo | null,
  colSpan: number,
  siguienteOcupada: boolean,
): boolean {
  if (!celda || typeof celda.v !== "string" || celda.v === "") return false;
  if (colSpan > 1 || estilo?.wr) return false;
  const ha = estilo?.ha;
  if (ha && ha !== "left" && ha !== "general") return false;
  return !siguienteOcupada;
}

/**
 * La hoja lista para pintarse: solo filas y columnas VISIBLES (las ocultas
 * no se pintan, y una combinada que las cruza se encoge a lo visible), con
 * las combinadas resueltas en `colSpan`/`rowSpan` sobre su primera celda
 * visible y los desplazamientos de los paneles inmovilizados.
 */
export function cuadriculaHoja(hoja: LibroExcelHoja, libro: DimensionesLibro): HojaVista {
  const maxCol = Math.max(hoja.max_col, COLUMNAS_MINIMAS);
  const maxFila = Math.max(hoja.max_fila, FILAS_MINIMAS);
  const dimCol = new Map(hoja.columnas.map((x) => [x.c, x]));
  const dimFila = new Map(hoja.filas.map((x) => [x.r, x]));
  const inmovilizar = hoja.inmovilizar ?? { filas: 0, columnas: 0 };

  const columnas: ColumnaVista[] = [];
  let left = ANCHO_NUMERACION_PX;
  for (let c = 1; c <= maxCol; c++) {
    const d = dimCol.get(c);
    if (d?.oculta) continue;
    const anchoPx = anchoColumnaPx(d?.ancho ?? libro.ancho_columna_default);
    const fija = c <= inmovilizar.columnas;
    columnas.push({ c, letra: letraColumna(c), anchoPx, fija, leftPx: fija ? left : null });
    left += anchoPx;
  }
  const anchoTablaPx = left;

  const filasVisibles: Omit<FilaVista, "celdas">[] = [];
  let top = ALTO_LETRAS_PX;
  for (let r = 1; r <= maxFila; r++) {
    const d = dimFila.get(r);
    if (d?.oculta) continue;
    const altoPx = altoFilaPx(d?.alto ?? libro.alto_fila_default);
    const fija = r <= inmovilizar.filas;
    filasVisibles.push({ r, altoPx, fija, topPx: fija ? top : null });
    top += altoPx;
  }

  const porCoord = new Map<string, LibroExcelCelda>();
  for (const celda of hoja.celdas) porCoord.set(clave(celda.r, celda.c), celda);

  const colVisible = new Set(columnas.map((x) => x.c));
  const filaVisible = new Set(filasVisibles.map((x) => x.r));
  const anclas = new Map<string, { rowSpan: number; colSpan: number; origen: string }>();
  const cubiertas = new Set<string>();
  for (const m of hoja.combinadas) {
    for (const r of rango(m.r1, m.r2)) for (const c of rango(m.c1, m.c2)) cubiertas.add(clave(r, c));
    const filas = rango(m.r1, m.r2).filter((r) => filaVisible.has(r));
    const cols = rango(m.c1, m.c2).filter((c) => colVisible.has(c));
    if (filas.length === 0 || cols.length === 0) continue;
    const ancla = clave(filas[0], cols[0]);
    cubiertas.delete(ancla);
    anclas.set(ancla, { rowSpan: filas.length, colSpan: cols.length, origen: clave(m.r1, m.c1) });
  }

  const filas: FilaVista[] = filasVisibles.map((fila) => {
    const celdas: CeldaVista[] = [];
    for (let i = 0; i < columnas.length; i++) {
      const c = columnas[i].c;
      const k = clave(fila.r, c);
      if (cubiertas.has(k)) continue;
      const ancla = anclas.get(k);
      const celda = porCoord.get(ancla?.origen ?? k) ?? null;
      const estilo = celda?.s != null ? (libro.estilos[celda.s] ?? null) : null;
      const siguiente = columnas[i + 1];
      const kSig = siguiente ? clave(fila.r, siguiente.c) : null;
      const siguienteOcupada =
        kSig !== null &&
        (cubiertas.has(kSig) || anclas.has(kSig) || tieneContenido(porCoord.get(kSig)));
      const colSpan = ancla?.colSpan ?? 1;
      celdas.push({
        r: fila.r,
        c,
        colSpan,
        rowSpan: ancla?.rowSpan ?? 1,
        celda,
        estilo,
        desborda: desbordaTexto(celda, estilo, colSpan, siguienteOcupada),
      });
    }
    return { ...fila, celdas };
  });

  return { columnas, filas, anchoTablaPx, inmovilizar };
}

const ALINEACION_H: Record<string, CSSProperties["textAlign"]> = {
  left: "left",
  center: "center",
  centerContinuous: "center",
  right: "right",
  justify: "justify",
  distributed: "justify",
  fill: "left",
};

const ALINEACION_V: Record<string, CSSProperties["verticalAlign"]> = {
  top: "top",
  center: "middle",
  justify: "middle",
  distributed: "middle",
  bottom: "bottom",
};

/** Alineación «general» de Excel: los números a la derecha, los booleanos al centro, el texto a la izquierda. */
export function alineacionHorizontal(
  celda: LibroExcelCelda | null,
  estilo: LibroExcelEstilo | null,
): NonNullable<CSSProperties["textAlign"]> {
  const ha = estilo?.ha ? ALINEACION_H[estilo.ha] : undefined;
  if (ha) return ha;
  if (celda == null) return "left";
  if (typeof celda.v === "number") return "right";
  if (typeof celda.v === "boolean") return "center";
  return "left";
}

/**
 * El estilo de una celda del libro como CSS en línea. Lo que no cambia de
 * celda en celda (letra Calibri 11, fondo blanco, alineación vertical
 * abajo) vive en `styles/libro-excel.css`.
 */
export function estiloCeldaCss(
  celda: LibroExcelCelda | null,
  estilo: LibroExcelEstilo | null,
  opts: { desborda: boolean },
): CSSProperties {
  const css: CSSProperties = {
    textAlign: alineacionHorizontal(celda, estilo),
    whiteSpace: estilo?.wr ? "pre-wrap" : "pre",
    overflow: opts.desborda ? "visible" : "hidden",
  };
  if (!estilo) return css;
  if (estilo.bg) css.backgroundColor = `#${estilo.bg}`;
  if (estilo.co) css.color = `#${estilo.co}`;
  if (estilo.b) css.fontWeight = 700;
  if (estilo.i) css.fontStyle = "italic";
  if (estilo.u) css.textDecoration = "underline";
  if (estilo.sz) css.fontSize = `${estilo.sz}pt`;
  const va = estilo.va ? ALINEACION_V[estilo.va] : undefined;
  if (va) css.verticalAlign = va;
  if (estilo.ind) css.paddingLeft = `${3 + estilo.ind * 9}px`;
  if (estilo.bd) {
    if (estilo.bd.includes("l")) css.borderLeft = BORDE_CELDA;
    if (estilo.bd.includes("r")) css.borderRight = BORDE_CELDA;
    if (estilo.bd.includes("t")) css.borderTop = BORDE_CELDA;
    if (estilo.bd.includes("b")) css.borderBottom = BORDE_CELDA;
  }
  return css;
}

/** Lo que Excel enseña en la barra de fórmulas: la fórmula si la hay; si no, el valor crudo. */
export function contenidoBarraFormulas(celda: LibroExcelCelda | null | undefined): string {
  if (!celda) return "";
  if (celda.f) return celda.f;
  if (celda.v === null) return "";
  if (typeof celda.v === "boolean") return celda.v ? "VERDADERO" : "FALSO";
  return String(celda.v);
}

/** Tooltip de la celda: la nota (como en Excel) y, debajo, la fórmula. */
export function tituloCelda(celda: LibroExcelCelda | null | undefined): string | undefined {
  if (!celda) return undefined;
  const partes = [celda.n, celda.f].filter((x): x is string => Boolean(x));
  return partes.length ? partes.join("\n") : undefined;
}

export function textoHojas(n: number): string {
  return n === 1 ? "1 hoja" : `${n} hojas`;
}

export type TeclaFlecha = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function esTeclaFlecha(tecla: string): tecla is TeclaFlecha {
  return tecla === "ArrowUp" || tecla === "ArrowDown" || tecla === "ArrowLeft" || tecla === "ArrowRight";
}

/**
 * Mover la selección con las flechas sobre las filas y columnas VISIBLES
 * (una oculta se salta, como en Excel). En los bordes se queda donde está.
 */
export function desplazarSeleccion(
  vista: Pick<HojaVista, "filas" | "columnas">,
  sel: { r: number; c: number },
  tecla: TeclaFlecha,
): { r: number; c: number } {
  const iFila = vista.filas.findIndex((f) => f.r === sel.r);
  const iCol = vista.columnas.findIndex((x) => x.c === sel.c);
  if (iFila < 0 || iCol < 0) {
    return { r: vista.filas[0]?.r ?? sel.r, c: vista.columnas[0]?.c ?? sel.c };
  }
  const dFila = tecla === "ArrowUp" ? -1 : tecla === "ArrowDown" ? 1 : 0;
  const dCol = tecla === "ArrowLeft" ? -1 : tecla === "ArrowRight" ? 1 : 0;
  const fila = vista.filas[Math.min(vista.filas.length - 1, Math.max(0, iFila + dFila))];
  const col = vista.columnas[Math.min(vista.columnas.length - 1, Math.max(0, iCol + dCol))];
  return { r: fila.r, c: col.c };
}
