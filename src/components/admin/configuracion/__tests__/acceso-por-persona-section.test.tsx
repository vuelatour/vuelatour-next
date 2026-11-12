import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Configuración · «Acceso a Nómina» (12-nov-2026, API 0.0.137) y «Acceso a
 * Gastos personales» (API 0.0.138). Pedidos de Dirección: «poder habilitar o
 * deshabilitar a algunos usuarios el módulo de nómina … le acaban de
 * autorizar el acceso a Mary, pero no sé si es para siempre o temporal, mejor
 * poder controlarlo desde configuración» y «venga otro para gastos
 * personales». Es POR PERSONA: toda la oficina es Administración y a cada
 * módulo solo entra quien Dirección encienda en SU tarjeta.
 *
 * Las dos tarjetas son el MISMO componente: cada caso corre contra las dos.
 * El runner no tiene DOM: se congela el MARCADO estático de cada estado y el
 * CABLEADO por regex sobre los fuentes (página, action, lectura del API).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/configuracion/actions", () => ({
  setAccesoPorPersonaAction: async () => ({ ok: false, error: "mock" }),
}));

import { AccesoPorPersonaSection } from "@/components/admin/configuracion/acceso-por-persona-section";
import {
  MODULOS_ACCESO_POR_PERSONA,
  type AccesoPorPersona,
  type IdAccesoPorPersona,
} from "@/lib/admin/acceso-por-persona";

const ALE = "c691cc8b-3034-4f04-a383-d0b25c1971ec";
const DIEGO = "c4d0633d-a5e9-4764-8e54-03c7fb00f3b7";
const PABLO = "e5aa04a8-ac24-446a-b41d-9af5917cd4f1";
const VILLALOBOS = "ee3c5690-467c-481d-940f-f4c06010155f";
const ITZI = "5391362f-e8cc-4287-95ef-739911fbf0e5";
const JIMMY = "ca9564a1-eef0-4fdb-b4e9-beceaa5a2428";
const MARY = "e0b26729-1f02-4dc0-9c1a-e7192e638478";
const PORFIRIO = "0439f3b4-2144-487b-bdb9-b6285e7ff5bf";
const BAJA = "5efca0e1-3474-4857-aabf-0f99c9457903";
// 12-nov-2026, 15:04 en Cancún (UTC−5).
const SELLO = "2026-11-12T20:04:00.123+00:00";

