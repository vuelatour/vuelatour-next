import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_ACCION,
  TEXTO_COMPRA_COMPLETA,
  accionSiguiente,
  pasosCompra,
  type EstadoPaso,
} from "@/lib/admin/compras-estado";
import type { CompraDetalle } from "@/types/compras";

const ICONO: Record<EstadoPaso, { Icono: React.ComponentType<{ className?: string }>; clase: string }> = {
  hecho: { Icono: CheckCircleIcon, clase: "text-emerald-600" },
  pendiente: { Icono: ClockIcon, clase: "text-muted-foreground" },
  atencion: { Icono: ExclamationTriangleIcon, clase: "text-amber-600" },
};

/**
 * La línea de pasos de la compra (21-oct-2026): Registrada → Recibida en
 * bodega → Gasto registrado, con el estado de cada uno y qué sigue. Los
 * estados los manda el API (`gasto_estado`, `recibida_at`); aquí solo se
 * pintan (`pasosCompra`, puro).
 */
export function CompraPasos({ compra }: { compra: CompraDetalle }) {
  const pasos = pasosCompra(compra);
  const siguiente = accionSiguiente(pasos);
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3" data-pasos-compra>
          {pasos.map((p, i) => {
            const { Icono, clase } = ICONO[p.estado];
            return (
              <li key={p.clave} className="flex items-start gap-2" data-paso={p.clave} data-estado={p.estado}>
                <Icono className={cn("mt-0.5 h-5 w-5 shrink-0", clase)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {i + 1}. {p.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.detalle}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs" data-siguiente={siguiente ?? "completa"}>
          {siguiente ? (
            <>
              <span className="font-medium">Sigue:</span> {ETIQUETA_ACCION[siguiente]}.
            </>
          ) : (
            <span className="text-emerald-600">{TEXTO_COMPRA_COMPLETA}</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
