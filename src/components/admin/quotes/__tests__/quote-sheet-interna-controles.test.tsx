import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Mismos mocks que el test de fixtures: el autollenado de millas y el alta
// rápida de aeropuertos llaman a server actions que importan Supabase.
vi.mock("@/app/admin/distancias/actions", () => ({
  getDistanciasAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/airports/actions", () => ({
  createAirportAction: async () => ({ ok: false, error: "mock" }),
}));

import {
  QuoteSheetInterna,
  type QuoteSheetInternaProps,
} from "@/components/admin/quotes/quote-sheet-interna";
import { ESCENARIOS_INTERNA } from "@/components/admin/quotes/__fixtures__/escenarios-interna";

/**
 * LOS CONTROLES QUE BAJARON DEL PANEL AL PAPEL (Fase 2.3, 22-sep-2026).
 * BLOQUE A: método de cobro previsto con su «¿cuál?» y su % de terminal,
 * redondeo, switch de TUAS, marcas («Cotización abierta», «Pase de abordar») y
 * notas internas. BLOQUE B: tarifa (segmento + $/hr manual), sobrevuelo,
 * cobrable pactado y comisión del vendedor.
 *
 * Lo que este test custodia —y que los fixtures NO pueden ver, porque comparan
 * TEXTO impreso— es:
 *  1. que cada control siga existiendo con SU id ancla (`metodo-pago-field`,
 *     `billpocket-field`, `redondeo-field`), que es como lo encuentran los
 *     atajos del cotizador (`document.getElementById`);
 *  2. que en LECTURA no se monte ninguno (la hoja bloqueada ES el PDF interno);
 *  3. que lo que el papel NO imprime («Pase de abordar», el switch de TUAS, el
 *     control del redondeo) viaje como CROMA `data-cot-ui`, porque si no la
 *     comparación con pyservices dejaría de cuadrar en la siguiente
 *     regeneración de fixtures.
 */

const base = (): QuoteSheetInternaProps => ESCENARIOS_INTERNA["interna-329"]();
const con = (v: Partial<QuoteSheetInternaProps["valores"]>): QuoteSheetInternaProps => {
  const p = base();
  return { ...p, valores: { ...p.valores, ...v } };
};
/** #070: el documento COMPLETO (tarifa manual + comisión del vendedor). */
const base070 = (): QuoteSheetInternaProps => ESCENARIOS_INTERNA["interna-070"]();

describe("cabecera de COBROS: el método previsto se edita en su frase", () => {
  it("el selector lleva el ancla `metodo-pago-field` y dice el método del formulario", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain('id="metodo-pago-field"');
    expect(html).toContain("previsto: ");
    expect(html).toContain("Transferencia");
  });

  it("OTRO abre el «¿cuál?» y el papel imprime el nombre manual", () => {
    const html = renderToString(
      <QuoteSheetInterna {...con({ metodo_pago: "OTRO", metodo_pago_detalle: "PayPal" })} />,
    );
    expect(html).toContain("¿cuál método?");
    expect(html).toContain("Otro (PayPal)");
  });

  it("el % de terminal solo se CAPTURA con BillPocket (`billpocket-field`)", () => {
    const sinBillpocket = renderToString(<QuoteSheetInterna {...base()} />);
    expect(sinBillpocket).not.toContain('id="billpocket-field"');
    const conBillpocket = renderToString(
      <QuoteSheetInterna {...con({ metodo_pago: "BILLPOCKET", comision_billpocket_pct: 9 })} />,
    );
    expect(conBillpocket).toContain('id="billpocket-field"');
    expect(conBillpocket).toContain("comisión terminal");
  });

  it("BillPocket sin % capturado deja el hueco, y ese hueco NO se imprime", () => {
    const html = renderToString(
      <QuoteSheetInterna {...con({ metodo_pago: "BILLPOCKET", comision_billpocket_pct: null })} />,
    );
    expect(html).toContain('id="billpocket-field"');
    // El texto «comisión terminal» sin porcentaje va dentro de croma: el papel
    // no lo lleva (lo custodia el fixture, que compara el texto impreso).
    expect(html).toMatch(/data-cot-ui=""[^>]*>\s*· comisión terminal/);
  });

  it("LECTURA: la frase es texto, sin un solo control", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} lectura />);
    expect(html).toContain("previsto: Transferencia");
    expect(html).not.toContain("metodo-pago-field");
  });
});

