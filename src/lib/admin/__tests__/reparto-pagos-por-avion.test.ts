/**
 * PAGOS A SOCIOS: EL SALDO SE LLEVA POR AVIÓN (10-nov-2026, API 0.0.134) —
 * la parte PURA (`lib/admin/reparto-pagos.ts`).
 *
 * Pedido del cliente con la cuenta de Mauricio Roque (N4142R 69 % y XB-ANU
 * 70 %): «está mezclado todos los aviones que tenga un socio en su cuenta;
 * debería ser, dentro de la cuenta del socio, un balance para cada avión,
 * porque las entregas son por avión… lo mete todo en la misma licuadora».
 *
 * El API manda la cuenta separada (`por_avion` + `cuenta_por_avion`, todo
 * ADITIVO). Aquí se custodia que el panel:
 *  1. deje pasar el aditivo con tipos sanos y, ante basura, lo dé por
 *     AUSENTE (todo o nada: media cuenta por avión sería una cifra falsa);
 *  2. sin el aditivo no cambie NADA (mismas formas de siempre);
 *  3. nombre el saldo de cada avión: «Por entregar» · «Al corriente» ·
 *     «Adelantado» · «Pérdida acumulada» (negativo SIN entregas);
 *  4. lleve los saldos por avión al diálogo y, en una cuenta por avión,
 *     EXIJA el avión en el alta, diga su saldo y proponga como monto lo por
 *     entregar de ESE avión (jamás el total mezclado);
 *  5. nombre el avión en la confirmación del ADELANTO (`details.aeronave`).
 * Ningún número se calcula aquí: todos son los del API.
 */
import { describe, expect, it } from "vitest";
import {
  AVION_SIN_ELEGIR,
  AYUDA_PERDIDA_ACUMULADA,
  AYUDA_SECCION_GENERAL,
  CLAVE_SECCION_GENERAL,
  ERROR_AVION_SIN_ELEGIR,
  ETIQUETA_SIN_AVION_GENERAL,
  NOTA_TOTALES_CUENTA_POR_AVION,
  SIN_AVION,
  TEXTO_CUENTA_POR_AVION,
  TEXTO_SIN_MOVIMIENTOS_CUENTA,
  TITULO_SECCION_GENERAL,
  ayudaAvionEntrega,
  ayudaMesEntrega,
  cambiosPago,
  claveSeccionAvion,
  confirmacionAdelanto,
  contextoEntrega,
  contextoEntregaDeEstadoCuenta,
  desgloseSaldosPorAvion,
  detalleExcesoSaldo,
  etiquetaCampoAvion,
  formAlCambiarAvion,
  formAlCambiarMoneda,
  formDePago,
  formInicialAlta,
  hintMontoPago,
  montoPrellenadoAlta,
  nombreSeccionAvion,
  normalizarEstadoCuenta,
  normalizarPago,
  normalizarRespuestaSocios,
  normalizarResumen,
  opcionesCorrespondeAvion,
  payloadAltaPago,
  placeholderCampoAvion,
  porEntregarParaPrellenar,
  saldoDeAvionElegido,
  saldoDeSeccionAvion,
  saldosPorAvion,
  saldosPorAvionDeContexto,
  textoRangoSeccion,
  textoSaldoDeSeccion,
  textoSaldoTrasEntrega,
  tituloSeccionAvion,
  validarFormPago,
  type ContextoEntrega,
} from "../reparto-pagos";
import {
  ALE,
  ENTREGA_GENERAL,
  ENTREGA_OCT,
  ENTREGA_OCT_ID,
  MAURICIO,
  N4142R,
  XBANU,
  estadoCuentaConGeneral,
  estadoCuentaPorAvion,
  estadoCuentaPorAvionNoviembre,
  estadoCuentaPorAvionSeptiembre,
  resumenAntesDeLaEntrega,
  resumenConGeneral,
  resumenPorAvion,
  sinAditivo,
} from "@/components/admin/profit-sharing/__tests__/cuenta-por-avion.fixtures";
import type { SaldoAvionCuenta } from "@/types/reparto-pagos";

const resumen = (raw: Record<string, unknown>) => {
  const r = normalizarResumen(raw);
  if (!r) throw new Error("el resumen de la fixture no se pudo normalizar");
  return r;
};
const estado = (raw: Record<string, unknown>) => {
  const e = normalizarEstadoCuenta(raw);
  if (!e) throw new Error("el estado de cuenta de la fixture no se pudo normalizar");
  return e;
};
const ctx = (raw: Record<string, unknown>, avionSugerido: string | null = null): ContextoEntrega =>
  contextoEntrega(resumen(raw), { mesEnCurso: "2026-11", avionSugerido });

const saldo = (over: Partial<SaldoAvionCuenta> = {}): SaldoAvionCuenta => ({
  aeronave: { id: N4142R, matricula: "N4142R" },
  porcentaje: 69,
  generado_mxn: 0,
  mes_en_curso_mxn: 0,
  entregado_mxn: 0,
  por_entregar_mxn: 0,
  por_entregar_cerrado_mxn: 0,
  estado: "",
  ...over,
});

