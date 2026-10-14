/**
 * «Gastos sin banco» / «Cobros sin banco» cuando la lista NO se pudo leer
 * (14-oct-2026). Regla del proyecto: jamás «sin datos» cuando la carga falló.
 * Hasta hoy la página atrapaba el fallo de `conciliacionGastosSinBanco` con
 * null y montaba `GastosSinBancoTable` con cero filas: una lista de dinero
 * vacía que decía «no falta nada». Ahora las dos pestañas montan la tabla
 * SOLO con la lectura buena y, si no, el aviso con «Reintentar».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_REINTENTAR_LISTA,
  MSG_LISTA_SIN_BANCO_NO_CARGO,
  TEXTO_REINTENTANDO_LISTA,
} from "@/lib/admin/conciliacion-vista";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));

const { AvisoListaSinBancoNoCargo } = await import("@/components/admin/conciliacion/lista-sin-banco-no-cargo");

const pagina = readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

describe("la página: la tabla SOLO con la lectura buena", () => {
  it("las dos lecturas siguen atrapando el fallo con null (null = falló, no «vacía»)", () => {
    expect(pagina).toContain("conciliacionGastosSinBanco(sinBancoRango.desde, sinBancoRango.hasta).catch(() => null)");
    expect(pagina).toContain("conciliacionCobrosSinBanco(sinBancoRango.desde, sinBancoRango.hasta).catch(() => null)");
  });

  it("«Gastos sin banco»: la tabla bajo `sinBanco ?` y, si falló, el aviso", () => {
    expect(pagina).toMatch(
      /\{sinBanco \? \(\s*<GastosSinBancoTable rows=\{sinBancoRows\} \/>\s*\) : \(\s*<AvisoListaSinBancoNoCargo \/>\s*\)\}/,
    );
    // UNA sola tabla montada: no hay otro camino que la pinte vacía.
    expect(pagina.match(/<GastosSinBancoTable\b/g)?.length).toBe(1);
  });

  it("«Cobros sin banco»: el mismo patrón y el mismo aviso", () => {
    expect(pagina).toMatch(
      /\{cobrosSinBanco \? \(\s*<CobrosSinBancoTable rows=\{cobrosSinBanco\.data\} \/>\s*\) : \(\s*<AvisoListaSinBancoNoCargo \/>\s*\)\}/,
    );
    expect(pagina.match(/<CobrosSinBancoTable\b/g)?.length).toBe(1);
  });

  it("el texto vive en lib/admin/conciliacion-vista.ts, no en la página", () => {
    expect(pagina).not.toContain("No se pudo consultar la lista");
    expect(pagina).toContain(
      'import { AvisoListaSinBancoNoCargo } from "@/components/admin/conciliacion/lista-sin-banco-no-cargo";',
    );
  });
});

describe("el aviso", () => {
  const html = renderToStaticMarkup(<AvisoListaSinBancoNoCargo />);

  it("dice que la lista NO se pudo consultar, en role=alert", () => {
    expect(MSG_LISTA_SIN_BANCO_NO_CARGO).toBe(
      "No se pudo consultar la lista (el API no respondió). Pulsa «Reintentar» o recarga la página.",
    );
    expect(html).toMatch(/<div role="alert" data-lista-no-cargo=""/);
    expect(html).toContain(MSG_LISTA_SIN_BANCO_NO_CARGO);
  });

  it("«Reintentar» es un botón type=button con cursor-pointer", () => {
    const boton = html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(boton).toContain('type="button"');
    expect(boton).toContain("cursor-pointer");
    expect(html).toContain(`${BOTON_REINTENTAR_LISTA}</button>`);
    expect(TEXTO_REINTENTANDO_LISTA).toBe("Reintentando…");
  });
});
