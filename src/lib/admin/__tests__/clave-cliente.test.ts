import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACENTOS_A,
  ACENTOS_DE,
  ALIAS_MAX,
  ALIAS_REGEX,
  AYUDA_ALIAS,
  ENCABEZADO_FOLIO_ID,
  LABEL_ALIAS,
  MENSAJE_ALIAS_INVALIDO,
  PLACEHOLDER_BARRA_COTIZACIONES,
  PLACEHOLDER_BUSCAR_CLIENTES,
  PLACEHOLDER_BUSCAR_COTIZACIONES,
  PLACEHOLDER_BUSCAR_VUELOS,
  PLACEHOLDER_BUSCAR_VUELOS_AVION,
  TEXTO_ALIAS_REPETIDO,
  TEXTO_NO_SE_PUDO_COPIAR,
  TITULO_CLAVE_CLIENTE,
  TITULO_COPIAR_CLAVE,
  aliasSugerido,
  avisoAliasCompartido,
  avisoAliasEnUso,
  avisoCambioAlias,
  ddmmaa,
  esAliasValido,
  listaNombres,
  normalizarAlias,
  normalizarAliasCaptura,
  textoClaveCopiada,
  textoClienteActualizado,
  textoClienteCreado,
  textoClienteRapidoCreado,
  textoEjemplo,
  textoUsarSugerido,
  tituloAliasRepetido,
} from "../clave-cliente";

/**
 * ID de vuelo por cliente (13-oct-2026, API 0.0.75): textos es-MX y reglas
 * del ALIAS en el panel. El ID («january02-211026») lo arma SOLO el API; aquí
 * se congelan el espejo del alias sugerido (MISMA tabla de 24 casos que el
 * dry-run de la migración), la limpieza del campo y los textos exactos.
 */

/** Los 24 casos de `public.cliente_alias_default` (C2 del dry-run). */
const CASOS_ALIAS: ReadonlyArray<[string | null, string]> = [
  ["Diego Ramírez", "diego"],
  ["Beh Kay ", "beh"],
  ["January Davila", "january"],
  ["Eduardo Núñez", "eduardo"],
  ["Núñez Pérez", "nunez"],
  ["Ñoño", "nono"],
  ["J&B Charters", "jb"],
  ["  JUAN   PABLO", "juan"],
  ["3M Company", "m"],
  ["Cliente 2024", "cliente"],
  ["Abc1 Ltd", "abc"],
  ["2024", "cliente"],
  ["***", "cliente"],
  ["", "cliente"],
  ["José María", "jose"],
  ["Ángel Álvarez", "angel"],
  ["Lic. Pedro", "lic"],
  ["VIP SAESA", "vip"],
  ["Vuelos de reposicionamiento", "vuelos"],
  ["Ærøskøbing Air", "rskbing"],
  ["Åsa Berg", "asa"],
  ["Çelik", "celik"],
  ["Supercalifragilisticoespialidoso Inc", "supercalifragilisticoesp"],
  [null, "cliente"],
];

describe("aliasSugerido: espejo EXACTO de public.cliente_alias_default", () => {
  it("la tabla tiene los 24 casos del dry-run", () => {
    expect(CASOS_ALIAS).toHaveLength(24);
  });

  it.each(CASOS_ALIAS)("«%s» ⇒ «%s»", (nombre, esperado) => {
    expect(aliasSugerido(nombre)).toBe(esperado);
  });

  it("undefined también cae a «cliente» y el resultado SIEMPRE es un alias válido", () => {
    expect(aliasSugerido(undefined)).toBe("cliente");
    for (const [nombre] of CASOS_ALIAS) expect(esAliasValido(aliasSugerido(nombre))).toBe(true);
  });

  it("ACENTOS_DE y ACENTOS_A miden 50 cada una (copia literal del translate)", () => {
    expect(Array.from(ACENTOS_DE)).toHaveLength(50);
    expect(Array.from(ACENTOS_A)).toHaveLength(50);
    expect(ACENTOS_DE).toBe(ACENTOS_DE.normalize("NFC"));
    // Posición a posición: cada acentuada cae en su letra base.
    Array.from(ACENTOS_DE).forEach((c, i) => {
      const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      expect(ACENTOS_A.charAt(i)).toBe(base);
    });
  });
});

