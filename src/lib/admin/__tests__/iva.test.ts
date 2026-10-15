import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  IVA_DECIMALES,
  IVA_DEFAULT,
  METODOS_CON_IVA,
  ivaDefaultDeMetodo,
  ivaOverrideRehidratado,
  metodoLlevaIva,
  mismoIvaPct,
  normalizarIvaPct,
  type CotizacionIvaPersistido,
} from "@/lib/admin/iva";
import { METODOS_PAGO } from "@/lib/admin/metodos-pago";
import type { MetodoPago } from "@/types/quote";

/**
 * IVA MANUAL al reabrir una cotización (14-oct-2026, #341). La regla vive en
 * `lib/admin/iva.ts`; el cableado del cotizador (defaults del formulario →
 * `armarCalcPayload`) se prueba en
 * `components/admin/quotes/__tests__/quote-calculator-iva.test.tsx`.
 */

/**
 * La marca que el MOTOR graba en `calculo_snapshot.iva.aplica_por_metodo_pago`
 * para cada método. Tabla COPIADA a propósito (no sale de `metodoLlevaIva`):
 * así el fixture no se prueba contra sí mismo.
 */
const APLICA_POR_METODO: Record<MetodoPago, boolean> = {
  TRANSFERENCIA: true,
  HSBC_LINK: true,
  CHEQUE: true,
  BILLPOCKET: false,
  PAYWISE: false,
  EFECTIVO: false,
  DOLARES: false,
  OTRO: false,
};

/**
 * Cotización como la devuelve `GET /v1/quotes/:id`: snapshot del motor 1.3.x
 * (jsonb ⇒ números) y la columna `vuelo.iva_pct` (`decimal(6,4)` ⇒ PostgREST
 * la manda como CADENA con ceros de cola).
 */
function cotizacion(
  metodo: MetodoPago,
  porcentaje: number,
  over: Partial<CotizacionIvaPersistido> = {},
): CotizacionIvaPersistido {
  return {
    metodo_cobro: metodo,
    iva_pct: porcentaje.toFixed(4),
    calculo_snapshot: {
      iva: { aplica_por_metodo_pago: APLICA_POR_METODO[metodo], porcentaje },
    },
    ...over,
  };
}

/**
 * Lo que el MOTOR aplica con lo que manda el panel: el override si viaja
 * —INCLUIDO el 0— y, si no, el default del método. Espejo de
 * `quotes.service.ts` (`dto.iva_pct_override !== undefined ? … : …`), cuya
 * forma congela la paridad de abajo.
 */
const ivaDelMotor = (override: number | null, metodo: string) =>
  override !== null ? override : ivaDefaultDeMetodo(metodo);

