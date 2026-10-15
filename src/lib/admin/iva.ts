/**
 * IVA DE LA COTIZACIÓN — reabrir NO mueve el IVA (14-oct-2026)
 * ============================================================
 *
 * CUARTA pieza de la familia T.C. (17-sep, `fmtTc`) → HORAS pactadas (22-sep,
 * #322, `lib/admin/horas.ts`) → TARIFA (22-sep, #105, `lib/admin/tarifa.ts`):
 * lo que se persiste es lo que se usó para multiplicar, y REABRIR una
 * cotización y guardarla sin tocar nada jamás mueve su total.
 *
 * El caso (#341, COMPLETADO, cobrado EXACTO: $14,000.00 MXN = $800.00 USD ×
 * 17.5): método previsto TRANSFERENCIA —que por default lleva 16 %— con el
 * IVA puesto A MANO en 0 %. El cotizador solo rehidrataba el IVA manual
 * cuando el método NO lleva IVA, con la nota «un % custom sobre un método CON
 * IVA no es distinguible del estándar». FALSO: el snapshot guarda el default
 * del método (`iva.aplica_por_metodo_pago`) y el % aplicado
 * (`iva.porcentaje`). Sin override, el primer cambio que dispara
 * `/calculate` (teclear el T.C.) le devolvía el 16 %: $800.00 → $928.00 en
 * silencio, y `resumirCambios` no lo listaba porque el campo del IVA no
 * cambió. En prod (14-oct-2026), dentro de la ventana de edición: #253,
 * #341, #349 y #358 (transferencia al 0 %, cobradas exactas), #219 (ídem,
 * cancelada) y #374 (transferencia al 5 %).
 *
 * REGLA DEL MOTOR (`vuelatour-api/src/modules/quotes/quotes.service.ts`):
 *
 *     ivaPct = iva_pct_override (si viaja, INCLUIDO el 0)
 *              ?? (método ∈ {TRANSFERENCIA, HSBC_LINK, CHEQUE} ? 0.16 : 0)
 *
 * y persiste `iva.aplica_por_metodo_pago` + `iva.porcentaje = round4(ivaPct)`
 * (también en `vuelo.iva_pct`, `decimal(6,4)`). Por eso el override que se
 * rehidrata es el % persistido SIEMPRE que difiera del default de su método;
 * igual al default ⇒ `null` (se re-resuelve por método, como siempre).
 *
 * SOLO CON LA FOTO DEL MOTOR (revisión del 14-oct-2026). Sin
 * `calculo_snapshot.iva` el vuelo nunca se cotizó (reserva, servicio,
 * externo cubierto o dado de alta sin cotizar) y no hay dinero que
 * preservar: su `iva_pct` 0 es el default de la columna (`createReserva`,
 * `createExternal`), no un IVA pactado, AUNQUE `metodo_cobro` ya diga
 * TRANSFERENCIA — «Editar» deja fijar el método justo en externos sin
 * snapshot y `createExternal` lo pone por default. La primera versión de
 * este arreglo leía esas columnas: la PRIMERA cotización de ese externo
 * arrancaba con «IVA 0 % manual» (sobre una base de $800.00, $800.00 en vez
 * de $928.00) sin salir en el diff. Sin foto ⇒ `null`: el motor la resuelve
 * por método, como siempre. Es el mismo candado que la tarifa
 * (`tarifa.proviene_de_override === true`) y las horas
 * (`tiempos.cobrable_proviene_de_override === true`).
 *
 * Todo en FRACCIÓN (0.16), como el API: la hoja lo PINTA en % (16).
 *
 * El cotizador de GRUPO (`components/admin/grupos/grupo-form/**`) no tiene
 * IVA manual que rehidratar: `ArmarGrupoInput` no lleva `iva_pct_override` y
 * el API calcula cada hijo con el método del grupo. Un hijo abierto en el
 * cotizador de un avión pasa por ESTA regla como cualquier cotización.
 *
 * Módulo PURO: sin React, sin red, sin `lib/format`. Congelado en
 * `__tests__/iva.test.ts` (con la paridad contra el API cuando el repo
 * hermano existe).
 */

import type { MetodoPago } from "@/types/quote";

/**
 * IVA que el motor aplica por default a un método que lo lleva, en FRACCIÓN.
 * ESPEJO de `IVA_DEFAULT` de `quotes.service.ts` (paridad en la prueba).
 */
export const IVA_DEFAULT = 0.16;

/** Decimales con los que el API persiste el % de IVA (`round4`, `decimal(6,4)`). */
export const IVA_DECIMALES = 4;

/**
 * Métodos que llevan IVA por default (los bancarios facturables). ESPEJO de
 * `ivaAplicaPorMetodo` del motor: BILLPOCKET, PAYWISE, EFECTIVO, DOLARES y
 * OTRO van al 0 % salvo IVA manual. Es la misma división que pintan las
 * pistas «Con factura · IVA 16%» del selector (`metodos-pago.ts`).
 */
