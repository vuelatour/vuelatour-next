import { describe, expect, it } from "vitest";

import {
  TARIFA_DECIMALES,
  TARIFA_EPSILON_2,
  esEcoDeTarifa,
  mismaTarifa,
  moneyTarifa,
  normalizarTarifa,
  overrideTarifaCapturado,
  preferirTarifaPersistida,
  segmentoTarifa,
  round6,
  tarifaOverrideRehidratada,
  tarifaConDecimalesFinos,
  tarifaPactadaONull,
  textoCambioTarifa,
  textoCuentaTarifa,
  textoTarifaInput,
} from "@/lib/admin/tarifa";
import { resumirCambios } from "@/lib/admin/quote-revision";

/** Redondeo de DINERO (2 decimales), el del motor. */
const redondeoDinero = (v: number) => Math.round(v * 100) / 100;

describe("normalización", () => {
  it("round6 y los decimales canónicos", () => {
    expect(TARIFA_DECIMALES).toBe(6);
    expect(round6(989.5833333333)).toBe(989.583333);
    expect(round6(989.58)).toBe(989.58);
  });

  it("normalizarTarifa CONSERVA el cero (cliente interno)", () => {
    expect(normalizarTarifa(0)).toBe(0);
    expect(normalizarTarifa("0")).toBe(0);
    expect(normalizarTarifa("")).toBeNull();
    expect(normalizarTarifa(null)).toBeNull();
    expect(normalizarTarifa(-5)).toBeNull();
    expect(normalizarTarifa("abc")).toBeNull();
    // `numeric` de PostgREST puede llegar como CADENA, con ceros de cola.
    expect(normalizarTarifa("989.583333")).toBe(989.583333);
    expect(normalizarTarifa("650.000000")).toBe(650);
  });

  it("tarifaPactadaONull descarta el cero (= el `> 0` de la rehidratación)", () => {
    expect(tarifaPactadaONull(0)).toBeNull();
    expect(tarifaPactadaONull(989.583333)).toBe(989.583333);
  });

  it("dos tarifas iguales a 6 decimales son la MISMA", () => {
    expect(mismaTarifa(989.583333, 989.5833334)).toBe(true);
    expect(mismaTarifa(989.58, 989.583333)).toBe(false);
    expect(mismaTarifa(null, null)).toBe(true);
    // El 0 NO es «sin capturar»: vaciar un override de $0 es un cambio real.
    expect(mismaTarifa(0, null)).toBe(false);
    expect(mismaTarifa(0, 0)).toBe(true);
  });
});

describe("preferirTarifaPersistida (rehidratación)", () => {
  it("manda el que conserva más precisión cuando es el MISMO número", () => {
    // Snapshot viejo (round2) + columna nueva numeric(14,6) → la columna.
    expect(preferirTarifaPersistida(989.58, 989.583333)).toBe(989.583333);
    // Snapshot nuevo + columna vieja (API a medio desplegar) → el snapshot.
    expect(preferirTarifaPersistida(989.583333, 989.58)).toBe(989.583333);
  });

  it("si son números DISTINTOS manda el snapshot (es la foto del dinero)", () => {
    expect(preferirTarifaPersistida(650, 1050)).toBe(650);
  });

  it("tolera que falte cualquiera de los dos (y el 0 = sin override)", () => {
    expect(preferirTarifaPersistida(null, 650)).toBe(650);
    expect(preferirTarifaPersistida(650, null)).toBe(650);
    expect(preferirTarifaPersistida(null, null)).toBeNull();
    expect(preferirTarifaPersistida(0, 0)).toBeNull();
  });

  it("da igual que el API mande number o string (y con ceros de cola)", () => {
    expect(preferirTarifaPersistida("989.58", "989.583333")).toBe(989.583333);
    expect(preferirTarifaPersistida("989.583333", 989.58)).toBe(989.583333);
    expect(preferirTarifaPersistida("650.000000", "650.00")).toBe(650);
  });
});

