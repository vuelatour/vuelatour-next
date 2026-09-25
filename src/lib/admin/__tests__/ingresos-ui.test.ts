import { describe, expect, it } from "vitest";
import {
  ETIQUETA_TAB_INGRESOS,
  FALLBACK_ERROR_INGRESO,
  VALOR_CUENTA_DEL_ABONO,
  VALOR_EFECTIVO,
  aceptableEnLote,
  aceptarEnLote,
  cambiosDeEdicion,
  candidatosDeConflicto,
  datosAltaDeFormulario,
  erroresFormularioIngreso,
  etiquetaEstadoConciliacion,
  etiquetaMotivoAbono,
  fechaDdMmAaaa,
  filtrosIngresosDeUrl,
  formularioDeIngreso,
  formularioDesdeAbono,
  formularioVacio,
  hayCambios,
  hrefIngresos,
  lineaConciliacionResumen,
  mensajeErrorIngreso,
  metodoDerivado,
  montoDefaultAplicacion,
  parametrosExportDeUrl,
  preseleccionada,
  queryEntradas,
  queryExportIngresos,
  queryIngresos,
  rutaExportIngresos,
  tabDeUrl,
  tabsIngresos,
  textoAccionPropuesta,
  textoCampoBitacora,
  textoConfirmarAplicacion,
  textoConfirmarCobroDesdeAbono,
  textoConfirmarDesaplicar,
  textoIaNoDisponible,
  textoResultadoLote,
  textoSaldoAnticipo,
  textoValorBitacora,
  tituloDuplicado,
  type FormIngreso,
} from "@/lib/admin/ingresos-ui";
import type { AbonoPendiente, Ingreso, PropuestaAbono } from "@/types/ingresos";

const HOY = "2026-09-24";
const CUENTA_PAYWISE = "5f0c7c3e-9a44-4b53-9f7e-3a1d1c1b2a10";
const CUENTA_HSBC = "0a9c2b1e-2d3f-4a5b-8c7d-6e5f4a3b2c1d";
const ING_ID = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const VUELO_235 = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";

/** Caso REAL del contrato (§0): el abono de MARIA CRISTINA cuadra con el cobro #235. */
const ABONO_235: AbonoPendiente = {
  id: "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  cuenta_bancaria_id: CUENTA_PAYWISE,
  cuenta_alias: "Paywise",
  cuenta_moneda: "MXN",
  cuenta_tipo: "PASARELA",
  fecha: "2026-09-08",
  monto: 19380,
  monto_bruto: null,
  comision_monto: null,
  descripcion: "MARIA CRISTINA CHAVEZ BADIOLA : vuelo cristy badiola",
  referencia: null,
  notas: null,
  patron: null,
  motivo_pendiente: "SIN_CANDIDATOS",
  candidatos_n: 0,
  exactos_manual: 1,
  posible_duplicado_de: null,
  cliente_sugerido: { id: "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a", nombre: "Cristy Chavez" },
  categoria_sugerida: null,
};

function ingreso(p: Partial<Ingreso> = {}): Ingreso {
  return {
    id: ING_ID,
    folio: 12,
    etiqueta: "ING-12",
    categoria: "OTRO_INGRESO",
    categoria_etiqueta: "Otros ingresos",
    suma_a_resultados: true,
    fecha: "2026-09-20",
    descripcion: "Reembolso de la aseguradora",
    monto: 1000,
    comision_monto: null,
    neto: 1000,
    moneda: "MXN",
    tc_usd_mxn: null,
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    cuenta_bancaria_id: CUENTA_HSBC,
    cuenta: { id: CUENTA_HSBC, alias: "HSBC Pesos", banco: "HSBC", moneda: "MXN", tipo: "BANCO" },
    referencia: null,
    pagador: null,
    cliente_id: null,
    cliente_nombre: null,
    vuelo_id: null,
    vuelo_folio: null,
    aeronave_id: null,
    matricula: null,
    gasto_id: null,
    notas: null,
    archivo: null,
    conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
    anticipo: null,
    registrado_por_nombre: "Mary",
    created_at: "2026-09-20T15:00:00Z",
    updated_at: "2026-09-20T15:00:00Z",
    baja: null,
    ...p,
  };
}

