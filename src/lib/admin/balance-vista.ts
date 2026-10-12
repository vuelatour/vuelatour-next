/**
 * Vista EN PANTALLA de los balances (`/admin/reportes/balance`, 12-oct-2026,
 * API 0.0.68) — FUENTE ÚNICA de sus rutas, parámetros, textos y de cómo se
 * lee un error del API. PURO (sin React ni red).
 *
 * Pedido del cliente: «dale prioridad a la vista de Excel de cada reporte…
 * el dueño está muy acostumbrado al Excel y necesitamos el mismo formato,
 * con los mismos colores y estructura para que dé la impresión de que está
 * trabajando sobre el Excel». La pantalla pinta el MISMO libro que se
 * descarga (lo arma pyservices del mismo openpyxl): aquí no se calcula ni se
 * formatea un solo número.
 */
import { fmtDateOnly } from "@/lib/datetime";
import {
  MODOS_BALANCE_VUELATOUR,
  RUTA_BALANCE_VUELATOUR,
  archivoBalanceVuelaTour,
  type ModoBalanceVuelaTour,
} from "./reportes-balance";
import { rangoFiltro, uuidFiltro, valorDeCatalogo } from "./url-params";

export const RUTA_VISTA_BALANCE = "/admin/reportes/balance";
export const MODO_VISTA_BALANCE_DEFAULT: ModoBalanceVuelaTour = "mensual";

export const ETIQUETA_VER_EN_PANTALLA = "Ver en pantalla";
export const TITULO_VER_EN_PANTALLA =
  "Abre el mismo libro en pantalla, con sus hojas, números y colores, sin descargarlo";
export const ETIQUETA_DESCARGAR_LIBRO = "Descargar este libro (Excel)";
export const DESCRIPCION_VISTA_BALANCE =
  "Es el mismo libro que se descarga: las mismas hojas, los mismos números y fórmulas y los mismos colores. Cambia de hoja abajo, como en Excel.";
export const ETIQUETA_VOLVER_REPORTES = "Reportes";

/** Nombre de cada libro de la flota, como lo dice el cliente. */
export const NOMBRE_LIBRO_VUELATOUR: Record<ModoBalanceVuelaTour, string> = {
  mensual: "Balance mensual",
  general: "Balance general",
};

export type DestinoVistaBalance =
  | { tipo: "vuelatour"; modo: ModoBalanceVuelaTour }
  | { tipo: "avion"; avionId: string };

/** Mes corriente (hoy en Cancún), el mismo default que `/admin/reportes`. */
export function periodoDefaultVista(hoy: string): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

export interface ParametrosVistaBalance {
  destino: DestinoVistaBalance;
  desde: string;
  hasta: string;
}

/**
 * Parámetros de la URL YA validados (regla de `url-params`: lo inválido se
 * ignora, nunca tumba la pantalla): `avion` solo si es uuid (y entonces gana
 * sobre `modo`), `modo` solo si está en el catálogo (si no, mensual), fechas
 * solo si son días válidos (si no, el mes corriente) y el rango invertido se
 * corrige.
 */
export function parametrosVistaBalance(
  sp: { modo?: string; avion?: string; desde?: string; hasta?: string },
  periodoDefault: { desde: string; hasta: string },
): ParametrosVistaBalance {
  const rango = rangoFiltro(sp.desde, sp.hasta);
  let desde = rango.desde ?? periodoDefault.desde;
  let hasta = rango.hasta ?? periodoDefault.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const avionId = uuidFiltro(sp.avion);
  const destino: DestinoVistaBalance = avionId
    ? { tipo: "avion", avionId }
    : {
        tipo: "vuelatour",
        modo: valorDeCatalogo(sp.modo, MODOS_BALANCE_VUELATOUR) ?? MODO_VISTA_BALANCE_DEFAULT,
      };
  return { destino, desde, hasta };
}

/** Enlace a la vista de un libro en un periodo (lo usan Reportes y el selector de avión). */
export function hrefVistaBalance(
  destino: DestinoVistaBalance,
  desde: string,
  hasta: string,
): string {
  const q = new URLSearchParams();
  if (destino.tipo === "avion") q.set("avion", destino.avionId);
  else q.set("modo", destino.modo);
  q.set("desde", desde);
  q.set("hasta", hasta);
  return `${RUTA_VISTA_BALANCE}?${q.toString()}`;
}

