/**
 * Compras en DÓLARES contra cargos en PESOS: el T.C. oficial del día
 * (13-oct-2026, API 0.0.75). Módulo PURO (prueba
 * `__tests__/conciliacion-tc.test.ts`); aquí NO se calcula nada.
 *
 * Caso real (Aircraft Spruce): el auto-cruce ligaba un gasto USD a un cargo
 * MXN solo porque el cociente caía en la banda 15–25 y el candidato era
 * único. El tubo Michelin (422.86 USD) quedó ligado a «ASA CANCUN» $8,939.38
 * de COMBUSTIBLE: T.C. 21.14 contra un oficial de 17.01 (+24.3 %), mientras
 * su cargo real «AIRCRAFT SPRUCE AND SP» seguía pendiente. La corrección de
 * datos ya se aplicó (13-oct-2026, 21:40 Cancún). La REGLA vive en el API
 * (`auto-cruce.util.ts`: oficial del día del cargo, ±2 %, leyenda que
 * coincide y recíproco) y manda ya redactados el texto y el tooltip del
 * T.C. (`tc_cruce`); el panel solo decide el tono y dónde se pinta:
 *  - «Vincular gasto»: la 3.ª línea de cada candidato cruzado
 *    (`lineaTcCandidato`), el placeholder y la nota cuando el API demuestra
 *    la capacidad (`apiCruzaConOficial`, pegajosa) y el aviso ámbar al marcar
 *    UNO lejos del oficial (`avisoVincularCruzado`, con «Vincular de todos
 *    modos»: no bloquea);
 *  - la bandeja: «$422.86 USD» (`sufijoMonedaLigada`) y la marca «⚠ …» de
 *    una liga cruzada fuera de lugar (`marcaLigaCruzada`).
 * Todo es ADITIVO: sin `tc_oficial` / `tc_cruce` (API previo) nada cambia.
 * Revisión del lote 2 (14-oct-2026): una LECTURA FALLIDA del oficial ya no
 * se ve como «sin T.C. oficial del día» en gris — el API la marca
 * (`tc_cruce.lectura_fallida` y la raíz `tc_oficial_lectura_fallida`) y aquí
 * se pinta en ámbar, con su aviso y «Vincular de todos modos», y el buscador
 * no promete la búsqueda en pesos (`avisoTcSinLectura`,
 * `PLACEHOLDER_BUSCAR_GASTO_SIN_TC`).
 */

import type { TcCruceUsd } from "@/types/conciliacion";

/** Placeholder del buscador cuando la cuenta en pesos también ofrece compras en dólares. */
export const PLACEHOLDER_BUSCAR_GASTO_CON_USD = "Busca por monto en pesos o en dólares (2801.40), proveedor o nota";

/**
 * Placeholder cuando la lectura del T.C. oficial falló: las compras en
 * dólares solo se encuentran por su monto en DÓLARES (el equivalente en
 * pesos necesita el oficial).
 */
export const PLACEHOLDER_BUSCAR_GASTO_SIN_TC =
  "Busca por monto (las compras en dólares, por su monto en dólares), proveedor o nota";

/** Aviso ámbar del diálogo cuando la lectura del T.C. oficial del día falló. */
export const AVISO_TC_SIN_LECTURA =
  "No se pudo leer el T.C. oficial del día del cargo: las compras en dólares salen sin compararse contra él y no se pueden buscar por su monto en pesos. Cierra y vuelve a abrir «Vincular gasto» para compararlas.";

/** Texto del aviso al marcar UNA compra en dólares que no se pudo comparar. */
export const AVISO_VINCULAR_SIN_LECTURA =
  "No se pudo comprobar el tipo de cambio de este gasto en dólares contra el oficial del día del cargo (la lectura falló): confirma que este cargo sea esa compra antes de vincular, o vuelve a abrir «Vincular gasto» para compararlo.";

/** ¿La respuesta dice que la LECTURA del oficial falló? (≠ «sin dato»). */
export function avisoTcSinLectura(r: unknown): string | null {
  return typeof r === "object" &&
    r !== null &&
    (r as { tc_oficial_lectura_fallida?: unknown }).tc_oficial_lectura_fallida === true
    ? AVISO_TC_SIN_LECTURA
    : null;
}

/** Se agrega a `NOTA_VENTANA_CARGO` (con `cruzaUsd`). */
export const NOTA_COMPRAS_USD =
  " En esta cuenta en pesos también salen las compras en dólares con tarjeta: primero las que cuadran con el tipo de cambio oficial del día del cargo; búscalas por su monto en dólares o en pesos.";

/** Se agrega al tooltip de la marca de una liga cruzada fuera de lugar. */
export const SUFIJO_TITULO_LIGA_SOSPECHOSA =
  "\nRevisa que este cargo sea esa compra: el pre-cierre lista estas ligas. El sistema no corrige nada solo.";

