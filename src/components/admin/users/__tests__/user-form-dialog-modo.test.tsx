/**
 * `UserFormDialog` con prop `modo` (2-oct-2026, «Editar datos» del piloto),
 * renderizado de verdad con `react-dom/server`.
 *
 * Qué se congela:
 *  1. modo PILOTO: título/descripción del helper, SOLO nombre, nombre corto,
 *     teléfono y tarjeta (con el hint de dar de alta la tarjeta) — sin Rol,
 *     Estado ni los switches de piloto;
 *  2. modo USUARIO (default): idéntico a como era (Rol, Estado, los dos
 *     switches) salvo `tiene_fondo_caja`, que no está en el schema ni en los
 *     defaults y nunca viaja;
 *  3. el switch «También es piloto» se pinta DESHABILITADO con su hint si el
 *     servidor no mandó `es_piloto`;
 *  4. el CABLEADO: el modo piloto guarda por `updatePilotAction` con
 *     `payloadModoPiloto` y el modo usuario por `updateUserAction` con
 *     `payloadModoUsuario` (regex sobre el fuente; el submit no corre en SSR).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/types/users";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/pilots",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
// Las server actions (red, sesión) no son parte de este test.
vi.mock("@/app/admin/users/actions", () => ({
  updateUserAction: vi.fn(),
  listCardsOptionsAction: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock("@/app/admin/pilots/actions", () => ({ updatePilotAction: vi.fn() }));
// El diálogo de Base UI vive en un portal (no existe en react-dom/server):
// se sustituye por un pase en línea, como en las pruebas de inventario.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { UserFormDialog } = await import("../user-form-dialog");
const { UserFormSchema } = await import("@/app/admin/users/schema");
const {
  DESCRIPCION_DIALOGO_PILOTO,
  HINT_ES_PILOTO_NO_DISPONIBLE,
  HINT_TARJETA_PILOTO,
  tituloDialogoPiloto,
} = await import("@/lib/admin/pilotos-edicion");
const { APODO_LABEL } = await import("@/lib/admin/usuario-apodo");

const ZAMORA: User = {
  id: "a0a0a0a0-0000-4000-8000-000000000002",
  supabase_auth_id: "auth-z",
  email: "zamora@vuelatour.com",
  nombre: "Abraham Zamora",
  rol: "PILOTO",
  estado: "ACTIVO",
  tiene_fondo_caja: true,
  tarjeta_terminacion: "0593",
  es_piloto: true,
  es_piloto_externo: false,
  telefono: "+52 9981234567",
  apodo: "Zamora",
  avatar_url: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function pintar(user: User, modo?: "usuario" | "piloto"): string {
  return renderToStaticMarkup(
    <UserFormDialog open onOpenChange={() => {}} user={user} {...(modo ? { modo } : {})} />,
  );
}

const fuente = readFileSync(path.resolve(__dirname, "../user-form-dialog.tsx"), "utf8");

describe("UserFormDialog — modo piloto", () => {
  const html = pintar(ZAMORA, "piloto");

  it("título y descripción del helper", () => {
    expect(html).toContain(tituloDialogoPiloto("Abraham Zamora"));
    expect(html).toContain(DESCRIPCION_DIALOGO_PILOTO);
    expect(html).not.toContain("Asigna rol y activa al usuario");
  });

  it("solo nombre, nombre corto, teléfono y tarjeta (con el hint de alta)", () => {
    expect(html).toContain("Nombre");
    expect(html).toContain(APODO_LABEL);
    expect(html).toContain("Teléfono");
    expect(html).toContain("Tarjeta corp.");
    expect(html).toContain(HINT_TARJETA_PILOTO);
  });

  it("sin Rol, Estado ni switches de piloto", () => {
    expect(html).not.toMatch(/>Rol</);
    expect(html).not.toMatch(/>Estado</);
    expect(html).not.toContain("También es piloto");
    expect(html).not.toContain("Piloto externo");
    expect(html).not.toContain('role="switch"');
  });
});

describe("UserFormDialog — modo usuario (default)", () => {
  const html = pintar(ZAMORA);

  it("idéntico a como era: Rol, Estado y los dos switches", () => {
    expect(html).toContain("Editar Abraham Zamora");
    expect(html).toContain("Asigna rol y activa al usuario");
    expect(html).toMatch(/>Rol</);
    expect(html).toMatch(/>Estado</);
    expect(html).toContain("También es piloto");
    expect(html).toContain("Piloto externo");
    expect(html).toContain("del catálogo Tarjetas corp.");
    expect(html).not.toContain(HINT_TARJETA_PILOTO);
  });

  it("modo explícito «usuario» = default", () => {
    expect(pintar(ZAMORA, "usuario")).toBe(html);
  });

  it("tiene_fondo_caja: fuera del schema y de los defaults", () => {
    expect(Object.keys(UserFormSchema.shape)).not.toContain("tiene_fondo_caja");
    expect(UserFormSchema.partial().parse({ tiene_fondo_caja: true })).not.toHaveProperty("tiene_fondo_caja");
    const defaults = fuente.slice(fuente.indexOf("function defaults("));
    expect(defaults).not.toContain("tiene_fondo_caja");
  });

  it("servidor sin es_piloto ⇒ switch DESHABILITADO con su hint", () => {
    const sinDato: User = { ...ZAMORA };
    delete sinDato.es_piloto;
    const conHint = pintar(sinDato);
    expect(conHint).toContain(HINT_ES_PILOTO_NO_DISPONIBLE);
    expect(html).not.toContain(HINT_ES_PILOTO_NO_DISPONIBLE);
    // El primer switch (También es piloto) sale deshabilitado.
    const iTambien = conHint.indexOf("También es piloto");
    const switchTras = conHint.slice(iTambien, conHint.indexOf("Piloto externo"));
    // Atributo (precedido de espacio), no la clase `data-disabled:…` de Tailwind.
    const ATRIBUTO_DESHABILITADO = /\s(data-disabled(="")?|aria-disabled="true"|disabled(="")?)[\s>]/;
    expect(switchTras).toMatch(ATRIBUTO_DESHABILITADO);
    // Control: con el dato, el mismo switch está habilitado.
    const iNormal = html.indexOf("También es piloto");
    const switchNormal = html.slice(iNormal, html.indexOf("Piloto externo"));
    expect(switchNormal).not.toMatch(ATRIBUTO_DESHABILITADO);
  });
});

describe("UserFormDialog — cableado del guardado", () => {
  it("piloto ⇒ updatePilotAction + payloadModoPiloto; usuario ⇒ updateUserAction + payloadModoUsuario", () => {
    expect(fuente).toMatch(/esModoPiloto\s*\?\s*payloadModoPiloto\(/);
    expect(fuente).toMatch(/:\s*payloadModoUsuario\(user,/);
    expect(fuente).toMatch(/esModoPiloto\s*\?\s*await updatePilotAction\(user\.id, payload\)\s*:\s*await updateUserAction\(user\.id, payload\)/);
    expect(fuente).toMatch(/zodResolver\(PilotoDatosSchema\)/);
    // Nadie arma el cuerpo a mano en el componente.
    expect(fuente).not.toMatch(/\{\s*\.\.\.values\s*\}/);
  });
});
