/**
 * PANTALLA POR AVIÓN del reparto (20-oct-2026, API 0.0.101, invariante 99):
 * la fuente única pura `lib/admin/reparto-avion.ts`. Se custodian:
 *  1. la cascada: con `reparto_como_balance` la provisión AFAC RESTA y la
 *     reserva NO está en la cascada (va aparte, informativa); sin la bandera
 *     la reserva resta como siempre y no hay AFAC;
 *  2. los gastos agrupados como en el balance, con subtotales en centavos y
 *     el cuadre contra la fila de la cascada (se DICE si no cuadra);
 *  3. los socios: utilidad, reserva, «se le descuenta» / «solo informativa»,
 *     a recibir; la confirmación del cambio (es dinero) y los renglones de
 *     `aeronave_socio` que cuentan en el periodo;
 *  4. el histórico: columnas, textos de celda, totales y el filtro de meses
 *     con el tope de 36 del API;
 *  5. la normalización de las dos respuestas y las rutas/roles.
 * Ningún número se inventa: los fixtures son los del reparto en pesos.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_CASCADA,
  AYUDA_CASCADA_EXCEL,
  AYUDA_GASTOS_AVION,
  AYUDA_GASTOS_AVION_EXCEL,
  COLUMNAS_HISTORICO,
  DESCRIPCION_GRUPO_DIRECTO_SIN_COMBUSTIBLE,
  DESCRIPCION_GRUPO_GASTO,
  ETIQUETAS_CASCADA,
  ETIQUETAS_CASCADA_EXCEL,
  ETIQUETA_CORTA_GRUPO_GASTO,
  ETIQUETA_GRUPO_GASTO,
  ETIQUETA_RESERVA_INFORMATIVA,
  MESES_HISTORICO_MAX,
  ORDEN_GRUPOS_GASTO,
  PARAMETRO_SECCION_AVION,
  RUTA_REPARTO_AVIONES,
  SECCIONES_PANTALLA_AVION,
  TEXTO_RESERVA_NO_RESTA,
  TITULO_FILA_COMBUSTIBLE,
  agruparGastosDetalle,
  ayudaCascada,
  ayudaGastosAvion,
  cascadaDelGrupo,
  celdasTotalesHistorico,
  columnasHistorico,
  confirmacionDescuentoReserva,
  conteosPantallaAvion,
  contextoEntregaDesdeAvion,
  descripcionGrupoGasto,
  diferenciaConCascada,
  etiquetaMesHistorico,
  etiquetaSaldoCascada,
  filasCascadaAvion,
  filasHistorico,
  filasPropietarioDeSocio,
  filasSociosReparto,
  filtroMesesHistorico,
  historicoConCombustible,
  hrefHistoricoAvion,
  hrefRepartoAvion,
  hrefRepartoConPeriodo,
  hrefVueloGasto,
  mensajeErrorDescuentoReserva,
  mesesFuturosDelRango,
  nombreSocioDeEntrega,
  normalizarAvionDetalle,
  normalizarAvionHistorico,
  periodoRepartoDeUrl,
  pestanasGruposGasto,
  pestanasPantallaAvion,
  puedeCambiarDescuentoReserva,
  puedeVerRepartoAvion,
  reservaInformativa,
  saldoCascada,
  seccionPantallaAvionDeUrl,
  sublabelAfac,
  sublabelReservaOverhaul,
  textoCeldaHistorico,
  textoCuadreGrupo,
  textoDescontadoGasto,
  textoEstadoCierreMes,
  textoMesEntrega,
  textoMontoOriginalGasto,
  textoPorEntregarAvion,
  textoReservaSocio,
  textoTcGasto,
  textoVueloGasto,
  toastDescuentoReserva,
  utilidadAntesGastos,
} from "../reparto-avion";
import { combustibleSeparado } from "../reparto-pesos";
import {
  avionA,
  avionCombustible,
  conPesos,
  sinCombustible,
} from "@/components/admin/profit-sharing/__tests__/reparto-pesos.fixtures";
import type { AvionReparto, FilaGastoDetalle, MesHistoricoAvion } from "@/types/profit-sharing";
import type { AircraftOwner } from "@/types/aircraft";

const AV = "a1a1a1a1-0000-4000-8000-000000000621";
const SOCIO = "50c10000-0000-4000-8000-000000000001";
const OTRO = "50c10000-0000-4000-8000-000000000002";
const VUELO = "b2b2b2b2-0000-4000-8000-000000000301";

/** N621TX con la cascada del balance (API 0.0.101): AFAC resta; la reserva (8,625 MXN) ya no. */
function avionBalance(): AvionReparto {
  const a = conPesos(avionA());
  return {
    ...a,
    // saldo = 210,811.73 + 46,550.80 − 6,210 − 70,740 − 13,800 − 2,587.50 − 10,350 − 3,450 = 150,225.03
    saldo_disponible_usd: 8476.16,
    saldo_disponible_mxn: 150225.03,
    afac_reservado_usd: 200,
    afac_reservado_mxn: 3450,
    reserva_retenida_usd: 204.6,
    reserva_retenida_mxn: 3529.35,
    reparto: [
      {
        socio_id: SOCIO,
        socio_nombre: "Hernán Pérez",
        porcentaje: 40.92,
        utilidad_usd: 3468.44,
        utilidad_mxn: 61472.08,
        reserva_usd: 204.6,
        reserva_mxn: 3529.35,
        descuenta_reserva: true,
        monto_usd: 3263.84,
        monto_mxn: 57942.73,
      },
      {
        socio_id: OTRO,
        socio_nombre: "VuelaTour",
        porcentaje: 59.08,
        utilidad_usd: 5007.72,
        utilidad_mxn: 88752.95,
        reserva_usd: 295.4,
        reserva_mxn: 5095.65,
        descuenta_reserva: false,
        monto_usd: 5007.72,
        monto_mxn: 88752.95,
      },
    ],
    detalle: {
      ...a.detalle!,
      afac: { tarifa_usd_hr: 20, horas_cobradas_hr: 10, monto_usd: 200, monto_mxn: 3450 },
    },
  };
}

const gasto = (over: Partial<FilaGastoDetalle>): FilaGastoDetalle => ({
  id: "g-1",
  fecha: "2026-09-10",
  categoria: "GAS",
  etiqueta: "Combustible",
  clave: "GAS",
  grupo: "DIRECTO",
  concepto: "Turbosina CUN",
  vuelo: { id: VUELO, folio: 301 },
  monto: 25000,
  moneda: "MXN",
  tc: null,
  descontado_mxn: 0,
  usd: 1449.28,
  mxn: 25000,
  tc_oficial: true,
  es_reparto_parcial: false,
  ...over,
});