describe("normalización: el aditivo `por_avion` + `cuenta_por_avion` pasa con tipos sanos", () => {
  it("resumen: los saldos de cada avión tal cual (el caso real), en el orden del API", () => {
    const r = resumen(resumenPorAvion());
    expect(r.cuenta_por_avion).toBe(true);
    expect(r.por_avion).toEqual([
      {
        aeronave: { id: N4142R, matricula: "N4142R" },
        porcentaje: 69,
        generado_mxn: 360678.28,
        mes_en_curso_mxn: 19002.73,
        entregado_mxn: 341879.57,
        por_entregar_mxn: 18798.71,
        por_entregar_cerrado_mxn: -204.02,
        estado: "POR_ENTREGAR",
      },
      {
        aeronave: { id: XBANU, matricula: "XB-ANU" },
        porcentaje: 70,
        generado_mxn: -3862.6,
        mes_en_curso_mxn: 0,
        entregado_mxn: 0,
        por_entregar_mxn: -3862.6,
        por_entregar_cerrado_mxn: -3862.6,
        estado: "ADELANTADO",
      },
    ]);
    // Los totales del socio no se tocan (son la suma, y la suma es del API).
    expect(r).toMatchObject({ generado_mxn: 356815.68, entregado_mxn: 341879.57, por_entregar_mxn: 14936.11 });
    // Viaja igual dentro de la lista y en el `cuenta` de las escrituras.
    const lista = normalizarRespuestaSocios({ disponible: true, hasta_mes: "2026-11", socios: [resumenPorAvion()], totales: null });
    expect(lista?.socios[0].por_avion).toHaveLength(2);
  });

  it("`numeric` como texto (PostgREST) y la sección «a cuenta general» (`aeronave: null`) al final", () => {
    const r = resumen({
      ...resumenConGeneral(),
      por_avion: [
        {
          aeronave: { id: N4142R, matricula: "N4142R" },
          porcentaje: "69",
          generado_mxn: "360678.28",
          mes_en_curso_mxn: "19002.73",
          entregado_mxn: "238265.53",
          por_entregar_mxn: "122412.75",
          por_entregar_cerrado_mxn: "103410.02",
          estado: "POR_ENTREGAR",
        },
        ...((resumenConGeneral().por_avion as unknown[]).slice(1)),
      ],
    });
    expect(r.por_avion?.[0]).toMatchObject({ porcentaje: 69, por_entregar_mxn: 122412.75, por_entregar_cerrado_mxn: 103410.02 });
    expect(r.por_avion?.[2]).toEqual({
      aeronave: null,
      porcentaje: null,
      generado_mxn: 0,
      mes_en_curso_mxn: 0,
      entregado_mxn: 3000,
      por_entregar_mxn: -3000,
      por_entregar_cerrado_mxn: -3000,
      estado: "ADELANTADO",
    });
  });

  it("estado de cuenta: cada sección con SUS movimientos (normalizados como los de la raíz) y su rango", () => {
    const e = estado(estadoCuentaPorAvion());
    expect(e.cuenta_por_avion).toBe(true);
    expect(e.por_avion?.map((s) => s.aeronave?.matricula)).toEqual(["N4142R", "XB-ANU"]);
    const [n, anu] = e.por_avion ?? [];
    // El saldo corrido de CADA avión (no el mezclado).
    expect(n.movimientos.map((m) => [m.tipo, m.saldo_mxn])).toEqual([
      ["UTILIDAD", 232547.75],
      ["ENTREGA", -5717.78],
      ["UTILIDAD", 103410.02],
      ["ENTREGA", -204.02],
      ["UTILIDAD", 18798.71],
    ]);
    expect(anu.movimientos.map((m) => [m.tipo, m.saldo_mxn])).toEqual([["UTILIDAD", -3862.6]]);
    expect(n).toMatchObject({
      generado_mxn: 360678.28,
      mes_en_curso_mxn: 19002.73,
      entregado_mxn: 341879.57,
      por_entregar_mxn: 18798.71,
      por_entregar_cerrado_mxn: -204.02,
      saldo_anterior_mxn: 0,
      rango: { generado_mxn: 360678.28, entregado_mxn: 341879.57, saldo_final_mxn: 18798.71 },
    });
    // La entrega viaja completa (Editar / Eliminar / comprobante la necesitan).
    expect(n.movimientos[3].pago).toMatchObject({ id: ENTREGA_OCT_ID, aeronave_id: N4142R, monto_mxn: 103614.04, mes: "2026-10" });
    expect(n.movimientos[4].en_curso).toBe(true);
    // La lista MEZCLADA de siempre sigue viajando igual (es la que se dejó de pintar).
    expect(e.movimientos.map((m) => m.saldo_mxn)).toEqual([0, 232547.75, -5717.78, 103410.02, 99547.42, -4066.62, 14936.11]);
  });

  it("estado de cuenta: `numeric` como texto en una sección, un movimiento sin `tipo` se descarta (como en la raíz) y sin `rango` queda null", () => {
    const raw = estadoCuentaPorAvion();
    const secciones = raw.por_avion as Record<string, unknown>[];
    const e = estado({
      ...raw,
      por_avion: [
        {
          ...secciones[0],
          saldo_anterior_mxn: "0",
          rango: undefined,
          movimientos: [
            { fecha: "2026-09-30T00:00:00", tipo: "UTILIDAD", concepto: "Utilidad sep 2026 · N4142R 69 %", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: "69", cargo_mxn: "232547.75", abono_mxn: 0, saldo_mxn: "232547.75" },
            { sin: "tipo" },
          ],
        },
        secciones[1],
      ],
    });
    const n = e.por_avion?.[0];
    expect(n?.movimientos).toEqual([
      {
        fecha: "2026-09-30",
        tipo: "UTILIDAD",
        concepto: "Utilidad sep 2026 · N4142R 69 %",
        mes: "2026-09",
        aeronave: { id: N4142R, matricula: "N4142R" },
        porcentaje: 69,
        cargo_mxn: 232547.75,
        abono_mxn: 0,
        saldo_mxn: 232547.75,
        en_curso: false,
        pago: null,
      },
    ]);
    expect(n?.rango).toBeNull();
    expect(textoRangoSeccion(n!)).toBeNull();
  });

  it("con filtro de meses cada sección abre con SU «Saldo al cierre» (renglón SALDO_ANTERIOR del avión)", () => {
    const e = estado(estadoCuentaPorAvionNoviembre());
    const [n, anu] = e.por_avion ?? [];
    expect(n.saldo_anterior_mxn).toBe(103410.02);
    expect(n.movimientos.map((m) => [m.tipo, m.saldo_mxn])).toEqual([
      ["SALDO_ANTERIOR", 103410.02],
      ["ENTREGA", -204.02],
      ["UTILIDAD", 18798.71],
    ]);
    expect(n.movimientos[0]).toMatchObject({ concepto: "Saldo al cierre de oct 2026", aeronave: { id: N4142R, matricula: "N4142R" } });
    expect(n.rango).toEqual({ generado_mxn: 19002.73, entregado_mxn: 103614.04, saldo_final_mxn: 18798.71 });
    // Los totales de la sección son los de TODA la cuenta, no los del rango.
    expect(n.por_entregar_mxn).toBe(18798.71);
    expect(anu.movimientos.map((m) => m.tipo)).toEqual(["SALDO_ANTERIOR"]);
    // Un avión sin nada en el rango llega con la lista vacía (no se inventa un renglón).
    expect(estado(estadoCuentaPorAvionSeptiembre()).por_avion?.[1].movimientos).toEqual([]);
  });
});

