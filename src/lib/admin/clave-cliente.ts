/**
 * ID DE VUELO POR CLIENTE junto al folio (13-oct-2026, API 0.0.75):
 * «january02-211026» = alias del cliente + número de vuelo de ESE cliente
 * (2 dígitos mínimo) + fecha del vuelo en día Cancún (DDMMAA).
 *
 * El panel NUNCA arma el ID de un vuelo: lo ARMA el API al leer
 * (`src/common/clave-cliente.util.ts`, fuente única) y llega listo en
 * `clave_cliente` de GET /v1/flights, /snapshot, /v1/quotes y
 * /v1/quotes/:id. Aquí solo viven los TEXTOS es-MX de la UI y las reglas
 * del ALIAS que se captura en Clientes (normalizar, validar, sugerir y
 * avisar). Puro: sin React, sin red.
 *
 * El FOLIO sigue siendo la referencia del sistema (cobros, gastos,
 * facturas, conciliación, flechas, reparto, PDFs): el ID es una etiqueta
 * para el cliente y JAMÁS reemplaza al folio en pantalla.
 */

/** Largo máximo del alias (CHECK `cliente_alias_chk` de la BD). */
export const ALIAS_MAX = 24;

/**
 * Alias válido: de 1 a 24 letras minúsculas a-z. MISMO literal que el CHECK
 * `cliente_alias_chk` y que `ALIAS_REGEX` del API
 * (`src/common/clave-cliente.util.ts`); la prueba de paridad lo vigila.
 */
export const ALIAS_REGEX = /^[a-z]{1,24}$/;

/** MISMO texto que el 400 del API (class-validator y `ALIAS_INVALIDO`). */
export const MENSAJE_ALIAS_INVALIDO =
  "Alias inválido: usa de 1 a 24 letras minúsculas, sin acentos, espacios, números ni signos (ej. diego).";

/**
 * Copia LITERAL del `translate()` de `public.cliente_alias_default` (la
 * migración del ID por cliente). 50 caracteres cada una, posición a
 * posición: si se amplía un mapa, se amplía el otro (y sus 24 casos).
 */
export const ACENTOS_DE = "áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const ACENTOS_A = "aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC";

const MAPA_ACENTOS: ReadonlyMap<string, string> = new Map(
  Array.from(ACENTOS_DE).map((c, i) => [c, ACENTOS_A.charAt(i)]),
);

/** Alias del cliente que se usa cuando el campo queda vacío. */
const ALIAS_DE_RESPALDO = "cliente";

/**
 * Alias SUGERIDO para un nombre: espejo EXACTO de
 * `public.cliente_alias_default(nombre)` — primera palabra, sin acentos
 * (mapa de `translate`), en minúsculas, solo a-z, máximo 24; si no queda
 * nada, «cliente». SOLO sirve de placeholder del campo: NUNCA se manda (el
 * alias real lo fija la BD con su trigger).
 */
export function aliasSugerido(nombre: string | null | undefined): string {
  const primera = (nombre ?? "").replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
  const sinAcentos = Array.from(primera)
    .map((c) => MAPA_ACENTOS.get(c) ?? c)
    .join("");
  const limpio = sinAcentos
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, ALIAS_MAX);
  return limpio || ALIAS_DE_RESPALDO;
}

/** Lo que el API hace con el alias antes de validar: trim + minúsculas. */
export function normalizarAlias(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Limpieza AL SALIR del campo (onBlur): sin acentos (NFD sin marcas
 * diacríticas U+0300–U+036F), minúsculas, solo a-z y máximo 24.
 * 'José María' ⇒ 'josemaria' · 'J&B' ⇒ 'jb' · ' DIEGO ' ⇒ 'diego'.
 */
export function normalizarAliasCaptura(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, ALIAS_MAX);
}

/** ¿El alias cumple la regla de la BD (a-z, de 1 a 24)? */
export function esAliasValido(v: string | null | undefined): boolean {
  return typeof v === "string" && ALIAS_REGEX.test(v);
}

