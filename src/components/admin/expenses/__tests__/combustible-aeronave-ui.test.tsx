/**
 * Combustible por aeronave en la UI (5-oct-2026, API 0.0.56). Caso real: el
 * XB-PEV (pistón, gasavión) quedó con una carga «Turbosina» capturada desde la
 * app y el Balance del PEV salió con «Combustible TURBOSINA».
 *
 *  1. «Verificar / editar» REAL (render): una carga cuyo tipo no es el del
 *     avión pinta el aviso ámbar; si coincide, o el API todavía no manda el
 *     combustible del avión, calla.
 *  2. Ficha del avión REAL (render): campo «Combustible» con gasavión por
 *     default en el alta, el valor guardado en la edición y «—» (sin selector)
 *     con un API previo.
 *  3. Cableado: prellenado en los dos diálogos (efecto que lee getValues), el
 *     tipo solo viaja en GAS, el PATCH manda el tipo que no es del avión, las
 *     páginas arman el catálogo con `avionCatalogoGasto` (sin él, el
 *     combustible se perdía antes de llegar al diálogo) y el detalle del
 *     avión pinta el campo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { Aircraft } from "@/types/aircraft";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/combustibles",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  verifyGastoAction: async () => ({ ok: true }),
  assignVueloGastoAction: async () => ({ ok: true }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  reanalizarComprobanteAction: async () => ({ ok: false }),
  sugerirAsignacionGastoAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/aircraft/actions", () => ({
  createAircraftAction: async () => ({ ok: true }),
  updateAircraftAction: async () => ({ ok: true }),
}));
vi.mock("@/components/admin/comprobante-preview", () => ({
  ComprobantePreview: () => null,
}));
// Diálogo abierto sin portal y selectores como testigos: el render estático
// enseña los campos con su valor.
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
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-valor={p.value ?? ""}
      data-etiqueta={p.options.find((o) => o.value === p.value)?.label ?? ""}
      data-opciones={p.options.map((o) => o.label).join("|")}
    />
  ),
}));

const { ExpenseVerifyDialog } = await import("../expense-verify-dialog");
const { AircraftFormDialog } = await import("@/components/admin/aircraft/aircraft-form-dialog");

const AVISO_PEV =
  "El XB-PEV carga Gasavión: al guardar se corregirá a Gasavión y quedará marcado para revisión.";

/** La carga real del vuelo #280 (74 L en Chetumal, tarjeta ****0585). */
function carga(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "g-280",
    vuelo_id: "v-280",
    aeronave_id: "av-pev",
    usuario_captura_id: "u-luis",
    categoria: "GAS",
    monto: "2800",
    propina: null,
    moneda: "MXN",
    tc_gasto: "18.2",
    fecha_gasto: "2026-09-10",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "0585",
    folio_ticket: null,
    litros: "74",
    tipo_combustible: "TURBOSINA",
    lugar: "CTM",
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    notas: null,
    created_at: "2026-09-10T20:00:00Z",
    updated_at: "2026-09-10T20:00:00Z",
    ...over,
  } as Gasto;
}

const FLOTA: AvionCatalogoGasto[] = [
  { id: "av-pev", matricula: "XB-PEV", combustible: "AVGAS" },
  { id: "av-58bt", matricula: "N58BT", combustible: "TURBOSINA" },
];

const verificar = (gasto: Gasto, aircraft: AvionCatalogoGasto[] = FLOTA) =>
  renderToStaticMarkup(
    <ExpenseVerifyDialog
      open
      onOpenChange={() => {}}
      gasto={gasto}
      aircraft={aircraft}
      providers={[]}
    />,
  );

