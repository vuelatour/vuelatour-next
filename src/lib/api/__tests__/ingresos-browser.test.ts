import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * INGRESOS — el CAMINO del alta/edición con comprobante (24-sep-2026).
 *
 * Lo mismo que se aprendió con las facturas emitidas:
 *  1. Sale del NAVEGADOR al ORIGEN DEL API (no a una server action ni a
 *     `app/api/**`, detrás del tope de 4.5 MB de Vercel), con el JWT de la
 *     sesión y SIN `Content-Type` a mano.
 *  2. Multipart EXACTO del contrato: `datos` (JSON) + `archivo`. El API corre
 *     con `forbidNonWhitelisted`: otro campo es un 400.
 *  3. Nunca lanza y nunca celebra en falso: 409/413, 200 sin el ingreso, red
 *     caída y tiempo agotado se DICEN (y que NO se guardó).
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

const { editarIngreso, motivoComprobanteIngresoInvalido, registrarIngreso } = await import(
  "@/lib/api/ingresos-browser"
);

const MB = 1024 * 1024;
type Llamada = [string, RequestInit];

function pdf(bytes: number, nombre = "ficha.pdf"): File {
  return new File([new Uint8Array(bytes)], nombre, { type: "application/pdf" });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const INGRESO = { id: "i-1", folio: 12, etiqueta: "ING-12" };
const DATOS = {
  categoria: "OTRO_INGRESO" as const,
  fecha: "2026-09-24",
  descripcion: "Intereses de septiembre",
  monto: 1234.5,
  moneda: "MXN" as const,
  metodo: "TRANSFERENCIA" as const,
  cuenta_bancaria_id: "0a9c2b1e-2d3f-4a5b-8c7d-6e5f4a3b2c1d",
  client_request_id: "k-1",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("registrarIngreso · el camino", () => {
  it("POST directo al API, JWT, multipart `datos` + `archivo`, sin Content-Type", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(201, { ingreso: INGRESO, movimiento_id: null, avisos: [] }));
    const r = await registrarIngreso(DATOS, pdf(6 * MB));
    expect(r).toEqual({ ok: true, data: { ingreso: INGRESO, movimiento_id: null, avisos: [] } });
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/ingresos");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-de-la-sesion");
    expect(headers["Content-Type"]).toBeUndefined();
    const fd = init.body as FormData;
    expect([...fd.keys()]).toEqual(["datos", "archivo"]);
    expect(JSON.parse(fd.get("datos") as string)).toEqual(DATOS);
    expect((fd.get("archivo") as File).size).toBe(6 * MB);
  });

  it("sin archivo el multipart lleva SOLO `datos`", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(201, { ingreso: INGRESO, movimiento_id: "m-1", avisos: ["ojo"], idempotente: true }));
    const r = await registrarIngreso(DATOS);
    const [, init] = fetchSpy.mock.calls[0] as Llamada;
    expect([...(init.body as FormData).keys()]).toEqual(["datos"]);
    expect(r.ok && r.data).toEqual({ ingreso: INGRESO, movimiento_id: "m-1", avisos: ["ojo"], idempotente: true });
  });
});

describe("registrarIngreso · nunca en silencio", () => {
  it("409 ABONO_TIENE_COBRO_CANDIDATO: mensaje del API, code y details para el diálogo", async () => {
    const details = { candidatos: [{ tipo: "COBRO_VUELO", id: "c1", etiqueta: "Cobro · vuelo #235" }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(409, {
        statusCode: 409,
        code: "ABONO_TIENE_COBRO_CANDIDATO",
        message: "Este abono cuadra con el cobro del vuelo #235 (Cristy Chavez): vincúlalo a ese cobro.",
        details,
      }),
    );
    const r = await registrarIngreso(DATOS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ABONO_TIENE_COBRO_CANDIDATO");
      expect(r.status).toBe(409);
      expect(r.details).toEqual(details);
      expect(r.error).toBe(
        "Este abono cuadra con el cobro del vuelo #235 (Cristy Chavez): vincúlalo a ese cobro. El ingreso NO se guardó.",
      );
    }
  });

  it("413 ARCHIVO_MUY_GRANDE legible", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(413, {
        statusCode: 413,
        code: "ARCHIVO_MUY_GRANDE",
        message: "El archivo pesa 12.4 MB y el máximo son 10 MB.",
        details: { bytes: 13_000_000, limite_bytes: 10 * MB },
      }),
    );
    const r = await registrarIngreso(DATOS, pdf(1));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(413);
      expect(r.error).toBe("El archivo pesa 12.4 MB y el máximo son 10 MB. El ingreso NO se guardó.");
    }
  });

  it("200 SIN el ingreso no se celebra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    const r = await registrarIngreso(DATOS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("El ingreso NO se guardó.");
  });

  it("red caída: no lanza y lo dice", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await registrarIngreso(DATOS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("SIN_CONEXION");
      expect(r.error).toMatch(/conexión.*NO se guardó/);
    }
  });

  it("tiempo agotado: se cancela la espera y se dice (default 150 s)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          (init as RequestInit).signal?.addEventListener("abort", () =>
            rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const r = await registrarIngreso(DATOS, null, { tiempoMaxMs: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("TIEMPO_AGOTADO");
      expect(r.error).toMatch(/NO se guardó/);
    }
    const mod = await import("@/lib/api/ingresos-browser");
    expect(mod.TIEMPO_MAX_SUBIDA_INGRESO_MS).toBe(150_000);
  });
});

describe("editarIngreso", () => {
  it("PATCH a /:id con `datos` (solo lo que cambió) y el archivo nuevo", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(200, { ingreso: INGRESO, avisos: [] }));
    const r = await editarIngreso("i-1", { notas: "x", if_updated_at: "2026-09-24T00:00:00Z" }, pdf(10));
    expect(r.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe("https://api.example.com/v1/ingresos/i-1");
    expect(init.method).toBe("PATCH");
    expect([...(init.body as FormData).keys()]).toEqual(["datos", "archivo"]);
  });

  it("409 INGRESO_CONCILIADO: el mensaje del API + «NO se guardaron»", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(409, {
        statusCode: 409,
        code: "INGRESO_CONCILIADO",
        message: "El ingreso ING-12 está conciliado con un abono del banco: desvincúlalo antes.",
      }),
    );
    const r = await editarIngreso("i-1", { monto: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INGRESO_CONCILIADO");
      expect(r.error).toMatch(/desvincúlalo antes\. Los cambios NO se guardaron\.$/);
    }
  });
});

describe("comprobante: foto o PDF de hasta 10 MB", () => {
  it("tipo y tamaño", () => {
    expect(motivoComprobanteIngresoInvalido({ name: "a.pdf", size: 9 * MB, type: "application/pdf" })).toBeNull();
    expect(motivoComprobanteIngresoInvalido({ name: "a.jpg", size: 1, type: "image/jpeg" })).toBeNull();
    expect(motivoComprobanteIngresoInvalido({ name: "a.xlsx", size: 1, type: "application/vnd.ms-excel" })).toMatch(
      /foto/,
    );
    expect(motivoComprobanteIngresoInvalido({ name: "a.pdf", size: 11 * MB, type: "application/pdf" })).toMatch(
      /11\.0 MB y el máximo son 10 MB/,
    );
  });
});
