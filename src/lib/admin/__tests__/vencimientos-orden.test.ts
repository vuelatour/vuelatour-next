import { describe, expect, it } from "vitest";
import {
  ATAJOS_ORDEN_VENCIMIENTOS,
  ORDENES_VENCIMIENTOS,
  ORDEN_VENCIMIENTOS_DEFAULT,
  direccionDeColumna,
  ordenAlPulsarColumna,
  ordenVencimientosDeUrl,
  ordenarVencimientos,
  resolverOrdenVencimientos,
  type EleccionOrden,
  type VencimientoOrdenable,
} from "../vencimientos-orden";

/**
 * Orden de la tabla de Vencimientos (26-oct-2026). Pedido del cliente:
 * «ordenar los vencimientos por orden de fecha de vencimiento o de tiempo
 * restante». La lista de abajo imita su captura (hoy = 26-oct-2026): Seguro
 * vencido hace 391 d, Homologación hace 86 d, Bianual hace 76 d, Tarjeta hace
 * 74 d, Internación en 29 d, Seguro en 32 d, Batería ELT en 39 d, Internación
 * en 73 d; más un TBO que SOLO vence por horas y un documento permanente.
 */
const v = (
  id: string,
  nombre: string,
  extra: Partial<VencimientoOrdenable> = {},
): VencimientoOrdenable => ({
  id,
  vence_por: "FECHA",
  fecha_vencimiento: null,
  dias_restantes: null,
  horas_restantes: null,
  tipo: { nombre },
  objetivo: "XB-IJP",
  ...extra,
});

const LISTA: VencimientoOrdenable[] = [
  v("seg", "Seguro", { fecha_vencimiento: "2025-09-27", dias_restantes: -391 }),
  v("rui", "Homologacion de Ruido", {
    fecha_vencimiento: "2026-07-29",
    dias_restantes: -86,
    objetivo: "N621TX",
  }),
  v("bia", "Bianual", { fecha_vencimiento: "2026-08-08", dias_restantes: -76 }),
  v("tar", "Tarjeta de aeronavegabilidad", {
    fecha_vencimiento: "2026-08-10",
    dias_restantes: -74,
    objetivo: "XB-ANU",
  }),
  v("int", "Internacion", { fecha_vencimiento: "2026-11-21", dias_restantes: 29, objetivo: "N58BT" }),
  v("seg2", "Seguro", { fecha_vencimiento: "2026-11-24", dias_restantes: 32, objetivo: "XA-VGV" }),
  v("elt", "Bateria ELT", { fecha_vencimiento: "2026-12-01", dias_restantes: 39, objetivo: "XA-VGV" }),
  v("int2", "Internacion", { fecha_vencimiento: "2027-01-04", dias_restantes: 73, objetivo: "N990GG" }),
  v("tbo", "Overhaul (TBO)", { vence_por: "HORAS", horas_restantes: 120.5, objetivo: "MOTOR-1" }),
  v("per", "Certificado de matrícula", { vence_por: "PERMANENTE" }),
];

const ids = (xs: VencimientoOrdenable[]) => xs.map((x) => x.id);

describe("ordenarVencimientos · «Vence» (fecha calendario)", () => {
  it("default: la fecha más cercana arriba (los vencidos primero); sin fecha al final, A–Z por documento", () => {
    expect(ORDEN_VENCIMIENTOS_DEFAULT).toBe("vence");
    expect(ids(ordenarVencimientos(LISTA, "vence"))).toEqual([
      "seg", // 27 sep 2025 (hace 391 d)
      "rui", // 29 jul 2026
      "bia", // 08 ago 2026
      "tar", // 10 ago 2026
      "int", // 21 nov 2026
      "seg2", // 24 nov 2026
      "elt", // 01 dic 2026
      "int2", // 04 ene 2027
      "per", // sin fecha: «Certificado…» antes que «Overhaul…»
      "tbo",
    ]);
  });

  it("vence-desc: la fecha más lejana arriba; sin fecha al final también", () => {
    expect(ids(ordenarVencimientos(LISTA, "vence-desc"))).toEqual([
      "int2",
      "elt",
      "seg2",
      "int",
      "tar",
      "bia",
      "rui",
      "seg",
      "per",
      "tbo",
    ]);
  });

  it("un PERMANENTE con fecha guardada por error cuenta como sin fecha (como lo pinta la celda)", () => {
    const xs = [
      v("p", "Permiso", { vence_por: "PERMANENTE", fecha_vencimiento: "2020-01-01" }),
      v("s", "Seguro", { fecha_vencimiento: "2026-12-31", dias_restantes: 66 }),
    ];
    expect(ids(ordenarVencimientos(xs, "vence"))).toEqual(["s", "p"]);
    expect(ids(ordenarVencimientos(xs, "vence-desc"))).toEqual(["s", "p"]);
  });

  it("fecha vacía o inválida = sin fecha (al final), nunca revienta; un timestamp ISO se toma por su día", () => {
    const xs = [
      v("vacia", "A vacía", { fecha_vencimiento: "" }),
      v("rota", "B rota", { fecha_vencimiento: "no-es-fecha" }),
      v("ts", "C timestamp", { fecha_vencimiento: "2026-11-02T00:00:00+00:00" }),
      v("dia", "D día", { fecha_vencimiento: "2026-11-01" }),
    ];
    expect(ids(ordenarVencimientos(xs, "vence"))).toEqual(["dia", "ts", "vacia", "rota"]);
  });

  it("empates de fecha ⇒ documento A–Z (sin acentos ni mayúsculas), luego objetivo A–Z, luego id", () => {
    const xs = [
      v("2", "Seguro", { fecha_vencimiento: "2026-11-24", objetivo: "XB-IJP" }),
      v("1", "seguro", { fecha_vencimiento: "2026-11-24", objetivo: "XA-VGV" }),
      v("3", "Bianual", { fecha_vencimiento: "2026-11-24", objetivo: "XB-IJP" }),
      v("0", "Seguro", { fecha_vencimiento: "2026-11-24", objetivo: "XA-VGV" }),
    ];
    expect(ids(ordenarVencimientos(xs, "vence"))).toEqual(["3", "0", "1", "2"]);
    // En descendente los empates siguen A–Z.
    expect(ids(ordenarVencimientos(xs, "vence-desc"))).toEqual(["3", "0", "1", "2"]);
  });
});

