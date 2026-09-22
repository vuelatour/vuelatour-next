/**
 * Próximo servicio por horas: QUÉ LE DECIMOS AL OPERADOR cuando el avión ya
 * entró al umbral (pedido del cliente, 19-sep-2026).
 *
 * El caso: el XA-VGV cruzó las 10 h de margen a las 08:40 (la oficina capturó
 * los tacómetros del vuelo #295 y el Hobbs quedó en 2,240.2 contra el hito de
 * 2,250). La tarjeta «Próximo servicio» calcula EN VIVO, así que de inmediato
 * dijo «faltan 9.8 h» — pero la orden de servicio no existía, porque la
 * revisión que la crea corría UNA vez al día (08:00) y ese día ya había
 * pasado. Porfirio (ADMIN) lo reportó así: «no se generó, mejor dicho solo
 * marca una leyenda. Entonces es enunciativa y posterior la agrego».
 *
 * Con la corrección del API la orden se crea al capturar/confirmar cualquier
 * tacómetro (y una red de seguridad cada 10 min), y `proximo_servicio` gana el
 * campo ADITIVO `orden`: el mantenimiento ABIERTO que cubre ese hito. Este
 * helper traduce ese campo a UNA línea en es-MX para alguien que no es
 * técnico, y es la FUENTE ÚNICA de esos textos (tarjeta de KPIs del
 * expediente y card de tacómetros; cualquier lista que muestre el próximo
 * servicio usa este mismo helper).
 *
 * Reglas de fiabilidad:
 *  - `orden` AUSENTE (`undefined`) = API sin desplegar ⇒ devuelve `null` y la
 *    UI se comporta EXACTAMENTE como antes. Nunca se promete «se genera sola»
 *    contra un backend que todavía no tiene el hook: esa promesa sería justo
 *    la mentira que reportó el cliente.
 *  - `orden: null` = el API SÍ miró y no hay orden abierta para ese hito.
 *  - El número de horas NO se recalcula aquí: `faltan_hr` viene del API.
 *  - La PROMESA «se genera sola» solo se pinta si el API confirma que el
 *    programa automático está encendido (`aviso_automatico.activo`), y el
 *    margen sale de ahí, no de una constante: con la regla apagada o con otro
 *    umbral la línea volvería a ser «una leyenda» (revisión 20-sep-2026).
 */

import { fmtDateOnly } from "@/lib/datetime";
import type { OrdenServicioProgramada } from "@/types/aircraft";

/**
 * RESPALDO del margen (en horas de vuelo) con el que el sistema crea sola la
 * orden. El valor VIGENTE lo manda el API en
 * `proximo_servicio.aviso_automatico.umbral_hr` (= `alerta_config
 * .servicio_horas.horas_anticipacion`) y lo resuelve `umbralServicio`: esta
 * constante solo se usa cuando el API no lo dice (sin desplegar o sin poder
 * leer la configuración). El panel NO lo adivina desde otro lado.
 */
export const UMBRAL_ORDEN_HR = 10;

/** Ancla de la card «Mantenimientos» dentro del expediente del avión. */
export const ANCLA_MANTENIMIENTOS = "#mantenimientos";

/**
 * «El avión está en el taller». UNA sola cadena: la usa la orden EN_TALLER de
 * este helper y también el respaldo de la lista de flota, que lo dice cuando
 * el avión está en taller por una orden que NO cubre el hito que se muestra
 * (`servicio-flota.ts`). Dos literales serían dos redacciones del mismo hecho.
 */
export const TEXTO_EN_TALLER = "En taller";

/** Tono de la línea: ámbar = falta una acción humana. */
export type TonoServicio = "ambar" | "info" | "neutro";

export interface EstadoServicioUi {
  /** Línea ya redactada para el operador (es-MX). */
  texto: string;
  tono: TonoServicio;
  /** Detalle largo para el `title` (quién creó la orden, qué sigue). */
  detalle?: string;
  /** Enlace a donde se resuelve; `null` = la línea solo informa. */
  accion: { texto: string; href: string } | null;
}

