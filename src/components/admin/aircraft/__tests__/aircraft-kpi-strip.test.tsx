/**
 * Franja de KPI del expediente del avión (17-nov-2026). Pedido del cliente:
 * «los datos de los cards que están hasta arriba como "Horas actuales (Hobbs)"
 * no sean redundantes, es decir que si el dato ya aparece en otro componente
 * más abajo vamos a omitirlo arriba».
 *
 * Arriba queda SOLO la utilización (dos tarjetas). Hobbs y Próximo servicio
 * viven en la card Mantenimiento; la Utilidad, en Resumen operativo. El
 * cableado de «Próximo servicio» (la línea de la orden y su enlace) se cuida
 * ahora en `aircraft-mantenimiento-card.test.tsx`, que es donde quedó.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AircraftKpiStrip } from "../aircraft-kpi-strip";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";

/** El N990GG de la captura del cliente (17-nov-2026). */
const metricsN990gg: AircraftMetricsDetalle = {
  airworthiness: {
    apto: false,
    documentos_vencidos: [],
    en_taller: true,
    componentes_vencidos: [],
  },
  utilizacion: {
    horas_total: 80.8,
    horas_mes: 0.3,
    horas_anio: 37.8,
    vuelos_total: 40,
    vuelos_mes: 1,
    vuelos_anio: 22,
  },
  finanzas: [
    { moneda: "USD", ingresos: 17882.56, gastos: 440, utilidad: 17442.56 },
  ] as AircraftMetricsDetalle["finanzas"],
  finanzas_desde: "2026-09-01",
  anio_desde: "2026-09-01",
  horas_actuales: 5599.4,
  programa_configurado: true,
  proximo_servicio: {
    titulo: "Servicio 100 hrs / Anual",
    horas_objetivo: 5600,
    faltan_hr: 0.6,
    orden: { id: "m-1", estado: "EN_TALLER", fecha_programada: "2026-11-09", automatica: false },
  },
};

const render = (m: AircraftMetricsDetalle) =>
  renderToStaticMarkup(<AircraftKpiStrip metrics={m} />);

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("AircraftKpiStrip · solo lo que NO se repite abajo", () => {
  it("dos tarjetas de utilización: el mes y lo acumulado desde el inicio", () => {
    const t = texto(render(metricsN990gg));
    expect(t).toContain("Horas este mes");
    expect(t).toContain("0.3 h");
    expect(t).toContain("1 vuelo");
    expect(t).toContain("Horas desde el 01/09/2026");
    expect(t).toContain("37.8 h");
    expect(t).toContain("22 vuelos · total registrado 80.8 h");
  });

  it("sin `anio_desde` la acumulada es «Horas este año»", () => {
    const t = texto(render({ ...metricsN990gg, anio_desde: undefined }));
    expect(t).toContain("Horas este año");
    expect(t).not.toContain("desde el");
  });

  it("NO pinta Hobbs, Próximo servicio ni Utilidad (viven en cards de abajo)", () => {
    const html = render(metricsN990gg);
    const t = texto(html);
    // Hobbs: card Mantenimiento → «Horas y programa de servicio».
    expect(t).not.toContain("Hobbs");
    expect(t).not.toContain("5,599.4");
    // Próximo servicio: resumen de la card Mantenimiento.
    expect(t).not.toContain("Próximo servicio");
    expect(t).not.toContain("5,600");
    expect(t).not.toContain("En taller");
    expect(html).not.toContain("#mantenimientos");
    // Utilidad / Gastos: «Resumen operativo».
    expect(t).not.toContain("Utilidad");
    expect(t).not.toContain("Gastos");
    expect(t).not.toContain("17,442.56");
    // Dos tarjetas, no cuatro.
    expect(html.match(/data-slot="card"/g)).toHaveLength(2);
  });

  it("sin utilización no se pinta la franja (nunca se inventa un 0)", () => {
    const sin = { ...metricsN990gg, utilizacion: undefined } as unknown as AircraftMetricsDetalle;
    expect(render(sin)).toBe("");
  });
});
