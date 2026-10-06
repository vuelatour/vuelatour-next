/**
 * «Vincular gasto» con un gasto que NO pasó por el banco (6-oct-2026, API
 * 0.0.63, fuente única `lib/admin/conciliacion-no-bancario.ts` + los errores
 * de `conciliacion-lote.ts`).
 *
 * Caso real (prod): cargo de $212.00 del 07-sep-2026 (ASUR CANCUN, GASTOS
 * GNRAL, movimiento 520b2b2f…). Ningún piloto subió ese estacionamiento; el
 * 27 y el 28-sep hubo dos de $212.00 en EFECTIVO (Taxi / estacionamiento,
 * vuelo #330) y Mari los facturó para no perder la deducción. El cliente
 * pidió ligar el cargo a uno de ellos SIN cambiar el medio de pago (movería
 * la caja de los pilotos), dejando por escrito por qué.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AYUDA_INCLUIR_NO_BANCARIOS,
  AYUDA_JUSTIFICACION,
  BOTON_COPIAR_RAZON,
  BOTON_MOSTRAR_NO_BANCARIOS,
  ETIQUETA_INCLUIR_NO_BANCARIOS,
  JUSTIFICACION_MAX,
  JUSTIFICACION_MIN,
  MEDIOS_BANCARIOS_CONCILIACION,
  MSG_JUSTIFICACION_API_VIEJO,
  MSG_NO_BANCARIOS_API_VIEJO,
  MSG_RAZON_COPIADA,
  MSG_RAZON_NO_COPIADA,
  NOTA_TOAST_JUSTIFICACION,
  PLACEHOLDER_JUSTIFICACION,
  PREFIJO_NOTA_GASTO_VINCULO,
  TITULO_BADGE_VINCULO_NO_BANCARIO,
  TITULO_RAZON_NO_ANOTADA,
  apiOfreceNoBancarios,
  badgeVinculoNoBancario,
  conNotaJustificacion,
  esCandidatoNoBancario,
  esDtoSinJustificacion,
  esDtoSinNoBancarios,
  esLineaNotaGastoVinculo,
  esMedioBodega,
  esMedioNoBancario,
  estadoJustificacion,
  etiquetaJustificacion,
  etiquetaMedioNoBancario,
  fechaNotaVinculo,
  hayNoBancariosMarcados,
  justificacionParaEnviar,
  largoJustificacion,
  limpiarJustificacion,
  lineasVinculoDeGasto,
  lineasVinculoNoBancario,
  marcadosConNoBancarios,
  marcadosSinNoBancarios,
  montoNotaVinculo,
  noBancariosDeDetalle,
  textoDesmarcadosNoBancarios,
  textoDesvincularNoBancario,
  textoRazonNoAnotada,
  tituloBadgeCandidatoNoBancario,
  toastsTrasVincular,
} from "@/lib/admin/conciliacion-no-bancario";
import {
  NOTA_VENTANA_CARGO,
  busquedaAlCambiarNoBancarios,
  estadoBuscadorGastos,
  lineaGastoLote,
  mensajeErrorBusquedaGastos,
  mensajeErrorVincularGastos,
  opcionesRespaldoVincular,
  resumenLoteFila,
  textoBusquedaGastos,
  textoGastoBodega,
  textoJustificacionRequerida,
  textoTruncado,
  textoTruncadoNoBancarios,
} from "@/lib/admin/conciliacion-lote";
import { MEDIO_PAGO_LABELS } from "@/lib/admin/medios-pago";
import type { GastoCandidato, MovimientoGasto, SugerenciaConciliacion } from "@/types/conciliacion";

const G27 = "e5aa4ec9-07e2-4311-90a9-b6150d04bbd8";
const G28 = "053fa6f4-2b14-4f17-9713-6f75efde971f";
const GTARJETA = "a3150000-0000-4000-8000-000000000315";

/** Un candidato tal como lo manda el API 0.0.63 con `incluir_no_bancarios=true`. */
const efectivo = (id: string, fecha: string, extra: Partial<GastoCandidato> = {}): GastoCandidato => ({
  id,
  fecha_gasto: fecha,
  monto: 212,
  moneda: "MXN",
  categoria: "TAXI",
  medio_pago: "EFECTIVO",
  vuelo_folio: 330,
  no_bancario: true,
  ...extra,
});
const tarjeta: GastoCandidato = {
  id: GTARJETA,
  fecha_gasto: "2026-09-14",
  monto: 2801.4,
  moneda: "MXN",
  categoria: "OPERACIONES",
  medio_pago: "TARJETA_CORP",
  no_bancario: false,
};

