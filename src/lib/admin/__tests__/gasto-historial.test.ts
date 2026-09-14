import { describe, expect, it } from "vitest";
import {
  destinoDeGastosMovidos,
  hrefVuelo,
  notaGastoEnOtroVuelo,
  textoVueloOtro,
  tituloGastoMovido,
} from "@/lib/admin/gasto-historial";

describe("títulos de un gasto que cambió de vuelo", () => {
  it("«movido al vuelo #N» en el vuelo de origen", () => {
    expect(tituloGastoMovido({ tipo: "salio", vuelo_id: "v268", folio: 268 })).toBe(
      "Gasto movido al vuelo #268",
    );
  });

  it("«traído del vuelo #N» en el vuelo destino", () => {
    expect(tituloGastoMovido({ tipo: "llego", vuelo_id: "v260", folio: 260 })).toBe(
      "Gasto traído del vuelo #260",
    );
  });

  it("sin folio no se inventa un número", () => {
    expect(tituloGastoMovido({ tipo: "salio", vuelo_id: "v", folio: null })).toBe(
      "Gasto movido a otro vuelo",
    );
    expect(textoVueloOtro(null)).toBe("otro vuelo");
    expect(textoVueloOtro(268)).toBe("vuelo #268");
  });

  it("la nota de las líneas viejas dice dónde vive ahora", () => {
    expect(notaGastoEnOtroVuelo(268)).toBe("Ahora vive en el vuelo #268");
    expect(notaGastoEnOtroVuelo(null)).toBe("Ahora vive en otro vuelo");
  });

  it("el enlace apunta al detalle del vuelo", () => {
    expect(hrefVuelo("abc-123")).toBe("/admin/flights/abc-123");
  });
});

describe("destinoDeGastosMovidos", () => {
  const evento = (
    gasto_id: string,
    created_at: string,
    movimiento?: { tipo: "salio" | "llego"; vuelo_id: string; folio: number | null },
  ) => ({ gasto_id, created_at, movimiento: movimiento ?? null });

  it("mapea cada gasto que SALIÓ con su destino", () => {
    // Caso real: vuelo #260, el gasto de CZM se movió al #268.
    const eventos = [
      evento("g-czm", "2026-09-14T14:03:00Z"),
      evento("g-czm", "2026-09-14T14:27:00Z", {
        tipo: "salio",
        vuelo_id: "v-268",
        folio: 268,
      }),
      evento("g-cun", "2026-09-14T14:04:00Z"),
    ];
    const destinos = destinoDeGastosMovidos(eventos);
    expect(destinos["g-czm"]).toEqual({ tipo: "salio", vuelo_id: "v-268", folio: 268 });
    expect(destinos["g-cun"]).toBeUndefined();
  });

  it("ignora los que LLEGARON (ese gasto sí vive aquí)", () => {
    const destinos = destinoDeGastosMovidos([
      evento("g1", "2026-09-14T14:27:00Z", { tipo: "llego", vuelo_id: "v-260", folio: 260 }),
    ]);
    expect(destinos).toEqual({});
  });

  it("con varias salidas gana la más reciente", () => {
    const destinos = destinoDeGastosMovidos([
      evento("g1", "2026-09-10T10:00:00Z", { tipo: "salio", vuelo_id: "v-1", folio: 1 }),
      evento("g1", "2026-09-12T10:00:00Z", { tipo: "salio", vuelo_id: "v-2", folio: 2 }),
    ]);
    expect(destinos["g1"].folio).toBe(2);
  });
});

/**
 * REVISIÓN 14-sep-2026 — el API manda `vuelo_id: null` cuando NO hay
 * contraparte: al gasto se le QUITÓ el vuelo (`salio`) o se le ASIGNÓ éste
 * estando suelto (`llego`, el caso más frecuente: la oficina liga un gasto
 * de la bandeja a un vuelo). Antes el tipo decía `string`, el título mentía
 * («Gasto traído de otro vuelo») y la liga apuntaba a /admin/flights/null.
 */
describe("movimiento SIN vuelo contraparte (vuelo_id null)", () => {
  it("«llego» sin origen = se le asignó ESTE vuelo, no vino de otro", () => {
    expect(tituloGastoMovido({ tipo: "llego", vuelo_id: null, folio: null })).toBe(
      "Gasto asignado a este vuelo",
    );
  });

  it("«salio» sin destino = se le quitó el vuelo", () => {
    expect(tituloGastoMovido({ tipo: "salio", vuelo_id: null, folio: null })).toBe(
      "Gasto desligado de este vuelo",
    );
  });

  it("una salida sin destino NO entra al mapa «ahora vive en…»", () => {
    const mapa = destinoDeGastosMovidos([
      {
        gasto_id: "g1",
        created_at: "2026-09-14T14:27:00Z",
        movimiento: { tipo: "salio", vuelo_id: null, folio: null },
      },
    ]);
    expect(mapa.g1).toBeUndefined();
  });

  it("con destino real sí entra (y gana el más reciente)", () => {
    const mapa = destinoDeGastosMovidos([
      {
        gasto_id: "g1",
        created_at: "2026-09-14T14:27:00Z",
        movimiento: { tipo: "salio", vuelo_id: "v268", folio: 268 },
      },
      {
        gasto_id: "g1",
        created_at: "2026-09-14T15:00:00Z",
        movimiento: { tipo: "salio", vuelo_id: "v300", folio: 300 },
      },
    ]);
    expect(mapa.g1.vuelo_id).toBe("v300");
    expect(notaGastoEnOtroVuelo(mapa.g1.folio)).toBe("Ahora vive en el vuelo #300");
    expect(hrefVuelo(mapa.g1.vuelo_id!)).toBe("/admin/flights/v300");
  });
});
