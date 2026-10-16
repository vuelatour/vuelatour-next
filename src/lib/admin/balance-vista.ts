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
import { ajustarRangoAlInicio, type InicioOficial } from "./inicio-oficial";

export const RUTA_VISTA_BALANCE = "/admin/reportes/balance";
export const MODO_VISTA_BALANCE_DEFAULT: ModoBalanceVuelaTour = "mensual";

export const ETIQUETA_VER_EN_PANTALLA = "Ver en pantalla";
export const TITULO_VER_EN_PANTALLA =
  "Abre el mismo libro en pantalla, con sus hojas, números y colores, sin descargarlo";
export const ETIQUETA_DESCARGAR_LIBRO = "Descargar este libro (Excel)";
/** La ayuda del ícono ⓘ. La última frase (14-oct-2026) es para que se descubra
 *  el autoajuste de columnas: la manija no se ve hasta pasar el ratón. */
export const DESCRIPCION_VISTA_BALANCE =
  "Es el mismo libro que se descarga: las mismas hojas, los mismos números y fórmulas y los mismos colores. Cambia de hoja abajo, como en Excel. Doble clic en la línea entre dos letras de columna ajusta el ancho al contenido.";
export const ETIQUETA_VOLVER_REPORTES = "Reportes";

/** Nombre de cada libro de la flota, como lo dice el cliente. */
export const NOMBRE_LIBRO_VUELATOUR: Record<ModoBalanceVuelaTour, string> = {
  mensual: "Balance mensual",
  general: "Balance general",
};

export type DestinoVistaBalance =
  | { tipo: "vuelatour"; modo: ModoBalanceVuelaTour }
  | { tipo: "avion"; avionId: string };

/**
 * El TIPO de libro para los anchos de columna que ajusta el operador
 * (`claveAnchos` de `LibroExcel`, 14-oct-2026): «mensual», «general» o
 * «avion». Los tres tienen hojas con el mismo nombre («balance») y columnas
 * distintas, así que no comparten anchos; los libros de los aviones sí entre
 * ellos (es el mismo libro con otros datos). Los anchos viven en el estado del
 * componente: sobreviven a «Actualizar datos», al cambio de hoja y al de
 * periodo o de libro (sin `?gasto=`; con él, la `key` de la página remonta el
 * libro) y se pierden al recargar.
 */
export function claveAnchosVistaBalance(destino: DestinoVistaBalance): string {
  return destino.tipo === "avion" ? "avion" : destino.modo;
}

/** Mes corriente (hoy en Cancún), el mismo default que `/admin/reportes`. */
export function periodoDefaultVista(hoy: string): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

export interface ParametrosVistaBalance {
  destino: DestinoVistaBalance;
  desde: string;
  hasta: string;
  /** `?gasto=<uuid>` (13-oct-2026, punto 5): el libro abre en la celda de
   *  ese gasto (llegada desde Conciliación). La llave solo existe con un uuid
   *  válido y NO viaja al API: el libro es el mismo con o sin ella. */
  gasto?: string;
  /** Inicio oficial (16-oct-2026): el periodo de la URL caía antes y se
   *  movió (la página pinta el aviso). Solo existe cuando es `true`. */
  ajustado?: true;
}

/**
 * Parámetros de la URL YA validados (regla de `url-params`: lo inválido se
 * ignora, nunca tumba la pantalla): `avion` solo si es uuid (y entonces gana
 * sobre `modo`), `modo` solo si está en el catálogo (si no, mensual), fechas
 * solo si son días válidos (si no, el mes corriente), el rango invertido se
 * corrige y `gasto` solo si es uuid.
 */
