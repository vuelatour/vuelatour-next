/**
 * COBRO «CON UTILIDADES DEL SOCIO» (23-nov-2026, API 0.0.148) — reglas puras.
 *
 * Pedido del dueño: los socios a veces pagan un vuelo propio «descontándolo
 * de sus utilidades». Qué se congela:
 *  1. la opción es SOLO de la pantalla: un centinela que no es un método, va
 *     AL FINAL del selector y no toca `METODOS_PAGO`;
 *  2. cuándo se ofrece (alta + página del vuelo + DIRECCION/FACTURACION + no
 *     cancelado);
 *  3. qué socios se ofrecen (sin la empresa), cuál se preselecciona (el
 *     cliente del vuelo, sin acentos ni mayúsculas) y qué avión se propone;
 *  4. moneda, fecha por defecto (la del vuelo; futura ⇒ hoy) y la ayuda con
 *     el mes del que se descuenta;
 *  5. el renglón del saldo (sin dato ⇒ sin números);
 *  6. validación (T.C. en las DOS monedas, banda 15–25, fecha no futura) y el
 *     cuerpo que viaja (sin método);
 *  7. el 409 PAGO_EXCEDE_SALDO es la confirmación del adelanto (misma
 *     redacción que «Registrar entrega»), no un error;
 *  8. errores por código (gana el texto del API en español);
 *  9. cómo se lee el cobro en la lista y qué se confirma al quitarlo.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_UTILIDADES_SOCIO,
  CARGA_SOCIOS_SIN_CARGAR,
  ETIQUETA_UTILIDADES_SOCIO,
  METODO_UTILIDADES_SOCIO,
  ROLES_COBRO_UTILIDADES,
  TEXTO_COBRO_UTILIDADES_NO_SE_EDITA,
  avionPorDefecto,
  ayudaFechaUtilidades,
  ayudaTcUtilidades,
  cargaSociosDeRespuesta,
  confirmacionAdelantoCobro,
  confirmacionEliminarCobroUtilidades,
  detalleUtilidadesDeCobro,
  esCobroConUtilidades,
  etiquetaMetodoCobroFinal,
  etiquetaMetodoDeCobro,
  fechaPorDefectoUtilidades,
  mensajeCargaSocios,
  mensajeErrorCobroUtilidades,
  monedaPorDefectoUtilidades,
  ofreceCobroConUtilidades,
  opcionesAvionCobro,
  opcionesMetodoCobro,
  opcionesSocioCobro,
  pasoTrasCobroUtilidades,
  payloadCobroUtilidades,
  puedeCobrarConUtilidades,
  puedeEliminarCobro,
  socioPreseleccionado,
  sociosParaCobro,
  textoCobroUtilidadesRegistrado,
  textoSaldoUtilidades,
  validarCobroUtilidades,
  type ContextoCobroUtilidades,
  type FormCobroUtilidades,
  type SocioParaCobro,
} from "@/lib/admin/cobro-utilidades";
import { edicionDeCobro, hayCobrosEditables, mensajeErrorEdicionCobro, datosSoloLecturaCobro } from "@/lib/admin/cobro-edicion";
import { METODOS_PAGO } from "@/lib/admin/metodos-pago";
import { confirmacionAdelanto } from "@/lib/admin/reparto-pagos";
import type { FlightCobro } from "@/types/flights";
import type { ResumenCuentaSocio, SaldoAvionCuenta } from "@/types/reparto-pagos";

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const EMPRESA = "50c10000-0000-4000-8000-000000000002";
const HERNAN = "50c10000-0000-4000-8000-000000000003";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const XBANU = "a1a1a1a1-0000-4000-8000-000000000002";
const N990GG = "a1a1a1a1-0000-4000-8000-000000000003";
const LLAVE = "7b7b0000-0000-4000-8000-00000000000a";

const saldo = (over: Partial<SaldoAvionCuenta>): SaldoAvionCuenta => ({
  aeronave: { id: N4142R, matricula: "N4142R" },
  porcentaje: 69,
  generado_mxn: 0,
  mes_en_curso_mxn: 0,
  entregado_mxn: 0,
  por_entregar_mxn: 0,
  por_entregar_cerrado_mxn: 0,
  estado: "AL_CORRIENTE",
  ...over,
});

const resumen = (over: Partial<ResumenCuentaSocio>): ResumenCuentaSocio => ({
  socio: { id: HERNAN, nombre: "Hernán Garza" },
  cuenta: { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: true },
  generado_mxn: 0,
  mes_en_curso_mxn: 0,
  entregado_mxn: 0,
  por_entregar_mxn: 50000,
  por_entregar_cerrado_mxn: 42000,
  estado: "POR_ENTREGAR",
  ultimo_pago: null,
  aviones: [{ id: N990GG, matricula: "N990GG", porcentaje: 50, vigente: true }],
  ...over,
});

/** Mauricio: DOS aviones, cuenta por avión (los números de la captura del 10-nov). */
const MAURICIO_R = resumen({
  socio: { id: MAURICIO, nombre: "Mauricio Roque", es_empresa: false },
  por_entregar_mxn: 14936.11,
  por_entregar_cerrado_mxn: 14936.11,
  aviones: [
    { id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true },
    { id: XBANU, matricula: "XB-ANU", porcentaje: 70, vigente: true },
  ],
  cuenta_por_avion: true,
  por_avion: [
    saldo({ por_entregar_mxn: 18798.71, por_entregar_cerrado_mxn: 18798.71, estado: "POR_ENTREGAR" }),
    saldo({
      aeronave: { id: XBANU, matricula: "XB-ANU" },
      porcentaje: 70,
      por_entregar_mxn: -3862.6,
      por_entregar_cerrado_mxn: -3862.6,
      estado: "ADELANTADO",
    }),
  ],
});
const EMPRESA_R = resumen({
  socio: { id: EMPRESA, nombre: "Aero Charter Cancún", es_empresa: true },
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 29, vigente: true }],
});
const HERNAN_R = resumen({});

