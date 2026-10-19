/**
 * Gastos «por pagar» (19-oct-2026, API 0.0.95, contrato §7): las reglas PURAS
 * del panel — capacidad, la fecha de la captura (nota y confirmación), el
 * chip, «Marcar pagado», el filtro de Gastos, el pre-cierre y la caja chica.
 * Los textos se congelan aquí (el contrato da algunos EXACTOS).
 */
import { describe, expect, it } from "vitest";
import { fechaGastoSospechosa } from "../fecha-gasto";
import {
  CLASES_CHIP_ESTADO_PAGO,
  CLAVE_PRECIERRE_GASTOS_POR_PAGAR,
  MSG_CONFLICTO_VERSION_PAGADO,
  MSG_GASTO_YA_NO_EXISTE,
  MSG_MARCAR_PAGADO_FALLO,
  MSG_MARCAR_PAGADO_INCIERTO,
  NOTA_QUEDARA_POR_PAGAR,
  NOTA_SIGUE_POR_PAGAR,
  SIN_CAPACIDAD_POR_PAGAR,
  TITULO_POR_PAGAR_CAJA,
  capacidadPorPagarDeMe,
  chipEstadoPago,
  cuerpoMarcarPagado,
  diaMesCorto,
  errorFechaPago,
  estadoPagoDe,
  evaluarFechaGasto,
  finDeMesDia,
  hrefPrecierreGastosPorPagar,
  limiteSinConfirmarPorPagar,
  mensajeErrorMarcarPagado,
  notaFechaPorPagar,
  porPagarDeFondo,
  porPagarDeUrl,
  porPagarVigente,
  resumenGastoPorPagar,
  textoConteoPorPagarCaja,
  toastMarcadoPagado,
  validarMarcarPagado,
  type CapacidadPorPagar,
} from "../gasto-por-pagar";
import {
  hayFiltrosGastos,
  leerFiltrosGastos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
  vacioGastos,
} from "../gastos-vista";

const HOY = "2026-10-19";
/** Oficina: hoy + 30 (sin cambio en el API). */
const OFICINA: CapacidadPorPagar = { habilitado: true, fechaMax: "2026-11-18" };
/** Campo: max(fin de mes, mañana). */
const CAMPO: CapacidadPorPagar = { habilitado: true, fechaMax: "2026-10-31" };
const G = "5e2a8a1c-0d3f-4c6b-9a1e-2b3c4d5e6f70";

describe("capacidad (`/v1/me` → config)", () => {
  it("solo `gastos_por_pagar === true` enciende; el tope se valida", () => {
    expect(capacidadPorPagarDeMe(null)).toBe(SIN_CAPACIDAD_POR_PAGAR);
    expect(capacidadPorPagarDeMe({})).toBe(SIN_CAPACIDAD_POR_PAGAR);
    expect(capacidadPorPagarDeMe({ config: null })).toBe(SIN_CAPACIDAD_POR_PAGAR);
    expect(capacidadPorPagarDeMe({ config: { gastos_por_pagar: false, gasto_fecha_max: "2026-10-31" } })).toBe(
      SIN_CAPACIDAD_POR_PAGAR,
    );
    expect(capacidadPorPagarDeMe({ config: { gastos_por_pagar: "true" } })).toBe(SIN_CAPACIDAD_POR_PAGAR);
    expect(capacidadPorPagarDeMe({ config: { gastos_por_pagar: true, gasto_fecha_max: "2026-10-31" } })).toEqual({
      habilitado: true,
      fechaMax: "2026-10-31",
    });
    // Tope ilegible o que no existe ⇒ sin tope (decide el API al guardar).
    expect(capacidadPorPagarDeMe({ config: { gastos_por_pagar: true, gasto_fecha_max: "2026-02-30" } })).toEqual({
      habilitado: true,
      fechaMax: null,
    });
    expect(capacidadPorPagarDeMe({ config: { gastos_por_pagar: true } })).toEqual({ habilitado: true, fechaMax: null });
  });
});

