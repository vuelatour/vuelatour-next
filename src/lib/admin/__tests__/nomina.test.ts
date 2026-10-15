/**
 * Nómina: un espacio propio (15-oct-2026) — la fuente única PURA
 * `lib/admin/nomina.ts`. Pedido del cliente: «Necesitamos un nuevo espacio
 * debajo de Gastos y Otros Gastos que se llame Nomina para tener en ese
 * apartado todo lo de nomina».
 *
 * Montos y fechas REALES de producción (15-oct-2026; las notas son genéricas,
 * sin nombres, y el medio de pago de cada renglón es ilustrativo: en prod hay
 * TRANSFERENCIA, PAYWISE y EFECTIVO):
 *  - octubre 2026: 12 pagos MXN que suman $109,921.46, todos en la 1.ª
 *    quincena (7, 14 y 15 de octubre);
 *  - septiembre 2026: 5 pagos del 30-sep que suman $21,757.80, todos en la 2.ª.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESES_LARGOS_ES } from "@/lib/datetime";
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_FILTRO_GASTO,
  CATEGORIAS_REPARTIBLES,
  categoriaGastoLabel,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import { leerFiltrosGastos } from "@/lib/admin/gastos-vista";
import { ROLES_ELIMINAN_GASTO, puedeEliminarGasto } from "@/lib/admin/gasto-acciones";
import { queryCambioDeMes } from "@/lib/admin/url-params";
import { RUTA_SECCION, TITULOS_SECCION } from "@/lib/admin/titulos-pestana";
import {
  AYUDA_ALTA_NOMINA,
  AYUDA_CAPTURA_NOMINA,
  CATEGORIA_NOMINA,
  DESCRIPCION_ERROR_NOMINA,
  DESCRIPCION_NOMINA,
  DESCRIPCION_VACIO_NOMINA,
  ETIQUETA_LISTA_NOMINA,
  ETIQUETA_NAV_MESES_NOMINA,
  ETIQUETA_POR_MEDIO_NOMINA,
  ETIQUETA_REGISTRAR_NOMINA,
  ETIQUETA_RESUMEN_NOMINA,
  ETIQUETA_VER_EN_GASTOS,
  MEDIO_DESCONOCIDO,
  MONEDA_DESCONOCIDA,
  NOTA_QUINCENA,
  ROLES_NOMINA,
  RUTA_NOMINA,
  SIN_PAGOS_QUINCENA,
  TITULO_ERROR_NOMINA,
  TITULO_NOMINA,
  avisoResumenIncompleto,
  centavosDeMonto,
  descripcionListaNomina,
  esMesFuturoNomina,
  esMesNomina,
  etiquetaMedioNomina,
  etiquetaMesNomina,
  etiquetaQuincena,
  hrefGastosNomina,
  hrefMesNomina,
  mesDeHoyNomina,
  mesNominaDeUrl,
  mesesVecinos,
  montoNomina,
  nombreExcelNomina,
  puedeVerNomina,
  queryExcelNomina,
  quincenaDeFecha,
  rangoMesNomina,
  resumenNomina,
  textoPagos,
  textoSinQuincena,
  tituloIrAMesNomina,
  tituloListaNomina,
  tituloTotalMesNomina,
  tituloVacioNomina,
  tituloVerEnGastos,
  type GastoNominaResumen,
} from "@/lib/admin/nomina";

const HOY = "2026-10-15";

const pago = (
  fecha_gasto: string | null,
  monto: string | number | null,
  medio_pago = "TRANSFERENCIA",
  moneda: string | null = "MXN",
  notas = "Pago de nómina",
): GastoNominaResumen & { notas: string } => ({ fecha_gasto, monto, moneda, medio_pago, notas });

/** Octubre 2026 (prod): 12 pagos, $109,921.46 MXN, todos del 1 al 15. */
const OCTUBRE: Array<GastoNominaResumen & { notas: string }> = [
  pago("2026-10-07", "5663.86", "TRANSFERENCIA", "MXN", "Cuota IMSS e INFONAVIT"),
  pago("2026-10-14", "5000.00", "TRANSFERENCIA", "MXN", "Asesoría de la nómina"),
  pago("2026-10-15", "6830.00", "TRANSFERENCIA", "MXN", "Sueldo · persona 1 · 1a oct"),
  pago("2026-10-15", "3565.80", "PAYWISE", "MXN", "Sueldo · persona 2 · 1a oct"),
  pago("2026-10-15", "4725.60", "TRANSFERENCIA", "MXN", "Sueldo · persona 3 · 1a oct"),
  pago("2026-10-15", "4725.60", "TRANSFERENCIA", "MXN", "Sueldo · persona 4 · 1a oct"),
  pago("2026-10-15", "1910.60", "EFECTIVO", "MXN", "Sueldo · persona 5 · 1a oct"),
  pago("2026-10-15", "7500.00", "TRANSFERENCIA", "MXN", "Sueldo · piloto 1 · 1a oct"),
  pago("2026-10-15", "2500.00", "EFECTIVO", "MXN", "Sueldo · persona 6 · 1a oct"),
  pago("2026-10-15", "22500.00", "TRANSFERENCIA", "MXN", "Sueldo · piloto 2 · 1a oct"),
  pago("2026-10-15", "17500.00", "TRANSFERENCIA", "MXN", "Sueldo · piloto 3 · 1a oct"),
  pago("2026-10-15", "27500.00", "TRANSFERENCIA", "MXN", "Sueldo · piloto 4 · 1a oct"),
];

