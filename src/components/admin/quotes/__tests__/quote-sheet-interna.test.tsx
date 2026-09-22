import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// El autollenado de millas (`useLookupNm`) llama a una server action que
// importa el cliente de Supabase (env vars): en el runner se sustituye por un
// catálogo vacío (el efecto ni corre en `renderToString`).
vi.mock("@/app/admin/distancias/actions", () => ({
  getDistanciasAction: async () => ({ ok: true, data: [] }),
}));
// `parseCodigosRuta` vive en ruta-rapida-input, que arrastra el alta rápida
// de aeropuertos (server action → cliente de Supabase): se vacía aquí.
vi.mock("@/app/admin/airports/actions", () => ({
  createAirportAction: async () => ({ ok: false, error: "mock" }),
}));

import {
  QuoteSheetInterna,
  type QuoteSheetInternaProps,
} from "@/components/admin/quotes/quote-sheet-interna";
import { ESCENARIOS_INTERNA } from "@/components/admin/quotes/__fixtures__/escenarios-interna";

/**
 * PARIDAD de la HOJA INTERNA editable contra el documento REAL de pyservices
 * (Fase 2.2, 22-sep-2026): `QuoteSheetInterna` se renderiza con
 * `react-dom/server` para cada escenario y se compara con el fixture que
 * generó `render_cotizacion_interna_preview_html` — la MISMA función que
 * sirve `POST /reportes/cotizacion-interna/preview-html` y el MISMO cuerpo
 * que incrusta el PDF (ver `scripts/gen-hoja-interna-fixture.py`).
 *
 * QUÉ SE COMPARA, y por qué no bytes (decisión del diseño): el documento
 * interno es un FORMULARIO denso con controles en casi cada celda; exigir
 * igualdad de secuencia tag+clase en EDICIÓN obligaría a que cada input
 * invisible tuviera espejo en el PDF y acabaría deformando uno de los dos.
 * Lo que importa —y lo que se custodia aquí— es que los NÚMEROS y los TEXTOS
 * digan lo mismo:
 *
 * 1. ESTRUCTURA en LECTURA: misma secuencia de tags + clases que el papel.
 * 2. TEXTO en LECTURA: idéntico al del documento interno (formatos de dinero,
 *    «CUN–CZM» con guion largo, «26-jun», «00:27», «1.75 h», el ajuste con su
 *    motivo, el pie de cobros con su semáforo).
 * 3. TEXTO en EDICIÓN: el mismo, tomando de cada campo invisible lo que
 *    imprime (el `value` del input, el texto del selector, la fecha
 *    disfrazada).
 *
 * Normalización, igual que en `quote-sheet.test.tsx`: la CROMA de edición
 * (`data-cot-ui`) y los controles no se imprimen; `tbody` es implícito en
 * HTML (React lo exige, pyservices lo omite); las clases `cot-*` son del
 * panel y se ignoran; las entidades se decodifican en ambos lados.
 */

const FIXTURES = path.resolve(__dirname, "..", "__fixtures__");

// ---------- Mini parser HTML (marcado bien formado de React y de Python) ----------

interface Elemento {
  tag: string;
  attrs: Record<string, string>;
  hijos: Array<Elemento | string>;
}

const VACIOS = new Set(["br", "img", "input", "hr", "meta", "link", "col", "wbr"]);
const CONTROLES = new Set(["input", "textarea", "select", "option", "button", "script", "style"]);

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  minus: "−",
  times: "×",
  rarr: "→",
  middot: "·",
  ndash: "–",
};

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTIDADES[e] ?? m;
  });
}

function parsearAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=>/]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = decodificar(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** Árbol del subárbol cuya raíz lleva la clase `cot-interna`. */
function parsearHoja(html: string): Elemento {
  const re =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
  const pila: Elemento[] = [];
  let raiz: Elemento | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (m[2] === undefined) {
      if (pila.length > 0) pila[pila.length - 1].hijos.push(decodificar(tok));
      continue;
    }
    const cierra = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (cierra) {
      if (pila.length === 0) continue;
      const el = pila.pop()!;
      if (el.tag !== tag) throw new Error(`Cierre inesperado </${tag}> (abierto <${el.tag}>)`);
      if (pila.length === 0) return raiz!;
      continue;
    }
    const attrs = parsearAttrs(m[3] ?? "");
    const el: Elemento = { tag, attrs, hijos: [] };
    if (pila.length === 0) {
      if (!/(^|\s)cot-interna(\s|$)/.test(attrs.class ?? "")) continue;
      raiz = el;
    } else {
      pila[pila.length - 1].hijos.push(el);
    }
    const auto = m[4] === "/" || VACIOS.has(tag);
    if (!auto) pila.push(el);
  }
  if (!raiz) throw new Error("No hay raíz .cot-interna");
  return raiz;
}

const clasesDe = (el: Elemento) => (el.attrs.class ?? "").split(/\s+/).filter(Boolean);
const esUi = (el: Elemento) => "data-cot-ui" in el.attrs || CONTROLES.has(el.tag);

/** Secuencia `tag.clase.clase` del subárbol (sin croma ni clases cot-*). */
function tokens(el: Elemento, out: string[] = []): string[] {
  for (const h of el.hijos) {
    if (typeof h === "string") continue;
    if (esUi(h)) continue;
    if (h.tag === "tbody") {
      tokens(h, out);
      continue;
    }
    const clases = clasesDe(h)
      .filter((c) => !c.startsWith("cot-"))
      .sort();
    out.push(clases.length ? `${h.tag}.${clases.join(".")}` : h.tag);
    tokens(h, out);
  }
  return out;
}

function textoPlano(el: Elemento): string {
  let s = "";
  for (const h of el.hijos) s += typeof h === "string" ? h : textoPlano(h);
  return s;
}

function buscar(el: Elemento, pred: (e: Elemento) => boolean): Elemento | null {
  for (const h of el.hijos) {
    if (typeof h === "string") continue;
    if (pred(h)) return h;
    const r = buscar(h, pred);
    if (r) return r;
  }
  return null;
}

/** Lo que IMPRIME un campo invisible. */
function textoCampo(el: Elemento): string {
  const clases = clasesDe(el);
  if (clases.includes("cot-auto")) {
    const input = buscar(el, (e) => e.tag === "input");
    return input?.attrs.value ?? "";
  }
  if (clases.includes("cot-fecha")) {
    const t = buscar(el, (e) => clasesDe(e).includes("cot-fecha__texto"));
    return t ? textoPlano(t) : "";
  }
  if (clases.includes("cot-sel")) return clases.includes("cot-sel--vacio") ? "" : textoPlano(el);
  if ("contenteditable" in el.attrs) return textoPlano(el);
  return "";
}

/** Texto impreso del subárbol; en edición los campos aportan su valor. */
function textoImpreso(el: Elemento, edicion: boolean): string {
  let s = "";
  for (const h of el.hijos) {
    if (typeof h === "string") {
      s += h;
      continue;
    }
    if ("data-cot-ui" in h.attrs) {
      if (edicion) s += textoCampo(h);
      continue;
    }
    if (CONTROLES.has(h.tag)) continue;
    s += ` ${textoImpreso(h, edicion)} `;
  }
  return s;
}

const colapsar = (s: string) => s.replace(/\s+/g, " ").trim();
const sinEspacios = (s: string) => s.replace(/\s+/g, "");

// ---------- Escenarios ----------

interface Caso {
  nombre: string;
  html: string;
  props: () => QuoteSheetInternaProps;
}

const CASOS: Caso[] = Object.entries(ESCENARIOS_INTERNA)
  .filter(([nombre]) => existsSync(path.join(FIXTURES, `${nombre}.html`)))
  .map(([nombre, escenario]) => ({
    nombre,
    html: readFileSync(path.join(FIXTURES, `${nombre}.html`), "utf8"),
    props: escenario,
  }));

const render = (props: QuoteSheetInternaProps) =>
  parsearHoja(renderToString(<QuoteSheetInterna {...props} />));

