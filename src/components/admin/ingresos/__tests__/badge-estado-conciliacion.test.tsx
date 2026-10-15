/**
 * El badge de «Conciliación» de Ingresos como BOTÓN (15-oct-2026, API 0.0.78,
 * conciliación al revés de una entrada): solo con `alAbrir` y en Conciliado /
 * Conciliado vía anticipo / Sin conciliar (también el de un parcial, que sigue
 * diciendo «Sin conciliar»); NUNCA en «No se concilia uno a uno», «—» ni un
 * ingreso dado de baja. `aria-haspopup="dialog"`, `cursor-pointer`, el
 * `title` con lo que hace el clic y el nombre accesible que empieza con el
 * texto visible. Sin `alAbrir`, el marcado de siempre. Lo mismo el badge de
 * la tarjeta de cobros (`CobroConciliadoBadge`).
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EntradaDinero, Ingreso } from "@/types/ingresos";
import type { FlightCobro } from "@/types/flights";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/ingresos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeEntradaAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { BadgeEstadoConciliacion, CeldaConciliacionEntrada, CeldaConciliacionIngreso } = await import("../entradas-table");
const { CobroConciliadoBadge } = await import("@/components/admin/flights/cobro-sobre-nota");

const noop = () => {};
const pintar = (el: ReactElement) => renderToStaticMarkup(el);

const ENTRADA: EntradaDinero = {
  origen: "COBRO_VUELO",
  id: "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f",
  dia: "2026-09-15",
  etiqueta: "Vuelo #332",
  categoria: "COBRO_VUELO",
  categoria_etiqueta: "Cobro de vuelo",
  cliente_nombre: "Beh Kay ",
  concepto: null,
  monto: 977.45,
  comision: null,
  neto: 977.45,
  moneda: "MXN",
  metodo: "TRANSFERENCIA",
  metodo_etiqueta: "Transferencia",
  vuelo_id: "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e",
  vuelo_folio: 332,
  grupo_folio: null,
  vuelo_estado: "COMPLETADO",
  por_volar: false,
  anticipo_etiqueta: null,
  cuenta_en_total: true,
  es_reembolso: false,
  conciliacion: { estado: "CONCILIADO", movimiento_id: "8a7eff81-6b8c-469e-a74d-2b0f4b631b08" },
  registrado_por_nombre: "Itzi",
};

describe("BadgeEstadoConciliacion", () => {
  it("con `alAbrir`: Conciliado, vía anticipo y Sin conciliar son <button> accesibles con cursor de mano y el sufijo del clic", () => {
    const casos = [
      { estado: "CONCILIADO", texto: "Conciliado", clic: "Clic para ver el abono del banco y su estado de cuenta." },
      { estado: "VIA_ANTICIPO", texto: "Conciliado vía anticipo", clic: "Clic para ver el abono del anticipo y su estado de cuenta." },
      { estado: "SIN_CONCILIAR", texto: "Sin conciliar", clic: "Clic para ver por qué y buscar el abono." },
    ];
    for (const { estado, texto, clic } of casos) {
      const html = pintar(<BadgeEstadoConciliacion estado={estado} alAbrir={noop} nombreAccesible={`${texto}: ver la conciliación…`} />);
      expect(html, estado).toContain('<button type="button"');
      expect(html, estado).toContain('aria-haspopup="dialog"');
      expect(html, estado).toContain(`aria-label="${texto}: ver la conciliación…"`);
      expect(html, estado).toContain("cursor-pointer");
      expect(html, estado).toContain(clic);
      expect(html, estado).toContain(`>${texto}</button>`);
    }
  });

  it("un PARCIAL sigue diciendo «Sin conciliar» (el chip del 0.0.78 va al lado) y su title lleva el sufijo del parcial", () => {
    const html = pintar(<BadgeEstadoConciliacion estado="SIN_CONCILIAR" parcial alAbrir={noop} />);
    expect(html).toContain(">Sin conciliar</button>");
    expect(html).toContain("Clic para ver los abonos y buscar el que falta.");
  });

  it("NUNCA botón: «No se concilia uno a uno» (con su title por método) ni «—»", () => {
    const efectivo = pintar(<BadgeEstadoConciliacion estado="NO_BANCARIO" contexto={{ metodo: "EFECTIVO" }} alAbrir={noop} />);
    expect(efectivo).not.toContain("<button");
    expect(efectivo).toContain('title="Efectivo en mano: no pasa por el banco."');
    expect(pintar(<BadgeEstadoConciliacion estado={null} alAbrir={noop} />)).not.toContain("<button");
  });

  it("sin `alAbrir`: el marcado de siempre (un <span>, sin cursor de mano)", () => {
    for (const estado of ["CONCILIADO", "SIN_CONCILIAR", "VIA_ANTICIPO", "NO_BANCARIO"]) {
      const html = pintar(<BadgeEstadoConciliacion estado={estado} />);
      expect(html, estado).not.toContain("<button");
      expect(html, estado).not.toContain("cursor-pointer");
    }
  });
});

describe("las celdas de las tablas", () => {
  it("una entrada de «Todos»: el nombre accesible empieza con el texto visible", () => {
    const html = pintar(<CeldaConciliacionEntrada entrada={ENTRADA} alAbrir={noop} />);
    expect(html).toContain(
      'aria-label="Conciliado: ver la conciliación con el banco del cobro del vuelo #332 de $977.45 del 15 sep 2026"',
    );
    // Un reembolso NO_BANCARIO: nunca botón y su title dice por qué.
    const reembolso = pintar(
      <CeldaConciliacionEntrada
        entrada={{ ...ENTRADA, monto: -500, es_reembolso: true, conciliacion: { estado: "NO_BANCARIO", movimiento_id: null } }}
        alAbrir={noop}
      />,
    );
    expect(reembolso).not.toContain("<button");
    expect(reembolso).toContain("Reembolso al cliente: sale del banco como un cargo; no se concilia aquí.");
  });

  it("un ingreso: botón si está vivo; dado de baja, nunca; efectivo/caja con su title", () => {
    const ingreso = {
      id: "ffb57607-77e4-4334-8ee9-94afdba75f91",
      folio: 3,
      etiqueta: "ING-3",
      categoria_etiqueta: "Otros ingresos",
      fecha: "2026-09-10",
      monto: 78,
      moneda: "MXN",
      metodo: "TRANSFERENCIA",
      metodo_etiqueta: "Transferencia",
      cliente_nombre: null,
      pagador: "didi",
      cuenta_bancaria_id: "0752514c-6e08-455d-a1bd-d5ed4c7ca689",
      conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
      baja: null,
    } as unknown as Ingreso;
    const vivo = pintar(<CeldaConciliacionIngreso ingreso={ingreso} alAbrir={noop} />);
    expect(vivo).toContain('aria-label="Sin conciliar: ver la conciliación con el banco del ingreso ING-3 de $78.00 del 10 sep 2026"');
    const baja = pintar(
      <CeldaConciliacionIngreso ingreso={{ ...ingreso, baja: { at: "2026-10-01T12:00:00Z", por_nombre: null, motivo: "x" } }} alAbrir={noop} />,
    );
    expect(baja).not.toContain("<button");
    const caja = pintar(
      <CeldaConciliacionIngreso
        ingreso={{
          ...ingreso,
          metodo: "EFECTIVO",
          cuenta_bancaria_id: null,
          conciliacion: { ...ingreso.conciliacion, estado: "NO_BANCARIO" },
        }}
        alAbrir={noop}
      />,
    );
    expect(caja).not.toContain("<button");
    expect(caja).toContain('title="Efectivo / caja: no pasa por el banco."');
  });
});

describe("CobroConciliadoBadge (tarjetas de cobros)", () => {
  const COBRO = {
    id: "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f",
    vuelo_id: "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e",
    monto: "977.45",
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    tc_usd_mxn: "17.15",
    referencia: null,
    fecha_cobro: "2026-09-15T17:00:00+00:00",
    foto_voucher_url: null,
    registrado_por: null,
    notas: null,
    created_at: "2026-09-24T22:31:02.318945+00:00",
    updated_at: "2026-09-24T22:31:02.318945+00:00",
    conciliado: true,
    conciliacion_estado: "CONCILIADO",
  } as FlightCobro;

  it("con `alAbrir`: <button> con las mismas clases + cursor, aria-haspopup y el nombre accesible de la spec", () => {
    const html = pintar(<CobroConciliadoBadge cobro={COBRO} alAbrir={noop} />);
    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Conciliado: ver la conciliación con el banco del cobro de $977.45 del 15 sep 2026"');
    expect(html).toContain("cursor-pointer hover:bg-muted/60");
    expect(html).toContain("Clic para ver el abono del banco y su estado de cuenta.");
  });

  it("sin `alAbrir`: el marcado de siempre; NO_BANCARIO o API previo sin conciliar: sin badge", () => {
    const html = pintar(<CobroConciliadoBadge cobro={COBRO} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("cursor-pointer");
    expect(pintar(<CobroConciliadoBadge cobro={{ ...COBRO, conciliacion_estado: "NO_BANCARIO", conciliado: false }} alAbrir={noop} />)).toBe("");
    expect(pintar(<CobroConciliadoBadge cobro={{ ...COBRO, conciliacion_estado: undefined, conciliado: false }} alAbrir={noop} />)).toBe("");
  });
});