describe("ordenarVencimientos · «Restante» (lo que dice la columna)", () => {
  it("restante: días ascendente (vencidos primero), luego los que SOLO tienen horas, luego sin dato", () => {
    expect(ids(ordenarVencimientos(LISTA, "restante"))).toEqual([
      "seg", // hace 391 d
      "rui", // hace 86 d
      "bia", // hace 76 d
      "tar", // hace 74 d
      "int", // 29 d
      "seg2", // 32 d
      "elt", // 39 d
      "int2", // 73 d
      "tbo", // 120.5 hrs (solo horas)
      "per", // sin dato
    ]);
  });

  it("restante-desc: más días arriba; horas después de los días en las DOS direcciones; sin dato al final", () => {
    expect(ids(ordenarVencimientos(LISTA, "restante-desc"))).toEqual([
      "int2",
      "elt",
      "seg2",
      "int",
      "tar",
      "bia",
      "rui",
      "seg",
      "tbo",
      "per",
    ]);
  });

  it("solo horas: entre ellos por horas (vencido ≤ 0 primero); un límite doble va por sus DÍAS", () => {
    const xs = [
      v("h300", "Overhaul", { vence_por: "HORAS", horas_restantes: 300 }),
      v("h2", "Overhaul", { vence_por: "HORAS", horas_restantes: 2, objetivo: "MOTOR-2" }),
      v("hv", "Overhaul", { vence_por: "HORAS", horas_restantes: -15.25, objetivo: "MOTOR-3" }),
      v("doble", "Overhaul", {
        vence_por: "HORAS",
        fecha_vencimiento: "2026-11-01",
        dias_restantes: 6,
        horas_restantes: 300,
        objetivo: "MOTOR-4",
      }),
      v("f", "Seguro", { fecha_vencimiento: "2026-10-30", dias_restantes: 4 }),
    ];
    expect(ids(ordenarVencimientos(xs, "restante"))).toEqual(["f", "doble", "hv", "h2", "h300"]);
    expect(ids(ordenarVencimientos(xs, "restante-desc"))).toEqual(["doble", "f", "h300", "h2", "hv"]);
    // En «Vence» el doble va por su fecha y los de solo horas al final (mismo documento ⇒ por objetivo: MOTOR-2, MOTOR-3, XB-IJP).
    expect(ids(ordenarVencimientos(xs, "vence"))).toEqual(["f", "doble", "h2", "hv", "h300"]);
  });

  it("días que llegan como texto numérico se comparan como número; '' y NaN son sin dato", () => {
    const xs = [
      v("a", "A", { dias_restantes: "10" }),
      v("b", "B", { dias_restantes: "9" }),
      v("c", "C", { dias_restantes: "" }),
      v("d", "D", { dias_restantes: "x" }),
    ];
    expect(ids(ordenarVencimientos(xs, "restante"))).toEqual(["b", "a", "c", "d"]);
  });
});

describe("ordenarVencimientos · reglas comunes", () => {
  it("no muta la lista de entrada", () => {
    const copia = [...LISTA];
    ordenarVencimientos(LISTA, "vence-desc");
    expect(LISTA).toEqual(copia);
  });

  it("todos los órdenes del catálogo son deterministas (misma salida con la entrada al revés)", () => {
    const alReves = [...LISTA].reverse();
    for (const o of ORDENES_VENCIMIENTOS) {
      expect(ids(ordenarVencimientos(alReves, o))).toEqual(ids(ordenarVencimientos(LISTA, o)));
    }
  });

  it("sin tipo ni objetivo (datos incompletos) ordena igual, sin reventar", () => {
    const xs = [
      { id: "b", fecha_vencimiento: "2026-11-02" },
      { id: "a", fecha_vencimiento: "2026-11-02", tipo: null, objetivo: null },
      { id: "c" },
    ];
    expect(ids(ordenarVencimientos(xs, "vence"))).toEqual(["a", "b", "c"]);
  });
});

