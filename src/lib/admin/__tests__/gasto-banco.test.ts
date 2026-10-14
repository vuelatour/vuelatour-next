/**
 * «Conciliación al revés» de un gasto (13-oct-2026, API 0.0.75): roles,
 * textos, fichas y URLs de la hoja «Conciliación con el banco». Los datos son
 * los REALES del contrato; las fechas se comparan contra `fmtDateOnly` /
 * `fmtDate` / `fmtDateTime` (Intl puede escribir «sept»).
 */
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { estadoBancoGasto } from "@/lib/admin/conciliacion-estado";
import { NAV_GROUPS } from "@/lib/admin/nav-items";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  BOTON_BUSCAR_CARGO,
  BOTON_BUSCAR_FALTANTE,
  CAUSAS_SIN_CONCILIAR,
  INTRO_PARCIAL,
  INTRO_SIN_CONCILIAR,
  MSG_DETALLE_BANCO_API_VIEJO,
  MSG_DETALLE_BANCO_FALLO,
  MSG_DETALLE_BANCO_SIN_PERMISO,
  MSG_ESTADO_CUENTA_FALLO,
  MSG_ESTADO_CUENTA_NO_EXISTE,
  MSG_GASTO_YA_NO_EXISTE,
  MSG_SESION_EXPIRO,
  NOTA_NO_BANCARIO_PARCIAL,
  NOTA_USD_PAGADO_EN_PESOS,
  ROLES_DETALLE_BANCO_GASTO,
  TEXTO_LIGA_ANTERIOR,
  TITULO_EXCEL_GASTOS_CON_BANCO,
  accionesPendiente,
  descripcionHojaBanco,
  estadoCambio,
  etiquetaBotonBanco,
  etiquetaDescargaEstadoCuenta,
  fichaCargoGasto,
  hrefBuscarCargoEnConciliacion,
  hrefCargoEnConciliacion,
  hrefVerYaConciliados,
  lineaPagoGasto,
  mensajeErrorDescargaEstadoCuenta,
  mensajeErrorDetalleBanco,
  montoParaBusquedaTabla,
  puedeVerDetalleBancoGasto,
  resumenEstadoBanco,
  textoAlertaConciliacionGasto,
  textoCoberturaImportada,
  tituloExcelGastos,
} from "@/lib/admin/gasto-banco";
import {
  CUENTA_EJE,
  CUENTA_GASTOS,
  EC_EJE_SEP,
  ID_345,
  MOV_SAESA,
  cargoSaesa,
  respuesta321,
  respuesta345,
  respuestaSinConciliar,
} from "./gasto-banco.fixtures";
import type { ConciliacionDeGasto } from "@/types/conciliacion";

describe("roles: ADMIN y FACTURACION (sin rol conocido se ofrece; el API es el candado)", () => {
  it("quién ve el detalle", () => {
    for (const rol of ["ADMIN", "FACTURACION", null, undefined, ""]) expect(puedeVerDetalleBancoGasto(rol), String(rol)).toBe(true);
    for (const rol of ["COORDINADOR", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeVerDetalleBancoGasto(rol), rol).toBe(false);
    }
  });

  it("paridad con el menú «Conciliación» (nav-items)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/admin/conciliacion");
    expect([...(item?.roles ?? [])].sort()).toEqual([...ROLES_DETALLE_BANCO_GASTO].sort());
  });

  it("el título del Excel solo a quien recibe el detalle del banco", () => {
    expect(tituloExcelGastos("ADMIN")).toBe(TITULO_EXCEL_GASTOS_CON_BANCO);
    expect(tituloExcelGastos(null)).toBe(TITULO_EXCEL_GASTOS_CON_BANCO);
    expect(tituloExcelGastos("COORDINADOR")).toBeUndefined();
    expect(tituloExcelGastos("ANALISTA")).toBeUndefined();
  });
});

