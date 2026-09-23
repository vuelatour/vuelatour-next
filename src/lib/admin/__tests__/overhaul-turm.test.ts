/**
 * T.U.R.M. = TSO y el TBO vencido (22-sep-2026).
 *
 * Caso REAL del reporte: hélice del **XB-ANU** — la oficina capturó Horas
 * totales 2708 y TURM 364 (las horas que la hélice lleva DESDE su overhaul,
 * que es lo que dice la bitácora) y la ficha acabó mostrando TSO 2,344.00,
 * Restantes −344.00 y «Vida usada 100 %» sobre un TBO de 2,000.
 *
 * La resta la arregla el API (`tso_base = turm_componente`). Lo que se prueba
 * aquí es lo que el operador LEE: que la barra no se pase del 100 %, que el
 * vencido se diga con palabras y que el aviso de captura hable del TSO.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_HORAS_COMPONENTE,
  ETIQUETA_TURM,
  HINT_TURM,
  avisoTsoImposible,
  estadoTbo,
  renglonRestantes,
  textoVidaTbo,
} from "@/lib/admin/overhaul-turm";

describe("estadoTbo", () => {
  it("el ciclo normal no se toca (ámbar solo cerca del overhaul)", () => {
    const e = estadoTbo({ restanteHr: 1636, vidaUsadaPct: 18.2 });
    expect(e.vencido).toBe(false);
    expect(e.pctBarra).toBe(18.2);
    expect(e.tono).toBe("ok");
    expect(textoVidaTbo(e)).toBe("18.20 %");
    expect(renglonRestantes(e, 1636)).toEqual({
      label: "Restantes a overhaul",
      value: "1,636.00 hrs",
    });
  });

  it("XB-ANU (el bug): la barra se recorta y el vencido se DICE", () => {
    // Lo que respondía el API con el TSO mal derivado: 2,344 sobre TBO 2,000.
    const e = estadoTbo({ restanteHr: -344, vidaUsadaPct: 117.2 });
    expect(e.vencido).toBe(true);
    expect(e.pctBarra).toBe(100); // la barra NUNCA se pasa
    expect(e.pctTexto).toBe(117.2); // el dato crudo no se pierde
    expect(e.tono).toBe("rojo");
    expect(textoVidaTbo(e)).toBe("overhaul vencido por 344.00 h");
    // NUNCA «Restantes −344.00 hrs», que es lo que la oficina leyó como
    // «no está haciendo bien la resta».
    expect(renglonRestantes(e, -344)).toEqual({
      label: "Overhaul",
      value: "vencido por 344.00 h",
    });
  });

  it("XB-ANU con el TURM bien leído: 364 desde el overhaul", () => {
    // Lo que responderá el API tras la corrección: TSO 364, TBO 2,000.
    const e = estadoTbo({ restanteHr: 1636, vidaUsadaPct: 18.2 });
    expect(e.vencido).toBe(false);
    expect(avisoTsoImposible({ tsnHr: 2708, tsoHr: 364 })).toBeNull();
  });

  it("a 25 h o menos del overhaul avisa en ámbar, y el 0 ya es vencido", () => {
    expect(estadoTbo({ restanteHr: 25, vidaUsadaPct: 98.8 }).tono).toBe("ambar");
    const justo = estadoTbo({ restanteHr: 0, vidaUsadaPct: 100 });
    expect(justo.vencido).toBe(true);
    // Sin exceso que contar NO se escribe «vencido por 0.00 h» (sonaría a
    // error de cuentas, que es justo lo que reportó la oficina).
    expect(justo.excedidoHr).toBeNull();
    expect(textoVidaTbo(justo)).toBe("overhaul cumplido");
    expect(renglonRestantes(justo, 0).value).toBe("toca ahora (sin horas restantes)");
    expect(estadoTbo({ restanteHr: -0.004, vidaUsadaPct: 100 }).excedidoHr).toBeNull();
  });

  it("sin dato no se afirma nada", () => {
    const e = estadoTbo({ restanteHr: null, vidaUsadaPct: null });
    expect(e.vencido).toBe(false);
    expect(e.pctBarra).toBe(0);
    expect(renglonRestantes(e, null)).toEqual({
      label: "Restantes a overhaul",
      value: "—",
    });
  });
});

describe("avisoTsoImposible", () => {
  it("el TSO no puede superar al TSN (espejo del 400 del API)", () => {
    const aviso = avisoTsoImposible({ tsnHr: 364, tsoHr: 2708 });
    expect(aviso).toContain("TSO");
    expect(aviso).toContain("2,708.00");
    expect(aviso).toContain("364.00");
  });

  it("igual no es error (componente sin vuelo desde su overhaul)", () => {
    expect(avisoTsoImposible({ tsnHr: 2708, tsoHr: 2708 })).toBeNull();
    expect(avisoTsoImposible({ tsnHr: 2708, tsoHr: null })).toBeNull();
    expect(avisoTsoImposible({ tsnHr: null, tsoHr: 364 })).toBeNull();
  });
});

describe("textos de captura", () => {
  it("dicen DESDE, que es la palabra que cambia el número que se teclea", () => {
    expect(HINT_TURM).toContain("DESDE");
    expect(HINT_TURM).toContain("TSO");
    expect(ETIQUETA_TURM).toContain("TURM");
    expect(AYUDA_HORAS_COMPONENTE).toContain("DESDE");
    // La lectura VIEJA («horas del componente EN su último overhaul») es la
    // que provocó el reporte: no puede volver por descuido.
    expect(AYUDA_HORAS_COMPONENTE).not.toContain("en su último overhaul");
    expect(HINT_TURM).not.toContain("en su último overhaul");
  });
});
