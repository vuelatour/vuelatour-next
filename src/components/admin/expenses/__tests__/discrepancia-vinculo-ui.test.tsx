/**
 * «Verificar / editar» REAL (render) y la línea ⚠ del vínculo no bancario
 * (revisión 6-oct-2026). Caso real: el estacionamiento del 28-sep (EFECTIVO,
 * vuelo #330) se ligó al cargo de $212.00 del 07-sep con una justificación y
 * el API le anotó «⚠ Conciliado con el cargo bancario del …». El diálogo
 * tomaba cualquier ⚠ por una discrepancia de la IA e invitaba a «corregir»
 * monto y moneda (que la liga bloquea). Una discrepancia de verdad sigue
 * encendiendo el aviso.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  verifyGastoAction: async () => ({ ok: true }),
  assignVueloGastoAction: async () => ({ ok: true }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  reanalizarComprobanteAction: async () => ({ ok: false }),
  sugerirAsignacionGastoAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/components/admin/comprobante-preview", () => ({
  ComprobantePreview: () => null,
}));
vi.mock("@/components/ui/dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-dialogo="">{children}</div> : null,
    DialogContent: Caja,
    DialogDescription: Caja,
    DialogFooter: Caja,
    DialogHeader: Caja,
    DialogTitle: Caja,
  };
});
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: () => <span data-select="" />,
}));

const { ExpenseVerifyDialog } = await import("../expense-verify-dialog");

const AVISO_IA = "La IA detectó discrepancias entre lo capturado y el comprobante";

/** La línea EXACTA que escribe el API en el gasto al ligarlo con justificación. */
const LINEA_VINCULO =
  "⚠ Conciliado con el cargo bancario del 07-sep-2026 ($212.00 · ASUR CANCUN) sin cambiar el medio de pago (EFECTIVO): Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28 — Itzi, 06-oct-2026";

/** El estacionamiento del 28-sep del caso real. */
function estacionamiento(notas: string | null): Gasto {
  return {
    id: "053fa6f4-2b14-4f17-9713-6f75efde971f",
    vuelo_id: "66bcadba-ded0-48a0-b9fa-d2377cd4b66d",
    escala_id: null,
    origen: "APP",
    factura_recibida_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-piloto",
    categoria: "TAXI",
    monto: "212",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-09-28",
    proveedor_id: null,
    medio_pago: "EFECTIVO",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: "ASUR",
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: true,
    duplicado_sospechado: false,
    notas,
    created_at: "2026-09-28T20:00:00Z",
    updated_at: "2026-10-06T20:00:00Z",
  } as Gasto;
}

const verificar = (gasto: Gasto) =>
  renderToStaticMarkup(
    <ExpenseVerifyDialog open onOpenChange={() => {}} gasto={gasto} aircraft={[]} providers={[]} />,
  );

describe("«Verificar / editar» con la línea ⚠ del vínculo no bancario", () => {
  it("caso real: el gasto ligado con justificación NO pinta «La IA detectó discrepancias»", () => {
    const html = verificar(estacionamiento(`Estacionamiento ASUR\n\n${LINEA_VINCULO}`));
    expect(html).toContain('data-dialogo=""');
    expect(html).not.toContain(AVISO_IA);
  });

  it("una discrepancia de verdad de la IA sí lo pinta (sola o junto a la línea del vínculo)", () => {
    const discrepancia = "⚠ el ticket dice $250.00 y se capturó $212.00 — revisar";
    expect(verificar(estacionamiento(discrepancia))).toContain(AVISO_IA);
    expect(verificar(estacionamiento(`${discrepancia}\n\n${LINEA_VINCULO}`))).toContain(AVISO_IA);
  });

  it("sin ⚠ ni notas: sin aviso", () => {
    expect(verificar(estacionamiento("Estacionamiento ASUR"))).not.toContain(AVISO_IA);
    expect(verificar(estacionamiento(null))).not.toContain(AVISO_IA);
  });
});