describe("encabezado de la hoja y del badge", () => {
  it("el nombre accesible del badge EMPIEZA con el texto visible", () => {
    const g = { monto: 2801.4, moneda: "MXN", fecha_gasto: "2026-09-28" };
    const e = estadoBancoGasto({ ...g, conciliado: true, medio_pago: "TRANSFERENCIA" });
    expect(etiquetaBotonBanco(e, g)).toBe(
      `Conciliado: ver la conciliación con el banco del gasto de $2,801.40 del ${fmtDateOnly("2026-09-28")}`,
    );
  });

  it("descripción (categoría · monto · fecha · vuelo · factura) y con qué se pagó", () => {
    expect(descripcionHojaBanco(respuesta345().gasto)).toBe(`Operaciones · $2,801.40 · ${fmtDateOnly("2026-09-28")} · vuelo #345`);
    expect(descripcionHojaBanco({ ...respuesta345().gasto, folio_comprobante: "A-0411" })).toContain(" · Factura A-0411");
    // La fila de Gastos (antes de que conteste el API): el vuelo viene como objeto.
    expect(descripcionHojaBanco({ categoria: "GAS", monto: "8939.38", moneda: "MXN", fecha_gasto: "2026-09-01", vuelo: null })).toBe(
      `${categoriaGastoLabel("GAS")} · $8,939.38 · ${fmtDateOnly("2026-09-01")}`,
    );
    expect(descripcionHojaBanco({ categoria: "REFACCION", monto: 722.9, moneda: "USD", vuelo: { folio: "12" } })).toBe(
      `${categoriaGastoLabel("REFACCION")} · $722.90 USD · vuelo #12`,
    );
    expect(lineaPagoGasto({ medio_pago: "TRANSFERENCIA" })).toBe("Pagado con: Transferencia");
    expect(lineaPagoGasto({ medio_pago: "TARJETA_CORP", tarjeta_terminacion: "4929" })).toBe(
      "Pagado con: Tarjeta corporativa ****4929",
    );
    expect(lineaPagoGasto({ medio_pago: "EFECTIVO", tarjeta_terminacion: "4929" })).toBe("Pagado con: Efectivo");
  });
});

describe("resumenEstadoBanco: las 9 ramas", () => {
  it("1. conciliado sin cargos (aviso)", () => {
    expect(resumenEstadoBanco(respuesta345({ cargos: [] }))).toEqual({
      texto: "Marcado como conciliado, pero no tiene ningún cargo del banco ligado.",
      tono: "aviso",
    });
  });

  it("2. cruzado: JAMÁS «suman $0.00»", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, moneda: "USD", monto: 722.9, tc_gasto: 17.2244 },
      vista: { n_partes: 1, cruzado: true, suma: 0, monto_vinculado: 722.9, faltante: 0, cubierto: true },
      cargos: [cargoSaesa({ lote: null, parte: { monto_parte: 12451.49, moneda: "MXN", cruzada: true, registro: null } })],
    });
    const t = resumenEstadoBanco(r);
    expect(t).toEqual({ texto: "Conciliado: compra en USD pagada con un cargo en MXN.", tono: "ok" });
    expect(t.texto).not.toContain("suman");
  });

  it("3. no bancario con justificación", () => {
    const r = respuesta345({ gasto: { ...respuesta345().gasto, medio_pago: "EFECTIVO" }, cargos: [cargoSaesa({ lote: null })] });
    expect(resumenEstadoBanco(r).texto).toBe(
      "Conciliado con justificación: se pagó fuera del banco (Efectivo) y se ligó a un cargo sin cambiar su medio de pago.",
    );
  });

  it("4. un cargo de lote (y el singular «1 gasto más»)", () => {
    expect(resumenEstadoBanco(respuesta345()).texto).toBe("Conciliado: lo paga un cargo del banco junto con 3 gastos más.");
    const dos = respuesta345({ cargos: [cargoSaesa({ lote: { ...cargoSaesa().lote!, gastos_n: 2 } })] });
    expect(resumenEstadoBanco(dos).texto).toBe("Conciliado: lo paga un cargo del banco junto con 1 gasto más.");
  });

  it("5. un cargo", () => {
    expect(resumenEstadoBanco(respuesta321())).toEqual({ texto: "Conciliado con 1 cargo del banco.", tono: "ok" });
  });

  it("6. N cargos (con la suma de la vista; sin vista, sin suma)", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, monto: 136.99 },
      vista: { n_partes: 2, cruzado: false, suma: 136.99, monto_vinculado: 136.99, faltante: 0, cubierto: true },
      cargos: [cargoSaesa({ lote: null, movimiento_id: "a" }), cargoSaesa({ lote: null, movimiento_id: "b" })],
    });
    expect(resumenEstadoBanco(r).texto).toBe("Conciliado con 2 cargos del banco: suman $136.99 de $136.99.");
    expect(resumenEstadoBanco({ ...r, vista: null, fuente: "ESPEJO" }).texto).toBe("Conciliado con 2 cargos del banco.");
  });

  it("7. parcial (aviso; sin vista, sin cifras)", () => {
    const r = respuesta345({
      estado: "PARCIAL",
      gasto: { ...respuesta345().gasto, monto: 1800, conciliado: false },
      vista: { n_partes: 1, cruzado: false, suma: 1200, monto_vinculado: 1200, faltante: 600, cubierto: false },
    });
    expect(resumenEstadoBanco(r)).toEqual({
      texto: "Pago parcial: los cargos ligados suman $1,200.00; faltan $600.00 de $1,800.00.",
      tono: "aviso",
    });
    expect(resumenEstadoBanco({ ...r, vista: null }).texto).toBe("Pago parcial: los cargos ligados no cubren el gasto.");
  });

  it("8. sin conciliar (pendiente) y 9. no aplica (neutro)", () => {
    expect(resumenEstadoBanco(respuestaSinConciliar())).toEqual({
      texto: "Sin conciliar: ningún cargo del banco está ligado a este pago (Tarjeta corporativa).",
      tono: "pendiente",
    });
    expect(resumenEstadoBanco({ ...respuestaSinConciliar(), estado: "NO_APLICA" })).toEqual({
      texto: "Este pago no se concilia con el banco (efectivo, personal o bodega).",
      tono: "neutro",
    });
  });
});

