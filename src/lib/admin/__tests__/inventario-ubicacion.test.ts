import { describe, expect, it } from "vitest";
import {
  FILTRO_SIN_UBICACION,
  errorNombreUbicacion,
  filtrarPorUbicacion,
  filtroUbicacionDeUrl,
  intercambioOrden,
  mapaOrdenUbicacion,
  normalizarNombreUbicacion,
  notaUbicacionAnterior,
  opcionesFiltroUbicacion,
  ordenarCatalogo,
  particionMover,
  resolverFiltroUbicacion,
  textoBotonMover,
  textoConfirmarMover,
  textoNadaQueMover,
  textoResultadoMover,
  textoUbicacion,
  tituloNoDesactivable,
  ubicacionesActivas,
  type EleccionFiltroUbicacion,
} from "../inventario-ubicacion";
import type { InventarioUbicacion } from "@/types/inventory";

/**
 * Ubicaciones de bodega (25-sep-2026). El catálogo sembrado es el del
 * cliente, en su orden; los 72 productos de prod arrancan con texto LEGADO
 * («Bodega Cancún» ×69, «Corner», «Bodega Córner») y NO se adivina su mapeo.
 */
const u = (id: string, nombre: string, orden: number, extra: Partial<InventarioUbicacion> = {}) => ({
  id,
  nombre,
  orden,
  activo: true,
  productos: 0,
  created_at: "2026-09-25T12:00:00Z",
  updated_at: "2026-09-25T12:00:00Z",
  ...extra,
});

const CATALOGO: InventarioUbicacion[] = [
  u("c5", "Bodega del taller de Cozumel", 5),
  u("c1", "Oficina vieja", 1),
  u("c3", "Locker del aeropuerto", 3),
  u("c2", "Oficina nueva", 2),
  u("c4", "Bodega del taller de Mérida", 4),
];

describe("textoUbicacion · qué se pinta", () => {
  it("catálogo ⇒ su nombre", () => {
    expect(
      textoUbicacion({ ubicacion: "Oficina nueva", ubicacion_id: "c2", ubicacion_nombre: "Oficina nueva", ubicacion_legado: null }),
    ).toEqual({ texto: "Oficina nueva", tipo: "CATALOGO" });
  });

  it("legado ⇒ el texto viejo (se pinta «(anterior)»); NUNCA se adivina el catálogo", () => {
    expect(
      textoUbicacion({ ubicacion: "Bodega Cancún", ubicacion_id: null, ubicacion_nombre: null, ubicacion_legado: "Bodega Cancún" }),
    ).toEqual({ texto: "Bodega Cancún", tipo: "LEGADO" });
    expect(textoUbicacion({ ubicacion: "Corner", ubicacion_id: null })).toEqual({
      texto: "Corner",
      tipo: "LEGADO",
    });
  });

  it("sin nada ⇒ «Sin ubicación»", () => {
    expect(textoUbicacion({ ubicacion: null, ubicacion_id: null, ubicacion_legado: null })).toEqual({
      texto: "Sin ubicación",
      tipo: "VACIA",
    });
  });

  it("SKEW: sin la llave `ubicacion_id` (API previo) ⇒ el texto tal cual, sin ámbar", () => {
    expect(textoUbicacion({ ubicacion: "Bodega Cancún" })).toEqual({ texto: "Bodega Cancún", tipo: "TEXTO" });
    expect(textoUbicacion({ ubicacion: "  " })).toEqual({ texto: "Sin ubicación", tipo: "VACIA" });
  });

  it("nota ámbar del formulario", () => {
    expect(notaUbicacionAnterior("Bodega Cancún")).toBe(
      "Ubicación anterior: «Bodega Cancún». Elige la ubicación nueva.",
    );
  });
});

