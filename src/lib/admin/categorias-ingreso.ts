/**
 * FUENTE ÚNICA de las CATEGORÍAS DE INGRESO del panel (24-sep-2026).
 *
 * Es COPIA byte por byte de `vuelatour-api/src/common/categoria-ingreso.util.ts`
 * con los MISMOS nombres de export (paridad manual, igual que las categorías de
 * gasto): el spec del API y `__tests__/categorias-ingreso.test.ts` congelan la
 * MISMA tabla literal (contrato INGRESOS §2). Si cambia un texto allá, cambia
 * aquí en el mismo lote — si no, el selector diría una cosa y los reportes otra.
 *
 * Códigos en BD = texto + CHECK (NO enum). Los traspasos entre cuentas y los
 * reversos NO son ingresos: son clasificaciones de conciliación.
 *
 * El destino evita a propósito «Otros ingresos VuelaTour»: ese nombre YA es el
 * bloque de TUAs/extras de los vuelos en el reparto y los dashboards
 * (`otros_ingresos_vuelatour`) y el operador creería que suma ahí.
 */

export const CATEGORIAS_INGRESO = [
  "OTRO_INGRESO",
  "ANTICIPO_CLIENTE",
  "INGRESO_BANCARIO",
  "REEMBOLSO_DEVOLUCION",
  "VENTA_ACTIVO",
  "APORTACION_PRESTAMO",
] as const;

export type CategoriaIngreso = (typeof CATEGORIAS_INGRESO)[number];

export const DESTINO_INGRESO_RESULTADO =
  "Otros ingresos (Balance general VuelaTour y Libro Dinero)";

export const CATEGORIA_INGRESO_LABEL: Record<CategoriaIngreso, string> = {
  OTRO_INGRESO: "Otros ingresos",
  ANTICIPO_CLIENTE: "Anticipos y depósitos de clientes",
  INGRESO_BANCARIO: "Ingresos en cuentas de banco",
  REEMBOLSO_DEVOLUCION: "Reembolsos y devoluciones recibidos",
  VENTA_ACTIVO: "Venta de refacciones o activos a terceros",
  APORTACION_PRESTAMO: "Aportaciones de socios y préstamos",
};

export const CATEGORIA_INGRESO_DESTINO: Record<CategoriaIngreso, string> = {
  OTRO_INGRESO: DESTINO_INGRESO_RESULTADO,
  ANTICIPO_CLIENTE:
    "Fuera de resultados hasta aplicarse a un vuelo (ahí cuenta como cobro del vuelo)",
  INGRESO_BANCARIO: DESTINO_INGRESO_RESULTADO,
  REEMBOLSO_DEVOLUCION: DESTINO_INGRESO_RESULTADO,
  VENTA_ACTIVO: DESTINO_INGRESO_RESULTADO,
  APORTACION_PRESTAMO: "Fuera de resultados (no es venta: es capital o deuda)",
};

export const CATEGORIA_INGRESO_AYUDA: Record<CategoriaIngreso, string> = {
  OTRO_INGRESO:
    "Dinero que entra y no es de un vuelo ni de otra categoría. Si es el pago de un vuelo, regístralo como cobro en el vuelo.",
  ANTICIPO_CLIENTE:
    "El cliente pagó y su vuelo todavía no existe. Si el vuelo ya existe, registra el cobro en el vuelo.",
  INGRESO_BANCARIO: "Intereses, rendimientos y bonificaciones del banco.",
  REEMBOLSO_DEVOLUCION:
    "Dinero que nos regresan: aseguradoras, gastos médicos, devoluciones de proveedores. (Si tú le devuelves dinero a un cliente, eso es un reembolso en el vuelo, no un ingreso.)",
  VENTA_ACTIVO:
    "Venta de piezas, equipo o activos a alguien de fuera. Si la pieza sale de bodega, registra también la salida en Inventario.",
  APORTACION_PRESTAMO: "Dinero que ponen los socios o un préstamo recibido.",
};

function esCategoria(c: string | null | undefined): c is CategoriaIngreso {
  return typeof c === "string" && (CATEGORIAS_INGRESO as readonly string[]).includes(c);
}

/**
 * Categorías de RESULTADO: DERIVADA del destino (patrón
 * CATEGORIAS_GASTO_EMPRESA). El test congela la membresía:
 * {OTRO_INGRESO, INGRESO_BANCARIO, REEMBOLSO_DEVOLUCION, VENTA_ACTIVO}.
 */
export const CATEGORIAS_INGRESO_RESULTADO: ReadonlySet<string> = new Set(
  CATEGORIAS_INGRESO.filter((c) => CATEGORIA_INGRESO_DESTINO[c] === DESTINO_INGRESO_RESULTADO),
);

/** ¿Suma a resultados (Libro Dinero «Otros ingresos» y Balance general)? */
export function categoriaIngresoSumaAResultados(c: string | null | undefined): boolean {
  return typeof c === "string" && CATEGORIAS_INGRESO_RESULTADO.has(c);
}

/** Un anticipo siempre es de un cliente (espejo de `ingreso_anticipo_chk`). */
export function categoriaIngresoExigeCliente(c: string | null | undefined): boolean {
  return c === "ANTICIPO_CLIENTE";
}

/**
 * Categorías que admiten `vuelo_id` (espejo del CHECK `ingreso_vuelo_chk`):
 * solo REEMBOLSO_DEVOLUCION. El pago de un vuelo es un COBRO del vuelo; como
 * «otro ingreso» contaría dos veces.
 */
export function categoriaIngresoAdmiteVuelo(c: string | null | undefined): boolean {
  return c === "REEMBOLSO_DEVOLUCION";
}

export function esAnticipo(c: string | null | undefined): boolean {
  return c === "ANTICIPO_CLIENTE";
}

/**
 * Etiqueta legible; fallback capitalizado para un código que el panel aún no
 * conozca («PREMIO_X» → «Premio x»); cadena vacía si no hay código.
 */
export function etiquetaCategoriaIngreso(c: string | null | undefined): string {
  if (!c) return "";
  if (esCategoria(c)) return CATEGORIA_INGRESO_LABEL[c];
  const limpio = c.replaceAll("_", " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Clave visible del ingreso: «ING-12» («ING-?» sin folio). */
export function etiquetaIngreso(folio: number | null | undefined): string {
  return typeof folio === "number" && Number.isFinite(folio) ? `ING-${folio}` : "ING-?";
}
