import { readFileSync } from "node:fs";
import path from "node:path";
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
import { CANAL_CROMA_PX } from "@/lib/admin/quote-sheet";
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
    nombre: "#329 · ADMIN · ruta operativa distinta",
    el: () => (
      <QuoteCalculator
        mode="revise"
        {...comun}
        rol="ADMIN"
        initialQuote={quote329({ itinerario_operativo: true })}
        clientName="Sam Meacham"
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

  it("la hoja del CLIENTE en LECTURA no monta NINGÚN id", () => {
    // Con la pestaña del PDF retirada (22-sep-2026 noche) las dos hojas ya no
    // conviven, pero la propiedad se conserva: en lectura no hay ni un input,
    // así que ninguna pantalla puede chocar ids con el papel interno.
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

// ---------- 6. Una sola hoja: la pestaña «PDF del cliente» se retiró ----------

/**
 * Pedido del cliente (22-sep-2026, noche): «el botón de la pestaña de PDF del
 * cliente, ese lo vamos a quitar porque no hace falta verlo, ese solo mandarlo
 * a imprimir cuando se requiera para descargar y enviar al cliente, pero es
 * raro que lo pidan».
 *
 * Lo que NO se puede perder con la pestaña: el botón que ABRE el PDF real y el
 * `<details>` que decide qué se imprime.
 */
describe("la pantalla tiene UNA sola hoja", () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))("%s: sin pestañera", (_n, caso) => {
    const html = render(caso);
    expect(html).not.toMatch(/role="tab"/);
    expect(html).not.toMatch(/role="tablist"/);
    // La vista previa en iframe se fue con la pestaña.
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Vista previa REAL del PDF");
  });

  it("el PDF del cliente se sigue pudiendo abrir y configurar", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="ADMIN" initialQuote={quote329()} clientName="Sam" />,
    );
    expect(html).toContain("Ver PDF real");
    expect(html).toContain("PDF del cliente: qué se imprime");
    expect(html).toContain('id="plegable-pdf"');
  });

  it("ADMIN ve SOLO la hoja interna (ni rastro de la del cliente)", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="ADMIN" initialQuote={quote329()} clientName="Sam" />,
    );
    expect(html).toContain("cot-interna");
    expect(html).not.toContain("cot-hoja");
  });

  it("SOCIO conserva su hoja del cliente editable", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="SOCIO" initialQuote={quote329()} clientName="Sam" />,
    );
    expect(html).toContain("cot-hoja");
  });
});

// ---------- 7. «Esto se puede tocar»: cursor-pointer ----------

/**
 * Pedido del cliente (22-sep-2026, noche): «todas las opciones que sean
 * cliqueables deben tener la clase cursor-pointer para que el usuario sepa que
 * puede interactuar con esa opción y no es un dato fijo o que no se puede
 * editar». Tailwind v4 dejó los `<button>` con la flecha del sistema y en el
 * papel los controles son INVISIBLES en reposo: la combinación es justo lo que
 * el operador lee como «dato fijo».
 *
 * Se exige la CLASE (es lo que pidió el cliente) en todo lo que se pulsa, y
 * además la regla CSS de respaldo dentro del papel.
 */
const CLICABLE = /<(button|summary)\b([^>]*)>/g;

// ----- Inventario del DOM: cada etiqueta con la pila de sus ancestros -----

type Etiqueta = {
  tag: string;
  attrs: Record<string, string>;
  clases: string[];
  ancestros: { tag: string; clases: string[] }[];
};

/** Mini-parser (el marcado de `renderToStaticMarkup` está bien formado). */
function etiquetas(html: string): Etiqueta[] {
  const VACIAS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const out: Etiqueta[] = [];
  const pila: { tag: string; clases: string[] }[] = [];
  const re = /<(\/)?([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = pila.length - 1; i >= 0; i--) if (pila[i].tag === tag) { pila.length = i; break; }
      continue;
    }
    const attrs: Record<string, string> = {};
    const ra = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ra.exec(m[3] || ""))) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    const clases = (attrs.class || "").split(/\s+/).filter(Boolean);
    out.push({ tag, attrs, clases, ancestros: pila.slice() });
    if (!VACIAS.has(tag) && !m[4]) pila.push({ tag, clases });
  }
  return out;
}

