import { describe, expect, it } from "vitest";
import {
  ATAJOS_ORDEN_INVENTARIO,
  ORDENES_INVENTARIO,
  ORDEN_INVENTARIO_DEFAULT,
  direccionDeColumna,
  ordenAlPulsarColumna,
  ordenInventarioDeUrl,
  ordenarInventario,
  resolverOrdenInventario,
  type EleccionOrden,
  type ItemOrdenable,
} from "../inventario-orden";

/**
 * Orden de la tabla de Inventario (24-sep-2026). Pedido del cliente: «ver
 * primero las cosas que se van acabando». Los ítems de abajo imitan su
 * captura: 9 / 84 / 1 cuarto (qt) — el de 1 con chip «Bajo» —, 1 pieza,
 * 2 piezas.
 */
const it_ = (
  id: string,
  nombre: string,
  extra: Partial<ItemOrdenable> = {},
): ItemOrdenable => ({
  id,
  nombre,
  categoria: "Aceites",
  stock: 0,
  bajo_stock: false,
  ganancia_mxn: null,
  ...extra,
});

const BODEGA: ItemOrdenable[] = [
  it_("a", "Aceite 100 plus", { stock: 9, categoria: "Aceites", ganancia_mxn: 1200 }),
  it_("b", "Aceite 15W-50", { stock: 84, categoria: "Aceites", ganancia_mxn: -300 }),
  it_("c", "Aceite W80", { stock: 1, categoria: "Aceites", bajo_stock: true }),
  it_("d", "Filtro de aceite", { stock: 1, categoria: "Filtros", ganancia_mxn: 50 }),
  it_("e", "Bujía", { stock: 2, categoria: "Encendido", ganancia_mxn: 0 }),
];

const nombres = (xs: ItemOrdenable[]) => xs.map((x) => x.nombre);
const ids = (xs: ItemOrdenable[]) => xs.map((x) => x.id);

describe("ordenarInventario · «Se están acabando primero»", () => {
  it("bajo el mínimo primero, luego stock ascendente, empates alfabéticos", () => {
    expect(nombres(ordenarInventario(BODEGA, "se-acaban"))).toEqual([
      "Aceite W80", // Bajo (1 qt)
      "Filtro de aceite", // 1 pieza, sin mínimo
      "Bujía", // 2
      "Aceite 100 plus", // 9
      "Aceite 15W-50", // 84
    ]);
  });

  it("un «Bajo» con MÁS stock va antes que uno sin mínimo con menos", () => {
    const xs = [
      it_("x", "Sin mínimo", { stock: 0 }),
      it_("y", "Bajo con 5", { stock: 5, bajo_stock: true }),
      it_("z", "Bajo con 2", { stock: 2, bajo_stock: true }),
    ];
    expect(nombres(ordenarInventario(xs, "se-acaban"))).toEqual([
      "Bajo con 2",
      "Bajo con 5",
      "Sin mínimo",
    ]);
  });

  it("stock desconocido (null / undefined / NaN / '') va AL FINAL, aunque venga marcado bajo", () => {
    const xs = [
      it_("n1", "Zeta sin dato", { stock: null }),
      it_("n2", "Alfa sin dato", { stock: undefined, bajo_stock: true }),
      it_("n3", "Beta roto", { stock: "no-num" }),
      it_("n4", "Gama vacío", { stock: "" }),
      it_("k1", "Con 3", { stock: 3 }),
      it_("k2", "Con 0", { stock: 0 }),
    ];
    expect(nombres(ordenarInventario(xs, "se-acaban"))).toEqual([
      "Con 0",
      "Con 3",
      // desconocidos: entre ellos, alfabético
      "Alfa sin dato",
      "Beta roto",
      "Gama vacío",
      "Zeta sin dato",
    ]);
  });

  it("empate total de stock ⇒ A–Z (sin acentos ni mayúsculas), luego id", () => {
    const xs = [
      it_("2", "empaque", { stock: 4 }),
      it_("1", "Ébano", { stock: 4 }),
      it_("4", "Abrazadera", { stock: 4 }),
      it_("3", "Abrazadera", { stock: 4 }),
    ];
    expect(ids(ordenarInventario(xs, "se-acaban"))).toEqual(["3", "4", "1", "2"]);
  });

  it("stock que llega como texto numérico se compara como número", () => {
    const xs = [it_("a", "A", { stock: "10" }), it_("b", "B", { stock: "9" })];
    expect(nombres(ordenarInventario(xs, "se-acaban"))).toEqual(["B", "A"]);
  });
});

