/**
 * Pre-cierre: los renglones INVERSOS (15-oct-2026, PEDIDOS 3 y 4 del cliente,
 * NO bloquean): «Vuelos con TUA pagada por Operación sin TUA cobrada al
 * cliente» y «Vuelos con transporte pagado sin transporte cotizado». Salen
 * con su chip propio (`CHIP_POR_CLAVE`) a la cotización de cada vuelo y
 * «Resolver →» a la lista de Cotizaciones del periodo. Se retiraron
 * `pistas_sin_gasto` y `tua_cobrada_sin_pagada` (jamás se reusan).
 * Datos: los de prod del estreno (#70, #125, #154; #190).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preCierre = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => preCierre(...a) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string; title?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");

const PERIODO = { desde: "2026-08-01", hasta: "2026-08-31" };
const V125 = "a0000000-0000-4000-8000-000000000125";
const V154 = "a0000000-0000-4000-8000-000000000154";
const V190 = "a0000000-0000-4000-8000-000000000190";
const V404 = "a0000000-0000-4000-8000-000000000404";

const TITULO_TUA = "Vuelos con TUA pagada por Operación sin TUA cobrada al cliente";
const DETALLE_TUA =
  "Vuelos completados del periodo cuya cotización NO cobra TUA (tarifa de uso de aeropuerto) y que sí tienen un gasto que la paga.";
const TITULO_TRANSPORTE = "Vuelos con transporte pagado sin transporte cotizado";
const DETALLE_TRANSPORTE =
  "Es una SEÑAL, no una certeza: vuelos completados del periodo con un gasto que parece transporte de PASAJEROS.";

const itemTua = (over: Record<string, unknown> = {}) => ({
  clave: "tua_pagada_sin_cobrar",
  titulo: TITULO_TUA,
  detalle: DETALLE_TUA,
  count: 2,
  monto_mxn: 1186.97,
  monto_usd: 0,
  vuelos: [
    { id: V125, folio: 125, fecha_vuelo: "2026-08-07T15:00:00Z", matricula: "N58BT", tua_pagada_mxn: 430.49, tua_pagada_usd: 0, pase_abordar: false, gastos_n: 1 },
    { id: V154, folio: 154, fecha_vuelo: "2026-08-15T15:00:00Z", matricula: "XA-VGV", tua_pagada_mxn: 756.48, tua_pagada_usd: 0, pase_abordar: true, gastos_n: 1 },
  ],
  lectura_fallida: false,
  ...over,
});

const itemTransporte = (over: Record<string, unknown> = {}) => ({
  clave: "transporte_pagado_sin_cotizar",
  titulo: TITULO_TRANSPORTE,
  detalle: DETALLE_TRANSPORTE,
  count: 1,
  monto_mxn: 400,
  monto_usd: 0,
  vuelos: [
    {
      id: V190,
      folio: 190,
      fecha_vuelo: "2026-08-20T15:00:00Z",
      matricula: "XB-PEV",
      monto_mxn: 400,
      monto_usd: 0,
      gastos: [{ id: "66d575d8", texto: "Transporte Chetumal a Carl's Jr", monto: 400, moneda: "MXN" }],
    },
  ],
  lectura_fallida: false,
  ...over,
});

const pintar = async () => renderToStaticMarkup(await PreCierreCard(PERIODO));
// «Resolver →» = la lista del periodo + el FOCO del pre-cierre (PEDIDO 2,
// 15-oct-2026: `pc=<clave>`, conteo, periodo, textos e ids de `vuelos[]`).
const RESOLVER =
  /href="\/admin\/quotes\?desde=2026-08-01&amp;hasta=2026-08-31&amp;pc=(?:tua_pagada_sin_cobrar|transporte_pagado_sin_cotizar)&amp;[^"]*"[^>]*>Resolver →</g;

beforeEach(() => preCierre.mockReset());

describe("pre-cierre: TUA pagada sin cobrar", () => {
  it("título, conteo, monto en pesos, detalle del API, chips a la cotización y «Resolver →» a Cotizaciones del periodo", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [itemTua()] });
    const html = await pintar();
    expect(html).toContain(TITULO_TUA);
    expect(html).toContain("· 2");
    expect(html).toContain("$1,186.97 MXN");
    expect(html).toContain(DETALLE_TUA);
    expect(html).toContain('data-precierre-chips="tua_pagada_sin_cobrar"');
    expect(html).toContain(`href="/admin/quotes/${V125}"`);
    expect(html).toContain(">#125 ($430.49 MXN)</a>");
    expect(html).toContain(`href="/admin/quotes/${V154}"`);
    expect(html).toContain(">#154 (pase de abordar · $756.48 MXN)</a>");
    expect(html).toContain("en 1 factura del aeropuerto · N58BT.");
    expect(html).toContain("El pasajero compró su pase de abordar");
    // El chip genérico al vuelo NO se repite.
    expect(html).not.toContain(`href="/admin/flights/${V125}"`);
    expect(html.match(RESOLVER)?.length).toBe(1);
    // NO bloquea: la card sigue verde.
    expect(html).toContain("Todo en orden");
  });

  it("dólares Y pesos: se dicen los dos, nunca sumados", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [itemTua({ monto_mxn: 430.49, monto_usd: 50 })],
    });
    const html = await pintar();
    expect(html).toContain("$50 USD · $430.49 MXN");
  });

  it("lectura fallida ⇒ «· sin verificar» (nunca desaparece)", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [itemTua({ count: 0, monto_mxn: 0, monto_usd: 0, vuelos: [], lectura_fallida: true, detalle: "No se pudo verificar la TUA pagada…" })],
    });
    const html = await pintar();
    expect(html).toContain(TITULO_TUA);
    expect(html).toContain("· sin verificar");
    expect(html).toContain("No se pudo verificar la TUA pagada…");
  });

  it("count 0: el renglón no se pinta", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [itemTua({ count: 0, monto_mxn: 0, vuelos: [] })],
    });
    expect(await pintar()).not.toContain(TITULO_TUA);
  });
});

describe("pre-cierre: transporte pagado sin cotizar", () => {
  it("chip con monto + texto recortado, title con el texto completo y el seguimiento, «Resolver →» del periodo", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [itemTransporte()] });
    const html = await pintar();
    expect(html).toContain(TITULO_TRANSPORTE);
    expect(html).toContain("· 1");
    expect(html).toContain("$400 MXN");
    expect(html).toContain(DETALLE_TRANSPORTE);
    expect(html).toContain('data-precierre-chips="transporte_pagado_sin_cotizar"');
    expect(html).toContain(`href="/admin/quotes/${V190}"`);
    expect(html).toContain(">#190 ($400 MXN · Transporte Chetumal a Carl&#x27;s…)</a>");
    expect(html).toContain("Transporte pagado sin cotizar · XB-PEV: $400 MXN · Transporte Chetumal a Carl&#x27;s Jr.");
    expect(html).toContain("«Seguimiento de la cotización»");
    expect(html.match(RESOLVER)?.length).toBe(1);
  });

  it("varios gastos ⇒ «N gastos»; los dos renglones juntos, cada uno con su «Resolver →»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [
        itemTua(),
        itemTransporte({
          count: 2,
          monto_mxn: 1100,
          vuelos: [
            itemTransporte().vuelos[0],
            {
              id: V404,
              folio: 404,
              matricula: "N990GG",
              monto_mxn: 700,
              monto_usd: 0,
              gastos: [
                { id: "a", texto: "Servicio de taxi privado, ida", monto: 400, moneda: "MXN" },
                { id: "b", texto: "Servicio de taxi privado, regreso", monto: 300, moneda: "MXN" },
              ],
            },
          ],
        }),
      ],
    });
    const html = await pintar();
    expect(html).toContain(">#404 ($700 MXN · 2 gastos)</a>");
    expect(html.match(RESOLVER)?.length).toBe(2);
  });

  it("lectura fallida ⇒ «· sin verificar»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [itemTransporte({ count: 0, monto_mxn: 0, vuelos: [], lectura_fallida: true })],
    });
    const html = await pintar();
    expect(html).toContain(TITULO_TRANSPORTE);
    expect(html).toContain("· sin verificar");
  });
});

describe("pre-cierre: renglones RETIRADOS (API previo)", () => {
  it("`pistas_sin_gasto` y `tua_cobrada_sin_pagada` se pintan genéricos y SIN «Resolver →»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [
        { clave: "pistas_sin_gasto", titulo: "Aterrizajes fuera de CUN sin gasto de pista", detalle: "…", count: 96 },
        {
          clave: "tua_cobrada_sin_pagada",
          titulo: "Vuelos con TUA cobrada al cliente sin TUA pagada",
          detalle: "…",
          count: 1,
          monto_usd: 70.5,
          vuelos: [{ id: V125, folio: 125 }],
        },
      ],
    });
    const html = await pintar();
    expect(html).toContain("Aterrizajes fuera de CUN sin gasto de pista");
    expect(html).toContain(`href="/admin/flights/${V125}"`);
    expect(html).not.toContain("Resolver →");
  });
});

describe("cableado de la card", () => {
  const fuente = readFileSync(path.resolve(__dirname, "../pre-cierre-card.tsx"), "utf8");
  const link = fuente.slice(fuente.indexOf("const LINK_POR_CLAVE"), fuente.indexOf("const ETIQUETA_LINK_POR_CLAVE"));
  const chips = fuente.slice(fuente.indexOf("const CHIP_POR_CLAVE"), fuente.indexOf("function textoMontoItem"));

  it("LINK_POR_CLAVE: las dos claves nuevas; fuera las retiradas", () => {
    expect(link).toContain("[CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR]: hrefPrecierreTuaPagada,");
    expect(link).toContain("[CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR]: hrefPrecierreTransporte,");
    expect(link).not.toMatch(/pistas_sin_gasto:|tua_cobrada_sin_pagada:/);
  });

  it("CHIP_POR_CLAVE con las tres claves; el genérico solo sin helper", () => {
    expect(chips).toContain("[CLAVE_PRECIERRE_VUELOS_SIN_FACTURA]: chipVueloSinFactura,");
    expect(chips).toContain("[CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR]: chipVueloTuaPagada,");
    expect(chips).toContain("[CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR]: chipVueloTransporte,");
    expect(fuente).toContain("data-precierre-chips={item.clave}");
    expect(fuente).toMatch(/\{!chipDeClave &&\s*item\.vuelos && item\.vuelos\.length > 0 &&/);
  });

  it("sin el tipo retirado `tua_cobrada_usd`", () => {
    expect(fuente).not.toContain("tua_cobrada_usd");
  });
});
