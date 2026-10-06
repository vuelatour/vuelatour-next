/**
 * «Vincular gasto»: por qué un gasto del MISMO monto NO aparece (6-oct-2026,
 * API 0.0.63, `excluidos` de `gastos-candidatos`).
 *
 * Caso real (prod): cargo de $212.00 del 07-sep-2026 (ASUR CANCUN, cuenta
 * GASTOS GNRAL, MXN). La oficina buscó «212» y vio «Ningún gasto pendiente
 * coincide con «212» en ±30 días…», pero existen TRES gastos de $212.00
 * (Taxi / estacionamiento de ASUR: 24-sep vuelo #338, 27 y 28-sep vuelo #330)
 * capturados en EFECTIVO — la lista solo ofrece gastos bancarios. Creyeron
 * que era un bug. Aquí se congelan las frases (una por motivo) y las ligas.
 */
import { describe, expect, it } from "vitest";
import {
  BOTON_VOLVER_A_BUSCAR,
  ETIQUETA_LIGAS_EXCLUIDOS,
  ORDEN_MOTIVOS_EXCLUIDOS,
  VENTANA_AMPLIADA_DIAS,
  busquedaParaMostrarNoBancarios,
  esBusquedaMonto,
  ligaGastoExcluido,
  textoExcluidosCandidatos,
  textoFechasCortas,
  ventanaParaMostrarNoBancarios,
} from "@/lib/admin/conciliacion-lote";
import type {
  CargoConciliadoExcluido,
  ExcluidosCandidatos,
  GastoExcluidoCandidato,
} from "@/types/conciliacion";

/** El cargo real (movimiento 520b2b2f…, 07-sep-2026). */
const CARGO = { monto: "212.00", moneda: "MXN" };
const V338 = "00a22981-e768-4455-9fc1-ecec8ab6a1ad";
const V330 = "66bcadba-ded0-48a0-b9fa-d2377cd4b66d";
const G24 = "4fca531f-47cf-4a78-8f05-127504322881";
const G27 = "e5aa4ec9-07e2-4311-90a9-b6150d04bbd8";
const G28 = "053fa6f4-2b14-4f17-9713-6f75efde971f";

const taxi = (
  id: string,
  fecha: string,
  folio: number | null,
  vueloId: string | null,
  extra: Partial<GastoExcluidoCandidato> = {},
): GastoExcluidoCandidato => ({
  id,
  fecha_gasto: fecha,
  monto: 212,
  moneda: "MXN",
  medio_pago: "EFECTIVO",
  categoria: "TAXI",
  vuelo_folio: folio,
  vuelo_id: vueloId,
  ...extra,
});

const T24 = taxi(G24, "2026-09-24", 338, V338);
const T27 = taxi(G27, "2026-09-27", 330, V330);
const T28 = taxi(G28, "2026-09-28", 330, V330);

const EFECTIVO_REAL: ExcluidosCandidatos = { motivo: "EFECTIVO_U_OTRO_MEDIO", n: 3, gastos: [T24, T27, T28] };

/** Lo que manda el API con la lista vacía: buscó «212» ⇒ `excluidos_monto` 212. */
const CTX = { monedaCuenta: "MXN", dias: 30, montoBuscado: 212, fechaCargo: "2026-09-07" };
/** 6-oct-2026: los gastos en efectivo YA se pueden vincular con justificación. */
const SOLO_BANCO = "la lista solo muestra gastos pagados por el banco";
const CORRIGE = "Si en realidad se pagó con tarjeta o transferencia, corrige el medio de pago del gasto;";
const SALIDA_UNO = `${CORRIGE} si no, muéstralo y vincúlalo con una justificación (su medio de pago no cambia).`;
const SALIDA_VARIOS = `${CORRIGE} si no, muéstralos y vincula el que corresponda con una justificación (su medio de pago no cambia).`;

const textos = (grupos: ExcluidosCandidatos[], ctx: Parameters<typeof textoExcluidosCandidatos>[2] = CTX) =>
  textoExcluidosCandidatos(grupos, CARGO.monto, ctx).map((a) => a.texto);

