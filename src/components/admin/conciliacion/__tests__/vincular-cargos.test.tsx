/**
 * «Vincular a un gasto…» con VARIOS cargos (14-oct-2026, API 0.0.77,
 * invariante 76):
 *  1. el diálogo pintado al abrir (sin DOM: `renderToStaticMarkup` con los
 *     primitivos de diálogo pasados de largo): título, descripción, los
 *     cargos (sin una suma del panel: la suma es la del API), «Buscando…»,
 *     el botón «Vincular los 2 cargos» y SIN «Créalo por $X» mientras el API
 *     no sumó (no se sabe por cuánto) o sin los catálogos del alta;
 *  2. sus piezas con la respuesta del API: encabezado con la suma DEL API,
 *     avisos ámbar (cargos con su propio gasto, cuentas distintas), la guía
 *     CUBRE/PARCIAL/EXCEDE con su color, un radio por gasto, el vacío con los
 *     gastos del mismo monto que no entraron y el error con «Reintentar»
 *     (jamás el vacío) y «Quitar…»;
 *  3. la barra con «Vincular a un gasto…» (nunca apagado: el motivo se ve);
 *  4. el cableado por regex: `next/dynamic` sin SSR y montado solo al abrir,
 *     UN cargo ⇒ el «Vincular gasto» de siempre, cada acción con
 *     `.catch(sinConexion)`, sin `revalidatePath`, éxito ⇒ limpiar + cerrar +
 *     UN refresh, sin AlertDialog extra (el diálogo ES la confirmación) y
 *     `cursor-pointer` en todo lo que se pulsa;
 *  5. paso 4, «¿No está el gasto? Créalo por $X»: el paso previo pintado
 *     (posibles duplicados —jamás «ninguno» con la lectura caída—, la casilla
 *     bloqueada hasta leerlos, la nota de la IA, el aviso de fechas) y el
 *     cableado del alta ANIDADA con `conciliarConMovimientos`,
 *     `clientRequestId` (una llave por sesión), `textoExito` y `textoError`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALIAS_CUENTAS, CUENTA_GASTOS, MONEDA_CUENTAS, filasConOmision } from "./seleccion.fixtures";
import { resumenSeleccion } from "@/lib/admin/conciliacion-seleccion";
import { textoExcluidosCandidatos } from "@/lib/admin/conciliacion-lote";
import {
  TEXTO_DUPLICADOS_SUMA_NO_LEIDOS,
  avisoFechasCargos,
  estadoDuplicadosSuma,
  type EstadoDuplicadosSuma,
} from "@/lib/admin/conciliacion-cargos-gasto";
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

const { VincularCargosGastoDialog, CargosDelLote, ListaGastosPorSuma, PasoCrearGastoSuma } = await import(
  "../vincular-cargos-gasto-dialog"
);
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

const CATALOGOS = {
  aircraft: [{ id: "e1a85e5b-9eaa-4367-9920-68d5d78883e8", matricula: "N621TX", combustible: "TURBOSINA" as const }],
  providers: [],
};

const dialogo = (movs: MovimientoBancario[] = CARGOS, extra: { catalogosGasto?: typeof CATALOGOS } = {}) =>
  renderToStaticMarkup(
    <VincularCargosGastoDialog
      movimientos={movs}
      aliasPorCuenta={ALIAS_CUENTAS}
      monedaPorCuenta={MONEDA_CUENTAS}
      open
      onOpenChange={() => {}}
      onVinculados={() => {}}
      onQuitarDeSeleccion={() => {}}
      {...extra}
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

  it("el botón «Vincular los 2 cargos» (nunca apagado sin enviar) y «Cancelar»; SIN «Créalo» mientras el API no sumó", () => {
    const i = html.indexOf("Vincular los 2 cargos</button>");
    expect(i).toBeGreaterThan(-1);
    const boton = html.slice(html.lastIndexOf("<button", i), i);
    expect(boton).toContain("cursor-pointer");
    expect(boton).not.toContain(' disabled=""');
    expect(html).toContain(">Cancelar</button>");
    expect(html).not.toContain("Créalo");
    // Con los catálogos del alta, pero sin la suma del API todavía: no se sabe por cuánto.
    expect(dialogo(CARGOS, { catalogosGasto: CATALOGOS })).not.toContain("Créalo");
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

  it("cada acción con .catch(sinConexion): la lista, los duplicados del paso 4 y la liga; ninguna revalida", () => {
    expect(veces(dlg, "gastosCandidatosDeCargosAction(")).toBe(2);
    expect(veces(dlg, "ligarCargosAGastoAction(")).toBe(1);
    expect(dlg).toMatch(/gastosCandidatosDeCargosAction\(ids, \{ q: busqueda, dias \}\)\s*\.catch\(sinConexion\)/);
    expect(dlg).toMatch(
      /gastosCandidatosDeCargosAction\(ids, \{ q: qDuplicadosSuma\(suma\), dias: DIAS_DUPLICADOS \}\)\s*\.catch\(sinConexion\)/,
    );
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
    // Cuatro refresh en el código: liga con éxito, liga incierta, al cerrar si
    // la tabla quedó vieja y el alta por la suma con éxito.
    expect(veces(dlg, "router.refresh();")).toBe(4);
  });

  it("el diálogo ES la confirmación: sin AlertDialog extra y con el resumen visible antes del botón", () => {
    expect(dlg).not.toContain("alert-dialog");
    expect(dlg).toContain("textoResumenVincularCargos({ n, suma: resumen.suma, moneda: resumen.moneda, gasto: elegidoVigente })");
    expect(dlg.indexOf("{resumenTexto}")).toBeLessThan(dlg.indexOf("botonVincularCargos(n)"));
  });

  it("reutiliza los exports de «Vincular gasto» SIN editarlo", () => {
    expect(dlg).toContain('import { BadgeMedioCandidato, VacioCandidatos } from "@/components/admin/conciliacion/vincular-gasto-dialog";');
    expect(dlg).not.toContain("PUNTO DE ENGANCHE");
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

// ═════════════════ Paso 4: «¿No está el gasto? Créalo por $X» ═════════════════

/** HSBC Pesos 30-sep (prod): C ADMINISTRACION RENTA $649.00 + I.V.A. $103.84 = $752.84. */
const HSBC = "4c4c4c4c-0000-4000-8000-0000000000a1";
const RENTA = "2f95e45b-0000-4000-8000-000000000649";
const IVA = "61baed07-0000-4000-8000-000000000103";
const CARGOS_HSBC = [
  cargo(RENTA, { cuenta_bancaria_id: HSBC, fecha: "2026-09-30", monto: "649.00", descripcion: "C ADMINISTRACION RENTA", referencia: null }),
  cargo(IVA, { cuenta_bancaria_id: HSBC, fecha: "2026-09-30", monto: "103.84", descripcion: "I.V.A.", referencia: null }),
];
const RESUMEN_HSBC: CargosResumen = {
  ids: [RENTA, IVA],
  n: 2,
  suma: 752.84,
  moneda: "MXN",
  fecha_min: "2026-09-30",
  fecha_max: "2026-09-30",
  cuentas: [{ id: HSBC, alias: "HSBC Pesos" }],
  terminacion_comun: null,
};
const listo = (extra: Record<string, unknown> = {}) =>
  estadoDuplicadosSuma(
    {
      ok: true,
      data: {
        cargos: RESUMEN_HSBC,
        ventana: { desde: "2026-06-02", hasta: "2027-01-28" },
        candidatos: [],
        truncado: false,
        cargos_con_candidato_propio: [],
        excluidos: [],
        excluidos_monto: 752.84,
        ...extra,
      },
    },
    752.84,
  );

