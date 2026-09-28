/**
 * Alta de producto con la ENTRADA INICIAL sin costo (28-sep-2026). Pedido del
 * cliente: «me ayudas a poder agregar productos sin costo ya que lo tenemos
 * como pendiente, pero necesitamos ingresarlo a la bodega».
 *
 * Reglas que se congelan aquí:
 *  - sin costo (vacío o 0) con cantidad ⇒ COSTO_PENDIENTE (el formulario PIDE
 *    confirmación: nunca es silencioso);
 *  - con costo pendiente el T.C. NO se exige y el movimiento viaja como
 *    `moneda: "USD", costo_unitario_usd: 0` (sin pesos ni T.C.), como la
 *    carga masiva;
 *  - con costo > 0 NADA cambia (payload de siempre, MXN exige T.C., costo sin
 *    cantidad avisa).
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_COSTO_PENDIENTE,
  AYUDA_COSTO_PENDIENTE,
  BOTON_CAPTURAR_COSTO,
  BOTON_REGISTRAR_SIN_COSTO,
  DONDE_COMPLETAR_COSTO,
  HINT_COSTO_ENTRADA_PENDIENTE,
  MSG_CANTIDAD_INVALIDA,
  MSG_COSTO_EN_CERO,
  MSG_COSTO_INVALIDO,
  MSG_COSTO_SIN_CANTIDAD,
  MSG_TC_INICIAL,
  NOTA_ENTRADA_INICIAL,
  TITULO_CONFIRMAR_SIN_COSTO,
  clasificarCostoEntrada,
  costoQuedaPendiente,
  costoSeGuardariaEnCero,
  decidirEntradaInicial,
  textoConfirmarEntradaSinCosto,
  textoConfirmarSinCosto,
  textoEntradaRegistradaSinCosto,
  textoProductoCreadoSinCosto,
  textoUnidades,
  tieneCostoVigenteDe,
} from "../inventario-entrada-inicial";

describe("decidirEntradaInicial · sin costo = costo PENDIENTE (pide confirmación)", () => {
  it("cantidad con el costo VACÍO ⇒ COSTO_PENDIENTE con USD 0 (sin pesos ni T.C.)", () => {
    const d = decidirEntradaInicial({ cantidad: "12", costo: "", moneda: "MXN", tc: "" });
    expect(d).toEqual({
      tipo: "COSTO_PENDIENTE",
      cantidad: 12,
      movimiento: { tipo: "ENTRADA", cantidad: "12", moneda: "USD", costo_unitario_usd: 0 },
    });
  });

  it("costo en 0 tecleado ⇒ también pendiente (mismo payload)", () => {
    for (const costo of ["0", "0.00", " 0 "]) {
      const d = decidirEntradaInicial({ cantidad: "3", costo, moneda: "USD", tc: "" });
      expect(d.tipo).toBe("COSTO_PENDIENTE");
      if (d.tipo === "COSTO_PENDIENTE") {
        expect(d.movimiento).toEqual({
          tipo: "ENTRADA",
          cantidad: "3",
          moneda: "USD",
          costo_unitario_usd: 0,
        });
      }
    }
  });

  it("con costo pendiente el T.C. NO se exige ni viaja, aunque la moneda sea MXN y el T.C. se haya tecleado", () => {
    const sinTc = decidirEntradaInicial({ cantidad: "5", costo: "", moneda: "MXN", tc: "" });
    expect(sinTc.tipo).toBe("COSTO_PENDIENTE");
    const conTc = decidirEntradaInicial({ cantidad: "5", costo: "", moneda: "MXN", tc: "17.5" });
    expect(conTc.tipo).toBe("COSTO_PENDIENTE");
    if (conTc.tipo === "COSTO_PENDIENTE") {
      expect(conTc.movimiento).not.toHaveProperty("tc_usd_mxn");
      expect(conTc.movimiento).not.toHaveProperty("costo_unitario_mxn");
      expect(conTc.movimiento.moneda).toBe("USD");
    }
  });

  it("cantidades con decimales (litros) se conservan tal cual se capturaron", () => {
    const d = decidirEntradaInicial({ cantidad: "2.5", costo: "", moneda: "MXN" });
    expect(d.tipo).toBe("COSTO_PENDIENTE");
    if (d.tipo === "COSTO_PENDIENTE") {
      expect(d.cantidad).toBe(2.5);
      expect(d.movimiento.cantidad).toBe("2.5");
    }
  });

  it("costoQuedaPendiente = el aviso en línea del formulario", () => {
    expect(costoQuedaPendiente({ cantidad: "4", costo: "", moneda: "MXN" })).toBe(true);
    expect(costoQuedaPendiente({ cantidad: "4", costo: "10", moneda: "USD" })).toBe(false);
    expect(costoQuedaPendiente({ cantidad: "", costo: "", moneda: "MXN" })).toBe(false);
    expect(costoQuedaPendiente({ cantidad: "0", costo: "", moneda: "MXN" })).toBe(false);
  });
});

describe("decidirEntradaInicial · con costo > 0 todo sigue como hoy", () => {
  it("USD ⇒ costo_unitario_usd con lo tecleado, sin T.C.", () => {
    expect(decidirEntradaInicial({ cantidad: "30", costo: "110", moneda: "USD", tc: "" })).toEqual({
      tipo: "CON_COSTO",
      cantidad: 30,
      movimiento: { tipo: "ENTRADA", cantidad: "30", moneda: "USD", costo_unitario_usd: "110" },
    });
  });

  it("MXN con T.C. ⇒ costo_unitario_mxn + tc_usd_mxn (los pesos son nativos)", () => {
    expect(
      decidirEntradaInicial({ cantidad: "6", costo: "350", moneda: "MXN", tc: "17.5" }),
    ).toEqual({
      tipo: "CON_COSTO",
      cantidad: 6,
      movimiento: {
        tipo: "ENTRADA",
        cantidad: "6",
        moneda: "MXN",
        costo_unitario_mxn: "350",
        tc_usd_mxn: "17.5",
      },
    });
  });

  it("MXN SIN T.C. ⇒ el mismo error de siempre (no se crea nada)", () => {
    for (const tc of ["", "0", undefined, null]) {
      expect(
        decidirEntradaInicial({ cantidad: "6", costo: "350", moneda: "MXN", tc }),
      ).toEqual({ tipo: "ERROR", mensaje: MSG_TC_INICIAL });
    }
    expect(MSG_TC_INICIAL).toBe("Captura el tipo de cambio (MXN por USD) de la compra inicial.");
  });

  it("costo > 0 SIN cantidad ⇒ avisa como hoy", () => {
    for (const cantidad of ["", "0", undefined]) {
      expect(
        decidirEntradaInicial({ cantidad, costo: "120", moneda: "USD" }),
      ).toEqual({ tipo: "ERROR", mensaje: MSG_COSTO_SIN_CANTIDAD });
    }
    expect(MSG_COSTO_SIN_CANTIDAD).toBe(
      "Captura cuántas piezas entran (cantidad inicial) o borra el costo.",
    );
  });

  it("nada capturado ⇒ el producto nace sin entrada (stock 0), sin preguntar", () => {
    expect(decidirEntradaInicial({ cantidad: "", costo: "", moneda: "MXN", tc: "" })).toEqual({
      tipo: "NINGUNA",
    });
    expect(decidirEntradaInicial({ moneda: "USD" })).toEqual({ tipo: "NINGUNA" });
    expect(decidirEntradaInicial({ cantidad: "0", costo: "0", moneda: "MXN" })).toEqual({
      tipo: "NINGUNA",
    });
  });
});

describe("decidirEntradaInicial · lo que no es un número no se vuelve «pendiente»", () => {
  it("costo negativo o ilegible ⇒ error (jamás cae a costo pendiente en silencio)", () => {
    for (const costo of ["-5", "abc"]) {
      expect(decidirEntradaInicial({ cantidad: "2", costo, moneda: "USD" })).toEqual({
        tipo: "ERROR",
        mensaje: MSG_COSTO_INVALIDO,
      });
    }
  });

  it("cantidad negativa o ilegible ⇒ error (antes se ignoraba sin decir nada)", () => {
    for (const cantidad of ["-3", "x"]) {
      expect(decidirEntradaInicial({ cantidad, costo: "", moneda: "USD" })).toEqual({
        tipo: "ERROR",
        mensaje: MSG_CANTIDAD_INVALIDA,
      });
    }
  });
});

describe("textos de la confirmación y del aviso", () => {
  it("título y botones exactos del diseño", () => {
    expect(TITULO_CONFIRMAR_SIN_COSTO).toBe("¿Registrar la entrada sin costo?");
    expect(BOTON_REGISTRAR_SIN_COSTO).toBe("Registrar sin costo");
    expect(BOTON_CAPTURAR_COSTO).toBe("Capturar el costo");
  });

  it("cuerpo: N unidades, costo PENDIENTE, salidas a $0 (y así se quedan) y dónde se completa", () => {
    expect(textoConfirmarSinCosto(12)).toBe(
      "La pieza entra a bodega con 12 unidades y el costo queda PENDIENTE. " +
        "Mientras no lo captures, las salidas de esta pieza se cobran a $0 (sin cargo al avión) " +
        "y así se quedan aunque después captures el costo; la pieza tampoco cuenta en el " +
        "valorizado. Lo completas después desde la ficha del producto («Cardex completo» → " +
        "«Editar costo») o con «Completar costo» en el aviso de entradas sin costo de Inventario.",
    );
  });

  it("fiel al API: completar el costo NO cobra las salidas ya hechas (su costo queda congelado)", () => {
    // `TEXTOS_INVENTARIO.sinCostoVigente` del API: «esta se queda sin cargo».
    expect(textoConfirmarSinCosto(3)).toContain("así se quedan aunque después captures el costo");
    expect(textoConfirmarSinCosto(3, true)).toContain(
      "conservan ese costo $0 aunque después lo captures",
    );
  });

  it("fiel al panel: «Editar costo» vive en el cardex de la ficha, no en «Compras»", () => {
    // El bloque COMPRAS de la ficha solo trae la banda «Abrir el cardex para
    // corregir el costo»; el botón de la portada dice «Completar costo».
    expect(DONDE_COMPLETAR_COSTO).not.toContain("Compras →");
    expect(DONDE_COMPLETAR_COSTO).toContain("«Cardex completo» → «Editar costo»");
    expect(DONDE_COMPLETAR_COSTO).toContain("«Completar costo»");
    expect(textoConfirmarSinCosto(1)).toContain(DONDE_COMPLETAR_COSTO);
  });

  it("con precio de venta propio NO promete «sin cargo al avión» (el API sí carga ese precio)", () => {
    const t = textoConfirmarSinCosto(4, true);
    expect(t).not.toContain("sin cargo al avión");
    expect(t).toContain("al avión se le carga solo el precio de venta del producto");
    expect(t).toContain("costo queda PENDIENTE");
  });

  it("unidades en es-MX: singular, miles y decimales", () => {
    expect(textoUnidades(1)).toBe("1 unidad");
    expect(textoUnidades(2)).toBe("2 unidades");
    expect(textoUnidades(2.5)).toBe("2.5 unidades");
    expect(textoUnidades(1200)).toBe("1,200 unidades");
    expect(textoConfirmarSinCosto(1)).toContain("con 1 unidad y el costo");
  });

  it("toast al terminar", () => {
    expect(textoProductoCreadoSinCosto(12)).toBe(
      "Producto creado con 12 unidades. Costo pendiente: complétalo en la ficha del producto.",
    );
  });

  it("la ayuda dice que el costo puede quedar pendiente; la nota del cardex no cambia", () => {
    expect(AYUDA_COSTO_PENDIENTE).toMatch(/costo queda pendiente/);
    expect(AVISO_COSTO_PENDIENTE).toMatch(/pendiente/);
    expect(NOTA_ENTRADA_INICIAL).toBe("Stock inicial (alta del ítem)");
  });
});

describe("un costo > 0 que se guardaría en $0 NO entra «con costo» (revisión adversaria)", () => {
  // `costo_unitario_usd` es numeric(14,4) y el API convierte pesos con
  // round(mxn / tc, 4): «0.00001» entraba SIN costo y SIN confirmación.
  it("USD por debajo de 0.00005 ⇒ error, jamás CON_COSTO", () => {
    for (const costo of ["0.00001", "0.00004"]) {
      expect(decidirEntradaInicial({ cantidad: "2", costo, moneda: "USD" })).toEqual({
        tipo: "ERROR",
        mensaje: MSG_COSTO_EN_CERO,
      });
    }
    // 0.00005 redondea a 0.0001: se guarda con costo.
    expect(decidirEntradaInicial({ cantidad: "2", costo: "0.00005", moneda: "USD" }).tipo).toBe(
      "CON_COSTO",
    );
    expect(decidirEntradaInicial({ cantidad: "2", costo: "0.01", moneda: "USD" }).tipo).toBe(
      "CON_COSTO",
    );
  });

  it("MXN que dividido entre el T.C. da $0.0000 USD ⇒ error; un costo real en pesos pasa", () => {
    expect(decidirEntradaInicial({ cantidad: "2", costo: "0.0005", moneda: "MXN", tc: "17.5" })).toEqual(
      { tipo: "ERROR", mensaje: MSG_COSTO_EN_CERO },
    );
    expect(decidirEntradaInicial({ cantidad: "2", costo: "0.5", moneda: "MXN", tc: "17.5" }).tipo).toBe(
      "CON_COSTO",
    );
    // Sin T.C. manda el aviso de siempre (el T.C. se exige antes que nada).
    expect(decidirEntradaInicial({ cantidad: "2", costo: "0.5", moneda: "MXN", tc: "" })).toEqual({
      tipo: "ERROR",
      mensaje: MSG_TC_INICIAL,
    });
  });

  it("costoSeGuardariaEnCero: 0 o negativo no es «en cero» (eso es pendiente/error aparte)", () => {
    expect(costoSeGuardariaEnCero(0, "USD")).toBe(false);
    expect(costoSeGuardariaEnCero(-1, "USD")).toBe(false);
    expect(costoSeGuardariaEnCero(0.00001, "USD")).toBe(true);
    expect(costoSeGuardariaEnCero(0.0005, "MXN", 17.5)).toBe(true);
    // Sin T.C. (el API usará el oficial) solo se frena lo que ya es 0 en pesos.
    expect(costoSeGuardariaEnCero(0.0005, "MXN", null)).toBe(false);
    expect(costoSeGuardariaEnCero(0.00001, "MXN", null)).toBe(true);
  });

  it("cantidad que la BD guardaría en 0.00 (numeric(12,2), CHECK > 0) ⇒ error ANTES de crear", () => {
    expect(decidirEntradaInicial({ cantidad: "0.004", costo: "", moneda: "USD" })).toEqual({
      tipo: "ERROR",
      mensaje: MSG_CANTIDAD_INVALIDA,
    });
    expect(decidirEntradaInicial({ cantidad: "0.01", costo: "", moneda: "USD" }).tipo).toBe(
      "COSTO_PENDIENTE",
    );
  });
});

describe("clasificarCostoEntrada · la MISMA regla para «Registrar movimiento» → ENTRADA", () => {
  it("vacío o 0 ⇒ PENDIENTE (se pregunta); > 0 ⇒ CON_COSTO; basura/negativo/en cero ⇒ ERROR", () => {
    for (const costo of ["", "0", "0.00", undefined, null, 0]) {
      expect(clasificarCostoEntrada({ costo, moneda: "MXN" })).toEqual({ tipo: "PENDIENTE" });
    }
    expect(clasificarCostoEntrada({ costo: "350", moneda: "MXN", tc: "" })).toEqual({
      tipo: "CON_COSTO",
      costo: 350,
    });
    expect(clasificarCostoEntrada({ costo: "-1", moneda: "USD" })).toEqual({
      tipo: "ERROR",
      mensaje: MSG_COSTO_INVALIDO,
    });
    expect(clasificarCostoEntrada({ costo: "0.00001", moneda: "USD" })).toEqual({
      tipo: "ERROR",
      mensaje: MSG_COSTO_EN_CERO,
    });
  });

  it("texto de la confirmación según lo que el producto YA tenga", () => {
    // Sin ninguna compra con costo: el MISMO texto del alta.
    expect(textoConfirmarEntradaSinCosto(5, { tieneCostoVigente: false })).toBe(
      textoConfirmarSinCosto(5),
    );
    expect(textoConfirmarEntradaSinCosto(5, { tieneCostoVigente: false, conPrecioVenta: true })).toBe(
      textoConfirmarSinCosto(5, true),
    );
    // Con compra con costo: una entrada a $0 no fija precio ⇒ las salidas
    // siguen con el último precio (NUNCA «se cobran a $0»).
    const con = textoConfirmarEntradaSinCosto(5, { tieneCostoVigente: true });
    expect(con).toContain("Entran 5 unidades con el costo PENDIENTE ($0).");
    expect(con).toContain("las salidas siguen usando el último precio de compra");
    expect(con).not.toContain("se cobran a $0");
    // No se sabe (API previo): los dos casos, sin adivinar.
    const nose = textoConfirmarEntradaSinCosto(1);
    expect(nose).toContain("Entran 1 unidad");
    expect(nose).toContain("si el producto ya tiene una compra con costo");
    expect(nose).toContain("si no tiene ninguna, salen a $0 y así se quedan");
    for (const t of [con, nose]) expect(t).toContain(DONDE_COMPLETAR_COSTO);
  });

  it("tieneCostoVigenteDe: null = ninguna, objeto = sí, AUSENTE = no se sabe", () => {
    expect(tieneCostoVigenteDe({ costo_vigente: null })).toBe(false);
    expect(tieneCostoVigenteDe({ costo_vigente: { unitario: 30, moneda: "USD" } })).toBe(true);
    expect(tieneCostoVigenteDe({})).toBeUndefined();
    expect(tieneCostoVigenteDe({ costo_vigente: undefined })).toBeUndefined();
  });

  it("textos del movimiento", () => {
    expect(HINT_COSTO_ENTRADA_PENDIENTE).toMatch(/déjalo vacío/);
    expect(textoEntradaRegistradaSinCosto(3)).toBe(
      "Entrada registrada con 3 unidades. Costo pendiente: complétalo con «Editar costo» en el cardex.",
    );
  });
});
