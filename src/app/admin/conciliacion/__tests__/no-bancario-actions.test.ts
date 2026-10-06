/**
 * Server actions de «Vincular gasto» con un gasto que NO pasó por el banco
 * (6-oct-2026, API 0.0.63). Se custodia el CONTRATO con el API:
 *
 *  1. candidatos: `incluir_no_bancarios` viaja SOLO en true y como booleano
 *     (el fetcher lo vuelve «true»: el `@ToBooleanQuery` del API no acepta
 *     «1»); un API previo (400 «property … should not exist») ⇒
 *     `API_SIN_NO_BANCARIOS` con el texto en es-MX;
 *  2. ligar (uno o varios): `justificacion` viaja SOLO si la mandan, limpia
 *     (espacios colapsados) y validada ANTES de la red (10 a 300); sin ella el
 *     cuerpo es EXACTAMENTE el de siempre; al desligar nunca viaja;
 *  3. los 400/409 nuevos (`JUSTIFICACION_REQUERIDA`, `GASTO_BODEGA`) conservan
 *     code/status/details y un API previo ⇒ `API_SIN_JUSTIFICACION`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_LOTE_API_VIEJO } from "@/lib/admin/conciliacion-lote";
import {
  MSG_JUSTIFICACION_API_VIEJO,
  MSG_NO_BANCARIOS_API_VIEJO,
} from "@/lib/admin/conciliacion-no-bancario";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { gastosCandidatosAction, linkMovimientoAction, linkMovimientoGastosAction } = await import("../actions");

/** El cargo real: $212.00 del 07-sep-2026, ASUR CANCUN. */
const CARGO = "520b2b2f-ab74-4d62-8dd6-d2e0a01a9e9e";
const G27 = "e5aa4ec9-07e2-4311-90a9-b6150d04bbd8";
const G28 = "053fa6f4-2b14-4f17-9713-6f75efde971f";
const RAZON = "Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28.";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("gastosCandidatosAction · incluir_no_bancarios", () => {
  const RESPUESTA = {
    movimiento: { id: CARGO, fecha: "2026-09-07", monto: 212, moneda: "MXN" },
    ventana: { desde: "2026-08-08", hasta: "2026-10-07" },
    candidatos: [{ id: G28, monto: 212, moneda: "MXN", medio_pago: "EFECTIVO", no_bancario: true }],
    truncado: false,
  };

  it("encendido: viaja `incluir_no_bancarios: true` (el fetcher lo vuelve «true») junto con q y dias", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    const r = await gastosCandidatosAction(CARGO, { q: "212", dias: 30, incluir_no_bancarios: true });
    expect(apiServer.mock.calls[0][1]).toEqual({
      searchParams: { q: "212", dias: 30, incluir_no_bancarios: true },
      cache: "no-store",
    });
    expect(String(apiServer.mock.calls[0][1].searchParams.incluir_no_bancarios)).toBe("true");
    expect(r).toEqual({ ok: true, data: RESPUESTA });
  });

  it("apagado o ausente: la llave NO viaja (un API previo rechaza llaves desconocidas)", async () => {
    apiServer.mockResolvedValue(RESPUESTA);
    await gastosCandidatosAction(CARGO, { q: "212", incluir_no_bancarios: false });
    await gastosCandidatosAction(CARGO, { q: "212" });
    await gastosCandidatosAction(CARGO, { q: "212", incluir_no_bancarios: null });
    for (const [, init] of apiServer.mock.calls) {
      expect(init.searchParams).not.toHaveProperty("incluir_no_bancarios");
    }
  });

  it("API previo: 400 «property incluir_no_bancarios should not exist» ⇒ API_SIN_NO_BANCARIOS", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "BAD_REQUEST",
        message: "property incluir_no_bancarios should not exist",
      }),
    );
    const r = await gastosCandidatosAction(CARGO, { incluir_no_bancarios: true });
    expect(r).toEqual({ ok: false, code: "API_SIN_NO_BANCARIOS", status: 400, error: MSG_NO_BANCARIOS_API_VIEJO });
    // El 404 de la ruta (API aún más viejo) sigue siendo el respaldo de siempre.
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: `Cannot GET /v1/conciliacion/movimientos/${CARGO}/gastos-candidatos`,
      }),
    );
    expect(await gastosCandidatosAction(CARGO, { incluir_no_bancarios: true })).toEqual({
      ok: false,
      code: "RUTA_NO_DISPONIBLE",
      status: 404,
      error: MSG_LOTE_API_VIEJO,
    });
  });
});