const SOCIOS = sociosParaCobro([MAURICIO_R, EMPRESA_R, HERNAN_R]);
const mauricio = SOCIOS.find((s) => s.id === MAURICIO) as SocioParaCobro;
const hernan = SOCIOS.find((s) => s.id === HERNAN) as SocioParaCobro;

const CONTEXTO: ContextoCobroUtilidades = {
  aeronaveId: N4142R,
  clienteNombre: "Mauricio Roque",
  fechaVuelo: "2026-11-20T15:00:00Z",
};

const COBRO: FlightCobro = {
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  vuelo_id: "v-482",
  monto: "45000",
  moneda: "MXN",
  metodo_cobro: "OTRO",
  tc_usd_mxn: "18.5",
  referencia: null,
  fecha_cobro: "2026-11-20T17:00:00+00:00",
  foto_voucher_url: null,
  registrado_por: "u-1",
  notas: null,
  created_at: "2026-11-23T17:00:00+00:00",
  updated_at: "2026-11-23T17:00:00+00:00",
  utilidades: {
    entrega_id: "9a9a0000-0000-4000-8000-000000000001",
    socio_id: MAURICIO,
    socio_nombre: "Mauricio Roque",
    aeronave_id: N4142R,
    matricula: "N4142R",
    mes: "2026-11",
  },
};
const NORMAL: FlightCobro = { ...COBRO, id: "c-normal", metodo_cobro: "TRANSFERENCIA", utilidades: null };

describe("la opción «Utilidades del socio» es SOLO de la pantalla", () => {
  it("el centinela no es un método del API y `METODOS_PAGO` no cambió", () => {
    expect(METODOS_PAGO.map((m) => m.value as string)).not.toContain(METODO_UTILIDADES_SOCIO);
    expect(METODOS_PAGO.map((m) => m.label)).not.toContain(ETIQUETA_UTILIDADES_SOCIO);
    expect(METODOS_PAGO).toHaveLength(8);
  });

  it("donde se ofrece va AL FINAL, con su ayuda; donde no, la lista de siempre", () => {
    const sin = opcionesMetodoCobro(false);
    expect(sin.map((o) => o.value)).toEqual(METODOS_PAGO.map((m) => m.value));
    const con = opcionesMetodoCobro(true);
    expect(con.slice(0, -1)).toEqual(sin);
    expect(con.at(-1)).toEqual({
      value: METODO_UTILIDADES_SOCIO,
      label: "Utilidades del socio",
      description: "El socio paga su vuelo con sus utilidades: no entra dinero",
    });
    expect(AYUDA_UTILIDADES_SOCIO).toBe("El socio paga su vuelo con sus utilidades: no entra dinero");
  });

  it("solo DIRECCION y FACTURACION (espejo del @Roles del POST)", () => {
    expect([...ROLES_COBRO_UTILIDADES]).toEqual(["DIRECCION", "FACTURACION"]);
    for (const rol of ["DIRECCION", "FACTURACION"]) expect(puedeCobrarConUtilidades(rol)).toBe(true);
    for (const rol of ["ADMIN", "COORDINADOR", "ANALISTA", "SOCIO", "PILOTO", "", null, undefined]) {
      expect(puedeCobrarConUtilidades(rol)).toBe(false);
    }
  });

  it("se ofrece solo en el ALTA, con el contexto de la página del vuelo, y no en un cancelado", () => {
    const base = { contexto: CONTEXTO, rol: "DIRECCION", enEdicion: false, cancelado: false };
    expect(ofreceCobroConUtilidades(base)).toBe(true);
    expect(ofreceCobroConUtilidades({ ...base, rol: "FACTURACION" })).toBe(true);
    // Cotización / auditoría de Paywise: no pasan el contexto.
    expect(ofreceCobroConUtilidades({ ...base, contexto: null })).toBe(false);
    expect(ofreceCobroConUtilidades({ ...base, contexto: undefined })).toBe(false);
    expect(ofreceCobroConUtilidades({ ...base, enEdicion: true })).toBe(false);
    expect(ofreceCobroConUtilidades({ ...base, cancelado: true })).toBe(false);
    expect(ofreceCobroConUtilidades({ ...base, rol: "ADMIN" })).toBe(false);
    expect(ofreceCobroConUtilidades({ ...base, rol: "COORDINADOR" })).toBe(false);
  });
});

