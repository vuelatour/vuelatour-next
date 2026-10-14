/**
 * Línea de CAPTURA de los gastos (7-sep-2026) y su variante COMPACTA para la
 * celda «Fecha» de la tabla única de Gastos (14-oct-2026): «Capturado 14 oct
 * 10:33» y «Mary Cruz · panel», con el COLOR del distintivo de origen que
 * pidió el cliente el 9-jul (Oficina / Sistema / Visitante). Hora Cancún.
 */
import { describe, expect, it } from "vitest";
import {
  DISTINTIVO_ORIGEN,
  TITULO_DISTINTIVO_ORIGEN,
  distintivoOrigen,
  lineaCaptura,
  lineaCapturaCompacta,
  type GastoCaptura,
} from "@/lib/admin/gastos-captura";

const g = (over: Partial<GastoCaptura> = {}): GastoCaptura => ({
  fecha_gasto: "2026-09-05",
  created_at: "2026-09-05T19:32:00Z",
  capturado_en: "2026-09-05T19:32:00Z",
  origen: "PILOTO",
  captura: { nombre: "Luis Pérez" },
  ...over,
});

describe("lineaCapturaCompacta", () => {
  it("«Capturado 5 sep 14:32» en hora Cancún y nombre/origen separados", () => {
    expect(lineaCapturaCompacta(g())).toEqual({
      cuando: "Capturado 5 sep 14:32",
      nombre: "Luis Pérez",
      origen: "app",
      distintivo: null,
      ambar: false,
      title: lineaCaptura(g())!.title,
    });
  });

  it("cruce de medianoche UTC: 03:10Z del 6 es el 5 a las 22:10 en Cancún", () => {
    const c = lineaCapturaCompacta(g({ capturado_en: "2026-09-06T03:10:00Z", created_at: "2026-09-06T03:10:00Z" }));
    expect(c?.cuando).toBe("Capturado 5 sep 22:10");
  });

  it("origen: OFICINA «panel», PILOTO/MECANICO/VISITANTE «app», SISTEMA «sistema», null sin dato", () => {
    const casos: Array<[string | null, string | null]> = [
      ["OFICINA", "panel"],
      ["PILOTO", "app"],
      ["MECANICO", "app"],
      ["VISITANTE", "app"],
      ["SISTEMA", "sistema"],
      [null, null],
    ];
    for (const [origen, texto] of casos) {
      expect(lineaCapturaCompacta(g({ origen }))?.origen, String(origen)).toBe(texto);
    }
  });

  it("distintivo de color SOLO para Oficina, Sistema y Visitante (pedido del 9-jul)", () => {
    expect(lineaCapturaCompacta(g({ origen: "OFICINA" }))?.distintivo).toEqual({
      codigo: "OFICINA",
      etiqueta: "Oficina",
      titulo: "Oficina: lo capturó administración desde el panel.",
    });
    expect(lineaCapturaCompacta(g({ origen: "SISTEMA" }))?.distintivo?.etiqueta).toBe("Sistema");
    expect(lineaCapturaCompacta(g({ origen: "VISITANTE" }))?.distintivo?.etiqueta).toBe("Visitante");
    for (const origen of ["PILOTO", "MECANICO", null, "OTRA"]) {
      expect(lineaCapturaCompacta(g({ origen }))?.distintivo, String(origen)).toBeNull();
    }
    expect(DISTINTIVO_ORIGEN).toEqual({ OFICINA: "Oficina", SISTEMA: "Sistema", VISITANTE: "Visitante" });
    expect(TITULO_DISTINTIVO_ORIGEN.SISTEMA).toBe("Sistema: lo generó el sistema (p. ej. las pistas).");
    expect(TITULO_DISTINTIVO_ORIGEN.VISITANTE).toBe("Visitante: lo capturó un visitante desde la app.");
    expect(distintivoOrigen(undefined)).toBeNull();
  });

  it("nombre recortado; vacío o sin join ⇒ null", () => {
    expect(lineaCapturaCompacta(g({ captura: { nombre: "  Mary Cruz  " } }))?.nombre).toBe("Mary Cruz");
    expect(lineaCapturaCompacta(g({ captura: { nombre: "   " } }))?.nombre).toBeNull();
    expect(lineaCapturaCompacta(g({ captura: null }))?.nombre).toBeNull();
  });

  it("sin capturado_en usa created_at; sin ningún instante ⇒ null", () => {
    expect(lineaCapturaCompacta(g({ capturado_en: undefined }))?.cuando).toBe("Capturado 5 sep 14:32");
    expect(lineaCapturaCompacta(g({ capturado_en: null }))?.cuando).toBe("Capturado 5 sep 14:32");
    expect(lineaCapturaCompacta(g({ capturado_en: null, created_at: null as unknown as string }))).toBeNull();
  });

  it("ámbar y title IGUALES a los de lineaCaptura: desfase > 120 días", () => {
    const x = g({ fecha_gasto: "2026-03-01" });
    const c = lineaCapturaCompacta(x)!;
    expect(c.ambar).toBe(true);
    expect(c.ambar).toBe(lineaCaptura(x)!.ambar);
    expect(c.title).toBe(lineaCaptura(x)!.title);
    expect(c.cuando).toBe("Capturado 5 sep 14:32");
  });

  it("año raro: «⚠ año 2025 · Capturado …» en ámbar", () => {
    const x = g({ fecha_gasto: "2025-09-05" });
    const c = lineaCapturaCompacta(x)!;
    expect(c.cuando).toBe("⚠ año 2025 · Capturado 5 sep 14:32");
    expect(c.ambar).toBe(true);
    expect(c.title).toBe(lineaCaptura(x)!.title);
    expect(c.title.startsWith("Ojo: el ticket quedó fechado en 2025")).toBe(true);
  });

  it("dentro de lo normal: gris, sin nota", () => {
    const x = g({ fecha_gasto: "2026-09-04" });
    expect(lineaCapturaCompacta(x)?.ambar).toBe(false);
  });
});
