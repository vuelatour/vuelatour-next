/**
 * Gastos sin nómina (16-oct-2026, API 0.0.90): el CONTRATO de `listGastos` /
 * `listGastosAll` con un API previo, con `apiServer` simulado.
 *
 *  1. `excluir_categoria` viaja cuando la consulta lo trae;
 *  2. ante el 400 «property excluir_categoria should not exist» de un API
 *     ≤ 0.0.89 se RELEE sin el campo (los demás intactos) y las páginas
 *     siguientes del anti-cap ya no lo mandan;
 *  3. un 400 de OTRO campo o un 502 se relanzan con UNA sola llamada;
 *  4. sin el campo en la consulta, un 400 cualquiera sube (no se relee).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

const { listGastos, listGastosAll } = await import("../expenses-server");

const sinCampoEnApi = (campo = "excluir_categoria") =>
  new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: `property ${campo} should not exist` });

const fila = (n: number) => ({ id: `g-${n}` });

beforeEach(() => {
  apiServer.mockReset();
});

describe("listGastos · excluir_categoria", () => {
  it("viaja tal cual cuando el API lo conoce (UNA llamada)", async () => {
    apiServer.mockResolvedValue({ data: [fila(1)], count: 1 });
    const r = await listGastos({ excluir_categoria: "NOMINA", desde: "2026-10-01" });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/expenses");
    expect(init.searchParams).toMatchObject({ excluir_categoria: "NOMINA", desde: "2026-10-01" });
    expect(init.cache).toBe("no-store");
    expect(r.count).toBe(1);
  });

  it("API previo: el 400 del campo ⇒ relee SIN él y conserva los demás filtros", async () => {
    apiServer.mockRejectedValueOnce(sinCampoEnApi());
    apiServer.mockResolvedValueOnce({ data: [fila(1)], count: 1 });
    const r = await listGastos({ excluir_categoria: "NOMINA", desde: "2026-10-01", medio_pago: "EFECTIVO" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    const segunda = apiServer.mock.calls[1][1].searchParams;
    expect(segunda).not.toHaveProperty("excluir_categoria");
    expect(segunda).toMatchObject({ desde: "2026-10-01", medio_pago: "EFECTIVO" });
    expect(r.data).toEqual([fila(1)]);
  });

  it("un 400 de OTRO campo o un 502 suben con UNA sola llamada", async () => {
    apiServer.mockRejectedValueOnce(sinCampoEnApi("desde"));
    await expect(listGastos({ excluir_categoria: "NOMINA" })).rejects.toBeInstanceOf(ApiError);
    expect(apiServer).toHaveBeenCalledTimes(1);
    apiServer.mockReset();
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Bad Gateway" }));
    await expect(listGastos({ excluir_categoria: "NOMINA" })).rejects.toBeInstanceOf(ApiError);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("sin el campo en la consulta, el mismo 400 sube (no se relee)", async () => {
    apiServer.mockRejectedValueOnce(sinCampoEnApi());
    await expect(listGastos({ desde: "2026-10-01" })).rejects.toBeInstanceOf(ApiError);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });
});

describe("listGastosAll · anti-cap con API previo", () => {
  it("las páginas siguientes repiten la consulta que FUNCIONÓ (sin el campo)", async () => {
    apiServer.mockRejectedValueOnce(sinCampoEnApi());
    apiServer.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, i) => fila(i)), count: 250 });
    apiServer.mockResolvedValueOnce({ data: Array.from({ length: 50 }, (_, i) => fila(200 + i)), count: 250 });
    const r = await listGastosAll({ excluir_categoria: "NOMINA", categoria: "OPERACIONES" });
    expect(r.data).toHaveLength(250);
    expect(r.count).toBe(250);
    expect(apiServer).toHaveBeenCalledTimes(3);
    const pagina2 = apiServer.mock.calls[2][1].searchParams;
    expect(pagina2).not.toHaveProperty("excluir_categoria");
    expect(pagina2).toMatchObject({ categoria: "OPERACIONES", limit: 200, offset: 200 });
  });

  it("con el API nuevo el campo viaja en TODAS las páginas", async () => {
    apiServer.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, i) => fila(i)), count: 201 });
    apiServer.mockResolvedValueOnce({ data: [fila(200)], count: 201 });
    await listGastosAll({ excluir_categoria: "NOMINA" });
    expect(apiServer.mock.calls[0][1].searchParams).toMatchObject({ excluir_categoria: "NOMINA", offset: 0 });
    expect(apiServer.mock.calls[1][1].searchParams).toMatchObject({ excluir_categoria: "NOMINA", offset: 200 });
  });
});
