import { describe, expect, it } from "vitest";
import {
  DESCRIPCION_ROL,
  ETIQUETA_ROL,
  MODULOS_SOLO_DIRECCION,
  OPCIONES_ROL,
  TEXTO_SOLO_DIRECCION,
  TITULO_SOLO_DIRECCION,
  descripcionRol,
  esAdminODireccion,
  esDireccion,
  etiquetaRol,
  opcionesRolParaActor,
  puedeEditarUsuario,
  puedeVerGastosPersonales,
} from "@/lib/admin/roles";
import { NAV_GROUPS, filterNavGroupsForRole } from "@/lib/admin/nav-items";
import { puedeVerNomina, ROLES_NOMINA } from "@/lib/admin/nomina";
import { puedeVerIngresos, ROLES_INGRESOS } from "@/lib/admin/ingresos-ui";
import { puedeVerReparto, puedeVerCuentasSocios, puedeRegistrarEntregas } from "@/lib/admin/reparto-pagos";
import { puedeDescargarBalanceAvion, puedeVerRepartoAvion } from "@/lib/admin/reparto-avion";

/**
 * Dirección y Administración (6-nov-2026, invariante 122 del API). Pedido
 * del dueño: Dirección (Ale y Pablo) ve todo; Administración (ADMIN) todo
 * menos Estadísticas, Ingresos, Nómina, Gastos personales, Reparto de
 * utilidades y Pagos a socios.
 */
const hrefs = (rol: Parameters<typeof filterNavGroupsForRole>[0]) =>
  filterNavGroupsForRole(rol).flatMap((g) => g.items.map((i) => i.href));
const TODOS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

describe("roles — etiquetas y opciones", () => {
  it("el código ADMIN se muestra como «Administración» y DIRECCION como «Dirección»", () => {
    expect(etiquetaRol("ADMIN")).toBe("Administración");
    expect(etiquetaRol("DIRECCION")).toBe("Dirección");
    expect(etiquetaRol("FACTURACION")).toBe("Facturación");
    expect(etiquetaRol("RARO")).toBe("RARO");
    expect(etiquetaRol(null)).toBe("");
    expect(Object.keys(ETIQUETA_ROL).sort()).toEqual(Object.keys(DESCRIPCION_ROL).sort());
    expect(descripcionRol("DIRECCION")).toMatch(/Acceso total/);
    expect(descripcionRol("ADMIN")).toMatch(/todo menos/);
  });

  it("el selector ofrece Dirección primero; a Administración no se le ofrece Dirección", () => {
    expect(OPCIONES_ROL.map((o) => o.value)).toEqual([
      "DIRECCION",
      "ADMIN",
      "COORDINADOR",
      "ANALISTA",
      "FACTURACION",
      "PILOTO",
      "SOCIO",
      "MECANICO",
      "VISITANTE",
    ]);
    expect(OPCIONES_ROL[1]).toEqual({
      value: "ADMIN",
      label: "Administración",
      description: DESCRIPCION_ROL.ADMIN,
    });
    expect(opcionesRolParaActor("DIRECCION")).toEqual(OPCIONES_ROL);
    expect(opcionesRolParaActor(null)).toEqual(OPCIONES_ROL);
    expect(opcionesRolParaActor("ADMIN").map((o) => o.value)).not.toContain("DIRECCION");
    expect(opcionesRolParaActor("ADMIN")).toHaveLength(OPCIONES_ROL.length - 1);
  });

  it("predicados y candado de usuarios", () => {
    expect(esDireccion("DIRECCION")).toBe(true);
    expect(esDireccion("ADMIN")).toBe(false);
    expect(esAdminODireccion("ADMIN")).toBe(true);
    expect(esAdminODireccion("DIRECCION")).toBe(true);
    expect(esAdminODireccion("COORDINADOR")).toBe(false);
    expect(puedeEditarUsuario("ADMIN", "DIRECCION")).toBe(false);
    expect(puedeEditarUsuario("DIRECCION", "DIRECCION")).toBe(true);
    expect(puedeEditarUsuario("ADMIN", "ADMIN")).toBe(true);
    expect(puedeEditarUsuario(null, "DIRECCION")).toBe(true);
    expect(puedeVerGastosPersonales("DIRECCION")).toBe(true);
    expect(puedeVerGastosPersonales("COORDINADOR")).toBe(true);
    expect(puedeVerGastosPersonales("ADMIN")).toBe(false);
    expect(TITULO_SOLO_DIRECCION).toBe("Solo Dirección");
    expect(TEXTO_SOLO_DIRECCION).toMatch(/Ale y Pablo/);
  });
});

describe("menú — Dirección ve todo; Administración todo menos lo de Dirección", () => {
  it("DIRECCION ve cada ítem del menú (sin que las listas lo nombren)", () => {
    expect(hrefs("DIRECCION").sort()).toEqual([...TODOS].sort());
  });

  it("ADMIN pierde exactamente MODULOS_SOLO_DIRECCION", () => {
    const admin = new Set(hrefs("ADMIN"));
    for (const h of MODULOS_SOLO_DIRECCION) expect(admin.has(h), h).toBe(false);
    const conservados = TODOS.filter((h) => !(MODULOS_SOLO_DIRECCION as readonly string[]).includes(h));
    for (const h of conservados) expect(admin.has(h), h).toBe(true);
    // Lo que el dueño listó para los dos sigue ahí.
    for (const h of [
      "/admin",
      "/admin/quotes",
      "/admin/flights",
      "/admin/expenses",
      "/admin/otros-gastos",
      "/admin/combustibles",
      "/admin/aircraft",
      "/admin/inventory",
      "/admin/inventory/compras",
      "/admin/caja-chica",
      "/admin/conciliacion",
      "/admin/reportes",
      "/admin/bank-accounts",
      "/admin/users",
      "/admin/alertas",
      "/admin/configuracion",
    ]) {
      expect(admin.has(h), h).toBe(true);
    }
  });

  it("los demás roles no cambian: COORDINADOR sigue sin Usuarios y con Ingresos", () => {
    const coord = new Set(hrefs("COORDINADOR"));
    expect(coord.has("/admin/users")).toBe(false);
    expect(coord.has("/admin/ingresos")).toBe(true);
    expect(coord.has("/admin/nomina")).toBe(true);
  });

  it("las fuentes únicas de cada módulo dicen lo mismo que el menú", () => {
    expect([...ROLES_NOMINA]).toEqual(["DIRECCION", "COORDINADOR", "FACTURACION"]);
    expect(puedeVerNomina("ADMIN")).toBe(false);
    expect(puedeVerNomina("DIRECCION")).toBe(true);
    expect([...ROLES_INGRESOS]).toEqual(["DIRECCION", "COORDINADOR", "FACTURACION"]);
    expect(puedeVerIngresos("ADMIN")).toBe(false);
    expect(puedeVerReparto("ADMIN")).toBe(false);
    expect(puedeVerReparto("DIRECCION")).toBe(true);
    expect(puedeVerCuentasSocios("ADMIN")).toBe(false);
    expect(puedeRegistrarEntregas("ADMIN")).toBe(false);
    expect(puedeRegistrarEntregas("DIRECCION")).toBe(true);
    expect(puedeVerRepartoAvion("ADMIN")).toBe(false);
    expect(puedeDescargarBalanceAvion("ADMIN")).toBe(false);
    expect(puedeDescargarBalanceAvion("DIRECCION")).toBe(true);
  });
});
