"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ItemFormDialog } from "./item-form-dialog";
import type { InventarioUbicacion } from "@/types/inventory";

export function ItemCreateButton({
  categorias,
  ubicaciones,
  margenVentaPct,
}: {
  categorias?: string[];
  /** Catálogo de ubicaciones; null/ausente = input de texto de siempre. */
  ubicaciones?: InventarioUbicacion[] | null;
  /** Margen de la tienda (solo textos del formulario). */
  margenVentaPct?: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo ítem
      </Button>
      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        categorias={categorias}
        ubicaciones={ubicaciones}
        margenVentaPct={margenVentaPct}
      />
    </>
  );
}
