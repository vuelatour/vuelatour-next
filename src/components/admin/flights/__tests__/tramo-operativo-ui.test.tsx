/**
 * TRAMO OPERATIVO vs TRAMO DEL CLIENTE en el panel (30-sep-2026, API 0.0.46).
 *
 * Caso real #364: Pablo agregó desde la app `PTU→CUN` con 4 pasajeros y el
 * API lo guardó como OPERATIVO (`solo_operativa`, orden 100). La app decía
 * «Interno (no del cliente)» y «tramo 100»; el panel decía «Interno». El
 * cliente: «¿por qué aparece ese aviso? ¿a qué se refiere?».
 *
 * Qué se custodia aquí:
 *  1. «Tacómetros por tramo» (`EscalasCard`): la etiqueta dice «Operativo ·
 *     no cotizado» con su ayuda; ya no «Interno»; el chip ÁMBAR «Lleva
 *     pasajeros y no está cotizado» sale solo en el operativo con pax;
 *  2. «Asignación por tramo» (`FlightTramosCard`): la misma marca junto al
 *     tramo, numerado por POSICIÓN («Tramo 3», nunca «Tramo 100»);
 *  3. «Agregar tramo» (`OperationalLegSheet`): ya no se titula «tramo
 *     operativo» y lleva el aviso informativo que cambia con ferry/servicio;
 *     el toast sale de la RESPUESTA del API;
 *  4. la banda «Ruta operativa» del cotizador numera por posición («3.»,
 *     nunca «100.»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FlightEscala } from "@/types/flights";
import type { PersistedEscala, PersistedQuote } from "@/types/quotes-persisted";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  confirmTacoAction: async () => ({ ok: true }),
  fillTacoGapsAction: async () => ({ ok: true }),
  getUltimoTacoAction: async () => ({ ok: true }),
  clearTacoAction: async () => ({ ok: true }),
  cancelEscalaAction: async () => ({ ok: true }),
  deleteEscalaAction: async () => ({ ok: true }),
  restoreEscalaAction: async () => ({ ok: true }),
  updateEscalaPermisoAction: async () => ({ ok: true }),
  createOperationalLegAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/storage/taco-fotos", () => ({ uploadTacoFoto: async () => "" }));
vi.mock("@/app/admin/distancias/actions", () => ({
  getDistanciasAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/airports/actions", () => ({
  createAirportAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("../escala-assign-sheet", () => ({ EscalaAssignSheet: () => null }));
vi.mock("../escala-form-sheet", () => ({ EscalaFormSheet: () => null }));
// El Sheet real va por portal (no se pinta en el servidor): aquí se pinta su
// contenido EN LÍNEA y solo cuando está abierto.
vi.mock("@/components/ui/sheet", () => {
  const pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Sheet: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? <div data-sheet="">{children}</div> : null,
    SheetTrigger: pasa,
    SheetClose: pasa,
    SheetContent: pasa,
    SheetHeader: pasa,
    SheetFooter: pasa,
    SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

const { EscalasCard } = await import("../escalas-card");
const { FlightTramosCard } = await import("../flight-tramos-card");
const { OperationalLegSheet } = await import("../operational-leg-sheet");
const { QuoteRutaOperativaBanda } = await import(
  "@/components/admin/quotes/quote-ruta-operativa"
);

const VUELO = "6c0e3f7a-1b2d-4e5f-8a9b-0c1d2e3f4a5b";

function escala(p: Partial<FlightEscala> & Pick<FlightEscala, "orden" | "origen_iata" | "destino_iata">): FlightEscala {
  return {
    id: `esc-${p.orden}`,
    vuelo_id: VUELO,
    aeronave_id: null,
    piloto_id: null,
    estado_permiso: "no_aplica",
    fecha_salida_plan: null,
    foto_plan_vuelo_url: null,
    google_calendar_id: null,
    pasajeros: 0,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    solo_operativa: false,
    taco_salida: null,
    taco_llegada: null,
    foto_taco_salida_url: null,
    foto_taco_llegada_url: null,
    cancelada_at: null,
    valor_ia_propuesto: null,
    revision_requerida: false,
    revision_motivo: null,
    hora_salida: null,
    hora_llegada: null,
    capturado_offline: false,
    sincronizado_at: null,
    capturado_por: null,
    corregido_por: null,
    nota_correccion: null,
    corregido_at: null,
    notas: null,
    created_at: "2026-09-29T18:00:00Z",
    updated_at: "2026-09-30T15:00:00Z",
    ...p,
  };
}

/** #364 tal cual quedó en prod: 2 ferries del alta + el PTU→CUN con 4 pax
 *  que el API previo guardó como operativo con orden 100. */
const ESCALAS_364: FlightEscala[] = [
  escala({ orden: 1, origen_iata: "CUN", destino_iata: "CET", es_ferry: true }),
  escala({ orden: 2, origen_iata: "CET", destino_iata: "PTU", es_ferry: true }),
  escala({ orden: 100, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 4, solo_operativa: true }),
];

