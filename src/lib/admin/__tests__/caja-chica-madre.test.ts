/**
 * Caja chica MADRE (15-oct-2026): a quién se repuso, reponer a una caja hija
 * y el filtro Desde/Hasta del historial. Todo PURO: lo de dinero lo manda el
 * API (invariante 83) y aquí solo se elige qué mostrar.
 */
import { describe, expect, it } from "vitest";
import {
  cajasParaReponer,
  filtrarHistorialPorRango,
  hayRangoHistorial,
  hrefCajaChica,
  nombreDeReferenciaFondeo,
  opcionCajaFondeada,
  pasoAlRegistrar,
  pistaMontoReponerA,
  rangoHistorialCaja,
  repuestoADeEntrada,
  textoConfirmarReposicionHija,
  textoPeriodoHistorial,
  textoRepuestoA,
  valoresReponerA,
} from "../caja-chica-madre";
import type { CajaFondeada } from "@/types/caja-chica";

const GREGORIO = "9a6b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const JIMMY = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

const caja = (p: Partial<CajaFondeada> = {}): CajaFondeada => ({
  fondo_id: GREGORIO,
  usuario_id: "u-greg",
  nombre: "Gregorio Jurado",
  moneda: "MXN",
  activo: true,
  por_reponer: 5000,
  ultima_reposicion: { fecha: "2026-10-01", monto: 3000 },
  ...p,
});

describe("¿a quién se repuso? (espejo en la caja madre)", () => {
  const espejo = { espejo_de_id: "rep-1", referencia: "Fondeo a Gregorio J." };

  it("el nombre VIVO de repuesto_a gana a la referencia congelada, con enlace a su caja", () => {
    expect(
      repuestoADeEntrada(
        { origen: "caja", repuesto_a: { fondo_id: GREGORIO, usuario_id: "u", nombre: "Gregorio Jurado" } },
        espejo,
      ),
    ).toEqual({ nombre: "Gregorio Jurado", fondoId: GREGORIO });
  });

  it("API previo (sin la llave): la referencia «Fondeo a X», sin enlace", () => {
    expect(repuestoADeEntrada({ origen: "caja" }, espejo)).toEqual({
      nombre: "Gregorio J.",
      fondoId: null,
    });
  });

  it("repuesto_a null (la reposición no volvió): cae a la referencia", () => {
    expect(repuestoADeEntrada({ origen: "caja", repuesto_a: null }, espejo)).toEqual({
      nombre: "Gregorio J.",
      fondoId: null,
    });
  });

  it("repuesto_a sin nombre: la referencia, con el enlace de repuesto_a", () => {
    expect(
      repuestoADeEntrada(
        { origen: "caja", repuesto_a: { fondo_id: GREGORIO, usuario_id: "u", nombre: null } },
        espejo,
      ),
    ).toEqual({ nombre: "Gregorio J.", fondoId: GREGORIO });
  });

  it("sin nada que diga a quién: null (el renglón de siempre)", () => {
    expect(repuestoADeEntrada({ origen: "caja" }, { espejo_de_id: "x", referencia: null })).toBeNull();
    expect(repuestoADeEntrada({ origen: "caja", repuesto_a: null }, null)).toBeNull();
  });

  it("lo que no es espejo no dice nada, aunque su referencia diga «Fondeo a…»", () => {
    expect(
      repuestoADeEntrada({ origen: "caja" }, { espejo_de_id: null, referencia: "Fondeo a Itzi" }),
    ).toBeNull();
    expect(repuestoADeEntrada({ origen: "gasto" }, espejo)).toBeNull();
  });

  it("fondo_id que no es uuid ⇒ sin enlace (jamás un /admin/caja-chica/basura)", () => {
    expect(
      repuestoADeEntrada(
        { origen: "caja", repuesto_a: { fondo_id: "nada", usuario_id: "u", nombre: "Itzi" } },
        null,
      ),
    ).toEqual({ nombre: "Itzi", fondoId: null });
  });

  it("textos y ruta", () => {
    expect(nombreDeReferenciaFondeo("  Fondeo a  Nelson Hau ")).toBe("Nelson Hau");
    expect(nombreDeReferenciaFondeo("Depósito 123")).toBeNull();
    expect(textoRepuestoA("Gregorio Jurado")).toBe("Reposición a la caja de Gregorio Jurado");
    expect(hrefCajaChica(GREGORIO)).toBe(`/admin/caja-chica/${GREGORIO}`);
  });
});