describe("linkMovimientoAction · justificación", () => {
  it("con justificación: `{gasto_id, justificacion}` limpia; revalida Conciliación y Gastos", async () => {
    apiServer.mockResolvedValue({ id: CARGO });
    const r = await linkMovimientoAction(CARGO, G28, { justificacion: `  ${RAZON.replace(" se usa", "\n\n se usa")}  ` });
    expect(apiServer.mock.calls[0]).toEqual([
      `/v1/conciliacion/movimientos/${CARGO}`,
      { method: "PATCH", body: { gasto_id: G28, justificacion: RAZON } },
    ]);
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/conciliacion");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/expenses");
  });

  it("sin justificación (o vacía): el cuerpo de SIEMPRE, sin la llave", async () => {
    apiServer.mockResolvedValue({ id: CARGO });
    await linkMovimientoAction(CARGO, G28);
    await linkMovimientoAction(CARGO, G28, { justificacion: undefined });
    await linkMovimientoAction(CARGO, G28, { justificacion: "   " });
    for (const [, init] of apiServer.mock.calls) expect(init.body).toEqual({ gasto_id: G28 });
    expect(revalidatePath).not.toHaveBeenCalledWith("/admin/expenses");
  });

  it("desligar (gasto_id null) NUNCA manda justificación", async () => {
    apiServer.mockResolvedValue({ id: CARGO });
    await linkMovimientoAction(CARGO, null, { justificacion: RAZON });
    expect(apiServer.mock.calls[0][1].body).toEqual({ gasto_id: null });
  });

  it("justificación corta o larga: no llega al API, error en es-MX", async () => {
    const corta = await linkMovimientoAction(CARGO, G28, { justificacion: "Ticket" });
    expect(corta).toEqual({
      ok: false,
      code: "JUSTIFICACION_INVALIDA",
      error: "Escribe al menos 10 caracteres (van 6).",
    });
    const larga = await linkMovimientoAction(CARGO, G28, { justificacion: "x".repeat(301) });
    expect(larga).toMatchObject({ ok: false, code: "JUSTIFICACION_INVALIDA", error: "Máximo 300 caracteres (van 301)." });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("400 JUSTIFICACION_REQUERIDA y 409 GASTO_BODEGA conservan code, status y details", async () => {
    const details = { gastos_no_bancarios: [{ id: G28, medio_pago: "EFECTIVO", fecha_gasto: "2026-09-28", monto: 212 }] };
    apiServer.mockRejectedValueOnce(
      new ApiError({
        statusCode: 400,
        code: "JUSTIFICACION_REQUERIDA",
        message: "El gasto del 28 sep está en efectivo: para vincularlo a un cargo del banco escribe por qué",
        details,
      }),
    );
    expect(await linkMovimientoAction(CARGO, G28)).toMatchObject({
      ok: false,
      code: "JUSTIFICACION_REQUERIDA",
      status: 400,
      details,
    });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "GASTO_BODEGA", message: "Un gasto de bodega no se concilia." }),
    );
    expect(await linkMovimientoAction(CARGO, G28, { justificacion: RAZON })).toMatchObject({
      ok: false,
      code: "GASTO_BODEGA",
      status: 409,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("API previo: 400 «property justificacion should not exist» ⇒ API_SIN_JUSTIFICACION", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: "property justificacion should not exist" }),
    );
    expect(await linkMovimientoAction(CARGO, G28, { justificacion: RAZON })).toEqual({
      ok: false,
      code: "API_SIN_JUSTIFICACION",
      status: 400,
      error: MSG_JUSTIFICACION_API_VIEJO,
    });
  });
});

describe("linkMovimientoGastosAction · lote mixto (bancario + efectivo)", () => {
  const GT = "a3150000-0000-4000-8000-000000000315";

  it("con justificación: `{gasto_ids, justificacion}`; sin ella, `{gasto_ids}` de siempre", async () => {
    apiServer.mockResolvedValue({ id: CARGO, gastos_n: 2 });
    await linkMovimientoGastosAction(CARGO, [GT, G28], { justificacion: RAZON });
    expect(apiServer.mock.calls[0][1]).toEqual({ method: "PATCH", body: { gasto_ids: [GT, G28], justificacion: RAZON } });
    await linkMovimientoGastosAction(CARGO, [GT, G27]);
    expect(apiServer.mock.calls[1][1]).toEqual({ method: "PATCH", body: { gasto_ids: [GT, G27] } });
  });

  it("justificación inválida: no llega al API", async () => {
    const r = await linkMovimientoGastosAction(CARGO, [GT, G28], { justificacion: "corta" });
    expect(r).toMatchObject({ ok: false, code: "JUSTIFICACION_INVALIDA" });
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("API sin lotes: el respaldo de siempre gana (su 400 nombra gasto_ids)", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "BAD_REQUEST",
        message: "property gasto_ids should not exist, property justificacion should not exist",
      }),
    );
    expect(await linkMovimientoGastosAction(CARGO, [GT, G28], { justificacion: RAZON })).toEqual({
      ok: false,
      code: "API_SIN_LOTE",
      status: 400,
      error: MSG_LOTE_API_VIEJO,
    });
  });

  it("API con lotes pero sin justificación ⇒ API_SIN_JUSTIFICACION", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: "property justificacion should not exist" }),
    );
    expect(await linkMovimientoGastosAction(CARGO, [GT, G28], { justificacion: RAZON })).toMatchObject({
      ok: false,
      code: "API_SIN_JUSTIFICACION",
    });
  });
});
