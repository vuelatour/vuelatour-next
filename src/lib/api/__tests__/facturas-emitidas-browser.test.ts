import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * FACTURAS EMITIDAS y COMPROBANTE DEL COBRO — el CAMINO de las subidas
 * (24-sep-2026). Sustituye a `factura-cliente-browser.test.ts` (la subida
 * suelta de la factura al vuelo se retiró: ahora se REGISTRA la factura).
 *
 * Se congela lo aprendido con la factura del servicio:
 *  1. Las subidas salen del NAVEGADOR al ORIGEN DEL API (no a una server
 *     action ni a `app/api/**`, que viven detrás del tope de 4.5 MB de
 *     Vercel), con el JWT de la sesión y SIN `Content-Type` a mano.
 *  2. Multipart EXACTO del contrato: alta/edición = `datos` (JSON) + `pdf` +
 *     `xml`; leer = `pdf`/`xml`; comprobante = `file`. El API corre con
 *     `forbidNonWhitelisted`: cualquier otro campo es un 400.
 *  3. Nunca lanza y nunca celebra en falso: 409 con la existente, 200 sin la
 *     factura, red caída, tiempo agotado y 502 de Railway se DICEN.
 */

vi.mock("@/lib/env", () => ({
  env: {
    API_URL: "https://api.example.com",
    SUPABASE_URL: "https://sb.example.com",
    SUPABASE_ANON_KEY: "anon",
  },
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: "jwt-de-la-sesion",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      }),
    },
  }),
}));

const {
  adjuntarComprobanteCobro,
  buscarVuelosCandidatos,
  guardarFacturaEmitida,
  leerArchivoFactura,
  reemplazarArchivoFactura,
} = await import("@/lib/api/facturas-emitidas-browser");

const MB = 1024 * 1024;
const VUELO = "dc204a2f-6342-43f1-9406-f76dc1302b97";
type Llamada = [string, RequestInit];

function pdf(bytes: number, nombre = "A-123.pdf"): File {
  return new File([new Uint8Array(bytes)], nombre, { type: "application/pdf" });
}
function xml(nombre = "cfdi.xml"): File {
  return new File(["<cfdi:Comprobante/>"], nombre, { type: "text/xml" });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FACTURA = { id: "f-1", etiqueta: "A-123", vuelos: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("guardarFacturaEmitida · el camino", () => {
  it("alta: POST directo al API, JWT, multipart datos+pdf+xml, sin Content-Type", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(201, { factura: FACTURA, avisos: [] }));
    const datos = { serie: "A", folio: "123", fecha_emision: "2026-09-24", moneda: "USD" as const, total: 8050.4, vuelo_ids: [VUELO] };

    const res = await guardarFacturaEmitida({ datos, pdf: pdf(2.5 * MB), xml: xml() });

    expect(res).toEqual({ ok: true, data: { factura: FACTURA, avisos: [] } });
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/facturas-emitidas");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-de-la-sesion");
    expect(headers["Content-Type"]).toBeUndefined();
    const fd = init.body as FormData;
    expect([...fd.keys()]).toEqual(["datos", "pdf", "xml"]);
    expect(JSON.parse(fd.get("datos") as string)).toEqual(datos);
    expect((fd.get("pdf") as File).size).toBe(2.5 * MB);
  });

  it("edición: PATCH a /:id; sin archivos el multipart lleva SOLO `datos`", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(200, { factura: FACTURA, avisos: [] }));
    await guardarFacturaEmitida({ id: "f-1", datos: { total: 1 } });
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/facturas-emitidas/f-1");
    expect(init.method).toBe("PATCH");
    expect([...(init.body as FormData).keys()]).toEqual(["datos"]);
  });

  it("un PDF de 6 MB (el que Vercel cortaba) viaja", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(201, { factura: FACTURA, avisos: [] }));
    const res = await guardarFacturaEmitida({ datos: {}, pdf: pdf(6 * MB) });
    expect(res.ok).toBe(true);
  });
});

