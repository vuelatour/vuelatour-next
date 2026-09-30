/**
 * Server actions del emparejamiento cargo ↔ devolución (30-sep-2026, API
 * 0.0.44). Se custodia el CONTRATO con el API:
 *
 *  1. candidatos desde un ABONO = `GET movimientos/:id/reverso-candidatos`
 *     (cargos del día que dice la descripción primero); desde un CARGO = la
 *     lista de ABONOS pendientes de la cuenta (tipo/conciliado/desde/hasta,
 *     parámetros que el DTO acepta) filtrada por monto;
 *  2. emparejar = `POST movimientos/:abonoId/reverso {cargo_id}`; quitar =
 *     `DELETE movimientos/:id/reverso`; lote = `POST reversos/auto` con SOLO
 *     los filtros válidos (el DTO rechaza propiedades desconocidas);
 *  3. un id inválido no llega al API y el error del API conserva code/status/
 *     details (el diálogo pinta el motivo del trigger).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const {
  candidatosReversoAction,
  emparejarReversoAction,
  emparejarReversosAutoAction,
  quitarReversoAction,
} = await import("../actions");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const ABONO = "405466de-599b-4c0e-b2df-203133282530";
const CARGO = "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3";

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("candidatosReversoAction", () => {
  it("desde el ABONO: GET reverso-candidatos, sin caché; el 21-sep primero", async () => {
    apiServer.mockResolvedValue([
      { id: "a", fecha: "2026-09-22", descripcion: "ASUR CANCUN", referencia: null, monto: "825.13" },
      { id: "b", fecha: "2026-09-21", descripcion: "ASUR CANCUN", referencia: "1", monto: "825.13" },
    ]);
    const r = await candidatosReversoAction({
      id: ABONO,
      tipo: "ABONO",
      cuenta_bancaria_id: CUENTA,
      fecha: "2026-09-23",
      monto: "825.13",
      descripcion: "CARGO INDEBIDO 21 SEP 35552",
    });
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/conciliacion/movimientos/${ABONO}/reverso-candidatos`);
    expect(init).toEqual({ cache: "no-store" });
    expect(r.ok).toBe(true);
    expect(r.data?.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("desde el CARGO: la lista de ABONOS pendientes de la cuenta, del día a +60, filtrada por monto", async () => {
    apiServer.mockResolvedValue({
      data: [
        {
          id: ABONO,
          cuenta_bancaria_id: CUENTA,
          tipo: "ABONO",
          fecha: "2026-09-23",
          monto: "825.13",
          descripcion: "CARGO INDEBIDO 21 SEP 35552",
          referencia: "00000000001303268115",
          conciliado: false,
          gasto_id: null,
          cobro_id: null,
          clasificacion_id: null,
        },
        {
          id: "otro",
          cuenta_bancaria_id: CUENTA,
          tipo: "ABONO",
          fecha: "2026-09-24",
          monto: "1200.00",
          descripcion: "SPEI",
          referencia: null,
          conciliado: false,
          gasto_id: null,
          cobro_id: null,
          clasificacion_id: null,
        },
      ],
      count: 2,
      limit: 500,
      offset: 0,
    });
    const r = await candidatosReversoAction({
      id: CARGO,
      tipo: "CARGO",
      cuenta_bancaria_id: CUENTA,
      fecha: "2026-09-21",
      monto: "825.13",
      descripcion: "ASUR CANCUN",
    });
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/conciliacion/movimientos");
    expect(init.searchParams).toEqual({
      cuenta_bancaria_id: CUENTA,
      conciliado: false,
      tipo: "ABONO",
      desde: "2026-09-21",
      hasta: "2026-11-20",
      limit: 500,
    });
    expect(r.data?.map((c) => c.id)).toEqual([ABONO]);
  });

  it("id o fecha inválidos: no llama al API", async () => {
    const r = await candidatosReversoAction({
      id: "nada",
      tipo: "ABONO",
      cuenta_bancaria_id: CUENTA,
      fecha: "2026-09-23",
      monto: 1,
    });
    expect(r.ok).toBe(false);
    const r2 = await candidatosReversoAction({
      id: ABONO,
      tipo: "ABONO",
      cuenta_bancaria_id: CUENTA,
      fecha: "ayer",
      monto: 1,
    });
    expect(r2.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("un fallo de lectura vuelve como error (nunca como lista vacía)", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 502, code: "BAD_GATEWAY", message: "Application failed to respond" }),
    );
    const r = await candidatosReversoAction({
      id: ABONO,
      tipo: "ABONO",
      cuenta_bancaria_id: CUENTA,
      fecha: "2026-09-23",
      monto: "825.13",
    });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.status).toBe(502);
  });
});

describe("emparejar, quitar y lote", () => {
  it("emparejar: POST al ABONO con {cargo_id} y refresca Conciliación e Ingresos", async () => {
    apiServer.mockResolvedValue({ abono: { id: ABONO }, cargo: { id: CARGO } });
    const r = await emparejarReversoAction(ABONO, CARGO);
    expect(apiServer).toHaveBeenCalledWith(`/v1/conciliacion/movimientos/${ABONO}/reverso`, {
      method: "POST",
      body: { cargo_id: CARGO },
    });
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/conciliacion");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/ingresos");
  });

  it("emparejar: 409 REVERSO_INVALIDO conserva code, status y el motivo", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "REVERSO_INVALIDO",
        message: "No se pudo emparejar.",
        details: { motivo: "El cargo ya está ligado a un gasto." },
      }),
    );
    const r = await emparejarReversoAction(ABONO, CARGO);
    expect(r).toMatchObject({
      ok: false,
      code: "REVERSO_INVALIDO",
      status: 409,
      details: { motivo: "El cargo ya está ligado a un gasto." },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("emparejar: ids inválidos o iguales no llegan al API", async () => {
    expect((await emparejarReversoAction("x", CARGO)).ok).toBe(false);
    expect((await emparejarReversoAction(ABONO, ABONO)).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("quitar: DELETE desde cualquiera de los dos", async () => {
    apiServer.mockResolvedValue(undefined);
    const r = await quitarReversoAction(CARGO);
    expect(apiServer).toHaveBeenCalledWith(`/v1/conciliacion/movimientos/${CARGO}/reverso`, {
      method: "DELETE",
    });
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/conciliacion");
    expect((await quitarReversoAction("nada")).ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("lote: solo los filtros válidos viajan (forbidNonWhitelisted)", async () => {
    apiServer.mockResolvedValue({ emparejados: 7, sin_candidato: 0, ambiguos: 0, detalle: [] });
    await emparejarReversosAutoAction({});
    expect(apiServer.mock.calls[0]).toEqual([
      "/v1/conciliacion/reversos/auto",
      { method: "POST", body: {} },
    ]);
    await emparejarReversosAutoAction({ cuenta_bancaria_id: CUENTA, desde: "2026-09-01", hasta: "nada" });
    expect(apiServer.mock.calls[1][1].body).toEqual({ cuenta_bancaria_id: CUENTA, desde: "2026-09-01" });
    await emparejarReversosAutoAction({ cuenta_bancaria_id: "no-uuid", hasta: "2026-09-30" });
    expect(apiServer.mock.calls[2][1].body).toEqual({ hasta: "2026-09-30" });
  });

  it("lote: 404 de un API previo vuelve como error con status", async () => {
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot POST /v1/conciliacion/reversos/auto" }),
    );
    const r = await emparejarReversosAutoAction({});
    expect(r).toMatchObject({ ok: false, status: 404, error: "Cannot POST /v1/conciliacion/reversos/auto" });
  });
});
