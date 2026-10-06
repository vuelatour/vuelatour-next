/**
 * «Vincular gasto» con un gasto en EFECTIVO u otro medio no bancario
 * (6-oct-2026, API 0.0.63). Caso real: cargo de $212.00 del 07-sep (ASUR
 * CANCUN) que nadie capturó; se liga al estacionamiento del 28-sep pagado en
 * efectivo y facturado, SIN cambiar su medio de pago (la caja de los pilotos
 * no se mueve) y con la razón por escrito. Qué se custodia aquí:
 *  1. las piezas del diálogo en render estático: el interruptor, la insignia
 *     «Efectivo» de la fila y el campo «¿Por qué…?» (los `useEffect` no corren
 *     en `renderToStaticMarkup`: por eso viven aparte y se prueban directo);
 *  2. la columna «Conciliación»: la insignia junto al gasto ligado, con la
 *     justificación del cargo en el tooltip; sin `medio_pago` (API previo) el
 *     marcado es IDÉNTICO;
 *  3. API previo: el diálogo de siempre (sin interruptor ni campo);
 *  4. el CABLEADO por regex sobre el fuente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { apiOfreceNoBancarios } from "@/lib/admin/conciliacion-no-bancario";
import type { GastoCandidato, MovimientoBancario, MovimientoGasto } from "@/types/conciliacion";

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
  clasificarAbonoAction: vi.fn(),
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

const { BadgeMedioCandidato, CampoJustificacion, InterruptorNoBancarios, VincularGastoDialog } = await import(
  "../vincular-gasto-dialog"
);
const { MovimientosTable } = await import("../movimientos-table");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const cuenta = (html: string, texto: string) => html.split(texto).length - 1;

const G28 = "053fa6f4-2b14-4f17-9713-6f75efde971f";
const V330 = "66bcadba-ded0-48a0-b9fa-d2377cd4b66d";
const LINEA_NOTA =
  "Vinculado a gasto en EFECTIVO del 28-sep-2026 (Taxi / estacionamiento · vuelo #330 · $212.00): Nadie capturó el estacionamiento del 7 de septiembre — Itzi, 06-oct-2026";

/** El cargo real (movimiento 520b2b2f…, 07-sep-2026). */
const mov = (m: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id: "520b2b2f-ab74-4d62-8dd6-d2e0a01a9e9e",
  cuenta_bancaria_id: "76a931e0-7c06-47c6-a574-6c7d4a698c14",
  fecha: "2026-09-07",
  tipo: "CARGO",
  monto: "212.00",
  descripcion: "ASUR CANCUN",
  referencia: null,
  conciliado: true,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-09-30T15:00:00Z",
  ...m,
});

const gasto = (extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: G28,
  monto: "212.00",
  moneda: "MXN",
  categoria: "TAXI",
  fecha_gasto: "2026-09-28",
  proveedor: null,
  vuelo_id: V330,
  vuelo: { folio: 330 },
  ...extra,
});

const tabla = (rows: MovimientoBancario[]) =>
  renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);

describe("el interruptor «Incluir gastos en efectivo y otros medios»", () => {
  it("apagado: switch con su etiqueta (la etiqueta lo enciende) y sin ayuda", () => {
    const html = renderToStaticMarkup(<InterruptorNoBancarios activo={false} onCambiar={() => {}} />);
    expect(html).toMatch(/<label class="[^"]*cursor-pointer[^"]*">/);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(">Incluir gastos en efectivo y otros medios<");
    expect(html).not.toContain("nunca los de bodega");
  });

  it("encendido: dice qué trae y qué pide", () => {
    const html = renderToStaticMarkup(<InterruptorNoBancarios activo onCambiar={() => {}} />);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(
      "También salen los gastos en efectivo o pagados con dinero personal (nunca los de bodega), con su medio de pago a la vista. Para vincular uno hay que escribir por qué; su medio de pago no cambia.",
    );
  });
});

