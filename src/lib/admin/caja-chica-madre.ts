/**
 * CAJA CHICA MADRE (15-oct-2026). Pedidos del cliente sobre la caja de Mary
 * Cruz, que fondea a Gregorio Jurado, Jimmy Chi, Nelson Hau, Luis Cáceres,
 * Itzi, Alexander E. Saab…:
 *  (1) «aqui en la caja de Mary que se comparte con otros que diga a quien le
 *      repuso en el movimiento» — el renglón «Reintegro a dirección · Espejo
 *      automático de la reposición en la caja vinculada» no decía a quién;
 *  (2) «que pueda seleccionar a quien le va a reponer el fondo» — desde la
 *      madre, «Registrar movimiento» repone a una de sus cajas;
 *  (3) «le agregas un filtro de fecha de desde hasta» — Desde/Hasta del
 *      HISTORIAL.
 *
 * Todo lo de dinero sale del API (invariante 83): `repuesto_a` de cada
 * espejo, `cajas_fondeadas[].por_reponer` (la última fila del libro de cada
 * hija, `porReponerCaja`) y el saldo corrido de cada fila
 * (`historialConSaldo`). Aquí NO se suma ni se resta un peso: solo se elige
 * qué mostrar y se filtran FILAS.
 *
 * Módulo PURO (sin React ni Next). Prueba en
 * `__tests__/caja-chica-madre.test.ts`.
 */

import { fmtDateOnly } from "@/lib/datetime";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import {
  ajustarRangoAlInicio,
  textoDesdeInicio,
  type InicioOficial,
} from "@/lib/admin/inicio-oficial";
import type {
  CajaFondeada,
  CajaMovimiento,
  ConteoMontoCaja,
  HistorialEntry,
  MonedaCaja,
  ResumenCajaMadre,
} from "@/types/caja-chica";

// =============================================================================
// Montos (MISMO formato que las tarjetas del detalle del fondo)
// =============================================================================

/** «$5,000.00» en la moneda de la caja (el formato de las tarjetas del fondo). */
export function montoCaja(n: number, moneda: MonedaCaja | string): string {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 2,
  });
}

// =============================================================================
// (1) ¿A quién se repuso? — el renglón del ESPEJO en la caja madre
// =============================================================================

/** Lo que el renglón del espejo dice de la caja a la que se repuso. */
export interface RepuestoAFila {
  nombre: string;
  /** Caja hija (enlace a su detalle). null = solo se sabe el nombre (API previo). */
  fondoId: string | null;
}

const FONDEO_A_RE = /^\s*Fondeo a\s+(.+?)\s*$/i;

/**
 * Nombre de la referencia que `insertarEspejo` del API escribe en el espejo
 * («Fondeo a Gregorio Jurado»). Es texto CONGELADO: solo se usa cuando el API
 * no manda `repuesto_a` (API previo o lectura caída).
 */
export function nombreDeReferenciaFondeo(referencia: string | null | undefined): string | null {
  const m = typeof referencia === "string" ? FONDEO_A_RE.exec(referencia) : null;
  return m ? m[1] : null;
}

/**
 * ¿A quién se repuso en esta entrada del historial? Solo para los ESPEJOS
 * (entrada de caja cuyo movimiento tiene `espejo_de_id`, o que trae la llave
 * `repuesto_a`). Orden: el nombre VIVO de `repuesto_a` → el de la
 * referencia «Fondeo a X» → `null` (el renglón dice lo de siempre).
 */
export function repuestoADeEntrada(
  entrada: Pick<HistorialEntry, "origen" | "repuesto_a">,
  movimiento: Pick<CajaMovimiento, "espejo_de_id" | "referencia"> | null | undefined,
): RepuestoAFila | null {
  if (entrada.origen !== "caja") return null;
  const r = entrada.repuesto_a ?? null;
  const esEspejo = !!movimiento?.espejo_de_id || r !== null;
  if (!esEspejo) return null;
  const nombre = r?.nombre?.trim() || nombreDeReferenciaFondeo(movimiento?.referencia);
  if (!nombre) return null;
  return { nombre, fondoId: r && esUuid(r.fondo_id) ? r.fondo_id : null };
}

