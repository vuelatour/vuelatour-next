/**
 * Card «Fondo consolidado · caja madre» (27-oct-2026). Pedido de Mary Cruz:
 * ver el fondo total, lo asignado a cada colaborador, el efectivo que
 * conserva cada uno, sus gastos pendientes y el efectivo real de su caja.
 * Aquí se cuida el MARCADO (las cifras del API llegan a la pantalla y el
 * cuadre se dice con su tono) y el cableado de la página.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumenMadreCard } from "../resumen-madre-card";
import {
  ETIQUETA_SALIDAS_PENDIENTES,
  NOTA_POR_SOLICITAR,
  NOTA_POR_SOLICITAR_API_PREVIO,
  NOTA_POR_SOLICITAR_CUBIERTO,
  NOTA_POR_SOLICITAR_SIN_FONDO,
  TEXTO_CUADRA,
  TEXTO_SIN_FONDO_TOTAL,
} from "@/lib/admin/caja-chica-madre";
import type { CajaFondeada, ResumenCajaMadre } from "@/types/caja-chica";

const GREGORIO = "9a6b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const ALEXANDER = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

const caja = (p: Partial<CajaFondeada>): CajaFondeada => ({
  fondo_id: GREGORIO,
  usuario_id: "u-greg",
  nombre: "Gregorio Jurado",
  moneda: "MXN",
  activo: true,
  por_reponer: 3199.91,
  ultima_reposicion: { fecha: "2026-10-15", monto: 5000 },
  monto_fondo: 5000,
  es_acumulada: false,
  saldo_libro: 1800.09,
  gastos_pendientes: { n: 4, total: 3199.91 },
  ...p,
});

/**
 * Las cifras reales de la caja de Mary el 27-oct-2026, con el API 0.0.113
 * (28-oct-2026): `por_solicitar` = propio 17,500 − libro (−128.56) y lo que
 * salió del tramo aparte en `salidas_pendientes`.
 */
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
  salidas_pendientes: 13227.5,
  por_solicitar: 17628.56,
  efectivo_libro: -128.56,
  efectivo_esperado: 4272.5,
  diferencia: -4401.06,
};

const fondo = {
  moneda: "MXN" as const,
  cajas_fondeadas: [
    caja({}),
    caja({
      fondo_id: ALEXANDER,
      usuario_id: "u-alex",
      nombre: "Alexander E. Saab",
      monto_fondo: 4000,
      saldo_libro: 4000,
      por_reponer: 0,
      gastos_pendientes: { n: 0, total: 0 },
      ultima_reposicion: { fecha: "2026-10-19", monto: 1100 },
    }),
  ],
};

const render = (resumen: ResumenCajaMadre) => renderToStaticMarkup(<ResumenMadreCard fondo={fondo} resumen={resumen} />);

