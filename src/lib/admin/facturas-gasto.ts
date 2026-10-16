/**
 * VARIAS FACTURAS POR GASTO (16-oct-2026, API 0.0.86). Pedido del cliente
 * con captura: ASA entrega 5 CFDI por carga de gasavión (producto,
 * almacenamiento, expendio, DUGAEAM, servicio administrativo) y «Subir
 * factura» aceptaba UN PDF + UN XML: la segunda REEMPLAZABA a la primera y la
 * oficina terminó metiendo los PDF como «Hojas del comprobante».
 *
 * El API 0.0.86 guarda la relación N:M gasto ↔ factura recibida (tabla
 * `gasto_factura_recibida`; `gasto.factura_recibida_id` sigue siendo la
 * PRINCIPAL) y `POST /v1/invoices/recibidas/de-gasto` acepta `archivos[]`
 * (1–10). Aquí vive la regla PURA del panel: emparejar XML ↔ PDF, partir el
 * envío en lotes que quepan en Vercel, decidir qué hacer con un API previo
 * (0.0.85 no conoce `archivos`) y los textos. Sin React ni red.
 */

import { fmtMonto } from "@/lib/format";

// ============================================================================
// Contrato con el API
// ============================================================================

/** Una factura que ampara al gasto (`facturas` del detalle, API 0.0.86). */
export interface FacturaDeGasto {
  id: string;
  /** La que vive en `gasto.factura_recibida_id` (folio de Conciliación/Excel). */
  principal: boolean;
  serie: string | null;
  folio: string | null;
  uuid_fiscal: string | null;
  emisor_nombre: string | null;
  /** numeric de PostgREST: puede llegar como texto; aquí ya es número. */
  total: number | null;
  moneda: string | null;
  fecha_emision: string | null;
  /** Paths del bucket privado `facturas` (se firman al usarlos). */
  pdf_url: string | null;
  xml_url: string | null;
  /** De las notas o del archivo (facturas que llegaron solo en PDF). */
  nombre: string | null;
}

/** Un elemento de `archivos[]` del POST (base64 SIN el prefijo `data:`). */
export interface ArchivoFacturaEntrada {
  xml_b64?: string;
  pdf_b64?: string;
  nombre?: string;
}

/** Lo que el panel saca de UNA respuesta del POST (nuevo o de siempre). */
export interface ResultadoSubidaFacturas {
  /** VARIAS = las nuevas se AGREGAN; LEGADO = la nueva REEMPLAZA a la del
   *  gasto (API 0.0.85, o 0.0.86 sin la migración: `facturas_multiples:false`). */
  modo: "VARIAS" | "LEGADO";
  /** Facturas que quedaron ligadas a este gasto en este envío. */
  agregadas: number;
  /** De esas, las que ya estaban en Facturas recibidas (no se duplicaron). */
  reutilizadas: number;
  /** Las que ya estaban en ESTE gasto (no cambió nada). */
  ya_existian: number;
  avisos: string[];
  /** Las facturas que devolvió el API (null con el API previo). */
  facturas: FacturaDeGasto[] | null;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Nombre del archivo que el API guarda en las notas de una factura solo-PDF:
 *  «Factura en PDF (sin XML): ACC_FCUN_1299718.pdf». */
export function nombreDeNotasFactura(notas: unknown): string | null {
  const t = texto(notas);
  if (!t) return null;
  const m = /^Factura en PDF \(sin XML\):\s*(.+)$/m.exec(t);
  return m ? m[1].trim() || null : null;
}

/** Una factura del arreglo `facturas` (tolerante: lo que no es objeto con id ⇒ null). */
export function normalizarFacturaDeGasto(raw: unknown, principalPorDefecto = false): FacturaDeGasto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = texto(r.id);
  if (!id) return null;
  return {
    id,
    principal: typeof r.principal === "boolean" ? r.principal : principalPorDefecto,
    serie: texto(r.serie),
    folio: texto(r.folio),
    uuid_fiscal: texto(r.uuid_fiscal),
    emisor_nombre: texto(r.emisor_nombre),
    total: numero(r.total),
    moneda: texto(r.moneda),
    fecha_emision: texto(r.fecha_emision),
    pdf_url: texto(r.pdf_url),
    xml_url: texto(r.xml_url),
    nombre: texto(r.nombre) ?? nombreDeNotasFactura(r.notas),
  };
}

