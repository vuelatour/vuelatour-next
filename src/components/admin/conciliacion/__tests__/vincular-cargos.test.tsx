/**
 * «Vincular a un gasto…» con VARIOS cargos (14-oct-2026, API 0.0.77,
 * invariante 76):
 *  1. el diálogo pintado al abrir (sin DOM: `renderToStaticMarkup` con los
 *     primitivos de diálogo pasados de largo): título, descripción, los
 *     cargos (sin una suma del panel: la suma es la del API), «Buscando…»,
 *     el botón «Vincular los 2 cargos» y SIN «Créalo» (la fase siguiente);
 *  2. sus piezas con la respuesta del API: encabezado con la suma DEL API,
 *     avisos ámbar (cargos con su propio gasto, cuentas distintas), la guía
 *     CUBRE/PARCIAL/EXCEDE con su color, un radio por gasto, el vacío con los
 *     gastos del mismo monto que no entraron y el error con «Reintentar»
 *     (jamás el vacío) y «Quitar…»;
 *  3. la barra con «Vincular a un gasto…» (nunca apagado: el motivo se ve);
 *  4. el cableado por regex: `next/dynamic` sin SSR y montado solo al abrir,
 *     UN cargo ⇒ el «Vincular gasto» de siempre, cada acción UNA vez y con
 *     `.catch(sinConexion)`, sin `revalidatePath`, éxito ⇒ limpiar + cerrar +
 *     UN refresh, sin AlertDialog extra (el diálogo ES la confirmación),
 *     `cursor-pointer` en todo lo que se pulsa y el punto de enganche de
 *     «Créalo por la suma».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALIAS_CUENTAS, CUENTA_GASTOS, MONEDA_CUENTAS, filasConOmision } from "./seleccion.fixtures";
import { resumenSeleccion } from "@/lib/admin/conciliacion-seleccion";
import { textoExcluidosCandidatos } from "@/lib/admin/conciliacion-lote";
import type { CandidatoGastoPorSuma, CargosResumen, MovimientoBancario } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  gastosCandidatosDeCargosAction: vi.fn(() => new Promise(() => {})),
  ligarCargosAGastoAction: vi.fn(),
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

const { VincularCargosGastoDialog, CargosDelLote, ListaGastosPorSuma } = await import("../vincular-cargos-gasto-dialog");
const { BarraSeleccionMovimientos } = await import("../barra-seleccion-movimientos");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const veces = (texto: string, aguja: string) => texto.split(aguja).length - 1;

const A = "402ee224-0000-4000-8000-000000000001";
const B = "a78ae15d-0000-4000-8000-000000000002";
const EJE = "3e3e3e3e-0000-4000-8000-0000000000e1";

/** Caso C (prod, 03-ago, GASTOS GNRAL): $120.00 + $280.00 que pagan la comida de $400.00. */
const cargo = (id: string, extra: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id,
  cuenta_bancaria_id: CUENTA_GASTOS,
  fecha: "2026-08-03",
  tipo: "CARGO",
  monto: "120.00",
  descripcion: "MERPAGO*AGREGADOR",
  referencia: "0025830577",
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-08-04T15:00:00Z",
  omision: null,
  ...extra,
});
const CARGOS = [cargo(A), cargo(B, { monto: "280.00", descripcion: "REST EL TACO LOCO" })];

const RESUMEN: CargosResumen = {
  ids: [A, B],
  n: 2,
  suma: 400,
  moneda: "MXN",
  fecha_min: "2026-08-03",
  fecha_max: "2026-08-03",
  cuentas: [{ id: CUENTA_GASTOS, alias: "GASTOS GNRAL" }],
  terminacion_comun: null,
};

