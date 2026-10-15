/**
 * UN COBRO, VARIOS ABONOS (14-oct-2026, API 0.0.78, invariante 77): el ESTADO
 * de un cobro contra el banco en el panel — `lib/admin/cobro-banco.ts`.
 *
 * Casos reales del pedido: el cobro de $3,400 MXN de la #315 pagado con DOS
 * transferencias de $1,700 (primero «Conciliado parcial · faltan $1,700
 * MXN», luego «Conciliado» con 2 abonos), el lote de $69,183 que pagó
 * $68,205.55 de la #315 y $977.45 de la #332, y la liga vieja de Palma
 * ($55,053 contra un cobro de $27,526.50). Con un API previo (sin
 * `conciliacion_estado`) todo queda como antes. Ningún número se calcula
 * aquí: todos vienen del API.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CobroSinBanco } from "@/types/conciliacion";
import type { AbonoBancoDeCobro, FlightCobro } from "@/types/flights";
import {
  celdaBancoCobroSinBanco,
  chipParcialEntrada,
  chipParcialPreCierre,
  CLASE_BADGE_COBRO,
  claseBadgeCobro,
  conColumnaBancoCobrosSinBanco,
  lineaParcialesCobrosSinBanco,
  netoEsperadoParcial,
  textoCobroVuelveASinBanco,
  textoConfirmarDesvincularAbono,
  estadoBancoCobro,
  hrefAbonoDeCobro,
  hrefBuscarAbonoQueFalta,
  lineaBancoCobro,
  textoBadgeCobro,
  textoLineaBanco,
  textoSobranteCobro,
  tituloBadgeCobro,
  TITULO_CONCILIADO_MOVIMIENTO,
  TITULO_CONCILIADO_SOBRE,
  TITULO_SIN_CONCILIAR_COBRO,
  TITULO_SIN_CONCILIAR_SOBRE,
} from "../cobro-banco";

const CUENTA_EJE = "7d0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const MOV_1 = "32dd3b1d-0000-4a7b-8c9d-0e1f2a3b4c5d";
const MOV_2 = "a7e31d9d-0000-4a7b-8c9d-0e1f2a3b4c5d";
const MOV_LOTE = "8a7eff81-0000-4a7b-8c9d-0e1f2a3b4c5d";

const abono = (over: Partial<AbonoBancoDeCobro> = {}): AbonoBancoDeCobro => ({
  movimiento_id: MOV_1,
  fecha: "2026-09-15",
  monto_parte: 1700,
  monto_abono: 1700,
  cobros_n: 1,
  cuenta_bancaria_id: CUENTA_EJE,
  cuenta_alias: "EJE SCOTIA",
  pasarela: false,
  ...over,
});

// El cobro de $3,400 MXN de la #315 (misma forma que el snapshot del API).
const COBRO_3400: FlightCobro = {
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  vuelo_id: "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d",
  monto: "3400",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17.35",
  referencia: null,
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-09-15T17:00:00+00:00", // 15 sep, 12:00 Cancún
  foto_voucher_url: null,
  registrado_por: null,
  notas: null,
  created_at: "2026-09-15T17:00:00+00:00",
  updated_at: "2026-09-15T17:00:00+00:00",
};

/** Con el primer abono de $1,700: PARCIAL. */
const PARCIAL: FlightCobro = {
  ...COBRO_3400,
  conciliado: false,
  conciliado_via: "DIRECTO",
  movimiento_bancario_id: MOV_1,
  conciliacion_estado: "PARCIAL",
  ligado_banco: true,
  neto_banco: 3400,
  monto_vinculado: 1700,
  faltante: 1700,
  sobrante: 0,
  abonos_banco: [abono()],
};

/** Con el segundo abono: CONCILIADO con 2 abonos. */
const COMPLETO_2: FlightCobro = {
  ...PARCIAL,
  conciliado: true,
  conciliacion_estado: "CONCILIADO",
  monto_vinculado: 3400,
  faltante: 0,
  abonos_banco: [abono(), abono({ movimiento_id: MOV_2 })],
};

