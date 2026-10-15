import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";

/**
 * Comodín de /admin (`app/admin/[...slug]`), 14-oct-2026: una ruta que NO
 * existe (enlace viejo, marcador) dentro de un módulo que SÍ funciona decía
 * «Vuelos — Este módulo aún no se ha construido» y la pestaña «Vuelos · En
 * construcción»: el operador leía que Vuelos no servía. Ahora la tarjeta y la
 * pestaña dicen «Página no encontrada» y regresan al módulo; «en
 * construcción» queda SOLO para un ítem del menú marcado `comingSoon`.
 */

// Un ítem `comingSoon` de prueba (hoy ninguno del menú real lo está).
vi.mock("@/lib/admin/nav-items", async (original) => {
  const real = await original<typeof import("@/lib/admin/nav-items")>();
  return {
    ...real,
    NAV_GROUPS: [
      ...real.NAV_GROUPS,
      {
        label: "Pruebas",
        items: [
          { label: "Bitácora de pruebas", href: "/admin/bitacora-pruebas", icon: WrenchScrewdriverIcon, comingSoon: true },
        ],
      },
    ],
  };
});

import ComingSoonPage, { generateMetadata } from "../[...slug]/page";
import { NAV_GROUPS } from "@/lib/admin/nav-items";

const params = (...slug: string[]) => ({ params: Promise.resolve({ slug }) });

async function pantalla(...slug: string[]) {
  const html = renderToStaticMarkup(await ComingSoonPage(params(...slug)));
  const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const href = /<a[^>]*href="([^"]*)"/.exec(html)?.[1] ?? null;
  return { html, texto, href };
}

const titulo = async (...slug: string[]) => (await generateMetadata(params(...slug))).title;

describe("comodín de /admin", () => {
  it("todo módulo del menú tiene su página, salvo los marcados `comingSoon` (hoy ninguno)", async () => {
    const real = await vi.importActual<typeof import("@/lib/admin/nav-items")>("@/lib/admin/nav-items");
    const app = join(__dirname, "..", "..");
    for (const item of real.NAV_GROUPS.flatMap((g) => g.items)) {
      const tienePagina = existsSync(join(app, item.href.replace(/^\//, ""), "page.tsx"));
      expect(tienePagina, `${item.href}: sin página debe marcarse comingSoon (y viceversa)`).toBe(!item.comingSoon);
    }
    expect(real.NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.comingSoon)).toEqual([]);
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.comingSoon).map((i) => i.href)).toEqual([
      "/admin/bitacora-pruebas",
    ]);
  });

  it("sub-ruta que no existe dentro de Vuelos: «Página no encontrada» y regresa a Vuelos", async () => {
    const p = await pantalla("flights", "3f9a1c2e-1234-4abc-8def-0123456789ab", "editar");
    expect(await titulo("flights", "3f9a1c2e-1234-4abc-8def-0123456789ab", "editar")).toBe(
      "Vuelos · Página no encontrada",
    );
    expect(p.texto).toContain("Página no encontrada");
    expect(p.texto).toContain("Esta página no existe dentro de Vuelos. Puede ser un enlace viejo o un marcador.");
    expect(p.texto).toContain("Volver a Vuelos");
    expect(p.href).toBe("/admin/flights");
    expect(p.texto).not.toMatch(/construido|construcción/i);
  });

  it("gana el módulo más específico (Pagos a socios dentro de Reparto)", async () => {
    expect(await titulo("profit-sharing", "socios", "x", "y")).toBe("Pagos a socios · Página no encontrada");
    const p = await pantalla("profit-sharing", "socios", "x", "y");
    expect(p.href).toBe("/admin/profit-sharing/socios");
    expect(p.texto).toContain("Volver a Pagos a socios");
  });

  it("ruta fuera de todo módulo: «Página no encontrada» y regresa al inicio", async () => {
    expect(await titulo("xyz")).toBe("Página no encontrada");
    const p = await pantalla("xyz");
    expect(p.texto).toContain("Página no encontrada");
    expect(p.texto).toContain("Esta página no existe. Puede ser un enlace viejo o un marcador.");
    expect(p.texto).toContain("Volver al inicio");
    expect(p.href).toBe("/admin");
    expect(p.texto).not.toMatch(/Inicio —|construido|construcción/);
  });

  it("solo un módulo `comingSoon` dice «en construcción» (y regresa al inicio, no a sí mismo)", async () => {
    expect(await titulo("bitacora-pruebas")).toBe("Bitácora de pruebas · En construcción");
    const p = await pantalla("bitacora-pruebas");
    expect(p.texto).toContain("Bitácora de pruebas");
    expect(p.texto).toContain("Este módulo aún no se ha construido.");
    expect(p.texto).not.toContain("Página no encontrada");
    expect(p.href).toBe("/admin");
    expect(p.texto).toContain("Volver al inicio");
  });
});