/**
 * `facturas` de una respuesta (detalle del gasto o POST). **null = la llave
 * NO vino** (API 0.0.85): el panel trabaja con UNA factura por gasto, como
 * siempre. Un arreglo (aunque vacío) = el API ya maneja varias. La principal
 * va primero; después, en el orden del API.
 */
export function facturasDeRespuesta(resp: unknown): FacturaDeGasto[] | null {
  if (!resp || typeof resp !== "object") return null;
  const lista = (resp as Record<string, unknown>).facturas;
  if (!Array.isArray(lista)) return null;
  const vistas = new Set<string>();
  const out: FacturaDeGasto[] = [];
  for (const x of lista) {
    const f = normalizarFacturaDeGasto(x);
    if (!f || vistas.has(f.id)) continue;
    vistas.add(f.id);
    out.push(f);
  }
  return [...out.filter((f) => f.principal), ...out.filter((f) => !f.principal)];
}

/**
 * ¿El API AGREGA facturas (true) o la nueva reemplaza (false)? El detalle y el
 * POST del 0.0.86 traen `facturas_multiples` (false = migración pendiente:
 * conducta 0.0.85). Con `facturas` pero sin la bandera ⇒ true. Sin nada ⇒
 * null (API previo).
 */
export function variasDeRespuesta(resp: unknown): boolean | null {
  if (!resp || typeof resp !== "object") return null;
  const r = resp as Record<string, unknown>;
  if (typeof r.facturas_multiples === "boolean") return r.facturas_multiples;
  return Array.isArray(r.facturas) ? true : null;
}

/** Avisos NO bloqueantes del detalle (`facturas_avisos`: Σ facturas vs monto). */
export function avisosDeRespuesta(resp: unknown, llave: "facturas_avisos" | "avisos" = "facturas_avisos"): string[] {
  if (!resp || typeof resp !== "object") return [];
  const lista = (resp as Record<string, unknown>)[llave];
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim()))];
}

/** API 0.0.85: la factura amarrada (GET recibidas/:id) como `FacturaDeGasto`. */
export function facturaDesdeRecibida(recibida: unknown): FacturaDeGasto | null {
  return normalizarFacturaDeGasto(recibida, true);
}

/** Cuántas facturas tiene la fila de la lista: `facturas_n` (0.0.86) o, con
 *  el API previo, 1 si hay principal. */
export function nFacturasDeFila(g: {
  facturas_n?: number | null;
  factura_recibida_id?: string | null;
}): number {
  if (typeof g.facturas_n === "number" && Number.isFinite(g.facturas_n) && g.facturas_n >= 0) {
    return Math.max(g.facturas_n, g.factura_recibida_id ? 1 : 0);
  }
  return g.factura_recibida_id ? 1 : 0;
}

