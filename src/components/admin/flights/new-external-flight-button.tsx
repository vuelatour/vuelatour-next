import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";

/**
 * Un vuelo cubierto por externo también lleva COTIZACIÓN (regla del cliente:
 * sin desglose no se sabe de qué se compone lo que pagó el cliente ni la
 * utilidad real — TUAs, transporte, etc.). Por eso ya no hay captura rápida
 * sin cotización: este acceso abre el cotizador con el switch «Cubierto por
 * operador externo» activo.
 */
export function NewExternalFlightButton() {
  return (
    <Link
      href="/admin/quotes/new?externo=1"
      className={buttonVariants({ variant: "outline" })}
    >
      <PlusIcon className="h-4 w-4" />
      Nuevo vuelo externo
    </Link>
  );
}
