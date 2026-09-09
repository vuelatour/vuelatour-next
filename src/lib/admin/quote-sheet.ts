import type { EscalaInput, ExtraConcepto, QuoteBreakdown, TuasFila } from "@/types/quote";

/**
 * Helpers PUROS de la HOJA editable de cotización (`QuoteSheet`,
 * form-as-document 8-sep-2026). Replican EXACTAMENTE los formatos del
 * armador de pyservices (`cotizacion_pdf.py`): `_money`, `_fecha_legible`,
 * `_fecha_dia`, el tamaño de la ruta, la regla de la matrícula VGV y las
 * etiquetas del desglose — para que lo que el operador ve en la hoja sea
 * indistinguible del PDF. Sin React, sin red y SIN dinero calculado: los
 * montos vienen del breakdown de `/calculate` y aquí solo se pintan.
 */

/** Clase raíz de la hoja (= `cotizacion_pdf.CLASE_RAIZ`). */
export const CLASE_RAIZ_HOJA = "cot-hoja";
/** Ancho de la hoja en pantalla (= `PREVIEW_ANCHO_PX` de pyservices). */
export const HOJA_ANCHO_PX = 794;
/** Alto mínimo de la hoja (Carta 27.94 cm ≈ 1027 px). */
export const HOJA_ALTO_MIN_PX = 1027;
export const EMPRESA_DEFAULT = "VuelaTour — Aero Charter Cancún";
export const TZ_NOTA = "Horarios en hora de Cancún (UTC−5).";
/** Atributo que marca la CROMA de edición (no se imprime): el test de
 *  estructura descarta esos subárboles al comparar con el HTML del PDF. */
export const ATTR_UI = "data-cot-ui";

const moneyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `_money`: "$4,110.00" (agrupación en-US, 2 decimales, sin signo de moneda ISO). */
export function moneyPdf(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const s = moneyFmt.format(Math.abs(safe));
  return `${safe < 0 ? "-" : ""}$${s}`;
}

/** `${v:,.2f}` sin el símbolo (para " · $1,500.00 MXN" el símbolo va aparte). */
export function numero2(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return moneyFmt.format(Number.isFinite(n) ? n : 0);
}

/** Python `:g` (6 dígitos significativos, sin ceros de cola): 2.4 → "2.4", 18.1 → "18.1", 1 → "1". */
export function numeroG(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toPrecision(6)));
}

/** `{iva_pct:.0f}`: 16 → "16" (redondeo half-even de Python: 16.5 → "16"). */
export function porcentajeEntero(pct: number): string {
  if (!Number.isFinite(pct)) return "0";
  const piso = Math.floor(pct);
  const resto = pct - piso;
  const n = resto > 0.5 ? piso + 1 : resto < 0.5 ? piso : piso % 2 === 0 ? piso : piso + 1;
  return String(n === 0 ? 0 : n);
}

const CANCUN_TZ = "America/Cancun";
const legibleFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CANCUN_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * `_fecha_legible`: ISO (UTC o con zona) → "dd/mm/aaaa HH:MM" en hora
 * Cancún; vacío → "Por confirmar"; no parseable → el texto tal cual.
 */
export function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return "Por confirmar";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(
    legibleFmt.formatToParts(d).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  // en-GB puede dar "24" a medianoche en algunos motores: normaliza.
  const hh = p.hour === "24" ? "00" : p.hour;
  return `${p.day}/${p.month}/${p.year} ${hh}:${p.minute}`;
}

/**
 * Misma salida que `fechaLegible` pero desde el string de un input
 * `datetime-local` ya en PARED Cancún ("YYYY-MM-DDTHH:mm"): no hay que
 * convertir zona (el PDF recibe el ISO de `cancunInputToIso` y lo regresa a
 * Cancún = la misma pared).
 */
