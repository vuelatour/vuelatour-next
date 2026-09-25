/**
 * FICHA SENCILLA del producto (25-sep-2026, API 0.0.36) — se monta la PÁGINA
 * completa (`/admin/inventory/[id]`) con el API simulado.
 *
 * Pedido del cliente con capturas: «al entrar algún producto nos están
 * llenando de información repetida… Solo necesitamos el apartado de: Compras
 * | Ventas | Resumen de ventas», «el tipo de cambio… el mismo de las
 * cotizaciones», «la descripción detallada · a cuánto se ha comprado · en
 * cuánto se ha estado vendiendo · dinero generado por ese producto».
 *
 * Datos REALES de prod (SELECT 25-sep-2026): aceite 15W-50 tras la migración
 * de T.C. (contrato §6.4) y el «Aceite mineral aeronáutico SAE 50» de la
 * captura (9 qt × $21.25 USD al T.C. 17.0115 ⇒ $3,253.45 MXN, sin ventas).
 * La lógica pura vive en `lib/admin/__tests__/inventario-ficha.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  InventarioItemDetail,
  InventarioItemResumen,
  InventarioMovimiento,
  ResumenCompra,
  ResumenVenta,
} from "@/types/inventory";

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("404");
  },
  useRouter: () => ({ refresh: () => {}, push: () => {}, back: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/inventory/x",
}));
vi.mock("@/app/admin/inventory/actions", () => ({
  updateMovimientoCostoAction: vi.fn(),
  previewEliminarMovimientoAction: vi.fn(),
  eliminarMovimientoAction: vi.fn(),
  createMovimientoAction: vi.fn(),
  createItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  createEmpaqueAction: vi.fn(),
  updateEmpaqueAction: vi.fn(),
  deleteEmpaqueAction: vi.fn(),
}));
vi.mock("@/lib/download", () => ({ descargarDelApi: vi.fn() }));
vi.mock("@/lib/storage/inventario-fotos", () => ({ uploadInventarioFoto: vi.fn() }));

// El API simulado: cada prueba fija lo que responde.
const api: {
  item: InventarioItemDetail | null;
  resumen: InventarioItemResumen | null;
  rol: string;
} = { item: null, resumen: null, rol: "ADMIN" };

vi.mock("@/lib/api/inventory-server", () => ({
  getInventarioItem: async () => api.item,
  getInventarioItemResumen: async () => api.resumen,
  listMovimientosEliminados: async () => ({ disponible: true, filas: [], falla: false }),
  listUbicaciones: async () => ({ disponible: false, data: [], falla: false }),
}));
vi.mock("@/lib/api/aircraft", () => ({ listAircraft: async () => ({ data: [] }) }));
vi.mock("@/lib/api/providers-server", () => ({ listProviders: async () => ({ data: [] }) }));
vi.mock("@/lib/api/me", () => ({ getMe: async () => ({ rol: api.rol }) }));

const { default: InventoryItemPage } = await import("@/app/admin/inventory/[id]/page");
const { ResumenProducto } = await import("../resumen-producto");
const { AvisoSalidasCosto } = await import("../aviso-salidas-costo");

const ID_15W50 = "d99df930-16e2-499a-877a-37e9518c1041";
const ID_SAE50 = "53d05d76-0353-4890-82f7-cfdc280614ae";

async function renderPagina(id: string): Promise<string> {
  const el = await InventoryItemPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(el);
}

// ───────────────────────── Fixtures (prod, 25-sep-2026) ─────────────────────────

const mov = (m: Partial<InventarioMovimiento>): InventarioMovimiento => ({
  id: "x",
  item_id: ID_15W50,
  tipo: "ENTRADA",
  cantidad: 1,
  costo_unitario_usd: 0,
  aeronave_id: null,
  proveedor_id: null,
  fecha_movimiento: "2026-08-29",
  fecha_orden: null,
  fecha_cargo_banco: null,
  referencia: null,
  notas: null,
  registrado_por: "u",
  created_at: "2026-08-29T17:36:43Z",
  ...m,
});

const item15w50 = (extra: Partial<InventarioItemDetail> = {}): InventarioItemDetail => ({
  id: ID_15W50,
  nombre: "Aceite multigrado semisintético 15W-50",
  numero_parte: "AeroShell 15W-50 (SAE J1899 / MIL-L-22851)",
  codigo: "021400062153",
  categoria: "Lubricantes y Fluidos",
  marca: "AeroShell",
  stock_minimo: 30,
  unidad: "cuarto (qt)",
  ubicacion: "Corner",
  ubicacion_id: null,
  ubicacion_nombre: null,
  ubicacion_legado: "Corner",
  descripcion:
    "Aceite principal de motores de pistón. Multigrado semisintético con aditivo antidesgaste. Aeronave/uso: C205 / T206 / T206H / Seneca V.",
  notas: null,
  activo: true,
  created_at: "2026-07-13T15:37:31Z",
  updated_at: "2026-09-22T14:14:18Z",
  empaques: [],
  stock: 84,
  valor_usd: 1785,
  costo_fifo_actual: 21.25,
  valor_mxn: 31546.13,
  valor_usd_sin_tc: 0,
  pesos_exactos: true,
  costo_fifo_mxn_actual: 375.55,
  bajo_stock: false,
  movimientos: [
    mov({
      id: "e3f20592-cedb-47d2-801d-1c7aa09555d2",
      tipo: "ENTRADA",
      cantidad: 30,
      moneda: "MXN",
      costo_unitario_usd: 94.71,
      costo_unitario_mxn: 1658.33,
      tc_usd_mxn: 17.51,
      fecha_movimiento: "2026-07-13",
      fija_precio: true,
      es_precio_vigente: false,
      salidas_con_este_precio: 3,
      salidas_sin_cargo: 0,
    }),
    mov({
      id: "a614e7af-6b74-4f97-8a34-1277c97ffcf0",
      tipo: "ENTRADA",
      cantidad: 120,
      moneda: "USD",
      costo_unitario_usd: 21.25,
      tc_usd_mxn: 17.0115,
      referencia: "Conteo físico VTF-INV-001",
      fija_precio: true,
      es_precio_vigente: true,
      salidas_con_este_precio: 2,
      salidas_sin_cargo: 0,
    }),
    mov({
      id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
      tipo: "SALIDA",
      cantidad: 12,
      moneda: "USD",
      costo_unitario_usd: 21.25,
      tc_usd_mxn: 17.0077,
      venta_unitaria: 26.5625,
      venta_moneda: "USD",
      fecha_movimiento: "2026-09-01",
      aeronave: { matricula: "XA-VGV" },
      ganancia_mxn: 1084.24,
      ganancia_usd_original: 63.75,
    }),
  ],
  ...extra,
});

const compra = (c: Partial<ResumenCompra>): ResumenCompra => ({
  movimiento_id: null,
  fecha: "2026-08-29",
  tipo: "ENTRADA",
  cantidad: 1,
  precio_unitario_mxn: null,
  total_mxn: null,
  moneda_captura: "USD",
  costo_unitario_capturado: 0,
  tc_usd_mxn: null,
  sin_costo: false,
  sin_tc: false,
  proveedor_nombre: null,
  aeronave_matricula: null,
  referencia: null,
  descripcion: "",
  stock_despues: 0,
  compra_id: null,
  ...c,
});

const venta = (v: Partial<ResumenVenta>): ResumenVenta => ({
  movimiento_id: null,
  fecha: "2026-09-01",
  cantidad: 1,
  precio_unitario_mxn: null,
  total_mxn: null,
  venta_moneda: null,
  venta_unitaria_capturada: null,
  a_costo: false,
  sin_tc: false,
  costo_fifo_mxn: null,
  ganancia_mxn: null,
  vendido_a: "—",
  aeronave_id: null,
  para_flota: false,
  referencia: null,
  descripcion: "",
  remanente: 0,
  gasto_id: null,
  ...v,
});

const aCosto = (id: string, fecha: string, cant: number, avion: string, mxn: number) =>
  venta({
    movimiento_id: id,
    fecha,
    cantidad: cant,
    a_costo: true,
    precio_unitario_mxn: 1658.33,
    total_mxn: mxn,
    costo_fifo_mxn: mxn,
    vendido_a: avion,
    precio_unitario: 1658.33,
    moneda: "MXN",
    total: mxn,
    tc_venta: 17.51,
    costo_unitario: 1658.33,
    costo_moneda: "MXN",
    costo_total: mxn,
    costo_mxn: mxn,
  });

/** Aceite 15W-50 con el API 0.0.36 y la migración de T.C. aplicada (contrato §6.4). */
function resumen15w50(extraTotales: Partial<InventarioItemResumen["totales"]> = {}): InventarioItemResumen {
  return {
    item: {
      id: ID_15W50,
      nombre: "Aceite multigrado semisintético 15W-50",
      numero_parte: "AeroShell 15W-50 (SAE J1899 / MIL-L-22851)",
      unidad: "cuarto (qt)",
      categoria: "Lubricantes y Fluidos",
      precio_venta: null,
      precio_venta_moneda: null,
    },
    moneda: "MXN",
    margen_venta_pct: 25,
    regla_costo: "ULTIMO_PRECIO",
    tc_hoy: { tc: 17.6729, fecha_dato: "2026-09-25", fuente: "OPEN_ER_API" },
    precio_vigente: {
      movimiento_id: "a614e7af-6b74-4f97-8a34-1277c97ffcf0",
      fecha: "2026-08-29",
      moneda: "USD",
      unitario: 21.25,
      unitario_usd: 21.25,
      unitario_mxn: null,
      tc_compra: 17.0115,
      unitario_mxn_hoy: 375.55,
      siguiente_salida: { venta_unitaria: 26.5625, moneda: "USD", origen: "MARGEN" },
    },
    periodo: null,
    compras: [
      compra({
        movimiento_id: "e3f20592-cedb-47d2-801d-1c7aa09555d2",
        fecha: "2026-07-13",
        cantidad: 30,
        precio_unitario_mxn: 1658.33,
        total_mxn: 49749.9,
        moneda_captura: "MXN",
        costo_unitario_capturado: 1658.33,
        tc_usd_mxn: 17.51,
        stock_despues: 30,
        precio_unitario: 1658.33,
        moneda: "MXN",
        total: 49749.9,
        total_usd: 2841.3,
        fija_precio: true,
        es_precio_vigente: false,
      }),
      compra({
        movimiento_id: "a614e7af-6b74-4f97-8a34-1277c97ffcf0",
        fecha: "2026-08-29",
        cantidad: 120,
        precio_unitario_mxn: 361.49,
        total_mxn: 43379.33,
        moneda_captura: "USD",
        costo_unitario_capturado: 21.25,
        tc_usd_mxn: 17.0115,
        referencia: "Conteo físico VTF-INV-001",
        stock_despues: 120,
        precio_unitario: 21.25,
        moneda: "USD",
        total: 2550,
        total_usd: 2550,
        fija_precio: true,
        es_precio_vigente: true,
      }),
    ],
    ventas: [
      aCosto("d45dae06-7478-4f33-a412-00ae6a57e588", "2026-07-17", 4, "N4142R", 6633.32),
      aCosto("a9378a18-54e1-4259-b65a-35de6dd533c0", "2026-07-20", 2, "XB-PEV", 3316.66),
      aCosto("533fce35-6088-432b-b41f-a242aa471b42", "2026-08-06", 24, "N990GG", 39799.92),
      venta({
        movimiento_id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
        cantidad: 12,
        precio_unitario_mxn: 451.77,
        total_mxn: 5421.2,
        venta_moneda: "USD",
        venta_unitaria_capturada: 26.5625,
        costo_fifo_mxn: 4336.96,
        ganancia_mxn: 1084.24,
        venta_total: 318.75,
        costo_fifo_usd: 255,
        ganancia_usd: null,
        moneda_utilidad: "MXN",
        utilidad_incompleta: false,
        vendido_a: "XA-VGV",
        referencia: "0",
        precio_unitario: 26.5625,
        moneda: "USD",
        total: 318.75,
        tc_venta: 17.0077,
        costo_unitario: 21.25,
        costo_moneda: "USD",
        costo_total: 255,
        costo_mxn: 4336.96,
        venta_total_usd_original: 318.75,
        costo_usd_original: 255,
        ganancia_usd_original: 63.75,
      }),
      venta({
        movimiento_id: "19b737b8-790d-4fbb-b4bb-dd3aaa7e9fd7",
        cantidad: 24,
        precio_unitario_mxn: 451.77,
        total_mxn: 10842.41,
        venta_moneda: "USD",
        venta_unitaria_capturada: 26.5625,
        costo_fifo_mxn: 8673.93,
        ganancia_mxn: 2168.48,
        venta_total: 637.5,
        costo_fifo_usd: 510,
        ganancia_usd: null,
        moneda_utilidad: "MXN",
        vendido_a: "N4142R",
        referencia: "0",
        precio_unitario: 26.5625,
        moneda: "USD",
        total: 637.5,
        tc_venta: 17.0077,
        costo_unitario: 21.25,
        costo_moneda: "USD",
        costo_total: 510,
        costo_mxn: 8673.93,
        venta_total_usd_original: 637.5,
        costo_usd_original: 510,
        ganancia_usd_original: 127.5,
      }),
    ],
    resumen_diario: [
      { fecha: "2026-07-13", entradas_cant: 30, salidas_cant: 0, existencia_cierre: 30, ventas_mxn: null, costo_ventas_mxn: null, utilidad_mxn: null, sin_tc: false },
      { fecha: "2026-08-06", entradas_cant: 0, salidas_cant: 24, existencia_cierre: 0, ventas_mxn: null, costo_ventas_mxn: null, utilidad_mxn: null, sin_tc: false },
      { fecha: "2026-08-29", entradas_cant: 120, salidas_cant: 0, existencia_cierre: 120, ventas_mxn: null, costo_ventas_mxn: null, utilidad_mxn: null, sin_tc: false },
      {
        fecha: "2026-09-01",
        entradas_cant: 0,
        salidas_cant: 36,
        existencia_cierre: 84,
        ventas_mxn: 16263.61,
        costo_ventas_mxn: 13010.89,
        utilidad_mxn: 3252.72,
        ventas_usd: null,
        costo_ventas_usd: null,
        utilidad_usd: null,
        utilidad_usd_original: 191.25,
        sin_tc: false,
      },
    ],
    totales: {
      compras_cant: 150,
      compras_mxn: 93129.23,
      // Como lo manda el API (`bloquesCardexDe`): `ventas_cant` = TODAS las
      // salidas (4 + 2 + 24 a costo + 12 + 24 con precio = 66) y
      // `unidades_vendidas` = solo las CON precio (36).
      ventas_cant: 66,
      ventas_mxn: 16263.61,
      ventas_a_costo_mxn: 49749.9,
      costo_ventas_mxn: 13010.89,
      utilidad_mxn: 3252.72,
      ventas_usd: null,
      costo_ventas_usd: null,
      utilidad_usd: null,
      ventas_sin_utilidad: 0,
      con_entradas_sin_costo: false,
      con_movimientos_sin_tc: false,
      existencia_actual: 84,
      valor_costo_mxn: 31546.13,
      ventas_usd_original: 956.25,
      costo_ventas_usd_original: 765,
      utilidad_usd_original: 191.25,
      salidas_a_costo_cant: 30,
      unidades_vendidas: 36,
      movimientos_sin_tc: 0,
      ...extraTotales,
    },
    dinero_generado: {
      vendido_mxn: 16263.61,
      costo_mxn: 13010.89,
      utilidad_mxn: 3252.72,
      vendido_usd_original: 956.25,
      utilidad_usd_original: 191.25,
      unidades_vendidas: 36,
      cargado_a_costo_mxn: 49749.9,
      unidades_a_costo: 30,
      ventas_sin_utilidad: 0,
      utilidad_usd_sin_tc: null,
    },
  };
}

