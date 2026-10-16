/**
 * «Resolver →» del pre-cierre que marca en ámbar (PEDIDO 2, 15-oct-2026).
 * Pedido textual: «el botón de Resolver estaría genial que te marque bien lo
 * que se debe resolver en amarillo, para poder saber dónde atacar».
 * Congela: la cascada de ids, el orden de los params, los topes, la lectura
 * VALIDADA de la URL, el orden «resaltados primero», los textos byte a byte
 * de la franja y que la marca es LA MISMA de Conciliación / Facturas emitidas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLASE_FILA_ENFOCADA } from "@/lib/admin/conciliacion-vista";
import {
  ANCLA_PRE_CIERRE,
  CLASE_FILA_RESALTADA,
  ETIQUETA_QUITAR_RESALTADO,
  ETIQUETA_VOLVER_PRE_CIERRE,
  MAX_DETALLE_URL,
  MAX_TITULO_URL,
  NOTA_VISTA_MES,
  NOTA_VISTA_TACO_LIVE,
  PARAMS_FOCO_PRE_CIERRE,
  PREFIJO_FRANJA_PRE_CIERRE,
  RE_CLAVE_PRE_CIERRE,
  TITULO_FRANJA_GENERICO,
  TOPE_IDS_URL,
  anexarFocoPreCierre,
  claseFilaResaltada,
  conjuntoResaltado,
  filasResaltadasPrimero,
  focoDeItem,
  hrefQuitarResaltado,
  hrefResolverItem,
  hrefVolverPreCierre,
  idsDeItemPreCierre,
  leerFocoPreCierre,
  textoConteoResolver,
  type FocoPreCierre,
} from "@/lib/admin/pre-cierre-resolver";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c";
const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };

const foco = (over: Partial<FocoPreCierre> = {}): FocoPreCierre => ({
  clave: "gastos_sin_avion",
  ids: [],
  count: null,
  titulo: null,
  detalle: null,
  periodo: null,
  truncado: false,
  ...over,
});

describe("constantes y textos (congelados)", () => {
  it("los 6 params, los topes y la clave", () => {
    expect(PARAMS_FOCO_PRE_CIERRE).toEqual(["pc", "ids", "pcn", "pct", "pcd", "pcp"]);
    expect(TOPE_IDS_URL).toBe(100);
    expect(MAX_TITULO_URL).toBe(120);
    expect(MAX_DETALLE_URL).toBe(400);
    expect(ANCLA_PRE_CIERRE).toBe("pre-cierre");
    expect(RE_CLAVE_PRE_CIERRE.test("gastos_sin_avion")).toBe(true);
    expect(RE_CLAVE_PRE_CIERRE.test("Gastos")).toBe(false);
    expect(RE_CLAVE_PRE_CIERRE.test("ab")).toBe(false);
  });

  it("textos exactos", () => {
    expect(PREFIJO_FRANJA_PRE_CIERRE).toBe("Del pre-cierre:");
    expect(TITULO_FRANJA_GENERICO).toBe("Pendiente del pre-cierre");
    expect(ETIQUETA_VOLVER_PRE_CIERRE).toBe("Volver al pre-cierre →");
    expect(ETIQUETA_QUITAR_RESALTADO).toBe("Quitar resaltado");
    expect(NOTA_VISTA_TACO_LIVE).toBe(
      "Tacómetros en vivo muestra un día a la vez: aquí se resaltan los vuelos de este día; los de otros días se abren desde el pre-cierre (cada folio) o cambiando la fecha.",
    );
    expect(NOTA_VISTA_MES).toBe(
      "Esta pantalla muestra un mes completo; si el periodo del pre-cierre no es un mes, puede haber renglones de más o de menos.",
    );
  });

  it("una marca, una fuente: la de Conciliación y la literal de «Por facturar»", () => {
    expect(CLASE_FILA_RESALTADA).toBe(CLASE_FILA_ENFOCADA);
    expect(CLASE_FILA_RESALTADA).toBe("ring-2 ring-inset ring-amber-400 bg-amber-500/5");
    const pf = readFileSync(
      path.resolve(__dirname, "../../../components/admin/facturas-emitidas/por-facturar-table.tsx"),
      "utf8",
    );
    expect(pf).toContain(`"${CLASE_FILA_RESALTADA}"`);
  });
});

describe("idsDeItemPreCierre (cascada)", () => {
  it("ids > vuelos > cobros > ligas > grupos > sobres > socios", () => {
    const todo = {
      clave: "x_y_z",
      ids: [A],
      vuelos: [{ id: B }],
      cobros: [{ id: C }],
      ligas: [{ movimiento_id: uuid(1) }],
      grupos: [{ grupo_id: uuid(2) }],
      sobres: [{ grupo_id: uuid(3) }],
      socios: [{ socio: { id: uuid(4) } }],
    };
    expect(idsDeItemPreCierre(todo)).toEqual([A]);
    expect(idsDeItemPreCierre({ ...todo, ids: [] })).toEqual([B]);
    expect(idsDeItemPreCierre({ ...todo, ids: undefined, vuelos: [] })).toEqual([C]);
    expect(idsDeItemPreCierre({ ...todo, ids: [], vuelos: [], cobros: [] })).toEqual([uuid(1)]);
    expect(idsDeItemPreCierre({ ...todo, ids: [], vuelos: [], cobros: [], ligas: [] })).toEqual([uuid(2)]);
    expect(
      idsDeItemPreCierre({ ...todo, ids: [], vuelos: [], cobros: [], ligas: [], grupos: [] }),
    ).toEqual([uuid(3)]);
    expect(
      idsDeItemPreCierre({ ...todo, ids: [], vuelos: [], cobros: [], ligas: [], grupos: [], sobres: [] }),
    ).toEqual([uuid(4)]);
    expect(idsDeItemPreCierre({ clave: "x_y_z" })).toEqual([]);
  });

  it("uuid inválido fuera, minúsculas, sin repetidos, conserva el orden; socio como texto se tolera", () => {
    expect(
      idsDeItemPreCierre({ clave: "x_y_z", ids: [B.toUpperCase(), "no-es-uuid", 7, A, B, null] }),
    ).toEqual([B, A]);
    // Todos inválidos en `ids` ⇒ cae a la siguiente fuente.
    expect(idsDeItemPreCierre({ clave: "x_y_z", ids: ["basura"], vuelos: [{ id: C }] })).toEqual([C]);
    expect(idsDeItemPreCierre({ clave: "x_y_z", socios: [{ socio: "Hernán" }, { socio: { id: A } }] })).toEqual([A]);
    expect(idsDeItemPreCierre({ clave: "x_y_z", ids: "no-es-arreglo", vuelos: [{ id: A }] })).toEqual([A]);
  });
});

describe("anexarFocoPreCierre / hrefResolverItem", () => {
  it("orden fijo pc, pcn, pcp, pct, pcd, ids; respeta el `?` existente", () => {
    const f = focoDeItem(
      { clave: "gastos_sin_avion", titulo: "Gastos sin avión", detalle: "Asigna el avión.", count: 2, ids: [A, B] },
      PERIODO,
    );
    expect(anexarFocoPreCierre("/admin/expenses?f=pendientes&desde=2026-09-01&hasta=2026-09-30", f)).toBe(
      `/admin/expenses?f=pendientes&desde=2026-09-01&hasta=2026-09-30&pc=gastos_sin_avion&pcn=2&pcp=2026-09-01,2026-09-30&pct=Gastos%20sin%20avi%C3%B3n&pcd=Asigna%20el%20avi%C3%B3n.&ids=${A},${B}`,
    );
    expect(anexarFocoPreCierre("/admin/taco-live", { ...f, titulo: null, detalle: null })).toBe(
      `/admin/taco-live?pc=gastos_sin_avion&pcn=2&pcp=2026-09-01,2026-09-30&ids=${A},${B}`,
    );
  });

  it("el `#hash` queda al final", () => {
    const f = foco({ clave: "vuelos_cobrados_sin_factura", ids: [A], count: 1 });
    expect(anexarFocoPreCierre("/admin/facturas-emitidas#por-facturar", f)).toBe(
      `/admin/facturas-emitidas?pc=vuelos_cobrados_sin_factura&pcn=1&ids=${A}#por-facturar`,
    );
  });

  it("100 ids viajan; 101 no (solo el conteo) y el foco dice truncado", () => {
    const cien = Array.from({ length: 100 }, (_, i) => uuid(i + 1));
    const f100 = focoDeItem({ clave: "sin_conciliar", titulo: "t", detalle: "d", count: 100, ids: cien }, PERIODO);
    expect(f100.truncado).toBe(false);
    expect(anexarFocoPreCierre("/x", f100)).toContain(`&ids=${cien.join(",")}`);
    const f101 = focoDeItem(
      { clave: "sin_conciliar", titulo: "t", detalle: "d", count: 101, ids: [...cien, uuid(101)] },
      PERIODO,
    );
    expect(f101.truncado).toBe(true);
    const h = anexarFocoPreCierre("/x", f101);
    expect(h).toContain("pcn=101");
    expect(h).not.toContain("ids=");
  });

  it("recortes con «…» de título y detalle", () => {
    const largo = "a".repeat(500);
    const f = focoDeItem({ clave: "x_y_z", titulo: largo, detalle: largo, count: 1 }, PERIODO);
    expect(f.titulo).toHaveLength(MAX_TITULO_URL);
    expect(f.titulo?.endsWith("…")).toBe(true);
    expect(f.detalle).toHaveLength(MAX_DETALLE_URL);
    const h = anexarFocoPreCierre("/x", f);
    const sp = new URLSearchParams(h.slice(h.indexOf("?") + 1));
    expect(sp.get("pct")).toBe(`${"a".repeat(MAX_TITULO_URL - 1)}…`);
    expect(sp.get("pcd")).toBe(`${"a".repeat(MAX_DETALLE_URL - 1)}…`);
  });

  it("sin clave válida el href vuelve intacto", () => {
    expect(anexarFocoPreCierre("/admin/expenses", foco({ clave: "" }))).toBe("/admin/expenses");
    expect(anexarFocoPreCierre("/admin/expenses", focoDeItem({ clave: "MAL CLAVE", count: 1 }, PERIODO))).toBe(
      "/admin/expenses",
    );
  });

  it("hrefResolverItem: sin base ⇒ null; informativo ⇒ base intacto; si no, base + foco", () => {
    expect(hrefResolverItem({ clave: "gastos_tc_oficial", count: 3 }, PERIODO, undefined)).toBeNull();
    expect(hrefResolverItem({ clave: "gastos_tc_oficial", count: 3 }, PERIODO, null)).toBeNull();
    expect(
      hrefResolverItem({ clave: "movimientos_omitidos", informativo: true, count: 14, ids: [A] }, PERIODO, "/admin/conciliacion?f=omitidos"),
    ).toBe("/admin/conciliacion?f=omitidos");
    // Lectura fallida: no se sabe qué hay; la franja diría «0 por resolver».
    expect(
      hrefResolverItem({ clave: "seguimiento_cotizacion_pendiente", count: 0, lectura_fallida: true }, PERIODO, "/admin/flights"),
    ).toBe("/admin/flights");
    expect(hrefResolverItem({ clave: "cobros_pendientes", count: 1, vuelos: [{ id: A }] }, PERIODO, "/admin/flights")).toBe(
      `/admin/flights?pc=cobros_pendientes&pcn=1&pcp=2026-09-01,2026-09-30&ids=${A}`,
    );
  });
});

describe("leerFocoPreCierre (la URL de la pantalla destino)", () => {
  it("pc inválido o ausente ⇒ null (no hay foco)", () => {
    expect(leerFocoPreCierre({})).toBeNull();
    expect(leerFocoPreCierre(null)).toBeNull();
    expect(leerFocoPreCierre({ pc: "<script>" })).toBeNull();
    expect(leerFocoPreCierre({ pc: "Gastos_Sin_Avion" })).toBeNull();
  });

  it("ids basura filtrados, minúsculas, sin repetidos; arreglo ⇒ el primero", () => {
    const f = leerFocoPreCierre({
      pc: ["gastos_sin_avion", "otro_mas"],
      ids: `${A.toUpperCase()},basura,,${B},${A}`,
      pcn: "6",
      pct: "  Gastos sin avión  ",
      pcd: "",
      pcp: "2026-09-30,2026-09-01",
    });
    expect(f).toEqual({
      clave: "gastos_sin_avion",
      ids: [A, B],
      count: 6,
      titulo: "Gastos sin avión",
      detalle: null,
      // Invertido se corrige.
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      truncado: false,
    });
  });

  it("pcn no numérico ⇒ null; más ids que el tope se cortan; truncado = sin ids y count > 100", () => {
    expect(leerFocoPreCierre({ pc: "sin_conciliar", pcn: "6x" })?.count).toBeNull();
    expect(leerFocoPreCierre({ pc: "sin_conciliar", pcn: "-1" })?.count).toBeNull();
    const muchos = Array.from({ length: 150 }, (_, i) => uuid(i + 1)).join(",");
    expect(leerFocoPreCierre({ pc: "sin_conciliar", ids: muchos })?.ids).toHaveLength(TOPE_IDS_URL);
    expect(leerFocoPreCierre({ pc: "sin_conciliar", pcn: "250" })?.truncado).toBe(true);
    expect(leerFocoPreCierre({ pc: "sin_conciliar", pcn: "100" })?.truncado).toBe(false);
  });

  it("pcp inválido ⇒ null y «Volver» con el periodo default (mes en curso)", () => {
    const f = leerFocoPreCierre({ pc: "sin_conciliar", pcp: "2026-13-45,2026-09-30" });
    expect(f?.periodo).toBeNull();
    expect(hrefVolverPreCierre(f as FocoPreCierre, "2026-10-15")).toBe(
      "/admin/reportes?desde=2026-10-01&hasta=2026-10-15#pre-cierre",
    );
    const g = leerFocoPreCierre({ pc: "sin_conciliar", pcp: "2026-09-01,2026-09-30" });
    expect(hrefVolverPreCierre(g as FocoPreCierre, "2026-10-15")).toBe(
      "/admin/reportes?desde=2026-09-01&hasta=2026-09-30#pre-cierre",
    );
  });

  it("ida y vuelta: lo que arma la card es lo que lee la pantalla", () => {
    const f = focoDeItem({ clave: "gastos_sin_avion", titulo: "Gastos sin avión", detalle: "Asigna & revisa", count: 2, ids: [A, B] }, PERIODO);
    const h = anexarFocoPreCierre("/admin/expenses?f=pendientes", f);
    const sp = Object.fromEntries(new URLSearchParams(h.slice(h.indexOf("?") + 1)));
    expect(leerFocoPreCierre(sp)).toEqual({ ...f, truncado: false });
  });
});

describe("filasResaltadasPrimero / conjuntoResaltado / claseFilaResaltada", () => {
  const filas = [{ id: uuid(1) }, { id: A }, { id: uuid(2) }, { id: B }, { id: uuid(3) }];

  it("sin ids ⇒ el MISMO arreglo y 0", () => {
    const r = filasResaltadasPrimero(filas, [], (f) => f.id);
    expect(r.filas).toBe(filas);
    expect(r.encontrados).toBe(0);
  });

  it("ninguno en la vista ⇒ el MISMO arreglo y 0", () => {
    const r = filasResaltadasPrimero(filas, [C], (f) => f.id);
    expect(r.filas).toBe(filas);
    expect(r.encontrados).toBe(0);
  });

  it("los resaltados primero, en el orden de ids; los demás conservan su orden", () => {
    const r = filasResaltadasPrimero(filas, [B, C, A.toUpperCase()], (f) => f.id);
    expect(r.filas.map((f) => f.id)).toEqual([B, A, uuid(1), uuid(2), uuid(3)]);
    expect(r.encontrados).toBe(2);
  });

  it("conjunto en minúsculas y la clase de la fila", () => {
    const set = conjuntoResaltado(foco({ ids: [A.toUpperCase()] }));
    expect(set.has(A)).toBe(true);
    expect(claseFilaResaltada(set, A.toUpperCase())).toBe(CLASE_FILA_RESALTADA);
    expect(claseFilaResaltada(set, B)).toBeUndefined();
    expect(claseFilaResaltada(set, null)).toBeUndefined();
    expect(conjuntoResaltado(null).size).toBe(0);
    expect(conjuntoResaltado([B]).has(B)).toBe(true);
  });
});

describe("textoConteoResolver (byte a byte)", () => {
  it("sin lista o sin ids", () => {
    expect(textoConteoResolver(foco({ count: 6, ids: [A] }), null)).toBe("6 por resolver");
    expect(textoConteoResolver(foco({ count: 6 }), 3)).toBe("6 por resolver");
    expect(textoConteoResolver(foco({ count: 1 }), 0)).toBe("1 por resolver");
  });

  it("truncado", () => {
    expect(textoConteoResolver(foco({ count: 250, truncado: true }), 0)).toBe(
      "250 por resolver · son más de 100: no se resaltan uno por uno; revisa la lista con los filtros del periodo",
    );
  });

  it("todos, algunos, uno, ninguno", () => {
    const seis = Array.from({ length: 6 }, (_, i) => uuid(i + 1));
    expect(textoConteoResolver(foco({ count: 6, ids: seis }), 6)).toBe("6 por resolver · 6 en esta vista");
    expect(textoConteoResolver(foco({ count: 6, ids: seis }), 4)).toBe(
      "6 por resolver · 4 en esta vista · 2 ya no están en esta vista (quizá ya se resolvieron)",
    );
    expect(textoConteoResolver(foco({ count: 6, ids: seis }), 5)).toBe(
      "6 por resolver · 5 en esta vista · 1 ya no está en esta vista (quizá ya se resolvió)",
    );
    expect(textoConteoResolver(foco({ count: 1, ids: [A] }), 1)).toBe("1 por resolver · 1 en esta vista");
    expect(textoConteoResolver(foco({ count: 6, ids: seis }), 0)).toBe(
      "6 por resolver · ninguno está en esta vista (cambia los filtros, o quizá ya se resolvieron)",
    );
    // Sin `pcn` (count null): N = los ids que viajaron.
    expect(textoConteoResolver(foco({ ids: [A, B] }), 2)).toBe("2 por resolver · 2 en esta vista");
  });
});

describe("hrefQuitarResaltado", () => {
  it("quita los 6 params y conserva lo ajeno (arreglos incluidos)", () => {
    expect(
      hrefQuitarResaltado("/admin/conciliacion", {
        f: "pendientes",
        desde: "2026-09-01",
        mov: A,
        pc: "sin_conciliar",
        ids: B,
        pcn: "2",
        pct: "t",
        pcd: "d",
        pcp: "2026-09-01,2026-09-30",
        cuenta: [C, uuid(1)],
        vacio: undefined,
      }),
    ).toBe(`/admin/conciliacion?f=pendientes&desde=2026-09-01&mov=${A}&cuenta=${C}&cuenta=${uuid(1)}`);
    expect(hrefQuitarResaltado("/admin/taco-live", { pc: "tacos_en_revision" })).toBe("/admin/taco-live");
  });
});
