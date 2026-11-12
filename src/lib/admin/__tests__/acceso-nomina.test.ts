import { describe, expect, it } from "vitest";
import {
  CLAVE_CONFIG_ACCESO_NOMINA,
  DESCRIPCION_ACCESO_NOMINA,
  ERRORES_ACCESO_NOMINA,
  TEXTO_ACCESO_API_VIEJO,
  TEXTO_ACCESO_ERROR,
  TITULO_ACCESO_NOMINA,
  TOPE_ACCESO_NOMINA,
  conAccesoHoy,
  diffAccesoNomina,
  errorAccesoNominaPideRecargar,
  guardadosFueraDeLista,
  idsAGuardarAcceso,
  mensajeErrorAccesoNomina,
  nombreDeAcceso,
  textoAccesoActual,
  textoConfirmarAccesoNomina,
  textoEntranPorRol,
  textoFueraDeLista,
  textoGuardadoAccesoNomina,
  textoUltimoCambioAcceso,
  type AccesoNomina,
} from "@/lib/admin/acceso-nomina";
import { diffListaIds } from "@/lib/admin/lista-ids";
import { diffEditores } from "@/lib/admin/cotizacion-cobrada";
import { puedeVerNomina } from "@/lib/admin/nomina";
import { puedeRepartirNomina } from "@/lib/admin/nomina-reparto";
import { MODULOS_SOLO_DIRECCION, TEXTO_NOMINA_SOLO_DIRECCION } from "@/lib/admin/roles";
import { filterNavGroupsForRole } from "@/lib/admin/nav-items";

/**
 * Configuración · «Acceso a Nómina» (12-nov-2026, API 0.0.137). Pedido de
 * Dirección: «poder habilitar o deshabilitar a algunos usuarios el módulo de
 * nómina … le acaban de autorizar el acceso a Mary, pero no sé si es para
 * siempre o temporal, mejor poder controlarlo desde configuración». En prod
 * toda la oficina es Administración (ADMIN) o Dirección: es POR PERSONA.
 */
const ALE = "c691cc8b-3034-4f04-a383-d0b25c1971ec";
const DIEGO = "c4d0633d-a5e9-4764-8e54-03c7fb00f3b7";
const PABLO = "e5aa04a8-ac24-446a-b41d-9af5917cd4f1";
const VILLALOBOS = "ee3c5690-467c-481d-940f-f4c06010155f";
const ITZI = "5391362f-e8cc-4287-95ef-739911fbf0e5";
const MARY = "e0b26729-1f02-4dc0-9c1a-e7192e638478";
const BAJA = "5efca0e1-3474-4857-aabf-0f99c9457903";
const SELLO = "2026-11-12T20:04:00.123+00:00";

const candidatos = [
  { id: VILLALOBOS, nombre: "Alejandro Villalobos", rol: "ADMIN" },
  { id: ITZI, nombre: "Itzi", rol: "ADMIN" },
  { id: MARY, nombre: "Mary Cruz", rol: "ADMIN" },
];
const porRol = [
  { id: ALE, nombre: "Alejandro Canales", rol: "DIRECCION" },
  { id: DIEGO, nombre: "Diego Ramírez", rol: "DIRECCION" },
  { id: PABLO, nombre: "Pablo Canales", rol: "DIRECCION" },
];

function datos(extra: Partial<AccesoNomina> = {}): AccesoNomina {
  return {
    usuario_ids: [MARY],
    usuarios: [{ id: MARY, nombre: "Mary Cruz" }],
    candidatos,
    por_rol: porRol,
    puede_modificar: true,
    version: SELLO,
    actualizado_at: SELLO,
    actualizado_por_nombre: "Diego Ramírez",
    ...extra,
  };
}

const hrefs = (...args: Parameters<typeof filterNavGroupsForRole>) =>
  filterNavGroupsForRole(...args).flatMap((g) => g.items.map((i) => i.href));