const gasto = (id: string, extra: Partial<CandidatoGastoPorSuma> = {}): CandidatoGastoPorSuma => ({
  id,
  fecha: "2026-08-03",
  monto: 400,
  moneda: "MXN",
  categoria: "COMIDA",
  medio_pago: "TARJETA_CORP",
  vuelo_folio: 104,
  matricula: "N621TX",
  capturado_por: "Itzi",
  nota: "[CARGA-EXCEL-AGO28] Viáticos",
  monto_vinculado: 0,
  faltante: 400,
  no_bancario: false,
  resultado: "CUBRE",
  faltante_tras: 0,
  excedente: 0,
  ...extra,
});
const G_CUBRE = gasto("dd5fcb2b-0000-4000-8000-000000000400");
const G_PARCIAL = gasto("aaaa0001-0000-4000-8000-000000000450", {
  categoria: "OPERACIONES",
  monto: 450,
  faltante: 450,
  fecha: "2026-08-04",
  vuelo_folio: null,
  matricula: null,
  nota: null,
  capturado_por: null,
  resultado: "PARCIAL",
  faltante_tras: 50,
});
const G_EXCEDE = gasto("aaaa0002-0000-4000-8000-000000000380", {
  categoria: "TAXI",
  monto: 380,
  faltante: 380,
  fecha: "2026-08-02",
  vuelo_folio: null,
  matricula: null,
  nota: null,
  capturado_por: null,
  resultado: "EXCEDE",
  excedente: 20,
});

const dialogo = (movs: MovimientoBancario[] = CARGOS) =>
  renderToStaticMarkup(
    <VincularCargosGastoDialog
      movimientos={movs}
      aliasPorCuenta={ALIAS_CUENTAS}
      monedaPorCuenta={MONEDA_CUENTAS}
      open
      onOpenChange={() => {}}
      onVinculados={() => {}}
      onQuitarDeSeleccion={() => {}}
    />,
  );

const lista = (extra: Partial<Parameters<typeof ListaGastosPorSuma>[0]> = {}) =>
  renderToStaticMarkup(
    <ListaGastosPorSuma
      idBuscar="buscar"
      nombreGrupo="grupo"
      texto=""
      onTexto={() => {}}
      suma={400}
      dias={30}
      onAmpliar={() => {}}
      estado={{ tipo: "lista", texto: "" }}
      filas={[G_CUBRE, G_PARCIAL, G_EXCEDE]}
      elegidoId={null}
      onElegir={() => {}}
      errorLista={null}
      onReintentar={() => {}}
      onQuitar={() => {}}
      avisos={[]}
      disabled={false}
      {...extra}
    />,
  );