describe("ivaOverrideRehidratado — la regla", () => {
  it("transferencia con IVA manual 0 % ⇒ 0 (la #341: antes se perdía y volvía el 16 %)", () => {
    const q341 = cotizacion("TRANSFERENCIA", 0);
    expect(ivaOverrideRehidratado(q341)).toBe(0);
    // Los otros dos métodos que llevan IVA, igual.
    expect(ivaOverrideRehidratado(cotizacion("HSBC_LINK", 0))).toBe(0);
    expect(ivaOverrideRehidratado(cotizacion("CHEQUE", 0))).toBe(0);
  });

  it("transferencia con un % distinto del estándar ⇒ ese % (0.08; 0.05 = la #374)", () => {
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.08))).toBe(0.08);
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.05))).toBe(0.05);
  });

  it("transferencia al 16 % ⇒ null (el estándar: se re-resuelve igual que hoy)", () => {
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.16))).toBeNull();
    expect(ivaOverrideRehidratado(cotizacion("HSBC_LINK", 0.16))).toBeNull();
    expect(ivaOverrideRehidratado(cotizacion("CHEQUE", 0.16))).toBeNull();
  });

  it("BillPocket con IVA manual 16 % ⇒ 0.16 (el caso que ya funcionaba: #233, #260; Paywise 5 % = #314)", () => {
    expect(ivaOverrideRehidratado(cotizacion("BILLPOCKET", 0.16))).toBe(0.16);
    expect(ivaOverrideRehidratado(cotizacion("PAYWISE", 0.05))).toBe(0.05);
    expect(ivaOverrideRehidratado(cotizacion("OTRO", 0.16))).toBe(0.16);
  });

  it("efectivo al 0 % ⇒ null (y todo método SIN IVA al 0 %)", () => {
    expect(ivaOverrideRehidratado(cotizacion("EFECTIVO", 0))).toBeNull();
    for (const m of ["BILLPOCKET", "PAYWISE", "DOLARES", "OTRO"] as const) {
      expect(ivaOverrideRehidratado(cotizacion(m, 0)), m).toBeNull();
    }
  });

  it("sin snapshot: la columna `iva_pct` y el default de `metodo_cobro`", () => {
    const sinSnapshot = (metodo: MetodoPago | null, iva_pct: string): CotizacionIvaPersistido => ({
      calculo_snapshot: null,
      metodo_cobro: metodo,
      iva_pct,
    });
    expect(ivaOverrideRehidratado(sinSnapshot("TRANSFERENCIA", "0.0000"))).toBe(0);
    expect(ivaOverrideRehidratado(sinSnapshot("TRANSFERENCIA", "0.1600"))).toBeNull();
    expect(ivaOverrideRehidratado(sinSnapshot("CHEQUE", "0.0800"))).toBe(0.08);
    expect(ivaOverrideRehidratado(sinSnapshot("EFECTIVO", "0.0000"))).toBeNull();
    expect(ivaOverrideRehidratado(sinSnapshot("BILLPOCKET", "0.1600"))).toBe(0.16);
    // `metodo_cobro` null = vuelo SIN cotizar (reserva, servicio; 68 en prod
    // el 14-oct-2026, todos con `iva_pct` 0): ese 0 es el default de la
    // columna, no un IVA pactado — no se inventa un «IVA manual 0 %».
    expect(ivaOverrideRehidratado(sinSnapshot(null, "0.0000"))).toBeNull();
  });

  it("valores como texto de PostgREST (con ceros de cola y espacios) valen lo mismo", () => {
    const q = (metodo: MetodoPago, pct: string): CotizacionIvaPersistido => ({
      metodo_cobro: metodo,
      iva_pct: pct,
      calculo_snapshot: {
        iva: { aplica_por_metodo_pago: APLICA_POR_METODO[metodo], porcentaje: pct },
      },
    });
    expect(ivaOverrideRehidratado(q("TRANSFERENCIA", "0.0000"))).toBe(0);
    expect(ivaOverrideRehidratado(q("TRANSFERENCIA", "0.0800"))).toBe(0.08);
    expect(ivaOverrideRehidratado(q("TRANSFERENCIA", "0.1600"))).toBeNull();
    expect(ivaOverrideRehidratado(q("BILLPOCKET", "0.1600"))).toBe(0.16);
    expect(ivaOverrideRehidratado(q("EFECTIVO", " 0.0000 "))).toBeNull();
  });

  it("snapshot sin `iva` ⇒ las columnas", () => {
    const q: CotizacionIvaPersistido = {
      calculo_snapshot: {},
      metodo_cobro: "TRANSFERENCIA",
      iva_pct: "0.0000",
    };
    expect(ivaOverrideRehidratado(q)).toBe(0);
    expect(ivaOverrideRehidratado({ ...q, calculo_snapshot: { iva: null } })).toBe(0);
    expect(ivaOverrideRehidratado({ ...q, iva_pct: "0.1600" })).toBeNull();
  });

  it("`iva` LEGADO sin la marca del método ⇒ el default sale de `metodo_cobro`", () => {
    // Forma de los fixtures viejos del panel (`{ porcentaje, aplica: true }`).
    const legado = (metodo: MetodoPago, porcentaje: number): CotizacionIvaPersistido => ({
      metodo_cobro: metodo,
      iva_pct: porcentaje.toFixed(4),
      calculo_snapshot: { iva: { porcentaje } },
    });
    expect(ivaOverrideRehidratado(legado("TRANSFERENCIA", 0.16))).toBeNull();
    expect(ivaOverrideRehidratado(legado("TRANSFERENCIA", 0))).toBe(0);
    expect(ivaOverrideRehidratado(legado("BILLPOCKET", 0.16))).toBe(0.16);
  });

  it("el SNAPSHOT manda sobre la columna (es la foto con la que se compuso el dinero)", () => {
    const q = cotizacion("TRANSFERENCIA", 0, { iva_pct: "0.1600" });
    expect(ivaOverrideRehidratado(q)).toBe(0);
    // Snapshot sin `porcentaje` utilizable: la columna lo respalda.
    const sinPct: CotizacionIvaPersistido = {
      metodo_cobro: "TRANSFERENCIA",
      iva_pct: "0.0500",
      calculo_snapshot: { iva: { aplica_por_metodo_pago: true, porcentaje: null } },
    };
    expect(ivaOverrideRehidratado(sinPct)).toBe(0.05);
  });

  it("compara a 4 decimales (round4) y devuelve el % redondeado como lo persiste el API", () => {
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.16000004))).toBeNull();
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.15999))).toBeNull();
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.1599))).toBe(0.1599);
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.08333333))).toBe(0.0833);
    // 0.00004 redondea a 0: en un método SIN IVA es el default; en uno CON IVA, override 0.
    expect(ivaOverrideRehidratado(cotizacion("EFECTIVO", 0.00004))).toBeNull();
    expect(ivaOverrideRehidratado(cotizacion("TRANSFERENCIA", 0.00004))).toBe(0);
  });

  it("sin un % utilizable no se inventa IVA: null (se re-resuelve por método)", () => {
    expect(ivaOverrideRehidratado(null)).toBeNull();
    expect(ivaOverrideRehidratado(undefined)).toBeNull();
    // `Number(null) === 0`: sin la guarda, «sin dato» pasaría por «IVA manual 0 %».
    const sinDato = (iva_pct: unknown): CotizacionIvaPersistido => ({
      metodo_cobro: "TRANSFERENCIA",
      iva_pct: iva_pct as string,
      calculo_snapshot: { iva: { aplica_por_metodo_pago: true, porcentaje: iva_pct as string } },
    });
    for (const v of [null, undefined, "", "  ", "abc", Number.NaN, Infinity, -0.16, true]) {
      expect(ivaOverrideRehidratado(sinDato(v)), String(v)).toBeNull();
    }
  });

  it("reabrir y guardar sin tocar el IVA vuelve a dar EXACTAMENTE el % persistido (prod, 14-oct-2026)", () => {
    const casos: [string, CotizacionIvaPersistido, number][] = [
      ["#341 transferencia 0 %", cotizacion("TRANSFERENCIA", 0), 0],
      ["#374 transferencia 5 %", cotizacion("TRANSFERENCIA", 0.05), 0.05],
      ["transferencia estándar", cotizacion("TRANSFERENCIA", 0.16), 0.16],
      ["link HSBC 0 %", cotizacion("HSBC_LINK", 0), 0],
      ["#233 BillPocket 16 %", cotizacion("BILLPOCKET", 0.16), 0.16],
      ["#314 Paywise 5 %", cotizacion("PAYWISE", 0.05), 0.05],
      ["efectivo", cotizacion("EFECTIVO", 0), 0],
      ["sin snapshot, transferencia 0 %", { calculo_snapshot: null, metodo_cobro: "TRANSFERENCIA", iva_pct: "0.0000" }, 0],
    ];
    for (const [nombre, q, persistido] of casos) {
      const override = ivaOverrideRehidratado(q);
      const metodo = q.metodo_cobro ?? "TRANSFERENCIA";
      expect(mismoIvaPct(ivaDelMotor(override, metodo), persistido), nombre).toBe(true);
    }
  });
});

