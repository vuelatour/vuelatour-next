import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fmtMontoMoneda, type CompraDetalle, type CompraListItem } from "@/types/compras";
import {
  AYUDA_FLUJO_COMPRAS,
  DETALLE_FALTA_MERCANCIA,
  ETIQUETA_ACCION,
  ETIQUETA_GASTO_PARCIAL,
  ETIQUETA_GASTO_REGISTRADO,
  ETIQUETA_PEDIDA,
  ETIQUETA_RECIBIDA,
  ETIQUETA_SIN_GASTO,
  MSG_TC_REQUERIDO,
  PESTANAS_COMPRAS,
  TC_COMPRA_MAX,
  TC_COMPRA_MIN,
  accionSiguiente,
  contarPestanasCompras,
  cuerpoRegistrarCompra,
  descripcionRegistrarGasto,
  filtrarComprasPorPestana,
  filtroComprasDeUrl,
  formRegistrarCompraVacio,
  gastoDe,
  hrefPestanaCompras,
  lineaCandidato,
  mensajeTcFueraDeRango,
  pasosCompra,
  puedeEliminarDesdeLista,
  recepcionDe,
  textoConfirmarEliminarCompra,
  textoConfirmarRegistrarGasto,
  textoEquivalente,
  toastEntradaDesdeGasto,
  toastGastoRegistrado,
  validarTcCompra,
  // Los gastos de la compra, uno por uno (4-nov-2026, API 0.0.120).
  ETIQUETA_ROL_OTRO_GASTO,
  MSG_FECHA_PAGO_REQUERIDA,
  MSG_MEDIO_REQUERIDO,
  MSG_MONTO_REQUERIDO,
  OPCIONES_PAGO_COMPRA,
  PAGO_COMPRA_DEFAULT,
  ROL_OTRO_GASTO_OPTIONS,
  avisoCompraSinGasto,
  cuerpoAgregarGastoCompra,
  cuerpoRegistrarGastoCompra,
  formGastoCompraVacio,
  formOtroGastoCompraVacio,
  lineasConCosto,
  montoDeTexto,
  tcInicialCompra,
  textoConfirmarAgregarGasto,
  textoConfirmarCompraConGasto,
  toastCompraConGasto,
  toastGastoAgregado,
} from "../compras-estado";

/**
 * El flujo de Compras que se ve (21-oct-2026, invariante 101 del API):
 * pestañas, badges de recepción y gasto, la línea de pasos con la acción que
 * sigue y los textos/validación de «Registrar gasto». El panel no calcula
 * estados: los pinta como llegan (`gasto_estado`, `recibida_at`…).
 */
const fila = (extra: Partial<CompraListItem> = {}): CompraListItem => ({
  id: "c-1",
  folio: 12,
  proveedor: { id: "p-1", nombre: "Aircraft Spruce" },
  fecha: "2026-10-02",
  referencia: "AS-1",
  moneda: "USD",
  estado: "ABIERTA",
  n_lineas: 3,
  n_pagos: 0,
  total_mercancia: 622.1,
  total: 985.66,
  total_mxn: null,
  total_usd: 985.66,
  recibida_at: null,
  tc_usd_mxn: 18.2,
  total_factura: 722.9,
  gasto_estado: "SIN_GASTO",
  gasto_mercancia: 0,
  gasto_faltante: null,
  ...extra,
});

describe("pestañas", () => {
  it("«Por recibir» es el default; lo que no es pestaña cae ahí; los hrefs", () => {
    expect(filtroComprasDeUrl(undefined)).toBe("por-recibir");
    expect(filtroComprasDeUrl("abiertas")).toBe("por-recibir");
    expect(filtroComprasDeUrl("sin-gasto")).toBe("sin-gasto");
    expect(filtroComprasDeUrl("completas")).toBe("completas");
    expect(filtroComprasDeUrl("todas")).toBe("todas");
    expect(hrefPestanaCompras("por-recibir")).toBe("/admin/inventory/compras");
    expect(hrefPestanaCompras("sin-gasto")).toBe("/admin/inventory/compras?f=sin-gasto");
    expect(Object.values(PESTANAS_COMPRAS)).toEqual(["Por recibir", "Sin gasto", "Completas", "Todas"]);
    expect(AYUDA_FLUJO_COMPRAS).toContain("cada compra dice qué le falta");
  });

  it("qué compra cae en cada una (y los conteos): sin `gasto_estado` no se afirma que falte el gasto", () => {
    const pedidaSinGasto = fila();
    const recibidaSinGasto = fila({ id: "c-2", estado: "RECIBIDA", recibida_at: "2026-10-12T17:00:00+00:00" });
    const recibidaParcial = fila({ id: "c-3", estado: "RECIBIDA", gasto_estado: "PARCIAL", gasto_mercancia: 500, gasto_faltante: 222.9 });
    const completa = fila({ id: "c-4", estado: "RECIBIDA", gasto_estado: "REGISTRADO", gasto_mercancia: 722.9 });
    const pedidaConGasto = fila({ id: "c-5", gasto_estado: "REGISTRADO", gasto_mercancia: 722.9 });
    const apiPrevio = fila({ id: "c-6", gasto_estado: undefined, n_pagos: 1 });
    const todas = [pedidaSinGasto, recibidaSinGasto, recibidaParcial, completa, pedidaConGasto, apiPrevio];
    const ids = (f: Parameters<typeof filtrarComprasPorPestana>[1]) => filtrarComprasPorPestana(todas, f).map((c) => c.id);
    expect(ids("por-recibir")).toEqual(["c-1", "c-5", "c-6"]);
    expect(ids("sin-gasto")).toEqual(["c-1", "c-2", "c-3"]);
    expect(ids("completas")).toEqual(["c-4"]);
    expect(ids("todas")).toHaveLength(6);
    expect(contarPestanasCompras(todas)).toEqual({ "por-recibir": 3, "sin-gasto": 3, completas: 1, todas: 6 });
  });
});

