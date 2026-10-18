/**
 * Cierre de mes formal (16-oct-2026, API 0.0.88): reglas PURAS del panel.
 * El panel no calcula dinero ni decide qué vuelo pasa de mes: aquí se prueba
 * que copia lo del API, arma los textos es-MX, no miente cuando no pudo leer
 * y que un API previo (llaves ausentes) deja todo como hoy.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_CIERRE_MES,
  TEXTO_CIERRE_API_PREVIO,
  TEXTO_CIERRE_ERROR,
  TEXTO_CIERRE_SIN_MIGRACION,
  badgeEstadoCierre,
  chipsCierreVuelo,
  chipsResumenDiferidos,
  clasificarFalloCierres,
  corteCortoDeDestino,
  diaCortoDeDia,
  decidirRespuestaCerrar,
  deltasReparto,
  diferidosDelAvion,
  etiquetaBotonCerrar,
  fechaCortaCancun,
  folioDiferido,
  hrefReportesMes,
  lineaDiferido,
  lineasLeyendaPreCierre,
  listasDiferidos,
  mensajeErrorCierre,
  mesCierreDe,
  mesCorto,
  mesDeVistaCierre,
  mesEnMinuscula,
  mesesCerrados,
  normalizarCierres,
  normalizarPrevia,
  previaDeDetails,
  puedeCerrarMes,
  puedeConfirmarCierre,
  puedeReabrirMes,
  resumenPrevia,
  textoBadgeCierrePeriodo,
  textoCargaCierres,
  textoCheckboxCerrar,
  textoCobradoPosterior,
  textoConfirmacionReabrir,
  textoDescripcionCerrar,
  textoElegirMesCompleto,
  textoMotivoNoCerrable,
  textoNoCerrableDeMes,
  textoNoCerrableDePrevia,
  textoNoCoincideSnapshot,
  textoToastCerrado,
  textoToastReabierto,
  tituloBloquePasan,
  tituloBloquePasarian,
  tituloBloqueVienen,
  tonoMarcaCierre,
  ultimoDiaCorto,
  validarMotivoReabrir,
} from "@/lib/admin/cierre-mes";
import type { MesCierre, PreviaCierre } from "@/types/cierres";

const SEP_CERRADO: MesCierre = {
  periodo: "2026-09",
  estado: "CERRADO",
  // 16-oct-2026 14:02 Cancún (UTC−5).
  cerrado_at: "2026-10-16T19:02:00Z",
  cerrado_por: { id: "u1", nombre: "Ale" },
  reabierto_at: null,
  reabierto_por: null,
  reabierto_motivo: null,
  version: 1,
  puede_cerrar: false,
  motivo_no_cerrable: "YA_CERRADO",
  totales: { vuelos_diferidos: 5 },
};

/** La previa de septiembre de QA-1 (los 5 de prod, cobrados en octubre). */
const PREVIA_SEP = {
  periodo: "2026-09",
  estado: "ABIERTO",
  listo: true,
  motivo_no_cerrable: null,
  bloqueantes: [],
  vuelos_que_pasan: [
    {
      id: "v316",
      folio: 316,
      clave_cliente: null,
      cliente: "Mike Nelson",
      aeronave: { id: "a1", matricula: "N990GG" },
      fecha_vuelo: "2026-09-25T15:00:00Z",
      venta_usd: 2076.4,
      cobrado_usd: 0,
      por_cobrar_usd: 2076.4,
      cobrado_posterior_usd: 2076.4,
      motivo: "COBRO_POSTERIOR",
      destino: "2026-10",
      leyenda: "Pasa a octubre 2026 · pendiente de cobro: cobrado $0.00 de $2,076.40 USD",
    },
  ],
  vuelos_que_vienen: [],
  totales: {
    vuelos: 91,
    completados: 84,
    cancelados: 7,
    pasan: 5,
    pasan_venta_usd: 16199.76,
    pasan_cobrado_al_corte_usd: 0,
    pasan_por_cobrar_usd: 16199.76,
    pasan_cobrado_posterior_usd: 16199.76,
    pasan_mxn: 128496.06,
    pasan_usd_nativo: 8925.4,
    se_quedan_en_cero: 6,
  },
  reparto: {
    antes: [
      { matricula: "N990GG", saldo_usd: 10000, cobrado_usd: 0, gastos_usd: 0 },
      { matricula: "N58BT", saldo_usd: 500, cobrado_usd: 0, gastos_usd: 0 },
    ],
    despues: [
      { matricula: "N990GG", saldo_usd: 8478.02, cobrado_usd: 0, gastos_usd: 0 },
      { matricula: "N58BT", saldo_usd: 500, cobrado_usd: 0, gastos_usd: 0 },
    ],
  },
};

