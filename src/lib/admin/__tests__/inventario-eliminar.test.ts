import { describe, expect, it } from "vitest";
import {
  AVISO_IRREVERSIBLE,
  autorEliminado,
  cantidadConUnidad,
  descripcionMovimiento,
  esApiSinBaja,
  estadoMotivo,
  fraseCambioPrecioVigente,
  fraseEliminacion,
  fraseExistencia,
  fraseGastos,
  gastosEliminadosTxt,
  lineasVistaPrevia,
  MENSAJE_API_VIEJO,
  mensajeErrorEliminacion,
  mensajeExito,
  montoTxt,
  MOTIVO_MIN,
  NOTA_BAJA_SIN_RECOSTEO,
  resumenEliminado,
  tituloBloqueo,
  tituloHistorial,
} from "@/lib/admin/inventario-eliminar";
import type {
  EliminacionMovimientoPreview,
  GastoLigadoEliminacion,
  MovimientoEliminado,
} from "@/types/inventory";

/**
 * Caso REAL de la captura del cliente (21-sep-2026): el cardex del aceite
 * tiene tres movimientos capturados por error el 29-ago — Salida −10 a
 * XA-VGV, Entrada +1 de $350 MXN y Salida −1 a XA-VGV — sobre una existencia
 * de 111. Las respuestas de abajo son las que manda el API para ese ítem.
 */
const salida10: EliminacionMovimientoPreview = {
  permitido: true,
  codigo_bloqueo: null,
  mensaje:
    "Se puede eliminar la SALIDA de 10 del 29 ago 2026 a XA-VGV: la existencia pasa de 111 a 121 y ninguna otra salida cambia de costo.",
  stock_antes: 111,
  stock_despues: 121,
  movimiento: { tipo: "SALIDA", cantidad: 10, fecha: "2026-08-29", aeronave: "XA-VGV" },
  gastos: [
    {
      id: "g-1",
      monto: 3500,
      moneda: "MXN",
      aeronave_matricula: "XA-VGV",
      fecha_gasto: "2026-08-29",
      bloqueado: false,
      motivo_bloqueo: null,
    },
  ],
  de_compra: null,
};

const entrada1: EliminacionMovimientoPreview = {
  permitido: true,
  codigo_bloqueo: null,
  mensaje: "Se puede eliminar la ENTRADA de 1 del 29 ago 2026…",
  stock_antes: 111,
  stock_despues: 110,
  movimiento: { tipo: "ENTRADA", cantidad: 1, fecha: "2026-08-29", aeronave: null },
  gastos: [],
  de_compra: null,
};

describe("estadoMotivo (justificación obligatoria)", () => {
  it("exige 10 caracteres REALES: los espacios no justifican nada", () => {
    expect(estadoMotivo("          ").valido).toBe(false);
    expect(estadoMotivo("          ").faltan).toBe(MOTIVO_MIN);
    expect(estadoMotivo("  se capturó por error  ").valido).toBe(true);
  });

  it("cuenta lo que falta y luego el avance hasta el máximo", () => {
    expect(estadoMotivo("error").contador).toBe("Faltan 5 caracteres");
    expect(estadoMotivo("error ab").contador).toBe("Faltan 2 caracteres");
    expect(estadoMotivo("error abc").contador).toBe("Faltan 1 carácter");
    expect(estadoMotivo("capturado por error").contador).toBe("19 / 500");
  });

  it("rechaza pasarse del máximo del API (500)", () => {
    expect(estadoMotivo("x".repeat(500)).valido).toBe(true);
    expect(estadoMotivo("x".repeat(501)).valido).toBe(false);
  });

  it("un motivo vacío o nulo nunca es válido", () => {
    expect(estadoMotivo("").valido).toBe(false);
    expect(estadoMotivo(null).valido).toBe(false);
    expect(estadoMotivo(undefined).valido).toBe(false);
  });
});

