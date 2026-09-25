import { describe, expect, it } from "vitest";
import {
  AVISO_SIN_COSTO_VIGENTE,
  BOTON_CONFIRMAR_COSTO,
  CODIGO_ENTRADA_CON_SALIDAS,
  HINT_TC_OPCIONAL,
  ID_PLEGABLE_CARDEX,
  NOTA_FICHA_API_PREVIO,
  SIN_VENTAS,
  TITULO_DINERO,
  TITULO_EDITAR_COSTO,
  TOAST_COSTO_ACTUALIZADO,
  abrePorHash,
  avisoEditarCosto,
  avisoEditarCostoSinCargo,
  confirmacionDeConflicto,
  decidirGuardarCosto,
  dineroGeneradoDeTotales,
  fmtPrecioUnitario,
  lineaSalidaDependiente,
  lineaUsdOriginal,
  notaFicha,
  partirDescripcion,
  piezasDineroGenerado,
  resumenPlegableCardex,
  resumenPlegableEmpaques,
  salidasDeConflicto,
  subTcCompra,
  tcQueViaja,
  textoAvisoSalida,
  textoBajoMinimo,
  textoBandaSinTc,
  textoCargadoACosto,
  textoDineroACosto,
  textoDineroGenerado,
  textoPrecioVigente,
  textoTc,
  textoUtilidadUsdSinTc,
} from "../inventario-ficha";

/**
 * Ficha SENCILLA del producto (25-sep-2026, API 0.0.36). Casos REALES de
 * prod: «Aceite mineral aeronáutico SAE 50» (la captura del cliente) y el
 * aceite 15W-50 tras la migración de T.C. (contrato §6.4): compras 13-jul 30
 * × $1,658.33 MXN (T.C. 17.51) y 29-ago 120 × $21.25 USD (T.C. 17.0115 ⇒
 * $43,379.33 MXN, precio vigente); ventas del 01-sep al T.C. 17.0077.
 */

const DESC_SAE50 =
  "Aceite monogrado de motor de pistón. Uso en asentamiento de cilindros y operación en clima cálido. Aeronave/uso: C205 / T206 / T206H / Seneca V.";

describe("formatos de la ficha", () => {
  it("precio unitario de 2 a 4 decimales, SIEMPRE con moneda (nunca 1 decimal)", () => {
    expect(fmtPrecioUnitario(26.5625, "USD")).toBe("$26.5625 USD");
    expect(fmtPrecioUnitario(21.25, "USD")).toBe("$21.25 USD");
    expect(fmtPrecioUnitario(1658.33, "MXN")).toBe("$1,658.33 MXN");
    expect(fmtPrecioUnitario(37.5, "USD")).toBe("$37.50 USD");
    expect(fmtPrecioUnitario(undefined, "MXN")).toBe("—");
  });

  it("T.C. con fmtTc (hasta 6 decimales sin ceros de cola)", () => {
    expect(textoTc(17.0115)).toBe("T.C. 17.0115");
    expect(textoTc("17.5100")).toBe("T.C. 17.51");
    expect(textoTc(null)).toBeNull();
    expect(subTcCompra("USD", 17.0115)).toBe("T.C. 17.0115");
    expect(subTcCompra("MXN", 17.51)).toBe("T.C. 17.51 (captura en pesos)");
    expect(subTcCompra("USD", null)).toBeNull();
  });
});

describe("partirDescripcion · la descripción REAL del SAE 50", () => {
  it("parte en «Aeronave/uso:» y deja la descripción COMPLETA", () => {
    expect(partirDescripcion(DESC_SAE50)).toEqual({
      texto:
        "Aceite monogrado de motor de pistón. Uso en asentamiento de cilindros y operación en clima cálido.",
      aeronaveUso: "C205 / T206 / T206H / Seneca V",
    });
  });

  it("sin marcador todo es texto; sin acentos ni mayúsculas también parte", () => {
    expect(partirDescripcion("Filtro de aceite.")).toEqual({ texto: "Filtro de aceite.", aeronaveUso: null });
    expect(partirDescripcion("Tubo. AERONAVE / USO : Cessna 206")).toEqual({
      texto: "Tubo.",
      aeronaveUso: "Cessna 206",
    });
    expect(partirDescripcion(null)).toEqual({ texto: "", aeronaveUso: null });
    expect(partirDescripcion("Aeronave/uso:   ")).toEqual({ texto: "", aeronaveUso: null });
  });
});