describe("caso real: cargo de $212.00 del 07-sep y tres gastos en EFECTIVO", () => {
  it("UNA frase con el monto, las fechas, los vuelos, el porqué y qué hacer", () => {
    const avisos = textoExcluidosCandidatos([EFECTIVO_REAL], CARGO.monto, CTX);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].motivo).toBe("EFECTIVO_U_OTRO_MEDIO");
    expect(avisos[0].texto).toBe(
      `Hay 3 gastos de $212.00 en efectivo (24, 27 y 28 sep · vuelos #338 y #330): ${SOLO_BANCO}. ${SALIDA_VARIOS}`,
    );
    // «Mostrar estos gastos»: los 3 caen en ±30 días del cargo (07-sep) y se buscan por su monto.
    expect(avisos[0].mostrar).toEqual({ dias: 30, monto: 212 });
  });

  it("con el interruptor ENCENDIDO no se ofrece mostrarlos: si no entran es por otra regla", () => {
    const [aviso] = textoExcluidosCandidatos([EFECTIVO_REAL], CARGO.monto, { ...CTX, incluyeNoBancarios: true });
    expect(aviso.mostrar).toBeNull();
    expect(aviso.texto).toBe(
      "Hay 3 gastos de $212.00 en efectivo (24, 27 y 28 sep · vuelos #338 y #330) que no entran ni con los gastos en efectivo incluidos: pueden estar ya conciliados, en otra moneda o fuera de ±30 días del cargo.",
    );
    expect(
      textoExcluidosCandidatos([{ ...EFECTIVO_REAL, n: 1, gastos: [T28] }], CARGO.monto, {
        ...CTX,
        incluyeNoBancarios: true,
      })[0].texto,
    ).toBe(
      "Hay 1 gasto de $212.00 en efectivo (28 sep · vuelo #330) que no entra ni con los gastos en efectivo incluidos: puede estar ya conciliado, en otra moneda o fuera de ±30 días del cargo.",
    );
  });

  it("los demás motivos nunca ofrecen «Mostrar estos gastos»", () => {
    const avisos = textoExcluidosCandidatos(
      [
        { motivo: "YA_CONCILIADO", n: 1, gastos: [{ ...T24, medio_pago: "TARJETA_CORP" }] },
        { motivo: "OTRA_MONEDA", n: 1, gastos: [{ ...T27, moneda: "USD" }] },
        { motivo: "FUERA_DE_VENTANA", n: 1, gastos: [{ ...T28, medio_pago: "TARJETA_CORP" }] },
      ],
      CARGO.monto,
      CTX,
    );
    expect(avisos.map((a) => a.mostrar)).toEqual([null, null, null]);
  });

  it("una liga por gasto, a SU vuelo (donde se corrige), con qué es en el tooltip", () => {
    const [aviso] = textoExcluidosCandidatos([EFECTIVO_REAL], CARGO.monto, CTX);
    expect(aviso.ligas).toEqual([
      {
        key: G24,
        texto: "vuelo #338 (24 sep)",
        href: `/admin/flights/${V338}`,
        titulo: "Taxi / estacionamiento · $212.00 · Efectivo. Abre el vuelo #338 en otra pestaña.",
      },
      {
        key: G27,
        texto: "vuelo #330 (27 sep)",
        href: `/admin/flights/${V330}`,
        titulo: "Taxi / estacionamiento · $212.00 · Efectivo. Abre el vuelo #330 en otra pestaña.",
      },
      {
        key: G28,
        texto: "vuelo #330 (28 sep)",
        href: `/admin/flights/${V330}`,
        titulo: "Taxi / estacionamiento · $212.00 · Efectivo. Abre el vuelo #330 en otra pestaña.",
      },
    ]);
  });

  it("el API los manda en otro orden (o repetidos): frase y ligas siguen en orden de fecha, sin duplicar", () => {
    const [aviso] = textoExcluidosCandidatos(
      [{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 3, gastos: [T28, T24, T27, T24] }],
      CARGO.monto,
      CTX,
    );
    expect(aviso.texto).toContain("(24, 27 y 28 sep · vuelos #338 y #330)");
    expect(aviso.ligas.map((l) => l.key)).toEqual([G24, G27, G28]);
  });

  it("monto como texto («212.00», numeric de PostgREST) ⇒ la misma frase", () => {
    const gastos = EFECTIVO_REAL.gastos.map((g) => ({ ...g, monto: "212.00" }));
    expect(textos([{ ...EFECTIVO_REAL, gastos }])).toEqual(textos([EFECTIVO_REAL]));
  });

  it("un solo gasto: singular", () => {
    expect(textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [T24] }])).toEqual([
      `Hay 1 gasto de $212.00 en efectivo (24 sep · vuelo #338): ${SOLO_BANCO}. ${SALIDA_UNO}`,
    ]);
  });

  it("`n` mayor que los gastos mandados (el API manda hasta 5): «y N más»", () => {
    expect(textos([{ ...EFECTIVO_REAL, n: 7 }])[0]).toBe(
      `Hay 7 gastos de $212.00 en efectivo (24, 27 y 28 sep · vuelos #338 y #330, y 4 más): ${SOLO_BANCO}. ${SALIDA_VARIOS}`,
    );
  });
});