describe("badges de recepción y gasto", () => {
  it("recepción: «Pedida, sin recibir» (ámbar) o «Recibida en bodega · día Cancún» (verde)", () => {
    expect(recepcionDe(fila())).toEqual({ estado: "PEDIDA", etiqueta: ETIQUETA_PEDIDA, tono: "ambar" });
    // 12-oct 03:30 UTC = 11-oct 22:30 Cancún: el día es el de Cancún.
    const r = recepcionDe(fila({ estado: "RECIBIDA", recibida_at: "2026-10-12T03:30:00+00:00" }));
    expect(r).toEqual({ estado: "RECIBIDA", etiqueta: `${ETIQUETA_RECIBIDA} · 11/10/2026`, tono: "verde" });
    expect(recepcionDe(fila({ estado: "RECIBIDA", recibida_at: null })).etiqueta).toBe(ETIQUETA_RECIBIDA);
  });

  it("gasto: sin / registrado con el monto / parcial con el faltante o «falta la factura de mercancía»", () => {
    expect(gastoDe(fila())).toEqual({ estado: "SIN_GASTO", etiqueta: ETIQUETA_SIN_GASTO, tono: "rojo" });
    expect(gastoDe(fila({ gasto_estado: "REGISTRADO", gasto_mercancia: "722.90" }))).toEqual({
      estado: "REGISTRADO",
      etiqueta: `${ETIQUETA_GASTO_REGISTRADO} · ${fmtMontoMoneda(722.9, "USD")}`,
      tono: "verde",
    });
    // En otra moneda sin T.C. el API manda null: registrado, sin monto.
    expect(gastoDe(fila({ gasto_estado: "REGISTRADO", gasto_mercancia: null })).etiqueta).toBe(ETIQUETA_GASTO_REGISTRADO);
    expect(gastoDe(fila({ gasto_estado: "PARCIAL", gasto_mercancia: 500, gasto_faltante: 222.9 })).etiqueta).toBe(
      `${ETIQUETA_GASTO_PARCIAL} · faltan ${fmtMontoMoneda(222.9, "USD")}`,
    );
    expect(gastoDe(fila({ gasto_estado: "PARCIAL", gasto_mercancia: 0, gasto_faltante: 722.9, moneda: "MXN" }))).toEqual({
      estado: "PARCIAL",
      etiqueta: `${ETIQUETA_GASTO_PARCIAL} · ${DETALLE_FALTA_MERCANCIA}`,
      tono: "ambar",
    });
  });

  it("API previo (sin `gasto_estado`): «N pagos ligados» / «Sin pagos» en gris, nunca «Sin gasto registrado»", () => {
    expect(gastoDe(fila({ gasto_estado: undefined, n_pagos: 2 }))).toEqual({ estado: "DESCONOCIDO", etiqueta: "2 pagos ligados", tono: "gris" });
    expect(gastoDe(fila({ gasto_estado: undefined, n_pagos: 1 })).etiqueta).toBe("1 pago ligado");
    expect(gastoDe(fila({ gasto_estado: undefined, n_pagos: 0 })).etiqueta).toBe("Sin pagos");
  });

  it("una compra sin líneas se puede eliminar desde la lista SOLO abierta; el texto avisa de los pagos", () => {
    expect(puedeEliminarDesdeLista(fila({ n_lineas: 0 }))).toBe(true);
    expect(puedeEliminarDesdeLista(fila({ n_lineas: 0, estado: "RECIBIDA" }))).toBe(false);
    expect(puedeEliminarDesdeLista(fila())).toBe(false);
    expect(textoConfirmarEliminarCompra({ folio: 7, n_pagos: 0 })).toBe("Se borra la compra #7 (no tiene líneas ni entradas en bodega).");
    expect(textoConfirmarEliminarCompra({ folio: 7, n_pagos: 1 })).toContain("pago ligado NO se borra");
    expect(textoConfirmarEliminarCompra({ folio: 7, n_pagos: 2 })).toContain("2 pagos ligados NO se borran");
  });
});

