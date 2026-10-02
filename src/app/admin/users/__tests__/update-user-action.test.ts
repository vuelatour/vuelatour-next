/**
 * `updateUserAction` (Usuarios, ADMIN) — el CUERPO real que llega al API
 * (revisión 2-oct-2026).
 *
 * Por qué existe: con zod 4 el `.default(false)` de `es_piloto` /
 * `es_piloto_externo` se aplicaba aunque el campo fuera opcional, también en
 * `UserFormSchema.partial()`. El diálogo quitaba las banderas que no cambiaron
 * (`payloadModoUsuario`), pero la action las volvía a meter como `false`: con
 * solo cambiar el teléfono, Pablo y Alejandro Canales (ADMIN + `es_piloto`)
 * perdían el doble rol y los externos sin cuenta quedaban
 * `es_piloto_externo = false` ⇒ el API los pasaba a INVITADO. Ninguna prueba
 * miraba el body: aquí se recorre diálogo (schema del resolver +
 * `payloadModoUsuario`) → action → `apiServer`.
 *
 * Qué se congela:
 *  1. un payload SIN banderas produce un body sin `es_piloto` ni
 *     `es_piloto_externo`;
 *  2. `es_piloto: false` / `es_piloto_externo: false` EXPLÍCITOS sí viajan;
 *  3. Pablo (ADMIN + es_piloto) y un externo sin cuenta, cambiando solo el
 *     teléfono: body EXACTO sin banderas;
 *  4. servidor sin `es_piloto` (`user.es_piloto` undefined): jamás viaja;
 *  5. el `null` explícito (quitar tarjeta / apodo) sobrevive y
 *     `tiene_fondo_caja` nunca viaja.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/users";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/api/cards-server", () => ({ listCards: vi.fn() }));

const { updateUserAction } = await import("../actions");
const { UserFormSchema } = await import("../schema");
const { payloadModoUsuario } = await import("@/lib/admin/pilotos-edicion");

const PABLO: User = {
  id: "b1b1b1b1-0000-4000-8000-000000000001",
  supabase_auth_id: "auth-pablo",
  email: "pablo@vuelatour.com",
  nombre: "Pablo Canales",
  rol: "ADMIN",
  estado: "ACTIVO",
  tiene_fondo_caja: true,
  tarjeta_terminacion: "0590",
  es_piloto: true,
  es_piloto_externo: false,
  telefono: "+52 9980000000",
  apodo: "Pab",
  avatar_url: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const MUCINO: User = {
  id: "c2c2c2c2-0000-4000-8000-000000000002",
  supabase_auth_id: null,
  email: null,
  nombre: "Carlos Muciño",
  rol: "PILOTO",
  estado: "ACTIVO",
  tiene_fondo_caja: false,
  tarjeta_terminacion: null,
  es_piloto: true,
  es_piloto_externo: true,
  telefono: null,
  apodo: null,
  avatar_url: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

/**
 * Lo que el formulario tiene al abrir (espejo de `defaults(user)` del
 * diálogo) con los cambios del capturista encima.
 */
function formulario(user: User, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: user.nombre,
    rol: user.rol,
    estado: user.estado,
    tarjeta_terminacion: user.tarjeta_terminacion ?? "",
    apodo: user.apodo ?? "",
    es_piloto: user.es_piloto,
    es_piloto_externo: user.es_piloto_externo,
    telefono: user.telefono ?? "",
    avatar_url: user.avatar_url ?? "",
    ...cambios,
  };
}

/** Diálogo en modo usuario → action: resolver (schema) + payloadModoUsuario. */
async function guardarDesdeDialogo(user: User, cambios: Record<string, unknown>) {
  const valores = UserFormSchema.parse(formulario(user, cambios));
  const payload = payloadModoUsuario(user, valores as Record<string, unknown>);
  return updateUserAction(user.id, payload);
}

function bodyEnviado(): Record<string, unknown> {
  expect(apiServer).toHaveBeenCalledTimes(1);
  const [ruta, init] = apiServer.mock.calls[0];
  expect(String(ruta)).toMatch(/^\/v1\/users\//);
  expect(init.method).toBe("PATCH");
  return init.body as Record<string, unknown>;
}

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
  apiServer.mockResolvedValue({ id: "x" });
});

describe("updateUserAction — cuerpo del PATCH", () => {
  it("payload SIN banderas ⇒ el body no lleva es_piloto ni es_piloto_externo", async () => {
    const r = await updateUserAction(PABLO.id, { nombre: "Pablo Canales", telefono: "+52 9981112233" });
    expect(r.ok).toBe(true);
    expect(bodyEnviado()).toEqual({ nombre: "Pablo Canales", telefono: "+52 9981112233" });
  });

  it("es_piloto: false y es_piloto_externo: false EXPLÍCITOS sí viajan", async () => {
    await updateUserAction(PABLO.id, { es_piloto: false, es_piloto_externo: false });
    expect(bodyEnviado()).toEqual({ es_piloto: false, es_piloto_externo: false });
  });

  it("Pablo (ADMIN + es_piloto) cambiando SOLO el teléfono: body exacto, sin banderas", async () => {
    const r = await guardarDesdeDialogo(PABLO, { telefono: "+52 9981112233" });
    expect(r.ok).toBe(true);
    expect(bodyEnviado()).toEqual({
      nombre: "Pablo Canales",
      rol: "ADMIN",
      estado: "ACTIVO",
      telefono: "+52 9981112233",
    });
    expect(apiServer.mock.calls[0][0]).toBe(`/v1/users/${PABLO.id}`);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("externo sin cuenta (Carlos Muciño) cambiando SOLO el teléfono: es_piloto_externo NO viaja", async () => {
    await guardarDesdeDialogo(MUCINO, { telefono: "+52 9984445566" });
    expect(bodyEnviado()).toEqual({
      nombre: "Carlos Muciño",
      rol: "PILOTO",
      estado: "ACTIVO",
      telefono: "+52 9984445566",
    });
  });

  it("servidor sin es_piloto (user.es_piloto undefined): jamás manda es_piloto", async () => {
    const sinDato: User = { ...PABLO };
    delete sinDato.es_piloto;
    await guardarDesdeDialogo(sinDato, { telefono: "+52 9981112233" });
    expect(bodyEnviado()).not.toHaveProperty("es_piloto");

    // Aunque el formulario traiga false (switch deshabilitado), tampoco viaja.
    apiServer.mockClear();
    await guardarDesdeDialogo(sinDato, { es_piloto: false });
    expect(bodyEnviado()).not.toHaveProperty("es_piloto");
  });

  it("quitar el doble rol a propósito: es_piloto: false viaja (y solo eso de las banderas)", async () => {
    await guardarDesdeDialogo(PABLO, { es_piloto: false });
    const body = bodyEnviado();
    expect(body.es_piloto).toBe(false);
    expect(body).not.toHaveProperty("es_piloto_externo");
  });

  it("null explícito (quitar tarjeta y apodo) sobrevive; tiene_fondo_caja nunca viaja", async () => {
    await updateUserAction(PABLO.id, {
      nombre: "Pablo Canales",
      tarjeta_terminacion: null,
      apodo: null,
      tiene_fondo_caja: false,
    });
    expect(bodyEnviado()).toEqual({ nombre: "Pablo Canales", tarjeta_terminacion: null, apodo: null });
  });

  it("el schema ya no inyecta las banderas: partial().parse sin ellas no las agrega", () => {
    const parsed = UserFormSchema.partial().parse({ nombre: "X" });
    expect(parsed).not.toHaveProperty("es_piloto");
    expect(parsed).not.toHaveProperty("es_piloto_externo");
  });
});