describe("«Mostrar estos gastos»: con qué ventana y con qué búsqueda los trae", () => {
  it("si alguno cae más lejos que la ventana, la amplía a 120 (el API los busca hasta ahí)", () => {
    expect(ventanaParaMostrarNoBancarios([T24, T27, T28], "2026-09-07", 30)).toBe(30);
    expect(ventanaParaMostrarNoBancarios([{ fecha_gasto: "2026-10-20" }], "2026-09-07", 30)).toBe(
      VENTANA_AMPLIADA_DIAS,
    );
    // Ya ampliada, se queda; sin fecha del cargo o del gasto, no se adivina.
    expect(ventanaParaMostrarNoBancarios([{ fecha_gasto: "2026-12-30" }], "2026-09-07", 120)).toBe(120);
    expect(ventanaParaMostrarNoBancarios([{ fecha_gasto: "2026-10-20" }], null, 30)).toBe(30);
    expect(ventanaParaMostrarNoBancarios([{ fecha_gasto: null }], "2026-09-07", 30)).toBe(30);
    const [aviso] = textoExcluidosCandidatos(
      [{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [{ ...T24, fecha_gasto: "2026-10-25" }] }],
      CARGO.monto,
      CTX,
    );
    expect(aviso.mostrar).toEqual({ dias: VENTANA_AMPLIADA_DIAS, monto: 212 });
  });

  it("los busca por SU monto si la búsqueda no es un monto (un texto podría esconderlos; vacía, cien del banco van primero)", () => {
    expect(busquedaParaMostrarNoBancarios("", 212)).toBe("212.00");
    expect(busquedaParaMostrarNoBancarios("ASUR", 212)).toBe("212.00");
    expect(busquedaParaMostrarNoBancarios("estacionamiento", "2801.4")).toBe("2801.40");
    // Un monto tecleado se queda: los excluidos se buscaron con él.
    expect(busquedaParaMostrarNoBancarios("212", 212)).toBe("212");
    expect(busquedaParaMostrarNoBancarios("2,801.40", 2801.4)).toBe("2801.40");
    // Sin monto, la búsqueda de siempre.
    expect(busquedaParaMostrarNoBancarios("ASUR", null)).toBe("ASUR");
    expect(esBusquedaMonto("212")).toBe(true);
    expect(esBusquedaMonto("$ 2,801.40")).toBe(true);
    expect(esBusquedaMonto("ASUR 212")).toBe(false);
    expect(esBusquedaMonto("")).toBe(false);
  });

  it("solo bodega ⇒ sin botón (nunca se vinculan); bodega mezclada ⇒ botón con el monto de los vinculables", () => {
    const bodega = { ...T24, medio_pago: "BODEGA", vuelo_id: null, vuelo_folio: null };
    expect(textoExcluidosCandidatos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [bodega] }], CARGO.monto, CTX)[0].mostrar).toBeNull();
    const [mixto] = textoExcluidosCandidatos(
      [{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 2, gastos: [bodega, { ...T27, monto: "212.00" }] }],
      CARGO.monto,
      CTX,
    );
    expect(mixto.mostrar).toEqual({ dias: 30, monto: 212 });
    expect(mixto.texto).toContain("pagados con bodega (inventario) y efectivo");
    expect(mixto.texto.endsWith("Los de bodega son salidas de inventario y nunca se vinculan.")).toBe(true);
  });
});