describe("normalización", () => {
  it("normalizarIvaPct: número o cadena, a 4 decimales; lo demás es null", () => {
    expect(IVA_DECIMALES).toBe(4);
    expect(normalizarIvaPct(0)).toBe(0);
    expect(normalizarIvaPct(-0)).toBe(0);
    expect(Object.is(normalizarIvaPct(-0), 0)).toBe(true);
    expect(normalizarIvaPct("0.1600")).toBe(0.16);
    expect(normalizarIvaPct(0.083333)).toBe(0.0833);
    expect(normalizarIvaPct(null)).toBeNull();
    expect(normalizarIvaPct("")).toBeNull();
    expect(normalizarIvaPct(-0.01)).toBeNull();
    expect(normalizarIvaPct(false)).toBeNull();
  });

  it("mismoIvaPct compara en diezmilésimas, no con `===` de floats", () => {
    expect(mismoIvaPct(0.1 + 0.06, 0.16)).toBe(true);
    expect(mismoIvaPct(0.16, 0.1601)).toBe(false);
    expect(mismoIvaPct(0, 0)).toBe(true);
  });
});

describe("IVA por método (espejo del motor)", () => {
  it("IVA_DEFAULT es una FRACCIÓN (0.16), no un porcentaje (16)", () => {
    expect(IVA_DEFAULT).toBe(0.16);
  });

  it("llevan IVA por default SOLO transferencia, link HSBC y cheque", () => {
    expect([...METODOS_CON_IVA].sort()).toEqual(["CHEQUE", "HSBC_LINK", "TRANSFERENCIA"]);
    for (const m of METODOS_PAGO.map((x) => x.value)) {
      expect(metodoLlevaIva(m), m).toBe(APLICA_POR_METODO[m]);
      expect(ivaDefaultDeMetodo(m), m).toBe(APLICA_POR_METODO[m] ? 0.16 : 0);
    }
    expect(metodoLlevaIva(null)).toBe(false);
    expect(metodoLlevaIva("NUEVO")).toBe(false);
  });

  it("es la MISMA división que anuncian las pistas del selector («IVA 16%»)", () => {
    const conPista = METODOS_PAGO.filter((m) => /IVA 16\s?%/.test(m.hint)).map((m) => m.value);
    expect(conPista.sort()).toEqual([...METODOS_CON_IVA].sort());
  });
});

