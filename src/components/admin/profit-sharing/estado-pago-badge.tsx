import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { estiloEstadoPago } from "@/lib/admin/reparto-pagos";

/**
 * Estatus del pago de un socio en el mes (Pendiente · Pago parcial · Pagado ·
 * Sin utilidad). El estado lo manda el API; etiqueta y color salen de la
 * fuente única `lib/admin/reparto-pagos.ts`.
 */
export function EstadoPagoBadge({
  estado,
  utilidadUsd,
  pagadoUsd,
  className,
}: {
  estado: string | null | undefined;
  utilidadUsd: number;
  pagadoUsd: number;
  className?: string;
}) {
  const e = estiloEstadoPago(estado, utilidadUsd, pagadoUsd);
  return (
    <Badge
      variant="outline"
      className={cn(e.clase, className)}
      title={e.titulo}
      data-estado-pago={e.estado}
    >
      {e.etiqueta}
    </Badge>
  );
}
