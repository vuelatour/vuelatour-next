import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * LA PANTALLA ENTERA DEL COTIZADOR, rol por rol (revisión adversaria de la
 * Fase 2.3, 22-sep-2026).
 *
 * Los tests de la hoja interna comparan TEXTO y ESTRUCTURA contra los
 * fixtures de pyservices; los del BLOQUE C montan cada pieza por separado.
 * Ninguno monta `QuoteCalculator` COMPLETO, y ahí es donde se esconden los
 * defectos de este rediseño: un control que se mudó al papel y desapareció
 * para el rol que no ve el papel, un id ancla duplicado entre la hoja y su
 * respaldo, un `<details>` que desmonta lo que contiene.
 *
 * Qué se custodia aquí:
 *  1. **Ningún rol pierde un control.** El panel lateral retirado se pintaba
 *     para TODOS los roles; la hoja interna solo la ven `ROLES_HOJA_INTERNA`.
 *     SOCIO tiene los MISMOS controles (mismos ids ancla, mismos campos RHF)
 *     en el `<details>` «Ajustes de la cotización» — `QuoteCapturaBasica`.
 *  2. **Los ids ancla existen y no se duplican** en NINGUNA combinación de
 *     rol × modo × método de cobro: los resuelve `document.getElementById`,
 *     que devuelve el PRIMERO — un duplicado manda el foco al control
 *     equivocado sin avisar.
 *  3. **Plegar no desmonta**: el contenido de cada `<details>` está en el DOM
 *     aunque esté cerrado (riesgo 9 del diseño: un `{abierto && …}` tira los
 *     `register()` y deja las anclas sin destino).
 *  4. **`data-guard-exempt` solo donde NO se edita**: nada de lo exento
 *     contiene un input, un textarea, un select o un `role="switch"`, o la
 *     confirmación única de CONFIRMADO/RESERVA se saltaría entera.
 *  5. **Todo control tiene nombre accesible.**
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/quotes/new",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    info: () => {},
    warning: () => {},
  }),
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
import { QuoteSheet } from "@/components/admin/quotes/quote-sheet";
import { ESCENARIOS_INTERNA } from "@/components/admin/quotes/__fixtures__/escenarios-interna";
import type { MetodoPago } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type {
  AircraftOption,
  AirportOption,
  ClientOption,
  RouteOption,
} from "@/components/admin/quotes/quote-form-types";

// ---------- Datos: la cotización #329 de producción, podada ----------

const AV = { id: "av-329", matricula: "N621TX", modelo: "Kodiak 100", asientos: 9 };
const aircraft = [
  {
    id: AV.id,
    matricula: AV.matricula,
    modelo: AV.modelo,
    pais_registro: "USA",
    velocidad_crucero_kts: 170,
    asientos: AV.asientos,
    tarifa_hora_pub_usd: 1850,
    tarifa_hora_broker_usd: 1650,
  },
];
const airports = [
  { iata: "CUN", nombre: "Cancún", latitud: 21.0365, longitud: -86.8771 },
  { iata: "PCE", nombre: "Playa del Carmen", latitud: 20.6, longitud: -87.07 },
  { iata: "PPS", nombre: "Punta Pájaros", latitud: 19.6, longitud: -87.45 },
  { iata: "MID", nombre: "Mérida", latitud: 20.937, longitud: -89.6577 },
];
const clients = [
  { id: "cli-1", nombre: "Sam Meacham", es_broker: true, es_interno: false, rfc: null },
  { id: "cli-2", nombre: "VuelaTour", es_broker: false, es_interno: true, rfc: null },
];

const TRAMOS = [
  { orden: 1, origen_iata: "CUN", destino_iata: "PCE", millas_nauticas: 27, pasajeros: 0, es_ferry: true },
  { orden: 2, origen_iata: "PCE", destino_iata: "PPS", millas_nauticas: 63, pasajeros: 4, es_ferry: false },
  { orden: 3, origen_iata: "PPS", destino_iata: "CUN", millas_nauticas: 90, pasajeros: 0, es_ferry: true },
];

