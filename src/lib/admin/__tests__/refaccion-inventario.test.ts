import { describe, expect, it } from "vitest";
import { CATEGORIAS_CAPTURA } from "@/lib/admin/categorias-gasto";
import { MSG_FECHA_FUTURA_CON_CARGOS, SIN_CAPACIDAD_POR_PAGAR } from "@/lib/admin/gasto-por-pagar";
import {
  MSG_INVENTARIO_FECHA_FUTURA,
  NOTA_DIRECTO_AVION_SIN_AVION,
  NOTA_ELIGE_AVION_REFACCION,
  NOTA_REFACCION_POR_PAGAR_SIN_AVION,
  OPCION_ARTICULO_NUEVO,
  destinoRefaccionInicial,
  errorFechaAlGuardarAlta,
  errorInventarioFechaFutura,
  notaDirectoAvionSinAvion,
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

describe("refacción «A Inventario/Tienda» con fecha FUTURA (revisión del lote «por pagar», P12, acuerdo 4)", () => {
  const HOY = "2026-10-20";
  const CON = { habilitado: true };
  const SIN = { habilitado: false };

  it("el texto EXACTO del API (`INVENTARIO_FECHA_FUTURA`)", () => {
    expect(MSG_INVENTARIO_FECHA_FUTURA).toBe(
      "Una refacción con fecha futura queda «por pagar»: guárdala sin entrada a Inventario/Tienda y registra la entrada desde Inventario/Tienda (Compras) el día que llegue la pieza.",
    );
  });

  it("con la capacidad, destino Inventario y fecha > hoy (Cancún) ⇒ no se guarda y se dice", () => {
    // El caso de la revisión: llantas de N4142R con pago el 05-nov.
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "2026-11-05", capacidad: CON, hoy: HOY })).toBe(
      MSG_INVENTARIO_FECHA_FUTURA,
    );
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "2026-10-21", capacidad: CON, hoy: HOY })).toBe(
      MSG_INVENTARIO_FECHA_FUTURA,
    );
  });

  it("hoy o antes, «Directo al avión», ilegible o SIN la capacidad (API previo): como antes", () => {
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: HOY, capacidad: CON, hoy: HOY })).toBeNull();
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "2026-10-01", capacidad: CON, hoy: HOY })).toBeNull();
    expect(errorInventarioFechaFutura({ destino: "AVION", fecha: "2026-11-05", capacidad: CON, hoy: HOY })).toBeNull();
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "", capacidad: CON, hoy: HOY })).toBeNull();
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "2026-02-30", capacidad: CON, hoy: HOY })).toBeNull();
    expect(errorInventarioFechaFutura({ destino: "INVENTARIO", fecha: "2026-11-05", capacidad: SIN, hoy: HOY })).toBeNull();
  });
});

