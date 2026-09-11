import { describe, expect, it } from "vitest";
import {
  decidirErrorRevise,
  matriculaDeDetails,
} from "@/lib/admin/quote-revise-errores";

/**
 * Parseo del 409 de `POST /v1/quotes/:id/revise` → decisión de UI
 * (11-sep-2026, invariante 14 del API). Lo que se prueba es el ORDEN: taller
 * y squawk también son 409 y no deben caer en «alguien guardó otra versión»,
 * y el reintento confirmado no puede reabrir el diálogo (bucle).
 */
describe("decidirErrorRevise", () => {
  it("COTIZACION_COBRADA → banner de cobrada con el mensaje del API", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "COTIZACION_COBRADA",
      error: "El vuelo ya tiene cobros registrados.",
    });
    expect(d.tipo).toBe("cobrada");
    expect(d.tipo === "cobrada" && d.mensaje).toBe(
      "El vuelo ya tiene cobros registrados.",
    );
  });

  it("AERONAVE_EN_TALLER → banner rojo con mensaje y matrícula, sin reintento", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "AERONAVE_EN_TALLER",
      error: "No se puede asignar: la aeronave está en taller (mantenimiento en curso).",
      details: { aeronave_id: "a1", matricula: "XA-VGV" },
    });
    expect(d).toEqual({
      tipo: "taller",
      mensaje:
        "No se puede asignar: la aeronave está en taller (mantenimiento en curso).",
      matricula: "XA-VGV",
    });
  });

  it("taller sin `code` (API viejo) se detecta por el mensaje", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      error: "No se puede asignar: la aeronave está en taller.",
    });
    expect(d.tipo).toBe("taller");
    expect(d.tipo === "taller" && d.matricula).toBeNull();
  });

  it("SQUAWK_ALTA_SIN_RESOLVER → diálogo con las descripciones de details", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "SQUAWK_ALTA_SIN_RESOLVER",
      error: "No se puede asignar: discrepancia de severidad ALTA sin resolver (…).",
      details: {
        aeronave_id: "a1",
        discrepancias: [
          { id: "s1", descripcion: "Fuga de aceite" },
          { id: "s2", descripcion: "Tren dañado" },
        ],
      },
    });
    expect(d).toEqual({
      tipo: "squawk",
      discrepancias: ["Fuga de aceite", "Tren dañado"],
    });
  });

  it("squawk sin details: las descripciones salen del paréntesis del mensaje", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      error:
        "No se puede asignar: discrepancia de severidad ALTA sin resolver (fuga de aceite; tren dañado). Puedes asignar de todas formas confirmando.",
    });
    expect(d.tipo === "squawk" && d.discrepancias).toEqual([
      "fuga de aceite",
      "tren dañado",
    ]);
  });

  it("el reintento YA confirmado no reabre el diálogo (nada de bucles)", () => {
    const res = {
      ok: false,
      status: 409,
      code: "SQUAWK_ALTA_SIN_RESOLVER",
      error: "discrepancia de severidad ALTA sin resolver",
      details: { discrepancias: [{ id: "s1", descripcion: "Fuga de aceite" }] },
    };
    expect(decidirErrorRevise(res, { yaAceptoSquawk: true }).tipo).toBe("version");
  });

  it("409 genérico (candado optimista) → conflicto de versión", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "CONFLICT",
      error: "La cotización cambió mientras editabas (otra revisión).",
    });
    expect(d.tipo).toBe("version");
  });

  it("error que no es 409 → toast genérico con el mensaje del API", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 400,
      code: "BAD_REQUEST",
      error: "tc_usd_mxn es requerido",
    });
    expect(d).toEqual({ tipo: "otro", mensaje: "tc_usd_mxn es requerido" });
  });

  it("sin mensaje del API cae al texto es-MX por default", () => {
    expect(decidirErrorRevise({ ok: false }).tipo).toBe("otro");
    expect(decidirErrorRevise({ ok: false, status: 409 })).toEqual({
      tipo: "version",
      mensaje: "La cotización cambió mientras editabas",
    });
  });
});

describe("matriculaDeDetails", () => {
  it("lee la matrícula del details y tolera lo que no lo es", () => {
    expect(matriculaDeDetails({ matricula: "N990GG" })).toBe("N990GG");
    expect(matriculaDeDetails({ matricula: "  " })).toBeNull();
    expect(matriculaDeDetails(null)).toBeNull();
    expect(matriculaDeDetails(["x"])).toBeNull();
  });
});
