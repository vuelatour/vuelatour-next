import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * IVA MANUAL AL REABRIR — el cableado del cotizador (14-oct-2026, #341).
 *
 * La REGLA vive y se prueba en `lib/admin/iva.ts` (`__tests__/iva.test.ts`).
 * Aquí se monta `QuoteCalculator` COMPLETO en revisión con la #341 de
 * producción (podada) y se lee lo que de verdad sale del componente:
 *
 *  - los DEFAULTS del formulario (los `valores` que recibe la hoja interna en
 *    el primer render, que son los de `useForm({ defaultValues })`);
 *  - el payload que arma `armarCalcPayload` con esos defaults (con el form
 *    limpio va a `useQuotePreviewHtml` en el MISMO render; al primer cambio,
 *    `/calculate` y `revise` reciben ese mismo cuerpo con el cambio encima).
 *
 * Para REPRODUCIR el defecto con el componente real, `ivaOverrideRehidratado`
 * se envuelve en un mock conmutable que, con `modo.reglaVieja`, devuelve la
 * expresión que tenía el cotizador antes del arreglo (copiada tal cual). Sin
 * la bandera delega en la implementación REAL.
 *
 * Revisión del 14-oct-2026: un externo SIN cotizar (sin snapshot) con el
 * método fijado en «Editar» abre su PRIMERA cotización con el IVA del método.
 * `modo.columnasSinSnapshot` reproduce la primera versión del arreglo, que
 * leía las columnas sin snapshot y la arrancaba con «IVA 0 % manual».
 */

const modo = vi.hoisted(() => ({
  reglaVieja: false,
  /** La rehidratación ANTES del 14-oct-2026, carácter por carácter. */
  viejo: (q: {
    calculo_snapshot?: { iva?: { aplica_por_metodo_pago?: boolean | null } | null } | null;
    iva_pct?: unknown;
  }): number | null =>
    q.calculo_snapshot?.iva?.aplica_por_metodo_pago === false && Number(q.iva_pct) > 0
      ? Number(q.iva_pct)
      : null,
  /**
   * La PRIMERA versión del arreglo (14-oct-2026, corregida en la revisión
   * del mismo día): sin snapshot leía `iva_pct` + `metodo_cobro`, así que el
   * 0 de default de la columna se volvía «IVA manual 0 %».
   */
  columnasSinSnapshot: false,
}));

/** Lo que el cotizador entrega en el render: defaults del form y payload. */
const capturas = vi.hoisted(() => ({
  valores: [] as Record<string, unknown>[],
  payloads: [] as (Record<string, unknown> | null)[],
}));

vi.mock("@/lib/admin/iva", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/iva")>();
  type Persistido = Parameters<typeof real.ivaOverrideRehidratado>[0];
  /** `modo.columnasSinSnapshot`: el cuerpo de esa versión, copiado tal cual. */
  const deColumnas = (q: Persistido): number | null => {
    if (!q) return null;
    const iva = q.calculo_snapshot?.iva ?? null;
    const pct = real.normalizarIvaPct(iva?.porcentaje) ?? real.normalizarIvaPct(q.iva_pct);
    if (pct === null) return null;
    const aplicaPorMetodo =
      typeof iva?.aplica_por_metodo_pago === "boolean"
        ? iva.aplica_por_metodo_pago
        : real.metodoLlevaIva(q.metodo_cobro);
    const porDefault = aplicaPorMetodo ? real.IVA_DEFAULT : 0;
    return real.mismoIvaPct(pct, porDefault) ? null : pct;
  };
  return {
    ...real,
    ivaOverrideRehidratado: (q: Persistido) =>
      modo.reglaVieja
        ? q
          ? modo.viejo(q)
          : null
        : modo.columnasSinSnapshot
          ? deColumnas(q)
          : real.ivaOverrideRehidratado(q),
  };
});
vi.mock("@/hooks/use-quote-preview-html", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/use-quote-preview-html")>();
  return {
    ...real,
    useQuotePreviewHtml: ({ payload }: { payload: Record<string, unknown> | null }) => {
      capturas.payloads.push(payload);
      return { html: null, estado: "faltan_datos", error: null, noDisponible: false, reintentar: () => {} };
    },
  };
});
vi.mock("@/components/admin/quotes/quote-sheet-interna", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/admin/quotes/quote-sheet-interna")>();
  const { createElement } = await import("react");
  return {
    ...real,
    QuoteSheetInterna: (props: Parameters<typeof real.QuoteSheetInterna>[0]) => {
      capturas.valores.push({ ...props.valores });
      return createElement(real.QuoteSheetInterna, props);
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/quotes/q-341",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/quotes/actions", () => ({
  createQuoteAction: async () => ({ ok: false, error: "mock" }),
  reviseQuoteAction: async () => ({ ok: false, error: "mock" }),
  getRutasSugeridasAction: async () => ({ ok: true, data: [] }),
  setQuotePdfPresentacionAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/app/admin/routes/actions", () => ({
  createRouteAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  solicitarFacturaAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/app/admin/clients/actions", () => ({
  updateClientAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/app/admin/distancias/actions", () => ({
  getDistanciasAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/airports/actions", () => ({
  createAirportAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/lib/api/quotes-browser", () => ({
  abrirPdfCotizacion: async () => {},
  calculateQuote: async () => {
    throw new Error("mock");
  },
}));

import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { ivaDefaultDeMetodo } from "@/lib/admin/iva";
import type { MetodoPago } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { AircraftOption, AirportOption, RouteOption } from "@/components/admin/quotes/quote-form-types";

// ---------- La cotización #341 de producción, podada ----------
// N990GG (Seneca V) · CUN→CZM→CUN, 4 pax · tarifa pactada $900/hr × 0.83333 h
// = $750.00 + «Espera» $50.00 = $800.00 · método previsto TRANSFERENCIA con el
// IVA puesto A MANO en 0 % · T.C. 17.5 ⇒ $14,000.00 MXN, cobrados EXACTOS.
// (En prod la operación lleva 5 pax por tramo; aquí no importa y se omite.)

const AV = { id: "av-341", matricula: "N990GG", modelo: "Seneca V", asientos: 5 };
const aircraft = [
  {
    id: AV.id,
    matricula: AV.matricula,
    modelo: AV.modelo,
    pais_registro: "USA",
    velocidad_crucero_kts: 150,
    asientos: AV.asientos,
    tarifa_hora_pub_usd: 1050,
    tarifa_hora_broker_usd: 950,
  },
] as AircraftOption[];
const airports: AirportOption[] = [
  { iata: "CUN", nombre: "Cancún", latitud: 21.0365, longitud: -86.8771 },
  { iata: "CZM", nombre: "Cozumel", latitud: 20.5224, longitud: -86.9256 },
];
const comun = { aircraft, routes: [] as RouteOption[], airports };

const TRAMOS = [
  { orden: 1, origen_iata: "CUN", destino_iata: "CZM", millas_nauticas: 30, salida: "2026-09-27T14:00:00.000Z" },
  { orden: 2, origen_iata: "CZM", destino_iata: "CUN", millas_nauticas: 30, salida: "2026-09-27T23:00:00.000Z" },
];
const ESPERA = { concepto: "Espera", monto_usd: 50, moneda: "USD", monto_nativo: 50, tc_aplicado: null, aplica_iva: true };
const tua = (iata: string) => ({
  iata,
  razon: `TUAS aplica: N en ${iata}`,
  aplica: true,
  moneda: "USD",
  usd_pax: 0,
  monto_pax: 0,
  tc_aplicado: null,
});

/** IVA de la cotización: método previsto y % aplicado (fracción). */
interface IvaCaso {
  metodo: MetodoPago;
  porcentaje: number;
}

function quote341({ metodo, porcentaje }: IvaCaso = { metodo: "TRANSFERENCIA", porcentaje: 0 }): PersistedQuote {
  const base = 800;
  const ivaUsd = Math.round(base * porcentaje * 100) / 100;
  const total = base + ivaUsd;
  return {
    id: "q-341",
    folio: 341,
    cliente_id: "cli-341",
    aeronave_id: AV.id,
    piloto_id: null,
    ruta_id: null,
    tipo: "MULTIESCALA",
    estado: "COMPLETADO",
    es_externo: false,
    operador_externo: null,
    costo_externo_usd: null,
    cotizacion_version: 2,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_one_way: "60",
    es_redondo_auto: false,
    num_aterrizajes: 2,
    pasajeros: 4,
    pase_abordar: false,
    tiempo_cobrable_hr: "0.83333000",
    tarifa_tipo: "BROKER",
    tarifa_hora_usd: "900.000000",
    subtotal_vuelo_usd: "750.00",
    tuas_usd: "0.00",
    // `decimal(6,4)`: PostgREST la manda como CADENA.
    iva_pct: porcentaje.toFixed(4),
    iva_usd: ivaUsd.toFixed(2),
    monto_total_usd: total.toFixed(2),
    viaticos_pernocta_usd: "0.00",
    extras_total_usd: "50.00",
    ajuste_final_usd: "0.00",
    tc_usd_mxn: "17.500000",
    monto_total_mxn: (total * 17.5).toFixed(2),
    metodo_cobro: metodo,
    pago_anticipado_req: false,
    cotizacion_abierta: false,
    pdf_mostrar_tarifa: false,
    pdf_mostrar_itinerario: true,
    itinerario_operativo: false,
    extras: [ESPERA],
    fecha_solicitud: "2026-09-24T18:50:00.000Z",
    fecha_vuelo: "2026-09-27T14:00:00Z",
    fecha_traslado_final: null,
    fecha_fin: null,
    estado_permiso: "no_aplica",
    fecha_confirmacion: null,
    fecha_cancelacion: null,
    motivo_cancelacion: null,
    google_calendar_id: null,
    facturado: false,
    cobrado: true,
    notas: null,
    notas_internas: null,
    calculo_snapshot: {
      aeronave: {
        id: AV.id,
        matricula: AV.matricula,
        modelo: AV.modelo,
        pais_registro: "USA",
        velocidad_crucero_kts: 150,
      },
      ruta: {
        id: null,
        origen_iata: "CUN",
        destino_iata: "CUN",
        millas_nauticas_base: 60,
        millas_nauticas_totales: 60,
        es_redondo_auto: false,
        num_aterrizajes: 2,
        escalas: TRAMOS.map((t) => ({
          origen_iata: t.origen_iata,
          destino_iata: t.destino_iata,
          millas_nauticas: t.millas_nauticas,
          pasajeros: 4,
          pasajeros_nombres: [],
          es_ferry: false,
          requiere_pernocta: false,
          pernocta_costo_usd: 0,
          tipo_parada: "NORMAL",
          servicio_notas: null,
          notas: null,
          fecha_salida_plan: t.salida,
        })),
      },
      tiempos: {
        vuelo_hr: 0.4,
        calzos_hr: 0.3,
        sobrevuelo_hr: 0,
        cobrable_hr: 0.83333,
        cobrable_hr_regla: 1,
        minimo_hora_aplicado: false,
        cobrable_proviene_de_override: true,
      },
      tarifa: { tipo: "BROKER", usd_por_hora: 900, proviene_de_override: true, preferencial_cliente: false },
      tuas: {
        usd_pax_default: 0,
        pasajeros: 4,
        origen: tua("CUN"),
        destino: tua("CZM"),
        intermedios: [],
        aeropuertos: [tua("CUN"), tua("CZM")],
        filas: [],
        lineas_capturadas: [],
        total_usd: 0,
        total_mxn_nativo: 0,
      },
      tramos: TRAMOS.map((t) => ({
        orden: t.orden,
        origen: t.origen_iata,
        destino: t.destino_iata,
        millas: t.millas_nauticas,
        pasajeros: 4,
        es_ferry: false,
        tiempo_hr: 0.35,
        tuas_usd: 0,
        total_usd: 315,
        tarifa_usd_hr: 900,
        tipo_parada: "NORMAL",
        requiere_pernocta: false,
        pernocta_usd: 0,
      })),
      extras: [ESPERA],
      desglose: [
        { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo · 0.8333 hr × $900/hr", monto_usd: 750 },
        { clave: "EXTRA", concepto: "Espera", monto_usd: 50 },
        ...(ivaUsd > 0 ? [{ clave: "IVA", concepto: "IVA", monto_usd: ivaUsd }] : []),
      ],
      iva: {
        // La marca que graba el motor (los métodos bancarios facturables).
        aplica_por_metodo_pago: ["TRANSFERENCIA", "HSBC_LINK", "CHEQUE"].includes(metodo),
        porcentaje,
        base_usd: base,
        monto_usd: ivaUsd,
        nota: "",
      },
      totales: {
        subtotal_vuelo_usd: 750,
        tuas_total_usd: 0,
        viaticos_pernocta_usd: 0,
        extras_total_usd: 50,
        ajuste_final_usd: 0,
        iva_usd: ivaUsd,
        total_usd: total,
        total_mxn: Math.round(total * 17.5 * 100) / 100,
        mxn_nativos: 0,
      },
      meta: {
        calculado_at: "2026-09-24T19:04:23.339Z",
        version_motor: "1.3.1",
        redondeo_automatico: false,
        descuento_usd: null,
        total_pactado_usd: null,
        comision_billpocket_pct: null,
        comision_vendedor_modo: null,
        comision_vendedor_usd: null,
        comision_vendedor_tarifa_hr: null,
        comision_vendedor_nombre: null,
      },
    },
    escalas: TRAMOS.map((t) => ({
      id: `e${t.orden}`,
      vuelo_id: "q-341",
      orden: t.orden,
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: String(t.millas_nauticas),
      pasajeros: 4,
      es_ferry: false,
      requiere_pernocta: false,
      pernocta_costo_usd: null,
      tipo_parada: "NORMAL",
      servicio_notas: null,
      solo_operativa: false,
      fecha_salida_plan: t.salida,
      taco_salida: null,
      taco_llegada: null,
      hora_salida: null,
      hora_llegada: null,
      notas: null,
      cancelada_at: null,
    })),
  } as unknown as PersistedQuote;
}

/**
 * Externo que NUNCA pasó por el motor (revisión del 14-oct-2026), como queda
 * la RESERVA #398 de prod tras «Cubrir con externo» (`cubrirConExterno`
 * suelta el avión propio y no toca método, IVA ni snapshot) y «Editar» →
 * Método de cobro previsto (`metodoCobroEditable`: externo SIN snapshot). Las
 * columnas de dinero son los ceros con los que `createReserva` inserta; los
 * tramos son los de la #341 (con ellos `armarCalcPayload` arma el cuerpo
 * real).
 */
function externoSinCotizar(metodo: MetodoPago | null = "TRANSFERENCIA"): PersistedQuote {
  return {
    ...quote341(),
    estado: "RESERVA",
    es_externo: true,
    operador_externo: "Operador externo",
    aeronave_id: null,
    cotizacion_version: 1,
    tiempo_cobrable_hr: "0.00000000",
    tarifa_tipo: "PUBLICO",
    tarifa_hora_usd: "0.000000",
    subtotal_vuelo_usd: "0.00",
    iva_pct: "0.0000",
    iva_usd: "0.00",
    monto_total_usd: "0.00",
    extras_total_usd: "0.00",
    tc_usd_mxn: null,
    monto_total_mxn: null,
    metodo_cobro: metodo,
    extras: [],
    cobrado: false,
    calculo_snapshot: null,
  } as unknown as PersistedQuote;
}

/**
 * Abre la cotización como la abre quien tiene el permiso de editar una
 * cotización cobrada (la #341 lo está) y devuelve lo que salió del render.
 * `conCobros: false` = un vuelo sin cobros (sin la banda de edición).
 */
function abrir(q: PersistedQuote, rol: "ADMIN" | "SOCIO" = "ADMIN", { conCobros = true } = {}) {
  capturas.valores.length = 0;
  capturas.payloads.length = 0;
  const html = renderToStaticMarkup(
    <QuoteCalculator
      mode="revise"
      {...comun}
      rol={rol}
      initialQuote={q}
      clientName="Cliente de la #341"
      edicionConCobros={
        conCobros ? { cobradoUsd: Number(q.monto_total_usd), cobrosSinTc: 0 } : undefined
      }
    />,
  );
  return { html, valores: capturas.valores.at(-1), payload: capturas.payloads.at(-1) };
}

/**
 * Lo que el MOTOR aplica con ese payload: el override si viaja —INCLUIDO el
 * 0— y, si no, el default del método (espejo de `quotes.service.ts`, cuya
 * forma congela la paridad de `lib/admin/__tests__/iva.test.ts`).
 */
function ivaDelMotor(payload: Record<string, unknown> | null | undefined): number {
  const override = payload?.iva_pct_override;
  return override !== undefined ? Number(override) : ivaDefaultDeMetodo(String(payload?.metodo_pago));
}

/**
 * Total del motor para la #341 con ese % de IVA: base gravable $800.00 (el
 * tiempo y la «Espera» llevan IVA; no hay pernocta ni exentos) + IVA a 2
 * decimales. SOLO para leer el defecto en dólares: el panel jamás calcula.
 */
const totalMotor341 = (pct: number) => 800 + Math.round(800 * pct * 100) / 100;

/** El renglón del IVA de la hoja dice «manual» (`quote-sheet-desglose.tsx`). */
const MARCA_IVA_MANUAL = 'title="IVA forzado a mano (vacío = según método de pago)"';

afterEach(() => {
  modo.reglaVieja = false;
  modo.columnasSinSnapshot = false;
});

describe("#341 — transferencia con IVA manual 0 % (cobrada exacta: $800.00 / $14,000.00 MXN)", () => {
  it("ANTES (regla vieja, reproducido): el form arranca SIN override, el payload no lo lleva y el motor vuelve al 16 %", () => {
    modo.reglaVieja = true;
    const { valores, payload, html } = abrir(quote341());
    expect(valores?.iva_pct_override).toBeNull();
    // Es el cuerpo REAL de `armarCalcPayload` (no el respaldo mínimo): trae los tramos.
    expect(payload?.escalas).toHaveLength(2);
    expect(payload).toMatchObject({ metodo_pago: "TRANSFERENCIA", tc_usd_mxn: 17.5 });
    expect(payload).not.toHaveProperty("iva_pct_override");
    // Al primer cambio (teclear el T.C.) ese cuerpo va a `/calculate`: 16 %.
    expect(ivaDelMotor(payload)).toBe(0.16);
    expect(totalMotor341(ivaDelMotor(payload))).toBe(928);
    // …y la hoja no avisa nada: el IVA no se ve como «manual».
    expect(html).not.toContain(MARCA_IVA_MANUAL);
  });

  it("los DEFAULTS del formulario ya traen el override 0 (no null)", () => {
    const { valores } = abrir(quote341());
    expect(valores).toBeDefined();
    expect(valores?.iva_pct_override).toBe(0);
    expect(valores?.metodo_pago).toBe("TRANSFERENCIA");
    expect(valores?.tc_usd_mxn).toBe(17.5);
  });

  it("`armarCalcPayload` lo MANDA (el 0 viaja) y el motor recompone el MISMO total", () => {
    const { payload } = abrir(quote341());
    expect(payload?.escalas).toHaveLength(2);
    expect(payload).toMatchObject({
      quote_id: "q-341",
      sucio: false,
      metodo_pago: "TRANSFERENCIA",
      tc_usd_mxn: 17.5,
      tarifa_hora_override_usd: 900,
      tiempo_cobrable_override_hr: 0.83333,
      iva_pct_override: 0,
    });
    expect(ivaDelMotor(payload)).toBe(0);
    expect(totalMotor341(ivaDelMotor(payload))).toBe(800);
  });

  it("la hoja interna lo dice: el IVA de la #341 es «manual»", () => {
    const { html } = abrir(quote341());
    expect(html).toContain(MARCA_IVA_MANUAL);
  });

  it("el rol sin hoja interna (SOCIO) arranca con el MISMO payload", () => {
    const { payload } = abrir(quote341(), "SOCIO");
    expect(payload).toHaveProperty("iva_pct_override", 0);
  });
});

describe("lo que ya funcionaba sigue igual", () => {
  it("transferencia al 16 % (el estándar): sin override, el método lo re-resuelve", () => {
    const { valores, payload, html } = abrir(quote341({ metodo: "TRANSFERENCIA", porcentaje: 0.16 }));
    expect(valores?.iva_pct_override).toBeNull();
    expect(payload).not.toHaveProperty("iva_pct_override");
    expect(ivaDelMotor(payload)).toBe(0.16);
    expect(html).not.toContain(MARCA_IVA_MANUAL);
  });

  it("BillPocket con IVA manual 16 %: override 0.16, igual que antes", () => {
    const { valores, payload } = abrir(quote341({ metodo: "BILLPOCKET", porcentaje: 0.16 }));
    expect(valores?.iva_pct_override).toBe(0.16);
    expect(payload).toHaveProperty("iva_pct_override", 0.16);
  });

  it("efectivo al 0 %: sin override", () => {
    const { valores, payload } = abrir(quote341({ metodo: "EFECTIVO", porcentaje: 0 }));
    expect(valores?.iva_pct_override).toBeNull();
    expect(payload).not.toHaveProperty("iva_pct_override");
    expect(ivaDelMotor(payload)).toBe(0);
  });
});

describe("externo SIN cotizar con el método fijado en «Editar» (revisión del 14-oct-2026)", () => {
  it("con la primera versión del arreglo (reproducido): el 0 de default de la columna arrancaba como «IVA 0 % manual» y viajaba al motor", () => {
    modo.columnasSinSnapshot = true;
    const { valores, payload, html } = abrir(externoSinCotizar(), "ADMIN", { conCobros: false });
    expect(valores?.iva_pct_override).toBe(0);
    expect(payload?.escalas).toHaveLength(2);
    expect(payload).toMatchObject({ es_externo: true, metodo_pago: "TRANSFERENCIA", iva_pct_override: 0 });
    // Ese 0 «manual» le quitaba el 16 % a un método facturable (sobre $800.00
    // de base, la v2 se guardaba en $800.00 en vez de $928.00).
    expect(ivaDelMotor(payload)).toBe(0);
    expect(html).toContain(MARCA_IVA_MANUAL);
  });

  it("sin foto del motor no hay IVA que preservar: sin override, el motor pone el 16 % de la transferencia", () => {
    const { valores, payload, html } = abrir(externoSinCotizar(), "ADMIN", { conCobros: false });
    expect(valores?.iva_pct_override).toBeNull();
    expect(valores?.metodo_pago).toBe("TRANSFERENCIA");
    // Es el cuerpo REAL de `armarCalcPayload`: trae los tramos y el externo.
    expect(payload?.escalas).toHaveLength(2);
    expect(payload).toMatchObject({ es_externo: true, metodo_pago: "TRANSFERENCIA" });
    expect(payload).not.toHaveProperty("iva_pct_override");
    expect(ivaDelMotor(payload)).toBe(0.16);
    expect(html).not.toContain(MARCA_IVA_MANUAL);
  });

  it("el MISMO vuelo con el método todavía en null sale igual (el cotizador lo abre en Transferencia)", () => {
    const { valores, payload } = abrir(externoSinCotizar(null), "ADMIN", { conCobros: false });
    expect(valores?.metodo_pago).toBe("TRANSFERENCIA");
    expect(valores?.iva_pct_override).toBeNull();
    expect(payload).not.toHaveProperty("iva_pct_override");
    expect(ivaDelMotor(payload)).toBe(0.16);
  });
});

describe("cableado (fuente)", () => {
  const fuente = readFileSync(path.resolve(__dirname, "..", "quote-calculator.tsx"), "utf8");

  it("los defaults del formulario usan la fuente única y la regla vieja ya no está", () => {
    expect(fuente).toContain('import { ivaOverrideRehidratado } from "@/lib/admin/iva";');
    expect(fuente).toContain("iva_pct_override: ivaOverrideRehidratado(q),");
    expect(fuente).not.toContain("aplica_por_metodo_pago === false");
    expect(fuente).not.toContain("no es distinguible del estándar: ese caso se re-resuelve");
  });
});
