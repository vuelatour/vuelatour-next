"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { AirportFormDialog } from "./airport-form-dialog";
import type { Airport } from "@/types/airports";

/**
 * Alta de aeropuerto SIN salir del flujo (cotizador / vuelo operativo).
 * Pedido del cliente (28-ago): si el destino no estaba en el catálogo, la
 * oficina tenía que ir a Admin→Aeropuertos, crearlo y volver a empezar.
 * Reutiliza el MISMO diálogo y validación del catálogo; quien lo abre agrega
 * el aeropuerto a su lista local con `onCreated` (sin recargar).
 */
export function AirportQuickCreateButton({
  iata,
  onCreated,
  className,
  children,
}: {
  /** IATA prellenado (p. ej. el código desconocido de la ruta rápida). */
  iata?: string;
  onCreated: (airport: Airport) => void;
  className?: string;
  /** Texto del botón; por default "+ Nuevo aeropuerto". */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600",
          className,
        )}
      >
        {children ?? (
          <>
            <PlusIcon className="h-3 w-3" />
            Nuevo aeropuerto
          </>
        )}
      </button>
      <AirportFormDialog
        open={open}
        onOpenChange={setOpen}
        initialIata={iata}
        onCreated={onCreated}
      />
    </>
  );
}
