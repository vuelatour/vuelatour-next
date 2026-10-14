import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_CONFIRMAR_BORRAR_TUA,
  BOTON_REVISAR_TUA,
  CATEGORIAS_TUA_INCLUIDA,
  COLA_CONFIRMAR_BORRAR_TUA,
  ETIQUETA_TUA_INCLUIDA,
  MSG_TUA_INCLUIDA_INVALIDA,
  MSG_TUA_INCLUIDA_NEGATIVA,
  apiConTuaIncluida,
  ayudaTuaIncluida,
  categoriaAdmiteTuaIncluida,
  errorTuaIncluida,
  mensajeTuaMayorQueTicket,
  notaTuaMonedaNueva,
  notaTuaVigente,
  placeholderTuaIncluida,
  TITULO_CONFIRMAR_BORRAR_TUA,
  tuaIncluidaParaPatch,
  tuaLeidaIa,
  tuaQueSeBorra,
  valorFormTuaIncluida,
} from "@/lib/admin/tua-incluida";

/**
 * «TUA incluida en este gasto» (13-oct-2026, API 0.0.75 + migración
 * 20261013000008). Caso real #383: la factura del aeropuerto traía la TUA
 * ($559.63 MXN con IVA) dentro del total de $1,925.27 y la IA la leyó como
 * «Autobuses»: el balance la cargó al avión como operación. La oficina fija
 * la cifra y esa MANDA; el panel no calcula ninguna TUA.
 */

const DETECTADA =
  "La IA detectó una TUA de $559.63 MXN (IVA incluido) y se separa sola del costo del avión. Escribe otro importe para corregirla, o 0 si esta factura no cobra TUA.";
const LEIDA =
  "La IA leyó una TUA de $559.63 MXN, pero no la pudo separar del desglose del comprobante. Si es correcta, escríbela aquí.";
const NADA =
  "La IA no separó ninguna TUA de este comprobante. Si la factura la cobra, escribe aquí el importe con IVA; vacío = sin TUA.";
const CERO = "Sin TUA: todo el ticket cuenta como costo del avión aunque la IA haya leído otra cosa.";
const FIJADA =
  "Esta TUA (IVA incluido) se separa del costo del avión y va a «Otros movimientos» del Balance general, junto a la TUA cobrada al cliente.";
const SIN_VUELO =
  " Este gasto no tiene vuelo: la TUA solo se separa cuando el gasto está ligado a un vuelo.";

describe("categorías y presencia de la columna", () => {
  it("solo las facturas de aeropuerto; la lista está congelada", () => {
    expect([...CATEGORIAS_TUA_INCLUIDA]).toEqual(["OPERACIONES", "ATERRIZAJE", "FBO"]);
    expect(Object.isFrozen(CATEGORIAS_TUA_INCLUIDA)).toBe(true);
    for (const c of ["OPERACIONES", "ATERRIZAJE", "FBO"]) expect(categoriaAdmiteTuaIncluida(c)).toBe(true);
    for (const c of ["COMIDA", "TUAS", "OTRO", "COMISARIATO", "GAS", "REFACCION", "", null, undefined]) {
      expect(categoriaAdmiteTuaIncluida(c), String(c)).toBe(false);
    }
    expect(ETIQUETA_TUA_INCLUIDA).toBe("TUA incluida en este gasto");
  });

  it("la llave decide si el API trae la columna (null también es «la trae»)", () => {
    expect(apiConTuaIncluida({ tua_incluida: null })).toBe(true);
    expect(apiConTuaIncluida({ tua_incluida: "559.63" })).toBe(true);
    expect(apiConTuaIncluida({ tua_incluida: 0 })).toBe(true);
    expect(apiConTuaIncluida({})).toBe(false);
  });
});

