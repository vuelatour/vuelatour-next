import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AYUDA_COMISARIATO,
  AYUDA_COMISION_VENDEDOR,
  AYUDA_COMISION_VENDEDOR_AVION,
  AYUDA_OTROS_MOVIMIENTOS,
  AYUDA_RECLASIFICAR_COMISION,
  CATEGORIA_COMISARIATO,
  CATEGORIA_GASTO_LABELS,
  CATEGORIA_OTROS_MOVIMIENTOS,
  CATEGORIA_PAGO_VENDEDOR,
  CATEGORIA_PAGO_VENDEDOR_AVION,
  CATEGORIAS_CAPTURA,
  CATEGORIAS_EMPRESA,
  CATEGORIAS_FILTRO_GASTO,
  CATEGORIAS_PAGO_VENDEDOR,
  CATEGORIAS_REPARTIBLES,
  CATEGORIAS_SIN_AVION,
  CATEGORIAS_SOLO_DECIDE_LA_OFICINA,
  DESTINO_OTROS_MOVIMIENTOS,
  DESTINO_POR_DEFECTO,
  HINT_VUELO_COMISION,
  HOJA_OTROS_MOVIMIENTOS_CON_AVION,
  HOJA_OTROS_MOVIMIENTOS_CON_VUELO,
  HOJA_OTROS_MOVIMIENTOS_SIN_NADA,
  MSG_GASTO_REQUIERE_VUELO_COMISION,
  NOTA_PAGO_VENDEDOR_REPARTO,
  SUBLABEL_COMISIONES_REPARTO,
  VENTANA_VUELOS_COMISION,
  VENTANA_VUELOS_DEFAULT,
  ayudaComisionVendedor,
  categoriaExigeVueloSiempre,
  categoriaGastoLabel,
  categoriaLlevaAvion,
  destinoPorDefecto,
  destinoVisibleEnGastosDelVuelo,
  errorVueloObligatorio,
  esCategoriaOtrosMovimientos,
  esCategoriaPagoVendedor,
  HOJA_NOMINA_SIN_REPARTIR,
  hojaDestinoGasto,
  iaPuedeCambiarCategoria,
  mensajeGastoRequiereVuelo,
  opcionCategoriaGasto,
  textoTableroComisionVendedorAvion,
  textoTableroGastosEmpresa,
} from "@/lib/admin/categorias-gasto";
import { CATEGORIAS_TUA_INCLUIDA } from "@/lib/admin/tua-incluida";
import { CATEGORIAS_COMPRA } from "@/types/compras";
import { CategoriaEnum, GastoCreateSchema, GastoVerifySchema } from "@/app/admin/expenses/schema";

/**
 * «Comisión del vendedor» como gasto (pedido del cliente, 28-sep-2026): «¿cómo
 * registro el pago de la comisión a Saab para que aparezca en otros
 * movimientos? Si lo capturo como "Otros gastos VuelaTour" queda
 * duplicado». Desde el 13-oct-2026 (API 0.0.74, invariante 61) son DOS
 * categorías: «aqui en las categorias necesitamos una opcion que sea
 * Comision del vendedor pero que esa opcion si se cargue al balance del
 * avión, y dejamos el otro que se va a balance de vuelatour para tener esas
 * 2 opciones». La tabla canónica (etiqueta + destino) es LITERAL del
 * contrato y la MISMA que congela el API (`common/categoria-gasto.util.spec.ts`)
 * y la app (`categoria_comision_vendedor*_test.dart`): si un texto cambia en
 * un solo lado, este test falla.
 */

const VUELO = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const VT = "COMISION_VENDEDOR";
const AV = "COMISION_VENDEDOR_AVION";
const ETIQUETA_VT = "Comisión del vendedor (VuelaTour)";
const ETIQUETA_AV = "Comisión del vendedor (avión)";
const DESTINO_VT = "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)";
const DESTINO_AV =
  "Pago al vendedor (columna COMISIONES del balance del avión; sí es costo del avión)";

describe("tabla canónica de las DOS comisiones del vendedor (== API == app)", () => {
  it("códigos, etiquetas y destinos exactos", () => {
    expect(CATEGORIA_PAGO_VENDEDOR).toBe(VT);
    expect(CATEGORIA_PAGO_VENDEDOR_AVION).toBe(AV);
    expect(CATEGORIA_GASTO_LABELS[VT]).toBe(ETIQUETA_VT);
    expect(CATEGORIA_GASTO_LABELS[AV]).toBe(ETIQUETA_AV);
    expect(categoriaGastoLabel(VT)).toBe(ETIQUETA_VT);
    expect(categoriaGastoLabel(AV)).toBe(ETIQUETA_AV);
    expect(destinoPorDefecto(VT)).toBe(DESTINO_VT);
    expect(destinoPorDefecto(AV)).toBe(DESTINO_AV);
  });

  it("ningún destino es el de empresa ni el de gasto directo del vuelo", () => {
    for (const c of [VT, AV]) {
      const destino = DESTINO_POR_DEFECTO[c];
      expect(destino, c).not.toBe("Otros gastos (Balance general VuelaTour)");
      expect(destino.startsWith("Gastos directos del vuelo"), c).toBe(false);
    }
  });

  it("opción del selector: etiqueta + destino en verde (se ve quién paga)", () => {
    expect(opcionCategoriaGasto(VT)).toEqual({
      value: VT,
      label: ETIQUETA_VT,
      description: DESTINO_VT,
      descriptionClassName: expect.stringContaining("text-green-600!"),
    });
    expect(opcionCategoriaGasto(AV)).toEqual({
      value: AV,
      label: ETIQUETA_AV,
      description: DESTINO_AV,
      descriptionClassName: expect.stringContaining("text-green-600!"),
    });
  });

  it("orden del selector: …PILOTO_EXTERNO, «(VuelaTour)», «(avión)», INDIRECTO…", () => {
    const i = CATEGORIAS_CAPTURA.indexOf("PILOTO_EXTERNO");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(CATEGORIAS_CAPTURA.slice(i, i + 4)).toEqual(["PILOTO_EXTERNO", VT, AV, "INDIRECTO"]);
    expect(CATEGORIAS_CAPTURA.filter((c) => c === VT)).toHaveLength(1);
    expect(CATEGORIAS_CAPTURA.filter((c) => c === AV)).toHaveLength(1);
  });

  it("toda categoría ofrecida tiene etiqueta y destino propios (nada cae al fallback)", () => {
    for (const c of CATEGORIAS_CAPTURA) {
      expect(CATEGORIA_GASTO_LABELS[c], c).toBeTruthy();
      expect(DESTINO_POR_DEFECTO[c], c).toBeTruthy();
    }
  });

  it("NINGUNA es repartible (el reparto es de gastos generales SIN vuelo): lista sin cambio", () => {
    expect(CATEGORIAS_REPARTIBLES.has(VT)).toBe(false);
    expect(CATEGORIAS_REPARTIBLES.has(AV)).toBe(false);
    expect([...CATEGORIAS_REPARTIBLES].sort()).toEqual(
      ["FIJO", "GASOLINA", "INDIRECTO", "NOMINA", "OTRO", "VISITA"],
    );
  });
});

