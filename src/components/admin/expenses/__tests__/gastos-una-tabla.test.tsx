/**
 * Gastos en UNA sola tabla (14-oct-2026). Pedido del cliente: «unir Gastos
 * generales y Gastos operativos en una sola tabla… toda la vista debe quedar
 * bien e intuitiva». El runner no tiene DOM: se congela el MARCADO estático de
 * la tabla real (columnas, a dónde va el dinero, montos, captura con su
 * distintivo, insignias, comprobante, modo «Unir en compra», compra) y el
 * CABLEADO por regex sobre los fuentes (página, tabla y textos de otras
 * pantallas que nombraban la división).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import { CapturadoCompacto } from "../capturado-linea";
import { lineaCapturaCompacta } from "@/lib/admin/gastos-captura";

const testigos = vi.hoisted(() => ({ facturacion: [] as Array<{ id: string; compacta: boolean }> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  unirGastosEnCompraAction: async () => ({ ok: false }),
}));
vi.mock("@/components/admin/expenses/expense-actions", () => ({
  ExpenseActions: ({ gasto }: { gasto: Gasto }) => <span data-acciones={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({
  FacturacionBadge: ({ gasto, compacta }: { gasto: Gasto; compacta?: boolean }) => {
    testigos.facturacion.push({ id: gasto.id, compacta: !!compacta });
    return <span data-facturacion={gasto.id} data-compacta={String(!!compacta)} />;
  },
}));
vi.mock("@/components/admin/expenses/gasto-factura-button", () => ({
  GastoFacturaButton: ({ gasto }: { gasto: Gasto }) => <span data-subir-factura={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/gasto-banco-sheet", () => ({
  useDetalleBancoGasto: () => ({ abrir: () => {} }),
  GastoBancoSheet: () => null,
}));

const { ExpensesTable } = await import("../expenses-table");
const { ExpensesSeleccionProvider } = await import("../expenses-seleccion");

function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "g-1",
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "OTRO",
    monto: "2763.00",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-14",
    proveedor_id: null,
    medio_pago: "EFECTIVO",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    estatus_facturacion: "NO_FACTURABLE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    requiere_visto_bueno: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "CFE oficina Pago de energía eléctrica",
    // 10:33 en Cancún.
    created_at: "2026-10-14T15:33:00Z",
    capturado_en: "2026-10-14T15:33:00Z",
    captura: { nombre: "Mary Cruz" },
    ...over,
  } as Gasto;
}

const GASTOS: Gasto[] = [
  gasto(),
  gasto({ id: "g-comida", categoria: "COMIDA", monto: "564", notas: "The Money Bar Beach Club", origen: "PILOTO", captura: { nombre: "Alexander E. Saab" } }),
  gasto({ id: "g-personal", categoria: "PERSONAL_DUENO", monto: "890", medio_pago: "PERSONAL_PABLO" }),
  gasto({
    id: "g-gasolina",
    categoria: "GASOLINA",
    monto: "1355.22",
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "2865",
    aeronave_id: "av-1",
    aeronave: { matricula: "N4142R" },
  }),
  gasto({
    id: "g-vuelo",
    categoria: "COMIDA",
    monto: "325",
    moneda: "USD",
    propina: "50",
    aeronave_id: "av-1",
    aeronave: { matricula: "N4142R" },
    vuelo_id: "v-441",
    vuelo: { folio: "441" },
    estatus_facturacion: "FACTURADA",
  }),
  gasto({
    id: "g-dup",
    categoria: "OPERACIONES",
    monto: "295.67",
    duplicado_sospechado: true,
    requiere_visto_bueno: true,
    aeronave_id: "av-2",
    aeronave: { matricula: "XA-VGV" },
    notas: "XA-VGV · Aeropuerto de Cancún (ASUR) · Aterrizaje",
    foto_url: "piloto/a.jpg",
    estatus_facturacion: "PENDIENTE",
  }),
  gasto({
    id: "g-rep",
    categoria: "INDIRECTO",
    monto: "1000",
    repartos: [
      { aeronave_id: "a1", monto: "300", aeronave: { matricula: "N621TX" } },
      { aeronave_id: "a2", monto: "300", aeronave: { matricula: "N990GG" } },
    ],
  }),
  gasto({ id: "g-foto-ok", categoria: "TAXI", foto_url: "piloto/b.jpg", aeronave_id: "av-2", aeronave: { matricula: "XA-VGV" } }),
  gasto({ id: "g-ref", categoria: "REFACCION", monto: "800", aeronave_id: "av-2", aeronave: { matricula: "XA-VGV" } }),
  // Compra #5 con un pago.
  gasto({
    id: "g-compra",
    categoria: "REFACCION",
    monto: "641.90",
    compra_id: "c-5",
    compra_rol: "MERCANCIA",
    compra: { id: "c-5", folio: 5, referencia: "3917383", estado: "RECIBIDA", proveedor: { nombre: "Aircraft Spruce" }, n_pagos: 1 },
  }),
];

const FOTOS = { "piloto/b.jpg": "https://x.supabase.co/storage/v1/object/sign/gasto-fotos/piloto/b.jpg?token=a" };

const pintar = (opts: { modo?: boolean; gastos?: Gasto[] } = {}) =>
  renderToStaticMarkup(
    <ExpensesSeleccionProvider idsVisibles={["g-1", "g-dup", "g-ref"]} modoInicial={opts.modo}>
      <ExpensesTable
        gastos={opts.gastos ?? GASTOS}
        aircraft={[{ id: "av-1", matricula: "N4142R" }]}
        providers={[]}
        fotoUrls={FOTOS}
        rol="ADMIN"
      />
    </ExpensesSeleccionProvider>,
  );

/** El <tr> del gasto (por el testigo del menú ⋯). */
const fila = (html: string, id: string): string => {
  const i = html.indexOf(`data-acciones="${id}"`);
  if (i < 0) throw new Error(`sin fila ${id}`);
  const ini = html.lastIndexOf("<tr", i);
  const fin = html.indexOf("</tr>", i);
  return html.slice(ini, fin);
};
/** La etiqueta <a …> con ese href (sin depender del orden de los atributos). */
const enlace = (html: string, href: string): string => {
  const m = new RegExp(`<a(?=[^>]*href="${href.replace(/[/]/g, "\\/")}")[^>]*>`).exec(html);
  if (!m) throw new Error(`sin enlace ${href}`);
  return m[0];
};
const encabezados = (html: string) =>
  [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[0]);
