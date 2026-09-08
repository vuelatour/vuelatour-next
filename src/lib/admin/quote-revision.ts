import { cotizacionEditablePorFecha } from "@/lib/datetime";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type { PersistedEscala, PersistedQuote } from "@/types/quotes-persisted";

/**
 * Candados para EDITAR una cotización (FUENTE ÚNICA, 5-sep-2026; edición
 * directa desde F0, 8-sep-2026): los mismos booleanos y las mismas razones
 * deciden si el documento se abre editable (`canRevise`) o en lectura con
 * 🔒, y se pintan en la barra de acciones y en la barra del total. Regla
 * vigente:
 *
 * - Editable mientras no se haya cobrado/facturado (ajustes de última hora)
 *   y solo dentro de la ventana de edición: vuelo del mes corriente o
 *   anterior (hora Cancún) — más atrás pertenece a cierres pasados.
 * - CANCELADA también se edita (decisión del equipo, 1-sep-2026): el vuelo
 *   no salió pero la parte financiera existió; en balances la venta es LO
 *   COBRADO, así que el cobro NO bloquea — solo la factura (CFDI ancla) y la
 *   ventana de mes. El backend valida lo mismo.
 * - Vuelo de SERVICIO (taller/parada técnica sin pasajeros) no se cotiza: el
 *   backend rechaza igual con 409.
 */

export const RAZON_REVISION = {
  mesCerrado:
    "El vuelo es de un mes ya cerrado (anterior al mes pasado): la cotización ya no puede ajustarse.",
  cobrado:
    "El vuelo ya tiene cobros registrados: la cotización no puede editarse.",
  facturado:
    "La cotización ya está facturada (CFDI): ya no puede editarse.",
  servicio:
    "Vuelo de servicio (taller/parada técnica sin pasajeros): no es del cliente y no se cotiza.",
  cancelada:
    "El vuelo está cancelado: los cambios solo ajustan el desglose para efectos financieros/documentales. En balances la venta sigue siendo lo cobrado y el vuelo NO se reactiva.",
} as const;

export interface CandadoRevision {
  /** El documento se abre editable (todos los candados abiertos). */
  canRevise: boolean;
  esCancelada: boolean;
  bloqueadaPorMes: boolean;
  /** Cobrado (sin factura): la revisión cambiaría un total YA cobrado. */
  bloqueadaPorCobro: boolean;
  bloqueadaPorFactura: boolean;
  esVueloServicio: boolean;
  /** Razón legible cuando NO se puede editar; null cuando sí. */
  razon: string | null;
}

/** Vuelo de SERVICIO: escalas activas, alguna de servicio y ninguna con pax. */
export function esVueloDeServicio(
  escalas: PersistedEscala[] | null | undefined,
): boolean {
  const activas = (escalas ?? []).filter((e) => !e.cancelada_at);
  return (
    activas.length > 0 &&
    activas.some((e) => e.tipo_parada === "SERVICIO") &&
    activas.every((e) => !(Number(e.pasajeros) > 0))
  );
}

/**
 * Dinero cobrado del vuelo, para espejar el candado D3 del API (8-sep-2026):
 * `revise` responde 409 COTIZACION_COBRADA cuando el NETO de cobros
 * (cobrosEnUsd) es distinto de cero o hay un cobro MXN sin tipo de cambio,
 * en cualquier estado salvo CANCELADO. La bandera `cobrado` (total cubierto)
 * ya no basta: un anticipo parcial también congela la edición.
 */
export interface CobrosInfoCandado {
  /** Neto cobrado en USD (cobrosEnUsd); un reembolso completo lo deja en 0. */
  totalCobrado?: number | null;
  /** Cobros MXN sin TC propio ni TC del vuelo: el API no los puede sumar y bloquea. */
  cobrosSinTc?: number | null;
}