describe("fixtures de la hoja interna", () => {
  it("existen los 3 fixtures generados con pyservices (npm run gen:hoja-interna-fixture)", () => {
    expect(CASOS.map((c) => c.nombre).sort()).toEqual([
      "interna-070",
      "interna-311",
      "interna-329",
    ]);
  });

  /**
   * Los renglones que SOLO existen en el papel interno (revisión adversaria,
   * 22-sep-2026): el concepto CANÓNICO del motor —con el nombre del vendedor
   * y su «$/hr × hr» dentro, el «(sin IVA)» de la pernocta y el «Redondeo»
   * del ajuste— y, en «Total MXN», cuánto del total NO pasó por el T.C.
   * Redactarlos a mano en el panel hacía que pantalla y PDF nombraran
   * distinto el MISMO renglón.
   */
  it("interna-070 congela los conceptos canónicos y los pesos nativos", () => {
    const html = CASOS.find((c) => c.nombre === "interna-070")!.html;
    for (const t of [
      "Comisión del vendedor (Saab) · $50.00/hr × 2 hr",
      "Redondeo",
      "Viáticos por pernocta (sin IVA)",
      "Subtotal gravable",
      "No causan IVA",
      "T.C. 18.1 · incluye $1,322.40 MXN nativos",
      "4 pax × $330.60 MXN = $1,322.40 MXN · T.C. 18.1",
    ]) {
      expect(html, t).toContain(t);
    }
  });

  /**
   * La tabla del Excel de la oficina, con el ajuste que concilia «TOTAL Σ
   * tramos» (verde) con «Servicio aéreo» (desglose). Sin esa fila, en 6 de
   * cada 10 cotizaciones el documento tendría dos números sin relación
   * visible (riesgo 1 del diseño).
   */
  it("interna-329 congela la tabla de tramos y su ajuste", () => {
    const html = CASOS.find((c) => c.nombre === "interna-329")!.html;
    for (const t of [
      "CUN–CZM",
      "26-jun",
      "00:27",
      "$1,650.00",
      "$742.50",
      "$2,475.00 USD",
      "Horas pactadas 1.75 h",
      "$412.50",
      "Servicio aéreo",
      "$2,887.50 USD",
    ]) {
      expect(html, t).toContain(t);
    }
    // Guion LARGO en la abreviatura (decisión 5 del diseño): es lo que ya
    // está impreso en todas las cotizaciones.
    expect(html).toContain("CUN–CZM");
    expect(html).not.toContain("CUN-CZM");
  });
});

describe.each(CASOS)("QuoteSheetInterna = documento interno · $nombre", ({ html, props }) => {
  const fixture = parsearHoja(html);
  const esperadoTokens = tokens(fixture);
  const esperadoTexto = colapsar(textoImpreso(fixture, false));

  it("el fixture es el documento interno de pyservices (sanidad del parser)", () => {
    expect(esperadoTokens).toContain("div.header");
    expect(esperadoTokens).toContain("div.banda");
    expect(esperadoTokens).toContain("table.grid.tramos");
    expect(esperadoTokens).toContain("table.totales");
    expect(esperadoTexto).toContain("Cotización interna");
    expect(esperadoTexto).toContain("Tramos cotizados");
    expect(esperadoTexto).toContain("Cobros");
  });

  it("lectura: misma secuencia de tags + clases que el documento", () => {
    expect(tokens(render({ ...props(), lectura: true }))).toEqual(esperadoTokens);
  });

  it("lectura: ningún control (la hoja bloqueada ES el documento)", () => {
    const salida = renderToString(<QuoteSheetInterna {...props()} lectura />);
    expect(salida).not.toMatch(/<input|<textarea|<select|contenteditable/);
  });

  it("lectura: el TEXTO impreso es idéntico al del documento", () => {
    expect(colapsar(textoImpreso(render({ ...props(), lectura: true }), false))).toBe(esperadoTexto);
  });

  it("edición: cada campo imprime en su lugar lo mismo que el documento", () => {
    expect(sinEspacios(textoImpreso(render(props()), true))).toBe(sinEspacios(esperadoTexto));
  });
});

