/**
 * Semáforo del calendario (28-sep-2026): SIETE colores —los seis de la
 * «listita» del cliente del 24-sep, en su orden y con sus textos: «Tentativo -
 * Gris · Pendiente (permiso) - Amarillo · Confirmado - Verde · Pagado - Azul ·
 * Cancelado - Rojo · Descanso - Morado», y al final el café del SERVICIO del
 * 28-sep («los vuelos de Servicio, poner en color Café»)— con los hex EXACTOS
 * del API (`colores-calendario.util.ts`). Este test congela la leyenda: si el
 * API cambia un hex y aquí no, la leyenda mentiría sobre lo que se ve en
 * pantalla.
 */
import { describe, expect, it } from "vitest";
import { textOnColor } from "@/lib/color-contrast";
import {
  AYUDA_COLOR_AVION,
  AYUDA_PENDIENTE,
  AYUDA_SERVICIO,
  COLOR_CANCELADO,
  COLOR_CONFIRMADO,
  COLOR_DESCANSO,
  COLOR_PAGADO,
  COLOR_PENDIENTE,
  COLOR_SEMAFORO,
  COLOR_SERVICIO,
  COLOR_TENTATIVO,
  ETIQUETA_COLOR_AVION,
  HINT_COLOR_AVION,
  NOTA_COLOR_AVION,
  SEMAFORO_CALENDARIO,
  tituloColorAvion,
} from "../calendario-semaforo";

/**
 * COPIA de `SEMAFORO` del API (`vuelatour-api/src/modules/calendar/
 * colores-calendario.util.ts`, contrato del 28-sep-2026). Si el API mueve un
 * hex, se mueve aquí y en `calendario-semaforo.ts` en el mismo cambio.
 */
const SEMAFORO_API = {
  TENTATIVO: "#64748B",
  PENDIENTE: "#F59E0B",
  CONFIRMADO: "#22C55E",
  PAGADO: "#3B82F6",
  CANCELADO: "#EF4444",
  DESCANSO: "#8B5CF6",
  SERVICIO: "#8B5E3C",
} as const;

/**
 * COPIA de `LEYENDA_SEMAFORO` del API (mismo contrato): los 6 renglones en el
 * orden del cliente y el SERVICIO al final. La leyenda del panel debe ser
 * idéntica, renglón por renglón (hex y texto).
 */
const LEYENDA_API: ReadonlyArray<{ color: string; etiqueta: string }> = [
  { color: SEMAFORO_API.TENTATIVO, etiqueta: "Tentativo" },
  { color: SEMAFORO_API.PENDIENTE, etiqueta: "Pendiente (permiso)" },
  { color: SEMAFORO_API.CONFIRMADO, etiqueta: "Confirmado" },
  { color: SEMAFORO_API.PAGADO, etiqueta: "Pagado" },
  { color: SEMAFORO_API.CANCELADO, etiqueta: "Cancelado" },
  { color: SEMAFORO_API.DESCANSO, etiqueta: "Descanso 💤" },
  { color: SEMAFORO_API.SERVICIO, etiqueta: "Servicio (taller / parada técnica)" },
];

/**
 * COPIA de `AYUDA_PENDIENTE` del API (tooltip del renglón «Pendiente
 * (permiso)»; la app lo usa tal cual en `kLeyendaCalendario`).
 */
const AYUDA_PENDIENTE_API =
  "Permiso de pista pendiente. También se pinta así el vuelo confirmado que todavía no tiene avión o piloto asignado.";

/**
 * COPIA de `AYUDA_SERVICIO` del API (tooltip del renglón «Servicio (taller /
 * parada técnica)», 28-sep-2026; la app lo usa tal cual).
 */
const AYUDA_SERVICIO_API =
  "Vuelo sin pasajeros con parada de servicio: no es del cliente y no se cotiza.";