describe("socios y aviones que se ofrecen", () => {
  it("la EMPRESA no se ofrece; los demás, en el orden del API, con sus aviones", () => {
    expect(SOCIOS.map((s) => s.nombre)).toEqual(["Mauricio Roque", "Hernán Garza"]);
    expect(mauricio.aviones.map((a) => a.matricula)).toEqual(["N4142R", "XB-ANU"]);
    expect(opcionesSocioCobro(SOCIOS)).toEqual([
      { value: MAURICIO, label: "Mauricio Roque", description: "N4142R · XB-ANU" },
      { value: HERNAN, label: "Hernán Garza", description: "N990GG" },
    ]);
  });

  it("cuenta POR AVIÓN: el saldo de cada avión es el de SU sección (meses cerrados)", () => {
    expect(mauricio.cuentaPorAvion).toBe(true);
    expect(mauricio.aviones.map((a) => a.porEntregarCerradoMxn)).toEqual([18798.71, -3862.6]);
    expect(mauricio.adelantadoGeneralMxn).toBe(0);
  });

  it("cuenta de siempre: el número es el de toda la cuenta; sin el dato, null (no se inventa)", () => {
    expect(hernan.cuentaPorAvion).toBe(false);
    expect(hernan.aviones[0].porEntregarCerradoMxn).toBe(42000);
    const [sinDato] = sociosParaCobro([resumen({ por_entregar_cerrado_mxn: null })]);
    expect(sinDato.aviones[0].porEntregarCerradoMxn).toBeNull();
    // Cuenta por avión con un avión SIN sección: tampoco se inventa.
    const [raro] = sociosParaCobro([
      { ...MAURICIO_R, por_avion: [MAURICIO_R.por_avion![0]] },
    ]);
    expect(raro.aviones.map((a) => a.porEntregarCerradoMxn)).toEqual([18798.71, null]);
  });

  it("adelantos «a cuenta general»: viajan en positivo (el API los descuenta)", () => {
    const [s] = sociosParaCobro([
      {
        ...MAURICIO_R,
        por_avion: [
          ...MAURICIO_R.por_avion!,
          saldo({ aeronave: null, porcentaje: null, por_entregar_mxn: -5000, por_entregar_cerrado_mxn: -5000 }),
        ],
      },
    ]);
    expect(s.adelantadoGeneralMxn).toBe(5000);
  });

  it("quien no tiene avión, o un id ilegible, no se ofrece; lista vacía o nula ⇒ []", () => {
    expect(sociosParaCobro([resumen({ aviones: [] })])).toEqual([]);
    expect(sociosParaCobro([resumen({ socio: { id: "x", nombre: "X" } })])).toEqual([]);
    expect(sociosParaCobro(null)).toEqual([]);
    expect(sociosParaCobro(undefined)).toEqual([]);
  });

  it("preselecciona al socio que se llama como el cliente (sin acentos ni mayúsculas)", () => {
    expect(socioPreseleccionado(SOCIOS, "Mauricio Roque")).toBe(MAURICIO);
    expect(socioPreseleccionado(SOCIOS, "  mauricio   ROQUE ")).toBe(MAURICIO);
    expect(socioPreseleccionado(SOCIOS, "HERNAN GARZA")).toBe(HERNAN);
    // Un cliente que no es socio, o sin nombre: se elige a mano.
    expect(socioPreseleccionado(SOCIOS, "Beh Kay")).toBe("");
    expect(socioPreseleccionado(SOCIOS, "Mauricio")).toBe("");
    expect(socioPreseleccionado(SOCIOS, null)).toBe("");
    // Dos socios con el mismo nombre: jamás se adivina.
    const dobles = [...SOCIOS, { ...mauricio, id: "50c10000-0000-4000-8000-0000000000ff" }];
    expect(socioPreseleccionado(dobles, "Mauricio Roque")).toBe("");
  });

  it("avión por defecto: el del vuelo si es socio ahí; si no, su único avión; con varios, obliga a elegir", () => {
    expect(avionPorDefecto(mauricio, N4142R)).toBe(N4142R);
    expect(avionPorDefecto(mauricio, XBANU)).toBe(XBANU);
    // Voló un avión en el que NO es socio y tiene dos: se elige a mano.
    expect(avionPorDefecto(mauricio, N990GG)).toBe("");
    expect(avionPorDefecto(mauricio, null)).toBe("");
    // Un solo avión: ese, aunque haya volado otro.
    expect(avionPorDefecto(hernan, N4142R)).toBe(N990GG);
    expect(avionPorDefecto(hernan, null)).toBe(N990GG);
    expect(avionPorDefecto(null, N4142R)).toBe("");
  });

  it("opciones del avión: %, «ya no vigente» y cuál es el del vuelo", () => {
    expect(opcionesAvionCobro(mauricio, N4142R)).toEqual([
      { value: N4142R, label: "N4142R", description: "69 % · el avión de este vuelo" },
      { value: XBANU, label: "XB-ANU", description: "70 %" },
    ]);
    const [exSocio] = sociosParaCobro([
      resumen({ aviones: [{ id: N990GG, matricula: "N990GG", porcentaje: 50, vigente: false }] }),
    ]);
    expect(opcionesAvionCobro(exSocio, null)[0].description).toBe("50 % · ya no vigente");
    expect(opcionesAvionCobro(null, N4142R)).toEqual([]);
  });
});

