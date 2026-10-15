/**
 * `guardarGastoConRepartoAction` (14-oct-2026): «Verificar / editar» guarda el
 * gasto Y su reparto en UN clic. Se prueba con `apiServer` simulado (patrón
 * de comision-vendedor-actions.test.ts): las llamadas en su ORDEN exacto
 * (ruta y método), las fallas a medias con su relectura, el refuerzo del
 * avión individual, que nunca lanza y las revalidaciones. Datos reales de
 * prod: STARLINK e23b5587 (3 × $1,577.92) y Cramex 37471011 (8,120/8,120).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MSG_REPARTO_CONCILIADO, MSG_REPARTO_INVALIDO } from "@/lib/admin/reparto-gasto";
import type { RepartoResponse } from "@/types/expenses";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { guardarGastoConRepartoAction, verifyGastoAction } = await import("../actions");

const STARLINK = "e23b5587-9b16-496f-bc36-bf158eae4ad9";
const CRAMEX = "37471011-d654-41eb-a608-53a17311161c";
const N4142R = "5a82eb4a-086c-4058-97bd-b2aacdc2e942";
const N621TX = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";
const N990GG = "8f37ec37-965a-42a8-bac4-9991d282f0a3";
const XA_VGV = "3d0546c3-941f-45cc-b8a9-e3ee77545e68";
const XB_PEV = "a0114a3e-9919-41e8-b8e4-fa433d3f3737";

const BASE_STARLINK = [
  { aeronave_id: N4142R, monto: 1577.92 },
  { aeronave_id: N621TX, monto: 1577.92 },
  { aeronave_id: N990GG, monto: 1577.92 },
];
const NUEVO_STARLINK = [
  { aeronave_id: N621TX, monto: 2366.88 },
  { aeronave_id: N990GG, monto: 2366.88 },
];
const MAT: Record<string, string> = {
  [N4142R]: "N4142R",
  [N621TX]: "N621TX",
  [N990GG]: "N990GG",
  [XA_VGV]: "XA-VGV",
  [XB_PEV]: "XB-PEV",
};

function reparto(
  items: Array<{ aeronave_id: string; monto: number }>,
  monto: number,
  categoria = "INDIRECTO",
): RepartoResponse {
  const suma = items.reduce((a, i) => a + Math.round(i.monto * 100), 0) / 100;
  return {
    gasto: { id: "g", categoria, monto, moneda: "MXN", fecha_gasto: "2026-09-01", notas: null },
    // El API ordena por monto descendente.
    items: [...items]
      .sort((a, b) => b.monto - a.monto)
      .map((i) => ({ aeronave_id: i.aeronave_id, monto: i.monto, matricula: MAT[i.aeronave_id] ?? null })),
    suma,
    remanente_empresa: Math.round((monto - suma) * 100) / 100,
  };
}

/** Lo que manda «Verificar / editar» en modo reparto (sin avión; vuelo/escala null). */
const payloadReparto = (o: Record<string, unknown> = {}) => ({
  categoria: "INDIRECTO",
  monto: 4733.76,
  propina: 0,
  moneda: "MXN",
  medio_pago: "TARJETA_CORP",
  tarjeta_terminacion: "4321",
  fecha_gasto: "",
  vuelo_id: null,
  escala_id: null,
  verificado: true,
  ...o,
});

const api500 = (message = "Internal server error") =>
  new ApiError({ statusCode: 500, code: "INTERNAL", message });
const api400 = (message: string) => new ApiError({ statusCode: 400, code: "BAD_REQUEST", message });

/** Cada llamada consume la siguiente respuesta (función: lanza o devuelve). */
function secuencia(...respuestas: Array<() => unknown>) {
  for (const r of respuestas) {
    apiServer.mockImplementationOnce(async () => r());
  }
}
const devuelve = (v: unknown) => () => v;
const lanza = (e: unknown) => () => {
  throw e;
};