describe("normalización: sin el aditivo, o con basura, la cuenta es LA DE SIEMPRE", () => {
  it("API previo (sin las llaves): ni `por_avion` ni `cuenta_por_avion` — la misma forma de siempre", () => {
    const r = resumen(sinAditivo(resumenPorAvion()));
    expect("por_avion" in r).toBe(false);
    expect("cuenta_por_avion" in r).toBe(false);
    expect(saldosPorAvion(r)).toBeNull();
    const e = estado(sinAditivo(estadoCuentaPorAvion()));
    expect("por_avion" in e).toBe(false);
    expect("cuenta_por_avion" in e).toBe(false);
    expect(saldosPorAvion(e)).toBeNull();
    // Lo demás no se movió ni un dato.
    expect(e.movimientos).toHaveLength(7);
    expect(e.totales.por_entregar_mxn).toBe(14936.11);
  });

  it("cuenta de UN avión: el API manda `por_avion` con una sección y `cuenta_por_avion: false` ⇒ no es por avión", () => {
    const unAvion = { ...resumenPorAvion(), por_avion: [(resumenPorAvion().por_avion as unknown[])[0]], cuenta_por_avion: false };
    const r = resumen(unAvion);
    expect(r.cuenta_por_avion).toBe(false);
    expect(r.por_avion).toHaveLength(1);
    expect(saldosPorAvion(r)).toBeNull();
    expect(desgloseSaldosPorAvion(r)).toBeNull();
    expect(contextoEntrega(r)).not.toHaveProperty("cuentaPorAvion");
    expect(contextoEntrega(r)).not.toHaveProperty("porAvion");
  });

  it("TODO O NADA: una sola sección ilegible tira el aditivo completo (media cuenta por avión sería una cifra falsa)", () => {
    const [n, anu] = resumenPorAvion().por_avion as Record<string, unknown>[];
    const casos: Record<string, unknown> = {
      "no es una lista": { 0: n },
      "una sección que no es objeto": [n, "XB-ANU"],
      "un saldo que no es número": [n, { ...anu, por_entregar_mxn: "mucho" }],
      "un saldo ausente": [n, { ...anu, por_entregar_cerrado_mxn: undefined }],
      "un saldo null (no se inventa un $0)": [{ ...n, entregado_mxn: null }, anu],
      "un saldo vacío": [{ ...n, generado_mxn: "" }, anu],
      "un avión que no es ni null ni {id}": [n, { ...anu, aeronave: "XB-ANU" }],
      "sin la llave del avión (no se asume «general»)": [n, { ...anu, aeronave: undefined }],
      "el mismo avión dos veces": [n, { ...anu, aeronave: n.aeronave }],
      "dos secciones generales": [n, { ...anu, aeronave: null }, { ...anu, aeronave: null }],
    };
    for (const [nombre, porAvion] of Object.entries(casos)) {
      const r = resumen({ ...resumenPorAvion(), por_avion: porAvion });
      expect("por_avion" in r, nombre).toBe(false);
      expect("cuenta_por_avion" in r, nombre).toBe(false);
      expect(saldosPorAvion(r), nombre).toBeNull();
      // Y queda idéntico al renglón de un API previo.
      expect(r, nombre).toEqual(resumen(sinAditivo(resumenPorAvion())));
    }
  });

  it("estado de cuenta: una sección sin su lista de movimientos también tira el aditivo completo", () => {
    const secciones = estadoCuentaPorAvion().por_avion as Record<string, unknown>[];
    for (const movimientos of [undefined, null, "ninguno", {}]) {
      const e = estado({ ...estadoCuentaPorAvion(), por_avion: [secciones[0], { ...secciones[1], movimientos }] });
      expect(saldosPorAvion(e)).toBeNull();
      expect(e).toEqual(estado(sinAditivo(estadoCuentaPorAvion())));
    }
  });

  it("la bandera manda: sin `cuenta_por_avion === true` no hay cuenta por avión aunque lleguen las secciones", () => {
    for (const bandera of [undefined, null, false, "true", 1]) {
      const r = resumen({ ...resumenPorAvion(), cuenta_por_avion: bandera });
      expect(r.cuenta_por_avion, String(bandera)).toBe(false);
      expect(saldosPorAvion(r), String(bandera)).toBeNull();
    }
    // Y al revés: la bandera sin secciones que pintar tampoco.
    const vacia = resumen({ ...resumenPorAvion(), por_avion: [] });
    expect(vacia.cuenta_por_avion).toBe(false);
    expect(saldosPorAvion(vacia)).toBeNull();
    expect(saldosPorAvion(null)).toBeNull();
    expect(saldosPorAvion({ cuenta_por_avion: true })).toBeNull();
    expect(saldosPorAvion({ cuenta_por_avion: true, por_avion: [] })).toBeNull();
  });
});

