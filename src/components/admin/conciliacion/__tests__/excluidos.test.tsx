/**
 * «Vincular gasto»: el vacío dice POR QUÉ no sale un gasto del mismo monto
 * (6-oct-2026, API 0.0.63, `excluidos`).
 *
 * Caso real: cargo de $212.00 del 07-sep (ASUR CANCUN). La oficina buscó
 * «212», vio «Ningún gasto pendiente coincide…» y creyó que era un bug: los
 * tres gastos de $212.00 estaban en EFECTIVO. Qué se custodia aquí:
 *  1. API previo (sin `excluidos`): el vacío es IDÉNTICO al de antes;
 *  2. con `excluidos`: bajo el vacío, en ámbar, una frase por motivo, una
 *     liga por gasto en OTRA pestaña y «Volver a buscar»;
 *  3. el CABLEADO por regex sobre el fuente (el runner no tiene DOM: los
 *     `useEffect` no corren en `renderToStaticMarkup`, así que el vacío vive
 *     en `VacioCandidatos` y se prueba directo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { estadoBuscadorGastos, textoExcluidosCandidatos } from "@/lib/admin/conciliacion-lote";
import type { ExcluidosCandidatos, GastoExcluidoCandidato, MovimientoBancario } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  gastosCandidatosAction: vi.fn(() => new Promise(() => {})),
  linkMovimientoAction: vi.fn(),
  linkMovimientoGastosAction: vi.fn(),
  sugerirMovimientoAction: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { VacioCandidatos, VincularGastoDialog } = await import("../vincular-gasto-dialog");

const V338 = "00a22981-e768-4455-9fc1-ecec8ab6a1ad";
const V330 = "66bcadba-ded0-48a0-b9fa-d2377cd4b66d";

const taxi = (id: string, fecha: string, folio: number, vueloId: string): GastoExcluidoCandidato => ({
  id,
  fecha_gasto: fecha,
  monto: 212,
  moneda: "MXN",
  medio_pago: "EFECTIVO",
  categoria: "TAXI",
  vuelo_folio: folio,
  vuelo_id: vueloId,
});

const EFECTIVO_REAL: ExcluidosCandidatos = {
  motivo: "EFECTIVO_U_OTRO_MEDIO",
  n: 3,
  gastos: [
    taxi("4fca531f-47cf-4a78-8f05-127504322881", "2026-09-24", 338, V338),
    taxi("e5aa4ec9-07e2-4311-90a9-b6150d04bbd8", "2026-09-27", 330, V330),
    taxi("053fa6f4-2b14-4f17-9713-6f75efde971f", "2026-09-28", 330, V330),
  ],
};

/** Lo que vio la oficina: buscó «212» en ±30 días. */
const VACIO_212 = estadoBuscadorGastos({ cargando: false, error: null, q: "212", resultados: 0, dias: 30 });
const VACIO_SIN_Q = estadoBuscadorGastos({ cargando: false, error: null, q: "", resultados: 0, dias: 30 });
const CTX = { monedaCuenta: "MXN", dias: 30, montoBuscado: 212, fechaCargo: "2026-09-07" };

const vacio = (texto: string, excluidos: ExcluidosCandidatos[] | null | undefined) =>
  renderToStaticMarkup(
    <VacioCandidatos
      texto={texto}
      avisos={textoExcluidosCandidatos(excluidos, "212.00", CTX)}
      onVolverABuscar={() => {}}
      onMostrarNoBancarios={() => {}}
    />,
  );

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const cuenta = (html: string, texto: string) => html.split(texto).length - 1;

describe("API previo (sin `excluidos`): el vacío de siempre", () => {
  it("con y sin búsqueda, el marcado es IDÉNTICO al <p> de antes (sin ámbar, sin «Volver a buscar»)", () => {
    for (const estado of [VACIO_212, VACIO_SIN_Q]) {
      const antes = `<p class="px-3 py-4 text-center text-xs text-muted-foreground">${estado.texto}</p>`;
      expect(vacio(estado.texto, undefined)).toBe(antes);
      expect(vacio(estado.texto, null)).toBe(antes);
      expect(vacio(estado.texto, [])).toBe(antes);
    }
    expect(VACIO_212.tipo).toBe("vacio_con_q");
    expect(VACIO_212.texto).toBe(
      "Ningún gasto pendiente coincide con «212» en ±30 días del cargo. Amplía a 120 días o búscalo por monto, proveedor o nota.",
    );
  });
});

