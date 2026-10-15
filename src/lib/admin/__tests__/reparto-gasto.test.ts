/**
 * Reparto entre aviones desde «Verificar / editar» (14-oct-2026): la fuente
 * única PURA `lib/admin/reparto-gasto.ts`. Datos REALES de prod (ids de los
 * aviones; STARLINK e23b5587 = INDIRECTO $4,733.76 MXN 3 × $1,577.92;
 * af52d6f4 = INDIRECTO N621TX 100 %; Cramex 37471011 = $16,240.00 en XA-VGV y
 * XB-PEV 8,120/8,120; f3c625e6 = INDIRECTO $64,342.00 con N4142R, septiembre).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as mod from "@/lib/admin/reparto-gasto";
import { CATEGORIA_GASTO_LABELS, categoriaLlevaAvion } from "@/lib/admin/categorias-gasto";
import {
  AVISO_REPARTO_FIJO,
  DESTINO_PENDIENTE_DE_AVION,
  ETIQUETA_AVION_RESUELVE_PENDIENTE,
  ETIQUETA_AVION_SOLO_REFERENCIA,
  HINT_AVION_PERSONAL,
  MSG_COMBUSTIBLE_NECESITA_AVION,
  MSG_REPARTO_CARGANDO,
  MSG_REPARTO_CONCILIADO,
  MSG_REPARTO_EXCEDE,
  MSG_REPARTO_INCOMPATIBLE,
  MSG_REPARTO_SIN_AVIONES,
  MSG_REPARTO_SIN_AVIONES_GUARDADO,
  MSG_SERVIDOR_NO_RESPONDIO,
  TEXTO_RETIRAR_SIN_RESPUESTA,
  TEXTO_SIN_RESPUESTA_GUARDAR,
  TEXTO_VUELO_SIN_RESPUESTA,
  TOAST_AVISO_MS,
  TOAST_LARGO_MS,
  avisoMatriculaFueraDeReparto,
  avisoRepartoSeQuita,
  ayudaModoUno,
  configAvionGasto,
  confirmacionRepartoAlGuardar,
  debePrellenarAvionPorMatricula,
  descripcionVerificarGasto,
  destinoTrasQuitar,
  dineroCambia,
  dividirIgualesCents,
  errorQuitarRepartoSinAvion,
  errorRepartoEnPantalla,
  esRechazoPorReparto,
  estadoRepartoInicial,
  estadoRepartoTrasFalla,
  etiquetaCampoAvionSinModos,
  filasRepartoEditor,
  hojaDestinoReparto,
  iaConsumidaPorReparto,
  iaRespetaReparto,
  itemsDePartes,
  itemsDeSeleccion,
  lineaCategoriaQuitaReparto,
  lineaResumenReparto,
  lineaTotalPagadoReparto,
  llamarSinLanzar,
  mensajeResultadoGastoReparto,
  mesesTerminados,
  mismoReparto,
  montoReparto,
  motivoLegible,
  msgRepartoIncoherente,
  notaCategoriaEntreRepartibles,
  notaIaConReparto,
  notaMontoConReparto,
  notaRepartoMesTerminado,
  partesDeGasto,
  partesDeRespuesta,
  planGuardadoReparto,
  quitasDelReparto,
  resumenReparto,
  resumenRepartoTexto,
  seleccionDesdePartes,
  seleccionInicialAlRepartir,
  siguienteMontoMarcado,
  techoRepartoCents,
  textoConfirmarRegresar,
  textoExitoGastoReparto,
  textoFalloCargaAviones,
  textoQueCambiaAlRepartir,
  textoQuitarRepartoDialogo,
  textoRefuerzoAvion,
  textoRegresadoOk,
  textoRegresarError,
  textoRepartoActualizado,
  textoRepartoDescubierto,
  textoRepartoInactivos,
  textoRepartoMoneda,
  textoRepartoSinMonto,
  tituloModoUno,
  toastRepartoQuitadoDialogo,
  unirMatriculas,
  validarItemsReparto,
  type AvionReparto,
  type ContextoResultadoReparto,
  type EntradaPlanReparto,
  type ItemReparto,
  type ParteReparto,
  type ResultadoGastoConReparto,
} from "@/lib/admin/reparto-gasto";
import type { Gasto, RepartoResponse } from "@/types/expenses";

// ===== Datos reales de prod (14-oct-2026) =====
const N4142R = "5a82eb4a-086c-4058-97bd-b2aacdc2e942";
const N58BT = "0caf610a-7989-4961-b473-988714719a5d";
const N621TX = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";
const N990GG = "8f37ec37-965a-42a8-bac4-9991d282f0a3";
const XA_VGV = "3d0546c3-941f-45cc-b8a9-e3ee77545e68";
const XB_ANU = "88e4c899-fd95-4560-aa83-1b5760d4da3f";
const XB_IJP = "90823b46-1e0e-4cfc-9301-9cb416857c4a";
const XB_PEV = "a0114a3e-9919-41e8-b8e4-fa433d3f3737";

/** Los 7 aviones ACTIVOS de prod, en el orden del API. */
const ACTIVOS: AvionReparto[] = [
  { id: N4142R, matricula: "N4142R", modelo: "PIPER SENECA V" },
  { id: N58BT, matricula: "N58BT", modelo: "PIPER Meridian" },
  { id: N621TX, matricula: "N621TX", modelo: "Kodiak 100" },
  { id: N990GG, matricula: "N990GG", modelo: "Seneca V" },
  { id: XA_VGV, matricula: "XA-VGV", modelo: "Cessna 206" },
  { id: XB_ANU, matricula: "XB-ANU", modelo: "CESSNA 182" },
  { id: XB_PEV, matricula: "XB-PEV", modelo: "Cessna 205" },
];

/** El embed REAL de STARLINK (montos texto y número, aeronave objeto y arreglo). */
const EMBED_STARLINK = [
  { aeronave_id: N990GG, monto: "1577.92", aeronave: { matricula: "N990GG" } },
  {
    aeronave_id: N4142R,
    monto: 1577.92,
    aeronave: [{ matricula: "N4142R" }] as unknown as { matricula: string },
  },
  { aeronave_id: N621TX, monto: "1577.92", aeronave: { matricula: "N621TX" } },
];

const STARLINK: ParteReparto[] = [
  { aeronave_id: N4142R, matricula: "N4142R", monto: 1577.92 },
  { aeronave_id: N621TX, matricula: "N621TX", monto: 1577.92 },
  { aeronave_id: N990GG, matricula: "N990GG", monto: 1577.92 },
];
const CRAMEX: ParteReparto[] = [
  { aeronave_id: XA_VGV, matricula: "XA-VGV", monto: 8120 },
  { aeronave_id: XB_PEV, matricula: "XB-PEV", monto: 8120 },
];
const RESUMEN_STARLINK = "N4142R $1,577.92 MXN · N621TX $1,577.92 MXN · N990GG $1,577.92 MXN";

function respuesta(items: ParteReparto[], monto: number, extra: Partial<RepartoResponse["gasto"]> = {}): RepartoResponse {
  const suma = items.reduce((a, i) => a + Math.round(i.monto * 100), 0) / 100;
  return {
    gasto: { id: "g", categoria: "INDIRECTO", monto, moneda: "MXN", fecha_gasto: "2026-09-01", notas: null, ...extra },
    items: items.map((i) => ({ aeronave_id: i.aeronave_id, monto: i.monto, matricula: i.matricula })),
    suma,
    remanente_empresa: Math.round((monto - suma) * 100) / 100,
  };
}