describe("las ligas: al vuelo o a Gastos de ese día", () => {
  it("sin `vuelo_id` (el contrato solo promete el folio): Gastos filtrado a ese día, y lo dice", () => {
    expect(ligaGastoExcluido(taxi(G24, "2026-09-24", 338, null))).toEqual({
      key: G24,
      texto: "vuelo #338 (24 sep)",
      href: "/admin/expenses?desde=2026-09-24&hasta=2026-09-24",
      titulo: "Taxi / estacionamiento · $212.00 · Efectivo. Abre Gastos del 24 sep en otra pestaña.",
    });
  });

  it("gasto sin vuelo: «gasto del 12 jun» ⇒ Gastos de ese día", () => {
    const l = ligaGastoExcluido(taxi(G24, "2026-06-12", null, null, { categoria: "OPERACIONES" }));
    expect(l.texto).toBe("gasto del 12 jun");
    expect(l.href).toBe("/admin/expenses?desde=2026-06-12&hasta=2026-06-12");
    expect(l.titulo).toBe("Operaciones · $212.00 · Efectivo. Abre Gastos del 12 jun en otra pestaña.");
  });

  it("un `vuelo_id` que no es uuid NUNCA arma /admin/flights/<basura>", () => {
    expect(ligaGastoExcluido(taxi(G24, "2026-09-24", 338, "338")).href).toBe(
      "/admin/expenses?desde=2026-09-24&hasta=2026-09-24",
    );
  });

  it("con `vuelo_id` pero sin folio: abre su vuelo", () => {
    const l = ligaGastoExcluido(taxi(G24, "2026-09-24", null, V338));
    expect(l.texto).toBe("gasto del 24 sep");
    expect(l.href).toBe(`/admin/flights/${V338}`);
    expect(l.titulo).toBe("Taxi / estacionamiento · $212.00 · Efectivo. Abre su vuelo en otra pestaña.");
  });

  it("sin fecha válida ni vuelo: Gastos a secas", () => {
    const l = ligaGastoExcluido({ id: G24, monto: 212, fecha_gasto: "2026-13-45" });
    expect(l).toEqual({ key: G24, texto: "gasto", href: "/admin/expenses", titulo: "$212.00. Abre Gastos en otra pestaña." });
  });

  it("un gasto en dólares lleva su moneda en el tooltip", () => {
    expect(ligaGastoExcluido(taxi(G24, "2026-09-24", 338, V338, { moneda: "USD" })).titulo).toBe(
      "Taxi / estacionamiento · $212.00 USD · Efectivo. Abre el vuelo #338 en otra pestaña.",
    );
  });
});