export function candadoRevision(
  q: Pick<PersistedQuote, "estado" | "cobrado" | "facturado" | "fecha_vuelo"> & {
    escalas?: PersistedEscala[] | null;
  },
  cobros?: CobrosInfoCandado,
): CandadoRevision {
  const enVentana = cotizacionEditablePorFecha(q.fecha_vuelo);
  const esCancelada = q.estado === "CANCELADO";
  const tieneDineroCobrado =
    Boolean(q.cobrado) ||
    Math.abs(Number(cobros?.totalCobrado ?? 0)) > 0.005 ||
    Number(cobros?.cobrosSinTc ?? 0) > 0;
  const revisableSinVentana = esCancelada
    ? !q.facturado
    : !tieneDineroCobrado && !q.facturado;
  const esVueloServicio = esVueloDeServicio(q.escalas);
  const bloqueadaPorMes = revisableSinVentana && !enVentana;
  const bloqueadaPorCobro = !esCancelada && tieneDineroCobrado && !q.facturado;
  const bloqueadaPorFactura = q.facturado;
  const canRevise = revisableSinVentana && enVentana && !esVueloServicio;
  const razon = esVueloServicio
    ? RAZON_REVISION.servicio
    : bloqueadaPorFactura
      ? RAZON_REVISION.facturado
      : bloqueadaPorCobro
        ? RAZON_REVISION.cobrado
        : bloqueadaPorMes
          ? RAZON_REVISION.mesCerrado
          : null;
  return {
    canRevise,
    esCancelada,
    bloqueadaPorMes,
    bloqueadaPorCobro,
    bloqueadaPorFactura,
    esVueloServicio,
    razon,
  };
}

// =====================================================================
// EDICIÓN DIRECTA (F0, 8-sep-2026): diff SEMÁNTICO del formulario del
// cotizador y armado del motivo de la versión.
//
// El documento se edita al abrir (sin «Revisar»); lo que decide si hay algo
// que guardar NO es `isDirty` de react-hook-form (un "4" tecleado sobre un 4
// numérico o un espacio en una nota lo ensuciarían) sino `resumirCambios`,
// que compara valores NORMALIZADOS (número/string/booleano) y produce una
// lista legible («Pasajeros 4→6», «+Extra Handler $1,500»). Sin diff no hay
// Guardar; el resumen viaja como PREFIJO del motivo humano (chip + texto).
// Puro: sin React ni I/O — con tests en __tests__/quote-revision.test.ts.
// =====================================================================

/** Tramo comercial tal como vive en el form (tipos laxos: inputs). */
export interface EscalaDiff {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number | string | null;
  pasajeros?: number | string | null;
  pasajeros_nombres?: string[] | null;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  pernocta_costo_usd?: number | string | null;
  tipo_parada?: string | null;
  servicio_notas?: string | null;
  notas?: string | null;
  fecha_salida_plan?: string | null;
}

export interface ExtraDiff {
  concepto: string;
  monto_usd: number | string | null;
  moneda?: string | null;
  aplica_iva?: boolean | null;
  cantidad?: number | string | null;
  unitario?: number | string | null;
  por_persona?: boolean | null;
  origen?: string | null;
}

export interface TuaDiff {
  iata: string;
  monto_pax: number | string | null;
  moneda: string;
}

/**
 * Subconjunto del form del cotizador que participa en el diff. Todo
 * opcional: `resumirCambios` tolera formularios parciales (borradores) y
 * campos que aún no existen en una versión vieja.
 */
