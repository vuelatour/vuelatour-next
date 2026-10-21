/**
 * Otros ingresos ASIGNADOS a un avión en el reparto (13-oct-2026, API
 * 0.0.75). Caso real ING-4: reembolso de $46,550.80 MXN del servicio de
 * N990GG ⇒ +$2,586.16 USD (T.C. oficial 18) que SUMAN al saldo del avión.
 *
 *  1. La card del avión pinta la fila verde «Otros ingresos del avión» SOLO
 *     con > 0, con el detalle en el tooltip; la cascada sigue sumando EXACTO
 *     el saldo; badges de «sin TC» y «TC oficial».
 *  2. Con un API previo (sin los campos) o con todo en 0, el marcado de hoy.
 *  3. KpiStrip: la cifra de VENTA no se mezcla; los otros ingresos van en el
 *     hint.
 *  4. Cableado del tablero ejecutivo (hint y celda por avión).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvionReparto, DetalleOtroIngresoAvion } from "@/types/profit-sharing";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/excel-export-button", () => ({ ExcelExportButton: () => null }));

const { AvionRepartoCard } = await import("../avion-reparto-card");
const { KpiStrip } = await import("../kpi-strip");

const ING4: DetalleOtroIngresoAvion = {
  id: "i-4",
  clave: "ING-4",
  fecha: "2026-09-04",
  categoria: "REEMBOLSO_DEVOLUCION",
  categoria_etiqueta: "Reembolsos y devoluciones recibidos",
  concepto: "TRANSF INTERBANCARIA SPEI · angel alvarez",
  moneda: "MXN",
  monto: 46550.8,
  comision: null,
  neto: 46550.8,
  usd: 2586.16,
  tc: 18,
  tc_oficial: true,
};

/** N990GG de septiembre con el ING-4: 10,000 − 3,300 de gastos − 400 de reserva + 2,586.16 = 8,886.16. */
function avion(over: { ingresos?: Partial<AvionReparto["ingresos"]>; detalle?: Partial<NonNullable<AvionReparto["detalle"]>> } = {}): AvionReparto {
  return {
    aeronave: { id: "av-990", matricula: "N990GG", modelo: "Piper Seneca V" },
    ingresos: {
      cobrado_usd: 10000,
      comisiones_venta_usd: 0,
      pendiente_cobro_usd: 0,
      vuelos_cobrados: 3,
      vuelos_pendientes: 0,
      cobros_sin_tc_mxn: 0,
      otros_ingresos_avion_usd: 2586.16,
      otros_ingresos_avion_sin_tc_mxn: 0,
      otros_ingresos_avion_tc_oficial_count: 1,
      ...over.ingresos,
    },
    horas_voladas_hr: 10,
    gastos: {
      directos_usd: 2500,
      indirectos_usd: 500,
      permisos_usd: 100,
      otros_prorrateados_usd: 200,
      gastos_sin_tc_count: 0,
      gastos_sin_tc_mxn: 0,
    },
    reserva_overhaul_usd: 400,
    reserva_overhaul_incompleta: false,
    saldo_disponible_usd: 8886.16,
    reparto: [],
    reparto_porcentaje_total: 0,
    detalle: {
      vuelos: [],
      gastos_por_categoria: [],
      reserva: { horas_hr: 10, tarifa_hora_usd: 40, monto_usd: 400 },
      otros_ingresos_avion: [ING4],
      ...over.detalle,
    },
  };
}

const card = (a: AvionReparto) =>
  renderToStaticMarkup(<AvionRepartoCard avion={a} desde="2026-09-01" hasta="2026-09-30" />);

/** El avión de HOY (API previo): sin ninguna llave nueva. */
function avionApiPrevio(): AvionReparto {
  const a = avion();
  const ingresos = { ...a.ingresos };
  delete ingresos.otros_ingresos_avion_usd;
  delete ingresos.otros_ingresos_avion_sin_tc_mxn;
  delete ingresos.otros_ingresos_avion_tc_oficial_count;
  const detalle = { ...a.detalle! };
  delete detalle.otros_ingresos_avion;
  return { ...a, ingresos, detalle, saldo_disponible_usd: 6300 };
}