describe("roles (espejo del @Roles de CierresController)", () => {
  it("cerrar: ADMIN y FACTURACION; reabrir: solo ADMIN", () => {
    expect(puedeCerrarMes("ADMIN")).toBe(true);
    expect(puedeCerrarMes("FACTURACION")).toBe(true);
    expect(puedeCerrarMes("ANALISTA")).toBe(false);
    expect(puedeCerrarMes("SOCIO")).toBe(false);
    expect(puedeReabrirMes("ADMIN")).toBe(true);
    expect(puedeReabrirMes("FACTURACION")).toBe(false);
  });
  it("sin rol (/me falló) se ofrece: el API es el candado", () => {
    expect(puedeCerrarMes(null)).toBe(true);
    expect(puedeReabrirMes(undefined)).toBe(true);
  });
});

describe("meses y fechas es-MX (hora Cancún)", () => {
  it("etiquetas", () => {
    expect(mesEnMinuscula("2026-09")).toBe("septiembre 2026");
    expect(mesCorto("2026-10")).toBe("oct-2026");
    expect(ultimoDiaCorto("2026-09")).toBe("30-sep");
    expect(ultimoDiaCorto("2026-02")).toBe("28-feb");
    expect(etiquetaBotonCerrar("2026-09")).toBe("Cerrar septiembre 2026");
    expect(textoCheckboxCerrar("2026-09")).toBe("Entiendo que septiembre 2026 quedará bloqueado para capturas");
  });
  it("fechaCortaCancun usa el día de Cancún, no el de UTC", () => {
    expect(fechaCortaCancun("2026-10-16T19:02:00Z")).toBe("16-oct-2026");
    // 1-oct 03:00 UTC = 30-sep 22:00 Cancún.
    expect(fechaCortaCancun("2026-10-01T03:00:00Z")).toBe("30-sep-2026");
    expect(fechaCortaCancun(null)).toBe("—");
    expect(fechaCortaCancun("nada")).toBe("—");
  });
  it("hrefReportesMes: el mes completo", () => {
    expect(hrefReportesMes("2026-09")).toBe("/admin/reportes?desde=2026-09-01&hasta=2026-09-30");
    expect(hrefReportesMes("basura")).toBeNull();
  });
  it("diaCortoDeDia: espejo del API (día sin cero; solo un DÍA `YYYY-MM-DD`)", () => {
    expect(diaCortoDeDia("2026-10-04")).toBe("4-oct");
    expect(diaCortoDeDia("2026-10-14")).toBe("14-oct");
    expect(diaCortoDeDia("2026-09-30")).toBe("30-sep");
    // Un timestamp no se recorta: su día Cancún podría ser otro.
    expect(diaCortoDeDia("2026-10-01T03:00:00Z")).toBeNull();
    expect(diaCortoDeDia("2026-13-01")).toBeNull();
    expect(diaCortoDeDia("2026-10-00")).toBeNull();
    expect(diaCortoDeDia("")).toBeNull();
    expect(diaCortoDeDia(null)).toBeNull();
    expect(diaCortoDeDia(undefined)).toBeNull();
  });
  it("corteCortoDeDestino: último día del mes anterior al destino", () => {
    expect(corteCortoDeDestino("2026-10")).toBe("30-sep");
    expect(corteCortoDeDestino("2026-11")).toBe("31-oct");
    expect(corteCortoDeDestino("2026-03")).toBe("28-feb");
    expect(corteCortoDeDestino("2027-01")).toBe("31-dic");
    expect(corteCortoDeDestino("nada")).toBeNull();
    expect(corteCortoDeDestino(null)).toBeNull();
  });
});

describe("mesDeVistaCierre: qué mes evalúa la card", () => {
  const HOY = "2026-10-16";
  it("mes calendario completo pasado", () => {
    expect(mesDeVistaCierre("2026-09-01", "2026-09-30", HOY)).toEqual({ mes: "2026-09", enCurso: false });
  });
  it("«Este mes» (del 1 a hoy) y el mes en curso completo ⇒ en curso", () => {
    expect(mesDeVistaCierre("2026-10-01", "2026-10-16", HOY)).toEqual({ mes: "2026-10", enCurso: true });
    expect(mesDeVistaCierre("2026-10-01", "2026-10-31", HOY)).toEqual({ mes: "2026-10", enCurso: true });
  });
  it("rango parcial o de varios meses ⇒ null (la card guía a «Mes pasado»)", () => {
    expect(mesDeVistaCierre("2026-09-05", "2026-09-30", HOY)).toBeNull();
    expect(mesDeVistaCierre("2026-09-01", "2026-10-16", HOY)).toBeNull();
  });
  it("texto que guía al atajo «Mes pasado · Septiembre 2026»", () => {
    expect(textoElegirMesCompleto(HOY)).toBe("El cierre es por mes completo: elige «Mes pasado · Septiembre 2026».");
    // Con el inicio oficial en octubre, septiembre queda antes: se nombra el selector.
    expect(textoElegirMesCompleto(HOY, "2026-10-01")).toBe(
      "El cierre es por mes completo: elige un mes en el selector de abajo.",
    );
    expect(AYUDA_CIERRE_MES).toMatch(/pasan completos al mes siguiente/);
  });
});