describe("ordenVencimientosDeUrl", () => {
  it("valores del catálogo pasan tal cual", () => {
    for (const o of ORDENES_VENCIMIENTOS) expect(ordenVencimientosDeUrl(o)).toBe(o);
  });

  it("ausente, vacío o fuera de catálogo ⇒ «vence» (un enlace viejo nunca rompe la pantalla)", () => {
    expect(ordenVencimientosDeUrl(undefined)).toBe("vence");
    expect(ordenVencimientosDeUrl(null)).toBe("vence");
    expect(ordenVencimientosDeUrl("")).toBe("vence");
    expect(ordenVencimientosDeUrl("VENCE")).toBe("vence");
    expect(ordenVencimientosDeUrl("vence;drop")).toBe("vence");
    expect(ordenVencimientosDeUrl("se-acaban")).toBe("vence");
    expect(ordenVencimientosDeUrl("constructor")).toBe("vence");
  });

  it("parámetro repetido ⇒ toma el primero", () => {
    expect(ordenVencimientosDeUrl(["restante", "vence-desc"])).toBe("restante");
    expect(ordenVencimientosDeUrl([])).toBe("vence");
  });
});

describe("clic en encabezados", () => {
  it("primer clic: Vence y Restante arrancan ascendentes (lo urgente arriba)", () => {
    expect(ordenAlPulsarColumna("restante", "vence")).toBe("restante");
    expect(ordenAlPulsarColumna("vence", "restante")).toBe("vence");
    expect(ordenAlPulsarColumna("vence", "restante-desc")).toBe("vence");
  });

  it("segundo clic invierte, tercero regresa", () => {
    expect(ordenAlPulsarColumna("vence", "vence")).toBe("vence-desc");
    expect(ordenAlPulsarColumna("vence", "vence-desc")).toBe("vence");
    expect(ordenAlPulsarColumna("restante", "restante")).toBe("restante-desc");
    expect(ordenAlPulsarColumna("restante", "restante-desc")).toBe("restante");
  });

  it("direccionDeColumna: flecha solo en la columna que ordena", () => {
    expect(direccionDeColumna("vence", "vence")).toBe("asc");
    expect(direccionDeColumna("vence", "vence-desc")).toBe("desc");
    expect(direccionDeColumna("restante", "restante-desc")).toBe("desc");
    expect(direccionDeColumna("restante", "vence")).toBeNull();
    expect(direccionDeColumna("vence", "restante")).toBeNull();
  });

  it("atajos: «Primero lo que vence antes» (default) y «Primero lo que vence más tarde»", () => {
    expect(ATAJOS_ORDEN_VENCIMIENTOS.map((a) => a.valor)).toEqual(["vence", "vence-desc"]);
    expect(ATAJOS_ORDEN_VENCIMIENTOS.map((a) => a.etiqueta)).toEqual([
      "Primero lo que vence antes",
      "Primero lo que vence más tarde",
    ]);
    for (const a of ATAJOS_ORDEN_VENCIMIENTOS) expect(a.titulo.length).toBeGreaterThan(20);
  });
});

describe("resolverOrdenVencimientos · la URL viva manda", () => {
  it("sin elección pinta lo de la URL (volver del detalle con ?orden=vence-desc)", () => {
    expect(resolverOrdenVencimientos(null, "vence-desc")).toEqual({
      orden: "vence-desc",
      eleccion: null,
    });
  });

  it("clic: la elección gana al instante mientras la URL no se asienta (misma referencia)", () => {
    const e: EleccionOrden = { base: "vence", valor: "restante" };
    const r = resolverOrdenVencimientos(e, "vence");
    expect(r.orden).toBe("restante");
    expect(r.eleccion).toBe(e);
  });

  it("URL asentada ⇒ manda la URL y la elección caduca", () => {
    const e: EleccionOrden = { base: "vence", valor: "restante" };
    expect(resolverOrdenVencimientos(e, "restante")).toEqual({ orden: "restante", eleccion: null });
  });

  it("secuencia completa: la elección vieja NO resucita cuando la URL regresa a su base", () => {
    // vence → clic «más tarde» → URL asentada → menú lateral limpia ?orden=
    let eleccion: EleccionOrden | null = { base: "vence", valor: "vence-desc" };
    let r = resolverOrdenVencimientos(eleccion, "vence");
    expect(r.orden).toBe("vence-desc");
    r = resolverOrdenVencimientos(r.eleccion, "vence-desc");
    expect(r).toEqual({ orden: "vence-desc", eleccion: null });
    eleccion = r.eleccion;
    r = resolverOrdenVencimientos(eleccion, "vence");
    expect(r).toEqual({ orden: "vence", eleccion: null });
  });
});
