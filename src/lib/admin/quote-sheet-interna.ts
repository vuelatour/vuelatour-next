/**
 * HOJA INTERNA de la cotización — helpers PUROS (22-sep-2026).
 *
 * Pedido del cliente: «en la página de la cotización cambiaremos el formato
 * de la pantalla para que NO se vea como el PDF de la cotización que se
 * entrega al cliente, más bien que se parezca a la cotización INTERNA, que es
 * la más completa […] aprovechando que el formato es igual al que manejaban
 * antes en un Excel». La hoja interna pasa a ser el FORMULARIO y el PDF del
 * cliente una SALIDA (pestaña de solo lectura).
 *
 * Este módulo es el espejo de los formatos de `cotizacion_interna_pdf.py`
 * (`_hhmm`, `_millas`, `_horas`, `_dia_mes`, `_dia_largo`, `_pct_banco`,
 * `_monto`, `_metodo_previsto_txt`, la celda RUTA de `_tramo_fila` y el pie
 * de `_tramos_html`). Si allá cambia un formato, aquí también o la pantalla
 * y el papel dirán dos cosas distintas del MISMO vuelo.
 *
 * REGLA QUE MANDA SOBRE TODAS (riesgo 10 del diseño): aquí NO se calcula
 * dinero. `tiempo × tarifa`, la Σ de la tabla y el ajuste con su motivo
 * vienen del API (`tramos-costeados.util.ts`, campos ADITIVOS del breakdown
 * y del payload de `/interno`) — la ÚNICA aritmética permitida es re-sumar la
 * columna INFORMATIVA de millas, exactamente como hace pyservices.
 *
 * PURO: sin React, sin `lib/format`. Probado en
 * `__tests__/quote-sheet-interna.test.ts`.
 */

import type { QuoteBreakdown, TramoBreakdown } from "@/types/quote";

/**
 * Roles que pueden ver la COTIZACIÓN INTERNA — espejo EXACTO de
 * `ROLES_PDF_INTERNO` del API (`quotes.controller.ts`), que gobierna a la vez
 * `POST /v1/quotes/:id/pdf-interno` y `GET /v1/quotes/:id/interno`.
 *
 * Sin SOCIO ni PILOTO: el dato interno (costo por tramo, comisión del
 * vendedor, cobros con su neto, notas internas) no se le enseña a quien no
 * puede imprimirlo. Si la PANTALLA usara otro criterio, expondría a SOCIO lo
 * que el API le niega en PDF (riesgo 8 del diseño). El panel solo ESCONDE; el
 * gate real es el API (403 ⇒ `getQuoteInterno` devuelve null).
 */
export const ROLES_HOJA_INTERNA: ReadonlySet<string> = new Set([
  "ADMIN",
  "COORDINADOR",
  "FACTURACION",
  "ANALISTA",
]);

/** ¿Este rol ve la hoja interna? Sin rol (aún no se supo) NO: se asume lo menos. */
export function puedeVerHojaInterna(rol: string | null | undefined): boolean {
  return !!rol && ROLES_HOJA_INTERNA.has(rol.toUpperCase());
}

/** Banda roja del documento: lo único que impide mandárselo al cliente. */
export const BANDA_INTERNA =
  "Cotización interna · uso exclusivo de oficina · no enviar al cliente";

/** Marca de agua diagonal, EXCLUSIVA de la pantalla (el PDF no la lleva). */
export const MARCA_AGUA_INTERNA = "INTERNA";

/** Nota al pie de la tabla de tramos (`NOTA_TRAMOS` de pyservices). */
export const NOTA_TRAMOS = "Tiempo de vuelo en hh:mm e incluye calzos";

/** Celda vacía: el documento interno escribe «—», nunca un 0 inventado. */
export const SIN_DATO = "—";

/**
 * Guion LARGO de la abreviatura «CUN–PCE» (decisión 5 del diseño: es lo que
 * ya está impreso en todas las cotizaciones y lo congelan los tests de
 * pyservices). No confundir con el guion corto del teclado.
 */
export const GUION_RUTA = "–";

