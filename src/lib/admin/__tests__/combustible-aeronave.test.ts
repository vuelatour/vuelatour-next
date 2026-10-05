/**
 * Combustible por aeronave (5-oct-2026, API 0.0.56). Caso real: Luis capturó
 * desde la app 74 L para el XB-PEV (vuelo #280, Chetumal) y eligió
 * «Turbosina»; el PEV (Cessna 205, pistón) solo carga gasavión y el Balance
 * del PEV salió con «Combustible TURBOSINA». Desde hoy cada avión dice qué
 * combustible carga y el API ajusta toda carga GAS a ese valor.
 *
 * Aquí, las reglas PURAS del panel (`lib/admin/combustibles.ts`):
 *  - etiquetas y opciones de la ficha del avión (las MISMAS del selector de
 *    la carga: el aviso no puede decir otra palabra que el selector);
 *  - el catálogo de aviones de los diálogos de gasto conserva el combustible;
 *  - el prellenado (`tipoCombustibleSugerido`) y el aviso ámbar;
 *  - el PATCH de «Verificar / editar» manda el tipo cuando no es el del avión
 *    (si no, el API no reaplica su ajuste y el aviso mentiría);
 *  - los schemas aceptan el campo nuevo y lo omiten vacío (API previo).
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_COMBUSTIBLE_AERONAVE,
  COMBUSTIBLE_AERONAVE_DEFAULT,
  COMBUSTIBLE_AERONAVE_OPCIONES,
  ERROR_COMBUSTIBLE_AERONAVE,
  ETIQUETA_COMBUSTIBLE_AERONAVE,
  TIPOS_COMBUSTIBLE,
  apiConCombustible,
  avionCatalogoGasto,
  avisoCombustibleDistinto,
  camposCargaParaPatch,
  combustibleDeAeronave,
  esTipoCombustible,
  etiquetaCombustibleAeronave,
  etiquetaTipoCombustible,
  tipoCombustibleSugerido,
} from "../combustibles";
import { AircraftFormSchema } from "@/app/admin/aircraft/schema";
import { GastoCreateSchema } from "@/app/admin/expenses/schema";

/** Flota real (prod, 5-oct-2026), recortada. */
const FLOTA = [
  { id: "av-pev", matricula: "XB-PEV", combustible: "AVGAS" as const },
  { id: "av-58bt", matricula: "N58BT", combustible: "TURBOSINA" as const },
  { id: "av-621", matricula: "N621TX", combustible: "TURBOSINA" as const },
  // API previo: el avión llega sin el campo.
  { id: "av-viejo", matricula: "XA-VGV" },
];

describe("ficha del avión: etiquetas y opciones", () => {
  it("las etiquetas son las del selector de la carga (una sola palabra por tipo)", () => {
    for (const t of TIPOS_COMBUSTIBLE) {
      expect(etiquetaCombustibleAeronave(t.value)).toBe(etiquetaTipoCombustible(t.value));
    }
    expect(etiquetaCombustibleAeronave("AVGAS")).toBe("Gasavión");
    expect(etiquetaCombustibleAeronave("TURBOSINA")).toBe("Turbosina");
  });

  it("API previo (sin el campo) o valor raro ⇒ «—»", () => {
    expect(etiquetaCombustibleAeronave(undefined)).toBe("—");
    expect(etiquetaCombustibleAeronave(null)).toBe("—");
    expect(etiquetaCombustibleAeronave("DIESEL")).toBe("—");
  });

  it("alta: gasavión por default y primero en la lista", () => {
    expect(COMBUSTIBLE_AERONAVE_DEFAULT).toBe("AVGAS");
    expect(COMBUSTIBLE_AERONAVE_OPCIONES).toEqual([
      { value: "AVGAS", label: "Gasavión" },
      { value: "TURBOSINA", label: "Turbosina" },
    ]);
  });

  it("textos del campo", () => {
    expect(ETIQUETA_COMBUSTIBLE_AERONAVE).toBe("Combustible");
    expect(AYUDA_COMBUSTIBLE_AERONAVE).toBe(
      "Las cargas de este avión se guardan con este combustible.",
    );
    expect(ERROR_COMBUSTIBLE_AERONAVE).toBe("Elige Gasavión o Turbosina.");
  });

  it("esTipoCombustible: solo los dos valores del CHECK de la BD", () => {
    expect(esTipoCombustible("AVGAS")).toBe(true);
    expect(esTipoCombustible("TURBOSINA")).toBe(true);
    expect(esTipoCombustible("avgas")).toBe(false);
    expect(esTipoCombustible("")).toBe(false);
    expect(esTipoCombustible(undefined)).toBe(false);
  });

  it("apiConCombustible: el alta solo manda el campo si el API ya lo conoce", () => {
    expect(apiConCombustible(FLOTA)).toBe(true);
    const flotaVieja = [{ id: "av-viejo", matricula: "XA-VGV" }, { id: "av-pev", matricula: "XB-PEV" }];
    expect(apiConCombustible(flotaVieja)).toBe(false);
    // Sin aviones no hay cómo saberlo: el API sale antes que el panel.
    expect(apiConCombustible([])).toBe(true);
  });
});

