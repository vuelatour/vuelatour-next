/**
 * FACTURA OBLIGATORIA POR CUENTA DE COBRO — espejo PURO de la regla del API
 * (`common/cuentas-cobro.ts`, invariante 60; decisión 4 del lote del cliente
 * del 13-oct-2026): un cobro que cae en HSBC Dólares / HSBC Pesos /
 * Scotiabank Dólares / Scotiabank Pesos EXIGE factura del servicio. Paywise
 * NO. Sin cuenta capturada decide el MÉTODO: link de pago HSBC,
 * transferencia y cheque exigen; BillPocket, efectivo, Paywise, dólares
 * directo y «otro» no. Los reembolsos (monto ≤ 0) nunca exigen por sí solos.
 *
 * A nivel VUELO se decide por el NETO de cada cuenta (o método sin cuenta) y
 * moneda (revisión del 13-oct-2026): un anticipo en HSBC devuelto COMPLETO
 * en la misma cuenta ya no exige; devuelto en parte, en efectivo, en otra
 * cuenta o en otra moneda, sí (conservador). USD y MXN NUNCA se suman: un
 * reembolso sin moneda no netea.
 *
 * Por qué hay un espejo en el panel: la burbuja de FACTURA de las cards de
 * cobros (vuelo y cotización) dice «Factura obligatoria: cobro en HSBC
 * Pesos» con los cobros que YA tiene a la mano, sin pedirle nada nuevo al
 * API (el lote del 13-oct no cambia el contrato). No es dinero: es la MISMA
 * clasificación, con la MISMA tabla, y `__tests__/factura-obligatoria.test.ts`
 * la compara contra el archivo del API cuando el repo hermano está al lado.
 * Si la regla cambia allá, cambia aquí en el mismo cambio.
 *
 * Lo que NO vive aquí: la columna «FACTURA VUELATOUR» de los Excel, la
 * solicitud automática y el pre-cierre (`vuelos_cobrados_sin_factura`) —
 * los decide el API y el panel los pinta tal cual.
 */

import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { CUENTAS_COBRO } from "@/lib/admin/cobros";
import { estatusFacturaCliente, normalizarFolio } from "@/lib/admin/factura-cliente";

/** Subconjunto de `CUENTAS_COBRO` que exige factura ('Paywise' queda fuera). */
export const CUENTAS_COBRO_EXIGEN_FACTURA: readonly string[] = [
  "HSBC Dólares",
  "HSBC Pesos",
  "Scotiabank Dólares",
  "Scotiabank Pesos",
];

/**
 * Respaldo por MÉTODO, SOLO cuando `cuenta_destino` está vacía o fuera del
 * catálogo (cobros viejos, anticipo aplicado, «es el pago de un vuelo» desde
 * el banco, cobro del piloto por link HSBC).
 */
export const METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA: readonly string[] = [
  "HSBC_LINK",
  "TRANSFERENCIA",
  "CHEQUE",
];