const ETIQUETA = "Operativo · no cotizado";
const AMBAR = "Lleva pasajeros y no está cotizado: revisa la cotización";
const veces = (html: string, t: string) => html.split(t).length - 1;

describe("«Tacómetros por tramo» (EscalasCard)", () => {
  it("#364: el operativo dice «Operativo · no cotizado» con su ayuda, ya no «Interno»", () => {
    const html = renderToStaticMarkup(<EscalasCard flightId={VUELO} escalas={ESCALAS_364} />);
    expect(veces(html, ETIQUETA)).toBe(1);
    expect(html).toContain(
      'title="Posicionamiento, ferry o parada técnica: no se cobra ni entra a la cotización"',
    );
    expect(html).not.toMatch(/>Interno</);
    // Número de LISTA para TODOS (el mismo «Tramo 3» de «Asignación por
    // tramo» y de la app): el operativo ya no se queda sin número ni sale «100.».
    expect(html).toMatch(/mr-2">1\.<\/span>/);
    expect(html).toMatch(/mr-2">2\.<\/span>/);
    expect(html).toMatch(/mr-2">3\.<\/span>/);
    expect(html).not.toMatch(/mr-2">·<\/span>/);
    expect(html).not.toContain("100.");
  });

  it("#364: el operativo CON pasajeros lleva el chip ámbar (una sola vez)", () => {
    const html = renderToStaticMarkup(<EscalasCard flightId={VUELO} escalas={ESCALAS_364} />);
    expect(veces(html, AMBAR)).toBe(1);
    expect(html).toContain("data-operativo-con-pax");
  });

  it("un operativo ferry (vacío) solo lleva la etiqueta, sin ámbar", () => {
    const html = renderToStaticMarkup(
      <EscalasCard
        flightId={VUELO}
        escalas={[
          escala({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", pasajeros: 4 }),
          escala({ orden: 100, origen_iata: "PTU", destino_iata: "CUN", es_ferry: true, solo_operativa: true }),
        ]}
      />,
    );
    expect(veces(html, ETIQUETA)).toBe(1);
    expect(html).not.toContain(AMBAR);
  });

  it("vuelo con itinerario_operativo (#282: HOL→CUN 2 pax, SÍ cotizado): etiqueta sí, ámbar NO", () => {
    const escalas = [
      escala({ orden: 1, origen_iata: "CUN", destino_iata: "HOL", es_ferry: true }),
      escala({ orden: 2, origen_iata: "HOL", destino_iata: "CUN", pasajeros: 2, solo_operativa: true }),
    ];
    const html = renderToStaticMarkup(
      <EscalasCard flightId={VUELO} escalas={escalas} itinerarioOperativo />,
    );
    expect(veces(html, ETIQUETA)).toBe(1);
    expect(html).not.toContain(AMBAR);
    // Sin el dato (API previo) se evalúa como siempre.
    const sinDato = renderToStaticMarkup(<EscalasCard flightId={VUELO} escalas={escalas} />);
    expect(veces(sinDato, AMBAR)).toBe(1);
  });

  it("un tramo del cliente con pasajeros no lleva ninguna de las dos marcas", () => {
    const html = renderToStaticMarkup(
      <EscalasCard
        flightId={VUELO}
        escalas={[escala({ orden: 3, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 4 })]}
      />,
    );
    expect(html).not.toContain(ETIQUETA);
    expect(html).not.toContain(AMBAR);
  });
});

describe("«Asignación por tramo» (FlightTramosCard)", () => {
  const card = (escalas: FlightEscala[], itinerarioOperativo?: boolean) =>
    renderToStaticMarkup(
      <FlightTramosCard
        flightId={VUELO}
        flightFolio={364}
        esExterno={false}
        estado="CONFIRMADO"
        escalas={escalas}
        aircraft={[]}
        pilots={[]}
        itinerarioOperativo={itinerarioOperativo}
      />,
    );

  it("#364: «Tramo 3» por posición (nunca «Tramo 100») con la marca y el ámbar", () => {
    const html = card(ESCALAS_364);
    expect(html).toContain("Tramo 3");
    expect(html).not.toContain("Tramo 100");
    expect(veces(html, ETIQUETA)).toBe(1);
    expect(veces(html, AMBAR)).toBe(1);
  });

  it("con itinerario_operativo el operativo con pax NO lleva ámbar", () => {
    const html = card(ESCALAS_364, true);
    expect(veces(html, ETIQUETA)).toBe(1);
    expect(html).not.toContain(AMBAR);
  });

  it("CABLEADO: el sheet recibe las escalas (freno de cronología) y la página el itinerario", () => {
    const src = readFileSync(path.join(__dirname, "..", "flight-tramos-card.tsx"), "utf8");
    expect(src).toMatch(/<OperationalLegSheet[\s\S]*?escalas=\{escalas\}[\s\S]*?\/>/);
    expect(src).toContain("itinerarioOperativo={itinerarioOperativo}");
    const page = readFileSync(
      path.join(__dirname, "..", "..", "..", "..", "app", "admin", "flights", "[id]", "page.tsx"),
      "utf8",
    );
    expect(veces(page, "itinerarioOperativo={snapshot.itinerario_operativo}")).toBe(2);
  });

  it("el botón «Agregar tramo» ya no promete que el tramo no se cobra", () => {
    const html = card(ESCALAS_364);
    expect(html).toContain("Agregar tramo");
    expect(html).not.toContain("Movimiento real que NO se cobra al cliente");
  });
});

describe("«Agregar tramo» (OperationalLegSheet)", () => {
  const sheet = (estado: "CONFIRMADO" | "COMPLETADO" = "CONFIRMADO") =>
    renderToStaticMarkup(
      <OperationalLegSheet
        open
        onOpenChange={() => {}}
        flightId={VUELO}
        estado={estado}
        airports={[{ iata: "PTU", nombre: "Pulticub" }]}
      />,
    );

  it("se titula «Agregar tramo» (ya no «tramo operativo») y explica los dos tipos", () => {
    const html = sheet();
    expect(html).toContain("<h2>Agregar tramo</h2>");
    expect(html).not.toContain("Agregar tramo operativo");
    expect(html).not.toContain("Movimiento real de la aeronave que NO se cobra al cliente");
    expect(html).toContain("tramo del cliente");
    expect(html).toContain("ferry o parada técnica");
  });

  it("arranca en ferry: el aviso informativo dice «Tramo operativo: no se cotiza»", () => {
    const html = sheet();
    expect(html).toContain('data-aviso-tramo="operativo"');
    expect(html).toContain("Tramo operativo: no se cotiza.");
    expect(html).not.toContain("Este tramo es del cliente");
  });

  it("CABLEADO: el aviso sigue a ferry/servicio y el toast lee la RESPUESTA del API", () => {
    const src = readFileSync(
      path.join(__dirname, "..", "operational-leg-sheet.tsx"),
      "utf8",
    );
    // El pie usa los MISMOS insumos que viajan en el POST: pax (servicio
    // con pasajeros es del cliente), fecha y las escalas (freno).
    expect(src).toMatch(
      /avisoTramoNuevo\(\{\s*esFerry,\s*esServicio,\s*pasajeros: paxAEnviar,\s*fechaSalidaPlan: fechaIso \|\| null,\s*existentes: escalas,\s*\}\)/,
    );
    expect(src).toContain("pasajeros: paxAEnviar,");
    expect(src).toContain("fecha_salida_plan: fechaIso || undefined,");
    expect(src).toContain("mensajeTramoAgregado(res.data ?? {}, vueloCompletado)");
    // El aviso del API en un operativo (freno) sale en ámbar, no se traga.
    expect(src).toMatch(/if \(m\.advertencia\) \{\s*toast\.warning/);
    // Ningún texto del aviso redactado a mano en el componente.
    expect(src).not.toContain("Este tramo es del cliente");
    expect(src).not.toContain("Tramo operativo agregado a la ruta real");
  });
});

describe("banda «Ruta operativa» del cotizador", () => {
  it("#364: numera por posición («3.», nunca «100.») y marca el operativo", () => {
    const escalas = ESCALAS_364.map(
      (e) => ({ ...e, id: e.id }) as unknown as PersistedEscala,
    );
    const html = renderToStaticMarkup(
      <QuoteRutaOperativaBanda
        lectura
        initialQuote={
          { id: "q364", folio: 364, itinerario_operativo: false, escalas } as unknown as PersistedQuote
        }
        escalasCotizadas={[]}
      />,
    );
    expect(html).toContain("3.</span>");
    expect(html).not.toContain("100.");
    expect(html).toContain("operativo · no cotizado");
  });
});

describe("banda «Ruta operativa» en edición (itinerario operativo)", () => {
  it("un operativo con pasajeros se nombra «operativo», nunca «ferry» (#251 PCE→MID 4 pax)", () => {
    const escalas = [
      { id: "a", orden: 1, origen_iata: "CUN", destino_iata: "MID", es_ferry: true, solo_operativa: true },
      { id: "b", orden: 2, origen_iata: "MID", destino_iata: "CZM", es_ferry: false, solo_operativa: false },
      { id: "c", orden: 4, origen_iata: "PCE", destino_iata: "MID", es_ferry: false, solo_operativa: true },
    ] as unknown as PersistedEscala[];
    const html = renderToStaticMarkup(
      <QuoteRutaOperativaBanda
        lectura={false}
        initialQuote={
          { id: "q251", folio: 251, itinerario_operativo: true, escalas } as unknown as PersistedQuote
        }
        escalasCotizadas={[]}
        operativa={{
          opsComoEscalas: () => [],
          onAplicar: () => {},
          legsSignature: () => "",
        }}
      />,
    );
    expect(html).toContain("T1 ferry · T3 operativo");
    expect(html).not.toContain("T3 ferry");
  });
});