describe("tarifaOverrideRehidratada (lo que abre el cotizador)", () => {
  it("solo rehidrata la tarifa que se ajustó A MANO", () => {
    // #105: override manual → se rehidrata con TODOS sus decimales.
    expect(
      tarifaOverrideRehidratada(
        { proviene_de_override: true, usd_por_hora: 989.58 },
        "989.583333",
      ),
    ).toBe(989.583333);
    // Tarifa del avión / preferencial del cliente → se RE-resuelve (null):
    // cambiar de avión o PUBLICO↔BROKER debe recalcular.
    expect(
      tarifaOverrideRehidratada({ proviene_de_override: false, usd_por_hora: 650 }, 650),
    ).toBeNull();
    expect(tarifaOverrideRehidratada(undefined, 650)).toBeNull();
    // Snapshot con override pero sin tarifa persistida (> 0): nada que fijar.
    expect(
      tarifaOverrideRehidratada({ proviene_de_override: true, usd_por_hora: 0 }, 0),
    ).toBeNull();
  });

  it("con el API sin migrar se comporta EXACTAMENTE como antes", () => {
    expect(
      tarifaOverrideRehidratada({ proviene_de_override: true, usd_por_hora: 989.58 }, "989.58"),
    ).toBe(989.58);
    expect(
      tarifaOverrideRehidratada({ proviene_de_override: true, usd_por_hora: 650 }, "650.00"),
    ).toBe(650);
  });
});

describe("esEcoDeTarifa (el eco truncado no es una edición)", () => {
  it("989.58 leído contra 989.583333 es el ECO del propio persistido", () => {
    expect(esEcoDeTarifa(989.58, 989.583333)).toBe(true);
    expect(esEcoDeTarifa("989.58", "989.583333")).toBe(true);
  });

  it("una edición REAL nunca se confunde con un eco", () => {
    expect(esEcoDeTarifa(990, 989.583333)).toBe(false); // el caso del contrato
    expect(esEcoDeTarifa(989.59, 989.583333)).toBe(false); // |Δ| > 0.005
    // Agregar decimales a propósito (el entrante es MÁS preciso) sí es edición.
    expect(esEcoDeTarifa(989.583333, 989.58)).toBe(false);
  });

  it("el mismo número no es un eco, y sin dato no se afirma nada", () => {
    expect(esEcoDeTarifa(989.583333, 989.583333)).toBe(false);
    expect(esEcoDeTarifa(null, 989.583333)).toBe(false);
    expect(esEcoDeTarifa(989.58, null)).toBe(false);
  });

  it("la frontera son 0.005 (media unidad del último decimal persistido)", () => {
    expect(TARIFA_EPSILON_2).toBe(5e-3);
    expect(esEcoDeTarifa(989.58, 989.585)).toBe(true);
    expect(esEcoDeTarifa(989.58, 989.5851)).toBe(false);
  });
});

/**
 * EL CICLO QUE FALLABA (#105, COMPLETADO y cobrado): la oficina tecleó
 * 989.583333 para cerrar en $2,375.00 con 2.4 hr; se persistió 989.58 y
 * reabrir + guardar sin tocar nada devolvía $2,374.99.
 */
describe("ciclo completo pactar → guardar → reabrir (#105)", () => {
  const HORAS = 2.4;
  const TARIFA = 989.583333;
  const TOTAL = 2375;

  it("2.4 h × 989.583333 = $2,375.00 exactos", () => {
    expect(redondeoDinero(HORAS * TARIFA)).toBe(TOTAL);
    // Lo que pasaba con la tarifa truncada: un centavo menos.
    expect(redondeoDinero(HORAS * 989.58)).toBe(2374.99);
  });

  it("rehidratar → recalcular conserva el total, venga como venga del API", () => {
    for (const columna of [TARIFA, TARIFA.toFixed(6), "989.583333"]) {
      for (const snapshot of [TARIFA, 989.58]) {
        const rehidratado = preferirTarifaPersistida(snapshot, columna)!;
        expect(rehidratado).toBe(TARIFA);
        expect(redondeoDinero(HORAS * rehidratado)).toBe(TOTAL);
      }
    }
    // Con el API todavía sin migrar (los dos caminos truncados) el panel no
    // puede inventar precisión: el total lo ancla el API con `esEcoDeTarifa`.
    expect(preferirTarifaPersistida(989.58, 989.58)).toBe(989.58);
    expect(esEcoDeTarifa(989.58, TARIFA)).toBe(true);
  });
});

