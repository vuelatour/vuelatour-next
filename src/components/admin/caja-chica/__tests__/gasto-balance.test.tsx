/**
 * Caja chica: el renglón de un GASTO dice más del gasto y lleva «Ver en
 * balance…» (15-oct-2026). Palabras del cliente con la captura del fondo de
 * Pablo Canales: «aquí necesito más información en la fila sobre el gasto y
 * estaría genial que se mande a la celda en los balances» y «que diga en qué
 * hoja del excel del balance está».
 *
 * Qué se custodia:
 *  1. el detalle (`detalleGastoFondo`): categoría canónica, avión con
 *     `estadoAvionGasto`, proveedor o lugar, comprobante, la línea de la hoja
 *     y los enlaces SOLO para quien abre balances;
 *  2. la fila: categoría · avión · proveedor · comprobante · facturación, la
 *     hoja del Excel para CUALQUIER rol, los enlaces `<a target="_blank">`
 *     hermanos del `<Link>` del folio (nunca un `<a>` dentro de otro);
 *  3. sin `balance` (API previo) ⇒ sin línea ni enlaces, el resto se ve;
 *  4. los renglones de caja quedan intactos;
 *  5. la búsqueda rápida suma categoría, matrícula y proveedor;
 *  6. el cableado de la página (`puedeAbrirBalances`, `detalleGastoFondo`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Gasto } from "@/types/expenses";
import type { UbicacionBalanceGasto } from "@/types/conciliacion";
import type { CajaMovimiento } from "@/types/caja-chica";
import type { MovimientoFondoRow } from "../fondo-historial-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/caja-chica/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/descargar-archivo", () => ({ descargarArchivoDelPanel: () => {} }));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("../movimiento-actions", () => ({
  MovimientoActions: () => <span data-menu="1">⋯</span>,
}));

const { FondoHistorialTable } = await import("../fondo-historial-table");
const { detalleGastoFondo, busquedaDetalleGastoFondo } = await import("@/lib/admin/caja-chica-gasto");

const G_436 = "4360a000-0000-4000-8000-000000000436";
const VUELO_436 = "f4360000-0000-4000-8000-000000000436";
const N4142R = "4142a000-0000-4000-8000-000000000001";
const XA_VGV = "a0a0a0a0-0000-4000-8000-000000000002";
const XB_PEV = "b0b0b0b0-0000-4000-8000-000000000003";
const N621TX = "621a0000-0000-4000-8000-000000000004";

const GASTO_436 = {
  id: G_436,
  categoria: "OPERACIONES",
  monto: "500.00",
  moneda: "MXN",
  aeronave_id: N4142R,
  aeronave: { matricula: "N4142R" },
  vuelo_id: VUELO_436,
  vuelo: { folio: "436" },
  repartos: [],
  proveedor: { nombre: "Estacionamiento ASUR" },
  lugar: "Cancún",
  estatus_comprobante: "FACTURA",
  estatus_facturacion: "PENDIENTE",
} as unknown as Gasto;

const OCT_N4142R: UbicacionBalanceGasto = {
  periodo: { desde: "2026-10-01", hasta: "2026-10-31" },
  eje: "vuelo",
  aviones: [{ id: N4142R, matricula: "N4142R" }],
  general: true,
  hoja_avion: "reporte_horas",
  hoja_general: "reporte_horas",
};

const HOJA_436 =
  "Balance de N4142R (oct 2026): hoja «reporte horas N4142R» · Balance general: hoja «reporte horas FLOTA»";

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    id: "m",
    fondo_id: "f",
    tipo: "REPOSICION",
    monto: 1070,
    moneda: "MXN",
    fecha: "2026-10-01",
    autorizado_por: null,
    referencia: null,
    notas: null,
    registrado_por: "u",
    created_at: "2026-10-01T12:00:00-05:00",
    ...p,
  };
}

function filaGasto(
  balance: UbicacionBalanceGasto | null | undefined,
  abreBalances: boolean,
  gasto: Gasto | null = GASTO_436,
): MovimientoFondoRow {
  const entrada =
    balance === undefined
      ? { id: G_436, origen: "gasto" as const }
      : { id: G_436, origen: "gasto" as const, balance };
  return {
    key: `gasto-${G_436}`,
    fechaFmt: "10 oct 2026",
    tipoLabel: "Gasto en efectivo",
    esGasto: true,
    descripcion: "Taxi / estacionamiento",
    negativo: true,
    montoAbsFmt: "$500.00",
    saldoFmt: "$1,500.00",
    vueloId: VUELO_436,
    vueloFolio: 436,
    gasto,
    movimiento: null,
    detalleGasto: detalleGastoFondo(entrada, gasto, { abreBalances }),
  };
}

const FILA_CAJA: MovimientoFondoRow = {
  key: "caja-rep",
  fechaFmt: "01 oct 2026",
  tipoLabel: "Reposición",
  esGasto: false,
  descripcion: "Fondo de octubre",
  negativo: false,
  montoAbsFmt: "$2,000.00",
  saldoFmt: "$2,000.00",
  vueloId: null,
  vueloFolio: null,
  gasto: null,
  movimiento: mov({ id: "rep-1" }),
  detalleGasto: detalleGastoFondo({ id: "rep-1", origen: "caja" }, null, { abreBalances: true }),
};

function tabla(filas: MovimientoFondoRow[]): string {
  return renderToStaticMarkup(
    <FondoHistorialTable
      movimientos={filas}
      aircraft={[]}
      providers={[]}
      fondoId="f"
      persona="Pablo Canales"
      moneda="MXN"
      usuarios={[]}
    />,
  );
}

const veces = (html: string, texto: string) => html.split(texto).length - 1;
/** Todas las etiquetas <a …> de apertura. */
const anclas = (html: string) => html.match(/<a\b[^>]*>/g) ?? [];

