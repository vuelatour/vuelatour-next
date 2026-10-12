/**
 * Selector de periodo (Desde / Hasta) de Reportes, Reparto y Tableros —
 * reglas PURAS del borrador (12-oct-2026). Pedido del cliente: «en los
 * filtros de fecha de Reportes como que se traba el calendario de filtro de
 * fecha». Causa: cada tecla del `<input type="date">` navegaba al instante
 * (una fecha a medio teclear, «0002-10-01», ya viajaba a la URL) y, al
 * responder el servidor, el input se re-montaba con la fecha validada y
 * pisaba lo que el operador seguía escribiendo.
 *
 * Regla nueva: el input guarda un BORRADOR mientras se edita; solo se
 * navega con una fecha COMPLETA y válida, tras una pausa corta
 * (`ESPERA_APLICAR_MS`) o al salir del campo / Enter. Un rango invertido
 * se corrige arrastrando la otra fecha (como siempre). Aquí no hay React:
 * el componente solo llama a estas funciones.
 */
import { esDiaValido } from "./url-params";

export interface Periodo {
  desde: string;
  hasta: string;
}

/** Pausa tras la última tecla antes de aplicar una fecha completa. */
export const ESPERA_APLICAR_MS = 450;

/** Año mínimo que se considera «completo»: evita aplicar «0002-10-01» a medio teclear. */
export const ANIO_MINIMO = 2000;

/** ¿La fecha del input está completa y es un día real (año de 4 cifras ≥ 2000)? */
export function fechaCompleta(valor: string | null | undefined): boolean {
  if (!esDiaValido(valor)) return false;
  return Number((valor as string).slice(0, 4)) >= ANIO_MINIMO;
}

/**
 * El periodo que resulta de cambiar UN extremo: si el nuevo «desde» queda
 * después de «hasta», «hasta» lo sigue (y al revés), como hacía el selector.
 * Una fecha incompleta no cambia nada (`null`).
 */
export function periodoAlCambiar(
  actual: Periodo,
  campo: keyof Periodo,
  valor: string,
): Periodo | null {
  if (!fechaCompleta(valor)) return null;
  if (campo === "desde") {
    return valor > actual.hasta ? { desde: valor, hasta: valor } : { desde: valor, hasta: actual.hasta };
  }
  return valor < actual.desde ? { desde: valor, hasta: valor } : { desde: actual.desde, hasta: valor };
}

/** ¿Hay algo que navegar? (el periodo difiere del que ya está en la URL). */
export function periodoCambia(actual: Periodo, nuevo: Periodo): boolean {
  return actual.desde !== nuevo.desde || actual.hasta !== nuevo.hasta;
}

/** Parámetros `desde`/`hasta` del periodo (los demás de la URL se conservan). */
export function queryDePeriodo(nuevo: Periodo): Record<string, string> {
  return { desde: nuevo.desde, hasta: nuevo.hasta };
}
