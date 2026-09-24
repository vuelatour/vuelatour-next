import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * SUBIDA de la factura del servicio (24-sep-2026) — el CAMINO elegido.
 *
 * Defecto latente (el #297 NO fue esto: los logs de Supabase muestran su PDF
 * de 50 KB subido y luego QUITADO a mano con «Quitar archivo»). La subida
 * iba por una server action: Vercel corta el cuerpo de
 * cualquier función en 4.5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE) y esa
 * respuesta hace que la action LANCE en el cliente; `subir()` no tenía
 * `catch` y nadie se enteró. Aquí se congela:
 *
 *  1. la subida sale del NAVEGADOR al ORIGEN DEL API (no a una server action
 *     ni a `app/api/**`, que viven detrás del tope de Vercel), con el JWT de
 *     la sesión y un multipart con SOLO `file` (+ `folio`), sin
 *     `Content-Type` a mano;
 *  2. un PDF de 2.5 MB y uno de 6 MB (este habría muerto en Vercel) viajan;
 *  3. «guardada» SOLO con 200 + `archivo`; cualquier otra cosa dice que la
 *     factura NO se guardó (413 con el peso, red, tiempo agotado, 200 raro);
 *  4. folio tecleado + migración sin aplicar (409) ⇒ se sube SIN folio y se
 *     AVISA — el archivo nunca se pierde por el folio.
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

const { subirFacturaClienteDirecto } = await import("@/lib/api/factura-cliente-browser");

const VUELO = "dc204a2f-6342-43f1-9406-f76dc1302b97";
const MB = 1024 * 1024;

function pdf(bytes: number, nombre = "factura-297.pdf"): File {
  return new File([new Uint8Array(bytes)], nombre, { type: "application/pdf" });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BLOQUE_OK = {
  estatus: "FACTURADO",
  archivo: {
    path: `vuelos/${VUELO}/abc.pdf`,
    nombre: "factura-297.pdf",
    subida_at: "2026-09-24T12:00:00-05:00",
    subida_por_nombre: "Mary Cruz",
  },
  folio: "A-1234",
  uuid: null,
};

type Llamada = [string, RequestInit];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("subirFacturaClienteDirecto · el camino", () => {
  it("PDF de 2.5 MB + folio: POST directo al API, JWT, multipart file+folio, sin Content-Type", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, BLOQUE_OK));

    const res = await subirFacturaClienteDirecto(VUELO, pdf(2.5 * MB), { folio: "A-1234" });

    expect(res).toEqual({ ok: true, bloque: BLOQUE_OK });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    // Al ORIGEN del API (Railway), no al panel: sin tope de 4.5 MB de Vercel.
    expect(url).toBe(`https://api.example.com/v1/flights/${VUELO}/factura-cliente/archivo`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-de-la-sesion");
    // El boundary lo pone fetch; fijarlo a mano deja al API sin partes.
    expect(headers["Content-Type"]).toBeUndefined();
    const fd = init.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    // SOLO estos dos campos: el API corre con forbidNonWhitelisted.
    expect([...fd.keys()]).toEqual(["file", "folio"]);
    expect(fd.get("folio")).toBe("A-1234");
    const file = fd.get("file") as File;
    expect(file.name).toBe("factura-297.pdf");
    expect(file.size).toBe(2.5 * MB);
  });

  it("sin folio el multipart lleva SOLO `file`", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, BLOQUE_OK));
    await subirFacturaClienteDirecto(VUELO, pdf(1000));
    const fd = (fetchSpy.mock.calls[0] as Llamada)[1].body as FormData;
    expect([...fd.keys()]).toEqual(["file"]);
  });

  it("un PDF de 6 MB (el que Vercel cortaba) también viaja", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, BLOQUE_OK));
    const res = await subirFacturaClienteDirecto(VUELO, pdf(6 * MB));
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("más de 10 MB: se rechaza ANTES de subir, con el peso", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await subirFacturaClienteDirecto(VUELO, pdf(11 * MB));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("El archivo pesa 11.0 MB y el máximo son 10 MB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("subirFacturaClienteDirecto · nunca en silencio", () => {
  it("200 SIN archivo no se celebra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(200, { estatus: "FACTURADO", archivo: null, folio: null, uuid: null }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("no confirmó");
      expect(res.error).toContain("La factura NO se guardó.");
    }
  });

  it("413 ARCHIVO_MUY_GRANDE del API: su mensaje con el peso", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(413, {
        statusCode: 413,
        code: "ARCHIVO_MUY_GRANDE",
        message: "El archivo pesa 10.4 MB y el máximo son 10 MB.",
        details: { bytes: 10.4 * MB, limite_bytes: 10 * MB },
      }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(9.9 * MB));
    expect(res).toEqual({
      ok: false,
      error: "El archivo pesa 10.4 MB y el máximo son 10 MB. La factura NO se guardó.",
      code: "ARCHIVO_MUY_GRANDE",
    });
  });

  it("400 CAMPO_ARCHIVO_INVALIDO: el mensaje es-MX del API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(400, {
        statusCode: 400,
        code: "CAMPO_ARCHIVO_INVALIDO",
        message: "El archivo tiene que ir en el campo «file» del formulario (llegó en «archivo»).",
      }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("campo «file»");
      expect(res.error).toContain("La factura NO se guardó.");
    }
  });

  it("sin red: lo dice (no se queda el botón en «Subir factura» como si nada)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("SIN_CONEXION");
      expect(res.error).toContain("No hay conexión con el servidor. La factura NO se guardó.");
    }
  });

  it("subida colgada: se cancela y se dice", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000), { tiempoMaxMs: 20 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("TIEMPO_AGOTADO");
      expect(res.error).toContain("tardó demasiado");
    }
  });

  it("Railway reiniciando (502 sin JSON): nada de inglés", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Application failed to respond</html>", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toContain("Bad Gateway");
      expect(res.error).toContain("La factura NO se guardó.");
    }
  });
});