describe("textos", () => {
  it("textoTarifaInput: el número tal cual se teclea, sin ceros de cola", () => {
    expect(textoTarifaInput(989.583333)).toBe("989.583333");
    expect(textoTarifaInput("650.00")).toBe("650");
    expect(textoTarifaInput(1650.5)).toBe("1650.5");
    expect(textoTarifaInput(null)).toBe("");
  });

  it("moneyTarifa: 2 decimales de piso, 6 de techo", () => {
    expect(moneyTarifa(600)).toBe("$600.00");
    expect(moneyTarifa(989.58)).toBe("$989.58");
    expect(moneyTarifa(989.583333)).toBe("$989.583333");
    expect(moneyTarifa(1650)).toBe("$1,650.00");
  });

  it("tarifaConDecimalesFinos distingue la tarifa que necesita explicación", () => {
    expect(tarifaConDecimalesFinos(989.583333)).toBe(true);
    expect(tarifaConDecimalesFinos(989.58)).toBe(false);
    expect(tarifaConDecimalesFinos(600)).toBe(false);
    expect(tarifaConDecimalesFinos(null)).toBe(false);
  });

  it("textoCuentaTarifa: la cuenta viva SOLO cuando hay algo que explicar", () => {
    expect(
      textoCuentaTarifa({ horas: 2.4, tarifa: 989.583333, importeUsd: 2375 }),
    ).toBe("2.4 hr × $989.583333 = $2,375.00");
    // El motor va un debounce atrás: la cuenta sin el «=» (quien llama dice
    // «calculando…»).
    expect(textoCuentaTarifa({ horas: 2.4, tarifa: 989.583333, importeUsd: null })).toBe(
      "2.4 hr × $989.583333",
    );
    // Con 2 decimales la multiplicación se ve sola: no se pinta nada.
    expect(textoCuentaTarifa({ horas: 2.4, tarifa: 600, importeUsd: 1440 })).toBeNull();
    expect(textoCuentaTarifa({ horas: null, tarifa: 989.583333 })).toBeNull();
    // Las HORAS van completas: la cuenta jamás se lee descuadrada.
    expect(
      textoCuentaTarifa({ horas: 2.33333333, tarifa: 989.583333, importeUsd: 2309 }),
    ).toBe("2.33333333 hr × $989.583333 = $2,309.00");
  });

  it("textoCambioTarifa: nunca se lee «$989.58→$989.58»", () => {
    expect(textoCambioTarifa(989.58, 989.583333)).toEqual(["$989.58", "$989.5833"]);
    expect(textoCambioTarifa(650, 700)).toEqual(["$650", "$700"]);
    expect(textoCambioTarifa(989.583333, 990)).toEqual(["$989.58", "$990"]);
    expect(textoCambioTarifa(650, 0)).toEqual(["$650", "$0"]);
    expect(textoCambioTarifa(null, 989.583333)).toEqual(["—", "$989.58"]);
  });
});

/**
 * El diff del cotizador: lo que decide si aparece «Guardar → vN» y qué se
 * cuenta en el motivo. Un eco truncado NO es un cambio (el API lo ancla);
 * una edición de verdad SÍ.
 */
