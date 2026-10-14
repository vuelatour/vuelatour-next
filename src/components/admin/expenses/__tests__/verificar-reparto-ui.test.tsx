/**
 * «Verificar / editar» con el reparto entre aviones (14-oct-2026). Caso
 * STARLINK (e23b5587, INDIRECTO $4,733.76 MXN repartido 3 × $1,577.92 entre
 * N4142R, N621TX y N990GG; la IA leyó N990GG y «Servicios»): el diálogo
 * prellenaba N990GG por la matrícula y el API rechazaba el guardado.
 *
 *  1. Render estático del diálogo REAL (el runner no tiene DOM: los efectos
 *     no corren, así que lo que se ve sale de los inicializadores perezosos).
 *  2. Cableado por regex sobre el fuente (sesión, prellenado, IA, guardado,
 *     confirmaciones).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";
import {
  HINT_SIN_AVION_CATEGORIA,
  HINT_VUELO_EN_REPARTO,
  MOTIVO_REPARTO_CON_VUELO,
} from "@/lib/admin/reparto-gasto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    info: () => {},
    warning: () => {},
  }),
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
  getRepartoAction: async () => ({ ok: false }),
  listAvionesActivosAction: async () => ({ ok: false }),
  saveRepartoAction: async () => ({ ok: false }),
  guardarGastoConRepartoAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/components/admin/comprobante-preview", () => ({
  ComprobantePreview: () => null,
}));
// Diálogo abierto sin portal.
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
// Selector testigo: placeholder, valor, deshabilitado y etiquetas de opciones.
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-valor={p.value ?? ""}
      data-deshabilitado={p.disabled ? "si" : "no"}
      data-opciones={p.options.map((o) => o.label).join("|")}
    />
  ),
}));

const { ExpenseVerifyDialog } = await import("../expense-verify-dialog");

// ===== Datos reales de prod =====
const N4142R = "5a82eb4a-086c-4058-97bd-b2aacdc2e942";
const N621TX = "e1a85e5b-9eaa-4367-9920-68d5d78883e8";
const N990GG = "8f37ec37-965a-42a8-bac4-9991d282f0a3";
const FLOTA: AvionCatalogoGasto[] = [
  { id: N4142R, matricula: "N4142R", combustible: "AVGAS" },
  { id: N621TX, matricula: "N621TX", combustible: "TURBOSINA" },
  { id: N990GG, matricula: "N990GG", combustible: "AVGAS" },
];

function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "e23b5587-9b16-496f-bc36-bf158eae4ad9",
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "INDIRECTO",
    monto: "4733.76",
    propina: "0.00",
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-09-01",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "4321",
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: { matricula: "N990GG", categoria_sugerida: "SERVICIOS" },
    conciliado: true,
    monto_vinculado: "4733.76",
    faltante: "0",
    duplicado_sospechado: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "STARLINK",
    created_at: "2026-09-01T18:00:00Z",
    // Embed REAL de la lista (montos texto, aeronave objeto).
    repartos: [
      { aeronave_id: N990GG, monto: "1577.92", aeronave: { matricula: "N990GG" } },
      { aeronave_id: N4142R, monto: "1577.92", aeronave: { matricula: "N4142R" } },
      { aeronave_id: N621TX, monto: "1577.92", aeronave: { matricula: "N621TX" } },
    ],
    ...over,
  } as Gasto;
}

const verificar = (g: Gasto) =>
  renderToStaticMarkup(
    <ExpenseVerifyDialog open onOpenChange={() => {}} gasto={g} aircraft={FLOTA} providers={[]} />,
  );

/** El testigo de un selector por su placeholder. */
const selector = (html: string, placeholder: string) =>
  html.match(new RegExp(`<span data-select="${placeholder}"[^>]*></span>`))?.[0] ?? null;
const boton = (html: string, texto: string) =>
  html.match(new RegExp(`<button[^>]*>${texto}</button>`))?.[0] ?? null;
const veces = (html: string, texto: string) => html.split(texto).length - 1;

