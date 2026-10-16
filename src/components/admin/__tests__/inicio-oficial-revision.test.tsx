/**
 * Revisión adversaria del inicio oficial (16-oct-2026, API 0.0.84): lo que
 * el primer pase dejó suelto.
 *  - «Ver en Conciliación» de un cargo/abono de ANTES del inicio: el listado
 *    ya no lo trae nunca; el aviso decía «Quita los filtros para buscarlo»
 *    (mentira). Ahora dice que es de antes del inicio y se conserva.
 *  - La hoja «Conciliación con el banco» de un gasto pinta el chip en el
 *    cargo de antes (y en las líneas del lote).
 *  - Tacómetros en vivo: un `?fecha=` viejo se lleva al inicio con aviso y
 *    «Día anterior» se apaga en el día del inicio.
 *  - «Aterrizajes sin gasto»: el periodo no baja del inicio.
 * Con `inicio = null` (API previo): textos y marcado de siempre.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TEXTO_MOVIMIENTO_NO_ENCONTRADO,
  TEXTO_MOVIMIENTO_NO_ENCONTRADO_GENERICO,
  periodoPedidoAntesDelInicio,
  textoMovimientoNoEncontrado,
} from "@/lib/admin/conciliacion-vista";
import { respuesta321 } from "@/lib/admin/__tests__/gasto-banco.fixtures";
import type { ConciliacionDeGasto } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/expenses",
}));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }) }));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeGastoAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { GastoBancoDetalle } = await import("../expenses/gasto-banco-detalle");
const { InicioOficialProvider } = await import("../inicio-oficial-provider");

const INICIO = "2026-09-01";
const CHIP = "De antes del inicio oficial (1-sep-2026)";
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("Conciliación: movimiento enfocado de antes del inicio", () => {
  it("periodoPedidoAntesDelInicio: solo cuando el periodo PEDIDO cae entero antes", () => {
    expect(periodoPedidoAntesDelInicio("2026-08-27", "2026-08-27", INICIO)).toBe(INICIO);
    expect(periodoPedidoAntesDelInicio(undefined, "2026-08-31", INICIO)).toBe(INICIO);
    expect(periodoPedidoAntesDelInicio("2026-08-31", undefined, INICIO)).toBe(INICIO);
    // Cruza el inicio, es posterior, o no hay días válidos ⇒ null.
    expect(periodoPedidoAntesDelInicio("2026-08-25", "2026-09-10", INICIO)).toBeNull();
    expect(periodoPedidoAntesDelInicio("2026-09-01", "2026-09-01", INICIO)).toBeNull();
    expect(periodoPedidoAntesDelInicio("basura", "2026-13-45", INICIO)).toBeNull();
    expect(periodoPedidoAntesDelInicio(undefined, undefined, INICIO)).toBeNull();
    // Sin inicio (API previo) ⇒ siempre null.
    expect(periodoPedidoAntesDelInicio("2026-08-27", "2026-08-27", null)).toBeNull();
  });

  it("el aviso dice la verdad (no «quita los filtros») y sin inicio es el de siempre", () => {
    expect(textoMovimientoNoEncontrado({ gasto: "g" }, INICIO)).toBe(
      "El cargo que abriste desde Gastos es de antes del inicio oficial (1-sep-2026): se conserva, pero ya no aparece en Conciliación. Sus datos siguen en la hoja desde donde lo abriste.",
    );
    expect(textoMovimientoNoEncontrado({ gasto: null }, INICIO)).toBe(
      "El movimiento que abriste es de antes del inicio oficial (1-sep-2026): se conserva, pero ya no aparece en Conciliación. Sus datos siguen en la hoja desde donde lo abriste.",
    );
    expect(textoMovimientoNoEncontrado({ gasto: "g" }, null)).toBe(TEXTO_MOVIMIENTO_NO_ENCONTRADO);
    expect(textoMovimientoNoEncontrado({ gasto: null })).toBe(TEXTO_MOVIMIENTO_NO_ENCONTRADO_GENERICO);
  });

  it("la página lo cablea y no ofrece «Ver todos» para uno de antes", () => {
    const src = leer("../../../app/admin/conciliacion/page.tsx");
    expect(src).toContain("periodoPedidoAntesDelInicio(sp.desde, sp.hasta, inicio)");
    expect(src).toContain("textoMovimientoNoEncontrado(enfoque, movAntesDelInicio)");
    expect(src).toContain("{!movAntesDelInicio && (");
  });
});

describe("Hoja «Conciliación con el banco»: chip en el cargo de antes", () => {
  /** El caso real: gasto del 27-ago dentro del lote de un cargo de agosto. */
  const deAgosto = (): ConciliacionDeGasto => {
    const r = respuesta321();
    return { ...r, cargos: r.cargos.map((c) => ({ ...c, fecha: "2026-08-27" })) };
  };
  const pintar = (r: ConciliacionDeGasto, inicio: string | null) =>
    renderToStaticMarkup(
      <InicioOficialProvider inicio={inicio}>
        <GastoBancoDetalle
          fila={{
            id: r.gasto.id,
            monto: r.gasto.monto,
            moneda: r.gasto.moneda,
            conciliado: r.gasto.conciliado,
            medio_pago: r.gasto.medio_pago,
            fecha_gasto: r.gasto.fecha_gasto,
          }}
          resultado={{ ok: true, data: r }}
          descargando={null}
          onReintentar={() => {}}
          onRecargar={() => {}}
          onDescargar={() => {}}
        />
      </InicioOficialProvider>,
    );

  it("cargo de agosto con inicio ⇒ chip; de septiembre ⇒ nada", () => {
    expect(pintar(deAgosto(), INICIO)).toContain(CHIP);
    expect(pintar(respuesta321(), INICIO)).not.toContain(CHIP);
  });

  it("sin inicio (API previo) ⇒ el marcado de siempre, byte a byte", () => {
    const sinProvider = renderToStaticMarkup(
      <GastoBancoDetalle
        fila={{
          id: deAgosto().gasto.id,
          monto: deAgosto().gasto.monto,
          moneda: deAgosto().gasto.moneda,
          conciliado: deAgosto().gasto.conciliado,
          medio_pago: deAgosto().gasto.medio_pago,
          fecha_gasto: deAgosto().gasto.fecha_gasto,
        }}
        resultado={{ ok: true, data: deAgosto() }}
        descargando={null}
        onReintentar={() => {}}
        onRecargar={() => {}}
        onDescargar={() => {}}
      />,
    );
    expect(pintar(deAgosto(), null)).toBe(sinProvider);
    expect(sinProvider).not.toContain(CHIP);
  });
});

describe("Tacómetros en vivo y aterrizajes sin gasto", () => {
  it("taco-live: `?fecha=` viejo sube al inicio con aviso; «Día anterior» se apaga", () => {
    const src = leer("../../../app/admin/taco-live/page.tsx");
    expect(src).toContain("await getInicioOficial()");
    expect(src).toContain("pisoDesde(sp.fecha, inicio)");
    expect(src).toContain("searchParams: { fecha: fechaPedida }");
    expect(src).toContain("<AvisoPeriodoAjustado inicio={inicio} ajustado={fechaAjustada} />");
    expect(src).toContain("esAntesDelInicio(shiftDay(fecha, -1), inicio)");
    expect(src).toContain('aria-disabled="true"');
  });

  it("aterrizajes sin gasto: las dos fechas llevan `min` del inicio", () => {
    const src = leer("../expenses/pistas-dialog.tsx");
    expect(src.match(/min=\{minFechaFiltro\(inicio\)\}/g)?.length).toBe(2);
  });
});
