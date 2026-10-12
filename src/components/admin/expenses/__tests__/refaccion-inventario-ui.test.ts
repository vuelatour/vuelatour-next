import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GastoCreateSchema } from "@/app/admin/expenses/schema";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

/**
 * CABLEADO de «Refacción: directo al avión o a Inventario/Tienda»
 * (12-oct-2026, API 0.0.72). La regla PURA vive en
 * `lib/admin/refaccion-inventario.ts` (probada aparte); aquí se vigila que el
 * alta la use: el segmento, la nota de la traza con avión, el precio de
 * venta obligatorio antes de subir nada, el bloque `inventario` en el POST,
 * el toast por etapa y que el schema lo deje pasar.
 */
describe("refacción a Inventario/Tienda: cableado del alta", () => {
  const alta = leer("components/admin/expenses/expense-create-dialog.tsx");

  it("el segmento «Directo al avión | A Inventario/Tienda» y la nota de la traza con avión", () => {
    expect(alta).toContain('from "@/lib/admin/refaccion-inventario"');
    expect(alta).toMatch(/\(\["AVION", "INVENTARIO"\] as const\)\.map/);
    expect(alta).toMatch(/aria-pressed=\{refDestino === d\}/);
    expect(alta).toMatch(/destinoRefaccionInicial\(\{ conVueloPrefijado: !!defaultVueloId \}\)/);
    expect(alta).toMatch(/matriculaSel\s*\?\s*notaInventarioConAvion\(\{/);
    expect(alta).toContain("NOTA_INVENTARIO_SIN_AVION");
    expect(alta).toMatch(/\{avionSel \? NOTA_DIRECTO_AVION : NOTA_DIRECTO_AVION_SIN_AVION\}/);
  });

  it("el sub-formulario: artículo (existente o nuevo), unidades, precio de venta OBLIGATORIO y «vender al avión» solo con avión", () => {
    expect(alta).toMatch(/opcionesArticulos\(articulos \?\? \[\]\)/);
    expect(alta).toMatch(/inv\.item_id === OPCION_ARTICULO_NUEVO && \(/);
    expect(alta).toMatch(/<Field label=\{ETIQUETA_PRECIO_VENTA\} required hint=\{HINT_PRECIO_VENTA\}>/);
    expect(alta).toMatch(/\{avionSel && \(\s*<div[\s\S]*?\{ETIQUETA_VENDER_AL_AVION\}[\s\S]*?<Switch/);
    // Los artículos se piden UNA vez, al llegar al modo inventario.
    expect(alta).toMatch(/if \(!open \|\| !esRefaccion \|\| refDestino !== "INVENTARIO" \|\| articulos !== null\) return;/);
  });

  it("al guardar: avión obligatorio en «directo»; en inventario el bloque se valida ANTES de subir y viaja en el POST", () => {
    const candado = alta.indexOf('if (refDestino === "AVION" && !values.aeronave_id)');
    const subida = alta.indexOf("uploadGastoComprobante(archivo)");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(subida);
    expect(alta).toMatch(/const v = payloadInventario\(inv, \{ aeronaveId: values\.aeronave_id \}\);/);
    expect(alta).toMatch(/\.\.\.\(inventarioPayload \? \{ inventario: inventarioPayload \} : \{\}\),/);
    // El toast por etapa y el error traducido de un API previo.
    expect(alta).toMatch(/toastRefaccionInventario\(\s*result\.data\?\.inventario,/);
    expect(alta).toMatch(/mensajeErrorInventario\(result\.error\)/);
    // Al guardar y al cerrar, el sub-formulario vuelve a cero.
    expect(alta.match(/reiniciarRefaccion\(\);/g)?.length).toBe(2);
    // El hint de categoría dice la hoja de la bodega.
    expect(alta).toMatch(/hoja=\{\s*esRefaccion && refDestino === "INVENTARIO"/);
  });

  it("el schema deja pasar el bloque `inventario` tal como lo arma payloadInventario", () => {
    const r = GastoCreateSchema.safeParse({
      categoria: "REFACCION",
      monto: 1000,
      moneda: "MXN",
      fecha_gasto: "2026-10-12",
      medio_pago: "TRANSFERENCIA",
      aeronave_id: "3f9a1c2e-0000-4000-8000-000000000000",
      inventario: { nombre: "Filtro CH48110", cantidad: 2, precio_venta: 450, precio_venta_moneda: "MXN", vender_al_avion: true },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inventario).toEqual({
        nombre: "Filtro CH48110",
        cantidad: 2,
        precio_venta: 450,
        precio_venta_moneda: "MXN",
        vender_al_avion: true,
      });
    }
    const malo = GastoCreateSchema.safeParse({
      categoria: "REFACCION", monto: 1, moneda: "MXN", fecha_gasto: "2026-10-12", medio_pago: "TRANSFERENCIA",
      inventario: { cantidad: 0, precio_venta: -1, precio_venta_moneda: "MXN" },
    });
    expect(malo.success).toBe(false);
  });

  it("el hint de categoría acepta la hoja forzada y la pinta sin vuelo ni avión", () => {
    const hint = leer("components/admin/expenses/categoria-destino-hint.tsx");
    expect(hint).toMatch(/hoja\?: string \| null;/);
    expect(hint).toMatch(/const conLoElegido = hoja \?\? \(tieneVuelo \|\| tieneAvion \? hojaDestinoGasto\(/);
  });
});
