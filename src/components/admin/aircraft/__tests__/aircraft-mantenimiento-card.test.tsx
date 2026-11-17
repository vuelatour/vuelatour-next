/**
 * LA card «Mantenimiento» del expediente del avión (17-nov-2026, API 0.0.140).
 * Pedido del cliente: «debemos crear un solo componente donde venga todo lo
 * de mantenimiento, no importa que sea un componente grande pero que venga
 * todo lo relacionado al mantenimiento para tenerlo mejor ubicado».
 *
 * Vitest sin DOM: el marco y el resumen se pintan con `renderToStaticMarkup`;
 * `AircraftEngineering` (carga datos en efectos y abre portales) y la página
 * se vigilan por su CABLEADO en el fuente.
 *
 *  1. una sola card con navegación por anclas y las secciones en orden;
 *  2. el resumen dice lo que decía el KPI «Próximo servicio» (la línea de la
 *     ORDEN y su enlace a `#mantenimientos`), más órdenes, componentes y
 *     discrepancias;
 *  3. tacómetros y discrepancias se EMBEBEN (sin marco propio) sin dejar de
 *     ser las mismas cards;
 *  4. la página arma UNA card y ya no pinta Motores/Hélices/Tacómetros/
 *     Discrepancias sueltas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AeronaveDiscrepancia } from "@/types/aircraft";
import type { ComponenteAeronave, Mantenimiento } from "@/types/engineering";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/aircraft/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    info: () => {},
    warning: () => {},
  }),
}));
vi.mock("@/app/admin/aircraft/actions", () => ({
  aircraftTacometrosAction: vi.fn(),
  aircraftServiceProgramAction: vi.fn(),
  createSquawkAction: vi.fn(),
  updateSquawkAction: vi.fn(),
  deleteSquawkAction: vi.fn(),
}));

const { MantenimientoCard, MantenimientoResumen, SeccionMantenimiento } = await import(
  "../aircraft-mantenimiento-card"
);
const { AircraftSquawksCard } = await import("../aircraft-squawks-card");
const { SECCIONES_MANTENIMIENTO, TITULO_CARD_MANTENIMIENTO } = await import(
  "@/lib/admin/mantenimiento-unificado"
);

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** XA-VGV a 9.8 h del hito, con la orden creada sola y sin fecha. */
const mant = (p: Partial<Mantenimiento>): Mantenimiento =>
  ({
    id: "m-x",
    aeronave_id: "a-1",
    estado: "PROGRAMADO",
    pais: "MX",
    tipo: "PROGRAMADO",
    descripcion: "100 HRS / ANUAL",
    fecha_programada: null,
    fecha_realizada: null,
    horas_aeronave: null,
    horas_programadas: null,
    costo_usd: null,
    proveedor: null,
    notas: null,
    created_at: "2026-11-09T15:00:00Z",
    ...p,
  }) as Mantenimiento;

const squawk = (p: Partial<AeronaveDiscrepancia>): AeronaveDiscrepancia =>
  ({
    id: "s-1",
    aeronave_id: "a-1",
    vuelo_id: null,
    descripcion: "Luz de taxi fundida",
    severidad: "MEDIA",
    estado: "ABIERTA",
    reportado_por: "Saab",
    fecha_reporte: "2026-11-10",
    resolucion: null,
    fecha_resolucion: null,
    resuelto_por: null,
    notas: null,
    created_at: "2026-11-10T15:00:00Z",
    updated_at: "2026-11-10T15:00:00Z",
    ...p,
  }) as AeronaveDiscrepancia;

const componente = (estado: ComponenteAeronave["vida"]["estado"]) =>
  ({ id: `c-${estado}`, vida: { estado } }) as unknown as ComponenteAeronave;

function resumen(extra: Partial<Parameters<typeof MantenimientoResumen>[0]> = {}) {
  return renderToStaticMarkup(
    <MantenimientoResumen
      mant={[mant({ estado: "EN_TALLER", fecha_programada: "2026-11-09" }), mant({ id: "m-2" })]}
      componentes={{
        estado: "listo",
        datos: { componentes: [componente("VENCIDO"), componente("VIGENTE")] },
      }}
      discrepancias={[squawk({ severidad: "ALTA" }), squawk({ id: "s-2", estado: "RESUELTA" })]}
      {...extra}
    />,
  );
}

