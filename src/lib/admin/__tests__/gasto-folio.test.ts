/**
 * La ayuda del «Folio» en transferencias (13-oct-2026, concepto del SPEI):
 * con TRANSFERENCIA se suma la regla (folio = número de la factura que se
 * paga; varias facturas por gasto ⇒ «fact NNNN» en la 1.ª línea de las
 * notas); con cualquier otro medio, la ayuda de siempre. Cableado en los dos
 * diálogos de Gastos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HINT_FOLIO_TRANSFERENCIA, hintFolioGasto } from "@/lib/admin/gasto-folio";

const SIEMPRE = "Candado anti-duplicados: otro gasto con el mismo folio se rechaza.";

describe("hintFolioGasto", () => {
  it("TRANSFERENCIA ⇒ la ayuda de siempre + la regla del folio en transferencias", () => {
    expect(hintFolioGasto("TRANSFERENCIA", SIEMPRE)).toBe(SIEMPRE + HINT_FOLIO_TRANSFERENCIA);
    expect(HINT_FOLIO_TRANSFERENCIA).toBe(
      " En pagos por transferencia (p. ej. «Pago VIP SAESA») escribe aquí el número de la factura que pagas: Conciliación lo compara con el concepto del SPEI. Si una factura ampara varios gastos, ponlo en la primera línea de sus notas («fact 7352»): el folio no se puede repetir.",
    );
  });

  it("cualquier otro medio (o ninguno) ⇒ la de siempre", () => {
    for (const medio of ["TARJETA_CORP", "EFECTIVO", "PAYWISE", "DOMICILIADO", "", null, undefined]) {
      expect(hintFolioGasto(medio, SIEMPRE)).toBe(SIEMPRE);
    }
  });

  it("cableado: los dos diálogos de Gastos pasan el medio de pago al hint del Folio", () => {
    for (const rel of ["../../../components/admin/expenses/expense-create-dialog.tsx", "../../../components/admin/expenses/expense-verify-dialog.tsx"]) {
      const src = readFileSync(path.resolve(__dirname, rel), "utf8");
      expect(src, rel).toMatch(/label="Folio \/ remisión del ticket"[\s\S]{0,300}hint=\{hintFolioGasto\(\s*watch\("medio_pago"\)/);
    }
  });
});