describe("el freno de fecha de «Guardar» del alta (`errorFechaAlGuardarAlta`, segunda revisión del lote: P12/P17)", () => {
  // «Hoy» Cancún = 20-oct; fin de mes = 31-oct.
  const HOY = "2026-10-20";
  const MANANA = "2026-10-21";
  const CON = { habilitado: true, fechaMax: "2026-11-19" };
  const base = {
    conCargos: false,
    categoria: "REFACCION",
    destino: "INVENTARIO" as const,
    fecha: MANANA,
    capacidad: CON,
    hoy: HOY,
  };

  it("REFACCION «A Inventario/Tienda» con fecha futura ⇒ el texto EXACTO del API (también a fin de mes y más allá)", () => {
    expect(errorFechaAlGuardarAlta(base)).toBe(MSG_INVENTARIO_FECHA_FUTURA);
    expect(errorFechaAlGuardarAlta({ ...base, fecha: "2026-10-31" })).toBe(MSG_INVENTARIO_FECHA_FUTURA);
    // Oficina hasta +30 (más allá de fin de mes): el freno va ANTES de la confirmación.
    expect(errorFechaAlGuardarAlta({ ...base, fecha: "2026-11-15" })).toBe(MSG_INVENTARIO_FECHA_FUTURA);
  });

  it("NINGUNA otra categoría frena aunque el destino del alta general siga en «A Inventario/Tienda» (el caso de uso del lote)", () => {
    // `destinoRefaccionInicial({ conVueloPrefijado: false })` = INVENTARIO para
    // CUALQUIER categoría: una comida o un taxi por pagar mañana se guarda.
    expect(destinoRefaccionInicial({ conVueloPrefijado: false })).toBe("INVENTARIO");
    const otras = CATEGORIAS_CAPTURA.filter((c) => c !== "REFACCION");
    expect(otras.length).toBeGreaterThan(15);
    for (const categoria of otras) {
      expect(errorFechaAlGuardarAlta({ ...base, categoria }), categoria).toBeNull();
    }
    expect(errorFechaAlGuardarAlta({ ...base, categoria: "COMIDA" })).toBeNull();
  });

  it("REFACCION «Directo al avión» con fecha futura ⇒ se guarda (queda por pagar)", () => {
    expect(errorFechaAlGuardarAlta({ ...base, destino: "AVION" })).toBeNull();
  });

  it("con cargos del banco y fecha futura ⇒ el error de «Créalo por la suma», en cualquier categoría", () => {
    for (const categoria of ["OTRO", "COMIDA", "REFACCION"]) {
      // Con cargos el alta fuerza «Directo al avión».
      expect(errorFechaAlGuardarAlta({ ...base, conCargos: true, categoria, destino: "AVION" }), categoria).toBe(
        MSG_FECHA_FUTURA_CON_CARGOS,
      );
    }
    // Aun si el destino llegara INVENTARIO, el de los cargos va primero.
    expect(errorFechaAlGuardarAlta({ ...base, conCargos: true })).toBe(MSG_FECHA_FUTURA_CON_CARGOS);
  });

  it("hoy, antes, ilegible o SIN la capacidad (API previo) ⇒ nada frena, como antes", () => {
    for (const fecha of [HOY, "2026-10-01", "", null, undefined, "2026-02-30"]) {
      expect(errorFechaAlGuardarAlta({ ...base, fecha }), String(fecha)).toBeNull();
      expect(errorFechaAlGuardarAlta({ ...base, conCargos: true, fecha }), `cargos ${String(fecha)}`).toBeNull();
    }
    expect(errorFechaAlGuardarAlta({ ...base, capacidad: SIN_CAPACIDAD_POR_PAGAR })).toBeNull();
    expect(errorFechaAlGuardarAlta({ ...base, conCargos: true, capacidad: SIN_CAPACIDAD_POR_PAGAR })).toBeNull();
  });
});

describe("refacción por pagar SIN avión: la salida real (segunda revisión del lote, NUEVO-1)", () => {
  const HOY = "2026-10-20";
  const CON = { habilitado: true };
  const SIN = { habilitado: false };

  it("el texto propio del panel", () => {
    expect(NOTA_REFACCION_POR_PAGAR_SIN_AVION).toBe(
      "Si todavía no sabes a qué avión va, regístrala el día que la pagues (la fecha del gasto es la del pago).",
    );
  });

  it("«Directo al avión» sin avión y con fecha futura ⇒ ya no manda a «pásala a Inventario/Tienda» (ahí tampoco se guarda)", () => {
    const nota = notaDirectoAvionSinAvion({ fecha: "2026-10-21", capacidad: CON, hoy: HOY });
    expect(nota).toBe(`${NOTA_ELIGE_AVION_REFACCION} ${NOTA_REFACCION_POR_PAGAR_SIN_AVION}`);
    expect(nota).toBe(
      "Elige el avión al que se carga la refacción. Si todavía no sabes a qué avión va, regístrala el día que la pagues (la fecha del gasto es la del pago).",
    );
    expect(nota).not.toContain("pásala a Inventario/Tienda");
  });

  it("hoy, antes, ilegible o SIN la capacidad ⇒ el texto de siempre (Inventario/Tienda sí se guarda)", () => {
    for (const fecha of [HOY, "2026-10-01", "", null, undefined]) {
      expect(notaDirectoAvionSinAvion({ fecha, capacidad: CON, hoy: HOY }), String(fecha)).toBe(
        NOTA_DIRECTO_AVION_SIN_AVION,
      );
    }
    expect(notaDirectoAvionSinAvion({ fecha: "2026-10-21", capacidad: SIN, hoy: HOY })).toBe(
      NOTA_DIRECTO_AVION_SIN_AVION,
    );
    expect(NOTA_DIRECTO_AVION_SIN_AVION).toContain("pásala a Inventario/Tienda");
  });

  it("los dos avisos ya no se mandan uno al otro: el de Inventario manda al día del pago, el del avión también", () => {
    // El freno de Inventario (texto del API) dice «guárdala sin entrada a
    // Inventario/Tienda» = «Directo al avión»; sin avión, esa nota ya no
    // regresa a Inventario/Tienda sino al día del pago.
    expect(MSG_INVENTARIO_FECHA_FUTURA).toContain("guárdala sin entrada a Inventario/Tienda");
    const nota = notaDirectoAvionSinAvion({ fecha: "2026-10-25", capacidad: CON, hoy: HOY });
    expect(nota).toContain("regístrala el día que la pagues");
  });
});