describe("fechas puras", () => {
  it("fin de mes (bisiestos, diciembre)", () => {
    expect(finDeMesDia("2026-10-19")).toBe("2026-10-31");
    expect(finDeMesDia("2026-11-03")).toBe("2026-11-30");
    expect(finDeMesDia("2028-02-10")).toBe("2028-02-29");
    expect(finDeMesDia("2027-02-10")).toBe("2027-02-28");
    expect(finDeMesDia("2026-12-31")).toBe("2026-12-31");
  });

  it("límite sin confirmar: fin de mes; el último día acepta mañana; nunca más allá del tope", () => {
    expect(limiteSinConfirmarPorPagar(HOY, OFICINA.fechaMax)).toBe("2026-10-31");
    expect(limiteSinConfirmarPorPagar(HOY, CAMPO.fechaMax)).toBe("2026-10-31");
    expect(limiteSinConfirmarPorPagar("2026-10-31", "2026-11-30")).toBe("2026-11-01");
    expect(limiteSinConfirmarPorPagar(HOY, "2026-10-25")).toBe("2026-10-25");
    expect(limiteSinConfirmarPorPagar(HOY, null)).toBe("2026-10-31");
  });

  it("«20 oct» del chip", () => {
    expect(diaMesCorto("2026-10-20")).toBe("20 oct");
    expect(diaMesCorto("2026-01-05")).toBe("5 ene");
    expect(diaMesCorto("2026-10-20T05:00:00Z")).toBe("20 oct");
    expect(diaMesCorto(null)).toBeNull();
    expect(diaMesCorto("2026-13-01")).toBeNull();
  });
});

describe("la fecha de la captura (`evaluarFechaGasto`)", () => {
  const fechas = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-31", "2026-11-05", "2026-11-18", "2026-11-25", "2026-08-01", "2026-06-01"];

  it("SIN capacidad: idéntico a hoy (la confirmación de siempre y ninguna nota)", () => {
    for (const f of fechas) {
      expect(evaluarFechaGasto(f, SIN_CAPACIDAD_POR_PAGAR, HOY), f).toEqual({
        quedaPorPagar: false,
        pideConfirmacion: fechaGastoSospechosa(f, HOY),
      });
    }
    expect(fechaGastoSospechosa("2026-10-22", HOY)).toBe(true); // +3 días: hoy pregunta
  });

  it("CON capacidad: fecha > hoy hasta fin de mes ⇒ nota y SIN confirmación", () => {
    for (const f of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-31"]) {
      expect(evaluarFechaGasto(f, OFICINA, HOY), f).toEqual({ quedaPorPagar: true, pideConfirmacion: false });
      expect(evaluarFechaGasto(f, CAMPO, HOY), f).toEqual({ quedaPorPagar: true, pideConfirmacion: false });
    }
  });

  it("oficina más allá de fin de mes (hasta +30): la confirmación de hoy y la nota (también quedará por pagar)", () => {
    expect(evaluarFechaGasto("2026-11-05", OFICINA, HOY)).toEqual({ quedaPorPagar: true, pideConfirmacion: true });
    expect(evaluarFechaGasto("2026-11-18", OFICINA, HOY)).toEqual({ quedaPorPagar: true, pideConfirmacion: true });
  });

  it("más allá del tope del API: sin nota (el API la rechaza) y la confirmación de hoy", () => {
    expect(evaluarFechaGasto("2026-11-25", OFICINA, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: true });
    expect(evaluarFechaGasto("2026-11-05", CAMPO, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: true });
  });

  it("el último día del mes sigue aceptando mañana sin preguntar", () => {
    const ultimo: CapacidadPorPagar = { habilitado: true, fechaMax: "2026-11-01" };
    expect(evaluarFechaGasto("2026-11-01", ultimo, "2026-10-31")).toEqual({ quedaPorPagar: true, pideConfirmacion: false });
  });

  it("hoy y fechas pasadas: como siempre (> 60 días atrás pregunta); ilegible no decide", () => {
    expect(evaluarFechaGasto(HOY, OFICINA, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: false });
    expect(evaluarFechaGasto("2026-08-01", OFICINA, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: true });
    expect(evaluarFechaGasto("", OFICINA, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: false });
    expect(evaluarFechaGasto(null, OFICINA, HOY)).toEqual({ quedaPorPagar: false, pideConfirmacion: false });
  });

  it("la nota EXACTA del contrato; en «Verificar / editar» de un por pagar, cómo se marca pagado", () => {
    expect(NOTA_QUEDARA_POR_PAGAR).toBe(
      "Quedará POR PAGAR: el día que lo pagues, márcalo pagado (la fecha del gasto es la del pago).",
    );
    expect(notaFechaPorPagar("2026-10-25", OFICINA, null, HOY)).toBe(NOTA_QUEDARA_POR_PAGAR);
    expect(notaFechaPorPagar("2026-10-25", SIN_CAPACIDAD_POR_PAGAR, null, HOY)).toBeNull();
    expect(notaFechaPorPagar(HOY, OFICINA, null, HOY)).toBeNull();
    expect(notaFechaPorPagar("2026-10-10", OFICINA, "VENCIDO", HOY)).toBe(NOTA_SIGUE_POR_PAGAR);
    expect(notaFechaPorPagar("2026-10-10", OFICINA, "PAGADO", HOY)).toBeNull();
    // Sin capacidad, aunque el gasto diga «por pagar», nada (API previo).
    expect(notaFechaPorPagar("2026-10-10", SIN_CAPACIDAD_POR_PAGAR, "VENCIDO", HOY)).toBeNull();
    expect(NOTA_SIGUE_POR_PAGAR).toBe(
      "Este gasto sigue POR PAGAR: cambiar la fecha no lo marca pagado. Cuando se pague, usa «Marcar pagado» (menú ⋯ del gasto).",
    );
  });
});