function propuesta(p: Partial<PropuestaAbono> = {}): PropuestaAbono {
  return {
    movimiento_id: ABONO_235.id,
    fecha: "2026-09-08",
    monto: 19380,
    descripcion: ABONO_235.descripcion,
    referencia: null,
    cuenta_alias: "Paywise",
    cuenta_moneda: "MXN",
    origen: "IA",
    accion: "LIGAR",
    candidato: {
      tipo: "COBRO_VUELO",
      id: "a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d",
      etiqueta: "Cobro · vuelo #235",
      fecha: "2026-09-08",
      monto: 20400,
      neto: 19380,
      moneda: "MXN",
      metodo_etiqueta: "Transferencia",
      cliente: "Cristy Chavez",
      vuelo_id: VUELO_235,
      grupo_id: null,
      es_anticipo: false,
    },
    confianza: 0.92,
    monto_exacto: true,
    razon: "Monto neto exacto y el nombre del cliente en la descripción",
    evidencias: ["neto 19,380.00 == abono"],
    alternativas: [],
    categoria_sugerida: null,
    cliente_sugerido: null,
    posible_duplicado: false,
    motivo_sin_match: null,
    ...p,
  };
}

describe("pestañas y roles", () => {
  it("cinco pestañas, «Por conciliar» solo ADMIN/FACTURACION", () => {
    expect(ETIQUETA_TAB_INGRESOS).toEqual({
      todos: "Todos",
      cobros: "Cobros de vuelos",
      otros: "Otros ingresos",
      anticipos: "Anticipos",
      "por-conciliar": "Por conciliar",
    });
    expect(tabsIngresos("ADMIN")).toContain("por-conciliar");
    expect(tabsIngresos("FACTURACION")).toContain("por-conciliar");
    expect(tabsIngresos("COORDINADOR")).not.toContain("por-conciliar");
  });

  it("tabDeUrl: fuera de catálogo ⇒ todos; por-conciliar sin rol ⇒ todos", () => {
    expect(tabDeUrl("otros", "COORDINADOR")).toBe("otros");
    expect(tabDeUrl("nada", "ADMIN")).toBe("todos");
    expect(tabDeUrl(undefined, "ADMIN")).toBe("todos");
    expect(tabDeUrl("por-conciliar", "COORDINADOR")).toBe("todos");
    expect(tabDeUrl("por-conciliar", "FACTURACION")).toBe("por-conciliar");
  });
});

