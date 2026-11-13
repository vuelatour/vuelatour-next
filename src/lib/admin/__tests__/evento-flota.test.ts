import { describe, expect, it } from "vitest";
import {
  DESCRIPCION_EDITAR_EVENTO,
  DESCRIPCION_NUEVO_EVENTO,
  DESCRIPCION_OPCION_TODOS,
  ETIQUETA_TODOS,
  NOTA_LEYENDA_EVENTOS,
  TEXTO_EVENTO_PARA_TODOS,
  TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO,
  esEventoParaTodos,
  hintResponsable,
  textoConfirmarQuitarEvento,
  textoEventoSinResponsable,
  textoGuardadoParaTodos,
  textoGuardadoSinResponsable,
  textoGuardadoSinResponsableLegado,
  tooltipEvento,
} from "@/lib/admin/evento-flota";

/**
 * EVENTO SIN RESPONSABLE = PARA TODOS (12-nov-2026, API 0.0.139, invariante
 * 134 del API). Pedido de Dirección con la captura de «Agendar evento (no
 * vuelo)» («Jorge Cortes Avionico IJP», Sin responsable): «que se le pueda
 * poner como responsable "Todos", o que al momento de poner "sin responsable"
 * le apareciera a todos en su calendario más bien, en la app y en web».
 *
 * La regla la decide el API (`para_todos`); aquí se congelan los textos y la
 * tolerancia a un API previo (donde ese evento lo veía solo la oficina).
 */
describe("¿es de todos? — lo dice el API", () => {
  it("solo `para_todos: true`; ausente (API previo), false o null no lo son", () => {
    expect(esEventoParaTodos({ para_todos: true })).toBe(true);
    for (const ev of [{ para_todos: false }, { para_todos: null }, {}, null, undefined]) {
      expect(esEventoParaTodos(ev)).toBe(false);
    }
  });
});

describe("selector «Responsable»", () => {
  it("la opción vacía se llama «Todos (sin responsable)» y dice qué pasa", () => {
    expect(ETIQUETA_TODOS).toBe("Todos (sin responsable)");
    expect(DESCRIPCION_OPCION_TODOS).toBe(
      "Les aparece a todos en su calendario. Sin aviso al teléfono.",
    );
  });

  it("el renglón de ayuda dice QUIÉN lo verá y si alguien recibe aviso, según lo elegido", () => {
    expect(hintResponsable(false)).toBe(
      "Lo verán todos en su calendario (inicio y Mis vuelos de la app). No se manda aviso al teléfono de nadie.",
    );
    expect(hintResponsable(true)).toBe(
      "Solo esa persona lo verá en su app (inicio y Mis vuelos) y recibirá aviso. Si no tiene la app con notificaciones, avísale por otro medio.",
    );
  });

  it("los diálogos explican las dos formas (con responsable / de todos)", () => {
    expect(DESCRIPCION_NUEVO_EVENTO).toBe(
      "Cita, lavado, trámite, visita… Sale en el calendario de flota. Con responsable, solo esa persona lo ve en su app y recibe aviso; sin responsable, les aparece a todos en su calendario.",
    );
    expect(DESCRIPCION_EDITAR_EVENTO).toBe(
      "Si cambias fecha, avión, título o notas se le avisa al responsable; si cambias de responsable, el anterior recibe «ya no te toca» y el nuevo su aviso. Si le quitas el responsable, el evento pasa a ser de todos.",
    );
  });
});

describe("tras guardar un evento sin responsable", () => {
  it("con el API nuevo: es de todos y se dice que no hay aviso al teléfono", () => {
    expect(textoGuardadoSinResponsable("agendado", { para_todos: true })).toBe(
      "Evento agendado · para todos: les aparece en su calendario (sin aviso al teléfono)",
    );
    expect(textoGuardadoSinResponsable("actualizado", { para_todos: true })).toBe(
      "Evento actualizado · para todos: les aparece en su calendario (sin aviso al teléfono)",
    );
    expect(textoGuardadoParaTodos("agendado")).toBe(
      textoGuardadoSinResponsable("agendado", { para_todos: true }),
    );
  });

  it("con un API previo (sin `para_todos`) NO se promete que les aparece a todos: el texto de antes", () => {
    for (const ev of [{}, { para_todos: false }, null, undefined]) {
      expect(textoGuardadoSinResponsable("agendado", ev)).toBe(
        "Evento agendado (sin responsable: nadie recibirá aviso)",
      );
    }
    expect(textoGuardadoSinResponsableLegado("actualizado")).toBe(
      "Evento actualizado (sin responsable: nadie recibirá aviso)",
    );
  });
});

describe("detalle del día y chip del mes", () => {
  it("un evento de todos lo dice; con un API previo, el texto de antes", () => {
    expect(TEXTO_EVENTO_PARA_TODOS).toBe(
      "Para todos · les aparece en su calendario (sin aviso al teléfono)",
    );
    expect(TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO).toBe("Sin responsable · nadie recibe aviso");
    expect(textoEventoSinResponsable({ para_todos: true })).toBe(TEXTO_EVENTO_PARA_TODOS);
    expect(textoEventoSinResponsable({})).toBe(TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO);
    expect(textoEventoSinResponsable(undefined)).toBe(TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO);
  });

  it("el tooltip del chip agrega «Para todos» solo cuando lo es", () => {
    const titulo = "Evento · Jorge Cortes Avionico IJP";
    expect(tooltipEvento(titulo, { para_todos: true })).toBe(`${titulo} · Para todos`);
    expect(tooltipEvento(titulo, { para_todos: false })).toBe(titulo);
    expect(tooltipEvento(titulo, {})).toBe(titulo);
  });
});

describe("quitar un evento (se confirma y se dice a quién afecta)", () => {
  const titulo = "Jorge Cortes Avionico IJP";

  it("con responsable: se le avisa (el texto de siempre)", () => {
    expect(textoConfirmarQuitarEvento(titulo, { conResponsable: true })).toBe(
      "Jorge Cortes Avionico IJP. Se elimina del calendario y se le avisa al responsable. No toca ningún vuelo.",
    );
    // Aunque el API diga otra cosa por error, con responsable manda el aviso.
    expect(textoConfirmarQuitarEvento(titulo, { conResponsable: true, para_todos: true })).toBe(
      "Jorge Cortes Avionico IJP. Se elimina del calendario y se le avisa al responsable. No toca ningún vuelo.",
    );
  });

  it("de todos: deja de aparecerles a todos y no se promete un aviso que nadie recibe", () => {
    expect(textoConfirmarQuitarEvento(titulo, { conResponsable: false, para_todos: true })).toBe(
      "Jorge Cortes Avionico IJP. Se elimina del calendario de todos (sin aviso al teléfono). No toca ningún vuelo.",
    );
  });

  it("API previo y sin responsable: sin promesas", () => {
    expect(textoConfirmarQuitarEvento(titulo, { conResponsable: false })).toBe(
      "Jorge Cortes Avionico IJP. Se elimina del calendario. No toca ningún vuelo.",
    );
    expect(textoConfirmarQuitarEvento(titulo, null)).toBe(
      "Jorge Cortes Avionico IJP. Se elimina del calendario. No toca ningún vuelo.",
    );
  });
});

describe("leyenda del calendario", () => {
  it("dice las dos reglas: aviso al responsable y sin responsable = para todos", () => {
    expect(NOTA_LEYENDA_EVENTOS).toBe(
      "Al agendar un evento con responsable se le avisa por push; ⚠ = no tiene la app registrada (avísale por otro medio). Sin responsable, el evento les aparece a todos en su calendario (sin aviso).",
    );
  });
});
