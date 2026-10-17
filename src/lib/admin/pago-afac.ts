/**
 * «Es pago de AFAC» en Gastos (16-oct-2026, API 0.0.89, invariante 90 del
 * API) — regla PURA del panel.
 *
 * Decisión del cliente (16-oct): VuelaTour paga el AFAC por vuelo; el avión
 * sigue pagando lo RESERVADO (su columna PERMISO AFAC (PROVISIÓN)) y el costo
 * real de cada vuelo se captura en el Balance general (otros movimientos). Los
 * pagos al gestor de AFAC se siguen capturando en Gastos y conciliando con el
 * banco, pero se MARCAN «Pago de AFAC»: dejan de restarle al avión (hoja
 * «permisos», cascada, reparto y socios) y aparecen en el Balance general
 * como comprobante de esos costos (aviso si no cuadran). Revalidaciones,
 * certificados y demás permisos del avión NO se marcan.
 *
 * Solo categoría PERMISO (el API la valida y un trigger la quita si la
 * categoría cambia). El panel ofrece la casilla SOLO con `config.afac_real`
 * de `/v1/me` (la base ya tiene la migración) y a ADMIN / FACTURACION /
 * COORDINADOR (`ROLES_AFAC_REAL`); en «Verificar / editar», además, solo si
 * el gasto trae la llave `es_pago_afac` (API con la columna). La llave viaja
 * SOLO si la casilla se ve (y en el PATCH, solo si cambió): un API viejo
 * rechaza toda llave desconocida (`forbidNonWhitelisted`).
 */
import type { Gasto } from "@/types/expenses";

/** La única categoría que puede ser pago de AFAC (espejo del API). */
export const CATEGORIA_PAGO_AFAC = "PERMISO";

export const ETIQUETA_PAGO_AFAC = "Es pago de AFAC (lo paga VuelaTour; no le resta al avión)";
export const AYUDA_PAGO_AFAC =
  "Márcalo en los pagos al gestor de AFAC. El costo de cada vuelo se captura en el Balance general (otros movimientos).";
export const CHIP_PAGO_AFAC = "AFAC";
export const TITULO_CHIP_PAGO_AFAC = "Pago de AFAC: lo paga VuelaTour; no resta al avión";
/** Etiqueta del campo en el historial del gasto (bitácora). */
export const ETIQUETA_HISTORIAL_PAGO_AFAC = "Pago de AFAC";
export const NOTA_PAGO_AFAC_SE_QUITA =
  "Al guardar se quitará la marca «Pago de AFAC»: solo un gasto de Permiso puede serlo (volverá a restarle a su avión).";

/** «¿Este gasto es pago de AFAC de VuelaTour?» (espejo de `esPagoAfac` del API). */
export function esPagoAfac(g: Pick<Gasto, "categoria" | "es_pago_afac"> | null | undefined): boolean {
  return g?.es_pago_afac === true && g.categoria === CATEGORIA_PAGO_AFAC;
}

/** ¿El API mandó la llave? (= tiene la columna; sin ella no se pinta ni se manda). */
export function apiConPagoAfac(g: object | null | undefined): boolean {
  return !!g && typeof (g as { es_pago_afac?: unknown }).es_pago_afac === "boolean";
}

/** ¿Se enseña la casilla? Permiso + quien la puede marcar (rol y migración). */
export function casillaPagoAfacVisible(p: { categoria: string | null | undefined; puedeMarcar: boolean }): boolean {
  return p.puedeMarcar && p.categoria === CATEGORIA_PAGO_AFAC;
}

/** Alta: la llave viaja SOLO marcada y visible (el default del API es false). */
export function pagoAfacParaAlta(p: { visible: boolean; marcado: boolean }): true | undefined {
  return p.visible && p.marcado ? true : undefined;
}

/** PATCH: la llave viaja SOLO si la casilla se ve y cambió respecto a la
 *  base del diálogo (el API la ignora si es igual, pero un eco no debe
 *  tocar el candado del mes ni la bitácora). */
export function pagoAfacParaPatch(p: { visible: boolean; marcado: boolean; actual: boolean }): boolean | undefined {
  if (!p.visible) return undefined;
  return p.marcado === p.actual ? undefined : p.marcado;
}

/** ¿Avisar que al guardar se quita la marca? (estaba marcado y la categoría
 *  nueva no es Permiso: el trigger del API la quita). */
export function pagoAfacSeQuita(p: { actual: boolean; categoria: string | null | undefined }): boolean {
  return p.actual && p.categoria !== CATEGORIA_PAGO_AFAC;
}