describe("cantidades, montos y descripción del movimiento", () => {
  it("usa la unidad del ítem tal como se capturó", () => {
    expect(cantidadConUnidad(10, "pzas")).toBe("10 pzas");
    expect(cantidadConUnidad(2.5, " litros ")).toBe("2.5 litros");
  });

  it("sin unidad dice unidad/unidades (nunca inventa un plural)", () => {
    expect(cantidadConUnidad(1, null)).toBe("1 unidad");
    expect(cantidadConUnidad(10, "")).toBe("10 unidades");
  });

  it("escribe el monto en la moneda del gasto", () => {
    expect(montoTxt(3500, "MXN")).toBe("$3,500.00 MXN");
    expect(montoTxt(120, "USD")).toBe("$120 USD");
    expect(montoTxt(null, "MXN")).toBe("—");
  });

  it("arma «la SALIDA de 10 pzas del 29 ago 2026 a XA-VGV»", () => {
    expect(descripcionMovimiento(salida10.movimiento, "pzas")).toBe(
      "la SALIDA de 10 pzas del 29 ago 2026 a XA-VGV",
    );
  });

  it("FLOTA se dice con todas sus letras y el AJUSTE lleva «el»", () => {
    expect(
      descripcionMovimiento(
        { tipo: "SALIDA", cantidad: 3, fecha: "2026-08-29", aeronave: "FLOTA" },
        "pzas",
      ),
    ).toBe("la SALIDA de 3 pzas del 29 ago 2026 a toda la flota");
    expect(
      descripcionMovimiento(
        { tipo: "AJUSTE", cantidad: 2, fecha: "2026-08-29", aeronave: null },
        null,
      ),
    ).toBe("el AJUSTE de 2 unidades del 29 ago 2026");
  });
});

describe("vista previa cuando SÍ se puede eliminar (caso de la captura)", () => {
  it("dice qué se elimina, cómo queda la existencia y qué gasto se va", () => {
    expect(lineasVistaPrevia(salida10, "pzas")).toEqual([
      "Se eliminará la SALIDA de 10 pzas del 29 ago 2026 a XA-VGV.",
      "Regresan 10 pzas a la existencia (de 111 a 121).",
      "También se elimina su gasto de $3,500.00 MXN cargado a XA-VGV.",
    ]);
  });

  it("una ENTRADA DESCUENTA de la existencia (111 → 110) y lo dice así", () => {
    expect(fraseEliminacion(entrada1, "pzas")).toBe(
      "Se eliminará la ENTRADA de 1 pzas del 29 ago 2026.",
    );
    // Verbo en SINGULAR con una sola pieza (la unidad la escribió el
    // operador y no se le inventa el plural, pero el verbo sí concuerda).
    expect(fraseExistencia(entrada1, "pzas")).toBe(
      "Se descuenta 1 pzas de la existencia (de 111 a 110).",
    );
    expect(fraseExistencia({ ...entrada1, stock_antes: 110, stock_despues: 111 }, null)).toBe(
      "Regresa 1 unidad a la existencia (de 110 a 111).",
    );
  });

  it("sin gastos ligados lo dice EXPLÍCITAMENTE (no calla que no hay dinero)", () => {
    expect(fraseGastos([])).toBe(
      "No tiene gastos de bodega ligados: no se toca ningún gasto.",
    );
  });

  it("con prorrateo a la flota suma los N gastos en su moneda", () => {
    const flota: GastoLigadoEliminacion[] = [
      {
        id: "a",
        monto: 100.5,
        moneda: "MXN",
        aeronave_matricula: "XA-VGV",
        fecha_gasto: null,
        bloqueado: false,
        motivo_bloqueo: null,
      },
      {
        id: "b",
        monto: 200.25,
        moneda: "MXN",
        aeronave_matricula: "N990GG",
        fecha_gasto: null,
        bloqueado: false,
        motivo_bloqueo: null,
      },
    ];
    expect(fraseGastos(flota)).toBe(
      "También se eliminan los 2 gastos de bodega que generó, $300.75 MXN en total.",
    );
  });

  it("el aviso de irreversibilidad promete la huella de auditoría", () => {
    expect(AVISO_IRREVERSIBLE).toContain("No se puede deshacer");
    expect(AVISO_IRREVERSIBLE).toContain("motivo");
  });
});