export const METODOS_CON_IVA: readonly MetodoPago[] = ["TRANSFERENCIA", "HSBC_LINK", "CHEQUE"];

/** ¿El método lleva IVA por default? (`null`/desconocido ⇒ no). */
export function metodoLlevaIva(metodo: string | null | undefined): boolean {
  return METODOS_CON_IVA.includes(metodo as MetodoPago);
}

/** IVA (fracción) que el motor pone a un método cuando NO viaja override. */
export function ivaDefaultDeMetodo(metodo: string | null | undefined): number {
  return metodoLlevaIva(metodo) ? IVA_DEFAULT : 0;
}

/** Entero en diezmilésimas: la unidad en la que el API redondea el %. */
function diezmilesimas(v: number): number {
  return Math.round(v * 10 ** IVA_DECIMALES);
}

/**
 * % de IVA (fracción) a 4 decimales, o `null` si no hay un número utilizable:
 * vacío, no numérico, negativo (el DTO exige `>= 0`) o de otro tipo. `numeric`
 * de PostgREST llega como NÚMERO o como CADENA («0.0000»): las dos valen. El
 * `null` NO se vuelve 0 (`Number(null) === 0` haría pasar «sin dato» por
 * «IVA manual 0 %»).
 */
export function normalizarIvaPct(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim() !== "") n = Number(v);
  else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  const r = diezmilesimas(n) / 10 ** IVA_DECIMALES;
  return r === 0 ? 0 : r; // sin «-0»
}

/** ¿Es el MISMO % a 4 decimales? (comparación entera, sin `===` de floats). */
export function mismoIvaPct(a: number, b: number): boolean {
  return diezmilesimas(a) === diezmilesimas(b);
}

/**
 * Lo que la rehidratación necesita de una cotización persistida
 * (`PersistedQuote` lo cumple): el snapshot del cálculo —sin su `iva` no hay
 * nada que rehidratar— y, como respaldo DENTRO de él, las columnas del vuelo.
 */
export interface CotizacionIvaPersistido {
  calculo_snapshot?: {
    iva?: {
      aplica_por_metodo_pago?: boolean | null;
      porcentaje?: number | string | null;
    } | null;
  } | null;
  iva_pct?: number | string | null;
  metodo_cobro?: string | null;
}

/**
 * IVA MANUAL que hay que REHIDRATAR en el cotizador (`iva_pct_override`), en
 * fracción, o `null` (el motor lo re-resuelve por método de pago).
 *
 * - **Solo con la foto del motor** (`calculo_snapshot.iva` con su % o su
 *   marca del método): sin snapshot, sin `iva` o con un `iva` que no trae
 *   ninguno de los dos ⇒ `null`, tenga el método que tenga. Un vuelo SIN
 *   cotizar (reserva, servicio, externo) guarda `iva_pct` 0 por default de
 *   la columna, no un IVA pactado (ver el encabezado).
 * - **Qué % se usó**: `iva.porcentaje` (la foto del cálculo con el que se
 *   compuso el dinero) o, si la foto no lo trae utilizable, la columna
 *   `iva_pct` (la escribe el MISMO guardado, `decimal(6,4)`).
 * - **Qué habría puesto el método solo**: `iva.aplica_por_metodo_pago ?
 *   0.16 : 0`; un `iva` legado sin esa marca toma el default de
 *   `metodo_cobro` (con desglose, el API solo deja cambiar el método
 *   revisando la cotización: es el método con el que se calculó).
 * - Difieren a 4 decimales ⇒ ese % ES el override (INCLUIDO el 0: la
 *   transferencia al 0 % de la #341). Iguales ⇒ `null`.
 *
 * El override viaja tal cual a `/calculate` y a `revise` (`armarCalcPayload`
 * lo manda solo si no es null), así que reabrir y guardar sin tocar el IVA
 * vuelve a componer el MISMO total.
 */
export function ivaOverrideRehidratado(
  q: CotizacionIvaPersistido | null | undefined,
): number | null {
  // Sin la foto del motor no hubo dinero compuesto con un IVA: las columnas
  // solas (`iva_pct` 0 de default + `metodo_cobro`) NO dicen «IVA manual».
  const iva = q?.calculo_snapshot?.iva;
  if (!q || !iva) return null;
  const pctFoto = normalizarIvaPct(iva.porcentaje);
  const marca =
    typeof iva.aplica_por_metodo_pago === "boolean" ? iva.aplica_por_metodo_pago : null;
  // Un `iva` sin el % ni la marca no es foto de nada: igual que sin snapshot.
  if (pctFoto === null && marca === null) return null;
  const pct = pctFoto ?? normalizarIvaPct(q.iva_pct);
  if (pct === null) return null;
  const porDefault = (marca ?? metodoLlevaIva(q.metodo_cobro)) ? IVA_DEFAULT : 0;
  return mismoIvaPct(pct, porDefault) ? null : pct;
}