describe("fichaCargoGasto (fixtures de prod)", () => {
  it("SAESA visto desde #345: cuenta, leyenda, lo que le toca, el lote con «este gasto» y sin diferencia", () => {
    const r = respuesta345();
    const f = fichaCargoGasto(r.cargos[0], r);
    expect(f.titulo).toBe(`Cargo del ${fmtDateOnly("2026-09-30")}`);
    expect(f.monto).toBe("$11,205.60");
    expect(f.cuenta).toBe("EJE SCOTIA · Scotiabank (MXN)");
    expect(f.leyenda).toBe("Leyenda del banco: «SEL TRANSF. INTERBANCARIA SPEI» · Ref. 00000000000000000001");
    expect(f.aporte).toBe("Este cargo paga 4 gastos; a este le tocan $2,801.40.");
    expect(f.lote?.titulo).toBe("4 gastos · suman $11,205.60");
    expect(f.lote?.lineas.map((l) => l.esEste)).toEqual([false, true, false, false]);
    expect(f.lote?.lineas[1].principal).toContain("vuelo #345");
    expect(f.lote?.diferencia).toBeNull();
    expect(f.registro).toBe(`Registró la liga: Diego Ramírez · ${fmtDateTime("2026-10-13T21:43:29.382119+00:00")}`);
    expect(f.archivo).toEqual({
      tipo: "ARCHIVO",
      nombre: "scotia eje sep.pdf",
      detalle: `Importado el ${fmtDateTime("2026-10-06T15:22:46.413405+00:00")} por Alejandro Canales`,
      estadoCuentaId: EC_EJE_SEP,
      etiquetaDescarga: "Descargar estado de cuenta (PDF)",
    });
  });

  it("EJE SCOTIA 6,694.13: la diferencia del lote «de más» (y «de menos»); sin detalle del lote", () => {
    const r = respuesta345();
    const lote = { ...cargoSaesa().lote!, gastos_n: 3, gastos_suma: 6694.11, gastos_diferencia: 0.02 };
    const f = fichaCargoGasto(cargoSaesa({ monto: 6694.13, lote }), r);
    expect(f.lote?.diferencia).toBe("Diferencia con el cargo: $0.02 (el banco cobró de más; ningún gasto se ajusta).");
    expect(fichaCargoGasto(cargoSaesa({ lote: { ...lote, gastos_diferencia: -0.01 } }), r).lote?.diferencia).toBe(
      "Diferencia con el cargo: $0.01 (el banco cobró de menos; ningún gasto se ajusta).",
    );
    const sin = fichaCargoGasto(cargoSaesa({ lote: { ...lote, gastos: null } }), r);
    expect(sin.lote?.sinDetalle).toBe(
      "No se pudo leer el detalle de los otros gastos que paga el cargo; vuelve a abrir esta ventana.",
    );
    expect(sin.lote?.lineas).toEqual([]);
  });

  it("#269: dos cargos, cada uno dice lo que aporta", () => {
    const r = respuesta345({
      gasto: { ...respuesta345().gasto, id: "0e8ead24-46c8-4b47-a128-64a2ad493321", monto: 136.99 },
      cargos: [
        cargoSaesa({ movimiento_id: "5f7ce959", monto: 15.08, lote: null, parte: { monto_parte: 15.08, moneda: "MXN", cruzada: false, registro: null } }),
        cargoSaesa({ movimiento_id: "d7259736", monto: 121.91, lote: null, parte: { monto_parte: 121.91, moneda: "MXN", cruzada: false, registro: null } }),
      ],
    });
    expect(fichaCargoGasto(r.cargos[0], r).aporte).toBe("Este cargo aporta $15.08 de $136.99.");
  });

  it("cruzado: el T.C. GUARDADO en el gasto (de «17.224400») o que no lo tiene", () => {
    const base = respuesta345({
      gasto: { ...respuesta345().gasto, id: "913a7d19-6a35-42c8-8494-65597d07f300", moneda: "USD", monto: 722.9, tc_gasto: "17.224400" as unknown as number },
    });
    const cruzado = cargoSaesa({ monto: 12451.49, lote: null, parte: { monto_parte: 12451.49, moneda: "MXN", cruzada: true, registro: null } });
    expect(fichaCargoGasto(cruzado, base).aporte).toBe(
      "Compra de $722.90 USD pagada con este cargo de $12,451.49 · T.C. 17.2244 (el guardado en el gasto)",
    );
    expect(fichaCargoGasto(cruzado, { ...base, gasto: { ...base.gasto, tc_gasto: null } }).aporte).toBe(
      "Compra de $722.90 USD pagada con este cargo de $12,451.49 · el gasto no tiene el T.C. guardado",
    );
    expect(fichaCargoGasto(cruzado, base).registro).toBe(TEXTO_LIGA_ANTERIOR);
  });

  it("1↔1 que no cubre todo: «Este cargo cubre $X de $Y.»", () => {
    const r = respuesta321();
    const c = { ...r.cargos[0], parte: { ...r.cargos[0].parte, monto_parte: 1000 } };
    expect(fichaCargoGasto(c, r).aporte).toBe("Este cargo cubre $1,000.00 de $2,231.38.");
    expect(fichaCargoGasto(r.cargos[0], r).aporte).toBeNull();
  });

  it("efectivo con justificación, notas de la oficina y pasarela", () => {
    const r = respuesta345();
    const f = fichaCargoGasto(
      cargoSaesa({
        lote: null,
        justificacion: {
          linea: "Vinculado a gasto en EFECTIVO …",
          medio: "EFECTIVO",
          razon: "Mari lo facturó para no perder la deducción",
          firmante: "Mary Cruz",
          fecha: "06-oct-2026",
        },
        notas_oficina: "Revisado con Mari",
        cuenta: { id: "pw", alias: "Paywise", banco: "Paywise", moneda: "MXN", tipo: "PASARELA" },
      }),
      r,
    );
    expect(f.justificacion).toBe(
      "Ligado con justificación (pago en EFECTIVO): «Mari lo facturó para no perder la deducción» — Mary Cruz, 06-oct-2026.",
    );
    expect(f.notas).toBe("Notas del cargo: Revisado con Mari");
    expect(f.cuenta).toBe("Paywise · Paywise (MXN) · pasarela de pago");
  });

  it("sin archivo: importado (día CANCÚN, el 16) o capturado a mano; archivo no leído", () => {
    const r = respuesta345();
    const sin = cargoSaesa({ estado_cuenta: null, sin_archivo: "IMPORTADO_SIN_ARCHIVO", creado_at: "2026-07-17T00:34:09.441194+00:00", creado_por: "Jimmy Chi" });
    expect(fichaCargoGasto(sin, r).archivo).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este cargo se importó el ${fmtDate("2026-07-17T00:34:09.441194+00:00")} por Jimmy Chi sin el archivo original del banco.`,
    });
    expect(fmtDate("2026-07-17T00:34:09.441194+00:00")).toContain("16");
    expect(fichaCargoGasto({ ...sin, sin_archivo: "CAPTURA_MANUAL", origen: "MANUAL" }, r).archivo).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo: este cargo se capturó a mano el ${fmtDate("2026-07-17T00:34:09.441194+00:00")} por Jimmy Chi; no viene de un estado de cuenta.`,
    });
    expect(fichaCargoGasto({ ...sin, sin_archivo: null }, r).archivo).toEqual({
      tipo: "NO_LEIDO",
      texto: "Estado de cuenta archivado (no se pudo leer su detalle).",
    });
  });

  it("línea del archivo y registro en ESPEJO (sin texto de liga anterior)", () => {
    const r = respuesta345({ fuente: "ESPEJO", vista: null });
    const f = fichaCargoGasto(cargoSaesa({ orden_archivo: 12, parte: { monto_parte: 2801.4, moneda: "MXN", cruzada: false, registro: null } }), r);
    expect(f.archivo.tipo === "ARCHIVO" && f.archivo.detalle).toContain(" · línea 12 del archivo");
    expect(f.registro).toBeNull();
  });

  it("etiqueta de la descarga por formato", () => {
    expect(etiquetaDescargaEstadoCuenta("pdf")).toBe("Descargar estado de cuenta (PDF)");
    expect(etiquetaDescargaEstadoCuenta("XLSX")).toBe("Descargar estado de cuenta (Excel)");
    expect(etiquetaDescargaEstadoCuenta("xls")).toBe("Descargar estado de cuenta (Excel)");
    expect(etiquetaDescargaEstadoCuenta("csv")).toBe("Descargar estado de cuenta (CSV)");
    expect(etiquetaDescargaEstadoCuenta(null)).toBe("Descargar estado de cuenta");
  });
});

