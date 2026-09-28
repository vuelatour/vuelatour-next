import { describe, expect, it } from "vitest";
import {
  AYUDA_COMISION_VENDEDOR,
  CATEGORIA_GASTO_LABELS,
  CATEGORIA_PAGO_VENDEDOR,
  CATEGORIAS_CAPTURA,
  CATEGORIAS_EMPRESA,
  CATEGORIAS_REPARTIBLES,
  DESTINO_POR_DEFECTO,
  HINT_VUELO_COMISION,
  MSG_GASTO_REQUIERE_VUELO_COMISION,
  VENTANA_VUELOS_COMISION,
  VENTANA_VUELOS_DEFAULT,
  categoriaExigeVueloSiempre,
  categoriaGastoLabel,
  destinoPorDefecto,
  errorVueloObligatorio,
  hojaDestinoGasto,
  iaPuedeCambiarCategoria,
  opcionCategoriaGasto,
} from "@/lib/admin/categorias-gasto";
import { CategoriaEnum, GastoCreateSchema, GastoVerifySchema } from "@/app/admin/expenses/schema";

/**
 * «Comisión del vendedor» como gasto (pedido del cliente, 28-sep-2026): «¿cómo
 * registro el pago de la comisión a Saab para que aparezca en otros
 * movimientos? Si lo capturo como "Otros gastos VuelaTour" queda
 * duplicado». La tabla canónica (etiqueta + destino) es LITERAL del contrato
 * y la MISMA que congela el API (`common/categoria-gasto.util.spec.ts`) y la
 * app: si un texto cambia en un solo lado, este test falla.
 */

const VUELO = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("tabla canónica de COMISION_VENDEDOR (== API == app)", () => {
  it("etiqueta y destino exactos", () => {
    expect(CATEGORIA_PAGO_VENDEDOR).toBe("COMISION_VENDEDOR");
    expect(CATEGORIA_GASTO_LABELS.COMISION_VENDEDOR).toBe("Comisión del vendedor");
    expect(categoriaGastoLabel("COMISION_VENDEDOR")).toBe("Comisión del vendedor");
    expect(destinoPorDefecto("COMISION_VENDEDOR")).toBe(
      "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)",
    );
  });

  it("su destino NO es el de empresa ni el de gasto directo del vuelo", () => {
    const destino = DESTINO_POR_DEFECTO.COMISION_VENDEDOR;
    expect(destino).not.toBe("Otros gastos (Balance general VuelaTour)");
    expect(destino.startsWith("Gastos directos del vuelo")).toBe(false);
  });

  it("opción del selector: etiqueta + destino en verde", () => {
    expect(opcionCategoriaGasto("COMISION_VENDEDOR")).toEqual({
      value: "COMISION_VENDEDOR",
      label: "Comisión del vendedor",
      description: "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)",
      descriptionClassName: expect.stringContaining("text-green-600!"),
    });
  });

  it("se ofrece al capturar, justo después de PILOTO_EXTERNO", () => {
    const i = CATEGORIAS_CAPTURA.indexOf("PILOTO_EXTERNO");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(CATEGORIAS_CAPTURA[i + 1]).toBe("COMISION_VENDEDOR");
    expect(CATEGORIAS_CAPTURA.filter((c) => c === "COMISION_VENDEDOR")).toHaveLength(1);
  });

  it("toda categoría ofrecida tiene etiqueta y destino propios (nada cae al fallback)", () => {
    for (const c of CATEGORIAS_CAPTURA) {
      expect(CATEGORIA_GASTO_LABELS[c], c).toBeTruthy();
      expect(DESTINO_POR_DEFECTO[c], c).toBeTruthy();
    }
  });

  it("NO es repartible (el reparto es de gastos generales SIN vuelo)", () => {
    expect(CATEGORIAS_REPARTIBLES.has("COMISION_VENDEDOR")).toBe(false);
    expect([...CATEGORIAS_REPARTIBLES].sort()).toEqual(
      ["FIJO", "GASOLINA", "INDIRECTO", "NOMINA", "OTRO", "VISITA"],
    );
  });
});

