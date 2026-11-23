/**
 * Server actions del COBRO CON UTILIDADES DEL SOCIO (23-nov-2026, API 0.0.148).
 *
 *  1. `registrarCobroUtilidadesAction`: POST a
 *     `/v1/profit-sharing/vuelos/:id/cobro-utilidades` con el cuerpo campo
 *     por campo — JAMÁS un método de cobro ni una llave de más (el API tiene
 *     `forbidNonWhitelisted`) —, revalida el vuelo, la cotización y Pagos a
 *     socios, y nunca lanza: el rechazo vuelve con `code`/`details`/`status`
 *     (el 409 `PAGO_EXCEDE_SALDO` es la confirmación del adelanto).
 *  2. `sociosParaCobroUtilidadesAction`: los socios de `GET
 *     /v1/profit-sharing/socios` SIN la empresa y solo con lo que la ficha
 *     lee; un fallo dice por qué (nunca «sin socios»).
 *  3. `deleteCobroAction` con `conUtilidades`: además revalida Pagos a socios
 *     (el API da de baja también la entrega).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { CobroUtilidadesPayload } from "@/types/flights";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { deleteCobroAction, registrarCobroUtilidadesAction, sociosParaCobroUtilidadesAction } = await import(
  "../actions"
);

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
const COBRO = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";
const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const EMPRESA = "50c10000-0000-4000-8000-000000000002";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const LLAVE = "7b7b0000-0000-4000-8000-00000000000a";

const PAYLOAD: CobroUtilidadesPayload = {
  socio_id: MAURICIO,
  aeronave_id: N4142R,
  monto: 45000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  fecha_cobro: "2026-11-20T17:00:00.000Z",
  notas: "Vuelo familiar",
  client_request_id: LLAVE,
};

const rutasRevalidadas = () => revalidatePath.mock.calls.map((c) => c[0]);

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("registrarCobroUtilidadesAction", () => {
  it("POST a SU endpoint con el cuerpo exacto (sin método de cobro)", async () => {
    apiServer.mockResolvedValue({ cobro: { id: COBRO }, pago: { id: "p-1" } });
    const res = await registrarCobroUtilidadesAction(VUELO, PAYLOAD);
    expect(res.ok).toBe(true);
    expect(apiServer).toHaveBeenCalledTimes(1);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/profit-sharing/vuelos/${VUELO}/cobro-utilidades`);
    expect(init.method).toBe("POST");
    expect(init.body).toEqual(PAYLOAD);
    expect(Object.keys(init.body)).not.toContain("metodo_cobro");
    expect(Object.keys(init.body)).not.toContain("aceptar_exceso");
  });

  it("una llave de más en el objeto NO viaja (el API responde 400 a lo que no conoce)", async () => {
    apiServer.mockResolvedValue({ cobro: { id: COBRO }, pago: { id: "p-1" } });
    await registrarCobroUtilidadesAction(VUELO, {
      ...PAYLOAD,
      notas: "   ",
      fecha_cobro: undefined,
      // Lo que jamás debe llegar al API aunque alguien lo cuele.
      ...({ metodo_cobro: "__UTILIDADES_SOCIO__", cuenta_destino: "HSBC Pesos" } as object),
    });
    const body = apiServer.mock.calls[0][1].body;
    expect(Object.keys(body).sort()).toEqual(
      ["aeronave_id", "client_request_id", "moneda", "monto", "socio_id", "tc_usd_mxn"].sort(),
    );
  });

  it("el adelanto confirmado viaja con `aceptar_exceso: true` y la MISMA llave", async () => {
    apiServer.mockResolvedValue({ cobro: { id: COBRO }, pago: { id: "p-1" } });
    await registrarCobroUtilidadesAction(VUELO, { ...PAYLOAD, aceptar_exceso: true });
    expect(apiServer.mock.calls[0][1].body).toMatchObject({ aceptar_exceso: true, client_request_id: LLAVE });
  });

  it("revalida el vuelo, la cotización y las pantallas de Pagos a socios", async () => {
    apiServer.mockResolvedValue({ cobro: { id: COBRO }, pago: { id: "p-1" } });
    await registrarCobroUtilidadesAction(VUELO, PAYLOAD);
    expect(rutasRevalidadas()).toEqual(
      expect.arrayContaining([
        "/admin/flights",
        `/admin/flights/${VUELO}`,
        "/admin/quotes",
        `/admin/quotes/${VUELO}`,
        "/admin/profit-sharing",
        "/admin/profit-sharing/socios",
        "/admin/profit-sharing/socios/[id]",
        "/admin/profit-sharing/aviones/[id]",
      ]),
    );
  });

  it("replay de la misma llave: devuelve `idempotente` tal cual", async () => {
    apiServer.mockResolvedValue({ cobro: { id: COBRO }, pago: { id: "p-1" }, idempotente: true });
    const res = await registrarCobroUtilidadesAction(VUELO, PAYLOAD);
    expect(res).toMatchObject({ ok: true, data: { idempotente: true } });
  });

  it("409 PAGO_EXCEDE_SALDO: no lanza, no revalida y conserva code/details/status", async () => {
    const details = { por_entregar_mxn: 12000, monto_mxn: 45000, exceso_mxn: 33000 };
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "PAGO_EXCEDE_SALDO",
        message: "El cobro supera lo que hay por entregar a Mauricio Roque.",
        details,
      }),
    );
    const res = await registrarCobroUtilidadesAction(VUELO, PAYLOAD);
    expect(res).toMatchObject({ ok: false, code: "PAGO_EXCEDE_SALDO", status: 409, details });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("los rechazos del API llegan con su texto en español; lo técnico se traduce", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "COBRO_EXCEDE_SALDO",
        message: "El cobro rebasa lo pendiente del vuelo.",
      }),
    );
    expect(await registrarCobroUtilidadesAction(VUELO, PAYLOAD)).toMatchObject({
      ok: false,
      code: "COBRO_EXCEDE_SALDO",
      error: "El cobro rebasa lo pendiente del vuelo.",
    });

    apiServer.mockRejectedValue(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden resource" }));
    expect((await registrarCobroUtilidadesAction(VUELO, PAYLOAD)).error).toBe(
      "Solo Dirección y Facturación pueden cobrar un vuelo con utilidades del socio.",
    );

    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: `Cannot POST /v1/profit-sharing/vuelos/${VUELO}/cobro-utilidades`,
      }),
    );
    expect((await registrarCobroUtilidadesAction(VUELO, PAYLOAD)).error).toContain("falta actualizarlo");

    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 503, code: "COBRO_UTILIDADES_NO_DISPONIBLE", message: "" }),
    );
    expect(await registrarCobroUtilidadesAction(VUELO, PAYLOAD)).toMatchObject({
      ok: false,
      code: "COBRO_UTILIDADES_NO_DISPONIBLE",
      status: 503,
    });
  });

  it("la llamada caída (red) no lanza: dice que reintentar no duplica", async () => {
    apiServer.mockRejectedValue(new TypeError("fetch failed"));
    const res = await registrarCobroUtilidadesAction(VUELO, PAYLOAD);
    expect(res).toMatchObject({ ok: false, code: "SIN_CONEXION" });
    expect(res.error).toContain("no se duplica");
  });

  it("guardas: sin ids válidos, monto, T.C. o llave no se llama al API", async () => {
    for (const [malo, fragmento] of [
      [{ socio_id: "" }, "Elige el socio"],
      [{ aeronave_id: "N4142R" }, "de qué avión"],
      [{ monto: 0 }, "mayor a 0"],
      [{ tc_usd_mxn: 0 }, "tipo de cambio"],
      [{ client_request_id: "abc" }, "vuelve a abrirlo"],
    ] as const) {
      const res = await registrarCobroUtilidadesAction(VUELO, { ...PAYLOAD, ...malo });
      expect(res.ok).toBe(false);
      expect(res.error).toContain(fragmento);
    }
    expect((await registrarCobroUtilidadesAction("v-1", PAYLOAD)).error).toContain("No se reconoce el vuelo");
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("sociosParaCobroUtilidadesAction", () => {
  const socio = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
    socio: { id, nombre, rol: "SOCIO", estado: "ACTIVO", es_empresa: false, ...extra },
    cuenta: { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: true },
    generado_mxn: 100000,
    mes_en_curso_mxn: 0,
    entregado_mxn: 58000,
    por_entregar_mxn: 42000,
    por_entregar_cerrado_mxn: 42000,
    estado: "POR_ENTREGAR",
    ultimo_pago: null,
    aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, activa: true }],
    avisos: [],
    por_avion: [],
    cuenta_por_avion: false,
  });

  it("lee el MISMO endpoint que «Pagos a socios» y deja fuera a la empresa", async () => {
    apiServer.mockResolvedValue({
      disponible: true,
      hasta_mes: "2026-11",
      socios: [
        socio(MAURICIO, "Mauricio Roque"),
        socio(EMPRESA, "Aero Charter Cancún", { es_empresa: true }),
      ],
      totales: null,
    });
    const res = await sociosParaCobroUtilidadesAction();
    expect(apiServer.mock.calls[0][0]).toBe("/v1/profit-sharing/socios");
    expect(res).toEqual({
      ok: true,
      data: [
        {
          id: MAURICIO,
          nombre: "Mauricio Roque",
          aviones: [
            { id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true, porEntregarCerradoMxn: 42000 },
          ],
          cuentaPorAvion: false,
          adelantadoGeneralMxn: 0,
        },
      ],
    });
  });

  it("un fallo dice POR QUÉ (jamás una lista vacía que parezca «no hay socios»)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockRejectedValue(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden resource" }));
    expect(await sociosParaCobroUtilidadesAction()).toMatchObject({ ok: false, code: "sin-permiso" });

    apiServer.mockRejectedValue(new ApiError({ statusCode: 500, code: "UNKNOWN", message: "Internal server error" }));
    const caido = await sociosParaCobroUtilidadesAction();
    expect(caido).toMatchObject({ ok: false, code: "error" });
    expect(caido.error).toContain("No se pudieron cargar los socios");

    apiServer.mockResolvedValue({ disponible: false, socios: [] });
    expect(await sociosParaCobroUtilidadesAction()).toMatchObject({ ok: false, code: "no-disponible" });
    vi.restoreAllMocks();
  });
});

describe("deleteCobroAction con un cobro pagado con utilidades", () => {
  it("el DELETE de siempre; con `conUtilidades` revalida además Pagos a socios", async () => {
    apiServer.mockResolvedValue(undefined);
    expect(await deleteCobroAction(VUELO, COBRO, { conUtilidades: true })).toEqual({ ok: true });
    expect(apiServer.mock.calls[0]).toEqual([`/v1/flights/cobros/${COBRO}`, { method: "DELETE" }]);
    expect(rutasRevalidadas()).toEqual(
      expect.arrayContaining([`/admin/flights/${VUELO}`, "/admin/profit-sharing/socios"]),
    );
  });

  it("un cobro normal no toca Pagos a socios", async () => {
    apiServer.mockResolvedValue(undefined);
    await deleteCobroAction(VUELO, COBRO);
    expect(rutasRevalidadas()).toEqual(["/admin/flights", `/admin/flights/${VUELO}`]);
  });

  it("otro rol ⇒ 403 `COBRO_CON_UTILIDADES_SOLO_DIRECCION` llega con su código y su texto", async () => {
    apiServer.mockRejectedValue(
      new ApiError({
        statusCode: 403,
        code: "COBRO_CON_UTILIDADES_SOLO_DIRECCION",
        message: "Solo Dirección o Facturación pueden quitar un cobro pagado con utilidades del socio.",
      }),
    );
    const res = await deleteCobroAction(VUELO, COBRO, { conUtilidades: true });
    expect(res).toMatchObject({ ok: false, code: "COBRO_CON_UTILIDADES_SOLO_DIRECCION" });
    expect(res.error).toContain("Solo Dirección o Facturación");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
