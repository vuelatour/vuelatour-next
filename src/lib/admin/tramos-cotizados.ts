/**
 * LA COTIZACIÓN ES INDEPENDIENTE DE LA OPERACIÓN — **TRAMOS** (22-sep-2026).
 *
 * Pedido del cliente sobre la cotización #326: «antes de poner el tipo de
 * cambio está en 3596 y después de ponerlo, se cambia en automático, no sé
 * por qué». Se cotizó `T1 CUN→PTU FERRY` + `T2 PTU→CUN 2 pax` ⇒ TUAS $0 ⇒
 * **$3,596.00**. Al día siguiente el PILOTO editó los dos tramos desde la app
 * (4 pax, sin ferry) — cambio OPERATIVO legítimo. El cotizador rehidrataba los
 * tramos de la **escala VIVA**, así que al teclear cualquier cosa (el T.C.)
 * llamaba al motor con 4 pax saliendo de CUN ⇒ TUA CUN $25 × 4 + IVA ⇒
 * **$3,712.00**. El total pactado cambiaba solo.
 *
 * Es la MISMA regla que ya rige para el avión desde el 12-sep-2026
 * (`lib/admin/avion-cotizado.ts`, R1): **el cotizador arranca SIEMPRE con lo
 * COTIZADO**, y lo que difiere de ahí es una edición deliberada de la oficina.
 * Este archivo es su hermano para los TRAMOS.
 *
 * Qué PRECIA (sale del snapshot): origen, destino, millas, pasajeros,
 * `es_ferry`, pernocta y su costo, tipo de parada y sus notas.
 * Qué NO precia y vive en la operación (sale de la escala VIVA del MISMO
 * `orden`, y solo si su ruta sigue siendo la del tramo cotizado):
 * `fecha_salida_plan`, `notas` del tramo y `pasajeros_nombres`.
 *
 * PURO: sin React, sin `fetch`, sin `lib/format`. Congelado en
 * `__tests__/tramos-cotizados.test.ts`.
 */

import { isoToCancunInput } from "@/lib/datetime";
import type { EscalaInput, QuoteBreakdown, TipoParada } from "@/types/quote";

// ===== Normalizadores =====

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const iata = (v: unknown): string => txt(v).toUpperCase();
const bool = (v: unknown): boolean => v === true;
const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const numONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const nombres = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => txt(x)).filter(Boolean) : [];
/** ISO (UTC) → `datetime-local` en hora de Cancún; null si no hay o no es fecha. */
const fechaInput = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  return isoToCancunInput(s) || null;
};

// ===== Formas mínimas que leen los helpers (tolerantes con el API) =====

/** Escala VIVA del vuelo (la que edita el piloto desde la app). */
export interface EscalaViva {
  id?: string | null;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas?: string | number | null;
  pasajeros?: number | null;
  pasajeros_nombres?: string[] | null;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  pernocta_costo_usd?: string | number | null;
  tipo_parada?: TipoParada | null;
  servicio_notas?: string | null;
  notas?: string | null;
  fecha_salida_plan?: string | null;
  /** Tramo de posicionamiento que NO se cotiza: jamás entra al formulario. */
  solo_operativa?: boolean | null;
  cancelada_at?: string | null;
}

/** Subconjunto de la cotización que necesitan estos helpers. */
export interface QuoteTramos {
  /** true = las escalas del vuelo son el itinerario OPERATIVO (otra ruta a
   *  propósito): la comercial cotizada vive solo en el snapshot. */
  itinerario_operativo?: boolean | null;
  calculo_snapshot?: QuoteBreakdown | null;
  /** Solo presente en `GET /v1/quotes/:id`. */
  escalas?: EscalaViva[] | null;
  origen_iata?: string;
  destino_iata?: string;
  millas_nauticas_one_way?: string | number | null;
  es_redondo_auto?: boolean;
  pasajeros?: number;
}

