import { describe, expect, it } from "vitest";
import {
  BIT_FILA_ACTIVA,
  BIT_FILA_ENTRADA,
  SELECTOR_DESPLEGABLE,
  SELECTOR_FILA,
  SELECTOR_FILA_HIJA,
  accionDeTeclaFila,
  atributosDeInstantanea,
  atributosFila,
  crearEstadoFilaActiva,
  filaDeEntrada,
  indiceEnlaceDeFila,
  indiceFilaSiguiente,
  instantaneaFila,
  scrollParaVerFila,
  type ContextoTeclaFila,
} from "../filas-activas";
import type { TeclaPulsada } from "../quote-navegacion";

/**
 * Fila activa y teclado de las tablas (13-oct-2026): las reglas PURAS que el
 * hook `use-filas-activas` cablea al DOM. Qué hace cada tecla según dónde
 * está el foco, el índice siguiente (en el borde se queda), la fila de
 * entrada del Tab, los atributos ARIA de cada fila (`aria-current`, nunca
 * `aria-selected`: Chrome no lo expone en una <table> nativa), qué enlace
 * abre Enter, el scroll que descuenta el <thead> sticky y el ESTADO de la
 * activa fuera de React con su instantánea por fila.
 */
const tecla = (key: string, extra: Partial<TeclaPulsada> = {}): TeclaPulsada => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...extra,
});

const LIBRE: ContextoTeclaFila = {
  esFila: true,
  etiqueta: "TR",
  editable: false,
  rol: null,
  conDesplegable: false,
  hayActiva: true,
};

