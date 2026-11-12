import { describe, expect, it } from "vitest";
import {
  CLAVES_CONFIG_ACCESO_POR_PERSONA,
  IDS_ACCESO_POR_PERSONA,
  MODULOS_ACCESO_POR_PERSONA,
  TEXTO_ACCESO_API_VIEJO,
  TEXTO_ACCESO_MODULO_DESCONOCIDO,
  TEXTO_ACCESO_NO_DISPONIBLE,
  TEXTO_ACCESO_SIN_CANDIDATOS,
  TEXTO_ACCESO_SOLO_DIRECCION,
  TOPE_ACCESO_POR_PERSONA,
  conAccesoHoy,
  diffAcceso,
  erroresAcceso,
  errorAccesoPideRecargar,
  esIdAccesoPorPersona,
  etiquetaCargaAcceso,
  guardadosFueraDeLista,
  idsAGuardarAcceso,
  mensajeErrorAcceso,
  moduloAccesoPorPersona,
  nombreDeAcceso,
  textoAccesoActual,
  textoAccesoError,
  textoAccesoFallo,
  textoConfirmarAcceso,
  textoEntranPorRol,
  textoFueraDeLista,
  textoGuardadoAcceso,
  textoUltimoCambioAcceso,
  tituloConfirmarAcceso,
  type AccesoPorPersona,
} from "@/lib/admin/acceso-por-persona";
import { diffListaIds } from "@/lib/admin/lista-ids";
import { diffEditores } from "@/lib/admin/cotizacion-cobrada";
import { puedeVerNomina } from "@/lib/admin/nomina";
import { puedeRepartirNomina } from "@/lib/admin/nomina-reparto";
import {
  MODULOS_SOLO_DIRECCION,
  ROLES_GASTOS_PERSONALES,
  TEXTO_GASTOS_PERSONALES_SOLO_DIRECCION,
  TEXTO_NOMINA_SOLO_DIRECCION,
  puedeVerGastosPersonales,
} from "@/lib/admin/roles";
import { NAV_GROUPS, filterNavGroupsForRole } from "@/lib/admin/nav-items";
import type { PermisosMe } from "@/types/me";

/**
 * Configuración · «Acceso a Nómina» (12-nov-2026, API 0.0.137) y «Acceso a
 * Gastos personales» (API 0.0.138). Pedidos de Dirección: «poder habilitar o
 * deshabilitar a algunos usuarios el módulo de nómina … le acaban de
 * autorizar el acceso a Mary, pero no sé si es para siempre o temporal, mejor
 * poder controlarlo desde configuración» y «venga otro para gastos
 * personales». En prod toda la oficina es Administración (ADMIN) o Dirección:
 * es POR PERSONA. UNA pieza para los dos módulos; aquí se congelan los textos
 * exactos de cada uno y que un acceso no dé el otro.
 */
const ALE = "c691cc8b-3034-4f04-a383-d0b25c1971ec";
const DIEGO = "c4d0633d-a5e9-4764-8e54-03c7fb00f3b7";
const PABLO = "e5aa04a8-ac24-446a-b41d-9af5917cd4f1";
const VILLALOBOS = "ee3c5690-467c-481d-940f-f4c06010155f";
const ITZI = "5391362f-e8cc-4287-95ef-739911fbf0e5";
const MARY = "e0b26729-1f02-4dc0-9c1a-e7192e638478";
const BAJA = "5efca0e1-3474-4857-aabf-0f99c9457903";
const SELLO = "2026-11-12T20:04:00.123+00:00";

const NOMINA = MODULOS_ACCESO_POR_PERSONA.nomina;
const PERSONALES = MODULOS_ACCESO_POR_PERSONA.gastos_personales;

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

