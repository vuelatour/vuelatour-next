/**
 * IMPORTAR un estado de cuenta cuyo periodo YA estaba importado (13-oct-2026,
 * API 0.0.75): vista previa, «Solo completar conceptos» y el detalle de lo
 * que no se completó. Módulo PURO (sin React ni red; prueba
 * `__tests__/conciliacion-importacion.test.ts`): solo REDACTA lo que mandó el
 * API, nunca cuenta dinero ni decide qué es duplicado.
 *
 * Caso real (VIP SAESA): los SPEI de septiembre entraron con la leyenda del
 * banco sola («SEL TRANSF. INTERBANCARIA SPEI»), sin el concepto que tecleó
 * quien pagó («fact vip 7360»). Volver a subir el PDF no duplica nada: el API
 * completa la descripción de las filas que ya estaban (solo leyendas de su
 * lista blanca y jamás adivinando entre gemelos), y lo que no pudo completar
 * lo dice aquí.
 *
 * Todo es ADITIVO: sin las llaves nuevas (API ≤ 0.0.74) la vista previa no
 * se pinta, los botones son los de siempre y el resumen es el de antes.
 */

import { fmtDateOnly } from "@/lib/datetime";
import { fmtInt, fmtMonto } from "@/lib/format";
import type {
  EnriquecimientoDetalle,
  EnriquecimientoOmitido,
  MovimientoParseado,
  NoEncontradoImport,
  NuevoMismoDia,
  VistaPreviaImportacion,
} from "@/types/conciliacion";

// ───────────────────────────── Textos fijos ─────────────────────────────

/** 400 «property solo_enriquecer should not exist» de un API previo. */
export const MSG_API_SIN_ENRIQUECER =
  "El servidor todavía no sabe completar conceptos: espera a que termine la actualización e intenta de nuevo.";

/** Aviso ámbar del job cuando conviene re-cruzar (reemplaza al «NO vuelvas a importar»). */
export const TEXTO_SUGERIR_RECRUCE =
  "Cierra esta ventana y usa «Cruzar pendientes» para volver a intentar el cruce de los que quedaron pendientes. Volver a importar el mismo archivo no duplica nada ni reintenta el cruce: solo completa el concepto del banco que les faltara.";

/**
 * Se suma a la descripción del diálogo «Importar estado de cuenta». Revisión
 * del lote 2 (14-oct-2026): ya no promete «no se duplica nada» a secas —
 * una línea que la IA leyó distinto (otro renglón, otro dígito de la
 * factura) puede entrar como nueva; la vista previa lo avisa ANTES.
 */
export const DESCRIPCION_IMPORT_REPETIDO =
  " Si el archivo ya estaba importado, lo que el sistema reconoce no se duplica: solo se completa el concepto del banco (por ejemplo, qué factura se pagó) de los movimientos que ya estaban. Una línea que la IA leyó distinto puede entrar como nueva: la revisión de antes de importar te lo avisa.";

/** Botón principal mientras corre la vista previa (deshabilitado). */
export const TEXTO_BOTON_REVISANDO = "Revisando…";

/**
 * Aviso cuando la vista previa FALLA por algo que no es un API previo (500,
 * red, el 400 de «impórtalo por partes»): antes no se decía nada y quedaba el
 * botón de siempre, sin la protección contra relecturas duplicadas.
 */
export const MSG_VISTA_PREVIA_FALLO =
  "No se pudo revisar qué movimientos ya estaban importados. Si importas, al terminar revisa las líneas nuevas: una línea que la IA leyó distinto pudo entrar como nueva.";

export const TITULO_ADVERTENCIAS_PARSE = "Revisa antes de importar:";
/** Tope de advertencias de la lectura que se pintan. */
export const MAX_ADVERTENCIAS_PARSE = 10;
/** Líneas nuevas que enseña la vista previa antes de «y N más». */
export const MAX_NUEVAS_VISTA_PREVIA = 5;
/** Chip de una línea nueva con la misma fecha y monto que otra que ya estaba. */
export const ETIQUETA_MISMO_DIA = "misma fecha y monto";

export const BOTON_IMPORTAR_Y_CONCILIAR = "Importar y conciliar";
export const BOTON_COMPLETAR_CONCEPTOS = "Completar conceptos";
export const BOTON_CERRAR_IMPORTACION = "Cerrar";