export interface QuoteFormDiff {
  cliente_id?: string | null;
  fecha_vuelo?: string | null;
  fecha_traslado_final?: string | null;
  aeronave_id?: string | null;
  escalas?: EscalaDiff[] | null;
  tipo_tarifa?: string | null;
  pasajeros?: number | string | null;
  pase_abordar?: boolean | null;
  sobrevuelo_hr?: number | string | null;
  tiempo_cobrable_override_hr?: number | string | null;
  cobrar_tuas?: boolean | null;
  tuas_lineas?: TuaDiff[] | null;
  cotizacion_abierta?: boolean | null;
  pdf_mostrar_tarifa?: boolean | null;
  pdf_mostrar_itinerario?: boolean | null;
  es_externo?: boolean | null;
  operador_externo?: string | null;
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  costo_externo_monto?: number | string | null;
  costo_externo_moneda?: string | null;
  total_pactado_usd?: number | string | null;
  extras?: ExtraDiff[] | null;
  redondeo_auto?: boolean | null;
  redondeo_usd?: number | string | null;
  descuento_usd?: number | string | null;
  metodo_pago?: string | null;
  metodo_pago_detalle?: string | null;
  tc_usd_mxn?: number | string | null;
  comision_billpocket_pct?: number | string | null;
  comision_vendedor_modo?: string | null;
  comision_vendedor_usd?: number | string | null;
  comision_vendedor_tarifa_hr?: number | string | null;
  comision_vendedor_nombre?: string | null;
  tarifa_hora_override_usd?: number | string | null;
  tuas_override_usd_pax?: number | string | null;
  iva_pct_override?: number | string | null;
  notas?: string | null;
  notas_internas?: string | null;
  // Presentes en el form pero IGNORADOS a propósito (no son datos de la
  // cotización): motivo (texto libre del diálogo), tarifa_personalizada
  // (modo de UI), tipo (siempre MULTIESCALA), ruta_id (referencia; el cambio
  // real se ve en los tramos), escalas_operacion (solo alta).
  motivo?: string | null;
  tarifa_personalizada?: boolean | null;
  tipo?: string | null;
  ruta_id?: string | null;
  escalas_operacion?: unknown[] | null;
}

export interface CambioCotizacion {
  /** Identificador estable del campo («pasajeros», «escalas.1», «extras.handler»). */
  clave: string;
  /** Texto corto legible («Pasajeros 4→6»). */
  texto: string;
  /**
   * El cambio toca lo que el API notifica a la tripulación al guardar
   * (fechas de traslado, avión, pernocta, fecha de un tramo). El precio
   * nunca notifica.
   */
  tripulacion: boolean;
}

export interface ContextoResumen {
  /** Catálogo para nombrar aviones por MODELO («Avión Kodiak→Seneca»). */
  aviones?: { id: string; modelo: string; matricula?: string | null }[];
}

// ---- normalización -------------------------------------------------------

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function bool(v: unknown): boolean {
  return v === true;
}

function mismoNum(a: unknown, b: unknown): boolean {
  return num(a) === num(b);
}

// ---- formato (compacto, sin importar lib/format: puro) -------------------

function fmtMonto(n: number | null, moneda?: string | null): string {
  if (n === null) return "—";
  const s = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return moneda === "MXN" ? `MX$${s}` : `$${s}`;
}

