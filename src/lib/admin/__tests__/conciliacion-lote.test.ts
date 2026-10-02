/**
 * 1 CARGO del banco ↔ N GASTOS («lote», 2-oct-2026, API 0.0.52) — helpers
 * PUROS del panel con los montos REALES de SAESA (prod, 2-oct): 29 gastos
 * «Pago VIP SAESA» (59,569.87) y 7 SPEI del 24-sep en GASTOS GNRAL
 * (24,033.57): 8,404.20 = 3 × 2,801.40; 4,462.75 = 2,231.37 + 2,231.38 (o
 * 2 × 2,231.37 + 0.01, SAESA factura 2,231.375); 2,236.25 = 2 × 1,118.12 +
 * 0.01. La regla la decide el API: aquí se congelan la GUÍA visual, la
 * lectura de la liga y TODOS los textos.
 */
import { describe, expect, it } from "vitest";
import {
  BOTON_CANCELAR,
  LARGO_MAX_BUSQUEDA,
  MSG_LOTE_API_VIEJO,
  MSG_TOPE_GASTOS_LOTE,
  NOTA_VENTANA_CARGO,
  PLACEHOLDER_BUSCAR_GASTO,
  TOOLTIP_LOTE_SIN_DETALLE,
  VENTANA_AMPLIADA_DIAS,
  VENTANA_CARGO_DIAS,
  aporteDeGasto,
  bloqueoDeFila,
  botonVincularGastos,
  busquedaParaApi,
  conSugeridoAlFrente,
  descripcionVincularGasto,
  esApiSinLote,
  esCargoConLote,
  esDtoSinLote,
  esRutaInexistente,
  estadoBuscadorGastos,
  estadoLoteCargo,
  etiquetaListaCandidatos,
  fichaCandidatoGasto,
  fichaSugerida,
  gastoUnicoDe,
  gastosLigadosDe,
  idsParaVincular,
  lineaGastoLote,
  listaConMarcadosPrimero,
  menuDesvincularGastos,
  mensajeErrorBusquedaGastos,
  mensajeErrorVincularGastos,
  motivoVetoLote,
  normalizarBusquedaMonto,
  numeroGastosDe,
  opcionesRespaldoVincular,
  resumenLoteFila,
  textoAmpliarVentana,
  textoBusquedaGastos,
  textoCargoNoCuadra,
  textoConfirmarDesvincularGastos,
  textoErrorSugerencia,
  textoGastoYaCubiertoLote,
  textoIaSinPropuesta,
  textoLoteMonedaDistinta,
  textoLoteSinDetalle,
  textoMotivoPendienteDialogo,
  textoMovimientoConLote,
  textoSumaLote,
  textoTruncado,
  tieneGastoLigado,
  tituloDesvincularGastos,
  toastDesvinculoGastos,
  toastVinculoGastos,
  toleranciaLote,
  type GastoParaLote,
} from "@/lib/admin/conciliacion-lote";
import { descripcionCandidatoGasto } from "@/lib/admin/conciliacion-auto";
import { abonosCandidatosParaCargo, mensajeErrorReverso } from "@/lib/admin/conciliacion-reverso";
import {
  MSG_SERVIDOR_NO_RESPONDIO,
  RE_TEXTO_TECNICO,
  esErrorTecnico,
  esTextoTecnico,
} from "@/lib/admin/errores-tecnicos";
import { fmtDateOnly } from "@/lib/datetime";
import type { GastoCandidato, MovimientoGasto, SugerenciaConciliacion } from "@/types/conciliacion";

// ───────────────────────── Datos reales de SAESA ─────────────────────────

const SAESA = { a: 1118.12, b: 2231.37, c: 2231.38, d: 2801.4 } as const;

/** Un gasto «Pago VIP SAESA» (MXN, sin proveedor ni lugar: el nombre vive en las notas). */
const gastoSaesa = (monto: number, extra: Partial<GastoParaLote> = {}): GastoParaLote => ({
  monto,
  moneda: "MXN",
  ...extra,
});

const parte = (id: string, folio: number, monto: string, extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id,
  monto,
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-14",
  vuelo_id: `v-${folio}`,
  vuelo: { folio },
  proveedor: null,
  lugar: null,
  notas: "Pago VIP SAESA\ncapturó Jimmy Chi",
  notas_primera_linea: "Pago VIP SAESA",
  monto_parte: monto,
  ...extra,
});

const candidato = (id: string, monto: number, extra: Partial<GastoCandidato> = {}): GastoCandidato => ({
  id,
  fecha: "2026-09-14",
  monto,
  moneda: "MXN",
  categoria: "OPERACIONES",
  nota: "Pago VIP SAESA",
  vuelo_folio: 315,
  ...extra,
});