describe("caso real: tres gastos de $212.00 en EFECTIVO", () => {
  const html = vacio(VACIO_212.texto, [EFECTIVO_REAL]);

  it("primero el vacío de siempre y DEBAJO, en ámbar, el porqué", () => {
    const iVacio = html.indexOf(VACIO_212.texto);
    const iPorque = html.indexOf("Hay 3 gastos de $212.00 en efectivo (24, 27 y 28 sep · vuelos #338 y #330)");
    expect(iVacio).toBeGreaterThan(-1);
    expect(iPorque).toBeGreaterThan(iVacio);
    expect(html).toContain("la lista solo muestra gastos pagados por el banco.");
    expect(html).toContain("corrige el medio de pago del gasto; si no, muéstralos y vincula el que corresponda");
    expect(html).toMatch(/<div class="[^"]*bg-amber-500\/5[^"]*text-amber-700[^"]*dark:text-amber-300[^"]*">/);
  });

  it("«Mostrar estos gastos» (con cursor-pointer) va DEBAJO de la frase de los gastos en efectivo", () => {
    expect(html).toMatch(/<button type="button" class="cursor-pointer[^"]*">Mostrar estos gastos<\/button>/);
    expect(cuenta(html, "Mostrar estos gastos")).toBe(1);
    expect(html.indexOf("Mostrar estos gastos")).toBeGreaterThan(html.indexOf("muéstralos"));
    // Sin quién lo atienda (o con el interruptor ya encendido) no hay botón.
    const sinHandler = renderToStaticMarkup(
      <VacioCandidatos texto="x" avisos={textoExcluidosCandidatos([EFECTIVO_REAL], "212.00", CTX)} />,
    );
    expect(sinHandler).not.toContain("Mostrar estos gastos");
    const encendido = renderToStaticMarkup(
      <VacioCandidatos
        texto="x"
        avisos={textoExcluidosCandidatos([EFECTIVO_REAL], "212.00", { ...CTX, incluyeNoBancarios: true })}
        onMostrarNoBancarios={() => {}}
      />,
    );
    expect(encendido).not.toContain("Mostrar estos gastos");
    expect(encendido).toContain("no entran ni con los gastos en efectivo incluidos");
  });

  it("una liga por gasto, a su vuelo, en OTRA pestaña (el diálogo se queda abierto)", () => {
    expect(html).toContain("Abrir:");
    expect(cuenta(html, 'target="_blank"')).toBe(3);
    expect(cuenta(html, `href="/admin/flights/${V338}"`)).toBe(1);
    expect(cuenta(html, `href="/admin/flights/${V330}"`)).toBe(2);
    expect(html).toContain(">vuelo #338 (24 sep)</a>");
    expect(html).toContain(">vuelo #330 (27 sep)</a>");
    expect(html).toContain(">vuelo #330 (28 sep)</a>");
    expect(html).toContain('title="Taxi / estacionamiento · $212.00 · Efectivo. Abre el vuelo #338 en otra pestaña."');
  });

  it("«Volver a buscar» (botón con cursor-pointer) para repetir la búsqueda tras corregir el gasto", () => {
    expect(html).toMatch(/<button type="button" class="cursor-pointer[^"]*">Volver a buscar<\/button>/);
  });

  it("sin `onVolverABuscar` no hay botón", () => {
    const sinBoton = renderToStaticMarkup(
      <VacioCandidatos texto="x" avisos={textoExcluidosCandidatos([EFECTIVO_REAL], "212.00", CTX)} />,
    );
    expect(sinBoton).not.toContain("<button");
    expect(sinBoton).toContain("Hay 3 gastos de $212.00 en efectivo");
  });
});

