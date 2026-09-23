import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Mismos mocks que los demás tests de la hoja: el autollenado de millas y el
// alta rápida de aeropuertos llaman a server actions que importan Supabase.
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
import { QuoteAvisosBanda } from "@/components/admin/quotes/quote-avisos-banda";
import { QuoteDetalleMotor } from "@/components/admin/quotes/quote-detalle-motor";
import { QuoteOperadorExterno } from "@/components/admin/quotes/quote-operador-externo";
import {
  QuoteRutaOperativa,
  QuoteRutaOperativaBanda,
} from "@/components/admin/quotes/quote-ruta-operativa";
import type { QuoteFormValues } from "@/components/admin/quotes/quote-form-types";
import type { PersistedEscala, PersistedQuote } from "@/types/quotes-persisted";
import type { EscalaInput } from "@/types/quote";

/**
 * FASE 2.3 · BLOQUE C (22-sep-2026): lo último que quedaba en el panel lateral
 * «Interno · no se imprime» —operador externo, ruta operativa, detalle del
 * motor y los avisos ámbar— y el RETIRO del panel.
 *
 * Qué se custodia aquí, que los fixtures de paridad no pueden ver (comparan
 * TEXTO impreso):
 *  1. que la banda azul de la RUTA OPERATIVA viva DENTRO del papel y ENCIMA de
 *     la tabla de tramos (es el aviso de divergencia: se lee junto a lo que
 *     cambia) y sea CROMA `data-cot-ui` — si no, el siguiente
 *     `gen:hoja-interna-fixture` dejaría de cuadrar;
 *  2. que cada `<details>` conserve el ancla del sub-bloque que sustituye
 *     (`seccion-externo`, `seccion-operativa`, `seccion-detalle`), que es
 *     como lo encuentran los enlaces por `document.getElementById`;
 *  3. que los AVISOS ámbar nunca sean plegables (un warning no se esconde);
 *  4. que el operador externo se AUTO-ABRA (`forzarAbierto`) — el operador es
 *     un campo obligatorio.
 */

const UI = /data-cot-ui/;

// ---------- Datos mínimos ----------

const escala = (o: Partial<Record<string, unknown>>): PersistedEscala =>
  ({
    id: String(o.orden ?? 1),
    orden: 1,
    origen_iata: "CUN",
    destino_iata: "PTU",
    es_ferry: false,
    solo_operativa: false,
    cancelada_at: null,
    ...o,
  }) as unknown as PersistedEscala;

const quoteOperativa = (escalas: PersistedEscala[]): PersistedQuote =>
  ({
    id: "q1",
    folio: 329,
    itinerario_operativo: true,
    escalas,
  }) as unknown as PersistedQuote;

const legs: EscalaInput[] = [
  {
    origen_iata: "CUN",
    destino_iata: "CZM",
    millas_nauticas: 40,
    pasajeros: 2,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    notas: null,
    fecha_salida_plan: null,
  },
];

const valoresExterno = (v: Partial<QuoteFormValues> = {}): QuoteFormValues =>
  ({
    es_externo: true,
    operador_externo: "Aerocharter del Caribe",
    avion_externo_modelo: "HAWKER 400 A",
    avion_externo_matricula: "XA-REG",
    costo_externo_monto: 3000,
    costo_externo_moneda: "USD",
    tc_usd_mxn: null,
    escalas: legs,
    escalas_operacion: [],
    ...v,
  }) as unknown as QuoteFormValues;

// ---------- 1 · La banda de ruta operativa vive en el papel ----------

