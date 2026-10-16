/**
 * VARIAS FACTURAS POR GASTO (16-oct-2026, API 0.0.86) en las server actions:
 *
 *  1. `subirFacturasGastoAction` manda `archivos[]` y NO revalida (el
 *     diálogo sigue abierto; refresca al cerrar).
 *  2. SKEW con el API 0.0.85 (400 «property archivos should not exist»):
 *     con UNA factura reintenta con el shape de SIEMPRE; con varias no sube
 *     nada y responde CODIGO_API_SIN_VARIAS (la segunda reemplazaría a la
 *     primera en silencio).
 *  3. `facturasDeGastoAction`: `facturas` del detalle (0.0.86) o, sin la
 *     llave, la única factura amarrada (GET recibidas/:id).
 *  4. `quitarFacturaDeGastoAction`: DELETE …/gastos/:gastoId; un API previo
 *     sin la ruta se dice en es-MX.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { CODIGO_API_SIN_VARIAS, TEXTO_QUITAR_NO_DISPONIBLE } from "@/lib/admin/facturas-gasto";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { subirFacturasGastoAction, facturasDeGastoAction, quitarFacturaDeGastoAction } = await import(
  "../actions"
);

const GASTO = "24b941d4-bc81-44d3-a388-a6bc17c05cdf";
const FACT = "7a301bfe-1111-4a7b-8c9d-0e1f2a3b4c5d";

const rechazoArchivos = () =>
  new ApiError({ statusCode: 400, code: "VALIDATION", message: "property archivos should not exist" });

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("subirFacturasGastoAction", () => {
  it("API 0.0.86: un POST con archivos[] y la respuesta nueva; sin revalidar", async () => {
    apiServer.mockResolvedValue({
      facturas: [{ id: FACT, principal: true }],
      agregadas: 2,
      ya_existian: 0,
      avisos: ["Las facturas suman $10; el gasto es $20"],
    });
    const r = await subirFacturasGastoAction({
      gastoId: GASTO,
      archivos: [
        { pdf_b64: "PDF1", xml_b64: "XML1", nombre: "a.pdf" },
        { pdf_b64: "PDF2", nombre: "b.pdf" },
        { nombre: "vacío" },
      ],
    });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/invoices/recibidas/de-gasto");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({
      gasto_id: GASTO,
      archivos: [
        { xml_b64: "XML1", pdf_b64: "PDF1", nombre: "a.pdf" },
        { pdf_b64: "PDF2", nombre: "b.pdf" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ modo: "VARIAS", agregadas: 2, ya_existian: 0 });
    expect(r.data?.avisos).toHaveLength(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("API 0.0.85 con UNA factura: reintenta con el shape de siempre", async () => {
    apiServer.mockRejectedValueOnce(rechazoArchivos()).mockResolvedValueOnce({ id: FACT, ya_existia: false });
    const r = await subirFacturasGastoAction({
      gastoId: GASTO,
      archivos: [{ pdf_b64: "PDF1", xml_b64: "XML1", nombre: "a.pdf" }],
      permitirLegado: true,
    });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(apiServer.mock.calls[1][1].body).toEqual({
      gasto_id: GASTO,
      xml_b64: "XML1",
      pdf_b64: "PDF1",
      pdf_nombre: "a.pdf",
    });
    expect(r).toMatchObject({ ok: true, data: { modo: "LEGADO", agregadas: 1, ya_existian: 0, facturas: null } });
  });

  it("API 0.0.85 con UNA factura SIN permiso de reemplazar: no sube nada (no reemplaza a ciegas)", async () => {
    apiServer.mockRejectedValueOnce(rechazoArchivos());
    const r = await subirFacturasGastoAction({ gastoId: GASTO, archivos: [{ pdf_b64: "P1" }] });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(r.code).toBe(CODIGO_API_SIN_VARIAS);
  });

  it("API 0.0.85 con VARIAS: no sube nada y lo dice con su código", async () => {
    apiServer.mockRejectedValueOnce(rechazoArchivos());
    const r = await subirFacturasGastoAction({
      gastoId: GASTO,
      archivos: [{ pdf_b64: "P1" }, { pdf_b64: "P2" }],
    });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(CODIGO_API_SIN_VARIAS);
    expect(r.error).toMatch(/No se subió nada/);
  });

  it("0.0.86 con la migración pendiente (503 FACTURAS_GASTO_NO_DISPONIBLE): el mismo código, sin reintentar", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "FACTURAS_GASTO_NO_DISPONIBLE", message: "Subir varias facturas…" }),
    );
    const r = await subirFacturasGastoAction({
      gastoId: GASTO,
      archivos: [{ pdf_b64: "P1" }, { pdf_b64: "P2" }],
    });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(r.code).toBe(CODIGO_API_SIN_VARIAS);
  });

  it("otro error del API pasa tal cual (sin reintentar)", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 400, code: "XML_INVALIDO", message: "El XML no es un CFDI válido." }),
    );
    const r = await subirFacturasGastoAction({ gastoId: GASTO, archivos: [{ xml_b64: "X" }] });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: false, error: "El XML no es un CFDI válido." });
  });

  it("sin archivos o gasto inválido: no llama al API", async () => {
    expect((await subirFacturasGastoAction({ gastoId: GASTO, archivos: [] })).ok).toBe(false);
    expect((await subirFacturasGastoAction({ gastoId: "x", archivos: [{ pdf_b64: "P" }] })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("facturasDeGastoAction", () => {
  it("API 0.0.86: las facturas del detalle (la principal primero)", async () => {
    apiServer.mockResolvedValueOnce({
      id: GASTO,
      factura_recibida_id: FACT,
      facturas: [
        { id: "otra", principal: false, total: "10" },
        { id: FACT, principal: true },
      ],
      facturas_avisos: ["Las facturas suman $10; el gasto es $3,601.77."],
      facturas_multiples: true,
    });
    const r = await facturasDeGastoAction(GASTO);
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer.mock.calls[0][0]).toBe(`/v1/expenses/${GASTO}`);
    expect(r.data?.varias).toBe(true);
    expect(r.data?.avisos).toEqual(["Las facturas suman $10; el gasto es $3,601.77."]);
    expect(r.data?.facturas.map((f) => f.id)).toEqual([FACT, "otra"]);
  });

  it("0.0.86 con la migración pendiente: `facturas_multiples: false` ⇒ una por gasto", async () => {
    apiServer.mockResolvedValueOnce({
      id: GASTO,
      factura_recibida_id: FACT,
      facturas: [{ id: FACT, principal: true }],
      facturas_avisos: [],
      facturas_multiples: false,
    });
    const r = await facturasDeGastoAction(GASTO);
    expect(r.data).toMatchObject({ varias: false, avisos: [] });
    expect(r.data?.facturas).toHaveLength(1);
  });

  it("API 0.0.85: sin `facturas` arma la lista con la única factura amarrada", async () => {
    apiServer
      .mockResolvedValueOnce({ id: GASTO, factura_recibida_id: FACT })
      .mockResolvedValueOnce({ id: FACT, pdf_url: "recibidas/x.pdf", notas: "Factura en PDF (sin XML): a.pdf" });
    const r = await facturasDeGastoAction(GASTO);
    expect(apiServer.mock.calls[1][0]).toBe(`/v1/invoices/recibidas/${FACT}`);
    expect(r.data?.varias).toBe(false);
    expect(r.data?.facturas).toHaveLength(1);
    expect(r.data?.facturas[0]).toMatchObject({ id: FACT, principal: true, nombre: "a.pdf" });
  });

  it("0.0.86 que no pudo leer las facturas (bandera sin lista): FALLO de carga, no «API previo»", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO, factura_recibida_id: FACT, facturas_multiples: true });
    const r = await facturasDeGastoAction(GASTO);
    expect(r.ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
    apiServer.mockResolvedValueOnce({ id: GASTO, factura_recibida_id: FACT, facturas_error: true });
    expect((await facturasDeGastoAction(GASTO)).ok).toBe(false);
  });

  it("API 0.0.85 sin factura: lista vacía sin segunda llamada; un fallo NO es «sin facturas»", async () => {
    apiServer.mockResolvedValueOnce({ id: GASTO, factura_recibida_id: null });
    expect((await facturasDeGastoAction(GASTO)).data).toEqual({ varias: false, facturas: [], avisos: [] });
    expect(apiServer).toHaveBeenCalledTimes(1);
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 503, code: "X", message: "caído" }));
    expect((await facturasDeGastoAction(GASTO)).ok).toBe(false);
  });
});

describe("quitarFacturaDeGastoAction", () => {
  it("DELETE de la liga (no de la factura) y sin revalidar", async () => {
    apiServer.mockResolvedValueOnce({});
    const r = await quitarFacturaDeGastoAction({ facturaId: FACT, gastoId: GASTO });
    expect(r.ok).toBe(true);
    expect(apiServer.mock.calls[0][0]).toBe(`/v1/invoices/recibidas/${FACT}/gastos/${GASTO}`);
    expect(apiServer.mock.calls[0][1]).toEqual({ method: "DELETE" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 GASTO_FACTURAS_CAMBIARON: con código y status (el diálogo recarga)", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "GASTO_FACTURAS_CAMBIARON", message: "Las facturas de este gasto cambiaron." }),
    );
    const r = await quitarFacturaDeGastoAction({ facturaId: FACT, gastoId: GASTO });
    expect(r).toMatchObject({ ok: false, status: 409, code: "GASTO_FACTURAS_CAMBIARON" });
  });

  it("API previo (la ruta no existe): texto en es-MX", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot DELETE /v1/invoices/recibidas/${FACT}/gastos/${GASTO}` }),
    );
    expect(await quitarFacturaDeGastoAction({ facturaId: FACT, gastoId: GASTO })).toEqual({
      ok: false,
      error: TEXTO_QUITAR_NO_DISPONIBLE,
    });
  });
});
