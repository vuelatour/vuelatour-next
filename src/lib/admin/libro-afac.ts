/**
 * AFAC POR VUELO EDITABLE EN EL LIBRO EN PANTALLA (16-oct-2026, API 0.0.89,
 * invariante 90 del API) — reglas PURAS del panel.
 *
 * Pedido del cliente: «…en balance general en la hoja de Otros movimientos
 * para poder confirmar el monto… dos columnas juntas, una que sea lo
 * reservado de afac o cotizado y otra de lo que realmente costó y que en esa
 * celda poder poner el monto y se registre sin tenerte que ir a otro lado.»
 * Y después: «la columna nueva que te pedí mejor que sea en la columna de
 * egreso». pyservices pinta una fila por vuelo con el RESERVADO en INGRESO y
 * el COSTO REAL en EGRESO, y marca esa celda de egreso con un `vinculo`
 * `afac_real` (`VinculoAfacReal`). Aquí vive TODO lo que el panel decide:
 *
 *  - quién edita (`ROLES_AFAC_REAL`, espejo del API, y `config.afac_real`);
 *  - leer el vínculo (`leerVinculoAfacReal`: otra forma ⇒ solo lectura);
 *  - leer lo tecleado (`parsearMontoAfac`) y qué hacer con ello
 *    (`decidirGuardadoAfac`: nada, guardar, quitar —con confirmación— o error);
 *  - el valor «optimista» que se enseña tras guardar (`prepararHojaAfac`:
 *    el número tecleado con el formato de la celda, el concepto de su fila
 *    y, como en Excel, las fórmulas visibles de la hoja que dependen de esa
 *    celda —remanente, TOTALES, «AFAC DEL PERIODO»— recalculadas con
 *    `lib/admin/libro-recalculo.ts`) y cuándo se descarta
 *    (`depurarCambiosAfac`);
 *  - los textos (tooltips, barra, toasts, confirmación, errores).
 *
 * El panel NO decide dinero: el reservado y cada número del libro llegan del
 * servidor; lo único que hace al teclear es evaluar las fórmulas que el libro
 * ya trae (16-oct-2026: «falta que el remanente se ajuste…»). Tras guardar se
 * pide UN refresco del libro 15 s después del último guardado
 * (`RETRASO_REFRESCO_AFAC_MS`, decisión D10 del contrato: el general tarda
 * decenas de segundos y 75 celdas = 75 regeneraciones) y ese libro reemplaza
 * lo recalculado (incluido el bloque VUELATOUR de 'balance', otra hoja).
 */
import { fmtDecimal } from "@/lib/format";
import { esUuid } from "@/lib/admin/url-params";
import { esErrorTecnico } from "@/lib/admin/errores-tecnicos";
import { avisoMesCerrado } from "@/lib/admin/mes-cerrado";
import type { RespuestaAfacReal } from "@/types/afac";
import type {
  EdicionCeldaLibro,
  LibroExcel,
  LibroExcelCelda,
  LibroExcelEstilo,
  LibroExcelHoja,
  VinculoAfacReal,
} from "@/types/libro-excel";
import type { Rol } from "@/types/me";
import { llaveCelda, recalcularDependientes } from "@/lib/admin/libro-recalculo";

// =============================================================================
// Quién captura
// =============================================================================

/** Espejo de `ROLES_AFAC_REAL` del API (`common/afac-real.util.ts`): el PUT
 *  y la marca «Pago de AFAC» del gasto. ANALISTA ve el libro sin editar. */
export const ROLES_AFAC_REAL = ["ADMIN", "FACTURACION", "COORDINADOR"] as const satisfies readonly Rol[];

type MeAfac = { rol?: string | null; config?: { afac_real?: unknown } | null } | null | undefined;

/** ¿La base ya tiene la migración del AFAC por vuelo? (`config.afac_real` de
 *  `/v1/me`; ausente = API previo ⇒ false). */
export function afacRealHabilitado(me: MeAfac): boolean {
  return me?.config?.afac_real === true;
}

/** ¿Este usuario puede capturar el costo real y marcar pagos de AFAC? */
export function puedeEditarAfacReal(me: MeAfac): boolean {
  return (
    afacRealHabilitado(me) &&
    typeof me?.rol === "string" &&
    (ROLES_AFAC_REAL as readonly string[]).includes(me.rol)
  );
}

// =============================================================================
// El vínculo de la celda
// =============================================================================

/** Número finito ≥ 0, o null; `undefined` = la forma no sirve. */
function montoONull(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
  return v;
}