describe("la insignia del candidato", () => {
  const efectivo: GastoCandidato = {
    id: G28,
    fecha_gasto: "2026-09-28",
    monto: 212,
    moneda: "MXN",
    categoria: "TAXI",
    medio_pago: "EFECTIVO",
    no_bancario: true,
  };

  it("«Efectivo» en ámbar con el porqué en el tooltip", () => {
    const html = renderToStaticMarkup(<BadgeMedioCandidato candidato={efectivo} />);
    expect(html).toContain(">Efectivo</span>");
    expect(html).toContain(
      'title="Pagado en efectivo: no pasó por el banco. Se puede vincular escribiendo por qué; su medio de pago no cambia."',
    );
    expect(html).toContain("text-amber-700");
    expect(renderToStaticMarkup(<BadgeMedioCandidato candidato={{ ...efectivo, medio_pago: "PERSONAL_ALE" }} />)).toContain(
      ">Personal Ale</span>",
    );
  });

  it("bancario o API previo (sin `no_bancario`, medio bancario): nada", () => {
    expect(
      renderToStaticMarkup(<BadgeMedioCandidato candidato={{ ...efectivo, medio_pago: "TARJETA_CORP", no_bancario: false }} />),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <BadgeMedioCandidato candidato={{ id: G28, monto: 2801.4, medio_pago: "TRANSFERENCIA" }} />,
      ),
    ).toBe("");
  });
});

describe("el campo «¿Por qué…?»", () => {
  const campo = (valor: string) =>
    renderToStaticMarkup(
      <CampoJustificacion
        id="justif"
        etiqueta="¿Por qué se vincula un gasto en efectivo a este cargo?"
        valor={valor}
        onCambiar={() => {}}
      />,
    );

  it("etiqueta ligada al campo, ejemplo, tope, ayuda y estado", () => {
    const html = campo("");
    expect(html).toMatch(/<label[^>]*for="justif"[^>]*>¿Por qué se vincula un gasto en efectivo a este cargo\?<\/label>/);
    expect(html).toMatch(/<textarea[^>]*id="justif"/);
    expect(html).toContain('maxLength="300"');
    expect(html).toContain('required=""');
    expect(html).toContain('aria-describedby="justif-ayuda justif-estado"');
    expect(html).toContain(
      'placeholder="Ej.: Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28 para no perder la deducción."',
    );
    expect(html).toContain(
      ">No cambia el medio de pago ni la caja del piloto; la razón queda anotada en el cargo y en el gasto.</p>",
    );
    expect(html).toContain(">Obligatoria: de 10 a 300 caracteres.</p>");
  });

  it("corta ⇒ ámbar con cuántas van; lista ⇒ el contador", () => {
    expect(campo("Ticket")).toMatch(/class="[^"]*text-amber-700[^"]*">Escribe al menos 10 caracteres \(van 6\)\.<\/p>/);
    expect(campo("Ticket facturado del 28")).toContain(">23/300</p>");
  });
});