describe("dinero y datos", () => {
  it("montoReparto: siempre con su moneda", () => {
    expect(montoReparto(1577.92, "MXN")).toBe("$1,577.92 MXN");
    expect(montoReparto(0, "MXN")).toBe("$0.00 MXN");
    expect(montoReparto(1500, "USD")).toBe("$1,500 USD");
    expect(montoReparto(8050.4, "USD")).toBe("$8,050.40 USD");
  });

  it("unirMatriculas: «A» · «A y B» · «A, B y C»; null ⇒ «¿?»", () => {
    expect(unirMatriculas(["N4142R"])).toBe("N4142R");
    expect(unirMatriculas(["N4142R", "N621TX"])).toBe("N4142R y N621TX");
    expect(unirMatriculas(["N4142R", "N621TX", "N990GG"])).toBe("N4142R, N621TX y N990GG");
    expect(unirMatriculas(["N4142R", null])).toBe("N4142R y ¿?");
    expect(unirMatriculas([])).toBe("");
  });

  it("partesDeGasto con el embed REAL de STARLINK: centavos, objeto o arreglo, por matrícula", () => {
    expect(partesDeGasto({ repartos: EMBED_STARLINK })).toEqual(STARLINK);
    // Matrícula faltante ⇒ null y al final.
    const sinJoin = partesDeGasto({
      repartos: [
        { aeronave_id: XB_PEV, monto: "300.004", aeronave: null },
        { aeronave_id: N4142R, monto: "300", aeronave: { matricula: "N4142R" } },
      ],
    });
    expect(sinJoin).toEqual([
      { aeronave_id: N4142R, matricula: "N4142R", monto: 300 },
      { aeronave_id: XB_PEV, matricula: null, monto: 300 },
    ]);
    expect(partesDeGasto({})).toEqual([]);
  });

  it("partesDeRespuesta: matrícula null tolerada; orden por matrícula (el API ordena por monto)", () => {
    const r = respuesta(
      [
        { aeronave_id: N990GG, matricula: "N990GG", monto: 2000 },
        { aeronave_id: XB_PEV, matricula: null, monto: 100 },
        { aeronave_id: N4142R, matricula: "N4142R", monto: 50 },
      ],
      5000,
    );
    expect(partesDeRespuesta(r).map((p) => p.matricula)).toEqual(["N4142R", "N990GG", null]);
  });

  it("estadoRepartoInicial (R1)", () => {
    expect(estadoRepartoInicial({ repartos: EMBED_STARLINK, categoria: "INDIRECTO", vuelo_id: null })).toBe("REPARTIDO");
    expect(estadoRepartoInicial({ repartos: [], categoria: "INDIRECTO", vuelo_id: null })).toBe("SIN_REPARTO");
    expect(estadoRepartoInicial({ categoria: "INDIRECTO", vuelo_id: null })).toBe("POR_CONFIRMAR");
    expect(estadoRepartoInicial({ categoria: "OTRO", vuelo_id: "v-1" })).toBe("SIN_REPARTO");
    expect(estadoRepartoInicial({ categoria: "COMIDA", vuelo_id: null })).toBe("SIN_REPARTO");
  });

  it("itemsDePartes, seleccionDesdePartes y seleccionInicialAlRepartir", () => {
    expect(itemsDePartes(STARLINK)).toEqual([
      { aeronave_id: N4142R, monto: 1577.92 },
      { aeronave_id: N621TX, monto: 1577.92 },
      { aeronave_id: N990GG, monto: 1577.92 },
    ]);
    expect(seleccionDesdePartes(CRAMEX)).toEqual({
      [XA_VGV]: { incluir: true, monto: "8120.00" },
      [XB_PEV]: { incluir: true, monto: "8120.00" },
    });
    expect(seleccionInicialAlRepartir(N4142R, 6434200)).toEqual({
      [N4142R]: { incluir: true, monto: "64342.00" },
    });
    expect(seleccionInicialAlRepartir(null, 6434200)).toEqual({});
  });

  it("filasRepartoEditor: sin lista solo las partes; con los 7 activos + XB-IJP inactivo", () => {
    expect(filasRepartoEditor(null, STARLINK)).toEqual([
      { id: N4142R, matricula: "N4142R", modelo: "" },
      { id: N621TX, matricula: "N621TX", modelo: "" },
      { id: N990GG, matricula: "N990GG", modelo: "" },
    ]);
    const filas = filasRepartoEditor(ACTIVOS, [
      ...STARLINK,
      { aeronave_id: XB_IJP, matricula: "XB-IJP", monto: 10 },
    ]);
    expect(filas).toHaveLength(8);
    expect(filas[7]).toEqual({ id: XB_IJP, matricula: "XB-IJP", modelo: "Inactivo", inactivo: true });
    expect(filas.slice(0, 7).every((f) => !f.inactivo)).toBe(true);
    expect(filasRepartoEditor(ACTIVOS, [{ aeronave_id: XB_IJP, matricula: null, monto: 1 }])[7].matricula).toBe("¿?");
  });

  it("itemsDeSeleccion: solo marcados con monto > 0, a 2 decimales, en el orden de las filas", () => {
    const sel = {
      [N990GG]: { incluir: true, monto: "1577.925" },
      [N4142R]: { incluir: true, monto: "100" },
      [N621TX]: { incluir: false, monto: "50" },
      [N58BT]: { incluir: true, monto: "" },
      [XB_ANU]: { incluir: true, monto: "0.004" },
    };
    expect(itemsDeSeleccion(ACTIVOS, sel)).toEqual([
      { aeronave_id: N4142R, monto: 100 },
      { aeronave_id: N990GG, monto: 1577.93 },
    ]);
  });

  it("techoRepartoCents: el total pagado en vivo; ticket y propina vacíos ⇒ el monto guardado", () => {
    expect(techoRepartoCents({ ticket: "4733.76", propina: "", montoGuardado: "4733.76" })).toBe(473376);
    expect(techoRepartoCents({ ticket: "", propina: "", montoGuardado: "4733.76" })).toBe(473376);
    expect(techoRepartoCents({ ticket: "1000", propina: "15.5", montoGuardado: "1" })).toBe(101550);
    // 76e042c9 (propina = monto ⇒ ticket 0).
    expect(techoRepartoCents({ ticket: "0", propina: "1500", montoGuardado: "1500.00" })).toBe(150000);
  });

  it("resumenReparto de STARLINK: resto 0 con el total; se pasa 73376 con $4,000.00; sin monto e inactivos", () => {
    const filas = filasRepartoEditor(null, STARLINK);
    const sel = seleccionDesdePartes(STARLINK);
    const r = resumenReparto(filas, sel, 473376);
    expect(r.sumaCents).toBe(473376);
    expect(r.restoCents).toBe(0);
    expect(r.excedidoCents).toBe(0);
    const bajo = resumenReparto(filas, sel, 400000);
    expect(bajo.excedidoCents).toBe(73376);
    expect(bajo.restoCents).toBe(0);
    const conHuecos = resumenReparto(
      filasRepartoEditor(ACTIVOS, [{ aeronave_id: XB_IJP, matricula: "XB-IJP", monto: 10 }]),
      { [N4142R]: { incluir: true, monto: "" }, [XB_IJP]: { incluir: true, monto: "10" } },
      100000,
    );
    expect(conHuecos.sinMonto).toEqual(["N4142R"]);
    expect(conHuecos.inactivos).toEqual(["XB-IJP"]);
  });

  it("dividirIgualesCents: el PRIMERO absorbe el residuo", () => {
    expect(dividirIgualesCents(473376, 3)).toEqual([157792, 157792, 157792]);
    expect(dividirIgualesCents(100000, 3)).toEqual([33334, 33333, 33333]);
    // QA 5 del diseño: $317.17 entre dos ⇒ 158.58 + 158.59.
    expect(dividirIgualesCents(31717, 2)).toEqual([15858, 15859]);
    expect(dividirIgualesCents(0, 0)).toEqual([]);
  });

  it("mismoReparto: por avión, a centavos, sin importar el orden", () => {
    const a: ItemReparto[] = [
      { aeronave_id: N4142R, monto: 1577.92 },
      { aeronave_id: N621TX, monto: 1577.92 },
    ];
    expect(mismoReparto(a, [...a].reverse())).toBe(true);
    expect(mismoReparto(a, [{ aeronave_id: N4142R, monto: 1577.92 }, { aeronave_id: N621TX, monto: 1577.921 }])).toBe(true);
    expect(mismoReparto(a, [{ aeronave_id: N4142R, monto: 1577.92 }, { aeronave_id: N621TX, monto: 1577.93 }])).toBe(false);
    expect(mismoReparto(a, [{ aeronave_id: N4142R, monto: 1577.92 }, { aeronave_id: N4142R, monto: 1577.92 }])).toBe(false);
    expect(mismoReparto([], [])).toBe(true);
  });

  it("quitasDelReparto: Cramex 8,120/8,120 ⇒ 10,000/6,240 y STARLINK sin N4142R", () => {
    expect(
      quitasDelReparto(CRAMEX, [
        { aeronave_id: XA_VGV, monto: 10000 },
        { aeronave_id: XB_PEV, monto: 6240 },
      ]),
    ).toEqual([{ aeronave_id: XB_PEV, matricula: "XB-PEV", antesCents: 812000, despuesCents: 624000 }]);
    expect(
      quitasDelReparto(STARLINK, [
        { aeronave_id: N621TX, monto: 2366.88 },
        { aeronave_id: N990GG, monto: 2366.88 },
      ]),
    ).toEqual([{ aeronave_id: N4142R, matricula: "N4142R", antesCents: 157792, despuesCents: 0 }]);
  });
});

describe("configAvionGasto (R3)", () => {
  it("las 6 repartibles sin vuelo: modos y «Repartir» habilitado", () => {
    for (const cat of ["OTRO", "FIJO", "INDIRECTO", "NOMINA", "GASOLINA", "VISITA"]) {
      const c = configAvionGasto({ categoria: cat, vueloSel: "", repartoGuardado: false });
      expect(c.conModos, cat).toBe(true);
      expect(c.repartoPermitido, cat).toBe(true);
      expect(c.motivoSinReparto, cat).toBeNull();
    }
  });

  it("con vuelo: deshabilitado con su motivo", () => {
    const c = configAvionGasto({ categoria: "OTRO", vueloSel: "v-330", repartoGuardado: false });
    expect(c.conModos).toBe(true);
    expect(c.repartoPermitido).toBe(false);
    expect(c.motivoSinReparto).toBe(
      "Un gasto ligado a un vuelo no se reparte: para repartirlo, cambia «Vuelo» a «Sin vuelo».",
    );
  });

  it("Gasolina/Visita: «Sin avión» sin selector de avión", () => {
    for (const cat of ["GASOLINA", "VISITA"]) {
      const c = configAvionGasto({ categoria: cat, vueloSel: "", repartoGuardado: false });
      expect(c.etiquetaUno).toBe("Sin avión");
      expect(c.admiteAvion).toBe(false);
    }
    expect(configAvionGasto({ categoria: "INDIRECTO", vueloSel: "", repartoGuardado: false }).etiquetaUno).toBe("Un avión");
  });

  it("COMIDA: sin modos; con reparto guardado, modos sin «Repartir» y el motivo con comillas latinas", () => {
    expect(configAvionGasto({ categoria: "COMIDA", vueloSel: "", repartoGuardado: false }).conModos).toBe(false);
    const c = configAvionGasto({ categoria: "COMIDA", vueloSel: "", repartoGuardado: true });
    expect(c.conModos).toBe(true);
    expect(c.repartoPermitido).toBe(false);
    expect(c.motivoSinReparto).toBe("«Comida» no se reparte entre aviones.");
  });
});

// ===== Planificador =====

const E = (o: Partial<EntradaPlanReparto>): EntradaPlanReparto => ({
  sumaActualCents: 473376,
  montoActualCents: 473376,
  monedaActual: "MXN",
  montoNuevoCents: null,
  monedaNueva: "MXN",
  categoriaNueva: "INDIRECTO",
  patchConAvion: false,
  patchConVuelo: false,
  nuevo: [],
  riesgoConciliado: false,
  ...o,
});
const CRAMEX_BASE = { sumaActualCents: 1624000, montoActualCents: 1624000 };

describe("planGuardadoReparto: caso por caso", () => {
  it("STARLINK editar a 2 × $2,366.88 ⇒ PATCH y luego PUT", () => {
    expect(
      planGuardadoReparto(E({ nuevo: [{ aeronave_id: N621TX, monto: 2366.88 }, { aeronave_id: N990GG, monto: 2366.88 }] })),
    ).toEqual({ tipo: "PASOS", pasos: ["GASTO", "REPARTO"] });
  });

  it("Cramex 16,240 → 14,000 con 7,000/7,000 ⇒ PUT y luego PATCH (cabe en el monto viejo)", () => {
    expect(
      planGuardadoReparto(
        E({ ...CRAMEX_BASE, montoNuevoCents: 1400000, nuevo: [{ aeronave_id: XA_VGV, monto: 7000 }, { aeronave_id: XB_PEV, monto: 7000 }] }),
      ),
    ).toEqual({ tipo: "PASOS", pasos: ["REPARTO", "GASTO"] });
  });

  it("Cramex → 20,000 con 10,000/10,000 ⇒ PATCH y luego PUT", () => {
    expect(
      planGuardadoReparto(
        E({ ...CRAMEX_BASE, montoNuevoCents: 2000000, nuevo: [{ aeronave_id: XA_VGV, monto: 10000 }, { aeronave_id: XB_PEV, monto: 10000 }] }),
      ),
    ).toEqual({ tipo: "PASOS", pasos: ["GASTO", "REPARTO"] });
  });

  it("crear (sin reparto) OTRO $1,500 en 5 × $300 ⇒ PATCH y luego PUT", () => {
    const nuevo = [N4142R, N621TX, N990GG, XA_VGV, XB_PEV].map((id) => ({ aeronave_id: id, monto: 300 }));
    expect(planGuardadoReparto(E({ sumaActualCents: 0, montoActualCents: 150000, categoriaNueva: "OTRO", nuevo }))).toEqual({
      tipo: "PASOS",
      pasos: ["GASTO", "REPARTO"],
    });
  });

  it("quitar + avión + SERVICIOS ⇒ PUT [] y luego PATCH", () => {
    expect(planGuardadoReparto(E({ categoriaNueva: "SERVICIOS", patchConAvion: true }))).toEqual({
      tipo: "PASOS",
      pasos: ["REPARTO", "GASTO"],
    });
  });

  it("quitar solo ⇒ PATCH y luego PUT []", () => {
    expect(planGuardadoReparto(E({}))).toEqual({ tipo: "PASOS", pasos: ["GASTO", "REPARTO"] });
  });

  it("quitar + bajar el monto de un gasto conciliado ⇒ BLOQUEO CONCILIADO", () => {
    expect(planGuardadoReparto(E({ montoNuevoCents: 400000, riesgoConciliado: true }))).toEqual({
      tipo: "BLOQUEO",
      codigo: "CONCILIADO",
      mensaje: MSG_REPARTO_CONCILIADO,
    });
  });

  it("quitar + moneda USD ⇒ PUT [] y luego PATCH", () => {
    expect(planGuardadoReparto(E({ monedaNueva: "USD", montoNuevoCents: 27800 }))).toEqual({
      tipo: "PASOS",
      pasos: ["REPARTO", "GASTO"],
    });
  });

  it("editar + USD con reparto guardado ⇒ BLOQUEO MONEDA con la moneda GUARDADA", () => {
    expect(planGuardadoReparto(E({ monedaNueva: "USD", nuevo: [{ aeronave_id: N4142R, monto: 100 }] }))).toEqual({
      tipo: "BLOQUEO",
      codigo: "MONEDA",
      mensaje: textoRepartoMoneda("MXN"),
    });
  });

  it("editar bajando el monto de un conciliado ⇒ BLOQUEO CONCILIADO", () => {
    const p = planGuardadoReparto(
      E({ montoNuevoCents: 400000, riesgoConciliado: true, nuevo: [{ aeronave_id: N4142R, monto: 2000 }, { aeronave_id: N621TX, monto: 2000 }] }),
    );
    expect(p).toEqual({ tipo: "BLOQUEO", codigo: "CONCILIADO", mensaje: MSG_REPARTO_CONCILIADO });
  });

  it("reparto guardado incoherente (suma > monto guardado) ⇒ BLOQUEO INCOHERENTE", () => {
    const p = planGuardadoReparto(
      E({
        sumaActualCents: 150000,
        montoActualCents: 100000,
        montoNuevoCents: 140000,
        nuevo: [{ aeronave_id: N4142R, monto: 600 }, { aeronave_id: N621TX, monto: 600 }],
      }),
    );
    expect(p).toEqual({
      tipo: "BLOQUEO",
      codigo: "INCOHERENTE",
      mensaje: msgRepartoIncoherente(150000, 100000, "MXN"),
    });
    expect(msgRepartoIncoherente(150000, 100000, "MXN")).toBe(
      "El reparto guardado ($1,500.00 MXN) suma más que el monto guardado del gasto ($1,000.00 MXN): primero baja el reparto a $1,000.00 MXN o menos y guarda; después cambia el monto. No se guardó nada.",
    );
  });

  it("Σ > monto final ⇒ BLOQUEO EXCEDE; con avión individual ⇒ INCOMPATIBLE", () => {
    expect(planGuardadoReparto(E({ nuevo: [{ aeronave_id: N4142R, monto: 5000 }] }))).toEqual({
      tipo: "BLOQUEO",
      codigo: "EXCEDE",
      mensaje: MSG_REPARTO_EXCEDE,
    });
    expect(planGuardadoReparto(E({ patchConAvion: true, nuevo: [{ aeronave_id: N4142R, monto: 1 }] }))).toEqual({
      tipo: "BLOQUEO",
      codigo: "INCOMPATIBLE",
      mensaje: MSG_REPARTO_INCOMPATIBLE,
    });
  });
});

