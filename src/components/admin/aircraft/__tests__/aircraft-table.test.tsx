/**
 * Lista de flota: el CABLEADO de las columnas del pizarrón (22-sep-2026).
 * Los textos y los tonos se prueban aparte en
 * `lib/admin/__tests__/servicio-flota.test.ts`; aquí se cuida lo que el
 * cliente marcó en la foto — que las tres columnas tachadas se hayan ido, que
 * las cuatro nuevas lleguen al marcado y que un API SIN el campo `servicio`
 * (deploy en dos tiempos) pinte «—» sin romper la pantalla.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AircraftTable } from "../aircraft-table";
import type { Aircraft, ServicioFlota } from "@/types/aircraft";

/** Campos de la ficha que la tabla ya no pinta pero el tipo exige. */
const base: Aircraft = {
  id: "a-1",
  matricula: "N4142R",
  modelo: "Saab 340B",
  pais_registro: "USA",
  num_motores: 2,
  ultimo_taco: 4458,
  velocidad_crucero_kts: "250",
  asientos: 33,
  motor_hp: null,
  caracteristicas: null,
  tarifa_hora_pub_usd: "3500",
  tarifa_hora_broker_usd: "3200",
  reserva_overhaul_hr_usd: null,
  color_calendario: null,
  ubicacion_base: "CUN",
  activa: true,
  notas: null,
  servicio_intervalos: [50, 100, 500, 1000],
  servicio_horas_base: 4200,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-12T00:00:00Z",
};

/** N4142R real: último 4455.1 (12-sep), siguiente 4500 (100 hrs), faltan 42. */
const servicioN4142R: ServicioFlota = {
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

/** XA-VGV: 9.8 h para el hito de 500 hrs, con la orden ya creada sin fecha. */
const servicioXaVgv: ServicioFlota = {
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

const render = (filas: Aircraft[]) =>
  renderToStaticMarkup(<AircraftTable aircraft={filas} />);

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("AircraftTable · columnas del pizarrón", () => {
  const html = render([{ ...base, servicio: servicioN4142R }]);

  it("salen las cuatro columnas nuevas", () => {
    const t = texto(html);
    expect(t).toContain("Último servicio");
    expect(t).toContain("Siguiente servicio");
    expect(t).toContain("Restante");
    expect(t).toContain("Tipo");
  });

  it("ya no salen Pax ni las dos tarifas (las tachó el cliente)", () => {
    const t = texto(html);
    expect(t).not.toContain("Pax");
    expect(t).not.toContain("USD/hr público");
    expect(t).not.toContain("USD/hr broker");
    // Ni los valores: el 33 de asientos y los 3,500 / 3,200 USD.
    expect(t).not.toContain("3,500");
    expect(t).not.toContain("3,200");
  });

  it("«Último taco» se queda: es el «Tact. Actual» de la hoja", () => {
    const t = texto(html);
    expect(t).toContain("Último taco");
    expect(t).toContain("4458.0 h");
  });

  it("pinta los números del N4142R con su etapa y su fecha", () => {
    const t = texto(html);
    expect(t).toContain("4455.1 h");
    expect(t).toContain("Servicio 50 hrs · 12 sep 2026");
    expect(t).toContain("4500.0 h");
    expect(t).toContain("faltan 42.0 h");
    expect(t).toContain("100 hrs");
  });

  it("el nombre largo de la etapa queda en el tooltip del tipo", () => {
    expect(html).toContain('title="Servicio 100 hrs / Anual"');
  });
});

describe("AircraftTable · avisos de servicio", () => {
  it("XA-VGV: ámbar a 9.8 h y la orden que ya existe sin fecha", () => {
    const html = render([
      {
        ...base,
        id: "a-2",
        matricula: "XA-VGV",
        ultimo_taco: 2240.2,
        servicio: servicioXaVgv,
      },
    ]);
    expect(texto(html)).toContain("faltan 9.8 h");
    expect(html).toContain("text-amber-600");
    expect(texto(html)).toContain("Orden programada · falta confirmar fecha");
    // El enlace para actuar vive en el expediente: aquí no se anida un <a>.
    expect(html).not.toContain("#mantenimientos");
  });

  it("vencido: «vencido por 30.0 h» en rojo (el «−30» de la hoja)", () => {
    const html = render([
      {
        ...base,
        id: "a-3",
        matricula: "N58BT",
        ultimo_taco: 1449.2,
        servicio: {
          ...servicioN4142R,
          siguiente: {
            hobbs_hr: 1419.2,
            intervalo_hr: 100,
            etiqueta: "Servicio 100 hrs",
            faltan_hr: -30,
            orden: null,
          },
        },
      },
    ]);
    expect(texto(html)).toContain("vencido por 30.0 h");
    expect(html).toContain("text-destructive");
  });

  it("N58BT: el hito de la fila no tiene orden, pero el avión está en taller", () => {
    // Caso REAL: orden de 100 h abierta a las 1,600 h (EN_TALLER) con el
    // tacómetro en 1,627.2 ⇒ el programa ya apunta al hito de 1,700 y la
    // celda dice «faltan 72.8 h». Sin la sublínea, la tabla que la oficina
    // lee a diario no dice que el avión está parado.
    const fila = {
      ...base,
      id: "a-5",
      matricula: "N58BT",
      ultimo_taco: 1627.2,
      en_taller: true,
      servicio: {
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
      } satisfies ServicioFlota,
    };
    const conTaller = texto(render([fila]));
    expect(conTaller).toContain("faltan 72.8 h");
    expect(conTaller).toContain("En taller");
    expect(conTaller).toContain("base del programa");
    // Sin el flag (avión sano) la sublínea no aparece.
    expect(texto(render([{ ...fila, en_taller: false }]))).not.toContain(
      "En taller",
    );
  });
});

describe("AircraftTable · sin programa y API sin desplegar", () => {
  it("`servicio: null` (XB-IJP): cuatro guiones y el porqué en el tooltip", () => {
    const html = render([
      {
        ...base,
        id: "a-4",
        matricula: "XB-IJP",
        activa: false,
        ultimo_taco: null,
        servicio: null,
      },
    ]);
    expect(html).toContain('title="Sin programa de servicio"');
    expect(texto(html)).toContain("XB-IJP");
    expect(texto(html)).not.toContain("faltan");
  });

  it("API viejo (sin el campo): la fila pinta «—» y no afirma nada", () => {
    const html = render([base]);
    expect(texto(html)).toContain("N4142R");
    expect(texto(html)).toContain("—");
    expect(html).not.toContain("Sin programa de servicio");
    expect(texto(html)).not.toContain("faltan");
  });
});
