/**
 * Campo «Alias para el ID de sus vuelos» del formulario de cliente
 * (13-oct-2026, API 0.0.75), pintado de verdad (SSR): aparece SOLO si el API
 * lo habilita — alta con `alias_disponible`, edición con la llave `alias` en
 * la fila — con su ayuda, el sugerido como placeholder, el ejemplo con la
 * fecha de hoy (Cancún) y «Usar el sugerido» cuando el alias es otro.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/types/clients";
import { todayCancun } from "@/lib/datetime";
import {
  AYUDA_ALIAS,
  LABEL_ALIAS,
  MENSAJE_ALIAS_INVALIDO,
  textoEjemplo,
  textoUsarSugerido,
} from "@/lib/admin/clave-cliente";

// El Dialog de Base UI se monta en un portal (no existe en el render del
// server): aquí se pinta en línea cuando está abierto.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="">{children}</div> : null,
    DialogContent: Pasa,
    DialogDescription: Pasa,
    DialogFooter: Pasa,
    DialogHeader: Pasa,
    DialogTitle: Pasa,
  };
});
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: () => <span data-select="" />,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
// Las server actions (red, sesión) no son parte de este test.
vi.mock("@/app/admin/clients/actions", () => ({
  aliasEnUsoAction: vi.fn(),
  createClientAction: vi.fn(),
  updateClientAction: vi.fn(),
  getClientTarifasAction: vi.fn(),
  leerConstanciaIAAction: vi.fn(),
  listAircraftTarifaOptionsAction: vi.fn(),
  setClientTarifasAction: vi.fn(),
}));

const { ClientFormDialog } = await import("../client-form-dialog");

const JUAN: Client = {
  id: "c1c1c1c1-0000-4000-8000-000000000001",
  nombre: "Juan Chacon",
  telefono: null,
  email: null,
  razon_social_default: null,
  rfc: null,
  regimen_fiscal_receptor: null,
  uso_cfdi: null,
  codigo_postal: null,
  domicilio_fiscal: null,
  pais_residencia: null,
  canal_origen: null,
  es_broker: false,
  notas: null,
  activo: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const pintar = (props: { initialClient?: Client; aliasDisponible?: boolean }) =>
  renderToStaticMarkup(<ClientFormDialog open onOpenChange={() => {}} {...props} />);

/** El <input> que sigue a la etiqueta del alias. */
const inputAlias = (html: string) => {
  const desde = html.indexOf(LABEL_ALIAS);
  return html.slice(desde).match(/<input[^>]*>/)?.[0] ?? "";
};

describe("ClientFormDialog: campo del alias", () => {
  it("ALTA con alias_disponible: campo con ayuda, sugerido «cliente» de placeholder y el ejemplo de hoy", () => {
    const html = pintar({ aliasDisponible: true });
    expect(html).toContain(LABEL_ALIAS);
    expect(html).toContain(AYUDA_ALIAS);
    const input = inputAlias(html);
    expect(input).toContain('placeholder="cliente"');
    expect(input).toContain('maxLength="24"');
    expect(input).toContain('autoCapitalize="none"');
    expect(input).toContain('spellCheck="false"');
    expect(input).toContain('value=""');
    expect(html).toContain(textoEjemplo("cliente", todayCancun()));
    // Sin alias propio no se ofrece «Usar el sugerido».
    expect(html).not.toContain("Usar el sugerido");
  });

  it("ALTA sin alias_disponible (API previo o sin migración): NO hay campo", () => {
    expect(pintar({})).not.toContain(LABEL_ALIAS);
    expect(pintar({ aliasDisponible: false })).not.toContain(LABEL_ALIAS);
  });

  it("EDICIÓN con alias en la fila: el campo trae su alias y ofrece volver al sugerido", () => {
    const html = pintar({ initialClient: { ...JUAN, alias: "jchacon" } });
    expect(html).toContain(LABEL_ALIAS);
    const input = inputAlias(html);
    expect(input).toContain('value="jchacon"');
    expect(input).toContain('placeholder="juan"');
    expect(html).toContain(textoUsarSugerido("juan"));
    expect(html).toMatch(/<button type="button" class="cursor-pointer text-brand-600 hover:underline">Usar el sugerido \(juan\)<\/button>/);
    expect(html).toContain(textoEjemplo("jchacon", todayCancun()));
  });

  it("EDICIÓN con el alias igual al sugerido: sin botón «Usar el sugerido»", () => {
    const html = pintar({ initialClient: { ...JUAN, alias: "juan" } });
    expect(inputAlias(html)).toContain('value="juan"');
    expect(html).not.toContain("Usar el sugerido");
  });

  it("alias aún sin limpiar («José»): marca el error y el ejemplo muestra lo que quedará (jose)", () => {
    const html = pintar({ initialClient: { ...JUAN, alias: "José" } });
    expect(html).toContain(MENSAJE_ALIAS_INVALIDO);
    expect(html).toContain(textoEjemplo("jose", todayCancun()));
  });

  it("EDICIÓN sin la llave alias (API previo): NO hay campo, aunque el alta lo tuviera", () => {
    expect(pintar({ initialClient: JUAN, aliasDisponible: true })).not.toContain(LABEL_ALIAS);
  });
});