function quote329(over: Record<string, unknown> = {}): PersistedQuote {
  return {
    id: "q-329",
    folio: 329,
    cliente_id: "cli-1",
    aeronave_id: AV.id,
    piloto_id: null,
    ruta_id: null,
    tipo: "MULTIESCALA",
    estado: "CONFIRMADO",
    es_externo: false,
    operador_externo: null,
    costo_externo_usd: null,
    cotizacion_version: 1,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_one_way: "180",
    es_redondo_auto: false,
    num_aterrizajes: 3,
    pasajeros: 4,
    pase_abordar: false,
    tiempo_cobrable_hr: "1.75",
    tarifa_tipo: "BROKER",
    tarifa_hora_usd: "1650",
    subtotal_vuelo_usd: "2887.5",
    tuas_usd: "100",
    iva_pct: "0.16",
    iva_usd: "478",
    monto_total_usd: "3465.5",
    tc_usd_mxn: "17.5",
    monto_total_mxn: "60646.25",
    metodo_cobro: "TRANSFERENCIA" as MetodoPago,
    pago_anticipado_req: false,
    cotizacion_abierta: false,
    pdf_mostrar_tarifa: false,
    pdf_mostrar_itinerario: true,
    itinerario_operativo: false,
    fecha_solicitud: "2026-09-21T19:16:55.163Z",
    fecha_vuelo: "2026-09-23T13:00:00Z",
    fecha_traslado_final: null,
    fecha_fin: null,
    estado_permiso: "no_aplica",
    fecha_confirmacion: null,
    fecha_cancelacion: null,
    motivo_cancelacion: null,
    google_calendar_id: null,
    facturado: false,
    cobrado: false,
    notas: null,
    notas_internas: null,
    calculo_snapshot: {
      ruta: {
        escalas: TRAMOS.map((t) => ({
          origen_iata: t.origen_iata,
          destino_iata: t.destino_iata,
          millas_nauticas: t.millas_nauticas,
          pasajeros: t.pasajeros,
          pasajeros_nombres: [],
          es_ferry: t.es_ferry,
          requiere_pernocta: false,
          pernocta_costo_usd: 0,
          tipo_parada: "NORMAL",
          servicio_notas: null,
          notas: null,
          fecha_salida_plan: null,
        })),
      },
      aeronave: {
        id: AV.id,
        matricula: AV.matricula,
        modelo: AV.modelo,
        pais_registro: "USA",
        velocidad_crucero_kts: 170,
      },
      tarifa: {
        tipo: "BROKER",
        usd_por_hora: 1650,
        proviene_de_override: false,
        preferencial_cliente: false,
      },
      tiempos: { vuelo_hr: 1.06, calzos_hr: 0.45, sobrevuelo_hr: 0, cobrable_hr: 1.75 },
      tuas: { usd_pax_default: 25, pasajeros: 4, total_usd: 100, aeropuertos: [] },
      extras: [],
      iva: { porcentaje: 0.16, base_usd: 2987.5, monto_usd: 478, aplica: true },
      totales: {
        subtotal_vuelo_usd: 2887.5,
        tuas_usd: 100,
        extras_usd: 0,
        subtotal_usd: 2987.5,
        iva_usd: 478,
        total_usd: 3465.5,
        total_mxn: 60646.25,
      },
      tramos: TRAMOS.map((t) => ({
        orden: t.orden,
        origen: t.origen_iata,
        destino: t.destino_iata,
        millas: t.millas_nauticas,
        pasajeros: t.pasajeros,
        es_ferry: t.es_ferry,
        tiempo_hr: t.millas_nauticas / 170 + 0.15,
        tuas_usd: 0,
      })),
      meta: {},
    },
    escalas: TRAMOS.map((t) => ({
      id: `e${t.orden}`,
      vuelo_id: "q-329",
      orden: t.orden,
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: String(t.millas_nauticas),
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: false,
      pernocta_costo_usd: null,
      tipo_parada: "NORMAL",
      servicio_notas: null,
      solo_operativa: false,
      fecha_salida_plan: null,
      taco_salida: null,
      taco_llegada: null,
      hora_salida: null,
      hora_llegada: null,
      notas: null,
      cancelada_at: null,
    })),
    ...over,
  } as unknown as PersistedQuote;
}

type Caso = { nombre: string; el: () => React.ReactElement };

const comun = {
  aircraft: aircraft as unknown as AircraftOption[],
  routes: [] as RouteOption[],
  airports: airports as AirportOption[],
};

