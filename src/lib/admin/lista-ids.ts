/**
 * Listas de PERSONAS de Configuración (permisos por persona): la pieza común,
 * PURA (sin React ni red). La usan «Editan cotizaciones cobradas»
 * (`cotizacion-cobrada.ts#diffEditores`) y «Acceso a Nómina»
 * (`acceso-nomina.ts`).
 */

/** Qué cambia entre lo guardado y lo elegido (ids sin repetir, en su orden). */
export function diffListaIds(
  guardados: readonly string[],
  elegidos: readonly string[],
): { agregados: string[]; quitados: string[] } {
  const g = new Set(guardados);
  const e = new Set(elegidos);
  return {
    agregados: [...e].filter((id) => !g.has(id)),
    quitados: [...g].filter((id) => !e.has(id)),
  };
}