describe("la línea de pasos del detalle", () => {
  const detalle = (extra: Partial<CompraDetalle> = {}): CompraDetalle => ({
    id: "c-1",
    folio: 12,
    proveedor: { id: "p-1", nombre: "Aircraft Spruce" },
    fecha: "2026-10-02",
    referencia: "AS-1",
    moneda: "USD",
    tc_usd_mxn: 18.2,
    estado: "ABIERTA",
    cargos_factura: [],
    recibida_at: null,
    notas: null,
    lineas: [{ id: "l-1" } as CompraDetalle["lineas"][number]],
    pagos: [],
    resumen: {
      total_mercancia: 622.1,
      cargos_factura: 100.8,
      cargos_pagos: 0,
      total: 722.9,
      factor: 1.16,
      moneda: "USD",
      tc_usd_mxn: 18.2,
      total_usd: 722.9,
      total_mxn: null,
      avisos: [],
      total_factura: 722.9,
      gasto_estado: "SIN_GASTO",
      gasto_mercancia: 0,
      gasto_faltante: null,
    },
    ...extra,
  });

  it("pedida con líneas y sin gasto: Registrada ✓ · Recibida pendiente · Gasto pendiente ⇒ sigue «recibir»", () => {
    const pasos = pasosCompra(detalle());
    expect(pasos.map((p) => [p.clave, p.estado])).toEqual([
      ["registrada", "hecho"],
      ["recibida", "pendiente"],
      ["gasto", "pendiente"],
    ]);
    expect(pasos[0].detalle).toBe(`Registrada el 02/10/2026 · 1 línea · factura ${fmtMontoMoneda(722.9, "USD")}`);
    expect(pasos[1].detalle).toContain(ETIQUETA_ACCION.recibir);
    expect(pasos[2].detalle).toContain(ETIQUETA_SIN_GASTO);
    expect(accionSiguiente(pasos)).toBe("recibir");
  });

  it("sin líneas: la registrada pide atención y lo que sigue es agregar las líneas", () => {
    const pasos = pasosCompra(detalle({ lineas: [] }));
    expect(pasos[0]).toMatchObject({ estado: "atencion" });
    expect(pasos[0].detalle).toContain("sin líneas");
    expect(accionSiguiente(pasos)).toBe("lineas");
  });

  it("recibida sin gasto ⇒ sigue «gasto»; parcial ⇒ atención y sigue «gasto»; completa ⇒ nada", () => {
    const recibida = detalle({ estado: "RECIBIDA", recibida_at: "2026-10-12T17:00:00+00:00" });
    expect(accionSiguiente(pasosCompra(recibida))).toBe("gasto");
    const parcial = detalle({
      estado: "RECIBIDA",
      recibida_at: "2026-10-12T17:00:00+00:00",
      pagos: [{ id: "g-1" } as CompraDetalle["pagos"][number]],
      resumen: { ...detalle().resumen, gasto_estado: "PARCIAL", gasto_mercancia: 500, gasto_faltante: 222.9 },
    });
    const pasosParcial = pasosCompra(parcial);
    expect(pasosParcial[2]).toMatchObject({
      estado: "atencion",
      detalle: `${ETIQUETA_GASTO_PARCIAL} · faltan ${fmtMontoMoneda(222.9, "USD")}`,
    });
    expect(accionSiguiente(pasosParcial)).toBe("gasto");
    const completa = detalle({
      estado: "RECIBIDA",
      recibida_at: "2026-10-12T17:00:00+00:00",
      pagos: [{ id: "g-1" } as CompraDetalle["pagos"][number]],
      resumen: { ...detalle().resumen, gasto_estado: "REGISTRADO", gasto_mercancia: 722.9 },
    });
    const pasosCompleta = pasosCompra(completa);
    expect(pasosCompleta.every((p) => p.estado === "hecho")).toBe(true);
    expect(pasosCompleta[1].detalle).toBe(`${ETIQUETA_RECIBIDA} · 12/10/2026`);
    expect(accionSiguiente(pasosCompleta)).toBeNull();
  });
});

