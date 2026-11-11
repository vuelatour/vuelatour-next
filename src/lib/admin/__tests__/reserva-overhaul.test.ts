/**
 * RESERVA DE OVERHAUL CON VIGENCIA — «a partir de» (10-nov-2026, API 0.0.135).
 * Pedido del cliente: «que pudiéramos ponerle desde cuándo entra en vigor esa
 * reserva de overhaul… que dijera ahí "a partir de" y la fecha a partir de
 * cuándo quiere que afecte».
 *
 * Caso de las pruebas: el N4142R (Seneca, 2 motores) traía 0.01 USD/hr «desde
 * siempre» (la oficina la bajó para no tocar septiembre y octubre, ya
 * entregados) y quiere 55 USD/hr por motor a partir del 01/11/2026.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_RESERVA_DESDE,
  ERROR_RESERVA_FECHA_INVALIDA,
  ERROR_RESERVA_SIN_FECHA,
  ERROR_RESERVA_SIN_TARIFA,
  ETIQUETAS_ESTADO_VIGENCIA,
  TITULO_TARIFAS_RESERVA,
  confirmacionEliminarVigencia,
  estadoVigencia,
  puedeEditarReservaOverhaul,
  puedeEliminarVigencia,
  reservaParaGuardar,
  textoDesdeVigencia,
  textoReservaFicha,
  textoTarifaVigencia,
  vigenciaDeHoy,
  vigenciasDeReserva,
  vistaPreviaReserva,
} from "@/lib/admin/reserva-overhaul";
import type { ReservaOverhaulVigencia } from "@/types/aircraft";

function vig(p: Partial<ReservaOverhaulVigencia> & { id: string; vigente_desde: string }): ReservaOverhaulVigencia {
  const porMotor = p.usd_hr_por_motor ?? 55;
  const motores = p.motores ?? 2;
  return {
    usd_hr_por_motor: porMotor,
    motores,
    usd_por_hora: Math.round(porMotor * motores * 100) / 100,
    notas: null,
    updated_at: null,
    vigente_hoy: false,
    futura: false,
    ...p,
  };
}

const DESDE_SIEMPRE = vig({ id: "v-0", vigente_desde: "2026-01-01", usd_hr_por_motor: 0.01, vigente_hoy: true });
const NOVIEMBRE = vig({ id: "v-1", vigente_desde: "2026-11-01", usd_hr_por_motor: 55, vigente_hoy: true });
const ENERO_27 = vig({ id: "v-2", vigente_desde: "2027-01-01", usd_hr_por_motor: 70, futura: true });

describe("vigenciasDeReserva · la puerta única", () => {
  it("API previo, migración sin aplicar o basura ⇒ null (la ficha de siempre)", () => {
    expect(vigenciasDeReserva(undefined)).toBeNull();
    expect(vigenciasDeReserva(null)).toBeNull();
    expect(vigenciasDeReserva("x")).toBeNull();
    expect(vigenciasDeReserva({ disponible: false, vigencias: [] })).toBeNull();
    expect(vigenciasDeReserva({ disponible: true })).toBeNull();
    expect(vigenciasDeReserva({ disponible: "true", vigencias: [] })).toBeNull();
  });

  it("disponible y sin tarifas ⇒ lista vacía (el avión no tiene reserva), no null", () => {
    expect(vigenciasDeReserva({ disponible: true, vigencias: [] })).toEqual([]);
  });

  it("normaliza (numeric como texto, día recortado), descarta filas ilegibles y ordena la más reciente primero", () => {
    const r = vigenciasDeReserva({
      disponible: true,
      vigencias: [
        { id: "a", vigente_desde: "2026-01-01", usd_hr_por_motor: "0.01", motores: "2", usd_por_hora: "0.02", vigente_hoy: false, futura: false },
        { id: "b", vigente_desde: "2026-11-01T00:00:00", usd_hr_por_motor: 55, motores: 2, vigente_hoy: true, futura: false, notas: "  Decisión de dirección " },
        { id: "", vigente_desde: "2026-12-01", usd_hr_por_motor: 60 },
        { id: "c", vigente_desde: "no es fecha", usd_hr_por_motor: 60 },
        { id: "d", vigente_desde: "2026-12-01", usd_hr_por_motor: "x" },
        7,
      ],
    });
    expect(r).toEqual([
      {
        id: "b",
        vigente_desde: "2026-11-01",
        usd_hr_por_motor: 55,
        motores: 2,
        // Sin `usd_por_hora` del API: por motor × motores.
        usd_por_hora: 110,
        notas: "Decisión de dirección",
        updated_at: null,
        vigente_hoy: true,
        futura: false,
      },
      {
        id: "a",
        vigente_desde: "2026-01-01",
        usd_hr_por_motor: 0.01,
        motores: 2,
        usd_por_hora: 0.02,
        notas: null,
        updated_at: null,
        vigente_hoy: false,
        futura: false,
      },
    ]);
    expect(vigenciaDeHoy(r)?.id).toBe("b");
    expect(vigenciaDeHoy(null)).toBeNull();
    expect(vigenciaDeHoy([ENERO_27])).toBeNull();
  });
});

describe("textos de una tarifa", () => {
  it("la tarifa SIEMPRE dice su moneda; bimotor explica la suma; 0 = sin reserva", () => {
    expect(textoTarifaVigencia(NOVIEMBRE)).toBe("$55 USD por motor × 2 motores = $110 USD por hora de vuelo");
    expect(textoTarifaVigencia(vig({ id: "k", vigente_desde: "2026-01-01", usd_hr_por_motor: 400, motores: 1 }))).toBe(
      "$400 USD por hora de vuelo",
    );
    expect(textoTarifaVigencia(DESDE_SIEMPRE)).toBe("$0.01 USD por motor × 2 motores = $0.02 USD por hora de vuelo");
    expect(textoTarifaVigencia(vig({ id: "z", vigente_desde: "2026-01-01", usd_hr_por_motor: 0 }))).toBe("Sin reserva");
  });

  it("la fecha va en DD/MM/AAAA y el estado dice si vale hoy, si ya quedó atrás o si aún no empieza", () => {
    expect(textoDesdeVigencia(NOVIEMBRE)).toBe("a partir del 01/11/2026");
    expect(estadoVigencia(NOVIEMBRE)).toBe("VIGENTE");
    expect(estadoVigencia({ vigente_hoy: false, futura: false })).toBe("ANTERIOR");
    expect(estadoVigencia(ENERO_27)).toBe("FUTURA");
    expect(ETIQUETAS_ESTADO_VIGENCIA).toEqual({
      VIGENTE: "Vigente hoy",
      FUTURA: "Aún no empieza",
      ANTERIOR: "Anterior",
    });
  });

  it("«Reserva overhaul» de la ficha dice desde cuándo vale; sin vigencias, el texto de siempre", () => {
    expect(textoReservaFicha("55.00", [NOVIEMBRE])).toBe("$55 / hr · a partir del 01/11/2026");
    expect(textoReservaFicha("55.00", null)).toBe("$55 / hr");
    expect(textoReservaFicha(null, null)).toBe("— / hr");
    // Ninguna vale hoy todavía: sin fecha inventada.
    expect(textoReservaFicha(null, [ENERO_27])).toBe("— / hr");
  });
});

describe("roles y eliminar", () => {
  it("solo Dirección y Administración cambian tarifas; sin rol no se ofrece", () => {
    expect(puedeEditarReservaOverhaul("DIRECCION")).toBe(true);
    expect(puedeEditarReservaOverhaul("ADMIN")).toBe(true);
    for (const rol of ["COORDINADOR", "ANALISTA", "FACTURACION", "SOCIO", "PILOTO", "MECANICO", "", null, undefined]) {
      expect(puedeEditarReservaOverhaul(rol)).toBe(false);
    }
  });

  it("la única tarifa no se elimina (el API la rechaza); con dos o más sí", () => {
    expect(puedeEliminarVigencia([NOVIEMBRE])).toBe(false);
    expect(puedeEliminarVigencia([])).toBe(false);
    expect(puedeEliminarVigencia([NOVIEMBRE, DESDE_SIEMPRE])).toBe(true);
  });

  it("la confirmación dice QUÉ pasa con los vuelos de ese periodo", () => {
    const lista = [ENERO_27, NOVIEMBRE, { ...DESDE_SIEMPRE, vigente_hoy: false }];
    // Eliminar la «desde siempre»: lo anterior a noviembre queda sin reserva.
    expect(confirmacionEliminarVigencia(lista[2], lista, "N4142R")).toEqual({
      titulo: "¿Eliminar esta tarifa?",
      descripcion:
        "Se elimina la tarifa de N4142R «$0.01 USD por motor × 2 motores = $0.02 USD por hora de vuelo» que vale a partir del 01/01/2026. Los vuelos del 01/01/2026 hasta antes del 01/11/2026 quedan sin reserva de overhaul. Cambia el balance, el reparto y la cuenta de los socios en los meses que no estén cerrados.",
      boton: "Eliminar tarifa",
    });
    // Eliminar la de noviembre: ese tramo vuelve a la tarifa anterior.
    expect(confirmacionEliminarVigencia(NOVIEMBRE, lista, "N4142R").descripcion).toBe(
      "Se elimina la tarifa de N4142R «$55 USD por motor × 2 motores = $110 USD por hora de vuelo» que vale a partir del 01/11/2026. Los vuelos del 01/11/2026 hasta antes del 01/01/2027 pasan a la tarifa anterior: $0.01 USD por motor (a partir del 01/01/2026). Cambia el balance, el reparto y la cuenta de los socios en los meses que no estén cerrados.",
    );
    // Eliminar la última: de ahí en adelante vale la anterior.
    expect(confirmacionEliminarVigencia(ENERO_27, lista, "").descripcion).toContain(
      "Se elimina la tarifa de este avión «$70 USD por motor × 2 motores = $140 USD por hora de vuelo» que vale a partir del 01/01/2027. Los vuelos desde el 01/01/2027 pasan a la tarifa anterior: $55 USD por motor (a partir del 01/11/2026).",
    );
  });
});

describe("reservaParaGuardar · qué viaja con el formulario del avión", () => {
  const base = { conVigencias: true, tarifaInicial: "0.01", desdeInicial: "2026-01-01" };

  it("sin vigencias (API previo o alta): nada nuevo, aunque se toque la tarifa", () => {
    expect(
      reservaParaGuardar({ conVigencias: false, tarifa: "55", desde: "", tarifaInicial: "0.01", desdeInicial: "" }),
    ).toEqual({});
  });

  it("no se tocó ni la tarifa ni la fecha ⇒ no viaja fecha (el guardado de siempre)", () => {
    expect(reservaParaGuardar({ ...base, tarifa: "0.01", desde: "2026-01-01" })).toEqual({});
    // El numeric del API llega como texto con ceros: es la misma tarifa.
    expect(reservaParaGuardar({ ...base, tarifaInicial: "55.00", tarifa: 55, desde: "2026-01-01" })).toEqual({});
    // Avión sin tarifa y sin tocar nada.
    expect(
      reservaParaGuardar({ conVigencias: true, tarifa: "", desde: "", tarifaInicial: "", desdeInicial: "" }),
    ).toEqual({});
  });

  it("se tocó la tarifa o la fecha ⇒ la fecha es OBLIGATORIA y viaja", () => {
    // El caso del cliente: 55 a partir del 1-nov.
    expect(reservaParaGuardar({ ...base, tarifa: "55", desde: "2026-11-01" })).toEqual({ desde: "2026-11-01" });
    // Corregir la tarifa de la misma fecha.
    expect(reservaParaGuardar({ ...base, tarifa: "60", desde: "2026-01-01" })).toEqual({ desde: "2026-01-01" });
    // Solo la fecha.
    expect(reservaParaGuardar({ ...base, tarifa: "0.01", desde: "2026-11-01" })).toEqual({ desde: "2026-11-01" });
    // 0 = sin reserva a partir de ese día.
    expect(reservaParaGuardar({ ...base, tarifa: "0", desde: "2026-12-01" })).toEqual({ desde: "2026-12-01" });
  });

  it("lo que falta se dice en SU campo", () => {
    expect(reservaParaGuardar({ ...base, tarifa: "55", desde: "" })).toEqual({
      error: { campo: "reserva_overhaul_desde", mensaje: ERROR_RESERVA_SIN_FECHA },
    });
    expect(reservaParaGuardar({ ...base, tarifa: "", desde: "2026-11-01" })).toEqual({
      error: { campo: "reserva_overhaul_hr_usd", mensaje: ERROR_RESERVA_SIN_TARIFA },
    });
    expect(reservaParaGuardar({ ...base, tarifa: "55", desde: "01/11/2026" })).toEqual({
      error: { campo: "reserva_overhaul_desde", mensaje: ERROR_RESERVA_FECHA_INVALIDA },
    });
    // Avión sin tarifa vigente: al capturarla por primera vez también pide fecha.
    expect(
      reservaParaGuardar({ conVigencias: true, tarifa: "55", desde: "", tarifaInicial: "", desdeInicial: "" }),
    ).toEqual({ error: { campo: "reserva_overhaul_desde", mensaje: ERROR_RESERVA_SIN_FECHA } });
  });
});

describe("vistaPreviaReserva · lo que va a pasar, en palabras de operador", () => {
  const base = { vigencias: [DESDE_SIEMPRE], tarifaInicial: "0.01", desdeInicial: "2026-01-01" };

  it("sin vigencias, sin cambios o con un dato faltante ⇒ nada que decir", () => {
    expect(vistaPreviaReserva({ ...base, vigencias: null, tarifa: "55", desde: "2026-11-01" })).toBeNull();
    expect(vistaPreviaReserva({ ...base, tarifa: "0.01", desde: "2026-01-01" })).toBeNull();
    expect(vistaPreviaReserva({ ...base, tarifa: "55", desde: "" })).toBeNull();
  });

  it("el caso del cliente: 55 a partir del 1-nov ⇒ tarifa NUEVA y lo anterior conserva la suya", () => {
    expect(vistaPreviaReserva({ ...base, tarifa: "55", desde: "2026-11-01" })).toEqual({
      tono: "info",
      texto:
        "Tarifa nueva a partir del 01/11/2026: $55 USD por motor. Los vuelos anteriores conservan su tarifa ($0.01 USD por motor, a partir del 01/01/2026).",
    });
  });

  it("misma fecha ⇒ se CORRIGE esa tarifa y se avisa que cambia todos los vuelos desde entonces", () => {
    expect(vistaPreviaReserva({ ...base, tarifa: "55", desde: "2026-01-01" })).toEqual({
      tono: "aviso",
      texto:
        "Se corrige la tarifa que vale a partir del 01/01/2026: de $0.01 USD por motor a $55 USD por motor. Cambia la reserva de todos los vuelos desde esa fecha, en los meses que no estén cerrados.",
    });
  });

  it("fecha anterior a todas ⇒ lo previo queda sin reserva y se dice desde cuándo sigue la ya guardada", () => {
    expect(
      vistaPreviaReserva({
        vigencias: [NOVIEMBRE],
        tarifaInicial: "55",
        desdeInicial: "2026-11-01",
        tarifa: "40",
        desde: "2026-09-01",
      }),
    ).toEqual({
      tono: "info",
      texto:
        "Tarifa nueva a partir del 01/09/2026: $40 USD por motor. Los vuelos anteriores a esa fecha quedan sin reserva. Desde el 01/11/2026 sigue valiendo la tarifa ya guardada ($55 USD por motor).",
    });
  });

  it("la MISMA tarifa con una fecha posterior no cambia nada: se avisa y se dice cómo hacer que la reserva EMPIECE ese día", () => {
    const r = vistaPreviaReserva({
      vigencias: [vig({ id: "k", vigente_desde: "2026-01-01", usd_hr_por_motor: 200, motores: 1, vigente_hoy: true })],
      tarifaInicial: "200",
      desdeInicial: "2026-01-01",
      tarifa: "200",
      desde: "2026-11-01",
    });
    expect(r).toEqual({
      tono: "aviso",
      texto: `Esa tarifa ($200 USD por motor) ya vale a partir del 01/01/2026: guardarla con otra fecha no cambia nada. Si la reserva debe EMPEZAR el 01/11/2026, guarda y después elimina la tarifa anterior en «${TITULO_TARIFAS_RESERVA}» de la ficha.`,
    });
  });

  it("0 a partir de una fecha ⇒ «sin reserva» desde ese día", () => {
    expect(
      vistaPreviaReserva({
        vigencias: [NOVIEMBRE],
        tarifaInicial: "55",
        desdeInicial: "2026-11-01",
        tarifa: "0",
        desde: "2027-03-01",
      }),
    ).toEqual({
      tono: "info",
      texto:
        "Tarifa nueva a partir del 01/03/2027: sin reserva. Los vuelos anteriores conservan su tarifa ($55 USD por motor, a partir del 01/11/2026).",
    });
  });

  it("la ayuda fija explica las dos formas de usar la fecha", () => {
    expect(AYUDA_RESERVA_DESDE).toBe(
      "La tarifa vale para los vuelos a partir de esa fecha; los anteriores conservan la que tenían. Con la misma fecha se corrige la tarifa; con otra fecha se agrega una nueva.",
    );
  });
});
