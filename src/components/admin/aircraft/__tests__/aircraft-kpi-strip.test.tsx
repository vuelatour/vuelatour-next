/**
 * KPI «Próximo servicio» del expediente del avión: que la línea de la ORDEN
 * de servicio llegue de verdad al marcado (19-sep-2026). El texto se prueba
 * aparte en `lib/admin/__tests__/proximo-servicio.test.ts`; aquí se cuida el
 * CABLEADO —el campo aditivo del API, el enlace a Mantenimientos y el silencio
 * con un API sin desplegar—, que es lo que se rompe al mover el componente.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AircraftKpiStrip } from "../aircraft-kpi-strip";
import type { AircraftMetricsDetalle } from "@/lib/api/aircraft";

/** El XA-VGV a las 08:49 del 19-sep: Hobbs 2,240.2 contra el hito de 2,250. */
const metricsXaVgv: AircraftMetricsDetalle = {
  airworthiness: {
    apto: true,
    documentos_vencidos: [],
    en_taller: false,
    componentes_vencidos: [],
  },
  utilizacion: {
    horas_total: 100,
    horas_mes: 10,
    horas_anio: 50,
    vuelos_total: 20,
    vuelos_mes: 3,
    vuelos_anio: 12,
  },
  finanzas: [],
  horas_actuales: 2240.2,
  programa_configurado: true,
  proximo_servicio: {
    titulo: "Servicio 500 hrs",
    horas_objetivo: 2250,
    faltan_hr: 9.8,
    orden: null,
  },
};

const render = (m: AircraftMetricsDetalle) =>
  renderToStaticMarkup(<AircraftKpiStrip metrics={m} />);

describe("AircraftKpiStrip · próximo servicio", () => {
  it("el hint de siempre se conserva", () => {
    expect(render(metricsXaVgv)).toContain("Servicio 500 hrs · faltan 9.8 h");
  });

  it("sin orden y dentro del umbral: dice que se genera sola", () => {
    expect(render(metricsXaVgv)).toContain(
      "La orden se genera sola en unos minutos",
    );
  });

  it("orden sin fecha: ámbar + enlace a la card de Mantenimientos", () => {
    const html = render({
      ...metricsXaVgv,
      proximo_servicio: {
        ...metricsXaVgv.proximo_servicio!,
        orden: {
          id: "m-1",
          estado: "PROGRAMADO",
          fecha_programada: null,
          automatica: true,
        },
      },
    });
    expect(html).toContain("Orden programada · falta confirmar fecha");
    expect(html).toContain('href="#mantenimientos"');
    expect(html).toContain("text-amber-600");
  });

  it("orden con fecha: se pinta el día, sin ámbar de acción pendiente", () => {
    const html = render({
      ...metricsXaVgv,
      proximo_servicio: {
        ...metricsXaVgv.proximo_servicio!,
        orden: {
          id: "m-1",
          estado: "PROGRAMADO",
          fecha_programada: "2026-09-25",
          automatica: true,
        },
      },
    });
    expect(html).toContain("Orden programada para");
    expect(html).toContain("2026");
  });

  it("API sin desplegar (sin `orden`): la tarjeta queda EXACTAMENTE como antes", () => {
    const html = render({
      ...metricsXaVgv,
      proximo_servicio: {
        titulo: "Servicio 500 hrs",
        horas_objetivo: 2250,
        faltan_hr: 9.8,
      },
    });
    expect(html).toContain("faltan 9.8 h");
    expect(html).not.toContain("Orden");
    expect(html).not.toContain("se genera sola");
    expect(html).not.toContain("#mantenimientos");
  });

  it("aviso automático APAGADO: no se promete una orden que nadie va a crear", () => {
    const html = render({
      ...metricsXaVgv,
      proximo_servicio: {
        ...metricsXaVgv.proximo_servicio!,
        orden: null,
        aviso_automatico: { activo: false, umbral_hr: 10 },
      },
    });
    expect(html).toContain("La orden NO se crea sola");
    expect(html).not.toContain("se genera sola");
    expect(html).toContain('href="#mantenimientos"');
  });

  it("margen REAL del API: con aviso de 5 h, a 9.8 h todavía no se dice nada", () => {
    const html = render({
      ...metricsXaVgv,
      proximo_servicio: {
        ...metricsXaVgv.proximo_servicio!,
        orden: null,
        aviso_automatico: { activo: true, umbral_hr: 5 },
      },
    });
    expect(html).toContain("faltan 9.8 h");
    expect(html).not.toContain("se genera sola");
    expect(html).not.toContain("text-amber-600");
  });

  it("sin programa de servicio no se inventa ninguna orden", () => {
    const html = render({
      ...metricsXaVgv,
      programa_configurado: false,
      proximo_servicio: null,
    });
    expect(html).toContain("Sin programa");
    expect(html).not.toContain("#mantenimientos");
  });
});