/** «Reposición a la caja de» (el nombre va aparte: es el enlace a esa caja). */
export const PREFIJO_REPUESTO_A = "Reposición a la caja de";

/** Texto completo del renglón (búsqueda rápida y lector de pantalla). */
export function textoRepuestoA(nombre: string): string {
  return `${PREFIJO_REPUESTO_A} ${nombre}`;
}

/** title del enlace a la caja hija. */
export function tituloEnlaceCaja(nombre: string): string {
  return `Abrir la caja chica de ${nombre}`;
}

/** Ruta del detalle de una caja. */
export function hrefCajaChica(fondoId: string): string {
  return `/admin/caja-chica/${encodeURIComponent(fondoId)}`;
}

// =============================================================================
// (2) Reponer a una caja hija desde la madre
// =============================================================================

/**
 * Las cajas a las que se puede reponer desde ESTE fondo, o `null` si el
 * diálogo debe quedar como siempre: API previo (sin la llave), lectura
 * caída (`null`), caja que no fondea a nadie (`[]`) o caja madre inactiva
 * (el API rechaza el espejo con 400 si la madre está cerrada).
 */
export function cajasParaReponer(fondo: {
  activo: boolean;
  cajas_fondeadas?: CajaFondeada[] | null;
}): CajaFondeada[] | null {
  if (!fondo.activo) return null;
  const cajas = fondo.cajas_fondeadas;
  if (!Array.isArray(cajas)) return null;
  const activas = cajas.filter((c) => c && c.activo !== false && esUuid(c.fondo_id));
  return activas.length > 0 ? activas : null;
}

/** Nombre de la caja hija para los textos («Caja sin nombre» si el API no lo tuvo). */
export function nombreCajaFondeada(c: Pick<CajaFondeada, "nombre">): string {
  return c.nombre?.trim() || "Caja sin nombre";
}