describe("cómo se llama el saldo de un avión", () => {
  it("el caso real: N4142R «Por entregar» $18,798.71; XB-ANU «Pérdida acumulada» $3,862.60 (sin signo y con su ayuda)", () => {
    const [n, anu] = resumen(resumenPorAvion()).por_avion ?? [];
    expect(saldoDeSeccionAvion(n)).toEqual({
      clave: "POR_ENTREGAR",
      etiqueta: "Por entregar",
      monto: 18798.71,
      clase: "text-amber-700 dark:text-amber-400",
      ayuda: null,
    });
    expect(saldoDeSeccionAvion(anu)).toEqual({
      clave: "PERDIDA",
      etiqueta: "Pérdida acumulada",
      monto: 3862.6,
      // El color del saldo de siempre: azul en negativo.
      clase: "text-sky-700 dark:text-sky-300",
      ayuda: "Se descuenta de las próximas utilidades de este avión; no es dinero entregado.",
    });
    expect(AYUDA_PERDIDA_ACUMULADA).toBe("Se descuenta de las próximas utilidades de este avión; no es dinero entregado.");
  });

  it("la regla: > $1 por entregar · |saldo| ≤ $1 al corriente · < −$1 con entregas adelantado · < −$1 SIN entregas pérdida", () => {
    const clave = (por_entregar_mxn: number, entregado_mxn: number) =>
      saldoDeSeccionAvion(saldo({ por_entregar_mxn, entregado_mxn })).clave;
    expect(clave(1.01, 0)).toBe("POR_ENTREGAR");
    expect(clave(1, 500)).toBe("AL_CORRIENTE");
    expect(clave(0, 0)).toBe("AL_CORRIENTE");
    expect(clave(-1, 500)).toBe("AL_CORRIENTE");
    expect(clave(-1.01, 500)).toBe("ADELANTADO");
    expect(clave(-1.01, 0.01)).toBe("ADELANTADO");
    expect(clave(-1.01, 0)).toBe("PERDIDA");
    // Adelantado: el monto va SIN signo (lo dice la etiqueta), en azul y sin ayuda.
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: -204.02, entregado_mxn: 341879.57 }))).toEqual({
      clave: "ADELANTADO",
      etiqueta: "Adelantado",
      monto: 204.02,
      clase: "text-sky-700 dark:text-sky-300",
      ayuda: null,
    });
    // Al corriente: el saldo tal cual y sin color.
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: 0.4, entregado_mxn: 10 }))).toMatchObject({
      etiqueta: "Al corriente",
      monto: 0.4,
      clase: "",
    });
  });

  it("el estado del API manda (misma tolerancia); uno que el panel no conoce se pinta con el espejo", () => {
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: 500, estado: "POR_ENTREGAR" })).clave).toBe("POR_ENTREGAR");
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: -500, entregado_mxn: 0, estado: "ADELANTADO" })).clave).toBe("PERDIDA");
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: -500, entregado_mxn: 0, estado: "ALGO_NUEVO" })).clave).toBe("PERDIDA");
    expect(saldoDeSeccionAvion(saldo({ por_entregar_mxn: 500, estado: "" })).clave).toBe("POR_ENTREGAR");
  });

  it("«a cuenta general» no tiene utilidades: en negativo es SIEMPRE un adelanto (el saldo inicial ya adelantado), nunca una pérdida", () => {
    const general = saldo({ aeronave: null, porcentaje: null, por_entregar_mxn: -10000, entregado_mxn: 0, estado: "ADELANTADO" });
    expect(saldoDeSeccionAvion(general)).toMatchObject({ clave: "ADELANTADO", etiqueta: "Adelantado", monto: 10000, ayuda: null });
    expect(saldoDeSeccionAvion({ ...general, por_entregar_mxn: 8000, estado: "POR_ENTREGAR" }).etiqueta).toBe("Por entregar");
  });

  it("títulos y nombres de la sección: «N4142R · 69 %», «A cuenta general (sin avión)»", () => {
    const [n, anu, general] = resumen(resumenConGeneral()).por_avion ?? [];
    expect(tituloSeccionAvion(n)).toBe("N4142R · 69 %");
    expect(tituloSeccionAvion(anu)).toBe("XB-ANU · 70 %");
    expect(tituloSeccionAvion(general)).toBe("A cuenta general (sin avión)");
    expect(TITULO_SECCION_GENERAL).toBe("A cuenta general (sin avión)");
    expect(tituloSeccionAvion(saldo({ porcentaje: 33.3333 }))).toBe("N4142R · 33.333 %");
    // Un avión en el que ya no es socio llega sin porcentaje: solo la matrícula.
    expect(tituloSeccionAvion(saldo({ porcentaje: null }))).toBe("N4142R");
    expect(tituloSeccionAvion(saldo({ aeronave: { id: N4142R, matricula: " " } }))).toBe("(sin matrícula) · 69 %");
    expect([n, anu, general].map(nombreSeccionAvion)).toEqual(["N4142R", "XB-ANU", "Cuenta general"]);
    expect([n, anu, general].map(claveSeccionAvion)).toEqual([N4142R, XBANU, "general"]);
    expect(CLAVE_SECCION_GENERAL).toBe("general");
  });

  it("el saldo en una línea (tooltip de la lista y paso «Entrega registrada»)", () => {
    const [n, anu, general] = resumen(resumenConGeneral()).por_avion ?? [];
    expect(textoSaldoDeSeccion(n)).toBe("N4142R · Por entregar: $122,412.75 MXN");
    expect(textoSaldoDeSeccion(anu)).toBe(
      "XB-ANU · Pérdida acumulada: $3,862.60 MXN. Se descuenta de las próximas utilidades de este avión; no es dinero entregado.",
    );
    expect(textoSaldoDeSeccion(general)).toBe("Cuenta general · Adelantado: $3,000.00 MXN");
    expect(textoSaldoDeSeccion(saldo({ por_entregar_mxn: 0 }))).toBe("N4142R · Al corriente");
  });

  it("desglose corto de la lista: «N4142R $18,798.71 MXN · XB-ANU -$3,862.60 MXN», con el color del saldo de siempre", () => {
    expect(desgloseSaldosPorAvion(resumen(resumenPorAvion()))).toEqual([
      {
        clave: N4142R,
        nombre: "N4142R",
        monto: "$18,798.71 MXN",
        clase: "text-amber-700 dark:text-amber-400",
        titulo: "N4142R · Por entregar: $18,798.71 MXN",
      },
      {
        clave: XBANU,
        nombre: "XB-ANU",
        // Con su signo, como la columna.
        monto: "-$3,862.60 MXN",
        clase: "text-sky-700 dark:text-sky-300",
        titulo:
          "XB-ANU · Pérdida acumulada: $3,862.60 MXN. Se descuenta de las próximas utilidades de este avión; no es dinero entregado.",
      },
    ]);
    expect(desgloseSaldosPorAvion(resumen(resumenConGeneral()))?.map((p) => `${p.nombre} ${p.monto}`)).toEqual([
      "N4142R $122,412.75 MXN",
      "XB-ANU -$3,862.60 MXN",
      "Cuenta general -$3,000.00 MXN",
    ]);
    expect(desgloseSaldosPorAvion(resumen(sinAditivo(resumenPorAvion())))).toBeNull();
    expect(desgloseSaldosPorAvion(null)).toBeNull();
  });

  it("textos del estado de cuenta (congelados) y el rango de cada sección con filtro de meses", () => {
    expect(TEXTO_CUENTA_POR_AVION).toBe(
      "La cuenta de este socio se lleva por avión: cada avión tiene su propio saldo y cada entrega descuenta del avión al que corresponde.",
    );
    expect(NOTA_TOTALES_CUENTA_POR_AVION).toBe("Suma de sus aviones; el saldo de cada avión está abajo.");
    expect(AYUDA_SECCION_GENERAL).toBe(
      "Saldo inicial y entregas que no se asignaron a un avión. Para que descuenten del saldo de un avión, asígnaselo con «Editar».",
    );
    expect(TEXTO_SIN_MOVIMIENTOS_CUENTA).toBe("Sin movimientos en estos meses.");
    const [n] = estado(estadoCuentaPorAvionNoviembre()).por_avion ?? [];
    expect(textoRangoSeccion(n)).toBe("En estos meses: generó $19,002.73 MXN · se le entregó $103,614.04 MXN");
    // «A cuenta general» no genera: solo lo entregado.
    const general = estado(estadoCuentaConGeneral()).por_avion?.[2];
    expect(textoRangoSeccion(general!)).toBe("En estos meses: se le entregó $3,000.00 MXN");
  });
});