describe("EFECTIVO_U_OTRO_MEDIO: el medio va en la frase", () => {
  it("Personal Pablo", () => {
    expect(textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [{ ...T24, medio_pago: "PERSONAL_PABLO" }] }])).toEqual([
      `Hay 1 gasto de $212.00 pagado con Personal Pablo (24 sep · vuelo #338): ${SOLO_BANCO} (tarjeta, transferencia o PayWise). ${SALIDA_UNO}`,
    ]);
  });

  it("mezcla de medios (efectivo y Personal Ale)", () => {
    expect(
      textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 2, gastos: [T24, { ...T27, medio_pago: "PERSONAL_ALE" }] }]),
    ).toEqual([
      `Hay 2 gastos de $212.00 pagados con efectivo y Personal Ale (24 y 27 sep · vuelos #338 y #330): ${SOLO_BANCO} (tarjeta, transferencia o PayWise). ${SALIDA_VARIOS}`,
    ]);
  });

  it("un medio que el panel no conoce: «otro medio de pago», JAMÁS el código", () => {
    const [texto] = textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [{ ...T24, medio_pago: "VALE_DESPENSA" }] }]);
    expect(texto).toContain("pagado con otro medio de pago");
    expect(texto).not.toContain("VALE_DESPENSA");
  });

  it("solo BODEGA: es inventario, NO se sugiere cambiar el medio de pago", () => {
    const bodega = (id: string, fecha: string) =>
      ({ id, fecha_gasto: fecha, monto: 212, moneda: "MXN", medio_pago: "BODEGA", categoria: "REFACCION" }) as const;
    expect(textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [bodega(G24, "2026-09-15")] }])).toEqual([
      "Hay 1 gasto de $212.00 con cargo a bodega (15 sep): es una salida de inventario y nunca pasa por el banco, así que no se concilia.",
    ]);
    const dos = textos([
      { motivo: "EFECTIVO_U_OTRO_MEDIO", n: 2, gastos: [bodega(G24, "2026-09-15"), bodega(G27, "2026-09-16")] },
    ]);
    expect(dos).toEqual([
      "Hay 2 gastos de $212.00 con cargo a bodega (15 y 16 sep): son salidas de inventario y nunca pasan por el banco, así que no se concilian.",
    ]);
    expect(dos[0]).not.toContain("corrige");
  });

  it("sin `medio_pago`: «otro medio de pago»", () => {
    expect(textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [{ ...T24, medio_pago: null }] }])[0]).toBe(
      `Hay 1 gasto de $212.00 pagado con otro medio de pago (24 sep · vuelo #338): ${SOLO_BANCO} (tarjeta, transferencia o PayWise). ${SALIDA_UNO}`,
    );
  });
});

describe("YA_CONCILIADO: con qué cargo (`conciliado_con` de la puente)", () => {
  const ya = (gastos: GastoExcluidoCandidato[], n = gastos.length): ExcluidosCandidatos => ({
    motivo: "YA_CONCILIADO",
    n,
    gastos,
  });
  const cargo = (id: string, fecha: string | null, cuenta: string | null = "GASTOS GNRAL"): CargoConciliadoExcluido => ({
    movimiento_id: id,
    fecha,
    monto: 212,
    moneda: "MXN",
    cuenta,
  });
  const UNO = "Si se ligó por error, desvincúlalo en Conciliación y vuelve a buscar.";
  const VARIOS = "Si alguno se ligó por error, desvincúlalo en Conciliación y vuelve a buscar.";

  it("con el cargo y su cuenta", () => {
    expect(
      textos([ya([{ ...T24, medio_pago: "TARJETA_CORP", conciliado_con: [cargo("m1", "2026-09-05")] }])]),
    ).toEqual([`1 gasto de $212.00 (24 sep · vuelo #338) ya está conciliado con el cargo del 5 sep (GASTOS GNRAL). ${UNO}`]);
  });

  it("sin cuenta (o con cuentas distintas) no se nombra ninguna", () => {
    expect(textos([ya([{ ...T24, conciliado_con: [cargo("m1", "2026-09-05", null)] }])])[0]).toContain(
      "ya está conciliado con el cargo del 5 sep. ",
    );
    expect(
      textos([ya([{ ...T24, conciliado_con: [cargo("m1", "2026-09-05"), cargo("m2", "2026-09-09", "OTRA")] }])])[0],
    ).toContain("ya está conciliado con los cargos del 5 y 9 sep. ");
  });

  it("la puente no se pudo leer (null), sin cargo ([]) o API sin el campo: no se presume con qué", () => {
    const esperado = `1 gasto de $212.00 (24 sep · vuelo #338) ya está conciliado. ${UNO}`;
    expect(textos([ya([{ ...T24, conciliado_con: null }])])).toEqual([esperado]);
    expect(textos([ya([{ ...T24, conciliado_con: [] }])])).toEqual([esperado]);
    expect(textos([ya([T24])])).toEqual([esperado]);
    // Un cargo sin fecha tampoco permite nombrarlo.
    expect(textos([ya([{ ...T24, conciliado_con: [cargo("m1", null)] }])])).toEqual([esperado]);
  });

  it("varios: el MISMO cargo (un lote), cargos distintos, alguno sin dato o más de los que llegaron", () => {
    expect(
      textos([
        ya([
          { ...T24, conciliado_con: [cargo("m1", "2026-09-05")] },
          { ...T27, conciliado_con: [cargo("m1", "2026-09-05")] },
        ]),
      ])[0],
    ).toBe(
      `2 gastos de $212.00 (24 y 27 sep · vuelos #338 y #330) ya están conciliados con el cargo del 5 sep (GASTOS GNRAL). ${VARIOS}`,
    );
    expect(
      textos([
        ya([
          { ...T24, conciliado_con: [cargo("m1", "2026-09-05")] },
          { ...T27, conciliado_con: [cargo("m2", "2026-09-09")] },
        ]),
      ])[0],
    ).toBe(
      `2 gastos de $212.00 (24 y 27 sep · vuelos #338 y #330) ya están conciliados con los cargos del 5 y 9 sep (GASTOS GNRAL). ${VARIOS}`,
    );
    expect(textos([ya([{ ...T24, conciliado_con: [cargo("m1", "2026-09-05")] }, { ...T27, conciliado_con: null }])])[0]).toBe(
      `2 gastos de $212.00 (24 y 27 sep · vuelos #338 y #330) ya están conciliados. ${VARIOS}`,
    );
    // Hay más de los que llegaron: no se presume con qué cargos están.
    expect(textos([ya([{ ...T24, conciliado_con: [cargo("m1", "2026-09-05")] }], 3)])[0]).toContain(
      "ya están conciliados. ",
    );
  });

  it("un gasto pagado con DOS cargos (pago parcial): «con los cargos»", () => {
    expect(
      textos([ya([{ ...T24, conciliado_con: [cargo("m1", "2026-09-05"), cargo("m2", "2026-09-09")] }])])[0],
    ).toBe(`1 gasto de $212.00 (24 sep · vuelo #338) ya está conciliado con los cargos del 5 y 9 sep (GASTOS GNRAL). ${UNO}`);
  });
});