describe("«Registrar gasto»", () => {
  it("el T.C. es obligatorio y en banda, con los MISMOS textos que el API (15–25)", () => {
    expect([TC_COMPRA_MIN, TC_COMPRA_MAX]).toEqual([15, 25]);
    expect(validarTcCompra("")).toEqual({ ok: false, error: MSG_TC_REQUERIDO });
    expect(validarTcCompra("abc")).toEqual({ ok: false, error: MSG_TC_REQUERIDO });
    expect(validarTcCompra("0")).toEqual({ ok: false, error: MSG_TC_REQUERIDO });
    expect(validarTcCompra("182.5")).toEqual({ ok: false, error: mensajeTcFueraDeRango(182.5) });
    expect(validarTcCompra("18,25")).toEqual({ ok: true, tc: 18.25 });
    expect(validarTcCompra(" 25 ")).toEqual({ ok: true, tc: 25 });
    // Paridad con el API: la banda y los dos textos viven en compra-gasto.util.ts.
    const api = path.resolve(__dirname, "../../../../../vuelatour-api/src/modules/expenses/compra-gasto.util.ts");
    let fuente = "";
    try {
      fuente = readFileSync(api, "utf8");
    } catch {
      return;
    }
    expect(fuente).toContain("export const TC_COMPRA_MIN = 15;");
    expect(fuente).toContain("export const TC_COMPRA_MAX = 25;");
    expect(fuente).toContain(`'${MSG_TC_REQUERIDO}'`);
    expect(fuente).toContain("está fuera del rango razonable (${TC_COMPRA_MIN} a ${TC_COMPRA_MAX} pesos por dólar): revisa la captura.");
  });

  it("los textos: descripción con el monto del API, equivalente informativo, confirmación y toast", () => {
    const usd = fmtMontoMoneda(722.9, "USD");
    const d = descripcionRegistrarGasto({ moneda: "USD", resumen: { total_factura: 722.9 } });
    expect(d).toContain(`UN gasto de Refacción por ${usd}`);
    expect(d).toContain("Vincular gasto ya registrado");
    // 722.90 × 18.25 = 13,192.925 ⇒ $13,192.93 MXN (fmtMxn ya trae la moneda).
    expect(textoEquivalente(722.9, "USD", 18.25)).toBe("≈ $13,192.93 MXN");
    expect(textoEquivalente(13192.93, "MXN", 18.25)).toBe("≈ $722.90 USD");
    expect(textoEquivalente(722.9, "USD", null)).toBeNull();
    expect(
      textoConfirmarRegistrarGasto({ folio: 12, monto: 722.9, moneda: "USD", tc: 18.25, fecha: "2026-10-21", medio: "TRANSFERENCIA" }),
    ).toBe(
      `Se crea un gasto de Refacción por ${usd} (≈ $13,192.93 MXN al T.C. 18.25) con fecha 21/10/2026, pagado por Transferencia, y queda ligado a la compra #12 como su factura de mercancía.`,
    );
    expect(
      toastGastoRegistrado({
        folio: 12,
        gasto_registrado: { id: "g", monto: 722.9, moneda: "USD", tc_gasto: 18.25, fecha_gasto: null, medio_pago: null, estado_pago: null },
        tc_compra_fijado: true,
      }),
    ).toBe(`Gasto registrado por ${usd} y ligado a la compra #12 · el tipo de cambio quedó también en la compra.`);
  });
});

describe("candidatos y entrada desde un gasto", () => {
  it("la línea del candidato: fecha · categoría · monto, con proveedor, notas, folio, medio y conciliado debajo", () => {
    expect(
      lineaCandidato({
        id: "g",
        fecha_gasto: "2026-10-02",
        categoria: "REFACCION",
        monto: 722.9,
        moneda: "USD",
        tc_gasto: null,
        medio_pago: "TRANSFERENCIA",
        folio_ticket: "AS-1",
        descripcion: "Filtros",
        proveedor: { id: "p", nombre: "Aircraft Spruce" },
        conciliado: true,
        rol_sugerido: "MERCANCIA",
        puede_mercancia: true,
      }),
    ).toEqual({
      titulo: `02/10/2026 · Refacción · ${fmtMontoMoneda(722.9, "USD")}`,
      detalle: "Aircraft Spruce · Filtros · Folio AS-1 · Transferencia · Conciliado con el banco",
    });
  });

  it("el toast de la entrada: verde recibida; ámbar si la compra quedó abierta (con el aviso del API)", () => {
    const compra = { folio: 13 } as CompraDetalle;
    expect(toastEntradaDesdeGasto({ compra, recibida: true, entrada_id: "e", avisos: [] })).toEqual({
      tipo: "success",
      titulo: "Entrada registrada: compra #13 recibida con su gasto vinculado.",
      descripcion: undefined,
    });
    const t = toastEntradaDesdeGasto({ compra, recibida: false, entrada_id: null, avisos: ["La compra #13 quedó registrada… Recíbela desde Compras."] });
    expect(t.tipo).toBe("warning");
    expect(t.titulo).toContain("NO entró a bodega");
    expect(t.descripcion).toContain("Recíbela desde Compras");
  });
});