/** Un abono que cuadra (1 ↔ 1). */
const CONCILIADO_1: FlightCobro = {
  ...PARCIAL,
  conciliado: true,
  conciliacion_estado: "CONCILIADO",
  monto_vinculado: 3400,
  faltante: 0,
  abonos_banco: [abono({ monto_parte: 3400, monto_abono: 3400 })],
};

/** $68,205.55 de un abono de $69,183 que pagó también los $977.45 de la #332. */
const EN_LOTE: FlightCobro = {
  ...COBRO_3400,
  monto: "68205.55",
  conciliado: true,
  conciliado_via: "DIRECTO",
  conciliacion_estado: "CONCILIADO",
  ligado_banco: true,
  neto_banco: 68205.55,
  monto_vinculado: 68205.55,
  faltante: 0,
  sobrante: 0,
  abonos_banco: [abono({ movimiento_id: MOV_LOTE, monto_parte: 68205.55, monto_abono: 69183, cobros_n: 2 })],
};

const SIN_CONCILIAR: FlightCobro = {
  ...COBRO_3400,
  conciliado: false,
  conciliacion_estado: "SIN_CONCILIAR",
  ligado_banco: false,
  neto_banco: 3400,
  monto_vinculado: null,
  faltante: null,
  sobrante: null,
  abonos_banco: [],
};

describe("estado del cobro contra el banco", () => {
  it("manda el `conciliacion_estado` del API; con un API previo, `conciliado` de siempre", () => {
    expect(estadoBancoCobro(PARCIAL)).toBe("PARCIAL");
    expect(estadoBancoCobro(SIN_CONCILIAR)).toBe("SIN_CONCILIAR");
    expect(estadoBancoCobro({ ...COBRO_3400, conciliado: true })).toBe("CONCILIADO");
    expect(estadoBancoCobro({ ...COBRO_3400, conciliado: false })).toBeNull();
    expect(estadoBancoCobro(COBRO_3400)).toBeNull();
    // Un valor que el panel no conoce se trata como API previo.
    expect(
      estadoBancoCobro({ ...COBRO_3400, conciliado: true, conciliacion_estado: "OTRO" as never }),
    ).toBe("CONCILIADO");
  });
});

