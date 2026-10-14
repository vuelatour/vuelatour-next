/**
 * «Avión (opcional)» del alta/edición de un ingreso (13-oct-2026, API
 * 0.0.75). Un ingreso de RESULTADO con avión cuenta para ESE avión (hoja
 * «Otros ingresos» de su balance y su reparto a socios) y deja de ser
 * ingreso de VuelaTour; anticipos y aportaciones jamás llevan avión.
 *
 * Render estático de `FormularioIngreso` (el runner no tiene DOM) + cableado
 * por regex del fuente: el selector vive A LA VISTA (fuera de «Más datos»),
 * solo en categorías de resultado (o con un dato legado, que se ve con su
 * error), marca el avión dado de baja sin deshabilitarlo y el «Va a:» dice el
 * destino con avión.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Ingreso } from "@/types/ingresos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/ingresos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  ligarAbonoCobroAction: async () => ({ ok: true }),
  vuelosCandidatosAction: async () => ({ ok: true, data: [] }),
  gastosParaReembolsoAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/api/ingresos-browser", () => ({
  registrarIngreso: async () => ({ ok: false, error: "no" }),
  editarIngreso: async () => ({ ok: false, error: "no" }),
  motivoComprobanteIngresoInvalido: () => null,
}));
// El selector como testigo: valor, placeholder y cada opción con su descripción.
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string; description?: string; descriptionClassName?: string }[];
    value: string | null | undefined;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-valor={p.value ?? ""}
      data-opciones={p.options
        .map((o) => `${o.label}${o.description ? ` [${o.description}|${o.descriptionClassName ?? ""}]` : ""}`)
        .join(" ¦ ")}
    />
  ),
}));

const { FormularioIngreso } = await import("../registrar-ingreso-dialog");

const AV_990 = "8f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const AV_IJP = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const CUENTA = "0a9c2b1e-2d3f-4a5b-8c7d-6e5f4a3b2c1d";

const CATALOGOS = {
  cuentas: [{ id: CUENTA, alias: "EJE SCOTIA", banco: "Scotiabank", moneda: "MXN" as const, tipo: "BANCO" as const, activa: true }],
  clientes: [],
  aeronaves: [
    { id: AV_990, matricula: "N990GG", activa: true },
    { id: AV_IJP, matricula: "XB-IJP", activa: false },
  ],
};

function ingreso(over: Partial<Ingreso> = {}): Ingreso {
  return {
    id: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    folio: 4,
    etiqueta: "ING-4",
    categoria: "REEMBOLSO_DEVOLUCION",
    categoria_etiqueta: "Reembolsos y devoluciones recibidos",
    suma_a_resultados: true,
    fecha: "2026-09-04",
    descripcion: "TRANSF INTERBANCARIA SPEI",
    monto: 46550.8,
    comision_monto: null,
    neto: 46550.8,
    moneda: "MXN",
    tc_usd_mxn: null,
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    cuenta_bancaria_id: CUENTA,
    cuenta: { id: CUENTA, alias: "EJE SCOTIA", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" },
    referencia: null,
    pagador: "angel alvarez",
    cliente_id: null,
    cliente_nombre: null,
    vuelo_id: null,
    vuelo_folio: null,
    aeronave_id: null,
    matricula: null,
    gasto_id: null,
    notas: null,
    archivo: null,
    conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
    anticipo: null,
    registrado_por_nombre: "Ale",
    created_at: "2026-09-04T18:00:00Z",
    updated_at: "2026-09-04T18:00:00Z",
    baja: null,
    ...over,
  };
}

const formulario = (i: Ingreso | null, aeronaves = CATALOGOS.aeronaves) =>
  renderToStaticMarkup(
    <FormularioIngreso
      {...CATALOGOS}
      aeronaves={aeronaves}
      open
      onOpenChange={() => {}}
      ingreso={i}
      onCerrar={() => {}}
    />,
  );

const ETIQUETA = "Avión (opcional)";
const HINT_SIN =
  "Si este dinero es de un avión (reembolso de su servicio o de su aseguradora, venta de una pieza suya…), elígelo: contará en su balance (hoja «Otros ingresos») y en su reparto a socios. Déjalo vacío si es dinero de VuelaTour.";
const HINT_CON =
  "Cuenta para el avión N990GG: hoja «Otros ingresos» de su balance y su reparto a socios. Ya no cuenta como ingreso de VuelaTour.";

describe("FormularioIngreso · avión (render)", () => {
  it("REEMBOLSO sin avión: el campo va A LA VISTA (antes de «Más datos» y del comprobante), con su hint y el destino por categoría", () => {
    const html = formulario(ingreso());
    expect(html).toContain(ETIQUETA);
    expect(html).toContain(HINT_SIN);
    expect(html).toContain("Va a: Otros ingresos (Balance general VuelaTour y Libro Dinero)");
    expect(html.indexOf(ETIQUETA)).toBeLessThan(html.indexOf("Comprobante (foto o PDF"));
    // El botón del plegable (el hint del monto también nombra «Más datos»).
    const plegable = html.indexOf("Más datos<span");
    expect(plegable).toBeGreaterThan(-1);
    expect(html.indexOf(ETIQUETA)).toBeLessThan(plegable);
    // Selector con la opción vacía al frente y el placeholder del contrato.
    expect(html).toContain('data-select="Sin avión (ingreso de VuelaTour)" data-valor=""');
    expect(html).toContain('data-opciones="Sin avión (ingreso de VuelaTour) ¦ N990GG ¦ XB-IJP');
  });

  it("con avión: «Va a: Otros ingresos del avión N990GG …» y el hint con avión", () => {
    const html = formulario(ingreso({ aeronave_id: AV_990, matricula: "N990GG" }));
    expect(html).toContain("Va a: Otros ingresos del avión N990GG (balance del avión y reparto a socios)");
    expect(html).toContain(HINT_CON);
    expect(html).toContain(`data-valor="${AV_990}"`);
  });

  it("ANTICIPO: sin el campo", () => {
    expect(formulario(ingreso({ categoria: "ANTICIPO_CLIENTE" }))).not.toContain(ETIQUETA);
    expect(formulario(ingreso({ categoria: "APORTACION_PRESTAMO" }))).not.toContain(ETIQUETA);
  });

  it("anticipo LEGADO con avión: el campo queda a la vista (para quitarlo)", () => {
    const html = formulario(ingreso({ categoria: "ANTICIPO_CLIENTE", aeronave_id: AV_990, matricula: "N990GG" }));
    expect(html).toContain(ETIQUETA);
    // Un anticipo no va a un avión: el «Va a:» es el de la categoría.
    expect(html).toContain("Va a: Fuera de resultados hasta aplicarse a un vuelo");
  });

  it("avión dado de baja: se ofrece igual, con su descripción en ámbar", () => {
    const html = formulario(ingreso());
    expect(html).toContain(
      "XB-IJP [Dado de baja: cuenta en su balance, no en el reparto|text-amber-600 dark:text-amber-400]",
    );
    expect(html).not.toMatch(/N990GG \[/);
  });

  it("avión vigente que no está en el catálogo (no cargó): se conserva con su matrícula, nunca «Sin avión»", () => {
    const html = formulario(ingreso({ aeronave_id: AV_990, matricula: "N990GG" }), []);
    expect(html).toContain(`data-valor="${AV_990}"`);
    expect(html).toContain("Sin avión (ingreso de VuelaTour) ¦ N990GG");
    expect(html).toContain(HINT_CON);
  });

  it("«Más datos» ya no dice «avión»", () => {
    const html = formulario(ingreso());
    expect(html).toContain("comisión, tipo de cambio, método, vuelo, gasto, referencia y notas");
    expect(html).not.toContain("avión, referencia y notas");
    const otro = formulario(ingreso({ categoria: "OTRO_INGRESO" }));
    expect(otro).toContain("comisión, tipo de cambio, método, referencia y notas");
  });
});

describe("cableado del diálogo", () => {
  const fuente = readFileSync(path.resolve(__dirname, "../registrar-ingreso-dialog.tsx"), "utf8");
  const ingresosPage = readFileSync(path.resolve(__dirname, "../../../../app/admin/ingresos/page.tsx"), "utf8");
  const conciliacionPage = readFileSync(
    path.resolve(__dirname, "../../../../app/admin/conciliacion/page.tsx"),
    "utf8",
  );

  it("el avión ya no despliega «Más datos» (AERONAVE_NO_EXISTE fuera de CODES_MAS_DATOS)", () => {
    const bloque = /const CODES_MAS_DATOS[\s\S]*?\]\);/.exec(fuente)?.[0] ?? "";
    expect(bloque).toContain("TC_REQUERIDO");
    expect(bloque).not.toContain("AERONAVE_NO_EXISTE");
  });

  it("reclasificar suelta el avión y el «Va a:» sale de la fuente única", () => {
    expect(fuente).toContain('aeronave_id: categoriaIngresoAdmiteAvion(cat) ? f.aeronave_id : "",');
    expect(fuente).toContain("Va a: {textoDestinoIngreso(cat, form.aeronave_id || null, matriculaElegida)}");
    expect(fuente).toContain("const muestraAvion = categoriaIngresoAdmiteAvion(cat) || !!form.aeronave_id;");
    expect(fuente).not.toContain("Solo referencia: el dinero va a VuelaTour.");
  });

  it("los catálogos llevan `activa` (para marcar el avión dado de baja)", () => {
    for (const fuentePagina of [ingresosPage, conciliacionPage]) {
      expect(fuentePagina).toContain(
        "aeronaves: aeronavesRes.data.map((a) => ({ id: a.id, matricula: a.matricula, activa: a.activa })),",
      );
    }
  });
});