describe("ordenarInventario · columnas asc/desc", () => {
  it("nombre asc (default) y desc, con números naturales", () => {
    const xs = [
      it_("1", "Filtro 10"),
      it_("2", "filtro 9"),
      it_("3", "Ámbar"),
      it_("4", "bujía"),
    ];
    expect(nombres(ordenarInventario(xs, "nombre"))).toEqual([
      "Ámbar",
      "bujía",
      "filtro 9",
      "Filtro 10",
    ]);
    expect(nombres(ordenarInventario(xs, "nombre-desc"))).toEqual([
      "Filtro 10",
      "filtro 9",
      "bujía",
      "Ámbar",
    ]);
  });

  it("categoría asc/desc: empates SIEMPRE A–Z por producto; sin categoría al final", () => {
    const xs = [
      it_("1", "Zapata", { categoria: "Frenos" }),
      it_("2", "Balata", { categoria: "Frenos" }),
      it_("3", "Aceite", { categoria: "Aceites" }),
      it_("4", "Cinta", { categoria: "" }),
      it_("5", "Arandela", { categoria: null }),
    ];
    expect(nombres(ordenarInventario(xs, "categoria"))).toEqual([
      "Aceite",
      "Balata",
      "Zapata",
      "Arandela",
      "Cinta",
    ]);
    expect(nombres(ordenarInventario(xs, "categoria-desc"))).toEqual([
      "Balata",
      "Zapata",
      "Aceite",
      "Arandela",
      "Cinta",
    ]);
  });

  it("stock asc/desc: desconocido al final en las DOS direcciones, empates A–Z", () => {
    const xs = [
      it_("1", "Nulo", { stock: null }),
      it_("2", "Uno B", { stock: 1 }),
      it_("3", "Uno A", { stock: 1 }),
      it_("4", "Cien", { stock: 100 }),
      it_("5", "Cero", { stock: 0 }),
    ];
    expect(nombres(ordenarInventario(xs, "stock"))).toEqual([
      "Cero",
      "Uno A",
      "Uno B",
      "Cien",
      "Nulo",
    ]);
    expect(nombres(ordenarInventario(xs, "stock-desc"))).toEqual([
      "Cien",
      "Uno A",
      "Uno B",
      "Cero",
      "Nulo",
    ]);
  });

  it("stock asc NO pone los «Bajo» primero (eso es solo del atajo)", () => {
    expect(nombres(ordenarInventario(BODEGA, "stock"))).toEqual([
      "Aceite W80",
      "Filtro de aceite",
      "Bujía",
      "Aceite 100 plus",
      "Aceite 15W-50",
    ]);
    const xs = [it_("1", "Bajo 5", { stock: 5, bajo_stock: true }), it_("2", "Normal 1", { stock: 1 })];
    expect(nombres(ordenarInventario(xs, "stock"))).toEqual(["Normal 1", "Bajo 5"]);
  });

  it("utilidad asc/desc: pérdida < 0 < ganancia; nunca vendió (null) al final en ambas", () => {
    expect(nombres(ordenarInventario(BODEGA, "utilidad-desc"))).toEqual([
      "Aceite 100 plus", // +1200
      "Filtro de aceite", // +50
      "Bujía", // 0 (vendió a costo)
      "Aceite 15W-50", // −300
      "Aceite W80", // null
    ]);
    expect(nombres(ordenarInventario(BODEGA, "utilidad"))).toEqual([
      "Aceite 15W-50",
      "Bujía",
      "Filtro de aceite",
      "Aceite 100 plus",
      "Aceite W80",
    ]);
  });

  it("utilidad: pesos primero, luego SOLO dólares (no hay T.C. para compararlos), nulos al final", () => {
    // Caso real tras el re-precio del 25-sep: todo en USD (aceite 191.25,
    // llanta 186.88, cubre pitot 12.50) + un producto con utilidad en pesos.
    const xs = [
      it_("u1", "Aceite 15W-50", { utilidad_usd: 191.25, utilidad_mxn: null }),
      it_("u2", "Llanta 6.00-6", { utilidad_usd: 186.88, utilidad_mxn: null }),
      it_("u3", "Cubre pitot", { utilidad_usd: 12.5, utilidad_mxn: null }),
      it_("m1", "Bujía", { utilidad_mxn: 40, utilidad_usd: null }),
      it_("m2", "Cinta", { utilidad_mxn: 900 }),
      it_("n1", "Arandela", { utilidad_mxn: null, utilidad_usd: null }),
    ];
    expect(nombres(ordenarInventario(xs, "utilidad-desc"))).toEqual([
      "Cinta", // 900 MXN
      "Bujía", // 40 MXN
      "Aceite 15W-50", // 191.25 USD
      "Llanta 6.00-6",
      "Cubre pitot",
      "Arandela", // sin utilidad
    ]);
    expect(nombres(ordenarInventario(xs, "utilidad"))).toEqual([
      "Bujía",
      "Cinta",
      "Cubre pitot",
      "Llanta 6.00-6",
      "Aceite 15W-50",
      "Arandela",
    ]);
  });

  it("utilidad: con un API previo (solo `ganancia_mxn`) ordena igual que antes", () => {
    const xs = [
      it_("a", "A", { ganancia_mxn: 10 }),
      it_("b", "B", { ganancia_mxn: "30" }),
      it_("c", "C", { ganancia_mxn: null }),
    ];
    expect(nombres(ordenarInventario(xs, "utilidad-desc"))).toEqual(["B", "A", "C"]);
  });

  it("ubicación: catálogo por SU orden → texto anterior A–Z → sin ubicación al final", () => {
    const orden = new Map([
      ["vieja", 0],
      ["nueva", 1],
      ["locker", 2],
    ]);
    const xs = [
      it_("1", "Filtro", { ubicacion_id: "locker", ubicacion_nombre: "Locker del aeropuerto" }),
      it_("2", "Aceite", { ubicacion_id: null, ubicacion_legado: "Corner", ubicacion: "Corner" }),
      it_("3", "Balata", { ubicacion_id: "vieja", ubicacion_nombre: "Oficina vieja" }),
      it_("4", "Cámara", { ubicacion_id: null, ubicacion: null }),
      it_("5", "Llanta", { ubicacion_id: null, ubicacion_legado: "Bodega Cancún" }),
      it_("6", "Arandela", { ubicacion_id: "nueva", ubicacion_nombre: "Oficina nueva" }),
      it_("7", "Bujía", { ubicacion_id: "vieja", ubicacion_nombre: "Oficina vieja" }),
    ];
    expect(nombres(ordenarInventario(xs, "ubicacion", { ordenUbicacion: orden }))).toEqual([
      "Balata", // Oficina vieja (empate A–Z por producto)
      "Bujía",
      "Arandela", // Oficina nueva
      "Filtro", // Locker
      "Llanta", // «Bodega Cancún» (anterior)
      "Aceite", // «Corner» (anterior)
      "Cámara", // sin ubicación
    ]);
    expect(nombres(ordenarInventario(xs, "ubicacion-desc", { ordenUbicacion: orden }))).toEqual([
      "Aceite", // legados primero, Z–A
      "Llanta",
      "Filtro", // catálogo al revés
      "Arandela",
      "Balata", // empates SIEMPRE A–Z
      "Bujía",
      "Cámara", // sin ubicación al final también
    ]);
  });

  it("ubicación sin catálogo cargado (API previo): el texto A–Z, vacíos al final", () => {
    const xs = [
      it_("1", "Uno", { ubicacion: "Corner" }),
      it_("2", "Dos", { ubicacion: "Bodega Cancún" }),
      it_("3", "Tres", { ubicacion: "" }),
    ];
    expect(nombres(ordenarInventario(xs, "ubicacion"))).toEqual(["Dos", "Uno", "Tres"]);
  });

  it("no muta la lista de entrada", () => {
    const copia = [...BODEGA];
    ordenarInventario(BODEGA, "se-acaban");
    expect(BODEGA).toEqual(copia);
  });

  it("todos los órdenes del catálogo son deterministas (misma salida con la entrada al revés)", () => {
    const alReves = [...BODEGA].reverse();
    for (const o of ORDENES_INVENTARIO) {
      expect(ids(ordenarInventario(alReves, o))).toEqual(ids(ordenarInventario(BODEGA, o)));
    }
  });
});