describe("badge de las cards de cobros", () => {
  it("los tres estados con sus textos («Conciliado parcial · faltan $1,700 MXN»)", () => {
    expect(textoBadgeCobro(PARCIAL)).toBe("Conciliado parcial · faltan $1,700 MXN");
    expect(textoBadgeCobro(COMPLETO_2)).toBe("Conciliado");
    expect(textoBadgeCobro(SIN_CONCILIAR)).toBe("Sin conciliar");
    expect(textoBadgeCobro({ ...PARCIAL, faltante: 977.45 })).toBe("Conciliado parcial · faltan $977.45 MXN");
    // Sin el faltante (no debería pasar) no se inventa un número.
    expect(textoBadgeCobro({ ...PARCIAL, faltante: null })).toBe("Conciliado parcial");
  });

  it("vía anticipo o sobre: «Conciliado» como hoy; no bancario o reembolso: sin badge", () => {
    expect(textoBadgeCobro({ ...COBRO_3400, conciliado: true, conciliacion_estado: "VIA_ANTICIPO" })).toBe(
      "Conciliado",
    );
    const efectivo: FlightCobro = { ...COBRO_3400, metodo_cobro: "EFECTIVO", conciliacion_estado: "NO_BANCARIO" };
    const reembolso: FlightCobro = { ...COBRO_3400, monto: "-500", conciliacion_estado: "NO_BANCARIO" };
    expect(textoBadgeCobro(efectivo)).toBeNull();
    expect(textoBadgeCobro(reembolso)).toBeNull();
  });

  it("API previo: `conciliado` ⇒ «Conciliado»; sin él, NADA (no hay «Sin conciliar» que inventar)", () => {
    expect(textoBadgeCobro({ ...COBRO_3400, conciliado: true })).toBe("Conciliado");
    expect(textoBadgeCobro({ ...COBRO_3400, conciliado: false })).toBeNull();
  });

  it("clases: verde, ámbar y rosa sin fondo, con sus variantes oscuras", () => {
    expect(claseBadgeCobro("CONCILIADO")).toBe(
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    );
    expect(claseBadgeCobro("VIA_ANTICIPO")).toBe(CLASE_BADGE_COBRO.CONCILIADO);
    expect(claseBadgeCobro("PARCIAL")).toBe("border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300");
    expect(claseBadgeCobro("SIN_CONCILIAR")).toBe("border-rose-500/40 text-rose-600 dark:text-rose-400");
    expect(claseBadgeCobro("SIN_CONCILIAR")).not.toContain("bg-");
    expect(claseBadgeCobro("NO_BANCARIO")).toBe("");
    expect(claseBadgeCobro(null)).toBe("");
  });

  it("tooltip con UN abono, con DOS y en un lote (textos.badge del 0.0.78)", () => {
    expect(tituloBadgeCobro(CONCILIADO_1)).toBe(
      "Conciliado con el banco: abono del 15 sep 2026 en EJE SCOTIA por $3,400 MXN.",
    );
    expect(tituloBadgeCobro(COMPLETO_2)).toBe(
      "Conciliado con 2 abonos del banco: 15 sep 2026 · $1,700 MXN (EJE SCOTIA) y 15 sep 2026 · $1,700 MXN (EJE SCOTIA).",
    );
    expect(tituloBadgeCobro(EN_LOTE)).toBe(
      "Conciliado con el banco: $68,205.55 MXN de un abono de $69,183 MXN del 15 sep 2026 (EJE SCOTIA) que pagó 2 cobros.",
    );
  });

  it("tooltip del PARCIAL: lo que respalda el banco, lo que falta y qué hacer", () => {
    expect(tituloBadgeCobro(PARCIAL)).toBe(
      "El banco respalda $1,700 MXN de $3,400 MXN (1 abono: 15 sep 2026 · EJE SCOTIA). Faltan $1,700 MXN: vincula el otro abono en Conciliación cuando llegue. Mientras, este cobro sale en «Cobros sin banco».",
    );
    // Dos abonos que todavía no completan un cobro de $5,000.
    const dos = {
      ...PARCIAL,
      monto: "5000",
      neto_banco: 5000,
      monto_vinculado: 3400,
      faltante: 1600,
      abonos_banco: [abono(), abono({ movimiento_id: MOV_2, fecha: "2026-09-16", cuenta_alias: null })],
    };
    expect(tituloBadgeCobro(dos)).toBe(
      "El banco respalda $3,400 MXN de $5,000 MXN (2 abonos: 15 sep 2026 · EJE SCOTIA y 16 sep 2026). Faltan $1,600 MXN: vincula el otro abono en Conciliación cuando llegue. Mientras, este cobro sale en «Cobros sin banco».",
    );
  });

  it("sobre, anticipo, sin conciliar y API previo: los textos de siempre", () => {
    const sobre = {
      ...COBRO_3400,
      cobro_grupo_id: "cg-1",
      cobro_grupo: { id: "cg-1", grupo_id: "g-1", grupo_folio: 12, monto_total: 10800.76, moneda: "USD" },
    };
    expect(tituloBadgeCobro({ ...sobre, conciliado: true, conciliacion_estado: "CONCILIADO" })).toBe(
      TITULO_CONCILIADO_SOBRE,
    );
    expect(tituloBadgeCobro({ ...sobre, conciliado: false, conciliacion_estado: "SIN_CONCILIAR" })).toBe(
      TITULO_SIN_CONCILIAR_SOBRE,
    );
    expect(tituloBadgeCobro(SIN_CONCILIAR)).toBe(TITULO_SIN_CONCILIAR_COBRO);
    expect(TITULO_SIN_CONCILIAR_COBRO).toBe(
      "Todavía no hay ningún abono del banco vinculado a este cobro. Se cruza solo al importar el estado de cuenta (Conciliación) o a mano desde el abono.",
    );
    expect(tituloBadgeCobro({ ...COBRO_3400, conciliado: true })).toBe(TITULO_CONCILIADO_MOVIMIENTO);
    const anticipo = {
      ...COBRO_3400,
      conciliado: true,
      conciliado_via: "ANTICIPO" as const,
      anticipo: { ingreso_id: "i-1", etiqueta: "ING-12" },
    };
    expect(tituloBadgeCobro({ ...anticipo, conciliacion_estado: "VIA_ANTICIPO" })).toBe(
      "Conciliado vía el anticipo ING-12: el anticipo ya está conciliado con su abono del banco.",
    );
    // API previo con la vía del anticipo: el mismo texto.
    expect(tituloBadgeCobro(anticipo)).toContain("Conciliado vía el anticipo ING-12");
    // Un anticipo todavía sin conciliar: el abono se liga al anticipo, no al cobro.
    expect(
      tituloBadgeCobro({ ...anticipo, conciliado: false, conciliado_via: null, conciliacion_estado: "SIN_CONCILIAR" }),
    ).toBe(
      "Salió del anticipo ING-12, que todavía no está conciliado con su abono del banco: en Conciliación el abono se vincula al anticipo, no a este cobro.",
    );
    expect(tituloBadgeCobro({ ...COBRO_3400, conciliacion_estado: "NO_BANCARIO" })).toBeNull();
  });

  it("abono en OTRA moneda (cobro USD con abono en pesos): el monto del abono va sin moneda", () => {
    const cruzado: FlightCobro = {
      ...CONCILIADO_1,
      monto: "1000",
      moneda: "USD",
      neto_banco: 1000,
      monto_vinculado: 1000,
      abonos_banco: [abono({ monto_parte: 17000, monto_abono: 17000 })],
    };
    expect(tituloBadgeCobro(cruzado)).toBe("Conciliado con el banco: abono del 15 sep 2026 en EJE SCOTIA por $17,000.");
  });
});

