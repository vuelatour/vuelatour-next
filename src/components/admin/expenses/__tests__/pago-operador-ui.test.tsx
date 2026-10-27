/**
 * «Es el pago al operador externo» en Gastos (27-oct-2026, API 0.0.110,
 * invariante 110 del API; caso #453, Simon Herrera):
 *  1. La casilla (render real): etiqueta con el operador, ayuda y estado.
 *  2. Cableado de lo que viaja y dónde se pinta (regex sobre el fuente; el
 *     runner no tiene DOM): alta, «Verificar / editar», schemas, Provider en
 *     `AdminShell`, selector de vuelos, tabla, historial y ficha del vuelo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CasillaPagoOperador } from "@/components/admin/expenses/casilla-pago-operador";
import { AYUDA_PAGO_OPERADOR } from "@/lib/admin/pago-operador-externo";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");

describe("CasillaPagoOperador (render real)", () => {
  it("etiqueta con el operador, ayuda y la casilla marcada / sin marcar / deshabilitada", () => {
    const marcada = renderToStaticMarkup(
      <CasillaPagoOperador marcado onCambio={() => {}} operador="Simon Herrera" />,
    );
    expect(marcada).toContain("Es el pago al operador externo (Simon Herrera)");
    expect(marcada).toContain(AYUDA_PAGO_OPERADOR);
    expect(marcada).toContain('data-casilla-pago-operador=""');
    expect(marcada).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    const libre = renderToStaticMarkup(
      <CasillaPagoOperador marcado={false} onCambio={() => {}} operador={null} disabled />,
    );
    expect(libre).toContain("Es el pago al operador externo</span>");
    expect(libre).not.toMatch(/checked=""/);
    expect(libre).toMatch(/<input[^>]*disabled=""/);
  });
});

describe("cableado: qué viaja y dónde se pinta (lectura del fuente)", () => {
  it("alta: la casilla nace marcada por regla, viaja SOLO `es_pago_operador_externo: true` visible y se limpia al guardar y al cerrar", () => {
    const src = leer("components/admin/expenses/expense-create-dialog.tsx");
    expect(src).toContain("usePuedeMarcarPagoOperador()");
    expect(src).toMatch(/setPagoOperador\(pagoOperadorPorDefecto\(\{ vueloExterno: vueloExt\.externo, categoria: categoriaSel \}\)\)/);
    expect(src).toMatch(/pagoOperadorParaAlta\(\{[\s\S]*?\}\)\s*\? \{ es_pago_operador_externo: true \}\s*: \{\}\)/);
    expect(src).toMatch(/\{pagoOperadorVisible && \(\s*<CasillaPagoOperador/);
    expect(src.match(/setPagoOperador\(false\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("verificar: la llave viaja SOLO visible y si cambió contra la BASE; vuelo de la lista o del embed del API; aviso «se quita»; se reinicia por apertura", () => {
    const src = leer("components/admin/expenses/expense-verify-dialog.tsx");
    expect(src).toContain("usePuedeMarcarPagoOperador() && apiConPagoOperador(gasto)");
    expect(src).toMatch(/vueloExternoDe\(\s*vuelos\.find\(\(v\) => v\.id === vueloSel\) \?\?/);
    expect(src).toContain("gasto.vuelo : null");
    expect(src).toMatch(/pagoOperadorParaPatch\(\{[\s\S]*?actual: baseForm\.es_pago_operador_externo === true,\s*\}\)/);
    expect(src).toContain("payload.es_pago_operador_externo = pagoOperadorPatch");
    expect(src).toContain("NOTA_PAGO_OPERADOR_SE_QUITA");
    expect(src).toContain("setPagoOperador(gasto.es_pago_operador_externo === true)");
  });

  it("schemas: la llave existe en alta y en verificar (sin ella el z.object la tiraría)", () => {
    const src = leer("app/admin/expenses/schema.ts");
    expect(src.match(/es_pago_operador_externo: z\.boolean\(\)\.optional\(\)/g)?.length).toBe(2);
  });

  it("AdminShell monta `PagoOperadorProvider` con `puedeMarcarPagoOperador(me)`; el selector de vuelos trae es_externo y operador", () => {
    expect(leer("components/admin/admin-shell.tsx")).toContain(
      "<PagoOperadorProvider puedeMarcar={puedeMarcarPagoOperador(me)}>",
    );
    const actions = leer("app/admin/expenses/actions.ts");
    expect(actions).toContain("es_externo: v.es_externo === true,");
    expect(actions).toContain("operador_externo: v.operador_externo ?? null,");
  });

  it("tabla: chip «Pago operador»; historial: «Pago al operador externo»; ficha del vuelo: costo cotizado + pagado al operador", () => {
    expect(leer("components/admin/expenses/expenses-table.tsx")).toMatch(/esPagoOperadorExterno\(g\) && \(\s*<Badge/);
    const hist = leer("components/admin/flights/flight-gastos-historial-card.tsx");
    expect(hist).toContain("es_pago_operador_externo: ETIQUETA_HISTORIAL_PAGO_OPERADOR");
    expect(hist).toMatch(/case "es_pago_afac":\s*case "es_pago_operador_externo":/);
    const ficha = leer("app/admin/flights/[id]/page.tsx");
    expect(ficha).toContain('<Row label="Costo cotizado del operador externo">');
    expect(ficha).toContain("pagosAlOperadorPorMoneda(gastos)");
    expect(ficha).toContain("NOTA_SIN_PAGO_MARCADO");
    expect(leer("components/admin/quotes/quote-operador-externo.tsx")).toContain(
      'label="Lo que cobra el operador externo (costo cotizado)"',
    );
    expect(leer("components/admin/flights/cubrir-externo-dialog.tsx")).toContain(
      "Lo que cobra el operador externo (costo cotizado)",
    );
  });
});
