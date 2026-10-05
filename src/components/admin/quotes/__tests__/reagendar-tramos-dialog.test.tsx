/**
 * Modal «Se actualizó la fecha de la cotización» (5-oct-2026).
 *
 * Qué se custodia:
 *  1. RENDER: título, las DOS fechas (día Cancún, «7 de octubre de 2026»), la
 *     nota de «solo fecha / las horas se editan en el vuelo» y los dos
 *     botones con `cursor-pointer`; cerrado no pinta nada.
 *  2. CABLEADO del workspace: el diálogo se abre SOLO desde `onGuardado` vía
 *     `decidirPreguntaReagendar`, después del toast del guardado y sin frenar
 *     el `router.refresh()` del cotizador; se monta FUERA del cotizador.
 *  3. La HOJA no se toca: ningún `quote-sheet*.tsx` (cliente ni interna) ni el
 *     cotizador importan el diálogo ni la fuente única de la decisión.
 *  4. El diálogo llama a la action UNA sola vez, solo desde «Sí».
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_MOVER,
  BOTON_SOLO_COTIZACION,
  NOTA_SOLO_FECHA,
  TITULO_REAGENDAR,
} from "@/lib/admin/quote-fecha-operativa";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
// La server action (red, sesión) no es parte de este test.
vi.mock("@/app/admin/flights/actions", () => ({ alinearFechaTramosAction: vi.fn() }));
// El AlertDialog de Base UI se monta en un portal (no existe en el render del
// server): aquí se pinta en línea, abierto o cerrado según `open`, y los
// botones conservan su `className`.
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Boton = ({
    children,
    className,
    disabled,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
  }) => (
    <button type="button" className={className} disabled={disabled}>
      {children}
    </button>
  );
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    AlertDialogAction: Boton,
    AlertDialogCancel: Boton,
  };
});

const { ReagendarTramosDialog } = await import("../reagendar-tramos-dialog");

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";

const pintar = (abierto: boolean) =>
  renderToStaticMarkup(
    <ReagendarTramosDialog
      abierto={abierto}
      // 22:30 del 7 en Cancún (03:30Z del 8): el modal dice el 7.
      nuevaFecha="2026-10-08T03:30:00.000Z"
      fechaOperativa="2026-10-05T15:00:00.000Z"
      vueloId={VUELO}
      onCerrar={() => {}}
    />,
  );

/** El texto sin etiquetas (React escapa los acentos tal cual en UTF-8). */
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("render del modal", () => {
  it("título, las dos fechas en día Cancún y la nota de «solo fecha»", () => {
    const html = pintar(true);
    const t = texto(html);
    expect(t).toContain(TITULO_REAGENDAR);
    expect(t).toContain("La cotización ahora dice el 7 de octubre de 2026.");
    expect(t).toContain(
      "El vuelo operativo (sus tramos) sigue programado para el 5 de octubre de 2026.",
    );
    expect(t).toContain("¿Quieres mover también el vuelo operativo a la fecha nueva?");
    expect(t).toContain(NOTA_SOLO_FECHA);
    expect(t).not.toContain("8 de octubre");
  });

  it("dos botones, los dos con cursor-pointer y habilitados", () => {
    const html = pintar(true);
    const botones = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(botones.map((b) => b[2])).toEqual([BOTON_SOLO_COTIZACION, BOTON_MOVER]);
    for (const [, attrs] of botones) {
      expect(attrs).toMatch(/class="[^"]*\bcursor-pointer\b/);
      expect(attrs).not.toContain("disabled");
    }
  });

  it("sin error no hay alerta roja; cerrado no pinta nada", () => {
    expect(pintar(true)).not.toContain('role="alert"');
    expect(pintar(false)).toBe("");
  });
});

// ───────────────────────────── Cableado ─────────────────────────────

const DIR_QUOTES = path.resolve(__dirname, "..");
const leer = (archivo: string) => readFileSync(path.resolve(DIR_QUOTES, archivo), "utf8");
const workspace = leer("quote-workspace.tsx");
const calculadora = leer("quote-calculator.tsx");
const dialogo = leer("reagendar-tramos-dialog.tsx");