/** Texto visible (sin etiquetas) para buscar frases que cruzan elementos. */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// ───────────────────────── Pruebas ─────────────────────────

describe("ficha del producto · API 0.0.36 (aceite 15W-50 tras la migración de T.C.)", () => {
  it("SOLO Compras | Ventas | Resumen + «Dinero generado»: sin la tira de KPIs ni «Utilidad por salida»", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const html = await renderPagina(ID_15W50);
    for (const fuera of ["Stock actual", "Stock mínimo", "Costo FIFO", "Valorizado", "Utilidad por salida", "Precio de venta<"]) {
      expect(html).not.toContain(fuera);
    }
    for (const bloque of [">Compras<", ">Ventas<", ">Resumen<", "Dinero generado por este producto"]) {
      expect(html).toContain(bloque);
    }
    // Con `regla_costo` la palabra «FIFO» no aparece en ningún lado.
    expect(html).not.toMatch(/FIFO/);
  });

  it("cabecera: descripción COMPLETA, aeronave/uso en su renglón y los tres botones (Editar ≠ menú de ItemActions)", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const t = texto(await renderPagina(ID_15W50));
    expect(t).toContain(
      "Aceite principal de motores de pistón. Multigrado semisintético con aditivo antidesgaste.",
    );
    expect(t).toContain("Aeronave / uso: C205 / T206 / T206H / Seneca V");
    expect(t).toContain("Parte AeroShell 15W-50 (SAE J1899 / MIL-L-22851)");
    expect(t).toContain("Corner (anterior)");
    for (const b of ["Registrar movimiento", "Cardex (Excel)", "Editar"]) expect(t).toContain(b);
    // El menú de la lista trae «Registrar salida» y «Desactivar»: aquí no.
    expect(t).not.toContain("Desactivar");
    const src = readFileSync(path.join(__dirname, "../../../../app/admin/inventory/[id]/page.tsx"), "utf8");
    expect(src).toContain("ItemEditButton");
    expect(src).not.toContain("ItemActions");
    const boton = readFileSync(path.join(__dirname, "../item-edit-button.tsx"), "utf8");
    expect(boton).toContain("ItemFormDialog");
    expect(boton).toContain("router.refresh()");
  });

  it("COMPRAS: a cuánto se compró — precio nativo con su T.C., total en pesos y «Precio vigente»", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const t = texto(await renderPagina(ID_15W50));
    expect(t).toContain("$1,658.33 MXN");
    expect(t).toContain("T.C. 17.51 (captura en pesos)");
    expect(t).toContain("$49,749.90 MXN");
    expect(t).toContain("$21.25 USD Precio vigente T.C. 17.0115");
    expect(t).toContain("$43,379.33 MXN $2,550 USD");
    expect(t).toContain("Total compras 150 cuarto (qt) $93,129.23 MXN");
    expect(t).toContain("Precio vigente $21.25 USD · la siguiente salida se cobra a $26.5625 USD (+25 %)");
    // Ya no hay «sin TC · no se cuenta en pesos» ni «$0.00 MXN».
    expect(t).not.toContain("sin T.C.");
    expect(t).not.toContain("$0.00 MXN");
  });

  it("VENTAS: historial de a cuánto se vendió (T.C. del día de la venta) y utilidad en pesos", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const t = texto(await renderPagina(ID_15W50));
    expect(t).toContain("XA-VGV 12 cuarto (qt) $26.5625 USD T.C. 17.0077 $5,421.20 MXN $318.75 USD utilidad +$1,084.24 MXN");
    expect(t).toContain("utilidad +$2,168.48 MXN");
    // Las salidas viejas (jul/ago) a costo: sin utilidad y sin T.C. que confunda.
    expect(t).toContain("N990GG 24 cuarto (qt) $1,658.33 MXN a costo $39,799.92 MXN A costo · sin utilidad");
    expect(t).toContain("Total vendido");
    expect(t).toContain("+ $49,749.90 MXN cargados a costo (30 cuarto (qt))");
    // Las unidades del total son las VENDIDAS (36, `unidades_vendidas`), las
    // mismas que suman los $16,263.61 — no las 66 salidas del bloque (que
    // incluyen las 30 a costo, dichas aparte).
    expect(t).toContain("36 cuarto (qt) $16,263.61 MXN");
    expect(t).not.toContain("66 cuarto (qt)");
  });

  it("VENTAS con un API previo (sin `unidades_vendidas`): el conteo de siempre", () => {
    const base = resumen15w50();
    const { unidades_vendidas: _u, ...totalesPrevios } = base.totales;
    void _u;
    const t = texto(
      renderToStaticMarkup(<ResumenProducto resumen={{ ...base, totales: totalesPrevios }} />),
    );
    expect(t).toContain("66 cuarto (qt) $16,263.61 MXN");
  });

  it("VENTAS solo a costo (sin ninguna con precio): «—» en unidades vendidas, lo cargado aparte", () => {
    const base = resumen15w50();
    const t = texto(
      renderToStaticMarkup(
        <ResumenProducto
          resumen={{
            ...base,
            totales: {
              ...base.totales,
              ventas_cant: 30,
              ventas_mxn: null,
              costo_ventas_mxn: null,
              utilidad_mxn: null,
              unidades_vendidas: null,
            },
          }}
        />,
      ),
    );
    expect(t).toContain("Total vendido + $49,749.90 MXN cargados a costo (30 cuarto (qt)) — —");
    expect(t).not.toContain("30 cuarto (qt) —");
  });

  it("RESUMEN + «Dinero generado»: pesos, con el dólar original como dato secundario", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const t = texto(await renderPagina(ID_15W50));
    expect(t).toContain("Hoy 84 cuarto (qt) +$3,252.72 MXN");
    expect(t).toContain("Vendido $16,263.61 MXN · Utilidad +$3,252.72 MXN");
    expect(t).toContain("En dólares: vendido $956.25 USD · utilidad +$191.25 USD (al T.C. de cada venta)");
    expect(t).toContain("Además se cargaron $49,749.90 MXN a costo (30 cuarto (qt), sin utilidad).");
    expect(t).toContain("el mismo de las cotizaciones");
    // Jamás una suma de monedas: 3,252.72 + 191.25 no aparece.
    expect(t).not.toContain("3,443.97");
  });

  it("los dos <details> van CERRADOS, con el contenido MONTADO y summary con cursor-pointer", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    const html = await renderPagina(ID_15W50);
    const details = html.match(/<details[^>]*>/g) ?? [];
    const plegables = details.filter((d) => /id="(cardex|empaques-fotos)"/.test(d));
    expect(plegables).toHaveLength(2);
    for (const d of plegables) expect(d).not.toMatch(/\sopen(=|\s|>)/);
    const summaries = html.match(/<summary[^>]*>/g) ?? [];
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    for (const s of summaries) expect(s).toContain("cursor-pointer");
    const t = texto(html);
    expect(t).toContain("Empaques y fotos · Sin empaques · sin fotos");
    expect(t).toContain("Cardex completo · 3 movimientos · aquí se corrige un costo o se elimina un movimiento");
    // Montado aunque esté cerrado: el cardex con «Editar costo» (ADMIN) y las cards de empaques/fotos.
    expect(t).toContain("Editar costo");
    expect(t).toContain("Fotos");
    // El orden: primero la ficha, al fondo los plegables.
    expect(html.indexOf("Dinero generado por este producto")).toBeLessThan(html.indexOf('id="empaques-fotos"'));
    expect(html.indexOf('id="empaques-fotos"')).toBeLessThan(html.indexOf('id="cardex"'));
  });

  it("banda naranja SOLO con `movimientos_sin_tc > 0` (antes de la migración)", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50();
    expect(texto(await renderPagina(ID_15W50))).not.toContain("todavía no");
    api.resumen = resumen15w50({ movimientos_sin_tc: 3, con_movimientos_sin_tc: true });
    expect(texto(await renderPagina(ID_15W50))).toContain(
      "3 movimientos en dólares todavía no tienen tipo de cambio",
    );
  });

  it("«bajo el mínimo» en el pie del Resumen, en ámbar, SOLO con bajo_stock", async () => {
    api.resumen = resumen15w50();
    api.item = item15w50({ bajo_stock: true, stock: 20, stock_minimo: 30 });
    const html = await renderPagina(ID_15W50);
    expect(html).toMatch(/text-amber-700[^"]*">bajo el mínimo \(mín\. 30\)</);
    api.item = item15w50();
    expect(await renderPagina(ID_15W50)).not.toContain("bajo el mínimo");
  });

  it("compras a $0: el aviso enlaza `#cardex` (que abre el plegable), con cursor-pointer", async () => {
    api.item = item15w50();
    api.resumen = resumen15w50({ con_entradas_sin_costo: true });
    const html = await renderPagina(ID_15W50);
    expect(html).toMatch(/<a href="#cardex" class="cursor-pointer[^"]*">Abrir el cardex para corregir el costo<\/a>/);
  });

  it("el plegable escucha `hashchange` (un enlace en la MISMA página no remonta nada) y no usa localStorage", () => {
    const src = readFileSync(path.join(__dirname, "../ficha-plegable.tsx"), "utf8");
    expect(src).toContain('addEventListener("hashchange"');
    expect(src).toContain('removeEventListener("hashchange"');
    expect(src).toContain("abrePorHash(");
    // Segundo clic con el hash YA puesto (se abrió, se cerró, se vuelve a
    // pulsar): no hay `hashchange`, así que también escucha el clic.
    expect(src).toContain('document.addEventListener("click"');
    expect(src).toContain('document.removeEventListener("click"');
    expect(src).toContain('closest(\'a[href^="#"]\')');
    expect(src).not.toMatch(/localStorage\./);
  });
});

