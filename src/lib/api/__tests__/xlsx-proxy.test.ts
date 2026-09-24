import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PROXY de los Excel de caja chica (24-sep-2026) — el MISMO núcleo que los
 * PDF (`proxyArchivoDelApi`), con `TIPO_XLSX`. Se congela que lo que sale al
 * navegador es un xlsx descargable (tipo, `attachment`, el nombre del API con
 * `.xlsx`, tamaño exacto, `no-store`), que el JWT viaja al API y nunca al
 * navegador, que los errores del API llegan legibles y que las dos rutas
 * apuntan al endpoint correcto del API 0.0.29 sin reenviar basura.
 */

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getSession } }),
}));
vi.mock("@/lib/env", () => ({ env: { API_URL: "https://api.example.com/" } }));

const { MENSAJE_RUTA_NO_DISPONIBLE, TIPO_XLSX, proxyArchivoDelApi } = await import(
  "@/lib/api/pdf-proxy"
);
const rutaReposicion = await import("@/app/api/caja-chica/movimientos/[id]/reposicion/route");
const rutaPorReponer = await import("@/app/api/caja-chica/fondos/[id]/por-reponer/route");

const XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // "PK.."
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MOV = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const FONDO = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";

function conSesion(token: string | null = "jwt-de-la-sesion") {
  getSession.mockResolvedValue({ data: { session: token ? { access_token: token } : null } });
}

function upstreamXlsx(disposition?: string) {
  return new Response(XLSX, {
    status: 200,
    headers: {
      "Content-Type": MIME,
      ...(disposition ? { "Content-Disposition": disposition } : {}),
    },
  });
}

function jsonUpstream(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE = {
  tipo: TIPO_XLSX,
  path: `/v1/caja-chica/movimientos/${MOV}/reposicion.xlsx`,
  method: "GET" as const,
  filename: "Reposicion caja respaldo.xlsx",
  descargar: true,
  errorMsg: "No se pudo generar el Excel de la reposición.",
};

beforeEach(() => {
  vi.restoreAllMocks();
  getSession.mockReset();
});

describe("proxyArchivoDelApi · xlsx", () => {
  it("sirve el xlsx: tipo, attachment con el nombre del API, tamaño exacto, no-store", async () => {
    conSesion();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      upstreamXlsx(
        "attachment; filename=\"Reposicion caja Itzi 2026-09-21.xlsx\"; filename*=UTF-8''Reposicion%20caja%20Itzi%202026-09-21.xlsx",
      ),
    );

    const res = await proxyArchivoDelApi(BASE);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(MIME);
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    expect(cd).toContain('filename="Reposicion caja Itzi 2026-09-21.xlsx"');
    expect(cd).not.toContain(".pdf");
    expect(res.headers.get("Content-Length")).toBe(String(XLSX.byteLength));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(XLSX);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.example.com/v1/caja-chica/movimientos/${MOV}/reposicion.xlsx`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-de-la-sesion");
    expect(res.headers.get("Authorization")).toBeNull();
  });

  it("sin Content-Disposition del API usa el respaldo con .xlsx", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamXlsx());
    const res = await proxyArchivoDelApi({ ...BASE, filename: "Por reponer caja Luis" });
    expect(res.headers.get("Content-Disposition")).toContain('filename="Por reponer caja Luis.xlsx"');
  });

  it("sin sesión: 401 sin llamar al API; página HTML si es navegación", async () => {
    conSesion(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await proxyArchivoDelApi(BASE);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      message: "Tu sesión expiró: vuelve a iniciar sesión.",
      code: "UNAUTHORIZED",
    });
    const html = await proxyArchivoDelApi({ ...BASE, html: true });
    expect(await html.text()).toContain("No se pudo descargar el Excel");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("409 MOVIMIENTO_NO_ES_REPOSICION: pasa el mensaje del API", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonUpstream(409, {
        statusCode: 409,
        code: "MOVIMIENTO_NO_ES_REPOSICION",
        message: "Solo las reposiciones tienen Excel de lo repuesto; este movimiento es «Ajuste».",
      }),
    );
    const res = await proxyArchivoDelApi(BASE);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      message: "Solo las reposiciones tienen Excel de lo repuesto; este movimiento es «Ajuste».",
      code: "MOVIMIENTO_NO_ES_REPOSICION",
    });
  });

  it("API sin el endpoint (panel antes que API): 404 «Cannot GET» ⇒ es-MX", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonUpstream(404, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: `Cannot GET /v1/caja-chica/movimientos/${MOV}/reposicion.xlsx`,
      }),
    );
    const res = await proxyArchivoDelApi(BASE);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: MENSAJE_RUTA_NO_DISPONIBLE,
      code: "RUTA_NO_DISPONIBLE",
    });
  });

  it("404 LEGÍTIMO (movimiento borrado) conserva el mensaje del API", async () => {
    conSesion();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonUpstream(404, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Ese movimiento de caja chica ya no existe.",
      }),
    );
    const res = await proxyArchivoDelApi(BASE);
    expect((await res.json()).message).toBe("Ese movimiento de caja chica ya no existe.");
  });
});

describe("rutas app/api/caja-chica/**", () => {
  const req = (url: string) => new NextRequest(url, { headers: { accept: "*/*" } });

  it("reposición: GET al endpoint del API, siempre attachment", async () => {
    conSesion();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamXlsx());
    const res = await rutaReposicion.GET(req(`https://panel/api/caja-chica/movimientos/${MOV}/reposicion`), {
      params: Promise.resolve({ id: MOV }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")?.startsWith("attachment;")).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.example.com/v1/caja-chica/movimientos/${MOV}/reposicion.xlsx`);
    expect(init.method).toBe("GET");
  });

  it("por reponer: GET al endpoint del fondo", async () => {
    conSesion();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamXlsx());
    await rutaPorReponer.GET(req(`https://panel/api/caja-chica/fondos/${FONDO}/por-reponer`), {
      params: Promise.resolve({ id: FONDO }),
    });
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.example.com/v1/caja-chica/fondos/${FONDO}/por-reponer.xlsx`);
  });

  it("id que no es uuid: 400 sin llamar al API", async () => {
    conSesion();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await rutaReposicion.GET(req("https://panel/api/caja-chica/movimientos/../x/reposicion"), {
      params: Promise.resolve({ id: "../x" }),
    });
    expect(res.status).toBe(400);
    const res2 = await rutaPorReponer.GET(req("https://panel/api/caja-chica/fondos/123/por-reponer"), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res2.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("las dos rutas nacen con maxDuration = 60 (el Excel lo arma pyservices)", () => {
    expect(rutaReposicion.maxDuration).toBe(60);
    expect(rutaPorReponer.maxDuration).toBe(60);
  });
});