describe("card del avión (render)", () => {
  it("fila verde con el sublabel, el detalle en el tooltip, después de la venta y antes de los gastos", () => {
    const html = card(avion());
    expect(html).toContain(
      'title="ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · $2,586.16"',
    );
    expect(html).toContain("Otros ingresos del avión");
    expect(html).toContain("reembolsos y ventas registrados en Ingresos con este avión, netos de comisión");
    expect(html).toMatch(/text-emerald-600 dark:text-emerald-400">\$2,586\.16</);
    expect(html).toContain('data-fila-cascada="otros_ingresos"');
    // La fila de la cascada (el badge del TC oficial también lo nombra en su title).
    const venta = html.indexOf("Venta del avión cobrada");
    const otros = html.indexOf("Otros ingresos del avión<span");
    const directos = html.indexOf("Gastos directos");
    expect(venta).toBeGreaterThan(-1);
    expect(otros).toBeGreaterThan(venta);
    expect(directos).toBeGreaterThan(otros);
  });

  it("la cascada suma EXACTO el saldo (los números son del API)", () => {
    const html = card(avion());
    const a = avion();
    const suma =
      a.ingresos.cobrado_usd +
      (a.ingresos.otros_ingresos_avion_usd ?? 0) -
      a.gastos.directos_usd -
      a.gastos.indirectos_usd -
      a.gastos.permisos_usd -
      a.gastos.otros_prorrateados_usd -
      a.reserva_overhaul_usd;
    expect(Math.round(suma * 100) / 100).toBe(a.saldo_disponible_usd);
    expect(html).toContain("$8,886.16");
  });

  it("badge informativo del TC oficial y ámbar de los que no entraron", () => {
    const html = card(avion({ ingresos: { otros_ingresos_avion_sin_tc_mxn: 46550.8 } }));
    expect(html).toContain(">1 ingreso(s) con TC oficial<");
    expect(html).toContain(
      'title="Otros ingresos del avión en MXN sin tipo de cambio capturado: se convirtieron con el T.C. oficial de referencia del día del ingreso (open.er-api / BCE). Ya suman en el saldo."',
    );
    expect(html).toContain(">Otros ingresos sin TC · 46,550.80 MXN<");
    expect(html).toContain(
      'title="Ingresos del avión en MXN sin tipo de cambio propio ni T.C. oficial disponible para su fecha: no entraron al saldo."',
    );
  });

  it("con 0 (o un API previo) el marcado es el de hoy: ni fila ni badges", () => {
    const ceros = avion({
      ingresos: {
        otros_ingresos_avion_usd: 0,
        otros_ingresos_avion_sin_tc_mxn: 0,
        otros_ingresos_avion_tc_oficial_count: 0,
      },
      detalle: { otros_ingresos_avion: [] },
    });
    const html = card({ ...ceros, saldo_disponible_usd: 6300 });
    expect(html).not.toContain("Otros ingresos del avión");
    expect(html).not.toContain("con TC oficial");
    expect(html).not.toContain("Otros ingresos sin TC");
    expect(html).toBe(card(avionApiPrevio()));
  });
});

describe("KpiStrip", () => {
  const otro = (): AvionReparto => ({
    ...avionApiPrevio(),
    aeronave: { id: "av-142", matricula: "N4142R", modelo: "Piper Seneca" },
  });

  it("la cifra de venta NO se mezcla; los otros ingresos van en el hint (y el tooltip)", () => {
    const html = renderToStaticMarkup(<KpiStrip aviones={[avion(), otro()]} />);
    // Venta = 10,000 + 10,000: sin los 2,586.16.
    expect(html).toContain("$20,000");
    expect(html).not.toContain("$22,586.16");
    expect(html).toContain("6 vuelo(s) cobrados · + $2,586.16 otros ingresos de aviones");
    expect(html).toContain('title="6 vuelo(s) cobrados · + $2,586.16 otros ingresos de aviones"');
  });

  it("sin otros ingresos (o API previo): el hint de siempre, sin tooltip", () => {
    const html = renderToStaticMarkup(<KpiStrip aviones={[otro()]} />);
    expect(html).toContain(">3 vuelo(s) cobrados<");
    expect(html).not.toContain("otros ingresos de aviones");
  });
});

describe("cableado del tablero ejecutivo y de la cascada", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const dashboards = leer("../../../../app/admin/dashboards/page.tsx");
  // La cascada se mudó de la card a `lib/admin/reparto-avion.ts` +
  // `cascada-avion.tsx` (20-oct-2026): la card y la pantalla del avión la comparten.
  const cascada = leer("../../../../lib/admin/reparto-avion.ts") + leer("../cascada-avion.tsx");
  const tarjeta = leer("../avion-reparto-card.tsx");

  it("KPI «Ingresos cobrados» con su hint y la celda por avión con «+ $X otros»", () => {
    expect(dashboards).toContain(
      "hint={hintDashboardOtrosIngresosAviones(resumen.otros_ingresos_aviones_usd ?? 0)}",
    );
    expect(dashboards).toMatch(
      /\(a\.otros_ingresos_avion_usd \?\? 0\) > 0 && \(\s*<span className="block text-xs text-muted-foreground">\s*\{textoCeldaOtrosIngresosAvion\(a\.otros_ingresos_avion_usd \?\? 0\)\}/,
    );
  });

  it("la fila sale SOLO con > 0 y los textos de la fuente única", () => {
    expect(cascada).toContain("if ((avion.ingresos.otros_ingresos_avion_usd ?? 0) > 0) {");
    expect(cascada).toContain("otrosIngresos: ETIQUETA_FILA_OTROS_INGRESOS_AVION");
    expect(cascada).toContain("{ sublabel: SUBLABEL_OTROS_INGRESOS_AVION }");
    expect(cascada).toContain("tituloOtrosIngresosAvion(detalle?.otros_ingresos_avion)");
    expect(cascada).not.toContain('"Otros ingresos del avión"');
    expect(tarjeta).toContain("<CascadaAvion avion={avion} enPesos={enPesos} comoBalance={comoBalance} compacta />");
    expect(tarjeta).not.toContain('"Otros ingresos del avión"');
  });
});