describe("toleranciaLote (misma fórmula que la BD y el API)", () => {
  it("un centavo por gasto, al menos 0.02 y nunca más de 1.00", () => {
    expect(toleranciaLote(2)).toBe(0.02);
    expect(toleranciaLote(3)).toBe(0.03);
    expect(toleranciaLote(29)).toBe(0.29); // los 29 gastos SAESA
    expect(toleranciaLote(100)).toBe(1);
    expect(toleranciaLote(150)).toBe(1);
    expect(toleranciaLote(1)).toBe(0.02);
    expect(toleranciaLote(0)).toBe(0.02);
    expect(toleranciaLote(Number.NaN)).toBe(0.02);
  });
});

describe("la liga de un movimiento", () => {
  const lote = {
    conciliado: true,
    gasto_id: null,
    gasto: null,
    gastos_n: 3,
    gastos: [parte("g315", 315, "2801.40"), parte("g319", 319, "2801.40"), parte("g326", 326, "2801.40")],
  };

  it("un lote trae gasto_id NULL: la liga se lee con gastos_n / gastos", () => {
    expect(tieneGastoLigado(lote)).toBe(true);
    expect(tieneGastoLigado({ gastos_n: 3, gasto_id: null })).toBe(true);
    expect(tieneGastoLigado({ gasto_id: null, gastos: [parte("x", 1, "1")] })).toBe(true);
    expect(tieneGastoLigado({ gasto_id: "g1" })).toBe(true);
    expect(tieneGastoLigado({ gasto_id: null, gastos_n: 0, gastos: [] })).toBe(false);
    expect(tieneGastoLigado(null)).toBe(false);
  });

  it("gastosLigadosDe: gastos[] o el espejo de siempre", () => {
    expect(gastosLigadosDe(lote).map((g) => g.id)).toEqual(["g315", "g319", "g326"]);
    const uno = parte("g321", 321, "2231.38");
    expect(gastosLigadosDe({ gasto: uno, gasto_id: "g321" })).toEqual([uno]);
    expect(gastosLigadosDe({ gasto: null, gastos: [] })).toEqual([]);
  });

  it("numeroGastosDe: gastos_n manda; sin él, lo que se ve; con solo gasto_id, 1", () => {
    expect(numeroGastosDe(lote)).toBe(3);
    expect(numeroGastosDe({ gastos_n: 3, gastos: undefined })).toBe(3);
    expect(numeroGastosDe({ gastos: lote.gastos })).toBe(3);
    expect(numeroGastosDe({ gasto_id: "g1" })).toBe(1);
    expect(numeroGastosDe({})).toBe(0);
  });

  it("esCargoConLote y gastoUnicoDe", () => {
    expect(esCargoConLote(lote)).toBe(true);
    expect(gastoUnicoDe(lote)).toBeNull();
    const uno = parte("g321", 321, "2231.38");
    expect(esCargoConLote({ gasto_id: "g321", gasto: uno, gastos_n: 1 })).toBe(false);
    expect(gastoUnicoDe({ gasto_id: "g321", gasto: uno, gastos_n: 1 })).toBe(uno);
    // El API mandó solo gastos[] con una parte: también es la fila de siempre.
    expect(gastoUnicoDe({ gasto_id: "g321", gastos_n: 1, gastos: [uno] })).toBe(uno);
  });
});