function datos(extra: Partial<AccesoPorPersona> = {}): AccesoPorPersona {
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

/** Lo que trae `/me.permisos` a quien tiene UNO solo de los dos accesos. */
const SOLO_NOMINA: PermisosMe = { nomina: true };
const SOLO_PERSONALES: PermisosMe = { gastos_personales: true };

describe("los módulos con acceso por persona", () => {
  it("son dos, en el orden de Configuración, y su id ES la llave de `/me.permisos`", () => {
    expect([...IDS_ACCESO_POR_PERSONA]).toEqual(["nomina", "gastos_personales"]);
    expect(Object.keys(MODULOS_ACCESO_POR_PERSONA)).toEqual([...IDS_ACCESO_POR_PERSONA]);
    for (const id of IDS_ACCESO_POR_PERSONA) expect(MODULOS_ACCESO_POR_PERSONA[id].id).toBe(id);
    // El ítem del menú de cada módulo se abre con ESE permiso (y solo con ese).
    const items = NAV_GROUPS.flatMap((g) => g.items);
    expect(items.find((i) => i.href === "/admin/nomina")?.permiso).toBe("nomina");
    expect(items.find((i) => i.href === "/admin/gastos-personales")?.permiso).toBe(
      "gastos_personales",
    );
    expect(items.filter((i) => i.permiso != null)).toHaveLength(2);
  });

  it("contrato con el API: clave, ruta y códigos de cada lista", () => {
    expect(NOMINA).toMatchObject({
      clave: "acceso_nomina",
      ruta: "/v1/config/acceso-nomina",
      nombre: "Nómina",
      titulo: "Acceso a Nómina",
      codigoSoloDireccion: "SOLO_DIRECCION_ACCESO_NOMINA",
      codigoCambio: "ACCESO_NOMINA_CAMBIO",
    });
    expect(PERSONALES).toMatchObject({
      clave: "acceso_gastos_personales",
      ruta: "/v1/config/acceso-gastos-personales",
      nombre: "Gastos personales",
      titulo: "Acceso a Gastos personales",
      codigoSoloDireccion: "SOLO_DIRECCION_ACCESO_GASTOS_PERSONALES",
      codigoCambio: "ACCESO_GASTOS_PERSONALES_CAMBIO",
    });
    expect([...CLAVES_CONFIG_ACCESO_POR_PERSONA]).toEqual([
      "acceso_nomina",
      "acceso_gastos_personales",
    ]);
    expect(TOPE_ACCESO_POR_PERSONA).toBe(50);
    // Nada se comparte entre las dos listas.
    for (const campo of ["clave", "ruta", "nombre", "titulo", "codigoSoloDireccion", "codigoCambio"] as const) {
      expect(NOMINA[campo], campo).not.toBe(PERSONALES[campo]);
    }
  });

  it("un id que no es de los nuestros no resuelve módulo (a la server action le llega del navegador)", () => {
    expect(moduloAccesoPorPersona("nomina")).toBe(NOMINA);
    expect(moduloAccesoPorPersona("gastos_personales")).toBe(PERSONALES);
    for (const raro of ["constructor", "toString", "__proto__", "NOMINA", "", null, undefined, 3, {}]) {
      expect(moduloAccesoPorPersona(raro), String(raro)).toBeNull();
      expect(esIdAccesoPorPersona(raro), String(raro)).toBe(false);
    }
    expect(TEXTO_ACCESO_MODULO_DESCONOCIDO).toBe(
      "No se reconoció qué acceso se quería guardar. Recarga la página.",
    );
  });
});

describe("quién entra a Nómina (menú y pantalla)", () => {
  it("Administración CON el acceso ve «Nómina» en el menú y entra a la pantalla; los demás módulos de Dirección siguen cerrados", () => {
    const menu = new Set(hrefs("ADMIN", { nomina: true }));
    expect(menu.has("/admin/nomina")).toBe(true);
    for (const h of MODULOS_SOLO_DIRECCION.filter((x) => x !== "/admin/nomina")) {
      expect(menu.has(h), h).toBe(false);
    }
    expect(puedeVerNomina("ADMIN", { nomina: true })).toBe(true);
    expect(puedeRepartirNomina("ADMIN", { nomina: true })).toBe(true);
    // El acceso a Nómina NO da los gastos personales.
    expect(puedeVerGastosPersonales("ADMIN", SOLO_NOMINA)).toBe(false);
    // El resto del menú de Administración no cambia.
    const sin = hrefs("ADMIN");
    expect([...menu].filter((h) => h !== "/admin/nomina").sort()).toEqual([...sin].sort());
  });

  it("Administración SIN el acceso (false, ausente o API previo) queda como antes", () => {
    for (const permisos of [
      { nomina: false },
      {},
      { editar_cotizacion_cobrada: true },
      { gastos_personales: true },
      null,
      undefined,
    ]) {
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

describe("quién entra a Gastos personales (menú y pantalla)", () => {
  it("Administración CON el acceso ve «Gastos personales» en el menú y entra a la pantalla; los demás módulos de Dirección siguen cerrados", () => {
    const menu = new Set(hrefs("ADMIN", { gastos_personales: true }));
    expect(menu.has("/admin/gastos-personales")).toBe(true);
    for (const h of MODULOS_SOLO_DIRECCION.filter((x) => x !== "/admin/gastos-personales")) {
      expect(menu.has(h), h).toBe(false);
    }
    expect(puedeVerGastosPersonales("ADMIN", { gastos_personales: true })).toBe(true);
    // El acceso a Gastos personales NO da la nómina (ni verla ni repartirla).
    expect(puedeVerNomina("ADMIN", SOLO_PERSONALES)).toBe(false);
    expect(puedeRepartirNomina("ADMIN", SOLO_PERSONALES)).toBe(false);
    // El resto del menú de Administración no cambia.
    const sin = hrefs("ADMIN");
    expect([...menu].filter((h) => h !== "/admin/gastos-personales").sort()).toEqual(
      [...sin].sort(),
    );
  });

  it("con los DOS accesos ve los dos módulos (y nada más de Dirección)", () => {
    const menu = new Set(hrefs("ADMIN", { nomina: true, gastos_personales: true }));
    expect(menu.has("/admin/nomina")).toBe(true);
    expect(menu.has("/admin/gastos-personales")).toBe(true);
    for (const h of MODULOS_SOLO_DIRECCION.filter(
      (x) => x !== "/admin/nomina" && x !== "/admin/gastos-personales",
    )) {
      expect(menu.has(h), h).toBe(false);
    }
  });

  it("Administración SIN el acceso (false, ausente o API previo) queda como antes", () => {
    for (const permisos of [
      { gastos_personales: false },
      {},
      { editar_cotizacion_cobrada: true },
      { nomina: true },
      null,
      undefined,
    ]) {
      expect(hrefs("ADMIN", permisos).includes("/admin/gastos-personales")).toBe(false);
      expect(puedeVerGastosPersonales("ADMIN", permisos)).toBe(false);
    }
    expect(puedeVerGastosPersonales("ADMIN")).toBe(false);
  });

  it("por su rol entran Dirección y Coordinación; Facturación no (ni con el permiso de Nómina); sin rol conocido ningún permiso abre nada", () => {
    expect([...ROLES_GASTOS_PERSONALES]).toEqual(["DIRECCION", "COORDINADOR"]);
    for (const rol of ROLES_GASTOS_PERSONALES) {
      expect(puedeVerGastosPersonales(rol)).toBe(true);
      expect(puedeVerGastosPersonales(rol, { gastos_personales: false })).toBe(true);
      expect(hrefs(rol, { gastos_personales: false }).includes("/admin/gastos-personales")).toBe(
        true,
      );
    }
    expect(puedeVerGastosPersonales("FACTURACION")).toBe(false);
    expect(puedeVerGastosPersonales("FACTURACION", SOLO_NOMINA)).toBe(false);
    expect(hrefs("FACTURACION", { nomina: true }).includes("/admin/gastos-personales")).toBe(false);
    for (const rol of [null, undefined, ""]) {
      expect(puedeVerGastosPersonales(rol, { gastos_personales: true })).toBe(false);
    }
    expect(hrefs(undefined, { gastos_personales: true }).includes("/admin/gastos-personales")).toBe(
      false,
    );
  });

  it("a quien no entra se le dice a quién pedírselo y dónde", () => {
    expect(TEXTO_GASTOS_PERSONALES_SOLO_DIRECCION).toBe(
      "Los gastos personales los ve Dirección y a quien Dirección le dé acceso. Si te toca llevarlos, pídele a Dirección que te lo dé en Configuración → «Acceso a Gastos personales».",
    );
  });
});

describe("textos de cada tarjeta", () => {
  it("Nómina: título y descripción (qué abre, que es temporal si se quiere, qué NO abre)", () => {
    expect(NOMINA.titulo).toBe("Acceso a Nómina");
    expect(NOMINA.descripcion).toBe(
      "A quién de Administración le das entrada al módulo de Nómina: ver los pagos, registrarlos, repartirlos entre aviones y exportarlos. Enciéndelo o apágalo cuando quieras (por ejemplo, si el acceso es solo por un tiempo); aplica en cuanto guardas. No abre los gastos personales ni los demás módulos de Dirección.",
    );
  });

  it("Gastos personales: título y descripción (qué abre, que es temporal si se quiere, qué NO abre)", () => {
    expect(PERSONALES.titulo).toBe("Acceso a Gastos personales");
    expect(PERSONALES.descripcion).toBe(
      "A quién de Administración le das entrada al módulo de Gastos personales: ver los gastos personales del dueño, registrarlos, corregirlos y exportarlos. Enciéndelo o apágalo cuando quieras (por ejemplo, si el acceso es solo por un tiempo); aplica en cuanto guardas. No abre la Nómina ni los demás módulos de Dirección.",
    );
  });

  it("textos comunes a las dos tarjetas", () => {
    expect(TEXTO_ACCESO_SOLO_DIRECCION).toBe("Solo Dirección puede cambiar quién entra.");
    expect(TEXTO_ACCESO_SIN_CANDIDATOS).toBe("No hay usuarios activos de Administración.");
    expect(TEXTO_ACCESO_NO_DISPONIBLE).toBe("Disponible cuando se actualice el API.");
  });

  it("cuando no se pudo cargar se nombra la lista (aviso de la página y tarjeta)", () => {
    expect(etiquetaCargaAcceso(NOMINA)).toBe("quién entra a Nómina");
    expect(etiquetaCargaAcceso(PERSONALES)).toBe("quién entra a Gastos personales");
    expect(textoAccesoFallo(NOMINA)).toBe(
      "No se pudo cargar quién entra a Nómina. Recarga la página para reintentar.",
    );
    expect(textoAccesoFallo(PERSONALES)).toBe(
      "No se pudo cargar quién entra a Gastos personales. Recarga la página para reintentar.",
    );
  });

  it("quién tiene hoy el acceso: solo guardados que siguen en Administración activa, en su orden", () => {
    expect(conAccesoHoy(datos())).toEqual(["Mary Cruz"]);
    expect(conAccesoHoy(datos({ usuario_ids: [ITZI, MARY, BAJA] }))).toEqual(["Itzi", "Mary Cruz"]);
    expect(conAccesoHoy(datos({ usuario_ids: [] }))).toEqual([]);
    for (const m of [NOMINA, PERSONALES]) {
      expect(textoAccesoActual(m, ["Mary Cruz"])).toBe("Con acceso dado aquí: Mary Cruz.");
      expect(textoAccesoActual(m, ["Itzi", "Mary Cruz"])).toBe(
        "Con acceso dado aquí: Itzi y Mary Cruz.",
      );
      // La pieza común de los nombres (`unirNombres`): «e» ante «Itzi».
      expect(textoAccesoActual(m, ["Mary Cruz", "Itzi"])).toBe(
        "Con acceso dado aquí: Mary Cruz e Itzi.",
      );
    }
    expect(textoAccesoActual(NOMINA, [])).toBe("Hoy nadie de Administración entra a Nómina.");
    expect(textoAccesoActual(PERSONALES, [])).toBe(
      "Hoy nadie de Administración entra a Gastos personales.",
    );
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
    expect(diffAcceso([MARY], [MARY, ITZI])).toEqual({
      agregados: [ITZI],
      quitados: [],
      cambio: true,
    });
    expect(diffAcceso([MARY], [])).toEqual({ agregados: [], quitados: [MARY], cambio: true });
    expect(diffAcceso([MARY, ITZI], [ITZI, MARY]).cambio).toBe(false);
    expect(diffAcceso([], []).cambio).toBe(false);
    // Limpiar a uno que se dio de baja también habilita «Guardar».
    expect(diffAcceso([MARY, BAJA], [MARY])).toEqual({
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

  it("la confirmación dice con NOMBRE quién entra y quién deja de entrar, y a QUÉ módulo", () => {
    expect(tituloConfirmarAcceso(NOMINA)).toBe("¿Cambiar quién entra a Nómina?");
    expect(tituloConfirmarAcceso(PERSONALES)).toBe("¿Cambiar quién entra a Gastos personales?");
    expect(textoConfirmarAcceso(NOMINA, { agregados: ["Mary Cruz"], quitados: [] })).toBe(
      "Podrán entrar a Nómina: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAcceso(NOMINA, { agregados: [], quitados: ["Mary Cruz", "Itzi"] })).toBe(
      "Dejarán de entrar: Mary Cruz e Itzi. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAcceso(NOMINA, { agregados: ["Itzi"], quitados: ["Mary Cruz"] })).toBe(
      "Podrán entrar a Nómina: Itzi. Dejarán de entrar: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAcceso(PERSONALES, { agregados: ["Mary Cruz"], quitados: [] })).toBe(
      "Podrán entrar a Gastos personales: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
    expect(textoConfirmarAcceso(PERSONALES, { agregados: ["Itzi"], quitados: ["Mary Cruz"] })).toBe(
      "Podrán entrar a Gastos personales: Itzi. Dejarán de entrar: Mary Cruz. Aplica de inmediato; lo puedes cambiar cuando quieras.",
    );
  });

  it("aviso tras guardar: quién quedó y cuándo lo verá", () => {
    expect(textoGuardadoAcceso(NOMINA, ["Mary Cruz"])).toBe(
      "Guardado. Con acceso a Nómina: Mary Cruz. Lo verán en su menú al recargar la página.",
    );
    expect(textoGuardadoAcceso(NOMINA, [])).toBe("Guardado. Nadie de Administración entra a Nómina.");
    expect(textoGuardadoAcceso(PERSONALES, ["Mary Cruz", "Itzi"])).toBe(
      "Guardado. Con acceso a Gastos personales: Mary Cruz e Itzi. Lo verán en su menú al recargar la página.",
    );
    expect(textoGuardadoAcceso(PERSONALES, [])).toBe(
      "Guardado. Nadie de Administración entra a Gastos personales.",
    );
  });
});

describe("errores del guardado (se decide por CÓDIGO)", () => {
  it("respaldos en es-MX de los códigos propios de cada lista", () => {
    expect(erroresAcceso(NOMINA)).toEqual({
      SOLO_DIRECCION_ACCESO_NOMINA: "Solo Dirección puede cambiar quién entra a Nómina.",
      USUARIOS_INVALIDOS:
        "Alguno de los usuarios elegidos ya no es de Administración activa. Recarga la página.",
      ACCESO_NOMINA_CAMBIO:
        "Alguien más cambió quién entra a Nómina mientras lo editabas. Recarga y vuelve a intentar.",
    });
    expect(erroresAcceso(PERSONALES)).toEqual({
      SOLO_DIRECCION_ACCESO_GASTOS_PERSONALES:
        "Solo Dirección puede cambiar quién entra a Gastos personales.",
      USUARIOS_INVALIDOS:
        "Alguno de los usuarios elegidos ya no es de Administración activa. Recarga la página.",
      ACCESO_GASTOS_PERSONALES_CAMBIO:
        "Alguien más cambió quién entra a Gastos personales mientras lo editabas. Recarga y vuelve a intentar.",
    });
    expect(textoAccesoError(NOMINA)).toBe("No se pudo guardar el acceso a Nómina.");
    expect(textoAccesoError(PERSONALES)).toBe("No se pudo guardar el acceso a Gastos personales.");
  });

  it("con código propio manda el texto del API; sin él, el respaldo", () => {
    expect(
      mensajeErrorAcceso(NOMINA, {
        code: "ACCESO_NOMINA_CAMBIO",
        status: 409,
        error: "Texto del API.",
      }),
    ).toBe("Texto del API.");
    expect(mensajeErrorAcceso(NOMINA, { code: "USUARIOS_INVALIDOS", status: 400 })).toBe(
      erroresAcceso(NOMINA).USUARIOS_INVALIDOS,
    );
    expect(
      mensajeErrorAcceso(NOMINA, { code: "SOLO_DIRECCION_ACCESO_NOMINA", status: 403, error: "  " }),
    ).toBe("Solo Dirección puede cambiar quién entra a Nómina.");
    expect(
      mensajeErrorAcceso(PERSONALES, { code: "ACCESO_GASTOS_PERSONALES_CAMBIO", status: 409 }),
    ).toBe(
      "Alguien más cambió quién entra a Gastos personales mientras lo editabas. Recarga y vuelve a intentar.",
    );
    expect(
      mensajeErrorAcceso(PERSONALES, {
        code: "SOLO_DIRECCION_ACCESO_GASTOS_PERSONALES",
        status: 403,
      }),
    ).toBe("Solo Dirección puede cambiar quién entra a Gastos personales.");
  });

  it("el código de la OTRA lista no es propio: no se repite su texto como si fuera de esta", () => {
    expect(
      mensajeErrorAcceso(PERSONALES, {
        code: "ACCESO_NOMINA_CAMBIO",
        status: 409,
        error: "Alguien más cambió quién entra a Nómina mientras lo editabas.",
      }),
    ).toBe("No se pudo guardar el acceso a Gastos personales.");
    expect(errorAccesoPideRecargar(PERSONALES, { code: "ACCESO_NOMINA_CAMBIO" })).toBe(false);
    expect(errorAccesoPideRecargar(NOMINA, { code: "ACCESO_GASTOS_PERSONALES_CAMBIO" })).toBe(false);
    // Un código con nombre de propiedad heredada tampoco pasa por propio.
    expect(mensajeErrorAcceso(NOMINA, { code: "constructor", status: 400, error: "x" })).toBe(
      "No se pudo guardar el acceso a Nómina.",
    );
  });

  it("el 403 del guard de roles (texto técnico en inglés) se dice en claro; el 404 es un API sin desplegar", () => {
    expect(
      mensajeErrorAcceso(NOMINA, {
        code: "FORBIDDEN",
        status: 403,
        error: "Required role: DIRECCION. Current: ADMIN",
      }),
    ).toBe("Solo Dirección puede cambiar quién entra a Nómina.");
    expect(
      mensajeErrorAcceso(PERSONALES, {
        code: "FORBIDDEN",
        status: 403,
        error: "Required role: DIRECCION. Current: ADMIN",
      }),
    ).toBe("Solo Dirección puede cambiar quién entra a Gastos personales.");
    for (const m of [NOMINA, PERSONALES]) {
      expect(mensajeErrorAcceso(m, { status: 404, error: `Cannot PUT ${m.ruta}` })).toBe(
        TEXTO_ACCESO_API_VIEJO,
      );
      expect(mensajeErrorAcceso(m, { status: 500, error: "Internal server error" })).toBe(
        textoAccesoError(m),
      );
      expect(mensajeErrorAcceso(m, {})).toBe(textoAccesoError(m));
      expect(
        mensajeErrorAcceso(m, {
          code: "BAD_REQUEST",
          status: 400,
          error: "usuario_ids must be an array",
        }),
      ).toBe(textoAccesoError(m));
    }
    expect(TEXTO_ACCESO_API_VIEJO).toBe(
      "Falta actualizar el API para guardar este acceso. Avisa a sistemas.",
    );
  });

  it("qué rechazos piden repintar la sección", () => {
    for (const m of [NOMINA, PERSONALES]) {
      for (const code of [m.codigoCambio, "USUARIOS_INVALIDOS", m.codigoSoloDireccion]) {
        expect(errorAccesoPideRecargar(m, { code }), code).toBe(true);
      }
      expect(errorAccesoPideRecargar(m, { status: 403, code: "FORBIDDEN" })).toBe(true);
      expect(errorAccesoPideRecargar(m, { status: 500 })).toBe(false);
      expect(errorAccesoPideRecargar(m, { status: 404 })).toBe(false);
      expect(errorAccesoPideRecargar(m, {})).toBe(false);
    }
  });
});
