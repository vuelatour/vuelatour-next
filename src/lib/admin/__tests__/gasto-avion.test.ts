/**
 * «Avión · vuelo» de la tabla única de Gastos (14-oct-2026): a dónde va el
 * dinero de cada renglón. «Falta avión» es ESPEJO EXACTO de la bandeja de
 * pendientes del API (`aeronave_id` null y categoría fuera de
 * `CATEGORIAS_GASTO_SIN_AVION`): así el ámbar de la tabla suma lo mismo que la
 * pestaña «Pendientes» (36 en prod el 14-oct; antes la columna decía
 * «Pendiente» en 251 gastos).
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORIA_GASTO_LABELS,
  categoriaLlevaAvion,
} from "@/lib/admin/categorias-gasto";
import {
  DESTINO_VUELATOUR_REPARTIBLE_TABLA,
  DETALLE_PAGO_AFAC,
  TITULO_PAGO_AFAC_AVION,
  ETIQUETA_AVION_PERSONAL,
  ETIQUETA_AVION_VUELATOUR,
  ETIQUETA_FALTA_AVION,
  ETIQUETA_REPARTIDO,
  MATRICULA_DESCONOCIDA,
  TEXTO_VER_AVION,
  TITULO_FALTA_AVION,
  TITULO_REFERENCIA_AVION,
  estadoAvionGasto,
  etiquetaAvionGasto,
  textoReferenciaAvion,
  textoVueloGasto,
  tituloFueraDelAvion,
  tituloRemanenteReparto,
  type EstadoAvionGasto,
} from "@/lib/admin/gasto-avion";
import type { Gasto } from "@/types/expenses";

type G = Parameters<typeof estadoAvionGasto>[0];
const gasto = (over: Partial<Gasto> = {}): G => ({
  categoria: "COMIDA",
  aeronave_id: null,
  aeronave: null,
  repartos: [],
  vuelo_id: null,
  monto: "1000.00",
  ...over,
});

const VUELATOUR_SIN_AVION = ["OTRO", "NOMINA", "GASOLINA", "FIJO", "VISITA", "COMISION_VENDEDOR", "INDIRECTO"];

describe("estadoAvionGasto · sin avión ni reparto (las 22 categorías)", () => {
  it("empresa, comisión (VuelaTour) e INDIRECTO ⇒ «VuelaTour»; PERSONAL_DUENO ⇒ «Personal»; las 14 restantes ⇒ «Falta avión»", () => {
    const todas = Object.keys(CATEGORIA_GASTO_LABELS);
    expect(todas).toHaveLength(22);
    const faltan: string[] = [];
    for (const categoria of todas) {
      const e = estadoAvionGasto(gasto({ categoria }));
      if (VUELATOUR_SIN_AVION.includes(categoria)) {
        expect(e, categoria).toMatchObject({ tipo: "FUERA_DEL_AVION", etiqueta: "VuelaTour", referencia: null });
      } else if (categoria === "PERSONAL_DUENO") {
        expect(e, categoria).toMatchObject({ tipo: "FUERA_DEL_AVION", etiqueta: "Personal", referencia: null });
      } else {
        expect(e, categoria).toEqual({ tipo: "FALTA" });
        faltan.push(categoria);
      }
      // Invariante: «Falta avión» ⇔ la categoría lleva avión (la regla del API).
      expect(e.tipo === "FALTA", categoria).toBe(categoriaLlevaAvion(categoria));
    }
    expect(faltan).toHaveLength(14);
    // A propósito, igual que el API: la «(avión)», los servicios del avión,
    // la refacción y el comisariato sin avión SÍ son pendientes.
    for (const c of ["COMISION_VENDEDOR_AVION", "SERVICIOS", "REFACCION", "COMISARIATO"]) {
      expect(faltan, c).toContain(c);
    }
  });
});

describe("estadoAvionGasto · con avión", () => {
  it("empresa y comisión (VuelaTour) ⇒ «VuelaTour» con la matrícula de referencia (aunque traiga avión)", () => {
    for (const categoria of ["OTRO", "GASOLINA", "COMISION_VENDEDOR"]) {
      const e = estadoAvionGasto(
        gasto({ categoria, aeronave_id: "av-1", aeronave: { matricula: "N4142R" }, vuelo_id: "v-1" }),
      );
      expect(e, categoria).toMatchObject({ tipo: "FUERA_DEL_AVION", etiqueta: "VuelaTour", referencia: "N4142R" });
    }
  });

  it("INDIRECTO y OPERACIONES con avión ⇒ su matrícula; sin el join ⇒ matrícula null", () => {
    expect(estadoAvionGasto(gasto({ categoria: "INDIRECTO", aeronave_id: "av-1", aeronave: { matricula: "N4142R" } }))).toEqual({
      tipo: "AVION",
      aeronaveId: "av-1",
      matricula: "N4142R",
    });
    expect(estadoAvionGasto(gasto({ categoria: "OPERACIONES", aeronave_id: "av-2", aeronave: { matricula: "XA-VGV" } }))).toEqual({
      tipo: "AVION",
      aeronaveId: "av-2",
      matricula: "XA-VGV",
    });
    expect(estadoAvionGasto(gasto({ categoria: "OPERACIONES", aeronave_id: "av-3", aeronave: null }))).toEqual({
      tipo: "AVION",
      aeronaveId: "av-3",
      matricula: null,
    });
  });

  it("PERSONAL_DUENO con avión sigue siendo «Personal» (con referencia)", () => {
    expect(
      estadoAvionGasto(gasto({ categoria: "PERSONAL_DUENO", aeronave_id: "av-1", aeronave: { matricula: "N4142R" } })),
    ).toMatchObject({ tipo: "FUERA_DEL_AVION", etiqueta: "Personal", referencia: "N4142R" });
  });

  it("el title dice a qué hoja va (hojaDestinoGasto con vuelo y avión)", () => {
    const e = estadoAvionGasto(gasto({ categoria: "OTRO", aeronave_id: "av-1", aeronave: { matricula: "N4142R" }, vuelo_id: "v-1" }));
    expect(e).toMatchObject({
      titulo: "Va a: Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia).",
    });
  });
});

describe("estadoAvionGasto · reparto (gana a todo)", () => {
  it("OTRO de 1000 repartido 300 + 300 ⇒ remanente 400", () => {
    const e = estadoAvionGasto(
      gasto({
        categoria: "OTRO",
        repartos: [
          { aeronave_id: "a1", monto: "300", aeronave: { matricula: "N4142R" } },
          { aeronave_id: "a2", monto: 300, aeronave: { matricula: "N621TX" } },
        ],
      }),
    );
    expect(e).toEqual({
      tipo: "REPARTIDO",
      partes: [
        { aeronaveId: "a1", matricula: "N4142R", monto: 300 },
        { aeronaveId: "a2", matricula: "N621TX", monto: 300 },
      ],
      remanente: 400,
    });
  });

  it("100 entre 3 partes de 33.33 ⇒ remanente EXACTO 0.01 (centavos, sin error de coma flotante)", () => {
    const e = estadoAvionGasto(
      gasto({
        categoria: "INDIRECTO",
        monto: "100.00",
        repartos: [
          { aeronave_id: "a1", monto: "33.33" },
          { aeronave_id: "a2", monto: "33.33" },
          { aeronave_id: "a3", monto: "33.33", aeronave: null },
        ],
      }),
    );
    expect(e.tipo).toBe("REPARTIDO");
    if (e.tipo !== "REPARTIDO") return;
    expect(e.remanente).toBe(0.01);
    // Sin matrícula en el join ⇒ null (la celda pinta «¿?»).
    expect(e.partes.map((p) => p.matricula)).toEqual([null, null, null]);
  });

  it("un reparto completo deja remanente 0 aunque el gasto traiga avión", () => {
    const e = estadoAvionGasto(
      gasto({
        categoria: "OTRO",
        monto: "4733.76",
        aeronave_id: "av-1",
        aeronave: { matricula: "N990GG" },
        repartos: [
          { aeronave_id: "a1", monto: "1577.92" },
          { aeronave_id: "a2", monto: "1577.92" },
          { aeronave_id: "a3", monto: "1577.92" },
        ],
      }),
    );
    expect(e).toMatchObject({ tipo: "REPARTIDO", remanente: 0 });
  });
});

describe("textos de «Avión · vuelo»", () => {
  it("constantes exactas", () => {
    expect(ETIQUETA_FALTA_AVION).toBe("Falta avión");
    expect(TITULO_FALTA_AVION).toBe(
      "Este gasto necesita avión y no lo tiene: cuenta en la pestaña «Pendientes». Asígnalo en «Verificar / editar» (menú ⋯) o con «Sugerir asignaciones».",
    );
    expect(ETIQUETA_AVION_VUELATOUR).toBe("VuelaTour");
    expect(ETIQUETA_AVION_PERSONAL).toBe("Personal");
    expect(ETIQUETA_REPARTIDO).toBe("Repartido:");
    expect(TITULO_REFERENCIA_AVION).toBe("El avión queda solo como referencia: este gasto no se carga a ese avión.");
    expect(TEXTO_VER_AVION).toBe("Ver avión");
    expect(MATRICULA_DESCONOCIDA).toBe("¿?");
  });

  it("tituloFueraDelAvion, referencia, remanente y vuelo", () => {
    // Revisión del 14-oct-2026: sin vuelo ni avión el reparto está en el
    // menú ⋯ del MISMO renglón; ya no se manda a «la pantalla Otros gastos».
    expect(tituloFueraDelAvion("OTRO", false, false)).toBe(
      "Va a: Balance general VuelaTour · Otros gastos (para cargarlo a aviones, usa «Repartir entre aviones» en el menú ⋯).",
    );
    expect(tituloFueraDelAvion("OTRO", false, false)).toBe(`Va a: ${DESTINO_VUELATOUR_REPARTIBLE_TABLA}.`);
    for (const cat of ["NOMINA", "GASOLINA", "FIJO", "VISITA", "INDIRECTO"]) {
      expect(tituloFueraDelAvion(cat, false, false), cat).toBe(`Va a: ${DESTINO_VUELATOUR_REPARTIBLE_TABLA}.`);
    }
    // Con vuelo o avión, la hoja de siempre (solo referencia).
    expect(tituloFueraDelAvion("OTRO", true, false)).toBe(
      "Va a: Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia).",
    );
    expect(tituloFueraDelAvion("PERSONAL_DUENO", false, false)).toBe("Va a: Fuera de balances (personal).");
    // Ningún título de la tabla manda a otra pantalla a repartir.
    const PROHIBIDO = /(pantalla|desde|en) «?otros gastos/i;
    for (const cat of Object.keys(CATEGORIA_GASTO_LABELS)) {
      for (const vuelo of [false, true]) {
        for (const avion of [false, true]) {
          expect(PROHIBIDO.test(tituloFueraDelAvion(cat, vuelo, avion)), `${cat} ${vuelo} ${avion}`).toBe(false);
        }
      }
    }
    expect(textoReferenciaAvion("N4142R")).toBe("ref. N4142R");
    expect(tituloRemanenteReparto(400, "MXN")).toBe("Parte que absorbe la empresa: $400 MXN");
    expect(tituloRemanenteReparto(0.01, "USD")).toBe("Parte que absorbe la empresa: $0.01 USD");
    expect(textoVueloGasto(437)).toBe("Vuelo #437");
    expect(textoVueloGasto("441")).toBe("Vuelo #441");
    expect(textoVueloGasto(null)).toBe("Ver vuelo");
    expect(textoVueloGasto(undefined)).toBe("Ver vuelo");
  });

  it("etiquetaAvionGasto de cada tipo", () => {
    const casos: Array<[EstadoAvionGasto, string]> = [
      [{ tipo: "REPARTIDO", partes: [], remanente: 0 }, "Repartido"],
      [{ tipo: "FUERA_DEL_AVION", etiqueta: "VuelaTour", referencia: null, titulo: "" }, "VuelaTour"],
      [{ tipo: "FUERA_DEL_AVION", etiqueta: "Personal", referencia: null, titulo: "" }, "Personal"],
      [{ tipo: "AVION", aeronaveId: "a", matricula: "XA-VGV" }, "XA-VGV"],
      [{ tipo: "AVION", aeronaveId: "a", matricula: null }, "Avión asignado"],
      [{ tipo: "FALTA" }, "Falta avión"],
    ];
    for (const [e, txt] of casos) expect(etiquetaAvionGasto(e)).toBe(txt);
  });
});

describe("estadoAvionGasto · PERMISO marcado «Pago de AFAC» (16-oct-2026, API 0.0.89, invariante 90)", () => {
  // Prod 1-sep-2026: «Permisos Vuelos Privados VGV» $5,000 de XA-VGV (Yousefh Pineda Bedolla).
  it("marcado ⇒ «VuelaTour · pago de AFAC» con la matrícula de REFERENCIA (no se le carga al avión)", () => {
    const e = estadoAvionGasto(
      gasto({ categoria: "PERMISO", aeronave_id: "av-vgv", aeronave: { matricula: "XA-VGV" }, es_pago_afac: true }),
    );
    expect(e).toEqual({
      tipo: "FUERA_DEL_AVION",
      etiqueta: "VuelaTour",
      referencia: "XA-VGV",
      titulo: TITULO_PAGO_AFAC_AVION,
      detalle: DETALLE_PAGO_AFAC,
    });
    expect(etiquetaAvionGasto(e)).toBe("VuelaTour · pago de AFAC");
    expect(TITULO_PAGO_AFAC_AVION).toBe(
      "Va a: Balance general VuelaTour · otros movimientos (AFAC por vuelo). Lo paga VuelaTour: no le resta al avión.",
    );
  });

  it("marcado sin avión (el de $670 de «Pago de derechos») ⇒ «VuelaTour · pago de AFAC», no «Falta avión»", () => {
    const e = estadoAvionGasto(gasto({ categoria: "PERMISO", es_pago_afac: true }));
    expect(e).toMatchObject({ tipo: "FUERA_DEL_AVION", etiqueta: "VuelaTour", referencia: null, detalle: DETALLE_PAGO_AFAC });
  });

  it("sin marcar (o sin la llave del API) ⇒ como siempre: su matrícula o «Falta avión»", () => {
    expect(estadoAvionGasto(gasto({ categoria: "PERMISO", aeronave_id: "av-vgv", aeronave: { matricula: "XA-VGV" } }))).toEqual({
      tipo: "AVION",
      aeronaveId: "av-vgv",
      matricula: "XA-VGV",
    });
    expect(estadoAvionGasto(gasto({ categoria: "PERMISO", es_pago_afac: false }))).toEqual({ tipo: "FALTA" });
    // La marca SOLO vale en Permiso (defensa: el trigger del API ya la quita).
    expect(estadoAvionGasto(gasto({ categoria: "OPERACIONES", aeronave_id: "a", es_pago_afac: true }))).toMatchObject({
      tipo: "AVION",
    });
  });
});