describe("ordenInventarioDeUrl", () => {
  it("valores del catálogo pasan tal cual", () => {
    for (const o of ORDENES_INVENTARIO) expect(ordenInventarioDeUrl(o)).toBe(o);
  });

  it("ausente, vacío o fuera de catálogo ⇒ A–Z (enlace viejo nunca rompe la pantalla)", () => {
    expect(ordenInventarioDeUrl(undefined)).toBe("nombre");
    expect(ordenInventarioDeUrl(null)).toBe("nombre");
    expect(ordenInventarioDeUrl("")).toBe("nombre");
    expect(ordenInventarioDeUrl("STOCK")).toBe("nombre");
    expect(ordenInventarioDeUrl("stock;drop")).toBe("nombre");
    expect(ORDEN_INVENTARIO_DEFAULT).toBe("nombre");
  });

  it("ALIAS: el `?orden=ganancia` de siempre sigue funcionando como Utilidad", () => {
    expect(ordenInventarioDeUrl("ganancia")).toBe("utilidad");
    expect(ordenInventarioDeUrl("ganancia-desc")).toBe("utilidad-desc");
    expect(ordenInventarioDeUrl(["ganancia-desc"])).toBe("utilidad-desc");
    // Ni «constructor» ni otras llaves del prototipo se cuelan como alias.
    expect(ordenInventarioDeUrl("constructor")).toBe("nombre");
  });

  it("parámetro repetido ⇒ toma el primero", () => {
    expect(ordenInventarioDeUrl(["se-acaban", "stock"])).toBe("se-acaban");
    expect(ordenInventarioDeUrl([])).toBe("nombre");
  });
});