describe("precio vigente (último precio de compra)", () => {
  const pv = {
    movimiento_id: "a614e7af-6b74-4f97-8a34-1277c97ffcf0",
    fecha: "2026-08-29",
    moneda: "USD" as const,
    unitario: 21.25,
    unitario_usd: 21.25,
    unitario_mxn: null,
    tc_compra: 17.0115,
    unitario_mxn_hoy: 375.55,
    siguiente_salida: { venta_unitaria: 26.5625, moneda: "USD" as const, origen: "MARGEN" as const },
  };

  it("aceite 15W-50: la siguiente salida se cobra al último precio + 25 %", () => {
    expect(textoPrecioVigente(pv, 25)).toBe(
      "Precio vigente $21.25 USD · la siguiente salida se cobra a $26.5625 USD (+25 %)",
    );
  });

  it("ejemplo del cliente: compra de septiembre a 30 USD ⇒ la siguiente salida a $37.50 USD", () => {
    expect(
      textoPrecioVigente(
        {
          ...pv,
          unitario: 30,
          siguiente_salida: { venta_unitaria: 37.5, moneda: "USD", origen: "MARGEN" },
        },
        25,
      ),
    ).toBe("Precio vigente $30.00 USD · la siguiente salida se cobra a $37.50 USD (+25 %)");
  });

  it("precio fijo del producto · a costo · sin siguiente salida · sin precio", () => {
    expect(
      textoPrecioVigente({
        ...pv,
        siguiente_salida: { venta_unitaria: 350, moneda: "MXN", origen: "PRECIO_PRODUCTO" },
      }),
    ).toBe("Precio vigente $21.25 USD · la siguiente salida se cobra a su precio de venta $350.00 MXN");
    expect(
      textoPrecioVigente({ ...pv, siguiente_salida: { venta_unitaria: 21.25, moneda: "USD", origen: "A_COSTO" } }),
    ).toBe("Precio vigente $21.25 USD · la siguiente salida se cobra a costo ($21.25 USD, sin utilidad)");
    expect(textoPrecioVigente({ ...pv, siguiente_salida: null })).toBe("Precio vigente $21.25 USD");
    // Forma real del API: el objeto siempre viaja; sin precio calculable, solo el vigente.
    expect(
      textoPrecioVigente({ ...pv, siguiente_salida: { venta_unitaria: null, moneda: null, origen: "A_COSTO" } }),
    ).toBe("Precio vigente $21.25 USD");
    expect(textoPrecioVigente(null)).toBeNull();
  });
});