describe("catálogo · orden de la oficina", () => {
  it("por `orden` y luego nombre; activas; mapa de posiciones", () => {
    expect(ordenarCatalogo(CATALOGO).map((x) => x.nombre)).toEqual([
      "Oficina vieja",
      "Oficina nueva",
      "Locker del aeropuerto",
      "Bodega del taller de Mérida",
      "Bodega del taller de Cozumel",
    ]);
    const conInactiva = [...CATALOGO, u("c6", "Corner viejo", 0, { activo: false })];
    expect(ubicacionesActivas(conInactiva).map((x) => x.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(mapaOrdenUbicacion(CATALOGO).get("c3")).toBe(2);
  });
});

describe("filtro por ubicación", () => {
  const ITEMS = [
    { id: "a", ubicacion: "Bodega Cancún", ubicacion_id: null, ubicacion_legado: "Bodega Cancún" },
    { id: "b", ubicacion: "Corner", ubicacion_id: null, ubicacion_legado: "Corner" },
    { id: "c", ubicacion: "Oficina nueva", ubicacion_id: "c2" },
    { id: "d", ubicacion: "Oficina nueva", ubicacion_id: "c2" },
    { id: "e", ubicacion: null, ubicacion_id: null },
  ];

  it("URL: `sin`, un uuid del catálogo o nada (enlace viejo ⇒ Todas)", () => {
    expect(filtroUbicacionDeUrl("sin", CATALOGO)).toBe(FILTRO_SIN_UBICACION);
    expect(filtroUbicacionDeUrl("c2", CATALOGO)).toBe("c2");
    expect(filtroUbicacionDeUrl("no-existe", CATALOGO)).toBeNull();
    expect(filtroUbicacionDeUrl(undefined, CATALOGO)).toBeNull();
    expect(filtroUbicacionDeUrl(["c1", "c2"], CATALOGO)).toBe("c1");
  });

  it("«Sin ubicación nueva» = legados + vacíos; una ubicación = sus productos; Todas = la MISMA lista", () => {
    expect(filtrarPorUbicacion(ITEMS, "sin").map((x) => x.id)).toEqual(["a", "b", "e"]);
    expect(filtrarPorUbicacion(ITEMS, "c2").map((x) => x.id)).toEqual(["c", "d"]);
    expect(filtrarPorUbicacion(ITEMS, null)).toBe(ITEMS);
  });

  it("un ítem de un API previo (sin la llave) NO es «sin ubicación nueva»", () => {
    expect(filtrarPorUbicacion([{ ubicacion: "Bodega Cancún" }], "sin")).toEqual([]);
  });

  it("opciones con conteo: «Sin ubicación nueva» primero y el catálogo en su orden", () => {
    const ops = opcionesFiltroUbicacion(ITEMS, CATALOGO);
    expect(ops.map((o) => `${o.etiqueta} (${o.conteo})`)).toEqual([
      "Sin ubicación nueva (3)",
      "Oficina vieja (0)",
      "Oficina nueva (2)",
      "Locker del aeropuerto (0)",
      "Bodega del taller de Mérida (0)",
      "Bodega del taller de Cozumel (0)",
    ]);
  });

  it("la elección del select caduca cuando la URL cambia (mismo contrato que el orden)", () => {
    const e: EleccionFiltroUbicacion = { base: null, valor: "sin" };
    expect(resolverFiltroUbicacion(e, null)).toEqual({ filtro: "sin", eleccion: e });
    expect(resolverFiltroUbicacion(e, "sin")).toEqual({ filtro: "sin", eleccion: null });
    expect(resolverFiltroUbicacion(null, "c2")).toEqual({ filtro: "c2", eleccion: null });
  });
});

describe("«Mover a…»", () => {
  it("confirmación con conteo, muestra y «y N más»", () => {
    const nombres = [
      "Aceite 15W-50",
      "Balata 66-105",
      "Cámara 6.00-6",
      "Cubre pitot",
      "Filtro CH48108",
      "Filtro CH48110",
      "Llanta 6.00-6",
    ];
    expect(textoConfirmarMover(12, "Oficina nueva", nombres)).toBe(
      "Se moverán 12 productos a «Oficina nueva»: Aceite 15W-50, Balata 66-105, Cámara 6.00-6, Cubre pitot, Filtro CH48108 y 7 más. No mueve stock ni dinero.",
    );
    expect(textoConfirmarMover(1, "Locker del aeropuerto", ["Cubre pitot"])).toBe(
      "Se moverá 1 producto a «Locker del aeropuerto»: Cubre pitot. No mueve stock ni dinero.",
    );
    expect(textoBotonMover(12)).toBe("Mover 12 productos");
    expect(textoBotonMover(1)).toBe("Mover 1 producto");
  });

  it("los que YA están en el destino no cuentan como «se moverán» (revisión 25-sep)", () => {
    const vista = [
      { id: "a", nombre: "Aceite 15W-50", ubicacion_id: null },
      { id: "b", nombre: "Balata 66-105", ubicacion_id: "c2" },
      { id: "c", nombre: "Cinta", ubicacion_id: "c1" },
      { id: "d", nombre: "Cubre pitot", ubicacion_id: "c2" },
    ];
    const { porMover, yaAhi } = particionMover(vista, "c2");
    expect(porMover.map((p) => p.id)).toEqual(["a", "c"]);
    expect(yaAhi).toBe(2);
    expect(
      textoConfirmarMover(porMover.length, "Oficina nueva", porMover.map((p) => p.nombre), yaAhi),
    ).toBe(
      "Se moverán 2 productos a «Oficina nueva»: Aceite 15W-50, Cinta (2 ya están ahí). No mueve stock ni dinero.",
    );
    expect(textoConfirmarMover(1, "Oficina nueva", ["Cinta"], 1)).toBe(
      "Se moverá 1 producto a «Oficina nueva»: Cinta (1 ya está ahí). No mueve stock ni dinero.",
    );
    // Sin destino elegido todavía: todos cuentan, nada «ya está ahí».
    expect(particionMover(vista, null)).toEqual({ porMover: vista, yaAhi: 0 });
    // Todos ya están: se dice, no se promete mover nada.
    const todos = particionMover([vista[1], vista[3]], "c2");
    expect(todos).toEqual({ porMover: [], yaAhi: 2 });
    expect(textoNadaQueMover(2, "Oficina nueva")).toBe(
      "Los 2 productos ya están en «Oficina nueva»: no hay nada que mover.",
    );
    expect(textoNadaQueMover(1, "Oficina nueva")).toBe(
      "El producto ya está en «Oficina nueva»: no hay nada que mover.",
    );
  });

  it("resultado: movidos + lo que no cambió, nada se esconde", () => {
    expect(
      textoResultadoMover({
        movidos: 12,
        sin_cambio: 1,
        no_encontrados: [],
        inactivos: [],
        ubicacion: { id: "c2", nombre: "Oficina nueva" },
      }),
    ).toEqual({ titulo: "12 productos ahora están en «Oficina nueva».", detalle: "1 ya estaba ahí." });
    expect(
      textoResultadoMover({
        movidos: 1,
        sin_cambio: 0,
        no_encontrados: ["x"],
        inactivos: ["y"],
        ubicacion: { id: "c3", nombre: "Locker del aeropuerto" },
      }),
    ).toEqual({
      titulo: "1 producto ahora está en «Locker del aeropuerto».",
      detalle: "2 no se movieron porque ya no están activos.",
    });
    expect(
      textoResultadoMover({
        movidos: 0,
        sin_cambio: 3,
        no_encontrados: [],
        inactivos: [],
        ubicacion: { id: "c3", nombre: "Locker del aeropuerto" },
      }),
    ).toEqual({ titulo: "Ningún producto cambió de ubicación.", detalle: "3 ya estaban ahí." });
  });
});

describe("diálogo «Ubicaciones»", () => {
  it("nombres: sin acentos ni mayúsculas para detectar duplicados (Mérida = MERIDA)", () => {
    expect(normalizarNombreUbicacion("  Bodega del taller de  MÉRIDA ")).toBe(
      "bodega del taller de merida",
    );
    expect(errorNombreUbicacion("bodega del taller de merida", CATALOGO)).toBe(
      "Ya existe la ubicación «Bodega del taller de Mérida».",
    );
    // Renombrar la PROPIA fila con otra capitalización no es duplicado.
    expect(errorNombreUbicacion("OFICINA VIEJA", CATALOGO, "c1")).toBeNull();
    expect(errorNombreUbicacion("X", CATALOGO)).toBe("Escribe al menos 2 letras.");
    expect(errorNombreUbicacion("a".repeat(51), CATALOGO)).toBe("Máximo 50 caracteres.");
    expect(errorNombreUbicacion("Hangar Cancún", CATALOGO)).toBeNull();
  });

  it("subir/bajar = dos PATCH que intercambian el orden; extremos ⇒ null", () => {
    expect(intercambioOrden(CATALOGO, "c3", "arriba")).toEqual([
      { id: "c3", orden: 2 },
      { id: "c2", orden: 3 },
    ]);
    expect(intercambioOrden(CATALOGO, "c3", "abajo")).toEqual([
      { id: "c3", orden: 4 },
      { id: "c4", orden: 3 },
    ]);
    expect(intercambioOrden(CATALOGO, "c1", "arriba")).toBeNull();
    expect(intercambioOrden(CATALOGO, "c5", "abajo")).toBeNull();
    // Mismo orden (datos viejos): se separan para que el cambio se note.
    const empatados = [u("a", "A", 0), u("b", "B", 0)];
    expect(intercambioOrden(empatados, "b", "arriba")).toEqual([
      { id: "b", orden: 0 },
      { id: "a", orden: 1 },
    ]);
  });

  it("desactivar con productos: el tooltip dice qué hacer", () => {
    expect(tituloNoDesactivable(3)).toBe("Mueve primero sus 3 productos a otra ubicación");
    expect(tituloNoDesactivable(1)).toBe("Mueve primero su producto a otra ubicación");
  });
});