describe("el diálogo recibe los saldos por avión (contexto)", () => {
  it("desde el resumen y desde el estado de cuenta: `cuentaPorAvion` + `porAvion` (sin los movimientos)", () => {
    const desdeResumen = ctx(resumenPorAvion());
    expect(desdeResumen.cuentaPorAvion).toBe(true);
    expect(desdeResumen.porAvion).toEqual(resumen(resumenPorAvion()).por_avion);
    // Lo de siempre sigue igual: el total del socio y sus aviones.
    expect(desdeResumen).toMatchObject({ porEntregarMxn: 14936.11, mesEnCursoMxn: 19002.73, mesEnCurso: "2026-11" });
    const desdeEstado = contextoEntregaDeEstadoCuenta(estado(estadoCuentaPorAvion()), { mesEnCurso: "2026-11" });
    expect(desdeEstado.cuentaPorAvion).toBe(true);
    // Los MISMOS saldos, sin `movimientos`, `rango` ni `saldo_anterior_mxn`
    // (el contexto viaja al navegador en cada botón).
    expect(desdeEstado.porAvion).toEqual(desdeResumen.porAvion);
    expect(JSON.stringify(desdeEstado)).not.toContain("movimientos");
    expect(saldosPorAvionDeContexto(desdeEstado)).toHaveLength(2);
    expect(saldoDeAvionElegido(desdeEstado, XBANU)?.por_entregar_mxn).toBe(-3862.6);
    expect(saldoDeAvionElegido(desdeEstado, SIN_AVION)).toBeNull();
    expect(saldoDeAvionElegido(desdeEstado, AVION_SIN_ELEGIR)).toBeNull();
  });

  it("cuenta de siempre: el contexto NO trae las llaves (idéntico al de antes)", () => {
    const viejo = ctx(sinAditivo(resumenPorAvion()));
    expect(viejo).toEqual({
      socio: { id: MAURICIO, nombre: "Mauricio Roque" },
      porEntregarMxn: 14936.11,
      mesEnCursoMxn: 19002.73,
      mesEnCurso: "2026-11",
      aviones: resumen(resumenPorAvion()).aviones,
      cuentaDesdeMes: "2026-09",
      mesSugerido: null,
      avionSugerido: null,
    });
    expect(Object.keys(viejo)).not.toContain("cuentaPorAvion");
    expect(saldosPorAvionDeContexto(viejo)).toBeNull();
    const deEstado = contextoEntregaDeEstadoCuenta(estado(sinAditivo(estadoCuentaPorAvion())), { mesEnCurso: "2026-11" });
    expect(Object.keys(deEstado)).not.toContain("porAvion");
  });
});

describe("«Registrar entrega» en una cuenta POR AVIÓN: el avión es obligatorio", () => {
  const base = { hoy: "2026-11-10", meId: ALE.id, tcOficial: 18.45 };

  it("el alta arranca SIN avión elegido (no en «Sin avión») salvo el sugerido; en la cuenta de siempre, «Sin avión» como hasta hoy", () => {
    const porAvion = formInicialAlta({ ...base, porEntregarMxn: null, cuentaPorAvion: true });
    expect(porAvion.aeronave_id).toBe(AVION_SIN_ELEGIR);
    expect(AVION_SIN_ELEGIR).toBe("");
    expect(formInicialAlta({ ...base, porEntregarMxn: null, cuentaPorAvion: true, avionSugerido: N4142R }).aeronave_id).toBe(N4142R);
    expect(formInicialAlta({ ...base, porEntregarMxn: null, cuentaPorAvion: true, avionSugerido: "x" }).aeronave_id).toBe("");
    expect(formInicialAlta({ ...base, porEntregarMxn: 100 }).aeronave_id).toBe(SIN_AVION);
    expect(formInicialAlta({ ...base, porEntregarMxn: 100, cuentaPorAvion: false }).aeronave_id).toBe(SIN_AVION);
  });

  it("validación: sin elegir ⇒ error en es-MX que dice por qué; con un avión o con «Sin avión (a cuenta general)» pasa", () => {
    const form = { ...formInicialAlta({ ...base, porEntregarMxn: null, cuentaPorAvion: true }), monto: "1000", metodo: "TRANSFERENCIA" as const };
    expect(validarFormPago(form, "2026-11-10", { cuentaPorAvion: true })).toEqual({ aeronave_id: ERROR_AVION_SIN_ELEGIR });
    expect(ERROR_AVION_SIN_ELEGIR).toBe(
      "Elige a qué avión corresponde la entrega: en esta cuenta el saldo se lleva por avión. Si no es de ninguno, elige «Sin avión (a cuenta general)».",
    );
    expect(validarFormPago({ ...form, aeronave_id: N4142R }, "2026-11-10", { cuentaPorAvion: true })).toEqual({});
    expect(validarFormPago({ ...form, aeronave_id: SIN_AVION }, "2026-11-10", { cuentaPorAvion: true })).toEqual({});
    // En la cuenta de siempre el texto es el de antes (y ahí «Sin avión» es el valor inicial).
    expect(validarFormPago({ ...form, aeronave_id: "x" }, "2026-11-10").aeronave_id).toBe("Elige el avión o «Sin avión».");
    expect(validarFormPago({ ...form, aeronave_id: SIN_AVION }, "2026-11-10")).toEqual({});
  });

  it("la EDICIÓN no exige nada nuevo: una entrega vieja SIN avión se guarda sin tocar ese campo", () => {
    const pago = normalizarPago(ENTREGA_GENERAL)!;
    const form = formDePago(pago);
    expect(form.aeronave_id).toBe(SIN_AVION);
    expect(validarFormPago(form, "2026-11-10", { cuentaPorAvion: true })).toEqual({});
    expect(cambiosPago(pago, form)).toEqual({});
    // Y asignarle el avión desde «Editar» manda SOLO eso.
    expect(cambiosPago(pago, { ...form, aeronave_id: N4142R })).toEqual({ aeronave_id: N4142R });
  });

  it("opciones del avión: primero los aviones y al final la opción explícita «Sin avión (a cuenta general)»", () => {
    const aviones = resumen(resumenPorAvion()).aviones;
    expect(opcionesCorrespondeAvion(aviones, null, { cuentaPorAvion: true })).toEqual([
      { value: N4142R, label: "N4142R", description: "69 %" },
      { value: XBANU, label: "XB-ANU", description: "70 %" },
      { value: SIN_AVION, label: "Sin avión (a cuenta general)", description: "No descuenta del saldo de ningún avión" },
    ]);
    expect(ETIQUETA_SIN_AVION_GENERAL).toBe("Sin avión (a cuenta general)");
    // El avión que ya tiene la entrega se ofrece aunque no esté en la lista, antes de «Sin avión».
    const conActual = opcionesCorrespondeAvion(aviones.slice(0, 1), { id: XBANU, matricula: "XB-ANU" }, { cuentaPorAvion: true });
    expect(conActual.map((o) => o.label)).toEqual(["N4142R", "XB-ANU", "Sin avión (a cuenta general)"]);
    // La cuenta de siempre: «Sin avión» primero, como hasta hoy.
    expect(opcionesCorrespondeAvion(aviones).map((o) => o.label)).toEqual(["Sin avión", "N4142R", "XB-ANU"]);
    expect(opcionesCorrespondeAvion(aviones, null, {})[0]).toEqual({ value: SIN_AVION, label: "Sin avión" });
  });

  it("etiqueta, placeholder y ayuda del mes según la cuenta", () => {
    expect(etiquetaCampoAvion(true)).toBe("Corresponde al avión");
    expect(etiquetaCampoAvion(false)).toBe("Corresponde al avión (opcional)");
    expect(placeholderCampoAvion(true)).toBe("Elige el avión");
    expect(placeholderCampoAvion(false)).toBe("Sin avión");
    expect(ayudaMesEntrega(false)).toBe("Solo informativo: la entrega descuenta del saldo total del socio.");
    // En una cuenta por avión esa frase sería falsa: descuenta del saldo del avión.
    expect(ayudaMesEntrega(true)).toBe(
      "Solo informativo: el mes no cambia de qué saldo descuenta la entrega; eso lo decide el avión.",
    );
  });

  it("el POST lleva el avión elegido; «Sin avión (a cuenta general)» no manda `aeronave_id`", () => {
    const form = { ...formInicialAlta({ ...base, porEntregarMxn: null, cuentaPorAvion: true }), monto: "103614.04", metodo: "TRANSFERENCIA" as const };
    expect(payloadAltaPago({ ...form, aeronave_id: N4142R, mes: "2026-10" }, { socio_id: MAURICIO, meId: ALE.id })).toEqual({
      socio_id: MAURICIO,
      monto: 103614.04,
      moneda: "MXN",
      tc_usd_mxn: 18.45,
      fecha_pago: "2026-11-10",
      metodo: "TRANSFERENCIA",
      mes: "2026-10",
      aeronave_id: N4142R,
    });
    expect(payloadAltaPago({ ...form, aeronave_id: SIN_AVION }, { socio_id: MAURICIO, meId: ALE.id })).not.toHaveProperty("aeronave_id");
  });
});