/** Lo que el panel saca de la respuesta del POST (nueva o la de siempre). */
export function resultadoDeRespuestaSubida(
  resp: unknown,
  modo: ResultadoSubidaFacturas["modo"],
): ResultadoSubidaFacturas {
  const r = (resp && typeof resp === "object" ? resp : {}) as Record<string, unknown>;
  const facturas = facturasDeRespuesta(r);
  const avisos = avisosDeRespuesta(r, "avisos");
  // 0.0.86 sin la migración: la factura REEMPLAZÓ a la del gasto.
  const modoReal = r.facturas_multiples === false ? "LEGADO" : modo;
  const agregadas = numero(r.agregadas);
  const yaExistian = numero(r.ya_existian);
  if (agregadas != null || yaExistian != null) {
    const detalle = Array.isArray(r.detalle) ? (r.detalle as Array<Record<string, unknown>>) : [];
    const reutilizadas = detalle.filter((d) => d && d.resultado === "EXISTENTE").length;
    return {
      modo: modoReal,
      agregadas: agregadas ?? 0,
      reutilizadas,
      ya_existian: yaExistian ?? 0,
      avisos,
      facturas,
    };
  }
  // Respuesta de siempre (una factura + `ya_existia` = ya estaba en el buzón).
  return {
    modo: modoReal,
    agregadas: 1,
    reutilizadas: r.ya_existia === true ? 1 : 0,
    ya_existian: 0,
    avisos,
    facturas,
  };
}

/** Cuerpo de SIEMPRE (API 0.0.85) para UN elemento de `archivos`. */
export function cuerpoLegado(gastoId: string, a: ArchivoFacturaEntrada): Record<string, string> {
  const xml = a.xml_b64?.trim();
  const pdf = a.pdf_b64?.trim();
  return {
    gasto_id: gastoId,
    ...(xml ? { xml_b64: xml } : {}),
    ...(pdf ? { pdf_b64: pdf } : {}),
    ...(pdf && a.nombre ? { pdf_nombre: a.nombre.slice(0, 200) } : {}),
  };
}

// ============================================================================
// Skew: API 0.0.85 (sin `archivos`)
// ============================================================================

/** 400 «property archivos should not exist» = el DTO del API previo. */
export function esRechazoArchivos(status: number | null | undefined, mensaje: string | null | undefined): boolean {
  return status === 400 && /property archivos should not exist/i.test(mensaje ?? "");
}

/** 503 FACTURAS_GASTO_NO_DISPONIBLE = API 0.0.86 con la migración pendiente
 *  y más de una factura en el envío (no escribió nada). */
export function esVariasNoDisponible(status: number | null | undefined, code: string | null | undefined): boolean {
  return status === 503 && code === "FACTURAS_GASTO_NO_DISPONIBLE";
}

/** Código de la action cuando el API previo rechazó un envío de VARIAS. */
export const CODIGO_API_SIN_VARIAS = "API_SIN_VARIAS_FACTURAS";

export const TEXTO_API_SIN_VARIAS =
  "El sistema todavía no admite varias facturas en un mismo gasto: sube UNA factura (su PDF y su XML) y deja las demás para después. No se subió nada; tus archivos siguen en la lista.";

/** ANTES de subir, con el API previo y varias en la lista. */
export const TEXTO_SOLO_UNA_FACTURA =
  "Por ahora el sistema guarda UNA factura por gasto: deja en la lista una sola factura (su PDF y su XML) y sube las demás cuando se habilite.";

/** Con el API previo se subió UNA y se paró: la siguiente la reemplazaría. */
export const TEXTO_LEGADO_PARCIAL =
  "Se subió una factura. Por ahora el sistema guarda UNA por gasto (otra la reemplazaría): las demás siguen en la lista, sin subir.";

export const TEXTO_LEGADO_YA_TIENE =
  "Este gasto ya tiene una factura. Por ahora el sistema guarda UNA por gasto: si subes otra, REEMPLAZA a la que tiene (la anterior se queda en Facturas recibidas).";

export type DecisionSubida = { ok: true } | { ok: false; mensaje: string };

/**
 * ¿Se puede mandar esta selección? `varias` = lo que dijo el detalle del
 * gasto (true: API 0.0.86; false: API previo; null: no se sabe — se intenta
 * con `archivos` y la action cae al shape de siempre si el API lo rechaza).
 * Con el API previo solo cabe UN par PDF + XML: varias facturas se
 * reemplazarían una a otra en silencio.
 */