describe("columna «Conciliación»: la insignia del gasto ligado", () => {
  it("1↔1 en efectivo: «Efectivo» dentro de la liga, con la justificación del cargo en el tooltip", () => {
    const html = tabla([mov({ gasto_id: G28, gasto: gasto({ medio_pago: "EFECTIVO" }), notas: LINEA_NOTA })]);
    expect(cuenta(html, ">Efectivo</span>")).toBe(1);
    expect(html).toContain(`title="Vinculado con justificación: ver notas del cargo\n${LINEA_NOTA}"`);
    const liga = html.slice(html.indexOf('title="Ver el gasto con el que se concilió"'));
    expect(liga.slice(0, liga.indexOf("</a>"))).toContain(">Efectivo</span>");
  });

  it("sin la nota en el cargo: el título del contrato a secas", () => {
    const html = tabla([mov({ gasto_id: G28, gasto: gasto({ medio_pago: "EFECTIVO" }) })]);
    expect(html).toContain('title="Vinculado con justificación: ver notas del cargo"');
  });

  it("bancario o API previo (sin `medio_pago`): el marcado es IDÉNTICO al de antes", () => {
    const antes = tabla([mov({ gasto_id: G28, gasto: gasto() })]);
    expect(tabla([mov({ gasto_id: G28, gasto: gasto({ medio_pago: "TARJETA_CORP" }) })])).toBe(antes);
    expect(tabla([mov({ gasto_id: G28, gasto: gasto({ medio_pago: null }) })])).toBe(antes);
    expect(antes).not.toContain("Vinculado con justificación");
  });

  it("lote mixto: solo la línea del gasto en efectivo lleva la insignia", () => {
    const partes = [
      gasto({ id: "a1", medio_pago: "TARJETA_CORP", monto_parte: "212.00", vuelo: { folio: 338 } }),
      gasto({ id: "a2", medio_pago: "EFECTIVO", monto_parte: "212.00" }),
    ];
    const html = tabla([mov({ monto: "424.00", gastos_n: 2, gastos: partes, gastos_suma: 424, notas: LINEA_NOTA })]);
    expect(html).toContain("2 gastos · $424.00");
    expect(cuenta(html, ">Efectivo</span>")).toBe(1);
    expect(html.indexOf(">Efectivo</span>")).toBeGreaterThan(html.indexOf("vuelo #330"));
  });
});

describe("API previo (sin `no_bancario` ni `excluidos`): el diálogo de siempre", () => {
  it("la respuesta del 0.0.62 no enciende nada y el diálogo abre sin interruptor ni campo", () => {
    expect(
      apiOfreceNoBancarios({
        candidatos: [{ id: G28, monto: 212, medio_pago: "TARJETA_CORP" } as GastoCandidato],
      }),
    ).toBe(false);
    const html = renderToStaticMarkup(
      <VincularGastoDialog movimiento={mov({ conciliado: false })} gastos={[]} open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Cargo de $212.00");
    expect(html).not.toContain("Incluir gastos en efectivo");
    expect(html).not.toContain("¿Por qué se vincula");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Vincular<\/button>/);
    expect(html).toContain("Gastos bancarios (tarjeta, transferencia, PayWise) sin conciliar");
  });
});

