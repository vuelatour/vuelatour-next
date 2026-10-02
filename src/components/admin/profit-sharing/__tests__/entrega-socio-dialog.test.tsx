/**
 * Diálogos de la cuenta corriente de los socios (v2, 1-oct-2026, API 0.0.50),
 * renderizados de verdad con `react-dom/server`.
 *
 * Qué se congela:
 *  1. «Registrar entrega»: socio fijo, «Por entregar hoy: $X USD» a la vista,
 *     monto = lo POR ENTREGAR del API, USD, fecha = HOY Cancún calculado al
 *     abrir (no el del servidor), «Entregó» = yo, MÉTODO sin elegir y
 *     «Corresponde a» opcional (mes y avión) en «Sin mes» / «Sin avión»;
 *  2. un socio ADELANTADO no prellena monto y lo dice;
 *  3. la EDICIÓN arranca con lo que tiene la entrega (el «corresponde a»
 *     también se corrige: el API lo acepta en el PATCH);
 *  4. la confirmación del ADELANTO (409 PAGO_EXCEDE_SALDO) con el texto del
 *     contrato y sus botones;
 *  5. tras registrar: el paso «Entrega registrada» ofrece el comprobante;
 *  6. «Configurar cuenta»: banner del default, mes y saldo inicial;
 *  7. todo botón lleva `cursor-pointer`;
 *  8. (revisión adversaria 1-oct-2026) «Por entregar hoy» dice cuánto es del
 *     mes EN CURSO; desde el Reparto con un mes completo, «Corresponde al
 *     mes» llega prellenado; una fecha antes del arranque se avisa; y toda
 *     etiqueta con `for` nombra a un control que existe (los selectores con
 *     buscador incluidos).
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PagoSocio } from "@/types/reparto-pagos";
import type { ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing/socios",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
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

const { FormularioEntrega, AvisoAdelanto, BotonesAdelanto } = await import("../entrega-socio-dialog");
const { FormularioCuenta } = await import("../cuenta-socio-dialog");
const { confirmacionAdelanto, TEXTO_CUENTA_NO_CONFIGURADA } = await import("@/lib/admin/reparto-pagos");

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const ITZI = { id: "0f1c0000-0000-4000-8000-000000000010", nombre: "Itzi" };

const CONTEXTO: ContextoEntrega = {
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  porEntregarUsd: 1395.94,
  mesEnCursoUsd: 0,
  mesEnCurso: "2026-10",
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true }],
  cuentaDesdeMes: "2026-09",
  mesSugerido: null,
};
// El `hoy` del servidor (respaldo) es AYER: la pestaña quedó abierta.
const REGISTRO: ContextoRegistro = { usuarios: [ALE, ITZI], me: ALE, hoy: "2026-09-30", tcOficial: 18.45 };

const ENTREGA: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  socio_id: MAURICIO,
  aeronave_id: N4142R,
  periodo: "2026-09-01",
  mes: "2026-09",
  monto: 20000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 1081.08,
  utilidad_snapshot_usd: null,
  saldo_snapshot_usd: 1395.94,
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
  aeronave: { id: N4142R, matricula: "N4142R" },
};

// 1-oct-2026 10:00 en Cancún.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

/** Toda `<label for>` del marcado nombra a un elemento con ese `id`. */
const etiquetasHuerfanas = (html: string) =>
  [...html.matchAll(/<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)]
    .filter((m) => !html.includes(`id="${m[1]}"`))
    .map((m) => m[2].replace(/<[^>]+>/g, ""));