describe("estadoLoteCargo + textoSumaLote (GUÍA, con los SPEI reales)", () => {
  it("8,404.20 = 3 × 2,801.40: cuadra exacto (verde)", () => {
    const e = estadoLoteCargo({
      montoCargo: "-8404.20",
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.d), gastoSaesa(SAESA.d), gastoSaesa(SAESA.d)],
    });
    expect(e).toMatchObject({ n: 3, suma: 8404.2, diferencia: 0, tolerancia: 0.03, cuadra: true });
    expect(textoSumaLote(e)).toEqual({
      texto: "3 gastos suman $8,404.20 · cuadra con el cargo de $8,404.20",
      tono: "verde",
    });
  });

  it("4,462.75 = 2,231.37 + 2,231.38: cuadra exacto", () => {
    const e = estadoLoteCargo({
      montoCargo: 4462.75,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.b), gastoSaesa(SAESA.c)],
    });
    expect(e.cuadra).toBe(true);
    expect(e.diferencia).toBe(0);
  });

  it("4,462.75 contra 2 × 2,231.37: cuadra con el centavo de SAESA (tolerancia 0.02)", () => {
    const e = estadoLoteCargo({
      montoCargo: 4462.75,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.b), gastoSaesa(SAESA.b)],
    });
    expect(e).toMatchObject({ suma: 4462.74, diferencia: 0.01, tolerancia: 0.02, cuadra: true });
    expect(textoSumaLote(e)?.texto).toBe(
      "2 gastos suman $4,462.74 · cuadra con el cargo de $4,462.75 (diferencia $0.01)",
    );
  });

  it("2,236.25 contra 2 × 1,118.12: cuadra (diferencia $0.01)", () => {
    const e = estadoLoteCargo({
      montoCargo: 2236.25,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.a), gastoSaesa(SAESA.a)],
    });
    expect(e.cuadra).toBe(true);
    expect(e.diferencia).toBe(0.01);
  });

  it("8,404.20 contra 2 × 2,801.40: faltan $2,801.40 (ámbar)", () => {
    const e = estadoLoteCargo({
      montoCargo: 8404.2,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.d), gastoSaesa(SAESA.d)],
    });
    expect(e).toMatchObject({ cuadra: false, faltan: true, sePasa: false, diferencia: 2801.4 });
    expect(textoSumaLote(e)).toEqual({
      texto: "2 gastos suman $5,602.80 · faltan $2,801.40 para el cargo de $8,404.20",
      tono: "ambar",
    });
  });

  it("8,404.20 contra los 4 gastos de 2,801.40 (#236, #315, #319, #326): se pasan (rojo)", () => {
    const e = estadoLoteCargo({
      montoCargo: 8404.2,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.d), gastoSaesa(SAESA.d), gastoSaesa(SAESA.d), gastoSaesa(SAESA.d)],
    });
    expect(e).toMatchObject({ sePasa: true, faltan: false, cuadra: false });
    expect(textoSumaLote(e)).toEqual({
      texto: "4 gastos suman $11,205.60 · se pasan $2,801.40 del cargo de $8,404.20",
      tono: "rojo",
    });
  });

  it("con UN gasto se conserva la regla de hoy (tolerancia 1.00)", () => {
    // El 2,231.38 que el auto-cruce ligó a un 2,231.37: con uno, cuadra.
    const e = estadoLoteCargo({ montoCargo: 2231.38, monedaCuenta: "MXN", gastos: [gastoSaesa(SAESA.b)] });
    expect(e).toMatchObject({ n: 1, tolerancia: 1, cuadra: true });
    expect(textoSumaLote(e)?.texto).toBe(
      "1 gasto: $2,231.37 · cuadra con el cargo de $2,231.38 (diferencia $0.01)",
    );
    // Un cargo MENOR que el gasto: pago parcial legítimo (ámbar, nunca rojo).
    const p = estadoLoteCargo({ montoCargo: 1118.12, monedaCuenta: "MXN", gastos: [gastoSaesa(SAESA.d)] });
    expect(p).toMatchObject({ parcial: true, sePasa: false });
    expect(textoSumaLote(p)).toEqual({
      texto:
        "1 gasto: $2,801.40 · el cargo de $1,118.12 cubre una parte: el gasto queda como pago parcial (faltan $1,683.28)",
      tono: "ambar",
    });
  });

  it("un gasto que ya tiene otro cargo entra por su FALTANTE", () => {
    expect(aporteDeGasto({ monto: 2801.4, faltante: 1683.28 })).toBe(1683.28);
    expect(aporteDeGasto({ monto: "2801.40" })).toBe(2801.4);
    const e = estadoLoteCargo({
      montoCargo: 2801.4,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.d, { faltante: 1683.28 }), gastoSaesa(SAESA.a)],
    });
    expect(e.cuadra).toBe(true);
  });

  it("los 29 gastos SAESA suman 59,569.87 (tolerancia 0.29)", () => {
    const montos = [
      ...Array(5).fill(SAESA.a),
      ...Array(11).fill(SAESA.b),
      ...Array(2).fill(SAESA.c),
      ...Array(8).fill(SAESA.d),
      1108.38,
      384.89,
      1066.97,
    ];
    const e = estadoLoteCargo({ montoCargo: 59569.87, monedaCuenta: "MXN", gastos: montos.map((m) => gastoSaesa(m)) });
    expect(e).toMatchObject({ n: 29, suma: 59569.87, tolerancia: 0.29, cuadra: true });
  });

  it("monedas mezcladas: la suma no aplica (rojo con 2+, neutro con 1 cruzado)", () => {
    const mixto = estadoLoteCargo({
      montoCargo: 8404.2,
      monedaCuenta: "MXN",
      gastos: [gastoSaesa(SAESA.d), { monto: 150, moneda: "USD" }],
    });
    expect(mixto).toMatchObject({ monedasMezcladas: true, cuadra: false, faltan: false, sePasa: false });
    expect(textoSumaLote(mixto)?.tono).toBe("rojo");
    expect(textoSumaLote(mixto)?.texto).toContain("todos estén en MXN");
    const cruzado = estadoLoteCargo({
      montoCargo: 2677.5,
      monedaCuenta: "MXN",
      gastos: [{ monto: 150, moneda: "USD", cruzado: true }],
    });
    expect(textoSumaLote(cruzado)).toEqual({
      texto: "Gasto en otra moneda: se vincula 1 a 1 y el sistema guarda el tipo de cambio real del banco.",
      tono: "neutro",
    });
  });

  it("sin marcados no hay línea", () => {
    expect(textoSumaLote(estadoLoteCargo({ montoCargo: 1, monedaCuenta: "MXN", gastos: [] }))).toBeNull();
  });
});