describe("carga de GET /v1/cierres: cada fallo con su texto (skew)", () => {
  it("404 «Cannot GET» = API 0.0.87", () => {
    expect(clasificarFalloCierres(404, null, "Cannot GET /v1/cierres")).toBe("api-previo");
    expect(textoCargaCierres("api-previo")).toBe(TEXTO_CIERRE_API_PREVIO);
  });
  it("503 CIERRE_NO_DISPONIBLE = sin la migración", () => {
    expect(clasificarFalloCierres(503, "CIERRE_NO_DISPONIBLE", "x")).toBe("sin-migracion");
    expect(textoCargaCierres("sin-migracion")).toBe(TEXTO_CIERRE_SIN_MIGRACION);
  });
  it("403 = sin permiso (no se pinta nada); 500/502/red = error", () => {
    expect(clasificarFalloCierres(403, null, "Forbidden")).toBe("sin-permiso");
    expect(textoCargaCierres("sin-permiso")).toBeNull();
    expect(clasificarFalloCierres(500, null, "boom")).toBe("error");
    expect(clasificarFalloCierres(503, "OTRO", "x")).toBe("error");
    expect(clasificarFalloCierres(null, null, null)).toBe("error");
    expect(textoCargaCierres("error")).toBe(TEXTO_CIERRE_ERROR);
  });
});

describe("normalizarCierres / normalizarPrevia (lectura defensiva)", () => {
  it("forma mínima; basura ⇒ null; meses inválidos se descartan", () => {
    expect(normalizarCierres(null)).toBeNull();
    expect(normalizarCierres({ meses: [] })).toBeNull();
    const r = normalizarCierres({
      disponible: true,
      inicio_oficial: "2026-09-01",
      mes_en_curso: "2026-10",
      meses: [SEP_CERRADO, { periodo: "nada" }, { periodo: "2026-10", estado: "RARO" }],
      siguiente_a_cerrar: "2026-10",
    });
    expect(r?.meses.map((m) => m.periodo)).toEqual(["2026-09", "2026-10"]);
    expect(r?.meses[1].estado).toBe("ABIERTO");
    expect(r?.meses[0].cerrado_por).toEqual({ id: "u1", nombre: "Ale" });
    expect(mesCierreDe(r, "2026-09")?.estado).toBe("CERRADO");
    expect(mesCierreDe(r, "2026-08")).toBeNull();
    expect(mesesCerrados(r)).toEqual(["2026-09"]);
  });
  it("disponible:false se conserva (la card lo trata como «sin migración»)", () => {
    expect(normalizarCierres({ disponible: false, meses: [] })?.disponible).toBe(false);
  });
  it("previa: totales ausentes ⇒ 0; listas sin id se descartan; reparto sin `antes` ⇒ null", () => {
    expect(normalizarPrevia({ periodo: "2026-09" })).toBeNull();
    const p = normalizarPrevia({
      periodo: "2026-09",
      listo: false,
      vuelos_que_pasan: [{ id: "x", folio: 1 }, { folio: 2 }, null],
      reparto: { despues: [] },
    });
    expect(p?.vuelos_que_pasan).toHaveLength(1);
    expect(p?.totales.pasan).toBe(0);
    expect(p?.reparto).toBeNull();
    expect(p?.estado).toBe("ABIERTO");
  });
  it("previaDeDetails: el 409 PREVIA_CAMBIO trae la previa nueva (en `previa` o suelta)", () => {
    expect(previaDeDetails({ previa: PREVIA_SEP })?.vuelos_que_pasan[0].folio).toBe(316);
    expect(previaDeDetails(PREVIA_SEP)?.periodo).toBe("2026-09");
    expect(previaDeDetails(null)).toBeNull();
  });
});

describe("badge del estado del mes", () => {
  it("Cerrado el 16-oct-2026 por Ale", () => {
    expect(badgeEstadoCierre(SEP_CERRADO, "2026-09", false)).toEqual({
      tono: "cerrado",
      texto: "Cerrado el 16-oct-2026 por Ale",
    });
  });
  it("En curso (se cierra a partir del 1-nov)", () => {
    expect(badgeEstadoCierre(null, "2026-10", true)).toEqual({
      tono: "en-curso",
      texto: "En curso (se cierra a partir del 1-nov)",
    });
  });
  it("Reabierto con quién y motivo; Abierto sin fila", () => {
    const reab: MesCierre = {
      ...SEP_CERRADO,
      estado: "REABIERTO",
      reabierto_at: "2026-10-17T15:00:00Z",
      reabierto_por: { id: "u1", nombre: "Ale" },
      reabierto_motivo: "corregir T.C.",
    };
    expect(badgeEstadoCierre(reab, "2026-09", false).texto).toBe("Reabierto el 17-oct-2026 por Ale (corregir T.C.)");
    expect(badgeEstadoCierre(null, "2026-09", false)).toEqual({ tono: "abierto", texto: "Abierto" });
  });
});

