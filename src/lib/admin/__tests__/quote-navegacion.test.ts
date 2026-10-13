/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» entre cotizaciones (24-sep-2026,
 * pedido de Itzi). Qué vuelo es el vecino lo decide el API; aquí se congela lo
 * del panel: qué filtros de la lista viajan (validados igual que la lista),
 * cómo se escriben en la URL, los textos y cuándo ←/→ es un atajo.
 *
 * RANGO de fechas de la lista (13-oct-2026): validación sin recorte a hoy,
 * periodos rápidos, textos, el detector del API previo y las reglas PURAS del
 * borrador del campo date.
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_GRUPO_FECHAS,
  FILTROS_LISTA,
  MSG_RANGO_API_VIEJO,
  MSG_SIN_FECHA,
  Q_MAX,
  TITULO_FECHA_VUELO,
  direccionDeTecla,
  esApiSinRangoFechas,
  filtrosListaDeParams,
  hayRangoLista,
  hrefCotizacion,
  hrefListaCotizaciones,
  notaRangoCotizaciones,
  pasoAlSalirCampoFecha,
  pasoCampoFecha,
  periodosRapidosCotizaciones,
  qsFiltrosLista,
  rangoAlCambiarCampo,
  rangoDeFiltros,
  rangoListaCotizaciones,
  sinRango,
  subtituloFlechaApagada,
  textoCortoVecino,
  textoEncabezadoCotizaciones,
  textoRangoCotizaciones,
  textoVacioCotizaciones,
  textoVecino,
  tituloFlecha,
  valorVisibleCampoFecha,
  type ContextoFoco,
  type FiltrosListaCotizaciones,
  type TeclaPulsada,
} from "../quote-navegacion";
import { ApiError } from "@/lib/api/errors";
import { fmtDateOnly } from "@/lib/datetime";
import type { QuoteVecino } from "@/types/quote-vecinos";

const CLIENTE = "cccccccc-0000-4000-8000-000000000001";
const GRUPO = "dddddddd-0000-4000-8000-000000000001";
const ID = "bbbbbbbb-0000-4000-8000-000000000341";

/** 27-sep 10:00 Cancún = 15:00 UTC; 20-sep 23:30 Cancún = 21-sep 04:30 UTC. */
const V341: QuoteVecino = {
  id: ID,
  folio: 341,
  fecha_vuelo: "2026-09-27T15:00:00+00:00",
  estado: "COTIZADO",
  cliente_nombre: "Maqar",
};