describe("STARLINK (repartido entre 3) — render real", () => {
  const html = verificar(gasto());

  it("arranca en «Repartir entre aviones» con el RESUMEN de solo lectura", () => {
    expect(boton(html, "Repartir entre aviones")).toContain('aria-pressed="true"');
    expect(boton(html, "Un avión")).toContain('aria-pressed="false"');
    expect(html).toContain('role="group" aria-label="Cómo se carga el gasto a los aviones"');
    expect(html).toContain("data-reparto-resumen");
    expect(html).toContain("Repartido entre aviones");
    expect(veces(html, "$1,577.92 MXN")).toBe(3);
    expect(html).toContain("Asignado $4,733.76 MXN de $4,733.76 MXN del total pagado · VuelaTour absorbe $0.00 MXN");
    expect(html).toContain("· repartido $4,733.76 MXN entre 3 aviones · VuelaTour absorbe $0.00 MXN");
    expect(boton(html, "Quitar el reparto")).toContain('title="Deja el gasto sin reparto; se confirma al guardar."');
    expect(html).toContain("Editar reparto");
  });

  it("etiqueta «Avión» (sin «resuelve pendiente»), descripción de reparto y pista del balance", () => {
    expect(html).toMatch(/<label[^>]*>Avión<\/label>/);
    expect(html).not.toContain("Avión (resuelve pendiente)");
    expect(html).toContain("Revisa el reparto entre aviones y confirma categoría y comprobante.");
    expect(html).toContain(
      "Con lo elegido cae en: Balance de N4142R, N621TX y N990GG · Gastos Indirectos (reparto manual; también resta en su reparto a socios)",
    );
  });

  it("el Vuelo queda deshabilitado en «Sin vuelo» con su ayuda", () => {
    const vuelo = selector(html, "Busca por folio, matrícula o ruta");
    expect(vuelo).toContain('data-valor=""');
    expect(vuelo).toContain('data-deshabilitado="si"');
    expect(html).toContain(HINT_VUELO_EN_REPARTO);
  });

  it("YA NO aparecen el prellenado por matrícula, «Usar este avión» ni la sugerencia de vuelo", () => {
    expect(html).not.toContain("Usar este avión");
    expect(html).not.toContain("Prellenado por la matrícula");
    expect(html).not.toContain("data-sugerencia-vuelo");
    expect(html).not.toContain("Sugerencia");
    // Ni selector de avión individual: el reparto lo sustituye.
    expect(selector(html, "Sin asignar")).toBeNull();
  });
});

describe("af52d6f4 (N621TX al 100 %, la IA leyó N621TX y «Refacción»)", () => {
  it("igual de limpio", () => {
    const html = verificar(
      gasto({
        id: "af52d6f4-d6fd-42a2-96f8-b674e5313cf8",
        monto: "1161.52",
        medio_pago: "TRANSFERENCIA",
        tarjeta_terminacion: null,
        conciliado: false,
        monto_vinculado: null,
        valor_ia_extraido: { matricula: "N621TX", categoria_sugerida: "REFACCION" },
        repartos: [{ aeronave_id: N621TX, monto: "1161.52", aeronave: { matricula: "N621TX" } }],
      }),
    );
    expect(boton(html, "Repartir entre aviones")).toContain('aria-pressed="true"');
    expect(html).toContain("$1,161.52 MXN");
    expect(html).toContain("· repartido $1,161.52 MXN entre 1 avión · VuelaTour absorbe $0.00 MXN");
    expect(html).not.toContain("Usar este avión");
    expect(html).not.toContain("Prellenado por la matrícula");
    expect(html).not.toContain("data-sugerencia-vuelo");
  });
});

