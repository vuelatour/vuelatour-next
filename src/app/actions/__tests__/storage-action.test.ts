/**
 * `refrescarUrlsFirmadasAction` (1-oct-2026, «las fotos de las facturas no
 * están cargando»): la miniatura cuya URL firmada venció pide otra aquí. Se
 * custodia el CONTRATO con `POST /v1/storage/firmar` y que la action NUNCA
 * lance (la foto debe caer en su placeholder, sin error en consola):
 *  - bucket fuera de la lista blanca ⇒ ni se llama al API;
 *  - un path que el API rechazaría (URL completa, «/» inicial, «..») NO viaja:
 *    su 400 `PATH_INVALIDO` tumbaría el LOTE entero;
 *  - API viejo (404), rol sin permiso (403) o red caída ⇒ `{ok:false}`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

const { refrescarUrlsFirmadasAction } = await import("../storage");

const P1 = "02996dd1-417d-4871-b4eb-87c4a9697cac/2026-09/20c7ef4a.jpg";
const P2 = "oficina/1727-abc-factura.jpg";

beforeEach(() => {
  apiServer.mockReset();
});

describe("refrescarUrlsFirmadasAction", () => {
  it("POST /v1/storage/firmar con bucket + paths sin repetir; devuelve {path: url}", async () => {
    apiServer.mockResolvedValue({
      urls: { [P1]: "https://s/1", [P2]: "https://s/2" },
      expira_en_s: 28800,
    });
    const r = await refrescarUrlsFirmadasAction({ bucket: "gasto-fotos", paths: [P1, P2, P1] });
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer).toHaveBeenCalledWith("/v1/storage/firmar", {
      method: "POST",
      body: { bucket: "gasto-fotos", paths: [P1, P2] },
      cache: "no-store",
    });
    expect(r).toEqual({
      ok: true,
      data: { urls: { [P1]: "https://s/1", [P2]: "https://s/2" }, expiraEnS: 28800 },
    });
  });

  it("un path que el API rechazaría NO viaja (no tumba el lote de los demás)", async () => {
    apiServer.mockResolvedValue({ urls: { [P1]: "https://s/1" }, expira_en_s: 28800 });
    await refrescarUrlsFirmadasAction({
      bucket: "gasto-fotos",
      paths: [
        "https://x.supabase.co/storage/v1/object/public/gasto-fotos/a.jpg",
        "/u/a.jpg",
        "u/../csd/llave.key",
        "u\\a.jpg",
        "",
        P1,
      ],
    });
    expect(apiServer.mock.calls[0][1].body).toEqual({ bucket: "gasto-fotos", paths: [P1] });
  });

  it("solo paths inválidos ⇒ ni se llama al API", async () => {
    const r = await refrescarUrlsFirmadasAction({
      bucket: "taco-fotos",
      paths: ["/a.jpg", "../b.jpg"],
    });
    expect(apiServer).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, data: { urls: {}, expiraEnS: null } });
  });

  it("bucket fuera de la lista blanca ⇒ {ok:false} sin llamar al API", async () => {
    const r = await refrescarUrlsFirmadasAction({ bucket: "csd", paths: [P1] });
    expect(apiServer).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("más de 100 paths ⇒ {ok:false} sin llamar al API (el lote del navegador ya los parte)", async () => {
    const muchos = Array.from({ length: 101 }, (_, i) => `u/${i}.jpg`);
    const r = await refrescarUrlsFirmadasAction({ bucket: "gasto-fotos", paths: muchos });
    expect(apiServer).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("API viejo (404), rol sin permiso (403) o red caída ⇒ {ok:false}, nunca lanza", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot POST /v1/storage/firmar" }));
    const viejo = await refrescarUrlsFirmadasAction({ bucket: "gasto-fotos", paths: [P1] });
    expect(viejo.ok).toBe(false);
    expect(viejo.error).toMatch(/todavía no renueva/);

    apiServer.mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        code: "BUCKET_FUERA_DE_ROL",
        message: "Tu rol no tiene acceso a este archivo; pídeselo a administración.",
      }),
    );
    const rol = await refrescarUrlsFirmadasAction({ bucket: "cobro-vouchers", paths: [P1] });
    expect(rol).toEqual({ ok: false, error: "Tu rol no tiene acceso a este archivo; pídeselo a administración." });

    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    const red = await refrescarUrlsFirmadasAction({ bucket: "gasto-fotos", paths: [P1] });
    expect(red.ok).toBe(false);
  });
});
