/**
 * Card «Propietarios actuales» + ventana «Editar propietarios» (19-oct-2026,
 * API 0.0.97). Vitest sin DOM: la card se pinta con `renderToStaticMarkup` y
 * la ventana (un portal de Base UI) se vigila por su CABLEADO en el fuente.
 *
 *  1. la card lee: nombre, descripción, vigencia, porcentaje; el caso XA-VGV
 *     (100 + 100) avisa en rojo; «Editar propietarios» solo con permiso;
 *  2. los anteriores van en un `<details>` con «Borrar del historial» (solo
 *     con permiso); si el historial no cargó, se DICE;
 *  3. la ventana corre el plan en ORDEN y de uno en uno, confirma antes de
 *     borrar o de quedar bajo 100 %, y cierra + refresca al terminar;
 *  4. el selector: «＋ Nuevo socio…» abre el alta en línea con Enter/Esc que
 *     NO escapan al formulario; el 409 elige al existente;
 *  5. la página pide TODOS los usuarios, el historial y el rol.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AircraftOwner } from "@/types/aircraft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/aircraft/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/aircraft/actions", () => ({
  closeOwnerAction: vi.fn(),
  createOwnerAction: vi.fn(),
  deleteOwnerAction: vi.fn(),
  updateOwnerAction: vi.fn(),
}));
vi.mock("@/app/admin/users/actions", () => ({ createSocioAction: vi.fn() }));

const { AircraftOwnersCard } = await import("../aircraft-owners-card");
const {
  ETIQUETA_BORRAR_HISTORIAL,
  ETIQUETA_EDITAR_PROPIETARIOS,
  TEXTO_HISTORIAL_NO_CARGO,
  alertaSumaCard,
  textoAnteriores,
} = await import("@/lib/admin/propietarios");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

const HOY = "2026-10-19";
const HERNAN: AircraftOwner = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  socio_id: "11111111-1111-4111-8111-111111111111",
  porcentaje: "100.000",
  vigente_desde: "2020-01-01",
  vigente_hasta: null,
  notas: null,
  usuario: { nombre: "Hernan Garza", es_empresa: false, rol: "SOCIO" },
};
const ALE: AircraftOwner = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  socio_id: "22222222-2222-4222-8222-222222222222",
  porcentaje: "100.000",
  vigente_desde: "2026-08-18",
  vigente_hasta: null,
  notas: null,
  usuario: { nombre: "Alejandro Canales", es_empresa: false, rol: "ADMIN" },
};
const ANTERIOR: AircraftOwner = {
  ...HERNAN,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  socio_id: "33333333-3333-4333-8333-333333333333",
  porcentaje: "40.920",
  vigente_desde: "2024-01-01",
  vigente_hasta: "2026-06-07",
  usuario: { nombre: "Mauricio Roque", es_empresa: false, rol: "SOCIO" },
};

function pintar(props: Partial<Parameters<typeof AircraftOwnersCard>[0]> = {}) {
  return renderToStaticMarkup(
    <AircraftOwnersCard
      aircraftId="a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d"
      owners={[HERNAN, ALE]}
      historial={[HERNAN, ALE, ANTERIOR]}
      usuarios={[]}
      hoy={HOY}
      puedeEditar
      puedeCrearSocio
      {...props}
    />,
  );
}

describe("la card lee", () => {
  it("XA-VGV: los dos propietarios, su vigencia y el aviso de 200 % en rojo; «Editar propietarios» con cursor-pointer", () => {
    const html = pintar();
    expect(html).toContain("Hernan Garza");
    expect(html).toContain("Alejandro Canales");
    expect(html).toContain("2 propietarios · 200 % asignado");
    expect(html).toContain("Socio · desde 01 ene 2020");
    expect(html).toContain("Administración · desde 18 ago 2026");
    expect(html).toContain(alertaSumaCard(200, 2)!);
    expect(html).toMatch(/role="alert"[^>]*class="[^"]*text-destructive/);
    expect(html).toMatch(new RegExp(`<button[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*>[^<]*<svg[\\s\\S]*?${ETIQUETA_EDITAR_PROPIETARIOS}`));
    // La ventana NO se monta hasta pulsar.
    expect(html).not.toContain("data-filas-propietarios");
  });

  it("sin permiso: ni «Editar propietarios» ni «Borrar del historial»", () => {
    const html = pintar({ puedeEditar: false, puedeCrearSocio: false });
    expect(html).not.toMatch(new RegExp(`<button[^>]*>[\\s\\S]*?${ETIQUETA_EDITAR_PROPIETARIOS}`));
    expect(html).not.toContain(ETIQUETA_BORRAR_HISTORIAL);
    expect(html).toContain("Mauricio Roque");
    // El aviso no promete un botón que no tiene.
    expect(html).toContain(alertaSumaCard(200, 2, false)!);
    expect(html).not.toContain(`«${ETIQUETA_EDITAR_PROPIETARIOS}»`);
  });

  it("los anteriores en un <details> con «Borrar del historial»; sin historial se dice", () => {
    const html = pintar();
    expect(html).toContain(textoAnteriores(1));
    expect(html).toMatch(/<details[\s\S]*Mauricio Roque[\s\S]*40\.92 % · 01 ene 2024 – 07 jun 2026/);
    expect(html).toContain(ETIQUETA_BORRAR_HISTORIAL);
    const sin = pintar({ historial: null });
    expect(sin).toContain(TEXTO_HISTORIAL_NO_CARGO);
    expect(sin).not.toContain("<details");
    // Un vigente con fecha de fin futura no es «anterior».
    const conFin = pintar({ historial: [{ ...HERNAN, vigente_hasta: HOY }, ALE] });
    expect(conFin).not.toContain("<details");
  });

  it("con 100 % no hay aviso y el resumen va sin color", () => {
    const html = pintar({ owners: [ALE], historial: [ALE] });
    expect(html).toContain("1 propietario · 100 % asignado");
    expect(html).not.toMatch(/role="alert"/);
  });
});

describe("cableado de la ventana y del selector", () => {
  const card = leer("../aircraft-owners-card.tsx");
  const selector = leer("../socio-selector.tsx");
  const pagina = leer("../../../../app/admin/aircraft/[id]/page.tsx");

  it("la ventana se monta solo al abrir y arma sus filas UNA vez (inicializador perezoso)", () => {
    expect(card).toMatch(/\{abierto && \(\s*<EditarPropietariosDialog/);
    expect(card).toMatch(/useState<FilaPropietario\[\]>\(\(\) => filasDeVigentes\(owners\)\)/);
  });

  it("guardar: valida, arma el plan, confirma si borra o queda bajo 100 %, y corre los pasos EN ORDEN uno por uno", () => {
    expect(card).toMatch(/validarFilas\(filas, nombres, extras\)/);
    expect(card).toMatch(/planPropietarios\(filas, owners, nombres\)/);
    expect(card).toMatch(/if \(planPideConfirmacion\(plan, total\)\) \{\s*setConfirmar/);
    expect(card).toMatch(/for \(const paso of plan\) \{\s*const res = await correrPaso\(paso\)\.catch/);
    expect(card).toMatch(/textoGuardadoParcial\(hechos, plan\.length, paso, errorDe\(res\)\)/);
    // Cada tipo de paso llama a SU action con los argumentos del plan.
    expect(card).toMatch(/case "borrar":\s*return deleteOwnerAction\(aircraftId, p\.id\)/);
    expect(card).toMatch(/case "cerrar":\s*return closeOwnerAction\(aircraftId, p\.id, p\.hasta\)/);
    expect(card).toMatch(/case "actualizar":\s*return updateOwnerAction\(aircraftId, p\.id, p\.patch\)/);
    expect(card).toMatch(/case "crear":\s*return createOwnerAction\(aircraftId, p\.alta\)/);
    // Al terminar (bien o a medias) cierra y repinta lo real.
    expect(card.match(/onClose\(\);\s*router\.refresh\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    // La confirmación corre SOLO desde su acción, con preventDefault.
    expect(card).toMatch(/<AlertDialogAction[\s\S]*?e\.preventDefault\(\);\s*if \(confirmar\) ejecutar\(confirmar\.plan\)/);
    expect(card).toMatch(/<AlertDialogContent backdropForceRender>/);
  });

  it("«Quitar» de una fila guardada sugiere el último día; una fila nueva solo se quita de la lista", () => {
    expect(card).toMatch(/if \(fila\.id === null\) \{\s*setFilas\(\(prev\) => prev\.filter/);
    expect(card).toMatch(/sugerenciaUltimoDia\(fila, filas, hoy, nombres\);\s*cambiar\(fila\.clave, \{ quitar: \{ modo: "cerrar", hasta: s\.dia \} \}\)/);
  });

  it("borrar un anterior: solo desde la confirmación, con deleteOwnerAction", () => {
    expect(card).toMatch(/confirmarBorrado\(\);/);
    expect(card).toMatch(/deleteOwnerAction\(aircraftId, o\.id\)/);
    expect(card.match(/deleteOwnerAction\(/g)?.length).toBe(2);
  });

  it("el selector: la opción centinela abre el alta sin elegirse; Enter/Esc no escapan; el 409 elige al existente", () => {
    expect(selector).toMatch(/if \(v === VALOR_NUEVO_SOCIO\) \{[\s\S]*?setAgregando\(true\)/);
    expect(selector).toMatch(/e\.key === "Enter"[\s\S]*?e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*guardar\(\)/);
    expect(selector).toMatch(/e\.key === "Escape"[\s\S]*?e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*cancelar\(\)/);
    expect(selector).toMatch(/code === "SOCIO_YA_EXISTE"/);
    expect(selector).toMatch(/alta\.tipo === "EXISTE"[\s\S]*?onChange\(alta\.usuario\.id\)/);
    expect(selector).toMatch(/opcionesSocios\(usuarios, value, \{ conNuevo: puedeCrear \}\)/);
    // La lista primero, luego la selección (el combo nunca apunta a un valor sin opción).
    expect(selector).toMatch(/onUsuarioNuevo\(nuevo\);\s*onChange\(nuevo\.id\)/);
  });

  it("la página pide TODOS los usuarios (sin estado), el historial y el rol; la card recibe hoy y los permisos", () => {
    expect(pagina).toMatch(/listUsers\(\{ limit: 200 \}\)/);
    expect(pagina).not.toMatch(/listUsers\(\{ estado: "ACTIVO"/);
    expect(pagina).toMatch(/listAircraftOwners\(id, \{ history: true \}\)\.catch\(\(\) => null\)/);
    expect(pagina).toMatch(/getMe\(\)\.catch\(\(\) => null\)/);
    expect(pagina).toMatch(/puedeEditarPropietarios\(me\?\.rol\)/);
    expect(pagina).toMatch(/<AircraftOwnersCard[\s\S]*?historial=\{historialPropietarios\}[\s\S]*?usuarios=\{usuariosPropietarios\}[\s\S]*?hoy=\{hoyCancun\}[\s\S]*?puedeEditar=\{puedePropietarios\}[\s\S]*?puedeCrearSocio=\{puedePropietarios\}/);
  });
});
