/**
 * LO COMÚN de las dos hojas «Conciliación con el banco» (15-oct-2026, API
 * 0.0.78, invariante 78 del API): la de un GASTO (`gasto-banco.ts`, 13-oct-2026,
 * API 0.0.75) y la de una ENTRADA de dinero —cobro de vuelo, sobre, anticipo o
 * ingreso— (`entrada-banco.ts`). Módulo PURO (sin React ni red; prueba
 * `__tests__/hoja-banco.test.ts`).
 *
 * Todo lo de aquí se MUDÓ (no se copió) desde `gasto-banco.ts`, que lo
 * RE-EXPORTA con el mismo nombre: sus importadores y sus pruebas no cambian.
 * Solo vive aquí lo que no depende de la entidad: roles, textos fijos de la
 * hoja, la descarga del estado de cuenta, los errores comunes, el monto como
 * lo escribe la búsqueda de la tabla de Conciliación y el archivo de origen
 * de un movimiento (cargo o abono).
 */

import { fmtDate, fmtDateTime } from "@/lib/datetime";
import { numeroDe } from "@/lib/admin/conciliacion-parcial";
import type { EstadoCuentaDeCargo, MotivoSinArchivo } from "@/types/conciliacion";

// ───────────────────────────── Roles ─────────────────────────────

/** Espejo de `ROLES_CONCILIACION` del API (= el menú «Conciliación»): quién ve el banco. */
export const ROLES_DETALLE_BANCO = ["ADMIN", "FACTURACION"] as const;

/**
 * ¿Se ofrece el clic del badge (gasto o entrada)? Sin rol conocido (`/me`
 * falló) SÍ: es la convención de `gasto-acciones.ts` — el API es el candado y
 * su 403 tiene texto. Con rol, solo ADMIN y FACTURACION. UNA sola regla para
 * las dos hojas.
 */
export function puedeVerDetalleBanco(rol: string | null | undefined): boolean {
  if (rol == null || rol === "") return true;
  return (ROLES_DETALLE_BANCO as readonly string[]).includes(rol);
}

// ───────────────────────────── Textos fijos ─────────────────────────────

export const TITULO_HOJA_BANCO = "Conciliación con el banco";
export const TEXTO_ESTADO_CAMBIO =
  "El estado cambió desde que abriste la página: recarga para ver la lista al día.";
export const BOTON_RECARGAR = "Recargar";
export const BOTON_REINTENTAR_BANCO = "Reintentar";
export const BOTON_VER_EN_CONCILIACION = "Ver en Conciliación";
export const TITULO_DESCARGAR_ESTADO_CUENTA =
  "Descarga el archivo original del banco (el enlace se genera al hacer clic y vence en 1 hora)";
export const TEXTO_DESCARGANDO = "Abriendo…";
export const TEXTO_NO_ABRIO_PESTANA = "El navegador no abrió la pestaña";
export const ACCION_DESCARGAR = "Descargar";
export const TITULO_QUE_HACER = "¿Qué hacer?";
export const NOTA_CRUZAR_PENDIENTES =
  "Si el estado de cuenta de ese periodo ya está importado, prueba «Cruzar pendientes» en Conciliación.";
export const MSG_DETALLE_BANCO_API_VIEJO =
  "El servidor todavía no tiene este detalle (falta actualizar el API). Mientras, búscalo en Conciliación.";
export const MSG_DETALLE_BANCO_SIN_PERMISO = "Solo Administración y Facturación ven el detalle del banco.";
export const MSG_SESION_EXPIRO = "Tu sesión expiró. Recarga la página e inicia sesión.";
export const MSG_DETALLE_BANCO_FALLO = "No se pudo cargar el detalle del banco. Vuelve a intentarlo.";
export const MSG_ESTADO_CUENTA_NO_EXISTE = "El archivo del estado de cuenta ya no existe.";
export const MSG_ESTADO_CUENTA_FALLO = "No se pudo generar la descarga del estado de cuenta. Vuelve a intentarlo.";

/** «Ver los … ya conciliados»: ±7 días (hoy, a lo más ~222 movimientos). */
export const VENTANA_YA_CONCILIADOS_DIAS = 7;

// ───────────────────────────── Tipos comunes ─────────────────────────────