describe("URLs a Conciliación", () => {
  it("«Ver en Conciliación»: cuenta + día del cargo + mov + gasto, SIN mvq", () => {
    expect(hrefCargoEnConciliacion(cargoSaesa(), ID_345)).toBe(
      `/admin/conciliacion?cuenta=${CUENTA_EJE}&desde=2026-09-30&hasta=2026-09-30&mov=${MOV_SAESA}&gasto=${ID_345}`,
    );
    expect(hrefCargoEnConciliacion(cargoSaesa(), ID_345)).not.toContain("mvq");
    expect(fichaCargoGasto(cargoSaesa(), respuesta345()).href).toBe(hrefCargoEnConciliacion(cargoSaesa(), ID_345));
  });

  it("«Buscar el cargo»: pendientes ±30 días con el monto (faltante y cuenta en PARCIAL; USD sin monto)", () => {
    expect(montoParaBusquedaTabla(2801.4)).toBe("2801.4");
    expect(montoParaBusquedaTabla("564.00")).toBe("564");
    expect(montoParaBusquedaTabla(8939.38)).toBe("8939.38");
    expect(hrefBuscarCargoEnConciliacion({ fecha_gasto: "2026-09-28", monto: "2801.40", moneda: "MXN" })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-08-29&hasta=2026-10-28&mvq=2801.4",
    );
    expect(hrefBuscarCargoEnConciliacion({ fecha_gasto: "2026-09-01", monto: 8939.38, moneda: "MXN" })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-08-02&hasta=2026-10-01&mvq=8939.38",
    );
    expect(
      hrefBuscarCargoEnConciliacion({ fecha_gasto: "2026-09-01", monto: 1800, moneda: "MXN" }, { faltante: 600, cuenta: CUENTA_GASTOS }),
    ).toBe(`/admin/conciliacion?f=pendientes&cuenta=${CUENTA_GASTOS}&desde=2026-08-02&hasta=2026-10-01&mvq=600`);
    expect(hrefBuscarCargoEnConciliacion({ fecha_gasto: "2026-09-01", monto: 422.86, moneda: "USD" })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-08-02&hasta=2026-10-01",
    );
    expect(hrefBuscarCargoEnConciliacion({ fecha_gasto: null, monto: 10, moneda: "MXN" })).toBe(
      "/admin/conciliacion?f=pendientes&mvq=10",
    );
  });

  it("«Ver los cargos ya conciliados»: ±7 días con el monto", () => {
    expect(hrefVerYaConciliados({ fecha_gasto: "2026-09-01", monto: 8939.38, moneda: "MXN" })).toBe(
      "/admin/conciliacion?f=conciliados&desde=2026-08-25&hasta=2026-09-08&mvq=8939.38",
    );
  });
});

