/**
 * Las cuatro columnas de servicio de la lista de flota, congeladas con los
 * datos REALES del 22-sep-2026 (Supabase prod, solo lectura) y con el
 * pizarrón que la oficina llena a mano — que es contra lo que el cliente va a
 * comparar la pantalla.
 */
import { describe, expect, it } from "vitest";
import {
  CLASE_TONO_RESTANTE,
  GUION,
  SIN_PROGRAMA,
  SIN_SERVICIOS,
  estadoOrdenDeServicio,
  etiquetaTipoServicio,
  horasTaco,
  nombreEtapaSiguiente,
  textoRestante,
  textoSiguienteServicio,
  textoUltimoServicio,
  tituloSinServicio,
  tonoRestante,
} from "../servicio-flota";
import { TEXTO_EN_TALLER } from "../proximo-servicio";
import type { ServicioFlota } from "@/types/aircraft";

/**
 * N4142R: programa [50,100,500,1000] con base 4200, taco 4458.0. El último
 * COMPLETADO del avión es el de 4455.1 h del 12-sep (había otro de 4406.6 h,
 * más viejo y con taco más bajo). El hito que sigue es 4500 y cae en 100 hrs.
 */
const n4142r: ServicioFlota = {
  ultimo: {
    hobbs_hr: 4455.1,
    fecha: "2026-09-12",
    etiqueta: "Servicio 50 hrs",
    origen: "MANTENIMIENTO",
  },
  siguiente: {
    hobbs_hr: 4500,
    intervalo_hr: 100,
    etiqueta: "Servicio 100 hrs / Anual",
    faltan_hr: 42,
    orden: null,
  },
  aviso_automatico: { activo: true, umbral_hr: 10 },
};

/**
 * XA-VGV: el avión del reporte del 19-sep. Taco 2240.2 contra el hito de
 * 2250 (500 hrs) ⇒ faltan 9.8 h, dentro del margen, y la orden PROGRAMADO
 * que el sistema creó solo el 19-sep sigue sin fecha acordada con el taller.
 */
const xaVgv: ServicioFlota = {
  ultimo: {
    hobbs_hr: 2216.9,
    fecha: "2026-08-28",
    etiqueta: "50 hrs",
    origen: "MANTENIMIENTO",
  },
  siguiente: {
    hobbs_hr: 2250,
    intervalo_hr: 500,
    etiqueta: "Servicio 500 hrs",
    faltan_hr: 9.8,
    orden: {
      id: "m-500",
      estado: "PROGRAMADO",
      fecha_programada: null,
      automatica: true,
    },
  },
  aviso_automatico: { activo: true, umbral_hr: 10 },
};

/**
 * XB-ANU: en el pizarrón dice «Pendiente tarjeta aeronave». Tiene programa
 * (base 1253.9) pero NINGÚN servicio registrado, así que el «último» que
 * manda el API es el arranque del programa, no algo que alguien haya hecho.
 */
const xbAnu: ServicioFlota = {
  ultimo: { hobbs_hr: "1253.9", fecha: null, etiqueta: null, origen: "BASE" },
  siguiente: {
    hobbs_hr: "1403.9",
    intervalo_hr: "50.00",
    etiqueta: "50 hrs",
    faltan_hr: "22.3",
    orden: null,
  },
  aviso_automatico: { activo: true, umbral_hr: 10 },
};

/** El renglón rojo del pizarrón: «Tiempo restante −30». */
const vencido: ServicioFlota = {
  ultimo: {
    hobbs_hr: 1319.2,
    fecha: "2026-07-02",
    etiqueta: "100 hrs",
    origen: "MANTENIMIENTO",
  },
  siguiente: {
    hobbs_hr: 1419.2,
    intervalo_hr: 100,
    etiqueta: "Servicio 100 hrs",
    faltan_hr: -30,
    orden: null,
  },
  aviso_automatico: { activo: true, umbral_hr: 10 },
};

