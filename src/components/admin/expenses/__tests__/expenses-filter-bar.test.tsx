/**
 * Barra de filtros de Gastos reescrita (14-oct-2026, vista de una sola
 * tabla). El runner no tiene DOM: se congela el MARCADO estático según la URL
 * VIVA (`useSearchParams` simulado) — etiquetas ligadas, «Todos/Todas»,
 * marca de filtro activo, «Fecha de captura» segmentada, «Limpiar», el
 * `role="status"` siempre montado y la pista de la búsqueda — y el CABLEADO
 * por regex (borrador de las fechas, navegación encadenada sin pisarse,
 * página 1 al filtrar, transición sin brincar al inicio).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CLASE_FILTRO_ACTIVO, PISTA_BUSQUEDA_EXCEL } from "@/lib/admin/gastos-vista";

let urlActual = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => urlActual,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/expenses",
}));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    id?: string;
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    className?: string;
  }) => (
    <button type="button" id={p.id} className={p.className ?? ""} data-valor={p.value ?? ""}>
      {p.options.find((o) => o.value === p.value)?.label ?? p.placeholder}
    </button>
  ),
}));

const { ExpensesFilterBar } = await import("../expenses-filter-bar");

const UUID = "3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b";
const pintar = (qs: string) => {
  urlActual = new URLSearchParams(qs);
  return renderToStaticMarkup(
    <ExpensesFilterBar
      personas={[{ id: UUID, nombre: "Mary Cruz" }]}
      aviones={[
        { id: "av-1", matricula: "N4142R", activa: true },
        { id: "av-2", matricula: "XB-OLD", activa: false },
      ]}
    />,
  );
};
/** El control (botón simulado o input) con ese id. */
const control = (html: string, id: string): string => {
  const m = new RegExp(`<(button|input)(?=[^>]*id="${id}")[^>]*>`).exec(html);
  if (!m) throw new Error(`sin control ${id}`);
  return m[0];
};
const valorDe = (html: string, id: string): string => {
  const i = html.indexOf(`id="${id}"`);
  const fin = html.indexOf("</button>", i);
  return html.slice(html.indexOf(">", i) + 1, fin);
};
const botonCaptura = (html: string, valor: string): string => {
  const m = new RegExp(`<button[^>]*data-captura="${valor}"[^>]*>`).exec(html);
  if (!m) throw new Error(`sin botón ${valor}`);
  return m[0];
};

describe("sin filtros", () => {
  const html = pintar("");

  it("cada <label for> tiene su control con ese id", () => {
    const fors = [...html.matchAll(/<label[^>]*for="(gasto-filtro-[^"]+)"/g)].map((m) => m[1]);
    expect(fors).toEqual([
      "gasto-filtro-categoria",
      "gasto-filtro-avion",
      "gasto-filtro-facturacion",
      "gasto-filtro-banco",
      "gasto-filtro-medio",
      "gasto-filtro-capturo",
      "gasto-filtro-orden",
    ]);
    for (const id of fors) expect(() => control(html, id), id).not.toThrow();
    // Las etiquetas ligadas llevan la manita (Label con htmlFor).
    expect(html).toMatch(/<label[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*for="gasto-filtro-categoria"|<label[^>]*for="gasto-filtro-categoria"[^>]*class="[^"]*cursor-pointer/);
  });

  it("los selectores enseñan «Todos/Todas» y el orden «Fecha del gasto»", () => {
    expect(valorDe(html, "gasto-filtro-categoria")).toBe("Todas");
    expect(valorDe(html, "gasto-filtro-avion")).toBe("Todos");
    expect(valorDe(html, "gasto-filtro-facturacion")).toBe("Todas");
    expect(valorDe(html, "gasto-filtro-banco")).toBe("Todos");
    expect(valorDe(html, "gasto-filtro-medio")).toBe("Todos");
    expect(valorDe(html, "gasto-filtro-capturo")).toBe("Todos");
    expect(valorDe(html, "gasto-filtro-orden")).toBe("Fecha del gasto");
    expect(html).not.toContain(CLASE_FILTRO_ACTIVO);
  });

  it("fecha del gasto: grupo con etiqueta y dos campos con su aria-label y title", () => {
    expect(html).toContain('<span id="gasto-filtro-fecha"');
    expect(html).toContain('role="group" aria-labelledby="gasto-filtro-fecha"');
    const desde = control(html, "gasto-filtro-desde");
    expect(desde).toContain('type="date"');
    expect(desde).toContain('aria-label="Fecha del gasto: desde"');
    expect(desde).toContain('title="Fecha del consumo (la del ticket)"');
    expect(desde).toMatch(/class="[^"]*cursor-pointer/);
    expect(control(html, "gasto-filtro-hasta")).toContain('aria-label="Fecha del gasto: hasta"');
  });

  it("sin «Limpiar»; «Todas» de captura presionado; el status siempre montado", () => {
    expect(html).not.toContain("Limpiar");
    expect(botonCaptura(html, "todas")).toContain('aria-pressed="true"');
    expect(botonCaptura(html, "semana")).toContain('aria-pressed="false"');
    expect(botonCaptura(html, "rango")).toContain('aria-pressed="false"');
    expect(botonCaptura(html, "semana")).toMatch(/class="[^"]*cursor-pointer[^"]*focus-visible:ring-2/);
    expect(html).toContain('role="group" aria-labelledby="gasto-filtro-captura"');
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(html).not.toContain("gasto-filtro-cap-desde");
    expect(html).not.toContain(PISTA_BUSQUEDA_EXCEL);
  });

  it("avión: activos y dados de baja (opciones de la fuente única)", () => {
    expect(control(html, "gasto-filtro-avion")).toContain('data-valor=""');
  });
});