function fmtNum(n: number | null, unidad = ""): string {
  if (n === null) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unidad}`;
}

const MESES_CORTOS_DIFF = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "YYYY-MM-DDTHH:mm" (pared Cancún) → "12 sep 08:00". Solo texto, sin Date. */
function fechaCorta(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(str(v));
  if (!m) return str(v) ? str(v) : "—";
  const mes = MESES_CORTOS_DIFF[Number(m[2]) - 1] ?? m[2];
  return m[4] ? `${Number(m[3])} ${mes} ${m[4]}:${m[5]}` : `${Number(m[3])} ${mes}`;
}

function siNo(b: boolean): string {
  return b ? "sí" : "no";
}

function tarifaLabel(v: unknown): string {
  const s = str(v).toUpperCase();
  return s === "BROKER" ? "Broker" : s === "PUBLICO" ? "Público" : s || "—";
}

/** Monto efectivo de un extra: cantidad × unitario si lo trae; si no, el monto. */
function montoExtra(e: ExtraDiff): number | null {
  const unit = num(e.unitario);
  if (unit !== null) {
    const cant = num(e.cantidad);
    return cant !== null ? Math.round(unit * cant * 100) / 100 : unit;
  }
  return num(e.monto_usd);
}

// ---- diff ----------------------------------------------------------------

/**
 * Compara dos estados del formulario del cotizador y devuelve los cambios
 * REALES en orden estable (encabezado → tramos → cargos → cobro → notas).
 * Normaliza números ("4" == 4, "" == null), strings (trim) y booleanos, así
 * que teclear y borrar no produce cambios fantasma.
 */
export function resumirCambios(
  prev: QuoteFormDiff,
  next: QuoteFormDiff,
  ctx: ContextoResumen = {},
): CambioCotizacion[] {
  const out: CambioCotizacion[] = [];
  const push = (clave: string, texto: string, tripulacion = false) =>
    out.push({ clave, texto, tripulacion });

  // --- encabezado ---
  if (str(prev.cliente_id) !== str(next.cliente_id)) push("cliente", "Cliente");
  if (str(prev.fecha_vuelo) !== str(next.fecha_vuelo)) {
    push(
      "fecha_vuelo",
      `Fecha traslado inicial ${fechaCorta(prev.fecha_vuelo)}→${fechaCorta(next.fecha_vuelo)}`,
      true,
    );
  }
  if (str(prev.fecha_traslado_final) !== str(next.fecha_traslado_final)) {
    push(
      "fecha_traslado_final",
      `Fecha traslado final ${fechaCorta(prev.fecha_traslado_final)}→${fechaCorta(next.fecha_traslado_final)}`,
      true,
    );
  }
  if (str(prev.aeronave_id) !== str(next.aeronave_id)) {
    const nombre = (id: unknown) => {
      const a = ctx.aviones?.find((x) => x.id === str(id));
      return a ? a.modelo : str(id) ? str(id).slice(0, 8) : "—";
    };
    push("aeronave", `Avión ${nombre(prev.aeronave_id)}→${nombre(next.aeronave_id)}`, true);
  }
  if (!mismoNum(prev.pasajeros, next.pasajeros)) {
    push("pasajeros", `Pasajeros ${fmtNum(num(prev.pasajeros))}→${fmtNum(num(next.pasajeros))}`);
  }
  if (bool(prev.pase_abordar) !== bool(next.pase_abordar)) {
    push("pase_abordar", `Pase de abordar ${siNo(bool(next.pase_abordar))}`);
  }
  if (bool(prev.cotizacion_abierta) !== bool(next.cotizacion_abierta)) {
    push("cotizacion_abierta", `Cotización abierta ${siNo(bool(next.cotizacion_abierta))}`);
  }

  // --- avión y tarifa ---
  if (str(prev.tipo_tarifa) !== str(next.tipo_tarifa)) {
    push("tipo_tarifa", `Tarifa ${tarifaLabel(prev.tipo_tarifa)}→${tarifaLabel(next.tipo_tarifa)}`);
  }
  if (!mismoNum(prev.tarifa_hora_override_usd, next.tarifa_hora_override_usd)) {
    const a = num(prev.tarifa_hora_override_usd);
    const b = num(next.tarifa_hora_override_usd);
    push(
      "tarifa_override",
      b === null
        ? "Tarifa/hr vuelve a la del cliente/avión"
        : a === null
          ? `Tarifa/hr manual ${fmtMonto(b)}`
          : `Tarifa/hr ${fmtMonto(a)}→${fmtMonto(b)}`,
    );
  }
  if (!mismoNum(prev.sobrevuelo_hr, next.sobrevuelo_hr)) {
    push(
      "sobrevuelo",
      `Sobrevuelo ${fmtNum(num(prev.sobrevuelo_hr) ?? 0)}→${fmtNum(num(next.sobrevuelo_hr) ?? 0)} hr`,
    );
  }
  if (!mismoNum(prev.tiempo_cobrable_override_hr, next.tiempo_cobrable_override_hr)) {
    const b = num(next.tiempo_cobrable_override_hr);
    push(
      "cobrable",
      b === null
        ? "Cobrable vuelve a la regla"
        : `Cobrable pactado ${fmtNum(num(prev.tiempo_cobrable_override_hr))}→${fmtNum(b)} hr`,
    );
  }

  // --- tramos (por posición) ---
  const pe = prev.escalas ?? [];
  const ne = next.escalas ?? [];
  const n = Math.max(pe.length, ne.length);
  const ruta = (e: EscalaDiff) => `${str(e.origen_iata) || "?"}→${str(e.destino_iata) || "?"}`;
  for (let i = 0; i < n; i++) {
    const a = pe[i];
    const b = ne[i];
    const k = `escalas.${i}`;
    const t = `Tramo ${i + 1}`;
    if (a && !b) {
      push(k, `${t} ${ruta(a)} eliminado`, bool(a.requiere_pernocta));
      continue;
    }
    if (!a && b) {
      push(k, `+${t} ${ruta(b)}`, bool(b.requiere_pernocta));
      continue;
    }
    if (!a || !b) continue;
    if (ruta(a) !== ruta(b)) push(`${k}.ruta`, `${t} ${ruta(a)} ahora ${ruta(b)}`);
    if (!mismoNum(a.millas_nauticas, b.millas_nauticas)) {
      push(`${k}.nm`, `${t} NM ${fmtNum(num(a.millas_nauticas) ?? 0)}→${fmtNum(num(b.millas_nauticas) ?? 0)}`);
    }
    if (!mismoNum(a.pasajeros, b.pasajeros)) {
      push(`${k}.pax`, `${t} pax ${fmtNum(num(a.pasajeros))}→${fmtNum(num(b.pasajeros))}`);
    }
    if (bool(a.es_ferry) !== bool(b.es_ferry)) push(`${k}.ferry`, `${t} ferry ${siNo(bool(b.es_ferry))}`);
    if (bool(a.requiere_pernocta) !== bool(b.requiere_pernocta)) {
      push(`${k}.pernocta`, `${t} pernocta ${siNo(bool(b.requiere_pernocta))}`, true);
    } else if (bool(b.requiere_pernocta) && !mismoNum(a.pernocta_costo_usd, b.pernocta_costo_usd)) {
      push(
        `${k}.pernocta_costo`,
        `${t} pernocta ${fmtMonto(num(a.pernocta_costo_usd))}→${fmtMonto(num(b.pernocta_costo_usd))}`,
      );
    }
    const servA = str(a.tipo_parada).toUpperCase() === "SERVICIO";
    const servB = str(b.tipo_parada).toUpperCase() === "SERVICIO";
    if (servA !== servB) push(`${k}.servicio`, `${t} servicio ${siNo(servB)}`);
    else if (servB && str(a.servicio_notas) !== str(b.servicio_notas)) {
      push(`${k}.servicio_notas`, `${t} detalle del servicio`);
    }
    if (str(a.notas) !== str(b.notas)) push(`${k}.notas`, `${t} nota al piloto`);
    if (str(a.fecha_salida_plan) !== str(b.fecha_salida_plan)) {
      push(`${k}.fecha`, `${t} fecha ${fechaCorta(a.fecha_salida_plan)}→${fechaCorta(b.fecha_salida_plan)}`, true);
    }
    const nomA = (a.pasajeros_nombres ?? []).map(str).filter(Boolean).join("|");
    const nomB = (b.pasajeros_nombres ?? []).map(str).filter(Boolean).join("|");
    if (nomA !== nomB) push(`${k}.nombres`, `${t} nombres de pasajeros`);
  }

  // --- TUAS ---
  if (bool(prev.cobrar_tuas ?? true) !== bool(next.cobrar_tuas ?? true)) {
    push("cobrar_tuas", bool(next.cobrar_tuas ?? true) ? "TUAS se cobran" : "TUAS no se cobran");
  }
  const tuasPrev = new Map((prev.tuas_lineas ?? []).map((l) => [str(l.iata).toUpperCase(), l]));
  const tuasNext = new Map((next.tuas_lineas ?? []).map((l) => [str(l.iata).toUpperCase(), l]));
  for (const iata of new Set([...tuasPrev.keys(), ...tuasNext.keys()])) {
    const a = tuasPrev.get(iata);
    const b = tuasNext.get(iata);
    const k = `tuas.${iata}`;
    if (a && !b) push(k, `TUA ${iata} vuelve al catálogo`);
    else if (!a && b) push(k, `TUA ${iata} ${fmtMonto(num(b.monto_pax) ?? 0, b.moneda)}`);
    else if (a && b && (!mismoNum(a.monto_pax, b.monto_pax) || str(a.moneda) !== str(b.moneda))) {
      push(k, `TUA ${iata} ${fmtMonto(num(a.monto_pax) ?? 0, a.moneda)}→${fmtMonto(num(b.monto_pax) ?? 0, b.moneda)}`);
    }
  }
  if (!mismoNum(prev.tuas_override_usd_pax, next.tuas_override_usd_pax)) {
    push("tuas_override", `TUAS por pax ${fmtMonto(num(prev.tuas_override_usd_pax))}→${fmtMonto(num(next.tuas_override_usd_pax))}`);
  }

  // --- extras (por concepto; duplicados por posición) ---
  const claveExtra = (e: ExtraDiff, i: number, vistos: Map<string, number>) => {
    const base = str(e.concepto).toLowerCase() || `#${i + 1}`;
    const rep = vistos.get(base) ?? 0;
    vistos.set(base, rep + 1);
    return rep === 0 ? base : `${base}#${rep + 1}`;
  };
  const exPrev = new Map<string, ExtraDiff>();
  const exNext = new Map<string, ExtraDiff>();
  {
    const v1 = new Map<string, number>();
    (prev.extras ?? []).forEach((e, i) => exPrev.set(claveExtra(e, i, v1), e));
    const v2 = new Map<string, number>();
    (next.extras ?? []).forEach((e, i) => exNext.set(claveExtra(e, i, v2), e));
  }
  for (const key of new Set([...exPrev.keys(), ...exNext.keys()])) {
    const a = exPrev.get(key);
    const b = exNext.get(key);
    const k = `extras.${key}`;
    const nombre = (e: ExtraDiff) => str(e.concepto) || "(sin concepto)";
    if (a && !b) push(k, `−Extra ${nombre(a)}`);
    else if (!a && b) push(k, `+Extra ${nombre(b)} ${fmtMonto(montoExtra(b), b.moneda)}`);
    else if (a && b) {
      const ma = montoExtra(a);
      const mb = montoExtra(b);
      if (ma !== mb || str(a.moneda || "USD") !== str(b.moneda || "USD")) {
        push(k, `Extra ${nombre(b)} ${fmtMonto(ma, a.moneda)}→${fmtMonto(mb, b.moneda)}`);
      } else if (bool(a.aplica_iva ?? true) !== bool(b.aplica_iva ?? true)) {
        push(k, `Extra ${nombre(b)} ${bool(b.aplica_iva ?? true) ? "con" : "sin"} IVA`);
      } else if (bool(a.por_persona) !== bool(b.por_persona) || !mismoNum(a.cantidad, b.cantidad)) {
        push(k, `Extra ${nombre(b)} cantidad`);
      }
    }
  }

  // --- cobro y cierre ---
  if (str(prev.metodo_pago) !== str(next.metodo_pago)) {
    // Etiquetas de la fuente única (OTRO muestra el detalle: «Otro (Zelle)»).
    const l = (v: unknown, det: unknown) => metodoPagoLabel(str(v), str(det));
    push(
      "metodo_pago",
      `Método ${l(prev.metodo_pago, prev.metodo_pago_detalle)}→${l(next.metodo_pago, next.metodo_pago_detalle)}`,
    );
  } else if (str(next.metodo_pago) === "OTRO" && str(prev.metodo_pago_detalle) !== str(next.metodo_pago_detalle)) {
    push("metodo_pago_detalle", `Método: ${str(next.metodo_pago_detalle) || "—"}`);
  }
  if (!mismoNum(prev.tc_usd_mxn, next.tc_usd_mxn)) {
    push("tc", `TC ${fmtNum(num(prev.tc_usd_mxn))}→${fmtNum(num(next.tc_usd_mxn))}`);
  }
  if (!mismoNum(prev.comision_billpocket_pct, next.comision_billpocket_pct)) {
    push("billpocket", `BillPocket ${fmtNum(num(prev.comision_billpocket_pct) ?? 0, "%")}→${fmtNum(num(next.comision_billpocket_pct) ?? 0, "%")}`);
  }
  if (!mismoNum(prev.iva_pct_override, next.iva_pct_override)) {
    const b = num(next.iva_pct_override);
    push(
      "iva",
      b === null
        ? "IVA según método de pago"
        : `IVA manual ${fmtNum(Math.round(b * 10000) / 100, "%")}`,
    );
  }
  if (bool(prev.redondeo_auto) !== bool(next.redondeo_auto)) {
    push("redondeo_auto", `Redondeo automático ${siNo(bool(next.redondeo_auto))}`);
  }
  if (!mismoNum(prev.redondeo_usd, next.redondeo_usd)) {
    push("redondeo", `Redondeo ${fmtMonto(num(prev.redondeo_usd) ?? 0)}→${fmtMonto(num(next.redondeo_usd) ?? 0)}`);
  }
  if (!mismoNum(prev.descuento_usd, next.descuento_usd)) {
    push("descuento", `Descuento ${fmtMonto(num(prev.descuento_usd) ?? 0)}→${fmtMonto(num(next.descuento_usd) ?? 0)}`);
  }
  // Comisión del vendedor: se compara el par (modo, valor) efectivo.
  const comA = str(prev.comision_vendedor_modo) === "POR_HORA"
    ? { modo: "POR_HORA", v: num(prev.comision_vendedor_tarifa_hr) }
    : { modo: "FIJA", v: num(prev.comision_vendedor_usd) };
  const comB = str(next.comision_vendedor_modo) === "POR_HORA"
    ? { modo: "POR_HORA", v: num(next.comision_vendedor_tarifa_hr) }
    : { modo: "FIJA", v: num(next.comision_vendedor_usd) };
  if ((comA.v ?? 0) !== (comB.v ?? 0) || ((comA.v ?? 0) > 0 && comA.modo !== comB.modo)) {
    const f = (c: { modo: string; v: number | null }) =>
      !c.v ? "$0" : c.modo === "POR_HORA" ? `${fmtMonto(c.v)}/hr` : fmtMonto(c.v);
    push("comision_vendedor", `Comisión vendedor ${f(comA)}→${f(comB)}`);
  }
  if (
    ((comB.v ?? 0) > 0 || (comA.v ?? 0) > 0) &&
    str(prev.comision_vendedor_nombre) !== str(next.comision_vendedor_nombre)
  ) {
    push("comision_vendedor_nombre", `Vendedor ${str(next.comision_vendedor_nombre) || "—"}`);
  }

  // --- externo ---
  if (bool(prev.es_externo) !== bool(next.es_externo)) {
    push("es_externo", `Operador externo ${siNo(bool(next.es_externo))}`);
  }
  if (str(prev.operador_externo) !== str(next.operador_externo)) {
    push("operador_externo", `Operador ${str(prev.operador_externo) || "—"}→${str(next.operador_externo) || "—"}`);
  }
  if (
    str(prev.avion_externo_modelo) !== str(next.avion_externo_modelo) ||
    str(prev.avion_externo_matricula).toUpperCase() !== str(next.avion_externo_matricula).toUpperCase()
  ) {
    push(
      "avion_externo",
      `Avión externo ${[str(next.avion_externo_modelo), str(next.avion_externo_matricula)].filter(Boolean).join(" · ") || "—"}`,
    );
  }
  {
    const a = num(prev.costo_externo_monto);
    const b = num(next.costo_externo_monto);
    const monA = a ? str(prev.costo_externo_moneda || "USD") : "";
    const monB = b ? str(next.costo_externo_moneda || "USD") : "";
    if (a !== b || monA !== monB) {
      push("costo_externo", `Costo externo ${fmtMonto(a, monA)}→${fmtMonto(b, monB)}`);
    }
  }
  if (!mismoNum(prev.total_pactado_usd, next.total_pactado_usd)) {
    push("pactado", `Pactado ${fmtMonto(num(prev.total_pactado_usd))}→${fmtMonto(num(next.total_pactado_usd))}`);
  }

  // --- notas y PDF ---
  if (bool(prev.pdf_mostrar_tarifa) !== bool(next.pdf_mostrar_tarifa)) {
    push("pdf_tarifa", `PDF: tarifa/hr ${bool(next.pdf_mostrar_tarifa) ? "visible" : "oculta"}`);
  }
  if (bool(prev.pdf_mostrar_itinerario ?? true) !== bool(next.pdf_mostrar_itinerario ?? true)) {
    push("pdf_itinerario", `PDF: itinerario ${bool(next.pdf_mostrar_itinerario ?? true) ? "visible" : "oculto"}`);
  }
  if (str(prev.notas) !== str(next.notas)) push("notas", "Notas del PDF");
  if (str(prev.notas_internas) !== str(next.notas_internas)) push("notas_internas", "Notas internas");

  return out;
}