describe("la captura del cliente: «Aceite mineral aeronáutico SAE 50»", () => {
  it("9 qt × $21.25 USD al T.C. 17.0115 ⇒ $3,253.45 MXN; sin ventas; sin banda", async () => {
    api.item = item15w50({
      id: ID_SAE50,
      nombre: "Aceite mineral aeronáutico SAE 50",
      numero_parte: "AeroShell W100 (o 100 Plus) — SAE 50",
      codigo: null,
      ubicacion: "Bodega Cancún",
      ubicacion_legado: "Bodega Cancún",
      stock_minimo: 0,
      descripcion:
        "Aceite monogrado de motor de pistón. Uso en asentamiento de cilindros y operación en clima cálido. Aeronave/uso: C205 / T206 / T206H / Seneca V.",
      movimientos: [],
    });
    const base = resumen15w50();
    api.resumen = {
      ...base,
      item: { ...base.item, id: ID_SAE50, nombre: "Aceite mineral aeronáutico SAE 50" },
      precio_vigente: {
        ...base.precio_vigente!,
        movimiento_id: "590445ca-cedb-47d2-801d-1c7aa09555d2",
      },
      compras: [
        compra({
          movimiento_id: "590445ca-cedb-47d2-801d-1c7aa09555d2",
          cantidad: 9,
          precio_unitario_mxn: 361.49,
          total_mxn: 3253.45,
          costo_unitario_capturado: 21.25,
          tc_usd_mxn: 17.0115,
          referencia: "Alta masiva VTF-INV-001",
          stock_despues: 9,
          precio_unitario: 21.25,
          moneda: "USD",
          total: 191.25,
          total_usd: 191.25,
          fija_precio: true,
          es_precio_vigente: true,
        }),
      ],
      ventas: [],
      resumen_diario: [
        { fecha: "2026-08-29", entradas_cant: 9, salidas_cant: 0, existencia_cierre: 9, ventas_mxn: null, costo_ventas_mxn: null, utilidad_mxn: null, sin_tc: false },
      ],
      totales: {
        ...base.totales,
        compras_cant: 9,
        compras_mxn: 3253.45,
        ventas_cant: null,
        ventas_mxn: null,
        ventas_a_costo_mxn: null,
        costo_ventas_mxn: null,
        utilidad_mxn: null,
        existencia_actual: 9,
        ventas_usd_original: null,
        costo_ventas_usd_original: null,
        utilidad_usd_original: null,
        salidas_a_costo_cant: null,
        unidades_vendidas: null,
      },
      dinero_generado: {
        vendido_mxn: null,
        costo_mxn: null,
        utilidad_mxn: null,
        vendido_usd_original: null,
        utilidad_usd_original: null,
        unidades_vendidas: null,
        cargado_a_costo_mxn: null,
        unidades_a_costo: null,
        ventas_sin_utilidad: 0,
        utilidad_usd_sin_tc: null,
      },
    };
    const t = texto(await renderPagina(ID_SAE50));
    expect(t).toContain("Aceite mineral aeronáutico SAE 50");
    expect(t).toContain(
      "Aceite monogrado de motor de pistón. Uso en asentamiento de cilindros y operación en clima cálido.",
    );
    expect(t).toContain("$21.25 USD Precio vigente T.C. 17.0115 $3,253.45 MXN $191.25 USD");
    expect(t).toContain("Total compras 9 cuarto (qt) $3,253.45 MXN");
    expect(t).toContain("Sin ventas todavía");
    expect(t).toContain("Todavía no se ha vendido este producto.");
    expect(t).not.toContain("sin tipo de cambio");
    expect(t).not.toContain("$0.00 MXN");
    expect(t).toContain("Bodega Cancún (anterior)");
  });
});

