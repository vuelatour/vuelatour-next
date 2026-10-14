/**
 * «TUA incluida en este gasto» en la UI (13-oct-2026, API 0.0.75 + migración
 * 20261013000008). Caso real #383: factura del aeropuerto de $1,925.27 con la
 * TUA ($559.63 con IVA) leída como «Autobuses».
 *
 *  1. «Verificar / editar» REAL (render): el campo sale SOLO con la llave
 *     `tua_incluida` del API y en Operaciones/Aterrizaje/FBO; ayuda según lo
 *     que leyó la IA; la cifra vigente de oficina se dice; el error local se
 *     ve mientras se escribe.
 *  2. Historial de gastos del vuelo (render): «TUA incluida: Lectura de la IA
 *     → $3,443.89».
 *  3. Pre-cierre (render): el renglón `tua_cobrada_sin_pagada` con sus chips,
 *     su monto y «Resolver →» a Gastos; la lectura fallida «sin verificar».
 *  4. Cableado del guardado por regex sobre el fuente (el runner no tiene DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
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
vi.mock("@/components/admin/comprobante-preview", () => ({
  ComprobantePreview: () => null,
}));
vi.mock("@/components/admin/flights/historial-gasto-editar", () => ({
  HistorialGastoEditar: () => null,
}));
// Pre-cierre: el server component lee el API; aquí se le da la respuesta.
const preCierre = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => preCierre(...a) }));
// Diálogo abierto sin portal y selectores como testigos.
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
  }) => <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} />,
}));

const { ExpenseVerifyDialog } = await import("../expense-verify-dialog");
const { FlightGastosHistorialCard } = await import(
  "@/components/admin/flights/flight-gastos-historial-card"
);
const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");

/** El gasto #383 tal como quedó: OPERACIONES con vuelo, sin cifra de oficina. */
function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "8c60e428-0000-4000-8000-000000000383",
    vuelo_id: "v-383",
    aeronave_id: "av-1",
    usuario_captura_id: "u-1",
    categoria: "OPERACIONES",
    monto: "1925.27",
    propina: null,
    moneda: "MXN",
    tc_gasto: "18.2",
    fecha_gasto: "2026-10-08",
    proveedor_id: null,
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: {
      conceptos: [
        { concepto: "Operaciones", monto: 1365.64 },
        { concepto: "Autobuses", monto: 559.63 },
      ],
    },
    conciliado: false,
    duplicado_sospechado: false,
    notas: null,
    created_at: "2026-10-08T17:00:00Z",
    tua_incluida: null,
    tua_detectada_ia: 559.63,
    ...over,
  } as Gasto;
}

const FLOTA: AvionCatalogoGasto[] = [{ id: "av-1", matricula: "N990GG", combustible: "AVGAS" }];

const verificar = (g: Gasto) =>
  renderToStaticMarkup(
    <ExpenseVerifyDialog open onOpenChange={() => {}} gasto={g} aircraft={FLOTA} providers={[]} />,
  );

const ETIQUETA = "TUA incluida en este gasto";

