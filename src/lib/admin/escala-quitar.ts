/**
 * QUITAR UNA ESCALA INTERMEDIA QUE NO SE HIZO (2-nov-2026, API 0.0.114,
 * invariante 113 del API). Caso real #496 (Pablo, 29-oct-2026): la ruta
 * era CUN→HOL→TQO→CUN pero el avión fue directo a Tulum sin bajar en Holbox;
 * el vuelo quedó COMPLETADO con una escala que nunca ocurrió y ni «Cancelar
 * tramo» (sí voló) ni «Eliminar tramo» (tiene tacómetro) servían.
 *
 * El panel decide solo si OFRECE la acción y con qué aviso; la regla vive
 * en el API (`escala-quitada.util#porQueNoSeQuitaEscala`, que vuelve a
 * validar): el tramo A y el tramo ACTIVO siguiente B (que sale de donde
 * llega A) se fusionan en UN tramo A.origen → B.destino que conserva la
 * salida de A y toma la llegada de B; la llegada de A se descarta y queda en
 * la bitácora; el fusionado queda en amarillo para confirmar el tacómetro.
 * PURO (prueba `__tests__/escala-quitar.test.ts`).
 */
import type { FlightEscala } from "@/types/flights";
import { fmtDateTime } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";

export interface ContextoQuitarEscala {
  /** Avión del vuelo: un tramo sin avión propio lo hereda. */
  vueloAeronaveId?: string | null;
  estado?: string | null;
  esExterno?: boolean;
}

/**
 * `ok` = se ofrece con el tramo B que se fusiona; `porQue: string` = se
 * muestra DESHABILITADA con ese motivo; `porQue: null` = no se ofrece
 * (tramo cancelado, último tramo, vuelo cancelado o externo).
 */
export type EscalaQuitable =
  | { ok: true; b: FlightEscala }
  | { ok: false; porQue: string | null };

/** El tramo ACTIVO (no cancelado) que sigue a `a` por `orden`, o null. */
export function tramoSiguienteActivo(
  escalas: FlightEscala[],
  a: FlightEscala,
): FlightEscala | null {
  let mejor: FlightEscala | null = null;
  for (const e of escalas) {
    if (e.id === a.id || e.cancelada_at || e.orden <= a.orden) continue;
    if (!mejor || e.orden < mejor.orden) mejor = e;
  }
  return mejor;
}

/** ¿Se puede quitar la escala en `a.destino_iata`? (espejo de la regla del API). */
export function escalaQuitable(
  escalas: FlightEscala[],
  a: FlightEscala,
  ctx: ContextoQuitarEscala = {},
): EscalaQuitable {
  if (a.cancelada_at || ctx.esExterno || ctx.estado === "CANCELADO") {
    return { ok: false, porQue: null };
  }
  const b = tramoSiguienteActivo(escalas, a);
  // Último tramo: no hay escala siguiente; el destino se corrige con «Editar tramo».
  if (!b) return { ok: false, porQue: null };
  if (a.destino_iata !== b.origen_iata) {
    return {
      ok: false,
      porQue: `El tramo siguiente sale de ${b.origen_iata}, no de ${a.destino_iata}: la ruta no es continua. Corrige con «Editar tramo».`,
    };
  }
  if (a.solo_operativa || b.solo_operativa) {
    return {
      ok: false,
      porQue:
        "Un tramo operativo (ferry o parada técnica) no se fusiona: si no voló, cancélalo; si cambió su ruta, edítalo.",
    };
  }
  const avionA = a.aeronave_id ?? ctx.vueloAeronaveId ?? null;
  const avionB = b.aeronave_id ?? ctx.vueloAeronaveId ?? null;
  if (avionA !== avionB) {
    return {
      ok: false,
      porQue: "Los dos tramos van en aviones distintos: no se pueden fusionar en uno.",
    };
  }
  return { ok: true, b };
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** «29 oct 2026, 13:02 · taco 1,680.6» (lo que haya; «sin lectura» si nada). */
export function lecturaTramo(
  hora: string | null | undefined,
  taco: string | number | null | undefined,
): string {
  const partes: string[] = [];
  if (hora) partes.push(fmtDateTime(hora));
  const t = num(taco);
  if (t != null) partes.push(`taco ${fmtDecimal(t, 1)}`);
  return partes.length ? partes.join(" · ") : "sin lectura";
}

export function tituloQuitarEscala(a: Pick<FlightEscala, "destino_iata">): string {
  return `¿Quitar la escala en ${a.destino_iata}?`;
}

export function etiquetaQuitarEscala(a: Pick<FlightEscala, "destino_iata">): string {
  return `Quitar escala en ${a.destino_iata} (no se aterrizó)`;
}

/** La salida de A no cabe bajo la llegada de B (CHECK del API): se retirará. */
export function salidaSeRetira(a: FlightEscala, b: FlightEscala): boolean {
  const s = num(a.taco_salida);
  const l = num(b.taco_llegada);
  return s != null && l != null && l <= s;
}

/** Párrafos del diálogo de confirmación. */
export function textoQuitarEscala(a: FlightEscala, b: FlightEscala): string[] {
  const p: string[] = [
    `Los tramos ${a.origen_iata} → ${a.destino_iata} y ${b.origen_iata} → ${b.destino_iata} quedan como UN solo tramo ${a.origen_iata} → ${b.destino_iata}.`,
    `Se conserva la salida de ${a.origen_iata} (${lecturaTramo(a.hora_salida, a.taco_salida)}) y se toma la llegada a ${b.destino_iata} del tramo ${b.origen_iata} → ${b.destino_iata} (${lecturaTramo(b.hora_llegada, b.taco_llegada)}).`,
  ];
  if (a.hora_llegada || num(a.taco_llegada) != null || a.foto_taco_llegada_url) {
    p.push(
      `La llegada a ${a.destino_iata} que se capturó (${lecturaTramo(a.hora_llegada, a.taco_llegada)}${a.foto_taco_llegada_url ? ", con foto" : ""}) se descarta y queda escrita en la bitácora del tramo.`,
    );
  }
  if (salidaSeRetira(a, b)) {
    p.push(
      `La salida ${fmtDecimal(num(a.taco_salida), 1)} no cabe bajo la llegada ${fmtDecimal(num(b.taco_llegada), 1)}: se retirará y quedará por confirmar en oficina.`,
    );
  }
  p.push(
    "El tramo fusionado queda en amarillo para confirmar el tacómetro en oficina. El vuelo no cambia de estado y la cotización no cambia (su pantalla mostrará que la operación difiere).",
  );
  return p;
}

/** Toast tras quitar la escala (con el aviso del API, si lo hay). */
export function textoEscalaQuitada(res: {
  origen_iata: string;
  destino_iata: string;
  fusion?: { escala_iata?: string | null; aviso?: string | null } | null;
}): string {
  const escala = res.fusion?.escala_iata ? ` en ${res.fusion.escala_iata}` : "";
  const base = `Escala${escala} quitada: el tramo ahora es ${res.origen_iata} → ${res.destino_iata}. Confirma el tacómetro en «Tacómetros por tramo».`;
  return res.fusion?.aviso ? `${base} ${res.fusion.aviso}` : base;
}
