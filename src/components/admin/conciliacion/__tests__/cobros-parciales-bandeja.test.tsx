/**
 * UN COBRO, VARIOS ABONOS en la bandeja de Conciliación (14-oct-2026, API
 * 0.0.78, invariante 77; spec cobros-varios-abonos D5, D6, D22):
 *  1. la columna «Conciliación» de un abono con UN cobro dice cómo quedó el
 *     COBRO con todos sus abonos («Pago parcial: este abono $1,700 de $3,400
 *     · faltan $1,700 MXN» ámbar / «Completa el cobro junto con 1 abono más»
 *     gris); sin `cobro_conciliacion` (API previo) el marcado de siempre;
 *  2. cada línea de un lote con «· parcial: faltan $X» / «· completa el
 *     cobro (2 abonos)»;
 *  3. el cableado del menú ⋯: «Desvincular este abono del cobro» con la
 *     confirmación de `faltante_sin_este`, el toast con `cobros_liberados`,
 *     la rama «omitido» intacta y el diálogo legado con la guía del API;
 *  4. Paywise: «N depósito(s) … pagan varios cobros (lote)».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CobroConciliacionDeAbono, MovimientoBancario } from "@/types/conciliacion";

vi.mock("@/lib/api/ingresos-browser", () => ({
  registrarIngreso: async () => ({ ok: false, error: "no" }),
  editarIngreso: async () => ({ ok: false, error: "no" }),
  motivoComprobanteIngresoInvalido: () => null,
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  candidatosCobroAction: vi.fn(),
  candidatosReversoAction: vi.fn(),
  clasificarMovimientoAction: vi.fn(),
  crearClasificacionAction: vi.fn(),
  emparejarReversoAction: vi.fn(),
  emparejarReversosAutoAction: vi.fn(),
  gastosCandidatosAction: vi.fn(() => new Promise(() => {})),
  linkMovimientoAction: vi.fn(),
  linkMovimientoCobroAction: vi.fn(),
  linkMovimientoGastosAction: vi.fn(),
  listClasificacionesAction: vi.fn(),
  quitarReversoAction: vi.fn(),
  sugerirMovimientoAction: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  candidatosAbonoAction: vi.fn(() => new Promise(() => {})),
  clasificarAbonoAction: vi.fn(),
  ligarAbonoCobroAction: vi.fn(),
  ligarAbonoCobrosAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
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

const { MovimientosTable } = await import("../movimientos-table");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const MOV_A = "a1700000-0000-4000-8000-00000000000a";
const MOV_B = "b1700000-0000-4000-8000-00000000000b";
const C315 = "c3150000-0000-4000-8000-000000000315";

const conc = (over: Partial<CobroConciliacionDeAbono> = {}): CobroConciliacionDeAbono => ({
  cobro_id: C315,
  folio: 315,
  estado: "PARCIAL",
  neto: 3400,
  monto_vinculado: 1700,
  faltante: 1700,
  sobrante: 0,
  abonos_n: 1,
  faltante_sin_este: 3400,
  abonos: [{ movimiento_id: MOV_A, fecha: "2026-09-15", monto_parte: 1700 }],
  ...over,
});

/** La primera camioneta: $1,700 del 15-sep contra el cobro de $3,400 de la #315. */
const abono = (over: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id: MOV_A,
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-09-15",
  tipo: "ABONO",
  monto: "1700.00",
  descripcion: "SPEI RECIBIDO BEH KAY",
  referencia: null,
  conciliado: true,
  gasto_id: null,
  cobro_id: C315,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-09-16T15:00:00Z",
  cobros_n: 1,
  cobro: {
    monto: "3400",
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    fecha_cobro: "2026-09-15T17:00:00Z",
    vuelo_id: "f3150000-0000-4000-8000-000000000315",
    vuelo: { folio: 315 },
  },
  ...over,
});

const tabla = (rows: MovimientoBancario[]) => renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);

