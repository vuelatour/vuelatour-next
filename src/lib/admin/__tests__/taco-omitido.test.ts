/**
 * Tacómetro OMITIDO por tramo (15-oct-2026, API 0.0.81): textos CONGELADOS
 * y predicados de UI de `lib/admin/taco-omitido.ts` (fuente única).
 */
import { describe, expect, it } from "vitest";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import {
  ACCION_COMPLETAR_VUELO,
  ACCION_INICIAR_Y_COMPLETAR,
  AYUDA_CHIPS_MOTIVO,
  AYUDA_OMITIR_TACO,
  BADGE_OMITIDO_CORTO,
  BADGE_TACO_OMITIDO,
  BOTON_CONFIRMAR_DESHACER,
  BOTON_CONFIRMAR_OMITIR,
  BOTON_DESHACER_OMISION,
  BOTON_DESHACIENDO,
  BOTON_OMITIENDO,
  BOTON_OMITIR_TACO,
  CONSECUENCIAS_OMITIR,
  DESCRIPCION_DESHACER_OMISION,
  DESCRIPCION_INICIAR_Y_COMPLETAR,
  ERROR_API_PREVIO_OMITIR,
  ERROR_MOTIVO_CORTO,
  ETIQUETA_MOTIVO_OMISION,
  MOTIVO_OMISION_MAX,
  MOTIVO_OMISION_MIN,
  MOTIVOS_OMISION_FRECUENTES,
  NOTA_TRAMO_OMITIDO,
  PLACEHOLDER_MOTIVO_OMISION,
  ROLES_OMITIR_TACO,
  TITULO_BADGE_LISTA_OMITIDO,
  TOAST_OMISION_DESHECHA,
  TOAST_OMITIDO,
  TOAST_OMITIDO_FALTAN,
  TOAST_VUELO_COMPLETADO,
  completableConOmision,
  contadorMotivo,
  descripcionCompletarConOmision,
  errorDeOmision,
  errorIniciadoSinCompletar,
  esRolOmitirTaco,
  esTramoOmitido,
  escalaLiveOmitida,
  faltaTacoSinOmitidos,
  largoMotivoOmision,
  mensajeOmision,
  motivoOmisionValido,
  motivoTramoOmitidoPreCierre,
  puedeOmitirTaco,
  textoOmitidoPor,
  tituloBadgeOmitido,
  tituloCompletarConOmision,
  tituloDeshacer,
  tituloIniciarYCompletar,
  tituloOmitir,
  toastOmitidoCompletable,
  toastOmitidoIniciar,
  tramoExigeLlegada,
  tramoOmitible,
} from "../taco-omitido";

/** 15:40 UTC = 10:40 en Cancún (UTC−5, sin horario de verano). */
const AT = "2026-10-15T15:40:00Z";