/** Lo que un operador PULSA (no lo que simplemente recibe el foco). */
const esInteractivo = (n: Etiqueta) =>
  n.tag === "button" ||
  n.tag === "summary" ||
  n.tag === "select" ||
  (n.tag === "a" && n.attrs.href !== undefined) ||
  (n.tag === "label" && n.attrs.for !== undefined) ||
  ["button", "switch", "tab"].includes(n.attrs.role ?? "") ||
  (n.tag === "input" &&
    ["date", "datetime-local", "checkbox", "radio", "file"].includes((n.attrs.type ?? "text").toLowerCase()));

/** Selectores con `cursor: pointer` REAL de los CSS de las dos hojas. */
const SELECTORES_PUNTERO: Record<string, string[]> = Object.fromEntries(
  (["cotizacion-interna-pantalla.css", "cotizacion-hoja-pantalla.css"] as const).map((archivo) => {
    const css = readFileSync(
      path.resolve(__dirname, "..", "..", "..", "..", "styles", archivo),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const sels: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/cursor:\s*pointer/.test(m[2])) continue;
      for (const s of m[1].split(",")) sels.push(s.trim());
    }
    return [archivo.startsWith("cotizacion-interna") ? "cot-interna" : "cot-hoja", sels];
  }),
);

/** ¿Alguna de esas reglas alcanza a este nodo, en la hoja donde vive? */
function cubiertoPorCssDeLaHoja(n: Etiqueta): boolean {
  for (const raiz of ["cot-interna", "cot-hoja"] as const) {
    const papel = n.ancestros.find((a) => a.clases.includes(raiz));
    if (!papel) continue;
    // En LECTURA el papel ES el PDF: no se monta croma ni aplica la regla.
    if (papel.clases.includes(`${raiz}--lectura`)) continue;
    for (const sel of SELECTORES_PUNTERO[raiz]) {
      const ultimo = sel.split(/\s+/).pop()!;
      const tag = ultimo.match(/^[a-z]+/)?.[0];
      const clases = [...ultimo.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
      const attr = ultimo.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
      if (tag && tag !== n.tag) continue;
      if (clases.length && !clases.every((c) => n.clases.includes(c))) continue;
      if (attr && (n.attrs[attr[1]] === undefined || (attr[2] !== undefined && n.attrs[attr[1]] !== attr[2]))) continue;
      if (!tag && !clases.length && !attr) continue;
      return true;
    }
  }
  return false;
}

describe("todo lo clicable se ve clicable", () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))("%s: cada botón lleva cursor-pointer", (_n, caso) => {
    const html = render(caso);
    const mudos: string[] = [];
    for (const m of html.matchAll(CLICABLE)) {
      const at = m[2];
      if (/\sdisabled(\s|=|>)/.test(at) || /aria-disabled="true"/.test(at)) continue;
      if (/\saria-hidden="true"/.test(at)) continue;
      if (!/class="[^"]*\bcursor-pointer\b/.test(at)) mudos.push(m[0].slice(0, 160));
    }
    expect(mudos, mudos.join("\n")).toEqual([]);
  });

  it("los switches del papel y los `role=\"switch\"` también", () => {
    const html = renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="ADMIN" initialQuote={quote329()} clientName="Sam" />,
    );
    const mudos = [...html.matchAll(/<[a-z]+\b([^>]*role="switch"[^>]*)>/g)]
      .filter((m) => !/class="[^"]*\bcursor-pointer\b/.test(m[1]))
      .map((m) => m[0].slice(0, 160));
    expect(mudos, mudos.join("\n")).toEqual([]);
  });

  /**
   * INVENTARIO COMPLETO (revisión adversaria, 22-sep-2026 noche). El test de
   * arriba solo mira `<button>`, `<summary>` y `role="switch"`, y así se
   * colaron tres familias que el operador SÍ pulsa: la etiqueta de un campo
   * (`label[for]`, que enciende el switch o enfoca el control), los `select`
   * y el input TRANSPARENTE que cubre una fecha del papel —cuyo cursor es el
   * único que se ve, porque tapa la etiqueta entera—. Aquí se recorre TODO lo
   * interactivo y se acepta la CLASE o una regla `cursor: pointer` REAL del
   * CSS de la hoja donde vive (cada hoja tiene el suyo).
   */
  it.each(CASOS.map((c) => [c.nombre, c] as const))(
    "%s: NADA interactivo se queda sin manita (inventario completo)",
    (_n, caso) => {
      const mudos: string[] = [];
      for (const n of etiquetas(render(caso))) {
        if (!esInteractivo(n)) continue;
        if (n.attrs.disabled !== undefined || n.attrs["aria-disabled"] === "true") continue;
        // Proxy oculto de Base UI: 1×1 px, aria-hidden, fuera del tabulador.
        if (n.attrs["aria-hidden"] === "true" || n.attrs.tabindex === "-1") continue;
        if (n.clases.includes("cursor-pointer")) continue;
        if (cubiertoPorCssDeLaHoja(n)) continue;
        mudos.push(
          `<${n.tag}${n.attrs.type ? ` type=${n.attrs.type}` : ""}${
            n.attrs.role ? ` role=${n.attrs.role}` : ""
          } class="${n.clases.join(" ")}" aria-label="${n.attrs["aria-label"] ?? ""}">`,
        );
      }
      expect([...new Set(mudos)], mudos.join("\n")).toEqual([]);
    },
  );

  it("el CSS del papel es la red de respaldo (y NO pinta en lectura)", () => {
    const css = readFileSync(
      path.resolve(__dirname, "..", "..", "..", "..", "styles", "cotizacion-interna-pantalla.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const regla = /([^{}]*)\{\s*cursor: pointer;\s*\}/g;
    const conCursor = [...css.matchAll(regla)].map((m) => m[1]);
    const cubre = conCursor.find((sel) => /\bbutton\b/.test(sel) && /role="switch"/.test(sel));
    expect(cubre, "falta la regla única de cursor en cotizacion-interna-pantalla.css").toBeTruthy();
    for (const sel of cubre!.split(",").map((s) => s.trim()).filter(Boolean)) {
      expect(sel.startsWith(".cot-interna:not(.cot-interna--lectura)"), sel).toBe(true);
    }
    for (const parte of ["summary", "select", '[role="button"]', '[role="switch"]', ".cot-liga", ".cot-sel"]) {
      expect(cubre, parte).toContain(parte);
    }
  });
});