describe("Último servicio (Últ. Tact. Serv. del pizarrón)", () => {
  it("N4142R: el taco con el que se hizo, con etapa y fecha corta", () => {
    expect(textoUltimoServicio(n4142r)).toEqual({
      taco: "4455.1 h",
      detalle: "Servicio 50 hrs · 12 sep 2026",
    });
  });

  it("XA-VGV: 2216.9 h del 28 de agosto", () => {
    expect(textoUltimoServicio(xaVgv)).toEqual({
      taco: "2216.9 h",
      detalle: "50 hrs · 28 ago 2026",
    });
  });

  it("sin servicio registrado se dice que es la BASE, no un servicio hecho", () => {
    expect(textoUltimoServicio(xbAnu)).toEqual({
      taco: "1253.9 h",
      detalle: "base del programa",
    });
  });

  it("un COMPLETADO sin fecha capturada pinta solo la etapa", () => {
    expect(
      textoUltimoServicio({
        ...n4142r,
        ultimo: { ...n4142r.ultimo!, fecha: null },
      }).detalle,
    ).toBe("Servicio 50 hrs");
  });

  it("XB-IJP (sin programa) y un API sin desplegar: guion, nunca un 0", () => {
    expect(textoUltimoServicio(null)).toEqual({ taco: GUION, detalle: null });
    expect(textoUltimoServicio(undefined)).toEqual({
      taco: GUION,
      detalle: null,
    });
  });
});

describe("Siguiente servicio (Sig. Servicio del pizarrón)", () => {
  it("N4142R va al hito de 4500 h", () => {
    expect(textoSiguienteServicio(n4142r)).toBe("4500.0 h");
  });
  it("XA-VGV va al de 2250 h", () => {
    expect(textoSiguienteServicio(xaVgv)).toBe("2250.0 h");
  });
  it("numéricos como CADENA (PostgREST) se leen igual", () => {
    expect(textoSiguienteServicio(xbAnu)).toBe("1403.9 h");
  });
  it("sin programa: guion", () => {
    expect(textoSiguienteServicio(null)).toBe(GUION);
    expect(textoSiguienteServicio(undefined)).toBe(GUION);
  });
});

describe("Tiempo restante", () => {
  it("N4142R: faltan 42.0 h y todavía no es aviso", () => {
    expect(textoRestante(n4142r)).toBe("faltan 42.0 h");
    expect(tonoRestante(n4142r)).toBe("ok");
  });

  it("XA-VGV: 9.8 h ya están dentro del margen ⇒ ÁMBAR", () => {
    expect(textoRestante(xaVgv)).toBe("faltan 9.8 h");
    expect(tonoRestante(xaVgv)).toBe("ambar");
  });

  it("el margen sale del API: con aviso de 5 h, 9.8 h todavía no es ámbar", () => {
    const conMargen5 = { ...xaVgv, aviso_automatico: { activo: true, umbral_hr: 5 } };
    expect(tonoRestante(conMargen5)).toBe("ok");
  });

  it("vencido: «vencido por 30.0 h» en ROJO (el «−30» del pizarrón)", () => {
    expect(textoRestante(vencido)).toBe("vencido por 30.0 h");
    expect(tonoRestante(vencido)).toBe("rojo");
    expect(CLASE_TONO_RESTANTE.rojo).toContain("text-destructive");
  });

  it("el vencido NO se recorta a cero ni se disfraza de «ya casi»", () => {
    expect(textoRestante(vencido)).not.toContain("faltan");
    expect(textoRestante(vencido)).not.toBe("faltan 0.0 h");
  });

  it("0.0 h exactas: toca hoy, ámbar (todavía no está vencido)", () => {
    const justo = {
      ...n4142r,
      siguiente: { ...n4142r.siguiente!, faltan_hr: 0 },
    };
    expect(textoRestante(justo)).toBe("faltan 0.0 h");
    expect(tonoRestante(justo)).toBe("ambar");
  });

  it("−0.04 h redondea a 0.0: no se anuncia un vencido que no existe", () => {
    const casi = {
      ...n4142r,
      siguiente: { ...n4142r.siguiente!, faltan_hr: -0.04 },
    };
    expect(textoRestante(casi)).toBe("faltan 0.0 h");
    expect(tonoRestante(casi)).toBe("ambar");
  });

  it("sin programa no se colorea ni se inventa número", () => {
    expect(textoRestante(null)).toBe(GUION);
    expect(tonoRestante(null)).toBeNull();
    expect(tonoRestante(undefined)).toBeNull();
  });
});

describe("Tipo del siguiente servicio", () => {
  it("la etiqueta corta del pizarrón sale del intervalo", () => {
    expect(etiquetaTipoServicio(n4142r)).toBe("100 hrs");
    expect(etiquetaTipoServicio(xaVgv)).toBe("500 hrs");
  });
  it("«50.00» (numeric de Postgres) no se pinta con decimales", () => {
    expect(etiquetaTipoServicio(xbAnu)).toBe("50 hrs");
  });
  it("el nombre completo de la etapa queda para el tooltip", () => {
    expect(nombreEtapaSiguiente(n4142r)).toBe("Servicio 100 hrs / Anual");
    expect(nombreEtapaSiguiente(null)).toBeUndefined();
  });
  it("sin programa: guion", () => {
    expect(etiquetaTipoServicio(null)).toBe(GUION);
    expect(etiquetaTipoServicio(undefined)).toBe(GUION);
  });
});

