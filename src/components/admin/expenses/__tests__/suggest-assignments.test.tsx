/**
 * «Sugerir asignaciones» (14-oct-2026): el número sale de la etiqueta (ya
 * está en la pestaña «Pendientes» y antes contaba lo FILTRADO aunque la
 * acción barre toda la bandeja) y va en el `title` con el total GLOBAL. Un
 * conteo que falló (null) NO esconde el botón ni dice «0».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  sugerirAsignacionesBandejaAction: async () => ({ ok: false, error: "x" }),
  aplicarAsignacionesAction: async () => ({ ok: false, error: "x" }),
}));

const { SuggestAssignmentsButton } = await import("../suggest-assignments-button");

describe("SuggestAssignmentsButton", () => {
  it("0 pendientes ⇒ no se pinta", () => {
    expect(renderToStaticMarkup(<SuggestAssignmentsButton pendientes={0} />)).toBe("");
  });

  it("conteo que falló (null) ⇒ se pinta sin número y lo dice en el title", () => {
    const html = renderToStaticMarkup(<SuggestAssignmentsButton pendientes={null} />);
    expect(html).toContain("Sugerir asignaciones");
    expect(html).not.toContain("Sugerir asignaciones (");
    expect(html).toContain(
      'title="No se pudieron contar los pendientes; el análisis revisa toda la bandeja."',
    );
  });

  it("36 ⇒ el total GLOBAL en el title y la etiqueta sin número", () => {
    const html = renderToStaticMarkup(<SuggestAssignmentsButton pendientes={36} />);
    expect(html).toContain("36 gastos pendientes de toda la bandeja");
    expect(html).not.toContain("(36)");
    expect(html).toMatch(/<\/svg>Sugerir asignaciones<\/button>/);
    expect(html).toMatch(/<button[^>]*class="[^"]*cursor-pointer/);
  });

  it("cableado: las dos server actions se llaman sin lanzar y la carga usa el texto de la fuente única", () => {
    const src = readFileSync(path.resolve(__dirname, "../suggest-assignments-button.tsx"), "utf8");
    expect(src).toContain("llamarSinLanzar(() => sugerirAsignacionesBandejaAction())");
    expect(src).toContain("llamarSinLanzar(() => aplicarAsignacionesAction(items))");
    expect(src).toContain("{textoAnalizandoPendientes(pendientes)}");
    expect(src).toContain("pendientes: number | null");
  });
});