// ───────────────────────────── Ayudantes ─────────────────────────────

/** Entero ≥ 0 de un conteo del API (lo demás cuenta 0). */
function entero(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
}

/** «a» · «a y b» · «a, b y c». */
function listaY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Recorta un concepto largo con «…» (por caracteres, sin partir un acento). */
function recortar(texto: string, max = 60): string {
  const t = texto.replace(/\s+/g, " ").trim();
  const letras = [...t];
  return letras.length > max ? `${letras.slice(0, max - 1).join("").trimEnd()}…` : t;
}

const tipoTexto = (tipo: string | null | undefined) => (tipo === "ABONO" ? "Abono" : "Cargo");

/** «21 sep 2026 · Cargo · $16 MXN · SEL PAGO DE SERVICIOS» (`conComillas` ⇒ «…» alrededor del concepto). */
function lineaMovimiento(
  m: { fecha?: string | null; tipo?: string | null; monto?: number | string | null; descripcion?: string | null },
  moneda: string | null | undefined,
  conComillas: boolean,
): string {
  const desc = (m.descripcion ?? "").trim();
  return [
    m.fecha ? fmtDateOnly(m.fecha) : null,
    tipoTexto(m.tipo),
    fmtMonto(m.monto ?? null, moneda ?? null),
    desc ? (conComillas ? `«${recortar(desc)}»` : recortar(desc)) : null,
  ]
    .filter((p): p is string => !!p && p !== "—")
    .join(" · ");
}

/** Cuántos movimientos quedaron sin concepto por cada motivo (Σ `movimiento_ids`). */
function contarPorMotivo(omitidos: readonly EnriquecimientoOmitido[] | null | undefined): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const o of Array.isArray(omitidos) ? omitidos : []) {
    if (!o || typeof o.motivo !== "string") continue;
    const n = Array.isArray(o.movimiento_ids) ? o.movimiento_ids.length : 0;
    cuenta.set(o.motivo, (cuenta.get(o.motivo) ?? 0) + n);
  }
  return cuenta;
}

/** ¿Es el 400 del DTO previo («property solo_enriquecer should not exist»)? */
export function esDtoSinEnriquecer(r: { status?: number | null; error?: string | null }): boolean {
  return r.status === 400 && /property solo_enriquecer should not exist/i.test(r.error ?? "");
}

// ───────────────────── Lo que viaja al API (sin cambios) ─────────────────────

/** Un movimiento tal como viaja a `importar` / `vista-previa` (el DTO del API). */
export interface MovimientoParaImportar {
  fecha: string;
  descripcion?: string;
  /** Positivo; en Paywise es el NETO depositado. */
  monto: number;
  tipo: "CARGO" | "ABONO";
  referencia?: string;
  monto_bruto?: number;
  comision_monto?: number;
}

/**
 * Las líneas leídas ⇒ el cuerpo de `importar` (y de la vista previa). Es el
 * MISMO armado de siempre (extraído del diálogo, 13-oct-2026): solo las que
 * traen fecha y NUNCA campos que no son del DTO (`estatus`, `comision` crudo…
 * que el API rechazaría con `forbidNonWhitelisted`).
 */
export function movimientosParaImportar(
  parsed: { movimientos?: readonly MovimientoParseado[] | null } | null | undefined,
): MovimientoParaImportar[] {
  return (parsed?.movimientos ?? [])
    .filter((m) => m.fecha)
    .map((m) => ({
      fecha: m.fecha!,
      descripcion: m.descripcion ?? undefined,
      monto: m.monto,
      tipo: m.tipo,
      referencia: m.referencia ?? undefined,
      // Paywise: bruto y comisión del movimiento (el API los guarda y la
      // auditoría los coteja contra el cobro).
      monto_bruto: m.monto_bruto != null && m.monto_bruto > 0 ? m.monto_bruto : undefined,
      comision_monto: m.comision != null && m.comision >= 0 ? m.comision : undefined,
    }));
}

// ───────────────────────────── Vista previa ─────────────────────────────

export interface NuevaVistaPrevia {
  /** «21 sep 2026 · Cargo · $16 MXN · SEL PAGO DE SERVICIOS». */
  texto: string;
  /** Misma fecha y monto que una que ya estaba: casi seguro es la misma leída distinta. */
  mismoDia: boolean;
}