/** PRNG determinista (mulberry32): el fuzz es el mismo en cada corrida. */
function mulberry32(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPARTIBLES = ["OTRO", "FIJO", "INDIRECTO", "GASOLINA", "VISITA", "NOMINA"];
const NO_REPARTIBLES = ["SERVICIOS", "COMIDA", "GAS", "REFACCION"];

/**
 * Simulador ESTRICTO del API: PATCH (con reparto guardado) rechaza monto bajo
 * la suma, categoría que no se reparte, vuelo, otra moneda y avión; 409 de
 * conciliado si el PATCH cambia el dinero de un gasto conciliado. PUT valida
 * SIEMPRE vuelo y categoría (también []) y Σ ≤ monto con items.
 */
function simularApi(
  inicial: { monto: number; suma: number; moneda: string; cat: string; vuelo: boolean },
  e: EntradaPlanReparto,
  pasos: Array<"GASTO" | "REPARTO">,
): { paso: number; motivo: string } | null {
  const s = { ...inicial };
  for (const [i, paso] of pasos.entries()) {
    if (paso === "GASTO") {
      if (e.riesgoConciliado) return { paso: i, motivo: "409 GASTO_CONCILIADO" };
      const montoNuevo = e.montoNuevoCents ?? s.monto;
      if (s.suma > 0) {
        if (montoNuevo < s.suma) return { paso: i, motivo: "PATCH monto < suma" };
        if (!REPARTIBLES.includes(e.categoriaNueva)) return { paso: i, motivo: "PATCH categoría" };
        if (e.patchConVuelo) return { paso: i, motivo: "PATCH vuelo" };
        if (e.monedaNueva != null && e.monedaNueva !== s.moneda) return { paso: i, motivo: "PATCH moneda" };
        if (e.patchConAvion) return { paso: i, motivo: "PATCH avión" };
      }
      s.monto = montoNuevo;
      s.moneda = e.monedaNueva ?? s.moneda;
      s.cat = e.categoriaNueva;
      s.vuelo = e.patchConVuelo;
    } else {
      if (s.vuelo) return { paso: i, motivo: "PUT vuelo" };
      if (!REPARTIBLES.includes(s.cat)) return { paso: i, motivo: "PUT categoría" };
      const suma = e.nuevo.reduce((a, it) => a + Math.round(it.monto * 100), 0);
      if (e.nuevo.length > 0 && suma > s.monto) return { paso: i, motivo: "PUT suma > monto" };
      s.suma = suma;
    }
  }
  return null;
}

describe("planGuardadoReparto: fuzz determinista contra un simulador estricto del API", () => {
  it("20,000 casos: 0 rechazos en el 2.º paso y en el 1.º solo el 409 de conciliado (nada escrito)", () => {
    const R = mulberry32(20261014);
    const ent = (n: number) => Math.floor(R() * n);
    const ids = ACTIVOS.map((a) => a.id);
    let ejecutados = 0;
    let bloqueos = 0;
    const fallasSegundoPaso: string[] = [];
    const fallasPrimerPaso: string[] = [];
    for (let caso = 0; caso < 20000; caso++) {
      const M0 = 1 + ent(500000);
      const S0 = ent(3) === 0 ? 0 : ent(M0 + 1);
      const quita = S0 > 0 && ent(3) === 0;
      const catGuardada = S0 > 0 ? REPARTIBLES[ent(6)] : ent(2) ? REPARTIBLES[ent(6)] : NO_REPARTIBLES[ent(4)];
      const vueloGuardado = S0 > 0 ? false : ent(4) === 0;
      const categoriaNueva = quita
        ? ent(2)
          ? REPARTIBLES[ent(6)]
          : NO_REPARTIBLES[ent(4)]
        : ent(8) === 0
          ? NO_REPARTIBLES[ent(4)]
          : REPARTIBLES[ent(6)];
      const M1 = ent(2) ? null : 1 + ent(600000);
      const monedaNueva = ent(10) === 0 ? "USD" : ent(10) === 0 ? null : "MXN";
      const montoFinal = M1 ?? M0;
      const nuevo: ItemReparto[] = [];
      if (!quita) {
        const n = 1 + ent(5);
        let resto = ent(5) === 0 ? montoFinal + 1 + ent(10000) : montoFinal;
        for (let k = 0; k < n && resto > 0; k++) {
          const v = 1 + ent(Math.max(1, Math.floor(resto / (n - k))));
          nuevo.push({ aeronave_id: ids[k], monto: v / 100 });
          resto -= v;
        }
        if (nuevo.length === 0) continue;
      }
      const e: EntradaPlanReparto = {
        sumaActualCents: S0,
        montoActualCents: M0,
        monedaActual: "MXN",
        montoNuevoCents: M1,
        monedaNueva,
        categoriaNueva,
        patchConAvion: quita ? ent(2) === 0 : ent(12) === 0,
        patchConVuelo: quita ? ent(4) === 0 : ent(12) === 0,
        nuevo,
        riesgoConciliado: ent(4) === 0,
      };
      const plan = planGuardadoReparto(e);
      if (plan.tipo === "BLOQUEO") {
        bloqueos++;
        continue;
      }
      ejecutados++;
      const falla = simularApi(
        { monto: M0, suma: S0, moneda: "MXN", cat: catGuardada, vuelo: vueloGuardado },
        e,
        plan.pasos,
      );
      if (!falla) continue;
      const detalle = `${falla.motivo} ${JSON.stringify({ e, plan })}`;
      if (falla.paso > 0) fallasSegundoPaso.push(detalle);
      else if (falla.motivo !== "409 GASTO_CONCILIADO") fallasPrimerPaso.push(detalle);
    }
    expect(fallasSegundoPaso.slice(0, 3)).toEqual([]);
    expect(fallasPrimerPaso.slice(0, 3)).toEqual([]);
    // El fuzz de verdad cubre los dos lados.
    expect(ejecutados).toBeGreaterThan(5000);
    expect(bloqueos).toBeGreaterThan(1000);
  });
});

describe("reglas del diálogo", () => {
  const G = { monto: "4733.76", moneda: "MXN" as const, medio_pago: "TARJETA_CORP" };

  it("dineroCambia: espejo de cambiaDineroDelGasto (BODEGA no cuenta)", () => {
    expect(dineroCambia({ monto: 4733.76, moneda: "MXN", medio_pago: "TARJETA_CORP" }, G)).toBe(false);
    expect(dineroCambia({ monto: 4733.77 }, G)).toBe(true);
    expect(dineroCambia({ moneda: "USD" }, G)).toBe(true);
    expect(dineroCambia({ medio_pago: "TRANSFERENCIA" }, G)).toBe(true);
    expect(dineroCambia({ medio_pago: "BODEGA" }, G)).toBe(false);
    // Vacío = no viaja.
    expect(dineroCambia({ monto: "", moneda: "", medio_pago: undefined }, G)).toBe(false);
  });

  it("debePrellenarAvionPorMatricula (R9): jamás en un repartido, por confirmar o con lectura fallida", () => {
    const base = {
      estadoRep: "SIN_REPARTO" as const,
      modoAvion: "UNO" as const,
      matriculaIa: "N990GG",
      categoria: "INDIRECTO",
      vetado: false,
      avionActual: "",
      yaPrellenado: false,
    };
    expect(debePrellenarAvionPorMatricula(base)).toBe(true);
    for (const estadoRep of ["REPARTIDO", "POR_CONFIRMAR", "LECTURA_FALLIDA"] as const) {
      expect(debePrellenarAvionPorMatricula({ ...base, estadoRep }), estadoRep).toBe(false);
    }
    // Estado G: «Un avión» sobre un gasto repartido arranca en «Sin avión (gasto
    // de VuelaTour)», jamás con la matrícula de la IA.
    expect(debePrellenarAvionPorMatricula({ ...base, estadoRep: "REPARTIDO", modoAvion: "UNO" })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, modoAvion: "REPARTO" })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, avionActual: N4142R })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, vetado: true })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, yaPrellenado: true })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, categoria: "GASOLINA" })).toBe(false);
    expect(debePrellenarAvionPorMatricula({ ...base, matriculaIa: null })).toBe(false);
  });

  it("iaRespetaReparto (R11): con reparto, solo una categoría que se reparte", () => {
    for (const s of ["SERVICIOS", "REFACCION", "PERMISO", "TAXI"]) {
      expect(iaRespetaReparto(s, true), s).toBe(false);
      expect(iaRespetaReparto(s, false), s).toBe(true);
    }
    expect(iaRespetaReparto("INDIRECTO", true)).toBe(true);
    expect(iaRespetaReparto(null, false)).toBe(false);
  });

  it("iaConsumidaPorReparto: tras PARCIAL_SOLO_REPARTO de un QUITAR la IA NO prellena (revisión del 14-oct-2026)", () => {
    // Abre repartido (STARLINK, 3 partes): la sesión consume la IA.
    let consumida = iaConsumidaPorReparto(false, STARLINK);
    expect(consumida).toBe(true);
    // «Un avión» → «Sin avión» → Guardar: el PUT [] entra y el PATCH falla
    // (PARCIAL_SOLO_REPARTO). El diálogo queda SIN_REPARTO, «Un avión», sin
    // avión: justo las condiciones del prellenado.
    consumida = iaConsumidaPorReparto(consumida, []);
    const tras = {
      estadoRep: "SIN_REPARTO" as const,
      modoAvion: "UNO" as const,
      matriculaIa: "N990GG",
      categoria: "INDIRECTO",
      vetado: false,
      avionActual: "",
      yaPrellenado: consumida,
    };
    expect(debePrellenarAvionPorMatricula(tras)).toBe(false);
    // Control: el MISMO estado en una sesión que jamás supo de un reparto sí prellena.
    expect(debePrellenarAvionPorMatricula({ ...tras, yaPrellenado: iaConsumidaPorReparto(false, []) })).toBe(true);
    // Abrió sin embed y la LECTURA trajo el reparto: también la consume.
    expect(iaConsumidaPorReparto(false, [{ aeronave_id: N621TX, matricula: "N621TX", monto: 1 }])).toBe(true);
  });

  it("siguienteMontoMarcado: Enter en un monto salta al siguiente avión MARCADO (no envía el formulario)", () => {
    const sel = {
      [N4142R]: { incluir: true, monto: "1000.00" },
      [N58BT]: { incluir: false, monto: "" },
      [N621TX]: { incluir: true, monto: "733.76" },
    };
    expect(siguienteMontoMarcado(ACTIVOS, sel, N4142R)).toBe(N621TX);
    // El último marcado: no hay a dónde saltar (y tampoco se envía).
    expect(siguienteMontoMarcado(ACTIVOS, sel, N621TX)).toBeNull();
    expect(siguienteMontoMarcado(ACTIVOS, sel, "no-existe")).toBeNull();
    expect(siguienteMontoMarcado(ACTIVOS, {}, N4142R)).toBeNull();
  });

  it("mesesTerminados: meses anteriores al de hoy (Cancún), sin repetir", () => {
    expect(mesesTerminados(["2026-09-01", "2026-10-05"], "2026-10-14")).toEqual(["septiembre 2026"]);
    expect(mesesTerminados(["2026-10-31", null], "2026-11-01")).toEqual(["octubre 2026"]);
    expect(mesesTerminados(["2026-10-01", "2026-10-31"], "2026-10-14")).toEqual([]);
    expect(mesesTerminados(["2026-08-09", "2026-09-30", "2026-08-01"], "2026-10-14")).toEqual([
      "agosto 2026",
      "septiembre 2026",
    ]);
  });

  it("esRechazoPorReparto: los 5 textos de hoy y los 5 de la Fase 2", () => {
    const hoy = [
      "El gasto está repartido entre aviones por $4733.76: baja o quita el reparto en Otros gastos antes de reducir el monto.",
      "El gasto está repartido entre aviones: quita el reparto en Otros gastos antes de cambiarlo a esa categoría.",
      "El gasto está repartido entre aviones: quita el reparto en Otros gastos antes de ligarlo a un vuelo.",
      "El gasto está repartido entre aviones (montos en su moneda): quita el reparto antes de cambiar la moneda.",
      "El gasto está repartido entre aviones: el avión individual no aplica — edita el reparto en Otros gastos.",
    ];
    const fase2 = [
      "El gasto está repartido entre aviones por $4733.76: baja o quita el reparto («Repartir entre aviones» en «Verificar / editar» o en el menú ⋯) antes de reducir el monto.",
      "El gasto está repartido entre aviones: quita el reparto («Repartir entre aviones» en «Verificar / editar» o en el menú ⋯) antes de cambiarlo a esa categoría.",
      "El gasto está repartido entre aviones: quita el reparto («Repartir entre aviones» en «Verificar / editar» o en el menú ⋯) antes de ligarlo a un vuelo.",
      "El gasto está repartido entre aviones (montos en su moneda): quita el reparto antes de cambiar la moneda.",
      "El gasto está repartido entre aviones: el avión individual no aplica — edita o quita el reparto («Repartir entre aviones» en «Verificar / editar» o en el menú ⋯).",
    ];
    for (const t of [...hoy, ...fase2]) expect(esRechazoPorReparto(t), t).toBe(true);
    expect(esRechazoPorReparto("Ya existe un gasto con el folio/remisión")).toBe(false);
    expect(esRechazoPorReparto(null)).toBe(false);
  });

  it("llamarSinLanzar: un throw nunca escapa; lo técnico no se pinta", async () => {
    expect(await llamarSinLanzar(async () => 7)).toEqual({ ok: true, valor: 7 });
    expect(
      await llamarSinLanzar(async () => {
        throw new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.');
      }),
    ).toEqual({ ok: false, error: MSG_SERVIDOR_NO_RESPONDIO });
    expect(MSG_SERVIDOR_NO_RESPONDIO).toBe("No hubo respuesta del servidor.");
    expect(
      await llamarSinLanzar(() => {
        throw new Error("Reparto inválido");
      }),
    ).toEqual({ ok: false, error: "Reparto inválido" });
  });

  it("validarItemsReparto: uuid sin repetir, monto > 0 con 2 decimales, ≤ 20", () => {
    expect(validarItemsReparto([{ aeronave_id: N4142R, monto: 1577.92 }])).toEqual([{ aeronave_id: N4142R, monto: 1577.92 }]);
    expect(validarItemsReparto([])).toEqual([]);
    expect(validarItemsReparto([{ aeronave_id: "N4142R", monto: 1 }])).toBeNull();
    expect(validarItemsReparto([{ aeronave_id: N4142R, monto: 1 }, { aeronave_id: N4142R, monto: 2 }])).toBeNull();
    expect(validarItemsReparto([{ aeronave_id: N4142R, monto: 0 }])).toBeNull();
    expect(validarItemsReparto([{ aeronave_id: N4142R, monto: 1577.925 }])).toBeNull();
    expect(validarItemsReparto(Array.from({ length: 21 }, () => ({ aeronave_id: N4142R, monto: 1 })))).toBeNull();
    expect(validarItemsReparto("nada")).toBeNull();
  });

  it("estadoRepartoTrasFalla: nuevo, anterior, distinto o no se sabe", () => {
    const base = itemsDePartes(STARLINK);
    const nuevo = [{ aeronave_id: N621TX, monto: 2366.88 }, { aeronave_id: N990GG, monto: 2366.88 }];
    expect(estadoRepartoTrasFalla(nuevo, base, nuevo)).toBe("IGUAL_AL_NUEVO");
    expect(estadoRepartoTrasFalla(base, base, nuevo)).toBe("IGUAL_AL_ANTERIOR");
    expect(estadoRepartoTrasFalla([{ aeronave_id: N621TX, monto: 2366.88 }], base, nuevo)).toBe("DISTINTO");
    expect(estadoRepartoTrasFalla(null, base, nuevo)).toBe("DESCONOCIDO");
  });

  it("errorRepartoEnPantalla (R24): lo que se frena antes de la red", () => {
    const filas = filasRepartoEditor(ACTIVOS, []);
    const base = {
      enReparto: true,
      editando: true,
      avionesCargando: false,
      sinBase: true,
      cambia: true,
      monedaCambiaConBase: false,
      monedaGuardada: "MXN",
    };
    const res = (sel: Record<string, { incluir: boolean; monto: string }>, techo = 100000) =>
      resumenReparto(filas, sel, techo);
    expect(errorRepartoEnPantalla({ ...base, enReparto: false, resumen: res({}) })).toBeNull();
    expect(errorRepartoEnPantalla({ ...base, avionesCargando: true, resumen: res({}) })).toBe(MSG_REPARTO_CARGANDO);
    expect(errorRepartoEnPantalla({ ...base, resumen: res({}) })).toBe(MSG_REPARTO_SIN_AVIONES);
    expect(errorRepartoEnPantalla({ ...base, sinBase: false, resumen: res({}) })).toBe(MSG_REPARTO_SIN_AVIONES_GUARDADO);
    expect(errorRepartoEnPantalla({ ...base, resumen: res({ [N4142R]: { incluir: true, monto: "" } }) })).toBe(
      "Captura el monto de N4142R (o desmárcalos).",
    );
    expect(errorRepartoEnPantalla({ ...base, resumen: res({ [N4142R]: { incluir: true, monto: "1001" } }) })).toBe(MSG_REPARTO_EXCEDE);
    expect(
      errorRepartoEnPantalla({ ...base, sinBase: false, monedaCambiaConBase: true, resumen: res({ [N4142R]: { incluir: true, monto: "10" } }) }),
    ).toBe(textoRepartoMoneda("MXN"));
    expect(errorRepartoEnPantalla({ ...base, resumen: res({ [N4142R]: { incluir: true, monto: "10" } }) })).toBeNull();
    const conInactivo = resumenReparto(
      filasRepartoEditor(ACTIVOS, [{ aeronave_id: XB_IJP, matricula: "XB-IJP", monto: 10 }]),
      { [XB_IJP]: { incluir: true, monto: "10" } },
      100000,
    );
    expect(errorRepartoEnPantalla({ ...base, sinBase: false, resumen: conInactivo })).toBe(
      "XB-IJP está inactivo: desmárcalo (solo se reparte entre aviones activos).",
    );
    // Un reparto viejo con un inactivo que NO cambia no se frena.
    expect(errorRepartoEnPantalla({ ...base, sinBase: false, cambia: false, resumen: conInactivo })).toBeNull();
  });
});

