/**
 * Geometría de rutas (FUENTE ÚNICA): distancia ortodrómica en millas
 * náuticas entre dos coordenadas. La usan el editor de tramos del cotizador
 * y el editor de la plantilla del grupo como RESPALDO cuando ni el catálogo
 * de distancias ni las rutas guardadas conocen el par de aeropuertos.
 */
const EARTH_RADIUS_NM = 3440.065;

/** Distancia great-circle en millas náuticas (sin redondear). */
export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}
