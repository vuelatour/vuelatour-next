/**
 * Auditoría 16-oct-2026 del inicio oficial (API 0.0.85, llaves ADITIVAS):
 * reglas puras del panel. Cada regla tiene su caso «sin la llave / null ⇒
 * salida idéntica a la de hoy» (skew con el API 0.0.84).
 */
import { describe, expect, it } from "vitest";
import {
  normalizarSaldoInicialCardex,
  normalizarSaldoInicialTaco,
  rotuloHorasMesAnio,
  rotuloRegistradas,
  rotuloTotalHonorarios,
  saltosDeCadena,
  textoCuentaAntesDelInicio,
  textoSinFilasDesde,
} from "../inicio-oficial";
import {
  filtroMesesCuenta,
  mensajeErrorCuentaSocio,
  mesParaVerEntregasPrevias,
  opcionesFiltroMeses,
  opcionesMesArranque,
  validarFormCuenta,
} from "../reparto-pagos";
import {
  PERIODOS_TIENDA,
  periodoTiendaConInicio,
  periodosTiendaOfrecidos,
  rangoPeriodoTienda,
  textoPeriodoTienda,
} from "../inventario-utilidad";

const INICIO = "2026-09-01";

type Fila = { fecha: string | null; taco_salida: number | null; taco_llegada: number | null };
const fila = (fecha: string | null, salida: number | null, llegada: number | null): Fila => ({
  fecha,
  taco_salida: salida,
  taco_llegada: llegada,
});

/** Histórico COMPLETO como lo mandaba el API 0.0.84 (más reciente primero). */
const COMPLETO: Fila[] = [
  fila("2026-09-10T15:00:00Z", 1010.4, 1012.0),
  fila("2026-09-03T15:00:00Z", 1008.0, 1010.4),
  // ↓ salto: la salida del 2-sep (1006.9) no es la llegada del 30-ago (1006.5).
  fila("2026-09-02T15:00:00Z", 1006.9, 1008.0),
  fila("2026-08-30T15:00:00Z", 1004.0, 1006.5),
  fila("2026-08-20T15:00:00Z", 1001.0, 1004.0),
  fila(null, 990.0, 991.0),
  fila(null, 989.0, 990.0),
];
/** Lo que manda el API 0.0.85: sin las filas de agosto + saldo inicial. */
const VISIBLE = COMPLETO.filter((f) => !f.fecha || f.fecha >= "2026-09-01");
const SALDO = { fecha: INICIO, taco: 1006.5 };

describe("saltosDeCadena — tacómetros del avión", () => {
  it("con `saldo_inicial` los saltos de las filas visibles son IDÉNTICOS a los del histórico completo", () => {
    const completos = saltosDeCadena(COMPLETO);
    const ahora = saltosDeCadena(VISIBLE, SALDO);
    expect(ahora.map((f) => f.salto)).toEqual(
      VISIBLE.map((f) => completos[COMPLETO.indexOf(f)].salto),
    );
    // El salto de la fila fechada más vieja sale contra la llegada previa.
    expect(ahora[2].salto).toBe(true);
    // Las filas sin fecha (al final) siguen comparándose entre sí.
    expect(ahora[3].salto).toBe(false);
  });

  it("saldo con `taco` null (la previa sin llegada) ⇒ sin salto, como antes", () => {
    expect(saltosDeCadena(VISIBLE, { fecha: INICIO, taco: null })[2].salto).toBe(false);
  });

  it("sin la llave o null (API 0.0.84 / sin filas previas) ⇒ el cálculo de siempre", () => {
    const hoy = COMPLETO.map((h, i) => {
      const anterior = COMPLETO[i + 1];
      return (
        h.taco_salida != null && anterior?.taco_llegada != null && h.taco_salida !== anterior.taco_llegada
      );
    });
    expect(saltosDeCadena(COMPLETO).map((f) => f.salto)).toEqual(hoy);
    expect(saltosDeCadena(COMPLETO, null).map((f) => f.salto)).toEqual(hoy);
    expect(saltosDeCadena([], SALDO)).toEqual([]);
  });

  it("normalizarSaldoInicialTaco: tolerante", () => {
    expect(normalizarSaldoInicialTaco({ fecha: INICIO, taco: 1006.5 })).toEqual(SALDO);
    expect(normalizarSaldoInicialTaco({ fecha: INICIO, taco: null })).toEqual({ fecha: INICIO, taco: null });
    expect(normalizarSaldoInicialTaco({ fecha: INICIO, taco: "x" })).toEqual({ fecha: INICIO, taco: null });
    for (const malo of [undefined, null, {}, { fecha: "ayer" }, "2026-09-01"]) {
      expect(normalizarSaldoInicialTaco(malo)).toBeNull();
    }
  });
});

