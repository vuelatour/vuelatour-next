/**
 * La hoja «Conciliación con el banco» (13-oct-2026, conciliación al revés,
 * API 0.0.75): el cuerpo PRESENTACIONAL (`GastoBancoDetalle`) con los datos
 * REALES del contrato, render del servidor. Ningún monto se calcula en el
 * componente y jamás se pinta número de cuenta ni CLABE.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_BUSCAR_FALTANTE,
  CAUSAS_SIN_CONCILIAR,
  INTRO_SIN_CONCILIAR,
  MSG_DETALLE_BANCO_API_VIEJO,
  NOTA_CRUZAR_PENDIENTES,
  TEXTO_CARGANDO_BANCO,
  TEXTO_ESTADO_CAMBIO,
  TEXTO_LIGA_ANTERIOR,
} from "@/lib/admin/gasto-banco";
import {
  cargoSaesa,
  respuesta321,
  respuesta345,
  respuestaSinConciliar,
} from "@/lib/admin/__tests__/gasto-banco.fixtures";
import type { ConciliacionDeGasto } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/expenses",
}));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }) }));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeGastoAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { GastoBancoDetalle } = await import("../gasto-banco-detalle");

const noop = () => {};
const pintar = (r: ConciliacionDeGasto | null, fila: Partial<Parameters<typeof GastoBancoDetalle>[0]["fila"]> = {}, extra = {}) =>
  renderToStaticMarkup(
    <GastoBancoDetalle
      fila={{
        id: r?.gasto.id ?? "g",
        monto: r?.gasto.monto ?? 1,
        moneda: r?.gasto.moneda ?? "MXN",
        conciliado: r?.gasto.conciliado ?? false,
        medio_pago: r?.gasto.medio_pago ?? "TRANSFERENCIA",
        fecha_gasto: r?.gasto.fecha_gasto ?? "2026-09-01",
        ...fila,
      }}
      resultado={r ? { ok: true, data: r } : null}
      descargando={null}
      onReintentar={noop}
      onRecargar={noop}
      onDescargar={noop}
      {...extra}
    />,
  );

/** Todos los <a> de la hoja: pestaña nueva, rel y cursor de mano. */
function ligasCorrectas(html: string) {
  const anclas = html.match(/<a [^>]*>/g) ?? [];
  expect(anclas.length).toBeGreaterThan(0);
  for (const a of anclas) {
    expect(a, a).toContain('target="_blank"');
    expect(a, a).toContain('rel="noopener noreferrer"');
    expect(a, a).toContain("cursor-pointer");
  }
}

