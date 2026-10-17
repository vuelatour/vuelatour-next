import type { CierrePeriodoAditivo } from "./cierres";

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
  /** Fase 2 (edición): registro del API al que pertenece la celda. Hoy el
   *  único tipo que el panel EDITA es `afac_real` (16-oct-2026, API 0.0.89):
   *  ver `VinculoAfacReal`; se lee SIEMPRE con
   *  `lib/admin/libro-afac.ts#leerVinculoAfacReal` (otra forma ⇒ solo lectura). */
  vinculo?: Record<string, unknown>;
  /** Gastos que componen la celda (13-oct-2026, API 0.0.75, punto 5): solo
   *  en los libros de la vista en pantalla que los marcan (`vinculos_gasto`).
   *  Se leen SIEMPRE con `lib/admin/libro-vinculos.ts`. */
  vinculos?: LibroExcelVinculo[];
  /** SOLO DEL PANEL (16-oct-2026, AFAC por vuelo): lo pone
   *  `lib/admin/libro-afac.ts#prepararHojaAfac` sobre las celdas con `vinculo`
   *  `afac_real` (si se puede capturar ahí, por qué no, o «guardando»).
   *  pyservices y el API JAMÁS lo mandan. */
  edicion?: EdicionCeldaLibro;
  /** SOLO DEL PANEL (16-oct-2026, AFAC por vuelo): la celda se RECALCULÓ en
   *  pantalla con su propia fórmula porque cambió una celda de la que depende
   *  (el costo real tecleado): `lib/admin/libro-recalculo.ts`. `negativo`
   *  decide el rojo de los negativos (el formato condicional del libro llega
   *  ya resuelto en el estilo). El libro nuevo del servidor la reemplaza.
   *  pyservices y el API JAMÁS lo mandan. */
  recalculada?: { negativo: boolean };
}

/** Estado de edición de una celda del libro en pantalla (solo del panel). */
export interface EdicionCeldaLibro {
  estado: "editable" | "bloqueada" | "guardando";
  /** Lo que dice el tooltip: cómo capturarla o por qué no se puede. */
  titulo: string;
}

/**
 * Celda EDITABLE «costo real AFAC» de la hoja «otros movimientos» del Balance
 * general (16-oct-2026, API 0.0.89, invariante 90 del API). pyservices la
 * anota con `libro_json.vincular(cell, {...})` en la celda EGRESO (columna D)
 * de cada fila `AFAC_VUELO`; la del reservado (INGRESO) no lleva vínculo.
 * Viaja en `LibroExcelCelda.vinculo` (que sigue siendo `Record<string,
 * unknown>`: cualquier otra forma ⇒ celda de solo lectura). `valor: null` =
 * sin capturar (la celda viaja aunque esté vacía). `editable` lo decide el API
 * (migración aplicada, fila «dueña» del vuelo, mes contable abierto) y
 * `motivo` dice por qué no; el ROL lo decide el panel (`ROLES_AFAC_REAL`) y
 * el PUT lo vuelve a validar.
 */
export interface VinculoAfacReal {
  tipo: "afac_real";
  campo: "costo_real_mxn";
  vuelo_id: string;
  /** «#236 · Ambulancia Internacional» (la clave de la fila). */
  clave: string | null;
  matricula: string | null;
  /** Costo real capturado en pesos; null = sin capturar. */
  valor: number | null;
  /** La provisión del vuelo (lo RESERVADO, columna INGRESO). */
  reservado_mxn: number | null;
  editable: boolean;
  motivo: string | null;
  /** Mes contable «AAAA-MM» del vuelo. */
  mes: string | null;
  capturado_por: string | null;
  capturado_at: string | null;
}

/**
 * Vínculo celda → GASTO (13-oct-2026, API 0.0.75, punto 5: abrir el balance
 * en la celda del gasto desde Conciliación). COPIA 1:1 de `LibroVistaVinculo`
 * del API y del contrato de `libro_json.py` de pyservices. Es METADATO de
 * presentación: el panel jamás lo suma ni recalcula una celda con él.
 *  - `fila`: la celda ES el monto de la fila de ese gasto (MONTO MXN de las
 *    hojas de gastos y de combustible, VENTA AL AVIÓN de inventario).
 *  - `suma`: la celda lo suma junto con otros (OPERACIONES, PILOTO y OTROS de
 *    la hoja de vuelos; TOTAL PARA PROVEEDOR (PESOS) en la variante general).
 *  - `nota`: el gasto solo va en la nota de la celda (TUA o extensión de
 *    horario trasladadas al cliente): no suma.
 *  - `sin_tc`: gasto en USD sin tipo de cambio: todavía no suma en pesos.
 */
export interface LibroExcelVinculo {
  tipo: "gasto";
  id: string;
  rol: "fila" | "suma" | "nota" | "sin_tc";
  /** Lo que ESE gasto aporta a la celda, en pesos; null si no suma. */
  monto_mxn?: number | null;
  /** El gasto completo, solo cuando la celda lleva una PARTE de él (o la
   *  nota trae su monto). */
  gasto_mxn?: number | null;
  /** Parcial de un reparto manual: la parte de un avión o el remanente. */
  parte?: "reparto" | "remanente";
  /** Clave del vuelo de la fila (hoja de vuelos). */
  fila?: string;
  /** Encabezado de la columna, sin saltos de línea. */
  columna?: string;
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
  /** true = este libro marca las celdas de los gastos (`vinculos`, punto 5
   *  del 13-oct-2026). Ausente = pyservices o API previo: un `?gasto=` no se
   *  puede ubicar y la franja lo dice. */
  vinculos_gasto?: boolean;
  /** ADITIVO (cierre de mes, 16-oct-2026, API 0.0.88): el bloque `cierre`
   *  del payload del balance, copiado por pyservices a la raíz. El panel
   *  solo pinta el estado del mes junto al título; las celdas ya traen las
   *  marcas. Ausente con pyservices/API previos. */
  cierre?: CierrePeriodoAditivo | null;
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