/** Signo MENOS tipográfico (`&minus;`), el que usa `_monto`. */
export const SIGNO_MENOS = "−";

const MESES_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const fmt2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * `_monto`: monto con signo tipográfico — los negativos (descuento, ajuste a
 * la baja) con «−», no con el guion del teclado.
 */
export function montoInterno(v: number | string | null | undefined): string {
  const n = numOrNull(v) ?? 0;
  return n < 0 ? `${SIGNO_MENOS}$${fmt2.format(-n)}` : `$${fmt2.format(n)}`;
}

/** `_money`: «$1,650.00» siempre con su signo natural. */
export function moneyInterno(v: number | string | null | undefined): string {
  const n = numOrNull(v) ?? 0;
  return `${n < 0 ? "-" : ""}$${fmt2.format(Math.abs(n))}`;
}

/**
 * `_hhmm`: horas decimales → «01:18». El API ya manda `tiempo_hhmm` por
 * tramo; esto solo se usa cuando ese campo no viaja (API previo).
 */
export function hhmm(h: number | null | undefined): string {
  const n = numOrNull(h);
  if (n === null) return SIN_DATO;
  const m = Math.max(0, Math.round(n * 60));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `_millas`: «157» · «157.3» · «—». Nunca ceros de cola. */
export function millasTxt(v: number | null | undefined): string {
  const n = numOrNull(v);
  if (n === null) return SIN_DATO;
  const txt = n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return txt.endsWith(".0") ? txt.slice(0, -2) : txt;
}

/** `_horas`: «2.40 h» · «—». */
export function horasTxt(v: number | null | undefined, dec = 2): string {
  const n = numOrNull(v);
  return n === null ? SIN_DATO : `${n.toFixed(dec)} h`;
}

/**
 * Día de PARED tal cual si ya viene «YYYY-MM-DD»; un instante ISO se lleva a
 * su día en Cancún. Convertir un día suelto lo movería hacia atrás — el mismo
 * cuidado que `_dia_pared` de pyservices.
 */
export function diaPared(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length === 10 && !s.includes("T")) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun" }).format(d);
}

/** `_dia_mes`: el día del tramo como lo escribe administración («26-jun»). */
export function diaMes(s: string | null | undefined): string {
  const dia = diaPared(s);
  if (!dia) return SIN_DATO;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  if (!m) return dia;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return dia;
  return `${Number(m[3])}-${MESES_ES[mes - 1]}`;
}

/** `_dia_largo`: «26 jun 2026»; cadena vacía si no hay fecha. */
export function diaLargo(s: string | null | undefined): string {
  const dia = diaPared(s);
  if (!dia) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  if (!m) return dia;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return dia;
  return `${Number(m[3])} ${MESES_ES[mes - 1]} ${m[1]}`;
}

const cobroFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Cancun",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * `_fecha_corta(s, con_anio=True)`: instante ISO → «22/09/2026 14:30» en hora
 * Cancún. Un DÍA de pared («2026-09-22») NO se convierte (movería el día) y
 * sale «22/09/2026». Sin fecha, «—».
 */
export function fechaCortaCobro(s: string | null | undefined): string {
  if (!s) return SIN_DATO;
  if (s.length === 10 && !s.includes("T")) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  // en-GB con hour12:false devuelve «22/09/2026, 14:30»: la coma no está en
  // el formato de Python.
  return cobroFmt.format(d).replace(", ", " ");
}

/**
 * `_pct_banco`: % de comisión bancaria como lo escribe la oficina — 2
 * decimales si no hay más precisión («2.90 %») y 4 si la hay («8.8570 %»,
 * la foto del cliente). Llega en PUNTOS porcentuales.
 */
export function pctBanco(v: number | null | undefined): string {
  const n = numOrNull(v);
  if (n === null) return SIN_DATO;
  const dec = Math.round(n * 100) / 100 === Math.round(n * 10000) / 10000 ? 2 : 4;
  return `${n.toFixed(dec)} %`;
}

/** Python `:g` para el % de terminal («8.857 %», «3 %»). */
export function pctG(v: number | null | undefined): string {
  const n = numOrNull(v);
  if (n === null) return "";
  return String(Number(n.toPrecision(6)));
}

