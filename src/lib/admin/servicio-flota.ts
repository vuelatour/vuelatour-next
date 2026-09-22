/**
 * El pizarrón «Tacómetros» de la oficina, dentro del panel (22-sep-2026).
 *
 * Pedido del cliente con dos fotos: en `/admin/aircraft` tachó **Pax**,
 * **USD/hr público** y **USD/hr broker** («sustituir estas columnas por las
 * columnas de tacómetro último servicio, tacómetro siguiente servicio, tiempo
 * restante para servicio y siguiente tipo de servicio (50, 100 hrs, etc.)
 * para tratar de igualar la tabla que usamos hoy en día»). La tabla que usan
 * a diario es una hoja con: matrícula · Sig. Servicio · Últ. Tact. Serv. ·
 * Tact. Actual · Tiempo restante — y ahí «−30» va en rojo.
 *
 * Este archivo es la FUENTE ÚNICA de esos textos y tonos (PURO, sin React,
 * prueba en `__tests__/servicio-flota.test.ts`). Reglas de fiabilidad:
 *
 *  - Ningún número se recalcula aquí: el hito, el intervalo y las horas que
 *    faltan los manda el API en `aircraft.servicio` (que a su vez sale de
 *    `proximoServicioDetallado` / `ordenAbiertaDelHito`). El panel solo
 *    redacta. Un cálculo paralelo en la lista sería justo la forma de que la
 *    lista y el expediente del avión digan dos cosas distintas.
 *  - El MARGEN de ámbar sale de `umbralServicio`/`dentroDelUmbral`
 *    (`proximo-servicio.ts`): `aviso_automatico.umbral_hr` y, sin él,
 *    `UMBRAL_ORDEN_HR`. Aquí no hay ningún `< 10` suelto.
 *  - `faltan_hr` NEGATIVO no se recorta a 0: el pizarrón escribe «−30» y el
 *    operador necesita ver el vencido, no un cero tranquilizador.
 *  - `servicio: null` (el API miró y no hay programa) se explica en el
 *    `title`; `servicio` AUSENTE (API sin desplegar) se calla — mismo patrón
 *    que `estadoOrdenServicio` con `orden: undefined`.
 */

import { fmtDateOnly } from "@/lib/datetime";
import {
  dentroDelUmbral,
  estadoOrdenServicio,
  faltanHoras,
  TEXTO_EN_TALLER,
  type EstadoServicioUi,
  type ProximoServicioUi,
} from "./proximo-servicio";
import type { ServicioFlota } from "@/types/aircraft";

/** Lo que se pinta cuando no hay dato (mismo guion largo del resto del panel). */
export const GUION = "—";

/** `title` de las celdas vacías de un avión SIN programa de servicio. */
export const SIN_PROGRAMA = "Sin programa de servicio";

/** `title` cuando SÍ hay programa pero nunca se registró un servicio. */
export const SIN_SERVICIOS = "Sin servicios registrados";

/** Sublínea del último servicio cuando nunca se ha registrado uno. */
export const TEXTO_BASE_PROGRAMA = "base del programa";

/** Tono del «Tiempo restante»: verde/normal, ámbar de aviso, rojo vencido. */
export type TonoRestante = "ok" | "ambar" | "rojo";

/**
 * Clases por tono. `ok` va SIN color a propósito: en el pizarrón solo el
 * vencido está en rojo, y pintar de verde las ocho filas normales haría que
 * el ámbar y el rojo —lo único que pide acción— dejaran de saltar a la vista.
 */
export const CLASE_TONO_RESTANTE: Record<TonoRestante, string> = {
  ok: "",
  ambar: "text-amber-600 dark:text-amber-400",
  rojo: "text-destructive font-semibold",
};

/** Texto de una celda con sublínea tenue (taco arriba, contexto abajo). */
export interface TextoServicio {
  /** Lectura del tacómetro ya formateada, o `—`. */
  taco: string;
  /** Sublínea: etapa + fecha, «base del programa»… `null` = no se pinta. */
  detalle: string | null;
}