describe("accionDeTeclaFila", () => {
  it("↑/↓/Home/End con el foco en la fila ⇒ arriba/abajo/primera/ultima", () => {
    expect(accionDeTeclaFila(tecla("ArrowUp"), LIBRE)).toBe("arriba");
    expect(accionDeTeclaFila(tecla("ArrowDown"), LIBRE)).toBe("abajo");
    expect(accionDeTeclaFila(tecla("Home"), LIBRE)).toBe("primera");
    expect(accionDeTeclaFila(tecla("End"), LIBRE)).toBe("ultima");
  });

  it("con autorrepetición las flechas SÍ (mantener ↓ recorre la tabla) y Enter NO", () => {
    expect(accionDeTeclaFila(tecla("ArrowDown", { repeat: true }), LIBRE)).toBe("abajo");
    expect(accionDeTeclaFila(tecla("End", { repeat: true }), LIBRE)).toBe("ultima");
    expect(accionDeTeclaFila(tecla("Enter", { repeat: true }), LIBRE)).toBeNull();
  });

  it("con alt/ctrl/meta/shift o defaultPrevented ⇒ null", () => {
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      const extra: Partial<TeclaPulsada> = {};
      extra[mod] = true;
      expect(accionDeTeclaFila(tecla("ArrowDown", extra), LIBRE), mod).toBeNull();
      expect(accionDeTeclaFila(tecla("Enter", extra), LIBRE), mod).toBeNull();
      expect(accionDeTeclaFila(tecla("Escape", extra), LIBRE), mod).toBeNull();
    }
    expect(accionDeTeclaFila(tecla("ArrowDown", { defaultPrevented: true }), LIBRE)).toBeNull();
    expect(accionDeTeclaFila(tecla("Escape", { defaultPrevented: true }), LIBRE)).toBeNull();
  });

  it("en un campo (INPUT/TEXTAREA/SELECT, también en minúsculas, o contenteditable) ⇒ null para flechas, Home/End y Esc", () => {
    for (const etiqueta of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      const ctx = { ...LIBRE, esFila: false, etiqueta };
      for (const k of ["ArrowUp", "ArrowDown", "Home", "End", "Escape"]) {
        expect(accionDeTeclaFila(tecla(k), ctx), `${etiqueta} ${k}`).toBeNull();
      }
    }
    const editable = { ...LIBRE, esFila: false, etiqueta: "DIV", editable: true };
    for (const k of ["ArrowUp", "ArrowDown", "Home", "End", "Escape"]) {
      expect(accionDeTeclaFila(tecla(k), editable), `editable ${k}`).toBeNull();
    }
  });

  it("INPUT checkbox (la casilla de la selección de Conciliación, 14-oct-2026): ↑/↓/Home/End/Esc actúan", () => {
    // Flujo: ↓ (fila) → Tab (casilla) → Espacio (la marca, nativo) → ↓.
    for (const etiqueta of ["INPUT", "input"]) {
      for (const tipoEntrada of ["checkbox", "CHECKBOX"]) {
        const ctx = { ...LIBRE, esFila: false, etiqueta, tipoEntrada };
        expect(accionDeTeclaFila(tecla("ArrowDown"), ctx), `${etiqueta} ${tipoEntrada} ↓`).toBe("abajo");
        expect(accionDeTeclaFila(tecla("ArrowUp"), ctx)).toBe("arriba");
        expect(accionDeTeclaFila(tecla("Home"), ctx)).toBe("primera");
        expect(accionDeTeclaFila(tecla("End"), ctx)).toBe("ultima");
        expect(accionDeTeclaFila(tecla("Escape"), ctx)).toBe("soltar");
        // Enter en la casilla NO abre la fila (el foco no está en el <tr>) y
        // Espacio es de la casilla: jamás se toca.
        expect(accionDeTeclaFila(tecla("Enter"), ctx)).toBeNull();
        expect(accionDeTeclaFila(tecla(" "), ctx)).toBeNull();
      }
    }
    // Sin activa, Esc no se traga.
    expect(
      accionDeTeclaFila(tecla("Escape"), { ...LIBRE, esFila: false, etiqueta: "INPUT", tipoEntrada: "checkbox", hayActiva: false }),
    ).toBeNull();
    // Un INPUT de texto (o de otro tipo) sigue siendo un campo, igual que antes.
    for (const tipoEntrada of ["text", "search", "number", null, undefined]) {
      const ctx = { ...LIBRE, esFila: false, etiqueta: "INPUT", tipoEntrada };
      for (const k of ["ArrowUp", "ArrowDown", "Home", "End", "Escape"]) {
        expect(accionDeTeclaFila(tecla(k), ctx), `${String(tipoEntrada)} ${k}`).toBeNull();
      }
    }
    // «checkbox» solo exime a un INPUT: un SELECT o TEXTAREA con ese dato no.
    expect(accionDeTeclaFila(tecla("ArrowDown"), { ...LIBRE, esFila: false, etiqueta: "SELECT", tipoEntrada: "checkbox" })).toBeNull();
  });

  it("roles con flechas propias ⇒ null para las flechas", () => {
    const roles = [
      "listbox",
      "option",
      "combobox",
      "menu",
      "menuitem",
      "slider",
      "spinbutton",
      "radio",
      "radiogroup",
      "tab",
      "tablist",
      "tree",
      "treeitem",
      "grid",
      "gridcell",
      "textbox",
      "searchbox",
    ];
    for (const rol of roles) {
      const ctx = { ...LIBRE, esFila: false, etiqueta: "DIV", rol };
      expect(accionDeTeclaFila(tecla("ArrowDown"), ctx), rol).toBeNull();
      expect(accionDeTeclaFila(tecla("ArrowUp"), ctx), rol).toBeNull();
      expect(accionDeTeclaFila(tecla("Home"), ctx), rol).toBeNull();
    }
  });

  it("en un desplegable (el ⋯ de Base UI, aria-haspopup) ⇒ null para flechas y Home/End", () => {
    const ctx = { ...LIBRE, esFila: false, etiqueta: "BUTTON", conDesplegable: true };
    for (const k of ["ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(accionDeTeclaFila(tecla(k), ctx), k).toBeNull();
    }
  });

  it("el veto es SOLO [aria-haspopup]: un botón de plegar con aria-expanded suelto («Ver los pagos de la compra») sigue moviendo la activa", () => {
    expect(SELECTOR_DESPLEGABLE).toBe("[aria-haspopup]");
    expect(SELECTOR_DESPLEGABLE).not.toContain("aria-expanded");
    // El hook calcula `conDesplegable` con ese selector: un aria-expanded
    // suelto no casa ⇒ conDesplegable false ⇒ ↓ baja.
    const plegar = { ...LIBRE, esFila: false, etiqueta: "BUTTON", conDesplegable: false };
    expect(accionDeTeclaFila(tecla("ArrowDown"), plegar)).toBe("abajo");
    expect(accionDeTeclaFila(tecla("Home"), plegar)).toBe("primera");
  });

  it("selectores de la fila y de su renglón pegado (la hija cuenta para la fila anterior)", () => {
    expect(SELECTOR_FILA).toBe("tr[data-fila]");
    expect(SELECTOR_FILA_HIJA).toBe("tr[data-fila-hija]");
  });

  it("rol switch/checkbox/row o sin rol ⇒ las flechas sí actúan", () => {
    for (const rol of ["switch", "checkbox", "row", null]) {
      const ctx = { ...LIBRE, esFila: false, etiqueta: "BUTTON", rol };
      expect(accionDeTeclaFila(tecla("ArrowDown"), ctx), String(rol)).toBe("abajo");
    }
  });

  it("con el foco en un enlace o botón sin desplegable: flechas SÍ, Enter null (nativo), Esc suelta", () => {
    for (const etiqueta of ["A", "BUTTON"]) {
      const ctx = { ...LIBRE, esFila: false, etiqueta };
      expect(accionDeTeclaFila(tecla("ArrowDown"), ctx)).toBe("abajo");
      expect(accionDeTeclaFila(tecla("ArrowUp"), ctx)).toBe("arriba");
      expect(accionDeTeclaFila(tecla("Enter"), ctx)).toBeNull();
      expect(accionDeTeclaFila(tecla("Escape"), ctx)).toBe("soltar");
    }
  });

  it("Enter ⇒ abrir SOLO con el foco EN la fila", () => {
    expect(accionDeTeclaFila(tecla("Enter"), LIBRE)).toBe("abrir");
    expect(accionDeTeclaFila(tecla("Enter"), { ...LIBRE, esFila: false, etiqueta: "TD" })).toBeNull();
  });

  it("Escape ⇒ soltar con activa; sin activa no se traga la tecla", () => {
    expect(accionDeTeclaFila(tecla("Escape"), LIBRE)).toBe("soltar");
    expect(accionDeTeclaFila(tecla("Escape"), { ...LIBRE, hayActiva: false })).toBeNull();
  });

  it("←/→, Espacio, Tab, PageUp/PageDown y cualquier otra ⇒ null SIEMPRE (jamás preventDefault)", () => {
    for (const k of ["ArrowLeft", "ArrowRight", " ", "Tab", "PageUp", "PageDown", "a", "F5"]) {
      expect(accionDeTeclaFila(tecla(k), LIBRE), k).toBeNull();
      expect(accionDeTeclaFila(tecla(k), { ...LIBRE, esFila: false, etiqueta: "A" }), k).toBeNull();
    }
  });
});