/** 'YYYY-MM-DD' ⇒ 'DDMMAA' (solo para el texto de ejemplo); inválida ⇒ ''. */
export function ddmmaa(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}${m[2]}${m[1].slice(2)}` : "";
}

/** Ejemplo bajo el campo: el vuelo 1 del cliente con la fecha de hoy. */
export function textoEjemplo(alias: string, hoyYmd: string): string {
  const fecha = ddmmaa(hoyYmd);
  return `Ejemplo: ${alias}01${fecha ? `-${fecha}` : ""} (vuelo 1 del cliente con la fecha de hoy).`;
}

/** Nombres que se listan en un aviso; el resto se resume con «y N más». */
const MAX_NOMBRES_AVISO = 5;

/** «A», «A y B», «A, B y C» (es-MX); con más de 5, «A, B, C, D, E y 2 más». */
export function listaNombres(nombres: readonly string[]): string {
  const visibles =
    nombres.length > MAX_NOMBRES_AVISO
      ? [...nombres.slice(0, MAX_NOMBRES_AVISO), `${nombres.length - MAX_NOMBRES_AVISO} más`]
      : [...nombres];
  if (visibles.length <= 1) return visibles[0] ?? "";
  return `${visibles.slice(0, -1).join(", ")} y ${visibles[visibles.length - 1]}`;
}

/**
 * Aviso NO bloqueante del formulario: otros clientes ya usan ese alias
 * (activos o no; lo dice GET /v1/clients/alias-en-uso). Se permite, pero sus
 * IDs de vuelo se verán iguales. Sin nadie ⇒ null.
 */
export function avisoAliasEnUso(
  alias: string,
  otros: ReadonlyArray<{ nombre: string; activo: boolean }>,
): string | null {
  if (otros.length === 0) return null;
  const lista = listaNombres(otros.map((o) => (o.activo ? o.nombre : `${o.nombre} (inactivo)`)));
  const quien =
    otros.length === 1 ? `Ya lo usa ${lista}.` : `Ya lo usan ${otros.length} clientes: ${lista}.`;
  return `${quien} Se permite, pero sus IDs de vuelo se verán iguales (${alias}01-…); mejor uno distinto.`;
}

/** El mismo aviso con los nombres de `alias_compartido_con` (alta rápida). */
export function avisoAliasCompartido(alias: string, nombres: readonly string[]): string | null {
  return avisoAliasEnUso(
    alias,
    nombres.map((nombre) => ({ nombre, activo: true })),
  );
}

/**
 * Aviso ámbar al EDITAR el alias: el ID se calcula al leer, así que
 * cambiarlo re-etiqueta TODOS los vuelos del cliente (es reversible: no es
 * acción destructiva). Mismo alias ⇒ null.
 */
export function avisoCambioAlias(anterior: string, nuevo: string): string | null {
  if (anterior === nuevo) return null;
  return `Al guardar, el ID de todos los vuelos de este cliente cambia (p. ej. ${anterior}03-011026 → ${nuevo}03-011026). El folio no cambia; si te equivocas, vuelve a poner «${anterior}».`;
}

export function textoUsarSugerido(sugerido: string): string {
  return `Usar el sugerido (${sugerido})`;
}

/** title del badge «Alias repetido» de la tabla de Clientes. */
export function tituloAliasRepetido(nombres: readonly string[]): string {
  return `También lo usa${nombres.length === 1 ? "" : "n"}: ${listaNombres(nombres)}. Sus IDs de vuelo se verán iguales; cámbialo con «Editar».`;
}

export function textoClienteCreado(alias?: string | null): string {
  return alias ? `Cliente creado · alias «${alias}» para el ID de sus vuelos` : "Cliente creado";
}

export function textoClienteActualizado(alias?: string | null): string {
  return alias ? `Cliente actualizado · alias «${alias}»` : "Cliente actualizado";
}

/** Toast del alta rápida; sin alias (API previo) es el texto de siempre. */
export function textoClienteRapidoCreado(nombre: string, alias?: string | null): string {
  return `Cliente "${nombre}" creado${alias ? ` (alias «${alias}» para el ID de sus vuelos)` : ""}. Completa sus datos en Clientes cuando puedas.`;
}

export function textoClaveCopiada(clave: string): string {
  return `ID copiado: ${clave}`;
}

export const TEXTO_NO_SE_PUDO_COPIAR = "No se pudo copiar al portapapeles";

export const LABEL_ALIAS = "Alias para el ID de sus vuelos";

export const AYUDA_ALIAS =
  "Con él se arma el ID de cada vuelo de este cliente: alias + número de vuelo del cliente + fecha del vuelo (DDMMAA). Solo letras minúsculas, sin acentos, espacios ni números (máx. 24). Vacío = la primera palabra del nombre.";

export const TEXTO_ALIAS_REPETIDO = "Alias repetido";

/** title de la línea del ID bajo el folio (listas). */
export const TITULO_CLAVE_CLIENTE =
  "ID del vuelo por cliente: alias + número de vuelo de ese cliente + fecha del vuelo (DDMMAA). El folio sigue siendo la referencia del sistema.";

/** title del chip copiable junto al h1 (vuelo y cotización). */
export const TITULO_COPIAR_CLAVE =
  "ID del vuelo para el cliente (alias + número de vuelo del cliente + fecha). Clic para copiar.";

export const ENCABEZADO_FOLIO_ID = "Folio / ID";

export const PLACEHOLDER_BUSCAR_VUELOS =
  "Buscar vuelo (folio o ID tipo diego01, cliente, ruta, matrícula, piloto)…";
export const PLACEHOLDER_BUSCAR_COTIZACIONES =
  "Buscar cotización (folio o ID tipo diego01, cliente, ruta, avión)…";
export const PLACEHOLDER_BUSCAR_VUELOS_AVION = "Buscar vuelo (folio o ID tipo diego01, ruta, estado)…";
export const PLACEHOLDER_BARRA_COTIZACIONES = "Cliente, folio, ID (diego01), ruta IATA…";
export const PLACEHOLDER_BUSCAR_CLIENTES = "Buscar cliente (nombre, alias, RFC, email, teléfono)…";