describe("reponer a una caja hija desde la madre", () => {
  it("se ofrece SOLO con cajas: API previo, null (lectura caída), [] o madre inactiva ⇒ null", () => {
    expect(cajasParaReponer({ activo: true })).toBeNull();
    expect(cajasParaReponer({ activo: true, cajas_fondeadas: null })).toBeNull();
    expect(cajasParaReponer({ activo: true, cajas_fondeadas: [] })).toBeNull();
    expect(cajasParaReponer({ activo: false, cajas_fondeadas: [caja()] })).toBeNull();
    const dos = [caja(), caja({ fondo_id: JIMMY, nombre: "Jimmy Chi" })];
    expect(cajasParaReponer({ activo: true, cajas_fondeadas: dos })).toEqual(dos);
  });

  it("la opción dice cuánto tiene por reponer (la cifra del API, sin recalcular) y su última reposición", () => {
    expect(opcionCajaFondeada(caja())).toEqual({
      value: GREGORIO,
      label: "Gregorio Jurado · por reponer $5,000.00",
      description: "Última reposición: 01 oct 2026 · $3,000.00",
    });
    expect(opcionCajaFondeada(caja({ por_reponer: 2738.99, ultima_reposicion: null })).label).toBe(
      "Gregorio Jurado · por reponer $2,738.99",
    );
    expect(opcionCajaFondeada(caja({ ultima_reposicion: null })).description).toBe(
      "Sin reposiciones registradas",
    );
    expect(opcionCajaFondeada(caja({ nombre: null })).label).toBe("Caja sin nombre · por reponer $5,000.00");
  });

  it("prellenado: reposición, en la moneda de la hija, por lo pendiente y con la fecha de hoy", () => {
    expect(valoresReponerA(caja(), "2026-10-15")).toEqual({
      tipo: "REPOSICION",
      monto: "5000",
      moneda: "MXN",
      fecha: "2026-10-15",
    });
    expect(valoresReponerA(caja({ por_reponer: 2738.99, moneda: "USD" }), "2026-10-15")).toMatchObject({
      monto: "2738.99",
      moneda: "USD",
    });
    // Nada pendiente: vacío (una reposición de 0 no se guarda).
    expect(valoresReponerA(caja({ por_reponer: 0 }), "2026-10-15").monto).toBe("");
    expect(pistaMontoReponerA(caja({ por_reponer: 0 }))).toBe(
      "Gregorio Jurado no tiene nada pendiente por reponer.",
    );
    expect(pistaMontoReponerA(caja())).toBe(
      "Lo pendiente por reponer de Gregorio Jurado: $5,000.00 (puedes cambiarlo).",
    );
  });

  it("confirmación ANTES de registrar con monto, fecha, caja hija y caja madre", () => {
    expect(
      textoConfirmarReposicionHija({ monto: "5000", hija: caja(), madre: "Mary Cruz", fecha: "2026-10-15" }),
    ).toBe(
      "Se registrará una reposición de $5,000.00 con fecha 15 oct 2026 en la caja de Gregorio Jurado y su reintegro en la caja de Mary Cruz.",
    );
    // La fecha decide qué gastos quedan repuestos: una fecha cambiada se VE.
    expect(
      textoConfirmarReposicionHija({ monto: "5000", hija: caja(), madre: "Mary Cruz", fecha: "2026-10-01" }),
    ).toContain("con fecha 01 oct 2026 ");
    // Sin fecha (o inválida) el registro usa la de hoy.
    for (const fecha of ["", null, undefined, "2026-13-45"]) {
      expect(textoConfirmarReposicionHija({ monto: "5000", hija: caja(), madre: "Mary Cruz", fecha })).toBe(
        "Se registrará una reposición de $5,000.00 con fecha de hoy en la caja de Gregorio Jurado y su reintegro en la caja de Mary Cruz.",
      );
    }
    expect(pasoAlRegistrar({ hija: caja(), confirmado: false })).toBe("confirmar");
    expect(pasoAlRegistrar({ hija: caja(), confirmado: true })).toBe("registrar");
    // El movimiento de la propia caja: como siempre, sin paso extra.
    expect(pasoAlRegistrar({ hija: null, confirmado: false })).toBe("registrar");
  });
});

