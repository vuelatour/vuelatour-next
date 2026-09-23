import type { EscalaInput, ExtraConcepto, QuoteBreakdown, TramoBreakdown, TuasFila } from "@/types/quote";

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
/**
 * CANAL de croma a la IZQUIERDA del papel, en píxeles (pedido del cliente,
 * 22-sep-2026 noche): el margen de fila (`.cot-margen`, `right: 100 %`) vive
 * FUERA del área impresa —🗑, ⋯ y las marcas de pax/ferry/pernocta/nota— y el
 * papel solo tiene su padding donde apoyarse. Con la hoja pegada al borde del
 * contenedor (laptop de 1280 px con la barra lateral abierta) esas acciones
 * quedaban CORTADAS: «se pierde el botón o la opción que está del lado
 * izquierdo que solo se alcanza a ver COBRAN».
 *
 * Lo reservan las DOS hojas como `padding-left` de su escenario y lo
 * descuentan del ancho ANTES de escalar (`clientWidth` incluye el padding),
 * así el papel nunca se sale por la derecha. En LECTURA no hay croma que
 * alojar y el canal es 0.
 *
 * POR QUÉ 88. El margen más cargado que se ve de verdad —el tramo 4 de la
 * #232: ferry + pernocta + servicio + nota + oculto en el PDF— mide
 * 🗑 (18) + ⋯ (18) + 5 marcas de 11 px, con 6 huecos de 3 px y 6 px de aire
 * ⇒ **~116 px**, y en la hoja del CLIENTE hay que sumarle el botón de HORAS
 * del tramo («3.68 h», ~36 px con su hueco), que la interna no lleva ⇒
 * **~152 px**. El papel presta su propio padding (45 px el interno, 74 px el
 * del cliente) y el resto sale del canal: 88 + 45 = 133 y 88 + 74 = 162, con
 * holgura en las dos. (Un tramo con TODAS las marcas a la vez no existe:
 * `sobrevuelo` exige mismo origen y destino y «NM?» exige que falten las
 * millas — y a los anchos de trabajo el centrado del papel regala de sobra.)
 *
 * Y el canal **ESCALA CON EL PAPEL** (`geometriaHoja`): el margen se encoge
 * con la hoja, así que un canal FIJO sobra en pantallas angostas —le robaría
 * un cuarto del ancho a un contenedor de 358 px— y se queda corto justo en el
 * punto donde la hoja deja de escalar (ahí el papel presta su padding SIN
 * escalar pero el canal tampoco crece; con los 72 px del primer intento, un
 * contenedor de 866–888 px cortaba la croma). Escalándolo, la cuenta
 * `canal + padding·s ≥ margen·s` se cumple en TODOS los anchos.
 */
export const CANAL_CROMA_PX = 88;

/**
 * GEOMETRÍA de una hoja en pantalla: cuánto canal de croma se reserva a la
 * izquierda y con qué escala se pinta el papel. PURA, para que las dos hojas
 * (cliente e interna) resuelvan lo mismo y se pueda probar sin DOM.
 *
 * `anchoDisponible` es el `clientWidth` del escenario, que **incluye** el
 * padding del canal; por eso el papel se escala contra `anchoUtil`.
 *
 * Con `anchoDisponible ≥ anchoHoja + CANAL_CROMA_PX` la hoja va a tamaño
 * real y el canal es el completo. Por debajo, los dos se encogen a la vez
 * con el MISMO factor `s = anchoDisponible / (anchoHoja + CANAL)`, que es la
 * solución de `s·anchoHoja + CANAL·s = anchoDisponible`: el papel nunca se
 * sale por la derecha y el canal nunca sobra de más.
 */
export function geometriaHoja({
  anchoDisponible,
  anchoHoja,
  lectura = false,
  escala,
  canalPx = CANAL_CROMA_PX,
}: {
  anchoDisponible: number;
  anchoHoja: number;
  /** En lectura no se monta croma: canal 0. */
  lectura?: boolean;
  /** Escala impuesta por quien llama (tiene prioridad). */
  escala?: number;
  /**
   * Canal que reserva ESTA hoja. La hoja INTERNA pasa **0** desde el
   * 22-sep-2026: su croma (🗑, ⋯ y las marcas del tramo) ya no vive en el
   * margen sino DENTRO del papel, al inicio de la celda —el cliente seguía
   * viendo los «3 puntitos» cortados por el borde— así que un canal vacío
   * solo le robaría ancho al documento. La hoja del CLIENTE conserva el
   * canal: su itinerario sigue pintando el margen (con el botón de HORAS,
   * que no cabe en la línea).
   */
  canalPx?: number;
}): { canal: number; escalaEfectiva: number; anchoUtil: number } {
  const canalPleno = lectura ? 0 : Math.max(0, canalPx);
  // Todavía sin medir (SSR y primer render): hoja a tamaño real con el canal
  // completo, que es como se pintaba antes de este helper. Reservarlo desde
  // el principio evita que la croma salte de sitio al hidratar.
  if (!(anchoDisponible > 0)) {
    return { canal: canalPleno, escalaEfectiva: escala ?? 1, anchoUtil: 0 };
  }
  const s =
    escala ?? Math.min(1, anchoDisponible / (anchoHoja + canalPleno));
  const canal = Math.round(canalPleno * Math.min(1, s));
  const anchoUtil = Math.max(0, anchoDisponible - canal);
  return { canal, escalaEfectiva: s, anchoUtil };
}
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

