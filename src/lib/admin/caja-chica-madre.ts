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
import type {
  CajaFondeada,
  CajaMovimiento,
  HistorialEntry,
  MonedaCaja,
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
 * se confirma): «Se registrará una reposición de $5,000.00 en la caja de
 * Gregorio Jurado y su reintegro en la caja de Mary Cruz.»
 */
export function textoConfirmarReposicionHija(p: {
  monto: string | number;
  hija: CajaFondeada;
  madre: string;
}): string {
  const n = Number(p.monto);
  const monto = Number.isFinite(n) ? montoCaja(n, p.hija.moneda) : String(p.monto);
  return `Se registrará una reposición de ${monto} en la caja de ${nombreCajaFondeada(
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
): RangoHistorialCaja {
  const d0 = primero(desde);
  const h0 = primero(hasta);
  const d = esDiaValido(d0) ? d0 : undefined;
  const h = esDiaValido(h0) ? h0 : undefined;
  if (d && h && d > h) return { desde: h, hasta: d };
  const out: RangoHistorialCaja = {};
  if (d) out.desde = d;
  if (h) out.hasta = h;
  return out;
}

export function hayRangoHistorial(r: RangoHistorialCaja): boolean {
  return !!(r.desde || r.hasta);
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
