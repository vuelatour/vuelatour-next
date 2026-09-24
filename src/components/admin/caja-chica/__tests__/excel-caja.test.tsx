/**
 * EXCEL de caja chica en la pantalla del fondo (24-sep-2026). Palabras del
 * cliente: «al momento de reembolsar la caja de cada uno, me puede arrojar un
 * Excel descargable con la información de lo que estoy reembolsando».
 *
 * Los textos y rutas se prueban en `lib/admin/__tests__/caja-chica-excel.test.ts`;
 * aquí se cuida el CABLEADO:
 *  1. cada fila REPOSICIÓN del historial lleva el ícono de descarga (con
 *     `cursor-pointer` y `title`) — y SOLO ellas, y solo con permiso;
 *  2. el botón «Descargar lo pendiente por reponer (Excel)»;
 *  3. al registrar una reposición: toast con «Descargar de nuevo» + la
 *     descarga sale SOLA; si el Excel falla, el error dice que la reposición
 *     SÍ quedó y ofrece reintentar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CajaMovimiento } from "@/types/caja-chica";
import type { MovimientoFondoRow } from "../fondo-historial-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/caja-chica/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("../movimiento-actions", () => ({
  MovimientoActions: () => <span data-menu="1">⋯</span>,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));
const descargar = vi.fn();
vi.mock("@/lib/descargar-archivo", () => ({
  descargarArchivoDelPanel: (...a: unknown[]) => descargar(...a),
}));

const { FondoHistorialTable } = await import("../fondo-historial-table");
const { DescargarPorReponerButton, avisarReposicionYDescargar } = await import(
  "../excel-caja-buttons"
);
const {
  ETIQUETA_DESCARGAR_DE_NUEVO,
  TEXTO_BOTON_POR_REPONER,
  TEXTO_REPOSICION_REGISTRADA,
  TITULO_ICONO_REPOSICION,
  rutaExcelReposicion,
} = await import("@/lib/admin/caja-chica-excel");

const REPOSICION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    id: "m",
    fondo_id: "f",
    tipo: "REPOSICION",
    monto: 1070,
    moneda: "MXN",
    fecha: "2026-09-21",
    autorizado_por: null,
    referencia: null,
    notas: null,
    registrado_por: "u",
    created_at: "2026-09-21T12:00:00-05:00",
    ...p,
  };
}

function fila(p: Partial<MovimientoFondoRow>): MovimientoFondoRow {
  return {
    key: p.key ?? "k",
    fechaFmt: "21 sep 2026",
    tipoLabel: "Reposición",
    esGasto: false,
    descripcion: null,
    negativo: false,
    montoAbsFmt: "$1,070.00",
    saldoFmt: "$0.00",
    vueloId: null,
    vueloFolio: null,
    gasto: null,
    movimiento: null,
    ...p,
  };
}

const FILAS: MovimientoFondoRow[] = [
  fila({ key: "caja-rep", movimiento: mov({ id: REPOSICION_ID, tipo: "REPOSICION" }) }),
  fila({ key: "caja-ajuste", tipoLabel: "Ajuste", movimiento: mov({ id: "a", tipo: "AJUSTE" }) }),
  fila({ key: "caja-reint", tipoLabel: "Reintegro a dirección", negativo: true, movimiento: mov({ id: "r", tipo: "REINTEGRO" }) }),
  fila({ key: "gasto-1", tipoLabel: "Gasto en efectivo", esGasto: true, negativo: true }),
];

function tabla(puedeDescargarExcel: boolean): string {
  return renderToStaticMarkup(
    <FondoHistorialTable
      movimientos={FILAS}
      aircraft={[]}
      providers={[]}
      fondoId="f"
      persona="Itzi"
      moneda="MXN"
      usuarios={[]}
      puedeDescargarExcel={puedeDescargarExcel}
    />,
  );
}

function veces(html: string, texto: string): number {
  return html.split(texto).length - 1;
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  descargar.mockReset();
});

describe("historial · ícono del Excel", () => {
  it("SOLO las reposiciones lo llevan, con cursor-pointer y title", () => {
    const html = tabla(true);
    expect(veces(html, `title="${TITULO_ICONO_REPOSICION}"`)).toBe(1);
    const boton = html.slice(html.lastIndexOf("<button", html.indexOf(TITULO_ICONO_REPOSICION)));
    expect(boton.slice(0, boton.indexOf(">"))).toContain("cursor-pointer");
    // El menú ⋯ de la fila sigue ahí (no se lo come el ícono).
    expect(veces(html, 'data-menu="1"')).toBe(3);
  });

  it("sin permiso (rol que no es ADMIN/FACTURACION) no hay ícono", () => {
    expect(tabla(false)).not.toContain(TITULO_ICONO_REPOSICION);
  });
});

describe("botón de lo pendiente por reponer", () => {
  it("texto, title y cursor-pointer", () => {
    const html = renderToStaticMarkup(<DescargarPorReponerButton fondoId="f" persona="Luis" />);
    expect(html).toContain(TEXTO_BOTON_POR_REPONER);
    expect(html).toContain("antes de registrar la reposición");
    expect(html).toContain("cursor-pointer");
  });
});

describe("al registrar una reposición", () => {
  it("toast «Reposición registrada» con «Descargar de nuevo» y la descarga sale SOLA", async () => {
    descargar.mockResolvedValue(null);
    avisarReposicionYDescargar(REPOSICION_ID, "Itzi", "2026-09-21");
    await Promise.resolve();

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = toastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(titulo).toBe(TEXTO_REPOSICION_REGISTRADA);
    expect(opciones.action.label).toBe(ETIQUETA_DESCARGAR_DE_NUEVO);
    expect(descargar).toHaveBeenCalledTimes(1);
    expect(descargar.mock.calls[0][0]).toBe(rutaExcelReposicion(REPOSICION_ID));
    expect((descargar.mock.calls[0][1] as { respaldo: string }).respaldo).toBe(
      "Reposicion caja Itzi 2026-09-21.xlsx",
    );

    // «Descargar de nuevo» vuelve a pedir el MISMO Excel.
    opciones.action.onClick();
    expect(descargar).toHaveBeenCalledTimes(2);
    expect(descargar.mock.calls[1][0]).toBe(rutaExcelReposicion(REPOSICION_ID));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("si el Excel falla: la reposición SÍ quedó, y se ofrece reintentar", async () => {
    descargar.mockResolvedValue("El servidor respondió con error 502.");
    avisarReposicionYDescargar(REPOSICION_ID, "Itzi", null);
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [msg, opciones] = toastError.mock.calls[0] as [string, { action: { label: string } }];
    expect(msg).toBe(
      "La reposición quedó registrada, pero el Excel no se pudo descargar: El servidor respondió con error 502.",
    );
    expect(opciones.action.label).toBe("Reintentar");
  });
});
