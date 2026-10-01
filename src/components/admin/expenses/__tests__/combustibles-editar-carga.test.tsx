/**
 * Combustibles: editar o eliminar una carga ya subida (1-oct-2026). Pedido
 * del cliente con la captura de /admin/combustibles: «no puedo editar un
 * ticket ya subido??? Me apoyan porfa para poder editar». La tabla solo
 * ofrecía «Asignar avión» y «Ligar a vuelo»; ahora cada carga lleva el MISMO
 * menú ⋯ de Gastos (`ExpenseActions`) con el gasto completo.
 *
 *  1. La tabla pinta UN menú por carga, con SU gasto, el catálogo completo
 *     de aeronaves, los proveedores y la foto firmada; «Ligar a vuelo» sigue.
 *  2. La PÁGINA carga los proveedores (degradados con aviso, como Gastos) y
 *     se los pasa a la tabla; la cabecera dice dónde se edita.
 *  3. Las server actions del menú revalidan también /admin/combustibles.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { FuelLoadRow } from "../fuel-loads-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/combustibles",
  useSearchParams: () => new URLSearchParams(),
}));

// El menú real abre diálogos con server actions (sesión y red): aquí se
// sustituye por un testigo que enseña lo que RECIBE.
vi.mock("@/components/admin/expenses/expense-actions", () => ({
  ExpenseActions: (p: {
    gasto: Gasto;
    aircraft: { id: string; matricula: string }[];
    providers: { id: string; nombre: string }[];
    fotoUrl?: string;
    rol?: string | null;
  }) => (
    <span
      data-menu-rol={p.rol ?? ""}
      data-menu-gasto={p.gasto.id}
      data-menu-categoria={p.gasto.categoria}
      data-menu-litros={String(p.gasto.litros ?? "")}
      data-menu-aviones={p.aircraft.map((a) => a.matricula).join("|")}
      data-menu-proveedores={p.providers.map((x) => x.nombre).join("|")}
      data-menu-foto={p.fotoUrl ?? ""}
    />
  ),
}));
vi.mock("@/components/admin/expenses/fuel-assign-flight", () => ({
  FuelAssignFlight: (p: { gastoId: string }) => <span data-ligar-vuelo={p.gastoId} />,
}));
vi.mock("@/components/admin/expenses/fuel-assign-aircraft", () => ({
  FuelAssignAircraft: (p: { gastoId: string }) => <span data-asignar-avion={p.gastoId} />,
}));
vi.mock("@/components/admin/comprobante-preview", () => ({
  ComprobantePreview: () => <span data-recibo="" />,
}));
vi.mock("@/components/admin/expenses/fuel-bulk-upload-dialog", () => ({
  FuelBulkUploadDialog: () => null,
}));
vi.mock("@/components/admin/excel-export-button", () => ({ ExcelExportButton: () => null }));
vi.mock("@/components/admin/expenses/fuel-filter-bar", () => ({ FuelFilterBar: () => null }));

// API simulado de la página: cada prueba fija lo que responde.
const api: {
  gastos: Gasto[];
  proveedores: { id: string; nombre: string }[] | Error;
  rol: string | Error;
} = { gastos: [], proveedores: [], rol: "ADMIN" };

vi.mock("@/lib/api/expenses-server", () => ({
  listFuelLoads: async () => ({ data: api.gastos, count: api.gastos.length }),
  signFuelPhotos: async (paths: string[]) =>
    Object.fromEntries(paths.map((p) => [p, `https://firmada.test/${p}?token=x`])),
}));
vi.mock("@/lib/api/aircraft", () => ({
  listAircraft: async () => ({
    data: [
      { id: "av-vgv", matricula: "XA-VGV", modelo: "Cessna 206", activa: true },
      { id: "av-pev", matricula: "XB-PEV", modelo: "Seneca V", activa: true },
      { id: "av-baja", matricula: "N990GG", modelo: "Cessna 210", activa: false },
    ],
  }),
}));
vi.mock("@/lib/api/cards-server", () => ({ listCards: async () => ({ data: [] }) }));
vi.mock("@/lib/api/me", () => ({
  getMe: async () => {
    if (api.rol instanceof Error) throw api.rol;
    return { rol: api.rol };
  },
}));
vi.mock("@/lib/api/providers-server", () => ({
  listProviders: async () => {
    if (api.proveedores instanceof Error) throw api.proveedores;
    return { data: api.proveedores, count: api.proveedores.length };
  },
}));

const { FuelLoadsTable } = await import("../fuel-loads-table");
const { default: CombustiblesPage } = await import("@/app/admin/combustibles/page");
const { AYUDA_EDITAR_CARGA } = await import("@/lib/admin/combustibles");

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: "g-1",
    vuelo_id: null,
    aeronave_id: "av-vgv",
    usuario_captura_id: "u-1",
    categoria: "GAS",
    monto: "4250.50",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-01",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "4321",
    folio_ticket: null,
    litros: "180.5",
    tipo_combustible: "AVGAS",
    lugar: "CUN",
    fecha_hora_carga: "2026-10-01T14:20:00Z",
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    notas: null,
    created_at: "2026-10-01T14:28:00Z",
    updated_at: "2026-10-01T14:28:00Z",
    ...over,
  } as Gasto;
}

/** Los testigos del menú ⋯ en el marcado: [id del gasto, atributos]. */
function menus(html: string) {
  return [...html.matchAll(/<span data-menu-rol="([^"]*)" data-menu-gasto="([^"]*)"([^>]*)>/g)].map((r) => {
    const m = [r[0], r[2], r[3]] as const;
    const rol = r[1];
    const attr = (n: string) => m[2].match(new RegExp(`data-menu-${n}="([^"]*)"`))?.[1] ?? null;
    return {
      id: m[1],
      rol,
      litros: attr("litros"),
      aviones: attr("aviones"),
      proveedores: attr("proveedores"),
      foto: attr("foto"),
    };
  });
}

