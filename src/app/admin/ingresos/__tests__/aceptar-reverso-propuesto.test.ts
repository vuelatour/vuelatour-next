/**
 * «Sugerir con IA» de Ingresos → propuesta «es la devolución de un cargo»
 * (revisión adversaria 30-sep-2026).
 *
 * Antes, aceptarla (también en el LOTE, donde las de REGLA van marcadas)
 * clasificaba SOLO el abono como «Reverso de un cargo»: el cargo se quedaba
 * pendiente para siempre —la pregunta del cliente: «¿Cómo puedo conciliar
 * los cargos reembolsados?»— y el abono, ya clasificado, salía del alcance de
 * «Emparejar devoluciones». Ahora se EMPAREJA con su cargo:
 *
 *  1. cargo = el `sugerido` del API o el ÚNICO candidato ⇒ `POST reverso`;
 *  2. varios sin sugerencia ⇒ error que manda a hacerlo a mano (no adivina);
 *  3. ningún cargo pendiente, API previo (404 «Cannot GET») o migración
 *     pendiente (503 REVERSOS_NO_DISPONIBLE) ⇒ el camino de antes;
 *  4. cualquier otro fallo de lectura ⇒ error y NADA escrito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { PropuestaAbono } from "@/types/ingresos";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { aceptarPropuestaAbonoAction } = await import("../actions");

const ABONO = "405466de-599b-4c0e-b2df-203133282530";
const CARGO_A = "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3";
const CARGO_B = "0b5d1c2e-1111-4a7b-8c9d-0e1f2a3b4c5d";

const propuesta = (movimiento_id = ABONO) =>
  ({ movimiento_id, accion: "CLASIFICAR_REVERSO", origen: "REGLA", candidato: null }) as unknown as PropuestaAbono;

const cargo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  fecha: "2026-09-21",
  descripcion: "ASUR CANCUN",
  referencia: null,
  monto: 825.13,
  ...extra,
});

const rutas = () => apiServer.mock.calls.map(([ruta, init]) => `${(init as { method?: string })?.method ?? "GET"} ${ruta}`);

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("aceptar «es la devolución de un cargo» = emparejar con su cargo", () => {
  it("con el `sugerido` del API: POST reverso con ese cargo y revalida Ingresos y Conciliación", async () => {
    apiServer
      .mockResolvedValueOnce([cargo(CARGO_A), cargo(CARGO_B, { sugerido: true })])
      .mockResolvedValueOnce({ abono: {}, cargo: {} });
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([
      `GET /v1/conciliacion/movimientos/${ABONO}/reverso-candidatos`,
      `POST /v1/conciliacion/movimientos/${ABONO}/reverso`,
    ]);
    expect(apiServer.mock.calls[1][1]).toEqual({ method: "POST", body: { cargo_id: CARGO_B } });
    const revalidadas = revalidatePath.mock.calls.map(([p]) => p);
    expect(revalidadas).toContain("/admin/ingresos");
    expect(revalidadas).toContain("/admin/conciliacion");
  });

  it("un solo candidato sin sugerencia: se empareja con él", async () => {
    apiServer.mockResolvedValueOnce([cargo(CARGO_A)]).mockResolvedValueOnce({ abono: {}, cargo: {} });
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(true);
    expect(apiServer.mock.calls[1][1]).toEqual({ method: "POST", body: { cargo_id: CARGO_A } });
  });

  it("varios sin sugerencia: NO adivina ni clasifica solo el abono", async () => {
    apiServer.mockResolvedValueOnce([cargo(CARGO_A), cargo(CARGO_B, { fecha: "2026-09-10" })]);
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Hay 2 cargos posibles");
    expect(r.error).toContain("«Es la devolución de un cargo»");
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sin cargo pendiente: el camino de antes (clasificar el abono)", async () => {
    apiServer.mockResolvedValueOnce([]).mockResolvedValueOnce({ id: "clasif-reverso" }).mockResolvedValueOnce({});
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([
      `GET /v1/conciliacion/movimientos/${ABONO}/reverso-candidatos`,
      "POST /v1/conciliacion/clasificaciones",
      `PATCH /v1/conciliacion/movimientos/${ABONO}/clasificar`,
    ]);
    expect(apiServer.mock.calls[1][1]).toEqual({ method: "POST", body: { nombre: "Reverso de un cargo" } });
  });

  it("API previo (404 «Cannot GET») o migración pendiente (503): el camino de antes", async () => {
    for (const err of [
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: `Cannot GET /v1/conciliacion/movimientos/${ABONO}/reverso-candidatos` }),
      new ApiError({ statusCode: 503, code: "REVERSOS_NO_DISPONIBLE", message: "El emparejado… no está habilitado" }),
    ]) {
      apiServer.mockReset();
      apiServer.mockRejectedValueOnce(err).mockResolvedValueOnce({ id: "clasif-reverso" }).mockResolvedValueOnce({});
      const r = await aceptarPropuestaAbonoAction(propuesta());
      expect(r.ok).toBe(true);
      expect(rutas().slice(1)).toEqual([
        "POST /v1/conciliacion/clasificaciones",
        `PATCH /v1/conciliacion/movimientos/${ABONO}/clasificar`,
      ]);
    }
  });

  it("otro fallo de lectura (Railway reiniciando): error y NADA escrito", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Bad Gateway" }));
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(false);
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("id inválido: no llama al API", async () => {
    const r = await aceptarPropuestaAbonoAction(propuesta("no-es-uuid"));
    expect(r.ok).toBe(false);
    expect(apiServer).not.toHaveBeenCalled();
  });
});