describe("filtrosListaDeParams — los filtros de la barra, validados", () => {
  it("los seis filtros de la barra viajan (el rango al FINAL); lo demás (tq/tp de la tabla, revisar) no", () => {
    expect(FILTROS_LISTA).toEqual(["estado", "cliente_id", "q", "grupo_id", "desde", "hasta"]);
    expect(
      filtrosListaDeParams({
        estado: "COTIZADO",
        cliente_id: CLIENTE,
        q: "  maqar  ",
        grupo_id: GRUPO,
        desde: "2026-10-01",
        hasta: "2026-10-31",
        tq: "busqueda local",
        tp: "3",
        revisar: "1",
      }),
    ).toEqual({
      estado: "COTIZADO",
      cliente_id: CLIENTE,
      q: "maqar",
      grupo_id: GRUPO,
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
  });

  it("estado fuera del catálogo o ids que no son uuid se IGNORAN (el API daría 400)", () => {
    expect(
      filtrosListaDeParams({ estado: "NADA", cliente_id: "no-uuid", grupo_id: "x" }),
    ).toEqual({});
  });

  it("q vacía o de puros espacios no viaja; q larga se topa a 100", () => {
    expect(filtrosListaDeParams({ q: "   " })).toEqual({});
    const larga = "a".repeat(250);
    expect(filtrosListaDeParams({ q: larga }).q).toHaveLength(Q_MAX);
  });

  it("un parámetro repetido (?estado=A&estado=B) toma el primero", () => {
    expect(filtrosListaDeParams({ estado: ["CONFIRMADO", "COTIZADO"] })).toEqual({
      estado: "CONFIRMADO",
    });
  });

  it("rango: un solo extremo vale; un día que no existe o un ISO con hora se ignoran", () => {
    expect(filtrosListaDeParams({ desde: "2026-10-01" })).toEqual({ desde: "2026-10-01" });
    expect(filtrosListaDeParams({ hasta: "2026-10-31" })).toEqual({ hasta: "2026-10-31" });
    expect(filtrosListaDeParams({ desde: "2026-13-45", hasta: "2026-02-30" })).toEqual({});
    expect(filtrosListaDeParams({ desde: "nada" })).toEqual({});
    expect(filtrosListaDeParams({ desde: "2026-10-01T00:00:00Z" })).toEqual({});
  });

  it("rango invertido se corrige; el futuro NO se recorta (hay vuelos por venir); repetido toma el primero", () => {
    expect(filtrosListaDeParams({ desde: "2026-10-31", hasta: "2026-10-01" })).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    expect(filtrosListaDeParams({ desde: "2030-01-01", hasta: "2031-12-31" })).toEqual({
      desde: "2030-01-01",
      hasta: "2031-12-31",
    });
    expect(filtrosListaDeParams({ desde: ["2026-10-05", "2026-10-01"] })).toEqual({
      desde: "2026-10-05",
    });
  });
});

describe("qsFiltrosLista / hrefCotizacion / hrefListaCotizaciones", () => {
  it("orden FIJO y codificado; vacío sin filtros", () => {
    expect(qsFiltrosLista({})).toBe("");
    expect(
      qsFiltrosLista({ grupo_id: GRUPO, q: "Punta Pájaros & Co", estado: "COTIZADO" }),
    ).toBe(`estado=COTIZADO&q=Punta+P%C3%A1jaros+%26+Co&grupo_id=${GRUPO}`);
  });

  it("el rango va AL FINAL: las URLs de antes se escriben igual que siempre", () => {
    expect(
      qsFiltrosLista({ hasta: "2026-10-31", desde: "2026-10-01", q: "maqar", estado: "COTIZADO" }),
    ).toBe("estado=COTIZADO&q=maqar&desde=2026-10-01&hasta=2026-10-31");
  });

  it("ida y vuelta: lo que escribe la lista es lo que lee el detalle (también el rango)", () => {
    const f = {
      estado: "CANCELADO" as const,
      cliente_id: CLIENTE,
      q: "CUN, MID",
      desde: "2026-10-01",
      hasta: "2026-10-31",
    };
    const qs = qsFiltrosLista(f);
    const leido = filtrosListaDeParams(Object.fromEntries(new URLSearchParams(qs)));
    expect(leido).toEqual(f);
  });

  it("ligas con y sin filtros", () => {
    expect(hrefCotizacion(ID, "")).toBe(`/admin/quotes/${ID}`);
    expect(hrefCotizacion(ID, "estado=COTIZADO")).toBe(
      `/admin/quotes/${ID}?estado=COTIZADO`,
    );
    expect(hrefCotizacion(ID, "desde=2026-10-01&hasta=2026-10-31")).toBe(
      `/admin/quotes/${ID}?desde=2026-10-01&hasta=2026-10-31`,
    );
    expect(hrefListaCotizaciones("")).toBe("/admin/quotes");
    expect(hrefListaCotizaciones("q=maqar")).toBe("/admin/quotes?q=maqar");
  });
});

// =============================================================================
// Rango de fechas de la lista (13-oct-2026)
// =============================================================================

describe("rango de fechas de la lista", () => {
  it("rangoListaCotizaciones: solo días YYYY-MM-DD reales, invertido se intercambia, nunca se recorta a hoy", () => {
    expect(rangoListaCotizaciones("2026-10-01", "2026-10-31")).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    expect(rangoListaCotizaciones("2026-10-31", "2026-10-01")).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    expect(rangoListaCotizaciones("2026-10-01", null)).toEqual({ desde: "2026-10-01" });
    expect(rangoListaCotizaciones(undefined, "2026-10-31")).toEqual({ hasta: "2026-10-31" });
    expect(rangoListaCotizaciones("", "")).toEqual({});
    expect(rangoListaCotizaciones("2026-13-45", "2026-02-30")).toEqual({});
    expect(rangoListaCotizaciones("2026-10-01T00:00:00Z", "2026-10-31T23:59:59-05:00")).toEqual({});
    expect(rangoListaCotizaciones("2099-01-01", "2099-12-31")).toEqual({
      desde: "2099-01-01",
      hasta: "2099-12-31",
    });
  });

  it("hayRangoLista / rangoDeFiltros / sinRango", () => {
    expect(hayRangoLista({})).toBe(false);
    expect(hayRangoLista({ desde: "2026-10-01" })).toBe(true);
    expect(hayRangoLista({ hasta: "2026-10-31" })).toBe(true);
    expect(
      rangoDeFiltros({ estado: "COTIZADO", q: "x", desde: "2026-10-01", hasta: "2026-10-31" }),
    ).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoDeFiltros({ estado: "COTIZADO" })).toEqual({});
    const sin = sinRango({ estado: "COTIZADO" as const, q: "x", desde: "2026-10-01", hasta: "2026-10-31" });
    expect(sin).toEqual({ estado: "COTIZADO", q: "x" });
    expect(sin).not.toHaveProperty("desde");
    expect(sin).not.toHaveProperty("hasta");
    // Sin rango no hay nada que quitar (tipado como los filtros de la lista:
    // un literal sin `desde`/`hasta` no comparte propiedades con el rango).
    const soloQ: FiltrosListaCotizaciones = { q: "x" };
    expect(sinRango(soloQ)).toEqual({ q: "x" });
  });

  it("rangoAlCambiarCampo: el otro extremo sigue al nuevo si queda invertido (regla del selector de Reportes)", () => {
    const r = { desde: "2026-10-01", hasta: "2026-10-15" };
    expect(rangoAlCambiarCampo(r, "desde", "2026-10-05")).toEqual({ desde: "2026-10-05", hasta: "2026-10-15" });
    expect(rangoAlCambiarCampo(r, "desde", "2026-10-20")).toEqual({ desde: "2026-10-20", hasta: "2026-10-20" });
    expect(rangoAlCambiarCampo(r, "hasta", "2026-10-31")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoAlCambiarCampo(r, "hasta", "2026-09-20")).toEqual({ desde: "2026-09-20", hasta: "2026-09-20" });
    // Con un solo extremo o ninguno: no se inventa el otro.
    expect(rangoAlCambiarCampo({}, "desde", "2026-10-05")).toEqual({ desde: "2026-10-05" });
    expect(rangoAlCambiarCampo({ hasta: "2026-10-31" }, "desde", "2026-10-05")).toEqual({
      desde: "2026-10-05",
      hasta: "2026-10-31",
    });
    expect(rangoAlCambiarCampo({ desde: "2026-10-01" }, "hasta", "2026-10-31")).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    // El caso que con el INTERCAMBIO salía mal: pasar de 01–15 a 20–31 tecleando primero «desde».
    const paso1 = rangoAlCambiarCampo(r, "desde", "2026-10-20");
    expect(rangoAlCambiarCampo(paso1, "hasta", "2026-10-31")).toEqual({ desde: "2026-10-20", hasta: "2026-10-31" });
  });
});

describe("periodosRapidosCotizaciones — días Cancún, «Este mes» hasta el ÚLTIMO día", () => {
  it("12-oct-2026: este mes completo, mes pasado y próximos 30 días", () => {
    expect(periodosRapidosCotizaciones("2026-10-12")).toEqual([
      { clave: "mes", etiqueta: "Este mes", desde: "2026-10-01", hasta: "2026-10-31" },
      { clave: "anterior", etiqueta: "Mes pasado", desde: "2026-09-01", hasta: "2026-09-30" },
      { clave: "30", etiqueta: "Próximos 30 días", desde: "2026-10-12", hasta: "2026-11-11" },
    ]);
  });

  it("cruza el año en los dos sentidos", () => {
    const dic = periodosRapidosCotizaciones("2026-12-20");
    expect(dic[0]).toMatchObject({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(dic[2]).toMatchObject({ desde: "2026-12-20", hasta: "2027-01-19" });
    const ene = periodosRapidosCotizaciones("2027-01-05");
    expect(ene[1]).toMatchObject({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(ene[0]).toMatchObject({ desde: "2027-01-01", hasta: "2027-01-31" });
  });

  it("febrero bisiesto termina el 29", () => {
    expect(periodosRapidosCotizaciones("2028-02-10")[0]).toMatchObject({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
    expect(periodosRapidosCotizaciones("2027-02-10")[0]).toMatchObject({
      desde: "2027-02-01",
      hasta: "2027-02-28",
    });
  });
});

describe("textos del rango (congelados)", () => {
  const d1 = fmtDateOnly("2026-10-01");
  const d31 = fmtDateOnly("2026-10-31");
  const R = { desde: "2026-10-01", hasta: "2026-10-31" };

  it("textoRangoCotizaciones", () => {
    expect(textoRangoCotizaciones(R)).toBe(`con fecha de vuelo del ${d1} al ${d31}`);
    expect(textoRangoCotizaciones({ desde: "2026-10-01" })).toBe(`con fecha de vuelo desde el ${d1}`);
    expect(textoRangoCotizaciones({ hasta: "2026-10-31" })).toBe(`con fecha de vuelo hasta el ${d31}`);
    expect(textoRangoCotizaciones({})).toBeNull();
    // El formato es el de `fmtDateOnly` («01 oct 2026»), el mismo del panel.
    expect(d1).toMatch(/^01 \S+ 2026$/);
  });

  it("textoEncabezadoCotizaciones: singular, plural y «(todas las fechas)» sin rango", () => {
    expect(textoEncabezadoCotizaciones(12, R)).toBe(`12 cotizaciones con fecha de vuelo del ${d1} al ${d31}.`);
    expect(textoEncabezadoCotizaciones(1, R)).toBe(`1 cotización con fecha de vuelo del ${d1} al ${d31}.`);
    expect(textoEncabezadoCotizaciones(312, {})).toBe("312 cotizaciones (todas las fechas).");
    expect(textoEncabezadoCotizaciones(1, {})).toBe("1 cotización (todas las fechas).");
    expect(textoEncabezadoCotizaciones(0, {})).toBe("0 cotizaciones (todas las fechas).");
  });

  it("notaRangoCotizaciones: con rango dice que las sin fecha no entran y que las flechas lo recorren", () => {
    expect(notaRangoCotizaciones(R)).toBe(
      `Mostrando cotizaciones con fecha de vuelo del ${d1} al ${d31}. Las que no tienen fecha de vuelo ` +
        "no entran al periodo: quítalo con «Limpiar» para verlas. Las flechas del detalle recorren " +
        "este mismo periodo.",
    );
    const sinPeriodo =
      "Sin periodo: se muestran las cotizaciones de todas las fechas; las que no tienen fecha de " +
      "vuelo van al inicio de la tabla.";
    expect(notaRangoCotizaciones({})).toBe(sinPeriodo);
    expect(notaRangoCotizaciones(R, { ignorado: true })).toBe(sinPeriodo);
  });

  it("textoVacioCotizaciones: sin rango los textos de siempre; con rango, cómo salir del periodo", () => {
    expect(textoVacioCotizaciones({})).toEqual({
      titulo: "Sin cotizaciones",
      descripcion: "Cuando guardes una cotización aparecerá aquí con su folio e historial.",
    });
    expect(textoVacioCotizaciones(R)).toEqual({
      titulo: "Sin cotizaciones en el periodo",
      descripcion: `No hay cotizaciones con fecha de vuelo del ${d1} al ${d31}. Cambia el periodo o quítalo con «Limpiar».`,
    });
  });

  it("constantes literales", () => {
    expect(MSG_RANGO_API_VIEJO).toBe(
      "El filtro de fechas estará disponible cuando se actualice el servidor. Mientras tanto se muestran las cotizaciones de todas las fechas.",
    );
    expect(TITULO_FECHA_VUELO).toBe("Fecha del vuelo (día de Cancún)");
    expect(ETIQUETA_GRUPO_FECHAS).toBe("Periodo del vuelo");
  });
});

describe("esApiSinRangoFechas — el 400 del API previo, por su TEXTO", () => {
  const e400 = (message: string) =>
    new ApiError({ statusCode: 400, code: "BAD_REQUEST", message });

  it("true con «property desde should not exist», con «hasta» y con el mensaje en lista", () => {
    expect(esApiSinRangoFechas(e400("property desde should not exist"))).toBe(true);
    expect(esApiSinRangoFechas(e400("property hasta should not exist"))).toBe(true);
    expect(
      esApiSinRangoFechas(
        new ApiError({
          statusCode: 400,
          code: "BAD_REQUEST",
          message: ["property desde should not exist", "property hasta should not exist"] as unknown as string,
        }),
      ),
    ).toBe(true);
    expect(
      esApiSinRangoFechas({ status: 400, message: ["property desde should not exist"] }),
    ).toBe(true);
  });

  it("false con un 400 de OTRO campo, con 500/502 aunque el texto coincida, sin error y con «Bad Request» a secas", () => {
    expect(esApiSinRangoFechas(e400("property tramos_base should not exist"))).toBe(false);
    expect(esApiSinRangoFechas(e400("Bad Request"))).toBe(false);
    expect(esApiSinRangoFechas(e400("desde must be a valid ISO 8601 date string"))).toBe(false);
    for (const statusCode of [500, 502]) {
      expect(
        esApiSinRangoFechas(
          new ApiError({ statusCode, code: "X", message: "property desde should not exist" }),
        ),
      ).toBe(false);
    }
    expect(esApiSinRangoFechas(null)).toBe(false);
    expect(esApiSinRangoFechas(undefined)).toBe(false);
    expect(esApiSinRangoFechas(new Error("fetch failed"))).toBe(false);
    expect(esApiSinRangoFechas("property desde should not exist")).toBe(false);
  });
});

describe("campo date de la barra — el borrador, sin DOM", () => {
  it("pasoCampoFecha: completa ⇒ aplicar; a medio teclear, inválida o vacía ⇒ borrador", () => {
    expect(pasoCampoFecha("2026-10-05")).toEqual({ tipo: "aplicar", valor: "2026-10-05" });
    expect(pasoCampoFecha("0002-10-05")).toEqual({ tipo: "borrador", valor: "0002-10-05" });
    expect(pasoCampoFecha("2026-13-45")).toEqual({ tipo: "borrador", valor: "2026-13-45" });
    expect(pasoCampoFecha("")).toEqual({ tipo: "borrador", valor: "" });
  });

  it("pasoAlSalirCampoFecha: vacío con URL ⇒ limpiar; distinta y completa ⇒ aplicar; igual o incompleta ⇒ descartar", () => {
    expect(pasoAlSalirCampoFecha("", "2026-10-01")).toEqual({ tipo: "limpiar" });
    expect(pasoAlSalirCampoFecha("", "")).toEqual({ tipo: "descartar" });
    expect(pasoAlSalirCampoFecha("2026-10-05", "2026-10-01")).toEqual({ tipo: "aplicar", valor: "2026-10-05" });
    expect(pasoAlSalirCampoFecha("2026-10-05", "")).toEqual({ tipo: "aplicar", valor: "2026-10-05" });
    expect(pasoAlSalirCampoFecha("2026-10-01", "2026-10-01")).toEqual({ tipo: "descartar" });
    expect(pasoAlSalirCampoFecha("0002-1", "2026-10-01")).toEqual({ tipo: "descartar" });
  });

  it("valorVisibleCampoFecha: el borrador manda mientras su base siga siendo la URL", () => {
    expect(valorVisibleCampoFecha("2026-10-01", null)).toBe("2026-10-01");
    expect(valorVisibleCampoFecha("2026-10-01", { base: "2026-10-01", valor: "2026-10-0" })).toBe("2026-10-0");
    expect(valorVisibleCampoFecha("2026-10-05", { base: "2026-10-01", valor: "2026-10-05" })).toBe("2026-10-05");
    expect(valorVisibleCampoFecha("", { base: "2026-10-01", valor: "" })).toBe("");
  });

  it("tecleando el año «0002 → 0020 → 0202 → 2026» hay tres borradores y UN solo aplicar", () => {
    const tecleo = ["0002-10-05", "0020-10-05", "0202-10-05", "2026-10-05"];
    const pasos = tecleo.map(pasoCampoFecha);
    expect(pasos.map((p) => p.tipo)).toEqual(["borrador", "borrador", "borrador", "aplicar"]);
    // Mientras se teclea, el input enseña lo tecleado (la URL sigue en 2026-10-01).
    for (const v of tecleo) {
      expect(valorVisibleCampoFecha("2026-10-01", { base: "2026-10-01", valor: v })).toBe(v);
    }
    // Al llegar la navegación la URL cambia y el borrador caduca solo.
    expect(valorVisibleCampoFecha("2026-10-05", { base: "2026-10-01", valor: "2026-10-05" })).toBe("2026-10-05");
  });
});

describe("textos de las flechas", () => {
  it("«#341 · 27 sep · Maqar» con la fecha en hora Cancún", () => {
    expect(textoVecino(V341)).toBe("#341 · 27 sep · Maqar");
    expect(textoCortoVecino(V341)).toBe("#341 · 27 sep");
  });

  it("el día es el de CANCÚN: 20-sep 23:30 local sale como 20 sep aunque en UTC ya sea 21", () => {
    expect(
      textoCortoVecino({ folio: 7, fecha_vuelo: "2026-09-21T04:30:00+00:00" }),
    ).toBe("#7 · 20 sep");
  });

  it("sin cliente no se inventa nada (ni «null» ni «—»)", () => {
    expect(textoVecino({ ...V341, cliente_nombre: null })).toBe("#341 · 27 sep");
    expect(textoVecino({ ...V341, cliente_nombre: "   " })).toBe("#341 · 27 sep");
  });

  it("tooltip: adónde lleva, o por qué está apagada", () => {
    expect(tituloFlecha("siguiente", V341)).toBe("Vuelo siguiente: #341 · 27 sep · Maqar");
    expect(tituloFlecha("anterior", V341)).toBe("Vuelo anterior: #341 · 27 sep · Maqar");
    expect(tituloFlecha("anterior", null, { conFiltros: true })).toBe(
      "No hay un vuelo anterior con estos filtros",
    );
    expect(tituloFlecha("siguiente", null)).toBe("No hay un vuelo siguiente");
    expect(tituloFlecha("siguiente", V341, { sinFecha: true })).toBe(MSG_SIN_FECHA);
    expect(MSG_SIN_FECHA).toBe(
      "Esta cotización no tiene fecha de vuelo: ponle fecha para brincar entre vuelos.",
    );
  });

  it("subtítulo visible de una flecha apagada", () => {
    expect(subtituloFlechaApagada({ sinFecha: true })).toBe("Sin fecha");
    expect(subtituloFlechaApagada({})).toBe("No hay más");
  });
});

describe("direccionDeTecla — ←/→ solo cuando no son de otro control", () => {
  const tecla = (key: string, extra: Partial<TeclaPulsada> = {}): TeclaPulsada => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extra,
  });
  const libre: ContextoFoco = {
    etiqueta: null,
    editable: false,
    rol: null,
    hayCapaAbierta: false,
  };

  it("sin foco en nada: ← anterior, → siguiente; otras teclas nada", () => {
    expect(direccionDeTecla(tecla("ArrowLeft"), libre)).toBe("anterior");
    expect(direccionDeTecla(tecla("ArrowRight"), libre)).toBe("siguiente");
    expect(direccionDeTecla(tecla("ArrowUp"), libre)).toBeNull();
    expect(direccionDeTecla(tecla("Enter"), libre)).toBeNull();
  });

  it("con modificadores, autorrepetición o evento ya atendido: nada", () => {
    for (const m of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      expect(direccionDeTecla(tecla("ArrowRight", { [m]: true }), libre)).toBeNull();
    }
    expect(direccionDeTecla(tecla("ArrowRight", { repeat: true }), libre)).toBeNull();
    expect(
      direccionDeTecla(tecla("ArrowRight", { defaultPrevented: true }), libre),
    ).toBeNull();
  });

  it("escribiendo en la hoja (input/textarea/select/contenteditable): nada", () => {
    for (const etiqueta of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(direccionDeTecla(tecla("ArrowLeft"), { ...libre, etiqueta })).toBeNull();
    }
    expect(direccionDeTecla(tecla("ArrowLeft"), { ...libre, editable: true })).toBeNull();
  });

  it("controles donde las flechas ya significan algo (pestañas, radios, listas): nada", () => {
    for (const rol of ["tab", "radio", "radiogroup", "slider", "option", "combobox", "menuitem"]) {
      expect(direccionDeTecla(tecla("ArrowRight"), { ...libre, rol })).toBeNull();
    }
  });

  it("con un diálogo o menú abierto: nada", () => {
    expect(
      direccionDeTecla(tecla("ArrowRight"), { ...libre, hayCapaAbierta: true }),
    ).toBeNull();
  });

  it("un botón o un enlace con foco NO bloquean el atajo", () => {
    expect(
      direccionDeTecla(tecla("ArrowRight"), { ...libre, etiqueta: "BUTTON" }),
    ).toBe("siguiente");
    expect(direccionDeTecla(tecla("ArrowLeft"), { ...libre, etiqueta: "A" })).toBe(
      "anterior",
    );
  });
});
