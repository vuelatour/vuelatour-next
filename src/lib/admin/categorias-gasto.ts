/**
 * FUENTE ÚNICA de etiquetas es-MX para las categorías de gasto del API.
 * Antes cada tabla/diálogo tenía su propio mapa (o pintaba el código crudo
 * tipo PERSONAL_DUENO): toda pantalla nueva debe consumir de aquí.
 */
export const CATEGORIA_GASTO_LABELS: Record<string, string> = {
  GAS: "GAS",
  ATERRIZAJE: "ATERRIZAJE",
  OPERACIONES: "OPERACIONES",
  TUAS: "TUAS",
  FBO: "FBO",
  COMIDA: "COMIDA",
  HOTEL: "HOTEL",
  TAXI: "TAXI / estacionamiento",
  REFACCION: "REFACCION",
  PERMISO: "PERMISO",
  // Honorario del freelance que voló el avión (doc 3.7): gasto directo del vuelo.
  PILOTO_EXTERNO: "Piloto externo (honorario)",
  // LEGADO: ya no se ofrece en captura/verificación (se retiró de los
  // dropdowns), pero la etiqueta se conserva para pintar gastos históricos.
  FIJO: "Gasto fijo",
  // Gasto de la operación SIN vuelo (avión opcional): hoja "Gastos
  // indirectos" del balance del avión (o repartible desde Otros gastos).
  INDIRECTO: "Gastos indirectos de avión",
  // Nómina del personal: sin vuelo; avión opcional (piloto de un solo avión).
  NOMINA: "Nómina",
  // Servicio/mantenimiento DE UN AVIÓN sin vuelo (taller, seguros del avión…).
  SERVICIOS: "Servicios (avión)",
  // Gasolina de coches/camionetas — nunca combustible de aviación (ese es GAS).
  GASOLINA: "Gasolina (vehículos)",
  // LEGADO: gasto de un visitante de trabajo (fondo de visita / tarjeta
  // corporativa). Ya no se ofrece en captura/verificación; la etiqueta se
  // conserva para pintar gastos históricos.
  VISITA: "Visita",
  // Fuera del dinero de la empresa: ni balances, ni reparto, ni pre-cierre.
  PERSONAL_DUENO: "Gasto personal del dueño",
  OTRO: "Otros gastos",
};

/** Etiqueta legible de una categoría, con fallback capitalizado para
 *  categorías nuevas que el panel aún no conozca ("PISTA_VIP" → "Pista vip"). */
export function categoriaGastoLabel(cat: string): string {
  if (CATEGORIA_GASTO_LABELS[cat]) return CATEGORIA_GASTO_LABELS[cat];
  const limpio = cat.replaceAll("_", " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Gastos generales SIN vuelo repartibles entre aviones — SINCRONIZADA con la
 * regla del API (gasto_reparto): cambiar allá exige cambiar aquí.
 */
export const CATEGORIAS_REPARTIBLES: ReadonlySet<string> = new Set([
  "OTRO",
  "FIJO",
  "INDIRECTO",
  "GASOLINA",
  "VISITA",
  "NOMINA",
]);

/**
 * "¿A qué hoja del balance cae este gasto?" — texto corto para el hint bajo
 * el select de categoría (alta y verificación). Refleja las reglas del
 * balance por avión de pyservices:
 * - ligado a un vuelo → la hoja de ese vuelo;
 * - GAS con avión → hoja Combustible; PERMISO con avión → hoja Permisos;
 * - REFACCION manual con avión → hoja Gastos indirectos (la hoja
 *   Refacciones se alimenta SOLO de las salidas de bodega);
 * - INDIRECTO/NOMINA/SERVICIOS y demás con avión → hoja Gastos indirectos;
 * - sin avión ni vuelo → balance general de VuelaTour (repartible);
 * - PERSONAL_DUENO → fuera de todos los balances.
 */
export function hojaDestinoGasto(
  categoria: string,
  tieneVuelo: boolean,
  tieneAvion: boolean,
): string {
  if (categoria === "PERSONAL_DUENO") return "Fuera de balances (personal)";
  if (tieneVuelo) return "Balance del avión · hoja del vuelo";
  if (!tieneAvion) {
    return "Balance general · Gastos VuelaTour (repártelo en Otros gastos para cargarlo a aviones)";
  }
  if (categoria === "GAS") return "Balance del avión · Combustible";
  if (categoria === "PERMISO") return "Balance del avión · Permisos";
  // REFACCION manual incluida: la hoja Refacciones es solo bodega.
  return "Balance del avión · Gastos indirectos";
}