describe("tabla de cargas: un menú ⋯ por carga", () => {
  const fila = (g: Gasto, over: Partial<FuelLoadRow> = {}): FuelLoadRow => ({
    id: g.id,
    aeronave_id: g.aeronave_id,
    matricula: g.aeronave_id === "av-vgv" ? "XA-VGV" : g.aeronave_id ? "XB-PEV" : null,
    fecha_hora_carga: g.fecha_hora_carga,
    fecha_gasto: g.fecha_gasto,
    captura: null,
    tipo_combustible: g.tipo_combustible as "AVGAS" | "TURBOSINA" | null,
    litros: g.litros != null ? Number(g.litros) : null,
    monto: Number(g.monto),
    moneda: g.moneda,
    lugar: g.lugar,
    medio_pago: g.medio_pago,
    tarjeta_terminacion: g.tarjeta_terminacion,
    titular: null,
    fotoPath: null,
    fotoUrl: null,
    vuelo_id: g.vuelo_id,
    vuelo_folio: null,
    gasto: g,
    ...over,
  });

  const a = gasto({ id: "g-a", litros: "180.5" });
  const b = gasto({ id: "g-b", aeronave_id: "av-pev", litros: "95", fecha_hora_carga: "2026-10-02T10:00:00Z" });
  const sinAvion = gasto({ id: "g-sin", aeronave_id: null, litros: null });

  const html = renderToStaticMarkup(
    <FuelLoadsTable
      loads={[
        fila(a, { fotoPath: "u1/ticket.jpg", fotoUrl: "https://firmada.test/u1/ticket.jpg" }),
        fila(b),
        fila(sinAvion),
      ]}
      aircraft={[{ id: "av-vgv", matricula: "XA-VGV", modelo: "Cessna 206" }]}
      aircraftMenu={[
        { id: "av-vgv", matricula: "XA-VGV" },
        { id: "av-baja", matricula: "N990GG" },
      ]}
      providers={[{ id: "p-1", nombre: "ASUR Cancún" }]}
    />,
  );

  it("cada carga lleva SU menú, también la que no tiene avión", () => {
    const m = menus(html);
    expect(m.map((x) => x.id).sort()).toEqual(["g-a", "g-b", "g-sin"]);
    expect(m.find((x) => x.id === "g-a")?.litros).toBe("180.5");
    expect(m.find((x) => x.id === "g-b")?.litros).toBe("95");
  });

  it("el menú recibe el catálogo COMPLETO de aeronaves, los proveedores y la foto firmada", () => {
    const m = menus(html);
    for (const x of m) {
      expect(x.aviones).toBe("XA-VGV|N990GG");
      expect(x.proveedores).toBe("ASUR Cancún");
    }
    expect(m.find((x) => x.id === "g-a")?.foto).toBe("https://firmada.test/u1/ticket.jpg");
    expect(m.find((x) => x.id === "g-b")?.foto).toBe("");
  });

  it("lo de siempre se queda: «Ligar a vuelo» en cada fila y «Asignar avión» en la que no tiene", () => {
    expect(html.match(/data-ligar-vuelo=/g)).toHaveLength(3);
    expect(html).toContain('data-asignar-avion="g-sin"');
    expect(html.match(/data-asignar-avion=/g)).toHaveLength(1);
  });

  it("el menú recibe el rol de quien mira (esconde lo que el API le rechazaría)", () => {
    const conRol = renderToStaticMarkup(
      <FuelLoadsTable
        loads={[fila(a)]}
        aircraft={[]}
        aircraftMenu={[]}
        providers={[]}
        rol="FACTURACION"
      />,
    );
    expect(menus(conRol)[0].rol).toBe("FACTURACION");
    expect(menus(html)[0].rol).toBe("");
  });

  it("Fecha: la hora de la carga solo si cae el mismo día que fecha_gasto", () => {
    // 1-oct 14:20 Cancún, pero la fecha se corrigió al 30-sep (carga editada
    // antes de la regla): el renglón dice la fecha que manda en el mes.
    const movida = gasto({ id: "g-mov", fecha_gasto: "2026-09-30", fecha_hora_carga: "2026-10-01T19:20:00Z" });
    const alDia = gasto({ id: "g-dia", fecha_gasto: "2026-10-01", fecha_hora_carga: "2026-10-01T19:20:00Z" });
    const t = renderToStaticMarkup(
      <FuelLoadsTable loads={[fila(movida), fila(alDia)]} aircraft={[]} aircraftMenu={[]} providers={[]} />,
    );
    expect(t).toContain("30 sep 2026");
    expect(t.match(/1 oct, 02:20 p\.\s?m\.|1 oct, 14:20/g)).toHaveLength(1);
  });

  it("la columna del menú es la ÚLTIMA y los subtotales siguen alineados", () => {
    // Encabezado: 11 columnas (las 10 de siempre, Aeronave … Vuelo, + el
    // menú sin título).
    const thead = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(thead.match(/<th[\s>]/g)).toHaveLength(11);
    expect(thead).toMatch(/Vuelo<\/th><th[^>]*><\/th><\/tr>/);
    // Las secciones por matrícula ocupan todo el ancho.
    expect(html).toContain('colSpan="11"');
  });
});