describe("desglose: redondeo y TUAS se deciden en su renglón", () => {
  it("sin ajuste, el renglón «Redondeo» existe FANTASMA y no se imprime", () => {
    // #329 no tiene ajuste: en edición el renglón está para alojar el control.
    const html = renderToString(<QuoteSheetInterna {...con({ redondeo_auto: false })} />);
    expect(html).toContain('id="redondeo-field"');
    expect(html).toMatch(/cot-fila--fantasma[^>]*data-cot-ui/);
    // En LECTURA ese renglón no existe (el papel no lo imprime).
    expect(renderToString(<QuoteSheetInterna {...base()} lectura />)).not.toContain("Redondeo");
  });

  it("con el automático encendido no hay monto manual que capturar", () => {
    const html = renderToString(<QuoteSheetInterna {...con({ redondeo_auto: true })} />);
    expect(html).not.toContain('id="redondeo-field"');
    expect(html).toContain('aria-label="Redondeo automático"');
  });

  it("el switch «Se cobran TUAS» va UNA vez, en el margen del bloque TUAS", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    const veces = html.split('aria-label="Se cobran las TUAS"').length - 1;
    expect(veces).toBe(1);
    expect(html).toContain('aria-checked="true"');
    // Apagado, el margen lo DICE (es el texto que ya tenía la hoja).
    expect(renderToString(<QuoteSheetInterna {...con({ cobrar_tuas: false })} />)).toContain(
      "no se cobran",
    );
  });

  it("LECTURA: ni el switch de TUAS ni el control del redondeo se montan", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} lectura />);
    expect(html).not.toContain("Se cobran las TUAS");
    expect(html).not.toContain("redondeo-field");
  });
});

describe("ficha: marcas y notas internas", () => {
  it("sin marcas encendidas la fila entera es croma (el papel no la lleva)", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain('<tr data-cot-ui=""><td class="k">Marcas</td>');
    expect(html).toContain('aria-label="Cotización abierta"');
    expect(html).toContain('aria-label="Pase de abordar"');
  });

  it("«Cotización abierta» enciende el TAG que sí imprime el papel", () => {
    const html = renderToString(<QuoteSheetInterna {...con({ cotizacion_abierta: true })} />);
    expect(html).toContain('<span class="tag">Cotización abierta</span>');
    // Y entonces la fila deja de ser croma: el papel la imprime.
    expect(html).not.toContain('<tr data-cot-ui=""><td class="k">Marcas</td>');
  });

  it("«Pase de abordar» NUNCA imprime tag (pyservices no lo lleva)", () => {
    const html = renderToString(<QuoteSheetInterna {...con({ pase_abordar: true })} />);
    expect(html).not.toContain('<span class="tag">Pase de abordar</span>');
  });

  it("ALTA: las notas internas se capturan en el papel", () => {
    const html = renderToString(
      <QuoteSheetInterna {...base()} interno={null} notasInternasEditables />,
    );
    expect(html).toContain("Notas internas");
    expect(html).toContain('aria-label="Notas internas"');
  });

  it("REVISIÓN: se leen y se dice dónde se editan (revise no las manda)", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain("El cliente pidió factura a nombre de la razón social.");
    expect(html).not.toContain('aria-label="Notas internas"');
    expect(html).toContain("se editan en el detalle del vuelo");
  });
});

// ===================== BLOQUE B =====================

describe("ficha: la TARIFA se decide en su renglón", () => {
  it("el segmento lleva `tarifa-tipo-field` y el papel sigue imprimiendo la tarifa del motor", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain('id="tarifa-tipo-field"');
    expect(html).toContain("Tarifa pública");
    expect(html).toContain("$1,650.00/hr");
    // Sin tarifa manual no hay campo $/hr que capturar.
    expect(html).not.toContain('id="tarifa-override-field"');
  });

  it("«Personalizada» abre el $/hr con su ancla (`tarifa-override-field`)", () => {
    const html = renderToString(
      <QuoteSheetInterna
        {...con({ tarifa_personalizada: true, tarifa_hora_override_usd: 989.583333 })}
      />,
    );
    expect(html).toContain('id="tarifa-override-field"');
    // La tarifa con decimales finos se enseña COMPLETA (es la que multiplica).
    expect(html).toContain("989.583333");
  });

  it("#070 (tarifa manual persistida) arranca en «Personalizada»", () => {
    const html = renderToString(<QuoteSheetInterna {...base070()} />);
    expect(html).toContain('id="tarifa-override-field"');
    expect(html).toContain("tarifa manual");
    expect(html).toMatch(/Personalizada<\/button>/);
  });

  it("LECTURA: la fila «Tarifa» es texto, sin un solo control", () => {
    const html = renderToString(<QuoteSheetInterna {...base070()} lectura />);
    expect(html).toContain("Tarifa broker");
    expect(html).not.toContain("tarifa-tipo-field");
    expect(html).not.toContain("tarifa-override-field");
  });
});

describe("horas cotizadas: sobrevuelo y cobrable pactado", () => {
  it("sin sobrevuelo el renglón existe FANTASMA (croma) para poder capturarlo", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain('id="sobrevuelo-field"');
    expect(html).toMatch(/<tr data-cot-ui=""><td class="k">Sobrevuelo<\/td>/);
    // En LECTURA ese renglón no existe (el papel no lo imprime).
    expect(renderToString(<QuoteSheetInterna {...base()} lectura />)).not.toContain("Sobrevuelo");
  });

  it("el cobrable se pacta en su renglón (`cobrable-field`, acepta h:mm)", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain('id="cobrable-field"');
    expect(html).toContain("Cobrable pactado (hr; acepta 2:20)");
    // El número IMPRESO lo sigue diciendo el motor.
    expect(html).toContain("<b>1.75 h</b>");
  });

  it("avisa cuando el cobrable pactado es MENOR al tiempo real", () => {
    const p = base();
    const b = p.breakdown!;
    const html = renderToString(
      <QuoteSheetInterna
        {...p}
        breakdown={{
          ...b,
          tiempos: {
            ...b.tiempos,
            cobrable_hr: 1,
            cobrable_proviene_de_override: true,
            vuelo_hr: 1.05,
            calzos_hr: 0.45,
          },
        }}
      />,
    );
    expect(html).toContain("el cobrable pactado es MENOR al tiempo real");
  });

  it("LECTURA: ni el sobrevuelo ni el cobrable montan control", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} lectura />);
    expect(html).not.toContain("sobrevuelo-field");
    expect(html).not.toContain("cobrable-field");
  });
});

