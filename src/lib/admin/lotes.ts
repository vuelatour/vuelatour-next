/**
 * Lotes de ids para los batch del API — 21-sep-2026 (patrón anti-cap).
 *
 * El bug: `/admin/flights` mandaba HOY **218** ids a
 * `POST /v1/flights/taco-status`, cuyo DTO valida `@ArrayMaxSize(200)`
 * (`vuelatour-api/src/modules/flights/dto/flights.dto.ts`, `TacoStatusDto` y
 * `CobroStatusDto`). El API respondía **400** y la página lo TRAGABA con
 * `.catch(() => ({}))`: NINGÚN vuelo mostraba el badge de tacómetro faltante
 * y nadie se enteraba. `cobro-status` tiene el mismo tope (iba en 65 ids, o
 * sea a un mes de romperse igual).
 *
 * Regla: partir en lotes de ≤ TOPE, unir resultados y, si un lote falla,
 * DECIRLO (nunca fingir que se verificaron todos).
 */

/**
 * Tope de ids por llamada. Espejo EXACTO del `@ArrayMaxSize(200)` del API:
 * si allá sube, aquí también (y no al revés: mandar de más es un 400 mudo).
 */
export const TOPE_IDS_BATCH = 200;

/** Parte `ids` en lotes de a lo más `tope` (sin perder ni duplicar ninguno). */
export function lotesDeIds<T>(ids: T[], tope: number = TOPE_IDS_BATCH): T[][] {
  if (tope < 1) throw new Error("tope debe ser ≥ 1");
  const lotes: T[][] = [];
  for (let i = 0; i < ids.length; i += tope) lotes.push(ids.slice(i, i + tope));
  return lotes;
}

/**
 * Aviso cuando algún lote no se pudo consultar. `null` si no faltó ninguno.
 * `cosa` se lee dentro de «No se pudo verificar …»: «el tacómetro»,
 * «los cobros».
 */
export function textoSinVerificar(cuantos: number, cosa: string): string | null {
  if (cuantos <= 0) return null;
  const vuelos = cuantos === 1 ? "1 vuelo" : `${cuantos} vuelos`;
  return `No se pudo verificar ${cosa} de ${vuelos}; recarga para reintentar.`;
}