/** De dónde salieron los tramos con los que arranca el formulario. */
export type FuenteTramos =
  /** `calculo_snapshot.ruta.escalas`: el INPUT exacto con el que se pactó. */
  | "snapshot_escalas"
  /** `calculo_snapshot.tramos`: el resuelto del motor (snapshot sin `ruta.escalas`). */
  | "snapshot_tramos"
  /** Sin snapshot todavía no hay nada pactado: las escalas comerciales vivas. */
  | "operacion"
  /** Vuelo con itinerario operativo y SIN cotizar: sugerencia CUN→destino→CUN. */
  | "sugerida"
  /** Cotización REDONDO legada (sin escalas): su par origen/destino. */
  | "legado";

/** Tramo con el que arranca el formulario + el `orden` con el que se cruza
 *  contra la escala VIVA (toggles del PDF, fechas). `null` cuando ese tramo
 *  no tiene escala viva a la que corresponder (sugerencia o legado). */
export interface TramoCotizado {
  escala: EscalaInput;
  orden: number | null;
}

export interface TramosCotizados {
  tramos: TramoCotizado[];
  fuente: FuenteTramos;
}

// ===== Cascada de «con qué tramos se pactó el precio» =====

/** Escalas COMERCIALES vivas (sin las solo operativas), ordenadas por `orden`. */
export function escalasComerciales(q: QuoteTramos): EscalaViva[] {
  return (q.escalas ?? [])
    .filter((e) => !bool(e.solo_operativa))
    .slice()
    .sort((a, b) => num(a.orden) - num(b.orden));
}

/** ¿Los dos tramos son el MISMO trayecto? (lo que los identifica entre listas) */
export function mismaRuta(
  a: { origen_iata?: unknown; destino_iata?: unknown } | null | undefined,
  b: { origen_iata?: unknown; destino_iata?: unknown } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    iata(a.origen_iata) === iata(b.origen_iata) &&
    iata(a.destino_iata) === iata(b.destino_iata)
  );
}

/** Pasajeros EFECTIVOS de un tramo: un ferry siempre va en 0. */
export function paxDeTramo(
  t: { pasajeros?: number | null; es_ferry?: boolean | null } | null | undefined,
): number {
  if (!t) return 0;
  if (bool(t.es_ferry)) return 0;
  return Math.max(0, Math.trunc(num(t.pasajeros)));
}

/** ¿El snapshot trae los tramos con los que se pactó el precio? */
export function haySnapshotDeTramos(q: QuoteTramos): boolean {
  const snap = q.calculo_snapshot;
  if (!snap) return false;
  return (snap.ruta?.escalas?.length ?? 0) > 0 || (snap.tramos?.length ?? 0) > 0;
}

/** Campos que PRECIAN, tal como los guardó el snapshot (`ruta.escalas`). */
function deEscalaDelSnapshot(e: EscalaInput): EscalaInput {
  return {
    origen_iata: iata(e.origen_iata),
    destino_iata: iata(e.destino_iata),
    millas_nauticas: num(e.millas_nauticas),
    pasajeros: numONull(e.pasajeros),
    // El manifiesto cotizado es el RESPALDO: manda el de la escala viva
    // cuando existe (es del piloto), pero un tramo sin escala viva no debe
    // perder los nombres con los que se cotizó.
    pasajeros_nombres: nombres(e.pasajeros_nombres),
    es_ferry: bool(e.es_ferry),
    requiere_pernocta: bool(e.requiere_pernocta),
    pernocta_costo_usd: numONull(e.pernocta_costo_usd),
    tipo_parada: e.tipo_parada === "SERVICIO" ? "SERVICIO" : "NORMAL",
    servicio_notas: txt(e.servicio_notas) || null,
    // Nota y fecha del tramo: respaldo del snapshot. Manda la escala VIVA
    // cuando existe una con el mismo orden y la misma ruta.
    notas: txt(e.notas) || null,
    fecha_salida_plan: fechaInput(e.fecha_salida_plan),
  };
}

