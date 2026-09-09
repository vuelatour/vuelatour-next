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

import { QuoteSheet, type QuoteSheetProps } from "@/components/admin/quotes/quote-sheet";
import { ESCENARIOS } from "@/components/admin/quotes/__fixtures__/escenarios";
import { extraerMapaSvgDeHtml } from "@/lib/admin/quote-sheet";
import type { QuoteBreakdown } from "@/types/quote";

/**
 * FIDELIDAD de la hoja editable vs el HTML REAL del PDF (form-as-document,
 * 8-sep-2026): `QuoteSheet` se renderiza con `react-dom/server` para cada
 * escenario (`__fixtures__/escenarios.ts`) y se compara con el fixture que
 * generó pyservices (`_build_html(req, solo_hoja_1=True)`, ver
 * `scripts/gen-hoja1-fixture.py`) para el payload equivalente:
 *
 * 1. ESTRUCTURA: misma secuencia de tags + clases (editable y lectura).
 * 2. TEXTO en lectura: idéntico al del PDF (formatos de dinero, fechas
 *    Cancún, conceptos TUAS, «−$», «IVA (16%)», «T.C. 18.1»…).
 * 3. TEXTO en edición: idéntico salvo espacios, tomando de cada campo
 *    invisible lo que imprime (el `value` del input, el texto del selector,
 *    la fecha disfrazada, el span editable de notas).
 *
 * Normalización (documentada):
 * - La CROMA de edición no se imprime: subárboles `data-cot-ui` (salvo los
 *   campos, regla 3) y controles (`input`, `select`, `button`…); las clases
 *   `cot-*` del panel se ignoran.
 * - `tbody` es implícito en HTML (React lo exige; pyservices lo omite en
 *   `.itin-row`): se ignora en ambos.
 * - El `<svg>` del mapa es el MISMO string (viene de pyservices): se compara
 *   solo el tag y su texto se descarta.
 * - Entidades (`&minus;`, `&amp;`, `&#x27;`) decodificadas en ambos lados;
 *   los comentarios `<!-- -->` que React mete entre textos se descartan.
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
  nbsp: " ",
  minus: "−",
  times: "×",
  rarr: "→",
  middot: "·",
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

/** Árbol del subárbol cuya raíz lleva la clase `cot-hoja`. */
function parsearHoja(html: string): Elemento {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
  const pila: Elemento[] = [];
  let raiz: Elemento | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (m[2] === undefined) {
      // texto
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
      if (!/(^|\s)cot-hoja(\s|$)/.test(attrs.class ?? "")) continue;
      raiz = el;
    } else {
      pila[pila.length - 1].hijos.push(el);
    }
    if (tag === "svg") {
      // Opaco: el mapa es el mismo string en ambos lados.
      const fin = html.indexOf("</svg>", re.lastIndex);
      if (fin < 0) throw new Error("<svg> sin cierre");
      re.lastIndex = fin + "</svg>".length;
      continue;
    }
    const auto = m[4] === "/" || VACIOS.has(tag);
    if (!auto) pila.push(el);
  }
  if (!raiz) throw new Error("No hay raíz .cot-hoja");
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
    if (h.tag !== "svg") tokens(h, out);
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

/** Lo que IMPRIME un campo invisible (regla 3). */
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
    if (CONTROLES.has(h.tag) || h.tag === "svg") continue;
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
  props: () => QuoteSheetProps;
}

const CASOS: Caso[] = Object.entries(ESCENARIOS)
  .filter(([nombre]) => existsSync(path.join(FIXTURES, `${nombre}.html`)))
  .map(([nombre, escenario]) => {
    const html = readFileSync(path.join(FIXTURES, `${nombre}.html`), "utf8");
    return {
      nombre,
      html,
      props: () => ({ ...escenario(), mapaSvg: extraerMapaSvgDeHtml(html) }),
    };
  });