describe("MantenimientoCard · una sola card con todo", () => {
  const html = renderToStaticMarkup(
    <MantenimientoCard resumen={<p>RESUMEN</p>}>
      <SeccionMantenimiento id="horas-programa">
        <p>HORAS</p>
      </SeccionMantenimiento>
      <SeccionMantenimiento
        id="mantenimientos"
        titulo="Órdenes de mantenimiento"
        descripcion="Servicios programados"
        accion={<button type="button">Agregar</button>}
      >
        <p>ORDENES</p>
      </SeccionMantenimiento>
      <SeccionMantenimiento id="componentes" titulo="Componentes">
        <p>COMPONENTES</p>
      </SeccionMantenimiento>
      <SeccionMantenimiento id="discrepancias">
        <p>DISCREPANCIAS</p>
      </SeccionMantenimiento>
    </MantenimientoCard>,
  );

  it("es UNA card, con su título y su ancla", () => {
    expect(html.match(/data-slot="card"/g)).toHaveLength(1);
    expect(html).toContain('id="mantenimiento"');
    expect(texto(html)).toContain(TITULO_CARD_MANTENIMIENTO);
  });

  it("navegación por anclas a cada sección, en orden", () => {
    const anclas = [...html.matchAll(/<a[^>]*href="#([a-z-]+)"/g)].map((m) => m[1]);
    expect(anclas).toEqual(SECCIONES_MANTENIMIENTO.map((s) => s.id));
    // Cada ancla tiene a dónde llegar.
    for (const s of SECCIONES_MANTENIMIENTO) expect(html).toContain(`id="${s.id}"`);
  });

  it("las secciones salen en el orden pedido y el ancla histórica `mantenimientos` sigue viva", () => {
    const orden = ["RESUMEN", "HORAS", "ORDENES", "COMPONENTES", "DISCREPANCIAS"].map((x) =>
      html.indexOf(x),
    );
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(html).toMatch(/<section id="mantenimientos"[^>]*scroll-mt-24/);
  });

  it("una sección sin `titulo` no pinta encabezado (lo trae la card embebida)", () => {
    const seccion = renderToStaticMarkup(
      <SeccionMantenimiento id="discrepancias">
        <p>X</p>
      </SeccionMantenimiento>,
    );
    expect(seccion).not.toContain("<h3");
    const conTitulo = renderToStaticMarkup(
      <SeccionMantenimiento id="componentes" titulo="Componentes" descripcion="Motores y piezas">
        <p>X</p>
      </SeccionMantenimiento>,
    );
    expect(conTitulo).toContain("<h3");
    expect(texto(conTitulo)).toContain("Motores y piezas");
  });
});

describe("MantenimientoResumen · tres mosaicos", () => {
  it("NO repite el próximo servicio: vive una sola vez, en «Horas y programa»", () => {
    const html = resumen();
    const t = texto(html);
    expect(html.match(/data-mosaico=/g)).toHaveLength(3);
    expect(t).not.toContain("Próximo servicio");
    expect(t).not.toContain("a las");
    expect(html).not.toContain('href="#horas-programa"');
  });

  it("órdenes, componentes y discrepancias: lo más urgente de cada uno", () => {
    const t = texto(resumen());
    expect(t).toContain("Órdenes abiertas");
    expect(t).toContain("1 en taller");
    expect(t).toContain("y 1 programada");
    expect(t).toContain("Componentes");
    expect(t).toContain("1 vencido");
    expect(t).toContain("Discrepancias abiertas");
    expect(t).toContain("1 alta sin resolver");
  });

  it("cada mosaico lleva a su sección", () => {
    const html = resumen();
    for (const ancla of ["#mantenimientos", "#componentes", "#discrepancias"]) {
      expect(html).toContain(`href="${ancla}"`);
    }
  });

  it("lo que NO se pudo leer se dice: nunca «Ninguna» ni «Sin componentes»", () => {
    const t = texto(
      resumen({ mant: null, componentes: { estado: "error", datos: null } }),
    );
    expect(t).toContain("No se pudieron leer");
    expect(t).not.toContain("Sin componentes");
    expect(t).not.toContain("Sin órdenes registradas");
  });

  it("componentes todavía no disponibles (API previo / migración): gris, sin alarmar", () => {
    const t = texto(resumen({ componentes: { estado: "no_disponible", datos: null } }));
    expect(t).toContain("Disponible cuando se actualice el sistema.");
  });
});

describe("cards embebidas: sin marco propio, misma card", () => {
  const discrepancias = [squawk({}), squawk({ id: "s-2", estado: "RESUELTA" })];

  it("suelta: es una Card con su título de siempre", () => {
    const html = renderToStaticMarkup(
      <AircraftSquawksCard aircraftId="a-1" discrepancias={discrepancias} />,
    );
    expect(html).toContain('data-slot="card"');
    expect(texto(html)).toContain("Bitácora de discrepancias");
  });

  it("embebida: sin Card, con el título de la sección y el mismo contenido", () => {
    const html = renderToStaticMarkup(
      <AircraftSquawksCard aircraftId="a-1" discrepancias={discrepancias} embebido />,
    );
    expect(html).not.toContain('data-slot="card"');
    expect(html).toContain('data-marco="embebido"');
    const t = texto(html);
    expect(t).toContain("Discrepancias");
    expect(t).not.toContain("Bitácora de discrepancias");
    expect(t).toContain("2 registradas");
    expect(t).toContain("1 sin resolver");
    expect(t).toContain("Luz de taxi fundida");
    expect(t).toContain("Reportar");
  });

  it("la card de tacómetros acepta `embebido` y usa el mismo marco", () => {
    const src = leer("components/admin/aircraft/aircraft-tacometros-card.tsx");
    expect(src).toContain("embebido = false,");
    expect(src).toContain('<Marco embebido={embebido} className="lg:col-span-2">');
    expect(src).toContain('TITULOS_SECCION["horas-programa"].titulo');
    expect(src).toContain('"Tacómetros y servicio por horas"');
    // Ya no importa el Card del kit: todo su marco pasa por `marco-seccion`.
    expect(src).not.toContain('from "@/components/ui/card"');
  });
});

