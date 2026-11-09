/**
 * CORREOS AL CLIENTE — textos y reglas puras (9-nov-2026, API 0.0.133).
 *
 * Pedido de la oficina: «que se cancele el envío automático a los clientes;
 * que solo se mande cuando ellos le den en enviar de forma manual… y saber si
 * se mandó o no y con qué contenido». Aquí se congela lo que la oficina LEE:
 * la leyenda de que nada sale solo, la línea de cada envío (DD/MM/AAAA, hora
 * Cancún), el aviso de reenvío, por qué no se puede enviar y que los 409 se
 * distinguen por `code` (nunca por el texto del mensaje).
 */
import { describe, expect, it } from "vitest";
import {
  BOTON_ENVIAR_CONFIRMACION,
  DESCRIPCION_TOAST_CONFIRMAR,
  LEYENDA_CORREO_MANUAL,
  MENSAJE_ENVIADO_DEFAULT,
  MENSAJE_ENVIO_INCIERTO,
  MENSAJE_ENVIO_NO_DISPONIBLE,
  MENSAJE_ENVIO_SIN_PERMISO,
  MENSAJE_FALLIDO_DEFAULT,
  MENSAJE_VISTA_PREVIA_ERROR,
  MENSAJE_VISTA_PREVIA_SIN_PERMISO,
  ROLES_ENVIAN_CORREO_CLIENTE,
  ROLES_VEN_CORREOS_CLIENTE,
  TEXTO_SIN_CORREOS,
  avisoReenvio,
  contarCorreos,
  errorVistaPrevia,
  esReenvio,
  estadoCorreoUi,
  etiquetaTipoCorreo,
  folioTexto,
  hayRangoCorreos,
  hrefVueloDeCorreo,
  lineaEnvio,
  motivoNoEnviable,
  nombreLimpio,
  puedeEnviarCorreoCliente,
  puedeVerCorreosCliente,
  rangoCorreosDeUrl,
  resultadoEnvio,
  textoBotonEnviar,
  textoBusquedaCorreo,
  textoConteoCorreos,
  textoDestinatario,
  textoErrorCorreo,
  textoPeriodoCorreos,
  textoRemitente,
  textoResumenCorreos,
  textoTruncado,
  ultimoEnvioDeDetalles,
} from "../correo-cliente";
import { sinDireccion } from "../roles";
import type { CorreoCliente } from "@/types/correos-cliente";

const VUELO = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";
const USUARIO = "9b1d2c3e-0000-4000-8000-000000000001";

function correo(extra: Partial<CorreoCliente> = {}): CorreoCliente {
  return {
    id: "c0000001-0000-4000-8000-000000000001",
    vuelo_id: VUELO,
    folio: 412,
    tipo: "CONFIRMACION_VUELO",
    cliente_nombre: "Ana Ruiz",
    destinatario: "ana@x.com",
    remitente: "VuelaTour <notificaciones@vuelatour.com>",
    asunto: "Vuelo confirmado · CUN → CZM (folio #412)",
    html: "<p>Hola Ana</p>",
    texto: "Hola Ana",
    estado: "ENVIADO",
    error: null,
    enviado_por: USUARIO,
    enviado_por_nombre: "Itzel",
    // 15:40 UTC = 10:40 a.m. en Cancún (UTC−5).
    created_at: "2026-11-09T15:40:00Z",
    ...extra,
  };
}

describe("roles", () => {
  it("VEN: espejo del @Roles de los GET del API + Dirección", () => {
    expect(sinDireccion(ROLES_VEN_CORREOS_CLIENTE)).toEqual([
      "ADMIN",
      "COORDINADOR",
      "FACTURACION",
      "ANALISTA",
    ]);
    for (const rol of ["DIRECCION", "ADMIN", "COORDINADOR", "FACTURACION", "ANALISTA"]) {
      expect(puedeVerCorreosCliente(rol), rol).toBe(true);
    }
    for (const rol of ["SOCIO", "PILOTO", "MECANICO", "VISITANTE", null, undefined, ""]) {
      expect(puedeVerCorreosCliente(rol), String(rol)).toBe(false);
    }
  });

  it("ENVÍAN: solo Administración y Coordinación (y Dirección, que puede todo lo de ADMIN)", () => {
    expect(sinDireccion(ROLES_ENVIAN_CORREO_CLIENTE)).toEqual(["ADMIN", "COORDINADOR"]);
    expect(puedeEnviarCorreoCliente("DIRECCION")).toBe(true);
    expect(puedeEnviarCorreoCliente("ADMIN")).toBe(true);
    expect(puedeEnviarCorreoCliente("COORDINADOR")).toBe(true);
    expect(puedeEnviarCorreoCliente("FACTURACION")).toBe(false);
    expect(puedeEnviarCorreoCliente("ANALISTA")).toBe(false);
  });

  it("sin rol (falló /me) NO se ofrece enviar: es un correo que le llega al cliente", () => {
    expect(puedeEnviarCorreoCliente(null)).toBe(false);
    expect(puedeEnviarCorreoCliente(undefined)).toBe(false);
  });
});

