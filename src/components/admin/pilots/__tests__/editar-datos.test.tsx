/**
 * Botón «Editar datos» del piloto (2-oct-2026).
 *
 * Qué se congela:
 *  1. el botón por ROL (`puedeEditarPiloto`): ADMIN y COORDINADOR lo ven, y
 *     sin `/me` también (el gate es el API); los demás no;
 *  2. el botón dice «Editar datos», lleva `cursor-pointer` y NO monta el
 *     diálogo hasta que se pulsa;
 *  3. el CABLEADO de las dos páginas (regex sobre el fuente, son Server
 *     Components con red): `/me` va DEGRADABLE
 *     (`degradado.opcional("tu usuario", getMe(), null)`) con
 *     `<AvisoDegradado>`, el botón solo con `puedeEditarPiloto(me?.rol)` y el
 *     piloto cruza recortado con `usuarioParaEdicion`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
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
vi.mock("@/app/admin/users/actions", () => ({
  updateUserAction: vi.fn(),
  listCardsOptionsAction: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock("@/app/admin/pilots/actions", () => ({ updatePilotAction: vi.fn() }));

const { EditarDatosPilotoButton } = await import("../editar-datos-piloto");
const { BOTON_EDITAR_PILOTO, puedeEditarPiloto, tituloDialogoPiloto } = await import(
  "@/lib/admin/pilotos-edicion"
);

const ZAMORA: User = {
  id: "a0a0a0a0-0000-4000-8000-000000000002",
  supabase_auth_id: "auth-z",
  email: "zamora@vuelatour.com",
  nombre: "Abraham Zamora",
  rol: "PILOTO",
  estado: "ACTIVO",
  tiene_fondo_caja: false,
  tarjeta_terminacion: "0593",
  es_piloto: true,
  es_piloto_externo: false,
  telefono: null,
  apodo: "Zamora",
  avatar_url: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("botón por rol", () => {
  it("ADMIN, COORDINADOR y sin /me ⇒ se ofrece; los demás no", () => {
    const ven = (["ADMIN", "COORDINADOR", null, undefined] as const).map((r) => puedeEditarPiloto(r));
    expect(ven).toEqual([true, true, true, true]);
    const noVen = (["FACTURACION", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"] as const).map((r) =>
      puedeEditarPiloto(r),
    );
    expect(noVen.every((v) => v === false)).toBe(true);
  });

  it("«Editar datos» con cursor-pointer; el diálogo no se monta hasta pulsar", () => {
    const html = renderToStaticMarkup(<EditarDatosPilotoButton pilot={ZAMORA} />);
    expect(html).toContain(BOTON_EDITAR_PILOTO);
    expect(html).toMatch(/<button[^>]*class="[^"]*cursor-pointer/);
    expect(html).not.toContain(tituloDialogoPiloto("Abraham Zamora"));
  });

  it("el botón abre el diálogo en modo PILOTO", () => {
    const fuente = leer("../editar-datos-piloto.tsx");
    expect(fuente).toMatch(/<UserFormDialog modo="piloto"/);
  });
});

describe("cableado de las páginas de pilotos", () => {
  const lista = leer("../../../../app/admin/pilots/page.tsx");
  const detalle = leer("../../../../app/admin/pilots/[id]/page.tsx");

  for (const [nombre, fuente] of [
    ["lista", lista],
    ["detalle", detalle],
  ] as const) {
    it(`${nombre}: /me degradable + aviso + botón solo con puedeEditarPiloto`, () => {
      expect(fuente).toContain('degradado.opcional("tu usuario", getMe(), null)');
      expect(fuente).toMatch(/<AvisoDegradado faltantes=\{degradado\.faltantes\} \/>/);
      expect(fuente).toMatch(/puedeEditarPiloto\(me\?\.rol\)/);
      expect(fuente).toMatch(/\{editable && <EditarDatosPilotoButton pilot=\{usuarioParaEdicion\(pilot\)\}/);
    });
  }
});