const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * El vínculo `afac_real` de una celda, VALIDADO. Cualquier otra forma (otro
 * tipo, sin vuelo uuid, monto negativo o no numérico, sin `editable`) ⇒ null
 * ⇒ la celda es de solo lectura, como siempre.
 */
export function leerVinculoAfacReal(
  celda: Pick<LibroExcelCelda, "vinculo"> | null | undefined,
): VinculoAfacReal | null {
  const v = celda?.vinculo;
  if (!v || typeof v !== "object") return null;
  if (v.tipo !== "afac_real" || v.campo !== "costo_real_mxn") return null;
  if (typeof v.vuelo_id !== "string" || !esUuid(v.vuelo_id)) return null;
  if (typeof v.editable !== "boolean") return null;
  const valor = montoONull(v.valor);
  const reservado = montoONull(v.reservado_mxn);
  if (valor === undefined || reservado === undefined) return null;
  return {
    tipo: "afac_real",
    campo: "costo_real_mxn",
    vuelo_id: v.vuelo_id,
    clave: textoONull(v.clave),
    matricula: textoONull(v.matricula),
    valor,
    reservado_mxn: reservado,
    editable: v.editable,
    motivo: textoONull(v.motivo),
    mes: textoONull(v.mes),
    capturado_por: textoONull(v.capturado_por),
    capturado_at: textoONull(v.capturado_at),
  };
}

/** «#236 · Ambulancia Internacional» o, sin clave, «este vuelo». */
export function nombreVueloAfac(v: Pick<VinculoAfacReal, "clave">): string {
  return v.clave ?? "este vuelo";
}

// =============================================================================
// Lo que se teclea
// =============================================================================

export const MONTO_AFAC_MAXIMO = 999_999_999_999.99;
export const MSG_MONTO_AFAC_INVALIDO = "Escribe el monto en pesos, por ejemplo 4427.80";
export const MSG_MONTO_AFAC_NEGATIVO = "El costo real no puede ser negativo. Escribe 0 si AFAC no cobró.";
export const MSG_MONTO_AFAC_DECIMALES = "El costo real lleva a lo más 2 decimales, por ejemplo 4427.80";
export const MSG_MONTO_AFAC_MAXIMO = "Ese monto es demasiado grande. Revisa el costo real.";

export type MontoAfacLeido =
  | { tipo: "vacio" }
  | { tipo: "monto"; valor: number }
  | { tipo: "error"; mensaje: string };

/** Miles con coma (es-MX: «4,427.80») o sin separador («4427.8»). */
const RE_MONTO = /^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$/;

/**
 * Lo que el operador tecleó en la celda, en pesos: «4,427.80», «4427.8»,
 * «$4,427.80», «4427.80 MXN» ⇒ número; «» ⇒ vacío (quitar); negativo, más de
 * 2 decimales, comas fuera de lugar («4427,80») o basura ⇒ error con el
 * texto que se le enseña. 0 es válido (AFAC no cobró), distinto de vacío.
 */
export function parsearMontoAfac(texto: string): MontoAfacLeido {
  let t = (texto ?? "").trim();
  if (t === "") return { tipo: "vacio" };
  const negativo = /^-/.test(t) || /^\$\s*-/.test(t) || /^\(.*\)$/.test(t);
  if (negativo) return { tipo: "error", mensaje: MSG_MONTO_AFAC_NEGATIVO };
  t = t.replace(/\s*MXN$/i, "").replace(/^\$\s*/, "").trim();
  if (t === "" || t === ".") return { tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO };
  const m = RE_MONTO.exec(t);
  if (!m) return { tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO };
  if ((m[1] ?? "").length > 2) return { tipo: "error", mensaje: MSG_MONTO_AFAC_DECIMALES };
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO };
  if (n > MONTO_AFAC_MAXIMO) return { tipo: "error", mensaje: MSG_MONTO_AFAC_MAXIMO };
  return { tipo: "monto", valor: Math.round(n * 100) / 100 };
}

const centavos = (n: number): number => Math.round(n * 100);

/** ¿Mismo monto al centavo? (null solo es igual a null). */
export function mismoMontoAfac(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return centavos(a) === centavos(b);
}

export type DecisionAfac =
  | { accion: "nada" }
  | { accion: "guardar"; monto: number }
  | { accion: "quitar" }
  | { accion: "error"; mensaje: string };

