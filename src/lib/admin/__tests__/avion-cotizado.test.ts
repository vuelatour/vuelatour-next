import { describe, expect, it } from "vitest";
import {
  aeronaveInicialDeCotizacion,
  avisoAvionCotizadoNoSeleccionable,
  aeronavesDeCotizacion,
  esAeronaveCotizada,
  fichaAeronaveUtilizada,
  fraseOperaEn,
  idAeronaveCotizada,
  modelosCotizadosTexto,
  modelosCotizadosVigentes,
  textoConfirmarEdicionCotizacion,
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

/**
 * LA COTIZACIÓN ES INDEPENDIENTE DE LA OPERACIÓN (contrato 12-sep-2026,
 * pedido del cliente sobre el folio #298). El cotizador rehidrata el avión
 * COTIZADO (snapshot vigente) y NUNCA el operativo del vuelo: con el
 * operativo, el motor recalculaba con otra tarifa, la hoja imprimía otro
 * modelo y guardar la vN cambiaba el precio pactado.
 */
describe("aeronaveInicialDeCotizacion / idAeronaveCotizada / esAeronaveCotizada", () => {
  const CESSNA205 = { id: "a-cessna205", matricula: "XB-205", modelo: "Cessna 205" };
  const N990GG = { id: "a-990gg", matricula: "N990GG", modelo: "Seneca V" };

  it("caso #298: snapshot ≠ operativo ⇒ arranca con el COTIZADO", () => {
    const q = {
      aeronave_cotizada: CESSNA205,
      aeronave_utilizada: N990GG,
      // vuelo.aeronave_id = el OPERATIVO (reassign-aircraft).
      aeronave_id: N990GG.id,
      calculo_snapshot: { aeronave: CESSNA205 },
    };
    expect(idAeronaveCotizada(q)).toBe("a-cessna205");
    expect(aeronaveInicialDeCotizacion(q, "a-default")).toBe("a-cessna205");
    expect(esAeronaveCotizada(q, "a-cessna205")).toBe(true);
    // El operativo NO cuenta como «sin cambio de avión».
    expect(esAeronaveCotizada(q, N990GG.id)).toBe(false);
  });

  it("sin `aeronave_cotizada` (API previo) cae al avión del snapshot", () => {
    const q = { aeronave_id: N990GG.id, calculo_snapshot: { aeronave: CESSNA205 } };
    expect(aeronaveInicialDeCotizacion(q, "a-default")).toBe("a-cessna205");
  });

  it("sin snapshot (nada pactado) ⇒ el avión del vuelo, y sin él el default", () => {
    expect(aeronaveInicialDeCotizacion({ aeronave_id: N990GG.id }, "a-default")).toBe(
      "a-990gg",
    );
    expect(aeronaveInicialDeCotizacion({ aeronave_id: null }, "a-default")).toBe("a-default");
    expect(aeronaveInicialDeCotizacion({}, "a-default")).toBe("a-default");
    // Sin snapshot no hay lista del API que respetar.
    expect(esAeronaveCotizada({ aeronave_id: N990GG.id }, N990GG.id)).toBe(false);
  });

  it("externo: la referencia de tarifa del snapshot, no el avión del vuelo", () => {
    const q = {
      es_externo: true,
      avion_externo_modelo: "Hawker 400A",
      avion_externo_matricula: "XA-JET",
      aeronave_id: null,
      calculo_snapshot: { aeronave: CESSNA205 },
    };
    expect(aeronaveInicialDeCotizacion(q, "a-default")).toBe("a-cessna205");
    // Snapshot legado sin id: el default evita el 400 del motor.
    expect(
      aeronaveInicialDeCotizacion(
        { es_externo: true, aeronave_id: null, calculo_snapshot: { aeronave: { id: null } } },
        "a-default",
      ),
    ).toBe("a-default");
  });
});

describe("fichaAeronaveUtilizada / fraseOperaEn", () => {
  const CESSNA205 = { id: "a-cessna205", matricula: "XB-205", modelo: "Cessna 205" };
  const N990GG = { id: "a-990gg", matricula: "N990GG", modelo: "Seneca V" };

  it("nota tenue «Opera en N990GG (Seneca V)» cuando el vuelo usa otro avión", () => {
    const utilizada = fichaAeronaveUtilizada({
      aeronave_cotizada: CESSNA205,
      aeronave_utilizada: N990GG,
      aeronave_id: N990GG.id,
    });
    expect(fraseOperaEn(CESSNA205, utilizada)).toBe("Opera en N990GG (Seneca V)");
    // Si el operador decide cotizar con el avión operativo, la nota se va.
    expect(fraseOperaEn(N990GG, utilizada)).toBeNull();
  });

  it("sin ficha del API resuelve el avión del vuelo por catálogo", () => {
    const utilizada = fichaAeronaveUtilizada({ aeronave_id: N990GG.id }, [N990GG, CESSNA205]);
    expect(utilizada?.id).toBe("a-990gg");
    expect(fraseOperaEn(CESSNA205, utilizada)).toBe("Opera en N990GG (Seneca V)");
    // Sin avión asignado no se inventa nota.
    expect(fraseOperaEn(CESSNA205, fichaAeronaveUtilizada({}, []))).toBeNull();
  });
});

describe("textoConfirmarEdicionCotizacion", () => {
  it("explica la separación y dice en qué avión opera hoy", () => {
    const t = textoConfirmarEdicionCotizacion({
      folio: 298,
      estado: "CONFIRMADO",
      aeronaveUtilizada: "N990GG · Seneca V",
    });
    expect(t.titulo).toBe("La cotización es independiente de la operación. ¿Editar?");
    expect(t.cuerpo).toContain("El vuelo #298 ya está confirmado con piloto");
    expect(t.cuerpo).toContain("hoy opera en N990GG · Seneca V");
    expect(t.cuerpo).toContain("el avión con el que se vuela no cambia lo cotizado");
    expect(t.cuerpo).toContain("la tripulación recibe aviso");
  });

  it("adapta RESERVA y omite el avión cuando el API no lo manda", () => {
    const t = textoConfirmarEdicionCotizacion({ folio: 12, estado: "RESERVA" });
    expect(t.cuerpo).toContain("El vuelo #12 ya está reservado con piloto.");
    expect(t.cuerpo).not.toContain("opera en");
  });

  it("sin folio no imprime «#undefined»", () => {
    const t = textoConfirmarEdicionCotizacion({ folio: null });
    expect(t.cuerpo.startsWith("El vuelo ya está confirmado con piloto.")).toBe(true);
    expect(t.cuerpo).not.toContain("#");
  });
});

describe("modelosCotizadosVigentes", () => {
  it("descarta la lista cuando no habla del avión cotizado (API viejo, R3)", () => {
    // Snapshot = Cessna 205, pero el API listó el modelo del avión OPERATIVO.
    expect(modelosCotizadosVigentes(["Seneca V"], "Cessna 205")).toBeNull();
  });

  it("conserva la lista válida (incluida la que rota de avión por tramo)", () => {
    expect(modelosCotizadosVigentes(["Cessna 205"], "Cessna 205")).toEqual(["Cessna 205"]);
    expect(modelosCotizadosVigentes(["Piper Seneca V", "Cessna 206"], "cessna 206")).toEqual([
      "Piper Seneca V",
      "Cessna 206",
    ]);
  });

  it("sin lista o sin modelo con qué comparar: null / la lista tal cual", () => {
    expect(modelosCotizadosVigentes([], "Cessna 205")).toBeNull();
    expect(modelosCotizadosVigentes(undefined, "Cessna 205")).toBeNull();
    expect(modelosCotizadosVigentes(["Cessna 205"], null)).toEqual(["Cessna 205"]);
  });
});

// ===================================================================
// R1 + catálogo: el avión COTIZADO puede estar DADO DE BAJA. El motor
// (`POST /quotes/calculate`) responde 400 «Aeronave inactiva», así que
// arrancar con él dejaría la cotización imposible de abrir.
// ===================================================================
describe("aeronaveInicialDeCotizacion con catálogo + avisoAvionCotizadoNoSeleccionable", () => {
  const CESSNA205 = { id: "a-cessna205", matricula: "XB-205", modelo: "Cessna 205" };
  const N990GG = { id: "a-990gg", matricula: "N990GG", modelo: "Seneca V" };
  const q = {
    aeronave_cotizada: CESSNA205,
    aeronave_id: N990GG.id,
    calculo_snapshot: { aeronave: CESSNA205 },
    modelos_cotizados: ["Cessna 205"],
  };

  it("el cotizado SIGUE activo ⇒ manda el cotizado y no hay aviso", () => {
    const catalogo = [{ id: CESSNA205.id }, { id: N990GG.id }];
    expect(aeronaveInicialDeCotizacion(q, "a-default", catalogo)).toBe(CESSNA205.id);
    expect(avisoAvionCotizadoNoSeleccionable(q, catalogo)).toBeNull();
  });

  it("el cotizado ya NO está en el catálogo ⇒ cae al operativo y AVISA con el modelo", () => {
    const catalogo = [{ id: N990GG.id }, { id: "a-default" }];
    expect(aeronaveInicialDeCotizacion(q, "a-default", catalogo)).toBe(N990GG.id);
    const aviso = avisoAvionCotizadoNoSeleccionable(q, catalogo);
    expect(aviso).toContain("Cessna 205");
    expect(aviso).toContain("revisa el precio antes de guardar");
  });

  it("ni el cotizado ni el operativo están activos ⇒ el default del catálogo", () => {
    const catalogo = [{ id: "a-default" }];
    expect(aeronaveInicialDeCotizacion(q, "a-default", catalogo)).toBe("a-default");
  });

  it("sin catálogo no se filtra nada ni se inventan alarmas (compatibilidad)", () => {
    expect(aeronaveInicialDeCotizacion(q, "a-default")).toBe(CESSNA205.id);
    expect(avisoAvionCotizadoNoSeleccionable(q, undefined)).toBeNull();
    expect(avisoAvionCotizadoNoSeleccionable(q, null)).toBeNull();
  });

  it("sin snapshot (nada pactado) no hay avión cotizado que reclamar", () => {
    expect(avisoAvionCotizadoNoSeleccionable({ aeronave_id: N990GG.id }, [])).toBeNull();
  });
});
