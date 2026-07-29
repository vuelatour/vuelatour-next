/**
 * Procedencia de una lectura de tacómetro: CÓMO entró el número y quién
 * respondió por él. FUENTE ÚNICA — la usan el tablero de tacómetros en vivo y
 * el detalle del vuelo (la oficina pedía ver lo mismo en los dos lados).
 */

export type OrigenTaco = "PILOTO" | "IA" | "DEDUCIDO" | "OFICINA";

export interface LecturaProcedencia {
  taco_salida: number | string | null;
  taco_llegada: number | string | null;
  taco_salida_origen?: OrigenTaco | string | null;
  taco_llegada_origen?: OrigenTaco | string | null;
  valor_ia_propuesto?: number | string | null;
  revision_requerida?: boolean | null;
  capturado_por_nombre?: string | null;
  corregido_por_nombre?: string | null;
}

/** Leyenda corta de una lectura (acordada con el cliente). */
export function leyendaOrigen(
  e: LecturaProcedencia,
  lado: "salida" | "llegada",
): string | null {
  const valor = lado === "salida" ? e.taco_salida : e.taco_llegada;
  const origen = lado === "salida" ? e.taco_salida_origen : e.taco_llegada_origen;
  if (valor == null || !origen) return null;
  const confirmada =
    !e.revision_requerida && e.corregido_por_nombre
      ? ` · confirmado por ${e.corregido_por_nombre}`
      : "";
  switch (origen) {
    case "PILOTO":
      return (
        (e.valor_ia_propuesto != null && Number(e.valor_ia_propuesto) === Number(valor)
          ? "Leído por IA · aceptado por piloto"
          : `Capturado por ${e.capturado_por_nombre ?? "piloto"}`) + confirmada
      );
    case "IA":
      return `Leído por IA de la foto${confirmada || " · sin confirmar"}`;
    case "DEDUCIDO":
      return `Deducido automáticamente${confirmada || " · sin confirmar"}`;
    case "OFICINA":
      return `Ajustado por ${e.corregido_por_nombre ?? "oficina"}`;
    default:
      return String(origen);
  }
}

/**
 * ¿La bitácora menciona una foto dudosa? (para pintar el aviso ámbar)
 * El API ya manda `procedencia` por separado de `revision_motivo`.
 */
export function fotoDudosa(procedencia: string | null | undefined): boolean {
  const t = (procedencia ?? "").toUpperCase();
  return t.includes("CALIDAD DE FOTO BAJA") || t.includes("BORROSA");
}