describe("textos EXACTOS", () => {
  it("modos, ayudas y descripción", () => {
    expect(tituloModoUno("INDIRECTO")).toBe(
      "Un solo avión (o ninguno): resta en el balance de ese avión, no en su reparto a socios.",
    );
    expect(tituloModoUno("FIJO")).toBe(
      "Un solo avión (o ninguno): el gasto fijo queda en VuelaTour y en el reparto a socios se prorratea entre todos los aviones activos.",
    );
    expect(tituloModoUno("OTRO")).toBe(
      "Un solo avión (o ninguno): el avión queda solo como referencia; el gasto es de VuelaTour.",
    );
    expect(tituloModoUno("GASOLINA")).toBe("Sin avión: el gasto es de VuelaTour.");
    // f3c625e6 (INDIRECTO con N4142R).
    expect(ayudaModoUno({ categoria: "INDIRECTO", matricula: "N4142R" })).toBe(
      "Con un solo avión (N4142R) el gasto resta en el balance de ese avión, pero no en su reparto a socios. Repartido —aunque sea 100 % a ese avión— resta en los dos.",
    );
    expect(ayudaModoUno({ categoria: "INDIRECTO", matricula: null })).toBe(
      "Sin avión, el gasto lo absorbe VuelaTour (Balance general · Otros gastos).",
    );
    expect(ayudaModoUno({ categoria: "FIJO", matricula: "N990GG" })).toBe(
      "Gasto fijo: sin reparto queda en VuelaTour en el balance y, en el reparto a socios, se prorratea entre todos los aviones activos. N990GG queda solo como referencia.",
    );
    expect(ayudaModoUno({ categoria: "OTRO", matricula: "N621TX" })).toBe(
      "N621TX queda solo como referencia: el gasto sigue siendo de VuelaTour. Para cargarlo a aviones, usa «Repartir entre aviones».",
    );
    expect(ayudaModoUno({ categoria: "NOMINA", matricula: null })).toBe(
      "Sin avión, el gasto es de VuelaTour (Balance general · Otros gastos).",
    );
    expect(ayudaModoUno({ categoria: "GASOLINA", matricula: null })).toBe(
      "La gasolina de vehículos y las visitas no llevan avión: para cargarlas a aviones, elige «Repartir entre aviones».",
    );
    expect(ayudaModoUno({ categoria: "SERVICIOS", matricula: "N4142R" })).toBeNull();
    expect(descripcionVerificarGasto({ enReparto: true, categoria: "INDIRECTO" })).toBe(
      "Revisa el reparto entre aviones y confirma categoría y comprobante.",
    );
    for (const categoria of ["OTRO", "INDIRECTO", "NOMINA", "FIJO"]) {
      expect(descripcionVerificarGasto({ enReparto: false, categoria }), categoria).toBe(
        "Confirma categoría y comprobante. El avión es opcional: sin avión es gasto de VuelaTour, o puedes repartirlo entre aviones.",
      );
    }
    for (const categoria of ["GASOLINA", "VISITA"]) {
      expect(descripcionVerificarGasto({ enReparto: false, categoria }), categoria).toBe(
        "Confirma categoría y comprobante. No lleva avión: sin reparto es gasto de VuelaTour, o puedes repartirlo entre aviones.",
      );
    }
    expect(descripcionVerificarGasto({ enReparto: false, categoria: "COMIDA" })).toBe(
      "Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la bandeja de pendientes.",
    );
    // Revisión del 14-oct-2026: STARLINK (INDIRECTO repartido) reclasificado a
    // «Servicios (avión)»: ya no promete «el avión es opcional… repartirlo».
    expect(descripcionVerificarGasto({ enReparto: false, categoria: "SERVICIOS" })).toBe(
      "Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la bandeja de pendientes.",
    );
    // No llevan avión: ni «la bandeja de pendientes» ni «resuelve pendiente».
    expect(descripcionVerificarGasto({ enReparto: false, categoria: "PERSONAL_DUENO" })).toBe(
      "Confirma categoría y comprobante. El gasto personal del dueño no lleva avión: queda fuera de los balances.",
    );
    expect(descripcionVerificarGasto({ enReparto: false, categoria: "COMISION_VENDEDOR" })).toBe(
      "Confirma categoría, vuelo y comprobante. Esta categoría no lleva avión (el que elijas es solo referencia): no queda en la bandeja de pendientes.",
    );
    // La «(avión)» SÍ necesita avión (espejo de la bandeja del API).
    expect(descripcionVerificarGasto({ enReparto: false, categoria: "COMISION_VENDEDOR_AVION" })).toContain(
      "Sin avión, el gasto queda en la bandeja de pendientes.",
    );
    expect(ETIQUETA_AVION_RESUELVE_PENDIENTE).toBe("Avión (resuelve pendiente)");
    expect(ETIQUETA_AVION_SOLO_REFERENCIA).toBe("Avión (solo referencia)");
    expect(etiquetaCampoAvionSinModos("COMIDA")).toBe("Avión (resuelve pendiente)");
    expect(etiquetaCampoAvionSinModos("COMISION_VENDEDOR_AVION")).toBe("Avión (resuelve pendiente)");
    expect(etiquetaCampoAvionSinModos("COMISION_VENDEDOR")).toBe("Avión (solo referencia)");
    expect(HINT_AVION_PERSONAL).toBe(
      "El gasto personal del dueño no lleva avión: al guardar se desliga y queda fuera de los balances.",
    );
  });

  it("líneas del reparto y del total pagado", () => {
    expect(
      lineaResumenReparto({ sumaCents: 473376, techoCents: 473376, restoCents: 0, excedidoCents: 0, moneda: "MXN" }),
    ).toBe("Asignado $4,733.76 MXN de $4,733.76 MXN del total pagado · VuelaTour absorbe $0.00 MXN");
    expect(
      lineaResumenReparto({ sumaCents: 473376, techoCents: 400000, restoCents: 0, excedidoCents: 73376, moneda: "MXN" }),
    ).toBe("Asignado $4,733.76 MXN de $4,000.00 MXN del total pagado · se pasa por $733.76 MXN — ajusta los montos");
    expect(
      lineaTotalPagadoReparto({ sumaCents: 473376, nAviones: 3, restoCents: 0, excedidoCents: 0, moneda: "MXN" }),
    ).toBe("· repartido $4,733.76 MXN entre 3 aviones · VuelaTour absorbe $0.00 MXN");
    expect(
      lineaTotalPagadoReparto({ sumaCents: 116152, nAviones: 1, restoCents: 0, excedidoCents: 0, moneda: "MXN" }),
    ).toBe("· repartido $1,161.52 MXN entre 1 avión · VuelaTour absorbe $0.00 MXN");
    expect(
      lineaTotalPagadoReparto({ sumaCents: 473376, nAviones: 3, restoCents: 0, excedidoCents: 73376, moneda: "MXN" }),
    ).toBe("· el reparto ($4,733.76 MXN) se pasa del total por $733.76 MXN: ajústalo en «Avión»");
  });

  it("hojaDestinoReparto (la prop `hoja` de CategoriaDestinoHint)", () => {
    expect(hojaDestinoReparto({ matriculas: ["N990GG", "N4142R", "N621TX"], restoCents: 0, moneda: "MXN" })).toBe(
      "Balance de N4142R, N621TX y N990GG · Gastos Indirectos (reparto manual; también resta en su reparto a socios)",
    );
    expect(hojaDestinoReparto({ matriculas: ["XA-VGV"], restoCents: 224000, moneda: "MXN" })).toBe(
      "Balance de XA-VGV · Gastos Indirectos (reparto manual; también resta en su reparto a socios) · lo no asignado ($2,240.00 MXN) lo absorbe VuelaTour: Balance general · Otros gastos",
    );
    expect(hojaDestinoReparto({ matriculas: [], restoCents: 0, moneda: "MXN" })).toBe(
      "Balance de cada avión que marques · Gastos Indirectos (reparto manual)",
    );
  });

  it("qué cambia al repartir, avisos de quitar y de matrícula", () => {
    expect(textoQueCambiaAlRepartir({ categoria: "INDIRECTO", matriculaGuardada: "N4142R" })).toBe(
      "Hoy el gasto está en N4142R: resta en su balance pero no en el reparto a socios. Repartido, cada parte resta en el balance y en el reparto a socios de su avión; lo no asignado lo absorbe VuelaTour.",
    );
    expect(textoQueCambiaAlRepartir({ categoria: "OTRO", matriculaGuardada: "N621TX" })).toBe(
      "Hoy N621TX es solo referencia: el gasto es de VuelaTour. Repartido, cada parte resta en el balance y en el reparto a socios de su avión; lo no asignado lo absorbe VuelaTour.",
    );
    expect(textoQueCambiaAlRepartir({ categoria: "OTRO", matriculaGuardada: null })).toBe(
      "Hoy el gasto es de VuelaTour. Repartido, cada parte resta en el balance y en el reparto a socios de su avión; lo no asignado lo absorbe VuelaTour.",
    );
    expect(AVISO_REPARTO_FIJO).toBe(
      "Gasto fijo: sin reparto, en el reparto a socios se prorratea entre todos los aviones activos. Repartido sale de ese prorrateo: resta solo a los aviones que marques y lo no asignado queda en VuelaTour.",
    );
    expect(avisoRepartoSeQuita({ motivo: "MODO", resumen: RESUMEN_STARLINK })).toBe(
      `Al guardar se quitará el reparto (${RESUMEN_STARLINK}). Para conservarlo, vuelve a «Repartir entre aviones».`,
    );
    expect(avisoRepartoSeQuita({ motivo: "CATEGORIA", resumen: RESUMEN_STARLINK, label: "Servicios (avión)" })).toBe(
      `«Servicios (avión)» no se reparte entre aviones: al guardar se quitará el reparto (${RESUMEN_STARLINK}). Para conservarlo, regresa a una categoría que se reparta.`,
    );
    expect(lineaCategoriaQuitaReparto("Servicios (avión)")).toBe(
      "«Servicios (avión)» no se reparte: al guardar se quita el reparto (se confirma).",
    );
    expect(avisoMatriculaFueraDeReparto("N990GG", ["N4142R", "N621TX"])).toBe(
      "El comprobante trae la matrícula N990GG y el reparto no la incluye: revisa si le toca una parte.",
    );
    expect(avisoMatriculaFueraDeReparto("N990GG", ["N4142R", "n-990gg"])).toBeNull();
    expect(avisoMatriculaFueraDeReparto(42, ["N4142R"])).toBeNull();
  });

  it("notas: IA, dinero bloqueado, monto, categoría y mes terminado", () => {
    expect(notaIaConReparto({ categoria: "SERVICIOS" })).toBe(
      " El gasto está repartido: no se aplicó la categoría «Servicios (avión)» (cámbialo a mano si aplica).",
    );
    expect(notaIaConReparto({ categoria: "REFACCION", moneda: "USD" })).toBe(
      " El gasto está repartido: no se aplicó la categoría «Refacción» ni la moneda USD (cámbialo a mano si aplica).",
    );
    expect(notaIaConReparto({ categoria: "SERVICIOS", moneda: "USD", matricula: "N990GG" })).toBe(
      " El gasto está repartido: no se aplicó la categoría «Servicios (avión)», la moneda USD ni el avión N990GG (cámbialo a mano si aplica).",
    );
    expect(notaIaConReparto({})).toBe("");
    expect(mod.NOTA_DINERO_BLOQUEADO).toBe(
      "Este gasto ya está conciliado con el banco: el guardado no aceptará otro monto, otra moneda ni otro medio de pago (para corregirlos, primero desvincula el cargo en Conciliación).",
    );
    // QA 6 del diseño: $317.17 → $401.23 sin tocar el reparto.
    expect(notaMontoConReparto({ techoCents: 40123, sumaCents: 31717, moneda: "MXN" })).toBe(
      "Con el monto nuevo ($401.23 MXN) el reparto sigue sumando $317.17 MXN: VuelaTour absorbería $84.06 MXN. Si esa diferencia también va a los aviones, usa «Editar reparto».",
    );
    expect(notaMontoConReparto({ techoCents: 31717, sumaCents: 31717, moneda: "MXN" })).toBeNull();
    const base =
      "Las partes siguen en los mismos aviones y con los mismos montos; solo cambia el renglón donde se ven en el balance y en el reparto a socios.";
    expect(notaCategoriaEntreRepartibles({ antes: "INDIRECTO", despues: "OTRO" })).toBe(base);
    expect(notaCategoriaEntreRepartibles({ antes: "INDIRECTO", despues: "FIJO" })).toBe(
      `${base} Como «Gasto fijo», cada parte resta en el grupo FIJO del reparto a socios de su avión.`,
    );
    expect(notaCategoriaEntreRepartibles({ antes: "FIJO", despues: "INDIRECTO" })).toBe(
      `${base} Al dejar de ser «Gasto fijo», cada parte resta en el grupo de gastos indirectos del reparto a socios.`,
    );
    expect(notaCategoriaEntreRepartibles({ antes: "INDIRECTO", despues: "SERVICIOS" })).toBeNull();
    expect(notaCategoriaEntreRepartibles({ antes: "INDIRECTO", despues: "INDIRECTO" })).toBeNull();
    expect(notaRepartoMesTerminado(["septiembre 2026"])).toBe(
      "Es un gasto de septiembre 2026, un mes que ya terminó: al guardar cambian los libros de ese mes (balance de los aviones, reparto a socios y lo que absorbe VuelaTour); si ya los enviaste, vuelve a generarlos.",
    );
    expect(notaRepartoMesTerminado(["agosto 2026", "septiembre 2026"])).toBe(
      "Cambian los libros de agosto 2026 y septiembre 2026, meses que ya terminaron (balance de los aviones, reparto a socios y lo que absorbe VuelaTour); si ya los enviaste, vuelve a generarlos.",
    );
    expect(notaRepartoMesTerminado([])).toBeNull();
  });

  it("frenos, lecturas y avisos del editor", () => {
    expect(textoRepartoMoneda("MXN")).toBe(
      "Los montos del reparto están en MXN: para cambiar la moneda, primero elige «Un avión» y guarda (se quita el reparto); después vuelve a repartirlo en la moneda nueva.",
    );
    expect(textoRepartoSinMonto(["N4142R", "N621TX"])).toBe("Captura el monto de N4142R, N621TX (o desmárcalos).");
    expect(textoRepartoInactivos(["XB-IJP", "XA-VGV"])).toBe(
      "XB-IJP y XA-VGV están inactivos: desmárcalos (solo se reparte entre aviones activos).",
    );
    expect(MSG_REPARTO_SIN_AVIONES).toBe("Marca los aviones del reparto (o elige «Un avión»).");
    expect(MSG_REPARTO_SIN_AVIONES_GUARDADO).toBe(
      "Marca al menos un avión. Para quitar el reparto, elige «Un avión» (se confirma al guardar).",
    );
    expect(MSG_REPARTO_EXCEDE).toBe(
      "El reparto se pasa del total pagado — ajusta los montos (lo no asignado queda como gasto de VuelaTour).",
    );
    expect(MSG_REPARTO_CARGANDO).toBe("Espera a que carguen los aviones del reparto.");
    expect(MSG_REPARTO_CONCILIADO).toBe(
      "Este gasto tiene cargos del banco ligados: no se puede cambiar su monto, moneda ni medio de pago (desvincúlalo primero en Conciliación). No se guardó nada.",
    );
    expect(MSG_REPARTO_INCOMPATIBLE).toBe(
      "Un gasto repartido no lleva avión individual ni vuelo, y su categoría debe repartirse: revisa «Avión», «Vuelo» y «Categoría». No se guardó nada.",
    );
    expect(mod.MSG_REPARTO_INVALIDO).toBe(
      "El reparto no es válido (aviones o montos): recarga y vuelve a intentar. No se guardó nada.",
    );
    expect(mod.AYUDA_RECHAZO_POR_REPARTO).toBe("El reparto se ajusta aquí mismo: «Avión» → «Repartir entre aviones».");
    expect(mod.TEXTO_LEYENDO_REPARTO).toBe("Leyendo el reparto del gasto…");
    expect(mod.TEXTO_FALLO_LECTURA_REPARTO).toBe("No se pudo leer el reparto de este gasto.");
    expect(textoFalloCargaAviones(null)).toBe("No se pudieron cargar los aviones activos.");
    expect(textoFalloCargaAviones(RESUMEN_STARLINK)).toBe(
      `No se pudieron cargar los aviones activos. Se conserva el reparto guardado (${RESUMEN_STARLINK}).`,
    );
    expect(textoRepartoActualizado(RESUMEN_STARLINK)).toBe(
      `El reparto guardado cambió mientras editabas: ahora está ${RESUMEN_STARLINK}. Revisa tus montos antes de guardar.`,
    );
    expect(textoRepartoDescubierto(RESUMEN_STARLINK)).toBe(
      `Este gasto ya está repartido entre aviones (${RESUMEN_STARLINK}). Revisa el reparto; si querías un solo avión, elige «Un avión» y guarda (se quitará el reparto).`,
    );
    expect(textoRefuerzoAvion("fetch failed")).toBe(
      "El reparto quedó guardado, pero el gasto todavía tiene el avión individual: vuelve a abrirlo y pulsa «Guardar» para quitarlo (el servidor no respondió).",
    );
    expect(motivoLegible("Alguna aeronave del reparto no existe o está inactiva.")).toBe(
      "Alguna aeronave del reparto no existe o está inactiva",
    );
  });

  it("resumen del reparto y a dónde va el gasto al quitarlo", () => {
    expect(resumenRepartoTexto(STARLINK, "MXN")).toBe(RESUMEN_STARLINK);
    expect(resumenRepartoTexto([STARLINK[0]], "MXN", 315584)).toBe("N4142R $1,577.92 MXN · VuelaTour $3,155.84 MXN");
    expect(resumenRepartoTexto([{ aeronave_id: XB_PEV, matricula: null, monto: 300 }], "USD")).toBe("¿? $300 USD");
    expect(resumenRepartoTexto([], "MXN")).toBe("sin reparto");
    expect(destinoTrasQuitar({ categoria: "PERSONAL_DUENO", matricula: null, tieneVuelo: false })).toBe(
      "fuera de los balances (gasto personal del dueño)",
    );
    expect(destinoTrasQuitar({ categoria: "OTRO", matricula: "N4142R", tieneVuelo: false })).toBe(
      "Balance general VuelaTour · Otros gastos (N4142R queda solo como referencia)",
    );
    expect(destinoTrasQuitar({ categoria: "OTRO", matricula: null, tieneVuelo: true })).toBe(
      "Balance general VuelaTour · Otros gastos (lo absorbe VuelaTour)",
    );
    expect(destinoTrasQuitar({ categoria: "INDIRECTO", matricula: null, tieneVuelo: false })).toBe(
      "Balance general VuelaTour · Otros gastos (lo absorbe VuelaTour)",
    );
    expect(destinoTrasQuitar({ categoria: "INDIRECTO", matricula: "N990GG", tieneVuelo: false })).toBe(
      "Balance del avión · Gastos Indirectos (N990GG)",
    );
    expect(destinoTrasQuitar({ categoria: "SERVICIOS", matricula: "N621TX", tieneVuelo: true })).toBe(
      "Balance del avión · hoja del vuelo",
    );
    // Revisión del 14-oct-2026: una categoría que NECESITA avión, sin avión ni
    // vuelo, no «la absorbe VuelaTour»: queda pendiente.
    expect(DESTINO_PENDIENTE_DE_AVION).toBe(
      "la bandeja de «Pendientes» (le falta avión; mientras no lo tenga, cuenta en Balance general VuelaTour · Otros gastos)",
    );
    for (const categoria of ["SERVICIOS", "COMIDA", "GAS", "REFACCION"]) {
      expect(destinoTrasQuitar({ categoria, matricula: null, tieneVuelo: false }), categoria).toBe(
        DESTINO_PENDIENTE_DE_AVION,
      );
    }
  });

  it("GAS sin avión al quitar el reparto: se frena ANTES de la red con el texto del API", () => {
    expect(MSG_COMBUSTIBLE_NECESITA_AVION).toBe(
      "La carga de combustible necesita el avión: selecciona la aeronave (o un vuelo del cual tomarla).",
    );
    expect(errorQuitarRepartoSinAvion({ quitaReparto: true, categoria: "GAS", aeronaveId: "" })).toBe(
      MSG_COMBUSTIBLE_NECESITA_AVION,
    );
    expect(errorQuitarRepartoSinAvion({ quitaReparto: true, categoria: "GAS", aeronaveId: null })).toBe(
      MSG_COMBUSTIBLE_NECESITA_AVION,
    );
    expect(errorQuitarRepartoSinAvion({ quitaReparto: true, categoria: "GAS", aeronaveId: N4142R })).toBeNull();
    // Solo al QUITAR (sin reparto el PATCH rebota sin escribir nada) y solo GAS.
    expect(errorQuitarRepartoSinAvion({ quitaReparto: false, categoria: "GAS", aeronaveId: "" })).toBeNull();
    expect(errorQuitarRepartoSinAvion({ quitaReparto: true, categoria: "SERVICIOS", aeronaveId: "" })).toBeNull();
    // PARIDAD: es el texto del ALTA del API (si el API lo cambia, aquí truena).
    const api = path.resolve(__dirname, "../../../../../vuelatour-api/src/modules/expenses/expenses.service.ts");
    if (existsSync(api)) expect(readFileSync(api, "utf8")).toContain(`'${MSG_COMBUSTIBLE_NECESITA_AVION}'`);
    // Y el planificador, sin el freno, habría puesto el PUT [] primero (la falla a medias).
    const plan = planGuardadoReparto({
      sumaActualCents: 300000,
      montoActualCents: 300000,
      monedaActual: "MXN",
      montoNuevoCents: 300000,
      monedaNueva: "MXN",
      categoriaNueva: "GAS",
      patchConAvion: false,
      patchConVuelo: false,
      nuevo: [],
      riesgoConciliado: false,
    });
    expect(plan).toEqual({ tipo: "PASOS", pasos: ["REPARTO", "GASTO"] });
  });

  it("textos del RepartoDialog: no FIJO idénticos a los de hoy; FIJO vuelve al prorrateo", () => {
    expect(mod.TITULO_QUITAR_REPARTO).toBe("¿Quitar el reparto de este gasto?");
    expect(textoQuitarRepartoDialogo("OTRO")).toBe(
      "El gasto queda 100% como gasto de VuelaTour (empresa): no restará a ningún avión. Puedes volver a repartirlo cuando quieras.",
    );
    expect(textoQuitarRepartoDialogo("FIJO")).toBe(
      "El gasto queda en VuelaTour en el balance y, en el reparto a socios, vuelve a prorratearse entre todos los aviones activos. Puedes volver a repartirlo cuando quieras.",
    );
    expect(toastRepartoQuitadoDialogo("INDIRECTO")).toBe("Reparto eliminado: el gasto queda 100% de VuelaTour");
    expect(toastRepartoQuitadoDialogo("FIJO")).toBe(
      "Reparto eliminado: el gasto fijo vuelve al prorrateo entre los aviones activos",
    );
  });

  it("«Regresar el reparto anterior»", () => {
    expect(mod.TITULO_REGRESAR_REPARTO).toBe("¿Regresar el reparto anterior?");
    expect(textoConfirmarRegresar(RESUMEN_STARLINK)).toBe(
      `El reparto vuelve a quedar así: ${RESUMEN_STARLINK}. Cambia el balance de esos aviones y su reparto a socios.`,
    );
    expect(mod.BOTON_REGRESAR).toBe("Regresar el reparto");
    expect(mod.BOTON_REGRESAR_BANNER).toBe("Regresar el reparto anterior");
    expect(textoRegresadoOk(RESUMEN_STARLINK)).toBe(`Se regresó el reparto anterior (${RESUMEN_STARLINK}).`);
    expect(textoRegresarError("Alguna aeronave del reparto no existe o está inactiva.")).toBe(
      "No se pudo regresar el reparto anterior: Alguna aeronave del reparto no existe o está inactiva",
    );
  });
});