/** La justificación del caso real (la que propone el ejemplo del campo). */
const RAZON = "Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28.";

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("medios: qué toca el banco y qué no (espejo de MEDIOS_BANCARIOS del API)", () => {
  it("TARJETA_CORP, TRANSFERENCIA y PAYWISE son bancarios; EFECTIVO, PERSONAL_* y BODEGA no", () => {
    expect(MEDIOS_BANCARIOS_CONCILIACION).toEqual(["TARJETA_CORP", "TRANSFERENCIA", "PAYWISE"]);
    for (const m of ["TARJETA_CORP", "TRANSFERENCIA", "PAYWISE"]) expect(esMedioNoBancario(m)).toBe(false);
    for (const m of ["EFECTIVO", "PERSONAL_PABLO", "PERSONAL_ALE", "BODEGA"]) expect(esMedioNoBancario(m)).toBe(true);
    // Vacío o ausente no es «no bancario» (no se inventa).
    expect(esMedioNoBancario(null)).toBe(false);
    expect(esMedioNoBancario("  ")).toBe(false);
    expect(esMedioBodega("BODEGA")).toBe(true);
    expect(esMedioBodega("EFECTIVO")).toBe(false);
  });

  it("todo medio del enum del gasto tiene etiqueta (ninguno cae en el código crudo)", () => {
    // Enum `public.medio_pago` de prod (6-oct-2026).
    for (const m of ["EFECTIVO", "TARJETA_CORP", "PERSONAL_PABLO", "PERSONAL_ALE", "TRANSFERENCIA", "BODEGA", "PAYWISE"]) {
      expect(MEDIO_PAGO_LABELS[m]).toBeTruthy();
    }
    expect(etiquetaMedioNoBancario("EFECTIVO")).toBe("Efectivo");
    expect(etiquetaMedioNoBancario("PERSONAL_PABLO")).toBe("Personal Pablo");
    expect(etiquetaMedioNoBancario("PERSONAL_ALE")).toBe("Personal Ale");
    expect(etiquetaMedioNoBancario("BODEGA")).toBe("Bodega (inventario)");
    // Un código que el panel no conoce: «Otro medio», JAMÁS el código.
    expect(etiquetaMedioNoBancario("VALE_DESPENSA")).toBe("Otro medio");
    expect(etiquetaMedioNoBancario(null)).toBe("Otro medio");
  });

  const util = leerApi("modules/conciliacion/gastos-candidatos.util.ts");
  it.skipIf(!util)("MEDIOS_BANCARIOS del código del API = el espejo (lectura del repo hermano)", () => {
    const bloque = /export const MEDIOS_BANCARIOS[^=]*=\s*\[([^\]]*)\]/.exec(util ?? "");
    expect(bloque).not.toBeNull();
    const medios = [...(bloque?.[1] ?? "").matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(medios).toEqual([...MEDIOS_BANCARIOS_CONCILIACION]);
  });

  it("el candidato: manda `no_bancario` del API; sin él (API previo, IA), su medio", () => {
    expect(esCandidatoNoBancario(efectivo(G27, "2026-09-27"))).toBe(true);
    expect(esCandidatoNoBancario(tarjeta)).toBe(false);
    expect(esCandidatoNoBancario({ medio_pago: "EFECTIVO" })).toBe(true);
    expect(esCandidatoNoBancario({ medio_pago: "TRANSFERENCIA" })).toBe(false);
    expect(esCandidatoNoBancario({ medio_pago: "EFECTIVO", no_bancario: false })).toBe(false);
    expect(esCandidatoNoBancario({})).toBe(false);
    expect(esCandidatoNoBancario(null)).toBe(false);
  });
});

describe("¿el API sabe incluirlos? (sin señal = API previo ⇒ el diálogo de siempre)", () => {
  const base = {
    movimiento: { id: "520b2b2f-ab74-4d62-8dd6-d2e0a01a9e9e", fecha: "2026-09-07", monto: 212, moneda: "MXN" },
    ventana: { desde: "2026-08-08", hasta: "2026-10-07" },
    truncado: false,
  };

  it("API 0.0.62: candidatos sin `no_bancario` y sin `excluidos` ⇒ false", () => {
    expect(apiOfreceNoBancarios({ ...base, candidatos: [{ id: GTARJETA, monto: 2801.4 }] })).toBe(false);
    expect(apiOfreceNoBancarios({ ...base, candidatos: [] })).toBe(false);
    expect(apiOfreceNoBancarios(null)).toBe(false);
  });

  it("API 0.0.63: `no_bancario` en un candidato o `excluidos` (aunque sea []) ⇒ true", () => {
    expect(apiOfreceNoBancarios({ ...base, candidatos: [tarjeta] })).toBe(true);
    expect(apiOfreceNoBancarios({ ...base, candidatos: [], excluidos: [] })).toBe(true);
    expect(apiOfreceNoBancarios({ ...base, candidatos: [], excluidos: null })).toBe(false);
  });
});

describe("textos del interruptor, la insignia y el campo (los del contrato)", () => {
  it("interruptor y botón", () => {
    expect(ETIQUETA_INCLUIR_NO_BANCARIOS).toBe("Incluir gastos en efectivo y otros medios");
    expect(BOTON_MOSTRAR_NO_BANCARIOS).toBe("Mostrar estos gastos");
    expect(AYUDA_INCLUIR_NO_BANCARIOS).toContain("nunca los de bodega");
    expect(textoDesmarcadosNoBancarios(1)).toBe("Se desmarcó el gasto en efectivo: ya no está en la lista.");
    expect(textoDesmarcadosNoBancarios(2)).toBe(
      "Se desmarcaron 2 gastos en efectivo u otros medios: ya no están en la lista.",
    );
  });

  it("insignia del candidato: qué es y qué pasa al vincularlo", () => {
    expect(tituloBadgeCandidatoNoBancario("EFECTIVO")).toBe(
      "Pagado en efectivo: no pasó por el banco. Se puede vincular escribiendo por qué; su medio de pago no cambia.",
    );
    expect(tituloBadgeCandidatoNoBancario("PERSONAL_PABLO")).toMatch(/^Pagado con Personal Pablo: no pasó por el banco\./);
  });

  it("el campo: pregunta, ayuda y ejemplo del cliente", () => {
    expect(etiquetaJustificacion([efectivo(G28, "2026-09-28")])).toBe(
      "¿Por qué se vincula un gasto en efectivo a este cargo?",
    );
    expect(etiquetaJustificacion([efectivo(G27, "2026-09-27"), efectivo(G28, "2026-09-28"), tarjeta])).toBe(
      "¿Por qué se vinculan gastos en efectivo a este cargo?",
    );
    expect(etiquetaJustificacion([efectivo(G27, "2026-09-27", { medio_pago: "PERSONAL_PABLO" })])).toBe(
      "¿Por qué se vincula un gasto pagado con Personal Pablo a este cargo?",
    );
    expect(
      etiquetaJustificacion([efectivo(G27, "2026-09-27"), efectivo(G28, "2026-09-28", { medio_pago: "PERSONAL_ALE" })]),
    ).toBe("¿Por qué se vinculan gastos que no se pagaron por el banco a este cargo?");
    expect(AYUDA_JUSTIFICACION).toBe(
      "No cambia el medio de pago ni la caja del piloto; la razón queda anotada en el cargo y en el gasto.",
    );
    expect(PLACEHOLDER_JUSTIFICACION).toBe(
      "Ej.: Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28 para no perder la deducción.",
    );
  });
});

