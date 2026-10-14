import { fmtMonto } from "@/lib/format";
import {
  CATEGORIA_PAGO_VENDEDOR,
  CATEGORIAS_EMPRESA,
  categoriaLlevaAvion,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import type { Gasto } from "@/types/expenses";

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
 *  3. Empresa o «Comisión del vendedor (VuelaTour)» ⇒ «VuelaTour» SIEMPRE,
 *     aunque traiga avión sellado (queda de «ref.»: la categoría de empresa
 *     manda sobre el vuelo, regla del 11-sep-2026).
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
      etiqueta: "VuelaTour" | "Personal";
      /** Matrícula sellada que NO se carga (solo referencia) o null. */
      referencia: string | null;
      /** «Va a: …» (hoja destino con lo elegido). */
      titulo: string;
    }
  | { tipo: "AVION"; aeronaveId: string; matricula: string | null }
  | { tipo: "FALTA" };

export const ETIQUETA_FALTA_AVION = "Falta avión";
export const TITULO_FALTA_AVION =
  "Este gasto necesita avión y no lo tiene: cuenta en la pestaña «Pendientes». Asígnalo en «Verificar / editar» (menú ⋯) o con «Sugerir asignaciones».";
export const ETIQUETA_AVION_VUELATOUR = "VuelaTour";
export const ETIQUETA_AVION_PERSONAL = "Personal";
export const ETIQUETA_REPARTIDO = "Repartido:";
export const TITULO_REFERENCIA_AVION =
  "El avión queda solo como referencia: este gasto no se carga a ese avión.";
/** Liga a la ficha del avión cuando el API no mandó la matrícula del join. */
export const TEXTO_VER_AVION = "Ver avión";
/** Parte de un reparto sin matrícula en el join. */
export const MATRICULA_DESCONOCIDA = "¿?";

/** «Va a: Balance general VuelaTour · Otros gastos (…).» */
export function tituloFueraDelAvion(
  categoria: string,
  tieneVuelo: boolean,
  tieneAvion: boolean,
): string {
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
      return e.etiqueta;
    case "AVION":
      return e.matricula ?? "Avión asignado";
    case "FALTA":
      return ETIQUETA_FALTA_AVION;
  }
}

/** Centavos enteros de un monto del API (string numérico o número). */
const centavos = (v: string | number | null | undefined): number => Math.round(Number(v) * 100);

export function estadoAvionGasto(
  g: Pick<Gasto, "categoria" | "aeronave_id" | "aeronave" | "repartos" | "vuelo_id" | "monto">,
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
  const fuera = (etiqueta: "VuelaTour" | "Personal"): EstadoAvionGasto => ({
    tipo: "FUERA_DEL_AVION",
    etiqueta,
    referencia,
    titulo: tituloFueraDelAvion(g.categoria, !!g.vuelo_id, tieneAvion),
  });
  if (g.categoria === "PERSONAL_DUENO") return fuera(ETIQUETA_AVION_PERSONAL);
  if (CATEGORIAS_EMPRESA.has(g.categoria) || g.categoria === CATEGORIA_PAGO_VENDEDOR) {
    return fuera(ETIQUETA_AVION_VUELATOUR);
  }
  if (g.aeronave_id) {
    return { tipo: "AVION", aeronaveId: g.aeronave_id, matricula: g.aeronave?.matricula ?? null };
  }
  if (!categoriaLlevaAvion(g.categoria)) return fuera(ETIQUETA_AVION_VUELATOUR);
  return { tipo: "FALTA" };
}