describe("detalleGastoFondo (puro)", () => {
  it("categoría canónica, avión con estadoAvionGasto, proveedor (o lugar), comprobante, hoja y enlaces", () => {
    const d = detalleGastoFondo({ id: G_436, origen: "gasto", balance: OCT_N4142R }, GASTO_436, {
      abreBalances: true,
    });
    expect(d).not.toBeNull();
    expect(d!.categoria).toBe("Operaciones");
    expect(d!.avion).toEqual({ tipo: "AVION", aeronaveId: N4142R, matricula: "N4142R" });
    expect(d!.proveedorOLugar).toBe("Estacionamiento ASUR");
    expect(d!.comprobante).toBe("Con comprobante");
    expect(d!.hojaBalance).toBe(HOJA_436);
    expect(d!.enlacesBalance?.aviones.map((a) => a.etiqueta)).toEqual(["Ver en balance del avión N4142R"]);
    expect(d!.enlacesBalance?.general?.etiqueta).toBe("Ver en balance general");
    // Sin proveedor: el lugar.
    const sinProv = detalleGastoFondo(
      { id: G_436, origen: "gasto" },
      { ...GASTO_436, proveedor: null } as Gasto,
      { abreBalances: true },
    );
    expect(sinProv!.proveedorOLugar).toBe("Cancún");
  });

  it("sin rol que abre balances ⇒ sin enlaces, PERO con la hoja; renglón de caja ⇒ null", () => {
    const d = detalleGastoFondo({ id: G_436, origen: "gasto", balance: OCT_N4142R }, GASTO_436, {
      abreBalances: false,
    });
    expect(d!.enlacesBalance).toBeNull();
    expect(d!.hojaBalance).toBe(HOJA_436);
    expect(detalleGastoFondo({ id: "rep-1", origen: "caja" }, null, { abreBalances: true })).toBeNull();
  });

  it("sin `balance` (API previo) o `balance: null` ⇒ sin hoja ni enlaces; el resto sí", () => {
    for (const entrada of [
      { id: G_436, origen: "gasto" as const },
      { id: G_436, origen: "gasto" as const, balance: null },
    ]) {
      const d = detalleGastoFondo(entrada, GASTO_436, { abreBalances: true });
      expect(d!.hojaBalance).toBeNull();
      expect(d!.enlacesBalance).toBeNull();
      expect(d!.categoria).toBe("Operaciones");
    }
  });

  it("gasto que no llegó en la lectura de gastos ⇒ igual dice la hoja y los enlaces (salen de la entrada)", () => {
    const d = detalleGastoFondo({ id: G_436, origen: "gasto", balance: OCT_N4142R }, null, { abreBalances: true });
    expect(d!.categoria).toBeNull();
    expect(d!.avion).toBeNull();
    expect(d!.hojaBalance).toBe(HOJA_436);
    expect(d!.enlacesBalance).not.toBeNull();
  });

  it("búsqueda: categoría, matrícula (también las del reparto) y proveedor", () => {
    const d = detalleGastoFondo({ id: G_436, origen: "gasto" }, GASTO_436, { abreBalances: true });
    const q = busquedaDetalleGastoFondo(d);
    for (const t of ["Operaciones", "N4142R", "Estacionamiento ASUR"]) expect(q).toContain(t);
    const repartido = detalleGastoFondo(
      { id: G_436, origen: "gasto" },
      {
        ...GASTO_436,
        categoria: "OTRO",
        aeronave_id: null,
        aeronave: null,
        repartos: [
          { aeronave_id: XA_VGV, monto: "250", aeronave: { matricula: "XA-VGV" } },
          { aeronave_id: XB_PEV, monto: "250", aeronave: { matricula: "XB-PEV" } },
        ],
      } as unknown as Gasto,
      { abreBalances: true },
    );
    expect(busquedaDetalleGastoFondo(repartido)).toContain("XA-VGV");
    expect(busquedaDetalleGastoFondo(repartido)).toContain("XB-PEV");
    expect(busquedaDetalleGastoFondo(null)).toBe("");
  });
});