/** Lo por reponer de la hija TAL COMO lo manda el API (≥ 0; basura ⇒ 0). */
function porReponerDe(c: Pick<CajaFondeada, "por_reponer">): number {
  const n = Number(c.por_reponer);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Valor del selector para «esta misma caja» (el movimiento de siempre). */
export const DESTINO_ESTA_CAJA = "";

/** Opción del selector «¿A quién le repones?»: «Gregorio Jurado · por reponer $5,000.00». */
export function opcionCajaFondeada(c: CajaFondeada): {
  value: string;
  label: string;
  description: string;
} {
  return {
    value: c.fondo_id,
    label: `${nombreCajaFondeada(c)} · por reponer ${montoCaja(porReponerDe(c), c.moneda)}`,
    description: c.ultima_reposicion
      ? `Última reposición: ${fmtDateOnly(c.ultima_reposicion.fecha)} · ${montoCaja(
          Number(c.ultima_reposicion.monto),
          c.moneda,
        )}`
      : "Sin reposiciones registradas",
  };
}

/**
 * Lo que se PRELLENA al elegir una caja: reposición, en SU moneda, por lo
 * pendiente de esa caja (editable) y con la fecha de hoy en Cancún. Sin nada
 * pendiente el monto queda vacío (una reposición de 0 no se puede guardar).
 */
export function valoresReponerA(
  c: CajaFondeada,
  hoy: string,
): { tipo: "REPOSICION"; monto: string; moneda: MonedaCaja; fecha: string } {
  const pendiente = porReponerDe(c);
  return {
    tipo: "REPOSICION",
    monto: pendiente > 0 ? String(pendiente) : "",
    moneda: c.moneda,
    fecha: hoy,
  };
}

/** Pista bajo el monto: de dónde salió la cifra prellenada. */
export function pistaMontoReponerA(c: CajaFondeada): string {
  const pendiente = porReponerDe(c);
  return pendiente > 0
    ? `Lo pendiente por reponer de ${nombreCajaFondeada(c)}: ${montoCaja(pendiente, c.moneda)} (puedes cambiarlo).`
    : `${nombreCajaFondeada(c)} no tiene nada pendiente por reponer.`;
}

/**
 * Confirmación ANTES de registrar (regla del cliente: toda acción con dinero
 * se confirma): «Se registrará una reposición de $5,000.00 con fecha 15 oct
 * 2026 en la caja de Gregorio Jurado y su reintegro en la caja de Mary Cruz.»
 *
 * La FECHA va en la confirmación porque decide qué gastos quedan repuestos
 * (la reposición del día D salda lo de ese día y el candado del API bloquea
 * gastos con fecha ≤ la última reposición): una fecha equivocada deja gastos
 * «por reponer» ya pagados. Día de pared (fmtDateOnly); sin fecha válida, el
 * formulario usa la de hoy → «con fecha de hoy».
 */
export function textoConfirmarReposicionHija(p: {
  monto: string | number;
  hija: CajaFondeada;
  madre: string;
  fecha?: string | null;
}): string {
  const n = Number(p.monto);
  const monto = Number.isFinite(n) ? montoCaja(n, p.hija.moneda) : String(p.monto);
  const fecha = esDiaValido(p.fecha) ? `con fecha ${fmtDateOnly(p.fecha)}` : "con fecha de hoy";
  return `Se registrará una reposición de ${monto} ${fecha} en la caja de ${nombreCajaFondeada(
    p.hija,
  )} y su reintegro en la caja de ${p.madre.trim() || "este fondo"}.`;
}

/** Al pulsar «Registrar»: con una caja hija elegida, primero se CONFIRMA. */
export function pasoAlRegistrar(p: {
  hija: CajaFondeada | null;
  confirmado: boolean;
}): "confirmar" | "registrar" {
  return p.hija && !p.confirmado ? "confirmar" : "registrar";
}

/** Textos del diálogo (una sola fuente: componente y pruebas). */
export const ETIQUETA_REPONER_A = "¿A quién le repones?";
export const OPCION_ESTA_CAJA = "Movimiento de esta caja";
export const OPCION_OTRA_CAJA = "Reponer a una caja que fondea";
export const TITULO_OPCION_OTRA_CAJA =
  "Registra la reposición en la caja de esa persona; su reintegro en esta caja se escribe solo.";
export const PLACEHOLDER_REPONER_A = "Elige la caja a reponer";
export const TITULO_CONFIRMAR_REPOSICION_HIJA = "¿Registrar la reposición?";
export const NOTA_CONFIRMAR_REPOSICION_HIJA =
  "Después se descargará el Excel de lo que repusiste.";
export const BOTON_REVISAR_REPOSICION_HIJA = "Revisar y registrar";
export const BOTON_CONFIRMAR_REPOSICION_HIJA = "Sí, registrar la reposición";
export const BOTON_VOLVER = "Volver";

// =============================================================================
// (3) Filtro Desde/Hasta del HISTORIAL
// =============================================================================

export interface RangoHistorialCaja {
  desde?: string;
  hasta?: string;
  /** Inicio oficial (16-oct-2026): el rango de la URL caía antes del inicio
   *  y se movió (la página pinta el aviso). Solo existe si es `true`. */
  ajustado?: true;
}

/** Primer valor de un parámetro de la URL (Next puede dar un arreglo). */
function primero(v: string | string[] | null | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/**
 * `?desde=&hasta=` del historial: SOLO días `AAAA-MM-DD` que existen (día de
 * pared Cancún); inválido ⇒ se ignora; invertido ⇒ se corrige.
 */
export function rangoHistorialCaja(
  desde: string | string[] | null | undefined,
  hasta: string | string[] | null | undefined,
  inicio: InicioOficial = null,
): RangoHistorialCaja {
  const d0 = primero(desde);
  const h0 = primero(hasta);
  let d = esDiaValido(d0) ? d0 : undefined;
  let h = esDiaValido(h0) ? h0 : undefined;
  if (d && h && d > h) [d, h] = [h, d];
  // Inicio oficial (16-oct-2026, API 0.0.84): sin `?desde` el historial se
  // ve DESDE EL INICIO (el libro sigue completo en el API: el saldo de cada
  // fila no cambia); un extremo anterior se sube con aviso. Sin él, intacto.
  const aj = ajustarRangoAlInicio({ desde: d, hasta: h }, inicio, "");
  const out: RangoHistorialCaja = {};
  const desdeFinal = aj.desde ?? (inicio ?? undefined);
  if (desdeFinal) out.desde = desdeFinal;
  if (aj.hasta) out.hasta = aj.hasta;
  if (aj.ajustado) out.ajustado = true;
  return out;
}

/**
 * ¿El historial está filtrado por algo DISTINTO de lo de siempre? Con inicio
 * oficial, «desde el inicio y sin hasta» es el default (no es filtro: no
 * pinta «Limpiar»).
 */
export function hayRangoHistorial(r: RangoHistorialCaja, inicio: InicioOficial = null): boolean {
  if (inicio) return !!(r.hasta || (r.desde && r.desde !== inicio));
  return !!(r.desde || r.hasta);
}

/** `title` de «Limpiar»: con inicio oficial vuelve a «desde el 1-sep-2026», no al libro completo. */
export function tituloLimpiarPeriodo(inicio: InicioOficial): string {
  return inicio
    ? `Quitar el filtro de fechas y ver ${textoDesdeInicio(inicio)}`
    : TITULO_LIMPIAR_PERIODO;
}

/**
 * «Saldo inicial al 1-sep-2026» (16-oct-2026, inicio oficial): el `saldo` y
 * el `por_reponer` de la ÚLTIMA fila anterior al inicio, tal como los calculó
 * el API con el libro completo — no se recalcula ni se reordena nada. El API
 * manda `historial` del más reciente al más viejo (`getFondoDetail` hace
 * `.reverse()` del libro ascendente); si llegara ascendente, la última
 * anterior es la de más abajo. Sin filas anteriores (o sin inicio) ⇒ null.
 * El día se compara como en `filtrarHistorialPorRango` (los 10 primeros
 * caracteres de `fecha`), así que la fila sintética cubre exactamente lo que
 * el filtro esconde.
 */
export function saldoInicialAlInicio<
  T extends { fecha: string; saldo: number; por_reponer?: number | null },
>(historial: readonly T[], inicio: InicioOficial): { saldo: number; por_reponer: number | null } | null {
  if (!inicio || historial.length === 0) return null;
  const dia = (f: T) => (f.fecha ?? "").slice(0, 10);
  const descendente = dia(historial[0]) >= dia(historial[historial.length - 1]);
  const anteriores = historial.filter((f) => dia(f) < inicio);
  if (anteriores.length === 0) return null;
  const ultima = descendente ? anteriores[0] : anteriores[anteriores.length - 1];
  return { saldo: ultima.saldo, por_reponer: ultima.por_reponer ?? null };
}

/**
 * Filtra FILAS del historial COMPLETO por su `fecha` (día de pared,
 * comparando texto). No toca nada más: el saldo y el por reponer de cada fila
 * siguen siendo los del libro entero, como los manda el API.
 */
export function filtrarHistorialPorRango<T extends { fecha: string }>(
  filas: readonly T[],
  r: RangoHistorialCaja,
): T[] {
  if (!hayRangoHistorial(r)) return [...filas];
  return filas.filter((f) => {
    const dia = (f.fecha ?? "").slice(0, 10);
    if (r.desde && dia < r.desde) return false;
    if (r.hasta && dia > r.hasta) return false;
    return true;
  });
}

/** El periodo en palabras: «del 01 oct 2026 al 15 oct 2026». */
export function textoRangoHistorial(r: RangoHistorialCaja): string | null {
  if (r.desde && r.hasta) {
    return r.desde === r.hasta
      ? `del ${fmtDateOnly(r.desde)}`
      : `del ${fmtDateOnly(r.desde)} al ${fmtDateOnly(r.hasta)}`;
  }
  if (r.desde) return `desde el ${fmtDateOnly(r.desde)}`;
  if (r.hasta) return `hasta el ${fmtDateOnly(r.hasta)}`;
  return null;
}

/**
 * La línea bajo el filtro: «Viendo del 01 oct 2026 al 15 oct 2026 · 12 de
 * 80 movimientos». Sin filtro ⇒ null.
 */
export function textoPeriodoHistorial(
  r: RangoHistorialCaja,
  vistos: number,
  total: number,
): string | null {
  const periodo = textoRangoHistorial(r);
  if (!periodo) return null;
  const de = `${vistos} de ${total} ${total === 1 ? "movimiento" : "movimientos"}`;
  return `Viendo ${periodo} · ${de}`;
}

export const TEXTO_SIN_MOVIMIENTOS_PERIODO = "Sin movimientos en el periodo";
export const TEXTO_LIMPIAR_PERIODO = "Limpiar";
export const TITULO_LIMPIAR_PERIODO = "Quitar el filtro de fechas y ver todo el historial";
export const ETIQUETA_PERIODO_HISTORIAL = "Periodo";
export const TITULO_FECHA_HISTORIAL = "Fecha del movimiento (día de Cancún)";
export const NOTA_SALDO_LIBRO_COMPLETO =
  "El saldo de cada fila es el del libro completo; las tarjetas de arriba son de todo el fondo.";

// =============================================================================
// (5) Fondo consolidado de la caja MADRE (27-oct-2026, API 0.0.109)
// =============================================================================
//
// Pedido de Mary Cruz: «tengo un fondo fijo de $40,000 de los cuales $16,500
// están distribuidos entre mis compañeros. Necesito que el sistema me muestre
// el fondo total, los fondos asignados a cada colaborador, el saldo en
// efectivo que conserva cada persona, los gastos comprobados y pendientes por
// reponer, y el efectivo real disponible en mi caja, considerando también las
// entregas de dinero y las reposiciones registradas». Las cifras las manda el
// API en `resumen_madre` y en cada `cajas_fondeadas[]`; aquí solo se formatea
// y se redacta el cuadre.

export const TITULO_RESUMEN_MADRE = "Fondo consolidado · caja madre";
export const DESCRIPCION_RESUMEN_MADRE =
  "Tu fondo total incluye lo asignado a los colaboradores que fondeas. Todo sale de los libros: el tuyo y el de cada caja.";
export const ETIQUETA_FONDO_TOTAL = "Fondo total";
export const ETIQUETA_ASIGNADO = "Asignado a colaboradores";
export const ETIQUETA_FONDO_PROPIO = "Debe estar en mi caja";
export const NOTA_FONDO_PROPIO = "Fondo total − asignado a colaboradores.";
export const ETIQUETA_POR_SOLICITAR = "Para solicitar a la empresa";
export const NOTA_POR_SOLICITAR = "Lo que salió de la caja desde la última reposición.";
export const TITULO_COLABORADORES = "Por colaborador";
export const TITULO_MI_CAJA = "Mi caja hoy";
export const ETIQUETA_GASTOS_PENDIENTES = "Gastos pendientes por reponer";
export const ETIQUETA_ENTREGAS_PENDIENTES = "Entregas a colaboradores pendientes de reembolso";
export const ETIQUETA_OTROS_PENDIENTES = "Otros movimientos desde la última reposición";
export const ETIQUETA_EFECTIVO_ESPERADO = "Efectivo esperado en mi caja";
export const ETIQUETA_EFECTIVO_LIBRO = "Efectivo según el libro";
export const ETIQUETA_DIFERENCIA = "Diferencia";
export const TEXTO_SIN_FONDO_TOTAL =
  "Fija el monto del fondo (Editar, arriba) para comparar el libro con lo que debe estar en tu caja.";
export const TEXTO_CUADRA = "Cuadra: el libro coincide con lo que debe estar en tu caja.";
export const DETALLE_LIBRO_MENOS =
  "Puede faltar registrar una reposición o una entrega recibida, o el fondo asignado de algún colaborador no es el real.";
export const DETALLE_LIBRO_MAS =
  "Puede faltar registrar un gasto o una entrega, o la entrega inicial del fondo de un colaborador sigue en el tramo pendiente (sale al registrar la siguiente reposición).";
export const ENCABEZADOS_COLABORADORES = [
  "Colaborador",
  "Fondo asignado",
  "Efectivo que conserva",
  "Gastos pendientes",
  "Por reponer",
  "Última reposición",
] as const;

/** El resumen del API, o null si no viene (API previo, caja sin hijas o lectura caída). */
export function resumenMadreDeFondo(fondo: {
  resumen_madre?: ResumenCajaMadre | null;
}): ResumenCajaMadre | null {
  const r = fondo.resumen_madre;
  return r && typeof r === "object" ? r : null;
}

/** «6 cajas» / «1 caja». */
export function textoCajas(n: number): string {
  return `${n} ${n === 1 ? "caja" : "cajas"}`;
}

/** «11 gastos · $7,127.50» / «1 entrega · $5,000.00» / «ninguno». */
export function textoConteoMonto(
  c: ConteoMontoCaja | null | undefined,
  moneda: MonedaCaja | string,
  singular: string,
  plural: string,
): string {
  const n = Number(c?.n ?? 0);
  const total = Number(c?.total ?? 0);
  if (!(n > 0)) return `sin ${plural}`;
  return `${n} ${n === 1 ? singular : plural} · ${montoCaja(total, moneda)}`;
}

export type TonoCuadre = "ok" | "ambar" | "rojo" | "neutro";

/** Cómo quedó el cuadre del libro contra el fondo (una línea + su detalle). */
export function estadoCuadreMadre(
  r: Pick<ResumenCajaMadre, "diferencia">,
  moneda: MonedaCaja | string,
): { tono: TonoCuadre; titulo: string; detalle: string | null } {
  const d = r.diferencia;
  if (d == null || !Number.isFinite(Number(d))) {
    return { tono: "neutro", titulo: TEXTO_SIN_FONDO_TOTAL, detalle: null };
  }
  const n = Math.round(Number(d) * 100) / 100;
  if (n === 0) return { tono: "ok", titulo: TEXTO_CUADRA, detalle: null };
  if (n < 0) {
    return {
      tono: "rojo",
      titulo: `El libro trae ${montoCaja(-n, moneda)} menos de lo esperado.`,
      detalle: DETALLE_LIBRO_MENOS,
    };
  }
  return {
    tono: "ambar",
    titulo: `El libro trae ${montoCaja(n, moneda)} más de lo esperado.`,
    detalle: DETALLE_LIBRO_MAS,
  };
}

/** Tono del efectivo que conserva un colaborador (negativo = puso de su bolsa / sobregiro). */
export type TonoEfectivo = "ok" | "rojo" | "neutro";

export interface FilaColaboradorResumen {
  fondoId: string;
  nombre: string;
  href: string;
  acumulada: boolean;
  fondoAsignado: string;
  efectivo: string;
  efectivoTono: TonoEfectivo;
  gastosPendientes: string;
  porReponer: string;
  porReponerTono: "ok" | "ambar";
  ultimaReposicion: string;
}

/**
 * Una fila por caja que fondea (en el orden del API: por nombre). Con un API
 * previo (sin los aditivos) las celdas de dinero dicen «—» y nada se inventa.
 */
export function filasColaboradoresResumen(fondo: {
  cajas_fondeadas?: CajaFondeada[] | null;
}): FilaColaboradorResumen[] {
  const cajas = Array.isArray(fondo.cajas_fondeadas) ? fondo.cajas_fondeadas : [];
  return cajas
    .filter((c) => c && c.activo !== false)
    .map((c) => {
      const fondoAsignado = c.monto_fondo != null ? Number(c.monto_fondo) : null;
      const saldo = typeof c.saldo_libro === "number" ? c.saldo_libro : null;
      const pendiente = porReponerDe(c);
      return {
        fondoId: c.fondo_id,
        nombre: nombreCajaFondeada(c),
        href: hrefCajaChica(c.fondo_id),
        acumulada: c.es_acumulada === true,
        fondoAsignado:
          fondoAsignado != null && Number.isFinite(fondoAsignado) ? montoCaja(fondoAsignado, c.moneda) : "—",
        efectivo: saldo != null ? montoCaja(saldo, c.moneda) : "—",
        efectivoTono: saldo == null ? "neutro" : saldo < 0 ? "rojo" : "ok",
        gastosPendientes: c.gastos_pendientes ? textoConteoMonto(c.gastos_pendientes, c.moneda, "gasto", "gastos") : "—",
        porReponer: montoCaja(pendiente, c.moneda),
        porReponerTono: pendiente > 0 ? "ambar" : "ok",
        ultimaReposicion: c.ultima_reposicion
          ? `${fmtDateOnly(c.ultima_reposicion.fecha)} · ${montoCaja(Number(c.ultima_reposicion.monto), c.moneda)}`
          : "Ninguna",
      };
    });
}