describe("guardarFacturaEmitida · nunca en silencio", () => {
  it("409 FACTURA_DUPLICADA: el mensaje del API + la existente para el banner", async () => {
    const existente = { id: "f-9", etiqueta: "A-123", mensaje: "Ya está registrada: A-123 del vuelo #297." };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(409, {
        statusCode: 409,
        code: "FACTURA_DUPLICADA",
        message: existente.mensaje,
        details: { existente },
      }),
    );
    const res = await guardarFacturaEmitida({ datos: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("FACTURA_DUPLICADA");
      expect(res.error).toBe("Ya está registrada: A-123 del vuelo #297. La factura NO se guardó.");
      expect(res.details).toEqual({ existente });
    }
  });

  it("200 SIN la factura no se celebra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    const res = await guardarFacturaEmitida({ datos: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("La factura NO se guardó.");
  });

  it("sin red / tiempo agotado / 502 de Railway: se dice, en español", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const red = await guardarFacturaEmitida({ datos: {} });
    expect(red.ok).toBe(false);
    if (!red.ok) {
      expect(red.code).toBe("SIN_CONEXION");
      expect(red.error).toContain("La factura NO se guardó.");
    }

    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const tiempo = await guardarFacturaEmitida({ datos: {} }, { tiempoMaxMs: 20 });
    expect(tiempo.ok).toBe(false);
    if (!tiempo.ok) expect(tiempo.code).toBe("TIEMPO_AGOTADO");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Application failed to respond</html>", { status: 502, statusText: "Bad Gateway" }),
    );
    const caido = await guardarFacturaEmitida({ datos: {} });
    expect(caido.ok).toBe(false);
    if (!caido.ok) {
      expect(caido.error).not.toContain("Bad Gateway");
      expect(caido.error).toContain("La factura NO se guardó.");
    }
  });
});

describe("leer, reemplazar, buscar", () => {
  it("leer: SOLO pdf/xml en el multipart; sin archivos no sale a la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(200, { campos: {}, fuente: { xml: true, pdf: true }, texto_extraido: true, ya_registrada: null, cliente_sugerido: null, emisora: null, avisos: [] }),
    );
    const res = await leerArchivoFactura({ pdf: pdf(1000), xml: xml() });
    expect(res.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/facturas-emitidas/leer-archivo");
    expect([...(init.body as FormData).keys()]).toEqual(["pdf", "xml"]);

    fetchSpy.mockClear();
    const vacio = await leerArchivoFactura({});
    expect(vacio.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reemplazar: POST /:id/archivo con el PDF", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, FACTURA));
    const res = await reemplazarArchivoFactura("f-1", { pdf: pdf(1000) });
    expect(res.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/facturas-emitidas/f-1/archivo");
    expect([...(init.body as FormData).keys()]).toEqual(["pdf"]);
  });

  it("buscar vuelos: GET con q, ids (≤50) y grupo_id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, []));
    await buscarVuelosCandidatos(" #341 ", { ids: ["a", "b"] });
    const [url] = fetchSpy.mock.calls[0] as Llamada;
    const u = new URL(url);
    expect(u.pathname).toBe("/v1/facturas-emitidas/vuelos-candidatos");
    expect(u.searchParams.get("q")).toBe("#341");
    expect(u.searchParams.get("ids")).toBe("a,b");
    expect(u.searchParams.has("grupo_id")).toBe(false);
  });
});

describe("adjuntarComprobanteCobro", () => {
  it("POST /v1/flights/cobros/:id/comprobante con SOLO `file`", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(200, { id: "c-1", foto_voucher_url: "oficina/v/c-1/x.pdf", url: "https://f", tipo: "pdf" }),
    );
    const res = await adjuntarComprobanteCobro("c-1", pdf(1000, "voucher.pdf"));
    expect(res.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/flights/cobros/c-1/comprobante");
    expect(init.method).toBe("POST");
    expect([...(init.body as FormData).keys()]).toEqual(["file"]);
  });

  it("409 COMPROBANTE_CAMBIO conserva el código (la card recarga)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(409, { statusCode: 409, code: "COMPROBANTE_CAMBIO", message: "Alguien más cambió el comprobante; recarga." }),
    );
    const res = await adjuntarComprobanteCobro("c-1", pdf(1000));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("COMPROBANTE_CAMBIO");
      expect(res.error).toBe("Alguien más cambió el comprobante; recarga. El comprobante NO se guardó.");
    }
  });
});

describe("el camino queda congelado en el código", () => {
  const RAIZ = path.resolve(__dirname, "../../../..");
  const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

  it("las server actions no suben archivos (tope de 4.5 MB de Vercel)", () => {
    for (const p of [
      "src/app/admin/flights/actions.ts",
      "src/app/admin/facturas-emitidas/actions.ts",
    ]) {
      expect(leer(p)).not.toMatch(/new FormData\(/);
    }
  });

  it("el diálogo registra con `guardarFacturaEmitida` y el comprobante con `adjuntarComprobanteCobro`", () => {
    const dialogo = leer("src/components/admin/facturas-emitidas/registrar-factura-dialog.tsx");
    expect(dialogo).toContain('from "@/lib/api/facturas-emitidas-browser"');
    expect(dialogo).toContain("guardarFacturaEmitida(");
    const comprobante = leer("src/components/admin/flights/comprobante-cobro.tsx");
    expect(comprobante).toContain("adjuntarComprobanteCobro(");
  });
});
