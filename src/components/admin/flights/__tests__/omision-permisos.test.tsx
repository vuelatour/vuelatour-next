/**
 * Revisión del lote 0.0.81 (15-oct-2026), barra del vuelo con tacómetro
 * omitido:
 *  1. FACTURACION puede omitir, pero `POST :id/start` y `POST :id/complete`
 *     le responden 403 «Required role: … Current: FACTURACION» (inglés). Sin
 *     `puedeCompletar` la barra NO pinta «Completar vuelo» ni «Iniciar y
 *     completar» por omisión.
 *  2. «Completar vuelo» reusa `handleComplete`: jamás un `await` desnudo en
 *     la transición (un «Failed to find Server Action» tras un deploy mandaba
 *     el detalle al boundary) y un texto técnico se cambia por «El servidor
 *     no respondió…».
 *  3. Cableado: las páginas pasan `esRolCompletarVuelo(me?.rol)`.
 *
 * Sin DOM: `renderToStaticMarkup` con los diálogos SIEMPRE pintados en línea;
 * se capturan los `onClick` de sus botones y `useTransition` corre el
 * callback al instante para poder esperarlo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightListItem } from "@/types/flights";

const h = vi.hoisted(() => ({
  transiciones: [] as Promise<unknown>[],
  clicks: [] as { texto: string; onClick?: (e: { preventDefault: () => void }) => void }[],
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useTransition: () =>
      [
        false,
        (fn: () => unknown) => {
          h.transiciones.push(Promise.resolve().then(fn));
        },
      ] as const,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: h.toastError,
    success: h.toastSuccess,
    info: () => {},
  }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  completeFlightAction: h.complete,
  iniciarYCompletarVueloAction: async () => ({ ok: true }),
  startFlightAction: async () => ({ ok: true }),
  updatePermisoAction: async () => ({ ok: true }),
}));
vi.mock("../flight-assign-sheet", () => ({ FlightAssignSheet: () => null }));
vi.mock("../flight-meta-sheet", () => ({ FlightMetaSheet: () => null }));
vi.mock("../cubrir-externo-dialog", () => ({ CubrirExternoDialog: () => null }));
vi.mock("../combinar-vuelos-dialog", () => ({ CombinarVuelosDialog: () => null }));
vi.mock("../flight-danger-actions", () => ({ FlightDangerActions: () => null }));
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Boton = ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: (e: { preventDefault: () => void }) => void;
  }) => {
    h.clicks.push({ texto: String(children), onClick });
    return <button type="button">{children}</button>;
  };
  return {
    AlertDialog: Pasa,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Boton,
    AlertDialogCancel: Boton,
  };
});

const { FlightActionsBar } = await import("../flight-actions-bar");
const { MSG_SERVIDOR_NO_RESPONDIO } = await import("@/lib/admin/errores-tecnicos");

const vuelo = (p: Partial<FlightListItem> = {}) =>
  ({
    id: "6c0e3f7a-1b2d-4e5f-8a9b-0c1d2e3f4a5b",
    folio: 300,
    estado: "EN_VUELO",
    es_externo: false,
    aeronave_id: "a1",
    piloto_id: "p1",
    estado_permiso: "no_aplica",
    combinado_con_id: null,
    ...p,
  }) as FlightListItem;

const COMPLETABLE = { completable: true, requiereIniciar: false, omitidos: 1 };
const REQUIERE_INICIAR = { completable: false, requiereIniciar: true, omitidos: 1 };

/** Botones VISIBLES de la barra (fuera de los diálogos, que aquí siempre se pintan). */
function botonesBarra(html: string): string {
  // Los diálogos empiezan en el primer <div><div> (AlertDialog > Content).
  const i = html.indexOf("<div><div>");
  return i === -1 ? html : html.slice(0, i);
}

beforeEach(() => {
  h.transiciones.length = 0;
  h.clicks.length = 0;
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
  h.complete.mockReset();
});