describe("clic en encabezados", () => {
  it("primer clic: nombre/categoría/stock/ubicación ascendente; utilidad descendente", () => {
    expect(ordenAlPulsarColumna("categoria", "nombre")).toBe("categoria");
    expect(ordenAlPulsarColumna("stock", "nombre")).toBe("stock");
    expect(ordenAlPulsarColumna("utilidad", "nombre")).toBe("utilidad-desc");
    expect(ordenAlPulsarColumna("ubicacion", "nombre")).toBe("ubicacion");
    expect(ordenAlPulsarColumna("nombre", "stock")).toBe("nombre");
  });

  it("segundo clic invierte, tercero regresa", () => {
    expect(ordenAlPulsarColumna("nombre", "nombre")).toBe("nombre-desc");
    expect(ordenAlPulsarColumna("nombre", "nombre-desc")).toBe("nombre");
    expect(ordenAlPulsarColumna("stock", "stock")).toBe("stock-desc");
    expect(ordenAlPulsarColumna("stock", "stock-desc")).toBe("stock");
    expect(ordenAlPulsarColumna("utilidad", "utilidad-desc")).toBe("utilidad");
    expect(ordenAlPulsarColumna("utilidad", "utilidad")).toBe("utilidad-desc");
    expect(ordenAlPulsarColumna("ubicacion", "ubicacion")).toBe("ubicacion-desc");
  });

  it("desde el atajo «Se están acabando», Stock arranca ascendente", () => {
    expect(ordenAlPulsarColumna("stock", "se-acaban")).toBe("stock");
  });

  it("direccionDeColumna: flecha solo en la columna que ordena", () => {
    expect(direccionDeColumna("nombre", "nombre")).toBe("asc");
    expect(direccionDeColumna("nombre", "nombre-desc")).toBe("desc");
    expect(direccionDeColumna("stock", "stock-desc")).toBe("desc");
    expect(direccionDeColumna("categoria", "stock")).toBeNull();
    // El atajo no se disfraza de «Stock ↑»: es otro criterio (Bajo primero).
    expect(direccionDeColumna("stock", "se-acaban")).toBeNull();
  });

  it("atajos: A–Z, Se están acabando primero, Más stock — todos del catálogo", () => {
    expect(ATAJOS_ORDEN_INVENTARIO.map((a) => a.valor)).toEqual([
      "nombre",
      "se-acaban",
      "stock-desc",
    ]);
    expect(ATAJOS_ORDEN_INVENTARIO.map((a) => a.etiqueta)).toEqual([
      "A–Z",
      "Se están acabando primero",
      "Más stock",
    ]);
  });
});

