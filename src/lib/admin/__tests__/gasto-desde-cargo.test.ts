import { describe, expect, it } from "vitest";
import type { GastoCandidato, SugerenciaConciliacion } from "@/types/conciliacion";
import {
  BOTON_CREAR,
  BOTON_CREAR_DE_TODOS_MODOS,
  CASILLA_CONFIRMACION,
  CASILLA_CONFIRMACION_IA_ALTA,
  botonCrear,
  casillaConfirmacion,
  duplicadosDeCandidatos,
  duplicadosDeRespuesta,
  fichaSugeridaIa,
  prefillGastoDesdeCargo,
  puedeCrear,
  terminacionDeReferencia,
  textoResumenCargo,
  textoTrasCrear,
  veredictoIa,
} from "../gasto-desde-cargo";

const CARGO = {
  monto: "-212.00",
  fecha: "2026-09-07",
  descripcion: "ASUR CANCUN",
  referencia: "0025830577",
};

describe("prellenado del alta desde el cargo", () => {
  it("monto positivo a 2 decimales, moneda de la cuenta, fecha del cargo, tarjeta por la referencia y notas con la leyenda", () => {
    expect(prefillGastoDesdeCargo(CARGO, "MXN")).toEqual({
      monto: "212.00",
      moneda: "MXN",
      fecha_gasto: "2026-09-07",
      medio_pago: "TARJETA_CORP",
      tarjeta_terminacion: "0577",
      notas: "ASUR CANCUN · ref. 0025830577",
    });
  });

  it("sin referencia larga ⇒ transferencia; cuenta USD ⇒ USD; sin descripción ⇒ notas vacías", () => {
    expect(prefillGastoDesdeCargo({ ...CARGO, referencia: "174465" }, "USD")).toMatchObject({
      moneda: "USD",
      medio_pago: "TRANSFERENCIA",
      tarjeta_terminacion: "",
      notas: "ASUR CANCUN · ref. 174465",
    });
    expect(prefillGastoDesdeCargo({ monto: "0", fecha: "2026-09-07", descripcion: null, referencia: null }, null)).toEqual({
      monto: "",
      moneda: "MXN",
      fecha_gasto: "2026-09-07",
      medio_pago: "TRANSFERENCIA",
      tarjeta_terminacion: "",
      notas: "",
    });
    expect(terminacionDeReferencia("00000000000000000001 AUT. 456529")).toBe("6529");
    expect(terminacionDeReferencia(null)).toBeNull();
  });

  it("el resumen del cargo", () => {
    expect(textoResumenCargo(CARGO, "MXN")).toBe("Cargo de $212 MXN del 07 sep 2026 · ASUR CANCUN");
  });
});

describe("posibles duplicados", () => {
  const c = (id: string, monto: number, extra: Partial<GastoCandidato> = {}): GastoCandidato => ({
    id,
    monto,
    fecha_gasto: "2026-09-28",
    ...extra,
  });
  it("mismo monto (±0.01) o mismo faltante; los demás no", () => {
    const lista = [c("a", 212), c("b", 212.01), c("c", 500, { faltante: 212 }), c("d", 300)];
    expect(duplicadosDeCandidatos(lista, "-212").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(duplicadosDeCandidatos(null, 212)).toEqual([]);
    const r = duplicadosDeRespuesta(
      { movimiento: { id: "m", fecha: "", monto: 212, moneda: "MXN" }, ventana: { desde: "", hasta: "" }, candidatos: lista, truncado: false, excluidos: [{ motivo: "YA_CONCILIADO", n: 1, gastos: [] }] },
      212,
    );
    expect(r.duplicados).toHaveLength(3);
    expect(r.excluidos).toHaveLength(1);
    expect(duplicadosDeRespuesta(null, 1).excluidos).toEqual([]);
  });
});

describe("veredicto de la IA y confirmación", () => {
  const sug = (extra: Partial<SugerenciaConciliacion>): SugerenciaConciliacion => ({
    disponible: true,
    gasto_id_sugerido: null,
    confianza: 0,
    razon: null,
    candidatos: [],
    ...extra,
  });
  it("pendiente, sin match, no disponible, sugiere (baja y alta)", () => {
    expect(veredictoIa(undefined, true).tipo).toBe("pendiente");
    expect(veredictoIa(sug({}), false)).toMatchObject({ tipo: "sin_match" });
    expect(veredictoIa(sug({ motivo_sin_match: "ningún gasto cuadra" }), false).texto).toContain("ningún gasto cuadra");
    expect(veredictoIa(sug({ disponible: false }), false).tipo).toBe("no_disponible");
    expect(veredictoIa(null, false).tipo).toBe("no_disponible");
    const baja = veredictoIa(sug({ gasto_id_sugerido: "g1", confianza: 0.4, razon: "monto igual" }), false);
    expect(baja).toMatchObject({ tipo: "sugiere", gastoId: "g1", alta: false });
    expect(baja.texto).toContain("40 %");
    const alta = veredictoIa(sug({ gasto_id_sugerido: "g1", confianza: 0.92, candidatos: [{ id: "g1", monto: 212 }] }), false);
    expect(alta).toMatchObject({ tipo: "sugiere", alta: true });
    expect(alta.texto).toContain("YA corresponde");
    expect(fichaSugeridaIa(sug({ gasto_id_sugerido: "g1", candidatos: [{ id: "g1", monto: 212 }] }))?.id).toBe("g1");
    expect(fichaSugeridaIa(sug({}))).toBeNull();
    expect(botonCrear(alta)).toBe(BOTON_CREAR_DE_TODOS_MODOS);
    expect(botonCrear(baja)).toBe(BOTON_CREAR);
    expect(casillaConfirmacion(alta)).toBe(CASILLA_CONFIRMACION_IA_ALTA);
    expect(casillaConfirmacion(baja)).toBe(CASILLA_CONFIRMACION);
  });

  it("solo se crea con la casilla marcada y sin la búsqueda de duplicados en curso", () => {
    expect(puedeCrear({ confirmado: true, buscandoDuplicados: false })).toBe(true);
    expect(puedeCrear({ confirmado: false, buscandoDuplicados: false })).toBe(false);
    expect(puedeCrear({ confirmado: true, buscandoDuplicados: true })).toBe(false);
  });

  it("el toast tras crear dice si quedó vinculado", () => {
    expect(textoTrasCrear(true)).toEqual({ titulo: "Gasto registrado y vinculado al cargo" });
    expect(textoTrasCrear(false, "Ese cargo ya está conciliado.")).toEqual({
      titulo: "Gasto registrado, pero NO quedó vinculado al cargo",
      descripcion: "Ese cargo ya está conciliado. Vincúlalo desde el menú del cargo («Vincular gasto»).",
    });
  });
});