describe("«¿Qué hacer?» y la cobertura importada", () => {
  it("null en un CONCILIADO con cargos", () => {
    expect(accionesPendiente(respuesta345())).toBeNull();
  });

  it("SIN_CONCILIAR: intro, 5 causas y los dos enlaces con su tooltip", () => {
    const a = accionesPendiente(respuestaSinConciliar())!;
    expect(a.intro).toBe(INTRO_SIN_CONCILIAR);
    expect(a.causas).toEqual([...CAUSAS_SIN_CONCILIAR]);
    expect(a.causas).toHaveLength(5);
    expect(a.extraUsd).toBeNull();
    expect(a.notaNoBancario).toBeNull();
    expect(a.buscar.etiqueta).toBe(BOTON_BUSCAR_CARGO);
    expect(a.buscar.href).toBe("/admin/conciliacion?f=pendientes&desde=2026-08-02&hasta=2026-10-01&mvq=8939.38");
    expect(a.buscar.titulo).toBe(
      `Abre en otra pestaña los movimientos pendientes de 30 días antes y después del ${fmtDateOnly("2026-09-01")}, filtrados por $8,939.38. Borra la búsqueda si el cargo trae otro monto (propina, comisión o varios gastos).`,
    );
    expect(a.conciliados.href).toBe("/admin/conciliacion?f=conciliados&desde=2026-08-25&hasta=2026-09-08&mvq=8939.38");
    expect(a.conciliados.titulo).toContain("si el cargo está ligado a OTRO gasto, puede ser un gasto duplicado.");
  });

  it("PARCIAL: busca el FALTANTE en la única cuenta de sus cargos; no bancario ⇒ cómo vincular el que falta", () => {
    const r: ConciliacionDeGasto = {
      ...respuesta321(),
      estado: "PARCIAL",
      gasto: { ...respuesta321().gasto, monto: 1800, conciliado: false, medio_pago: "EFECTIVO" },
      vista: { n_partes: 1, cruzado: false, suma: 1200, monto_vinculado: 1200, faltante: 600, cubierto: false },
    };
    const a = accionesPendiente(r)!;
    expect(a.intro).toBe(INTRO_PARCIAL);
    expect(a.causas).toEqual([]);
    expect(a.buscar.etiqueta).toBe(BOTON_BUSCAR_FALTANTE);
    expect(a.buscar.href).toBe(`/admin/conciliacion?f=pendientes&cuenta=${CUENTA_GASTOS}&desde=2026-08-22&hasta=2026-10-21&mvq=600`);
    expect(a.notaNoBancario).toBe(NOTA_NO_BANCARIO_PARCIAL);
    expect(NOTA_NO_BANCARIO_PARCIAL).toContain("«Incluir gastos en efectivo y otros medios»");
  });

  it("PAYWISE: busca en la única cuenta PASARELA; USD: la nota y sin monto", () => {
    const pw = accionesPendiente(respuestaSinConciliar({ medio_pago: "PAYWISE" }))!;
    expect(pw.buscar.href).toContain("cuenta=pw&");
    const usd = accionesPendiente(respuestaSinConciliar({ moneda: "USD", monto: 422.86 }))!;
    expect(usd.extraUsd).toBe(NOTA_USD_PAGADO_EN_PESOS);
    expect(usd.buscar.href).not.toContain("mvq");
    expect(usd.buscar.titulo).not.toContain("filtrados por");
  });

  it("cobertura: ya importado, dentro de los 3 días, no importado; PAYWISE solo PASARELA; null sin datos", () => {
    const ya = textoCoberturaImportada(respuestaSinConciliar())!;
    expect(ya.aviso).toBeNull();
    expect(ya.detalle).toBe(
      `Último movimiento importado por cuenta: COMBUSTIBLE ${fmtDateOnly("2026-10-12")} · EJE SCOTIA ${fmtDateOnly("2026-10-12")} · GASTOS GNRAL ${fmtDateOnly("2026-10-12")} · HSBC Pesos ${fmtDateOnly("2026-10-07")} · SCOTIA USD sin movimientos`,
    );
    expect(textoCoberturaImportada(respuestaSinConciliar({ fecha_gasto: "2026-10-11" }))!.aviso).toBe(
      `El estado de cuenta importado más reciente llega al ${fmtDateOnly("2026-10-12")}: si el banco registró el cargo unos días después del gasto, todavía no está importado.`,
    );
    expect(textoCoberturaImportada(respuestaSinConciliar({ fecha_gasto: "2026-10-13" }))!.aviso).toBe(
      `Ningún estado de cuenta importado llega todavía al ${fmtDateOnly("2026-10-13")} (el más reciente es COMBUSTIBLE, hasta el ${fmtDateOnly("2026-10-12")}). Impórtalo en Conciliación: el gasto se cruza solo si el monto y la fecha coinciden.`,
    );
    const pw = textoCoberturaImportada(respuestaSinConciliar({ medio_pago: "PAYWISE", fecha_gasto: "2026-10-05" }))!;
    expect(pw.aviso).toContain("(el más reciente es Paywise");
    expect(pw.detalle).toBe(`Último movimiento importado por cuenta: Paywise ${fmtDateOnly("2026-09-30")}`);
    expect(textoCoberturaImportada({ ...respuestaSinConciliar(), ultimos_movimientos: null })).toBeNull();
    expect(textoCoberturaImportada({ ...respuestaSinConciliar(), ultimos_movimientos: [] })).toEqual({
      aviso: "Todavía no hay estados de cuenta importados en las cuentas de este tipo de pago.",
      detalle: null,
    });
  });
});

