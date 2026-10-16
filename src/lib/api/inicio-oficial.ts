import { cache } from "react";
import { inicioOficialDeMe, type InicioOficial } from "@/lib/admin/inicio-oficial";
import { getMe } from "./me";

/**
 * Inicio oficial del sistema para un Server Component (16-oct-2026, API
 * 0.0.84). Fuente ÚNICA: `GET /v1/me` → `config.inicio_oficial`, vía
 * `getMe` (ya `react.cache` por petición: cero HTTP extra; el layout lo
 * pide igual). Sin la llave (API previo), inválida o si `/me` falla ⇒
 * `null` ⇒ la página se comporta como hoy. Reglas en
 * `lib/admin/inicio-oficial.ts`.
 */
export const getInicioOficial = cache(async (): Promise<InicioOficial> => {
  try {
    return inicioOficialDeMe(await getMe());
  } catch {
    return null;
  }
});