/** Septiembre 2026 (prod): 5 pagos del 30-sep, $21,757.80 MXN. */
const SEPTIEMBRE = [
  pago("2026-09-30", "1910.60", "EFECTIVO"),
  pago("2026-09-30", "4725.60"),
  pago("2026-09-30", "4725.60"),
  pago("2026-09-30", "3566.00", "PAYWISE"),
  pago("2026-09-30", "6830.00"),
];

describe("categoría, ruta y roles", () => {
  it("la categoría es NOMINA, de EMPRESA, repartible y filtrable en Gastos; su etiqueta es el título", () => {
    expect(CATEGORIA_NOMINA).toBe("NOMINA");
    expect(categoriaGastoLabel(CATEGORIA_NOMINA)).toBe(TITULO_NOMINA);
    expect(CATEGORIAS_EMPRESA.has(CATEGORIA_NOMINA)).toBe(true);
    expect(CATEGORIAS_REPARTIBLES.has(CATEGORIA_NOMINA)).toBe(true);
    expect(CATEGORIAS_FILTRO_GASTO).toContain(CATEGORIA_NOMINA);
  });

  it("la sección del menú y la pestaña del navegador se llaman igual y apuntan a la misma ruta", () => {
    expect(RUTA_NOMINA).toBe("/admin/nomina");
    expect(TITULOS_SECCION.nomina).toBe(TITULO_NOMINA);
    expect(RUTA_SECCION.nomina).toBe(RUTA_NOMINA);
  });

  it("roles = los de Gastos y Otros gastos; falla CERRADO sin rol", () => {
    expect(ROLES_NOMINA).toEqual(["ADMIN", "COORDINADOR", "FACTURACION"]);
    for (const rol of ROLES_NOMINA) expect(puedeVerNomina(rol), rol).toBe(true);
    for (const rol of ["SOCIO", "ANALISTA", "PILOTO", "MECANICO", "VISITANTE", "admin", "", " ADMIN"]) {
      expect(puedeVerNomina(rol), rol).toBe(false);
    }
    expect(puedeVerNomina(null)).toBe(false);
    expect(puedeVerNomina(undefined)).toBe(false);
  });
});