describe("ResumenMadreCard", () => {
  it("las cuatro cifras de arriba: fondo total, asignado (N cajas), lo que debe estar en mi caja y lo por solicitar (= propio − saldo, regla de Mary)", () => {
    const html = render(MARY);
    expect(html).toContain("Fondo consolidado · caja madre");
    expect(html).toContain("$40,000.00");
    expect(html).toContain("$22,500.00");
    expect(html).toContain("6 cajas");
    expect(html).toContain("$17,500.00");
    expect(html).toContain("$17,628.56");
    expect(html).toContain(NOTA_POR_SOLICITAR);
    expect(html).toContain('data-solicitar="ambar"');
    expect(html).not.toContain(NOTA_POR_SOLICITAR_API_PREVIO);
  });

  it("«Para solicitar»: saldo que cubre el fondo propio ⇒ verde y «nada que solicitar»; sin fondo ⇒ «—» y pide fijarlo; API previo ⇒ la nota del tramo", () => {
    const cubierto = render({ ...MARY, por_solicitar: -300, efectivo_libro: 17800 });
    expect(cubierto).toContain("-$300.00");
    expect(cubierto).toContain(NOTA_POR_SOLICITAR_CUBIERTO);
    expect(cubierto).toContain('data-solicitar="ok"');
    const sinFondo = render({ ...MARY, fondo_total: null, fondo_propio: null, por_solicitar: null, efectivo_esperado: null, diferencia: null });
    expect(sinFondo).toContain(NOTA_POR_SOLICITAR_SIN_FONDO);
    expect(sinFondo).toContain('data-solicitar="neutro"');
    const { salidas_pendientes: _s, ...previo } = { ...MARY, por_solicitar: 13227.5 };
    void _s;
    const html = render(previo as ResumenCajaMadre);
    expect(html).toContain("$13,227.50");
    expect(html).toContain(NOTA_POR_SOLICITAR_API_PREVIO);
    expect(html).not.toContain(ETIQUETA_SALIDAS_PENDIENTES);
  });

  it("el «Editar» del fondo vive en la cifra «Fondo total» de la card (28-oct-2026: las tarjetas de arriba se quitaron en la madre)", () => {
    const html = renderToStaticMarkup(
      <ResumenMadreCard fondo={fondo} resumen={MARY} editar={<span data-editar="">Editar</span>} />,
    );
    const fondoTotal = html.indexOf("Fondo total");
    const editar = html.indexOf('data-editar=""');
    const asignado = html.indexOf("Asignado a colaboradores");
    expect(editar).toBeGreaterThan(fondoTotal);
    expect(editar).toBeLessThan(asignado);
  });

  it("una fila por colaborador con enlace a su caja y las cifras de su libro; totales al pie", () => {
    const html = render(MARY);
    expect(html).toContain(`href="/admin/caja-chica/${GREGORIO}"`);
    expect(html).toContain(">Gregorio Jurado<");
    expect(html).toContain("$1,800.09");
    expect(html).toContain("4 gastos · $3,199.91");
    expect(html).toContain("15 oct 2026 · $5,000.00");
    expect(html).toContain(">Alexander E. Saab<");
    expect(html).toContain("sin gastos");
    // Totales (del API, no sumados aquí).
    expect(html).toContain("$18,287.10");
    expect(html).toContain("$4,224.91");
    expect(html).toContain("8 gastos · $4,224.91");
  });

  it("«Mi caja hoy»: pendientes, entregas, lo que salió, esperado, libro (rojo si negativo) y la diferencia con su aviso", () => {
    const html = render(MARY);
    expect(html).toContain("11 gastos · $7,127.50");
    expect(html).toContain("2 entregas · $6,100.00");
    expect(html).toContain(ETIQUETA_SALIDAS_PENDIENTES);
    expect(html).toContain("$13,227.50");
    expect(html).toContain("$4,272.50");
    expect(html).toContain("-$128.56");
    expect(html).toContain("-$4,401.06");
    expect(html).toContain('data-cuadre="rojo"');
    expect(html).toContain("El libro trae $4,401.06 menos de lo esperado.");
    // Sin «otros movimientos» no se pinta esa línea.
    expect(html).not.toContain("Otros movimientos desde la última reposición");
  });

  it("cuadra ⇒ verde; sin fondo total ⇒ neutro y pide fijarlo", () => {
    expect(render({ ...MARY, efectivo_libro: 4272.5, diferencia: 0 })).toContain('data-cuadre="ok"');
    expect(render({ ...MARY, efectivo_libro: 4272.5, diferencia: 0 })).toContain(TEXTO_CUADRA);
    const sinFondo = render({ ...MARY, fondo_total: null, fondo_propio: null, efectivo_esperado: null, diferencia: null });
    expect(sinFondo).toContain('data-cuadre="neutro"');
    expect(sinFondo).toContain(TEXTO_SIN_FONDO_TOTAL);
  });

  it("otros movimientos distintos de cero sí se listan", () => {
    expect(render({ ...MARY, otros_pendientes: -1000 })).toContain("Otros movimientos desde la última reposición");
  });

  it("cableado: la página monta la card solo con `resumen_madre` del API, con el «Editar» del fondo; en la madre no pinta «Fondo total» ni «Por reponer» arriba", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../../app/admin/caja-chica/[id]/page.tsx"), "utf8");
    expect(src).toContain("const resumenMadre = resumenMadreDeFondo(fondo);");
    expect(src).toContain("const esMadre = resumenMadre != null;");
    expect(src).toContain("{resumenMadre && (\n        <ResumenMadreCard\n          fondo={fondo}\n          resumen={resumenMadre}\n          editar={\n            <FondoMontoButton");
    expect(src).toContain("{!fondo.es_acumulada && !esMadre && (");
    expect(src).toContain("{!fondo.es_acumulada && !esMadre && fondo.monto_fondo != null && (");
  });
});
