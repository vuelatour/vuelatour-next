import { describe, expect, it, vi } from "vitest";
import { descargarArchivoDelPanel, mensajeDescargaFallida } from "@/lib/descargar-archivo";

/**
 * Descarga desde un PROXY del panel (24-sep-2026, Excel de caja chica): misma
 * origen, la cookie de sesión viaja sola y el token nunca llega al navegador.
 * Se congela: el nombre que manda el servidor gana, los errores llegan en
 * es-MX con la causa del API, y nunca lanza.
 */
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("descargarArchivoDelPanel", () => {
  it("guarda el blob con el nombre del Content-Disposition (con acentos)", async () => {
    const guardar = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x50, 0x4b, 3, 4]), {
        status: 200,
        headers: {
          "Content-Type": XLSX,
          "Content-Disposition":
            "attachment; filename=\"Reposicion caja Itzi 2026-09-21.xlsx\"; filename*=UTF-8''Reposici%C3%B3n%20caja%20Itzi%202026-09-21.xlsx",
        },
      }),
    );
    const err = await descargarArchivoDelPanel("/api/caja-chica/movimientos/x/reposicion", {
      respaldo: "respaldo.xlsx",
      guardar,
      fetcher,
    });
    expect(err).toBeNull();
    expect(guardar).toHaveBeenCalledTimes(1);
    const [blob, nombre] = guardar.mock.calls[0] as [Blob, string];
    expect(nombre).toBe("Reposición caja Itzi 2026-09-21.xlsx");
    expect(blob.size).toBe(4);
    // Misma origen, sin token: la cookie la manda el navegador.
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/caja-chica/movimientos/x/reposicion");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sin Content-Disposition usa el respaldo", async () => {
    const guardar = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    await descargarArchivoDelPanel("/x", { respaldo: "Por reponer caja Luis 2026-09-24.xlsx", guardar, fetcher });
    expect(guardar.mock.calls[0][1]).toBe("Por reponer caja Luis 2026-09-24.xlsx");
  });

  it("409 del API: su mensaje tal cual (y no se guarda nada)", async () => {
    const guardar = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Solo las reposiciones tienen Excel de lo repuesto; este movimiento es «Ajuste».",
          code: "MOVIMIENTO_NO_ES_REPOSICION",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    const err = await descargarArchivoDelPanel("/x", { respaldo: "r.xlsx", guardar, fetcher });
    expect(err).toBe("Solo las reposiciones tienen Excel de lo repuesto; este movimiento es «Ajuste».");
    expect(guardar).not.toHaveBeenCalled();
  });

  it("sin red: mensaje y nunca lanza", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await descargarArchivoDelPanel("/x", { respaldo: "r.xlsx", guardar: vi.fn(), fetcher });
    expect(err).toContain("Sin conexión");
  });
});

describe("mensajeDescargaFallida", () => {
  it("sesión, permiso, 504 de Vercel y genérico", () => {
    expect(mensajeDescargaFallida(401, null)).toContain("sesión expiró");
    expect(mensajeDescargaFallida(403, { message: "Forbidden resource" })).toBe(
      "Tu usuario no tiene permiso para esta descarga.",
    );
    expect(mensajeDescargaFallida(504, null)).toContain("tardó demasiado");
    expect(mensajeDescargaFallida(500, null)).toBe("El servidor respondió con error 500.");
    expect(mensajeDescargaFallida(400, { message: ["a", "b"] })).toBe("a; b");
  });
});
