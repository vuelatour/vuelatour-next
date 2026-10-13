/**
 * Lista COMPLETA de movimientos de Conciliación (13-oct-2026). Pedido de la
 * oficina con la captura «Se muestran los 300 movimientos más recientes de
 * 782»: «¿tenemos una forma de no limitar a los 300?».
 *
 * El API ordena por `fecha desc, created_at desc` y una importación inserta
 * su estado de cuenta en UN lote (mismo `created_at`): hay empates por todos
 * lados. El API simulado de esta prueba DESORDENA los empates en cada
 * llamada (lo que Postgres puede hacer con otro LIMIT/OFFSET), y aun así la
 * carga por ventanas de fecha trae TODOS los movimientos, una sola vez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));

const { listMovimientosBancariosTodos } = await import("../conciliacion-server");

interface Fila {
  id: string;
  fecha: string;
  created_at: string;
  cuenta_bancaria_id: string;
  conciliado: boolean;
}

/** `n` movimientos repartidos en días hacia atrás desde el 13-oct, con
 *  `porDia` por día y TODOS los de un día con el MISMO created_at (un lote). */
function universo(n: number, porDia: number): Fila[] {
  const filas: Fila[] = [];
  const base = Date.UTC(2026, 9, 13);
  for (let i = 0; i < n; i++) {
    const dia = Math.floor(i / porDia);
    const fecha = new Date(base - dia * 86_400_000).toISOString().slice(0, 10);
    filas.push({
      id: `m-${String(i).padStart(5, "0")}`,
      fecha,
      created_at: `${fecha}T12:00:00Z`,
      cuenta_bancaria_id: "c-1",
      conciliado: i % 3 === 0,
    });
  }
  return filas;
}

/** API simulado: filtra como el real (`desde`/`hasta` inclusivos sobre
 *  `fecha`, `conciliado`), cuenta, ordena por fecha desc y created_at desc
 *  con los EMPATES BARAJADOS en cada llamada, y corta en `limit`/`offset`. */
function apiConEmpatesInestables(filas: Fila[]) {
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  return (ruta: string, init: { searchParams: Record<string, unknown> }) => {
    expect(ruta).toBe("/v1/conciliacion/movimientos");
    const sp = init.searchParams;
    let res = filas.filter(
      (f) =>
        (sp.desde === undefined || f.fecha >= String(sp.desde)) &&
        (sp.hasta === undefined || f.fecha <= String(sp.hasta)) &&
        (sp.conciliado === undefined || f.conciliado === sp.conciliado),
    );
    const count = res.length;
    res = res
      .map((f) => ({ f, r: azar() }))
      .sort(
        (a, b) =>
          b.f.fecha.localeCompare(a.f.fecha) ||
          b.f.created_at.localeCompare(a.f.created_at) ||
          a.r - b.r,
      )
      .map((x) => x.f);
    const limit = Number(sp.limit);
    const offset = Number(sp.offset ?? 0);
    return Promise.resolve({ data: res.slice(offset, offset + limit), count, limit, offset });
  };
}

beforeEach(() => {
  apiServer.mockReset();
});