/** Campos que PRECIAN, desde el tramo RESUELTO del motor (`calculo_snapshot.tramos`). */
function deTramoDelSnapshot(t: NonNullable<QuoteBreakdown["tramos"]>[number]): EscalaInput {
  return {
    origen_iata: iata(t.origen),
    destino_iata: iata(t.destino),
    millas_nauticas: num(t.millas),
    pasajeros: numONull(t.pasajeros),
    pasajeros_nombres: [],
    es_ferry: bool(t.es_ferry),
    requiere_pernocta: bool(t.requiere_pernocta),
    pernocta_costo_usd: numONull(t.pernocta_usd),
    tipo_parada: t.tipo_parada === "SERVICIO" ? "SERVICIO" : "NORMAL",
    servicio_notas: txt(t.servicio_notas) || null,
    notas: null,
    fecha_salida_plan: null,
  };
}

/** Escala VIVA → tramo del formulario (todo sale de la operación). */
export function escalaVivaAEscala(e: EscalaViva): EscalaInput {
  return {
    origen_iata: iata(e.origen_iata),
    destino_iata: iata(e.destino_iata),
    millas_nauticas: num(e.millas_nauticas),
    pasajeros: numONull(e.pasajeros),
    pasajeros_nombres: nombres(e.pasajeros_nombres),
    es_ferry: bool(e.es_ferry),
    requiere_pernocta: bool(e.requiere_pernocta),
    pernocta_costo_usd: numONull(e.pernocta_costo_usd),
    tipo_parada: e.tipo_parada === "SERVICIO" ? "SERVICIO" : "NORMAL",
    servicio_notas: txt(e.servicio_notas) || null,
    notas: txt(e.notas) || null,
    // datetime-local (hora Cancún) para el input del editor de tramos.
    fecha_salida_plan: fechaInput(e.fecha_salida_plan),
  };
}

/**
 * Sugerencia de ruta COMERCIAL para un vuelo con itinerario OPERATIVO que
 * todavía no se cotiza: abre en CUN, va al último destino comercial y vuelve.
 * Es solo un punto de partida editable (no hay nada pactado que respetar).
 */
function comercialSugerida(q: QuoteTramos): EscalaInput[] {
  const comerciales = escalasComerciales(q).filter((e) => !bool(e.es_ferry));
  const destino =
    [...comerciales].reverse().find((e) => iata(e.destino_iata) !== "CUN")
      ?.destino_iata ??
    comerciales[comerciales.length - 1]?.destino_iata ??
    q.destino_iata;
  const d = iata(destino);
  if (!d || d === "CUN") return [];
  const pax = num(q.pasajeros) || 1;
  const tramo = (o: string, dest: string): EscalaInput => ({
    origen_iata: o,
    destino_iata: dest,
    millas_nauticas: 0,
    pasajeros: pax,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    notas: null,
    fecha_salida_plan: null,
  });
  return [tramo("CUN", d), tramo(d, "CUN")];
}

/** Cotización REDONDO legada (sin escalas): sus 2 tramos equivalentes. */
function tramosLegados(q: QuoteTramos): EscalaInput[] {
  const nm = num(q.millas_nauticas_one_way);
  const pax = num(q.pasajeros) || null;
  const tramo = (o: string, d: string): EscalaInput => ({
    origen_iata: iata(o),
    destino_iata: iata(d),
    millas_nauticas: nm,
    pasajeros: pax,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    notas: null,
    fecha_salida_plan: null,
  });
  const origen = txt(q.origen_iata);
  const destino = txt(q.destino_iata);
  if (!origen || !destino) return [];
  return [
    tramo(origen, destino),
    ...(q.es_redondo_auto ? [tramo(destino, origen)] : []),
  ];
}

/**
 * Tramos con los que ARRANCA el formulario del cotizador + el `orden` con el
 * que cada uno se cruza contra la escala viva.
 *
 * Cascada:
 *  1. `calculo_snapshot.ruta.escalas` — el INPUT exacto con el que se pactó
 *     (conserva la diferencia entre «pernocta sin costo capturado» y «costo
 *     capturado», que el resuelto ya rellenó con el default).
 *  2. `calculo_snapshot.tramos` — el resuelto del motor (respaldo).
 *  3. Escalas comerciales VIVAS (sin snapshot no hay nada pactado: una
 *     RESERVA que se cotiza por primera vez). Los tramos CANCELADOS quedan
 *     fuera: un tramo que la operación canceló no se cobra ni se reactiva.
 *  4. Sugerencia CUN→destino→CUN (itinerario operativo sin cotizar).
 *  5. Los 2 tramos del REDONDO legado.
 *
 * Los campos que NO precian se heredan de la escala VIVA del MISMO `orden`
 * y SOLO si la ruta coincide — y nunca con `itinerario_operativo`, donde las
 * escalas del vuelo son otra ruta a propósito.
 */
