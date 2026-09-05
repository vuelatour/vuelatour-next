import type { AvionFichaMin } from "@/types/quotes-persisted";

/**
 * Helpers PUROS del avión COTIZADO (feedback del cliente 4-sep-2026): en
 * el previo del cotizador, en el detalle y en el PDF se muestra el TIPO
 * de avión cotizado — el MODELO (Seneca, Kodiak, Meridian, Cessna…), NUNCA
 * la matrícula — porque a veces se cotiza en un avión y la ruta operativa
 * va en otro. La lista de modelos la manda el API (`modelos_cotizados`,
 * fuente única con el PDF); aquí solo se formatea.
 */

function limpio(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * "Piper Seneca V" / "Seneca V · Cessna 206" (modelos distintos separados
 * por «·»). Precedencia: externo → SOLO el modelo del avión ajeno (la
 * referencia de tarifa no se enseña); lista del API si trae algo; si no,
 * el modelo del snapshot/breakdown. null si no hay nada que mostrar.
 */
export function modelosCotizadosTexto(input: {
  esExterno?: boolean | null;
  externoModelo?: string | null;
  /** `modelos_cotizados` del API (GET /v1/quotes/:id). */
  modelos?: string[] | null;
  /** `breakdown.aeronave.modelo` / `calculo_snapshot.aeronave.modelo`. */
  modelo?: string | null;
}): string | null {
  if (input.esExterno) return limpio(input.externoModelo);
  const lista = (input.modelos ?? []).map((m) => limpio(m)).filter((m): m is string => !!m);
  const unicos = lista.filter((m, i) => lista.indexOf(m) === i);
  if (unicos.length > 0) return unicos.join(" · ");
  return limpio(input.modelo);
}

/** «Cotizado en: Piper Seneca V» (null sin modelo). */
export function textoCotizadoEn(
  input: Parameters<typeof modelosCotizadosTexto>[0],
): string | null {
  const m = modelosCotizadosTexto(input);
  return m ? `Cotizado en: ${m}` : null;
}

/**
 * «opera en XB-ANU (Cessna 206)» cuando el avión OPERATIVO del vuelo es
 * distinto al COTIZADO (aquí sí matrícula: es vista interna). null si
 * coinciden, si falta alguno (externo, sin avión) o si el API no los manda.
 */
export function textoOperaEn(
  cotizada: AvionFichaMin | null | undefined,
  operativa: AvionFichaMin | null | undefined,
): string | null {
  if (!cotizada || !operativa) return null;
  if (cotizada.id === operativa.id) return null;
  const matricula = limpio(operativa.matricula);
  const modelo = limpio(operativa.modelo);
  if (!matricula && !modelo) return null;
  const ficha = matricula ? `${matricula}${modelo ? ` (${modelo})` : ""}` : modelo;
  return `opera en ${ficha}`;
}