describe("mezcla de motivos: una frase por motivo, en orden", () => {
  it("efectivo, ya conciliado, otra moneda y fuera de la ventana", () => {
    const html = vacio(VACIO_SIN_Q.texto, [
      { motivo: "FUERA_DE_VENTANA", n: 1, gastos: [{ ...taxi("f1", "2026-06-12", 301, V338), vuelo_id: null }] },
      { motivo: "OTRA_MONEDA", n: 2, gastos: [{ ...EFECTIVO_REAL.gastos[1], moneda: "USD" }] },
      {
        motivo: "YA_CONCILIADO",
        n: 1,
        gastos: [
          {
            ...EFECTIVO_REAL.gastos[2],
            medio_pago: "TARJETA_CORP",
            conciliado_con: [{ movimiento_id: "m1", fecha: "2026-09-05", monto: 212, moneda: "MXN", cuenta: "GASTOS GNRAL" }],
          },
        ],
      },
      { motivo: "EFECTIVO_U_OTRO_MEDIO", n: 1, gastos: [EFECTIVO_REAL.gastos[0]] },
    ]);
    const orden = [
      "Hay 1 gasto de $212.00 en efectivo (24 sep · vuelo #338)",
      "1 gasto de $212.00 (28 sep · vuelo #330) ya está conciliado con el cargo del 5 sep (GASTOS GNRAL).",
      "2 gastos de $212.00 están en dólares (27 sep · vuelo #330, y 1 más) y la cuenta es en pesos (MXN).",
      "1 gasto de $212.00 (12 jun · vuelo #301) cae fuera de ±30 días del cargo: amplía a 120 días.",
    ].map((t) => html.indexOf(t));
    expect(orden.every((i) => i > -1)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // Sin `vuelo_id`: la liga abre Gastos de ese día (nunca /admin/flights/<nada>).
    expect(html).toContain('href="/admin/expenses?desde=2026-06-12&amp;hasta=2026-06-12"');
    expect(cuenta(html, "Volver a buscar")).toBe(1);
    // Solo la frase del efectivo ofrece mostrarlos.
    expect(cuenta(html, "Mostrar estos gastos")).toBe(1);
  });
});

describe("el diálogo (render estático, sin red)", () => {
  it("mientras busca no pinta ningún porqué", () => {
    const mov: MovimientoBancario = {
      id: "520b2b2f-ab74-4d62-8dd6-d2e0a01a9e9e",
      cuenta_bancaria_id: "76a931e0-7c06-47c6-a574-6c7d4a698c14",
      fecha: "2026-09-07",
      tipo: "CARGO",
      monto: "212.00",
      descripcion: "ASUR CANCUN",
      referencia: null,
      conciliado: false,
      gasto_id: null,
      cobro_id: null,
      clasificacion_id: null,
      origen: "IMPORT",
      notas: null,
      created_at: "2026-09-30T15:00:00Z",
    };
    const html = renderToStaticMarkup(
      <VincularGastoDialog movimiento={mov} gastos={[]} open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Cargo de $212.00");
    expect(html).toContain("Buscando gastos candidatos…");
    expect(html).not.toContain("Volver a buscar");
    expect(html).not.toContain("no se concilian con el banco");
  });
});

describe("cableado del diálogo", () => {
  const dialogo = leer("../vincular-gasto-dialog.tsx");

  it("el vacío (con y sin búsqueda) pinta VacioCandidatos con los `excluidos` de ESA respuesta", () => {
    expect(dialogo).toMatch(
      /estado\.tipo === "vacio_sin_q" \|\| estado\.tipo === "vacio_con_q" \? \([\s\S]{0,200}<VacioCandidatos\s+texto=\{estado\.texto\}\s+avisos=\{textoExcluidosCandidatos\(data\?\.excluidos, movimiento\.monto, \{/,
    );
    // Se redacta SOLO en el vacío: con candidatos jamás se pinta un porqué.
    expect(dialogo.match(/textoExcluidosCandidatos\(/g)?.length).toBe(1);
    // El monto lo dice el API (`excluidos_monto`): el panel no reinterpreta la búsqueda.
    expect(dialogo).toMatch(/monedaCuenta,\s*dias,\s*montoBuscado: data\?\.excluidos_monto,/);
    // La frase sabe si el interruptor está encendido y la fecha del cargo (ventana de «Mostrar…»).
    expect(dialogo).toMatch(/incluyeNoBancarios: incluirNoBancarios,\s*fechaCargo: movimiento\.fecha,/);
    expect(dialogo).toContain("onMostrarNoBancarios={mostrarNoBancarios}");
  });

  it("«Volver a buscar» repite la MISMA búsqueda (como «Reintentar»)", () => {
    expect(dialogo).toContain("onVolverABuscar={() => setRecarga((n) => n + 1)}");
    expect(dialogo).toContain("{BOTON_VOLVER_A_BUSCAR}");
  });

  it("las ligas abren en otra pestaña (sin prefetch: no sirve en ESTA) y los textos salen de conciliacion-lote", () => {
    expect(dialogo).toMatch(/<Link[\s\S]{0,120}target="_blank"\s+prefetch=\{false\}\s+title=\{l\.titulo\}/);
    expect(dialogo).toContain("{ETIQUETA_LIGAS_EXCLUIDOS}");
    expect(dialogo).not.toMatch(/>\s*Volver a buscar\s*</);
    expect(dialogo).not.toContain("no se concilian con el banco");
  });

  it("sin avisos, VacioCandidatos devuelve el <p> de siempre (nada más)", () => {
    expect(dialogo).toContain("if (avisos.length === 0) return vacio;");
  });
});