describe("filtros de la URL (validados, nunca tumban la pantalla)", () => {
  it("default = mes corriente Cancún, del 1 a hoy", () => {
    const f = filtrosIngresosDeUrl({}, "ADMIN", HOY);
    expect(f).toMatchObject({ tab: "todos", desde: "2026-09-01", hasta: HOY, periodoExplicito: false });
  });

  it("«Por conciliar» sin periodo abre los últimos 90 días (el estado de cuenta suele ser del mes anterior)", () => {
    const f = filtrosIngresosDeUrl({ tab: "por-conciliar" }, "ADMIN", HOY);
    expect(f).toMatchObject({ desde: "2026-06-27", hasta: HOY, periodoExplicito: false });
    // Con periodo explícito manda la URL.
    const g = filtrosIngresosDeUrl({ tab: "por-conciliar", desde: "2026-09-10" }, "ADMIN", HOY);
    expect(g.desde).toBe("2026-09-10");
    const h = filtrosIngresosDeUrl({ tab: "por-conciliar", hasta: "2026-08-15" }, "ADMIN", HOY);
    expect(h).toMatchObject({ desde: "2026-08-01", hasta: "2026-08-15" });
  });

  it("ignora lo inválido y corrige el rango invertido", () => {
    const f = filtrosIngresosDeUrl(
      {
        tab: "otros",
        desde: "2026-09-10",
        hasta: "2026-09-02",
        moneda: "EUR",
        categoria: "ANTICIPO_CLIENTE",
        cuenta: "no-uuid",
        conciliacion: "via_anticipo",
        bajas: "incluir",
        ingreso: ING_ID,
      },
      "ADMIN",
      HOY,
    );
    expect(f.desde).toBe("2026-09-02");
    expect(f.hasta).toBe("2026-09-10");
    expect(f.moneda).toBeUndefined();
    expect(f.cuenta).toBeUndefined();
    // «Otros ingresos» no incluye anticipos: ese filtro sería una lista vacía falsa.
    expect(f.categoria).toBeUndefined();
    expect(filtrosIngresosDeUrl({ tab: "otros", categoria: "VENTA_ACTIVO" }, "ADMIN", HOY).categoria).toBe(
      "VENTA_ACTIVO",
    );
    expect(filtrosIngresosDeUrl({ tab: "cobros", categoria: "VENTA_ACTIVO" }, "ADMIN", HOY).categoria).toBeUndefined();
    // «vía anticipo» solo existe para cobros:
    expect(f.conciliacion).toBeUndefined();
    expect(f.bajas).toBe("incluir");
    expect(f.ingreso).toBe(ING_ID);
    expect(filtrosIngresosDeUrl({ desde: "2026-13-45" }, "ADMIN", HOY).desde).toBe("2026-09-01");
  });

  it("revisión 24-sep: solo `hasta` de un mes anterior ⇒ desde = día 1 de ESE mes (nunca desde > hasta)", () => {
    // Antes: desde = 2026-09-01 > hasta = 2026-08-15 ⇒ 400 del API y la lista
    // principal caía en «No se pudo cargar».
    const f = filtrosIngresosDeUrl({ hasta: "2026-08-15" }, "ADMIN", HOY);
    expect(f.desde).toBe("2026-08-01");
    expect(f.hasta).toBe("2026-08-15");
    expect(f.desde <= f.hasta).toBe(true);
    // `hasta` dentro del mes corriente: el default de siempre.
    expect(filtrosIngresosDeUrl({ hasta: "2026-09-20" }, "ADMIN", HOY).desde).toBe("2026-09-01");
  });

  it("hrefIngresos conserva filtros y al cambiar de pestaña suelta el detalle y lo que no aplica", () => {
    const f = filtrosIngresosDeUrl(
      { tab: "otros", moneda: "USD", bajas: "solo", ingreso: ING_ID, desde: "2026-08-01", hasta: "2026-08-31" },
      "ADMIN",
      HOY,
    );
    const h = hrefIngresos(f, { tab: "anticipos" });
    expect(h).toContain("tab=anticipos");
    expect(h).toContain("moneda=USD");
    expect(h).toContain("desde=2026-08-01");
    expect(h).not.toContain("ingreso=");
    expect(h).not.toContain("bajas=");
    expect(hrefIngresos(f, { ingreso: null, tab: "todos" })).not.toContain("tab=");
  });

  it("queries exactas por pestaña (el API rechaza parámetros de más)", () => {
    const f = filtrosIngresosDeUrl({ tab: "cobros", moneda: "MXN", conciliacion: "via_anticipo" }, "ADMIN", HOY);
    expect(queryEntradas(f, "cobros")).toEqual({
      desde: "2026-09-01",
      hasta: HOY,
      origen: "cobros",
      moneda: "MXN",
      categoria: undefined,
      conciliacion: "via_anticipo",
      q: undefined,
    });
    const a = filtrosIngresosDeUrl({ tab: "anticipos" }, "ADMIN", HOY);
    expect(queryIngresos(a, "anticipos")).toMatchObject({ vista: "anticipos", saldo: "con_saldo", bajas: undefined });
    const o = filtrosIngresosDeUrl({ tab: "otros" }, "ADMIN", HOY);
    expect(queryIngresos(o, "otros")).toMatchObject({ vista: "otros", bajas: "excluir", saldo: undefined });
  });

  it("export: misma vista que la pantalla; el proxy solo reenvía lo conocido y válido", () => {
    const o = filtrosIngresosDeUrl({ tab: "otros", categoria: "INGRESO_BANCARIO" }, "ADMIN", HOY);
    expect(queryExportIngresos(o)).toMatchObject({ origen: "ingresos", vista: "otros", categoria: "INGRESO_BANCARIO" });
    expect(rutaExportIngresos(o)).toMatch(/^\/api\/ingresos\/export\?/);
    const p = parametrosExportDeUrl(
      new URLSearchParams("desde=2026-09-30&hasta=2026-09-01&origen=todos&limit=5&vista=hack&moneda=MXN&q=  ing-12  "),
    );
    expect(p.get("desde")).toBe("2026-09-01");
    expect(p.get("hasta")).toBe("2026-09-30");
    expect(p.get("limit")).toBeNull();
    expect(p.get("vista")).toBeNull();
    expect(p.get("q")).toBe("ing-12");
  });
});