describe("estado de pago y chip", () => {
  it("`estado_pago` del API validado; ausente o raro ⇒ null", () => {
    expect(estadoPagoDe({ estado_pago: "POR_PAGAR" })).toBe("POR_PAGAR");
    expect(estadoPagoDe({ estado_pago: "VENCIDO" })).toBe("VENCIDO");
    expect(estadoPagoDe({ estado_pago: "PAGADO" })).toBe("PAGADO");
    expect(estadoPagoDe({})).toBeNull();
    expect(estadoPagoDe({ estado_pago: "OTRO" })).toBeNull();
    expect(estadoPagoDe(null)).toBeNull();
    expect(porPagarVigente({ estado_pago: "POR_PAGAR" })).toBe(true);
    expect(porPagarVigente({ estado_pago: "VENCIDO" })).toBe(true);
    expect(porPagarVigente({ estado_pago: "PAGADO" })).toBe(false);
    expect(porPagarVigente({})).toBe(false);
  });

  it("«Por pagar · 20 oct» ámbar / «Vencido · 20 oct» rojo; PAGADO o sin la llave ⇒ nada", () => {
    expect(chipEstadoPago({ estado_pago: "POR_PAGAR", fecha_gasto: "2026-10-20" })).toEqual({
      estado: "POR_PAGAR",
      texto: "Por pagar · 20 oct",
      tono: "ambar",
      titulo:
        "Por pagar: se pagará el 20 oct 2026. Cuando se pague, márcalo pagado con la fecha real del pago (la fecha del gasto es la del pago).",
    });
    expect(chipEstadoPago({ estado_pago: "VENCIDO", fecha_gasto: "2026-10-15" })).toEqual({
      estado: "VENCIDO",
      texto: "Vencido · 15 oct",
      tono: "rojo",
      titulo:
        "Vencido: debía pagarse el 15 oct 2026 y nadie lo ha marcado pagado. Márcalo pagado con la fecha real del pago, o elimínalo si no se pagó.",
    });
    expect(chipEstadoPago({ estado_pago: "PAGADO", fecha_gasto: "2026-10-20" })).toBeNull();
    expect(chipEstadoPago({ fecha_gasto: "2026-10-20" })).toBeNull();
    expect(chipEstadoPago({ estado_pago: "POR_PAGAR", fecha_gasto: null })?.texto).toBe("Por pagar");
    expect(CLASES_CHIP_ESTADO_PAGO.ambar).toContain("amber");
    expect(CLASES_CHIP_ESTADO_PAGO.rojo).toContain("destructive");
  });
});

