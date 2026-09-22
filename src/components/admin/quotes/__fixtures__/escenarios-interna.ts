import type { QuoteSheetInternaProps } from "@/components/admin/quotes/quote-sheet-interna";
import type { QuoteBreakdown } from "@/types/quote";
import type { CotizacionInterna } from "@/types/quotes-interno";
import payload070 from "./interna-070.payload.json";
import payload311 from "./interna-311.payload.json";
import payload329 from "./interna-329.payload.json";

/**
 * ESCENARIOS de la HOJA INTERNA (Fase 2.2, 22-sep-2026). Por cada
 * `interna-<nombre>.payload.json` (`CotizacionInternaPdfRequest` con el que
 * pyservices generó `interna-<nombre>.html` vía `npm run
 * gen:hoja-interna-fixture`), las props con las que `QuoteSheetInterna` debe
 * decir EXACTAMENTE lo mismo.
 *
 * El payload viaja DOS veces a propósito:
 *  - como `interno` (lo que el panel LEE de `GET /v1/quotes/:id/interno`:
 *    quién cotizó, piloto, avión utilizado, cobros, notas internas);
 *  - convertido a `breakdown` (lo que el motor devuelve en vivo mientras se
 *    teclea: tramos costeados, TUAS, IVA, totales).
 * Así el fixture y la pantalla no pueden divergir por una copia mal hecha: si
 * el API cambia un número, cambia en los dos lados a la vez.
 *
 * PARIDAD DE DATOS, NO DE BYTES (decisión del diseño): el documento interno
 * es un formulario denso con controles en casi cada celda, así que exigir
 * igualdad de secuencia tag+clase en EDICIÓN obligaría a que cada input
 * invisible tuviera espejo en el PDF. Lo que se custodia es que los NÚMEROS y
 * los TEXTOS coincidan, y la secuencia de tags+clases en LECTURA.
 */

const AEROPUERTOS = [
  { iata: "CUN", nombre: "Cancún", latitud: 21.0365, longitud: -86.8771 },
  { iata: "CZM", nombre: "Cozumel", latitud: 20.5224, longitud: -86.9256 },
  { iata: "HOL", nombre: "Holbox", latitud: 21.5216, longitud: -87.3796 },
  { iata: "MID", nombre: "Mérida", latitud: 20.937, longitud: -89.6577 },
];

const AERONAVES = [
  { id: "a1", matricula: "XA-VGV", modelo: "Piper Seneca V", asientos: 6 },
  { id: "a2", matricula: "N990GG", modelo: "Seneca V", asientos: 6 },
];

const CLIENTES = [
  { id: "c1", nombre: "Cliente Demo S.A." },
  { id: "c2", nombre: "Grupo Mérida" },
];

/** El payload del PDF interno tipado como lo que devuelve `/interno`. */
const interno = (p: unknown): CotizacionInterna => p as unknown as CotizacionInterna;

/**
 * `breakdown` EQUIVALENTE al payload: mismos números, la forma que devuelve
 * `POST /v1/quotes/calculate` (incluidos los ADITIVOS del API 0.0.27 que
 * alimentan las columnas TIEMPO/COSTO POR HORA/TOTAL y el pie de la tabla).
 */