describe("dinero generado por este producto", () => {
  const aceite = {
    vendido_mxn: 16263.61,
    costo_mxn: 13010.89,
    utilidad_mxn: 3252.72,
    vendido_usd_original: 956.25,
    utilidad_usd_original: 191.25,
    unidades_vendidas: 36,
    cargado_a_costo_mxn: 49749.9,
    unidades_a_costo: 30,
    ventas_sin_utilidad: 0,
    utilidad_usd_sin_tc: null,
  };

  it("renglón destacado del aceite 15W-50 (contrato §6.4)", () => {
    expect(TITULO_DINERO).toBe("Dinero generado por este producto");
    expect(textoDineroGenerado(aceite)).toBe("Vendido $16,263.61 MXN · Utilidad +$3,252.72 MXN");
    expect(piezasDineroGenerado(aceite).map((p) => p.tono)).toEqual(["neutro", "positivo"]);
    expect(lineaUsdOriginal(aceite.vendido_usd_original, aceite.utilidad_usd_original)).toBe(
      "En dólares: vendido $956.25 USD · utilidad +$191.25 USD (al T.C. de cada venta)",
    );
    expect(textoDineroACosto(aceite.cargado_a_costo_mxn, aceite.unidades_a_costo)).toBe(
      "Además se cargaron $49,749.90 MXN a costo (30 unidades, sin utilidad).",
    );
  });

  it("sin ventas lo dice; pérdida en rojo; nada en dólares ⇒ sin línea", () => {
    expect(textoDineroGenerado({ vendido_mxn: null, utilidad_mxn: null })).toBe(SIN_VENTAS);
    expect(piezasDineroGenerado({ vendido_mxn: 100, utilidad_mxn: -12.5 })[1]).toEqual({
      etiqueta: "Utilidad",
      monto: "−$12.50 MXN",
      tono: "negativo",
    });
    expect(lineaUsdOriginal(null, null)).toBeNull();
    expect(textoDineroACosto(null, 3)).toBeNull();
  });

  it("API PREVIO (sin el bloque): se arma con los totales, los dólares sin T.C. aparte", () => {
    const d = dineroGeneradoDeTotales({
      ventas_mxn: null,
      costo_ventas_mxn: null,
      utilidad_mxn: null,
      ventas_cant: 36,
      ventas_a_costo_mxn: 49749.9,
      utilidad_usd: 191.25,
      ventas_sin_utilidad: 0,
    });
    expect(d.vendido_mxn).toBeNull();
    expect(d.utilidad_usd_sin_tc).toBe(191.25);
    expect(textoUtilidadUsdSinTc(d.utilidad_usd_sin_tc)).toBe(
      "Utilidad en ventas sin tipo de cambio: +$191.25 USD (en dólares, no se suma a los pesos).",
    );
  });
});

describe("pies y avisos de las tablas", () => {
  it("cargado a costo: unidades del API; con uno previo, las salidas (nada se inventa)", () => {
    expect(textoCargadoACosto(49749.9, { unidades: 30, unidad: "cuarto (qt)" })).toBe(
      "+ $49,749.90 MXN cargados a costo (30 cuarto (qt))",
    );
    expect(textoCargadoACosto(49749.9, { unidades: null, salidas: 3 })).toBe(
      "+ $49,749.90 MXN cargados a costo (3 salidas)",
    );
    expect(textoCargadoACosto(null, { unidades: 30 })).toBeNull();
  });

  it("«bajo el mínimo» SOLO con bajo_stock (único rastro de la tira de KPIs)", () => {
    expect(textoBajoMinimo(true, 30)).toBe("bajo el mínimo (mín. 30)");
    expect(textoBajoMinimo(true, null)).toBe("bajo el mínimo");
    expect(textoBajoMinimo(false, 30)).toBeNull();
    expect(textoBajoMinimo(undefined, 30)).toBeNull();
  });

  it("banda naranja SOLO si quedan movimientos sin T.C. (y sin afirmar la causa)", () => {
    expect(textoBandaSinTc(0)).toBeNull();
    expect(textoBandaSinTc(undefined)).toBeNull();
    expect(textoBandaSinTc(1)).toBe(
      "1 movimiento en dólares todavía no tiene tipo de cambio: sus pesos quedan fuera de los totales (su utilidad se ve en dólares, aparte).",
    );
    expect(textoBandaSinTc(77)).toContain("77 movimientos en dólares todavía no tienen tipo de cambio");
    expect(textoBandaSinTc(77)).not.toMatch(/no había/i);
  });

  it("nota al pie: T.C. del día (el de las cotizaciones) y último precio; jamás «FIFO»", () => {
    expect(notaFicha(25)).toBe(
      "Montos en pesos. Las compras y ventas en dólares se convierten con el tipo de cambio oficial de su día (el mismo de las cotizaciones). Utilidad = lo cobrado al avión − el costo de la pieza (último precio de compra vigente el día de la salida). Toda salida sin precio se cobra a ese costo + 25 % (se cambia en Configuración).",
    );
    expect(notaFicha(25)).not.toMatch(/FIFO/);
    // Con un API previo el costo SÍ era FIFO: es el único texto que lo dice.
    expect(NOTA_FICHA_API_PREVIO).toContain("FIFO");
  });
});