/**
 * Qué hacer al terminar de editar: lo mismo (o vacío sobre vacío) ⇒ nada;
 * vacío sobre un valor ⇒ quitar (SIEMPRE con confirmación: regla del
 * cliente); un monto distinto ⇒ guardar; lo ilegible ⇒ error.
 */
export function decidirGuardadoAfac(texto: string, actual: number | null): DecisionAfac {
  const leido = parsearMontoAfac(texto);
  if (leido.tipo === "error") return { accion: "error", mensaje: leido.mensaje };
  if (leido.tipo === "vacio") return actual === null ? { accion: "nada" } : { accion: "quitar" };
  return mismoMontoAfac(leido.valor, actual) ? { accion: "nada" } : { accion: "guardar", monto: leido.valor };
}

/** Lo que trae el cuadro al abrirse con Enter, F2 o doble clic: el valor
 *  crudo con 2 decimales y sin comas («4427.80»), o vacío. */
export function textoEdicionInicial(valor: number | null): string {
  return valor === null ? "" : valor.toFixed(2);
}

export type TeclaEdicionAfac = { tipo: "editar" } | { tipo: "vaciar" } | { tipo: "teclear"; texto: string };

/**
 * Teclas que, sobre una celda editable SELECCIONADA (sin el cuadro abierto),
 * hacen lo que en Excel: Enter o F2 abren la edición con el valor; un dígito
 * o el punto la abren REEMPLAZANDO con esa tecla; Supr o Retroceso piden
 * quitar el valor (con confirmación). Con Ctrl/⌘/Alt no hacen nada aquí.
 */
export function teclaEdicionAfac(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): TeclaEdicionAfac | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Enter" || e.key === "F2") return { tipo: "editar" };
  if (e.key === "Delete" || e.key === "Backspace") return { tipo: "vaciar" };
  if (/^[0-9.]$/.test(e.key)) return { tipo: "teclear", texto: e.key };
  return null;
}

// =============================================================================
// El cambio «optimista» (lo tecleado mientras llega el libro nuevo)
// =============================================================================

/**
 * Lo que el panel enseña en la celda de UN vuelo después de capturar, hasta
 * que el libro que llega del servidor ya lo traiga. `guardando` = el PUT o el
 * DELETE no ha contestado (la celda no se deja editar); `guardado` = el API lo
 * aceptó (`guardadoEn` = hora del navegador al recibir el OK).
 */
export interface CambioAfacLocal {
  valor: number | null;
  estado: "guardando" | "guardado";
  guardadoEn: number | null;
}

/** Por `vuelo_id`. */
export type CambiosAfac = Readonly<Record<string, CambioAfacLocal>>;

export const SIN_CAMBIOS_AFAC: CambiosAfac = Object.freeze({});

/** Un refresco pedido ≥ este margen DESPUÉS del guardado ya trae lo guardado
 *  aunque el reloj del navegador y el del servidor difieran unos segundos. */
export const MARGEN_LIBRO_NUEVO_MS = 60_000;

/** Un solo refresco del libro, 15 s después del ÚLTIMO guardado. */
export const RETRASO_REFRESCO_AFAC_MS = 15_000;

/** `generado` del libro en ms, solo si trae hora (ISO con «T»); si no, null. */
function msGenerado(generado: string | null | undefined): number | null {
  if (typeof generado !== "string" || !generado.includes("T")) return null;
  const ms = Date.parse(generado);
  return Number.isFinite(ms) ? ms : null;
}

/** El costo real que el libro enseña para cada vuelo EDITABLE (celdas de cualquier hoja). */
export function valoresAfacDelLibro(libro: Pick<LibroExcel, "hojas">): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const hoja of libro.hojas) {
    for (const celda of hoja.celdas) {
      const v = leerVinculoAfacReal(celda);
      if (v?.editable && !out.has(v.vuelo_id)) out.set(v.vuelo_id, v.valor);
    }
  }
  return out;
}

/**
 * Al llegar un libro NUEVO, qué cambios locales ya sobran: el que el libro ya
 * trae (mismo monto), el de un vuelo que ya no tiene celda editable, y el que
 * es más viejo que el libro por más de `MARGEN_LIBRO_NUEVO_MS` (el servidor
 * manda: otra persona lo cambió después). Se quedan los que siguen
 * «guardando» y los que el libro todavía no alcanza (un refresco pedido ANTES
 * del guardado). Sin nada que quitar devuelve el MISMO objeto.
 */
