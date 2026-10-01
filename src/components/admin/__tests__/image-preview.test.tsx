/**
 * Marcado de la foto con URL firmada (1-oct-2026, «las fotos de las facturas
 * no están cargando»). La máquina de estados (renovar al fallar, reintento
 * único, renovar antes de abrir una URL vieja) se prueba PURA en
 * `lib/admin/__tests__/foto-firmada.test.ts`; aquí se cuida que cada estado
 * pinte lo que debe: NUNCA un `<img>` con una URL que ya falló, placeholder
 * gris con su tooltip y `cursor-pointer`, «Reintentar» en el visor.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { EstadoFoto } from "@/lib/admin/foto-firmada";

// La server action (sesión, red) no es parte de este test.
const refrescar = vi.fn();
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: (...a: unknown[]) => refrescar(...a),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const {
  ImagePreview,
  MiniaturaFoto,
  VisorSinFoto,
  TITULO_FOTO_NO_CARGO,
  TEXTO_FOTO_NO_CARGO,
  TEXTO_FOTO_CARGANDO,
} = await import("../image-preview");
const { ComprobantePreview, EnlaceArchivoFirmado } = await import("../comprobante-preview");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

const URL_A = "https://x.supabase.co/storage/v1/object/sign/gasto-fotos/u/a.jpg?token=t";
const nada = () => {};
const estado = (e: Partial<EstadoFoto>): EstadoFoto => ({
  url: URL_A,
  fase: "lista",
  rota: false,
  intento: 0,
  ...e,
});
const miniatura = (e: Partial<EstadoFoto>) =>
  renderToStaticMarkup(
    <MiniaturaFoto
      estado={estado(e)}
      alt="Comprobante · GAS"
      onAbrir={nada}
      onReintentar={nada}
      onFallo={nada}
      onCarga={nada}
    />,
  );

describe("MiniaturaFoto", () => {
  it("lista: la foto, clicable para abrir el visor", () => {
    const html = miniatura({});
    expect(html).toContain("<img");
    expect(html).toContain(`src="${URL_A}"`);
    expect(html).toContain('title="Ver imagen"');
    expect(html).toContain("cursor-pointer");
    expect(html).not.toContain("data-foto-placeholder");
  });

  it("fallo: placeholder gris con tooltip «clic para reintentar», sin <img>", () => {
    const html = miniatura({ fase: "fallo", rota: true });
    expect(html).not.toContain("<img");
    expect(html).toContain('data-foto-placeholder="fallo"');
    expect(html).toContain(`title="${TITULO_FOTO_NO_CARGO}"`);
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("bg-muted");
    expect(html).toContain("<svg");
  });

  it("renovando tras un fallo: placeholder que late, sin pintar la URL rota", () => {
    const html = miniatura({ fase: "renovando", rota: true });
    expect(html).not.toContain("<img");
    expect(html).toContain('data-foto-placeholder="cargando"');
    expect(html).toContain(`title="${TEXTO_FOTO_CARGANDO}"`);
    expect(html).toContain("disabled");
    expect(html).toContain("animate-pulse");
  });

  it("renovación PROACTIVA (al abrir el visor): la miniatura que ya cargó se queda", () => {
    const html = miniatura({ fase: "renovando", rota: false });
    expect(html).toContain("<img");
  });

  it("sin URL: placeholder", () => {
    const html = miniatura({ url: null, fase: "fallo" });
    expect(html).not.toContain("<img");
    expect(html).toContain(TITULO_FOTO_NO_CARGO);
  });
});

describe("VisorSinFoto", () => {
  it("fallo: «No se pudo cargar la foto» + «Reintentar» (cursor-pointer)", () => {
    const html = renderToStaticMarkup(
      <VisorSinFoto estado={estado({ fase: "fallo", rota: true })} onReintentar={nada} />,
    );
    expect(html).toContain(TEXTO_FOTO_NO_CARGO);
    expect(html).toMatch(/<button[^>]*cursor-pointer[^>]*>Reintentar<\/button>/);
    expect(html).not.toContain("<img");
  });

  it("renovando: «Cargando la foto…»", () => {
    const html = renderToStaticMarkup(
      <VisorSinFoto estado={estado({ fase: "renovando", rota: true })} onReintentar={nada} />,
    );
    expect(html).toContain(TEXTO_FOTO_CARGANDO);
    expect(html).not.toContain("Reintentar");
  });
});

describe("ImagePreview / ComprobantePreview", () => {
  it("pinta la miniatura con la URL de la página y no pide firmas al montar", () => {
    const html = renderToStaticMarkup(
      <ImagePreview src={URL_A} alt="Tacómetro Salida" bucket="taco-fotos" path="u/a.jpg" />,
    );
    expect(html).toContain("<img");
    expect(html).toContain("cursor-pointer");
    expect(refrescar).not.toHaveBeenCalled();
  });

  it("src vacío: placeholder desde el inicio, sin llamadas", () => {
    const html = renderToStaticMarkup(<ImagePreview src="" alt="Foto" />);
    expect(html).not.toContain("<img");
    expect(html).toContain(TITULO_FOTO_NO_CARGO);
    expect(refrescar).not.toHaveBeenCalled();
  });

  it("comprobante PDF: enlace con cursor-pointer (renueva al hacer clic si la URL es vieja)", () => {
    const html = renderToStaticMarkup(
      <ComprobantePreview
        bucket="gasto-fotos"
        path="oficina/factura.pdf"
        url="https://x.supabase.co/storage/v1/object/sign/gasto-fotos/oficina/factura.pdf?token=t"
        alt="Comprobante · TUA"
      />,
    );
    expect(html).toContain("<a");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("PDF");
    expect(html).not.toContain("<img");
  });

  it("comprobante imagen: miniatura con zoom", () => {
    const html = renderToStaticMarkup(
      <ComprobantePreview bucket="gasto-fotos" path="u/a.jpg" url={URL_A} alt="Comprobante" />,
    );
    expect(html).toContain("<img");
    expect(html).toContain('title="Ver imagen"');
  });
});

describe("enlace a un archivo firmado (PDF, HEIC, plan de vuelo)", () => {
  it("con children pinta el texto y la clase de quien llama", () => {
    const html = renderToStaticMarkup(
      <EnlaceArchivoFirmado
        bucket="planes-vuelo"
        path="u/2026-07/plan.jpg"
        url="https://x.supabase.co/storage/v1/object/sign/planes-vuelo/u/2026-07/plan.jpg?token=t"
        className="cursor-pointer text-sm text-brand-600"
      >
        Ver foto del plan de vuelo
      </EnlaceArchivoFirmado>,
    );
    expect(html).toContain("Ver foto del plan de vuelo");
    expect(html).toContain('class="cursor-pointer text-sm text-brand-600"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("<svg");
  });

  it("cableado: TODO caller de una foto o archivo firmado pasa bucket + path", () => {
    // Tacómetros: el detalle del vuelo usa el path de la escala; taco-live y
    // el histórico del avión lo derivan de la URL firmada.
    expect(leer("../flights/escalas-card.tsx")).toMatch(
      /bucket="taco-fotos"\s+path=\{path \?\? pathDeUrlFirmada\(url\)\?\.path\}/,
    );
    const tacoLive = leer("../taco-live/taco-live-board.tsx");
    expect(tacoLive.match(/bucket="taco-fotos"/g)?.length).toBe(3);
    expect(tacoLive.match(/pathDeUrlFirmada\(/g)?.length).toBe(3);
    expect(leer("../aircraft/aircraft-tacometros-card.tsx")).toMatch(
      /bucket="taco-fotos"\s+path=\{pathDeUrlFirmada\(url\)\?\.path\}/,
    );
    // Comprobantes de gasto y voucher de cobro.
    for (const archivo of [
      "../expenses/expenses-table.tsx",
      "../expenses/fuel-loads-table.tsx",
      "../expenses/gastos-personales-table.tsx",
      "../expenses/expense-verify-dialog.tsx",
      "../flights/flight-gastos-table.tsx",
      "../inventory/compras/compra-pagos-card.tsx",
    ]) {
      expect(leer(archivo), archivo).toContain('bucket="gasto-fotos"');
    }
    const cobro = leer("../flights/comprobante-cobro.tsx");
    expect(cobro.match(/bucket="cobro-vouchers"/g)?.length).toBe(2);
    // Plan de vuelo: el enlace renueva su URL firmada.
    const meta = leer("../flights/flight-meta-sheet.tsx");
    expect(meta).toContain("<EnlacePlanVuelo url={planVueloUrl} />");
    expect(meta).toContain("pathDeUrlFirmada(url)");
    // Un path que el API rechazaría (tumbaría el lote) = sin path: ni viaja.
    expect(leer("../image-preview.tsx")).toContain("path: esPathFirmable(path) ? path : null");
    expect(leer("../comprobante-preview.tsx")).toContain("if (!esPathFirmable(path)) return;");
    // Ningún <ImagePreview> sin bucket en el panel.
    for (const archivo of [
      "../flights/escalas-card.tsx",
      "../taco-live/taco-live-board.tsx",
      "../aircraft/aircraft-tacometros-card.tsx",
      "../comprobante-preview.tsx",
    ]) {
      const fuente = leer(archivo);
      const usos = fuente.match(/<ImagePreview[\s\S]*?\/>/g) ?? [];
      expect(usos.length, archivo).toBeGreaterThan(0);
      for (const uso of usos) expect(uso, archivo).toContain("bucket=");
    }
  });
});