describe("carga de los socios", () => {
  it("arranca sin cargar; ok ⇒ la lista; fallo ⇒ el porqué y si sirve reintentar", () => {
    expect(CARGA_SOCIOS_SIN_CARGAR).toEqual({ estado: "sin-cargar" });
    expect(cargaSociosDeRespuesta({ ok: true, data: SOCIOS })).toEqual({ estado: "ok", socios: SOCIOS });
    expect(cargaSociosDeRespuesta({ ok: false, error: "No se pudo", code: "error" })).toEqual({
      estado: "error",
      mensaje: "No se pudo",
      reintentable: true,
    });
    // Sin permiso o servidor sin actualizar: reintentar no lo arregla.
    for (const code of ["sin-permiso", "no-disponible"]) {
      expect(cargaSociosDeRespuesta({ ok: false, error: "x", code })).toMatchObject({ reintentable: false });
    }
    // `ok` sin datos NO es «sin socios»: es un fallo.
    expect(cargaSociosDeRespuesta({ ok: true }).estado).toBe("error");
    expect(cargaSociosDeRespuesta({ ok: false }).estado).toBe("error");
  });

  it("los cuatro motivos, en palabras del operador", () => {
    expect(mensajeCargaSocios("no-disponible")).toContain("falta actualizarlo");
    expect(mensajeCargaSocios("sin-permiso")).toContain("Dirección o a Facturación");
    expect(mensajeCargaSocios("error")).toContain("Vuelve a intentarlo");
    expect(mensajeCargaSocios("no-existe")).toContain("Vuelve a intentarlo");
  });
});

describe("moneda y fecha", () => {
  it("MXN si el vuelo tiene total en pesos; si no, USD", () => {
    expect(monedaPorDefectoUtilidades(100000)).toBe("MXN");
    expect(monedaPorDefectoUtilidades(null)).toBe("USD");
    expect(monedaPorDefectoUtilidades(undefined)).toBe("USD");
    expect(monedaPorDefectoUtilidades(0)).toBe("USD");
    expect(monedaPorDefectoUtilidades(Number.NaN)).toBe("USD");
  });

  it("fecha por defecto = la del VUELO en día de Cancún; futura o sin fecha ⇒ hoy", () => {
    expect(fechaPorDefectoUtilidades("2026-11-20T15:00:00Z", "2026-11-23")).toBe("2026-11-20");
    // 02:00 UTC del 1-dic todavía es 30-nov en Cancún (UTC−5): mes de noviembre.
    expect(fechaPorDefectoUtilidades("2026-12-01T02:00:00Z", "2026-12-05")).toBe("2026-11-30");
    // Un día a secas no se corre.
    expect(fechaPorDefectoUtilidades("2026-10-31", "2026-11-23")).toBe("2026-10-31");
    // Vuelo futuro ⇒ hoy.
    expect(fechaPorDefectoUtilidades("2026-12-24T15:00:00Z", "2026-11-23")).toBe("2026-11-23");
    expect(fechaPorDefectoUtilidades("2026-11-23T15:00:00Z", "2026-11-23")).toBe("2026-11-23");
    expect(fechaPorDefectoUtilidades(null, "2026-11-23")).toBe("2026-11-23");
    expect(fechaPorDefectoUtilidades("basura", "2026-11-23")).toBe("2026-11-23");
  });

  it("la ayuda dice de qué MES se descuenta y cambia con la fecha", () => {
    expect(ayudaFechaUtilidades("2026-11-20")).toBe(
      "Se descuenta de las utilidades de Noviembre 2026 (el mes de esta fecha).",
    );
    expect(ayudaFechaUtilidades("2026-10-31")).toBe(
      "Se descuenta de las utilidades de Octubre 2026 (el mes de esta fecha).",
    );
    expect(ayudaFechaUtilidades("")).toBe("Elige la fecha: de su mes se descuentan las utilidades.");
    expect(ayudaFechaUtilidades(null)).toBe("Elige la fecha: de su mes se descuentan las utilidades.");
  });

  it("el T.C. se explica en las dos monedas", () => {
    expect(ayudaTcUtilidades("USD")).toBe("La cuenta del socio es en pesos: se le descuenta monto × T.C.");
    expect(ayudaTcUtilidades("MXN")).toContain("total del vuelo en USD");
  });
});

