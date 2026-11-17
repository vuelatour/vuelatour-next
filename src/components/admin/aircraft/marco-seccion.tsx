import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Marco EMBEBIBLE de una card del expediente del avión (17-nov-2026).
 *
 * La card «Mantenimiento» junta en un solo lugar piezas que antes eran cards
 * sueltas (tacómetros, discrepancias). Para no reescribirlas, su marco pasa
 * por aquí: con `embebido` el `Card` se vuelve una sección SIN borde ni
 * relleno propio (lo pone la card que la contiene) y el título baja de tamaño;
 * sin `embebido` el marcado es EXACTAMENTE el `Card` de siempre.
 */
type MarcoProps = React.ComponentProps<"div"> & { embebido?: boolean };

/** `Card` o, embebido, un bloque sin marco. */
export function Marco({ embebido = false, className, ...props }: MarcoProps) {
  return embebido ? (
    <div data-marco="embebido" className="flex flex-col gap-4" {...props} />
  ) : (
    <Card className={className} {...props} />
  );
}

/** `CardHeader` o, embebido, la misma fila sin el relleno lateral. */
export function MarcoEncabezado({ embebido = false, className, ...props }: MarcoProps) {
  return embebido ? (
    <div
      className="flex flex-row items-start justify-between gap-2"
      {...props}
    />
  ) : (
    <CardHeader className={className} {...props} />
  );
}

/** `CardTitle` o, embebido, un subtítulo de sección. */
export function MarcoTitulo({ embebido = false, className, ...props }: MarcoProps) {
  return embebido ? (
    <h3
      className="flex items-center gap-2 text-sm font-semibold leading-snug"
      {...(props as React.ComponentProps<"h3">)}
    />
  ) : (
    <CardTitle className={className} {...props} />
  );
}

/** `CardDescription` o, embebido, el mismo texto de apoyo en chico. */
export function MarcoDescripcion({ embebido = false, className, ...props }: MarcoProps) {
  return embebido ? (
    <div className="text-xs text-muted-foreground" {...props} />
  ) : (
    <CardDescription className={className} {...props} />
  );
}

/** `CardContent` o, embebido, el contenido sin relleno lateral. */
export function MarcoContenido({ embebido = false, className, ...props }: MarcoProps) {
  return embebido ? (
    // Embebido se conserva solo el espaciado vertical que pidiera la card.
    <div className={cn(soloEspaciado(className))} {...props} />
  ) : (
    <CardContent className={className} {...props} />
  );
}

/** Deja pasar únicamente las clases `space-y-*` (el relleno lo pone el contenedor). */
function soloEspaciado(className?: string): string {
  return (className ?? "")
    .split(/\s+/)
    .filter((c) => c.startsWith("space-y-"))
    .join(" ");
}