describe("API PREVIO (0.0.35, sin los aditivos): se pinta sin romper y SIN sumar monedas", () => {
  it("ventas USD sin T.C.: utilidad en dólares aparte, banda de siempre, nota vieja", () => {
    const base = resumen15w50();
    const previo: InventarioItemResumen = {
      item: base.item,
      moneda: "MXN",
      margen_venta_pct: 25,
      periodo: null,
      compras: [
        compra({
          fecha: "2026-08-29",
          cantidad: 120,
          moneda_captura: "USD",
          costo_unitario_capturado: 21.25,
          sin_tc: true,
          stock_despues: 120,
        }),
      ],
      ventas: [
        venta({
          cantidad: 12,
          venta_moneda: "USD",
          venta_unitaria_capturada: 26.5625,
          sin_tc: true,
          venta_total: 318.75,
          costo_fifo_usd: 255,
          ganancia_usd: 63.75,
          moneda_utilidad: "USD",
          vendido_a: "XA-VGV",
        }),
      ],
      resumen_diario: [],
      totales: {
        compras_cant: 150,
        compras_mxn: 49749.9,
        ventas_cant: 36,
        ventas_mxn: null,
        ventas_a_costo_mxn: 49749.9,
        costo_ventas_mxn: null,
        utilidad_mxn: null,
        ventas_usd: 956.25,
        costo_ventas_usd: 765,
        utilidad_usd: 191.25,
        ventas_sin_utilidad: 0,
        con_entradas_sin_costo: false,
        con_movimientos_sin_tc: true,
        existencia_actual: 84,
        valor_costo_mxn: 0,
      },
    };
    const t = texto(renderToStaticMarkup(<ResumenProducto resumen={previo} />));
    expect(t).toContain("$21.25 USD");
    expect(t).toContain("sin T.C. · no se cuenta en pesos");
    expect(t).toContain("utilidad +$63.75 USD");
    expect(t).toContain("Utilidad en ventas sin tipo de cambio: +$191.25 USD (en dólares, no se suma a los pesos).");
    expect(t).toContain("Hay movimientos capturados en dólares sin tipo de cambio");
    // Con el API previo el costo SÍ era FIFO: la nota lo dice.
    expect(t).toContain("costo FIFO");
    // Nunca un total cruzado: 49,749.90 MXN + 956.25 USD no se suman.
    expect(t).not.toContain("50,706.15");
  });

  it("sin resumen (el API no lo tiene): aviso, nunca «sin datos»", () => {
    expect(texto(renderToStaticMarkup(<ResumenProducto resumen={null} />))).toContain(
      "No se pudieron cargar las compras, ventas y utilidad de este producto",
    );
  });
});

