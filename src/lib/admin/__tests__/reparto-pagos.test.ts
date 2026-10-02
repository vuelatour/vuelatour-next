/**
 * CUENTA CORRIENTE DE LOS SOCIOS (v2, 1-oct-2026, API 0.0.50) — fuente única
 * PURA del panel.
 *
 * Aclaración del cliente: «cuando el socio dice: necesito que me adelanten
 * 70,000 pesos de mis utilidades … que se lleve el HISTÓRICO de cuánto se le
 * ha ido repartiendo, cuánto falta por repartir, cómo se le repartió, la
 * fecha de la entrega y algún comprobante escaneado».
 *
 * Números REALES: N4142R septiembre 2026, saldo $2,023.10 a 69 / 29 / 2 % ⇒
 * 1,395.94 / 586.70 / 40.46 (residuo mayor en centavos, lo hace el API). Un
 * adelanto de 70,000 MXN a 18.5 = 3,783.78 USD sobre 1,395.94 por entregar
 * deja al socio ADELANTADO por 2,387.84. Aquí NO se recalcula nada de eso:
 * se custodian el espejo del estado, los textos, los formularios, los
 * cuerpos que viajan al API y la tolerancia al API previo.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_COLUMNAS_CUENTA,
  AYUDA_POR_MES_CUENTA,
  BOTON_GUARDAR_ADELANTO,
  BOTON_REGISTRAR_ADELANTO,
  CLAVE_PRECIERRE_SOCIOS_ADELANTADOS,
  CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR,
  ESTADOS_CUENTA_SOCIO,
  ETIQUETA_COLUMNA_ENTREGADO_POR_FECHA,
  ETIQUETA_COLUMNA_SALDO,
  ETIQUETA_COLUMNA_SALDO_ACUMULADO,
  ETIQUETA_SIN_MES,
  MES_CUENTA_DEFAULT,
  MESES_ARRANQUE_CUENTA,
  MESES_ESTADO_CUENTA_MAX,
  RUTA_PAGOS_SOCIOS,
  SIN_AVION,
  SIN_MES,
  TEXTO_A_CUENTA,
  TEXTO_CUENTA_NO_CONFIGURADA,
  TEXTO_CUENTA_NO_CONFIGURADA_LECTURA,
  TEXTO_CUENTA_NO_CONFIGURADA_PROPIA,
  avisoFechaAntesDelArranque,
  cambiosPago,
  claseTextoSaldo,
  claseTextoSaldoCorrido,
  clasificarFalloCarga,
  confirmacionAdelanto,
  confirmacionCambiarCuenta,
  confirmacionEliminarPago,
  conceptoEntregaCuenta,
  contextoEntrega,
  contextoEntregaDeEstadoCuenta,
  cuentaCambia,
  destinoFiltroMeses,
  detalleExcesoSaldo,
  diaAntesDelArranque,
  errorPideRefrescar,
  escondeEntregasAntesDelArranque,
  esClavePrecierreSocios,
  esMesValido,
  esRenglonDeSaldo,
  estadoCuentaSocio,
  estiloEstadoCuenta,
  etiquetaGeneroPeriodo,
  etiquetaMes,
  etiquetaRegistrarEntrega,
  filasSociosPorEntregar,
  filtroMesesCuenta,
  formAlCambiarMoneda,
  formDeCuenta,
  formDePago,
  formInicialAlta,
  generadoPorSocioEnPeriodo,
  hayErrores,
  hintMontoPago,
  hintTcPago,
  hrefCuentaSocio,
  hrefPrecierreSocios,
  importesMovimiento,
  kpiSaldoCuenta,
  leerNumero,
  lineasPreCierreSocios,
  marcaSaldoAdelantado,
  mensajeErrorCuentaSocio,
  mesActual,
  mesAnterior,
  mesDeFecha,
  mesDePeriodo,
  mesesDeRango,
  mesParaVerEntregasPrevias,
  normalizarEstadoCuenta,
  normalizarPago,
  normalizarRespuestaSocios,
  notaPreCierreSocios,
  opcionesCorrespondeAvion,
  opcionesCorrespondeMes,
  opcionesEntrego,
  opcionesFiltroMeses,
  opcionesMesArranque,
  pasoTrasGuardarEntrega,
  payloadAltaPago,
  payloadCuenta,
  piezasPago,
  puedeRegistrarEntregas,
  puedeVerCuentasSocios,
  rangoMesPasado,
  sociosSinConfigurar,
  sumarMeses,
  textoContadorMotivo,
  textoCorrespondeA,
  textoCuentaNoConfigurada,
  textoEntregasAntesDelArranque,
  textoMesEnCurso,
  textoMontoPago,
  textoPorEntregarHoy,
  textoSociosSinConfigurar,
  textoUltimoPago,
  validarFormCuenta,
  validarFormPago,
  validarMotivoBaja,
  type FormPagoSocio,
} from "../reparto-pagos";
import type { CuentaSocio, PagoSocio, ResumenCuentaSocio } from "@/types/reparto-pagos";

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const ACC = "50c10000-0000-4000-8000-000000000002";
const SAAB = "50c10000-0000-4000-8000-000000000003";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const N990GG = "a1a1a1a1-0000-4000-8000-000000000002";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const ITZI = { id: "0f1c0000-0000-4000-8000-000000000010", nombre: "Itzi" };

const CUENTA_DEFAULT: CuentaSocio = {
  cuenta_desde: "2026-09",
  saldo_inicial_usd: 0,
  notas: null,
  configurada: false,
};

const resumen = (over: Partial<ResumenCuentaSocio> = {}): ResumenCuentaSocio => ({
  socio: { id: MAURICIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "ACTIVO" },
  cuenta: CUENTA_DEFAULT,
  generado_usd: 1395.94,
  mes_en_curso_usd: 0,
  entregado_usd: 0,
  por_entregar_usd: 1395.94,
  estado: "POR_ENTREGAR",
  ultimo_pago: null,
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, activa: true }],
  ...over,
});

/** El adelanto del audio: 70,000 MXN a 18.5 ⇒ 3,783.78 USD (lo calcula el API). */
const ADELANTO: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  socio_id: MAURICIO,
  aeronave_id: null,
  periodo: null,
  mes: null,
  monto: 70000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 3783.78,
  utilidad_snapshot_usd: null,
  saldo_snapshot_usd: 1395.94,
  fecha_pago: "2026-10-01",
  metodo: "EFECTIVO",
  referencia: null,
  entregado_por: ALE.id,
  entregado_por_nombre: "Alejandro Canales",
  recibido_por: "Su esposa",
  factura_folio: null,
  comprobante_path: null,
  comprobante_url: null,
  notas: null,
  created_by: ITZI.id,
  created_by_nombre: "Itzi",
  created_at: "2026-10-01T17:30:00Z",
  aeronave: null,
};

const formValido = (over: Partial<FormPagoSocio> = {}): FormPagoSocio => ({
  ...formInicialAlta({ porEntregarUsd: 1395.94, hoy: "2026-10-01", meId: ALE.id }),
  metodo: "TRANSFERENCIA",
  ...over,
});