describe("normalización y validación del alias", () => {
  it("normalizarAliasCaptura (onBlur): sin acentos, minúsculas, solo a-z, máximo 24", () => {
    expect(normalizarAliasCaptura("José María")).toBe("josemaria");
    expect(normalizarAliasCaptura("J&B")).toBe("jb");
    expect(normalizarAliasCaptura(" DIEGO ")).toBe("diego");
    expect(normalizarAliasCaptura("ñandú2")).toBe("nandu");
    expect(normalizarAliasCaptura("a".repeat(30))).toBe("a".repeat(ALIAS_MAX));
    expect(normalizarAliasCaptura("123")).toBe("");
  });

  it("normalizarAlias = lo que hace el API antes de validar (trim + minúsculas)", () => {
    expect(normalizarAlias(" DIEGO ")).toBe("diego");
    expect(normalizarAlias("")).toBe("");
  });

  it("esAliasValido / ALIAS_REGEX: a-z de 1 a 24", () => {
    for (const ok of ["diego", "a", "a".repeat(24)]) expect(esAliasValido(ok)).toBe(true);
    for (const malo of ["Diego", "diego2", "ñandu", "jb-x", "", "a".repeat(25), "die go"]) {
      expect(esAliasValido(malo)).toBe(false);
    }
    expect(esAliasValido(null)).toBe(false);
    expect(esAliasValido(undefined)).toBe(false);
    expect(ALIAS_REGEX.source).toBe("^[a-z]{1,24}$");
  });

  it("MENSAJE_ALIAS_INVALIDO es el texto del API", () => {
    expect(MENSAJE_ALIAS_INVALIDO).toBe(
      "Alias inválido: usa de 1 a 24 letras minúsculas, sin acentos, espacios, números ni signos (ej. diego).",
    );
  });
});

describe("ejemplo y fecha DDMMAA", () => {
  it("ddmmaa('2026-10-13') ⇒ '131026'; inválida ⇒ ''", () => {
    expect(ddmmaa("2026-10-13")).toBe("131026");
    expect(ddmmaa("2026-01-05")).toBe("050126");
    expect(ddmmaa("no-es-fecha")).toBe("");
  });

  it("textoEjemplo con el texto exacto", () => {
    expect(textoEjemplo("diego", "2026-10-13")).toBe(
      "Ejemplo: diego01-131026 (vuelo 1 del cliente con la fecha de hoy).",
    );
  });
});