describe("badges de conciliación y motivos de abono", () => {
  it("los cuatro estados (misma regla que «cobros sin banco»)", () => {
    expect(etiquetaEstadoConciliacion("CONCILIADO")).toMatchObject({ texto: "Conciliado", tono: "verde" });
    expect(etiquetaEstadoConciliacion("SIN_CONCILIAR")).toMatchObject({ texto: "Sin conciliar", tono: "ambar" });
    expect(etiquetaEstadoConciliacion("NO_BANCARIO")).toMatchObject({
      texto: "No se concilia uno a uno",
      tono: "gris",
      titulo: "Efectivo, dólares en mano o terminal BillPocket (depósito agrupado)",
    });
    expect(etiquetaEstadoConciliacion("VIA_ANTICIPO")).toMatchObject({
      texto: "Conciliado vía anticipo",
      tono: "azul",
    });
  });

  it("caso #235: sin candidato automático · 1 con el monto exacto", () => {
    expect(etiquetaMotivoAbono(ABONO_235).texto).toBe("Sin candidato automático · 1 con el monto exacto");
  });

  it("motivos: cruzable, ambiguo, traspaso, reverso", () => {
    expect(etiquetaMotivoAbono({ ...ABONO_235, motivo_pendiente: "SE_PUEDE_CRUZAR" }).texto).toBe("Se puede cruzar");
    expect(etiquetaMotivoAbono({ ...ABONO_235, motivo_pendiente: "AMBIGUO", candidatos_n: 3 }).texto).toBe(
      "Ambiguo entre 3",
    );
    expect(etiquetaMotivoAbono({ ...ABONO_235, patron: "TRASPASO" }).texto).toBe("Parece traspaso");
    expect(etiquetaMotivoAbono({ ...ABONO_235, patron: "REVERSO" }).texto).toBe("Parece reverso");
    expect(etiquetaMotivoAbono({ ...ABONO_235, exactos_manual: 0 }).texto).toBe("Sin candidato automático");
  });

  it("sin motivos calculados: «Pendiente» a secas, NUNCA un «Sin candidato» inventado", () => {
    const m = etiquetaMotivoAbono({ ...ABONO_235, motivo_pendiente: null, exactos_manual: null }, false);
    expect(m.texto).toBe("Pendiente");
    expect(etiquetaMotivoAbono(ABONO_235, false).texto).toBe("Pendiente");
  });

  it("duplicado: dice si la otra ya está conciliada", () => {
    expect(
      tituloDuplicado({ id: "x", conciliado: true, descripcion: "SPEI", referencia: "000125473315" }),
    ).toMatch(/ya conciliada/);
  });
});

describe("mensajes de error: el del API manda, fallback por code (§10)", () => {
  it("usa el message del API", () => {
    expect(
      mensajeErrorIngreso(
        "ABONO_TIENE_COBRO_CANDIDATO",
        "Este abono cuadra con el cobro del vuelo #235 (Cristy Chavez): vincúlalo a ese cobro.",
        409,
      ),
    ).toBe("Este abono cuadra con el cobro del vuelo #235 (Cristy Chavez): vincúlalo a ese cobro.");
  });

  it("fallback por code cuando el message no sirve", () => {
    expect(mensajeErrorIngreso("ANTICIPO_SIN_SALDO", "", 409)).toBe("El anticipo no tiene saldo suficiente.");
    expect(mensajeErrorIngreso("INGRESOS_NO_DISPONIBLE", "Service Unavailable", 503)).toBe(
      FALLBACK_ERROR_INGRESO.INGRESOS_NO_DISPONIBLE,
    );
    expect(mensajeErrorIngreso("CONCILIAR_SOLO_ADMIN_FACTURACION", "Forbidden", 403)).toBe(
      "Solo Administración y Facturación concilian con el banco.",
    );
    expect(mensajeErrorIngreso("VUELO_SOLO_EN_REEMBOLSO", null, 400)).toMatch(/cobro del vuelo/);
  });

  it("401, red, tiempo agotado y ruta inexistente en es-MX", () => {
    expect(mensajeErrorIngreso(null, "x", 401)).toMatch(/sesión expiró/);
    expect(mensajeErrorIngreso("SIN_CONEXION", null)).toMatch(/conexión/);
    expect(mensajeErrorIngreso("TIEMPO_AGOTADO", null)).toMatch(/tardó demasiado/);
    expect(mensajeErrorIngreso("NOT_FOUND", "Cannot POST /v1/ingresos", 404)).toMatch(/falta actualizarlo/);
    expect(mensajeErrorIngreso("PARSE_ERROR", "Bad Gateway", 502)).toMatch(/error 502/);
  });
});