describe("enlaces a Conciliación", () => {
  it("el abono: «Conciliados», su cuenta y su día, primero y resaltado (`mov`)", () => {
    expect(hrefAbonoDeCobro(abono())).toBe(
      `/admin/conciliacion?f=conciliados&cuenta=${CUENTA_EJE}&desde=2026-09-15&hasta=2026-09-15&mov=${MOV_1}`,
    );
    // Sin cuenta ni fecha válidas, esos filtros no van.
    expect(hrefAbonoDeCobro(abono({ cuenta_bancaria_id: "EJE", fecha: null }))).toBe(
      `/admin/conciliacion?f=conciliados&mov=${MOV_1}`,
    );
  });

  it("«Buscar el abono que falta»: pendientes de 7 días antes a 30 después (días de Cancún) con el faltante", () => {
    expect(hrefBuscarAbonoQueFalta(PARCIAL)).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700",
    );
    expect(hrefBuscarAbonoQueFalta({ ...PARCIAL, faltante: 977.45 })).toContain("mvq=977.45");
    // 22:00 de Cancún del 15 sep = 03:00 UTC del 16: el día es el 15.
    expect(hrefBuscarAbonoQueFalta({ ...PARCIAL, fecha_cobro: "2026-09-16T03:00:00+00:00" })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700",
    );
    expect(hrefBuscarAbonoQueFalta({ ...PARCIAL, faltante: 0 })).toBeNull();
    expect(hrefBuscarAbonoQueFalta({ ...PARCIAL, faltante: null })).toBeNull();
  });
});