describe("textos fijos que pidió la oficina", () => {
  it("la leyenda dice que nada sale solo", () => {
    expect(LEYENDA_CORREO_MANUAL).toBe(
      "Los correos al cliente NO se envían solos. Solo sale uno cuando alguien pulsa Enviar aquí.",
    );
    expect(TEXTO_SIN_CORREOS).toBe("No se le ha enviado ningún correo al cliente.");
    expect(BOTON_ENVIAR_CONFIRMACION).toBe("Enviar confirmación al cliente");
  });

  it("el toast de confirmar nombra el botón tal como está escrito en la card", () => {
    expect(DESCRIPCION_TOAST_CONFIRMAR).toBe(
      "No se envió ningún correo al cliente. Si lo necesitas, usa «Enviar confirmación al cliente».",
    );
    expect(DESCRIPCION_TOAST_CONFIRMAR).toContain(`«${BOTON_ENVIAR_CONFIRMACION}»`);
  });
});

describe("estado y línea de cada envío", () => {
  it("ENVIADO verde, FALLIDO rojo; un estado desconocido sale tal cual, sin verde", () => {
    expect(estadoCorreoUi("ENVIADO").label).toBe("Enviado");
    expect(estadoCorreoUi("ENVIADO").cls).toContain("green");
    expect(estadoCorreoUi("FALLIDO").label).toBe("No se envió");
    expect(estadoCorreoUi("FALLIDO").cls).toContain("destructive");
    expect(estadoCorreoUi("EN_COLA")).toEqual({
      label: "EN_COLA",
      cls: expect.not.stringContaining("green"),
    });
    expect(estadoCorreoUi(null).label).toBe("—");
  });

  it("«Enviado el DD/MM/AAAA, h:mm por <quién> a <correo>» en hora Cancún", () => {
    expect(lineaEnvio(correo())).toMatch(
      /^Enviado el 09\/11\/2026, 10:40 a\.\s?m\. por Itzel a ana@x\.com$/,
    );
    // 01:30 UTC del 10 = 20:30 del 9 en Cancún: el día es el de Cancún.
    expect(lineaEnvio(correo({ created_at: "2026-11-10T01:30:00Z" }))).toMatch(
      /^Enviado el 09\/11\/2026, 8:30 p\.\s?m\. por Itzel a ana@x\.com$/,
    );
  });

  it("sin nombre (o si llegara un uuid) se omite el «por …»: nunca un id", () => {
    const sinNombre = lineaEnvio(correo({ enviado_por_nombre: null }));
    expect(sinNombre).toMatch(/^Enviado el 09\/11\/2026, 10:40 a\.\s?m\. a ana@x\.com$/);
    expect(lineaEnvio(correo({ enviado_por_nombre: VUELO }))).toBe(sinNombre);
    expect(lineaEnvio(correo({ enviado_por_nombre: "   " }))).toBe(sinNombre);
  });

  it("un FALLIDO lo dice desde la primera palabra y trae su motivo", () => {
    const fallido = correo({ estado: "FALLIDO", error: "Mailbox does not exist" });
    expect(lineaEnvio(fallido)).toMatch(
      /^No se envió: intento del 09\/11\/2026, 10:40 a\.\s?m\. por Itzel a ana@x\.com$/,
    );
    expect(textoErrorCorreo(fallido)).toBe("Motivo: Mailbox does not exist");
    expect(textoErrorCorreo(correo({ estado: "FALLIDO", error: null }))).toBe(
      "Motivo: el servicio de correo no dio más detalle.",
    );
    // Un ENVIADO no tiene motivo aunque el campo trajera algo.
    expect(textoErrorCorreo(correo({ error: "ruido" }))).toBeNull();
  });

  it("resumen: sin envíos, con envíos, con fallidos y SOLO fallidos (no le llegó nada)", () => {
    expect(textoResumenCorreos([])).toBe(TEXTO_SIN_CORREOS);
    expect(textoResumenCorreos([correo()])).toBe("Se le ha enviado 1 correo al cliente.");
    expect(textoResumenCorreos([correo(), correo()])).toBe("Se le han enviado 2 correos al cliente.");
    const fallido = correo({ estado: "FALLIDO" });
    expect(textoResumenCorreos([correo(), fallido])).toBe(
      "Se le ha enviado 1 correo al cliente. Otro intento falló.",
    );
    expect(textoResumenCorreos([correo(), fallido, fallido])).toBe(
      "Se le ha enviado 1 correo al cliente. Otros 2 intentos fallaron.",
    );
    expect(textoResumenCorreos([fallido])).toBe(
      "Al cliente no le ha llegado ningún correo: el único intento falló.",
    );
    expect(textoResumenCorreos([fallido, fallido])).toBe(
      "Al cliente no le ha llegado ningún correo: los 2 intentos fallaron.",
    );
    expect(contarCorreos([correo(), fallido, fallido])).toEqual({ enviados: 1, fallidos: 2 });
  });

  it("De / Para / tipo / folio", () => {
    expect(textoRemitente("VuelaTour <notificaciones@vuelatour.com>")).toBe(
      "VuelaTour <notificaciones@vuelatour.com>",
    );
    expect(textoRemitente(null)).toBe("—");
    expect(textoDestinatario("ana@x.com", "Ana Ruiz")).toBe("ana@x.com (Ana Ruiz)");
    expect(textoDestinatario("ana@x.com", null)).toBe("ana@x.com");
    expect(textoDestinatario(null, "Ana Ruiz")).toBe("—");
    expect(etiquetaTipoCorreo("CONFIRMACION_VUELO")).toBe("Confirmación del vuelo");
    expect(etiquetaTipoCorreo("RECORDATORIO")).toBe("RECORDATORIO");
    expect(folioTexto(412)).toBe("#412");
    expect(folioTexto(null)).toBe("—");
    expect(hrefVueloDeCorreo(correo())).toBe(`/admin/flights/${VUELO}`);
    expect(nombreLimpio("  Itzi   Canales ")).toBe("Itzi Canales");
    expect(nombreLimpio(USUARIO)).toBeNull();
  });
});

