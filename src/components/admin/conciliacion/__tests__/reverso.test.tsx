/**
 * Cargo devuelto ↔ su devolución en la pantalla de Conciliación (30-sep-2026).
 *
 * Pregunta del cliente: «¿Cómo puedo conciliar los cargos reembolsados?».
 * Qué se custodia aquí:
 *  1. la fila conciliada por reverso dice CON QUÉ se emparejó («Reverso de un
 *     cargo» + «devuelve el cargo del 21 sep · ASUR CANCUN» / «devuelto el 23
 *     sep · …») y el tooltip «Conciliado con: …»;
 *  2. un ABONO pendiente que dice «CARGO INDEBIDO» lleva la pista «Parece
 *     devolución»; con un API previo (sin aditivos) la fila clasificada se
 *     pinta como siempre;
 *  3. el CABLEADO: el menú ofrece «Es la devolución de un cargo» / «Lo
 *     devolvió el banco» a los pendientes y SOLO «Quitar emparejamiento» a
 *     los emparejados; quitar sale únicamente de la confirmación; el lote
 *     confirma antes; el botón vive junto a «Cruzar pendientes» (Conciliación
 *     e Ingresos) y el «Es el reverso» de Ingresos ya empareja.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoBancario } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
// Las server actions (red, sesión) no son parte de este test.
vi.mock("@/app/admin/conciliacion/actions", () => ({
  candidatosCobroAction: vi.fn(),
  candidatosReversoAction: vi.fn(),
  clasificarMovimientoAction: vi.fn(),
  crearClasificacionAction: vi.fn(),
  emparejarReversoAction: vi.fn(),
  emparejarReversosAutoAction: vi.fn(),
  linkMovimientoAction: vi.fn(),
  linkMovimientoCobroAction: vi.fn(),
  listClasificacionesAction: vi.fn(),
  quitarReversoAction: vi.fn(),
  sugerirMovimientoAction: vi.fn(),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  clasificarAbonoAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
}));

const { MovimientosTable } = await import("../movimientos-table");
const { EmparejarDevolucionesButton } = await import("../emparejar-devoluciones-button");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "00000000-0000-4000-8000-000000000000",
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-09-21",
  tipo: "CARGO",
  monto: "825.13",
  descripcion: "ASUR CANCUN",
  referencia: null,
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-09-29T15:00:00Z",
  ...m,
});

const CARGO_PAREADO = mov({
  id: "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3",
  conciliado: true,
  clasificacion_id: "c1",
  clasificacion: { nombre: "Reverso de un cargo" },
  notas: "Devuelto el 23-09 · CARGO INDEBIDO 21 SEP 35552",
  revertido_por: {
    id: "405466de-599b-4c0e-b2df-203133282530",
    fecha: "2026-09-23",
    descripcion: "CARGO INDEBIDO 21 SEP 35552",
  },
});
const ABONO_PAREADO = mov({
  id: "405466de-599b-4c0e-b2df-203133282530",
  tipo: "ABONO",
  fecha: "2026-09-23",
  descripcion: "CARGO INDEBIDO 21 SEP 35552",
  conciliado: true,
  clasificacion_id: "c1",
  clasificacion: { nombre: "Reverso de un cargo" },
  reverso_de_id: "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3",
  reverso_de: { id: "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3", fecha: "2026-09-21", descripcion: "ASUR CANCUN" },
});
const ABONO_PENDIENTE = mov({
  id: "35d5c5eb-ebf6-4959-a22a-e5282cde329d",
  tipo: "ABONO",
  fecha: "2026-09-23",
  descripcion: "CARGO INDEBIDO 21 SEP 35554",
});
const CLASIFICADO_API_PREVIO = mov({
  id: "11111111-1111-4111-8111-111111111111",
  tipo: "ABONO",
  descripcion: "TRASPASO",
  conciliado: true,
  clasificacion_id: "c2",
  clasificacion: { nombre: "Traspaso entre cuentas" },
  notas: "Regla: TRASPASO",
});

function tabla(rows: MovimientoBancario[]): string {
  return renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);
}

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("la tabla", () => {
  it("la pareja dice con qué se concilió cada lado", () => {
    const html = tabla([ABONO_PAREADO, CARGO_PAREADO]);
    expect(html).toContain("Reverso de un cargo");
    expect(html).toContain("devuelve el cargo del 21 sep · ASUR CANCUN");
    expect(html).toContain("devuelto el 23 sep · CARGO INDEBIDO 21 SEP 35552");
    expect(html).toContain(
      "Conciliado con: Reverso de un cargo · devuelve el cargo del 21 sep · ASUR CANCUN",
    );
  });

  it("un ABONO pendiente que dice «CARGO INDEBIDO» lleva la pista «Parece devolución»", () => {
    const html = tabla([ABONO_PENDIENTE]);
    expect(html).toContain("Pendiente");
    expect(html).toContain("Parece devolución");
    expect(html).toContain("«Es la devolución de un cargo»");
  });

  it("API previo (sin aditivos): la fila clasificada queda como antes", () => {
    const html = tabla([CLASIFICADO_API_PREVIO]);
    expect(html).toContain("Traspaso entre cuentas");
    expect(html).toContain("automático");
    expect(html).not.toContain("devuelve el cargo");
    expect(html).not.toContain("Parece devolución");
  });
});

describe("«Emparejar devoluciones»", () => {
  it("el botón se pinta con su texto, su explicación y cursor-pointer", () => {
    const html = renderToStaticMarkup(<EmparejarDevolucionesButton cuentaId={CUENTA} />);
    expect(html).toContain("Emparejar devoluciones");
    expect(html).toContain("CARGO INDEBIDO, DEVOLUCIÓN, REVERSO");
    expect(html).toContain("cursor-pointer");
  });

  it("confirma ANTES: la acción solo sale de «Continuar»", () => {
    const src = leer("../emparejar-devoluciones-button.tsx");
    expect(src.match(/emparejarReversosAutoAction\(/g)?.length).toBe(1);
    expect(src).toMatch(/const correr = \(\) => \{[\s\S]*emparejarReversosAutoAction\(/);
    expect(src.match(/onClick=\{correr\}/g)?.length).toBe(1);
    expect(src).toContain("CONFIRMAR_EMPAREJAR_AUTO");
  });

  it("vive junto a «Cruzar pendientes» en Conciliación y en Ingresos → Por conciliar", () => {
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    const iAuto = page.indexOf("<AutoMatchButton");
    const iEmp = page.indexOf("<EmparejarDevolucionesButton");
    const iIa = page.indexOf("<SugerenciasLoteDialog");
    expect(iAuto).toBeGreaterThan(-1);
    expect(iEmp).toBeGreaterThan(iAuto);
    expect(iEmp).toBeLessThan(iIa);
    const ingresos = leer("../../ingresos/abonos-pendientes-table.tsx");
    expect(ingresos.indexOf("<EmparejarDevolucionesButton")).toBeGreaterThan(
      ingresos.indexOf("<AutoMatchButton"),
    );
  });
});

describe("cableado del menú y del diálogo", () => {
  const acciones = leer("../movimiento-actions.tsx");

  it("pendientes: «Es la devolución de un cargo» (abono) / «Lo devolvió el banco» (cargo)", () => {
    expect(acciones).toContain("esAbono ? MENU_ABONO_DEVOLUCION : MENU_CARGO_DEVUELTO");
    expect(acciones).toMatch(/\{openReverso && \(\s*<ReversoDialog/);
  });

  it("emparejados: SOLO «Quitar emparejamiento», antes del menú de clasificación", () => {
    const iPareja = acciones.indexOf(") : emparejadoPorReverso ? (");
    const iClasif = acciones.indexOf(") : clasificado ? (");
    expect(iPareja).toBeGreaterThan(-1);
    expect(iPareja).toBeLessThan(iClasif);
    const rama = acciones.slice(iPareja, iClasif);
    expect(rama).toContain("MENU_QUITAR_REVERSO");
    expect(rama).not.toContain("abrirClasificar");
  });

  it("quitar sale únicamente de la confirmación (que dice que los dos vuelven a pendiente)", () => {
    expect(acciones.match(/quitarReversoAction\(/g)?.length).toBe(1);
    expect(acciones.match(/quitarReverso\(\);/g)?.length).toBe(1);
    expect(acciones).toMatch(/<AlertDialogAction[\s\S]{0,200}quitarReverso\(\);/);
    expect(acciones).toContain("textoConfirmarQuitarReverso(movimiento)");
  });

  it("todo ítem del menú lleva cursor-pointer", () => {
    // Cada `<DropdownMenuItem …>…</DropdownMenuItem>` completo (el `=>` de
    // un onClick rompería un `[^>]*`).
    const items = acciones.split("<DropdownMenuItem").slice(1).map((t) => t.split("</DropdownMenuItem>")[0]);
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) expect(it).toContain("cursor-pointer");
  });

  it("el diálogo: un fallo de lectura NUNCA se pinta como «no hay candidatos»; empareja una sola vez", () => {
    const dialogo = leer("../reverso-dialog.tsx");
    expect(dialogo.indexOf(") : errorCarga ? (")).toBeLessThan(dialogo.indexOf(") : sinCandidatos ? ("));
    expect(dialogo.match(/emparejarReversoAction\(/g)?.length).toBe(1);
    expect(dialogo).toContain("Reintentar");
    const botones = dialogo.split("<button").slice(1).map((t) => t.split("</button>")[0]);
    expect(botones.length).toBe(2);
    for (const b of botones) expect(b).toContain("cursor-pointer");
  });

  it("revisión adversaria: solo a un movimiento PENDIENTE de verdad (no a uno marcado conciliado)", () => {
    const i = acciones.indexOf("esAbono ? MENU_ABONO_DEVOLUCION : MENU_CARGO_DEVUELTO");
    const guarda = acciones.lastIndexOf("movimiento.conciliado !== true &&", i);
    expect(guarda).toBeGreaterThan(-1);
    expect(i - guarda).toBeLessThan(300);
  });

  it("revisión adversaria: el API sin emparejado al pulsar «Emparejar» deja la salida de siempre", () => {
    const dialogo = leer("../reverso-dialog.tsx");
    // Desde un CARGO la lista sale aunque el API no empareje: el choque llega
    // al pulsar «Emparejar» y el diálogo pasa al error (con «Clasificar solo
    // este…»), no se queda en un toast.
    expect(dialogo).toMatch(/if \(e\.apiSinRuta\) \{[\s\S]{0,400}setCarga\(\{ error: e \}\);/);
    expect(dialogo).toContain("candidatoPreseleccionado(candidatos)");
    expect(dialogo).toContain("ayudaClasificarSoloUno(movimiento.tipo)");
  });

  it("Ingresos: «Es la devolución de un cargo» empareja (ya no clasifica solo el abono)", () => {
    const ingresos = leer("../../ingresos/abono-acciones.tsx");
    expect(ingresos).toContain("MENU_ABONO_DEVOLUCION");
    expect(ingresos).toMatch(/accion === "reverso" && \(\s*<ReversoDialog/);
    expect(ingresos).not.toContain('clasificarAbonoAction(abono.id, "REVERSO")');
  });
});