describe("cableado — el workspace abre el modal SOLO tras guardar", () => {
  it("usa la fuente única y el diálogo nuevo", () => {
    expect(workspace).toContain(
      'import { ReagendarTramosDialog } from "@/components/admin/quotes/reagendar-tramos-dialog";',
    );
    expect(workspace).toContain(
      'import { decidirPreguntaReagendar } from "@/lib/admin/quote-fecha-operativa";',
    );
  });

  it("`onGuardado` decide con `decidirPreguntaReagendar({ antes: quote, despues: guardada })`", () => {
    expect(workspace).toContain("onGuardado={alGuardarCotizacion}");
    expect(workspace).not.toContain("onGuardado={() => undefined}");
    const inicio = workspace.indexOf("const alGuardarCotizacion = (guardada: PersistedQuote) => {");
    expect(inicio).toBeGreaterThan(0);
    const fin = workspace.indexOf("\n  };", inicio);
    const cuerpo = workspace.slice(inicio, fin);
    expect(cuerpo).toContain(
      "const decision = decidirPreguntaReagendar({ antes: quote, despues: guardada });",
    );
    expect(cuerpo).toContain("if (!decision.preguntar) return;");
    expect(cuerpo).toContain("setReagendarAbierto(true);");
    // Es el ÚNICO lugar que abre el modal.
    expect(workspace.match(/setReagendarAbierto\(true\)/g)).toHaveLength(1);
    expect(workspace.match(/decidirPreguntaReagendar\(/g)).toHaveLength(1);
  });

  it("el diálogo va FUERA del cotizador (después del formulario de cobro)", () => {
    const calc = workspace.indexOf("<QuoteCalculator");
    const cobro = workspace.indexOf("<CobroFormSheet");
    const modal = workspace.indexOf("<ReagendarTramosDialog");
    expect(calc).toBeGreaterThan(0);
    expect(modal).toBeGreaterThan(cobro);
    expect(cobro).toBeGreaterThan(calc);
    expect(workspace).toContain("vueloId={quote.id}");
    expect(workspace).toContain("onCerrar={() => setReagendarAbierto(false)}");
  });

  it("el cotizador llama a onGuardado DESPUÉS del toast y ANTES de su router.refresh()", () => {
    const toastOk = calculadora.indexOf("toast.success(\n          `Cotización #${res.data.folio} guardada");
    const guardado = calculadora.indexOf("onGuardado(res.data);");
    const refresh = calculadora.indexOf("router.refresh();", guardado);
    expect(toastOk).toBeGreaterThan(0);
    expect(guardado).toBeGreaterThan(toastOk);
    expect(refresh).toBeGreaterThan(guardado);
    // `onGuardado` es síncrono: el modal no frena el refresh.
    expect(calculadora).not.toMatch(/await\s+onGuardado/);
  });
});

describe("la HOJA de cotización no se toca", () => {
  const hojas = readdirSync(DIR_QUOTES).filter((f) => /^quote-sheet.*\.tsx?$/.test(f));

  it("hay hojas que vigilar (cliente e interna)", () => {
    expect(hojas).toEqual(expect.arrayContaining(["quote-sheet.tsx", "quote-sheet-interna.tsx"]));
  });

  it("ninguna hoja ni el cotizador importan el diálogo ni la decisión", () => {
    for (const archivo of [...hojas, "quote-calculator.tsx"]) {
      const src = leer(archivo);
      expect(src, archivo).not.toContain("reagendar-tramos-dialog");
      expect(src, archivo).not.toContain("quote-fecha-operativa");
      expect(src, archivo).not.toContain("ReagendarTramosDialog");
    }
  });
});

describe("el diálogo mueve la operación UNA vez, solo desde «Sí»", () => {
  it("una sola llamada a la action, dentro de `mover`", () => {
    expect(dialogo.match(/alinearFechaTramosAction\(/g)).toHaveLength(1);
    const mover = dialogo.slice(dialogo.indexOf("const mover = () => {"));
    expect(mover.indexOf("await alinearFechaTramosAction(vueloId)")).toBeGreaterThan(0);
    // El «Sí» previene el cierre automático: si falla, el diálogo se queda.
    expect(dialogo).toMatch(/e\.preventDefault\(\);\s*mover\(\);/);
  });

  it("error ⇒ se queda abierto con el mensaje; éxito ⇒ toast, cerrar y refresh", () => {
    expect(dialogo).toContain("setError(mensajeErrorReagendar(res));");
    expect(dialogo).toMatch(
      /toast\.success\(toastReagendado\(res\.data\)\);\s*onCerrar\(\);\s*router\.refresh\(\);/,
    );
    // «No» / Esc: toast informativo y se cierra; mientras guarda no se cierra.
    expect(dialogo).toMatch(/if \(pending\) return;\s*setError\(null\);\s*toast\.info\(TOAST_NO_MOVIDO\);/);
    expect(dialogo).toContain("disabled={pending}");
  });
});
