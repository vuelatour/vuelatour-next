/**
 * «Factura NNNN» en Conciliación (13-oct-2026, API 0.0.75). El NÚMERO lo lee
 * el API; aquí se custodia que el panel lo ROTULE igual siempre: tonos y
 * tooltips por estado de los gastos ligados, la palabra «prefactura», el chip
 * «también en otro pago», la liga (±7 días buscando el número en `?mvq=`) y
 * los cuatro textos del cuadro de «Vincular gasto».
 */
import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import {
  ETIQUETA_COINCIDE_FACTURA,
  TITULO_COINCIDE_FACTURA,
  avisoFacturaEnCandidatos,
  chipFacturaConcepto,
  textoBusquedaFacturaConcepto,
} from "@/lib/admin/conciliacion-factura-concepto";
import type { FacturaConceptoCandidatos, FacturaConceptoMovimiento } from "@/types/conciliacion";

const fc = (over: Partial<FacturaConceptoMovimiento> = {}): FacturaConceptoMovimiento => ({
  tipo: "FACTURA",
  numeros: ["7360"],
  texto: "Factura 7360",
  pista: "VIP",
  ligados: null,
  repetida_en: [],
  ...over,
});

const CARGO = { fecha: "2026-10-12", tipo: "CARGO" };

describe("chipFacturaConcepto: texto, tono y tooltip por estado", () => {
  it("sin ligados (cargo pendiente): gris, y dice que los gastos con esa factura salen con ★", () => {
    const c = chipFacturaConcepto(fc(), CARGO);
    expect(c.texto).toBe("Factura 7360");
    expect(c.tono).toBe("neutro");
    expect(c.titulo).toBe(
      "El banco dice «Factura 7360». Al vincular el gasto, los que tienen esa factura salen marcados con ★.",
    );
    expect(c.repetida).toBeNull();
  });

  it("en un ABONO solo dice lo que dice el banco", () => {
    expect(chipFacturaConcepto(fc(), { fecha: "2026-10-12", tipo: "ABONO" }).titulo).toBe(
      "El banco dice «Factura 7360».",
    );
  });

  it("COINCIDE: verde «· coincide»", () => {
    const c = chipFacturaConcepto(fc({ ligados: { estado: "COINCIDE", folios: ["7360"], faltan: [] } }), CARGO);
    expect(c.texto).toBe("Factura 7360 · coincide");
    expect(c.tono).toBe("ok");
    expect(c.titulo).toBe("El gasto vinculado tiene la misma factura que dice el banco.");
  });

  it("PARCIAL: ámbar «· falta 7360» con el tooltip del contrato", () => {
    const c = chipFacturaConcepto(
      fc({
        numeros: ["7359", "7360"],
        texto: "Facturas 7359 · 7360",
        ligados: { estado: "PARCIAL", folios: ["7359"], faltan: ["7360"] },
      }),
      CARGO,
    );
    expect(c.texto).toBe("Facturas 7359 · 7360 · falta 7360");
    expect(c.tono).toBe("aviso");
    expect(c.titulo).toBe(
      "El banco dice Facturas 7359 · 7360 y en los gastos vinculados falta: 7360. Revisa si este pago cubre otra factura.",
    );
  });

  it("PARCIAL sin faltantes (algún gasto trae OTRO número): ámbar con lo que dice el gasto", () => {
    const c = chipFacturaConcepto(fc({ ligados: { estado: "PARCIAL", folios: ["7360", "7361"], faltan: [] } }), CARGO);
    expect(c.tono).toBe("aviso");
    expect(c.texto).toBe("Factura 7360 · el gasto dice 7360 y 7361");
    expect(c.titulo).toContain("algún gasto vinculado tiene otra factura (7360 y 7361)");
  });

  it("NO_COINCIDE: ámbar «· el gasto dice 7361» (máximo 2 folios unidos con «y»)", () => {
    const c = chipFacturaConcepto(fc({ ligados: { estado: "NO_COINCIDE", folios: ["7361"], faltan: ["7360"] } }), CARGO);
    expect(c.texto).toBe("Factura 7360 · el gasto dice 7361");
    expect(c.tono).toBe("aviso");
    expect(c.titulo).toBe(
      "El banco dice que este pago es de la factura 7360, pero el gasto vinculado tiene la 7361. Revisa si se vinculó el gasto correcto: con montos iguales puede ser el de otro vuelo.",
    );
    const tres = chipFacturaConcepto(
      fc({ ligados: { estado: "NO_COINCIDE", folios: ["7361", "7362", "7363"], faltan: ["7360"] } }),
      CARGO,
    );
    expect(tres.texto).toBe("Factura 7360 · el gasto dice 7361 y 7362");
  });

  it("SIN_FOLIO: gris con cómo capturar el número (Folio o «fact NNNN» en las notas)", () => {
    const c = chipFacturaConcepto(fc({ ligados: { estado: "SIN_FOLIO", folios: [], faltan: ["7360"] } }), CARGO);
    expect(c.texto).toBe("Factura 7360");
    expect(c.tono).toBe("neutro");
    expect(c.titulo).toBe(
      "El gasto vinculado no tiene número de factura: escríbelo en su «Folio» (o «fact 7360» en la primera línea de sus notas si la factura ampara varios gastos) para poder compararlo.",
    );
  });

  it("PREFACTURA: la palabra cambia en los textos (caso Corner)", () => {
    const pre = fc({ tipo: "PREFACTURA", numeros: ["4409"], texto: "Prefactura 4409", pista: "CORNER" });
    expect(chipFacturaConcepto(pre, CARGO).titulo).toContain("los que tienen esa prefactura");
    expect(
      chipFacturaConcepto({ ...pre, ligados: { estado: "COINCIDE", folios: ["4409"], faltan: [] } }, CARGO).titulo,
    ).toBe("El gasto vinculado tiene la misma prefactura que dice el banco.");
    expect(chipFacturaConcepto(pre, CARGO).ariaLabel).toBe(
      "Ver en una pestaña nueva los movimientos con la prefactura 4409",
    );
  });
});

