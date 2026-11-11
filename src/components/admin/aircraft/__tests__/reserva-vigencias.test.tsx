/**
 * RESERVA DE OVERHAUL CON VIGENCIA en la ficha del avión (10-nov-2026, API
 * 0.0.135). Pedido del cliente: «que pudiéramos ponerle desde cuándo entra en
 * vigor esa reserva de overhaul… que dijera ahí "a partir de" y la fecha».
 *
 * Vitest sin DOM: la card se pinta con `renderToStaticMarkup`; el formulario
 * del avión (un portal de Base UI) y la página se vigilan por su CABLEADO en
 * el fuente.
 *
 *  1. la card enseña TODAS las tarifas, la más reciente primero, con su
 *     estado (vigente hoy / anterior / aún no empieza);
 *  2. «Eliminar» solo para quien edita el avión y solo con dos o más tarifas;
 *  3. sin el aditivo del API la ficha y el formulario quedan como siempre;
 *  4. el formulario pide la fecha junto a la tarifa y decide con la fuente
 *     única (`reservaParaGuardar`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReservaOverhaulVigencia } from "@/types/aircraft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/aircraft/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/aircraft/actions", () => ({
  eliminarReservaVigenciaAction: vi.fn(),
}));

const { ReservaVigenciasCard } = await import("../reserva-vigencias-card");
const {
  AYUDA_EDITAR_TARIFAS_RESERVA,
  AYUDA_UNICA_TARIFA_RESERVA,
  DESCRIPCION_TARIFAS_RESERVA,
  TEXTO_SIN_TARIFAS_RESERVA,
  TITULO_TARIFAS_RESERVA,
} = await import("@/lib/admin/reserva-overhaul");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const AVION = "aaaaaaaa-0000-4000-8000-000000004142";

function vig(p: Partial<ReservaOverhaulVigencia> & { id: string; vigente_desde: string }): ReservaOverhaulVigencia {
  const porMotor = p.usd_hr_por_motor ?? 55;
  const motores = p.motores ?? 2;
  return {
    usd_hr_por_motor: porMotor,
    motores,
    usd_por_hora: Math.round(porMotor * motores * 100) / 100,
    notas: null,
    updated_at: null,
    vigente_hoy: false,
    futura: false,
    ...p,
  };
}

/** El N4142R tras el cambio del cliente: 55 desde el 1-nov; antes, 0.01. */
const TARIFAS: ReservaOverhaulVigencia[] = [
  vig({ id: "v-2", vigente_desde: "2027-01-01", usd_hr_por_motor: 70, futura: true }),
  vig({ id: "v-1", vigente_desde: "2026-11-01", usd_hr_por_motor: 55, vigente_hoy: true, notas: "Decisión de dirección" }),
  vig({ id: "v-0", vigente_desde: "2026-01-01", usd_hr_por_motor: 0.01 }),
];

const card = (vigencias: ReservaOverhaulVigencia[], puedeEditar = true) =>
  renderToStaticMarkup(
    <ReservaVigenciasCard aeronaveId={AVION} matricula="N4142R" vigencias={vigencias} puedeEditar={puedeEditar} />,
  );

describe("card «Tarifas de la reserva de overhaul»", () => {
  it("enseña todas las tarifas en el orden que llegan (la más reciente primero), con su fecha y su estado", () => {
    const h = card(TARIFAS);
    expect(h).toContain(TITULO_TARIFAS_RESERVA);
    expect(h).toContain(DESCRIPCION_TARIFAS_RESERVA);
    const orden = [...h.matchAll(/data-tarifa-reserva="([^"]+)" data-estado-tarifa="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(orden).toEqual([
      ["v-2", "FUTURA"],
      ["v-1", "VIGENTE"],
      ["v-0", "ANTERIOR"],
    ]);
    expect(h).toContain("$55 USD por motor × 2 motores = $110 USD por hora de vuelo");
    expect(h).toContain("a partir del 01/11/2026");
    expect(h).toContain("Vigente hoy");
    expect(h).toContain("Aún no empieza");
    expect(h).toContain("Anterior");
    expect(h).toContain("Decisión de dirección");
    // La de 0.01 «desde siempre» sigue ahí, a la vista (se puede eliminar).
    expect(h).toContain("$0.01 USD por motor × 2 motores = $0.02 USD por hora de vuelo");
    expect(h).toContain("a partir del 01/01/2026");
  });

  it("quien edita el avión ve «Eliminar» en cada tarifa (con dos o más) y cómo agregar o corregir", () => {
    const h = card(TARIFAS);
    expect((h.match(/data-accion="eliminar-tarifa-reserva"/g) ?? []).length).toBe(3);
    expect(h).toContain('aria-label="Eliminar la tarifa que vale a partir del 01/11/2026"');
    expect(h).toContain(AYUDA_EDITAR_TARIFAS_RESERVA);
    expect(h).not.toContain(AYUDA_UNICA_TARIFA_RESERVA);
  });

  it("la ÚNICA tarifa no se elimina: sin botón y con la explicación de cómo dejar al avión sin reserva", () => {
    const h = card([TARIFAS[1]]);
    expect(h).not.toContain("eliminar-tarifa-reserva");
    expect(h).toContain(AYUDA_UNICA_TARIFA_RESERVA);
  });

  it("quien solo consulta ve las tarifas, sin «Eliminar» ni ayuda de edición", () => {
    const h = card(TARIFAS, false);
    expect((h.match(/data-tarifa-reserva=/g) ?? []).length).toBe(3);
    expect(h).not.toContain("eliminar-tarifa-reserva");
    expect(h).not.toContain(AYUDA_EDITAR_TARIFAS_RESERVA);
  });

  it("un avión sin tarifas lo DICE (no una lista vacía muda)", () => {
    const h = card([]);
    expect(h).toContain(TEXTO_SIN_TARIFAS_RESERVA);
    expect(h).not.toContain("data-tarifa-reserva=");
  });
});

