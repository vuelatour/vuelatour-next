import { describe, expect, it } from "vitest";
import {
  AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO,
  AVISO_TRAMO_NUEVO_COMERCIAL,
  AVISO_TRAMO_NUEVO_OPERATIVO,
  AYUDA_OPERATIVO_CON_PAX,
  AYUDA_TRAMO_OPERATIVO,
  CHIP_OPERATIVO_CON_PAX,
  ETIQUETA_TRAMO_OPERATIVO,
  avisoTramoNuevo,
  mensajeTramoAgregado,
  operativoConPasajeros,
  tipoTramoNuevo,
  tramoAgregadoEsComercial,
  tramoNuevoEsOperativo,
  type EscalaExistenteRef,
} from "@/lib/admin/tramo-operativo";

/**
 * TRAMO OPERATIVO vs TRAMO DEL CLIENTE (30-sep-2026, API 0.0.46).
 *
 * Caso guía: vuelo #364. Alta con `CUN→CET` y `CET→PTU` (ferry, 0 pax); Pablo
 * agregó desde la app `PTU→CUN` con 4 pasajeros y el API lo guardó como
 * OPERATIVO (`solo_operativa`, orden 100): la app dijo «Interno (no del
 * cliente)» y «tramo 100», y el tramo quedó fuera de la cotización. Aquí se
 * congelan los textos del contrato y la regla que espeja la del API.
 */

describe("textos del contrato (los mismos que la app)", () => {
  it("la etiqueta ya no dice «Interno»: dice qué es y qué implica", () => {
    expect(ETIQUETA_TRAMO_OPERATIVO).toBe("Operativo · no cotizado");
    expect(AYUDA_TRAMO_OPERATIVO).toBe(
      "Posicionamiento, ferry o parada técnica: no se cobra ni entra a la cotización",
    );
    expect(ETIQUETA_TRAMO_OPERATIVO).not.toMatch(/interno/i);
  });

  it("el chip ámbar y los avisos del alta, palabra por palabra", () => {
    expect(CHIP_OPERATIVO_CON_PAX).toBe(
      "Lleva pasajeros y no está cotizado: revisa la cotización",
    );
    expect(AVISO_TRAMO_NUEVO_COMERCIAL).toBe(
      "Este tramo es del cliente: la cotización mostrará que la operación difiere para adoptarlo",
    );
    expect(AVISO_TRAMO_NUEVO_OPERATIVO).toBe("Tramo operativo: no se cotiza");
  });

  it("el aviso del freno de cronología es el del API, en futuro (aún no se guarda)", () => {
    expect(AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO).toBe(
      "Este tramo es del cliente, pero va después de un tramo operativo (ferry o posicionamiento) del vuelo: quedará como operativo y no entrará a la cotización. Si hay que cobrarlo, agrégalo como ajuste o extra en la cotización",
    );
  });
});