describe("abono con UN cobro: el estado del cobro en la columna «Conciliación»", () => {
  it("PARCIAL: «Pago parcial: este abono $1,700 de $3,400 · faltan $1,700 MXN» en ámbar, dentro de la liga al vuelo", () => {
    const html = tabla([abono({ cobro_conciliacion: conc() })]);
    expect(html).toContain("Cobro de vuelo #315");
    expect(html).toContain('data-estado-cobro="aviso"');
    expect(html).toContain(esc("Pago parcial: este abono $1,700 de $3,400 · faltan $1,700 MXN"));
    expect(html).toContain("text-amber-700");
  });

  it("CONCILIADO con 2 abonos: «Completa el cobro junto con 1 abono más» en gris", () => {
    const html = tabla([
      abono({
        cobro_conciliacion: conc({
          estado: "CONCILIADO",
          monto_vinculado: 3400,
          faltante: 0,
          abonos_n: 2,
          faltante_sin_este: 1700,
          abonos: [
            { movimiento_id: MOV_A, fecha: "2026-09-15", monto_parte: 1700 },
            { movimiento_id: MOV_B, fecha: "2026-09-16", monto_parte: 1700 },
          ],
        }),
      }),
    ]);
    expect(html).toContain('data-estado-cobro="neutro"');
    expect(html).toContain("Completa el cobro junto con 1 abono más");
  });

  it("API previo (sin `cobro_conciliacion`) o un abono que cubre solo su cobro: el marcado de siempre", () => {
    const previo = tabla([abono()]);
    expect(previo).not.toContain("data-estado-cobro");
    expect(previo).toContain('title="Ver el vuelo cuyo cobro se concilió"');
    const solo = tabla([abono({ cobro_conciliacion: conc({ estado: "CONCILIADO", faltante: 0, monto_vinculado: 3400 }) })]);
    expect(solo).toBe(previo);
  });
});

describe("lote (un abono, varios cobros): el estado de cada cobro en su línea", () => {
  it("«· completa el cobro (2 abonos)» y «· parcial: faltan $10,000 MXN» (ámbar)", () => {
    const html = tabla([
      abono({
        id: MOV_B,
        monto: "69000.00",
        cobro_id: null,
        cobro: null,
        cobros_n: 2,
        cobros: [
          { cobro_id: "c278", monto_parte: 18001, vuelo_id: "v278", folio: 278, cliente: "Villanueva", moneda: "MXN", cobro_estado: "CONCILIADO", cobro_faltante: 0, cobro_abonos_n: 2 },
          { cobro_id: "c279", monto_parte: 50999, vuelo_id: "v279", folio: 279, cliente: "Villanueva", moneda: "MXN", cobro_estado: "PARCIAL", cobro_faltante: 10000, cobro_abonos_n: 1 },
        ],
        cobros_suma: 69000,
        cobros_diferencia: 0,
      }),
    ]);
    expect(html).toContain("2 cobros · $69,000 MXN");
    // Revisión 15-oct-2026: el estado va en SU renglón (sin `truncate`): pegado a la
    // secundaria de 240 px, la elipsis se comía lo que falta.
    expect(html).toMatch(/<span data-estado-cobro-lote="neutro" class="block text-\[10px\] text-muted-foreground">Completa el cobro \(2 abonos\)<\/span>/);
    expect(html).toMatch(
      /<span data-estado-cobro-lote="aviso" class="block text-\[10px\] text-amber-700 dark:text-amber-300">Parcial: faltan \$10,000 MXN<\/span>/,
    );
    // La secundaria cortada lleva el texto completo en su `title` (con el estado).
    expect(html).toMatch(/class="block max-w-\[240px\] truncate text-\[10px\] text-muted-foreground" title="[^"]* · parcial: faltan \$10,000 MXN"/);
    expect(html).toMatch(/title="[^"]* · completa el cobro \(2 abonos\)"/);
    // Dentro de la secundaria truncada ya no va el estado.
    expect(html).not.toMatch(/truncate[^>]*>[^<]*<span data-estado-cobro-lote/);
  });
});