describe("renglón «Banco» debajo del cobro", () => {
  it("PARCIAL con enlaces (ADMIN/FACTURACION): textos.detalle_banco.parcial", () => {
    const l = lineaBancoCobro(PARCIAL, { conEnlaces: true });
    expect(l?.tono).toBe("aviso");
    expect(textoLineaBanco(l)).toBe(
      "Banco: $1,700 de $3,400 · abono del 15 sep 2026 (ver) · faltan $1,700 MXN · Buscar el abono que falta",
    );
    const enlaces = (l?.piezas ?? []).filter((p) => p.tipo === "enlace");
    expect(enlaces.map((p) => [p.texto, p.tipo === "enlace" ? p.href : ""])).toEqual([
      ["ver", hrefAbonoDeCobro(abono())],
      ["Buscar el abono que falta", "/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700"],
    ]);
  });

  it("PARCIAL sin permiso de conciliar: el mismo texto, sin ligas", () => {
    const l = lineaBancoCobro(PARCIAL);
    expect(textoLineaBanco(l)).toBe("Banco: $1,700 de $3,400 · abono del 15 sep 2026 · faltan $1,700 MXN");
    expect(l?.piezas.every((p) => p.tipo === "texto")).toBe(true);
  });

  it("completo con 2 abonos: textos.detalle_banco.completo_2_abonos (gris)", () => {
    const l = lineaBancoCobro(COMPLETO_2, { conEnlaces: true });
    expect(l?.tono).toBe("neutro");
    expect(textoLineaBanco(l)).toBe("Banco: 2 abonos · 15 sep 2026 $1,700 (ver) · 15 sep 2026 $1,700 (ver)");
    expect(textoLineaBanco(lineaBancoCobro(COMPLETO_2))).toBe("Banco: 2 abonos · 15 sep 2026 $1,700 · 15 sep 2026 $1,700");
  });

  it("liga vieja con abono de más (Palma: $55,053 contra $27,526.50): el texto único del sobrante", () => {
    const palma: FlightCobro = {
      ...CONCILIADO_1,
      monto: "27526.5",
      neto_banco: 27526.5,
      monto_vinculado: 55053,
      sobrante: 27526.5,
      abonos_banco: [abono({ monto_parte: 55053, monto_abono: 55053 })],
    };
    const l = lineaBancoCobro(palma, { conEnlaces: true });
    expect(l?.tono).toBe("aviso");
    expect(textoLineaBanco(l)).toBe(
      "El abono vinculado ($55,053 MXN) trae $27,526.50 MXN más que este cobro: ¿pagó también otro vuelo? Desvincúlalo en Conciliación y vuelve a vincularlo marcando los dos cobros. Ver el abono",
    );
    // Un sobrante de centavos (≤ $1.00, la tolerancia del API) no se avisa.
    expect(lineaBancoCobro({ ...palma, sobrante: 1 })).toBeNull();
  });

  it("sin renglón: un abono que cuadra, un lote, sin conciliar, no bancario y API previo", () => {
    expect(lineaBancoCobro(CONCILIADO_1, { conEnlaces: true })).toBeNull();
    expect(lineaBancoCobro(EN_LOTE, { conEnlaces: true })).toBeNull();
    expect(lineaBancoCobro(SIN_CONCILIAR, { conEnlaces: true })).toBeNull();
    expect(lineaBancoCobro({ ...COBRO_3400, conciliacion_estado: "NO_BANCARIO" })).toBeNull();
    expect(lineaBancoCobro({ ...COBRO_3400, conciliado: true })).toBeNull();
  });

  it("el texto del sobrante con varios abonos", () => {
    expect(textoSobranteCobro({ montoVinculado: 4000, sobrante: 600, moneda: "MXN", abonos: 2 })).toBe(
      "Los 2 abonos vinculados ($4,000 MXN) traen $600 MXN más que este cobro: ¿alguno pagó también otro vuelo? Desvincúlalo en Conciliación y vuelve a vincularlo marcando los dos cobros.",
    );
  });
});