export function decidirSubida({
  varias,
  nGrupos,
}: {
  varias: boolean | null;
  nGrupos: number;
}): DecisionSubida {
  if (nGrupos <= 0) {
    return { ok: false, mensaje: "Elige al menos un archivo: el PDF o el XML de la factura." };
  }
  if (nGrupos > MAX_FACTURAS_POR_ENVIO) {
    return {
      ok: false,
      mensaje: `Se suben hasta ${MAX_FACTURAS_POR_ENVIO} facturas a la vez: quita ${nGrupos - MAX_FACTURAS_POR_ENVIO} de la lista.`,
    };
  }
  if (varias === false && nGrupos > 1) return { ok: false, mensaje: TEXTO_SOLO_UNA_FACTURA };
  return { ok: true };
}

// ============================================================================
// Selección de archivos: emparejar XML ↔ PDF
// ============================================================================

export const MAX_FACTURAS_POR_ENVIO = 10;
/**
 * Tope por archivo: 3 MB. NO es capricho: el archivo viaja en base64 (+33 %)
 * por una server action y Vercel rechaza cuerpos de más de 4.5 MB con 413
 * (sección «Server actions: un archivo en base64…» del AGENTS.md). El botón
 * viejo prometía 8 MB y un PDF de 4 MB fallaba SIEMPRE como «el servidor no
 * respondió» (revisión adversaria 16-oct-2026).
 */
export const MAX_BYTES_ARCHIVO_FACTURA = 3 * 1024 * 1024;
/** Tope de base64 por LLAMADA (y por factura: su PDF + su XML). */
export const LIMITE_LOTE_B64 = 4_300_000;
/**
 * Facturas por LLAMADA: el API procesa cada una en fila (lee el XML en
 * pyservices, sube 2 archivos, saca la huella de los PDF previos); 10 en
 * una llamada pueden pasar del tiempo de la función de Vercel. Con 3 cada
 * llamada es corta y un fallo deja menos en duda.
 */
export const MAX_FACTURAS_POR_LOTE = 3;

export const ACCEPT_FACTURAS = ".pdf,.xml,application/pdf,text/xml,application/xml";

export type TipoArchivoFactura = "PDF" | "XML";

interface ArchivoLike {
  name: string;
  type: string;
  size: number;
}

export function tipoArchivoFactura(f: { name: string; type: string }): TipoArchivoFactura | null {
  const n = f.name.toLowerCase();
  if (n.endsWith(".pdf") || f.type === "application/pdf") return "PDF";
  if (n.endsWith(".xml") || f.type === "text/xml" || f.type === "application/xml") return "XML";
  return null;
}

/** «ACC_FCUN_1299718.PDF» ⇒ «acc_fcun_1299718» (sin extensión, minúsculas). */
export function nombreBaseFactura(nombre: string): string {
  const n = nombre.trim().toLowerCase().replace(/\s+/g, " ");
  return n.replace(/\.(pdf|xml)$/, "").trim();
}

/** Pistas para emparejar un XML con su PDF cuando los nombres no coinciden:
 *  UUID del timbre, folio y serie+folio del CFDI (en minúsculas). */
export function pistasDeXmlCfdi(xml: string): string[] {
  const attr = (nombre: string): string | null => {
    const m = new RegExp(`\\b${nombre}="([^"]+)"`).exec(xml);
    return m ? m[1].trim() : null;
  };
  const uuid = attr("UUID");
  const folio = attr("Folio");
  const serie = attr("Serie");
  const out: string[] = [];
  if (uuid) out.push(uuid.toLowerCase());
  if (serie && folio) {
    out.push(`${serie}${folio}`.toLowerCase(), `${serie}-${folio}`.toLowerCase(), `${serie}_${folio}`.toLowerCase());
  }
  // Un folio corto («12») aparecería por casualidad en cualquier nombre.
  if (folio && /\d{4,}/.test(folio)) out.push(folio.toLowerCase());
  return [...new Set(out)];
}

