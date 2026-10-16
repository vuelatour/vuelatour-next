/**
 * FACTURAS POR COBRO — un vuelo, varias facturas; cada cobro con la suya
 * (16-oct-2026, API 0.0.82, invariante 84 del API). Lógica PURA del panel;
 * prueba: `__tests__/cobro-factura.test.ts`.
 *
 * Pedido del cliente (captura de la card «Cobro» del vuelo #332 con 4 cobros
 * conciliados y UNA «Factura A-0420»): «necesitamos poder cargar en un vuelo
 * varias facturas y poder vincularlas, porque a veces pasa que unos pagos de
 * los cobros hechos son con una factura y a lo mejor otro con otra factura».
 *
 * La liga cobro ↔ factura (`cobro_vuelo.factura_emitida_id`) es
 * CLASIFICACIÓN: no toca el cobrado, el reparto ni el balance, y aquí no se
 * calcula ningún dinero del vuelo. Lo único que se suma son los montos de
 * los cobros que el operador MARCA (para decirle si cuadran con el total que
 * tecleó) y lo que una factura ya ampara (para no preseleccionar una que ya
 * está completa) — con la MISMA tolerancia de $1.00 del backfill del API.
 *
 * Todo lo que el panel ofrece (selector, casillas, chips) depende de que el
 * API diga `asignacion_disponible: true` en el bloque `factura_servicio`:
 * sin la llave (API previo) o en `false` (sin la migración) no se pinta
 * nada nuevo y JAMÁS viaja `factura_emitida_id` ni `cobro_ids`.
 */