export function fechaLegibleDeInput(local: string | null | undefined): string {
  if (!local) return "Por confirmar";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/**
 * Fecha/hora impresa desde lo que guarda el form: un `datetime-local` de
 * pared Cancún ("YYYY-MM-DDTHH:mm") va directo; un ISO con zona/segundos
 * (escala cargada del API) se convierte a Cancún como `_fecha_legible`.
 */
export function fechaLegibleFlexible(v: string | null | undefined): string {
  if (!v) return "Por confirmar";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? fechaLegibleDeInput(v) : fechaLegible(v);
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `_fecha_dia`: "2026-09-03" → "3 sep 2026"; vacío → "" (la tabla pinta "—"). */
export function fechaDia(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return s;
  return `${Number(m[3])} ${MESES_ES[mes - 1]} ${m[1]}`;
}

/** Tamaño de la ruta grande según el número de puntos (regla del armador). */
export function rutaFontSize(nPuntos: number): "26px" | "20px" | "16px" {
  return nPuntos <= 4 ? "26px" : nPuntos <= 6 ? "20px" : "16px";
}

/** `_mostrar_matricula`: solo el VGV se comercializa por matrícula. */
export function mostrarMatricula(matricula: string | null | undefined): boolean {
  return !!matricula && matricula.toUpperCase().includes("VGV");
}

/** Ficha del avión EXTERNO tal como la imprime el API ("MODELO · MATRÍCULA"). */
export function avionExternoTexto(
  esExterno: boolean,
  modelo: string | null | undefined,
  matricula: string | null | undefined,
): string | null {
  if (!esExterno) return null;
  const t = [modelo?.trim(), matricula?.trim()].filter((x): x is string => !!x).join(" · ");
  return t || null;
}

/**
 * `_modelos_cotizados` de pyservices: limpia espacios, quita repetidos
 * (sin distinguir mayúsculas, conservando el orden) y descarta cualquier
 * texto que contenga la matrícula (jamás se imprime una matrícula ahí).
 */
export function modelosCotizadosPdf(
  crudos: ReadonlyArray<string | null | undefined>,
  matricula?: string | null,
): string[] {
  const mat = (matricula ?? "").trim().toUpperCase();
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const m of crudos) {
    const t = (m ?? "").trim();
    if (!t || (mat && t.toUpperCase().includes(mat))) continue;
    const k = t.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  return out;
}

export interface TramoVisible {
  /** Índice en el form (0..N-1). */
  idx: number;
  /** Orden RENUMERADO 1..N entre los visibles (el badge del mapa y la tabla). */
  orden: number;
  leg: EscalaInput;
}

/**
 * Tramos VISIBLES renumerados 1..N (misma regla que `escalasVisiblesPdf`
 * del API): los ocultos salen y el cliente jamás ve la posición original.
 */
export function tramosVisibles(
  legs: EscalaInput[],
  oculto: (idx: number, leg: EscalaInput) => boolean,
): TramoVisible[] {
  const out: TramoVisible[] = [];
  legs.forEach((leg, idx) => {
    if (oculto(idx, leg)) return;
    out.push({ idx, orden: out.length + 1, leg });
  });
  return out;
}

/** Puntos de la ruta grande (walk tolerante a huecos, como `puntosRutaVisible`). */
export function puntosRutaVisibles(visibles: TramoVisible[]): string[] {
  const puntos: string[] = [];
  for (const { leg } of visibles) {
    const o = (leg.origen_iata ?? "").trim();
    const d = (leg.destino_iata ?? "").trim();
    if (o && o !== puntos[puntos.length - 1]) puntos.push(o);
    if (d) puntos.push(d);
  }
  return puntos;
}

/** Fecha de traslado tal como la IMPRIME el PDF (ver `fechasTrasladoImpresas`). */
export interface FechaTrasladoImpresa {
  /** Texto impreso ("dd/mm/aaaa HH:MM" o "Por confirmar"). */
  texto: string;
  /**
   * Índice del tramo VISIBLE del que se tomó la fecha cuando el primer/último
   * tramo real está oculto; null = es el campo del vuelo (editable).
   */
  tramoIdx: number | null;
}

/**
 * Fechas de traslado como las imprime el PDF (`escalasVisiblesPdf` del API):
 * si el PRIMER/ÚLTIMO tramo real quedó oculto (`pdf_oculto`), la fecha del
 * vuelo delataría un tramo que el cliente no debe ver, así que se imprime la
 * salida planeada del primer/último tramo VISIBLE. Misma cascada que
 * `quoteLikeParaPreview`/`replaceEscalas` para el plan de un tramo:
 * `fecha_salida_plan` ?? (1º → fecha_vuelo | último → fecha_traslado_final)
 * ?? la fecha del vuelo. Sin ocultos en los extremos: los campos del vuelo.
 */
export function fechasTrasladoImpresas(
  v: { fecha_vuelo: string; fecha_traslado_final: string; escalas: EscalaInput[] },
  oculto: (idx: number, leg: EscalaInput) => boolean,
): { inicial: FechaTrasladoImpresa; final: FechaTrasladoImpresa } {
  const n = v.escalas.length;
  const visibles = tramosVisibles(v.escalas, oculto);
  const planDe = (idx: number): string | null => {
    const propio = v.escalas[idx]?.fecha_salida_plan;
    if (typeof propio === "string" && propio) return propio;
    if (idx === 0 && v.fecha_vuelo) return v.fecha_vuelo;
    if (idx === n - 1 && v.fecha_traslado_final) return v.fecha_traslado_final;
    return null;
  };
  let inicial: FechaTrasladoImpresa = { texto: fechaLegibleFlexible(v.fecha_vuelo), tramoIdx: null };
  let final: FechaTrasladoImpresa = { texto: fechaLegibleFlexible(v.fecha_traslado_final), tramoIdx: null };
  if (visibles.length > 0) {
    const primera = visibles[0].idx;
    if (primera !== 0) {
      const plan = planDe(primera);
      if (plan) inicial = { texto: fechaLegibleFlexible(plan), tramoIdx: primera };
    }
    const ultima = visibles[visibles.length - 1].idx;
    if (ultima !== n - 1) {
      const plan = planDe(ultima);
      if (plan) final = { texto: fechaLegibleFlexible(plan), tramoIdx: ultima };
    }
  }
  return { inicial, final };
}

/**
 * «Servicio aéreo» tal como se IMPRIME (misma composición que
 * `quotes-pdf.service.armarPayloadPdf`): subtotal del vuelo + redondeo hacia
 * arriba (ajuste > 0) + Σ comisión del vendedor (absorbida). Solo se suman
 * números del motor. null sin breakdown.
 */
export function servicioAereoImpresoUsd(b: QuoteBreakdown | null): number | null {
  if (!b) return null;
  // SOLO las líneas canónicas (como el API): un snapshot sin `desglose` no
  // absorbe nada — `meta.comision_vendedor_usd` no cuenta.
  const comision = (b.desglose ?? [])
    .filter((d) => d.clave === "COMISION_VENDEDOR")
    .reduce((acc, d) => acc + (Number(d.monto_usd) || 0), 0);
  const redondeo = Math.max(0, Number(b.totales.ajuste_final_usd) || 0);
  return Math.round((Number(b.totales.subtotal_vuelo_usd) + redondeo + comision) * 100) / 100;
}

/** «Subtotal (sin IVA)» = total − IVA (misma resta del armador). */
export function subtotalSinIvaUsd(b: QuoteBreakdown | null): number | null {
  if (!b) return null;
  return Math.round((Number(b.totales.total_usd) - Number(b.totales.iva_usd)) * 100) / 100;
}

/** Descuento IMPRESO: |ajuste| solo si fue negativo (el redondeo nunca se lista). */
export function descuentoImpresoUsd(b: QuoteBreakdown | null): number {
  const ajuste = Number(b?.totales.ajuste_final_usd) || 0;
  return ajuste < 0 ? Math.abs(ajuste) : 0;
}

/**
 * Concepto de una fila de TUAS EXACTO al del desglose canónico del motor
 * (`quotes.service`): "TUA CUN · $25.00 × 4 pax" / "TUA PCE · $330.60 MXN ×
 * 4 pax = $1322.40 MXN". Se parte en piezas para que el unitario sea un
 * input invisible sin alterar el texto impreso.
 */
export function piezasConceptoTua(f: Pick<TuasFila, "iata" | "moneda" | "monto_pax" | "pax" | "total_nativo">): {
  antes: string;
  unitario: string;
  despues: string;
} {
  const antes = `TUA ${f.iata} · $`;
  const unitario = Number(f.monto_pax).toFixed(2);
  const despues =
    f.moneda === "MXN"
      ? ` MXN × ${f.pax} pax = $${Number(f.total_nativo).toFixed(2)} MXN`
      : ` × ${f.pax} pax`;
  return { antes, unitario, despues };
}

export function conceptoTua(f: Pick<TuasFila, "iata" | "moneda" | "monto_pax" | "pax" | "total_nativo">): string {
  const p = piezasConceptoTua(f);
  return `${p.antes}${p.unitario}${p.despues}`;
}

/** Etiqueta impresa de un extra: "{concepto}[ · ${nativo} MXN]" (`ExtraPdf`). */
export function etiquetaExtra(e: Pick<ExtraConcepto, "concepto" | "moneda" | "monto_nativo">): string {
  const base = e.concepto || "Extra";
  if (e.moneda === "MXN" && e.monto_nativo != null) {
    return `${base} · $${numero2(e.monto_nativo)} MXN`;
  }
  return base;
}

/**
 * `tuas_detalle` de un snapshot LEGADO (motor sin `tuas.filas`): los
 * conceptos de las líneas TUAS del desglose canónico, tal como los manda el
 * API al PDF. Con `filas` presentes devuelve [] (la hoja usa las filas).
 */
export function tuasDetalleLegado(b: QuoteBreakdown | null): string[] {
  if (!b || b.tuas.filas) return [];
  return (b.desglose ?? [])
    .filter((d) => d.clave === "TUAS" && typeof d.concepto === "string" && d.concepto)
    .map((d) => d.concepto);
}

/** Extra sintetizado por el motor (comisión BillPocket): no se edita. */
export function esExtraSintetizado(e: Pick<ExtraConcepto, "concepto">): boolean {
  return (e.concepto ?? "").startsWith("Comisión BillPocket");
}

/**
 * Monto IMPRESO (USD) y nativo de un extra capturado: el eco del motor
 * (`breakdown.extras`, mismo índice y concepto) manda; sin eco (sin
 * breakdown, MXN sin TC, a medio teclear) cae al capturado.
 */
export function montoExtraImpreso(
  e: ExtraConcepto,
  idx: number,
  b: QuoteBreakdown | null,
): { monto_usd: number; monto_nativo: number | null } {
  const eco = b?.extras?.[idx];
  if (eco && (eco.concepto ?? "") === (e.concepto ?? "")) {
    return {
      monto_usd: Number(eco.monto_usd) || 0,
      monto_nativo: eco.monto_nativo != null ? Number(eco.monto_nativo) : null,
    };
  }
  const nativo = Number(e.monto_usd) || 0;
  return {
    monto_usd: e.moneda === "MXN" ? 0 : nativo,
    monto_nativo: e.moneda === "MXN" ? nativo : null,
  };
}

/**
 * `<svg …>…</svg>` del mapa dentro del HTML de la vista previa (reutiliza
 * el mapa del PDF guardado sin pedirlo otra vez). null si no hay mapa.
 */
export function extraerMapaSvgDeHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const i = html.indexOf('<div class="mapa">');
  if (i < 0) return null;
  const ini = html.indexOf("<svg", i);
  const fin = html.indexOf("</svg>", ini);
  if (ini < 0 || fin < 0) return null;
  return html.slice(ini, fin + "</svg>".length);
}

/** Tramo mínimo que viaja a `POST /api/quotes/mapa-svg`. */
export interface TramoMapaPayload {
  origen_iata: string;
  destino_iata: string;
  es_ferry?: boolean;
  pdf_oculto?: boolean;
}

/** Tramos con extremos capturados, tal cual (el API filtra ocultos y renumera). */
export function tramosParaMapa(
  legs: EscalaInput[],
  oculto: (idx: number, leg: EscalaInput) => boolean,
): TramoMapaPayload[] {
  const out: TramoMapaPayload[] = [];
  legs.forEach((l, idx) => {
    const o = (l.origen_iata ?? "").trim();
    const d = (l.destino_iata ?? "").trim();
    if (o.length < 3 || d.length < 3) return;
    out.push({
      origen_iata: o,
      destino_iata: d,
      ...(l.es_ferry === true ? { es_ferry: true } : {}),
      ...(oculto(idx, l) ? { pdf_oculto: true } : {}),
    });
  });
  return out;
}
