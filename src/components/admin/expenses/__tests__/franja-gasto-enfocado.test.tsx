/**
 * Franja de Gastos cuando se llega con `?gasto=` desde Conciliación
 * (27-oct-2026): que el título, el estado y «Quitar resaltado» lleguen al
 * marcado con el href que se le da.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FranjaGastoEnfocado } from "../franja-gasto-enfocado";

const QUITAR = "/admin/expenses?desde=2026-09-24&hasta=2026-09-24";

describe("FranjaGastoEnfocado", () => {
  it("en vista: título, «va primero» y «Quitar resaltado» a la URL sin ?gasto=", () => {
    const html = renderToStaticMarkup(<FranjaGastoEnfocado encontrado={true} hrefQuitar={QUITAR} />);
    expect(html).toContain('data-franja-gasto-enfocado="en-vista"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Gasto que abriste desde Conciliación");
    expect(html).toContain("Va primero en la lista, resaltado en ámbar.");
    expect(html).toContain(`href="${QUITAR.replace(/&/g, "&amp;")}"`);
    expect(html).toContain(">Quitar resaltado<");
    expect(html).toContain("cursor-pointer");
  });

  it("fuera de la vista: lo dice y sugiere quitar filtros", () => {
    const html = renderToStaticMarkup(<FranjaGastoEnfocado encontrado={false} hrefQuitar="/admin/expenses" />);
    expect(html).toContain('data-franja-gasto-enfocado="fuera"');
    expect(html).toContain("No está en esta vista");
  });

  it("lista caída: no afirma nada", () => {
    const html = renderToStaticMarkup(<FranjaGastoEnfocado encontrado={null} hrefQuitar="/admin/expenses" />);
    expect(html).toContain('data-franja-gasto-enfocado="sin-lista"');
    expect(html).toContain("La lista no cargó");
    expect(html).not.toContain("Va primero");
  });
});
