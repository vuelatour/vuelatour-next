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

  // TALLER (11-sep-2026): dejó de ser candado. El API vigente NO manda este
  // 409 — guarda y devuelve el aviso en `avisos[]`. Lo que sigue solo cubre
  // la compatibilidad con un backend sin desplegar: se clasifica aparte (no
  // como conflicto de versión) y el texto ya NO limita al operador.
  it("AERONAVE_EN_TALLER (API viejo) se clasifica aparte, con la matrícula", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "AERONAVE_EN_TALLER",
      error: "No se puede asignar: la aeronave está en taller (mantenimiento en curso).",
      details: { aeronave_id: "a1", matricula: "XA-VGV" },
    });
    expect(d).toEqual({
      tipo: "taller",
      mensaje: "El API rechazó el avión en taller; actualiza el API.",
      matricula: "XA-VGV",
    });
  });

  it("el texto del caso taller no le dice al operador que no se puede", () => {
    const d = decidirErrorRevise({
      ok: false,
      status: 409,
      code: "AERONAVE_EN_TALLER",
      error: "No se puede asignar: la aeronave está en taller (mantenimiento en curso).",
    });
    expect(d.tipo === "taller" && d.mensaje).not.toMatch(
      /no se puede|no disponible|elige otro avión/i,
    );
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
