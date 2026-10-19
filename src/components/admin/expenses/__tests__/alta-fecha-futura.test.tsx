/**
 * «Guardar» del ALTA con fecha futura, por COMPORTAMIENTO (segunda revisión
 * del lote «por pagar», 19-oct-2026: P12, P17 y NUEVO-1). La primera pasada
 * solo vigilaba la FORMA de la llamada en `onSubmit` y un mutante que
 * quitaba (o forzaba) la guarda `categoria === "REFACCION"` seguía en verde.
 *
 * El runner no tiene DOM, así que aquí se corre el `onSubmit` REAL del alta:
 *  - un envoltorio de `react-hook-form` toma el `onValid` que el alta le pasa
 *    a `handleSubmit` (y deja inyectar los valores del formulario, para
 *    pintar el alta con la fecha de MAÑANA);
 *  - `useTransition` es un testigo: `guardarGasto` arranca con
 *    `startTransition`, así que «llegó a guardar» = se pidió una transición
 *    (que se puede correr a mano para ver su toast);
 *  - el `toast` de sonner es un espía.
 * Desenlaces: FRENO (toast con el texto y nada más), CONFIRMA (ni toast ni
 * transición: pide la confirmación de fecha) y GUARDA (una transición).
 */
import type { ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import { CATEGORIAS_CAPTURA } from "@/lib/admin/categorias-gasto";
import { MSG_FECHA_FUTURA_CON_CARGOS, NOTA_QUEDARA_POR_PAGAR } from "@/lib/admin/gasto-por-pagar";
import {
  MSG_INVENTARIO_FECHA_FUTURA,
  NOTA_DIRECTO_AVION_SIN_AVION,
  NOTA_ELIGE_AVION_REFACCION,
  NOTA_REFACCION_POR_PAGAR_SIN_AVION,
} from "@/lib/admin/refaccion-inventario";

const testigos = vi.hoisted(() => ({
  /** El `onValid` que el alta le pasó a `handleSubmit` (su `onSubmit` real). */
  onValid: null as null | ((v: GastoCreateValues) => unknown),
  /** Valores del formulario ENCIMA de los defaults del alta (p. ej. la fecha de mañana). */
  valores: {} as Partial<GastoCreateValues>,
  /** Callbacks de `startTransition` (no corren solos). */
  transiciones: [] as Array<() => unknown>,
  /** Primer argumento de cada `toast.error`. */
  errores: [] as string[],
}));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useTransition: () => [
      false,
      (cb: () => unknown) => {
        testigos.transiciones.push(cb);
      },
    ],
  };
});
vi.mock("react-hook-form", async (importOriginal) => {
  const real = await importOriginal<typeof import("react-hook-form")>();
  const useForm = ((opts?: { defaultValues?: Record<string, unknown> }) => {
    const form = real.useForm({
      ...opts,
      defaultValues: { ...(opts?.defaultValues ?? {}), ...testigos.valores },
    } as Parameters<typeof real.useForm>[0]);
    const handleSubmit = ((onValid: unknown, onInvalid: unknown) => {
      testigos.onValid = onValid as (v: GastoCreateValues) => unknown;
      return (form.handleSubmit as (a: unknown, b: unknown) => unknown)(onValid, onInvalid);
    }) as typeof form.handleSubmit;
    return { ...form, handleSubmit };
  }) as unknown as typeof real.useForm;
  return { ...real, useForm };
});
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: (m: unknown) => {
      testigos.errores.push(String(m));
    },
    success: () => {},
    info: () => {},
    warning: () => {},
  }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  createGastoAction: async () => ({ ok: false }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  leerFacturaIAAction: async () => ({ ok: false }),
  listArticulosRefaccionAction: async () => ({ ok: true, data: [] }),
  listAvionesActivosAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "x" }));
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
vi.mock("@/components/ui/alert-dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-alerta="">{children}</div> : null,
    AlertDialogAction: Caja,
    AlertDialogCancel: Caja,
    AlertDialogContent: Caja,
    AlertDialogDescription: Caja,
    AlertDialogFooter: Caja,
    AlertDialogHeader: Caja,
    AlertDialogTitle: Caja,
  };
});
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: { value: string | null | undefined; placeholder?: string }) => (
    <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} />
  ),
}));

// «Hoy» Cancún = 19-oct-2026 (mediodía); fin de mes = 31-oct.
vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
afterAll(() => vi.useRealTimers());
const { ExpenseCreateDialog } = await import("../expense-create-dialog");
const { PorPagarProvider } = await import("@/components/admin/por-pagar-provider");