describe("la hoja con datos (casos reales)", () => {
  it("1↔1 (#321): un cargo, su cuenta, su archivo con descarga y «Ver en Conciliación»", () => {
    const html = pintar(respuesta321());
    expect(html).toContain("Conciliado con 1 cargo del banco.");
    expect(html).toContain("GASTOS GNRAL · Scotiabank (MXN)");
    expect(html).toContain("Leyenda del banco: «SEL TRANSF. INTERBANCARIA SPEI» · Ref. 00000000000000000001");
    expect(html).toContain("scotia gastos (6).pdf");
    expect(html).toContain("Descargar estado de cuenta (PDF)");
    expect(html).toContain("Registró la liga: Jimmy Chi");
    expect(html).toContain("Ver en Conciliación");
    expect(html).toContain("&amp;mov=5e879489-a73c-469b-9d1f-0a27456f59be&amp;gasto=cc7d64b0-cb0a-44cc-9782-20af116c7bcf");
    ligasCorrectas(html);
  });

  it("SAESA (#345): 4 líneas, «(este gasto)» SIN enlace y sin diferencia", () => {
    const html = pintar(respuesta345());
    expect(html).toContain("Conciliado: lo paga un cargo del banco junto con 3 gastos más.");
    expect(html).toContain("4 gastos · suman $11,205.60");
    expect(html).toContain("<strong>(este gasto)</strong>");
    expect(html).not.toContain('href="/admin/flights/7d50c91c-eca6-4184-a13e-166f9fd97425"');
    expect(html).toContain('href="/admin/flights/a3320000-0000-4000-8000-000000000332"');
    expect(html).not.toContain("Diferencia con el cargo");
    expect(html).toContain("max-h-60 space-y-1 overflow-y-auto");
  });

  it("EJE SCOTIA: «Diferencia con el cargo: $0.02»", () => {
    const r = respuesta345({ cargos: [cargoSaesa({ monto: 6694.13, lote: { ...cargoSaesa().lote!, gastos_n: 3, gastos_suma: 6694.11, gastos_diferencia: 0.02 } })] });
    expect(pintar(r)).toContain("Diferencia con el cargo: $0.02");
  });

  it("#269: dos tarjetas con lo que aporta cada una", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, monto: 136.99 },
      vista: { n_partes: 2, cruzado: false, suma: 136.99, monto_vinculado: 136.99, faltante: 0, cubierto: true },
      cargos: [
        cargoSaesa({ movimiento_id: "5f7ce959-0000-4000-8000-000000000001", monto: 15.08, lote: null, parte: { monto_parte: 15.08, moneda: "MXN", cruzada: false, registro: null } }),
        cargoSaesa({ movimiento_id: "d7259736-0000-4000-8000-000000000002", monto: 121.91, lote: null, parte: { monto_parte: 121.91, moneda: "MXN", cruzada: false, registro: null } }),
      ],
    });
    const html = pintar(r);
    expect(html.split("<section").length - 1).toBe(2);
    expect(html).toContain("Conciliado con 2 cargos del banco: suman $136.99 de $136.99.");
    expect(html).toContain("Este cargo aporta $15.08 de $136.99.");
    expect(html).toContain(TEXTO_LIGA_ANTERIOR);
  });

  it("cruzado (913a7d19): el T.C. GUARDADO", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, moneda: "USD", monto: 722.9, tc_gasto: 17.2244 },
      vista: { n_partes: 1, cruzado: true, suma: 0, monto_vinculado: 722.9, faltante: 0, cubierto: true },
      cargos: [cargoSaesa({ monto: 12451.49, lote: null, parte: { monto_parte: 12451.49, moneda: "MXN", cruzada: true, registro: null } })],
    });
    const html = pintar(r);
    expect(html).toContain("Conciliado: compra en USD pagada con un cargo en MXN.");
    expect(html).toContain("T.C. 17.2244 (el guardado en el gasto)");
    expect(html).not.toContain("suman $0.00");
  });

  it("efectivo con justificación (la razón entre «») y pasarela", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, medio_pago: "EFECTIVO" },
      cargos: [
        cargoSaesa({
          lote: null,
          cuenta: { id: "pw", alias: "Paywise", banco: "Paywise", moneda: "MXN", tipo: "PASARELA" },
          justificacion: { linea: "…", medio: "EFECTIVO", razon: "Mari lo facturó para no perder la deducción", firmante: "Mary Cruz", fecha: "06-oct-2026" },
        }),
      ],
    });
    const html = pintar(r);
    expect(html).toContain("«Mari lo facturó para no perder la deducción» — Mary Cruz, 06-oct-2026.");
    expect(html).toContain("pasarela de pago");
  });

  it("sin archivo: el motivo real y NINGÚN botón de descarga", () => {
    const r = respuesta345({
      cargos: [cargoSaesa({ lote: null, estado_cuenta: null, sin_archivo: "IMPORTADO_SIN_ARCHIVO", creado_at: "2026-07-17T00:34:09.441194+00:00", creado_por: "Jimmy Chi" })],
    });
    const html = pintar(r);
    expect(html).toContain("Sin archivo guardado: este cargo se importó el");
    expect(html).toContain("por Jimmy Chi sin el archivo original del banco.");
    expect(html).not.toContain("Descargar estado de cuenta");
  });

  it("«Abriendo…» mientras se genera el enlace de ESE estado de cuenta", () => {
    const html = pintar(respuesta321(), {}, { descargando: "e5000000-0000-4000-8000-000000000006" });
    expect(html).toContain("Abriendo…");
  });
});

