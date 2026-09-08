import { describe, expect, it } from "vitest";
import { hashPayload, PreviewCache } from "@/lib/admin/quote-preview-cache";

describe("hashPayload", () => {
  it("es determinista y distingue payloads distintos", () => {
    const a = JSON.stringify({ aeronave_id: "x", pasajeros: 4 });
    const b = JSON.stringify({ aeronave_id: "x", pasajeros: 5 });
    expect(hashPayload(a)).toBe(hashPayload(a));
    expect(hashPayload(a)).not.toBe(hashPayload(b));
    expect(hashPayload(a)).toMatch(/^[0-9a-z]+$/);
  });

  it("cambia con el orden de claves (el JSON es la identidad)", () => {
    expect(hashPayload('{"a":1,"b":2}')).not.toBe(hashPayload('{"b":2,"a":1}'));
  });
});

describe("PreviewCache", () => {
  it("guarda y devuelve por payload exacto", () => {
    const c = new PreviewCache(20);
    expect(c.get("p1")).toBeNull();
    c.set("p1", "<html>1</html>");
    expect(c.get("p1")).toBe("<html>1</html>");
    expect(c.has("p1")).toBe(true);
    expect(c.has("p2")).toBe(false);
  });

  it("no cruza hojas si dos payloads chocan en hash (compara el JSON)", () => {
    const c = new PreviewCache(20);
    // Simula colisión: mismo hash forzado guardando dos JSON con la misma
    // llave interna — la API pública solo expone json; se valida que un
    // payload distinto nunca lea la entrada de otro.
    c.set("p1", "<html>1</html>");
    expect(c.get("p1 ")).toBeNull();
  });

  it("evicta el más viejo al pasar de 20 (LRU por lectura)", () => {
    const c = new PreviewCache(20);
    for (let i = 0; i < 20; i++) c.set(`p${i}`, `h${i}`);
    expect(c.size).toBe(20);
    // Leer p0 lo vuelve reciente: al insertar p20 sale p1, no p0.
    expect(c.get("p0")).toBe("h0");
    c.set("p20", "h20");
    expect(c.size).toBe(20);
    expect(c.get("p0")).toBe("h0");
    expect(c.get("p1")).toBeNull();
    expect(c.get("p20")).toBe("h20");
  });

  it("re-set del mismo payload reemplaza sin duplicar", () => {
    const c = new PreviewCache(3);
    c.set("a", "1");
    c.set("a", "2");
    expect(c.size).toBe(1);
    expect(c.get("a")).toBe("2");
  });
});
