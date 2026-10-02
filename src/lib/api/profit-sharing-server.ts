import { apiServer } from "./server";
import { isApiError } from "./errors";
import { esErrorDeNext, type Degradaciones } from "./degradar";
import { listUsers } from "./users-server";
import { getTipoCambioOficial } from "./tipo-cambio-server";
import { todayCancun } from "@/lib/datetime";
import type { ProfitSharingResult } from "@/types/profit-sharing";
import type { EstadoCuentaRespuesta, SociosCuentaRespuesta } from "@/types/reparto-pagos";
import {
  CODIGO_RANGO_INVALIDO,
  clasificarFalloCarga,
  diaAntesDelArranque,
  esMesValido,
  mesDeFecha,
  normalizarEstadoCuenta,
  normalizarPago,
  normalizarRespuestaSocios,
  puedeRegistrarEntregas,
  type CargaCuentas,
  type ContextoRegistro,
} from "@/lib/admin/reparto-pagos";
import { esUuid } from "@/lib/admin/url-params";

export interface ProfitSharingQuery {
  desde?: string;
  hasta?: string;
  aeronave_id?: string;
}

export function getProfitSharing(query: ProfitSharingQuery) {
  return apiServer<ProfitSharingResult>("/v1/profit-sharing", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/** Clasifica un fallo de lectura (nunca lanza, salvo el control de flujo de Next). */
function fallo<T>(err: unknown, que: string): CargaCuentas<T> {
  if (esErrorDeNext(err)) throw err;
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const tipo = clasificarFalloCarga(
    typeof e?.status === "number" ? e.status : null,
    typeof e?.code === "string" ? e.code : null,
    typeof e?.message === "string" ? e.message : null,
  );
  if (tipo === "error") console.error(`[admin] no se pudo cargar ${que}`, err);
  return { estado: tipo };
}

/**
 * CUENTAS DE LOS SOCIOS (`GET /v1/profit-sharing/socios`, API 0.0.50).
 * NUNCA lanza (salvo el control de flujo de Next) y distingue:
 *  - `ok` ⇒ datos (con `disponible:false` se devuelve `no-disponible`);
 *  - `no-disponible` ⇒ API previo (404 «Cannot GET») o el 503
 *    `CUENTA_SOCIO_NO_DISPONIBLE` (falta la migración);
 *  - `sin-permiso` ⇒ 401/403;
 *  - `error` ⇒ red, 500, o el 502/503 de un deploy tras los reintentos del
 *    fetcher. La pantalla dice que NO se pudo cargar — jamás «sin socios».
 */
export async function getSociosCuenta(): Promise<CargaCuentas<SociosCuentaRespuesta>> {
  try {
    const raw = await apiServer<unknown>("/v1/profit-sharing/socios", { cache: "no-store" });
    const datos = normalizarRespuestaSocios(raw);
    if (!datos) {
      console.error("[admin] respuesta inesperada de las cuentas de los socios", raw);
      return { estado: "error" };
    }
    return datos.disponible ? { estado: "ok", datos } : { estado: "no-disponible" };
  } catch (err) {
    return fallo(err, "las cuentas de los socios");
  }
}

/**
 * ESTADO DE CUENTA de un socio
 * (`GET /v1/profit-sharing/socios/:id/estado-cuenta?desde=YYYY-MM&hasta=YYYY-MM`).
 * Sin filtro el API usa su default (del arranque de la cuenta al mes en
 * curso). Mismos estados que `getSociosCuenta` + `no-existe` (socio que no
 * existe) y `sin-permiso` (un SOCIO que pide la cuenta de otro).
 *
 * Un rango que el API rechaza (400 RANGO_INVALIDO: p. ej. un `hasta`
 * anterior al arranque escrito a mano) se vuelve a pedir UNA vez SIN
 * filtro y se marca `filtroIgnorado`: «Reintentar» repetiría el mismo 400
 * para siempre.
 */
export async function getEstadoCuentaSocio(
  socioId: string,
  filtro: { desde?: string; hasta?: string } = {},
): Promise<CargaCuentas<EstadoCuentaRespuesta>> {
  if (!esUuid(socioId)) return { estado: "no-existe" };
  const desde = esMesValido(filtro.desde) ? filtro.desde : undefined;
  const hasta = esMesValido(filtro.hasta) ? filtro.hasta : undefined;
  const carga = await leerEstadoCuenta(socioId, { desde, hasta });
  if ("rangoInvalido" in carga) {
    if (!desde && !hasta) return { estado: "error" };
    const sinFiltro = await leerEstadoCuenta(socioId, {});
    if ("rangoInvalido" in sinFiltro) return { estado: "error" };
    return sinFiltro.estado === "ok" ? { ...sinFiltro, filtroIgnorado: true } : sinFiltro;
  }
  return carga;
}

async function leerEstadoCuenta(
  socioId: string,
  filtro: { desde?: string; hasta?: string },
): Promise<CargaCuentas<EstadoCuentaRespuesta> | { rangoInvalido: true }> {
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/socios/${socioId}/estado-cuenta`, {
      searchParams: { desde: filtro.desde, hasta: filtro.hasta },
      cache: "no-store",
    });
    const datos = normalizarEstadoCuenta(raw);
    if (!datos) {
      // `{ disponible:false }` sin socio = falta la migración.
      if (raw && typeof raw === "object" && (raw as { disponible?: unknown }).disponible === false) {
        return { estado: "no-disponible" };
      }
      console.error("[admin] respuesta inesperada del estado de cuenta del socio", raw);
      return { estado: "error" };
    }
    return datos.disponible === false ? { estado: "no-disponible" } : { estado: "ok", datos };
  } catch (err) {
    if (isApiError(err) && err.status === 400 && err.code === CODIGO_RANGO_INVALIDO) {
      return { rangoInvalido: true };
    }
    return fallo(err, "el estado de cuenta del socio");
  }
}

/**
 * Entregas VIVAS de un socio fechadas ANTES del arranque de su cuenta
 * (`GET /v1/profit-sharing/pagos?socio_id&hasta=<día previo al arranque>`):
 * cuántas son y el mes de la más antigua, para el enlace «Ver entregas
 * anteriores al arranque». Solo se pide cuando el estado de cuenta las
 * esconde en el «Saldo al cierre». Accesorio: NUNCA lanza; null = no se
 * pudo leer (el enlace usa la ventana de 36 meses).
 */
export async function getEntregasAntesDelArranque(
  socioId: string,
  cuentaDesdeMes: string,
): Promise<{ n: number; mesMasAntiguo: string | null } | null> {
  const hasta = diaAntesDelArranque(cuentaDesdeMes);
  if (!esUuid(socioId) || !hasta) return null;
  try {
    const raw = await apiServer<{ disponible?: boolean; pagos?: unknown[] }>("/v1/profit-sharing/pagos", {
      searchParams: { socio_id: socioId, hasta },
      cache: "no-store",
    });
    if (!raw || raw.disponible === false || !Array.isArray(raw.pagos)) return null;
    const meses = raw.pagos
      .map((p) => mesDeFecha(normalizarPago(p)?.fecha_pago))
      .filter((m): m is string => m !== null)
      .sort();
    return { n: raw.pagos.length, mesMasAntiguo: meses[0] ?? null };
  } catch (err) {
    if (esErrorDeNext(err)) throw err;
    console.error("[admin] no se pudieron leer las entregas anteriores al arranque", err);
    return null;
  }
}

/**
 * Lo que necesitan los diálogos de entrega en cualquiera de las tres
 * pantallas: quién registra, la lista de «Entregó» y el T.C. oficial de HOY
 * (prellena una entrega en pesos). Todo ACCESORIO: la lista de usuarios es
 * de ADMIN (`/v1/users`; a FACTURACION se le ofrece «yo» y el API pone el
 * default) y degrada con aviso; el T.C. nunca lanza (null = sin prellenado).
 * Para quien no registra no se pide nada.
 */
export async function getContextoRegistro(
  me: { id: string; nombre: string; rol: string },
  degradado: Degradaciones,
): Promise<ContextoRegistro> {
  const hoy = todayCancun();
  const base: ContextoRegistro = {
    usuarios: [],
    me: { id: me.id, nombre: me.nombre },
    hoy,
    tcOficial: null,
  };
  if (!puedeRegistrarEntregas(me.rol)) return base;
  const [usuariosRes, tcOficial] = await Promise.all([
    me.rol === "ADMIN"
      ? degradado.opcional(
          "la lista de personas que entregan",
          listUsers({ estado: "ACTIVO", limit: 200 }),
          null,
        )
      : Promise.resolve(null),
    getTipoCambioOficial(hoy),
  ]);
  return {
    ...base,
    usuarios: (usuariosRes?.data ?? [])
      .filter((u) => u.estado === "ACTIVO" && !u.es_piloto_externo)
      .map((u) => ({ id: u.id, nombre: u.nombre })),
    tcOficial,
  };
}
