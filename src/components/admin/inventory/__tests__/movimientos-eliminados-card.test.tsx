/**
 * Bitácora «Movimientos eliminados» bajo el cardex (21-sep-2026). Los textos
 * puros viven en `lib/admin/__tests__/inventario-eliminar.test.ts`; aquí se
 * cuida el MARCADO, que es lo que el cliente pidió ver: QUIÉN eliminó, CUÁNDO
 * (hora de Cancún) y el MOTIVO completo — y que una lectura FALLIDA jamás se
 * pinte como «no hay eliminados».
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MovimientosEliminadosCard } from "../movimientos-eliminados-card";
import type { MovimientoEliminado } from "@/types/inventory";

const fila: MovimientoEliminado = {
  id: "aud-1",
  movimiento_id: "mov-1",
  tipo: "SALIDA",
  cantidad: 10,
  fecha_movimiento: "2026-08-29",
  aeronave_matricula: "XA-VGV",
  motivo: "se capturó por error el 29 de agosto, la salida nunca ocurrió",
  eliminado_por_nombre: "Diego Ramírez",
  // 2026-09-21 15:30 UTC = 10:30 en Cancún (UTC−5).
  eliminado_at: "2026-09-21T15:30:00.000Z",
  gastos_eliminados: 1,
  monto_gastos: 3500,
  moneda_gastos: "MXN",
};

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("MovimientosEliminadosCard", () => {
  it("dice qué se eliminó, quién, cuándo (hora Cancún) y por qué", () => {
    const t = texto(
      renderToStaticMarkup(<MovimientosEliminadosCard filas={[fila]} unidad="cuarto (qt)" />),
    );
    expect(t).toContain("Movimientos eliminados (1)");
    expect(t).toContain("SALIDA de 10 cuarto (qt)");
    expect(t).toContain("29 ago 2026");
    expect(t).toContain("XA-VGV");
    expect(t).toContain("Diego Ramírez");
    // Hora de Cancún, no UTC: 15:30Z son las 10:30 allá.
    expect(t).toContain("10:30");
    expect(t).not.toContain("15:30");
    expect(t).toContain("1 gasto");
    expect(t).toContain("la salida nunca ocurrió");
    expect(t).toContain("hora de Cancún");
  });

  it("sin filas no pinta nada (es historia, no operación del día)", () => {
    expect(renderToStaticMarkup(<MovimientosEliminadosCard filas={[]} />)).toBe("");
  });

  it("si la lectura FALLÓ lo dice, jamás «no hay eliminados»", () => {
    const t = texto(renderToStaticMarkup(<MovimientosEliminadosCard filas={[]} falla />));
    expect(t).toContain("No se pudo cargar el historial");
    expect(t).not.toContain("Movimientos eliminados (0)");
  });
});