describe("renglón del saldo del avión elegido", () => {
  it("«Por entregar a {socio} de {matrícula} (meses cerrados): $X. Después de este cobro: $Y.»", () => {
    expect(
      textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: 8000, moneda: "MXN", tc: 18.5 }),
    ).toEqual({
      texto:
        "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN. Después de este cobro: $10,798.71 MXN.",
      adelantoGeneral: null,
    });
  });

  it("en dólares descuenta monto × T.C.; sin T.C. o sin monto no dice el «después»", () => {
    expect(
      textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: "1000", moneda: "USD", tc: "18.5" })?.texto,
    ).toBe(
      "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN. Después de este cobro: $298.71 MXN.",
    );
    const soloSaldo = "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN.";
    expect(textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: 1000, moneda: "USD", tc: "" })?.texto).toBe(
      soloSaldo,
    );
    expect(textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: "", moneda: "MXN", tc: 18 })?.texto).toBe(
      soloSaldo,
    );
    expect(textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: 0, moneda: "MXN", tc: 18 })?.texto).toBe(
      soloSaldo,
    );
  });

  it("si el cobro rebasa el saldo, avisa que quedará como adelanto (y que se confirmará)", () => {
    expect(
      textoSaldoUtilidades({ socio: mauricio, avionId: N4142R, monto: 45000, moneda: "MXN", tc: 18.5 })?.texto,
    ).toBe(
      "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN. Después de este cobro: -$26,201.29 MXN. Quedará como adelanto: al guardar se te pedirá confirmarlo.",
    );
  });

  it("un avión sin nada por entregar (pérdida o adelantado) lo dice con su saldo", () => {
    expect(
      textoSaldoUtilidades({ socio: mauricio, avionId: XBANU, monto: "", moneda: "MXN", tc: "" })?.texto,
    ).toBe("No hay utilidades por entregar a Mauricio Roque de XB-ANU en meses cerrados (saldo: -$3,862.60 MXN).");
  });

  it("cuenta de siempre: con UN avión nombra la matrícula; con varios, es de toda la cuenta", () => {
    expect(textoSaldoUtilidades({ socio: hernan, avionId: N990GG, monto: 2000, moneda: "MXN", tc: 18 })?.texto).toBe(
      "Por entregar a Hernán Garza de N990GG (meses cerrados): $42,000.00 MXN. Después de este cobro: $40,000.00 MXN.",
    );
    const [dosSinSecciones] = sociosParaCobro([
      resumen({
        aviones: [
          { id: N990GG, matricula: "N990GG", porcentaje: 50, vigente: true },
          { id: XBANU, matricula: "XB-ANU", porcentaje: 10, vigente: true },
        ],
      }),
    ]);
    expect(
      textoSaldoUtilidades({ socio: dosSinSecciones, avionId: XBANU, monto: "", moneda: "MXN", tc: "" })?.texto,
    ).toBe("Por entregar a Hernán Garza (meses cerrados): $42,000.00 MXN.");
  });

  it("con adelantos a cuenta general NO se calcula el «después» (esa resta es del API)", () => {
    const conGeneral: SocioParaCobro = { ...mauricio, adelantadoGeneralMxn: 5000 };
    expect(
      textoSaldoUtilidades({ socio: conGeneral, avionId: N4142R, monto: 8000, moneda: "MXN", tc: 18.5 }),
    ).toEqual({
      texto: "Por entregar a Mauricio Roque de N4142R (meses cerrados): $18,798.71 MXN.",
      adelantoGeneral:
        "Ya se le adelantaron $5,000.00 MXN a cuenta general: el sistema los descuenta de lo que hay por entregar de este avión.",
    });
  });

  it("sin socio, sin avión o sin el dato del saldo: null (no se pinta ningún número)", () => {
    expect(textoSaldoUtilidades({ socio: null, avionId: N4142R, monto: 1, moneda: "MXN", tc: 18 })).toBeNull();
    expect(textoSaldoUtilidades({ socio: mauricio, avionId: "", monto: 1, moneda: "MXN", tc: 18 })).toBeNull();
    expect(textoSaldoUtilidades({ socio: mauricio, avionId: N990GG, monto: 1, moneda: "MXN", tc: 18 })).toBeNull();
    const [sinDato] = sociosParaCobro([resumen({ por_entregar_cerrado_mxn: null })]);
    expect(textoSaldoUtilidades({ socio: sinDato, avionId: N990GG, monto: 1, moneda: "MXN", tc: 18 })).toBeNull();
  });
});

describe("validación y cuerpo que viaja", () => {
  const FORM: FormCobroUtilidades = {
    socioId: MAURICIO,
    avionId: N4142R,
    monto: 45000,
    moneda: "MXN",
    tc: 18.456789,
    fecha: "2026-11-20",
    notas: "  Vuelo familiar  ",
  };
  const CTX = { socios: SOCIOS, hoy: "2026-11-23" };

  it("formulario completo ⇒ sin errores", () => {
    expect(validarCobroUtilidades(FORM, CTX)).toEqual({});
  });

  it("exige socio y un avión DE ESE socio", () => {
    expect(validarCobroUtilidades({ ...FORM, socioId: "" }, CTX)).toEqual({
      socio: "Elige el socio que paga el vuelo.",
    });
    expect(validarCobroUtilidades({ ...FORM, avionId: "" }, CTX)).toEqual({
      avion: "Elige de las utilidades de qué avión se descuenta.",
    });
    // Un avión de otro socio no vale.
    expect(validarCobroUtilidades({ ...FORM, avionId: N990GG }, CTX).avion).toBeTruthy();
  });

  it("el T.C. es obligatorio en las DOS monedas y va en la banda 15–25", () => {
    expect(validarCobroUtilidades({ ...FORM, moneda: "USD", tc: "" }, CTX).tc).toBe(
      "Captura el tipo de cambio: dice cuántos pesos se le descuentan al socio.",
    );
    expect(validarCobroUtilidades({ ...FORM, moneda: "MXN", tc: undefined }, CTX).tc).toContain(
      "Captura el tipo de cambio",
    );
    expect(validarCobroUtilidades({ ...FORM, tc: 14.99 }, CTX).tc).toBe(
      "Revisa el tipo de cambio: debe estar entre 15 y 25.",
    );
    expect(validarCobroUtilidades({ ...FORM, tc: 25.01 }, CTX).tc).toBeTruthy();
    expect(validarCobroUtilidades({ ...FORM, tc: 15 }, CTX).tc).toBeUndefined();
    expect(validarCobroUtilidades({ ...FORM, tc: 25 }, CTX).tc).toBeUndefined();
  });

  it("monto > 0, fecha obligatoria y NO futura, notas con el tope de Pagos a socios", () => {
    expect(validarCobroUtilidades({ ...FORM, monto: 0 }, CTX).monto).toBeTruthy();
    expect(validarCobroUtilidades({ ...FORM, monto: "" }, CTX).monto).toBeTruthy();
    expect(validarCobroUtilidades({ ...FORM, fecha: "" }, CTX).fecha).toBe(
      "Elige la fecha: de su mes se descuentan las utilidades.",
    );
    expect(validarCobroUtilidades({ ...FORM, fecha: "2026-11-24" }, CTX).fecha).toBe(
      "La fecha no puede ser futura: de su mes se descuentan las utilidades.",
    );
    expect(validarCobroUtilidades({ ...FORM, fecha: "2026-11-23" }, CTX).fecha).toBeUndefined();
    expect(validarCobroUtilidades({ ...FORM, notas: "x".repeat(501) }, CTX).notas).toBe("Máximo 500 caracteres.");
  });

  it("el cuerpo: sin método, T.C. a 6 decimales, fecha al mediodía de Cancún y la llave", () => {
    const cuerpo = payloadCobroUtilidades(FORM, { clientRequestId: LLAVE });
    expect(cuerpo).toEqual({
      socio_id: MAURICIO,
      aeronave_id: N4142R,
      monto: 45000,
      moneda: "MXN",
      tc_usd_mxn: 18.456789,
      // 12:00 en Cancún (UTC−5) = 17:00 UTC: el día y el MES no se mueven.
      fecha_cobro: "2026-11-20T17:00:00.000Z",
      notas: "Vuelo familiar",
      client_request_id: LLAVE,
    });
    // «Utilidades del socio» no es un método: nada parecido viaja.
    expect(Object.keys(cuerpo)).not.toContain("metodo_cobro");
    expect(Object.keys(cuerpo)).not.toContain("metodo");
    expect(JSON.stringify(cuerpo)).not.toContain(METODO_UTILIDADES_SOCIO);
    expect(Object.keys(cuerpo)).not.toContain("aceptar_exceso");
  });

  it("el adelanto confirmado viaja con `aceptar_exceso: true` y la MISMA llave; sin notas no hay llave", () => {
    const cuerpo = payloadCobroUtilidades(
      { ...FORM, moneda: "USD", monto: "1000.005", tc: "18.5", notas: "   " },
      { clientRequestId: LLAVE, aceptarExceso: true },
    );
    expect(cuerpo).toMatchObject({
      monto: 1000.01,
      moneda: "USD",
      tc_usd_mxn: 18.5,
      aceptar_exceso: true,
      client_request_id: LLAVE,
    });
    expect(Object.keys(cuerpo)).not.toContain("notas");
  });
});