describe("tramoNuevoEsOperativo / avisoTramoNuevo — espejo de la regla del API", () => {
  it("ferry ⇒ operativo", () => {
    expect(tramoNuevoEsOperativo({ esFerry: true, esServicio: false })).toBe(true);
    expect(avisoTramoNuevo({ esFerry: true, esServicio: false })).toEqual({
      tipo: "OPERATIVO",
      comercial: false,
      texto: AVISO_TRAMO_NUEVO_OPERATIVO,
    });
  });

  it("parada técnica (SERVICIO) SIN pasajeros ⇒ operativo (posicionamiento a taller)", () => {
    expect(tramoNuevoEsOperativo({ esFerry: false, esServicio: true })).toBe(true);
    expect(
      tramoNuevoEsOperativo({ esFerry: false, esServicio: true, pasajeros: 0 }),
    ).toBe(true);
    expect(avisoTramoNuevo({ esFerry: false, esServicio: true }).comercial).toBe(false);
  });

  it("parada de SERVICIO CON pasajeros ⇒ del CLIENTE (regla del API: #150, #84, #57 están cotizados)", () => {
    expect(
      tramoNuevoEsOperativo({ esFerry: false, esServicio: true, pasajeros: 5 }),
    ).toBe(false);
    expect(
      avisoTramoNuevo({ esFerry: false, esServicio: true, pasajeros: "5" }),
    ).toEqual({ tipo: "COMERCIAL", comercial: true, texto: AVISO_TRAMO_NUEVO_COMERCIAL });
    // Ferry manda aunque se cuele un pax: vuela vacío.
    expect(
      tramoNuevoEsOperativo({ esFerry: true, esServicio: true, pasajeros: 5 }),
    ).toBe(true);
  });

  it("#364: PTU→CUN con pasajeros, sin ferry ⇒ del CLIENTE", () => {
    expect(
      tramoNuevoEsOperativo({ esFerry: false, esServicio: false, pasajeros: 4 }),
    ).toBe(false);
    expect(avisoTramoNuevo({ esFerry: false, esServicio: false, pasajeros: 4 })).toEqual({
      tipo: "COMERCIAL",
      comercial: true,
      texto: AVISO_TRAMO_NUEVO_COMERCIAL,
    });
    // Sin ferry y sin pasajeros también es del cliente (el API no mira el pax
    // en una parada NORMAL).
    expect(tramoNuevoEsOperativo({ esFerry: false, esServicio: false })).toBe(false);
  });
});

/**
 * Freno de cronología: espejo de `ubicarTramoAgregado` del API (regla 3). La
 * cadena de tacómetros camina por `orden`: un tramo del cliente que va
 * DESPUÉS de un operativo ≥ 100 que ya voló, está volando o sale antes, queda
 * OPERATIVO y el API lo avisa.
 */
describe("tipoTramoNuevo — freno de cronología (espejo del API)", () => {
  const conPax = { esFerry: false, esServicio: false, pasajeros: 4 };
  const ESCALAS_364: EscalaExistenteRef[] = [
    { orden: 1, fecha_salida_plan: null },
    { orden: 2, fecha_salida_plan: null },
    { orden: 100, fecha_salida_plan: null },
  ];

  it("sin escalas conocidas no se evalúa: del cliente", () => {
    expect(tipoTramoNuevo(conPax)).toBe("COMERCIAL");
  });

  it("#364 legado (operativo 100 sin fecha ni tacos) ⇒ sigue siendo del cliente", () => {
    expect(tipoTramoNuevo({ ...conPax, existentes: ESCALAS_364 })).toBe("COMERCIAL");
  });

  it("operativo ≥ 100 que ya aterrizó ⇒ CLIENTE_OPERATIVO con su aviso", () => {
    const existentes = [
      { orden: 1 },
      { orden: 100, taco_salida: "1500.0", taco_salida_origen: "PILOTO", taco_llegada: "1501.2" },
    ];
    expect(tipoTramoNuevo({ ...conPax, existentes })).toBe("CLIENTE_OPERATIVO");
    expect(avisoTramoNuevo({ ...conPax, existentes })).toEqual({
      tipo: "CLIENTE_OPERATIVO",
      comercial: false,
      texto: AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO,
    });
  });

  it("una salida DEDUCIDA no es «ya arrancó»; una del piloto sí", () => {
    const base = { orden: 100, taco_salida: "1500.0" };
    expect(
      tipoTramoNuevo({
        ...conPax,
        existentes: [{ orden: 1 }, { ...base, taco_salida_origen: "DEDUCIDO" }],
      }),
    ).toBe("COMERCIAL");
    expect(
      tipoTramoNuevo({
        ...conPax,
        existentes: [{ orden: 1 }, { ...base, taco_salida_origen: "PILOTO" }],
      }),
    ).toBe("CLIENTE_OPERATIVO");
  });

  it("operativo que SALE ANTES que el nuevo ⇒ CLIENTE_OPERATIVO; después o sin fecha ⇒ del cliente", () => {
    const existentes = [
      { orden: 1 },
      { orden: 100, fecha_salida_plan: "2026-10-01T15:00:00.000Z" },
    ];
    expect(
      tipoTramoNuevo({ ...conPax, existentes, fechaSalidaPlan: "2026-10-01T18:00:00.000Z" }),
    ).toBe("CLIENTE_OPERATIVO");
    expect(
      tipoTramoNuevo({ ...conPax, existentes, fechaSalidaPlan: "2026-10-01T12:00:00.000Z" }),
    ).toBe("COMERCIAL");
    expect(tipoTramoNuevo({ ...conPax, existentes, fechaSalidaPlan: null })).toBe(
      "COMERCIAL",
    );
  });

  it("un operativo CANCELADO no frena; un operativo con orden < 100 tampoco", () => {
    expect(
      tipoTramoNuevo({
        ...conPax,
        existentes: [
          { orden: 1 },
          { orden: 100, taco_llegada: "10", cancelada_at: "2026-09-30T15:00:00Z" },
        ],
      }),
    ).toBe("COMERCIAL");
    expect(
      tipoTramoNuevo({
        ...conPax,
        existentes: [{ orden: 1, taco_llegada: "10" }, { orden: 2 }],
      }),
    ).toBe("COMERCIAL");
  });

  it("sin lugar en el rango comercial (99 tramos) ⇒ CLIENTE_OPERATIVO", () => {
    const existentes = Array.from({ length: 99 }, (_, i) => ({ orden: i + 1 }));
    expect(tipoTramoNuevo({ ...conPax, existentes })).toBe("CLIENTE_OPERATIVO");
  });

  it("un ferry nunca pasa por el freno: es operativo y punto", () => {
    expect(
      tipoTramoNuevo({
        esFerry: true,
        esServicio: false,
        existentes: [{ orden: 100, taco_llegada: "10" }],
      }),
    ).toBe("OPERATIVO");
  });
});

