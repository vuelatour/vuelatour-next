import { fmtMonto } from "@/lib/format";
import {
  CATEGORIA_OTROS_MOVIMIENTOS,
  CATEGORIA_PAGO_VENDEDOR,
  CATEGORIAS_EMPRESA,
  CATEGORIAS_REPARTIBLES,
  categoriaLlevaAvion,
  esCategoriaOtrosMovimientos,
  esCategoriaPagoVendedor,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import { esPagoAfac } from "@/lib/admin/pago-afac";
import type { Gasto } from "@/types/expenses";

/**
 * Código de la categoría «Nómina» (literal aquí y no importado de
 * `lib/admin/nomina.ts`: la paridad del API transpila este archivo y sus
 * imports; `nomina.ts` arrastraría más módulos sin necesidad).
 */
const CATEGORIA_NOMINA_AVION = "NOMINA";

/**
 * «¿A dónde va el dinero de este gasto?» — columna «Avión · vuelo» de la
 * tabla única de Gastos (14-oct-2026). PURO: fuente única de la celda, de la
 * línea de estado del teléfono y de la búsqueda rápida.
 *
 * Antes la columna «Avión» decía «Pendiente» en TODO gasto sin avión: 251 en
 * prod, de los que solo 36 lo eran para el API (215 «Pendiente» falsos: las
 * categorías de empresa, INDIRECTO, el gasto personal y la comisión del
 * vendedor nunca llevan avión). Ahora «Falta avión» es ESPEJO EXACTO de la
 * bandeja del API (`expenses.service.ts`: `aeronave_id` null y categoría
 * fuera de `CATEGORIAS_GASTO_SIN_AVION`), así el ámbar de la tabla suma lo
 * mismo que la pestaña «Pendientes».
 *
 * Precedencia (gana la primera que aplica):
 *  1. Con reparto ⇒ REPARTIDO (las partes y el remanente en CENTAVOS: lo que
 *     absorbe VuelaTour; el API decide el dinero, aquí solo se pinta).
 *  2. PERSONAL_DUENO ⇒ «Personal» (fuera de balances).
 *  2b. NÓMINA sin reparto (16-oct-2026, API 0.0.90, invariante 91) ⇒ «Sin
 *     repartir» (con «ref. N4142R» si trae avión sellado): no entra a ningún
 *     balance hasta repartirla entre aviones desde el módulo Nómina. Espejo
 *     EXACTO del API (`expenses/gasto-avion.util.ts#celdaAvionGasto`): texto
 *     plano «Sin repartir» / «Sin repartir (ref. N4142R)».
 *  3. Empresa, «Comisión del vendedor (VuelaTour)» u «Otros movimientos
 *     (VuelaTour)» (23-oct-2026, API 0.0.106: egreso de VuelaTour en «otros
 *     movimientos») ⇒ «VuelaTour» SIEMPRE, aunque traiga avión sellado (queda
 *     de «ref.»: la categoría de empresa manda sobre el vuelo, regla del
 *     11-sep-2026).
 *  3b. PERMISO marcado «Pago de AFAC» (16-oct-2026, API 0.0.89, invariante
 *     90) ⇒ «VuelaTour · pago de AFAC» aunque traiga avión o vuelo (quedan de
 *     «ref.»): lo paga VuelaTour y no le resta al avión; vive en el Balance
 *     general, hoja «otros movimientos». Espejo del API
 *     (`expenses/gasto-avion.util.ts`).
 *  4. Con avión ⇒ su matrícula.
 *  5. Categoría que no lleva avión (hoy solo INDIRECTO) ⇒ «VuelaTour».
 *  6. Lo demás ⇒ «Falta avión».
 */
export type EstadoAvionGasto =
  | {
      tipo: "REPARTIDO";
      partes: { aeronaveId: string; matricula: string | null; monto: number }[];
      /** Lo que no se repartió (lo absorbe la empresa), redondeado a centavos. */
      remanente: number;
    }
  | {
      tipo: "FUERA_DEL_AVION";
      etiqueta: "VuelaTour" | "Personal" | "Sin repartir";
      /** Matrícula sellada que NO se carga (solo referencia) o null. */
      referencia: string | null;
      /** «Va a: …» (hoja destino con lo elegido). */
      titulo: string;
      /** «pago de AFAC» (16-oct-2026): segunda línea bajo «VuelaTour». */
      detalle?: string;
    }
  | { tipo: "AVION"; aeronaveId: string; matricula: string | null }
  | { tipo: "FALTA" };

export const ETIQUETA_FALTA_AVION = "Falta avión";
export const TITULO_FALTA_AVION =
  "Este gasto necesita avión y no lo tiene: cuenta en la pestaña «Pendientes». Asígnalo en «Verificar / editar» (menú ⋯) o con «Sugerir asignaciones».";
/**
 * El MISMO aviso fuera de Gastos (historial del fondo de caja chica,
 * 15-oct-2026): ahí no existen la pestaña «Pendientes» ni «Sugerir
 * asignaciones»; solo el menú ⋯ del renglón con «Verificar / editar».
 */
export const TITULO_FALTA_AVION_FUERA_DE_GASTOS =
  "Este gasto necesita avión y no lo tiene. Asígnalo en «Verificar / editar» (menú ⋯).";
export const ETIQUETA_AVION_VUELATOUR = "VuelaTour";
export const ETIQUETA_AVION_PERSONAL = "Personal";
/**
 * NÓMINA sin reparto (16-oct-2026, API 0.0.90): la nómina vive en su módulo
 * y solo cuenta en los libros REPARTIDA entre aviones. Mismo texto que la
 * celda «Avión» del Excel de gastos (paridad con el API).
 */
export const ETIQUETA_AVION_SIN_REPARTIR = "Sin repartir";
export const TITULO_NOMINA_SIN_REPARTIR =
  "Nómina sin repartir: no entra a ningún balance hasta repartirla entre aviones en el módulo Nómina.";
/** Segunda línea de un PERMISO marcado «Pago de AFAC» (16-oct-2026). */
export const DETALLE_PAGO_AFAC = "pago de AFAC";
export const TITULO_PAGO_AFAC_AVION =
  "Va a: Balance general VuelaTour · otros movimientos (AFAC por vuelo). Lo paga VuelaTour: no le resta al avión.";
export const ETIQUETA_REPARTIDO = "Repartido:";
export const TITULO_REFERENCIA_AVION =
  "El avión queda solo como referencia: este gasto no se carga a ese avión.";
/** Liga a la ficha del avión cuando el API no mandó la matrícula del join. */
export const TEXTO_VER_AVION = "Ver avión";
/** Parte de un reparto sin matrícula en el join. */
export const MATRICULA_DESCONOCIDA = "¿?";

/**
 * Destino de un gasto de VuelaTour SIN vuelo ni avión, dicho para ESTA
 * tabla (revisión del 14-oct-2026): el texto general de `hojaDestinoGasto`
 * manda a «repartirlo desde la pantalla Otros gastos», cuando el reparto
 * está en el menú ⋯ del MISMO renglón («Repartir entre aviones», también en
 * «Verificar / editar»). `HOJA_OTROS_GASTOS_SIN_NADA` no se toca (lo congela
 * su prueba y la pista de destino del alta).
 */
export const DESTINO_VUELATOUR_REPARTIBLE_TABLA =
  "Balance general VuelaTour · Otros gastos (para cargarlo a aviones, usa «Repartir entre aviones» en el menú ⋯)";
export const DESTINO_VUELATOUR_TABLA = "Balance general VuelaTour · Otros gastos";

/** «Va a: Balance general VuelaTour · Otros gastos (…).» */
export function tituloFueraDelAvion(
  categoria: string,
  tieneVuelo: boolean,
  tieneAvion: boolean,
): string {
  // Sin vuelo ni avión: el texto general mandaría a otra pantalla. Las que
  // van a «otros movimientos» (las comisiones y «Otros movimientos
  // (VuelaTour)») y el gasto personal conservan su hoja de siempre.
  if (
    !tieneVuelo &&
    !tieneAvion &&
    categoria !== "PERSONAL_DUENO" &&
    !esCategoriaPagoVendedor(categoria) &&
    !esCategoriaOtrosMovimientos(categoria)
  ) {
    return `Va a: ${
      CATEGORIAS_REPARTIBLES.has(categoria) ? DESTINO_VUELATOUR_REPARTIBLE_TABLA : DESTINO_VUELATOUR_TABLA
    }.`;
  }
  return `Va a: ${hojaDestinoGasto(categoria, tieneVuelo, tieneAvion)}.`;
}

/** «ref. N4142R» bajo «VuelaTour» cuando el gasto trae un avión que no lo carga. */
export function textoReferenciaAvion(matricula: string): string {
  return `ref. ${matricula}`;
}

/** Title del «VuelaTour» de un reparto que no cubre todo el gasto. */
export function tituloRemanenteReparto(remanente: number, moneda: string): string {
  return `Parte que absorbe la empresa: ${fmtMonto(remanente, moneda)}`;
}

/** «Vuelo #437»; sin folio en el join, «Ver vuelo». */
export function textoVueloGasto(folio: string | number | null | undefined): string {
  const f = folio == null ? "" : String(folio).trim();
  return f ? `Vuelo #${f}` : "Ver vuelo";
}

/** Texto plano del estado (línea del teléfono y búsqueda). */
export function etiquetaAvionGasto(e: EstadoAvionGasto): string {
  switch (e.tipo) {
    case "REPARTIDO":
      return "Repartido";
    case "FUERA_DEL_AVION":
      return e.detalle ? `${e.etiqueta} · ${e.detalle}` : e.etiqueta;
    case "AVION":
      return e.matricula ?? "Avión asignado";
    case "FALTA":
      return ETIQUETA_FALTA_AVION;
  }
}

/** Centavos enteros de un monto del API (string numérico o número). */
const centavos = (v: string | number | null | undefined): number => Math.round(Number(v) * 100);

export function estadoAvionGasto(
  g: Pick<Gasto, "categoria" | "aeronave_id" | "aeronave" | "repartos" | "vuelo_id" | "monto"> &
    Partial<Pick<Gasto, "es_pago_afac">>,
): EstadoAvionGasto {
  const repartos = g.repartos ?? [];
  if (repartos.length > 0) {
    const remanenteCents =
      centavos(g.monto) - repartos.reduce((acc, r) => acc + centavos(r.monto), 0);
    return {
      tipo: "REPARTIDO",
      partes: repartos.map((r) => ({
        aeronaveId: r.aeronave_id,
        matricula: r.aeronave?.matricula ?? null,
        monto: Number(r.monto),
      })),
      remanente: remanenteCents / 100,
    };
  }
  const tieneAvion = !!g.aeronave_id;
  const referencia = tieneAvion ? (g.aeronave?.matricula ?? null) : null;
  const fuera = (
    etiqueta: "VuelaTour" | "Personal" | "Sin repartir",
    titulo: string = tituloFueraDelAvion(g.categoria, !!g.vuelo_id, tieneAvion),
  ): EstadoAvionGasto => ({
    tipo: "FUERA_DEL_AVION",
    etiqueta,
    referencia,
    titulo,
  });
  if (g.categoria === "PERSONAL_DUENO") return fuera(ETIQUETA_AVION_PERSONAL);
  // 2b. NÓMINA sin reparto (invariante 91 del API): misma posición que en el API.
  if (g.categoria === CATEGORIA_NOMINA_AVION) {
    return fuera(ETIQUETA_AVION_SIN_REPARTIR, TITULO_NOMINA_SIN_REPARTIR);
  }
  if (
    CATEGORIAS_EMPRESA.has(g.categoria) ||
    g.categoria === CATEGORIA_PAGO_VENDEDOR ||
    g.categoria === CATEGORIA_OTROS_MOVIMIENTOS
  ) {
    return fuera(ETIQUETA_AVION_VUELATOUR);
  }
  if (esPagoAfac(g)) {
    return {
      tipo: "FUERA_DEL_AVION",
      etiqueta: ETIQUETA_AVION_VUELATOUR,
      referencia,
      titulo: TITULO_PAGO_AFAC_AVION,
      detalle: DETALLE_PAGO_AFAC,
    };
  }
  if (g.aeronave_id) {
    return { tipo: "AVION", aeronaveId: g.aeronave_id, matricula: g.aeronave?.matricula ?? null };
  }
  if (!categoriaLlevaAvion(g.categoria)) return fuera(ETIQUETA_AVION_VUELATOUR);
  return { tipo: "FALTA" };
}