describe("«Verificar / editar» (render real)", () => {
  it("caso real: TURBOSINA en el XB-PEV ⇒ aviso ámbar bajo el bloque de combustible", () => {
    const html = verificar(carga());
    expect(html).toContain(`⚠ ${AVISO_PEV}`);
    // Mismo patrón visual que el aviso de matrícula.
    const aviso = html.match(/<p class="([^"]*)">⚠ El XB-PEV carga/)?.[1] ?? "";
    expect(aviso).toContain("border-amber-500/40");
    expect(aviso).toContain("bg-amber-500/10");
    // El selector conserva lo guardado: el aviso explica, no cambia el dato.
    expect(html).toMatch(/data-select="Elige el tipo" data-valor="TURBOSINA"/);
  });

  it("coincide con el avión ⇒ sin aviso", () => {
    expect(verificar(carga({ tipo_combustible: "AVGAS" }))).not.toContain("carga Gasavión");
    expect(
      verificar(carga({ aeronave_id: "av-58bt", tipo_combustible: "TURBOSINA" })),
    ).not.toContain("al guardar se corregirá");
  });

  it("API previo (el avión no trae combustible) ⇒ sin aviso", () => {
    const html = verificar(carga(), [{ id: "av-pev", matricula: "XB-PEV" }]);
    expect(html).not.toContain("al guardar se corregirá");
  });

  it("no es GAS ⇒ sin aviso", () => {
    expect(verificar(carga({ categoria: "ATERRIZAJE" }))).not.toContain(
      "al guardar se corregirá",
    );
  });
});

const AVION: Aircraft = {
  id: "av-58bt",
  matricula: "N58BT",
  modelo: "Piper Meridian",
  pais_registro: "USA",
  num_motores: 1,
  velocidad_crucero_kts: "260",
  asientos: 5,
  motor_hp: null,
  caracteristicas: null,
  tarifa_hora_pub_usd: null,
  tarifa_hora_broker_usd: null,
  reserva_overhaul_hr_usd: null,
  color_calendario: null,
  ubicacion_base: "CUN",
  combustible: "TURBOSINA",
  activa: true,
  notas: null,
  servicio_intervalos: [],
  servicio_horas_base: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-10-05T00:00:00Z",
};

/** El testigo del selector «Combustible» (placeholder «Selecciona», opciones de la ficha). */
const selectorCombustible = (html: string) =>
  html.match(/<span data-select="Selecciona" data-valor="[^"]*" data-etiqueta="[^"]*" data-opciones="Gasavión\|Turbosina"><\/span>/)?.[0] ??
  null;

describe("ficha del avión (render real)", () => {
  it("alta: «Combustible» con gasavión por default y su ayuda", () => {
    const html = renderToStaticMarkup(<AircraftFormDialog open onOpenChange={() => {}} />);
    expect(html).toContain(">Combustible<");
    expect(selectorCombustible(html)).toContain('data-valor="AVGAS"');
    expect(html).toContain("Las cargas de este avión se guardan con este combustible.");
  });

  it("edición: el valor guardado", () => {
    const html = renderToStaticMarkup(
      <AircraftFormDialog open onOpenChange={() => {}} initialAircraft={AVION} />,
    );
    expect(selectorCombustible(html)).toContain('data-etiqueta="Turbosina"');
  });

  it("API previo: «—» sin selector (en edición por el avión, en el alta por la flota)", () => {
    const { combustible: _omitido, ...viejo } = AVION;
    void _omitido;
    const edicion = renderToStaticMarkup(
      <AircraftFormDialog open onOpenChange={() => {}} initialAircraft={viejo} />,
    );
    expect(selectorCombustible(edicion)).toBeNull();
    expect(edicion).toMatch(/>Combustible<\/label><p class="[^"]*"[^>]*>—<\/p>/);
    const alta = renderToStaticMarkup(
      <AircraftFormDialog open onOpenChange={() => {}} combustibleDisponible={false} />,
    );
    expect(selectorCombustible(alta)).toBeNull();
  });
});