/**
 * Python `:g` (6 dígitos SIGNIFICATIVOS, sin ceros de cola): 2.4 → "2.4",
 * 18.1 → "18.1", 1 → "1".
 *
 * SOLO para las HORAS (`{tiempo_cobrable_hr:g}` del armador). Para un TIPO DE
 * CAMBIO usa `fmtTc` de `@/lib/format` (hasta 6 DECIMALES): `:g` recortaba
 * 16.991632 a «16.9916» y la hoja dejaba de cuadrar con sus propios pesos
 * (vuelo #314, 17-sep-2026) — pyservices tampoco imprime ya el T.C. con `:g`.
 */
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

const cortaFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CANCUN_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * `_fecha_corta` (pyservices, 15-sep-2026): instante ISO → día de PARED en
 * Cancún "dd/mm/aaaa", SIN hora. Vacío → "" (el llamador NO pinta la línea;
 * nunca «Por confirmar»); un día suelto "YYYY-MM-DD" ya ES pared y no pasa
 * por la zona; texto no parseable → tal cual (React lo escapa).
 */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const txt = iso.trim();
  if (!txt) return "";
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt);
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  // Sin zona se asume UTC, como `_fecha_corta` (`datetime.fromisoformat` +
  // `replace(tzinfo=UTC)`); `new Date` a secas lo leería en la zona del
  // navegador y podría mover el día. Con hora de pared usa `fechaCortaFlexible`.
  const sinZona = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(txt);
  const d = new Date(sinZona ? `${txt.replace(" ", "T")}Z` : txt);
  if (Number.isNaN(d.getTime())) return txt;
  const p = Object.fromEntries(
    cortaFmt.formatToParts(d).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.day}/${p.month}/${p.year}`;
}

/**
 * Como `fechaCorta` pero desde lo que guarda el form: un `datetime-local` de
 * pared Cancún ("YYYY-MM-DDTHH:mm") se corta sin tocar la zona (el PDF recibe
 * el ISO de `cancunInputToIso` y lo regresa a Cancún = la misma pared); un ISO
 * con zona/segundos (escala cargada del API) sí se convierte.
 */
export function fechaCortaFlexible(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fechaCorta(v);
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
  /** Texto con hora ("dd/mm/aaaa HH:MM" o "Por confirmar"). SOLO edición: el
   * PDF del cliente ya no imprime horas (15-sep-2026). */
  texto: string;
  /**
   * Índice del tramo VISIBLE del que se tomó la fecha cuando el primer/último
   * tramo real está oculto; null = es el campo del vuelo (editable).
   */
  tramoIdx: number | null;
  /**
   * Valor CRUDO del que sale `texto` (datetime-local de pared o ISO del API);
   * "" sin dato. Es la MISMA fuente que el API manda como
   * `fecha_traslado_inicial`/`_final` al armador del PDF, así que la línea
   * «Fecha del vuelo» de `.meta` se construye de aquí (`fechaVueloImpresa`).
   */
  valor: string;
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
  let inicial: FechaTrasladoImpresa = {
    texto: fechaLegibleFlexible(v.fecha_vuelo),
    tramoIdx: null,
    valor: v.fecha_vuelo ?? "",
  };
  let final: FechaTrasladoImpresa = {
    texto: fechaLegibleFlexible(v.fecha_traslado_final),
    tramoIdx: null,
    valor: v.fecha_traslado_final ?? "",
  };
  if (visibles.length > 0) {
    const primera = visibles[0].idx;
    if (primera !== 0) {
      const plan = planDe(primera);
      if (plan) inicial = { texto: fechaLegibleFlexible(plan), tramoIdx: primera, valor: plan };
    }
    const ultima = visibles[visibles.length - 1].idx;
    if (ultima !== n - 1) {
      const plan = planDe(ultima);
      if (plan) final = { texto: fechaLegibleFlexible(plan), tramoIdx: ultima, valor: plan };
    }
  }
  return { inicial, final };
}

/**
 * Línea «Fecha del vuelo: dd/mm/aaaa» del bloque `.meta` — espejo EXACTO de
 * `_fecha_vuelo_html` de pyservices (15-sep-2026, pedido del cliente sobre el
 * PDF del folio #314): el bloque «Traslados» (con hora) salió del documento
 * del cliente y solo queda la FECHA, en día de pared de Cancún.
 *
 * Misma fuente que imprimía «Traslado inicial» (`fechasTrasladoImpresas`, que
 * ya respeta los tramos ocultos igual que `escalasVisiblesPdf` del API). Si el
 * regreso cae en OTRO día de pared la etiqueta pasa a plural y el valor a un
 * rango. Sin fecha inicial → null: la línea NO se pinta (jamás «Por
 * confirmar», como en el armador).
 */
export function fechaVueloImpresa(t: {
  inicial: Pick<FechaTrasladoImpresa, "valor">;
  final: Pick<FechaTrasladoImpresa, "valor">;
}): { etiqueta: string; texto: string } | null {
  const inicio = fechaCortaFlexible(t.inicial.valor);
  if (!inicio) return null;
  const fin = fechaCortaFlexible(t.final.valor);
  if (fin && fin !== inicio) return { etiqueta: "Fechas del vuelo", texto: `${inicio} – ${fin}` };
  return { etiqueta: "Fecha del vuelo", texto: inicio };
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

// ===== Conceptos SIN IVA debajo del IVA (22-sep-2026) =====
// Port EXACTO de `particionar_por_iva` (`cotizacion_pdf.py`), la función que
// comparten el PDF del cliente, el interno y el de grupo. La hoja REPLICA el
// PDF del cliente, así que aquí no se decide nada: se traduce.

/** Rótulo del bloque que va DEBAJO del IVA (= `ETIQUETA_SIN_IVA`). */
export const ETIQUETA_SIN_IVA = "No causan IVA";
/** Renglón sobre el IVA con la partición ACTIVA (= `ETIQUETA_BASE_GRAVABLE`). */
export const ETIQUETA_BASE_GRAVABLE = "Subtotal gravable";
/** Renglón sobre el IVA sin partición: el de siempre (= `ETIQUETA_SUBTOTAL`). */
export const ETIQUETA_SUBTOTAL = "Subtotal (sin IVA)";
/** Medio centavo: todo lo que llega del motor va redondeado a 2 decimales. */
export const TOLERANCIA_USD = 0.005;

/**
 * Una fila del desglose lista para particionar: su `montoUsd`, si NO causa
 * IVA y la `fila` que el documento pintará (en pyservices es el HTML ya
 * armado; aquí, el `ReactNode` del renglón). El contenido es opaco: esta
 * función solo ORDENA.
 */
export interface LineaIva<T> {
  montoUsd: number;
  exento: boolean;
  fila: T;
}

/**
 * Resultado de `particionarPorIva`. Con `activa: false` el documento pinta
 * EXACTAMENTE lo de siempre (mismo orden, misma etiqueta de subtotal):
 * `gravables` trae entonces TODAS las filas en su orden original y `exentos`
 * va vacío.
 */
export interface ParticionIva<T> {
  activa: boolean;
  gravables: LineaIva<T>[];
  exentos: LineaIva<T>[];
  baseUsd: number;
}

/**
 * Separa las filas del desglose en GRAVABLES (arriba, suman la base del IVA)
 * y EXENTAS (bajan DEBAJO del IVA, bajo «No causan IVA»).
 *
 * Pedido del cliente (22-sep-2026): «los conceptos que estén SIN IVA que
 * vayan ABAJO de donde está el IVA, para que se entienda visualmente que no
 * lleva IVA». Eso obliga a redefinir el renglón que va SOBRE el IVA: hoy vale
 * `total − IVA` e INCLUYE los exentos, así que bajarlos dejaría una columna
 * que ni suma lo de arriba ni es la base del 16 %. Con la partición activa
 * ese renglón pasa a ser la BASE GRAVABLE.
 *
 * NADA se recalcula: es una partición de PRESENTACIÓN sobre montos que ya
 * vienen del motor. Por eso, antes de reordenar, se comprueban las dos
 * identidades (tolerancia de medio centavo):
 *
 *     Σ(gravables)            == base
 *     base + IVA + Σ(exentos) == total
 *
 * Si alguna falla —el caso conocido es el AJUSTE canónico, que mezcla la
 * parte que entra a la base con el redondeo que se suma DESPUÉS del IVA— se
 * DEGRADA al layout de siempre. Jamás una columna que no suma.
 *
 * ACTIVACIÓN CONDICIONAL: hace falta al menos un concepto exento con monto
 * ≠ 0 **y** IVA > 0. Sin exentos, `subtotal == base` y «Subtotal (sin IVA)»
 * sigue siendo verdad: la hoja sale idéntica a la de antes.
 *
 * `ivaBaseUsd` es `breakdown.iva.base_usd`; si no viaja (snapshot legado) se
 * deriva como `total − IVA − Σ exentos`, que es RE-SUMAR la columna — lo
 * único que se permite hacer aquí con dinero ajeno.
 *
 * TERCERA identidad, obligatoria SOLO cuando la base se derivó (22-sep-2026,
 * revisión adversaria): una base derivada cumple la segunda identidad POR
 * CONSTRUCCIÓN —se despejó de ella— y la primera también cuando el desvío
 * vive en una fila de arriba, que es justo lo que hace el REDONDEO
 * automático (se absorbe en «Servicio aéreo»). Sin este candado se rotularía
 * «Subtotal gravable» un número cuyo 16 % NO es el IVA impreso. Por eso se
 * exige además `base × ivaPct / 100 == IVA`, y sin `ivaPct` se degrada.
 */
export function particionarPorIva<T>(
  lineas: ReadonlyArray<LineaIva<T>>,
  ivaBaseUsd: number | null | undefined,
  ivaUsd: number,
  totalUsd: number,
  ivaPct = 0,
): ParticionIva<T> {
  const gravables: LineaIva<T>[] = [];
  const exentos: LineaIva<T>[] = [];
  for (const ln of lineas) {
    const destino = ln.exento && Math.abs(ln.montoUsd) >= TOLERANCIA_USD ? exentos : gravables;
    destino.push(ln);
  }
  const deGracia = (): ParticionIva<T> => ({
    activa: false,
    gravables: [...lineas],
    exentos: [],
    baseUsd: 0,
  });
  if (exentos.length === 0 || ivaUsd <= TOLERANCIA_USD) return deGracia();
  const sumaExentos = exentos.reduce((acc, ln) => acc + ln.montoUsd, 0);
  // `Number.isFinite` cubre lo que en Python es `is not None`: un snapshot sin
  // `iva.base_usd` llega como undefined/NaN y ahí se re-suma la columna.
  const derivada = !(ivaBaseUsd != null && Number.isFinite(ivaBaseUsd));
  const base = derivada ? totalUsd - ivaUsd - sumaExentos : Number(ivaBaseUsd);
  const sumaGravables = gravables.reduce((acc, ln) => acc + ln.montoUsd, 0);
  const cuadraBase = Math.abs(sumaGravables - base) <= TOLERANCIA_USD;
  const cuadraTotal = Math.abs(base + ivaUsd + sumaExentos - totalUsd) <= TOLERANCIA_USD;
  const cuadraPct = !derivada || Math.abs(base * (ivaPct / 100) - ivaUsd) <= TOLERANCIA_USD;
  if (!cuadraBase || !cuadraTotal || !cuadraPct) return deGracia();
  return { activa: true, gravables, exentos, baseUsd: base };
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

/**
 * Tramo del breakdown que corresponde a la fila `idx` de la hoja: mismo
 * índice (`orden` = idx + 1, como lo arma el motor desde `escalas[]`,
 * ocultos incluidos) y MISMOS extremos — el breakdown puede ir un debounce
 * atrás de lo capturado (fila nueva, tramo quitado) y entonces no se le
 * atribuyen a la fila las horas de otro tramo. null = «—».
 */
export function tramoCalculado(
  tramos: TramoBreakdown[] | null | undefined,
  idx: number,
  leg: Pick<EscalaInput, "origen_iata" | "destino_iata">,
): TramoBreakdown | null {
  const t = tramos?.[idx];
  if (!t) return null;
  // El motor devuelve los IATA en MAYÚSCULAS (`resolveLegs`); lo capturado
  // se compara igual para no pintar «—» por una minúscula.
  if (iataNorm(t.origen) !== iataNorm(leg.origen_iata) || iataNorm(t.destino) !== iataNorm(leg.destino_iata)) {
    return null;
  }
  return t;
}

const iataNorm = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();

/** «1.20 h» de un tramo calculado (2 decimales, como la marca del margen); sin cálculo → «—». */
export function horasTramoTexto(t: Pick<TramoBreakdown, "tiempo_hr"> | null | undefined): string {
  return t ? `${numero2(t.tiempo_hr)} h` : "—";
}
