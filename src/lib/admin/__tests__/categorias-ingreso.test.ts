import { describe, expect, it } from "vitest";
import * as mod from "@/lib/admin/categorias-ingreso";
import {
  CATEGORIAS_INGRESO,
  CATEGORIAS_INGRESO_RESULTADO,
  CATEGORIA_INGRESO_AYUDA,
  CATEGORIA_INGRESO_DESTINO,
  CATEGORIA_INGRESO_LABEL,
  DESTINO_INGRESO_RESULTADO,
  categoriaIngresoAdmiteVuelo,
  categoriaIngresoExigeCliente,
  categoriaIngresoSumaAResultados,
  esAnticipo,
  etiquetaCategoriaIngreso,
  etiquetaIngreso,
} from "@/lib/admin/categorias-ingreso";

/**
 * Categorías de INGRESO (24-sep-2026): la tabla es LITERAL del contrato
 * INGRESOS §2 y es la MISMA que congela el spec del API
 * (`common/categoria-ingreso.util.spec.ts`). Si un texto cambia en un solo
 * lado, este test falla: el selector diría una cosa y los reportes otra.
 */

const TABLA = [
  {
    codigo: "OTRO_INGRESO",
    etiqueta: "Otros ingresos",
    destino: "Otros ingresos (Balance general VuelaTour y Libro Dinero)",
    resultado: true,
    cliente: false,
    vuelo: false,
    ayuda:
      "Dinero que entra y no es de un vuelo ni de otra categoría. Si es el pago de un vuelo, regístralo como cobro en el vuelo.",
  },
  {
    codigo: "ANTICIPO_CLIENTE",
    etiqueta: "Anticipos y depósitos de clientes",
    destino: "Fuera de resultados hasta aplicarse a un vuelo (ahí cuenta como cobro del vuelo)",
    resultado: false,
    cliente: true,
    vuelo: false,
    ayuda:
      "El cliente pagó y su vuelo todavía no existe. Si el vuelo ya existe, registra el cobro en el vuelo.",
  },
  {
    codigo: "INGRESO_BANCARIO",
    etiqueta: "Ingresos en cuentas de banco",
    destino: "Otros ingresos (Balance general VuelaTour y Libro Dinero)",
    resultado: true,
    cliente: false,
    vuelo: false,
    ayuda: "Intereses, rendimientos y bonificaciones del banco.",
  },
  {
    codigo: "REEMBOLSO_DEVOLUCION",
    etiqueta: "Reembolsos y devoluciones recibidos",
    destino: "Otros ingresos (Balance general VuelaTour y Libro Dinero)",
    resultado: true,
    cliente: false,
    vuelo: true,
    ayuda:
      "Dinero que nos regresan: aseguradoras, gastos médicos, devoluciones de proveedores. (Si tú le devuelves dinero a un cliente, eso es un reembolso en el vuelo, no un ingreso.)",
  },
  {
    codigo: "VENTA_ACTIVO",
    etiqueta: "Venta de refacciones o activos a terceros",
    destino: "Otros ingresos (Balance general VuelaTour y Libro Dinero)",
    resultado: true,
    cliente: false,
    vuelo: false,
    ayuda:
      "Venta de piezas, equipo o activos a alguien de fuera. Si la pieza sale de bodega, registra también la salida en Inventario.",
  },
  {
    codigo: "APORTACION_PRESTAMO",
    etiqueta: "Aportaciones de socios y préstamos",
    destino: "Fuera de resultados (no es venta: es capital o deuda)",
    resultado: false,
    cliente: false,
    vuelo: false,
    ayuda: "Dinero que ponen los socios o un préstamo recibido.",
  },
] as const;

describe("categorías de ingreso · tabla canónica (§2)", () => {
  it("códigos en el ORDEN de los selectores", () => {
    expect([...CATEGORIAS_INGRESO]).toEqual(TABLA.map((t) => t.codigo));
  });

  it.each(TABLA)("$codigo: etiqueta, destino, ayuda y reglas", (t) => {
    expect(CATEGORIA_INGRESO_LABEL[t.codigo]).toBe(t.etiqueta);
    expect(CATEGORIA_INGRESO_DESTINO[t.codigo]).toBe(t.destino);
    expect(CATEGORIA_INGRESO_AYUDA[t.codigo]).toBe(t.ayuda);
    expect(categoriaIngresoSumaAResultados(t.codigo)).toBe(t.resultado);
    expect(categoriaIngresoExigeCliente(t.codigo)).toBe(t.cliente);
    expect(categoriaIngresoAdmiteVuelo(t.codigo)).toBe(t.vuelo);
    expect(esAnticipo(t.codigo)).toBe(t.codigo === "ANTICIPO_CLIENTE");
    expect(etiquetaCategoriaIngreso(t.codigo)).toBe(t.etiqueta);
  });

  it("membresía EXACTA de las categorías de resultado (derivada del destino)", () => {
    expect([...CATEGORIAS_INGRESO_RESULTADO].sort()).toEqual(
      ["INGRESO_BANCARIO", "OTRO_INGRESO", "REEMBOLSO_DEVOLUCION", "VENTA_ACTIVO"].sort(),
    );
    expect(DESTINO_INGRESO_RESULTADO).toBe("Otros ingresos (Balance general VuelaTour y Libro Dinero)");
  });

  it("ningún texto dice «Otros ingresos VuelaTour» (es el bloque de TUAs/extras del reparto)", () => {
    for (const c of CATEGORIAS_INGRESO) {
      expect(CATEGORIA_INGRESO_DESTINO[c]).not.toMatch(/Otros ingresos VuelaTour/);
      expect(CATEGORIA_INGRESO_LABEL[c]).not.toMatch(/Otros ingresos VuelaTour/);
    }
  });

  it("fallback capitalizado, vacío sin código, y la clave ING-n", () => {
    expect(etiquetaCategoriaIngreso("PREMIO_ESPECIAL")).toBe("Premio especial");
    expect(etiquetaCategoriaIngreso(null)).toBe("");
    expect(etiquetaCategoriaIngreso("")).toBe("");
    expect(categoriaIngresoSumaAResultados(null)).toBe(false);
    expect(categoriaIngresoSumaAResultados("XXX")).toBe(false);
    expect(etiquetaIngreso(12)).toBe("ING-12");
    expect(etiquetaIngreso(null)).toBe("ING-?");
  });
});

describe("paridad de NOMBRES de export con `categoria-ingreso.util.ts` del API", () => {
  it("el panel exporta los mismos nombres (paridad por nombre y valor)", () => {
    const esperados = [
      "CATEGORIAS_INGRESO",
      "CATEGORIA_INGRESO_LABEL",
      "CATEGORIA_INGRESO_DESTINO",
      "CATEGORIA_INGRESO_AYUDA",
      "DESTINO_INGRESO_RESULTADO",
      "CATEGORIAS_INGRESO_RESULTADO",
      "categoriaIngresoSumaAResultados",
      "categoriaIngresoExigeCliente",
      "categoriaIngresoAdmiteVuelo",
      "esAnticipo",
      "etiquetaCategoriaIngreso",
      "etiquetaIngreso",
    ];
    for (const n of esperados) expect(mod).toHaveProperty(n);
    // Nombres de la PRIMERA versión del diseño que la crítica retiró:
    for (const viejo of ["CATEGORIA_INGRESO_LABELS", "DESTINO_INGRESO", "sumaAResultados"]) {
      expect(mod).not.toHaveProperty(viejo);
    }
  });
});
