/**
 * VARIAS FACTURAS POR GASTO (16-oct-2026, API 0.0.86) en el panel: el ícono
 * de la columna Facturación cuenta las facturas, la lista se ve con «Ver
 * aquí» (visor incrustado) y sus enlaces, «Quitar de este gasto» CONFIRMA, y
 * un fallo de carga jamás se pinta como «sin facturas». La regla pura vive
 * en `lib/admin/facturas-gasto.ts` (probada aparte); aquí, el marcado y el
 * cableado.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { FacturaDeGasto } from "@/lib/admin/facturas-gasto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  facturasDeGastoAction: async () => ({ ok: true, data: { varias: true, facturas: [] } }),
  subirFacturasGastoAction: async () => ({ ok: false }),
  quitarFacturaDeGastoAction: async () => ({ ok: false }),
}));

const { GastoFacturaButton } = await import("../gasto-factura-button");
const { ListaFacturas } = await import("../gasto-facturas-dialog");

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

const gasto = (over: Partial<Gasto>) => ({ id: "g-1", factura_recibida_id: null, ...over }) as Gasto;

const factura = (over: Partial<FacturaDeGasto>): FacturaDeGasto => ({
  id: "f1",
  principal: false,
  serie: null,
  folio: null,
  uuid_fiscal: null,
  emisor_nombre: null,
  total: null,
  moneda: null,
  fecha_emision: null,
  pdf_url: null,
  xml_url: null,
  nombre: null,
  ...over,
});

describe("ícono de facturas en la columna Facturación", () => {
  it("sin facturas: subir; con una: clip sin número; con 5: clip + 5", () => {
    const sin = renderToStaticMarkup(<GastoFacturaButton gasto={gasto({})} />);
    expect(sin).toContain('data-facturas-n="0"');
    expect(sin).toContain('aria-label="Subir las facturas de este gasto"');
    const una = renderToStaticMarkup(<GastoFacturaButton gasto={gasto({ factura_recibida_id: "f" })} />);
    expect(una).toContain('data-facturas-n="1"');
    expect(una).not.toMatch(/tabular-nums/);
    const cinco = renderToStaticMarkup(
      <GastoFacturaButton gasto={gasto({ factura_recibida_id: "f", facturas_n: 5 })} />,
    );
    expect(cinco).toContain('data-facturas-n="5"');
    expect(cinco).toMatch(/tabular-nums">5<\/span>/);
    expect(cinco).toContain('title="Este gasto tiene 5 facturas: verlas o subir más"');
    expect(cinco).toMatch(/class="[^"]*cursor-pointer/);
  });
});

describe("lista de facturas", () => {
  const noop = () => {};
  it("cargando y error: nunca «sin facturas»", () => {
    const cargando = renderToStaticMarkup(
      <ListaFacturas carga={{ fase: "cargando", varias: null, facturas: [], avisos: [] }} onReintentar={noop} />,
    );
    expect(cargando).toContain("Cargando las facturas");
    const error = renderToStaticMarkup(
      <ListaFacturas carga={{ fase: "error", varias: null, facturas: [], avisos: [], error: "x" }} onReintentar={noop} />,
    );
    expect(error).toContain("No se pudieron cargar las facturas");
    expect(error).toContain("Reintentar");
    expect(error).not.toContain("todavía no tiene facturas");
    const vacia = renderToStaticMarkup(
      <ListaFacturas carga={{ fase: "listo", varias: true, facturas: [], avisos: [] }} onReintentar={noop} />,
    );
    expect(vacia).toContain("Este gasto todavía no tiene facturas.");
  });

  it("cada factura: folio, detalle, «Ver aquí» si hay PDF, PDF/XML y Quitar solo si se pasa", () => {
    const facturas = [
      factura({ id: "a", principal: true, serie: "FCUN", folio: "1299718", emisor_nombre: "ASA", total: 3000, moneda: "MXN", pdf_url: "recibidas/a.pdf", xml_url: "recibidas/a.xml" }),
      factura({ id: "b", nombre: "ACC_2.pdf", pdf_url: "recibidas/b.pdf" }),
      factura({ id: "c", uuid_fiscal: "6f9a0000-1111", xml_url: "recibidas/c.xml" }),
    ];
    const html = renderToStaticMarkup(
      <ListaFacturas carga={{ fase: "listo", varias: true, facturas, avisos: [] }} onReintentar={noop} onQuitar={noop} />,
    );
    expect(html).toContain("FCUN-1299718");
    expect(html).toContain("principal");
    expect(html).toContain("ASA · $3,000 MXN · PDF + XML");
    expect(html).toContain("ACC_2.pdf");
    expect((html.match(/Ver aquí/g) ?? []).length).toBe(2);
    expect((html.match(/Quitar de este gasto/g) ?? []).length).toBe(3);
    const sinQuitar = renderToStaticMarkup(
      <ListaFacturas carga={{ fase: "listo", varias: false, facturas, avisos: [] }} onReintentar={noop} />,
    );
    expect(sinQuitar).not.toContain("Quitar de este gasto");
  });
});

describe("cableado", () => {
  it("el diálogo: UN selector multiple de PDF y XML, emparejado, por lotes y Quitar CONFIRMA", () => {
    const src = leer("components/admin/expenses/gasto-facturas-dialog.tsx");
    expect(src).toMatch(/type="file"\s+multiple\s+accept=\{ACCEPT_FACTURAS\}/);
    expect(src).toMatch(/emparejarArchivosFactura\(/);
    expect(src).toMatch(/partirEnLotes\(grupos\)/);
    expect(src).toMatch(/subirFacturasGastoAction\(\{ gastoId: gasto\.id, archivos: entrada \}\)/);
    // Skew: el API previo rechaza varias ⇒ no se pierde nada y se marca.
    expect(src).toMatch(/r\.valor\.code === CODIGO_API_SIN_VARIAS/);
    expect(src).toMatch(/r\.valor\.data\.modo === "LEGADO" && i < lotes\.length - 1/);
    expect(src).toMatch(/setArchivos\(\(prev\) => prev\.filter\(\(f\) => !subidos\.has\(f\)\)\)/);
    // Quitar pasa por la confirmación (regla del cliente).
    expect(src).toMatch(/onQuitar=\{carga\.varias === true \? setAQuitar : undefined\}/);
    expect(src).toMatch(/<AlertDialogTitle>\{TITULO_QUITAR_FACTURA\}<\/AlertDialogTitle>/);
    expect(src).toMatch(/quitarFacturaDeGastoAction\(\{ facturaId: f\.id, gastoId: gasto\.id \}\)/);
    // API previo con factura: subir otra la REEMPLAZA ⇒ confirma primero.
    expect(src).toMatch(/if \(reemplaza && !reemplazoConfirmado\) \{\s*setConfirmarReemplazo\(true\);\s*return;/);
    expect(src).toMatch(/<AlertDialogTitle>\{TITULO_REEMPLAZAR_FACTURA\}<\/AlertDialogTitle>/);
    // Al cerrar con cambios se refresca la página (las actions no revalidan).
    expect(src).toMatch(/if \(huboCambio\.current\) \{\s*huboCambio\.current = false;\s*router\.refresh\(\);/);
    // El visor incrustado de la factura.
    expect(src).toMatch(/<VisorPdf\s+key=\{f\.pdf_url\}\s+bucket="facturas"/);
  });

  it("«Verificar / editar»: sección de facturas, visor de hojas PDF y «Abrir» sin firma", () => {
    const src = leer("components/admin/expenses/expense-verify-dialog.tsx");
    expect(src).toMatch(/<FacturasDelGastoSeccion gasto=\{gasto\} activo=\{open\} \/>/);
    expect(src).toMatch(/<VisorPdf\s+key=\{hojaEnVisor\}/);
    expect(src).toMatch(/\{esPdfPath\(p\) && \(\s*<BotonVerAqui/);
    // Una hoja sin firma ya no es texto sin enlace.
    expect(src).toMatch(/<BotonAbrirFirmado bucket="gasto-fotos" path=\{p\}/);
    // Al reabrir, el visor arranca cerrado.
    expect(src).toMatch(/setHojasNuevas\(\[\]\);\s*setHojaEnVisor\(null\);/);
  });

  it("la columna Facturación usa el conteo de la fuente única", () => {
    const src = leer("components/admin/expenses/gasto-factura-button.tsx");
    expect(src).toMatch(/nFacturasDeFila\(gasto\)/);
    expect(src).toMatch(/<GastoFacturasDialog gasto=\{gasto\} open=\{open\} onOpenChange=\{setOpen\} \/>/);
  });
});
