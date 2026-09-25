"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ItemFormDialog } from "./item-form-dialog";
import type { InventarioItem, InventarioUbicacion } from "@/types/inventory";

/**
 * «Editar» de la cabecera de la ficha del producto (25-sep-2026). Abre el
 * MISMO `ItemFormDialog` de la lista en modo edición — NO el menú de
 * `ItemActions`, que además trae «Salida» (duplicada con «Registrar
 * movimiento») y «Desactivar». Tras guardar, `router.refresh()` repinta la
 * cabecera (nombre, descripción, ubicación).
 */
export function ItemEditButton({
  item,
  categorias,
  ubicaciones,
  margenVentaPct,
}: {
  /** El producto SIN su cardex (no hace falta serializarlo al cliente). */
  item: InventarioItem;
  categorias?: string[];
  ubicaciones?: InventarioUbicacion[] | null;
  margenVentaPct?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="cursor-pointer gap-2" onClick={() => setOpen(true)}>
        <PencilIcon className="h-4 w-4" aria-hidden="true" />
        Editar
      </Button>
      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        initialItem={item}
        categorias={categorias}
        ubicaciones={ubicaciones}
        margenVentaPct={margenVentaPct}
        onGuardado={() => router.refresh()}
      />
    </>
  );
}
