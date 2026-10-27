/**
 * GASTO ENFOCADO en `/admin/expenses` (27-oct-2026): `?gasto=<uuid>`.
 *
 * Pedido del cliente (captura de Conciliación con la liga verde «Refacción ·
 * $794.61 USD» señalada): «Cuando le pico a la conciliación no me manda al
 * gasto conciliado, solo me manda al apartado de gastos». La liga de la
 * columna «Conciliación» iba a `/admin/expenses` A SECAS cuando el gasto no
 * tiene vuelo (con vuelo sigue yendo al vuelo, donde se ve su desglose).
 * Ahora va a Gastos FILTRADO AL DÍA del gasto y con `?gasto=`: la página lo
 * pone PRIMERO y en ámbar —la MISMA marca de la fila enfocada de
 * Conciliación (`?mov=`) y del «Resolver →» del pre-cierre— con una franja
 * que lo dice y «Quitar resaltado».
 *
 * `gasto` tiene el MISMO nombre y significado que `?gasto=` de Conciliación y
 * del balance (el gasto que se viene a ver). Es SOLO del panel: no entra a
 * `FILTROS_URL`, no viaja al API ni al Excel, y las pestañas no lo arrastran.
 * Todo PURO (prueba `__tests__/gasto-enfocado.test.ts`).
 */
import { CLASE_FILA_ENFOCADA, ETIQUETA_QUITAR_RESALTADO } from "./conciliacion-vista";
import { esDiaValido, uuidFiltro } from "./url-params";

export const PARAM_GASTO_ENFOCADO = "gasto";
export const RUTA_GASTOS = "/admin/expenses";
/** La MISMA marca ámbar de la fila enfocada (Conciliación `?mov=`, pre-cierre `ids`). */
export const CLASE_FILA_GASTO_ENFOCADO = CLASE_FILA_ENFOCADA;
export const TITULO_FRANJA_GASTO_ENFOCADO = "Gasto que abriste desde Conciliación";
export const TEXTO_GASTO_ENFOCADO_EN_VISTA = "Va primero en la lista, resaltado en ámbar.";
export const TEXTO_GASTO_ENFOCADO_FUERA =
  "No está en esta vista: cambia o quita los filtros (quizá cambió de fecha o se borró).";
export const TEXTO_GASTO_ENFOCADO_SIN_LISTA = "La lista no cargó: no se puede decir si está en esta vista.";
export { ETIQUETA_QUITAR_RESALTADO };

type ParamsUrl = Record<string, string | string[] | undefined>;

/** Día (YYYY-MM-DD) de una fecha del API (día o ISO con hora); null si no es un día válido. */
export function diaDeGasto(fecha: string | null | undefined): string | null {
  if (typeof fecha !== "string") return null;
  const dia = fecha.trim().slice(0, 10);
  return esDiaValido(dia) ? dia : null;
}

/**
 * Href a Gastos con ESE gasto enfocado: filtrado a su día (así está en la
 * lista aunque haya más de 1,000 gastos) y `?gasto=`. Sin fecha válida viaja
 * solo `?gasto=` (la lista completa, con el gasto arriba); sin un uuid viaja
 * solo el día (nunca se manda basura en la URL); sin nada, la lista a secas.
 */
export function hrefGastoEnfocado(g: { id?: string | null; fecha_gasto?: string | null }): string {
  const q = new URLSearchParams();
  const dia = diaDeGasto(g.fecha_gasto);
  if (dia) {
    q.set("desde", dia);
    q.set("hasta", dia);
  }
  const id = uuidFiltro(g.id);
  if (id) q.set(PARAM_GASTO_ENFOCADO, id.toLowerCase());
  const qs = q.toString();
  return qs ? `${RUTA_GASTOS}?${qs}` : RUTA_GASTOS;
}

/** `?gasto=` validado (solo uuid, en minúsculas; un arreglo toma el primero); null sin foco. */
export function leerGastoEnfocado(sp: ParamsUrl | null | undefined): string | null {
  const crudo = sp?.[PARAM_GASTO_ENFOCADO];
  const valor = Array.isArray(crudo) ? crudo[0] : crudo;
  const id = uuidFiltro(valor);
  return id ? id.toLowerCase() : null;
}

/** Lo que dice la franja bajo el título. `encontrado` null = la lista no cargó. */
export function textoEstadoGastoEnfocado(encontrado: boolean | null): string {
  if (encontrado === null) return TEXTO_GASTO_ENFOCADO_SIN_LISTA;
  return encontrado ? TEXTO_GASTO_ENFOCADO_EN_VISTA : TEXTO_GASTO_ENFOCADO_FUERA;
}

/** La URL actual de Gastos sin `?gasto=` (conserva todo lo demás, sin hash). */
export function hrefQuitarGastoEnfocado(sp: ParamsUrl | null | undefined): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (k === PARAM_GASTO_ENFOCADO || v === undefined) continue;
    for (const valor of Array.isArray(v) ? v : [v]) q.append(k, valor);
  }
  const qs = q.toString();
  return qs ? `${RUTA_GASTOS}?${qs}` : RUTA_GASTOS;
}
