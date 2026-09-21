import { describe, expect, it } from "vitest";

import {
  chipDivergencia,
  divergenciasDeOperacion,
  ETIQUETA_ACTUALIZAR,
  mismaRuta,
  paxDeTramo,
  textoDivergencia,
  tramosCotizadosDeCotizacion,
  tramosDeCotizacion,
  tramosDeOperacion,
  type EscalaViva,
  type QuoteTramos,
} from "@/lib/admin/tramos-cotizados";
import type { EscalaInput, QuoteBreakdown } from "@/types/quote";

/**
 * LA COTIZACIÓN ES INDEPENDIENTE DE LA OPERACIÓN — TRAMOS (22-sep-2026).
 *
 * Caso guía: la cotización **#326** del cliente (N621TX, CUN–PTU–CUN). Se
 * cotizó `T1 CUN→PTU FERRY` + `T2 PTU→CUN 2 pax` ⇒ TUAS $0 ⇒ $3,596.00; al
 * día siguiente el PILOTO puso 4 pax sin ferry en los dos tramos desde la
 * app. El cotizador tiene que seguir arrancando con lo COTIZADO (si no, al
 * teclear el T.C. el total saltaba solo a $3,712.00) y AVISAR de la
 * diferencia con palabras que entienda un operador.
 */

// ---------- Constructores mínimos ----------

function escalaSnapshot(p: Partial<EscalaInput> & Pick<EscalaInput, "origen_iata" | "destino_iata">): EscalaInput {
  return {
    millas_nauticas: 125,
    pasajeros: null,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    notas: null,
    fecha_salida_plan: null,
    ...p,
  };
}

function viva(p: Partial<EscalaViva> & Pick<EscalaViva, "orden" | "origen_iata" | "destino_iata">): EscalaViva {
  return {
    id: `esc-${p.orden}`,
    millas_nauticas: "125",
    pasajeros: null,
    pasajeros_nombres: [],
    es_ferry: false,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    notas: null,
    fecha_salida_plan: null,
    solo_operativa: false,
    cancelada_at: null,
    ...p,
  };
}

/** Snapshot mínimo: solo lo que leen estos helpers (el resto no se toca). */
function snapshot(p: {
  escalas?: EscalaInput[] | null;
  tramos?: QuoteBreakdown["tramos"];
  tuasUsdPaxDefault?: number | undefined;
}): QuoteBreakdown {
  return {
    ruta: { escalas: p.escalas ?? null },
    tramos: p.tramos ?? null,
    tuas: { usd_pax_default: p.tuasUsdPaxDefault },
  } as unknown as QuoteBreakdown;
}

/** #326: cotizado T1 ferry + T2 2 pax; la operación lleva 4 y 4 sin ferry. */
const COTIZADO_326: EscalaInput[] = [
  escalaSnapshot({ origen_iata: "CUN", destino_iata: "PTU", es_ferry: true, pasajeros: 0 }),
  escalaSnapshot({ origen_iata: "PTU", destino_iata: "CUN", pasajeros: 2 }),
];
const OPERACION_326: EscalaViva[] = [
  viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", pasajeros: 4, es_ferry: false }),
  viva({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 4, es_ferry: false }),
];
const QUOTE_326: QuoteTramos = {
  itinerario_operativo: false,
  calculo_snapshot: snapshot({ escalas: COTIZADO_326, tuasUsdPaxDefault: 25 }),
  escalas: OPERACION_326,
};

// ---------- Cascada de hidratación ----------