describe("los demás estados del bloque «Avión»", () => {
  it("OTRO sin reparto: «Un avión» y «Sin avión (gasto de VuelaTour)»; con vuelo, «Repartir» deshabilitado con su motivo", () => {
    const otro = verificar(
      gasto({ categoria: "OTRO", repartos: [], conciliado: false, monto_vinculado: null, valor_ia_extraido: null }),
    );
    expect(boton(otro, "Un avión")).toContain('aria-pressed="true"');
    expect(selector(otro, "Sin asignar")).toContain('data-opciones="Sin avión (gasto de VuelaTour)|N4142R|N621TX|N990GG"');
    expect(otro).toContain("Sin avión, el gasto es de VuelaTour (Balance general · Otros gastos).");
    expect(otro).toContain(
      "Confirma categoría y comprobante. El avión es opcional: sin avión es gasto de VuelaTour, o puedes repartirlo entre aviones.",
    );
    // La caja de sugerencia de vuelo sigue (sin reparto, sin avión).
    expect(otro).toContain("data-sugerencia-vuelo");

    const conVuelo = verificar(
      gasto({ categoria: "OTRO", vuelo_id: "v-330", repartos: [], conciliado: false, valor_ia_extraido: null }),
    );
    const repartir = boton(conVuelo, "Repartir entre aviones");
    expect(repartir).toContain("disabled");
    expect(repartir).toContain(`title="${MOTIVO_REPARTO_CON_VUELO}"`);
    expect(conVuelo).toContain(`>${MOTIVO_REPARTO_CON_VUELO}<`);
  });

  it("COMIDA: sin selector de modo y con «Avión (resuelve pendiente)» como hoy", () => {
    const html = verificar(
      gasto({ categoria: "COMIDA", vuelo_id: "v-1", repartos: [], conciliado: false, valor_ia_extraido: null }),
    );
    expect(html).not.toContain("Repartir entre aviones");
    expect(html).toContain("Avión (resuelve pendiente)");
    expect(html).toContain(
      "Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la bandeja de pendientes.",
    );
    expect(selector(html, "Sin asignar")).toContain('data-opciones="Sin avión|N4142R|N621TX|N990GG"');
  });

  it("INDIRECTO con N4142R (f3c625e6): la ayuda de socios bajo el selector", () => {
    const html = verificar(
      gasto({
        id: "f3c625e6-5bca-4371-8405-65f5a55fc84f",
        aeronave_id: N4142R,
        monto: "64342.00",
        medio_pago: "EFECTIVO",
        tarjeta_terminacion: null,
        conciliado: false,
        monto_vinculado: null,
        valor_ia_extraido: { matricula: "N4142R", categoria_sugerida: "FIJO" },
        repartos: [],
      }),
    );
    expect(selector(html, "Sin asignar")).toContain(`data-valor="${N4142R}"`);
    expect(html).toContain(
      "Con un solo avión (N4142R) el gasto resta en el balance de ese avión, pero no en su reparto a socios. Repartido —aunque sea 100 % a ese avión— resta en los dos.",
    );
  });

  it("INDIRECTO sin embed: «Leyendo el reparto del gasto…», «Repartir» deshabilitado y sin prellenado", () => {
    const sinEmbed = gasto({ conciliado: false });
    delete (sinEmbed as { repartos?: unknown }).repartos;
    const html = verificar(sinEmbed);
    expect(html).toContain("Leyendo el reparto del gasto…");
    expect(boton(html, "Repartir entre aviones")).toContain("disabled");
    expect(boton(html, "Un avión")).toContain('aria-pressed="true"');
    expect(selector(html, "Sin asignar")).toContain('data-valor=""');
    expect(html).not.toContain("Prellenado por la matrícula");
    expect(html).not.toContain("data-sugerencia-vuelo");
  });

  it("GASOLINA: «Sin avión» sin selector de avión y su ayuda", () => {
    const html = verificar(
      gasto({ categoria: "GASOLINA", repartos: [], conciliado: false, valor_ia_extraido: null }),
    );
    expect(boton(html, "Sin avión")).toContain('aria-pressed="true"');
    expect(html).toContain(HINT_SIN_AVION_CATEGORIA);
    expect(selector(html, "Sin asignar")).toBeNull();
  });
});