describe("textos de los 409 (mismos que el API)", () => {
  it("MES_EN_CURSO / MES_ANTERIOR_ABIERTO / YA_CERRADO / PRECIERRE_NO_LISTO", () => {
    // EXACTO `textoMesEnCurso` del API (common/mes-contable.util.ts): el año
    // del mes siguiente solo cuando cambia.
    expect(textoMotivoNoCerrable("MES_EN_CURSO", "2026-10")).toBe(
      "Octubre 2026 todavía está en curso: se cierra a partir del 1 de noviembre.",
    );
    expect(textoMotivoNoCerrable("MES_EN_CURSO", "2026-12")).toBe(
      "Diciembre 2026 todavía está en curso: se cierra a partir del 1 de enero de 2027.",
    );
    expect(textoMotivoNoCerrable("MES_ANTERIOR_ABIERTO", "2026-10")).toBe(
      "Para cerrar octubre 2026 primero cierra septiembre 2026.",
    );
    expect(textoMotivoNoCerrable("YA_CERRADO", "2026-09")).toBe("Septiembre 2026 ya está cerrado.");
    expect(textoMotivoNoCerrable("PRECIERRE_NO_LISTO", "2026-09")).toBe(
      "Antes de cerrar septiembre 2026 resuelve los pendientes que bloquean el pre-cierre.",
    );
    expect(textoMotivoNoCerrable("PERIODO_ANTES_DEL_INICIO", "2026-08")).toBe(
      "Agosto 2026 es anterior al inicio oficial del sistema: no se cierra aquí.",
    );
    expect(textoMotivoNoCerrable(null, "2026-09")).toBeNull();
  });
});

describe("diálogos: toasts, confirmación y motivo", () => {
  it("toasts", () => {
    expect(textoToastCerrado("2026-09", 5, "2026-10")).toBe("Septiembre 2026 cerrado. 5 vuelos pasan a octubre 2026.");
    expect(textoToastCerrado("2026-09", 1, "2026-10")).toBe("Septiembre 2026 cerrado. 1 vuelo pasa a octubre 2026.");
    expect(textoToastCerrado("2026-09", 0, "2026-10")).toBe("Septiembre 2026 cerrado. Ningún vuelo pasa a octubre 2026.");
    expect(textoToastReabierto("2026-09", 5)).toBe("Septiembre 2026 reabierto. 5 vuelos regresan a septiembre 2026.");
    expect(textoToastReabierto("2026-09", 0)).toMatch(/Ningún vuelo regresa/);
  });
  it("confirmación de reabrir (contrato §5.1)", () => {
    expect(textoConfirmacionReabrir("2026-09", 5)).toBe(
      "Al reabrir, los 5 vuelos que pasaron a octubre 2026 regresan a septiembre 2026 y el mes vuelve a aceptar capturas. Octubre 2026 debe estar abierto.",
    );
    expect(textoConfirmacionReabrir("2026-09", 1)).toMatch(/^Al reabrir, el vuelo que pasó a octubre 2026 regresa a/);
    expect(textoConfirmacionReabrir("2026-09", null)).toMatch(/ningún vuelo había pasado/);
  });
  it("motivo 5–300 tras recortar", () => {
    expect(validarMotivoReabrir("  abc ")).toMatch(/al menos 5/);
    expect(validarMotivoReabrir("corregir T.C.")).toBeNull();
    expect(validarMotivoReabrir("x".repeat(301))).toMatch(/300/);
  });
  it("resumen de la previa y antes/después solo de los aviones que cambian", () => {
    const p = normalizarPrevia(PREVIA_SEP) as PreviaCierre;
    expect(resumenPrevia(p)).toBe(
      "91 vuelos: 84 completados y 7 cancelados · 5 pasan a octubre 2026 ($16,199.76 USD por cobrar al 30-sep) · 6 con $0 cierran aquí",
    );
    expect(deltasReparto(p.reparto)).toEqual([
      { matricula: "N990GG", antes: 10000, despues: 8478.02, delta: 8478.02 - 10000 },
    ]);
    expect(deltasReparto(null)).toEqual([]);
  });
});