describe("después de guardar", () => {
  const DETAILS = {
    por_entregar_mxn: 12000,
    mes_en_curso_mxn: 19002.73,
    monto_mxn: 45000,
    exceso_mxn: 33000,
    aeronave: { id: N4142R, matricula: "N4142R" },
  };

  it("409 PAGO_EXCEDE_SALDO ⇒ confirmación del adelanto (NO es un error)", () => {
    expect(
      pasoTrasCobroUtilidades({
        ok: false,
        code: "PAGO_EXCEDE_SALDO",
        error: "El cobro supera lo que hay por entregar al socio.",
        details: DETAILS,
        status: 409,
      }),
    ).toEqual({ paso: "adelanto", details: DETAILS });
  });

  it("listo (o replay de la misma llave) y error con su mensaje", () => {
    expect(pasoTrasCobroUtilidades({ ok: true, data: {} })).toEqual({ paso: "listo", idempotente: false });
    expect(pasoTrasCobroUtilidades({ ok: true, data: { idempotente: true } })).toEqual({
      paso: "listo",
      idempotente: true,
    });
    expect(
      pasoTrasCobroUtilidades({
        ok: false,
        code: "COBRO_EXCEDE_SALDO",
        error: "El cobro de $45,000.00 MXN rebasa lo pendiente del vuelo ($2,000.00 USD).",
        status: 409,
      }),
    ).toEqual({
      paso: "error",
      mensaje: "El cobro de $45,000.00 MXN rebasa lo pendiente del vuelo ($2,000.00 USD).",
    });
  });

  it("la confirmación REUTILIZA la de «Registrar entrega» (mismos números) y dice el mes", () => {
    const c = confirmacionAdelantoCobro(DETAILS, "2026-11-20");
    const base = confirmacionAdelanto(DETAILS, "alta", "cobro");
    expect(c.titulo).toBe("Este cobro es un ADELANTO");
    expect(c.descripcion).toBe(
      `Las utilidades de Noviembre 2026 todavía no alcanzan o no han cerrado. ${base.descripcion}`,
    );
    expect(c.descripcion).toBe(
      "Las utilidades de Noviembre 2026 todavía no alcanzan o no han cerrado. Este cobro de $45,000.00 MXN supera lo que hay por entregar de N4142R ($12,000.00 MXN, sin contar el mes en curso: $19,002.73 MXN). Se registrará como ADELANTO y el saldo de N4142R quedará a favor de VuelaTour por $33,000.00 MXN. ¿Registrar?",
    );
    expect(c.confirmar).toBe("Registrar como adelanto");
    expect(c.cancelar).toBe("Cancelar");
  });

  it("sin `details` legibles o sin fecha, la confirmación sigue diciendo qué pasa", () => {
    const c = confirmacionAdelantoCobro(null, "");
    expect(c.descripcion).toBe(
      "Las utilidades de ese mes todavía no alcanzan o no han cerrado. Este cobro supera lo que hay por entregar al socio. Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour. ¿Registrar?",
    );
  });

  it("la entrega de siempre conserva su texto byte a byte", () => {
    expect(confirmacionAdelanto(DETAILS).titulo).toBe("Esta entrega es un ADELANTO");
    expect(confirmacionAdelanto(DETAILS).descripcion.startsWith("Esta entrega de $45,000.00 MXN supera")).toBe(true);
    expect(confirmacionAdelanto(null).descripcion.startsWith("Esta entrega supera")).toBe(true);
  });

  it("toast de éxito", () => {
    expect(textoCobroUtilidadesRegistrado("Mauricio Roque")).toBe(
      "Cobro registrado con utilidades de Mauricio Roque. Se descontó en Pagos a socios.",
    );
    expect(textoCobroUtilidadesRegistrado("  ")).toBe(
      "Cobro registrado con utilidades de el socio. Se descontó en Pagos a socios.",
    );
  });
});