describe("comisión del vendedor: se captura bajo «Vendedor»", () => {
  it("la fila es CROMA (el papel no imprime la captura) y resume lo pactado", () => {
    const html = renderToString(<QuoteSheetInterna {...base070()} />);
    expect(html).toMatch(/<tr data-cot-ui=""><td class="k">Comisión<\/td>/);
    expect(html).toContain("$50.00/hr × horas cobradas · Saab");
    expect(html).toContain('aria-label="Comisión del vendedor por hora (USD)"');
    // El renglón IMPRESO del desglose lo sigue escribiendo el motor.
    expect(html).toContain("Comisión del vendedor (Saab) · $50.00/hr × 2 hr");
  });

  it("sin comisión capturada el plegable lo dice y arranca cerrado", () => {
    const html = renderToString(<QuoteSheetInterna {...base()} />);
    expect(html).toContain("sin comisión");
    expect(html).not.toMatch(/<details class="cot-plegable" open/);
  });

  it("«Neto VuelaTour · Pago al vendedor» va bajo el desglose, como croma", () => {
    const p = base070();
    const b = p.breakdown!;
    const html = renderToString(
      <QuoteSheetInterna
        {...p}
        breakdown={{ ...b, meta: { ...b.meta, neto_vuelatour_usd: 3695.19 } }}
      />,
    );
    expect(html).toContain("Neto VuelaTour $3,695.19 · Pago al vendedor c/IVA $116.00");
    expect(html).toMatch(
      /<tr class="cot-fila" data-cot-ui=""><td colSpan="2" class="muted">Neto/i,
    );
  });

  it("LECTURA: la captura no se monta (el neto sí se sigue leyendo)", () => {
    const html = renderToString(<QuoteSheetInterna {...base070()} lectura />);
    expect(html).not.toContain('aria-label="Comisión del vendedor por hora (USD)"');
    expect(html).toContain("Pago al vendedor c/IVA $116.00");
  });
});

/**
 * El guard de CONFIRMADO/RESERVA con tripulación captura el PRIMER clic del
 * papel y pide confirmación una sola vez. `data-guard-exempt` es SOLO para lo
 * que no edita (abrir un plegable, mover el foco): un control migrado del
 * panel tiene que seguir disparando esa confirmación o se editaría una
 * cotización confirmada sin avisar.
 */
describe("guard de CONFIRMADO/RESERVA: lo que EDITA no va exento", () => {
  it("ningún control del BLOQUE B lleva `data-guard-exempt`", () => {
    const html = renderToString(
      <QuoteSheetInterna
        {...con({ tarifa_personalizada: true, tarifa_hora_override_usd: 1500 })}
      />,
    );
    // Cada control se aísla con su etiqueta accesible y se mira su etiqueta.
    for (const label of [
      "Tipo de tarifa",
      "Tarifa por hora — SOLO esta cotización (USD)",
      "Sobrevuelo (hr)",
      "Cobrable pactado (hr; acepta 2:20)",
      "Modalidad de la comisión del vendedor",
      "Quién vendió (comisión del vendedor)",
    ]) {
      const i = html.indexOf(`aria-label="${label}"`);
      expect(i, label).toBeGreaterThan(0);
      const etiqueta = html.slice(html.lastIndexOf("<", i), html.indexOf(">", i));
      expect(etiqueta, label).not.toContain("data-guard-exempt");
    }
  });

  it("solo el `<summary>` del plegable de la comisión está exento (abrir no edita)", () => {
    const html = renderToString(<QuoteSheetInterna {...base070()} />);
    expect(html).toContain('<summary data-guard-exempt="true" class="cot-plegable__resumen">');
  });
});

describe("ids ancla: existen y NO se duplican", () => {
  const ANCLAS = [
    "cobrable-field",
    "tarifa-override-field",
    "tarifa-tipo-field",
    "sobrevuelo-field",
    "tc-usd-mxn-field",
    "pasajeros-field",
    "metodo-pago-field",
  ];

  it("en EDICIÓN cada ancla aparece una sola vez", () => {
    const html = renderToString(
      <QuoteSheetInterna
        {...con({ tarifa_personalizada: true, tarifa_hora_override_usd: 1500 })}
      />,
    );
    for (const id of ANCLAS) {
      expect(html.split(`id="${id}"`).length - 1, id).toBe(1);
    }
  });
});