export interface TextoVistaPrevia {
  /** «Antes de importar: 98 líneas». */
  titulo: string;
  lineas: string[];
  /** `aviso` = hay nuevas Y ya estaban (puede ser un duplicado leído distinto). */
  tono: "info" | "aviso";
  aviso: string | null;
  /** Hasta `MAX_NUEVAS_VISTA_PREVIA`. */
  nuevas: NuevaVistaPrevia[];
  /** Cuántas nuevas no caben (contra `nuevos`, el conteo real del API). */
  masNuevas: number;
}

/**
 * Lo que dice el cuadro «Antes de importar» con la respuesta de
 * `importar/vista-previa`: cuántas ya estaban, a cuántas se les agregará el
 * concepto, cuántas no lo recibirán y por qué, y las nuevas (las de misma
 * fecha y monto, marcadas).
 */
export function textoVistaPreviaImport(vp: VistaPreviaImportacion): TextoVistaPrevia {
  const total = entero(vp?.total);
  const ya = entero(vp?.ya_estaban);
  const nuevos = entero(vp?.nuevos);
  const seEnriquecen = entero(vp?.se_enriquecen);
  const omitidosTotal = entero(vp?.enriquecimiento_omitidos);
  const porMotivo = contarPorMotivo(vp?.omitidos);
  const gemelos = porMotivo.get("GEMELOS") ?? 0;
  const vinculo = porMotivo.get("VINCULO_NO_BANCARIO") ?? 0;

  const lineas: string[] = [];
  if (ya > 0) {
    lineas.push(ya === 1 ? "1 ya estaba importada (no se duplica)" : `${fmtInt(ya)} ya estaban importadas (no se duplican)`);
  }
  if (seEnriquecen > 0) {
    lineas.push(
      seEnriquecen === 1
        ? "a 1 se le agregará el concepto del banco"
        : `a ${fmtInt(seEnriquecen)} se les agregará el concepto del banco`,
    );
  }
  if (gemelos > 0) {
    lineas.push(
      gemelos === 1
        ? "1 del mismo día y monto no recibirá concepto (no se sabe cuál es cuál)"
        : `${fmtInt(gemelos)} del mismo día y monto no recibirán concepto (no se sabe cuál es cuál)`,
    );
  }
  if (vinculo > 0) {
    lineas.push(
      vinculo === 1
        ? "1 cargo vinculado a un gasto en efectivo conserva su descripción (su justificación la cita)"
        : `${fmtInt(vinculo)} cargos vinculados a gastos en efectivo conservan su descripción (su justificación la cita)`,
    );
  }
  // El detalle viene topado (≤20 grupos): lo que no alcanzó a venir se dice
  // como total, sin inventarle un motivo.
  const resto = omitidosTotal - gemelos - vinculo;
  if (resto > 0) {
    lineas.push(resto === 1 ? "1 más no recibirá concepto" : `${fmtInt(resto)} más no recibirán concepto`);
  }
  lineas.push(nuevos === 1 ? "1 nueva" : `${fmtInt(nuevos)} nuevas`);

  const detalle = Array.isArray(vp?.nuevos_detalle) ? vp.nuevos_detalle.filter(Boolean) : [];
  const nuevas = detalle.slice(0, MAX_NUEVAS_VISTA_PREVIA).map((n) => ({
    texto: lineaMovimiento(n, vp?.moneda, false),
    mismoDia: n.mismo_dia_y_monto === true,
  }));
  const hayMismoDia = entero(vp?.nuevos_mismo_dia_y_monto) > 0 || detalle.some((n) => n.mismo_dia_y_monto === true);
  const tono = nuevos > 0 && ya > 0 ? "aviso" : "info";
  const aviso =
    tono === "aviso"
      ? "Revisa las nuevas: si este archivo es del mismo periodo que ya subiste, una línea «nueva» puede ser un duplicado (la IA la leyó distinta)." +
        (hayMismoDia
          ? " Las marcadas con «misma fecha y monto» casi seguro son un movimiento que ya estaba: usa «Solo completar conceptos»."
          : "")
      : null;

  return {
    titulo: `Antes de importar: ${fmtInt(total)} ${total === 1 ? "línea" : "líneas"}`,
    lineas,
    tono,
    aviso,
    nuevas,
    masNuevas: Math.max(0, nuevos - nuevas.length),
  };
}