const texto = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

describe("columnas", () => {
  const html = pintar();

  it("8 encabezados en orden; sin Categoría, Descripción, Pago, Vuelo ni Capturó", () => {
    const th = encabezados(html);
    expect(th.map((t) => texto(t).trim())).toEqual([
      "Fecha",
      "Concepto",
      "Monto",
      "Avión · vuelo",
      "Comp.Comprobante",
      "Facturación",
      "Banco",
      "Acciones",
    ]);
    expect(th[4]).toContain('<span class="sr-only">Comprobante</span>');
    expect(th[4]).toContain('<span aria-hidden="true">Comp.</span>');
    expect(th[7]).toContain('<span class="sr-only">Acciones</span>');
    expect(th[0]).toContain('title="Fecha del gasto (la del ticket). Debajo: cuándo se capturó y quién lo capturó (hora Cancún).');
    for (const viejo of [">Categoría<", ">Descripción<", ">Pago<", ">Vuelo<", ">Capturó<"]) {
      expect(html, viejo).not.toContain(viejo);
    }
  });

  it("Comp. (th y td) solo desde 1280 px; Concepto absorbe el sobrante", () => {
    const th = encabezados(html);
    expect(th[4]).toMatch(/class="[^"]*hidden xl:table-cell/);
    expect(fila(html, "g-1")).toMatch(/<td[^>]*class="[^"]*hidden xl:table-cell/);
    expect(th[1]).toMatch(/class="[^"]*w-full/);
    expect(th[0]).toMatch(/class="[^"]*w-\[8rem\]/);
  });
});

