/**
 * Combustibles (1-oct-2026): editar una carga ya subida desde el menú ⋯.
 *
 *  - La FECHA: el diálogo «Verificar / editar» cambia `fecha_gasto`; si la
 *    carga trae `fecha_hora_carga`, la hora se muda al día nuevo (misma hora
 *    Cancún). Sin esto la carga cambiaba de mes en el Balance pero el renglón
 *    seguía diciendo «1 oct 14:20». Regla del API (carga masiva): el día
 *    Cancún de `fecha_hora_carga` ES `fecha_gasto`.
 *  - El renglón pinta la hora solo si cae el mismo día que `fecha_gasto`.
 *  - TIPO y LUGAR se corrigen en el mismo diálogo (solo GAS).
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_EDITAR_CARGA,
  TIPOS_COMBUSTIBLE,
  camposCargaParaPatch,
  claveOrdenCarga,
  diaCancunDeCarga,
  etiquetaTipoCombustible,
  fechaHoraCargaEnDia,
  fechaVisibleCarga,
  momentoParaSugerirVuelo,
  normalizarLugarCarga,
} from "../combustibles";
import { GastoVerifySchema } from "@/app/admin/expenses/schema";

// 1-oct-2026 14:20 en Cancún (UTC−5) = 19:20Z.
const CARGA = "2026-10-01T19:20:00.000Z";

describe("fecha de la carga", () => {
  it("día Cancún de un timestamptz (cruza la medianoche UTC)", () => {
    expect(diaCancunDeCarga(CARGA)).toBe("2026-10-01");
    // 2-oct 03:00Z = 1-oct 22:00 en Cancún.
    expect(diaCancunDeCarga("2026-10-02T03:00:00Z")).toBe("2026-10-01");
    expect(diaCancunDeCarga(null)).toBeNull();
    expect(diaCancunDeCarga("no-es-fecha")).toBeNull();
  });

  it("la MISMA hora Cancún en el día nuevo", () => {
    expect(fechaHoraCargaEnDia(CARGA, "2026-10-03")).toBe("2026-10-03T19:20:00.000Z");
    // Al mes anterior (el caso que mudaba la carga de mes).
    expect(fechaHoraCargaEnDia(CARGA, "2026-09-30")).toBe("2026-09-30T19:20:00.000Z");
    // 22:00 Cancún: el UTC cae al día siguiente, el día Cancún es el pedido.
    const noche = fechaHoraCargaEnDia("2026-10-02T03:00:00Z", "2026-10-05");
    expect(noche).toBe("2026-10-06T03:00:00.000Z");
    expect(diaCancunDeCarga(noche)).toBe("2026-10-05");
    expect(fechaHoraCargaEnDia(null, "2026-10-03")).toBeNull();
    expect(fechaHoraCargaEnDia(CARGA, "")).toBeNull();
    expect(fechaHoraCargaEnDia(CARGA, "03/10/2026")).toBeNull();
  });

  it("el renglón pinta la hora solo si cae el mismo día que fecha_gasto", () => {
    expect(fechaVisibleCarga({ fecha_hora_carga: CARGA, fecha_gasto: "2026-10-01" })).toEqual({
      conHora: true,
      iso: CARGA,
    });
    // Desfasada (editada antes de la regla): manda fecha_gasto.
    expect(fechaVisibleCarga({ fecha_hora_carga: CARGA, fecha_gasto: "2026-09-30" })).toEqual({
      conHora: false,
      fecha: "2026-09-30",
    });
    expect(fechaVisibleCarga({ fecha_hora_carga: null, fecha_gasto: "2026-10-01" })).toEqual({
      conHora: false,
      fecha: "2026-10-01",
    });
    expect(fechaVisibleCarga({ fecha_hora_carga: null, fecha_gasto: null })).toEqual({
      conHora: false,
      fecha: null,
    });
  });

  it("orden por pared Cancún; la carga sin hora va primero en su día", () => {
    const filas = [
      { id: "tarde", fecha_hora_carga: "2026-10-01T23:00:00Z", fecha_gasto: "2026-10-01" },
      { id: "sin-hora", fecha_hora_carga: null, fecha_gasto: "2026-10-01" },
      { id: "temprano", fecha_hora_carga: "2026-10-01T13:00:00Z", fecha_gasto: "2026-10-01" },
      { id: "antes", fecha_hora_carga: null, fecha_gasto: "2026-09-30" },
      // Desfasada: cuenta en su fecha_gasto, no en la hora vieja.
      { id: "movida", fecha_hora_carga: "2026-10-01T15:00:00Z", fecha_gasto: "2026-10-02" },
    ];
    const orden = [...filas]
      .sort((a, b) => claveOrdenCarga(a).localeCompare(claveOrdenCarga(b)))
      .map((f) => f.id);
    expect(orden).toEqual(["antes", "sin-hora", "temprano", "tarde", "movida"]);
  });

  it("«Ligar a vuelo» busca con la hora real o con el mediodía de fecha_gasto", () => {
    expect(momentoParaSugerirVuelo({ fecha_hora_carga: CARGA, fecha_gasto: "2026-10-01" })).toBe(CARGA);
    expect(momentoParaSugerirVuelo({ fecha_hora_carga: CARGA, fecha_gasto: "2026-09-30" })).toBe(
      "2026-09-30T12:00:00Z",
    );
    expect(momentoParaSugerirVuelo({ fecha_hora_carga: null, fecha_gasto: null })).toBeNull();
  });
});

describe("camposCargaParaPatch — lo que el diálogo agrega al PATCH", () => {
  const original = {
    fecha_gasto: "2026-10-01",
    fecha_hora_carga: CARGA,
    tipo_combustible: "AVGAS",
    lugar: "CUN",
  };
  const form = {
    categoria: "GAS",
    fecha_gasto: "2026-10-01",
    tipo_combustible: "AVGAS",
    lugar: "CUN",
  };

  it("sin cambios ⇒ nada (no se reescribe lo que no se tocó)", () => {
    expect(camposCargaParaPatch(original, form)).toEqual({});
    // Lugar legado en minúsculas que nadie tocó: no se «corrige» solo.
    expect(
      camposCargaParaPatch({ ...original, lugar: "cun " }, { ...form, lugar: "cun " }),
    ).toEqual({});
  });

  it("cambió la fecha ⇒ la hora de la carga se muda al día nuevo", () => {
    expect(camposCargaParaPatch(original, { ...form, fecha_gasto: "2026-09-30" })).toEqual({
      fecha_hora_carga: "2026-09-30T19:20:00.000Z",
    });
    // También si la reclasifican: las dos fechas siguen coincidiendo.
    expect(
      camposCargaParaPatch(original, { ...form, categoria: "ATERRIZAJE", fecha_gasto: "2026-10-03" }),
    ).toEqual({ fecha_hora_carga: "2026-10-03T19:20:00.000Z" });
    // Sin hora de carga no hay nada que mudar.
    expect(
      camposCargaParaPatch({ ...original, fecha_hora_carga: null }, { ...form, fecha_gasto: "2026-10-03" }),
    ).toEqual({});
  });

  it("tipo y lugar: solo GAS, normalizados, y vaciar el lugar lo QUITA (null)", () => {
    expect(
      camposCargaParaPatch(original, { ...form, tipo_combustible: "TURBOSINA", lugar: " mid " }),
    ).toEqual({ tipo_combustible: "TURBOSINA", lugar: "MID" });
    expect(camposCargaParaPatch(original, { ...form, lugar: "" })).toEqual({ lugar: null });
    // Sin lugar antes y sin lugar ahora: nada.
    expect(camposCargaParaPatch({ ...original, lugar: null }, { ...form, lugar: "  " })).toEqual({});
    // Un tipo que no existe no viaja.
    expect(camposCargaParaPatch(original, { ...form, tipo_combustible: "DIESEL" })).toEqual({});
    // Reclasificado a otra categoría: tipo/lugar no viajan.
    expect(
      camposCargaParaPatch(original, { ...form, categoria: "ATERRIZAJE", tipo_combustible: "TURBOSINA", lugar: "MID" }),
    ).toEqual({});
  });

  it("el schema del PATCH acepta lo que arma el diálogo (zod tiraría las llaves desconocidas)", () => {
    const r = GastoVerifySchema.safeParse({
      verificado: true,
      fecha_gasto: "2026-09-30",
      ...camposCargaParaPatch(original, {
        ...form,
        fecha_gasto: "2026-09-30",
        tipo_combustible: "TURBOSINA",
        lugar: "",
      }),
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      fecha_hora_carga: "2026-09-30T19:20:00.000Z",
      tipo_combustible: "TURBOSINA",
      lugar: null,
    });
    expect(GastoVerifySchema.safeParse({ tipo_combustible: "DIESEL" }).success).toBe(false);
    expect(GastoVerifySchema.safeParse({ fecha_hora_carga: "2026-09-30" }).success).toBe(false);
  });
});

describe("textos y catálogos", () => {
  it("ayuda de la cabecera", () => {
    expect(AYUDA_EDITAR_CARGA).toBe("Edita o elimina una carga desde el menú ⋯ de su renglón.");
  });

  it("tipos de combustible con las etiquetas de la tabla", () => {
    expect(TIPOS_COMBUSTIBLE).toEqual([
      { value: "TURBOSINA", label: "Turbosina" },
      { value: "AVGAS", label: "Gasavión" },
    ]);
    expect(etiquetaTipoCombustible("AVGAS")).toBe("Gasavión");
    expect(etiquetaTipoCombustible(null)).toBeNull();
  });

  it("lugar: sin espacios sobrantes y en mayúsculas", () => {
    expect(normalizarLugarCarga("  asa   merida ")).toBe("ASA MERIDA");
    expect(normalizarLugarCarga(null)).toBe("");
  });
});