describe("OTRA_MONEDA", () => {
  it("dólares contra una cuenta en pesos (el monto sin sufijo: la moneda va con palabras)", () => {
    const usd = (g: GastoExcluidoCandidato) => ({ ...g, moneda: "USD", medio_pago: "TARJETA_CORP" });
    expect(textos([{ motivo: "OTRA_MONEDA", n: 2, gastos: [usd(T24), usd(T27)] }])).toEqual([
      "2 gastos de $212.00 están en dólares (24 y 27 sep · vuelos #338 y #330) y la cuenta es en pesos (MXN). Si se capturaron con la moneda equivocada, corrige la moneda del gasto y vuelve a buscar.",
    ]);
  });

  it("pesos contra una cuenta en dólares; sin la moneda de la cuenta", () => {
    const grupo: ExcluidosCandidatos = { motivo: "OTRA_MONEDA", n: 1, gastos: [{ ...T24, medio_pago: "TRANSFERENCIA" }] };
    expect(textos([grupo], { monedaCuenta: "USD", dias: 30 })[0]).toBe(
      "1 gasto de $212.00 está en pesos (24 sep · vuelo #338) y la cuenta es en dólares (USD). Si se capturó con la moneda equivocada, corrige la moneda del gasto y vuelve a buscar.",
    );
    expect(textos([grupo], { monedaCuenta: null, dias: 30 })[0]).toContain("y la cuenta es de otra moneda.");
  });
});