describe("normalizarSaldoInicialCardex", () => {
  it("lee la llave del API tal cual (sin recalcular)", () => {
    expect(
      normalizarSaldoInicialCardex({
        fecha: INICIO,
        etiqueta: "Saldo inicial al 1-sep-2026",
        existencia: "150",
        costo_vigente: { moneda: "USD", unitario: 21.25, unitario_usd: 21.25 },
      }),
    ).toEqual({
      fecha: INICIO,
      etiqueta: "Saldo inicial al 1-sep-2026",
      existencia: 150,
      costo_vigente: { moneda: "USD", unitario: 21.25 },
    });
  });

  it("sin etiqueta usa el texto del panel; costo mal formado ⇒ null", () => {
    expect(
      normalizarSaldoInicialCardex({ fecha: INICIO, existencia: 0, costo_vigente: { moneda: "MXN" } }),
    ).toEqual({ fecha: INICIO, etiqueta: "Saldo inicial al 1-sep-2026", existencia: 0, costo_vigente: null });
  });

  it("ausente, null o roto ⇒ null (no hay renglón)", () => {
    for (const malo of [undefined, null, {}, { fecha: INICIO }, { fecha: INICIO, existencia: "x" }, { fecha: "x", existencia: 1 }]) {
      expect(normalizarSaldoInicialCardex(malo)).toBeNull();
    }
  });
});

describe("rótulos de lo que el API 0.0.85 ya recorta", () => {
  it("textoSinFilasDesde: con saldo dice desde cuándo; sin él, el de siempre", () => {
    expect(textoSinFilasDesde({ fecha: INICIO }, "Sin lecturas registradas.", "lecturas")).toBe(
      "Sin lecturas desde el 1-sep-2026.",
    );
    expect(textoSinFilasDesde(null, "Sin lecturas registradas.", "lecturas")).toBe("Sin lecturas registradas.");
    expect(textoSinFilasDesde(undefined, "Sin movimientos todavía.")).toBe("Sin movimientos todavía.");
  });

  it("ficha del avión: «Horas mes / año» ⇒ «Horas mes / desde el 1-sep-2026» con `anio_desde`", () => {
    expect(rotuloHorasMesAnio(INICIO)).toBe("Horas mes / desde el 1-sep-2026");
    for (const sin of [undefined, null, "", "basura"]) expect(rotuloHorasMesAnio(sin)).toBe("Horas mes / año");
  });

  it("honorarios del externo: «Histórico» ⇒ «Desde el 1-sep-2026» con `honorarios.desde`", () => {
    expect(rotuloTotalHonorarios(INICIO)).toBe("Desde el 1-sep-2026");
    expect(rotuloTotalHonorarios(undefined)).toBe("Histórico");
    expect(rotuloTotalHonorarios(null)).toBe("Histórico");
  });

  it("facturas emitidas: «Registradas» ⇒ «Registradas desde el 1-sep-2026» con `resumen.desde`", () => {
    expect(rotuloRegistradas(INICIO)).toBe("Registradas desde el 1-sep-2026");
    expect(rotuloRegistradas(undefined)).toBe("Registradas");
    expect(rotuloRegistradas(null)).toBe("Registradas");
  });
});