describe("operativoConPasajeros — cuándo sale el chip ámbar", () => {
  it("#364 legado: operativo, no ferry, 4 pax ⇒ sí", () => {
    expect(
      operativoConPasajeros({ solo_operativa: true, es_ferry: false, pasajeros: 4 }),
    ).toBe(true);
  });

  it("tramo del cliente con pasajeros ⇒ no (ya se cotiza)", () => {
    expect(
      operativoConPasajeros({ solo_operativa: false, es_ferry: false, pasajeros: 4 }),
    ).toBe(false);
  });

  it("operativo vacío, ferry o cancelado ⇒ no", () => {
    expect(operativoConPasajeros({ solo_operativa: true, pasajeros: 0 })).toBe(false);
    expect(operativoConPasajeros({ solo_operativa: true, pasajeros: null })).toBe(false);
    expect(
      operativoConPasajeros({ solo_operativa: true, es_ferry: true, pasajeros: 3 }),
    ).toBe(false);
    expect(
      operativoConPasajeros({
        solo_operativa: true,
        pasajeros: 4,
        cancelada_at: "2026-09-30T15:00:00Z",
      }),
    ).toBe(false);
  });

  it("vuelo con itinerario_operativo ⇒ nunca (la cotización es otra ruta: #282 HOL→CUN 2 pax SÍ está cotizado)", () => {
    const hol = { solo_operativa: true, es_ferry: false, pasajeros: 2 };
    expect(operativoConPasajeros(hol, { itinerarioOperativo: true })).toBe(false);
    expect(operativoConPasajeros(hol, { itinerarioOperativo: false })).toBe(true);
    // Sin el dato (API previo) se evalúa como siempre.
    expect(operativoConPasajeros(hol, { itinerarioOperativo: null })).toBe(true);
    expect(operativoConPasajeros(hol)).toBe(true);
  });

  it("la ayuda del chip no afirma de más: dice qué revisar y por qué", () => {
    expect(AYUDA_OPERATIVO_CON_PAX).toContain("Actualizar la cotización con la operación");
    expect(AYUDA_OPERATIVO_CON_PAX).not.toMatch(/el precio no lo incluye/);
  });

  it("tolera el pax como texto (API numérico serializado)", () => {
    expect(operativoConPasajeros({ solo_operativa: true, pasajeros: "2" })).toBe(true);
    expect(operativoConPasajeros({ solo_operativa: true, pasajeros: "x" })).toBe(false);
  });
});

