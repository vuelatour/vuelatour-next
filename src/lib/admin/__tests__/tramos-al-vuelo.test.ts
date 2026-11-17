/**
 * «PASAR ESTOS TRAMOS AL VUELO» (17-nov-2026, API 0.0.141, caso #478):
 * cuándo se ofrece el botón, cuándo se apaga y qué dice.
 *
 * Los datos son los REALES del #478: nació como RESERVA con UN tramo
 * CUN → MHL y se cotizó después como CUN → CTM → MHL → CTM → CUN.
 */
import { describe, expect, it } from "vitest";
import {
  BOTON_CONFIRMAR_PASAR_TRAMOS,
  ETIQUETA_PASAR_TRAMOS,
  MOTIVO_GUARDA_PRIMERO,
  TEXTO_PASAR_TRAMOS_NO_DISPONIBLE,
  estadoPasarTramosAlVuelo,
  mensajeErrorPasarTramos,
  rutaEnTexto,
  textoConfirmarPasarTramos,
  textoTramosPasados,
  type QuoteParaPasarTramos,
} from "../tramos-al-vuelo";

const COTIZADOS = [
  { origen_iata: "CUN", destino_iata: "CTM" },
  { origen_iata: "CTM", destino_iata: "MHL" },
  { origen_iata: "MHL", destino_iata: "CTM" },
  { origen_iata: "CTM", destino_iata: "CUN" },
];

function quote478(extra: Partial<QuoteParaPasarTramos> = {}): QuoteParaPasarTramos {
  return {
    estado: "CONFIRMADO",
    itinerario_operativo: true,
    combinado_con_id: null,
    calculo_snapshot: { ruta: { escalas: COTIZADOS } },
    escalas: [
      {
        orden: 1,
        origen_iata: "CUN",
        destino_iata: "MHL",
        taco_salida: null,
        taco_llegada: null,
        cancelada_at: null,
        solo_operativa: false,
      },
    ],
    ...extra,
  };
}

const estado = (
  extra: Partial<QuoteParaPasarTramos> = {},
  rol: string | null = "ADMIN",
  hayCambios = false,
) => estadoPasarTramosAlVuelo({ quote: quote478(extra), rol, hayCambios });

describe("caso #478: el botón se ofrece y dice las dos rutas", () => {
  it("visible y encendido, con la ruta del vuelo y la de la cotización", () => {
    expect(estado()).toEqual({
      visible: true,
      habilitado: true,
      motivo: null,
      rutaCotizada: "CUN → CTM → MHL → CTM → CUN",
      rutaVuelo: "CUN → MHL",
    });
  });

  it("con cambios sin guardar se VE pero apagado, y dice por qué", () => {
    expect(estado({}, "ADMIN", true)).toMatchObject({
      visible: true,
      habilitado: false,
      motivo: MOTIVO_GUARDA_PRIMERO,
    });
  });

  it("la confirmación dice qué sale, qué entra y qué NO cambia", () => {
    const t = textoConfirmarPasarTramos({
      rutaVuelo: "CUN → MHL",
      rutaCotizada: "CUN → CTM → MHL → CTM → CUN",
    });
    expect(t).toContain("dejará su ruta de hoy (CUN → MHL)");
    expect(t).toContain("CUN → CTM → MHL → CTM → CUN, con sus pasajeros y horarios");
    expect(t).toContain("La tripulación recibe aviso");
    expect(t).toContain("El precio no cambia");
    expect(t).toContain("se actualizan al guardar la cotización");
    // Un vuelo sin tramos vivos no «deja» ninguna ruta.
    expect(
      textoConfirmarPasarTramos({ rutaVuelo: "—", rutaCotizada: "CUN → HOL → CUN" }),
    ).toMatch(/^El vuelo tomará los tramos de la cotización: CUN → HOL → CUN/);
  });
});