/**
 * `_metodo_previsto_txt`: «previsto: Transferencia · comisión terminal
 * 8.857 %» para la cabecera del bloque COBROS. NO es decorativo — es el campo
 * que decide si la cotización lleva IVA 16 % o 0 %, y el ÚNICO lugar del
 * documento donde se ve el % de TERMINAL pactado (distinto de la comisión
 * BANCARIA de cada cobro). Sin método ⇒ cadena vacía.
 */
export function metodoPrevistoTxt(v: {
  metodoLabel?: string | null;
  metodo?: string | null;
  comisionBillpocketPct?: number | null;
}): string {
  const metodo = (v.metodoLabel || v.metodo || "").trim();
  if (!metodo) return "";
  let txt = `previsto: ${metodo}`;
  const pct = numOrNull(v.comisionBillpocketPct);
  if (pct) txt += ` · comisión terminal ${pctG(pct)} %`;
  return txt;
}

/** `_hay_ajuste`: medio centavo de tolerancia, igual que pyservices. */
export function hayAjuste(ajusteUsd: number | null | undefined): boolean {
  const n = numOrNull(ajusteUsd);
  return n !== null && Math.abs(n) >= 0.005;
}

/** Motivo del ajuste con su respaldo («Ajuste de horas»). */
export function motivoAjuste(motivo: string | null | undefined): string {
  return (motivo || "").trim() || "Ajuste de horas";
}

// ===== Celda RUTA de la tabla de tramos =====

export interface CeldaRutaTramo {
  /** «CUN–PCE» (guion largo) o «» si no hay los dos IATA / es consolidado. */
  abreviatura: string;
  /** Nombre largo de respaldo («Cancun-Merida») o «». */
  largo: string;
  /** Lo que se IMPRIME: abreviatura si existe, si no el largo, si no «—». */
  texto: string;
  /** Marcas grises de la MISMA línea: «tramos consolidados · ferry · pernocta $150.00». */
  marcas: string;
}

/**
 * Celda RUTA de `_tramo_fila` (poda del 22-sep-2026): abre con la ABREVIATURA
 * y las marcas en gris en la misma línea (la fila baja de dos renglones a
 * uno).
 *
 * RESPALDO OBLIGATORIO (riesgo 4 del diseño): la abreviatura solo existe con
 * los DOS IATA y sin `consolidado`; si no, se conserva el nombre largo —
 * promoverla sin respaldo dejaría la fila consolidada SIN ruta.
 */
export function celdaRutaTramo(t: {
  ruta?: string | null;
  origen_iata?: string | null;
  destino_iata?: string | null;
  origen_nombre?: string | null;
  destino_nombre?: string | null;
  consolidado?: boolean;
  es_ferry?: boolean;
  pernocta?: boolean;
  pernocta_usd?: number | null;
}): CeldaRutaTramo {
  const o = (t.origen_iata || "").trim();
  const d = (t.destino_iata || "").trim();
  const largo =
    (t.ruta || "").trim() ||
    [(t.origen_nombre || o || "").trim(), (t.destino_nombre || d || "").trim()]
      .filter(Boolean)
      .join("-");
  const abreviatura = o && d && !t.consolidado ? `${o}${GUION_RUTA}${d}` : "";
  const marcas: string[] = [];
  if (t.consolidado) marcas.push("tramos consolidados");
  if (t.es_ferry) marcas.push("ferry");
  if (t.pernocta) {
    const costo = numOrNull(t.pernocta_usd);
    marcas.push(`pernocta${costo ? ` ${moneyInterno(costo)}` : ""}`);
  }
  return {
    abreviatura,
    largo,
    texto: abreviatura || largo || SIN_DATO,
    marcas: marcas.join(" · "),
  };
}

/**
 * Concepto de una TUA en el documento INTERNO (`_tua_fila`): «TUA CUN» y, en
 * gris, «4 pax × $25.00» (en pesos, «4 pax × $330.60 MXN = $1,322.40 MXN ·
 * T.C. 18.1»). La hoja del CLIENTE lo escribe al revés («TUA CUN · $25.00 ×
 * 4 pax», el texto del desglose canónico) — mismo dato, otro documento.
 *
 * Se parte en piezas para que el UNITARIO siga siendo un input invisible sin
 * alterar el texto impreso.
 */