describe("«Registrar compra»: el cuerpo que viaja", () => {
  it("líneas en blanco se descartan; una línea con nombre exige unidades > 0 y costo ≥ 0; nada vacío viaja", () => {
    const f = formRegistrarCompraVacio("2026-10-21");
    expect(cuerpoRegistrarCompra(f)).toEqual({ ok: true, cuerpo: { fecha: "2026-10-21", moneda: "USD", lineas: [] } });
    const conLinea = { ...f, proveedor_id: "p-1", referencia: " AS-1 ", tc_usd_mxn: "18,25", lineas: [{ ...f.lineas[0], nombre: " Filtro ", numero_parte: "CH48110", cantidad: "2", costo_unitario: "120.12345" }] };
    expect(cuerpoRegistrarCompra(conLinea)).toEqual({
      ok: true,
      cuerpo: {
        proveedor_id: "p-1",
        fecha: "2026-10-21",
        referencia: "AS-1",
        moneda: "USD",
        tc_usd_mxn: 18.25,
        lineas: [{ nombre: "Filtro", numero_parte: "CH48110", cantidad: 2, costo_unitario: 120.1235 }],
      },
    });
    expect(cuerpoRegistrarCompra({ ...f, lineas: [{ ...f.lineas[0], nombre: "Filtro", cantidad: "0", costo_unitario: "1" }] })).toMatchObject({ ok: false });
    expect(cuerpoRegistrarCompra({ ...f, lineas: [{ ...f.lineas[0], nombre: "Filtro", cantidad: "1", costo_unitario: "" }] })).toMatchObject({ ok: false });
    expect(cuerpoRegistrarCompra({ ...f, fecha: "" })).toMatchObject({ ok: false });
    expect(cuerpoRegistrarCompra({ ...f, tc_usd_mxn: "-1" })).toMatchObject({ ok: false });
    expect(cuerpoRegistrarCompra({ ...f, gasto_mercancia_id: "g-1" })).toMatchObject({ ok: true, cuerpo: { gasto_mercancia_id: "g-1" } });
  });
});

// ===== Los gastos de la compra, uno por uno (4-nov-2026, API 0.0.120, invariante 116 del API) =====

