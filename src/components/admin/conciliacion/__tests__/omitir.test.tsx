/**
 * «Omitir la conciliación» y «Deshacer la omisión» (14-oct-2026, API 0.0.77):
 *  1. los dos diálogos pintados (sin DOM: `renderToStaticMarkup` con los
 *     primitivos de diálogo pasados de largo): título, resumen, lista,
 *     «Revisando…» al abrir, motivos rápidos, contador, casilla desde 20,
 *     botón y la confirmación de deshacer;
 *  2. el cableado por regex: `next/dynamic` sin SSR, cada acción con
 *     `.catch(sinConexion)` y UNA vez, deshacer SOLO desde
 *     `AlertDialogAction`, la rama `) : omitido ? (` antes del par de
 *     reverso, `{dialogoClasificar}` y `{dialogosOmision}` EXACTAMENTE 2
 *     veces, «Omitir…» solo con el API nuevo y a un pendiente libre,
 *     «Clasificar» sin la canónica y con su error propio de carga, y
 *     `cursor-pointer` en todo lo que se pulsa.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALIAS_CUENTAS, MONEDA_CUENTAS, cargoOmitido, filasConOmision } from "./seleccion.fixtures";
import type { MovimientoBancario } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  revisarOmisionAction: vi.fn(() => new Promise(() => {})),
  omitirMovimientosAction: vi.fn(),
  quitarOmisionAction: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Boton = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  );
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Boton,
    AlertDialogCancel: Boton,
  };
});

const { OmitirMovimientosDialog } = await import("../omitir-movimientos-dialog");
const { QuitarOmisionDialog } = await import("../quitar-omision-dialog");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const veces = (texto: string, aguja: string) => texto.split(aguja).length - 1;

const omitir = (movs: MovimientoBancario[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <OmitirMovimientosDialog
      movimientos={movs}
      aliasPorCuenta={ALIAS_CUENTAS}
      monedaPorCuenta={MONEDA_CUENTAS}
      open
      onOpenChange={() => {}}
      {...extra}
    />,
  );

describe("el diálogo «Omitir la conciliación» al abrir", () => {
  const tres = filasConOmision().slice(0, 3);
  const html = omitir(tres, { onQuitarDeSeleccion: () => {} });

  it("título, descripción, resumen por tipo y moneda y la lista con cuenta y monto", () => {
    expect(html).toContain("Omitir la conciliación de 3 movimientos");
    expect(html).toContain(esc("Dejan de contar como pendientes («Faltan …») sin ligarse a ningún gasto, cobro ni ingreso."));
    expect(html).toContain("3 movimientos · 2 cargos $8.12 MXN · 1 abono $825.13 MXN");
    expect(html).toContain("24 sep · GASTOS GNRAL · IVA - COMISIONES · $1.12 (cargo)");
    expect(html).toContain("23 sep · GASTOS GNRAL · CARGO INDEBIDO 21 SEP 35552 · $825.13 (abono)");
  });

  it("mientras revisa lo dice; el aviso de abonos manda a Ingresos", () => {
    expect(html).toContain("Revisando si alguno tiene un gasto o un cobro que cuadre…");
    expect(html).toContain(esc("1 abono: si es el pago de un cliente, concílialo en Ingresos → «Por conciliar» en vez de omitirlo."));
  });

  it("motivo: los 5 chips con cursor-pointer, el contador y la nota de que ya no se cruza solo", () => {
    for (const s of ["Comisión o IVA del banco", "Traspaso entre cuentas propias", "Duplicado en el estado de cuenta"]) {
      const i = html.indexOf(`>${s}</button>`);
      expect(i, s).toBeGreaterThan(-1);
      expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("cursor-pointer");
    }
    expect(html).toContain(esc("¿Por qué no se concilian? (obligatorio)"));
    expect(html).toContain("Escribe por qué no se concilia (mínimo 10 caracteres).");
    expect(html).toContain(
      "Un movimiento omitido ya no se cruza solo: si después capturas su gasto, deshaz la omisión y vincúlalo.",
    );
  });

  it("el botón dice cuántos; con menos de 20 no hay casilla «Revisé la lista»", () => {
    expect(html).toContain("Omitir 3 movimientos");
    expect(html).not.toContain("Revisé la lista");
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toContain("cursor-pointer");
  });

  it("desde 20: la casilla obligatoria «Revisé la lista: omitir los N movimientos.»", () => {
    const muchos = Array.from({ length: 25 }, (_, i) => ({
      ...tres[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const h = omitir(muchos);
    expect(h).toContain("Revisé la lista: omitir los 25 movimientos.");
    expect(h).toMatch(/<input type="checkbox" class="[^"]*cursor-pointer[^"]*"/);
  });

  it("UNO (desde el menú ⋯): «… de este movimiento» y «Omitir este movimiento»", () => {
    const h = omitir(tres.slice(0, 1));
    expect(h).toContain("Omitir la conciliación de este movimiento");
    expect(h).toContain("Omitir este movimiento");
    expect(h).toContain("1 movimiento · 1 cargo $1.12 MXN");
  });
});

describe("«¿Deshacer la omisión…?»", () => {
  it("la confirmación con el renglón y su motivo; el botón es el de la acción", () => {
    const html = renderToStaticMarkup(
      <QuitarOmisionDialog
        movimientos={[cargoOmitido()]}
        aliasPorCuenta={ALIAS_CUENTAS}
        monedaPorCuenta={MONEDA_CUENTAS}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(html).toContain(esc("¿Deshacer la omisión de este movimiento?"));
    expect(html).toContain(
      esc("Vuelven a «Pendientes» y a contar en «Faltan». De sus notas se quita solo la línea «Omitido de la conciliación…»; lo demás no cambia."),
    );
    expect(html).toContain("24 sep · GASTOS GNRAL · IVA - COMISIONES · $1.12 (cargo)");
    expect(html).toContain("Comisión o IVA del banco");
    expect(html).toMatch(/<button type="button" class="cursor-pointer bg-destructive[^"]*">Deshacer la omisión<\/button>/);
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const dlg = leer("../omitir-movimientos-dialog.tsx");
  const quitar = leer("../quitar-omision-dialog.tsx");
  const tabla = leer("../movimientos-table.tsx");
  const acciones = leer("../movimiento-actions.tsx");

  it("los dos diálogos se cargan con next/dynamic SIN SSR (en la tabla y en el menú ⋯)", () => {
    for (const src of [tabla, acciones]) {
      expect(src).toContain('import dynamic from "next/dynamic";');
      expect(src).toMatch(/dynamic\(\s*\(\) => import\("@\/components\/admin\/conciliacion\/omitir-movimientos-dialog"\)[\s\S]{0,120}\{ ssr: false \}/);
      expect(src).toMatch(/dynamic\(\s*\(\) => import\("@\/components\/admin\/conciliacion\/quitar-omision-dialog"\)[\s\S]{0,120}\{ ssr: false \}/);
      // Montados SOLO al abrirse.
      expect(src).toMatch(/&& \(\s*<OmitirMovimientosDialog/);
      expect(src).toMatch(/&& \(\s*<QuitarOmisionDialog/);
    }
  });

  it("cada acción UNA vez y con .catch(sinConexion): nada lanza al error boundary", () => {
    expect(veces(dlg, "revisarOmisionAction(")).toBe(1);
    expect(veces(dlg, "omitirMovimientosAction(")).toBe(1);
    expect(veces(dlg, "quitarOmisionAction(")).toBe(1);
    expect(veces(quitar, "quitarOmisionAction(")).toBe(1);
    expect(dlg).toMatch(/revisarOmisionAction\(revision\.ids\)\s*\.catch\(sinConexion\)/);
    expect(dlg).toMatch(/omitirMovimientosAction\(\{ ids, motivo, aceptarRiesgoIds: aceptar \}\)\s*\.catch\(sinConexion\)/);
    expect(dlg).toMatch(/quitarOmisionAction\(ids\)\s*\.catch\(sinConexion\)/);
    expect(quitar).toMatch(/quitarOmisionAction\(ids\)\s*\.catch\(sinConexion\)/);
    for (const src of [dlg, quitar]) expect(src).not.toContain("revalidatePath");
  });

  it("omitir corre solo con el diálogo abierto y una vez; tras el éxito, toast con «Deshacer» y UN refresh", () => {
    expect(dlg).toContain("if (!p.open || enviandoRef.current) return;");
    expect(dlg).toMatch(/action: \{ label: BOTON_DESHACER, onClick: \(\) => deshacerDesdeToast\(ids, \(\) => router\.refresh\(\)\) \}/);
    expect(dlg).toMatch(/p\.onOmitidos\?\.\(ids\);[\s\S]{0,120}p\.onOpenChange\(false\);\s*router\.refresh\(\);/);
    // 409 con riesgos: se pintan y se conservan motivo y selección (sin cerrar).
    expect(dlg).toMatch(/if \(e\.riesgos && e\.riesgos\.length > 0\) \{\s*\/\/[^\n]*\n\s*setRiesgosApi\(e\.riesgos\);/);
  });

  it("deshacer SOLO desde AlertDialogAction (con preventDefault) y una vez", () => {
    expect(veces(quitar, "deshacer();")).toBe(1);
    expect(quitar).toMatch(/<AlertDialogAction[\s\S]{0,200}e\.preventDefault\(\);\s*void deshacer\(\);/);
    expect(quitar).toMatch(/<AlertDialogAction[\s\S]{0,400}BOTON_CONFIRMAR_QUITAR_OMISION[\s\S]{0,40}<\/AlertDialogAction>/);
    expect(quitar).toContain("if (!p.open || enviandoRef.current) return;");
  });

  it("menú ⋯: la rama `) : omitido ? (` va ANTES del par de reverso y solo ofrece deshacer", () => {
    const iOmitido = acciones.indexOf(") : omitido ? (");
    const iPareja = acciones.indexOf(") : emparejadoPorReverso ? (");
    expect(iOmitido).toBeGreaterThan(-1);
    expect(iOmitido).toBeLessThan(iPareja);
    const rama = acciones.slice(iOmitido, iPareja);
    expect(rama).toContain("{MENU_QUITAR_OMISION}");
    expect(rama).toContain("setOpenQuitarOmision(true)");
    expect(rama).not.toContain("abrirClasificar");
  });

  it("«Omitir la conciliación…» en el pendiente y en los `extras` del abono, solo con el API nuevo y a un pendiente libre", () => {
    expect(acciones).toContain('const omitible = conOmision && esSeleccionable(movimiento, "lista");');
    expect(veces(acciones, "{MENU_OMITIR}")).toBe(2);
    expect(acciones).toMatch(/\{omitible && \(\s*<DropdownMenuItem onClick=\{\(\) => setOpenOmitir\(true\)\}/);
    expect(acciones).toMatch(/extras=\{\s*<>[\s\S]*?Clasificar \(no es de un vuelo\)[\s\S]*?\{MENU_OMITIR\}[\s\S]*?<\/>\s*\}/);
    // Los diálogos de la fila en los dos caminos, como el de clasificar.
    expect(veces(acciones, "{dialogoClasificar}")).toBe(2);
    expect(veces(acciones, "{dialogosOmision}")).toBe(2);
  });

  it("«Clasificar»: sin la canónica, con su error propio de carga y `esperado` solo con el API nuevo", () => {
    expect(acciones).toMatch(/listClasificacionesAction\(\)\s*\.catch\(sinConexion\)/);
    expect(acciones).toContain(".filter((c) => !esClasificacionOmitida(c.nombre))");
    expect(acciones).toContain("{MSG_CLASIFICACIONES_NO_CARGARON}");
    const iError = acciones.indexOf(") : errorClasificaciones ? (");
    const iVacio = acciones.indexOf("Aún no hay clasificaciones: crea la primera abajo");
    expect(iError).toBeGreaterThan(-1);
    expect(iError).toBeLessThan(iVacio);
    expect(acciones).toMatch(/const esperadoClasificacion = conOmision\s*\?\s*\{ esperado_clasificacion_id: movimiento\.clasificacion_id \?\? null \}\s*:\s*\{\};/);
    expect(veces(acciones, "...esperadoClasificacion,")).toBe(2);
  });

  it("todo <button> y <DropdownMenuItem> de lo nuevo lleva cursor-pointer", () => {
    const barra = leer("../barra-seleccion-movimientos.tsx");
    for (const src of [dlg, quitar, barra, tabla]) {
      // El elemento completo (un `=>` de un onClick rompería un `[^>]*`).
      const botones = src.split("<button").slice(1).map((t) => t.split("</button>")[0]);
      for (const b of botones) expect(b).toContain("cursor-pointer");
      const Botones = src.split("<Button").slice(1).map((t) => t.split("</Button>")[0]);
      for (const b of Botones) expect(b).toContain("cursor-pointer");
    }
    const items = acciones.split("<DropdownMenuItem").slice(1).map((t) => t.split("</DropdownMenuItem>")[0]);
    for (const it of items) expect(it).toContain("cursor-pointer");
  });

  it("ningún texto del operador escrito a mano en los diálogos (salen de los helpers)", () => {
    for (const src of [dlg, quitar]) {
      expect(src).not.toMatch(/>\s*Cancelar\s*</);
      expect(src).not.toContain("Omitido de la conciliación:");
      expect(src).not.toMatch(/aria-label="[^{]/);
    }
  });
});