describe("página de Combustibles", () => {
  async function pintarPagina(): Promise<string> {
    const el = await CombustiblesPage({
      searchParams: Promise.resolve({ mes: "2026-10" }),
    });
    return renderToStaticMarkup(el);
  }

  it("pasa a la tabla el gasto completo, los proveedores y TODAS las aeronaves; la cabecera dice dónde se edita", async () => {
    api.gastos = [
      gasto({ id: "g-vgv", foto_url: "u1/ticket.jpg" }),
      gasto({ id: "g-baja", aeronave_id: "av-baja", litros: "60" }),
    ];
    api.proveedores = [
      { id: "p-1", nombre: "ASUR Cancún" },
      { id: "p-2", nombre: "SAESA" },
    ];
    const html = await pintarPagina();
    const m = menus(html);
    expect(m.map((x) => x.id).sort()).toEqual(["g-baja", "g-vgv"]);
    for (const x of m) {
      expect(x.proveedores).toBe("ASUR Cancún|SAESA");
      // Inactiva incluida: la carga del N990GG no aparenta «Sin asignar».
      expect(x.aviones).toBe("XA-VGV|XB-PEV|N990GG");
    }
    expect(m.find((x) => x.id === "g-baja")?.litros).toBe("60");
    expect(m.find((x) => x.id === "g-vgv")?.foto).toBe(
      "https://firmada.test/u1/ticket.jpg?token=x",
    );
    expect(AYUDA_EDITAR_CARGA).toBe("Edita o elimina una carga desde el menú ⋯ de su renglón.");
    expect(html).toContain(AYUDA_EDITAR_CARGA);
    // El rol de `/me` llega al menú.
    for (const x of m) expect(x.rol).toBe("ADMIN");
  });

  it("si `/me` falla, la página sigue y el menú no esconde nada (rol vacío)", async () => {
    api.gastos = [gasto({ id: "g-1" })];
    api.proveedores = [];
    api.rol = new Error("502");
    try {
      const m = menus(await pintarPagina());
      expect(m).toHaveLength(1);
      expect(m[0].rol).toBe("");
    } finally {
      api.rol = "ADMIN";
    }
  });

  it("si los proveedores no cargan: AVISA y los menús siguen (catálogo vacío)", async () => {
    api.gastos = [gasto({ id: "g-1" })];
    api.proveedores = Object.assign(new Error("502"), { status: 502 });
    const errorOriginal = console.error;
    console.error = () => {};
    try {
      const html = await pintarPagina();
      expect(html).toContain("No se pudieron cargar los proveedores");
      const m = menus(html);
      expect(m).toHaveLength(1);
      expect(m[0].proveedores).toBe("");
    } finally {
      console.error = errorOriginal;
    }
  });
});

describe("las server actions del menú refrescan Combustibles", () => {
  const actions = readFileSync(
    path.resolve(__dirname, "../../../../app/admin/expenses/actions.ts"),
    "utf8",
  );
  /** Cuerpo de una server action exportada (hasta la siguiente). */
  const cuerpo = (nombre: string) => {
    const i = actions.indexOf(`export async function ${nombre}(`);
    expect(i).toBeGreaterThan(-1);
    const j = actions.indexOf("export async function ", i + 1);
    return actions.slice(i, j === -1 ? undefined : j);
  };

  it.each([
    "verifyGastoAction",
    "deleteGastoAction",
    "dismissDuplicadoAction",
    "vistoBuenoGastoAction",
  ])("%s revalida /admin/combustibles", (nombre) => {
    expect(cuerpo(nombre)).toContain('revalidatePath("/admin/combustibles")');
  });
});