/**
 * PARIDAD con el motor (`vuelatour-api/src/modules/quotes/quotes.service.ts`).
 * El repo hermano solo existe en el workspace local: en Vercel la prueba se
 * SALTA. Desde un worktree fuera del workspace se apunta a mano con
 * `VUELATOUR_API_DIR=/ruta/a/vuelatour-api npx vitest run …`.
 */
const API_DIR = process.env.VUELATOUR_API_DIR ?? path.resolve(__dirname, "../../../../../vuelatour-api");
const QUOTES_SERVICE = path.join(API_DIR, "src/modules/quotes/quotes.service.ts");
const fuenteApi = existsSync(QUOTES_SERVICE) ? readFileSync(QUOTES_SERVICE, "utf8") : null;
/** La fuente en una sola línea (los saltos y la sangría no son la regla). */
const plana = (fuenteApi ?? "").replace(/\s+/g, " ");

describe("paridad con el motor del API (lectura del repo hermano)", () => {
  it.skipIf(!fuenteApi)("IVA_DEFAULT es el MISMO número (fracción)", () => {
    const m = /\bconst IVA_DEFAULT\s*=\s*([0-9.]+)\s*;/.exec(fuenteApi ?? "");
    expect(m, "quotes.service.ts ya no declara `const IVA_DEFAULT = …;`").not.toBeNull();
    expect(Number(m?.[1])).toBe(IVA_DEFAULT);
  });

  it.skipIf(!fuenteApi)("los métodos con IVA por default son los MISMOS (`ivaAplicaPorMetodo`)", () => {
    const m = /\bconst ivaAplicaPorMetodo\s*=([\s\S]*?);/.exec(fuenteApi ?? "");
    expect(m, "quotes.service.ts ya no declara `const ivaAplicaPorMetodo = …;`").not.toBeNull();
    const delApi = [...(m?.[1] ?? "").matchAll(/MetodoPago\.([A-Z_]+)/g)].map((x) => x[1]);
    expect(delApi.sort()).toEqual([...METODOS_CON_IVA].sort());
  });

  it.skipIf(!fuenteApi)("un override EXPLÍCITO de 0 se respeta (no cae al default del método)", () => {
    const formas = [
      "const ivaPct = dto.iva_pct_override !== undefined ? dto.iva_pct_override : ivaAplicaPorMetodo ? IVA_DEFAULT : 0;",
      "const ivaPct = dto.iva_pct_override ?? (ivaAplicaPorMetodo ? IVA_DEFAULT : 0);",
    ];
    expect(
      formas.some((f) => plana.includes(f)),
      "la resolución del IVA del motor cambió: revisar que `iva_pct_override: 0` siga ganándole al método",
    ).toBe(true);
  });

  it.skipIf(!fuenteApi)("el snapshot guarda la marca del método y el % a 4 decimales", () => {
    expect(plana).toContain("aplica_por_metodo_pago: ivaAplicaPorMetodo,");
    expect(plana).toContain("porcentaje: round4(ivaPct),");
  });
});
