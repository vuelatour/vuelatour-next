/**
 * Pre-cierre «Tacómetros omitidos» (15-oct-2026, API 0.0.81, INFORMATIVO, no
 * bloquea). El card pinta el renglón en azul, con los chips de cada vuelo y
 * una línea por tramo que dice QUIÉN lo omitió, CUÁNDO (hora Cancún) y POR
 * QUÉ (`lineasTramosOmitidos`, fuente única). Sin «Resolver →»: no hay nada
 * que resolver; cada chip/línea lleva a su vuelo. El renglón de «Tacómetros
 * en revisión» sigue con sus motivos de revisión (no se mezclan).
 */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preCierre = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => preCierre(...a) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string; title?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");

const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };
const V300 = "3b7e0c1a-1d2e-4f5a-8b6c-7d8e9f0a1b2c";
const V301 = "4c8f1d2b-2e3f-4a6b-9c7d-8e9f0a1b2c3d";
const TITULO = "Tacómetros omitidos";

const tramo300 = {
  vuelo_id: V300,
  folio: 300,
  orden: 1,
  origen_iata: "CET",
  destino_iata: "CUN",
  // 20:00 UTC = 15:00 en Cancún.
  fecha_salida_plan: "2026-09-12T20:00:00Z",
  piloto_nombre: "Juan Pérez",
  motivo: "Falló el tacómetro",
  omitido_por_nombre: "Itzi",
  // 15:40 UTC = 10:40 a.m. en Cancún.
  omitido_at: "2026-10-15T15:40:00Z",
};

const item = (over: Record<string, unknown> = {}) => ({
  clave: "tacometros_omitidos",
  titulo: TITULO,
  detalle: "1 tramo sin lectura de tacómetro por una omisión registrada (aporta 0 h).",
  count: 1,
  informativo: true,
  vuelos: [{ id: V300, folio: 300 }],
  tramos: [tramo300],
  ...over,
});

const pintar = async () => renderToStaticMarkup(await PreCierreCard(PERIODO));

beforeEach(() => preCierre.mockReset());

describe("pre-cierre: renglón «Tacómetros omitidos»", () => {
  it("informativo (azul), con el chip del vuelo y la línea «Omitido por Itzi (15 oct, 10:40 a.m.): Falló el tacómetro»; sin «Resolver →»", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toContain("Todo en orden");
    expect(html).toContain('aria-label="Informativo"');
    expect(html).toContain("border-sky-500/30");
    expect(html).toMatch(new RegExp(`${TITULO} <span[^>]*sky[^>]*>· 1</span>`));
    // La línea del tramo: quién, cuándo (Cancún) y por qué.
    const tramos = html.match(/<ul[^>]*data-precierre-tramos="tacometros_omitidos"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(tramos).not.toBe("");
    expect(tramos).toContain(`href="/admin/flights/${V300}"`);
    expect(tramos).toContain("cursor-pointer");
    expect(tramos).toContain(
      "T1 CET → CUN · 12 sep, 03:00 p.m. · Juan Pérez · Omitido por Itzi (15 oct, 10:40 a.m.): Falló el tacómetro",
    );
    // Nada que resolver: ni «Resolver →» ni foco del pre-cierre.
    expect(html).not.toContain("Resolver →");
    expect(html).not.toContain("pc=tacometros_omitidos");
  });

  it("sin nombre de quien lo omitió dice «oficina»; «y N más…» sale del `count` del API", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [
        item({
          count: 5,
          vuelos: [
            { id: V300, folio: 300 },
            { id: V301, folio: 301 },
          ],
          tramos: [
            tramo300,
            { ...tramo300, vuelo_id: V301, folio: 301, omitido_por_nombre: null, omitido_at: null, motivo: "No se tomó la foto" },
          ],
        }),
      ],
    });
    const html = await pintar();
    expect(html).toContain("Omitido por oficina: No se tomó la foto");
    expect(html).toContain("y 3 más…");
  });

  it("«Tacómetros en revisión» conserva su motivo de revisión (no lleva «Omitido por»)", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [
        {
          clave: "tacos_en_revision",
          titulo: "Tacómetros en revisión",
          detalle: "1 tramo con la lectura por revisar.",
          count: 1,
          vuelos: [{ id: V301, folio: 301 }],
          tramos: [{ ...tramo300, vuelo_id: V301, folio: 301, motivo: "Llegada menor que la salida" }],
        },
      ],
    });
    const html = await pintar();
    expect(html).toContain("Juan Pérez · Llegada menor que la salida");
    expect(html).not.toContain("Omitido por");
  });

  it("count 0: no se pinta; lectura fallida: «sin verificar», sin «Resolver →»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [item({ count: 0, vuelos: [], tramos: [] })],
    });
    expect(await pintar()).not.toContain(TITULO);
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [item({ count: 0, vuelos: [], tramos: [], lectura_fallida: true, detalle: "No se pudo leer." })],
    });
    const fallida = await pintar();
    expect(fallida).toContain(TITULO);
    expect(fallida).toContain("· sin verificar");
    expect(fallida).not.toContain("Resolver →");
  });

  it("cableado: la clave usa `lineasTramosOmitidos` y NO tiene entrada en LINK_POR_CLAVE", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/admin/reportes/pre-cierre-card.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /item\.clave === CLAVE_PRECIERRE_TACOS_OMITIDOS\s*\?\s*lineasTramosOmitidos\(item\.tramos, MAX_TRAMOS_TACOS, item\.count\)/,
    );
    const bloque = src.slice(src.indexOf("const LINK_POR_CLAVE"), src.indexOf("const ETIQUETA_LINK_POR_CLAVE"));
    expect(bloque).not.toContain("tacometros_omitidos");
    expect(bloque).not.toContain("CLAVE_PRECIERRE_TACOS_OMITIDOS");
  });
});