describe("candidatos del diálogo", () => {
  it("fichaCandidatoGasto: la `nota` del API desempata los 29 SAESA", () => {
    const c = candidato("g315", 2801.4);
    const desc = descripcionCandidatoGasto(fichaCandidatoGasto(c));
    expect(desc).toContain("Pago VIP SAESA");
    expect(desc).toContain("vuelo #315");
    // Sin el mapeo la descripción no traía la nota.
    expect(descripcionCandidatoGasto(c)).not.toContain("Pago VIP SAESA");
  });

  it("motivoVetoLote: solo cruzado y moneda distinta", () => {
    expect(motivoVetoLote(candidato("a", 1), "MXN")).toBeNull();
    expect(motivoVetoLote(candidato("a", 150, { moneda: "USD", cruzado: true }), "MXN")).toBe(
      "Gasto en USD contra una cuenta en MXN: se vincula solo (1 a 1), nunca junto con otros gastos.",
    );
    expect(motivoVetoLote(candidato("a", 150, { moneda: "USD" }), "MXN")).toBe(
      "Gasto en USD y la cuenta en MXN: no entra en un cargo con varios gastos.",
    );
    // Sin moneda de la cuenta no se inventa un veto.
    expect(motivoVetoLote(candidato("a", 150, { moneda: "USD" }), null)).toBeNull();
  });

  it("bloqueoDeFila: un cruzado se marca SOLO; marcado él, se apagan los demás", () => {
    const usd = candidato("usd", 150, { moneda: "USD", cruzado: true });
    const mxn = candidato("mxn", 2801.4);
    expect(bloqueoDeFila(usd, "MXN", [])).toBeNull();
    expect(bloqueoDeFila(usd, "MXN", [mxn])).toContain("se vincula solo");
    expect(bloqueoDeFila(mxn, "MXN", [usd])).toBe(
      "Ya marcaste un gasto en otra moneda: ese se vincula solo. Desmárcalo para elegir varios.",
    );
    // Lo marcado nunca se apaga (siempre se puede desmarcar).
    expect(bloqueoDeFila(usd, "MXN", [usd, mxn])).toBeNull();
  });

  it("idsParaVincular: sin repetir; con 2+ los vetados NUNCA viajan", () => {
    const usd = candidato("usd", 150, { moneda: "USD", cruzado: true });
    const a = candidato("a", 2801.4);
    const b = candidato("b", 2801.4);
    expect(idsParaVincular([a, a, b], "MXN")).toEqual(["a", "b"]);
    expect(idsParaVincular([a, usd, b], "MXN")).toEqual(["a", "b"]);
    expect(idsParaVincular([usd], "MXN")).toEqual(["usd"]); // el 1↔1 cruzado de siempre
    expect(idsParaVincular([], "MXN")).toEqual([]);
  });

  it("los marcados suben al principio aunque no coincidan con la búsqueda", () => {
    const a = candidato("a", 1);
    const b = candidato("b", 2);
    const c = candidato("c", 3);
    expect(listaConMarcadosPrimero([b, c], [a, c]).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("el sugerido por la IA va al frente (con su ficha de sugerencia.candidatos)", () => {
    const a = candidato("a", 1);
    const b = candidato("b", 2);
    expect(conSugeridoAlFrente([a, b], b).map((x) => x.id)).toEqual(["b", "a"]);
    expect(conSugeridoAlFrente([a], b).map((x) => x.id)).toEqual(["b", "a"]);
    expect(conSugeridoAlFrente([a], null).map((x) => x.id)).toEqual(["a"]);
    const s: SugerenciaConciliacion = {
      disponible: true,
      gasto_id_sugerido: "b",
      confianza: 0.9,
      razon: "Monto exacto",
      candidatos: [a, b],
    };
    expect(fichaSugerida(s)?.id).toBe("b");
    expect(fichaSugerida({ ...s, gasto_id_sugerido: null })).toBeNull();
    expect(fichaSugerida(null)).toBeNull();
  });

  it("normalizarBusquedaMonto / busquedaParaApi", () => {
    expect(normalizarBusquedaMonto("2,801.40")).toBe("2801.40");
    expect(normalizarBusquedaMonto("$ 2801.40")).toBe("2801.40");
    expect(normalizarBusquedaMonto("2801")).toBe("2801");
    expect(normalizarBusquedaMonto("  Pago   VIP SAESA ")).toBe("Pago VIP SAESA");
    expect(normalizarBusquedaMonto(null)).toBe("");
    expect(busquedaParaApi("x".repeat(120))).toHaveLength(LARGO_MAX_BUSQUEDA);
  });
});

describe("textos del diálogo", () => {
  it("cabecera, buscador, ventana y botones", () => {
    expect(descripcionVincularGasto({ monto: "-8404.20", fecha: "2026-09-24", descripcion: "SPEI SAESA" })).toBe(
      `Cargo de $8,404.20 del ${fmtDateOnly("2026-09-24")} · SPEI SAESA. Marca el gasto que pagó; si pagó varias facturas, márcalas todas.`,
    );
    expect(PLACEHOLDER_BUSCAR_GASTO).toBe("Busca por monto (2801.40), proveedor o nota");
    expect(etiquetaListaCandidatos(VENTANA_CARGO_DIAS)).toBe("Gastos candidatos · ±30 días");
    expect(textoAmpliarVentana(VENTANA_AMPLIADA_DIAS)).toBe("Ampliar a 120 días");
    expect(NOTA_VENTANA_CARGO(30)).toContain("±30 días del cargo");
    expect(textoTruncado(100)).toBe(
      "Se muestran los primeros 100: escribe el monto, el proveedor o la nota para encontrar el que buscas.",
    );
    expect(botonVincularGastos(0)).toBe("Vincular");
    expect(botonVincularGastos(1)).toBe("Vincular 1 gasto");
    expect(botonVincularGastos(3)).toBe("Vincular 3 gastos");
    expect(BOTON_CANCELAR).toBe("Cancelar");
    expect(MSG_TOPE_GASTOS_LOTE).toBe("Un cargo admite hasta 50 gastos.");
    expect(textoMotivoPendienteDialogo("Ambiguo entre 3")).toBe("Quedó pendiente: ambiguo entre 3.");
    expect(textoIaSinPropuesta("ningún monto cuadra")).toBe("La IA no propuso ninguno: ningún monto cuadra");
  });

  it("estadoBuscadorGastos: el ERROR va ANTES que el vacío", () => {
    expect(estadoBuscadorGastos({ cargando: true, error: null, q: "", resultados: 0 }).tipo).toBe("cargando");
    expect(estadoBuscadorGastos({ cargando: true, error: null, q: "2801.40", resultados: 0 }).texto).toBe(
      "Buscando «2801.40»…",
    );
    const err = estadoBuscadorGastos({ cargando: false, error: MSG_SERVIDOR_NO_RESPONDIO, q: "", resultados: 0 });
    expect(err).toEqual({ tipo: "error", texto: MSG_SERVIDOR_NO_RESPONDIO });
    expect(estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 0 })).toEqual({
      tipo: "vacio_sin_q",
      texto:
        "No hay gastos bancarios pendientes en ±30 días del cargo. Amplía a 120 días o búscalo por monto, proveedor o nota.",
    });
    expect(estadoBuscadorGastos({ cargando: false, error: null, q: "SAESA", resultados: 0, dias: 120 })).toEqual({
      tipo: "vacio_con_q",
      texto:
        "Ningún gasto pendiente coincide con «SAESA» en ±120 días del cargo. Búscalo por monto, proveedor o nota, o captura el gasto que falta.",
    });
    expect(estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 7 })).toEqual({
      tipo: "lista",
      texto: "",
    });
    expect(
      estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 100, truncado: true }).texto,
    ).toBe(textoTruncado(100));
  });

  it("toastVinculoGastos: 3 gastos, todos cubiertos / parciales / uno (el de siempre)", () => {
    const partes = ["g315", "g319", "g326"].map((gasto_id) => ({
      gasto_id,
      monto_parte: 2801.4,
      moneda: "MXN",
      gasto_conciliado: true,
      monto_vinculado: 2801.4,
      faltante: 0,
    }));
    expect(toastVinculoGastos({ gastos_estado: partes })).toEqual({
      titulo: "3 gastos vinculados · $8,404.20",
      descripcion: "Todos cubiertos",
    });
    const conParcial = [
      partes[0],
      partes[1],
      { ...partes[2], gasto_conciliado: false, monto_vinculado: 1118.12, faltante: 1683.28 },
    ];
    expect(toastVinculoGastos({ gastos_estado: conParcial })).toEqual({
      titulo: "3 gastos vinculados · $8,404.20",
      descripcion: "2 cubiertos · 1 parcial (faltan $1,683.28)",
    });
    // Una sola parte: el toast de siempre (cubierto / pago parcial).
    expect(
      toastVinculoGastos({
        gastos_estado: [partes[0]],
        gasto_conciliado: true,
        monto_vinculado: 2801.4,
        faltante: 0,
      }).titulo,
    ).toBe("Gasto cubierto");
    expect(toastVinculoGastos(null)).toEqual({ titulo: "Gasto vinculado" });
  });

  it("menú y confirmación de desvincular un lote", () => {
    expect(menuDesvincularGastos(3)).toBe("Desvincular los 3 gastos");
    expect(tituloDesvincularGastos(3)).toBe("¿Desvincular los 3 gastos?");
    expect(textoConfirmarDesvincularGastos(3)).toBe(
      "El cargo vuelve a quedar pendiente de conciliar y los 3 gastos dejan de estar cubiertos por él (vuelven a «Gastos sin banco»; si alguno tiene otros cargos ligados, se queda como pago parcial).",
    );
    expect(toastDesvinculoGastos(3)).toBe("3 gastos desvinculados: el cargo vuelve a Pendiente");
  });
});

