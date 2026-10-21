/**
 * CUENTA CORRIENTE DE LOS SOCIOS (v2, 1-oct-2026, API 0.0.50): server
 * actions y lecturas del server. Se custodia el CONTRATO con el API:
 *
 *  1. alta = `POST /v1/profit-sharing/pagos` con el cuerpo TAL CUAL (llave y
 *     `aceptar_exceso` viajan), responde `{ pago, cuenta }` normalizado y
 *     revalida el reparto, la lista de socios y el estado de cuenta;
 *  2. el 409 `PAGO_EXCEDE_SALDO` conserva `code`/`details` (el diálogo lo
 *     vuelve la confirmación del ADELANTO);
 *  3. edición = `PATCH /pagos/:id`; baja = `DELETE /pagos/:id { motivo }`;
 *     «Configurar cuenta» = `PUT /socios/:id/cuenta`;
 *  4. un id inválido no llega al API;
 *  5. las lecturas NUNCA lanzan y distinguen API previo / sin migración /
 *     sin permiso / socio inexistente / fallo — un 503 de un deploy NO es
 *     «falta la migración»;
 *  6. el contexto de registro (lista de «Entregó», T.C. oficial de hoy) solo
 *     se pide para quien registra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { Degradaciones } from "@/lib/api/degradar";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const {
  cambiarDescuentoReservaAction,
  configurarCuentaSocioAction,
  crearPagoSocioAction,
  editarPagoSocioAction,
  eliminarPagoSocioAction,
} = await import("../actions");
const {
  getAvionDetalle,
  getAvionHistorico,
  getContextoRegistro,
  getEntregasAntesDelArranque,
  getEstadoCuentaSocio,
  getSociosCuenta,
} = await import("@/lib/api/profit-sharing-server");

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const PAGO = "9a9a0000-0000-4000-8000-000000000001";
const CRID = "c0c0c0c0-0000-4000-8000-000000000001";

const PAGO_API = {
  id: PAGO,
  socio_id: MAURICIO,
  aeronave_id: null,
  aeronave: null,
  periodo: null,
  mes: null,
  monto: "70000",
  moneda: "MXN",
  tc_usd_mxn: "18.500000",
  monto_usd: "3783.78",
  monto_mxn: "70000",
  utilidad_snapshot_usd: null,
  saldo_snapshot_usd: "1395.94",
  saldo_snapshot_mxn: "25824.87",
  fecha_pago: "2026-10-01",
  metodo: "EFECTIVO",
  referencia: null,
  entregado_por: "0f1c0000-0000-4000-8000-000000000009",
  entregado_por_nombre: "Alejandro Canales",
  recibido_por: null,
  factura_folio: null,
  comprobante_path: null,
  comprobante_url: null,
  notas: null,
  created_by: "0f1c0000-0000-4000-8000-000000000009",
  created_by_nombre: "Alejandro Canales",
  created_at: "2026-10-01T18:00:00Z",
};
const CUENTA_API = {
  socio: { id: MAURICIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "ACTIVO" },
  cuenta: { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: false },
  generado_mxn: 1395.94,
  mes_en_curso_mxn: 0,
  entregado_mxn: 3783.78,
  por_entregar_mxn: -2387.84,
  estado: "ADELANTADO",
  ultimo_pago: { id: PAGO, fecha_pago: "2026-10-01", monto: 70000, moneda: "MXN", monto_mxn: 70000, monto_usd: 3783.78, metodo: "EFECTIVO" },
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true }],
};

const RUTAS_REVALIDADAS = [
  ["/admin/profit-sharing"],
  ["/admin/profit-sharing/socios"],
  ["/admin/profit-sharing/socios/[id]", "page"],
  // Pantalla por avión y su histórico (20-oct-2026): enseñan lo entregado por avión.
  ["/admin/profit-sharing/aviones/[id]", "page"],
  ["/admin/profit-sharing/aviones/[id]/historico", "page"],
];

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("crearPagoSocioAction (registrar entrega)", () => {
  const cuerpo = {
    socio_id: MAURICIO,
    monto: 70000,
    moneda: "MXN" as const,
    tc_usd_mxn: 18.5,
    fecha_pago: "2026-10-01",
    metodo: "EFECTIVO" as const,
    client_request_id: CRID,
  };

  it("POST con el cuerpo tal cual; `{ pago, cuenta }` normalizado; revalida las TRES pantallas", async () => {
    apiServer.mockResolvedValueOnce({ pago: PAGO_API, cuenta: CUENTA_API });
    const r = await crearPagoSocioAction(cuerpo);
    expect(apiServer).toHaveBeenCalledWith("/v1/profit-sharing/pagos", { method: "POST", body: cuerpo });
    expect(r.ok).toBe(true);
    expect(r.data?.pago).toMatchObject({
      monto: 70000,
      monto_usd: 3783.78,
      monto_mxn: 70000,
      saldo_snapshot_mxn: 25824.87,
      tc_usd_mxn: 18.5,
    });
    expect(r.data?.cuenta).toMatchObject({ por_entregar_mxn: -2387.84, estado: "ADELANTADO" });
    expect(revalidatePath.mock.calls).toEqual(RUTAS_REVALIDADAS);
  });

  it("el reintento idempotente (200) se marca; sin `pago` no se celebra", async () => {
    apiServer.mockResolvedValueOnce({ pago: PAGO_API, cuenta: CUENTA_API, idempotente: true });
    expect((await crearPagoSocioAction(cuerpo)).data?.idempotente).toBe(true);
    apiServer.mockResolvedValueOnce({ cuenta: CUENTA_API });
    const r = await crearPagoSocioAction(cuerpo);
    expect(r).toMatchObject({ ok: false, code: "SIN_CONFIRMACION" });
  });

  it("409 PAGO_EXCEDE_SALDO conserva code y details EN PESOS (la confirmación del adelanto los lee)", async () => {
    const details = {
      por_entregar_mxn: 1395.94,
      mes_en_curso_mxn: 0,
      monto_mxn: 3783.78,
      exceso_mxn: 2387.84,
      saldo_despues_mxn: -2387.84,
    };
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 409, code: "PAGO_EXCEDE_SALDO", message: "Esta entrega…", details }),
    );
    const r = await crearPagoSocioAction(cuerpo);
    expect(r).toMatchObject({ ok: false, code: "PAGO_EXCEDE_SALDO", details, status: 409 });
  });

  it("con `aceptar_exceso` y la MISMA llave el cuerpo viaja igual", async () => {
    apiServer.mockResolvedValueOnce({ pago: PAGO_API, cuenta: CUENTA_API });
    await crearPagoSocioAction({ ...cuerpo, aceptar_exceso: true });
    expect(apiServer.mock.calls[0][1].body).toEqual({ ...cuerpo, aceptar_exceso: true });
  });

  it("ids inválidos y «corresponde a» mal formado no llegan al API", async () => {
    expect((await crearPagoSocioAction({ ...cuerpo, socio_id: "x" })).ok).toBe(false);
    expect((await crearPagoSocioAction({ ...cuerpo, aeronave_id: "x" })).ok).toBe(false);
    expect((await crearPagoSocioAction({ ...cuerpo, mes: "2026-13" })).ok).toBe(false);
    expect((await crearPagoSocioAction({ ...cuerpo, client_request_id: "x" })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("fallo de red ⇒ SIN_CONEXION en es-MX (nunca lanza)", async () => {
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await crearPagoSocioAction(cuerpo)).toMatchObject({ ok: false, code: "SIN_CONEXION" });
  });
});

describe("editar / eliminar entrega", () => {
  it("PATCH solo con lo que cambió; sin cambios no llama", async () => {
    apiServer.mockResolvedValueOnce({ pago: PAGO_API, cuenta: CUENTA_API });
    const r = await editarPagoSocioAction(PAGO, { metodo: "TRANSFERENCIA" });
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/pagos/${PAGO}`, {
      method: "PATCH",
      body: { metodo: "TRANSFERENCIA" },
    });
    expect(r.ok).toBe(true);
    expect((await editarPagoSocioAction(PAGO, {})).ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("PAGO_NO_EXISTE: revalida (la lista está vieja) y conserva el code", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "PAGO_NO_EXISTE", message: "x" }));
    const r = await editarPagoSocioAction(PAGO, { notas: null });
    expect(r.code).toBe("PAGO_NO_EXISTE");
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("DELETE con el motivo recortado; responde `{ deleted, cuenta }`; motivo corto no llama", async () => {
    apiServer.mockResolvedValueOnce({ deleted: true, cuenta: CUENTA_API });
    const r = await eliminarPagoSocioAction(PAGO, "  Se capturó dos veces  ");
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/pagos/${PAGO}`, {
      method: "DELETE",
      body: { motivo: "Se capturó dos veces" },
    });
    expect(r.data).toMatchObject({ deleted: true, cuenta: { estado: "ADELANTADO" } });
    expect((await eliminarPagoSocioAction(PAGO, "abc")).ok).toBe(false);
    expect((await eliminarPagoSocioAction("x", "Se capturó dos veces")).ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
  });
});

describe("configurarCuentaSocioAction («Configurar cuenta»)", () => {
  it("PUT /socios/:id/cuenta; responde el renglón del socio y revalida", async () => {
    apiServer.mockResolvedValueOnce({ ...CUENTA_API, cuenta: { cuenta_desde: "2026-06", saldo_inicial_mxn: -1500.5, notas: null, configurada: true } });
    const body = { cuenta_desde: "2026-06", saldo_inicial_mxn: -1500.5, notas: null };
    const r = await configurarCuentaSocioAction(MAURICIO, body);
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/socios/${MAURICIO}/cuenta`, {
      method: "PUT",
      body,
    });
    expect(r.data?.cuenta).toMatchObject({ cuenta_desde: "2026-06", configurada: true });
    expect(revalidatePath.mock.calls).toEqual(RUTAS_REVALIDADAS);
  });

  it("socio o mes inválido no llegan al API; el error del API sale en es-MX", async () => {
    expect((await configurarCuentaSocioAction("x", { cuenta_desde: "2026-06", saldo_inicial_mxn: 0 })).ok).toBe(false);
    expect((await configurarCuentaSocioAction(MAURICIO, { cuenta_desde: "2026-6", saldo_inicial_mxn: 0 })).ok).toBe(
      false,
    );
    expect(apiServer).not.toHaveBeenCalled();
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 400, code: "CUENTA_DESDE_FUTURA", message: "La cuenta no puede arrancar en un mes futuro: elige el mes en curso o uno anterior." }),
    );
    const r = await configurarCuentaSocioAction(MAURICIO, { cuenta_desde: "2026-11", saldo_inicial_mxn: 0 });
    expect(r.error).toBe("La cuenta no puede arrancar en un mes futuro: elige el mes en curso o uno anterior.");
  });
});

describe("getSociosCuenta (nunca lanza)", () => {
  it("ok con datos normalizados", async () => {
    apiServer.mockResolvedValueOnce({ disponible: true, hasta_mes: "2026-10", socios: [CUENTA_API], totales: null });
    const r = await getSociosCuenta();
    expect(apiServer).toHaveBeenCalledWith("/v1/profit-sharing/socios", { cache: "no-store" });
    expect(r.estado).toBe("ok");
    if (r.estado === "ok") expect(r.datos.socios[0].por_entregar_mxn).toBe(-2387.84);
  });

  it("sin la migración (`disponible:false` o 503 con su código) y API previo (404 «Cannot GET») ⇒ no-disponible", async () => {
    apiServer.mockResolvedValueOnce({ disponible: false, hasta_mes: "2026-10", socios: [], totales: null });
    expect((await getSociosCuenta()).estado).toBe("no-disponible");
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "CUENTA_SOCIO_NO_DISPONIBLE", message: "x" }),
    );
    expect((await getSociosCuenta()).estado).toBe("no-disponible");
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot GET /v1/profit-sharing/socios" }),
    );
    expect((await getSociosCuenta()).estado).toBe("no-disponible");
  });

  it("503 a secas (deploy) / 500 / basura ⇒ error; 403 ⇒ sin-permiso", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 503, code: "UNKNOWN", message: "Service Unavailable" }));
    expect((await getSociosCuenta()).estado).toBe("error");
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 500, code: "X", message: "boom" }));
    expect((await getSociosCuenta()).estado).toBe("error");
    apiServer.mockResolvedValueOnce("basura");
    expect((await getSociosCuenta()).estado).toBe("error");
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden" }));
    expect((await getSociosCuenta()).estado).toBe("sin-permiso");
  });
});

describe("getEstadoCuentaSocio (nunca lanza)", () => {
  const ESTADO = {
    disponible: true,
    socio: { id: MAURICIO, nombre: "Mauricio Roque" },
    cuenta: { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: false },
    desde: "2026-09",
    hasta: "2026-10",
    saldo_anterior_mxn: 0,
    movimientos: [],
    por_mes: [],
    totales: { generado_mxn: 0, entregado_mxn: 0, por_entregar_mxn: 0, estado: "AL_CORRIENTE" },
  };

  it("solo manda el filtro válido; sin filtro el API pone su default", async () => {
    apiServer.mockResolvedValue(ESTADO);
    await getEstadoCuentaSocio(MAURICIO, { desde: "2026-09", hasta: "nada" });
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/socios/${MAURICIO}/estado-cuenta`, {
      searchParams: { desde: "2026-09", hasta: undefined },
      cache: "no-store",
    });
    expect((await getEstadoCuentaSocio(MAURICIO)).estado).toBe("ok");
  });

  it("socio inexistente ⇒ no-existe (404 SOCIO_NO_EXISTE o id que no es uuid, sin llamar)", async () => {
    expect((await getEstadoCuentaSocio("x")).estado).toBe("no-existe");
    expect(apiServer).not.toHaveBeenCalled();
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "SOCIO_NO_EXISTE", message: "Ese socio no existe" }),
    );
    expect((await getEstadoCuentaSocio(MAURICIO)).estado).toBe("no-existe");
  });

  it("un SOCIO que pide la cuenta de otro ⇒ sin-permiso; sin la migración ⇒ no-disponible", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 403, code: "SOCIO_SOLO_SU_CUENTA", message: "Solo puedes consultar tu propia cuenta." }),
    );
    expect((await getEstadoCuentaSocio(MAURICIO)).estado).toBe("sin-permiso");
    apiServer.mockResolvedValueOnce({ disponible: false });
    expect((await getEstadoCuentaSocio(MAURICIO)).estado).toBe("no-disponible");
  });

  it("400 RANGO_INVALIDO con filtro ⇒ se pide UNA vez sin filtro y se marca `filtroIgnorado` («Reintentar» no lo arreglaría)", async () => {
    apiServer
      .mockRejectedValueOnce(
        new ApiError({ statusCode: 400, code: "RANGO_INVALIDO", message: "El mes «desde» no puede ser posterior…" }),
      )
      .mockResolvedValueOnce(ESTADO);
    const r = await getEstadoCuentaSocio(MAURICIO, { desde: "2026-09", hasta: "2026-08" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(apiServer.mock.calls[1][1]).toEqual({ searchParams: { desde: undefined, hasta: undefined }, cache: "no-store" });
    expect(r).toMatchObject({ estado: "ok", filtroIgnorado: true });
  });

  it("400 RANGO_INVALIDO SIN filtro (no hay nada que quitar) ⇒ error, sin bucle", async () => {
    apiServer.mockRejectedValue(new ApiError({ statusCode: 400, code: "RANGO_INVALIDO", message: "x" }));
    expect((await getEstadoCuentaSocio(MAURICIO)).estado).toBe("error");
    expect(apiServer).toHaveBeenCalledTimes(1);
    apiServer.mockReset();
    // Con filtro, el segundo intento también rechazado ⇒ error (dos llamadas, no más).
    apiServer.mockRejectedValue(new ApiError({ statusCode: 400, code: "RANGO_INVALIDO", message: "x" }));
    expect((await getEstadoCuentaSocio(MAURICIO, { desde: "2026-09" })).estado).toBe("error");
    expect(apiServer).toHaveBeenCalledTimes(2);
    apiServer.mockReset();
  });
});

describe("getEntregasAntesDelArranque (nunca lanza)", () => {
  it("pide las entregas del socio hasta el día previo al arranque y devuelve cuántas y el mes de la más antigua", async () => {
    apiServer.mockResolvedValueOnce({
      disponible: true,
      pagos: [
        { ...PAGO_API, id: "9a9a0000-0000-4000-8000-000000000002", fecha_pago: "2026-08-15" },
        { ...PAGO_API, fecha_pago: "2025-09-28" },
      ],
    });
    const r = await getEntregasAntesDelArranque(MAURICIO, "2026-09");
    expect(apiServer).toHaveBeenCalledWith("/v1/profit-sharing/pagos", {
      searchParams: { socio_id: MAURICIO, hasta: "2026-08-31" },
      cache: "no-store",
    });
    expect(r).toEqual({ n: 2, mesMasAntiguo: "2025-09" });
  });

  it("sin la migración, un fallo o un id inválido ⇒ null (el enlace usa la ventana de 36 meses)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockResolvedValueOnce({ disponible: false, pagos: [] });
    expect(await getEntregasAntesDelArranque(MAURICIO, "2026-09")).toBeNull();
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 500, code: "X", message: "boom" }));
    expect(await getEntregasAntesDelArranque(MAURICIO, "2026-09")).toBeNull();
    apiServer.mockReset();
    expect(await getEntregasAntesDelArranque("x", "2026-09")).toBeNull();
    expect(await getEntregasAntesDelArranque(MAURICIO, "nada")).toBeNull();
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("getContextoRegistro (lista de «Entregó» y T.C. oficial de hoy)", () => {
  const ME = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };

  it("quien no registra (SOCIO, ANALISTA) no pide nada", async () => {
    const r = await getContextoRegistro({ ...ME, rol: "SOCIO" }, new Degradaciones());
    expect(apiServer).not.toHaveBeenCalled();
    expect(r).toMatchObject({ usuarios: [], me: ME, tcOficial: null });
  });

  it("FACTURACION: solo el T.C. oficial (`/v1/users` es de ADMIN)", async () => {
    apiServer.mockResolvedValueOnce({ fecha: "2026-10-01", tc: 18.45, fuente: "OPEN_ER_API" });
    const r = await getContextoRegistro({ ...ME, rol: "FACTURACION" }, new Degradaciones());
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(apiServer.mock.calls[0][0]).toBe("/v1/tipo-cambio/oficial");
    expect(r.tcOficial).toBe(18.45);
  });

  it("ADMIN: usuarios activos (sin pilotos externos) + T.C.; si la lista falla, se DICE y sigue", async () => {
    apiServer.mockImplementation(async (ruta: string) =>
      ruta === "/v1/users"
        ? {
            data: [
              { id: "u1", nombre: "Itzi", estado: "ACTIVO", es_piloto_externo: false },
              { id: "u2", nombre: "Externo", estado: "ACTIVO", es_piloto_externo: true },
              { id: "u3", nombre: "Baja", estado: "INACTIVO", es_piloto_externo: false },
            ],
          }
        : { tc: null },
    );
    const r = await getContextoRegistro({ ...ME, rol: "ADMIN" }, new Degradaciones());
    expect(r.usuarios).toEqual([{ id: "u1", nombre: "Itzi" }]);
    expect(r.tcOficial).toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockImplementation(async (ruta: string) => {
      if (ruta === "/v1/users") throw new ApiError({ statusCode: 500, code: "X", message: "boom" });
      return { tc: 18.45 };
    });
    const degradado = new Degradaciones();
    const r2 = await getContextoRegistro({ ...ME, rol: "ADMIN" }, degradado);
    expect(r2.usuarios).toEqual([]);
    expect(degradado.faltantes).toEqual(["la lista de personas que entregan"]);
  });
});

// =============================================================================
// PANTALLA POR AVIÓN (20-oct-2026, API 0.0.101, invariante 99)
// =============================================================================

const N621TX = "a1a1a1a1-0000-4000-8000-000000000621";
const OWNER_1 = "0e0e0000-0000-4000-8000-000000000001";
const OWNER_2 = "0e0e0000-0000-4000-8000-000000000002";
const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };

const AVION_API = {
  periodo: PERIODO,
  reparto_en_pesos: true,
  reparto_como_balance: true,
  avion: {
    aeronave: { id: N621TX, matricula: "N621TX", modelo: "Cessna 421C" },
    ingresos: { cobrado_usd: 12000, comisiones_venta_usd: 0, pendiente_cobro_usd: 0, vuelos_cobrados: 2, vuelos_pendientes: 0, cobros_sin_tc_mxn: 0 },
    horas_voladas_hr: 12.5,
    gastos: { directos_usd: 4000, indirectos_usd: 800, permisos_usd: 150, otros_prorrateados_usd: 600, gastos_sin_tc_count: 0, gastos_sin_tc_mxn: 0 },
    reserva_overhaul_usd: 500,
    reserva_overhaul_incompleta: false,
    saldo_disponible_usd: 6250,
    afac_reservado_usd: 200,
    reparto: [],
    reparto_porcentaje_total: 100,
    detalle: { vuelos: [], gastos_por_categoria: [], reserva: { horas_hr: 12.5, tarifa_hora_usd: 40, monto_usd: 500 }, gastos: [] },
  },
  socios: [
    {
      socio_id: MAURICIO,
      socio_nombre: "Mauricio Roque",
      porcentaje: "69",
      utilidad_mxn: "74393.44",
      reserva_mxn: "5951.25",
      descuenta_reserva: true,
      monto_mxn: "68442.19",
      entregado_mxn: "20000",
      por_entregar_mxn: "48442.19",
      monto_usd: "3967.95",
      reserva_usd: "345",
    },
  ],
  entregas: [{ ...PAGO_API, aeronave_id: N621TX, aeronave: { id: N621TX, matricula: "N621TX" }, monto: "20000", monto_mxn: "20000", monto_usd: "1081.08" }],
  tc_oficial: { vuelos: 0, gastos: { count: 0, monto_mxn: 0 }, fuentes: [], leyenda: "x" },
  gastos_sin_tc: { count: 0, monto_mxn: 0 },
};

describe("cambiarDescuentoReservaAction (si se le descuenta la reserva, solo ADMIN)", () => {
  it("PATCH /v1/aircraft/owners/:id con { descontar_reserva_overhaul } por cada renglón y revalida reparto, avión, cuentas y ficha", async () => {
    apiServer.mockResolvedValue({ id: OWNER_1 });
    const r = await cambiarDescuentoReservaAction(N621TX, [OWNER_1, OWNER_2, OWNER_1], true);
    expect(r).toEqual({ ok: true, data: { aplicados: 2 } });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(apiServer).toHaveBeenNthCalledWith(1, `/v1/aircraft/owners/${OWNER_1}`, {
      method: "PATCH",
      body: { descontar_reserva_overhaul: true },
    });
    expect(apiServer).toHaveBeenNthCalledWith(2, `/v1/aircraft/owners/${OWNER_2}`, {
      method: "PATCH",
      body: { descontar_reserva_overhaul: true },
    });
    expect(revalidatePath.mock.calls).toEqual([...RUTAS_REVALIDADAS, [`/admin/aircraft/${N621TX}`]]);
  });

  it("ids inválidos o sin renglón no llegan al API", async () => {
    expect((await cambiarDescuentoReservaAction("x", [OWNER_1], false)).ok).toBe(false);
    expect((await cambiarDescuentoReservaAction(N621TX, [], false)).ok).toBe(false);
    expect((await cambiarDescuentoReservaAction(N621TX, ["nada"], false)).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("403 en es-MX; un fallo a medias dice cuántos renglones sí se aplicaron (y revalida)", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden" }));
    const r = await cambiarDescuentoReservaAction(N621TX, [OWNER_1], true);
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(r.error).toBe("Solo administración puede cambiar si se descuenta la reserva.");
    expect(revalidatePath).not.toHaveBeenCalled();

    apiServer.mockReset();
    apiServer.mockResolvedValueOnce({ id: OWNER_1 }).mockRejectedValueOnce(new TypeError("fetch failed"));
    const parcial = await cambiarDescuentoReservaAction(N621TX, [OWNER_1, OWNER_2], false);
    expect(parcial.ok).toBe(false);
    expect(parcial.error).toContain("Se aplicó en 1 de 2 renglones: recarga la página.");
    expect(revalidatePath).toHaveBeenCalled();
  });
});

describe("getAvionDetalle (nunca lanza)", () => {
  it("GET /v1/profit-sharing/aviones/:id?desde&hasta con forma sana (socios y entregas normalizados)", async () => {
    apiServer.mockResolvedValueOnce(AVION_API);
    const r = await getAvionDetalle(N621TX, PERIODO);
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/aviones/${N621TX}`, {
      searchParams: PERIODO,
      cache: "no-store",
    });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.datos.avion.aeronave.matricula).toBe("N621TX");
    expect(r.datos.socios[0]).toMatchObject({
      porcentaje: 69,
      utilidad_mxn: 74393.44,
      descuenta_reserva: true,
      por_entregar_mxn: 48442.19,
    });
    expect(r.datos.entregas[0]).toMatchObject({ monto: 20000, monto_mxn: 20000, aeronave: { id: N621TX, matricula: "N621TX" } });
  });

  it("id que no es uuid ⇒ no-existe sin llamar; 404 AERONAVE_NO_EXISTE ⇒ no-existe; 404 «Cannot GET» ⇒ no-disponible", async () => {
    expect((await getAvionDetalle("x", PERIODO)).estado).toBe("no-existe");
    expect(apiServer).not.toHaveBeenCalled();
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "AERONAVE_NO_EXISTE", message: "Ese avión no existe o está dado de baja." }),
    );
    expect((await getAvionDetalle(N621TX, PERIODO)).estado).toBe("no-existe");
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot GET /v1/profit-sharing/aviones/${N621TX}` }),
    );
    expect((await getAvionDetalle(N621TX, PERIODO)).estado).toBe("no-disponible");
  });

  it("403 ⇒ sin-permiso; 500 o basura ⇒ error (jamás «sin datos»)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden" }));
    expect((await getAvionDetalle(N621TX, PERIODO)).estado).toBe("sin-permiso");
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 500, code: "X", message: "boom" }));
    expect((await getAvionDetalle(N621TX, PERIODO)).estado).toBe("error");
    apiServer.mockResolvedValueOnce({ avion: {} });
    expect((await getAvionDetalle(N621TX, PERIODO)).estado).toBe("error");
  });
});

describe("getAvionHistorico (nunca lanza)", () => {
  const HISTORICO = {
    aeronave: { id: N621TX, matricula: "N621TX", modelo: "Cessna 421C" },
    desde: "2026-09",
    hasta: "2026-10",
    mes_actual: "2026-10",
    reparto_en_pesos: true,
    reparto_como_balance: true,
    meses: [
      {
        mes: "2026-09",
        en_curso: false,
        horas_voladas_hr: "12.5",
        vuelos: 2,
        cobrado_mxn: "210811.73",
        saldo_mxn: "100000",
        reserva_mxn: "8625",
        entregado_mxn: "20000",
        reparto: [],
        cierre_estado: "CERRADO",
      },
    ],
    totales: { horas_voladas_hr: 12.5, vuelos: 2, cobrado_mxn: 210811.73, saldo_mxn: 100000 },
    socios: [
      { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", generado_mxn: "69000", reserva_mxn: "5951.25", entregado_mxn: "20000", por_entregar_mxn: "49000" },
    ],
    entregas: [],
  };

  it("solo manda el filtro válido (meses); normaliza números que llegan como texto", async () => {
    apiServer.mockResolvedValue(HISTORICO);
    const r = await getAvionHistorico(N621TX, { desde: "2026-09", hasta: "nada" });
    expect(apiServer).toHaveBeenCalledWith(`/v1/profit-sharing/aviones/${N621TX}/historico`, {
      searchParams: { desde: "2026-09", hasta: undefined },
      cache: "no-store",
    });
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.datos.meses[0]).toMatchObject({
      mes: "2026-09",
      horas_voladas_hr: 12.5,
      cobrado_mxn: 210811.73,
      cierre_estado: "CERRADO",
      afac_mxn: 0,
    });
    expect(r.datos.socios[0]).toMatchObject({ generado_mxn: 69000, por_entregar_mxn: 49000 });
  });

  it("400 RANGO_INVALIDO con filtro ⇒ se pide UNA vez sin filtro y se marca `filtroIgnorado`; sin filtro ⇒ error", async () => {
    apiServer
      .mockRejectedValueOnce(new ApiError({ statusCode: 400, code: "RANGO_INVALIDO", message: "x" }))
      .mockResolvedValueOnce(HISTORICO);
    const r = await getAvionHistorico(N621TX, { desde: "2026-10", hasta: "2026-09" });
    expect(apiServer).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ estado: "ok", filtroIgnorado: true });
    apiServer.mockReset();
    apiServer.mockRejectedValue(new ApiError({ statusCode: 400, code: "RANGO_INVALIDO", message: "x" }));
    expect((await getAvionHistorico(N621TX)).estado).toBe("error");
    expect(apiServer).toHaveBeenCalledTimes(1);
  });

  it("id inválido ⇒ no-existe sin llamar; 404 AERONAVE_NO_EXISTE ⇒ no-existe", async () => {
    expect((await getAvionHistorico("x")).estado).toBe("no-existe");
    expect(apiServer).not.toHaveBeenCalled();
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "AERONAVE_NO_EXISTE", message: "x" }));
    expect((await getAvionHistorico(N621TX)).estado).toBe("no-existe");
  });
});
