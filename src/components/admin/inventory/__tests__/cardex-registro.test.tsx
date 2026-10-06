/**
 * Historial del cardex (6-oct-2026): columna «Registró» con quién registró
 * cada movimiento y cuándo lo capturó. Pedido del cliente: «salió 1 aceite
 * para el N58BT y yo no he realizado esa salida» (era una PRUEBA de otro
 * usuario). Con un API previo (sin `registro`) se pinta «—».
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardexTable, textoRegistroMovimiento } from "@/components/admin/inventory/cardex-table";
import type { InventarioMovimiento } from "@/types/inventory";
import { fmtDateTimeShort } from "@/lib/datetime";

function mov(extra: Partial<InventarioMovimiento>): InventarioMovimiento {
  return {
    id: "m1",
    item_id: "i1",
    tipo: "SALIDA",
    cantidad: 1,
    costo_unitario_usd: 15.93,
    moneda: "MXN",
    costo_unitario_mxn: 281.5,
    tc_usd_mxn: 17.6711,
    aeronave_id: "a1",
    proveedor_id: null,
    fecha_movimiento: "2026-09-26",
    fecha_orden: null,
    fecha_cargo_banco: null,
    referencia: null,
    notas: "PRUEBA",
    registrado_por: "u1",
    created_at: "2026-09-26T18:12:14.083Z",
    aeronave: { matricula: "N58BT" },
    ...extra,
  } as InventarioMovimiento;
}

describe("cardex: columna «Registró»", () => {
  it("pinta el nombre de quien registró y la hora de captura", () => {
    const html = renderToStaticMarkup(
      <CardexTable movimientos={[mov({ registro: { nombre: "Pablo Canales" } })]} />,
    );
    expect(html).toContain("Registró");
    expect(html).toContain("Pablo Canales");
    // Hora de captura en Cancún, con el mismo formato corto de las tablas.
    expect(html).toContain(fmtDateTimeShort("2026-09-26T18:12:14.083Z"));
    // Las notas van en el tooltip de la celda.
    expect(html).toContain('title="PRUEBA"');
  });

  it("API previo (sin registro): «—» y sin reventar", () => {
    expect(textoRegistroMovimiento({ registro: undefined })).toBe("—");
    expect(textoRegistroMovimiento({ registro: null })).toBe("—");
    expect(textoRegistroMovimiento({ registro: { nombre: "  " } })).toBe("—");
    const html = renderToStaticMarkup(<CardexTable movimientos={[mov({})]} />);
    expect(html).toContain("Registró");
  });
});