describe("«Marcar pagado»", () => {
  it("la fecha del pago: día real y nunca después de hoy", () => {
    expect(errorFechaPago(HOY, HOY)).toBeNull();
    expect(errorFechaPago("2026-10-15", HOY)).toBeNull();
    expect(errorFechaPago("2026-10-20", HOY)).toBe(
      "La fecha del pago no puede ser después de hoy: márcalo pagado el día que se pague.",
    );
    expect(errorFechaPago("", HOY)).toBe("Elige la fecha del pago.");
    expect(errorFechaPago("2026-02-30", HOY)).toBe("Elige la fecha del pago.");
  });

  it("cuerpo EXACTO del PATCH (el control de versión solo si se conoce)", () => {
    expect(cuerpoMarcarPagado({ fecha_gasto: HOY, if_updated_at: "2026-10-19T15:00:00.123Z" })).toEqual({
      por_pagar: false,
      fecha_gasto: HOY,
      if_updated_at: "2026-10-19T15:00:00.123Z",
    });
    expect(cuerpoMarcarPagado({ fecha_gasto: HOY, if_updated_at: null })).toEqual({ por_pagar: false, fecha_gasto: HOY });
    expect(cuerpoMarcarPagado({ fecha_gasto: HOY })).toEqual({ por_pagar: false, fecha_gasto: HOY });
  });

  it("validación antes de la red", () => {
    expect(validarMarcarPagado(G, { fecha_gasto: HOY }, HOY)).toBeNull();
    expect(validarMarcarPagado("no-uuid", { fecha_gasto: HOY }, HOY)).toBe("Ese gasto no es válido: recarga la página.");
    expect(validarMarcarPagado(G, { fecha_gasto: "2026-10-25" }, HOY)).toMatch(/después de hoy/);
    expect(validarMarcarPagado(G, null, HOY)).toBe("Elige la fecha del pago.");
  });

  it("resumen y toast", () => {
    expect(
      resumenGastoPorPagar({ id: G, categoria: "TAXI", monto: "500", moneda: "MXN", fecha_gasto: "2026-10-20", estado_pago: "POR_PAGAR" }),
    ).toBe("Taxi / estacionamiento · $500 MXN · por pagar el 20 oct 2026");
    expect(
      resumenGastoPorPagar({ id: G, categoria: "COMIDA", monto: 350.5, moneda: "MXN", fecha_gasto: "2026-10-15", estado_pago: "VENCIDO" }),
    ).toBe("Comida · $350.50 MXN · vencido desde el 15 oct 2026");
    expect(toastMarcadoPagado("2026-10-19")).toBe("Gasto marcado pagado · 19 oct 2026");
  });

  it("errores: el API tal cual; CONFLICTO_VERSION, 404 y sin respuesta recargan", () => {
    expect(mensajeErrorMarcarPagado({ ok: false, code: "CONFLICTO_VERSION", status: 409, error: "Alguien modificó el gasto." })).toEqual({
      texto: "Alguien modificó el gasto.",
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "CONFLICTO_VERSION", status: 409, error: "Conflict" })).toEqual({
      texto: MSG_CONFLICTO_VERSION_PAGADO,
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "SIN_CONEXION", error: "fetch failed" })).toEqual({
      texto: MSG_MARCAR_PAGADO_INCIERTO,
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "ERROR", status: 502, error: "Bad Gateway" })).toEqual({
      texto: MSG_MARCAR_PAGADO_INCIERTO,
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "NOT_FOUND", status: 404, error: "Not Found" })).toEqual({
      texto: MSG_GASTO_YA_NO_EXISTE,
      recargar: true,
    });
    const futura = "Un gasto con fecha futura queda por pagar: márcalo pagado el día que lo pagues (la fecha del gasto es la del pago).";
    expect(mensajeErrorMarcarPagado({ ok: false, code: "POR_PAGAR_FECHA_FUTURA", status: 400, error: futura })).toEqual({
      texto: futura,
      recargar: false,
    });
    const noDisp = "Los gastos por pagar todavía no están activos: avisa a sistemas.";
    expect(mensajeErrorMarcarPagado({ ok: false, code: "POR_PAGAR_NO_DISPONIBLE", status: 503, error: noDisp })).toEqual({
      texto: noDisp,
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "PARSE_ERROR", status: 503, error: "x" })).toEqual({
      texto: MSG_MARCAR_PAGADO_INCIERTO,
      recargar: true,
    });
    expect(mensajeErrorMarcarPagado({ ok: false, code: "X", status: 400, error: "Bad Request" })).toEqual({
      texto: MSG_MARCAR_PAGADO_FALLO,
      recargar: false,
    });
  });
});