describe("errores del API en es-MX", () => {
  it("el texto del API en español gana; el respaldo por código cubre lo vacío o técnico", () => {
    expect(
      mensajeErrorCobroUtilidades({
        code: "SOCIO_NO_ES_DE_LA_AERONAVE",
        error: "Mauricio Roque no es socio de N990GG.",
        status: 400,
      }),
    ).toBe("Mauricio Roque no es socio de N990GG.");
    for (const [code, fragmento] of [
      ["COBRO_EXCEDE_SALDO", "rebasa lo que falta por cobrar"],
      ["SOCIO_NO_ES_DE_LA_AERONAVE", "no es socia del avión elegido"],
      ["SOCIO_INVALIDO", "no está registrada como socia"],
      ["MONTO_INVALIDO", "mayor a 0"],
      ["TC_REQUERIDO", "Captura el tipo de cambio"],
      ["TC_FUERA_DE_RANGO", "entre 15 y 25"],
      ["MES_CERRADO", "ya está cerrado"],
      ["COBRO_UTILIDADES_NO_DISPONIBLE", "todavía no está disponible"],
      ["COBRO_CON_UTILIDADES", "quítalo y regístralo de nuevo"],
      ["COBRO_CON_UTILIDADES_SOLO_DIRECCION", "Solo Dirección y Facturación pueden quitar"],
    ] as const) {
      expect(mensajeErrorCobroUtilidades({ code, error: "" }), code).toContain(fragmento);
      expect(mensajeErrorCobroUtilidades({ code, error: "Bad Request" }), code).toContain(fragmento);
    }
  });

  it("403, API previo (404 Cannot POST), validación en inglés, sesión y lo desconocido", () => {
    expect(mensajeErrorCobroUtilidades({ code: "FORBIDDEN", error: "Forbidden resource", status: 403 })).toBe(
      "Solo Dirección y Facturación pueden cobrar un vuelo con utilidades del socio.",
    );
    expect(
      mensajeErrorCobroUtilidades({
        code: "NOT_FOUND",
        error: "Cannot POST /v1/profit-sharing/vuelos/x/cobro-utilidades",
        status: 404,
      }),
    ).toContain("falta actualizarlo");
    expect(
      mensajeErrorCobroUtilidades({ code: "BAD_REQUEST", error: "property metodo should not exist", status: 400 }),
    ).toBe("El servidor rechazó un dato. Revisa el formulario y vuelve a intentarlo.");
    expect(mensajeErrorCobroUtilidades({ code: "UNAUTHORIZED", error: "Unauthorized", status: 401 })).toContain(
      "Tu sesión expiró",
    );
    expect(mensajeErrorCobroUtilidades({ code: "UNKNOWN", error: "Internal server error", status: 500 })).toContain(
      "No se pudo registrar el cobro con utilidades",
    );
    // La jerga de la llave nunca llega al operador.
    expect(
      mensajeErrorCobroUtilidades({ code: "CLIENT_REQUEST_ID_EN_USO", error: "La llave client_request_id ya se usó" }),
    ).toContain("Cierra el formulario y vuelve a abrirlo");
    // Un texto en español sin código conocido se respeta.
    expect(mensajeErrorCobroUtilidades({ code: "OTRO_CASO", error: "El vuelo está cancelado." })).toBe(
      "El vuelo está cancelado.",
    );
  });

  it("es idempotente: pasar su propio resultado otra vez no lo cambia", () => {
    for (const res of [
      { code: "FORBIDDEN", error: "Forbidden resource", status: 403 },
      { code: "NOT_FOUND", error: "Cannot POST /v1/x", status: 404 },
      { code: "COBRO_EXCEDE_SALDO", error: "", status: 409 },
      { code: "SIN_CONEXION", error: "No se pudo confirmar el cobro con el servidor." },
    ]) {
      const una = mensajeErrorCobroUtilidades(res);
      expect(mensajeErrorCobroUtilidades({ ...res, error: una })).toBe(una);
    }
  });

  it("el PATCH de un cobro con utilidades (409 COBRO_CON_UTILIDADES) se pinta por la misma fuente", () => {
    expect(
      mensajeErrorEdicionCobro({
        code: "COBRO_CON_UTILIDADES",
        error: "Este cobro se pagó con utilidades de Mauricio Roque: quítalo y regístralo de nuevo.",
      }),
    ).toBe("Este cobro se pagó con utilidades de Mauricio Roque: quítalo y regístralo de nuevo.");
    expect(mensajeErrorEdicionCobro({ code: "COBRO_CON_UTILIDADES", error: "" })).toContain(
      "quítalo y regístralo de nuevo",
    );
  });
});

