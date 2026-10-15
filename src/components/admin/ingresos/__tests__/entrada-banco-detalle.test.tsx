/**
 * El cuerpo PRESENTACIONAL de la hoja «Conciliación con el banco» de una
 * ENTRADA (15-oct-2026, API 0.0.78, invariante 78): `EntradaBancoDetalle` con
 * las respuestas REALES de la spec, render del servidor. Ningún monto se
 * calcula en el componente, toda liga va a otra pestaña con cursor de mano y
 * jamás se pinta número de cuenta, CLABE ni ruta de archivo (no viajan).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { fmtDateTime } from "@/lib/datetime";
import { TEXTO_CARGANDO_ENTRADA } from "@/lib/admin/entrada-banco";
import { MSG_DETALLE_BANCO_API_VIEJO, TEXTO_ESTADO_CAMBIO } from "@/lib/admin/hoja-banco";
import type { EntradaBancoFila } from "@/lib/admin/entrada-banco";
import type { ConciliacionDeEntrada } from "@/types/conciliacion-entrada";
import {
  ABONO_69183,
  ING3_ABONO,
  respuesta223,
  respuesta293,
  respuesta332,
  respuesta379,
  respuesta383,
  respuestaAnticipo,
  respuestaDosAbonos,
  respuestaEspejo,
  respuestaIng3,
  respuestaParcial,
  respuestaSobre,
} from "@/lib/admin/__tests__/entrada-banco.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/ingresos",
}));

const { EntradaBancoDetalle } = await import("../entrada-banco-detalle");

const noop = () => {};
const filaDe = (r: ConciliacionDeEntrada | null, over: Partial<EntradaBancoFila> = {}): EntradaBancoFila => ({
  origen: r?.entrada.origen ?? "COBRO_VUELO",
  id: r?.entrada.id ?? "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f",
  etiqueta: r?.entrada.etiqueta ?? "Vuelo #332",
  categoria_etiqueta: r?.entrada.categoria_etiqueta ?? "Cobro de vuelo",
  monto: r?.entrada.monto ?? 977.45,
  neto: r?.entrada.neto ?? null,
  moneda: r?.entrada.moneda ?? "MXN",
  dia: r?.entrada.dia ?? "2026-09-15",
  cliente: r?.entrada.cliente_nombre ?? null,
  metodo_etiqueta: r?.entrada.metodo_etiqueta ?? null,
  cuenta_id: null,
  estado: r?.estado ?? null,
  faltante: r?.cobertura?.faltante ?? null,
  movimiento_id: null,
  baja: false,
  ...over,
});
const pintar = (
  r: ConciliacionDeEntrada | null,
  extra: { fila?: Partial<EntradaBancoFila>; resultado?: { ok: boolean; error?: string; code?: string; status?: number } } = {},
) =>
  renderToStaticMarkup(
    <EntradaBancoDetalle
      fila={filaDe(r, extra.fila)}
      resultado={extra.resultado ?? (r ? { ok: true, data: r } : null)}
      descargando={null}
      onReintentar={noop}
      onRecargar={noop}
      onDescargar={noop}
      hoy="2026-10-15"
    />,
  );

/** Todos los <a> de la hoja: pestaña nueva, rel y cursor de mano. */
function ligasCorrectas(html: string) {
  const anclas = html.match(/<a [^>]*>/g) ?? [];
  expect(anclas.length).toBeGreaterThan(0);
  for (const a of anclas) {
    expect(a, a).toContain('target="_blank"');
    expect(a, a).toContain('rel="noopener noreferrer"');
    expect(a, a).toContain("cursor-pointer");
  }
}

