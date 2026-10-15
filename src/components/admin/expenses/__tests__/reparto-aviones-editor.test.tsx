/**
 * Editor EN LÍNEA y resumen del reparto (14-oct-2026,
 * `reparto-aviones-editor.tsx`): presentación pura renderizada (el runner no
 * tiene DOM). Filas con matrícula, modelo e insignia «Inactivo»; los estados
 * «cargando» y «falló»; la línea viva (roja si se pasa); manita en todo lo
 * que se pulsa, botones `type="button"` (vive DENTRO del formulario de
 * «Verificar / editar») e ids únicos por gasto.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RepartoAvionesEditor,
  RepartoResumen,
} from "@/components/admin/expenses/reparto-aviones-editor";
import type { AvionReparto, ParteReparto } from "@/lib/admin/reparto-gasto";

const N4142R = "5a82eb4a-086c-4058-97bd-b2aacdc2e942";
const N621TX = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";
const N990GG = "8f37ec37-965a-42a8-bac4-9991d282f0a3";
const XB_IJP = "90823b46-1e0e-4cfc-9301-9cb416857c4a";

const FILAS: AvionReparto[] = [
  { id: N4142R, matricula: "N4142R", modelo: "PIPER SENECA V" },
  { id: N621TX, matricula: "N621TX", modelo: "Kodiak 100" },
  { id: N990GG, matricula: "N990GG", modelo: "Seneca V" },
  { id: XB_IJP, matricula: "XB-IJP", modelo: "Inactivo", inactivo: true },
];

const editor = (o: Partial<Parameters<typeof RepartoAvionesEditor>[0]> = {}) =>
  renderToStaticMarkup(
    <RepartoAvionesEditor
      filas={FILAS}
      seleccion={{}}
      onSeleccion={() => {}}
      techoCents={473376}
      moneda="MXN"
      idPrefijo="rep-g1"
      {...o}
    />,
  );

/** Todas las etiquetas <button …> del marcado. */
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("RepartoAvionesEditor", () => {
  it("filas con matrícula, modelo e insignia «Inactivo»", () => {
    const html = editor();
    expect(html).toContain("data-reparto-editor");
    for (const m of ["N4142R", "N621TX", "N990GG", "XB-IJP"]) {
      expect(html).toContain(`data-fila-reparto="${m}"`);
    }
    expect(html).toContain("PIPER SENECA V");
    expect(html).toContain("Kodiak 100");
    expect(html).toMatch(/<span[^>]*>Inactivo<\/span>/);
    expect(html).toContain("Marca los aviones y captura cuánto le toca a cada uno.");
    expect(html).toContain("Dividir en partes iguales");
  });

  it("sin filas todavía ⇒ «Cargando aviones activos…»; con las partes guardadas, además las filas", () => {
    const cargando = editor({ filas: null });
    expect(cargando).toContain("Cargando aviones activos…");
    expect(cargando).not.toContain("data-fila-reparto");
    const conPartes = editor({ filas: FILAS.slice(0, 3), cargando: true });
    expect(conPartes).toContain("Cargando aviones activos…");
    expect(conPartes).toContain('data-fila-reparto="N4142R"');
  });

  it("falló la carga ⇒ el texto y «Reintentar» (sin filas)", () => {
    const html = editor({ error: "No se pudieron cargar los aviones activos.", onReintentar: () => {} });
    expect(html).toContain("No se pudieron cargar los aviones activos.");
    expect(html).toMatch(/<button[^>]*>Reintentar<\/button>/);
    expect(html).not.toContain("data-fila-reparto");
  });

  it("línea viva normal y roja si se pasa; avisos de sin monto e inactivos", () => {
    const normal = editor({
      seleccion: {
        [N4142R]: { incluir: true, monto: "1577.92" },
        [N621TX]: { incluir: true, monto: "1577.92" },
        [N990GG]: { incluir: true, monto: "1577.92" },
      },
    });
    expect(normal).toMatch(
      /<p data-linea-reparto="" class="text-xs text-muted-foreground">Asignado \$4,733\.76 MXN de \$4,733\.76 MXN del total pagado · VuelaTour absorbe \$0\.00 MXN<\/p>/,
    );
    const pasa = editor({
      techoCents: 400000,
      seleccion: {
        [N4142R]: { incluir: true, monto: "1577.92" },
        [N621TX]: { incluir: true, monto: "1577.92" },
        [N990GG]: { incluir: true, monto: "1577.92" },
      },
    });
    expect(pasa).toMatch(
      /<p data-linea-reparto="" class="text-xs font-medium text-red-600 dark:text-red-400">Asignado \$4,733\.76 MXN de \$4,000\.00 MXN del total pagado · se pasa por \$733\.76 MXN — ajusta los montos<\/p>/,
    );
    const huecos = editor({
      seleccion: { [N4142R]: { incluir: true, monto: "" }, [XB_IJP]: { incluir: true, monto: "10" } },
    });
    expect(huecos).toContain("Captura el monto de N4142R (o desmárcalos).");
    expect(huecos).toContain("XB-IJP está inactivo: desmárcalo (solo se reparte entre aviones activos).");
  });

  it("manita en filas y botones; todo botón type=\"button\"; ids únicos y aria-label «Monto de …»", () => {
    const html = editor({ seleccion: { [N4142R]: { incluir: true, monto: "100" } } });
    const filas = html.match(/<label[^>]*data-fila-reparto[^>]*>/g) ?? [];
    expect(filas).toHaveLength(4);
    for (const f of filas) expect(f).toContain("cursor-pointer");
    const bs = botones(html);
    expect(bs.length).toBeGreaterThan(0);
    for (const b of bs) {
      expect(b).toContain('type="button"');
      expect(b).toContain("cursor-pointer");
    }
    expect(html).toContain(`id="rep-g1-monto-${N4142R}"`);
    expect(html).toContain(`id="rep-g1-incluir-${N4142R}"`);
    expect(html).toContain('aria-label="Monto de N4142R"');
    expect(html).toContain('aria-label="Monto de XB-IJP"');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // El checkbox también lleva la manita.
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*class="[^"]*cursor-pointer/);
  });
});