describe("formulario de alta desde un abono (anti doble conteo)", () => {
  it("categoría VACÍA sin sugerencia (jamás «Otros ingresos» por default)", () => {
    const f = formularioDesdeAbono(ABONO_235);
    expect(f.categoria).toBe("");
    expect(f.cuenta).toBe(CUENTA_PAYWISE);
    expect(f.moneda).toBe("MXN");
    expect(f.metodo).toBe("PAYWISE");
    expect(f.monto).toBe("19380");
    expect(f.comision).toBe("");
    expect(f.cliente_id).toBe(ABONO_235.cliente_sugerido?.id);
    expect(f.descripcion).toBe("MARIA CRISTINA CHAVEZ BADIOLA : vuelo cristy badiola");
  });

  it("la sugerida del API sí se usa; «Es un anticipo» la fuerza", () => {
    expect(formularioDesdeAbono({ ...ABONO_235, categoria_sugerida: "REEMBOLSO_DEVOLUCION" }).categoria).toBe(
      "REEMBOLSO_DEVOLUCION",
    );
    expect(formularioDesdeAbono(ABONO_235, { forzarCategoria: "ANTICIPO_CLIENTE" }).categoria).toBe(
      "ANTICIPO_CLIENTE",
    );
  });

  it("revisión 24-sep: una sugerencia (de la IA) de «Otros ingresos» o «Anticipo» NO se prellena", () => {
    // «Aceptar» un REGISTRAR_INGRESO de la IA con categoria_sugerida
    // OTRO_INGRESO abría el alta con «Otros ingresos» ya elegido: el default
    // que el contrato prohíbe (el pago de un vuelo contaría dos veces).
    expect(formularioDesdeAbono({ ...ABONO_235, categoria_sugerida: "OTRO_INGRESO" }).categoria).toBe("");
    expect(formularioDesdeAbono({ ...ABONO_235, categoria_sugerida: "ANTICIPO_CLIENTE" }).categoria).toBe("");
    // Forzada por el menú «Es un anticipo» sí vale.
    expect(
      formularioDesdeAbono(
        { ...ABONO_235, categoria_sugerida: "OTRO_INGRESO" },
        { forzarCategoria: "ANTICIPO_CLIENTE" },
      ).categoria,
    ).toBe("ANTICIPO_CLIENTE");
  });

  it("pasarela con monto_bruto: bruto + comisión (el abono es el neto)", () => {
    const f = formularioDesdeAbono({ ...ABONO_235, monto: 9114.3, monto_bruto: 10000, comision_monto: 885.7 });
    expect(f.monto).toBe("10000");
    expect(f.comision).toBe("885.7");
  });

  it("abono cuya cuenta el panel no conoce: no se manda la cuenta (el API toma la del abono)", () => {
    const f = formularioDesdeAbono({ ...ABONO_235, cuenta_bancaria_id: "", categoria_sugerida: "INGRESO_BANCARIO" });
    expect(f.cuenta).toBe(VALOR_CUENTA_DEL_ABONO);
    expect(erroresFormularioIngreso(f, { hoy: HOY, monedaCuenta: "MXN" }).cuenta).toBeUndefined();
    const d = datosAltaDeFormulario(f, { clientRequestId: "k", movimientoId: ABONO_235.id });
    expect(d).not.toHaveProperty("cuenta_bancaria_id");
    expect(d.movimiento_bancario_id).toBe(ABONO_235.id);
  });

  it("cuenta de banco ⇒ Transferencia; sin cuenta ⇒ Efectivo", () => {
    expect(formularioDesdeAbono({ ...ABONO_235, cuenta_tipo: "BANCO" }).metodo).toBe("TRANSFERENCIA");
    expect(metodoDerivado(null)).toBe("EFECTIVO");
    expect(metodoDerivado({ tipo: "PASARELA" })).toBe("PAYWISE");
  });
});

