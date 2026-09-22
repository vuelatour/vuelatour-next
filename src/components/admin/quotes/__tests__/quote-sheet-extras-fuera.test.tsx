import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

// Mismos mocks que `quote-sheet.test.tsx`: la hoja monta `useLookupNm` y la
// ruta rápida, que importan server actions con el cliente de Supabase.
vi.mock("@/app/admin/distancias/actions", () => ({
  getDistanciasAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/airports/actions", () => ({
  createAirportAction: async () => ({ ok: false, error: "mock" }),
}));

import { QuoteSheet, type QuoteSheetProps } from "@/components/admin/quotes/quote-sheet";
import { ESCENARIOS } from "@/components/admin/quotes/__fixtures__/escenarios";
import type { ExtraConcepto, QuoteBreakdown } from "@/types/quote";

/**
 * RENGLÓN DE EXTRAS QUE NO ENTRA AL TOTAL (21-sep-2026). Reporte del cliente:
 * la hoja pintaba «[SIN IVA] Concepto $35.00» —«Concepto» era el PLACEHOLDER
 * del campo vacío— y el total seguía en $700.00; al guardar, el renglón se
 * descartaba en silencio. Ahora, SOLO EN EDICIÓN, la fila lleva la clase de
 * estado (importe atenuado y tachado por CSS) y bajo el concepto sale la
 * leyenda en ámbar.
 *
 * La fidelidad con el PDF la cuida `quote-sheet.test.tsx` contra los fixtures
 * de pyservices; aquí se cuida lo contrario: que esta croma NO exista en
 * LECTURA (donde la hoja ES el PDF) y que no aparezca sin motivo.
 */

const conExtras = (extras: ExtraConcepto[]): QuoteSheetProps => {
  const p = ESCENARIOS["hoja1"]() as QuoteSheetProps;
  return { ...p, valores: { ...p.valores, extras }, mapaSvg: null };
};

const EXTRA_OK: ExtraConcepto = { concepto: "Catering", monto_usd: 170, moneda: "USD", aplica_iva: true };
/** El del reporte: $35 capturados, sin nombre y sin IVA. */
const EXTRA_SIN_NOMBRE: ExtraConcepto = { concepto: "", monto_usd: 35, moneda: "USD", aplica_iva: false };

describe("hoja · renglón de extras fuera del total (solo edición)", () => {
  it("sin nombre: clase de estado en la fila + leyenda ámbar bajo el concepto", () => {
    const html = renderToString(<QuoteSheet {...conExtras([EXTRA_SIN_NOMBRE])} />);
    expect(html).toContain("cot-fila--fuera");
    expect(html).toContain("Falta el nombre: no se suma ni se imprime");
    // La leyenda es croma: subárbol `data-cot-ui` (el test de fidelidad la
    // descarta al comparar con el PDF) y un botón que lleva al campo.
    expect(html).toMatch(
      /<span class="cot-aviso" data-cot-ui=""><button[^>]*class="cot-aviso__liga"[^>]*>Falta el nombre: no se suma ni se imprime<\/button><\/span>/,
    );
    // El importe sigue capturado (no se borra nada): el CSS lo atenúa.
    expect(html).toContain('value="35.00"');
  });

  it("falta el monto y falta el T.C.: cada uno con su leyenda (la de MXN es la que ya usaba la hoja)", () => {
    const sinMonto = renderToString(
      <QuoteSheet {...conExtras([{ concepto: "Handler", monto_usd: 0, moneda: "USD", aplica_iva: true }])} />,
    );
    expect(sinMonto).toContain("Falta el monto: no se suma ni se imprime");

    const p = conExtras([{ concepto: "Van", monto_usd: 1500, moneda: "MXN", aplica_iva: true }]);
    const mxnSinTc = renderToString(<QuoteSheet {...p} valores={{ ...p.valores, tc_usd_mxn: null }} />);
    expect(mxnSinTc).toContain("Captura el T.C. en «Total MXN»: sin él el renglón no entra al total");
    expect(mxnSinTc).toContain("cot-fila--fuera");
  });

  it("renglón recién agregado (sin nombre y sin monto): NO molesta", () => {
    const html = renderToString(
      <QuoteSheet {...conExtras([{ concepto: "", monto_usd: 0, moneda: "USD", aplica_iva: true }])} />,
    );
    expect(html).not.toContain("cot-fila--fuera");
    expect(html).not.toContain("cot-aviso");
  });

  it("renglón completo: ni clase ni leyenda (la hoja se ve como siempre)", () => {
    const html = renderToString(<QuoteSheet {...conExtras([EXTRA_OK])} />);
    expect(html).not.toContain("cot-fila--fuera");
    expect(html).not.toContain("cot-aviso");
  });

  it("LECTURA: ni rastro de la croma, aunque el renglón esté a medias", () => {
    const html = renderToString(<QuoteSheet {...conExtras([EXTRA_OK, EXTRA_SIN_NOMBRE])} lectura />);
    expect(html).not.toContain("cot-fila--fuera");
    expect(html).not.toContain("cot-aviso");
    expect(html).not.toContain("no se suma ni se imprime");
    // La hoja bloqueada sigue sin ningún control (invariante del PDF).
    expect(html).not.toMatch(/<input|<textarea|<select|contenteditable/);
  });

  it("solo marca el renglón a medias: los demás quedan intactos", () => {
    const html = renderToString(<QuoteSheet {...conExtras([EXTRA_OK, EXTRA_SIN_NOMBRE, EXTRA_OK])} />);
    expect(html.match(/cot-fila--fuera/g)?.length).toBe(1);
    expect(html.match(/cot-aviso__liga/g)?.length).toBe(1);
  });
});