describe("la justificación: 10 a 300 caracteres (el @Length del DTO)", () => {
  it("se limpia: espacios y saltos de línea se colapsan (el API la anota en UNA línea)", () => {
    expect(limpiarJustificacion("  Ticket   del 28\n\nfacturado  ")).toBe("Ticket del 28 facturado");
    expect(limpiarJustificacion(null)).toBe("");
    expect(largoJustificacion("  áéíóú ñ  ")).toBe(7);
  });

  it("estados: vacía, corta, lista y larga", () => {
    expect(JUSTIFICACION_MIN).toBe(10);
    expect(JUSTIFICACION_MAX).toBe(300);
    expect(estadoJustificacion("")).toEqual({
      valida: false,
      largo: 0,
      texto: "Obligatoria: de 10 a 300 caracteres.",
      tono: "neutro",
    });
    expect(estadoJustificacion("Ticket")).toEqual({
      valida: false,
      largo: 6,
      texto: "Escribe al menos 10 caracteres (van 6).",
      tono: "ambar",
    });
    // 10 de verdad, sin contar los espacios de las orillas.
    expect(estadoJustificacion("   Ticket 28   ").valida).toBe(false);
    expect(estadoJustificacion("Ticket 28 ").valida).toBe(false);
    expect(estadoJustificacion("Ticket 281").valida).toBe(true);
    expect(estadoJustificacion(RAZON)).toMatchObject({ valida: true, texto: `${largoJustificacion(RAZON)}/300` });
    expect(estadoJustificacion("x".repeat(301))).toEqual({
      valida: false,
      largo: 301,
      texto: "Máximo 300 caracteres (van 301).",
      tono: "rojo",
    });
    expect(estadoJustificacion("x".repeat(300)).valida).toBe(true);
  });

  it("solo VIAJA con un gasto no bancario marcado y válida (sin él, el cuerpo de siempre)", () => {
    expect(justificacionParaEnviar([tarjeta], RAZON)).toBeNull();
    expect(justificacionParaEnviar([efectivo(G28, "2026-09-28")], "corta")).toBeNull();
    expect(justificacionParaEnviar([efectivo(G28, "2026-09-28")], `  ${RAZON}\n`)).toBe(RAZON);
    expect(justificacionParaEnviar([tarjeta, efectivo(G28, "2026-09-28")], RAZON)).toBe(RAZON);
    expect(hayNoBancariosMarcados([tarjeta])).toBe(false);
    expect(hayNoBancariosMarcados([tarjeta, efectivo(G28, "2026-09-28")])).toBe(true);
  });
});

describe("lo marcado al apagar el interruptor o tras el 400 JUSTIFICACION_REQUERIDA", () => {
  it("apagar desmarca los no bancarios; sin ninguno, el MISMO arreglo", () => {
    const marcados = [tarjeta, efectivo(G28, "2026-09-28")];
    expect(marcadosSinNoBancarios(marcados)).toEqual([tarjeta]);
    const soloTarjeta = [tarjeta];
    expect(marcadosSinNoBancarios(soloTarjeta)).toBe(soloTarjeta);
  });

  it("los que el API señaló quedan como no bancarios con SU medio; si ya lo estaban, el MISMO arreglo", () => {
    const sinBandera: GastoCandidato = { id: G28, monto: 212, medio_pago: "TARJETA_CORP" };
    const r = marcadosConNoBancarios([tarjeta, sinBandera], [{ id: G28, medio_pago: "EFECTIVO" }]);
    expect(r[0]).toBe(tarjeta);
    expect(r[1]).toMatchObject({ id: G28, no_bancario: true, medio_pago: "EFECTIVO" });
    const yaMarcados = [efectivo(G28, "2026-09-28")];
    expect(marcadosConNoBancarios(yaMarcados, [{ id: G28, medio_pago: "EFECTIVO" }])).toBe(yaMarcados);
    expect(marcadosConNoBancarios(yaMarcados, [])).toBe(yaMarcados);
  });

  it("`details.gastos_no_bancarios` saneado (sin ids vacíos ni repetidos)", () => {
    expect(noBancariosDeDetalle(null)).toEqual([]);
    expect(noBancariosDeDetalle({ gastos_no_bancarios: "x" })).toEqual([]);
    expect(
      noBancariosDeDetalle({
        gastos_no_bancarios: [
          { id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: 212 },
          { id: G28, medio_pago: "EFECTIVO" },
          { id: "", medio_pago: "EFECTIVO" },
          null,
          { id: G27, monto: "212.00" },
        ],
      }),
    ).toEqual([
      { id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: 212 },
      { id: G27, medio_pago: null, fecha_gasto: null, monto: "212.00" },
    ]);
  });
});