describe("validación y payload EXACTO del alta", () => {
  const base: FormIngreso = {
    ...formularioVacio(HOY),
    categoria: "OTRO_INGRESO",
    descripcion: "  Intereses   de septiembre ",
    monto: "1,234.50",
    cuenta: CUENTA_HSBC,
    metodo: "TRANSFERENCIA",
  };

  it("errores: categoría, fecha futura, monto, cuenta, cliente del anticipo, método sin cuenta", () => {
    const e = erroresFormularioIngreso(
      { ...formularioVacio(HOY), fecha: "2026-09-25", descripcion: "ab", monto: "0" },
      { hoy: HOY },
    );
    expect(e.categoria).toBeTruthy();
    expect(e.fecha).toMatch(/futura/);
    expect(e.descripcion).toBeTruthy();
    expect(e.monto).toBeTruthy();
    expect(e.cuenta).toBeTruthy();
    expect(
      erroresFormularioIngreso({ ...base, categoria: "ANTICIPO_CLIENTE" }, { hoy: HOY }).cliente_id,
    ).toBeTruthy();
    expect(
      erroresFormularioIngreso({ ...base, cuenta: VALOR_EFECTIVO, metodo: "TRANSFERENCIA" }, { hoy: HOY }).metodo,
    ).toBeTruthy();
    expect(erroresFormularioIngreso({ ...base, comision: "1234.50" }, { hoy: HOY }).comision).toBeTruthy();
    expect(erroresFormularioIngreso({ ...base, monto: "10.123" }, { hoy: HOY }).monto).toBeTruthy();
    expect(erroresFormularioIngreso(base, { hoy: HOY })).toEqual({});
  });

  it("solo manda lo que aplica: sin vuelo ni gasto fuera de reembolsos, T.C. solo en USD", () => {
    const d = datosAltaDeFormulario(
      { ...base, vuelo_id: VUELO_235, gasto_id: "g", tc: "18.5", referencia: " 123 " },
      { clientRequestId: "k1", movimientoId: ABONO_235.id },
    );
    expect(d).toEqual({
      categoria: "OTRO_INGRESO",
      fecha: HOY,
      descripcion: "Intereses de septiembre",
      monto: 1234.5,
      moneda: "MXN",
      metodo: "TRANSFERENCIA",
      client_request_id: "k1",
      cuenta_bancaria_id: CUENTA_HSBC,
      referencia: "123",
      movimiento_bancario_id: ABONO_235.id,
    });
    const r = datosAltaDeFormulario(
      { ...base, categoria: "REEMBOLSO_DEVOLUCION", vuelo_id: VUELO_235, moneda: "USD", tc: "18.25" },
      { clientRequestId: "k2", aceptarSinCobro: true, aceptarDuplicado: true },
    );
    expect(r.vuelo_id).toBe(VUELO_235);
    expect(r.tc_usd_mxn).toBe(18.25);
    expect(r.aceptar_sin_cobro).toBe(true);
    expect(r.aceptar_posible_duplicado).toBe(true);
  });

  it("efectivo: cuenta null explícita", () => {
    const d = datosAltaDeFormulario({ ...base, cuenta: VALOR_EFECTIVO, metodo: "EFECTIVO" }, { clientRequestId: "k" });
    expect(d.cuenta_bancaria_id).toBeNull();
    expect(d.metodo).toBe("EFECTIVO");
  });
});

describe("edición = solo lo que cambió + CAS", () => {
  it("sin cambios solo viaja el CAS", () => {
    const i = ingreso();
    const c = cambiosDeEdicion(formularioDeIngreso(i), i);
    expect(c).toEqual({ if_updated_at: i.updated_at });
    expect(hayCambios(c)).toBe(false);
  });

  it("vaciar un opcional manda null; reclasificar suelta el vuelo", () => {
    const i = ingreso({ categoria: "REEMBOLSO_DEVOLUCION", referencia: "ABC", vuelo_id: VUELO_235, vuelo_folio: 235 });
    const f = { ...formularioDeIngreso(i), referencia: "", categoria: "OTRO_INGRESO" as const };
    const c = cambiosDeEdicion(f, i);
    expect(c).toMatchObject({ categoria: "OTRO_INGRESO", referencia: null, vuelo_id: null });
    expect(hayCambios(c)).toBe(true);
  });

  it("revisión 24-sep: comisión vigente 0 = sin comisión (editar notas de un conciliado no toca su dinero)", () => {
    const i = ingreso({ comision_monto: 0, notas: null });
    const c = cambiosDeEdicion({ ...formularioDeIngreso(i), notas: "Llegó por SPEI" }, i);
    expect(c).not.toHaveProperty("comision_monto");
    expect(c).toMatchObject({ notas: "Llegó por SPEI" });
  });
});