const render = (props: QuoteSheetProps) => parsearHoja(renderToString(<QuoteSheet {...props} />));

describe("fixtures", () => {
  it("existen los 4 fixtures generados con pyservices (npm run gen:hoja-fixture)", () => {
    expect(CASOS.map((c) => c.nombre).sort()).toEqual(["hoja-externo", "hoja-multidia", "hoja-normal", "hoja1"]);
  });
});

describe.each(CASOS)("QuoteSheet = hoja 1 del PDF · $nombre", ({ html, props }) => {
  const fixture = parsearHoja(html);
  const esperadoTokens = tokens(fixture);
  const esperadoTexto = colapsar(textoImpreso(fixture, false));

  it("el fixture es la hoja 1 de pyservices (sanidad del parser)", () => {
    expect(esperadoTokens[0]).toBe("div.marca");
    expect(esperadoTokens).toContain("div.header");
    expect(esperadoTokens).toContain("table.totales");
    expect(esperadoTokens[esperadoTokens.length - 1]).toBe("br");
    expect(esperadoTexto).toContain("Cotización de servicio aéreo");
    expect(esperadoTexto).toContain("www.vuelatour.com");
  });

  it("editable: misma secuencia de tags + clases que el PDF (sin la croma)", () => {
    expect(tokens(render(props()))).toEqual(esperadoTokens);
  });

  it("lectura: misma secuencia y ningún control", () => {
    const html = renderToString(<QuoteSheet {...props()} lectura />);
    expect(tokens(parsearHoja(html))).toEqual(esperadoTokens);
    expect(html).not.toMatch(/<input|<textarea|<select|contenteditable/);
  });

  it("lectura: el TEXTO impreso es idéntico al del PDF", () => {
    expect(colapsar(textoImpreso(render({ ...props(), lectura: true }), false))).toBe(esperadoTexto);
  });

  it("edición: cada campo imprime en su lugar lo mismo que el PDF", () => {
    expect(sinEspacios(textoImpreso(render(props()), true))).toBe(sinEspacios(esperadoTexto));
  });
});

// ---------- Variantes y reglas puntuales (sobre hoja1) ----------

const hoja1 = () => CASOS.find((c) => c.nombre === "hoja1")!;

