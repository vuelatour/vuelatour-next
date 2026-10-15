/**
 * PRE-CIERRE — los dos renglones que tocan las decisiones del cliente del
 * 14-oct-2026 (API 0.0.77). El API decide QUÉ entra, cuánto suma y si
 * bloquea (`listo`); aquí solo cómo se PINTA y a dónde lleva. PURO.
 *
 *  - `permisos_sin_avion` (BLOQUEA; decisión 1: «el AFAC lo cargan al
 *    Avión»): un PERMISO sin avión resoluble no resta en ningún balance ni en
 *    el reparto y el Balance general lo pondría como gasto de VuelaTour.
 *    Trae `monto_mxn` y, solo si hay, `monto_usd` (jamás suma monedas: la
 *    card pinta los dos). «Resolver →» lleva a Gastos con los PERMISOS del
 *    periodo (mismo eje del API: `fecha_gasto`), donde el que no tiene avión
 *    dice «Falta avión».
 *  - `cobros_en_cancelados` (informativo; decisión 2: «¿Un anticipo devuelto
 *    lleva CFDI?» ⇒ «eso no»): desde el 0.0.77 el API lista SOLO los
 *    cancelados que el reparto cuenta y marca `diferencia_cambiaria: true`
 *    cuando el dinero ya se devolvió completo: lo que queda es la diferencia
 *    entre el T.C. del cobro y el del reembolso, que el reparto cuenta como
 *    venta. El chip lo dice: «#215 (diferencia cambiaria)». Sin la marca
 *    (o con un API previo), el chip de siempre.
 */

export const CLAVE_PRECIERRE_PERMISOS_SIN_AVION = "permisos_sin_avion";

/** «Resolver →» de `permisos_sin_avion`: Gastos con los permisos del periodo. */
export function hrefPrecierrePermisosSinAvion(p: { desde: string; hasta: string }): string {
  const sp = new URLSearchParams({ categoria: "PERMISO", desde: p.desde, hasta: p.hasta });
  return `/admin/expenses?${sp.toString()}`;
}

export const CLAVE_PRECIERRE_COBROS_EN_CANCELADOS = "cobros_en_cancelados";

/** Lo que va entre paréntesis en el chip del vuelo («#215 (diferencia cambiaria)»). */
export const ETIQUETA_DIFERENCIA_CAMBIARIA = "diferencia cambiaria";

/** Tooltip del chip (la misma explicación que el `detalle` del API). */
export const AYUDA_DIFERENCIA_CAMBIARIA =
  "El dinero ya se devolvió completo: lo que queda es la diferencia entre el T.C. del cobro y el del reembolso, que el reparto cuenta como venta. Para que no cuente, captura el reembolso con el T.C. del cobro.";

/** ¿El API marcó el vuelo con `diferencia_cambiaria: true`? (cualquier otro valor: no) */
export function esDiferenciaCambiaria(v: { diferencia_cambiaria?: unknown } | null | undefined): boolean {
  return v?.diferencia_cambiaria === true;
}