function breakdownDe(p: CotizacionInterna): QuoteBreakdown {
  const av = AERONAVES.find((a) => a.matricula === p.aeronave_cotizada_matricula) ?? AERONAVES[0];
  return {
    aeronave: {
      id: av.id,
      matricula: av.matricula,
      modelo: av.modelo,
      pais_registro: "MX",
      velocidad_crucero_kts: 180,
    },
    ruta: {
      id: null,
      origen_iata: p.tramos_cotizados[0]?.origen_iata ?? "CUN",
      destino_iata: p.tramos_cotizados[p.tramos_cotizados.length - 1]?.destino_iata ?? "CUN",
      millas_nauticas_base: 0,
      millas_nauticas_totales: p.tramos_cotizados.reduce((a, t) => a + (t.millas ?? 0), 0),
      es_redondo_auto: false,
      num_aterrizajes: p.tramos_cotizados.length,
      escalas: null,
    },
    tiempos: {
      vuelo_hr: p.vuelo_hr ?? 0,
      calzos_hr: p.calzos_hr ?? 0,
      sobrevuelo_hr: p.sobrevuelo_hr ?? 0,
      cobrable_hr: p.tiempo_cobrable_hr ?? 0,
      cobrable_proviene_de_override: p.cobrable_override,
      minimo_hora_aplicado: p.hora_minima_aplicada,
    },
    tarifa: {
      tipo: "PUBLICO",
      usd_por_hora: p.tarifa_hora_usd ?? 0,
      proviene_de_override: p.tarifa_override,
      preferencial_cliente: p.tarifa_preferencial,
    },
    tuas: {
      usd_pax_default: 25,
      pasajeros: p.pasajeros,
      origen: { iata: "CUN", aplica: true, usd_pax: 25, monto_pax: 25, moneda: "USD", razon: "catálogo" },
      destino: { iata: "CUN", aplica: true, usd_pax: 25, monto_pax: 25, moneda: "USD", razon: "catálogo" },
      aeropuertos: p.tuas_cobradas.map((t) => ({
        iata: t.iata,
        aplica: true,
        usd_pax: t.unitario,
        monto_pax: t.unitario,
        moneda: t.moneda as "USD" | "MXN",
        razon: "catálogo",
      })),
      filas: p.tuas_cobradas.map((t) => ({
        iata: t.iata,
        aplica: true,
        moneda: t.moneda as "USD" | "MXN",
        monto_pax: t.unitario,
        usd_pax: t.total_usd / (t.pax || 1),
        pax: t.pax,
        total_nativo: t.total_nativo,
        total_usd: t.total_usd,
        tc_aplicado: t.tc_aplicado,
        razon: "catálogo",
      })),
      total_usd: p.tuas_usd,
    },
    tramos: p.tramos_cotizados.map((t) => ({
      orden: t.orden,
      origen: t.origen_iata,
      destino: t.destino_iata,
      millas: t.millas ?? 0,
      pasajeros: t.pax ?? 0,
      es_ferry: t.es_ferry,
      tiempo_hr: t.tiempo_hr,
      tuas_usd: t.tuas_usd,
      requiere_pernocta: t.pernocta,
      pernocta_usd: t.pernocta_usd,
      tipo_parada: "NORMAL",
      servicio_notas: null,
      // ADITIVOS del API 0.0.27: la columna del Excel, sin multiplicar aquí.
      tarifa_usd_hr: t.tarifa_hora_usd,
      tiempo_hhmm: t.tiempo_hhmm,
      total_usd: t.total_usd,
    })),
    extras: null,
    desglose: p.lineas.map((l) => ({
      clave: l.clave,
      concepto: l.concepto,
      monto_usd: l.monto_usd,
    })),
    iva: {
      aplica_por_metodo_pago: p.iva_usd > 0,
      porcentaje: p.iva_pct / 100,
      base_usd: p.iva_base_usd ?? 0,
      monto_usd: p.iva_usd,
      nota: p.iva_nota ?? "",
    },
    totales: {
      subtotal_vuelo_usd: p.subtotal_vuelo_usd,
      tuas_total_usd: p.tuas_usd,
      viaticos_pernocta_usd: p.viaticos_pernocta_usd,
      extras_total_usd: p.extras_total_usd,
      ajuste_final_usd: p.ajuste_final_usd,
      iva_usd: p.iva_usd,
      total_usd: p.total_usd,
      total_mxn: p.total_mxn,
      // Σ de los renglones capturados en PESOS (TUAS y extras en MXN): el
      // documento interno los nombra en «Total MXN» porque NO pasaron por el
      // T.C. y sin eso el total en pesos no cuadra.
      mxn_nativos: p.mxn_nativos ?? undefined,
    },
    meta: {
      calculado_at: p.calculado_at ?? "",
      version_motor: p.version_motor ?? "",
      comision_vendedor_usd: p.comision_vendedor_usd || null,
      comision_vendedor_modo: (p.comision_vendedor_modo as "FIJA" | "POR_HORA" | null) ?? null,
      comision_vendedor_tarifa_hr: p.comision_vendedor_tarifa_hr,
      comision_vendedor_nombre: p.comision_vendedor_nombre,
    },
    tramos_total_usd: p.tramos_total_usd,
    tramos_tiempo_total_hr: p.tramos_tiempo_total_hr,
    tramos_tiempo_total_hhmm: p.tramos_tiempo_total_hhmm,
    tramos_ajuste_usd: p.tramos_ajuste_usd,
    tramos_ajuste_motivo: p.tramos_ajuste_motivo,
  } as QuoteBreakdown;
}