describe("chips (texto del API; el panel solo elige el color)", () => {
  it("tono por el arranque del texto", () => {
    expect(tonoMarcaCierre("Pasa a octubre 2026 · pendiente de cobro: …")).toBe("pasa");
    expect(tonoMarcaCierre("Pasa a oct-2026")).toBe("pasa");
    expect(tonoMarcaCierre("Viene de septiembre 2026")).toBe("viene");
    expect(tonoMarcaCierre("Pendiente de cobro: pasará a octubre 2026 al cerrar (…)")).toBe("pasaria");
    expect(tonoMarcaCierre("Pasará a noviembre 2026 al cerrar (cobrado $0.00 de $1.00 USD)")).toBe("pasaria");
    expect(tonoMarcaCierre("Cobrado")).toBeNull();
    expect(tonoMarcaCierre("Pasajeros")).toBeNull();
    expect(tonoMarcaCierre(null)).toBeNull();
  });
  it("listas: reparto (diferidos_*) y balances (pasan/vienen/pasarian); API previo ⇒ vacías", () => {
    const r = listasDiferidos({
      disponible: true,
      periodo: "2026-09",
      estado: "CERRADO",
      diferidos_salen: [{ folio: 316, matricula: "N990GG", leyenda: "Pasa a octubre 2026", destino: "2026-10" }],
    });
    expect(r.salen).toHaveLength(1);
    expect(listasDiferidos({ disponible: true, periodo: null, estado: "ABIERTO", vienen: [{ folio: "#316", leyenda: "Viene de septiembre 2026" }] }).entran).toHaveLength(1);
    expect(listasDiferidos(undefined)).toEqual({ salen: [], entran: [], pasarian: [] });
    expect(diferidosDelAvion(r.salen, "N990GG")).toHaveLength(1);
    expect(diferidosDelAvion(r.salen, "N621TX")).toHaveLength(0);
  });
  it("folio: número, texto con o sin #, o la clave", () => {
    expect(folioDiferido({ folio: 316 })).toBe("#316");
    expect(folioDiferido({ folio: "316" })).toBe("#316");
    expect(folioDiferido({ folio: "#316" })).toBe("#316");
    expect(folioDiferido({ folio: null, clave: "#376 · january02 · January Davila" })).toBe("#376");
    expect(folioDiferido({ folio: null })).toBe("vuelo");
    expect(lineaDiferido({ folio: 316, cliente: "Mike Nelson", matricula: "N990GG", venta_usd: 2076.4, leyenda: "" })).toBe(
      "#316 · Mike Nelson · N990GG · $2,076.40 USD",
    );
  });
  it("badge del periodo del reparto: solo con mes calendario (`periodo`)", () => {
    expect(textoBadgeCierrePeriodo({ disponible: true, periodo: null, estado: "ABIERTO" })).toBeNull();
    expect(textoBadgeCierrePeriodo({ disponible: false, periodo: "2026-09", estado: "CERRADO" })).toBeNull();
    expect(
      textoBadgeCierrePeriodo({
        disponible: true,
        periodo: "2026-09",
        estado: "CERRADO",
        cerrado_at: "2026-10-16T19:02:00Z",
        cerrado_por_nombre: "Ale",
      })?.texto,
    ).toBe("Cerrado el 16-oct-2026 por Ale");
    expect(textoNoCoincideSnapshot("2026-10-16T19:02:00Z")).toMatch(/^Los números de hoy no coinciden con el cierre del 16-oct-2026/);
  });
  it("chips del vuelo", () => {
    expect(chipsCierreVuelo(null)).toEqual([]);
    const c = chipsCierreVuelo({ diferido_de: "2026-09", diferido_a: null, mes_cerrado: false, cierre: null });
    expect(c.map((x) => x.texto)).toEqual(["Viene de septiembre 2026"]);
    expect(chipsCierreVuelo({ diferido_de: null, diferido_a: null, mes_cerrado: true, cierre: null })[0].texto).toBe(
      "Mes cerrado",
    );
  });
  it("chips de una línea del libro en pantalla", () => {
    expect(chipsResumenDiferidos(null)).toEqual([]);
    const c = chipsResumenDiferidos({
      disponible: true,
      periodo: "2026-09",
      estado: "CERRADO",
      pasan: [
        { folio: "316", leyenda: "Pasa a octubre 2026", destino: "2026-10" },
        { folio: "337", leyenda: "Pasa a octubre 2026", destino: "2026-10" },
      ],
    });
    expect(c).toEqual([
      {
        tono: "pasa",
        texto: "2 pasan a octubre 2026",
        title: "Sin cobro completo al 30-sep: no suman en este mes (#316, #337).",
      },
    ]);
    expect(
      chipsResumenDiferidos({
        disponible: true,
        periodo: "2026-10",
        estado: "ABIERTO",
        vienen: [{ folio: 316, leyenda: "Viene de septiembre 2026", origen: "2026-09" }],
        pasarian: [{ folio: 388, leyenda: "Pendiente de cobro: …", destino: "2026-11" }],
      }).map((x) => x.texto),
    ).toEqual(["1 viene de septiembre 2026", "1 pasaría a noviembre 2026 al cerrar"]);
  });
});