describe("filtro «Por pagar» de Gastos (`?por_pagar=1`)", () => {
  const sp = (q: string) => {
    const p = new URLSearchParams(q);
    return (k: string) => p.get(k);
  };

  it("`1` o `true`; solo con la capacidad; sin ella se ignora y se dice", () => {
    expect(porPagarDeUrl("1")).toBe(true);
    expect(porPagarDeUrl("true")).toBe(true);
    expect(porPagarDeUrl("0")).toBe(false);
    expect(porPagarDeUrl(null)).toBe(false);
    expect(leerFiltrosGastos(sp("por_pagar=1"), null, true)).toEqual({ vista: "todos", captura: "todas", por_pagar: true });
    expect(leerFiltrosGastos(sp("por_pagar=1"), null, false)).toEqual({ vista: "todos", captura: "todas", porPagarIgnorado: true });
    expect(leerFiltrosGastos(sp("por_pagar=1"))).toEqual({ vista: "todos", captura: "todas", porPagarIgnorado: true });
    expect(leerFiltrosGastos(sp("por_pagar=si"), null, true)).toEqual({ vista: "todos", captura: "todas" });
  });

  it("viaja al API y al Excel SOLO puesto; cuenta como filtro; su vacío", () => {
    const con = leerFiltrosGastos(sp("por_pagar=1&desde=2026-10-01&hasta=2026-10-31"), null, true);
    expect(queryBaseGastos(con, HOY).por_pagar).toBe(true);
    expect(queryListaGastos(con, HOY).por_pagar).toBe(true);
    expect(queryExcelGastos(con, HOY).por_pagar).toBe("true");
    expect(hayFiltrosGastos(con)).toBe(true);
    const sin = leerFiltrosGastos(sp(""), null, true);
    expect("por_pagar" in queryBaseGastos(sin, HOY)).toBe(false);
    expect("por_pagar" in queryExcelGastos(sin, HOY)).toBe(false);
    expect(hayFiltrosGastos(leerFiltrosGastos(sp("por_pagar=1"), null, false))).toBe(false);
    expect(vacioGastos("todos", true, true)).toEqual({
      titulo: "Sin gastos por pagar",
      descripcion: "Ningún gasto con estos filtros espera su pago: todos están marcados pagados.",
    });
    // En «Pendientes»/«Duplicados» manda la pestaña.
    expect(vacioGastos("pendientes", true, true).titulo).toBe("Sin pendientes con estos filtros");
    expect(vacioGastos("todos", true).titulo).toBe("Ningún gasto coincide con estos filtros");
  });
});

describe("pre-cierre y caja chica", () => {
  it("«Resolver →» del renglón bloqueante: Gastos «Por pagar» del periodo", () => {
    expect(CLAVE_PRECIERRE_GASTOS_POR_PAGAR).toBe("gastos_por_pagar");
    expect(hrefPrecierreGastosPorPagar({ desde: "2026-10-01", hasta: "2026-10-31" })).toBe(
      "/admin/expenses?por_pagar=1&desde=2026-10-01&hasta=2026-10-31",
    );
  });

  it("la lista aditiva de la caja: sin la llave, null o vacía ⇒ null (no se pinta)", () => {
    expect(porPagarDeFondo({})).toBeNull();
    expect(porPagarDeFondo({ por_pagar: null })).toBeNull();
    expect(porPagarDeFondo({ por_pagar: [] })).toBeNull();
    const items = [
      { id: "a", fecha_gasto: "2026-10-20", monto: 500, moneda: "MXN", categoria: "TAXI", concepto: "Taxi hangar", estado_pago: "POR_PAGAR" },
      { nope: true },
    ];
    expect(porPagarDeFondo({ por_pagar: items, por_pagar_total: "500.00" })).toEqual({ items: [items[0]], total: 500 });
    expect(porPagarDeFondo({ por_pagar: items })?.total).toBeNull();
    expect(TITULO_POR_PAGAR_CAJA).toBe("Por pagar (aún no sale de la caja)");
    expect(textoConteoPorPagarCaja(1)).toBe("1 gasto por pagar");
    expect(textoConteoPorPagarCaja(3)).toBe("3 gastos por pagar");
  });
});