export function tramosCotizadosDeCotizacion(q: QuoteTramos): TramosCotizados {
  const snap = q.calculo_snapshot ?? null;
  const operativo = bool(q.itinerario_operativo);
  const vivasPorOrden = new Map<number, EscalaViva>();
  for (const e of escalasComerciales(q)) {
    if (!vivasPorOrden.has(num(e.orden))) vivasPorOrden.set(num(e.orden), e);
  }

  /** Ordenes del snapshot: los del motor cuando cuadran, y si no, 1..n. */
  const ordenSnapshot = (i: number): number => {
    const t = snap?.tramos?.[i];
    const o = t ? Math.trunc(num(t.orden)) : 0;
    return o > 0 ? o : i + 1;
  };

  /** Hereda de la escala viva lo que NO precia (misma ruta, mismo orden). */
  const conDatosDeOperacion = (
    escala: EscalaInput,
    orden: number,
  ): TramoCotizado => {
    if (operativo) return { escala, orden };
    const viva = vivasPorOrden.get(orden);
    if (!viva || !mismaRuta(escala, viva)) return { escala, orden };
    return {
      orden,
      escala: {
        ...escala,
        // Manifiesto y nota del piloto: son suyos, no cambian el precio.
        pasajeros_nombres: nombres(viva.pasajeros_nombres),
        notas: txt(viva.notas) || null,
        fecha_salida_plan: fechaInput(viva.fecha_salida_plan),
      },
    };
  };

  const delSnapshotEscalas = snap?.ruta?.escalas ?? null;
  if (delSnapshotEscalas && delSnapshotEscalas.length > 0) {
    return {
      fuente: "snapshot_escalas",
      tramos: delSnapshotEscalas.map((e, i) =>
        conDatosDeOperacion(deEscalaDelSnapshot(e), ordenSnapshot(i)),
      ),
    };
  }
  const delSnapshotTramos = snap?.tramos ?? null;
  if (delSnapshotTramos && delSnapshotTramos.length > 0) {
    return {
      fuente: "snapshot_tramos",
      tramos: delSnapshotTramos.map((t, i) =>
        conDatosDeOperacion(deTramoDelSnapshot(t), ordenSnapshot(i)),
      ),
    };
  }
  if (operativo) {
    return {
      fuente: "sugerida",
      tramos: comercialSugerida(q).map((escala) => ({ escala, orden: null })),
    };
  }
  const vivas = escalasComerciales(q).filter((e) => !txt(e.cancelada_at));
  if (vivas.length > 0) {
    return {
      fuente: "operacion",
      tramos: vivas.map((e) => ({
        escala: escalaVivaAEscala(e),
        orden: Math.trunc(num(e.orden)) || null,
      })),
    };
  }
  return {
    fuente: "legado",
    tramos: tramosLegados(q).map((escala) => ({ escala, orden: null })),
  };
}

/** Los tramos con los que arranca el formulario (sin el `orden`). */
export function tramosDeCotizacion(q: QuoteTramos): EscalaInput[] {
  return tramosCotizadosDeCotizacion(q).tramos.map((t) => t.escala);
}

/**
 * Los tramos VIVOS comerciales como tramos del formulario, para el botón
 * «Actualizar la cotización con la operación». Excluye las solo operativas y
 * los tramos cancelados.
 */
export function tramosDeOperacion(q: QuoteTramos): EscalaInput[] {
  return escalasComerciales(q)
    .filter((e) => !txt(e.cancelada_at))
    .map(escalaVivaAEscala);
}

