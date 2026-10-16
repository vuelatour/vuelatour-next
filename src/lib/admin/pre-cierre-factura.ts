/**
 * PRE-CIERRE → «Vuelos cobrados en cuentas que exigen factura sin factura
 * registrada» (13-oct-2026, invariante 60 del API; espejo de
 * `profit-sharing/vuelos-sin-factura.util.ts`). El API decide QUÉ vuelos
 * entran (por el NETO de cada cuenta, en el periodo, sin factura
 * registrada); aquí solo cómo se PINTA cada chip y a dónde lleva. PURO.
 *
 * Cada vuelo trae `cuentas` (texto de las cuentas que exigen la factura),
 * `solicitada` (ya está en «Por facturar»: solo informa) y, SOLO en un
 * cancelado, `estado: 'CANCELADO'` — para él no existe «Necesito factura»
 * (el panel lo oculta y el API respondería 409): se registra directo en
 * Facturas emitidas, como ya dice el `detalle` del API.
 */

export const CLAVE_PRECIERRE_VUELOS_SIN_FACTURA = "vuelos_cobrados_sin_factura";

/**
 * «Resolver →» del renglón: Facturas emitidas, en la sección «Por facturar»
 * (ancla `#por-facturar`, 15-oct-2026: ahí se resaltan en ámbar los vuelos del
 * renglón; el foco del pre-cierre se anexa ANTES del `#`).
 */
export function hrefPrecierreVuelosSinFactura(): string {
  return "/admin/facturas-emitidas#por-facturar";
}

/** Chip del vuelo tal como lo manda el API (todo opcional por tolerancia). */
export interface VueloSinFacturaPrecierre {
  id: string;
  folio: number;
  fecha_vuelo?: string | null;
  matricula?: string | null;
  solicitada?: boolean | null;
  cuentas?: string[] | null;
  estado?: string | null;
  /**
   * FACTURAS POR COBRO (16-oct-2026, API 0.0.82): el vuelo YA tiene factura
   * («A-0420») pero `cobros_sin_factura` de sus cobros que exigen factura no
   * están amparados por ninguna. Ausentes = el caso de siempre (sin factura).
   */
  registrada?: string | null;
  cobros_sin_factura?: number | null;
}

/** «3 cobros sin factura» / «1 cobro sin factura» (chip del pre-cierre). */
export function textoCobrosSinFacturaPrecierre(n: number): string {
  return n === 1 ? "1 cobro sin factura" : `${n} cobros sin factura`;
}

export interface ChipVueloSinFactura {
  texto: string;
  href: string;
  title: string;
}

/**
 * «#341 (HSBC Pesos · pedida)» / «#430 (CANCELADO · HSBC Pesos)». Lleva a la
 * card de COBROS del vuelo, donde la burbuja dice «Factura obligatoria…» y
 * ofrece «Necesito factura» / «Registrar factura» con el vuelo ya elegido.
 */
export function chipVueloSinFactura(v: VueloSinFacturaPrecierre): ChipVueloSinFactura {
  const cancelado = v.estado === "CANCELADO";
  const cuentas = (v.cuentas ?? []).map((c) => c.trim()).filter(Boolean);
  const folio = v.folio > 0 ? `#${v.folio}` : "vuelo";
  const avion = v.matricula?.trim() ? ` · ${v.matricula.trim()}` : "";
  // Ya tiene factura, pero no ampara todos sus cobros (API 0.0.82):
  // «#332 (A-0420 · 3 cobros sin factura · Scotiabank Pesos)».
  const registrada = v.registrada?.trim();
  if (registrada) {
    const n = Math.max(0, Math.trunc(Number(v.cobros_sin_factura) || 0));
    const partes = [
      ...(cancelado ? ["CANCELADO"] : []),
      registrada,
      ...(n > 0 ? [textoCobrosSinFacturaPrecierre(n)] : []),
      ...cuentas,
    ];
    const cuantos = n > 0 ? `${n} de sus cobros que exigen factura no están` : "alguno de sus cobros que exigen factura no está";
    return {
      texto: `${folio} (${partes.join(" · ")})`,
      href: `/admin/flights/${v.id}#cobros`,
      title: `Ya tiene factura, pero ${cuantos} amparados por ninguna${avion}. Asígnala desde cada cobro o registra la que falta.`,
    };
  }
  const partes = [
    ...(cancelado ? ["CANCELADO"] : []),
    ...cuentas,
    ...(v.solicitada === true ? ["pedida"] : []),
  ];
  const texto = partes.length > 0 ? `${folio} (${partes.join(" · ")})` : folio;
  const donde = cuentas.length > 0 ? `Cobro en ${cuentas.join(" y ")}` : "Cobro en una cuenta que exige factura";
  const que = cancelado
    ? "Vuelo cancelado: regístrala directo en Facturas emitidas."
    : v.solicitada === true
      ? "Ya está en «Por facturar»: falta registrarla en Facturas emitidas."
      : "Pídela con «Necesito factura» o regístrala en Facturas emitidas.";
  return {
    texto,
    href: `/admin/flights/${v.id}#cobros`,
    title: `${donde} sin factura registrada${avion}. ${que}`,
  };
}
