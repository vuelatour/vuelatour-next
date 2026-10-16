/**
 * Inicio oficial (16-oct-2026, API 0.0.84) — piezas visuales: el Provider
 * (fuera de él vale null ⇒ como hoy), `MesReporteSelect` (meses desde
 * sep-2026), la flecha «‹ anterior» de Nómina, el chip, la franja, los avisos
 * y el cableado del calendario. Sin DOM: marcado estático + regex de fuentes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/nomina",
  useSearchParams: () => new URLSearchParams(""),
}));
// Las descargas del cierre leen Supabase (env del navegador): fuera de la prueba.
vi.mock("@/components/admin/profit-sharing/report-downloads", () => ({ ReportDownloads: () => null }));

const { InicioOficialProvider, useInicioOficial } = await import("../inicio-oficial-provider");
const { ChipInicioOficial } = await import("../chip-inicio-oficial");
const { AvisoCapturaAntesDelInicio } = await import("../aviso-captura-inicio");
const { AvisoPeriodoAjustado, FranjaAntesDelInicio } = await import("../aviso-inicio-oficial");
const { opcionesMesReporte } = await import("../profit-sharing/mes-reporte-select");
const { NominaNavMeses } = await import("../nomina/nomina-nav-meses");

const INICIO = "2026-09-01";
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

function Lector() {
  return <span>{useInicioOficial() ?? "sin-inicio"}</span>;
}

describe("InicioOficialProvider / useInicioOficial", () => {
  it("fuera del Provider ⇒ null (comportamiento de hoy)", () => {
    expect(renderToStaticMarkup(<Lector />)).toBe("<span>sin-inicio</span>");
  });

  it("dentro ⇒ la fecha que pasó AdminShell", () => {
    expect(
      renderToStaticMarkup(
        <InicioOficialProvider inicio={INICIO}>
          <Lector />
        </InicioOficialProvider>,
      ),
    ).toBe("<span>2026-09-01</span>");
  });

  it("AdminShell lo monta con `me.config?.inicio_oficial` validado", () => {
    const shell = leer("../admin-shell.tsx");
    expect(shell).toContain("<InicioOficialProvider inicio={inicioOficialDeMe(me)}>");
  });
});

describe("MesReporteSelect: meses ofrecidos", () => {
  it("desde sep-2026 con inicio; desde ene-2026 con null", () => {
    expect(opcionesMesReporte("2026-10-16", INICIO)).toEqual([
      { value: "2026-10", label: "Octubre 2026 (en curso)" },
      { value: "2026-09", label: "Septiembre 2026" },
    ]);
    const sin = opcionesMesReporte("2026-10-16", null);
    expect(sin).toHaveLength(10);
    expect(sin[sin.length - 1]).toEqual({ value: "2026-01", label: "Enero 2026" });
  });
});

describe("Nómina: «‹ anterior» en el mes del inicio", () => {
  it("deshabilitada con el title «El sistema arranca en septiembre de 2026»", () => {
    const html = renderToStaticMarkup(
      <NominaNavMeses
        mes="2026-09"
        anterior="2026-08"
        siguiente="2026-10"
        anteriorDeshabilitado="El sistema arranca en septiembre de 2026"
      />,
    );
    const enlaces = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toContain("mes=2026-10");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="El sistema arranca en septiembre de 2026"');
    expect(html).not.toContain("mes=2026-08");
  });

  it("sin la prop (null) ⇒ el enlace de siempre", () => {
    const html = renderToStaticMarkup(<NominaNavMeses mes="2026-10" anterior="2026-09" siguiente={null} />);
    expect(html).not.toContain("aria-disabled");
    expect(html).toContain("mes=2026-09");
  });
});

describe("Chip, franja y avisos", () => {
  const con = (el: React.ReactNode) =>
    renderToStaticMarkup(<InicioOficialProvider inicio={INICIO}>{el}</InicioOficialProvider>);

  it("chip solo para registros de antes (cobro del 31-ago a las 20:00 Cancún)", () => {
    expect(con(<ChipInicioOficial fecha="2026-09-01T01:00:00Z" />)).toContain(
      "De antes del inicio oficial (1-sep-2026)",
    );
    expect(con(<ChipInicioOficial fecha="2026-09-01T05:00:00Z" />)).toBe("");
    expect(renderToStaticMarkup(<ChipInicioOficial fecha="2026-08-31" />)).toBe("");
  });

  it("franja del detalle por id", () => {
    expect(renderToStaticMarkup(<FranjaAntesDelInicio fecha="2026-08-07" inicio={INICIO} />)).toContain(
      "Este registro es de antes del inicio oficial (1-sep-2026). Se conserva solo para consulta: no aparece en listados ni reportes.",
    );
    expect(renderToStaticMarkup(<FranjaAntesDelInicio fecha="2026-09-07" inicio={INICIO} />)).toBe("");
    expect(renderToStaticMarkup(<FranjaAntesDelInicio fecha="2026-08-07" inicio={null} />)).toBe("");
  });

  it("aviso de periodo ajustado solo con `ajustado` e inicio", () => {
    expect(renderToStaticMarkup(<AvisoPeriodoAjustado inicio={INICIO} ajustado />)).toContain(
      "El sistema arranca el 1-sep-2026; ajustamos el periodo a partir de esa fecha.",
    );
    expect(renderToStaticMarkup(<AvisoPeriodoAjustado inicio={INICIO} ajustado={false} />)).toBe("");
    expect(renderToStaticMarkup(<AvisoPeriodoAjustado inicio={null} ajustado />)).toBe("");
  });

  it("aviso de captura no bloqueante", () => {
    expect(con(<AvisoCapturaAntesDelInicio fecha="2026-08-29" />)).toContain(
      "La fecha es anterior al inicio oficial (1-sep-2026): se guardará, pero no aparecerá en listados ni reportes.",
    );
    expect(con(<AvisoCapturaAntesDelInicio fecha="2026-09-02" />)).toBe("");
    expect(renderToStaticMarkup(<AvisoCapturaAntesDelInicio fecha="2026-08-29" />)).toBe("");
  });

  it("las 8 capturas del contrato pintan el aviso bajo su fecha", () => {
    for (const rel of [
      "../expenses/expense-create-dialog.tsx",
      "../expenses/expense-verify-dialog.tsx",
      "../flights/cobro-form-sheet.tsx",
      "../flights/reembolso-dialog.tsx",
      "../grupos/detalle/grupo-cobro-dialog.tsx",
      "../ingresos/registrar-ingreso-dialog.tsx",
      "../caja-chica/movimiento-dialog.tsx",
      "../conciliacion/corregir-fecha-gasto-dialog.tsx",
    ]) {
      expect(leer(rel), rel).toMatch(/<AvisoCapturaAntesDelInicio fecha=\{/);
    }
  });
});

describe("Cableado de páginas", () => {
  it("calendario: flecha anterior apagada en el mes del inicio y días anteriores sin eventos", () => {
    const cal = leer("../../../app/admin/calendar/page.tsx");
    expect(cal).toContain("esMesDelInicioOAnterior(");
    expect(cal).toContain("vaciarDiasAntesDelInicio(");
    expect(cal).toContain('aria-disabled="true"');
    const grid = leer("../calendar/calendar-grid.tsx");
    expect(grid).toContain("day.inMonth && !day.antesDelInicio");
  });

  it("las pantallas por periodo ajustan la URL vieja con aviso", () => {
    for (const rel of [
      "../../../app/admin/reportes/page.tsx",
      "../../../app/admin/reportes/balance/page.tsx",
      "../../../app/admin/profit-sharing/page.tsx",
      "../../../app/admin/dashboards/page.tsx",
      "../../../app/admin/otros-gastos/page.tsx",
      "../../../app/admin/nomina/page.tsx",
      "../../../app/admin/gastos-personales/page.tsx",
      "../../../app/admin/combustibles/page.tsx",
      "../../../app/admin/calendar/page.tsx",
      "../../../app/admin/ingresos/page.tsx",
      "../../../app/admin/flights/page.tsx",
      "../../../app/admin/quotes/page.tsx",
      "../../../app/admin/quotes/grupo/page.tsx",
      "../../../app/admin/expenses/page.tsx",
      "../../../app/admin/conciliacion/page.tsx",
      "../../../app/admin/facturas/page.tsx",
      "../../../app/admin/facturas-emitidas/page.tsx",
      "../../../app/admin/caja-chica/[id]/page.tsx",
    ]) {
      const src = leer(rel);
      expect(src, rel).toContain("await getInicioOficial()");
      expect(src, rel).toContain("<AvisoPeriodoAjustado");
    }
  });

  it("la ficha del piloto queda LIBRE (son horas)", () => {
    expect(leer("../pilots/mes-stats-selector.tsx")).not.toContain("useInicioOficial");
  });
});
