import { getConfiguracion } from "./configuracion-server";
import { PAYWISE_COMISION_PCT_DEFAULT } from "@/lib/admin/metodos-pago";

/**
 * Comisión (%) de Paywise vigente en `configuracion_sistema`
 * (`paywise_comision_pct`): la que el API aplica por default a un cobro
 * PAYWISE sin comisión capturada y la que el formulario de cobro SUGIERE.
 * Best-effort: NUNCA lanza — sin dato (rol sin acceso, API previo, valor
 * absurdo) cae al mismo default del API (8.857).
 */
export async function getPaywiseComisionPct(): Promise<number> {
  try {
    const flags = await getConfiguracion();
    const flag = flags.find((f) => f.clave === "paywise_comision_pct");
    const v = Number(flag?.valor_numerico);
    return Number.isFinite(v) && v > 0 && v < 100 ? v : PAYWISE_COMISION_PCT_DEFAULT;
  } catch {
    return PAYWISE_COMISION_PCT_DEFAULT;
  }
}