describe("mes de la URL (url-params: lo inválido se IGNORA)", () => {
  it("un mes válido se respeta (también uno futuro o de otro año)", () => {
    expect(mesNominaDeUrl("2026-09", HOY)).toBe("2026-09");
    expect(mesNominaDeUrl("2025-12", HOY)).toBe("2025-12");
    expect(mesNominaDeUrl("2027-01", HOY)).toBe("2027-01");
    expect(mesNominaDeUrl("2000-01", HOY)).toBe("2000-01");
    expect(mesNominaDeUrl("2100-12", HOY)).toBe("2100-12");
  });

  it("cualquier otra cosa vale el mes de hoy en Cancún (sin lanzar)", () => {
    for (const malo of [
      undefined,
      null,
      "",
      "2026-13",
      "2026-00",
      "2026-1",
      "26-10",
      "2026-10-01",
      " 2026-10",
      "2026/10",
      "1999-12",
      "2101-01",
      "nada",
      ["2026-09"],
      202609,
      {},
    ]) {
      expect(mesNominaDeUrl(malo, HOY), JSON.stringify(malo)).toBe("2026-10");
      expect(esMesNomina(malo)).toBe(false);
    }
    expect(mesNominaDeUrl(undefined, "2027-01-01")).toBe("2027-01");
    expect(mesDeHoyNomina(HOY)).toBe("2026-10");
  });
});