describe("resolverOrdenInventario · la URL viva manda", () => {
  it("sin elección pinta lo de la URL (volver del detalle con la URL ?orden=se-acaban)", () => {
    expect(resolverOrdenInventario(null, "se-acaban")).toEqual({
      orden: "se-acaban",
      eleccion: null,
    });
  });

  it("clic: la elección gana al instante mientras la URL no se asienta (misma referencia)", () => {
    const e: EleccionOrden = { base: "nombre", valor: "se-acaban" };
    const r = resolverOrdenInventario(e, "nombre");
    expect(r.orden).toBe("se-acaban");
    expect(r.eleccion).toBe(e); // mismo objeto ⇒ el componente no re-guarda estado
  });

  it("URL asentada ⇒ manda la URL y la elección caduca", () => {
    const e: EleccionOrden = { base: "nombre", valor: "se-acaban" };
    expect(resolverOrdenInventario(e, "se-acaban")).toEqual({
      orden: "se-acaban",
      eleccion: null,
    });
  });

  it("secuencia completa: la elección vieja NO resucita cuando la URL regresa a su base", () => {
    // A–Z → clic «Se están acabando» → URL asentada → menú lateral limpia ?orden=
    let eleccion: EleccionOrden | null = { base: "nombre", valor: "se-acaban" };
    let r = resolverOrdenInventario(eleccion, "nombre"); // pendiente
    expect(r.orden).toBe("se-acaban");
    eleccion = r.eleccion;
    r = resolverOrdenInventario(eleccion, "se-acaban"); // asentada
    expect(r.orden).toBe("se-acaban");
    eleccion = r.eleccion;
    expect(eleccion).toBeNull();
    r = resolverOrdenInventario(eleccion, "nombre"); // URL limpia otra vez
    expect(r.orden).toBe("nombre");
  });

  it("URL cambiada por fuera mientras había elección pendiente ⇒ manda la URL", () => {
    const e: EleccionOrden = { base: "nombre", valor: "stock" };
    expect(resolverOrdenInventario(e, "utilidad-desc")).toEqual({
      orden: "utilidad-desc",
      eleccion: null,
    });
  });
});
