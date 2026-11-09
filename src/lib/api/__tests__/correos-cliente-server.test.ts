/**
 * CORREOS AL CLIENTE (9-nov-2026, API 0.0.133): el CONTRATO de los lectores y
 * de las server actions con el API, con `apiServer` simulado.
 *
 *  1. El historial de un vuelo y la lista general NUNCA lanzan y NUNCA
 *     devuelven «vacío» cuando la lectura falló: `ok` / `no-disponible` (API
 *     sin desplegar) / `sin-acceso` (401/403) / `error`.
 *  2. La lista manda SOLO `desde`, `hasta` y `limite` (el API responde 400 a
 *     cualquier otro parámetro) y un API anterior —que lee «correos» como un
 *     id y responde 400— cuenta como «todavía no disponible».
 *  3. La vista previa es un GET (no envía nada) y el envío un POST cuyo body
 *     lleva `reenviar: true` solo cuando el operador lo confirmó.
 *  4. Las actions no revalidan (las llama un diálogo que debe seguir
 *     montado) y devuelven el `code`/`details` del 409 tal cual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { getQuoteCorreos, listCorreosClientes } = await import("../quotes-server");
const { enviarCorreoConfirmacionAction, previsualizarCorreoConfirmacionAction } = await import(
  "@/app/admin/quotes/actions"
);

const ID = "bbbbbbbb-0000-4000-8000-000000000412";

const apiError = (statusCode: number, code = "ERROR", message = "x", details?: unknown) =>
  new ApiError({ statusCode, code, message, details });

const fila = (n: number) => ({ id: `c-${n}`, vuelo_id: ID, estado: "ENVIADO" });

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getQuoteCorreos · historial de un vuelo", () => {
  it("lee GET /v1/quotes/:id/correos sin caché y devuelve la lista tal cual (orden del API)", async () => {
    apiServer.mockResolvedValue({ correos: [fila(2), fila(1)] });
    const r = await getQuoteCorreos(ID);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/quotes/${ID}/correos`);
    expect(init).toMatchObject({ cache: "no-store" });
    expect(init.method).toBeUndefined();
    expect(r).toEqual({ estado: "ok", datos: [fila(2), fila(1)] });
  });

  it("una lista vacía es `ok` con []: eso SÍ es «no se ha enviado nada»", async () => {
    apiServer.mockResolvedValue({ correos: [] });
    expect(await getQuoteCorreos(ID)).toEqual({ estado: "ok", datos: [] });
  });

  it("404 = API sin desplegar ⇒ `no-disponible`; 401/403 ⇒ `sin-acceso`", async () => {
    apiServer.mockRejectedValueOnce(apiError(404, "NOT_FOUND", "Cannot GET"));
    expect(await getQuoteCorreos(ID)).toEqual({ estado: "no-disponible" });
    apiServer.mockRejectedValueOnce(apiError(403));
    expect(await getQuoteCorreos(ID)).toEqual({ estado: "sin-acceso" });
    apiServer.mockRejectedValueOnce(apiError(401));
    expect(await getQuoteCorreos(ID)).toEqual({ estado: "sin-acceso" });
  });

  it("502, 500 o red caída ⇒ `error`, jamás una lista vacía", async () => {
    for (const fallo of [apiError(502), apiError(500), new Error("fetch failed")]) {
      apiServer.mockRejectedValueOnce(fallo);
      expect(await getQuoteCorreos(ID)).toEqual({ estado: "error" });
    }
  });

  it("`notFound()`/`redirect()` de Next siguen subiendo intactos", async () => {
    const deNext = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" });
    apiServer.mockRejectedValueOnce(deNext);
    await expect(getQuoteCorreos(ID)).rejects.toBe(deNext);
  });
});

describe("listCorreosClientes · pantalla «Correos enviados»", () => {
  it("manda SOLO desde, hasta y limite", async () => {
    apiServer.mockResolvedValue({
      correos: [fila(1)],
      truncado: false,
      desde: "2026-11-01",
      hasta: "2026-11-09",
    });
    const r = await listCorreosClientes({ desde: "2026-11-01", hasta: "2026-11-09", limite: 200 });
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/quotes/correos");
    expect(Object.keys(init.searchParams).sort()).toEqual(["desde", "hasta", "limite"]);
    expect(init.searchParams).toEqual({ desde: "2026-11-01", hasta: "2026-11-09", limite: 200 });
    expect(r).toEqual({
      estado: "ok",
      datos: { correos: [fila(1)], truncado: false, desde: "2026-11-01", hasta: "2026-11-09" },
    });
  });

  it("sin periodo, `desde`/`hasta` van undefined (no viajan) y el rango efectivo es el del API", async () => {
    apiServer.mockResolvedValue({
      correos: [],
      truncado: true,
      desde: "2026-08-11",
      hasta: "2026-11-09",
    });
    const r = await listCorreosClientes({ limite: 200 });
    expect(apiServer.mock.calls[0][1].searchParams).toEqual({
      desde: undefined,
      hasta: undefined,
      limite: 200,
    });
    expect(r).toEqual({
      estado: "ok",
      datos: { correos: [], truncado: true, desde: "2026-08-11", hasta: "2026-11-09" },
    });
  });

  it("API anterior: 404, o 400 porque lee «correos» como un id ⇒ `no-disponible`", async () => {
    apiServer.mockRejectedValueOnce(apiError(400, "BAD_REQUEST", "Validation failed (uuid is expected)"));
    expect(await listCorreosClientes({ limite: 200 })).toEqual({ estado: "no-disponible" });
    apiServer.mockRejectedValueOnce(apiError(404));
    expect(await listCorreosClientes({ limite: 200 })).toEqual({ estado: "no-disponible" });
  });

  it("403 ⇒ `sin-acceso`; 502 ⇒ `error` (nunca «sin correos»)", async () => {
    apiServer.mockRejectedValueOnce(apiError(403));
    expect(await listCorreosClientes({ limite: 200 })).toEqual({ estado: "sin-acceso" });
    apiServer.mockRejectedValueOnce(apiError(502));
    expect(await listCorreosClientes({ limite: 200 })).toEqual({ estado: "error" });
  });
});

describe("actions · vista previa y envío", () => {
  it("la vista previa es un GET a /correo-confirmacion: no envía nada ni revalida", async () => {
    const vista = { puede_enviar: true, codigo: null, motivo: null, enviados: 0 };
    apiServer.mockResolvedValue(vista);
    const r = await previsualizarCorreoConfirmacionAction(ID);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/quotes/${ID}/correo-confirmacion`);
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(r).toEqual({ ok: true, data: vista });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("enviar: POST con body {} y, solo si se confirmó el reenvío, { reenviar: true }", async () => {
    apiServer.mockResolvedValue({ enviado: true, mensaje: "Correo enviado", correo: null });
    await enviarCorreoConfirmacionAction(ID);
    await enviarCorreoConfirmacionAction(ID, { reenviar: false });
    await enviarCorreoConfirmacionAction(ID, { reenviar: true });
    expect(apiServer).toHaveBeenCalledTimes(3);
    for (const [ruta, init] of apiServer.mock.calls) {
      expect(ruta).toBe(`/v1/quotes/${ID}/correo-confirmacion`);
      expect(init.method).toBe("POST");
    }
    expect(apiServer.mock.calls[0][1].body).toEqual({});
    expect(apiServer.mock.calls[1][1].body).toEqual({});
    expect(apiServer.mock.calls[2][1].body).toEqual({ reenviar: true });
    // El diálogo debe seguir montado: quien llama hace router.refresh().
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un 200 con enviado:false vuelve como ok (el proveedor falló; quedó registrado)", async () => {
    const data = { enviado: false, mensaje: "No se pudo enviar", correo: { ...fila(1), estado: "FALLIDO" } };
    apiServer.mockResolvedValue(data);
    expect(await enviarCorreoConfirmacionAction(ID)).toEqual({ ok: true, data });
  });

  it("el 409 llega con su `code` y `details` (así se distingue, no por el mensaje)", async () => {
    const ultimo_envio = {
      created_at: "2026-11-09T15:40:00Z",
      enviado_por_nombre: "Mary",
      destinatario: "ana@x.com",
    };
    apiServer.mockRejectedValueOnce(apiError(409, "CORREO_YA_ENVIADO", "Ya se envió", { ultimo_envio }));
    expect(await enviarCorreoConfirmacionAction(ID)).toEqual({
      ok: false,
      error: "Ya se envió",
      status: 409,
      code: "CORREO_YA_ENVIADO",
      details: { ultimo_envio },
    });
    apiServer.mockRejectedValueOnce(
      apiError(409, "CORREO_NO_ENVIABLE", "El cliente no tiene correo.", { codigo: "SIN_EMAIL" }),
    );
    expect(await enviarCorreoConfirmacionAction(ID)).toMatchObject({
      ok: false,
      status: 409,
      code: "CORREO_NO_ENVIABLE",
      details: { codigo: "SIN_EMAIL" },
    });
  });

  it("un id que no es uuid no sale del panel", async () => {
    expect((await previsualizarCorreoConfirmacionAction("correos")).ok).toBe(false);
    expect((await enviarCorreoConfirmacionAction("x", { reenviar: true })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });
});
