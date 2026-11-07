import type { ReactNode } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@/components/admin/empty-state";
import { TEXTO_SOLO_DIRECCION, TITULO_SOLO_DIRECCION } from "@/lib/admin/roles";

/**
 * Candado de los módulos SOLO DE DIRECCIÓN (6-nov-2026, invariante 122 del
 * API): misma cabecera que la pantalla (kicker + título) y la tarjeta que
 * explica quién sí la ve. Se pinta en lugar de un 404 o de un error del API.
 */
export function PantallaSoloDireccion({
  seccion,
  titulo,
  descripcion,
  children,
}: {
  seccion: string;
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6" data-solo-direccion>
      <div>
        <p className="text-sm text-muted-foreground">{seccion}</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{titulo}</h1>
      </div>
      {children}
      <EmptyState
        icon={LockClosedIcon}
        title={TITULO_SOLO_DIRECCION}
        description={descripcion ?? TEXTO_SOLO_DIRECCION}
      />
    </div>
  );
}