/** Lo mínimo de un cobro para decidir (un `FlightCobro` sirve tal cual). */
export interface CobroExigeFacturaRow {
  cuenta_destino?: unknown;
  metodo_cobro?: unknown;
  monto?: unknown;
  moneda?: unknown;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Lo que queda en un grupo por debajo de esto es cero (centavos). */
const TOLERANCIA_NETO = 0.005;

/**
 * ¿La CUENTA decide? `true` = exige (una de las cuatro), `false` = no exige
 * ('Paywise'), `null` = no decide (vacía o un texto fuera de
 * `CUENTAS_COBRO`: entonces decide el método).
 */
export function cuentaExigeFactura(cuenta: unknown): boolean | null {
  const t = texto(cuenta);
  if (!t) return null;
  if (CUENTAS_COBRO_EXIGEN_FACTURA.includes(t)) return true;
  if (CUENTAS_COBRO.some((c) => c.value === t)) return false;
  return null;
}

/**
 * ¿ESTE cobro exige factura? Monto no finito o ≤ 0 (reembolsos) ⇒ nunca; la
 * cuenta MANDA cuando decide; si no, decide el método (vacío ⇒ no).
 */
export function cobroExigeFactura(c: CobroExigeFacturaRow): boolean {
  const monto = Number(c.monto);
  if (!Number.isFinite(monto) || monto <= 0) return false;
  const porCuenta = cuentaExigeFactura(c.cuenta_destino);
  if (porCuenta !== null) return porCuenta;
  const metodo = texto(c.metodo_cobro);
  return metodo !== "" && METODOS_COBRO_EXIGEN_FACTURA_SIN_CUENTA.includes(metodo);
}

/** Tri-estado del VUELO (mismo que el API). */
export type ExigenciaFacturaVuelo = "EXIGE" | "NO_EXIGE" | "SIN_COBROS";

/**
 * Cuenta del cobro como texto: la capturada tal cual («HSBC Pesos») o, sin
 * cuenta, la etiqueta del método («Transferencia sin cuenta destino»).
 */
export function cuentaDeCobroTexto(c: CobroExigeFacturaRow): string {
  const cuenta = texto(c.cuenta_destino);
  if (cuenta) return cuenta;
  return `${metodoPagoLabel(texto(c.metodo_cobro) || null)} sin cuenta destino`;
}

/** Origen del cobro para los textos: «en HSBC Pesos» / «por Transferencia». */
export function origenCobroTexto(c: CobroExigeFacturaRow): string {
  const cuenta = texto(c.cuenta_destino);
  if (cuenta) return `en ${cuenta}`;
  return `por ${metodoPagoLabel(texto(c.metodo_cobro) || null)}`;
}

interface NetoQueExige {
  texto: string;
  origen: string;
  neto: number;
}

/**
 * NETO por grupo (`cuentaDeCobroTexto` + moneda) de los cobros que EXIGEN
 * factura, en orden de aparición. Cada fila se clasifica por su
 * cuenta/método SIN mirar el signo: un reembolso resta del grupo de SU
 * cuenta y moneda; un reembolso sin moneda no netea.
 */
function netosQueExigen(cobros: ReadonlyArray<CobroExigeFacturaRow>): NetoQueExige[] {
  const grupos = new Map<string, NetoQueExige>();
  for (const c of cobros) {
    const m = Number(c.monto);
    if (!Number.isFinite(m) || m === 0) continue;
    if (!cobroExigeFactura({ ...c, monto: Math.abs(m) })) continue;
    const moneda = texto(c.moneda);
    if (m < 0 && moneda === "") continue;
    const t = cuentaDeCobroTexto(c);
    const clave = `${t}\u0000${moneda}`;
    const g = grupos.get(clave);
    if (g) g.neto += m;
    else grupos.set(clave, { texto: t, origen: origenCobroTexto(c), neto: m });
  }
  return [...grupos.values()];
}

/**
 * Exigencia del VUELO sobre TODOS sus cobros: sin cobros positivos ⇒
 * SIN_COBROS; si en alguna cuenta (o método sin cuenta) que exige QUEDÓ
 * dinero neto ⇒ EXIGE; si no ⇒ NO_EXIGE.
 */
export function vueloExigeFactura(
  cobros: ReadonlyArray<CobroExigeFacturaRow> | null | undefined,
): ExigenciaFacturaVuelo {
  const lista = cobros ?? [];
  const positivos = lista.filter((c) => {
    const m = Number(c.monto);
    return Number.isFinite(m) && m > 0;
  });
  if (positivos.length === 0) return "SIN_COBROS";
  return netosQueExigen(lista).some((g) => g.neto > TOLERANCIA_NETO) ? "EXIGE" : "NO_EXIGE";
}

/** Cuentas (texto, distintas, en orden) en las que QUEDÓ dinero que exige factura. */
export function cuentasQueExigenFactura(
  cobros: ReadonlyArray<CobroExigeFacturaRow> | null | undefined,
): string[] {
  const out: string[] = [];
  for (const g of netosQueExigen(cobros ?? [])) {
    if (g.neto <= TOLERANCIA_NETO) continue;
    if (!out.includes(g.texto)) out.push(g.texto);
  }
  return out;
}

/** Orígenes («en HSBC Pesos», «por Transferencia») de esas mismas cuentas. */
export function origenesQueExigenFactura(
  cobros: ReadonlyArray<CobroExigeFacturaRow> | null | undefined,
): string[] {
  const out: string[] = [];
  for (const g of netosQueExigen(cobros ?? [])) {
    if (g.neto <= TOLERANCIA_NETO) continue;
    if (!out.includes(g.origen)) out.push(g.origen);
  }
  return out;
}

/** «A», «A y B», «A, B y C». */
function unir(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Chip de la burbuja: «Factura obligatoria: cobro en HSBC Pesos» (dos o más:
 * «cobros en HSBC Pesos y por Transferencia»). `null` = el vuelo no la exige
 * (sin cobros, o ninguno quedó en una cuenta que la exija).
 */
export function textoFacturaObligatoria(
  cobros: ReadonlyArray<CobroExigeFacturaRow> | null | undefined,
): string | null {
  const origenes = origenesQueExigenFactura(cobros);
  if (origenes.length === 0) return null;
  return `Factura obligatoria: ${origenes.length === 1 ? "cobro" : "cobros"} ${unir(origenes)}`;
}

/** Tooltip del chip: por qué es obligatoria y qué pasa si no se registra. */
export const AYUDA_FACTURA_OBLIGATORIA =
  "La factura del servicio es obligatoria porque el dinero entró a una cuenta que la exige (HSBC Dólares, HSBC Pesos, Scotiabank Dólares o Scotiabank Pesos; sin cuenta capturada: link de pago HSBC, transferencia o cheque). Mientras no se registre, el pre-cierre lo marca.";

/** Lo mismo para un vuelo CANCELADO con dinero retenido (no hay «Necesito factura»). */
export const AYUDA_FACTURA_OBLIGATORIA_CANCELADO = `${AYUDA_FACTURA_OBLIGATORIA} Vuelo cancelado: regístrala directo en Facturas emitidas.`;

/** Línea extra del diálogo «Retirar» cuando la factura es obligatoria. */
export function avisoRetirarFacturaObligatoria(textoObligatoria: string | null): string | null {
  if (!textoObligatoria) return null;
  const motivo = textoObligatoria.replace(/^Factura obligatoria: /, "");
  return `Ojo: la factura es obligatoria (${motivo}); el pre-cierre seguirá marcando el vuelo mientras no se registre.`;
}

/**
 * ¿El vuelo ya tiene una factura REGISTRADA fuera del registro de facturas
 * emitidas? Espejo de los pasos de la cascada del API que no son «emitidas
 * VIGENTES» (`etiquetaFacturaRegistrada`): CFDI timbrado (`facturado`), folio
 * legado o estatus manual ≠ «Sin factura». Con eso la obligación ya está
 * cumplida (el pre-cierre tampoco lo lista) y la burbuja no la anuncia.
 */
export function facturaRegistradaFuera(v: {
  facturado?: boolean | null;
  factura_cliente?: { estatus?: string | null; folio?: string | null } | null;
}): boolean {
  if (normalizarFolio(v.factura_cliente?.folio) != null) return true;
  const fc = v.factura_cliente;
  return (
    estatusFacturaCliente({
      facturado: v.facturado,
      factura_cliente: fc?.estatus ? { estatus: fc.estatus, archivo: null } : null,
    }) !== "SIN_FACTURA"
  );
}