export function piezasConceptoTuaInterna(
  f: {
    iata: string;
    pax: number | string;
    moneda: string;
    total_nativo?: number | string | null;
    tc_aplicado?: number | string | null;
  },
  /**
   * T.C. YA formateado con `fmtTc` (la fuente única del texto del tipo de
   * cambio; este módulo es puro y no importa `lib/format`). Sin él, una TUA
   * capturada en PESOS decía «4 pax × $330.60 MXN = $1,322.40 MXN» y el papel
   * «… · T.C. 18.1»: el dato que explica de dónde salen los $73.06.
   */
  tcTxt = "",
): { concepto: string; antes: string; despues: string } {
  const pax = numOrNull(f.pax) ?? 0;
  const mxn = (f.moneda || "USD").toUpperCase() === "MXN";
  let despues = "";
  if (mxn) {
    const total = numOrNull(f.total_nativo);
    despues = ` MXN = $${fmt2.format(total ?? 0)} MXN`;
    if (numOrNull(f.tc_aplicado) && tcTxt.trim()) despues += ` · T.C. ${tcTxt.trim()}`;
  }
  return {
    concepto: `TUA ${f.iata}`.trim(),
    antes: `${pctG(pax)} pax × $`,
    despues,
  };
}

// ===== Desglose CANÓNICO (el documento interno publica las líneas v1.3) =====

/**
 * CONCEPTO de la primera línea canónica con esa clave, tal como lo escribió el
 * motor y tal como lo IMPRIME el PDF interno (`_concepto_operacion` arranca de
 * `ln.concepto`). Es la única forma de que la pantalla y el papel digan lo
 * mismo: los conceptos canónicos traen dentro el nombre del vendedor
 * («Comisión del vendedor (Saab) · $50.00/hr × 2.3 hr»), el «(sin IVA)» de la
 * pernocta y «Descuento»/«Redondeo» del ajuste — redactarlos aquí a mano
 * produce otro texto para el MISMO renglón. `null` = el breakdown no trae esa
 * línea (API previo o snapshot legado) ⇒ quien llama usa su respaldo.
 */
export function conceptoCanonico(
  b: QuoteBreakdown | null | undefined,
  clave: string,
): string | null {
  const ln = (b?.desglose ?? []).find((d) => (d.clave || "").toUpperCase() === clave);
  const txt = (ln?.concepto || "").trim();
  return txt || null;
}

/**
 * `_concepto_operacion` (clave COMISION_VENDEDOR): el concepto canónico y, si
 * el NOMBRE del vendedor no viene ya dentro, se le cuelga con « · ». Pegar
 * siempre el nombre duplicaría «Comisión del vendedor (Saab) · Saab».
 */
export function conceptoComisionVendedor(
  conceptoCanon: string | null,
  nombre: string | null | undefined,
): string {
  const concepto = (conceptoCanon || "").trim() || "Comisión del vendedor";
  const n = (nombre || "").trim();
  if (n && !concepto.toLowerCase().includes(n.toLowerCase())) return `${concepto} · ${n}`;
  return concepto;
}

/**
 * Aclaración gris de la fila «Total MXN» del documento interno: el T.C. y —lo
 * que la hoja del cliente nunca dice— cuánto del total en pesos NO pasó por
 * el tipo de cambio porque se capturó nativo en MXN (TUAS y extras). Son 14 de
 * 231 cotizaciones en prod: sin esta frase la oficina no puede cuadrar el
 * total en pesos contra el T.C. Espejo de `_desglose_html`.
 */
export function opTotalMxnInterna(
  tcTxt: string,
  mxnNativos: number | null | undefined,
): string {
  const partes: string[] = [];
  const tc = (tcTxt || "").trim();
  if (tc) partes.push(`T.C. ${tc}`);
  const nativos = numOrNull(mxnNativos);
  if (nativos) partes.push(`incluye $${fmt2.format(nativos)} MXN nativos`);
  return partes.join(" · ");
}

