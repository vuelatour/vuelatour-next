/**
 * Diálogo «Registrar pago» / «Editar pago» a un socio (1-oct-2026, API 0.0.49),
 * renderizado de verdad (antes solo se miraba el código con regex).
 *
 * Qué se congela:
 *  1. el prellenado del ALTA sale de la fila del API: monto = PENDIENTE (no la
 *     utilidad), USD marcado, fecha = HOY Cancún calculado al abrir (no el del
 *     render del servidor), «Entregó» = yo y el MÉTODO sin elegir;
 *  2. la moneda siempre a la vista («Monto entregado (USD)», «pendiente … USD»);
 *  3. la EDICIÓN arranca con lo que tiene el pago;
 *  4. el bloque del exceso: «Revisar el monto» / «Registrar de todas formas»;
 *  5. todo botón lleva `cursor-pointer`.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FilaPagoSocio, PagoSocio } from "@/types/reparto-pagos";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));
// El diálogo de Base UI vive en un portal (no existe en react-dom/server):
// se sustituye por un pase en línea, como en las pruebas de inventario.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { FormularioPago, AvisoExcesoPago, BotonesExcesoPago } = await import("../pago-socio-dialog");
const { confirmacionExceso } = await import("@/lib/admin/reparto-pagos");

const AVION = "a1a1a1a1-0000-4000-8000-000000000001";
const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const ITZI = { id: "0f1c0000-0000-4000-8000-000000000010", nombre: "Itzi" };

const FILA: FilaPagoSocio = {
  aeronave: { id: AVION, matricula: "N4142R", modelo: "Piper Seneca V" },
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  porcentaje: 69,
  // Utilidad ≠ pendiente a propósito: el prellenado es el PENDIENTE.
  utilidad_usd: 1500,
  pagado_usd: 104.06,
  pendiente_usd: 1395.94,
  exceso_usd: 0,
  estado: "PARCIAL",
  utilidad_al_pagar_usd: null,
  utilidad_difiere: false,
  pagos: [],
};

const PAGO_MXN: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  aeronave_id: AVION,
  socio_id: MAURICIO,
  periodo: "2026-09-01",
  monto: 20000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 1081.08,
  utilidad_snapshot_usd: 1395.94,
  fecha_pago: "2026-09-30",
  metodo: "TRANSFERENCIA",
  referencia: "SPEI 123456",
  entregado_por: ITZI.id,
  entregado_por_nombre: "Itzi",
  recibido_por: null,
  factura_folio: "A-77",
  comprobante_path: null,
  comprobante_url: null,
  notas: null,
  created_by: ALE.id,
  created_by_nombre: "Alejandro Canales",
  created_at: "2026-09-30T17:30:00Z",
};

// 1-oct-2026 10:00 en Cancún. El `hoy` del servidor (respaldo) es AYER: la
// pestaña quedó abierta desde la noche anterior.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const radio = (html: string, texto: string) =>
  html.match(new RegExp(`<button[^>]*role="radio"[^>]*>${texto}</button>`))?.[0] ?? "";

describe("alta «Registrar pago»", () => {
  const html = renderToStaticMarkup(
    <FormularioPago
      dialogo={{ tipo: "alta", fila: FILA, mes: "2026-09" }}
      onCerrar={() => {}}
      usuarios={[ALE, ITZI]}
      me={ALE}
      hoy="2026-09-30"
    />,
  );

  it("título y descripción con la moneda a la vista", () => {
    expect(html).toContain("Registrar pago a Mauricio Roque");
    expect(html).toContain(
      "N4142R · Septiembre 2026 · utilidad del mes $1,500 USD · pagado $104.06 USD · pendiente $1,395.94 USD",
    );
  });

  it("monto = el PENDIENTE del API (no la utilidad), con la moneda en la etiqueta", () => {
    expect(html).toContain('value="1395.94"');
    expect(html).not.toContain('value="1500.00"');
    expect(html).toContain("Monto entregado (USD)");
    expect(html).toContain("Prellenado con el pendiente del mes: $1,395.94 USD.");
  });

  it("USD marcado y NINGÚN método elegido (regla del 3-sep: nada de medio de pago por defecto)", () => {
    expect(radio(html, "USD")).toContain('aria-checked="true"');
    expect(radio(html, "MXN")).toContain('aria-checked="false"');
    for (const m of ["Transferencia", "Efectivo", "Cheque", "Otro"]) {
      expect(radio(html, m), m).toContain('aria-checked="false"');
    }
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain("¿Cómo se pagó?");
    // Sin T.C. mientras sea USD.
    expect(html).not.toContain("Tipo de cambio USD/MXN");
  });

  it("fecha = HOY Cancún calculado al abrir (no el «hoy» viejo del servidor) y tope en hoy", () => {
    expect(html).toMatch(/<input[^>]*type="date"[^>]*>/);
    const fecha = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(fecha).toContain('value="2026-10-01"');
    expect(fecha).toContain('max="2026-10-01"');
    expect(html).not.toContain('value="2026-09-30"');
  });

  it("«Entregó» = yo", () => {
    expect(html).toContain(">Alejandro Canales</span>");
    expect(html).toContain("Quién le entregó el dinero.");
  });

  it("comprobante opcional y el botón principal", () => {
    expect(html).toContain("Comprobante (opcional)");
    expect(html).toContain("Elegir foto o PDF");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Registrar pago<\/button>/);
  });

  it("todo botón lleva la manita", () => {
    const botones = html.match(/<button[^>]*>/g) ?? [];
    expect(botones.length).toBeGreaterThan(5);
    for (const b of botones) expect(b, b).toContain("cursor-pointer");
  });
});

describe("edición «Editar pago»", () => {
  const html = renderToStaticMarkup(
    <FormularioPago
      dialogo={{ tipo: "edicion", fila: FILA, pago: PAGO_MXN }}
      onCerrar={() => {}}
      usuarios={[ALE, ITZI]}
      me={ALE}
      hoy="2026-10-01"
    />,
  );

  it("arranca con lo que tiene el pago (pesos, T.C., método, quién entregó, fecha)", () => {
    expect(html).toContain("Editar pago a Mauricio Roque");
    expect(html).toContain('value="20000"');
    expect(html).toContain("Monto entregado (MXN)");
    expect(radio(html, "MXN")).toContain('aria-checked="true"');
    expect(radio(html, "Transferencia")).toContain('aria-checked="true"');
    expect(html).toContain('value="18.5"');
    expect(html).toContain('value="2026-09-30"');
    expect(html).toContain(">Itzi</span>");
    expect(html).toContain('value="A-77"');
    expect(html).toContain('value="SPEI 123456"');
  });

  it("sin ayuda de «pendiente» (en la edición no hay prellenado) ni comprobante en el formulario", () => {
    expect(html).not.toContain("Prellenado con el pendiente");
    expect(html).not.toContain("Captura el monto en pesos");
    expect(html).not.toContain("Comprobante (opcional)");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Guardar cambios<\/button>/);
  });
});

describe("confirmación del exceso (409 PAGO_EXCEDE_UTILIDAD)", () => {
  it("recuadro ámbar con utilidad, pagado, este pago y el exceso", () => {
    const c = confirmacionExceso({ utilidad_usd: 40.46, pagado_usd: 0, monto_usd: 100, exceso_usd: 59.54 });
    const html = renderToStaticMarkup(<AvisoExcesoPago titulo={c.titulo} descripcion={c.descripcion} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Este pago supera la utilidad del socio en el mes");
    expect(html).toContain("Quedaría pagado de más por $59.54. ¿Registrar de todas formas?");
  });

  it("«Revisar el monto» / «Registrar de todas formas» (alta) y «Guardar de todas formas» (edición)", () => {
    const alta = renderToStaticMarkup(
      <BotonesExcesoPago tipo="alta" guardando={false} onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(alta).toContain(">Revisar el monto</button>");
    expect(alta).toContain(">Registrar de todas formas</button>");
    for (const b of alta.match(/<button[^>]*>/g) ?? []) expect(b, b).toContain("cursor-pointer");
    const edicion = renderToStaticMarkup(
      <BotonesExcesoPago tipo="edicion" guardando={false} onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(edicion).toContain(">Guardar de todas formas</button>");
    const guardando = renderToStaticMarkup(
      <BotonesExcesoPago tipo="alta" guardando onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(guardando).toContain(">Guardando…</button>");
    const botones = guardando.match(/<button[^>]*>/g) ?? [];
    expect(botones).toHaveLength(2);
    for (const b of botones) expect(b, b).toMatch(/\sdisabled=""/);
  });
});