describe("calendario sin Date con zona", () => {
  it("rango del mes con su último día REAL (30/31, febrero y bisiestos)", () => {
    expect(rangoMesNomina("2026-10")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoMesNomina("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoMesNomina("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoMesNomina("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
    expect(rangoMesNomina("2100-02").hasta).toBe("2100-02-28"); // divisible entre 100: no bisiesto
    expect(rangoMesNomina("2000-02").hasta).toBe("2000-02-29"); // divisible entre 400: bisiesto
    expect(rangoMesNomina("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    // Mismos días que Date.UTC para TODOS los meses de 2026 y 2028.
    for (const anio of [2026, 2028]) {
      for (let m = 1; m <= 12; m++) {
        const mes = `${anio}-${String(m).padStart(2, "0")}`;
        const dias = new Date(Date.UTC(anio, m, 0)).getUTCDate();
        expect(rangoMesNomina(mes).hasta, mes).toBe(`${mes}-${String(dias).padStart(2, "0")}`);
      }
    }
  });

  it("etiqueta del mes con la tabla única de lib/datetime", () => {
    expect(etiquetaMesNomina("2026-10")).toBe("octubre 2026");
    expect(etiquetaMesNomina("2026-09")).toBe("septiembre 2026");
    MESES_LARGOS_ES.forEach((nombre, i) => {
      expect(etiquetaMesNomina(`2026-${String(i + 1).padStart(2, "0")}`)).toBe(`${nombre} 2026`);
    });
  });

  it("meses vecinos con cruce de año", () => {
    expect(mesesVecinos("2026-10")).toEqual({ anterior: "2026-09", siguiente: "2026-11" });
    expect(mesesVecinos("2026-01")).toEqual({ anterior: "2025-12", siguiente: "2026-02" });
    expect(mesesVecinos("2026-12")).toEqual({ anterior: "2026-11", siguiente: "2027-01" });
  });

  it("el mes siguiente no se ofrece hacia el futuro (hoy Cancún)", () => {
    expect(esMesFuturoNomina("2026-11", HOY)).toBe(true);
    expect(esMesFuturoNomina("2026-10", HOY)).toBe(false);
    expect(esMesFuturoNomina("2026-09", HOY)).toBe(false);
    expect(esMesFuturoNomina("2027-01", "2026-12-31")).toBe(true);
    expect(esMesFuturoNomina("2026-12", "2027-01-01")).toBe(false);
  });

  it("un mes inválido (no debería llegar: la página lo valida) no lanza", () => {
    expect(() => rangoMesNomina("nada")).not.toThrow();
    expect(rangoMesNomina("nada")).toEqual({ desde: "2000-01-01", hasta: "2000-01-31" });
    expect(etiquetaMesNomina("2026-13")).toBe("enero 2000");
  });
});

describe("quincena por el TEXTO del día (la fecha del pago)", () => {
  it("1–15 ⇒ 1.ª; 16 al último ⇒ 2.ª", () => {
    expect(quincenaDeFecha("2026-10-01")).toBe(1);
    expect(quincenaDeFecha("2026-10-15")).toBe(1);
    expect(quincenaDeFecha("2026-10-16")).toBe(2);
    expect(quincenaDeFecha("2026-10-31")).toBe(2);
    expect(quincenaDeFecha("2026-09-30")).toBe(2);
    expect(quincenaDeFecha("2026-02-28")).toBe(2);
    expect(quincenaDeFecha(" 2026-10-07 ")).toBe(1);
  });

  it("jamás new Date(fecha): el 16 sigue en la 2.ª aunque en UTC−5 sea el 15", () => {
    // `new Date("2026-10-16")` es medianoche UTC = 15-oct 19:00 en Cancún.
    const enCancun = new Date(new Date("2026-10-16").getTime() - 5 * 3600 * 1000).getUTCDate();
    expect(enCancun).toBe(15);
    expect(quincenaDeFecha("2026-10-16")).toBe(2);
  });

  it("ilegible ⇒ null (con hora, sin día, día 00 o 32, vacío)", () => {
    for (const malo of [null, undefined, "", "2026-10", "15/10/2026", "2026-10-00", "2026-10-32", "2026-10-15T00:00:00Z"]) {
      expect(quincenaDeFecha(malo), String(malo)).toBeNull();
    }
  });

  it("etiquetas con el último día REAL del mes", () => {
    expect(etiquetaQuincena("2026-10", 1)).toBe("1ª quincena · 1–15 oct");
    expect(etiquetaQuincena("2026-10", 2)).toBe("2ª quincena · 16–31 oct");
    expect(etiquetaQuincena("2026-09", 2)).toBe("2ª quincena · 16–30 sep");
    expect(etiquetaQuincena("2026-02", 2)).toBe("2ª quincena · 16–28 feb");
    expect(etiquetaQuincena("2028-02", 2)).toBe("2ª quincena · 16–29 feb");
  });
});

describe("centavos: solo se suma lo registrado", () => {
  it("texto exacto, sin coma flotante", () => {
    expect(centavosDeMonto("5663.86")).toBe(566386);
    expect(centavosDeMonto("109921.46")).toBe(10992146);
    expect(centavosDeMonto("0.1")).toBe(10);
    expect(centavosDeMonto("7500")).toBe(750000);
    expect(centavosDeMonto("7500.00")).toBe(750000);
    expect(centavosDeMonto("+5")).toBe(500);
    expect(centavosDeMonto("-12.30")).toBe(-1230);
    expect(centavosDeMonto("1.005")).toBe(101); // como texto el 3.er decimal sí cuenta
    expect(centavosDeMonto("0.004")).toBe(0);
    expect(centavosDeMonto("-0.004")).toBe(0);
    expect(Object.is(centavosDeMonto("-0.004"), -0)).toBe(false);
  });

  it("números de PostgREST", () => {
    expect(centavosDeMonto(5663.86)).toBe(566386);
    expect(centavosDeMonto(0.1)).toBe(10);
    expect(centavosDeMonto(-2.345)).toBe(-235);
    expect(centavosDeMonto(0)).toBe(0);
  });

  it("ilegible ⇒ 0 (no tumba nada)", () => {
    for (const malo of [null, undefined, "", "  ", "abc", "1,234.56", "12.", ".5", "1e3", Number.NaN, Infinity, -Infinity, {}, "9".repeat(30)]) {
      expect(centavosDeMonto(malo), String(malo)).toBe(0);
    }
  });
});

describe("resumen del mes con los montos REALES de prod", () => {
  it("octubre 2026: 12 pagos MXN = $109,921.46, todos en la 1.ª quincena", () => {
    const r = resumenNomina(OCTUBRE);
    expect(r.pagos).toBe(12);
    expect(r.total).toEqual([{ moneda: "MXN", total: 109921.46 }]);
    expect(r.quincenas).toEqual([
      { quincena: 1, total: [{ moneda: "MXN", total: 109921.46 }], pagos: 12 },
      { quincena: 2, total: [], pagos: 0 },
    ]);
    expect(r.sinQuincena).toBe(0);
    // Por medio: dentro de la moneda, de mayor a menor.
    expect(r.porMedio).toEqual([
      { moneda: "MXN", medio: "TRANSFERENCIA", total: 101945.06 },
      { moneda: "MXN", medio: "EFECTIVO", total: 4410.6 },
      { moneda: "MXN", medio: "PAYWISE", total: 3565.8 },
    ]);
    expect(montoNomina(r.total[0].total, "MXN")).toBe("$109,921.46 MXN");
  });

  it("septiembre 2026: 5 pagos del 30-sep = $21,757.80, todos en la 2.ª quincena", () => {
    const r = resumenNomina(SEPTIEMBRE);
    expect(r.pagos).toBe(5);
    expect(r.total).toEqual([{ moneda: "MXN", total: 21757.8 }]);
    expect(r.quincenas[0]).toEqual({ quincena: 1, total: [], pagos: 0 });
    expect(r.quincenas[1]).toEqual({ quincena: 2, total: [{ moneda: "MXN", total: 21757.8 }], pagos: 5 });
    expect(montoNomina(r.total[0].total, "MXN")).toBe("$21,757.80 MXN");
  });

  it("CENTAVOS enteros: 0.1 + 0.2 = 0.30 exacto", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // la trampa que se evita
    const r = resumenNomina([pago("2026-10-01", "0.1"), pago("2026-10-02", 0.2)]);
    expect(r.total).toEqual([{ moneda: "MXN", total: 0.3 }]);
    expect(montoNomina(r.total[0].total, "MXN")).toBe("$0.30 MXN");
  });

  it("MXN y USD jamás se mezclan: un total por moneda (MXN, USD, el resto y al final la desconocida)", () => {
    const r = resumenNomina([
      pago("2026-10-20", "250.50", "TRANSFERENCIA", "USD"),
      pago("2026-10-05", "1000", "EFECTIVO", "MXN"),
      pago("2026-10-21", "99.99", "TRANSFERENCIA", "EUR"),
      pago("2026-10-22", "10", "TRANSFERENCIA", null),
      pago("2026-10-06", "300", "TRANSFERENCIA", "USD"),
    ]);
    expect(r.total).toEqual([
      { moneda: "MXN", total: 1000 },
      { moneda: "USD", total: 550.5 },
      { moneda: "EUR", total: 99.99 },
      { moneda: "", total: 10 },
    ]);
    expect(r.quincenas[0].total).toEqual([
      { moneda: "MXN", total: 1000 },
      { moneda: "USD", total: 300 },
    ]);
    expect(r.quincenas[1].total).toEqual([
      { moneda: "USD", total: 250.5 },
      { moneda: "EUR", total: 99.99 },
      { moneda: "", total: 10 },
    ]);
    expect(r.porMedio.map((m) => `${m.moneda}|${m.medio}|${m.total}`)).toEqual([
      "MXN|EFECTIVO|1000",
      "USD|TRANSFERENCIA|550.5",
      "EUR|TRANSFERENCIA|99.99",
      "|TRANSFERENCIA|10",
    ]);
  });

  it("un monto ilegible cuenta 0 (pero el pago se cuenta) y una fecha ilegible no cae en ninguna quincena", () => {
    const r = resumenNomina([
      pago("2026-10-03", "abc"),
      pago("2026-10-04", "100"),
      pago(null, "50"),
      { monto: "25" },
    ]);
    expect(r.pagos).toBe(4);
    expect(r.total).toEqual([
      { moneda: "MXN", total: 150 },
      { moneda: "", total: 25 },
    ]);
    expect(r.quincenas[0]).toEqual({ quincena: 1, total: [{ moneda: "MXN", total: 100 }], pagos: 2 });
    expect(r.quincenas[1]).toEqual({ quincena: 2, total: [], pagos: 0 });
    expect(r.sinQuincena).toBe(2);
  });

  it("sin pagos: todo vacío, sin lanzar", () => {
    expect(resumenNomina([])).toEqual({
      total: [],
      pagos: 0,
      porMedio: [],
      quincenas: [
        { quincena: 1, total: [], pagos: 0 },
        { quincena: 2, total: [], pagos: 0 },
      ],
      sinQuincena: 0,
    });
  });

  it("montos y medios con las fuentes únicas (fmtMonto y medios-pago)", () => {
    expect(montoNomina(1200, "USD")).toBe("$1,200 USD");
    expect(montoNomina(4410.6, "MXN")).toBe("$4,410.60 MXN");
    expect(montoNomina(300, "")).toBe(`$300 ${MONEDA_DESCONOCIDA}`);
    expect(MONEDA_DESCONOCIDA).toBe("(moneda desconocida)");
    expect(etiquetaMedioNomina("TRANSFERENCIA")).toBe("Transferencia");
    expect(etiquetaMedioNomina("PAYWISE")).toBe("Paywise");
    expect(etiquetaMedioNomina("EFECTIVO")).toBe("Efectivo");
    expect(etiquetaMedioNomina("OTRO_MEDIO")).toBe("OTRO_MEDIO");
    expect(etiquetaMedioNomina("")).toBe(MEDIO_DESCONOCIDO);
    expect(MEDIO_DESCONOCIDO).toBe("Sin medio de pago");
  });
});

describe("enlaces y Excel", () => {
  it("«Ver en Gastos»: categoría y fechas del mes, que Gastos lee con su MISMA función", () => {
    const href = hrefGastosNomina("2026-10");
    expect(href).toBe("/admin/expenses?categoria=NOMINA&desde=2026-10-01&hasta=2026-10-31");
    const params = new URLSearchParams(href.split("?")[1]);
    const filtros = leerFiltrosGastos((k) => params.get(k));
    expect(filtros).toMatchObject({ vista: "todos", categoria: "NOMINA", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(hrefGastosNomina("2026-02")).toBe("/admin/expenses?categoria=NOMINA&desde=2026-02-01&hasta=2026-02-28");
  });

  it("el mes en la URL de Nómina, de ida y vuelta", () => {
    expect(hrefMesNomina("2026-09")).toBe("/admin/nomina?mes=2026-09");
    const mes = new URLSearchParams(hrefMesNomina("2025-12").split("?")[1]).get("mes");
    expect(mesNominaDeUrl(mes, HOY)).toBe("2025-12");
  });

  it("«‹ mes» / «mes ›» conservan la búsqueda `tq` y sueltan la página `tp` (revisión 15-oct-2026)", () => {
    // La oficina buscó «luis» en la tabla de octubre (DataTable escribió
    // tq con replaceState) y pulsa «‹ septiembre 2026»: la búsqueda se queda.
    const href = hrefMesNomina("2026-09", "mes=2026-10&tq=luis&tp=3");
    expect(href).toBe("/admin/nomina?mes=2026-09&tq=luis");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("tq")).toBe("luis");
    expect(params.has("tp")).toBe(false);
    expect(mesNominaDeUrl(params.get("mes"), HOY)).toBe("2026-09");
    // De ida y vuelta: el regreso a octubre trae la MISMA búsqueda.
    expect(hrefMesNomina("2026-10", href.split("?")[1])).toBe("/admin/nomina?mes=2026-10&tq=luis");
    // Búsqueda con espacios y acentos: se codifica y se lee igual.
    const conAcentos = hrefMesNomina("2026-11", new URLSearchParams({ mes: "2026-10", tq: "Itzel Villalobos ñ" }).toString());
    expect(new URLSearchParams(conAcentos.split("?")[1]).get("tq")).toBe("Itzel Villalobos ñ");
    // Un `?mes=` previo inválido se reemplaza por el mes del enlace.
    expect(hrefMesNomina("2026-09", "mes=basura&tq=imss")).toBe("/admin/nomina?mes=2026-09&tq=imss");
  });

  it("enlace y campo «Mes» cambian de mes con la MISMA regla (queryCambioDeMes)", () => {
    for (const actuales of ["", "mes=2026-10", "mes=2026-10&tq=luis", "tq=luis&tp=2", "mes=2026-10&tq=luis&tp=4"]) {
      expect(hrefMesNomina("2026-09", actuales), actuales).toBe(
        `/admin/nomina?${queryCambioDeMes(actuales, "2026-09")}`,
      );
    }
  });

  it("Excel: la query de /v1/expenses/export y el nombre del archivo", () => {
    expect(queryExcelNomina("2026-10")).toEqual({ categoria: "NOMINA", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(queryExcelNomina("2028-02")).toEqual({ categoria: "NOMINA", desde: "2028-02-01", hasta: "2028-02-29" });
    expect(nombreExcelNomina("2026-10")).toBe("nomina-2026-10.xlsx");
  });
});

describe("textos EXACTOS de la pantalla", () => {
  it("ayuda del alta con «Nómina»: de EMPRESA aunque traiga avión; a un avión solo repartida (revisión 15-oct-2026)", () => {
    expect(AYUDA_ALTA_NOMINA).toBe(
      "sin vuelo. Es gasto de VuelaTour (va a «otros gastos» del Balance general) aunque elijas un avión: el avión queda solo como referencia y no le resta nada. Para cargarla a uno o varios aviones usa «Repartir entre aviones» (aquí al guardar si no eliges avión, o después desde su menú ⋯ o «Verificar / editar»). Su seguimiento vive en la pantalla «Nómina».",
    );
    // El texto viejo invitaba a ligar el sueldo al avión del piloto como si
    // con eso se lo cargara (invariante 10 del API: no le resta nada).
    expect(AYUDA_ALTA_NOMINA).not.toMatch(/piloto de un solo avión|el avión\s+es opcional/);
    // Dice lo mismo que el hint «Con lo elegido cae en: …» del MISMO formulario.
    expect(hojaDestinoGasto(CATEGORIA_NOMINA, false, true)).toContain("el avión queda solo como referencia");
    expect(AYUDA_ALTA_NOMINA).toContain("el avión queda solo como referencia");
    expect(AYUDA_ALTA_NOMINA).toContain(`la pantalla «${TITULO_NOMINA}»`);
  });

  it("cabecera, alta y ayuda", () => {
    expect(TITULO_NOMINA).toBe("Nómina");
    expect(DESCRIPCION_NOMINA).toBe(
      "Todo lo de la nómina en un solo lugar: sueldos del personal y de los pilotos, cuotas del IMSS e INFONAVIT y la asesoría de la nómina (los gastos con categoría «Nómina»). Es gasto de VuelaTour: va a «otros gastos» del Balance general; si una parte le toca a un avión, repártela desde «Verificar / editar».",
    );
    expect(ETIQUETA_REGISTRAR_NOMINA).toBe("Registrar pago de nómina");
    expect(AYUDA_CAPTURA_NOMINA).toBe(
      "En «Notas» escribe a quién se le pagó y qué quincena (p. ej. «Luis · 1a oct»): así lo encuentras con la búsqueda de la tabla.",
    );
    expect(NOTA_QUINCENA).toBe("La quincena sale de la fecha del gasto (la del pago).");
    expect(ETIQUETA_VER_EN_GASTOS).toBe("Ver en Gastos");
    expect(tituloVerEnGastos("2026-10")).toBe("Abre Gastos con la categoría «Nómina» y las fechas de octubre 2026.");
  });

  it("vacío y error (jamás «sin pagos» cuando la carga falló)", () => {
    expect(tituloVacioNomina("2026-10")).toBe("Sin pagos de nómina en octubre 2026");
    expect(DESCRIPCION_VACIO_NOMINA).toBe(
      "Aquí aparecen los gastos con categoría «Nómina» del mes elegido. Regístralos con «Registrar pago de nómina» o, si se capturaron con otra categoría, cámbiala a «Nómina» en Gastos → «Verificar / editar».",
    );
    expect(TITULO_ERROR_NOMINA).toBe("No se pudo cargar la nómina");
    expect(DESCRIPCION_ERROR_NOMINA).toBe(
      "El servidor no respondió: todavía no sabemos qué pagos de nómina hay en este mes. Pulsa Reintentar; el mes elegido se conserva.",
    );
    expect(DESCRIPCION_ERROR_NOMINA).not.toMatch(/sin pagos/i);
  });

  it("resumen, tabla y navegación", () => {
    expect(textoPagos(1)).toBe("1 pago");
    expect(textoPagos(12)).toBe("12 pagos");
    expect(textoPagos(0)).toBe("0 pagos");
    expect(SIN_PAGOS_QUINCENA).toBe("Sin pagos");
    expect(tituloTotalMesNomina("2026-10")).toBe("Total de octubre 2026");
    expect(tituloListaNomina("2026-10")).toBe("Pagos de nómina · octubre 2026");
    expect(ETIQUETA_LISTA_NOMINA).toBe("Pagos de nómina");
    expect(ETIQUETA_RESUMEN_NOMINA).toBe("Resumen de la nómina del mes");
    expect(ETIQUETA_POR_MEDIO_NOMINA).toBe("Por medio de pago");
    expect(ETIQUETA_NAV_MESES_NOMINA).toBe("Cambiar de mes");
    expect(tituloIrAMesNomina("2026-09")).toBe("Ver la nómina de septiembre 2026");
    expect(avisoResumenIncompleto(12, 13)).toBe(
      "El resumen suma solo lo que cargó (12 de 13 pagos): recarga la página para ver el total completo del mes.",
    );
    expect(textoSinQuincena(1)).toBe("1 pago no tiene una fecha legible: cuenta en el total, pero en ninguna quincena.");
    expect(textoSinQuincena(2)).toBe("2 pagos no tienen una fecha legible: cuentan en el total, pero en ninguna quincena.");
  });
});

describe("descripción de la tabla según el rol (revisión 15-oct-2026)", () => {
  it("ADMIN y COORDINADOR: el menú ⋯ trae «Eliminar»; «Repartir» solo en los pagos sin vuelo", () => {
    const texto =
      "Cada pago es un gasto completo: su menú ⋯ trae «Verificar / editar», «Repartir entre aviones» (en los pagos sin vuelo) y «Eliminar», y en su renglón están el comprobante, la facturación y el banco.";
    expect(descripcionListaNomina("ADMIN")).toBe(texto);
    expect(descripcionListaNomina("COORDINADOR")).toBe(texto);
  });

  it("FACTURACION ve Nómina pero el menú le esconde «Eliminar»: el texto no se lo promete", () => {
    expect(descripcionListaNomina("FACTURACION")).toBe(
      "Cada pago es un gasto completo: su menú ⋯ trae «Verificar / editar» y «Repartir entre aviones» (en los pagos sin vuelo), y en su renglón están el comprobante, la facturación y el banco.",
    );
    expect(descripcionListaNomina("FACTURACION")).not.toContain("Eliminar");
  });

  it("la MISMA regla del menú ⋯ (puedeEliminarGasto) para cada rol que ve la pantalla", () => {
    for (const rol of ROLES_NOMINA) {
      expect(descripcionListaNomina(rol).includes("«Eliminar»"), rol).toBe(puedeEliminarGasto(rol));
      expect(descripcionListaNomina(rol).includes("«Eliminar»"), rol).toBe(
        (ROLES_ELIMINAN_GASTO as readonly string[]).includes(rol),
      );
    }
    // Sin rol el menú no esconde nada (el API es el candado): el texto tampoco.
    expect(descripcionListaNomina(null)).toContain("«Eliminar»");
  });
});

describe("pureza (la usa también el menú)", () => {
  const fuente = readFileSync(path.resolve(__dirname, "../nomina.ts"), "utf8");

  it("sin React, red ni Next: solo libs puras", () => {
    const origenes = [...fuente.matchAll(/^import[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(origenes).toEqual([
      "@/lib/datetime",
      "@/lib/format",
      "@/lib/admin/medios-pago",
      "@/lib/admin/gasto-acciones",
      "@/lib/admin/url-params",
    ]);
    expect(fuente).not.toMatch(/["']react["']|@\/lib\/api|next\//);
  });

  it("sin Date con zona ni toLocaleString", () => {
    expect(fuente).not.toMatch(/new Date\(/);
    expect(fuente).not.toMatch(/toLocale(?:Date)?String/);
  });
});
