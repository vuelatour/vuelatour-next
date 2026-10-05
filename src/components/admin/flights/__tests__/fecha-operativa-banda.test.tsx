/**
 * BANDA del detalle del vuelo «la cotización dice un día y el vuelo operativo
 * otro» (revisión 5-oct-2026 del modal de fecha de la cotización).
 *
 * Qué se custodia:
 *  1. RENDER: con desfase, las dos fechas (día Cancún) y el botón «Mover el
 *     vuelo operativo a la fecha de la cotización» con `cursor-pointer`; sin
 *     permiso, la nota de a quién pedírselo y SIN botón; sin desfase, nada.
 *  2. CABLEADO: la página del vuelo decide con `decidirBandaFechaOperativa`
 *     sobre el snapshot, el botón solo para ADMIN/COORDINADOR
 *     (`puedeMoverVueloOperativo`) y la banda reutiliza el MISMO diálogo
 *     (`ReagendarTramosDialog`, `contexto="vuelo"`) — no otra action.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_BANDA_MOVER,
  NOTA_BANDA_SIN_PERMISO,
  decidirBandaFechaOperativa,
} from "@/lib/admin/quote-fecha-operativa";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/flights/actions", () => ({ alinearFechaTramosAction: vi.fn() }));
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Pasa,
    AlertDialogCancel: Pasa,
  };
});

const { FechaOperativaBanda } = await import("../fecha-operativa-banda");

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
// 22:30 del 7 en Cancún (03:30Z del 8); operación el 5 a las 10:00.
const CONFIRMADO_DESFASADO = {
  estado: "CONFIRMADO",
  fecha_vuelo: "2026-10-08T03:30:00.000Z",
  escalas: [
    { orden: 1, fecha_salida_plan: "2026-10-05T15:00:00.000Z", cancelada_at: null },
    { orden: 2, fecha_salida_plan: "2026-10-05T20:00:00.000Z", cancelada_at: null },
  ],
};

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("render de la banda", () => {
  it("con desfase y permiso: las dos fechas y el botón con cursor-pointer", () => {
    const html = renderToStaticMarkup(
      <FechaOperativaBanda
        decision={decidirBandaFechaOperativa(CONFIRMADO_DESFASADO)}
        vueloId={VUELO}
        puedeMover
      />,
    );
    const t = texto(html);
    expect(t).toContain(
      "La cotización dice el 7 de octubre de 2026, pero el vuelo operativo (sus tramos) sigue programado para el 5 de octubre de 2026.",
    );
    const botones = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(botones).toHaveLength(1);
    expect(texto(botones[0][2]).trim()).toBe(BOTON_BANDA_MOVER);
    expect(botones[0][1]).toMatch(/class="[^"]*\bcursor-pointer\b/);
    expect(t).not.toContain(NOTA_BANDA_SIN_PERMISO);
    // El diálogo no se monta hasta el clic.
    expect(html).not.toContain('data-dialogo="abierto"');
  });

  it("sin permiso: la banda informa a quién pedírselo y NO trae botón", () => {
    const html = renderToStaticMarkup(
      <FechaOperativaBanda
        decision={decidirBandaFechaOperativa(CONFIRMADO_DESFASADO)}
        vueloId={VUELO}
        puedeMover={false}
      />,
    );
    expect(texto(html)).toContain(NOTA_BANDA_SIN_PERMISO);
    expect(html).not.toContain("<button");
  });

  it("sin desfase (mismo día, ya voló, cancelado) no pinta nada", () => {
    const pinta = (v: Parameters<typeof decidirBandaFechaOperativa>[0]) =>
      renderToStaticMarkup(
        <FechaOperativaBanda decision={decidirBandaFechaOperativa(v)} vueloId={VUELO} puedeMover />,
      );
    expect(pinta({ ...CONFIRMADO_DESFASADO, fecha_vuelo: "2026-10-05T15:00:00.000Z" })).toBe("");
    expect(pinta({ ...CONFIRMADO_DESFASADO, estado: "COMPLETADO" })).toBe("");
    expect(pinta({ ...CONFIRMADO_DESFASADO, estado: "CANCELADO" })).toBe("");
  });
});

// ───────────────────────────── Cableado ─────────────────────────────

const RAIZ = path.resolve(__dirname, "../../../../..");
const leer = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const pagina = leer("src/app/admin/flights/[id]/page.tsx");
const banda = leer("src/components/admin/flights/fecha-operativa-banda.tsx");

describe("cableado de la banda en el detalle del vuelo", () => {
  it("la página decide con la fuente única y pasa el permiso por rol", () => {
    expect(pagina).toContain(
      'import { FechaOperativaBanda } from "@/components/admin/flights/fecha-operativa-banda";',
    );
    expect(pagina).toContain("const bandaFechaOperativa = decidirBandaFechaOperativa(snapshot);");
    expect(pagina).toMatch(
      /<FechaOperativaBanda\s+decision=\{bandaFechaOperativa\}\s+vueloId=\{snapshot\.id\}\s+puedeMover=\{puedeMoverVueloOperativo\(me\?\.rol\)\}\s*\/>/,
    );
  });

  it("la banda reutiliza el MISMO diálogo (contexto vuelo) y no llama a la action por su cuenta", () => {
    expect(banda).toContain(
      'import { ReagendarTramosDialog } from "@/components/admin/quotes/reagendar-tramos-dialog";',
    );
    expect(banda).toContain('contexto="vuelo"');
    expect(banda).not.toContain("alinearFechaTramosAction");
  });
});