describe("API 0.0.36 · la baja ya no recostea salidas; puede cambiar el último precio", () => {
  // Ejemplo del cliente: compra de agosto a 21 USD, compra de septiembre a 30
  // USD. Quitar la de septiembre regresa el último precio a 21.
  const compraSep: EliminacionMovimientoPreview = {
    ...entrada1,
    mensaje:
      "Se puede eliminar la ENTRADA de 5 del 05 sep 2026: la existencia pasa de 10 a 5. Ninguna salida cambia de costo: cada una guarda el costo con que se cobró.",
    stock_antes: 10,
    stock_despues: 5,
    movimiento: { tipo: "ENTRADA", cantidad: 5, fecha: "2026-09-05", aeronave: null },
    regla_costo: "ULTIMO_PRECIO",
    cambia_precio_vigente: true,
    precio_vigente_antes: {
      movimiento_id: "e2",
      fecha: "2026-09-05",
      moneda: "USD",
      unitario: 30,
      unitario_usd: 30,
      unitario_mxn: null,
      tc_compra: 17.2,
    },
    precio_vigente_despues: {
      movimiento_id: "e1",
      fecha: "2026-08-10",
      moneda: "USD",
      unitario: 21,
      unitario_usd: 21,
      unitario_mxn: null,
      tc_compra: 17,
    },
  };

  it("el cambio de precio va en su PROPIO renglón, después de «ninguna salida cambia de costo»", () => {
    expect(fraseCambioPrecioVigente(compraSep)).toBe(
      "El último precio de compra pasa de $30.00 USD (05 sep 2026) a $21.00 USD (10 ago 2026): con él se valúa la existencia y se cobra la siguiente salida.",
    );
    const lineas = lineasVistaPrevia(compraSep, "qt");
    expect(lineas).toHaveLength(5);
    expect(lineas[3]).toBe(NOTA_BAJA_SIN_RECOSTEO);
    expect(lineas[4]).toContain("El último precio de compra pasa de $30.00 USD");
  });

  it("sin cambio de precio: solo la nota (API nuevo) · API previo: las 3 frases de siempre", () => {
    const sinCambio = { ...compraSep, cambia_precio_vigente: false };
    expect(fraseCambioPrecioVigente(sinCambio)).toBeNull();
    expect(lineasVistaPrevia(sinCambio)).toEqual([
      fraseEliminacion(sinCambio),
      fraseExistencia(sinCambio),
      fraseGastos(sinCambio.gastos),
      NOTA_BAJA_SIN_RECOSTEO,
    ]);
    expect(lineasVistaPrevia(salida10, "pzas")).toHaveLength(3);
  });

  it("quitar la ÚNICA compra con costo: se dice que el producto se queda sin precio", () => {
    const unica = { ...compraSep, precio_vigente_despues: null };
    expect(fraseCambioPrecioVigente(unica)).toContain("se queda sin ninguna compra con costo");
  });

  it("ningún texto nuevo dice «FIFO»", () => {
    for (const t of lineasVistaPrevia(compraSep)) expect(t).not.toMatch(/FIFO/);
    expect(tituloBloqueo("CAMBIA_COSTO_FIFO")).not.toMatch(/FIFO/);
  });
});

