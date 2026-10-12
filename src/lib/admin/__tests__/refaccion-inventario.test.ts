import { describe, expect, it } from "vitest";
import {
  OPCION_ARTICULO_NUEVO,
  destinoRefaccionInicial,
  esApiSinInventario,
  formAlElegirArticulo,
  formInventarioVacio,
  hojaDestinoRefaccionInventario,
  mensajeErrorInventario,
  notaInventarioConAvion,
  opcionesArticulos,
  payloadInventario,
  toastRefaccionInventario,
  type GastoInventarioResultado,
} from "../refaccion-inventario";

describe("refacción: destino y notas", () => {
  it("desde el vuelo arranca directo al avión; en el alta general, a la bodega", () => {
    expect(destinoRefaccionInicial({ conVueloPrefijado: true })).toBe("AVION");
    expect(destinoRefaccionInicial({ conVueloPrefijado: false })).toBe("INVENTARIO");
  });

  it("la nota de la TRAZA con avión dice entrada + salida y el precio; sin vender, que se queda en bodega", () => {
    const t = notaInventarioConAvion({ matricula: "XA-VGV", vender: true, precioVenta: "450", moneda: "MXN" });
    expect(t).toContain("sale vendida a XA-VGV a $450 MXN c/u");
    expect(t).toContain("traza (entrada + salida)");
    expect(notaInventarioConAvion({ matricula: "XA-VGV", vender: false, precioVenta: "", moneda: "MXN" })).toContain(
      "se queda en bodega",
    );
    expect(hojaDestinoRefaccionInventario({ tieneAvion: true, vender: true })).toContain("hoja Refacciones");
  });
});

describe("refacción: sub-formulario de inventario", () => {
  const vacio = formInventarioVacio("USD");
  it("arranca con 1 unidad, la moneda del gasto y vender encendido; elegir un artículo prellena su precio", () => {
    expect(vacio).toMatchObject({ item_id: "", cantidad: "1", precio_venta_moneda: "USD", vender_al_avion: true });
    const f = formAlElegirArticulo(vacio, "it-1", { id: "it-1", nombre: "Filtro", precio_venta: 450, precio_venta_moneda: "MXN" });
    expect(f).toMatchObject({ item_id: "it-1", precio_venta: "450", precio_venta_moneda: "MXN" });
    expect(formAlElegirArticulo(f, OPCION_ARTICULO_NUEVO, null).item_id).toBe(OPCION_ARTICULO_NUEVO);
    expect(formAlElegirArticulo(f, "", null).item_id).toBe("");
  });

  it("opciones: «nuevo» primero; nombre · nº de parte con la existencia", () => {
    const o = opcionesArticulos([{ id: "a", nombre: "Aceite", numero_parte: "15W50", stock: "30", unidad: "qt" }, { id: "b", nombre: "Bujía" }]);
    expect(o[0].value).toBe(OPCION_ARTICULO_NUEVO);
    expect(o[1]).toMatchObject({ value: "a", label: "Aceite · 15W50", description: "Existencia 30 qt" });
    expect(o[2]).toMatchObject({ value: "b", label: "Bujía" });
    expect(o[2].description).toBeUndefined();
  });

  it("payload: exige artículo o nombre, unidades > 0 y el precio de venta (0 vale); vender solo con avión", () => {
    expect(payloadInventario(vacio, { aeronaveId: "" }).ok).toBe(false);
    const nuevo = { ...vacio, item_id: OPCION_ARTICULO_NUEVO };
    expect(payloadInventario(nuevo, { aeronaveId: "" })).toMatchObject({ ok: false, error: expect.stringContaining("nombre") });
    const conNombre = { ...nuevo, nombre: " Filtro CH48110 ", numero_parte: "CH48110 ", cantidad: "2" };
    expect(payloadInventario(conNombre, { aeronaveId: "av" })).toMatchObject({ ok: false, error: expect.stringContaining("precio de venta") });
    const r = payloadInventario({ ...conNombre, precio_venta: "450.005" }, { aeronaveId: "av" });
    expect(r).toEqual({
      ok: true,
      inventario: { nombre: "Filtro CH48110", numero_parte: "CH48110", cantidad: 2, precio_venta: 450.01, precio_venta_moneda: "USD", vender_al_avion: true },
    });
    const existente = payloadInventario({ ...vacio, item_id: "it-1", precio_venta: "0" }, { aeronaveId: "" });
    expect(existente).toEqual({
      ok: true,
      inventario: { item_id: "it-1", cantidad: 1, precio_venta: 0, precio_venta_moneda: "USD", vender_al_avion: false },
    });
    expect(payloadInventario({ ...vacio, item_id: "it-1", cantidad: "0", precio_venta: "1" }, { aeronaveId: "" }).ok).toBe(false);
  });
});

describe("refacción: respuesta del API", () => {
  const base: GastoInventarioResultado = {
    item_id: "it-1", item_nombre: "Filtro CH48110", item_creado: true, compra_id: "c-1", compra_folio: 12,
    entrada_id: "e-1", precio_venta_guardado: true, salida: { movimiento_id: "s-1", gasto_id: "g-b", monto: 900, moneda: "MXN" }, error: null, avisos: [],
  };
  it("todo bien: verde con compra, artículo nuevo y la venta al avión", () => {
    const t = toastRefaccionInventario(base, "XA-VGV");
    expect(t.tipo).toBe("success");
    expect(t.titulo).toContain("«Filtro CH48110» entró a Inventario/Tienda (compra #12), artículo nuevo y se vendió a XA-VGV por $900 MXN");
    expect(toastRefaccionInventario({ ...base, salida: null }).titulo).toContain("véndela al avión desde su salida");
    expect(toastRefaccionInventario(null).titulo).toBe("Gasto registrado");
  });
  it("una etapa fallida: ámbar con los avisos del API", () => {
    const t = toastRefaccionInventario({ ...base, salida: null, error: "SALIDA", avisos: ["La pieza entró a bodega (compra #12), pero NO se vendió al avión"] });
    expect(t).toMatchObject({ tipo: "warning", titulo: "Gasto registrado; revisa la bodega" });
    expect(t.descripcion).toContain("NO se vendió");
    expect(toastRefaccionInventario({ ...base, compra_id: null, error: "COMPRA", avisos: ["x"] }).titulo).toContain("NO entró");
  });
  it("API previo: el 400 de whitelist se traduce", () => {
    expect(esApiSinInventario("property inventario should not exist")).toBe(true);
    expect(mensajeErrorInventario("property inventario should not exist")).toContain("Directo al avión");
    expect(mensajeErrorInventario("Elige el artículo")).toBe("Elige el artículo");
  });
});