describe("subirFacturaClienteDirecto · folio sin la migración aplicada", () => {
  it("409 FACTURA_FOLIO_NO_DISPONIBLE ⇒ se sube SIN folio y se avisa", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        json(409, {
          statusCode: 409,
          code: "FACTURA_FOLIO_NO_DISPONIBLE",
          message: "El folio de la factura todavía no se puede guardar…",
          details: { migracion: "20260924000001" },
        }),
      )
      .mockResolvedValueOnce(json(200, { ...BLOQUE_OK, folio: null }));

    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000), { folio: "A-1234" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fd1 = (fetchSpy.mock.calls[0] as Llamada)[1].body as FormData;
    const fd2 = (fetchSpy.mock.calls[1] as Llamada)[1].body as FormData;
    expect([...fd1.keys()]).toEqual(["file", "folio"]);
    expect([...fd2.keys()]).toEqual(["file"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.avisoFolio).toContain("La factura se guardó, pero el folio");
  });

  it("sin folio tecleado, un 409 cualquiera NO se reintenta", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(409, {
        statusCode: 409,
        code: "FACTURA_CLIENTE_NO_DISPONIBLE",
        message: "La factura del servicio por vuelo todavía no está habilitada",
      }),
    );
    const res = await subirFacturaClienteDirecto(VUELO, pdf(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
  });
});

describe("el camino queda congelado en el código", () => {
  const RAIZ = path.resolve(__dirname, "../../../..");
  const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

  it("las server actions de vuelos ya NO suben archivos (tope de 4.5 MB de Vercel)", () => {
    const actions = leer("src/app/admin/flights/actions.ts");
    expect(actions).not.toMatch(/export async function subirFacturaClienteAction/);
    expect(actions).not.toMatch(/new FormData\(/);
  });

  it("el diálogo sube con `subirFacturaClienteDirecto` y avisa los fallos", () => {
    const dialogo = leer("src/components/admin/flights/factura-cliente-subir-dialog.tsx");
    expect(dialogo).toContain('from "@/lib/api/factura-cliente-browser"');
    expect(dialogo).toContain("subirFacturaClienteDirecto(");
    expect(dialogo).toContain("toast.error(res.error)");
  });
});
