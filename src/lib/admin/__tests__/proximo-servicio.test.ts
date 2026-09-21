import { describe, expect, it } from "vitest";
import {
  ANCLA_MANTENIMIENTOS,
  CLASE_TONO_SERVICIO,
  dentroDelUmbral,
  estadoOrdenServicio,
  faltaConfirmarFecha,
  faltanHoras,
  UMBRAL_ORDEN_HR,
  umbralServicio,
} from "../proximo-servicio";
import type { OrdenServicioProgramada } from "@/types/aircraft";

/** Fecha fija y legible, para no depender de los datos de Intl del runner. */
const fecha = (f: string) => `día ${f.slice(0, 10)}`;
const opts = { formatearFecha: fecha };

const ordenAuto: OrdenServicioProgramada = {
  id: "m-1",
  estado: "PROGRAMADO",
  fecha_programada: null,
  automatica: true,
};

describe("faltanHoras (metrics manda faltan_hr, tacómetros manda faltan)", () => {
  it("acepta los dos nombres del campo", () => {
    expect(faltanHoras({ faltan_hr: 9.8 })).toBe(9.8);
    expect(faltanHoras({ faltan: 9.8 })).toBe(9.8);
  });
  it("coacciona strings de Postgres y rechaza basura", () => {
    expect(faltanHoras({ faltan_hr: "9.8" })).toBe(9.8);
    expect(faltanHoras({ faltan_hr: "x" })).toBeNull();
    expect(faltanHoras({ faltan_hr: null })).toBeNull();
    expect(faltanHoras(null)).toBeNull();
  });
});

describe("dentroDelUmbral", () => {
  it("el caso del XA-VGV: 9.8 h está dentro de las 10 h de aviso", () => {
    expect(dentroDelUmbral({ faltan_hr: 9.8 })).toBe(true);
  });
  it("10.0 h EXACTAS cuentan (el API ya disparó; el «< 10» de antes no pintaba ámbar)", () => {
    expect(dentroDelUmbral({ faltan_hr: UMBRAL_ORDEN_HR })).toBe(true);
  });
  it("11.2 h (lo que había a las 08:00 de ese día) todavía no", () => {
    expect(dentroDelUmbral({ faltan_hr: 11.2 })).toBe(false);
  });
  it("vencido (negativo) también está dentro", () => {
    expect(dentroDelUmbral({ faltan_hr: -3 })).toBe(true);
  });
  it("sin número no se afirma nada", () => {
    expect(dentroDelUmbral(null)).toBe(false);
    expect(dentroDelUmbral({ faltan_hr: null })).toBe(false);
  });
});

describe("estadoOrdenServicio — API sin desplegar", () => {
  it("sin el campo `orden` NO se promete nada: la UI queda como hoy", () => {
    expect(estadoOrdenServicio({ faltan_hr: 9.8 })).toBeNull();
  });
  it("sin próximo servicio tampoco", () => {
    expect(estadoOrdenServicio(null)).toBeNull();
    expect(estadoOrdenServicio(undefined)).toBeNull();
  });
});

describe("estadoOrdenServicio — sin orden abierta", () => {
  it("dentro del umbral dice que se genera sola (ya no «solo una leyenda»)", () => {
    const e = estadoOrdenServicio({ faltan_hr: 9.8, orden: null }, opts);
    expect(e?.texto).toBe("La orden se genera sola en unos minutos");
    expect(e?.tono).toBe("neutro");
    expect(e?.accion).toBeNull();
    expect(e?.detalle).toMatch(/cada 10 minutos/);
  });
  it("todavía lejos: no se pinta línea", () => {
    expect(
      estadoOrdenServicio({ faltan_hr: 11.2, orden: null }, opts),
    ).toBeNull();
  });
  it("el umbral se puede sobreescribir con el del API", () => {
    expect(
      estadoOrdenServicio(
        { faltan_hr: 9.8, orden: null },
        { ...opts, umbralHr: 5 },
      ),
    ).toBeNull();
  });
});

describe("estadoOrdenServicio — orden PROGRAMADA sin fecha", () => {
  const e = estadoOrdenServicio({ faltan_hr: 9.8, orden: ordenAuto }, opts);

  it("es lo único que pide acción: ámbar + enlace a Mantenimientos", () => {
    expect(e?.texto).toBe("Orden programada · falta confirmar fecha");
    expect(e?.tono).toBe("ambar");
    expect(e?.accion).toEqual({
      texto: "Poner fecha",
      href: ANCLA_MANTENIMIENTOS,
    });
  });
  it("el detalle dice QUIÉN la creó (la duda del cliente: «¿es enunciativa?»)", () => {
    expect(e?.detalle).toMatch(/La creó el sistema/);
    const manual = estadoOrdenServicio(
      { faltan_hr: 9.8, orden: { ...ordenAuto, automatica: false } },
      opts,
    );
    expect(manual?.detalle).toMatch(/La capturó alguien de la oficina/);
  });
  it("una fecha vacía se trata como sin fecha", () => {
    const vacia = estadoOrdenServicio(
      { faltan_hr: 9.8, orden: { ...ordenAuto, fecha_programada: "   " } },
      opts,
    );
    expect(vacia?.texto).toBe("Orden programada · falta confirmar fecha");
  });
  it("`hrefBase` permite enlazar desde otra pantalla", () => {
    const desdeLista = estadoOrdenServicio(
      { faltan_hr: 9.8, orden: ordenAuto },
      { ...opts, hrefBase: "/admin/aircraft/abc" },
    );
    expect(desdeLista?.accion?.href).toBe(
      `/admin/aircraft/abc${ANCLA_MANTENIMIENTOS}`,
    );
  });
});