// ───────────────────────────── Botones del pie ─────────────────────────────

export type AccionImportacion = "IMPORTAR" | "SOLO_CONCEPTOS";

export interface BotonImportacion {
  accion: AccionImportacion;
  texto: string;
  /** El principal va AL FINAL (relleno); los demás, con contorno. */
  principal: boolean;
}

/** «Solo completar conceptos (no agrega la nueva)» / «(no agrega las 2 nuevas)». */
export function textoSoloCompletarConceptos(nuevos: number): string {
  return `Solo completar conceptos (no agrega ${nuevos === 1 ? "la nueva" : `las ${fmtInt(nuevos)} nuevas`})`;
}

/** «Importar también la nueva» / «Importar también las 2 nuevas». */
export function textoImportarTambien(nuevos: number): string {
  return nuevos === 1 ? "Importar también la nueva" : `Importar también las ${fmtInt(nuevos)} nuevas`;
}

/**
 * ¿La vista previa falló por algo que sí hay que decir? Un API previo
 * (`RUTA_NO_DISPONIBLE`: no tiene la ruta) no pinta nada, como siempre; un
 * resultado bueno o sin resultado, tampoco.
 */
export function avisoVistaPreviaFallida(
  r: { ok?: boolean | null; code?: string | null } | null | undefined,
): string | null {
  if (!r || r.ok !== false) return null;
  return r.code === "RUTA_NO_DISPONIBLE" ? null : MSG_VISTA_PREVIA_FALLO;
}

/**
 * Los botones del pie en ORDEN DE PINTADO (el principal al final), según la
 * vista previa:
 *  - sin vista previa (API previo, error) o nada ya importado ⇒ el de siempre;
 *  - todo ya estaba: «Completar conceptos» si hay qué completar; si no, el de
 *    siempre (que solo archiva);
 *  - nuevas Y ya estaban: si TODAS las nuevas tienen la misma fecha y monto
 *    que otra (casi seguro relecturas), el principal es «Solo completar
 *    conceptos»; si no, «Importar y conciliar», con la otra opción al lado.
 */
export function botonesImportacion(vp: VistaPreviaImportacion | null | undefined): BotonImportacion[] {
  const importar: BotonImportacion = { accion: "IMPORTAR", texto: BOTON_IMPORTAR_Y_CONCILIAR, principal: true };
  if (!vp || entero(vp.ya_estaban) === 0) return [importar];
  const nuevos = entero(vp.nuevos);
  if (nuevos === 0) {
    return entero(vp.se_enriquecen) > 0
      ? [{ accion: "SOLO_CONCEPTOS", texto: BOTON_COMPLETAR_CONCEPTOS, principal: true }]
      : [importar];
  }
  if (entero(vp.nuevos_mismo_dia_y_monto) >= nuevos) {
    return [
      { accion: "IMPORTAR", texto: textoImportarTambien(nuevos), principal: false },
      { accion: "SOLO_CONCEPTOS", texto: textoSoloCompletarConceptos(nuevos), principal: true },
    ];
  }
  return [{ accion: "SOLO_CONCEPTOS", texto: textoSoloCompletarConceptos(nuevos), principal: false }, importar];
}

// ───────────────────── Detalle del job al terminar ─────────────────────

/** Lo que el panel lee del job para el detalle (todo ADITIVO del API 0.0.75). */
export interface ImportJobDetalleLike {
  estado?: string | null;
  enriquecidos?: number | null;
  enriquecimiento_omitidos?: number | null;
  enriquecimiento?: {
    estado_cuenta_id?: string | null;
    detalle?: EnriquecimientoDetalle[] | null;
    omitidos?: EnriquecimientoOmitido[] | null;
  } | null;
  nuevos_mismo_dia_y_monto?: number | null;
  nuevos_mismo_dia_y_monto_detalle?: NuevoMismoDia[] | null;
  solo_enriquecer?: boolean | null;
  no_encontrados?: number | null;
  no_encontrados_detalle?: NoEncontradoImport[] | null;
}

export interface BloqueDetalleImport {
  /** Llave estable del bloque. */
  clave: "gemelos" | "vinculo" | "concurrente" | "error" | "no_encontrados" | "mismo_dia";
  titulo: string | null;
  lineas: string[];
  pie: string | null;
}