describe("quién entra a Nómina (menú y pantalla)", () => {
  it("Administración CON el acceso ve «Nómina» en el menú y entra a la pantalla; los demás módulos de Dirección siguen cerrados", () => {
    const menu = new Set(hrefs("ADMIN", { nomina: true }));
    expect(menu.has("/admin/nomina")).toBe(true);
    for (const h of MODULOS_SOLO_DIRECCION.filter((x) => x !== "/admin/nomina")) {
      expect(menu.has(h), h).toBe(false);
    }
    expect(puedeVerNomina("ADMIN", { nomina: true })).toBe(true);
    expect(puedeRepartirNomina("ADMIN", { nomina: true })).toBe(true);
    // El resto del menú de Administración no cambia.
    const sin = hrefs("ADMIN");
    expect([...menu].filter((h) => h !== "/admin/nomina").sort()).toEqual([...sin].sort());
  });

  it("Administración SIN el acceso (false, ausente o API previo) queda como antes", () => {
    for (const permisos of [{ nomina: false }, {}, { editar_cotizacion_cobrada: true }, null, undefined]) {
      expect(hrefs("ADMIN", permisos).includes("/admin/nomina")).toBe(false);
      expect(puedeVerNomina("ADMIN", permisos)).toBe(false);
      expect(puedeRepartirNomina("ADMIN", permisos)).toBe(false);
    }
    expect(hrefs("ADMIN").includes("/admin/nomina")).toBe(false);
  });

  it("quien entra por su rol no depende del permiso; sin rol conocido ningún permiso abre nada", () => {
    for (const rol of ["DIRECCION", "COORDINADOR", "FACTURACION"] as const) {
      expect(puedeVerNomina(rol)).toBe(true);
      expect(puedeVerNomina(rol, { nomina: false })).toBe(true);
      expect(hrefs(rol, { nomina: false }).includes("/admin/nomina")).toBe(true);
    }
    expect(puedeVerNomina(null, { nomina: true })).toBe(false);
    expect(puedeVerNomina(undefined, { nomina: true })).toBe(false);
    expect(puedeVerNomina("", { nomina: true })).toBe(false);
    expect(hrefs(undefined, { nomina: true }).includes("/admin/nomina")).toBe(false);
  });

  it("a quien no entra se le dice a quién pedírselo y dónde", () => {
    expect(TEXTO_NOMINA_SOLO_DIRECCION).toBe(
      "La nómina la ve Dirección y a quien Dirección le dé acceso. Si te toca llevarla, pídele a Dirección que te lo dé en Configuración → «Acceso a Nómina».",
    );
  });
});