describe("cableado", () => {
  const dialogo = leer("../vincular-gasto-dialog.tsx");
  const acciones = leer("../movimiento-actions.tsx");
  const tablaSrc = leer("../movimientos-table.tsx");

  it("el interruptor arranca APAGADO y solo aparece cuando el API lo demostró (pegajoso)", () => {
    expect(dialogo).toContain("const [incluirNoBancarios, setIncluirNoBancarios] = useState(false);");
    expect(dialogo).toContain("const [apiNoBancarios, setApiNoBancarios] = useState(false);");
    expect(dialogo).toContain("if (apiOfreceNoBancarios(r.data)) setApiNoBancarios(true);");
    expect(dialogo).toMatch(/\{\(apiNoBancarios \|\| incluirNoBancarios\) && \(\s*<InterruptorNoBancarios/);
    expect(dialogo).toContain("activo={incluirNoBancarios}");
  });

  it("el interruptor recarga la lista con `incluir_no_bancarios` (en la clave del pedido)", () => {
    expect(dialogo).toMatch(/const clave = `[^`]*\$\{incluirNoBancarios \? "nb" : ""\}`;/);
    expect(dialogo).toMatch(/gastosCandidatosAction\(movimiento\.id, \{\s*q: busqueda,\s*dias,\s*incluir_no_bancarios: incluirNoBancarios,\s*\}\)/);
    expect(dialogo).toMatch(/\[movimiento\.id, busqueda, dias, incluirNoBancarios, clave\]/);
  });

  it("apagarlo desmarca los gastos en efectivo y lo dice; «Mostrar estos gastos» lo enciende y los busca", () => {
    expect(dialogo).toMatch(/const cambiarNoBancarios = [\s\S]{0,400}setMarcados\(\(prev\) => marcadosSinNoBancarios\(prev\)\);\s*toast\.info\(textoDesmarcadosNoBancarios\(quitados\)\);/);
    expect(dialogo).toMatch(/const mostrarNoBancarios = [\s\S]{0,200}setIncluirNoBancarios\(true\);/);
    expect(dialogo).toContain("const q = busquedaParaMostrarNoBancarios(busqueda, m.monto);");
    expect(dialogo).toContain("if (m.dias > dias) setDias(m.dias);");
  });

  it("la fila lleva la insignia; el campo aparece con un no bancario marcado y apaga «Vincular»", () => {
    expect(dialogo).toContain("<BadgeMedioCandidato candidato={c} />");
    expect(dialogo).toMatch(/\{hayNoBancarios && \(\s*<CampoJustificacion/);
    expect(dialogo).toContain("etiqueta={etiquetaJustificacion(marcados)}");
    expect(dialogo).toContain(
      "const faltaJustificacion = hayNoBancarios && !estadoJustificacion(textoJustificacion).valida;",
    );
    expect(dialogo).toContain("disabled={pending || marcados.length === 0 || faltaJustificacion}");
  });

  it("la justificación viaja SOLO con un no bancario y se valida antes de la red", () => {
    const iJust = dialogo.indexOf("const justificacion = justificacionParaEnviar(marcados, textoJustificacion) ?? undefined;");
    const iFalta = dialogo.indexOf("toast.error(MSG_FALTA_JUSTIFICACION);");
    const iLlamada = dialogo.indexOf("await linkMovimientoGastosAction(");
    expect(iJust).toBeGreaterThan(-1);
    expect(iFalta).toBeGreaterThan(iJust);
    expect(iLlamada).toBeGreaterThan(iFalta);
    expect(dialogo).toContain("tras(r, justificacion != null);");
    expect(dialogo).toContain("conNotaJustificacion(toastVinculoGastos(r.data), conJustificacion)");
  });

  it("400 JUSTIFICACION_REQUERIDA marca los gastos que dijo el API", () => {
    expect(dialogo).toMatch(/const noBancarios = e\.noBancarios \?\? \[\];[\s\S]{0,300}setMarcados\(\(prev\) => marcadosConNoBancarios\(prev, noBancarios\)\);/);
  });

  it("la nota al pie y el vacío saben si el interruptor está encendido", () => {
    expect(dialogo).toContain("NOTA_VENTANA_CARGO(dias, incluirNoBancarios)");
    expect(dialogo).toContain("incluyeNoBancarios: incluirNoBancarios,\n  });");
  });

  it("el diálogo no redacta estas frases a mano (salen de conciliacion-no-bancario)", () => {
    // Los comentarios pueden nombrarlas; el código, no.
    const codigo = dialogo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("Incluir gastos en efectivo");
    expect(codigo).not.toContain("¿Por qué se vincula");
    expect(codigo).not.toContain("Mostrar estos gastos");
    expect(codigo).not.toMatch(/>\s*Efectivo\s*</);
    expect(codigo).not.toContain("No cambia el medio de pago");
  });

  it("la tabla pinta la insignia del helper (1↔1 y cada línea del lote)", () => {
    expect(tablaSrc).toContain("<BadgeMedioLigado badge={badgeVinculoNoBancario(gasto, m.notas)} />");
    expect(tablaSrc).toContain("<BadgeMedioLigado badge={l.medio} />");
    expect(tablaSrc).toContain("title={badge.titulo}");
  });

  it("desvincular avisa que la justificación se borra (1↔1 y lote)", () => {
    expect(acciones).toContain(
      "const notaDesvincularNoBancario = vinculadoACobro ? null : textoDesvincularNoBancario(gastosLigadosDe(movimiento));",
    );
    expect(acciones).toContain("{notaDesvincularNoBancario && ` ${notaDesvincularNoBancario}`}");
    expect(acciones).toContain("{!vinculadoAIngreso && notaDesvincularNoBancario && ` ${notaDesvincularNoBancario}`}");
  });
});