describe("FUERA_DE_VENTANA", () => {
  const fuera = (n: number, gastos: GastoExcluidoCandidato[]): ExcluidosCandidatos => ({
    motivo: "FUERA_DE_VENTANA",
    n,
    gastos,
  });
  const junio = taxi(G24, "2026-06-12", null, null, { medio_pago: "TARJETA_CORP" });

  it("±30 días ⇒ «amplía a 120 días»", () => {
    expect(textos([fuera(1, [junio])])).toEqual([
      "1 gasto de $212.00 (12 jun) cae fuera de ±30 días del cargo: amplía a 120 días.",
    ]);
    expect(
      textos([fuera(2, [junio, taxi(G27, "2026-06-20", null, null, { medio_pago: "TARJETA_CORP" })])]),
    ).toEqual(["2 gastos de $212.00 (12 y 20 jun) caen fuera de ±30 días del cargo: amplía a 120 días."]);
  });

  it(`ya en ±${VENTANA_AMPLIADA_DIAS} días: no sugiere ampliar`, () => {
    expect(textos([fuera(1, [junio])], { ...CTX, dias: VENTANA_AMPLIADA_DIAS })).toEqual([
      "1 gasto de $212.00 (12 jun) cae fuera de ±120 días del cargo.",
    ]);
  });

  it("sin `dias`: la ventana por defecto (±30)", () => {
    expect(textos([fuera(1, [junio])], { monedaCuenta: "MXN" })[0]).toContain("fuera de ±30 días del cargo: amplía a 120 días.");
  });
});

describe("mezcla de motivos", () => {
  it("UNA frase por motivo, en orden fijo; un motivo desconocido al final y SIN su código", () => {
    const avisos = textoExcluidosCandidatos(
      [
        { motivo: "FUERA_DE_VENTANA", n: 1, gastos: [taxi(G28, "2026-06-12", null, null)] },
        { motivo: "MOTIVO_NUEVO_DEL_API", n: 1, gastos: [taxi("00000000-0000-4000-8000-000000000001", "2026-09-20", 331, null)] },
        { motivo: "OTRA_MONEDA", n: 1, gastos: [{ ...T27, moneda: "USD" }] },
        {
          motivo: "YA_CONCILIADO",
          n: 1,
          gastos: [
            {
              ...T28,
              conciliado_con: [{ movimiento_id: "m1", fecha: "2026-09-05", monto: 212, moneda: "MXN", cuenta: "GASTOS GNRAL" }],
            },
          ],
        },
        { motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [T24] },
      ],
      CARGO.monto,
      CTX,
    );
    expect(avisos.map((a) => a.motivo)).toEqual([...ORDEN_MOTIVOS_EXCLUIDOS, "MOTIVO_NUEVO_DEL_API"]);
    expect(avisos[4].texto).toBe("Hay 1 gasto de $212.00 (20 sep · vuelo #331) que no entra en la lista de candidatos.");
    for (const a of avisos) expect(a.texto).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    expect(avisos.every((a) => a.ligas.length === 1)).toBe(true);
  });
});

describe("API previo o datos raros ⇒ nada que pintar (el vacío de siempre)", () => {
  it("sin `excluidos`, null, [] o no-arreglo ⇒ []", () => {
    expect(textoExcluidosCandidatos(undefined, CARGO.monto, CTX)).toEqual([]);
    expect(textoExcluidosCandidatos(null, CARGO.monto, CTX)).toEqual([]);
    expect(textoExcluidosCandidatos([], CARGO.monto, CTX)).toEqual([]);
    expect(textoExcluidosCandidatos({} as unknown as ExcluidosCandidatos[], CARGO.monto, CTX)).toEqual([]);
  });

  it("grupos sin motivo, nulos o con n = 0 y sin gastos se saltan; `gastos` que no es arreglo no revienta", () => {
    const raros = [
      null,
      { motivo: "", n: 2, gastos: [T24] },
      { motivo: "EFECTIVO_U_OTRO_MEDIO", n: 0, gastos: [] },
      { motivo: "YA_CONCILIADO", n: 1, gastos: "nada" },
    ] as unknown as ExcluidosCandidatos[];
    const avisos = textoExcluidosCandidatos(raros, CARGO.monto, CTX);
    expect(avisos.map((a) => a.motivo)).toEqual(["YA_CONCILIADO"]);
    expect(avisos[0].ligas).toEqual([]);
    expect(avisos[0].texto).toBe(
      "1 gasto de $212.00 ya está conciliado. Si se ligó por error, desvincúlalo en Conciliación y vuelve a buscar.",
    );
  });

  it("`n` menor que los gastos mandados: manda lo que se ve", () => {
    expect(textos([{ ...EFECTIVO_REAL, n: 1 }])[0]).toMatch(/^Hay 3 gastos de \$212\.00 en efectivo/);
  });
});