describe("tramoAgregadoEsComercial / mensajeTramoAgregado — el toast dice lo que QUEDÓ", () => {
  it("API 0.0.46: manda `comercial` y gana sobre todo lo demás", () => {
    expect(tramoAgregadoEsComercial({ comercial: true, solo_operativa: false })).toBe(true);
    expect(tramoAgregadoEsComercial({ comercial: false, solo_operativa: true })).toBe(false);
  });

  it("API previo (sin `comercial`): se lee `solo_operativa` de la escala creada", () => {
    expect(tramoAgregadoEsComercial({ solo_operativa: true })).toBe(false);
    expect(tramoAgregadoEsComercial({ solo_operativa: false })).toBe(true);
    expect(tramoAgregadoEsComercial({})).toBe(false);
  });

  it("del cliente: título + el aviso del API como descripción", () => {
    const aviso =
      "Este tramo es del cliente: la cotización mostrará que la operación difiere y ofrecerá adoptarlo.";
    expect(mensajeTramoAgregado({ comercial: true, aviso }, false)).toEqual({
      titulo: "Tramo del cliente agregado",
      descripcion: aviso,
      advertencia: false,
    });
  });

  it("del cliente sin `aviso` del API: cae al texto del panel", () => {
    expect(mensajeTramoAgregado({ comercial: true }, false)).toEqual({
      titulo: "Tramo del cliente agregado",
      descripcion: `${AVISO_TRAMO_NUEVO_COMERCIAL}.`,
      advertencia: false,
    });
  });

  it("operativo: lo dice en el título, sin descripción", () => {
    expect(mensajeTramoAgregado({ comercial: false }, false)).toEqual({
      titulo: "Tramo operativo agregado (no se cotiza)",
      advertencia: false,
    });
    expect(mensajeTramoAgregado({ comercial: false, aviso: null }, false)).toEqual({
      titulo: "Tramo operativo agregado (no se cotiza)",
      advertencia: false,
    });
    // API previo con un tramo con pasajeros: quedó operativo y NO se miente.
    expect(mensajeTramoAgregado({ solo_operativa: true }, false).titulo).toBe(
      "Tramo operativo agregado (no se cotiza)",
    );
  });

  it("freno de cronología: operativo CON aviso del API ⇒ el aviso se DICE, en ámbar", () => {
    const aviso =
      "Este tramo es del cliente, pero va después de un tramo operativo (ferry o posicionamiento) del vuelo: quedó como operativo y no entra a la cotización. Si hay que cobrarlo, agrégalo como ajuste o extra en la cotización.";
    expect(mensajeTramoAgregado({ comercial: false, aviso }, false)).toEqual({
      titulo: "Tramo operativo agregado (no se cotiza)",
      descripcion: aviso,
      advertencia: true,
    });
    expect(mensajeTramoAgregado({ comercial: false, aviso }, true)).toEqual({
      titulo: "Tramo agregado; el vuelo vuelve a EN VUELO",
      descripcion: aviso,
      advertencia: true,
    });
  });

  it("vuelo COMPLETADO: conserva el aviso de reapertura y aclara qué quedó", () => {
    expect(mensajeTramoAgregado({ comercial: true }, true)).toEqual({
      titulo: "Tramo agregado; el vuelo vuelve a EN VUELO",
      descripcion: `${AVISO_TRAMO_NUEVO_COMERCIAL}.`,
      advertencia: false,
    });
    expect(mensajeTramoAgregado({ comercial: false }, true)).toEqual({
      titulo: "Tramo agregado; el vuelo vuelve a EN VUELO",
      descripcion: `${AVISO_TRAMO_NUEVO_OPERATIVO}.`,
      advertencia: false,
    });
  });
});