describe("catálogo de aviones de los diálogos de gasto", () => {
  it("conserva el combustible (antes las páginas lo tiraban con { id, matricula })", () => {
    expect(
      avionCatalogoGasto({ id: "av-pev", matricula: "XB-PEV", combustible: "AVGAS" }),
    ).toEqual({ id: "av-pev", matricula: "XB-PEV", combustible: "AVGAS" });
  });

  it("API previo o valor raro ⇒ sin la llave (ni prellenado ni aviso)", () => {
    expect(avionCatalogoGasto({ id: "av-viejo", matricula: "XA-VGV" })).toEqual({
      id: "av-viejo",
      matricula: "XA-VGV",
    });
    expect(
      avionCatalogoGasto({ id: "x", matricula: "X", combustible: "DIESEL" }),
    ).not.toHaveProperty("combustible");
  });

  it("combustibleDeAeronave", () => {
    expect(combustibleDeAeronave(FLOTA, "av-pev")).toBe("AVGAS");
    expect(combustibleDeAeronave(FLOTA, "av-58bt")).toBe("TURBOSINA");
    expect(combustibleDeAeronave(FLOTA, "av-viejo")).toBeNull();
    expect(combustibleDeAeronave(FLOTA, "no-existe")).toBeNull();
    expect(combustibleDeAeronave(FLOTA, "")).toBeNull();
    expect(combustibleDeAeronave(FLOTA, null)).toBeNull();
  });
});

describe("aviso ámbar: tipo distinto al del avión", () => {
  it("caso real: XB-PEV con «Turbosina»", () => {
    expect(avisoCombustibleDistinto("XB-PEV", "AVGAS", "TURBOSINA")).toBe(
      "El XB-PEV carga Gasavión: al guardar se corregirá a Gasavión y quedará marcado para revisión.",
    );
    expect(avisoCombustibleDistinto("N58BT", "TURBOSINA", "AVGAS")).toBe(
      "El N58BT carga Turbosina: al guardar se corregirá a Turbosina y quedará marcado para revisión.",
    );
  });

  it("sin matrícula: «Este avión»", () => {
    expect(avisoCombustibleDistinto(undefined, "AVGAS", "TURBOSINA")).toBe(
      "Este avión carga Gasavión: al guardar se corregirá a Gasavión y quedará marcado para revisión.",
    );
  });

  it("nada que avisar: coincide, sin tipo, o el avión no dice su combustible", () => {
    expect(avisoCombustibleDistinto("XB-PEV", "AVGAS", "AVGAS")).toBeNull();
    expect(avisoCombustibleDistinto("XB-PEV", "AVGAS", "")).toBeNull();
    expect(avisoCombustibleDistinto("XB-PEV", "AVGAS", null)).toBeNull();
    expect(avisoCombustibleDistinto("XA-VGV", null, "TURBOSINA")).toBeNull();
    expect(avisoCombustibleDistinto("XB-PEV", "AVGAS", "DIESEL")).toBeNull();
  });
});

describe("tipoCombustibleSugerido: qué tipo queda en el formulario", () => {
  const base = { categoria: "GAS", delAvion: "AVGAS" as const, actual: "" };

  it("vacío + avión ⇒ el del avión", () => {
    expect(tipoCombustibleSugerido(base)).toBe("AVGAS");
  });

  it("la IA no pisa al avión: si lee otro, manda el avión", () => {
    expect(tipoCombustibleSugerido({ ...base, ia: "TURBOSINA" })).toBe("AVGAS");
  });

  it("sin avión, la IA llena; sin nada, se queda vacío", () => {
    expect(tipoCombustibleSugerido({ ...base, delAvion: null, ia: "TURBOSINA" })).toBe(
      "TURBOSINA",
    );
    expect(tipoCombustibleSugerido({ ...base, delAvion: null })).toBe("");
    expect(tipoCombustibleSugerido({ ...base, delAvion: null, ia: "DIESEL" })).toBe("");
  });

  it("lo elegido a mano (o guardado) manda aunque no coincida: lo dice el aviso", () => {
    expect(tipoCombustibleSugerido({ ...base, actual: "TURBOSINA" })).toBe("TURBOSINA");
    expect(
      tipoCombustibleSugerido({ ...base, actual: "TURBOSINA", ia: "AVGAS" }),
    ).toBe("TURBOSINA");
  });

  it("lo puso el sistema y cambió el avión ⇒ se vuelve a prellenar", () => {
    expect(
      tipoCombustibleSugerido({
        ...base,
        delAvion: "TURBOSINA",
        actual: "AVGAS",
        actualEsSugerido: true,
      }),
    ).toBe("TURBOSINA");
    // Se quitó el avión: el prellenado se conserva (no se borra el dato).
    expect(
      tipoCombustibleSugerido({
        ...base,
        delAvion: null,
        actual: "AVGAS",
        actualEsSugerido: true,
      }),
    ).toBe("AVGAS");
  });

  it("no es GAS ⇒ no se toca", () => {
    expect(tipoCombustibleSugerido({ ...base, categoria: "ATERRIZAJE" })).toBe("");
    expect(
      tipoCombustibleSugerido({ ...base, categoria: "OTRO", actual: "TURBOSINA" }),
    ).toBe("TURBOSINA");
  });
});