describe("indiceFilaSiguiente", () => {
  it("sin filas ⇒ null", () => {
    expect(indiceFilaSiguiente(0, "abajo", 0)).toBeNull();
    expect(indiceFilaSiguiente(-1, "primera", 0)).toBeNull();
  });

  it("sin referencia (−1): ↓ va a la primera y ↑ a la última", () => {
    expect(indiceFilaSiguiente(-1, "abajo", 5)).toBe(0);
    expect(indiceFilaSiguiente(-1, "arriba", 5)).toBe(4);
  });

  it("en el borde se queda: NO brinca de página", () => {
    expect(indiceFilaSiguiente(4, "abajo", 5)).toBe(4);
    expect(indiceFilaSiguiente(0, "arriba", 5)).toBe(0);
    expect(indiceFilaSiguiente(2, "abajo", 5)).toBe(3);
    expect(indiceFilaSiguiente(2, "arriba", 5)).toBe(1);
  });

  it("primera / ultima", () => {
    expect(indiceFilaSiguiente(3, "primera", 5)).toBe(0);
    expect(indiceFilaSiguiente(1, "ultima", 5)).toBe(4);
  });
});

describe("filaDeEntrada", () => {
  it("la activa pintada ⇒ la activa; activa en otra página ⇒ la primera; sin filas ⇒ null", () => {
    expect(filaDeEntrada(["a", "b", "c"], "b")).toBe("b");
    expect(filaDeEntrada(["a", "b", "c"], "zzz")).toBe("a");
    expect(filaDeEntrada(["a", "b", "c"], null)).toBe("a");
    expect(filaDeEntrada([], "a")).toBeNull();
    expect(filaDeEntrada([], null)).toBeNull();
  });
});