describe("bajo el campo del avión: el saldo de ESE avión", () => {
  it("cuenta de siempre: nada (el campo queda como estaba)", () => {
    const viejo = ctx(sinAditivo(resumenPorAvion()));
    for (const avion of [AVION_SIN_ELEGIR, SIN_AVION, N4142R]) {
      expect(ayudaAvionEntrega(viejo, avion, "alta")).toBeNull();
      expect(ayudaAvionEntrega(viejo, avion, "edicion")).toBeNull();
    }
  });

  it("antes de la entrega del 10-nov: «Por entregar de N4142R: $103,410.02 MXN (sin contar el mes en curso: $19,002.73 MXN)»", () => {
    expect(ayudaAvionEntrega(ctx(resumenAntesDeLaEntrega()), N4142R, "alta")).toEqual({
      texto: "Por entregar de N4142R: $103,410.02 MXN (sin contar el mes en curso: $19,002.73 MXN)",
      esSaldo: true,
      clase: "text-amber-700 dark:text-amber-400",
      adelantoGeneral: null,
    });
  });

  it("sin mes en curso no se menciona", () => {
    const sinCurso = { ...ctx(resumenAntesDeLaEntrega()) };
    sinCurso.porAvion = sinCurso.porAvion?.map((s) => ({ ...s, mes_en_curso_mxn: 0 }));
    expect(ayudaAvionEntrega(sinCurso, N4142R, "alta")?.texto).toBe("Por entregar de N4142R: $103,410.02 MXN");
  });

  it("en negativo se dice como ADELANTADO (con entregas) o PÉRDIDA ACUMULADA (sin entregas), con el monto del API sin el signo", () => {
    const hoy = ctx(resumenPorAvion());
    // Después de la entrega del 10-nov el N4142R quedó −$204.02 de meses cerrados.
    expect(ayudaAvionEntrega(hoy, N4142R, "alta")).toEqual({
      texto:
        "N4142R va adelantado: $204.02 MXN a favor de VuelaTour (no hay nada por entregar de este avión, sin contar el mes en curso: $19,002.73 MXN).",
      esSaldo: true,
      clase: "text-sky-700 dark:text-sky-300",
      adelantoGeneral: null,
    });
    expect(ayudaAvionEntrega(hoy, XBANU, "alta")).toEqual({
      texto:
        "XB-ANU lleva una pérdida acumulada de $3,862.60 MXN: se descuenta de sus próximas utilidades (no hay nada por entregar de este avión).",
      esSaldo: true,
      clase: "text-sky-700 dark:text-sky-300",
      adelantoGeneral: null,
    });
  });

  it("al corriente (|saldo| ≤ $1): se dice, sin cifra inventada", () => {
    const alCorriente = { ...ctx(resumenPorAvion()) };
    alCorriente.porAvion = alCorriente.porAvion?.map((s) =>
      s.aeronave?.id === N4142R ? { ...s, por_entregar_cerrado_mxn: 0.5 } : s,
    );
    expect(ayudaAvionEntrega(alCorriente, N4142R, "alta")).toMatchObject({
      texto:
        "N4142R está al corriente (no hay nada por entregar de este avión, sin contar el mes en curso: $19,002.73 MXN).",
      clase: "",
    });
  });

  it("con adelantos «a cuenta general» se avisa que el sistema los descuenta (el panel NO hace esa resta)", () => {
    const general = ctx(resumenConGeneral());
    expect(ayudaAvionEntrega(general, N4142R, "alta")).toEqual({
      // El saldo del avión TAL CUAL lo manda el API: 103,410.02, no 100,410.02.
      texto: "Por entregar de N4142R: $103,410.02 MXN (sin contar el mes en curso: $19,002.73 MXN)",
      esSaldo: true,
      clase: "text-amber-700 dark:text-amber-400",
      adelantoGeneral:
        "Ya se le adelantaron $3,000.00 MXN a cuenta general: el sistema los descuenta de lo que hay por entregar de este avión.",
    });
    // Un saldo general A FAVOR del socio no se le suma a ningún avión: no se dice nada.
    const aFavor = { ...general };
    aFavor.porAvion = aFavor.porAvion?.map((s) => (s.aeronave ? s : { ...s, por_entregar_mxn: 8000 }));
    expect(ayudaAvionEntrega(aFavor, N4142R, "alta")?.adelantoGeneral).toBeNull();
  });

  it("sin elegir, «Sin avión» y un avión que no tiene sección", () => {
    const c = ctx(resumenPorAvion());
    expect(ayudaAvionEntrega(c, AVION_SIN_ELEGIR, "alta")).toEqual({
      texto: "En esta cuenta el saldo se lleva por avión: elige a cuál corresponde la entrega.",
      esSaldo: false,
      clase: "",
      adelantoGeneral: null,
    });
    expect(ayudaAvionEntrega(c, SIN_AVION, "alta")).toMatchObject({
      texto: "Sin avión: la entrega queda a cuenta general y no descuenta del saldo de ningún avión.",
      esSaldo: false,
    });
    // Un avión en el que ya no es socio y sin movimientos no tiene sección: no se dice un saldo.
    expect(ayudaAvionEntrega(c, "a1a1a1a1-0000-4000-8000-000000000990", "alta")).toBeNull();
  });

  it("en la EDICIÓN solo se explica la regla (el saldo del avión ya trae descontada esa entrega)", () => {
    const c = ctx(resumenPorAvion());
    for (const avion of [N4142R, SIN_AVION]) {
      expect(ayudaAvionEntrega(c, avion, "edicion")).toEqual({
        texto:
          "En esta cuenta el saldo se lleva por avión: la entrega descuenta del avión que elijas; sin avión queda a cuenta general.",
        esSaldo: false,
        clase: "",
        adelantoGeneral: null,
      });
    }
  });
});