describe("vista previa: por qué no se puede y el reenvío", () => {
  it("manda el `motivo` del API; sin él, el texto del código; sin nada, uno genérico", () => {
    expect(motivoNoEnviable({ codigo: "SIN_EMAIL", motivo: " El cliente Ana no tiene correo. " })).toBe(
      "El cliente Ana no tiene correo.",
    );
    expect(motivoNoEnviable({ codigo: "SIN_EMAIL", motivo: null })).toMatch(/no tiene correo capturado/);
    expect(motivoNoEnviable({ codigo: "SIN_CLIENTE" })).toMatch(/no tiene cliente/);
    expect(motivoNoEnviable({ codigo: "ESTADO_NO_CONFIRMADO" })).toMatch(/confirmado o en reserva/);
    expect(motivoNoEnviable({ codigo: "CORREO_APAGADO" })).toMatch(/apagado/);
    expect(motivoNoEnviable({ codigo: "OTRO_NUEVO" })).toBe("Por ahora no se puede enviar este correo.");
    expect(motivoNoEnviable(null)).toBe("Por ahora no se puede enviar este correo.");
  });

  it("con un ENVIADO previo el botón dice «Enviar otra vez»", () => {
    expect(esReenvio({ enviados: 0 })).toBe(false);
    expect(esReenvio({ enviados: 1 })).toBe(true);
    expect(esReenvio(null)).toBe(false);
    expect(textoBotonEnviar(false)).toBe("Enviar correo");
    expect(textoBotonEnviar(true)).toBe("Enviar otra vez");
  });

  it("aviso ámbar: «Ya se envió el … por …. ¿Enviarlo otra vez?»", () => {
    const ultimo = {
      created_at: "2026-11-09T15:40:00Z",
      enviado_por_nombre: "Itzel",
      destinatario: "ana@x.com",
    };
    expect(avisoReenvio(ultimo, 1)).toMatch(
      /^Ya se envió el 09\/11\/2026, 10:40 a\.\s?m\. por Itzel a ana@x\.com\. ¿Enviarlo otra vez\?$/,
    );
    expect(avisoReenvio(ultimo, 3)).toMatch(
      /^Ya se envió 3 veces; la última, el 09\/11\/2026, 10:40 a\.\s?m\. por Itzel a ana@x\.com\. ¿Enviarlo otra vez\?$/,
    );
    expect(avisoReenvio({ ...ultimo, enviado_por_nombre: null }, 1)).toMatch(
      /^Ya se envió el 09\/11\/2026, 10:40 a\.\s?m\. a ana@x\.com\. ¿Enviarlo otra vez\?$/,
    );
    // Sin el dato del último envío no se inventa una fecha.
    expect(avisoReenvio(null, 2)).toBe("Este correo ya se le envió al cliente. ¿Enviarlo otra vez?");
  });

  it("`details.ultimo_envio` del 409 se lee sin confiar en la forma", () => {
    expect(
      ultimoEnvioDeDetalles({
        ultimo_envio: { created_at: "2026-11-09T15:40:00Z", enviado_por_nombre: "Itzel", destinatario: "ana@x.com" },
      }),
    ).toEqual({ created_at: "2026-11-09T15:40:00Z", enviado_por_nombre: "Itzel", destinatario: "ana@x.com" });
    expect(ultimoEnvioDeDetalles({ ultimo_envio: { created_at: 5 } })).toBeNull();
    expect(ultimoEnvioDeDetalles({})).toBeNull();
    expect(ultimoEnvioDeDetalles(null)).toBeNull();
    expect(ultimoEnvioDeDetalles("x")).toBeNull();
  });
});