const radio = (html: string, texto: string) =>
  html.match(new RegExp(`<button[^>]*role="radio"[^>]*>${texto}</button>`))?.[0] ?? "";
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("«Registrar entrega»", () => {
  const html = renderToStaticMarkup(
    <FormularioEntrega dialogo={{ tipo: "alta", contexto: CONTEXTO }} onCerrar={() => {}} registro={REGISTRO} />,
  );

  it("socio fijo en el título y «Por entregar hoy» a la vista", () => {
    expect(html).toContain("Registrar entrega a Mauricio Roque");
    expect(html).toContain("Por entregar hoy: $1,395.94 USD");
  });

  it("monto = lo POR ENTREGAR del API, con la moneda en la etiqueta", () => {
    expect(html).toContain('value="1395.94"');
    expect(html).toContain("Monto entregado (USD)");
    expect(html).toContain("Prellenado con lo que hay por entregar: $1,395.94 USD.");
  });

  it("USD marcado y NINGÚN método elegido (nada de medio de pago por defecto)", () => {
    expect(radio(html, "USD")).toContain('aria-checked="true"');
    expect(radio(html, "MXN")).toContain('aria-checked="false"');
    for (const m of ["Transferencia", "Efectivo", "Cheque", "Otro"]) {
      expect(radio(html, m), m).toContain('aria-checked="false"');
    }
    expect(html).toContain("¿Cómo se entregó?");
    expect(html).not.toContain("Tipo de cambio USD/MXN");
  });

  it("fecha = HOY Cancún calculado al abrir (no el «hoy» viejo del servidor) y tope en hoy", () => {
    const fecha = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(fecha).toContain('value="2026-10-01"');
    expect(fecha).toContain('max="2026-10-01"');
  });

  it("«Entregó» = yo; «Corresponde a» opcional en «Sin mes (a cuenta)» y «Sin avión»", () => {
    expect(html).toContain(">Alejandro Canales</span>");
    expect(html).toContain("Corresponde al mes (opcional)");
    expect(html).toContain(">Sin mes (a cuenta)</span>");
    expect(html).not.toMatch(/adelanto a cuenta/i);
    expect(html).toContain("Corresponde al avión (opcional)");
    expect(html).toContain(">Sin avión</span>");
    expect(html).toContain("Solo informativo: la entrega descuenta del saldo total del socio.");
  });

  it("el comprobante se ofrece DESPUÉS de registrar; botón principal y manita en todo", () => {
    expect(html).not.toContain("Adjuntar comprobante");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Registrar entrega<\/button>/);
    expect(botones(html).length).toBeGreaterThan(5);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("toda etiqueta con `for` nombra a un control que existe (Entregó y «Corresponde a» incluidos)", () => {
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Entregó/);
    expect(etiquetasHuerfanas(html)).toEqual([]);
  });

  it("«Por entregar hoy» dice cuánto es del mes EN CURSO (todavía cambia); con 0 no dice nada", () => {
    expect(html).not.toContain("data-mes-en-curso");
    const h = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: { ...CONTEXTO, porEntregarUsd: 1602.04, mesEnCursoUsd: 206.1 } }}
        onCerrar={() => {}}
        registro={REGISTRO}
      />,
    );
    expect(h).toContain("Por entregar hoy: $1,602.04 USD");
    expect(h).toMatch(/data-mes-en-curso[^>]*>incluye \$206\.10 de Octubre 2026 \(en curso: cambia día con día\)</);
    expect(h).toContain('value="1602.04"');
  });

  it("abierto desde el Reparto con «Mes pasado»: «Corresponde al mes» = Septiembre 2026", () => {
    const h = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: { ...CONTEXTO, mesSugerido: "2026-09" } }}
        onCerrar={() => {}}
        registro={REGISTRO}
      />,
    );
    expect(h).toContain(">Septiembre 2026</span>");
    expect(h).not.toContain(">Sin mes (a cuenta)</span>");
  });

  it("una fecha ANTES del arranque de la cuenta se avisa bajo el campo (sin bloquear)", () => {
    expect(html).not.toContain("data-aviso-fecha-arranque");
    const h = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "edicion", contexto: CONTEXTO, pago: { ...ENTREGA, fecha_pago: "2025-09-28" } }}
        onCerrar={() => {}}
        registro={REGISTRO}
      />,
    );
    expect(h).toMatch(
      /data-aviso-fecha-arranque[^>]*>Esta fecha es anterior al arranque de la cuenta \(Septiembre 2026\): sí descontará del saldo/,
    );
  });

  it("socio ADELANTADO: sin monto prellenado y se dice el saldo a favor de VuelaTour", () => {
    const h = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: { ...CONTEXTO, porEntregarUsd: -2387.84 } }}
        onCerrar={() => {}}
        registro={REGISTRO}
      />,
    );
    expect(h).toContain("Adelantado: $2,387.84 USD a favor de VuelaTour (no hay nada por entregar).");
    expect(h).not.toContain("Prellenado con lo que hay por entregar");
    const monto = h.match(/<input[^>]*type="number"[^>]*>/)?.[0] ?? "";
    expect(monto).toContain('value=""');
  });
});

