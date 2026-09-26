import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Configuración · «Editan cotizaciones cobradas» (26-sep-2026, API 0.0.37).
 * Es POR PERSONA: Alejandro Villalobos también es ADMIN y NO debe tener el
 * permiso — la sección lo enseña apagado aunque tenga el mismo rol.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/configuracion/actions", () => ({
  setEditoresCotizacionCobradaAction: async () => ({ ok: false, error: "mock" }),
}));

import { EditoresCotizacionCobradaSection } from "@/components/admin/configuracion/editores-cotizacion-cobrada-section";

const ALE = "c691cc8b-3034-4f04-a383-d0b25c1971ec";
const PABLO = "e5aa04a8-ac24-446a-b41d-9af5917cd4f1";
const VILLALOBOS = "11111111-2222-3333-4444-555555555555";

const usuarios = [
  { id: ALE, nombre: "Alejandro Canales" },
  { id: PABLO, nombre: "Pablo Canales" },
];
const candidatos = [
  { id: ALE, nombre: "Alejandro Canales", rol: "ADMIN" },
  { id: VILLALOBOS, nombre: "Alejandro Villalobos", rol: "ADMIN" },
  { id: PABLO, nombre: "Pablo Canales", rol: "ADMIN" },
];

/**
 * El Switch de Base UI pone el `id` en su `<input type="checkbox">` oculto
 * (el `<span role="switch">` lleva uno propio): ahí se leen el estado y si
 * está deshabilitado.
 */
function switchDe(html: string, uuid: string) {
  const m = html.match(new RegExp(`<input[^>]*id="[^"]*-${uuid}"[^>]*/?>`));
  if (!m) return null;
  return {
    encendido: /\schecked=""/.test(m[0]),
    deshabilitado: /\sdisabled=""/.test(m[0]),
  };
}

describe("«Editan cotizaciones cobradas»", () => {
  it("quien está en la lista: switches por persona; el otro ADMIN aparece APAGADO", () => {
    const html = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection
        datos={{ usuario_ids: [ALE, PABLO], usuarios, puede_modificar: true }}
        candidatos={candidatos}
        meId={ALE}
      />,
    );
    expect(html).toContain("Editan cotizaciones cobradas");
    expect(switchDe(html, ALE)?.encendido).toBe(true);
    expect(switchDe(html, PABLO)?.encendido).toBe(true);
    expect(switchDe(html, VILLALOBOS)).toEqual({ encendido: false, deshabilitado: false });
    expect(html).toContain("Hoy pueden editarlas:");
    expect(html).toContain("Alejandro Canales, Pablo Canales");
    expect(html).toContain("(tú)");
    // «Guardar» sin cambios: deshabilitado.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Guardar<\/button>/);
  });

  it("la lista nunca queda vacía: el ÚLTIMO encendido no se puede apagar", () => {
    const html = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection
        datos={{ usuario_ids: [ALE], usuarios: [usuarios[0]], puede_modificar: true }}
        candidatos={candidatos}
        meId={ALE}
      />,
    );
    expect(switchDe(html, ALE)).toEqual({ encendido: true, deshabilitado: true });
    expect(html).toContain("La lista no puede quedar vacía.");
  });

  it("los demás la ven de SOLO LECTURA (sin switches ni «Guardar»)", () => {
    const html = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection
        datos={{ usuario_ids: [ALE, PABLO], usuarios, puede_modificar: false }}
        candidatos={candidatos}
        meId={VILLALOBOS}
      />,
    );
    expect(html).not.toContain('role="switch"');
    expect(html).not.toMatch(/>Guardar</);
    expect(html).toContain("Hoy pueden editarlas:");
    expect(html).toContain("Alejandro Canales, Pablo Canales");
    expect(html).toContain("Solo quien ya está en la lista puede cambiarla.");
  });

  it("un editor guardado que ya no está activo se avisa para quitarlo", () => {
    const html = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection
        datos={{
          usuario_ids: [ALE, "baja-1"],
          usuarios: [usuarios[0], { id: "baja-1", nombre: "Ex Empleado" }],
          puede_modificar: true,
        }}
        candidatos={candidatos}
        meId={ALE}
      />,
    );
    expect(html).toContain("Guardados pero ya no activos en la oficina: Ex Empleado.");
  });

  it("API previo (404) vs carga fallida: textos distintos y sin controles", () => {
    const previo = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection datos={null} candidatos={[]} meId={ALE} />,
    );
    expect(previo).toContain("Disponible cuando se actualice el API.");
    expect(previo).not.toContain('role="switch"');
    const fallo = renderToStaticMarkup(
      <EditoresCotizacionCobradaSection datos={null} candidatos={[]} meId={ALE} fallo />,
    );
    expect(fallo).toContain("No se pudo cargar quién puede editarlas.");
  });
});
