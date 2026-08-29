"use client";

import { useState } from "react";
import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MovimientoDialog } from "./movimiento-dialog";
import type { InventarioEmpaque } from "@/types/inventory";

interface MovimientoButtonProps {
  itemId: string;
  itemNombre: string;
  unidad?: string | null;
  empaques?: InventarioEmpaque[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Empaque preseleccionado (llegó escaneando el código de la caja). */
  initialEmpaqueId?: string;
  /** Abrir el diálogo al montar (navegación desde el escáner). */
  autoOpen?: boolean;
}

export function MovimientoButton({ initialEmpaqueId, autoOpen, ...props }: MovimientoButtonProps) {
  const [open, setOpen] = useState(!!autoOpen);
  const cerrarOAbrir = (o: boolean) => {
    setOpen(o);
    // Al cerrar el diálogo que abrió el escáner, se limpia `?empaque=` de la
    // URL para que un refresh no lo vuelva a abrir.
    if (!o && autoOpen && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("empaque")) {
        url.searchParams.delete("empaque");
        window.history.replaceState(null, "", url.toString());
      }
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <ArrowsUpDownIcon className="h-4 w-4" />
        Registrar movimiento
      </Button>
      <MovimientoDialog
        open={open}
        onOpenChange={cerrarOAbrir}
        initialEmpaqueId={initialEmpaqueId}
        {...props}
      />
    </>
  );
}
