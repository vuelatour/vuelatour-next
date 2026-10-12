/**
 * Selector de periodo (12-oct-2026, «se traba el calendario»): una fecha a
 * medio teclear nunca navega; una completa aplica con la otra fecha
 * arrastrada si el rango se invierte.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANIO_MINIMO,
  ESPERA_APLICAR_MS,
  fechaCompleta,
  periodoAlCambiar,
  periodoCambia,
  queryDePeriodo,
} from "../periodo-selector";

const P = { desde: "2026-09-01", hasta: "2026-09-30" };

describe("fechaCompleta", () => {
  it("solo un día real con año de 4 cifras (lo que teclea un humano a medias no cuenta)", () => {
    expect(fechaCompleta("2026-09-15")).toBe(true);
    expect(fechaCompleta("0002-09-15")).toBe(false);
    expect(fechaCompleta("0202-09-15")).toBe(false);
    expect(fechaCompleta("2026-13-45")).toBe(false);
    expect(fechaCompleta("")).toBe(false);
    expect(fechaCompleta(null)).toBe(false);
    expect(fechaCompleta("2026-09-15T10:00")).toBe(false);
    expect(ANIO_MINIMO).toBe(2000);
    expect(ESPERA_APLICAR_MS).toBeGreaterThanOrEqual(300);
  });
});

describe("periodoAlCambiar", () => {
  it("cambia el extremo tecleado y conserva el otro", () => {
    expect(periodoAlCambiar(P, "desde", "2026-09-10")).toEqual({ desde: "2026-09-10", hasta: "2026-09-30" });
    expect(periodoAlCambiar(P, "hasta", "2026-09-20")).toEqual({ desde: "2026-09-01", hasta: "2026-09-20" });
  });

  it("un rango invertido arrastra la otra fecha (nunca un 400 del API)", () => {
    expect(periodoAlCambiar(P, "desde", "2026-10-05")).toEqual({ desde: "2026-10-05", hasta: "2026-10-05" });
    expect(periodoAlCambiar(P, "hasta", "2026-08-20")).toEqual({ desde: "2026-08-20", hasta: "2026-08-20" });
  });

  it("una fecha incompleta no cambia nada", () => {
    expect(periodoAlCambiar(P, "desde", "0002-09-10")).toBeNull();
    expect(periodoAlCambiar(P, "hasta", "")).toBeNull();
  });
});

describe("periodoCambia y query", () => {
  it("solo navega cuando difiere de la URL; manda desde y hasta", () => {
    expect(periodoCambia(P, { ...P })).toBe(false);
    expect(periodoCambia(P, { desde: "2026-09-02", hasta: P.hasta })).toBe(true);
    expect(queryDePeriodo(P)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
});

describe("cableado del selector y de Reportes", () => {
  const raiz = path.resolve(__dirname, "../../../");
  it("los inputs son controlados por el borrador, sin `key` que los re-monte, y aplican al salir o con Enter", () => {
    const src = readFileSync(path.resolve(raiz, "components/admin/profit-sharing/period-selector.tsx"), "utf8");
    expect(src).toContain('from "@/lib/admin/periodo-selector"');
    expect(src).not.toMatch(/key=\{initial\.(desde|hasta)\}/);
    expect(src).not.toContain("defaultValue=");
    expect(src).toContain("value={visible.desde}");
    expect(src).toContain("value={visible.hasta}");
    expect(src).toContain('onBlur={() => onSalir("desde")}');
    expect(src).toContain('onBlur={() => onSalir("hasta")}');
    expect(src).toContain("setTimeout(() => aplicar(completo), ESPERA_APLICAR_MS)");
  });

  it("el pre-cierre de Reportes va en su propio Suspense con esqueleto (cambiar el periodo no espera al API pesado)", () => {
    const src = readFileSync(path.resolve(raiz, "app/admin/reportes/page.tsx"), "utf8");
    expect(src).toMatch(/<Suspense key=\{`\$\{desde\}:\$\{hasta\}`\} fallback=\{<PreCierreCardCargando \/>\}>\s*<PreCierreCard desde=\{desde\} hasta=\{hasta\} \/>\s*<\/Suspense>/);
  });

  it("el menú y la pantalla dicen «Inventario/Tienda» (pedido del cliente, 12-oct-2026)", () => {
    const nav = readFileSync(path.resolve(raiz, "lib/admin/nav-items.ts"), "utf8");
    expect(nav).toContain('label: "Inventario/Tienda"');
    expect(nav).not.toMatch(/label: "Inventario",/);
    const pagina = readFileSync(path.resolve(raiz, "app/admin/inventory/page.tsx"), "utf8");
    expect(pagina).toContain(">Inventario/Tienda</h1>");
  });
});