/** La oficina REAL de prod (12-nov-2026): cinco de Administración, tres de Dirección. */
const candidatos = [
  { id: VILLALOBOS, nombre: "Alejandro Villalobos", rol: "ADMIN" },
  { id: ITZI, nombre: "Itzi", rol: "ADMIN" },
  { id: JIMMY, nombre: "Jimmy Chi", rol: "ADMIN" },
  { id: MARY, nombre: "Mary Cruz", rol: "ADMIN" },
  { id: PORFIRIO, nombre: "Porfirio Cruz", rol: "ADMIN" },
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

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

interface Caso {
  id: IdAccesoPorPersona;
  /** Arranque de la descripción (lo que dice qué abre). */
  abre: string;
  /** Lo que la tarjeta dice que NO abre. */
  noAbre: string;
  /** El título de la OTRA tarjeta: jamás debe salir en esta. */
  tituloAjeno: string;
}

const CASOS: Caso[] = [
  {
    id: "nomina",
    abre: "A quién de Administración le das entrada al módulo de Nómina",
    noAbre: "No abre los gastos personales ni los demás módulos de Dirección.",
    tituloAjeno: "Acceso a Gastos personales",
  },
  {
    id: "gastos_personales",
    abre: "A quién de Administración le das entrada al módulo de Gastos personales",
    noAbre: "No abre la Nómina ni los demás módulos de Dirección.",
    tituloAjeno: "Acceso a Nómina",
  },
];

describe.each(CASOS)("tarjeta de acceso por persona · $id", (caso) => {
  const modulo = MODULOS_ACCESO_POR_PERSONA[caso.id];
  const pintar = (d: AccesoPorPersona | null, fallo = false) =>
    renderToStaticMarkup(<AccesoPorPersonaSection modulo={caso.id} datos={d} fallo={fallo} />);

  describe("Dirección", () => {
    it("un switch por persona de Administración: Mary encendida, los demás apagados", () => {
      const html = pintar(datos());
      expect(html).toContain(modulo.titulo);
      expect(html).not.toContain(caso.tituloAjeno);
      expect(html).toContain(caso.abre);
      expect(html).toContain(caso.noAbre);
      expect(html).toContain(`data-acceso-por-persona="${caso.id}"`);
      expect(switchDe(html, MARY)).toEqual({ encendido: true, deshabilitado: false });
      for (const id of [VILLALOBOS, ITZI, JIMMY, PORFIRIO]) {
        expect(switchDe(html, id), id).toEqual({ encendido: false, deshabilitado: false });
      }
      for (const c of candidatos) expect(html).toContain(c.nombre);
      // Dirección entra por su rol: se DICE, pero no tiene switch (no se apaga aquí).
      expect(html).toContain(
        "Por su rol entran siempre: Alejandro Canales, Diego Ramírez y Pablo Canales.",
      );
      for (const id of [ALE, DIEGO, PABLO]) expect(switchDe(html, id), id).toBeNull();
      expect(html).toContain("Con acceso dado aquí: Mary Cruz.");
      // Quién y cuándo lo cambió por última vez (hora Cancún).
      expect(html).toContain("Último cambio: 12/11/2026, 3:04 p.m. · Diego Ramírez");
      expect(html).not.toContain("Solo Dirección puede cambiar quién entra.");
    });

    it("«Guardar» nace deshabilitado (sin cambios no hay nada que confirmar) y el diálogo está cerrado", () => {
      const html = pintar(datos());
      const boton = html.match(/<button[^>]*>Guardar<\/button>/)?.[0] ?? "";
      expect(boton).toMatch(/\sdisabled=""/);
      expect(html).not.toContain(`¿Cambiar quién entra a ${modulo.nombre}?`);
    });

    it("nunca se ha guardado (lista vacía, sin sello): todo apagado, sin «Último cambio»", () => {
      const html = pintar(
        datos({
          usuario_ids: [],
          usuarios: [],
          version: null,
          actualizado_at: null,
          actualizado_por_nombre: null,
        }),
      );
      for (const c of candidatos) expect(switchDe(html, c.id)?.encendido, c.nombre).toBe(false);
      expect(html).toContain(`Hoy nadie de Administración entra a ${modulo.nombre}.`);
      expect(html).not.toContain("Último cambio");
    });

    it("un guardado que ya no es de Administración activa: sin switch, se avisa en ámbar y «Guardar» se habilita para quitarlo", () => {
      const html = pintar(
        datos({
          usuario_ids: [MARY, BAJA, ALE],
          usuarios: [
            { id: MARY, nombre: "Mary Cruz" },
            { id: ALE, nombre: "Alejandro Canales" },
          ],
        }),
      );
      expect(switchDe(html, BAJA)).toBeNull();
      expect(html).toContain(
        "En la lista, pero ya no son de Administración activa (no entran): un usuario dado de baja y Alejandro Canales. Pulsa «Guardar» para quitarlos.",
      );
      // Solo cuenta quien sigue en Administración activa.
      expect(html).toContain("Con acceso dado aquí: Mary Cruz.");
      const boton = html.match(/<button[^>]*>Guardar<\/button>/)?.[0] ?? "";
      expect(boton).not.toMatch(/\sdisabled=""/);
    });

    it("sin nadie de Administración activa se dice (y no se pinta una lista vacía)", () => {
      const html = pintar(datos({ usuario_ids: [], usuarios: [], candidatos: [] }));
      expect(html).toContain("No hay usuarios activos de Administración.");
      expect(html).not.toContain("<ul");
    });
  });

  describe("Administración (solo lectura)", () => {
    it("ve quién entra, sin switches ni «Guardar», y que solo Dirección lo cambia", () => {
      const html = pintar(datos({ puede_modificar: false }));
      expect(html).toContain(modulo.titulo);
      expect(html).not.toContain(caso.tituloAjeno);
      expect(html).toContain("Con acceso dado aquí: Mary Cruz.");
      expect(html).toContain(
        "Por su rol entran siempre: Alejandro Canales, Diego Ramírez y Pablo Canales.",
      );
      expect(html).toContain("Solo Dirección puede cambiar quién entra.");
      expect(html).not.toContain('role="switch"');
      expect(html).not.toContain("Guardar");
      for (const c of candidatos) expect(switchDe(html, c.id), c.nombre).toBeNull();
    });

    it("sin nadie con acceso lo dice en claro", () => {
      const html = pintar(datos({ puede_modificar: false, usuario_ids: [], usuarios: [] }));
      expect(html).toContain(`Hoy nadie de Administración entra a ${modulo.nombre}.`);
    });
  });

  describe("sin datos", () => {
    it("API previo (404) ⇒ gris «Disponible cuando se actualice el API», sin controles", () => {
      const html = pintar(null);
      expect(html).toContain(modulo.titulo);
      expect(html).toContain("Disponible cuando se actualice el API.");
      expect(html).not.toContain('role="switch"');
      expect(html).not.toContain("Guardar");
    });

    it("la carga FALLÓ ⇒ se dice que falló (jamás «nadie entra»)", () => {
      const html = pintar(null, true);
      expect(html).toContain(
        `No se pudo cargar quién entra a ${modulo.nombre}. Recarga la página para reintentar.`,
      );
      expect(html).not.toContain("Disponible cuando se actualice el API.");
      expect(html).not.toContain("nadie de Administración");
    });
  });
});

describe("las dos tarjetas son independientes", () => {
  it("cada una pinta SU lista: Mary con Nómina y sin Gastos personales (como hoy en producción)", () => {
    const nomina = renderToStaticMarkup(
      <AccesoPorPersonaSection modulo="nomina" datos={datos()} />,
    );
    const personales = renderToStaticMarkup(
      <AccesoPorPersonaSection
        modulo="gastos_personales"
        datos={datos({
          usuario_ids: [],
          usuarios: [],
          version: null,
          actualizado_at: null,
          actualizado_por_nombre: null,
        })}
      />,
    );
    expect(switchDe(nomina, MARY)?.encendido).toBe(true);
    expect(switchDe(personales, MARY)?.encendido).toBe(false);
    expect(nomina).toContain("Con acceso dado aquí: Mary Cruz.");
    expect(personales).toContain("Hoy nadie de Administración entra a Gastos personales.");
    // Los switches de una tarjeta no comparten id con los de la otra.
    const idsDe = (html: string) =>
      [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    const juntas = renderToStaticMarkup(
      <>
        <AccesoPorPersonaSection modulo="nomina" datos={datos()} />
        <AccesoPorPersonaSection modulo="gastos_personales" datos={datos()} />
      </>,
    );
    const ids = idsDe(juntas);
    expect(ids).toHaveLength(candidatos.length * 2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cableado (por regex sobre los fuentes)", () => {
  const seccion = leer("../acceso-por-persona-section.tsx");
  const pagina = leer("../../../../app/admin/configuracion/page.tsx");
  const actions = leer("../../../../app/admin/configuracion/actions.ts");
  const servidor = leer("../../../../lib/api/configuracion-server.ts");
  const cliente = leer("../configuracion-client.tsx");
  const paginaPersonales = leer("../../../../app/admin/gastos-personales/page.tsx");

  it("todo cambio se CONFIRMA con nombre antes de guardar (dar o quitar la entrada)", () => {
    expect(seccion).toMatch(/<Button size="sm" onClick=\{\(\) => setConfirmando\(true\)\} disabled=\{!cambio \|\| pendiente\}>/);
    expect(seccion).toContain("<AlertDialogTitle>{tituloConfirmarAcceso(modulo)}</AlertDialogTitle>");
    expect(seccion).toContain("<AlertDialogDescription>{textoConfirmacion}</AlertDialogDescription>");
    // El guardado sale SOLO del botón del diálogo.
    expect(seccion.match(/guardar\(\);/g)).toHaveLength(1);
    expect(seccion.indexOf("guardar();")).toBeGreaterThan(seccion.indexOf("<AlertDialogAction"));
  });

  it("el guardado lleva el MÓDULO de la tarjeta y el SELLO de la pantalla: una pantalla vieja no le devuelve el acceso a quien se lo acaban de quitar", () => {
    expect(seccion).toContain(
      "await setAccesoPorPersonaAction(modulo.id, aGuardar, datos.version ?? null)",
    );
    // La ruta sale SOLO de la tabla de módulos (el id llega del navegador).
    expect(actions).toContain("const def = moduloAccesoPorPersona(modulo);");
    expect(actions).toContain("if (!def) return { ok: false, error: TEXTO_ACCESO_MODULO_DESCONOCIDO };");
    expect(actions).toMatch(
      /apiServer<AccesoPorPersona>\(def\.ruta, \{\s*method: "PUT",\s*body: \{ usuario_ids: ids, version \},\s*\}\)/,
    );
    expect(actions.indexOf("if (!def) return")).toBeLessThan(
      actions.indexOf("apiServer<AccesoPorPersona>(def.ruta"),
    );
    // Ninguna ruta de acceso escrita a mano fuera de la tabla.
    for (const fuente of [actions, servidor, pagina, seccion]) {
      expect(fuente).not.toContain("/v1/config/acceso-");
    }
    // `apiServer` ya serializa: jamás JSON.stringify (AGENTS.md, «Red / API»).
    expect(actions).not.toMatch(/setAccesoPorPersonaAction[\s\S]{0,900}JSON\.stringify/);
    // Si otro de Dirección la cambió, la sección se remonta con lo que hay hoy
    // (la llave lleva el módulo: una tarjeta nunca hereda el estado de la otra).
    expect(pagina).toContain(
      'key={`${id}|${datos?.version ?? ""}|${(datos?.usuario_ids ?? []).join(",")}`}',
    );
  });

  it("los textos salen de la fuente única (el componente no redacta frases)", () => {
    expect(seccion).toContain('from "@/lib/admin/acceso-por-persona"');
    for (const frase of [
      "Con acceso dado aquí",
      "Por su rol entran",
      "Podrán entrar",
      "Solo Dirección",
      "Acceso a Nómina",
      "Acceso a Gastos personales",
      "¿Cambiar quién",
    ]) {
      expect(seccion, frase).not.toContain(`"${frase}`);
    }
    expect(seccion).toContain("toast.error(mensajeErrorAcceso(modulo, res))");
    expect(seccion).toContain("if (errorAccesoPideRecargar(modulo, res)) router.refresh();");
  });

  it("la página carga cada lista como ACCESORIA: 404 = API previo a ese módulo (gris, sin aviso); otro fallo se AVISA con el nombre de la lista y no tumba Configuración", () => {
    expect(servidor).toMatch(
      /export function getAccesoPorPersona\(modulo: IdAccesoPorPersona\) \{\s*return apiServer<AccesoPorPersona>\(MODULOS_ACCESO_POR_PERSONA\[modulo\]\.ruta, \{\s*cache: "no-store",\s*\}\);/,
    );
    expect(pagina).toMatch(
      /getAccesoPorPersona\(id\)\.then\(\s*\(datos\) => \(\{ id, datos, noDisponible: false \}\),\s*\(e: unknown\) => \{\s*if \(esErrorDeNext\(e\)\) throw e;\s*const noDisponible = isApiError\(e\) && e\.status === 404;/,
    );
    expect(pagina).toContain(
      "const etiqueta = etiquetaCargaAcceso(MODULOS_ACCESO_POR_PERSONA[id]);",
    );
    expect(pagina).toContain("faltantes.push(etiqueta);");
    expect(pagina).toContain("fallo={!datos && !noDisponible}");
    // Las DOS listas, en el orden de la fuente única (Nómina y luego Gastos
    // personales), justo después de «Editan cotizaciones cobradas».
    expect(pagina).toContain("Promise.all(IDS_ACCESO_POR_PERSONA.map(cargarAcceso)),");
    expect(pagina).toMatch(/\{accesosCarga\.map\(\(\{ id, datos, noDisponible \}\) => \(/);
    expect(pagina.indexOf("<AccesoPorPersonaSection")).toBeGreaterThan(
      pagina.indexOf("<EditoresCotizacionCobradaSection"),
    );
    expect(pagina.indexOf("<AccesoPorPersonaSection")).toBeLessThan(
      pagina.indexOf("<IaCreditosSection"),
    );
  });

  it("las claves no salen como un switch más entre las banderas", () => {
    expect(cliente).toContain("...CLAVES_CONFIG_ACCESO_POR_PERSONA,");
    expect(cliente).toContain(
      'import { CLAVES_CONFIG_ACCESO_POR_PERSONA } from "@/lib/admin/acceso-por-persona";',
    );
  });

  it("la pantalla de Gastos personales abre con el permiso por persona y, a quien no entra, le dice a quién pedírselo", () => {
    expect(paginaPersonales).toContain("if (!puedeVerGastosPersonales(me.rol, me.permisos)) {");
    expect(paginaPersonales).toContain("descripcion={TEXTO_GASTOS_PERSONALES_SOLO_DIRECCION}");
    // Falla CERRADO: sin `/me` no hay pantalla.
    expect(paginaPersonales).toMatch(
      /const me = await getMe\(\)\.catch\(\(\) => null\);\s*if \(!me\) notFound\(\);/,
    );
  });
});