/**
 * EL NÚMERO QUE PREGUNTÓ EL CLIENTE. La hoja pinta el dinero del BREAKDOWN:
 * con el renglón fuera, el motor no lo recibió y el «Total (USD)» sigue en
 * $700.00 aunque la columna de importes enseñe 35.00 (por eso se tacha y se
 * avisa). En cuanto el renglón tiene nombre, el mismo motor devuelve 735.00 y
 * la leyenda desaparece: el total y la leyenda cuentan la MISMA historia.
 */
describe("hoja · el total es el del motor, y la leyenda explica la diferencia", () => {
  const breakdownCon = (totalUsd: number, extras: QuoteBreakdown["extras"]): QuoteBreakdown => {
    const base = ESCENARIOS["hoja1"]().breakdown as QuoteBreakdown;
    return {
      ...base,
      extras,
      iva: { ...base.iva, porcentaje: 0, base_usd: 0, monto_usd: 0 },
      totales: { ...base.totales, ajuste_final_usd: 0, iva_usd: 0, total_usd: totalUsd, total_mxn: null },
    } as QuoteBreakdown;
  };
  const hoja = (extras: ExtraConcepto[], breakdown: QuoteBreakdown) => {
    const p = conExtras(extras);
    return renderToString(<QuoteSheet {...p} breakdown={breakdown} />);
  };
  /** Total impreso de la fila `total-row` (el «Total (USD)» del PDF). */
  const totalImpreso = (html: string) =>
    html.match(/<tr class="total-row cot-fila"><td>Total \(USD\)<\/td><td class="val">([^<]*)<\/td>/)?.[1];

  it("sin nombre: total $700.00, importe tachado y leyenda", () => {
    const html = hoja([EXTRA_SIN_NOMBRE], breakdownCon(700, []));
    expect(totalImpreso(html)).toBe("$700.00");
    expect(html).toContain("cot-fila--fuera");
    expect(html).toContain("Falta el nombre: no se suma ni se imprime");
  });

  it("con nombre: total $735.00 y ni rastro de la leyenda", () => {
    const html = hoja(
      [{ ...EXTRA_SIN_NOMBRE, concepto: "Handler" }],
      breakdownCon(735, [
        { concepto: "Handler", monto_usd: 35, moneda: "USD", monto_nativo: 35, tc_aplicado: null, aplica_iva: false },
      ] as QuoteBreakdown["extras"]),
    );
    expect(totalImpreso(html)).toBe("$735.00");
    expect(html).not.toContain("cot-fila--fuera");
    expect(html).not.toContain("no se suma ni se imprime");
  });
});

/**
 * LO QUE LA LEYENDA PUEDE Y NO PUEDE HACER. Un clic que solo mueve el foco va
 * exento del guard de CONFIRMADO/RESERVA (el guard se dispara al teclear); uno
 * que ABRE el detalle «⋯» —que edita cantidad, precio, moneda e IVA, y cuyo
 * popover entero es `data-guard-exempt`— no puede ir exento, o la confirmación
 * única se saltaría. Y una línea de GRUPO se DICE pero no se toca: se corrige
 * en el grupo.
 */
