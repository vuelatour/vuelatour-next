/**
 * Cambiar el cliente de un vuelo / cotización que ya existe (27-nov-2026):
 * textos y decisiones de pantalla. La regla y los avisos son del API.
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_CAMBIAR_CLIENTE,
  EXPLICACION_CAMBIAR_CLIENTE,
  TEXTO_CAMBIAR_CLIENTE_API_VIEJO,
  TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS,
  bloqueoCambiarClientePorGrupo,
  descripcionClienteOpcion,
  errorCambioClientePideRecargar,
  mensajeErrorCambioCliente,
  opcionesClienteParaCambio,
  puedeCambiarCliente,
  resumenCambioCliente,
  tituloCambiarCliente,
  toastCambioCliente,
} from "@/lib/admin/cambio-cliente";

describe("quién ve «Cambiar cliente»", () => {
  it.each(["ADMIN", "COORDINADOR", "DIRECCION", "admin"])("%s sí", (rol) => {
    expect(puedeCambiarCliente(rol)).toBe(true);
  });

  it.each(["FACTURACION", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "", null, undefined])(
    "%s no",
    (rol) => {
      expect(puedeCambiarCliente(rol)).toBe(false);
    },
  );
});

describe("textos del diálogo", () => {
  it("el título dice si es el vuelo o la cotización", () => {
    expect(tituloCambiarCliente({ folio: 501 })).toBe("Cambiar el cliente del vuelo #501");
    expect(tituloCambiarCliente({ folio: 501, esCotizacion: true })).toBe(
      "Cambiar el cliente de la cotización #501",
    );
  });

  it("la explicación dice que el precio NO cambia y que queda anotado quién lo hizo", () => {
    expect(EXPLICACION_CAMBIAR_CLIENTE).toContain("El precio NO cambia");
    expect(EXPLICACION_CAMBIAR_CLIENTE).toContain("Queda anotado quién hizo el cambio y cuándo");
    expect(ETIQUETA_CAMBIAR_CLIENTE).toBe("Cambiar cliente");
  });

  it("con cambios sin guardar se pide guardar o descartar primero", () => {
    expect(TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS).toContain("Guarda o descarta primero");
  });

  it("hijo de grupo: se explica con el folio del grupo (o sin él)", () => {
    expect(bloqueoCambiarClientePorGrupo(12)).toBe(
      "Este vuelo es parte de la cotización de grupo G-12: el cliente es el del grupo completo y no se cambia avión por avión.",
    );
    expect(bloqueoCambiarClientePorGrupo(null)).toBe(
      "Este vuelo es parte de la cotización de grupo: el cliente es el del grupo completo y no se cambia avión por avión.",
    );
  });

  it("resumen «De A a B» sin inventar nombres", () => {
    expect(resumenCambioCliente({ anterior: "Beh Kay", nuevo: "January Davila" })).toEqual({
      de: "Beh Kay",
      a: "January Davila",
    });
    expect(resumenCambioCliente({ anterior: null, nuevo: undefined })).toEqual({
      de: "Sin cliente",
      a: "—",
    });
  });
});

describe("opciones del selector", () => {
  const clientes = [
    { id: "c3", nombre: "Zamora Tours" },
    { id: "c1", nombre: "Beh Kay" },
    { id: "c2", nombre: "ángel Álvarez", es_broker: true },
    { id: "c4", nombre: "Servicio", es_interno: true },
  ];

  it("sin el cliente actual y en orden alfabético es-MX (los acentos no mandan al final)", () => {
    const o = opcionesClienteParaCambio(clientes, "c1");
    expect(o.map((x) => x.value)).toEqual(["c2", "c4", "c3"]);
    expect(o.some((x) => x.value === "c1")).toBe(false);
  });

  it("marca broker e interno en la descripción", () => {
    const o = opcionesClienteParaCambio(clientes, null);
    expect(o.find((x) => x.value === "c2")?.description).toBe("Broker");
    expect(o.find((x) => x.value === "c4")?.description).toBe("Interno · operación propia");
    expect(o.find((x) => x.value === "c1")?.description).toBeUndefined();
    expect(
      descripcionClienteOpcion({ id: "x", nombre: "X", es_broker: true, es_interno: true }),
    ).toBe("Interno · operación propia · Broker");
  });

  it("no muta el catálogo recibido", () => {
    const copia = clientes.map((c) => c.id);
    opcionesClienteParaCambio(clientes, null);
    expect(clientes.map((c) => c.id)).toEqual(copia);
  });
});

describe("resultado", () => {
  it("toast de éxito: dice de quién es ahora y que el precio no cambió", () => {
    expect(
      toastCambioCliente({
        folio: 501,
        sin_cambio: false,
        cliente: { id: "c2", nombre: "January Davila" },
      }),
    ).toBe("Vuelo #501: ahora es de January Davila. El precio no cambió.");
  });

  it("`sin_cambio` (ya era ese cliente) no presume un cambio", () => {
    expect(
      toastCambioCliente({
        folio: 501,
        sin_cambio: true,
        cliente: { id: "c2", nombre: "January Davila" },
      }),
    ).toBe("El vuelo #501 ya era de January Davila: no se cambió nada.");
  });
});

describe("rechazos", () => {
  it("manda el mensaje del API (nombra la factura, el grupo o el mes)", () => {
    expect(
      mensajeErrorCambioCliente({
        code: "VUELO_FACTURADO",
        error: "El vuelo #375 tiene la factura A-0440 registrada a nombre de su cliente…",
        status: 409,
      }),
    ).toContain("A-0440");
  });

  it.each([
    ["CLIENTE_NO_EXISTE", "ya no existe"],
    ["CLIENTE_INACTIVO", "dado de baja"],
    ["VUELO_FACTURADO", "cancela la factura"],
    ["VUELO_DE_GRUPO", "grupo"],
    ["MES_CERRADO", "ya está cerrado"],
    ["CONFLICTO_VERSION", "Alguien modificó este vuelo"],
  ])("sin texto del API, %s tiene respaldo en es-MX", (code, fragmento) => {
    expect(mensajeErrorCambioCliente({ code, error: "", status: 409 })).toContain(fragmento);
  });

  it("404 «Cannot PATCH» = API sin desplegar, nunca «el vuelo no existe»", () => {
    expect(
      mensajeErrorCambioCliente({
        code: "NOT_FOUND",
        error: "Cannot PATCH /v1/flights/abc/cliente",
        status: 404,
      }),
    ).toBe(TEXTO_CAMBIAR_CLIENTE_API_VIEJO);
  });

  it("un 404 con código del negocio conserva su mensaje", () => {
    expect(
      mensajeErrorCambioCliente({
        code: "CLIENTE_NO_EXISTE",
        error: "El cliente elegido ya no existe. Elige otro cliente y vuelve a intentar.",
        status: 404,
      }),
    ).toBe("El cliente elegido ya no existe. Elige otro cliente y vuelve a intentar.");
  });

  it("sin código ni texto: respaldo genérico", () => {
    expect(mensajeErrorCambioCliente({})).toBe("No se pudo cambiar el cliente. Intenta de nuevo.");
  });

  it("solo la versión vieja o el vuelo borrado piden recargar", () => {
    expect(errorCambioClientePideRecargar("CONFLICTO_VERSION")).toBe(true);
    expect(errorCambioClientePideRecargar("VUELO_NO_EXISTE")).toBe(true);
    expect(errorCambioClientePideRecargar("VUELO_FACTURADO")).toBe(false);
    expect(errorCambioClientePideRecargar(undefined)).toBe(false);
  });
});