describe("Ingresos y pre-cierre", () => {
  it("chip «Parcial · faltan $1,700 MXN» de Ingresos (sin `parcial`, nada)", () => {
    const chip = chipParcialEntrada({
      moneda: "MXN",
      conciliacion: { parcial: { monto_vinculado: 1700, faltante: 1700, abonos_n: 1 } },
    });
    expect(chip).toEqual({
      texto: "Parcial · faltan $1,700 MXN",
      titulo:
        "Conciliado parcial: el banco respalda $1,700 MXN de este cobro (1 abono) y faltan $1,700 MXN. Vincula el abono que falta en Conciliación cuando llegue.",
    });
    expect(chipParcialEntrada({ moneda: "MXN", conciliacion: { parcial: null } })).toBeNull();
    expect(chipParcialEntrada({ moneda: "MXN", conciliacion: {} })).toBeNull();
  });

  it("chip del pre-cierre «Cobros bancarios sin conciliar» para un parcial", () => {
    expect(chipParcialPreCierre({ folio: 315, parcial: true, faltante: 1700, moneda: "MXN" })).toBe(
      "#315 · parcial · faltan $1,700 MXN",
    );
    expect(chipParcialPreCierre({ folio: 315, parcial: false, faltante: 3400, moneda: "MXN" })).toBeNull();
    expect(chipParcialPreCierre({ folio: 315, faltante: 3400, moneda: "MXN" })).toBeNull();
  });
});