const CASOS: Caso[] = [
  {
    nombre: "alta · ADMIN",
    el: () => <QuoteCalculator mode="create" {...comun} clients={clients as ClientOption[]} rol="ADMIN" />,
  },
  {
    nombre: "#329 · ADMIN",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="ADMIN"
        initialQuote={quote329()}
        clientName="Sam Meacham"
        requiereConfirmacionEdicion
      />
    ),
  },
  {
    nombre: "#329 · COORDINADOR · BillPocket",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="COORDINADOR"
        initialQuote={quote329({ metodo_cobro: "BILLPOCKET" })}
        clientName="Sam Meacham"
      />
    ),
  },
  {
    nombre: "#329 · ADMIN · externo",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="ADMIN"
        initialQuote={quote329({
          es_externo: true,
          operador_externo: "Operador Ajeno",
          avion_externo_modelo: "HAWKER 400",
          avion_externo_matricula: "XA-REG",
        })}
        clientName="Sam Meacham"
      />
    ),
  },
  {
    nombre: "#329 · ADMIN · lectura (cobrada)",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="ADMIN"
        initialQuote={quote329({ cobrado: true })}
        clientName="Sam Meacham"
        bloqueadoRazon="La cotización está cobrada"
      />
    ),
  },
  {
    nombre: "alta · SOCIO",
    el: () => <QuoteCalculator mode="create" {...comun} clients={clients as ClientOption[]} rol="SOCIO" />,
  },
  {
    nombre: "#329 · SOCIO",
    el: () => (
      <QuoteCalculator mode="revise" {...comun} rol="SOCIO" initialQuote={quote329()} clientName="Sam Meacham" />
    ),
  },
  {
    nombre: "#329 · SOCIO · OTRO",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="SOCIO"
        initialQuote={quote329({ metodo_cobro: "OTRO", metodo_cobro_detalle: "PayPal" })}
        clientName="Sam Meacham"
      />
    ),
  },
  {
    nombre: "#329 · SOCIO · BillPocket",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="SOCIO"
        initialQuote={quote329({ metodo_cobro: "BILLPOCKET" })}
        clientName="Sam Meacham"
      />
    ),
  },
  {
    nombre: "#329 · SOCIO · lectura",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="SOCIO"
        initialQuote={quote329({ cobrado: true, notas_internas: "Cliente pide factura" })}
        clientName="Sam Meacham"
        bloqueadoRazon="La cotización está cobrada"
      />
    ),
  },
];

const render = (c: Caso) => renderToStaticMarkup(c.el());

const idsDe = (html: string) => [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);

// ---------- 1. Ningún rol pierde un control ----------

/**
 * Los controles que el panel lateral daba a TODOS los roles. La sonda es el
 * id ancla cuando lo tiene y el texto de la etiqueta cuando no (switches y
 * comisión del vendedor nunca tuvieron id).
 */
const CONTROLES: [string, RegExp][] = [
  ["segmento de tarifa", /\sid="tarifa-tipo-field"/],
  ["sobrevuelo", /\sid="sobrevuelo-field"/],
  ["cobrable pactado", /\sid="cobrable-field"/],
  ["método de cobro", /\sid="metodo-pago-field"/],
  ["redondeo", /\sid="redondeo-field"/],
  ["T.C.", /\sid="tc-usd-mxn-field"/],
  ["comisión del vendedor", /Comisi[oó]n del vendedor|Pago al vendedor/i],
  ["switch «Se cobran TUAS»", /Se cobran (las )?TUAS/i],
  ["switch «Cotización abierta»", /Cotizaci[oó]n abierta/],
  ["switch «Pase de abordar»", /Pase de abordar/],
  ["detalle del motor", /\sid="seccion-detalle"/],
  ["plantilla de ruta", /\sid="plegable-plantilla"/],
  ["toggles del PDF", /\sid="plegable-pdf"/],
];

/**
 * Dos que NO se piden en revisión, y por qué: el **operador externo** solo
 * existe si el vuelo YA es externo (misma condición que tenía el panel:
 * pasar a externo se hace desde el vuelo) y las **notas internas** no viajan
 * en `POST /:id/revise`, así que ahí se LEEN y solo si las hay.
 */
const CONTROLES_ALTA: [string, RegExp][] = [
  ...CONTROLES,
  ["operador externo", /\sid="seccion-externo"/],
  ["ruta operativa del alta", /\sid="seccion-operativa"/],
  ["notas internas", /Notas internas/],
];

const ROLES = ["ADMIN", "COORDINADOR", "FACTURACION", "ANALISTA", "SOCIO"];