describe("anticipos: monto sugerido y textos de confirmación", () => {
  it("el menor entre el saldo del anticipo y el saldo del vuelo en la moneda del anticipo", () => {
    expect(montoDefaultAplicacion({ saldoAnticipo: 10000, moneda: "MXN", saldoVueloUsd: 300, tc: 18.5 })).toBe(5550);
    expect(montoDefaultAplicacion({ saldoAnticipo: 1000, moneda: "MXN", saldoVueloUsd: 300, tc: 18.5 })).toBe(1000);
    expect(montoDefaultAplicacion({ saldoAnticipo: 500, moneda: "USD", saldoVueloUsd: 300, tc: null })).toBe(300);
    expect(montoDefaultAplicacion({ saldoAnticipo: 800, moneda: "MXN", saldoVueloUsd: null, tc: null })).toBe(800);
    expect(montoDefaultAplicacion({ saldoAnticipo: 800, moneda: "MXN", saldoVueloUsd: 100, tc: null })).toBe(800);
  });

  it("textos exactos", () => {
    expect(
      textoConfirmarAplicacion({ monto: 600, moneda: "MXN", folio: 312, fechaAnticipo: "2026-09-08", saldoRestante: 400 }),
    ).toBe(
      "Se registrará un cobro de $600 MXN en el vuelo #312 con fecha del anticipo (08/09/2026). El anticipo queda con saldo $400 MXN.",
    );
    expect(textoConfirmarCobroDesdeAbono({ monto: 20400, moneda: "MXN", folio: 235, fecha: "2026-09-08" })).toBe(
      "Se registrará un cobro de $20,400 MXN en el vuelo #235 con fecha 08/09/2026 y quedará conciliado con este abono.",
    );
    expect(textoConfirmarDesaplicar({ monto: 600.5, moneda: "MXN", folio: 312, etiquetaAnticipo: "ING-12" })).toBe(
      "Se borrará el cobro de $600.50 MXN del vuelo #312 y el monto regresa al saldo del anticipo ING-12.",
    );
    expect(fechaDdMmAaaa("2026-09-08")).toBe("08/09/2026");
    expect(fechaDdMmAaaa(null)).toBe("—");
  });

  it("saldo en palabras", () => {
    expect(textoSaldoAnticipo({ aplicado: 0, saldo: 1000, aplicaciones_n: 0 }, "MXN")).toBe("Sin aplicar · saldo $1,000 MXN");
    expect(textoSaldoAnticipo({ aplicado: 600, saldo: 400, aplicaciones_n: 1 }, "MXN")).toBe("Saldo por aplicar $400 MXN");
    expect(textoSaldoAnticipo({ aplicado: 1000, saldo: 0, aplicaciones_n: 2 }, "MXN")).toBe("Aplicado completo");
    expect(textoSaldoAnticipo(null, "MXN")).toBe("");
  });
});

describe("sugerencias con IA de abonos", () => {
  it("preseleccionada exige monto_exacto + confianza ≥ 0.85 y nunca un posible duplicado", () => {
    expect(preseleccionada(propuesta())).toBe(true);
    expect(preseleccionada(propuesta({ monto_exacto: false }))).toBe(false);
    expect(preseleccionada(propuesta({ confianza: 0.84 }))).toBe(false);
    expect(preseleccionada(propuesta({ posible_duplicado: true }))).toBe(false);
    expect(preseleccionada(propuesta({ candidato: null }))).toBe(false);
    expect(preseleccionada(propuesta({ accion: "CLASIFICAR_TRASPASO", origen: "REGLA", candidato: null }))).toBe(true);
    expect(preseleccionada(propuesta({ accion: "CLASIFICAR_REVERSO", origen: "IA", candidato: null }))).toBe(false);
    expect(preseleccionada(propuesta({ accion: "REGISTRAR_INGRESO", candidato: null }))).toBe(false);
    expect(
      preseleccionada(propuesta({ accion: "CLASIFICAR_TRASPASO", origen: "REGLA", posible_duplicado: true })),
    ).toBe(false);
  });

  it("registrar como ingreso NO va en el lote (abre el alta)", () => {
    expect(aceptableEnLote(propuesta({ accion: "REGISTRAR_INGRESO", candidato: null }))).toBe(false);
    expect(aceptableEnLote(propuesta({ accion: "REVISAR", candidato: null }))).toBe(false);
    expect(aceptableEnLote(propuesta())).toBe(true);
  });

  it("aceptar en lote es SECUENCIAL y resume los errores con su motivo", async () => {
    const orden: string[] = [];
    let activas = 0;
    let maxActivas = 0;
    const ps = [
      propuesta({ movimiento_id: "m1" }),
      propuesta({ movimiento_id: "m2" }),
      propuesta({ movimiento_id: "m3" }),
    ];
    const r = await aceptarEnLote(ps, async (p) => {
      activas++;
      maxActivas = Math.max(maxActivas, activas);
      orden.push(p.movimiento_id);
      await new Promise((res) => setTimeout(res, 1));
      activas--;
      if (p.movimiento_id === "m2") return { ok: false, error: "Ese movimiento ya está conciliado con otra cosa." };
      if (p.movimiento_id === "m3") throw new Error("red");
      return { ok: true };
    });
    expect(orden).toEqual(["m1", "m2", "m3"]);
    expect(maxActivas).toBe(1);
    expect(r.conciliados).toEqual(["m1"]);
    expect(r.errores).toHaveLength(2);
    expect(textoResultadoLote(r)).toBe(
      "1 conciliado · 2 con error (Ese movimiento ya está conciliado con otra cosa.)",
    );
    expect(textoResultadoLote({ conciliados: ["a", "b"], errores: [] })).toBe("2 conciliados");
  });

  it("disponible=false dice que el asistente NO estuvo, nunca «no encontró»", () => {
    const t = textoIaNoDisponible({ disponible: false, nota: "pyservices no respondió" });
    expect(t).toBe("El asistente no está disponible: pyservices no respondió");
    expect(t).not.toMatch(/no encontr/i);
    expect(textoIaNoDisponible({ disponible: true, nota: null })).toBeNull();
  });

  it("la acción propuesta en palabras del operador", () => {
    expect(textoAccionPropuesta(propuesta())).toBe("Vincular a Cobro · vuelo #235");
    expect(
      textoAccionPropuesta(propuesta({ accion: "REGISTRAR_INGRESO", candidato: null, categoria_sugerida: "REEMBOLSO_DEVOLUCION" })),
    ).toBe("Registrar como «Reembolsos y devoluciones recibidos»");
    expect(textoAccionPropuesta(propuesta({ accion: "CLASIFICAR_REVERSO", candidato: null }))).toBe(
      "Clasificar como reverso de un cargo",
    );
  });

  it("409 ABONO_TIENE_COBRO_CANDIDATO: candidatos tolerantes y ≤ 5", () => {
    const c = candidatosDeConflicto({
      candidatos: [
        { tipo: "COBRO_VUELO", id: "c1", etiqueta: "Cobro · vuelo #235", cliente: "Cristy Chavez", fecha: "2026-09-08", monto: 20400, neto: 19380 },
        { id: 7 },
        ...Array.from({ length: 6 }, (_, k) => ({ id: `x${k}`, monto: "1" })),
      ],
    });
    expect(c[0]).toEqual({
      tipo: "COBRO_VUELO",
      id: "c1",
      etiqueta: "Cobro · vuelo #235",
      cliente: "Cristy Chavez",
      fecha: "2026-09-08",
      monto: 20400,
      neto: 19380,
    });
    expect(c).toHaveLength(5);
    expect(candidatosDeConflicto(null)).toEqual([]);
  });
});