describe("resultadoEnvio: qué pasó al pulsar «Enviar correo»", () => {
  it("200 enviado:true ⇒ el mensaje del API (toast verde)", () => {
    expect(
      resultadoEnvio({ ok: true, data: { enviado: true, mensaje: "Correo enviado a ana@x.com", correo: correo() } }),
    ).toEqual({ tipo: "enviado", mensaje: "Correo enviado a ana@x.com" });
    expect(resultadoEnvio({ ok: true, data: { enviado: true, mensaje: " ", correo: null } })).toEqual({
      tipo: "enviado",
      mensaje: MENSAJE_ENVIADO_DEFAULT,
    });
  });

  it("200 enviado:false ⇒ FALLIDO con el mensaje del API y su motivo", () => {
    expect(
      resultadoEnvio({
        ok: true,
        data: {
          enviado: false,
          mensaje: "No se pudo enviar el correo.",
          correo: correo({ estado: "FALLIDO", error: "Dominio no verificado" }),
        },
      }),
    ).toEqual({
      tipo: "fallido",
      mensaje: "No se pudo enviar el correo.",
      motivo: "Motivo: Dominio no verificado",
    });
    expect(resultadoEnvio({ ok: true, data: { enviado: false, mensaje: "", correo: null } })).toEqual({
      tipo: "fallido",
      mensaje: MENSAJE_FALLIDO_DEFAULT,
      motivo: null,
    });
    // Una respuesta 200 sin cuerpo NO se da por enviada.
    expect(resultadoEnvio({ ok: true }).tipo).toBe("fallido");
  });

  it("409 se distingue por `code`, no por el mensaje", () => {
    const ya = resultadoEnvio({
      ok: false,
      status: 409,
      code: "CORREO_YA_ENVIADO",
      error: "cualquier texto",
      details: {
        ultimo_envio: { created_at: "2026-11-09T15:40:00Z", enviado_por_nombre: "Mary", destinatario: "ana@x.com" },
      },
    });
    expect(ya).toEqual({
      tipo: "ya-enviado",
      ultimo: { created_at: "2026-11-09T15:40:00Z", enviado_por_nombre: "Mary", destinatario: "ana@x.com" },
    });

    expect(
      resultadoEnvio({
        ok: false,
        status: 409,
        code: "CORREO_NO_ENVIABLE",
        error: "El cliente no tiene correo capturado.",
        details: { codigo: "SIN_EMAIL" },
      }),
    ).toEqual({ tipo: "no-enviable", mensaje: "El cliente no tiene correo capturado." });
    // Sin mensaje legible cae al texto del código.
    const sinTexto = resultadoEnvio({
      ok: false,
      status: 409,
      code: "CORREO_NO_ENVIABLE",
      error: "",
      details: { codigo: "ESTADO_NO_CONFIRMADO" },
    });
    expect(sinTexto.tipo).toBe("no-enviable");
    expect(sinTexto).toMatchObject({ mensaje: expect.stringMatching(/confirmado o en reserva/) });

    // Mismo mensaje con OTRO code: no se trata como reenvío.
    expect(
      resultadoEnvio({ ok: false, status: 409, code: "MES_CERRADO", error: "cualquier texto" }),
    ).toEqual({ tipo: "error", mensaje: "cualquier texto" });
  });

  it("404 = API sin desplegar; 401/403 = sin permiso", () => {
    expect(resultadoEnvio({ ok: false, status: 404, error: "Cannot POST /v1/quotes/x/correo-confirmacion" })).toEqual({
      tipo: "error",
      mensaje: MENSAJE_ENVIO_NO_DISPONIBLE,
    });
    expect(resultadoEnvio({ ok: false, status: 403, error: "Forbidden resource" })).toEqual({
      tipo: "error",
      mensaje: MENSAJE_ENVIO_SIN_PERMISO,
    });
  });

  it("5xx o sin respuesta = INCIERTO: no se afirma que no salió", () => {
    expect(resultadoEnvio({ ok: false, status: 502, error: "Bad Gateway" })).toEqual({
      tipo: "error",
      mensaje: MENSAJE_ENVIO_INCIERTO,
    });
    expect(resultadoEnvio({ ok: false, error: "fetch failed" })).toEqual({
      tipo: "error",
      mensaje: MENSAJE_ENVIO_INCIERTO,
    });
    expect(resultadoEnvio(null)).toEqual({ tipo: "error", mensaje: MENSAJE_ENVIO_INCIERTO });
  });

  it("la vista previa que no cargó nunca dice que se envió algo", () => {
    expect(errorVistaPrevia({ status: 404 })).toBe(MENSAJE_ENVIO_NO_DISPONIBLE);
    expect(errorVistaPrevia({ status: 403 })).toBe(MENSAJE_VISTA_PREVIA_SIN_PERMISO);
    expect(errorVistaPrevia({ status: 502 })).toBe(MENSAJE_VISTA_PREVIA_ERROR);
    expect(errorVistaPrevia(null)).toBe(MENSAJE_VISTA_PREVIA_ERROR);
    expect(MENSAJE_VISTA_PREVIA_ERROR).toContain("No se envió nada");
  });
});

