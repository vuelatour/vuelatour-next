/**
 * Rango de fechas de la lista de cotizaciones (13-oct-2026): el CONTRATO de
 * `listQuotesAll` y `getQuoteVecinos` con el API, con `apiServer` simulado.
 *
 *  1. sin rango NO viaja `desde` ni `hasta` (un API previo nunca los ve);
 *  2. con rango viajan tal cual en TODAS las páginas del anti-cap;
 *  3. ante el 400 «property desde should not exist» de un API previo se
 *     vuelve a leer SIN rango (mismos estado/q/grupo_id) y la respuesta dice
 *     `rangoIgnorado: true` — nunca la pantalla rota ni «Sin cotizaciones»;
 *  4. un 400 de OTRO campo o un 502 se relanzan con UNA sola llamada;
 *  5. `/vecinos`: el rango viaja; el mismo 400 reintenta sin rango; 404/403
 *     ⇒ null sin reintento; 500 lanza.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

const { listQuotesAll, getQuoteVecinos } = await import("../quotes-server");

const ID = "bbbbbbbb-0000-4000-8000-000000000341";
const GRUPO = "dddddddd-0000-4000-8000-000000000001";

const sinRangoEnApi = (campo = "desde") =>
  new ApiError({
    statusCode: 400,
    code: "BAD_REQUEST",
    message: `property ${campo} should not exist`,
  });

const fila = (n: number) => ({ id: `q-${n}`, folio: n });

beforeEach(() => {
  apiServer.mockReset();
});

describe("listQuotesAll · rango de fechas", () => {
  it("sin rango: UNA llamada cuyos searchParams NO traen desde ni hasta; rangoIgnorado=false", async () => {
    apiServer.mockResolvedValue({ data: [fila(1)], count: 1 });
    const r = await listQuotesAll({ estado: "COTIZADO" });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/quotes");
    expect(init.searchParams).not.toHaveProperty("desde");
    expect(init.searchParams).not.toHaveProperty("hasta");
    expect(init.searchParams).toMatchObject({ estado: "COTIZADO", limit: 200, offset: 0 });
    expect(r).toEqual({ data: [fila(1)], count: 1, rangoIgnorado: false });
  });

  it("con rango: viaja tal cual y en TODAS las páginas del anti-cap (200 en 200)", async () => {
    const primera = Array.from({ length: 200 }, (_, i) => fila(i));
    const segunda = Array.from({ length: 50 }, (_, i) => fila(200 + i));
    apiServer
      .mockResolvedValueOnce({ data: primera, count: 250 })
      .mockResolvedValueOnce({ data: segunda, count: 250 });
    const r = await listQuotesAll({ q: "maqar", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(apiServer.mock.calls[0][1].searchParams).toMatchObject({
      q: "maqar",
      desde: "2026-10-01",
      hasta: "2026-10-31",
      limit: 200,
      offset: 0,
    });
    expect(apiServer.mock.calls[1][1].searchParams).toMatchObject({
      q: "maqar",
      desde: "2026-10-01",
      hasta: "2026-10-31",
      limit: 200,
      offset: 200,
    });
    expect(r.data).toHaveLength(250);
    expect(r.count).toBe(250);
    expect(r.rangoIgnorado).toBe(false);
  });

  it("API previo (400 «property desde should not exist»): relee SIN rango con los demás filtros y rangoIgnorado=true", async () => {
    apiServer
      .mockRejectedValueOnce(sinRangoEnApi())
      .mockResolvedValueOnce({ data: [fila(7)], count: 1 });
    const r = await listQuotesAll({
      estado: "COTIZADO",
      q: "maqar",
      grupo_id: GRUPO,
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    expect(apiServer).toHaveBeenCalledTimes(2);
    const segunda = apiServer.mock.calls[1][1].searchParams;
    expect(segunda).not.toHaveProperty("desde");
    expect(segunda).not.toHaveProperty("hasta");
    expect(segunda).toMatchObject({ estado: "COTIZADO", q: "maqar", grupo_id: GRUPO, limit: 200, offset: 0 });
    expect(r).toEqual({ data: [fila(7)], count: 1, rangoIgnorado: true });
  });

  it("el 400 por «hasta» también cuenta como API previo", async () => {
    apiServer
      .mockRejectedValueOnce(sinRangoEnApi("hasta"))
      .mockResolvedValueOnce({ data: [], count: 0 });
    const r = await listQuotesAll({ hasta: "2026-10-31" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(r.rangoIgnorado).toBe(true);
  });

  it("un 400 de OTRO campo se relanza con UNA sola llamada (no se disfraza de lista)", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: "property tramos_base should not exist" }),
    );
    await expect(
      listQuotesAll({ desde: "2026-10-01", hasta: "2026-10-31" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("un 502 del deploy se relanza con UNA sola llamada aunque haya rango", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Application failed to respond" }),
    );
    await expect(listQuotesAll({ desde: "2026-10-01" })).rejects.toMatchObject({ status: 502 });
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("el 400 del rango SIN rango en la consulta no se reintenta (no hay nada que quitar)", async () => {
    apiServer.mockRejectedValue(sinRangoEnApi());
    await expect(listQuotesAll({ estado: "COTIZADO" })).rejects.toMatchObject({ status: 400 });
    expect(apiServer).toHaveBeenCalledTimes(1);
  });
});

describe("getQuoteVecinos · rango de fechas", () => {
  const VECINOS = { anterior: null, siguiente: null, sin_fecha: false };

  it("manda el rango a /v1/quotes/:id/vecinos junto con los demás filtros", async () => {
    apiServer.mockResolvedValue(VECINOS);
    const r = await getQuoteVecinos(ID, { q: "maqar", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/quotes/${ID}/vecinos`);
    expect(init).toEqual({
      searchParams: { q: "maqar", desde: "2026-10-01", hasta: "2026-10-31" },
      cache: "no-store",
    });
    expect(r).toEqual(VECINOS);
  });

  it("API previo (400 del rango): reintenta SIN rango y devuelve los vecinos de la lista degradada", async () => {
    apiServer.mockRejectedValueOnce(sinRangoEnApi()).mockResolvedValueOnce(VECINOS);
    const r = await getQuoteVecinos(ID, { estado: "COTIZADO", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(apiServer.mock.calls[1][1].searchParams).toEqual({ estado: "COTIZADO" });
    expect(r).toEqual(VECINOS);
  });

  it("404 (ruta inexistente) y 403 (rol) ⇒ null SIN reintento", async () => {
    for (const statusCode of [404, 403]) {
      apiServer.mockReset();
      apiServer.mockRejectedValue(new ApiError({ statusCode, code: "X", message: "nope" }));
      const r = await getQuoteVecinos(ID, { desde: "2026-10-01" });
      expect(r).toBeNull();
      expect(apiServer).toHaveBeenCalledTimes(1);
    }
  });

  it("500 lanza (la página lo degrada con aviso, nunca «no hay siguiente»)", async () => {
    apiServer.mockRejectedValue(new ApiError({ statusCode: 500, code: "ERR", message: "boom" }));
    await expect(getQuoteVecinos(ID, { desde: "2026-10-01" })).rejects.toMatchObject({ status: 500 });
    expect(apiServer).toHaveBeenCalledTimes(1);
  });
});
