import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `/admin/ingresos` (24-sep-2026): «Sugerir con IA» (hasta ~130 s) y «Subir
 * estado de cuenta» (la lectura IA de un PDF tarda minutos) son server actions
 * invocadas DESDE esta página, y en Vercel heredan el límite del SEGMENTO.
 * Sin `maxDuration = 300` se cortaban (misma razón que /admin/conciliacion).
 *
 * Se lee el archivo (no se importa): el módulo de la página arrastra el
 * runtime de Next y Supabase; aquí solo importa la línea que decide el límite.
 */
const raiz = path.resolve(__dirname, "../../../app/admin/ingresos");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

describe("límites de tiempo de Ingresos", () => {
  it("la página exporta maxDuration = 300 y es dinámica", () => {
    const src = leer("page.tsx");
    expect(src).toMatch(/^export const maxDuration = 300;$/m);
    expect(src).toMatch(/^export const dynamic = "force-dynamic";$/m);
  });

  it("el proxy del Excel exporta maxDuration = 60 (el render vive en pyservices)", () => {
    const src = readFileSync(path.resolve(raiz, "../../api/ingresos/export/route.ts"), "utf8");
    expect(src).toMatch(/^export const maxDuration = 60;$/m);
  });

  it("las subidas con comprobante NO son server actions (tope de 4.5 MB de Vercel)", () => {
    const src = leer("actions.ts");
    expect(src).not.toMatch(/FormData/);
    expect(src).not.toMatch(/archivo_base64|file_base64/);
  });
});
