/**
 * PAGOS A SOCIOS (1-oct-2026, API 0.0.49): server actions y la lectura del
 * server. Se custodia el CONTRATO con el API:
 *
 *  1. alta = `POST /v1/profit-sharing/pagos` con el cuerpo TAL CUAL (el
 *     `client_request_id` y `aceptar_exceso` viajan), revalida la página y
 *     normaliza `{ pago, fila }` (+ `idempotente`);
 *  2. edición = `PATCH /pagos/:id` solo con lo que cambió; sin cambios no
 *     llama; baja = `DELETE /pagos/:id { motivo }` con motivo 5–300;
 *  3. un id inválido no llega al API; el 409 PAGO_EXCEDE_UTILIDAD conserva
 *     `code`/`details` (el diálogo lo vuelve «¿Registrar de todas formas?»);
 *  4. `getRepartoPagos` nunca lanza y distingue API previo / sin permiso /
 *     fallo — un 503 de un deploy NO es «falta la migración».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { crearPagoSocioAction, editarPagoSocioAction, eliminarPagoSocioAction } = await import(
  "../actions"
);
const { getRepartoPagos } = await import("@/lib/api/profit-sharing-server");

const AVION = "a1a1a1a1-0000-4000-8000-000000000001";
const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const PAGO = "9a9a0000-0000-4000-8000-000000000001";
const CRID = "c0c0c0c0-0000-4000-8000-000000000001";

const PAGO_API = {
  id: PAGO,
  aeronave_id: AVION,
  socio_id: MAURICIO,
  periodo: "2026-09-01",
  monto: "1395.94",
  moneda: "USD",
  tc_usd_mxn: null,
  monto_usd: "1395.94",
  utilidad_snapshot_usd: "1395.94",
  fecha_pago: "2026-10-01",
  metodo: "TRANSFERENCIA",
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
const FILA_API = {
  aeronave: { id: AVION, matricula: "N4142R", modelo: "Piper Seneca V" },
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  porcentaje: 69,
  utilidad_usd: 1395.94,
  pagado_usd: 1395.94,
  pendiente_usd: 0,
  exceso_usd: 0,
  estado: "PAGADO",
  utilidad_al_pagar_usd: 1395.94,
  utilidad_difiere: false,
  pagos: [PAGO_API],
};

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("crearPagoSocioAction", () => {
  const cuerpo = {
    aeronave_id: AVION,
    socio_id: MAURICIO,
    mes: "2026-09",
    monto: 1395.94,
    moneda: "USD" as const,
    fecha_pago: "2026-10-01",
    metodo: "TRANSFERENCIA" as const,
    client_request_id: CRID,
  };

  it("POST con el cuerpo tal cual, revalida y normaliza la respuesta", async () => {
    apiServer.mockResolvedValue({ pago: PAGO_API, fila: FILA_API });
    const r = await crearPagoSocioAction(cuerpo);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe("/v1/profit-sharing/pagos");
    expect(init).toEqual({ method: "POST", body: cuerpo });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/profit-sharing");
    expect(r.ok).toBe(true);
    expect(r.data?.pago.monto).toBe(1395.94);
    expect(r.data?.fila?.estado).toBe("PAGADO");
    expect(r.data?.idempotente).toBeUndefined();
  });

  it("`fila: null` del API (socio fuera del reparto sin pagos vivos) llega null, sin inventarla", async () => {
    apiServer.mockResolvedValue({ pago: PAGO_API, fila: null });
    const r = await crearPagoSocioAction(cuerpo);
    expect(r.ok).toBe(true);
    expect(r.data?.pago.id).toBe(PAGO);
    expect(r.data?.fila).toBeNull();
  });

  it("el reintento idempotente (200 con `idempotente`) se reporta", async () => {
    apiServer.mockResolvedValue({ pago: PAGO_API, fila: FILA_API, idempotente: true });
    const r = await crearPagoSocioAction({ ...cuerpo, aceptar_exceso: true });
    expect(apiServer.mock.calls[0][1].body).toMatchObject({ aceptar_exceso: true, client_request_id: CRID });
    expect(r.data?.idempotente).toBe(true);
  });

  it("ids o mes inválidos: no llama al API", async () => {
    expect((await crearPagoSocioAction({ ...cuerpo, socio_id: "nada" })).ok).toBe(false);
    expect((await crearPagoSocioAction({ ...cuerpo, mes: "2026-9" })).ok).toBe(false);
    expect((await crearPagoSocioAction({ ...cuerpo, client_request_id: "x" })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("409 PAGO_EXCEDE_UTILIDAD conserva code y details (para confirmar)", async () => {
    const details = { utilidad_usd: 40.46, pagado_usd: 0, monto_usd: 100, exceso_usd: 59.54 };
    apiServer.mockRejectedValue(
      new ApiError({ statusCode: 409, code: "PAGO_EXCEDE_UTILIDAD", message: "x", details }),
    );
    const r = await crearPagoSocioAction(cuerpo);
    expect(r).toMatchObject({ ok: false, code: "PAGO_EXCEDE_UTILIDAD", details, status: 409 });
    expect(r.error).toBe("El pago supera la utilidad del socio en el mes.");
  });

  it("sin `pago` en la respuesta no se celebra", async () => {
    apiServer.mockResolvedValue({});
    const r = await crearPagoSocioAction(cuerpo);
    expect(r).toMatchObject({ ok: false, code: "SIN_CONFIRMACION" });
  });
});

describe("editarPagoSocioAction", () => {
  it("PATCH solo con lo que cambió y revalida", async () => {
    apiServer.mockResolvedValue({ pago: PAGO_API, fila: FILA_API });
    const r = await editarPagoSocioAction(PAGO, { monto: 1300, tc_usd_mxn: null });
    expect(apiServer.mock.calls[0]).toEqual([
      `/v1/profit-sharing/pagos/${PAGO}`,
      { method: "PATCH", body: { monto: 1300, tc_usd_mxn: null } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/profit-sharing");
    expect(r.ok).toBe(true);
  });

  it("sin cambios o id inválido: no llama", async () => {
    expect((await editarPagoSocioAction(PAGO, {})).ok).toBe(false);
    expect((await editarPagoSocioAction("nada", { monto: 1 })).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("eliminarPagoSocioAction", () => {
  it("DELETE con el motivo recortado y revalida", async () => {
    apiServer.mockResolvedValue({ deleted: true, fila: FILA_API });
    const r = await eliminarPagoSocioAction(PAGO, "  Se capturó dos veces  ");
    expect(apiServer.mock.calls[0]).toEqual([
      `/v1/profit-sharing/pagos/${PAGO}`,
      { method: "DELETE", body: { motivo: "Se capturó dos veces" } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/profit-sharing");
    expect(r.ok).toBe(true);
    expect(r.data?.fila?.socio.nombre).toBe("Mauricio Roque");
    expect(r.data?.fila?.pagado_usd).toBe(1395.94);
  });

  it("baja del único pago de un socio que ya no está en el reparto: `fila: null`", async () => {
    apiServer.mockResolvedValue({ deleted: true, fila: null });
    const r = await eliminarPagoSocioAction(PAGO, "Se capturó dos veces");
    expect(r).toEqual({ ok: true, data: { deleted: true, fila: null } });
  });

  it("motivo corto: no llama; PAGO_NO_EXISTE refresca la lista", async () => {
    expect((await eliminarPagoSocioAction(PAGO, "dup")).ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
    apiServer.mockRejectedValue(new ApiError({ statusCode: 404, code: "PAGO_NO_EXISTE", message: "x" }));
    const r = await eliminarPagoSocioAction(PAGO, "Se capturó dos veces");
    expect(r).toMatchObject({ ok: false, code: "PAGO_NO_EXISTE" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/profit-sharing");
  });
});

describe("getRepartoPagos (lectura del server, nunca lanza)", () => {
  it("GET con mes y sin caché; normaliza", async () => {
    apiServer.mockResolvedValue({
      disponible: true,
      mes: "2026-09",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      filas: [FILA_API],
      por_socio: [],
      totales: { utilidad_usd: "2023.10", pagado_usd: 1395.94, pendiente_usd: 627.16, socios_pendientes: 2 },
    });
    const r = await getRepartoPagos("2026-09");
    expect(apiServer.mock.calls[0]).toEqual([
      "/v1/profit-sharing/pagos",
      { searchParams: { mes: "2026-09", aeronave_id: undefined }, cache: "no-store" },
    ]);
    expect(r.estado).toBe("ok");
    if (r.estado === "ok") {
      expect(r.datos.filas[0].pagos[0].monto).toBe(1395.94);
      expect(r.datos.totales.utilidad_usd).toBe(2023.1);
    }
  });

  it("API previo (404) y la migración pendiente ⇒ no-disponible; 403 ⇒ sin-permiso", async () => {
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Cannot GET /v1/profit-sharing/pagos" }),
    );
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "no-disponible" });
    apiServer.mockRejectedValueOnce(
      new ApiError({ statusCode: 503, code: "PAGOS_SOCIOS_NO_DISPONIBLE", message: "x" }),
    );
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "no-disponible" });
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "x" }));
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "sin-permiso" });
  });

  it("el 503 de un deploy, un 500, la red o una respuesta rara ⇒ error (jamás «sin pagos»)", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 503, code: "PARSE_ERROR", message: "x" }));
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "error" });
    apiServer.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "error" });
    apiServer.mockResolvedValueOnce("<html>");
    expect(await getRepartoPagos("2026-09")).toEqual({ estado: "error" });
    expect(await getRepartoPagos("2026-9")).toEqual({ estado: "error" });
    consola.mockRestore();
  });
});
