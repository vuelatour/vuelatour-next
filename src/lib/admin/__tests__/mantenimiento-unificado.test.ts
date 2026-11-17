/**
 * MANTENIMIENTO UNIFICADO (17-nov-2026, API 0.0.140): las secciones de la card
 * única, lo que dice cada mosaico del resumen y cómo se clasifican los errores
 * del API en lo nuevo (no disponible vs. falló).
 */
import { describe, expect, it } from "vitest";
import {
  ID_CARD_MANTENIMIENTO,
  SECCIONES_MANTENIMIENTO,
  TITULOS_SECCION,
  mosaicoComponentes,
  mosaicoDiscrepancias,
  mosaicoOrdenes,
  resumenDiscrepancias,
  resumenOrdenes,
  textoConteoOrdenes,
} from "../mantenimiento-unificado";
import {
  TEXTO_ESCRITURA_NO_DISPONIBLE,
  TEXTO_NO_DISPONIBLE,
  TEXTO_YA_NO_EXISTE,
  errorIngenieriaDe,
  esNoDisponible,
  esRutaInexistente,
  estadoDeError,
  estadoDeRespuesta,
  mensajeErrorBase,
} from "../ingenieria-errores";
import { ANCLA_MANTENIMIENTOS } from "../proximo-servicio";
import type { VidaComponente } from "@/types/engineering";

describe("secciones de la card única", () => {
  it("el ancla histórica de las órdenes sigue viva", () => {
    expect(ID_CARD_MANTENIMIENTO).toBe("mantenimiento");
    expect(SECCIONES_MANTENIMIENTO.map((s) => s.id)).toEqual([
      "mantenimiento-resumen",
      "horas-programa",
      "mantenimientos",
      "componentes",
      "discrepancias",
    ]);
    // «Poner fecha» / «Ver mantenimiento» apuntan aquí desde hace meses.
    expect(`#${SECCIONES_MANTENIMIENTO[2].id}`).toBe(ANCLA_MANTENIMIENTOS);
    expect(TITULOS_SECCION["horas-programa"].titulo).toBe("Horas y programa de servicio");
    expect(TITULOS_SECCION.mantenimientos.titulo).toBe("Órdenes de mantenimiento");
  });
});

describe("mosaico «Órdenes abiertas»", () => {
  const o = (estado: "PROGRAMADO" | "EN_TALLER" | "COMPLETADO", fecha: string | null = null) => ({
    estado,
    fecha_programada: fecha,
  });

  it("cuenta por estado", () => {
    expect(
      resumenOrdenes([o("EN_TALLER"), o("PROGRAMADO"), o("PROGRAMADO", "2026-12-01"), o("COMPLETADO")]),
    ).toEqual({ total: 4, enTaller: 1, programadas: 2, sinFecha: 1 });
  });

  it("el N990GG de la captura: una en taller y una programada", () => {
    expect(mosaicoOrdenes([o("EN_TALLER", "2026-11-09"), o("PROGRAMADO")])).toMatchObject({
      valor: "1 en taller",
      hint: "y 1 programada",
      tono: "ambar",
      href: "#mantenimientos",
    });
  });

  it("programadas: ámbar solo si falta ponerles fecha", () => {
    expect(mosaicoOrdenes([o("PROGRAMADO")])).toMatchObject({
      valor: "1 programada",
      hint: "1 sin fecha: falta confirmarla",
      tono: "ambar",
    });
    expect(mosaicoOrdenes([o("PROGRAMADO", "2026-12-01"), o("PROGRAMADO", "2026-12-20")])).toMatchObject(
      { valor: "2 programadas", hint: "Con fecha confirmada", tono: "neutro" },
    );
  });

  it("ninguna abierta; y si NO se pudieron leer, «—» (jamás «ninguna»)", () => {
    expect(mosaicoOrdenes([o("COMPLETADO")])).toMatchObject({
      valor: "Ninguna",
      hint: "Todas completadas",
      tono: "verde",
    });
    expect(mosaicoOrdenes([])).toMatchObject({ valor: "Ninguna", hint: "Sin órdenes registradas" });
    expect(mosaicoOrdenes(null)).toMatchObject({ valor: "—", hint: "No se pudieron leer" });
  });

  it("conteo del encabezado", () => {
    expect(textoConteoOrdenes(0)).toBe("Sin mantenimientos registrados.");
    expect(textoConteoOrdenes(1)).toBe("1 registrado (programados y realizados).");
    expect(textoConteoOrdenes(2)).toBe("2 registrados (programados y realizados).");
  });
});