describe("hoja · a dónde lleva (y a dónde NO) la leyenda", () => {
  const ligaDe = (html: string) => html.match(/<button[^>]*class="cot-aviso__liga"[^>]*>/)?.[0] ?? "";

  it("falta el nombre o el monto tecleado: el clic solo enfoca ⇒ exento del guard", () => {
    expect(ligaDe(renderToString(<QuoteSheet {...conExtras([EXTRA_SIN_NOMBRE])} />))).toContain("data-guard-exempt");
    const sinMonto = renderToString(
      <QuoteSheet {...conExtras([{ concepto: "Handler", monto_usd: 0, moneda: "USD", aplica_iva: true }])} />,
    );
    expect(ligaDe(sinMonto)).toContain("data-guard-exempt");
  });

  it("cantidad × precio sin precio: el clic ABRE el detalle que edita ⇒ NO exento", () => {
    const html = renderToString(
      <QuoteSheet
        {...conExtras([
          { concepto: "Camionetas", monto_usd: 0, moneda: "USD", aplica_iva: true, cantidad: 2, unitario: 0 },
        ])}
      />,
    );
    expect(html).toContain("Falta el monto: no se suma ni se imprime");
    expect(ligaDe(html)).not.toContain("data-guard-exempt");
  });

  it("línea de GRUPO: la leyenda es TEXTO (sin clic muerto) y manda al grupo", () => {
    const html = renderToString(
      <QuoteSheet
        {...conExtras([
          {
            concepto: "Tour",
            monto_usd: 0,
            moneda: "USD",
            aplica_iva: true,
            unitario: 0,
            por_persona: true,
            origen: "GRUPO",
            grupo_extra_id: "g1",
          },
        ])}
      />,
    );
    expect(html).toContain("cot-fila--fuera");
    expect(html).toContain("Falta el monto: no se suma ni se imprime");
    expect(html).toContain("se corrige en el grupo");
    // Ni botón (no hay campo editable aquí) ni atajo al detalle que el
    // candado «se edita desde el grupo» niega.
    expect(html).not.toContain("cot-aviso__liga");
  });

  it("línea de GRUPO en pesos sin T.C.: ESA sí se corrige aquí (el T.C. vive en la hoja)", () => {
    const p = conExtras([
      {
        concepto: "Tour",
        monto_usd: 1500,
        moneda: "MXN",
        aplica_iva: true,
        origen: "GRUPO",
        grupo_extra_id: "g1",
      },
    ]);
    const html = renderToString(<QuoteSheet {...p} valores={{ ...p.valores, tc_usd_mxn: null }} />);
    expect(html).toContain("Captura el T.C. en «Total MXN»");
    expect(html).toContain("cot-aviso__liga");
    expect(html).not.toContain("se corrige en el grupo");
  });
});

/**
 * CRUCE con «conceptos SIN IVA debajo del IVA» (22-sep-2026). Los renglones
 * exentos bajan bajo el rótulo «No causan IVA» — pero SOLO los que de verdad
 * suman. Un renglón marcado «sin IVA» que NO entra al total (le falta el
 * nombre, el monto o el T.C.) se queda donde está, atenuado y con su leyenda:
 * moverlo al bloque de exentos lo haría parecer parte del total, y además
 * desbalancearía la verificación que decide si la partición se activa.
 */
describe("hoja · un renglón sin IVA que NO cuenta no baja del IVA", () => {
  const escenario = () => ESCENARIOS["hoja-sin-iva"]() as QuoteSheetProps;
  /** Cuerpo de la tabla de totales (donde vive el orden del desglose). */
  const totales = (html: string) => html.slice(html.indexOf('<table class="totales">'));
  const antesDe = (html: string, a: string, b: string) => {
    const t = totales(html);
    return t.indexOf(a) > -1 && t.indexOf(a) < t.indexOf(b);
  };

  it("el escenario base SÍ parte: Transfers y los viáticos van debajo del IVA", () => {
    const html = renderToString(<QuoteSheet {...escenario()} lectura />);
    expect(html).toContain("Subtotal gravable");
    expect(html).toContain("No causan IVA");
    expect(antesDe(html, "Handler", "Subtotal gravable")).toBe(true);
    expect(antesDe(html, "IVA (16%)", "No causan IVA")).toBe(true);
    expect(antesDe(html, "No causan IVA", "Transfers")).toBe(true);
    expect(antesDe(html, "Viáticos por pernocta", "Total (USD)")).toBe(true);
  });

  it("un extra «sin IVA» a medias: sigue arriba del IVA, con su leyenda, y la partición NO se rompe", () => {
    const p = escenario();
    const html = renderToString(
      <QuoteSheet
        {...p}
        valores={{
          ...p.valores,
          extras: [
            ...(p.valores.extras ?? []),
            // Lo que reportó el cliente el 21-sep: $35 capturados, sin nombre.
            { concepto: "", monto_usd: 35, moneda: "USD", aplica_iva: false },
          ],
        }}
      />,
    );
    // El renglón roto no entra al total ⇒ aporta 0 y la partición sigue viva.
    expect(html).toContain("Subtotal gravable");
    expect(html).toContain("cot-fila--fuera");
    expect(html).toContain("Falta el nombre: no se suma ni se imprime");
    // …y se queda ARRIBA del IVA: no se cuela entre los conceptos exentos.
    expect(antesDe(html, "cot-fila--fuera", "Subtotal gravable")).toBe(true);
  });

  it("apagarle el IVA a TODO (efectivo): nada se mueve y vuelve «Subtotal (sin IVA)»", () => {
    const p = escenario();
    const b = p.breakdown!;
    const html = renderToString(
      <QuoteSheet
        {...p}
        lectura
        breakdown={
          {
            ...b,
            iva: { ...b.iva, aplica_por_metodo_pago: false, porcentaje: 0, base_usd: 4250, monto_usd: 0 },
            totales: { ...b.totales, iva_usd: 0, total_usd: 4250, total_mxn: null },
          } as QuoteBreakdown
        }
      />,
    );
    expect(html).toContain("Subtotal (sin IVA)");
    expect(html).not.toContain("No causan IVA");
    expect(antesDe(html, "Transfers", "Subtotal (sin IVA)")).toBe(true);
  });
});
