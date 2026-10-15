import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GastoCreateSchema, GastoVerifySchema } from "@/app/admin/expenses/schema";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

/**
 * CABLEADO del comprobante con VARIAS hojas (12-oct-2026, «un proveedor de
 * gasolina nos emite como 5 comprobantes en PDF»): la regla vive en
 * `lib/admin/comprobante-hojas.ts` (probada aparte); aquí se vigila que el
 * alta, «Verificar / editar», las tablas y el schema la usen de verdad.
 */
describe("comprobante con varias hojas: cableado", () => {
  it("el alta acepta VARIOS archivos: el primero es la hoja principal y el resto viaja en fotos_adicionales", () => {
    const src = leer("components/admin/expenses/expense-create-dialog.tsx");
    expect(src).toContain('from "@/lib/admin/comprobante-hojas"');
    // El input y el arrastre admiten varios; nada se descarta en silencio.
    expect(src).toMatch(/type="file"\s+multiple/);
    expect(src).toMatch(/aceptarArchivosComprobante\(nuevos, archivos\.length\)/);
    expect(src).toMatch(/agregarArchivos\(Array\.from\(e\.dataTransfer\.files \?\? \[\]\)\)/);
    // Subida en orden: el primero a foto_url, los demás a las hojas.
    expect(src).toMatch(/for \(const \[i, archivo\] of archivos\.entries\(\)\)/);
    expect(src).toMatch(/if \(i === 0\) fotoPath = path;\s*else hojasPaths\.push\(path\);/);
    expect(src).toMatch(/valor_ia_extraido: valorIaConHojas\(/);
    expect(src).toMatch(/toastGastoConComprobante\(archivos\.length\)/);
    // La IA lee SOLO la hoja principal (al poner la primera o al reemplazarla).
    expect(src).toMatch(/if \(!habiaPrincipal\) \{\s*setAiRaw\(null\);\s*void leerConIA\(v\.archivos\[0\]\);/);
    expect(src).not.toContain("TIPOS_FACTURA");
  });

  it("«Verificar / editar» enseña las hojas guardadas, sube las nuevas y quita con confirmación", () => {
    const src = leer("components/admin/expenses/expense-verify-dialog.tsx");
    expect(src).toContain('from "@/lib/admin/comprobante-hojas"');
    expect(src).toMatch(/useState<string\[\]>\(\(\) => hojasDe\(gasto\)\)/);
    // Las URLs de las hojas guardadas se piden al abrir (la página solo firma la principal).
    expect(src).toMatch(/pedirUrlFirmada\("gasto-fotos", p\)/);
    // Al guardar: subida, foto_url si no había principal y la lista completa.
    // «¿Cambiaron las hojas?» contra la BASE de la sesión (revisión del
    // 14-oct-2026): una hoja que agregó otra sesión ya no se borra al guardar.
    expect(src).toMatch(/hojasCambiaron\(hojasDe\(baseForm\), hojas, hojasNuevas\.length\)/);
    expect(src).not.toContain("hojasCambiaron(hojasDe(gasto)");
    expect(src).toMatch(/subidas\.push\(await uploadGastoComprobante\(archivo\)\)/);
    // La principal: la del vivo o la que dejó un guardado propio a medias.
    expect(src).toMatch(/const tienePrincipal = !!\(gasto\.foto_url \|\| baseForm\.foto_url\);\s*if \(!tienePrincipal && todas\.length > 0\) payload\.foto_url = todas\.shift\(\);/);
    expect(src).toMatch(/payload\.valor_ia_extraido = valorIaConHojas\(base, todas\) \?\? \{\};/);
    // Quitar una hoja guardada CONFIRMA (regla de la casa).
    expect(src).toMatch(/<AlertDialogTitle>\{TITULO_QUITAR_HOJA\}<\/AlertDialogTitle>/);
    expect(src).toMatch(/onClick=\{\(\) => setHojaAQuitar\(p\)\}/);
    // Al reabrir se parte de lo guardado, sin pendientes de otra apertura.
    expect(src).toMatch(/setHojas\(hojasDe\(gasto\)\);\s*setHojasNuevas\(\[\]\);/);
  });

  it("las tablas de Gastos y del vuelo dicen «+N hojas» desde la fuente única", () => {
    for (const rel of [
      "components/admin/expenses/expenses-table.tsx",
      "components/admin/flights/flight-gastos-table.tsx",
    ]) {
      const src = leer(rel);
      expect(src, rel).toContain('from "@/lib/admin/comprobante-hojas"');
      expect(src, rel).toMatch(/textoHojas\(/);
      expect(src, rel).toMatch(/title=\{tituloHojas\(/);
    }
  });

  it("los schemas dejan viajar foto_url y las hojas dentro de valor_ia_extraido", () => {
    const verify = GastoVerifySchema.safeParse({
      foto_url: "oficina/1.pdf",
      valor_ia_extraido: { monto: 10, fotos_adicionales: ["oficina/2.pdf", "oficina/3.pdf"] },
    });
    expect(verify.success).toBe(true);
    if (verify.success) {
      expect(verify.data.foto_url).toBe("oficina/1.pdf");
      expect(verify.data.valor_ia_extraido).toEqual({
        monto: 10,
        fotos_adicionales: ["oficina/2.pdf", "oficina/3.pdf"],
      });
    }
    const create = GastoCreateSchema.safeParse({
      categoria: "GAS",
      monto: 100,
      moneda: "MXN",
      fecha_gasto: "2026-10-12",
      medio_pago: "TARJETA_CORP",
      foto_url: "oficina/1.pdf",
      valor_ia_extraido: { fotos_adicionales: ["oficina/2.pdf"] },
    });
    expect(create.success).toBe(true);
    if (create.success) {
      expect(create.data.valor_ia_extraido).toEqual({ fotos_adicionales: ["oficina/2.pdf"] });
    }
  });
});
