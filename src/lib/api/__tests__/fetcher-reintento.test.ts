import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reintento del punto único de red (21-sep-2026).
 *
 * Lo que congela esta prueba (con `fetch` simulado, sin red):
 *  1. un 503 pasajero se RECUPERA en el segundo intento (la ventana de deploy
 *     de Railway ya no tumba la pantalla);
 *  2. si el API nunca responde, se AGOTAN los reintentos y se lanza (jamás
 *     «sin datos» silencioso);
 *  3. una MUTACIÓN (POST/PATCH/…) no se reintenta NUNCA — repetirla duplicaría
 *     dinero;
 *  4. un 400 (y cualquier 4xx/500) se entrega tal cual, sin repetir.
 */

// `@/lib/env` valida las variables al importarse: hay que ponerlas antes.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://ejemplo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-de-prueba";
process.env.NEXT_PUBLIC_API_URL ??= "https://api.ejemplo.test";

type ApiFetch = typeof import("../fetcher").apiFetch;
let apiFetch: ApiFetch;
let reintento: typeof import("../reintento");

beforeAll(async () => {
  apiFetch = (await import("../fetcher")).apiFetch;
  reintento = await import("../reintento");
});

function respuestaJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** «Application failed to respond» de Railway: HTML, no JSON. */
function respuestaCaida(status: number): Response {
  return new Response("<html>Application failed to respond</html>", {
    status,
    headers: { "content-type": "text/html" },
  });
}

/** Espera activa hasta que `fetch` se haya llamado `n` veces, avanzando el reloj. */
async function correrReintentos(fetchMock: ReturnType<typeof vi.fn>, llamadas: number) {
  for (let i = 0; i < llamadas; i++) {
    if (fetchMock.mock.calls.length >= llamadas) break;
    await vi.advanceTimersByTimeAsync(reintento.ESPERAS_REINTENTO_MS[i] ?? 0);
  }
}

describe("apiFetch · reintento de lecturas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recupera en el 2.º intento cuando el API contesta 503 y luego 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuestaCaida(503))
      .mockResolvedValueOnce(respuestaJson(200, { data: [{ id: "a" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = apiFetch<{ data: { id: string }[] }>("/v1/inventario");
    await correrReintentos(fetchMock, 2);

    await expect(promesa).resolves.toEqual({ data: [{ id: "a" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta también ante error de red («fetch failed») y recupera", async () => {
    const red = new TypeError("fetch failed");
    (red as Error & { cause?: unknown }).cause = { code: "ECONNREFUSED" };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(red)
      .mockResolvedValueOnce(respuestaJson(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = apiFetch<{ ok: boolean }>("/v1/aircraft");
    await correrReintentos(fetchMock, 2);

    await expect(promesa).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("agota los 2 reintentos y LANZA (3 intentos en total)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaCaida(502));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = apiFetch("/v1/inventario");
    const capturado = promesa.catch((e: unknown) => e);
    await correrReintentos(fetchMock, 1 + reintento.MAX_REINTENTOS);

    const error = (await capturado) as { name: string; status: number };
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1 + reintento.MAX_REINTENTOS);
  });

  it("NO reintenta una mutación aunque el API responda 503", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaCaida(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/v1/flights/x/cobros", { method: "POST", body: { monto: 1 } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("NO reintenta un 400 (respuesta legítima del API) y conserva el mensaje", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        respuestaJson(400, { statusCode: 400, code: "BAD_REQUEST", message: "ids too long" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/v1/flights/taco-status")).rejects.toMatchObject({
      status: 400,
      message: "ids too long",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cada reintento va con cabecera propia (si no, Next lo deduplica)", async () => {
    // Hallazgo del arnés (21-sep-2026): Next memoiza los `fetch` idénticos de
    // un mismo render (`dedupe-fetch.js`, clave = método + CABECERAS). Sin una
    // cabecera distinta por intento, el 2.º y el 3.º NO salen a la red y el
    // reintento es un placebo justo en el caso que lo motivó.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuestaCaida(503))
      .mockResolvedValueOnce(respuestaCaida(503))
      .mockResolvedValueOnce(respuestaJson(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = apiFetch<{ ok: boolean }>("/v1/inventory/items");
    await correrReintentos(fetchMock, 3);
    await expect(promesa).resolves.toEqual({ ok: true });

    const cabeceras = fetchMock.mock.calls.map(
      ([, init]) => (init as RequestInit).headers as Record<string, string>,
    );
    expect(cabeceras[0][reintento.CABECERA_REINTENTO]).toBeUndefined();
    expect(cabeceras[1][reintento.CABECERA_REINTENTO]).toBe("1");
    expect(cabeceras[2][reintento.CABECERA_REINTENTO]).toBe("2");
    // Las tres claves de deduplicación de Next tienen que ser DISTINTAS.
    expect(new Set(cabeceras.map((h) => JSON.stringify(h))).size).toBe(3);
    // Lo demás del intento (Accept, Authorization…) se conserva intacto.
    expect(cabeceras[1].Accept).toBe("application/json");
  });

  it("NO reintenta un 500 (bug del API: repetirlo lo esconde)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuestaJson(500, { statusCode: 500, code: "X", message: "boom" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/v1/expenses")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("reglas puras del reintento", () => {
  it("solo GET/HEAD son reintentables", async () => {
    const { esMetodoReintentable } = await import("../reintento");
    expect(esMetodoReintentable()).toBe(true);
    expect(esMetodoReintentable("get")).toBe(true);
    expect(esMetodoReintentable("HEAD")).toBe(true);
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(esMetodoReintentable(m)).toBe(false);
    }
  });

  it("solo 502/503/504 son reintentables", async () => {
    const { esEstadoReintentable } = await import("../reintento");
    expect([502, 503, 504].every(esEstadoReintentable)).toBe(true);
    for (const s of [200, 204, 400, 401, 403, 404, 409, 422, 500, 501]) {
      expect(esEstadoReintentable(s)).toBe(false);
    }
  });

  it("un abort deliberado no cuenta como error de red", async () => {
    const { esErrorDeRed } = await import("../reintento");
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(esErrorDeRed(abort)).toBe(false);
    expect(esErrorDeRed(new TypeError("fetch failed"))).toBe(true);
    expect(esErrorDeRed(new Error("cualquier otra cosa"))).toBe(false);
  });
});