describe("toast al vincular con justificación", () => {
  it("dice que quedó anotada y que el medio no cambió (sin doble punto)", () => {
    expect(conNotaJustificacion({ titulo: "Gasto vinculado" }, true)).toEqual({
      titulo: "Gasto vinculado",
      descripcion: NOTA_TOAST_JUSTIFICACION,
    });
    expect(
      conNotaJustificacion({ titulo: "Gasto cubierto", descripcion: "El gasto queda conciliado." }, true).descripcion,
    ).toBe(`El gasto queda conciliado. ${NOTA_TOAST_JUSTIFICACION}`);
    expect(conNotaJustificacion({ titulo: "2 gastos vinculados · $424.00", descripcion: "Todos cubiertos" }, true).descripcion).toBe(
      `Todos cubiertos. ${NOTA_TOAST_JUSTIFICACION}`,
    );
    const sin = { titulo: "Gasto vinculado" };
    expect(conNotaJustificacion(sin, false)).toBe(sin);
  });
});

describe("toast tras vincular: lo que el API CONFIRMÓ de las notas (`vinculo_no_bancario`)", () => {
  const BASE = { titulo: "Gasto cubierto", descripcion: "El gasto queda conciliado." };

  it("notas_anotadas: true ⇒ el toast dice que la razón quedó anotada, sin aviso", () => {
    expect(toastsTrasVincular(BASE, RAZON, { gasto_ids: [G28], notas_anotadas: true })).toEqual({
      exito: { titulo: "Gasto cubierto", descripcion: `El gasto queda conciliado. ${NOTA_TOAST_JUSTIFICACION}` },
      aviso: null,
    });
  });

  it("notas_anotadas: false ⇒ el toast de siempre (la liga SÍ quedó) + aviso con la razón para volver a escribirla", () => {
    const t = toastsTrasVincular(BASE, `  ${RAZON}\n`, { gasto_ids: [G28], notas_anotadas: false });
    // Jamás se dice «quedó anotada» cuando el API dice que no.
    expect(t.exito).toBe(BASE);
    expect(t.exito.descripcion).not.toContain(NOTA_TOAST_JUSTIFICACION);
    expect(t.aviso).toEqual({
      titulo: "La razón no quedó anotada",
      descripcion: `La liga sí quedó, pero no se pudo escribir la razón en las notas del cargo y del gasto. Para que quede escrita, desvincula este cargo y vuelve a vincularlo con la misma razón: «${RAZON}».`,
      razon: RAZON,
    });
    expect(TITULO_RAZON_NO_ANOTADA).toBe("La razón no quedó anotada");
    // Lote con dos gastos en efectivo: «de los gastos».
    expect(
      toastsTrasVincular(BASE, RAZON, { gasto_ids: [G27, G28], notas_anotadas: false }).aviso?.descripcion,
    ).toContain("en las notas del cargo y de los gastos.");
    expect(textoRazonNoAnotada("x", true)).toContain("de los gastos");
  });

  it("sin el campo (no entró ningún no bancario, o API previo) ⇒ el de siempre, SIN prometer una nota", () => {
    expect(toastsTrasVincular(BASE, RAZON, undefined)).toEqual({ exito: BASE, aviso: null });
    expect(toastsTrasVincular(BASE, RAZON, null)).toEqual({ exito: BASE, aviso: null });
    expect(toastsTrasVincular(BASE, RAZON, { gasto_ids: [G28] })).toEqual({ exito: BASE, aviso: null });
  });

  it("sin justificación ⇒ el de siempre aunque el API diga algo", () => {
    expect(toastsTrasVincular(BASE, undefined, { gasto_ids: [G28], notas_anotadas: false })).toEqual({
      exito: BASE,
      aviso: null,
    });
    expect(toastsTrasVincular(BASE, "   ", { gasto_ids: [G28], notas_anotadas: true }).exito).toBe(BASE);
  });

  it("la acción del aviso y sus respuestas", () => {
    expect(BOTON_COPIAR_RAZON).toBe("Copiar la razón");
    expect(MSG_RAZON_COPIADA).toBe("Razón copiada: pégala al volver a vincular.");
    expect(MSG_RAZON_NO_COPIADA).toBe("No se pudo copiar: escríbela de nuevo al volver a vincular.");
  });
});