describe("caso #351: un vuelo que pasa de mes no siempre está por cobrar", () => {
  // Las marcas del API 0.0.91 (mes-contable.util.ts) tal cual.
  const POSTERIOR_CERRADO = "Pasa a octubre 2026 (cobrado después del 30-sep; al cierre: $0.00 MXN de $36,632.89 MXN)";
  const POSTERIOR_PREVIA = "Pasa a octubre 2026 · cobrado el 14-oct, después del 30-sep (al 30-sep: $0.00 de $2,343.20 USD)";
  const POSTERIOR_PASARA = "Pasará a octubre 2026 al cerrar · cobrado el 14-oct, después del 30-sep";
  const PARCIAL_PASARA =
    "Pendiente de cobro: pasará a octubre 2026 al cerrar (al 30-sep: cobrado $500.00 de $2,076.40 USD; después: $500.00 USD)";
  it("las marcas nuevas del API conservan su color (el prefijo no cambió)", () => {
    expect(tonoMarcaCierre(POSTERIOR_CERRADO)).toBe("pasa");
    expect(tonoMarcaCierre(POSTERIOR_PREVIA)).toBe("pasa");
    expect(tonoMarcaCierre(POSTERIOR_PASARA)).toBe("pasaria");
    expect(tonoMarcaCierre(PARCIAL_PASARA)).toBe("pasaria");
  });
  it("títulos del reparto: «sin cobro completo al <corte>», jamás «pendientes de cobro»", () => {
    expect(tituloBloquePasan("2026-10")).toBe("Pasan a octubre 2026 (sin cobro completo al 30-sep, no se reparten)");
    expect(tituloBloquePasarian("2026-11")).toBe("Pasarán a noviembre 2026 al cerrar el mes (sin cobro completo al 31-oct)");
    expect(tituloBloqueVienen("2026-09")).toBe("Vienen de septiembre 2026");
    // Sin destino legible: sin corte, sin inventar.
    expect(tituloBloquePasan(undefined)).toBe("Pasan al mes siguiente (no se reparten)");
    expect(tituloBloquePasan("nada")).toBe("Pasan a nada (no se reparten)");
    expect(tituloBloquePasarian(null)).toBe("Pasarán al mes siguiente al cerrar el mes");
    for (const t of [tituloBloquePasan("2026-10"), tituloBloquePasarian("2026-10"), tituloBloquePasarian(null)]) {
      expect(t).not.toMatch(/pendiente/i);
    }
  });
  it("chips del vuelo: el title dice el corte y no «pendiente de cobro»", () => {
    const c = chipsCierreVuelo({ diferido_de: "2026-09", diferido_a: "2026-11", mes_cerrado: false, cierre: null });
    expect(c).toEqual([
      {
        tono: "viene",
        texto: "Viene de septiembre 2026",
        title: "Sin cobro completo al 30-sep (cierre de septiembre 2026): su dinero cuenta en el mes al que pasó.",
      },
      {
        tono: "pasa",
        texto: "Pasa a noviembre 2026",
        title: "Sin cobro completo al 31-oct: su dinero cuenta en noviembre 2026.",
      },
    ]);
    expect(chipsCierreVuelo({ diferido_de: "nada", diferido_a: null, mes_cerrado: false, cierre: null })[0].title).toBe(
      "Sin cobro completo al cerrar nada: su dinero cuenta en el mes al que pasó.",
    );
  });
  it("chips del libro en pantalla: el corte del API manda; sin él, el del destino", () => {
    const conCorte = chipsResumenDiferidos({
      disponible: true,
      periodo: "2026-10",
      estado: "ABIERTO",
      vienen: [{ folio: 316, leyenda: "Viene de septiembre 2026", origen: "2026-09" }],
      pasarian: [
        {
          folio: 351,
          leyenda: POSTERIOR_PASARA,
          destino: "2026-11",
          motivo: "COBRO_POSTERIOR",
          corte: "2026-10-31",
          cobrado_despues_usd: 2343.2,
          cobrado_despues_mxn: 40000,
          fecha_cobro_despues: "2026-11-04",
        },
      ],
    });
    expect(conCorte.map((x) => x.title)).toEqual([
      "Vuelos de meses anteriores sin cobro completo al cerrar su mes: suman completos aquí (#316).",
      "Sin cobro completo al 31-oct: si el mes se cierra hoy, pasan completos al mes siguiente (#351).",
    ]);
    const sinDestino = chipsResumenDiferidos({
      disponible: true,
      periodo: "2026-09",
      estado: "CERRADO",
      pasan: [{ folio: "316", leyenda: POSTERIOR_CERRADO }],
    });
    expect(sinDestino[0].title).toBe("Sin cobro completo al cierre: no suman en este mes (#316).");
    for (const c of [...conCorte, ...sinDestino]) expect(c.title).not.toMatch(/pendiente/i);
  });
  it("diálogo de cierre: «Cobrado después» con la fecha del cobro (API 0.0.91) o solo el monto", () => {
    expect(textoCobradoPosterior({ cobrado_posterior_usd: 2343.2, fecha_cobro_posterior: "2026-10-14" })).toBe(
      "$2,343.20 USD · el 14-oct",
    );
    // API previo: la llave no viaja ⇒ solo el monto.
    expect(textoCobradoPosterior({ cobrado_posterior_usd: 2076.4 })).toBe("$2,076.40 USD");
    expect(textoCobradoPosterior({ cobrado_posterior_usd: 0, fecha_cobro_posterior: null })).toBe("$0 USD");
    // Una fecha sin cobro posterior no se pinta (no hay nada que fechar).
    expect(textoCobradoPosterior({ cobrado_posterior_usd: 0, fecha_cobro_posterior: "2026-10-14" })).toBe("$0 USD");
    // Un timestamp no se recorta a día (su día Cancún podría ser otro).
    expect(textoCobradoPosterior({ cobrado_posterior_usd: 100, fecha_cobro_posterior: "2026-10-14T05:00:00Z" })).toBe(
      "$100 USD",
    );
  });
  it("descripción del diálogo: la regla tal cual (también los cobrados después)", () => {
    expect(textoDescripcionCerrar("2026-09", "2026-10")).toBe(
      "Al cerrar, septiembre 2026 queda bloqueado para capturas (gastos, cobros, ingresos, caja chica, cotizaciones). Los vuelos que no estén cobrados completos al 30-sep pasan completos a octubre 2026, también los que se cobraron después de esa fecha: su dinero cuenta en ese mes.",
    );
  });
});

