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
  hoja,
}: {
  categoria: string;
  tieneVuelo: boolean;
  tieneAvion: boolean;
  /** Hoja ya decidida por el diálogo (p. ej. el reparto entre aviones de
   *  «Verificar / editar»): sustituye a `hojaDestinoGasto` y se pinta aunque
   *  no haya vuelo ni avión. */
  hoja?: string | null;
}) {
  const destino = destinoPorDefecto(categoria);
  const conLoElegido = hoja ?? (tieneVuelo || tieneAvion ? hojaDestinoGasto(categoria, tieneVuelo, tieneAvion) : null);
  return (
    <>
      {destino && (
        <span className="block text-green-600 dark:text-green-400">
          Por default: {destino}
        </span>
      )}
      {conLoElegido && (
        <span className="block text-muted-foreground">
          Con lo elegido cae en: {conLoElegido}
        </span>
      )}
    </>
  );
}
