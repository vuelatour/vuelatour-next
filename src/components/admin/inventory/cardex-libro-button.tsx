"use client";

import { useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { descargarDelApi } from "@/lib/download";

/** Nombre de archivo legible a partir del nombre del ítem. */
function slug(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "item"
  );
}

/**
 * Descarga el cardex del ítem en Excel (18-oct-2026, API 0.0.92): la lista
 * de movimientos por fecha (entradas, salidas y existencia) y el «Resumen
 * por mes» con el stock al inicio del mes, las unidades vendidas y el stock
 * al final del mes. Mismo patrón de descarga con Bearer que el reporte de
 * conciliación (fuente única: descargarDelApi).
 */
export function CardexLibroButton({
  itemId,
  itemNombre,
}: {
  itemId: string;
  itemNombre: string;
}) {
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    const error = await descargarDelApi(
      `/v1/inventory/items/${itemId}/cardex-libro.xlsx`,
      { filename: `cardex-libro-${slug(itemNombre)}.xlsx` },
    );
    setLoading(false);
    if (error) toast.error(error);
  };

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={descargar}
      disabled={loading}
      title="Excel del cardex: los movimientos por fecha y el resumen por mes (stock al inicio, unidades vendidas y stock al final)."
    >
      <TableCellsIcon className="h-4 w-4" />
      {loading ? "Generando…" : "Cardex (Excel)"}
    </Button>
  );
}