// ---------- Reglas propias de la pantalla ----------

const caso329 = () => ESCENARIOS_INTERNA["interna-329"]();

describe("la hoja interna no se puede confundir con la del cliente", () => {
  it("lleva la banda roja y la marca de agua «INTERNA»", () => {
    const html = renderToString(<QuoteSheetInterna {...caso329()} />);
    expect(html).toContain("Cotización interna · uso exclusivo de oficina · no enviar al cliente");
    expect(html).toContain("INTERNA");
    expect(html).toContain("cot-marca-agua");
  });

  it("la marca de agua es croma: no se imprime ni cuenta en la comparación", () => {
    const raiz = render(caso329());
    const agua = buscar(raiz, (e) => clasesDe(e).includes("cot-marca-agua"));
    expect(agua).not.toBeNull();
    expect("data-cot-ui" in agua!.attrs).toBe(true);
  });
});

describe("el dinero se LEE, nunca se multiplica en el panel", () => {
  /**
   * Riesgo 10 del diseño: si el panel replicara `round2(tiempo × tarifa)`,
   * pantalla y PDF podrían decir cifras distintas del MISMO vuelo. Con un API
   * previo (sin los ADITIVOS del 0.0.27) esas celdas pintan «—».
   */
  it("sin los campos del API 0.0.27, las columnas TIEMPO/COSTO/TOTAL pintan «—»", () => {
    const base = caso329();
    const b = base.breakdown!;
    const viejo = {
      ...b,
      tramos: (b.tramos ?? []).map((t) => ({
        ...t,
        tarifa_usd_hr: undefined,
        tiempo_hhmm: undefined,
        total_usd: undefined,
      })),
      tramos_total_usd: undefined,
      tramos_tiempo_total_hhmm: undefined,
      tramos_tiempo_total_hr: undefined,
      tramos_ajuste_usd: undefined,
      tramos_ajuste_motivo: undefined,
    };
    const html = renderToString(
      <QuoteSheetInterna {...base} breakdown={viejo} lectura />,
    );
    // El tiempo por tramo se sigue pudiendo formatear (viene del motor de
    // siempre); lo que NO se inventa es el importe ni el pie.
    expect(html).not.toContain("$742.50");
    expect(html).not.toContain("$2,475.00");
    expect(html).toContain("—");
  });

  it("un tramo TECLEADO que el motor aún no calculó no inventa su total", () => {
    const base = caso329();
    const props: QuoteSheetInternaProps = {
      ...base,
      valores: {
        ...base.valores,
        escalas: [
          ...base.valores.escalas,
          { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 170 },
        ],
      },
    };
    const html = renderToString(<QuoteSheetInterna {...props} />);
    // 170 nm × la tarifa NO aparece por ningún lado: el motor va un debounce
    // atrás y la fila nueva se queda en «—».
    expect(html).toContain("—");
  });
});

describe("gate por rol y payload ausente", () => {
  it("sin `interno` (alta o API previo) la hoja se pinta y Cobros lo dice", () => {
    const html = renderToString(<QuoteSheetInterna {...caso329()} interno={null} />);
    expect(html).toContain("Tramos cotizados");
    expect(html).toContain("Sin cobros registrados");
    // Nada de lo que solo vive en `/interno` se inventa.
    expect(html).not.toContain("cotizó Itzi");
    expect(html).not.toContain("Abraham Zamora");
  });

  it("con `interno` se pinta quién cotizó, el piloto y quién registró el cobro", () => {
    const html = renderToString(<QuoteSheetInterna {...caso329()} />);
    expect(html).toContain("cotizó Itzi");
    expect(html).toContain("Abraham Zamora");
    expect(html).toContain("Registró: Itzi");
    expect(html).toContain("Avión utilizado: N990GG · Seneca V");
    expect(html).toContain("Distinto al cotizado");
  });
});