/**
 * Lo que necesita el helper del `proximo_servicio` del API. Se aceptan los
 * DOS nombres del campo de horas a propósito: `/metrics` lo manda como
 * `faltan_hr` y `/tacometros` como `faltan`, y mapearlo a mano en cada
 * componente es justo donde se cuela un número equivocado.
 */
export interface ProximoServicioUi {
  faltan_hr?: number | string | null;
  faltan?: number | string | null;
  orden?: OrdenServicioProgramada | null;
  /**
   * Estado REAL del programa automático (`alerta_config.servicio_horas`),
   * ADITIVO. `null` = el API no lo pudo leer (no se afirma nada); ausente =
   * API sin desplegar ⇒ se asume lo de siempre (encendido, margen de 10 h).
   */
  aviso_automatico?: AvisoAutomaticoServicio | null;
}

/** ¿Está encendida la creación automática de la orden y con qué margen? */
export interface AvisoAutomaticoServicio {
  activo: boolean;
  umbral_hr: number;
}

export interface OpcionesEstadoServicio {
  /** Margen del API (default `UMBRAL_ORDEN_HR`). */
  umbralHr?: number;
  /** Prefijo del enlace: vacío = ancla en la MISMA página (el expediente). */
  hrefBase?: string;
  /** Formateador de fecha (default `fmtDateOnly`, el del resto del panel). */
  formatearFecha?: (fecha: string) => string;
}

/** Horas que faltan, tomando el nombre que haya mandado el API. `null` si no es un número. */
export function faltanHoras(
  prox: ProximoServicioUi | null | undefined,
): number | null {
  if (!prox) return null;
  const crudo = prox.faltan_hr ?? prox.faltan;
  if (crudo === null || crudo === undefined || crudo === "") return null;
  const n = typeof crudo === "string" ? Number(crudo) : crudo;
  return Number.isFinite(n) ? n : null;
}

/**
 * Margen VIGENTE, en horas: el que manda el API (`aviso_automatico.umbral_hr`)
 * y, sin él, la constante espejo. Un override explícito gana siempre.
 *
 * El panel NO adivina este número desde otro lado: si alguien baja el margen
 * a 5 h en Configuración, la tarjeta se movía 5 h tarde y seguía prometiendo
 * una orden que todavía no tocaba crear.
 */
export function umbralServicio(
  prox: ProximoServicioUi | null | undefined,
  umbralHr?: number,
): number {
  if (umbralHr != null && Number.isFinite(umbralHr)) return umbralHr;
  const delApi = prox?.aviso_automatico?.umbral_hr;
  return delApi != null && Number.isFinite(delApi) && delApi > 0
    ? delApi
    : UMBRAL_ORDEN_HR;
}

/**
 * ¿El avión ya está dentro del margen en el que el sistema crea la orden?
 * Fuente única del ámbar de la tarjeta (antes era un `< 10` suelto, que a
 * las 10.0 h exactas pintaba normal aunque el API ya hubiera disparado).
 */
export function dentroDelUmbral(
  prox: ProximoServicioUi | null | undefined,
  umbralHr?: number,
): boolean {
  const faltan = faltanHoras(prox);
  return faltan != null && faltan <= umbralServicio(prox, umbralHr);
}

/** ¿La orden existe pero nadie le ha puesto fecha? Es lo único que pide acción. */
export function faltaConfirmarFecha(
  orden: OrdenServicioProgramada | null | undefined,
): boolean {
  return !!orden && orden.estado === "PROGRAMADO" && !fechaDeOrden(orden);
}

function fechaDeOrden(orden: OrdenServicioProgramada): string | null {
  const f = orden.fecha_programada;
  return f && f.trim() !== "" ? f : null;
}

/** «La creó el sistema…» / «La creó la oficina…» — responde la duda de Porfirio. */
function origenDeOrden(orden: OrdenServicioProgramada): string {
  return orden.automatica
    ? "La creó el sistema al entrar el avión al margen de aviso."
    : "La capturó alguien de la oficina.";
}