/** Σ de las líneas canónicas con esa clave; null si el breakdown no trae desglose. */
export function lineaCanonicaUsd(
  b: QuoteBreakdown | null | undefined,
  clave: string,
): number | null {
  const lineas = b?.desglose;
  if (!lineas) return null;
  const propias = lineas.filter((d) => (d.clave || "").toUpperCase() === clave);
  if (propias.length === 0) return null;
  return (
    Math.round(propias.reduce((acc, d) => acc + (numOrNull(d.monto_usd) ?? 0), 0) * 100) / 100
  );
}

/**
 * `_servicio_aereo_usd`: la línea TIEMPO_VUELO canónica — el ANCLA de la
 * tabla de tramos (`Σ tramos + ajuste == servicio aéreo`). Sin líneas, el
 * escalar espejo `subtotal_vuelo_usd`. **Nunca se suma aquí.**
 *
 * OJO, no confundir con `servicioAereoImpresoUsd` (la hoja del CLIENTE):
 * aquel ABSORBE el redondeo y la comisión del vendedor porque el cliente no
 * los ve; el documento interno los publica en SU renglón.
 */
export function servicioAereoCanonicoUsd(b: QuoteBreakdown | null | undefined): number | null {
  if (!b) return null;
  return lineaCanonicaUsd(b, "TIEMPO_VUELO") ?? (numOrNull(b.totales?.subtotal_vuelo_usd) ?? null);
}

/**
 * Comisión del VENDEDOR con su renglón propio (solo documento interno). Manda
 * la línea canónica; sin desglose, el eco del motor (`meta`).
 */
export function comisionVendedorCanonicaUsd(
  b: QuoteBreakdown | null | undefined,
): number | null {
  if (!b) return null;
  const canonica = lineaCanonicaUsd(b, "COMISION_VENDEDOR");
  if (canonica !== null) return canonica;
  return numOrNull(b.meta?.comision_vendedor_usd);
}

/**
 * Operación gris de la comisión del vendedor: «2.40 h × $50.00/hr · pago al
 * vendedor c/IVA $139.20» (espejo de `_concepto_operacion`, clave
 * COMISION_VENDEDOR). Todos los números llegan del motor.
 */
export function opComisionVendedor(v: {
  modo?: string | null;
  horas?: number | null;
  tarifaHr?: number | null;
  pagoVendedorUsd?: number | null;
  conIva?: boolean;
}): string {
  const partes: string[] = [];
  const modo = (v.modo || "").toUpperCase();
  const horas = numOrNull(v.horas);
  const tarifa = numOrNull(v.tarifaHr);
  if (modo === "POR_HORA" && horas !== null && tarifa !== null) {
    partes.push(`${horas.toFixed(2)} h × ${moneyInterno(tarifa)}/hr`);
  } else if (modo === "FIJA") {
    partes.push("fija");
  }
  const pago = numOrNull(v.pagoVendedorUsd);
  if (pago !== null) {
    partes.push(`pago al vendedor${v.conIva ? " c/IVA" : ""} ${moneyInterno(pago)}`);
  }
  return partes.join(" · ");
}

/**
 * AJUSTE canónico POSITIVO (redondeo automático / precio pactado). En la hoja
 * del cliente se absorbe dentro de «Servicio aéreo»; aquí se publica, o la
 * columna del documento interno no sumaría. Negativo ⇒ null (es el DESCUENTO,
 * que tiene su propio renglón editable).
 */
export function ajustePositivoUsd(b: QuoteBreakdown | null | undefined): number | null {
  const ajuste = numOrNull(b?.totales?.ajuste_final_usd);
  return ajuste !== null && ajuste > 0.005 ? ajuste : null;
}

// ===== Pie de la tabla «Tramos cotizados» =====