describe("textos de la tarjeta", () => {
  it("título, descripción y clave del contrato", () => {
    expect(TITULO_ACCESO_NOMINA).toBe("Acceso a Nómina");
    expect(CLAVE_CONFIG_ACCESO_NOMINA).toBe("acceso_nomina");
    expect(TOPE_ACCESO_NOMINA).toBe(50);
    expect(DESCRIPCION_ACCESO_NOMINA).toContain("Administración");
    expect(DESCRIPCION_ACCESO_NOMINA).toContain("solo por un tiempo");
    expect(DESCRIPCION_ACCESO_NOMINA).toContain("gastos personales");
  });

  it("quién tiene hoy el acceso: solo guardados que siguen en Administración activa, en su orden", () => {
    expect(conAccesoHoy(datos())).toEqual(["Mary Cruz"]);
    expect(conAccesoHoy(datos({ usuario_ids: [ITZI, MARY, BAJA] }))).toEqual(["Itzi", "Mary Cruz"]);
    expect(conAccesoHoy(datos({ usuario_ids: [] }))).toEqual([]);
    expect(textoAccesoActual(["Mary Cruz"])).toBe("Con acceso dado aquí: Mary Cruz.");
    expect(textoAccesoActual(["Itzi", "Mary Cruz"])).toBe("Con acceso dado aquí: Itzi y Mary Cruz.");
    // La pieza común de los nombres (`unirNombres`): «e» ante «Itzi».
    expect(textoAccesoActual(["Mary Cruz", "Itzi"])).toBe("Con acceso dado aquí: Mary Cruz e Itzi.");
    expect(textoAccesoActual([])).toBe("Hoy nadie de Administración entra a Nómina.");
  });

  it("quién entra por su rol (informativo); sin nadie no se pinta", () => {
    expect(textoEntranPorRol(porRol)).toBe(
      "Por su rol entran siempre: Alejandro Canales, Diego Ramírez y Pablo Canales.",
    );
    expect(textoEntranPorRol([])).toBeNull();
    expect(textoEntranPorRol(undefined)).toBeNull();
  });

  it("guardados que ya no cuentan (baja o cambio de rol): se nombran y se pide guardar para quitarlos", () => {
    const d = datos({
      usuario_ids: [MARY, BAJA, ALE],
      usuarios: [
        { id: MARY, nombre: "Mary Cruz" },
        { id: ALE, nombre: "Alejandro Canales" },
      ],
    });
    expect(guardadosFueraDeLista(d)).toEqual(["un usuario dado de baja", "Alejandro Canales"]);
    expect(guardadosFueraDeLista(datos())).toEqual([]);
    expect(textoFueraDeLista(["Alejandro Canales"])).toBe(
      "En la lista, pero ya no son de Administración activa (no entran): Alejandro Canales. Pulsa «Guardar» para quitarlos.",
    );
    expect(nombreDeAcceso(d, MARY)).toBe("Mary Cruz");
    expect(nombreDeAcceso(d, BAJA)).toBe("un usuario dado de baja");
  });

  it("último cambio: fecha y quién; sin fecha (nunca guardada) no se pinta", () => {
    expect(textoUltimoCambioAcceso("12/11/2026, 3:04 p.m.", "Diego Ramírez")).toBe(
      "Último cambio: 12/11/2026, 3:04 p.m. · Diego Ramírez",
    );
    expect(textoUltimoCambioAcceso("12/11/2026, 3:04 p.m.", null)).toBe(
      "Último cambio: 12/11/2026, 3:04 p.m.",
    );
    expect(textoUltimoCambioAcceso(null, "Diego Ramírez")).toBeNull();
    expect(textoUltimoCambioAcceso("—", "Diego Ramírez")).toBeNull();
    expect(textoUltimoCambioAcceso("", null)).toBeNull();
  });
});

describe("qué se guarda y qué cambia", () => {
  it("solo viajan candidatos, sin repetir (un guardado dado de baja daría 400 en cada guardado)", () => {
    expect(idsAGuardarAcceso(new Set([MARY, BAJA, ALE]), candidatos)).toEqual([MARY]);
    expect(idsAGuardarAcceso([ITZI, ITZI, MARY], candidatos)).toEqual([ITZI, MARY]);
    expect(idsAGuardarAcceso([], candidatos)).toEqual([]);
    expect(idsAGuardarAcceso([MARY], [])).toEqual([]);
  });

  it("el tope del API (50) se respeta", () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ id: `id-${i}`, nombre: `U${i}` }));
    expect(idsAGuardarAcceso(muchos.map((m) => m.id), muchos)).toHaveLength(50);
  });

  it("diff: quién gana y quién pierde; apagar a todos ES un cambio; sin tocar nada no lo es", () => {
    expect(diffAccesoNomina([MARY], [MARY, ITZI])).toEqual({
      agregados: [ITZI],
      quitados: [],
      cambio: true,
    });
    expect(diffAccesoNomina([MARY], [])).toEqual({ agregados: [], quitados: [MARY], cambio: true });
    expect(diffAccesoNomina([MARY, ITZI], [ITZI, MARY]).cambio).toBe(false);
    expect(diffAccesoNomina([], []).cambio).toBe(false);
    // Limpiar a uno que se dio de baja también habilita «Guardar».
    expect(diffAccesoNomina([MARY, BAJA], [MARY])).toEqual({
      agregados: [],
      quitados: [BAJA],
      cambio: true,
    });
  });

  it("la pieza común del diff es UNA (la misma de «Editan cotizaciones cobradas»)", () => {
    for (const [g, e] of [
      [[MARY], [MARY, ITZI]],
      [[MARY, ITZI], []],
      [[], []],
    ] as const) {
      expect(diffEditores(g, e)).toEqual(diffListaIds(g, e));
    }
  });

  it("la confirmación dice con NOMBRE quién entra y quién deja de entrar", () => {
    expect(textoConfirmarAccesoNomina({ agregados: ["Mary Cruz"], quitados: [] })).toBe(
      "Podrán entrar a Nómina: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAccesoNomina({ agregados: [], quitados: ["Mary Cruz", "Itzi"] })).toBe(
      "Dejarán de entrar: Mary Cruz e Itzi. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAccesoNomina({ agregados: ["Itzi"], quitados: ["Mary Cruz"] })).toBe(
      "Podrán entrar a Nómina: Itzi. Dejarán de entrar: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
  });

  it("aviso tras guardar: quién quedó y cuándo lo verá", () => {
    expect(textoGuardadoAccesoNomina(["Mary Cruz"])).toBe(
      "Guardado. Con acceso a Nómina: Mary Cruz. Lo verán en su menú al recargar la página.",
    );
    expect(textoGuardadoAccesoNomina([])).toBe("Guardado. Nadie de Administración entra a Nómina.");
  });
});

