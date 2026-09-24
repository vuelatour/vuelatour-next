/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» entre cotizaciones (24-sep-2026,
 * pedido de Itzi). Qué vuelo es el vecino lo decide el API; aquí se congela lo
 * del panel: qué filtros de la lista viajan (validados igual que la lista),
 * cómo se escriben en la URL, los textos y cuándo ←/→ es un atajo.
 */
import { describe, expect, it } from "vitest";
import {
  FILTROS_LISTA,
  MSG_SIN_FECHA,
  Q_MAX,
  direccionDeTecla,
  filtrosListaDeParams,
  hrefCotizacion,
  hrefListaCotizaciones,
  qsFiltrosLista,
  subtituloFlechaApagada,
  textoCortoVecino,
  textoVecino,
  tituloFlecha,
  type ContextoFoco,
  type TeclaPulsada,
} from "../quote-navegacion";
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
  it("los cuatro filtros de la barra viajan; lo demás (tq/tp de la tabla, revisar) no", () => {
    expect(FILTROS_LISTA).toEqual(["estado", "cliente_id", "q", "grupo_id"]);
    expect(
      filtrosListaDeParams({
        estado: "COTIZADO",
        cliente_id: CLIENTE,
        q: "  maqar  ",
        grupo_id: GRUPO,
        tq: "busqueda local",
        tp: "3",
        revisar: "1",
      }),
    ).toEqual({ estado: "COTIZADO", cliente_id: CLIENTE, q: "maqar", grupo_id: GRUPO });
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
});

describe("qsFiltrosLista / hrefCotizacion / hrefListaCotizaciones", () => {
  it("orden FIJO y codificado; vacío sin filtros", () => {
    expect(qsFiltrosLista({})).toBe("");
    expect(
      qsFiltrosLista({ grupo_id: GRUPO, q: "Punta Pájaros & Co", estado: "COTIZADO" }),
    ).toBe(`estado=COTIZADO&q=Punta+P%C3%A1jaros+%26+Co&grupo_id=${GRUPO}`);
  });

  it("ida y vuelta: lo que escribe la lista es lo que lee el detalle", () => {
    const f = { estado: "CANCELADO" as const, cliente_id: CLIENTE, q: "CUN, MID" };
    const qs = qsFiltrosLista(f);
    const leido = filtrosListaDeParams(Object.fromEntries(new URLSearchParams(qs)));
    expect(leido).toEqual(f);
  });

  it("ligas con y sin filtros", () => {
    expect(hrefCotizacion(ID, "")).toBe(`/admin/quotes/${ID}`);
    expect(hrefCotizacion(ID, "estado=COTIZADO")).toBe(
      `/admin/quotes/${ID}?estado=COTIZADO`,
    );
    expect(hrefListaCotizaciones("")).toBe("/admin/quotes");
    expect(hrefListaCotizaciones("q=maqar")).toBe("/admin/quotes?q=maqar");
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