describe("¿Qué hacer?, alertas, errores y carga", () => {
  it("SIN_CONCILIAR: intro, 5 causas, cobertura y los dos enlaces", () => {
    const html = pintar(respuestaSinConciliar(), { medio_pago: "TARJETA_CORP", monto: 8939.38 });
    expect(html).toContain("Sin conciliar: ningún cargo del banco está ligado a este pago (Tarjeta corporativa).");
    expect(html).toContain(INTRO_SIN_CONCILIAR);
    for (const c of CAUSAS_SIN_CONCILIAR) expect(html).toContain(c);
    expect(html).toContain("Último movimiento importado por cuenta:");
    expect(html).toContain('href="/admin/conciliacion?f=pendientes&amp;desde=2026-08-02&amp;hasta=2026-10-01&amp;mvq=8939.38"');
    expect(html).toContain('href="/admin/conciliacion?f=conciliados&amp;desde=2026-08-25&amp;hasta=2026-09-08&amp;mvq=8939.38"');
    expect(html).toContain(NOTA_CRUZAR_PENDIENTES);
    ligasCorrectas(html);
  });

  it("PARCIAL: «faltan», «Buscar el cargo que falta» y la nota de «Cruzar pendientes»", () => {
    const r: ConciliacionDeGasto = {
      ...respuesta321(),
      estado: "PARCIAL",
      gasto: { ...respuesta321().gasto, monto: 1800, conciliado: false },
      vista: { n_partes: 1, cruzado: false, suma: 1200, monto_vinculado: 1200, faltante: 600, cubierto: false },
    };
    const html = pintar(r, { monto: 1800, monto_vinculado: 1200, faltante: 600 });
    expect(html).toContain("faltan $600.00 de $1,800.00");
    expect(html).toContain(BOTON_BUSCAR_FALTANTE);
    expect(html).toContain(NOTA_CRUZAR_PENDIENTES);
  });

  it("alerta CONCILIADO_SIN_CARGOS", () => {
    const html = pintar(respuesta345({ cargos: [], alertas: ["CONCILIADO_SIN_CARGOS"] }));
    expect(html).toContain("Marcado como conciliado, pero no tiene ningún cargo del banco ligado.");
    expect(html).toContain("se marcó a mano o con datos viejos");
  });

  it("API previo (RUTA_NO_DISPONIBLE): el aviso y el enlace para buscar el cargo", () => {
    const html = renderToStaticMarkup(
      <GastoBancoDetalle
        fila={{ id: "46fa1d14-a23e-44f7-9a47-5d11b3f6631b", monto: "8939.38", moneda: "MXN", fecha_gasto: "2026-09-01", medio_pago: "TARJETA_CORP", conciliado: false }}
        resultado={{ ok: false, code: "RUTA_NO_DISPONIBLE", status: 404, error: MSG_DETALLE_BANCO_API_VIEJO }}
        descargando={null}
        onReintentar={noop}
        onRecargar={noop}
        onDescargar={noop}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(MSG_DETALLE_BANCO_API_VIEJO);
    expect(html).toContain("Buscar el cargo en Conciliación");
    expect(html).toContain('href="/admin/conciliacion?f=pendientes&amp;desde=2026-08-02&amp;hasta=2026-10-01&amp;mvq=8939.38"');
    expect(html).not.toContain("Reintentar");
    const caido = renderToStaticMarkup(
      <GastoBancoDetalle
        fila={{ id: "x", monto: 1 }}
        resultado={{ ok: false, status: 502, error: "Bad Gateway" }}
        descargando={null}
        onReintentar={noop}
        onRecargar={noop}
        onDescargar={noop}
      />,
    );
    expect(caido).toContain("Reintentar");
    expect(caido).not.toContain("Bad Gateway");
  });

  it("cargando: role=status", () => {
    const html = pintar(null);
    expect(html).toContain('role="status"');
    expect(html).toContain(TEXTO_CARGANDO_BANCO);
  });

  it("el estado cambió desde que se abrió la página: franja con «Recargar»", () => {
    const html = pintar(respuesta345(), { conciliado: false, monto_vinculado: 0, faltante: 2801.4 });
    expect(html).toContain(TEXTO_ESTADO_CAMBIO);
    expect(html).toContain(">Recargar<");
    expect(pintar(respuesta345(), { conciliado: true, monto_vinculado: 2801.4, faltante: 0 })).not.toContain(TEXTO_ESTADO_CAMBIO);
  });

  it("jamás número de cuenta ni CLABE; el componente no suma montos", () => {
    const html = pintar(respuesta345());
    expect(html.toLowerCase()).not.toContain("numero_cuenta");
    expect(html.toLowerCase()).not.toContain("clabe");
    const fuente = readFileSync(path.resolve(__dirname, "../gasto-banco-detalle.tsx"), "utf8");
    expect(fuente).not.toContain(".reduce(");
    expect(fuente).not.toContain("+ Number(");
  });
});