export interface PieTramos {
  /**
   * Σ de millas: la ÚNICA aritmética permitida (columna informativa) y solo
   * si TODOS los tramos la traen, igual que pyservices. «» cuando falta alguna.
   */
  millas: string;
  /** Σ del tiempo como «02:36»; «—» con un API previo. */
  tiempo: string;
  /** Σ de la columna TOTAL; null = el API no lo mandó ⇒ la celda pinta «—». */
  totalUsd: number | null;
  /** Ajuste contra la línea canónica, con su motivo; null = sin ajuste o sin dato. */
  ajusteUsd: number | null;
  ajusteMotivo: string;
  /** Σ tramos + ajuste = «Servicio aéreo» (viene del breakdown, no se suma aquí). */
  servicioAereoUsd: number | null;
  /** ¿Se pinta la pareja ajuste + «Servicio aéreo»? */
  hayAjuste: boolean;
}

/**
 * Pie de la tabla desde los campos ADITIVOS del breakdown (API 0.0.27). Con
 * un API previo devuelve todo en «—»/null: la tabla se ve, el pie dice que no
 * sabe, y **nunca** se multiplica aquí para rellenarlo.
 *
 * `servicioAereoImpreso` lo pasa quien llama (`servicioAereoImpresoUsd` del
 * breakdown): es el número con el que tiene que cuadrar `Σ tramos + ajuste`.
 */
export function pieTramos(
  b: QuoteBreakdown | null | undefined,
  tramos: ReadonlyArray<Pick<TramoBreakdown, "millas">>,
  servicioAereoImpreso: number | null,
): PieTramos {
  const todasLasMillas =
    tramos.length > 0 && tramos.every((t) => numOrNull(t.millas) !== null);
  const millas = todasLasMillas
    ? millasTxt(tramos.reduce((acc, t) => acc + (numOrNull(t.millas) ?? 0), 0))
    : "";
  const totalUsd = numOrNull(b?.tramos_total_usd);
  const tiempoHhmm = (b?.tramos_tiempo_total_hhmm || "").trim();
  const tiempoHr = numOrNull(b?.tramos_tiempo_total_hr);
  const ajusteUsd = numOrNull(b?.tramos_ajuste_usd);
  return {
    millas,
    tiempo: tiempoHhmm || (tiempoHr !== null ? hhmm(tiempoHr) : SIN_DATO),
    totalUsd,
    ajusteUsd,
    ajusteMotivo: motivoAjuste(b?.tramos_ajuste_motivo),
    servicioAereoUsd: servicioAereoImpreso,
    hayAjuste: hayAjuste(ajusteUsd),
  };
}

/**
 * Notas al pie de la tabla («Tiempo de vuelo en hh:mm e incluye calzos (0.45 h
 * en total) · distancia en millas náuticas.»), espejo de `_tramos_html`.
 */
export function notasTramos(
  calzosHr: number | null | undefined,
  hayConsolidado: boolean,
): string {
  const calzos = numOrNull(calzosHr);
  const notas = [NOTA_TRAMOS + (calzos ? ` (${pctG(calzos)} h en total)` : "")];
  notas.push("distancia en millas náuticas");
  if (hayConsolidado) {
    notas.push("cotización sin desglose por tramo: una sola fila con los totales");
  }
  return `${notas.join(" · ")}.`;
}

// ===== Ficha =====

/** «Piper Seneca V · N4142R»: en el documento interno la matrícula SIEMPRE se ve. */
export function avionCotizadoTxt(v: {
  modelo?: string | null;
  matricula?: string | null;
}): string {
  const partes = [v.modelo, v.matricula].map((p) => (p || "").trim()).filter(Boolean);
  return partes.join(" · ") || SIN_DATO;
}

/**
 * `_avion_utilizado_txt`: «N4142R · Piper Seneca V». TOLERANTE a propósito —
 * acepta el texto ya armado por el API o `{matricula, modelo}`; con cualquier
 * otra forma devuelve «» y la segunda línea no se pinta.
 */
