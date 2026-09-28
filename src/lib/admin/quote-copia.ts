/**
 * «COPIAR COMO NUEVA COTIZACIÓN» — fuente única (28-sep-2026).
 *
 * Pedido del cliente: «ya no está la opción de usar de copia la cotización
 * para una nueva; esa función es muy útil, la necesitamos de nuevo». El botón
 * existía, pero SOLO en la lectura bloqueada (🔒 + razón en la barra del
 * total); desde que el 26-sep-2026 muchas cotizaciones abren editables, para
 * ellas desapareció. Ahora vive en la barra de acciones de la cotización en
 * TODOS los estados y el del candado se queda; los dos arman la copia AQUÍ.
 *
 * Qué hace la copia: prellena `/admin/quotes/new?d=` (el MISMO borrador en la
 * URL que usa el alta para no perder el avance) con el documento tal como se
 * ve en pantalla. «Crear v1» la guarda como una cotización NUEVA: folio
 * nuevo, v1, sin cobros y sin vuelo ligado (nada de eso vive en el form).
 *
 * Regla de qué se copia: lo que es de la COTIZACIÓN viaja (cliente, avión,
 * ruta y tramos —millas, pasajeros, ferry, pernocta, servicio, notas—,
 * extras, tarifa, TUAS, redondeo/descuento, método de cobro, comisión del
 * vendedor, notas, toggles del PDF); lo que es del VIAJE concreto se vacía:
 *  - la fecha del vuelo, la del regreso y la hora planeada de cada tramo;
 *  - la fecha que el PDF imprime por tramo (`pdf_fecha`);
 *  - el manifiesto (nombres de pasajeros por tramo);
 *  - la ruta operativa del alta (`escalas_operacion`) y el motivo de versión;
 *  - el precio pactado LEGADO de externos (`total_pactado_usd`): el API lo
 *    descarta al crear, así que la vista previa del alta mostraría un total
 *    que no se guarda;
 *  - la liga de los extras con un GRUPO (`origen`/`grupo_extra_id`): la copia
 *    es una cotización de UN avión y el renglón se vuelve propio y editable.
 *
 * Sin React, sin red: todo PURO (prueba `__tests__/quote-copia.test.ts`).
 */

import type { QuoteFormValues } from "@/components/admin/quotes/quote-form-types";
import { puedeEditarCotizacion } from "./quote-sheet-interna";

/** Query param del borrador del cotizador en la URL (alta y recarga). */
export const PARAM_BORRADOR = "d";

/** Ruta del alta de cotizaciones. */
export const RUTA_NUEVA_COTIZACION = "/admin/quotes/new";

/** Texto visible del botón de la barra de acciones. */
export const TEXTO_BOTON_COPIAR = "Copiar como nueva";

/** Tooltip de los dos botones (barra de acciones y candado). */
export const TITULO_BOTON_COPIAR =
  "Crea una cotización nueva con estos mismos tramos, extras y tarifa, sin fecha ni cobros. Esta no se toca.";

/** Datos de la copia que viajan junto al borrador (solo para el aviso). */
export interface OrigenCopia {
  /** Folio de la cotización copiada (null si no se conoce). */
  folio: number | null;
  /** La copia llevó cambios que NO se guardaron en la original. */
  conCambios: boolean;
}

/**
 * ¿Este rol ve «Copiar como nueva»? Quien puede CREAR una cotización
 * (`POST /v1/quotes` = ADMIN/COORDINADOR, espejo `ROLES_EDITAN_COTIZACION`):
 * a SOCIO, FACTURACION o ANALISTA la copia los llevaría a un alta que el API
 * les rechaza al guardar. Sin rol (falló `/me`) se muestra, igual que
 * `puedeEditarCotizacion`: el gate real es el API.
 */
export function puedeCopiarCotizacion(rol: string | null | undefined): boolean {
  return puedeEditarCotizacion(rol);
}