describe("Avión · vuelo: a dónde va el dinero", () => {
  const html = pintar();

  it("OTRO sin avión ⇒ «VuelaTour» (no «Falta avión»), con su destino en sr-only", () => {
    const f = fila(html, "g-1");
    expect(f).toContain(">VuelaTour<");
    expect(f).not.toContain("Falta avión");
    expect(f).toContain('<span class="sr-only"> · Va a: Balance general VuelaTour · Otros gastos');
  });

  it("COMIDA sin avión ⇒ «Falta avión» ámbar con contraste oscuro y explicación", () => {
    const f = fila(html, "g-comida");
    expect(f).toContain("Falta avión");
    expect(f).toMatch(/class="[^"]*dark:text-amber-400[^"]*"[^>]*title="Este gasto necesita avión/);
    expect(f).toContain('<span class="sr-only"> · Este gasto necesita avión y no lo tiene');
  });

  it("PERSONAL_DUENO ⇒ «Personal»; GASOLINA con avión ⇒ «VuelaTour» + «ref. N4142R»", () => {
    expect(fila(html, "g-personal")).toContain(">Personal<");
    const f = fila(html, "g-gasolina");
    expect(f).toContain(">VuelaTour<");
    expect(f).toContain(">ref. N4142R<");
    expect(f).toContain('title="El avión queda solo como referencia: este gasto no se carga a ese avión."');
  });

  it("matrícula y «Vuelo #441» en la MISMA celda, con liga y contraste oscuro", () => {
    const f = fila(html, "g-vuelo");
    // next/link pinta `href` al final: se revisa cada enlace por separado.
    expect(f).toMatch(/>N4142R<\/a><a[^>]*>Vuelo #441<\/a>/);
    const avion = enlace(f, "/admin/aircraft/av-1");
    expect(avion).toMatch(/class="[^"]*font-mono[^"]*dark:text-brand-400/);
    expect(enlace(f, "/admin/flights/v-441")).toMatch(/class="[^"]*dark:text-brand-400/);
  });

  it("repartido ⇒ «Repartido:» con una insignia por avión y «VuelaTour» por el remanente", () => {
    const f = fila(html, "g-rep");
    expect(f).toContain("Repartido:");
    expect(f).toContain('href="/admin/aircraft/a1"');
    expect(f).toContain(">N621TX<");
    expect(f).toContain('title="Parte que absorbe la empresa: $400 MXN"');
  });
});

describe("Monto, Fecha y Concepto", () => {
  const html = pintar();

  it("montos con fmtMonto, medio corto debajo y propina", () => {
    expect(fila(html, "g-gasolina")).toContain(">$1,355.22 MXN<");
    expect(fila(html, "g-gasolina")).toMatch(/title="Tarjeta corporativa \*\*\*\*2865"[^>]*>Tarjeta \*\*\*\*2865</);
    expect(fila(html, "g-vuelo")).toContain(">$325 USD<");
    expect(fila(html, "g-vuelo")).toContain("incl. propina $50 USD");
    expect(fila(html, "g-1")).toContain(">$2,763 MXN<");
    expect(fila(html, "g-1")).toContain(">Efectivo<");
  });

  it("fecha: «Cap. 14 oct 10:33» (el lector oye «Capturado …»), el nombre y el origen «panel» con el COLOR del distintivo Oficina", () => {
    const f = fila(html, "g-1");
    expect(f).toContain("14 oct 2026");
    // «Capturado …» medía hasta 119 px en las 112 de la columna (revisión del
    // 14-oct-2026): visible la forma corta, el lector la larga.
    expect(f).toContain(
      '<span aria-hidden="true">Cap. 14 oct 10:33</span><span class="sr-only">Capturado 14 oct 10:33</span>',
    );
    expect(f).toContain(">Mary Cruz<");
    expect(f).toMatch(/<span data-distintivo="OFICINA" class="[^"]*text-sky-600 dark:text-sky-400[^"]*" title="Oficina: lo capturó administración desde el panel.">panel<span class="sr-only"> \(Oficina\)<\/span><\/span>/);
    // Ya no hay columna ni insignia aparte «Oficina».
    expect(f).not.toMatch(/>Oficina<\/span>/);
    // Piloto: «app» en gris, sin distintivo.
    const p = fila(html, "g-comida");
    expect(p).toContain(">Alexander E. Saab<");
    expect(p).toContain('<span class="shrink-0">app</span>');
    expect(p).not.toContain("data-distintivo");
  });

  it("«¿Duplicado?» y «Falta visto bueno» con contraste oscuro; descripción sin la matrícula propia, en 2 líneas y con title", () => {
    const f = fila(html, "g-dup");
    expect(f).toMatch(/dark:text-amber-400[^"]*"[^>]*title="Posible duplicado[^"]*">¿Duplicado\?</);
    expect(f).toMatch(/dark:text-sky-400[^"]*"[^>]*title="Prellenado con IA[^"]*">Falta visto bueno</);
    expect(f).toMatch(/<p class="[^"]*line-clamp-2[^"]*" title="XA-VGV · Aeropuerto de Cancún \(ASUR\) · Aterrizaje">Aeropuerto de Cancún \(ASUR\) · Aterrizaje<\/p>/);
  });

  it("línea de estado SOLO en teléfono (md:hidden)", () => {
    expect(fila(html, "g-dup")).toMatch(/<p class="[^"]*md:hidden[^"]*">\$295\.67 MXN · XA-VGV · Factura: Pendiente<\/p>/);
  });

  it("pago de una compra: sangría pl-3 y sublíneas de 6.25rem (12 + 100 = 112 px, lo de una fila suelta)", () => {
    const angosto = renderToStaticMarkup(<CapturadoCompacto captura={lineaCapturaCompacta(gasto())} angosto />);
    expect(angosto.match(/max-w-\[6\.25rem\]/g)).toHaveLength(2);
    expect(angosto).not.toContain("max-w-[7rem]");
    const suelta = renderToStaticMarkup(<CapturadoCompacto captura={lineaCapturaCompacta(gasto())} />);
    expect(suelta.match(/max-w-\[7rem\]/g)).toHaveLength(2);
    const tabla = leer("../expenses-table.tsx");
    expect(tabla).toContain('<div className={f.hijo ? "pl-3 text-muted-foreground" : undefined}>');
    expect(tabla).toContain("<CapturadoCompacto captura={lineaCapturaCompacta(f.gasto)} angosto={f.hijo} />");
    expect(tabla).not.toContain('"pl-6');
  });
});

describe("respaldo de «Comp.» bajo el concepto (768–1279 px; 1299 en modo unir)", () => {
  const casos = [
    gasto(),
    gasto({ id: "g-sin", estatus_comprobante: "SIN_COMPROBANTE" }),
    gasto({ id: "g-sin-firma", foto_url: "piloto/a.jpg" }),
    gasto({
      id: "g-conf",
      foto_url: "piloto/b.jpg",
      valor_ia_extraido: { fotos_adicionales: ["piloto/c.jpg", "piloto/d.jpg"] },
      verificado_at: "2026-10-14T16:00:00Z",
      verificador: { nombre: "Mary Cruz" },
    }),
  ];

  it("dice lo que pintaría la columna (sin la miniatura), con el MISMO corte que la oculta", () => {
    const html = pintar({ gastos: casos });
    // FACTURA, sin foto ni hojas, sin confirmar: nada que decir.
    expect(fila(html, "g-1")).not.toContain("data-respaldo-comp");
    expect(fila(html, "g-sin")).toContain(
      '<p class="mt-0.5 text-[11px] text-muted-foreground hidden md:block xl:hidden" data-respaldo-comp="">Sin comp.</p>',
    );
    expect(fila(html, "g-sin-firma")).toContain('data-respaldo-comp="">Sin vista previa</p>');
    expect(fila(html, "g-conf")).toMatch(
      /title="Confirmado por Mary Cruz · [^"]+" data-respaldo-comp="">\+2 hojas · ✓ Confirmado<\/p>/,
    );
    // El ✓ de la columna lleva el MISMO title (una sola fuente).
    const titulo = /title="(Confirmado por Mary Cruz · [^"]+)" data-respaldo-comp/.exec(fila(html, "g-conf"))?.[1];
    expect(fila(html, "g-conf")).toContain(`title="${titulo}">✓</span>`);
  });

  it("en modo «Unir en compra» se oculta desde 1300 px, igual que la columna", () => {
    const html = pintar({ modo: true, gastos: casos });
    expect(fila(html, "g-sin")).toContain("hidden md:block min-[1300px]:hidden");
    expect(fila(html, "g-sin")).not.toContain("xl:hidden");
  });
});

describe("Comprobante y Facturación", () => {
  const html = pintar();

  it("«Sin vista previa» cuando la firma no trae la ruta del gasto; con la ruta, la miniatura", () => {
    expect(fila(html, "g-dup")).toContain(">Sin vista previa<");
    expect(fila(html, "g-dup")).toContain('title="No se pudo cargar la foto del comprobante');
    expect(fila(html, "g-foto-ok")).not.toContain("Sin vista previa");
    expect(fila(html, "g-foto-ok")).toContain("Comprobante · Taxi / estacionamiento");
  });

  it("el semáforo va en versión compacta («No requiere») y junto a «Subir factura»", () => {
    expect(testigos.facturacion.length).toBeGreaterThan(0);
    expect(testigos.facturacion.every((t) => t.compacta)).toBe(true);
    expect(fila(html, "g-1")).toContain('data-subir-factura="g-1"');
  });
});

describe("modo «Unir en compra»", () => {
  it("sin el modo no hay casillas ni columna", () => {
    const html = pintar();
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain(">Unir en compra<");
  });

  it("con el modo: la casilla (con manita) solo en sueltos de compra y el encabezado sr-only", () => {
    const html = pintar({ modo: true });
    const th = encabezados(html);
    expect(th[0]).toContain('<span class="sr-only">Unir en compra</span>');
    expect(th[0]).toContain('title="Marca los pagos de una misma compra"');
    expect(fila(html, "g-ref")).toMatch(/<input type="checkbox"[^>]*class="[^"]*cursor-pointer/);
    expect(fila(html, "g-dup")).toContain('type="checkbox"');
    expect(fila(html, "g-comida")).not.toContain('type="checkbox"');
    // En modo unir, «Comp.» aparece desde 1300 px (la casilla suma 32 px).
    expect(th[5]).toMatch(/class="[^"]*hidden min-\[1300px\]:table-cell/);
  });
});

