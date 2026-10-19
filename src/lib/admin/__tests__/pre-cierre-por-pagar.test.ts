/**
 * «Resolver →» del renglón BLOQUEANTE `gastos_por_pagar` (revisión del lote
 * «por pagar», 19-oct-2026, acuerdo 1 entre repos):
 *  - P1: Gastos «Por pagar» SIN desde/hasta (el API cuenta por el mes
 *    contable; la fecha del pago puede caer en otro mes) + el foco de los ids.
 *  - P2: la nómina por pagar se resuelve en Nómina (Gastos no la enseña):
 *    todos de nómina ⇒ Nómina con el foco; mezcla ⇒ Gastos + el aviso
 *    «N son de Nómina: resuélvelos en Nómina» con su liga. Sin `ids_nomina`
 *    (API previo) ⇒ como siempre.
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_RESOLVER_EN_NOMINA,
  avisoNominaPorPagar,
  resolverPrecierreGastosPorPagar,
  type ItemPreCierrePorPagar,
} from "../pre-cierre-por-pagar";
import { leerFocoPreCierre } from "../pre-cierre-resolver";

const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31" };
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const N1 = "cccccccc-0000-4000-8000-00000000000c";
const N2 = "dddddddd-0000-4000-8000-00000000000d";

const renglon = (over: Partial<ItemPreCierrePorPagar> = {}): ItemPreCierrePorPagar => ({
  clave: "gastos_por_pagar",
  titulo: "Gastos por pagar sin confirmar",
  detalle: "3 gasto(s) siguen «por pagar» (1 vencidos): márcalos pagados con la fecha real del pago, o elimínalos si no se pagaron.",
  count: 3,
  ...over,
});

/** Los params de una URL del panel (el foco viaja codificado). */
const params = (href: string | null) => new URLSearchParams((href ?? "").split("?")[1] ?? "");
const ruta = (href: string | null) => (href ?? "").split("?")[0];

describe("sin `ids_nomina` (API previo) o vacía: como siempre, pero SIN desde/hasta (P1)", () => {
  it("Gastos «Por pagar» con el foco de todos los ids y sin rango de fechas", () => {
    for (const ids_nomina of [undefined, [], null, "basura"]) {
      const r = resolverPrecierreGastosPorPagar(renglon({ count: 2, ids: [A, B], ids_nomina }), PERIODO);
      expect(r.nomina, String(ids_nomina)).toBeNull();
      expect(r.href!.startsWith("/admin/expenses?por_pagar=1&pc=gastos_por_pagar&pcn=2&pcp=2026-10-01,2026-10-31&")).toBe(true);
      const p = params(r.href);
      expect(p.get("ids")).toBe(`${A},${B}`);
      // Lo que congelaba la conducta vieja: ya no viajan.
      expect(p.has("desde")).toBe(false);
      expect(p.has("hasta")).toBe(false);
    }
  });

  it("lectura fallida o informativo ⇒ la base intacta (sin foco ni aviso); sin base ⇒ sin enlace", () => {
    const fallida = resolverPrecierreGastosPorPagar(renglon({ count: 0, lectura_fallida: true, ids_nomina: [N1] }), PERIODO);
    expect(fallida).toEqual({ href: "/admin/expenses?por_pagar=1", nomina: null });
    expect(resolverPrecierreGastosPorPagar(renglon({ informativo: true }), PERIODO).href).toBe("/admin/expenses?por_pagar=1");
    expect(resolverPrecierreGastosPorPagar(renglon({ ids: [A] }), PERIODO, null)).toEqual({ href: null, nomina: null });
  });

  it("ids de nómina que NO vienen en `ids` o que no son uuid se ignoran (nada se inventa)", () => {
    const r = resolverPrecierreGastosPorPagar(renglon({ count: 2, ids: [A, B], ids_nomina: [N1, "no-uuid", 7] }), PERIODO);
    expect(r.nomina).toBeNull();
    expect(ruta(r.href)).toBe("/admin/expenses");
    expect(params(r.href).get("ids")).toBe(`${A},${B}`);
  });
});