describe("el monto que propone el alta: lo por entregar del AVIÓN elegido, nunca el total mezclado", () => {
  it("cuenta de siempre: lo por entregar del socio, elija lo que elija (como hasta hoy)", () => {
    const viejo = ctx(sinAditivo(resumenAntesDeLaEntrega()));
    for (const avion of [null, SIN_AVION, N4142R]) {
      expect(porEntregarParaPrellenar(viejo, avion)).toBe(118550.15);
      expect(montoPrellenadoAlta(viejo, avion)).toBe("118550.15");
    }
  });

  it("cuenta por avión: sin avión elegido NADA (ni los $118,550.15 del socio); con N4142R, sus $103,410.02 de meses cerrados", () => {
    const c = ctx(resumenAntesDeLaEntrega());
    expect(c.porEntregarMxn).toBe(118550.15);
    expect(porEntregarParaPrellenar(c, AVION_SIN_ELEGIR)).toBeNull();
    expect(porEntregarParaPrellenar(c, null)).toBeNull();
    expect(porEntregarParaPrellenar(c, SIN_AVION)).toBeNull();
    expect(porEntregarParaPrellenar(c, N4142R)).toBe(103410.02);
    expect(montoPrellenadoAlta(c, N4142R)).toBe("103410.02");
    // Pérdida o adelantado: nada que proponer.
    expect(montoPrellenadoAlta(c, XBANU)).toBe("");
    expect(montoPrellenadoAlta(ctx(resumenPorAvion()), N4142R)).toBe("");
    // Con adelantos a cuenta general el API descuenta de ese saldo: mejor vacío que restar aquí.
    expect(porEntregarParaPrellenar(ctx(resumenConGeneral()), N4142R)).toBeNull();
  });

  it("al cambiar de avión el monto sigue al avión SOLO si el operador no lo tocó", () => {
    const c = ctx(resumenAntesDeLaEntrega());
    const vacio = formInicialAlta({ hoy: "2026-11-10", meId: ALE.id, porEntregarMxn: porEntregarParaPrellenar(c, null), cuentaPorAvion: true });
    expect(vacio.monto).toBe("");
    const pre = (avion: string) => montoPrellenadoAlta(c, avion);
    // Sin elegir → N4142R: se propone lo suyo.
    const conN = formAlCambiarAvion(vacio, N4142R, pre(vacio.aeronave_id), pre(N4142R));
    expect(conN).toMatchObject({ aeronave_id: N4142R, monto: "103410.02" });
    // N4142R → XB-ANU (pérdida): el monto propuesto se vacía.
    expect(formAlCambiarAvion(conN, XBANU, pre(N4142R), pre(XBANU))).toMatchObject({ aeronave_id: XBANU, monto: "" });
    // Un monto tecleado no se toca.
    const tecleado = { ...conN, monto: "50000" };
    expect(formAlCambiarAvion(tecleado, XBANU, pre(N4142R), pre(XBANU))).toMatchObject({ aeronave_id: XBANU, monto: "50000" });
    // En DÓLARES el monto es otra moneda: no se toca; al volver a pesos se propone el del avión nuevo.
    const usd = formAlCambiarMoneda(conN, "USD", pre(N4142R), 18.45);
    expect(usd).toMatchObject({ moneda: "USD", monto: "" });
    const usdOtro = formAlCambiarAvion({ ...usd, monto: "900" }, XBANU, pre(N4142R), pre(XBANU));
    expect(usdOtro).toMatchObject({ aeronave_id: XBANU, monto: "900", moneda: "USD" });
    expect(formAlCambiarMoneda(formAlCambiarAvion(usd, N4142R, pre(N4142R), pre(N4142R)), "MXN", pre(N4142R), 18.45).monto).toBe("103410.02");
    // Edición (sin prellenado): solo cambia el avión.
    expect(formAlCambiarAvion(conN, XBANU, null, null)).toEqual({ ...conN, aeronave_id: XBANU });
  });

  it("la ayuda del monto nombra el avión; sin matrícula, el texto de siempre", () => {
    expect(hintMontoPago({ moneda: "MXN", porEntregarMxn: 103410.02, alta: true, matricula: "N4142R" })).toBe(
      "Prellenado con lo que hay por entregar de N4142R: $103,410.02 MXN.",
    );
    expect(hintMontoPago({ moneda: "USD", porEntregarMxn: 103410.02, alta: true, matricula: "N4142R" })).toBe(
      "Captura el monto en dólares; por entregar de N4142R $103,410.02 MXN. Con el T.C. se sabe cuántos pesos descuenta.",
    );
    expect(hintMontoPago({ moneda: "MXN", porEntregarMxn: null, alta: true, matricula: "XB-ANU" })).toBeNull();
    expect(hintMontoPago({ moneda: "MXN", porEntregarMxn: 1395.94, alta: true })).toBe(
      "Prellenado con lo que hay por entregar: $1,395.94 MXN.",
    );
    expect(hintMontoPago({ moneda: "MXN", porEntregarMxn: 1395.94, alta: true, matricula: " " })).toBe(
      "Prellenado con lo que hay por entregar: $1,395.94 MXN.",
    );
  });

  it("paso «Entrega registrada»: cómo quedó el saldo del avión de esa entrega (o de «a cuenta general»)", () => {
    const cuenta = resumen(resumenPorAvion());
    expect(textoSaldoTrasEntrega(cuenta, { aeronave_id: N4142R })).toBe("N4142R · Por entregar: $18,798.71 MXN");
    expect(textoSaldoTrasEntrega(resumen(resumenConGeneral()), { aeronave_id: null })).toBe(
      "Cuenta general · Adelantado: $3,000.00 MXN",
    );
    // Sin sección para ese avión, o en la cuenta de siempre: nada.
    expect(textoSaldoTrasEntrega(cuenta, { aeronave_id: null })).toBeNull();
    expect(textoSaldoTrasEntrega(resumen(sinAditivo(resumenPorAvion())), { aeronave_id: N4142R })).toBeNull();
    expect(textoSaldoTrasEntrega(null, { aeronave_id: N4142R })).toBeNull();
  });
});

