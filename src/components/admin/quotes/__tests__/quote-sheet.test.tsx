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
  it("existen los 7 fixtures generados con pyservices (npm run gen:hoja-fixture)", () => {
    expect(CASOS.map((c) => c.nombre).sort()).toEqual([
      "hoja-externo",
      "hoja-horas8",
      "hoja-multidia",
      "hoja-normal",
      "hoja-sin-iva",
      "hoja-tc6",
      "hoja1",
    ]);
  });

  /**
   * DERIVA DEL T.C. ENTRE REPOS (17-sep-2026): el fixture `hoja-tc6` lleva el
   * tipo de cambio del vuelo #314 (16.991632, 6 decimales). pyservices lo
   * imprime con `_tc_txt` y el panel con `fmtTc`; con el `numeroG`/`:g` de
   * antes el texto se recortaba a «16.9916» y el documento dejaba de cuadrar
   * con sus propios pesos. Los cinco casos de `describe.each` comparan el
   * texto completo, esto solo deja el porqué a la vista de quien lo rompa.
   */
  it("hoja-tc6 congela el T.C. COMPLETO del PDF (no «16.9916»)", () => {
    const html = CASOS.find((c) => c.nombre === "hoja-tc6")!.html;
    expect(html).toContain("Total MXN (T.C. 16.991632)");
    expect(html).not.toMatch(/T\.C\. 16\.9916(?!32)/);
  });

  /**
   * HORAS PACTADAS de 8 DECIMALES (cotización #322, 22-sep-2026): 2:20 a
   * $600/hr son $1,400.00 exactos y lo persistido es 2.33333333, no 2.3333
   * (con el truncado el total caía a $1,399.98 al reabrir la cotización).
   * En el PDF esas horas se imprimen con `:g` —6 cifras significativas— y el
   * panel las pinta con `numeroG`: el texto tiene que ser el MISMO.
   */
  it("hoja-horas8 congela las horas pactadas del PDF («2.33333 h», no «2.3333»)", () => {
    const html = CASOS.find((c) => c.nombre === "hoja-horas8")!.html;
    expect(html).toContain("Servicio aéreo (2.33333 h × $600.00/hr)");
    expect(html).not.toContain("2.3333 h ×");
  });

  /**
   * CONCEPTOS SIN IVA DEBAJO DEL IVA (22-sep-2026, pedido del cliente). El
   * fixture `hoja-sin-iva` congela el ORDEN del PDF: gravables → «Subtotal
   * gravable» (la BASE del 16 %, ya sin los exentos) → IVA → rótulo «No
   * causan IVA» → los exentos → Total. Los `describe.each` comparan todo el
   * texto; esto deja a la vista qué se rompió para quien lo rompa.
   */
  it("hoja-sin-iva congela el orden del PDF (base gravable → IVA → No causan IVA)", () => {
    const html = CASOS.find((c) => c.nombre === "hoja-sin-iva")!.html;
    const orden = [
      "Servicio aéreo",
      "Handler",
      "Subtotal gravable",
      "$4,000.00",
      "IVA (16%)",
      "No causan IVA",
      "Transfers",
      "Viáticos por pernocta",
      "Total (USD)",
    ];
    let desde = 0;
    for (const t of orden) {
      const i = html.indexOf(t, desde);
      expect(i, `«${t}» fuera de orden en el PDF`).toBeGreaterThan(-1);
      desde = i;
    }
    // El renglón sobre el IVA YA NO es «total − IVA» ($4,250.00): con
    // exentos eso no era ni la suma de arriba ni la base del 16 %.
    expect(html).not.toContain("Subtotal (sin IVA)");
    expect(html).not.toContain("$4,250.00");
  });

  /**
   * Los otros SEIS fixtures salen EXACTAMENTE como antes: o no tienen ningún
   * concepto exento, o su IVA es 0, o (hoja1) sus identidades no cuadran y
   * la partición DEGRADA. Nunca «Subtotal gravable» sin exentos debajo.
   */
  it.each(CASOS.filter((c) => c.nombre !== "hoja-sin-iva"))(
    "$nombre conserva «Subtotal (sin IVA)» y no pinta el bloque de exentos",
    ({ html }) => {
      expect(html).toContain("Subtotal (sin IVA)");
      expect(html).not.toContain("Subtotal gravable");
      expect(html).not.toContain("No causan IVA");
    },
  );
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
      "<strong>Fecha del vuelo:</strong> 12/09/2026",
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
    // SIN horas para el cliente (15-sep-2026): ni el bloque «Traslados» ni
    // las horas de salida/regreso que antes imprimía.
    expect(html).not.toContain("Traslado");
    expect(html).not.toContain("08:00");
    expect(html).not.toContain("18:00");
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

  it("«—» se imprime (es contenido, no placeholder gris); «Por confirmar» ya no: sin regreso la fecha queda en singular", () => {
    const p = hoja1().props();
    p.valores = { ...p.valores, fecha_traslado_final: "" };
    const html = renderToString(<QuoteSheet {...p} />);
    const impreso = colapsar(textoImpreso(parsearHoja(html), true));
    // La fecha del tramo sin capturar SÍ es contenido del PDF.
    expect(impreso).toContain("—");
    // El regreso sin capturar no pinta nada en el papel: la línea de `.meta`
    // sigue en singular (el armador jamás imprime «Por confirmar» ahí).
    expect(impreso).toContain("Fecha del vuelo: 12/09/2026");
    expect(impreso).not.toContain("Fechas del vuelo");
    expect(impreso).not.toContain("Por confirmar");
    // «Por confirmar» sobrevive SOLO como texto del input de edición.
    expect(html).toMatch(/cot-fecha__texto cot-fecha__texto--vacio">Por confirmar</);
    expect(renderToString(<QuoteSheet {...p} lectura />)).not.toContain("Por confirmar");
  });

  /**
   * SALIDA y REGRESO con hora (15-sep-2026): dato OPERATIVO que solo se
   * captura en esta hoja. Se editan igual que antes (mismos campos del form)
   * pero NUNCA se imprimen: subárbol `data-cot-ui` que el React no monta en
   * lectura, así que la hoja bloqueada es idéntica al PDF.
   */
  it("salida/regreso: editables con hora en edición, inexistentes en lectura", () => {
    const cambios: Array<[string, unknown]> = [];
    const p = hoja1().props();
    const html = renderToString(<QuoteSheet {...p} onCambio={(c, v) => cambios.push([c, v])} />);
    // Los dos inputs siguen ahí, con la hora de pared Cancún del form.
    expect(html).toContain('aria-label="Salida del vuelo (hora de Cancún)"');
    expect(html).toContain('aria-label="Regreso del vuelo (hora de Cancún)"');
    expect(html).toContain('value="2026-09-12T08:00"');
    expect(html).toContain('value="2026-09-12T18:00"');
    expect(html).toContain("Las horas no se imprimen: el cliente solo ve la fecha.");
    // …y no tocan ni la estructura ni el texto impreso.
    expect(tokens(parsearHoja(html))).toEqual(tokens(parsearHoja(hoja1().html)));
    expect(colapsar(textoImpreso(parsearHoja(html), true))).not.toContain("08:00");
    const lectura = renderToString(<QuoteSheet {...p} lectura />);
    expect(lectura).not.toContain("cot-horas");
    expect(lectura).not.toContain("Las horas no se imprimen");
    expect(cambios).toEqual([]);
  });

  it("aeronaves cotizadas: sin repetidos y jamás con la matrícula (como _modelos_cotizados)", () => {
    const p = hoja1().props();
    p.documento = { ...p.documento, modelosCotizados: ["Piper Seneca V", "piper seneca v", "XA-VGV", " Kodiak 100 "] };
    const html = renderToString(<QuoteSheet {...p} lectura />);
    expect(html).toContain("<strong>Aeronaves cotizadas:</strong> Piper Seneca V · Kodiak 100");
    expect(html).not.toContain("Piper Seneca V · piper");
  });

  /**
   * LA COTIZACIÓN ES INDEPENDIENTE DE LA OPERACIÓN (12-sep-2026, R5): si el
   * vuelo opera hoy en otro avión se dice junto al selector, TENUE y FUERA
   * del PDF — la estructura impresa no cambia y el cliente nunca lo ve.
   */
  it("«Opera en …»: nota tenue en edición, jamás impresa ni en lectura", () => {
    const p = hoja1().props();
    p.documento = { ...p.documento, operaEn: "Opera en N990GG (Seneca V)" };
    const html = renderToString(<QuoteSheet {...p} />);
    expect(html).toContain("Opera en N990GG (Seneca V)");
    // No entra en el papel: misma secuencia de tags/clases que el PDF…
    expect(tokens(parsearHoja(html))).toEqual(tokens(parsearHoja(hoja1().html)));
    // …ni en el texto impreso (subárbol `data-cot-ui`).
    expect(colapsar(textoImpreso(parsearHoja(html), true))).not.toContain("Opera en");
    // En lectura bloqueada la hoja ES el PDF: ni la nota ni su croma.
    const lectura = renderToString(<QuoteSheet {...p} lectura />);
    expect(lectura).not.toContain("Opera en N990GG");
  });

  /**
   * EL VUELO YA VOLÓ y se cambió el avión (24-sep-2026, #338): la nota ÁMBAR
   * sustituye a «Opera en …» (ya dice con qué avión se voló), es croma y no
   * existe en lectura.
   */
  it("vuelo ya volado + avión cambiado: nota ámbar en lugar de «Opera en …», jamás impresa", () => {
    const aviso =
      "Este vuelo ya voló en N4142R. Cambiar el avión aquí solo cambia con qué se cobra " +
      "(Cessna 206); la operación no se mueve ni se avisa a la tripulación.";
    const p = hoja1().props();
    p.documento = {
      ...p.documento,
      operaEn: "Voló en N4142R (Piper Seneca V)",
      avisoCambioAvion: aviso,
    };
    const html = renderToString(<QuoteSheet {...p} />);
    expect(html).toContain(aviso);
    expect(html).toMatch(/<span class="cot-aviso" role="note" data-cot-ui="">Este vuelo ya voló/);
    // Una sola nota: la tenue no se repite debajo.
    expect(html).not.toContain("Voló en N4142R (Piper Seneca V)");
    expect(tokens(parsearHoja(html))).toEqual(tokens(parsearHoja(hoja1().html)));
    expect(colapsar(textoImpreso(parsearHoja(html), true))).not.toContain("ya voló");
    const lectura = renderToString(<QuoteSheet {...p} lectura />);
    expect(lectura).not.toContain("ya voló");
  });

  it("primer tramo oculto: la fecha del vuelo impresa es la del primer tramo VISIBLE (nunca delata el oculto)", () => {
    const p = hoja1().props();
    p.valores = {
      ...p.valores,
      // El tramo 1 sale el 12 y está OCULTO; el primero visible sale el 13.
      escalas: [
        { ...p.valores.escalas[0], pdf_oculto: true },
        { ...p.valores.escalas[1], fecha_salida_plan: "2026-09-13T11:30" },
        p.valores.escalas[2],
      ],
    };
    const html = renderToString(<QuoteSheet {...p} />);
    const texto = colapsar(textoImpreso(parsearHoja(html), true));
    // Rango: sale el 13 (tramo visible) y regresa el 12 (campo del vuelo).
    expect(texto).toContain("Fechas del vuelo: 13/09/2026 – 12/09/2026");
    expect(texto).not.toContain("Fecha del vuelo: 12/09/2026");
    // Sin hora, ni la del vuelo ni la del tramo del que se derivó.
    expect(texto).not.toContain("11:30");
    expect(texto).not.toContain("08:00");
    // El operador sí ve de dónde salió la fecha impresa (croma de edición).
    expect(html).toContain("impreso: tramo 2");
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
    expect(html).toMatch(/cot-sel[^"]*cot-sel--vacio[^>]*>Selecciona cliente</);
    expect(html).toMatch(/cot-fecha__texto cot-fecha__texto--vacio">Por confirmar</);
  });

  it("«+ nuevo cliente» va EN LA LÍNEA del cliente (.meta, croma data-cot-ui, con espacio antes del «·»)", () => {
    const html = renderToString(<QuoteSheet {...hoja1().props()} clienteExtra={clienteExtra} />);
    const meta = html.slice(html.indexOf('class="meta"'), html.indexOf('class="route'));
    expect(meta).toMatch(
      /<span class="cot-acciones" data-cot-ui=""> <span class="cot-sep">·<\/span><button[^>]*class="cot-liga[^"]*"[^>]*>\+ nuevo cliente<\/button><\/span>/,
    );
    // Nunca en el margen del papel (a 12 px se salía de la hoja).
    expect(meta).not.toContain("cot-margen");
  });
});

// ---------- Atajos a «Interno › Tarifa y horas» (feedback 9-sep-2026) ----------

/**
 * Tarifa y horas NO se editan en la hoja: solo se SEÑALAN con croma
 * (`data-cot-ui`) que llama `onAbrirInterno`. Nada de esto se imprime ni
 * cambia el texto impreso; en lectura no existe.
 */
describe("atajos a Interno › Tarifa y horas (solo edición, nada impreso)", () => {
  const conAtajo = () => ({ ...hoja1().props(), onAbrirInterno: () => undefined });

  it("«· ajustar» en la línea de Servicio aéreo (toggle de tarifa encendido: la etiqueta impresa ya trae h × $/hr)", () => {
    const html = renderToString(<QuoteSheet {...conAtajo()} />);
    expect(html).toMatch(
      /Servicio aéreo \(2\.4 h × \$1,650\.00\/hr\)<span class="cot-acciones" data-cot-ui=""> <span class="cot-sep">·<\/span><button[^>]*class="cot-liga[^"]*"[^>]*>ajustar<\/button><\/span>/,
    );
    // El texto impreso de la hoja sigue idéntico al del PDF.
    expect(sinEspacios(textoImpreso(parsearHoja(html), true))).toBe(
      sinEspacios(colapsar(textoImpreso(parsearHoja(hoja1().html), false))),
    );
    expect(tokens(parsearHoja(html))).toEqual(tokens(parsearHoja(hoja1().html)));
  });

  it("toggle de tarifa apagado: la marca antepone las horas × tarifa del breakdown", () => {
    const p = conAtajo();
    p.valores = { ...p.valores, pdf_mostrar_tarifa: false };
    const html = renderToString(<QuoteSheet {...p} />);
    expect(html).toContain(">2.40 h × $1,650.00/hr · ajustar</button>");
    expect(html).toContain('<td class="lbl">Servicio aéreo<span class="cot-acciones"');
  });

  it("sin onAbrirInterno no hay «ajustar»; en lectura tampoco (ni marcas de horas)", () => {
    expect(renderToString(<QuoteSheet {...hoja1().props()} />)).not.toContain("ajustar");
    const lectura = renderToString(<QuoteSheet {...conAtajo()} lectura />);
    expect(lectura).not.toContain("ajustar");
    expect(lectura).not.toContain("cot-marca--horas");
  });

  it("itinerario: marca «—» por tramo sin breakdown.tramos; con tramos, las horas del motor (mismos extremos)", () => {
    const sin = renderToString(<QuoteSheet {...conAtajo()} />);
    expect(sin.match(/cot-marca--horas[^>]*>—<\/button>/g)?.length).toBe(3);

    const p = conAtajo();
    p.breakdown = {
      ...p.breakdown!,
      tramos: [
        { orden: 1, origen: "CUN", destino: "HOL", millas: 60, pasajeros: 4, es_ferry: false, tiempo_hr: 0.4833, tuas_usd: 100 },
        // Breakdown atrasado: el tramo 2 ya no coincide con la fila (HOL → CZM) → «—».
        { orden: 2, origen: "HOL", destino: "CUN", millas: 80, pasajeros: 4, es_ferry: false, tiempo_hr: 0.5944, tuas_usd: 0 },
      ],
    } as QuoteBreakdown;
    const con = renderToString(<QuoteSheet {...p} />);
    expect(con).toMatch(/cot-marca--horas[^>]*>0\.48 h<\/button>/);
    expect(con.match(/cot-marca--horas[^>]*>—<\/button>/g)?.length).toBe(2);
    // Sigue siendo croma: la estructura y el texto impreso no cambian.
    expect(tokens(parsearHoja(con))).toEqual(tokens(parsearHoja(hoja1().html)));
  });
});