describe("cableado del menú ⋯ y del diálogo legado (fuente)", () => {
  const src = leer("../movimiento-actions.tsx");

  it("«Desvincular este abono del cobro» solo con OTROS abonos (y fuera de un lote), con la confirmación del API", () => {
    expect(src).toContain("const abonoConOtros = vinculadoACobro && !vinculadoASobre && abonoConOtrosAbonosDelCobro(movimiento);");
    expect(src).toMatch(/abonoConOtros\s*\?\s*MENU_DESVINCULAR_ESTE_ABONO\s*:\s*"Desvincular cobro"/);
    expect(src).toMatch(/abonoConOtros\s*\?\s*TITULO_DESVINCULAR_ESTE_ABONO\s*:\s*"¿Desvincular este cobro\?"/);
    expect(src).toContain("textoConfirmarDesvincularAbono(movimiento.cobro_conciliacion, {");
    // «vuelve a «Cobros sin banco»» SOLO si su método sale ahí (revisión 15-oct-2026: BillPocket no).
    expect(src).toContain("textoCobroVuelveASinBanco(movimiento.cobro_conciliacion, movimiento.cobro?.metodo_cobro)");
    expect(src).toContain("textoConfirmarDesvincularCobros(cobrosDelLote, movimiento.cobros)");
    expect(src).toContain("textoExtraDesvincularLote(movimiento)");
    // El toast dice cómo quedó cada cobro DESPUÉS (`cobros_liberados`); sin la llave, el de siempre.
    expect(src).toContain('(toastDesvinculoCobros(r.data?.cobros_liberados, movimiento) ?? "Cobro desvinculado")');
    // La confirmación (regla permanente) sigue antes de desligar.
    expect(src).toContain("onClick={() => setConfirmarDesvincular(true)}");
  });

  it("la rama «omitido» del lote de Conciliación queda intacta y DESPUÉS de la de vinculado", () => {
    const vinculado = src.indexOf(") : vinculadoAGastoOCobro ? (");
    const omitido = src.indexOf(") : omitido ? (");
    expect(vinculado).toBeGreaterThan(0);
    expect(omitido).toBeGreaterThan(vinculado);
    expect(src).toContain("{MENU_QUITAR_OMISION}");
  });

  it("diálogo legado «Vincular cobro»: la guía del API sin salidas de un clic, el parcial confirmado y el botón apagado con razón", () => {
    expect(src).toContain("guiaAlVincular(opcionSeleccionada, { monto: movimiento.monto, moneda: monedaAbono }, { conAcciones: false })");
    expect(src).toMatch(/if \(!confirmado && guiaSeleccionado\?\.parcial && confirmacionParcial\) \{\s*setConfirmarParcial\(true\);\s*return;/);
    expect(src).toContain("<ConfirmacionVincular");
    expect(src).toContain("disabled={pending || guiaSeleccionado?.bloquea === true}");
    expect(src).toContain("onClick={() => vincular()}");
    // Un 409 (excede, comisión…) se dice con el texto del API y la lista se vuelve a pedir.
    expect(src).toMatch(/const e = mensajeErrorVincularCobros\(r\);[\s\S]*?setSeleccion\(""\);\s*cargarCandidatos\(\);/);
  });

  it("revisión 15-oct-2026: la confirmación del parcial va DENTRO del DialogContent de «Vincular cobro» (Esc cierra solo la de arriba)", () => {
    const dialogo = src.slice(src.indexOf("<DialogTitle>Vincular cobro</DialogTitle>"));
    const fin = dialogo.indexOf("</DialogContent>");
    expect(fin).toBeGreaterThan(0);
    expect(dialogo.slice(0, fin)).toContain("<ConfirmacionVincular");
    expect(src.match(/<ConfirmacionVincular\b/g)?.length).toBe(1);
  });

  it("revisión 15-oct-2026: ninguna server action de vincular / desvincular cae al error boundary (`.catch(sinConexion)`)", () => {
    expect(src).toContain("await ligarAbonoIngresoAction(movimiento.id, null).catch(sinConexion)");
    expect(src).toContain("await linkMovimientoCobroAction(movimiento.id, null).catch(sinConexion)");
    expect(src).toContain("await linkMovimientoAction(movimiento.id, null).catch(sinConexion)");
    expect(src).toMatch(/: \{ cobro_id: seleccionado\.cobro_id \},\s*\)\.catch\(sinConexion\);/);
    expect(src).toContain("await quitarReversoAction(movimiento.id).catch(sinConexion)");
    expect(src).toMatch(/candidatosCobroAction\(movimiento\.id, VENTANA_DIAS\)\s*\.catch\(sinConexion\)/);
    // Sin respuesta: «No se pudo confirmar si…» (jamás «no se desvinculó») y la página al día.
    expect(src).toContain("toast.error(MSG_DESVINCULO_INCIERTO);");
    expect(src).toContain('} else if (r.status === 409 || r.code === "SIN_CONEXION") {');
    expect(src).toContain("if (e.incierto) refrescarAlCerrarLinkRef.current = true;");
    // Ningún `await` de server action desnudo dentro de startTransition.
    expect(src).not.toMatch(/await (ligarAbonoIngresoAction|linkMovimientoCobroAction|linkMovimientoAction|quitarReversoAction)\([^)]*\);/);
  });

  it("la bandeja no toca su búsqueda ni el useMemo de columnas: «parcial» entra por `textoBusquedaCobros`", () => {
    const t = leer("../movimientos-table.tsx");
    expect(t).toContain("textoBusquedaCobros(m)");
    expect(t).toContain("<LigaCobroDeVuelo m={m} />");
    expect(t).toContain("lineaCobroUnicoBandeja(m)");
  });

  it("Paywise: la línea de los depósitos en lote sale de la fuente única", () => {
    const p = leer("../paywise-auditoria.tsx");
    expect(p).toContain("textoPaywiseEnLote(r.movimientos_en_lote)");
  });
});
