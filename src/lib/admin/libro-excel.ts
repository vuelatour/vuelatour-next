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
import { desplazamientoParaVer } from "./desplazamiento-visible";

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

/**
 * «B7» ⇒ `{ r: 7, c: 2 }`: la inversa de `referenciaCelda`. El clic en una
 * celda se DELEGA en el `<tbody>` y llega con el `data-ref` de su `<td>`
 * (revisión 14-oct-2026). Lo que no es una referencia ⇒ null.
 */
export function coordenadaDeReferencia(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
  if (!m) return null;
  let c = 0;
  for (const letra of m[1]) c = c * 26 + (letra.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
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
  /**
   * Alto máximo (px) del TEXTO de una celda con ajuste (`wr`) en una fila
   * INMOVILIZADA con otra fija debajo, que no puede crecer (revisión
   * 14-oct-2026, `altoRecorteCeldaPx`); null = sin recorte, el texto tal cual.
   */
  altoRecortePx: number | null;
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
 * Grosor de un borde de celda pintado (px): el de `BORDE_CELDA` y el de abajo
 * que `.xl-celda` (styles/libro-excel.css) le pone a TODA celda (transparente
 * o el de la cuadrícula). `.xl-celda` no tiene relleno vertical.
 */
export const GROSOR_BORDE_CELDA_PX = 1;

/**
 * Alto máximo del TEXTO de una celda con ajuste (`wr`) en una fila
 * INMOVILIZADA que tiene OTRA fila inmovilizada debajo de su span (revisión
 * 14-oct-2026): el alto de las filas de su span menos sus bordes de arriba y
 * de abajo; `null` si no aplica (fila que se desplaza, la última fija, sin
 * ajuste o sin texto).
 *
 * Por qué: en una tabla CSS el alto del `<tr>` es un MÍNIMO y una celda con
 * ajuste que el navegador parte en más renglones de los que caben agranda su
 * fila, pero el `top` sticky de las filas fijas de abajo sale de los altos
 * NOMINALES (`topPx`): al desplazar se le pegaban ENCIMA y le tapaban la
 * parte de abajo (en «cobranza», «TOTAL COTIZACIÓN / MXN (c/extras)» de la
 * fila 4 ya pasaba con los anchos del libro, y angostar una columna con la
 * manija lo empeoraba). INVARIANTE: una fila inmovilizada con otra fija
 * debajo NUNCA crece, haga lo que haga el operador; como Excel con una fila
 * de alto fijo, su texto se RECORTA (`estiloRecorteCss`). La ÚLTIMA fija no
 * se recorta: nada fijo se le encima y recortarla quitaría renglones que hoy
 * se leen (los encabezados «HORAS\nVOLADAS» de alto automático, que Excel
 * también agranda); si crece, solo queda corto el `ocupadoArriba` de
 * `scrollParaVerCelda`, como con cualquier fila que crece (pendiente de
 * siempre, «El marco sigue a la selección»).
 */
function altoRecorteCeldaPx(
  filas: ReadonlyArray<Pick<FilaVista, "altoPx" | "fija">>,
  iFila: number,
  rowSpan: number,
  celda: LibroExcelCelda | null,
  estilo: LibroExcelEstilo | null,
): number | null {
  const span = Math.max(1, rowSpan);
  if (!filas[iFila]?.fija || !filas[iFila + span]?.fija || !estilo?.wr || !celda?.t) return null;
  const alto = filas.slice(iFila, iFila + span).reduce((acc, f) => acc + f.altoPx, 0);
  const bordes = GROSOR_BORDE_CELDA_PX * (estilo.bd?.includes("t") ? 2 : 1);
  return Math.max(0, alto - bordes);
}

/**
 * La parte BARATA de la cuadrícula (14-oct-2026): el `leftPx` de las columnas
 * inmovilizadas (acumula los anchos desde la numeración) y el ancho de la
 * tabla. FUENTE ÚNICA para `cuadriculaHoja` (anchos del libro) y
 * `aplicarAnchos` (anchos que ajustó el operador), y la MISMA cuenta que
 * `geometriaCelda`: el marco sigue cuadrando con lo inmovilizado.
 */
function acomodarColumnas(
  columnas: ReadonlyArray<Omit<ColumnaVista, "leftPx">>,
): Pick<HojaVista, "columnas" | "anchoTablaPx"> {
  let left = ANCHO_NUMERACION_PX;
  const acomodadas = columnas.map((col): ColumnaVista => {
    const leftPx = col.fija ? left : null;
    left += col.anchoPx;
    return { c: col.c, letra: col.letra, anchoPx: col.anchoPx, fija: col.fija, leftPx };
  });
  return { columnas: acomodadas, anchoTablaPx: left };
}

/**
 * La hoja lista para pintarse: solo filas y columnas VISIBLES (las ocultas
 * no se pintan, y una combinada que las cruza se encoge a lo visible), con
 * las combinadas resueltas en `colSpan`/`rowSpan` sobre su primera celda
 * visible y los desplazamientos de los paneles inmovilizados. Es la parte
 * CARA (celdas, combinadas, desbordes, recortes): los anchos que ajusta el
 * operador NO pasan por aquí, van por `aplicarAnchos`, que reusa las filas.
 * El recorte de una celda con ajuste en una fila inmovilizada (con otra fija
 * debajo) solo depende de los altos (`altoRecorteCeldaPx`): un ancho nuevo no
 * lo cambia.
 */
export function cuadriculaHoja(hoja: LibroExcelHoja, libro: DimensionesLibro): HojaVista {
  const maxCol = Math.max(hoja.max_col, COLUMNAS_MINIMAS);
  const maxFila = Math.max(hoja.max_fila, FILAS_MINIMAS);
  const dimCol = new Map(hoja.columnas.map((x) => [x.c, x]));
  const dimFila = new Map(hoja.filas.map((x) => [x.r, x]));
  const inmovilizar = hoja.inmovilizar ?? { filas: 0, columnas: 0 };

  const delLibro: Omit<ColumnaVista, "leftPx">[] = [];
  for (let c = 1; c <= maxCol; c++) {
    const d = dimCol.get(c);
    if (d?.oculta) continue;
    delLibro.push({
      c,
      letra: letraColumna(c),
      anchoPx: anchoColumnaPx(d?.ancho ?? libro.ancho_columna_default),
      fija: c <= inmovilizar.columnas,
    });
  }
  const { columnas, anchoTablaPx } = acomodarColumnas(delLibro);

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

  const filas: FilaVista[] = filasVisibles.map((fila, iFila) => {
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
      const rowSpan = ancla?.rowSpan ?? 1;
      celdas.push({
        r: fila.r,
        c,
        colSpan,
        rowSpan,
        celda,
        estilo,
        desborda: desbordaTexto(celda, estilo, colSpan, siguienteOcupada),
        altoRecortePx: altoRecorteCeldaPx(filasVisibles, iFila, rowSpan, celda, estilo),
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

/**
 * El bloque que recorta el texto de una celda con ajuste en una fila
 * inmovilizada con otra fija debajo (`altoRecortePx`, revisión 14-oct-2026;
 * el `overflow: hidden` lo pone `.xl-recorte`). Se ven RENGLONES COMPLETOS:
 * el alto se redondea hacia abajo a renglones enteros con el interlineado
 * REAL de la celda (`1lh`), sin asomar la tajada de arriba del renglón que no
 * cabe; si ni un renglón cabe, el alto disponible. Mientras el texto cabe, el
 * bloque mide lo que su texto y la celda lo acomoda con su alineación
 * vertical de siempre; si no cabe, se ven los PRIMEROS renglones (Excel, con
 * la alineación al centro, enseña los de en medio: aquí manda leer el
 * arranque del encabezado, y la manija o el doble clic dejan leerlo
 * completo).
 */
export function estiloRecorteCss(altoPx: number): CSSProperties {
  const alto = `${Math.max(0, altoPx)}px`;
  return { maxHeight: `max(round(down, ${alto}, 1lh), min(${alto}, 1lh))` };
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

/**
 * Botón «Pantalla completa» de la vista «pantalla» del libro (12-oct-2026,
 * tarde): sus textos viven aquí, en lib PURO, y no en el componente
 * "use client" (un server component que los importara de ahí recibiría una
 * referencia de cliente, no el texto).
 */
export const ETIQUETA_PANTALLA_COMPLETA = "Pantalla completa";
export const ETIQUETA_SALIR_PANTALLA_COMPLETA = "Salir";
/** Nombre accesible con la pantalla completa activa (contiene la etiqueta visible «Salir»). */
export const NOMBRE_SALIR_PANTALLA_COMPLETA = "Salir de pantalla completa";
export const TITULO_PANTALLA_COMPLETA = "Ver el libro a toda la pantalla (Esc para salir)";
export const TITULO_SALIR_PANTALLA_COMPLETA = "Volver al panel";

/**
 * Botón «Actualizar datos» de la vista «pantalla» (14-oct-2026). Pedido del
 * cliente: «un botón para refrescar la información sin que se refresque toda
 * la página… porque me mueve la celda que tengo seleccionada cuando recargo».
 * Vuelve a pedir el libro al servidor (`router.refresh()`) y React conserva
 * la hoja, la celda seleccionada y el desplazamiento del marco.
 */
export const ETIQUETA_ACTUALIZAR_LIBRO = "Actualizar datos";
export const ETIQUETA_ACTUALIZANDO_LIBRO = "Actualizando…";
export const TITULO_ACTUALIZAR_LIBRO =
  "Vuelve a leer los datos del libro sin recargar la página: se quedan la hoja, la celda seleccionada y el desplazamiento";
export const TOAST_LIBRO_ACTUALIZADO = "Datos actualizados";

/**
 * Qué hoja enseñar cuando el libro cambió (p. ej. al actualizar los datos):
 * la que se veía, por NOMBRE (un libro puede ganar o perder una hoja
 * —«otros ingresos aviones» solo sale con filas— y la posición dejaría de
 * ser la misma hoja); si ya no existe, la misma posición; y si tampoco, la
 * primera. Con nombres repetidos gana el que está en la misma posición.
 */
export function resolverHojaIdx(
  hojas: ReadonlyArray<{ nombre: string }>,
  sel: { idx: number; nombre: string | null },
): number {
  if (hojas.length === 0) return 0;
  if (sel.nombre != null) {
    if (hojas[sel.idx]?.nombre === sel.nombre) return sel.idx;
    const porNombre = hojas.findIndex((h) => h.nombre === sel.nombre);
    if (porNombre >= 0) return porNombre;
  }
  return Number.isInteger(sel.idx) && sel.idx >= 0 && sel.idx < hojas.length ? sel.idx : 0;
}

export type TeclaFlecha = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
/** Las teclas que mueven la selección: flechas, PageUp/PageDown y Home/End (con Ctrl/⌘, a las esquinas). */
export type TeclaNavegacionHoja = TeclaFlecha | "PageUp" | "PageDown" | "Home" | "End";

export function esTeclaFlecha(tecla: string): tecla is TeclaFlecha {
  return tecla === "ArrowUp" || tecla === "ArrowDown" || tecla === "ArrowLeft" || tecla === "ArrowRight";
}

export function esTeclaNavegacionHoja(tecla: string): tecla is TeclaNavegacionHoja {
  return (
    esTeclaFlecha(tecla) ||
    tecla === "PageUp" ||
    tecla === "PageDown" ||
    tecla === "Home" ||
    tecla === "End"
  );
}

export interface OpcionesDesplazamiento {
  /** Filas que saltan PageUp/PageDown (`filasPorPagina`); default 1. */
  filasPorPagina?: number;
  /** Ctrl/⌘ pulsado: Home/End van a la primera/última CELDA de la hoja (A1 / la última visible), como en Excel. */
  conControl?: boolean;
}

/**
 * Mover la selección sobre las filas y columnas VISIBLES (una oculta se
 * salta, como en Excel). En los bordes se queda donde está. Flechas: una
 * celda. PageUp/PageDown: `filasPorPagina` filas —las que caben en la zona
 * libre del marco, así el marco avanza una «pantalla» y la selección viaja
 * con él; antes esas teclas eran scroll NATIVO sin mover la selección y la
 * SIGUIENTE flecha devolvía el marco de golpe a la celda activa (revisión
 * 13-oct-2026)—. Home/End: primera/última columna de la fila; con Ctrl/⌘,
 * A1 / la última celda visible.
 */
export function desplazarSeleccion(
  vista: Pick<HojaVista, "filas" | "columnas">,
  sel: { r: number; c: number },
  tecla: TeclaNavegacionHoja,
  opciones: OpcionesDesplazamiento = {},
): { r: number; c: number } {
  const iFila = vista.filas.findIndex((f) => f.r === sel.r);
  const iCol = vista.columnas.findIndex((x) => x.c === sel.c);
  if (iFila < 0 || iCol < 0) {
    return { r: vista.filas[0]?.r ?? sel.r, c: vista.columnas[0]?.c ?? sel.c };
  }
  const ultimaFila = vista.filas.length - 1;
  const ultimaCol = vista.columnas.length - 1;
  const pagina = Math.max(1, Math.floor(opciones.filasPorPagina ?? 1));
  let f = iFila;
  let k = iCol;
  switch (tecla) {
    case "ArrowUp":
      f -= 1;
      break;
    case "ArrowDown":
      f += 1;
      break;
    case "ArrowLeft":
      k -= 1;
      break;
    case "ArrowRight":
      k += 1;
      break;
    case "PageUp":
      f -= pagina;
      break;
    case "PageDown":
      f += pagina;
      break;
    case "Home":
      k = 0;
      if (opciones.conControl) f = 0;
      break;
    case "End":
      k = ultimaCol;
      if (opciones.conControl) f = ultimaFila;
      break;
  }
  f = Math.min(ultimaFila, Math.max(0, f));
  k = Math.min(ultimaCol, Math.max(0, k));
  return { r: vista.filas[f].r, c: vista.columnas[k].c };
}

/**
 * Cuántas filas VISIBLES caben ENTERAS en la zona libre del marco
 * (`clientHeight` menos las letras y las filas inmovilizadas), contando desde
 * la fila `r` hacia abajo (`"abajo"`, PageDown) o hacia arriba (`"arriba"`,
 * PageUp). Mínimo 1 (también sin medidas: SSR con `clientHeight` 0). Es el
 * salto de PageUp/PageDown: la celda nueva queda pegada al borde y el marco
 * avanza justo una pantalla.
 */
export function filasPorPagina(
  vista: Pick<HojaVista, "filas">,
  marco: Pick<MedidasMarco, "clientHeight">,
  r: number,
  direccion: "abajo" | "arriba" = "abajo",
): number {
  const ocupado =
    ALTO_LETRAS_PX + vista.filas.filter((f) => f.fija).reduce((acc, f) => acc + f.altoPx, 0);
  const libre = marco.clientHeight - ocupado;
  const i = vista.filas.findIndex((f) => f.r === r);
  if (i < 0 || libre <= 0) return 1;
  const paso = direccion === "abajo" ? 1 : -1;
  let n = 0;
  let acumulado = 0;
  for (let j = i; j >= 0 && j < vista.filas.length; j += paso) {
    acumulado += vista.filas[j].altoPx;
    if (acumulado > libre) break;
    n++;
  }
  return Math.max(1, n);
}

/* ------------------------------------------------------------------------- */
/* El marco sigue a la selección (13-oct-2026)                                 */
/* ------------------------------------------------------------------------- */

/**
 * Medidas del `div.xl-marco` (el contenedor con scroll). Son las MISMAS
 * propiedades del DOM, así el componente pasa el elemento tal cual y las
 * pruebas pasan un objeto. `clientWidth`/`clientHeight` excluyen las barras
 * de scroll, que es lo correcto: la celda tiene que verse, no quedar bajo la
 * barra.
 */
export interface MedidasMarco {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
}

/** Rectángulo de una celda dentro de la tabla (px), contando la numeración y las letras. */
export interface GeometriaCelda {
  /** Borde izquierdo dentro de la tabla (0 = borde izquierdo de la numeración). */
  x: number;
  /** Borde superior dentro de la tabla (0 = borde superior de las letras). */
  y: number;
  ancho: number;
  alto: number;
  /** La celda vive en una columna inmovilizada: el eje X no se mueve para verla. */
  fijaCol: boolean;
  /** La celda vive en una fila inmovilizada: el eje Y no se mueve para verla. */
  fijaFila: boolean;
}

/**
 * Dónde está la celda `sel` dentro de la tabla, en px, con la MISMA cuenta
 * que ya da `leftPx`/`topPx` a los paneles inmovilizados en `cuadriculaHoja`:
 * `x` acumula `anchoPx` desde `ANCHO_NUMERACION_PX` y `y` acumula `altoPx`
 * desde `ALTO_LETRAS_PX`, solo sobre lo VISIBLE. Si la coordenada es el ancla
 * de una combinada, `ancho`/`alto` suman su `colSpan`/`rowSpan`; una
 * coordenada TAPADA por una combinada (no tiene `<td>`) se trata como 1×1;
 * una fila o columna oculta ⇒ `null`. PURO: nunca consulta el DOM — justo
 * porque la celda tapada no existe ahí.
 */
export function geometriaCelda(
  vista: Pick<HojaVista, "filas" | "columnas">,
  sel: { r: number; c: number },
): GeometriaCelda | null {
  const iCol = vista.columnas.findIndex((x) => x.c === sel.c);
  const iFila = vista.filas.findIndex((f) => f.r === sel.r);
  if (iCol < 0 || iFila < 0) return null;
  const ancla = vista.filas[iFila].celdas.find((x) => x.c === sel.c);
  const colSpan = ancla?.colSpan ?? 1;
  const rowSpan = ancla?.rowSpan ?? 1;
  const suma = (valores: number[]) => valores.reduce((acc, v) => acc + v, 0);
  const anchos = vista.columnas.map((x) => x.anchoPx);
  const altos = vista.filas.map((f) => f.altoPx);
  return {
    x: ANCHO_NUMERACION_PX + suma(anchos.slice(0, iCol)),
    y: ALTO_LETRAS_PX + suma(altos.slice(0, iFila)),
    ancho: suma(anchos.slice(iCol, iCol + colSpan)),
    alto: suma(altos.slice(iFila, iFila + rowSpan)),
    fijaCol: vista.columnas[iCol].fija,
    fijaFila: vista.filas[iFila].fija,
  };
}

/**
 * El scroll JUSTO para que una celda quede a la vista en un eje. `inicio`/`tam`
 * = borde y tamaño de la celda dentro de la tabla; `ocupado` = lo que tapa lo
 * sticky al inicio del eje (numeración + columnas fijas, o letras + filas
 * fijas); `visible` = el tamaño del marco; `actual` = el scroll de hoy.
 *   - sin zona libre (`visible <= ocupado`: SSR con clientWidth 0, o más fijo
 *     que ventana) ⇒ no se mueve;
 *   - tapada por lo fijo o por delante ⇒ pegada a lo fijo;
 *   - cortada al final ⇒ pegada al borde; si no cabe en la zona libre,
 *     alineada al inicio (pegada a lo fijo);
 *   - los bordes exactos (igualdad) cuentan como visible.
 */
function ejeParaVer(
  inicio: number,
  tam: number,
  ocupado: number,
  visible: number,
  actual: number,
): number {
  if (visible <= ocupado) return actual;
  // FUENTE ÚNICA con las filas activas de las tablas (13-oct-2026): la misma
  // cuenta 1-D de `desplazamiento-visible.ts`, con lo sticky como zona fija
  // al inicio del eje; `null` = ya se ve ⇒ se conserva el scroll de hoy.
  return (
    desplazamientoParaVer({
      inicio,
      fin: inicio + tam,
      scroll: actual,
      alto: visible,
      fijoAntes: ocupado,
    }) ?? actual
  );
}

/**
 * El `scrollLeft`/`scrollTop` nuevo del marco para que la celda `sel` se vea
 * ENTERA en la zona visible que no tapa lo sticky (numeración + columnas
 * inmovilizadas a la izquierda; letras + filas inmovilizadas arriba), o
 * `null` si no hay que mover: ya se ve, la celda no existe (oculta) o el
 * marco no tiene zona libre (SSR, `clientWidth` 0). Una celda en columna/fila
 * fija no mueve ese eje (siempre se ve). Nunca devuelve negativos. PURO: la
 * geometría sale de la vista (`geometriaCelda`), nunca del DOM.
 */
export function scrollParaVerCelda(
  vista: Pick<HojaVista, "filas" | "columnas">,
  sel: { r: number; c: number },
  marco: MedidasMarco,
): { scrollLeft: number; scrollTop: number } | null {
  const g = geometriaCelda(vista, sel);
  if (!g) return null;
  const ocupadoIzq =
    ANCHO_NUMERACION_PX +
    vista.columnas.filter((x) => x.fija).reduce((acc, x) => acc + x.anchoPx, 0);
  const ocupadoArriba =
    ALTO_LETRAS_PX + vista.filas.filter((f) => f.fija).reduce((acc, f) => acc + f.altoPx, 0);
  const scrollLeft = g.fijaCol
    ? marco.scrollLeft
    : ejeParaVer(g.x, g.ancho, ocupadoIzq, marco.clientWidth, marco.scrollLeft);
  const scrollTop = g.fijaFila
    ? marco.scrollTop
    : ejeParaVer(g.y, g.alto, ocupadoArriba, marco.clientHeight, marco.scrollTop);
  if (scrollLeft === marco.scrollLeft && scrollTop === marco.scrollTop) return null;
  return { scrollLeft, scrollTop };
}

/* ------------------------------------------------------------------------- */
/* Ajustar el ancho de las columnas como en Excel (14-oct-2026)                */
/* ------------------------------------------------------------------------- */

/*
 * Pedido del cliente, con la captura del Balance general («otros
 * movimientos»: la columna F cortaba «TUAs + extras con IVA · 2 concept…»):
 * «que si das doble clic entre las columnas se pueda abrir a lo ancho del
 * contenido para alcanzar a leer todo como lo hacemos con el excel». Cada
 * letra de columna lleva en su borde derecho una manija: doble clic ⇒ el
 * ancho se ajusta al contenido; arrastrar ⇒ el ancho sigue al puntero. Aquí
 * vive lo PURO (la regla de medidas a px, la vista con los anchos nuevos, la
 * llave del estado y los textos); el componente solo mide el DOM y guarda el
 * estado. Ningún número del libro cambia: solo el ancho con que se pinta.
 */

/** Anchos que el operador ajustó, por número de columna (px). Sin la llave, el ancho del libro. */
export type AnchosColumnas = Readonly<Partial<Record<number, number>>>;

/** Holgura del autoajuste: que la última letra no quede cortada por el redondeo de la fuente. */
export const HOLGURA_AUTOAJUSTE_PX = 5;
/** Tope de una columna ajustada: un texto larguísimo no se lleva la hoja entera. */
export const ANCHO_MAXIMO_COLUMNA_PX = 1000;
/** Mínimo: la columna nunca desaparece y su manija sigue a la vista (que lo inmovilizado no la saque del marco lo cuida `topeAnchoColumnaPx`). */
export const ANCHO_MINIMO_COLUMNA_PX = 12;
/** Lo que la zona que se desplaza conserva SIEMPRE a la vista junto a lo inmovilizado: una columna de Excel por omisión (8.43 caracteres = 64 px). */
export const ANCHO_LIBRE_MINIMO_PX = 64;
/** Al arrastrar, el puntero cuenta hasta este tanto antes del borde derecho visible del marco: el ancho de la manija (`.xl-manija`), así la manija entera sigue a la vista. */
export const MARGEN_ARRASTRE_MARCO_PX = 8;

/** Un ancho (finito) en px enteros, entre el mínimo y el tope. */
export function limitarAnchoColumnaPx(px: number): number {
  return Math.min(ANCHO_MAXIMO_COLUMNA_PX, Math.max(ANCHO_MINIMO_COLUMNA_PX, Math.round(px)));
}

/**
 * La vista con los anchos que ajustó el operador SIN recalcular celdas:
 * devuelve columnas y ancho de tabla nuevos —el `leftPx` de lo inmovilizado
 * es la suma de los anchos NUEVOS, por `acomodarColumnas`, la misma cuenta
 * de `cuadriculaHoja` y `geometriaCelda`— y REUSA `filas` tal cual: arrastrar
 * una manija no reconstruye miles de celdas por cada movimiento. Recibe la
 * vista de `cuadriculaHoja` (los anchos del libro); la llave de una columna
 * que no está en la vista (oculta) o un valor no finito se ignoran. Sin
 * anchos, o si ninguno cambia algo, devuelve la MISMA vista.
 */
export function aplicarAnchos(vista: HojaVista, anchos: AnchosColumnas | null | undefined): HojaVista {
  if (!anchos) return vista;
  let cambia = false;
  const columnas = vista.columnas.map((col) => {
    const manual = anchos[col.c];
    if (manual === undefined || !Number.isFinite(manual)) return col;
    const anchoPx = limitarAnchoColumnaPx(manual);
    if (anchoPx === col.anchoPx) return col;
    cambia = true;
    return { ...col, anchoPx };
  });
  return cambia ? { ...vista, ...acomodarColumnas(columnas) } : vista;
}

/**
 * ¿Las mismas columnas inmovilizadas con el mismo `left`? (revisión
 * 14-oct-2026). Las filas del cuerpo son `memo` y es lo único de las columnas
 * que su marcado lee: arrastrar la manija de una columna que se desplaza (o
 * de la ÚLTIMA fija) no lo cambia y ninguna celda se vuelve a pintar;
 * arrastrar una fija con otras a su derecha sí, y entonces solo se repinta el
 * tramo de las celdas fijas de cada fila (cambia su `left`).
 */
export function mismasColumnasFijas(
  a: ReadonlyArray<Pick<ColumnaVista, "c" | "leftPx">>,
  b: ReadonlyArray<Pick<ColumnaVista, "c" | "leftPx">>,
): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x.c === b[i].c && x.leftPx === b[i].leftPx));
}

/**
 * El ancho máximo de la columna `c` en un marco de `clientWidth` px
 * (revisión 14-oct-2026). Una columna INMOVILIZADA no puede llenar el marco:
 * lo fijo (numeración + todas las inmovilizadas) deja libres al menos
 * `ANCHO_LIBRE_MINIMO_PX`. Sin este tope, ensanchar una fija (soltando fuera
 * del marco con el puntero capturado, o con el doble clic) la dejaba con su
 * manija fuera de alcance, tapando toda la zona que se desplaza, y el marco
 * ya no seguía a la selección: solo se salía con F5. Una columna que se
 * desplaza conserva el tope de siempre (su manija vuelve a la vista al
 * desplazar el marco) y un marco sin medidas (SSR, `clientWidth` 0) no limita
 * nada. Nunca baja del mínimo.
 */
export function topeAnchoColumnaPx(
  vista: Pick<HojaVista, "columnas">,
  c: number,
  clientWidth: number,
): number {
  const col = vista.columnas.find((x) => x.c === c);
  if (!col?.fija || !(clientWidth > 0)) return ANCHO_MAXIMO_COLUMNA_PX;
  const otrasFijas = vista.columnas
    .filter((x) => x.fija && x.c !== c)
    .reduce((acc, x) => acc + x.anchoPx, 0);
  const libre = clientWidth - ANCHO_NUMERACION_PX - otrasFijas - ANCHO_LIBRE_MINIMO_PX;
  return Math.min(ANCHO_MAXIMO_COLUMNA_PX, Math.max(ANCHO_MINIMO_COLUMNA_PX, Math.floor(libre)));
}

/** Hasta dónde cuenta un arrastre (`limitesArrastre`): la x del puntero y el ancho. */
export interface LimitesArrastre {
  xMaximo: number;
  topePx: number;
}

/**
 * Los límites de un arrastre, medidos UNA vez al empezar (revisión
 * 14-oct-2026): la x del puntero cuenta hasta el borde derecho VISIBLE del
 * marco menos `MARGEN_ARRASTRE_MARCO_PX` (con el puntero capturado se puede
 * soltar fuera del marco y la columna ya no crece por allá) y el ancho, hasta
 * `topeAnchoColumnaPx`. `izquierdaPx` es el `getBoundingClientRect().left`
 * del marco; `clientLeft`/`clientWidth`, las del DOM (sin la barra de
 * desplazamiento). Sin medidas (SSR) no limita.
 */
export function limitesArrastre(
  vista: Pick<HojaVista, "columnas">,
  c: number,
  marco: { izquierdaPx: number; clientLeft: number; clientWidth: number },
): LimitesArrastre {
  if (!(marco.clientWidth > 0)) {
    return { xMaximo: Number.POSITIVE_INFINITY, topePx: ANCHO_MAXIMO_COLUMNA_PX };
  }
  return {
    xMaximo: marco.izquierdaPx + marco.clientLeft + marco.clientWidth - MARGEN_ARRASTRE_MARCO_PX,
    topePx: topeAnchoColumnaPx(vista, c, marco.clientWidth),
  };
}

/** Los anchos de una hoja con el de la columna `c` puesto, o quitado con `null` (vuelve al ancho del libro). Nunca muta. */
export function conAnchoColumna(
  anchos: AnchosColumnas | undefined,
  c: number,
  px: number | null,
): AnchosColumnas {
  const nuevos: Partial<Record<number, number>> = { ...anchos };
  if (px === null || !Number.isFinite(px)) delete nuevos[c];
  else nuevos[c] = limitarAnchoColumnaPx(px);
  return nuevos;
}

/**
 * Llave del estado de anchos: el TIPO de libro (`claveAnchos` de la página;
 * `""` sin la prop) + el nombre de la hoja. El balance mensual, el general y
 * el de un avión tienen hojas con el mismo nombre («balance») y columnas
 * distintas: un ancho del «balance» del general no se aplica al «balance» de
 * un avión.
 */
export function claveAnchosHoja(claveLibro: string, hoja: string): string {
  return JSON.stringify([claveLibro, hoja]);
}

/** Una celda que cuenta para el autoajuste de su columna y dónde está su `<td>`. */
export interface CeldaAutoajuste {
  /** Posición de la fila en `vista.filas` = su `<tr>` dentro del `<tbody>`. */
  iFila: number;
  /** Posición en `fila.celdas` = su `<td>` (antes va el `<th>` de la numeración). */
  iCelda: number;
  /** «F7»: el `data-ref` del `<td>`; el componente lo coteja antes de medir. */
  ref: string;
  /** El texto que SE VE (`celda.t`) partido en sus renglones. */
  renglones: string[];
}

/** Los renglones de un texto: sus saltos de línea explícitos (\n, \r\n o \r). */
export function renglonesTexto(t: string): string[] {
  return t.split(/\r\n|\r|\n/);
}

/**
 * Qué celdas cuentan para ajustar la columna `c` al contenido, con la regla
 * de Excel: las que tienen texto visible (`celda.t`), en filas visibles (las
 * ocultas no están en la vista) y que NO son combinadas que abarcan varias
 * columnas (Excel las ignora al autoajustar). Una coordenada tapada por una
 * combinada no tiene `<td>`: tampoco cuenta.
 */
export function celdasParaAutoajuste(vista: Pick<HojaVista, "filas">, c: number): CeldaAutoajuste[] {
  const out: CeldaAutoajuste[] = [];
  vista.filas.forEach((fila, iFila) => {
    const iCelda = fila.celdas.findIndex((x) => x.c === c);
    if (iCelda < 0) return;
    const cv = fila.celdas[iCelda];
    const t = cv.celda?.t ?? "";
    if (cv.colSpan > 1 || t === "") return;
    out.push({ iFila, iCelda, ref: referenciaCelda(cv.r, cv.c), renglones: renglonesTexto(t) });
  });
  return out;
}

/** Lo que se mide de una celda para el autoajuste (el componente lo lee del DOM). */
export interface MedidaCeldaAutoajuste {
  /** Ancho de cada renglón del texto con la fuente REAL de la celda (canvas `measureText`), px. */
  renglonesPx: readonly number[];
  /** Relleno + borde horizontales REALES del `<td>` (`cajaHorizontalPx`). La sangría
   *  de Excel ya va aquí: `estiloCeldaCss` la pinta como `padding-left`. */
  cajaPx: number;
}

/**
 * La regla del autoajuste (doble clic en la manija), de medidas a px: el
 * renglón más largo de cada celda más su relleno y borde; el máximo de la
 * columna, más la holgura, hacia arriba y entre el mínimo y el tope
 * (`topePx`: el de `topeAnchoColumnaPx`, así una inmovilizada nunca llena el
 * marco; sin él, `ANCHO_MAXIMO_COLUMNA_PX`). Sin ninguna celda con texto
 * medible ⇒ `null`: la columna vuelve al ancho original del libro. Las
 * medidas no finitas se ignoran.
 */
export function anchoAutoajustePx(
  medidas: readonly MedidaCeldaAutoajuste[],
  topePx: number = ANCHO_MAXIMO_COLUMNA_PX,
): number | null {
  let necesario = 0;
  for (const m of medidas) {
    const texto = m.renglonesPx.reduce((max, px) => (Number.isFinite(px) && px > max ? px : max), 0);
    if (texto <= 0) continue;
    const caja = Number.isFinite(m.cajaPx) && m.cajaPx > 0 ? m.cajaPx : 0;
    necesario = Math.max(necesario, texto + caja);
  }
  if (necesario <= 0) return null;
  const tope = Number.isFinite(topePx) ? topePx : ANCHO_MAXIMO_COLUMNA_PX;
  return limitarAnchoColumnaPx(Math.min(Math.ceil(necesario + HOLGURA_AUTOAJUSTE_PX), tope));
}

/**
 * El ancho mientras se arrastra la manija: el de antes más lo que se movió el
 * puntero, entero y entre el mínimo y el tope. Con `limites`
 * (`limitesArrastre`) la x no pasa de `xMaximo` ni el ancho de `topePx`, y
 * ninguno de los dos ANGOSTA la columna por sí solo: si al empezar ya estaba
 * más allá (la manija se agarró pegada al borde, o lo fijo ya llenaba el
 * marco), solo se puede angostar.
 */
export function anchoArrastrePx(
  anchoInicialPx: number,
  xInicial: number,
  x: number,
  limites?: Partial<LimitesArrastre>,
): number {
  const xMaximo = Math.max(limites?.xMaximo ?? Number.POSITIVE_INFINITY, xInicial);
  const tope = Math.max(limites?.topePx ?? ANCHO_MAXIMO_COLUMNA_PX, anchoInicialPx);
  return limitarAnchoColumnaPx(Math.min(anchoInicialPx + (Math.min(x, xMaximo) - xInicial), tope));
}

/**
 * La fuente de una celda para el canvas, de su estilo CALCULADO: el
 * componente pasa `getComputedStyle(td)` tal cual (como `MedidasMarco`), así
 * cuentan la negrita, la cursiva y el tamaño propios de la celda.
 */
export function fuenteCanvas(estilo: {
  fontStyle: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
}): string {
  return [
    estilo.fontStyle || "normal",
    estilo.fontWeight || "400",
    estilo.fontSize || "11pt",
    estilo.fontFamily || "Calibri, sans-serif",
  ].join(" ");
}

/** Relleno + borde horizontales de una celda (px), de su estilo CALCULADO. */
export function cajaHorizontalPx(estilo: {
  paddingLeft: string;
  paddingRight: string;
  borderLeftWidth: string;
  borderRightWidth: string;
}): number {
  return [estilo.paddingLeft, estilo.paddingRight, estilo.borderLeftWidth, estilo.borderRightWidth].reduce(
    (acc, v) => acc + (Number.parseFloat(v) || 0),
    0,
  );
}

/**
 * Textos de la manija (en lib PURO, no en el componente "use client"). Sin
 * tab stop: son decenas de columnas; el nombre accesible dice qué hace.
 */
export function nombreManijaColumna(letra: string): string {
  return `Ajustar el ancho de la columna ${letra}`;
}
export const TITULO_MANIJA_COLUMNA = "Doble clic: ajustar al contenido · Arrastra para cambiar el ancho";