describe("banda de RUTA OPERATIVA dentro del papel", () => {
  const conBanda = (): QuoteSheetInternaProps => ({
    ...ESCENARIOS_INTERNA["interna-329"](),
    bandaTramos: (
      <QuoteRutaOperativaBanda
        lectura={false}
        initialQuote={quoteOperativa([
          escala({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", es_ferry: true }),
          escala({ orden: 2, origen_iata: "PTU", destino_iata: "CUN" }),
        ])}
        escalasCotizadas={legs}
        operativa={{
          opsComoEscalas: () => legs,
          onAplicar: () => undefined,
          legsSignature: (l) => l.map((x) => `${x.origen_iata}-${x.destino_iata}`).join("|"),
        }}
      />
    ),
  });

  it("se pinta ENCIMA de «Tramos cotizados», no debajo ni fuera del papel", () => {
    const html = renderToString(<QuoteSheetInterna {...conBanda()} />);
    const banda = html.indexOf("Ruta operativa (la vuela el piloto");
    const tabla = html.indexOf("Tramos cotizados");
    expect(banda).toBeGreaterThan(-1);
    expect(tabla).toBeGreaterThan(-1);
    expect(banda).toBeLessThan(tabla);
  });

  it("es CROMA: el documento de pyservices no la imprime", () => {
    const html = renderToString(
      <QuoteRutaOperativaBanda
        lectura={false}
        initialQuote={quoteOperativa([escala({ orden: 1 })])}
        escalasCotizadas={legs}
        operativa={{
          opsComoEscalas: () => legs,
          onAplicar: () => undefined,
          legsSignature: () => "x",
        }}
      />,
    );
    expect(html).toMatch(UI);
    expect(html).toContain("Cotizar con estos tramos");
  });

  it("en LECTURA se pinta igual pero SIN botón: enterarse no depende de poder editar", () => {
    const html = renderToString(
      <QuoteRutaOperativaBanda
        lectura
        initialQuote={quoteOperativa([
          escala({ orden: 1, es_ferry: true }),
          escala({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", solo_operativa: true }),
        ])}
        escalasCotizadas={legs}
      />,
    );
    expect(html).toContain("Ruta operativa (la vuela el piloto — no se cotiza)");
    expect(html).toContain("ferry");
    expect(html).toContain("operativo");
    expect(html).not.toContain("Cotizar con estos tramos");
  });

  it("sin itinerario operativo no hay banda (ni en edición ni en lectura)", () => {
    const sinOps = { ...quoteOperativa([escala({ orden: 1 })]), itinerario_operativo: false };
    expect(
      renderToString(
        <QuoteRutaOperativaBanda
          lectura={false}
          initialQuote={sinOps as PersistedQuote}
          escalasCotizadas={legs}
        />,
      ),
    ).toBe("");
    expect(
      renderToString(
        <QuoteRutaOperativaBanda lectura initialQuote={undefined} escalasCotizadas={legs} />,
      ),
    ).toBe("");
  });
});

// ---------- 2 · El eco del operador externo en «Avión cotizado» ----------

describe("eco del operador externo en la tarjeta «Avión cotizado»", () => {
  it("se lee arriba y es croma (el papel lo imprime a su manera)", () => {
    const props: QuoteSheetInternaProps = {
      ...ESCENARIOS_INTERNA["interna-329"](),
      avionExtra: <>Cubierto por Aerocharter del Caribe · HAWKER 400 A</>,
    };
    const html = renderToString(<QuoteSheetInterna {...props} />);
    const i = html.indexOf("Cubierto por Aerocharter del Caribe");
    expect(i).toBeGreaterThan(-1);
    // El eco va dentro de un nodo marcado como croma.
    expect(html.slice(Math.max(0, i - 200), i)).toMatch(UI);
  });
});

// ---------- 3 · Los `<details>` conservan las anclas del panel ----------

describe("sub-bloques plegables: las anclas del panel siguen existiendo", () => {
  it("«Operador externo» monta `seccion-externo` y se auto-abre con es_externo", () => {
    const html = renderToString(
      <QuoteOperadorExterno
        lectura={false}
        isRevise={false}
        values={valoresExterno()}
        setValue={(() => undefined) as never}
        breakdown={null}
        costoExternoMxnSinTc={false}
        focusTc={() => undefined}
      />,
    );
    expect(html).toContain('id="seccion-externo"');
    expect(html).toContain('id="plegable-externo"');
    expect(html).toContain("Cubierto por Aerocharter del Caribe");
    // El contenido está en el DOM aunque el `<details>` esté plegado.
    expect(html).toContain("HAWKER 400 A");
  });

  it("el costo en MXN sin T.C. se avisa en el resumen, plegado o no", () => {
    const html = renderToString(
      <QuoteOperadorExterno
        lectura={false}
        isRevise={false}
        values={valoresExterno({ costo_externo_moneda: "MXN", costo_externo_monto: 50000 })}
        setValue={(() => undefined) as never}
        breakdown={null}
        costoExternoMxnSinTc
        focusTc={() => undefined}
      />,
    );
    expect(html).toContain("Costo MXN sin T.C.");
  });

  it("«Ruta operativa del vuelo» monta `seccion-operativa`", () => {
    const html = renderToString(
      <QuoteRutaOperativa
        values={valoresExterno({ es_externo: false })}
        setValue={(() => undefined) as never}
        airports={[{ iata: "CUN", nombre: "Cancún", latitud: null, longitud: null }]}
        onAeropuertoCreado={() => undefined}
      />,
    );
    expect(html).toContain('id="seccion-operativa"');
    expect(html).toContain('id="plegable-operativa"');
    expect(html).toContain("Vacía = usa la ruta comercial");
  });

  it("«Detalle del cálculo (motor)» monta `seccion-detalle`", () => {
    const html = renderToString(
      <QuoteDetalleMotor
        lectura={false}
        isRevise={false}
        breakdown={null}
        loading={false}
        error={null}
        hayPayload={false}
        avion={null}
        tcUsdMxn={null}
      />,
    );
    expect(html).toContain('id="seccion-detalle"');
    expect(html).toContain('id="plegable-detalle"');
    expect(html).toContain("Completa los parámetros");
  });
});

// ---------- 4 · Los avisos ámbar NUNCA se pliegan ----------

describe("banda de avisos sobre el papel", () => {
  it("sin avisos no ocupa espacio", () => {
    expect(renderToString(<QuoteAvisosBanda avisos={[]} />)).toBe("");
  });

  it("los pinta TODOS y no es un `<details>`", () => {
    const html = renderToString(
      <QuoteAvisosBanda
        avisos={["La ruta no ancla en CUN", "Costo del operador externo en MXN sin T.C."]}
      />,
    );
    expect(html).toContain("La ruta no ancla en CUN");
    expect(html).toContain("Costo del operador externo en MXN sin T.C.");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });
});

// ---------- 5 · «Pase de abordar» en LECTURA ----------

/**
 * Hasta el BLOQUE B ese dato solo se leía en el bloque «Cobro» del panel
 * lateral. Al retirarlo desaparecería de una cotización BLOQUEADA — y es el
 * que explica por qué el desglose no cobra TUAS. Se pinta como TAG de CROMA:
 * `_ficha_html` de pyservices no lo imprime, así que no puede ir al papel sin
 * tocar el otro repo.
 */
describe("«Pase de abordar» de una cotización bloqueada", () => {
  const conPase = (lectura: boolean): QuoteSheetInternaProps => {
    const p = ESCENARIOS_INTERNA["interna-329"]();
    return { ...p, lectura, valores: { ...p.valores, pase_abordar: true } };
  };

  it("en LECTURA se lee como croma (no como texto impreso)", () => {
    const html = renderToString(<QuoteSheetInterna {...conPase(true)} />);
    const i = html.indexOf("Pase de abordar");
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(Math.max(0, i - 120), i)).toMatch(UI);
  });

  it("apagado NO inventa ninguna marca", () => {
    const p = ESCENARIOS_INTERNA["interna-329"]();
    const html = renderToString(
      <QuoteSheetInterna {...p} lectura valores={{ ...p.valores, pase_abordar: false }} />,
    );
    expect(html).not.toContain("Pase de abordar");
  });
});
