/**
 * Libro de Excel como JSON para la VISTA EN PANTALLA de los balances
 * (12-oct-2026). COPIA 1:1 de `pyservices/libro-vista.types.ts` del API,
 * que a su vez transporta tal cual el contrato `libro_json` (versión 1) de
 * pyservices. El panel solo PINTA lo que llega: ninguna celda se recalcula y
 * ningún texto se formatea aquí (`t` ya viene como lo mostraría Excel).
 */

/** Estilo de celda (una entrada por combinación distinta; las celdas lo citan por índice). */
export interface LibroExcelEstilo {
  /** Relleno sólido «RRGGBB». */
  bg?: string;
  /** Color de la letra «RRGGBB» (ausente = negro). */
  co?: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Tamaño de letra en puntos (ausente = 11). */
  sz?: number;
  /** Alineación horizontal de Excel: left | center | right | justify | … (ausente = general). */
  ha?: string;
  /** Alineación vertical: top | center | justify | distributed (ausente = bottom). */
  va?: string;
  /** Ajustar texto. */
  wr?: boolean;
  /** Sangría (niveles de Excel). */
  ind?: number;
  /** Bordes con línea: letras de «lrtb». */
  bd?: string;
  /** Formato de número de Excel (p. ej. `#,##0.00`). */
  nf?: string;
}

export interface LibroExcelCelda {
  r: number;
  c: number;
  /** Valor crudo: número, texto, booleano, fecha ISO o null. */
  v: number | string | boolean | null;
  /** Texto tal como lo mostraría Excel con su formato de número. */
  t: string;
  /** Fórmula visible («=…»), solo en celdas con fórmula viva. */
  f?: string;
  /** Índice en `estilos`. */
  s?: number;
  /** Nota (comentario) de la celda. */
  n?: string;
  /** Fase 2 (edición): registro del API al que pertenece la celda. */
  vinculo?: Record<string, unknown>;
}

export interface LibroExcelHoja {
  nombre: string;
  /** Color de la pestaña «RRGGBB» o null. */
  pestana: string | null;
  /** Si Excel pintaría las líneas de la cuadrícula. */
  cuadricula: boolean;
  /** Paneles inmovilizados: filas y columnas fijas (null = ninguno). */
  inmovilizar: { filas: number; columnas: number } | null;
  max_fila: number;
  max_col: number;
  /** Solo columnas con ancho propio u ocultas (ancho en caracteres de Excel). */
  columnas: { c: number; ancho?: number; oculta?: boolean }[];
  /** Solo filas con alto propio u ocultas (alto en puntos). */
  filas: { r: number; alto?: number; oculta?: boolean }[];
  combinadas: { r1: number; c1: number; r2: number; c2: number }[];
  celdas: LibroExcelCelda[];
}

export interface LibroExcel {
  version: number;
  titulo: string;
  /** Nombre con el que se descargaría el .xlsx (null si no aplica). */
  archivo: string | null;
  generado: string | null;
  ancho_columna_default: number;
  alto_fila_default: number;
  estilos: LibroExcelEstilo[];
  hojas: LibroExcelHoja[];
}

/** `GET /v1/aircraft/balance-general/libro?desde&hasta&modo`. */
export interface BalanceGeneralLibroResponse {
  libro: LibroExcel;
  desde: string;
  hasta: string;
  modo: "mensual" | "general";
  /** Nombre con el que bajaría el .xlsx de ese mismo libro. */
  archivo: string;
}

/** `GET /v1/aircraft/:id/balance/libro?desde&hasta`. */
export interface BalanceAvionLibroResponse {
  libro: LibroExcel;
  matricula: string;
  desde: string;
  hasta: string;
  archivo: string;
}