export function avionUtilizadoTxt(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return ["matricula", "modelo"]
      .map((k) => (typeof o[k] === "string" ? (o[k] as string).trim() : ""))
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

/** «Tarifa pública · $1,650.00/hr» + marcas («tarifa preferencial del cliente · tarifa manual»). */
export function tarifaFicha(v: {
  tipoLabel?: string | null;
  tarifaUsdHr?: number | null;
  preferencial?: boolean;
  override?: boolean;
}): { texto: string; marcas: string } {
  let texto = (v.tipoLabel || "").trim() || SIN_DATO;
  const tarifa = numOrNull(v.tarifaUsdHr);
  if (tarifa !== null) texto += ` · ${moneyInterno(tarifa)}/hr`;
  const marcas: string[] = [];
  if (v.preferencial) marcas.push("tarifa preferencial del cliente");
  if (v.override) marcas.push("tarifa manual");
  return { texto, marcas: marcas.join(" · ") };
}

// ===== Cobros =====

/** Clase del punto del semáforo (`_SEMAFORO_CLASES`). */
export function claseSemaforo(color: string | null | undefined): string {
  switch ((color || "").toLowerCase()) {
    case "verde":
      return "sem-verde";
    case "amarillo":
      return "sem-amarillo";
    case "rojo":
      return "sem-rojo";
    default:
      return "sem-gris";
  }
}

/** Sub-línea gris de un cobro: «Reembolso · REF-12 · Paywise · Sobre G-4 …». */
export function subLineaCobro(c: {
  es_reembolso?: boolean;
  monto?: number | null;
  referencia?: string | null;
  cuenta_destino?: string | null;
  sobre_grupo_folio?: string | null;
  sobre_grupo_monto_total?: number | null;
  sobre_grupo_moneda?: string | null;
  grupo_factor?: number | null;
  notas?: string | null;
}): string {
  const sub: string[] = [];
  if (c.es_reembolso || (numOrNull(c.monto) ?? 0) < 0) sub.push("Reembolso");
  const ref = [c.referencia, c.cuenta_destino].map((p) => (p || "").trim()).filter(Boolean);
  if (ref.length > 0) sub.push(ref.join(" · "));
  if (c.sobre_grupo_folio) {
    let s = `Sobre ${c.sobre_grupo_folio}`;
    const total = numOrNull(c.sobre_grupo_monto_total);
    if (total !== null) s += ` ${moneyInterno(total)} ${c.sobre_grupo_moneda || ""}`.trimEnd();
    const factor = numOrNull(c.grupo_factor);
    if (factor !== null) s += ` × ${pctG(Math.round(factor * 100 * 100) / 100)} %`;
    sub.push(s);
  }
  const notas = (c.notas || "").trim();
  if (notas) sub.push(notas.length > 60 ? `${notas.slice(0, 60).trimEnd()}…` : notas);
  return sub.join(" · ");
}

/**
 * Pie del bloque COBROS: «Cobrado $X USD · comisiones banco −$Y · neto $Z ·
 * Saldo $W · ● Cobrado». Todos los números llegan del API (`/interno`); aquí
 * solo se ordenan las palabras.
 */
export function resumenCobros(v: {
  totalCobradoUsd: number;
  comisionBancoUsd?: number | null;
  totalCobradoNetoUsd?: number | null;
  saldoUsd?: number | null;
}): string[] {
  const partes = [`Cobrado ${montoInterno(v.totalCobradoUsd)} USD`];
  const comision = numOrNull(v.comisionBancoUsd);
  if (comision) {
    partes.push(`comisiones banco ${SIGNO_MENOS}${moneyInterno(comision)}`);
    const neto = numOrNull(v.totalCobradoNetoUsd);
    if (neto !== null) partes.push(`neto ${montoInterno(neto)}`);
  }
  const saldo = numOrNull(v.saldoUsd);
  if (saldo === null) {
    partes.push(`Saldo ${SIN_DATO}`);
  } else {
    partes.push(`Saldo ${montoInterno(saldo)}${saldo < -0.005 ? " (sobrecobro)" : ""}`);
  }
  return partes;
}

/** Aviso rojo de cobros en pesos sin T.C. (fuera de la suma); «» si no hay. */
export function avisoCobrosSinTc(count: number, mxn: number): string {
  if (!count) return "";
  const plural = count === 1 ? "cobro" : "cobros";
  return `OJO: ${count} ${plural} en MXN por $${fmt2.format(mxn)} SIN tipo de cambio: fuera de la suma.`;
}