describe("plegables CERRADOS (Empaques y fotos · Cardex completo)", () => {
  it("resúmenes junto al título", () => {
    expect(resumenPlegableEmpaques(2, 3)).toBe("2 empaques · 3 fotos");
    expect(resumenPlegableEmpaques(1, 1)).toBe("1 empaque · 1 foto");
    expect(resumenPlegableEmpaques(0, 0)).toBe("Sin empaques · sin fotos");
    expect(resumenPlegableCardex(14)).toBe(
      "14 movimientos · aquí se corrige un costo o se elimina un movimiento",
    );
    expect(resumenPlegableCardex(1)).toContain("1 movimiento ·");
  });

  it("`#cardex` abre el cardex (al montar y en `hashchange`)", () => {
    expect(abrePorHash("#cardex", ID_PLEGABLE_CARDEX)).toBe(true);
    expect(abrePorHash("cardex", "cardex")).toBe(true);
    expect(abrePorHash("#empaques-fotos", "cardex")).toBe(false);
    expect(abrePorHash("", "cardex")).toBe(false);
    expect(abrePorHash(null, "cardex")).toBe(false);
    expect(abrePorHash("#%E0%A4%A", "cardex")).toBe(false);
  });
});

describe("«Corregir el costo de la compra» (D7: reconocer las salidas)", () => {
  it("textos", () => {
    expect(TITULO_EDITAR_COSTO).toBe("Corregir el costo de la compra");
    expect(BOTON_CONFIRMAR_COSTO).toBe("Guardar de todos modos");
    expect(HINT_TC_OPCIONAL).toBe("Vacío = T.C. oficial del día de la compra (el mismo de las cotizaciones).");
    expect(TOAST_COSTO_ACTUALIZADO).toBe(
      "Costo actualizado · el valorizado y las siguientes salidas ya usan este precio",
    );
    expect(avisoEditarCosto(2)).toBe(
      "Este precio ya se usó en 2 salidas: conservan su costo y lo que se cobró al avión. El precio nuevo aplica a la existencia y a las siguientes salidas. Si alguna salida se cobró mal, elimínala y vuelve a capturarla.",
    );
    expect(avisoEditarCosto(1)).toContain("en 1 salida:");
    expect(avisoEditarCostoSinCargo(0)).toBeNull();
    expect(avisoEditarCostoSinCargo(2)).toBe(
      "2 de esas salidas salieron a costo $0 y NO se cobraron al avión: completar este costo no las cobra. Para cobrarlas, elimínalas y vuelve a capturarlas.",
    );
    expect(avisoEditarCostoSinCargo(1)).toContain("1 de esas salidas salió a costo $0 y NO se cobró");
  });

  it("primer «Guardar» con salidas ⇒ NO envía (recuadro); confirmado ⇒ envía con el flag", () => {
    expect(decidirGuardarCosto({ salidasConEstePrecio: 2, salidasSinCargo: 1, confirmado: false })).toEqual({
      tipo: "CONFIRMAR",
      confirmacion: { n: 2, sinCargo: 1, salidas: [] },
    });
    expect(decidirGuardarCosto({ salidasConEstePrecio: 2, confirmado: true })).toEqual({
      tipo: "ENVIAR",
      confirmar: true,
    });
    // Sin salidas (o sin el dato: lista de pendientes / API previo) ⇒ envía sin flag.
    expect(decidirGuardarCosto({ salidasConEstePrecio: 0, confirmado: false })).toEqual({
      tipo: "ENVIAR",
      confirmar: false,
    });
    expect(decidirGuardarCosto({ confirmado: false })).toEqual({ tipo: "ENVIAR", confirmar: false });
  });

  it("409 ENTRADA_CON_SALIDAS ⇒ el MISMO recuadro con la lista del API", () => {
    const details = {
      salidas: [
        {
          id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
          fecha: "2026-09-01",
          cantidad: 12,
          costo_unitario: 21.25,
          moneda: "USD",
          sin_cargo: false,
          vendido_a: "XA-VGV",
        },
        {
          id: "s2",
          fecha: "2026-09-03",
          cantidad: "2",
          costo_unitario: 0,
          moneda: "USD",
          sin_cargo: true,
          vendido_a: "FLOTA",
        },
        { id: 3, basura: true },
      ],
    };
    const c = confirmacionDeConflicto({ status: 409, code: CODIGO_ENTRADA_CON_SALIDAS, details });
    expect(c?.n).toBe(2);
    expect(c?.sinCargo).toBe(1);
    expect(lineaSalidaDependiente(c!.salidas[0], "qt")).toBe(
      "01 sep 2026 · 12 qt · XA-VGV · costo $21.25 USD",
    );
    expect(lineaSalidaDependiente(c!.salidas[1])).toBe(
      "03 sep 2026 · 2 unidades · toda la flota · sin cargo ($0)",
    );
    // Otro 409 (nace de una compra) no abre el recuadro.
    expect(confirmacionDeConflicto({ status: 409, code: "MOVIMIENTO_DE_COMPRA" })).toBeNull();
    expect(salidasDeConflicto(null)).toEqual([]);
  });
});

