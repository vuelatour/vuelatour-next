/**
 * «Vincular a un cobro o ingreso» con el veredicto del API 0.0.78 (UN COBRO,
 * VARIOS ABONOS, invariante 77; spec cobros-varios-abonos D3, D4, D6, D18).
 * Sin DOM (el runner es `node`): las piezas del diálogo se pintan con
 * `renderToStaticMarkup` y el cableado se lee del fuente.
 *  1. la guía de UN cobro: EXCEDE con «Agregar el cobro del vuelo #332» y
 *     «Buscar $977.45»; COMISION_NO_CUADRA con «Corregir la comisión a $X y
 *     vincular» solo con la capacidad; todo con `cursor-pointer`;
 *  2. el botón: apagado CON la razón (title en el envoltorio y la guía como
 *     `aria-describedby`) solo cuando el API rechazaría ESTE abono;
 *     «Vincular como parcial…» habilitado; con 2+ cobros nunca se apaga;
 *  3. la confirmación (AlertDialog): textos del parcial y de la comisión con
 *     el aviso de 15 %; «Cancelar» solo cierra;
 *  4. el cableado: PARCIAL abre la confirmación y NO llama al API; la
 *     comisión viaja SOLO tras confirmar; tras cualquier 409 la lista se
 *     vuelve a pedir sin soltar lo marcado; las actions van envueltas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  guiaAlVincular,
  textoConfirmarCorregirComision,
  textoConfirmarParcial,
  type OpcionAbono,
} from "@/lib/admin/conciliacion-cobros-lote";
import type { AlVincularCobro, CandidatoCobroVuelo } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  candidatosAbonoAction: vi.fn(() => new Promise(() => {})),
  ligarAbonoCobroAction: vi.fn(),
  ligarAbonoCobrosAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
}));
// Base UI pinta el AlertDialog en un portal (no existe en el render del
// server): aquí en línea, abierto o cerrado según `open`.
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Boton = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  );
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-alerta="abierta">{children}</div> : null,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Boton,
    AlertDialogCancel: Boton,
  };
});

const { GuiaVincularAbono, BotonVincularConGuia, ConfirmacionVincular } = await import("../vincular-abono-dialog");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const C315 = "c3150000-0000-4000-8000-000000000315";
const C332 = "c3320000-0000-4000-8000-000000000332";
const C293 = "c2930000-0000-4000-8000-000000000293";

const al = (over: Partial<AlVincularCobro> = {}): AlVincularCobro => ({
  estado: "CONCILIADO",
  faltante_antes: 0,
  faltante_despues: 0,
  sobrante: 0,
  comision_real: null,
  tc_implicito: null,
  tc_referencia: null,
  desvio_pct: null,
  motivo: null,
  un_solo: false,
  ...over,
});
const cand = (id: string, folio: number, monto: number, over: Partial<CandidatoCobroVuelo> = {}): OpcionAbono => ({
  tipo: "COBRO",
  c: {
    tipo: "COBRO_VUELO",
    id,
    cobro_id: id,
    vuelo_id: `v${folio}`,
    folio,
    fecha_vuelo: null,
    cliente: "Beh Kay",
    fecha_cobro: "2026-09-15T17:00:00Z",
    monto,
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    referencia: null,
    comision_banco_monto: null,
    neto: monto,
    dif_monto: 0,
    ...over,
  },
});

const EXCEDE = guiaAlVincular(
  cand(C315, 315, 68205.55, {
    dif_monto: 977.45,
    al_vincular: al({
      estado: "EXCEDE",
      faltante_antes: 68205.55,
      faltante_despues: 68205.55,
      sobrante: 977.45,
      sugeridos: [
        { cobro_id: C332, vuelo_id: "v332", folio: 332, cliente: "Beh Kay", fecha_cobro: null, monto: 977.45, moneda: "MXN", faltante: 977.45 },
      ],
    }),
  }),
  { monto: 69183, moneda: "MXN" },
  { enLista: new Set([C315, C332]) },
)!;
const PARCIAL_OP = cand(C315, 315, 3400, {
  dif_monto: 1700,
  al_vincular: al({ estado: "PARCIAL", faltante_antes: 3400, faltante_despues: 1700 }),
});
const PARCIAL = guiaAlVincular(PARCIAL_OP, { monto: 1700, moneda: "MXN" })!;
const COMISION_OP = cand(C293, 293, 13000, {
  comision_banco_monto: 1129.76,
  neto: 11870.24,
  al_vincular: al({ estado: "COMISION_NO_CUADRA", comision_real: 1200, motivo: "COMISION", un_solo: true }),
});

describe("la guía de UN cobro (render estático)", () => {
  it("EXCEDE: el texto del veredicto y las dos salidas de un clic, con cursor-pointer", () => {
    const html = renderToStaticMarkup(<GuiaVincularAbono guia={EXCEDE} id="guia" onAccion={() => {}} />);
    expect(html).toContain('data-guia-al-vincular="rojo"');
    expect(html).toContain(esc("sobran $977.45 MXN"));
    expect(html).toContain('data-accion-guia="MARCAR_SUGERIDO"');
    expect(html).toContain("Agregar el cobro del vuelo #332");
    expect(html).toContain('data-accion-guia="BUSCAR"');
    expect(html).toContain("Buscar $977.45");
    expect(html.match(/<button[^>]*class="[^"]*cursor-pointer/g)?.length).toBe(2);
  });

  it("COMISION_NO_CUADRA: «Corregir la comisión a $1,200 y vincular» SOLO con la capacidad del API", () => {
    const con = guiaAlVincular(COMISION_OP, { monto: 11800, moneda: "MXN" }, { corregirComision: true })!;
    const sin = guiaAlVincular(COMISION_OP, { monto: 11800, moneda: "MXN" })!;
    expect(renderToStaticMarkup(<GuiaVincularAbono guia={con} onAccion={() => {}} />)).toContain(
      "Corregir la comisión a $1,200 y vincular",
    );
    const htmlSin = renderToStaticMarkup(<GuiaVincularAbono guia={sin} onAccion={() => {}} />);
    expect(htmlSin).not.toContain("Corregir la comisión a");
    expect(htmlSin).not.toContain("<button");
  });
});

describe("el botón principal (excepción deliberada a «nunca apagar», D18)", () => {
  it("EXCEDE: apagado, con la razón en el title del envoltorio y la guía como aria-describedby", () => {
    const html = renderToStaticMarkup(
      <BotonVincularConGuia etiqueta="Vincular el cobro" guia={EXCEDE} idGuia="guia" deshabilitado={false} onClick={() => {}} />,
    );
    expect(html).toContain('title="El abono rebasa este cobro: marca también el otro vuelo"');
    // Revisión 15-oct-2026: apagado por el veredicto queda ENFOCABLE (aria-disabled, sin
    // `disabled` nativo): sigue en el Tab y el lector anuncia su aria-describedby.
    expect(html).toMatch(/<button[^>]*aria-disabled="true"/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
    // Revisión 2: atenúa relleno y texto, no el elemento (el anillo de foco se ve).
    expect(html).toContain("aria-disabled:bg-primary/50");
    expect(html).toContain("aria-disabled:focus-visible:ring-ring");
    expect(html).not.toContain("aria-disabled:opacity-50");
    expect(html).toContain('aria-describedby="guia"');
    expect(html).toContain("cursor-pointer");
    // Apagado por «vinculando» (o nada marcado): el `disabled` nativo de siempre.
    const vinculando = renderToStaticMarkup(
      <BotonVincularConGuia etiqueta="Vinculando…" guia={EXCEDE} idGuia="guia" deshabilitado onClick={() => {}} />,
    );
    expect(vinculando).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("PARCIAL: habilitado («Vincular como parcial…»); 2+ cobros (sin guía): nunca se apaga por la suma", () => {
    const parcial = renderToStaticMarkup(
      <BotonVincularConGuia etiqueta="Vincular como parcial…" guia={PARCIAL} idGuia="guia" deshabilitado={false} onClick={() => {}} />,
    );
    expect(parcial).toContain("Vincular como parcial…");
    expect(parcial).not.toMatch(/disabled=""/);
    expect(parcial).not.toContain("title=");
    const lote = renderToStaticMarkup(
      <BotonVincularConGuia etiqueta="Vincular 2 cobros" guia={null} deshabilitado={false} onClick={() => {}} />,
    );
    expect(lote).not.toMatch(/disabled=""/);
    expect(lote).not.toContain("aria-describedby");
  });
});

describe("la confirmación de dinero (AlertDialog)", () => {
  it("parcial: título, cuerpo con los números del API y «Sí, vincular como parcial»; cerrada no pinta nada", () => {
    const texto = textoConfirmarParcial(PARCIAL_OP, { monto: 1700, moneda: "MXN", fecha: "2026-09-15" });
    const html = renderToStaticMarkup(
      <ConfirmacionVincular abierta texto={texto} onCancelar={() => {}} onConfirmar={() => {}} />,
    );
    expect(html).toContain("¿Vincular como pago parcial?");
    expect(html).toContain(esc("El cobro quedará «Conciliado parcial · faltan $1,700 MXN»"));
    expect(html).toContain("Sí, vincular como parcial");
    expect(html).toContain(">Cancelar<");
    expect(html.match(/<button[^>]*class="cursor-pointer"/g)?.length).toBe(2);
    expect(renderToStaticMarkup(<ConfirmacionVincular abierta={false} texto={texto} onCancelar={() => {}} onConfirmar={() => {}} />)).toBe("");
    // Sin texto (otro estado) no se abre.
    expect(renderToStaticMarkup(<ConfirmacionVincular abierta texto={null} onCancelar={() => {}} onConfirmar={() => {}} />)).toBe("");
  });

  it("comisión: el aviso ámbar si la comisión real rebasa 15 % del cobro", () => {
    const alta = cand(C293, 293, 10000, {
      comision_banco_monto: 300,
      neto: 9700,
      al_vincular: al({ estado: "COMISION_NO_CUADRA", comision_real: 2000, motivo: "COMISION", un_solo: true }),
    });
    const html = renderToStaticMarkup(
      <ConfirmacionVincular
        abierta
        texto={textoConfirmarCorregirComision(alta, { monto: 8000, moneda: "MXN" })}
        onCancelar={() => {}}
        onConfirmar={() => {}}
      />,
    );
    expect(html).toContain("¿Corregir la comisión y vincular?");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Ojo: la comisión real es mayor que 15 % del cobro.");
    expect(html).toContain("Sí, corregir y vincular");
  });
});

describe("cableado del diálogo (fuente)", () => {
  const src = leer("../vincular-abono-dialog.tsx");

  it("PARCIAL abre la confirmación y el API NO se llama hasta confirmar; «Cancelar» solo cierra", () => {
    expect(src).toContain("switch (pasoAlPulsarVincular(marcadas.length, guia))");
    const caso = src.slice(src.indexOf('case "CONFIRMAR_PARCIAL":'), src.indexOf('case "LIGAR":'));
    expect(caso).toMatch(/setConfirmar\(\{ tipo: "parcial", clave: claveMarcada \}\);\s*return;/);
    expect(src).toMatch(/case "BLOQUEADO":[\s\S]*?return;/);
    // Las dos confirmaciones: cancelar = setConfirmar(null); confirmar = ligar.
    expect(src.match(/onCancelar=\{\(\) => setConfirmar\(null\)\}/g)?.length).toBe(2);
    expect(src).toMatch(/abierta=\{confirmarVigente === "parcial"\}[\s\S]*?void ligar\(\);/);
    // «Corregir la comisión» viaja SOLO desde su confirmación.
    expect(src.match(/void ligar\(\{ corregirComision: true \}\)/g)?.length).toBe(1);
    expect(src).toMatch(/abierta=\{confirmarVigente === "comision"\}[\s\S]*?void ligar\(\{ corregirComision: true \}\)/);
    expect(src).toMatch(/if \(a\.tipo === "CORREGIR_COMISION" && confirmacionComision && claveMarcada\) \{\s*setConfirmar\(\{ tipo: "comision", clave: claveMarcada \}\);/);
  });

  it("revisión 2 (15-oct-2026): la confirmación va LIGADA al candidato y bloquea el diálogo de abajo", () => {
    // Vale solo para lo marcado con que se pidió; marcar/desmarcar o recargar la suelta.
    expect(src).toContain("const confirmarVigente = confirmacionVigente(confirmar, claveMarcada);");
    expect(src).toMatch(/const r = alternarSeleccion\(sel, o, opciones \?\? \[\]\);\s*setConfirmar\(null\);/);
    expect(src).toMatch(/conservarRef\.current = conservar \? sel : null;\s*setConfirmar\(null\);/);
    // Anidada: con su backdrop (Base UI no lo pinta en un diálogo anidado).
    expect(src).toContain("<AlertDialogContent backdropForceRender>");
    expect(leer("../../../ui/alert-dialog.tsx")).toContain("<AlertDialogOverlay forceRender={backdropForceRender} />");
    expect(leer("../sugerencias-abonos-dialog.tsx")).toContain("<AlertDialogContent backdropForceRender>");
  });

  it("la capacidad `corregir_comision` del API y la bandera solo con ella", () => {
    expect(src).toContain("corregirComision: r.data.movimiento.corregir_comision === true");
    expect(src).toContain("cobrosParciales: r.data.movimiento.cobros_parciales === true");
    expect(src).toMatch(
      /guiaAlVincular\(marcadaUnica, abonoGuia, \{\s*corregirComision: capacidades\.corregirComision,\s*enLista: idsEnLista,\s*cobrosParciales: capacidades\.cobrosParciales,\s*\}\)/,
    );
    expect(src).toContain('const corregir = opcionesLiga?.corregirComision === true ? { corregirComision: true } : undefined;');
    const actions = leer("../../../../app/admin/ingresos/actions.ts");
    expect(actions).toContain("...(corregir ? { corregir_comision: true } : {})");
    expect(actions).toContain('code: "API_SIN_CORREGIR_COMISION"');
    expect(actions).toContain("corregir_comision should not exist");
  });

  it("salidas de un clic: marcar el sugerido con `alternar` y llenar el buscador", () => {
    expect(src).toContain("const o = porClave.get(claveDeCobroVuelo(a.cobro_id));");
    expect(src).toMatch(/if \(o && !sel\.includes\(claveOpcion\(o\)\)\) \{[\s\S]*?alternar\(o\);\s*\}/);
    expect(src).toContain("setTexto(a.buscar);");
    expect(src).toContain("ref={buscarRef}");
  });

  it("tras cualquier 409 la lista se vuelve a pedir SIN soltar lo marcado; con `recargar`, soltándolo", () => {
    expect(src).toMatch(/if \(e\.recargar\) \{[\s\S]*?recargar\(false\);[\s\S]*?\} else if \(r\.status === 409 \|\| e\.comisionCorregida\) \{[\s\S]*?recargar\(true\);/);
    expect(src).toContain("conservarRef.current = conservar ? sel : null;");
    expect(src).toContain("setSel(conservar.filter((k) => claves.has(k)));");
    // La comisión ya cambió o no se sabe si ligó: refresh UNA vez al cerrar.
    expect(src).toContain("if (e.comisionCorregida || e.incierto) alCambiarDatos();");
    expect(src).toMatch(/if \(!abierto && refrescarAlCerrarRef\.current\) \{\s*refrescarAlCerrarRef\.current = false;\s*router\.refresh\(\);/);
  });

  it("revisión 15-oct-2026: región viva PERMANENTE, foco al botón principal y descripción completa en su title", () => {
    // La región vive con el diálogo (la guía ya no trae aria-live: nacía con su texto y no se anunciaba).
    expect(src).toContain('<p className="sr-only" aria-live="polite" aria-atomic="true" data-region-viva-vincular="">');
    expect(src).toContain('{guia?.texto ?? suma?.texto ?? ""}');
    const guia = renderToStaticMarkup(<GuiaVincularAbono guia={EXCEDE} id="guia" onAccion={() => {}} />);
    expect(guia).not.toContain("aria-live");
    // «Agregar el cobro del vuelo #332»: el foco pasa al botón principal ANTES de que la guía se desmonte.
    expect(src).toMatch(/botonVincularRef\.current\?\.focus\(\);\s*alternar\(o\);/);
    expect(src).toContain("botonRef={botonVincularRef}");
    // Revisión 2: la etiqueta, el estado del 0.0.78 y la línea corta ENVUELVEN (sin
    // `truncate`: un celular no tiene hover); la descripción, a 2 renglones con su title.
    expect(src).toContain("title={desc.texto}");
    expect(src).toContain('<span className="block break-words font-medium" title={etiquetaOpcion(o)}>');
    expect(src).toContain("{desc.estado && (");
    const lista = src.slice(src.indexOf("{visibles.map((o) => {"), src.indexOf("{visibles.length === 0 && ("));
    expect(lista).not.toContain("truncate");
    // Con 2+ marcados, en los marcados manda la suma del lote.
    expect(lista).toMatch(/lineaCortaAlVincular\(o, \{\s*enLote: marcada && marcadas\.length >= 2,/);
    // «Corregir la comisión»: un fallo sin veredicto del API es incierto (la comisión pudo quedar escrita).
    expect(src).toContain("mensajeErrorVincularCobros(r, { corrigiendoComision: corregir !== undefined })");
  });

  it("las server actions nunca lanzan: cada llamada va con `.catch(sinConexion)`", () => {
    expect(src.match(/\.catch\(sinConexion\)/g)?.length).toBe(4);
  });

  it("todo lo que se pulsa lleva cursor-pointer", () => {
    const botones = src.split("<Button").slice(1).map((b) => b.slice(0, b.indexOf("</Button>")));
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) expect(b).toContain("cursor-pointer");
    expect(src.match(/<AlertDialog(Cancel|Action)\s+className="cursor-pointer"/g)?.length).toBe(2);
  });
});
