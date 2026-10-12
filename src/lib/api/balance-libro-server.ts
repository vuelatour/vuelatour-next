import { apiServer } from "./server";
import type { ModoBalanceVuelaTour } from "@/lib/admin/reportes-balance";
import type {
  BalanceAvionLibroResponse,
  BalanceGeneralLibroResponse,
} from "@/types/libro-excel";

/**
 * Los balances como LIBRO JSON para verlos en pantalla (12-oct-2026, API
 * 0.0.68). Son los MISMOS libros que `balance-general.xlsx` y
 * `:id/balance.xlsx` (mismo payload en el API, mismo libro openpyxl en
 * pyservices): mismos números, fórmulas, estilos y notas. Mismos parámetros
 * y mismos roles (ADMIN, ANALISTA) que la descarga.
 */
export const RUTA_LIBRO_BALANCE_VUELATOUR = "/v1/aircraft/balance-general/libro";

export function rutaLibroBalanceAvion(aircraftId: string): string {
  return `/v1/aircraft/${aircraftId}/balance/libro`;
}

/** «Balance mensual» (`mensual`) o «Balance general» (`general`) de la flota. */
export function getBalanceGeneralLibro(
  desde: string,
  hasta: string,
  modo: ModoBalanceVuelaTour,
) {
  return apiServer<BalanceGeneralLibroResponse>(RUTA_LIBRO_BALANCE_VUELATOUR, {
    searchParams: { desde, hasta, modo },
    cache: "no-store",
  });
}

/** El libro individual de un avión en el periodo. */
export function getBalanceAvionLibro(aircraftId: string, desde: string, hasta: string) {
  return apiServer<BalanceAvionLibroResponse>(rutaLibroBalanceAvion(aircraftId), {
    searchParams: { desde, hasta },
    cache: "no-store",
  });
}
