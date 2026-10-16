/**
 * «Corregir cobro» (26-sep-2026) — pedido del cliente con la captura de la
 * cotización #315 «Beh Kay»: dos cobros «$3,400 MXN · Transferencia →
 * Scotiabank Pesos · 15 sep 2026 · Registró: Itzi» y «$68,205.55 MXN …»,
 * cada uno solo con recibo y bote de basura; «grabaron mal un cobro del 17
 * de septiembre y no podemos editarlo de forma sencilla».
 *
 * Congela la lógica PURA de `lib/admin/cobro-edicion.ts`: quién edita, qué
 * se puede corregir por tipo de cobro (espejo de `updateCobro` del API), el
 * formulario prellenado, el DIFF que viaja (solo lo que cambió) con sus
 * líneas «antes → después», la validación y los errores en es-MX.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FlightCobro } from "@/types/flights";
import {
  cambiosDeCobro,
  datosSoloLecturaCobro,
  descripcionConfirmarEdicion,
  descripcionFichaEdicion,
  edicionDeCobro,
  erroresEdicionCobro,
  etiquetaBotonEditarCobro,
  formularioDesdeCobro,
  hayCobrosEditables,
  hintCuentaLegada,
  hintTcEdicion,
  mensajeErrorEdicionCobro,
  MSG_COBRO_CONCILIADO,
  MSG_MOTIVO_REEMBOLSO,
  MSG_TC_REQUERIDO,
  numeroDe,
  puedeEditarCobro,
  resumenCambiosCobro,
  ROLES_EDITAR_COBRO,
  TEXTO_SOBRE_NO_SE_EDITA,
  tituloBotonEditarCobro,
  tituloFichaEdicion,
  type ValoresEdicionCobro,
} from "../cobro-edicion";

// Cobros de la #315 (misma forma que manda el snapshot del API).
const COBRO_3400: FlightCobro = {
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  vuelo_id: "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d",
  monto: "3400",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17.35",
  comision_banco_pct: null,
  comision_banco_monto: null,
  referencia: "SPEI 889922",
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-09-15T17:00:00+00:00", // 15 sep, 12:00 Cancún
  foto_voucher_url: null,
  registrado_por: "u-1",
  registrado_por_nombre: "Itzi",
  notas: null,
  created_at: "2026-09-15T17:00:00+00:00",
  updated_at: "2026-09-15T17:00:00+00:00",
};

// El del 17 de septiembre, capturado a las 22:30 de Cancún (el día en UTC ya
// es 18: el prellenado NO puede correr el día).
const COBRO_17SEP: FlightCobro = {
  ...COBRO_3400,
  id: "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d",
  monto: "68205.55",
  metodo_cobro: "PAYWISE",
  cuenta_destino: "Paywise",
  comision_banco_pct: "8.857",
  comision_banco_monto: "6040.97",
  referencia: "PW-5521",
  fecha_cobro: "2026-09-18T03:30:00+00:00",
};

function valoresDe(c: FlightCobro, cambios: Partial<ValoresEdicionCobro> = {}): ValoresEdicionCobro {
  return { ...formularioDesdeCobro(c).valores, ...cambios };
}

function diff(c: FlightCobro, cambios: Partial<ValoresEdicionCobro>) {
  return cambiosDeCobro(c, formularioDesdeCobro(c), valoresDe(c, cambios), edicionDeCobro(c));
}

describe("quién corrige un cobro", () => {
  it("solo ADMIN y FACTURACION (los roles del PATCH del API)", () => {
    expect(ROLES_EDITAR_COBRO).toEqual(["ADMIN", "FACTURACION"]);
    expect(puedeEditarCobro("ADMIN")).toBe(true);
    expect(puedeEditarCobro("FACTURACION")).toBe(true);
    for (const rol of ["COORDINADOR", "SOCIO", "ANALISTA", "PILOTO", "MECANICO", "", null, undefined]) {
      expect(puedeEditarCobro(rol)).toBe(false);
    }
  });

  it("la card solo señala «Editar» si hay al menos un cobro con el botón", () => {
    const sobre = { ...COBRO_3400, cobro_grupo_id: "g-1" };
    expect(hayCobrosEditables([COBRO_3400], "ADMIN")).toBe(true);
    expect(hayCobrosEditables([sobre, COBRO_3400], "FACTURACION")).toBe(true);
    expect(hayCobrosEditables([sobre], "ADMIN")).toBe(false);
    expect(hayCobrosEditables([], "ADMIN")).toBe(false);
    expect(hayCobrosEditables([COBRO_3400], "COORDINADOR")).toBe(false);
  });
});

describe("qué se puede corregir según el tipo de cobro", () => {
  it("cobro normal: todo", () => {
    const e = edicionDeCobro(COBRO_3400);
    expect(e).toMatchObject({ ofrecer: true, dineroBloqueado: false, tcBloqueado: false, motivo: null });
    expect(e.explicacion).toBeNull();
    expect(tituloBotonEditarCobro(COBRO_3400)).toBe("Corregir este cobro (monto, método, fecha, referencia…)");
  });

  it("parte de un sobre de grupo: no se ofrece (409 COBRO_DE_GRUPO) y se dice por qué", () => {
    const e = edicionDeCobro({ ...COBRO_3400, cobro_grupo_id: "g-1" });
    expect(e.ofrecer).toBe(false);
    expect(e.razonSinEditar).toBe(TEXTO_SOBRE_NO_SE_EDITA);
    expect(TEXTO_SOBRE_NO_SE_EDITA).toContain("se corrigen, re-parten o eliminan desde el grupo");
    expect(
      edicionDeCobro({
        ...COBRO_3400,
        cobro_grupo: { id: "s", grupo_id: "g", grupo_folio: 12, monto_total: 100, moneda: "USD" },
      }).ofrecer,
    ).toBe(false);
  });

  it("reembolso: dinero y T.C. de solo lectura (el API responde 400 si se tocan)", () => {
    const r = { ...COBRO_3400, monto: "-500", notas: "Cliente canceló un tramo" };
    const e = edicionDeCobro(r);
    expect(e).toMatchObject({ ofrecer: true, dineroBloqueado: true, tcBloqueado: true, motivo: "REEMBOLSO" });
    expect(e.explicacion).toContain("elimínalo y vuelve a registrarlo");
    expect(tituloBotonEditarCobro(r)).toBe("Corregir este reembolso: fecha, referencia y notas");
    expect(tituloFichaEdicion(r)).toBe("Corregir reembolso");
    expect(etiquetaBotonEditarCobro(r)).toBe("Editar reembolso de $500 MXN");
  });

  it("conciliado con el banco (liga directa o API previo sin `conciliado_via`): dinero y T.C. bloqueados", () => {
    for (const via of ["DIRECTO", undefined] as const) {
      const e = edicionDeCobro({ ...COBRO_3400, conciliado: true, conciliado_via: via });
      expect(e).toMatchObject({ dineroBloqueado: true, tcBloqueado: true, motivo: "CONCILIADO" });
      expect(e.explicacion).toContain("desvincúlalo primero en Conciliación");
    }
  });

  it("de un anticipo: dinero bloqueado (409 COBRO_DE_ANTICIPO) pero el T.C. SÍ se corrige", () => {
    const a: FlightCobro = {
      ...COBRO_3400,
      anticipo: { ingreso_id: "i-1", etiqueta: "ING-12" },
      conciliado: true,
      conciliado_via: "ANTICIPO",
    };
    const e = edicionDeCobro(a);
    expect(e).toMatchObject({ dineroBloqueado: true, tcBloqueado: false, motivo: "ANTICIPO" });
    expect(e.explicacion).toContain("Salió del anticipo ING-12");
    expect(e.explicacion).toContain("Aquí puedes corregir el T.C., la fecha");
    expect(tituloBotonEditarCobro(a)).toContain("solo T.C., fecha");
    // Anticipo en dólares: no se promete un T.C. que no aplica.
    const usd = edicionDeCobro({ ...a, moneda: "USD" });
    expect(usd.explicacion).not.toContain("T.C.");
    expect(tituloBotonEditarCobro({ ...a, moneda: "USD" })).not.toContain("T.C.");
  });

  it("el reembolso manda sobre lo conciliado (el más restrictivo gana)", () => {
    const e = edicionDeCobro({ ...COBRO_3400, monto: "-10", conciliado: true });
    expect(e.motivo).toBe("REEMBOLSO");
  });
});

describe("formulario prellenado con el cobro", () => {
  it("el cobro de $3,400 MXN de la captura", () => {
    const f = formularioDesdeCobro(COBRO_3400);
    expect(f.valores).toEqual({
      monto: 3400,
      moneda: "MXN",
      metodo_cobro: "TRANSFERENCIA",
      tc_usd_mxn: 17.35,
      comision_banco_pct: "",
      comision_banco_monto: "",
      referencia: "SPEI 889922",
      cuenta_destino: "Scotiabank Pesos",
      fecha_cobro: "2026-09-15",
      notas: "",
    });
    expect(f.cuentaLegada).toBeNull();
    expect(f.horaCancun).toBe("12:00");
  });

  it("fecha en HORA CANCÚN: 03:30 UTC del 18 es el 17 a las 22:30", () => {
    const f = formularioDesdeCobro(COBRO_17SEP);
    expect(f.valores.fecha_cobro).toBe("2026-09-17");
    expect(f.horaCancun).toBe("22:30");
  });

  it("comisión en %: se prellena el % cuando reproduce EXACTO la comisión guardada (Paywise)", () => {
    const f = formularioDesdeCobro(COBRO_17SEP);
    expect(f.valores.comision_banco_pct).toBe(8.857);
    expect(f.valores.comision_banco_monto).toBe("");
  });

  it("comisión capturada como MONTO (el % guardado es derivado): se prellena el monto", () => {
    // 589.05 / 68,205.55 = 0.8636 % (4 decimales) ⇒ 0.8636 % daría 589.02: no cuadra.
    const f = formularioDesdeCobro({
      ...COBRO_17SEP,
      metodo_cobro: "TRANSFERENCIA",
      comision_banco_pct: "0.8636",
      comision_banco_monto: "589.05",
    });
    expect(f.valores.comision_banco_pct).toBe("");
    expect(f.valores.comision_banco_monto).toBe(589.05);
  });

  it("reembolso: el monto se prellena POSITIVO (va de solo lectura)", () => {
    expect(formularioDesdeCobro({ ...COBRO_3400, monto: "-500" }).valores.monto).toBe(500);
  });

  it("cuenta capturada antes del catálogo (alias libre): no se inventa una del catálogo", () => {
    const f = formularioDesdeCobro({ ...COBRO_3400, cuenta_destino: "HSBC MXN" });
    expect(f.valores.cuenta_destino).toBe("");
    expect(f.cuentaLegada).toBe("HSBC MXN");
    expect(hintCuentaLegada("HSBC MXN")).toBe(
      "Capturada antes como «HSBC MXN» (fuera de la lista). Se conserva si no eliges otra.",
    );
  });

  it("cobro en pesos sin T.C. propio: el T.C. se prellena vacío", () => {
    expect(formularioDesdeCobro({ ...COBRO_3400, tc_usd_mxn: null }).valores.tc_usd_mxn).toBe("");
  });
});

describe("diff: SOLO lo que cambió viaja al API", () => {
  it("sin tocar nada: sin cambios (ni un campo en el PATCH)", () => {
    for (const c of [COBRO_3400, COBRO_17SEP]) {
      const r = diff(c, {});
      expect(r.hayCambios).toBe(false);
      expect(r.patch).toEqual({});
      expect(r.lineas).toEqual([]);
    }
  });

  it("el cobro del 17-sep mal grabado: monto y fecha, con la hora de pared conservada", () => {
    const r = diff(COBRO_17SEP, { monto: "62805.55", fecha_cobro: "2026-09-16" });
    expect(r.patch).toEqual({
      monto: 62805.55,
      // 16 sep a las 22:30 de Cancún = 17 sep 03:30 UTC.
      fecha_cobro: "2026-09-17T03:30:00.000Z",
    });
    expect(r.tocaDinero).toBe(true);
    expect(r.lineas).toEqual([
      { campo: "monto", etiqueta: "Monto", antes: "$68,205.55 MXN", despues: "$62,805.55 MXN" },
      // Comisión en %: el API la recalcula con el MISMO % — la línea dice el resultado.
      {
        campo: "comision",
        etiqueta: "Comisión del banco",
        antes: "$6,040.97 MXN (8.857 %)",
        despues: "$5,562.69 MXN (8.857 %)",
      },
      { campo: "fecha_cobro", etiqueta: "Fecha del cobro", antes: "17 sep 2026", despues: "16 sep 2026" },
    ]);
    expect(resumenCambiosCobro(r.lineas)).toBe("Cambió: monto, comisión del banco, fecha del cobro.");
  });

  it("comisión como MONTO directo: al corregir el monto se REENVÍA la comisión que se ve (el API la reescalaría)", () => {
    const c: FlightCobro = {
      ...COBRO_17SEP,
      metodo_cobro: "TRANSFERENCIA",
      comision_banco_pct: "0.8636",
      comision_banco_monto: "589.05",
    };
    const r = diff(c, { monto: 62805.55 });
    expect(r.patch).toEqual({ monto: 62805.55, comision_banco_monto: 589.05 });
    // La comisión no cambia: no hay línea que la mencione.
    expect(r.lineas.map((l) => l.campo)).toEqual(["monto"]);
  });

  it("quitar la comisión: `comision_banco_pct: 0` (el API la deja en null)", () => {
    const r = diff(COBRO_17SEP, { comision_banco_pct: "", comision_banco_monto: "" });
    expect(r.patch).toEqual({ comision_banco_pct: 0 });
    expect(r.lineas).toEqual([
      {
        campo: "comision",
        etiqueta: "Comisión del banco",
        antes: "$6,040.97 MXN (8.857 %)",
        despues: "sin comisión",
      },
    ]);
  });

  it("cambiar la comisión a un monto directo", () => {
    const r = diff(COBRO_17SEP, { comision_banco_monto: "6041" });
    expect(r.patch).toEqual({ comision_banco_monto: 6041 });
    expect(r.lineas[0]).toMatchObject({ antes: "$6,040.97 MXN (8.857 %)", despues: "$6,041 MXN" });
  });

  it("moneda: el monto va SIEMPRE con su moneda; al pasar a dólares el T.C. se QUITA (null, como en el alta)", () => {
    // Aunque el formulario conserve el T.C. oculto, un cobro en USD no guarda
    // T.C.: el balance y el Libro Dinero lo usarían en vez del T.C. de venta.
    const r = diff(COBRO_3400, { moneda: "USD", monto: "200" });
    expect(r.patch).toEqual({ monto: 200, moneda: "USD", tc_usd_mxn: null });
    expect(r.tocaDinero).toBe(true);
    expect(r.lineas).toEqual([
      { campo: "monto", etiqueta: "Monto", antes: "$3,400 MXN", despues: "$200 USD" },
      {
        campo: "tc_usd_mxn",
        etiqueta: "Tipo de cambio",
        antes: "17.35",
        despues: "no aplica (cobro en USD)",
      },
    ]);
  });

  it("de pesos SIN T.C. propio a dólares: no hay T.C. que quitar", () => {
    const r = diff({ ...COBRO_3400, tc_usd_mxn: null }, { moneda: "USD", monto: "200" });
    expect(r.patch).toEqual({ monto: 200, moneda: "USD" });
  });

  it("de dólares a pesos: el T.C. viaja SIEMPRE, aunque el cobro en USD ya trajera ese mismo", () => {
    const usdConTc: FlightCobro = { ...COBRO_3400, moneda: "USD", monto: "200", tc_usd_mxn: "17.35" };
    const r = diff(usdConTc, { moneda: "MXN", monto: "3470" });
    expect(r.patch).toEqual({ monto: 3470, moneda: "MXN", tc_usd_mxn: 17.35 });
    expect(r.lineas.find((l) => l.campo === "tc_usd_mxn")).toMatchObject({
      antes: "sin T.C.",
      despues: "17.35",
    });
  });

  it("de dólares a pesos: moneda y T.C.", () => {
    const usd: FlightCobro = { ...COBRO_3400, moneda: "USD", monto: "200", tc_usd_mxn: null };
    const r = diff(usd, { moneda: "MXN", monto: "3470", tc_usd_mxn: "17.35" });
    expect(r.patch).toEqual({ monto: 3470, moneda: "MXN", tc_usd_mxn: 17.35 });
    expect(r.lineas.find((l) => l.campo === "tc_usd_mxn")).toEqual({
      campo: "tc_usd_mxn",
      etiqueta: "Tipo de cambio",
      antes: "sin T.C.",
      despues: "17.35",
    });
  });

  it("T.C. con 6 decimales (el que hace cuadrar los pesos)", () => {
    const r = diff(COBRO_3400, { tc_usd_mxn: "16.991632" });
    expect(r.patch).toEqual({ tc_usd_mxn: 16.991632 });
    expect(r.lineas[0]).toMatchObject({ antes: "17.35", despues: "16.991632" });
  });

  it("método y cuenta: al pasar a efectivo la cuenta se quita (null)", () => {
    const r = diff(COBRO_3400, { metodo_cobro: "EFECTIVO", cuenta_destino: "" });
    expect(r.patch).toEqual({ metodo_cobro: "EFECTIVO", cuenta_destino: null });
    expect(r.lineas).toEqual([
      { campo: "metodo_cobro", etiqueta: "Método", antes: "Transferencia", despues: "Efectivo" },
      {
        campo: "cuenta_destino",
        etiqueta: "Cuenta destino",
        antes: "Scotiabank Pesos",
        despues: "Sin especificar",
      },
    ]);
    expect(r.tocaDinero).toBe(false);
  });

  it("cuenta legada sin tocar: no se borra; elegir una del catálogo sí se manda", () => {
    const legada = { ...COBRO_3400, cuenta_destino: "HSBC MXN" };
    expect(diff(legada, { notas: "ok" }).patch).toEqual({ notas: "ok" });
    const r = diff(legada, { cuenta_destino: "HSBC Pesos" });
    expect(r.patch).toEqual({ cuenta_destino: "HSBC Pesos" });
    expect(r.lineas[0]).toMatchObject({ antes: "HSBC MXN", despues: "HSBC Pesos" });
  });

  it("referencia y notas: se recortan; vaciarlas manda null", () => {
    const r = diff(COBRO_3400, { referencia: "  ", notas: "  pagó su hermana  " });
    expect(r.patch).toEqual({ referencia: null, notas: "pagó su hermana" });
    expect(r.lineas).toEqual([
      { campo: "referencia", etiqueta: "Referencia", antes: "SPEI 889922", despues: "(vacía)" },
      { campo: "notas", etiqueta: "Notas", antes: "(vacías)", despues: "pagó su hermana" },
    ]);
    expect(r.tocaDinero).toBe(false);
  });

  it("REEMBOLSO: aunque el formulario traiga otro dinero, solo viaja lo permitido", () => {
    const r = diff(
      { ...COBRO_3400, monto: "-500" },
      { monto: 900, moneda: "USD", metodo_cobro: "EFECTIVO", tc_usd_mxn: 20, referencia: "DEV-1" },
    );
    expect(r.patch).toEqual({ referencia: "DEV-1" });
  });

  it("CONCILIADO: el T.C. no viaja (el API lo trata como dinero)", () => {
    const r = diff({ ...COBRO_3400, conciliado: true }, { tc_usd_mxn: 18, fecha_cobro: "2026-09-14" });
    expect(Object.keys(r.patch)).toEqual(["fecha_cobro"]);
  });

  it("ANTICIPO en pesos: el T.C. SÍ viaja; el monto NO", () => {
    const a: FlightCobro = { ...COBRO_3400, anticipo: { ingreso_id: "i", etiqueta: "ING-12" } };
    const r = diff(a, { tc_usd_mxn: "17.5", monto: 9999 });
    expect(r.patch).toEqual({ tc_usd_mxn: 17.5 });
    expect(r.tocaDinero).toBe(true);
  });
});

describe("validación de la edición", () => {
  const ed = (c: FlightCobro, v: Partial<ValoresEdicionCobro>) =>
    erroresEdicionCobro(formularioDesdeCobro(c), valoresDe(c, v), edicionDeCobro(c));

  it("sin cambios: sin errores", () => {
    expect(ed(COBRO_3400, {})).toEqual({});
  });

  it("monto en 0 o vacío", () => {
    expect(ed(COBRO_3400, { monto: "" }).monto).toBe("Monto debe ser > 0");
    expect(ed(COBRO_3400, { monto: 0 }).monto).toBe("Monto debe ser > 0");
  });

  it("comisión ≥ monto (mismo 400 del API)", () => {
    expect(ed(COBRO_3400, { comision_banco_monto: 3400 }).comision_banco_monto).toBe(
      "La comisión no puede ser mayor o igual al monto del cobro.",
    );
  });

  it("T.C.: obligatorio al pasar a pesos y al VACIAR uno que existía", () => {
    const usd: FlightCobro = { ...COBRO_3400, moneda: "USD", tc_usd_mxn: null };
    expect(ed(usd, { moneda: "MXN", tc_usd_mxn: "" }).tc_usd_mxn).toBe(MSG_TC_REQUERIDO);
    expect(ed(COBRO_3400, { tc_usd_mxn: "" }).tc_usd_mxn).toBe(MSG_TC_REQUERIDO);
  });

  it("T.C.: un cobro que YA estaba en pesos sin T.C. no obliga a inventarlo para corregir la fecha", () => {
    const sinTc = { ...COBRO_3400, tc_usd_mxn: null };
    expect(ed(sinTc, { fecha_cobro: "2026-09-14" })).toEqual({});
    const f = formularioDesdeCobro(sinTc);
    expect(hintTcEdicion(f, "")).toContain("no tiene T.C. propio");
    expect(hintTcEdicion(f, "17")).toContain("Corrígelo si se capturó mal");
  });

  it("T.C. bloqueado (conciliado): nunca se exige", () => {
    expect(ed({ ...COBRO_3400, tc_usd_mxn: null, conciliado: true }, { tc_usd_mxn: "" })).toEqual({});
  });

  it("dinero bloqueado (reembolso): el monto no se valida", () => {
    expect(ed({ ...COBRO_3400, monto: "-500" }, { monto: "" })).toEqual({});
  });

  it("reembolso: su motivo (las notas) se reescribe pero no se borra", () => {
    const r = { ...COBRO_3400, monto: "-500", notas: "Reembolso: tramo cancelado" };
    expect(ed(r, { notas: "  " }).notas).toBe(MSG_MOTIVO_REEMBOLSO);
    expect(ed(r, { notas: "Reembolso: el cliente canceló el regreso" })).toEqual({});
    // Un cobro normal sí puede quedarse sin notas.
    expect(ed({ ...COBRO_3400, notas: "algo" }, { notas: "" })).toEqual({});
  });

  it("fecha vacía o inválida", () => {
    expect(ed(COBRO_3400, { fecha_cobro: "" }).fecha_cobro).toBe("Pon la fecha del cobro.");
    expect(ed(COBRO_3400, { fecha_cobro: "2026-13-45" }).fecha_cobro).toBe("Pon la fecha del cobro.");
  });
});

describe("textos de la ficha y de la confirmación", () => {
  it("subtítulo: día Cancún, monto con moneda y quién lo registró", () => {
    expect(descripcionFichaEdicion(COBRO_17SEP, "Registró: Itzi")).toBe(
      "Cobro del 17 sep 2026 · $68,205.55 MXN · Registró: Itzi. Solo se guarda lo que cambies y antes de guardar verás el antes y el después.",
    );
    expect(descripcionFichaEdicion(COBRO_3400, null)).toBe(
      "Cobro del 15 sep 2026 · $3,400 MXN. Solo se guarda lo que cambies y antes de guardar verás el antes y el después.",
    );
  });

  it("confirmación: qué cobro y de qué vuelo", () => {
    expect(descripcionConfirmarEdicion(COBRO_17SEP, 315)).toBe(
      "Cobro del 17 sep 2026 · vuelo #315. Esto es lo que cambia:",
    );
    expect(descripcionConfirmarEdicion({ ...COBRO_3400, monto: "-1" }, null)).toBe(
      "Reembolso del 15 sep 2026. Esto es lo que cambia:",
    );
  });

  it("solo lectura: el dinero guardado con su moneda (y el T.C. cuando va bloqueado)", () => {
    expect(datosSoloLecturaCobro(COBRO_3400)).toEqual([]);
    expect(datosSoloLecturaCobro({ ...COBRO_17SEP, conciliado: true })).toEqual([
      { etiqueta: "Monto", valor: "$68,205.55 MXN" },
      { etiqueta: "Método", valor: "Link de pago (Paywise)" },
      { etiqueta: "Cuenta", valor: "Paywise" },
      { etiqueta: "Comisión del banco", valor: "$6,040.97 MXN" },
      { etiqueta: "Tipo de cambio", valor: "17.35" },
    ]);
    // Anticipo: el T.C. se corrige, así que no va en el recuadro.
    const a = datosSoloLecturaCobro({ ...COBRO_3400, anticipo: { ingreso_id: "i", etiqueta: "ING-3" } });
    expect(a.map((f) => f.etiqueta)).toEqual(["Monto", "Método", "Cuenta", "Comisión del banco"]);
  });

  it("nombre accesible del botón con el monto", () => {
    expect(etiquetaBotonEditarCobro(COBRO_17SEP)).toBe("Editar cobro de $68,205.55 MXN");
  });
});

describe("errores del API en es-MX", () => {
  it("reglas de dinero del API (ya en español): tal cual", () => {
    const conciliado =
      "Este cobro está conciliado con un movimiento bancario. Desvincúlalo primero en Conciliación.";
    expect(mensajeErrorEdicionCobro({ code: "CONFLICT", error: conciliado })).toBe(conciliado);
    const reembolso =
      "Este movimiento es un reembolso: no se corrige su dinero — elimínalo y recaptúralo con el monto correcto.";
    expect(mensajeErrorEdicionCobro({ code: "BAD_REQUEST", error: reembolso })).toBe(reembolso);
    const grupo = "Este cobro es parte del sobre del grupo G-12: edítalo o elimínalo desde el grupo (Cobros del grupo).";
    expect(mensajeErrorEdicionCobro({ code: "COBRO_DE_GRUPO", error: grupo })).toBe(grupo);
  });

  it("lo técnico se traduce", () => {
    expect(mensajeErrorEdicionCobro({ code: "NOT_FOUND", error: "Cobro x not found" })).toBe(
      "Este cobro ya no existe (alguien lo eliminó). Recarga la página.",
    );
    expect(mensajeErrorEdicionCobro({ code: "FORBIDDEN", error: "Forbidden resource" })).toBe(
      "Solo administración y facturación pueden corregir cobros.",
    );
    expect(mensajeErrorEdicionCobro({ code: "BAD_REQUEST", error: "monto must not be less than 0.01" })).toBe(
      "No se pudo guardar la corrección del cobro. Revisa los datos e inténtalo de nuevo.",
    );
    expect(mensajeErrorEdicionCobro({ code: "BAD_REQUEST", error: "property foo should not exist" })).toContain(
      "falta actualizar el API",
    );
    expect(mensajeErrorEdicionCobro({ code: "PARSE_ERROR", error: "Bad Gateway" })).toContain(
      "la corrección NO se guardó",
    );
    expect(mensajeErrorEdicionCobro({})).toBe(
      "No se pudo guardar la corrección del cobro. Revisa los datos e inténtalo de nuevo.",
    );
  });
});

describe("numeroDe", () => {
  it("vacío/null/NaN ⇒ null; número o texto numérico ⇒ número", () => {
    expect(numeroDe("")).toBeNull();
    expect(numeroDe("  ")).toBeNull();
    expect(numeroDe(null)).toBeNull();
    expect(numeroDe(undefined)).toBeNull();
    expect(numeroDe("abc")).toBeNull();
    expect(numeroDe("68205.55")).toBe(68205.55);
    expect(numeroDe(0)).toBe(0);
  });
});

describe("UN COBRO, VARIOS ABONOS (API 0.0.78): el candado es «ligado al banco»", () => {
  // El cobro de $3,400 de la #315 con UN abono de $1,700: `conciliado` ya es
  // CUBIERTO (false), pero tiene abonos ⇒ su dinero sigue bloqueado.
  const PARCIAL: FlightCobro = {
    ...COBRO_3400,
    conciliado: false,
    conciliado_via: "DIRECTO",
    conciliacion_estado: "PARCIAL",
    ligado_banco: true,
    neto_banco: 3400,
    monto_vinculado: 1700,
    faltante: 1700,
    sobrante: 0,
  };

  it("un PARCIAL (ligado_banco true, conciliado false) bloquea el dinero con el texto del parcial", () => {
    const e = edicionDeCobro(PARCIAL);
    expect(e).toMatchObject({ ofrecer: true, dineroBloqueado: true, tcBloqueado: true, motivo: "CONCILIADO" });
    expect(e.explicacion).toBe(
      "Está conciliado PARCIAL con el banco ($1,700 MXN de $3,400 MXN): su dinero (monto, moneda, método, T.C., comisión y cuenta) no se corrige mientras tenga abonos ligados. Si está mal, desvincúlalos primero en Conciliación. Aquí puedes corregir la fecha, la referencia y las notas.",
    );
    expect(tituloBotonEditarCobro(PARCIAL)).toBe(
      "Corregir este cobro: está conciliado (parcial) con el banco, solo fecha, referencia y notas",
    );
    expect(datosSoloLecturaCobro(PARCIAL).map((f) => f.etiqueta)).toContain("Monto");
  });

  it("conciliado con 2 abonos: «desvincúlalos»; con uno, el texto de siempre", () => {
    const abono = {
      movimiento_id: "m-1",
      fecha: "2026-09-15",
      monto_parte: 1700,
      monto_abono: 1700,
      cobros_n: 1,
      cuenta_bancaria_id: null,
      cuenta_alias: "EJE SCOTIA",
      pasarela: false,
    };
    const dos = edicionDeCobro({
      ...PARCIAL,
      conciliado: true,
      conciliacion_estado: "CONCILIADO",
      abonos_banco: [abono, { ...abono, movimiento_id: "m-2" }],
    });
    expect(dos.explicacion).toContain("Está conciliado con 2 abonos del banco");
    expect(dos.explicacion).toContain("desvincúlalos primero en Conciliación");
    const uno = edicionDeCobro({ ...PARCIAL, conciliado: true, conciliacion_estado: "CONCILIADO", abonos_banco: [abono] });
    expect(uno.explicacion).toBe(
      "Está conciliado con un movimiento del banco: su dinero (monto, moneda, método, T.C., comisión y cuenta) no se corrige mientras siga ligado. Si está mal, desvincúlalo primero en Conciliación. Aquí puedes corregir la fecha, la referencia y las notas.",
    );
    expect(tituloBotonEditarCobro({ ...PARCIAL, conciliacion_estado: "CONCILIADO" })).toBe(
      "Corregir este cobro: está conciliado con el banco, solo fecha, referencia y notas",
    );
  });

  it("`ligado_banco` manda sobre `conciliado`: sin abonos se corrige; vía anticipo sigue siendo anticipo", () => {
    expect(edicionDeCobro({ ...COBRO_3400, conciliado: false, conciliacion_estado: "SIN_CONCILIAR", ligado_banco: false }))
      .toMatchObject({ dineroBloqueado: false, motivo: null });
    const anticipo = edicionDeCobro({
      ...COBRO_3400,
      anticipo: { ingreso_id: "i-1", etiqueta: "ING-12" },
      conciliado: true,
      conciliado_via: "ANTICIPO",
      conciliacion_estado: "VIA_ANTICIPO",
      ligado_banco: false,
    });
    expect(anticipo).toMatchObject({ dineroBloqueado: true, tcBloqueado: false, motivo: "ANTICIPO" });
  });

  it("API previo (sin `ligado_banco`): `conciliado` de siempre", () => {
    expect(edicionDeCobro({ ...COBRO_3400, conciliado: true }).motivo).toBe("CONCILIADO");
    expect(edicionDeCobro({ ...COBRO_3400, conciliado: false }).motivo).toBeNull();
  });

  it("el 409 COBRO_CONCILIADO del API se pinta TAL CUAL; sin texto, el genérico del API", () => {
    const parcial =
      "Este cobro está conciliado PARCIAL con el banco ($1,700.00 MXN de $3,400.00 MXN, abono del 15 sep). Para cambiar su monto, moneda, tipo de cambio o comisión, o para eliminarlo, primero desvincula ese abono en Conciliación.";
    expect(mensajeErrorEdicionCobro({ code: "COBRO_CONCILIADO", error: parcial })).toBe(parcial);
    expect(mensajeErrorEdicionCobro({ code: "COBRO_CONCILIADO", error: "" })).toBe(MSG_COBRO_CONCILIADO);
    // Un API previo (409 de texto, code genérico) sigue igual.
    const viejo = "Este cobro está conciliado con un movimiento bancario. Desvincúlalo primero en Conciliación.";
    expect(mensajeErrorEdicionCobro({ code: "CONFLICTEXCEPTION", error: viejo })).toBe(viejo);
  });

  it("paridad: el genérico es el `mensajeCobroConciliado()` del API (si el repo hermano ya trae el 0.0.78)", () => {
    const raiz = path.resolve(__dirname, "../../../../../vuelatour-api/src");
    if (!existsSync(path.join(raiz, "common/cobro-banco.util.ts"))) return;
    const src = readFileSync(path.join(raiz, "modules/conciliacion/cobros-lote.util.ts"), "utf8");
    expect(src).toContain(MSG_COBRO_CONCILIADO);
  });
});

describe("FACTURAS POR COBRO (16-oct-2026, API 0.0.82): la factura entra al diff fuera del candado de dinero", () => {
  const A0420 = { id: "f-0420", etiqueta: "A-0420" };
  const A0455 = { id: "f-0455", etiqueta: "A-0455" };
  const CON_LLAVE: FlightCobro = { ...COBRO_3400, factura_emitida: null };

  it("— → A-0420: viaja el id y la línea dice la etiqueta", () => {
    const r = cambiosDeCobro(
      CON_LLAVE,
      formularioDesdeCobro(CON_LLAVE),
      valoresDe(CON_LLAVE, { factura_emitida_id: "f-0420" }),
      edicionDeCobro(CON_LLAVE),
      { facturas: [A0420, A0455] },
    );
    expect(r.patch).toEqual({ factura_emitida_id: "f-0420" });
    expect(r.lineas).toEqual([{ campo: "factura_emitida", etiqueta: "Factura", antes: "—", despues: "A-0420" }]);
    expect(r.hayCambios).toBe(true);
    // Clasificación, no dinero: la confirmación no anuncia recálculo.
    expect(r.tocaDinero).toBe(false);
  });

  it("A-0420 → sin factura: viaja null", () => {
    const c: FlightCobro = { ...COBRO_3400, factura_emitida: A0420 };
    const r = cambiosDeCobro(c, formularioDesdeCobro(c), valoresDe(c, { factura_emitida_id: "" }), edicionDeCobro(c), {
      facturas: [A0420],
    });
    expect(r.patch).toEqual({ factura_emitida_id: null });
    expect(r.lineas[0]).toEqual({ campo: "factura_emitida", etiqueta: "Factura", antes: "A-0420", despues: "sin factura" });
  });

  it("sin cambio ⇒ sin la llave; selector no pintado (undefined) ⇒ nunca entra; API previo (sin `factura_emitida`) ⇒ nunca entra", () => {
    const c: FlightCobro = { ...COBRO_3400, factura_emitida: A0420 };
    expect(cambiosDeCobro(c, formularioDesdeCobro(c), valoresDe(c, { factura_emitida_id: "f-0420" }), edicionDeCobro(c)).patch).toEqual({});
    expect(cambiosDeCobro(c, formularioDesdeCobro(c), valoresDe(c, {}), edicionDeCobro(c)).patch).toEqual({});
    const viejo = COBRO_3400; // sin la llave
    expect("factura_emitida" in viejo).toBe(false);
    expect(cambiosDeCobro(viejo, formularioDesdeCobro(viejo), valoresDe(viejo, { factura_emitida_id: "f-0420" }), edicionDeCobro(viejo)).patch).toEqual({});
  });

  it("NUNCA la bloquea `dineroBloqueado`: conciliado (parcial o completo) y anticipo cambian de factura (revisión #16)", () => {
    const conciliado: FlightCobro = { ...COBRO_3400, factura_emitida: null, ligado_banco: true, conciliacion_estado: "PARCIAL" };
    const anticipo: FlightCobro = {
      ...COBRO_3400,
      factura_emitida: null,
      anticipo: { ingreso_id: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d", etiqueta: "ING-12" },
    };
    for (const c of [conciliado, anticipo]) {
      const e = edicionDeCobro(c);
      expect(e.dineroBloqueado).toBe(true);
      const r = cambiosDeCobro(c, formularioDesdeCobro(c), valoresDe(c, { factura_emitida_id: "f-0455" }), e, { facturas: [A0455] });
      expect(r.patch).toEqual({ factura_emitida_id: "f-0455" });
      expect(r.tocaDinero).toBe(false);
    }
  });

  it("errores de la liga (API 0.0.82) salen por la fuente única", () => {
    expect(mensajeErrorEdicionCobro({ code: "FACTURA_NO_VIGENTE", error: "" })).toContain("ya no está vigente");
    expect(mensajeErrorEdicionCobro({ code: "FACTURA_NO_LIGADA_AL_VUELO", error: "", details: { folio: 332 } })).toContain("#332");
    expect(mensajeErrorEdicionCobro({ code: "COBRO_FACTURA_NO_DISPONIBLE", error: "Service Unavailable" })).toContain("20261016000001");
    expect(mensajeErrorEdicionCobro({ code: "REEMBOLSO_SIN_FACTURA", error: "Un reembolso no se liga a una factura." })).toBe(
      "Un reembolso no se liga a una factura.",
    );
  });
});
