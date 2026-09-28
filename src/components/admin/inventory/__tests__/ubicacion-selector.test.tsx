/**
 * Ubicaciones «rápido y ágil» (28-sep-2026). Pedido del cliente con la
 * captura del selector «Ubicación» del formulario del producto: «Necesitamos
 * una forma rápida y ágil para poder editar, borrar o agregar opciones a este
 * listado de lugares para el inventario». La lógica pura vive en
 * `lib/admin/__tests__/inventario-ubicacion.test.ts`; aquí se cuida el
 * MARCADO: con permiso (ADMIN/MECANICO) el selector trae «＋ Agregar
 * ubicación…» y el engrane «Administrar ubicaciones»; sin permiso, el
 * selector de siempre; la etiqueta sigue ligada al control; el diálogo trae
 * «Eliminar» y renombrar con clic; todo lo clicable con `cursor-pointer`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { InventarioItem, InventarioUbicacion } from "@/types/inventory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
// Red y sesión fuera del test.
vi.mock("@/app/admin/inventory/actions", () => ({
  actualizarUbicacionAction: vi.fn(),
  crearUbicacionAction: vi.fn(),
  eliminarUbicacionAction: vi.fn(),
  listarUbicacionesAction: vi.fn(),
  moverUbicacionAction: vi.fn(),
  productosDeUbicacionAction: vi.fn(),
  reordenarUbicacionesAction: vi.fn(),
  createEmpaqueAction: vi.fn(),
  createItemAction: vi.fn(),
  createMovimientoAction: vi.fn(),
  deleteEmpaqueAction: vi.fn(),
  updateEmpaqueAction: vi.fn(),
  updateItemAction: vi.fn(),
}));
vi.mock("@/lib/storage/inventario-fotos", () => ({ uploadInventarioFoto: vi.fn() }));
// El diálogo de Base UI se monta en un portal (no existe en el render del
// server): aquí se pinta en línea, abierto o cerrado según `open`.
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

const { ItemFormDialog } = await import("../item-form-dialog");
const { UbicacionesDialog } = await import("../ubicaciones-dialog");
const { MoverUbicacionDialog } = await import("../mover-ubicacion-dialog");
const { UbicacionSelector } = await import("../ubicacion-selector");

const u = (
  id: string,
  nombre: string,
  orden: number,
  extra: Partial<InventarioUbicacion> = {},
): InventarioUbicacion => ({
  id,
  nombre,
  orden,
  activo: true,
  productos: 0,
  created_at: "2026-09-25T12:00:00Z",
  updated_at: "2026-09-25T12:00:00Z",
  ...extra,
});

// El catálogo de la captura del cliente (prod, 28-sep-2026): solo «Oficina
// nueva» tiene un producto.
const CATALOGO: InventarioUbicacion[] = [
  u("u1", "Oficina vieja", 1),
  u("u2", "Oficina nueva", 2, { productos: 1 }),
  u("u3", "Locker del aeropuerto", 3),
  u("u4", "Bodega del taller de Mérida", 4),
  u("u5", "Bodega del taller de Cozumel", 5),
];

const ITEM: InventarioItem = {
  id: "i1",
  nombre: "Aceite 15W-50",
  numero_parte: null,
  codigo: null,
  categoria: "Aceites",
  stock_minimo: null,
  unidad: "botella",
  ubicacion: "Oficina nueva",
  ubicacion_id: "u2",
  ubicacion_nombre: "Oficina nueva",
  ubicacion_legado: null,
  notas: null,
  activo: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as InventarioItem;

const formulario = (props: Partial<Parameters<typeof ItemFormDialog>[0]> = {}) =>
  renderToStaticMarkup(
    <ItemFormDialog
      open
      onOpenChange={() => {}}
      initialItem={ITEM}
      categorias={["Aceites"]}
      ubicaciones={CATALOGO}
      {...props}
    />,
  );

/** El `<select>` de la ubicación (el primero con «Sin ubicación»). */
const selectUbicacion = (html: string) =>
  html.match(/<select[^>]*>(?:(?!<\/select>)[\s\S])*Sin ubicación(?:(?!<\/select>)[\s\S])*<\/select>/)?.[0] ?? "";