/**
 * Línea de estado de la orden de servicio del próximo hito.
 *
 * - Orden PROGRAMADA sin fecha → «Orden programada · falta confirmar fecha»
 *   (ámbar + enlace a Mantenimientos, que es donde se confirma).
 * - Orden PROGRAMADA con fecha → «Orden programada para 25 sep 2026».
 * - Orden EN TALLER → «En taller».
 * - Sin orden y dentro del umbral → «La orden se genera sola en unos minutos»
 *   (ya no «solo una leyenda»).
 * - Sin orden y todavía lejos → `null` (no se pinta nada).
 * - Sin el campo `orden` (API sin desplegar) → `null`.
 */
export function estadoOrdenServicio(
  prox: ProximoServicioUi | null | undefined,
  opciones: OpcionesEstadoServicio = {},
): EstadoServicioUi | null {
  if (!prox) return null;
  // `undefined` = el API no manda el aditivo todavía: no se afirma nada.
  if (prox.orden === undefined) return null;

  const { umbralHr, hrefBase = "", formatearFecha = fmtDateOnly } = opciones;
  const href = `${hrefBase}${ANCLA_MANTENIMIENTOS}`;
  const orden = prox.orden;

  if (!orden) {
    if (!dentroDelUmbral(prox, umbralHr)) return null;
    // El API dice que la regla está APAGADA: prometer que «se genera sola»
    // sería repetir la queja del cliente («entonces es enunciativa»). Se dice
    // la verdad y se ofrece capturarla. `null`/ausente = no se sabe o API
    // viejo ⇒ se mantiene la promesa (que es el comportamiento normal).
    if (prox.aviso_automatico?.activo === false) {
      return {
        texto: "La orden NO se crea sola · hay que capturarla",
        tono: "ambar",
        detalle:
          "El aviso automático de servicio por horas está apagado en Configuración → Alertas, así que nadie va a crear esta orden por su cuenta.",
        accion: { texto: "Crear orden", href },
      };
    }
    return {
      texto: "La orden se genera sola en unos minutos",
      tono: "neutro",
      detalle:
        "El sistema crea la orden de servicio en cuanto el avión entra al margen de aviso: la revisión corre al capturar cada tacómetro y también cada 10 minutos. No hay que capturarla a mano.",
      accion: null,
    };
  }

  if (orden.estado === "EN_TALLER") {
    return {
      texto: TEXTO_EN_TALLER,
      tono: "info",
      detalle: `El servicio ya está en proceso. ${origenDeOrden(orden)}`,
      accion: { texto: "Ver mantenimiento", href },
    };
  }

  if (orden.estado === "PROGRAMADO") {
    const fecha = fechaDeOrden(orden);
    if (!fecha) {
      return {
        texto: "Orden programada · falta confirmar fecha",
        tono: "ambar",
        detalle: `La orden de servicio ya existe, solo falta acordar el día con el taller. ${origenDeOrden(orden)}`,
        // «Poner fecha» y no «Confirmar fecha»: el texto de la línea ya dice
        // qué falta, y repetirlo en el enlace se lee como un trabalenguas.
        accion: { texto: "Poner fecha", href },
      };
    }
    return {
      texto: `Orden programada para ${formatearFecha(fecha)}`,
      tono: "info",
      detalle: `El servicio ya tiene día. ${origenDeOrden(orden)}`,
      accion: { texto: "Ver mantenimiento", href },
    };
  }

  // Estado que este panel no conoce (API más nuevo): se informa que la orden
  // existe —que es lo que importa— sin inventar en qué etapa va.
  return {
    texto: "Orden de servicio registrada",
    tono: "info",
    detalle: origenDeOrden(orden),
    accion: { texto: "Ver mantenimiento", href },
  };
}

/** Clases de color por tono (Tailwind), para no repetirlas en cada card. */
export const CLASE_TONO_SERVICIO: Record<TonoServicio, string> = {
  ambar: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
  neutro: "text-muted-foreground",
};
