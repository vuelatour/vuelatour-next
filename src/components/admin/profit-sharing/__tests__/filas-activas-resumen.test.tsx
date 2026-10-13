/**
 * Fila activa + teclado en las dos tablas de RESUMEN auditables del reparto
 * (13-oct-2026): el desglose por avión (vuelos y gastos por categoría) y el
 * estado de cuenta del socio. Marcado de reposo con `react-dom/server`: el
 * gancho del <tbody>, `data-fila` + tabindex roving por fila navegable, el
 * `data-fila-href` del vuelo que Enter abre (byte a byte el <a> del Folio),
 * el renglón de detalle de la entrega como hija NO navegable, el panel
 * plegado con `inert`, y que los atributos de siempre (`data-movimiento`,
 * `data-en-curso`, botones con la manita) no cambien.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AvionRepartoDetalle } from "@/types/profit-sharing";
import type { MovimientoCuenta, PagoSocio } from "@/types/reparto-pagos";
import type { ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";
import { DesgloseSection } from "../desglose-section";

// Los mismos mocks que cuentas-socios.test.tsx: el estado de cuenta monta
// diálogos que importan la sesión, el router y las server actions.
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing/socios",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));

const { MovimientosCuenta } = await import("../movimientos-cuenta");

const cuenta = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const fila = (html: string, clave: string) =>
  html.match(new RegExp(`<tr[^>]*data-fila="${clave}"[^>]*>`))?.[0] ?? "";
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("DesgloseSection: vuelos y gastos por categoría", () => {
  const DETALLE: AvionRepartoDetalle = {
    vuelos: [
      {
        id: "v1",
        folio: 101,
        fecha: "2026-10-03",
        ruta: "CUN-CZM-CUN",
        es_externo: false,
        total_usd: 1000,
        cobrado_usd: 1000,
        pendiente_usd: 0,
        comision_vendedor_usd: 0,
        cobrado: true,
        cobros_sin_tc_mxn: 0,
      },
      {
        id: "v2",
        folio: 102,
        fecha: "2026-10-05",
        ruta: "CUN-MID-CUN",
        es_externo: false,
        total_usd: 2000,
        cobrado_usd: 500,
        pendiente_usd: 1500,
        comision_vendedor_usd: 0,
        cobrado: false,
        cobros_sin_tc_mxn: 0,
      },
    ],
    gastos_por_categoria: [
      { categoria: "GAS", grupo: "DIRECTO", count: 3, usd: 450.5, sin_tc_count: 0, sin_tc_mxn: 0 },
      { categoria: "PERMISO", grupo: "PERMISO", count: 1, usd: 120, sin_tc_count: 0, sin_tc_mxn: 0 },
    ],
    reserva: { horas_hr: 2.5, tarifa_hora_usd: 100, monto_usd: 250 },
  };
  const html = renderToStaticMarkup(<DesgloseSection detalle={DETALLE} />);

  it("dos <tbody data-filas-activas> (vuelos y gastos) y un tabindex=\"0\" por tabla", () => {
    expect(cuenta(html, /<tbody[^>]*data-filas-activas=""/g)).toBe(2);
    expect(cuenta(html, /tabindex="0"/g)).toBe(2);
    expect(fila(html, "v1")).toContain('tabindex="0"');
    expect(fila(html, "v2")).toContain('tabindex="-1"');
    expect(fila(html, "DIRECTO-GAS")).toContain('tabindex="0"');
    expect(fila(html, "PERMISO-PERMISO")).toContain('tabindex="-1"');
  });

  it("cada vuelo lleva data-fila-href=\"/admin/flights/<id>\" y el <a> del Folio es byte a byte ese href", () => {
    for (const v of DETALLE.vuelos) {
      const tr = fila(html, v.id);
      const h = tr.match(/data-fila-href="([^"]+)"/)?.[1];
      expect(h).toBe(`/admin/flights/${v.id}`);
      expect(html).toMatch(new RegExp(`<a[^>]*href="${h}"[^>]*>#${v.folio}</a>`));
    }
  });

  it("las filas de gastos (data-fila=\"<grupo>-<categoria>\") NO llevan data-fila-href: Enter no abre nada", () => {
    for (const g of DETALLE.gastos_por_categoria) {
      const tr = fila(html, `${g.grupo}-${g.categoria}`);
      expect(tr).not.toBe("");
      expect(tr).not.toContain("data-fila-href");
    }
  });

  it("el <tfoot> y los encabezados sin data-fila ni tabindex; CERO aria-current/aria-selected en reposo", () => {
    const tfoot = html.match(/<tfoot[\s\S]*?<\/tfoot>/)?.[0] ?? "";
    expect(tfoot).not.toBe("");
    expect(tfoot).not.toContain("data-fila");
    expect(tfoot).not.toContain("tabindex");
    for (const thead of html.match(/<thead[\s\S]*?<\/thead>/g) ?? []) {
      expect(thead).not.toContain("data-fila");
      expect(thead).not.toContain("tabindex");
    }
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("aria-selected");
    expect(html).not.toContain("data-fila-activa");
  });

  it("el panel plegado lleva inert=\"\" (sus enlaces y filas no son paradas de Tab invisibles)", () => {
    expect(html).toMatch(/<div id="[^"]+"[^>]*inert=""/);
    expect(html).toContain('aria-expanded="false"');
  });

  it("sin role=\"grid\" ni data-state", () => {
    expect(html).not.toContain('role="grid"');
    expect(html).not.toContain("data-state");
  });
});

describe("MovimientosCuenta: el estado de cuenta del socio", () => {
  const MAURICIO = "50c10000-0000-4000-8000-000000000001";
  const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
  const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
  const REGISTRO: ContextoRegistro = { usuarios: [ALE], me: ALE, hoy: "2026-10-01", tcOficial: 18.45 };
  const ENTREGA: PagoSocio = {
    id: "9a9a0000-0000-4000-8000-000000000001",
    socio_id: MAURICIO,
    aeronave_id: null,
    periodo: null,
    mes: null,
    monto: 70000,
    moneda: "MXN",
    tc_usd_mxn: 18.5,
    monto_usd: 3783.78,
    utilidad_snapshot_usd: null,
    saldo_snapshot_usd: 1395.94,
    fecha_pago: "2026-10-01",
    metodo: "EFECTIVO",
    referencia: "Recibo 15",
    entregado_por: ALE.id,
    entregado_por_nombre: "Alejandro Canales",
    recibido_por: "Su esposa",
    factura_folio: "A-77",
    comprobante_path: `${MAURICIO}/9a9a.jpg`,
    comprobante_url: "https://x.supabase.co/storage/v1/object/sign/reparto-comprobantes/a/9a9a.jpg?token=t",
    notas: "Adelanto pedido por el socio",
    created_by: ALE.id,
    created_by_nombre: "Itzi",
    created_at: "2026-10-01T17:30:00Z",
    aeronave: null,
  };
  const MOVS: MovimientoCuenta[] = [
    { fecha: "2026-09-01", tipo: "SALDO_INICIAL", concepto: "Arranque de la cuenta (saldo inicial $0)", mes: "2026-09", aeronave: null, porcentaje: null, cargo_usd: 0, abono_usd: 0, saldo_usd: 0, en_curso: false, pago: null },
    { fecha: "2026-09-30", tipo: "UTILIDAD", concepto: "Utilidad sep 2026 · N4142R 69 %", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, cargo_usd: 1395.94, abono_usd: 0, saldo_usd: 1395.94, en_curso: false, pago: null },
    { fecha: "2026-10-01", tipo: "ENTREGA", concepto: "Adelanto a cuenta · Efectivo · $70,000 MXN a T.C. 18.5", mes: null, aeronave: null, porcentaje: null, cargo_usd: 0, abono_usd: 3783.78, saldo_usd: -2387.84, en_curso: false, pago: ENTREGA },
    { fecha: "2026-10-05", tipo: "ENTREGA", concepto: "Entrega · Transferencia · corresponde a sep 2026 · N4142R", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: null, cargo_usd: 0, abono_usd: 10, saldo_usd: -2397.84, en_curso: false, pago: { ...ENTREGA, id: "9a9a0000-0000-4000-8000-000000000002", mes: "2026-09", aeronave_id: N4142R, aeronave: { id: N4142R, matricula: "N4142R" }, monto: 10, moneda: "USD", tc_usd_mxn: null, monto_usd: 10, metodo: "TRANSFERENCIA", comprobante_path: null, comprobante_url: null, notas: null } },
    { fecha: "2026-10-31", tipo: "UTILIDAD", concepto: "Utilidad oct 2026 · N4142R 69 %", mes: "2026-10", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, cargo_usd: -120.5, abono_usd: 0, saldo_usd: -2518.34, en_curso: true, pago: null },
  ];
  const CONTEXTO: ContextoEntrega = {
    socio: { id: MAURICIO, nombre: "Mauricio Roque" },
    porEntregarUsd: -2518.34,
    mesEnCursoUsd: -120.5,
    mesEnCurso: "2026-10",
    aviones: [],
    cuentaDesdeMes: "2026-09",
    mesSugerido: null,
  };
  const html = renderToStaticMarkup(
    <MovimientosCuenta movimientos={MOVS} contexto={CONTEXTO} registro={REGISTRO} puedeRegistrar />,
  );

  it("el <tbody> lleva data-filas-activas; cada renglón principal lleva data-fila + tabindex y conserva data-movimiento / data-en-curso", () => {
    expect(html).toMatch(/<tbody[^>]*data-filas-activas=""/);
    const principales = (html.match(/<tr[^>]*data-movimiento="[^"]*"[^>]*>/g) ?? []);
    expect(principales).toHaveLength(MOVS.length);
    for (const tr of principales) {
      expect(tr).toContain('data-fila="');
      expect(tr).toMatch(/tabindex="(0|-1)"/);
    }
    expect(cuenta(html, /data-en-curso/g)).toBe(1);
    // La entrega usa el id del pago como clave; lo demás, tipo-fecha-avión-índice.
    expect(fila(html, ENTREGA.id)).toContain('data-movimiento="ENTREGA"');
    expect(fila(html, "UTILIDAD-2026-09-30-" + N4142R + "-1")).toContain('data-movimiento="UTILIDAD"');
  });

  it("el renglón de detalle de la entrega (data-entrega-id) es hija NO navegable: data-fila-hija sin data-fila ni tabindex, y va PEGADA a su fila", () => {
    const detalles = html.match(/<tr[^>]*data-entrega-id="[^"]*"[^>]*>/g) ?? [];
    expect(detalles).toHaveLength(2);
    for (const tr of detalles) {
      expect(tr).toContain('data-fila-hija=""');
      expect(tr).not.toContain('data-fila="');
      expect(tr).not.toContain("tabindex");
    }
    // El hook resuelve la hija a su fila con `previousElementSibling`: entre
    // el </tr> del movimiento y el <tr data-fila-hija> no hay otro renglón, y
    // ese movimiento es un <tr data-fila> (con «Editar»/«Eliminar»/comprobante
    // dentro de la hija, el foco y las flechas cuentan para la entrega).
    const pares = html.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*<\/tr><tr[^>]*data-fila-hija=""[^>]*>/g) ?? [];
    expect(pares).toHaveLength(2);
    for (const par of pares) {
      const apertura = par.match(/^<tr[^>]*>/)?.[0] ?? "";
      expect(apertura).toContain('data-fila="');
      expect(apertura).toContain('data-movimiento="ENTREGA"');
    }
    expect(cuenta(html, /data-accion="editar-entrega-socio"/g)).toBe(2);
  });

  it("un solo <tr> con tabindex=\"0\" (la primera), CERO aria-current/aria-selected y los botones siguen con la manita", () => {
    // Solo las filas: el comprobante y los diálogos pintan sus propios tabindex.
    expect(cuenta(html, /<tr[^>]*tabindex="0"/g)).toBe(1);
    expect(fila(html, "SALDO_INICIAL-2026-09-01--0")).toContain('tabindex="0"');
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("aria-selected");
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });
});