describe("cuándo NO se ofrece (mismos candados que el API)", () => {
  it("el vuelo ya sigue la cotización, o no hay cotización", () => {
    expect(estado({ itinerario_operativo: false })).toEqual({ visible: false });
    expect(estado({ itinerario_operativo: null })).toEqual({ visible: false });
    expect(
      estadoPasarTramosAlVuelo({ quote: null, rol: "ADMIN", hayCambios: false }),
    ).toEqual({ visible: false });
  });

  it("el rol no guarda cotizaciones; sin rol (no se pudo leer) sí se ofrece", () => {
    for (const rol of ["SOCIO", "FACTURACION", "ANALISTA", "PILOTO"]) {
      expect(estado({}, rol)).toEqual({ visible: false });
    }
    for (const rol of ["ADMIN", "COORDINADOR", null]) {
      expect(estado({}, rol).visible).toBe(true);
    }
  });

  it("cancelado, en vuelo, completado o con un tacómetro capturado", () => {
    expect(estado({ estado: "CANCELADO" })).toEqual({ visible: false });
    expect(estado({ estado: "EN_VUELO" })).toEqual({ visible: false });
    expect(estado({ estado: "COMPLETADO" })).toEqual({ visible: false });
    expect(
      estado({
        escalas: [
          { orden: 1, origen_iata: "CUN", destino_iata: "MHL", taco_salida: 5599.4 },
        ],
      }),
    ).toEqual({ visible: false });
  });

  it("combinado con otro vuelo o avión de un grupo", () => {
    expect(estado({ combinado_con_id: "otro" })).toEqual({ visible: false });
    expect(estado({ grupo_id: "g-12" })).toEqual({ visible: false });
    expect(estado({ grupo: { id: "g-12" } })).toEqual({ visible: false });
  });

  it("sin tramos cotizados guardados, o con un tramo incompleto", () => {
    expect(estado({ calculo_snapshot: null })).toEqual({ visible: false });
    expect(estado({ calculo_snapshot: { ruta: { escalas: [] } } })).toEqual({
      visible: false,
    });
    expect(
      estado({
        calculo_snapshot: { ruta: { escalas: [{ origen_iata: "CUN", destino_iata: "" }] } },
      }),
    ).toEqual({ visible: false });
  });
});

describe("textos", () => {
  it("rutaEnTexto: encadenada, tramo por tramo y vacía (espejo del API)", () => {
    expect(rutaEnTexto(COTIZADOS)).toBe("CUN → CTM → MHL → CTM → CUN");
    expect(
      rutaEnTexto([
        { origen_iata: "CUN", destino_iata: "MHL" },
        { origen_iata: "CZM", destino_iata: "CUN" },
      ]),
    ).toBe("CUN → MHL · CZM → CUN");
    expect(rutaEnTexto([])).toBe("—");
  });

  it("la ruta del vuelo ignora cancelados y operativos internos, y va por orden", () => {
    const e = estado({
      escalas: [
        { orden: 2, origen_iata: "MHL", destino_iata: "CUN" },
        { orden: 1, origen_iata: "CUN", destino_iata: "MHL" },
        { orden: 3, origen_iata: "CUN", destino_iata: "CZM", cancelada_at: "2026-11-01" },
        { orden: 100, origen_iata: "CUN", destino_iata: "TQO", solo_operativa: true },
      ],
    });
    expect(e.visible && e.rutaVuelo).toBe("CUN → MHL → CUN");
  });

  it("toast de éxito: cuántos tramos y cuál ruta", () => {
    expect(
      textoTramosPasados({ folio: 478, tramos: 4, ruta: "CUN → CTM → MHL → CTM → CUN" }),
    ).toBe("Listo: el vuelo #478 ahora tiene 4 tramos (CUN → CTM → MHL → CTM → CUN).");
    expect(textoTramosPasados({ tramos: 1 })).toBe("Listo: el vuelo ahora tiene 1 tramo.");
  });

  it("errores: el mensaje del API tal cual; ruta inexistente ⇒ «falta actualizar»", () => {
    expect(
      mensajeErrorPasarTramos({
        error: "El vuelo ya salió o tiene tacómetros capturados…",
        status: 409,
        code: "VUELO_YA_VOLO",
      }),
    ).toBe("El vuelo ya salió o tiene tacómetros capturados…");
    expect(
      mensajeErrorPasarTramos({
        error: "Cannot POST /v1/quotes/abc/tramos-al-vuelo",
        status: 404,
      }),
    ).toBe(TEXTO_PASAR_TRAMOS_NO_DISPONIBLE);
    // Un 404 del propio API (el vuelo no existe) NO es «falta actualizar».
    expect(
      mensajeErrorPasarTramos({ error: "Vuelo abc not found", status: 404 }),
    ).toBe("Vuelo abc not found");
    expect(mensajeErrorPasarTramos({})).toBe(
      "No se pudieron pasar los tramos al vuelo. Vuelve a intentarlo.",
    );
  });

  it("los rótulos del botón y de su confirmación", () => {
    expect(ETIQUETA_PASAR_TRAMOS).toBe("Pasar estos tramos al vuelo");
    expect(BOTON_CONFIRMAR_PASAR_TRAMOS).toBe("Sí, pasarlos al vuelo");
  });
});