export function parametrosVistaBalance(
  sp: { modo?: string; avion?: string; desde?: string; hasta?: string; gasto?: string },
  periodoDefault: { desde: string; hasta: string },
  inicio: InicioOficial = null,
): ParametrosVistaBalance {
  const rango = rangoFiltro(sp.desde, sp.hasta);
  let desde = rango.desde ?? periodoDefault.desde;
  let hasta = rango.hasta ?? periodoDefault.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  // Inicio oficial (16-oct-2026, API 0.0.84): agosto en la URL ⇒ desde el
  // inicio (el «hoy» es el corte del periodo por defecto). Sin él, intacto.
  const ajuste = ajustarRangoAlInicio({ desde, hasta }, inicio, periodoDefault.hasta);
  desde = ajuste.desde ?? desde;
  hasta = ajuste.hasta ?? hasta;
  const avionId = uuidFiltro(sp.avion);
  const destino: DestinoVistaBalance = avionId
    ? { tipo: "avion", avionId }
    : {
        tipo: "vuelatour",
        modo: valorDeCatalogo(sp.modo, MODOS_BALANCE_VUELATOUR) ?? MODO_VISTA_BALANCE_DEFAULT,
      };
  const gasto = uuidFiltro(sp.gasto);
  return {
    destino,
    desde,
    hasta,
    ...(gasto ? { gasto } : {}),
    ...(ajuste.ajustado ? { ajustado: true as const } : {}),
  };
}

/**
 * Enlace a la vista de un libro en un periodo (lo usan Reportes, el selector
 * de avión, los chips de la vista y los enlaces de Conciliación). Con
 * `extra.gasto` (uuid válido) agrega `&gasto=` AL FINAL: el libro abre en la
 * celda de ese gasto. Sin `extra` (o con un gasto inválido) la URL es la de
 * siempre.
 */
export function hrefVistaBalance(
  destino: DestinoVistaBalance,
  desde: string,
  hasta: string,
  extra?: { gasto?: string | null },
): string {
  const q = new URLSearchParams();
  if (destino.tipo === "avion") q.set("avion", destino.avionId);
  else q.set("modo", destino.modo);
  q.set("desde", desde);
  q.set("hasta", hasta);
  const gasto = uuidFiltro(extra?.gasto);
  if (gasto) q.set("gasto", gasto);
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

/**
 * Roles que abren o descargan los balances (12-oct-2026): ESPEJO del
 * `@Roles(Rol.ADMIN, Rol.ANALISTA)` de `balance-general.xlsx`,
 * `balance-general/libro`, `:id/balance.xlsx` y `:id/balance/libro` del API
 * (`aircraft.controller.ts`; la paridad la congela `balance-vista.test.ts`).
 */
export const ROLES_ABREN_BALANCES = ["ADMIN", "ANALISTA"] as const;

/**
 * ¿Se le OFRECEN los balances a este rol? Sin rol (`/me` falló) se ofrece
 * todo: el API es el candado (patrón `puedeEditarPiloto` /
 * `puedeDescargarBalance`).
 */
export function puedeAbrirBalances(rol?: string | null): boolean {
  if (!rol) return true;
  return (ROLES_ABREN_BALANCES as readonly string[]).includes(rol);
}

/**
 * Card con candado que `/admin/reportes` pinta en lugar del hero de balances
 * para un rol que no los abre (FACTURACION entra a Reportes por el menú y el
 * API le responde 403 en los cuatro endpoints). El título es el MISMO del
 * 403 de `errorVistaBalance`. La descripción NO promete descargas que el rol
 * no puede usar: en esa pantalla «PDF socios» y «Horas por piloto» también se
 * filtran por rol (`vePdf` de `ReportDownloads`, `puedeExportarHorasPiloto`).
 */
export const TEXTO_BALANCES_SIN_PERMISO = {
  titulo: "Tu usuario no puede abrir los balances",
  descripcion:
    "Solo administración y análisis (ADMIN y ANALISTA) abren o descargan los balances de la flota y de cada avión. El pre-cierre, el cierre del mes y los demás reportes de esta pantalla siguen aquí, con las descargas que tu rol puede usar.",
} as const;

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
      titulo: TEXTO_BALANCES_SIN_PERMISO.titulo,
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