/** Método y ruta de cada llamada, en orden. */
const llamadas = () =>
  apiServer.mock.calls.map(([ruta, init]) => `${(init as { method?: string } | undefined)?.method ?? "GET"} ${ruta}`);
const cuerpo = (i: number) => (apiServer.mock.calls[i][1] as { body?: unknown }).body;

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("sin red: lo inválido se frena antes de llamar al API", () => {
  it("uuid inválido, avión repetido, monto 0, 3 decimales o 21 items ⇒ BLOQUEO MSG_REPARTO_INVALIDO", async () => {
    const casos: Array<[string, { base: unknown; nuevo: unknown }]> = [
      ["no-es-uuid", { base: [], nuevo: NUEVO_STARLINK }],
      [STARLINK, { base: [], nuevo: [{ aeronave_id: N621TX, monto: 1 }, { aeronave_id: N621TX, monto: 2 }] }],
      [STARLINK, { base: [], nuevo: [{ aeronave_id: N621TX, monto: 0 }] }],
      [STARLINK, { base: [], nuevo: [{ aeronave_id: N621TX, monto: 1577.925 }] }],
      [STARLINK, { base: [], nuevo: Array.from({ length: 21 }, () => ({ aeronave_id: N621TX, monto: 1 })) }],
      [STARLINK, { base: [{ aeronave_id: "N4142R", monto: 1 }], nuevo: [] }],
    ];
    for (const [id, rep] of casos) {
      const r = await guardarGastoConRepartoAction(
        id,
        payloadReparto(),
        rep as { base: Array<{ aeronave_id: string; monto: number }>; nuevo: Array<{ aeronave_id: string; monto: number }> },
        { riesgoConciliado: false },
      );
      expect(r.ok).toBe(false);
      expect(r.codigo).toBe("BLOQUEO");
      expect(r.error).toBe(MSG_REPARTO_INVALIDO);
    }
    expect(apiServer).not.toHaveBeenCalled();
  });

  it("un formulario que zod rechaza ⇒ fieldErrors, sin red", async () => {
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ tarjeta_terminacion: "12" }),
      { base: BASE_STARLINK, nuevo: NUEVO_STARLINK },
      { riesgoConciliado: false },
    );
    expect(r.codigo).toBe("GASTO");
    expect(r.fieldErrors?.tarjeta_terminacion?.[0]).toBe("La tarjeta son 4 dígitos");
    expect(apiServer).not.toHaveBeenCalled();
  });
});