describe("pantalla «Correos enviados»", () => {
  it("`?desde=&hasta=`: solo días que existen; lo inválido se ignora y el rango invertido se corrige", () => {
    expect(rangoCorreosDeUrl({ desde: "2026-11-01", hasta: "2026-11-09" })).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-09",
    });
    expect(rangoCorreosDeUrl({ desde: "2026-11-09", hasta: "2026-11-01" })).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-09",
    });
    expect(rangoCorreosDeUrl({ desde: "2026-13-45", hasta: "nada" })).toEqual({
      desde: undefined,
      hasta: undefined,
    });
    // Un ISO completo NO viaja: el API solo acepta AAAA-MM-DD (respondería 400).
    expect(rangoCorreosDeUrl({ desde: "2026-11-01T00:00:00Z" }).desde).toBeUndefined();
    // Next entrega listas cuando el parámetro se repite: vale el primero.
    expect(rangoCorreosDeUrl({ desde: ["2026-11-01", "2026-11-05"] }).desde).toBe("2026-11-01");
    expect(rangoCorreosDeUrl({})).toEqual({ desde: undefined, hasta: undefined });
    expect(hayRangoCorreos({})).toBe(false);
    expect(hayRangoCorreos({ hasta: "2026-11-09" })).toBe(true);
  });

  it("conteo, periodo (con el rango EFECTIVO del API) y aviso de truncado", () => {
    expect(textoConteoCorreos(1)).toBe("1 correo");
    expect(textoConteoCorreos(12)).toBe("12 correos");
    expect(textoPeriodoCorreos({ desde: "2026-08-11", hasta: "2026-11-09" }, false)).toBe(
      "Últimos 90 días (del 11/08/2026 al 09/11/2026)",
    );
    expect(textoPeriodoCorreos({ desde: "2026-11-01", hasta: "2026-11-09" }, true)).toBe(
      "Del 01/11/2026 al 09/11/2026",
    );
    expect(textoPeriodoCorreos({}, false)).toBe("Últimos 90 días");
    expect(textoPeriodoCorreos({ desde: "2026-11-01" }, true)).toBe("Desde el 01/11/2026");
    expect(textoTruncado(200)).toBe(
      "Se muestran los 200 correos más recientes del periodo, pero hay más. Elige un periodo más corto para ver los demás.",
    );
  });

  it("la búsqueda alcanza folio, cliente, correo, asunto, quién y estado (nunca un uuid)", () => {
    const texto = textoBusquedaCorreo(correo());
    for (const parte of ["#412", "Ana Ruiz", "ana@x.com", "Vuelo confirmado", "Itzel", "Enviado"]) {
      expect(texto).toContain(parte);
    }
    expect(texto).not.toContain(VUELO);
    expect(texto).not.toContain(USUARIO);
  });
});