import { fmtDate, fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type {
  AlertaFacturaDetalle,
  CobroCandidatoFactura,
  FacturaEmitidaMini,
  FacturaServicioBloque,
  MonedaFactura,
  VueloDeFactura,
} from "@/types/facturas-emitidas";
import type { FlightCobro } from "@/types/flights";

/** Tolerancia al comparar Σ de cobros contra el total de una factura (espejo del backfill del API). */
export const TOLERANCIA_COBROS_FACTURA = 1.0;

type BloqueLike = Pick<
  FacturaServicioBloque,
  "facturas" | "cobros_sin_factura" | "cobros_sin_factura_exigen" | "asignacion_disponible"
>;

// =============================================================================
// ¿Se puede asignar? (la sonda del API)
// =============================================================================

/** El API ≥ 0.0.82 CON la migración: se ofrecen selector, casillas y chips. */
export function asignacionDisponible(bloque: BloqueLike | null | undefined): boolean {
  return bloque?.asignacion_disponible === true;
}

/** Un cobro que puede llevar factura: positivo y sin sobre de grupo. */
export function cobroAsignable(
  c: Pick<FlightCobro, "monto" | "cobro_grupo_id" | "cobro_grupo">,
): boolean {
  return Number(c.monto) > 0 && c.cobro_grupo_id == null && c.cobro_grupo == null;
}

// =============================================================================
// Lo que una factura ya ampara (de la mini del bloque)
// =============================================================================

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Σ amparada por `f` en SU moneda (0 sin la llave). */
function amparadoEnSuMoneda(f: Pick<FacturaEmitidaMini, "moneda" | "cobros_monto">): number {
  return (f.cobros_monto ?? [])
    .filter((m) => m.moneda === f.moneda)
    .reduce((s, m) => s + numero(m.monto), 0);
}

/**
 * ¿La factura todavía NO ampara todo su total? (Σ amparada en su moneda <
 * total − $1.00). Decide la PRESELECCIÓN del selector del cobro: una
 * vigente ya completa (A-0420 tras el backfill, FA-A-0434) no se
 * preselecciona — preseleccionarla ligaba en silencio la camioneta de
 * $1,700 de #364 a FA-A-0434 y el pre-cierre dejaba de verla. Una liga de
 * menos se ve (chip ámbar); una de más, no.
 */
export function facturaConCupo(
  f: Pick<FacturaEmitidaMini, "moneda" | "total" | "cobros_monto">,
): boolean {
  return amparadoEnSuMoneda(f) < numero(f.total) - TOLERANCIA_COBROS_FACTURA;
}

// =============================================================================
// Selector «Factura» del formulario del cobro
// =============================================================================

export interface OpcionFacturaDeCobro {
  value: string;
  label: string;
  description?: string;
}

/** Primera opción del selector. */
export const OPCION_SIN_FACTURA: OpcionFacturaDeCobro = {
  value: "",
  label: "Sin factura todavía",
};

/** «Ampara $68,208 MXN» / «Ampara $600 USD + $860.47 MXN» / «No ampara ningún cobro todavía». */
export function textoAmparado(f: Pick<FacturaEmitidaMini, "cobros_n" | "cobros_monto">): string {
  const montos = (f.cobros_monto ?? []).filter((m) => numero(m.monto) > 0);
  if ((f.cobros_n ?? 0) <= 0 || montos.length === 0) return "No ampara ningún cobro todavía";
  return `Ampara ${montos.map((m) => fmtMonto(numero(m.monto), m.moneda)).join(" + ")}`;
}

/** Descripción de la factura que ampara el cobro pero NO está entre las vigentes del vuelo. */
export const DESCRIPCION_FACTURA_DE_OTRO_VUELO = "Ligada a otro vuelo: no aparece entre las facturas de este";

/**
 * Opciones del selector: «Sin factura todavía» y una por VIGENTE del vuelo
 * («A-0420 · $68,208 MXN · 21 sep 2026», con lo que ya ampara debajo). En
 * EDICIÓN, si la factura del cobro no está entre las vigentes (la liga
 * quedó en el vuelo original tras `reassignAircraft`), se agrega como
 * opción: sin ella el selector mostraría «Sin factura todavía» con una
 * factura puesta.
 */
export function opcionesFacturaDeCobro(
  vigentes: ReadonlyArray<FacturaEmitidaMini> | null | undefined,
  actual?: { id: string; etiqueta: string } | null,
): OpcionFacturaDeCobro[] {
  const lista = vigentes ?? [];
  const opciones: OpcionFacturaDeCobro[] = [
    OPCION_SIN_FACTURA,
    ...lista.map((f) => ({
      value: f.id,
      label: [f.etiqueta, fmtMonto(numero(f.total), f.moneda), fmtDateOnly(f.fecha_emision)]
        .filter((x) => x && x !== "—")
        .join(" · "),
      description: textoAmparado(f),
    })),
  ];
  if (actual?.id && !lista.some((f) => f.id === actual.id)) {
    opciones.push({ value: actual.id, label: actual.etiqueta, description: DESCRIPCION_FACTURA_DE_OTRO_VUELO });
  }
  return opciones;
}

/**
 * Qué factura trae puesta el selector al abrir:
 *  - ALTA con UNA vigente que todavía tiene cupo ⇒ esa; con una ya completa
 *    o con 2+ ⇒ «Sin factura todavía» (el operador elige);
 *  - EDICIÓN ⇒ la del cobro (o vacío).
 */
export function facturaPreseleccionada(
  vigentes: ReadonlyArray<FacturaEmitidaMini> | null | undefined,
  modo: "alta" | "edicion",
  cobro?: Pick<FlightCobro, "factura_emitida"> | null,
): string {
  if (modo === "edicion") return cobro?.factura_emitida?.id ?? "";
  const v = vigentes ?? [];
  return v.length === 1 && facturaConCupo(v[0]) ? v[0].id : "";
}

/** Ayuda bajo el selector. */
export const AYUDA_SELECTOR_FACTURA_COBRO =
  "Qué factura ampara este cobro. Si todavía no se emite, déjalo en «Sin factura todavía» y asígnala después.";

/** Toast al registrar un cobro ya amparado: «Cobro registrado · amparado por A-0420». */
export function textoCobroRegistradoConFactura(etiqueta: string | null | undefined): string {
  const e = (etiqueta ?? "").trim();
  return e ? `Cobro registrado · amparado por ${e}` : "Cobro registrado";
}

// =============================================================================
// Chips de la card de cobros y de la burbuja
// =============================================================================

export type TonoSinFactura = "ambar" | "gris";

/**
 * Tono de «Sin factura asignada» / «N cobros sin factura asignada»: ÁMBAR
 * solo cuando importa cuál factura ampara qué (2+ vigentes, una vigente que
 * ya clasificó algún cobro, o cobros que EXIGEN factura sin ninguna); GRIS
 * con una sola vigente «global» que no ampara nada y cobros que no exigen
 * (A-0430 a 6 vuelos, FA-A-0433/0449): no es un problema, es trabajo
 * pendiente opcional — no amanecen ~30 cards en ámbar sin que nada esté mal.
 */
export function tonoSinFactura(bloque: BloqueLike | null | undefined): TonoSinFactura {
  if (!bloque) return "gris";
  const vigentes = bloque.facturas ?? [];
  if (vigentes.length >= 2) return "ambar";
  if (vigentes.some((f) => (f.cobros_n ?? 0) > 0)) return "ambar";
  if ((bloque.cobros_sin_factura_exigen ?? 0) > 0) return "ambar";
  return "gris";
}

/** Chip verde por cobro: «Factura A-0420» (null sin factura). */
export function textoChipFacturaCobro(c: Pick<FlightCobro, "factura_emitida">): string | null {
  const e = c.factura_emitida?.etiqueta?.trim();
  return e ? `Factura ${e}` : null;
}

/** Tooltip del chip verde por cobro. */
export function tituloChipFacturaCobro(etiqueta: string): string {
  return `Este cobro está amparado por la factura ${etiqueta}`;
}

/** Chip por cobro sin factura (solo cuando el vuelo tiene vigentes). */
export const TEXTO_COBRO_SIN_FACTURA = "Sin factura asignada";

export const TITULO_COBRO_SIN_FACTURA =
  "Ninguna de las facturas del vuelo ampara este cobro. Asígnale una con «Asignar factura» o regístrala con «Registrar factura» marcando este cobro.";

export const BOTON_ASIGNAR_FACTURA = "Asignar factura";

/** «· 1 cobro» / «· 3 cobros» / «· sin cobro asignado» (sufijo del chip de la burbuja). */
export function textoFacturaConCobros(f: Pick<FacturaEmitidaMini, "cobros_n">): string {
  const n = f.cobros_n ?? 0;
  if (n <= 0) return "· sin cobro asignado";
  return n === 1 ? "· 1 cobro" : `· ${n} cobros`;
}

/** Tooltip del chip de la burbuja: «Ampara 1 cobro de este vuelo: $68,208 MXN». */
export function tituloFacturaConCobros(
  f: Pick<FacturaEmitidaMini, "cobros_n" | "cobros_monto">,
): string {
  const n = f.cobros_n ?? 0;
  if (n <= 0) return "No ampara ningún cobro de este vuelo todavía";
  const montos = (f.cobros_monto ?? [])
    .filter((m) => numero(m.monto) > 0)
    .map((m) => fmtMonto(numero(m.monto), m.moneda))
    .join(" + ");
  return `Ampara ${n} ${n === 1 ? "cobro" : "cobros"} de este vuelo${montos ? `: ${montos}` : ""}`;
}

/** «3 cobros sin factura asignada» / «1 cobro sin factura asignada». */
export function textoCobrosSinFactura(n: number): string {
  return n === 1 ? "1 cobro sin factura asignada" : `${n} cobros sin factura asignada`;
}

export const TITULO_COBROS_SIN_FACTURA =
  "Hay cobros de este vuelo que ninguna factura ampara. Regístrala con «Registrar factura» (marcando esos cobros) o asígnales una con «Asignar factura» en cada cobro.";

/** Title de «Registrar factura» en la burbuja. */
export const TITULO_REGISTRAR_FACTURA =
  "Registra una factura del cliente (con su PDF). Un vuelo puede llevar varias: cada una ampara sus cobros.";

/** Línea extra de la confirmación «¿Eliminar este cobro?» (null sin factura). */
export function textoEliminarCobroConFactura(
  c: Pick<FlightCobro, "factura_emitida"> | null | undefined,
): string | null {
  const e = c?.factura_emitida?.etiqueta?.trim();
  return e ? `Está amparado por la factura ${e}: al eliminarlo, la factura deja de amparar este cobro.` : null;
}

// =============================================================================
// Diálogo «Registrar factura» / «Editar factura»: casillas por vuelo
// =============================================================================

/** Encabezado del bloque: «¿Qué cobros cubre esta factura? — Vuelo #332». */
export function tituloCobrosDeVuelo(folio: number): string {
  return `¿Qué cobros cubre esta factura? — Vuelo #${folio}`;
}

/** Casilla: «21 sep 2026 · $68,208 MXN · Transferencia → Scotiabank Pesos». */
export function textoCobroCandidato(
  c: Pick<CobroCandidatoFactura, "fecha_cobro" | "monto" | "moneda" | "metodo_cobro" | "cuenta_destino">,
): string {
  const metodo = metodoPagoLabel(c.metodo_cobro);
  const cuenta = (c.cuenta_destino ?? "").trim();
  return [fmtDate(c.fecha_cobro), fmtMonto(numero(c.monto), c.moneda), cuenta ? `${metodo} → ${cuenta}` : metodo]
    .filter(Boolean)
    .join(" · ");
}

/** Sufijo de una casilla deshabilitada: «· ya tiene A-0420». */
export function textoYaTieneFactura(etiqueta: string): string {
  return `· ya tiene ${etiqueta}`;
}

export const TEXTO_VUELO_SIN_COBROS =
  "Este vuelo no tiene cobros registrados todavía: asigna la factura desde el cobro cuando lo registres.";

export const NOTA_SOBRE_DE_GRUPO = "Las partes de un sobre de grupo no se asignan por vuelo.";

export const NOTA_COBROS_NO_CARGADOS =
  "No se pudieron cargar los cobros: guarda la factura y asígnala desde cada cobro.";

/** Edición de una factura cancelada o de baja: no puede amparar cobros (el API responde 409). */
export const NOTA_FACTURA_NO_VIGENTE =
  "Esta factura no está vigente: no puede amparar cobros. Reactívala y después márcale los suyos.";

/** Ayuda nueva del switch «Factura parcial (anticipo o finiquito)». */
export const AYUDA_FACTURA_PARCIAL =
  "Márcala si esta factura cubre solo una parte del vuelo. Para registrar varias facturas ya no hace falta: a cada una se le marcan sus cobros.";

/** Chip gris del selector de vuelos: «Tiene A-0420» / «Tiene A-0420, A-0455». */
export function textoTieneFactura(etiquetas: ReadonlyArray<string>): string {
  return `Tiene ${etiquetas.join(", ")}`;
}

export const TITULO_TIENE_FACTURA =
  "El vuelo ya tiene esta factura vigente; puedes agregarle otra si ampara otros cobros.";

/** Lo mínimo de un vuelo elegido para saber si trae sus cobros. */
export interface VueloConCobros {
  id: string;
  cobros?: CobroCandidatoFactura[] | null;
}

/**
 * ¿TODOS los vuelos elegidos trajeron `cobros` (array)? Solo entonces se
 * pintan las casillas y viaja `cobro_ids`: el PATCH REEMPLAZA el conjunto,
 * así que mandar las casillas de los vuelos que sí cargaron desligaría en
 * silencio los cobros del que no cargó. Sin vuelos ⇒ false (no hay nada que
 * clasificar y la llave no viaja).
 */
export function cobrosHidratados(vuelos: ReadonlyArray<VueloConCobros>): boolean {
  return vuelos.length > 0 && vuelos.every((v) => Array.isArray(v.cobros));
}

/** ¿Hay casillas que pintar? (al menos un vuelo trajo sus cobros). */
export function hayCobrosQueMostrar(vuelos: ReadonlyArray<VueloConCobros>): boolean {
  return vuelos.some((v) => Array.isArray(v.cobros));
}

export interface TotalFactura {
  monto: number;
  moneda: MonedaFactura | string;
}

/**
 * Qué casillas se marcan solas:
 *  - EDICIÓN (`facturaId`): los cobros que YA ampara esta factura;
 *  - ALTA: la MISMA regla del backfill del API sobre los cobros LIBRES
 *    (sin factura) de la misma moneda que el total tecleado, tolerancia
 *    $1.00: Σ de los libres ≈ total ⇒ todos; si no, EXACTAMENTE UN libre ≈
 *    total ⇒ ese; si no ⇒ todos los libres (y el resumen sale ámbar). Sin
 *    `total` todavía ⇒ todos los libres.
 *  «Todos los libres» a secas, en el alta de A-0420 con los 4 cobros de
 *  #332, marcaba $72,585.45 contra $68,208 y un «Guardar» sin mirar el ámbar
 *  ligaba los 4.
 */
export function prefillCobrosDeFactura(
  cobros: ReadonlyArray<CobroCandidatoFactura>,
  facturaId: string | null,
  total?: TotalFactura | null,
): string[] {
  if (facturaId) return cobros.filter((c) => c.factura?.id === facturaId).map((c) => c.id);
  const libres = cobros.filter((c) => c.factura == null && numero(c.monto) > 0);
  const todos = libres.map((c) => c.id);
  if (!total || !(numero(total.monto) > 0)) return todos;
  const mismaMoneda = libres.filter((c) => c.moneda === total.moneda);
  if (mismaMoneda.length === 0) return todos;
  const objetivo = numero(total.monto);
  const suma = mismaMoneda.reduce((s, c) => s + numero(c.monto), 0);
  if (Math.abs(suma - objetivo) <= TOLERANCIA_COBROS_FACTURA) return mismaMoneda.map((c) => c.id);
  const exactos = mismaMoneda.filter((c) => Math.abs(numero(c.monto) - objetivo) <= TOLERANCIA_COBROS_FACTURA);
  if (exactos.length === 1) return [exactos[0].id];
  return todos;
}

export type TonoResumen = "ok" | "ambar" | "neutro";

export interface ResumenMarcados {
  texto: string;
  tono: TonoResumen;
}

/** Σ por moneda de los marcados (jamás se mezclan monedas). */
function sumaPorMoneda(cobros: ReadonlyArray<CobroCandidatoFactura>): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cobros) out.set(c.moneda, (out.get(c.moneda) ?? 0) + numero(c.monto));
  return out;
}