/** ¿Algún cambio toca lo que el API avisa a la tripulación? */
export function cambiosTocanTripulacion(cambios: CambioCotizacion[]): boolean {
  return cambios.some((c) => c.tripulacion);
}

/**
 * Resumen en una línea para el badge/diálogo/prefijo del motivo:
 * «Pasajeros 4→6 · +Extra Handler $1,500 · +2 más». `max` limita cuántos
 * se listan; el resto se cuenta.
 */
export function textoResumenCambios(
  cambios: CambioCotizacion[],
  max = 4,
): string {
  if (cambios.length === 0) return "";
  const lista = cambios.slice(0, max).map((c) => c.texto);
  const resto = cambios.length - lista.length;
  return resto > 0 ? `${lista.join(" · ")} · +${resto} más` : lista.join(" · ");
}

/** Chips de motivo humano (D1, 8-sep-2026): uno es obligatorio. */
export const MOTIVOS_REVISION = [
  "Corrección",
  "Cliente pidió",
  "Cambio de precio",
  "Cambio de avión/fecha",
  "Otro",
] as const;
export type MotivoRevisionChip = (typeof MOTIVOS_REVISION)[number];

/** Tope del DTO (`ReviseQuoteDto.motivo`: 3-500). */
export const MOTIVO_MAX = 500;

/**
 * Motivo que viaja al API: «[pax 4→6 · +Handler $1,500] Cliente pidió — texto».
 * El resumen automático es PREFIJO (el "qué"); el chip + texto es el "por
 * qué". Si excede el tope se recorta primero el resumen, nunca el motivo
 * humano. Sin chip devuelve "" (no se puede guardar).
 */
export function armarMotivoRevision(input: {
  chip: string | null | undefined;
  texto?: string | null;
  resumen?: string | null;
}): string {
  const chip = str(input.chip);
  if (!chip) return "";
  const texto = str(input.texto);
  const humano = texto ? `${chip} — ${texto}` : chip;
  let resumen = str(input.resumen);
  if (!resumen) return humano.slice(0, MOTIVO_MAX);
  const espacio = MOTIVO_MAX - humano.length - 3; // "[" + "] "
  if (espacio < 8) return humano.slice(0, MOTIVO_MAX);
  if (resumen.length > espacio) resumen = `${resumen.slice(0, espacio - 1)}…`;
  return `[${resumen}] ${humano}`;
}