describe("columna «Conciliación»: la insignia del gasto ligado", () => {
  const NOTAS =
    "Cargo de la terminal del aeropuerto\nVinculado a gasto en EFECTIVO del 28-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00): Nadie capturó el estacionamiento del 7 de septiembre — Itzi, 06-oct-2026";

  /** El estacionamiento del 28-sep tal como llega en `gasto` / `gastos[]`. */
  const G28_LIGADO = { id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: "212.00", moneda: "MXN" };

  it("efectivo ⇒ «Efectivo» y, en el tooltip, la justificación que el API anotó en el cargo", () => {
    expect(lineasVinculoNoBancario(NOTAS)).toEqual([NOTAS.split("\n")[1]]);
    expect(badgeVinculoNoBancario(G28_LIGADO, NOTAS)).toEqual({
      texto: "Efectivo",
      titulo: `${TITULO_BADGE_VINCULO_NO_BANCARIO}\n${NOTAS.split("\n")[1]}`,
    });
    // Una línea que nombra a OTRO gasto no se le cuelga a éste: título a secas.
    expect(badgeVinculoNoBancario({ ...G28_LIGADO, fecha_gasto: "2026-09-27" }, NOTAS)?.titulo).toBe(
      TITULO_BADGE_VINCULO_NO_BANCARIO,
    );
    expect(TITULO_BADGE_VINCULO_NO_BANCARIO).toBe("Vinculado con justificación: ver notas del cargo");
    // Sin la línea en las notas, el título del contrato a secas.
    expect(badgeVinculoNoBancario({ medio_pago: "PERSONAL_ALE" }, null)).toEqual({
      texto: "Personal Ale",
      titulo: TITULO_BADGE_VINCULO_NO_BANCARIO,
    });
  });

  it("bancario o sin `medio_pago` (API previo) ⇒ null: nada que pintar", () => {
    expect(badgeVinculoNoBancario({ medio_pago: "TARJETA_CORP" }, NOTAS)).toBeNull();
    expect(badgeVinculoNoBancario({}, NOTAS)).toBeNull();
    expect(badgeVinculoNoBancario(null)).toBeNull();
  });

  it("en un lote, cada línea lleva SU insignia; la búsqueda encuentra «Efectivo»", () => {
    const parte = (id: string, medio: string | undefined): MovimientoGasto => ({
      id,
      monto: "212.00",
      moneda: "MXN",
      categoria: "TAXI",
      fecha_gasto: "2026-09-28",
      monto_parte: "212.00",
      ...(medio ? { medio_pago: medio } : {}),
    });
    const r = resumenLoteFila({
      monto: "424.00",
      notas: NOTAS,
      gastos_n: 2,
      gastos: [parte("a", "TARJETA_CORP"), parte("b", "EFECTIVO")],
    });
    expect(r?.lineas.map((l) => l.medio?.texto ?? null)).toEqual([null, "Efectivo"]);
    expect(r?.lineas[1].medio?.titulo).toContain("Vinculado a gasto en EFECTIVO del 28-sep-2026");
    expect(lineaGastoLote(parte("c", undefined)).medio).toBeNull();
    expect(textoBusquedaGastos({ gastos: [parte("b", "EFECTIVO")] })).toContain("Efectivo");
    expect(textoBusquedaGastos({ gastos: [parte("a", "TARJETA_CORP")] })).not.toContain("Tarjeta corporativa");
  });

  it("lote con DOS gastos en efectivo: cada insignia lleva SOLO su línea (forma sin referencia: fecha + monto)", () => {
    const L27 =
      "Vinculado a gasto en EFECTIVO del 27-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00): Ticket facturado del 27 — Itzi, 06-oct-2026";
    const L28 =
      "Vinculado a gasto en EFECTIVO del 28-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00): Ticket facturado del 28 — Itzi, 06-oct-2026";
    const notas = `Cargo de la terminal\n\n${L27}\n${L28}`;
    const parte = (id: string, fecha: string): MovimientoGasto => ({
      id,
      monto: "212.00",
      moneda: "MXN",
      categoria: "TAXI",
      fecha_gasto: fecha,
      monto_parte: "212.00",
      medio_pago: "EFECTIVO",
    });
    const r = resumenLoteFila({
      monto: "424.00",
      notas,
      gastos_n: 2,
      gastos: [parte(G27, "2026-09-27"), parte(G28, "2026-09-28")],
    });
    expect(r?.lineas[0].medio?.titulo).toBe(`${TITULO_BADGE_VINCULO_NO_BANCARIO}\n${L27}`);
    expect(r?.lineas[1].medio?.titulo).toBe(`${TITULO_BADGE_VINCULO_NO_BANCARIO}\n${L28}`);
    // El monto también es llave: otro monto el mismo día no se lleva la línea.
    expect(lineasVinculoDeGasto(notas, { fecha_gasto: "2026-09-28", monto: 213, moneda: "MXN" })).toEqual([]);
    // Un gasto en dólares: el monto lleva « USD» como lo escribe el API.
    const usd = "Vinculado a gasto en EFECTIVO del 28-sep-2026 (Comida · $40.00 USD): Recibo del 28 — Itzi, 06-oct-2026";
    expect(lineasVinculoDeGasto(usd, { fecha_gasto: "2026-09-28", monto: 40, moneda: "USD" })).toEqual([usd]);
    expect(lineasVinculoDeGasto(usd, { fecha_gasto: "2026-09-28", monto: 40, moneda: "MXN" })).toEqual([]);
  });

  it("forma con referencia «gasto 3f9a1c2e» (llave del API): manda la referencia, aunque fecha y monto coincidan", () => {
    const A = "053fa6f4-2b14-4f17-9713-6f75efde971f";
    const B = "3f9a1c2e-0000-4000-8000-000000000001";
    const LA = `Vinculado a gasto en EFECTIVO del 28-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00 · gasto ${A.slice(0, 8)}): Ticket A — Itzi, 06-oct-2026`;
    const LB = `Vinculado a gasto en EFECTIVO del 28-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00 · gasto ${B.slice(0, 8)}): Ticket B — Itzi, 06-oct-2026`;
    const notas = `${LA}\n${LB}`;
    const g = { fecha_gasto: "2026-09-28", monto: "212.00", moneda: "MXN" };
    expect(lineasVinculoDeGasto(notas, { ...g, id: A })).toEqual([LA]);
    expect(lineasVinculoDeGasto(notas, { ...g, id: B })).toEqual([LB]);
    // La referencia gana aunque después cambien fecha o monto del gasto.
    expect(lineasVinculoDeGasto(notas, { id: A, fecha_gasto: "2026-09-30", monto: 1 })).toEqual([LA]);
    // Sin id no hay con qué comparar la referencia: ninguna.
    expect(lineasVinculoDeGasto(notas, g)).toEqual([]);
  });

  it("fecha y monto con la forma EXACTA del API (`fechaNota`, `montoNota`)", () => {
    expect(fechaNotaVinculo("2026-09-28")).toBe("28-sep-2026");
    expect(fechaNotaVinculo("2026-01-05T00:00:00-05:00")).toBe("05-ene-2026");
    expect(fechaNotaVinculo("2026-12-31")).toBe("31-dic-2026");
    expect(fechaNotaVinculo(null)).toBe("sin fecha");
    expect(fechaNotaVinculo("2026-13-01")).toBe("sin fecha");
    expect(montoNotaVinculo("212.00", "MXN")).toBe("$212.00");
    expect(montoNotaVinculo(1234.5)).toBe("$1,234.50");
    expect(montoNotaVinculo(-2801.4, "MXN")).toBe("$2,801.40");
    expect(montoNotaVinculo(40, "USD")).toBe("$40.00 USD");
    expect(montoNotaVinculo(null)).toBe("$0.00");
  });

  it("desvincular avisa que la justificación se borra de los dos lados (solo con un no bancario)", () => {
    expect(textoDesvincularNoBancario([{ medio_pago: "TARJETA_CORP" }])).toBeNull();
    expect(textoDesvincularNoBancario([])).toBeNull();
    expect(textoDesvincularNoBancario([{ medio_pago: "EFECTIVO" }])).toBe(
      "La justificación que se anotó al vincular el gasto en efectivo se borra del cargo y del gasto; su medio de pago sigue igual.",
    );
    expect(textoDesvincularNoBancario([{ medio_pago: "EFECTIVO" }, { medio_pago: "PERSONAL_ALE" }, null])).toContain(
      "los 2 gastos en efectivo u otros medios",
    );
  });
});