export interface GrupoFactura<F> {
  /** Nombre base (o el del PDF si se emparejó por pista). */
  clave: string;
  pdf: F | null;
  xml: F | null;
  /** true = se emparejaron aunque los nombres no coinciden (se dice). */
  porPista: boolean;
}

export interface ResultadoEmparejar<F> {
  grupos: GrupoFactura<F>[];
  /** Archivos que NO entran, con su motivo (nunca en silencio). */
  rechazos: string[];
  /** Texto para el toast; null si todo entró. */
  mensaje: string | null;
}

/**
 * Agrupa la selección en FACTURAS: un PDF y un XML con el mismo nombre base
 * son la misma factura (ASA: `ACC…_FCUN_1299718.pdf` ↔ `.xml`). Si los
 * nombres no coinciden, se empareja por las pistas del XML (UUID o folio en
 * el nombre del PDF) y, al final, si queda UN PDF suelto y UN XML suelto, son
 * la misma factura — SOLO si la selección son exactamente esos 2 archivos
 * (el caso de siempre: «el XML del SAT con su PDF»); con más archivos un
 * emparejamiento a ciegas pegaría el PDF de una factura al XML de otra y el
 * API guardaría su huella en la fila equivocada (revisión adversaria). Los
 * XML de `separados` (botón «Separar» de la lista previa) no se emparejan
 * por pista. Lo demás va suelto («solo PDF» / «solo XML»). Rechaza tipos
 * ajenos, archivos vacíos o de más de 3 MB, repetidos, una factura cuyo PDF +
 * XML no cabe en una llamada y lo que pase de 10 facturas.
 */
export function emparejarArchivosFactura<F extends ArchivoLike>(
  archivos: readonly F[],
  {
    pistas,
    separados,
    max = MAX_FACTURAS_POR_ENVIO,
    maxBytes = MAX_BYTES_ARCHIVO_FACTURA,
    limiteFactura = LIMITE_LOTE_B64,
  }: {
    pistas?: (f: F) => readonly string[];
    separados?: (f: F) => boolean;
    max?: number;
    maxBytes?: number;
    limiteFactura?: number;
  } = {},
): ResultadoEmparejar<F> {
  const rechazos: string[] = [];
  const porClave = new Map<string, GrupoFactura<F>>();
  const orden: GrupoFactura<F>[] = [];
  for (const f of archivos) {
    const tipo = tipoArchivoFactura(f);
    if (!tipo) {
      rechazos.push(`${f.name} (no es PDF ni XML)`);
      continue;
    }
    if (!(f.size > 0)) {
      rechazos.push(`${f.name} (está vacío)`);
      continue;
    }
    if (f.size > maxBytes) {
      rechazos.push(`${f.name} (pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB)`);
      continue;
    }
    const clave = nombreBaseFactura(f.name);
    let g = porClave.get(clave);
    if (!g) {
      g = { clave, pdf: null, xml: null, porPista: false };
      porClave.set(clave, g);
      orden.push(g);
    }
    const slot = tipo === "PDF" ? "pdf" : "xml";
    if (g[slot]) {
      rechazos.push(`${f.name} (repetido: ya hay un ${tipo} con ese nombre)`);
      continue;
    }
    g[slot] = f;
  }

  // Emparejar sueltos: primero por pistas del XML (únicas), luego 1 ↔ 1.
  let grupos = orden.filter((g) => g.pdf || g.xml);
  const nAceptados = grupos.reduce((n, g) => n + (g.pdf ? 1 : 0) + (g.xml ? 1 : 0), 0);
  const sueltosPdf = () => grupos.filter((g) => g.pdf && !g.xml);
  const sueltosXml = () => grupos.filter((g) => g.xml && !g.pdf);
  const unir = (gPdf: GrupoFactura<F>, gXml: GrupoFactura<F>) => {
    gPdf.xml = gXml.xml;
    gPdf.porPista = true;
    grupos = grupos.filter((g) => g !== gXml);
  };
  if (pistas) {
    for (const gx of sueltosXml()) {
      if (separados?.(gx.xml as F)) continue;
      const claves = (pistas(gx.xml as F) ?? []).filter((p) => p.length >= 4);
      if (claves.length === 0) continue;
      const candidatos = sueltosPdf().filter((gp) => claves.some((c) => gp.clave.includes(c)));
      if (candidatos.length === 1) unir(candidatos[0], gx);
    }
  }
  if (
    nAceptados === 2 &&
    sueltosPdf().length === 1 &&
    sueltosXml().length === 1 &&
    !separados?.(sueltosXml()[0].xml as F)
  ) {
    unir(sueltosPdf()[0], sueltosXml()[0]);
  }

  // Una factura (PDF + XML) que no cabe en UNA llamada: Vercel la rechazaría.
  grupos = grupos.filter((g) => {
    const peso = largoBase64(g.pdf?.size ?? 0) + largoBase64(g.xml?.size ?? 0);
    if (peso <= limiteFactura) return true;
    rechazos.push(
      `${[g.pdf?.name, g.xml?.name].filter(Boolean).join(" + ")} (juntos pesan demasiado para subirse desde el panel)`,
    );
    return false;
  });

  if (grupos.length > max) {
    const fuera = grupos.slice(max);
    grupos = grupos.slice(0, max);
    rechazos.push(
      `${fuera.length === 1 ? "1 factura se quedó fuera" : `${fuera.length} facturas se quedaron fuera`} (se suben hasta ${max} a la vez; súbelas después)`,
    );
  }
  return {
    grupos,
    rechazos,
    mensaje: rechazos.length > 0 ? `No entran: ${rechazos.join("; ")}.` : null,
  };
}