describe("tramosCotizadosDeCotizacion — de dónde salen los tramos del formulario", () => {
  it("#326: el formulario arranca con lo COTIZADO (ferry + 2 pax), no con los 4 pax del piloto", () => {
    const { tramos, fuente } = tramosCotizadosDeCotizacion(QUOTE_326);
    expect(fuente).toBe("snapshot_escalas");
    expect(tramos.map((t) => [t.escala.origen_iata, t.escala.destino_iata])).toEqual([
      ["CUN", "PTU"],
      ["PTU", "CUN"],
    ]);
    expect(tramos[0].escala.es_ferry).toBe(true);
    expect(paxDeTramo(tramos[0].escala)).toBe(0);
    expect(tramos[1].escala.pasajeros).toBe(2);
    // El `orden` es el puente con la escala viva (toggles del PDF, fechas).
    expect(tramos.map((t) => t.orden)).toEqual([1, 2]);
  });

  it("hereda de la escala VIVA lo que no precia (fecha, nota, nombres) cuando la ruta coincide", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        viva({
          orden: 1,
          origen_iata: "CUN",
          destino_iata: "PTU",
          es_ferry: true,
          notas: "cargar combustible",
          fecha_salida_plan: "2026-09-20T15:00:00.000Z",
          pasajeros_nombres: ["Ana", "Luis"],
        }),
        viva({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 4 }),
      ],
    };
    const t1 = tramosCotizadosDeCotizacion(q).tramos[0].escala;
    expect(t1.notas).toBe("cargar combustible");
    // 15:00 UTC = 10:00 en Cancún (UTC−5), como `datetime-local`.
    expect(t1.fecha_salida_plan).toBe("2026-09-20T10:00");
    expect(t1.pasajeros_nombres).toEqual(["Ana", "Luis"]);
    // …pero lo que PRECIA sigue siendo lo cotizado.
    expect(t1.es_ferry).toBe(true);
  });

  it("NO hereda nada de la operación cuando la ruta del tramo ya no coincide", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [escalaSnapshot({ origen_iata: "CUN", destino_iata: "CZM", pasajeros: 2, notas: "nota cotizada" })],
      }),
      escalas: [viva({ orden: 1, origen_iata: "CZM", destino_iata: "CET", notas: "nota del piloto" })],
    };
    const t1 = tramosCotizadosDeCotizacion(q).tramos[0].escala;
    expect(t1.origen_iata).toBe("CUN");
    expect(t1.destino_iata).toBe("CZM");
    expect(t1.notas).toBe("nota cotizada");
  });

  it("snapshot LEGADO sin `ruta.escalas`: cae a `calculo_snapshot.tramos` y respeta su `orden`", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: null,
        tramos: [
          {
            orden: 1,
            origen: "CUN",
            destino: "PTU",
            millas: 125,
            pasajeros: 0,
            es_ferry: true,
            tiempo_hr: 1,
            tuas_usd: 0,
            requiere_pernocta: false,
            pernocta_usd: 0,
            tipo_parada: "NORMAL",
            servicio_notas: null,
          },
          {
            orden: 2,
            origen: "PTU",
            destino: "CUN",
            millas: 125,
            pasajeros: 2,
            es_ferry: false,
            tiempo_hr: 1,
            tuas_usd: 0,
            requiere_pernocta: false,
            pernocta_usd: 0,
            tipo_parada: "NORMAL",
            servicio_notas: null,
          },
        ],
      }),
      escalas: OPERACION_326,
    };
    const { tramos, fuente } = tramosCotizadosDeCotizacion(q);
    expect(fuente).toBe("snapshot_tramos");
    expect(tramos[0].escala.es_ferry).toBe(true);
    expect(tramos[1].escala.pasajeros).toBe(2);
    expect(tramos.map((t) => t.orden)).toEqual([1, 2]);
  });

  it("SIN snapshot (reserva que se cotiza por primera vez): los tramos VIVOS, sin los cancelados", () => {
    const q: QuoteTramos = {
      calculo_snapshot: null,
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "HOL", pasajeros: 3 }),
        viva({ orden: 2, origen_iata: "HOL", destino_iata: "CUN", cancelada_at: "2026-09-19T12:00:00.000Z" }),
      ],
    };
    const { tramos, fuente } = tramosCotizadosDeCotizacion(q);
    expect(fuente).toBe("operacion");
    expect(tramos).toHaveLength(1);
    expect(tramos[0].escala.pasajeros).toBe(3);
    expect(tramos[0].orden).toBe(1);
  });

  it("las escalas `solo_operativa` NUNCA entran al formulario", () => {
    const q: QuoteTramos = {
      calculo_snapshot: null,
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "HOL", pasajeros: 3 }),
        viva({ orden: 2, origen_iata: "HOL", destino_iata: "MID", solo_operativa: true }),
      ],
    };
    expect(tramosDeCotizacion(q)).toHaveLength(1);
  });

  it("itinerario OPERATIVO con snapshot: manda el snapshot y no se hereda nada de los tramos del piloto", () => {
    const q: QuoteTramos = {
      itinerario_operativo: true,
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", notas: "operativa" })],
    };
    const t1 = tramosCotizadosDeCotizacion(q).tramos[0].escala;
    expect(t1.es_ferry).toBe(true);
    expect(t1.notas).toBeNull();
  });

  it("itinerario OPERATIVO SIN cotizar: sugerencia CUN→destino→CUN, sin `orden` que patchear", () => {
    const q: QuoteTramos = {
      itinerario_operativo: true,
      calculo_snapshot: null,
      pasajeros: 4,
      escalas: [
        viva({ orden: 1, origen_iata: "CZM", destino_iata: "MID", pasajeros: 4 }),
        viva({ orden: 2, origen_iata: "MID", destino_iata: "CZM", es_ferry: true }),
      ],
    };
    const { tramos, fuente } = tramosCotizadosDeCotizacion(q);
    expect(fuente).toBe("sugerida");
    expect(tramos.map((t) => `${t.escala.origen_iata}→${t.escala.destino_iata}`)).toEqual([
      "CUN→MID",
      "MID→CUN",
    ]);
    expect(tramos.every((t) => t.orden === null)).toBe(true);
  });

  it("REDONDO legado (sin escalas ni snapshot): sus dos tramos equivalentes", () => {
    const q: QuoteTramos = {
      calculo_snapshot: null,
      escalas: [],
      origen_iata: "CUN",
      destino_iata: "MID",
      millas_nauticas_one_way: "150",
      es_redondo_auto: true,
      pasajeros: 2,
    };
    const { tramos, fuente } = tramosCotizadosDeCotizacion(q);
    expect(fuente).toBe("legado");
    expect(tramos.map((t) => `${t.escala.origen_iata}→${t.escala.destino_iata}`)).toEqual([
      "CUN→MID",
      "MID→CUN",
    ]);
    expect(tramos[0].escala.millas_nauticas).toBe(150);
  });
});