export function depurarCambiosAfac(
  cambios: CambiosAfac,
  libro: Pick<LibroExcel, "hojas" | "generado">,
  margenMs: number = MARGEN_LIBRO_NUEVO_MS,
): CambiosAfac {
  const ids = Object.keys(cambios);
  if (ids.length === 0) return cambios;
  const valores = valoresAfacDelLibro(libro);
  const generado = msGenerado(libro.generado);
  const quedan: Record<string, CambioAfacLocal> = {};
  let quito = false;
  for (const id of ids) {
    const c = cambios[id];
    const sobra =
      c.estado === "guardado" &&
      (!valores.has(id) ||
        mismoMontoAfac(valores.get(id) ?? null, c.valor) ||
        (generado !== null && c.guardadoEn !== null && generado > c.guardadoEn + margenMs));
    if (sobra) quito = true;
    else quedan[id] = c;
  }
  return quito ? quedan : cambios;
}

/** Tras un rechazo: el vuelo vuelve a lo que enseñaba ANTES de intentar
 *  (el cambio local previo, o el valor del libro si no había). */
export function restaurarCambioAfac(
  cambios: CambiosAfac,
  vueloId: string,
  anterior: CambioAfacLocal | undefined,
): CambiosAfac {
  const { [vueloId]: _actual, ...resto } = cambios;
  void _actual;
  return anterior ? { ...resto, [vueloId]: anterior } : resto;
}

/** Cuántos cambios esperan respuesta y cuántos esperan el libro nuevo. */
export function conteoCambiosAfac(cambios: CambiosAfac): { guardando: number; guardados: number } {
  let guardando = 0;
  let guardados = 0;
  for (const c of Object.values(cambios)) {
    if (c.estado === "guardando") guardando += 1;
    else guardados += 1;
  }
  return { guardando, guardados };
}

/** El monto con el formato de la celda: «4,500.00» (`#,##0.00`) o
 *  «$4,500.00» (`"$"#,##0.00`); null ⇒ vacío. SOLO formato, ningún cálculo. */
export function textoMontoComoLibro(valor: number | null, nf: string | null | undefined): string {
  if (valor === null) return "";
  const base = fmtDecimal(valor, 2);
  const primera = (nf ?? "").split(";")[0];
  return /^"?\$"?/.test(primera) ? `$${base}` : base;
}

export const TITULO_CELDA_AFAC_EDITABLE =
  "Costo real AFAC de este vuelo (lo paga VuelaTour): doble clic, Enter o empieza a escribir para capturarlo; Supr para quitarlo.";
export const TITULO_CELDA_AFAC_SIN_ROL = "Solo administración, facturación o coordinación captura el costo real.";
export const TITULO_CELDA_AFAC_GUARDANDO = "Guardando el costo real AFAC…";
export const TITULO_CELDA_AFAC_BLOQUEADA = "El costo real AFAC de este vuelo no se puede capturar aquí.";

/** El tooltip de la celda: cómo capturarla o, si no se puede, por qué. */
export function tituloEdicionAfac(
  v: Pick<VinculoAfacReal, "editable" | "motivo">,
  opciones: { puedeEditar: boolean; guardando?: boolean },
): string {
  if (opciones.guardando) return TITULO_CELDA_AFAC_GUARDANDO;
  if (!v.editable) return v.motivo ?? TITULO_CELDA_AFAC_BLOQUEADA;
  return opciones.puedeEditar ? TITULO_CELDA_AFAC_EDITABLE : TITULO_CELDA_AFAC_SIN_ROL;
}

/** Concepto del EGRESO de una fila AFAC por capturar: COPIA EXACTA de
 *  `CONCEPTO_AFAC_REAL_POR_CAPTURAR` del API (`common/afac-real.util.ts`). */
export const CONCEPTO_AFAC_REAL_POR_CAPTURAR = "AFAC costo real · por capturar";
/** El concepto de la fila mientras el PUT/DELETE no contesta. */
export const CONCEPTO_AFAC_REAL_GUARDANDO = "AFAC costo real · guardando…";
/** El concepto de la fila con el monto ya guardado y el libro nuevo en camino
 *  (el servidor lo reemplaza por «AFAC costo real · capturó Ale el 16/10/2026»). */
export const CONCEPTO_AFAC_REAL_CAPTURADO_AHORA = "AFAC costo real · capturado ahora";
/** Cómo empieza el concepto del egreso de una fila AFAC (lo arma el API). */
const PREFIJO_CONCEPTO_AFAC_REAL = "AFAC costo real ·";