describe("confirmacionRepartoAlGuardar (la UNA confirmación)", () => {
  const comun = { tieneVuelo: false, moneda: "MXN", hoy: "2026-10-14" };
  const MES_SEPTIEMBRE =
    "Es un gasto de septiembre 2026, un mes que ya terminó: al guardar cambian los libros de ese mes (balance de los aviones, reparto a socios y lo que absorbe VuelaTour); si ya los enviaste, vuelve a generarlos.";

  it("quitar STARLINK dejando N990GG (septiembre ya terminó)", () => {
    expect(
      confirmacionRepartoAlGuardar({
        ...comun,
        base: STARLINK,
        nuevo: [],
        quita: true,
        motivoQuitar: "MODO",
        categoriaFinal: "INDIRECTO",
        avionFinal: "N990GG",
        avionGuardado: null,
        fechas: ["2026-09-01", "2026-09-01"],
      }),
    ).toEqual({
      titulo: "¿Quitar el reparto de este gasto?",
      parrafos: [
        "Elegiste «Un avión», así que al guardar se quita el reparto.",
        `Hoy está repartido así: ${RESUMEN_STARLINK}.`,
        "Cada avión pierde su parte (en su balance y en su reparto a socios) y el gasto pasa a: Balance del avión · Gastos Indirectos (N990GG).",
        "Con un solo avión, este gasto resta en el balance de N990GG, pero no en su reparto a socios.",
        MES_SEPTIEMBRE,
      ],
      boton: "Quitar reparto y guardar",
    });
  });

  it("quitar por categoría y en Gasolina («Sin avión»); FIJO vuelve al prorrateo", () => {
    const cat = confirmacionRepartoAlGuardar({
      ...comun,
      base: CRAMEX,
      nuevo: [],
      quita: true,
      motivoQuitar: "CATEGORIA",
      categoriaFinal: "SERVICIOS",
      avionFinal: "XA-VGV",
      avionGuardado: null,
      fechas: ["2026-10-07", "2026-10-07"],
    });
    expect(cat?.parrafos[0]).toBe("«Servicios (avión)» no se reparte entre aviones, así que al guardar se quita el reparto.");
    expect(cat?.parrafos).toHaveLength(3);
    const gasolina = confirmacionRepartoAlGuardar({
      ...comun,
      base: CRAMEX,
      nuevo: [],
      quita: true,
      motivoQuitar: "MODO",
      categoriaFinal: "GASOLINA",
      avionFinal: null,
      avionGuardado: null,
      fechas: ["2026-10-07", "2026-10-07"],
    });
    expect(gasolina?.parrafos[0]).toBe("Elegiste «Sin avión», así que al guardar se quita el reparto.");
    expect(gasolina?.parrafos[2]).toBe(
      "Cada avión pierde su parte (en su balance y en su reparto a socios) y el gasto pasa a: Balance general VuelaTour · Otros gastos (lo absorbe VuelaTour).",
    );
    const fijo = confirmacionRepartoAlGuardar({
      ...comun,
      base: CRAMEX,
      nuevo: [],
      quita: true,
      motivoQuitar: "MODO",
      categoriaFinal: "FIJO",
      avionFinal: null,
      avionGuardado: null,
      fechas: ["2026-10-07", "2026-10-07"],
    });
    expect(fijo?.parrafos).toContain(
      "En el reparto a socios, el gasto fijo vuelve a prorratearse entre todos los aviones activos.",
    );
  });

  it("Cramex: XB-PEV baja en octubre (mes en curso: sin párrafo de mes)", () => {
    expect(
      confirmacionRepartoAlGuardar({
        ...comun,
        base: CRAMEX,
        nuevo: [
          { aeronave_id: XA_VGV, matricula: "XA-VGV", monto: 10000 },
          { aeronave_id: XB_PEV, matricula: "XB-PEV", monto: 6240 },
        ],
        quita: false,
        motivoQuitar: null,
        categoriaFinal: "INDIRECTO",
        avionFinal: null,
        avionGuardado: null,
        fechas: ["2026-10-07", "2026-10-07"],
      }),
    ).toEqual({
      titulo: "¿Guardar el cambio del reparto?",
      parrafos: [
        "Hoy está repartido así: XA-VGV $8,120.00 MXN · XB-PEV $8,120.00 MXN.",
        "Queda así: XA-VGV $10,000.00 MXN · XB-PEV $6,240.00 MXN.",
        "Bajan o salen del reparto: XB-PEV ($8,120.00 MXN → $6,240.00 MXN). Esa diferencia pasa a los demás aviones o a VuelaTour.",
      ],
      boton: "Sí, guardar",
    });
  });

  it("STARLINK sin N4142R (mes terminado como párrafo)", () => {
    const c = confirmacionRepartoAlGuardar({
      ...comun,
      base: STARLINK,
      nuevo: [
        { aeronave_id: N621TX, matricula: "N621TX", monto: 2366.88 },
        { aeronave_id: N990GG, matricula: "N990GG", monto: 2366.88 },
      ],
      quita: false,
      motivoQuitar: null,
      categoriaFinal: "INDIRECTO",
      avionFinal: null,
      avionGuardado: null,
      fechas: ["2026-09-01", "2026-09-01"],
    });
    expect(c?.parrafos).toContain(
      "Bajan o salen del reparto: N4142R ($1,577.92 MXN → $0.00 MXN). Esa diferencia pasa a los demás aviones o a VuelaTour.",
    );
    expect(c?.parrafos.at(-1)).toBe(MES_SEPTIEMBRE);
  });

  it("primer reparto de f3c625e6: SUSTITUYE a N4142R (septiembre)", () => {
    expect(
      confirmacionRepartoAlGuardar({
        ...comun,
        base: [],
        nuevo: [
          { aeronave_id: N4142R, matricula: "N4142R", monto: 32171 },
          { aeronave_id: N621TX, matricula: "N621TX", monto: 32171 },
        ],
        quita: false,
        motivoQuitar: null,
        categoriaFinal: "INDIRECTO",
        avionFinal: null,
        avionGuardado: "N4142R",
        fechas: ["2026-09-10", "2026-09-10"],
      }),
    ).toEqual({
      titulo: "¿Guardar el cambio del reparto?",
      parrafos: [
        "Queda así: N4142R $32,171.00 MXN · N621TX $32,171.00 MXN.",
        "Hoy N4142R carga este gasto en su balance, pero no en su reparto a socios. Repartido, el reparto sustituye a N4142R y cada parte resta en el balance y en el reparto a socios de su avión. Si después quitas el reparto, el gasto no regresa a N4142R: queda sin avión.",
        MES_SEPTIEMBRE,
      ],
      boton: "Sí, guardar",
    });
    // Empresa: el avión era solo referencia.
    const otro = confirmacionRepartoAlGuardar({
      ...comun,
      base: [],
      nuevo: [{ aeronave_id: N4142R, matricula: "N4142R", monto: 100 }],
      quita: false,
      motivoQuitar: null,
      categoriaFinal: "OTRO",
      avionFinal: null,
      avionGuardado: "N4142R",
      fechas: ["2026-10-14", "2026-10-14"],
    });
    expect(otro?.parrafos[1]).toBe(
      "Hoy N4142R es solo referencia (el gasto es de VuelaTour). Repartido, esa referencia se quita y cada parte resta en el balance y en el reparto a socios de su avión.",
    );
  });

  it("primer reparto de un FIJO ⇒ AVISO_REPARTO_FIJO; primer reparto sin avión no FIJO ⇒ sin diálogo", () => {
    const fijo = confirmacionRepartoAlGuardar({
      ...comun,
      base: [],
      nuevo: [{ aeronave_id: N4142R, matricula: "N4142R", monto: 1000 }],
      quita: false,
      motivoQuitar: null,
      categoriaFinal: "FIJO",
      avionFinal: null,
      avionGuardado: null,
      fechas: ["2026-10-14", "2026-10-14"],
    });
    expect(fijo?.parrafos).toEqual(["Queda así: N4142R $1,000.00 MXN.", AVISO_REPARTO_FIJO]);
    expect(
      confirmacionRepartoAlGuardar({
        ...comun,
        base: [],
        nuevo: [{ aeronave_id: N4142R, matricula: "N4142R", monto: 158.58 }, { aeronave_id: N621TX, matricula: "N621TX", monto: 158.59 }],
        quita: false,
        motivoQuitar: null,
        categoriaFinal: "OTRO",
        avionFinal: null,
        avionGuardado: null,
        fechas: ["2026-09-01", "2026-09-01"],
      }),
    ).toBeNull();
    // Solo subir o agregar aviones: sin diálogo.
    expect(
      confirmacionRepartoAlGuardar({
        ...comun,
        base: CRAMEX,
        nuevo: [...CRAMEX, { aeronave_id: N4142R, matricula: "N4142R", monto: 100 }],
        quita: false,
        motivoQuitar: null,
        categoriaFinal: "INDIRECTO",
        avionFinal: null,
        avionGuardado: null,
        fechas: ["2026-09-01", "2026-09-01"],
      }),
    ).toBeNull();
  });
});

