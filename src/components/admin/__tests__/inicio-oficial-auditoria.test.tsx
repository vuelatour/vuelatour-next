/**
 * Auditoría 16-oct-2026 del inicio oficial (API 0.0.85) — piezas del panel
 * (letras a–i del documento de fugas). Marcado estático + regex de fuentes,
 * como las demás pruebas del inicio oficial. Cada pieza nueva lee una llave
 * ADITIVA: sin ella (API 0.0.84) o con `null`, el marcado es el de siempre.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/pilots/x",
  useSearchParams: () => new URLSearchParams(""),
}));

const { InicioOficialProvider } = await import("../inicio-oficial-provider");
const { ChipInicioOficial } = await import("../chip-inicio-oficial");
const { ChipAntesDelInicio } = await import("../aviso-inicio-oficial");
const { MesStatsSelector } = await import("../pilots/mes-stats-selector");
const { AircraftKpiStrip } = await import("../aircraft/aircraft-kpi-strip");
const { RenglonSaldoInicial } = await import("../renglon-saldo-inicial");
const { FilaSaldoInicialCardex } = await import("../inventory/saldo-inicial-cardex");

const INICIO = "2026-09-01";
const CHIP = "De antes del inicio oficial (1-sep-2026)";
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const conInicio = (el: React.ReactNode, inicio: string | null = INICIO) =>
  renderToStaticMarkup(<InicioOficialProvider inicio={inicio}>{el}</InicioOficialProvider>);

describe("a. Ficha del piloto: mes de las estadísticas", () => {
  it("el selector no ofrece meses anteriores al del inicio (`min`)", () => {
    expect(conInicio(<MesStatsSelector mes="2026-10" />)).toContain('min="2026-09"');
  });

  it("sin inicio (API previo) ⇒ marcado idéntico, sin `min`", () => {
    const fuera = renderToStaticMarkup(<MesStatsSelector mes="2026-10" />);
    expect(fuera).not.toContain("min=");
    expect(conInicio(<MesStatsSelector mes="2026-10" />, null)).toBe(fuera);
  });

  it("la página sube un `?mes=` anterior, lo pide así al API y pinta el aviso de siempre", () => {
    const src = leer("../../../app/admin/pilots/[id]/page.tsx");
    expect(src).toContain("ajustarMesAlInicio(mesUrl, inicio)");
    expect(src).toContain("pilot = await getPilot(id, mes);");
    expect(src).toContain("<AvisoPeriodoAjustado inicio={inicio} ajustado={ajusteMes.ajustado} />");
    // «Histórico» de honorarios ⇒ «Desde el 1-sep-2026» con `honorarios.desde`.
    expect(src).toContain("{rotuloTotalHonorarios(honorarios.desde)}");
    const sel = leer("../pilots/mes-stats-selector.tsx");
    expect(sel).toContain("min={mesInicio(inicio)}");
    expect(sel).toContain("pisoMes(e.target.value, inicio)");
  });
});

describe("b. Ficha del avión: «Horas mes / año»", () => {
  const metrics = (extra: Partial<AircraftMetricsDetalle> = {}) =>
    ({
      utilizacion: {
        horas_total: 4321.5,
        horas_mes: 12.3,
        horas_anio: 80.4,
        vuelos_total: 900,
        vuelos_mes: 5,
        vuelos_anio: 31,
      },
      finanzas: [],
      horas_actuales: 4321.5,
      ...extra,
    }) as unknown as AircraftMetricsDetalle;

  it("con `anio_desde` ⇒ «Horas mes / desde el 1-sep-2026»; números del API tal cual", () => {
    const html = renderToStaticMarkup(<AircraftKpiStrip metrics={metrics({ anio_desde: INICIO })} />);
    expect(html).toContain("Horas mes / desde el 1-sep-2026");
    expect(html).toContain("12.3 / 80.4 h");
    expect(html).not.toContain("Horas mes / año");
  });

  it("sin la llave o null ⇒ marcado idéntico al de hoy", () => {
    const hoy = renderToStaticMarkup(<AircraftKpiStrip metrics={metrics()} />);
    expect(hoy).toContain("Horas mes / año");
    expect(renderToStaticMarkup(<AircraftKpiStrip metrics={metrics({ anio_desde: null })} />)).toBe(hoy);
  });
});

describe("c. Saldo inicial de tacómetros y cardex", () => {
  it("renglón sintético con las cifras del API", () => {
    const html = renderToStaticMarkup(
      <RenglonSaldoInicial
        etiqueta="Saldo inicial al 1-sep-2026"
        piezas={[{ titulo: "Tacómetro", valor: "1006.5" }]}
      />,
    );
    expect(html).toContain("data-saldo-inicial");
    expect(html).toContain("Saldo inicial al 1-sep-2026");
    expect(html).toContain("1006.5");
  });

  it("cardex: existencia y último precio; sin la llave o null ⇒ nada", () => {
    const html = renderToStaticMarkup(
      <FilaSaldoInicialCardex
        saldo={{
          fecha: INICIO,
          etiqueta: "Saldo inicial al 1-sep-2026",
          existencia: 12,
          costo_vigente: { moneda: "MXN", unitario: 85 },
        }}
        unidad="pza"
      />,
    );
    expect(html).toContain("12 pza");
    expect(html).toContain("$85.00");
    expect(renderToStaticMarkup(<FilaSaldoInicialCardex saldo={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<FilaSaldoInicialCardex saldo={null} />)).toBe("");
  });

  it("tacómetros: el salto se calcula con `saltosDeCadena` + `saldo_inicial` y el renglón va al pie", () => {
    const src = leer("../aircraft/aircraft-tacometros-card.tsx");
    expect(src).toContain("saltosDeCadena(\n                data.historial,\n                normalizarSaldoInicialTaco(data.saldo_inicial),");
    expect(src).not.toContain("const anterior = data.historial[i + 1];");
    expect(src).toContain("<FilaSaldoInicialTaco saldo={data.saldo_inicial} />");
    expect(src).toContain('"Sin lecturas registradas."');
  });
});

describe("d. Bitácora PDF: fechas con piso", () => {
  it("`min` del inicio en las dos fechas y el «desde» que viaja nunca es anterior", () => {
    const src = leer("../aircraft/bitacora-pdf-button.tsx");
    expect(src.match(/min=\{minFecha\}/g)).toHaveLength(2);
    expect(src).toContain("const desdeEfectivo = pisoDesde(desde, inicio);");
    expect(src).toContain('params.set("desde", desdeEfectivo)');
    expect(src).toContain("if (inicio && hasta && hasta < inicio)");
  });
});

describe("e. Detalle de vuelo: «Vuelo anterior del avión»", () => {
  it("chip con la bandera del API (`antes`), aunque la fecha no lo diga", () => {
    expect(conInicio(<ChipInicioOficial fecha={null} antes />)).toContain(CHIP);
    expect(conInicio(<ChipInicioOficial fecha="2026-09-10" antes />)).toContain(CHIP);
    expect(conInicio(<ChipInicioOficial fecha="2026-08-10" antes={false} />)).toBe("");
    // Sin inicio, nada (aunque la bandera venga).
    expect(renderToStaticMarkup(<ChipAntesDelInicio fecha={null} inicio={null} antes />)).toBe("");
  });

  it("sin `antes` el chip decide por la fecha como siempre", () => {
    expect(conInicio(<ChipInicioOficial fecha="2026-08-31" />)).toContain(CHIP);
    expect(conInicio(<ChipInicioOficial fecha="2026-09-01" />)).toBe("");
  });

  it("la tarjeta solo lo pinta con `antes_del_inicio === true` (API 0.0.84 ⇒ sin chip)", () => {
    const src = leer("../flights/escalas-card.tsx");
    expect(src).toContain("vueloAnterior?.antes_del_inicio === true && (");
  });
});

describe("f. Facturas emitidas: rótulo del resumen", () => {
  it("el chip «Registradas» lee `resumen.desde`", () => {
    const src = leer("../facturas-emitidas/registro-facturas-resumen.tsx");
    expect(src).toContain("{ label: rotuloRegistradas(r.desde), valor: r.registradas }");
  });
});

describe("h. Cuenta de socios", () => {
  it("la página sube `?desde=` viejo con aviso y no ofrece ver entregas de antes del inicio", () => {
    const src = leer("../../../app/admin/profit-sharing/socios/[id]/page.tsx");
    expect(src).toContain("filtroMesesCuenta(sp.desde, sp.hasta, mesHoy, inicio)");
    expect(src).toContain("inicioOficial: inicio,");
    expect(src).toContain("<AvisoPeriodoAjustado inicio={inicio} ajustado={filtro.ajustado === true} />");
  });

  it("diálogo y filtro reciben el inicio del Provider", () => {
    const dlg = leer("../profit-sharing/cuenta-socio-dialog.tsx");
    expect(dlg).toContain("opcionesMesArranque(hoyLocal, mesDeFecha(cuenta.cuenta_desde), inicio)");
    expect(dlg).toContain("validarFormCuenta(form, hoyLocal, inicio)");
    const filtro = leer("../profit-sharing/filtro-meses-cuenta.tsx");
    expect(filtro).toContain("opcionesFiltroMeses({ cuentaDesdeMes, desde, mesActual, mesMinimo, inicioOficial })");
  });
});

describe("i. Ingresos: vuelos candidatos de antes del inicio", () => {
  it("los tres selectores (y el aviso de cobro que cuadra) pintan el chip por `fecha_vuelo`", () => {
    for (const f of [
      "../ingresos/cobro-desde-abono-dialog.tsx",
      "../ingresos/aplicar-anticipo-dialog.tsx",
      "../ingresos/registrar-ingreso-dialog.tsx",
    ]) {
      expect(leer(f)).toContain('<ChipInicioOficial fecha={v.fecha_vuelo} className="mt-1" />');
    }
    expect(leer("../ingresos/registrar-ingreso-dialog.tsx")).toContain(
      "<ChipInicioOficial fecha={c.fecha_vuelo} />",
    );
  });
});
