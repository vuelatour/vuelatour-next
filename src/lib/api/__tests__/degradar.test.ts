import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Degradaciones, textoDegradado, unirEtiquetas } from "../degradar";
import { lotesDeIds, textoSinVerificar, TOPE_IDS_BATCH } from "@/lib/admin/lotes";

/**
 * Degradación por tarjeta y lotes del batch (21-sep-2026). Lo que se congela
 * aquí es la frontera entre «degradar» y «mentir».
 */
describe("Degradaciones · llamadas accesorias", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve el vacío y apunta la etiqueta cuando el catálogo falla", async () => {
    const d = new Degradaciones();
    const res = await d.opcional("los proveedores", Promise.reject(new Error("502")), {
      data: [],
    });
    expect(res).toEqual({ data: [] });
    expect(d.faltantes).toEqual(["los proveedores"]);
    expect(d.hayFallas).toBe(true);
  });

  it("no apunta nada cuando la llamada sí responde", async () => {
    const d = new Degradaciones();
    const res = await d.opcional("las aeronaves", Promise.resolve({ data: [1] }), { data: [] });
    expect(res).toEqual({ data: [1] });
    expect(d.faltantes).toEqual([]);
    expect(d.hayFallas).toBe(false);
  });

  it("un 403 (rol sin acceso) degrada EN SILENCIO: recargar no lo arregla", async () => {
    const d = new Degradaciones();
    const e403 = Object.assign(new Error("Forbidden"), { status: 403 });
    const res = await d.opcional("los clientes", Promise.reject(e403), { data: [] });
    expect(res).toEqual({ data: [] });
    expect(d.faltantes).toEqual([]);
  });

  it("NO se traga el control de flujo de Next (notFound/redirect)", async () => {
    const d = new Degradaciones();
    const next = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    await expect(d.opcional("lo que sea", Promise.reject(next), null)).rejects.toBe(next);
    expect(d.faltantes).toEqual([]);
  });

  it("no duplica la misma etiqueta", async () => {
    const d = new Degradaciones();
    await d.opcional("las cuentas", Promise.reject(new Error("x")), null);
    await d.opcional("las cuentas", Promise.reject(new Error("x")), null);
    expect(d.faltantes).toEqual(["las cuentas"]);
  });
});

describe("texto del aviso (es-MX, singular/plural)", () => {
  it("sin fallas no dice nada", () => {
    expect(textoDegradado([])).toBeNull();
  });
  it("una sola en SINGULAR", () => {
    expect(textoDegradado(["tu usuario"])).toBe(
      "No se pudo cargar tu usuario; recarga para reintentar.",
    );
  });
  it("una sola en PLURAL concuerda el verbo", () => {
    // «No se pudo cargar los proveedores» era lo que salía en pantalla.
    expect(textoDegradado(["los proveedores"])).toBe(
      "No se pudieron cargar los proveedores; recarga para reintentar.",
    );
    expect(textoDegradado(["las aeronaves"])).toBe(
      "No se pudieron cargar las aeronaves; recarga para reintentar.",
    );
  });
  it("varias, con coma y «y»", () => {
    expect(textoDegradado(["los proveedores", "las aeronaves", "las cuentas"])).toBe(
      "No se pudieron cargar los proveedores, las aeronaves y las cuentas; recarga para reintentar.",
    );
  });
  it("unirEtiquetas", () => {
    expect(unirEtiquetas([])).toBe("");
    expect(unirEtiquetas(["a"])).toBe("a");
    expect(unirEtiquetas(["a", "b"])).toBe("a y b");
    expect(unirEtiquetas(["a", "b", "c"])).toBe("a, b y c");
  });
});

describe("lotes del batch (anti-cap del DTO del API)", () => {
  it("el tope es el @ArrayMaxSize(200) del API", () => {
    expect(TOPE_IDS_BATCH).toBe(200);
  });

  it("218 ids (el caso real de /admin/flights) se parten en 200 + 18", () => {
    const ids = Array.from({ length: 218 }, (_, i) => `id-${i}`);
    const lotes = lotesDeIds(ids);
    expect(lotes).toHaveLength(2);
    expect(lotes[0]).toHaveLength(200);
    expect(lotes[1]).toHaveLength(18);
    expect(lotes.flat()).toEqual(ids); // ni se pierde ni se duplica ninguno
  });

  it("≤ tope = un solo lote; vacío = ninguno", () => {
    expect(lotesDeIds(["a", "b"])).toEqual([["a", "b"]]);
    expect(lotesDeIds([])).toEqual([]);
  });

  it("avisa cuántos vuelos quedaron sin verificar (nunca en silencio)", () => {
    expect(textoSinVerificar(0, "el tacómetro")).toBeNull();
    expect(textoSinVerificar(1, "el tacómetro")).toBe(
      "No se pudo verificar el tacómetro de 1 vuelo; recarga para reintentar.",
    );
    expect(textoSinVerificar(18, "los cobros")).toBe(
      "No se pudo verificar los cobros de 18 vuelos; recarga para reintentar.",
    );
  });
});
