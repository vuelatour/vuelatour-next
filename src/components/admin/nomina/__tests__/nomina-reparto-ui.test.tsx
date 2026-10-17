/**
 * «Repartir la nómina entre aviones» (16-oct-2026, API 0.0.90) — la UI:
 * el resumen «Repartido / Sin repartir / Por avión» renderizado, el botón
 * de la cabecera, el CABLEADO del diálogo (vista previa con debounce + turno
 * + `.catch`, confirmaciones antes de escribir, refresh al cerrar) y el
 * «Resolver →» del pre-cierre `nomina_sin_repartir`. Sin DOM: render
 * estático + regex sobre el fuente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/nomina/actions", () => ({ repartoIgualesAction: vi.fn() }));
vi.mock("@/app/admin/expenses/actions", () => ({ listAvionesActivosAction: vi.fn() }));
const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string; title?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { NominaRepartoResumen } = await import("@/components/admin/nomina/nomina-reparto-resumen");
const { NominaRepartoBoton } = await import("@/components/admin/nomina/nomina-reparto-boton");
const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");
const {
  NOTA_SIN_REPARTIR,
  TEXTO_NADA_REPARTIDO,
  ETIQUETA_BOTON_REPARTIR_NOMINA,
  TITULO_BOTON_REPARTIR_NOMINA,
  resumenRepartoNomina,
} = await import("@/lib/admin/nomina-reparto");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fuente = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

beforeEach(() => apiServer.mockReset());

describe("NominaRepartoResumen", () => {
  it("octubre real repartido entre 4 aviones: tres tarjetas, montos por matrícula, sin nota ámbar", () => {
    const resumen = resumenRepartoNomina([
      {
        id: uuid(1),
        monto: "109921.46",
        moneda: "MXN",
        repartos: [
          { aeronave_id: uuid(101), monto: "27480.37", aeronave: { matricula: "N4142R" } },
          { aeronave_id: uuid(102), monto: "27480.37", aeronave: { matricula: "N621TX" } },
          { aeronave_id: uuid(103), monto: "27480.36", aeronave: { matricula: "N990GG" } },
          { aeronave_id: uuid(104), monto: "27480.36", aeronave: { matricula: "XA-VGV" } },
        ],
      },
    ]);
    const html = renderToStaticMarkup(<NominaRepartoResumen resumen={resumen} />);
    expect(html).toContain('data-resumen-reparto-nomina=""');
    expect(html.match(/data-tarjeta-reparto="/g)).toHaveLength(3);
    expect(html).toContain("$109,921.46 MXN");
    expect(html).toContain('data-avion="N4142R"');
    expect(html).toContain("$27,480.37 MXN");
    expect(html).toContain("$27,480.36 MXN");
    expect(html).not.toContain(NOTA_SIN_REPARTIR);
    expect(html).not.toContain(TEXTO_NADA_REPARTIDO);
  });

  it("nada repartido: «Todavía no se reparte ningún pago.» y la nota ámbar; USD aparte", () => {
    const resumen = resumenRepartoNomina([
      { id: uuid(1), monto: "5000.00", moneda: "MXN", repartos: [] },
      { id: uuid(2), monto: "100.00", moneda: "USD", repartos: [] },
    ]);
    const html = renderToStaticMarkup(<NominaRepartoResumen resumen={resumen} />);
    expect(html).toContain(TEXTO_NADA_REPARTIDO);
    expect(html).toContain(NOTA_SIN_REPARTIR);
    expect(html).toContain("$5,000 MXN");
    expect(html).toContain("$100 USD");
    expect(html).toMatch(/text-amber-700[^"]*">\$5,000 MXN/);
  });
});

describe("NominaRepartoBoton", () => {
  it("botón con texto, title, aria-haspopup y cursor-pointer; el diálogo NO se monta en reposo", () => {
    const html = renderToStaticMarkup(<NominaRepartoBoton pagos={[]} etiquetaMes="octubre 2026" />);
    expect(html).toContain(ETIQUETA_BOTON_REPARTIR_NOMINA);
    expect(html).toContain(`title="${TITULO_BOTON_REPARTIR_NOMINA}"`);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/class="[^"]*cursor-pointer/);
    expect(html).not.toContain("1. ¿Qué pagos?");
  });
});

describe("cableado del diálogo", () => {
  const dialogo = fuente("../nomina-reparto-dialog.tsx");
  it("vista previa automática con debounce + turno + `.catch` y `simular: true`", () => {
    expect(dialogo).toMatch(/setTimeout\([\s\S]*?ESPERA_VISTA_PREVIA_MS\)/);
    expect(dialogo).toMatch(/const turno = \+\+turnoRef\.current/);
    expect(dialogo).toMatch(/if \(turno !== turnoRef\.current\) return/);
    expect(dialogo).toMatch(/repartoIgualesAction\(\{ gasto_ids, aeronave_ids, simular: true \}\)\s*\.catch\(sinConexion\)/);
  });
  it("aplicar y quitar: sin `simular`; quitar manda `aeronave_ids: []`; siempre con `.catch`", () => {
    expect(dialogo).toMatch(/aeronave_ids: quitar \? \[\] : \[\.\.\.avionesSel\]/);
    const aplicar = dialogo.slice(dialogo.indexOf("const ejecutar"), dialogo.indexOf("const alPulsarRepartir"));
    expect(aplicar).not.toMatch(/simular/);
    expect(aplicar).toMatch(/\.catch\(sinConexion\)/);
  });
  it("«Quitar el reparto» SIEMPRE confirma; reemplazar confirma solo con pagos ya repartidos", () => {
    expect(dialogo).toMatch(/onClick=\{\(\) => setConfirmar\("quitar"\)\}/);
    expect(dialogo).toMatch(/if \(pagosYaRepartidos\(previa\) > 0\) \{\s*setConfirmar\("reemplazo"\)/);
    expect(dialogo).toMatch(/<AlertDialogContent backdropForceRender>/);
    expect(dialogo).toMatch(/e\.preventDefault\(\);\s*ejecutar\(confirmar === "quitar"\)/);
  });
  it("la página se pone al día con UN router.refresh() al CERRAR (la action no revalida)", () => {
    expect(dialogo).toMatch(/refrescarAlCerrarRef\.current = false;\s*router\.refresh\(\)/);
    const accion = fuente("../../../../app/admin/nomina/actions.ts");
    expect(accion).not.toMatch(/revalidatePath\(/);
  });
  it("todo lo que se pulsa lleva cursor-pointer", () => {
    const botones = dialogo.match(/<Button[\s\S]*?>/g) ?? [];
    expect(botones.length).toBeGreaterThan(3);
    for (const b of botones) expect(b, b).toMatch(/cursor-pointer/);
  });
});

describe("pre-cierre `nomina_sin_repartir`", () => {
  it("«Resolver →» va a la nómina del MES del periodo con el foco ámbar", async () => {
    apiServer.mockResolvedValueOnce({
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      listo: false,
      items: [
        {
          clave: "nomina_sin_repartir",
          titulo: "Nómina sin repartir entre aviones",
          detalle: "7 pagos por $25,757.80 MXN",
          count: 2,
          monto_mxn: 25757.8,
          ids: [uuid(1), uuid(2)],
        },
      ],
    });
    const html = renderToStaticMarkup(await PreCierreCard({ desde: "2026-09-01", hasta: "2026-09-30" }));
    const m = /<a href="([^"]*)"[^>]*>Resolver →<\/a>/.exec(html);
    expect(m).not.toBeNull();
    const href = (m as RegExpExecArray)[1].replace(/&amp;/g, "&");
    expect(href.startsWith("/admin/nomina?mes=2026-09&pc=nomina_sin_repartir")).toBe(true);
    expect(href).toContain(`ids=${uuid(1)},${uuid(2)}`);
  });
});
