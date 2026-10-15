/**
 * Selección de movimientos en Conciliación (14-oct-2026, API 0.0.77): el
 * predicado ÚNICO en las dos vistas, el tope de 200, la poda derivada, el
 * resumen por tipo y moneda EN CENTAVOS (MXN primero, nunca mezcla), qué
 * acción de la barra aplica (con cada motivo exacto) y los textos. Con la
 * paridad de los topes contra el API (si el repo hermano está al lado).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_DESHACER_OMISION,
  BOTON_LIMPIAR,
  BOTON_OMITIR,
  BOTON_QUITAR_SELECCION,
  BOTON_VINCULAR_A_GASTO,
  ETIQUETA_REGION_SELECCION,
  MAX_CARGOS_A_GASTO,
  MIN_CARGOS_A_GASTO,
  MOTIVO_VINCULAR_SIN_MONEDA,
  MOTIVO_VINCULAR_SOLO_CARGOS,
  MOTIVO_VINCULAR_TOPE,
  TEXTO_TOPE_SELECCION,
  TOPE_SELECCION,
  accionesDeSeleccion,
  alternarSeleccion,
  centavosDe,
  esSeleccionable,
  etiquetaCasillaMovimiento,
  motivoVincularMonedas,
  resumenSeleccion,
  seleccionVigente,
  seleccionarTodas,
  textoResumenSeleccion,
  textoSeleccionRetirada,
  textoSeleccionarTodas,
  vistaSeleccionDeFiltro,
} from "../conciliacion-seleccion";
import { esOmitido } from "../conciliacion-omision";
import type { MovimientoBancario } from "@/types/conciliacion";

const MXN = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const USD = "5b0c2a10-1111-4c4c-9d9d-0123456789ab";
const MONEDAS = { [MXN]: "MXN", [USD]: "USD" };

let n = 0;
const mov = (m: Partial<MovimientoBancario> = {}): MovimientoBancario => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    cuenta_bancaria_id: MXN,
    fecha: "2026-09-24",
    tipo: "CARGO",
    monto: "1.12",
    descripcion: "IVA - COMISIONES",
    referencia: null,
    conciliado: false,
    gasto_id: null,
    cobro_id: null,
    clasificacion_id: null,
    origen: "IMPORTADO",
    notas: null,
    created_at: "2026-09-29T15:00:00Z",
    omision: null,
    ...m,
  };
};
const OMISION = { motivo: "Comisión o IVA del banco", por: "Alejandro Canales", fecha: "14-oct-2026" };

describe("esSeleccionable: el predicado ÚNICO", () => {
  it("vista «lista»: solo PENDIENTE y LIBRE (cargos y abonos)", () => {
    expect(esSeleccionable(mov(), "lista")).toBe(true);
    expect(esSeleccionable(mov({ tipo: "ABONO" }), "lista")).toBe(true);
    const ocupados: Partial<MovimientoBancario>[] = [
      { conciliado: true },
      { gasto_id: "g1" },
      { gastos_n: 2 },
      { gastos: [{ id: "g" } as never] },
      { cobro_id: "c1" },
      { cobro_grupo_id: "s1" },
      { cobros_n: 3 },
      { ingreso_id: "i1" },
      { clasificacion_id: "cl1" },
      { reverso_de_id: "r1" },
      { revertido_por: { id: "r2" } as never },
      { conciliado: true, clasificacion_id: "x", omision: OMISION },
    ];
    for (const o of ocupados) expect(esSeleccionable(mov(o), "lista"), JSON.stringify(o)).toBe(false);
  });

  it("vista «omitidos»: la fila trae su omisión (el MISMO criterio de esOmitido)", () => {
    const omitido = mov({ conciliado: true, clasificacion_id: "x", omision: OMISION });
    const daniado = mov({ conciliado: true, clasificacion_id: "x", omision: { motivo: null, por: null, fecha: null } });
    expect(esSeleccionable(omitido, "omitidos")).toBe(true);
    expect(esSeleccionable(daniado, "omitidos")).toBe(true);
    expect(esSeleccionable(mov(), "omitidos")).toBe(false);
    expect(esSeleccionable(mov({ omision: undefined }), "omitidos")).toBe(false);
    for (const m of [omitido, daniado, mov(), mov({ omision: undefined })]) {
      expect(esSeleccionable(m, "omitidos")).toBe(esOmitido(m));
    }
  });

  it("qué pestaña selecciona: Todos y Pendientes ⇒ lista; Omitidos ⇒ omitidos; las demás nunca", () => {
    expect(vistaSeleccionDeFiltro("todos")).toBe("lista");
    expect(vistaSeleccionDeFiltro("pendientes")).toBe("lista");
    expect(vistaSeleccionDeFiltro("omitidos")).toBe("omitidos");
    for (const f of ["conciliados", "sin_banco", "cobros_sin_banco", "paywise", "", null, undefined]) {
      expect(vistaSeleccionDeFiltro(f)).toBeNull();
    }
  });
});

describe("tope de 200 por lote", () => {
  it("alternar: marca, desmarca y al pasar el tope NO marca y lo dice", () => {
    let r = alternarSeleccion(new Set(), "a");
    expect([...r.sel]).toEqual(["a"]);
    expect(r.aviso).toBeNull();
    r = alternarSeleccion(r.sel, "a");
    expect(r.sel.size).toBe(0);
    const llenos = new Set(Array.from({ length: TOPE_SELECCION }, (_, i) => `id${i}`));
    r = alternarSeleccion(llenos, "otro");
    expect(r.sel.size).toBe(TOPE_SELECCION);
    expect(r.sel.has("otro")).toBe(false);
    expect(r.aviso).toBe("Se pueden seleccionar hasta 200 movimientos por lote.");
    // Desmarcar con el tope lleno sí se puede.
    expect(alternarSeleccion(llenos, "id0").sel.size).toBe(TOPE_SELECCION - 1);
    // No muta la entrada.
    expect(llenos.size).toBe(TOPE_SELECCION);
  });

  it("seleccionar todas: REEMPLAZA con las seleccionables en su orden y corta en las 200 más recientes", () => {
    const filas = [mov({ conciliado: true, clasificacion_id: "x" }), ...Array.from({ length: 252 }, () => mov())];
    const r = seleccionarTodas(filas, "lista");
    expect(r.sel.size).toBe(200);
    expect(r.aviso).toBe(TEXTO_TOPE_SELECCION);
    expect([...r.sel]).toEqual(filas.slice(1, 201).map((m) => m.id));
    const pocas = seleccionarTodas(filas.slice(0, 15), "lista");
    expect(pocas.sel.size).toBe(14);
    expect(pocas.aviso).toBeNull();
  });
});

describe("seleccionVigente: la poda DERIVADA (sin efectos)", () => {
  it("se quedan las que siguen en la lista y califican, en el orden de la lista; las demás se cuentan", () => {
    const a = mov();
    const b = mov();
    const c = mov();
    const yaLigado = { ...b, conciliado: true, gasto_id: "g1" };
    const r = seleccionVigente([c, yaLigado, a], new Set([a.id, b.id, c.id, "desaparecido"]), "lista");
    expect(r.vigentes.map((m) => m.id)).toEqual([c.id, a.id]);
    expect(r.retirados).toBe(2);
    expect(seleccionVigente([a], new Set(), "lista")).toEqual({ vigentes: [], retirados: 0 });
  });

  it("en Omitidos, una fila que ya no está omitida se retira", () => {
    const o = mov({ conciliado: true, clasificacion_id: "x", omision: OMISION });
    const restaurado = { ...o, conciliado: false, clasificacion_id: null, omision: null };
    expect(seleccionVigente([restaurado], new Set([o.id]), "omitidos")).toEqual({ vigentes: [], retirados: 1 });
  });
});

describe("resumen por tipo y moneda (centavos, MXN primero, nunca mezcla)", () => {
  it("24-sep: 14 comisiones de GASTOS GNRAL suman $56.84 MXN sin errores de coma flotante", () => {
    // 7 SPEI de $7.00 y su IVA de $1.12 (caso real del 24-sep).
    const montos = Array.from({ length: 7 }, () => ["7.00", "1.12"]).flat();
    const r = resumenSeleccion(montos.map((monto) => mov({ monto })), MONEDAS);
    expect(r.grupos).toEqual([{ tipo: "CARGO", moneda: "MXN", n: 14, centavos: 5684 }]);
    expect(textoResumenSeleccion(r)).toBe("14 seleccionados · 14 cargos $56.84 MXN");
  });

  it("mezcla de monedas: HSBC Pesos 30-sep + HSBC USD 01-oct (USD aparte, después de MXN)", () => {
    const r = resumenSeleccion(
      [
        mov({ cuenta_bancaria_id: USD, monto: "19.72" }),
        mov({ monto: "649.00" }),
        mov({ monto: "-103.84" }),
      ],
      MONEDAS,
    );
    expect(textoResumenSeleccion(r)).toBe("3 seleccionados · 2 cargos $752.84 MXN · 1 cargo $19.72 USD");
    expect(r.monedasCargos).toEqual(["MXN", "USD"]);
    expect(r.cargos).toBe(3);
  });

  it("abonos aparte de los cargos y singular con 1", () => {
    const r = resumenSeleccion([mov({ tipo: "ABONO", monto: "825.13" })], MONEDAS);
    expect(textoResumenSeleccion(r)).toBe("1 seleccionado · 1 abono $825.13 MXN");
    const mezcla = resumenSeleccion([mov({ tipo: "ABONO", monto: "825.13" }), mov({ monto: "1.12" })], MONEDAS);
    expect(textoResumenSeleccion(mezcla)).toBe("2 seleccionados · 1 cargo $1.12 MXN · 1 abono $825.13 MXN");
  });

  it("moneda desconocida (no cargaron las cuentas): se dice, no se adivina, y va al final", () => {
    const r = resumenSeleccion([mov({ monto: "10.00" }), mov({ cuenta_bancaria_id: "otra", monto: "5.00" })], MONEDAS);
    expect(textoResumenSeleccion(r)).toBe("2 seleccionados · 1 cargo $10.00 MXN · 1 cargo $5.00 (moneda desconocida)");
    expect(r.cargosSinMoneda).toBe(1);
    expect(resumenSeleccion([mov()], null).cargosSinMoneda).toBe(1);
  });

  it("centavos enteros: 0.1 + 0.2 no deja 0.30000000000000004", () => {
    expect(centavosDe("0.1") + centavosDe("0.2")).toBe(30);
    expect(centavosDe("-1,5")).toBe(0);
    expect(centavosDe(null)).toBe(0);
  });
});

describe("acciones de la barra: aplica o su motivo EXACTO", () => {
  const r = (movs: MovimientoBancario[], monedas: Record<string, string> | null = MONEDAS) => resumenSeleccion(movs, monedas);

  it("lista: omitir aplica con 1..200; vincular aplica con cargos de UNA moneda (1 = el diálogo de siempre)", () => {
    const a = accionesDeSeleccion(r([mov(), mov()]), "lista");
    expect(a.omitir).toEqual({ aplica: true, motivo: null });
    expect(a.vincular).toEqual({ aplica: true, motivo: null });
    expect(a.deshacer).toEqual({ aplica: false, motivo: null });
    expect(accionesDeSeleccion(r([mov()]), "lista").vincular.aplica).toBe(true);
  });

  it("vincular: abonos, moneda desconocida, dos monedas y más de 50, cada uno con su texto", () => {
    expect(accionesDeSeleccion(r([mov(), mov({ tipo: "ABONO" })]), "lista").vincular).toEqual({
      aplica: false,
      motivo: "Para vincular a un gasto deja solo cargos: los abonos se concilian desde su menú ⋯ o en Ingresos.",
    });
    expect(accionesDeSeleccion(r([mov(), mov()], null), "lista").vincular.motivo).toBe(
      "No se pudo leer la moneda de las cuentas: recarga la página para vincular varios cargos.",
    );
    expect(accionesDeSeleccion(r([mov(), mov({ cuenta_bancaria_id: USD })]), "lista").vincular.motivo).toBe(
      "Los cargos son de cuentas en MXN y USD: un gasto se paga en una sola moneda.",
    );
    expect(accionesDeSeleccion(r(Array.from({ length: 51 }, () => mov())), "lista").vincular.motivo).toBe(
      "Para vincular a un gasto elige hasta 50 cargos.",
    );
    // Los abonos se OMITEN aunque no se vinculen.
    expect(accionesDeSeleccion(r([mov({ tipo: "ABONO" })]), "lista").omitir.aplica).toBe(true);
    expect([MOTIVO_VINCULAR_SOLO_CARGOS, MOTIVO_VINCULAR_SIN_MONEDA, MOTIVO_VINCULAR_TOPE]).toHaveLength(3);
    expect(motivoVincularMonedas(["MXN", "USD", "EUR"])).toBe(
      "Los cargos son de cuentas en MXN, USD y EUR: un gasto se paga en una sola moneda.",
    );
  });

  it("más de 200: omitir y deshacer dicen el tope", () => {
    const grande = { ...r([mov()]), n: 201 };
    expect(accionesDeSeleccion(grande, "lista").omitir).toEqual({ aplica: false, motivo: TEXTO_TOPE_SELECCION });
    expect(accionesDeSeleccion(grande, "omitidos").deshacer).toEqual({ aplica: false, motivo: TEXTO_TOPE_SELECCION });
  });

  it("omitidos: solo «Deshacer la omisión…»", () => {
    const a = accionesDeSeleccion(r([mov({ omision: OMISION })]), "omitidos");
    expect(a.deshacer).toEqual({ aplica: true, motivo: null });
    expect(a.omitir).toEqual({ aplica: false, motivo: null });
    expect(a.vincular).toEqual({ aplica: false, motivo: null });
  });
});

describe("textos exactos", () => {
  it("aria-label único de la casilla", () => {
    const m = mov({ fecha: "2026-08-03", monto: "280.00", descripcion: "REST  EL TACO LOCO " });
    expect(etiquetaCasillaMovimiento(m, "GASTOS GNRAL", "lista", "MXN")).toBe(
      "Seleccionar el cargo de $280.00 MXN del 03 ago 2026 · REST EL TACO LOCO (GASTOS GNRAL)",
    );
    expect(etiquetaCasillaMovimiento({ ...m, tipo: "ABONO" }, "GASTOS GNRAL", "lista", "MXN")).toBe(
      "Seleccionar el abono de $280.00 MXN del 03 ago 2026 · REST EL TACO LOCO (GASTOS GNRAL)",
    );
    expect(etiquetaCasillaMovimiento(m, "GASTOS GNRAL", "omitidos", "MXN")).toBe(
      "Seleccionar el cargo omitido de $280.00 MXN del 03 ago 2026 · REST EL TACO LOCO (GASTOS GNRAL)",
    );
    // Sin moneda ni alias: esas partes no se dicen.
    expect(etiquetaCasillaMovimiento(m, null, "lista")).toBe(
      "Seleccionar el cargo de $280.00 del 03 ago 2026 · REST EL TACO LOCO",
    );
  });

  it("«Seleccionar los N…» (lista/búsqueda, 1, tope) y la poda", () => {
    expect(textoSeleccionarTodas({ n: 14, conBusqueda: true, vista: "lista" })).toBe(
      "Seleccionar los 14 pendientes de la búsqueda",
    );
    expect(textoSeleccionarTodas({ n: 14, conBusqueda: false, vista: "lista" })).toBe(
      "Seleccionar los 14 pendientes de la lista",
    );
    expect(textoSeleccionarTodas({ n: 1, conBusqueda: true, vista: "lista" })).toBe(
      "Seleccionar el pendiente de la búsqueda",
    );
    expect(textoSeleccionarTodas({ n: 252, conBusqueda: false, vista: "lista" })).toBe(
      "Seleccionar los 200 más recientes de 252 pendientes (máximo por lote)",
    );
    expect(textoSeleccionarTodas({ n: 3, conBusqueda: false, vista: "omitidos" })).toBe(
      "Seleccionar los 3 omitidos de la lista",
    );
    expect(textoSeleccionRetirada(0, "lista")).toBeNull();
    expect(textoSeleccionRetirada(1, "lista")).toBe("1 movimiento ya no está pendiente: se quitó de la selección.");
    expect(textoSeleccionRetirada(3, "lista")).toBe("3 movimientos ya no están pendientes: se quitaron de la selección.");
    expect(textoSeleccionRetirada(1, "omitidos")).toBe("1 movimiento ya no está omitido: se quitó de la selección.");
  });

  it("botones y región", () => {
    expect(ETIQUETA_REGION_SELECCION).toBe("Movimientos seleccionados");
    expect(BOTON_VINCULAR_A_GASTO).toBe("Vincular a un gasto…");
    expect(BOTON_OMITIR).toBe("Omitir…");
    expect(BOTON_DESHACER_OMISION).toBe("Deshacer la omisión…");
    expect(BOTON_LIMPIAR).toBe("Limpiar");
    expect(BOTON_QUITAR_SELECCION).toBe("Quitar selección");
  });
});

describe("paridad con el API (si el repo hermano está al lado)", () => {
  const API = path.resolve(__dirname, "../../../../../vuelatour-api/src/modules/conciliacion");
  const leerApi = (rel: string): string | null => {
    const p = path.join(API, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };

  it("TOPE_SELECCION = OMITIR_MAX y los cargos a un gasto 2..50", () => {
    const omision = leerApi("omision.util.ts");
    const cargos = leerApi("cargos-a-gasto.util.ts");
    if (!omision || !cargos) return;
    expect(omision).toContain(`export const OMITIR_MAX = ${TOPE_SELECCION};`);
    expect(cargos).toContain(`export const CARGOS_A_GASTO_MIN = ${MIN_CARGOS_A_GASTO};`);
    expect(cargos).toContain(`export const CARGOS_A_GASTO_MAX = ${MAX_CARGOS_A_GASTO};`);
  });
});