/** El concepto que enseña la fila con un cambio local (ver arriba). */
export function conceptoAfacLocal(cambio: Pick<CambioAfacLocal, "valor" | "estado">): string {
  if (cambio.estado === "guardando") return CONCEPTO_AFAC_REAL_GUARDANDO;
  return cambio.valor === null ? CONCEPTO_AFAC_REAL_POR_CAPTURAR : CONCEPTO_AFAC_REAL_CAPTURADO_AHORA;
}

/**
 * La hoja tal como se PINTA: cada celda `afac_real` gana su `edicion`
 * (editable / bloqueada / guardando + tooltip) y, si hay un cambio local de
 * ese vuelo, el número tecleado (`v`, `t` con el formato de la celda y
 * `vinculo.valor`). Solo la celda EDITABLE de un vuelo recibe el cambio (en
 * un vuelo de varios aviones las demás filas no llevan el real).
 *
 * Con un cambio local la hoja además se ve COMO EN EXCEL al escribir en una
 * celda (pedido del 16-oct-2026: «falta que el remanente se ajuste cuando se
 * agregue el costo real del egreso»): el concepto del egreso de esa fila
 * (`conceptoAfacLocal`, solo si es el «AFAC costo real · …» del API, a su
 * izquierda) y las FÓRMULAS VISIBLES de la hoja que dependen de la celda
 * —remanente de la fila, TOTALES, bloque «AFAC DEL PERIODO»— se recalculan
 * con `recalcularDependientes` (`lib/admin/libro-recalculo.ts`). El libro
 * nuevo del servidor reemplaza todo al llegar. Sin celdas `afac_real`
 * devuelve la MISMA hoja (el marcado de siempre, byte a byte).
 */
export function prepararHojaAfac(
  hoja: LibroExcelHoja,
  opciones: { cambios: CambiosAfac; puedeEditar: boolean; estilos: readonly LibroExcelEstilo[] },
): LibroExcelHoja {
  let toco = false;
  const cambiadas = new Set<string>();
  /** Fila ⇒ columna de la celda AFAC con cambio local y el concepto que lleva. */
  const conceptos = new Map<number, { c: number; texto: string }>();
  const celdas = hoja.celdas.map((celda) => {
    const v = leerVinculoAfacReal(celda);
    if (!v) return celda;
    toco = true;
    const cambio = v.editable ? opciones.cambios[v.vuelo_id] : undefined;
    const guardando = cambio?.estado === "guardando";
    const edicion: EdicionCeldaLibro = {
      estado: guardando ? "guardando" : opciones.puedeEditar && v.editable ? "editable" : "bloqueada",
      titulo: tituloEdicionAfac(v, { puedeEditar: opciones.puedeEditar, guardando }),
    };
    if (!cambio) return { ...celda, edicion };
    const nf = celda.s != null ? opciones.estilos[celda.s]?.nf : undefined;
    const conValor: LibroExcelCelda = {
      ...celda,
      v: cambio.valor,
      t: textoMontoComoLibro(cambio.valor, nf),
      vinculo: { ...celda.vinculo, valor: cambio.valor },
      edicion,
    };
    // Lo tecleado reemplaza a lo que hubiera (como en Excel): sin fórmula.
    delete conValor.f;
    if (!mismoMontoAfac(typeof celda.v === "number" ? celda.v : null, cambio.valor)) {
      cambiadas.add(llaveCelda(celda.r, celda.c));
    }
    conceptos.set(celda.r, { c: celda.c, texto: conceptoAfacLocal(cambio) });
    return conValor;
  });
  if (!toco) return hoja;
  const conConcepto = conceptos.size ? conConceptoAfacLocal(celdas, conceptos) : celdas;
  return { ...hoja, celdas: recalcularDependientes(conConcepto, cambiadas, opciones.estilos) };
}

/** El concepto del egreso de las filas con cambio local: la celda de texto
 *  «AFAC costo real · …» más cercana a la IZQUIERDA de la celda tecleada, en
 *  su misma fila. Cualquier otra celda se queda como vino. */
function conConceptoAfacLocal(
  celdas: LibroExcelCelda[],
  conceptos: ReadonlyMap<number, { c: number; texto: string }>,
): LibroExcelCelda[] {
  const destino = new Map<number, number>();
  for (const celda of celdas) {
    const x = conceptos.get(celda.r);
    if (!x || celda.c >= x.c) continue;
    if (typeof celda.v !== "string" || !celda.v.startsWith(PREFIJO_CONCEPTO_AFAC_REAL)) continue;
    destino.set(celda.r, Math.max(destino.get(celda.r) ?? 0, celda.c));
  }
  if (destino.size === 0) return celdas;
  return celdas.map((celda) => {
    if (destino.get(celda.r) !== celda.c) return celda;
    const texto = conceptos.get(celda.r)?.texto;
    if (!texto || celda.v === texto) return celda;
    return { ...celda, v: texto, t: texto };
  });
}

