import { describe, expect, it } from "vitest";
import {
  aeronavesDeCotizacion,
  modelosCotizadosTexto,
  textoCotizadoEn,
  textoOperaEn,
} from "@/lib/admin/avion-cotizado";

const SENECA = { id: "a1", matricula: "N4142R", modelo: "Piper Seneca V" };
const CESSNA = { id: "a2", matricula: "XB-ANU", modelo: "Cessna 206" };

describe("modelosCotizadosTexto / textoCotizadoEn / textoOperaEn", () => {
  it("junta modelos distintos y no repite", () => {
    expect(modelosCotizadosTexto({ modelos: ["Seneca V", "Cessna 206", "Seneca V"] })).toBe(
      "Seneca V · Cessna 206",
    );
  });

  it("externo: solo el modelo del avión ajeno", () => {
    expect(
      modelosCotizadosTexto({
        esExterno: true,
        externoModelo: "Hawker 400A",
        modelos: ["Seneca V"],
      }),
    ).toBe("Hawker 400A");
  });

  it("cotizado/opera en", () => {
    expect(textoCotizadoEn({ modelo: "Kodiak 100" })).toBe("Cotizado en: Kodiak 100");
    expect(textoOperaEn(SENECA, CESSNA)).toBe("opera en XB-ANU (Cessna 206)");
    expect(textoOperaEn(SENECA, SENECA)).toBeNull();
  });
});

/**
 * «Aeronave cotizada» vs «Aeronave utilizada» (control interno 11-sep-2026).
 * Los campos del snapshot son ADITIVOS: el helper tolera que el API todavía
 * no los mande.
 */
describe("aeronavesDeCotizacion", () => {
  it("usa el snapshot nuevo cuando el API lo manda", () => {
    const r = aeronavesDeCotizacion({
      calculo_snapshot: {
        aeronave: { id: "a1", matricula: "N4142R", modelo: "Piper Seneca V" },
        aeronave_cotizada: { matricula: "N4142R", modelo: "Piper Seneca V" },
        aeronave_utilizada: { matricula: "XB-ANU", modelo: "Cessna 206" },
      },
    });
    expect(r.cotizada).toBe("Piper Seneca V");
    expect(r.utilizada).toBe("XB-ANU · Cessna 206");
    expect(r.difieren).toBe(true);
  });

  it("acepta texto suelto en los campos del snapshot", () => {
    const r = aeronavesDeCotizacion({
      calculo_snapshot: {
        aeronave_cotizada: "Kodiak 100",
        aeronave_utilizada: "Kodiak 100",
      },
    });
    expect(r.cotizada).toBe("Kodiak 100");
    expect(r.utilizada).toBe("Kodiak 100");
    expect(r.difieren).toBe(false);
  });

  it("sin los campos nuevos cae a la cotización (aeronave_cotizada/operativa)", () => {
    const r = aeronavesDeCotizacion({
      aeronave_cotizada: SENECA,
      aeronave_operativa: CESSNA,
      calculo_snapshot: { aeronave: SENECA },
    });
    expect(r.cotizada).toBe("Piper Seneca V");
    expect(r.utilizada).toBe("XB-ANU · Cessna 206");
    expect(r.difieren).toBe(true);
  });

  it("sin fichas usa modelos_cotizados y el catálogo del avión asignado", () => {
    const r = aeronavesDeCotizacion(
      { modelos_cotizados: ["Cessna 206"], aeronave_id: "a2" },
      [CESSNA],
    );
    expect(r.cotizada).toBe("Cessna 206");
    expect(r.utilizada).toBe("XB-ANU · Cessna 206");
    expect(r.difieren).toBe(false);
  });

  it("externo: el avión ajeno es el cotizado y el utilizado", () => {
    const r = aeronavesDeCotizacion({
      es_externo: true,
      avion_externo_modelo: "Hawker 400A",
      avion_externo_matricula: "XA-JET",
      calculo_snapshot: { aeronave: SENECA },
    });
    expect(r.cotizada).toBe("Hawker 400A");
    expect(r.utilizada).toBe("XA-JET · Hawker 400A");
    expect(r.difieren).toBe(false);
  });

  /**
   * El API manda `aeronave_cotizada` / `aeronave_utilizada` en la RAÍZ de la
   * cotización y del snapshot del vuelo (quotes.service.findById /
   * flights.service.snapshot), NO dentro de `calculo_snapshot`.
   */
  it("prefiere los campos del raíz que manda el API", () => {
    const r = aeronavesDeCotizacion({
      aeronave_cotizada: SENECA,
      aeronave_utilizada: CESSNA,
      // Ruido viejo que NO debe ganarle al campo del raíz.
      aeronave_operativa: SENECA,
      calculo_snapshot: { aeronave: SENECA },
    });
    expect(r.cotizada).toBe("Piper Seneca V");
    expect(r.utilizada).toBe("XB-ANU · Cessna 206");
    expect(r.difieren).toBe(true);
  });

  it("vuelo sin avión en la cabecera: la ficha del raíz evita «Sin asignar»", () => {
    // `aeronave_operativa` sale de vuelo.aeronave_id (null aquí); el API
    // resuelve `aeronave_utilizada` con el avión del primer tramo vivo.
    const r = aeronavesDeCotizacion({
      aeronave_cotizada: SENECA,
      aeronave_utilizada: CESSNA,
      aeronave_operativa: null,
      aeronave_id: null,
    });
    expect(r.utilizada).toBe("XB-ANU · Cessna 206");
  });

  it("difieren se decide por ID: dos aviones del MISMO modelo sí difieren", () => {
    const otroSeneca = { id: "a9", matricula: "XB-SEN", modelo: "Piper Seneca V" };
    const r = aeronavesDeCotizacion({
      aeronave_cotizada: SENECA,
      aeronave_utilizada: otroSeneca,
    });
    expect(r.utilizada).toBe("XB-SEN · Piper Seneca V");
    // Comparar el texto diría «son el mismo»: se cambió de avión de verdad.
    expect(r.difieren).toBe(true);
  });

  it("mismo avión con ids: no difieren aunque falte la matrícula del cotizado", () => {
    const r = aeronavesDeCotizacion({
      aeronave_cotizada: { id: "a1", matricula: null, modelo: "Piper Seneca V" },
      aeronave_utilizada: SENECA,
    });
    expect(r.difieren).toBe(false);
  });

  it("sin ids: el modelo utilizado cuenta como cotizado si está en la lista", () => {
    // Cotización que rota de avión por tramo: `modelos_cotizados` trae los
    // dos. Operar en cualquiera de ellos NO es «cambio de avión».
    const r = aeronavesDeCotizacion({
      modelos_cotizados: ["Piper Seneca V", "Cessna 206"],
      aeronave_utilizada: { matricula: "XB-ANU", modelo: "Cessna 206" },
    });
    expect(r.cotizada).toBe("Piper Seneca V · Cessna 206");
    expect(r.difieren).toBe(false);
    // Un modelo que NO se cotizó sí levanta la alerta.
    expect(
      aeronavesDeCotizacion({
        modelos_cotizados: ["Piper Seneca V", "Cessna 206"],
        aeronave_utilizada: { matricula: "XB-KOD", modelo: "Kodiak 100" },
      }).difieren,
    ).toBe(true);
  });

  it("API viejo sin nada: null (la UI pinta «—» / «Sin asignar»)", () => {
    const r = aeronavesDeCotizacion({});
    expect(r.cotizada).toBeNull();
    expect(r.utilizada).toBeNull();
    expect(r.difieren).toBe(false);
  });
});