describe("estadoOrdenServicio — orden con fecha y en taller", () => {
  it("PROGRAMADO con fecha: ya no hay nada que hacer, solo informa", () => {
    const e = estadoOrdenServicio(
      {
        faltan_hr: 9.8,
        orden: { ...ordenAuto, fecha_programada: "2026-09-25" },
      },
      opts,
    );
    expect(e?.texto).toBe("Orden programada para día 2026-09-25");
    expect(e?.tono).toBe("info");
    expect(e?.accion?.texto).toBe("Ver mantenimiento");
  });
  it("EN_TALLER", () => {
    const e = estadoOrdenServicio(
      { faltan_hr: 2, orden: { ...ordenAuto, estado: "EN_TALLER" } },
      opts,
    );
    expect(e?.texto).toBe("En taller");
    expect(e?.tono).toBe("info");
  });
  it("una orden lejos del hito igual se anuncia (alguien la programó antes)", () => {
    const e = estadoOrdenServicio({ faltan_hr: 40, orden: ordenAuto }, opts);
    expect(e?.texto).toBe("Orden programada · falta confirmar fecha");
  });
  it("estado que este panel no conoce: se dice que existe, sin inventar etapa", () => {
    const e = estadoOrdenServicio(
      {
        faltan_hr: 5,
        orden: {
          ...ordenAuto,
          estado: "ALGO_NUEVO" as OrdenServicioProgramada["estado"],
        },
      },
      opts,
    );
    expect(e?.texto).toBe("Orden de servicio registrada");
  });
});

describe("faltaConfirmarFecha", () => {
  it("solo una PROGRAMADA sin fecha", () => {
    expect(faltaConfirmarFecha(ordenAuto)).toBe(true);
    expect(
      faltaConfirmarFecha({ ...ordenAuto, fecha_programada: "2026-09-25" }),
    ).toBe(false);
    expect(faltaConfirmarFecha({ ...ordenAuto, estado: "EN_TALLER" })).toBe(
      false,
    );
    expect(faltaConfirmarFecha(null)).toBe(false);
  });
});

describe("tonos", () => {
  it("ámbar = acción pendiente; el resto no grita", () => {
    expect(CLASE_TONO_SERVICIO.ambar).toContain("amber");
    expect(CLASE_TONO_SERVICIO.neutro).toBe("text-muted-foreground");
  });
});

/**
 * REVISIÓN ADVERSARIA (20-sep-2026). «La orden se genera sola en unos
 * minutos» es una PROMESA, y solo es cierta si la regla `servicio_horas` está
 * encendida y si el margen que usa el panel es el mismo del API. Con la regla
 * apagada, esa línea sería otra vez «una leyenda» — la queja original.
 */
describe("aviso_automatico: el margen y la promesa salen del API", () => {
  it("margen real del API: con 25 h de aviso, a 20 h ya se está dentro", () => {
    const prox = {
      faltan_hr: 20,
      orden: null,
      aviso_automatico: { activo: true, umbral_hr: 25 },
    };
    expect(umbralServicio(prox)).toBe(25);
    expect(dentroDelUmbral(prox)).toBe(true);
    expect(estadoOrdenServicio(prox, opts)?.texto).toBe(
      "La orden se genera sola en unos minutos",
    );
  });

  it("margen real MENOR: a 9.8 h con aviso de 5 h todavía NO se promete nada", () => {
    const prox = {
      faltan_hr: 9.8,
      orden: null,
      aviso_automatico: { activo: true, umbral_hr: 5 },
    };
    expect(dentroDelUmbral(prox)).toBe(false);
    expect(estadoOrdenServicio(prox, opts)).toBeNull();
  });

  it("regla APAGADA: se dice la verdad y se ofrece capturarla", () => {
    const e = estadoOrdenServicio(
      {
        faltan_hr: 9.8,
        orden: null,
        aviso_automatico: { activo: false, umbral_hr: 10 },
      },
      opts,
    );
    expect(e?.texto).toBe("La orden NO se crea sola · hay que capturarla");
    expect(e?.tono).toBe("ambar");
    expect(e?.accion).toEqual({
      texto: "Crear orden",
      href: ANCLA_MANTENIMIENTOS,
    });
    // Jamás la promesa contraria.
    expect(e?.texto).not.toContain("se genera sola");
  });

  it("apagada pero CON orden: manda el estado de la orden, no el aviso", () => {
    const e = estadoOrdenServicio(
      {
        faltan_hr: 9.8,
        orden: ordenAuto,
        aviso_automatico: { activo: false, umbral_hr: 10 },
      },
      opts,
    );
    expect(e?.texto).toBe("Orden programada · falta confirmar fecha");
  });

  it("aviso_automatico null o ausente ⇒ se conserva el comportamiento de hoy", () => {
    for (const prox of [
      { faltan_hr: 9.8, orden: null, aviso_automatico: null },
      { faltan_hr: 9.8, orden: null },
    ]) {
      expect(umbralServicio(prox)).toBe(UMBRAL_ORDEN_HR);
      expect(estadoOrdenServicio(prox, opts)?.texto).toBe(
        "La orden se genera sola en unos minutos",
      );
    }
  });

  it("un override explícito por opciones sigue ganando", () => {
    const prox = {
      faltan_hr: 9.8,
      orden: null,
      aviso_automatico: { activo: true, umbral_hr: 25 },
    };
    expect(umbralServicio(prox, 5)).toBe(5);
    expect(estadoOrdenServicio(prox, { ...opts, umbralHr: 5 })).toBeNull();
  });
});