describe("mosaico «Discrepancias abiertas»", () => {
  const d = (estado: "ABIERTA" | "EN_PROGRESO" | "RESUELTA", severidad: "BAJA" | "MEDIA" | "ALTA") => ({
    estado,
    severidad,
  });

  it("una ALTA sin resolver manda (bloquea asignar el avión)", () => {
    const lista = [d("ABIERTA", "ALTA"), d("EN_PROGRESO", "BAJA"), d("RESUELTA", "ALTA")];
    expect(resumenDiscrepancias(lista)).toEqual({ abiertas: 2, altas: 1 });
    expect(mosaicoDiscrepancias(lista)).toMatchObject({
      valor: "1 alta sin resolver",
      hint: "Bloquea asignar el avión · 2 abiertas en total",
      tono: "rojo",
      href: "#discrepancias",
    });
  });

  it("abiertas sin ALTA: ámbar; todas resueltas: verde; sin reportes: neutro", () => {
    expect(mosaicoDiscrepancias([d("ABIERTA", "MEDIA")])).toMatchObject({
      valor: "1 abierta",
      tono: "ambar",
    });
    expect(mosaicoDiscrepancias([d("RESUELTA", "ALTA")])).toMatchObject({
      valor: "Ninguna",
      hint: "Todas resueltas",
      tono: "verde",
    });
    expect(mosaicoDiscrepancias([])).toMatchObject({ valor: "Ninguna", hint: "Sin reportes" });
  });
});

describe("mosaico «Componentes»", () => {
  const con = (...estados: VidaComponente["estado"][]) =>
    estados.map((estado) => ({ vida: { estado } as VidaComponente }));

  it("listo: lo más urgente, con su color", () => {
    expect(mosaicoComponentes("listo", con("VENCIDO", "VIGENTE"))).toMatchObject({
      rotulo: "Componentes",
      valor: "1 vencido",
      tono: "rojo",
      href: "#componentes",
    });
    expect(mosaicoComponentes("listo", con("VIGENTE"))).toMatchObject({
      valor: "Al día",
      tono: "verde",
    });
    expect(mosaicoComponentes("listo", [])).toMatchObject({
      valor: "Sin componentes",
      tono: "neutro",
    });
  });

  it("cargando, sin disponibilidad o con falla: «—» y se dice por qué", () => {
    expect(mosaicoComponentes("cargando", null)).toMatchObject({ valor: "—", hint: "Cargando…" });
    expect(mosaicoComponentes("no_disponible", null)).toMatchObject({
      valor: "—",
      hint: TEXTO_NO_DISPONIBLE,
    });
    expect(mosaicoComponentes("error", null)).toMatchObject({
      valor: "—",
      hint: "No se pudieron leer",
    });
  });
});

describe("errores del API en lo nuevo de ingeniería", () => {
  it("normaliza lo que haya lanzado la llamada", () => {
    expect(
      errorIngenieriaDe(Object.assign(new Error("x"), { status: 409, code: "TOPE_ADJUNTOS" })),
    ).toEqual({ status: 409, code: "TOPE_ADJUNTOS", message: "x" });
    expect(errorIngenieriaDe("texto suelto")).toEqual({ message: "texto suelto" });
    expect(errorIngenieriaDe(null)).toEqual({ message: undefined });
  });

  it("CARGA: 404 (API previo) o migración pendiente ⇒ no disponible; lo demás ⇒ error", () => {
    expect(esNoDisponible({ status: 404 })).toBe(true);
    expect(esNoDisponible({ status: 503, code: "MIGRACION_PENDIENTE" })).toBe(true);
    expect(esNoDisponible({ status: 502 })).toBe(false);
    expect(estadoDeError(Object.assign(new Error("Cannot GET /x"), { status: 404 }))).toBe(
      "no_disponible",
    );
    expect(estadoDeError(new Error("red caída"))).toBe("error");
  });

  it("RESPUESTA: `disponible:false` ⇒ no disponible", () => {
    expect(estadoDeRespuesta({ disponible: false })).toBe("no_disponible");
    expect(estadoDeRespuesta({ disponible: true })).toBe("listo");
    expect(estadoDeRespuesta({})).toBe("listo");
  });

  it("ESCRITURA: la ruta que no existe no se confunde con un registro que ya no existe", () => {
    expect(esRutaInexistente({ status: 404, message: "Cannot POST /v1/engineering/adjuntos" })).toBe(
      true,
    );
    expect(esRutaInexistente({ status: 404, message: "El archivo no existe" })).toBe(false);
    expect(mensajeErrorBase({ status: 404, message: "Cannot DELETE /v1/x" })).toBe(
      TEXTO_ESCRITURA_NO_DISPONIBLE,
    );
    expect(mensajeErrorBase({ status: 404, message: "El archivo no existe" })).toBe(
      "El archivo no existe",
    );
    expect(mensajeErrorBase({ status: 404 })).toBe(TEXTO_YA_NO_EXISTE);
    expect(mensajeErrorBase({})).toContain("No se pudo completar");
  });
});