/** Numérico de PostgREST (número o cadena) → número; `null` si no es válido. */
function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Décima de hora: lo que se PINTA y lo que decide vencido/no vencido. */
function decima(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Lectura de tacómetro: «4455.1 h». Un decimal y SIN separador de miles —
 * igual que la columna «Último taco» que ya existe y que el pizarrón
 * («5509.9»); mezclar `4,455.1` y `4458.0` en columnas vecinas se lee mal.
 */
export function horasTaco(v: number | string | null | undefined): string {
  const n = numero(v);
  return n === null ? GUION : `${n.toFixed(1)} h`;
}

/**
 * Puente al helper del próximo servicio (`proximo-servicio.ts`): el margen,
 * el ámbar y los textos de la orden se resuelven con ESE archivo, que es el
 * que ya usan el expediente del avión y la card de tacómetros.
 */
function proximoUi(
  servicio: ServicioFlota | null | undefined,
): ProximoServicioUi | null {
  const sig = servicio?.siguiente;
  if (!sig) return null;
  return {
    faltan_hr: sig.faltan_hr,
    orden: sig.orden,
    aviso_automatico: servicio?.aviso_automatico,
  };
}

/**
 * «Tacómetro último servicio»: el taco con el que se HIZO, y debajo con qué
 * servicio y cuándo («Servicio 50 hrs · 12 sep 2026»). Sin ningún servicio
 * registrado el API manda el arranque del programa (`origen: 'BASE'`) y la
 * sublínea lo dice: ese número no es un servicio que alguien haya hecho.
 */
export function textoUltimoServicio(
  servicio: ServicioFlota | null | undefined,
): TextoServicio {
  const u = servicio?.ultimo;
  if (!u) return { taco: GUION, detalle: null };

  const taco = horasTaco(u.hobbs_hr);
  if (taco === GUION) return { taco: GUION, detalle: null };
  if (u.origen === "BASE") return { taco, detalle: TEXTO_BASE_PROGRAMA };

  const partes = [
    u.etiqueta?.trim() || null,
    u.fecha ? fmtDateOnly(u.fecha) : null,
  ].filter((p): p is string => !!p);
  return { taco, detalle: partes.length > 0 ? partes.join(" · ") : null };
}

/** «Tacómetro siguiente servicio»: a qué lectura toca el próximo hito. */
export function textoSiguienteServicio(
  servicio: ServicioFlota | null | undefined,
): string {
  return horasTaco(servicio?.siguiente?.hobbs_hr);
}

/**
 * «Tiempo restante para servicio». Vencido = «vencido por 30.0 h» (el «−30»
 * rojo del pizarrón, dicho con palabras para quien no lee la hoja a diario).
 */
export function textoRestante(
  servicio: ServicioFlota | null | undefined,
): string {
  const crudo = faltanHoras(proximoUi(servicio));
  if (crudo === null) return GUION;
  const n = decima(crudo);
  return n < 0
    ? `vencido por ${Math.abs(n).toFixed(1)} h`
    : `faltan ${n.toFixed(1)} h`;
}

/**
 * Tono del restante. `null` = no hay número (no se colorea nada).
 * Vencido gana sobre ámbar: un hito pasado no es «ya casi».
 */
export function tonoRestante(
  servicio: ServicioFlota | null | undefined,
): TonoRestante | null {
  const prox = proximoUi(servicio);
  const crudo = faltanHoras(prox);
  if (crudo === null) return null;
  // Se decide con la décima que se PINTA: así nunca sale «vencido por 0.0 h».
  if (decima(crudo) < 0) return "rojo";
  return dentroDelUmbral(prox) ? "ambar" : "ok";
}

/**
 * «Siguiente tipo de servicio»: la etiqueta CORTA del pizarrón — `50 hrs`,
 * `100 hrs`, `200 hrs` —, derivada del intervalo. El nombre completo de la
 * etapa («Servicio 100 hrs / Anual») va en el `title`: en la columna no cabe
 * y el operador reconoce el servicio por el número.
 */
export function etiquetaTipoServicio(
  servicio: ServicioFlota | null | undefined,
): string {
  const n = numero(servicio?.siguiente?.intervalo_hr);
  if (n === null || n <= 0) return GUION;
  return `${Number.isInteger(n) ? n : decima(n)} hrs`;
}

/** Nombre completo de la etapa del próximo hito (para el `title`). */
export function nombreEtapaSiguiente(
  servicio: ServicioFlota | null | undefined,
): string | undefined {
  return servicio?.siguiente?.etiqueta?.trim() || undefined;
}

/**
 * `title` de una celda vacía: con `servicio: null` el API SÍ miró y el avión
 * no tiene programa (se explica); con el campo AUSENTE el API todavía no lo
 * manda y no se afirma nada. Si hay programa vigente (`siguiente`) el hueco
 * solo puede ser el último servicio: se dice eso y no «sin programa», que
 * sería falso y mandaría al operador a configurar algo que ya existe.
 */
export function tituloSinServicio(
  servicio: ServicioFlota | null | undefined,
): string | undefined {
  if (servicio === undefined) return undefined;
  if (servicio === null) return SIN_PROGRAMA;
  return servicio.siguiente ? SIN_SERVICIOS : SIN_PROGRAMA;
}

/**
 * Estado de la ORDEN del próximo hito para la sublínea del restante
 * («Orden programada · falta confirmar fecha», «En taller»). En la LISTA solo
 * se habla de órdenes que YA existen: la promesa «se genera sola en unos
 * minutos» es una línea del expediente, no de una tabla de ocho renglones.
 * El texto lo redacta `estadoOrdenServicio` — aquí no se reescribe.
 *
 * RESPALDO `enTaller` (revisión adversaria 22-sep-2026, caso REAL del N58BT):
 * el avión puede estar EN EL TALLER por una orden que NO cubre el hito que
 * pinta esta fila — el N58BT tiene su orden de 100 h abierta a las 1,600 h
 * con el tacómetro ya en 1,627.2, así que el hito que el programa calcula es
 * el SIGUIENTE (1,700) y la celda dice «faltan 72.8 h» con `orden: null`. Ese
 * número es correcto y a la vez tranquilizador de más: el avión está parado.
 * `en_taller` viaja en la MISMA fila del listado (`GET /v1/aircraft`), así que
 * decirlo no inventa ningún dato ni calcula nada — solo deja de callarlo.
 */
export function estadoOrdenDeServicio(
  servicio: ServicioFlota | null | undefined,
  opciones: { enTaller?: boolean } = {},
): EstadoServicioUi | null {
  const prox = proximoUi(servicio);
  if (prox?.orden) return estadoOrdenServicio(prox);
  if (!opciones.enTaller) return null;
  return {
    texto: TEXTO_EN_TALLER,
    tono: "info",
    detalle:
      "El avión está en el taller por otra orden de servicio (no la de este hito). El detalle está en su expediente.",
    accion: null,
  };
}
