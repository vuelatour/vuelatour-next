/**
 * Barra de filtros de Cotizaciones con el rango «Desde / Hasta» de la fecha
 * del vuelo (13-oct-2026). El runner no tiene DOM: se congela el MARCADO
 * estático (con y sin `hoy`, con y sin rango en la URL, invertido, con el
 * API previo) y el CABLEADO por regex sobre el fuente (borrador de
 * `periodo-selector`, lectura de la URL viva, «Limpiar» que suelta el rango,
 * sin `<select>` nativo ni hex sueltos, sin `max` en las fechas).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fmtDateOnly } from "@/lib/datetime";
import { TITULO_FECHA_VUELO, notaRangoCotizaciones } from "@/lib/admin/quote-navegacion";

// La URL VIVA (`useSearchParams`) manda: la barra lee el rango de ahí, nunca
// de una prop del servidor.
let urlActual = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => urlActual,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/quotes",
}));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
  }) => <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} />,
}));

const { QuotesFilterBar } = await import("../quotes-filter-bar");

const HOY = "2026-10-12";
const INITIAL = { estado: "", cliente_id: "", q: "" };

const render = (
  url: string,
  props: { hoy?: string; rangoIgnorado?: boolean; initial?: typeof INITIAL } = {},
) => {
  urlActual = new URLSearchParams(url);
  return renderToStaticMarkup(
    <QuotesFilterBar clients={[]} initial={props.initial ?? INITIAL} hoy={props.hoy} rangoIgnorado={props.rangoIgnorado} />,
  );
};

const input = (id: string) => {
  const m = new RegExp(`<input(?=[^>]*id="${id}")[^>]*/?>`).exec(render.ultimo);
  if (!m) throw new Error(`no se encontró el input ${id}`);
  return m[0];
};
// Último HTML pintado, para los helpers.
render.ultimo = "";
const pintar = (...a: Parameters<typeof render>) => {
  render.ultimo = render(...a);
  return render.ultimo;
};

const d = (ymd: string) => fmtDateOnly(ymd);

describe("QuotesFilterBar · marcado", () => {
  it("(a) SIN `hoy` y URL vacía: el marcado de siempre, sin fechas ni «Limpiar»", () => {
    const html = pintar("");
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain("data-rango");
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain("data-nota-rango");
    expect(html).not.toContain("Limpiar");
    // Los tres campos de siempre siguen ahí.
    expect(html).toContain("Buscar");
    expect(html).toContain('data-select="Todos los estados"');
    expect(html).toContain('data-select="Todos los clientes"');
  });

  it("(b) CON `hoy` y URL sin rango: dos fechas ligadas a su etiqueta, sin max, 3 chips sueltos, nota «Sin periodo», sin «Limpiar»", () => {
    const html = pintar("", { hoy: HOY });
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Periodo del vuelo"[^>]*data-rango="cotizaciones"/);
    for (const id of ["cot-desde", "cot-hasta"]) {
      const inp = input(id);
      expect(inp).toContain('type="date"');
      expect(inp).toContain("cursor-pointer");
      expect(inp).not.toContain("max=");
      expect(inp).not.toContain("min=");
      expect(inp).toContain(`title="${TITULO_FECHA_VUELO}"`);
      expect(inp).toMatch(/value=""/);
      expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>(Desde|Hasta)</label>`));
    }
    const chips = html.match(/<button[^>]*aria-pressed="(true|false)"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(chips.map((c) => c.replace(/<[^>]+>/g, ""))).toEqual([
      "Este mes",
      "Mes pasado",
      "Próximos 30 días",
    ]);
    for (const c of chips) {
      expect(c).toContain('aria-pressed="false"');
      expect(c).toContain("cursor-pointer");
      expect(c).toContain('type="button"');
    }
    expect(html).toMatch(/data-periodo="mes"[\s\S]*data-periodo="anterior"[\s\S]*data-periodo="30"/);
    expect(html).toMatch(/<p[^>]*data-nota-rango[^>]*>Sin periodo: /);
    expect(html).toContain(notaRangoCotizaciones({}));
    expect(html).not.toContain("Limpiar");
  });

  it("(c) URL con rango: inputs con valor, «Este mes» pulsado, «Limpiar» con cursor-pointer y la nota del periodo", () => {
    const html = pintar("desde=2026-10-01&hasta=2026-10-31&estado=COTIZADO", { hoy: HOY });
    expect(input("cot-desde")).toContain('value="2026-10-01"');
    expect(input("cot-hasta")).toContain('value="2026-10-31"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-periodo="mes"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*data-periodo="anterior"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*data-periodo="30"/);
    const limpiar = /<button[^>]*>[^<]*<svg[\s\S]*?<\/svg>Limpiar<\/button>/.exec(html);
    expect(limpiar).not.toBeNull();
    expect(limpiar![0]).toContain('type="button"');
    expect(limpiar![0]).toContain("cursor-pointer");
    expect(html).toContain(
      `Mostrando cotizaciones con fecha de vuelo del ${d("2026-10-01")} al ${d("2026-10-31")}.`,
    );
    expect(html).toContain("no tienen fecha de vuelo no entran al periodo");
    expect(html).toContain("Las flechas del detalle recorren este mismo periodo.");
  });

  it("(c bis) «Limpiar» sale con el rango aunque estado/cliente/búsqueda vengan vacíos del servidor", () => {
    const html = pintar("desde=2026-10-01", { hoy: HOY });
    expect(html).toContain("Limpiar");
  });

  it("(d) URL invertida: los inputs muestran el rango corregido (la MISMA función que el servidor)", () => {
    pintar("desde=2026-10-31&hasta=2026-10-01", { hoy: HOY });
    expect(input("cot-desde")).toContain('value="2026-10-01"');
    expect(input("cot-hasta")).toContain('value="2026-10-31"');
  });

  it("(d bis) un día inválido en la URL se ignora, no tumba la barra", () => {
    const html = pintar("desde=2026-13-45&hasta=2026-10-31", { hoy: HOY });
    expect(input("cot-desde")).toMatch(/value=""/);
    expect(input("cot-hasta")).toContain('value="2026-10-31"');
    expect(html).toContain(`hasta el ${d("2026-10-31")}`);
  });

  it("(e) `rangoIgnorado` con rango en la URL: la nota dice «Sin periodo» y los inputs conservan lo pedido", () => {
    const html = pintar("desde=2026-10-01&hasta=2026-10-31", { hoy: HOY, rangoIgnorado: true });
    expect(html).toMatch(/<p[^>]*data-nota-rango[^>]*>Sin periodo: /);
    expect(html).not.toContain("Mostrando cotizaciones");
    expect(input("cot-desde")).toContain('value="2026-10-01"');
    expect(input("cot-hasta")).toContain('value="2026-10-31"');
  });
});

