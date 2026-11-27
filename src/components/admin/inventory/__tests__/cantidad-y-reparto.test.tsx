/**
 * Inventario, 27-nov-2026 (API 0.0.152) — pedidos de la oficina:
 *  (1) «por error de dedo puse 13, pero ingresaron 12»: «Corregir cantidad»
 *      en las ENTRADAS del cardex (solo ADMIN);
 *  (2) «necesito poner solo 4 matrículas y no todas»: la salida se reparte
 *      entre las matrículas que se marquen;
 *  (3) el ajuste dice lo que hace (SUMA piezas).
 * El runner no tiene DOM: render estático + lectura del fuente (cableado).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  AYUDA_CORREGIR_CANTIDAD,
  ETIQUETA_CORREGIR_CANTIDAD,
  ETIQUETA_REPARTIR,
  HINT_REPARTIR,
  NOTA_AJUSTE_SUMA,
  TITULO_CORREGIR_CANTIDAD,
} from "@/lib/admin/inventario-cantidad";
import type { InventarioMovimiento } from "@/types/inventory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/inventory/actions", () => ({
  createMovimientoAction: vi.fn(),
  corregirCantidadMovimientoAction: vi.fn(),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  entradaDesdeGastoAction: vi.fn(),
  listGastosCandidatosCompraAction: vi.fn(async () => ({
    ok: true,
    data: { data: [], total: 0, truncado: false, ventana: {} },
  })),
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

const { MovimientoDialog } = await import("../movimiento-dialog");
const { CorregirCantidadDialog } = await import("../corregir-cantidad-dialog");
const { CardexTable } = await import("../cardex-table");

const leer = (archivo: string) => readFileSync(path.resolve(__dirname, "..", archivo), "utf8");
const FUENTE_MOV = leer("movimiento-dialog.tsx");
const FUENTE_CANT = leer("corregir-cantidad-dialog.tsx");
const FUENTE_EDICION = leer("cardex-con-edicion.tsx");
const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const baseMov = {
  open: true,
  onOpenChange: () => {},
  itemId: "i1",
  itemNombre: "Aceite 15W-50",
  aircraft: [
    { id: "a1", matricula: "N4142R", activa: true },
    { id: "a2", matricula: "XB-IJP", activa: false },
  ],
  providers: [],
};

function mov(extra: Partial<InventarioMovimiento>): InventarioMovimiento {
  return {
    id: "m1",
    item_id: "i1",
    tipo: "ENTRADA",
    cantidad: 13,
    costo_unitario_usd: 15.091,
    moneda: "MXN",
    costo_unitario_mxn: 281.5,
    tc_usd_mxn: 18.6535,
    aeronave_id: null,
    proveedor_id: null,
    fecha_movimiento: "2026-10-30",
    fecha_orden: null,
    fecha_cargo_banco: null,
    referencia: null,
    notas: null,
    registrado_por: "u1",
    created_at: "2026-10-29T22:08:10.328Z",
    ...extra,
  } as InventarioMovimiento;
}

describe("SALIDA: repartir entre varias matrículas", () => {
  it("la casilla dice «Repartir entre varias matrículas» (ya no «Para todas…») y la lista no aparece hasta marcarla", () => {
    const html = renderToStaticMarkup(<MovimientoDialog {...baseMov} initialTipo="SALIDA" />);
    expect(html).toContain(esc(ETIQUETA_REPARTIR));
    expect(html).toContain(esc(HINT_REPARTIR));
    expect(html).not.toContain("Para todas las matrículas");
    expect(html).not.toContain("data-reparto-matriculas");
  });

  it("cableado: solo se ofrecen las matrículas ACTIVAS y al marcar la casilla arrancan TODAS marcadas", () => {
    expect(FUENTE_MOV).toContain("const flota = useMemo(() => aircraft.filter((a) => a.activa !== false), [aircraft]);");
    expect(FUENTE_MOV).toMatch(/if \(e\.target\.checked\) \{\s*setValue\("aeronave_id", ""\);[\s\S]{0,260}setMarcadas\(flota\.map\(\(a\) => a\.id\)\);/);
    expect(FUENTE_MOV).toContain("{flota.map((a) => (");
  });

  it("cableado: lo marcado decide qué viaja (una ⇒ salida a ese avión; todas ⇒ para_flota sin lista; algunas ⇒ aeronave_ids)", () => {
    expect(FUENTE_MOV).toContain("const destino = destinoDeReparto(flota, marcadas);");
    expect(FUENTE_MOV).toMatch(/if \(destino\.tipo === "UNA"\) \{\s*cuerpo\.para_flota = false;\s*cuerpo\.aeronave_id = destino\.aeronave_id;/);
    expect(FUENTE_MOV).toContain('if (destino.tipo === "ALGUNAS") cuerpo.aeronave_ids = destino.aeronave_ids;');
    // Sin nada marcado no se registra: se dice.
    expect(FUENTE_MOV).toMatch(/if \(destino\.tipo === "ERROR"\) \{\s*toast\.error\(destino\.mensaje\);\s*return;/);
    // El panel no reparte dinero: solo manda la lista.
    expect(FUENTE_MOV).not.toMatch(/monto\s*\/\s*marcadas/);
  });
});

describe("AJUSTE: dice lo que hace", () => {
  it("al elegir Ajuste aparece la nota: SUMA piezas, y para quitar se usa «Corregir cantidad»", () => {
    const html = renderToStaticMarkup(<MovimientoDialog {...baseMov} initialTipo="AJUSTE" />);
    expect(html).toContain("data-nota-ajuste");
    expect(html).toContain(esc(NOTA_AJUSTE_SUMA));
    const entrada = renderToStaticMarkup(<MovimientoDialog {...baseMov} initialTipo="ENTRADA" />);
    expect(entrada).not.toContain("data-nota-ajuste");
  });

  it("la opción ya no se llama «Ajuste / merma (corrección o desecho)»", () => {
    expect(FUENTE_MOV).toContain('{ value: "AJUSTE", label: ETIQUETA_TIPO_AJUSTE },');
    expect(FUENTE_MOV).not.toContain('label: "Ajuste / merma');
  });
});

describe("cardex: «Corregir cantidad» y a quién se repartió", () => {
  const filas = [
    mov({ id: "e13", tipo: "ENTRADA", cantidad: 13 }),
    mov({ id: "s1", tipo: "SALIDA", cantidad: 24, aeronave_id: "a1", aeronave: { matricula: "N4142R" } }),
    mov({ id: "aj", tipo: "AJUSTE", cantidad: 1 }),
  ];

  it("con permiso: el botón sale SOLO en las ENTRADAS", () => {
    const html = renderToStaticMarkup(<CardexTable movimientos={filas} onCorregirCantidad={() => {}} />);
    expect(html.split(ETIQUETA_CORREGIR_CANTIDAD).length - 1).toBe(1);
  });

  it("sin permiso (no ADMIN): no hay botón", () => {
    const html = renderToStaticMarkup(<CardexTable movimientos={filas} />);
    expect(html).not.toContain(ETIQUETA_CORREGIR_CANTIDAD);
  });

  it("una salida repartida entre matrículas ELEGIDAS las nombra; la de toda la flota dice FLOTA", () => {
    const html = renderToStaticMarkup(
      <CardexTable
        movimientos={[
          mov({ id: "f4", tipo: "SALIDA", para_flota: true, matriculas_flota: ["N4142R", "N58BT", "N621TX", "N990GG"] }),
          mov({ id: "f7", tipo: "SALIDA", para_flota: true }),
        ]}
      />,
    );
    expect(html).toContain("N4142R, N58BT, N621TX, N990GG");
    expect(html).toContain(">FLOTA<");
  });

  it("cableado: el wrapper solo ofrece corregir con `puedeCorregirCantidad` y monta el diálogo con `key` por movimiento", () => {
    expect(FUENTE_EDICION).toMatch(/onCorregirCantidad=\{\s*puedeCorregirCantidad\s*\?/);
    expect(FUENTE_EDICION).toMatch(/<CorregirCantidadDialog\s+key=\{corrigiendo\.id\}/);
  });
});

describe("diálogo «Corregir la cantidad de la entrada»", () => {
  const movimiento = {
    id: "e13",
    itemId: "i1",
    itemNombre: "Aceite 15W-50",
    fecha_movimiento: "2026-10-30",
    cantidad: 13,
    unidad: "cuarto (qt)",
  };

  it("enseña la cantidad registrada, explica qué cambia y arranca SIN poder guardar", () => {
    const html = renderToStaticMarkup(
      <CorregirCantidadDialog open onOpenChange={() => {}} movimiento={movimiento} />,
    );
    expect(html).toContain(esc(TITULO_CORREGIR_CANTIDAD));
    expect(html).toContain("data-cantidad-actual");
    expect(html).toContain("13 cuarto (qt)");
    expect(html).toContain(esc(AYUDA_CORREGIR_CANTIDAD));
    // Campo vacío ⇒ el botón de guardar va deshabilitado.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Guardar cantidad<\/button>/);
    expect(html).not.toContain("data-rechazo-cantidad");
  });

  it("cableado: guarda por la action, pinta el rechazo del API DENTRO del diálogo y refresca al terminar", () => {
    expect(FUENTE_CANT).toContain("await corregirCantidadMovimientoAction(movimiento.itemId, movimiento.id, {");
    expect(FUENTE_CANT).toContain("setRechazo(mensajeErrorCantidad(result));");
    expect(FUENTE_CANT).toMatch(/onOpenChange\(false\);\s*router\.refresh\(\);/);
    // El panel no calcula la existencia nueva: la dice el API en el toast.
    expect(FUENTE_CANT).toContain("toastCantidadCorregida(result.data ?? {}, movimiento.unidad)");
  });
});