describe("la relectura ANTES de escribir", () => {
  it("el GET falla ⇒ LECTURA con una sola llamada", async () => {
    secuencia(lanza(api500("Bad Gateway")));
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({ ok: false, codigo: "LECTURA", gastoGuardado: false, repartoGuardado: false, pasos: [] });
    expect(llamadas()).toEqual([`GET /v1/expenses/${STARLINK}/reparto`]);
    expect((apiServer.mock.calls[0][1] as { cache?: string }).cache).toBe("no-store");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("otra persona cambió el reparto (GET ≠ base) ⇒ REPARTO_CAMBIO con lo leído, sin escribir", async () => {
    const otro = reparto([{ aeronave_id: N4142R, monto: 4733.76 }], 4733.76);
    secuencia(devuelve(otro));
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({ ok: false, codigo: "REPARTO_CAMBIO", reparto: otro });
    expect(llamadas()).toEqual([`GET /v1/expenses/${STARLINK}/reparto`]);
  });
});

describe("las escrituras en su orden exacto", () => {
  it("STARLINK a 2 × $2,366.88 ⇒ GET, PATCH (sin aeronave_id) y PUT", async () => {
    const nuevo = reparto(NUEVO_STARLINK, 4733.76);
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      devuelve(nuevo),
    );
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: true });
    expect(llamadas()).toEqual([
      `GET /v1/expenses/${STARLINK}/reparto`,
      `PATCH /v1/expenses/${STARLINK}`,
      `PUT /v1/expenses/${STARLINK}/reparto`,
    ]);
    expect(cuerpo(1)).not.toHaveProperty("aeronave_id");
    expect(cuerpo(1)).toMatchObject({ vuelo_id: null, escala_id: null, categoria: "INDIRECTO", verificado: true });
    expect(cuerpo(2)).toEqual({ items: NUEVO_STARLINK });
    expect(r).toMatchObject({
      ok: true,
      codigo: "OK",
      gastoGuardado: true,
      repartoGuardado: true,
      repartoEstado: "IGUAL_AL_NUEVO",
      pasos: ["GASTO", "REPARTO"],
      reparto: nuevo,
      avisos: [],
    });
  });

  it("Cramex bajando a $14,000 con 7,000/7,000 ⇒ GET, PUT y PATCH", async () => {
    const base = [{ aeronave_id: XA_VGV, monto: 8120 }, { aeronave_id: XB_PEV, monto: 8120 }];
    const nuevo = [{ aeronave_id: XA_VGV, monto: 7000 }, { aeronave_id: XB_PEV, monto: 7000 }];
    secuencia(
      devuelve(reparto(base, 16240)),
      devuelve(reparto(nuevo, 16240)),
      devuelve({ id: CRAMEX, aeronave_id: null }),
    );
    const r = await guardarGastoConRepartoAction(
      CRAMEX,
      payloadReparto({ monto: 14000, medio_pago: "TRANSFERENCIA", tarjeta_terminacion: null }),
      { base, nuevo },
      { riesgoConciliado: false },
    );
    expect(llamadas()).toEqual([
      `GET /v1/expenses/${CRAMEX}/reparto`,
      `PUT /v1/expenses/${CRAMEX}/reparto`,
      `PATCH /v1/expenses/${CRAMEX}`,
    ]);
    expect(r).toMatchObject({ ok: true, pasos: ["REPARTO", "GASTO"] });
  });

  it("quitar con avión ⇒ GET, PUT {items: []} y PATCH", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve(reparto([], 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: N990GG }),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ aeronave_id: N990GG, vuelo_id: undefined, escala_id: undefined }),
      { base: BASE_STARLINK, nuevo: [] },
      { riesgoConciliado: false },
    );
    expect(llamadas()).toEqual([
      `GET /v1/expenses/${STARLINK}/reparto`,
      `PUT /v1/expenses/${STARLINK}/reparto`,
      `PATCH /v1/expenses/${STARLINK}`,
    ]);
    expect(cuerpo(1)).toEqual({ items: [] });
    expect(cuerpo(2)).toMatchObject({ aeronave_id: N990GG });
    expect(r).toMatchObject({ ok: true, pasos: ["REPARTO", "GASTO"] });
  });

  it("quitar sin choque ⇒ GET, PATCH y PUT {items: []}", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      devuelve(reparto([], 4733.76)),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ vuelo_id: undefined, escala_id: undefined }),
      { base: BASE_STARLINK, nuevo: [] },
      { riesgoConciliado: false },
    );
    expect(llamadas()).toEqual([
      `GET /v1/expenses/${STARLINK}/reparto`,
      `PATCH /v1/expenses/${STARLINK}`,
      `PUT /v1/expenses/${STARLINK}/reparto`,
    ]);
    expect(cuerpo(2)).toEqual({ items: [] });
    expect(r.ok).toBe(true);
  });

  it("conciliado con un plan que empieza por el PUT ⇒ BLOQUEO y solo el GET", async () => {
    secuencia(devuelve(reparto(BASE_STARLINK, 4733.76)));
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ monto: 4000 }),
      { base: BASE_STARLINK, nuevo: [] },
      { riesgoConciliado: true },
    );
    expect(r).toMatchObject({ ok: false, codigo: "BLOQUEO", error: MSG_REPARTO_CONCILIADO, pasos: [] });
    expect(llamadas()).toEqual([`GET /v1/expenses/${STARLINK}/reparto`]);
  });
});