describe("errores del API", () => {
  it("CARGO_NO_CUADRA con details: cuánto y qué hacer", () => {
    const t = textoCargoNoCuadra("CARGO_NO_CUADRA: los 2 gastos suman 5602.80 y el cargo es de 8404.20", {
      monto_cargo: 8404.2,
      suma_gastos: 5602.8,
      diferencia: 2801.4,
      tolerancia: 0.02,
      moneda: "MXN",
      gastos: [
        { id: "g315", monto: 2801.4, faltante: 2801.4 },
        { id: "g319", monto: 2801.4, faltante: 2801.4 },
      ],
    });
    expect(t.titulo).toBe("Los 2 gastos suman $5,602.80 y el cargo es de $8,404.20");
    expect(t.descripcion).toBe(
      "Diferencia $2,801.40 (se acepta hasta $0.02 por los centavos del redondeo). Faltan gastos: marca los que también pagó este cargo.",
    );
    const sobra = textoCargoNoCuadra(null, {
      monto_cargo: 2236.25,
      suma_gastos: 3354.36,
      moneda: "MXN",
      gastos: [
        { id: "a", monto: 1118.12, faltante: 1118.12 },
        { id: "b", monto: 2801.4, faltante: 1118.12 },
        { id: "c", monto: 1118.12, faltante: 1118.12 },
      ],
    });
    expect(sobra.descripcion).toContain("Sobran gastos");
    expect(sobra.descripcion).toContain("1 gasto ya tenía otro cargo ligado: entra solo por lo que le falta.");
    // Sin details: el mensaje del API sin el código.
    expect(textoCargoNoCuadra("CARGO_NO_CUADRA: los 2 gastos no suman el cargo", null).titulo).toBe(
      "Los 2 gastos no suman el cargo",
    );
  });

  it("LOTE_MONEDA_DISTINTA, MOVIMIENTO_CON_LOTE y GASTO_YA_CUBIERTO con gasto_id", () => {
    expect(
      textoLoteMonedaDistinta(null, { gasto_id: "g", moneda_gasto: "USD", moneda_cuenta: "MXN" }).titulo,
    ).toBe("Un gasto está en USD y la cuenta en MXN");
    const lote = textoMovimientoConLote("MOVIMIENTO_CON_LOTE: este cargo ya paga 3 gastos", { gastos_n: 3 });
    expect(lote.titulo).toBe("Este cargo ya paga 3 gastos");
    expect(lote.descripcion).toContain("«Desvincular los 3 gastos»");
    const cubierto = textoGastoYaCubiertoLote(
      "GASTO_YA_CUBIERTO: el gasto ya está cubierto",
      { gasto_id: "g315", movimientos: [] },
      (id) => (id === "g315" ? "Operaciones · $2,801.40 MXN" : null),
    );
    expect(cubierto.titulo).toBe("El gasto ya está cubierto");
    expect(cubierto.descripcion.startsWith("Gasto: Operaciones · $2,801.40 MXN. ")).toBe(true);
  });

  it("mensajeErrorVincularGastos despacha por código; el API viejo pasa al respaldo", () => {
    expect(mensajeErrorVincularGastos({ code: "API_SIN_LOTE", status: 400 })).toEqual({
      titulo: MSG_LOTE_API_VIEJO,
      recargar: false,
      apiSinLote: true,
    });
    expect(mensajeErrorVincularGastos({ code: "MOVIMIENTO_CON_LOTE", status: 409 }).recargar).toBe(true);
    expect(mensajeErrorVincularGastos({ code: "MOVIMIENTO_YA_LIGADO", status: 409 }).recargar).toBe(true);
    expect(
      mensajeErrorVincularGastos({
        code: "CARGO_NO_CUADRA",
        status: 409,
        details: { monto_cargo: 8404.2, suma_gastos: 5602.8, moneda: "MXN", gastos: [{}, {}] },
      }).titulo,
    ).toBe("Los 2 gastos suman $5,602.80 y el cargo es de $8,404.20");
    expect(mensajeErrorVincularGastos({ status: 502, code: "PARSE_ERROR", error: "Bad Gateway" }).titulo).toBe(
      MSG_SERVIDOR_NO_RESPONDIO,
    );
  });

  it("mensajeErrorBusquedaGastos: técnico ⇒ «El servidor no respondió…»; el español se pinta", () => {
    for (const r of [
      { status: 502, code: "PARSE_ERROR", error: "Bad Gateway" },
      { error: "fetch failed" },
      { error: "Failed to fetch" },
      { status: 500, code: "INTERNAL_ERROR", error: "Internal server error" },
      { status: 500 },
    ]) {
      expect(mensajeErrorBusquedaGastos(r)).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    }
    expect(mensajeErrorBusquedaGastos({ code: "RUTA_NO_DISPONIBLE", status: 404 })).toBe(MSG_LOTE_API_VIEJO);
    expect(mensajeErrorBusquedaGastos({ code: "CONCILIACION_PARTES_NO_DISPONIBLE", status: 503 })).toBe(
      MSG_LOTE_API_VIEJO,
    );
    expect(mensajeErrorBusquedaGastos({ status: 401 })).toContain("sesión");
    expect(mensajeErrorBusquedaGastos({ status: 403 })).toBe("Tu usuario no puede conciliar movimientos del banco.");
    expect(
      mensajeErrorBusquedaGastos({ status: 400, code: "SOLO_CARGOS", error: "SOLO_CARGOS: solo un cargo se liga a gastos" }),
    ).toBe("Solo un cargo se liga a gastos");
  });

  it("API previo: ruta inexistente, DTO sin gasto_ids o migración pendiente", () => {
    expect(esRutaInexistente({ status: 404, error: "Cannot GET /v1/conciliacion/movimientos/x/gastos-candidatos" })).toBe(
      true,
    );
    expect(esRutaInexistente({ status: 404, error: "Movimiento no encontrado" })).toBe(false);
    expect(esDtoSinLote({ status: 400, error: "property gasto_ids should not exist" })).toBe(true);
    expect(esDtoSinLote({ status: 400, error: "gasto_ids must be an array" })).toBe(false);
    expect(esApiSinLote({ code: "CONCILIACION_PARTES_NO_DISPONIBLE", status: 503 })).toBe(true);
    expect(esApiSinLote({ code: "RUTA_NO_DISPONIBLE" })).toBe(true);
    expect(esApiSinLote({ code: "API_SIN_LOTE" })).toBe(true);
    expect(esApiSinLote({ code: "CARGO_NO_CUADRA", status: 409 })).toBe(false);
    expect(esApiSinLote(null)).toBe(false);
  });

  it("textoErrorSugerencia: 404 API previo, 403 solo ADMIN, técnico", () => {
    expect(textoErrorSugerencia({ status: 404 }).descripcion).toContain("falta desplegar el API");
    expect(textoErrorSugerencia({ status: 403 }).titulo).toBe("El asistente de conciliación es solo para ADMIN");
    expect(textoErrorSugerencia({ error: "fetch failed" }).titulo).toBe(MSG_SERVIDOR_NO_RESPONDIO);
  });
});