/** De vuelta a Reportes conservando el periodo. */
export function hrefReportesDesdeVista(desde: string, hasta: string): string {
  const q = new URLSearchParams({ desde, hasta });
  return `/admin/reportes?${q.toString()}`;
}

export function tituloVistaBalance(
  destino: DestinoVistaBalance,
  matricula?: string | null,
): string {
  if (destino.tipo === "avion") {
    return matricula ? `Balance del avión ${matricula}` : "Balance del avión";
  }
  return NOMBRE_LIBRO_VUELATOUR[destino.modo];
}

/** «Del 1 sep 2026 al 30 sep 2026». */
export function textoPeriodoVista(desde: string, hasta: string): string {
  return `Del ${fmtDateOnly(desde)} al ${fmtDateOnly(hasta)}`;
}

export interface DescargaVistaBalance {
  path: string;
  filename: string;
  query: Record<string, string>;
  label: string;
}

/**
 * El botón de descarga de la vista: EXACTAMENTE la misma ruta, parámetros y
 * nombre de archivo que los botones de Reportes (el libro en pantalla y el
 * descargado son el mismo). Para un avión hace falta su matrícula (viene en
 * la respuesta del libro); sin ella no hay botón.
 */
export function descargaVistaBalance(
  destino: DestinoVistaBalance,
  desde: string,
  hasta: string,
  matricula?: string | null,
): DescargaVistaBalance | null {
  if (destino.tipo === "vuelatour") {
    return {
      path: RUTA_BALANCE_VUELATOUR,
      filename: archivoBalanceVuelaTour(destino.modo, desde, hasta),
      query: { desde, hasta, modo: destino.modo },
      label: ETIQUETA_DESCARGAR_LIBRO,
    };
  }
  if (!matricula) return null;
  return {
    path: `/v1/aircraft/${destino.avionId}/balance.xlsx`,
    filename: `balance-${matricula}-${desde}-${hasta}.xlsx`,
    query: { desde, hasta },
    label: ETIQUETA_DESCARGAR_LIBRO,
  };
}

export type MotivoErrorVista = "permiso" | "api-viejo" | "no-existe" | "periodo" | "fallo";

export interface ErrorVistaBalance {
  motivo: MotivoErrorVista;
  titulo: string;
  descripcion: string;
}

/**
 * Qué decirle al operador cuando el libro no llegó. Un 401/403 es permiso
 * (los libros son de ADMIN y ANALISTA, como la descarga); un 404 «Cannot
 * GET …» es un API sin desplegar; otro 404 es un avión que no existe; un 400
 * es el periodo; lo demás es un fallo del servidor (se reintenta). JAMÁS se
 * pinta un libro vacío como si fuera «sin movimientos».
 */
export function errorVistaBalance(e: {
  status?: number;
  message?: string;
}): ErrorVistaBalance {
  const status = e.status;
  if (status === 401 || status === 403) {
    return {
      motivo: "permiso",
      titulo: "Tu usuario no puede abrir los balances",
      descripcion:
        "Solo administración y análisis (ADMIN y ANALISTA) ven los balances en pantalla: es el mismo permiso que la descarga en Excel.",
    };
  }
  if (status === 404 && /^Cannot (GET|POST)/i.test(e.message ?? "")) {
    return {
      motivo: "api-viejo",
      titulo: "Disponible cuando se actualice el servidor",
      descripcion:
        "La vista en pantalla necesita una versión del API que todavía no está desplegada. Mientras tanto, descarga el libro en Excel desde Reportes.",
    };
  }
  if (status === 404) {
    return {
      motivo: "no-existe",
      titulo: "Ese avión no existe",
      descripcion: "Elige otro avión en Reportes → Balance por avión.",
    };
  }
  if (status === 400) {
    return {
      motivo: "periodo",
      titulo: "El periodo no es válido",
      descripcion: e.message?.trim() || "Revisa las fechas «desde» y «hasta» y vuelve a intentarlo.",
    };
  }
  return {
    motivo: "fallo",
    titulo: "No se pudo armar el libro",
    descripcion:
      "El sistema no respondió. Suele ser momentáneo (por ejemplo, mientras se actualiza); pulsa Reintentar.",
  };
}
