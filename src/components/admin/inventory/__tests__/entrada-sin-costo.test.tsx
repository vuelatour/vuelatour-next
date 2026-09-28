/**
 * Alta de producto con la entrada inicial SIN costo (28-sep-2026) — el
 * MARCADO y el CABLEADO del formulario. La regla pura vive en
 * `lib/admin/__tests__/inventario-entrada-inicial.test.ts`; el cuerpo que
 * llega al API, en `app/admin/inventory/__tests__/entrada-sin-costo-action.test.ts`.
 *
 * Lo que se vigila aquí: la ayuda del bloque «Entrada inicial (opcional)»
 * dice que el costo puede quedar pendiente; el formulario ya no rechaza el
 * costo vacío; sin costo NUNCA se crea nada sin pasar por la confirmación
 * «¿Registrar la entrada sin costo?»; y el toast final lleva a la ficha.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { InventarioItem } from "@/types/inventory";
import {
  AYUDA_COSTO_PENDIENTE,
  AVISO_COSTO_PENDIENTE,
  HINT_COSTO_ENTRADA_PENDIENTE,
} from "@/lib/admin/inventario-entrada-inicial";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
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
const { MovimientoDialog } = await import("../movimiento-dialog");

const FUENTE = readFileSync(
  path.resolve(__dirname, "../item-form-dialog.tsx"),
  "utf8",
);
const FUENTE_MOV = readFileSync(
  path.resolve(__dirname, "../movimiento-dialog.tsx"),
  "utf8",
);

const ITEM = {
  id: "i1",
  nombre: "Aceite 15W-50",
  categoria: "Aceites",
  activo: true,
} as InventarioItem;

describe("formulario del producto · entrada inicial sin costo", () => {
  it("ALTA: la ayuda del bloque dice que el costo puede quedar pendiente", () => {
    const html = renderToStaticMarkup(
      <ItemFormDialog open onOpenChange={() => {}} categorias={["Aceites"]} />,
    );
    expect(html).toContain("Entrada inicial (opcional):");
    expect(html).toContain(AYUDA_COSTO_PENDIENTE);
    // Sin cantidad capturada no se avisa nada todavía.
    expect(html).not.toContain(AVISO_COSTO_PENDIENTE);
    // La confirmación no se pinta sin pedirla.
    expect(html).not.toContain("¿Registrar la entrada sin costo?");
  });

  it("EDICIÓN: no hay bloque de entrada inicial (el stock se mueve con el cardex)", () => {
    const html = renderToStaticMarkup(
      <ItemFormDialog open onOpenChange={() => {}} initialItem={ITEM} categorias={["Aceites"]} />,
    );
    expect(html).not.toContain("Entrada inicial (opcional):");
    expect(html).not.toContain(AYUDA_COSTO_PENDIENTE);
  });
});

describe("cableado en el código", () => {
  it("el rechazo viejo del costo vacío ya no existe; la regla es `decidirEntradaInicial`", () => {
    expect(FUENTE).not.toContain(
      "Captura el costo unitario de compra de la entrada inicial (mayor a 0) o borra la cantidad.",
    );
    expect(FUENTE).toContain("decidirEntradaInicial(entradaDe(values))");
  });

  it("sin costo se PREGUNTA antes de crear: la rama COSTO_PENDIENTE abre la confirmación y sale", () => {
    const i = FUENTE.indexOf('if (entrada.tipo === "COSTO_PENDIENTE") {');
    expect(i).toBeGreaterThan(-1);
    // Hasta el cierre del `if` (4 espacios de sangría, como en el archivo).
    const rama = FUENTE.slice(i, FUENTE.indexOf("\n    }\n", i));
    expect(rama).toContain("setConfirmarSinCosto({ values, entrada });");
    expect(rama).toContain("return;");
    // La confirmación va DESPUÉS de validar empaques (no se pregunta por
    // algo que luego igual se rechaza).
    expect(FUENTE.indexOf("repetido en dos empaques")).toBeLessThan(i);
  });

  it("solo «Registrar sin costo» crea con el costo pendiente; «Capturar el costo» regresa al campo", () => {
    expect(FUENTE).toContain("<AlertDialogTitle>{TITULO_CONFIRMAR_SIN_COSTO}</AlertDialogTitle>");
    const accion = FUENTE.slice(FUENTE.indexOf("<AlertDialogAction"));
    expect(accion.slice(0, accion.indexOf("</AlertDialogAction>"))).toMatch(
      /guardar\(pendienteDeCrear\.values, pendienteDeCrear\.entrada\)[\s\S]*\{BOTON_REGISTRAR_SIN_COSTO\}/,
    );
    const cancelar = FUENTE.slice(FUENTE.indexOf("<AlertDialogCancel"));
    const bloqueCancelar = cancelar.slice(0, cancelar.indexOf("</AlertDialogCancel>"));
    expect(bloqueCancelar).toContain("irAlCostoRef.current = true");
    expect(bloqueCancelar).toContain("{BOTON_CAPTURAR_COSTO}");
    expect(bloqueCancelar).not.toContain("guardar(");
    expect(FUENTE).toContain("return irAlCosto ? costoInputRef.current : true;");
  });

  it("el movimiento sale del helper (USD 0 si el costo quedó pendiente) y la llamada es UNA", () => {
    expect(FUENTE.match(/createMovimientoAction\(/g)?.length).toBe(1);
    expect(FUENTE).toContain("...entrada.movimiento,");
    expect(FUENTE).not.toMatch(/costo_unitario_mxn:\s*costo/);
  });

  it("toast final con «Ver ficha» a /admin/inventory/<id>", () => {
    expect(FUENTE).toMatch(
      /toast\.success\(textoProductoCreadoSinCosto\(entrada\.cantidad\), \{\s*action: \{ label: "Ver ficha", onClick: \(\) => router\.push\(`\/admin\/inventory\/\$\{id\}`\) \}/,
    );
  });

  it("los botones de la confirmación llevan cursor-pointer", () => {
    for (const tag of ["<AlertDialogCancel", "<AlertDialogAction"]) {
      const desde = FUENTE.indexOf(tag);
      const apertura = FUENTE.slice(desde, FUENTE.indexOf(">", FUENTE.indexOf("className", desde)));
      expect(apertura).toContain('className="cursor-pointer"');
    }
  });
});

describe("revisión adversaria (28-sep-2026)", () => {
  it("alta: abierta/cerrada va APARTE del cuerpo y un doble clic en «Registrar sin costo» no crea dos", () => {
    // El texto no se vacía durante la animación de salida (el cuerpo sigue
    // ahí) y el segundo clic ya ve `sinCostoAbierto = false`.
    expect(FUENTE).toContain("open={sinCostoAbierto && confirmarSinCosto !== null}");
    expect(FUENTE).toContain(
      "const pendienteDeCrear = sinCostoAbierto ? confirmarSinCosto : null;",
    );
    const i = FUENTE.indexOf('if (entrada.tipo === "COSTO_PENDIENTE") {');
    const rama = FUENTE.slice(i, FUENTE.indexOf("\n    }\n", i));
    expect(rama).toContain("setSinCostoAbierto(true);");
  });

  it("«Registrar movimiento» → ENTRADA: el costo YA NO es obligatorio y la ayuda dice que queda pendiente", () => {
    const html = renderToStaticMarkup(
      <MovimientoDialog
        open
        onOpenChange={() => {}}
        itemId="i1"
        itemNombre="Aceite 15W-50"
        aircraft={[]}
        providers={[]}
        initialTipo="ENTRADA"
      />,
    );
    expect(html).toContain("Costo unitario");
    expect(html).toContain(HINT_COSTO_ENTRADA_PENDIENTE);
    expect(html).not.toContain("¿Registrar la entrada sin costo?");
  });

  it("«Registrar movimiento» → SALIDA/DEVOLUCIÓN: sin la ayuda de costo pendiente", () => {
    for (const initialTipo of ["SALIDA", "DEVOLUCION"] as const) {
      const html = renderToStaticMarkup(
        <MovimientoDialog
          open
          onOpenChange={() => {}}
          itemId="i1"
          itemNombre="Aceite 15W-50"
          aircraft={[]}
          providers={[]}
          initialTipo={initialTipo}
        />,
      );
      expect(html).not.toContain(HINT_COSTO_ENTRADA_PENDIENTE);
    }
  });

  it("«Registrar movimiento» → ENTRADA con costo vacío/0: se PREGUNTA (antes un «0» entraba en silencio)", () => {
    expect(FUENTE_MOV).toContain("clasificarCostoEntrada({");
    const i = FUENTE_MOV.indexOf('if (costo.tipo === "PENDIENTE" && cantidad > 0) {');
    expect(i).toBeGreaterThan(-1);
    const rama = FUENTE_MOV.slice(i, FUENTE_MOV.indexOf("\n      }\n", i));
    // Viaja como la carga masiva: USD 0, sin pesos ni T.C.
    expect(rama).toContain('moneda: "USD",');
    expect(rama).toContain("costo_unitario_usd: 0,");
    expect(rama).toContain('costo_unitario_mxn: "",');
    expect(rama).toContain("tc_usd_mxn: undefined,");
    expect(rama).toContain("setSinCostoAbierto(true);");
    expect(rama).toContain("return;");
    expect(rama).not.toContain("registrar(");
    // Un costo en $0.0000 USD es error, no «con costo».
    expect(FUENTE_MOV).toMatch(/if \(costo\.tipo === "ERROR"\) \{\s*toast\.error\(costo\.mensaje\);\s*return;/);
  });

  it("«Registrar movimiento»: solo «Registrar sin costo» registra, una sola llamada al API y cursor-pointer", () => {
    expect(FUENTE_MOV.match(/createMovimientoAction\(/g)?.length).toBe(1);
    const accion = FUENTE_MOV.slice(FUENTE_MOV.indexOf("<AlertDialogAction"));
    const bloque = accion.slice(0, accion.indexOf("</AlertDialogAction>"));
    expect(bloque).toContain("const pendiente = sinCostoAbierto ? sinCosto : null;");
    expect(bloque).toContain("cantidadSinCosto: pendiente.cantidad");
    const cancelar = FUENTE_MOV.slice(FUENTE_MOV.indexOf("<AlertDialogCancel"));
    const bloqueCancelar = cancelar.slice(0, cancelar.indexOf("</AlertDialogCancel>"));
    expect(bloqueCancelar).not.toContain("registrar(");
    expect(bloqueCancelar).toContain("irAlCostoRef.current = true");
    for (const tag of ["<AlertDialogCancel", "<AlertDialogAction"]) {
      const desde = FUENTE_MOV.indexOf(tag);
      const apertura = FUENTE_MOV.slice(desde, FUENTE_MOV.indexOf(">", FUENTE_MOV.indexOf("className", desde)));
      expect(apertura).toContain('className="cursor-pointer"');
    }
    // El texto depende de si el producto YA tiene una compra con costo.
    expect(FUENTE_MOV).toContain("textoConfirmarEntradaSinCosto(sinCosto.cantidad, {");
  });
});