describe("columna «Conciliación» y búsqueda de la tabla", () => {
  const tres = [parte("g315", 315, "2801.40"), parte("g319", 319, "2801.40"), parte("g326", 326, "2801.40")];

  it("3 gastos: título, una línea por gasto con su liga, sin «y N más»", () => {
    const r = resumenLoteFila({ monto: "8404.20", gastos_n: 3, gastos: tres, gastos_suma: 8404.2, gastos_diferencia: 0 });
    expect(r?.titulo).toBe("3 gastos · $8,404.20");
    expect(r?.lineas.map((l) => l.principal)).toEqual([
      "Operaciones · $2,801.40 · vuelo #315",
      "Operaciones · $2,801.40 · vuelo #319",
      "Operaciones · $2,801.40 · vuelo #326",
    ]);
    expect(r?.lineas[0].href).toBe("/admin/flights/v-315");
    expect(r?.lineas[0].secundaria).toBe(`Pago VIP SAESA · ${fmtDateOnly("2026-09-14")}`);
    expect(r?.mas).toBeNull();
    expect(r?.diferencia).toBeNull();
  });

  it("5 gastos ⇒ «y 2 más»; el centavo del lote ⇒ «diferencia $0.01»", () => {
    const cinco = [...tres, parte("g1", 1, "1118.12"), parte("g2", 2, "1118.12")];
    const r = resumenLoteFila({ monto: "11640.43", gastos_n: 5, gastos: cinco });
    expect(r?.lineas).toHaveLength(3);
    expect(r?.mas).toBe("y 2 más");
    const centavo = resumenLoteFila({
      monto: "4462.75",
      gastos_n: 2,
      gastos: [parte("g318", 318, "2231.37"), parte("g322", 322, "2231.37")],
      gastos_suma: 4462.74,
      gastos_diferencia: "0.01",
    });
    expect(centavo?.titulo).toBe("2 gastos · $4,462.74");
    expect(centavo?.diferencia).toBe("diferencia $0.01");
  });

  it("una parte que cubre solo una porción del gasto lo dice («de $X»); proveedor antes que la nota", () => {
    const l = lineaGastoLote(
      parte("g", 315, "2801.40", { monto_parte: "1118.12", proveedor: { nombre: "SAESA" }, vuelo: null, vuelo_id: null }),
    );
    expect(l.principal).toBe("Operaciones · $1,118.12 de $2,801.40");
    expect(l.secundaria.startsWith("SAESA · ")).toBe(true);
    expect(l.href).toBe("/admin/expenses");
  });

  it("sin gastos[] (skew de deploy): null + texto sin ligas", () => {
    expect(resumenLoteFila({ gastos_n: 3, gastos: undefined })).toBeNull();
    expect(textoLoteSinDetalle(3)).toBe("3 gastos conciliados");
    expect(textoLoteSinDetalle(1)).toBe("1 gasto conciliado");
    expect(TOOLTIP_LOTE_SIN_DETALLE).toBe("detalle no disponible: recarga");
  });

  it("textoBusquedaGastos: categoría, nota, folio y monto de cada parte", () => {
    const t = textoBusquedaGastos({ gastos: tres });
    expect(t).toContain("Operaciones");
    expect(t).toContain("Pago VIP SAESA");
    expect(t).toContain("#319");
    expect(t).toContain("2801.40");
    expect(textoBusquedaGastos({})).toBe("");
  });
});

