/**
 * El ALTA de gasto con «Créalo por la suma» de Conciliación (14-oct-2026, API
 * 0.0.77, invariante 76 del API: `POST /v1/expenses` con
 * `conciliar_con_movimientos` + `client_request_id`). Props ADITIVAS
 * `conciliarConMovimientos`, `clientRequestId`, `textoExito` y `textoError`:
 *  1. SIN ellas el alta sale BYTE A BYTE igual que antes (golden congelado
 *     ANTES del cambio con el código de la base: `alta-gasto.golden.json`,
 *     botón, modo controlado, refacción, gasto general y alta del vuelo;
 *     el 20-oct-2026 se regeneró SOLO por las opciones nuevas de los
 *     selectores: «Otros gastos directos del vuelo», «Paquetería» y
 *     «Efectivo de la empresa (no de fondo)»);
 *  2. con ellas, sin «A Inventario/Tienda» (solo «Directo al avión» y por
 *     qué) y, en lo demás, el MISMO formulario;
 *  3. cableado por regex: las dos llaves viajan SOLO con los cargos, la
 *     llamada con los cargos va con `.catch` (nunca al error boundary), el
 *     aviso de éxito y la caja roja de quien lo montó, y no se cierra a
 *     medio guardar.
 *
 * El runner no tiene DOM: render estático (los efectos no corren) + lectura
 * del fuente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";
import {
  NOTA_ELIGE_AVION_REFACCION,
  NOTA_INVENTARIO_NO_DESDE_CARGOS,
  notaRefaccionDesdeCargos,
} from "@/lib/admin/refaccion-inventario";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  createGastoAction: async () => ({ ok: false }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  leerFacturaIAAction: async () => ({ ok: false }),
  listArticulosRefaccionAction: async () => ({ ok: true, data: [] }),
  listAvionesActivosAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "x" }));
// Diálogos abiertos sin portal.
vi.mock("@/components/ui/dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-dialogo="">{children}</div> : null,
    DialogContent: Caja,
    DialogDescription: Caja,
    DialogFooter: Caja,
    DialogHeader: Caja,
    DialogTitle: Caja,
  };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-alerta="">{children}</div> : null,
    AlertDialogAction: Caja,
    AlertDialogCancel: Caja,
    AlertDialogContent: Caja,
    AlertDialogDescription: Caja,
    AlertDialogFooter: Caja,
    AlertDialogHeader: Caja,
    AlertDialogTitle: Caja,
  };
});
// Selector testigo: placeholder, valor, deshabilitado y etiquetas de opciones.
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-valor={p.value ?? ""}
      data-deshabilitado={p.disabled ? "si" : "no"}
      data-opciones={p.options.map((o) => o.label).join("|")}
    />
  ),
}));

// La fecha de hoy entra a los defaults del formulario: fija, para que el golden no dependa del reloj.
vi.setSystemTime(new Date("2026-10-14T17:00:00Z"));
afterAll(() => vi.useRealTimers());
const { ExpenseCreateDialog } = await import("../expense-create-dialog");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const GOLDEN = JSON.parse(leer("./alta-gasto.golden.json")) as Record<string, string>;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FLOTA: AvionCatalogoGasto[] = [
  { id: "5a82eb4a-086c-4058-97bd-b2aacdc2e942", matricula: "N4142R", combustible: "AVGAS" },
  { id: "e1a85e5b-9eaa-4367-9920-68d5d78883e8", matricula: "N621TX", combustible: "TURBOSINA" },
];
const PROV = [{ id: "7a1c0000-0000-4000-8000-000000000001", nombre: "HSBC" }];
/** HSBC Pesos 30-sep (prod): 2f95e45b $649.00 + 61baed07 $103.84 = $752.84. */
const CARGOS = ["2f95e45b-0000-4000-8000-000000000649", "61baed07-0000-4000-8000-000000000103"];
const LLAVE = "9b2c7a10-1d2e-4f30-8a4b-5c6d7e8f9a0b";
const conCargos = {
  conciliarConMovimientos: CARGOS,
  clientRequestId: LLAVE,
  textoExito: () => "Gasto registrado y vinculado a 2 cargos · quedó cubierto",
  textoError: () => "No se registró el gasto: …",
};

