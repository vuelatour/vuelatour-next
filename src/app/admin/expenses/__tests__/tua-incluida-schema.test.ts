/**
 * «TUA incluida en este gasto» (13-oct-2026, API 0.0.75 + migración
 * 20261013000008) en el schema de «Verificar / editar» y en la server action:
 *
 *  1. `GastoVerifySchema` DECLARA la llave (si no, el z.object la tira y el
 *     PATCH llegaba sin ella): vacío = no viaja; null = volver a la lectura de
 *     la IA; 0 = sin TUA; los textos de error son los del API.
 *  2. `verifyGastoAction` conserva el null («volver a la IA») a través de
 *     `stripEmpty` y nunca manda un vacío.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GastoVerifySchema } from "../schema";

const apiServer = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { verifyGastoAction } = await import("../actions");

const GASTO = "8c60e428-1111-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  apiServer.mockReset();
});

describe("GastoVerifySchema.tua_incluida", () => {
  const parse = (v: unknown) => GastoVerifySchema.safeParse(v === undefined ? {} : { tua_incluida: v });

  it("sin la llave ⇒ sin llave", () => {
    const r = parse(undefined);
    expect(r.success).toBe(true);
    expect(r.success && "tua_incluida" in r.data).toBe(false);
  });

  it("vacío (o solo espacios) ⇒ undefined (no viaja)", () => {
    for (const v of ["", "   "]) {
      const r = parse(v);
      expect(r.success, JSON.stringify(v)).toBe(true);
      expect(r.success && r.data.tua_incluida).toBeUndefined();
    }
  });

  it("null ⇒ null (volver a la lectura de la IA); jamás 0", () => {
    const r = parse(null);
    expect(r.success).toBe(true);
    expect(r.success && r.data.tua_incluida).toBeNull();
  });

  it("'0' ⇒ 0 y '559.63' ⇒ 559.63", () => {
    const cero = parse("0");
    expect(cero.success && cero.data.tua_incluida).toBe(0);
    const tua = parse("559.63");
    expect(tua.success && tua.data.tua_incluida).toBe(559.63);
    const num = parse(700);
    expect(num.success && num.data.tua_incluida).toBe(700);
  });

  it("negativa y no numérica ⇒ los textos del API", () => {
    const neg = parse("-1");
    expect(neg.success).toBe(false);
    expect(!neg.success && neg.error.flatten().fieldErrors.tua_incluida).toEqual([
      "La TUA incluida no puede ser negativa.",
    ]);
    const abc = parse("abc");
    expect(abc.success).toBe(false);
    expect(!abc.success && abc.error.flatten().fieldErrors.tua_incluida).toEqual([
      "La TUA incluida no es un número válido.",
    ]);
  });
});

describe("verifyGastoAction · tua_incluida en el PATCH", () => {
  it("null sobrevive a stripEmpty (volver a la IA)", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    const r = await verifyGastoAction(GASTO, { categoria: "OPERACIONES", tua_incluida: null });
    expect(r.ok).toBe(true);
    const [ruta, init] = apiServer.mock.calls[0];
    expect(ruta).toBe(`/v1/expenses/${GASTO}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toHaveProperty("tua_incluida", null);
  });

  it("0 y un número viajan tal cual; el vacío no viaja", async () => {
    apiServer.mockResolvedValue({ id: GASTO });
    await verifyGastoAction(GASTO, { categoria: "OPERACIONES", tua_incluida: 0 });
    expect(apiServer.mock.calls[0][1].body).toHaveProperty("tua_incluida", 0);
    await verifyGastoAction(GASTO, { categoria: "OPERACIONES", tua_incluida: 559.63 });
    expect(apiServer.mock.calls[1][1].body).toHaveProperty("tua_incluida", 559.63);
    await verifyGastoAction(GASTO, { categoria: "OPERACIONES", tua_incluida: "" });
    expect(apiServer.mock.calls[2][1].body).not.toHaveProperty("tua_incluida");
  });

  it("un valor inválido no llega al API (fieldErrors)", async () => {
    const r = await verifyGastoAction(GASTO, { categoria: "OPERACIONES", tua_incluida: -5 });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.tua_incluida).toEqual(["La TUA incluida no puede ser negativa."]);
    expect(apiServer).not.toHaveBeenCalled();
  });
});