describe("cableado en el fuente", () => {
  const src = readFileSync(path.resolve(__dirname, "../expense-verify-dialog.tsx"), "utf8");
  const guardar = src.slice(src.indexOf("const guardarVerificacion"), src.indexOf("const continuarGuardado"));

  it("sesión: el formulario se reinicia UNA vez por apertura (sesionRef antes del reset)", () => {
    const sesion = src.indexOf("sesionRef.current = gasto.id;");
    expect(sesion).toBeGreaterThan(-1);
    expect(sesion).toBeLessThan(src.indexOf("reset(defaults(gasto));"));
    expect(src).toContain("if (!open) sesionRef.current = null;");
    expect(src).toContain("if (open && sesionRef.current !== gasto.id) {");
    // El candado de combustible-aeronave-ui.test.tsx:314 sigue casando.
    expect(src).toMatch(/avionLimpiado\.current = false;\s*tipoAuto\.current = false;\s*\}\s*\}, \[open, gasto, reset\]\);/);
  });

  it("prellenado por matrícula: una vez por sesión y con la regla pura (el literal y su orden intactos)", () => {
    const efecto = src.slice(src.indexOf("// Al abrir un gasto SIN avión"), src.indexOf("// Sugerencia de vuelo (R10)"));
    expect(efecto).toContain("debePrellenarAvionPorMatricula(");
    expect(efecto).toContain("yaPrellenado: prefillSesion.current === gasto.id,");
    expect(efecto).toContain("avion = avionPorMatricula(aircraft, mIa) ?? null;");
    expect(src).toContain("sugerenciaSesion.current = gasto.id;");
    const reset = src.indexOf("reset(defaults(gasto));");
    const literal = src.indexOf("avion = avionPorMatricula(aircraft, mIa) ?? null;");
    const paso = src.indexOf("const paso = pasoPrellenadoCombustible({");
    expect(literal).toBeGreaterThan(reset);
    expect(paso).toBeGreaterThan(literal);
  });

  it("«Reanalizar con IA» no aplica a un repartido una categoría que no se reparte", () => {
    const aplicar = src.slice(src.indexOf("const aplicarIA"), src.indexOf("const reanalizar"));
    expect(aplicar).toContain('iaPuedeCambiarCategoria(watch("categoria"), ai.categoria_sugerida)');
    expect(aplicar).toContain("iaRespetaReparto(ai.categoria_sugerida, conReparto)");
    expect(aplicar).toContain("notaIaConReparto(noAplicado)");
  });

  it("guardado: la action nueva SOLO aquí, después del vuelo en el PATCH y envuelta en llamarSinLanzar", () => {
    expect(src.split("guardarGastoConRepartoAction(").length - 1).toBe(1);
    const accion = guardar.indexOf("guardarGastoConRepartoAction(");
    expect(accion).toBeGreaterThan(guardar.indexOf("payload.vuelo_id = vueloSel;"));
    expect(guardar).toMatch(/await llamarSinLanzar\(\(\) =>\s*guardarGastoConRepartoAction\(/);
    expect(guardar).toContain("const result = await verifyGastoAction(gasto.id, payload);");
    expect(guardar).toMatch(/!enReparto &&\s*!vueloEnPatch &&\s*vueloSel !== \(gasto\.vuelo_id \?\? ""\)/);
    // R14: en modo reparto la llave del avión no viaja (o null para autocorregir).
    expect(guardar).toMatch(/if \(enReparto\) \{[\s\S]*?delete payload\.aeronave_id;[\s\S]*?payload\.vuelo_id = null;\s*payload\.escala_id = null;/);
    // El banner de un intento anterior se limpia al guardar, en los DOS caminos.
    const limpia = guardar.indexOf("setAvisoReparto(null);");
    expect(limpia).toBeGreaterThan(-1);
    expect(limpia).toBeLessThan(guardar.indexOf("if (quitaReparto || cambiaReparto) {"));
    expect(guardar.split("setAvisoReparto(null);").length - 1).toBe(1);
  });

  it("confirmaciones: la del reparto antes de la TUA; los dos AlertDialog nuevos dentro del DialogContent", () => {
    expect(src).toContain("if (p) continuarGuardado(p.values, { reparto: true });");
    expect(src).toContain("if (values) continuarGuardado(values);");
    expect(src).toContain("if (pendiente) guardarVerificacion(pendiente.values);");
    const fin = src.indexOf("</DialogContent>");
    const form = src.lastIndexOf("</form>");
    for (const marca of ["{TITULO_REGRESAR_REPARTO}", "confirmarReparto?.titulo"]) {
      const i = src.indexOf(marca);
      expect(i, marca).toBeGreaterThan(form);
      expect(i, marca).toBeLessThan(fin);
    }
    // R24: lo que se frena antes de la red, al inicio de onSubmit.
    const submit = src.slice(src.indexOf("const onSubmit = handleSubmit"), src.indexOf("const fechaIaOtroAnio"));
    expect(submit.indexOf("errorRepartoEnPantalla(")).toBeLessThan(submit.indexOf("fechaGastoSospechosa("));
    expect(src).not.toContain('includes("⚠")');
  });

  it("los textos salen de la fuente única (no se redactan en el diálogo)", () => {
    expect(src).not.toContain('"Repartir entre aviones"');
    expect(src).not.toContain("Leyendo el reparto del gasto");
    expect(src).not.toContain("Sin avión (se puede repartir)");
  });
});