describe("el cotizador: ningún rol se queda sin un control", () => {
  for (const rol of ROLES) {
    it(`${rol} tiene los ${CONTROLES.length} controles en revisión editable`, () => {
      const html = renderToStaticMarkup(
        <QuoteCalculator
          mode="revise"
          {...comun}
          rol={rol}
          initialQuote={quote329()}
          clientName="Sam Meacham"
        />,
      );
      const faltan = CONTROLES.filter(([, re]) => !re.test(html)).map(([n]) => n);
      expect(faltan, `${rol} perdió: ${faltan.join(", ")}`).toEqual([]);
    });

    it(`${rol} tiene los ${CONTROLES_ALTA.length} controles en el ALTA`, () => {
      const html = renderToStaticMarkup(
        <QuoteCalculator mode="create" {...comun} clients={clients as ClientOption[]} rol={rol} />,
      );
      const faltan = CONTROLES_ALTA.filter(([, re]) => !re.test(html)).map(([n]) => n);
      expect(faltan, `${rol} perdió: ${faltan.join(", ")}`).toEqual([]);
    });
  }

  it("con el vuelo YA externo, el operador externo se edita en cualquier rol", () => {
    const q = quote329({ es_externo: true, operador_externo: "Operador Ajeno" });
    for (const rol of ROLES) {
      const html = renderToStaticMarkup(
        <QuoteCalculator mode="revise" {...comun} rol={rol} initialQuote={q} clientName="Sam" />,
      );
      expect(html, rol).toContain('id="seccion-externo"');
    }
  });

  it("las notas internas guardadas se LEEN en revisión en cualquier rol", () => {
    const q = quote329({ notas_internas: "Cliente pide factura" });
    for (const rol of ROLES) {
      const html = renderToStaticMarkup(
        <QuoteCalculator mode="revise" {...comun} rol={rol} initialQuote={q} clientName="Sam" />,
      );
      expect(html, rol).toContain("Cliente pide factura");
    }
  });

  it("SOCIO captura en «Ajustes de la cotización», no en el papel interno", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="SOCIO" initialQuote={quote329()} clientName="Sam" />,
    );
    // No ve la hoja interna…
    expect(html).not.toContain("cot-interna");
    // …pero sí el `<details>` con sus controles.
    expect(html).toContain('id="plegable-captura"');
    expect(html).toContain('id="tarifa-tipo-field"');
    // Y se le dice que el guardado lo rechaza el API.
    expect(html).toContain("no guardarla");
  });

  it("ADMIN NO monta «Ajustes de la cotización» (sería duplicar los ids del papel)", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="ADMIN" initialQuote={quote329()} clientName="Sam" />,
    );
    expect(html).toContain("cot-interna");
    expect(html).not.toContain('id="plegable-captura"');
  });

  it("la banda de RUTA OPERATIVA llega también al rol sin hoja interna", () => {
    const q = quote329({ itinerario_operativo: true });
    for (const rol of ["ADMIN", "SOCIO"]) {
      const html = renderToStaticMarkup(
        <QuoteCalculator mode="revise" {...comun} rol={rol} initialQuote={q} clientName="Sam" />,
      );
      expect(html, rol).toContain("Cotizar con estos tramos");
    }
  });

  it("«¿cuál método?» y la comisión de terminal salen con su método, en los dos roles", () => {
    for (const rol of ["ADMIN", "SOCIO"]) {
      const otro = renderToStaticMarkup(
        <QuoteCalculator
          mode="revise"
          {...comun}
          rol={rol}
          initialQuote={quote329({ metodo_cobro: "OTRO", metodo_cobro_detalle: "PayPal" })}
          clientName="Sam"
        />,
      );
      expect(otro, rol).toMatch(/[Cc]u[aá]l m[eé]todo/);
      const bp = renderToStaticMarkup(
        <QuoteCalculator
          mode="revise"
          {...comun}
          rol={rol}
          initialQuote={quote329({ metodo_cobro: "BILLPOCKET" })}
          clientName="Sam"
        />,
      );
      expect(bp, rol).toContain('id="billpocket-field"');
    }
  });

  it("en LECTURA el rol sin hoja interna sigue LEYENDO lo que leía en el panel", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="SOCIO"
        initialQuote={quote329({ cobrado: true, notas_internas: "Cliente pide factura" })}
        clientName="Sam"
        bloqueadoRazon="La cotización está cobrada"
      />,
    );
    for (const t of ["Pase de abordar", "Cotización abierta", "Notas internas", "Cliente pide factura"]) {
      expect(html, t).toContain(t);
    }
    // Sin un solo control: la cotización está bloqueada.
    expect(html).not.toContain('id="tarifa-tipo-field"');
  });
});

// ---------- 2. Ids ancla: presentes y sin duplicar ----------