describe("la fila del gasto en el historial", () => {
  it("con balance y rol que lo abre: más datos, la hoja del Excel y los enlaces hermanos del folio", () => {
    const html = tabla([filaGasto(OCT_N4142R, true)]);
    // Más datos del gasto.
    expect(html).toContain('data-detalle-gasto=""');
    expect(html).toContain(">Operaciones<");
    expect(html).toContain(`href="/admin/aircraft/${N4142R}"`);
    expect(html).toContain(">N4142R<");
    expect(html).toContain("Estacionamiento ASUR");
    expect(html).toContain("Con comprobante");
    // El semáforo de facturación compacto (con manita).
    expect(html).toMatch(/<button[^>]*title="Pendiente · [^"]*"[^>]*cursor-pointer|<button[^>]*cursor-pointer[^>]*title="Pendiente · /);
    // La hoja del Excel.
    expect(html).toContain(`data-hoja-balance="">${HOJA_436}<`);
    // Enlaces: pestaña nueva, con gasto=, cursor-pointer y title con la hoja.
    const balance = anclas(html).filter((a) => a.includes("/admin/reportes/balance"));
    expect(balance).toHaveLength(2);
    for (const a of balance) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain("cursor-pointer");
      expect(a).toContain(`gasto=${G_436}`);
    }
    expect(balance[0]).toContain("hoja «reporte horas N4142R»");
    expect(balance[1]).toContain("hoja «reporte horas FLOTA»");
    // El folio sigue ligando al vuelo (con manita) y NINGÚN <a> queda dentro de otro.
    expect(html).toContain(`href="/admin/flights/${VUELO_436}"`);
    expect(anclas(html).find((a) => a.includes(`/admin/flights/${VUELO_436}`))).toContain("cursor-pointer");
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
  });

  it("rol que NO abre balances: la hoja se ve, los enlaces no", () => {
    const html = tabla([filaGasto(OCT_N4142R, false)]);
    expect(html).toContain('data-hoja-balance=""');
    expect(html).not.toContain("/admin/reportes/balance");
    expect(html).not.toContain("data-enlaces-balance");
  });

  it("sin `balance` (API previo) ⇒ sin línea ni enlaces; los demás datos sí", () => {
    const html = tabla([filaGasto(undefined, true)]);
    expect(html).not.toContain("data-hoja-balance");
    expect(html).not.toContain("/admin/reportes/balance");
    expect(html).toContain("Estacionamiento ASUR");
    expect(html).toContain(">N4142R<");
  });

  it("la categoría no se repite cuando ya es la descripción del renglón", () => {
    const f = filaGasto(undefined, true);
    const html = tabla([{ ...f, descripcion: "Operaciones" }]);
    expect(veces(html, ">Operaciones<")).toBe(1);
  });

  it("«Falta avión» y «VuelaTour» con los MISMOS textos de la columna de Gastos (el title de «Falta avión» sin salidas que aquí no existen)", async () => {
    const { TITULO_FALTA_AVION, TITULO_FALTA_AVION_FUERA_DE_GASTOS, ETIQUETA_FALTA_AVION } =
      await import("@/lib/admin/gasto-avion");
    const falta = filaGasto(undefined, true, {
      ...GASTO_436,
      aeronave_id: null,
      aeronave: null,
      vuelo_id: null,
    } as Gasto);
    const html = tabla([falta]);
    expect(html).toContain(`title="${TITULO_FALTA_AVION_FUERA_DE_GASTOS}"`);
    expect(TITULO_FALTA_AVION_FUERA_DE_GASTOS).toBe(
      "Este gasto necesita avión y no lo tiene. Asígnalo en «Verificar / editar» (menú ⋯).",
    );
    // En el fondo no hay pestaña «Pendientes» ni «Sugerir asignaciones».
    expect(html).not.toContain(TITULO_FALTA_AVION);
    expect(html).not.toContain("Sugerir asignaciones");
    expect(html).not.toContain("«Pendientes»");
    expect(html).toContain(ETIQUETA_FALTA_AVION);
    const empresa = filaGasto(undefined, true, {
      ...GASTO_436,
      categoria: "OTRO",
      aeronave_id: null,
      aeronave: null,
      vuelo_id: null,
    } as Gasto);
    expect(tabla([empresa])).toContain(`title="${empresa.detalleGasto!.avion!.tipo === "FUERA_DEL_AVION" ? empresa.detalleGasto!.avion!.titulo : ""}"`);
    // Repartido: cada matrícula liga a su avión con el monto en el title.
    const rep = filaGasto(undefined, true, {
      ...GASTO_436,
      categoria: "OTRO",
      aeronave_id: null,
      aeronave: null,
      vuelo_id: null,
      repartos: [
        { aeronave_id: N4142R, monto: "200", aeronave: { matricula: "N4142R" } },
        { aeronave_id: N621TX, monto: "200", aeronave: { matricula: "N621TX" } },
      ],
    } as unknown as Gasto);
    const htmlRep = tabla([rep]);
    expect(htmlRep).toContain("Repartido:");
    expect(htmlRep).toContain(`href="/admin/aircraft/${N621TX}"`);
    expect(htmlRep).toContain('title="Parte que absorbe la empresa: ');
  });

  it("el renglón de caja queda intacto (sin detalle, sin hoja, sin enlaces)", () => {
    const html = tabla([FILA_CAJA]);
    expect(FILA_CAJA.detalleGasto).toBeNull();
    expect(html).toContain("Reposición");
    expect(html).toContain("Fondo de octubre");
    expect(html).not.toContain("data-detalle-gasto");
    expect(html).not.toContain("data-hoja-balance");
    expect(html).not.toContain("/admin/reportes/balance");
    expect(veces(html, 'data-menu="1"')).toBe(1);
  });

  it("el buscador anuncia lo que suma", () => {
    expect(tabla([filaGasto(undefined, true)])).toContain("categoría, matrícula, proveedor");
  });
});