/**
 * El cuadro está ABIERTO y llega un libro nuevo (refresco diferido, «Actualizar
 * datos» o RefreshOnFocus al volver de otra ventana —el cuadro sigue abierto
 * al cambiar de ventana—). Revisión 16-oct-2026: el cuadro guarda en el vuelo
 * de SU vínculo pero se pinta sobre la celda (r, c); si en el libro nuevo esa
 * celda ya es de OTRO vuelo (llegó o se fue una fila), o ya no se puede
 * capturar (mes cerrado, fila de otro avión), lo tecleado se guardaría en un
 * vuelo distinto del que se ve. Devuelve:
 *  - null ⇒ cerrar el cuadro SIN guardar (`MSG_AFAC_CELDA_CAMBIO`);
 *  - el MISMO vínculo si nada que importe cambió (sin re-render);
 *  - el vínculo fresco si el valor que se enseña cambió (otra persona lo
 *    capturó): «sin cambios» y la confirmación de quitar comparan contra él.
 * `hoja` = la hoja CRUDA del libro nuevo que se está enseñando; `cambios` = los
 * locales ya depurados (el valor que se enseña es el local si lo hay).
 */
export function revisarEditorAfac(
  editor: { r: number; c: number; vinculo: VinculoAfacReal },
  hoja: Pick<LibroExcelHoja, "celdas"> | null | undefined,
  cambios: CambiosAfac,
): VinculoAfacReal | null {
  const celda = hoja?.celdas.find((x) => x.r === editor.r && x.c === editor.c) ?? null;
  const v = leerVinculoAfacReal(celda);
  if (!v || !v.editable || v.vuelo_id !== editor.vinculo.vuelo_id) return null;
  const cambio = cambios[v.vuelo_id];
  if (cambio?.estado === "guardando") return null;
  const valor = cambio ? cambio.valor : v.valor;
  return mismoMontoAfac(valor, editor.vinculo.valor) ? editor.vinculo : { ...v, valor };
}

/** Clase de la celda según su estado de edición (styles/libro-excel.css). */
export function claseEdicionCelda(edicion: EdicionCeldaLibro | null | undefined): string | undefined {
  if (!edicion) return undefined;
  return `xl-edicion-${edicion.estado}`;
}

// =============================================================================
// El cuadro de edición encima de la celda
// =============================================================================