describe("ids ancla", () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))("%s: ningún id repetido", (_n, caso) => {
    const ids = idsDe(render(caso));
    const cuenta = new Map<string, number>();
    ids.forEach((i) => cuenta.set(i, (cuenta.get(i) ?? 0) + 1));
    const dup = [...cuenta].filter(([, n]) => n > 1).map(([i, n]) => `${i}×${n}`);
    expect(dup, dup.join(", ")).toEqual([]);
  });

  it("la hoja del CLIENTE en LECTURA (respaldo de la pestaña «PDF del cliente») no monta NINGÚN id", () => {
    // Es lo que hace imposible un choque con la hoja interna, que queda
    // montada y oculta al cambiar de pestaña.
    const p = ESCENARIOS_INTERNA["interna-329"]();
    const html = renderToStaticMarkup(
      <QuoteSheet
        valores={p.valores}
        onCambio={() => {}}
        breakdown={p.breakdown}
        calculando={false}
        errorMotor={null}
        lectura
        documento={p.documento}
        catalogos={p.catalogos}
      />,
    );
    expect(idsDe(html)).toEqual([]);
  });
});

// ---------- 3. Plegar NO desmonta ----------

describe("los `<details>` nunca desmontan su contenido", () => {
  it("cerrados, sus anclas y sus inputs siguen en el DOM", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="create" {...comun} clients={clients as ClientOption[]} rol="SOCIO" />,
    );
    const detalles = [...html.matchAll(/<details([^>]*)>/g)].map((m) => ({
      id: /id="([^"]*)"/.exec(m[1])?.[1] ?? "",
      abierto: /\bopen\b/.test(m[1]),
    }));
    // Hay `<details>` CERRADOS (si no, la prueba no probaría nada).
    expect(detalles.some((d) => !d.abierto)).toBe(true);
    for (const anc of ["seccion-externo", "seccion-operativa", "seccion-detalle"]) {
      expect(html, anc).toContain(`id="${anc}"`);
    }
  });
});

// ---------- 4. `data-guard-exempt` solo donde NO se edita ----------

const VACIOS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Subárbol del elemento cuya etiqueta abre en `desde`. */
function subarbol(html: string, desde: number): { tag: string; html: string } | null {
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  re.lastIndex = desde;
  const m = re.exec(html);
  if (!m || m.index !== desde) return null;
  const tag = m[2].toLowerCase();
  if (VACIOS.has(tag) || m[4] === "/") return { tag, html: m[0] };
  let nivel = 1;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(html))) {
    const t = mm[2].toLowerCase();
    if (VACIOS.has(t) || mm[4] === "/") continue;
    if (mm[1] === "/") {
      if (t !== tag) continue;
      if (--nivel === 0) return { tag, html: html.slice(desde, mm.index + mm[0].length) };
    } else if (t === tag) nivel += 1;
  }
  return { tag, html: html.slice(desde) };
}

const EDITA = /<input(?![^>]*type="hidden")|<textarea|<select|role="switch"|contenteditable="(?!false)/;

describe("el guard de CONFIRMADO/RESERVA", () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))(
    "%s: nada de lo exento contiene un control que EDITE",
    (_n, caso) => {
      const html = render(caso);
      const culpables: string[] = [];
      for (const m of html.matchAll(/data-guard-exempt/g)) {
        const sub = subarbol(html, html.lastIndexOf("<", m.index));
        if (sub && EDITA.test(sub.html)) {
          culpables.push(sub.html.slice(0, sub.html.indexOf(">") + 1));
        }
      }
      expect(culpables, culpables.join(" | ")).toEqual([]);
    },
  );
});

// ---------- 5. Nombre accesible ----------

describe("accesibilidad", () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))("%s: todo control tiene nombre", (_n, caso) => {
    const html = render(caso);
    const fors = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]*)"/g)].map((m) => m[1]));
    const atr = (t: string, n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(t)?.[1];
    const mudos: string[] = [];
    for (const m of html.matchAll(/<(input|textarea|select|button)\b([^>]*)>/g)) {
      const [, tag, at] = m;
      if (atr(at, "type") === "hidden" || /\saria-hidden="true"/.test(at)) continue;
      const id = atr(at, "id");
      const nombrado =
        !!atr(at, "aria-label") ||
        !!atr(at, "aria-labelledby") ||
        !!atr(at, "title") ||
        !!atr(at, "placeholder") ||
        (!!id && fors.has(id));
      if (nombrado) continue;
      if (tag === "button") {
        const resto = html.slice(m.index + m[0].length, m.index + m[0].length + 200);
        if (resto.replace(/<[^>]*>/g, "").trim()) continue;
      }
      mudos.push(`${tag}#${id ?? "?"}`);
    }
    expect(mudos, mudos.join(", ")).toEqual([]);
  });
});
