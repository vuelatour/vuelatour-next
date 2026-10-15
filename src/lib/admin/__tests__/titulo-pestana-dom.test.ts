import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  crearControlTituloPestana,
  normalizarTituloDocumento,
  type VigilanteTitulo,
} from "@/lib/admin/titulo-pestana-dom";

/**
 * <TituloPestana> (14-oct-2026): el título con DATOS lo pone la página
 * («Vuelo #315 · Beh Kay · Vuelatour») y sobrevive a que Next vuelva a montar
 * su <title> genérico en cada respuesta del servidor (router.refresh() de
 * RefreshOnFocus, server actions, `?mes=`). Aquí el documento y el
 * MutationObserver son simulados: `escribirNext` es lo que hace React al
 * montar el <title> de la respuesta nueva.
 */

const GENERICO = "Vuelo · Vuelatour";
const VUELO = "Vuelo #315 · Beh Kay · Vuelatour";
const LISTA = "Vuelos · Vuelatour";

function arnes(inicial = GENERICO) {
  let titulo = inicial;
  const escrituras: string[] = [];
  const vigilantes: Array<{
    alCambiar: () => void;
    observando: boolean;
    pendientes: number;
    objetivo: object | null;
  }> = [];
  const head = {};
  const doc = {
    get title() {
      return titulo;
    },
    set title(v: string) {
      titulo = normalizarTituloDocumento(v);
      escrituras.push(titulo);
      for (const w of vigilantes) if (w.observando) w.pendientes++;
    },
    head,
  };
  const control = crearControlTituloPestana(doc, (alCambiar) => {
    const w = { alCambiar, observando: false, pendientes: 0, objetivo: null as object | null };
    vigilantes.push(w);
    const vigilante: VigilanteTitulo = {
      observe(objetivo) {
        w.observando = true;
        w.objetivo = objetivo;
      },
      takeRecords() {
        const n = w.pendientes;
        w.pendientes = 0;
        return Array.from({ length: n });
      },
      disconnect() {
        w.observando = false;
        w.pendientes = 0;
      },
    };
    return vigilante;
  });
  /** React monta el <title> de una respuesta nueva; luego corren los microtasks. */
  const escribirNext = (texto: string) => {
    titulo = texto;
    for (const w of vigilantes) if (w.observando) w.pendientes++;
    entregar();
  };
  /** Entrega los registros pendientes (lo que hace el navegador en un microtask). */
  const entregar = () => {
    for (const w of vigilantes) {
      if (w.observando && w.pendientes > 0) {
        w.pendientes = 0;
        w.alCambiar();
      }
    }
  };
  return {
    control,
    head,
    escrituras,
    vigilantes,
    escribirNext,
    entregar,
    titulo: () => titulo,
    activos: () => vigilantes.filter((w) => w.observando).length,
  };
}

describe("normalizarTituloDocumento = lo que devuelve document.title", () => {
  it("colapsa y recorta espacios ASCII; el punto medio y el NBSP no son espacios", () => {
    expect(normalizarTituloDocumento("  Vuelo   #315 ·\tBeh\nKay  ")).toBe("Vuelo #315 · Beh Kay");
    expect(normalizarTituloDocumento("a b")).toBe("a b");
  });
});