describe("«Verificar / editar» (render real)", () => {
  it("OPERACIONES con la llave y TUA detectada ⇒ campo, placeholder y ayuda de la IA", () => {
    const html = verificar(gasto());
    expect(html).toContain(ETIQUETA);
    expect(html).toContain('placeholder="IA: 559.63"');
    expect(html).toContain('name="tua_incluida"');
    expect(html).toContain(
      "La IA detectó una TUA de $559.63 MXN (IVA incluido) y se separa sola del costo del avión. Escribe otro importe para corregirla, o 0 si esta factura no cobra TUA.",
    );
    // Sin cifra de oficina no hay nota de «Vigente».
    expect(html).not.toContain("Vigente: fijada por oficina");
    // El campo va JUSTO debajo de Monto/Propina, antes del total pagado.
    expect(html.indexOf("Propina")).toBeLessThan(html.indexOf(ETIQUETA));
    expect(html.indexOf(ETIQUETA)).toBeLessThan(html.indexOf("Total pagado:"));
  });

  it("COMIDA ⇒ sin el campo", () => {
    expect(verificar(gasto({ categoria: "COMIDA" }))).not.toContain(ETIQUETA);
  });

  it("API viejo (sin la llave `tua_incluida`) ⇒ sin el campo", () => {
    const viejo = gasto();
    delete (viejo as { tua_incluida?: unknown }).tua_incluida;
    delete (viejo as { tua_detectada_ia?: unknown }).tua_detectada_ia;
    expect(verificar(viejo)).not.toContain(ETIQUETA);
  });

  it("cifra de oficina 700 ⇒ el valor manda: ayuda de «se separa» y nota de la vigente", () => {
    const html = verificar(gasto({ tua_incluida: "700.00" }));
    expect(html).toContain(ETIQUETA);
    expect(html).toContain(
      "Esta TUA (IVA incluido) se separa del costo del avión y va a «Otros movimientos» del Balance general, junto a la TUA cobrada al cliente.",
    );
    expect(html).toContain(
      "Vigente: fijada por oficina ($700 MXN). Borra el valor y guarda para volver a la lectura de la IA.",
    );
  });

  it("cifra de oficina 0 ⇒ «Sin TUA» y su nota", () => {
    const html = verificar(gasto({ tua_incluida: 0 }));
    expect(html).toContain("Sin TUA: todo el ticket cuenta como costo del avión aunque la IA haya leído otra cosa.");
    expect(html).toContain("Vigente: fijada por oficina (sin TUA).");
  });

  it("solo leída (tua_monto que la IA no pudo separar) ⇒ la sugerencia", () => {
    const html = verificar(
      gasto({ tua_detectada_ia: null, valor_ia_extraido: { conceptos: [], tua_monto: 559.63 } }),
    );
    expect(html).toContain('placeholder="0.00"');
    expect(html).toContain(
      "La IA leyó una TUA de $559.63 MXN, pero no la pudo separar del desglose del comprobante. Si es correcta, escríbela aquí.",
    );
  });

  it("sin vuelo ⇒ se agrega que la TUA solo se separa con vuelo", () => {
    const html = verificar(gasto({ vuelo_id: null, tua_detectada_ia: null, valor_ia_extraido: null }));
    expect(html).toContain(
      "La IA no separó ninguna TUA de este comprobante. Si la factura la cobra, escribe aquí el importe con IVA; vacío = sin TUA. Este gasto no tiene vuelo: la TUA solo se separa cuando el gasto está ligado a un vuelo.",
    );
  });

  it("una cifra mayor que el ticket ⇒ el MISMO texto del 400, en rojo y con role=alert", () => {
    const html = verificar(gasto({ monto: "600", tua_incluida: "700.00" }));
    expect(html).toMatch(
      /role="alert"[^>]*>La TUA incluida \(\$700 MXN\) no puede ser mayor que el monto del ticket \(\$600 MXN, sin propina\)\.</,
    );
  });
});

describe("historial de gastos del vuelo (render)", () => {
  it("«TUA incluida: Lectura de la IA → $3,443.89»; y al revés", () => {
    const html = renderToStaticMarkup(
      <FlightGastosHistorialCard
        eventos={[
          {
            gasto_id: "g-118",
            accion: "UPDATE",
            actor_nombre: "Mari",
            created_at: "2026-10-14T16:00:00Z",
            diff: { tua_incluida: { antes: null, despues: 3443.89 } },
            descripcion_gasto: "Operaciones · $3,632.61 MXN",
          },
          {
            gasto_id: "g-118",
            accion: "UPDATE",
            actor_nombre: "Mari",
            created_at: "2026-10-14T17:00:00Z",
            diff: { tua_incluida: { antes: "3443.89", despues: null } },
            descripcion_gasto: "Operaciones · $3,632.61 MXN",
          },
        ]}
      />,
    );
    expect(html).toMatch(
      /TUA incluida:<\/span> <span class="line-through text-muted-foreground">Lectura de la IA<\/span> → <span class="font-medium">\$3,443\.89<\/span>/,
    );
    expect(html).toMatch(
      /TUA incluida:<\/span> <span class="line-through text-muted-foreground">\$3,443\.89<\/span> → <span class="font-medium">Lectura de la IA<\/span>/,
    );
    expect(html).not.toContain("se agregó");
    expect(html).not.toContain("se quitó");
  });
});