export const TITULO_DETALLE_GEMELOS = "Sin concepto (mismo día y monto):";
export const PIE_GEMELOS_CARGOS =
  "Para que el sistema sepa cuál es cuál: escribe el número de factura en el «Folio» del gasto vinculado (o «fact NNNN» en la primera línea de sus notas) y vuelve a subir el archivo.";
export const PIE_GEMELOS_ABONOS =
  "Compáralos en el portal del banco (clave de rastreo u hora); el concepto no cambia ningún monto.";
export const TITULO_DETALLE_VINCULO = "Conservaron su descripción:";
export const TITULO_NO_ENCONTRADOS = "No se encontraron (NO se agregaron):";
export const PIE_NO_ENCONTRADOS = "Si son movimientos reales, impórtalos con «Importar y conciliar».";
export const TITULO_NUEVOS_MISMO_DIA = "Ojo: nuevos con la misma fecha y monto que otros que ya estaban:";
export const PIE_NUEVOS_MISMO_DIA = "Revisa que sean pagos distintos y no el mismo leído dos veces.";

/** «07 sep 2026 · 2 cargos de $1,118.12 MXN: el archivo dice Factura 7350 y Factura 7351». */
function lineaGemelos(o: EnriquecimientoOmitido): string {
  const n = Math.max(Array.isArray(o.movimiento_ids) ? o.movimiento_ids.length : 0, 1);
  const abono = o.tipo === "ABONO";
  const que = n === 1 ? (abono ? "abono" : "cargo") : abono ? "abonos" : "cargos";
  const facturas = (Array.isArray(o.facturas) ? o.facturas : []).filter((f) => typeof f === "string" && f.trim());
  const conceptos = (Array.isArray(o.conceptos) ? o.conceptos : []).filter((c) => typeof c === "string" && c.trim());
  const dice =
    facturas.length > 0
      ? `: el archivo dice ${listaY(facturas)}`
      : conceptos.length > 0
        ? `: el archivo dice ${listaY(conceptos.map((c) => `«${recortar(c)}»`))}`
        : "";
  return `${fmtDateOnly(o.fecha)} · ${fmtInt(n)} ${que} de ${fmtMonto(o.monto, o.moneda)}${dice}`;
}

/** «30 sep 2026 · Cargo de $212 MXN vinculado a un gasto en efectivo (su justificación cita la descripción del banco)». */
function lineaVinculo(o: EnriquecimientoOmitido): string {
  const n = Array.isArray(o.movimiento_ids) ? o.movimiento_ids.length : 0;
  const monto = fmtMonto(o.monto, o.moneda);
  return n > 1
    ? `${fmtDateOnly(o.fecha)} · ${fmtInt(n)} cargos de ${monto} vinculados a gastos en efectivo (sus justificaciones citan la descripción del banco)`
    : `${fmtDateOnly(o.fecha)} · ${tipoTexto(o.tipo)} de ${monto} vinculado a un gasto en efectivo (su justificación cita la descripción del banco)`;
}

/** Las primeras `max` líneas y, si hay más, «y N más» contra el conteo real. */
function conMas(lineas: string[], total: number, max: number): string[] {
  const visibles = lineas.slice(0, max);
  const resto = Math.max(total, lineas.length) - visibles.length;
  return resto > 0 ? [...visibles, `y ${fmtInt(resto)} más`] : visibles;
}

/**
 * Bloques del detalle al terminar la importación (o «Solo completar
 * conceptos»): los gemelos que se quedaron sin concepto (y cómo resolverlo),
 * los cargos ligados a un gasto en efectivo que conservaron su descripción,
 * los que alguien editó a la vez o fallaron, las líneas que NO se encontraron
 * (y NO se agregaron) y las nuevas con la misma fecha y monto que otra que ya
 * estaba. `max` = líneas por bloque antes de «y N más». [] = nada que decir.
 */
