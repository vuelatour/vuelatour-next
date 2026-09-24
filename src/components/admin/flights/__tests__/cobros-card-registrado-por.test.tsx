/**
 * «Registró: …» en la lista de cobros del vuelo (22-sep-2026, pedido del
 * cliente). El TEXTO se prueba aparte en
 * `lib/admin/__tests__/cobro-registrado-por.test.ts`; aquí se cuida el
 * CABLEADO, que es justo lo que se rompe al mover el componente:
 *
 *  1. Con `registrado_por_nombre` la frase llega de verdad al marcado, con
 *     su tooltip (registrar ≠ pagar) y también en un REEMBOLSO.
 *  2. **Sin el campo (API sin desplegar) el marcado es BYTE A BYTE el de
 *     hoy**: se compara el HTML completo de la card contra el mismo render
 *     con el campo, quitando SOLO el renglón nuevo. Si alguien cambiara algo
 *     más «de paso», esta comparación falla.
 *  3. `null` (usuario borrado) se comporta como el campo ausente: jamás
 *     «Registró: null» ni el uuid crudo.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FlightCobro } from "@/types/flights";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
// El alta de cobro y el reembolso viven en sus propios diálogos (server
// actions dentro): aquí solo importa la LISTA.
vi.mock("../cobro-form-sheet", () => ({ CobroFormSheet: () => null }));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => null }));
vi.mock("@/app/admin/flights/actions", () => ({
  deleteCobroAction: async () => ({ ok: true }),
}));
// La subida de la factura va del navegador al API (24-sep-2026) y ese módulo
// lee las variables NEXT_PUBLIC_* al importarse: aquí no se sube nada.
vi.mock("@/lib/api/factura-cliente-browser", () => ({
  subirFacturaClienteDirecto: async () => ({ ok: false, error: "no aplica" }),
  leerBytes: async () => null,
}));

const { CobrosCard } = await import("../cobros-card");

/** Los dos renglones de la captura del cliente: un cobro y su reembolso. */
const COBRO: FlightCobro = {
  id: "c-1",
  vuelo_id: "v-1",
  monto: "600",
  moneda: "USD",
  metodo_cobro: "DOLARES",
  tc_usd_mxn: null,
  referencia: null,
  cuenta_destino: null,
  fecha_cobro: "2026-09-21T15:00:00-05:00",
  foto_voucher_url: null,
  registrado_por: "3f1c9a2e-7b84-4d15-9f60-2a8c5e1b7d93",
  notas: null,
  created_at: "2026-09-21T15:00:00-05:00",
  updated_at: "2026-09-21T15:00:00-05:00",
} as FlightCobro;

const REEMBOLSO: FlightCobro = {
  ...COBRO,
  id: "c-2",
  monto: "-100",
  metodo_cobro: "TRANSFERENCIA",
  notas: "Cancelación del tramo 2",
} as FlightCobro;

function render(cobros: FlightCobro[]): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-1"
      flightFolio={314}
      flightEstado="COMPLETADO"
      montoTotalUsd={600}
      pendingUsd={0}
      cobradoUsd={600}
      cobros={cobros}
    />,
  );
}

describe("CobrosCard · quién registró el cobro (cableado)", () => {
  it("con el nombre: la frase y su tooltip llegan al marcado", () => {
    const html = render([{ ...COBRO, registrado_por_nombre: "Itzi" }]);
    expect(html).toContain("Registró: Itzi");
    expect(html).toContain("no es quién lo pagó");
  });

  it("también en un REEMBOLSO (es un cobro negativo, misma fila)", () => {
    const html = render([
      { ...REEMBOLSO, registrado_por_nombre: "Pablo Canales" },
    ]);
    expect(html).toContain("Reembolso");
    expect(html).toContain("Registró: Pablo Canales");
  });

  it("API sin desplegar (campo AUSENTE): marcado idéntico al de hoy", () => {
    const sinCampo = render([COBRO, REEMBOLSO]);
    expect(sinCampo).not.toContain("Registró");
    expect(sinCampo).not.toContain(COBRO.registrado_por as string);
    // Aditivo de verdad: el render CON nombre es el mismo marcado más los
    // dos renglones nuevos, y nada más.
    const conCampo = render([
      { ...COBRO, registrado_por_nombre: "Itzi" },
      { ...REEMBOLSO, registrado_por_nombre: "Itzi" },
    ]);
    const renglon =
      '<p class="text-[11px] text-muted-foreground truncate" title="Quién capturó este cobro en el sistema (no es quién lo pagó)">Registró: Itzi</p>';
    expect(conCampo.split(renglon)).toHaveLength(3);
    expect(conCampo.split(renglon).join("")).toBe(sinCampo);
  });

  it("usuario borrado (null) o nombre vacío: no se pinta nada", () => {
    for (const nombre of [null, "", "   "]) {
      const html = render([{ ...COBRO, registrado_por_nombre: nombre }]);
      expect(html).not.toContain("Registró");
      expect(html).not.toContain("null");
    }
  });

  it("un uuid sin resolver NO se delata en pantalla", () => {
    const html = render([
      { ...COBRO, registrado_por_nombre: COBRO.registrado_por },
    ]);
    expect(html).not.toContain("Registró");
    expect(html).not.toContain(COBRO.registrado_por as string);
  });
});
