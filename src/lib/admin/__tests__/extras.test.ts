import { describe, expect, it } from "vitest";
import {
  TEXTO_EXTRA_FUERA,
  ariaLabelCampoExtra,
  bloqueoGuardadoExtras,
  estadoExtra,
  extrasAPayload,
  extrasFueraDelTotal,
} from "@/lib/admin/extras";
import type { ExtraConcepto } from "@/types/quote";

/**
 * CONCEPTOS QUE NO ENTRAN AL TOTAL (21-sep-2026). Reporte del cliente sobre la
 * hoja de una cotización CUN–CZM–CUN: «Servicio aéreo $650.00 · TUA CZM $50.00
 * · [SIN IVA] Concepto $35.00 · Subtotal $700.00 · Total (USD) $700.00 — ¿por
 * qué no suma el extra de 35 usd en el total?». «Concepto» era el PLACEHOLDER
 * del campo vacío: el renglón pintaba 35.00 en la columna de importes, el
 * motor nunca lo recibía (`extrasAPayload` exige concepto) y al GUARDAR se
 * descartaba en silencio, así que tampoco llegaba al PDF.
 *
 * Aquí se congela la regla ÚNICA (`estadoExtra`) de la que cuelgan el filtro
 * del payload, la leyenda de la hoja y el candado de guardado: si divergieran,
 * volvería el mismo bug.
 */

const extra = (e: Partial<ExtraConcepto>): ExtraConcepto => ({
  concepto: "",
  monto_usd: 0,
  moneda: "USD",
  aplica_iva: true,
  ...e,
});

const USD = { tcCapturado: false };
const CON_TC = { tcCapturado: true };

// ---------------------------------------------------------------------------

