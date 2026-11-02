/**
 * «Pistas por pagar»: marcar/desmarcar todas y el cuadro «Factura y pago»
 * del lote (2-nov-2026, API 0.0.115). Regla pura + cableado del diálogo y
 * de la action.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AYUDA_FACTURA_PAGO,
  TITULO_CASILLA_TODAS,
  alternarTodas,
  estadoSeleccion,
  extrasDelLote,
  siguienteAlternar,
  textoPistasGeneradas,
} from "../pistas-seleccion";

const IDS = ["a", "b", "c"];
const sel = (incluidos: string[]) =>
  Object.fromEntries(IDS.map((id) => [id, { incluir: incluidos.includes(id), monto: `${id}1` }]));

describe("estadoSeleccion / alternarTodas / siguienteAlternar", () => {
  it("NINGUNA · ALGUNAS · TODAS según las filas visibles", () => {
    expect(estadoSeleccion(IDS, sel([]))).toBe("NINGUNA");
    expect(estadoSeleccion(IDS, sel(["a"]))).toBe("ALGUNAS");
    expect(estadoSeleccion(IDS, sel(IDS))).toBe("TODAS");
    expect(estadoSeleccion([], {})).toBe("NINGUNA");
    // Una fila sin entrada en la selección cuenta como no marcada.
    expect(estadoSeleccion([...IDS, "z"], sel(IDS))).toBe("ALGUNAS");
  });

  it("alternarTodas conserva los montos y toca solo las filas visibles", () => {
    const antes = { ...sel(["a"]), otra: { incluir: true, monto: "9" } };
    const todas = alternarTodas(IDS, antes, true);
    expect(todas).toEqual({
      a: { incluir: true, monto: "a1" },
      b: { incluir: true, monto: "b1" },
      c: { incluir: true, monto: "c1" },
      otra: { incluir: true, monto: "9" },
    });
    const ninguna = alternarTodas(IDS, todas, false);
    expect(IDS.every((id) => ninguna[id].incluir === false)).toBe(true);
    expect(ninguna.otra.incluir).toBe(true);
    // Fila nueva sin selección previa: entra con monto vacío.
    expect(alternarTodas(["nueva"], {}, true)).toEqual({ nueva: { incluir: true, monto: "" } });
  });

  it("la casilla del encabezado: sin ninguna ⇒ marcar todas; con alguna o todas ⇒ desmarcar todas", () => {
    expect(siguienteAlternar("NINGUNA")).toBe(true);
    expect(siguienteAlternar("ALGUNAS")).toBe(false);
    expect(siguienteAlternar("TODAS")).toBe(false);
    expect(TITULO_CASILLA_TODAS).toEqual({
      NINGUNA: "Marcar todas",
      ALGUNAS: "Desmarcar todas",
      TODAS: "Desmarcar todas",
    });
  });
});

describe("extrasDelLote / textoPistasGeneradas", () => {
  it("vacíos no viajan; la factura se limpia; la fecha solo si es YYYY-MM-DD", () => {
    expect(extrasDelLote({ facturaFolio: "", fechaPago: "" })).toEqual({});
    expect(extrasDelLote({ facturaFolio: "  7360  ", fechaPago: "2026-10-18" })).toEqual({
      factura_folio: "7360",
      fecha_pago: "2026-10-18",
    });
    expect(extrasDelLote({ facturaFolio: "fact  vip 7360", fechaPago: "18/10/2026" })).toEqual({
      factura_folio: "fact vip 7360",
    });
  });

  it("toast con lo capturado", () => {
    expect(textoPistasGeneradas(3)).toBe("3 gastos de pista creados");
    expect(textoPistasGeneradas(1)).toBe("1 gasto de pista creado");
    const t = textoPistasGeneradas(3, { facturaFolio: "7360", fechaPago: "2026-10-18" });
    expect(t.startsWith("3 gastos de pista creados · factura 7360 · pagados el ")).toBe(true);
    expect(t).toMatch(/18/);
    expect(t).toMatch(/2026/);
    expect(textoPistasGeneradas(1, { fechaPago: "2026-10-18" })).toContain("pagado el ");
    expect(AYUDA_FACTURA_PAGO).toContain("primera línea de las notas");
  });
});

describe("cableado en el código", () => {
  const DIALOGO = readFileSync(
    path.resolve(__dirname, "../../../components/admin/expenses/pistas-dialog.tsx"),
    "utf8",
  );
  const ACTIONS = readFileSync(
    path.resolve(__dirname, "../../../app/admin/expenses/actions.ts"),
    "utf8",
  );

  it("casilla del encabezado con la regla pura (indeterminada con algunas) y el cuadro «Factura y pago»", () => {
    expect(DIALOGO).toContain("alternarTodas(ids, s, siguienteAlternar(estado))");
    expect(DIALOGO).toContain('el.indeterminate = estado === "ALGUNAS"');
    expect(DIALOGO).toContain("{TITULO_CASILLA_TODAS[estado]}");
    expect(DIALOGO).toContain("Número de factura (VIP SAESA)");
    expect(DIALOGO).toContain("Fecha de pago");
    expect(DIALOGO).toContain("{AYUDA_FACTURA_PAGO}");
    // La fecha de pago NO lleva el `min` del inicio oficial (se paga cuando sea).
    expect(DIALOGO.match(/min=\{minFechaFiltro\(inicio\)\}/g)?.length).toBe(2);
  });

  it("el lote viaja con factura y fecha de pago, y el toast las dice", () => {
    expect(DIALOGO).toContain("extrasDelLote({ facturaFolio, fechaPago })");
    expect(DIALOGO).toContain("textoPistasGeneradas(res.data.creados, { facturaFolio, fechaPago })");
    expect(ACTIONS).toContain("body: { items, ...extra }");
    expect(ACTIONS).toContain("extra: { factura_folio?: string; fecha_pago?: string } = {}");
  });
});