export function lineasDetalleImport(job: ImportJobDetalleLike | null | undefined, max = 10): BloqueDetalleImport[] {
  if (!job) return [];
  const bloques: BloqueDetalleImport[] = [];
  const omitidos = (Array.isArray(job.enriquecimiento?.omitidos) ? job.enriquecimiento!.omitidos! : []).filter(
    (o): o is EnriquecimientoOmitido => !!o && typeof o.motivo === "string",
  );

  const gemelos = omitidos.filter((o) => o.motivo === "GEMELOS");
  if (gemelos.length > 0) {
    const pies = [
      gemelos.some((o) => o.tipo !== "ABONO") ? PIE_GEMELOS_CARGOS : null,
      gemelos.some((o) => o.tipo === "ABONO") ? PIE_GEMELOS_ABONOS : null,
    ].filter((p): p is string => !!p);
    bloques.push({
      clave: "gemelos",
      titulo: TITULO_DETALLE_GEMELOS,
      lineas: conMas(gemelos.map(lineaGemelos), gemelos.length, max),
      pie: pies.join(" "),
    });
  }

  const vinculo = omitidos.filter((o) => o.motivo === "VINCULO_NO_BANCARIO");
  if (vinculo.length > 0) {
    bloques.push({
      clave: "vinculo",
      titulo: TITULO_DETALLE_VINCULO,
      lineas: conMas(vinculo.map(lineaVinculo), vinculo.length, max),
      pie: null,
    });
  }

  const contar = (lista: EnriquecimientoOmitido[]) =>
    lista.reduce((acc, o) => acc + Math.max(Array.isArray(o.movimiento_ids) ? o.movimiento_ids.length : 0, 1), 0);
  const concurrentes = contar(omitidos.filter((o) => o.motivo === "CAMBIO_CONCURRENTE"));
  if (concurrentes > 0) {
    bloques.push({
      clave: "concurrente",
      titulo: null,
      lineas: [
        concurrentes === 1
          ? "1 no se completó porque alguien lo editó al mismo tiempo: vuelve a subir el archivo."
          : `${fmtInt(concurrentes)} no se completaron porque alguien los editó al mismo tiempo: vuelve a subir el archivo.`,
      ],
      pie: null,
    });
  }
  // ERROR y cualquier motivo nuevo del API (se dice sin el código).
  const conocidos = new Set(["GEMELOS", "VINCULO_NO_BANCARIO", "CAMBIO_CONCURRENTE"]);
  const errores = contar(omitidos.filter((o) => !conocidos.has(o.motivo)));
  if (errores > 0) {
    bloques.push({
      clave: "error",
      titulo: null,
      lineas: [
        errores === 1
          ? "1 no se pudo completar: vuelve a subir el archivo."
          : `${fmtInt(errores)} no se pudieron completar: vuelve a subir el archivo.`,
      ],
      pie: null,
    });
  }

  const noEncontrados = (Array.isArray(job.no_encontrados_detalle) ? job.no_encontrados_detalle : []).filter(Boolean);
  const nNoEncontrados = Math.max(entero(job.no_encontrados), noEncontrados.length);
  if (nNoEncontrados > 0) {
    bloques.push({
      clave: "no_encontrados",
      titulo: TITULO_NO_ENCONTRADOS,
      lineas: conMas(
        noEncontrados.map((n) => `${lineaMovimiento(n, n.moneda, true)}${n.factura ? ` · ${n.factura}` : ""}`),
        nNoEncontrados,
        max,
      ),
      pie: PIE_NO_ENCONTRADOS,
    });
  }

  const mismoDia = (Array.isArray(job.nuevos_mismo_dia_y_monto_detalle) ? job.nuevos_mismo_dia_y_monto_detalle : []).filter(
    Boolean,
  );
  const nMismoDia = Math.max(entero(job.nuevos_mismo_dia_y_monto), mismoDia.length);
  if (nMismoDia > 0) {
    bloques.push({
      clave: "mismo_dia",
      titulo: TITULO_NUEVOS_MISMO_DIA,
      lineas: conMas(
        mismoDia.map((n) => lineaMovimiento(n, n.moneda, true)),
        nMismoDia,
        max,
      ),
      pie: PIE_NUEVOS_MISMO_DIA,
    });
  }
  return bloques;
}

/**
 * ¿El diálogo se queda ABIERTO al terminar? Solo si hay algo que leer:
 * filas sin concepto, líneas no encontradas o nuevas con la misma fecha y
 * monto que otras (cerrar con un toast de 10 s lo perdía).
 */
export function debeQuedarseAbierto(job: ImportJobDetalleLike | null | undefined): boolean {
  if (!job || job.estado !== "LISTO") return false;
  return (
    entero(job.enriquecimiento_omitidos) > 0 || entero(job.no_encontrados) > 0 || entero(job.nuevos_mismo_dia_y_monto) > 0
  );
}