describe("textos congelados", () => {
  it("roles, límites y motivos frecuentes", () => {
    expect(ROLES_OMITIR_TACO).toEqual(["ADMIN", "COORDINADOR", "FACTURACION"]);
    expect(MOTIVO_OMISION_MIN).toBe(10);
    expect(MOTIVO_OMISION_MAX).toBe(500);
    expect(MOTIVOS_OMISION_FRECUENTES).toEqual([
      "Falló el tacómetro",
      "Lectura ilegible y sin forma de recuperarla",
      "No se tomó la foto",
    ]);
  });

  it("botón, ayuda y diálogo de omisión", () => {
    expect(BOTON_OMITIR_TACO).toBe("Omitir tacómetro");
    expect(AYUDA_OMITIR_TACO).toBe(
      "No hubo forma de capturar la lectura (falló el tacómetro, foto ilegible…): el tramo deja de pedirla, aporta 0 h y queda registrado quién y por qué.",
    );
    expect(tituloOmitir("CET → CUN")).toBe("Omitir tacómetro · CET → CUN");
    expect(CONSECUENCIAS_OMITIR).toEqual([
      "El tramo deja de pedir la lectura de llegada: sale de Tacómetros en vivo, de los avisos al piloto y del pre-cierre.",
      "Aporta 0 h al avión y al cierre: el sistema NO inventa ninguna lectura.",
      "Queda registrado quién lo omitió, cuándo y por qué (se ve en el vuelo, en el reporte por vuelo y en el balance).",
      "Si después aparece la lectura real, captúrala: la omisión se retira sola.",
    ]);
    expect(ETIQUETA_MOTIVO_OMISION).toBe("Motivo (obligatorio)");
    expect(PLACEHOLDER_MOTIVO_OMISION).toBe(
      "Ej. Falló el tacómetro; no hubo forma de registrar la llegada",
    );
    expect(AYUDA_CHIPS_MOTIVO).toBe("Motivos frecuentes (puedes editarlos):");
    expect(contadorMotivo(18)).toBe("18/500 · mínimo 10");
    expect(ERROR_MOTIVO_CORTO).toBe("Escribe el motivo (mínimo 10 caracteres).");
    expect(BOTON_CONFIRMAR_OMITIR).toBe("Omitir tacómetro");
    expect(BOTON_OMITIENDO).toBe("Omitiendo…");
  });

  it("tramo omitido: badges, nota y título de la lista", () => {
    expect(BADGE_TACO_OMITIDO).toBe("Tacómetro omitido");
    expect(BADGE_OMITIDO_CORTO).toBe("Omitido");
    expect(NOTA_TRAMO_OMITIDO).toBe(
      "No pide lectura y aporta 0 h. Si al final hay lectura, captúrala con «Corregir» y la omisión se retira sola.",
    );
    expect(TITULO_BADGE_LISTA_OMITIDO).toBe(
      "Tacómetro omitido en algún tramo (sin lectura, con motivo): abre el vuelo para ver el motivo.",
    );
  });

  it("textoOmitidoPor en hora Cancún; sin nombre dice «oficina»", () => {
    expect(textoOmitidoPor({ nombre: "Itzi", at: AT, motivo: "Falló el tacómetro" })).toBe(
      "Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro",
    );
    expect(textoOmitidoPor({ nombre: "  ", at: null, motivo: null })).toBe("Omitido por oficina");
  });

  it("deshacer", () => {
    expect(BOTON_DESHACER_OMISION).toBe("Deshacer");
    expect(tituloDeshacer("CET → CUN")).toBe("Deshacer la omisión · CET → CUN");
    expect(DESCRIPCION_DESHACER_OMISION).toBe(
      "El tramo vuelve a pedir su lectura de llegada (el piloto recibe un aviso). Si el vuelo estaba COMPLETADO, regresa a EN VUELO hasta que se capture. Queda registrado quién lo deshizo.",
    );
    expect(BOTON_CONFIRMAR_DESHACER).toBe("Deshacer la omisión");
    expect(BOTON_DESHACIENDO).toBe("Deshaciendo…");
  });

  it("toasts", () => {
    expect(TOAST_OMITIDO).toBe("Tacómetro omitido: el tramo ya no pide lectura (aporta 0 h).");
    expect(TOAST_OMITIDO_FALTAN).toBe("Tacómetro omitido. Aún faltan lecturas en otros tramos.");
    expect(toastOmitidoCompletable(300)).toBe(
      "Tacómetro omitido. El vuelo #300 ya se puede completar.",
    );
    expect(toastOmitidoIniciar(301)).toBe(
      "Tacómetro omitido. El vuelo #301 nunca se inició en la app: inícialo y complétalo.",
    );
    expect(ACCION_COMPLETAR_VUELO).toBe("Completar vuelo");
    expect(ACCION_INICIAR_Y_COMPLETAR).toBe("Iniciar y completar");
    expect(TOAST_OMISION_DESHECHA).toBe(
      "Omisión deshecha: el tramo vuelve a pedir su lectura (el piloto recibió un aviso).",
    );
    expect(TOAST_VUELO_COMPLETADO(300)).toBe("Vuelo #300 completado");
    expect(ERROR_API_PREVIO_OMITIR).toBe(
      "Esta opción necesita el API 0.0.81 (omitir tacómetro). Avisa a sistemas.",
    );
  });

  it("barra de acciones: completar e iniciar y completar", () => {
    expect(tituloCompletarConOmision(300)).toBe("¿Completar vuelo #300?");
    expect(descripcionCompletarConOmision(1)).toBe(
      "1 tramo con tacómetro OMITIDO (sin lectura, 0 h) y el resto con su llegada. Al completarlo entra al cierre con las horas que sí se capturaron.",
    );
    expect(descripcionCompletarConOmision(2)).toMatch(/^2 tramos con tacómetro OMITIDO/);
    expect(tituloIniciarYCompletar(301)).toBe("¿Iniciar y completar el vuelo #301?");
    expect(DESCRIPCION_INICIAR_Y_COMPLETAR).toBe(
      "Este vuelo nunca se inició en la app. Se marcará EN VUELO y, enseguida, COMPLETADO con las horas que sí se capturaron.",
    );
    expect(errorIniciadoSinCompletar("Faltan llegadas")).toBe(
      "El vuelo ya quedó EN VUELO, pero no se pudo completar: Faltan llegadas. Pulsa «Completar vuelo».",
    );
    expect(errorIniciadoSinCompletar("Bad Gateway")).toBe(
      "El vuelo ya quedó EN VUELO, pero no se pudo completar: el servidor no respondió. Pulsa «Completar vuelo».",
    );
  });

  it("pre-cierre: motivo del tramo omitido", () => {
    expect(
      motivoTramoOmitidoPreCierre({
        omitido_por_nombre: "Itzi",
        omitido_at: AT,
        motivo: "Falló el tacómetro",
      }),
    ).toBe("Omitido por Itzi (15 oct, 10:40 a.m.): Falló el tacómetro");
    expect(motivoTramoOmitidoPreCierre({})).toBe("Omitido por oficina: sin motivo");
  });
});