/**
 * Pie de las casillas: «Marcados: $4,377.45 MXN · Factura: $4,377.45 MXN»
 * (ok) / «… (difieren $122.55 MXN)» (ámbar, NO bloquea: el API avisa
 * `TOTAL_DISTINTO_COBROS` al guardar) / monedas mezcladas ⇒ neutro. Sin total
 * tecleado o en otra moneda que los cobros, solo lo marcado (neutro).
 */
export function resumenMarcados(
  cobros: ReadonlyArray<CobroCandidatoFactura>,
  marcados: ReadonlySet<string> | ReadonlyArray<string>,
  total: number | null | undefined,
  moneda: MonedaFactura | "" | null | undefined,
): ResumenMarcados {
  const ids = marcados instanceof Set ? marcados : new Set(marcados);
  const elegidos = cobros.filter((c) => ids.has(c.id));
  if (elegidos.length === 0) {
    return { texto: "Sin cobros marcados: la factura no amparará ningún cobro.", tono: "neutro" };
  }
  const sumas = sumaPorMoneda(elegidos);
  if (sumas.size > 1) {
    const monedas = [...sumas.keys()].join(" y ");
    return { texto: `Marcados: ${elegidos.length} cobros (${monedas})`, tono: "neutro" };
  }
  const [m, suma] = [...sumas.entries()][0];
  const marcado = `Marcados: ${fmtMonto(suma, m)}`;
  const t = total != null && Number.isFinite(total) && total > 0 ? total : null;
  if (t == null || !moneda || moneda !== m) {
    return { texto: t != null && moneda ? `${marcado} · Factura: ${fmtMonto(t, moneda)}` : marcado, tono: "neutro" };
  }
  const base = `${marcado} · Factura: ${fmtMonto(t, moneda)}`;
  const diff = Math.abs(suma - t);
  if (diff <= TOLERANCIA_COBROS_FACTURA) return { texto: base, tono: "ok" };
  return { texto: `${base} (difieren ${fmtMonto(Math.round(diff * 100) / 100, m)})`, tono: "ambar" };
}

