/**
 * Semáforo de facturación: «No obtenida / no emitida» con motivo (2-nov-2026,
 * API 0.0.116, invariante 115 del API). Pedido de la oficina: «agregar la
 * opción "no obtenida o no emitida" y que se pueda agregar una nota o el
 * motivo por el cual no se pudo obtener esa factura».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import {
  FACTURACION_FILTRO_VALUES,
  estadoFacturacion,
  motivoNoObtenidaValido,
  opcionesFacturacionFiltro,
  opcionesFacturacionForm,
  tituloBadgeFacturacion,
} from "@/lib/admin/facturacion-estatus";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
}));

const { FacturacionBadge } = await import("../facturacion-badge");

const gasto = (estatus: string, nota?: string | null) =>
  ({ id: "g-1", estatus_facturacion: estatus, facturacion_nota: nota ?? null }) as Gasto;
const disparador = (html: string) => /<button[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
const TITULO = "Seguimiento de facturación de oficina (no toca el comprobante del piloto). Clic para cambiar.";

describe("regla pura", () => {
  it("NO_OBTENIDA existe, exige motivo, se lee «No obtenida» y no entra a los selectores de alta/verificación", () => {
    const e = estadoFacturacion("NO_OBTENIDA");
    expect(e.value).toBe("NO_OBTENIDA");
    expect(e.label).toBe("No obtenida");
    expect(e.requiereNota).toBe(true);
    expect(opcionesFacturacionForm().map((o) => o.value)).toEqual([
      "PENDIENTE",
      "SOLICITADA",
      "FACTURADA",
      "NO_FACTURABLE",
    ]);
    // El filtro de Gastos sí la ofrece y el API la acepta como igualdad.
    expect(opcionesFacturacionFiltro().map((o) => o.value)).toContain("NO_OBTENIDA");
    expect(FACTURACION_FILTRO_VALUES).toContain("NO_OBTENIDA");
    expect(FACTURACION_FILTRO_VALUES).toContain("NO_FACTURADA");
  });

  it("motivo válido: 1..500 tras recortar", () => {
    expect(motivoNoObtenidaValido("")).toBe(false);
    expect(motivoNoObtenidaValido("   ")).toBe(false);
    expect(motivoNoObtenidaValido("x")).toBe(true);
    expect(motivoNoObtenidaValido("x".repeat(500))).toBe(true);
    expect(motivoNoObtenidaValido("x".repeat(501))).toBe(false);
  });

  it("title del pill: con «No obtenida» antepone el motivo; compacta antepone también la etiqueta", () => {
    expect(tituloBadgeFacturacion(gasto("NO_OBTENIDA", "No la emitieron"), false)).toBe(
      `Motivo: No la emitieron · ${TITULO}`,
    );
    expect(tituloBadgeFacturacion(gasto("NO_OBTENIDA", "No la emitieron"), true)).toBe(
      `No obtenida · Motivo: No la emitieron · ${TITULO}`,
    );
    // Sin motivo (o en otro estado) el title es el de siempre.
    expect(tituloBadgeFacturacion(gasto("NO_OBTENIDA"), false)).toBe(TITULO);
    expect(tituloBadgeFacturacion(gasto("SOLICITADA", "basura"), true)).toBe(`Solicitada · ${TITULO}`);
  });
});

describe("FacturacionBadge con NO_OBTENIDA", () => {
  it("pinta «No obtenida» (compacta y normal) y el motivo en el title", () => {
    const c = disparador(
      renderToStaticMarkup(<FacturacionBadge gasto={gasto("NO_OBTENIDA", "Sin respuesta del FBO")} compacta />),
    );
    expect(c).toMatch(/<\/span>No obtenida<\/button>/);
    expect(c).toContain(`title="No obtenida · Motivo: Sin respuesta del FBO · ${TITULO}"`);
    const n = disparador(renderToStaticMarkup(<FacturacionBadge gasto={gasto("NO_OBTENIDA", "x")} />));
    expect(n).toMatch(/<\/span>No obtenida<\/button>/);
    expect(n).toContain(`title="Motivo: x · ${TITULO}"`);
  });

  it("los demás estados se pintan como siempre (sin motivo en el title)", () => {
    const b = disparador(renderToStaticMarkup(<FacturacionBadge gasto={gasto("NO_FACTURABLE")} compacta />));
    expect(b).toMatch(/<\/span>No requiere<\/button>/);
    expect(b).toContain(`title="No requiere factura · ${TITULO}"`);
  });

  it("cableado: «No obtenida» abre el diálogo del motivo y la action viaja con la nota", () => {
    const src = readFileSync(path.resolve(__dirname, "../facturacion-badge.tsx"), "utf8");
    expect(src).toContain("if (estadoFacturacion(estatus).requiereNota) {");
    expect(src).toContain('setMotivo(gasto.facturacion_nota ?? "");');
    expect(src).toContain('onClick={() => aplicar("NO_OBTENIDA", motivo.trim())}');
    expect(src).toContain("disabled={pending || !motivoNoObtenidaValido(motivo)}");
    expect(src).toContain("marcarFacturacionAction(gasto.id, estatus, nota)");
    // El camino de siempre (sin nota) sigue intacto para los otros estados.
    expect(src).toContain("marcarFacturacionAction(gasto.id, estatus)");
    const actions = readFileSync(path.resolve(__dirname, "../../../../app/admin/expenses/actions.ts"), "utf8");
    expect(actions).toContain("...(nota !== undefined ? { facturacion_nota: nota } : {})");
    const schema = readFileSync(path.resolve(__dirname, "../../../../app/admin/expenses/schema.ts"), "utf8");
    expect(schema).toContain('"NO_OBTENIDA",');
  });
});