describe("cableado", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const alta = leer("../expense-create-dialog.tsx");
  const verif = leer("../expense-verify-dialog.tsx");
  const ficha = leer("../../aircraft/aircraft-form-dialog.tsx");

  it("los dos diálogos prellenan con la regla ÚNICA, leyendo getValues (fresco tras reset)", () => {
    for (const src of [alta, verif]) {
      expect(src).toMatch(
        /useEffect\(\(\) => \{\s*if \(!open\) return;\s*const actual = getValues\("tipo_combustible"\);\s*const sugerido = tipoCombustibleSugerido\(\{/,
      );
      expect(src).toContain('delAvion: combustibleDeAeronave(aircraft, getValues("aeronave_id"))');
      expect(src).toContain("actualEsSugerido: tipoAuto.current");
      expect(src).toContain("ia: tipoIa");
      // Elegir a mano manda sobre el prellenado.
      expect(src).toMatch(/setValue\("tipo_combustible", v\);\s*\/\/[^\n]*\n\s*tipoAuto\.current = false;/);
      // El aviso sale del helper, en ámbar.
      expect(src).toContain("avisoCombustibleDistinto(");
      expect(src).toContain("⚠ {avisoCombustible}");
    }
  });

  it("verificación: el efecto va DESPUÉS del reset y del prellenado por matrícula; el reset limpia la marca", () => {
    const reset = verif.indexOf("reset(defaults(gasto));");
    const matricula = verif.indexOf("avion = avionPorMatricula(aircraft, mIa) ?? null;");
    const efecto = verif.indexOf("const sugerido = tipoCombustibleSugerido({");
    expect(reset).toBeGreaterThan(-1);
    expect(matricula).toBeGreaterThan(reset);
    expect(efecto).toBeGreaterThan(matricula);
    expect(verif).toMatch(/avionLimpiado\.current = false;\s*tipoAuto\.current = false;\s*\}\s*\}, \[open, gasto, reset\]\);/);
  });

  it("verificación: el PATCH manda el tipo que no es del avión (el API solo reajusta si lo trae)", () => {
    expect(verif).toMatch(
      /camposCargaParaPatch\(\s*gasto,\s*values,\s*combustibleDeAeronave\(aircraft, values\.aeronave_id\),\s*\)/,
    );
  });

  it("alta: el selector vive en el bloque GAS y el tipo solo viaja en GAS", () => {
    expect(alta).toMatch(/<Field label="Tipo de combustible">\s*<SearchableSelect\s*options=\{TIPOS_COMBUSTIBLE/);
    expect(alta).toContain(
      'tipo_combustible: values.categoria === "GAS" ? values.tipo_combustible : "",',
    );
    // Tras guardar, la marca del prellenado se limpia con el formulario.
    expect(alta).toMatch(/avionLimpiado\.current = false;\s*tipoAuto\.current = false;/);
  });

  it("ficha: el campo no viaja con un API previo", () => {
    expect(ficha).toContain("if (!conCombustible) delete payload.combustible;");
    expect(ficha).toContain("combustible: COMBUSTIBLE_AERONAVE_DEFAULT,");
    expect(ficha).toContain('combustible: a.combustible ?? "",');
  });

  it("las páginas arman el catálogo de los diálogos con avionCatalogoGasto", () => {
    const paginas: Record<string, number> = {
      "../../../../app/admin/expenses/page.tsx": 1,
      "../../../../app/admin/gastos-personales/page.tsx": 1,
      "../../../../app/admin/combustibles/page.tsx": 1,
      "../../../../app/admin/caja-chica/[id]/page.tsx": 1,
      "../../../../app/admin/flights/[id]/page.tsx": 2,
    };
    for (const [rel, n] of Object.entries(paginas)) {
      const src = leer(rel);
      expect(src.split(".map(avionCatalogoGasto)").length - 1, rel).toBe(n);
    }
    // La lista de flota decide si el ALTA manda el campo.
    expect(leer("../../../../app/admin/aircraft/page.tsx")).toContain(
      "<AircraftCreateButton combustibleDisponible={apiConCombustible(aircraft)} />",
    );
  });

  it("el detalle del avión pinta «Combustible» con la etiqueta única («—» con API previo)", () => {
    expect(leer("../../../../app/admin/aircraft/[id]/page.tsx")).toMatch(
      /<Field\s*label=\{ETIQUETA_COMBUSTIBLE_AERONAVE\}\s*value=\{etiquetaCombustibleAeronave\(aircraft\.combustible\)\}\s*\/>/,
    );
  });
});
