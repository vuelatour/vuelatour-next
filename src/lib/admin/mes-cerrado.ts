/**
 * Candado 409 `MES_CERRADO` (16-oct-2026, API 0.0.88) — regla PURA del panel
 * para TODOS los formularios que capturan dinero (gasto, cobro, ingreso,
 * entrega a socio, caja chica, cotización): reconocer el rechazo, copiar el
 * texto del API tal cual («Septiembre 2026 ya está cerrado (Ale, 16-oct).
 * Reábrelo en Reportes para corregir.») y armar el enlace a Reportes con el
 * mes completo, donde solo ADMIN ve «Reabrir mes».
 *
 * El texto NO se rearma en el panel (fuente única: el API); solo si llegara
 * sin `message` se escribe uno con el periodo de `details`.
 */
import type { DetallesMesCerrado } from "@/types/cierres";
import { esMesValido, etiquetaMes } from "./reparto-pagos";
import { hrefReportesMes, mesEnMinuscula } from "./cierre-mes";

export const CODIGO_MES_CERRADO = "MES_CERRADO";
export const ETIQUETA_IR_A_REPORTES = "Ir a Reportes";

/** Lo que devuelven las actions (`ActionResult`) o un `ApiError`: con `code`. */
interface ConCodigo {
  code?: string | null;
  error?: string | null;
  message?: string | null;
  details?: unknown;
}

function comoConCodigo(r: unknown): ConCodigo | null {
  return r && typeof r === "object" ? (r as ConCodigo) : null;
}

/** ¿Es el rechazo del candado? (un resultado `ok:true` nunca lo es). */
export function esMesCerrado(r: unknown): boolean {
  const c = comoConCodigo(r);
  if (!c) return false;
  if ((c as { ok?: unknown }).ok === true) return false;
  return c.code === CODIGO_MES_CERRADO;
}

/**
 * `details` del 409 con el periodo validado (`YYYY-MM`); sin periodo ⇒ null.
 * CIERRE POR AVIÓN (API 0.0.104): `aeronave` = el avión cuyo cierre rebotó
 * (null = la fila global o un registro sin avión); solo con id y matrícula.
 */
export function detallesMesCerrado(details: unknown): DetallesMesCerrado | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (!esMesValido(d.periodo as string)) return null;
  const por = d.cerrado_por && typeof d.cerrado_por === "object" ? (d.cerrado_por as Record<string, unknown>) : null;
  const ae = d.aeronave && typeof d.aeronave === "object" ? (d.aeronave as Record<string, unknown>) : null;
  return {
    periodo: d.periodo as string,
    cerrado_at: typeof d.cerrado_at === "string" ? d.cerrado_at : null,
    cerrado_por:
      por && typeof por.nombre === "string" ? { id: typeof por.id === "string" ? por.id : "", nombre: por.nombre } : null,
    registro: typeof d.registro === "string" ? d.registro : undefined,
    ...("aeronave" in d
      ? {
          aeronave:
            ae && typeof ae.matricula === "string" && ae.matricula.trim()
              ? { id: typeof ae.id === "string" ? ae.id : "", matricula: ae.matricula.trim() }
              : null,
        }
      : {}),
  };
}

/**
 * `/admin/reportes?desde=YYYY-MM-01&hasta=YYYY-MM-DD` del mes cerrado (null
 * sin periodo). Desde el cierre por avión, ahí viven los botones «Reabrir»
 * de cada tile de «Balance por avión» y el de la flota.
 */
export function hrefReabrir(periodo: string | null | undefined): string | null {
  return periodo && esMesValido(periodo) ? hrefReportesMes(periodo) : null;
}

/**
 * Texto de respaldo SOLO si el API no mandó `message`: «Septiembre 2026 ya
 * está cerrado. …» o, con el avión del candado (API 0.0.104), «N621TX ·
 * septiembre 2026 ya está cerrado. Reábrelo en Reportes para corregir.»
 */
export function textoMesCerradoRespaldo(periodo: string | null, matricula: string | null = null): string {
  let mes: string;
  if (periodo && matricula) mes = `${matricula} · ${mesEnMinuscula(periodo)} ya está cerrado`;
  else if (periodo) mes = `${etiquetaMes(periodo)} ya está cerrado`;
  else if (matricula) mes = `${matricula} · ese mes ya está cerrado`;
  else mes = "Ese mes ya está cerrado";
  return `${mes}. Reábrelo en Reportes para corregir.`;
}

export interface AvisoMesCerrado {
  texto: string;
  href: string | null;
  periodo: string | null;
  /** CIERRE POR AVIÓN: la matrícula del avión cerrado (null = toda la flota / sin avión; ausente con API previo). */
  matricula?: string | null;
}

/**
 * El aviso completo a partir de un `ActionResult` fallido o un `ApiError`:
 * null si no es `MES_CERRADO`. El texto es el `message` del API (en las
 * actions viaja como `error`).
 */
export function avisoMesCerrado(r: unknown): AvisoMesCerrado | null {
  if (!esMesCerrado(r)) return null;
  const c = comoConCodigo(r)!;
  const d = detallesMesCerrado(c.details);
  const periodo = d?.periodo ?? null;
  const matricula = d?.aeronave?.matricula ?? null;
  const texto = (c.error ?? c.message ?? "").trim() || textoMesCerradoRespaldo(periodo, matricula);
  return { texto, href: hrefReabrir(periodo), periodo, ...(d && "aeronave" in d ? { matricula } : {}) };
}
