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
 *  4. El diálogo llama a la action UNA sola vez, solo desde «Sí», y SIEMPRE
 *     a través de `moverVueloOperativo` (nunca lanza: un throw de la server
 *     action ya no escapa al error boundary — revisión 5-oct-2026; su
 *     comportamiento se prueba con la action mockeada en
 *     `lib/admin/__tests__/quote-fecha-operativa.test.ts`).
 *  5. Variante `contexto="vuelo"` (banda del detalle del vuelo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_AHORA_NO,
  BOTON_MOVER,
  BOTON_SOLO_COTIZACION,
  NOTA_SOLO_FECHA,
  NOTA_SOLO_FECHA_VUELO,
  TITULO_MOVER_DESDE_VUELO,
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

  it("desde el DETALLE DEL VUELO: su título, su nota y «Ahora no»", () => {
    const html = renderToStaticMarkup(
      <ReagendarTramosDialog
        contexto="vuelo"
        abierto
        nuevaFecha="2026-10-08T03:30:00.000Z"
        fechaOperativa="2026-10-05T15:00:00.000Z"
        vueloId={VUELO}
        onCerrar={() => {}}
      />,
    );
    const t = texto(html);
    expect(t).toContain(TITULO_MOVER_DESDE_VUELO);
    expect(t).not.toContain(TITULO_REAGENDAR);
    expect(t).toContain("La cotización dice el 7 de octubre de 2026.");
    expect(t).toContain("sigue programado para el 5 de octubre de 2026.");
    expect(t).toContain(NOTA_SOLO_FECHA_VUELO);
    const botones = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(botones.map((b) => b[2])).toEqual([BOTON_AHORA_NO, BOTON_MOVER]);
    for (const [, attrs] of botones) expect(attrs).toMatch(/class="[^"]*\bcursor-pointer\b/);
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
  it("una sola llamada a la action, dentro de `mover` y envuelta en `moverVueloOperativo`", () => {
    expect(dialogo.match(/alinearFechaTramosAction\(/g)).toHaveLength(1);
    const mover = dialogo.slice(dialogo.indexOf("const mover = () => {"));
    expect(
      mover.indexOf("await moverVueloOperativo(() => alinearFechaTramosAction(vueloId))"),
    ).toBeGreaterThan(0);
    // Ningún `await` directo a la action: si lanzara, escaparía de la
    // transición al error boundary (revisión 5-oct-2026).
    expect(dialogo).not.toMatch(/await\s+alinearFechaTramosAction/);
    // El «Sí» previene el cierre automático: si falla, el diálogo se queda.
    expect(dialogo).toMatch(/e\.preventDefault\(\);\s*mover\(\);/);
  });

  it("error ⇒ se queda abierto con el mensaje (y refresca si pudo mover); éxito ⇒ toast, cerrar y refresh", () => {
    expect(dialogo).toMatch(
      /if \(!r\.ok\) \{\s*setError\(r\.error\);\s*if \(r\.refrescar\) \{\s*setQuizaMovio\(true\);\s*router\.refresh\(\);\s*\}\s*return;\s*\}/,
    );
    expect(dialogo).toMatch(
      /toast\.success\(r\.toast\);\s*onCerrar\(\);\s*router\.refresh\(\);/,
    );
    expect(dialogo).toContain("disabled={pending}");
  });

  it("«No» / Esc: el toast sale de `toastAlCerrarSinMover` (neutro si hubo un error que pudo mover)", () => {
    const cerrar = dialogo.slice(dialogo.indexOf("const cerrarSinMover = () => {"));
    expect(cerrar).toMatch(
      /if \(pending\) return;\s*const aviso = toastAlCerrarSinMover\(\{ contexto, quizaMovio \}\);/,
    );
    expect(cerrar).toMatch(/if \(aviso\) toast\.info\(aviso\);\s*onCerrar\(\);/);
    expect(dialogo).not.toContain("TOAST_NO_MOVIDO");
  });

  it("el error usa el token del tema (`text-destructive`), no rojos crudos", () => {
    expect(dialogo).toContain('<p role="alert" className="text-sm text-destructive">');
    expect(dialogo).not.toMatch(/text-red-\d/);
  });

  it("todos los textos salen de la fuente única (`textosDialogoReagendar`)", () => {
    expect(dialogo).toContain(
      "const textos = textosDialogoReagendar(contexto, nuevaFecha, fechaOperativa);",
    );
    for (const campo of ["titulo", "descripcion", "nota", "botonNo", "botonMover", "botonMoviendo"]) {
      expect(dialogo).toContain(`textos.${campo}`);
    }
  });
});