const abierta = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <ExpenseCreateDialog aircraft={FLOTA} providers={PROV} abierto onAbiertoChange={() => {}} {...extra} />,
  );

describe("sin las props nuevas: el alta de SIEMPRE (golden del 14-oct, antes del cambio)", () => {
  it("botón propio (outline y primario): idéntico", () => {
    expect(renderToStaticMarkup(<ExpenseCreateDialog aircraft={FLOTA} providers={PROV} />)).toBe(GOLDEN.boton);
    expect(
      renderToStaticMarkup(<ExpenseCreateDialog aircraft={FLOTA} providers={PROV} varianteBoton="default" />),
    ).toBe(GOLDEN.boton_primario);
  });

  it("modo controlado con título y contexto, refacción (con «A Inventario/Tienda»), gasto general y alta del vuelo: idénticos", () => {
    expect(
      abierta({ titulo: "Crear el gasto con la suma de 2 cargos", contexto: "Contexto de prueba." }),
    ).toBe(GOLDEN.operaciones);
    expect(abierta({ defaultCategoria: "REFACCION" })).toBe(GOLDEN.refaccion);
    expect(GOLDEN.refaccion).toContain(">A Inventario/Tienda</button>");
    expect(abierta({ defaultCategoria: "OTRO" })).toBe(GOLDEN.otro);
    expect(
      abierta({
        defaultVueloId: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        defaultVueloFolio: 104,
        defaultAeronaveId: "e1a85e5b-9eaa-4367-9920-68d5d78883e8",
        defaultCategoria: "REFACCION",
        defaultPilotoNombre: "Juan",
      }),
    ).toBe(GOLDEN.vuelo);
  });
});

describe("con los cargos («Créalo por la suma»)", () => {
  it("el formulario es el MISMO (sin caja roja hasta que el API responda un error)", () => {
    const props = { titulo: "Crear el gasto con la suma de 2 cargos", contexto: "Contexto de prueba." };
    expect(abierta({ ...props, ...conCargos })).toBe(GOLDEN.operaciones);
    expect(abierta({ defaultCategoria: "OTRO", ...conCargos })).toBe(GOLDEN.otro);
    expect(abierta(conCargos)).not.toContain("data-error-alta-cargos");
  });

  it("refacción: SIN «A Inventario/Tienda»; solo «Directo al avión» y por qué", () => {
    const h = abierta({ defaultCategoria: "REFACCION", ...conCargos });
    expect(h).not.toContain("A Inventario/Tienda</button>");
    expect(h).not.toContain("aria-pressed");
    expect(h).toContain("data-refaccion-solo-avion");
    expect(h).toMatch(/data-refaccion-solo-avion="true">Directo al avión<\/span>/);
    expect(h).toContain(esc(notaRefaccionDesdeCargos(false)));
    expect(notaRefaccionDesdeCargos(false)).toBe(`${NOTA_ELIGE_AVION_REFACCION} ${NOTA_INVENTARIO_NO_DESDE_CARGOS}`);
    // Ni el sub-formulario de la bodega ni «o pásala a Inventario/Tienda».
    expect(h).not.toContain("pásala a Inventario/Tienda");
    expect(h).not.toContain("Precio de venta");
    // Con avión (alta desde el vuelo): la nota de «Directo al avión» + por qué no a la bodega.
    const v = abierta({
      defaultVueloId: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      defaultAeronaveId: "e1a85e5b-9eaa-4367-9920-68d5d78883e8",
      defaultCategoria: "REFACCION",
      ...conCargos,
    });
    expect(v).toContain(esc(notaRefaccionDesdeCargos(true)));
  });
});