describe("mensajeResultadoGastoReparto: cada código y variante", () => {
  const ctx = (o: Partial<ContextoResultadoReparto> = {}): ContextoResultadoReparto => ({
    modo: "EDITAR",
    base: STARLINK,
    nuevo: [
      { aeronave_id: N621TX, matricula: "N621TX", monto: 2366.88 },
      { aeronave_id: N990GG, matricula: "N990GG", monto: 2366.88 },
    ],
    matriculaFinal: null,
    categoria: "INDIRECTO",
    moneda: "MXN",
    ...o,
  });
  const res = (o: Partial<ResultadoGastoConReparto>): ResultadoGastoConReparto => ({
    ok: false,
    codigo: "OK",
    gastoGuardado: false,
    gastoIncierto: false,
    repartoGuardado: false,
    repartoEstado: null,
    pasos: [],
    avisos: [],
    ...o,
  });
  const NUEVO_PUT = respuesta(
    [
      { aeronave_id: N621TX, matricula: "N621TX", monto: 2366.88 },
      { aeronave_id: N990GG, matricula: "N990GG", monto: 2366.88 },
    ],
    4733.76,
  );
  const MOTIVO_PUT = "Alguna aeronave del reparto no existe o está inactiva: solo se reparte entre aviones activos.";

  it("éxitos (crear, editar, quitar con y sin avión, FIJO)", () => {
    const ok = res({ ok: true, codigo: "OK" });
    expect(mensajeResultadoGastoReparto(ok, ctx({ modo: "CREAR" }))).toEqual({
      tipo: "exito",
      texto: "Gasto verificado y repartido entre 2 aviones",
      banner: false,
      conRegresar: false,
    });
    expect(textoExitoGastoReparto(ctx({ modo: "CREAR", nuevo: [STARLINK[0]] }))).toBe("Gasto verificado y repartido entre 1 avión");
    expect(textoExitoGastoReparto(ctx())).toBe("Gasto verificado y reparto actualizado (2 aviones)");
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], matriculaFinal: "N4142R" }))).toBe(
      "Gasto verificado y reparto quitado: quedó en N4142R",
    );
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [] }))).toBe("Gasto verificado y reparto quitado: lo absorbe VuelaTour");
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], categoria: "FIJO" }))).toBe(
      "Gasto verificado y reparto quitado: el gasto fijo vuelve al prorrateo entre los aviones activos",
    );
    // Revisión del 14-oct-2026: ya no «lo absorbe VuelaTour» lo que no es de VuelaTour.
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], categoria: "SERVICIOS" }))).toBe(
      "Gasto verificado y reparto quitado: queda pendiente de avión (pestaña «Pendientes»)",
    );
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], categoria: "COMIDA", tieneVuelo: true }))).toBe(
      "Gasto verificado y reparto quitado: queda en la hoja de su vuelo",
    );
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], categoria: "PERSONAL_DUENO" }))).toBe(
      "Gasto verificado y reparto quitado: queda fuera de los balances (gasto personal del dueño)",
    );
    expect(textoExitoGastoReparto(ctx({ modo: "QUITAR", nuevo: [], categoria: "OTRO" }))).toBe(
      "Gasto verificado y reparto quitado: lo absorbe VuelaTour",
    );
  });

  it("sin respuesta del servidor: textos únicos (el de SIN_RESPUESTA sin reparto es el MISMO)", () => {
    expect(TEXTO_SIN_RESPUESTA_GUARDAR).toBe(
      "No hubo respuesta del servidor al guardar: no sabemos si se guardó. Recarga la página y revisa el gasto antes de volver a guardar.",
    );
    expect(mensajeResultadoGastoReparto({ codigo: "SIN_RESPUESTA" }, ctx()).texto).toBe(TEXTO_SIN_RESPUESTA_GUARDAR);
    expect(TEXTO_VUELO_SIN_RESPUESTA).toBe(
      "Gasto guardado, pero no hubo respuesta al ligar el vuelo: recarga la página y revisa el vuelo del gasto.",
    );
    expect(TEXTO_RETIRAR_SIN_RESPUESTA).toBe(
      "No hubo respuesta del servidor: no sabemos si se retiró la confirmación. Recarga la página para revisarlo.",
    );
  });

  it("BLOQUEO, LECTURA y REPARTO_CAMBIO", () => {
    expect(mensajeResultadoGastoReparto(res({ codigo: "BLOQUEO", error: MSG_REPARTO_CONCILIADO }), ctx())).toEqual({
      tipo: "error",
      texto: MSG_REPARTO_CONCILIADO,
      banner: true,
      toastMs: undefined,
      conRegresar: false,
    });
    expect(mensajeResultadoGastoReparto(res({ codigo: "LECTURA", error: "fetch failed" }), ctx()).texto).toBe(
      "No se pudo leer el reparto actual del gasto (el servidor no respondió). No se guardó nada; vuelve a intentarlo.",
    );
    expect(mensajeResultadoGastoReparto(res({ codigo: "REPARTO_CAMBIO", reparto: NUEVO_PUT }), ctx())).toEqual({
      tipo: "aviso",
      texto:
        "Otra persona cambió el reparto de este gasto mientras lo editabas. Ahora está: N621TX $2,366.88 MXN · N990GG $2,366.88 MXN. No se guardó nada: revisa el reparto y vuelve a guardar.",
      banner: true,
      toastMs: TOAST_AVISO_MS,
      conRegresar: false,
    });
  });

  it("GASTO (texto del API tal cual o «campo: error») y GASTO_INCIERTO", () => {
    const folio =
      'Ya existe un gasto con el folio/remisión "A-1": es el mismo pago capturado dos veces. Si de verdad es otro ticket, corrige el folio.';
    expect(mensajeResultadoGastoReparto(res({ codigo: "GASTO", error: folio }), ctx())).toEqual({
      tipo: "error",
      texto: folio,
      banner: false,
      conRegresar: false,
    });
    expect(
      mensajeResultadoGastoReparto(res({ codigo: "GASTO", fieldErrors: { folio_ticket: ["Too big"] } }), ctx()).texto,
    ).toBe("folio_ticket: Too big");
    expect(mensajeResultadoGastoReparto(res({ codigo: "GASTO_INCIERTO", error: "Bad Gateway" }), ctx())).toEqual({
      tipo: "error",
      texto:
        "No se pudo confirmar si el gasto se guardó (el servidor no respondió). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.",
      banner: true,
      toastMs: TOAST_LARGO_MS,
      conRegresar: false,
    });
  });

  it("PARCIAL_SIN_REPARTO: igual al anterior, distinto y desconocido", () => {
    const igual = mensajeResultadoGastoReparto(
      res({ codigo: "PARCIAL_SIN_REPARTO", gastoGuardado: true, repartoEstado: "IGUAL_AL_ANTERIOR", error: MOTIVO_PUT }),
      ctx(),
    );
    expect(igual).toEqual({
      tipo: "error",
      texto: `El gasto se guardó, pero el reparto NO cambió: Alguna aeronave del reparto no existe o está inactiva: solo se reparte entre aviones activos. Sigue como estaba (${RESUMEN_STARLINK}). Pulsa «Guardar» otra vez para reintentar el reparto.`,
      banner: true,
      toastMs: TOAST_LARGO_MS,
      conRegresar: false,
    });
    const aMedias = respuesta([{ aeronave_id: N621TX, matricula: "N621TX", monto: 2366.88 }], 4733.76);
    const distinto = mensajeResultadoGastoReparto(
      res({ codigo: "PARCIAL_SIN_REPARTO", gastoGuardado: true, repartoEstado: "DISTINTO", reparto: aMedias, error: "x" }),
      ctx(),
    );
    expect(distinto.texto).toBe(
      "El gasto se guardó, pero el reparto quedó distinto al que pediste (pudo guardarse a medias): ahora está N621TX $2,366.88 MXN · VuelaTour $2,366.88 MXN. Revísalo y pulsa «Guardar» para dejarlo como lo quieres.",
    );
    expect(distinto.conRegresar).toBe(true);
    expect(
      mensajeResultadoGastoReparto(
        res({ codigo: "PARCIAL_SIN_REPARTO", gastoGuardado: true, repartoEstado: "DESCONOCIDO", error: "socket hang up" }),
        ctx(),
      ).texto,
    ).toBe(
      "El gasto se guardó, pero no se pudo confirmar cómo quedó el reparto (el servidor no respondió). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.",
    );
  });

  it("PARCIAL_SOLO_REPARTO: Cramex a 14,000 (PUT con el monto viejo), quitar e incierto", () => {
    const put = respuesta(
      [
        { aeronave_id: XA_VGV, matricula: "XA-VGV", monto: 7000 },
        { aeronave_id: XB_PEV, matricula: "XB-PEV", monto: 7000 },
      ],
      16240,
    );
    const m = mensajeResultadoGastoReparto(
      res({ codigo: "PARCIAL_SOLO_REPARTO", repartoGuardado: true, repartoEstado: "IGUAL_AL_NUEVO", reparto: put, error: "El folio ya existe." }),
      ctx({ base: CRAMEX }),
    );
    expect(m.texto).toBe(
      "Se guardó el reparto (XA-VGV $7,000.00 MXN · XB-PEV $7,000.00 MXN · VuelaTour $2,240.00 MXN), pero el gasto NO se guardó: El folio ya existe. Corrige y pulsa «Guardar», o regresa el reparto anterior.",
    );
    expect(m.conRegresar).toBe(true);
    expect(m.toastMs).toBe(TOAST_LARGO_MS);
    expect(
      mensajeResultadoGastoReparto(
        res({ codigo: "PARCIAL_SOLO_REPARTO", repartoGuardado: true, error: "Revisa la categoría." }),
        ctx({ modo: "QUITAR", nuevo: [] }),
      ).texto,
    ).toBe(
      "Se guardó el reparto (sin reparto (100 % VuelaTour)), pero el gasto NO se guardó: Revisa la categoría. Corrige y pulsa «Guardar», o regresa el reparto anterior.",
    );
    expect(
      mensajeResultadoGastoReparto(
        res({ codigo: "PARCIAL_SOLO_REPARTO", repartoGuardado: true, gastoIncierto: true, reparto: put, error: "fetch failed" }),
        ctx({ base: CRAMEX }),
      ).texto,
    ).toBe(
      "Se guardó el reparto (XA-VGV $7,000.00 MXN · XB-PEV $7,000.00 MXN · VuelaTour $2,240.00 MXN), pero no se pudo confirmar si el gasto se guardó (el servidor no respondió). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.",
    );
  });

  it("SIN_NADA_REPARTO (PUT primero): sin nada, distinto y sin poder releer", () => {
    expect(
      mensajeResultadoGastoReparto(res({ codigo: "SIN_NADA_REPARTO", repartoEstado: "IGUAL_AL_ANTERIOR", error: MOTIVO_PUT }), ctx()),
    ).toEqual({
      tipo: "error",
      texto:
        "No se guardó nada: el reparto no se pudo cambiar (Alguna aeronave del reparto no existe o está inactiva: solo se reparte entre aviones activos).",
      banner: true,
      toastMs: undefined,
      conRegresar: false,
    });
    const distinto = mensajeResultadoGastoReparto(
      res({ codigo: "SIN_NADA_REPARTO", repartoEstado: "DISTINTO", reparto: NUEVO_PUT, error: "x" }),
      ctx(),
    );
    expect(distinto.texto).toBe(
      "El gasto NO se guardó y el reparto quedó distinto al que pediste (pudo guardarse a medias): ahora está N621TX $2,366.88 MXN · N990GG $2,366.88 MXN. Revísalo y pulsa «Guardar» otra vez.",
    );
    expect(distinto.conRegresar).toBe(true);
    expect(
      mensajeResultadoGastoReparto(res({ codigo: "SIN_NADA_REPARTO", repartoEstado: "DESCONOCIDO", error: "network" }), ctx()).texto,
    ).toBe(
      "No se pudo cambiar el reparto (el servidor no respondió) ni confirmar cómo quedó. El gasto NO se guardó. Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.",
    );
  });

  it("SIN_RESPUESTA con y sin relectura", () => {
    expect(mensajeResultadoGastoReparto({ codigo: "SIN_RESPUESTA", reparto: NUEVO_PUT }, ctx()).texto).toBe(
      "No hubo respuesta del servidor al guardar: no sabemos si el gasto se guardó. El reparto ahora está así: N621TX $2,366.88 MXN · N990GG $2,366.88 MXN. Recarga la página y revisa el gasto antes de volver a guardar.",
    );
    const sin = mensajeResultadoGastoReparto({ codigo: "SIN_RESPUESTA", reparto: null }, ctx());
    expect(sin).toEqual({
      tipo: "error",
      texto:
        "No hubo respuesta del servidor al guardar: no sabemos si se guardó. Recarga la página y revisa el gasto antes de volver a guardar.",
      banner: true,
      toastMs: TOAST_LARGO_MS,
      conRegresar: false,
    });
  });
});