describe("Sublínea de la orden (reusa estadoOrdenServicio)", () => {
  it("XA-VGV: la orden existe y le falta fecha", () => {
    const e = estadoOrdenDeServicio(xaVgv);
    expect(e?.texto).toBe("Orden programada · falta confirmar fecha");
    expect(e?.tono).toBe("ambar");
  });

  it("orden EN TALLER", () => {
    const e = estadoOrdenDeServicio({
      ...xaVgv,
      siguiente: {
        ...xaVgv.siguiente!,
        orden: {
          id: "m-1",
          estado: "EN_TALLER",
          fecha_programada: "2026-09-20",
          automatica: false,
        },
      },
    });
    expect(e?.texto).toBe("En taller");
  });

  it("orden con fecha: se dice el día con el formato del resto del panel", () => {
    const e = estadoOrdenDeServicio({
      ...xaVgv,
      siguiente: {
        ...xaVgv.siguiente!,
        orden: {
          id: "m-1",
          estado: "PROGRAMADO",
          fecha_programada: "2026-09-25",
          automatica: true,
        },
      },
    });
    expect(e?.texto).toBe("Orden programada para 25 sep 2026");
  });

  it("sin orden la LISTA calla (la promesa «se genera sola» es del expediente)", () => {
    expect(estadoOrdenDeServicio(n4142r)).toBeNull();
    expect(estadoOrdenDeServicio(null)).toBeNull();
  });

  /**
   * N58BT REAL (22-sep-2026): orden de 100 h abierta a las 1,600 h y EN
   * TALLER, con el tacómetro ya en 1,627.2 ⇒ el hito que calcula el programa
   * es el siguiente (1,700) y NO tiene orden. La celda dice «faltan 72.8 h»;
   * callar que el avión está parado sería la lectura tranquilizadora de más.
   */
  it("N58BT: sin orden para el hito pero EN TALLER ⇒ se dice", () => {
    const n58bt: ServicioFlota = {
      ultimo: {
        hobbs_hr: 1500,
        fecha: null,
        etiqueta: null,
        origen: "BASE",
      },
      siguiente: {
        hobbs_hr: 1700,
        intervalo_hr: 100,
        etiqueta: "Servicio de 100 hr",
        faltan_hr: 72.8,
        orden: null,
      },
      aviso_automatico: { activo: true, umbral_hr: 10 },
    };
    expect(estadoOrdenDeServicio(n58bt)).toBeNull();
    const e = estadoOrdenDeServicio(n58bt, { enTaller: true });
    expect(e?.texto).toBe("En taller");
    // El MISMO texto que usa la orden EN_TALLER: una sola redacción.
    expect(e?.texto).toBe(TEXTO_EN_TALLER);
    expect(e?.accion).toBeNull();
  });

  it("con orden propia manda la orden, no el respaldo de taller", () => {
    const e = estadoOrdenDeServicio(xaVgv, { enTaller: true });
    expect(e?.texto).toBe("Orden programada · falta confirmar fecha");
  });
});

describe("Celdas vacías: qué se explica y qué se calla", () => {
  it("el API dice que NO hay programa ⇒ se explica", () => {
    expect(tituloSinServicio(null)).toBe(SIN_PROGRAMA);
  });
  it("API sin desplegar ⇒ no se afirma nada", () => {
    expect(tituloSinServicio(undefined)).toBeUndefined();
  });
  it("con programa vigente el hueco es el ÚLTIMO servicio, no el programa", () => {
    expect(tituloSinServicio({ ...n4142r, ultimo: null })).toBe(SIN_SERVICIOS);
  });
});

describe("horasTaco", () => {
  it("un decimal, sin separador de miles (igual que «Último taco»)", () => {
    expect(horasTaco(5509.9)).toBe("5509.9 h");
    expect(horasTaco("1354.76")).toBe("1354.8 h");
    expect(horasTaco(1618)).toBe("1618.0 h");
  });
  it("basura o vacío ⇒ guion", () => {
    expect(horasTaco(null)).toBe(GUION);
    expect(horasTaco("")).toBe(GUION);
    expect(horasTaco("x")).toBe(GUION);
  });
});