describe("compra (renglón-grupo)", () => {
  const html = pintar();

  it("botón de plegar con aria-expanded y manita; total y «1 pago» en Monto; tinte neutro", () => {
    const i = html.indexOf("Compra #5");
    const tr = html.slice(html.lastIndexOf("<tr", i), html.indexOf("</tr>", i));
    expect(tr).toMatch(/<button type="button" class="[^"]*cursor-pointer[^"]*" title="Ver los pagos de la compra" aria-expanded="false">/);
    expect(tr).toContain(">$641.90 MXN<");
    expect(tr).toContain(">1 pago<");
    expect(tr).toContain("Aircraft Spruce · 3917383");
    const abrir = enlace(tr, "/admin/inventory/compras/c-5");
    expect(abrir).toContain('aria-label="Abrir la compra #5"');
    expect(abrir).toContain('title="Abrir la compra #5"');
    expect(abrir).toMatch(/class="[^"]*cursor-pointer[^"]*dark:text-brand-400/);
    expect(tr).toMatch(/^<tr[^>]*class="[^"]*bg-muted\/40/);
    expect(tr).not.toContain("bg-brand-600/5");
    expect(tr).not.toContain("Ver compra");
  });

  it("buscador con el placeholder de la vista", () => {
    expect(html).toContain('placeholder="Buscar: proveedor, monto, matrícula, folio, vuelo…"');
  });
});

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("cableado (regex sobre los fuentes)", () => {
  it("tabla: sin fmtMoney, ORIGEN_BADGE, filter por compra ni @container; búsqueda y banco de siempre", () => {
    const tabla = leer("../expenses-table.tsx");
    expect(tabla).not.toContain("fmtMoney");
    expect(tabla).not.toContain("ORIGEN_BADGE");
    expect(tabla).not.toContain("gastos.filter((x) => x.compra_id === cid)");
    expect(tabla).not.toContain("@container");
    expect(tabla).toContain("textoBusquedaGasto(");
    expect(tabla).toContain("[aircraft, providers, fotoUrls, seleccion, rol, abrirBanco]");
    expect(tabla.match(/<GastoBancoSheet /g)?.length).toBe(1);
    expect(tabla).toMatch(/if \(seleccion\?\.modoUnir\) \{\s*cols\.push\(\{\s*key: "sel",/);
  });

  it("página: UNA tabla con clave de vista, filtro de categoría, estados honestos y Excel con la pestaña", () => {
    const page = leer("../../../../app/admin/expenses/page.tsx");
    expect(page.match(/<ExpensesTable/g)?.length).toBe(1);
    expect(page).toContain("key={claveVista}");
    expect(page).not.toMatch(/GastosCard|CATEGORIAS_OPERATIVAS|esOperativo|Gastos operativos|Gastos generales/);
    expect(page).toMatch(/const FILTROS_URL = \[[\s\S]*?"categoria",[\s\S]*?\] as const;/);
    expect(page).toContain("principal(listGastosAll(");
    expect(page).toContain("<TarjetaErrorCarga");
    expect(page).toMatch(/degradado\.opcional\(\s*ETIQUETA_FOTOS_COMPROBANTES/);
    expect(page).toContain("<EmptyState");
    expect(page).toContain("queryExcelGastos(");
    expect(page).toContain('varianteBoton="default"');
    expect(page).toContain('<nav aria-label="Vistas de gastos"');
    expect(page).toContain("aria-current");
    expect(page).toContain("prefetch={false}");
    expect(page).toContain("<IndicadorEnlace");
    expect(page).toContain("<UnirCompraToggle");
    expect(page).toContain('<Card role="region" aria-label={ETIQUETA_LISTA_GASTOS} className="gap-0 py-0">');
    // UN solo catálogo de los diálogos (y los aviones del filtro, con `activa`).
    expect(page.split(".map(avionCatalogoGasto)").length - 1).toBe(1);
    expect(page).toContain("aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula, activa: a.activa }))");
  });

  it("otras pantallas ya no nombran la división", () => {
    expect(leer("../../../../app/admin/gastos-personales/page.tsx")).toContain("/admin/expenses?categoria=PERSONAL_DUENO");
    expect(leer("../../../../app/admin/gastos-personales/page.tsx")).not.toContain("card Gastos generales");
    expect(leer("../../flights/flight-gastos-card.tsx")).not.toContain("Operativos y generales");
  });
});