describe("diff de versiones (resumirCambios)", () => {
  const clave = (prev: unknown, next: unknown) =>
    resumirCambios(
      { tarifa_hora_override_usd: prev } as never,
      { tarifa_hora_override_usd: next } as never,
    );

  it("el eco truncado de la #105 no produce ningún cambio", () => {
    expect(clave(989.583333, 989.58)).toEqual([]);
  });

  it("una edición real se cuenta y se lee sin ambigüedad", () => {
    expect(clave(989.583333, 990)).toEqual([
      { clave: "tarifa_override", texto: "Tarifa/hr $989.58→$990", tripulacion: false },
    ]);
    // Agregarle precisión a propósito también es un cambio, y se VE.
    expect(clave(989.58, 989.583333)).toEqual([
      { clave: "tarifa_override", texto: "Tarifa/hr $989.58→$989.5833", tripulacion: false },
    ]);
  });

  it("vaciar o poner en $0 sigue contándose como siempre", () => {
    expect(clave(989.583333, null)).toEqual([
      {
        clave: "tarifa_override",
        texto: "Tarifa/hr vuelve a la del cliente/avión",
        tripulacion: false,
      },
    ]);
    expect(clave(null, 989.583333)).toEqual([
      { clave: "tarifa_override", texto: "Tarifa/hr manual $989.58", tripulacion: false },
    ]);
    expect(clave(650, 0)).toEqual([
      { clave: "tarifa_override", texto: "Tarifa/hr $650→$0", tripulacion: false },
    ]);
    expect(clave(0, null)).toEqual([
      {
        clave: "tarifa_override",
        texto: "Tarifa/hr vuelve a la del cliente/avión",
        tripulacion: false,
      },
    ]);
  });
});

/**
 * SEGMENTO Pública | Broker | Personalizada (Fase 2.3 · BLOQUE B): una sola
 * regla para el PAPEL (fila «Tarifa» de la hoja interna) y para el PANEL. Con
 * dos copias, una pantalla podría decir «Pública» mientras se cobra la manual.
 */
describe("segmento de tarifa", () => {
  it("sin nada capturado manda el tipo del cliente/avión", () => {
    expect(segmentoTarifa({ tipo_tarifa: "PUBLICO" })).toBe("PUBLICO");
    expect(segmentoTarifa({ tipo_tarifa: "BROKER" })).toBe("BROKER");
    expect(
      segmentoTarifa({ tipo_tarifa: "BROKER", tarifa_personalizada: false, tarifa_hora_override_usd: null }),
    ).toBe("BROKER");
  });

  it("una tarifa manual CAPTURADA manda sobre el tipo (aunque llegue como cadena)", () => {
    expect(segmentoTarifa({ tipo_tarifa: "PUBLICO", tarifa_hora_override_usd: 989.583333 })).toBe(
      "CUSTOM",
    );
    // El panel la `register`a sobre un <input type="number">: ahí es CADENA.
    expect(
      segmentoTarifa({ tipo_tarifa: "PUBLICO", tarifa_hora_override_usd: "1550" as unknown as number }),
    ).toBe("CUSTOM");
  });

  it("el CERO cuenta como capturado («Poner todo en $0» del cliente interno)", () => {
    expect(overrideTarifaCapturado(0)).toBe(true);
    expect(segmentoTarifa({ tipo_tarifa: "PUBLICO", tarifa_hora_override_usd: 0 })).toBe("CUSTOM");
  });

  it("el modo es PEGAJOSO: vaciar el campo no apaga «Personalizada»", () => {
    expect(
      segmentoTarifa({
        tipo_tarifa: "PUBLICO",
        tarifa_personalizada: true,
        tarifa_hora_override_usd: null,
      }),
    ).toBe("CUSTOM");
  });

  it("vacío, espacios y ausente NO son captura", () => {
    expect(overrideTarifaCapturado(null)).toBe(false);
    expect(overrideTarifaCapturado(undefined)).toBe(false);
    expect(overrideTarifaCapturado("")).toBe(false);
    expect(overrideTarifaCapturado("   ")).toBe(false);
  });
});