/**
 * Paleta VIEJA (antes del 22-sep): ninguno de estos tonos vuelve a la
 * leyenda. `#8B5CF6` YA NO está aquí: era el morado «sin asignar» y desde el
 * 24-sep es el morado del DESCANSO.
 */
const HEX_RETIRADOS = ["#F0DCDB", "#14B8A6", "#0EA5E9", "#9CA3AF"];

describe("semáforo del calendario", () => {
  it("son siete renglones: los de la listita en su orden y el servicio al final", () => {
    expect(SEMAFORO_CALENDARIO.map((i) => i.etiqueta)).toEqual([
      "Tentativo",
      "Pendiente (permiso)",
      "Confirmado",
      "Pagado",
      "Cancelado",
      "Descanso 💤",
      "Servicio (taller / parada técnica)",
    ]);
    expect(SEMAFORO_CALENDARIO.map((i) => i.clave)).toEqual([
      "tentativo",
      "pendiente",
      "confirmado",
      "pagado",
      "cancelado",
      "descanso",
      "servicio",
    ]);
  });

  it("paridad con la leyenda del API: mismo hex y mismo texto, renglón por renglón", () => {
    expect(
      SEMAFORO_CALENDARIO.map(({ color, etiqueta }) => ({ color, etiqueta })),
    ).toEqual(LEYENDA_API);
  });

  it("cada constante lleva el hex del API", () => {
    expect(COLOR_TENTATIVO).toBe(SEMAFORO_API.TENTATIVO);
    expect(COLOR_PENDIENTE).toBe(SEMAFORO_API.PENDIENTE);
    expect(COLOR_CONFIRMADO).toBe(SEMAFORO_API.CONFIRMADO);
    expect(COLOR_PAGADO).toBe(SEMAFORO_API.PAGADO);
    expect(COLOR_CANCELADO).toBe(SEMAFORO_API.CANCELADO);
    expect(COLOR_DESCANSO).toBe(SEMAFORO_API.DESCANSO);
    expect(COLOR_SERVICIO).toBe(SEMAFORO_API.SERVICIO);
    expect(COLOR_SEMAFORO).toEqual({
      tentativo: SEMAFORO_API.TENTATIVO,
      pendiente: SEMAFORO_API.PENDIENTE,
      confirmado: SEMAFORO_API.CONFIRMADO,
      pagado: SEMAFORO_API.PAGADO,
      cancelado: SEMAFORO_API.CANCELADO,
      descanso: SEMAFORO_API.DESCANSO,
      servicio: SEMAFORO_API.SERVICIO,
    });
  });

  it("el azul pasó del descanso al pagado y el descanso es morado", () => {
    expect(COLOR_PAGADO).toBe("#3B82F6");
    expect(COLOR_DESCANSO).toBe("#8B5CF6");
    expect(COLOR_DESCANSO).not.toBe(COLOR_PAGADO);
  });

  it("los siete colores son distintos entre sí (un color = un significado)", () => {
    const hex = SEMAFORO_CALENDARIO.map((i) => i.color.toUpperCase());
    expect(new Set(hex).size).toBe(7);
  });

  it("el café del servicio lleva texto BLANCO en los chips del calendario", () => {
    // `calendar-grid.tsx` decide el texto con `textOnColor(ev.color)`.
    expect(textOnColor(COLOR_SERVICIO)).toBe("#ffffff");
    expect(COLOR_SERVICIO).not.toBe(COLOR_DESCANSO);
  });

  it("el tooltip de «Servicio» dice qué vuelo es, que gana al pagado y que el mantenimiento no es café", () => {
    const servicio = SEMAFORO_CALENDARIO.find((i) => i.clave === "servicio")!;
    // Misma redacción que el API y la app: arranca con `AYUDA_SERVICIO`.
    expect(AYUDA_SERVICIO).toBe(AYUDA_SERVICIO_API);
    expect(servicio.titulo.startsWith(AYUDA_SERVICIO_API)).toBe(true);
    expect(servicio.titulo).toContain("sin pasajeros");
    expect(servicio.titulo).toContain("pagado");
    expect(servicio.titulo).toContain("amarillo");
  });

  it("no queda rastro de la paleta vieja", () => {
    const todo = JSON.stringify(SEMAFORO_CALENDARIO).toUpperCase();
    for (const viejo of HEX_RETIRADOS) expect(todo).not.toContain(viejo);
    // Los renglones VIEJOS ya no son renglones. («sin asignar» vive dentro
    // del tooltip del ámbar: es un asunto pendiente, no un color propio.)
    const etiquetas = SEMAFORO_CALENDARIO.map((i) => i.etiqueta);
    for (const viejo of [
      "Vuelo propio",
      "Evento (no vuelo)",
      "Sin asignar",
      "Externo",
      "Descanso",
      "Permiso pendiente",
      "Permiso o asunto pendiente",
      "Cobrado",
    ]) {
      expect(etiquetas).not.toContain(viejo);
    }
  });

  it("cada renglón explica qué significa y qué hacer (tooltip)", () => {
    for (const i of SEMAFORO_CALENDARIO) {
      expect(i.titulo.length).toBeGreaterThan(30);
      expect(i.titulo).not.toBe(i.etiqueta);
    }
  });

  it("el tooltip de «Pendiente (permiso)» aclara que también cubre sin avión o sin piloto", () => {
    const pendiente = SEMAFORO_CALENDARIO.find((i) => i.clave === "pendiente")!;
    // Misma redacción que el API y la app: arranca con `AYUDA_PENDIENTE`.
    expect(AYUDA_PENDIENTE).toBe(AYUDA_PENDIENTE_API);
    expect(pendiente.titulo.startsWith(AYUDA_PENDIENTE_API)).toBe(true);
    expect(pendiente.titulo).toContain("Permiso de pista pendiente");
    expect(pendiente.titulo).toContain("no tiene avión o piloto asignado");
    // Precedencia visible para el operador: el pendiente gana al pagado.
    expect(pendiente.titulo).toContain("pagado");
  });

  it("el tooltip de «Tentativo» nombra los tres estados previos a CONFIRMADO", () => {
    const tentativo = SEMAFORO_CALENDARIO.find((i) => i.clave === "tentativo")!;
    for (const estado of ["reserva", "solicitud", "cotización"]) {
      expect(tentativo.titulo).toContain(estado);
    }
  });

  it("el tooltip de «Pagado» dice que es automático y que regresa a verde", () => {
    const pagado = SEMAFORO_CALENDARIO.find((i) => i.clave === "pagado")!;
    expect(pagado.titulo).toContain("cobrado completo");
    expect(pagado.titulo).toContain("solo");
    expect(pagado.titulo).toContain("regresa a verde");
    expect(pagado.titulo).toContain("$0");
  });
});

describe("el color del avión vive ahora en los Excel", () => {
  it("la nota de la leyenda lo dice sin rodeos", () => {
    expect(NOTA_COLOR_AVION).toContain("ya no se usa en el calendario");
    expect(NOTA_COLOR_AVION).toContain("Excel");
    expect(NOTA_COLOR_AVION).toContain("balance individual y general");
  });

  it("la etiqueta del campo nombra al Excel, no al calendario", () => {
    expect(ETIQUETA_COLOR_AVION).toBe("Color en los reportes de Excel");
    expect(ETIQUETA_COLOR_AVION.toLowerCase()).not.toContain("calendario");
    expect(HINT_COLOR_AVION).toContain("#RRGGBB");
    expect(AYUDA_COLOR_AVION).toContain("calendario");
  });

  it("el tooltip del punto de la lista de aeronaves lleva el hex", () => {
    expect(tituloColorAvion("#F97316")).toBe(
      "Color en los reportes de Excel: #F97316",
    );
  });
});