describe("avisos del alias (textos exactos)", () => {
  it("avisoAliasEnUso: nadie ⇒ null", () => {
    expect(avisoAliasEnUso("juan", [])).toBeNull();
  });

  it("avisoAliasEnUso: 1 cliente", () => {
    expect(avisoAliasEnUso("juan", [{ nombre: "Juan Chacon", activo: true }])).toBe(
      "Ya lo usa Juan Chacon. Se permite, pero sus IDs de vuelo se verán iguales (juan01-…); mejor uno distinto.",
    );
    expect(avisoAliasEnUso("juan", [{ nombre: "Juan Satin", activo: false }])).toBe(
      "Ya lo usa Juan Satin (inactivo). Se permite, pero sus IDs de vuelo se verán iguales (juan01-…); mejor uno distinto.",
    );
  });

  it("avisoAliasEnUso: 2 y 3 clientes, «(inactivo)» y «y» antes del último", () => {
    expect(
      avisoAliasEnUso("victor", [
        { nombre: "Victor Bautista", activo: true },
        { nombre: "Victor Hernandez", activo: true },
      ]),
    ).toBe(
      "Ya lo usan 2 clientes: Victor Bautista y Victor Hernandez. Se permite, pero sus IDs de vuelo se verán iguales (victor01-…); mejor uno distinto.",
    );
    expect(
      avisoAliasEnUso("juan", [
        { nombre: "Juan Chacon", activo: true },
        { nombre: "Juan Pablo Morales Patriot", activo: true },
        { nombre: "Juan Satin", activo: false },
      ]),
    ).toBe(
      "Ya lo usan 3 clientes: Juan Chacon, Juan Pablo Morales Patriot y Juan Satin (inactivo). Se permite, pero sus IDs de vuelo se verán iguales (juan01-…); mejor uno distinto.",
    );
  });

  it("con más de 5 nombres resume «y N más» (el conteo sigue completo)", () => {
    const siete = Array.from({ length: 7 }, (_, i) => ({ nombre: `C${i + 1}`, activo: true }));
    expect(avisoAliasEnUso("cliente", siete)).toBe(
      "Ya lo usan 7 clientes: C1, C2, C3, C4, C5 y 2 más. Se permite, pero sus IDs de vuelo se verán iguales (cliente01-…); mejor uno distinto.",
    );
    expect(listaNombres([])).toBe("");
    expect(listaNombres(["A"])).toBe("A");
    expect(listaNombres(["A", "B"])).toBe("A y B");
  });

  it("avisoAliasCompartido = el mismo aviso con los nombres de alias_compartido_con", () => {
    expect(avisoAliasCompartido("juan", ["Juan Chacon"])).toBe(
      avisoAliasEnUso("juan", [{ nombre: "Juan Chacon", activo: true }]),
    );
    expect(avisoAliasCompartido("diego", [])).toBeNull();
  });

  it("avisoCambioAlias: mismo ⇒ null; distinto ⇒ el texto exacto", () => {
    expect(avisoCambioAlias("juan", "juan")).toBeNull();
    expect(avisoCambioAlias("juan", "jchacon")).toBe(
      "Al guardar, el ID de todos los vuelos de este cliente cambia (p. ej. juan03-011026 → jchacon03-011026). El folio no cambia; si te equivocas, vuelve a poner «juan».",
    );
  });

  it("tituloAliasRepetido: singular y plural", () => {
    expect(tituloAliasRepetido(["Juan Satin"])).toBe(
      "También lo usa: Juan Satin. Sus IDs de vuelo se verán iguales; cámbialo con «Editar».",
    );
    expect(tituloAliasRepetido(["Juan Chacon", "Juan Satin"])).toBe(
      "También lo usan: Juan Chacon y Juan Satin. Sus IDs de vuelo se verán iguales; cámbialo con «Editar».",
    );
  });
});

describe("toasts y rótulos (textos exactos)", () => {
  it("usar el sugerido", () => {
    expect(textoUsarSugerido("diego")).toBe("Usar el sugerido (diego)");
  });

  it("cliente creado / actualizado, con y sin alias", () => {
    expect(textoClienteCreado("diego")).toBe("Cliente creado · alias «diego» para el ID de sus vuelos");
    expect(textoClienteCreado()).toBe("Cliente creado");
    expect(textoClienteCreado(null)).toBe("Cliente creado");
    expect(textoClienteActualizado("jchacon")).toBe("Cliente actualizado · alias «jchacon»");
    expect(textoClienteActualizado(undefined)).toBe("Cliente actualizado");
  });

  it("alta rápida: sin alias es IDÉNTICO al texto de siempre", () => {
    const hoy = (nombre: string) =>
      `Cliente "${nombre}" creado. Completa sus datos en Clientes cuando puedas.`;
    expect(textoClienteRapidoCreado("Diego Ramírez")).toBe(hoy("Diego Ramírez"));
    expect(textoClienteRapidoCreado("Diego Ramírez", null)).toBe(hoy("Diego Ramírez"));
    expect(textoClienteRapidoCreado("Diego Ramírez", "diego")).toBe(
      'Cliente "Diego Ramírez" creado (alias «diego» para el ID de sus vuelos). Completa sus datos en Clientes cuando puedas.',
    );
  });

  it("copiar, rótulos y placeholders", () => {
    expect(textoClaveCopiada("january02-211026")).toBe("ID copiado: january02-211026");
    expect(TEXTO_NO_SE_PUDO_COPIAR).toBe("No se pudo copiar al portapapeles");
    expect(LABEL_ALIAS).toBe("Alias para el ID de sus vuelos");
    expect(AYUDA_ALIAS).toBe(
      "Con él se arma el ID de cada vuelo de este cliente: alias + número de vuelo del cliente + fecha del vuelo (DDMMAA). Solo letras minúsculas, sin acentos, espacios ni números (máx. 24). Vacío = la primera palabra del nombre.",
    );
    expect(TEXTO_ALIAS_REPETIDO).toBe("Alias repetido");
    expect(TITULO_CLAVE_CLIENTE).toBe(
      "ID del vuelo por cliente: alias + número de vuelo de ese cliente + fecha del vuelo (DDMMAA). El folio sigue siendo la referencia del sistema.",
    );
    expect(TITULO_COPIAR_CLAVE).toBe(
      "ID del vuelo para el cliente (alias + número de vuelo del cliente + fecha). Clic para copiar.",
    );
    expect(ENCABEZADO_FOLIO_ID).toBe("Folio / ID");
    expect(PLACEHOLDER_BUSCAR_VUELOS).toBe(
      "Buscar vuelo (folio o ID tipo diego01, cliente, ruta, matrícula, piloto)…",
    );
    expect(PLACEHOLDER_BUSCAR_COTIZACIONES).toBe(
      "Buscar cotización (folio o ID tipo diego01, cliente, ruta, avión)…",
    );
    expect(PLACEHOLDER_BUSCAR_VUELOS_AVION).toBe("Buscar vuelo (folio o ID tipo diego01, ruta, estado)…");
    expect(PLACEHOLDER_BARRA_COTIZACIONES).toBe("Cliente, folio, ID (diego01), ruta IATA…");
    expect(PLACEHOLDER_BUSCAR_CLIENTES).toBe("Buscar cliente (nombre, alias, RFC, email, teléfono)…");
  });
});