describe("errores del guardado (se decide por CÓDIGO)", () => {
  it("con código propio manda el texto del API; sin él, el respaldo", () => {
    expect(
      mensajeErrorAccesoNomina({
        code: "ACCESO_NOMINA_CAMBIO",
        status: 409,
        error: "Alguien más cambió quién entra a Nómina mientras lo editabas. Recarga y vuelve a intentar.",
      }),
    ).toBe("Alguien más cambió quién entra a Nómina mientras lo editabas. Recarga y vuelve a intentar.");
    expect(mensajeErrorAccesoNomina({ code: "USUARIOS_INVALIDOS", status: 400 })).toBe(
      ERRORES_ACCESO_NOMINA.USUARIOS_INVALIDOS,
    );
    expect(mensajeErrorAccesoNomina({ code: "SOLO_DIRECCION_ACCESO_NOMINA", status: 403, error: "  " })).toBe(
      "Solo Dirección puede cambiar quién entra a Nómina.",
    );
  });

  it("el 403 del guard de roles (texto técnico en inglés) se dice en claro; el 404 es un API sin desplegar", () => {
    expect(
      mensajeErrorAccesoNomina({
        code: "FORBIDDEN",
        status: 403,
        error: "Required role: DIRECCION. Current: ADMIN",
      }),
    ).toBe("Solo Dirección puede cambiar quién entra a Nómina.");
    expect(mensajeErrorAccesoNomina({ status: 404, error: "Cannot PUT /v1/config/acceso-nomina" })).toBe(
      TEXTO_ACCESO_API_VIEJO,
    );
    expect(mensajeErrorAccesoNomina({ status: 500, error: "Internal server error" })).toBe(TEXTO_ACCESO_ERROR);
    expect(mensajeErrorAccesoNomina({})).toBe(TEXTO_ACCESO_ERROR);
    expect(mensajeErrorAccesoNomina({ code: "BAD_REQUEST", status: 400, error: "usuario_ids must be an array" })).toBe(
      TEXTO_ACCESO_ERROR,
    );
  });

  it("qué rechazos piden repintar la sección", () => {
    for (const code of ["ACCESO_NOMINA_CAMBIO", "USUARIOS_INVALIDOS", "SOLO_DIRECCION_ACCESO_NOMINA"]) {
      expect(errorAccesoNominaPideRecargar({ code }), code).toBe(true);
    }
    expect(errorAccesoNominaPideRecargar({ status: 403, code: "FORBIDDEN" })).toBe(true);
    expect(errorAccesoNominaPideRecargar({ status: 500 })).toBe(false);
    expect(errorAccesoNominaPideRecargar({ status: 404 })).toBe(false);
    expect(errorAccesoNominaPideRecargar({})).toBe(false);
  });
});