describe("con filtros", () => {
  it("categoría y banco con la marca de activo, «Esta semana» presionado y «Limpiar» con manita", () => {
    const html = pintar("categoria=COMIDA&banco=sin_conciliar&cap=7d");
    expect(control(html, "gasto-filtro-categoria")).toContain(CLASE_FILTRO_ACTIVO);
    expect(valorDe(html, "gasto-filtro-categoria")).toBe("Comida");
    expect(control(html, "gasto-filtro-banco")).toContain(CLASE_FILTRO_ACTIVO);
    expect(valorDe(html, "gasto-filtro-banco")).toBe("Sin conciliar");
    expect(control(html, "gasto-filtro-medio")).not.toContain(CLASE_FILTRO_ACTIVO);
    expect(botonCaptura(html, "semana")).toContain('aria-pressed="true"');
    expect(botonCaptura(html, "todas")).toContain('aria-pressed="false"');
    expect(html).toMatch(/<button type="button" title="Quita todos los filtros; conserva la pestaña, el orden y la búsqueda de la tabla." class="[^"]*cursor-pointer[^"]*">/);
    expect(html).toContain("Limpiar");
  });

  it("un valor fuera de catálogo se ignora (sin marca ni «Limpiar»)", () => {
    const html = pintar("categoria=comida&banco=todos&medio=BODEGA&aeronave_id=N4142R");
    expect(html).not.toContain(CLASE_FILTRO_ACTIVO);
    expect(html).not.toContain("Limpiar");
  });

  it("avión de la URL que no está en el catálogo ⇒ «Avión desconocido» (no «Todos»)", () => {
    const html = pintar(`aeronave_id=${UUID}`);
    expect(valorDe(html, "gasto-filtro-avion")).toBe("Avión desconocido");
    expect(control(html, "gasto-filtro-avion")).toContain(CLASE_FILTRO_ACTIVO);
  });

  it("rango de captura: «Rango…» activo y los dos campos con su aria-label", () => {
    const html = pintar("cap_desde=2026-10-01");
    expect(botonCaptura(html, "rango")).toContain('aria-pressed="true"');
    const desde = control(html, "gasto-filtro-cap-desde");
    expect(desde).toContain('aria-label="Fecha de captura: desde"');
    expect(desde).toContain('value="2026-10-01"');
    expect(desde).toContain(CLASE_FILTRO_ACTIVO);
    expect(control(html, "gasto-filtro-cap-hasta")).toContain('aria-label="Fecha de captura: hasta"');
    expect(desde).toContain(
      'title="Cuándo se capturó (cargó a la app o al panel), en hora Cancún — aunque el ticket traiga otra fecha"',
    );
  });

  it("fecha del gasto de la URL (también un ISO) en los campos, con la marca de activo", () => {
    const html = pintar("desde=2026-10-31&hasta=2026-10-01T00:00:00Z");
    // Invertido se corrige igual que en el servidor.
    expect(control(html, "gasto-filtro-desde")).toContain('value="2026-10-01"');
    expect(control(html, "gasto-filtro-hasta")).toContain('value="2026-10-31"');
    expect(control(html, "gasto-filtro-desde")).toContain(CLASE_FILTRO_ACTIVO);
  });

  it("con búsqueda en la tabla (?tq) aparece la pista del Excel", () => {
    expect(pintar("tq=saab")).toContain(PISTA_BUSQUEDA_EXCEL);
    expect(pintar("tq=%20%20")).not.toContain(PISTA_BUSQUEDA_EXCEL);
  });

  it("el orden por captura no es un filtro: sin marca ni «Limpiar»", () => {
    const html = pintar("orden=captura");
    expect(valorDe(html, "gasto-filtro-orden")).toBe("Fecha de captura");
    expect(html).not.toContain(CLASE_FILTRO_ACTIVO);
    expect(html).not.toContain("Limpiar");
  });
});

describe("cableado (regex sobre el fuente)", () => {
  const src = readFileSync(path.resolve(__dirname, "../expenses-filter-bar.tsx"), "utf8");

  it("borrador de las fechas y navegación encadenada", () => {
    for (const s of [
      "pasoCampoFecha",
      "pasoAlSalirCampoFecha",
      "valorVisibleCampoFecha",
      "rangoAlCambiarCampo",
      "ESPERA_APLICAR_MS",
      "consultaBaseParaNavegar",
      'params.delete("tp")',
      "startTransition(",
      "scroll: false",
      "leerFiltrosGastos(",
    ]) {
      expect(src, s).toContain(s);
    }
  });

  it("adiós a las etiquetas <p> y a navegar a media tecla", () => {
    expect(src).not.toContain('<p className="mb-1 text-[11px]');
    expect(src).not.toContain("onChange={(e) => set({ desde: e.target.value })}");
    expect(src).not.toMatch(/useState\(\s*(personas|aviones)/);
  });

  it("la captura de un rango apaga «Esta semana» y «Limpiar» suelta avión, categoría y captura", () => {
    expect(src).toContain("extra: { cap: null },");
    const limpiar = src.slice(src.indexOf("const limpiar = () =>"), src.indexOf("const opcionesAvion"));
    for (const k of ["aeronave_id: null", "categoria: null", "cap: null", "cap_desde: null", "cap_hasta: null"]) {
      expect(limpiar, k).toContain(k);
    }
    expect(limpiar).not.toContain("orden");
    expect(limpiar).not.toContain("tq");
  });
});
