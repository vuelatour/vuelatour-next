import { destinoPorDefecto, hojaDestinoGasto } from "@/lib/admin/categorias-gasto";

/**
 * Hint bajo el select de categoría (alta y verificación de gastos), en dos
 * líneas — FUENTE ÚNICA para ambos diálogos:
 * 1) SIEMPRE el destino POR DEFAULT de la categoría, en verde (el mismo texto
 *    que acompaña a la opción dentro del selector);
 * 2) SOLO con vuelo o avión elegidos, la precisión dinámica de a qué hoja del
 *    balance cae con lo elegido (hojaDestinoGasto), en gris.
 * Presentación pura: no cambia ninguna regla de clasificación ni de reparto.
 */
export function CategoriaDestinoHint({
  categoria,
  tieneVuelo,
  tieneAvion,
}: {
  categoria: string;
  tieneVuelo: boolean;
  tieneAvion: boolean;
}) {
  const destino = destinoPorDefecto(categoria);
  return (
    <>
      {destino && (
        <span className="block text-green-600 dark:text-green-400">
          Por default: {destino}
        </span>
      )}
      {(tieneVuelo || tieneAvion) && (
        <span className="block text-muted-foreground">
          Con lo elegido cae en:{" "}
          {hojaDestinoGasto(categoria, tieneVuelo, tieneAvion)}
        </span>
      )}
    </>
  );
}
