import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

/**
 * CABLEADO de «¿No está el gasto? Créalo» (12-oct-2026): la regla PURA vive
 * en `lib/admin/gasto-desde-cargo.ts` (probada aparte); aquí se vigila que el
 * diálogo «Vincular gasto», el alta de gasto en modo controlado y la página
 * de Conciliación estén enchufados: duplicados + IA + casilla ANTES del
 * alta, el alta prellenada con el cargo y la liga al guardar.
 */
describe("crear el gasto desde el cargo: cableado", () => {
  const dialogo = leer("components/admin/conciliacion/vincular-gasto-dialog.tsx");
  const alta = leer("components/admin/expenses/expense-create-dialog.tsx");

  it("el diálogo del cargo ofrece «Créalo» solo con catálogos y abre el paso previo", () => {
    expect(dialogo).toContain('from "@/lib/admin/gasto-desde-cargo"');
    // El alta se carga SOLO al llegar al paso «crear» (next/dynamic, sin SSR).
    expect(dialogo).toMatch(
      /dynamic\(\s*\(\) =>\s*import\("@\/components\/admin\/expenses\/expense-create-dialog"\)\.then\(\(m\) => m\.ExpenseCreateDialog\),\s*\{ ssr: false \},?\s*\)/,
    );
    expect(dialogo).toMatch(/\{catalogosGasto \? \(\s*<button[\s\S]*?onClick=\{abrirCrear\}[\s\S]*?\{BOTON_ABRIR_CREAR\}/);
    // Al entrar: la IA (una vez) y los posibles duplicados del mismo monto, ±120 días, también en efectivo.
    expect(dialogo).toMatch(/if \(sug\.tipo === "nada"\) pedirIa\(\);\s*if \(dup === null\) cargarDuplicados\(\);/);
    expect(dialogo).toMatch(/dias: DIAS_DUPLICADOS,\s*incluir_no_bancarios: incluir,/);
    expect(dialogo).toMatch(/"code" in r && r\.code === "API_SIN_NO_BANCARIOS" \? await pedir\(false\) : r/);
    // Los excluidos (ya conciliados, efectivo…) se explican debajo de la lista.
    expect(dialogo).toMatch(/textoExcluidosCandidatos\(dupData\?\.excluidos, movimiento\.monto, \{/);
  });

  it("solo se crea con la casilla marcada y sin la búsqueda en curso; el alta va prellenada y controlada", () => {
    expect(dialogo).toMatch(/disabled=\{pending \|\| !puedeCrear\(\{ confirmado, buscandoDuplicados \}\)\}/);
    expect(dialogo).toMatch(/\{botonCrear\(veredicto\)\}/);
    expect(dialogo).toMatch(/\{casillaConfirmacion\(ia\)\}/);
    expect(dialogo).toMatch(/prefillGastoDesdeCargo\(movimiento, monedaCuenta\)/);
    expect(dialogo).toMatch(/<ExpenseCreateDialog[\s\S]*?abierto=\{crearAbierto\}[\s\S]*?prefill=\{prefill\}[\s\S]*?onCreado=\{trasCrear\}/);
  });

  it("al guardar, el gasto nuevo se liga con el cargo; en efectivo no se liga solo", () => {
    expect(dialogo).toMatch(/if \(esMedioNoBancario\(g\.medio_pago\)\) \{\s*const t = textoTrasCrear\(false, MOTIVO_NO_BANCARIO_SIN_VINCULO\);/);
    expect(dialogo).toMatch(/await linkMovimientoAction\(movimiento\.id, g\.id\)/);
    // Pase lo que pase con la liga, el gasto YA quedó: se cierra y se refresca.
    expect(dialogo).toMatch(/textoTrasCrear\(false, mensajeErrorVincularGastos\(r, etiquetaDe\)\.titulo\)/);
  });

  it("el alta de gasto tiene modo controlado: sin botón propio, prellenado al abrir y avisa con el gasto creado", () => {
    expect(alta).toMatch(/abierto\?: boolean;/);
    expect(alta).toMatch(/onCreado\?: \(gasto: Gasto\) => void;/);
    expect(alta).toMatch(/const controlado = abierto !== undefined;/);
    expect(alta).toMatch(/\{!controlado && \(\s*<Button/);
    expect(alta).toMatch(/reset\(\{ \.\.\.emptyValues\(formDefaults\), \.\.\.prefill \}\);/);
    expect(alta).toMatch(/if \(result\.data\) onCreado\?\.\(result\.data\);\s*setOpen\(false\);/);
    expect(alta).toMatch(/<DialogTitle>\{titulo \?\? "Nuevo gasto \(oficina\)"\}<\/DialogTitle>/);
  });

  it("la página carga proveedores y pasa los catálogos por la tabla y el menú hasta el diálogo", () => {
    const pagina = leer("app/admin/conciliacion/page.tsx");
    expect(pagina).toMatch(/listProviders\(\{ limit: 200 \}\)/);
    expect(pagina).toMatch(/aircraft: aeronavesRes\.data\.map\(avionCatalogoGasto\)/);
    expect(pagina).toMatch(/catalogosGasto=\{catalogosGasto\}/);
    const tabla = leer("components/admin/conciliacion/movimientos-table.tsx");
    expect(tabla).toMatch(/catalogosGasto=\{catalogosGasto\}/);
    const acciones = leer("components/admin/conciliacion/movimiento-actions.tsx");
    expect(acciones).toMatch(/<VincularGastoDialog[\s\S]*?catalogosGasto=\{catalogosGasto\}/);
  });
});