describe("cableado de la página del fondo", () => {
  const page = readFileSync(path.resolve(__dirname, "../../../../app/admin/caja-chica/[id]/page.tsx"), "utf8");
  const helper = readFileSync(path.resolve(__dirname, "../../../../lib/admin/caja-chica-gasto.ts"), "utf8");
  const tablaSrc = readFileSync(path.resolve(__dirname, "../fondo-historial-table.tsx"), "utf8");

  it("corte por rol con puedeAbrirBalances(me?.rol) y el detalle de cada entrada con detalleGastoFondo", () => {
    expect(page).toContain("const abreBalances = puedeAbrirBalances(me?.rol);");
    expect(page).toContain("detalleGasto: detalleGastoFondo(e, gasto, { abreBalances }),");
  });

  it("los enlaces salen de enlacesBalanceDeGasto con {id, balance} de la entrada; la hoja, de textoHojaBalanceDeGasto", () => {
    expect(helper).toContain("enlacesBalanceDeGasto({ id: entrada.id, balance: entrada.balance })");
    expect(helper).toContain("textoHojaBalanceDeGasto(entrada.balance)");
    expect(helper).toContain("estadoAvionGasto(gasto)");
  });

  it("la tabla pinta el detalle con GastoFondoDetalle y busca con busquedaDetalleGastoFondo", () => {
    expect(tablaSrc).toContain("<GastoFondoDetalle detalle={m.detalleGasto}");
    expect(tablaSrc).toContain("busquedaDetalleGastoFondo(m.detalleGasto)");
  });
});