describe("estadoExtra", () => {
  const casos: Array<[string, ExtraConcepto, { tcCapturado: boolean }, string]> = [
    ["renglón recién agregado (ni nombre ni monto)", extra({}), USD, "vacio"],
    ["el del reporte: $35 sin nombre", extra({ monto_usd: 35 }), USD, "sin_nombre"],
    ["nombre sin monto", extra({ concepto: "Handler" }), USD, "sin_monto"],
    ["nombre y monto", extra({ concepto: "Handler", monto_usd: 120 }), USD, "ok"],
    ["MXN con monto y sin T.C.", extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" }), USD, "mxn_sin_tc"],
    ["MXN con monto y T.C.", extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" }), CON_TC, "ok"],
    [
      "cantidad × unitario completo",
      extra({ concepto: "Camionetas", cantidad: 2, unitario: 250 }),
      USD,
      "ok",
    ],
    [
      "cantidad × unitario sin precio",
      extra({ concepto: "Camionetas", cantidad: 2, unitario: 0 }),
      USD,
      "sin_monto",
    ],
    [
      "por persona con precio",
      extra({ concepto: "Tour", por_persona: true, unitario: 85 }),
      USD,
      "ok",
    ],
    [
      "por persona sin precio",
      extra({ concepto: "Tour", por_persona: true, unitario: 0 }),
      USD,
      "sin_monto",
    ],
    ["solo espacios en el concepto", extra({ concepto: "   ", monto_usd: 35 }), USD, "sin_nombre"],
    [
      "sin nombre Y en pesos sin T.C.: manda el nombre (es lo primero que falta)",
      extra({ monto_usd: 1500, moneda: "MXN" }),
      USD,
      "sin_nombre",
    ],
    [
      "línea de GRUPO completa (se edita en el grupo, pero cuenta igual)",
      extra({ concepto: "Tour", unitario: 85, por_persona: true, origen: "GRUPO", grupo_extra_id: "g1" }),
      USD,
      "ok",
    ],
  ];

  it.each(casos)("%s ⇒ %s", (_n, e, opts, esperado) => {
    expect(estadoExtra(e, opts)).toBe(esperado);
  });
});

// ---------------------------------------------------------------------------

describe("extrasAPayload = los renglones «ok» (paridad con el comportamiento anterior)", () => {
  /** Filtro EXACTO que tenía `extrasAPayload` antes del 21-sep-2026. */
  const filtroViejo = (e: ExtraConcepto, tcCapturado: boolean) =>
    !!e.concepto.trim() &&
    (e.unitario != null && (e.cantidad != null || e.por_persona === true)
      ? Number(e.unitario) || 0
      : Number(e.monto_usd) || 0) > 0 &&
    (e.moneda !== "MXN" || tcCapturado);

  const lista: ExtraConcepto[] = [
    extra({ concepto: "Handler", monto_usd: 120 }),
    extra({ monto_usd: 35 }), // el del reporte: sin nombre
    extra({ concepto: "Comisariato" }), // sin monto
    extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" }),
    extra({}), // vacío
    extra({ concepto: "Camionetas", cantidad: 2, unitario: 250 }),
    extra({ concepto: "Tour", por_persona: true, unitario: 85 }),
    extra({ concepto: "Guía", cantidad: 1, unitario: 0 }),
    extra({ concepto: "  ", monto_usd: 10 }),
    extra({ concepto: "Pernocta extra", monto_usd: 0.5 }),
    extra({ concepto: "Tour grupo", unitario: 85, por_persona: true, origen: "GRUPO", grupo_extra_id: "g1" }),
    extra({ concepto: "Hielo", monto_usd: 40, aplica_iva: false }),
  ];

  it.each([[false], [true]])("mismos renglones que el filtro viejo (tcCapturado=%s)", (tc) => {
    const esperado = lista.filter((e) => filtroViejo(e, tc)).map((e) => e.concepto.trim());
    expect(extrasAPayload(lista, { tcCapturado: tc }).map((e) => e.concepto)).toEqual(esperado);
    expect(esperado.length).toBeGreaterThan(4);
  });

  it("no toca la forma del payload (monto nativo, moneda, IVA, unitario/cantidad, grupo)", () => {
    expect(extrasAPayload(lista, { tcCapturado: true })).toEqual([
      { concepto: "Handler", monto_usd: 120, moneda: "USD", aplica_iva: true },
      { concepto: "Van", monto_usd: 1500, moneda: "MXN", aplica_iva: true },
      { concepto: "Camionetas", monto_usd: 0, moneda: "USD", aplica_iva: true, unitario: 250, cantidad: 2 },
      { concepto: "Tour", monto_usd: 0, moneda: "USD", aplica_iva: true, unitario: 85, por_persona: true },
      { concepto: "Pernocta extra", monto_usd: 0.5, moneda: "USD", aplica_iva: true },
      {
        concepto: "Tour grupo",
        monto_usd: 0,
        moneda: "USD",
        aplica_iva: true,
        unitario: 85,
        por_persona: true,
        origen: "GRUPO",
        grupo_extra_id: "g1",
      },
      { concepto: "Hielo", monto_usd: 40, moneda: "USD", aplica_iva: false },
    ]);
  });

  it("lista vacía o nula: arreglo vacío", () => {
    expect(extrasAPayload(null, USD)).toEqual([]);
    expect(extrasAPayload(undefined, CON_TC)).toEqual([]);
    expect(extrasAPayload([], USD)).toEqual([]);
  });

  /**
   * Paridad EXHAUSTIVA, no por muestreo: el producto cartesiano de concepto ×
   * monto × moneda × IVA × unitario × cantidad × por_persona × origen (18 000
   * renglones, × 2 valores de T.C.). Verificado además una vez contra el
   * archivo REAL de HEAD (`git show HEAD:src/lib/admin/extras.ts`) con este
   * mismo corpus: 36 000 casos, mismo JSON carácter por carácter.
   */
  it("paridad exhaustiva con el filtro viejo (producto cartesiano)", () => {
    const conceptos = ["", "   ", "Handler", "  Handler  ", "0"];
    const montos = [0, -5, 0.5, 35, 1500];
    const monedas = ["USD", "MXN"] as const;
    const ivas = [true, false, undefined];
    const unitarios = [undefined, 0, -1, 85, 250];
    const cantidades = [undefined, 0, 1, 3];
    const porPersona = [undefined, true, false];
    const origenes = [undefined, "GRUPO"] as const;
    let casos = 0;
    let aceptados = 0;
    for (const concepto of conceptos)
      for (const monto_usd of montos)
        for (const moneda of monedas)
          for (const aplica_iva of ivas)
            for (const unitario of unitarios)
              for (const cantidad of cantidades)
                for (const por_persona of porPersona)
                  for (const origen of origenes) {
                    const e = {
                      concepto,
                      monto_usd,
                      moneda,
                      ...(aplica_iva !== undefined ? { aplica_iva } : {}),
                      ...(unitario !== undefined ? { unitario } : {}),
                      ...(cantidad !== undefined ? { cantidad } : {}),
                      ...(por_persona !== undefined ? { por_persona } : {}),
                      ...(origen ? { origen, grupo_extra_id: "g1" } : {}),
                    } as ExtraConcepto;
                    for (const tcCapturado of [false, true]) {
                      const dentro = extrasAPayload([e], { tcCapturado });
                      expect(
                        dentro.length === 1,
                        `${JSON.stringify(e)} tc=${tcCapturado}`,
                      ).toBe(filtroViejo(e, tcCapturado));
                      casos += 1;
                      aceptados += dentro.length;
                    }
                  }
    // Sanidad del corpus: ejercita los dos desenlaces de verdad.
    expect(casos).toBe(36000);
    expect(aceptados).toBeGreaterThan(1000);
  });

  it("el payload y lo que queda fuera son complementos exactos (nada se pierde en el aire)", () => {
    for (const tc of [false, true]) {
      const dentro = extrasAPayload(lista, { tcCapturado: tc }).length;
      const fuera = extrasFueraDelTotal(lista, { tcCapturado: tc }).length;
      const vacios = lista.filter((e) => estadoExtra(e, { tcCapturado: tc }) === "vacio").length;
      expect(dentro + fuera + vacios).toBe(lista.length);
    }
  });
});

// ---------------------------------------------------------------------------

describe("extrasFueraDelTotal", () => {
  it("el caso del reporte: el renglón de $35 sin nombre, con su motivo y su monto", () => {
    const fuera = extrasFueraDelTotal(
      [extra({ concepto: "TUA CZM", monto_usd: 50 }), extra({ monto_usd: 35, aplica_iva: false })],
      USD,
    );
    expect(fuera).toEqual([
      {
        indice: 1,
        estado: "sin_nombre",
        motivo: "Falta el nombre: no se suma ni se imprime",
        concepto: "",
        monto: 35,
        moneda: "USD",
        campo: "concepto",
        deGrupo: false,
      },
    ]);
  });

  it("un renglón recién agregado NO molesta", () => {
    expect(extrasFueraDelTotal([extra({}), extra({ concepto: "", monto_usd: 0 })], USD)).toEqual([]);
  });

  it("conserva el índice del form (el mismo renglón de la hoja)", () => {
    const fuera = extrasFueraDelTotal(
      [extra({ concepto: "Handler", monto_usd: 10 }), extra({}), extra({ concepto: "Van" })],
      USD,
    );
    expect(fuera.map((f) => f.indice)).toEqual([2]);
    expect(fuera[0].estado).toBe("sin_monto");
    expect(fuera[0].campo).toBe("monto");
  });

  it("cantidad × unitario sin precio: el campo que falta es el unitario (vive en «⋯»)", () => {
    const fuera = extrasFueraDelTotal([extra({ concepto: "Camionetas", cantidad: 2, unitario: 0 })], USD);
    expect(fuera[0].campo).toBe("unitario");
    expect(fuera[0].motivo).toBe(TEXTO_EXTRA_FUERA.sin_monto);
  });

  it("MXN sin T.C.: reutiliza el texto que ya usaba la hoja y apunta al T.C.", () => {
    const fuera = extrasFueraDelTotal([extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" })], USD);
    expect(fuera[0]).toMatchObject({ estado: "mxn_sin_tc", campo: "tc", monto: 1500, moneda: "MXN" });
    expect(fuera[0].motivo).toBe("Captura el T.C. en «Total MXN»: sin él el renglón no entra al total");
    expect(extrasFueraDelTotal([extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" })], CON_TC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("ariaLabelCampoExtra (a qué campo lleva la leyenda)", () => {
  it("concepto, monto USD, monto MXN y T.C.", () => {
    expect(ariaLabelCampoExtra({ campo: "concepto", indice: 0, moneda: "USD" })).toBe("Concepto del extra 1");
    expect(ariaLabelCampoExtra({ campo: "monto", indice: 2, moneda: "USD" })).toBe("Monto del extra 3 (USD)");
    expect(ariaLabelCampoExtra({ campo: "monto", indice: 1, moneda: "MXN" })).toBe("Monto en pesos del extra 2");
    // El unitario se edita en el detalle «⋯»: el foco va al concepto para que
    // la fila (y su leyenda) queden a la vista.
    expect(ariaLabelCampoExtra({ campo: "unitario", indice: 0, moneda: "USD" })).toBe("Concepto del extra 1");
    // null = el campo del T.C., que tiene id propio.
    expect(ariaLabelCampoExtra({ campo: "tc", indice: 0, moneda: "MXN" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("bloqueoGuardadoExtras (candado de guardado, función pura)", () => {
  it("sin renglones a medias no bloquea", () => {
    const r = bloqueoGuardadoExtras([extra({ concepto: "Handler", monto_usd: 120 }), extra({})], USD);
    expect(r).toEqual({ bloquear: false, mensaje: "", primero: null, fuera: [] });
  });

  it("el caso del reporte: bloquea, dice el monto y apunta al primer renglón", () => {
    const r = bloqueoGuardadoExtras([extra({ concepto: "TUA", monto_usd: 50 }), extra({ monto_usd: 35 })], USD);
    expect(r.bloquear).toBe(true);
    expect(r.mensaje).toBe("Hay 1 concepto que no entra al total ($35.00): ponle nombre o quítalo.");
    expect(r.primero?.indice).toBe(1);
  });

  it("varios del mismo tipo: plural y suma", () => {
    const r = bloqueoGuardadoExtras([extra({ monto_usd: 35 }), extra({ monto_usd: 15.5 })], USD);
    expect(r.mensaje).toBe("Hay 2 conceptos que no entran al total ($50.50): ponles nombre o quítalos.");
  });

  it("sin monto: el mensaje pide el monto, no el nombre, y no inventa cifras", () => {
    const r = bloqueoGuardadoExtras([extra({ concepto: "Comisariato" })], USD);
    expect(r.mensaje).toBe("Hay 1 concepto que no entra al total: ponle monto o quítalo.");
  });

  it("motivos mezclados: pide nombre y monto", () => {
    const r = bloqueoGuardadoExtras([extra({ monto_usd: 35 }), extra({ concepto: "Comisariato" })], USD);
    expect(r.mensaje).toBe("Hay 2 conceptos que no entran al total ($35.00): ponles nombre y monto o quítalos.");
  });

  it("pesos y dólares: cada moneda con su símbolo, nunca sumadas entre sí", () => {
    const r = bloqueoGuardadoExtras(
      [extra({ monto_usd: 35 }), extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" })],
      USD,
    );
    expect(r.mensaje).toContain("($35.00 + $1,500.00 MXN)");
  });

  it("solo MXN sin T.C.: manda capturar el tipo de cambio", () => {
    const r = bloqueoGuardadoExtras([extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" })], USD);
    expect(r.mensaje).toBe(
      "Hay 1 concepto que no entra al total ($1,500.00 MXN): captura el T.C. en «Total MXN» o quítalo.",
    );
    expect(bloqueoGuardadoExtras([extra({ concepto: "Van", monto_usd: 1500, moneda: "MXN" })], CON_TC).bloquear).toBe(
      false,
    );
  });

  /**
   * Una línea de GRUPO se edita SOLO en el grupo (aquí va bloqueada): si un
   * cargo del grupo llegara con precio 0, frenar por él dejaría la cotización
   * hija imposible de guardar. La hoja igual lo marca —el aviso es cierto—,
   * pero el candado sería una trampa sin salida.
   */
  it("una línea de GRUPO se marca pero NO bloquea (no se puede corregir aquí)", () => {
    const grupo = extra({ concepto: "Tour", unitario: 0, por_persona: true, origen: "GRUPO", grupo_extra_id: "g1" });
    expect(extrasFueraDelTotal([grupo], USD)).toMatchObject([{ estado: "sin_monto", deGrupo: true }]);
    expect(bloqueoGuardadoExtras([grupo], USD).bloquear).toBe(false);
    // …pero un renglón propio en la misma lista sigue frenando.
    expect(bloqueoGuardadoExtras([grupo, extra({ monto_usd: 35 })], USD)).toMatchObject({
      bloquear: true,
      primero: { indice: 1 },
    });
  });

  it("es PURA: no toca la lista que recibe", () => {
    const lista = [extra({ monto_usd: 35 })];
    const copia = JSON.parse(JSON.stringify(lista));
    bloqueoGuardadoExtras(lista, USD);
    expect(lista).toEqual(copia);
  });
});