describe("formulario del producto · selector de ubicación", () => {
  it("SIN permiso: el selector de siempre (sin «＋ Agregar ubicación…» ni engrane)", () => {
    const html = formulario({ puedeAdministrarUbicaciones: false });
    const sel = selectUbicacion(html);
    expect(sel).toContain("Oficina vieja");
    expect(sel).toContain("Bodega del taller de Cozumel");
    expect(html).not.toContain("＋ Agregar ubicación…");
    expect(html).not.toContain('aria-label="Administrar ubicaciones"');
    // Sin permiso tampoco se monta el diálogo de administrar.
    expect(html).not.toContain("Clic para renombrar");
  });

  it("sin la prop (panel viejo / otro llamador) ⇒ igual que sin permiso", () => {
    const html = formulario();
    expect(html).not.toContain("＋ Agregar ubicación…");
    expect(html).not.toContain('aria-label="Administrar ubicaciones"');
  });

  it("CON permiso: «＋ Agregar ubicación…» es la ÚLTIMA opción y el engrane tiene texto accesible y cursor-pointer", () => {
    const html = formulario({ puedeAdministrarUbicaciones: true });
    const sel = selectUbicacion(html);
    const opciones = [...sel.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(opciones).toEqual([
      "Sin ubicación",
      "Oficina vieja",
      "Oficina nueva",
      "Locker del aeropuerto",
      "Bodega del taller de Mérida",
      "Bodega del taller de Cozumel",
      "＋ Agregar ubicación…",
    ]);
    expect(sel).toMatch(/<option value="__agregar_ubicacion__">＋ Agregar ubicación…<\/option>/);
    const engrane = html.match(/<button[^>]*aria-label="Administrar ubicaciones"[^>]*>/)?.[0] ?? "";
    expect(engrane).toContain('type="button"');
    expect(engrane).toContain('title="Administrar ubicaciones"');
    expect(engrane).toContain("cursor-pointer");
    // El diálogo de administrar está CERRADO hasta pulsar el engrane.
    expect(html).not.toContain("Clic para renombrar");
  });

  it("la etiqueta «Ubicación» sigue ligada al select (Field clona al selector y éste pasa el id)", () => {
    const html = formulario({ puedeAdministrarUbicaciones: true });
    const sel = selectUbicacion(html);
    const id = sel.match(/<select[^>]*id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html.indexOf(`for="${id}"`)).toBeLessThan(html.indexOf(`id="${id}"`));
  });

  it("la ubicación ACTUAL inactiva se ve «(inactiva)», deshabilitada y seleccionada", () => {
    const html = formulario({
      puedeAdministrarUbicaciones: true,
      ubicaciones: [...CATALOGO, u("u9", "Hangar 3", 6, { activo: false })],
      initialItem: { ...ITEM, ubicacion: "Hangar 3", ubicacion_id: "u9", ubicacion_nombre: "Hangar 3" },
    });
    expect(selectUbicacion(html)).toMatch(/<option value="u9" disabled="" selected="">Hangar 3 \(inactiva\)<\/option>/);
  });

  it("sin catálogo (API previo): el texto de siempre, sin agregar ni administrar aunque haya permiso", () => {
    const html = formulario({ puedeAdministrarUbicaciones: true, ubicaciones: null });
    expect(html).toContain('placeholder="Bodega Cancún"');
    expect(html).not.toContain("＋ Agregar ubicación…");
    expect(html).not.toContain('aria-label="Administrar ubicaciones"');
  });
});

describe("UbicacionSelector suelto", () => {
  it("«Elige la ubicación…» como opción vacía y solo ACTIVAS", () => {
    const html = renderToStaticMarkup(
      <UbicacionSelector
        value=""
        onChange={() => {}}
        ubicaciones={[...CATALOGO, u("u9", "Hangar 3", 6, { activo: false })]}
        etiquetaVacia="Elige la ubicación…"
        ariaLabel="Ubicación destino"
      />,
    );
    expect(html).toContain('aria-label="Ubicación destino"');
    expect(html).toContain("Elige la ubicación…");
    expect(html).not.toContain("Hangar 3");
    expect(html).toContain("cursor-pointer");
  });
});

describe("diálogo «Ubicaciones»", () => {
  const dialogo = () =>
    renderToStaticMarkup(
      <UbicacionesDialog
        open
        onOpenChange={() => {}}
        ubicaciones={[...CATALOGO, u("u9", "Hangar 3", 6, { activo: false })]}
      />,
    );

  it("cada fila: renombrar con clic en el nombre o el lápiz, ▲▼, Desactivar/Activar y «Eliminar»", () => {
    const html = dialogo();
    for (const x of [...CATALOGO.map((c) => c.nombre), "Hangar 3"]) {
      expect(html).toContain(`aria-label="Eliminar «${x}»"`);
      expect(html).toContain(`aria-label="Renombrar «${x}»"`);
    }
    expect(html.match(/title="Clic para renombrar"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Subir «Oficina nueva»"');
    expect(html).toContain('aria-label="Bajar «Oficina nueva»"');
    expect(html).toContain(">Activar<");
    // «Oficina nueva» tiene un producto: no se desactiva (tooltip dice qué hacer).
    expect(html).toContain('title="Mueve primero su producto a otra ubicación"');
  });

  it("todo botón del diálogo tiene cursor-pointer", () => {
    const botones = dialogo().match(/<button[^>]*>/g) ?? [];
    expect(botones.length).toBeGreaterThan(20);
    for (const b of botones) expect(b).toContain("cursor-pointer");
  });

  it("ninguna confirmación se pinta sin pedirla (Eliminar confirma antes de borrar)", () => {
    const html = dialogo();
    expect(html).not.toContain("Sí, eliminar");
    expect(html).not.toContain("para siempre");
  });
});

describe("«Mover a…»", () => {
  it("el destino es el MISMO selector: agregar y administrar ahí mismo", () => {
    const html = renderToStaticMarkup(
      <MoverUbicacionDialog
        open
        onOpenChange={() => {}}
        productos={[{ id: "i1", nombre: "Aceite 15W-50", ubicacion_id: null }]}
        ubicaciones={CATALOGO}
        puedeAdministrar
      />,
    );
    expect(html).toContain('aria-label="Ubicación destino"');
    expect(html).toContain("Elige la ubicación…");
    expect(html).toContain("＋ Agregar ubicación…");
    expect(html).toContain('aria-label="Administrar ubicaciones"');
  });
});

/**
 * Cableado que el render estático no puede ejercer (revisión adversaria
 * 28-sep-2026): (1) un nombre tecleado en «＋ Agregar ubicación…» y SIN
 * guardar no deja salir al «Guardar» del producto ni a «Mover» con la
 * ubicación anterior (el nombre se perdía en silencio); (2) al vaciar desde
 * «Administrar» la ubicación que tiene elegida el selector, éste sigue a su
 * producto al destino ANTES de que el catálogo nuevo se publique (si no, al
 * eliminarla el selector caía a «Sin ubicación» y «Guardar» le quitaba la
 * ubicación al producto).
 */
describe("cableado en el código", () => {
  const leer = (...p: string[]) =>
    readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");

  it("formulario del producto: no guarda con un nombre de ubicación a medias", () => {
    const src = leer("components", "admin", "inventory", "item-form-dialog.tsx");
    expect(src).toContain("onAltaPendiente={setAltaUbicacionPendiente}");
    const submit = src.slice(src.indexOf("const onSubmit = handleSubmit("));
    const guardia = submit.indexOf("toast.error(textoAltaUbicacionPendiente(altaUbicacionPendiente))");
    expect(guardia).toBeGreaterThan(0);
    expect(guardia).toBeLessThan(submit.indexOf("createItemAction("));
    expect(guardia).toBeLessThan(submit.indexOf("updateItemAction("));
    // Cada sesión nueva del formulario arranca sin pendiente.
    expect(src).toContain("setAltaUbicacionPendiente(null);");
  });

  it("«Mover a…»: no mueve al destino anterior con un nombre a medias", () => {
    const src = leer("components", "admin", "inventory", "mover-ubicacion-dialog.tsx");
    expect(src).toContain("onAltaPendiente={setAltaPendiente}");
    const mover = src.slice(src.indexOf("const mover = () =>"));
    const guardia = mover.indexOf("toast.error(textoAltaUbicacionPendiente(altaPendiente))");
    expect(guardia).toBeGreaterThan(0);
    expect(guardia).toBeLessThan(mover.indexOf("moverUbicacionAction("));
  });

  it("vaciar desde «Administrar»: el selector sigue a su producto antes del catálogo nuevo", () => {
    const dlg = leer("components", "admin", "inventory", "ubicaciones-dialog.tsx");
    const vaciar = dlg.slice(dlg.indexOf("const vaciar = "), dlg.indexOf("return (", dlg.indexOf("const vaciar = ")));
    const aviso = vaciar.indexOf("onProductosMovidos?.(u.id, destino.id)");
    expect(aviso).toBeGreaterThan(vaciar.indexOf("moverUbicacionAction("));
    expect(aviso).toBeLessThan(vaciar.indexOf("await refrescar(lista)"));
    const sel = leer("components", "admin", "inventory", "ubicacion-selector.tsx");
    expect(sel).toContain("ubicacionTrasVaciar(value, desdeId, haciaId)");
    expect(sel).toContain("onAltaPendiente?.(null);");
  });
});