describe("atributosFila", () => {
  it("fila de entrada ⇒ tabIndex 0 y nada más", () => {
    const a = atributosFila("a", null, "a");
    expect(a).toEqual({ "data-fila": "a", tabIndex: 0 });
    expect(Object.keys(a)).toEqual(["data-fila", "tabIndex"]);
  });

  it("activa ⇒ data-fila-activa + aria-current true (y tabIndex 0 porque es la entrada)", () => {
    const a = atributosFila("b", "b", "b");
    expect(a).toEqual({ "data-fila": "b", tabIndex: 0, "data-fila-activa": "", "aria-current": true });
    expect(Object.keys(a)).toEqual(["data-fila", "tabIndex", "data-fila-activa", "aria-current"]);
  });

  it("fila normal ⇒ solo data-fila y −1; con href ⇒ data-fila-href igual al href", () => {
    expect(atributosFila("c", "b", "b")).toEqual({ "data-fila": "c", tabIndex: -1 });
    expect(atributosFila("c", "b", "b", "/admin/flights/c")).toEqual({
      "data-fila": "c",
      tabIndex: -1,
      "data-fila-href": "/admin/flights/c",
    });
  });

  it("sin href / null / \"\" ⇒ sin la clave; NUNCA aria-current false, aria-selected ni role", () => {
    for (const href of [undefined, null, ""]) {
      const a = atributosFila("c", null, "a", href);
      expect(Object.keys(a)).toEqual(["data-fila", "tabIndex"]);
    }
    for (const a of [atributosFila("c", "b", "b"), atributosFila("b", "b", "b"), atributosFila("a", null, "a")]) {
      expect("aria-current" in a ? a["aria-current"] : true).toBe(true);
      expect("aria-selected" in a).toBe(false);
      expect("role" in a).toBe(false);
    }
  });
});

describe("crearEstadoFilaActiva: la activa fuera de React", () => {
  it("arranca sin activa (o con la inicial del arnés), escribe, lee y avisa a los suscritos", () => {
    const e = crearEstadoFilaActiva();
    expect(e.leer()).toBeNull();
    expect(crearEstadoFilaActiva("b").leer()).toBe("b");
    const avisos: string[] = [];
    const baja = e.suscribir(() => avisos.push(String(e.leer())));
    e.escribir("a");
    e.escribir("b");
    expect(e.leer()).toBe("b");
    expect(avisos).toEqual(["a", "b"]);
    baja();
    e.escribir(null);
    expect(e.leer()).toBeNull();
    expect(avisos).toEqual(["a", "b"]);
  });

  it("escribir el MISMO valor no avisa (ni un repintado de más)", () => {
    const e = crearEstadoFilaActiva("a");
    let n = 0;
    e.suscribir(() => n++);
    e.escribir("a");
    expect(n).toBe(0);
    e.escribir("b");
    e.escribir("b");
    expect(n).toBe(1);
  });

  it("darse de baja durante el aviso no rompe la vuelta", () => {
    const e = crearEstadoFilaActiva();
    const vistos: number[] = [];
    const baja1 = e.suscribir(() => {
      vistos.push(1);
      baja1();
    });
    e.suscribir(() => vistos.push(2));
    e.escribir("x");
    e.escribir("y");
    expect(vistos).toEqual([1, 2, 2]);
  });
});