describe("tituloBadgeOmitido", () => {
  it("una línea por tramo omitido, numerado por POSICIÓN entre los vivos", () => {
    const t = tituloBadgeOmitido([
      { orden: 100, origen_iata: "PTU", destino_iata: "CUN", taco_omitido_at: AT, taco_omitido_por_nombre: "Itzi", taco_omitido_motivo: "No se tomó la foto" },
      { orden: 1, origen_iata: "CET", destino_iata: "PTU", taco_omitido_at: AT, taco_omitido_por_nombre: "Itzi", taco_omitido_motivo: "Falló el tacómetro" },
      { orden: 2, origen_iata: "X", destino_iata: "Y", cancelada_at: AT },
    ]);
    expect(t).toBe(
      "T1 CET → PTU: Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro\n" +
        "T2 PTU → CUN: Omitido por Itzi · 15 oct 2026, 10:40 a.m. · No se tomó la foto",
    );
  });
});

describe("predicados", () => {
  const vivo = { cancelada_at: null, taco_salida: null, taco_llegada: null, taco_omitido_at: null };
  const omitido = { ...vivo, taco_omitido_at: AT };
  const conLlegada = { ...vivo, taco_salida: "4455.10", taco_llegada: "4455.30" };
  const propio = (estado: string) => ({ estado, es_externo: false });

  it("esTramoOmitido / tramoExigeLlegada", () => {
    expect(esTramoOmitido(omitido)).toBe(true);
    expect(esTramoOmitido(vivo)).toBe(false);
    expect(esTramoOmitido({})).toBe(false);
    expect(tramoExigeLlegada(vivo)).toBe(true);
    expect(tramoExigeLlegada(omitido)).toBe(false);
    expect(tramoExigeLlegada(conLlegada)).toBe(false);
    expect(tramoExigeLlegada({ ...vivo, cancelada_at: AT })).toBe(false);
  });

  it("motivo: largo como lo cuenta el API (espacios no cuentan)", () => {
    expect(largoMotivoOmision("  Falló   el  tacómetro ")).toBe(18);
    expect(motivoOmisionValido("123456789")).toBe(false);
    expect(motivoOmisionValido("1234567890")).toBe(true);
    expect(motivoOmisionValido(" ".repeat(12))).toBe(false);
    expect(motivoOmisionValido("x".repeat(501))).toBe(false);
  });

  it("puedeOmitirTaco: solo oficina, vuelo propio vivo y tramo vivo sin llegada", () => {
    const base = { rol: "FACTURACION", escala: vivo, vuelo: propio("EN_VUELO") };
    expect(puedeOmitirTaco(base)).toBe(true);
    expect(puedeOmitirTaco({ ...base, rol: "ADMIN" })).toBe(true);
    expect(puedeOmitirTaco({ ...base, rol: "COORDINADOR" })).toBe(true);
    expect(puedeOmitirTaco({ ...base, rol: "PILOTO" })).toBe(false);
    expect(puedeOmitirTaco({ ...base, rol: null })).toBe(false);
    expect(puedeOmitirTaco({ ...base, escala: { ...vivo, cancelada_at: AT } })).toBe(false);
    expect(puedeOmitirTaco({ ...base, escala: conLlegada })).toBe(false);
    expect(puedeOmitirTaco({ ...base, escala: omitido })).toBe(false);
    expect(puedeOmitirTaco({ ...base, vuelo: { estado: "EN_VUELO", es_externo: true } })).toBe(false);
    expect(puedeOmitirTaco({ ...base, vuelo: propio("COMPLETADO") })).toBe(false);
    expect(puedeOmitirTaco({ ...base, vuelo: propio("CANCELADO") })).toBe(false);
    // Nunca iniciado en la app (#301): sí se puede omitir.
    expect(puedeOmitirTaco({ ...base, vuelo: propio("CONFIRMADO") })).toBe(true);
  });

  it("esRolOmitirTaco / tramoOmitible (la card recibe el permiso ya resuelto)", () => {
    expect(esRolOmitirTaco("ADMIN")).toBe(true);
    expect(esRolOmitirTaco("SOCIO")).toBe(false);
    expect(esRolOmitirTaco(undefined)).toBe(false);
    expect(tramoOmitible({ escala: vivo, vuelo: propio("EN_VUELO") })).toBe(true);
    expect(tramoOmitible({ escala: omitido, vuelo: propio("EN_VUELO") })).toBe(false);
  });

  it("escalaLiveOmitida: la llave `omitido` o la fecha", () => {
    expect(escalaLiveOmitida({ omitido: true })).toBe(true);
    expect(escalaLiveOmitida({ taco_omitido_at: AT })).toBe(true);
    expect(escalaLiveOmitida({ omitido: false, taco_omitido_at: null })).toBe(false);
    expect(escalaLiveOmitida({})).toBe(false);
  });

  it("faltaTacoSinOmitidos: un omitido sin salida no falta; sin vivos ⇒ falta", () => {
    expect(faltaTacoSinOmitidos([omitido])).toBe(false);
    expect(faltaTacoSinOmitidos([omitido, conLlegada])).toBe(false);
    expect(faltaTacoSinOmitidos([omitido, vivo])).toBe(true);
    expect(faltaTacoSinOmitidos([{ ...conLlegada, taco_salida: null }])).toBe(true);
    expect(faltaTacoSinOmitidos([])).toBe(true);
    expect(faltaTacoSinOmitidos([{ ...vivo, cancelada_at: AT }])).toBe(true);
  });

  it("completableConOmision", () => {
    expect(completableConOmision(propio("EN_VUELO"), [omitido])).toEqual({
      completable: true,
      requiereIniciar: false,
      omitidos: 1,
    });
    expect(completableConOmision(propio("CONFIRMADO"), [omitido, conLlegada])).toEqual({
      completable: false,
      requiereIniciar: true,
      omitidos: 1,
    });
    expect(completableConOmision(propio("EN_VUELO"), [omitido, vivo])).toEqual({
      completable: false,
      requiereIniciar: false,
      omitidos: 1,
    });
    expect(completableConOmision({ estado: "EN_VUELO", es_externo: true }, [omitido])).toEqual({
      completable: false,
      requiereIniciar: false,
      omitidos: 1,
    });
    // Sin omitidos el estado lo deriva la captura (como siempre).
    expect(completableConOmision(propio("EN_VUELO"), [conLlegada]).completable).toBe(false);
    // El omitido cancelado no cuenta.
    expect(
      completableConOmision(propio("EN_VUELO"), [{ ...omitido, cancelada_at: AT }, conLlegada]),
    ).toEqual({ completable: false, requiereIniciar: false, omitidos: 0 });
    expect(completableConOmision(propio("COMPLETADO"), [omitido])).toEqual({
      completable: false,
      requiereIniciar: false,
      omitidos: 1,
    });
  });

  it("mensajeOmision", () => {
    expect(mensajeOmision({ vuelo: { folio: 300, completable: true, requiere_iniciar: false } }, false, true)).toEqual({
      texto: "Tacómetro omitido. El vuelo #300 ya se puede completar.",
      accion: "completar",
    });
    expect(mensajeOmision({ vuelo: { folio: 301, completable: false, requiere_iniciar: true } }, false, true)).toEqual({
      texto: "Tacómetro omitido. El vuelo #301 nunca se inició en la app: inícialo y complétalo.",
      accion: "iniciar_y_completar",
    });
    expect(mensajeOmision({ vuelo: { folio: 5, completable: false } }, true, true)).toEqual({
      texto: TOAST_OMITIDO_FALTAN,
      accion: null,
    });
    expect(mensajeOmision({ vuelo: { folio: 5, completable: false } }, false, true)).toEqual({
      texto: TOAST_OMITIDO,
      accion: null,
    });
  });

  it("errorDeOmision: 404 sin ruta ⇒ API previo; técnico ⇒ servidor; si no, el texto del API", () => {
    expect(errorDeOmision({ status: 404, code: "NOT_FOUND", error: "Cannot POST /v1/…" })).toBe(
      ERROR_API_PREVIO_OMITIR,
    );
    expect(errorDeOmision({ status: 404, error: "Not Found" })).toBe(ERROR_API_PREVIO_OMITIR);
    // El 404 DE NEGOCIO (el tramo ya no existe) se dice tal cual.
    expect(
      errorDeOmision({ status: 404, code: "ESCALA_NO_EXISTE", error: "Ese tramo ya no existe (quizá se borró o se reorganizó el vuelo). Recarga la página." }),
    ).toMatch(/^Ese tramo ya no existe/);
    expect(errorDeOmision({ status: 502, error: "Bad Gateway" })).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    expect(errorDeOmision({ code: "PARSE_ERROR", error: "x" })).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    expect(
      errorDeOmision({ status: 409, code: "TACO_PRESENTE", error: "Este tramo ya tiene lectura de llegada (4455.3)." }),
    ).toBe("Este tramo ya tiene lectura de llegada (4455.3).");
  });
});