describe("comparación EXACTA: 'COMISION_VENDEDOR' es prefijo de 'COMISION_VENDEDOR_AVION'", () => {
  it("esCategoriaPagoVendedor: solo las dos, por igualdad", () => {
    expect([...CATEGORIAS_PAGO_VENDEDOR].sort()).toEqual([VT, AV]);
    expect(esCategoriaPagoVendedor(VT)).toBe(true);
    expect(esCategoriaPagoVendedor(AV)).toBe(true);
    for (const c of [
      "COMISION_VENDEDOR_AVIONX",
      "COMISION_VENDEDOR_",
      "COMISION_VENDEDO",
      "comision_vendedor",
      "comision_vendedor_avion",
      " COMISION_VENDEDOR",
      "OTRO",
      "",
      null,
      undefined,
    ]) {
      expect(esCategoriaPagoVendedor(c), String(c)).toBe(false);
    }
  });

  it("guardián: ningún archivo del panel compara la categoría con prefijo", () => {
    const raiz = path.resolve(__dirname, "../../..");
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = path.join(dir, nombre);
        if (statSync(ruta).isDirectory()) {
          if (nombre !== "node_modules" && nombre !== "__tests__") recorrer(ruta);
        } else if (/\.(ts|tsx)$/.test(nombre)) {
          archivos.push(ruta);
        }
      }
    };
    recorrer(raiz);
    expect(archivos.length).toBeGreaterThan(100);
    const prohibido = /\.(startsWith|includes|indexOf)\(\s*["'`]COMISION_VENDEDOR/;
    const culpables = archivos.filter((f) => prohibido.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });
});

describe("vuelo obligatorio (espejo del 400 GASTO_REQUIERE_VUELO del API)", () => {
  it("solo las DOS comisiones lo exigen para todos los roles", () => {
    expect(categoriaExigeVueloSiempre(VT)).toBe(true);
    expect(categoriaExigeVueloSiempre(AV)).toBe(true);
    for (const c of Object.keys(CATEGORIA_GASTO_LABELS).filter((c) => c !== VT && c !== AV)) {
      expect(categoriaExigeVueloSiempre(c), c).toBe(false);
    }
    expect(categoriaExigeVueloSiempre("")).toBe(false);
    expect(categoriaExigeVueloSiempre("COMISION_VENDEDOR_AVIONX")).toBe(false);
  });

  it("mensaje idéntico al del API, con la etiqueta de SU categoría", () => {
    expect(mensajeGastoRequiereVuelo(VT)).toBe(
      "Esta categoría es del vuelo: elige el vuelo. «Comisión del vendedor (VuelaTour)» siempre se registra con el vuelo al que pertenece.",
    );
    expect(mensajeGastoRequiereVuelo(AV)).toBe(
      "Esta categoría es del vuelo: elige el vuelo. «Comisión del vendedor (avión)» siempre se registra con el vuelo al que pertenece.",
    );
    // El nombre de siempre conserva el texto de la «(VuelaTour)».
    expect(MSG_GASTO_REQUIERE_VUELO_COMISION).toBe(mensajeGastoRequiereVuelo(VT));
  });

  it("errorVueloObligatorio: sin vuelo ⇒ mensaje de SU categoría; con vuelo ⇒ null; otra categoría ⇒ null", () => {
    expect(errorVueloObligatorio(VT, "")).toBe(MSG_GASTO_REQUIERE_VUELO_COMISION);
    expect(errorVueloObligatorio(VT, null)).toBe(MSG_GASTO_REQUIERE_VUELO_COMISION);
    expect(errorVueloObligatorio(VT, undefined)).toBe(MSG_GASTO_REQUIERE_VUELO_COMISION);
    expect(errorVueloObligatorio(VT, VUELO)).toBeNull();
    expect(errorVueloObligatorio(AV, "")).toBe(mensajeGastoRequiereVuelo(AV));
    expect(errorVueloObligatorio(AV, null)).toBe(mensajeGastoRequiereVuelo(AV));
    expect(errorVueloObligatorio(AV, undefined)).toBe(mensajeGastoRequiereVuelo(AV));
    expect(errorVueloObligatorio(AV, VUELO)).toBeNull();
    expect(errorVueloObligatorio("OTRO", "")).toBeNull();
    expect(errorVueloObligatorio("COMIDA", null)).toBeNull();
  });

  it("hint del campo Vuelo (vale para las dos)", () => {
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
  it("una comisión elegida a mano (cualquiera de las dos) NO se cambia", () => {
    for (const c of [VT, AV]) {
      expect(iaPuedeCambiarCategoria(c, "OPERACIONES"), c).toBe(false);
      expect(iaPuedeCambiarCategoria(c, "OTRO"), c).toBe(false);
    }
    // Ni la IA decide quién paga: no cambia una por la otra.
    expect(iaPuedeCambiarCategoria(VT, AV)).toBe(false);
    expect(iaPuedeCambiarCategoria(AV, VT)).toBe(false);
  });

  it("la IA tampoco propone ninguna (un pago al vendedor lo decide la oficina)", () => {
    expect(iaPuedeCambiarCategoria("OPERACIONES", VT)).toBe(false);
    expect(iaPuedeCambiarCategoria("OPERACIONES", AV)).toBe(false);
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

describe("ayudas de la comisión (alta y Verificar / editar)", () => {
  it("«(VuelaTour)»: texto exacto; conserva las frases de siempre y apunta a la «(avión)»", () => {
    expect(AYUDA_COMISION_VENDEDOR).toBe(
      "La paga VuelaTour. Se aparea con la comisión cobrada al cliente en la hoja «otros movimientos» del balance general: mientras no se capture, esa fila no lleva egreso (ahí no se provisiona nada); si pagas de menos o de más, la hoja lo marca con «faltan» o «excede». Registra un gasto por vuelo: si una sola transferencia paga varios vuelos (o los aviones de un grupo), captura un gasto por vuelo con su parte. No es costo del avión. Si el pago le toca al avión, usa «Comisión del vendedor (avión)». No la captures como «Otros gastos VuelaTour»: quedaría duplicada.",
    );
    expect(AYUDA_COMISION_VENDEDOR).toContain(
      "Se aparea con la comisión cobrada al cliente en la hoja «otros movimientos» del balance general",
    );
    // 12-oct-2026 (API 0.0.73, invariante 58): «otros movimientos» ya no provisiona.
    expect(AYUDA_COMISION_VENDEDOR).toContain("esa fila no lleva egreso");
    expect(AYUDA_COMISION_VENDEDOR).not.toContain("reemplaza la PROVISIÓN");
    expect(AYUDA_COMISION_VENDEDOR).toContain("«faltan» o «excede»");
    expect(AYUDA_COMISION_VENDEDOR).toContain("Registra un gasto por vuelo");
    expect(AYUDA_COMISION_VENDEDOR).toContain("No es costo del avión.");
    expect(AYUDA_COMISION_VENDEDOR).toContain(
      "No la captures como «Otros gastos VuelaTour»: quedaría duplicada.",
    );
    // 13-oct-2026: dice quién paga y cuándo usar la otra.
    expect(AYUDA_COMISION_VENDEDOR.startsWith("La paga VuelaTour.")).toBe(true);
    expect(AYUDA_COMISION_VENDEDOR).toContain(`Si el pago le toca al avión, usa «${ETIQUETA_AV}».`);
  });

  it("«(avión)»: texto exacto (lo carga el avión del vuelo y cuándo lo paga VuelaTour)", () => {
    expect(AYUDA_COMISION_VENDEDOR_AVION).toBe(
      "La carga el avión del vuelo: resta en la columna COMISIONES de su balance y en el reparto a sus socios, en el mes del vuelo (en un vuelo de varios aviones, cada uno su parte, como la venta). En la hoja «otros movimientos» del balance general sale junto a la comisión cobrada al cliente —que sigue siendo de VuelaTour— con egreso $0.00 «a cargo del avión». Solo la carga el avión con el vuelo completado (o cancelado con cobros retenidos); antes, o en un vuelo sin avión de la flota, la paga VuelaTour y el balance lo avisa. Registra un gasto por vuelo. Si el pago le toca a VuelaTour, usa «Comisión del vendedor (VuelaTour)». No la captures como «Otros gastos VuelaTour»: quedaría duplicada.",
    );
    expect(AYUDA_COMISION_VENDEDOR_AVION).toContain(`usa «${ETIQUETA_VT}»`);
    expect(AYUDA_COMISION_VENDEDOR_AVION).not.toMatch(/provisi/i);
  });

  it("reclasificar entre las dos (solo en Verificar / editar): texto exacto", () => {
    expect(AYUDA_RECLASIFICAR_COMISION).toBe(
      "¿Cambió quién la paga? Cambia aquí la categoría entre «Comisión del vendedor (VuelaTour)» y «Comisión del vendedor (avión)»: se puede aunque el gasto ya esté conciliado (el banco no se toca). El balance y el reparto del mes del vuelo cambian al regenerarlos.",
    );
    expect(AYUDA_RECLASIFICAR_COMISION).toContain(`«${ETIQUETA_VT}» y «${ETIQUETA_AV}»`);
  });

  it("ayudaComisionVendedor: título = etiqueta de SU categoría; null fuera de las dos", () => {
    expect(ayudaComisionVendedor(VT)).toEqual({ titulo: ETIQUETA_VT, texto: AYUDA_COMISION_VENDEDOR });
    expect(ayudaComisionVendedor(AV)).toEqual({ titulo: ETIQUETA_AV, texto: AYUDA_COMISION_VENDEDOR_AVION });
    for (const c of ["OTRO", "PILOTO_EXTERNO", "COMISION_VENDEDOR_AVIONX", "", null, undefined]) {
      expect(ayudaComisionVendedor(c), String(c)).toBeNull();
    }
  });
});

describe("hojaDestinoGasto: a qué hoja cae CON LO ELEGIDO (sin pistas falsas)", () => {
  const OTROS_GASTOS_SIN_NADA =
    "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)";

  it("«(VuelaTour)» ⇒ otros movimientos, con o sin vuelo/avión", () => {
    const esperado =
      "Balance general VuelaTour · Otros movimientos (el pago al vendedor, apareado con la comisión cobrada; sin él esa fila no lleva egreso)";
    expect(hojaDestinoGasto(VT, true, true)).toBe(esperado);
    expect(hojaDestinoGasto(VT, true, false)).toBe(esperado);
    expect(hojaDestinoGasto(VT, false, true)).toBe(esperado);
    expect(hojaDestinoGasto(VT, false, false)).toBe(esperado);
  });

  it("«(avión)» ⇒ columna COMISIONES del avión y reparto, con o sin vuelo/avión", () => {
    const esperado =
      "Balance del avión · columna COMISIONES y reparto a socios, en el mes del vuelo (con el vuelo completado; en «otros movimientos» sale con egreso $0.00 «a cargo del avión»)";
    expect(hojaDestinoGasto(AV, true, true)).toBe(esperado);
    expect(hojaDestinoGasto(AV, true, false)).toBe(esperado);
    expect(hojaDestinoGasto(AV, false, true)).toBe(esperado);
    expect(hojaDestinoGasto(AV, false, false)).toBe(esperado);
  });

  it("empresa = las 6 del destino «Otros gastos» (sincronizada con el API; Paquetería desde el 20-oct-2026)", () => {
    const porDestino = Object.entries(DESTINO_POR_DEFECTO)
      .filter(([, d]) => d === "Otros gastos (Balance general VuelaTour)")
      .map(([c]) => c)
      .sort();
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(porDestino);
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(["FIJO", "GASOLINA", "NOMINA", "OTRO", "PAQUETERIA", "VISITA"]);
    expect(CATEGORIAS_EMPRESA.has(VT)).toBe(false);
    expect(CATEGORIAS_EMPRESA.has(AV)).toBe(false);
  });

  it("NOMINA (16-oct-2026, API 0.0.90): vive en el módulo Nómina y sin repartir no entra a NINGÚN balance", () => {
    // Con o sin vuelo/avión: el avión elegido es solo referencia y la
    // nómina cuenta en un balance únicamente REPARTIDA (desde Nómina).
    for (const [conVuelo, conAvion] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      expect(hojaDestinoGasto("NOMINA", conVuelo, conAvion)).toBe(HOJA_NOMINA_SIN_REPARTIR);
    }
    expect(HOJA_NOMINA_SIN_REPARTIR).toBe(
      "Nómina (módulo Nómina): no entra a ningún balance hasta repartirla entre aviones desde Nómina",
    );
    expect(HOJA_NOMINA_SIN_REPARTIR).not.toContain("Otros gastos");
  });

  it.each(["OTRO", "GASOLINA", "FIJO", "VISITA"])(
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

describe("tablero de Gastos y reparto: textos de la «(avión)»", () => {
  it("renglón del tablero: solo con cifra > 0 (0 o API previo sin la llave ⇒ no se pinta)", () => {
    expect(textoTableroComisionVendedorAvion(1305.5)).toBe(
      "$1,305.50 en comisiones del vendedor a cargo de los aviones (restan en la columna COMISIONES de su balance y en el reparto; no entran al costo por hora).",
    );
    expect(textoTableroComisionVendedorAvion(240)).toMatch(/^\$240 en comisiones del vendedor a cargo de los aviones/);
    expect(textoTableroComisionVendedorAvion(undefined)).toBeNull();
    expect(textoTableroComisionVendedorAvion(null)).toBeNull();
    expect(textoTableroComisionVendedorAvion(0)).toBeNull();
    expect(textoTableroComisionVendedorAvion(-5)).toBeNull();
    expect(textoTableroComisionVendedorAvion(Number.NaN)).toBeNull();
  });

  it("renglón de gastos de la EMPRESA: dice todo lo que suma el API (categorías de empresa, «(VuelaTour)» y remanentes)", () => {
    expect(textoTableroGastosEmpresa(4250.3)).toBe(
      "$4,250.30 en gastos de la empresa VuelaTour: categorías de empresa (Otros gastos VuelaTour, Nómina, Gasolina (vehículos), Gasto fijo, Visita y Paquetería), «Comisión del vendedor (VuelaTour)» y remanentes de repartos. No se imputan a aeronaves.",
    );
    // La «(avión)» NO está ahí: tiene su propio renglón.
    expect(textoTableroGastosEmpresa(1)).not.toContain(ETIQUETA_AV);
    for (const v of [undefined, null, 0, -5, Number.NaN]) {
      expect(textoTableroGastosEmpresa(v), String(v)).toBeNull();
    }
  });

  it("tooltips del reparto: quién paga al vendedor con las DOS categorías (sin «provisión» ni «egreso de VuelaTour» a secas)", () => {
    expect(NOTA_PAGO_VENDEDOR_REPARTO).toBe(
      "Lo cobrado al cliente por la comisión del vendedor es ingreso de VuelaTour; el pago al vendedor es el gasto real capturado: «Comisión del vendedor (VuelaTour)» egresa en «otros movimientos» del Balance general y «Comisión del vendedor (avión)» resta en «Comisiones» del avión (sin pago capturado no se resta nada).",
    );
    expect(NOTA_PAGO_VENDEDOR_REPARTO).not.toMatch(/provisi/i);
  });

  it("sublabel de «Comisiones (banco + vendedor)» del reparto: sin provisión, con la «(avión)»", () => {
    expect(SUBLABEL_COMISIONES_REPARTO).toBe(
      "parte del avión de la comisión bancaria (regla sep-2026) + pagos «Comisión del vendedor (avión)»",
    );
    expect(SUBLABEL_COMISIONES_REPARTO).not.toMatch(/provisi/i);
  });
});

describe("schema zod del panel", () => {
  it("el enum acepta las dos (y nada parecido)", () => {
    expect(CategoriaEnum.safeParse(VT).success).toBe(true);
    expect(CategoriaEnum.safeParse(AV).success).toBe(true);
    expect(CategoriaEnum.safeParse("COMISION_VENDEDOR_AVIONX").success).toBe(false);
  });

  it("la «(avión)» va justo después de la «(VuelaTour)» en el enum", () => {
    const opciones = CategoriaEnum.options as readonly string[];
    expect(opciones[opciones.indexOf(VT) + 1]).toBe(AV);
  });

  it("toda categoría ofrecida al capturar pasa el enum", () => {
    for (const c of CATEGORIAS_CAPTURA) {
      expect(CategoriaEnum.safeParse(c).success, c).toBe(true);
    }
  });

  it.each([VT, AV])("GastoCreateSchema acepta %s ligada a su vuelo", (cat) => {
    const r = GastoCreateSchema.safeParse({
      categoria: cat,
      monto: "2030",
      moneda: "MXN",
      fecha_gasto: "2026-09-28",
      medio_pago: "TRANSFERENCIA",
      vuelo_id: VUELO,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoria).toBe(cat);
      expect(r.data.monto).toBe(2030);
      expect(r.data.vuelo_id).toBe(VUELO);
    }
  });

  it.each([VT, AV])("GastoVerifySchema acepta reclasificar a %s con el vuelo en el MISMO PATCH", (cat) => {
    const r = GastoVerifySchema.safeParse({ categoria: cat, vuelo_id: VUELO });
    expect(r.success).toBe(true);
  });
});

// =====================================================================
// COMISARIATO (13-oct-2026, API 0.0.75). Pedido del cliente (Jimmy,
// 12-oct): snacks/bebidas de los PASAJEROS como gasto DIRECTO del vuelo —
// columna OTROS de costos directos del balance del avión, junto al FBO. Se
// capturaban como «Otros gastos VuelaTour» y nunca llegaban al avión. La
// app ya la tiene (commit 66e8036); la tabla canónica es la MISMA en los
// tres repos.
// =====================================================================

const CM = "COMISARIATO";
const DESTINO_DIRECTO = "Gastos directos del vuelo (en el balance del avión)";

describe("tabla canónica de COMISARIATO (== API == app)", () => {
  it("código, etiqueta y destino exactos (el destino es el de COMIDA)", () => {
    expect(CATEGORIA_COMISARIATO).toBe(CM);
    expect(CATEGORIA_GASTO_LABELS[CM]).toBe("Comisariato");
    expect(categoriaGastoLabel(CM)).toBe("Comisariato");
    expect(destinoPorDefecto(CM)).toBe(DESTINO_DIRECTO);
    expect(destinoPorDefecto(CM)).toBe(destinoPorDefecto("COMIDA"));
    expect(opcionCategoriaGasto(CM)).toEqual({
      value: CM,
      label: "Comisariato",
      description: DESTINO_DIRECTO,
      descriptionClassName: expect.stringContaining("text-green-600!"),
    });
  });

  it("en el selector va JUSTO después de «Comida» y una sola vez", () => {
    const i = CATEGORIAS_CAPTURA.indexOf("COMIDA");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(CATEGORIAS_CAPTURA[i + 1]).toBe(CM);
    expect(CATEGORIAS_CAPTURA.filter((c) => c === CM)).toHaveLength(1);
  });

  it("no es de empresa ni repartible (las listas no cambian)", () => {
    expect(CATEGORIAS_EMPRESA.has(CM)).toBe(false);
    expect(CATEGORIAS_REPARTIBLES.has(CM)).toBe(false);
    expect([...CATEGORIAS_REPARTIBLES].sort()).toEqual(
      ["FIJO", "GASOLINA", "INDIRECTO", "NOMINA", "OTRO", "VISITA"],
    );
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(["FIJO", "GASOLINA", "NOMINA", "OTRO", "PAQUETERIA", "VISITA"]);
  });

  it("no exige vuelo a TODOS los roles: la oficina la captura suelta (solo el piloto la liga a fuerza, en el API)", () => {
    expect(categoriaExigeVueloSiempre(CM)).toBe(false);
    expect(errorVueloObligatorio(CM, null)).toBeNull();
    expect(errorVueloObligatorio(CM, "")).toBeNull();
    expect(esCategoriaPagoVendedor(CM)).toBe(false);
  });

  it("la IA SÍ puede proponerla (snacks/bebidas de pasajeros), salvo sobre una comisión elegida a mano", () => {
    expect(iaPuedeCambiarCategoria("OTRO", CM)).toBe(true);
    expect(iaPuedeCambiarCategoria("COMIDA", CM)).toBe(true);
    expect(iaPuedeCambiarCategoria(CM, "COMIDA")).toBe(true);
    expect(iaPuedeCambiarCategoria("COMISION_VENDEDOR", CM)).toBe(false);
    expect(iaPuedeCambiarCategoria("COMISION_VENDEDOR_AVION", CM)).toBe(false);
  });

  it("«Con lo elegido cae en:» por rama (columna OTROS con vuelo; Gastos Indirectos con avión; otros gastos sin nada)", () => {
    const conVuelo =
      "Balance del avión · hoja del vuelo (columna OTROS de costos directos, junto al FBO)";
    expect(hojaDestinoGasto(CM, true, true)).toBe(conVuelo);
    expect(hojaDestinoGasto(CM, true, false)).toBe(conVuelo);
    expect(hojaDestinoGasto(CM, false, true)).toBe("Balance del avión · Gastos Indirectos");
    expect(hojaDestinoGasto(CM, false, false)).toBe(
      "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)",
    );
    // COMIDA (la de la tripulación) no cambia.
    expect(hojaDestinoGasto("COMIDA", true, true)).toBe("Balance del avión · hoja del vuelo");
  });

  it("ayuda exacta: para los PASAJEROS, columna OTROS y la comida de la tripulación en «Comida»", () => {
    expect(AYUDA_COMISARIATO).toBe(
      "Snacks, bebidas y comisariato para los PASAJEROS. Es gasto directo del vuelo: en el balance del avión cae en la columna OTROS de costos directos (junto al FBO) y resta en el reparto a socios. La comida de la tripulación va en «Comida». Sin vuelo queda como pendiente de avión hasta ligarlo.",
    );
    expect(AYUDA_COMISARIATO).toContain("PASAJEROS");
    expect(AYUDA_COMISARIATO).toContain("columna OTROS");
    expect(AYUDA_COMISARIATO).toContain("La comida de la tripulación va en «Comida».");
  });

  it("schema zod: el enum la acepta; alta con y sin vuelo; Verificar con el vuelo", () => {
    expect(CategoriaEnum.safeParse(CM).success).toBe(true);
    const opciones = CategoriaEnum.options as readonly string[];
    expect(opciones[opciones.indexOf("COMIDA") + 1]).toBe(CM);
    const base = {
      categoria: CM,
      monto: "176.5",
      moneda: "MXN",
      fecha_gasto: "2026-08-18",
      medio_pago: "TARJETA_CORP",
    };
    const conVuelo = GastoCreateSchema.safeParse({ ...base, vuelo_id: VUELO });
    expect(conVuelo.success).toBe(true);
    if (conVuelo.success) expect(conVuelo.data.monto).toBe(176.5);
    expect(GastoCreateSchema.safeParse(base).success).toBe(true);
    expect(GastoVerifySchema.safeParse({ categoria: CM, vuelo_id: VUELO }).success).toBe(true);
  });
});

describe("paridad del enum de categorías (25 valores con Otros directos del vuelo, Paquetería y Otros movimientos)", () => {
  it("el zod, las etiquetas y los destinos tienen EXACTAMENTE los mismos 25 códigos", () => {
    const enumZod = [...(CategoriaEnum.options as readonly string[])].sort();
    expect(enumZod).toHaveLength(25);
    expect(Object.keys(CATEGORIA_GASTO_LABELS).sort()).toEqual(enumZod);
    expect(Object.keys(DESTINO_POR_DEFECTO).sort()).toEqual(enumZod);
    // Toda categoría que se ofrece pasa el enum (las 3 legado/de verificación
    // —ATERRIZAJE, FIJO, VISITA— no se ofrecen al capturar).
    expect([...CATEGORIAS_CAPTURA].sort()).toEqual(
      enumZod.filter((c) => !["ATERRIZAJE", "FIJO", "VISITA"].includes(c)),
    );
  });

  // Repo hermano del API (solo existe en el workspace local): etiquetas y
  // destinos IDÉNTICOS byte a byte (`common/categoria-gasto.util.ts`).
  const API = path.resolve(
    process.env.VUELATOUR_API_DIR ?? path.resolve(__dirname, "../../../../../vuelatour-api"),
    "src/common/categoria-gasto.util.ts",
  );
  const fuenteApi = existsSync(API) ? readFileSync(API, "utf8") : null;
  /** `export const NOMBRE =\n  '…'` del API (p. ej. `DESTINO_OTROS_MOVIMIENTOS`). */
  const constanteApi = (nombre: string): string | null => {
    const m = new RegExp(`export const ${nombre}\\s*=\\s*'([^']*)'`).exec(fuenteApi ?? "");
    return m ? m[1] : null;
  };
  const tablaApi = (nombre: string): Record<string, string> => {
    const ini = (fuenteApi ?? "").indexOf(`export const ${nombre}`);
    const fin = (fuenteApi ?? "").indexOf("};", ini);
    const bloque = (fuenteApi ?? "").slice(ini, fin);
    const out: Record<string, string> = {};
    for (const m of bloque.matchAll(/^\s*([A-Z_]+):\s*'([^']*)'/gm)) out[m[1]] = m[2];
    for (const m of bloque.matchAll(/^\s*([A-Z_]+):\s*\n\s*'([^']*)'/gm)) out[m[1]] = m[2];
    // Valor por REFERENCIA a una constante del mismo archivo (23-oct-2026:
    // `OTROS_MOVIMIENTOS: DESTINO_OTROS_MOVIMIENTOS,`): se resuelve al literal.
    for (const m of bloque.matchAll(/^\s*([A-Z_]+):\s*([A-Z_]+),/gm)) {
      const valor = constanteApi(m[2]);
      if (valor !== null) out[m[1]] = valor;
    }
    return out;
  };

  it.skipIf(!fuenteApi)("etiquetas del API (CATEGORIA_GASTO_LABEL) == panel, con COMISARIATO", () => {
    const api = tablaApi("CATEGORIA_GASTO_LABEL");
    expect(api[CM]).toBe("Comisariato");
    expect(api).toEqual({ ...CATEGORIA_GASTO_LABELS });
  });

  it.skipIf(!fuenteApi)("destinos del API (CATEGORIA_GASTO_DESTINO) == panel, con COMISARIATO", () => {
    const api = tablaApi("CATEGORIA_GASTO_DESTINO");
    expect(api[CM]).toBe(DESTINO_DIRECTO);
    expect(api).toEqual({ ...DESTINO_POR_DEFECTO });
  });
});

/**
 * Tabla única de Gastos (14-oct-2026): «Falta avión» en la columna «Avión ·
 * vuelo» es ESPEJO de la bandeja de pendientes del API, y el filtro
 * «Categoría» ofrece las 25.
 */
describe("categorías sin avión (espejo de CATEGORIAS_GASTO_SIN_AVION del API)", () => {
  it("las de empresa + INDIRECTO + PERSONAL_DUENO + la comisión (VuelaTour) + Otros movimientos (VuelaTour); SIN la «(avión)»", () => {
    expect([...CATEGORIAS_SIN_AVION].sort()).toEqual([
      "COMISION_VENDEDOR",
      "FIJO",
      "GASOLINA",
      "INDIRECTO",
      "NOMINA",
      "OTRO",
      "OTROS_MOVIMIENTOS",
      "PAQUETERIA",
      "PERSONAL_DUENO",
      "VISITA",
    ]);
    for (const c of CATEGORIAS_EMPRESA) expect(CATEGORIAS_SIN_AVION.has(c), c).toBe(true);
    expect(CATEGORIAS_SIN_AVION.has(CATEGORIA_PAGO_VENDEDOR_AVION)).toBe(false);
  });

  it("categoriaLlevaAvion es lo contrario, con igualdad EXACTA", () => {
    expect(categoriaLlevaAvion("OTRO")).toBe(false);
    expect(categoriaLlevaAvion("INDIRECTO")).toBe(false);
    expect(categoriaLlevaAvion("PERSONAL_DUENO")).toBe(false);
    expect(categoriaLlevaAvion(CATEGORIA_PAGO_VENDEDOR)).toBe(false);
    expect(categoriaLlevaAvion(CATEGORIA_PAGO_VENDEDOR_AVION)).toBe(true);
    expect(categoriaLlevaAvion("SERVICIOS")).toBe(true);
    expect(categoriaLlevaAvion("REFACCION")).toBe(true);
    expect(categoriaLlevaAvion("COMISARIATO")).toBe(true);
    expect(categoriaLlevaAvion("otro")).toBe(true);
    expect(categoriaLlevaAvion("OTROS_DIRECTOS_VUELO")).toBe(true);
    expect(categoriaLlevaAvion("PAQUETERIA")).toBe(false);
    // 23-oct-2026: el avión de «Otros movimientos (VuelaTour)» es solo referencia.
    expect(categoriaLlevaAvion("OTROS_MOVIMIENTOS")).toBe(false);
    expect(Object.keys(CATEGORIA_GASTO_LABELS).filter((c) => categoriaLlevaAvion(c))).toHaveLength(15);
  });

  // Repo hermano del API (solo en el workspace local).
  const API = path.resolve(
    process.env.VUELATOUR_API_DIR ?? path.resolve(__dirname, "../../../../../vuelatour-api"),
    "src/common/categoria-gasto.util.ts",
  );
  const fuenteApi = existsSync(API) ? readFileSync(API, "utf8") : null;

  it.skipIf(!fuenteApi)("PARIDAD: los literales del API = CATEGORIAS_SIN_AVION menos las de empresa", () => {
    const src = fuenteApi ?? "";
    const ini = src.indexOf("export const CATEGORIAS_GASTO_SIN_AVION");
    expect(ini).toBeGreaterThan(-1);
    const bloque = src
      .slice(ini, src.indexOf("];", ini))
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(bloque).toContain("...CATEGORIAS_GASTO_EMPRESA");
    const literales = [...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
    const esperados = [...CATEGORIAS_SIN_AVION].filter((c) => !CATEGORIAS_EMPRESA.has(c)).sort();
    expect(literales).toEqual(esperados);
  });
});

describe("filtro «Categoría» de Gastos (CATEGORIAS_FILTRO_GASTO)", () => {
  it("las 25 sin repetir = llaves de CATEGORIA_GASTO_LABELS, en el orden de captura + ATERRIZAJE, FIJO, VISITA", () => {
    expect(CATEGORIAS_FILTRO_GASTO).toHaveLength(25);
    expect(new Set(CATEGORIAS_FILTRO_GASTO).size).toBe(25);
    expect([...CATEGORIAS_FILTRO_GASTO].sort()).toEqual(Object.keys(CATEGORIA_GASTO_LABELS).sort());
    expect(CATEGORIAS_FILTRO_GASTO).toEqual([...CATEGORIAS_CAPTURA, "ATERRIZAJE", "FIJO", "VISITA"]);
    // Las opciones salen de la MISMA función de la captura (etiqueta + destino).
    expect(opcionCategoriaGasto(CATEGORIAS_FILTRO_GASTO[0]).label).toBe("Gasavión / Turbosina");
  });
});

// =====================================================================
// «OTROS MOVIMIENTOS (VUELATOUR)» (23-oct-2026, API 0.0.106, invariante
// 107). Pedido del cliente (con la captura del selector de categorías):
// «Falta la opción de agregar un gasto a la hoja de "otros movimientos" en
// el balance general». Egreso de VuelaTour apareado en esa hoja con los
// ingresos de VuelaTour del vuelo (TUAs, extras, pernocta, comisión); vuelo
// OPCIONAL, avión solo referencia, NUNCA costo del avión ni «otros gastos».
// La tabla canónica es la MISMA en los tres repos.
// =====================================================================

const OM = "OTROS_MOVIMIENTOS";
const ETIQUETA_OM = "Otros movimientos (VuelaTour)";
const DESTINO_OM = "Otros movimientos (Balance general VuelaTour)";

describe("tabla canónica de OTROS_MOVIMIENTOS (== API == app)", () => {
  it("código, etiqueta y destino exactos (destino PROPIO: ni el de empresa ni el directo del vuelo)", () => {
    expect(CATEGORIA_OTROS_MOVIMIENTOS).toBe(OM);
    expect(CATEGORIA_GASTO_LABELS[OM]).toBe(ETIQUETA_OM);
    expect(categoriaGastoLabel(OM)).toBe(ETIQUETA_OM);
    expect(DESTINO_OTROS_MOVIMIENTOS).toBe(DESTINO_OM);
    expect(destinoPorDefecto(OM)).toBe(DESTINO_OM);
    expect(destinoPorDefecto(OM)).not.toBe(destinoPorDefecto("OTRO"));
    expect(destinoPorDefecto(OM).startsWith("Gastos directos del vuelo")).toBe(false);
    expect(opcionCategoriaGasto(OM)).toEqual({
      value: OM,
      label: ETIQUETA_OM,
      description: DESTINO_OM,
      descriptionClassName: expect.stringContaining("text-green-600!"),
    });
    // Nadie más tiene ese destino (si otra categoría lo tomara, el API la
    // derivaría a otra lista sin que nadie lo decidiera).
    expect(
      Object.entries(DESTINO_POR_DEFECTO)
        .filter(([, d]) => d === DESTINO_OM)
        .map(([c]) => c),
    ).toEqual([OM]);
  });

  it("en el selector va ÚLTIMA, justo después de «Otros gastos VuelaTour», una sola vez; el filtro de Gastos la trae", () => {
    expect(CATEGORIAS_CAPTURA.slice(-2)).toEqual(["OTRO", OM]);
    expect(CATEGORIAS_CAPTURA.filter((c) => c === OM)).toHaveLength(1);
    expect(CATEGORIAS_FILTRO_GASTO).toContain(OM);
  });

  it("listas: NO es de empresa, NO repartible, NO lleva avión (sin avión no es pendiente), NO de compra, sin TUA incluida", () => {
    expect(CATEGORIAS_EMPRESA.has(OM)).toBe(false);
    expect([...CATEGORIAS_EMPRESA].sort()).toEqual(["FIJO", "GASOLINA", "NOMINA", "OTRO", "PAQUETERIA", "VISITA"]);
    expect(CATEGORIAS_REPARTIBLES.has(OM)).toBe(false);
    expect([...CATEGORIAS_REPARTIBLES].sort()).toEqual(
      ["FIJO", "GASOLINA", "INDIRECTO", "NOMINA", "OTRO", "VISITA"],
    );
    expect(CATEGORIAS_SIN_AVION.has(OM)).toBe(true);
    expect(categoriaLlevaAvion(OM)).toBe(false);
    expect(CATEGORIAS_COMPRA.has(OM)).toBe(false);
    expect(CATEGORIAS_TUA_INCLUIDA).not.toContain(OM);
    expect(esCategoriaPagoVendedor(OM)).toBe(false);
  });

  it("vuelo OPCIONAL: no exige vuelo a ningún rol (sin vuelo = fila suelta)", () => {
    expect(categoriaExigeVueloSiempre(OM)).toBe(false);
    expect(errorVueloObligatorio(OM, null)).toBeNull();
    expect(errorVueloObligatorio(OM, "")).toBeNull();
    expect(errorVueloObligatorio(OM, VUELO)).toBeNull();
  });

  it("predicados EXACTOS: esCategoriaOtrosMovimientos y el destino visible en «Gastos del vuelo»", () => {
    expect(esCategoriaOtrosMovimientos(OM)).toBe(true);
    for (const c of ["OTRO", "OTROS_MOVIMIENTOSX", "otros_movimientos", "OTROS_DIRECTOS_VUELO", "", null, undefined]) {
      expect(esCategoriaOtrosMovimientos(c), String(c)).toBe(false);
    }
    expect(destinoVisibleEnGastosDelVuelo(OM)).toBe(true);
    expect(destinoVisibleEnGastosDelVuelo(VT)).toBe(true);
    expect(destinoVisibleEnGastosDelVuelo(AV)).toBe(true);
    for (const c of ["OTRO", "COMIDA", "COMISARIATO", "TUAS", "COMISION_VENDEDOR_AVIONX", "", null, undefined]) {
      expect(destinoVisibleEnGastosDelVuelo(c), String(c)).toBe(false);
    }
  });

  it("la IA ni la propone ni la pisa (la decide la oficina, como las dos comisiones)", () => {
    expect([...CATEGORIAS_SOLO_DECIDE_LA_OFICINA].sort()).toEqual([VT, AV, OM]);
    expect(iaPuedeCambiarCategoria(OM, "OPERACIONES")).toBe(false);
    expect(iaPuedeCambiarCategoria(OM, "OTRO")).toBe(false);
    expect(iaPuedeCambiarCategoria(OM, VT)).toBe(false);
    expect(iaPuedeCambiarCategoria("OTRO", OM)).toBe(false);
    expect(iaPuedeCambiarCategoria("OPERACIONES", OM)).toBe(false);
    // El caso de siempre sigue igual.
    expect(iaPuedeCambiarCategoria("OTRO", "COMIDA")).toBe(true);
  });

  it("«Con lo elegido cae en:» SIEMPRE «otros movimientos»: el vuelo decide el bloque y el avión es referencia", () => {
    expect(hojaDestinoGasto(OM, true, true)).toBe(HOJA_OTROS_MOVIMIENTOS_CON_VUELO);
    expect(hojaDestinoGasto(OM, true, false)).toBe(HOJA_OTROS_MOVIMIENTOS_CON_VUELO);
    expect(hojaDestinoGasto(OM, false, true)).toBe(HOJA_OTROS_MOVIMIENTOS_CON_AVION);
    expect(hojaDestinoGasto(OM, false, false)).toBe(HOJA_OTROS_MOVIMIENTOS_SIN_NADA);
    expect(HOJA_OTROS_MOVIMIENTOS_CON_VUELO).toBe(
      "Balance general VuelaTour · Otros movimientos (en el bloque de ese vuelo, junto a sus ingresos de VuelaTour; no es costo del avión)",
    );
    expect(HOJA_OTROS_MOVIMIENTOS_CON_AVION).toBe(
      "Balance general VuelaTour · Otros movimientos (fila suelta sin vuelo; el avión queda solo como referencia; no es costo del avión)",
    );
    expect(HOJA_OTROS_MOVIMIENTOS_SIN_NADA).toBe(
      "Balance general VuelaTour · Otros movimientos (fila suelta sin vuelo; no es costo del avión)",
    );
    for (const h of [HOJA_OTROS_MOVIMIENTOS_CON_VUELO, HOJA_OTROS_MOVIMIENTOS_CON_AVION, HOJA_OTROS_MOVIMIENTOS_SIN_NADA]) {
      expect(h.startsWith("Balance general VuelaTour · Otros movimientos")).toBe(true);
      expect(h).not.toContain("Otros gastos");
      expect(h).not.toContain("Balance del avión");
    }
    // «Otros gastos VuelaTour» no cambia: sigue en «otros gastos».
    expect(hojaDestinoGasto("OTRO", true, true)).toContain("Otros gastos");
  });

  it("ayuda exacta: egreso de VuelaTour, con/sin vuelo, nunca costo del avión, «Otros gastos VuelaTour» para la empresa", () => {
    expect(AYUDA_OTROS_MOVIMIENTOS).toBe(
      "Egreso de VuelaTour que entra a la hoja «otros movimientos» del Balance general, apareado con los ingresos de VuelaTour del vuelo (TUAs, extras, pernocta, comisión). Con vuelo va en el bloque de ese vuelo; sin vuelo queda como fila suelta. Nunca es costo del avión (no entra al reparto ni a los balances por avión) ni va a la hoja «otros gastos»: para un gasto de la empresa usa «Otros gastos VuelaTour». El avión, si lo eliges, queda solo como referencia.",
    );
    expect(AYUDA_OTROS_MOVIMIENTOS).toContain("Nunca es costo del avión");
    expect(AYUDA_OTROS_MOVIMIENTOS).toContain("usa «Otros gastos VuelaTour»");
  });

  it("schema zod: el enum la acepta justo después de OTRO; alta con y sin vuelo; Verificar con y sin vuelo", () => {
    expect(CategoriaEnum.safeParse(OM).success).toBe(true);
    expect(CategoriaEnum.safeParse("OTROS_MOVIMIENTOSX").success).toBe(false);
    const opciones = CategoriaEnum.options as readonly string[];
    expect(opciones[opciones.indexOf("OTRO") + 1]).toBe(OM);
    const base = {
      categoria: OM,
      monto: "1250",
      moneda: "MXN",
      fecha_gasto: "2026-10-23",
      medio_pago: "TRANSFERENCIA",
    };
    const conVuelo = GastoCreateSchema.safeParse({ ...base, vuelo_id: VUELO });
    expect(conVuelo.success).toBe(true);
    if (conVuelo.success) {
      expect(conVuelo.data.monto).toBe(1250);
      expect(conVuelo.data.vuelo_id).toBe(VUELO);
    }
    expect(GastoCreateSchema.safeParse(base).success).toBe(true);
    expect(GastoVerifySchema.safeParse({ categoria: OM, vuelo_id: VUELO }).success).toBe(true);
    expect(GastoVerifySchema.safeParse({ categoria: OM }).success).toBe(true);
  });
});