describe("aviso de la SALIDA (API 0.0.36)", () => {
  it("SIN_COSTO_VIGENTE se traduce; un texto del API va tal cual; un código desconocido no se pinta crudo", () => {
    expect(textoAvisoSalida("SIN_COSTO_VIGENTE")).toBe(AVISO_SIN_COSTO_VIGENTE);
    // El texto que redacta el API gana (fuente única de la redacción).
    expect(textoAvisoSalida("SIN_COSTO_VIGENTE", "Texto del API.")).toBe("Texto del API.");
    expect(textoAvisoSalida("La salida se registró a costo $0.")).toBe("La salida se registró a costo $0.");
    expect(textoAvisoSalida("OTRO_CODIGO")).toBeNull();
    expect(textoAvisoSalida(null)).toBeNull();
  });
});

describe("T.C. que viaja al API: solo el que estaba a la vista (pesos)", () => {
  it("entrada en PESOS: el T.C. tecleado viaja; vacío = el oficial del día (lo pone el API)", () => {
    expect(tcQueViaja({ tipo: "ENTRADA", moneda: "MXN", tc: "17.51" })).toBe("17.51");
    expect(tcQueViaja({ tipo: "ENTRADA", moneda: "MXN", tc: "" })).toBe("");
    expect(tcQueViaja({ tipo: "DEVOLUCION", moneda: "MXN", tc: "17.2" })).toBe("17.2");
    // «Corregir el costo» (siempre ENTRADA, sin tipo en el formulario).
    expect(tcQueViaja({ moneda: "MXN", tc: "17.0115" })).toBe("17.0115");
  });

  it("en DÓLARES el campo está oculto: un T.C. que quedó de teclear en pesos NO se cuela", () => {
    // Tecleó 18.50 en pesos y cambió a USD: la nota promete el oficial del día.
    expect(tcQueViaja({ tipo: "ENTRADA", moneda: "USD", tc: "18.50" })).toBe("");
    expect(tcQueViaja({ moneda: "USD", tc: "17.0115" })).toBe("");
  });

  it("SALIDA: nunca (el API usa el T.C. oficial del día de la venta)", () => {
    expect(tcQueViaja({ tipo: "SALIDA", moneda: "MXN", tc: "18.50" })).toBe("");
  });
});