/** Props con las que la hoja debe decir lo mismo que `interna-<nombre>.html`. */
function escenario(p: CotizacionInterna, clienteId: string): QuoteSheetInternaProps {
  const b = breakdownDe(p);
  const av = AERONAVES.find((a) => a.matricula === p.aeronave_cotizada_matricula) ?? AERONAVES[0];
  return {
    valores: {
      cliente_id: clienteId,
      aeronave_id: av.id,
      pasajeros: p.pasajeros,
      // Pared Cancún: el día del vuelo del payload con una hora operativa. El
      // REGRESO cae en `fecha_vuelo_fin` cuando el viaje es de varios días
      // (el papel imprime «al 15 jul 2026» en la tarjeta de la fecha).
      fecha_vuelo: `${p.fecha_vuelo}T09:00`,
      fecha_traslado_final: `${p.fecha_vuelo_fin ?? p.fecha_vuelo}T18:00`,
      escalas: p.tramos_cotizados.map((t) => ({
        origen_iata: t.origen_iata,
        destino_iata: t.destino_iata,
        millas_nauticas: t.millas ?? 0,
        pasajeros: t.pax,
        es_ferry: t.es_ferry,
        requiere_pernocta: t.pernocta,
        // El COSTO de la pernocta se marca en la celda de la ruta
        // («pernocta $150.00»), igual que en el papel.
        pernocta_costo_usd: t.pernocta_usd ?? null,
        pdf_fecha: t.fecha,
      })),
      tuas_lineas: [],
      cobrar_tuas: true,
      extras: [],
      descuento_usd: null,
      iva_pct_override: null,
      tc_usd_mxn: p.tc_usd_mxn,
      notas: p.notas_cliente ?? "",
      pdf_mostrar_tarifa: false,
      pdf_mostrar_itinerario: true,
      es_externo: false,
      avion_externo_modelo: "",
      avion_externo_matricula: "",
    },
    onCambio: () => undefined,
    breakdown: b,
    documento: {
      folio: p.folio,
      fechaCotizacion: p.fecha,
      tipo: p.tipo ?? "",
      clienteNombre: p.cliente,
      matricula: p.aeronave_cotizada_matricula,
    },
    catalogos: { clientes: CLIENTES, aeronaves: AERONAVES, aeropuertos: AEROPUERTOS },
    // Revisión: la fecha por tramo sale del payload (`pdf_fecha`).
    tramosPdf: { fechaPdf: (_i, l) => l.pdf_fecha ?? null },
    interno: p,
    papel: false,
    escala: 1,
  };
}

export const ESCENARIOS_INTERNA: Record<string, () => QuoteSheetInternaProps> = {
  /** #329: 3 tramos, horas PACTADAS (ajuste +$412.50), TUA cobrada, 1 cobro. */
  "interna-329": () => escenario(interno(payload329), "c1"),
  /** #311: 2 tramos, sin ajuste, sin TUAS, sin cobros, IVA 0 (efectivo). */
  "interna-311": () => escenario(interno(payload311), "c2"),
  /**
   * #70: el documento COMPLETO — los renglones que solo existen en el papel
   * interno y que ningún otro escenario tocaba (revisión adversaria,
   * 22-sep-2026): COMISIÓN DEL VENDEDOR con su concepto canónico («Comisión
   * del vendedor (Saab) · $50.00/hr × 2 hr», 35 de 231 cotizaciones en prod),
   * AJUSTE positivo rotulado «Redondeo» (17 de 231), PERNOCTA con su «(sin
   * IVA)» que activa la partición de exentos, TUA en PESOS con su T.C. y, con
   * ella, `mxn_nativos` en la fila «Total MXN» (14 de 231), un tramo FERRY y
   * un cobro en MXN con comisión de terminal (columna «Equiv. USD»).
   */
  "interna-070": () => escenario(interno(payload070), "c2"),
};