// =============================================================================
// Registro de facturas (tabla)
// =============================================================================

/** Rótulo de la alerta DUPLICADO_VUELO desde el 16-oct-2026 (también en el Excel del API). */
export const ETIQUETA_FACTURAS_NO_CUADRAN = "Facturas que no cuadran";

export const TITULO_FACTURAS_NO_CUADRAN =
  "Un vuelo de esta factura tiene otra vigente y sus totales rebasan lo cotizado o cobrado, o una de ellas no ampara ningún cobro. Asígnale a cada factura sus cobros (Editar → ¿Qué cobros cubre?) o cancela la que sobre.";

/** Chip del resumen que filtra por esa alerta (cuenta VUELOS). */
export const ETIQUETA_VUELOS_FACTURAS_NO_CUADRAN = "Vuelos con facturas que no cuadran";

/** Tooltip del chip «Facturas que no cuadran»: los mensajes del detalle unidos por « · »; sin detalle, la ayuda general. */
export function tituloAlertasDetalle(
  detalle: ReadonlyArray<AlertaFacturaDetalle> | null | undefined,
  code: string = "DUPLICADO_VUELO",
): string {
  const mensajes = (detalle ?? [])
    .filter((d) => d.code === code)
    .map((d) => d.mensaje.trim())
    .filter(Boolean);
  return mensajes.length > 0 ? mensajes.join(" · ") : TITULO_FACTURAS_NO_CUADRAN;
}