describe("fallas a medias: se relee y se dice cómo quedó", () => {
  it("PATCH ok + PUT 500 + relectura igual a la base ⇒ PARCIAL_SIN_REPARTO / IGUAL_AL_ANTERIOR", async () => {
    const gasto = { id: STARLINK, aeronave_id: null, foto_url: null };
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve(gasto),
      lanza(api500()),
      devuelve(reparto(BASE_STARLINK, 4733.76)),
    );
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({
      ok: false,
      codigo: "PARCIAL_SIN_REPARTO",
      gastoGuardado: true,
      repartoGuardado: false,
      repartoEstado: "IGUAL_AL_ANTERIOR",
      pasos: ["GASTO"],
      data: gasto,
      error: "Internal server error",
    });
    expect(llamadas().at(-1)).toBe(`GET /v1/expenses/${STARLINK}/reparto`);
  });

  it("PATCH ok + PUT 500 + relectura igual a lo pedido ⇒ se da por guardado (ok)", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      lanza(api500()),
      devuelve(reparto(NUEVO_STARLINK, 4733.76)),
    );
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({ ok: true, codigo: "OK", repartoGuardado: true, pasos: ["GASTO", "REPARTO"] });
  });

  it("PATCH ok + PUT 400 a medias + relectura distinta ⇒ DISTINTO", async () => {
    const aMedias = reparto([{ aeronave_id: N621TX, monto: 2366.88 }], 4733.76);
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      lanza(api400("Alguna aeronave del reparto no existe o está inactiva: solo se reparte entre aviones activos.")),
      devuelve(aMedias),
    );
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({ codigo: "PARCIAL_SIN_REPARTO", repartoEstado: "DISTINTO", reparto: aMedias });
  });

  it("PUT ok + PATCH 400 ⇒ PARCIAL_SOLO_REPARTO; con PATCH 502 ⇒ incierto", async () => {
    const base = [{ aeronave_id: XA_VGV, monto: 8120 }, { aeronave_id: XB_PEV, monto: 8120 }];
    const nuevo = [{ aeronave_id: XA_VGV, monto: 7000 }, { aeronave_id: XB_PEV, monto: 7000 }];
    const folio = 'Ya existe un gasto con el folio/remisión "A-1": es el mismo pago capturado dos veces.';
    secuencia(
      devuelve(reparto(base, 16240)),
      devuelve(reparto(nuevo, 16240)),
      lanza(new ApiError({ statusCode: 409, code: "CONFLICT", message: folio })),
    );
    const r = await guardarGastoConRepartoAction(CRAMEX, payloadReparto({ monto: 14000 }), { base, nuevo }, { riesgoConciliado: false });
    expect(r).toMatchObject({
      ok: false,
      codigo: "PARCIAL_SOLO_REPARTO",
      gastoGuardado: false,
      gastoIncierto: false,
      repartoGuardado: true,
      pasos: ["REPARTO"],
      error: folio,
    });
    apiServer.mockReset();
    secuencia(
      devuelve(reparto(base, 16240)),
      devuelve(reparto(nuevo, 16240)),
      lanza(new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Bad Gateway" })),
    );
    const incierto = await guardarGastoConRepartoAction(CRAMEX, payloadReparto({ monto: 14000 }), { base, nuevo }, { riesgoConciliado: false });
    expect(incierto).toMatchObject({ codigo: "PARCIAL_SOLO_REPARTO", gastoIncierto: true });
  });

  it("el PUT primero falla y la relectura dice que no cambió ⇒ SIN_NADA_REPARTO", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      lanza(api500()),
      devuelve(reparto(BASE_STARLINK, 4733.76)),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ aeronave_id: N990GG, vuelo_id: undefined, escala_id: undefined }),
      { base: BASE_STARLINK, nuevo: [] },
      { riesgoConciliado: false },
    );
    expect(r).toMatchObject({ ok: false, codigo: "SIN_NADA_REPARTO", repartoEstado: "IGUAL_AL_ANTERIOR", gastoGuardado: false, pasos: [] });
    // El PATCH jamás salió.
    expect(llamadas().filter((l) => l.startsWith("PATCH"))).toEqual([]);
  });

  it("el primer paso (PATCH) con 4xx ⇒ GASTO; con red ⇒ GASTO_INCIERTO", async () => {
    secuencia(devuelve(reparto(BASE_STARLINK, 4733.76)), lanza(api400("La categoría no es válida.")));
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r).toMatchObject({ codigo: "GASTO", error: "La categoría no es válida.", gastoIncierto: false });
    apiServer.mockReset();
    secuencia(devuelve(reparto(BASE_STARLINK, 4733.76)), lanza(new TypeError("fetch failed")));
    const red = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(red).toMatchObject({ codigo: "GASTO_INCIERTO", gastoIncierto: true, error: "fetch failed" });
  });

  it("GASTO_INCIERTO revalida (el PATCH pudo escribir); un 4xx no (revisión del 14-oct-2026)", async () => {
    secuencia(devuelve(reparto(BASE_STARLINK, 4733.76)), lanza(api400("La categoría no es válida.")));
    await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(revalidatePath).not.toHaveBeenCalled();
    for (const falla of [new TypeError("fetch failed"), api500()]) {
      apiServer.mockReset();
      revalidatePath.mockReset();
      secuencia(devuelve(reparto(BASE_STARLINK, 4733.76)), lanza(falla));
      const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
      expect(r.codigo).toBe("GASTO_INCIERTO");
      const rutas = revalidatePath.mock.calls.map((c) => c.join(" "));
      for (const ruta of ["/admin/expenses", "/admin/otros-gastos", "/admin/nomina", "/admin/combustibles", "/admin/caja-chica layout", "/admin/flights layout"]) {
        expect(rutas, ruta).toContain(ruta);
      }
    }
  });
});