describe("instantaneaFila y atributosDeInstantanea: lo que cada fila necesita, en UN número", () => {
  const CLAVES = ["a", "b", "c"];

  it("sin activa: la primera es la entrada (2), las demás 0", () => {
    expect(instantaneaFila("a", null, CLAVES)).toBe(2);
    expect(instantaneaFila("b", null, CLAVES)).toBe(0);
    expect(instantaneaFila("c", null, CLAVES)).toBe(0);
  });

  it("con activa pintada: ella es activa Y entrada (3); las demás 0", () => {
    expect(instantaneaFila("b", "b", CLAVES)).toBe(BIT_FILA_ACTIVA | BIT_FILA_ENTRADA);
    expect(instantaneaFila("a", "b", CLAVES)).toBe(0);
    expect(instantaneaFila("c", "b", CLAVES)).toBe(0);
  });

  it("activa en otra página (no pintada): la primera vuelve a ser la entrada (2)", () => {
    expect(instantaneaFila("a", "zzz", CLAVES)).toBe(2);
    expect(instantaneaFila("b", "zzz", CLAVES)).toBe(0);
  });

  it("al mover la activa de b a c SOLO cambian b y c (las demás conservan su número: no se repintan)", () => {
    const antes = CLAVES.map((k) => instantaneaFila(k, "b", CLAVES));
    const despues = CLAVES.map((k) => instantaneaFila(k, "c", CLAVES));
    expect(antes).toEqual([0, 3, 0]);
    expect(despues).toEqual([0, 0, 3]);
    // Con 100 filas, cambiar de la 7 a la 8 deja 98 números iguales.
    const cien = Array.from({ length: 100 }, (_, i) => `f${i}`);
    const a = cien.map((k) => instantaneaFila(k, "f7", cien));
    const b = cien.map((k) => instantaneaFila(k, "f8", cien));
    expect(cien.filter((_, i) => a[i] !== b[i])).toEqual(["f7", "f8"]);
  });

  it("atributosDeInstantanea reproduce atributosFila bit a bit", () => {
    expect(atributosDeInstantanea("b", 3, "/x/b")).toEqual(atributosFila("b", "b", "b", "/x/b"));
    expect(atributosDeInstantanea("a", 2)).toEqual(atributosFila("a", null, "a"));
    expect(atributosDeInstantanea("c", 0)).toEqual(atributosFila("c", "b", "b"));
    // Activa sin ser entrada no existe en la práctica (la activa pintada es la
    // entrada), pero el número 1 se traduce igual.
    expect(atributosDeInstantanea("c", 1)).toEqual({ "data-fila": "c", tabIndex: -1, "data-fila-activa": "", "aria-current": true });
  });
});

describe("indiceEnlaceDeFila", () => {
  it("coincidencia EXACTA ⇒ su índice (aunque no sea el primero)", () => {
    expect(indiceEnlaceDeFila(["/admin/flights/9", "/admin/x/1", "/admin/x/1"], "/admin/x/1")).toBe(1);
    expect(indiceEnlaceDeFila(["/admin/x/1"], "/admin/x/1")).toBe(0);
  });

  it("sin href o sin coincidencia ⇒ null (jamás 0 por defecto)", () => {
    expect(indiceEnlaceDeFila(["/admin/flights/9"], null)).toBeNull();
    expect(indiceEnlaceDeFila(["/admin/flights/9"], undefined)).toBeNull();
    expect(indiceEnlaceDeFila(["/admin/flights/9"], "")).toBeNull();
    expect(indiceEnlaceDeFila(["/admin/flights/9", null], "/admin/x/1")).toBeNull();
    expect(indiceEnlaceDeFila([], "/admin/x/1")).toBeNull();
  });

  it("«/x/1» no casa con «/x/10»", () => {
    expect(indiceEnlaceDeFila(["/x/10"], "/x/1")).toBeNull();
    expect(indiceEnlaceDeFila(["/x/1"], "/x/10")).toBeNull();
  });
});

describe("scrollParaVerFila", () => {
  const marco = { scrollTop: 200, altoVisible: 400, altoFijoArriba: 40 };

  it("fila bajo el thead ⇒ top − cabecera", () => {
    expect(scrollParaVerFila(marco, { top: 220, alto: 40 })).toBe(180);
  });

  it("fila asomando abajo ⇒ top + alto − altoVisible", () => {
    expect(scrollParaVerFila(marco, { top: 580, alto: 40 })).toBe(220);
  });

  it("fila más alta que la banda ⇒ alineada arriba (bajo el thead)", () => {
    expect(scrollParaVerFila(marco, { top: 700, alto: 500 })).toBe(660);
  });

  it("ya visible ⇒ null", () => {
    expect(scrollParaVerFila(marco, { top: 240, alto: 40 })).toBeNull();
    expect(scrollParaVerFila(marco, { top: 560, alto: 40 })).toBeNull();
  });

  it("nunca negativo; cabecera 0 también cuadra", () => {
    expect(scrollParaVerFila({ scrollTop: 300, altoVisible: 400, altoFijoArriba: 40 }, { top: 10, alto: 40 })).toBe(0);
    expect(scrollParaVerFila({ scrollTop: 0, altoVisible: 400, altoFijoArriba: 0 }, { top: 390, alto: 40 })).toBe(30);
    expect(scrollParaVerFila({ scrollTop: 0, altoVisible: 400, altoFijoArriba: 0 }, { top: 0, alto: 40 })).toBeNull();
  });
});