describe("cableado: AircraftEngineering pinta LA card", () => {
  const src = leer("components/admin/aircraft/aircraft-engineering.tsx");

  it("una card única con las cinco piezas, y los archivos del avión cargados UNA vez", () => {
    expect(src).toContain("<AdjuntosIngenieriaProvider aircraftId={aircraftId}>");
    expect(src).toContain("<MantenimientoCard");
    expect(src).toContain("<MantenimientoResumen");
    const orden = [
      '<SeccionMantenimiento id="horas-programa">{slots.horas}</SeccionMantenimiento>',
      'id="mantenimientos"',
      'id="componentes"',
      '<SeccionMantenimiento id="discrepancias">{slots.discrepancias}</SeccionMantenimiento>',
    ].map((x) => src.indexOf(x));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // Motores y hélices van ANTES de los componentes con vida límite.
    expect(src.indexOf("{slots.motores}")).toBeLessThan(src.indexOf("{slots.helices}"));
    expect(src.indexOf("{slots.helices}")).toBeLessThan(src.indexOf("<AircraftComponentes"));
  });

  it("cada orden trae sus evidencias y la COMPLETADA sin evidencia invita a subir el sticker", () => {
    expect(src).toContain('destino="MANTENIMIENTO"');
    expect(src).toContain("destinoId={m.id}");
    expect(src).toContain('invitar={m.estado === "COMPLETADO"}');
  });

  it("si ingeniería no carga, la card NO desaparece: se dice en las órdenes y en permisos", () => {
    expect(src).not.toContain("if (error) {");
    expect(src).toContain("{TEXTO_ORDENES_NO_CARGARON}");
    expect(src).toContain("mant={error ? null : mant}");
    expect(src).toContain("No se pudieron cargar los permisos y servicios próximos");
  });

  it("«Permisos y licencias» y «Servicios próximos» siguen como cards aparte, debajo", () => {
    const fin = src.indexOf("</AdjuntosIngenieriaProvider>");
    expect(fin).toBeGreaterThan(0);
    expect(src.indexOf("{/* Permisos y licencias (vencimientos) */}")).toBeGreaterThan(fin);
    expect(src.indexOf("{/* Servicios próximos */}")).toBeGreaterThan(fin);
  });
});

describe("cableado: la página del avión", () => {
  const src = leer("app/admin/aircraft/[id]/page.tsx");

  it("arma UNA card de mantenimiento y le pasa las piezas como slots", () => {
    expect(src.match(/<AircraftEngineering/g)).toHaveLength(1);
    expect(src).toContain("discrepancias={aircraft.discrepancias}");
    expect(src).toContain("motores: bloqueMotores,");
    expect(src).toContain("helices: bloqueHelices,");
    // Tacómetros y discrepancias solo existen embebidas.
    expect(src.match(/<AircraftTacometrosCard/g)).toHaveLength(1);
    expect(src.match(/<AircraftSquawksCard/g)).toHaveLength(1);
    // `[^>]` también cruza saltos de línea: llega hasta el cierre de la etiqueta.
    expect(src).toMatch(/<AircraftTacometrosCard[^>]*\bembebido\b/);
    expect(src).toMatch(/<AircraftSquawksCard[^>]*\bembebido\b/);
  });

  it("orden nuevo: KPI → resumen operativo → combustible → mantenimiento → viajes → especificaciones", () => {
    const cuerpo = src.slice(src.indexOf("<TituloPestana"));
    const orden = [
      "<AircraftKpiStrip",
      "<AircraftMetricsCard",
      "<AircraftFuelCard",
      "<AircraftEngineering",
      "<AircraftFlightsCard",
      "Especificaciones",
      "<AircraftImagesCard",
      "<AircraftOwnersCard",
      "<ReservaVigenciasCard",
      "Reservas overhaul",
    ].map((x) => cuerpo.indexOf(x));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("Motores y Hélices ya no son cards sueltas y llevan sus documentos", () => {
    expect(src).not.toContain("{/* 11. Motores */}");
    expect(src).not.toContain("{/* 12. Hélices */}");
    expect(src).toContain('data-bloque="motores"');
    expect(src).toContain('data-bloque="helices"');
    expect(src).toContain('destino="MOTOR"');
    expect(src).toContain("destinoId={motor.id}");
    expect(src).toContain('destino="HELICE"');
    expect(src).toContain("destinoId={propeller.id}");
  });
});