describe("GUARDIA: los textos del avión siguen a categoriaLlevaAvion (TODAS las categorías)", () => {
  // Revisión del 14-oct-2026: «(resuelve pendiente)», «la bandeja de
  // pendientes» y «lo absorbe VuelaTour» decían lo contrario en algunas
  // categorías (la comisión que paga VuelaTour, Servicios sin avión…).
  for (const categoria of Object.keys(CATEGORIA_GASTO_LABELS)) {
    it(categoria, () => {
      const lleva = categoriaLlevaAvion(categoria);
      const d = descripcionVerificarGasto({ enReparto: false, categoria });
      expect(d.includes("Sin avión, el gasto queda en la bandeja de pendientes"), d).toBe(lleva);
      if (!lleva) expect(d, d).not.toMatch(/(?<!no )queda en la bandeja de pendientes/);
      expect(etiquetaCampoAvionSinModos(categoria) === ETIQUETA_AVION_RESUELVE_PENDIENTE).toBe(lleva);
      const destino = destinoTrasQuitar({ categoria, matricula: null, tieneVuelo: false });
      if (lleva) {
        expect(destino).toBe(DESTINO_PENDIENTE_DE_AVION);
        expect(destino).not.toContain("lo absorbe VuelaTour");
      }
      const exito = textoExitoGastoReparto({
        modo: "QUITAR",
        base: STARLINK,
        nuevo: [],
        matriculaFinal: null,
        categoria,
        moneda: "MXN",
      });
      if (lleva) expect(exito).not.toContain("lo absorbe VuelaTour");
    });
  }
});

