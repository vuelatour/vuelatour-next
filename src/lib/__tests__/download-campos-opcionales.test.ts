/**
 * `descargarDelApi` con `camposOpcionales` (16-oct-2026, Excel de Gastos con
 * `excluir_categoria`): ante el 400 «property X should not exist» de un API
 * previo se pide UNA vez más sin ese campo; cualquier otro error, como siempre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
  }),
}));
vi.mock("@/lib/env", () => ({ env: { API_URL: "https://api.test" } }));

const { descargarDelApi } = await import("@/lib/download");

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("descargarDelApi · camposOpcionales", () => {
  it("400 del campo ⇒ reintenta UNA vez sin él (los demás parámetros intactos)", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: ["property excluir_categoria should not exist"] }));
    fetchMock.mockResolvedValueOnce(json(500, { message: "Falló otra cosa" }));
    const err = await descargarDelApi("/v1/expenses/export", {
      query: { excluir_categoria: "NOMINA", desde: "2026-10-01" },
      camposOpcionales: ["excluir_categoria"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("excluir_categoria=NOMINA");
    const segunda = String(fetchMock.mock.calls[1][0]);
    expect(segunda).not.toContain("excluir_categoria");
    expect(segunda).toContain("desde=2026-10-01");
    expect(err).toBe("Falló otra cosa");
  });

  it("un 400 de OTRO campo no reintenta y devuelve su mensaje", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: "property desde should not exist" }));
    const err = await descargarDelApi("/v1/expenses/export", {
      query: { excluir_categoria: "NOMINA" },
      camposOpcionales: ["excluir_categoria"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBe("property desde should not exist");
  });

  it("sin `camposOpcionales` el 400 no reintenta (comportamiento de siempre)", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: "property excluir_categoria should not exist" }));
    await descargarDelApi("/v1/expenses/export", { query: { excluir_categoria: "NOMINA" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