describe("variantes de la hoja", () => {
  it("imprime los mismos textos que el PDF (formatos del armador)", () => {
    const html = renderToString(<QuoteSheet {...hoja1().props()} lectura />);
    for (const t of [
      "#1042",
      "Cliente Demo S.A.",
      "08/09/2026 09:00",
      "<strong>Aeronave cotizada:</strong> Piper Seneca V",
      "CUN → HOL → CZM → CUN",
      "4 pasajeros · XA-VGV",
      "12/09/2026 08:00",
      "12/09/2026 18:00",
      "<th>Fecha</th>",
      "12 sep 2026",
      "Servicio aéreo (2.4 h × $1,650.00/hr)",
      "$4,110.00",
      "TUA CUN · $25.00 × 4 pax",
      "$100.00",
      "Catering",
      "$170.00",
      "Viáticos por pernocta",
      "$150.00",
      "−$20.00",
      "Subtotal (sin IVA)",
      "$4,590.00",
      "IVA (16%)",
      "$734.40",
      "Total (USD)",
      "$5,324.40",
      "Total MXN (T.C. 18.1)",
      "$96,371.64 MXN",
      "Sujeto a slot en CUN",
      "Horarios en hora de Cancún (UTC−5).",
    ]) {
      expect(html, t).toContain(t);
    }
    // Lo que el PDF descarta también aquí: matrícula solo por la regla VGV
    // (aparece en la sublínea, nunca en «Aeronave cotizada»).
    expect(html).not.toContain("XA-VGV — ");
  });

  it("sin mapa: tabla del itinerario sola, sin itin-row (misma variante del PDF)", () => {
    const html = renderToString(<QuoteSheet {...hoja1().props()} mapaSvg={null} />);
    const t = tokens(parsearHoja(html));
    expect(t).not.toContain("table.itin-row");
    expect(html).toContain("<h2>Itinerario</h2>");
  });

  it("sin notas ni descuento ni T.C.: esas filas no se imprimen (fantasmas fuera de la estructura)", () => {
    const p = hoja1().props();
    p.valores = { ...p.valores, notas: "", descuento_usd: null, tc_usd_mxn: null };
    p.breakdown = {
      ...p.breakdown!,
      totales: { ...p.breakdown!.totales, ajuste_final_usd: 0, total_mxn: null },
    } as QuoteBreakdown;
    const html = renderToString(<QuoteSheet {...p} />);
    const t = tokens(parsearHoja(html));
    const esperado = tokens(parsearHoja(hoja1().html));
    expect(t).not.toContain("div.notas");
    expect(t).not.toContain("tr.total-mxn");
    expect(t.filter((x) => x === "td.lbl").length).toBe(esperado.filter((x) => x === "td.lbl").length - 1);
    // …pero existen como fantasma para poder capturar.
    expect(html).toContain("Descuento");
    expect(html).toContain("Total MXN");
    expect(html).toContain("Notas:");
  });

  it("«Por confirmar» y «—» se imprimen (son contenido, no placeholder gris)", () => {
    const p = hoja1().props();
    p.valores = { ...p.valores, fecha_traslado_final: "" };
    const html = renderToString(<QuoteSheet {...p} />);
    expect(html).toContain("Por confirmar");
    expect(colapsar(textoImpreso(parsearHoja(html), true))).toContain("Traslado final Por confirmar");
  });

  it("aeronaves cotizadas: sin repetidos y jamás con la matrícula (como _modelos_cotizados)", () => {
    const p = hoja1().props();
    p.documento = { ...p.documento, modelosCotizados: ["Piper Seneca V", "piper seneca v", "XA-VGV", " Kodiak 100 "] };
    const html = renderToString(<QuoteSheet {...p} lectura />);
    expect(html).toContain("<strong>Aeronaves cotizadas:</strong> Piper Seneca V · Kodiak 100");
    expect(html).not.toContain("Piper Seneca V · piper");
  });

  it("primer tramo oculto: el traslado inicial impreso es la salida del primer tramo VISIBLE", () => {
    const p = hoja1().props();
    p.valores = {
      ...p.valores,
      escalas: [
        { ...p.valores.escalas[0], pdf_oculto: true },
        { ...p.valores.escalas[1], fecha_salida_plan: "2026-09-12T11:30" },
        p.valores.escalas[2],
      ],
    };
    const html = renderToString(<QuoteSheet {...p} />);
    const texto = colapsar(textoImpreso(parsearHoja(html), true));
    expect(texto).toContain("Traslado inicial 12/09/2026 11:30");
    expect(texto).not.toContain("Traslado inicial 12/09/2026 08:00");
    // La ruta también une solo los visibles.
    expect(texto).toContain("HOL → CZM → CUN");
    expect(texto).not.toContain("CUN → HOL → CZM");
  });

  it("snapshot legado sin tuas.filas: imprime los conceptos TUAS del desglose (como el API)", () => {
    const p = hoja1().props();
    const b = p.breakdown!;
    p.breakdown = {
      ...b,
      tuas: { ...b.tuas, filas: undefined },
      desglose: [
        { clave: "TUAS", concepto: "TUA CUN · $25.00 × 4 pax", monto_usd: 100 },
        { clave: "TUAS", concepto: "TUA CZM · $20.00 × 4 pax", monto_usd: 80 },
      ],
    } as QuoteBreakdown;
    const html = renderToString(<QuoteSheet {...p} lectura />);
    expect(html).toContain('<td class="lbl">TUA CUN · $25.00 × 4 pax</td><td class="val"></td>');
    expect(html).toContain('<td class="lbl">TUA CZM · $20.00 × 4 pax</td><td class="val"></td>');
    expect(html).toContain("TUAS (total)");
  });
});