describe("FACTURACION (sin puedeCompletar) no ve completar por omisión", () => {
  it("#300 EN_VUELO completable: sin «Completar vuelo» en la barra", () => {
    const html = botonesBarra(
      renderToStaticMarkup(
        <FlightActionsBar flight={vuelo()} aircraft={[]} pilots={[]} omision={COMPLETABLE} />,
      ),
    );
    expect(html).not.toContain("Completar vuelo");
    expect(html).not.toContain("Cerrar vuelo");
  });

  it("#301 CONFIRMADO nunca iniciado: sin «Iniciar y completar»", () => {
    const html = botonesBarra(
      renderToStaticMarkup(
        <FlightActionsBar
          flight={vuelo({ folio: 301, estado: "CONFIRMADO" })}
          aircraft={[]}
          pilots={[]}
          omision={REQUIERE_INICIAR}
          puedeCompletar={false}
        />,
      ),
    );
    expect(html).not.toContain("Iniciar y completar");
  });

  it("con puedeCompletar (ADMIN/COORDINADOR) sí se ofrecen", () => {
    const a = botonesBarra(
      renderToStaticMarkup(
        <FlightActionsBar flight={vuelo()} aircraft={[]} pilots={[]} omision={COMPLETABLE} puedeCompletar />,
      ),
    );
    expect(a).toContain("Completar vuelo</button>");
    const b = botonesBarra(
      renderToStaticMarkup(
        <FlightActionsBar
          flight={vuelo({ estado: "CONFIRMADO" })}
          aircraft={[]}
          pilots={[]}
          omision={REQUIERE_INICIAR}
          puedeCompletar
        />,
      ),
    );
    expect(b).toContain("Iniciar y completar</button>");
  });
});

/** Pinta la barra completable y pulsa «Completar vuelo» del diálogo. */
async function pulsarCompletar() {
  renderToStaticMarkup(
    <FlightActionsBar flight={vuelo()} aircraft={[]} pilots={[]} omision={COMPLETABLE} puedeCompletar />,
  );
  const accion = h.clicks.find((c) => c.texto === "Completar vuelo" && c.onClick);
  expect(accion).toBeDefined();
  accion!.onClick!({ preventDefault: () => {} });
  expect(h.transiciones).toHaveLength(1);
  // No debe rechazar: un rechazo aquí es lo que llega al error boundary.
  await expect(h.transiciones[0]).resolves.toBeUndefined();
}

describe("«Completar vuelo» (handleComplete) nunca revienta la transición", () => {
  it("la server action lanza («Failed to find Server Action» tras un deploy): toast es-MX", async () => {
    h.complete.mockRejectedValue(
      new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'),
    );
    await pulsarCompletar();
    expect(h.toastError).toHaveBeenCalledWith(MSG_SERVIDOR_NO_RESPONDIO);
  });

  it("un texto técnico del resultado se cambia por «El servidor no respondió…»", async () => {
    h.complete.mockResolvedValue({ ok: false, error: "fetch failed" });
    await pulsarCompletar();
    expect(h.toastError).toHaveBeenCalledWith(MSG_SERVIDOR_NO_RESPONDIO);
  });

  it("un mensaje es-MX del API se pinta tal cual", async () => {
    h.complete.mockResolvedValue({ ok: false, error: "Faltan lecturas de llegada" });
    await pulsarCompletar();
    expect(h.toastError).toHaveBeenCalledWith("Faltan lecturas de llegada");
  });

  it("éxito: «Vuelo #300 completado»", async () => {
    h.complete.mockResolvedValue({ ok: true });
    await pulsarCompletar();
    expect(h.toastSuccess).toHaveBeenCalledWith("Vuelo #300 completado");
  });
});

describe("cableado de puedeCompletar en las páginas", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");

  it("detalle del vuelo: barra y card reciben esRolCompletarVuelo(me?.rol)", () => {
    const src = leer("app/admin/flights/[id]/page.tsx");
    expect(src.match(/puedeCompletar=\{esRolCompletarVuelo\(me\?\.rol\)\}/g)).toHaveLength(2);
  });

  it("Tacómetros en vivo: el tablero lo recibe", () => {
    const src = leer("app/admin/taco-live/page.tsx");
    expect(src).toContain("const puedeCompletar = esRolCompletarVuelo(me?.rol);");
    expect(src).toContain("puedeCompletar={puedeCompletar}");
  });

  it("el diálogo pasa el permiso a mensajeOmision y la card/tablero se lo dan", () => {
    expect(leer("components/admin/flights/taco-omitir-dialog.tsx")).toContain(
      "mensajeOmision(data, faltanOtras, puedeCompletar)",
    );
    expect(leer("components/admin/flights/escalas-card.tsx")).toContain(
      "puedeCompletar={puedeCompletar}",
    );
    expect(leer("components/admin/taco-live/taco-live-board.tsx")).toContain(
      "puedeCompletar={omision.puedeCompletar === true}",
    );
  });

  it("lista de vuelos: taco-status de todo vuelo propio no cancelado y triángulo por estado", () => {
    const src = leer("app/admin/flights/page.tsx");
    expect(src).toContain("const tacoRelevantes = flightsRes.data.filter(pideTacoStatusEnLista);");
    expect(src).toContain("faltaTacoEnLista(v.estado, taco.status[v.id]?.falta)");
  });
});