// ===== Divergencias entre lo COTIZADO y lo que hoy vive en la operación =====

export type MotivoDivergencia =
  | "pax"
  | "ferry"
  | "ruta"
  | "pernocta"
  | "nuevo"
  | "faltante"
  | "cancelado";

export interface Divergencia {
  /** `orden` del tramo (el mismo con el que cruzan el API y el PDF). */
  orden: number;
  /** Todo lo que cambió en ESE tramo; el texto los junta en una frase. */
  motivos: MotivoDivergencia[];
  /** Frase en es-MX, sin mayúscula inicial: «el tramo 1 ya no es ferry…». */
  texto: string;
  /** La diferencia cambiaría el PRECIO si se adoptara. */
  mueveDinero: boolean;
}

export const ETIQUETA_ACTUALIZAR = "Actualizar la cotización con la operación";

/** ¿Esta cotización cobra TUAS? (con el switch apagado el pax no mueve dinero) */
function cobraTuas(snap: QuoteBreakdown | null | undefined): boolean {
  const t = snap?.tuas;
  if (!t) return true;
  if ((t.lineas_capturadas ?? []).some((l) => num(l.monto_pax) > 0)) return true;
  if ((t.filas ?? []).some((f) => f.aplica && num(f.monto_pax) > 0)) return true;
  if (t.usd_pax_default === 0) return false;
  return true;
}

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;
const pax = (n: number) => plural(n, "pasajero", "pasajeros");
const rutaTexto = (t: { origen_iata?: unknown; destino_iata?: unknown }) =>
  `${iata(t.origen_iata) || "?"} → ${iata(t.destino_iata) || "?"}`;

/** La frase de UN tramo divergente, en palabras de operador. */
function fraseDivergencia(
  orden: number,
  motivos: MotivoDivergencia[],
  cotizado: EscalaInput | null,
  viva: EscalaViva | null,
): string {
  const t = `el tramo ${orden}`;
  if (motivos.includes("cancelado")) return `${t} se canceló en la operación`;
  if (motivos.includes("faltante")) {
    return `${t} cotizado${cotizado ? ` (${rutaTexto(cotizado)})` : ""} ya no existe en la operación`;
  }
  if (motivos.includes("nuevo")) {
    return `hay un tramo ${orden}${viva ? ` ${rutaTexto(viva)}` : ""} que no se cotizó`;
  }
  const partes: string[] = [];
  if (motivos.includes("ruta") && cotizado && viva) {
    partes.push(`${t} ahora va ${rutaTexto(viva)} (cotizado ${rutaTexto(cotizado)})`);
  }
  const paxCot = paxDeTramo(cotizado);
  const paxVivo = paxDeTramo(viva);
  const ferryCot = bool(cotizado?.es_ferry);
  const ferryVivo = bool(viva?.es_ferry);
  const sujeto = partes.length > 0 ? "y" : t;
  if (motivos.includes("ferry") && motivos.includes("pax")) {
    partes.push(
      ferryCot
        ? `${sujeto} ya no es ferry y lleva ${pax(paxVivo)} (cotizado: ferry, sin pasajeros)`
        : `${sujeto} ahora es ferry, sin pasajeros (se cotizó con ${pax(paxCot)})`,
    );
  } else if (motivos.includes("ferry")) {
    partes.push(
      ferryVivo
        ? `${sujeto} ahora es ferry (se cotizó con pasajeros)`
        : `${sujeto} ya no es ferry (así se cotizó)`,
    );
  } else if (motivos.includes("pax")) {
    partes.push(`${sujeto} lleva ${pax(paxVivo)} (${paxCot === 1 ? "cotizado 1" : `cotizados ${paxCot}`})`);
  }
  if (motivos.includes("pernocta")) {
    const s2 = partes.length > 0 ? "y" : t;
    partes.push(
      bool(viva?.requiere_pernocta)
        ? `${s2} ahora pernocta (no se cotizó pernocta)`
        : `${s2} ya no pernocta (se cotizó con pernocta)`,
    );
  }
  return partes.join(" ");
}