describe("cableado (regex sobre el fuente)", () => {
  const alta = leer("../expense-create-dialog.tsx");

  it("las props son ADITIVAS y opcionales", () => {
    expect(alta).toMatch(/conciliarConMovimientos\?: readonly string\[\];/);
    expect(alta).toMatch(/clientRequestId\?: string;/);
    expect(alta).toMatch(/textoExito\?: \(gasto: Gasto\) => string;/);
    expect(alta).toMatch(/textoError\?: \(r: ActionResult<Gasto>\) => string;/);
    expect(alta).toContain("const conCargos = conciliarConMovimientos !== undefined;");
  });

  it("las dos llaves viajan SOLO con los cargos (sin ellas el payload de siempre)", () => {
    expect(alta).toMatch(
      /\.\.\.\(conCargos\s*\?\s*\{\s*conciliar_con_movimientos: \[\.\.\.\(conciliarConMovimientos \?\? \[\]\)\],\s*client_request_id: clientRequestId,\s*\}\s*:\s*\{\}\),/,
    );
    expect(alta).toMatch(/\.\.\.\(inventarioPayload \? \{ inventario: inventarioPayload \} : \{\}\),/);
    // UNA sola llamada al alta: la de siempre.
    expect(alta.split("createGastoAction(").length - 1).toBe(1);
  });

  it("con los cargos la llamada va con .catch (nunca al error boundary); sin ellos, como hoy", () => {
    expect(alta).toContain("const result = conCargos ? await llamada.catch(sinConexionAlta) : await llamada;");
    expect(alta).toMatch(/const sinConexionAlta = \(\): ActionResult<Gasto> & \{ repartoError\?: string \} => \(\{\s*ok: false,\s*code: "SIN_CONEXION",/);
  });

  it("refacción con los cargos: siempre «Directo al avión» (el segmento de siempre queda intacto sin ellos)", () => {
    expect(alta).toContain('const refDestino: DestinoRefaccion = conCargos ? "AVION" : refDestinoElegido;');
    expect(alta).toMatch(/\{conCargos \? \(\s*\/\/[^\n]*\n\s*<span className="text-xs font-medium" data-refaccion-solo-avion>/);
    // Sin avión: con los cargos, «Elige el avión…»; sin ellos, la nota de
    // `notaDirectoAvionSinAvion` (con fecha futura, la salida real del día
    // del pago; probada por comportamiento en `refaccion-inventario.test.ts`).
    expect(alta).toMatch(
      /toast\.error\(\s*conCargos\s*\?\s*NOTA_ELIGE_AVION_REFACCION\s*:\s*notaDirectoAvionSinAvion\(\{ fecha: values\.fecha_gasto, capacidad: capacidadPorPagar \}\),?\s*\);/,
    );
  });

  it("éxito: el aviso de quien lo montó; error: la caja roja con SU texto y el alta sigue abierta", () => {
    expect(alta).toContain("const exito = textoExito && result.data ? textoExito(result.data) : null;");
    expect(alta).toMatch(/toast\.success\(\s*exito \?\?/);
    expect(alta).toMatch(/\} else if \(conCargos\) \{[\s\S]{0,200}setErrorConCargos\(textoError \? textoError\(result\) : \(result\.error \?\? "Error desconocido"\)\);/);
    expect(alta).toMatch(/\{errorConCargos && \(\s*<p\s*role="alert"\s*data-error-alta-cargos/);
    // La caja se limpia en cada «Guardar» y al cerrar.
    expect(alta).toContain("if (conCargos) setErrorConCargos(null);");
    expect(alta).toMatch(/const setOpen = \(o: boolean\) => \{\s*if \(!o\) setErrorConCargos\(null\);/);
  });

  it("con los cargos no se cierra a medio guardar (el resultado se pinta en el alta)", () => {
    expect(alta).toMatch(/onOpenChange=\{\(o\) => \{\s*\/\/[^\n]*\n\s*if \(!o && conCargos && pending\) return;\s*setOpen\(o\);/);
  });
});