/**
 * PARIDAD con el API y con la migración (solo si el repo hermano está al
 * lado, como en la Mac de desarrollo; en Vercel no existe y se omite).
 */
const RAIZ_API = fileURLToPath(new URL("../../../../../vuelatour-api/", import.meta.url));
const UTIL_API = `${RAIZ_API}src/common/clave-cliente.util.ts`;
const DIR_MIGRACIONES = `${RAIZ_API}supabase/migrations/`;
const MIGRACION_ID_CLIENTE = existsSync(DIR_MIGRACIONES)
  ? (readdirSync(DIR_MIGRACIONES).find((f) => /_vuelo_id_cliente\.sql$/.test(f)) ?? null)
  : null;

describe("paridad con el API (si el repo hermano existe)", () => {
  it.skipIf(!existsSync(UTIL_API))(
    "clave-cliente.util.ts del API tiene el MISMO MENSAJE_ALIAS_INVALIDO y ALIAS_REGEX",
    () => {
      const src = readFileSync(UTIL_API, "utf8");
      expect(src).toContain(MENSAJE_ALIAS_INVALIDO);
      expect(src).toContain(`/${ALIAS_REGEX.source}/`);
    },
  );

  it.skipIf(!MIGRACION_ID_CLIENTE)(
    "la migración usa las MISMAS cadenas de acentos y su dry-run la MISMA tabla de 24 casos",
    () => {
      const sql = readFileSync(`${DIR_MIGRACIONES}${MIGRACION_ID_CLIENTE}`, "utf8");
      expect(sql).toContain(`'${ACENTOS_DE}'`);
      expect(sql).toContain(`'${ACENTOS_A}'`);
      expect(sql).toContain(ALIAS_REGEX.source);
      // Pares ('nombre', 'esperado') del bloque C2 del dry-run.
      const c2 = sql.slice(sql.indexOf("C2)"), sql.indexOf("as t(nombre, esperado)"));
      const pares = Array.from(c2.matchAll(/\('((?:[^']|'')*)', '([a-z]+)'\)/g)).map(
        (m) => [m[1].replace(/''/g, "'"), m[2]] as const,
      );
      expect(pares.length).toBe(CASOS_ALIAS.length - 1); // + el caso null aparte
      for (const [nombre, esperado] of pares) {
        expect(aliasSugerido(nombre)).toBe(esperado);
        expect(CASOS_ALIAS.some(([n, e]) => n === nombre && e === esperado)).toBe(true);
      }
    },
  );
});