/** Tono de la frase del estado: ok (verde) · aviso (ámbar) · pendiente (rosa) · neutro (gris). */
export type TonoEstadoBanco = "ok" | "aviso" | "pendiente" | "neutro";

/** Un enlace de la hoja (siempre a otra pestaña, con su `title`). */
export interface EnlaceHoja {
  etiqueta: string;
  href: string;
  titulo: string;
}

/** Lo que devuelve la action al fallar. */
export interface ResultadoDetalleBanco {
  ok?: boolean;
  error?: string | null;
  code?: string | null;
  status?: number | null;
}

// ───────────────────────────── El estado de cuenta ─────────────────────────────

/** Etiqueta del botón de descarga según el formato del archivo. */
export function etiquetaDescargaEstadoCuenta(formato: string | null | undefined): string {
  const f = (formato ?? "").trim().toLowerCase();
  if (f === "pdf") return "Descargar estado de cuenta (PDF)";
  if (f === "xlsx" || f === "xls") return "Descargar estado de cuenta (Excel)";
  if (f === "csv") return "Descargar estado de cuenta (CSV)";
  return "Descargar estado de cuenta";
}

/** El error al generar la descarga del estado de cuenta. */
export function mensajeErrorDescargaEstadoCuenta(r: ResultadoDetalleBanco): string {
  return r.status === 404 ? MSG_ESTADO_CUENTA_NO_EXISTE : MSG_ESTADO_CUENTA_FALLO;
}

/** El archivo del que salió un movimiento o, si no hay, el motivo REAL. */
export type ArchivoDeMovimiento =
  | { tipo: "ARCHIVO"; nombre: string; detalle: string; estadoCuentaId: string; etiquetaDescarga: string }
  | { tipo: "SIN_ARCHIVO"; texto: string }
  | { tipo: "NO_LEIDO"; texto: string };

/** Lo que `archivoDeMovimiento` lee de un cargo o un abono (la base compartida del API). */
export interface MovimientoConArchivo {
  estado_cuenta: EstadoCuentaDeCargo | null;
  orden_archivo: number | null;
  creado_at: string | null;
  creado_por: string | null;
  sin_archivo: MotivoSinArchivo | null;
}

/**
 * El archivo del que salió el movimiento («Estado de cuenta: … · Importado el
 * … por …» + la descarga) o, si no hay, el motivo REAL por `origen` y día
 * Cancún («Sin archivo guardado: este cargo se importó el 16 jul 2026 por
 * Jimmy Chi…»). `sustantivo` = «cargo» (Gastos) o «abono» (entradas).
 */
export function archivoDeMovimiento(m: MovimientoConArchivo, sustantivo: "cargo" | "abono"): ArchivoDeMovimiento {
  const ec = m.estado_cuenta;
  if (ec && ec.id) {
    const detalle = [
      `Importado el ${fmtDateTime(ec.importado_at)}${ec.importado_por ? ` por ${ec.importado_por}` : ""}`,
      m.orden_archivo != null ? `línea ${m.orden_archivo} del archivo` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      tipo: "ARCHIVO",
      nombre: ec.filename,
      detalle,
      estadoCuentaId: ec.id,
      etiquetaDescarga: etiquetaDescargaEstadoCuenta(ec.formato),
    };
  }
  const cuando = m.creado_at ? ` el ${fmtDate(m.creado_at)}` : "";
  const quien = m.creado_por ? ` por ${m.creado_por}` : "";
  if (m.sin_archivo === "IMPORTADO_SIN_ARCHIVO") {
    return {
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este ${sustantivo} se importó${cuando}${quien} sin el archivo original del banco.`,
    };
  }
  if (m.sin_archivo === "CAPTURA_MANUAL") {
    return {
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo: este ${sustantivo} se capturó a mano${cuando}${quien}; no viene de un estado de cuenta.`,
    };
  }
  return { tipo: "NO_LEIDO", texto: "Estado de cuenta archivado (no se pudo leer su detalle)." };
}

// ───────────────────────────── La búsqueda de Conciliación ─────────────────────────────

/** «2801.4», «564», «8939.38»: el monto como lo escribe la búsqueda de la tabla. */
export function montoParaBusquedaTabla(n: number | string | null | undefined): string {
  return String(Math.round(numeroDe(n) * 100) / 100);
}
