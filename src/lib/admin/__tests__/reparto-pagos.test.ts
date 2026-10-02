/**
 * PAGOS A SOCIOS del reparto (1-oct-2026, API 0.0.49) — fuente única PURA.
 *
 * Pedido del cliente: «cada socio debe recibir los pagos de lo que generó el
 * avión en el mes … Mauricio Roque, %, Monto de utilidad, estatus … con
 * cuánto se le pagó, cuándo y quién se lo entregó».
 *
 * Números REALES del contrato: N4142R septiembre 2026, saldo $2,023.10 a
 * 69 / 29 / 2 % ⇒ 1,395.94 / 586.70 / 40.46 (residuo mayor en centavos, lo
 * hace el API). Aquí NO se recalcula ese reparto: se custodia el espejo del
 * estatus, los textos, el formulario y los cuerpos que viajan al API.
 */
import { describe, expect, it } from "vitest";
import {
  BOTON_REVISAR_MONTO,
  CLAVE_PRECIERRE_PAGOS_SOCIOS,
  ESTADOS_PAGO_SOCIO,
  TEXTO_SIN_UTILIDAD_MES,
  TEXTO_TODOS_PAGADOS,
  TITULO_PAGOS_FUERA_DEL_REPARTO,
  agruparRepartoPorSocio,
  badgeSociosPendientes,
  conteoPreCierrePagosSocios,
  descripcionDialogoPago,
  etiquetaComprobantePago,
  etiquetaMontoPago,
  etiquetaRegistrarPago,
  filasFueraDelReparto,
  formAlCambiarMoneda,
  hintMontoPago,
  textoContadorMotivo,
  textoVerMes,
  TEXTO_NO_REGISTRA_NO_VIGENTE,
  TEXTO_NO_REGISTRA_SIN_UTILIDAD,
  TEXTO_PAGOS_NO_DISPONIBLES,
  TEXTO_SOLO_MES_COMPLETO,
  cambiosPago,
  clasificarFalloCargaPagos,
  confirmacionEliminarPago,
  confirmacionExceso,
  detalleExceso,
  errorPideRefrescar,
  esMesValido,
  estadoPagoSocio,
  estiloEstadoPago,
  etiquetaMes,
  formDePago,
  formInicialAlta,
  hayErrores,
  hrefPagosSocios,
  leerNumero,
  lineasPreCierrePagosSocios,
  mensajeErrorPagoSocio,
  mesAnterior,
  mesDePeriodo,
  modoPagosReparto,
  motivoNoRegistrarPago,
  normalizarRespuestaPagos,
  opcionesEntrego,
  ordenarPagos,
  payloadAltaPago,
  piezasPago,
  porSocioVisible,
  puedeRegistrarPagosSocio,
  rangoDeMes,
  rangoMesPasado,
  renglonesSociosAvion,
  textoExceso,
  textoMontoPago,
  textoSociosPendientes,
  textoUtilidadCambio,
  tituloSeccionPagos,
  validarFormPago,
  validarMotivoBaja,
  type FormPagoSocio,
} from "../reparto-pagos";
import type { FilaPagoSocio, PagoSocio, ResumenPagoSocio } from "@/types/reparto-pagos";
import type { RepartoSocio } from "@/types/profit-sharing";

const AVION = "a1a1a1a1-0000-4000-8000-000000000001";
const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const ACC = "50c10000-0000-4000-8000-000000000002";
const SAAB = "50c10000-0000-4000-8000-000000000003";
const ALE = "0f1c0000-0000-4000-8000-000000000009";
const ITZI = "0f1c0000-0000-4000-8000-000000000010";

const REPARTO: RepartoSocio[] = [
  { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 69, monto_usd: 1395.94 },
  { socio_id: ACC, socio_nombre: "Aero Charter Cancun S.A. de C.V.", porcentaje: 29, monto_usd: 586.7 },
  { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 2, monto_usd: 40.46 },
];

const PAGO_MXN: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  aeronave_id: AVION,
  socio_id: MAURICIO,
  periodo: "2026-09-01",
  monto: 20000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 1081.08,
  utilidad_snapshot_usd: 1395.94,
  fecha_pago: "2026-10-05",
  metodo: "TRANSFERENCIA",
  referencia: "SPEI 123456",
  entregado_por: ALE,
  entregado_por_nombre: "Alejandro Canales",
  recibido_por: null,
  factura_folio: "A-77",
  comprobante_path: `${AVION}/2026-09/9a9a.pdf`,
  comprobante_url: "https://x.supabase.co/storage/v1/object/sign/reparto-comprobantes/a.pdf?token=t",
  notas: null,
  created_by: ITZI,
  created_by_nombre: "Itzi",
  created_at: "2026-10-05T17:30:00Z",
};

function fila(over: Partial<FilaPagoSocio> = {}): FilaPagoSocio {
  return {
    aeronave: { id: AVION, matricula: "N4142R", modelo: "Piper Seneca V" },
    socio: { id: MAURICIO, nombre: "Mauricio Roque" },
    porcentaje: 69,
    utilidad_usd: 1395.94,
    pagado_usd: 0,
    pendiente_usd: 1395.94,
    exceso_usd: 0,
    estado: "PENDIENTE",
    utilidad_al_pagar_usd: null,
    utilidad_difiere: false,
    pagos: [],
    ...over,
  };
}