/** Bajo el folio en la columna «Vuelos» del registro: «· 1 cobro» / «· 3 cobros» (null con 0). */
export function textoCobrosDeVueloRegistro(cobrosN: number | null | undefined): string | null {
  const n = cobrosN ?? 0;
  if (n <= 0) return null;
  return n === 1 ? "· 1 cobro" : `· ${n} cobros`;
}

/** Bajo el folio: «· 3 sin factura» (null con 0). */
export function textoSinFacturaRegistro(n: number | null | undefined): string | null {
  const k = n ?? 0;
  return k > 0 ? `· ${k} sin factura` : null;
}

/**
 * Tono de «· N sin factura» bajo el folio del registro: la MISMA regla de
 * `tonoSinFactura` con lo que la fila sabe del vuelo. ÁMBAR cuando importa
 * cuál factura ampara qué (esta factura ya clasificó cobros de ese vuelo o el
 * vuelo tiene OTRA vigente); GRIS con una sola factura «global» que no
 * clasificó nada (FA-A-0433 ×12, A-0430 ×6): sin esto el registro amanecía
 * con ~30 folios en ámbar sin que nada estuviera mal (revisión #11).
 */
export function tonoSinFacturaRegistro(
  v: Pick<VueloDeFactura, "cobros_n" | "otras_vigentes">,
): TonoSinFactura {
  return (v.cobros_n ?? 0) > 0 || (v.otras_vigentes ?? []).length > 0 ? "ambar" : "gris";
}

