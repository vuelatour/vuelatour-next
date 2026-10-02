import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * COMPROBANTE de un pago a socio (1-oct-2026, API 0.0.49): la subida sale del
 * NAVEGADOR al ORIGEN DEL API (no por server action: tope de 4.5 MB de
 * Vercel), con el JWT de la sesión, multipart con SOLO `file` y sin
 * `Content-Type` a mano. Nunca lanza y nunca celebra en falso.
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

const { adjuntarComprobantePagoSocio } = await import("@/lib/api/reparto-pagos-browser");

const MB = 1024 * 1024;
const PAGO = "9a9a0000-0000-4000-8000-000000000001";
type Llamada = [string, RequestInit];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const archivo = (bytes: number, nombre = "transferencia.jpg") =>
  new File([new Uint8Array(bytes)], nombre, { type: "image/jpeg" });

const PAGO_API = {
  id: PAGO,
  monto: "1395.94",
  monto_usd: "1395.94",
  comprobante_path: `a/2026-09/${PAGO}.jpg`,
  comprobante_url: "https://sb.example.com/storage/v1/object/sign/reparto-comprobantes/x?token=t",
  fecha_pago: "2026-10-01",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("adjuntarComprobantePagoSocio", () => {
  it("POST directo al API con JWT, multipart SOLO `file` y sin Content-Type; un archivo de 6 MB viaja", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(201, { pago: PAGO_API }));
    const res = await adjuntarComprobantePagoSocio(PAGO, archivo(6 * MB));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.pago.comprobante_path).toBe(PAGO_API.comprobante_path);
    const [url, init] = fetchSpy.mock.calls[0] as Llamada;
    expect(url).toBe(`https://api.example.com/v1/profit-sharing/pagos/${PAGO}/comprobante`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-de-la-sesion");
    expect(headers["Content-Type"]).toBeUndefined();
    expect([...(init.body as FormData).keys()]).toEqual(["file"]);
  });

  it("archivo inválido o de más de 10 MB: no llama al API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const grande = await adjuntarComprobantePagoSocio(PAGO, archivo(11 * MB));
    const raro = await adjuntarComprobantePagoSocio(PAGO, archivo(10, "notas.docx"));
    expect(grande.ok).toBe(false);
    expect(raro.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("200 sin el comprobante guardado no se celebra; los errores dicen que NO se guardó", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { pago: { ...PAGO_API, comprobante_path: null } }));
    const sin = await adjuntarComprobantePagoSocio(PAGO, archivo(10));
    expect(sin).toMatchObject({ ok: false, code: "SIN_CONFIRMACION" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json(503, {
        statusCode: 503,
        code: "PAGOS_SOCIOS_NO_DISPONIBLE",
        message:
          "El registro de pagos a socios todavía no está habilitado en la base de datos (falta aplicar una actualización). Vuelve a intentarlo en unos minutos; si sigue igual, avisa a soporte.",
      }),
    );
    const nd = await adjuntarComprobantePagoSocio(PAGO, archivo(10));
    expect(nd.ok).toBe(false);
    if (!nd.ok) expect(nd.error).toMatch(/todavía no está habilitado.*El comprobante NO se guardó\.$/);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const red = await adjuntarComprobantePagoSocio(PAGO, archivo(10));
    expect(red).toMatchObject({ ok: false, code: "SIN_CONEXION" });
  });
});