describe("valor del formulario, lectura y placeholder", () => {
  it("valorFormTuaIncluida: null ⇒ '', '700.00' ⇒ '700', 0 ⇒ '0'", () => {
    expect(valorFormTuaIncluida({ tua_incluida: null })).toBe("");
    expect(valorFormTuaIncluida({})).toBe("");
    expect(valorFormTuaIncluida({ tua_incluida: "700.00" })).toBe("700");
    expect(valorFormTuaIncluida({ tua_incluida: "559.63" })).toBe("559.63");
    expect(valorFormTuaIncluida({ tua_incluida: 0 })).toBe("0");
    expect(valorFormTuaIncluida({ tua_incluida: "0.00" })).toBe("0");
    expect(valorFormTuaIncluida({ tua_incluida: "" })).toBe("");
  });

  it("tuaLeidaIa: el tua_monto crudo a centavos, solo > 0", () => {
    expect(tuaLeidaIa({ tua_monto: 559.634 })).toBe(559.63);
    expect(tuaLeidaIa({ tua_monto: "559.63" })).toBe(559.63);
    expect(tuaLeidaIa({ tua_monto: 0 })).toBeNull();
    expect(tuaLeidaIa({ tua_monto: -1 })).toBeNull();
    expect(tuaLeidaIa({ tua_monto: "abc" })).toBeNull();
    expect(tuaLeidaIa({ tua_monto: null })).toBeNull();
    expect(tuaLeidaIa({ tua_monto: true })).toBeNull();
    expect(tuaLeidaIa({ conceptos: [] })).toBeNull();
    expect(tuaLeidaIa(null)).toBeNull();
    expect(tuaLeidaIa("x")).toBeNull();
  });

  it("placeholder: lo que separa la IA o 0.00", () => {
    expect(placeholderTuaIncluida(559.63)).toBe("IA: 559.63");
    expect(placeholderTuaIncluida(700)).toBe("IA: 700.00");
    expect(placeholderTuaIncluida(null)).toBe("0.00");
    expect(placeholderTuaIncluida(0)).toBe("0.00");
    expect(placeholderTuaIncluida(undefined)).toBe("0.00");
  });
});

describe("ayuda bajo el campo (textos exactos)", () => {
  const base = { detectada: null, leida: null, moneda: "MXN", conVuelo: true } as const;

  it("los cinco estados", () => {
    expect(ayudaTuaIncluida({ ...base, valor: "", detectada: 559.63 })).toBe(DETECTADA);
    expect(ayudaTuaIncluida({ ...base, valor: "", leida: 559.63 })).toBe(LEIDA);
    expect(ayudaTuaIncluida({ ...base, valor: "" })).toBe(NADA);
    expect(ayudaTuaIncluida({ ...base, valor: "0" })).toBe(CERO);
    expect(ayudaTuaIncluida({ ...base, valor: "0.00" })).toBe(CERO);
    expect(ayudaTuaIncluida({ ...base, valor: "700" })).toBe(FIJADA);
  });

  it("la detectada manda sobre la leída; espacios = vacío; moneda del formulario", () => {
    expect(ayudaTuaIncluida({ ...base, valor: "  ", detectada: 559.63, leida: 999 })).toBe(DETECTADA);
    expect(ayudaTuaIncluida({ ...base, valor: "", detectada: 10, moneda: "USD" })).toContain(
      "La IA detectó una TUA de $10 USD (IVA incluido)",
    );
    expect(ayudaTuaIncluida({ ...base, valor: null })).toBe(NADA);
  });

  it("sin vuelo se agrega el sufijo, salvo con 0 (sin TUA es verdad con o sin vuelo)", () => {
    const sinVuelo = { ...base, conVuelo: false };
    expect(ayudaTuaIncluida({ ...sinVuelo, valor: "", detectada: 559.63 })).toBe(`${DETECTADA}${SIN_VUELO}`);
    expect(ayudaTuaIncluida({ ...sinVuelo, valor: "" })).toBe(`${NADA}${SIN_VUELO}`);
    expect(ayudaTuaIncluida({ ...sinVuelo, valor: "700" })).toBe(`${FIJADA}${SIN_VUELO}`);
    expect(ayudaTuaIncluida({ ...sinVuelo, valor: "0" })).toBe(CERO);
  });
});

describe("nota de la cifra vigente", () => {
  it("con valor, con 0 y sin valor", () => {
    expect(notaTuaVigente({ tua_incluida: "559.63" }, "MXN")).toBe(
      "Vigente: fijada por oficina ($559.63 MXN). Borra el valor y guarda para volver a la lectura de la IA.",
    );
    expect(notaTuaVigente({ tua_incluida: "700.00" }, "MXN")).toBe(
      "Vigente: fijada por oficina ($700 MXN). Borra el valor y guarda para volver a la lectura de la IA.",
    );
    expect(notaTuaVigente({ tua_incluida: 0 }, "MXN")).toBe(
      "Vigente: fijada por oficina (sin TUA). Borra el valor y guarda para volver a la lectura de la IA.",
    );
    expect(notaTuaVigente({ tua_incluida: null }, "MXN")).toBeNull();
    expect(notaTuaVigente({}, "MXN")).toBeNull();
  });
});