describe("«Editar entrega»", () => {
  const html = renderToStaticMarkup(
    <FormularioEntrega
      dialogo={{ tipo: "edicion", contexto: CONTEXTO, pago: ENTREGA }}
      onCerrar={() => {}}
      registro={REGISTRO}
    />,
  );

  it("arranca con lo que tiene la entrega (pesos, T.C., método, quién entregó, fecha, folio, ref.)", () => {
    expect(html).toContain("Editar entrega a Mauricio Roque");
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

  it("el «corresponde a» arranca con el de la entrega y se puede corregir; sin ayudas del alta", () => {
    expect(html).toContain("Corresponde al mes (opcional)");
    expect(html).toContain(">Septiembre 2026</span>");
    expect(html).toContain(">N4142R</span>");
    expect(html).not.toContain("Prellenado con lo que hay por entregar");
    expect(html).not.toContain("Por entregar hoy");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Guardar cambios<\/button>/);
  });
});

describe("confirmación del ADELANTO (409 PAGO_EXCEDE_SALDO)", () => {
  it("recuadro con el texto del contrato (70,000 MXN a 18.5 = $3,783.78 USD)", () => {
    const c = confirmacionAdelanto({ por_entregar_usd: 1395.94, monto_usd: 3783.78, exceso_usd: 2387.84 });
    const html = renderToStaticMarkup(<AvisoAdelanto titulo={c.titulo} descripcion={c.descripcion} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Esta entrega es un ADELANTO");
    expect(html).toContain(
      "Esta entrega de $3,783.78 USD supera lo que hay por entregar ($1,395.94 USD). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour por $2,387.84 USD. ¿Registrar?",
    );
  });

  it("«Revisar el monto» / «Registrar como adelanto» (alta) y «Guardar como adelanto» (edición)", () => {
    const alta = renderToStaticMarkup(
      <BotonesAdelanto tipo="alta" guardando={false} onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(alta).toContain(">Revisar el monto</button>");
    expect(alta).toContain(">Registrar como adelanto</button>");
    for (const b of botones(alta)) expect(b, b).toContain("cursor-pointer");
    const edicion = renderToStaticMarkup(
      <BotonesAdelanto tipo="edicion" guardando={false} onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(edicion).toContain(">Guardar como adelanto</button>");
    const guardando = renderToStaticMarkup(
      <BotonesAdelanto tipo="alta" guardando onRevisar={() => {}} onConfirmar={() => {}} />,
    );
    expect(guardando).toContain(">Guardando…</button>");
    for (const b of botones(guardando)) expect(b, b).toMatch(/\sdisabled=""/);
  });
});

describe("paso 2: «Entrega registrada» ofrece el comprobante", () => {
  const html = renderToStaticMarkup(
    <FormularioEntrega
      dialogo={{ tipo: "alta", contexto: CONTEXTO }}
      onCerrar={() => {}}
      registro={REGISTRO}
      registradaInicial={{
        pago: { ...ENTREGA, monto: 70000, monto_usd: 3783.78, fecha_pago: "2026-10-01", metodo: "EFECTIVO" },
        cuenta: {
          socio: { id: MAURICIO, nombre: "Mauricio Roque" },
          cuenta: { cuenta_desde: "2026-09", saldo_inicial_usd: 0, notas: null, configurada: false },
          generado_usd: 1395.94,
          mes_en_curso_usd: 0,
          entregado_usd: 3783.78,
          por_entregar_usd: -2387.84,
          estado: "ADELANTADO",
          ultimo_pago: null,
          aviones: [],
        },
      }}
    />,
  );

  it("resumen de la entrega, el saldo que quedó y «Adjuntar comprobante» / «Listo»", () => {
    expect(html).toContain("Entrega registrada");
    expect(html).toContain("$70,000 MXN · T.C. 18.5 · ≈ $3,783.78 USD a Mauricio Roque");
    expect(html).toContain("Adelantado: $2,387.84 USD a favor de VuelaTour");
    expect(html).toContain("¿Tienes el comprobante?");
    expect(html).toMatch(/data-accion="adjuntar-comprobante-entrega"[^>]*>.*Adjuntar comprobante<\/button>/);
    expect(html).toContain(">Listo, sin comprobante por ahora</button>");
    expect(html).toContain('accept="image/*,application/pdf,.heic,.heif"');
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });
});

describe("«Configurar cuenta»", () => {
  it("sin configurar: el banner del default, septiembre 2026 y saldo 0", () => {
    const html = renderToStaticMarkup(
      <FormularioCuenta
        socio={{ id: MAURICIO, nombre: "Mauricio Roque" }}
        cuenta={{ cuenta_desde: "2026-09", saldo_inicial_usd: 0, notas: null, configurada: false }}
        hoy="2026-10-01"
        onCerrar={() => {}}
      />,
    );
    expect(html).toContain("Configurar cuenta de Mauricio Roque");
    expect(html).toContain(TEXTO_CUENTA_NO_CONFIGURADA);
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Mes de arranque/);
    expect(etiquetasHuerfanas(html)).toEqual([]);
    expect(html).toContain(">Septiembre 2026</span>");
    expect(html).toContain("Saldo inicial (USD)");
    expect(html).toContain('value="0"');
    expect(html).toContain("Negativo: lo que ya se le había adelantado de más.");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Guardar cuenta<\/button>/);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("configurada: arranca con lo que tiene (mes, saldo negativo, notas)", () => {
    const html = renderToStaticMarkup(
      <FormularioCuenta
        socio={{ id: MAURICIO, nombre: "Mauricio Roque" }}
        cuenta={{ cuenta_desde: "2026-06", saldo_inicial_usd: -1500.5, notas: "Repartos de junio", configurada: true }}
        hoy="2026-10-01"
        onCerrar={() => {}}
      />,
    );
    expect(html).not.toContain(TEXTO_CUENTA_NO_CONFIGURADA);
    expect(html).toContain(">Junio 2026</span>");
    expect(html).toContain('value="-1500.5"');
    expect(html).toContain("Repartos de junio");
  });
});