describe("con datos (casos reales)", () => {
  it("ING-3: el abono con su cuenta, archivo con descarga, quién ligó y «Ver en Conciliación»", () => {
    const html = pintar(respuestaIng3());
    expect(html).toContain('data-hoja-banco="datos"');
    expect(html).toContain(`data-abono="${ING3_ABONO}"`);
    expect(html).toContain("Conciliado con 1 abono del banco.");
    expect(html).toContain("COMBUSTIBLE · Scotiabank (MXN)");
    expect(html).toContain("scotia combus (6).pdf");
    expect(html).toContain("Descargar estado de cuenta (PDF)");
    expect(html).toContain(`Registró la liga: Alejandro Canales · ${fmtDateTime("2026-10-12T22:57:32.606618+00:00")}`);
    expect(html).toContain("Ver en Conciliación");
    expect(html).not.toContain("data-que-hacer");
    ligasCorrectas(html);
  });

  it("#332: el lote con «(este cobro)» SIN enlace y la otra línea al vuelo (#cobros)", () => {
    const html = pintar(respuesta332());
    expect(html).toContain(`data-abono="${ABONO_69183}"`);
    expect(html).toContain("2 cobros · suman $69,183.00");
    expect(html).toMatch(/<span>Vuelo #332 · Beh Kay(<!-- -->)? <strong>\(este cobro\)<\/strong>/);
    expect(html).toContain('href="/admin/flights/e3851d95-b022-4825-883f-1e81068712cb#cobros"');
    expect(html).not.toContain('href="/admin/flights/6f1825e3-0c54-45f1-bb66-d8f27a71fb7e#cobros"');
    expect(html).toContain("&amp;cobro=d7b0890c-9d0f-441f-a5cd-edd27fa50f0f");
    ligasCorrectas(html);
  });

  it("#293: la línea de la comisión y «Liga anterior al 12 oct 2026…»", () => {
    const html = pintar(respuesta293());
    expect(html).toContain(
      "El cliente pagó $12,495.00; la comisión registrada es de $624.76, así que al banco debe llegar el neto: $11,870.24.",
    );
    expect(html).toContain("Liga anterior al 12 oct 2026: el sistema todavía no guardaba quién la hizo.");
    expect(html).toContain("Paywise · Paywise (MXN) · pasarela de pago");
  });

  it("#223: «¿Qué hacer?» con los cobros del mismo día, sus búsquedas y lo importado por cuenta", () => {
    const html = pintar(respuesta223());
    expect(html).toContain('data-que-hacer=""');
    expect(html).toContain('data-mismo-dia=""');
    expect(html).toContain("Ese día Morena Mia tiene 2 cobros más sin conciliar:");
    expect(html).toContain("Buscar un abono por $2,407.00 USD (los 3 cobros del día)");
    expect(html).toContain('href="/admin/conciliacion?f=pendientes&amp;desde=2026-08-11&amp;hasta=2026-10-10&amp;mvq=Morena+Mia"');
    expect(html).toContain("Movimientos importados por cuenta: HSBC USD del 01 sep 2026 al 06 oct 2026.");
    expect(html).toContain("Si el estado de cuenta de ese periodo ya está importado, prueba «Cruzar pendientes» en Conciliación.");
    // La búsqueda principal en negritas.
    expect(html).toMatch(/<a [^>]*class="[^"]*font-medium[^"]*"[^>]*>Buscar el abono en Conciliación<\/a>/);
    ligasCorrectas(html);
  });

  it("#379 y #383: la suma del día y el aviso ámbar de «se registró después de importar» (ARRIBA de las causas)", () => {
    expect(pintar(respuesta379())).toContain("Buscar un abono por $59,081.00 (los 2 cobros del día)");
    const html = pintar(respuesta383());
    expect(html).toContain('data-cruce-no-corrio=""');
    expect(html).toContain("Abrir Conciliación del 05 oct 2026 al 11 oct 2026");
    expect(html.indexOf("data-cruce-no-corrio")).toBeLessThan(html.indexOf("Que el estado de cuenta de esas fechas"));
  });

  it("parcial, dos abonos, sobre, anticipo y ESPEJO", () => {
    const parcial = pintar(respuestaParcial());
    expect(parcial).toContain('data-tono="aviso"');
    expect(parcial).toContain("Buscar el abono que falta en Conciliación");
    const dos = pintar(respuestaDosAbonos());
    expect(dos.match(/data-abono="/g)).toHaveLength(2);
    expect(dos).toContain("Este abono aporta $1,700.00 de $3,400.00.");
    const sobre = pintar(respuestaSobre());
    expect(sobre).toContain('data-contexto=""');
    expect(sobre).toContain('href="/admin/quotes/grupo/5d5d5d5d-0000-4000-8000-000000000001"');
    const anticipo = pintar(respuestaAnticipo());
    expect(anticipo).toContain("Abrir el anticipo ING-12");
    expect(pintar(respuestaEspejo())).toContain(
      "Detalle simplificado: la base de datos todavía no tiene la conciliación por partes de los cobros.",
    );
  });

  it("el estado cambió desde que se abrió la página: la franja con «Recargar»", () => {
    expect(pintar(respuesta332(), { fila: { estado: "SIN_CONCILIAR" } })).toContain(TEXTO_ESTADO_CAMBIO);
    expect(pintar(respuesta332())).not.toContain(TEXTO_ESTADO_CAMBIO);
  });

  it("nunca un número de cuenta, una CLABE ni una ruta de archivo (aunque la fila cruda los trajera)", () => {
    const r = respuestaIng3();
    const conBasura = {
      ...r,
      abonos: [{ ...r.abonos[0], numero_cuenta: "1234567890", clabe: "044180001234567890", storage_path: "estados/x.pdf" }],
    } as unknown as ConciliacionDeEntrada;
    const html = pintar(conBasura);
    expect(html).not.toContain("1234567890");
    expect(html).not.toContain("044180001234567890");
    expect(html).not.toContain("estados/x.pdf");
  });
});

describe("cargando y errores", () => {
  it("cargando: texto con role=status", () => {
    const html = pintar(null);
    expect(html).toContain('role="status"');
    expect(html).toContain(TEXTO_CARGANDO_ENTRADA);
  });

  it("API ≤ 0.0.77: el aviso y «Buscar el abono en Conciliación» armado con la fila (un parcial, lo que falta)", () => {
    const html = pintar(null, { resultado: { ok: false, code: "RUTA_NO_DISPONIBLE", status: 404 }, fila: { estado: "SIN_CONCILIAR", monto: 812, moneda: "USD", dia: "2026-09-10" } });
    expect(html).toContain('data-hoja-banco="error"');
    expect(html).toContain(MSG_DETALLE_BANCO_API_VIEJO);
    expect(html).toContain('href="/admin/conciliacion?f=pendientes&amp;desde=2026-08-11&amp;hasta=2026-10-10&amp;mvq=812"');
    expect(html).not.toContain("Reintentar");
    const parcial = pintar(null, {
      resultado: { ok: false, code: "RUTA_NO_DISPONIBLE", status: 404 },
      fila: { estado: "PARCIAL", faltante: 1700, monto: 3400, dia: "2026-09-15" },
    });
    expect(parcial).toContain('href="/admin/conciliacion?f=pendientes&amp;desde=2026-09-08&amp;hasta=2026-10-15&amp;mvq=1700"');
  });

  it("falla técnica: «Reintentar»; un 404 del cobro: el texto del API sin reintentar", () => {
    expect(pintar(null, { resultado: { ok: false, code: "SIN_CONEXION" } })).toContain("Reintentar");
    const html = pintar(null, { resultado: { ok: false, code: "COBRO_NO_EXISTE", status: 404 } });
    expect(html).toContain("Ese cobro ya no existe: recarga la página.");
    expect(html).not.toContain("Reintentar");
  });
});

describe("guardas de código", () => {
  it("el cuerpo no calcula dinero ni redacta frases (todo sale de lib/admin/entrada-banco.ts)", () => {
    const src = readFileSync(path.resolve(__dirname, "../entrada-banco-detalle.tsx"), "utf8");
    expect(src).not.toContain(".reduce(");
    expect(src).not.toMatch(/fmtMonto\w*\(/);
    expect(src).not.toContain("Number(");
  });
});