describe("vuelo obligatorio (espejo del 400 GASTO_REQUIERE_VUELO del API)", () => {
  it("solo COMISION_VENDEDOR lo exige para todos los roles", () => {
    expect(categoriaExigeVueloSiempre("COMISION_VENDEDOR")).toBe(true);
    for (const c of Object.keys(CATEGORIA_GASTO_LABELS).filter((c) => c !== "COMISION_VENDEDOR")) {
      expect(categoriaExigeVueloSiempre(c), c).toBe(false);
    }
    expect(categoriaExigeVueloSiempre("")).toBe(false);
  });

  it("mensaje idéntico al del API", () => {
    expect(MSG_GASTO_REQUIERE_VUELO_COMISION).toBe(
      "Esta categoría es del vuelo: elige el vuelo. «Comisión del vendedor» siempre se registra con el vuelo al que pertenece.",
    );
  });

  it("errorVueloObligatorio: sin vuelo ⇒ mensaje; con vuelo ⇒ null; otra categoría ⇒ null", () => {
    expect(errorVueloObligatorio("COMISION_VENDEDOR", "")).toBe(MSG_GASTO_REQUIERE_VUELO_COMISION);
    expect(errorVueloObligatorio("COMISION_VENDEDOR", null)).toBe(MSG_GASTO_REQUIERE_VUELO_COMISION);
    expect(errorVueloObligatorio("COMISION_VENDEDOR", undefined)).toBe(
      MSG_GASTO_REQUIERE_VUELO_COMISION,
    );
    expect(errorVueloObligatorio("COMISION_VENDEDOR", VUELO)).toBeNull();
    expect(errorVueloObligatorio("OTRO", "")).toBeNull();
    expect(errorVueloObligatorio("COMIDA", null)).toBeNull();
  });

  it("hint del campo Vuelo", () => {
    expect(HINT_VUELO_COMISION).toBe(
      "Obligatorio: la comisión se aparea con lo cobrado en ese vuelo. La lista trae los vuelos de los últimos 90 días.",
    );
  });

  it("ventana del selector: la de siempre ±15/100; la de la comisión 90 atrás, 15 adelante, 500 (tope del API)", () => {
    expect(VENTANA_VUELOS_DEFAULT).toEqual({ diasAtras: 15, diasAdelante: 15, limit: 100 });
    expect(VENTANA_VUELOS_COMISION).toEqual({ diasAtras: 90, diasAdelante: 15, limit: 500 });
  });
});

describe("iaPuedeCambiarCategoria: la IA jamás pisa lo que no sabe sugerir", () => {
  it("una comisión elegida a mano NO se cambia", () => {
    expect(iaPuedeCambiarCategoria("COMISION_VENDEDOR", "OPERACIONES")).toBe(false);
    expect(iaPuedeCambiarCategoria("COMISION_VENDEDOR", "OTRO")).toBe(false);
  });

  it("la IA tampoco la propone (un pago al vendedor lo decide la oficina)", () => {
    expect(iaPuedeCambiarCategoria("OPERACIONES", "COMISION_VENDEDOR")).toBe(false);
  });

  it("el caso de siempre sigue igual: la IA llena la categoría del ticket", () => {
    expect(iaPuedeCambiarCategoria("OPERACIONES", "FBO")).toBe(true);
    expect(iaPuedeCambiarCategoria("OTRO", "GAS")).toBe(true);
  });

  it("sin sugerencia no hay nada que cambiar", () => {
    expect(iaPuedeCambiarCategoria("OPERACIONES", null)).toBe(false);
    expect(iaPuedeCambiarCategoria("OPERACIONES", undefined)).toBe(false);
    expect(iaPuedeCambiarCategoria("OPERACIONES", "")).toBe(false);
  });
});

describe("AYUDA_COMISION_VENDEDOR", () => {
  it("explica el apareo, la regla «un gasto por vuelo» y el duplicado", () => {
    expect(AYUDA_COMISION_VENDEDOR).toContain(
      "Se aparea con la comisión cobrada al cliente en la hoja «otros movimientos» del balance general",
    );
    expect(AYUDA_COMISION_VENDEDOR).toContain("reemplaza la PROVISIÓN de ese vuelo");
    expect(AYUDA_COMISION_VENDEDOR).toContain("«faltan» o «excede»");
    expect(AYUDA_COMISION_VENDEDOR).toContain("Registra un gasto por vuelo");
    expect(AYUDA_COMISION_VENDEDOR).toContain("No es costo del avión.");
    expect(AYUDA_COMISION_VENDEDOR).toContain(
      "No la captures como «Otros gastos VuelaTour»: quedaría duplicada.",
    );
  });
});