describe("cableado en el código", () => {
  const pagina = leer("app/admin/aircraft/[id]/page.tsx");
  const dialogo = leer("components/admin/aircraft/aircraft-form-dialog.tsx");
  const boton = leer("components/admin/aircraft/aircraft-edit-button.tsx");
  const tarjeta = leer("components/admin/aircraft/reserva-vigencias-card.tsx");
  const acciones = leer("app/admin/aircraft/actions.ts");
  const esquema = leer("app/admin/aircraft/schema.ts");

  it("la página decide con la puerta única: sin el aditivo del API no hay card ni fecha", () => {
    expect(pagina).toContain("const tarifasReserva = vigenciasDeReserva(aircraft.reserva_overhaul_vigencias);");
    expect(pagina).toMatch(/\{tarifasReserva && \(\s*<ReservaVigenciasCard/);
    expect(pagina).toContain("puedeEditar={puedeEditarReservaOverhaul(me?.rol)}");
    expect(pagina).toContain("reservaVigencias={aircraft.reserva_overhaul_vigencias}");
    expect(pagina).toContain("textoReservaFicha(aircraft.reserva_overhaul_hr_usd, tarifasReserva)");
    expect(boton).toContain("reservaVigencias={reservaVigencias}");
  });

  it("el formulario pide «A partir de» JUNTO a la tarifa solo si la ficha maneja vigencias; si no, las tres columnas de siempre", () => {
    expect(dialogo).toContain("() => (isEdit ? vigenciasDeReserva(reservaVigencias) : null)");
    expect(dialogo).toContain("const conVigencias = vigencias !== null;");
    expect(dialogo).toContain('<Input type="date" {...register("reserva_overhaul_desde")} />');
    expect(dialogo).toContain("<Field label={ETIQUETA_RESERVA_DESDE}");
    // El campo de la fecha vive SOLO dentro de la rama con vigencias.
    const conFecha = dialogo.indexOf("data-reserva-con-vigencia");
    const sinFecha = dialogo.indexOf('<div className="grid grid-cols-3 gap-3">\n              <Field label="USD/hr público"');
    expect(conFecha).toBeGreaterThan(-1);
    expect(sinFecha).toBeGreaterThan(conFecha);
    expect(dialogo.indexOf('register("reserva_overhaul_desde")')).toBeLessThan(sinFecha);
    // La fecha arranca en la de la tarifa que vale hoy.
    expect(dialogo).toContain('const desdeInicial = vigenciaDeHoy(vigencias)?.vigente_desde ?? "";');
  });

  it("al guardar decide la fuente única: la fecha viaja solo si se tocó algo, y entonces es obligatoria", () => {
    expect(dialogo).toMatch(/const reserva = reservaParaGuardar\(\{\s*conVigencias,/);
    expect(dialogo).toContain("setError(reserva.error.campo, { message: reserva.error.mensaje });");
    expect(dialogo).toContain("if (reserva.desde) payload.reserva_overhaul_desde = reserva.desde;");
    expect(dialogo).toContain("else delete payload.reserva_overhaul_desde;");
    // Lo que va a pasar se dice ANTES de guardar, con el texto de la fuente única.
    expect(dialogo).toContain("const previaReserva = vistaPreviaReserva({");
    expect(dialogo).toContain("data-previa-reserva={previaReserva.tono}");
    // Ningún texto de la regla vive en el componente.
    expect(dialogo).not.toMatch(/conservan|se corrige la tarifa|sin reserva/i);
  });

  it("el esquema deja pasar la fecha (o vacío) y la acción de eliminar pega al endpoint con DELETE", () => {
    expect(esquema).toMatch(/reserva_overhaul_desde: z\s*\.string\(\)\s*\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(acciones).toContain("`/v1/aircraft/${aeronaveId}/reserva-overhaul/vigencias/${vigenciaId}`");
    expect(acciones).toMatch(/eliminarReservaVigenciaAction[\s\S]{0,400}method: "DELETE"[\s\S]{0,120}revalidateAircraft\(aeronaveId\)/);
  });

  it("la card confirma antes de eliminar y no se cierra mientras elimina", () => {
    expect(tarjeta).toContain("confirmacionEliminarVigencia(aEliminar, vigencias, matricula)");
    expect(tarjeta).toContain("if (!abierto && !pendiente) setAEliminar(null);");
    expect(tarjeta).toContain("const conEliminar = puedeEditar && puedeEliminarVigencia(vigencias);");
    expect(tarjeta).toContain("router.refresh();");
    // Los textos salen de la fuente única.
    expect(tarjeta).not.toMatch(/quedan sin reserva|pasan a la tarifa/i);
  });
});