/**
 * En qué difiere hoy la OPERACIÓN de lo que se cotizó, por `orden` de tramo.
 *
 * Devuelve `[]` cuando no hay snapshot (todavía no hay nada pactado que
 * respetar) y cuando `itinerario_operativo === true` (ahí las escalas del
 * vuelo son OTRA ruta a propósito, no una divergencia).
 */
export function divergenciasDeOperacion(q: QuoteTramos): Divergencia[] {
  if (bool(q.itinerario_operativo)) return [];
  const { tramos, fuente } = tramosCotizadosDeCotizacion(q);
  if (fuente !== "snapshot_escalas" && fuente !== "snapshot_tramos") return [];

  const vivas = escalasComerciales(q);
  // Sin NINGUNA escala comercial viva no se puede afirmar nada: puede ser un
  // payload que no trae `escalas` (lista, API previo) y no «el piloto borró
  // el itinerario». Antes de inventar N avisos «ya no existe», callar — un
  // aviso falso enseña al operador a ignorar los verdaderos.
  if (vivas.length === 0) return [];
  const porOrden = new Map<number, EscalaViva>();
  for (const e of vivas) {
    const o = Math.trunc(num(e.orden));
    if (!porOrden.has(o)) porOrden.set(o, e);
  }
  const tuas = cobraTuas(q.calculo_snapshot);
  const out: Divergencia[] = [];
  const cotizados = new Set<number>();

  tramos.forEach((t, i) => {
    const orden = t.orden ?? i + 1;
    cotizados.add(orden);
    const viva = porOrden.get(orden) ?? null;
    const agrega = (motivos: MotivoDivergencia[], mueveDinero: boolean) =>
      out.push({
        orden,
        motivos,
        mueveDinero,
        texto: fraseDivergencia(orden, motivos, t.escala, viva),
      });
    if (!viva) {
      agrega(["faltante"], true);
      return;
    }
    if (txt(viva.cancelada_at)) {
      agrega(["cancelado"], true);
      return;
    }
    const motivos: MotivoDivergencia[] = [];
    if (!mismaRuta(t.escala, viva)) motivos.push("ruta");
    if (bool(t.escala.es_ferry) !== bool(viva.es_ferry)) motivos.push("ferry");
    if (paxDeTramo(t.escala) !== paxDeTramo(viva)) motivos.push("pax");
    if (bool(t.escala.requiere_pernocta) !== bool(viva.requiere_pernocta)) {
      motivos.push("pernocta");
    }
    if (motivos.length === 0) return;
    // Solo el pax puede ser inerte: sin TUAS que cobrar no mueve el total
    // (aunque sí cambia lo que dice el itinerario impreso).
    const soloPax = motivos.length === 1 && motivos[0] === "pax";
    agrega(motivos, soloPax ? tuas : true);
  });

  for (const e of vivas) {
    const orden = Math.trunc(num(e.orden));
    if (cotizados.has(orden) || txt(e.cancelada_at)) continue;
    out.push({
      orden,
      motivos: ["nuevo"],
      mueveDinero: true,
      texto: fraseDivergencia(orden, ["nuevo"], null, e),
    });
  }

  return out.sort((a, b) => a.orden - b.orden);
}

/**
 * El aviso ÁMBAR completo, en una sola frase: qué cambió en la operación y la
 * promesa de que la cotización no se movió sola.
 */
export function textoDivergencia(ds: ReadonlyArray<Divergencia>): string {
  if (ds.length === 0) return "";
  const cuerpo = ds.map((d) => d.texto).join("; ");
  return `La operación cambió: ${cuerpo}. La cotización conserva lo pactado.`;
}

/** Chip corto de la barra del total (el detalle va en el aviso ámbar). */
export function chipDivergencia(ds: ReadonlyArray<Divergencia>): string | null {
  if (ds.length === 0) return null;
  const tramos = new Set(ds.map((d) => d.orden)).size;
  return tramos === 1
    ? "La operación cambió (1 tramo)"
    : `La operación cambió (${tramos} tramos)`;
}