// ---------- 8. Nada clicable FUERA del papel ----------

/**
 * Pedido del cliente con captura (22-sep-2026, noche): «se pierde el botón o
 * la opción que está del lado izquierdo que solo se alcanza a ver COBRAN».
 * Era el switch «Se cobran TUAS», que vivía en el `.cot-margen` del desglose
 * —la columna IZQUIERDA del papel—, así que el control quedaba fuera de la
 * hoja y lo cortaba el borde del contenedor.
 */
describe("nada clicable queda fuera del papel", () => {
  const htmlAdmin = () =>
    renderToStaticMarkup(
      <QuoteCalculator mode="revise" {...comun} rol="ADMIN" initialQuote={quote329()} clientName="Sam" />,
    );

  it("el switch de TUAS va en la LÍNEA del renglón, no en el margen", () => {
    const html = htmlAdmin();
    const i = html.indexOf('aria-label="Se cobran las TUAS"');
    expect(i, "el switch de TUAS desapareció").toBeGreaterThan(0);
    // Su renglón: desde el <tr> que lo contiene.
    const tr = html.lastIndexOf("<tr", i);
    const celda = html.slice(tr, i);
    expect(celda, "el switch volvió al margen izquierdo del papel").not.toContain("cot-margen");
    expect(celda).toContain("cot-acciones");
  });

  /**
   * 22-sep-2026 (segundo reporte, con captura de TRAMOS COTIZADOS): «no se
   * alcanzan a ver los 3 puntitos para las demás opciones en la cotización».
   * El canal reservado no bastaba —el margen vive FUERA del papel y el borde
   * del contenedor lo corta—, así que en la hoja INTERNA la croma se mudó
   * DENTRO de la celda (`.cot-croma`) y el canal pasó a 0. La hoja del
   * CLIENTE (rol SOCIO) conserva el suyo: su itinerario sigue pintando el
   * margen, con el botón de HORAS que no cabe en la línea.
   */
  it("la hoja INTERNA ya no reserva canal: su croma va dentro del papel", () => {
    const html = htmlAdmin();
    expect(html).not.toContain("padding-left:");
    // 🗑 y ⋯ del tramo, dentro de la celda RUTA.
    expect(html).toMatch(/<span class="cot-croma"[^>]*>/);
    // NINGUNA variante del margen, no solo `class="cot-margen"` exacto: con
    // `cn()` basta una clase extra (`cot-margen cot-margen--der`) para que un
    // control vuelva a quedar FUERA del papel sin que el test se entere
    // (revisión adversaria 22-sep-2026). `\b` deja pasar `cot-margen__accion`,
    // que es la clase de los ICONOS y ahora vive dentro de `.cot-croma`.
    expect(html).not.toMatch(/class="[^"]*\bcot-margen(?![_a-zA-Z0-9])/);
    // Y la croma del tramo abre la celda RUTA, que es lo que se veía cortado.
    expect(html).toMatch(/<td class="ruta cot-ancla">\s*<span class="cot-croma"/);
  });

  it("la hoja del CLIENTE conserva el canal en EDICIÓN (y no en lectura)", () => {
    // `CANAL_CROMA_PX`: el `padding-left` que deja sitio al margen de fila.
    // Se lee de la constante (no un 88 a mano) para que el test siga siendo
    // cierto cuando el canal se ajuste.
    const pad = `padding-left:${CANAL_CROMA_PX}px`;
    const socio = render(CASOS.find((c) => c.nombre === "#329 · SOCIO")!);
    expect(socio).toMatch(new RegExp(`class="cot-escenario"[^>]*style="${pad}"`));
    const lectura = render(CASOS.find((c) => c.nombre.includes("SOCIO · lectura"))!);
    expect(lectura).not.toContain(pad);
    expect(lectura).not.toContain("padding-left:");
  });

  it("en el margen que quede solo va croma ESTRECHA (iconos y marcas)", () => {
    for (const caso of CASOS) {
      const html = render(caso);
      for (const m of html.matchAll(/<span class="cot-margen"[^>]*>/g)) {
        const sub = subarbol(html, m.index);
        expect(sub, "margen sin cerrar").toBeTruthy();
        // Un `role="switch"` o un `.cot-liga` en el margen es lo que se salía.
        expect(sub!.html, sub!.html.slice(0, 120)).not.toContain('role="switch"');
        expect(sub!.html, sub!.html.slice(0, 120)).not.toContain("cot-liga");
      }
    }
  });
});

// ---------- 9. El avión en taller se dice UNA vez (dos, con el chip) ----------

describe("un aviso, una vez", () => {
  it("«está en taller» no se repite tres veces en la misma pantalla", () => {
    const enTaller = [{ ...aircraft[0], en_taller: true }] as unknown as AircraftOption[];
    const html = renderToStaticMarkup(
      <QuoteCalculator
        mode="revise"
        {...comun}
        aircraft={enTaller}
        rol="ADMIN"
        initialQuote={quote329()}
        clientName="Sam"
      />,
    );
    const veces = html.split("está en taller").length - 1;
    // La NOTA ámbar (con qué hacer) + el CHIP de la TotalBar (el resumen que
    // sigue a la vista al hacer scroll). La banda de avisos ya no lo repite.
    expect(veces, `«está en taller» aparece ${veces} veces`).toBeLessThanOrEqual(2);
    expect(veces).toBeGreaterThan(0);
  });
});