// ---------------------------------------------------------------------------
// Cableado (se lee la fuente: el borrador y el temporizador no se ven en el
// marcado estático)
// ---------------------------------------------------------------------------

const leer = (...p: string[]) =>
  readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");

describe("QuotesFilterBar · cableado", () => {
  const src = leer("components", "admin", "quotes", "quotes-filter-bar.tsx");

  it("el borrador es el de periodo-selector y las reglas son las PURAS de quote-navegacion", () => {
    expect(src).toMatch(/import \{ ESPERA_APLICAR_MS \} from "@\/lib\/admin\/periodo-selector"/);
    for (const fn of [
      "pasoCampoFecha",
      "pasoAlSalirCampoFecha",
      "valorVisibleCampoFecha",
      "rangoListaCotizaciones",
      "rangoAlCambiarCampo",
      "periodosRapidosCotizaciones",
      "notaRangoCotizaciones",
    ]) {
      expect(src).toContain(`${fn}(`);
    }
    expect(src).toContain("setTimeout(() => aplicar(campo, paso.valor), ESPERA_APLICAR_MS)");
    expect(src).toContain('if (e.key === "Enter") onSalir(campo);');
    expect(src).toContain("onBlur={() => onSalir(campo)}");
  });

  it("el rango se LEE de la URL viva (useSearchParams), nunca de useState(initial…)", () => {
    expect(src).toContain('rangoListaCotizaciones(params.get("desde"), params.get("hasta"))');
    expect(src).not.toMatch(/useState\(\s*initial/);
    expect(src).not.toMatch(/useState\(\s*rango/);
    expect(src).not.toContain("defaultValue={visible");
  });

  it("la siguiente navegación se arma sobre la última consulta PEDIDA (ref, no estado) mientras la URL no se mueva: pushQuery y aplicar (revisión 13-oct-2026)", () => {
    expect(src).toContain("const pendiente = useRef<ConsultaPendiente | null>(null);");
    expect(src).toContain(
      "() => new URLSearchParams(consultaBaseParaNavegar(params.toString(), pendiente.current))",
    );
    const push = src.match(/const pushQuery = useCallback\(([\s\S]*?)\n  \);/)?.[1] ?? "";
    expect(push).toContain("const viva = params.toString();");
    expect(push).toContain("const sp = paramsParaNavegar();");
    expect(push).not.toContain("new URLSearchParams(params.toString())");
    expect(push).toContain("pendiente.current = { base: viva, consulta: qs };");
    // La misma consulta ya pedida no se vuelve a pedir.
    expect(push).toContain("if (pendiente.current?.base === viva && pendiente.current.consulta === qs) return;");
    const aplicar = src.match(/const aplicar = \(campo: CampoRangoLista, valor: string\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
    expect(aplicar).toContain("const sp = paramsParaNavegar();");
    expect(aplicar).toContain('rangoListaCotizaciones(sp.get("desde"), sp.get("hasta"))');
    expect(aplicar).not.toContain("rangoAlCambiarCampo(rango,");
    // Ningún estado para la consulta pendiente: lo leen los handlers (y el temporizador).
    expect(src).not.toMatch(/useState<ConsultaPendiente/);
  });

  it("«Limpiar» suelta también desde/hasta y lleva cursor-pointer", () => {
    expect(src).toContain('pushQuery({ estado: "", cliente_id: "", q: "", desde: "", hasta: "" })');
    expect(src).toMatch(/onClick=\{limpiarTodo\}[\s\S]{0,200}cursor-pointer/);
  });

  it("sin <select> nativo, sin hex sueltos y sin max/min en las fechas", () => {
    expect(src).not.toMatch(/<select\b/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src).not.toMatch(/\bmax=/);
    expect(src).not.toMatch(/\bmin=/);
  });

  it("la página pasa `hoy` del servidor y `rangoIgnorado`; el bloque solo se monta con `hoy`", () => {
    expect(src).toContain("{hoy !== undefined && (");
    const pagina = leer("app", "admin", "quotes", "page.tsx");
    expect(pagina).toContain("const hoy = todayCancun();");
    expect(pagina).toContain("hoy={hoy}");
    expect(pagina).toContain("rangoIgnorado={rangoIgnorado}");
  });
});
