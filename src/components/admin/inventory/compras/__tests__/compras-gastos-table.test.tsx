/**
 * «Gastos de compras» (6-nov-2026, API 0.0.122, invariante 118 del API): la
 * tabla de Inventario/Tienda → Compras con los pagos ligados a una compra,
 * apartados de Gastos. Cada renglón enlaza a su compra y a «Ver / editar»
 * (Gastos enfocado). Render estático: solo lo que manda el API.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import { ComprasGastosTable } from "../compras-gastos-table";

const COMPRA = "ec571eb5-68fc-40a8-8605-0fd797057cca";
const UPS = "0f5e6659-2c39-40d0-89d5-3fbd8d98537d";
const MERC = "e0e069f3-5def-499e-b87c-c95160fc6b66";

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: MERC,
    vuelo_id: null,
    compra_id: COMPRA,
    compra_rol: "MERCANCIA",
    compra: { id: COMPRA, folio: 14, referencia: null, estado: "ABIERTA", proveedor: { nombre: "Aircraft Spruce" } },
    aeronave_id: null,
    usuario_captura_id: null,
    categoria: "REFACCION",
    monto: "300",
    propina: null,
    moneda: "USD",
    tc_gasto: "18.8052",
    fecha_gasto: "2026-11-02",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "6256",
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    ...over,
  } as Gasto;
}

describe("la tabla «Gastos de compras»", () => {
  it("un renglón por gasto: fecha, compra (#folio con enlace), qué pagó, monto, medio, banco, comprobante y «Ver / editar»", () => {
    const html = renderToStaticMarkup(
      <ComprasGastosTable
        gastos={[
          gasto({}),
          gasto({
            id: UPS,
            compra_rol: "ENVIO",
            categoria: "PAQUETERIA",
            monto: "3800",
            moneda: "MXN",
            medio_pago: "EFECTIVO",
            fecha_gasto: "2026-11-04",
            conciliado: true,
            foto_url: "oficina/ups.jpg",
            proveedor: { nombre: "UPS" },
          } as Partial<Gasto>),
        ]}
      />,
    );
    expect(html).toContain(`data-gasto-compra="${MERC}"`);
    expect(html).toContain(`data-gasto-compra="${UPS}"`);
    expect(html).toContain(`href="/admin/inventory/compras/${COMPRA}"`);
    expect(html).toContain("#14");
    expect(html).toContain("Aircraft Spruce");
    expect(html).toContain("Factura de mercancía");
    expect(html).toContain("Envío");
    expect(html).toContain("UPS");
    expect(html).toContain("Conciliado");
    expect(html).toContain("Sin conciliar");
    expect(html).toContain(">Sí<");
    // «Ver / editar» abre Gastos enfocado al día del gasto.
    expect(html).toContain(`href="/admin/expenses?desde=2026-11-04&amp;hasta=2026-11-04&amp;gasto=${UPS}"`);
    expect(html).toContain("Ver / editar");
    expect((html.match(/Ver \/ editar/g) ?? []).length).toBe(2);
  });

  it("sin compra en el gasto (API raro): «—» y sin enlace a compras", () => {
    const html = renderToStaticMarkup(<ComprasGastosTable gastos={[gasto({ compra_id: null, compra: null, compra_rol: null })]} />);
    expect(html).not.toContain("/admin/inventory/compras/");
    expect(html).toContain("—");
  });
});
