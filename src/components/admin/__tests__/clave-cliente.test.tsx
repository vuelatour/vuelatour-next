import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ClaveClienteCabecera,
  ClaveClienteLinea,
  copiarClaveCliente,
} from "../clave-cliente";
import { TITULO_CLAVE_CLIENTE, TITULO_COPIAR_CLAVE } from "@/lib/admin/clave-cliente";

/**
 * Componente ÚNICO del ID de vuelo por cliente (13-oct-2026, API 0.0.75):
 * la línea bajo el folio de las listas, el chip copiable junto al h1 y la
 * copia al portapapeles. El ID llega ARMADO del API: aquí solo se pinta, y
 * sin clave (API previo / migración sin aplicar) no se pinta nada.
 */

const CLAVE = "january02-211026";

describe("ClaveClienteLinea (bajo el folio)", () => {
  it("pinta el ID con data-clave-cliente y el title exacto", () => {
    const html = renderToStaticMarkup(<ClaveClienteLinea clave={CLAVE} />);
    expect(html).toContain(`>${CLAVE}</span>`);
    expect(html).toContain(`data-clave-cliente="${CLAVE}"`);
    expect(html).toContain(`title="${TITULO_CLAVE_CLIENTE}"`);
    expect(html).toContain("font-mono");
    expect(html).toContain("text-[11px]");
    expect(html.startsWith("<span")).toBe(true);
  });

  it("sin clave (ausente, null o vacía) el marcado sale VACÍO", () => {
    expect(renderToStaticMarkup(<ClaveClienteLinea />)).toBe("");
    expect(renderToStaticMarkup(<ClaveClienteLinea clave={null} />)).toBe("");
    expect(renderToStaticMarkup(<ClaveClienteLinea clave="" />)).toBe("");
  });
});

describe("ClaveClienteCabecera (chip copiable junto al h1)", () => {
  const html = renderToStaticMarkup(<ClaveClienteCabecera clave={CLAVE} />);

  it("es un <button type=button> con cursor-pointer, aria-label y title exactos", () => {
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('type="button"');
    expect(html).toContain("cursor-pointer");
    expect(html).toContain(`aria-label="Copiar ID del vuelo ${CLAVE}"`);
    expect(html).toContain(`title="${TITULO_COPIAR_CLAVE}"`);
    expect(html).toContain(`data-clave-cliente="${CLAVE}"`);
    expect(html).toContain(CLAVE);
    // El ícono es decorativo.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("sin clave no pinta nada", () => {
    expect(renderToStaticMarkup(<ClaveClienteCabecera clave={null} />)).toBe("");
    expect(renderToStaticMarkup(<ClaveClienteCabecera />)).toBe("");
  });
});

describe("copiarClaveCliente", () => {
  it("escribe el ID y avisa «ID copiado: …» ⇒ true", async () => {
    const escribir = vi.fn(async () => {});
    const ok = vi.fn();
    const error = vi.fn();
    await expect(copiarClaveCliente(CLAVE, { escribir, ok, error })).resolves.toBe(true);
    expect(escribir).toHaveBeenCalledWith(CLAVE);
    expect(ok).toHaveBeenCalledWith("ID copiado: january02-211026");
    expect(error).not.toHaveBeenCalled();
  });

  it("si escribir falla avisa «No se pudo copiar al portapapeles» ⇒ false, sin lanzar", async () => {
    const ok = vi.fn();
    const error = vi.fn();
    const escribir = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    await expect(copiarClaveCliente(CLAVE, { escribir, ok, error })).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("No se pudo copiar al portapapeles");
    expect(ok).not.toHaveBeenCalled();
  });

  it("sin portapapeles (Node no tiene navigator.clipboard) cae al aviso de error", async () => {
    const ok = vi.fn();
    const error = vi.fn();
    await expect(copiarClaveCliente(CLAVE, { ok, error })).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("No se pudo copiar al portapapeles");
    expect(ok).not.toHaveBeenCalled();
  });
});
