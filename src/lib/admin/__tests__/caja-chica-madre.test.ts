/**
 * Caja chica MADRE (15-oct-2026): a quién se repuso, reponer a una caja hija
 * y el filtro Desde/Hasta del historial. Todo PURO: lo de dinero lo manda el
 * API (invariante 83) y aquí solo se elige qué mostrar.
 */
import { describe, expect, it } from "vitest";
import {
  DETALLE_LIBRO_MAS,
  DETALLE_LIBRO_MENOS,
  TEXTO_CUADRA,
  TEXTO_SIN_FONDO_TOTAL,
  cajasParaReponer,
  estadoCuadreMadre,
  filasColaboradoresResumen,
  filtrarHistorialPorRango,
  hayRangoHistorial,
  hrefCajaChica,
  nombreDeReferenciaFondeo,
  opcionCajaFondeada,
  pasoAlRegistrar,
  pistaMontoReponerA,
  rangoHistorialCaja,
  repuestoADeEntrada,
  resumenMadreDeFondo,
  textoCajas,
  textoConfirmarReposicionHija,
  textoConteoMonto,
  textoPeriodoHistorial,
  textoRepuestoA,
  valoresReponerA,
} from "../caja-chica-madre";
import type { CajaFondeada, ResumenCajaMadre } from "@/types/caja-chica";

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

/**
 * FONDO CONSOLIDADO de la caja madre (27-oct-2026, API 0.0.109). Las cifras
 * son las REALES de la caja de Mary Cruz ese día (fondo $40,000, seis cajas
 * por $22,500, libro en −$128.56): aquí solo se formatea y se redacta el
 * cuadre; nada se suma.
 */
describe("fondo consolidado de la caja madre", () => {
  const MARY: ResumenCajaMadre = {
    fondo_total: 40000,
    cajas: 6,
    asignado_colaboradores: 22500,
    fondo_propio: 17500,
    efectivo_colaboradores: 18287.1,
    pendiente_colaboradores: 4224.91,
    gastos_pendientes_colaboradores: { n: 8, total: 4224.91 },
    gastos_pendientes: { n: 11, total: 7127.5 },
    entregas_pendientes: { n: 2, total: 6100 },
    otros_pendientes: 0,
    por_solicitar: 13227.5,
    efectivo_libro: -128.56,
    efectivo_esperado: 4272.5,
    diferencia: -4401.06,
  };

  it("resumenMadreDeFondo: solo un objeto cuenta; null o ausente ⇒ null (sin card)", () => {
    expect(resumenMadreDeFondo({ resumen_madre: MARY })).toBe(MARY);
    expect(resumenMadreDeFondo({ resumen_madre: null })).toBeNull();
    expect(resumenMadreDeFondo({})).toBeNull();
  });

  it("textoCajas y textoConteoMonto", () => {
    expect(textoCajas(6)).toBe("6 cajas");
    expect(textoCajas(1)).toBe("1 caja");
    expect(textoConteoMonto({ n: 11, total: 7127.5 }, "MXN", "gasto", "gastos")).toBe("11 gastos · $7,127.50");
    expect(textoConteoMonto({ n: 1, total: 5000 }, "MXN", "entrega", "entregas")).toBe("1 entrega · $5,000.00");
    expect(textoConteoMonto({ n: 0, total: 0 }, "MXN", "gasto", "gastos")).toBe("sin gastos");
    expect(textoConteoMonto(undefined, "MXN", "entrega", "entregas")).toBe("sin entregas");
  });

  it("estadoCuadreMadre: el libro con MENOS ⇒ rojo con el monto; con MÁS ⇒ ámbar; igual ⇒ cuadra; sin fondo ⇒ neutro", () => {
    expect(estadoCuadreMadre(MARY, "MXN")).toEqual({
      tono: "rojo",
      titulo: "El libro trae $4,401.06 menos de lo esperado.",
      detalle: DETALLE_LIBRO_MENOS,
    });
    expect(estadoCuadreMadre({ diferencia: 2000 }, "MXN")).toEqual({
      tono: "ambar",
      titulo: "El libro trae $2,000.00 más de lo esperado.",
      detalle: DETALLE_LIBRO_MAS,
    });
    expect(estadoCuadreMadre({ diferencia: 0 }, "MXN")).toEqual({ tono: "ok", titulo: TEXTO_CUADRA, detalle: null });
    // Medio centavo no es diferencia.
    expect(estadoCuadreMadre({ diferencia: 0.004 }, "MXN").tono).toBe("ok");
    expect(estadoCuadreMadre({ diferencia: null }, "MXN")).toEqual({
      tono: "neutro",
      titulo: TEXTO_SIN_FONDO_TOTAL,
      detalle: null,
    });
  });

  it("filasColaboradoresResumen: una fila por caja activa con las cifras del API; sin los aditivos, guiones", () => {
    const gregorio = caja({
      monto_fondo: 5000,
      es_acumulada: false,
      saldo_libro: 1800.09,
      por_reponer: 3199.91,
      gastos_pendientes: { n: 4, total: 3199.91 },
      ultima_reposicion: { fecha: "2026-10-15", monto: 5000 },
    });
    const luis = caja({
      fondo_id: JIMMY,
      nombre: "Luis Caceres",
      monto_fondo: 8000,
      saldo_libro: 8000,
      por_reponer: 0,
      gastos_pendientes: { n: 0, total: 0 },
      ultima_reposicion: { fecha: "2026-09-30", monto: 2836.12 },
    });
    const acumulada = caja({
      fondo_id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
      nombre: "Piloto Acumulada",
      es_acumulada: true,
      monto_fondo: null,
      saldo_libro: -250,
      por_reponer: 250,
      gastos_pendientes: { n: 2, total: 250 },
      ultima_reposicion: null,
    });
    const viejo = caja({ fondo_id: "4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a", nombre: "API previo", por_reponer: 0 });
    const inactiva = caja({ fondo_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", nombre: "Cerrada", activo: false });
    const filas = filasColaboradoresResumen({ cajas_fondeadas: [gregorio, luis, acumulada, viejo, inactiva] });
    expect(filas.map((f) => f.nombre)).toEqual(["Gregorio Jurado", "Luis Caceres", "Piloto Acumulada", "API previo"]);
    expect(filas[0]).toEqual({
      fondoId: GREGORIO,
      nombre: "Gregorio Jurado",
      href: `/admin/caja-chica/${GREGORIO}`,
      acumulada: false,
      fondoAsignado: "$5,000.00",
      efectivo: "$1,800.09",
      efectivoTono: "ok",
      gastosPendientes: "4 gastos · $3,199.91",
      porReponer: "$3,199.91",
      porReponerTono: "ambar",
      ultimaReposicion: "15 oct 2026 · $5,000.00",
    });
    expect(filas[1]).toMatchObject({ porReponer: "$0.00", porReponerTono: "ok", gastosPendientes: "sin gastos" });
    expect(filas[2]).toMatchObject({
      acumulada: true,
      fondoAsignado: "—",
      efectivo: "-$250.00",
      efectivoTono: "rojo",
      ultimaReposicion: "Ninguna",
    });
    // API previo (sin los aditivos): nada se inventa.
    expect(filas[3]).toMatchObject({ fondoAsignado: "—", efectivo: "—", efectivoTono: "neutro", gastosPendientes: "—" });
    expect(filasColaboradoresResumen({ cajas_fondeadas: null })).toEqual([]);
    expect(filasColaboradoresResumen({})).toEqual([]);
  });
});
