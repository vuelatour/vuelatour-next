/**
 * Configuración → Créditos de IA: la banda de saldo (1-oct-2026). En prod el
 * saldo estimado quedó en ≈ $0.87 USD y la app ya respondía «Claude no
 * disponible (400)»: la sección pintaba el número sin ninguna alerta.
 *
 * La regla, los textos y el COLOR viven en `lib/admin/ia-saldo.ts` (su prueba
 * tiene los números); aquí se congela que la sección los PINTA: rojo si se
 * agotó o está por agotarse, ámbar si queda poco, nada si alcanza, nada
 * cuando el resumen no cargó (no se afirma un saldo que no se pudo leer), y
 * que el número de la tarjeta y la banda dicen el MISMO color. Al final, el
 * cableado de la página.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { IaUsoResumen } from "@/lib/api/ia-uso-server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/configuracion",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/configuracion/actions", () => ({
  capturarIaSaldoAction: async () => ({ ok: false, error: "mock" }),
}));

const { IaCreditosSection } = await import("../ia-creditos-section");
const {
  ETIQUETA_ACTUALIZAR_SALDO_IA,
  ETIQUETA_RECARGAR_IA,
  TEXTO_SALDO_IA_AGOTADO,
  TEXTO_SALDO_IA_DESCONOCIDO,
} = await import("@/lib/admin/ia-saldo");

function resumen(saldo: number | null): IaUsoResumen {
  return {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    total: { llamadas: 12, input_tokens: 40_000, output_tokens: 3_000, costo_usd: 1.67 },
    por_categoria: [
      { categoria: "GASTO_TICKET", llamadas: 12, input_tokens: 40_000, output_tokens: 3_000, costo_usd: 1.67 },
    ],
    por_modelo: [],
    por_dia: [{ dia: "2026-10-01", llamadas: 12, costo_usd: 1.67 }],
    checkpoint:
      saldo == null
        ? null
        : { saldo_usd: 21.39, notas: null, created_at: "2026-09-05T15:00:00Z" },
    saldo_estimado: saldo,
  };
}

function pintar(saldo: number | null, consumo7dUsd: number | null = 7.44): string {
  return renderToStaticMarkup(
    <IaCreditosSection
      resumen={resumen(saldo)}
      mes="2026-10"
      mesActual="2026-10"
      consumo7dUsd={consumo7dUsd}
    />,
  );
}

/** El `<div data-saldo-ia>` de la banda, o null. */
function banda(html: string): { nivel: string; html: string } | null {
  const m = html.match(/<div[^>]*data-saldo-ia="([^"]+)"[^>]*>[\s\S]*?<\/div><\/div>/);
  return m ? { nivel: m[1], html: m[0] } : null;
}

/** Tono del número grande de la tarjeta «Saldo estimado». */
function tonoNumero(html: string): string | null {
  return html.match(/data-tono-saldo="([^"]+)"/)?.[1] ?? null;
}

/** El color de la banda según su clase. */
function colorBanda(b: { html: string } | null): "rojo" | "ambar" | null {
  if (!b) return null;
  if (b.html.includes("border-red-500/50")) return "rojo";
  if (b.html.includes("border-amber-500/50")) return "ambar";
  return null;
}