describe("chipFacturaConcepto: repetida y liga", () => {
  const rep = (fecha: string, monto: number, cuenta: string, conciliado: boolean) => ({
    movimiento_id: `m-${fecha}`,
    fecha,
    monto,
    cuenta,
    descripcion: "SEL TRANSF. INTERBANCARIA SPEI BANORTE fact vip 7360",
    conciliado,
  });

  it("una repetida: «también en otro pago» con fecha, monto, cuenta y si está conciliado", () => {
    const c = chipFacturaConcepto(fc({ repetida_en: [rep("2026-09-30", 2231.38, "EJE SCOTIA", true)] }), CARGO);
    expect(c.repetida?.texto).toBe("también en otro pago");
    expect(c.repetida?.titulo).toBe(
      `La factura 7360 también aparece en: ${fmtDateOnly("2026-09-30")} · $2,231.38 · EJE SCOTIA (conciliado). Si es un pago en partes está bien; si no, revisa si se pagó dos veces.`,
    );
  });

  it("varias: «también en N pagos más»; null o [] no pintan nada", () => {
    const c = chipFacturaConcepto(
      fc({
        repetida_en: [rep("2026-09-30", 2231.38, "EJE SCOTIA", true), rep("2026-10-01", 2231.38, "GASTOS GNRAL", false)],
      }),
      CARGO,
    );
    expect(c.repetida?.texto).toBe("también en 2 pagos más");
    expect(c.repetida?.titulo).toContain("; ");
    expect(chipFacturaConcepto(fc({ repetida_en: null }), CARGO).repetida).toBeNull();
    expect(chipFacturaConcepto(fc({ repetida_en: [] }), CARGO).repetida).toBeNull();
  });

  it("la liga: Conciliación de la fecha más vieja −7 a la más nueva +7, buscando el número (mvq)", () => {
    expect(chipFacturaConcepto(fc(), CARGO).href).toBe(
      "/admin/conciliacion?desde=2026-10-05&hasta=2026-10-19&mvq=7360",
    );
    const conRep = chipFacturaConcepto(fc({ repetida_en: [rep("2026-09-30", 2231.38, "EJE SCOTIA", true)] }), CARGO);
    expect(conRep.href).toBe("/admin/conciliacion?desde=2026-09-23&hasta=2026-10-19&mvq=7360");
  });

  it("nombre accesible y búsqueda rápida", () => {
    expect(chipFacturaConcepto(fc(), CARGO).ariaLabel).toBe(
      "Ver en una pestaña nueva los movimientos con la factura 7360",
    );
    expect(textoBusquedaFacturaConcepto({ factura_concepto: fc() })).toBe("Factura 7360");
    expect(textoBusquedaFacturaConcepto({})).toBe("");
    expect(textoBusquedaFacturaConcepto({ factura_concepto: null })).toBe("");
  });
});

