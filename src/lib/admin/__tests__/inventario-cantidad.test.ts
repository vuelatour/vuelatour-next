/**
 * Corregir la cantidad de una ENTRADA, el ajuste que dice lo que hace y la
 * salida repartida entre ALGUNAS matrículas (27-nov-2026, API 0.0.152).
 * Casos reales de la oficina: «por error de dedo puse 13, pero ingresaron
 * 12» y «necesito poner solo 4 matrículas y no todas».
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_TIPO_AJUSTE,
  NOTA_AJUSTE_SUMA,
  destinoDeReparto,
  estadoCantidad,
  etiquetaReparto,
  mensajeErrorCantidad,
  puedeCorregirCantidad,
  resumenReparto,
  toastCantidadCorregida,
} from "../inventario-cantidad";

describe("estadoCantidad (campo «Cantidad correcta»)", () => {
  it("13 → 12: se puede guardar", () => {
    expect(estadoCantidad("12", 13)).toEqual({ numero: 12, error: null });
  });

  it("vacío: sin error y sin número (el botón espera)", () => {
    expect(estadoCantidad("", 13)).toEqual({ numero: null, error: null });
    expect(estadoCantidad("   ", 13)).toEqual({ numero: null, error: null });
  });

  it("la misma cantidad no es una corrección", () => {
    const r = estadoCantidad("13", 13);
    expect(r.numero).toBeNull();
    expect(r.error).toContain("misma cantidad");
    expect(estadoCantidad("13.00", 13).numero).toBeNull();
  });

  it("cero o negativo: manda a eliminar la entrada, no a ponerla en 0", () => {
    for (const t of ["0", "-1"]) {
      const r = estadoCantidad(t, 13);
      expect(r.numero).toBeNull();
      expect(r.error).toContain("mayor a 0");
      expect(r.error).toContain("elimínala");
    }
  });

  it("decimales: hasta 2 (coma o punto); con 3 se rechaza", () => {
    expect(estadoCantidad("2.5", 3)).toEqual({ numero: 2.5, error: null });
    expect(estadoCantidad("2,5", 3)).toEqual({ numero: 2.5, error: null });
    expect(estadoCantidad("2.375", 3).error).toBe("Máximo 2 decimales.");
  });

  it("texto que no es número", () => {
    expect(estadoCantidad("doce", 13).error).toBe("Escribe la cantidad con números.");
  });
});

describe("toastCantidadCorregida", () => {
  it("dice de cuánto a cuánto y la existencia que quedó (números del API)", () => {
    expect(
      toastCantidadCorregida({ cantidad_antes: 13, cantidad_despues: 12, stock_resultante: 120 }, "cuarto (qt)"),
    ).toBe("Cantidad corregida: 13 → 12 cuarto (qt). Existencia: 120 cuarto (qt).");
  });

  it("sin los aditivos (API raro) no inventa números", () => {
    expect(toastCantidadCorregida({})).toBe("Cantidad corregida.");
  });
});

describe("mensajeErrorCantidad", () => {
  it("el mensaje del API se pinta tal cual (dice qué hacer)", () => {
    const api =
      "Con 5 en vez de 10 la existencia quedaría en -3 al llegar la SALIDA de 8 del 2 sep 2026 a XA-VGV: de esta entrada ya salieron piezas. Lo menos que puede quedar es 8.";
    expect(mensajeErrorCantidad({ error: api, status: 409, code: "STOCK_NEGATIVO" })).toBe(api);
  });

  it("404 sin código = API sin desplegar; 403 = no es Administración", () => {
    expect(mensajeErrorCantidad({ error: "Cannot PATCH /v1/…", status: 404 })).toContain("falta actualizar el API");
    expect(mensajeErrorCantidad({ error: "Forbidden", status: 403 })).toContain("Solo Administración");
  });

  it("un 404 CON código (el movimiento ya no existe) conserva el mensaje del API", () => {
    expect(mensajeErrorCantidad({ error: "Movimiento x no encontrado en este ítem", status: 404, code: "NOT_FOUND" })).toBe(
      "Movimiento x no encontrado en este ítem",
    );
  });
});

describe("solo las ENTRADAS se corrigen aquí", () => {
  it("ENTRADA sí; SALIDA, AJUSTE, DEVOLUCION y TRASPASO no", () => {
    expect(puedeCorregirCantidad({ tipo: "ENTRADA" })).toBe(true);
    for (const tipo of ["SALIDA", "AJUSTE", "DEVOLUCION", "TRASPASO"] as const) {
      expect(puedeCorregirCantidad({ tipo })).toBe(false);
    }
  });
});

describe("el ajuste dice lo que hace", () => {
  it("la etiqueta ya no promete «merma» ni «desecho»: el ajuste SUMA", () => {
    expect(ETIQUETA_TIPO_AJUSTE).toBe("Ajuste (suma piezas a la existencia)");
    expect(ETIQUETA_TIPO_AJUSTE.toLowerCase()).not.toContain("merma");
    expect(ETIQUETA_TIPO_AJUSTE.toLowerCase()).not.toContain("desecho");
    expect(NOTA_AJUSTE_SUMA).toContain("SUMA");
    expect(NOTA_AJUSTE_SUMA).toContain("«Corregir cantidad»");
  });
});

describe("destinoDeReparto (qué viaja al API)", () => {
  const flota = ["N4142R", "N58BT", "N621TX", "N990GG", "XA-VGV", "XB-ANU", "XB-PEV"].map((m) => ({ id: m }));

  it("las 4 que pidió la oficina ⇒ ALGUNAS, en el orden del catálogo", () => {
    expect(destinoDeReparto(flota, ["N990GG", "N4142R", "N621TX", "N58BT"])).toEqual({
      tipo: "ALGUNAS",
      aeronave_ids: ["N4142R", "N58BT", "N621TX", "N990GG"],
    });
  });

  it("todas marcadas ⇒ TODAS (viaja como «toda la flota», sin lista)", () => {
    expect(destinoDeReparto(flota, flota.map((a) => a.id))).toEqual({ tipo: "TODAS" });
  });

  it("una sola ⇒ salida normal a ese avión", () => {
    expect(destinoDeReparto(flota, ["XA-VGV"])).toEqual({ tipo: "UNA", aeronave_id: "XA-VGV" });
  });

  it("ninguna ⇒ error que dice qué hacer", () => {
    const r = destinoDeReparto(flota, []);
    expect(r.tipo).toBe("ERROR");
    expect(r.tipo === "ERROR" && r.mensaje).toContain("Marca al menos una matrícula");
  });

  it("un id que no está en el catálogo (avión dado de baja) no cuenta", () => {
    expect(destinoDeReparto(flota, ["XB-IJP", "XA-VGV"])).toEqual({ tipo: "UNA", aeronave_id: "XA-VGV" });
  });
});

describe("resumenReparto", () => {
  it("dice cuántas y cuánto paga cada una", () => {
    expect(resumenReparto(7, 4)).toBe("4 de 7 marcadas · cada una paga 1/4");
    expect(resumenReparto(7, 1)).toBe("1 de 7 marcada · se le carga completa");
    expect(resumenReparto(7, 0)).toBe("Ninguna marcada de 7");
  });
});

describe("etiquetaReparto (columna del cardex)", () => {
  it("matrículas elegidas ⇒ se nombran; toda la flota ⇒ FLOTA; no repartida ⇒ null", () => {
    expect(etiquetaReparto({ para_flota: true, matriculas_flota: ["N4142R", "N58BT"] })).toBe("N4142R, N58BT");
    expect(etiquetaReparto({ para_flota: true, matriculas_flota: null })).toBe("FLOTA");
    expect(etiquetaReparto({ para_flota: true })).toBe("FLOTA");
    expect(etiquetaReparto({ para_flota: false, matriculas_flota: ["N4142R", "N58BT"] })).toBeNull();
    expect(etiquetaReparto({})).toBeNull();
  });
});