describe("cómo se lee un cobro con utilidades en la lista", () => {
  it("«Utilidades del socio · {socio}» y debajo «Descontado de {matrícula} · {mes año}»", () => {
    expect(esCobroConUtilidades(COBRO)).toBe(true);
    expect(etiquetaMetodoDeCobro(COBRO)).toBe("Utilidades del socio · Mauricio Roque");
    expect(detalleUtilidadesDeCobro(COBRO)).toBe("Descontado de N4142R · Noviembre 2026");
  });

  it("solo lo que venga: sin matrícula o sin mes; sin ninguno, sin renglón", () => {
    const u = COBRO.utilidades!;
    expect(detalleUtilidadesDeCobro({ utilidades: { ...u, matricula: null } })).toBe("Descontado de Noviembre 2026");
    expect(detalleUtilidadesDeCobro({ utilidades: { ...u, mes: null } })).toBe("Descontado de N4142R");
    expect(detalleUtilidadesDeCobro({ utilidades: { ...u, mes: "basura" } })).toBe("Descontado de N4142R");
    expect(detalleUtilidadesDeCobro({ utilidades: { ...u, mes: null, matricula: " " } })).toBeNull();
    expect(etiquetaMetodoDeCobro({ ...COBRO, utilidades: { ...u, socio_nombre: "" } })).toBe("Utilidades del socio");
  });

  it("un cobro normal o un API previo (sin la llave) queda EXACTAMENTE como hoy", () => {
    const { utilidades: _sinLlave, ...previo } = COBRO;
    void _sinLlave;
    for (const c of [NORMAL, { ...previo, metodo_cobro: "TRANSFERENCIA" as const }]) {
      expect(esCobroConUtilidades(c)).toBe(false);
      expect(etiquetaMetodoDeCobro(c)).toBe("Transferencia");
      expect(detalleUtilidadesDeCobro(c)).toBeNull();
      expect(confirmacionEliminarCobroUtilidades(c)).toBeNull();
    }
    // Un «Otro» de verdad sigue diciendo «Otro».
    expect(etiquetaMetodoDeCobro({ ...NORMAL, metodo_cobro: "OTRO" })).toBe("Otro");
  });

  it("«Liquidado con»: si lo liquidó un cobro con utilidades dice eso; con un «Otro» de verdad no adivina", () => {
    expect(etiquetaMetodoCobroFinal("OTRO", [COBRO])).toBe("Utilidades del socio");
    expect(etiquetaMetodoCobroFinal("OTRO", [NORMAL, COBRO])).toBe("Utilidades del socio");
    // Hay un «Otro» genuino entre los cobros: no se sabe cuál liquidó.
    const otroDeVerdad: FlightCobro = { ...NORMAL, id: "c-otro", metodo_cobro: "OTRO" };
    expect(etiquetaMetodoCobroFinal("OTRO", [COBRO, otroDeVerdad])).toBe("Otro");
    expect(etiquetaMetodoCobroFinal("OTRO", [])).toBe("Otro");
    // Un reembolso (negativo) con OTRO no cuenta como abono.
    expect(etiquetaMetodoCobroFinal("OTRO", [COBRO, { ...otroDeVerdad, monto: "-500" }])).toBe(
      "Utilidades del socio",
    );
    // Cualquier otro método, como siempre.
    expect(etiquetaMetodoCobroFinal("TRANSFERENCIA", [COBRO])).toBe("Transferencia");
    expect(etiquetaMetodoCobroFinal(null, [COBRO])).toBe("—");
  });

  it("no lleva «Editar» (el API responde 409) y la ficha de corrección lo dice", () => {
    const e = edicionDeCobro(COBRO);
    expect(e.ofrecer).toBe(false);
    expect(e.dineroBloqueado).toBe(true);
    expect(e.tcBloqueado).toBe(true);
    expect(e.explicacion).toBe(TEXTO_COBRO_UTILIDADES_NO_SE_EDITA);
    expect(hayCobrosEditables([COBRO], "DIRECCION")).toBe(false);
    expect(hayCobrosEditables([COBRO, NORMAL], "DIRECCION")).toBe(true);
    expect(datosSoloLecturaCobro(COBRO)).toEqual([
      { etiqueta: "Monto", valor: "$45,000 MXN" },
      { etiqueta: "Método", valor: "Utilidades del socio · Mauricio Roque" },
      { etiqueta: "Fecha", valor: "20/11/2026" },
      { etiqueta: "Tipo de cambio", valor: "18.5" },
    ]);
  });

  it("«Eliminar» de un cobro con utilidades: solo DIRECCION/FACTURACION; los demás cobros, como siempre", () => {
    for (const rol of ["DIRECCION", "FACTURACION"]) expect(puedeEliminarCobro(COBRO, rol)).toBe(true);
    for (const rol of ["ADMIN", "COORDINADOR", "ANALISTA", null]) expect(puedeEliminarCobro(COBRO, rol)).toBe(false);
    for (const rol of ["ADMIN", "COORDINADOR", "DIRECCION", null]) expect(puedeEliminarCobro(NORMAL, rol)).toBe(true);
  });

  it("confirmación específica: se quita también la entrega en Pagos a socios", () => {
    expect(confirmacionEliminarCobroUtilidades(COBRO)).toBe(
      "Se quitará el cobro y también la entrega de $45,000 MXN a Mauricio Roque en Pagos a socios. El vuelo volverá a quedar pendiente de cobro.",
    );
    expect(
      confirmacionEliminarCobroUtilidades({ ...COBRO, monto: "2432.43", moneda: "USD" }),
    ).toContain("la entrega de $2,432.43 USD a Mauricio Roque");
    expect(confirmacionEliminarCobroUtilidades(null)).toBeNull();
  });
});