export const BOTON_VINCULAR_DE_TODOS_MODOS = "Vincular de todos modos";

/** «±2 %» sin ceros de cola (la tolerancia la manda el API en `tc_cruce`). */
function tolerancia(pct: number | null | undefined): string {
  const n = Number(pct);
  const t = Number.isFinite(n) && n > 0 ? n : 2;
  return String(Math.round(t * 100) / 100);
}

/** El aviso al marcar UN gasto en dólares lejos del T.C. oficial (no bloquea). */
export function textoAvisoVincularCruzado(toleranciaPct: number | null | undefined): string {
  return `El tipo de cambio de este gasto en dólares queda a más de ±${tolerancia(
    toleranciaPct,
  )} % del oficial del día del cargo: confirma que este cargo sea esa compra antes de vincular (a veces el banco cobra un poco más que el oficial).`;
}

/**
 * ¿El API ya compara contra el T.C. oficial? (capacidad del 0.0.75: la raíz
 * `tc_oficial` viaja SIEMPRE, aunque sea null). El diálogo la guarda como
 * pegajosa, igual que `apiOfreceNoBancarios`.
 */
export function apiCruzaConOficial(r: unknown): boolean {
  return typeof r === "object" && r !== null && "tc_oficial" in r;
}

export type TonoTcCandidato = "ambar" | "normal";

/**
 * 3.ª línea de un candidato cruzado: el texto y el tooltip del API; ámbar si
 * queda lejos, fuera de banda o si la lectura del oficial FALLÓ (no se
 * comprobó: la oficina debe verlo distinto de «cuadra»).
 */
export function lineaTcCandidato(
  c: { tc_cruce?: TcCruceUsd | null } | null | undefined,
): { texto: string; titulo: string; tono: TonoTcCandidato } | null {
  const tc = c?.tc_cruce;
  if (!tc || typeof tc !== "object" || !tc.texto) return null;
  return {
    texto: tc.texto,
    titulo: tc.titulo ?? tc.texto,
    tono: tc.nivel === "LEJOS" || tc.en_banda === false || tc.lectura_fallida === true ? "ambar" : "normal",
  };
}

export type TonoMarcaLiga = "ambar" | "tenue";

/**
 * La marca de una liga cruzada en la bandeja: «⚠ T.C. 21.14 · oficial 17.01
 * (+24.3 %): lejos del oficial» en ámbar cuando quedó fuera de lugar (el
 * tooltip dice que el pre-cierre la lista y que nada se corrige solo); el
 * texto tenue cuando cuadra. null sin `tc_cruce`.
 */
export function marcaLigaCruzada(
  tc: TcCruceUsd | null | undefined,
): { texto: string; titulo: string; tono: TonoMarcaLiga } | null {
  if (!tc || typeof tc !== "object" || !tc.texto) return null;
  const titulo = tc.titulo ?? tc.texto;
  return tc.fuera_de_lugar === true
    ? { texto: `⚠ ${tc.texto}`, titulo: `${titulo}${SUFIJO_TITULO_LIGA_SOSPECHOSA}`, tono: "ambar" }
    : { texto: tc.texto, titulo, tono: "tenue" };
}

/**
 * El aviso de «Vincular gasto» cuando lo marcado es EXACTAMENTE UN gasto
 * cruzado lejos del oficial: qué revisar, el T.C. y el botón «Vincular de
 * todos modos». No bloquea: el clic liga como siempre. Desde la revisión del
 * lote 2 (14-oct-2026) también cuando la LECTURA del oficial falló (no se
 * comprobó). null en cualquier otro caso (nada marcado, varios, uno CERCA o
 * sin dato oficial de verdad).
 */
export function avisoVincularCruzado(
  marcados: readonly { tc_cruce?: TcCruceUsd | null }[] | null | undefined,
): { texto: string; detalle: string; boton: string } | null {
  const lista = Array.isArray(marcados) ? marcados : [];
  if (lista.length !== 1) return null;
  const tc = lista[0]?.tc_cruce;
  if (!tc) return null;
  if (tc.lectura_fallida === true) {
    return { texto: AVISO_VINCULAR_SIN_LECTURA, detalle: tc.texto, boton: BOTON_VINCULAR_DE_TODOS_MODOS };
  }
  if (tc.nivel !== "LEJOS") return null;
  return {
    texto: textoAvisoVincularCruzado(tc.tolerancia_pct),
    detalle: tc.texto,
    boton: BOTON_VINCULAR_DE_TODOS_MODOS,
  };
}

/** « USD» junto al monto de un gasto ligado en otra moneda; '' en pesos (la fila MXN no cambia). */
export function sufijoMonedaLigada(moneda: string | null | undefined): string {
  const m = typeof moneda === "string" ? moneda.trim() : "";
  return m && m !== "MXN" ? ` ${m}` : "";
}
