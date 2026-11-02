/**
 * QUITAR UNA ESCALA INTERMEDIA QUE NO SE HIZO (2-nov-2026, API 0.0.114):
 * cuándo se ofrece la acción, qué dice el diálogo y el cableado de la card.
 * Datos del caso real #496: CUN→HOL→TQO→CUN volado como CUN→TQO→CUN.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlightEscala } from "@/types/flights";
import {
  escalaQuitable,
  etiquetaQuitarEscala,
  lecturaTramo,
  salidaSeRetira,
  textoEscalaQuitada,
  textoQuitarEscala,
  tituloQuitarEscala,
  tramoSiguienteActivo,
} from "../escala-quitar";

function esc(
  p: Partial<FlightEscala> & Pick<FlightEscala, "orden" | "origen_iata" | "destino_iata">,
): FlightEscala {
  return {
    id: `e${p.orden}`,
    vuelo_id: "v",
    aeronave_id: null,
    piloto_id: null,
    estado_permiso: "no_aplica",
    fecha_salida_plan: null,
    foto_plan_vuelo_url: null,
    google_calendar_id: null,
    pasajeros: 4,
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    solo_operativa: false,
    taco_salida: null,
    taco_llegada: null,
    foto_taco_salida_url: null,
    foto_taco_llegada_url: null,
    valor_ia_propuesto: null,
    revision_requerida: false,
    revision_motivo: null,
    hora_salida: null,
    hora_llegada: null,
    capturado_offline: false,
    ...p,
  } as FlightEscala;
}

const A = esc({
  orden: 1,
  origen_iata: "CUN",
  destino_iata: "HOL",
  taco_salida: "1680.6",
  taco_llegada: "1682.3",
  taco_llegada_origen: "PILOTO",
  hora_salida: "2026-10-29T18:02:38.789+00:00",
  hora_llegada: "2026-10-29T18:28:00.687+00:00",
});
const B = esc({
  orden: 2,
  origen_iata: "HOL",
  destino_iata: "TQO",
  taco_llegada: "1682.3",
  taco_llegada_origen: "PILOTO",
  hora_llegada: "2026-10-30T00:49:50.143+00:00",
});
const C = esc({
  orden: 3,
  origen_iata: "TQO",
  destino_iata: "CUN",
  taco_salida: "1682.3",
  taco_llegada: "1682.8",
});
const RUTA = [C, A, B]; // desordenados a propósito

describe("tramoSiguienteActivo", () => {
  it("el siguiente por orden, saltando cancelados; null para el último", () => {
    expect(tramoSiguienteActivo(RUTA, A)?.id).toBe("e2");
    expect(tramoSiguienteActivo(RUTA, B)?.id).toBe("e3");
    expect(tramoSiguienteActivo(RUTA, C)).toBeNull();
    const bCancelado = { ...B, cancelada_at: "2026-10-30T00:00:00Z" };
    expect(tramoSiguienteActivo([A, bCancelado, C], A)?.id).toBe("e3");
  });
});

describe("escalaQuitable · cuándo se ofrece", () => {
  it("A activo con B continuo, comerciales y mismo avión ⇒ ok con B", () => {
    const r = escalaQuitable(RUTA, A, { estado: "COMPLETADO" });
    expect(r).toEqual({ ok: true, b: B });
    // Avión heredado del vuelo en los dos / uno propio igual al del vuelo.
    expect(escalaQuitable(RUTA, A, { vueloAeronaveId: "av" }).ok).toBe(true);
    expect(
      escalaQuitable([{ ...A, aeronave_id: "av" }, B, C], { ...A, aeronave_id: "av" }, {
        vueloAeronaveId: "av",
      }).ok,
    ).toBe(true);
  });

  it("no se ofrece (porQue null): tramo cancelado, último tramo, vuelo CANCELADO, vuelo externo", () => {
    expect(escalaQuitable(RUTA, { ...A, cancelada_at: "x" })).toEqual({ ok: false, porQue: null });
    expect(escalaQuitable(RUTA, C)).toEqual({ ok: false, porQue: null });
    expect(escalaQuitable(RUTA, A, { estado: "CANCELADO" })).toEqual({ ok: false, porQue: null });
    expect(escalaQuitable(RUTA, A, { esExterno: true })).toEqual({ ok: false, porQue: null });
  });

  it("se ofrece DESHABILITADA con motivo: ruta no continua, tramo operativo, aviones distintos", () => {
    const noEnlaza = escalaQuitable([A, { ...B, origen_iata: "MID" }, C], A);
    expect(noEnlaza.ok).toBe(false);
    expect(!noEnlaza.ok && noEnlaza.porQue).toContain("sale de MID, no de HOL");
    const operativo = escalaQuitable([A, { ...B, solo_operativa: true }, C], A);
    expect(!operativo.ok && operativo.porQue).toContain("operativo");
    const avion = escalaQuitable([A, { ...B, aeronave_id: "otro" }, C], A, {
      vueloAeronaveId: "av",
    });
    expect(!avion.ok && avion.porQue).toContain("aviones distintos");
  });
});

describe("textos del diálogo", () => {
  it("lecturaTramo: hora Cancún y taco a 1 decimal; sin nada ⇒ «sin lectura»", () => {
    // es-MX pinta 12 h («1:02 p.m.»): se comprueba la hora sin el sufijo.
    expect(lecturaTramo(A.hora_salida, A.taco_salida)).toMatch(/1:02/);
    expect(lecturaTramo(A.hora_salida, A.taco_salida)).toContain("taco 1,680.6");
    expect(lecturaTramo(null, "1682.3")).toBe("taco 1,682.3");
    expect(lecturaTramo(null, null)).toBe("sin lectura");
  });

  it("textoQuitarEscala: fusión, salida conservada, llegada tomada, llegada descartada y el amarillo", () => {
    const p = textoQuitarEscala(A, B);
    expect(p[0]).toBe(
      "Los tramos CUN → HOL y HOL → TQO quedan como UN solo tramo CUN → TQO.",
    );
    expect(p[1]).toContain("Se conserva la salida de CUN (");
    expect(p[1]).toContain("taco 1,680.6");
    expect(p[1]).toContain("se toma la llegada a TQO del tramo HOL → TQO (");
    expect(p[1]).toMatch(/7:49/);
    expect(p[2]).toContain("La llegada a HOL que se capturó (");
    expect(p[2]).toMatch(/1:28/);
    expect(p[2]).toContain("se descarta y queda escrita en la bitácora");
    expect(p[3]).toContain("queda en amarillo");
    expect(p[3]).toContain("la cotización no cambia");
    expect(p).toHaveLength(4);
    // Sin llegada capturada en A: no hay párrafo de descarte.
    const sin = textoQuitarEscala(
      { ...A, taco_llegada: null, hora_llegada: null, taco_llegada_origen: null },
      B,
    );
    expect(sin).toHaveLength(3);
    expect(sin.join(" ")).not.toContain("se descarta");
  });

  it("salida que no cabe bajo la llegada de B: párrafo propio", () => {
    const a = { ...A, taco_salida: "1682.5" };
    expect(salidaSeRetira(a, B)).toBe(true);
    expect(salidaSeRetira(A, B)).toBe(false);
    const p = textoQuitarEscala(a, B);
    expect(p.some((x) => x.includes("La salida 1,682.5 no cabe bajo la llegada 1,682.3"))).toBe(true);
  });

  it("título, etiqueta y toast", () => {
    expect(tituloQuitarEscala(A)).toBe("¿Quitar la escala en HOL?");
    expect(etiquetaQuitarEscala(A)).toBe("Quitar escala en HOL (no se aterrizó)");
    expect(
      textoEscalaQuitada({
        origen_iata: "CUN",
        destino_iata: "TQO",
        fusion: { escala_iata: "HOL", aviso: "La llegada a HOL capturada se descartó." },
      }),
    ).toBe(
      "Escala en HOL quitada: el tramo ahora es CUN → TQO. Confirma el tacómetro en «Tacómetros por tramo». La llegada a HOL capturada se descartó.",
    );
    expect(textoEscalaQuitada({ origen_iata: "CUN", destino_iata: "TQO" })).toBe(
      "Escala quitada: el tramo ahora es CUN → TQO. Confirma el tacómetro en «Tacómetros por tramo».",
    );
  });
});

describe("cableado en el código", () => {
  const CARD = readFileSync(
    path.resolve(__dirname, "../../../components/admin/flights/flight-tramos-card.tsx"),
    "utf8",
  );
  const ACTIONS = readFileSync(
    path.resolve(__dirname, "../../../app/admin/flights/actions.ts"),
    "utf8",
  );

  it("la card ofrece «Quitar escala» con la regla pura y confirma con motivo antes de llamar al API", () => {
    expect(CARD).toContain("escalaQuitable(ordered, escala, {");
    expect(CARD).toContain("{etiquetaQuitarEscala(escala)}");
    expect(CARD).toContain("disabled={!quitable.ok}");
    expect(CARD).toContain("tituloQuitarEscala(toQuitar.a)");
    expect(CARD).toContain("textoQuitarEscala(toQuitar.a, toQuitar.b)");
    expect(CARD).toContain("quitarEscalaAction(flightId, toQuitar.a.id, quitarMotivo.trim())");
    expect(CARD).toContain('quitarMotivo.trim().length < 3');
  });

  it("la action pega al endpoint nuevo con el motivo", () => {
    expect(ACTIONS).toContain("`/v1/flights/legs/${escalaId}/quitar-escala`");
    expect(ACTIONS).toContain("export async function quitarEscalaAction(");
  });
});