export const TITULO_SIN_FACTURA_REGISTRO = "Cobros de este vuelo que ninguna factura ampara";

// =============================================================================
// Errores del API en es-MX
// =============================================================================

/** Códigos de la liga cobro ↔ factura (POST/PATCH del cobro y alta/edición de la factura). */
export const CODIGOS_COBRO_FACTURA = [
  "COBRO_FACTURA_NO_DISPONIBLE",
  "REEMBOLSO_SIN_FACTURA",
  "FACTURA_NO_VIGENTE",
  "FACTURA_NO_LIGADA_AL_VUELO",
  "COBROS_NO_EXISTEN",
  "COBROS_DE_OTRO_VUELO",
  "COBRO_CON_OTRA_FACTURA",
] as const;

export type CodigoCobroFactura = (typeof CODIGOS_COBRO_FACTURA)[number];

export function esCodigoCobroFactura(code: unknown): code is CodigoCobroFactura {
  return typeof code === "string" && (CODIGOS_COBRO_FACTURA as readonly string[]).includes(code);
}

function pareceTecnico(msg: string): boolean {
  return /\b(must|should|expected|failed|not found|is not|internal server error|request failed|bad request|bad gateway|service unavailable)\b/i.test(
    msg,
  );
}

function etiquetaDe(details: Record<string, unknown> | null | undefined): string {
  const f = details?.factura as { etiqueta?: unknown } | undefined;
  return typeof f?.etiqueta === "string" ? f.etiqueta : "";
}