describe("los campos del gasto de una compra (compartidos)", () => {
  it("el T.C. inicial: el de la compra manda; si no, el oficial de hoy; si no, vacío", () => {
    expect(tcInicialCompra(17.5, 18.2)).toBe("17.5");
    expect(tcInicialCompra("17.5", 18.2)).toBe("17.5");
    expect(tcInicialCompra(null, 18.2)).toBe("18.2");
    expect(tcInicialCompra(0, 18.2)).toBe("18.2");
    expect(tcInicialCompra(null, null)).toBe("");
    expect(tcInicialCompra(null, 0)).toBe("");
  });

  it("montoDeTexto: a centavos; coma decimal o de miles; nada, cero o negativo ⇒ null", () => {
    expect(montoDeTexto("1850.5")).toBe(1850.5);
    expect(montoDeTexto("1,850.50")).toBe(1850.5);
    expect(montoDeTexto("1850,50")).toBe(1850.5);
    expect(montoDeTexto(" 10.004 ")).toBe(10);
    for (const v of ["", "   ", "x", "0", "-3", null, undefined]) expect(montoDeTexto(v)).toBeNull();
  });

  it("cuerpoRegistrarGastoCompra: T.C. en banda, fecha, medio; cuenta solo con medio que la lleva; tarjeta solo con TARJETA_CORP; folio recortado; foto si hay", () => {
    const base = formGastoCompraVacio({ tc: "18.25", fecha: "2026-11-04", proveedor: "p-1", folio: " AS-1 " });
    expect(cuerpoRegistrarGastoCompra({ ...base, tc: "" })).toEqual({ ok: false, error: MSG_TC_REQUERIDO });
    expect(cuerpoRegistrarGastoCompra({ ...base, tc: "182" })).toEqual({ ok: false, error: mensajeTcFueraDeRango(182) });
    expect(cuerpoRegistrarGastoCompra({ ...base, fecha: "04/11/2026" })).toEqual({ ok: false, error: MSG_FECHA_PAGO_REQUERIDA });
    expect(cuerpoRegistrarGastoCompra(base)).toEqual({ ok: false, error: `${MSG_MEDIO_REQUERIDO}.` });
    expect(
      cuerpoRegistrarGastoCompra({ ...base, medio: "TARJETA_CORP", tarjeta: "6256", cuenta: "cta-1", notas: " ok " }, "oficina/1-a.pdf"),
    ).toEqual({
      ok: true,
      cuerpo: {
        tc_usd_mxn: 18.25,
        fecha_gasto: "2026-11-04",
        medio_pago: "TARJETA_CORP",
        tarjeta_terminacion: "6256",
        proveedor_id: "p-1",
        folio_ticket: "AS-1",
        notas: "ok",
        foto_url: "oficina/1-a.pdf",
      },
    });
    const transf = cuerpoRegistrarGastoCompra({ ...base, medio: "TRANSFERENCIA", tarjeta: "6256", cuenta: "cta-1" });
    expect(transf.ok && transf.cuerpo).toMatchObject({ medio_pago: "TRANSFERENCIA", cuenta_bancaria_id: "cta-1" });
    expect(transf.ok && transf.cuerpo).not.toHaveProperty("tarjeta_terminacion");
    expect(transf.ok && transf.cuerpo).not.toHaveProperty("foto_url");
    const efectivo = cuerpoRegistrarGastoCompra({ ...base, medio: "EFECTIVO", cuenta: "cta-1", proveedor: "", folio: "" });
    expect(efectivo.ok && efectivo.cuerpo).not.toHaveProperty("cuenta_bancaria_id");
    expect(efectivo.ok && efectivo.cuerpo).not.toHaveProperty("proveedor_id");
    expect(efectivo.ok && efectivo.cuerpo).not.toHaveProperty("folio_ticket");
  });

  it("cuerpoAgregarGastoCompra: arranca como ENVÍO en PESOS; el monto va primero; rol, monto y moneda de SU factura más lo común", () => {
    const vacio = formOtroGastoCompraVacio({ tc: "18.8052", fecha: "2026-11-04" });
    expect(vacio).toMatchObject({ rol: "ENVIO", moneda: "MXN", monto: "", medio: "", proveedor: "" });
    expect(cuerpoAgregarGastoCompra(vacio)).toEqual({ ok: false, error: MSG_MONTO_REQUERIDO });
    expect(cuerpoAgregarGastoCompra({ ...vacio, monto: "1850.50" })).toEqual({ ok: false, error: `${MSG_MEDIO_REQUERIDO}.` });
    expect(
      cuerpoAgregarGastoCompra({ ...vacio, rol: "IMPUESTOS", moneda: "USD", monto: "1,850.50", medio: "TARJETA_CORP", proveedor: "p-ups" }, "oficina/guia.pdf"),
    ).toEqual({
      ok: true,
      cuerpo: {
        rol: "IMPUESTOS",
        monto: 1850.5,
        moneda: "USD",
        tc_usd_mxn: 18.8052,
        fecha_gasto: "2026-11-04",
        medio_pago: "TARJETA_CORP",
        proveedor_id: "p-ups",
        foto_url: "oficina/guia.pdf",
      },
    });
    expect(ROL_OTRO_GASTO_OPTIONS.map((o) => o.value)).toEqual(["ENVIO", "IMPUESTOS", "OTRO"]);
    expect(ETIQUETA_ROL_OTRO_GASTO.ENVIO).toBe("Envío");
  });

  it("los textos de «Agregar gasto»: confirmación con el equivalente y el rol, toast con el rol", () => {
    expect(
      textoConfirmarAgregarGasto({ folio: 12, rol: "ENVIO", monto: 1850.5, moneda: "MXN", tc: 18.8052, fecha: "2026-11-04", medio: "TARJETA_CORP" }),
    ).toBe(
      `Se crea un gasto por ${fmtMontoMoneda(1850.5, "MXN")} (${textoEquivalente(1850.5, "MXN", 18.8052)} al T.C. 18.8052) con fecha 04/11/2026, pagado por Tarjeta corporativa, y queda ligado a la compra #12 como envío.`,
    );
    expect(
      toastGastoAgregado(
        { folio: 12, gasto_registrado: { id: "g", monto: 1850.5, moneda: "MXN", tc_gasto: null, fecha_gasto: null, medio_pago: null, estado_pago: null }, tc_compra_fijado: true },
        "IMPUESTOS",
      ),
    ).toBe(`Gasto agregado a la compra #12 por ${fmtMontoMoneda(1850.5, "MXN")} (impuestos / aduana): quedó en «Gastos de compras» · el tipo de cambio quedó también en la compra.`);
  });
});