describe("banda de saldo de créditos de IA", () => {
  it("caso real ($0.87, $7.44 en 7 días): banda ROJA con role=alert, «menos de 1 día» y las dos salidas", () => {
    const html = pintar(21.39 - 20.52);
    const b = banda(html);
    expect(b?.nivel).toBe("critico");
    expect(colorBanda(b)).toBe("rojo");
    expect(b?.html).toContain('role="alert"');
    expect(b?.html).toContain(
      "Saldo de créditos de IA por agotarse: quedan ≈ $0.87 USD (menos de 1 día al ritmo de la última semana). La estimación no cuenta las lecturas que fallan, así que la lectura de tickets puede estar fallando ya: recarga en Anthropic y actualiza el saldo aquí.",
    );
    expect(b?.html).toContain(ETIQUETA_RECARGAR_IA);
    expect(b?.html).toContain("https://console.anthropic.com/settings/billing");
    expect(b?.html).toContain(ETIQUETA_ACTUALIZAR_SALDO_IA);
    // Todo lo que se pulsa lleva la manita.
    expect(b?.html).toMatch(/<a[^>]*class="[^"]*cursor-pointer/);
    expect(b?.html).toMatch(/<button[^>]*class="[^"]*cursor-pointer/);
  });

  it("la banda va ARRIBA del resumen (antes de la card «Saldo estimado»)", () => {
    const html = pintar(0.87);
    expect(html.indexOf("data-saldo-ia")).toBeGreaterThan(-1);
    expect(html.indexOf("data-saldo-ia")).toBeLessThan(html.indexOf("Saldo estimado"));
  });

  it("agotado: banda ROJA con role=alert y el texto de la fuente única", () => {
    const b = banda(pintar(-0.42));
    expect(b?.nivel).toBe("agotado");
    expect(colorBanda(b)).toBe("rojo");
    expect(b?.html).toContain('role="alert"');
    expect(b?.html).toContain(TEXTO_SALDO_IA_AGOTADO.replace("&", "&amp;"));
  });

  it("bajo ($3.50, ~3 días): banda ÁMBAR con role=status", () => {
    const b = banda(pintar(3.5));
    expect(b?.nivel).toBe("bajo");
    expect(colorBanda(b)).toBe("ambar");
    expect(b?.html).toContain('role="status"');
    expect(b?.html).toContain(
      "Saldo bajo de créditos de IA: quedan ≈ $3.50 USD (unos 3 días al ritmo de la última semana). Recarga en Anthropic y actualiza el saldo aquí.",
    );
  });

  it("saldo suficiente: sin banda", () => {
    expect(banda(pintar(42.1))).toBeNull();
    expect(banda(pintar(5))).toBeNull();
    expect(banda(pintar(80))).toBeNull();
  });

  it("sin ritmo medible: la banda sale igual, sin «N días»", () => {
    const b = banda(pintar(3.5, null));
    expect(b?.nivel).toBe("bajo");
    expect(b?.html).toContain("quedan ≈ $3.50 USD. Recarga en Anthropic");
    expect(b?.html).not.toContain("al ritmo de la última semana");
  });

  it("sin checkpoint: sin banda; la card lo dice con el texto de la fuente única", () => {
    const html = pintar(null);
    expect(banda(html)).toBeNull();
    expect(html).toContain(TEXTO_SALDO_IA_DESCONOCIDO);
    expect(tonoNumero(html)).toBe("apagado");
  });

  it("resumen que no cargó: ni banda ni «sin saldo capturado» (no se sabe)", () => {
    const html = renderToStaticMarkup(
      <IaCreditosSection resumen={null} mes="2026-10" mesActual="2026-10" consumo7dUsd={null} />,
    );
    expect(banda(html)).toBeNull();
    expect(html).not.toContain(TEXTO_SALDO_IA_DESCONOCIDO);
    // El estado vacío también usa el nombre único del botón.
    expect(html).toContain(ETIQUETA_ACTUALIZAR_SALDO_IA);
  });
});

describe("el número de la tarjeta y la banda dicen el MISMO color", () => {
  it.each([
    [21.39 - 20.52, "rojo"],
    [-0.42, "rojo"],
    [3.5, "ambar"],
    [15, "ambar"],
    [60, "neutro"],
  ] as const)("saldo %s ⇒ %s", (saldo, tono) => {
    const html = pintar(saldo);
    expect(tonoNumero(html)).toBe(tono);
    const b = banda(html);
    // Si hay banda, su color es el del número; «atención» ($15) no tiene.
    if (b) expect(colorBanda(b)).toBe(tono);
    else expect(saldo).toBeGreaterThanOrEqual(5);
  });

  it("número en rojo/ámbar con las clases de siempre; «atención» explica para cuántos días alcanza", () => {
    expect(pintar(0.87)).toMatch(/<p class="[^"]*text-red-600[^"]*" data-tono-saldo="rojo">/);
    const atencion = pintar(15);
    expect(atencion).toMatch(/<p class="[^"]*text-amber-600[^"]*" data-tono-saldo="ambar">/);
    expect(atencion).toContain("Al ritmo de la última semana alcanza para unos 14 días.");
    expect(pintar(60)).not.toContain("alcanza para");
  });

  it("UN solo nombre para la captura del saldo: «Actualizar saldo» en banda y tarjeta, nunca «Registrar»", () => {
    const html = pintar(0.87);
    expect(html.split(`>${ETIQUETA_ACTUALIZAR_SALDO_IA}<`).length - 1).toBe(2);
    expect(html).not.toContain("Registrar el nuevo saldo");
  });
});

describe("cableado de la página de Configuración", () => {
  const pagina = readFileSync(
    path.resolve(__dirname, "../../../../app/admin/configuracion/page.tsx"),
    "utf8",
  );

  it("mide los últimos 7 días Cancún y se los pasa a la sección", () => {
    expect(pagina).toContain("rangoUltimosDiasIa(todayCancun())");
    expect(pagina).toContain("rangoCubre(rango, ultimos7)");
    // Si el mes en pantalla no contiene la semana, lectura aparte (en el
    // MISMO Promise.all: no agrega latencia en serie).
    expect(pagina).toContain(
      "mesCubre7Dias ? Promise.resolve(null) : getIaUso(ultimos7.desde, ultimos7.hasta)",
    );
    expect(pagina).toContain("consumoEnRangoIa(");
    expect(pagina).toMatch(/<IaCreditosSection[\s\S]*?consumo7dUsd=\{consumo7dUsd\}/);
  });
});
