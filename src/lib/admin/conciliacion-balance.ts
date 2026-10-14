/**
 * Conciliación → balance: los enlaces «Ver en balance…» de un gasto ligado
 * (13-oct-2026, API 0.0.75, punto 5) — FUENTE ÚNICA de los enlaces y de sus
 * textos. PURO: sin React ni red.
 *
 * El API decide en qué libro y en qué mes vive el gasto (`balance` de
 * `GET /v1/conciliacion/movimientos`, espejo de los libros en
 * `common/ubicacion-balance-gasto.util.ts`); aquí solo se arman las URLs de
 * la vista en pantalla con `?gasto=`, que el libro usa para abrir en la celda
 * de ese gasto (`lib/admin/libro-vinculos.ts`). Ningún monto se toca.
 */
import type { MovimientoGasto, UbicacionBalanceGasto } from "@/types/conciliacion";
import { hrefVistaBalance, textoPeriodoVista } from "./balance-vista";
import type { ModoBalanceVuelaTour } from "./reportes-balance";
import { esDiaValido, esUuid } from "./url-params";

/**
 * Libro de la flota al que lleva «Ver en balance general»: el MENSUAL, que
 * trae las columnas OPERACIONES, PILOTO y OTROS de cada vuelo. Desde ahí el
 * chip «Balance general» conserva `?gasto=` y cae en TOTAL PARA PROVEEDOR
 * (PESOS).
 */
export const MODO_BALANCE_DESDE_GASTO: ModoBalanceVuelaTour = "mensual";

/** Cuántos balances de avión se enlazan por gasto; el resto va en «y N aviones más». */
export const MAX_ENLACES_AVION = 2;

export const ETIQUETA_VER_BALANCE_GENERAL = "Ver en balance general";

/** Para el lector de pantalla: el enlace abre otra pestaña. */
export const TEXTO_PESTANA_NUEVA_SR = " (se abre en una pestaña nueva)";

/** «Ver en balance del avión N4142R» (sin matrícula legible, sin ella). */
export function etiquetaVerBalanceAvion(matricula?: string | null): string {
  return matricula ? `Ver en balance del avión ${matricula}` : "Ver en balance del avión";
}

/** De qué fecha sale el mes del libro. */
export function textoEjeBalance(eje: UbicacionBalanceGasto["eje"]): string {
  return eje === "vuelo" ? "mes del vuelo" : "mes de la fecha del gasto";
}

export interface EnlaceBalanceGasto {
  key: string;
  href: string;
  etiqueta: string;
  title: string;
}

export interface EnlacesBalanceDeGasto {
  aviones: EnlaceBalanceGasto[];
  /** «y 3 aviones más» (repartido a más de `MAX_ENLACES_AVION`). */
  masAviones: { texto: string; title: string } | null;
  general: EnlaceBalanceGasto | null;
}

const vacio = (): EnlacesBalanceDeGasto => ({ aviones: [], masAviones: null, general: null });

/** «del 01 oct 2026 al 31 oct 2026» (`textoPeriodoVista` con minúscula inicial). */
function periodoEnFrase(desde: string, hasta: string): string {
  const t = textoPeriodoVista(desde, hasta);
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** «XA-VGV, XB-PEV y N621TX» (o «otros N aviones» si alguna matrícula no se pudo leer). */
function listaAviones(aviones: { matricula: string | null }[]): string {
  const nombres = aviones.map((a) => a.matricula);
  if (nombres.some((m) => !m)) {
    return aviones.length === 1 ? "otro avión" : `otros ${aviones.length} aviones`;
  }
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Los enlaces de UN gasto ligado. Vacío sin `balance` (API previo o lectura
 * fallida), con `balance: null` (no vive en ningún libro), con un id que no
 * es uuid o con un periodo que no son días válidos: jamás un enlace que
 * termine en un libro equivocado.
 */
export function enlacesBalanceDeGasto(g: Pick<MovimientoGasto, "id" | "balance">): EnlacesBalanceDeGasto {
  const b = g.balance;
  if (!b || typeof b !== "object" || !esUuid(g.id)) return vacio();
  const desde = b.periodo?.desde;
  const hasta = b.periodo?.hasta;
  if (!esDiaValido(desde) || !esDiaValido(hasta) || (desde as string) > (hasta as string)) return vacio();
  const periodo = periodoEnFrase(desde as string, hasta as string);
  const eje = textoEjeBalance(b.eje);
  // Un avión sin uuid abriría el libro de la flota sin decirlo: se descarta.
  const aviones = (Array.isArray(b.aviones) ? b.aviones : []).filter(
    (a, i, todos) => a != null && esUuid(a.id) && todos.findIndex((x) => x?.id === a.id) === i,
  );
  const enlaces = aviones.slice(0, MAX_ENLACES_AVION).map((a) => ({
    key: `avion-${a.id}`,
    href: hrefVistaBalance({ tipo: "avion", avionId: a.id }, desde as string, hasta as string, { gasto: g.id }),
    etiqueta: etiquetaVerBalanceAvion(a.matricula),
    title: `Abre en una pestaña nueva el balance de ${a.matricula || "ese avión"} (${periodo}, ${eje}) en la celda de este gasto`,
  }));
  const resto = aviones.slice(MAX_ENLACES_AVION);
  const n = resto.length;
  return {
    aviones: enlaces,
    masAviones:
      n > 0
        ? {
            texto: `y ${n} ${n === 1 ? "avión" : "aviones"} más`,
            title: `También está repartido a ${listaAviones(resto)}: ábrelo desde Reportes → Balance por avión (${periodo}).`,
          }
        : null,
    general:
      b.general === true
        ? {
            key: "general",
            href: hrefVistaBalance(
              { tipo: "vuelatour", modo: MODO_BALANCE_DESDE_GASTO },
              desde as string,
              hasta as string,
              { gasto: g.id },
            ),
            etiqueta: ETIQUETA_VER_BALANCE_GENERAL,
            title: `Abre en una pestaña nueva el Balance mensual de la flota (${periodo}, ${eje}) en la celda de este gasto`,
          }
        : null,
  };
}

/** ¿Hay algo que pintar? */
export function hayEnlacesBalance(e: EnlacesBalanceDeGasto | null | undefined): boolean {
  return !!e && (e.aviones.length > 0 || e.general != null);
}