describe("pre-cierre: TUA cobrada sin TUA pagada (render)", () => {
  const V1 = "a1b2c3d4-0000-4000-8000-000000000384";
  const V2 = "a1b2c3d4-0000-4000-8000-000000000417";
  const item = {
    clave: "tua_cobrada_sin_pagada",
    titulo: "Vuelos con TUA cobrada al cliente sin TUA pagada",
    detalle: "Vuelos completados del periodo cuya cotización cobró TUA…",
    count: 2,
    monto_usd: 120.5,
    vuelos: [
      { id: V1, folio: 384, fecha_vuelo: "2026-10-03", matricula: "N990GG", tua_cobrada_usd: 70.5 },
      { id: V2, folio: 417, fecha_vuelo: "2026-10-09", matricula: null, tua_cobrada_usd: 50 },
    ],
    lectura_fallida: false,
  };

  it("chips a cada vuelo, monto en USD y «Resolver →» a Gastos; no bloquea (listo)", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-10-01", hasta: "2026-10-31" },
      listo: true,
      items: [item],
    });
    const html = renderToStaticMarkup(await PreCierreCard({ desde: "2026-10-01", hasta: "2026-10-31" }));
    expect(html).toContain("Vuelos con TUA cobrada al cliente sin TUA pagada");
    expect(html).toContain("$120.5 USD");
    expect(html).toContain(`href="/admin/flights/${V1}"`);
    expect(html).toContain(">#384<");
    expect(html).toContain(`href="/admin/flights/${V2}"`);
    expect(html).toMatch(/href="\/admin\/expenses"[^>]*>Resolver →</);
  });

  it("lectura fallida ⇒ el renglón se pinta «sin verificar» (nunca desaparece)", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-10-01", hasta: "2026-10-31" },
      listo: true,
      items: [{ ...item, count: 0, monto_usd: 0, vuelos: [], lectura_fallida: true }],
    });
    const html = renderToStaticMarkup(await PreCierreCard({ desde: "2026-10-01", hasta: "2026-10-31" }));
    expect(html).toContain("Vuelos con TUA cobrada al cliente sin TUA pagada");
    expect(html).toContain("· sin verificar");
  });
});

describe("cableado", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const verif = leer("../expense-verify-dialog.tsx");
  const historial = leer("../../flights/flight-gastos-historial-card.tsx");
  const precierre = leer("../../reportes/pre-cierre-card.tsx");
  const guardar = verif.slice(
    verif.indexOf("const guardarVerificacion"),
    verif.indexOf("const onSubmit = handleSubmit"),
  );

  it("el guardado: borra la llave del formulario, valida y luego decide qué viaja", () => {
    expect(guardar).toContain("delete (payload as { tua_incluida?: unknown }).tua_incluida;");
    const valida = guardar.indexOf("errorTuaIncluida(");
    const patch = guardar.indexOf("tuaIncluidaParaPatch(");
    expect(valida).toBeGreaterThan(-1);
    expect(patch).toBeGreaterThan(valida);
    expect(guardar).toMatch(/tuaIncluidaParaPatch\(\{[\s\S]*?monedaCambio: values\.moneda !== gasto\.moneda/);
    expect(guardar).toContain("if (tuaPatch !== undefined) payload.tua_incluida = tuaPatch;");
    // Se valida contra el ticket NUEVO (o el guardado si el monto quedó vacío).
    expect(guardar).toContain("ticket: ticket > 0 ? ticket : Number(gasto.monto) - Number(gasto.propina ?? 0)");
    // DESPUÉS del bloque monto/propina (el ticket ya se validó).
    expect(guardar.indexOf('toast.error("Captura el monto del ticket.")')).toBeLessThan(valida);
  });

  it("la lectura fresca no persiste el cálculo `tua_detectada` (sí `tua_monto`)", () => {
    expect(guardar).toContain("delete lectura.tua_detectada;");
    expect(guardar).not.toContain("delete lectura.tua_monto");
  });

  it("defaults y visibilidad salen del helper (el panel no calcula ninguna TUA)", () => {
    expect(verif).toContain("tua_incluida: valorFormTuaIncluida(g),");
    expect(verif).toContain(
      'const tuaVisible = apiConTuaIncluida(gasto) && categoriaAdmiteTuaIncluida(watch("categoria"));',
    );
    expect(verif).toContain("aiRaw ? (aiRaw.tua_detectada ?? null) : (gasto.tua_detectada_ia ?? null)");
    expect(verif).toContain("aiRaw ? (aiRaw.tua_monto ?? null) : tuaLeidaIa(gasto.valor_ia_extraido)");
    expect(verif).not.toMatch(/"TUA incluida en este gasto"/);
  });

  it("historial y pre-cierre", () => {
    expect(historial).toMatch(/tua_incluida: ["']TUA incluida["']/);
    expect(historial).toContain('if (campo === "tua_incluida" && v == null) return "Lectura de la IA";');
    expect(precierre).toContain('tua_cobrada_sin_pagada: () => "/admin/expenses"');
  });
});