describe("TODOS de nómina (P2): «Resolver →» a Nómina en el mes del periodo con el foco", () => {
  it("la quincena por pagar del 30-oct: Nómina octubre, foco con sus ids y el periodo para «Volver»", () => {
    const r = resolverPrecierreGastosPorPagar(renglon({ count: 2, ids: [N1, N2], ids_nomina: [N2, N1] }), PERIODO);
    expect(r.nomina).toBeNull();
    expect(r.href!.startsWith("/admin/nomina?mes=2026-10&pc=gastos_por_pagar&pcn=2&pcp=2026-10-01,2026-10-31&")).toBe(true);
    expect(params(r.href).get("ids")).toBe(`${N1},${N2}`);
    // La página Nómina lee el foco con la MISMA función de siempre.
    const foco = leerFocoPreCierre(Object.fromEntries(params(r.href)));
    expect(foco?.clave).toBe("gastos_por_pagar");
    expect(foco?.ids).toEqual([N1, N2]);
    expect(foco?.periodo).toEqual(PERIODO);
  });

  it("mayúsculas en el API: se comparan en minúsculas", () => {
    const r = resolverPrecierreGastosPorPagar(renglon({ count: 1, ids: [N1.toUpperCase()], ids_nomina: [N1.toUpperCase()] }), PERIODO);
    expect(ruta(r.href)).toBe("/admin/nomina");
  });
});

describe("MEZCLA (P2): Gastos con lo que sí sale ahí + el aviso a Nómina", () => {
  it("1 de nómina y 2 de Gastos: cada destino recibe SUS ids y su conteo", () => {
    const r = resolverPrecierreGastosPorPagar(renglon({ count: 3, ids: [A, N1, B], ids_nomina: [N1] }), PERIODO);
    expect(ruta(r.href)).toBe("/admin/expenses");
    const pg = params(r.href);
    expect(pg.get("por_pagar")).toBe("1");
    expect(pg.get("ids")).toBe(`${A},${B}`);
    expect(pg.get("pcn")).toBe("2");
    expect(pg.has("desde")).toBe(false);
    expect(r.nomina).not.toBeNull();
    expect(r.nomina!.texto).toBe("1 es de Nómina: resuélvelo en Nómina");
    expect(r.nomina!.etiqueta).toBe("Ir a Nómina →");
    expect(ruta(r.nomina!.href)).toBe("/admin/nomina");
    const pn = params(r.nomina!.href);
    expect(pn.get("mes")).toBe("2026-10");
    expect(pn.get("ids")).toBe(N1);
    expect(pn.get("pcn")).toBe("1");
    expect(pn.get("pc")).toBe("gastos_por_pagar");
  });

  it("textos: singular, plural y «Al menos» cuando el API recortó la lista", () => {
    expect(avisoNominaPorPagar(1)).toBe("1 es de Nómina: resuélvelo en Nómina");
    expect(avisoNominaPorPagar(2)).toBe("2 son de Nómina: resuélvelos en Nómina");
    expect(avisoNominaPorPagar(2, true)).toBe("Al menos 2 son de Nómina: resuélvelos en Nómina");
    expect(avisoNominaPorPagar(1, true)).toBe("Al menos 1 es de Nómina: resuélvelo en Nómina");
    expect(ETIQUETA_RESOLVER_EN_NOMINA).toBe("Ir a Nómina →");
  });

  it("recortada por el API (`ids_truncado`): aunque todos los vistos sean de nómina, es mezcla y Gastos conserva el count del API", () => {
    const r = resolverPrecierreGastosPorPagar(
      renglon({ count: 640, ids: [N1, N2], ids_nomina: [N1, N2], ids_truncado: true }),
      PERIODO,
    );
    expect(ruta(r.href)).toBe("/admin/expenses");
    expect(params(r.href).get("pcn")).toBe("640");
    expect(r.nomina!.texto).toBe("Al menos 2 son de Nómina: resuélvelos en Nómina");
  });
});