describe("rutas y roles", () => {
  it("hrefs con el periodo / los meses validados", () => {
    expect(RUTA_REPARTO_AVIONES).toBe("/admin/profit-sharing/aviones");
    expect(hrefRepartoAvion(AV, { desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      `/admin/profit-sharing/aviones/${AV}?desde=2026-09-01&hasta=2026-09-30`,
    );
    expect(hrefRepartoAvion(AV, { desde: "nada", hasta: "2026-13-45" })).toBe(`/admin/profit-sharing/aviones/${AV}`);
    expect(hrefHistoricoAvion(AV, { desde: "2026-09", hasta: "2026-10" })).toBe(
      `/admin/profit-sharing/aviones/${AV}/historico?desde=2026-09&hasta=2026-10`,
    );
    expect(hrefHistoricoAvion(AV, { desde: "2026-09-01" })).toBe(`/admin/profit-sharing/aviones/${AV}/historico`);
    expect(hrefRepartoConPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "/admin/profit-sharing?desde=2026-09-01&hasta=2026-09-30",
    );
    expect(hrefRepartoConPeriodo({})).toBe("/admin/profit-sharing");
  });

  it("roles: espejo del API (ver: ADMIN/ANALISTA/FACTURACION/SOCIO; cambiar la reserva: solo ADMIN)", () => {
    for (const r of ["ADMIN", "ANALISTA", "FACTURACION", "SOCIO"]) expect(puedeVerRepartoAvion(r)).toBe(true);
    for (const r of ["COORDINADOR", "PILOTO", null, undefined, ""]) expect(puedeVerRepartoAvion(r)).toBe(false);
    expect(puedeCambiarDescuentoReserva("ADMIN")).toBe(true);
    for (const r of ["FACTURACION", "ANALISTA", "SOCIO", null]) expect(puedeCambiarDescuentoReserva(r)).toBe(false);
  });

  it("periodo de la URL: la MISMA regla del reparto (inválido ⇒ mes corriente; invertido se endereza; piso del inicio con aviso)", () => {
    expect(periodoRepartoDeUrl({}, null, "2026-10-20")).toEqual({ desde: "2026-10-01", hasta: "2026-10-20", ajustado: false });
    expect(periodoRepartoDeUrl({ desde: "nada", hasta: "2026-13-45" }, null, "2026-10-20")).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-20",
      ajustado: false,
    });
    expect(periodoRepartoDeUrl({ desde: "2026-09-30", hasta: "2026-09-01" }, null, "2026-10-20")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      ajustado: false,
    });
    expect(periodoRepartoDeUrl({ desde: "2026-08-01", hasta: "2026-08-31" }, "2026-09-01", "2026-10-20")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      ajustado: true,
    });
  });
});

describe("cascada del avión", () => {
  it("con la cascada del balance: AFAC resta (con su sublabel) y la reserva NO está en la cascada", () => {
    const filas = filasCascadaAvion(avionBalance(), { enPesos: true, comoBalance: true });
    expect(filas.map((f) => f.clave)).toEqual([
      "cobrado",
      "otros_ingresos",
      "comisiones",
      "directos",
      "indirectos",
      "permisos",
      "fijos",
      "afac",
    ]);
    const afac = filas.at(-1)!;
    expect(afac).toMatchObject({ etiqueta: "Provisión AFAC", tipo: "deduccion" });
    expect(afac.monto.principal).toBe("−$3,450.00 MXN");
    expect(afac.monto.informativo).toBe("≈ −$200 USD");
    expect(afac.sublabel).toBe("$20 USD/hr × 10.00 hr cobradas");
    expect(filas.find((f) => f.clave === "reserva")).toBeUndefined();
    expect(filas[0]).toMatchObject({ tipo: "ingreso" });
    expect(filas[0].monto.principal).toBe("$210,811.73 MXN");
    expect(filas[2].sublabel).toContain("comisión bancaria");
  });

  it("sin la bandera (API previo): la reserva resta al final con su T.C. y no hay fila de AFAC", () => {
    const filas = filasCascadaAvion(conPesos(avionA()), { enPesos: true, comoBalance: false });
    expect(filas.map((f) => f.clave)).toEqual([
      "cobrado",
      "otros_ingresos",
      "comisiones",
      "directos",
      "indirectos",
      "permisos",
      "fijos",
      "reserva",
    ]);
    const reserva = filas.at(-1)!;
    expect(reserva.monto.principal).toBe("−$8,625.00 MXN");
    expect(reserva.monto.informativo).toBe("≈ −$500 USD · al T.C. 17.25");
    expect(reserva.sublabel).toBe("12.5 hr × $40/hr");
    // Sin pesos: la cascada de siempre en dólares.
    const usd = filasCascadaAvion(avionA(), { enPesos: false, comoBalance: false });
    expect(usd.at(-1)!.monto).toEqual({ principal: "−$500", informativo: null, sinPesos: false, valor: 500 });
  });

  it("filas opcionales: otros ingresos y comisiones solo con > 0; AFAC en 0 se pinta (en gris)", () => {
    const a = avionBalance();
    const sin: AvionReparto = {
      ...a,
      ingresos: { ...a.ingresos, otros_ingresos_avion_usd: 0, comisiones_venta_usd: 0 },
      afac_reservado_usd: 0,
      afac_reservado_mxn: 0,
    };
    const filas = filasCascadaAvion(sin, { enPesos: true, comoBalance: true });
    expect(filas.map((f) => f.clave)).toEqual(["cobrado", "directos", "indirectos", "permisos", "fijos", "afac"]);
    expect(filas.at(-1)!.monto.valor).toBe(0);
  });

  it("saldo y reserva informativa (lo que el avión debe guardar; lo que VuelaTour retiene)", () => {
    const a = avionBalance();
    expect(saldoCascada(a, true).principal).toBe("$150,225.03 MXN");
    expect(saldoCascada(a, false).principal).toBe("$8,476.16");
    const r = reservaInformativa(a, true);
    expect(r.monto.principal).toBe("$8,625.00 MXN");
    expect(r.monto.informativo).toBe("≈ $500 USD · al T.C. 17.25");
    expect(r.sublabel).toBe("12.5 hr × $40/hr");
    expect(r.retenida?.principal).toBe("$3,529.35 MXN");
    expect(r.incompleta).toBe(false);
    expect(reservaInformativa({ ...a, reserva_retenida_usd: 0 }, true).retenida).toBeNull();
    expect(ETIQUETA_RESERVA_INFORMATIVA).toBe("no se resta");
    expect(TEXTO_RESERVA_NO_RESTA).toContain("No se resta del saldo");
    expect(ETIQUETAS_CASCADA.afac).toBe("Provisión AFAC");
  });

  it("sublabels: AFAC «$X USD/hr × Y hr cobradas»; reserva con detalle o solo horas", () => {
    expect(sublabelAfac({ tarifa_usd_hr: 20, horas_cobradas_hr: 10.5 })).toBe("$20 USD/hr × 10.50 hr cobradas");
    expect(sublabelAfac(null)).toBeUndefined();
    expect(sublabelReservaOverhaul({ horas_hr: 12.5, tarifa_hora_usd: 40 }, 12.5)).toBe("12.5 hr × $40/hr");
    expect(sublabelReservaOverhaul(null, 2)).toBe("2.0 hr voladas");
    expect(sublabelReservaOverhaul(null, 0)).toBeUndefined();
  });
});