describe("avisoFacturaEnCandidatos: el cuadro de «Vincular gasto»", () => {
  const cand = (over: Partial<FacturaConceptoCandidatos> = {}): FacturaConceptoCandidatos => ({
    tipo: "FACTURA",
    numeros: ["7360"],
    texto: "Factura 7360",
    pista: "VIP",
    otros_gastos: [],
    ...over,
  });

  it("encabezado con la pista y coincidentes en singular y plural", () => {
    const uno = avisoFacturaEnCandidatos(cand(), [{ coincide_factura: true }, { coincide_factura: false }, {}]);
    expect(uno.encabezado).toBe("El banco dice: Factura 7360 (VIP)");
    expect(uno.coincidentes).toBe("★ 1 gasto tiene esa factura (marcado con ★ en la lista).");
    expect(uno.sinCaptura).toBeNull();
    const dos = avisoFacturaEnCandidatos(cand({ pista: null }), [{ coincide_factura: true }, { coincide_factura: true }]);
    expect(dos.encabezado).toBe("El banco dice: Factura 7360");
    expect(dos.coincidentes).toBe("★ 2 gastos tienen esa factura (marcados con ★ en la lista).");
  });

  it("otros gastos con esa factura que no salen aquí (singular, plural y «esas facturas»)", () => {
    const grupo = (n: number) => ({ motivo: "YA_CONCILIADO", n, gastos: [] });
    expect(avisoFacturaEnCandidatos(cand({ otros_gastos: [grupo(1)] }), []).otrosTitulo).toBe(
      "Con la factura 7360 hay otro gasto que no sale aquí:",
    );
    expect(avisoFacturaEnCandidatos(cand({ otros_gastos: [grupo(1), grupo(1)] }), []).otrosTitulo).toBe(
      "Con la factura 7360 hay 2 gastos que no salen aquí:",
    );
    expect(
      avisoFacturaEnCandidatos(
        cand({ numeros: ["7359", "7360"], texto: "Facturas 7359 · 7360", otros_gastos: [grupo(1)] }),
        [],
      ).otrosTitulo,
    ).toBe("Con esas facturas hay otro gasto que no sale aquí:");
  });

  it("nadie la tiene capturada y no hay otros: cómo capturarla", () => {
    expect(avisoFacturaEnCandidatos(cand(), []).sinCaptura).toBe(
      "Ningún gasto tiene capturada la factura 7360. Escribe el número en el «Folio» del gasto (o «fact 7360» en la primera línea de sus notas si la factura ampara varios gastos) para que el cruce funcione.",
    );
  });

  it("`otros_gastos` null (no se pudo leer): no se afirma nada de los demás", () => {
    const a = avisoFacturaEnCandidatos(cand({ otros_gastos: null }), []);
    expect(a.otrosTitulo).toBeNull();
    expect(a.sinCaptura).toBeNull();
    expect(a.coincidentes).toBeNull();
  });

  it("el renglón del candidato y su tooltip", () => {
    expect(ETIQUETA_COINCIDE_FACTURA("Factura 7360")).toBe(
      "★ Su folio coincide con el concepto del banco (Factura 7360)",
    );
    expect(TITULO_COINCIDE_FACTURA).toBe(
      "El número que viene en el concepto del banco es el folio de este gasto. Es una señal, no una prueba: confirma también el monto antes de vincular.",
    );
  });
});