describe("resumen y bitácora", () => {
  it("línea de conciliación sin ceros", () => {
    expect(lineaConciliacionResumen({ conciliado: 1000, sin_conciliar: 0, no_bancario: 250.5 }, "MXN")).toBe(
      "conciliado $1,000 MXN · no pasa por el banco $250.50 MXN",
    );
    expect(lineaConciliacionResumen({ conciliado: 0, sin_conciliar: 0, no_bancario: 0 }, "MXN")).toBe("");
  });

  it("campos y valores legibles (ids jamás crudos)", () => {
    expect(textoCampoBitacora("monto")).toBe("Monto");
    expect(textoCampoBitacora("cuenta_bancaria_id")).toBe("Cuenta");
    expect(textoCampoBitacora("campo_nuevo_id")).toBe("Campo nuevo");
    expect(textoValorBitacora("categoria", "ANTICIPO_CLIENTE")).toBe("Anticipos y depósitos de clientes");
    expect(textoValorBitacora("cliente_id", "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a")).toBe("asignado");
    expect(textoValorBitacora("monto", 950)).toBe("$950");
    expect(textoValorBitacora("notas", null)).toBe("—");
  });
});

describe("menú: «Ingresos» justo antes de «Gastos»", () => {
  it("posición, ruta y roles (= los de Gastos)", async () => {
    const { NAV_GROUPS, filterNavGroupsForRole } = await import("@/lib/admin/nav-items");
    const operacion = NAV_GROUPS.find((g) => g.label === "Operación");
    const items = operacion?.items ?? [];
    const iIngresos = items.findIndex((i) => i.href === "/admin/ingresos");
    const iGastos = items.findIndex((i) => i.href === "/admin/expenses");
    expect(iIngresos).toBeGreaterThanOrEqual(0);
    expect(iGastos).toBe(iIngresos + 1);
    expect(items[iIngresos]).toMatchObject({
      label: "Ingresos",
      roles: ["ADMIN", "COORDINADOR", "FACTURACION"],
    });
    expect(items[iIngresos].roles).toEqual(items[iGastos].roles);
    for (const rol of ["PILOTO", "SOCIO", "ANALISTA", "MECANICO"] as const) {
      expect(filterNavGroupsForRole(rol).flatMap((g) => g.items).some((i) => i.href === "/admin/ingresos")).toBe(false);
    }
    const { getPageTitleFromPathname } = await import("@/lib/admin/page-title");
    expect(getPageTitleFromPathname("/admin/ingresos")).toBe("Ingresos");
  });
});