// ---------- Acento de interacción (feedback del cliente, 9-sep-2026) ----------

/**
 * Croma que SOLO existe en edición (enlaces, filas «+ Agregar», marcas de
 * vacío, inputs, márgenes). En lectura bloqueada la hoja ES el PDF: nada de
 * esto puede aparecer, y el CSS del acento cuelga de `:not(.cot-hoja--lectura)`
 * (ver `styles/__tests__/hoja-css-deriva.test.ts`).
 */
const CROMA_EDICION =
  /cot-liga|cot-acciones|cot-fila-agregar|cot-btn|cot-sel--vacio|cot-fecha__texto--vacio|cot-in\b|placeholder=|cot-margen|cot-tenue|cot-fila--fantasma/;

describe("acento de interacción (solo edición)", () => {
  const clienteExtra = (
    <button type="button" className="cot-liga">
      + nuevo cliente
    </button>
  );

  it.each(CASOS.map((c) => [c.nombre, c] as const))(
    "lectura · %s: raíz --lectura y CERO croma de edición (ni con clienteExtra)",
    (_nombre, caso) => {
      const html = renderToString(<QuoteSheet {...caso.props()} lectura clienteExtra={clienteExtra} />);
      expect(html).toMatch(/class="cot-hoja[^"]*cot-hoja--lectura/);
      expect(html).not.toMatch(CROMA_EDICION);
      expect(html).not.toContain("nuevo cliente");
    },
  );

  it("edición (hoja1): lo capturado NO lleva marca de vacío; --vacio solo donde el PDF imprime «—»", () => {
    const html = renderToString(<QuoteSheet {...hoja1().props()} />);
    expect(html).not.toContain("cot-hoja--lectura");
    // Selectores con valor (cliente, aeronave, IATA): sin --vacio.
    expect(html).not.toContain("cot-sel--vacio");
    // Fechas capturadas: el span impreso va limpio (idéntico al PDF).
    for (const t of ['cot-fecha__texto">12/09/2026 08:00<', 'cot-fecha__texto">12/09/2026 18:00<', 'cot-fecha__texto">12 sep 2026<']) {
      expect(html, t).toContain(t);
    }
    // Los tramos 2 y 3 no tienen pdf_fecha: el PDF imprime «—» y SOLO ahí va la marca.
    const vacios = html.match(/cot-fecha__texto--vacio"[^>]*>([^<]*)</g) ?? [];
    expect(vacios.length).toBe(2);
    for (const v of vacios) expect(v.endsWith(">—<"), v).toBe(true);
  });

  it("edición con vacíos: selector y fecha sin valor llevan --vacio y el texto impreso se conserva", () => {
    const p = hoja1().props();
    p.valores = { ...p.valores, cliente_id: "", fecha_traslado_final: "" };
    const html = renderToString(<QuoteSheet {...p} />);
    expect(html).toMatch(/cot-sel cot-sel--vacio[^>]*>Selecciona cliente</);
    expect(html).toMatch(/cot-fecha__texto cot-fecha__texto--vacio">Por confirmar</);
  });

  it("«+ nuevo cliente» va EN LA LÍNEA del cliente (.meta, croma data-cot-ui, con espacio antes del «·»)", () => {
    const html = renderToString(<QuoteSheet {...hoja1().props()} clienteExtra={clienteExtra} />);
    const meta = html.slice(html.indexOf('class="meta"'), html.indexOf('class="route'));
    expect(meta).toMatch(
      /<span class="cot-acciones" data-cot-ui=""> <span class="cot-sep">·<\/span><button[^>]*class="cot-liga"[^>]*>\+ nuevo cliente<\/button><\/span>/,
    );
    // Nunca en el margen del papel (a 12 px se salía de la hoja).
    expect(meta).not.toContain("cot-margen");
  });
});
