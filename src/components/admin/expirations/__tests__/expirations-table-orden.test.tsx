/**
 * Orden de la tabla de Vencimientos (26-oct-2026). La lógica pura vive en
 * `lib/admin/__tests__/vencimientos-orden.test.ts`; aquí se cuida el MARCADO:
 * encabezados «Vence» y «Restante» clicables con flecha y `aria-sort`, los
 * atajos «Ordenar: …» con el activo resaltado, y —lo que pidió el cliente—
 * que lo que vence antes salga en la PRIMERA página aunque el API lo mande
 * al final (el orden se aplica a la lista completa, no a la página visible).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExpirationRow } from "../expirations-table";

// Las acciones por fila (menú, diálogos, server actions) y el botón «Ver
// documento» (server action) no son parte de este test.
vi.mock("@/components/admin/expirations/expiration-actions", () => ({
  ExpirationActions: () => null,
}));
vi.mock("@/components/admin/expirations/ver-documento-button", () => ({
  VerDocumentoButton: () => null,
}));

// La URL VIVA (`useSearchParams`) manda sobre `ordenInicial`: al volver del
// detalle con router.back() Next reusa el payload viejo de la página. `null`
// = sin router (respaldo a `ordenInicial`).
let urlActual: URLSearchParams | null = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => urlActual,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

const { ExpirationsTable } = await import("../expirations-table");

const fila = (
  id: string,
  nombre: string,
  fecha: string,
  dias: number,
  extra: Partial<ExpirationRow> = {},
): ExpirationRow => ({
  id,
  tipo_documento_id: "tipo-1",
  aeronave_id: "avion-1",
  piloto_id: null,
  motor_id: null,
  vence_por: "FECHA",
  fecha_vencimiento: fecha,
  horas_limite: null,
  umbral_alerta_dias: null,
  referencia: null,
  archivo_url: null,
  notas: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  tipo: { nombre, ambito: "AERONAVE", es_critico: false },
  estado: dias < 0 ? "VENCIDO" : "VIGENTE",
  dias_restantes: dias,
  horas_restantes: null,
  objetivo: "XB-IJP",
  ...extra,
});

// 25 documentos «Documento 01…25» que vencen un día después del anterior
// (1-nov-2026 → 25-nov-2026), entregados AL REVÉS (el más lejano primero),
// más un seguro vencido hace 391 d que llega al FINAL de la lista.
const LISTA: ExpirationRow[] = [
  ...Array.from({ length: 25 }, (_, i) =>
    fila(
      `d${i}`,
      `Documento ${String(i + 1).padStart(2, "0")}`,
      `2026-11-${String(i + 1).padStart(2, "0")}`,
      6 + i,
    ),
  ).reverse(),
  fila("viejo", "Seguro viejo", "2025-09-27", -391),
];

type Orden = NonNullable<Parameters<typeof ExpirationsTable>[0]["ordenInicial"]>;

const pintar = (ordenInicial?: Orden) =>
  renderToStaticMarkup(
    <ExpirationsTable
      rows={LISTA}
      documentTypes={[]}
      aircraft={[]}
      pilots={[]}
      engines={[]}
      ordenInicial={ordenInicial}
    />,
  );

/** Pinta con `?orden=` en la URL (como llega en el panel). */
const render = (orden?: Orden) => {
  urlActual = new URLSearchParams(orden ? { orden } : {});
  return pintar(orden);
};