describe("validación local (MISMOS textos que el 400 del API)", () => {
  it("mensaje del ticket", () => {
    expect(mensajeTuaMayorQueTicket(600, 559.63, "MXN")).toBe(
      "La TUA incluida ($600 MXN) no puede ser mayor que el monto del ticket ($559.63 MXN, sin propina).",
    );
    expect(mensajeTuaMayorQueTicket(2000, 1925.27, "MXN")).toBe(
      "La TUA incluida ($2,000 MXN) no puede ser mayor que el monto del ticket ($1,925.27 MXN, sin propina).",
    );
  });

  it("negativa, mayor que el ticket, igual y menor", () => {
    expect(errorTuaIncluida({ valor: -1, ticket: 559.63, moneda: "MXN" })).toBe(MSG_TUA_INCLUIDA_NEGATIVA);
    expect(MSG_TUA_INCLUIDA_NEGATIVA).toBe("La TUA incluida no puede ser negativa.");
    expect(errorTuaIncluida({ valor: 600, ticket: 559.63, moneda: "MXN" })).toBe(
      "La TUA incluida ($600 MXN) no puede ser mayor que el monto del ticket ($559.63 MXN, sin propina).",
    );
    expect(errorTuaIncluida({ valor: 559.63, ticket: 559.63, moneda: "MXN" })).toBeNull();
    expect(errorTuaIncluida({ valor: 0, ticket: 559.63, moneda: "MXN" })).toBeNull();
    expect(errorTuaIncluida({ valor: 100, ticket: 559.63, moneda: "MXN" })).toBeNull();
  });

  it("compara lo que de verdad viajaría (centavos) y un texto que no es número", () => {
    // 559.634 viaja como 559.63 (cabe); 559.636 viaja como 559.64 (no cabe).
    expect(errorTuaIncluida({ valor: 559.634, ticket: 559.63, moneda: "MXN" })).toBeNull();
    expect(errorTuaIncluida({ valor: 559.636, ticket: 559.63, moneda: "MXN" })).toContain("$559.64 MXN");
    expect(errorTuaIncluida({ valor: Number.NaN, ticket: 559.63, moneda: "MXN" })).toBe(MSG_TUA_INCLUIDA_INVALIDA);
    expect(MSG_TUA_INCLUIDA_INVALIDA).toBe("La TUA incluida no es un número válido.");
  });
});

describe("qué viaja en el PATCH", () => {
  const p = (o: Partial<Parameters<typeof tuaIncluidaParaPatch>[0]>) =>
    tuaIncluidaParaPatch({ visible: true, valorForm: "", actual: null, monedaCambio: false, ...o });

  it("campo oculto ⇒ no viaja", () => {
    expect(p({ visible: false, valorForm: "559.63" })).toBeUndefined();
    expect(p({ visible: false, valorForm: "", actual: "559.63" })).toBeUndefined();
  });

  it("vacío: sin vigente no viaja; con vigente viaja null (volver a la IA)", () => {
    expect(p({ valorForm: "", actual: null })).toBeUndefined();
    expect(p({ valorForm: "  ", actual: undefined })).toBeUndefined();
    expect(p({ valorForm: "", actual: "559.63" })).toBeNull();
    expect(p({ valorForm: "", actual: 0 })).toBeNull();
  });

  it("número: viaja si cambió a centavos; 0 = sin TUA", () => {
    expect(p({ valorForm: "0", actual: null })).toBe(0);
    expect(p({ valorForm: "559.63", actual: "559.63" })).toBeUndefined();
    expect(p({ valorForm: "559.630", actual: "559.63" })).toBeUndefined();
    expect(p({ valorForm: "700", actual: "559.63" })).toBe(700);
    expect(p({ valorForm: "559.635", actual: null })).toBe(559.64);
    expect(p({ valorForm: "0", actual: "559.63" })).toBe(0);
  });

  it("con cambio de moneda viaja SOLO si la oficina reescribió la cifra (revisión del lote 2)", () => {
    // Caso del hallazgo: USD 1,000 con TUA de oficina 300 → MXN 17,500 sin
    // tocar el campo. Antes viajaba 300 y el API la guardaba como 300 MXN en
    // silencio; hoy la llave NO viaja y el API la limpia (LIMPIAR MONEDA),
    // avisado y confirmado antes en el diálogo.
    expect(p({ valorForm: "300", actual: "300.00", monedaCambio: true })).toBeUndefined();
    expect(p({ valorForm: "300", actual: "300.00", monedaCambio: true, editada: false })).toBeUndefined();
    // Reescrita (aunque sea la MISMA cifra): la oficina la confirma en la moneda nueva.
    expect(p({ valorForm: "300", actual: "300.00", monedaCambio: true, editada: true })).toBe(300);
    expect(p({ valorForm: "5250", actual: "300.00", monedaCambio: true, editada: true })).toBe(5250);
    // Vaciarla sigue siendo «volver a la IA»; sin vigente ni valor, nada.
    expect(p({ valorForm: "", actual: "559.63", monedaCambio: true })).toBeNull();
    expect(p({ valorForm: "", actual: null, monedaCambio: true })).toBeUndefined();
  });

  it("un texto que no es número no viaja (el diálogo ya lo frenó)", () => {
    expect(p({ valorForm: "abc", actual: null })).toBeUndefined();
  });
});

