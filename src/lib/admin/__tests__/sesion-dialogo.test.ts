/**
 * Sesión por id de los diálogos de edición (3-nov-2026): lo capturado en el
 * diálogo de cliente NO se borra cuando la tabla se vuelve a pintar con
 * objetos nuevos (RefreshOnFocus, una revalidación). Reporte de Mary
 * (2-nov-2026): «subo los datos fiscales y no se quedan guardados».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { abrirSesionDialogo, llaveSesionDialogo, type SesionDialogo } from "../sesion-dialogo";

describe("llaveSesionDialogo", () => {
  it("cerrado ⇒ null; alta ⇒ NUEVO; edición ⇒ el id", () => {
    expect(llaveSesionDialogo(false, "c-1")).toBeNull();
    expect(llaveSesionDialogo(false, undefined)).toBeNull();
    expect(llaveSesionDialogo(true, undefined)).toBe("NUEVO");
    expect(llaveSesionDialogo(true, null)).toBe("NUEVO");
    expect(llaveSesionDialogo(true, "c-1")).toBe("c-1");
  });
});

describe("abrirSesionDialogo", () => {
  it("cerrado y sin sesión: no pasa nada", () => {
    expect(abrirSesionDialogo(null, null)).toEqual({ cambia: false });
  });

  it("abrir empieza una sesión viva", () => {
    const paso = abrirSesionDialogo(null, "c-1");
    expect(paso).toEqual({ cambia: true, sesion: { llave: "c-1", cancelada: false } });
  });

  it("la misma llave (la fila como otro objeto tras un refresh) NO reinicia ni cancela", () => {
    const sesion: SesionDialogo = { llave: "c-1", cancelada: false };
    expect(abrirSesionDialogo(sesion, "c-1")).toEqual({ cambia: false });
    expect(sesion.cancelada).toBe(false);
  });

  it("otro cliente con el diálogo abierto: cancela la anterior y empieza otra", () => {
    const anterior: SesionDialogo = { llave: "c-1", cancelada: false };
    const paso = abrirSesionDialogo(anterior, "c-2");
    expect(anterior.cancelada).toBe(true);
    expect(paso).toEqual({ cambia: true, sesion: { llave: "c-2", cancelada: false } });
  });

  it("cerrar cancela la sesión y la suelta; reabrir el mismo cliente vuelve a cargar", () => {
    const abierta: SesionDialogo = { llave: "c-1", cancelada: false };
    expect(abrirSesionDialogo(abierta, null)).toEqual({ cambia: true, sesion: null });
    expect(abierta.cancelada).toBe(true);
    expect(abrirSesionDialogo(null, "c-1")).toEqual({
      cambia: true,
      sesion: { llave: "c-1", cancelada: false },
    });
  });
});

describe("cableado del diálogo de cliente", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../../components/admin/clients/client-form-dialog.tsx"),
    "utf8",
  );

  it("la sesión se abre por id, no por identidad de la fila", () => {
    expect(src).toContain("llaveSesionDialogo(open, initialClient?.id)");
    expect(src).toContain("abrirSesionDialogo(sesionRef.current,");
    expect(src).toContain("if (!paso.cambia) return;");
    expect(src).toContain("reset(defaults(initialClient));");
  });

  it("las cargas pendientes se descartan por sesión, no por el cleanup del efecto", () => {
    expect(src).toContain("if (!sesion.cancelada && r.ok && r.data) setAircraft(r.data);");
    expect(src).toContain("if (sesion.cancelada) return;");
    expect(src).not.toContain("let cancelled = false;");
    // El desmontaje cancela y suelta la sesión (Strict Mode remonta y recarga).
    expect(src).toContain("sesionRef.current.cancelada = true;");
    expect(src).toContain("sesionRef.current = null;");
  });
});