describe("grupo sin gastos: el monto de la frase", () => {
  const sinGastos: ExcluidosCandidatos = { motivo: "FUERA_DE_VENTANA", n: 2, gastos: [] };

  it("el que el API dice que buscó (`excluidos_monto`: el de la búsqueda si es un monto)", () => {
    expect(
      textoExcluidosCandidatos([sinGastos], "8404.20", { monedaCuenta: "MXN", dias: 30, montoBuscado: 2801.4 })[0].texto,
    ).toBe("2 gastos de $2,801.40 caen fuera de ±30 días del cargo: amplía a 120 días.");
    // `numeric` de PostgREST puede llegar como texto.
    expect(
      textoExcluidosCandidatos([sinGastos], "8404.20", { monedaCuenta: "MXN", montoBuscado: "2801.40" })[0].texto,
    ).toMatch(/^2 gastos de \$2,801\.40 /);
  });

  it("sin `excluidos_monto` (o en 0), el del cargo en valor absoluto", () => {
    expect(textoExcluidosCandidatos([sinGastos], "-8404.20", { monedaCuenta: "MXN", montoBuscado: null })[0].texto).toBe(
      "2 gastos de $8,404.20 caen fuera de ±30 días del cargo: amplía a 120 días.",
    );
    expect(textoExcluidosCandidatos([sinGastos], 8404.2, { montoBuscado: 0 })[0].texto).toMatch(/^2 gastos de \$8,404\.20 /);
    expect(textoExcluidosCandidatos([sinGastos], 8404.2)[0].texto).toMatch(/^2 gastos de \$8,404\.20 /);
  });

  it("con gastos, el monto es el de SUS gastos aunque `excluidos_monto` diga otro", () => {
    expect(textos([{ motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [{ ...T24, monto: "211.99" }] }])[0]).toMatch(
      /^Hay 1 gasto de \$211\.99 en efectivo/,
    );
  });
});

describe("textoFechasCortas", () => {
  it("un mes: «24, 27 y 28 sep» (sin repetir, en orden, día sin cero)", () => {
    expect(textoFechasCortas(["2026-09-24"])).toBe("24 sep");
    expect(textoFechasCortas(["2026-09-05"])).toBe("5 sep");
    expect(textoFechasCortas(["2026-09-28", "2026-09-24", "2026-09-27", "2026-09-24"])).toBe("24, 27 y 28 sep");
    expect(textoFechasCortas(["2026-09-24T15:00:00Z", "2026-09-27"])).toBe("24 y 27 sep");
  });

  it("varios meses: cada fecha con su mes; de un año a otro, con año", () => {
    expect(textoFechasCortas(["2026-09-05", "2026-08-30", "2026-09-02"])).toBe("30 ago, 2 sep y 5 sep");
    expect(textoFechasCortas(["2026-01-03", "2025-12-28"])).toBe("28 dic 2025 y 3 ene 2026");
  });

  it("lo que no es un día real se ignora", () => {
    expect(textoFechasCortas(["2026-13-45", null, undefined, "", "nada"])).toBe("");
    expect(textoFechasCortas(["2026-02-30", "2026-09-24"])).toBe("24 sep");
  });
});

describe("constantes del diálogo", () => {
  it("botón y rótulo", () => {
    expect(BOTON_VOLVER_A_BUSCAR).toBe("Volver a buscar");
    expect(ETIQUETA_LIGAS_EXCLUIDOS).toBe("Abrir:");
    expect(ORDEN_MOTIVOS_EXCLUIDOS).toEqual(["EFECTIVO_U_OTRO_MEDIO", "YA_CONCILIADO", "OTRA_MONEDA", "FUERA_DE_VENTANA"]);
  });
});