/** Los archivos de los grupos, en orden (para guardar la selección). */
export function archivosDeGrupos<F>(grupos: readonly GrupoFactura<F>[]): F[] {
  const out: F[] = [];
  for (const g of grupos) {
    if (g.pdf) out.push(g.pdf);
    if (g.xml) out.push(g.xml);
  }
  return out;
}

/** Caracteres que ocupa un archivo en base64. */
export function largoBase64(bytes: number): number {
  return Math.ceil(Math.max(0, bytes) / 3) * 4;
}

/**
 * Parte las facturas en lotes que quepan en una llamada (≤ `limite`
 * caracteres de base64 y ≤ `maxPorLote` facturas). Una factura NUNCA se
 * parte (su PDF y su XML viajan juntos); si sola pasa del tope, va sola.
 */
export function partirEnLotes<G extends { pdf: { size: number } | null; xml: { size: number } | null }>(
  grupos: readonly G[],
  limite = LIMITE_LOTE_B64,
  maxPorLote = MAX_FACTURAS_POR_LOTE,
): G[][] {
  const lotes: G[][] = [];
  let actual: G[] = [];
  let peso = 0;
  for (const g of grupos) {
    const p = largoBase64(g.pdf?.size ?? 0) + largoBase64(g.xml?.size ?? 0);
    if (actual.length > 0 && (peso + p > limite || actual.length >= maxPorLote)) {
      lotes.push(actual);
      actual = [];
      peso = 0;
    }
    actual.push(g);
    peso += p;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

/** Nombre que viaja en `archivos[].nombre`: el del PDF (o el del XML). */
export function nombreDeGrupo(g: { pdf: { name: string } | null; xml: { name: string } | null }): string | undefined {
  const n = g.pdf?.name ?? g.xml?.name;
  return n ? n.slice(0, 200) : undefined;
}

/** «PDF + XML» / «solo PDF (sin UUID fiscal)» / «solo XML». */
export function textoContenidoGrupo(g: { pdf: unknown; xml: unknown }): string {
  if (g.pdf && g.xml) return "PDF + XML";
  if (g.pdf) return "solo PDF (se guarda sin UUID fiscal)";
  return "solo XML";
}

// ============================================================================
// Resultado de varios lotes
// ============================================================================

/**
 * Junta los resultados de los lotes (contadores). Los avisos de la suma NO
 * se calculan en el panel: los da el API en el detalle (`facturas_avisos`),
 * que sabe si una factura ampara además OTROS gastos (VIP SAESA) — un
 * espejo aquí avisaría en falso. El panel recarga la lista tras subir.
 */
export function combinarResultados(resultados: readonly ResultadoSubidaFacturas[]): {
  agregadas: number;
  reutilizadas: number;
  ya_existian: number;
  legado: boolean;
} {
  let agregadas = 0;
  let reutilizadas = 0;
  let yaExistian = 0;
  for (const r of resultados) {
    agregadas += r.agregadas;
    reutilizadas += r.reutilizadas;
    yaExistian += r.ya_existian;
  }
  return {
    agregadas,
    reutilizadas,
    ya_existian: yaExistian,
    legado: resultados.some((r) => r.modo === "LEGADO"),
  };
}

// ============================================================================
// Textos
// ============================================================================

export const TITULO_FACTURAS_DIALOGO = "Facturas de este gasto";
export const BOTON_SUBIR_FACTURAS = "Subir facturas";
export const BOTON_ELEGIR_ARCHIVOS = "Elegir archivos";
export const BOTON_AGREGAR_ARCHIVOS = "Agregar más archivos";
export const BOTON_QUITAR_DE_GASTO = "Quitar de este gasto";
export const BOTON_VER_AQUI = "Ver aquí";
export const BOTON_ABRIR_PESTANA = "Abrir en pestaña nueva";
export const TEXTO_CARGANDO_FACTURAS = "Cargando las facturas…";
export const TEXTO_ERROR_FACTURAS = "No se pudieron cargar las facturas de este gasto.";
export const TEXTO_SIN_FACTURAS = "Este gasto todavía no tiene facturas.";
export const AYUDA_SUBIR_FACTURAS =
  "Elige de una vez los PDF y los XML (hasta 10 facturas, 3 MB cada archivo). Un PDF y un XML con el mismo nombre se toman como la misma factura. Con el XML se guardan el UUID fiscal, el emisor y el total; si el proveedor solo mandó el PDF, se guarda igual.";
/** Con el API previo (una factura por gasto). */
export const AYUDA_SUBIR_UNA_FACTURA =
  "Elige el PDF y el XML de la factura (3 MB cada archivo). Con el XML se guardan el UUID fiscal, el emisor y el total; si el proveedor solo mandó el PDF, se guarda igual.";
export const TEXTO_POR_PISTA =
  "se emparejaron aunque los nombres no coinciden; si no son la misma factura, pulsa «Separar»";
export const BOTON_SEPARAR = "Separar";
/** Un lote falló: el API pudo haber escrito parte (no es atómico por lote). */
export const TEXTO_REVISA_LISTA =
  "Puede que algunas sí se hayan guardado: revisa la lista de arriba antes de volver a intentar.";

export function tituloSeccionFacturas(n: number): string {
  return `Facturas del gasto (${n})`;
}

/** «Se agregan a las 5 facturas que ya tiene.» (null sin facturas). */
export function textoSeAgregan(n: number): string | null {
  if (!(n > 0)) return null;
  return n === 1 ? "Se agregan a la factura que ya tiene." : `Se agregan a las ${n} facturas que ya tiene.`;
}

/** Folio de la factura para la lista: «FCUN-1299718», el nombre del PDF o el UUID corto. */
export function etiquetaFactura(f: FacturaDeGasto): string {
  if (f.folio) return f.serie ? `${f.serie}-${f.folio}` : f.folio;
  if (f.nombre) return f.nombre;
  if (f.uuid_fiscal) return `UUID ${f.uuid_fiscal.slice(0, 8)}…`;
  return "Factura sin folio";
}

/** Línea secundaria: emisor · total · qué archivos tiene. */
export function detalleFactura(f: FacturaDeGasto): string {
  const partes: string[] = [];
  if (f.emisor_nombre) partes.push(f.emisor_nombre);
  if (f.total != null) partes.push(fmtMonto(f.total, f.moneda ?? "MXN"));
  partes.push(f.pdf_url && f.xml_url ? "PDF + XML" : f.pdf_url ? "solo PDF" : f.xml_url ? "solo XML" : "sin archivo");
  return partes.join(" · ");
}

/** Número del ícono de la columna Facturación (solo con más de una). */
export function textoChipFacturas(n: number): string | null {
  return n > 1 ? String(n) : null;
}

export function tituloChipFacturas(n: number): string {
  if (n <= 0) return "Subir las facturas de este gasto (PDF y XML; pueden ser varias)";
  if (n === 1) return "Este gasto tiene 1 factura: verla o subir más";
  return `Este gasto tiene ${n} facturas: verlas o subir más`;
}

export function ariaChipFacturas(n: number): string {
  if (n <= 0) return "Subir las facturas de este gasto";
  return n === 1 ? "Ver la factura de este gasto" : `Ver las ${n} facturas de este gasto`;
}

/** Toast al terminar de subir. */
export function textoResultadoSubida({
  agregadas,
  reutilizadas,
  ya_existian,
  legado = false,
  reemplazo = false,
}: {
  agregadas: number;
  reutilizadas: number;
  ya_existian: number;
  legado?: boolean;
  /** Modo legado con una factura previa: la nueva la REEMPLAZÓ. */
  reemplazo?: boolean;
}): string {
  const partes: string[] = [];
  if (agregadas > 0) {
    partes.push(
      legado && reemplazo
        ? "Se reemplazó la factura del gasto (la anterior sigue en Facturas recibidas)."
        : legado
        ? "Factura amarrada a este gasto."
        : agregadas === 1
          ? "Se agregó 1 factura a este gasto."
          : `Se agregaron ${agregadas} facturas a este gasto.`,
    );
  }
  if (reutilizadas > 0) {
    partes.push(
      reutilizadas === 1
        ? "1 ya estaba en Facturas recibidas: no se duplicó, solo se le sumó este gasto."
        : `${reutilizadas} ya estaban en Facturas recibidas: no se duplicaron, solo se les sumó este gasto.`,
    );
  }
  if (ya_existian > 0) {
    partes.push(
      ya_existian === 1
        ? "1 ya estaba en este gasto (no se duplicó)."
        : `${ya_existian} ya estaban en este gasto (no se duplicaron).`,
    );
  }
  return partes.length > 0 ? partes.join(" ") : "Listo: las facturas ya estaban en este gasto.";
}

/** Lo que se quedó sin subir (sigue en la lista para reintentar). */
export function textoFalloLotes(nombres: readonly string[], motivo: string): string {
  const lista = nombres.length > 3 ? `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más` : nombres.join(", ");
  return `No se pudo subir ${lista}: ${motivo.replace(/\.+$/, "")}. Siguen en la lista para que lo intentes de nuevo.`;
}

export const TITULO_QUITAR_FACTURA = "¿Quitar esta factura de este gasto?";
/** API previo con una factura ya amarrada: subir otra la reemplaza. */
export const TITULO_REEMPLAZAR_FACTURA = "¿Reemplazar la factura de este gasto?";

export function textoQuitarFactura(f: FacturaDeGasto, total: number): string {
  const base = `${etiquetaFactura(f)} deja de amparar este gasto. La factura NO se borra: sigue en Facturas recibidas (y en los demás gastos que ampare).`;
  if (total <= 1) return `${base} Era la única: el gasto regresa a Pendiente de facturar.`;
  if (f.principal) return `${base} Era la principal (la del folio en Conciliación): su lugar lo toma la siguiente.`;
  return base;
}

export const TEXTO_QUITAR_NO_DISPONIBLE =
  "Quitar una factura de un gasto todavía no está activo en el sistema. Inténtalo más tarde.";