describe("respaldo con un API previo (un solo gasto)", () => {
  it("la IA va arriba con ★ y después la lista precargada sin repetir", () => {
    const precargados = [
      { value: "p1", label: "Operaciones · $10.00 MXN" },
      { value: "b", label: "duplicado de la IA" },
    ];
    const s: SugerenciaConciliacion = {
      disponible: true,
      gasto_id_sugerido: "b",
      confianza: 0.92,
      razon: null,
      candidatos: [candidato("a", 1118.12), candidato("b", 2801.4)],
    };
    const ops = opcionesRespaldoVincular(precargados, s);
    expect(ops.map((o) => o.value)).toEqual(["b", "a", "p1"]);
    expect(ops[0].label.startsWith("★ ")).toBe(true);
    expect(ops[0].description).toContain("Sugerido por la IA");
    expect(opcionesRespaldoVincular(precargados, null)).toEqual(precargados);
  });
});

describe("errores técnicos (fuente única, movida desde reversos)", () => {
  it("el regex y la regla", () => {
    expect(RE_TEXTO_TECNICO.test("Bad Gateway")).toBe(true);
    expect(esTextoTecnico("socket hang up")).toBe(true);
    expect(esTextoTecnico("")).toBe(true);
    expect(esTextoTecnico("El gasto ya está cubierto.")).toBe(false);
    expect(esErrorTecnico({ code: "PARSE_ERROR", error: "Algo en español" })).toBe(true);
    expect(esErrorTecnico({ error: "El emparejado quedó a medias." })).toBe(false);
  });

  it("reversos sigue diciendo lo mismo con la regla compartida", () => {
    expect(mensajeErrorReverso({ status: 502, code: "PARSE_ERROR", error: "Bad Gateway" }).titulo).toBe(
      MSG_SERVIDOR_NO_RESPONDIO,
    );
  });
});

describe("reversos: un abono con gastos (dato inconsistente) no es «pendiente»", () => {
  const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
  const cargo = {
    id: "c1",
    tipo: "CARGO",
    cuenta_bancaria_id: CUENTA,
    fecha: "2026-09-21",
    monto: "825.13",
    descripcion: "ASUR CANCUN",
    conciliado: false,
  };
  const abono = (extra: Record<string, unknown>) => ({
    id: "a1",
    tipo: "ABONO",
    cuenta_bancaria_id: CUENTA,
    fecha: "2026-09-23",
    monto: "825.13",
    descripcion: "CARGO INDEBIDO 21 SEP 35552",
    conciliado: false,
    gasto_id: null,
    ...extra,
  });

  it("gastos_n > 0 o gastos[] lo excluyen aunque conciliado diga false", () => {
    expect(abonosCandidatosParaCargo(cargo, [abono({})]).map((c) => c.id)).toEqual(["a1"]);
    expect(abonosCandidatosParaCargo(cargo, [abono({ gastos_n: 2 })])).toEqual([]);
    expect(abonosCandidatosParaCargo(cargo, [abono({ gastos: [{ id: "g" }] })])).toEqual([]);
  });
});
