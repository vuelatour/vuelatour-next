/**
 * Stock por ubicación y traspasos (27-oct-2026, API 0.0.111, invariante 111
 * del API): la redacción PURA de la tablita «Stock y ubicaciones», las
 * opciones del selector de bodega del movimiento y los textos del traspaso.
 * Caso de la oficina: «de estos 200 aceites, 100 en Toledo, 5 en Mérida y 95
 * en la bodega de Córner».
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_STOCK_UBICACIONES,
  ERROR_DESTINO_IGUAL,
  ERROR_DESTINO_REQUERIDO,
  OPCION_BODEGA_PRINCIPAL,
  TIPO_TRASPASO,
  TITULO_STOCK_UBICACIONES,
  errorTraspaso,
  esTraspaso,
  etiquetaTraspaso,
  etiquetaTraspasoMovimiento,
  filasStockUbicacion,
  opcionesBodega,
  textoResumenStockUbicaciones,
  textoTraspasoRegistrado,
  totalStockUbicaciones,
} from "../inventario-ubicaciones-stock";
import type { InventarioUbicacion, StockUbicacion } from "@/types/inventory";

const CORNER = "loc-corner";
const TOLEDO = "loc-toledo";
const MERIDA = "loc-merida";
const STOCK: StockUbicacion[] = [
  { ubicacion_id: CORNER, nombre: "Bodega Corner", cantidad: 95, es_principal: true },
  { ubicacion_id: TOLEDO, nombre: "Locker Toledo", cantidad: 100, es_principal: false },
  { ubicacion_id: MERIDA, nombre: "Taller Merida", cantidad: 5, es_principal: false },
];
const u = (id: string, nombre: string, activo = true): InventarioUbicacion => ({
  id,
  nombre,
  orden: 1,
  activo,
  productos: 0,
  created_at: "2026-09-25T00:00:00Z",
  updated_at: "2026-09-25T00:00:00Z",
});
const CATALOGO = [u(CORNER, "Bodega Corner"), u(TOLEDO, "Locker Toledo"), u(MERIDA, "Taller Merida")];

describe("filasStockUbicacion / totalStockUbicaciones / textoResumenStockUbicaciones", () => {
  it("el ejemplo de la oficina: 200 aceites en 3 bodegas, con su % y la principal marcada", () => {
    const filas = filasStockUbicacion(STOCK);
    expect(filas).toEqual([
      { ubicacion_id: CORNER, nombre: "Bodega Corner", cantidad: 95, pct: 48, es_principal: true },
      { ubicacion_id: TOLEDO, nombre: "Locker Toledo", cantidad: 100, pct: 50, es_principal: false },
      { ubicacion_id: MERIDA, nombre: "Taller Merida", cantidad: 5, pct: 3, es_principal: false },
    ]);
    expect(totalStockUbicaciones(filas)).toBe(200);
    expect(textoResumenStockUbicaciones(filas, "cuarto (qt)")).toBe(
      "200 cuarto (qt) en 3 bodegas: Bodega Corner 95 · Locker Toledo 100 · Taller Merida 5",
    );
    expect(TITULO_STOCK_UBICACIONES).toBe("Stock y ubicaciones");
    expect(AYUDA_STOCK_UBICACIONES).toContain("Traspasar");
  });

  it("una bodega vacía se oculta salvo la principal; «Sin ubicación» y nombres faltantes; un negativo se ve", () => {
    const filas = filasStockUbicacion([
      { ubicacion_id: CORNER, nombre: "Bodega Corner", cantidad: 0, es_principal: true },
      { ubicacion_id: TOLEDO, nombre: "Locker Toledo", cantidad: 0, es_principal: false },
      { ubicacion_id: "x", nombre: null, cantidad: 2, es_principal: false },
      { ubicacion_id: null, nombre: null, cantidad: -1, es_principal: false },
    ]);
    expect(filas.map((f) => [f.nombre, f.cantidad, f.pct])).toEqual([
      ["Bodega Corner", 0, 0],
      ["Bodega sin nombre", 2, 200],
      ["Sin ubicación", -1, -100],
    ]);
    expect(totalStockUbicaciones(filas)).toBe(1);
    expect(filasStockUbicacion(null)).toEqual([]);
    expect(filasStockUbicacion([])).toEqual([]);
  });

  it("resumen: una sola bodega ⇒ «Todo (2 pieza) en …»; sin existencia ⇒ null; total 0 ⇒ pct null", () => {
    expect(
      textoResumenStockUbicaciones(
        filasStockUbicacion([
          { ubicacion_id: CORNER, nombre: "Bodega Corner", cantidad: 0, es_principal: true },
          { ubicacion_id: TOLEDO, nombre: "Locker Toledo", cantidad: 2, es_principal: false },
        ]),
        "pieza",
      ),
    ).toBe("Todo (2 pieza) en Locker Toledo");
    const vacias = filasStockUbicacion([
      { ubicacion_id: CORNER, nombre: "Bodega Corner", cantidad: 0, es_principal: true },
    ]);
    expect(vacias[0].pct).toBeNull();
    expect(textoResumenStockUbicaciones(vacias, "pieza")).toBeNull();
  });
});

describe("opcionesBodega (selector del movimiento)", () => {
  it("con la opción vacía = la principal; cada bodega dice cuánto tiene; inactivas fuera salvo la principal", () => {
    const ops = opcionesBodega({
      catalogo: [...CATALOGO, u("loc-x", "Oficina vieja", false)],
      stock: STOCK,
      principalId: CORNER,
      unidad: "cuarto (qt)",
      conPrincipal: true,
    });
    expect(ops).toEqual([
      {
        value: "",
        label: `${OPCION_BODEGA_PRINCIPAL} (Bodega Corner)`,
        description: "95 cuarto (qt) en existencia",
      },
      { value: CORNER, label: "Bodega Corner · principal", description: "95 cuarto (qt) en existencia" },
      { value: TOLEDO, label: "Locker Toledo", description: "100 cuarto (qt) en existencia" },
      { value: MERIDA, label: "Taller Merida", description: "5 cuarto (qt) en existencia" },
    ]);
    // Destino: sin la opción vacía (se elige una bodega real).
    expect(opcionesBodega({ catalogo: CATALOGO, stock: [], principalId: null, conPrincipal: false })).toEqual([
      { value: CORNER, label: "Bodega Corner", description: "sin existencia" },
      { value: TOLEDO, label: "Locker Toledo", description: "sin existencia" },
      { value: MERIDA, label: "Taller Merida", description: "sin existencia" },
    ]);
    // Sin principal: la opción vacía dice «Sin ubicación».
    expect(opcionesBodega({ catalogo: CATALOGO, stock: [], principalId: null, conPrincipal: true })[0].label).toBe(
      `${OPCION_BODEGA_PRINCIPAL} (Sin ubicación)`,
    );
    // La principal inactiva se sigue ofreciendo, marcada.
    const inactiva = opcionesBodega({
      catalogo: [u(CORNER, "Bodega Corner", false)],
      stock: [],
      principalId: CORNER,
      conPrincipal: false,
    });
    expect(inactiva[0].label).toBe("Bodega Corner · principal (inactiva)");
    expect(opcionesBodega({ catalogo: null, stock: null, principalId: null, conPrincipal: false })).toEqual([]);
  });
});

describe("traspaso: tipo, etiquetas, toast y validación", () => {
  it("textos", () => {
    expect(TIPO_TRASPASO.value).toBe("TRASPASO");
    expect(esTraspaso({ tipo: "TRASPASO" })).toBe(true);
    expect(esTraspaso({ tipo: "SALIDA" })).toBe(false);
    expect(esTraspaso(null)).toBe(false);
    expect(etiquetaTraspaso({ origen: "Bodega Corner", destino: "Locker Toledo" })).toBe(
      "Bodega Corner → Locker Toledo",
    );
    expect(etiquetaTraspaso({ origen: null, destino: null })).toBe("Ubicación principal → ¿?");
    expect(
      etiquetaTraspasoMovimiento({ ubicacion: null, ubicacion_destino: { nombre: "Locker Toledo" } }),
    ).toBe("Ubicación principal → Locker Toledo");
    expect(
      textoTraspasoRegistrado({ cantidad: 2, unidad: "pieza", origen: "Bodega Corner", destino: "Locker Toledo" }),
    ).toBe("Traspaso registrado: 2 pieza de Bodega Corner a Locker Toledo");
  });

  it("errorTraspaso: destino obligatorio y distinto al origen efectivo (el elegido o la principal)", () => {
    expect(errorTraspaso({ origenId: "", destinoId: "", principalId: CORNER })).toBe(ERROR_DESTINO_REQUERIDO);
    expect(errorTraspaso({ origenId: "", destinoId: CORNER, principalId: CORNER })).toBe(ERROR_DESTINO_IGUAL);
    expect(errorTraspaso({ origenId: TOLEDO, destinoId: TOLEDO, principalId: CORNER })).toBe(ERROR_DESTINO_IGUAL);
    expect(errorTraspaso({ origenId: "", destinoId: TOLEDO, principalId: CORNER })).toBeNull();
    expect(errorTraspaso({ origenId: TOLEDO, destinoId: CORNER, principalId: CORNER })).toBeNull();
    // Sin principal, el origen vacío es «Sin ubicación»: cualquier destino vale.
    expect(errorTraspaso({ origenId: "", destinoId: CORNER, principalId: null })).toBeNull();
  });
});
