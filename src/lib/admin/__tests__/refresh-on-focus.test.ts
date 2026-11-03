import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  debeRefrescarAlEnfocar,
  hayCapturaAbierta,
  MIN_ENTRE_REFRESCOS_MS,
  SELECTOR_CAPTURA_ABIERTA,
} from "../refresh-on-focus";

describe("debeRefrescarAlEnfocar", () => {
  it("la primera vez refresca", () => {
    expect(debeRefrescarAlEnfocar(null, 1_000)).toBe(true);
  });
  it("dos focos seguidos no disparan dos refrescos", () => {
    expect(debeRefrescarAlEnfocar(1_000, 1_000 + MIN_ENTRE_REFRESCOS_MS - 1)).toBe(false);
  });
  it("pasado el mínimo vuelve a refrescar", () => {
    expect(debeRefrescarAlEnfocar(1_000, 1_000 + MIN_ENTRE_REFRESCOS_MS)).toBe(true);
  });
});

describe("hayCapturaAbierta (3-nov-2026)", () => {
  const docCon = (hallado: unknown) => ({
    querySelector: (sel: string) => (sel === SELECTOR_CAPTURA_ABIERTA ? hallado : null),
  });

  it("con un diálogo, panel lateral o alerta abiertos (role dialog/alertdialog) no se refresca", () => {
    expect(SELECTOR_CAPTURA_ABIERTA).toBe('[role="dialog"], [role="alertdialog"]');
    expect(hayCapturaAbierta(docCon({ tag: "div" }))).toBe(true);
  });

  it("sin diálogo (o sin documento) sí", () => {
    expect(hayCapturaAbierta(docCon(null))).toBe(false);
    expect(hayCapturaAbierta(null)).toBe(false);
    expect(hayCapturaAbierta(undefined)).toBe(false);
  });

  it("cableado: RefreshOnFocus se salta el refresh ANTES de consumir el mínimo", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../components/admin/refresh-on-focus.tsx"),
      "utf8",
    );
    const guard = src.indexOf("if (hayCapturaAbierta(document)) return;");
    const consumo = src.indexOf("ultimo.current = ahora;");
    const refresh = src.indexOf("router.refresh();");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(consumo);
    expect(consumo).toBeLessThan(refresh);
  });
});