export interface CajaEditorAfac {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Dónde va el cuadro de edición: el rectángulo REAL de la celda (medido en el
 * DOM: el alto de fila del libro es nominal y una fila con ajuste puede
 * crecer) pasado a coordenadas del CONTENIDO del marco con scroll (el cuadro
 * es hijo absoluto del marco y se desplaza con las celdas).
 */
export function cajaEditorAfac(
  celda: { left: number; top: number; width: number; height: number },
  marco: { left: number; top: number },
  scroll: { scrollLeft: number; scrollTop: number; clientLeft: number; clientTop: number },
): CajaEditorAfac {
  return {
    left: Math.round(celda.left - marco.left - scroll.clientLeft + scroll.scrollLeft),
    top: Math.round(celda.top - marco.top - scroll.clientTop + scroll.scrollTop),
    width: Math.max(0, Math.round(celda.width)),
    height: Math.max(0, Math.round(celda.height)),
  };
}

// =============================================================================
// Textos de la barra, toasts, confirmación y errores
// =============================================================================

/** El estado de la captura que se enseña a la derecha de la barra de fórmulas. */
export interface EstadoBarraAfac {
  tono: "error" | "guardando" | "guardado" | "ayuda" | "bloqueada";
  texto: string;
}

export const TEXTO_BARRA_AFAC_GUARDANDO = "Guardando el costo real AFAC…";
export const TEXTO_BARRA_AFAC_EDITANDO = "Enter guarda · Esc cancela";
export const TEXTO_BARRA_AFAC_AYUDA = "Costo real AFAC: doble clic o Enter para capturarlo";

export function textoCambiosGuardadosAfac(n: number): string {
  return `${n === 1 ? "1 cambio guardado" : `${n} cambios guardados`} · el resto del libro se actualiza en unos segundos`;
}

/**
 * Qué dice la barra (null = nada): el último error manda (en pantalla
 * completa el toast no se ve: la barra sí); luego «Guardando…», luego cómo
 * terminar si se está editando, luego POR QUÉ no se puede capturar la celda
 * seleccionada (`motivoCelda`: el tooltip de una celda AFAC bloqueada —mes
 * cerrado, fila de otro avión—; revisión 16-oct-2026: el doble clic o Enter
 * sobre ella no hacía nada y nada lo explicaba sin pasar el ratón), luego los
 * cambios que esperan el libro nuevo, luego la ayuda de la celda editable.
 */
export function estadoBarraAfac(p: {
  cambios: CambiosAfac;
  error: string | null;
  editando: boolean;
  celdaEditable: boolean;
  motivoCelda?: string | null;
}): EstadoBarraAfac | null {
  if (p.error) return { tono: "error", texto: p.error };
  const { guardando, guardados } = conteoCambiosAfac(p.cambios);
  if (guardando > 0) return { tono: "guardando", texto: TEXTO_BARRA_AFAC_GUARDANDO };
  if (p.editando) return { tono: "ayuda", texto: TEXTO_BARRA_AFAC_EDITANDO };
  if (p.motivoCelda) return { tono: "bloqueada", texto: p.motivoCelda };
  if (guardados > 0) return { tono: "guardado", texto: textoCambiosGuardadosAfac(guardados) };
  if (p.celdaEditable) return { tono: "ayuda", texto: TEXTO_BARRA_AFAC_AYUDA };
  return null;
}

export const ETIQUETA_QUITAR_AVISO_AFAC = "Quitar aviso";

/** «#236» si el API mandó el folio; si no, la clave de la fila. */
function referenciaVuelo(folio: number | null | undefined, v: Pick<VinculoAfacReal, "clave">): string {
  return typeof folio === "number" && Number.isFinite(folio) ? `#${folio}` : nombreVueloAfac(v);
}

export function toastGuardadoAfac(folio: number | null | undefined, v: Pick<VinculoAfacReal, "clave">): string {
  return `Costo real AFAC guardado · ${referenciaVuelo(folio, v)}`;
}

export function toastQuitadoAfac(folio: number | null | undefined, v: Pick<VinculoAfacReal, "clave">): string {
  return `Costo real AFAC quitado · ${referenciaVuelo(folio, v)}`;
}

export const TITULO_QUITAR_AFAC = "¿Quitar el costo real AFAC?";
export const BOTON_QUITAR_AFAC = "Quitar";
export const BOTON_QUITANDO_AFAC = "Quitando…";
export const BOTON_CANCELAR_AFAC = "Cancelar";

/** El cuerpo de la confirmación (acción destructiva: regla del cliente). */
export function textoQuitarAfac(v: Pick<VinculoAfacReal, "clave" | "valor">): string {
  const hoy = v.valor === null ? "" : ` Hoy tiene $${fmtDecimal(v.valor, 2)}.`;
  return `¿Quitar el costo real AFAC de ${nombreVueloAfac(v)}? El vuelo vuelve a «sin capturar» y deja de contar como egreso de VuelaTour.${hoy}`;
}

/** El costo real que quedó según la respuesta (numeric de PostgREST como texto
 *  incluido); sin respuesta legible, lo que se mandó. */
export function costoRealDeRespuesta(
  data: Pick<RespuestaAfacReal, "costo_real_mxn"> | null | undefined,
  enviado: number | null,
): number | null {
  if (!data || !("costo_real_mxn" in data)) return enviado;
  const v = data.costo_real_mxn;
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : enviado;
}

export const MSG_AFAC_SIN_RESPUESTA =
  "No hubo respuesta del servidor. Pulsa «Actualizar datos» para ver si se guardó antes de volver a intentarlo.";
export const MSG_AFAC_API_PREVIO =
  "El costo real AFAC necesita la actualización del servidor (API 0.0.89). Vuelve a intentarlo más tarde.";
export const MSG_AFAC_SIN_PERMISO = TITULO_CELDA_AFAC_SIN_ROL;
export const MSG_AFAC_SESION = "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
/** 404 `VUELO_NO_EXISTE` (revisión 16-oct-2026): el API lo manda en inglés
 *  con el uuid («Vuelo 5e2a… not found»); al operador, esto. */
export const MSG_AFAC_VUELO_NO_EXISTE =
  "Este vuelo ya no existe (lo borraron o lo cambiaron). Pulsa «Actualizar datos».";
/** El libro llegó nuevo con el cuadro abierto y esa celda ya es de otro
 *  vuelo o ya no se puede capturar (revisión 16-oct-2026). */
export const MSG_AFAC_CELDA_CAMBIO =
  "El libro se actualizó mientras capturabas y esa celda cambió: no se guardó nada. Vuelve a abrirla.";

/** El resultado fallido de una action (`ActionResult`). */
export interface FalloAfac {
  ok?: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
  details?: unknown;
}

/**
 * El texto de un rechazo del PUT/DELETE: el 409 `MES_CERRADO` y los 400/503
 * del API TAL CUAL (vienen en es-MX); lo técnico (inglés, red, 5xx sin
 * mensaje) se cambia por un texto que dice qué hacer. Un fallo sin respuesta
 * PUDO aplicarse: el texto pide actualizar antes de reintentar (el PUT es
 * idempotente: repetirlo no duplica nada).
 */
export function mensajeErrorAfac(r: FalloAfac): string {
  const mes = avisoMesCerrado(r);
  if (mes) return mes.texto;
  if (r.status === 401) return MSG_AFAC_SESION;
  if (r.status === 403) return MSG_AFAC_SIN_PERMISO;
  if (r.status === 404 && /^Cannot (PUT|DELETE)\b/i.test((r.error ?? "").trim())) return MSG_AFAC_API_PREVIO;
  // El API manda «Vuelo <uuid> not found» (inglés y con el id crudo).
  if (r.code === "VUELO_NO_EXISTE" || (r.status === 404 && /\bnot found\b/i.test(r.error ?? ""))) {
    return MSG_AFAC_VUELO_NO_EXISTE;
  }
  if (r.code === "SIN_CONEXION" || esErrorTecnico({ error: r.error, code: r.code })) return MSG_AFAC_SIN_RESPUESTA;
  return (r.error ?? "").trim();
}

/** Rechazos del API que dicen que el libro en pantalla quedó VIEJO: la
 *  celda se ofrecía para capturar y el servidor dice que ya no (mes cerrado,
 *  vuelo borrado, sin avión o sin fecha, antes del inicio oficial). */
const CODIGOS_AFAC_LIBRO_VIEJO: ReadonlySet<string> = new Set([
  "MES_CERRADO",
  "VUELO_NO_EXISTE",
  "AFAC_VUELO_SIN_AVION",
  "AFAC_VUELO_SIN_FECHA",
  "PERIODO_ANTES_DEL_INICIO",
]);

/**
 * ¿Tras este rechazo hay que volver a leer el libro? (revisión 16-oct-2026)
 * Sí cuando no se sabe si el API escribió (`falloAfacIncierto`) y también
 * cuando el rechazo dice que el libro quedó viejo: sin releerlo, la celda
 * seguía verde y «editable» y el operador reintentaba la misma celda (o las
 * demás del mes cerrado) una y otra vez. Usa el MISMO refresco diferido.
 */
export function falloAfacPideRefresco(r: FalloAfac): boolean {
  if (falloAfacIncierto(r)) return true;
  if (typeof r.code === "string" && CODIGOS_AFAC_LIBRO_VIEJO.has(r.code)) return true;
  return r.status === 404 && /\bnot found\b/i.test(r.error ?? "");
}

/** ¿Un fallo en el que NO se sabe si el API escribió? (sin respuesta, 5xx,
 *  texto técnico): el libro se vuelve a leer para enseñar la verdad. */
export function falloAfacIncierto(r: FalloAfac): boolean {
  if (avisoMesCerrado(r)) return false;
  if (r.code === "SIN_CONEXION" || r.code === "PARSE_ERROR") return true;
  if (typeof r.status === "number" && r.status >= 500 && r.code !== "AFAC_REAL_NO_DISPONIBLE") return true;
  return esErrorTecnico({ error: r.error, code: r.code });
}

/** Validación del lado del panel ANTES de hablar con el API (misma regla que el DTO). */
export function errorMontoParaApi(monto: unknown): string | null {
  if (typeof monto !== "number" || !Number.isFinite(monto)) return MSG_MONTO_AFAC_INVALIDO;
  if (monto < 0) return MSG_MONTO_AFAC_NEGATIVO;
  if (monto > MONTO_AFAC_MAXIMO) return MSG_MONTO_AFAC_MAXIMO;
  if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) return MSG_MONTO_AFAC_DECIMALES;
  return null;
}
