/**
 * Server actions de propietarios (19-oct-2026, API 0.0.97): el CUERPO y la
 * RUTA reales que llegan al API.
 *
 *  1. `updateOwnerAction` manda SOLO el diff: `vigente_hasta: null` (reabrir)
 *     y `notas: null` SOBREVIVEN, `undefined` no viaja, y `socio_id` /
 *     `vigente_desde` SÍ pasan (antes el panel los mandaba y el API los
 *     rechazaba con 400);
 *  2. `closeOwnerAction(aircraftId, id, hasta)` = DELETE con `?hasta=`; sin
 *     `hasta`, sin query (el API pone hoy en Cancún);
 *  3. `deleteOwnerAction` = DELETE con `?permanente=true`;
 *  4. `createSocioAction` = POST /v1/users/socios sin revalidar; el 409
 *     `SOCIO_YA_EXISTE` conserva `code` y `details.usuario`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/api/cards-server", () => ({ listCards: vi.fn() }));

const { closeOwnerAction, deleteOwnerAction, updateOwnerAction } = await import("../actions");
const { createSocioAction } = await import("@/app/admin/users/actions");

const AVION = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOCIO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("updateOwnerAction", () => {
  it("PATCH con socio_id, vigente_desde y vigente_hasta: null (los null viajan, nada más)", async () => {
    apiServer.mockResolvedValue({ id: OWNER });
    const res = await updateOwnerAction(AVION, OWNER, {
      socio_id: SOCIO,
      vigente_desde: "2026-01-01",
      vigente_hasta: null,
      notas: null,
    });
    expect(res.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0] as [string, { method: string; body: unknown }];
    expect(ruta).toBe(`/v1/aircraft/owners/${OWNER}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toEqual({ socio_id: SOCIO, vigente_desde: "2026-01-01", vigente_hasta: null, notas: null });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/aircraft/${AVION}`);
  });

  it("el porcentaje viaja como número; un diff vacío no llama al API", async () => {
    apiServer.mockResolvedValue({ id: OWNER });
    await updateOwnerAction(AVION, OWNER, { porcentaje: 40.92 });
    expect((apiServer.mock.calls[0] as [string, { body: unknown }])[1].body).toEqual({ porcentaje: 40.92 });
    const vacio = await updateOwnerAction(AVION, OWNER, {});
    expect(vacio.ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("un uuid malo o una fecha con hora se frenan antes de la red", async () => {
    const r1 = await updateOwnerAction(AVION, OWNER, { socio_id: "no-uuid" });
    expect(r1.ok).toBe(false);
    expect(r1.fieldErrors?.socio_id).toBeTruthy();
    const r2 = await updateOwnerAction(AVION, OWNER, { vigente_hasta: "2026-08-17T00:00:00Z" });
    expect(r2.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("el 400 PROPIETARIO_SUMA_EXCEDE del API llega con su texto", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "PROPIETARIO_SUMA_EXCEDE", message: "Los propietarios sumarían 200 % el 18/08/2026…" }),
    );
    const res = await updateOwnerAction(AVION, OWNER, { porcentaje: 100 });
    expect(res).toMatchObject({ ok: false, error: "Los propietarios sumarían 200 % el 18/08/2026…" });
  });
});

describe("closeOwnerAction y deleteOwnerAction", () => {
  it("cerrar con el último día = DELETE ?hasta=; sin día, sin query", async () => {
    apiServer.mockResolvedValue({ ok: true });
    await closeOwnerAction(AVION, OWNER, "2026-08-17");
    let [ruta, init] = apiServer.mock.calls[0] as [string, { method: string; searchParams?: unknown }];
    expect(ruta).toBe(`/v1/aircraft/owners/${OWNER}`);
    expect(init.method).toBe("DELETE");
    expect(init.searchParams).toEqual({ hasta: "2026-08-17" });
    await closeOwnerAction(AVION, OWNER);
    [ruta, init] = apiServer.mock.calls[1] as [string, { method: string; searchParams?: unknown }];
    expect(init.searchParams).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/aircraft/${AVION}`);
  });

  it("un último día ilegible no sale a la red", async () => {
    const res = await closeOwnerAction(AVION, OWNER, "17/08/2026");
    expect(res).toEqual({ ok: false, error: "Elige el último día." });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("borrar del historial = DELETE ?permanente=true", async () => {
    apiServer.mockResolvedValue({ ok: true, eliminado: {} });
    const res = await deleteOwnerAction(AVION, OWNER);
    expect(res.ok).toBe(true);
    const [, init] = apiServer.mock.calls[0] as [string, { method: string; searchParams?: unknown }];
    expect(init.method).toBe("DELETE");
    expect(init.searchParams).toEqual({ permanente: true });
  });
});

describe("createSocioAction", () => {
  it("POST /v1/users/socios con nombre y es_empresa, sin revalidar", async () => {
    apiServer.mockResolvedValue({ id: SOCIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "INACTIVO" });
    const res = await createSocioAction({ nombre: " Mauricio Roque ", es_empresa: false });
    expect(res.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0] as [string, { method: string; body: unknown }];
    expect(ruta).toBe("/v1/users/socios");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ nombre: "Mauricio Roque", es_empresa: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("el 409 SOCIO_YA_EXISTE conserva code y details.usuario; un nombre corto se frena antes", async () => {
    const usuario = { id: SOCIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "INACTIVO", es_empresa: false };
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "SOCIO_YA_EXISTE",
        message: "Ya existe un usuario con ese nombre: Mauricio Roque (SOCIO). Elígelo en la lista en vez de duplicarlo.",
        details: { usuario },
      }),
    );
    const res = await createSocioAction({ nombre: "mauricio roque" });
    expect(res).toMatchObject({ ok: false, code: "SOCIO_YA_EXISTE", details: { usuario } });
    const corto = await createSocioAction({ nombre: "x" });
    expect(corto.ok).toBe(false);
    expect(corto.fieldErrors?.nombre?.[0]).toBe("Escribe el nombre del socio.");
    expect(apiServer).toHaveBeenCalledTimes(1);
  });
});
