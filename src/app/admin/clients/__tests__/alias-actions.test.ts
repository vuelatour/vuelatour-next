/**
 * Alias del cliente (ID de vuelo por cliente, 13-oct-2026, API 0.0.75): el
 * CUERPO real que llega a `apiServer` desde las actions de Clientes.
 *
 * Qué se congela:
 *  1. sin alias, el body NO lleva la llave (el API previo respondería 400
 *     por forbidNonWhitelisted y el nuevo 503 sin la migración);
 *  2. `alias: null` viaja como null (= volver al sugerido) y 'diego' tal cual;
 *  3. un alias inválido no sale del panel (fieldErrors con el texto del API);
 *  4. el schema del formulario NO inventa un alias (sin `.default`: con zod 4
 *     se colaría también en `.partial()` — ver update-user-action.test.ts);
 *  5. `aliasEnUsoAction` pide GET /v1/clients/alias-en-uso con `excluir`
 *     solo si viene, y un rechazo vuelve como `ok: false` sin lanzar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_ALIAS_INVALIDO } from "@/lib/admin/clave-cliente";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { aliasEnUsoAction, createClientAction, updateClientAction } = await import("../actions");
const { ClientFormSchema } = await import("../schema");

const ID = "a1a1a1a1-0000-4000-8000-000000000001";

function llamada(i = 0): [string, Record<string, unknown>] {
  return apiServer.mock.calls[i] as [string, Record<string, unknown>];
}

function bodyEnviado(): Record<string, unknown> {
  expect(apiServer).toHaveBeenCalledTimes(1);
  return llamada()[1].body as Record<string, unknown>;
}

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
  apiServer.mockResolvedValue({ id: ID, nombre: "Juan Chacon", alias: "juan" });
});

describe("updateClientAction / createClientAction — el alias en el body", () => {
  it("sin alias ⇒ el body NO tiene la llave alias", async () => {
    const r = await updateClientAction(ID, { nombre: "Juan Chacon", telefono: "+52 9981112233" });
    expect(r.ok).toBe(true);
    const [ruta, init] = llamada();
    expect(ruta).toBe(`/v1/clients/${ID}`);
    expect(init.method).toBe("PATCH");
    expect("alias" in bodyEnviado()).toBe(false);
  });

  it("alias null ⇒ viaja null (volver al sugerido)", async () => {
    await updateClientAction(ID, { alias: null });
    expect(bodyEnviado()).toMatchObject({ alias: null });
    expect("alias" in bodyEnviado()).toBe(true);
  });

  it("alias 'diego' ⇒ viaja 'diego'", async () => {
    await updateClientAction(ID, { alias: "diego" });
    expect(bodyEnviado().alias).toBe("diego");
  });

  it("createClientAction con 'Diego' ⇒ fieldErrors con el texto del API y CERO llamadas", async () => {
    const r = await createClientAction({ nombre: "Diego Ramírez", es_broker: false, alias: "Diego" });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.alias).toEqual([MENSAJE_ALIAS_INVALIDO]);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("createClientAction sin alias ⇒ POST sin la llave (la BD pone el sugerido)", async () => {
    const r = await createClientAction({ nombre: "Diego Ramírez", es_broker: false });
    expect(r.ok).toBe(true);
    const [ruta, init] = llamada();
    expect(ruta).toBe("/v1/clients");
    expect(init.method).toBe("POST");
    expect("alias" in bodyEnviado()).toBe(false);
  });

  it("el schema del formulario no inventa un alias (ni en el alta ni en .partial())", () => {
    const alta = ClientFormSchema.parse({ nombre: "Diego", es_broker: false });
    expect("alias" in alta).toBe(false);
    const parcial = ClientFormSchema.partial().parse({ nombre: "Diego" });
    expect("alias" in parcial).toBe(false);
  });
});

describe("aliasEnUsoAction", () => {
  it("GET /v1/clients/alias-en-uso con alias y excluir", async () => {
    apiServer.mockResolvedValueOnce({
      alias: "juan",
      clientes: [{ id: "x", nombre: "Juan Satin", activo: false }],
    });
    const r = await aliasEnUsoAction("juan", ID);
    expect(r).toEqual({
      ok: true,
      data: { alias: "juan", clientes: [{ id: "x", nombre: "Juan Satin", activo: false }] },
    });
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = llamada();
    expect(ruta).toBe("/v1/clients/alias-en-uso");
    expect(init).toEqual({ searchParams: { alias: "juan", excluir: ID }, cache: "no-store" });
    expect(init.method).toBeUndefined();
  });

  it("sin excluirId, el query no lleva excluir", async () => {
    apiServer.mockResolvedValueOnce({ alias: "diego", clientes: [] });
    await aliasEnUsoAction("diego");
    expect(llamada()[1]).toEqual({ searchParams: { alias: "diego" }, cache: "no-store" });
  });

  it("un rechazo vuelve como ok:false, sin lanzar", async () => {
    apiServer.mockRejectedValueOnce(new Error("Sin conexión"));
    await expect(aliasEnUsoAction("juan")).resolves.toEqual({ ok: false, error: "Sin conexión" });
  });
});
