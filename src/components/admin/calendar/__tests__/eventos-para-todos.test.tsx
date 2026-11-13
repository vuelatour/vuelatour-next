import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Calendario · EVENTO SIN RESPONSABLE = PARA TODOS (12-nov-2026, API 0.0.139,
 * invariante 134 del API). Pedido de Dirección: «que al momento de poner "sin
 * responsable" le apareciera a todos en su calendario más bien, en la app y
 * en web».
 *
 * El runner no tiene DOM: se congela el MARCADO del renglón del detalle del
 * día y el CABLEADO por regex sobre los fuentes (formulario, detalle, chip,
 * leyenda y tipos).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    warning: () => {},
    info: () => {},
  }),
}));
vi.mock("@/app/admin/calendar/actions", () => ({
  createEventoFlotaAction: async () => ({ ok: false, error: "mock" }),
  updateEventoFlotaAction: async () => ({ ok: false, error: "mock" }),
}));

import { AvisoResponsable } from "@/components/admin/calendar/eventos";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("detalle del día — renglón del responsable", () => {
  it("evento de todos (API 0.0.139): «Para todos…», sin tono de alerta", () => {
    const html = renderToStaticMarkup(
      <AvisoResponsable responsableNombre={null} pushDispositivos={null} paraTodos />,
    );
    expect(html).toContain("Para todos · les aparece en su calendario (sin aviso al teléfono)");
    expect(html).not.toContain("nadie recibe aviso");
    expect(html).toContain("text-muted-foreground");
    expect(html).not.toContain("amber");
  });

  it("API previo (sin `para_todos`): el texto de antes — no se promete lo que ese API no hace", () => {
    for (const paraTodos of [undefined, false]) {
      const html = renderToStaticMarkup(
        <AvisoResponsable responsableNombre={null} pushDispositivos={null} paraTodos={paraTodos} />,
      );
      expect(html).toContain("Sin responsable · nadie recibe aviso");
      expect(html).not.toContain("Para todos");
    }
  });

  it("con responsable no cambió: avisado / sin dispositivo / API viejo", () => {
    const avisado = renderToStaticMarkup(
      <AvisoResponsable responsableNombre="Luis" pushDispositivos={2} />,
    );
    expect(avisado).toContain("Avisado a Luis · 2 dispositivos");
    const sinApp = renderToStaticMarkup(
      <AvisoResponsable responsableNombre="Luis" pushDispositivos={0} />,
    );
    expect(sinApp).toContain("Luis sin dispositivo registrado — avísale por otro medio");
    const viejo = renderToStaticMarkup(
      <AvisoResponsable responsableNombre="Luis" pushDispositivos={undefined} />,
    );
    expect(viejo).toContain("Responsable: Luis");
    for (const html of [avisado, sinApp, viejo]) expect(html).not.toContain("Para todos");
  });
});

describe("cableado (por regex sobre los fuentes)", () => {
  const eventos = leer("../eventos.tsx");
  const grid = leer("../calendar-grid.tsx");
  const descansos = leer("../descansos.tsx");
  const pagina = leer("../../../../app/admin/calendar/page.tsx");
  const tipos = leer("../../../../types/calendar.ts");

  it("la opción vacía del selector es «Todos (sin responsable)», de la fuente única", () => {
    expect(eventos).toContain("label: ETIQUETA_TODOS,");
    expect(eventos).toContain("description: DESCRIPCION_OPCION_TODOS,");
    expect(eventos).toContain("placeholder={ETIQUETA_TODOS}");
    // El valor que viaja NO cambió: vacío ⇒ sin `responsable_id` (alta) o null (edición).
    expect(eventos).toContain("responsable_id: values.responsable_id || undefined,");
    expect(eventos).toContain("cambios.responsable_id = values.responsable_id || null;");
  });

  it("la ayuda del selector depende de lo elegido (quién lo verá)", () => {
    expect(eventos).toContain(
      '<Field label="Responsable" hint={hintResponsable(Boolean(values.responsable_id))}>',
    );
  });

  it("el toast usa el `para_todos` que DEVOLVIÓ el API (alta y edición)", () => {
    expect(eventos.match(/paraTodos: res\.data\?\.para_todos,/g)).toHaveLength(2);
    expect(eventos).toContain(
      ": textoGuardadoSinResponsable(opts.verbo, { para_todos: opts.paraTodos }),",
    );
  });

  it("el componente no redacta frases del evento sin responsable (viven en lib/admin/evento-flota.ts)", () => {
    expect(eventos).toContain('from "@/lib/admin/evento-flota"');
    for (const fuente of [eventos, grid, descansos, pagina]) {
      for (const frase of [
        "Sin responsable",
        "nadie recibe aviso",
        "nadie recibirá aviso",
        "Para todos",
        "Todos (sin responsable)",
      ]) {
        // En comentarios sí puede aparecer; nunca como texto pintado.
        expect(fuente, frase).not.toMatch(new RegExp(`["'\`>]\\s*${frase.replace(/[()]/g, "\\$&")}`));
      }
    }
  });

  it("el detalle del día y el chip reciben el `para_todos` del evento", () => {
    expect(grid).toContain("paraTodos={ev.para_todos}");
    expect(grid).toContain(": tooltipEvento(ev.title, ev);");
    // El renglón del responsable y el botón «Quitar» lo reciben.
    expect(grid.match(/paraTodos=\{ev\.para_todos\}/g)).toHaveLength(2);
    expect(grid).toContain("conResponsable={Boolean(ev.piloto_id)}");
  });

  it("quitar un evento se confirma con el texto que dice a quién afecta", () => {
    expect(descansos).toContain("{textoConfirmarQuitarEvento(label, {");
    expect(descansos).toContain("<AlertDialogTitle>¿Quitar este evento?</AlertDialogTitle>");
  });

  it("la leyenda del calendario dice la regla nueva", () => {
    expect(pagina).toContain(
      '<span className="text-muted-foreground/70">{NOTA_LEYENDA_EVENTOS}</span>',
    );
  });

  it("los tipos: `para_todos` es ADITIVO (opcional) y un evento puede no tener responsable", () => {
    expect(tipos.match(/para_todos\?: boolean;/g)).toHaveLength(3);
    expect(tipos).toContain("responsable_id: string | null;");
  });
});