describe("guarda: el panel no calcula dinero del banco", () => {
  it("cobro-banco.ts no suma (`reduce`, `+=`): todo número viene del API", () => {
    const src = readFileSync(path.resolve(__dirname, "../cobro-banco.ts"), "utf8");
    expect(src).not.toMatch(/\.reduce\(/);
    expect(src).not.toMatch(/\+=/);
  });
});

// ═══════════ Paso 2 (diálogo y bandeja): desvincular UN abono y «Cobros sin banco» ═══════════

describe("desvincular UN abono de un cobro con varios (D22)", () => {
  // Bandeja: el abono de $1,700 del 15-sep de la #315; el cobro tiene otro de $1,700.
  const CONC = {
    cobro_id: COBRO_3400.id,
    folio: 315,
    estado: "CONCILIADO" as const,
    neto: 3400,
    monto_vinculado: 3400,
    faltante: 0,
    sobrante: 0,
    abonos_n: 2,
    faltante_sin_este: 1700,
    abonos: [
      { movimiento_id: MOV_1, fecha: "2026-09-15", monto_parte: 1700 },
      { movimiento_id: MOV_2, fecha: "2026-09-16", monto_parte: 1700 },
    ],
  };

  it("con OTROS abonos: textos.desvincular.cuerpo_con_otros con `faltante_sin_este` del API", () => {
    expect(textoConfirmarDesvincularAbono(CONC, { monto: "1700.00", fecha: "2026-09-15", moneda: "MXN" })).toBe(
      "El abono de $1,700 MXN del 15 sep 2026 vuelve a quedar pendiente. El cobro del vuelo #315 sigue ligado a 1 abono más y queda «Conciliado parcial»: faltarán $1,700 MXN. No se borra ningún cobro.",
    );
    // Con 3 abonos y lo que falta dentro de la tolerancia del API: sigue completo.
    expect(
      textoConfirmarDesvincularAbono(
        { ...CONC, abonos_n: 3, faltante_sin_este: 0.4 },
        { monto: "1700", fecha: "2026-09-15", moneda: "MXN" },
      ),
    ).toContain("sigue ligado a 2 abonos más y sigue conciliado completo.");
  });

  it("el ÚNICO abono del cobro: null (la confirmación de siempre) + «vuelve a «Cobros sin banco»»", () => {
    const solo = { ...CONC, abonos_n: 1, faltante_sin_este: 3400 };
    expect(textoConfirmarDesvincularAbono(solo, { monto: "3400", fecha: "2026-09-15", moneda: "MXN" })).toBeNull();
    expect(textoCobroVuelveASinBanco(solo)).toBe("El cobro del vuelo #315 vuelve a «Cobros sin banco».");
    expect(textoCobroVuelveASinBanco({ ...solo, folio: null })).toBe("El cobro vuelve a «Cobros sin banco».");
    // Con otros abonos no se dice (el cobro no se va de «Cobros sin banco» por este).
    expect(textoCobroVuelveASinBanco(CONC)).toBeNull();
    // API previo (sin `cobro_conciliacion`): nada nuevo.
    expect(textoConfirmarDesvincularAbono(null, { monto: "1", fecha: "2026-09-15" })).toBeNull();
    expect(textoCobroVuelveASinBanco(undefined)).toBeNull();
  });
});

describe("«Cobros sin banco»: columna «Banco» (textos.cobros_sin_banco del 0.0.78)", () => {
  const fila = (over: Partial<CobroSinBanco> = {}): CobroSinBanco => ({
    tipo: "COBRO_VUELO",
    id: COBRO_3400.id,
    fecha_cobro: "2026-09-15T17:00:00.000Z",
    monto: 3400,
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    comision_banco_monto: null,
    referencia: null,
    vuelo_id: COBRO_3400.vuelo_id,
    folio: 315,
    cliente: "Beh Kay",
    metodo_label: "Transferencia",
    neto: 3400,
    parcial: true,
    monto_vinculado: 1700,
    faltante: 1700,
    abonos_n: 1,
    abonos: [{ movimiento_id: MOV_1, fecha: "2026-09-15", monto_parte: 1700 }],
    ...over,
  });

  it("PARCIAL: badge ámbar «Parcial» con el title del API y «Ver abono» al abono (Conciliados, su día, `mov`)", () => {
    const c = celdaBancoCobroSinBanco(fila());
    expect(c?.texto).toBe("Parcial");
    expect(c?.clase).toBe(CLASE_BADGE_COBRO.PARCIAL);
    expect(c?.titulo).toBe("Conciliado $1,700 MXN de $3,400 MXN con 1 abono (15 sep 2026): faltan $1,700 MXN.");
    expect(c?.enlaces).toEqual([
      {
        key: MOV_1,
        texto: "Ver abono",
        href: `/admin/conciliacion?f=conciliados&desde=2026-09-15&hasta=2026-09-15&mov=${MOV_1}`,
        titulo: expect.stringContaining("Conciliados"),
      },
    ]);
  });

  it("PARCIAL con 2 abonos: un «Ver abono del …» por abono", () => {
    const c = celdaBancoCobroSinBanco(
      fila({
        monto: 5100,
        neto: 5100,
        monto_vinculado: 3400,
        abonos_n: 2,
        abonos: [
          { movimiento_id: MOV_1, fecha: "2026-09-15", monto_parte: 1700 },
          { movimiento_id: MOV_2, fecha: "2026-09-16", monto_parte: 1700 },
        ],
      }),
    );
    expect(c?.titulo).toBe("Conciliado $3,400 MXN de $5,100 MXN con 2 abonos (15 sep 2026 y 16 sep 2026): faltan $1,700 MXN.");
    expect(c?.enlaces.map((e) => e.texto)).toEqual(["Ver abono del 15 sep 2026", "Ver abono del 16 sep 2026"]);
  });

  it("sin abonos: badge gris «Sin abono»; API previo (sin `parcial`): null y la columna no se pinta", () => {
    const sin = celdaBancoCobroSinBanco(fila({ parcial: false, monto_vinculado: 0, faltante: 3400, abonos_n: 0, abonos: [] }));
    expect(sin).toEqual({
      texto: "Sin abono",
      clase: "border-border text-muted-foreground",
      titulo: "Ningún abono del banco vinculado todavía.",
      enlaces: [],
    });
    const previo = fila({ parcial: undefined, monto_vinculado: undefined, faltante: undefined, abonos: undefined });
    expect(celdaBancoCobroSinBanco(previo)).toBeNull();
    expect(conColumnaBancoCobrosSinBanco([previo])).toBe(false);
    expect(conColumnaBancoCobrosSinBanco([previo, fila()])).toBe(true);
  });

  it("«Neto esperado» de un parcial y la línea sobre la tabla (cuenta filas, no suma)", () => {
    expect(netoEsperadoParcial(fila())).toBe("$1,700.00 falta (de $3,400.00)");
    expect(netoEsperadoParcial(fila({ parcial: false }))).toBeNull();
    expect(lineaParcialesCobrosSinBanco([fila(), fila({ id: "x" }), fila({ parcial: false })])).toBe(
      "2 con pago parcial: un abono cubre solo una parte; el resto sigue pendiente.",
    );
    expect(lineaParcialesCobrosSinBanco([fila({ parcial: false })])).toBeNull();
  });
});