/** Los elementos del árbol (sin montar) que reciben teclas: el editor no usa hooks. */
function conTeclas(nodo: ReactNode, acc: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(nodo)) {
    for (const n of nodo) conTeclas(n, acc);
    return acc;
  }
  if (!isValidElement<Record<string, unknown>>(nodo)) return acc;
  if (typeof nodo.props.onKeyDown === "function") acc.push(nodo);
  conTeclas(nodo.props.children as ReactNode, acc);
  return acc;
}

describe("Enter dentro del editor (revisión del 14-oct-2026): jamás envía el formulario", () => {
  afterEach(() => vi.unstubAllGlobals());

  const arbol = (seleccion: Parameters<typeof RepartoAvionesEditor>[0]["seleccion"]) =>
    conTeclas(
      RepartoAvionesEditor({
        filas: FILAS,
        seleccion,
        onSeleccion: () => {},
        techoCents: 473376,
        moneda: "MXN",
        idPrefijo: "rep-g1",
      }),
    );
  const tecla = (el: ReactElement<Record<string, unknown>>, key: string) => {
    const preventDefault = vi.fn();
    (el.props.onKeyDown as (e: unknown) => void)({ key, preventDefault });
    return preventDefault;
  };

  it("en un monto: Enter se come y salta al siguiente avión MARCADO; las demás teclas pasan", () => {
    const enfocados: string[] = [];
    vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => enfocados.push(id) }) });
    const els = arbol({
      [N4142R]: { incluir: true, monto: "2366.88" },
      [N621TX]: { incluir: false, monto: "" },
      [N990GG]: { incluir: true, monto: "2366.88" },
    });
    // Casilla y monto por fila (4 filas).
    expect(els).toHaveLength(8);
    const monto = (id: string) => els.find((e) => e.props.id === `rep-g1-monto-${id}`)!;
    const casilla = (id: string) => els.find((e) => e.props.id === `rep-g1-incluir-${id}`)!;

    expect(tecla(monto(N4142R), "Enter")).toHaveBeenCalledTimes(1);
    expect(enfocados).toEqual([`rep-g1-monto-${N990GG}`]);
    // El último marcado: se come el Enter y no salta a ninguna parte.
    expect(tecla(monto(N990GG), "Enter")).toHaveBeenCalledTimes(1);
    expect(enfocados).toHaveLength(1);
    // En la casilla: se come el Enter (no «Guardar»), sin mover el foco.
    expect(tecla(casilla(N621TX), "Enter")).toHaveBeenCalledTimes(1);
    expect(enfocados).toHaveLength(1);
    // Cualquier otra tecla sigue su camino.
    expect(tecla(monto(N4142R), "1")).not.toHaveBeenCalled();
    expect(tecla(casilla(N4142R), " ")).not.toHaveBeenCalled();
  });
});

describe("RepartoResumen", () => {
  const STARLINK: ParteReparto[] = [
    { aeronave_id: N4142R, matricula: "N4142R", monto: 1577.92 },
    { aeronave_id: N621TX, matricula: "N621TX", monto: 1577.92 },
    { aeronave_id: N990GG, matricula: null, monto: 1577.92 },
  ];
  const html = renderToStaticMarkup(
    <RepartoResumen partes={STARLINK} moneda="MXN" techoCents={473376} onEditar={() => {}} onQuitar={() => {}} />,
  );

  it("partes con su monto, la línea del total pagado y los dos botones", () => {
    expect(html).toContain("data-reparto-resumen");
    expect(html).toContain("Repartido entre aviones");
    expect(html.split("$1,577.92 MXN").length - 1).toBe(3);
    expect(html).toContain("¿?");
    expect(html).toContain("Asignado $4,733.76 MXN de $4,733.76 MXN del total pagado · VuelaTour absorbe $0.00 MXN");
    expect(html).toMatch(/<button[^>]*title="Deja el gasto sin reparto; se confirma al guardar\."[^>]*>Quitar el reparto<\/button>/);
    expect(html).toMatch(/<button[^>]*>.*Editar reparto<\/button>/);
    for (const b of botones(html)) {
      expect(b).toContain('type="button"');
      expect(b).toContain("cursor-pointer");
    }
  });

  it("en rojo si el reparto guardado se pasa del total pagado", () => {
    const rojo = renderToStaticMarkup(
      <RepartoResumen partes={STARLINK} moneda="MXN" techoCents={400000} onEditar={() => {}} onQuitar={() => {}} />,
    );
    expect(rojo).toMatch(/<p class="text-xs font-medium text-red-600 dark:text-red-400">Asignado \$4,733\.76 MXN de \$4,000\.00 MXN/);
  });
});