describe("meses", () => {
  it("valida, corta y suma meses (cruzando el año)", () => {
    expect(esMesValido("2026-09")).toBe(true);
    expect(esMesValido("2026-13")).toBe(false);
    expect(esMesValido("2026-9")).toBe(false);
    expect(mesDeFecha("2026-09-01")).toBe("2026-09");
    expect(mesDeFecha("2026-09")).toBe("2026-09");
    expect(mesDeFecha("nada")).toBeNull();
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(mesActual("2026-10-01")).toBe("2026-10");
    expect(mesAnterior("2026-01-15")).toBe("2025-12");
  });

  it("mesesDeRango inclusivo, en orden; invertido ⇒ []", () => {
    expect(mesesDeRango("2026-09", "2026-12")).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(mesesDeRango("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesDeRango("2026-10", "2026-09")).toEqual([]);
    expect(mesesDeRango("x", "2026-09")).toEqual([]);
  });

  it("mes completo y atajo «Mes pasado» (el cliente cierra septiembre en octubre)", () => {
    expect(mesDePeriodo("2026-09-01", "2026-09-30")).toBe("2026-09");
    expect(mesDePeriodo("2026-10-01", "2026-10-01")).toBeNull();
    expect(rangoMesPasado("2026-10-01")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });

  it("etiqueta «Septiembre 2026»", () => {
    expect(etiquetaMes("2026-09")).toBe("Septiembre 2026");
    expect(etiquetaMes("nada")).toBe("nada");
  });

  it("arranque de la cuenta: los últimos 36 meses (espejo del API), del más reciente al más viejo", () => {
    const op = opcionesMesArranque("2026-10-01");
    expect(MESES_ARRANQUE_CUENTA).toBe(36);
    expect(op).toHaveLength(36);
    expect(op[0]).toEqual({ value: "2026-10", label: "Octubre 2026" });
    expect(op[35].value).toBe("2023-11");
    // El mes que ya tiene la cuenta se ofrece aunque esté fuera de la ventana.
    const conViejo = opcionesMesArranque("2026-10-01", "2022-01");
    expect(conViejo.at(-1)?.value).toBe("2022-01");
  });

  it("filtro desde/hasta de la URL: inválido se ignora, invertido se endereza", () => {
    expect(filtroMesesCuenta("2026-09", "2026-10")).toEqual({ desde: "2026-09", hasta: "2026-10" });
    expect(filtroMesesCuenta("2026-10", "2026-09")).toEqual({ desde: "2026-09", hasta: "2026-10" });
    expect(filtroMesesCuenta("nada", "2026-13")).toEqual({ desde: undefined, hasta: undefined });
  });

  it("filtro: lo que el API rechazaría con 400 RANGO_INVALIDO se corrige ANTES de pedirlo", () => {
    // Un `desde` FUTURO (hoy es oct-2026) se recorta al mes en curso.
    expect(filtroMesesCuenta("2026-12", undefined, "2026-10")).toEqual({ desde: "2026-10", hasta: undefined });
    expect(filtroMesesCuenta("2026-09", "2027-03", "2026-10")).toEqual({ desde: "2026-09", hasta: "2026-10" });
    expect(filtroMesesCuenta("2027-01", "2027-03", "2026-10")).toEqual({ desde: "2026-10", hasta: "2026-10" });
    // Un `hasta` SUELTO (anterior al arranque, que aquí no se conoce) se descarta.
    expect(filtroMesesCuenta(undefined, "2026-08", "2026-10")).toEqual({ desde: undefined, hasta: undefined });
    expect(filtroMesesCuenta(undefined, "2026-08")).toEqual({ desde: undefined, hasta: undefined });
    // Más de 120 meses: el `desde` sube al tope del API.
    expect(MESES_ESTADO_CUENTA_MAX).toBe(120);
    expect(filtroMesesCuenta("2010-01", undefined, "2026-10")).toEqual({ desde: "2016-11", hasta: undefined });
    expect(filtroMesesCuenta("2010-01", "2020-01", "2026-10")).toEqual({ desde: "2010-02", hasta: "2020-01" });
    // Sin mes de hoy no se recorta nada (solo formato y orden).
    expect(filtroMesesCuenta("2027-01", undefined)).toEqual({ desde: "2027-01", hasta: undefined });
  });

  it("selector Desde/Hasta: opciones desde el mes más viejo (arranque · lo que se ve · entrega previa) y destino sin rango invertido", () => {
    const base = opcionesFiltroMeses({ cuentaDesdeMes: "2026-09", mesActual: "2026-10" });
    expect(base).toEqual([
      { value: "2026-10", label: "Octubre 2026" },
      { value: "2026-09", label: "Septiembre 2026" },
    ]);
    // Una entrega fechada en sep-2025 (antes del arranque) se alcanza.
    const conPrevia = opcionesFiltroMeses({ cuentaDesdeMes: "2026-09", mesActual: "2026-10", mesMinimo: "2025-09" });
    expect(conPrevia.at(-1)).toEqual({ value: "2025-09", label: "Septiembre 2025" });
    expect(conPrevia).toHaveLength(14);
    // El `desde` que se está viendo (de la URL) nunca queda fuera de la lista.
    expect(opcionesFiltroMeses({ cuentaDesdeMes: "2026-09", desde: "2026-03", mesActual: "2026-10" }).at(-1)?.value).toBe(
      "2026-03",
    );
    // Arranque futuro (dato raro): solo el mes en curso.
    expect(opcionesFiltroMeses({ cuentaDesdeMes: "2027-01", mesActual: "2026-10" })).toHaveLength(1);
    // Tope del API.
    expect(opcionesFiltroMeses({ cuentaDesdeMes: "2001-01", mesActual: "2026-10" })).toHaveLength(120);

    expect(destinoFiltroMeses("desde", "2026-08", "2026-09", "2026-10")).toEqual({ desde: "2026-08", hasta: "2026-10" });
    expect(destinoFiltroMeses("desde", "2026-10", "2026-08", "2026-09")).toEqual({ desde: "2026-10", hasta: "2026-10" });
    expect(destinoFiltroMeses("hasta", "2026-08", "2026-09", "2026-10")).toEqual({ desde: "2026-08", hasta: "2026-08" });
    expect(destinoFiltroMeses("hasta", "2026-10", "2026-09", "2026-09")).toEqual({ desde: "2026-09", hasta: "2026-10" });
  });
});

describe("estado de la cuenta (lo manda el API; esto solo pinta)", () => {
  it("colores: al corriente verde, por entregar ámbar, ADELANTADO azul «Adelantado»", () => {
    expect(ESTADOS_CUENTA_SOCIO.AL_CORRIENTE.tono).toBe("verde");
    expect(ESTADOS_CUENTA_SOCIO.POR_ENTREGAR.tono).toBe("ambar");
    expect(ESTADOS_CUENTA_SOCIO.ADELANTADO).toMatchObject({ tono: "azul", etiqueta: "Adelantado" });
    expect(ESTADOS_CUENTA_SOCIO.ADELANTADO.clase).toContain("sky");
  });

  it("el estado del API manda; uno desconocido se pinta con el espejo (tolerancia $1)", () => {
    expect(estiloEstadoCuenta("POR_ENTREGAR", -5000).estado).toBe("POR_ENTREGAR");
    expect(estiloEstadoCuenta("NUEVO", 1.01).estado).toBe("POR_ENTREGAR");
    expect(estiloEstadoCuenta(null, -2387.84).estado).toBe("ADELANTADO");
    expect(estadoCuentaSocio(1)).toBe("AL_CORRIENTE");
    expect(estadoCuentaSocio(-1)).toBe("AL_CORRIENTE");
    expect(estadoCuentaSocio(1.01)).toBe("POR_ENTREGAR");
    expect(estadoCuentaSocio(-1.01)).toBe("ADELANTADO");
  });

  it("el color del saldo sale del ESTADO, no de un umbral propio", () => {
    expect(claseTextoSaldo("POR_ENTREGAR", 0)).toContain("amber");
    expect(claseTextoSaldo("ADELANTADO", 0)).toContain("sky");
    expect(claseTextoSaldo("AL_CORRIENTE", 500)).toBe("");
  });

  it("saldo corrido de un renglón (sin estado del API): el espejo con la tolerancia de $1", () => {
    expect(claseTextoSaldoCorrido(-2387.84)).toContain("sky");
    expect(claseTextoSaldoCorrido(1395.94)).toContain("amber");
    expect(claseTextoSaldoCorrido(-0.5)).toBe("");
    expect(claseTextoSaldoCorrido(0)).toBe("");
  });

  it("KPI del saldo: ADELANTADO dice «Adelantado (a favor de VuelaTour)» SIN signo; si no, «Por entregar hoy»", () => {
    expect(kpiSaldoCuenta("ADELANTADO", -2387.84)).toEqual({
      etiqueta: "Adelantado (a favor de VuelaTour)",
      monto: 2387.84,
      adelantado: true,
    });
    expect(kpiSaldoCuenta("POR_ENTREGAR", 1395.94)).toEqual({
      etiqueta: "Por entregar hoy",
      monto: 1395.94,
      adelantado: false,
    });
    expect(kpiSaldoCuenta("AL_CORRIENTE", -0.4).etiqueta).toBe("Por entregar hoy");
    // Estado desconocido: el espejo decide.
    expect(kpiSaldoCuenta(null, -10).adelantado).toBe(true);
  });

  it("tablas: la columna es «Saldo por entregar» (conserva el signo) y un ADELANTADO lleva la marca «adelantado»", () => {
    expect(ETIQUETA_COLUMNA_SALDO).toBe("Saldo por entregar");
    expect(ETIQUETA_COLUMNA_SALDO_ACUMULADO).toBe("Saldo por entregar (acumulado)");
    expect(marcaSaldoAdelantado("ADELANTADO", -2387.84)).toBe("adelantado");
    expect(marcaSaldoAdelantado("POR_ENTREGAR", 586.7)).toBeNull();
    expect(marcaSaldoAdelantado("AL_CORRIENTE", 0)).toBeNull();
  });
});

describe("textos", () => {
  it("banner de la cuenta sin configurar: copia LITERAL del API", () => {
    expect(TEXTO_CUENTA_NO_CONFIGURADA).toBe(
      "La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, configura el mes de arranque y el saldo inicial.",
    );
    expect(MES_CUENTA_DEFAULT).toBe("2026-09");
    expect(textoSociosSinConfigurar(0)).toBeNull();
    expect(textoSociosSinConfigurar(1)).toContain("1 socio tiene la cuenta sin configurar");
    expect(textoSociosSinConfigurar(7)).toContain("7 socios tienen");
  });

  it("cuenta sin configurar SEGÚN QUIÉN LA VE: la instrucción solo a quien puede configurarla", () => {
    expect(textoCuentaNoConfigurada({ puedeConfigurar: true })).toBe(TEXTO_CUENTA_NO_CONFIGURADA);
    expect(textoCuentaNoConfigurada({ puedeConfigurar: true, esPropia: true })).toBe(TEXTO_CUENTA_NO_CONFIGURADA);
    expect(textoCuentaNoConfigurada({ puedeConfigurar: false })).toBe(TEXTO_CUENTA_NO_CONFIGURADA_LECTURA);
    expect(textoCuentaNoConfigurada({ puedeConfigurar: false, esPropia: true })).toBe(
      TEXTO_CUENTA_NO_CONFIGURADA_PROPIA,
    );
    expect(TEXTO_CUENTA_NO_CONFIGURADA_PROPIA).toBe(
      "Tu cuenta arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta.",
    );
    for (const t of [TEXTO_CUENTA_NO_CONFIGURADA_LECTURA, TEXTO_CUENTA_NO_CONFIGURADA_PROPIA]) {
      expect(t).not.toMatch(/configura el mes/);
    }
  });

  it("«Por entregar hoy» y, con saldo negativo, el adelanto a favor de VuelaTour", () => {
    expect(textoPorEntregarHoy(1395.94)).toBe("Por entregar hoy: $1,395.94 USD");
    expect(textoPorEntregarHoy(0.4)).toBe("Por entregar hoy: $0.40 USD");
    expect(textoPorEntregarHoy(-2387.84)).toBe(
      "Adelantado: $2,387.84 USD a favor de VuelaTour (no hay nada por entregar).",
    );
    expect(textoPorEntregarHoy(null)).toContain("no se pudo leer");
  });

  it("mes en curso: «incluye $X de Octubre 2026 (en curso…)»; con 0 no se dice", () => {
    expect(textoMesEnCurso(206.1, "2026-10")).toBe(
      "incluye $206.10 de Octubre 2026 (en curso: cambia día con día)",
    );
    expect(textoMesEnCurso(0, "2026-10")).toBeNull();
  });

  it("columna «Generó …» del reparto: mes completo o rango", () => {
    expect(etiquetaGeneroPeriodo("2026-09-01", "2026-09-30")).toBe("Generó en Septiembre 2026");
    expect(etiquetaGeneroPeriodo("2026-10-01", "2026-10-15")).toMatch(/^Generó del 01 oct\.? 2026 al 15 oct\.? 2026$/);
  });

  it("monto de la entrega: el adelanto de 70,000 MXN dice T.C. y su equivalente del API", () => {
    expect(textoMontoPago(ADELANTO)).toBe("$70,000 MXN · T.C. 18.5 · ≈ $3,783.78 USD");
    expect(textoMontoPago({ ...ADELANTO, moneda: "USD", monto: 1000, monto_usd: 1000, tc_usd_mxn: null })).toBe(
      "$1,000 USD",
    );
  });

  it("«Corresponde a» es informativo; sin mes ni avión es «A cuenta (sin mes)» (la palabra «adelanto» es del saldo negativo)", () => {
    expect(textoCorrespondeA(ADELANTO)).toBe("A cuenta (sin mes)");
    expect(TEXTO_A_CUENTA).toBe("A cuenta (sin mes)");
    expect(conceptoEntregaCuenta(ADELANTO)).toBe("Entrega a cuenta (sin mes)");
    expect(conceptoEntregaCuenta({ periodo: null, mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" } })).toBe(
      "Entrega · corresponde a Septiembre 2026 · N4142R",
    );
    expect(conceptoEntregaCuenta({ periodo: null, mes: null, aeronave: { id: N4142R, matricula: "N4142R" } })).toBe(
      "Entrega · corresponde a N4142R",
    );
    for (const t of [textoCorrespondeA(ADELANTO), conceptoEntregaCuenta(ADELANTO)]) {
      expect(t.toLowerCase()).not.toContain("adelanto");
    }
    expect(
      textoCorrespondeA({ periodo: "2026-09-01", mes: null, aeronave: { id: N4142R, matricula: "N4142R" } }),
    ).toBe("Corresponde a Septiembre 2026 · N4142R");
    expect(textoCorrespondeA({ periodo: null, mes: "2026-09", aeronave: null })).toBe(
      "Corresponde a Septiembre 2026",
    );
  });

  it("piezas de la entrega: método, entregó, recibió, registró (nunca un uuid)", () => {
    const p = piezasPago(ADELANTO);
    expect(p.metodo).toBe("Efectivo");
    expect(p.entrego).toBe("Entregó: Alejandro Canales");
    expect(p.recibio).toBe("Recibió: Su esposa");
    expect(p.factura).toBeNull();
    expect(p.referencia).toBeNull();
    expect(p.registro).toMatch(/^Registró Itzi · /);
    expect(piezasPago({ ...ADELANTO, entregado_por_nombre: null }).entrego).toBe("Entregó: —");
  });

  it("última entrega", () => {
    expect(textoUltimoPago(null)).toBe("Sin entregas");
    expect(
      textoUltimoPago({
        id: ADELANTO.id,
        fecha_pago: "2026-10-01",
        monto: 70000,
        moneda: "MXN",
        monto_usd: 3783.78,
        metodo: "EFECTIVO",
      }),
    ).toMatch(/^01 oct\.? 2026 · \$70,000 MXN · Efectivo$/);
  });

  it("«Por mes»: la columna dice que agrupa por FECHA de entrega (no por el mes al que corresponde)", () => {
    expect(ETIQUETA_COLUMNA_ENTREGADO_POR_FECHA).toBe("Entregado (por fecha de entrega)");
    expect(AYUDA_POR_MES_CUENTA).toBe(
      "Lo que generó el socio cada mes con sus aviones y lo que se le entregó en ese mes calendario (no necesariamente por ese mes; el saldo está en Movimientos).",
    );
  });

  it("columnas del estado de cuenta en palabras del operador", () => {
    expect(AYUDA_COLUMNAS_CUENTA).toContain("Generó");
    expect(AYUDA_COLUMNAS_CUENTA).toContain("Entregado");
    expect(etiquetaRegistrarEntrega("Mauricio Roque")).toBe("Registrar entrega a Mauricio Roque");
  });
});

describe("confirmación del ADELANTO (409 PAGO_EXCEDE_SALDO)", () => {
  const details = { por_entregar_usd: 1395.94, monto_usd: 3783.78, exceso_usd: 2387.84 };

  it("texto del contrato con los TRES números del API", () => {
    expect(confirmacionAdelanto(details)).toEqual({
      titulo: "Esta entrega es un ADELANTO",
      descripcion:
        "Esta entrega de $3,783.78 USD supera lo que hay por entregar ($1,395.94 USD). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour por $2,387.84 USD. ¿Registrar?",
    });
  });

  it("en la edición pregunta «¿Guardar?»; ya adelantado no dice «por entregar −$X»", () => {
    expect(confirmacionAdelanto(details, "edicion").descripcion).toMatch(/¿Guardar\?$/);
    const ya = confirmacionAdelanto({ por_entregar_usd: -100, monto_usd: 500, exceso_usd: 600 });
    expect(ya.descripcion).toContain("supera lo que hay por entregar ($0 USD)");
    expect(ya.descripcion).toContain("a favor de VuelaTour por $600 USD");
  });

  it("details tolerantes (numeric como texto) y sin details un texto sin números", () => {
    expect(detalleExcesoSaldo({ por_entregar_usd: "1395.94", monto_usd: "3783.78", exceso_usd: "2387.84" })).toEqual(
      details,
    );
    expect(detalleExcesoSaldo({ monto_usd: 1 })).toBeNull();
    expect(confirmacionAdelanto(null).descripcion).toContain("Se registrará como ADELANTO");
    expect(BOTON_REGISTRAR_ADELANTO).toBe("Registrar como adelanto");
    expect(BOTON_GUARDAR_ADELANTO).toBe("Guardar como adelanto");
  });

  it("después de guardar: 409 ⇒ adelanto; borrado por otro ⇒ refrescar; alta ⇒ paso del comprobante", () => {
    expect(pasoTrasGuardarEntrega(null, "edicion")).toEqual({ paso: "sin-cambios" });
    expect(
      pasoTrasGuardarEntrega({ ok: false, code: "PAGO_EXCEDE_SALDO", details, error: "x" }, "alta"),
    ).toEqual({ paso: "adelanto", details });
    expect(pasoTrasGuardarEntrega({ ok: false, code: "PAGO_NO_EXISTE", error: "Ya no existe" }, "edicion")).toEqual({
      paso: "refrescar",
      mensaje: "Ya no existe",
    });
    expect(pasoTrasGuardarEntrega({ ok: false, code: "TC_FUERA_DE_RANGO", error: "Revisa" }, "alta")).toEqual({
      paso: "error",
      mensaje: "Revisa",
    });
    const resultado = { pago: ADELANTO, cuenta: null };
    expect(pasoTrasGuardarEntrega({ ok: true, data: resultado }, "alta")).toEqual({
      paso: "comprobante",
      resultado,
    });
    expect(pasoTrasGuardarEntrega({ ok: true, data: resultado }, "edicion")).toEqual({ paso: "cerrar" });
  });

  it("baja: confirmación con motivo 5–300 y contador que dice el mínimo", () => {
    const c = confirmacionEliminarPago(ADELANTO, "Mauricio Roque");
    expect(c.titulo).toBe("¿Eliminar esta entrega?");
    expect(c.descripcion).toContain("$70,000 MXN");
    expect(c.descripcion).toContain("a Mauricio Roque");
    expect(c.boton).toBe("Eliminar entrega");
    expect(validarMotivoBaja("abc")).toMatch(/al menos 5/);
    expect(validarMotivoBaja("Se capturó dos veces")).toBeNull();
    expect(validarMotivoBaja("x".repeat(301))).toMatch(/Máximo 300/);
    expect(textoContadorMotivo("abc")).toEqual({ texto: "3/300 · mínimo 5", falta: true });
    expect(textoContadorMotivo("abcdef")).toEqual({ texto: "6/300", falta: false });
  });
});

describe("errores del API en es-MX", () => {
  it("los códigos que el panel resuelve solo ganan al texto del API", () => {
    expect(mensajeErrorCuentaSocio("PAGO_NO_EXISTE", "Ese pago no existe. Recarga la página.", 404)).toContain(
      "Actualizamos la lista",
    );
    expect(mensajeErrorCuentaSocio("CLIENT_REQUEST_ID_EN_USO", "La llave client_request_id…", 409)).toContain(
      "vuelve a abrirlo",
    );
    expect(mensajeErrorCuentaSocio("SIN_CONEXION", null)).toContain("No hay conexión");
    expect(errorPideRefrescar("PAGO_CAMBIO_CONCURRENTE")).toBe(true);
    expect(errorPideRefrescar("PAGO_EXCEDE_SALDO")).toBe(false);
  });

  it("un texto del API en español se respeta; en inglés o técnico se cambia", () => {
    expect(mensajeErrorCuentaSocio("SOCIO_NO_ES_DE_LA_AERONAVE", "Ese socio no es del N4142R.", 400)).toBe(
      "Ese socio no es del N4142R.",
    );
    expect(mensajeErrorCuentaSocio("SOCIO_INVALIDO", "socio_id must be a UUID", 400)).toContain(
      "no está registrada como socia",
    );
    expect(mensajeErrorCuentaSocio("CUENTA_SOCIO_NO_DISPONIBLE", "Service Unavailable", 503)).toContain(
      "No se guardó nada",
    );
    expect(mensajeErrorCuentaSocio(undefined, "Cannot PUT /v1/profit-sharing/socios/x/cuenta", 404)).toContain(
      "falta actualizarlo",
    );
    expect(mensajeErrorCuentaSocio(undefined, "property x should not exist", 400)).toContain("rechazó un dato");
    expect(mensajeErrorCuentaSocio(undefined, "Forbidden", 403)).toContain("no tiene permiso");
    expect(mensajeErrorCuentaSocio("X", "Internal server error", 500)).toContain("error 500");
  });

  it("clasificar la LECTURA: API previo / sin migración / sin permiso / no existe / fallo", () => {
    expect(clasificarFalloCarga(401, null)).toBe("sin-permiso");
    expect(clasificarFalloCarga(403, "SOCIO_SOLO_SU_CUENTA")).toBe("sin-permiso");
    expect(clasificarFalloCarga(503, "CUENTA_SOCIO_NO_DISPONIBLE")).toBe("no-disponible");
    expect(clasificarFalloCarga(503, "PAGOS_SOCIOS_NO_DISPONIBLE")).toBe("no-disponible");
    expect(clasificarFalloCarga(404, "NOT_FOUND", "Cannot GET /v1/profit-sharing/socios")).toBe(
      "no-disponible",
    );
    expect(clasificarFalloCarga(404, "SOCIO_NO_EXISTE", "Ese socio no existe")).toBe("no-existe");
    // Un 503 a secas es Railway desplegando: es un FALLO, no «falta la migración».
    expect(clasificarFalloCarga(503, null)).toBe("error");
    expect(clasificarFalloCarga(500, "X")).toBe("error");
    expect(clasificarFalloCarga(null, null)).toBe("error");
  });
});

describe("normalización (PostgREST manda numeric como texto)", () => {
  it("resumen: números sanos, cuenta `YYYY-MM-01` ⇒ `YYYY-MM`, renglón sin socio fuera", () => {
    const r = normalizarRespuestaSocios({
      disponible: true,
      hasta_mes: "2026-10",
      socios: [
        {
          socio: { id: MAURICIO, nombre: "Mauricio Roque" },
          cuenta: { cuenta_desde: "2026-09-01", saldo_inicial_usd: "-500", notas: null, configurada: true },
          generado_usd: "1395.94",
          mes_en_curso_usd: "0",
          entregado_usd: "3783.78",
          por_entregar_usd: "-2887.84",
          estado: "ADELANTADO",
          ultimo_pago: { id: ADELANTO.id, fecha_pago: "2026-10-01", monto: "70000", moneda: "MXN", monto_usd: "3783.78", metodo: "EFECTIVO" },
          aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: "69", vigente: true }],
          avisos: ["Hay 1 entrega(s) con fecha anterior al arranque", 3],
        },
        { cuenta: {} },
      ],
      totales: { generado_usd: "1395.94", entregado_usd: 3783.78, por_entregar_usd: 0, adelantado_usd: "2887.84", socios_por_entregar: 0, socios_adelantados: 1 },
    });
    expect(r?.socios).toHaveLength(1);
    const s = r!.socios[0];
    expect(s.cuenta).toEqual({
      cuenta_desde: "2026-09",
      saldo_inicial_usd: -500,
      notas: null,
      configurada: true,
      updated_at: null,
    });
    expect(s.por_entregar_usd).toBe(-2887.84);
    expect(s.ultimo_pago?.monto).toBe(70000);
    expect(s.aviones[0]).toEqual({ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, activa: true });
    expect(s.avisos).toEqual(["Hay 1 entrega(s) con fecha anterior al arranque"]);
    expect(r?.totales?.adelantado_usd).toBe(2887.84);
  });

  it("SOCIO: totales null; sin la migración `disponible:false`; basura ⇒ null (fallo, no «sin socios»)", () => {
    expect(normalizarRespuestaSocios({ disponible: true, socios: [], totales: null })?.totales).toBeNull();
    expect(normalizarRespuestaSocios({ disponible: false, socios: [] })?.disponible).toBe(false);
    expect(normalizarRespuestaSocios(null)).toBeNull();
    expect(normalizarRespuestaSocios([1])).toBeNull();
  });

  it("entrega: `mes` sale de `periodo` si el API no lo manda; aeronave del «corresponde a»", () => {
    const p = normalizarPago({
      ...ADELANTO,
      monto: "70000",
      monto_usd: "3783.78",
      tc_usd_mxn: "18.500000",
      saldo_snapshot_usd: "1395.94",
      periodo: "2026-09-01",
      mes: undefined,
      aeronave: { id: N4142R, matricula: "N4142R" },
      fecha_pago: "2026-10-01T00:00:00",
    });
    expect(p).toMatchObject({
      monto: 70000,
      monto_usd: 3783.78,
      tc_usd_mxn: 18.5,
      saldo_snapshot_usd: 1395.94,
      mes: "2026-09",
      fecha_pago: "2026-10-01",
      aeronave: { id: N4142R, matricula: "N4142R" },
    });
    expect(normalizarPago({ monto: 1 })).toBeNull();
  });

  it("estado de cuenta: movimientos, por mes, totales de HOY, aviones, rango y avisos", () => {
    const e = normalizarEstadoCuenta({
      disponible: true,
      socio: { id: MAURICIO, nombre: "Mauricio Roque" },
      cuenta: { cuenta_desde: "2026-09", saldo_inicial_usd: 0, notas: null, configurada: false },
      aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, activa: true }],
      desde: "2026-09",
      hasta: "2026-10",
      saldo_anterior_usd: 0,
      movimientos: [
        { fecha: "2026-09-01", tipo: "SALDO_INICIAL", concepto: "Arranque", mes: "2026-09", cargo_usd: 0, abono_usd: 0, saldo_usd: 0 },
        { fecha: "2026-09-30", tipo: "UTILIDAD", concepto: "Utilidad sep 2026 · N4142R 69 %", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: "69", cargo_usd: "1395.94", abono_usd: 0, saldo_usd: "1395.94", en_curso: false },
        { fecha: "2026-10-01", tipo: "ENTREGA", concepto: "Adelanto a cuenta · Efectivo", mes: null, cargo_usd: 0, abono_usd: 3783.78, saldo_usd: -2387.84, pago: ADELANTO },
        { sin: "tipo" },
      ],
      por_mes: [
        { mes: "2026-09", utilidad_usd: "1395.94", en_curso: false, por_avion: [{ aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, monto_usd: "1395.94" }], entregado_usd: 0 },
        { mes: "2026-10", utilidad_usd: 0, en_curso: true, por_avion: [], entregado_usd: 3783.78 },
      ],
      totales: { generado_usd: 1395.94, mes_en_curso_usd: 0, entregado_usd: 3783.78, por_entregar_usd: -2387.84, estado: "ADELANTADO" },
      rango: { generado_usd: 1395.94, entregado_usd: 3783.78, saldo_final_usd: -2387.84 },
      avisos: [],
    });
    expect(e?.movimientos.map((m) => m.tipo)).toEqual(["SALDO_INICIAL", "UTILIDAD", "ENTREGA"]);
    expect(e?.movimientos[1]).toMatchObject({ cargo_usd: 1395.94, porcentaje: 69, saldo_usd: 1395.94 });
    expect(e?.movimientos[2].pago?.id).toBe(ADELANTO.id);
    expect(e?.por_mes[1]).toMatchObject({ mes: "2026-10", en_curso: true, entregado_usd: 3783.78 });
    expect(e?.totales).toMatchObject({ por_entregar_usd: -2387.84, estado: "ADELANTADO" });
    expect(e?.aviones).toHaveLength(1);
    expect(e?.rango?.saldo_final_usd).toBe(-2387.84);
    expect(normalizarEstadoCuenta({ disponible: false })).toBeNull();
  });

  it("importes con la convención del API: cargo SUMA (negativo en pérdida), abono RESTA; 0 ⇒ celda vacía", () => {
    expect(importesMovimiento({ cargo_usd: 1395.94, abono_usd: 0 })).toEqual({ suma: 1395.94, resta: null });
    expect(importesMovimiento({ cargo_usd: 0, abono_usd: 3783.78 })).toEqual({ suma: null, resta: 3783.78 });
    expect(importesMovimiento({ cargo_usd: -120.5, abono_usd: 0 })).toEqual({ suma: -120.5, resta: null });
    expect(importesMovimiento({ cargo_usd: 0, abono_usd: 0 })).toEqual({ suma: null, resta: null });
    expect(esRenglonDeSaldo("SALDO_ANTERIOR")).toBe(true);
    expect(esRenglonDeSaldo("ENTREGA")).toBe(false);
  });
});

describe("qué pinta cada pantalla", () => {
  it("«Generó en el periodo» SUMA (en centavos) lo que ya está en las tarjetas: N4142R 69/29/2 + otro avión", () => {
    const g = generadoPorSocioEnPeriodo([
      {
        reparto: [
          { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 69, monto_usd: 1395.94 },
          { socio_id: ACC, socio_nombre: "Aero Charter Cancun S.A. de C.V.", porcentaje: 29, monto_usd: 586.7 },
          { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 2, monto_usd: 40.46 },
        ],
      },
      { reparto: [{ socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 50, monto_usd: 0.1 }] },
      { reparto: [{ socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 50, monto_usd: 0.2 }] },
    ]);
    expect(g.get(MAURICIO)).toBe(1396.24);
    expect(g.get(ACC)).toBe(586.7);
    expect(g.get(SAAB)).toBe(40.46);
  });

  it("renglones de «Socios · por entregar»: TODOS los del resumen, 0 si no generó en el periodo", () => {
    const otro = resumen({ socio: { id: ACC, nombre: "Aero Charter" }, por_entregar_usd: 0, estado: "AL_CORRIENTE" });
    const filas = filasSociosPorEntregar([resumen(), otro], new Map([[MAURICIO, 1395.94]]));
    expect(filas.map((f) => [f.resumen.socio.id, f.genero_periodo_usd])).toEqual([
      [MAURICIO, 1395.94],
      [ACC, 0],
    ]);
    expect(sociosSinConfigurar([resumen(), resumen({ cuenta: { ...CUENTA_DEFAULT, configurada: true } })])).toBe(1);
  });

  it("contexto del diálogo: desde el resumen y desde el estado de cuenta (sus totales son los de HOY)", () => {
    expect(contextoEntrega(resumen())).toEqual({
      socio: { id: MAURICIO, nombre: "Mauricio Roque" },
      porEntregarUsd: 1395.94,
      mesEnCursoUsd: 0,
      mesEnCurso: null,
      aviones: resumen().aviones,
      cuentaDesdeMes: "2026-09",
      mesSugerido: null,
    });
    // Desde el Reparto con «Mes pasado»: el mes que se está pagando y el en curso.
    expect(
      contextoEntrega(resumen({ mes_en_curso_usd: 206.1, por_entregar_usd: 1602.04 }), {
        mesEnCurso: "2026-10",
        mesSugerido: "2026-09",
      }),
    ).toMatchObject({ porEntregarUsd: 1602.04, mesEnCursoUsd: 206.1, mesEnCurso: "2026-10", mesSugerido: "2026-09" });
    expect(contextoEntrega(resumen(), { mesEnCurso: "nada", mesSugerido: "2026-13" })).toMatchObject({
      mesEnCurso: null,
      mesSugerido: null,
    });
    const e = normalizarEstadoCuenta({
      socio: { id: MAURICIO, nombre: "Mauricio Roque" },
      cuenta: { cuenta_desde: "2026-08", configurada: true },
      desde: "2026-08",
      hasta: "2026-08",
      movimientos: [],
      por_mes: [],
      totales: { por_entregar_usd: -2387.84, mes_en_curso_usd: "206.10", estado: "ADELANTADO" },
    })!;
    expect(contextoEntregaDeEstadoCuenta(e, { mesEnCurso: "2026-10" })).toEqual({
      socio: { id: MAURICIO, nombre: "Mauricio Roque" },
      porEntregarUsd: -2387.84,
      mesEnCursoUsd: 206.1,
      mesEnCurso: "2026-10",
      aviones: [],
      cuentaDesdeMes: "2026-08",
      mesSugerido: null,
    });
  });

  it("«Corresponde a»: «Sin mes (a cuenta)» + meses de la cuenta; «Sin avión» + sus aviones", () => {
    const meses = opcionesCorrespondeMes("2026-09", "2026-10-01");
    expect(ETIQUETA_SIN_MES).toBe("Sin mes (a cuenta)");
    expect(meses).toEqual([
      { value: SIN_MES, label: "Sin mes (a cuenta)" },
      { value: "2026-10", label: "Octubre 2026" },
      { value: "2026-09", label: "Septiembre 2026" },
    ]);
    const aviones = opcionesCorrespondeAvion([
      { id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true },
      { id: N990GG, matricula: "N990GG", porcentaje: 33.333, vigente: false },
    ]);
    expect(aviones[0]).toEqual({ value: SIN_AVION, label: "Sin avión" });
    expect(aviones[1]).toEqual({ value: N4142R, label: "N4142R", description: "69 %" });
    expect(aviones[2].description).toBe("33.333 % · ya no vigente");
    // Edición: el mes y el avión que ya tiene la entrega se ofrecen aunque
    // queden fuera de la lista.
    expect(opcionesCorrespondeMes("2026-09", "2026-10-01", "2026-06").at(-1)).toEqual({
      value: "2026-06",
      label: "Junio 2026",
    });
    expect(opcionesCorrespondeAvion([], { id: N990GG, matricula: "N990GG" })).toEqual([
      { value: SIN_AVION, label: "Sin avión" },
      { value: N990GG, label: "N990GG" },
    ]);
  });

  it("«Entregó»: usuarios + yo + el de la entrega aunque ya no esté activo", () => {
    const op = opcionesEntrego([ITZI], ALE, { id: "0f1c0000-0000-4000-8000-000000000011", nombre: "Ex empleado" });
    expect(op.map((o) => o.label)).toEqual(["Alejandro Canales", "Ex empleado", "Itzi"]);
    expect(op.find((o) => o.value === ALE.id)?.description).toBe("Tú");
  });

  it("rutas y roles (espejo del API; el candado real es el API)", () => {
    expect(RUTA_PAGOS_SOCIOS).toBe("/admin/profit-sharing/socios");
    expect(hrefCuentaSocio(MAURICIO)).toBe(`/admin/profit-sharing/socios/${MAURICIO}`);
    expect(hrefCuentaSocio(MAURICIO, { desde: "2026-09", hasta: "nada" })).toBe(
      `/admin/profit-sharing/socios/${MAURICIO}?desde=2026-09`,
    );
    for (const r of ["ADMIN", "ANALISTA", "FACTURACION", "SOCIO"]) expect(puedeVerCuentasSocios(r)).toBe(true);
    for (const r of ["COORDINADOR", "PILOTO", "MECANICO", null]) expect(puedeVerCuentasSocios(r)).toBe(false);
    expect(puedeRegistrarEntregas("ADMIN")).toBe(true);
    expect(puedeRegistrarEntregas("FACTURACION")).toBe(true);
    expect(puedeRegistrarEntregas("ANALISTA")).toBe(false);
    expect(puedeRegistrarEntregas("SOCIO")).toBe(false);
  });
});

describe("formulario «Registrar entrega»", () => {
  it("prellenado: lo POR ENTREGAR del API, USD, hoy, yo, SIN método, sin mes ni avión", () => {
    expect(formInicialAlta({ porEntregarUsd: 1395.94, hoy: "2026-10-01", meId: ALE.id })).toEqual({
      monto: "1395.94",
      moneda: "USD",
      tc: "",
      fecha_pago: "2026-10-01",
      metodo: "",
      entregado_por_id: ALE.id,
      recibido_por: "",
      referencia: "",
      factura_folio: "",
      notas: "",
      mes: SIN_MES,
      aeronave_id: SIN_AVION,
    });
    // Adelantado o sin dato: monto vacío (un adelanto se captura a mano).
    expect(formInicialAlta({ porEntregarUsd: -2387.84, hoy: "2026-10-01", meId: ALE.id }).monto).toBe("");
    expect(formInicialAlta({ porEntregarUsd: null, hoy: "2026-10-01", meId: ALE.id }).monto).toBe("");
  });

  it("prellenado desde el Reparto con un MES completo: «Corresponde al mes» = ese mes (nunca uno futuro)", () => {
    const base = { porEntregarUsd: 1395.94, hoy: "2026-10-01", meId: ALE.id };
    expect(formInicialAlta({ ...base, mesSugerido: "2026-09" }).mes).toBe("2026-09");
    expect(formInicialAlta({ ...base, mesSugerido: "2026-10" }).mes).toBe("2026-10");
    // El API rechaza un mes futuro (MES_FUTURO): no se sugiere.
    expect(formInicialAlta({ ...base, mesSugerido: "2026-11" }).mes).toBe(SIN_MES);
    expect(formInicialAlta({ ...base, mesSugerido: null }).mes).toBe(SIN_MES);
    // Y viaja en el POST como «corresponde a».
    const f = { ...formInicialAlta({ ...base, mesSugerido: "2026-09" }), metodo: "TRANSFERENCIA" as const };
    expect(payloadAltaPago(f, { socio_id: MAURICIO, meId: ALE.id })).toMatchObject({ mes: "2026-09" });
  });

  it("moneda: a MXN vacía el monto prellenado y prellena el T.C. oficial; de vuelta a USD lo restaura", () => {
    const f = formValido();
    const mxn = formAlCambiarMoneda(f, "MXN", "1395.94", 18.4567891);
    expect(mxn).toMatchObject({ moneda: "MXN", monto: "", tc: "18.456789" });
    expect(formAlCambiarMoneda(mxn, "USD", "1395.94", 18.45)).toMatchObject({ moneda: "USD", monto: "1395.94" });
    // Un monto tecleado y un T.C. ya capturado no se tocan.
    const tecleado = formAlCambiarMoneda({ ...f, monto: "500", tc: "19" }, "MXN", "1395.94", 18.45);
    expect(tecleado).toMatchObject({ monto: "500", tc: "19" });
    // Sin T.C. oficial: vacío (nunca uno inventado).
    expect(formAlCambiarMoneda(f, "MXN", "1395.94", null).tc).toBe("");
    // Edición (sin prellenado): solo cambia la moneda.
    expect(formAlCambiarMoneda({ ...f, monto: "1395.94" }, "MXN", null, null).monto).toBe("1395.94");
  });

  it("ayudas del monto y del T.C.", () => {
    expect(hintMontoPago({ moneda: "USD", porEntregarUsd: 1395.94, alta: true })).toBe(
      "Prellenado con lo que hay por entregar: $1,395.94 USD.",
    );
    expect(hintMontoPago({ moneda: "MXN", porEntregarUsd: 1395.94, alta: true })).toBe(
      "Captura el monto en pesos; por entregar $1,395.94 USD.",
    );
    expect(hintMontoPago({ moneda: "USD", porEntregarUsd: -5, alta: true })).toBeNull();
    expect(hintMontoPago({ moneda: "USD", porEntregarUsd: 1, alta: false })).toBeNull();
    expect(hintTcPago({ tc: "18.45", tcOficial: 18.45, hoy: "2026-10-01" })).toMatch(
      /^T\.C\. oficial de referencia de hoy \(01 oct\.? 2026\) — puedes editarlo\./,
    );
    expect(hintTcPago({ tc: "19", tcOficial: 18.45, hoy: "2026-10-01" })).not.toContain("oficial");
  });

  it("validación: monto, T.C. en pesos, fecha no futura, método, mes/avión", () => {
    expect(validarFormPago(formValido(), "2026-10-01")).toEqual({});
    const e = validarFormPago(
      formValido({ monto: "0", moneda: "MXN", tc: "", fecha_pago: "2026-10-02", metodo: "", mes: "2026-13", aeronave_id: "x" }),
      "2026-10-01",
    );
    expect(Object.keys(e).sort()).toEqual(["aeronave_id", "fecha_pago", "mes", "metodo", "monto", "tc"]);
    expect(e.fecha_pago).toBe("La fecha de la entrega no puede ser futura.");
    expect(hayErrores(e)).toBe(true);
    expect(leerNumero("1,234.50")).toBe(1234.5);
    expect(Number.isNaN(leerNumero(""))).toBe(true);
  });

  it("POST: el adelanto de 70,000 MXN sin mes ni avión; vacíos no viajan; la MISMA llave al confirmar", () => {
    const f = formValido({ monto: "70000", moneda: "MXN", tc: "18.5", metodo: "EFECTIVO", recibido_por: " Su esposa " });
    const crid = "c0c0c0c0-0000-4000-8000-000000000001";
    const primero = payloadAltaPago(f, { socio_id: MAURICIO, client_request_id: crid, meId: ALE.id });
    expect(primero).toEqual({
      socio_id: MAURICIO,
      monto: 70000,
      moneda: "MXN",
      tc_usd_mxn: 18.5,
      fecha_pago: "2026-10-01",
      metodo: "EFECTIVO",
      recibido_por: "Su esposa",
      client_request_id: crid,
    });
    const confirmado = payloadAltaPago(f, {
      socio_id: MAURICIO,
      client_request_id: crid,
      meId: ALE.id,
      aceptar_exceso: true,
    });
    expect(confirmado).toEqual({ ...primero, aceptar_exceso: true });
  });

  it("POST con «corresponde a» y otro «Entregó»", () => {
    const p = payloadAltaPago(formValido({ mes: "2026-09", aeronave_id: N4142R, entregado_por_id: ITZI.id }), {
      socio_id: MAURICIO,
      meId: ALE.id,
    });
    expect(p).toMatchObject({ mes: "2026-09", aeronave_id: N4142R, entregado_por_id: ITZI.id, monto: 1395.94 });
    expect(p).not.toHaveProperty("tc_usd_mxn");
  });

  it("PATCH: solo lo que cambió; a USD manda `tc_usd_mxn:null`; vaciar un texto manda null", () => {
    const f = formDePago(ADELANTO);
    expect(f).toMatchObject({ monto: "70000", moneda: "MXN", tc: "18.5", metodo: "EFECTIVO", mes: SIN_MES, aeronave_id: SIN_AVION });
    expect(cambiosPago(ADELANTO, f)).toEqual({});
    expect(cambiosPago(ADELANTO, { ...f, moneda: "USD", monto: "3783.78", recibido_por: "" })).toEqual({
      monto: 3783.78,
      moneda: "USD",
      tc_usd_mxn: null,
      recibido_por: null,
    });
    expect(cambiosPago(ADELANTO, { ...f, tc: "18.75", metodo: "TRANSFERENCIA", referencia: "SPEI 1" })).toEqual({
      tc_usd_mxn: 18.75,
      metodo: "TRANSFERENCIA",
      referencia: "SPEI 1",
    });
  });

  it("PATCH del «corresponde a»: asignarlo manda el valor; «Sin mes» / «Sin avión» manda null", () => {
    expect(cambiosPago(ADELANTO, { ...formDePago(ADELANTO), mes: "2026-09", aeronave_id: N4142R })).toEqual({
      mes: "2026-09",
      aeronave_id: N4142R,
    });
    const conMes: PagoSocio = { ...ADELANTO, periodo: "2026-09-01", mes: "2026-09", aeronave_id: N4142R };
    expect(formDePago(conMes)).toMatchObject({ mes: "2026-09", aeronave_id: N4142R });
    expect(cambiosPago(conMes, formDePago(conMes))).toEqual({});
    expect(cambiosPago(conMes, { ...formDePago(conMes), mes: SIN_MES, aeronave_id: SIN_AVION })).toEqual({
      mes: null,
      aeronave_id: null,
    });
  });
});

describe("formulario «Configurar cuenta»", () => {
  it("arranca con lo que tiene la cuenta (o el default del API)", () => {
    expect(formDeCuenta(CUENTA_DEFAULT)).toEqual({ cuenta_desde: "2026-09", saldo_inicial: "0", notas: "" });
    expect(
      formDeCuenta({ cuenta_desde: "2026-06", saldo_inicial_usd: -1500.5, notas: "Repartos de junio a agosto", configurada: true }),
    ).toEqual({ cuenta_desde: "2026-06", saldo_inicial: "-1500.5", notas: "Repartos de junio a agosto" });
  });

  it("validación: mes no futuro, saldo obligatorio (negativo permitido), notas ≤ 500", () => {
    expect(validarFormCuenta({ cuenta_desde: "2026-06", saldo_inicial: "-1500.50", notas: "" }, "2026-10-01")).toEqual({});
    const e = validarFormCuenta({ cuenta_desde: "2026-11", saldo_inicial: "", notas: "x".repeat(501) }, "2026-10-01");
    expect(Object.keys(e).sort()).toEqual(["cuenta_desde", "notas", "saldo_inicial"]);
    expect(validarFormCuenta({ cuenta_desde: "2026-09", saldo_inicial: "abc", notas: "" }, "2026-10-01").saldo_inicial).toMatch(
      /negativo/,
    );
    // Más de 2 decimales se RECHAZA (redondear cambiaría el saldo en silencio).
    expect(
      validarFormCuenta({ cuenta_desde: "2026-09", saldo_inicial: "-1500.505", notas: "" }, "2026-10-01").saldo_inicial,
    ).toBe("Máximo 2 decimales (centavos).");
    expect(validarFormCuenta({ cuenta_desde: "2026-09", saldo_inicial: "−1,500.5", notas: "" }, "2026-10-01")).toEqual({});
  });

  it("PUT: `YYYY-MM`, saldo con 2 decimales (−0 viaja como 0), notas vacías ⇒ null", () => {
    expect(payloadCuenta({ cuenta_desde: "2026-06", saldo_inicial: "-1,500.50", notas: " Repartos " })).toEqual({
      cuenta_desde: "2026-06",
      saldo_inicial_usd: -1500.5,
      notas: "Repartos",
    });
    expect(payloadCuenta({ cuenta_desde: "2026-09", saldo_inicial: "-0", notas: "" })).toEqual({
      cuenta_desde: "2026-09",
      saldo_inicial_usd: 0,
      notas: null,
    });
  });

  it("¿cambia algo? Sin configurar SIEMPRE (guardar el default la configura); configurada igual ⇒ no", () => {
    expect(cuentaCambia(CUENTA_DEFAULT, formDeCuenta(CUENTA_DEFAULT))).toBe(true);
    const c: CuentaSocio = { cuenta_desde: "2026-06", saldo_inicial_usd: -1500.5, notas: "x", configurada: true };
    expect(cuentaCambia(c, formDeCuenta(c))).toBe(false);
    expect(cuentaCambia(c, { ...formDeCuenta(c), saldo_inicial: "-1500.49" })).toBe(true);
  });

  it("confirmación al cambiar una cuenta configurada (el saldo se recalcula)", () => {
    const c = confirmacionCambiarCuenta("Mauricio Roque", { cuenta_desde: "2026-06", saldo_inicial: "-1500.5", notas: "" });
    expect(c.descripcion).toBe(
      "La cuenta de Mauricio Roque arrancará en Junio 2026 con saldo inicial de -$1,500.50 USD. Su saldo por entregar se recalcula; las entregas registradas no cambian.",
    );
  });
});

describe("pre-cierre: socios por entregar / adelantados", () => {
  it("claves y «Resolver →» a Pagos a socios", () => {
    expect(CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR).toBe("socios_por_entregar");
    expect(CLAVE_PRECIERRE_SOCIOS_ADELANTADOS).toBe("socios_adelantados");
    expect(esClavePrecierreSocios("socios_adelantados")).toBe(true);
    expect(esClavePrecierreSocios("pagos_socios_pendientes")).toBe(false);
    expect(hrefPrecierreSocios()).toBe("/admin/profit-sharing/socios");
  });

  it("renglones con el saldo del API; el «y N más» sale del count", () => {
    const pend = lineasPreCierreSocios(
      [
        { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, por_entregar_usd: 1395.94 },
        { socio: "Aero Charter", por_entregar_usd: 586.7 },
      ],
      CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR,
      1,
      3,
    );
    expect(pend.lineas.map((l) => l.texto)).toEqual(["Mauricio Roque · por entregar: $1,395.94 USD"]);
    expect(pend.restantes).toBe(2);
    const adel = lineasPreCierreSocios(
      [
        { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, por_entregar_usd: -2387.84, adelantado_usd: 2387.84 },
        { socio: { id: SAAB, nombre: "Alexander E. Saab" }, por_entregar_usd: -10 },
      ],
      CLAVE_PRECIERRE_SOCIOS_ADELANTADOS,
    );
    expect(adel.lineas.map((l) => l.texto)).toEqual([
      "Mauricio Roque · adelantado hoy: $2,387.84 USD",
      "Alexander E. Saab · adelantado hoy: $10 USD",
    ]);
    expect(lineasPreCierreSocios(null, CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR)).toEqual({ lineas: [], restantes: 0 });
  });

  it("con el MES del cierre: «por entregar hasta Septiembre 2026: $X USD» + la nota de que «Pagos a socios» es el saldo de HOY", () => {
    const pend = lineasPreCierreSocios(
      [{ socio: { id: MAURICIO, nombre: "Mauricio Roque" }, por_entregar_usd: 1395.94 }],
      CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR,
      undefined,
      1,
      "2026-09",
    );
    expect(pend.lineas.map((l) => l.texto)).toEqual(["Mauricio Roque · por entregar hasta Septiembre 2026: $1,395.94 USD"]);
    expect(notaPreCierreSocios(CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR, "2026-09")).toBe(
      "Montos con las utilidades hasta Septiembre 2026. En «Pagos a socios» el saldo es el de hoy: suma también la utilidad del mes en curso.",
    );
    expect(notaPreCierreSocios(CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR, null)).toContain("Montos con las utilidades.");
    // El adelanto ya es el de HOY: no lleva nota ni «hasta».
    expect(notaPreCierreSocios(CLAVE_PRECIERRE_SOCIOS_ADELANTADOS, "2026-09")).toBeNull();
    expect(
      lineasPreCierreSocios(
        [{ socio: "Mauricio Roque", por_entregar_usd: -2387.84 }],
        CLAVE_PRECIERRE_SOCIOS_ADELANTADOS,
        undefined,
        1,
        "2026-09",
      ).lineas[0].texto,
    ).toBe("Mauricio Roque · adelantado hoy: $2,387.84 USD");
  });
});

describe("entregas fechadas ANTES del arranque de la cuenta", () => {
  const movs = (tipos: string[]) =>
    tipos.map((tipo) => ({
      fecha: "2026-09-01",
      tipo,
      concepto: "",
      mes: null,
      aeronave: null,
      porcentaje: null,
      cargo_usd: 0,
      abono_usd: 0,
      saldo_usd: 0,
      en_curso: false,
      pago: null,
    }));

  it("con el `desde` en el arranque (o antes), un SALDO_ANTERIOR = entregas escondidas; con un `desde` posterior es normal", () => {
    expect(escondeEntregasAntesDelArranque({ desde: "2026-09", movimientos: movs(["SALDO_ANTERIOR", "SALDO_INICIAL"]) }, "2026-09")).toBe(true);
    expect(escondeEntregasAntesDelArranque({ desde: "2025-12", movimientos: movs(["SALDO_ANTERIOR"]) }, "2026-09")).toBe(true);
    expect(escondeEntregasAntesDelArranque({ desde: "2026-09", movimientos: movs(["SALDO_INICIAL", "UTILIDAD"]) }, "2026-09")).toBe(false);
    expect(escondeEntregasAntesDelArranque({ desde: "2026-10", movimientos: movs(["SALDO_ANTERIOR"]) }, "2026-09")).toBe(false);
  });

  it("día previo al arranque y mes desde el que se ven (la más antigua, la ventana de 36 meses o el tope del API)", () => {
    expect(diaAntesDelArranque("2026-09")).toBe("2026-08-31");
    expect(diaAntesDelArranque("2026-03")).toBe("2026-02-28");
    expect(diaAntesDelArranque("nada")).toBeNull();
    expect(mesParaVerEntregasPrevias({ mesMasAntiguo: "2025-09", cuentaDesdeMes: "2026-09", mesActual: "2026-10" })).toBe(
      "2025-09",
    );
    // Sin dato (la lectura falló): la ventana de 36 meses.
    expect(mesParaVerEntregasPrevias({ mesMasAntiguo: null, cuentaDesdeMes: "2026-09", mesActual: "2026-10" })).toBe(
      "2023-11",
    );
    // Un dedazo de década: el tope del API (120 meses).
    expect(mesParaVerEntregasPrevias({ mesMasAntiguo: "2006-09", cuentaDesdeMes: "2026-09", mesActual: "2026-10" })).toBe(
      "2016-11",
    );
    // Nunca después del arranque.
    expect(mesParaVerEntregasPrevias({ mesMasAntiguo: "2026-09", cuentaDesdeMes: "2026-09", mesActual: "2026-10" })).toBe(
      "2026-08",
    );
  });

  it("textos: el aviso con el enlace y el de la fecha del diálogo", () => {
    expect(textoEntregasAntesDelArranque(1, "2026-10")).toBe(
      "La entrega con fecha anterior al arranque (Octubre 2026) va sumada en el «Saldo al cierre» y no tiene renglón aquí. Ábrela para verla, corregirla o adjuntar su comprobante.",
    );
    expect(textoEntregasAntesDelArranque(2, "2026-10")).toBe(
      "Las 2 entregas con fecha anterior al arranque (Octubre 2026) van sumadas en el «Saldo al cierre» y no tienen renglón aquí. Ábrelas para verlas, corregirlas o adjuntar su comprobante.",
    );
    expect(textoEntregasAntesDelArranque(null, "2026-10")).toMatch(/^Las entregas con fecha anterior al arranque/);
    // No repite el aviso del API («sí descuentan del saldo»): dice dónde están.
    expect(textoEntregasAntesDelArranque(2, "2026-10")).not.toContain("descuent");
    expect(avisoFechaAntesDelArranque("2025-09-28", "2026-09")).toBe(
      "Esta fecha es anterior al arranque de la cuenta (Septiembre 2026): sí descontará del saldo, pero no saldrá en los movimientos desde el arranque. Revisa el año.",
    );
    expect(avisoFechaAntesDelArranque("2026-09-01", "2026-09")).toBeNull();
    expect(avisoFechaAntesDelArranque("", "2026-09")).toBeNull();
  });
});