describe("refuerzo del avión individual (el PATCH lo traía)", () => {
  const conAvion = { id: STARLINK, aeronave_id: N4142R };

  it("PUT ok y el gasto AÚN trae avión ⇒ PATCH {aeronave_id: null}", async () => {
    secuencia(
      devuelve(reparto([], 6434200 / 100)),
      devuelve(conAvion),
      devuelve(reparto([{ aeronave_id: N4142R, monto: 64342 }], 64342)),
      devuelve({ id: STARLINK, aeronave_id: N4142R }),
      devuelve({ id: STARLINK, aeronave_id: null }),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ monto: 64342 }),
      { base: [], nuevo: [{ aeronave_id: N4142R, monto: 64342 }] },
      { riesgoConciliado: false },
    );
    expect(llamadas()).toEqual([
      `GET /v1/expenses/${STARLINK}/reparto`,
      `PATCH /v1/expenses/${STARLINK}`,
      `PUT /v1/expenses/${STARLINK}/reparto`,
      `GET /v1/expenses/${STARLINK}`,
      `PATCH /v1/expenses/${STARLINK}`,
    ]);
    expect(cuerpo(4)).toEqual({ aeronave_id: null });
    expect(r).toMatchObject({ ok: true, avisos: [] });
  });

  it("el GET ya dice null ⇒ sin PATCH extra", async () => {
    secuencia(
      devuelve(reparto([], 64342)),
      devuelve(conAvion),
      devuelve(reparto([{ aeronave_id: N4142R, monto: 64342 }], 64342)),
      devuelve({ id: STARLINK, aeronave_id: null }),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ monto: 64342 }),
      { base: [], nuevo: [{ aeronave_id: N4142R, monto: 64342 }] },
      { riesgoConciliado: false },
    );
    expect(llamadas()).toHaveLength(4);
    expect(r.ok).toBe(true);
  });

  it("el refuerzo falla ⇒ ok con aviso (no es un error)", async () => {
    secuencia(
      devuelve(reparto([], 64342)),
      devuelve(conAvion),
      devuelve(reparto([{ aeronave_id: N4142R, monto: 64342 }], 64342)),
      lanza(new TypeError("fetch failed")),
    );
    const r = await guardarGastoConRepartoAction(
      STARLINK,
      payloadReparto({ monto: 64342 }),
      { base: [], nuevo: [{ aeronave_id: N4142R, monto: 64342 }] },
      { riesgoConciliado: false },
    );
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([
      "El reparto quedó guardado, pero el gasto todavía tiene el avión individual: vuelve a abrirlo y pulsa «Guardar» para quitarlo (el servidor no respondió).",
    ]);
  });
});