describe("el diálogo al abrir (antes de la respuesta del API)", () => {
  const html = dialogo();

  it("título, descripción y los cargos (sin una suma del panel: la suma es la del API)", () => {
    expect(html).toContain("Vincular 2 cargos a un gasto");
    expect(html).toContain("Los cargos se suman y pagan UN gasto (una factura cobrada en varios cargos).");
    expect(html).toContain("2 cargos seleccionados");
    expect(html).not.toContain("suman $");
    expect(html).toContain("03 ago · MERPAGO*AGREGADOR · ref 0025830577");
    expect(html).toContain("03 ago · REST EL TACO LOCO · ref 0025830577");
    expect(html).toContain(">$120.00</span>");
    expect(html).toContain(">$280.00</span>");
    expect(html).toContain('aria-label="Cargos que se vincularán"');
  });

  it("mientras el API busca lo dice; el buscador y la ventana de ±30 días con «Ampliar a ±120 días»", () => {
    expect(html).toContain("Buscando los gastos que pagaron los cargos…");
    expect(html).not.toContain("Ningún gasto");
    expect(html).toContain("Gastos sin conciliar · ±30 días de los cargos");
    expect(html).toContain('placeholder="Busca por monto, proveedor o nota"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain("Ampliar a ±120 días");
  });

  it("el botón «Vincular los 2 cargos» (nunca apagado sin enviar) y «Cancelar»; SIN «Créalo» todavía", () => {
    const i = html.indexOf("Vincular los 2 cargos</button>");
    expect(i).toBeGreaterThan(-1);
    const boton = html.slice(html.lastIndexOf("<button", i), i);
    expect(boton).toContain("cursor-pointer");
    expect(boton).not.toContain(' disabled=""');
    expect(html).toContain(">Cancelar</button>");
    expect(html).not.toContain("Créalo");
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toContain("cursor-pointer");
  });

  it("con UN cargo (quitaron los demás): «Con un solo cargo usa «Vincular gasto»…» y no se busca nada", () => {
    const h = dialogo([CARGOS[0]]);
    expect(h).toContain(esc("Con un solo cargo usa «Vincular gasto» desde su menú ⋯."));
    expect(h).not.toContain("Buscando");
  });
});

describe("los cargos con la respuesta del API", () => {
  const pinta = (extra: Partial<Parameters<typeof CargosDelLote>[0]> = {}) =>
    renderToStaticMarkup(
      <CargosDelLote
        lista={CARGOS}
        resumen={RESUMEN}
        propios={[]}
        aliasPorCuenta={ALIAS_CUENTAS}
        monedaPorCuenta={MONEDA_CUENTAS}
        {...extra}
      />,
    );

  it("el encabezado con la SUMA DEL API; sin avisos cuando el API no ve nada raro", () => {
    const h = pinta();
    expect(h).toContain("2 cargos de GASTOS GNRAL · suman $400.00 MXN · 03 ago 2026");
    expect(h).not.toContain("cuadra solo");
    expect(h).not.toContain("No se pudo revisar");
    expect(h).not.toContain("Los cargos son de");
  });

  it("cargo con su PROPIO gasto (lo dice el API): aviso ámbar y la marca junto a ese cargo", () => {
    const h = pinta({ propios: [{ id: B, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 }] });
    expect(h).toMatch(/data-aviso-candidato-propio=""[^>]*class="[^"]*amber/);
    expect(h).toContain(
      esc("1 de los cargos tiene un gasto que cuadra solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por uno desde su menú ⋯."),
    );
    expect(veces(h, "data-cargo-con-propio")).toBe(1);
    expect(h).toContain("REST EL TACO LOCO · ref 0025830577<span data-cargo-con-propio=");
    expect(h).toContain(" · tiene un gasto que cuadra solo</span>");
  });

  it("sin el dato (`null`): nota gris, jamás un «ninguno» falso", () => {
    const h = pinta({ propios: null });
    expect(h).toContain("No se pudo revisar si algún cargo tiene su propio gasto.");
    expect(h).not.toContain("data-aviso-candidato-propio");
  });

  it("cuentas distintas: aviso ámbar y la cuenta en cada renglón", () => {
    const movs = [CARGOS[0], { ...CARGOS[1], cuenta_bancaria_id: EJE }];
    const h = pinta({
      lista: movs,
      resumen: { ...RESUMEN, cuentas: [{ id: CUENTA_GASTOS, alias: "GASTOS GNRAL" }, { id: EJE, alias: "EJE SCOTIA" }] },
      aliasPorCuenta: { ...ALIAS_CUENTAS, [EJE]: "EJE SCOTIA" },
      monedaPorCuenta: { ...MONEDA_CUENTAS, [EJE]: "MXN" },
    });
    expect(h).toContain("2 cargos de 2 cuentas · suman $400.00 MXN · 03 ago 2026");
    expect(h).toMatch(/data-aviso-varias-cuentas=""[^>]*class="[^"]*amber[^"]*">Los cargos son de 2 cuentas \(GASTOS GNRAL, EJE SCOTIA\)\.</);
    expect(h).toContain("03 ago · EJE SCOTIA · REST EL TACO LOCO");
  });
});