describe("filtro Desde/Hasta del historial", () => {
  it("solo días AAAA-MM-DD reales; inválido se ignora; invertido se corrige", () => {
    expect(rangoHistorialCaja("2026-10-01", "2026-10-15")).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" });
    expect(rangoHistorialCaja("2026-10-15", "2026-10-01")).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" });
    expect(rangoHistorialCaja("2026-13-45", "2026-10-15")).toEqual({ hasta: "2026-10-15" });
    expect(rangoHistorialCaja("2026-10-01T00:00:00Z", undefined)).toEqual({});
    expect(rangoHistorialCaja(["2026-10-02", "2026-10-09"], null)).toEqual({ desde: "2026-10-02" });
    expect(hayRangoHistorial({})).toBe(false);
    expect(hayRangoHistorial({ hasta: "2026-10-15" })).toBe(true);
  });

  const libro = [
    { fecha: "2026-10-15", saldo: 100, por_reponer: 900, id: "a" },
    { fecha: "2026-10-10", saldo: 400, por_reponer: 600, id: "b" },
    { fecha: "2026-10-01", saldo: 1000, por_reponer: 0, id: "c" },
    { fecha: "2026-09-30", saldo: 0, por_reponer: 1000, id: "d" },
  ];

  it("filtra FILAS por la fecha de pared (texto, extremos incluidos) y conserva saldo y por reponer", () => {
    const f = filtrarHistorialPorRango(libro, { desde: "2026-10-01", hasta: "2026-10-10" });
    expect(f.map((e) => e.id)).toEqual(["b", "c"]);
    expect(f[0]).toBe(libro[1]); // la MISMA fila: nada recalculado
    expect(filtrarHistorialPorRango(libro, { desde: "2026-10-11" }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrarHistorialPorRango(libro, { hasta: "2026-09-30" }).map((e) => e.id)).toEqual(["d"]);
    expect(filtrarHistorialPorRango(libro, {})).toEqual(libro);
  });

  it("la línea del periodo visto", () => {
    expect(textoPeriodoHistorial({ desde: "2026-10-01", hasta: "2026-10-15" }, 12, 80)).toBe(
      "Viendo del 01 oct 2026 al 15 oct 2026 · 12 de 80 movimientos",
    );
    expect(textoPeriodoHistorial({ desde: "2026-10-01" }, 0, 1)).toBe(
      "Viendo desde el 01 oct 2026 · 0 de 1 movimiento",
    );
    expect(textoPeriodoHistorial({ hasta: "2026-10-15" }, 3, 4)).toBe(
      "Viendo hasta el 15 oct 2026 · 3 de 4 movimientos",
    );
    expect(textoPeriodoHistorial({ desde: "2026-10-15", hasta: "2026-10-15" }, 1, 4)).toBe(
      "Viendo del 15 oct 2026 · 1 de 4 movimientos",
    );
    expect(textoPeriodoHistorial({}, 4, 4)).toBeNull();
  });
});