describe("listMovimientosBancariosTodos · ventanas de fecha", () => {
  it("782 movimientos con empates barajados: llegan TODOS, una sola vez, sin offset", async () => {
    const todas = universo(782, 30);
    apiServer.mockImplementation(apiConEmpatesInestables(todas));
    const r = await listMovimientosBancariosTodos({ desde: "2026-08-01", hasta: "2026-10-13" });
    const ids = r.data.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const esperados = todas.filter((f) => f.fecha >= "2026-08-01" && f.fecha <= "2026-10-13");
    expect(new Set(ids)).toEqual(new Set(esperados.map((f) => f.id)));
    expect(r.count).toBe(esperados.length);
    expect(r.truncado).toBe(false);
    // Nunca pagina con offset; cada página pide 500 y conserva `desde`.
    for (const [, init] of apiServer.mock.calls) {
      expect(init.searchParams).toMatchObject({ limit: 500, offset: 0, desde: "2026-08-01" });
    }
    // La primera página usa el `hasta` de la vista; las demás, la fecha más vieja vista.
    expect(apiServer.mock.calls[0][1].searchParams.hasta).toBe("2026-10-13");
    expect(apiServer.mock.calls.length).toBeGreaterThan(1);
    expect(apiServer.mock.calls[1][1].searchParams.hasta < "2026-10-13").toBe(true);
  });

  it("CONTROL: con ESE mismo API, paginar con offset sí pierde movimientos (por eso no se usa)", async () => {
    const todas = universo(782, 30);
    const api = apiConEmpatesInestables(todas);
    const vistos = new Set<string>();
    for (let offset = 0; offset < 782; offset += 500) {
      const res = await api("/v1/conciliacion/movimientos", { searchParams: { limit: 500, offset } });
      for (const f of res.data) vistos.add(f.id);
    }
    expect(vistos.size).toBeLessThan(782);
  });

  it("sin rango en la vista: la primera página va SIN `hasta` y aun así trae todo", async () => {
    const todas = universo(1234, 45);
    apiServer.mockImplementation(apiConEmpatesInestables(todas));
    const r = await listMovimientosBancariosTodos({});
    expect(apiServer.mock.calls[0][1].searchParams).not.toHaveProperty("hasta");
    expect(new Set(r.data.map((m) => m.id))).toEqual(new Set(todas.map((f) => f.id)));
    expect(r.data).toHaveLength(1234);
    expect(r).toMatchObject({ count: 1234, truncado: false });
  });

  it("conserva el filtro de la pestaña (pendientes) en todas las páginas", async () => {
    const todas = universo(1500, 25);
    apiServer.mockImplementation(apiConEmpatesInestables(todas));
    const r = await listMovimientosBancariosTodos({ conciliado: false });
    for (const [, init] of apiServer.mock.calls) expect(init.searchParams.conciliado).toBe(false);
    const esperados = todas.filter((f) => !f.conciliado);
    expect(new Set(r.data.map((m) => m.id))).toEqual(new Set(esperados.map((f) => f.id)));
  });

  it("más movimientos que el tope de la vista ⇒ los más recientes y `truncado` con el total del API", async () => {
    const todas = universo(2600, 40);
    apiServer.mockImplementation(apiConEmpatesInestables(todas));
    const r = await listMovimientosBancariosTodos({});
    expect(r.data).toHaveLength(2000);
    expect(r).toMatchObject({ count: 2600, truncado: true });
    const masVieja = r.data.reduce((min, m) => (m.fecha < min ? m.fecha : min), "9999-12-31");
    // Ninguno de los que quedaron fuera es más reciente que el más viejo mostrado.
    const fuera = todas.filter((f) => !r.data.some((m) => m.id === f.id));
    expect(fuera.every((f) => f.fecha <= masVieja)).toBe(true);
  });

  it("un día con más de 500 movimientos ⇒ se corta y se dice (nunca un bucle)", async () => {
    const todas = universo(1200, 600);
    apiServer.mockImplementation(apiConEmpatesInestables(todas));
    const r = await listMovimientosBancariosTodos({});
    expect(r.truncado).toBe(true);
    expect(r.count).toBe(1200);
    expect(r.data.length).toBeLessThan(1200);
    expect(apiServer.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it("menos de una página: UNA llamada", async () => {
    apiServer.mockImplementation(apiConEmpatesInestables(universo(120, 10)));
    const r = await listMovimientosBancariosTodos({});
    expect(apiServer).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ count: 120, truncado: false });
    expect(r.data).toHaveLength(120);
  });

  it("una página que falla LANZA: jamás una lista a medias que parezca completa", async () => {
    const todas = universo(900, 30);
    const api = apiConEmpatesInestables(todas);
    apiServer
      .mockImplementationOnce(api)
      .mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "BAD_GATEWAY", message: "Bad Gateway" }));
    await expect(listMovimientosBancariosTodos({})).rejects.toBeInstanceOf(ApiError);
  });
});

describe("cableado de la página de Conciliación", () => {
  it("la bandeja usa la carga completa (ya no `limit: 300`)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../app/admin/conciliacion/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/listMovimientosBancariosTodos\(query\)/);
    expect(src).not.toMatch(/limit:\s*300/);
    expect(src).not.toMatch(/listMovimientosBancarios\(query\)/);
  });
});