const paso = (extra: Partial<Parameters<typeof PasoCrearGastoSuma>[0]> & { duplicados?: EstadoDuplicadosSuma } = {}) =>
  renderToStaticMarkup(
    <PasoCrearGastoSuma
      lista={CARGOS_HSBC}
      resumen={RESUMEN_HSBC}
      propios={[]}
      aliasPorCuenta={{ [HSBC]: "HSBC Pesos" }}
      monedaPorCuenta={{ [HSBC]: "MXN" }}
      duplicados={listo()}
      confirmado={false}
      onConfirmado={() => {}}
      onReintentar={() => {}}
      onQuitar={() => {}}
      {...extra}
    />,
  );
const casilla = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? "";

describe("paso 4 · el paso previo «Crear el gasto con la suma»", () => {
  it("los cargos con la SUMA DEL API, la nota de la IA, la casilla con la suma y la nota al pie", () => {
    const h = paso();
    expect(h).toContain("2 cargos de HSBC Pesos · suman $752.84 MXN · 30 sep 2026");
    expect(h).toContain("30 sep · C ADMINISTRACION RENTA");
    expect(h).toContain("Posibles duplicados (mismo monto, ±120 días)");
    expect(h).toContain("La IA revisa un cargo a la vez: con varios cargos, revisa tú la lista.");
    expect(h).toContain("Revisé la lista y este gasto NO está registrado: crearlo por $752.84 y vincularle los 2 cargos.");
    expect(h).toContain(
      "Al guardar se registra el gasto y se vinculan los 2 cargos en un solo paso: si algo falla, no se registra nada.",
    );
    // Mismo día: sin aviso de fechas.
    expect(h).not.toContain("data-aviso-fechas-cargos");
  });

  it("sin duplicados (lectura completa, CON `excluidos`): el vacío de siempre y la casilla habilitada", () => {
    const h = paso();
    expect(h).toContain(esc("No hay ningún gasto con este monto en ±120 días (ni en efectivo, ni ya conciliado)."));
    const c = casilla(h);
    expect(c).toContain("cursor-pointer");
    expect(c).not.toContain('disabled=""');
  });

  it("mientras se revisan: «Buscando…» y la casilla BLOQUEADA (nunca el vacío)", () => {
    const h = paso({ duplicados: estadoDuplicadosSuma(null, 752.84) });
    expect(h).toContain("Buscando gastos con el mismo monto…");
    expect(h).not.toContain("No hay ningún gasto");
    expect(casilla(h)).toContain('disabled=""');
  });

  it("la lectura caída: su texto con «Reintentar» y la casilla BLOQUEADA (jamás «no hay ninguno»)", () => {
    const h = paso({ duplicados: estadoDuplicadosSuma({ ok: false, code: "SIN_CONEXION", error: "x" }, 752.84) });
    expect(h).toContain(TEXTO_DUPLICADOS_SUMA_NO_LEIDOS);
    expect(h).toMatch(/data-duplicados-error=""[\s\S]*?<button type="button" class="[^"]*cursor-pointer[^"]*">[\s\S]*?Reintentar<\/button>/);
    expect(h).not.toContain("No hay ningún gasto");
    expect(casilla(h)).toContain('disabled=""');
  });

  it("un cargo que ya no está pendiente: el texto del API y «Quitar ese cargo de la selección»", () => {
    const h = paso({
      duplicados: estadoDuplicadosSuma(
        { ok: false, code: "MOVIMIENTO_NO_PENDIENTE", status: 409, error: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente.", details: { movimientos: [{ id: IVA }] } },
        752.84,
      ),
    });
    expect(h).toContain(">Quitar ese cargo de la selección</button>");
  });

  it("con un duplicado del MISMO monto: su ficha; los del monto en efectivo van debajo, en ámbar", () => {
    const h = paso({
      duplicados: listo({
        candidatos: [
          gasto("aaaa0000-0000-4000-8000-000000000752", { monto: 752.84, faltante: 752.84, categoria: "OPERACIONES", fecha: "2026-09-29" }),
        ],
        excluidos: [
          {
            motivo: "EFECTIVO_U_OTRO_MEDIO",
            n: 1,
            gastos: [
              {
                id: "e0e0e0e0-0000-4000-8000-000000000752",
                fecha_gasto: "2026-09-29",
                monto: 752.84,
                moneda: "MXN",
                medio_pago: "EFECTIVO",
                categoria: "OPERACIONES",
                vuelo_folio: null,
                vuelo_id: null,
              },
            ],
          },
        ],
      }),
    });
    expect(veces(h, "data-duplicado-suma")).toBe(1);
    expect(h).toContain("Operaciones · $752.84 MXN · 29 sep 2026");
    expect(h).toContain("en efectivo");
    expect(h).not.toContain("No hay ningún gasto");
  });

  it("sin duplicados bancarios pero con uno del monto en EFECTIVO: el aviso ámbar, sin el «no hay ninguno… ni en efectivo»", () => {
    const h = paso({
      duplicados: listo({
        excluidos: [
          {
            motivo: "EFECTIVO_U_OTRO_MEDIO",
            n: 1,
            gastos: [
              {
                id: "e0e0e0e0-0000-4000-8000-000000000752",
                fecha_gasto: "2026-09-29",
                monto: 752.84,
                moneda: "MXN",
                medio_pago: "EFECTIVO",
                categoria: "OPERACIONES",
                vuelo_folio: null,
                vuelo_id: null,
              },
            ],
          },
        ],
      }),
    });
    expect(h).toContain("en efectivo");
    expect(h).not.toContain("No hay ningún gasto con este monto");
    expect(casilla(h)).not.toContain('disabled=""');
  });

  it("cargos con su propio gasto (lo dice el API): el ámbar del paso «crear»", () => {
    const h = paso({ propios: [{ id: IVA, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 }] });
    expect(h).toContain(
      esc("1 de los cargos tiene un gasto que cuadra solo: quizá ya está capturado por separado; vincúlalo uno por uno en vez de crear uno nuevo."),
    );
  });

  it("cargos de días distintos: el aviso de que la fecha quedó en el último pago", () => {
    const h = paso({ resumen: { ...RESUMEN_HSBC, fecha_min: "2026-08-10", fecha_max: "2026-08-12" } });
    expect(h).toContain(esc(avisoFechasCargos("2026-08-10", "2026-08-12") ?? "?"));
    expect(h).toMatch(/data-aviso-fechas-cargos=""[^>]*class="[^"]*amber/);
  });

  it("todo lo que se pulsa lleva cursor-pointer", () => {
    for (const h of [paso(), paso({ duplicados: estadoDuplicadosSuma({ ok: false, error: "fetch failed" }, 752.84) })]) {
      for (const b of h.match(/<button[^>]*>/g) ?? []) expect(b).toContain("cursor-pointer");
      expect(h).toMatch(/<label[^>]*class="flex cursor-pointer items-start/);
    }
  });
});

describe("paso 4 · cableado del alta ANIDADA (regex sobre los fuentes)", () => {
  const dlg = leer("../vincular-cargos-gasto-dialog.tsx");
  const tabla = leer("../movimientos-table.tsx");

  it("«Créalo por $X» solo con los catálogos y la SUMA DEL API; la tabla le pasa los catálogos", () => {
    expect(dlg).toMatch(
      /\{p\.catalogosGasto && resumen && !unSolo \? \(\s*<button[\s\S]*?onClick=\{abrirCrear\}[\s\S]*?\{botonAbrirCrearSuma\(resumen\.suma, resumen\.moneda\)\}/,
    );
    expect(tabla).toMatch(/<VincularCargosGastoDialog[\s\S]{0,300}catalogosGasto=\{catalogosGasto\}/);
  });

  it("el alta de SIEMPRE con next/dynamic sin SSR, precargada al entrar al paso", () => {
    expect(dlg).toMatch(
      /dynamic\(\s*\(\) => import\("@\/components\/admin\/expenses\/expense-create-dialog"\)\.then\(\(m\) => m\.ExpenseCreateDialog\),\s*\{ ssr: false \},?\s*\)/,
    );
    expect(dlg).toContain("void precargarAlta().catch(() => undefined);");
  });

  it("el alta recibe los cargos, la llave, el aviso de éxito y el texto de error; al crear, cierra TODO y UN refresh", () => {
    expect(dlg).toMatch(
      /<ExpenseCreateDialog[\s\S]*?abierto=\{crearAbierto\}[\s\S]*?prefill=\{prefill\}[\s\S]*?titulo=\{tituloCrearSuma\(n\)\}[\s\S]*?contexto=\{contextoCrearSuma\(resumen, p\.aliasPorCuenta\)\}[\s\S]*?onCreado=\{trasCrearSuma\}[\s\S]*?conciliarConMovimientos=\{ids\}[\s\S]*?clientRequestId=\{llave\}[\s\S]*?textoExito=\{textoExitoCrearSuma\}[\s\S]*?textoError=\{textoErrorAlta\}/,
    );
    expect(dlg).toContain("prefillGastoDesdeCargos(lista, resumen, p.aliasPorCuenta)");
    expect(dlg).toMatch(
      /const trasCrearSuma = \(\) => \{\s*setCrearAbierto\(false\);\s*p\.onVinculados\?\.\(\[\.\.\.ids\]\);\s*refrescarAlCerrarRef\.current = false;\s*p\.onOpenChange\(false\);\s*router\.refresh\(\);/,
    );
  });

  it("UNA llave por sesión del diálogo (nace al entrar al paso y se repite en cada «Guardar»)", () => {
    expect(dlg).toContain("if (llave === null) setLlave(uuidV4());");
    expect(veces(dlg, "setLlave(")).toBe(1);
    expect(dlg).toMatch(/typeof crypto\.randomUUID === "function"\) return crypto\.randomUUID\(\);/);
  });

  it("el error del alta: refresh al cerrar si la tabla quedó vieja y, si pudo quedar un gasto, se releen duplicados y lista", () => {
    expect(dlg).toMatch(
      /const textoErrorAlta = \(r: ResultadoAccionLote\): string => \{\s*const e = mensajeErrorCrearSuma\(r\);\s*if \(e\.refrescar\) refrescarAlCerrarRef\.current = true;\s*if \(e\.releer && resumen\) \{\s*setRecarga\(\(x\) => x \+ 1\);\s*cargarDuplicados\(resumen\.suma\);/,
    );
    // Cada lectura de duplicados pide volver a marcar la casilla (se confirma sobre lo que se VE).
    expect(dlg).toMatch(/setDup\(\{ idsClave: deIds, r: null \}\);\s*setConfirmado\(false\);/);
  });

  it("«Crear el gasto» nunca se apaga: el clic dice por qué; la casilla queda bloqueada hasta leer los duplicados", () => {
    expect(dlg).toMatch(/const motivo = motivoNoCrearSuma\(\{ confirmado, duplicados \}\);\s*if \(motivo\) \{\s*setAviso\(motivo\);/);
    expect(dlg).toMatch(/<Button type="button" className="cursor-pointer gap-1\.5" onClick=\{crear\}>/);
    expect(dlg).toContain('disabled={dup.tipo !== "listo"}');
  });

  it("quitar cargos (cambia la suma) regresa a la lista y descarta los duplicados leídos", () => {
    expect(dlg).toMatch(/dupRef\.current \+= 1;\s*setDup\(null\);\s*setPaso\("lista"\);\s*setConfirmado\(false\);\s*setCrearAbierto\(false\);/);
  });
});