describe("GUARDIA: nada manda a «Otros gastos» a editar el reparto", () => {
  const PROHIBIDO = /(pantalla|desde|en) «?otros gastos/i;

  it("ni constantes ni textos producidos con los ejemplos reales (STARLINK, Cramex, FIJO, GASOLINA)", () => {
    const textos: string[] = [];
    for (const [nombre, valor] of Object.entries(mod)) {
      if (typeof valor === "string") textos.push(`${nombre}: ${valor}`);
    }
    const categorias = ["INDIRECTO", "OTRO", "NOMINA", "FIJO", "GASOLINA", "VISITA", "SERVICIOS", "COMIDA", "PERSONAL_DUENO", "GAS", "PERMISO", "REFACCION"];
    for (const categoria of categorias) {
      for (const matricula of [null, "N4142R"]) {
        for (const tieneVuelo of [false, true]) {
          textos.push(destinoTrasQuitar({ categoria, matricula, tieneVuelo }));
        }
        textos.push(ayudaModoUno({ categoria, matricula }) ?? "");
        textos.push(textoQueCambiaAlRepartir({ categoria, matriculaGuardada: matricula }));
      }
      textos.push(tituloModoUno(categoria));
      textos.push(textoQuitarRepartoDialogo(categoria), toastRepartoQuitadoDialogo(categoria));
      textos.push(configAvionGasto({ categoria, vueloSel: "", repartoGuardado: true }).motivoSinReparto ?? "");
      for (const base of [STARLINK, CRAMEX, []]) {
        for (const quita of [true, false]) {
          const c = confirmacionRepartoAlGuardar({
            base,
            nuevo: quita ? [] : [STARLINK[1]],
            quita,
            motivoQuitar: quita ? "MODO" : null,
            categoriaFinal: categoria,
            avionFinal: quita ? "N990GG" : null,
            tieneVuelo: false,
            avionGuardado: "N4142R",
            moneda: "MXN",
            fechas: ["2026-09-01"],
            hoy: "2026-10-14",
          });
          if (c) textos.push(c.titulo, ...c.parrafos, c.boton);
        }
      }
    }
    textos.push(
      hojaDestinoReparto({ matriculas: ["N4142R"], restoCents: 100, moneda: "MXN" }),
      hojaDestinoReparto({ matriculas: [], restoCents: 0, moneda: "MXN" }),
      avisoRepartoSeQuita({ motivo: "MODO", resumen: RESUMEN_STARLINK }),
      avisoRepartoSeQuita({ motivo: "CATEGORIA", resumen: RESUMEN_STARLINK, label: "Comida" }),
      notaIaConReparto({ categoria: "SERVICIOS", moneda: "USD", matricula: "N990GG" }),
      textoRefuerzoAvion("x"),
    );
    const ctx: ContextoResultadoReparto = { modo: "EDITAR", base: STARLINK, nuevo: [], matriculaFinal: null, categoria: "INDIRECTO", moneda: "MXN" };
    for (const codigo of ["OK", "BLOQUEO", "LECTURA", "REPARTO_CAMBIO", "GASTO", "GASTO_INCIERTO", "PARCIAL_SIN_REPARTO", "PARCIAL_SOLO_REPARTO", "SIN_NADA_REPARTO"] as const) {
      for (const repartoEstado of ["IGUAL_AL_ANTERIOR", "DISTINTO", "DESCONOCIDO"] as const) {
        textos.push(
          mensajeResultadoGastoReparto(
            { ok: false, codigo, gastoGuardado: true, gastoIncierto: false, repartoGuardado: false, repartoEstado, pasos: [], avisos: [], error: "x" },
            ctx,
          ).texto,
        );
      }
    }
    textos.push(mensajeResultadoGastoReparto({ codigo: "SIN_RESPUESTA" }, ctx).texto);
    const malos = textos.filter((t) => PROHIBIDO.test(t));
    expect(malos).toEqual([]);
    // La guardia sí detecta el texto que se quiere evitar.
    expect(PROHIBIDO.test("repártelo desde la pantalla Otros gastos")).toBe(true);
  });
});

describe("tipos del resultado (el gasto del embed)", () => {
  it("partesDeGasto acepta el Gasto de la lista tal cual", () => {
    const g = { repartos: EMBED_STARLINK } as Pick<Gasto, "repartos">;
    expect(partesDeGasto(g).map((p) => p.matricula)).toEqual(["N4142R", "N621TX", "N990GG"]);
  });
});