describe("¿el guardado BORRA la TUA de oficina? (confirmación; revisión del lote 2)", () => {
  const base = {
    apiConCampo: true,
    actual: "559.63",
    categoria: "OPERACIONES",
    monedaVieja: "MXN",
    monedaNueva: "MXN",
    editada: false,
  };

  it("reclasificar fuera de Operaciones/Aterrizaje/FBO ⇒ CATEGORIA con la cifra y la etiqueta", () => {
    expect(tuaQueSeBorra({ ...base, categoria: "COMIDA" })).toEqual({
      motivo: "CATEGORIA",
      texto:
        "Al guardar se borrará la TUA incluida de $559.63 MXN que fijó la oficina: «Comida» no lleva TUA (solo Operaciones, Aterrizaje o FBO).",
    });
    // Aun reescrita, la categoría manda (el API la limpia igual).
    expect(tuaQueSeBorra({ ...base, categoria: "COMIDA", editada: true })?.motivo).toBe("CATEGORIA");
  });

  it("moneda nueva sin reescribir ⇒ MONEDA; reescrita ⇒ nada (y dice en qué moneda se guarda)", () => {
    const usd = { ...base, actual: "300.00", monedaVieja: "USD", monedaNueva: "MXN" };
    expect(tuaQueSeBorra(usd)).toEqual({
      motivo: "MONEDA",
      texto:
        "La TUA incluida ($300 USD) estaba en USD: al guardar con MXN se borrará (USD y MXN nunca se mezclan). Si este gasto lleva TUA, escríbela en MXN.",
    });
    expect(tuaQueSeBorra({ ...usd, editada: true })).toBeNull();
    expect(
      notaTuaMonedaNueva({ valorForm: "5250", monedaVieja: "USD", monedaNueva: "MXN", editada: true }),
    ).toBe("Se guardará en MXN: $5,250 MXN.");
    expect(notaTuaMonedaNueva({ valorForm: "5250", monedaVieja: "USD", monedaNueva: "MXN", editada: false })).toBeNull();
    expect(notaTuaMonedaNueva({ valorForm: "5250", monedaVieja: "MXN", monedaNueva: "MXN", editada: true })).toBeNull();
    expect(notaTuaMonedaNueva({ valorForm: "", monedaVieja: "USD", monedaNueva: "MXN", editada: true })).toBeNull();
  });

  it("nada que borrar: sin la llave del API, sin cifra, con 0 (sin TUA es de cualquier moneda) o sin cambios", () => {
    expect(tuaQueSeBorra({ ...base, apiConCampo: false, categoria: "COMIDA" })).toBeNull();
    expect(tuaQueSeBorra({ ...base, actual: null, categoria: "COMIDA" })).toBeNull();
    expect(tuaQueSeBorra({ ...base, actual: 0, categoria: "COMIDA" })).toBeNull();
    expect(tuaQueSeBorra({ ...base, actual: "0", monedaNueva: "USD" })).toBeNull();
    expect(tuaQueSeBorra(base)).toBeNull();
    expect(tuaQueSeBorra({ ...base, categoria: "FBO" })).toBeNull();
  });

  it("textos de la confirmación", () => {
    expect(TITULO_CONFIRMAR_BORRAR_TUA).toBe("¿Borrar la TUA incluida?");
    expect(BOTON_CONFIRMAR_BORRAR_TUA).toBe("Sí, guardar y borrar la TUA");
    expect(BOTON_REVISAR_TUA).toBe("Revisar");
    expect(COLA_CONFIRMAR_BORRAR_TUA).toBe(
      " La TUA volverá a salir de la lectura de la IA (si la leyó) y el cambio queda en el historial del gasto.",
    );
  });
});

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("paridad con el API (lectura del repo hermano)", () => {
  const desglose = leerApi("common/desglose-gasto.util.ts");
  it.skipIf(!desglose)("CATEGORIAS_TUA_INCLUIDA del API = la copia del panel", () => {
    const bloque =
      /export const CATEGORIAS_TUA_INCLUIDA\b[^=]*=\s*(?:Object\.freeze\(|new Set(?:<[^>]*>)?\()?\s*\[([^\]]*)\]/.exec(
        desglose ?? "",
      );
    expect(bloque, "el API todavía no exporta CATEGORIAS_TUA_INCLUIDA en common/desglose-gasto.util.ts").not.toBeNull();
    const cats = [...(bloque?.[1] ?? "").matchAll(/'([A-Z_]+)'|"([A-Z_]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(cats).toEqual([...CATEGORIAS_TUA_INCLUIDA]);
  });

  const util = leerApi("modules/expenses/tua-incluida.util.ts");
  it.skipIf(!util)("el 400 del API dice la MISMA frase que la validación local", () => {
    expect(util).toContain(") no puede ser mayor que el monto del ticket (");
    expect(util).toContain(", sin propina).");
    expect(util).toContain("La TUA incluida (");
  });
});