describe("mes del periodo (espejo de mesDePeriodo / rangoDeMes del API)", () => {
  it("septiembre completo ⇒ 2026-09", () => {
    expect(mesDePeriodo("2026-09-01", "2026-09-30")).toBe("2026-09");
  });

  it("el mes en curso cortado en HOY no es un mes completo", () => {
    expect(mesDePeriodo("2026-10-01", "2026-10-01")).toBeNull();
    expect(mesDePeriodo("2026-09-01", "2026-09-29")).toBeNull();
  });

  it("desde que no es día 1, meses distintos, ISO completo o basura ⇒ null", () => {
    expect(mesDePeriodo("2026-09-02", "2026-09-30")).toBeNull();
    expect(mesDePeriodo("2026-08-01", "2026-09-30")).toBeNull();
    expect(mesDePeriodo("2026-09-01T00:00:00Z", "2026-09-30")).toBeNull();
    expect(mesDePeriodo("2026-09-01", "2026-09-31")).toBeNull();
    expect(mesDePeriodo("nada", "2026-09-30")).toBeNull();
    expect(mesDePeriodo(undefined, undefined)).toBeNull();
  });

  it("febrero: 28 en 2026 y 29 en 2028", () => {
    expect(mesDePeriodo("2026-02-01", "2026-02-28")).toBe("2026-02");
    expect(mesDePeriodo("2028-02-01", "2028-02-29")).toBe("2028-02");
    expect(rangoDeMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("rangoDeMes y esMesValido", () => {
    expect(rangoDeMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDeMes("2026-13")).toBeNull();
    expect(esMesValido("2026-09")).toBe(true);
    expect(esMesValido("2026-9")).toBe(false);
  });

  it("«Mes pasado» desde el 1-oct-2026 es septiembre; desde enero, diciembre del año anterior", () => {
    expect(mesAnterior("2026-10-01")).toBe("2026-09");
    expect(rangoMesPasado("2026-10-01")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(mesAnterior("2027-01-15")).toBe("2026-12");
    expect(mesAnterior("nada")).toBeNull();
  });

  it("etiqueta del mes y título de la sección", () => {
    expect(etiquetaMes("2026-09")).toBe("Septiembre 2026");
    expect(tituloSeccionPagos("2026-09")).toBe("Pagos a socios · Septiembre 2026");
  });
});

describe("estatus (el API manda; el espejo solo pinta)", () => {
  it("N4142R · Mauricio 1,395.94: pendiente, parcial, pagado con tolerancia de $1", () => {
    expect(estadoPagoSocio(1395.94, 0)).toEqual({ estado: "PENDIENTE", exceso_usd: 0 });
    expect(estadoPagoSocio(1395.94, 1081.08).estado).toBe("PARCIAL");
    expect(estadoPagoSocio(1395.94, 1395.94).estado).toBe("PAGADO");
    expect(estadoPagoSocio(1395.94, 1394.94).estado).toBe("PAGADO");
    expect(estadoPagoSocio(1395.94, 1394.93).estado).toBe("PARCIAL");
  });

  it("exceso solo pasado $1.00", () => {
    expect(estadoPagoSocio(40.46, 41.46).exceso_usd).toBe(0);
    expect(estadoPagoSocio(40.46, 41.47).exceso_usd).toBe(1.01);
    expect(estadoPagoSocio(586.7, 700)).toEqual({ estado: "PAGADO", exceso_usd: 113.3 });
  });

  it("utilidad ≤ 0 ⇒ SIN_UTILIDAD", () => {
    expect(estadoPagoSocio(0, 0).estado).toBe("SIN_UTILIDAD");
    expect(estadoPagoSocio(-120.5, 0).estado).toBe("SIN_UTILIDAD");
  });

  it("utilidad NEGATIVA: el exceso se mide contra 0, igual que el API (no pagado − utilidad)", () => {
    // API: excesoC = p − max(u, 0) ⇒ 50 − 0 = 50 (no 50 − (−100) = 150).
    expect(estadoPagoSocio(-100, 50)).toEqual({ estado: "SIN_UTILIDAD", exceso_usd: 50 });
    expect(estadoPagoSocio(-100, 1)).toEqual({ estado: "SIN_UTILIDAD", exceso_usd: 0 });
    expect(estadoPagoSocio(-100, 1.01)).toEqual({ estado: "SIN_UTILIDAD", exceso_usd: 1.01 });
    expect(estadoPagoSocio(0, 300)).toEqual({ estado: "SIN_UTILIDAD", exceso_usd: 300 });
  });

  it("colores: pendiente y parcial ámbar, pagado verde, sin utilidad gris", () => {
    expect(ESTADOS_PAGO_SOCIO.PENDIENTE.tono).toBe("ambar");
    expect(ESTADOS_PAGO_SOCIO.PARCIAL.tono).toBe("ambar");
    expect(ESTADOS_PAGO_SOCIO.PAGADO.tono).toBe("verde");
    expect(ESTADOS_PAGO_SOCIO.SIN_UTILIDAD.tono).toBe("gris");
    expect(ESTADOS_PAGO_SOCIO.PAGADO.clase).toContain("emerald");
    expect(ESTADOS_PAGO_SOCIO.PENDIENTE.clase).toContain("amber");
  });

  it("el estado del API gana; uno desconocido se pinta con el espejo (nunca en blanco)", () => {
    // Aunque los números digan otra cosa, se pinta lo que dijo el API.
    expect(estiloEstadoPago("PAGADO", 1395.94, 0).etiqueta).toBe("Pagado");
    expect(estiloEstadoPago("ALGO_NUEVO", 1395.94, 500).estado).toBe("PARCIAL");
    expect(estiloEstadoPago(null, 0, 0).etiqueta).toBe("Sin utilidad");
  });
});

describe("textos", () => {
  it("texto del periodo que no es mes completo y de servidor sin actualizar", () => {
    expect(TEXTO_SOLO_MES_COMPLETO).toBe(
      "Los pagos a socios se registran por mes completo: elige un mes en el selector.",
    );
    expect(TEXTO_PAGOS_NO_DISPONIBLES).toBe("Disponible cuando se actualice el servidor.");
  });

  it("la utilidad cambió después del último pago (solo si el API lo marca)", () => {
    expect(textoUtilidadCambio(fila())).toBeNull();
    expect(
      textoUtilidadCambio(
        fila({ utilidad_difiere: true, utilidad_al_pagar_usd: 1395.94, utilidad_usd: 1210.5 }),
      ),
    ).toBe(
      "La utilidad del mes cambió después del último pago: era $1,395.94 y hoy es $1,210.50. Revisa si hay que ajustar el pago.",
    );
  });

  it("pagado de más y conteo de pendientes", () => {
    expect(textoExceso(0)).toBeNull();
    expect(textoExceso(113.3)).toBe("Pagado de más: $113.30");
    expect(textoSociosPendientes(0)).toBe("Todos los socios con utilidad están pagados");
    expect(textoSociosPendientes(1)).toBe("1 socio con pago pendiente");
    expect(textoSociosPendientes(3)).toBe("3 socios con pago pendiente");
  });

  it("badge del encabezado: ámbar con pendientes; verde solo si HUBO utilidad; gris sin utilidad o sin renglones", () => {
    expect(badgeSociosPendientes({ utilidad_usd: 2023.1, socios_pendientes: 2 }, 3)).toMatchObject({
      texto: "2 socios con pago pendiente",
      tono: "ambar",
    });
    expect(badgeSociosPendientes({ utilidad_usd: 2023.1, socios_pendientes: 0 }, 3)).toMatchObject({
      texto: TEXTO_TODOS_PAGADOS,
      tono: "verde",
    });
    // Mes con pérdida: nadie tuvo utilidad, nada se pagó ⇒ jamás «todos pagados» en verde.
    const perdida = badgeSociosPendientes({ utilidad_usd: 0, socios_pendientes: 0 }, 3);
    expect(perdida).toMatchObject({ texto: "Sin utilidad que repartir en el mes", tono: "gris" });
    expect(perdida.texto).toBe(TEXTO_SIN_UTILIDAD_MES);
    expect(perdida.clase).not.toContain("emerald");
    // Sin renglones (tabla vacía) tampoco.
    expect(badgeSociosPendientes({ utilidad_usd: 0, socios_pendientes: 0 }, 0).tono).toBe("gris");
    expect(badgeSociosPendientes({ utilidad_usd: 500, socios_pendientes: 0 }, 0).tono).toBe("gris");
  });

  it("monto de un pago: USD a secas; MXN con T.C. y su equivalente del API", () => {
    expect(textoMontoPago({ monto: 586.7, moneda: "USD", tc_usd_mxn: null, monto_usd: 586.7 })).toBe(
      "$586.70 USD",
    );
    expect(textoMontoPago(PAGO_MXN)).toBe("$20,000 MXN · T.C. 18.5 · ≈ $1,081.08 USD");
  });

  it("piezas del renglón: fecha · monto · método · entregó · factura · referencia · registro", () => {
    const p = piezasPago(PAGO_MXN);
    expect(p.fecha).toMatch(/05 oct\.? 2026/);
    expect(p.metodo).toBe("Transferencia");
    expect(p.entrego).toBe("Entregó: Alejandro Canales");
    expect(p.recibio).toBeNull();
    expect(p.factura).toBe("Factura A-77");
    expect(p.referencia).toBe("Ref. SPEI 123456");
    // 17:30 UTC = 12:30 en Cancún.
    expect(p.registro).toMatch(/^Registró Itzi · 0?5 oct\.? 2026, 12:30/);
    expect(piezasPago({ ...PAGO_MXN, entregado_por_nombre: null, recibido_por: "Su esposa" }).entrego).toBe(
      "Entregó: —",
    );
    expect(piezasPago({ ...PAGO_MXN, recibido_por: "Su esposa" }).recibio).toBe("Recibió: Su esposa");
  });

  it("orden de la relación: el más antiguo primero", () => {
    const a = { ...PAGO_MXN, id: "a", fecha_pago: "2026-10-09", created_at: "2026-10-09T12:00:00Z" };
    const b = { ...PAGO_MXN, id: "b", fecha_pago: "2026-10-02" };
    const c = { ...PAGO_MXN, id: "c", fecha_pago: "2026-10-09", created_at: "2026-10-09T10:00:00Z" };
    expect(ordenarPagos([a, b, c]).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("confirmación de baja y del exceso", () => {
    const c = confirmacionEliminarPago(PAGO_MXN, "Mauricio Roque");
    expect(c.titulo).toBe("¿Eliminar este pago?");
    expect(c.descripcion).toMatch(/^\$20,000 MXN del 05 oct\.? 2026 a Mauricio Roque\./);
    expect(c.descripcion).toContain("Queda registro de quién lo eliminó y por qué.");
    const e = confirmacionExceso({ utilidad_usd: 40.46, pagado_usd: 0, monto_usd: 100, exceso_usd: 59.54 });
    expect(e.descripcion).toBe(
      "Utilidad del mes: $40.46 · ya pagado: $0 · este pago: $100. Quedaría pagado de más por $59.54. ¿Registrar de todas formas?",
    );
    expect(confirmacionExceso(null).descripcion).toContain("¿Registrar de todas formas?");
    expect(detalleExceso({ utilidad_usd: "40.46", pagado_usd: 0, monto_usd: 100, exceso_usd: 59.54 })).toEqual({
      utilidad_usd: 40.46,
      pagado_usd: 0,
      monto_usd: 100,
      exceso_usd: 59.54,
    });
    expect(detalleExceso({ utilidad_usd: 1 })).toBeNull();
  });
});

describe("errores del API en es-MX (por code)", () => {
  it("códigos propios: el texto del API en español gana; sin texto útil, el respaldo del panel", () => {
    const api =
      "El avión está dado de baja: el reparto no calcula su utilidad de septiembre 2026, así que no hay nada que pagar desde aquí.";
    expect(mensajeErrorPagoSocio("SIN_UTILIDAD_QUE_PAGAR", api, 409)).toBe(api);
    expect(mensajeErrorPagoSocio("SIN_UTILIDAD_QUE_PAGAR", "", 409)).toContain("no hay nada que pagar");
    expect(mensajeErrorPagoSocio("SOCIO_NO_ES_DE_LA_AERONAVE", "Bad Request", 400)).toContain(
      "no es socia de este avión",
    );
    expect(mensajeErrorPagoSocio("PAGOS_SOCIOS_NO_DISPONIBLE", "", 503)).toContain(
      "todavía no están disponibles",
    );
    expect(mensajeErrorPagoSocio("CLIENT_REQUEST_ID_EN_USO", "", 409)).toContain("vuelve a abrirlo");
  });

  it("CLIENT_REQUEST_ID_EN_USO: el panel gana sobre el texto REAL del API (jerga «client_request_id»)", () => {
    const api =
      "La llave client_request_id de este pago ya se usó en otro pago (o en uno que se eliminó); vuelve a abrir el diálogo para registrar el pago.";
    const t = mensajeErrorPagoSocio("CLIENT_REQUEST_ID_EN_USO", api, 409);
    expect(t).toBe(
      "Este registro ya se usó para otro pago. Cierra el diálogo y vuelve a abrirlo para registrar el pago.",
    );
    expect(t).not.toContain("client_request_id");
  });

  it("el panel gana cuando hace otra cosa (refresca solo la lista)", () => {
    expect(mensajeErrorPagoSocio("PAGO_NO_EXISTE", "Ese pago no existe o ya se eliminó. Recarga la página.", 404)).toBe(
      "Ese pago ya no existe (alguien lo eliminó). Actualizamos la lista.",
    );
    expect(mensajeErrorPagoSocio("PAGO_CAMBIO_CONCURRENTE", "x", 409)).toContain("Actualizamos la lista");
    expect(errorPideRefrescar("PAGO_NO_EXISTE")).toBe(true);
    expect(errorPideRefrescar("PAGO_CAMBIO_CONCURRENTE")).toBe(true);
    expect(errorPideRefrescar("COMPROBANTE_CAMBIO")).toBe(true);
    expect(errorPideRefrescar("SIN_UTILIDAD_QUE_PAGAR")).toBe(false);
  });

  it("403, validación en inglés, lo técnico y lo que ya viene en español", () => {
    expect(mensajeErrorPagoSocio("FORBIDDEN", "Required role: ADMIN", 403)).toContain(
      "Tu rol no tiene permiso",
    );
    expect(mensajeErrorPagoSocio("BAD_REQUEST", "monto must be a positive number", 400)).toBe(
      "El servidor rechazó un dato del pago. Revisa el formulario y vuelve a intentarlo.",
    );
    expect(mensajeErrorPagoSocio("INTERNAL_ERROR", "Internal server error", 500)).toContain(
      "respondió con error 500",
    );
    expect(mensajeErrorPagoSocio("NOT_FOUND", "Cannot POST /v1/profit-sharing/pagos", 404)).toContain(
      "todavía no tiene esta función",
    );
    expect(mensajeErrorPagoSocio("BAD_REQUEST", "La fecha del pago no puede ser futura.", 400)).toBe(
      "La fecha del pago no puede ser futura.",
    );
  });
});

describe("roles y carga", () => {
  it("registran ADMIN y FACTURACION; ANALISTA y SOCIO solo leen", () => {
    expect(puedeRegistrarPagosSocio("ADMIN")).toBe(true);
    expect(puedeRegistrarPagosSocio("FACTURACION")).toBe(true);
    expect(puedeRegistrarPagosSocio("ANALISTA")).toBe(false);
    expect(puedeRegistrarPagosSocio("SOCIO")).toBe(false);
    expect(puedeRegistrarPagosSocio(null)).toBe(false);
  });

  it("fallo de lectura: 404 = API previo; 401/403 = sin permiso; 503 a secas = FALLO (deploy)", () => {
    expect(clasificarFalloCargaPagos(404, "NOT_FOUND")).toBe("no-disponible");
    expect(clasificarFalloCargaPagos(503, "PAGOS_SOCIOS_NO_DISPONIBLE")).toBe("no-disponible");
    expect(clasificarFalloCargaPagos(403, "FORBIDDEN")).toBe("sin-permiso");
    expect(clasificarFalloCargaPagos(503, "PARSE_ERROR")).toBe("error");
    expect(clasificarFalloCargaPagos(500, "INTERNAL_ERROR")).toBe("error");
    expect(clasificarFalloCargaPagos(null, null)).toBe("error");
  });

  it("modo de la página", () => {
    const datos = normalizarRespuestaPagos({ disponible: true, mes: "2026-09", filas: [], por_socio: [], totales: {} })!;
    expect(modoPagosReparto(null, null)).toEqual({ modo: "sin-mes" });
    expect(modoPagosReparto("2026-09", null)).toEqual({ modo: "error", mes: "2026-09" });
    expect(modoPagosReparto("2026-09", { estado: "ok", datos })).toEqual({ modo: "ok", mes: "2026-09", datos });
    expect(modoPagosReparto("2026-09", { estado: "ok", datos: { ...datos, disponible: false } })).toEqual({
      modo: "no-disponible",
      mes: "2026-09",
    });
    expect(modoPagosReparto("2026-09", { estado: "no-disponible" }).modo).toBe("no-disponible");
    expect(modoPagosReparto("2026-09", { estado: "sin-permiso" }).modo).toBe("oculto");
    expect(modoPagosReparto("2026-09", { estado: "error" }).modo).toBe("error");
  });

  it("normaliza numéricos que llegan como texto y descarta lo que no es objeto", () => {
    const r = normalizarRespuestaPagos({
      disponible: true,
      mes: "2026-09",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      filas: [
        {
          ...fila(),
          utilidad_usd: "1395.94",
          pagado_usd: "1081.08",
          pendiente_usd: "314.86",
          pagos: [{ ...PAGO_MXN, monto: "20000.00", tc_usd_mxn: "18.500000", monto_usd: "1081.08" }],
        },
        { socio: null },
      ],
      por_socio: [{ socio: { id: MAURICIO, nombre: "Mauricio Roque" }, utilidad_usd: "1395.94", pagado_usd: 0, pendiente_usd: 0, estado: "PARCIAL", aviones: "1" }],
      totales: { utilidad_usd: "2023.10", pagado_usd: 1081.08, pendiente_usd: "942.02", socios_pendientes: 3 },
    })!;
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].utilidad_usd).toBe(1395.94);
    expect(r.filas[0].pagos[0]).toMatchObject({ monto: 20000, tc_usd_mxn: 18.5, monto_usd: 1081.08 });
    expect(r.por_socio[0].aviones).toBe(1);
    expect(r.totales).toEqual({ utilidad_usd: 2023.1, pagado_usd: 1081.08, pendiente_usd: 942.02, socios_pendientes: 3 });
    expect(normalizarRespuestaPagos(null)).toBeNull();
    expect(normalizarRespuestaPagos([])).toBeNull();
    expect(normalizarRespuestaPagos({})?.disponible).toBe(true);
    expect(normalizarRespuestaPagos({ disponible: false })!.disponible).toBe(false);
  });
});

describe("unión del reparto con los renglones de pagos", () => {
  it("orden del reparto; la utilidad del renglón manda; sin renglón, la del reparto", () => {
    const filas = [
      fila({ utilidad_usd: 1395.94, pagado_usd: 1081.08, pendiente_usd: 314.86, estado: "PARCIAL" }),
      fila({ socio: { id: SAAB, nombre: "Alexander E. Saab" }, porcentaje: 2, utilidad_usd: 40.46, pendiente_usd: 40.46 }),
    ];
    const r = renglonesSociosAvion(AVION, REPARTO, filas);
    expect(r.map((x) => x.socio_nombre)).toEqual([
      "Mauricio Roque",
      "Aero Charter Cancun S.A. de C.V.",
      "Alexander E. Saab",
    ]);
    expect(r[0].fila?.estado).toBe("PARCIAL");
    expect(r[1].fila).toBeNull();
    expect(r[1].utilidad_usd).toBe(586.7);
    expect(r.every((x) => x.vigente)).toBe(true);
  });

  it("un socio que ya no es vigente pero tiene pagos del mes va AL FINAL, no se esconde", () => {
    const viejo = fila({
      socio: { id: "50c10000-0000-4000-8000-0000000000aa", nombre: "Ex Socio" },
      porcentaje: 0,
      utilidad_usd: 0,
      pagado_usd: 300,
      pagos: [PAGO_MXN],
    });
    const otroAvion = fila({ aeronave: { id: "otro", matricula: "XA-VGV", modelo: "C206" } });
    const r = renglonesSociosAvion(AVION, REPARTO, [viejo, otroAvion]);
    expect(r).toHaveLength(4);
    expect(r[3]).toMatchObject({ socio_nombre: "Ex Socio", vigente: false, utilidad_usd: 0 });
    // El renglón de OTRO avión no se cuela.
    expect(r.filter((x) => x.fila?.aeronave.id === "otro")).toHaveLength(0);
  });

  it("socio con DOS vigencias en el mes (cambio de % a medio mes): UN renglón, % y monto sumados", () => {
    // `compute()` emite una entrada por vigencia; el API agrupa la fila de pagos.
    const reparto: RepartoSocio[] = [
      { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 60, monto_usd: 600 },
      { socio_id: ACC, socio_nombre: "Aero Charter Cancun S.A. de C.V.", porcentaje: 29, monto_usd: 290 },
      { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 9, monto_usd: 90 },
    ];
    const r = renglonesSociosAvion(AVION, reparto, [
      fila({ porcentaje: 69, utilidad_usd: 690, pendiente_usd: 690 }),
    ]);
    expect(r.map((x) => x.socio_id)).toEqual([MAURICIO, ACC]);
    expect(r[0]).toMatchObject({ porcentaje: 69, utilidad_usd: 690 });
    expect(r[0].fila?.utilidad_usd).toBe(690);
    // Sin renglón de pagos (SOCIO viendo a otro), la suma sale del reparto en centavos.
    const sinFilas = renglonesSociosAvion(AVION, reparto, null);
    expect(sinFilas).toHaveLength(2);
    expect(sinFilas[0]).toMatchObject({ porcentaje: 69, utilidad_usd: 690 });
    expect(
      agruparRepartoPorSocio([
        { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 1.1, monto_usd: 0.1 },
        { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 0.9, monto_usd: 0.2 },
      ]),
    ).toEqual([{ socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 2, monto_usd: 0.3 }]);
  });

  it("pagos de aviones SIN tarjeta (dados de baja) se separan para pintarlos aparte", () => {
    const baja = fila({
      aeronave: { id: "baja", matricula: "XB-OLD", modelo: "C182" },
      socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." },
      utilidad_usd: 0,
      pagado_usd: 300,
      estado: "SIN_UTILIDAD",
      vigente: false,
      pagos: [PAGO_MXN],
    });
    const sinMatricula = fila({
      aeronave: { id: "x", matricula: "(avión sin matrícula)", modelo: "" },
      pagos: [PAGO_MXN],
    });
    const fuera = filasFueraDelReparto([fila(), baja, sinMatricula], [AVION]);
    expect(fuera.map((f) => f.aeronave.id)).toEqual(["x", "baja"]);
    expect(filasFueraDelReparto([fila()], [AVION])).toEqual([]);
    expect(TITULO_PAGOS_FUERA_DEL_REPARTO).toBe("Pagos de aviones fuera del reparto del mes");
  });

  it("sin pagos (null) la tabla es la del reparto", () => {
    const r = renglonesSociosAvion(AVION, REPARTO, null);
    expect(r.map((x) => x.utilidad_usd)).toEqual([1395.94, 586.7, 40.46]);
    expect(r.every((x) => x.fila === null)).toBe(true);
  });

  it("un SOCIO solo ve su renglón del consolidado", () => {
    const por: ResumenPagoSocio[] = [
      { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, utilidad_usd: 1395.94, pagado_usd: 0, pendiente_usd: 1395.94, estado: "PENDIENTE", aviones: 1 },
      { socio: { id: SAAB, nombre: "Alexander E. Saab" }, utilidad_usd: 40.46, pagado_usd: 0, pendiente_usd: 40.46, estado: "PENDIENTE", aviones: 1 },
    ];
    expect(porSocioVisible(por, "SOCIO", SAAB).map((s) => s.socio.nombre)).toEqual(["Alexander E. Saab"]);
    expect(porSocioVisible(por, "ADMIN", ALE)).toHaveLength(2);
  });

  it("«Registrar pago»: no con socio no vigente ni sin utilidad; sí con PAGADO (el exceso se confirma)", () => {
    expect(motivoNoRegistrarPago(fila(), true)).toBeNull();
    expect(motivoNoRegistrarPago(fila({ estado: "PAGADO" }), true)).toBeNull();
    expect(motivoNoRegistrarPago(fila(), false)).toBe(TEXTO_NO_REGISTRA_NO_VIGENTE);
    expect(motivoNoRegistrarPago(fila({ estado: "SIN_UTILIDAD", utilidad_usd: 0 }), true)).toBe(
      TEXTO_NO_REGISTRA_SIN_UTILIDAD,
    );
  });
});

describe("formulario «Registrar pago» / «Editar pago»", () => {
  const HOY = "2026-10-01";

  it("prellenado del alta: monto = pendiente, USD, hoy, entregó = yo y el MÉTODO sin elegir", () => {
    expect(formInicialAlta({ pendienteUsd: 1395.94, hoy: HOY, meId: ALE })).toEqual({
      monto: "1395.94",
      moneda: "USD",
      tc: "",
      fecha_pago: HOY,
      metodo: "",
      entregado_por_id: ALE,
      recibido_por: "",
      referencia: "",
      factura_folio: "",
      notas: "",
    });
    expect(formInicialAlta({ pendienteUsd: 0, hoy: HOY, meId: ALE }).monto).toBe("");
    expect(formInicialAlta({ pendienteUsd: 586.7, hoy: HOY, meId: null }).monto).toBe("586.70");
  });

  it("validación: monto > 0, T.C. en pesos, fecha no futura, método obligatorio, límites", () => {
    const base = formInicialAlta({ pendienteUsd: 1395.94, hoy: HOY, meId: ALE });
    expect(validarFormPago(base, HOY)).toEqual({ metodo: "Elige cómo se pagó." });
    const ok: FormPagoSocio = { ...base, metodo: "TRANSFERENCIA" };
    expect(hayErrores(validarFormPago(ok, HOY))).toBe(false);
    expect(validarFormPago({ ...ok, monto: "0" }, HOY).monto).toBeDefined();
    expect(validarFormPago({ ...ok, monto: "0.004" }, HOY).monto).toBeDefined();
    expect(validarFormPago({ ...ok, moneda: "MXN", tc: "" }, HOY).tc).toBe(
      "Captura el tipo de cambio del pago en pesos.",
    );
    expect(validarFormPago({ ...ok, fecha_pago: "2026-10-02" }, HOY).fecha_pago).toBe(
      "La fecha del pago no puede ser futura.",
    );
    expect(validarFormPago({ ...ok, fecha_pago: "2026-02-30" }, HOY).fecha_pago).toBeDefined();
    expect(validarFormPago({ ...ok, referencia: "x".repeat(121) }, HOY).referencia).toBe("Máximo 120 caracteres.");
    expect(validarFormPago({ ...ok, factura_folio: "x".repeat(61) }, HOY).factura_folio).toBeDefined();
    expect(validarFormPago({ ...ok, notas: "x".repeat(501) }, HOY).notas).toBeDefined();
    expect(validarFormPago({ ...ok, entregado_por_id: "nada" }, HOY).entregado_por_id).toBeDefined();
    expect(leerNumero("1,395.94")).toBe(1395.94);
  });

  it("cuerpo del POST: vacíos NO viajan, el T.C. solo en pesos, «entregó = yo» lo pone el API", () => {
    const form: FormPagoSocio = {
      ...formInicialAlta({ pendienteUsd: 1395.94, hoy: HOY, meId: ALE }),
      metodo: "TRANSFERENCIA",
      referencia: "  SPEI 1  ",
    };
    expect(
      payloadAltaPago(form, { aeronave_id: AVION, socio_id: MAURICIO, mes: "2026-09", meId: ALE, client_request_id: "c1" }),
    ).toEqual({
      aeronave_id: AVION,
      socio_id: MAURICIO,
      mes: "2026-09",
      monto: 1395.94,
      moneda: "USD",
      fecha_pago: HOY,
      metodo: "TRANSFERENCIA",
      referencia: "SPEI 1",
      client_request_id: "c1",
    });
    const mxn = payloadAltaPago(
      { ...form, moneda: "MXN", monto: "20000", tc: "18.4999999", entregado_por_id: ITZI, factura_folio: "A-77" },
      { aeronave_id: AVION, socio_id: MAURICIO, mes: "2026-09", meId: ALE, aceptar_exceso: true },
    );
    expect(mxn).toMatchObject({
      moneda: "MXN",
      monto: 20000,
      tc_usd_mxn: 18.5,
      entregado_por_id: ITZI,
      factura_folio: "A-77",
      aceptar_exceso: true,
    });
    // El dinero en USD del pago lo calcula el API: el panel no lo manda.
    expect(mxn).not.toHaveProperty("monto_usd");
  });

  it("PATCH: solo lo que cambió; a USD manda tc null; vaciar un texto manda null", () => {
    const form = formDePago(PAGO_MXN);
    expect(cambiosPago(PAGO_MXN, form)).toEqual({});
    expect(cambiosPago(PAGO_MXN, { ...form, monto: "21000" })).toEqual({ monto: 21000 });
    expect(cambiosPago(PAGO_MXN, { ...form, moneda: "USD", monto: "1081.08" })).toEqual({
      monto: 1081.08,
      moneda: "USD",
      tc_usd_mxn: null,
    });
    expect(cambiosPago(PAGO_MXN, { ...form, tc: "18.25" })).toEqual({ tc_usd_mxn: 18.25 });
    expect(cambiosPago(PAGO_MXN, { ...form, factura_folio: "  ", recibido_por: "Su esposa" })).toEqual({
      factura_folio: null,
      recibido_por: "Su esposa",
    });
    expect(cambiosPago(PAGO_MXN, { ...form, entregado_por_id: ITZI, metodo: "EFECTIVO" })).toEqual({
      metodo: "EFECTIVO",
      entregado_por_id: ITZI,
    });
  });

  it("cambio de moneda en el ALTA: el pendiente en USD prellenado no se queda como pesos", () => {
    const alta = formInicialAlta({ pendienteUsd: 1395.94, hoy: HOY, meId: ALE });
    const mxn = formAlCambiarMoneda(alta, "MXN", alta.monto);
    expect(mxn).toMatchObject({ moneda: "MXN", monto: "" });
    // Volver a USD con el campo vacío restaura el pendiente.
    expect(formAlCambiarMoneda(mxn, "USD", alta.monto)).toMatchObject({ moneda: "USD", monto: "1395.94" });
    // Un monto TECLEADO nunca se toca (en ninguna dirección).
    const tecleado = { ...alta, monto: "20000" };
    expect(formAlCambiarMoneda(tecleado, "MXN", alta.monto)).toMatchObject({ moneda: "MXN", monto: "20000" });
    expect(formAlCambiarMoneda({ ...mxn, monto: "25800" }, "USD", alta.monto).monto).toBe("25800");
    // Misma moneda: nada cambia.
    expect(formAlCambiarMoneda(alta, "USD", alta.monto)).toBe(alta);
    // EDICIÓN (sin prellenado): corregir la moneda conserva el número.
    const edicion = formDePago({ ...PAGO_MXN, moneda: "USD", tc_usd_mxn: null, monto: 20000 });
    expect(formAlCambiarMoneda(edicion, "MXN", null)).toMatchObject({ moneda: "MXN", monto: "20000" });
  });

  it("etiquetas del monto, ayuda y descripción del diálogo: la moneda SIEMPRE a la vista", () => {
    expect(etiquetaMontoPago("USD")).toBe("Monto entregado (USD)");
    expect(etiquetaMontoPago("MXN")).toBe("Monto entregado (MXN)");
    expect(hintMontoPago({ moneda: "MXN", pendienteUsd: 1395.94, alta: true })).toBe(
      "Captura el monto en pesos; pendiente $1,395.94 USD.",
    );
    expect(hintMontoPago({ moneda: "USD", pendienteUsd: 1395.94, alta: true })).toBe(
      "Prellenado con el pendiente del mes: $1,395.94 USD.",
    );
    expect(hintMontoPago({ moneda: "USD", pendienteUsd: 0, alta: true })).toBeNull();
    expect(hintMontoPago({ moneda: "MXN", pendienteUsd: 1395.94, alta: false })).toBeNull();
    expect(descripcionDialogoPago(fila(), "2026-09")).toBe(
      "N4142R · Septiembre 2026 · utilidad del mes $1,395.94 USD · pagado $0 USD · pendiente $1,395.94 USD",
    );
    expect(BOTON_REVISAR_MONTO).toBe("Revisar el monto");
  });

  it("contador del motivo: dice el mínimo mientras no se alcanza", () => {
    expect(textoContadorMotivo("dup")).toEqual({ texto: "3/300 · mínimo 5", falta: true });
    expect(textoContadorMotivo("")).toEqual({ texto: "0/300 · mínimo 5", falta: true });
    expect(textoContadorMotivo("  Se capturó dos veces  ")).toEqual({ texto: "20/300", falta: false });
  });

  it("nombres accesibles: «Registrar pago» con matrícula y mes; comprobante con fecha y monto", () => {
    expect(etiquetaRegistrarPago({ socio: "Aero Charter Cancun S.A. de C.V.", matricula: "N4142R", mes: "2026-09" })).toBe(
      "Registrar pago a Aero Charter Cancun S.A. de C.V. · N4142R · Septiembre 2026",
    );
    expect(etiquetaComprobantePago(PAGO_MXN)).toMatch(
      /^Reemplazar el comprobante del pago del 05 oct\.? 2026 por \$20,000 MXN · T\.C\. 18\.5 · ≈ \$1,081\.08 USD$/,
    );
    expect(etiquetaComprobantePago({ ...PAGO_MXN, comprobante_path: null })).toMatch(
      /^Adjuntar comprobante del pago del 05 oct\.? 2026 por /,
    );
    expect(textoVerMes("2026-09")).toBe("Ver Septiembre 2026");
  });

  it("motivo de la baja: 5–300 caracteres", () => {
    expect(validarMotivoBaja("dup")).toMatch(/al menos 5/);
    expect(validarMotivoBaja("  Se capturó dos veces  ")).toBeNull();
    expect(validarMotivoBaja("x".repeat(301))).toBe("Máximo 300 caracteres.");
  });

  it("«Entregó»: usuarios + yo + el que ya tiene el pago aunque esté inactivo, en orden", () => {
    const op = opcionesEntrego(
      [{ id: ITZI, nombre: "Itzi" }],
      { id: ALE, nombre: "Alejandro Canales" },
      { id: "0f1c0000-0000-4000-8000-0000000000ff", nombre: "Mari (baja)" },
    );
    expect(op.map((o) => o.label)).toEqual(["Alejandro Canales", "Itzi", "Mari (baja)"]);
    expect(op[0].description).toBe("Tú");
  });
});

describe("pre-cierre «Socios con utilidad del mes sin pagar o con pago parcial»", () => {
  it("clave y enlace al reparto del MISMO periodo", () => {
    expect(CLAVE_PRECIERRE_PAGOS_SOCIOS).toBe("pagos_socios_pendientes");
    expect(hrefPagosSocios({ desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "/admin/profit-sharing?desde=2026-09-01&hasta=2026-09-30",
    );
  });

  it("líneas con socio/avión como objeto o como texto, y «y N más» contra el count", () => {
    const r = lineasPreCierrePagosSocios(
      [
        { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, aeronave: { id: AVION, matricula: "N4142R" }, pendiente_usd: 1395.94, estado: "PENDIENTE" },
        { socio: "Alexander E. Saab", aeronave: "N4142R", pendiente_usd: 20.46, estado: "PARCIAL" },
      ],
      1,
      5,
    );
    expect(r.lineas.map((l) => l.texto)).toEqual(["Mauricio Roque · N4142R · pendiente $1,395.94 · Pendiente"]);
    expect(r.restantes).toBe(4);
    expect(lineasPreCierrePagosSocios(undefined)).toEqual({ lineas: [], restantes: 0 });
    expect(
      lineasPreCierrePagosSocios([{ socio: null, aeronave: null, pendiente_usd: 5, estado: "RARO" }]).lineas[0].texto,
    ).toBe("Socio · pendiente $5");
  });

  it("conteo: PAGOS pendientes (avión × socio) y, con la lista completa, cuántos SOCIOS", () => {
    const aero = (n: number) => ({
      socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." },
      aeronave: { id: `av${n}`, matricula: `XA-${n}` },
      pendiente_usd: 100,
      estado: "PENDIENTE",
    });
    const socios = [
      ...[1, 2, 3, 4, 5, 6, 7].map(aero),
      { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, aeronave: { id: AVION, matricula: "N4142R" }, pendiente_usd: 1395.94, estado: "PENDIENTE" },
    ];
    expect(conteoPreCierrePagosSocios(8, socios)).toBe("8 pagos pendientes (2 socios)");
    expect(conteoPreCierrePagosSocios(1, [socios[7]])).toBe("1 pago pendiente (1 socio)");
    // Lista topada (más pagos que renglones recibidos): no se cuentan socios a medias.
    expect(conteoPreCierrePagosSocios(60, socios)).toBe("60 pagos pendientes");
    expect(conteoPreCierrePagosSocios(3, undefined)).toBe("3 pagos pendientes");
    // Socio como texto también cuenta.
    expect(
      conteoPreCierrePagosSocios(2, [
        { socio: "Alexander E. Saab", aeronave: "N4142R", pendiente_usd: 1, estado: "PARCIAL" },
        { socio: "Alexander E. Saab", aeronave: "XA-VGV", pendiente_usd: 1, estado: "PARCIAL" },
      ]),
    ).toBe("2 pagos pendientes (1 socio)");
  });
});