// ---------- Los tramos VIVOS (botón «Actualizar…») ----------

describe("tramosDeOperacion — lo que carga el botón del aviso", () => {
  it("trae los tramos vivos comerciales tal cual (los cancelados y los operativos, no)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        ...OPERACION_326,
        viva({ orden: 3, origen_iata: "CUN", destino_iata: "MID", cancelada_at: "2026-09-20T00:00:00.000Z" }),
        viva({ orden: 4, origen_iata: "MID", destino_iata: "CUN", solo_operativa: true }),
      ],
    };
    const ops = tramosDeOperacion(q);
    expect(ops).toHaveLength(2);
    expect(ops[0].pasajeros).toBe(4);
    expect(ops[0].es_ferry).toBe(false);
    expect(ops[1].pasajeros).toBe(4);
  });
});

// ---------- Divergencias ----------

describe("divergenciasDeOperacion — qué cambió en el vuelo respecto de lo pactado", () => {
  it("#326: ferry + pax en el T1 y pax en el T2, con el texto que leerá la oficina", () => {
    const ds = divergenciasDeOperacion(QUOTE_326);
    expect(ds.map((d) => d.orden)).toEqual([1, 2]);
    expect(ds[0].motivos).toEqual(["ferry", "pax"]);
    expect(ds[0].texto).toBe(
      "el tramo 1 ya no es ferry y lleva 4 pasajeros (cotizado: ferry, sin pasajeros)",
    );
    expect(ds[1].texto).toBe("el tramo 2 lleva 4 pasajeros (cotizados 2)");
    expect(textoDivergencia(ds)).toBe(
      "La operación cambió: el tramo 1 ya no es ferry y lleva 4 pasajeros " +
        "(cotizado: ferry, sin pasajeros); el tramo 2 lleva 4 pasajeros (cotizados 2). " +
        "La cotización conserva lo pactado.",
    );
    expect(chipDivergencia(ds)).toBe("La operación cambió (2 tramos)");
    expect(ETIQUETA_ACTUALIZAR).toBe("Actualizar la cotización con la operación");
  });

  it("#320: la operación cambió la ruta del T2 y le agregó pernocta", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [
          escalaSnapshot({ origen_iata: "CUN", destino_iata: "CZM", pasajeros: 2 }),
          escalaSnapshot({ origen_iata: "CZM", destino_iata: "CUN", es_ferry: true, pasajeros: 0 }),
        ],
      }),
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "CZM", pasajeros: 1 }),
        viva({ orden: 2, origen_iata: "CZM", destino_iata: "CET", es_ferry: true, requiere_pernocta: true }),
      ],
    };
    const ds = divergenciasDeOperacion(q);
    expect(ds[0].texto).toBe("el tramo 1 lleva 1 pasajero (cotizados 2)");
    expect(ds[1].motivos).toEqual(["ruta", "pernocta"]);
    expect(ds[1].texto).toBe(
      "el tramo 2 ahora va CZM → CET (cotizado CZM → CUN) y ahora pernocta (no se cotizó pernocta)",
    );
    expect(ds[1].mueveDinero).toBe(true);
  });

  it("tramo AGREGADO en la operación (el piloto añadió un T3)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", es_ferry: true }),
        viva({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 2 }),
        viva({ orden: 3, origen_iata: "CUN", destino_iata: "MID", pasajeros: 2, millas_nauticas: null }),
      ],
    };
    const ds = divergenciasDeOperacion(q);
    expect(ds).toHaveLength(1);
    expect(ds[0].motivos).toEqual(["nuevo"]);
    expect(ds[0].texto).toBe("hay un tramo 3 CUN → MID que no se cotizó");
    // El tramo nuevo NO entra al formulario: no se cotizó.
    expect(tramosDeCotizacion(q)).toHaveLength(2);
  });

  it("tramo ELIMINADO de la operación (se cotizaron 3 y vive 1)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [
          escalaSnapshot({ origen_iata: "CUN", destino_iata: "PTU", pasajeros: 2 }),
          escalaSnapshot({ origen_iata: "PTU", destino_iata: "CUN", pasajeros: 2 }),
        ],
      }),
      escalas: [viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", pasajeros: 2 })],
    };
    const ds = divergenciasDeOperacion(q);
    expect(ds).toHaveLength(1);
    expect(ds[0].motivos).toEqual(["faltante"]);
    expect(ds[0].texto).toBe("el tramo 2 cotizado (PTU → CUN) ya no existe en la operación");
    // …pero el tramo cotizado SIGUE en el formulario: es lo que se cobra.
    expect(tramosDeCotizacion(q)).toHaveLength(2);
  });

  it("tramo CANCELADO en la operación: se avisa, no se revive y no entra por la puerta de atrás", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", es_ferry: true }),
        viva({
          orden: 2,
          origen_iata: "PTU",
          destino_iata: "CUN",
          pasajeros: 2,
          cancelada_at: "2026-09-20T18:00:00.000Z",
        }),
      ],
    };
    const ds = divergenciasDeOperacion(q);
    expect(ds).toHaveLength(1);
    expect(ds[0].motivos).toEqual(["cancelado"]);
    expect(ds[0].texto).toBe("el tramo 2 se canceló en la operación");
    expect(tramosDeOperacion(q)).toHaveLength(1);
  });

  it("sin diferencias no hay aviso (y el chip es null)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        viva({ orden: 1, origen_iata: "CUN", destino_iata: "PTU", es_ferry: true, pasajeros: 0 }),
        viva({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 2 }),
      ],
    };
    expect(divergenciasDeOperacion(q)).toEqual([]);
    expect(textoDivergencia([])).toBe("");
    expect(chipDivergencia([])).toBeNull();
  });

  it("una fecha, una nota o un nombre distintos NO son divergencia (no precian)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({ escalas: COTIZADO_326 }),
      escalas: [
        viva({
          orden: 1,
          origen_iata: "CUN",
          destino_iata: "PTU",
          es_ferry: true,
          notas: "salir temprano",
          fecha_salida_plan: "2026-09-21T14:00:00.000Z",
        }),
        viva({ orden: 2, origen_iata: "PTU", destino_iata: "CUN", pasajeros: 2, pasajeros_nombres: ["Ana"] }),
      ],
    };
    expect(divergenciasDeOperacion(q)).toEqual([]);
  });

  it("sin escalas vivas (payload sin `escalas`) NO se inventan avisos «ya no existe»", () => {
    const soloSnapshot: QuoteTramos = { calculo_snapshot: snapshot({ escalas: COTIZADO_326 }) };
    expect(divergenciasDeOperacion(soloSnapshot)).toEqual([]);
    expect(divergenciasDeOperacion({ ...soloSnapshot, escalas: [] })).toEqual([]);
    // …pero el formulario sigue arrancando con lo cotizado.
    expect(tramosDeCotizacion(soloSnapshot)).toHaveLength(2);
  });

  it("sin snapshot no hay nada pactado que defender: sin aviso", () => {
    expect(
      divergenciasDeOperacion({ calculo_snapshot: null, escalas: OPERACION_326 }),
    ).toEqual([]);
  });

  it("con itinerario OPERATIVO la otra ruta es a propósito: sin aviso", () => {
    expect(divergenciasDeOperacion({ ...QUOTE_326, itinerario_operativo: true })).toEqual([]);
  });

  it("#319: con las TUAS apagadas un cambio de pax NO mueve dinero (pero sí se avisa)", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [escalaSnapshot({ origen_iata: "CUN", destino_iata: "PPS", pasajeros: 2 })],
        tuasUsdPaxDefault: 0,
      }),
      escalas: [viva({ orden: 1, origen_iata: "CUN", destino_iata: "PPS", pasajeros: 6 })],
    };
    const ds = divergenciasDeOperacion(q);
    expect(ds[0].motivos).toEqual(["pax"]);
    expect(ds[0].mueveDinero).toBe(false);
    expect(ds[0].texto).toBe("el tramo 1 lleva 6 pasajeros (cotizados 2)");
    expect(chipDivergencia(ds)).toBe("La operación cambió (1 tramo)");
  });

  it("con las TUAS cobrándose, el mismo cambio de pax SÍ mueve dinero", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [escalaSnapshot({ origen_iata: "CUN", destino_iata: "PPS", pasajeros: 2 })],
        tuasUsdPaxDefault: 25,
      }),
      escalas: [viva({ orden: 1, origen_iata: "CUN", destino_iata: "PPS", pasajeros: 6 })],
    };
    expect(divergenciasDeOperacion(q)[0].mueveDinero).toBe(true);
  });

  it("la operación puso ferry donde se cotizaron pasajeros", () => {
    const q: QuoteTramos = {
      calculo_snapshot: snapshot({
        escalas: [escalaSnapshot({ origen_iata: "CUN", destino_iata: "MID", pasajeros: 2 })],
      }),
      escalas: [viva({ orden: 1, origen_iata: "CUN", destino_iata: "MID", es_ferry: true, pasajeros: 0 })],
    };
    expect(divergenciasDeOperacion(q)[0].texto).toBe(
      "el tramo 1 ahora es ferry, sin pasajeros (se cotizó con 2 pasajeros)",
    );
  });
});

describe("mismaRuta / paxDeTramo", () => {
  it("compara los códigos sin importar mayúsculas ni espacios", () => {
    expect(mismaRuta({ origen_iata: " cun ", destino_iata: "ptu" }, { origen_iata: "CUN", destino_iata: "PTU" })).toBe(
      true,
    );
    expect(mismaRuta({ origen_iata: "CUN", destino_iata: "PTU" }, { origen_iata: "CUN", destino_iata: "CZM" })).toBe(
      false,
    );
    expect(mismaRuta(null, { origen_iata: "CUN", destino_iata: "PTU" })).toBe(false);
  });

  it("un ferry vale 0 pasajeros aunque traiga un número guardado", () => {
    expect(paxDeTramo({ pasajeros: 4, es_ferry: true })).toBe(0);
    expect(paxDeTramo({ pasajeros: null, es_ferry: false })).toBe(0);
    expect(paxDeTramo({ pasajeros: 4, es_ferry: false })).toBe(4);
  });
});