describe("PATCH de «Verificar / editar»: el tipo que no es del avión SIEMPRE viaja", () => {
  const original = {
    fecha_gasto: "2026-09-10",
    fecha_hora_carga: null,
    tipo_combustible: "TURBOSINA",
    lugar: "CTM",
  };
  const form = {
    categoria: "GAS",
    fecha_gasto: "2026-09-10",
    tipo_combustible: "TURBOSINA",
    lugar: "CTM",
  };

  it("caso real: guardado TURBOSINA en el PEV sin tocarlo ⇒ viaja para que el API lo ajuste", () => {
    expect(camposCargaParaPatch(original, form, "AVGAS")).toEqual({
      tipo_combustible: "TURBOSINA",
    });
  });

  it("coincide con el avión o el avión no dice nada ⇒ solo lo que cambió", () => {
    expect(camposCargaParaPatch(original, form, "TURBOSINA")).toEqual({});
    expect(camposCargaParaPatch(original, form, null)).toEqual({});
    expect(camposCargaParaPatch(original, form)).toEqual({});
  });

  it("prellenado (antes vacío) ⇒ viaja como cambio", () => {
    expect(
      camposCargaParaPatch(
        { ...original, tipo_combustible: null },
        { ...form, tipo_combustible: "AVGAS" },
        "AVGAS",
      ),
    ).toEqual({ tipo_combustible: "AVGAS" });
  });

  it("fuera de GAS el tipo no viaja aunque no coincida", () => {
    expect(camposCargaParaPatch(original, { ...form, categoria: "OTRO" }, "AVGAS")).toEqual({});
  });
});

describe("schemas", () => {
  const avion = {
    matricula: "xb-pev",
    modelo: "Cessna 205",
    pais_registro: "MX",
    num_motores: 1,
    velocidad_crucero_kts: 130,
    asientos: 5,
  };

  it("ficha del avión: acepta los dos tipos", () => {
    const r = AircraftFormSchema.safeParse({ ...avion, combustible: "TURBOSINA" });
    expect(r.success).toBe(true);
    expect(r.data?.combustible).toBe("TURBOSINA");
  });

  it("ficha del avión: vacío ⇒ se omite (API previo); otro valor ⇒ error en es-MX", () => {
    const vacio = AircraftFormSchema.safeParse({ ...avion, combustible: "" });
    expect(vacio.success).toBe(true);
    expect(vacio.data).not.toHaveProperty("combustible", "");
    expect(vacio.data?.combustible).toBeUndefined();
    const malo = AircraftFormSchema.safeParse({ ...avion, combustible: "DIESEL" });
    expect(malo.success).toBe(false);
    expect(malo.error?.flatten().fieldErrors.combustible).toEqual([ERROR_COMBUSTIBLE_AERONAVE]);
  });

  it("alta de gasto: el tipo viaja si lo hay; vacío se omite", () => {
    const g = {
      categoria: "GAS",
      monto: 2800,
      moneda: "MXN",
      fecha_gasto: "2026-09-10",
      medio_pago: "TARJETA_CORP",
    };
    expect(GastoCreateSchema.safeParse({ ...g, tipo_combustible: "AVGAS" }).data).toMatchObject({
      tipo_combustible: "AVGAS",
    });
    expect(
      GastoCreateSchema.safeParse({ ...g, tipo_combustible: "" }).data?.tipo_combustible,
    ).toBeUndefined();
    expect(GastoCreateSchema.safeParse({ ...g, tipo_combustible: "DIESEL" }).success).toBe(false);
  });
});