/**
 * Mensaje para el operador de un rechazo de la liga cobro ↔ factura. El API
 * ya redacta en es-MX (se respeta tal cual); el respaldo por código cubre un
 * texto vacío o técnico. Para cualquier otro código devuelve el `message` (o
 * un genérico): quien llama decide si prefiere su propio traductor.
 */
export function mensajeErrorCobroFactura(
  code: string | null | undefined,
  details?: Record<string, unknown> | null,
  message?: string | null,
): string {
  const msg = (message ?? "").trim();
  if (msg && !pareceTecnico(msg)) return msg;
  switch (code) {
    case "COBRO_FACTURA_NO_DISPONIBLE":
      return "Todavía no se puede asignar factura a un cobro: falta aplicar la migración 20261016000001. Avisa a sistemas.";
    case "REEMBOLSO_SIN_FACTURA":
      return "Un reembolso no se liga a una factura.";
    case "FACTURA_NO_VIGENTE":
      return "La factura ya no está vigente (o no existe): recarga la página y elige otra.";
    case "FACTURA_NO_LIGADA_AL_VUELO": {
      const folio = typeof details?.folio === "number" ? ` #${details.folio}` : "";
      return `La factura no está ligada al vuelo${folio}. Agrégale el vuelo en Facturas emitidas → Editar → Vuelos y vuelve a intentar.`;
    }
    case "COBROS_NO_EXISTEN":
      return "Alguno de los cobros marcados ya no existe. Recarga la página y vuelve a marcarlos.";
    case "COBROS_DE_OTRO_VUELO":
      return "Un cobro marcado no es de ninguno de los vuelos de esta factura. Agrega ese vuelo en «Vuelos» y vuelve a marcarlo.";
    case "COBRO_CON_OTRA_FACTURA": {
      const e = etiquetaDe(details);
      return `Un cobro marcado ya tiene ${e ? `la factura ${e}` : "otra factura"}. Quítaselo desde esa factura (Editar → ¿Qué cobros cubre?) o cámbialo desde el cobro en el vuelo.`;
    }
    case "COBRO_DE_GRUPO":
      return "Este cobro es parte de un sobre de grupo: no lleva factura por vuelo.";
  }
  return msg || "No se pudo asignar la factura al cobro. Vuelve a intentarlo.";
}
