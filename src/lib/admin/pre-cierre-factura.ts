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

/** «Resolver →» del renglón: Facturas emitidas («Registrar factura» y «Por facturar»). */
export function hrefPrecierreVuelosSinFactura(): string {
  return "/admin/facturas-emitidas";
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
  const partes = [
    ...(cancelado ? ["CANCELADO"] : []),
    ...cuentas,
    ...(v.solicitada === true ? ["pedida"] : []),
  ];
  const folio = v.folio > 0 ? `#${v.folio}` : "vuelo";
  const texto = partes.length > 0 ? `${folio} (${partes.join(" · ")})` : folio;
  const donde = cuentas.length > 0 ? `Cobro en ${cuentas.join(" y ")}` : "Cobro en una cuenta que exige factura";
  const avion = v.matricula?.trim() ? ` · ${v.matricula.trim()}` : "";
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
