/**
 * `updatePilotAction` (2-oct-2026, «Editar datos» del piloto). Se custodia el
 * CONTRATO con el API:
 *
 *  1. `PATCH /v1/users/:id` con SOLO nombre, teléfono, nombre corto y tarjeta
 *     (el `pick` del formulario; rol, estado, fondo o banderas no viajan
 *     aunque lleguen) — `null` explícito sobrevive (quitar tarjeta/apodo);
 *  2. revalida la lista, el detalle CONCRETO del piloto y Usuarios;
 *  3. un id que no es uuid no llega al API;
 *  4. los errores se traducen (403 de negocio ⇒ texto del API; 403 del
 *     RolesGuard de un API viejo ⇒ «falta actualizar el servidor»; técnico ⇒
 *     «El servidor no respondió…») y devuelven `status`/`code`; nunca lanza.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import { MSG_EDITAR_PILOTO_API_VIEJO, MSG_PILOTO_ID_INVALIDO } from "@/lib/admin/pilotos-edicion";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { updatePilotAction } = await import("../actions");

const ZAMORA = "a0a0a0a0-0000-4000-8000-000000000002";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("updatePilotAction", () => {
  it("PATCH /v1/users/:id con SOLO los 4 campos y revalida lista, detalle y usuarios", async () => {
    apiServer.mockResolvedValue({ id: ZAMORA, nombre: "Abraham Zamora" });
    const r = await updatePilotAction(ZAMORA, {
      nombre: "Abraham Zamora",
      telefono: "+52 9981234567",
      apodo: "  Zamora ",
      tarjeta_terminacion: "1111",
      // Lo que NO es del modo piloto jamás viaja.
      rol: "ADMIN",
      estado: "INACTIVO",
      tiene_fondo_caja: true,
      es_piloto: false,
      es_piloto_externo: true,
    });
    expect(r.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/users/${ZAMORA}`);
    expect(init).toEqual({
      method: "PATCH",
      body: {
        nombre: "Abraham Zamora",
        telefono: "+52 9981234567",
        apodo: "Zamora",
        tarjeta_terminacion: "1111",
      },
    });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/admin/pilots",
      `/admin/pilots/${ZAMORA}`,
      "/admin/users",
    ]);
  });

  it("null explícito sobrevive (quitar tarjeta y apodo); el \"\" del teléfono no viaja", async () => {
    apiServer.mockResolvedValue({ id: ZAMORA });
    await updatePilotAction(ZAMORA, {
      nombre: "Abraham Zamora",
      telefono: "",
      apodo: null,
      tarjeta_terminacion: null,
    });
    expect(apiServer.mock.calls[0][1].body).toEqual({
      nombre: "Abraham Zamora",
      apodo: null,
      tarjeta_terminacion: null,
    });
  });

  it("id que no es uuid: no llama al API", async () => {
    const r = await updatePilotAction("no-es-uuid", { nombre: "X" });
    expect(r).toEqual({ ok: false, error: MSG_PILOTO_ID_INVALIDO });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("validación del pick: nombre vacío o tarjeta mal formada ⇒ fieldErrors sin llamar al API", async () => {
    const r = await updatePilotAction(ZAMORA, { nombre: "", tarjeta_terminacion: "12" });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.nombre).toBeTruthy();
    expect(r.fieldErrors?.tarjeta_terminacion).toBeTruthy();
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("403 SOLO_ADMIN_EDITA_USUARIOS ⇒ texto del API + status/code; sin revalidar", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 403,
        code: "SOLO_ADMIN_EDITA_USUARIOS",
        message: "Ese usuario es de oficina: solo un ADMIN lo edita",
      }),
    );
    const r = await updatePilotAction(ZAMORA, { nombre: "Pablo Canales" });
    expect(r).toEqual({
      ok: false,
      status: 403,
      code: "SOLO_ADMIN_EDITA_USUARIOS",
      error: "Ese usuario es de oficina: solo un ADMIN lo edita",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("403 TARJETA_DE_OTRO_USUARIO ⇒ el nombre del dueño que manda el API", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 403,
        code: "TARJETA_DE_OTRO_USUARIO",
        message: "Esa tarjeta es de Luis Cáceres: un ADMIN la reasigna desde Tarjetas corp.",
      }),
    );
    const r = await updatePilotAction(ZAMORA, { nombre: "Abraham Zamora", tarjeta_terminacion: "0585" });
    expect(r.error).toBe("Esa tarjeta es de Luis Cáceres: un ADMIN la reasigna desde Tarjetas corp.");
    expect(r.code).toBe("TARJETA_DE_OTRO_USUARIO");
  });

  it("403 del RolesGuard de un API viejo ⇒ «falta actualizar el servidor»", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "Required role: ADMIN. Current: COORDINADOR",
      }),
    );
    const r = await updatePilotAction(ZAMORA, { nombre: "Abraham Zamora" });
    expect(r.error).toBe(MSG_EDITAR_PILOTO_API_VIEJO);
    expect(r.status).toBe(403);
  });

  it("fallo técnico (502 / red) ⇒ «El servidor no respondió…», nunca lanza", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Bad Gateway" }),
    );
    const r1 = await updatePilotAction(ZAMORA, { nombre: "Abraham Zamora" });
    expect(r1.error).toBe(MSG_SERVIDOR_NO_RESPONDIO);

    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    const r2 = await updatePilotAction(ZAMORA, { nombre: "Abraham Zamora" });
    expect(r2).toMatchObject({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO });
  });
});
