import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GastoCreateSchema } from "@/app/admin/expenses/schema";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

/**
 * CABLEADO de «Refacción = un gasto normal» (21-oct-2026, invariante 101 del
 * API; antes «Refacción: directo al avión o a Inventario/Tienda»). Lo que se
 * vigila en el alta: no hay segmento de destino ni sub-formulario de la
 * bodega, el POST no lleva `inventario`, la refacción sin avión se guarda (es
 * un gasto de la empresa) y la nota sale de `lib/admin/refaccion-alta`.
 */
describe("refacción en el alta: cableado", () => {
  const alta = leer("components/admin/expenses/expense-create-dialog.tsx");

  it("sin segmento «Directo al avión | A Inventario/Tienda» ni sub-formulario de la bodega", () => {
    expect(alta).not.toContain("refaccion-inventario");
    expect(alta).not.toContain("TITULO_DESTINO_REFACCION");
    expect(alta).not.toContain('["AVION", "INVENTARIO"]');
    expect(alta).not.toContain("payloadInventario");
    expect(alta).not.toContain("opcionesArticulos");
    expect(alta).not.toContain("ETIQUETA_PRECIO_VENTA");
    expect(alta).not.toContain("listArticulosRefaccionAction");
  });

  it("la nota viene de la fuente única y depende SOLO del avión elegido", () => {
    expect(alta).toContain('import { notaRefaccionAlta } from "@/lib/admin/refaccion-alta";');
    expect(alta).toMatch(/\{esRefaccion && \(\s*<p[\s\S]*?data-refaccion-nota[\s\S]*?\{notaRefaccionAlta\(\{ conAvion: !!avionSel \}\)\}/);
  });

  it("al guardar: el POST no lleva `inventario` y la refacción sin avión NO se frena", () => {
    expect(alta).not.toContain("inventario:");
    expect(alta).not.toContain("inventarioPayload");
    expect(alta).not.toMatch(/refDestino === "AVION" && !values\.aeronave_id/);
    // El único freno de fecha antes de la confirmación es el de los cargos.
    expect(alta).toContain(
      "const errorFecha = conCargos ? errorFechaFuturaConCargos(values.fecha_gasto, capacidadPorPagar) : null;",
    );
  });

  it("el schema del alta ya no conoce `inventario` (una llave así se descarta, no viaja)", () => {
    const r = GastoCreateSchema.safeParse({
      categoria: "REFACCION",
      monto: 1000,
      moneda: "MXN",
      fecha_gasto: "2026-10-21",
      medio_pago: "TRANSFERENCIA",
      inventario: { nombre: "Filtro", cantidad: 2, precio_venta: 450, precio_venta_moneda: "MXN" },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("inventario");
  });

  it("el alta ya no fuerza la hoja del hint de categoría (la prop `hoja` sigue para el reparto de «Verificar / editar»)", () => {
    expect(alta).not.toContain("hojaDestinoRefaccionInventario");
    expect(alta).toMatch(/<CategoriaDestinoHint\s+categoria=\{watch\("categoria"\)\}\s+tieneVuelo=\{!!watch\("vuelo_id"\)\}\s+tieneAvion=\{!!watch\("aeronave_id"\)\}\s*\/>/);
  });
});