describe("nunca lanza y dice el error en español", () => {
  it("un Error que no es ApiError en cualquier paso ⇒ resultado estructurado", async () => {
    for (let paso = 0; paso < 4; paso++) {
      apiServer.mockReset();
      const pasos = [
        devuelve(reparto(BASE_STARLINK, 4733.76)),
        devuelve({ id: STARLINK, aeronave_id: null }),
        devuelve(reparto(NUEVO_STARLINK, 4733.76)),
        devuelve(reparto(NUEVO_STARLINK, 4733.76)),
      ];
      pasos[paso] = lanza(new Error("algo raro"));
      secuencia(...pasos);
      const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
      expect(typeof r.codigo).toBe("string");
      expect(Array.isArray(r.avisos)).toBe(true);
    }
  });

  it("403 del PUT por rol ⇒ «Tu rol no tiene permiso para esta acción…»", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      lanza(new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Required role: ADMIN | COORDINADOR | FACTURACION. Current: ANALISTA" })),
      devuelve(reparto(BASE_STARLINK, 4733.76)),
    );
    const r = await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    expect(r.error).toBe("Tu rol no tiene permiso para esta acción. Pide a un administrador que la haga.");
  });
});

describe("revalidaciones", () => {
  it("con el reparto escrito: Gastos, Otros gastos, Nómina y Caja chica (layout)", async () => {
    secuencia(
      devuelve(reparto(BASE_STARLINK, 4733.76)),
      devuelve({ id: STARLINK, aeronave_id: null }),
      devuelve(reparto(NUEVO_STARLINK, 4733.76)),
    );
    await guardarGastoConRepartoAction(STARLINK, payloadReparto(), { base: BASE_STARLINK, nuevo: NUEVO_STARLINK }, { riesgoConciliado: false });
    const rutas = revalidatePath.mock.calls.map((c) => c.join(" "));
    expect(rutas).toContain("/admin/expenses");
    expect(rutas).toContain("/admin/otros-gastos");
    // Nómina (15-oct-2026) monta la MISMA tabla: donde se revalida Otros
    // gastos, se revalida también Nómina.
    expect(rutas).toContain("/admin/nomina");
    expect(rutas).toContain("/admin/caja-chica layout");
  });

  it("verifyGastoAction: la forma de SIEMPRE ({ ok: false, error } sin status) y revalida Otros gastos y Nómina", async () => {
    const msg = "categoria must be one of the following values: GAS, ATERRIZAJE";
    apiServer.mockRejectedValueOnce(api400(msg));
    const r = await verifyGastoAction(STARLINK, { categoria: "INDIRECTO", verificado: true });
    expect(r).toStrictEqual({ ok: false, error: msg });
    apiServer.mockResolvedValueOnce({ id: STARLINK });
    const ok = await verifyGastoAction(STARLINK, { categoria: "INDIRECTO", verificado: true });
    expect(ok).toStrictEqual({ ok: true, data: { id: STARLINK } });
    // Comportamiento (no regex sobre el fuente): todas las pantallas del gasto.
    const rutas = revalidatePath.mock.calls.map((c) => c.join(" "));
    expect(rutas).toEqual([
      "/admin/expenses",
      "/admin/otros-gastos",
      "/admin/nomina",
      "/admin/combustibles",
      "/admin/caja-chica layout",
      "/admin/gastos-personales",
      "/admin/flights layout",
    ]);
  });
});
