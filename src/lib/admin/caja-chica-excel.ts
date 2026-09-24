/**
 * EXCEL DE LA REPOSICIÓN de caja chica (24-sep-2026). Palabras del cliente:
 * «en el apartado de caja chica, quiero ver si se puede al momento de
 * reembolsar la caja de cada uno, me puede arrojar un Excel descargable con la
 * información de lo que estoy reembolsando».
 *
 * El Excel lo arma el API (0.0.29) con pyservices y el panel SOLO lo
 * descarga: qué gastos repone cada reposición, en qué orden y con qué saldo lo
 * decide `tramoDeReposicion` sobre `historialConSaldo`
 * (`common/caja-chica-saldo.util.ts` del API, fuente única). Aquí no se suma
 * ni se resta un peso.
 *
 * Módulo PURO (sin React ni Next): rutas del proxy, nombres de respaldo,
 * quién puede descargar y los textos. Prueba en
 * `__tests__/caja-chica-excel.test.ts`.
 */

/** Roles que pueden descargar (espejo de `GESTION` del controlador del API). */
export const ROLES_EXCEL_CAJA = ["ADMIN", "FACTURACION"] as const;

/** ¿Este rol puede descargar los Excel de caja chica? */
export function puedeDescargarExcelCaja(rol: string | null | undefined): boolean {
  return (ROLES_EXCEL_CAJA as readonly string[]).includes(rol ?? "");
}

/**
 * Proxy (`app/api/caja-chica/movimientos/[id]/reposicion`) →
 * `GET /v1/caja-chica/movimientos/:id/reposicion.xlsx`.
 */
export function rutaExcelReposicion(movimientoId: string): string {
  return `/api/caja-chica/movimientos/${encodeURIComponent(movimientoId)}/reposicion`;
}

/**
 * Proxy (`app/api/caja-chica/fondos/[id]/por-reponer`) →
 * `GET /v1/caja-chica/fondos/:id/por-reponer.xlsx`.
 */
export function rutaExcelPorReponer(fondoId: string): string {
  return `/api/caja-chica/fondos/${encodeURIComponent(fondoId)}/por-reponer`;
}

function limpio(texto: string | null | undefined, respaldo: string): string {
  const t = (texto ?? "").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return t || respaldo;
}

/**
 * Nombre de RESPALDO del archivo (el API manda el suyo en
 * `Content-Disposition`, que es el que gana): «Reposicion caja Itzi
 * 2026-09-21.xlsx».
 */
export function nombreExcelReposicion(persona: string | null | undefined, fecha: string | null | undefined): string {
  return `Reposicion caja ${limpio(persona, "fondo")} ${limpio(fecha, "sin fecha")}.xlsx`;
}

/** «Por reponer caja Luis 2026-09-24.xlsx» (respaldo; el API manda el suyo). */
export function nombreExcelPorReponer(persona: string | null | undefined, hoy: string | null | undefined): string {
  return `Por reponer caja ${limpio(persona, "fondo")} ${limpio(hoy, "hoy")}.xlsx`;
}

/**
 * ¿El movimiento que se ACABA de guardar dispara la descarga automática?
 * Solo una REPOSICIÓN NUEVA con id (corregir una vieja o registrar un
 * reintegro/ajuste no descarga nada). Devuelve el movimiento o `null`.
 */
export function reposicionRecienRegistrada<T extends { id?: string | null }>(p: {
  esCorreccion: boolean;
  tipo: string | null | undefined;
  creado: T | null | undefined;
}): (T & { id: string }) | null {
  if (p.esCorreccion || p.tipo !== "REPOSICION") return null;
  if (!p.creado || typeof p.creado.id !== "string" || !p.creado.id) return null;
  return p.creado as T & { id: string };
}

/** ¿Este movimiento del historial lleva el ícono de descarga? Solo REPOSICIÓN. */
export function esReposicionDescargable(
  movimiento: { tipo?: string | null } | null | undefined,
): boolean {
  return movimiento?.tipo === "REPOSICION";
}

/** Textos (una sola fuente: botón, ícono del historial y toasts). */
export const TEXTO_BOTON_POR_REPONER = "Descargar lo pendiente por reponer (Excel)";
export const TITULO_BOTON_POR_REPONER =
  "Excel con los gastos en efectivo desde la última reposición (lo que hay que reponer hoy). Descárgalo antes de registrar la reposición.";
export const TITULO_ICONO_REPOSICION =
  "Descargar el Excel de lo que repuso esta reposición (gastos, totales y saldo antes y después)";
export const TEXTO_REPOSICION_REGISTRADA = "Reposición registrada";
export const DESCRIPCION_REPOSICION_REGISTRADA =
  "Se está descargando el Excel con lo que repusiste.";
export const ETIQUETA_DESCARGAR_DE_NUEVO = "Descargar de nuevo";

/** El movimiento SÍ quedó; lo que falló fue el Excel. */
export function textoExcelNoDescargado(motivo: string): string {
  return `La reposición quedó registrada, pero el Excel no se pudo descargar: ${motivo}`;
}

/**
 * «Por reponer» de la card del detalle de un fondo FIJO — FUENTE ÚNICA del
 * API (revisión 24-sep-2026). La card calculaba su propia cifra (`fondo total
 * − saldo actual`) y NO coincidía con el Excel «Por reponer» ni con la app
 * cuando el fondo no tiene entregas registradas: Diego Ramírez (fondo $5,000,
 * 29 gastos por $4,944, ninguna reposición capturada) decía $9,944 en
 * pantalla y $4,944 en el Excel; Gregorio (fondo $2,000, libro vacío) $2,000
 * contra $0. La regla vive en `porReponerCaja` del API
 * (`caja-chica-saldo.util.ts`: sin entregas registradas se repone solo lo
 * gastado) y ya viaja POR FILA en el historial (`por_reponer`, desde el
 * 5-sep): aquí se LEE la última fila, cero cálculo de dinero en el panel.
 *
 * `historial` llega DESCENDENTE (la primera fila es la última del libro).
 * Libro vacío ⇒ 0 (lo mismo que dice el Excel). Solo con un API que no
 * mande `por_reponer` se cae a la fórmula vieja para no dejar la card vacía.
 */
export function porReponerDeFondo(fondo: {
  saldo: number;
  monto_fondo?: number | string | null;
  historial: ReadonlyArray<{ por_reponer?: number | null }>;
}): number {
  if (fondo.historial.length === 0) return 0;
  const ultima = fondo.historial[0]?.por_reponer;
  if (typeof ultima === "number" && Number.isFinite(ultima)) return ultima;
  return Math.round((Number(fondo.monto_fondo ?? 0) - fondo.saldo) * 100) / 100;
}