describe("«Registrar compra»: ¿Y el pago?", () => {
  it("tres caminos con «Ya la pagué» por default; las líneas deben traer costo para el gasto", () => {
    expect(PAGO_COMPRA_DEFAULT).toBe("ahora");
    expect(OPCIONES_PAGO_COMPRA.map((o) => o.value)).toEqual(["ahora", "despues", "vincular"]);
    const f = formRegistrarCompraVacio("2026-11-04");
    expect(lineasConCosto(f)).toBe(false);
    f.lineas[0].nombre = "Alfombra";
    f.lineas[0].costo_unitario = "0";
    expect(lineasConCosto(f)).toBe(false);
    f.lineas[0].costo_unitario = "300";
    expect(lineasConCosto(f)).toBe(true);
  });

  it("los textos: confirmación, toast de compra + gasto y el aviso cuando la compra nació sin su gasto", () => {
    expect(textoConfirmarCompraConGasto({ lineas: 1, moneda: "USD", tc: 18.8052, fecha: "2026-11-02", medio: "TARJETA_CORP" })).toBe(
      "Se registra la compra con 1 línea y, enseguida, su gasto de Refacción en USD por el total de la factura (lo calcula el API) al T.C. 18.8052, con fecha 02/11/2026 y pagado por Tarjeta corporativa.",
    );
    expect(
      toastCompraConGasto({ folio: 14, gasto_registrado: { id: "g", monto: 300, moneda: "USD", tc_gasto: null, fecha_gasto: null, medio_pago: null, estado_pago: null } }),
    ).toBe(`Compra #14 registrada y su gasto por ${fmtMontoMoneda(300, "USD")} quedó en «Gastos de compras».`);
    expect(avisoCompraSinGasto(14, "Folio duplicado.")).toBe(
      "La compra #14 quedó registrada, pero su gasto NO: Folio duplicado. Regístralo desde la compra con «Registrar gasto».",
    );
    expect(avisoCompraSinGasto(14, undefined)).toBe(
      "La compra #14 quedó registrada, pero su gasto NO: Regístralo desde la compra con «Registrar gasto».",
    );
  });
});

// ===== «Compra directa» desde Inventario/Tienda (6-nov-2026) =====

describe("«Compra directa»: textos y decisiones puras", async () => {
  const m = await import("@/lib/admin/compras-estado");

  it("«Ya está en bodega» nace SIEMPRE sin marcar (6-nov-2026); título y descripción por modo", () => {
    expect(m.recibirAhoraDefault("directa")).toBe(false);
    expect(m.recibirAhoraDefault("compras")).toBe(false);
    expect(m.HINT_RECIBIR_AHORA).toContain("Nace sin marcar");
    expect(m.tituloRegistrarCompra("directa")).toBe("Compra directa");
    expect(m.tituloRegistrarCompra("compras")).toBe("Registrar compra");
    expect(m.descripcionRegistrarCompra("directa")).toContain("sin pasar por Compras");
    expect(m.descripcionRegistrarCompra("directa")).toContain("marca «Ya está en bodega»");
    expect(m.descripcionRegistrarCompra("compras")).toBe(m.DESCRIPCION_REGISTRAR_COMPRA);
    expect(m.ETIQUETA_RECIBIR_AHORA).toBe("Ya está en bodega: dar entrada al inventario ahora");
    expect(m.ETIQUETA_COMO_SE_PAGO).toBe("¿Cómo se pagó?");
  });

  it("el botón dice lo que va a pasar", () => {
    expect(m.etiquetaBotonRegistrarCompra({ modo: "directa", conGasto: true, recibir: true })).toBe("Registrar compra directa");
    expect(m.etiquetaBotonRegistrarCompra({ modo: "compras", conGasto: true, recibir: true })).toBe("Registrar compra, su gasto y la entrada");
    expect(m.etiquetaBotonRegistrarCompra({ modo: "compras", conGasto: true, recibir: false })).toBe("Registrar compra y su gasto");
    expect(m.etiquetaBotonRegistrarCompra({ modo: "compras", conGasto: false, recibir: true })).toBe("Registrar compra y recibirla");
    expect(m.etiquetaBotonRegistrarCompra({ modo: "compras", conGasto: false, recibir: false })).toBe("Registrar compra");
  });

  it("la confirmación menciona la entrada a bodega solo con «recibir»; toasts y aviso de recepción fallida", () => {
    const base = { lineas: 2, moneda: "USD", tc: 18.8052, fecha: "2026-11-06", medio: "TARJETA_CORP" };
    expect(m.textoConfirmarCompraConGasto(base)).not.toContain("entran a bodega");
    expect(m.textoConfirmarCompraConGasto({ ...base, recibir: true })).toMatch(/ Las líneas entran a bodega de inmediato\.$/);
    const c = { folio: 15, gasto_registrado: { monto: 300, moneda: "USD" } } as Parameters<typeof m.toastCompraDirecta>[0];
    expect(m.toastCompraDirecta(c, 1)).toBe(`Compra directa #15 registrada: gasto por ${fmtMontoMoneda(300, "USD")} y 1 línea ya está en el inventario.`);
    expect(m.toastCompraDirecta(c, 3)).toContain("3 líneas ya están en el inventario");
    expect(m.toastCompraRecibida(15, 2)).toBe("Compra #15 registrada y recibida: 2 líneas ya están en el inventario.");
    expect(m.avisoCompraSinRecepcion(15, "Cargos sin tipo de cambio.")).toBe(
      "La compra #15 quedó registrada, pero NO entró a bodega: Cargos sin tipo de cambio. Recíbela desde Compras con «Ya llegó: recibir en bodega».",
    );
    expect(m.avisoCompraSinRecepcion(15, null)).toBe(
      "La compra #15 quedó registrada, pero NO entró a bodega: Recíbela desde Compras con «Ya llegó: recibir en bodega».",
    );
  });

  it("ningún texto de compras manda a «Gastos» como si los pagos vivieran ahí (invariante 118)", () => {
    for (const o of m.ROL_OTRO_GASTO_OPTIONS) expect(o.description).not.toContain("en Gastos");
    expect(m.DESCRIPCION_GASTOS_COMPRA).not.toContain("en Gastos");
    expect(m.TITULO_BOTON_AGREGAR_GASTO).not.toContain("en Gastos");
    expect(m.HINT_COMPROBANTE).toContain("«Ver / editar»");
  });
});