describe("confirmación del ADELANTO: nombra el avión contra el que midió el API", () => {
  /** El 409 de la entrega del 10-nov (el mismo caso de `mensajeExcedeSaldo` del API). */
  const details = {
    por_entregar_mxn: 103410.02,
    mes_en_curso_mxn: 19002.73,
    monto_mxn: 103614.04,
    exceso_mxn: 204.02,
    saldo_despues_mxn: -204.02,
    aeronave: { id: N4142R, matricula: "N4142R" },
    adelantado_general_mxn: 0,
  };

  it("con `details.aeronave`: el MISMO texto que redacta el API («…por entregar de N4142R…», «…el saldo de N4142R quedará a favor…»)", () => {
    expect(confirmacionAdelanto(details)).toEqual({
      titulo: "Esta entrega es un ADELANTO",
      descripcion:
        "Esta entrega de $103,614.04 MXN supera lo que hay por entregar de N4142R ($103,410.02 MXN, sin contar el mes en curso: $19,002.73 MXN). Se registrará como ADELANTO y el saldo de N4142R quedará a favor de VuelaTour por $204.02 MXN. ¿Registrar?",
    });
    expect(confirmacionAdelanto(details, "edicion").descripcion).toMatch(/el saldo de N4142R quedará a favor de VuelaTour por \$204\.02 MXN\. ¿Guardar\?$/);
  });

  it("sin avión (`aeronave: null` = se midió contra toda la cuenta, o API previo): el texto de siempre", () => {
    const sinAvion = { ...details, aeronave: null };
    expect(confirmacionAdelanto(sinAvion).descripcion).toBe(
      "Esta entrega de $103,614.04 MXN supera lo que hay por entregar ($103,410.02 MXN, sin contar el mes en curso: $19,002.73 MXN). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour por $204.02 MXN. ¿Registrar?",
    );
    const previo = { por_entregar_mxn: 1395.94, monto_mxn: 3783.78, exceso_mxn: 2387.84 };
    expect(confirmacionAdelanto(previo).descripcion).toBe(
      "Esta entrega de $3,783.78 MXN supera lo que hay por entregar ($1,395.94 MXN). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour por $2,387.84 MXN. ¿Registrar?",
    );
    // Un avión sin matrícula legible no se nombra.
    expect(confirmacionAdelanto({ ...details, aeronave: { id: N4142R, matricula: " " } }).descripcion).toContain(
      "supera lo que hay por entregar ($103,410.02 MXN",
    );
  });

  it("con adelantos a cuenta general: el «por entregar» del API ya viene con ese descuento y se dice cuánto", () => {
    const conGeneral = { ...details, por_entregar_mxn: 100410.02, exceso_mxn: 3204.02, adelantado_general_mxn: 3000 };
    expect(confirmacionAdelanto(conGeneral).descripcion).toBe(
      "Esta entrega de $103,614.04 MXN supera lo que hay por entregar de N4142R ($100,410.02 MXN, ya descontados $3,000.00 MXN adelantados a cuenta general, sin contar el mes en curso: $19,002.73 MXN). Se registrará como ADELANTO y el saldo de N4142R quedará a favor de VuelaTour por $3,204.02 MXN. ¿Registrar?",
    );
  });

  it("`detalleExcesoSaldo` deja pasar el avión y lo adelantado a cuenta general; basura ⇒ ausentes", () => {
    expect(detalleExcesoSaldo(details)).toEqual(details);
    expect(detalleExcesoSaldo({ ...details, adelantado_general_mxn: "3000" })?.adelantado_general_mxn).toBe(3000);
    for (const aeronave of [null, undefined, "N4142R", { matricula: "N4142R" }, 7]) {
      const d = detalleExcesoSaldo({ ...details, aeronave, adelantado_general_mxn: "muchos" });
      expect(d).not.toHaveProperty("aeronave");
      expect(d).not.toHaveProperty("adelantado_general_mxn");
      // Los tres números de siempre siguen ahí.
      expect(d).toMatchObject({ por_entregar_mxn: 103410.02, monto_mxn: 103614.04, exceso_mxn: 204.02 });
    }
  });
});

describe("fixtures: los números del caso real cuadran con lo que el cliente veía", () => {
  it("la suma de los aviones es el total del socio (lo garantiza el API; aquí solo se confirma la fixture)", () => {
    const r = resumen(resumenPorAvion());
    const c = (n: number) => Math.round(n * 100);
    const suma = (k: "generado_mxn" | "entregado_mxn" | "por_entregar_mxn" | "mes_en_curso_mxn") =>
      (r.por_avion ?? []).reduce((acc, s) => acc + c(s[k]), 0) / 100;
    expect(suma("generado_mxn")).toBe(r.generado_mxn);
    expect(suma("entregado_mxn")).toBe(r.entregado_mxn);
    expect(suma("por_entregar_mxn")).toBe(r.por_entregar_mxn);
    expect(suma("mes_en_curso_mxn")).toBe(r.mes_en_curso_mxn);
    expect(normalizarPago(ENTREGA_OCT)).toMatchObject({ aeronave_id: N4142R, monto_mxn: 103614.04, fecha_pago: "2026-11-10" });
  });
});