describe("la lista de gastos con la respuesta del API", () => {
  it("UN radio por gasto (mismo grupo, cursor-pointer) y la guía del `resultado` con su color", () => {
    const h = lista({ elegidoId: G_CUBRE.id });
    const radios = h.match(/<input type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    for (const r of radios) {
      expect(r).toContain('name="grupo"');
      expect(r).toContain("cursor-pointer");
    }
    expect(radios.filter((r) => r.includes('checked=""'))).toHaveLength(1);
    // Nada viene marcado de fábrica, ni el que «Queda cubierto»: elige la persona.
    expect(lista()).not.toContain('checked=""');
    expect(veces(h, '<label data-candidato-suma="" class="flex cursor-pointer')).toBe(3);
    expect(h).toMatch(/data-guia="ok" class="[^"]*emerald[^"]*">Queda cubierto</);
    expect(h).toMatch(/data-guia="aviso" class="[^"]*amber[^"]*">Quedaría parcial: le faltarían \$50\.00</);
    expect(h).toMatch(/data-guia="error" class="[^"]*destructive[^"]*">Se pasa por \$20\.00: el sistema no lo acepta</);
  });

  it("la ficha de cada gasto: etiqueta de siempre + «capturó …»; el orden es el del API", () => {
    const h = lista();
    expect(h).toContain("Comida · $400.00 MXN · 03 ago 2026");
    expect(h).toContain("[CARGA-EXCEL-AGO28] Viáticos · N621TX · vuelo #104 · capturó Itzi");
    expect(h.indexOf("Queda cubierto")).toBeLessThan(h.indexOf("Quedaría parcial"));
    expect(h.indexOf("Quedaría parcial")).toBeLessThan(h.indexOf("Se pasa por"));
    expect(h).toContain(
      "Gastos bancarios (tarjeta, transferencia, PayWise o pago domiciliado) sin conciliar, en la moneda de los cargos y con fecha ±30 días de los cargos; primero los que la suma cubre.",
    );
  });

  it("vacío: su texto, los gastos del MISMO monto que no entraron (frase de varios cargos) y «Volver a buscar»", () => {
    const avisos = textoExcluidosCandidatos(
      [
        {
          motivo: "EFECTIVO_U_OTRO_MEDIO",
          n: 1,
          gastos: [
            {
              id: "e0e0e0e0-0000-4000-8000-000000000400",
              fecha_gasto: "2026-08-03",
              monto: 400,
              moneda: "MXN",
              medio_pago: "EFECTIVO",
              categoria: "COMIDA",
              vuelo_folio: 104,
              vuelo_id: null,
            },
          ],
        },
      ],
      400,
      { monedaCuenta: "MXN", dias: 30, montoBuscado: 400, variosCargos: true },
    );
    const h = lista({
      estado: { tipo: "vacio_sin_q", texto: "Ningún gasto sin conciliar coincide en ±30 días de los cargos." },
      filas: [],
      avisos,
    });
    expect(h).toContain("Ningún gasto sin conciliar coincide en ±30 días de los cargos.");
    expect(h).toContain("vincúlalo cargo por cargo con su justificación");
    expect(h).not.toContain("Mostrar estos gastos");
    expect(h).toContain(">Volver a buscar</button>");
    expect(h).not.toContain('type="radio"');
  });

  it("con lista pero NINGUNO cubre: los avisos de los que no entraron van debajo de la lista", () => {
    const avisos = [{ motivo: "YA_CONCILIADO", texto: "1 gasto de $400.00 (3 ago) ya está conciliado.", ligas: [], mostrar: null }];
    const h = lista({ filas: [G_PARCIAL, G_EXCEDE], avisos });
    expect(h.indexOf("Se pasa por")).toBeLessThan(h.indexOf("1 gasto de $400.00 (3 ago) ya está conciliado."));
  });

  it("error de la lectura: su texto con «Reintentar» y, si el API nombró cargos, «Quitar…»; JAMÁS el vacío", () => {
    const h = lista({
      estado: { tipo: "error", texto: "No se pudo cargar la lista de gastos: vuelve a intentarlo." },
      filas: [],
      errorLista: {
        texto: "No se pudo cargar la lista de gastos: vuelve a intentarlo.",
        reintentar: true,
        refrescar: false,
        quitarIds: [],
      },
    });
    expect(h).toContain("No se pudo cargar la lista de gastos: vuelve a intentarlo.");
    expect(h).toMatch(/<button type="button" class="[^"]*cursor-pointer[^"]*">[\s\S]*?Reintentar<\/button>/);
    expect(h).not.toContain("Ningún gasto");
    const h2 = lista({
      estado: { tipo: "error", texto: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — …" },
      filas: [],
      errorLista: { texto: "x", reintentar: false, refrescar: true, quitarIds: [B] },
    });
    expect(h2).toContain(">Quitar ese cargo de la selección</button>");
    expect(h2).not.toContain("Reintentar");
  });

  it("el gasto ELEGIDO sigue a la vista aunque la lista esté cargando", () => {
    const h = lista({ estado: { tipo: "cargando", texto: "Buscando «taco»…" }, elegidoId: G_CUBRE.id });
    expect(h).toContain("Buscando «taco»…");
    expect((h.match(/<input type="radio"[^>]*>/g) ?? []).length).toBe(1);
    expect(h).not.toContain("Quedaría parcial");
  });
});

describe("la barra con «Vincular a un gasto…»", () => {
  const barra = (movs: MovimientoBancario[]) =>
    renderToStaticMarkup(
      <BarraSeleccionMovimientos
        vista="lista"
        resumen={resumenSeleccion(movs, MONEDA_CUENTAS)}
        retirados={0}
        onVincular={() => {}}
        onOmitir={() => {}}
        onDeshacer={() => {}}
        onLimpiar={() => {}}
      />,
    );

  it("primero «Vincular a un gasto…», luego «Omitir…» y «Limpiar»; con un abono el motivo se VE y nada se apaga", () => {
    const solo = barra(CARGOS);
    expect(solo.indexOf("Vincular a un gasto…")).toBeGreaterThan(-1);
    expect(solo.indexOf("Vincular a un gasto…")).toBeLessThan(solo.indexOf("Omitir…"));
    expect(solo).not.toContain("deja solo cargos");
    const mezcla = barra([...CARGOS, filasConOmision()[2]]);
    expect(mezcla).toContain("Para vincular a un gasto deja solo cargos: los abonos se concilian desde su menú ⋯ o en Ingresos.");
    expect(mezcla).not.toMatch(/<button[^>]* disabled=""/);
    for (const b of mezcla.match(/<button[^>]*>/g) ?? []) expect(b).toContain("cursor-pointer");
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const dlg = leer("../vincular-cargos-gasto-dialog.tsx");
  const tabla = leer("../movimientos-table.tsx");

  it("la tabla lo carga con next/dynamic SIN SSR y lo monta solo al abrir; con UN cargo, el «Vincular gasto» de siempre", () => {
    expect(tabla).toMatch(
      /dynamic\(\s*\(\) =>\s*import\("@\/components\/admin\/conciliacion\/vincular-cargos-gasto-dialog"\)[\s\S]{0,120}\{ ssr: false \}/,
    );
    expect(tabla).toMatch(/dialogo\?\.tipo === "vincular" && dialogo\.movimientos\.length === 1 && \(\s*<VincularGastoDialog/);
    expect(tabla).toMatch(
      /dialogo\?\.tipo === "vincular" && dialogo\.movimientos\.length >= MIN_CARGOS_A_GASTO && \(\s*<VincularCargosGastoDialog/,
    );
    expect(tabla).toContain('onVincular={() => setDialogo({ tipo: "vincular", movimientos: [...vigentes] })}');
    // El diálogo trabaja con su copia CONGELADA y limpia la selección al vincular.
    expect(tabla).toMatch(/<VincularCargosGastoDialog[\s\S]{0,400}onVinculados=\{limpiarSeleccion\}[\s\S]{0,80}onQuitarDeSeleccion=\{quitarDeSeleccion\}/);
  });

  it("cada acción UNA vez y con .catch(sinConexion); ninguna revalida", () => {
    expect(veces(dlg, "gastosCandidatosDeCargosAction(")).toBe(1);
    expect(veces(dlg, "ligarCargosAGastoAction(")).toBe(1);
    expect(dlg).toMatch(/gastosCandidatosDeCargosAction\(ids, \{ q: busqueda, dias \}\)\s*\.catch\(sinConexion\)/);
    expect(dlg).toMatch(/ligarCargosAGastoAction\(gasto\.id, idsEnvio\)\s*\.catch\(sinConexion\)/);
    expect(dlg).not.toContain("revalidatePath");
    const acciones = leer("../../../../app/admin/conciliacion/actions.ts");
    const nuevas = acciones.slice(acciones.indexOf("// ===== Varios cargos → un gasto"));
    expect(nuevas).toContain("export async function gastosCandidatosDeCargosAction(");
    expect(nuevas).toContain("export async function ligarCargosAGastoAction(");
    expect(nuevas).not.toContain("revalidatePath(");
  });

  it("ligar corre solo con el diálogo abierto y una vez; éxito ⇒ limpiar la selección, cerrar y UN refresh; incierto ⇒ cerrar y refresh", () => {
    expect(dlg).toContain("if (!p.open || enviandoRef.current) return;");
    expect(dlg).toMatch(/p\.onVinculados\?\.\(idsEnvio\);[\s\S]{0,80}p\.onOpenChange\(false\);\s*router\.refresh\(\);/);
    expect(dlg).toMatch(/if \(e\.incierto\) \{[\s\S]{0,200}p\.onOpenChange\(false\);\s*router\.refresh\(\);/);
    // 4xx: la lista se vuelve a pedir sin perder lo elegido.
    expect(dlg).toContain("if (e.recargarLista) setRecarga((x) => x + 1);");
    // Tres refresh en el código: éxito, incierto y al cerrar si la tabla quedó vieja.
    expect(veces(dlg, "router.refresh();")).toBe(3);
  });

  it("el diálogo ES la confirmación: sin AlertDialog extra y con el resumen visible antes del botón", () => {
    expect(dlg).not.toContain("alert-dialog");
    expect(dlg).toContain("textoResumenVincularCargos({ n, suma: resumen.suma, moneda: resumen.moneda, gasto: elegidoVigente })");
    expect(dlg.indexOf("{resumenTexto}")).toBeLessThan(dlg.indexOf("botonVincularCargos(n)"));
  });

  it("reutiliza los exports de «Vincular gasto» SIN editarlo y deja el punto de enganche de «Créalo por la suma»", () => {
    expect(dlg).toContain('import { BadgeMedioCandidato, VacioCandidatos } from "@/components/admin/conciliacion/vincular-gasto-dialog";');
    expect(dlg).toContain("PUNTO DE ENGANCHE del paso 4 (FASE «crear por la suma»)");
    expect(dlg).not.toContain("ExpenseCreateDialog");
  });

  it("todo <button>/<Button> lleva cursor-pointer y ningún texto del operador va escrito a mano", () => {
    for (const src of [dlg, tabla]) {
      const botones = src.split("<button").slice(1).map((t) => t.split("</button>")[0]);
      for (const b of botones) expect(b).toContain("cursor-pointer");
      const Botones = src.split("<Button").slice(1).map((t) => t.split("</Button>")[0]);
      for (const b of Botones) expect(b).toContain("cursor-pointer");
    }
    expect(dlg).not.toMatch(/>\s*Cancelar\s*</);
    expect(dlg).not.toContain("No se vinculó");
    expect(dlg).not.toMatch(/aria-label="[^{]/);
    expect(dlg).toMatch(/<label[\s\S]{0,200}"flex cursor-pointer items-start/);
  });
});
