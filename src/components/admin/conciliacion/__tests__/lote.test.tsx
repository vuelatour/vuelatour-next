/**
 * 1 CARGO ↔ N GASTOS en la pantalla de Conciliación (2-oct-2026, API 0.0.52).
 *
 * Caso real: los SPEI de SAESA del 24-sep pagan 2 o 3 facturas a la vez
 * (8,404.20 = 3 × 2,801.40). Qué se custodia aquí:
 *  1. la columna «Conciliación» de un cargo con VARIOS gastos: «3 gastos ·
 *     $8,404.20» + hasta 3 líneas con su liga + «y N más» + «diferencia
 *     $0.01»; sin `gastos[]` (skew) dice «3 gastos conciliados» y JAMÁS
 *     «Pendiente»; con UNA parte el marcado es IDÉNTICO al de hoy;
 *  2. el diálogo nuevo (render estático): lista con buscador, ventana,
 *     «Vincular» apagado sin marcados, IA dentro de la lista;
 *  3. el CABLEADO por regex sobre el fuente: el menú del lote confirma antes
 *     de desligar, el diálogo se monta como `ReversoDialog`, el lote viaja
 *     solo con 2+, las vetadas nunca viajan, el error va antes que el vacío,
 *     «Reintentar», el turno del pedido y el cursor en las casillas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoBancario, MovimientoGasto } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
// Las server actions (red, sesión) no son parte de este test.
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
  clasificarAbonoAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
}));
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

const { MovimientosTable } = await import("../movimientos-table");
const { VincularGastoDialog } = await import("../vincular-gasto-dialog");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "c5819d4b-6a3e-4f43-9a5f-0d1b6f6a0001",
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-09-24",
  tipo: "CARGO",
  monto: "8404.20",
  descripcion: "SPEI ENVIADO SAESA",
  referencia: null,
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-09-30T15:00:00Z",
  ...m,
});

const parte = (folio: number, monto: string, extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: `a${folio}0000-0000-4000-8000-000000000${folio}`,
  monto,
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-14",
  vuelo_id: `f${folio}0000-0000-4000-8000-000000000${folio}`,
  vuelo: { folio },
  proveedor: null,
  lugar: null,
  notas_primera_linea: "Pago VIP SAESA",
  monto_parte: monto,
  ...extra,
});

function tabla(rows: MovimientoBancario[]): string {
  return renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);
}

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const cuenta = (html: string, texto: string) => html.split(texto).length - 1;

describe("columna «Conciliación» con un lote", () => {
  const LOTE_3 = mov({
    conciliado: true,
    gastos_n: 3,
    gastos: [parte(315, "2801.40"), parte(319, "2801.40"), parte(326, "2801.40")],
    gastos_suma: 8404.2,
    gastos_diferencia: 0,
  });

  it("3 partes: «3 gastos · $8,404.20», una liga por gasto y nada de «Pendiente»", () => {
    const html = tabla([LOTE_3]);
    expect(html).toContain("3 gastos · $8,404.20");
    expect(html).toContain("Operaciones · $2,801.40 · vuelo #315");
    expect(html).toContain("Operaciones · $2,801.40 · vuelo #326");
    expect(cuenta(html, 'title="Ver el gasto con el que se concilió"')).toBe(3);
    expect(html).toContain(`href="/admin/flights/${parte(319, "1").vuelo_id}"`);
    expect(html).toContain("Pago VIP SAESA");
    expect(html).not.toContain("y 0 más");
    expect(html).not.toContain("diferencia $");
    expect(html).not.toContain("Pendiente");
  });

  it("5 partes: solo 3 líneas + «y 2 más»", () => {
    const html = tabla([
      mov({
        monto: "11640.44",
        conciliado: true,
        gastos_n: 5,
        gastos: [
          parte(315, "2801.40"),
          parte(319, "2801.40"),
          parte(326, "2801.40"),
          parte(330, "1118.12"),
          parte(331, "1118.12"),
        ],
      }),
    ]);
    expect(html).toContain("5 gastos · $");
    expect(cuenta(html, 'title="Ver el gasto con el que se concilió"')).toBe(3);
    expect(html).toContain("y 2 más");
  });

  it("el centavo de SAESA: «diferencia $0.01»", () => {
    const html = tabla([
      mov({
        monto: "4462.75",
        conciliado: true,
        gastos_n: 2,
        gastos: [parte(318, "2231.37"), parte(322, "2231.37")],
        gastos_suma: 4462.74,
        gastos_diferencia: "0.01",
      }),
    ]);
    expect(html).toContain("2 gastos · $4,462.74");
    expect(html).toContain("diferencia $0.01");
  });

  it("skew de deploy: gastos_n 3 sin gastos[] ⇒ «3 gastos conciliados», sin ligas y sin «Pendiente»", () => {
    const html = tabla([mov({ conciliado: true, gastos_n: 3, gasto: null, gastos: undefined })]);
    expect(html).toContain("3 gastos conciliados");
    expect(html).toContain('title="detalle no disponible: recarga"');
    expect(html).not.toContain("Pendiente");
    expect(html).not.toContain("/admin/flights/");
  });

  it("UNA parte: el marcado es IDÉNTICO al de hoy (con o sin los aditivos del API 0.0.52)", () => {
    const g = parte(321, "2231.38", { proveedor: { nombre: "SAESA" } });
    const hoy = mov({ id: "11111111-1111-4111-8111-111111111111", monto: "2231.38", conciliado: true, gasto_id: g.id, gasto: g });
    const nuevo = { ...hoy, gastos_n: 1, gastos: [g], gastos_suma: 2231.38, gastos_diferencia: 0 };
    const htmlHoy = tabla([hoy]);
    expect(tabla([nuevo])).toBe(htmlHoy);
    expect(htmlHoy).toContain("Operaciones · $2,231.38");
    expect(htmlHoy).toContain("vuelo #321");
    expect(htmlHoy).not.toContain("1 gasto");
  });
});

describe("el diálogo nuevo (render estático, sin red)", () => {
  it("buscador, ventana, «Vincular» apagado sin marcados e IA dentro de la lista", () => {
    const html = renderToStaticMarkup(
      <VincularGastoDialog movimiento={mov({})} gastos={[]} open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Vincular gasto");
    expect(html).toContain("Cargo de $8,404.20");
    expect(html).toContain("Gastos candidatos · ±30 días");
    expect(html).toContain("Ampliar a 120 días");
    expect(html).toContain('placeholder="Busca por monto (2801.40), proveedor o nota"');
    expect(html).toContain("Buscando gastos candidatos…");
    expect(html).toContain("Sugerir con IA");
    expect(html).toContain("±30 días del cargo");
    // Sin marcados el botón está apagado y dice solo «Vincular».
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Vincular<\/button>/);
    // Nunca se pinta «no hay gastos» mientras se busca.
    expect(html).not.toContain("No hay gastos bancarios pendientes");
  });

  it("abierto desde «Sugerir con IA»: consulta a la IA de entrada", () => {
    const html = renderToStaticMarkup(
      <VincularGastoDialog movimiento={mov({})} gastos={[]} conIa open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Consultando a la IA…");
    expect(html).not.toContain(">Sugerir con IA<");
  });
});

describe("cableado del menú y del diálogo", () => {
  const acciones = leer("../movimiento-actions.tsx");
  const dialogo = leer("../vincular-gasto-dialog.tsx");

  it("ligado a gasto = tieneGastoLigado (un lote trae gasto_id NULL)", () => {
    expect(acciones).toContain("const vinculadoAGastoOCobro = tieneGastoLigado(movimiento) || vinculadoACobro;");
    expect(acciones).not.toContain("movimiento.gasto_id != null || vinculadoACobro");
  });

  it("menú del lote: «Desvincular los N gastos» y SOLO tras confirmar (linkMovimientoAction(id, null))", () => {
    expect(acciones).toContain("menuDesvincularGastos(gastosDelLote)");
    expect(acciones).toContain("tituloDesvincularGastos(gastosDelLote)");
    expect(acciones).toContain("textoConfirmarDesvincularGastos(gastosDelLote)");
    expect(acciones).toContain("toastDesvinculoGastos(gastosDelLote)");
    // El menú solo ABRE la confirmación; desligar sale del AlertDialogAction.
    expect(acciones).toMatch(/onClick=\{\(\) => setConfirmarDesvincular\(true\)\}/);
    expect(acciones.match(/desvincular\(\);/g)?.length).toBe(1);
    expect(acciones).toMatch(/<AlertDialogAction[\s\S]{0,200}desvincular\(\);/);
    expect(acciones).toContain("await linkMovimientoAction(movimiento.id, null)");
    // Si falla, el lote se explica en palabras del operador (un 502 no pinta «Bad Gateway»).
    expect(acciones).toMatch(/\} else if \(conLote\) \{[\s\S]{0,160}toast\.error\(mensajeErrorBusquedaGastos\(r\)\);/);
  });

  it("el diálogo nuevo se monta como ReversoDialog (solo al abrir) y el de ABONO sigue", () => {
    expect(acciones).toMatch(/\{openVincularGasto && \(\s*<VincularGastoDialog/);
    expect(acciones).toContain("Vincular cobro");
    expect(acciones).toContain("linkMovimientoCobroAction(");
    // El CARGO ya no usa la lista precargada en el diálogo de cobros.
    expect(acciones).not.toContain("opcionesGastoCandidatos");
    expect(acciones).not.toContain("sugerirMovimientoAction");
  });

  it("todo ítem del menú lleva cursor-pointer", () => {
    const items = acciones.split("<DropdownMenuItem").slice(1).map((t) => t.split("</DropdownMenuItem>")[0]);
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) expect(it).toContain("cursor-pointer");
  });

  it("el lote viaja UNA vez y solo con 2+; con uno, el PATCH de siempre", () => {
    expect(dialogo.match(/linkMovimientoGastosAction\(/g)?.length).toBe(1);
    expect(dialogo).toMatch(/ids\.length >= 2\s*\?\s*await linkMovimientoGastosAction\(movimiento\.id, ids, \{ justificacion \}\)/);
    // La justificación (6-oct-2026) solo viaja con un gasto no bancario marcado.
    expect(dialogo).toMatch(/:\s*await linkMovimientoAction\(movimiento\.id, ids\[0\], \{ justificacion \}\)/);
  });

  it("las vetadas (otra moneda, cruzado) se filtran antes de viajar", () => {
    expect(dialogo).toContain("const ids = idsParaVincular(marcados, monedaCuenta);");
    expect(dialogo).toContain("bloqueoDeFila(c, monedaCuenta, marcados)");
    expect(dialogo).toContain("disabled={bloqueo != null}");
    expect(dialogo).toContain('"cursor-not-allowed opacity-60"');
  });

  it("lo que dice el botón es lo que se liga: un vetado entre varios ⇒ no viaja nada", () => {
    const iVetados = dialogo.indexOf("const vetados = textoVetadosAlVincular(marcados, monedaCuenta);");
    const iLlamada = dialogo.indexOf("await linkMovimientoGastosAction(");
    expect(iVetados).toBeGreaterThan(-1);
    expect(iLlamada).toBeGreaterThan(iVetados);
    expect(dialogo).toMatch(/if \(vetados\) \{\s*toast\.error\(vetados\);\s*return;\s*\}/);
  });

  it("la IA preselecciona solo sin marcados y conoce la moneda de la cuenta (monedaRef)", () => {
    expect(dialogo).toContain("monedaRef.current = r.data.movimiento.moneda ?? null;");
    expect(dialogo).toContain("setMarcados((prev) => marcadosTrasSugerencia(prev, ficha, monedaRef.current));");
    expect(dialogo).not.toContain("bloqueoDeFila(ficha, null");
    expect(dialogo).not.toMatch(/\[\.\.\.prev, ficha\]/);
    expect(dialogo).toContain("textoSugeridoSinMarcar(");
  });

  it("el botón NUNCA se apaga por la suma local (solo por la justificación obligatoria)", () => {
    expect(dialogo).toContain("disabled={pending || marcados.length === 0 || faltaJustificacion}");
    expect(dialogo).not.toMatch(/disabled=\{[^}]*cuadra/);
  });

  it("el error va ANTES que el vacío, con «Reintentar»", () => {
    const iError = dialogo.indexOf('estado.tipo === "error" ?');
    const iVacio = dialogo.indexOf('estado.tipo === "vacio_sin_q"');
    expect(iError).toBeGreaterThan(-1);
    expect(iVacio).toBeGreaterThan(iError);
    expect(dialogo).toContain("{BOTON_REINTENTAR}");
  });

  it("turno del pedido (pedidoRef) y debounce del buscador", () => {
    expect(dialogo).toMatch(/const turno = \+\+pedidoRef\.current;/);
    expect(dialogo).toMatch(/if \(turno !== pedidoRef\.current\) return;/);
    expect(dialogo).toContain("DEBOUNCE_BUSQUEDA_MS");
  });

  it("casillas: label con cursor-pointer, input con accent-brand-600; botones con cursor-pointer", () => {
    expect(dialogo).toContain('type="checkbox"');
    expect(dialogo).toContain("accent-brand-600");
    expect(dialogo).toContain('"cursor-pointer hover:bg-muted/50"');
    const botones = dialogo.split("<button").slice(1).map((t) => t.split("</button>")[0]);
    expect(botones.length).toBeGreaterThanOrEqual(3);
    for (const b of botones) expect(b).toContain("cursor-pointer");
  });

  it("con el API previo: la lista precargada de siempre (un solo gasto) y el aviso", () => {
    expect(dialogo).toContain("esApiSinLote(respuesta)");
    // El aviso dice POR QUÉ: falta el API o falta la migración (503).
    expect(dialogo).toContain("mensajeApiSinLote(");
    expect(dialogo).toContain("{avisoRespaldo}");
    expect(dialogo).toContain("setAvisoSinLote(e.titulo);");
    expect(dialogo).toMatch(/<SearchableSelect[\s\S]{0,120}options=\{opcionesRespaldo\}/);
    expect(dialogo).toContain("linkMovimientoAction(movimiento.id, seleccionUnica)");
  });

  it("textos: el diálogo no redacta frases a mano (salen de conciliacion-lote)", () => {
    expect(dialogo).not.toMatch(/>\s*Vincular \d/);
    expect(dialogo).not.toContain("Gastos candidatos ·");
    expect(dialogo).not.toContain("Quedó pendiente:");
  });
});
