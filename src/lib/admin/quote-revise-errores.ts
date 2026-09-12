import { squawkAltaDe, type ResultadoFallido } from "./squawk-alta";

/**
 * QUÉ HACER CON UN `revise` RECHAZADO (11-sep-2026, invariante 14 del API).
 *
 * Desde la 0.0.6 `POST /v1/quotes/:id/revise` valida el avión COMO `assign`
 * cuando el cotizador lo CAMBIA, así que al guardar una versión pueden
 * llegar cuatro rechazos distintos y cada uno se atiende diferente:
 *
 * - `cobrada`  → banner rojo con liga a los cobros (candado D3, sin reintento).
 * - `taller`   → SOLO COMPATIBILIDAD con un API anterior al 11-sep-2026.
 *                El taller dejó de ser candado (pedido del cliente: «la
 *                advertencia está bien, no debe limitarte»): el API vigente
 *                guarda y devuelve el aviso en `avisos[]`. Si aun así llega
 *                el 409 viejo, el panel lo pinta ÁMBAR diciendo que hay que
 *                actualizar el API — nunca «no se puede».
 * - `squawk`   → diálogo de confirmación (el MISMO de assign) y, si la
 *                oficina acepta, reintento con `aceptar_discrepancia_alta`
 *                CONSERVANDO el `client_request_id` del intento. Este SÍ
 *                sigue siendo candado (no cambió).
 * - `version`  → 409 optimista: «alguien guardó la vN mientras editabas».
 * - `otro`     → toast con el mensaje del API.
 *
 * PURO (sin React ni server actions) para poder probar el parseo del 409.
 * El orden importa: taller y squawk TAMBIÉN son 409, así que se clasifican
 * antes que el conflicto de versión genérico.
 */

/**
 * Código del 409 «la aeronave está en taller». LEGADO: el API vigente ya no
 * lo emite (ver `lib/admin/aviso-taller.ts`); se conserva para no romper
 * contra un backend sin desplegar.
 */
export const AERONAVE_EN_TALLER_CODE = "AERONAVE_EN_TALLER";
/** Código del 409 «el vuelo ya tiene cobros» (candado D3 del cotizador). */
export const COTIZACION_COBRADA_CODE = "COTIZACION_COBRADA";

export type DecisionErrorRevise =
  | { tipo: "cobrada"; mensaje: string }
  | { tipo: "taller"; mensaje: string; matricula: string | null }
  | { tipo: "squawk"; discrepancias: string[] }
  | { tipo: "version"; mensaje: string }
  | { tipo: "otro"; mensaje: string };

const MSG_COBRADA =
  "El vuelo ya tiene cobros registrados: la cotización no puede cambiar.";
/**
 * COMPATIBILIDAD: el mensaje del API viejo dice «No se puede asignar…», que
 * ya no es la regla — por eso NO se reusa: el panel explica que el problema
 * es la versión del backend, no el avión.
 */
const MSG_TALLER = "El API rechazó el avión en taller; actualiza el API.";
const MSG_VERSION = "La cotización cambió mientras editabas";
const MSG_OTRO = "Error al guardar la versión";

/** Matrícula del avión rechazado, si el API la mandó en `details`. */
export function matriculaDeDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const m = (details as { matricula?: unknown }).matricula;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

export function decidirErrorRevise(
  res: ResultadoFallido,
  opts: {
    /**
     * El intento YA viajó con `aceptar_discrepancia_alta`: si el API vuelve a
     * rechazar por squawk no se reabre el diálogo (evita el bucle de
     * confirmar → reintentar → confirmar).
     */
    yaAceptoSquawk?: boolean;
  } = {},
): DecisionErrorRevise {
  const mensaje = res.error?.trim() ?? "";
  // D3: cobrada bloquea en cualquier estado.
  if (res.code === COTIZACION_COBRADA_CODE) {
    return { tipo: "cobrada", mensaje: mensaje || MSG_COBRADA };
  }
  // Taller: SOLO puede llegar de un API anterior al 11-sep-2026. El mensaje
  // que mande ese API se descarta a propósito (dice «no se puede», que ya no
  // es la regla): se responde con el diagnóstico del panel.
  if (
    res.code === AERONAVE_EN_TALLER_CODE ||
    /aeronave está en taller/i.test(mensaje)
  ) {
    return {
      tipo: "taller",
      mensaje: MSG_TALLER,
      matricula: matriculaDeDetails(res.details),
    };
  }
  // Squawk ALTA: se confirma y se reintenta con la bandera.
  const discrepancias = opts.yaAceptoSquawk ? null : squawkAltaDe(res);
  if (discrepancias && discrepancias.length > 0) {
    return { tipo: "squawk", discrepancias };
  }
  // Cualquier otro 409 = candado optimista de versión.
  if (res.status === 409) {
    return { tipo: "version", mensaje: mensaje || MSG_VERSION };
  }
  return { tipo: "otro", mensaje: mensaje || MSG_OTRO };
}