describe("socios: utilidad, reserva, se descuenta / solo informativa, a recibir", () => {
  it("las filas salen de `reparto[]` (números del API; aquí solo se visten)", () => {
    const [h, v] = filasSociosReparto(avionBalance().reparto, true);
    expect(h).toMatchObject({ socio_id: SOCIO, nombre: "Hernán Pérez", porcentaje: 40.92, descuenta: true });
    expect(h.utilidad?.principal).toBe("$61,472.08 MXN");
    expect(h.reserva?.principal).toBe("$3,529.35 MXN");
    expect(h.aRecibir.principal).toBe("$57,942.73 MXN");
    expect(h.aRecibir.informativo).toBe("≈ $3,263.84 USD");
    expect(v.descuenta).toBe(false);
    expect(v.aRecibir.principal).toBe("$88,752.95 MXN");
    expect(textoReservaSocio(h)).toBe("reserva $3,529.35 MXN · se le descuenta");
    expect(textoReservaSocio(v)).toBe("guardar $5,095.65 MXN · solo informativa");
  });

  it("API previo (sin reserva por socio): utilidad/reserva null, descuenta null y sin renglón de reserva", () => {
    const [s] = filasSociosReparto(conPesos(avionA()).reparto, true);
    expect(s.utilidad).toBeNull();
    expect(s.reserva).toBeNull();
    expect(s.descuenta).toBeNull();
    expect(s.aRecibir.principal).toBe("$59,354.47 MXN");
    expect(textoReservaSocio(s)).toBeNull();
    // Reserva en 0: tampoco se dice nada.
    expect(textoReservaSocio({ reserva: { principal: "$0.00 MXN", informativo: null, sinPesos: false, valor: 0 }, descuenta: false })).toBeNull();
  });

  it("la confirmación explica la consecuencia en las dos direcciones (es dinero: siempre se confirma)", () => {
    const si = confirmacionDescuentoReserva({ socio: "Hernán Pérez", matricula: "N621TX", descontar: true });
    expect(si.titulo).toBe("¿Descontar la reserva a Hernán Pérez?");
    expect(si.descripcion).toContain("se RESTARÁ de lo que se le entrega: VuelaTour la retiene");
    expect(si.descripcion).toContain("las utilidades ya congeladas en un cierre de mes no cambian");
    expect(si.boton).toBe("Sí, descontársela");
    const no = confirmacionDescuentoReserva({ socio: "Hernán Pérez", matricula: "N621TX", descontar: false });
    expect(no.titulo).toBe("¿Dejar la reserva solo como dato para Hernán Pérez?");
    expect(no.descripcion).toContain("ya NO se le descontará: recibe su utilidad completa");
    expect(no.boton).toBe("Sí, solo informarle");
    expect(toastDescuentoReserva("Hernán Pérez", true)).toBe("A Hernán Pérez se le descuenta la reserva de overhaul desde ahora.");
    expect(toastDescuentoReserva("Hernán Pérez", false)).toBe("A Hernán Pérez ya no se le descuenta la reserva: solo se le informa.");
  });

  it("errores del PATCH en es-MX", () => {
    expect(mensajeErrorDescuentoReserva("FORBIDDEN", "Forbidden", 403)).toBe("Solo administración puede cambiar si se descuenta la reserva.");
    expect(mensajeErrorDescuentoReserva("NOT_FOUND", "Cannot PATCH /v1/aircraft/owners/x", 404)).toContain("falta actualizarlo");
    expect(mensajeErrorDescuentoReserva("PROPIETARIO_NO_EXISTE", "Ese propietario ya no existe: recarga la página.", 404)).toBe(
      "Ese propietario ya no existe: recarga la página.",
    );
    expect(mensajeErrorDescuentoReserva("SIN_CONEXION", null)).toContain("Recarga la página");
    expect(mensajeErrorDescuentoReserva("X", "Internal server error", 500)).toContain("error 500");
    expect(mensajeErrorDescuentoReserva("PROPIETARIO_VIGENCIA_INVALIDA", "El socio empezó el 01/09/2026.", 400)).toBe(
      "El socio empezó el 01/09/2026.",
    );
  });

  it("renglones de `aeronave_socio` que CUENTAN en el periodo (la regla del compute), para el PATCH", () => {
    const fila = (id: string, socio: string, desde: string, hasta: string | null): AircraftOwner => ({
      id,
      socio_id: socio,
      porcentaje: "50",
      vigente_desde: desde,
      vigente_hasta: hasta,
      notas: null,
      usuario: null,
    });
    const owners = [
      fila("o1", SOCIO, "2026-01-01", "2026-09-15"),
      fila("o2", SOCIO, "2026-09-16", null),
      fila("o3", SOCIO, "2025-01-01", "2025-12-31"),
      fila("o4", OTRO, "2026-01-01", null),
    ];
    const periodo = { desde: "2026-09-01", hasta: "2026-09-30" };
    expect(filasPropietarioDeSocio(owners, SOCIO, periodo).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(filasPropietarioDeSocio(owners, SOCIO, { desde: "2026-10-01", hasta: "2026-10-31" }).map((o) => o.id)).toEqual(["o2"]);
    expect(filasPropietarioDeSocio(null, SOCIO, periodo)).toEqual([]);
  });

  it("contexto de «Registrar entrega» desde el avión: con el renglón de la cuenta (y el avión preseleccionado) o lo mínimo", () => {
    const socio = { socio_id: SOCIO, socio_nombre: "Hernán Pérez", porcentaje: 40.92 };
    const avion = { id: AV, matricula: "N621TX" };
    const minimo = contextoEntregaDesdeAvion(socio, avion, null, { mesEnCurso: "2026-10", mesSugerido: "2026-09" });
    expect(minimo).toEqual({
      socio: { id: SOCIO, nombre: "Hernán Pérez" },
      porEntregarMxn: null,
      mesEnCursoMxn: 0,
      mesEnCurso: "2026-10",
      aviones: [{ id: AV, matricula: "N621TX", porcentaje: 40.92, vigente: true }],
      cuentaDesdeMes: "2026-09",
      mesSugerido: "2026-09",
      avionSugerido: AV,
    });
    const conCuenta = contextoEntregaDesdeAvion(
      socio,
      avion,
      {
        socio: { id: SOCIO, nombre: "Hernán Pérez" },
        cuenta: { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: true },
        generado_mxn: 100,
        mes_en_curso_mxn: 20,
        entregado_mxn: 0,
        por_entregar_mxn: 100,
        estado: "POR_ENTREGAR",
        ultimo_pago: null,
        aviones: [{ id: AV, matricula: "N621TX", porcentaje: 40.92, vigente: true }],
      },
      { mesEnCurso: "2026-10" },
    );
    expect(conCuenta).toMatchObject({ porEntregarMxn: 100, mesEnCursoMxn: 20, avionSugerido: AV });
  });

  it("«Por entregar (este avión)»: positivo ámbar, de más azul, cero neutro (tolerancia de $1)", () => {
    expect(textoPorEntregarAvion(48442.19)).toEqual({ texto: "$48,442.19 MXN", tono: "ambar" });
    expect(textoPorEntregarAvion(-500)).toEqual({ texto: "$500.00 MXN de más", tono: "azul" });
    expect(textoPorEntregarAvion(0.5)).toEqual({ texto: "$0.00 MXN", tono: "neutro" });
  });
});

describe("gastos del periodo, gasto por gasto", () => {
  const filas: FilaGastoDetalle[] = [
    gasto({ id: "g-2", fecha: "2026-09-12", categoria: "HOTEL", etiqueta: "Hotel", clave: "HOTEL", monto: 120, moneda: "USD", tc: 18.2, usd: 120, mxn: 2184, tc_oficial: false }),
    gasto({ id: "g-1" }),
    gasto({ id: "g-3", fecha: "2026-09-02", categoria: "REFACCION", etiqueta: "Refacción", clave: "REFACCION", grupo: "INDIRECTO", vuelo: null, monto: 13800, mxn: 13800, usd: 800, tc: 17.25, tc_oficial: false }),
    gasto({ id: "g-4", fecha: "2026-09-05", categoria: "PERMISO", etiqueta: "Permiso", clave: "PERMISO", grupo: "PERMISO", vuelo: null, monto: 150, moneda: "USD", tc: null, usd: 150, mxn: 2587.5 }),
    gasto({ id: "g-5", fecha: "2026-09-20", categoria: "TUAS", etiqueta: "TUA", clave: "TUAS (egreso VuelaTour — Otros movimientos)", grupo: "EXCLUIDO", monto: 1200, mxn: 1200, usd: 69.57 }),
    gasto({ id: "g-6", fecha: "2026-09-21", categoria: "PERMISO", etiqueta: "Permiso", clave: "Pago de AFAC (lo paga VuelaTour)", grupo: "EXCLUIDO", vuelo: null, monto: 4500, mxn: 4500, usd: 260.87 }),
    gasto({ id: "g-7", fecha: null, categoria: "NOMINA", etiqueta: "Nómina (repartido)", clave: "NOMINA (repartido)", grupo: "FIJO", vuelo: null, monto: 10350, mxn: 10350, usd: 600, es_reparto_parcial: true }),
  ];

  it("se agrupan en el orden del balance (solo grupos con filas), por fecha, con subtotal en centavos", () => {
    const grupos = agruparGastosDetalle(filas);
    // COMBUSTIBLE (API 0.0.103) va tras los directos; sin filas suyas (API previo) no aparece.
    expect(ORDEN_GRUPOS_GASTO).toEqual(["DIRECTO", "COMBUSTIBLE", "INDIRECTO", "PERMISO", "FIJO", "EXCLUIDO"]);
    expect(grupos.map((g) => g.grupo)).toEqual(["DIRECTO", "INDIRECTO", "PERMISO", "FIJO", "EXCLUIDO"]);
    expect(grupos[0].descripcion).toBe(DESCRIPCION_GRUPO_GASTO.DIRECTO);
    const directos = grupos[0];
    expect(directos.filas.map((f) => f.id)).toEqual(["g-1", "g-2"]);
    expect(directos.subtotalMxn).toBe(27184);
    expect(directos.subtotalUsd).toBe(1569.28);
    expect(directos.sinPesos).toBe(0);
    expect(grupos[4].subtotalMxn).toBeNull();
    expect(grupos[4].filas.map((f) => f.clave)).toEqual([
      "TUAS (egreso VuelaTour — Otros movimientos)",
      "Pago de AFAC (lo paga VuelaTour)",
    ]);
    expect(agruparGastosDetalle(null)).toEqual([]);
    expect(ETIQUETA_GRUPO_GASTO.EXCLUIDO).toBe("No restan al avión");
    expect(DESCRIPCION_GRUPO_GASTO.FIJO).toContain("no se lista gasto por gasto");
  });

  it("una fila sin ningún T.C. (sin pesos) deja el subtotal en null y se cuenta", () => {
    const g = agruparGastosDetalle([gasto({ id: "g-9", tc: null, usd: null, mxn: null, tc_oficial: false }), gasto({})]);
    expect(g[0].subtotalMxn).toBeNull();
    expect(g[0].subtotalUsd).toBeNull();
    expect(g[0].sinPesos).toBe(1);
  });

  it("cuadre contra la fila de la cascada: un centavo por fila de tolerancia; FIJO y EXCLUIDO no se comparan", () => {
    const a = avionBalance();
    expect(cascadaDelGrupo(a, "DIRECTO")).toEqual({ mxn: 70740, usd: 4000 });
    expect(cascadaDelGrupo(a, "FIJO")).toEqual({ mxn: 10350, usd: 600 });
    expect(cascadaDelGrupo(a, "EXCLUIDO")).toBeNull();
    expect(diferenciaConCascada("DIRECTO", 70740.02, 70740, 3)).toBeNull();
    expect(diferenciaConCascada("DIRECTO", 70745, 70740, 3)).toBe(5);
    expect(diferenciaConCascada("DIRECTO", null, 70740, 3)).toBeNull();
    expect(diferenciaConCascada("FIJO", 1, 10350, 1)).toBeNull();
    expect(textoCuadreGrupo("DIRECTO", null, "$70,740.00 MXN")).toBe(
      "Cuadra con la fila «Gastos directos» de la cascada ($70,740.00 MXN).",
    );
    expect(textoCuadreGrupo("DIRECTO", 5, "$70,740.00 MXN")).toBe(
      "No cuadra con la fila «Gastos directos» de la cascada ($70,740.00 MXN): diferencia de $5.00 MXN. Avisa a sistemas.",
    );
    expect(textoCuadreGrupo("FIJO", null, "$10,350.00 MXN")).toBeNull();
  });

  it("textos de cada renglón: monto original, descontado, T.C., vuelo (enlace solo con uuid)", () => {
    expect(textoMontoOriginalGasto(gasto({}))).toBe("$25,000 MXN");
    expect(textoMontoOriginalGasto(gasto({ monto: 120.5, moneda: "USD" }))).toBe("$120.50 USD");
    expect(textoDescontadoGasto(gasto({ descontado_mxn: 1200 }))).toBe("−$1,200.00 MXN de TUA/extensión trasladados al pasajero");
    expect(textoDescontadoGasto(gasto({}))).toBeNull();
    expect(textoTcGasto(gasto({ tc: 18.123456 }))).toBe("18.123456");
    expect(textoTcGasto(gasto({ tc: null }))).toBe("—");
    expect(textoVueloGasto(gasto({}))).toBe("#301");
    expect(textoVueloGasto(gasto({ vuelo: { id: VUELO, folio: null } }))).toBe("s/folio");
    expect(textoVueloGasto(gasto({ vuelo: null }))).toBeNull();
    expect(hrefVueloGasto(gasto({}))).toBe(`/admin/flights/${VUELO}`);
    expect(hrefVueloGasto(gasto({ vuelo: { id: "x", folio: 1 } }))).toBeNull();
  });
});

describe("entregas del avión", () => {
  it("el nombre del socio se lee de los socios de la pantalla (el API no lo manda en la entrega)", () => {
    const socios = [{ socio_id: SOCIO, socio_nombre: "Hernán Pérez" }];
    expect(nombreSocioDeEntrega({ socio_id: SOCIO }, socios)).toBe("Hernán Pérez");
    expect(nombreSocioDeEntrega({ socio_id: OTRO }, socios)).toBe("Socio");
    expect(textoMesEntrega({ mes: "2026-09", periodo: null })).toBe("Septiembre 2026");
    expect(textoMesEntrega({ mes: null, periodo: "2026-09-01" })).toBe("Septiembre 2026");
    expect(textoMesEntrega({ mes: null, periodo: null })).toBe("Sin mes (a cuenta)");
  });
});

describe("histórico mes a mes", () => {
  const mes = (over: Partial<MesHistoricoAvion>): MesHistoricoAvion => ({
    mes: "2026-09",
    en_curso: false,
    horas_voladas_hr: 12.5,
    vuelos: 3,
    cobrado_mxn: 210811.73,
    pendiente_cobro_mxn: 51750,
    comisiones_mxn: 6210,
    directos_mxn: 70740,
    indirectos_mxn: 13800,
    permisos_mxn: 2587.5,
    otros_mxn: 10350,
    afac_mxn: 3450,
    otros_ingresos_mxn: 46550.8,
    saldo_mxn: 150225.03,
    reserva_mxn: 8625,
    reserva_retenida_mxn: 3529.35,
    entregado_mxn: 20000,
    pesos_sin_tc_usd: 0,
    saldo_usd: 8476.16,
    reparto: [],
    cierre_estado: "CERRADO",
    ...over,
  });

  it("columnas en el orden de la cascada; la vista compacta deja las principales; «Combustible» solo si el API la manda", () => {
    expect(COLUMNAS_HISTORICO.map((c) => c.clave)).toEqual([
      "horas_voladas_hr",
      "vuelos",
      "cobrado_mxn",
      "comisiones_mxn",
      "directos_mxn",
      "combustible_mxn",
      "indirectos_mxn",
      "permisos_mxn",
      "otros_mxn",
      "afac_mxn",
      "otros_ingresos_mxn",
      "saldo_mxn",
      "reserva_mxn",
      "entregado_mxn",
      "cierre",
    ]);
    expect(columnasHistorico(false).map((c) => c.clave)).toEqual([
      "horas_voladas_hr",
      "vuelos",
      "cobrado_mxn",
      "saldo_mxn",
      "reserva_mxn",
      "entregado_mxn",
      "cierre",
    ]);
    // API previo: todas las columnas de siempre, SIN la de combustible.
    expect(columnasHistorico(true).map((c) => c.clave)).not.toContain("combustible_mxn");
    expect(columnasHistorico(true)).toHaveLength(COLUMNAS_HISTORICO.length - 1);
    // API 0.0.103: «Combustible» junto a «Directos»; la vista compacta no cambia.
    const completas = columnasHistorico(true, { conCombustible: true });
    expect(completas).toHaveLength(COLUMNAS_HISTORICO.length);
    expect(completas.map((c) => c.clave).indexOf("combustible_mxn")).toBe(
      completas.map((c) => c.clave).indexOf("directos_mxn") + 1,
    );
    expect(completas.find((c) => c.clave === "combustible_mxn")).toMatchObject({
      etiqueta: "Combustible",
      signo: "-",
      title: TITULO_FILA_COMBUSTIBLE,
    });
    expect(columnasHistorico(false, { conCombustible: true })).toEqual(columnasHistorico(false));
    expect(COLUMNAS_HISTORICO.find((c) => c.clave === "reserva_mxn")?.informativa).toBe(true);
  });

  it("celdas: pesos con «−» en lo que resta y «+» en lo que suma; horas; enteros; estado del cierre", () => {
    const col = (clave: string) => COLUMNAS_HISTORICO.find((c) => c.clave === clave)!;
    expect(textoCeldaHistorico(col("directos_mxn"), 70740)).toBe("−$70,740.00 MXN");
    expect(textoCeldaHistorico(col("directos_mxn"), 0)).toBe("$0.00 MXN");
    expect(textoCeldaHistorico(col("otros_ingresos_mxn"), 46550.8)).toBe("+$46,550.80 MXN");
    expect(textoCeldaHistorico(col("saldo_mxn"), -17250)).toBe("-$17,250.00 MXN");
    expect(textoCeldaHistorico(col("horas_voladas_hr"), 12.5)).toBe("12.5 hr");
    expect(textoCeldaHistorico(col("vuelos"), 3)).toBe("3");
    expect(textoCeldaHistorico(col("vuelos"), null)).toBe("—");
    expect(textoEstadoCierreMes("CERRADO")).toBe("Cerrado");
    expect(textoEstadoCierreMes("REABIERTO")).toBe("Reabierto");
    expect(textoEstadoCierreMes("ABIERTO")).toBe("Abierto");
    expect(textoEstadoCierreMes(undefined)).toBeNull();
    expect(etiquetaMesHistorico("2026-10", true)).toBe("Octubre 2026 (en curso)");
  });

  it("filas y totales con sus textos (números del API); el mes en curso y los pesos incompletos marcados", () => {
    const filas = filasHistorico([mes({}), mes({ mes: "2026-10", en_curso: true, cierre_estado: undefined, saldo_mxn: -100, pesos_sin_tc_usd: 12 })]);
    expect(filas[0]).toMatchObject({ mes: "2026-09", etiqueta: "Septiembre 2026", enCurso: false, cierre: "Cerrado", saldoNegativo: false, pesosIncompletos: false });
    expect(filas[0].celdas.cobrado_mxn).toBe("$210,811.73 MXN");
    expect(filas[0].celdas.afac_mxn).toBe("−$3,450.00 MXN");
    expect(filas[0].celdas.cierre).toBe("Cerrado");
    expect(filas[1]).toMatchObject({ etiqueta: "Octubre 2026 (en curso)", enCurso: true, cierre: null, saldoNegativo: true, pesosIncompletos: true });
    const totales = celdasTotalesHistorico({ ...mes({}), horas_voladas_hr: 20, vuelos: 5 });
    expect(totales.horas_voladas_hr).toBe("20.0 hr");
    expect(totales.vuelos).toBe("5");
    expect(totales.cierre).toBe("");
  });

  it("filtro de meses: lo del estado de cuenta + el tope de 36 meses del API; meses futuros del rango", () => {
    expect(MESES_HISTORICO_MAX).toBe(36);
    expect(filtroMesesHistorico("2026-09", "2026-10", "2026-10")).toEqual({ desde: "2026-09", hasta: "2026-10" });
    expect(filtroMesesHistorico("2020-01", "2026-10", "2026-10")).toEqual({ desde: "2023-11", hasta: "2026-10" });
    expect(filtroMesesHistorico("2020-01", undefined, "2026-10")).toEqual({ desde: "2023-11", hasta: undefined });
    expect(filtroMesesHistorico("2026-08", "2026-10", "2026-10", "2026-09-01")).toEqual({ desde: "2026-09", hasta: "2026-10", ajustado: true });
    expect(filtroMesesHistorico("nada", "2026-13")).toEqual({ desde: undefined, hasta: undefined });
    expect(mesesFuturosDelRango("2026-09", "2026-12", "2026-10")).toEqual(["2026-11", "2026-12"]);
    expect(mesesFuturosDelRango("2026-09", "2026-10", "2026-10")).toEqual([]);
  });
});

describe("normalización de las respuestas (forma sana; basura ⇒ null = fallo)", () => {
  it("detalle del avión: socios con números sanos, entregas normalizadas; sin avión ⇒ null", () => {
    const r = normalizarAvionDetalle({
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      reparto_en_pesos: true,
      reparto_como_balance: true,
      avion: avionBalance(),
      socios: [
        { socio_id: SOCIO, socio_nombre: "Hernán Pérez", porcentaje: "40.92", utilidad_mxn: "61472.08", reserva_mxn: "3529.35", descuenta_reserva: true, monto_mxn: "57942.73", entregado_mxn: "20000", por_entregar_mxn: "37942.73", monto_usd: "3263.84", reserva_usd: "204.6" },
        { sin: "socio" },
      ],
      entregas: [{ id: "9a9a0000-0000-4000-8000-000000000001", socio_id: SOCIO, monto: "20000", moneda: "MXN", monto_mxn: "20000", fecha_pago: "2026-10-01", metodo: "EFECTIVO", created_at: "2026-10-01T00:00:00Z" }],
    });
    expect(r?.socios).toHaveLength(1);
    expect(r?.socios[0]).toMatchObject({ porcentaje: 40.92, utilidad_mxn: 61472.08, descuenta_reserva: true, por_entregar_mxn: 37942.73 });
    expect(r?.entregas[0]).toMatchObject({ monto: 20000, monto_mxn: 20000, fecha_pago: "2026-10-01" });
    expect(normalizarAvionDetalle({ avion: { aeronave: {} } })).toBeNull();
    expect(normalizarAvionDetalle({ avion: avionBalance() })).toBeNull();
    expect(normalizarAvionDetalle(null)).toBeNull();
  });

  it("histórico: meses con todas las llaves numéricas (ausente ⇒ 0), reparto por socio, totales, socios y entregas", () => {
    const r = normalizarAvionHistorico({
      aeronave: { id: AV, matricula: "N621TX", modelo: "Cessna 421C" },
      desde: "2026-09",
      hasta: "2026-10",
      mes_actual: "2026-10",
      reparto_en_pesos: true,
      reparto_como_balance: true,
      meses: [
        { mes: "2026-09", en_curso: false, horas_voladas_hr: "12.5", vuelos: 3, saldo_mxn: "150225.03", reparto: [{ socio_id: SOCIO, socio_nombre: "Hernán Pérez", porcentaje: "40.92", monto_mxn: "57942.73", descuenta_reserva: true, entregado_mxn: "20000" }], cierre_estado: "CERRADO" },
        { mes: "nada" },
      ],
      totales: { saldo_mxn: "150225.03" },
      socios: [{ socio_id: SOCIO, socio_nombre: "Hernán Pérez", generado_mxn: "57942.73", reserva_mxn: "3529.35", entregado_mxn: "20000", por_entregar_mxn: "37942.73" }],
      entregas: [],
    });
    expect(r?.meses).toHaveLength(1);
    expect(r?.meses[0]).toMatchObject({ mes: "2026-09", horas_voladas_hr: 12.5, saldo_mxn: 150225.03, afac_mxn: 0, cierre_estado: "CERRADO" });
    expect(r?.meses[0].reparto[0]).toMatchObject({ porcentaje: 40.92, monto_mxn: 57942.73, descuenta_reserva: true, entregado_mxn: 20000 });
    expect(r?.totales.saldo_mxn).toBe(150225.03);
    expect(r?.totales.cobrado_mxn).toBe(0);
    expect(r?.socios[0].por_entregar_mxn).toBe(37942.73);
    expect(r?.reparto_como_balance).toBe(true);
    expect(normalizarAvionHistorico({ aeronave: { id: AV }, desde: "x", hasta: "2026-10" })).toBeNull();
    expect(normalizarAvionHistorico({})).toBeNull();
  });
});

// =============================================================================
// COMBUSTIBLE SEPARADO de los gastos directos (23-oct-2026, API 0.0.103,
// invariante 104): la cascada en el ORDEN DEL EXCEL del cliente, con el
// subtotal «Utilidad antes de gastos» y la fila «Combustible»; sin las llaves
// (API previo) todo queda como antes. Números: N621TX, septiembre 2026.
// =============================================================================

describe("combustible separado (API 0.0.103): la cascada del Excel", () => {
  const centavos = (v: number | null | undefined) => Math.round((v ?? Number.NaN) * 100);

  it("se detecta solo cuando el API manda `gastos.combustible_usd` o `_mxn` como número", () => {
    expect(combustibleSeparado(avionCombustible())).toBe(true);
    expect(combustibleSeparado({ gastos: { combustible_usd: 0 } })).toBe(true);
    expect(combustibleSeparado({ gastos: { combustible_mxn: 10 } })).toBe(true);
    expect(combustibleSeparado(sinCombustible(avionCombustible()))).toBe(false);
    expect(combustibleSeparado(avionBalance())).toBe(false);
    expect(combustibleSeparado(conPesos(avionA()))).toBe(false);
    expect(combustibleSeparado({ gastos: { combustible_usd: null, combustible_mxn: Number.NaN } })).toBe(false);
    expect(combustibleSeparado(null)).toBe(false);
  });

  it("filas en el orden del Excel con sus etiquetas exactas; el subtotal es la línea «Utilidad antes de gastos»", () => {
    const filas = filasCascadaAvion(avionCombustible(), { enPesos: true, comoBalance: true });
    expect(filas.map((f) => f.clave)).toEqual([
      "cobrado",
      "comisiones",
      "directos",
      "afac",
      "utilidad_antes_gastos",
      "combustible",
      "indirectos",
      "permisos",
      "fijos",
      "otros_ingresos",
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual([
      "Venta cobrada",
      "Comisiones de venta",
      "Gastos directos",
      "Provisión AFAC",
      "Utilidad antes de gastos",
      "Combustible",
      "Gastos indirectos",
      "Permisos",
      "Fijos prorrateados",
      "Otros ingresos del avión",
    ]);
    expect(filas.map((f) => f.tipo)).toEqual([
      "ingreso",
      "deduccion",
      "deduccion",
      "deduccion",
      "subtotal",
      "deduccion",
      "deduccion",
      "deduccion",
      "deduccion",
      "ingreso",
    ]);
    expect(etiquetaSaldoCascada(avionCombustible())).toBe("Saldo a repartir");
    expect(ETIQUETAS_CASCADA_EXCEL.saldo).toBe("Saldo a repartir");
    expect(ETIQUETAS_CASCADA_EXCEL.reserva).toBe(ETIQUETAS_CASCADA.reserva);
    const por = Object.fromEntries(filas.map((f) => [f.clave, f]));
    expect(por.cobrado.monto.principal).toBe("$787,851.13 MXN");
    expect(por.comisiones.monto.principal).toBe("−$2,591.00 MXN");
    expect(por.directos.monto.principal).toBe("−$40,588.14 MXN");
    expect(por.directos.title).toContain("El combustible va aparte");
    expect(por.afac.monto.principal).toBe("−$42,575.49 MXN");
    expect(por.afac.sublabel).toBe("$200 USD/hr × 12.50 hr cobradas");
    expect(por.utilidad_antes_gastos.monto).toEqual({
      principal: "$702,096.50 MXN",
      informativo: "≈ $40,669.39 USD",
      sinPesos: false,
      valor: 702096.5,
    });
    expect(por.combustible.monto.principal).toBe("−$147,277.58 MXN");
    expect(por.combustible.monto.informativo).toBe("≈ −$8,537.83 USD");
    expect(por.combustible.title).toBe(TITULO_FILA_COMBUSTIBLE);
    expect(por.indirectos.monto.principal).toBe("−$13,800.00 MXN");
    expect(por.permisos.monto.principal).toBe("−$2,587.50 MXN");
    expect(por.fijos.monto.principal).toBe("−$10,350.00 MXN");
    expect(por.otros_ingresos.monto.principal).toBe("$46,550.80 MXN");
    // Ya no se unen: la card decía «Gastos directos 187,865.72».
    expect(filas.some((f) => f.monto.principal.includes("187,865.72"))).toBe(false);
  });

  it("las sumas cuadran al centavo, en pesos y en dólares: cobrado − comisiones − directos − AFAC = utilidad; utilidad − combustible − indirectos − permisos − fijos + otros = saldo", () => {
    for (const enPesos of [true, false]) {
      const a = avionCombustible();
      const v = Object.fromEntries(
        filasCascadaAvion(a, { enPesos, comoBalance: true }).map((f) => [f.clave, centavos(f.monto.valor)]),
      );
      expect(v.cobrado - v.comisiones - v.directos - v.afac).toBe(v.utilidad_antes_gastos);
      expect(v.utilidad_antes_gastos).toBe(enPesos ? 70209650 : 4066939);
      expect(v.utilidad_antes_gastos - v.combustible - v.indirectos - v.permisos - v.fijos + v.otros_ingresos).toBe(
        centavos(enPesos ? a.saldo_disponible_mxn : a.saldo_disponible_usd),
      );
      expect(saldoCascada(a, enPesos).principal).toBe(enPesos ? "$574,632.22 MXN" : "$33,280.16");
    }
  });

  it("sin `utilidad_antes_gastos_*` del API: se suma en centavos con los componentes redondeados; sin el peso de la AFAC, se dice", () => {
    const a = avionCombustible();
    const sinSubtotal: AvionReparto = { ...a, utilidad_antes_gastos_usd: undefined, utilidad_antes_gastos_mxn: undefined };
    expect(utilidadAntesGastos(a, true)).toEqual({ usd: 40669.39, mxn: 702096.5 });
    expect(utilidadAntesGastos(sinSubtotal, true)).toEqual({ usd: 40669.39, mxn: 702096.5 });
    // Sin la cascada del balance (combinación que el API 0.0.103 no produce) la AFAC no entra.
    expect(utilidadAntesGastos(sinSubtotal, false)).toEqual({ usd: 43169.39, mxn: 744671.99 });
    const fila = filasCascadaAvion(sinSubtotal, { enPesos: true, comoBalance: true }).find(
      (f) => f.clave === "utilidad_antes_gastos",
    )!;
    expect(fila.monto.principal).toBe("$702,096.50 MXN");
    expect(fila.monto.informativo).toBe("≈ $40,669.39 USD");
    // Un componente sin pesos ⇒ el subtotal en pesos no se inventa.
    const sinPesoAfac = filasCascadaAvion(
      { ...sinSubtotal, afac_reservado_mxn: null },
      { enPesos: true, comoBalance: true },
    ).find((f) => f.clave === "utilidad_antes_gastos")!;
    expect(sinPesoAfac.monto.sinPesos).toBe(true);
    expect(sinPesoAfac.monto.principal).toBe("$40,669.39 USD");
    // En dólares (sin la bandera de pesos) el subtotal es el de siempre.
    expect(
      filasCascadaAvion(sinSubtotal, { enPesos: false, comoBalance: true }).find((f) => f.clave === "utilidad_antes_gastos")!
        .monto.principal,
    ).toBe("$40,669.39");
  });

  it("todas las líneas del Excel se pintan aunque valgan 0 (comisiones y otros ingresos incluidos)", () => {
    const a = avionCombustible();
    const cero: AvionReparto = {
      ...a,
      ingresos: { ...a.ingresos, comisiones_venta_usd: 0, comisiones_venta_mxn: 0, otros_ingresos_avion_usd: 0, otros_ingresos_avion_mxn: 0 },
    };
    const filas = filasCascadaAvion(cero, { enPesos: true, comoBalance: true });
    expect(filas.map((f) => f.clave)).toContain("comisiones");
    expect(filas.map((f) => f.clave)).toContain("otros_ingresos");
    expect(filas.find((f) => f.clave === "comisiones")!.monto.valor).toBe(0);
  });

  it("sin la bandera del balance (skew improbable): la reserva resta tras los fijos y la utilidad no descuenta AFAC", () => {
    const filas = filasCascadaAvion(avionCombustible(), { enPesos: true, comoBalance: false });
    expect(filas.map((f) => f.clave)).toEqual([
      "cobrado",
      "comisiones",
      "directos",
      "utilidad_antes_gastos",
      "combustible",
      "indirectos",
      "permisos",
      "fijos",
      "reserva",
      "otros_ingresos",
    ]);
    expect(filas.find((f) => f.clave === "reserva")!.monto.principal).toBe("−$8,625.00 MXN");
  });

  it("FALLBACK: sin las llaves (API previo) la cascada, las etiquetas y el saldo son EXACTAMENTE los de antes", () => {
    const viejo = sinCombustible(avionCombustible());
    const filas = filasCascadaAvion(viejo, { enPesos: true, comoBalance: true });
    expect(filas.map((f) => f.clave)).toEqual([
      "cobrado",
      "otros_ingresos",
      "comisiones",
      "directos",
      "indirectos",
      "permisos",
      "fijos",
      "afac",
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual([
      ETIQUETAS_CASCADA.cobrado,
      ETIQUETAS_CASCADA.otrosIngresos,
      ETIQUETAS_CASCADA.comisiones,
      ETIQUETAS_CASCADA.directos,
      ETIQUETAS_CASCADA.indirectos,
      ETIQUETAS_CASCADA.permisos,
      ETIQUETAS_CASCADA.fijos,
      ETIQUETAS_CASCADA.afac,
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual([
      "Venta del avión cobrada",
      "Otros ingresos del avión",
      "Comisiones (banco + vendedor)",
      "Gastos directos",
      "Gastos indirectos",
      "Permisos",
      "Fijos (prorrateo + reparto manual)",
      "Provisión AFAC",
    ]);
    expect(filas.some((f) => f.tipo === "subtotal")).toBe(false);
    expect(filas.find((f) => f.clave === "directos")!.title).toBeUndefined();
    expect(etiquetaSaldoCascada(viejo)).toBe("Saldo disponible");
    expect(etiquetaSaldoCascada(avionBalance())).toBe("Saldo disponible");
    // Y lo mismo con los fixtures del golden (API ≤ 0.0.92 y 0.0.101).
    expect(filasCascadaAvion(avionA(), { enPesos: false, comoBalance: false }).map((f) => f.clave)).toEqual([
      "cobrado",
      "otros_ingresos",
      "comisiones",
      "directos",
      "indirectos",
      "permisos",
      "fijos",
      "reserva",
    ]);
  });

  it("ayudas: las del Excel solo con el combustible separado", () => {
    expect(ayudaCascada(true)).toBe(AYUDA_CASCADA_EXCEL);
    expect(ayudaCascada(false)).toBe(AYUDA_CASCADA);
    expect(AYUDA_CASCADA_EXCEL).toContain("utilidad antes de gastos");
    expect(AYUDA_CASCADA_EXCEL).toContain("menos combustible");
    expect(ayudaGastosAvion(true)).toBe(AYUDA_GASTOS_AVION_EXCEL);
    expect(ayudaGastosAvion(false)).toBe(AYUDA_GASTOS_AVION);
    expect(AYUDA_GASTOS_AVION_EXCEL).toContain("el combustible va aparte de los gastos directos");
  });
});

describe("combustible separado: «Gastos del periodo» y el cuadre del grupo «Combustible»", () => {
  const filas: FilaGastoDetalle[] = [
    gasto({ id: "g-f1", fecha: "2026-09-08", grupo: "COMBUSTIBLE", monto: 100000, mxn: 100000, usd: 5797.1 }),
    gasto({ id: "g-f2", fecha: "2026-09-18", grupo: "COMBUSTIBLE", monto: 47277.58, mxn: 47277.58, usd: 2740.73 }),
    gasto({ id: "g-d1", fecha: "2026-09-10", categoria: "ATERRIZAJE", etiqueta: "Aterrizajes", clave: "ATERRIZAJE", monto: 25000, mxn: 25000, usd: 1449.28 }),
    gasto({ id: "g-d2", fecha: "2026-09-12", categoria: "HOTEL", etiqueta: "Hotel", clave: "HOTEL", monto: 15588.14, mxn: 15588.14, usd: 903.66 }),
  ];

  it("el grupo «Combustible» va tras los directos, con su subtotal en centavos y su descripción; los directos dicen que el combustible va aparte", () => {
    const grupos = agruparGastosDetalle(filas, { conCombustible: true });
    expect(grupos.map((g) => g.grupo)).toEqual(["DIRECTO", "COMBUSTIBLE"]);
    expect(grupos[0]).toMatchObject({ etiqueta: "Gastos directos", subtotalMxn: 40588.14, subtotalUsd: 2352.94 });
    expect(grupos[0].descripcion).toBe(DESCRIPCION_GRUPO_DIRECTO_SIN_COMBUSTIBLE);
    expect(grupos[1]).toMatchObject({ etiqueta: "Combustible", subtotalMxn: 147277.58, subtotalUsd: 8537.83, sinPesos: 0 });
    expect(grupos[1].filas.map((f) => f.id)).toEqual(["g-f1", "g-f2"]);
    expect(grupos[1].descripcion).toBe(DESCRIPCION_GRUPO_GASTO.COMBUSTIBLE);
    expect(ETIQUETA_GRUPO_GASTO.COMBUSTIBLE).toBe("Combustible");
    expect(descripcionGrupoGasto("DIRECTO", false)).toBe(DESCRIPCION_GRUPO_GASTO.DIRECTO);
    expect(descripcionGrupoGasto("INDIRECTO", true)).toBe(DESCRIPCION_GRUPO_GASTO.INDIRECTO);
  });

  it("cuadra EN CENTAVOS con la fila «Combustible» de la cascada (y los directos con la suya, ya sin combustible)", () => {
    const a = avionCombustible();
    expect(cascadaDelGrupo(a, "COMBUSTIBLE")).toEqual({ mxn: 147277.58, usd: 8537.83 });
    expect(cascadaDelGrupo(a, "DIRECTO")).toEqual({ mxn: 40588.14, usd: 2352.94 });
    const grupos = agruparGastosDetalle(filas, { conCombustible: true });
    expect(diferenciaConCascada("COMBUSTIBLE", grupos[1].subtotalMxn, 147277.58, 2)).toBeNull();
    expect(diferenciaConCascada("DIRECTO", grupos[0].subtotalMxn, 40588.14, 2)).toBeNull();
    expect(diferenciaConCascada("COMBUSTIBLE", 147300, 147277.58, 2)).toBe(22.42);
    expect(textoCuadreGrupo("COMBUSTIBLE", null, "$147,277.58 MXN")).toBe(
      "Cuadra con la fila «Combustible» de la cascada ($147,277.58 MXN).",
    );
    expect(textoCuadreGrupo("COMBUSTIBLE", 22.42, "$147,277.58 MXN")).toBe(
      "No cuadra con la fila «Combustible» de la cascada ($147,277.58 MXN): diferencia de $22.42 MXN. Avisa a sistemas.",
    );
    // API previo: no hay fila de combustible con qué cuadrar.
    expect(cascadaDelGrupo(sinCombustible(a), "COMBUSTIBLE")).toBeNull();
    expect(cascadaDelGrupo(avionBalance(), "COMBUSTIBLE")).toBeNull();
  });
});

describe("combustible separado: el histórico trae la columna «Combustible» junto a «Directos»", () => {
  const mes = (over: Partial<MesHistoricoAvion>): MesHistoricoAvion => ({
    mes: "2026-09",
    en_curso: false,
    horas_voladas_hr: 12.5,
    vuelos: 3,
    cobrado_mxn: 787851.13,
    pendiente_cobro_mxn: 0,
    comisiones_mxn: 2591,
    directos_mxn: 40588.14,
    combustible_mxn: 147277.58,
    indirectos_mxn: 13800,
    permisos_mxn: 2587.5,
    otros_mxn: 10350,
    afac_mxn: 42575.49,
    otros_ingresos_mxn: 46550.8,
    saldo_mxn: 574632.22,
    reserva_mxn: 8625,
    reserva_retenida_mxn: 3529.35,
    entregado_mxn: 0,
    pesos_sin_tc_usd: 0,
    saldo_usd: 33280.16,
    reparto: [],
    cierre_estado: "ABIERTO",
    ...over,
  });

  it("se detecta por mes o por totales; celdas y totales con «−»", () => {
    expect(historicoConCombustible([mes({})], null)).toBe(true);
    expect(historicoConCombustible([mes({ combustible_mxn: undefined })], { combustible_mxn: 147277.58 })).toBe(true);
    expect(historicoConCombustible([mes({ combustible_mxn: undefined })], { combustible_mxn: undefined })).toBe(false);
    expect(historicoConCombustible([], null)).toBe(false);
    const col = COLUMNAS_HISTORICO.find((c) => c.clave === "combustible_mxn")!;
    expect(textoCeldaHistorico(col, 147277.58)).toBe("−$147,277.58 MXN");
    expect(textoCeldaHistorico(col, undefined)).toBe("—");
    expect(filasHistorico([mes({})])[0].celdas.combustible_mxn).toBe("−$147,277.58 MXN");
    expect(filasHistorico([mes({})])[0].celdas.directos_mxn).toBe("−$40,588.14 MXN");
    expect(celdasTotalesHistorico({ ...mes({}), combustible_mxn: 294555.16 }).combustible_mxn).toBe("−$294,555.16 MXN");
  });

  it("normalización: `combustible_mxn` solo si viene (API previo ⇒ ausente, nunca un 0 inventado)", () => {
    const base = {
      aeronave: { id: AV, matricula: "N621TX", modelo: "Cessna 421C" },
      desde: "2026-09",
      hasta: "2026-09",
      mes_actual: "2026-10",
      socios: [],
      entregas: [],
    };
    const nuevo = normalizarAvionHistorico({
      ...base,
      meses: [{ mes: "2026-09", directos_mxn: "40588.14", combustible_mxn: "147277.58" }],
      totales: { directos_mxn: "40588.14", combustible_mxn: "147277.58" },
    })!;
    expect(nuevo.meses[0]).toMatchObject({ directos_mxn: 40588.14, combustible_mxn: 147277.58 });
    expect(nuevo.totales.combustible_mxn).toBe(147277.58);
    expect(historicoConCombustible(nuevo.meses, nuevo.totales)).toBe(true);
    const viejo = normalizarAvionHistorico({
      ...base,
      meses: [{ mes: "2026-09", directos_mxn: "187865.72" }],
      totales: { directos_mxn: "187865.72" },
    })!;
    expect(viejo.meses[0].directos_mxn).toBe(187865.72);
    expect("combustible_mxn" in viejo.meses[0]).toBe(false);
    expect("combustible_mxn" in viejo.totales).toBe(false);
    expect(historicoConCombustible(viejo.meses, viejo.totales)).toBe(false);
  });
});

// =============================================================================
// PANTALLA POR AVIÓN EN PESTAÑAS (23-oct-2026): «las tablas acomódalas por
// pestañas, para que no esté una tabla encima de otra y nos confundamos con
// el scroll». Qué pestañas salen, con qué conteos, `?seccion=` y las
// pastillas por grupo de «Gastos del periodo».
// =============================================================================

describe("pantalla por avión en pestañas (23-oct-2026)", () => {
  it("las pestañas con sus conteos reales, en orden; «Vuelos» solo si el API mandó el desglose", () => {
    expect(SECCIONES_PANTALLA_AVION).toEqual(["gastos", "vuelos", "socios", "entregas"]);
    expect(PARAMETRO_SECCION_AVION).toBe("seccion");
    const a = avionCombustible();
    const conDetalle = conteosPantallaAvion({
      avion: { ...a, detalle: { ...a.detalle!, vuelos: avionA().detalle!.vuelos, gastos: [gasto({}), gasto({ id: "g-2" })] } },
      entregas: [],
    });
    expect(conDetalle).toEqual({ gastos: 2, vuelos: 3, entregas: 0 });
    // API previo (sin `detalle`): ni gastos ni pestaña de vuelos.
    expect(conteosPantallaAvion({ avion: { ...a, detalle: null }, entregas: [] })).toEqual({
      gastos: 0,
      vuelos: null,
      entregas: 0,
    });
    expect(pestanasPantallaAvion({ gastos: 64, vuelos: 3, entregas: 2 })).toEqual([
      { clave: "gastos", etiqueta: "Gastos del periodo", conteo: 64 },
      { clave: "vuelos", etiqueta: "Vuelos", conteo: 3 },
      { clave: "socios", etiqueta: "Socios" },
      { clave: "entregas", etiqueta: "Entregas", conteo: 2 },
    ]);
    expect(pestanasPantallaAvion({ gastos: 0, vuelos: null, entregas: 0 }).map((p) => p.clave)).toEqual([
      "gastos",
      "socios",
      "entregas",
    ]);
  });

  it("`?seccion=` validado: una pestaña existente abre; basura, vacío o una sección sin pestaña ⇒ «Gastos del periodo»", () => {
    const con = pestanasPantallaAvion({ gastos: 1, vuelos: 1, entregas: 1 });
    expect(seccionPantallaAvionDeUrl("socios", con)).toBe("socios");
    expect(seccionPantallaAvionDeUrl("entregas", con)).toBe("entregas");
    expect(seccionPantallaAvionDeUrl("vuelos", con)).toBe("vuelos");
    expect(seccionPantallaAvionDeUrl("gastos", con)).toBe("gastos");
    expect(seccionPantallaAvionDeUrl("nada", con)).toBe("gastos");
    expect(seccionPantallaAvionDeUrl("", con)).toBe("gastos");
    expect(seccionPantallaAvionDeUrl(undefined, con)).toBe("gastos");
    expect(seccionPantallaAvionDeUrl(null, con)).toBe("gastos");
    const sinVuelos = pestanasPantallaAvion({ gastos: 1, vuelos: null, entregas: 1 });
    expect(seccionPantallaAvionDeUrl("vuelos", sinVuelos)).toBe("gastos");
  });

  it("pastillas de «Gastos del periodo»: solo los grupos con gastos, etiqueta corta, conteo y el nombre largo como tooltip", () => {
    const grupos = agruparGastosDetalle(
      [
        gasto({}),
        gasto({ id: "g-2" }),
        gasto({ id: "g-3", grupo: "COMBUSTIBLE" }),
        gasto({ id: "g-5", grupo: "EXCLUIDO", clave: "TUAS (egreso VuelaTour — Otros movimientos)" }),
      ],
      { conCombustible: true },
    );
    expect(pestanasGruposGasto(grupos)).toEqual([
      { clave: "DIRECTO", etiqueta: "Directos", conteo: 2, title: "Gastos directos" },
      { clave: "COMBUSTIBLE", etiqueta: "Combustible", conteo: 1, title: "Combustible" },
      { clave: "EXCLUIDO", etiqueta: "No restan", conteo: 1, title: "No restan al avión" },
    ]);
    expect(ETIQUETA_CORTA_GRUPO_GASTO).toEqual({
      DIRECTO: "Directos",
      COMBUSTIBLE: "Combustible",
      INDIRECTO: "Indirectos",
      PERMISO: "Permisos",
      FIJO: "Fijos",
      EXCLUIDO: "No restan",
    });
    expect(pestanasGruposGasto([])).toEqual([]);
  });
});