describe("pre-cierre: leyenda por vuelo", () => {
  it("una línea por vuelo con leyenda; «y N más» contra el count", () => {
    const vuelos = Array.from({ length: 10 }, (_, i) => ({
      id: `v${i}`,
      folio: 380 + i,
      leyenda: `Pasará a noviembre 2026 al cerrar (cobrado $0.00 de $${i}.00 USD)`,
    }));
    const r = lineasLeyendaPreCierre(vuelos, 12);
    expect(r.lineas).toHaveLength(8);
    expect(r.lineas[0]).toEqual({
      id: "v0",
      folio: "#380",
      texto: "Pasará a noviembre 2026 al cerrar (cobrado $0.00 de $0.00 USD)",
      tono: "pasaria",
    });
    expect(r.restantes).toBe(4);
  });
  it("API previo (sin leyendas) ⇒ ninguna línea: el renglón como siempre", () => {
    expect(lineasLeyendaPreCierre([{ id: "a", folio: 1 }], 1)).toEqual({ lineas: [], restantes: 0 });
    expect(lineasLeyendaPreCierre(null)).toEqual({ lineas: [], restantes: 0 });
  });
});

describe("revisión adversaria (16-oct-2026): el texto del API gana y nada se confirma a ciegas", () => {
  const previa = normalizarPrevia(PREVIA_SEP) as PreviaCierre;

  it("la previa conserva `texto_no_cerrable` del API y el diálogo lo usa tal cual", () => {
    const conTexto = normalizarPrevia({
      ...PREVIA_SEP,
      listo: false,
      motivo_no_cerrable: "PRECIERRE_NO_LISTO",
      texto_no_cerrable: "  Antes de cerrar septiembre 2026 resuelve los pendientes que bloquean el pre-cierre.  ",
    }) as PreviaCierre;
    expect(conTexto.texto_no_cerrable).toBe(
      "Antes de cerrar septiembre 2026 resuelve los pendientes que bloquean el pre-cierre.",
    );
    expect(textoNoCerrableDePrevia(conTexto)).toBe(conTexto.texto_no_cerrable);
    // API sin el texto ⇒ el espejo (mismo texto); sin motivo ⇒ nada.
    expect(textoNoCerrableDePrevia({ ...conTexto, texto_no_cerrable: null })).toBe(conTexto.texto_no_cerrable);
    expect(textoNoCerrableDePrevia(previa)).toBeNull();
    // Un motivo que el panel conoce desde esta revisión ya no se pierde.
    expect(normalizarPrevia({ ...PREVIA_SEP, motivo_no_cerrable: "PERIODO_ANTES_DEL_INICIO" })?.motivo_no_cerrable).toBe(
      "PERIODO_ANTES_DEL_INICIO",
    );
  });

  it("puedeConfirmarCierre: previa leída, lista, sin motivo, no cerrada y con la casilla", () => {
    expect(puedeConfirmarCierre(previa, true)).toBe(true);
    expect(puedeConfirmarCierre(previa, false)).toBe(false);
    expect(puedeConfirmarCierre(null, true)).toBe(false);
    expect(puedeConfirmarCierre({ ...previa, listo: false }, true)).toBe(false);
    expect(puedeConfirmarCierre({ ...previa, motivo_no_cerrable: "MES_ANTERIOR_ABIERTO" }, true)).toBe(false);
    // Otro usuario lo cerró entre la previa y el clic.
    expect(puedeConfirmarCierre({ ...previa, estado: "CERRADO" }, true)).toBe(false);
  });

  it("la card: el código manda y un `puede_cerrar:false` desconocido igual deshabilita", () => {
    const abierto = { estado: "ABIERTO" as const, puede_cerrar: true, motivo_no_cerrable: null };
    expect(textoNoCerrableDeMes(abierto, "2026-09", false)).toBeNull();
    expect(textoNoCerrableDeMes(abierto, "2026-10", true)).toBe(
      "Octubre 2026 todavía está en curso: se cierra a partir del 1 de noviembre.",
    );
    expect(
      textoNoCerrableDeMes({ ...abierto, puede_cerrar: false, motivo_no_cerrable: "MES_ANTERIOR_ABIERTO" }, "2026-10", false),
    ).toBe("Para cerrar octubre 2026 primero cierra septiembre 2026.");
    expect(textoNoCerrableDeMes({ ...abierto, puede_cerrar: false }, "2026-10", false)).toBe(
      "Octubre 2026 todavía no se puede cerrar.",
    );
    expect(textoNoCerrableDeMes(SEP_CERRADO, "2026-09", false)).toBeNull();
  });

  it("mensajeErrorCierre: el message del API tal cual; lo técnico o sin respuesta pide RECARGAR antes de reintentar", () => {
    const yaCerrado = { ok: false, status: 409, code: "YA_CERRADO", error: "Septiembre 2026 ya está cerrado." };
    expect(mensajeErrorCierre(yaCerrado, "cerrar", "2026-09")).toBe("Septiembre 2026 ya está cerrado.");
    const incompleto = {
      ok: false,
      status: 500,
      code: "CIERRE_INCOMPLETO",
      error:
        "No se pudo terminar el cierre de septiembre 2026: x. No se movió ningún vuelo y el mes quedó abierto; vuelve a intentarlo.",
    };
    expect(mensajeErrorCierre(incompleto, "cerrar", "2026-09")).toBe(incompleto.error);
    const recargar = "No hubo respuesta del servidor. Recarga la página para ver si septiembre 2026 quedó cerrado antes de volver a intentarlo.";
    expect(mensajeErrorCierre({ ok: false, code: "SIN_CONEXION" }, "cerrar", "2026-09")).toBe(recargar);
    expect(mensajeErrorCierre({ ok: false, status: 502, code: "PARSE_ERROR", error: "Bad Gateway" }, "cerrar", "2026-09")).toBe(
      recargar,
    );
    expect(
      mensajeErrorCierre({ ok: false, status: 500, code: "INTERNAL", error: "Internal server error" }, "reabrir", "2026-09"),
    ).toBe("No hubo respuesta del servidor. Recarga la página para ver si septiembre 2026 quedó reabierto antes de volver a intentarlo.");
    expect(mensajeErrorCierre({ ok: false, error: "" }, "cerrar", "2026-09")).toBe(recargar);
    // 403 del RolesGuard (texto en inglés) ⇒ es-MX por acción.
    const prohibido = { ok: false, status: 403, code: "FORBIDDEN", error: "Required role: ADMIN" };
    expect(mensajeErrorCierre(prohibido, "reabrir", "2026-09")).toBe("Solo un administrador puede reabrir un mes.");
    expect(mensajeErrorCierre(prohibido, "cerrar", "2026-09")).toMatch(/administración y facturación/);
    // Skew: API 0.0.87 (404 «Cannot POST») y API sin migración (503).
    expect(mensajeErrorCierre({ ok: false, status: 404, code: "NOT_FOUND", error: "Cannot POST /v1/cierres/2026-09" }, "cerrar", "2026-09")).toBe(
      TEXTO_CIERRE_API_PREVIO,
    );
    expect(mensajeErrorCierre({ ok: false, status: 503, code: "CIERRE_NO_DISPONIBLE", error: "x" }, "cerrar", "2026-09")).toBe(
      TEXTO_CIERRE_SIN_MIGRACION,
    );
  });

  it("decidirRespuestaCerrar: éxito con el conteo real, PREVIA_CAMBIO repinta, lo demás es error con texto claro", () => {
    expect(decidirRespuestaCerrar({ ok: true, data: { diferidos: [{}, {}, {}, {}, {}] } }, "2026-09")).toEqual({
      tipo: "exito",
      diferidos: 5,
    });
    expect(decidirRespuestaCerrar({ ok: true, data: {} }, "2026-09")).toEqual({ tipo: "exito", diferidos: 0 });
    const cambio = decidirRespuestaCerrar(
      { ok: false, status: 409, code: "PREVIA_CAMBIO", error: "La lista cambió…", details: { previa: PREVIA_SEP } },
      "2026-09",
    );
    expect(cambio.tipo).toBe("previa_nueva");
    expect(cambio.tipo === "previa_nueva" && cambio.previa.vuelos_que_pasan.map((v) => v.id)).toEqual(["v316"]);
    // PREVIA_CAMBIO sin previa legible ⇒ el texto del API (nunca un diálogo vacío).
    expect(
      decidirRespuestaCerrar({ ok: false, status: 409, code: "PREVIA_CAMBIO", error: "La lista cambió…", details: {} }, "2026-09"),
    ).toEqual({ tipo: "error", texto: "La lista cambió…" });
    // ok sin data (respuesta vacía) NO es éxito: no se pinta «cerrado» sin confirmación del API.
    expect(decidirRespuestaCerrar({ ok: true, data: null }, "2026-09").tipo).toBe("error");
  });
});