const HOY = "2026-10-19";
const MANANA = "2026-10-20";
/** Más allá de fin de mes (oficina hasta +30): sin el freno, pediría la confirmación de fecha. */
const DESPUES_DE_FIN_DE_MES = "2026-11-15";
const CAPACIDAD = { habilitado: true, fechaMax: "2026-11-18" };
const SIN_CAPACIDAD = { habilitado: false, fechaMax: null };
const FLOTA: AvionCatalogoGasto[] = [
  { id: "5a82eb4a-086c-4058-97bd-b2aacdc2e942", matricula: "N4142R", combustible: "AVGAS" },
];
const PROV = [{ id: "7a1c0000-0000-4000-8000-000000000001", nombre: "HSBC" }];
const VUELO = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CARGOS = ["2f95e45b-0000-4000-8000-000000000649", "61baed07-0000-4000-8000-000000000103"];
/** Alta del detalle del vuelo SIN avión prefijado: el destino de la refacción arranca «Directo al avión». */
const DESDE_VUELO_SIN_AVION = { defaultVueloId: VUELO, defaultVueloFolio: 437, defaultCategoria: "REFACCION" };
const CON_CARGOS = {
  conciliarConMovimientos: CARGOS,
  clientRequestId: "9b2c7a10-1d2e-4f30-8a4b-5c6d7e8f9a0b",
  textoExito: () => "ok",
  textoError: () => "error",
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function valores(over: Partial<GastoCreateValues>): GastoCreateValues {
  return {
    categoria: "OPERACIONES",
    monto: "100",
    propina: "",
    litros: "",
    tipo_combustible: "",
    moneda: "MXN",
    fecha_gasto: HOY,
    medio_pago: "EFECTIVO",
    tarjeta_terminacion: "",
    estatus_comprobante: "SIN_COMPROBANTE",
    estatus_facturacion: "PENDIENTE",
    aeronave_id: "",
    vuelo_id: "",
    proveedor_id: "",
    folio_ticket: "",
    tc_gasto: "",
    notas: "",
    ...over,
  };
}

/** Pinta el alta abierta (render estático) con la capacidad dada. */
function pintar(props: Record<string, unknown> = {}, capacidad: typeof CAPACIDAD | typeof SIN_CAPACIDAD = CAPACIDAD) {
  testigos.onValid = null;
  return renderToStaticMarkup(
    <PorPagarProvider capacidad={capacidad}>
      <ExpenseCreateDialog aircraft={FLOTA} providers={PROV} abierto onAbiertoChange={() => {}} {...props} />
    </PorPagarProvider>,
  );
}

type Desenlace = { tipo: "FRENO"; mensaje: string } | { tipo: "CONFIRMA" } | { tipo: "GUARDA" };

/** Abre el alta, toma su `onSubmit` real y lo corre con esos valores. */
function guardar(
  props: Record<string, unknown>,
  over: Partial<GastoCreateValues>,
  capacidad: typeof CAPACIDAD | typeof SIN_CAPACIDAD = CAPACIDAD,
): Desenlace {
  pintar(props, capacidad);
  const onValid = testigos.onValid;
  if (!onValid) throw new Error("el alta no llamó a handleSubmit");
  testigos.errores.length = 0;
  testigos.transiciones.length = 0;
  onValid(valores(over));
  if (testigos.errores.length > 0) {
    // Un freno avisa y NO llega a guardar.
    expect(testigos.transiciones).toHaveLength(0);
    return { tipo: "FRENO", mensaje: testigos.errores[0] };
  }
  return testigos.transiciones.length === 1 ? { tipo: "GUARDA" } : { tipo: "CONFIRMA" };
}

beforeEach(() => {
  testigos.valores = {};
  testigos.errores.length = 0;
  testigos.transiciones.length = 0;
});

describe("el `onSubmit` REAL del alta: el freno de la refacción «A Inventario/Tienda» con fecha futura (P12)", () => {
  it("REFACCION en el alta general (destino «A Inventario/Tienda») con fecha futura ⇒ FRENO con el texto EXACTO del API", () => {
    expect(guardar({}, { categoria: "REFACCION", fecha_gasto: MANANA })).toEqual({
      tipo: "FRENO",
      mensaje: MSG_INVENTARIO_FECHA_FUTURA,
    });
    expect(guardar({}, { categoria: "REFACCION", fecha_gasto: "2026-10-31" })).toEqual({
      tipo: "FRENO",
      mensaje: MSG_INVENTARIO_FECHA_FUTURA,
    });
  });

  it("el freno va ANTES de la confirmación de fecha (más allá de fin de mes no llega a preguntar)", () => {
    expect(guardar({}, { categoria: "REFACCION", fecha_gasto: DESPUES_DE_FIN_DE_MES })).toEqual({
      tipo: "FRENO",
      mensaje: MSG_INVENTARIO_FECHA_FUTURA,
    });
    // Control: otra categoría con esa fecha SÍ pide la confirmación de siempre.
    expect(guardar({}, { categoria: "COMIDA", fecha_gasto: DESPUES_DE_FIN_DE_MES })).toEqual({ tipo: "CONFIRMA" });
  });

  it("CUALQUIER otra categoría por pagar mañana se guarda, aunque el destino del alta general siga en «A Inventario/Tienda»", () => {
    for (const categoria of CATEGORIAS_CAPTURA.filter((c) => c !== "REFACCION")) {
      expect(guardar({}, { categoria, fecha_gasto: MANANA }), categoria).toEqual({ tipo: "GUARDA" });
    }
  });

  it("REFACCION con fecha de hoy, o SIN la capacidad (API previo), se guarda como antes", () => {
    expect(guardar({}, { categoria: "REFACCION", fecha_gasto: HOY })).toEqual({ tipo: "GUARDA" });
    expect(guardar({}, { categoria: "REFACCION", fecha_gasto: MANANA }, SIN_CAPACIDAD)).toEqual({ tipo: "GUARDA" });
  });

  it("REFACCION «Directo al avión» (alta desde el vuelo) con fecha futura NO frena por la fecha", () => {
    expect(guardar(DESDE_VUELO_SIN_AVION, { categoria: "REFACCION", fecha_gasto: MANANA, vuelo_id: VUELO })).toEqual({
      tipo: "GUARDA",
    });
  });
});

describe("el `onSubmit` REAL de «Créalo por la suma» con fecha futura (P17)", () => {
  it("con cargos del banco y fecha futura ⇒ FRENO con el error de los cargos (en cualquier categoría)", () => {
    for (const categoria of ["OTRO", "REFACCION"]) {
      expect(guardar(CON_CARGOS, { categoria, fecha_gasto: MANANA }), categoria).toEqual({
        tipo: "FRENO",
        mensaje: MSG_FECHA_FUTURA_CON_CARGOS,
      });
    }
  });

  it("con cargos y la fecha de hoy, o SIN la capacidad, se guarda", () => {
    expect(guardar(CON_CARGOS, { categoria: "OTRO", fecha_gasto: HOY })).toEqual({ tipo: "GUARDA" });
    expect(guardar(CON_CARGOS, { categoria: "OTRO", fecha_gasto: MANANA }, SIN_CAPACIDAD)).toEqual({ tipo: "GUARDA" });
  });
});

describe("refacción por pagar SIN avión: los avisos ya no se mandan uno al otro (NUEVO-1)", () => {
  const SALIDA_DIRECTO = `${NOTA_ELIGE_AVION_REFACCION} ${NOTA_REFACCION_POR_PAGAR_SIN_AVION}`;

  it("alta general REFACCION con fecha de mañana: el bloque del destino dice el texto del API Y la salida real", () => {
    testigos.valores = { fecha_gasto: MANANA };
    const html = pintar({ defaultCategoria: "REFACCION" });
    const i = html.indexOf("data-error-inventario-fecha-futura");
    expect(i).toBeGreaterThan(-1);
    const aviso = html.slice(i, html.indexOf("</div>", i));
    expect(aviso).toContain(`>${esc(MSG_INVENTARIO_FECHA_FUTURA)}<`);
    expect(aviso).toContain("data-salida-inventario-fecha-futura");
    expect(aviso).toContain(`>${esc(NOTA_REFACCION_POR_PAGAR_SIN_AVION)}<`);
    // La fecha de mañana también lleva la nota de «por pagar».
    expect(html).toContain(NOTA_QUEDARA_POR_PAGAR);
  });

  it("con la fecha de hoy el bloque no avisa nada", () => {
    const html = pintar({ defaultCategoria: "REFACCION" });
    expect(html).not.toContain("data-error-inventario-fecha-futura");
    expect(html).not.toContain(esc(NOTA_REFACCION_POR_PAGAR_SIN_AVION));
  });

  it("«Directo al avión» sin avión y con fecha de mañana: la nota dice la salida real, no «pásala a Inventario/Tienda»", () => {
    testigos.valores = { fecha_gasto: MANANA };
    const html = pintar(DESDE_VUELO_SIN_AVION);
    expect(html).toContain(`>${esc(SALIDA_DIRECTO)}<`);
    expect(html).not.toContain("pásala a Inventario/Tienda");
  });

  it("«Directo al avión» sin avión: con la fecha de hoy, o sin la capacidad, la nota de siempre", () => {
    expect(pintar(DESDE_VUELO_SIN_AVION)).toContain(`>${esc(NOTA_DIRECTO_AVION_SIN_AVION)}<`);
    testigos.valores = { fecha_gasto: MANANA };
    expect(pintar(DESDE_VUELO_SIN_AVION, SIN_CAPACIDAD)).toContain(`>${esc(NOTA_DIRECTO_AVION_SIN_AVION)}<`);
  });

  it("«Guardar» de «Directo al avión» sin avión con fecha de mañana: el toast dice la salida real (y con hoy, el de siempre)", async () => {
    const correr = async (fecha: string, capacidad: typeof CAPACIDAD | typeof SIN_CAPACIDAD = CAPACIDAD) => {
      const d = guardar(DESDE_VUELO_SIN_AVION, { categoria: "REFACCION", fecha_gasto: fecha, vuelo_id: VUELO }, capacidad);
      expect(d).toEqual({ tipo: "GUARDA" });
      await testigos.transiciones[0]();
      return [...testigos.errores];
    };
    expect(await correr(MANANA)).toEqual([SALIDA_DIRECTO]);
    expect(await correr(HOY)).toEqual([NOTA_DIRECTO_AVION_SIN_AVION]);
    expect(await correr(MANANA, SIN_CAPACIDAD)).toEqual([NOTA_DIRECTO_AVION_SIN_AVION]);
  });
});
