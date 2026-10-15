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
import type {
  HojaBalanceAvion,
  HojaBalanceGeneral,
  MovimientoGasto,
  UbicacionBalanceGasto,
} from "@/types/conciliacion";
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

/**
 * NOMBRE EXACTO de la pestaña del Excel de cada hoja que informa el API
 * (`hoja_avion` / `hoja_general` de `balance`), tal como la titula
 * pyservices (`app/services/balance_avion_xlsx.py`: `construir_balance_avion`
 * y el bloque del general; la hoja de vuelos con `sheet_title(f"reporte
 * horas {matricula}")`). Pedido del cliente (15-oct-2026): «y que diga en qué
 * hoja del excel del balance está». Renombrar una pestaña en pyservices
 * obliga a tocar esta tabla (la congela `conciliacion-balance.test.ts`, con
 * la paridad leída del repo hermano).
 *
 * `reporte_horas` del AVIÓN es un PREFIJO: la pestaña lleva la matrícula
 * («reporte horas N4142R»); ver `nombreHojaBalanceAvion`.
 */
export const NOMBRE_HOJA_BALANCE_AVION: Readonly<Record<HojaBalanceAvion, string>> = {
  reporte_horas: "reporte horas",
  combustible: "combustible",
  gastos_indirectos: "Gastos Indirectos",
  refacciones: "refacciones",
  permisos: "permisos",
};

/** Lo mismo para el balance de la FLOTA (mensual y general: mismas pestañas). */
export const NOMBRE_HOJA_BALANCE_GENERAL: Readonly<Record<HojaBalanceGeneral, string>> = {
  reporte_horas: "reporte horas FLOTA",
  combustible: "combustible",
  otros_gastos: "otros gastos",
  repartidos: "repartidos a aviones",
  inventario: "inventario",
};

