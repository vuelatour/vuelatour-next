"use client";

import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  edicionDeCobro,
  etiquetaBotonEditarCobro,
  puedeEditarCobro,
  tituloBotonEditarCobro,
} from "@/lib/admin/cobro-edicion";
import type { FlightCobro } from "@/types/flights";

/**
 * «Editar» de UN cobro (26-sep-2026, pedido del cliente sobre la cotización
 * #315: «habilitar una opción para poder editar los cobros»). Lo usan la card
 * de cobros del VUELO y la de la COTIZACIÓN, así que las dos dicen lo mismo.
 *
 * - Solo ADMIN/FACTURACION (los roles del `PATCH` del API): a otro rol no se
 *   le enseña un botón que respondería 403.
 * - Parte de un SOBRE de grupo ⇒ no se pinta (el API responde 409
 *   COBRO_DE_GRUPO); la card explica que se corrige desde el grupo.
 * - Reembolso, conciliado y anticipo SÍ lo muestran: el formulario abre con
 *   el dinero de solo lectura y dice por qué. El `title` lo adelanta.
 * - Ícono + texto visible «Editar» (la captura del cliente solo tenía
 *   íconos y nadie encontraba cómo corregir) y nombre accesible con el monto.
 */
export function EditarCobroBoton({
  cobro,
  rol,
  onEditar,
  className,
}: {
  cobro: FlightCobro;
  rol: string | null | undefined;
  onEditar: (cobro: FlightCobro) => void;
  className?: string;
}) {
  if (!puedeEditarCobro(rol)) return null;
  const edicion = edicionDeCobro(cobro);
  if (!edicion.ofrecer) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "h-8 cursor-pointer gap-1 px-2 text-xs text-muted-foreground hover:text-foreground",
        className,
      )}
      title={tituloBotonEditarCobro(cobro, edicion)}
      aria-label={etiquetaBotonEditarCobro(cobro)}
      data-accion="editar-cobro"
      onClick={() => onEditar(cobro)}
    >
      <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
      Editar
    </Button>
  );
}