describe("crearControlTituloPestana", () => {
  it("pone el título al montar y vigila el <head>", () => {
    const a = arnes();
    a.control.fijar(VUELO);
    expect(a.titulo()).toBe(VUELO);
    expect(a.activos()).toBe(1);
    expect(a.vigilantes[0].objetivo).toBe(a.head);
  });

  it("Next remonta su <title> genérico (router.refresh): se repone el nuestro", () => {
    const a = arnes();
    a.control.fijar(VUELO);
    a.escribirNext(GENERICO);
    expect(a.titulo()).toBe(VUELO);
    a.escribirNext(GENERICO);
    expect(a.titulo()).toBe(VUELO);
  });

  it("lo que escribe no lo despierta: sin ciclos ni escrituras de más", () => {
    const a = arnes();
    a.control.fijar(VUELO);
    a.entregar();
    a.entregar();
    expect(a.escrituras).toEqual([VUELO]);
    // Con espacios dobles (document.title los colapsa) tampoco hay ciclo.
    const b = arnes();
    b.control.fijar("Vuelo  #315 · Vuelatour");
    b.entregar();
    b.escribirNext(GENERICO);
    expect(b.escrituras).toEqual(["Vuelo #315 · Vuelatour", "Vuelo #315 · Vuelatour"]);
  });

  it("si la pestaña ya dice lo mismo, no escribe", () => {
    const a = arnes(VUELO);
    a.control.fijar(VUELO);
    expect(a.escrituras).toEqual([]);
  });

  it("al desmontar repone el último título de Next y deja de vigilar", () => {
    const a = arnes();
    const limpiar = a.control.fijar(VUELO);
    a.escribirNext("Vuelo · Vuelatour");
    limpiar();
    expect(a.titulo()).toBe(GENERICO);
    expect(a.activos()).toBe(0);
    // Ya sin vigilante, lo que haga Next se queda.
    a.escribirNext(LISTA);
    expect(a.titulo()).toBe(LISTA);
  });

  it("si Next ya puso el de la pantalla nueva, desmontar no lo toca", () => {
    const a = arnes();
    const limpiar = a.control.fijar(VUELO);
    // Mismo commit: React inserta el <title> de la lista antes de la limpieza.
    a.escribirNext(LISTA);
    expect(a.titulo()).toBe(VUELO);
    limpiar();
    expect(a.titulo()).toBe(LISTA);
  });

  it("el título cambia con los datos (otro cliente): limpieza vieja + montaje nuevo", () => {
    const a = arnes();
    const limpiar = a.control.fijar(VUELO);
    limpiar();
    a.control.fijar("Vuelo #315 · Maqar · Vuelatour");
    expect(a.titulo()).toBe("Vuelo #315 · Maqar · Vuelatour");
    expect(a.activos()).toBe(1);
  });

  it("dos montados a la vez: manda el último y no se pelean; al irse, vuelve el anterior", () => {
    const a = arnes();
    const limpiarA = a.control.fijar(VUELO);
    const limpiarB = a.control.fijar("Cotización #332 · Beh Kay · Vuelatour");
    expect(a.titulo()).toBe("Cotización #332 · Beh Kay · Vuelatour");
    expect(a.activos()).toBe(1);
    a.escribirNext(GENERICO);
    expect(a.titulo()).toBe("Cotización #332 · Beh Kay · Vuelatour");
    const escriturasAntes = a.escrituras.length;
    a.entregar();
    expect(a.escrituras.length).toBe(escriturasAntes);
    limpiarB();
    expect(a.titulo()).toBe(VUELO);
    limpiarA();
    // Vuelve el ÚLTIMO de Next, nunca uno nuestro.
    expect(a.titulo()).toBe(GENERICO);
    expect(a.activos()).toBe(0);
  });

  it("limpiar dos veces no rompe nada", () => {
    const a = arnes();
    const limpiar = a.control.fijar(VUELO);
    limpiar();
    limpiar();
    expect(a.titulo()).toBe(GENERICO);
    expect(a.activos()).toBe(0);
  });

  it("sin <head> pone el título igual (no hay a quién vigilar)", () => {
    let titulo = GENERICO;
    const control = crearControlTituloPestana(
      {
        get title() {
          return titulo;
        },
        set title(v: string) {
          titulo = v;
        },
        head: null,
      },
      () => {
        throw new Error("no debía crear vigilante");
      },
    );
    const limpiar = control.fijar(VUELO);
    expect(titulo).toBe(VUELO);
    limpiar();
    expect(titulo).toBe(GENERICO);
  });
});

describe("el componente <TituloPestana>", () => {
  const fuente = readFileSync(
    join(__dirname, "..", "..", "..", "components", "admin", "titulo-pestana.tsx"),
    "utf8",
  );

  it("es cliente, aplica la plantilla del layout y usa useLayoutEffect (limpieza dentro del commit)", () => {
    expect(fuente.startsWith('"use client";')).toBe(true);
    expect(fuente).toContain("useLayoutEffect(() => controlDelDocumento().fijar(tituloConPlantilla(titulo)), [titulo]);");
    expect(fuente).toContain('import { useLayoutEffect } from "react";');
    expect(fuente).not.toMatch(/\buseEffect\s*\(/);
    expect(fuente).toContain("new MutationObserver(");
    expect(fuente).toContain("return null;");
  });
});