/** Espejo de `sheet_title` de pyservices (`tabla_xlsx.py`): ilegales → «-», recorte y máx. 31. */
function tituloHojaExcel(nombre: string): string {
  return nombre.replace(/[\\/*?:[\]]/g, "-").trim().slice(0, 31);
}

const esLlaveDe = (tabla: object, hoja: unknown): hoja is string =>
  typeof hoja === "string" && Object.prototype.hasOwnProperty.call(tabla, hoja);

/**
 * Pestaña del libro del AVIÓN. `null` con una hoja que el panel no conoce
 * (API más nuevo: se calla, jamás inventa un nombre) o con la hoja de vuelos
 * sin matrícula legible (su pestaña la lleva en el nombre).
 */
export function nombreHojaBalanceAvion(hoja: unknown, matricula?: string | null): string | null {
  if (!esLlaveDe(NOMBRE_HOJA_BALANCE_AVION, hoja)) return null;
  const nombre = NOMBRE_HOJA_BALANCE_AVION[hoja as HojaBalanceAvion];
  if (hoja !== "reporte_horas") return nombre;
  const m = matricula?.trim();
  return m ? tituloHojaExcel(`${nombre} ${m}`) : null;
}

/** Pestaña del balance de la FLOTA; `null` con una hoja desconocida. */
export function nombreHojaBalanceGeneral(hoja: unknown): string | null {
  return esLlaveDe(NOMBRE_HOJA_BALANCE_GENERAL, hoja)
    ? NOMBRE_HOJA_BALANCE_GENERAL[hoja as HojaBalanceGeneral]
    : null;
}

/** « (hoja «Gastos Indirectos»)» para el title de un enlace; vacío sin nombre. */
function sufijoHoja(nombre: string | null): string {
  return nombre ? `, hoja «${nombre}»` : "";
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
/** El periodo de `balance` si son días válidos y en orden; si no, null. */
function periodoValido(b: UbicacionBalanceGasto): { desde: string; hasta: string } | null {
  const desde = b.periodo?.desde;
  const hasta = b.periodo?.hasta;
  if (!esDiaValido(desde) || !esDiaValido(hasta) || (desde as string) > (hasta as string)) return null;
  return { desde: desde as string, hasta: hasta as string };
}

/** Aviones de `balance` con uuid y sin repetir (un avión sin uuid abriría el
 *  libro de la flota sin decirlo: se descarta). */
function avionesValidos(b: UbicacionBalanceGasto): { id: string; matricula: string | null }[] {
  return (Array.isArray(b.aviones) ? b.aviones : []).filter(
    (a, i, todos) => a != null && esUuid(a.id) && todos.findIndex((x) => x?.id === a.id) === i,
  );
}

export function enlacesBalanceDeGasto(g: Pick<MovimientoGasto, "id" | "balance">): EnlacesBalanceDeGasto {
  const b = g.balance;
  if (!b || typeof b !== "object" || !esUuid(g.id)) return vacio();
  const p = periodoValido(b);
  if (!p) return vacio();
  const { desde, hasta } = p;
  const periodo = periodoEnFrase(desde, hasta);
  const eje = textoEjeBalance(b.eje);
  const aviones = avionesValidos(b);
  const enlaces = aviones.slice(0, MAX_ENLACES_AVION).map((a) => ({
    key: `avion-${a.id}`,
    href: hrefVistaBalance({ tipo: "avion", avionId: a.id }, desde, hasta, { gasto: g.id }),
    etiqueta: etiquetaVerBalanceAvion(a.matricula),
    title: `Abre en una pestaña nueva el balance de ${a.matricula || "ese avión"} (${periodo}, ${eje}) en la celda de este gasto${sufijoHoja(nombreHojaBalanceAvion(b.hoja_avion, a.matricula))}`,
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
              desde,
              hasta,
              { gasto: g.id },
            ),
            etiqueta: ETIQUETA_VER_BALANCE_GENERAL,
            title: `Abre en una pestaña nueva el Balance mensual de la flota (${periodo}, ${eje}) en la celda de este gasto${sufijoHoja(nombreHojaBalanceGeneral(b.hoja_general))}`,
          }
        : null,
  };
}

/** ¿Hay algo que pintar? */
export function hayEnlacesBalance(e: EnlacesBalanceDeGasto | null | undefined): boolean {
  return !!e && (e.aviones.length > 0 || e.general != null);
}

/** «oct 2026» (el mes corto es-MX de los textos de balance, sin el día). */
function mesCorto(dia: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dia.slice(0, 10)}T12:00:00Z`),
  );
}

/** «oct 2026» si el periodo es UN mes (lo de siempre); si no, «del … al …». */
function textoMesBalance(desde: string, hasta: string): string {
  return desde.slice(0, 7) === hasta.slice(0, 7) ? mesCorto(desde) : periodoEnFrase(desde, hasta);
}

/** «hoja «X»» / «hojas «X» y «Y»» (sin repetir); vacío sin nombres. */
function textoHojas(nombres: (string | null)[]): string {
  const unicos = [...new Set(nombres.filter((n): n is string => !!n))];
  if (unicos.length === 0) return "";
  const citadas = unicos.map((n) => `«${n}»`);
  if (citadas.length === 1) return `hoja ${citadas[0]}`;
  return `hojas ${citadas.slice(0, -1).join(", ")} y ${citadas[citadas.length - 1]}`;
}

/**
 * «¿En qué hoja del Excel del balance está?» (pedido del cliente,
 * 15-oct-2026, caja chica): «Balance de N4142R (oct 2026): hoja «reporte
 * horas N4142R» · Balance general: hoja «reporte horas FLOTA»». Sale SOLO del
 * campo `balance` del API (invariante 72: el API decide libro, mes y hoja;
 * aquí solo se nombran las pestañas con `NOMBRE_HOJA_BALANCE_*`). Máximo
 * `MAX_ENLACES_AVION` matrículas y «y N aviones más», como los enlaces.
 *
 * Informativo, para CUALQUIER rol que vea la fila (los enlaces sí van por
 * rol). `null` (sin línea) sin `balance` (API previo), con `balance: null`
 * — que NO significa «no cuenta en ningún balance»: también es null el pago
 * al vendedor, que resta en COMISIONES sin vínculo a su celda (inv. 72 (v))
 * —, con un periodo inválido o sin nada que decir.
 */
export function textoHojaBalanceDeGasto(
  balance: UbicacionBalanceGasto | null | undefined,
): string | null {
  if (!balance || typeof balance !== "object") return null;
  const p = periodoValido(balance);
  if (!p) return null;
  const mes = textoMesBalance(p.desde, p.hasta);
  const partes: string[] = [];
  const aviones = avionesValidos(balance);
  if (aviones.length > 0) {
    const visibles = aviones.slice(0, MAX_ENLACES_AVION);
    const resto = aviones.length - visibles.length;
    const conMatricula = visibles.every((a) => !!a.matricula?.trim());
    let quien: string;
    if (!conMatricula) {
      quien = aviones.length === 1 ? "Balance del avión" : `Balance de ${aviones.length} aviones`;
    } else {
      const nombres = visibles.map((a) => (a.matricula as string).trim());
      const lista =
        resto > 0
          ? `${nombres.join(", ")} y ${resto} ${resto === 1 ? "avión" : "aviones"} más`
          : nombres.length === 1
            ? nombres[0]
            : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
      quien = `Balance de ${lista}`;
    }
    const hojas = textoHojas(visibles.map((a) => nombreHojaBalanceAvion(balance.hoja_avion, a.matricula)));
    partes.push(`${quien} (${mes})${hojas ? `: ${hojas}` : ""}`);
  }
  if (balance.general === true) {
    const hoja = textoHojas([nombreHojaBalanceGeneral(balance.hoja_general)]);
    // Sin aviones, el mes va aquí; con ellos ya lo dijo la primera parte.
    const etiqueta = partes.length > 0 ? "Balance general" : `Balance general (${mes})`;
    partes.push(hoja ? `${etiqueta}: ${hoja}` : etiqueta);
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}