describe("el diálogo con el interruptor encendido (y apagado = como hoy)", () => {
  it("el vacío y la nota al pie dicen que también se buscó en efectivo", () => {
    expect(
      estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 0, dias: 30, incluyeNoBancarios: true })
        .texto,
    ).toBe(
      "No hay gastos pendientes (del banco ni en efectivo) en ±30 días del cargo. Amplía a 120 días o búscalo por monto, proveedor o nota.",
    );
    expect(NOTA_VENTANA_CARGO(30, true)).toBe(
      "Gastos sin conciliar del banco (tarjeta, transferencia, PayWise) y en efectivo u otros medios (nunca bodega), en la moneda de la cuenta y con fecha ±30 días del cargo; los de efectivo pueden quedar al final de la lista: para encontrar uno, búscalo por su monto. Si el cargo pagó varias facturas, márcalas todas: deben sumar el cargo.",
    );
    // Ya no promete «sin búsqueda, primero los que cuadran»: con el corte a 100, el efectivo podía ni salir.
    expect(NOTA_VENTANA_CARGO(30, true)).not.toContain("sin búsqueda");
  });

  it("lista cortada con el interruptor: dice que el efectivo pudo quedar fuera y con qué monto buscarlo", () => {
    expect(textoTruncadoNoBancarios(100, "212.00")).toBe(
      "Se muestran los primeros 100 y los gastos en efectivo pueden quedar fuera: escribe el monto (212.00), el proveedor o la nota para verlos.",
    );
    expect(textoTruncadoNoBancarios(100, null)).toBe(
      "Se muestran los primeros 100 y los gastos en efectivo pueden quedar fuera: escribe el monto, el proveedor o la nota para verlos.",
    );
    expect(
      estadoBuscadorGastos({
        cargando: false,
        error: null,
        q: "",
        resultados: 100,
        truncado: true,
        incluyeNoBancarios: true,
        montoCargo: "212.00",
      }),
    ).toEqual({ tipo: "lista", texto: textoTruncadoNoBancarios(100, "212.00") });
    // Apagado: el texto de siempre, aunque llegue el monto.
    expect(
      estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 100, truncado: true, montoCargo: "212.00" })
        .texto,
    ).toBe(textoTruncado(100));
    // Sin corte: nada.
    expect(
      estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 3, incluyeNoBancarios: true }).texto,
    ).toBe("");
  });

  it("encenderlo SIN búsqueda busca el monto del cargo; apagarlo devuelve la de antes", () => {
    // Caso real: 254 gastos del banco en ±30 días y ninguno de $212.00 ⇒ sin el monto, el efectivo ni salía.
    const on = busquedaAlCambiarNoBancarios({ activo: true, texto: "", montoCargo: "212.00", auto: null });
    expect(on).toEqual({ q: "212.00", auto: { puesta: "212.00", previa: "" } });
    expect(busquedaAlCambiarNoBancarios({ activo: false, texto: "212.00", montoCargo: "212.00", auto: on.auto })).toEqual({
      q: "",
      auto: null,
    });
    // Lo tecleado (monto o texto) se respeta.
    expect(busquedaAlCambiarNoBancarios({ activo: true, texto: "ASUR", montoCargo: 212, auto: null })).toEqual({
      q: "ASUR",
      auto: null,
    });
    expect(busquedaAlCambiarNoBancarios({ activo: true, texto: " 212 ", montoCargo: 212, auto: null })).toEqual({
      q: "212",
      auto: null,
    });
    // Si el operador cambió la búsqueda después, apagarlo no se la quita.
    expect(busquedaAlCambiarNoBancarios({ activo: false, texto: "estacionamiento", montoCargo: 212, auto: on.auto })).toEqual({
      q: "estacionamiento",
      auto: null,
    });
    // «Mostrar estos gastos» sobre «ASUR» ⇒ al apagar vuelve «ASUR».
    expect(
      busquedaAlCambiarNoBancarios({ activo: false, texto: "212.00", montoCargo: 212, auto: { puesta: "212.00", previa: "ASUR" } }),
    ).toEqual({ q: "ASUR", auto: null });
    // Sin monto del cargo legible: no inventa búsqueda.
    expect(busquedaAlCambiarNoBancarios({ activo: true, texto: "", montoCargo: null, auto: null })).toEqual({
      q: "",
      auto: null,
    });
  });

  it("APAGADO (o sin decirlo): los textos de siempre, carácter por carácter", () => {
    expect(estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 0, dias: 30 }).texto).toBe(
      "No hay gastos bancarios pendientes en ±30 días del cargo. Amplía a 120 días o búscalo por monto, proveedor o nota.",
    );
    expect(NOTA_VENTANA_CARGO(30)).toBe(NOTA_VENTANA_CARGO(30, false));
    expect(NOTA_VENTANA_CARGO(30)).toMatch(/^Gastos bancarios \(tarjeta, transferencia, PayWise\) sin conciliar, en la moneda/);
  });
});