describe("«Corregir el costo de la compra»: nada cambia en silencio (D7)", () => {
  it("recuadro ámbar con la lista, el renglón ROJO de las salidas sin cargo y «Guardar de todos modos»", () => {
    const html = renderToStaticMarkup(
      <AvisoSalidasCosto
        confirmacion={{
          n: 2,
          sinCargo: 1,
          salidas: [
            {
              id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
              fecha: "2026-09-01",
              cantidad: 12,
              costo_unitario: 21.25,
              moneda: "USD",
              sin_cargo: false,
              vendido_a: "XA-VGV",
            },
            {
              id: "s2",
              fecha: "2026-09-03",
              cantidad: 2,
              costo_unitario: 0,
              moneda: "USD",
              sin_cargo: true,
              vendido_a: "N4142R",
            },
          ],
        }}
        unidad="qt"
        onConfirmar={() => {}}
      />,
    );
    const t = texto(html);
    expect(t).toContain("Este precio ya se usó en 2 salidas: conservan su costo y lo que se cobró al avión.");
    expect(t).toContain("01 sep 2026 · 12 qt · XA-VGV · costo $21.25 USD");
    expect(t).toContain("03 sep 2026 · 2 qt · N4142R · sin cargo ($0)");
    expect(html).toMatch(/text-red-600[^"]*">1 de esas salidas salió a costo \$0 y NO se cobró al avión/);
    expect(html).toMatch(/<button[^>]*cursor-pointer[^>]*>Guardar de todos modos<\/button>/);
  });

  it("sin salidas sin cargo, no hay renglón rojo; con solo los conteos (sin lista) igual avisa", () => {
    const t = texto(
      renderToStaticMarkup(
        <AvisoSalidasCosto confirmacion={{ n: 3, sinCargo: 0, salidas: [] }} onConfirmar={() => {}} />,
      ),
    );
    expect(t).toContain("Este precio ya se usó en 3 salidas");
    expect(t).not.toContain("NO se cobr");
  });

  it("CABLEADO: el primer «Guardar» decide con `decidirGuardarCosto` (no llama a la acción) y el 409 abre el recuadro", () => {
    const src = readFileSync(path.join(__dirname, "../editar-costo-dialog.tsx"), "utf8");
    expect(src).toContain("decidirGuardarCosto(");
    // Con salidas: se muestra el recuadro y se sale ANTES de enviar.
    expect(src).toMatch(/if \(d\.tipo === "CONFIRMAR"\) \{\s*setConfirmacion\(d\.confirmacion\);\s*return;\s*\}/);
    expect(src).toContain("confirmacionDeConflicto(result)");
    expect(src).toContain("enviar(values, true)");
    expect(src).toContain("TITULO_EDITAR_COSTO");
    expect(src).toContain("HINT_TC_OPCIONAL");
    const cardex = readFileSync(path.join(__dirname, "../cardex-con-edicion.tsx"), "utf8");
    expect(cardex).toContain("salidasConEstePrecio: m.salidas_con_este_precio");
    expect(cardex).toContain("salidasSinCargo: m.salidas_sin_cargo");
  });

  it("CABLEADO: la server action manda `confirmar_salidas: true` SOLO confirmado y devuelve `details`", () => {
    const src = readFileSync(path.join(__dirname, "../../../../app/admin/inventory/actions.ts"), "utf8");
    expect(src).toContain('opts.confirmarSalidas === true ? { confirmar_salidas: true } : {}');
    expect(src).toMatch(/details: err\.details/);
  });
});

describe("cableado de la SALIDA (movimiento-dialog)", () => {
  const src = readFileSync(path.join(__dirname, "../movimiento-dialog.tsx"), "utf8");

  it("la venta sale de `ventaDelFormulario` y el vacío YA NO viaja como 0", () => {
    expect(src).toContain("ventaDelFormulario(");
    expect(src).not.toMatch(/venta_unitaria:\s*"0"/);
  });

  it("casilla «Cargar a costo, sin utilidad», toast con `textoSalidaRegistrada` y el `aviso` del API", () => {
    expect(src).toContain("ETIQUETA_A_COSTO");
    expect(src).toContain("textoSalidaRegistrada(");
    expect(src).toContain("textoAvisoSalida(result.data?.aviso, result.data?.aviso_mensaje)");
  });

  it("T.C. OPCIONAL en pesos (el oficial del día) y sin conversiones locales", () => {
    expect(src).toContain("HINT_TC_OPCIONAL");
    expect(src).toContain("NOTA_TC_USD");
    expect(src).not.toMatch(/USD c\/u/);
    expect(src).not.toMatch(/FIFO/);
  });

  it("el T.C. oculto (dólares) no viaja: los dos diálogos pasan por `tcQueViaja`", () => {
    expect(src).toContain("tc_usd_mxn: tcQueViaja({ tipo: values.tipo, moneda: values.moneda, tc: values.tc_usd_mxn })");
    const costo = readFileSync(path.join(__dirname, "../editar-costo-dialog.tsx"), "utf8");
    expect(costo).toContain("tc_usd_mxn: tcQueViaja({ moneda: values.moneda, tc: values.tc_usd_mxn })");
    expect(costo).toContain("updateMovimientoCostoAction(movimiento.itemId, movimiento.id, cuerpo,");
  });
});