describe("alertas, errores y estado cambiado", () => {
  it("textoAlertaConciliacionGasto: los 4 códigos y uno desconocido", () => {
    expect(textoAlertaConciliacionGasto("CONCILIADO_SIN_CARGOS")).toContain("Está marcado como conciliado");
    expect(textoAlertaConciliacionGasto("ESTADO_DESFASADO")).toContain("Avisa a sistemas; no lo corrijas a mano.");
    expect(textoAlertaConciliacionGasto("TC_NO_REGISTRADO")).toContain("no tiene el tipo de cambio guardado");
    expect(textoAlertaConciliacionGasto("LOTE_SIN_DETALLE")).toContain("vuelve a abrir esta ventana");
    expect(textoAlertaConciliacionGasto("ALGO_NUEVO")).toBe("Revisa este gasto en Conciliación.");
  });

  it("mensajeErrorDetalleBanco: 6 casos", () => {
    expect(mensajeErrorDetalleBanco({ code: "RUTA_NO_DISPONIBLE", status: 404 })).toEqual({
      texto: MSG_DETALLE_BANCO_API_VIEJO,
      reintentable: false,
      buscarEnConciliacion: true,
    });
    expect(mensajeErrorDetalleBanco({ status: 404, error: "Cannot GET /v1/conciliacion/gastos/x" }).buscarEnConciliacion).toBe(true);
    expect(mensajeErrorDetalleBanco({ status: 403 }).texto).toBe(MSG_DETALLE_BANCO_SIN_PERMISO);
    expect(mensajeErrorDetalleBanco({ status: 404, code: "GASTO_NO_EXISTE" }).texto).toBe(MSG_GASTO_YA_NO_EXISTE);
    expect(mensajeErrorDetalleBanco({ status: 401 }).texto).toBe(MSG_SESION_EXPIRO);
    expect(mensajeErrorDetalleBanco({ code: "GASTO_INVALIDO", status: 400 }).texto).toBe("Gasto inválido.");
    expect(mensajeErrorDetalleBanco({ status: 502, error: "Bad Gateway" })).toEqual({
      texto: MSG_DETALLE_BANCO_FALLO,
      reintentable: true,
      buscarEnConciliacion: false,
    });
    expect(mensajeErrorDescargaEstadoCuenta({ status: 404 })).toBe(MSG_ESTADO_CUENTA_NO_EXISTE);
    expect(mensajeErrorDescargaEstadoCuenta({ status: 500 })).toBe(MSG_ESTADO_CUENTA_FALLO);
  });

  it("estadoCambio: con los aditivos compara el estado; sin ellos (Compras, API previo) solo «cubierto»", () => {
    const r = respuesta345();
    expect(estadoCambio(r, { conciliado: true, medio_pago: "TRANSFERENCIA", monto: 2801.4, monto_vinculado: 2801.4, faltante: 0 })).toBe(false);
    expect(estadoCambio(r, { conciliado: false, medio_pago: "TRANSFERENCIA", monto: 2801.4, monto_vinculado: 0, faltante: 2801.4 })).toBe(true);
    // Compras: no trae lo ligado; un PARCIAL del API y «Sin conciliar» en la fila NO avisan en falso.
    const parcial = { ...r, estado: "PARCIAL" as const };
    expect(estadoCambio(parcial, { conciliado: false, medio_pago: "TRANSFERENCIA", monto: 2801.4 })).toBe(false);
    expect(estadoCambio(r, { conciliado: false, medio_pago: "TRANSFERENCIA", monto: 2801.4 })).toBe(true);
  });
});