describe("gastos aparte en la misma captura (envío, aduana, otro cargo)", async () => {
  const m = await import("@/lib/admin/compras-estado");
  const base = {
    tc: "18.8052",
    fecha: "2026-11-06",
    medio: "TARJETA_CORP",
    tarjeta: "6256",
    cuenta: "",
    proveedor: "prov-compra",
    folio: "AS-1",
    notas: "nota de la compra",
  };

  it("una fila nace como envío en pesos; sin monto se dice qué falta; vacío ⇒ sin error", () => {
    const f = m.filaOtroGastoVacia("o-1");
    expect(f).toEqual({ key: "o-1", rol: "ENVIO", monto: "", moneda: "MXN", proveedor: "" });
    expect(m.errorFilaOtroGasto(f)).toBe("Captura el monto del gasto aparte (envío) o quítalo.");
    expect(m.errorFilaOtroGasto({ ...f, rol: "IMPUESTOS", monto: "0" })).toBe(
      "Captura el monto del gasto aparte (impuestos / aduana) o quítalo.",
    );
    expect(m.errorFilaOtroGasto({ ...f, monto: "3,800.50" })).toBeNull();
    expect(m.errorOtrosGastos([])).toBeNull();
    expect(m.errorOtrosGastos([{ ...f, monto: "10" }, { ...f, key: "o-2", rol: "OTRO" }])).toBe(
      "Captura el monto del gasto aparte (otro cargo) o quítalo.",
    );
  });

  it("el cuerpo hereda fecha, medio, tarjeta y T.C. del pago principal; la fila pone rol, monto, moneda, proveedor y foto; sin folio ni notas", () => {
    const fila = { key: "o-1", rol: "ENVIO" as const, monto: "3800", moneda: "MXN" as const, proveedor: "prov-ups" };
    const v = m.cuerpoOtroGastoDirecta(fila, base, "oficina/ups.pdf");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.cuerpo).toMatchObject({
      rol: "ENVIO",
      monto: 3800,
      moneda: "MXN",
      tc_usd_mxn: 18.8052,
      fecha_gasto: "2026-11-06",
      medio_pago: "TARJETA_CORP",
      tarjeta_terminacion: "6256",
      proveedor_id: "prov-ups",
      foto_url: "oficina/ups.pdf",
    });
    expect(v.cuerpo).not.toHaveProperty("folio_ticket");
    expect(v.cuerpo).not.toHaveProperty("notas");
    const sinMonto = m.cuerpoOtroGastoDirecta({ ...fila, monto: "" }, base, null);
    expect(sinMonto).toEqual({ ok: false, error: m.MSG_MONTO_REQUERIDO });
  });

  it("textos: confirmación, sufijo del toast y aviso de uno que no se registró", () => {
    const ups = { key: "o-1", rol: "ENVIO" as const, monto: "3800", moneda: "MXN" as const, proveedor: "" };
    const aduana = { key: "o-2", rol: "IMPUESTOS" as const, monto: "120", moneda: "USD" as const, proveedor: "" };
    expect(m.textoOtrosGastosConfirmar([])).toBe("");
    expect(m.textoOtrosGastosConfirmar([ups, { ...aduana, monto: "" }])).toBe(
      ` Además, 1 gasto aparte: envío ${fmtMontoMoneda(3800, "MXN")}.`,
    );
    expect(m.textoOtrosGastosConfirmar([ups, aduana])).toBe(
      ` Además, 2 gastos aparte: envío ${fmtMontoMoneda(3800, "MXN")}, impuestos / aduana ${fmtMontoMoneda(120, "USD")}.`,
    );
    expect(m.sufijoOtrosGastosToast(0)).toBe("");
    expect(m.sufijoOtrosGastosToast(1)).toBe(" y 1 gasto aparte (envío, aduana u otro)");
    expect(m.sufijoOtrosGastosToast(2)).toBe(" y 2 gastos aparte (envío, aduana u otros)");
    expect(m.avisoOtroGastoNoRegistrado(15, ups, "Sin saldo.")).toBe(
      `La compra #15 quedó registrada, pero el gasto aparte de envío (${fmtMontoMoneda(3800, "MXN")}) NO: Sin saldo. Agrégalo desde la compra con «Agregar gasto».`,
    );
  });
});
