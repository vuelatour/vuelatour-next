import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { estiloEstadoCuenta } from "@/lib/admin/reparto-pagos";

/**
 * Estado de la cuenta de un socio (Al corriente · Por entregar · Adelantado).
 * El estado lo manda el API; etiqueta y color salen de la fuente única
 * `lib/admin/reparto-pagos.ts`.
 */
export function EstadoCuentaBadge({
  estado,
  saldoUsd,
  className,
}: {
  estado: string | null | undefined;
  saldoUsd: number;
  className?: string;
}) {
  const e = estiloEstadoCuenta(estado, saldoUsd);
  return (
    <Badge
      variant="outline"
      className={cn(e.clase, className)}
      title={e.titulo}
      data-estado-cuenta={e.estado}
    >
      {e.etiqueta}
    </Badge>
  );
}