describe("cuenta de socios (agregado h)", () => {
  const HOY = "2026-10-16";

  it("opcionesMesArranque: desde el mes del inicio; un arranque actual anterior no se ofrece", () => {
    expect(opcionesMesArranque(HOY, "2026-07", INICIO).map((o) => o.value)).toEqual(["2026-10", "2026-09"]);
    // null ⇒ la ventana de 36 meses de siempre (e incluye el actual).
    const sin = opcionesMesArranque(HOY, "2026-07");
    expect(sin).toEqual(opcionesMesArranque(HOY, "2026-07", null));
    expect(sin).toHaveLength(36);
    expect(sin.at(-1)?.value).toBe("2023-11");
  });

  it("filtroMesesCuenta: `?desde=2026-07` sube al mes del inicio con `ajustado`", () => {
    expect(filtroMesesCuenta("2026-07", "2026-10", "2026-10", INICIO)).toEqual({
      desde: "2026-09",
      hasta: "2026-10",
      ajustado: true,
    });
    // Rango entero anterior ⇒ el mes del inicio (como el API).
    expect(filtroMesesCuenta("2026-07", "2026-08", "2026-10", INICIO)).toEqual({
      desde: "2026-09",
      hasta: "2026-09",
      ajustado: true,
    });
    // Dentro del periodo: sin `ajustado` (la llave NO existe).
    expect(filtroMesesCuenta("2026-09", "2026-10", "2026-10", INICIO)).toEqual({
      desde: "2026-09",
      hasta: "2026-10",
    });
    // null ⇒ idéntico a hoy.
    expect(filtroMesesCuenta("2026-07", "2026-10", "2026-10", null)).toEqual(
      filtroMesesCuenta("2026-07", "2026-10", "2026-10"),
    );
    expect(filtroMesesCuenta("2026-07", "2026-10", "2026-10")).toEqual({ desde: "2026-07", hasta: "2026-10" });
  });

  it("opcionesFiltroMeses: no ofrece julio/agosto; null ⇒ como hoy", () => {
    const p = { cuentaDesdeMes: "2026-07", desde: "2026-07", mesActual: "2026-10" };
    expect(opcionesFiltroMeses({ ...p, inicioOficial: INICIO }).map((o) => o.value)).toEqual([
      "2026-10",
      "2026-09",
    ]);
    expect(opcionesFiltroMeses({ ...p, inicioOficial: null })).toEqual(opcionesFiltroMeses(p));
    expect(opcionesFiltroMeses(p).at(-1)?.value).toBe("2026-07");
  });

  it("mesParaVerEntregasPrevias: arranque en el mes del inicio ⇒ no hay a dónde llevar (sin aviso a agosto)", () => {
    const base = { mesMasAntiguo: "2026-08", cuentaDesdeMes: "2026-09", mesActual: "2026-10" };
    expect(mesParaVerEntregasPrevias({ ...base, inicioOficial: INICIO })).toBeNull();
    // Arranque en noviembre: se ve desde septiembre, nunca desde agosto.
    expect(
      mesParaVerEntregasPrevias({ ...base, cuentaDesdeMes: "2026-11", mesActual: "2026-11", inicioOficial: INICIO }),
    ).toBe("2026-09");
    // null ⇒ como hoy.
    expect(mesParaVerEntregasPrevias(base)).toBe("2026-08");
    expect(mesParaVerEntregasPrevias({ ...base, inicioOficial: null })).toBe("2026-08");
  });

  it("validarFormCuenta: arranque anterior al inicio ⇒ el mismo texto del 400 del API", () => {
    const form = { cuenta_desde: "2026-08", saldo_inicial: "0", notas: "" };
    expect(validarFormCuenta(form, HOY, INICIO).cuenta_desde).toBe(
      "La cuenta no puede arrancar antes de septiembre de 2026 (inicio oficial).",
    );
    expect(textoCuentaAntesDelInicio("2026-10-01")).toBe(
      "La cuenta no puede arrancar antes de octubre de 2026 (inicio oficial).",
    );
    expect(validarFormCuenta({ ...form, cuenta_desde: "2026-09" }, HOY, INICIO)).toEqual({});
    expect(validarFormCuenta(form, HOY)).toEqual({});
    expect(validarFormCuenta(form, HOY, null)).toEqual({});
  });

  it("400 CUENTA_ANTES_DEL_INICIO: se pinta el `message` del API; vacío ⇒ respaldo sin fecha en duro", () => {
    const msg = "La cuenta no puede arrancar antes de septiembre de 2026 (inicio oficial).";
    expect(mensajeErrorCuentaSocio("CUENTA_ANTES_DEL_INICIO", msg, 400)).toBe(msg);
    expect(mensajeErrorCuentaSocio("CUENTA_ANTES_DEL_INICIO", "", 400)).toBe(
      "La cuenta no puede arrancar antes del inicio oficial del sistema. Elige un mes posterior.",
    );
  });
});

describe("utilidad de la tienda (revisión: el API 0.0.85 sube su `desde`)", () => {
  it("«Todo» con inicio = del inicio a hoy (tarjeta, columna y Excel cuentan lo mismo)", () => {
    expect(rangoPeriodoTienda("todo", "2026-10-16", INICIO)).toEqual({ desde: INICIO, hasta: "2026-10-16" });
    expect(textoPeriodoTienda("todo", INICIO)).toBe("desde el 1-sep-2026");
    // Los demás periodos no cambian.
    expect(rangoPeriodoTienda("mes", "2026-10-16", INICIO)).toEqual(rangoPeriodoTienda("mes", "2026-10-16"));
  });

  it("«Mes pasado» entero antes del inicio no se ofrece y una URL vieja se ve como «Todo»", () => {
    expect(periodosTiendaOfrecidos("2026-09-20", INICIO).map((p) => p.valor)).toEqual(["todo", "mes"]);
    expect(periodosTiendaOfrecidos("2026-10-16", INICIO).map((p) => p.valor)).toEqual([
      "todo",
      "mes",
      "mes-anterior",
    ]);
    expect(periodoTiendaConInicio("mes-anterior", "2026-09-20", INICIO)).toBe("todo");
    expect(periodoTiendaConInicio("mes-anterior", "2026-10-16", INICIO)).toBe("mes-anterior");
  });

  it("sin inicio ⇒ idéntico a hoy", () => {
    expect(rangoPeriodoTienda("todo", "2026-10-16", null)).toBeNull();
    expect(textoPeriodoTienda("todo", null)).toBe("todo el historial");
    expect(textoPeriodoTienda("todo")).toBe("todo el historial");
    expect(periodosTiendaOfrecidos("2026-09-20", null)).toEqual([...PERIODOS_TIENDA]);
    expect(periodoTiendaConInicio("mes-anterior", "2026-09-20", null)).toBe("mes-anterior");
  });
});