describe("ExpirationsTable · orden", () => {
  it("default «Vence» ascendente: el vencido más viejo sale ARRIBA de la primera página aunque llegue al final", () => {
    const html = render();
    expect(html).toContain("Seguro viejo");
    expect(html.indexOf("Seguro viejo")).toBeLessThan(html.indexOf("Documento 01"));
    expect(html.indexOf("Documento 01")).toBeLessThan(html.indexOf("Documento 02"));
    // 26 filas, 20 por página: los más lejanos quedan en la página 2.
    expect(html).not.toContain("Documento 25");
    expect(html).toContain("hace 391 d");
  });

  it("`?orden=vence-desc`: la fecha más lejana arriba y el vencido viejo fuera de la primera página", () => {
    const html = render("vence-desc");
    expect(html).toContain("Documento 25");
    expect(html.indexOf("Documento 25")).toBeLessThan(html.indexOf("Documento 24"));
    expect(html).not.toContain("Documento 01");
    expect(html).not.toContain("Seguro viejo");
  });

  it("atajos visibles con el activo marcado (aria-pressed) y cursor-pointer", () => {
    const html = render();
    expect(html).toContain("Ordenar:");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Primero lo que vence antes</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Primero lo que vence más tarde</);
    const botones = html.match(/<button[^>]*aria-pressed[^>]*>/g) ?? [];
    expect(botones).toHaveLength(2);
    for (const b of botones) expect(b).toContain("cursor-pointer");
  });

  it("encabezados ordenables: SOLO «Vence» y «Restante» (aria-sort + botón con cursor-pointer)", () => {
    const html = render();
    const ths = html.match(/<th[^>]*aria-sort="[a-z]+"[^>]*>/g) ?? [];
    expect(ths).toHaveLength(2);
    expect(html).toMatch(/aria-sort="ascending"[^>]*><button[^>]*>Vence</);
    expect(html).toMatch(/aria-sort="none"[^>]*><button[^>]*>Restante</);
    const headBtns = html.match(/<th[^>]*aria-sort[^>]*><button[^>]*>/g) ?? [];
    expect(headBtns).toHaveLength(2);
    for (const b of headBtns) expect(b).toContain("cursor-pointer");
    // Documento, Objetivo y Estado siguen siendo encabezados de texto.
    expect(html).toMatch(/<th[^>]*>Documento</);
    expect(html).toMatch(/<th[^>]*>Objetivo</);
    expect(html).toMatch(/<th[^>]*>Estado</);
  });

  it("`?orden=restante-desc` marca «Restante» descendente y ningún atajo activo", () => {
    const html = render("restante-desc");
    expect(html).toMatch(/aria-sort="descending"[^>]*><button[^>]*>Restante</);
    expect(html).toMatch(/aria-sort="none"[^>]*><button[^>]*>Vence</);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html.indexOf("Documento 25")).toBeLessThan(html.indexOf("Documento 24"));
  });

  it("al VOLVER del detalle manda la URL, no el `ordenInicial` viejo del payload reusado", () => {
    // Primera carga sin `?orden=` (ordenInicial = vence); el operador eligió
    // «Primero lo que vence más tarde» (replaceState) y regresó.
    urlActual = new URLSearchParams({ orden: "vence-desc", tq: "", tp: "1" });
    const html = pintar("vence");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Primero lo que vence más tarde</);
    expect(html).toContain("Documento 25");
    expect(html).not.toContain("Seguro viejo");
  });

  it("URL con `?orden=` fuera de catálogo ⇒ «Vence» ascendente (enlace viejo no rompe)", () => {
    urlActual = new URLSearchParams({ orden: "stock;drop" });
    const html = pintar("vence-desc");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Primero lo que vence antes</);
    expect(html.indexOf("Seguro viejo")).toBeLessThan(html.indexOf("Documento 01"));
  });

  it("sin router (useSearchParams null) usa `ordenInicial` de respaldo", () => {
    urlActual = null;
    const html = pintar("vence-desc");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Primero lo que vence más tarde</);
    expect(html).toContain("Documento 25");
  });

  it("MECANICO (sin gestionar) también ordena: mismas columnas ordenables, sin columna de acciones", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <ExpirationsTable
        rows={LISTA}
        documentTypes={[]}
        aircraft={[]}
        pilots={[]}
        engines={[]}
        canManage={false}
      />,
    );
    expect(html.match(/<th[^>]*aria-sort="[a-z]+"[^>]*>/g) ?? []).toHaveLength(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Primero lo que vence antes</);
  });
});