/**
 * Valores del form para la COPIA (puro, no muta la entrada): ver la regla
 * de qué se copia y qué se vacía en el encabezado de este archivo.
 */
export function valoresCopiaCotizacion(v: QuoteFormValues): QuoteFormValues {
  return {
    ...v,
    fecha_vuelo: "",
    fecha_traslado_final: "",
    escalas: (v.escalas ?? []).map((e) => {
      const tramo = { ...e, fecha_salida_plan: null, pasajeros_nombres: [] as string[] };
      delete tramo.pdf_fecha;
      return tramo;
    }),
    extras: (v.extras ?? []).map((e) => {
      const renglon = { ...e };
      delete renglon.origen;
      delete renglon.grupo_extra_id;
      return renglon;
    }),
    total_pactado_usd: null,
    motivo: "",
    escalas_operacion: [],
  };
}

// ===== Borrador del cotizador EN LA URL (26-ago) =====
// Recargar no pierde el avance: el form viaja comprimido en `?d=` (base64url
// de `{ v: 1, f }`). La copia añade `copia` para que el alta avise de dónde
// viene; el alta lo lee UNA vez al montar y al reescribir la URL lo suelta.

/** Codifica el form (y, si es una copia, su origen) para `?d=`. */
export function codificarBorrador(
  v: QuoteFormValues,
  copia?: OrigenCopia | null,
): string {
  const cuerpo = copia ? { v: 1, f: v, copia } : { v: 1, f: v };
  return btoa(unescape(encodeURIComponent(JSON.stringify(cuerpo))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Borrador leído de `?d=`: el form y, si vino de una copia, su origen. */
export interface BorradorLeido {
  f: Partial<QuoteFormValues>;
  copia: OrigenCopia | null;
}

/**
 * Lee `?d=`. Un parámetro corrupto o de otra versión devuelve null: se
 * ignora, jamás rompe el alta.
 */
export function decodificarBorrador(raw: string): BorradorLeido | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(decodeURIComponent(escape(atob(b64)))) as {
      v?: number;
      f?: Partial<QuoteFormValues>;
      copia?: { folio?: unknown; conCambios?: unknown };
    };
    if (parsed?.v !== 1 || !parsed.f || typeof parsed.f !== "object") return null;
    const c = parsed.copia;
    const copia: OrigenCopia | null =
      c && typeof c === "object"
        ? {
            folio:
              typeof c.folio === "number" && Number.isFinite(c.folio) ? c.folio : null,
            conCambios: c.conCambios === true,
          }
        : null;
    return { f: parsed.f, copia };
  } catch {
    return null;
  }
}

/**
 * URL del alta prellenada con la copia: `/admin/quotes/new?d=…`. Recibe los
 * valores COMO ESTÁN en pantalla (`getValues()`); la limpieza la hace aquí.
 */
export function urlCopiarComoNueva(
  valores: QuoteFormValues,
  origen: OrigenCopia,
): string {
  const d = codificarBorrador(valoresCopiaCotizacion(valores), origen);
  return `${RUTA_NUEVA_COTIZACION}?${PARAM_BORRADOR}=${d}`;
}

/** Aviso del alta al abrir una copia (en vez de «Se restauró tu avance…»). */
export function textoAvisoCopia(origen: OrigenCopia): string {
  const de = origen.folio != null ? `la cotización #${origen.folio}` : "otra cotización";
  const cambios = origen.conCambios ? ", con los cambios que no guardaste en ella" : "";
  return `Copia de ${de}${cambios}. Pon la fecha del vuelo y revisa cliente y pasajeros antes de crear la v1.`;
}

/** Diálogo «¿Copiar con tus cambios sin guardar?» (form sucio). */
export function textoConfirmarCopiaConCambios(folio: number | null): string {
  const cual = folio != null ? `La #${folio}` : "Esta cotización";
  return `La cotización nueva llevará lo que ves en pantalla, incluidos tus cambios. ${cual} se queda como está: esos cambios NO se guardan en ella.`;
}