describe("hojaDestinoGasto: a qué hoja cae CON LO ELEGIDO (sin pistas falsas)", () => {
  const OTROS_GASTOS_SIN_NADA =
    "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)";

  it("COMISION_VENDEDOR ⇒ otros movimientos, con o sin vuelo/avión", () => {
    const esperado =
      "Balance general VuelaTour · Otros movimientos (reemplaza la provisión del pago al vendedor)";
    expect(hojaDestinoGasto("COMISION_VENDEDOR", true, true)).toBe(esperado);
    expect(hojaDestinoGasto("COMISION_VENDEDOR", true, false)).toBe(esperado);
    expect(hojaDestinoGasto("COMISION_VENDEDOR", false, true)).toBe(esperado);
    expect(hojaDestinoGasto("COMISION_VENDEDOR", false, false)).toBe(esperado);
  });

  it("empresa = las 5 del destino «Otros gastos» (sincronizada con el API)", () => {
    const porDestino = Object.entries(DESTINO_POR_DEFECTO)
      .filter(([, d]) => d === "Otros gastos (Balance general VuelaTour)")
      .map(([c]) => c)
      .sort();
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(porDestino);
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(["FIJO", "GASOLINA", "NOMINA", "OTRO", "VISITA"]);
    expect(CATEGORIAS_EMPRESA.has("COMISION_VENDEDOR")).toBe(false);
  });

  it.each(["OTRO", "NOMINA", "GASOLINA", "FIJO", "VISITA"])(
    "%s (empresa) va SIEMPRE a «otros gastos» del general: el vuelo o el avión son referencia",
    (cat) => {
      expect(hojaDestinoGasto(cat, true, true)).toBe(
        "Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia)",
      );
      expect(hojaDestinoGasto(cat, true, false)).toBe(
        "Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia)",
      );
      expect(hojaDestinoGasto(cat, false, true)).toBe(
        "Balance general VuelaTour · Otros gastos (el avión queda solo como referencia; para cargarlo a aviones usa el reparto)",
      );
      expect(hojaDestinoGasto(cat, false, false)).toBe(OTROS_GASTOS_SIN_NADA);
    },
  );

  it("TUAS con vuelo ⇒ otros movimientos (el otro egreso apareado; en la hoja del vuelo solo es nota)", () => {
    expect(hojaDestinoGasto("TUAS", true, true)).toBe(
      "Balance general VuelaTour · Otros movimientos (apareado con las TUAS cobradas; en la hoja del vuelo solo es nota)",
    );
  });

  it("GAS con vuelo ⇒ Combustible por avión y mes", () => {
    expect(hojaDestinoGasto("GAS", true, true)).toBe(
      "Balance del avión · Combustible (por avión y mes; el vuelo es referencia)",
    );
  });

  it("PERMISO con vuelo ⇒ Permisos", () => {
    expect(hojaDestinoGasto("PERMISO", true, true)).toBe("Balance del avión · Permisos");
  });

  it.each(["COMIDA", "OPERACIONES", "FBO", "PILOTO_EXTERNO", "HOTEL"])(
    "%s con vuelo sigue en la hoja del vuelo",
    (cat) => {
      expect(hojaDestinoGasto(cat, true, true)).toBe("Balance del avión · hoja del vuelo");
      expect(hojaDestinoGasto(cat, true, false)).toBe("Balance del avión · hoja del vuelo");
    },
  );

  it("sin vuelo: las ramas de siempre", () => {
    expect(hojaDestinoGasto("GAS", false, true)).toBe("Balance del avión · Combustible");
    expect(hojaDestinoGasto("PERMISO", false, true)).toBe("Balance del avión · Permisos");
    expect(hojaDestinoGasto("REFACCION", false, true)).toBe("Balance del avión · Gastos Indirectos");
    expect(hojaDestinoGasto("INDIRECTO", false, true)).toBe("Balance del avión · Gastos Indirectos");
    expect(hojaDestinoGasto("SERVICIOS", false, true)).toBe("Balance del avión · Gastos Indirectos");
    expect(hojaDestinoGasto("OPERACIONES", false, false)).toBe(OTROS_GASTOS_SIN_NADA);
    expect(hojaDestinoGasto("INDIRECTO", false, false)).toBe(OTROS_GASTOS_SIN_NADA);
  });

  it("PERSONAL_DUENO ⇒ fuera de balances, pase lo que pase", () => {
    expect(hojaDestinoGasto("PERSONAL_DUENO", true, true)).toBe("Fuera de balances (personal)");
    expect(hojaDestinoGasto("PERSONAL_DUENO", false, false)).toBe("Fuera de balances (personal)");
  });
});

describe("schema zod del panel", () => {
  it("el enum acepta COMISION_VENDEDOR", () => {
    expect(CategoriaEnum.safeParse("COMISION_VENDEDOR").success).toBe(true);
  });

  it("toda categoría ofrecida al capturar pasa el enum", () => {
    for (const c of CATEGORIAS_CAPTURA) {
      expect(CategoriaEnum.safeParse(c).success, c).toBe(true);
    }
  });

  it("GastoCreateSchema acepta una comisión ligada a su vuelo", () => {
    const r = GastoCreateSchema.safeParse({
      categoria: "COMISION_VENDEDOR",
      monto: "2030",
      moneda: "MXN",
      fecha_gasto: "2026-09-28",
      medio_pago: "TRANSFERENCIA",
      vuelo_id: VUELO,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoria).toBe("COMISION_VENDEDOR");
      expect(r.data.monto).toBe(2030);
      expect(r.data.vuelo_id).toBe(VUELO);
    }
  });

  it("GastoVerifySchema acepta reclasificar a comisión con el vuelo en el MISMO PATCH", () => {
    const r = GastoVerifySchema.safeParse({ categoria: "COMISION_VENDEDOR", vuelo_id: VUELO });
    expect(r.success).toBe(true);
  });
});
