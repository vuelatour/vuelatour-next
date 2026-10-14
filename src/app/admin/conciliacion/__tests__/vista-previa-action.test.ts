/**
 * Contrato de la importación del 13-oct-2026 (API 0.0.75):
 *  1. `vistaPreviaImportAction` = `POST /v1/conciliacion/importar/vista-previa`
 *     con SOLO la cuenta y los movimientos (nunca el archivo); uuid validado
 *     antes de la red; un 404 «Cannot POST» (API previo) ⇒
 *     `RUTA_NO_DISPONIBLE`; nunca lanza ni revalida (no escribe nada);
 *  2. `importarMovimientosAsyncAction` manda `solo_enriquecer` SOLO en true y
 *     traduce el 400 del DTO previo a `API_SIN_ENRIQUECER`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_API_SIN_ENRIQUECER } from "@/lib/admin/conciliacion-importacion";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { vistaPreviaImportAction, importarMovimientosAsyncAction } = await import("../actions");

const CUENTA = "212add6c-c4e5-44cc-a30c-0635c0ab3036";
const MOVS = [{ fecha: "2026-09-30", descripcion: "SEL TRANSF. INTERBANCARIA SPEI BANORTE fact vip 7360", monto: 11205.6, tipo: "CARGO" as const }];
const VP = {
  total: 1,
  ya_estaban: 1,
  nuevos: 0,
  nuevos_mismo_dia_y_monto: 0,
  se_enriquecen: 1,
  enriquecimiento_omitidos: 0,
  moneda: "MXN",
  omitidos: [],
  nuevos_detalle: [],
  enriquecibles_detalle: [],
};

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("vistaPreviaImportAction", () => {
  it("ruta y cuerpo: solo la cuenta y los movimientos (sin filename ni file_base64)", async () => {
    apiServer.mockResolvedValue(VP);
    const r = await vistaPreviaImportAction({
      cuenta_bancaria_id: CUENTA,
      movimientos: MOVS,
      // Aunque llegaran, el archivo NO viaja a la vista previa.
      ...({ filename: "scotia eje sep.pdf", file_base64: "QUJD" } as object),
    } as Parameters<typeof vistaPreviaImportAction>[0]);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/conciliacion/importar/vista-previa");
    expect(init).toEqual({ method: "POST", body: { cuenta_bancaria_id: CUENTA, movimientos: MOVS } });
    expect(r).toEqual({ ok: true, data: VP });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("cuenta que no es uuid: no llama al API", async () => {
    const r = await vistaPreviaImportAction({ cuenta_bancaria_id: "nada", movimientos: MOVS });
    expect(r.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("404 «Cannot POST» (API previo) ⇒ RUTA_NO_DISPONIBLE", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot POST /v1/conciliacion/importar/vista-previa" }),
    );
    const r = await vistaPreviaImportAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("RUTA_NO_DISPONIBLE");
  });

  it("cualquier otro fallo vuelve como error (nunca lanza)", async () => {
    apiServer.mockRejectedValue(new ApiError({ statusCode: 502, code: "BAD_GATEWAY", message: "Bad Gateway" }));
    const r = await vistaPreviaImportAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS });
    expect(r).toMatchObject({ ok: false, status: 502 });
    apiServer.mockRejectedValue(new Error("fetch failed"));
    await expect(vistaPreviaImportAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS })).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("importarMovimientosAsyncAction: solo_enriquecer", () => {
  it("viaja SOLO en true", async () => {
    apiServer.mockResolvedValue({ job_id: "j1" });
    await importarMovimientosAsyncAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS, solo_enriquecer: true });
    expect(apiServer.mock.calls[0][1].body).toEqual({ cuenta_bancaria_id: CUENTA, movimientos: MOVS, solo_enriquecer: true });
    await importarMovimientosAsyncAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS, solo_enriquecer: false });
    expect(apiServer.mock.calls[1][1].body).toEqual({ cuenta_bancaria_id: CUENTA, movimientos: MOVS });
    await importarMovimientosAsyncAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS });
    expect(apiServer.mock.calls[2][1].body).toEqual({ cuenta_bancaria_id: CUENTA, movimientos: MOVS });
    expect(apiServer.mock.calls[2][0]).toBe("/v1/conciliacion/importar-async");
  });

  it("400 «property solo_enriquecer should not exist» (API previo) ⇒ API_SIN_ENRIQUECER", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: "property solo_enriquecer should not exist" }),
    );
    const r = await importarMovimientosAsyncAction({ cuenta_bancaria_id: CUENTA, movimientos: MOVS, solo_enriquecer: true });
    expect(r).toEqual({ ok: false, code: "API_SIN_ENRIQUECER", status: 400, error: MSG_API_SIN_ENRIQUECER });
  });
});