describe("errores del API al vincular", () => {
  it("400 JUSTIFICACION_REQUERIDA con un gasto: cuál, cómo se pagó y qué hacer (y los marca)", () => {
    const details = {
      gastos_no_bancarios: [{ id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: 212 }],
    };
    expect(textoJustificacionRequerida("JUSTIFICACION_REQUERIDA: …", details)).toEqual({
      titulo: "Escribe por qué se vincula este gasto",
      descripcion:
        "El gasto del 28 sep está en efectivo: para vincularlo a un cargo del banco escribe por qué (no cambia el medio de pago).",
    });
    const e = mensajeErrorVincularGastos({ ok: false, code: "JUSTIFICACION_REQUERIDA", status: 400, details });
    expect(e.recargar).toBe(false);
    expect(e.apiSinLote).toBe(false);
    expect(e.noBancarios).toEqual([{ id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: 212 }]);
  });

  it("con varios, con otro medio y sin details", () => {
    expect(
      textoJustificacionRequerida(null, {
        gastos_no_bancarios: [
          { id: G27, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-27", monto: 212 },
          { id: G28, medio_pago: "PERSONAL_ALE", fecha_gasto: "2026-09-28", monto: 212 },
        ],
      }),
    ).toEqual({
      titulo: "Escribe por qué se vinculan estos gastos",
      descripcion:
        "2 gastos no se pagaron por el banco (efectivo y Personal Ale): para vincularlos a un cargo del banco escribe por qué (no cambia el medio de pago).",
    });
    expect(
      textoJustificacionRequerida(null, {
        gastos_no_bancarios: [{ id: G28, medio_pago: "PERSONAL_PABLO", fecha_gasto: "2026-09-28", monto: 212 }],
      }).descripcion,
    ).toBe(
      "El gasto del 28 sep se pagó con Personal Pablo: para vincularlo a un cargo del banco escribe por qué (no cambia el medio de pago).",
    );
    // Sin details: el mensaje del API (sin el código) o el genérico; jamás inglés técnico.
    expect(
      textoJustificacionRequerida("JUSTIFICACION_REQUERIDA: El gasto del 28 sep está en efectivo: escribe por qué", null)
        .descripcion,
    ).toBe("El gasto del 28 sep está en efectivo: escribe por qué");
    expect(textoJustificacionRequerida("Bad Gateway", null).descripcion).toBe(
      "Uno de los gastos no se pagó por el banco: para vincularlo escribe por qué (no cambia el medio de pago).",
    );
  });

  it("409 GASTO_BODEGA con el contrato REAL del API (`details.gastos_bodega` + mensaje con la fecha)", () => {
    // Lo que manda `validarMediosVinculo` del API 0.0.63.
    const MSG_API =
      "El gasto del 28 sep es una salida de inventario (Bodega): no se pagó con el banco y no se puede vincular a un cargo.";
    const details = { gastos_bodega: [{ id: G28, fecha_gasto: "2026-09-28", monto: 212 }] };
    // Con la etiqueta del gasto marcado: dice CUÁL quitar.
    expect(textoGastoBodega(MSG_API, details, (id) => (id === G28 ? "Refacción · $212.00 MXN" : null))).toEqual({
      titulo: "Un gasto de bodega no se vincula con el banco",
      descripcion:
        "Gasto: Refacción · $212.00 MXN. Es una salida de inventario y nunca pasa por el banco: quítalo de la selección.",
    });
    // Sin etiqueta: el mensaje del API (nombra la fecha), jamás el genérico mudo.
    expect(textoGastoBodega(`GASTO_BODEGA: ${MSG_API}`, details).descripcion).toBe(`${MSG_API} Quítalo de la selección.`);
    // Varios: plural en todo.
    const dos = {
      gastos_bodega: [
        { id: G27, fecha_gasto: "2026-09-27", monto: 212 },
        { id: G28, fecha_gasto: "2026-09-28", monto: 212 },
        { id: G28, fecha_gasto: "2026-09-28", monto: 212 },
      ],
    };
    expect(textoGastoBodega(null, dos, (id) => (id === G27 ? "Refacción A" : "Refacción B"))).toEqual({
      titulo: "Los gastos de bodega no se vinculan con el banco",
      descripcion:
        "Gastos: Refacción A; Refacción B. Son salidas de inventario y nunca pasan por el banco: quítalos de la selección.",
    });
    // Sin details ni mensaje útil: el genérico (nunca inglés técnico).
    expect(textoGastoBodega("Conflict", null)).toEqual({
      titulo: "Un gasto de bodega no se vincula con el banco",
      descripcion: "Es una salida de inventario y nunca pasa por el banco: quítalo de la selección.",
    });
    // La forma inventada de antes (`details.gasto_id`) ya no se lee.
    expect(textoGastoBodega(null, { gasto_id: G28 }, () => "Refacción").descripcion).not.toContain("Refacción");
    expect(
      mensajeErrorVincularGastos(
        { ok: false, code: "GASTO_BODEGA", status: 409, error: MSG_API, details },
        (id) => (id === G28 ? "Refacción · $212.00 MXN" : null),
      ),
    ).toMatchObject({
      titulo: "Un gasto de bodega no se vincula con el banco",
      descripcion:
        "Gasto: Refacción · $212.00 MXN. Es una salida de inventario y nunca pasa por el banco: quítalo de la selección.",
      recargar: false,
      apiSinLote: false,
    });
  });

  it("API previo: el interruptor y la justificación dicen que falta actualizar el servidor", () => {
    expect(
      esDtoSinNoBancarios({ status: 400, error: "property incluir_no_bancarios should not exist" }),
    ).toBe(true);
    expect(esDtoSinNoBancarios({ status: 400, error: "incluir_no_bancarios must be a boolean value" })).toBe(false);
    expect(esDtoSinJustificacion({ status: 400, error: "property justificacion should not exist" })).toBe(true);
    expect(esDtoSinJustificacion({ status: 409, error: "property justificacion should not exist" })).toBe(false);
    expect(mensajeErrorBusquedaGastos({ code: "API_SIN_NO_BANCARIOS", status: 400 })).toBe(MSG_NO_BANCARIOS_API_VIEJO);
    expect(mensajeErrorVincularGastos({ code: "API_SIN_JUSTIFICACION", status: 400 }).titulo).toBe(
      MSG_JUSTIFICACION_API_VIEJO,
    );
    // La justificación inválida que frenó la action (es-MX) se pinta tal cual.
    expect(
      mensajeErrorVincularGastos({ code: "JUSTIFICACION_INVALIDA", error: "Escribe al menos 10 caracteres (van 4)." })
        .titulo,
    ).toBe("Escribe al menos 10 caracteres (van 4).");
  });
});

describe("la línea «⚠ Conciliado con el cargo bancario del …» de las notas del GASTO", () => {
  const LINEA_GASTO =
    "⚠ Conciliado con el cargo bancario del 07-sep-2026 ($212.00 · ASUR CANCUN) sin cambiar el medio de pago (EFECTIVO): Nadie capturó el estacionamiento del 7 de septiembre — Itzi, 06-oct-2026";

  it("se reconoce por su inicio EXACTO (también con espacios en las orillas)", () => {
    expect(PREFIJO_NOTA_GASTO_VINCULO).toBe("⚠ Conciliado con el cargo bancario del ");
    expect(esLineaNotaGastoVinculo(LINEA_GASTO)).toBe(true);
    expect(esLineaNotaGastoVinculo(`  ${LINEA_GASTO}  `)).toBe(true);
    expect(esLineaNotaGastoVinculo("⚠ IA: el monto del ticket ($250.00) no coincide con lo capturado — revisar")).toBe(false);
    expect(esLineaNotaGastoVinculo("Conciliado con el cargo bancario del 07-sep-2026")).toBe(false);
    expect(esLineaNotaGastoVinculo(null)).toBe(false);
  });

  const util = leerApi("common/vinculo-no-bancario.util.ts");
  it.skipIf(!util)("el API arma las dos líneas con esos inicios (lectura del repo hermano)", () => {
    // Línea del gasto: la plantilla empieza EXACTAMENTE con el prefijo.
    expect(util).toContain("`" + PREFIJO_NOTA_GASTO_VINCULO + "${");
    // Línea del cargo: «Vinculado a gasto en <MEDIO> del <fecha> (<detalle>): …».
    expect(util).toMatch(/`Vinculado a gasto en \$\{[^}]+\} del \$\{fechaNota\(/);
  });
});

describe("respaldo con un API previo: sin gastos en efectivo (no hay dónde escribir la razón)", () => {
  it("un candidato no bancario de la IA no se ofrece; los del banco, sí", () => {
    const s: SugerenciaConciliacion = {
      disponible: true,
      gasto_id_sugerido: G28,
      confianza: 0.8,
      razon: null,
      candidatos: [efectivo(G28, "2026-09-28"), tarjeta, { id: G27, monto: 212, medio_pago: "PERSONAL_ALE" }],
    };
    const ops = opcionesRespaldoVincular([{ value: "p1", label: "Operaciones · $10.00 MXN" }], s);
    expect(ops.map((o) => o.value)).toEqual([GTARJETA, "p1"]);
  });
});
