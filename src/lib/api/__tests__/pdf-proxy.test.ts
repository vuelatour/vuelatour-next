import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contrato del PROXY de PDF (`lib/api/pdf-proxy.ts`), el que hace que el
 * botón «Descargar» del visor de Chrome funcione (bug del 11-sep-2026: con
 * `blob:` fallaba con «Check internet connection»).
 *
 * Lo que se prueba aquí y no en `pdf-http.test.ts` (helpers puros): que la
 * respuesta que sale a la pestaña es de verdad un PDF servible —
 * `Content-Type`, `Content-Disposition` inline/attachment, `Content-Length`
 * EXACTO y `no-store`—, que el JWT viaja al API y NUNCA al navegador, y que
 * los errores del API llegan legibles (JSON para `fetch`, página HTML para
 * una navegación) sin inventar un PDF vacío.
 */

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getSession } }),
}));
vi.mock("@/lib/env", () => ({ env: { API_URL: "https://api.example.com/" } }));

const { errorPdf, esNavegacion, esUuid, pidioDescarga, proxyPdfDelApi } =
  await import("@/lib/api/pdf-proxy");

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

function conSesion(token: string | null = "jwt-de-la-sesion") {
  getSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

/** Respuesta del API con el PDF ya renderizado. */
function upstreamPdf(disposition?: string) {
  return new Response(PDF, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      ...(disposition ? { "Content-Disposition": disposition } : {}),
    },
  });
}

const BASE = {
  path: "/v1/quotes/abc/pdf",
  method: "POST" as const,
  filename: "cotizacion-abc.pdf",
  errorMsg: "No se pudo generar el PDF de la cotización.",
};

beforeEach(() => {
  vi.restoreAllMocks();
  getSession.mockReset();
});

describe("proxyPdfDelApi", () => {
  it("sirve el PDF por URL real: tipo, nombre inline, tamaño exacto y no-store", async () => {
    conSesion();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(upstreamPdf());

    const res = await proxyPdfDelApi(BASE);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline;");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="cotizacion-abc.pdf"',
    );
    // Content-Length EXACTO: sin él, algunos visores no ofrecen «Descargar».
    expect(res.headers.get("Content-Length")).toBe(String(PDF.byteLength));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);

    // El JWT va al API (cabecera), nunca al navegador.
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/quotes/abc/pdf");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-de-la-sesion",
    );
    expect(res.headers.get("Authorization")).toBeNull();
  });

  it("`?descargar=1` responde attachment y conserva el nombre del API", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      upstreamPdf('inline; filename="cotizacion-1042.pdf"'),
    );

    const res = await proxyPdfDelApi({ ...BASE, descargar: true });

    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    // El folio real del API gana al nombre de respaldo del proxy.
    expect(cd).toContain('filename="cotizacion-1042.pdf"');
  });

  it("sin sesión: 401 sin llamar al API (y HTML si es una navegación)", async () => {
    conSesion(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const json = await proxyPdfDelApi(BASE);
    expect(json.status).toBe(401);
    expect(json.headers.get("Content-Type")).toContain("application/json");
    expect(await json.json()).toEqual({
      message: "Tu sesión expiró: vuelve a iniciar sesión.",
      code: "UNAUTHORIZED",
    });

    const html = await proxyPdfDelApi({ ...BASE, html: true });
    expect(html.headers.get("Content-Type")).toContain("text/html");
    expect(await html.text()).toContain("No se pudo abrir el PDF");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("error del API: pasa status, mensaje y code — nunca un PDF vacío", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Cotización no encontrada", code: "NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await proxyPdfDelApi(BASE);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).not.toContain("application/pdf");
    expect(await res.json()).toEqual({
      message: "Cotización no encontrada",
      code: "NOT_FOUND",
    });
  });

  it("403 sin cuerpo útil: usa el mensaje es-MX del rol", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    const res = await proxyPdfDelApi({
      ...BASE,
      mensajes: {
        403: { message: "Tu rol no puede generar el PDF interno.", code: "FORBIDDEN" },
      },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      message: "Tu rol no puede generar el PDF interno.",
      code: "FORBIDDEN",
    });
  });

  it("API caído: 502 legible en vez de una pestaña en blanco", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await proxyPdfDelApi({ ...BASE, html: true });
    expect(res.status).toBe(502);
    const cuerpo = await res.text();
    expect(cuerpo).toContain("No hay conexión con el API");
    expect(cuerpo).toContain("UPSTREAM_DOWN");
  });
});

describe("helpers del proxy", () => {
  it("esNavegacion distingue la pestaña de un fetch", () => {
    expect(
      esNavegacion(new Request("https://x/y", { headers: { accept: "text/html,*/*" } })),
    ).toBe(true);
    expect(
      esNavegacion(new Request("https://x/y", { headers: { accept: "*/*" } })),
    ).toBe(false);
  });

  it("pidioDescarga solo con 1/true", () => {
    expect(pidioDescarga(new Request("https://x/y?descargar=1"))).toBe(true);
    expect(pidioDescarga(new Request("https://x/y?descargar=true"))).toBe(true);
    expect(pidioDescarga(new Request("https://x/y?descargar=0"))).toBe(false);
    expect(pidioDescarga(new Request("https://x/y"))).toBe(false);
  });

  it("esUuid rechaza ids inventados (el proxy no reenvía basura al API)", () => {
    expect(esUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(esUuid("../../admin")).toBe(false);
    expect(esUuid("123")).toBe(false);
  });

  it("la página de error escapa el mensaje del API", async () => {
    const res = errorPdf("<script>alert(1)</script>", "BAD", 400, true);
    const cuerpo = await res.text();
    expect(cuerpo).not.toContain("<script>alert(1)</script>");
    expect(cuerpo).toContain("&lt;script&gt;");
  });
});
