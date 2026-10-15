/**
 * Server actions de «Omitir la conciliación» (14-oct-2026, API 0.0.77,
 * invariante 75): `revisarOmisionAction`, `omitirMovimientosAction` y
 * `quitarOmisionAction`. Cuerpos EXACTOS como objeto (apiFetch serializa);
 * lista (1..200 uuid sin repetir), motivo y avisos confirmados validados
 * ANTES de la red; una ruta inexistente (404 «Cannot POST …») o un DTO previo
 * (400 «property … should not exist») ⇒ RUTA_NO_DISPONIBLE con «Esta opción
 * todavía no está activa…»; los 4xx/5xx conservan code, status y details;
 * NINGUNA revalida (quien llama hace UN `router.refresh()`) y nunca lanzan.
 * Más: `clasificarMovimientoAction` con `esperado_clasificacion_id`, y las de
 * «Varios cargos → un gasto» (invariante 76): `gastosCandidatosDeCargosAction`
 * y `ligarCargosAGastoAction` (lista 2..50, gasto uuid, mismas reglas).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const {
  revisarOmisionAction,
  omitirMovimientosAction,
  quitarOmisionAction,
  clasificarMovimientoAction,
  gastosCandidatosDeCargosAction,
  ligarCargosAGastoAction,
} = await import("../actions");

const A = "e1173c41-0000-4000-8000-000000000001";
const B = "e4bd3023-0000-4000-8000-000000000002";
const MOTIVO = "Comisión o IVA del banco";
const NO_ACTIVA = "Esta opción todavía no está activa: avisa a sistemas.";
const api = (statusCode: number, code: string, message: string, details?: unknown) =>
  new ApiError({ statusCode, code, message, details });

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("validación ANTES de la red (textos del DTO)", () => {
  it("lista vacía, más de 200, no-uuid o repetidos ⇒ LOTE_INVALIDO sin llamar al API (las tres acciones)", async () => {
    const casos: [unknown, string][] = [
      [[], "Elige al menos un movimiento."],
      [undefined, "Elige al menos un movimiento."],
      [Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), "Se pueden seleccionar hasta 200 movimientos por lote."],
      [[A, "nada"], "Algún movimiento de la selección no es válido: recarga la página."],
      [[A, A.toUpperCase()], "Hay movimientos repetidos en la selección."],
    ];
    for (const [ids, error] of casos) {
      const esperado = { ok: false, code: "LOTE_INVALIDO", status: 400, error };
      expect(await revisarOmisionAction(ids as string[])).toEqual(esperado);
      expect(await quitarOmisionAction(ids as string[])).toEqual(esperado);
      expect(await omitirMovimientosAction({ ids: ids as string[], motivo: MOTIVO })).toEqual(esperado);
    }
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("motivo de 9 o 301 (recortado) ⇒ MOTIVO_INVALIDO; avisos fuera de la selección ⇒ ACEPTAR_RIESGO_INVALIDO", async () => {
    expect(await omitirMovimientosAction({ ids: [A], motivo: "  123456789  " })).toEqual({
      ok: false,
      code: "MOTIVO_INVALIDO",
      status: 400,
      error: "El motivo debe tener al menos 10 caracteres.",
    });
    expect(await omitirMovimientosAction({ ids: [A], motivo: "x".repeat(301) })).toEqual({
      ok: false,
      code: "MOTIVO_INVALIDO",
      status: 400,
      error: "El motivo admite hasta 300 caracteres.",
    });
    for (const aceptarRiesgoIds of [[B], ["nada"], [A, A]]) {
      expect(await omitirMovimientosAction({ ids: [A], motivo: MOTIVO, aceptarRiesgoIds })).toEqual({
        ok: false,
        code: "ACEPTAR_RIESGO_INVALIDO",
        status: 400,
        error: "Los movimientos con aviso que confirmas deben estar en la selección.",
      });
    }
    // Sin argumentos útiles tampoco lanza.
    expect(await omitirMovimientosAction(undefined as never)).toMatchObject({ ok: false, code: "LOTE_INVALIDO" });
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("cuerpos EXACTOS (objeto, no texto) y SIN revalidar", () => {
  it("revisar: POST …/omitir/revisar {movimiento_ids}", async () => {
    const data = { movimientos: [], no_existen: [], resumen: { n: 0, pendientes: 0, no_pendientes: 0, con_riesgo: 0 } };
    apiServer.mockResolvedValue(data);
    expect(await revisarOmisionAction([A, B])).toEqual({ ok: true, data });
    expect(apiServer).toHaveBeenCalledWith("/v1/conciliacion/movimientos/omitir/revisar", {
      method: "POST",
      body: { movimiento_ids: [A, B] },
    });
    expect(typeof apiServer.mock.calls[0][1].body).toBe("object");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("omitir: el motivo recortado; `aceptar_riesgo_ids` viaja SOLO si no está vacío", async () => {
    const data = { omitidos: 2, clasificacion_id: "0a1b2c3d-0000-4000-8000-0000000000aa", movimientos: [] };
    apiServer.mockResolvedValue(data);
    expect(await omitirMovimientosAction({ ids: [A, B], motivo: `  ${MOTIVO}  ` })).toEqual({ ok: true, data });
    expect(apiServer).toHaveBeenLastCalledWith("/v1/conciliacion/movimientos/omitir", {
      method: "POST",
      body: { movimiento_ids: [A, B], motivo: MOTIVO },
    });
    expect(Object.keys(apiServer.mock.lastCall?.[1].body)).toEqual(["movimiento_ids", "motivo"]);
    await omitirMovimientosAction({ ids: [A, B], motivo: MOTIVO, aceptarRiesgoIds: [] });
    expect("aceptar_riesgo_ids" in apiServer.mock.lastCall?.[1].body).toBe(false);
    await omitirMovimientosAction({ ids: [A, B], motivo: MOTIVO, aceptarRiesgoIds: [B] });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ movimiento_ids: [A, B], motivo: MOTIVO, aceptar_riesgo_ids: [B] });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deshacer: POST …/quitar-omision {movimiento_ids}", async () => {
    apiServer.mockResolvedValue({ restaurados: 1, movimientos: [] });
    expect(await quitarOmisionAction([A])).toEqual({ ok: true, data: { restaurados: 1, movimientos: [] } });
    expect(apiServer).toHaveBeenCalledWith("/v1/conciliacion/movimientos/quitar-omision", {
      method: "POST",
      body: { movimiento_ids: [A] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("API previo o sin la migración", () => {
  it("404 «Cannot POST …» y 400 «property … should not exist» ⇒ RUTA_NO_DISPONIBLE con el texto del operador", async () => {
    for (const err of [
      api(404, "NOTFOUNDEXCEPTION", "Cannot POST /v1/conciliacion/movimientos/omitir"),
      api(400, "BAD_REQUEST", "property movimiento_ids should not exist"),
    ]) {
      apiServer.mockRejectedValue(err);
      for (const r of [
        await revisarOmisionAction([A]),
        await omitirMovimientosAction({ ids: [A], motivo: MOTIVO }),
        await quitarOmisionAction([A]),
      ]) {
        expect(r).toMatchObject({ ok: false, code: "RUTA_NO_DISPONIBLE", error: NO_ACTIVA });
      }
    }
  });

  it("503 CONCILIACION_OMITIR_NO_DISPONIBLE (API nuevo sin la migración) conserva su código", async () => {
    apiServer.mockRejectedValue(api(503, "CONCILIACION_OMITIR_NO_DISPONIBLE", NO_ACTIVA, { migracion: "20261014000002" }));
    expect(await omitirMovimientosAction({ ids: [A], motivo: MOTIVO })).toEqual({
      ok: false,
      error: NO_ACTIVA,
      code: "CONCILIACION_OMITIR_NO_DISPONIBLE",
      status: 503,
      details: { migracion: "20261014000002" },
    });
  });
});

describe("los 4xx conservan code/status/details y nada lanza", () => {
  it("409 OMITIR_CON_RIESGO / MOVIMIENTO_NO_PENDIENTE / MOVIMIENTO_NO_OMITIDO y 404 MOVIMIENTO_NO_EXISTE", async () => {
    const riesgo = { movimientos: [{ id: B, riesgo: "TRASPASO", texto: "es un traspaso entre cuentas: «Cruzar pendientes» lo clasifica solo" }] };
    apiServer.mockRejectedValueOnce(api(409, "OMITIR_CON_RIESGO", "1 de los 2 movimientos podría conciliarse de verdad: …", riesgo));
    expect(await omitirMovimientosAction({ ids: [A, B], motivo: MOTIVO })).toEqual({
      ok: false,
      error: "1 de los 2 movimientos podría conciliarse de verdad: …",
      code: "OMITIR_CON_RIESGO",
      status: 409,
      details: riesgo,
    });
    apiServer.mockRejectedValueOnce(api(409, "MOVIMIENTO_NO_PENDIENTE", "No se omitió ninguno: …", { movimientos: [{ id: A }] }));
    expect(await omitirMovimientosAction({ ids: [A, B], motivo: MOTIVO })).toMatchObject({
      code: "MOVIMIENTO_NO_PENDIENTE",
      status: 409,
      details: { movimientos: [{ id: A }] },
    });
    apiServer.mockRejectedValueOnce(api(409, "MOVIMIENTO_NO_OMITIDO", "No se restauró ninguno: …", { movimientos: [{ id: A }] }));
    expect(await quitarOmisionAction([A])).toMatchObject({ code: "MOVIMIENTO_NO_OMITIDO", status: 409 });
    apiServer.mockRejectedValueOnce(api(404, "MOVIMIENTO_NO_EXISTE", "Uno de los movimientos ya no existe: recarga la página.", { faltan: [B] }));
    expect(await omitirMovimientosAction({ ids: [A, B], motivo: MOTIVO })).toMatchObject({
      code: "MOVIMIENTO_NO_EXISTE",
      status: 404,
      details: { faltan: [B] },
    });
  });

  it("un error que no es del API (red) vuelve como resultado, sin lanzar", async () => {
    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    expect(await revisarOmisionAction([A])).toEqual({ ok: false, error: "fetch failed" });
    expect(await omitirMovimientosAction({ ids: [A], motivo: MOTIVO })).toEqual({ ok: false, error: "fetch failed" });
    expect(await quitarOmisionAction([A])).toEqual({ ok: false, error: "fetch failed" });
  });
});

describe("clasificarMovimientoAction con `esperado_clasificacion_id` (lo que el panel VIO)", () => {
  it("viaja solo si viene (null = estaba pendiente); un valor que no es uuid no sale a la red", async () => {
    apiServer.mockResolvedValue({});
    await clasificarMovimientoAction(A, { clasificacion_id: B, notas: "x" });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ clasificacion_id: B, notas: "x" });
    await clasificarMovimientoAction(A, { clasificacion_id: B, esperado_clasificacion_id: null });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ clasificacion_id: B, esperado_clasificacion_id: null });
    await clasificarMovimientoAction(A, { clasificacion_id: null, esperado_clasificacion_id: B });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ clasificacion_id: null, esperado_clasificacion_id: B });
    apiServer.mockClear();
    expect(await clasificarMovimientoAction(A, { clasificacion_id: B, esperado_clasificacion_id: "nada" })).toEqual({
      ok: false,
      code: "CLASIFICACION_INVALIDA",
      status: 400,
      error: "Clasificación inválida: recarga la página.",
    });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("409 MOVIMIENTO_CAMBIO / MOVIMIENTO_OMITIDO vuelven con su código (el diálogo cierra y refresca)", async () => {
    apiServer.mockRejectedValue(
      api(409, "MOVIMIENTO_CAMBIO", "Este movimiento cambió mientras tanto (alguien lo vinculó, lo clasificó o lo omitió): recarga la lista y vuelve a intentarlo."),
    );
    expect(await clasificarMovimientoAction(A, { clasificacion_id: B, esperado_clasificacion_id: null })).toMatchObject({
      ok: false,
      code: "MOVIMIENTO_CAMBIO",
      status: 409,
    });
  });
});

describe("varios cargos → un gasto (invariante 76): candidatos por la SUMA y la liga atómica", () => {
  const GASTO = "dd5fcb2b-0000-4000-8000-000000000400";
  const LOTE = "Elige de 2 a 50 cargos sin repetir (con uno, usa «Vincular gasto» del menú ⋯).";

  it("lista (2..50 uuid sin repetir) y gasto (uuid) validados ANTES de la red, con los textos del DTO", async () => {
    const casos: [unknown, string][] = [
      [undefined, LOTE],
      [[], LOTE],
      [[A], LOTE],
      [Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), LOTE],
      [[A, "nada"], "Algún cargo de la selección no es válido: recarga la página."],
      [[A, A.toUpperCase()], LOTE],
    ];
    for (const [ids, error] of casos) {
      const esperado = { ok: false, code: "LOTE_INVALIDO", status: 400, error };
      expect(await gastosCandidatosDeCargosAction(ids as string[])).toEqual(esperado);
      expect(await ligarCargosAGastoAction(GASTO, ids as string[])).toEqual(esperado);
    }
    for (const gasto of ["", "nada", undefined]) {
      expect(await ligarCargosAGastoAction(gasto as string, [A, B])).toEqual({
        ok: false,
        code: "GASTO_INVALIDO",
        status: 400,
        error: "Gasto inválido.",
      });
    }
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("candidatos: POST …/cargos/gastos-candidatos con el cuerpo EXACTO (objeto); q normalizado, dias/limite solo dentro de los topes", async () => {
    const data = { cargos: { ids: [A, B], n: 2, suma: 400 }, candidatos: [], truncado: false };
    apiServer.mockResolvedValue(data);
    expect(await gastosCandidatosDeCargosAction([A, B])).toEqual({ ok: true, data });
    expect(apiServer).toHaveBeenLastCalledWith("/v1/conciliacion/cargos/gastos-candidatos", {
      method: "POST",
      body: { movimiento_ids: [A, B] },
    });
    expect(typeof apiServer.mock.lastCall?.[1].body).toBe("object");
    await gastosCandidatosDeCargosAction([A, B], { q: " $ 400.00 ", dias: 120, limite: 50 });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ movimiento_ids: [A, B], q: "400.00", dias: 120, limite: 50 });
    await gastosCandidatosDeCargosAction([A, B], { q: "   ", dias: 181, limite: 0 });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ movimiento_ids: [A, B] });
    await gastosCandidatosDeCargosAction([A, B], { q: "taco  loco", dias: 2.5 });
    expect(apiServer.mock.lastCall?.[1].body).toEqual({ movimiento_ids: [A, B], q: "taco loco" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ligar: POST …/gastos/:id/cargos {movimiento_ids} y SIN revalidar", async () => {
    const data = { gasto_id: GASTO, idempotente: false, nuevos: [A, B], partes: [], movimientos: [] };
    apiServer.mockResolvedValue(data);
    expect(await ligarCargosAGastoAction(GASTO, [A, B])).toEqual({ ok: true, data });
    expect(apiServer).toHaveBeenCalledWith(`/v1/conciliacion/gastos/${GASTO}/cargos`, {
      method: "POST",
      body: { movimiento_ids: [A, B] },
    });
    expect(Object.keys(apiServer.mock.lastCall?.[1].body)).toEqual(["movimiento_ids"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("API ≤ 0.0.76: 404 «Cannot POST …» y 400 «property … should not exist» ⇒ RUTA_NO_DISPONIBLE", async () => {
    for (const err of [
      api(404, "NOTFOUNDEXCEPTION", "Cannot POST /v1/conciliacion/cargos/gastos-candidatos"),
      api(400, "BAD_REQUEST", "property movimiento_ids should not exist"),
    ]) {
      apiServer.mockRejectedValue(err);
      for (const r of [await gastosCandidatosDeCargosAction([A, B]), await ligarCargosAGastoAction(GASTO, [A, B])]) {
        expect(r).toMatchObject({ ok: false, code: "RUTA_NO_DISPONIBLE", error: NO_ACTIVA });
      }
    }
  });

  it("los 4xx/503 conservan code, status y details; un error de red vuelve como resultado (nada lanza)", async () => {
    const noPendiente = { gasto_id: GASTO, movimientos: [{ id: B, estado: "CON_GASTO" }] };
    apiServer.mockRejectedValueOnce(api(409, "MOVIMIENTO_NO_PENDIENTE", "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — …", noPendiente));
    expect(await ligarCargosAGastoAction(GASTO, [A, B])).toEqual({
      ok: false,
      error: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — …",
      code: "MOVIMIENTO_NO_PENDIENTE",
      status: 409,
      details: noPendiente,
    });
    const excede = { moneda: "MXN", monto_gasto: 380, suma_ligada: 0, faltante: 380, suma_cargos: 400, excedente: 20, tolerancia: 1 };
    apiServer.mockRejectedValueOnce(api(409, "CARGOS_EXCEDEN_GASTO", "Los 2 cargos suman $400.00 …", excede));
    expect(await ligarCargosAGastoAction(GASTO, [A, B])).toMatchObject({ code: "CARGOS_EXCEDEN_GASTO", status: 409, details: excede });
    apiServer.mockRejectedValueOnce(api(503, "CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE", NO_ACTIVA, { migracion: "20261014000002" }));
    expect(await ligarCargosAGastoAction(GASTO, [A, B])).toMatchObject({
      code: "CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE",
      status: 503,
    });
    apiServer.mockRejectedValueOnce(api(409, "CARGOS_MONEDA_DISTINTA", "Los cargos son de cuentas en MXN y USD: …", { monedas: ["MXN", "USD"] }));
    expect(await gastosCandidatosDeCargosAction([A, B])).toMatchObject({
      code: "CARGOS_MONEDA_DISTINTA",
      status: 409,
      details: { monedas: ["MXN", "USD"] },
    });
    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    expect(await gastosCandidatosDeCargosAction([A, B])).toEqual({ ok: false, error: "fetch failed" });
    expect(await ligarCargosAGastoAction(GASTO, [A, B])).toEqual({ ok: false, error: "fetch failed" });
  });
});