describe("vista previa BLOQUEADA: título corto, el mensaje lo pone el API", () => {
  it("traduce cada código a un título en es-MX", () => {
    expect(tituloBloqueo("STOCK_NEGATIVO")).toBe("Dejaría la existencia en negativo");
    // Solo lo manda un API PREVIO (costo FIFO); con el último precio de
    // compra ninguna salida cambia de costo al quitar otra fila.
    expect(tituloBloqueo("CAMBIA_COSTO_FIFO")).toBe("El costo de otra salida cambiaría");
    expect(tituloBloqueo("MOVIMIENTO_DE_COMPRA")).toBe("Nació de una compra");
    expect(tituloBloqueo("GASTO_BLOQUEADO")).toBe("Su gasto ya no se puede tocar");
    expect(tituloBloqueo("TIPO_NO_SOPORTADO")).toBe(
      "Este tipo de movimiento no se elimina",
    );
  });

  it("un código desconocido (API más nuevo) no rompe el diálogo", () => {
    expect(tituloBloqueo(null)).toBe("No se puede eliminar");
    expect(
      tituloBloqueo("CODIGO_QUE_NO_EXISTE" as unknown as "STOCK_NEGATIVO"),
    ).toBe("No se puede eliminar");
  });

  it("ningún título promete algo que el API no haya dicho", () => {
    for (const titulo of Object.values({
      a: tituloBloqueo("STOCK_NEGATIVO"),
      b: tituloBloqueo("CAMBIA_COSTO_FIFO"),
      c: tituloBloqueo("MOVIMIENTO_DE_COMPRA"),
      d: tituloBloqueo("GASTO_BLOQUEADO"),
      e: tituloBloqueo("TIPO_NO_SOPORTADO"),
    })) {
      expect(titulo.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("resultado del borrado", () => {
  it("el toast dice la existencia resultante y los gastos que se fueron", () => {
    expect(
      mensajeExito({ gastos_eliminados: 1, stock_resultante: 121 }, "pzas"),
    ).toBe("Movimiento eliminado · existencia: 121 pzas · 1 gasto de bodega eliminado");
    expect(
      mensajeExito({ gastos_eliminados: 3, stock_resultante: 110 }, null),
    ).toBe(
      "Movimiento eliminado · existencia: 110 unidades · 3 gastos de bodega eliminados",
    );
    expect(mensajeExito({ gastos_eliminados: 0, stock_resultante: 110 }, "pzas")).toBe(
      "Movimiento eliminado · existencia: 110 pzas",
    );
  });

  it("404 sin código estable = API sin desplegar, y se dice así", () => {
    expect(esApiSinBaja({ status: 404, error: "Cannot DELETE /v1/inventory/…" })).toBe(
      true,
    );
    expect(mensajeErrorEliminacion({ status: 404 })).toBe(MENSAJE_API_VIEJO);
  });

  it("404 CON código del servicio = el movimiento ya no está", () => {
    const res = { status: 404, code: "MOVIMIENTO_NO_EXISTE", error: "no encontrado" };
    expect(esApiSinBaja(res)).toBe(false);
    expect(mensajeErrorEliminacion(res)).toContain("ya no existe");
  });

  it("409 y 503 se pintan con el MENSAJE del API (dice qué hacer)", () => {
    expect(
      mensajeErrorEliminacion({
        status: 409,
        code: "STOCK_NEGATIVO",
        error: "elimina primero la SALIDA de 1 del 29 ago 2026 a XA-VGV",
      }),
    ).toBe("elimina primero la SALIDA de 1 del 29 ago 2026 a XA-VGV");
    expect(
      mensajeErrorEliminacion({
        status: 503,
        code: "MIGRACION_PENDIENTE",
        error: "…falta aplicar la migración 20260921000001. No se eliminó nada.",
      }),
    ).toContain("20260921000001");
  });

  it("403 explica el rol; sin mensaje queda un texto genérico", () => {
    expect(mensajeErrorEliminacion({ status: 403 })).toContain("ADMIN");
    expect(mensajeErrorEliminacion({ status: 500 })).toBe(
      "No se pudo eliminar el movimiento.",
    );
  });
});

describe("historial de eliminados", () => {
  const fila: MovimientoEliminado = {
    id: "aud-1",
    movimiento_id: "mov-1",
    tipo: "SALIDA",
    cantidad: 10,
    fecha_movimiento: "2026-08-29",
    aeronave_matricula: "XA-VGV",
    motivo: "Se capturó por error el 29 de agosto: la salida nunca ocurrió.",
    eliminado_por_nombre: "Ana Pérez",
    eliminado_at: "2026-09-21T19:03:00.000Z",
    gastos_eliminados: 1,
    monto_gastos: 3500,
    moneda_gastos: "MXN",
  };

  it("resume el movimiento borrado", () => {
    expect(tituloHistorial(3)).toBe("Movimientos eliminados (3)");
    expect(resumenEliminado(fila, "pzas")).toBe("SALIDA de 10 pzas · 29 ago 2026 · XA-VGV");
  });

  it("dice QUIÉN y CUÁNDO en hora de Cancún (19:03 UTC = 14:03, no 19:03)", () => {
    const texto = autorEliminado(fila);
    expect(texto.startsWith("Ana Pérez · 21 sep")).toBe(true);
    expect(texto).toContain("2026");
    // La hora es la de Cancún (UTC−5). El nombre corto del mes y el formato
    // de 12 h los pone Intl (varían con la versión de ICU): aquí solo se
    // exige que NO se cuele la hora UTC.
    expect(texto).toMatch(/2:03/);
    expect(texto).not.toMatch(/7:03/);
  });

  it("sin nombre del autor no se inventa uno", () => {
    expect(autorEliminado({ ...fila, eliminado_por_nombre: null })).toContain(
      "Usuario no identificado",
    );
  });

  it("los gastos eliminados van con su moneda; sin monto solo el conteo", () => {
    expect(gastosEliminadosTxt(fila)).toBe("1 gasto · $3,500.00 MXN");
    expect(gastosEliminadosTxt({ ...fila, gastos_eliminados: 0, monto_gastos: null })).toBe(
      "Sin gastos ligados",
    );
    expect(
      gastosEliminadosTxt({ ...fila, gastos_eliminados: 2, monto_gastos: null }),
    ).toBe("2 gastos");
  });
});
