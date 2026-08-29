"use client";

import { useState } from "react";
import { CardexTable } from "./cardex-table";
import {
  EditarCostoDialog,
  type MovimientoCostoEditable,
} from "./editar-costo-dialog";
import type { InventarioMovimiento } from "@/types/inventory";

interface CardexConEdicionProps {
  itemId: string;
  itemNombre: string;
  unidad?: string | null;
  movimientos: InventarioMovimiento[];
  /** ADMIN/MECANICO (mismo rol del PATCH del API): habilita "Editar costo". */
  puedeEditarCosto: boolean;
}

/**
 * Cardex del detalle del ítem + diálogo para corregir el costo de una
 * ENTRADA (la carga masiva dejó entradas a $0 que el cliente completa con el
 * precio real). El wrapper cliente solo carga el estado del diálogo; la
 * tabla sigue siendo la misma CardexTable.
 */
export function CardexConEdicion({
  itemId,
  itemNombre,
  unidad,
  movimientos,
  puedeEditarCosto,
}: CardexConEdicionProps) {
  const [editando, setEditando] = useState<MovimientoCostoEditable | null>(null);

  return (
    <>
      <CardexTable
        movimientos={movimientos}
        onEditarCosto={
          puedeEditarCosto
            ? (m) =>
                setEditando({
                  id: m.id,
                  itemId,
                  itemNombre,
                  fecha_movimiento: m.fecha_movimiento,
                  cantidad: Number(m.cantidad),
                  referencia: m.referencia,
                  moneda: m.moneda,
                  costo_unitario_usd: Number(m.costo_unitario_usd),
                  costo_unitario_mxn:
                    m.costo_unitario_mxn != null ? Number(m.costo_unitario_mxn) : null,
                  tc_usd_mxn: m.tc_usd_mxn != null ? Number(m.tc_usd_mxn) : null,
                  unidad,
                })
            : undefined
        }
      />
      <EditarCostoDialog
        open={editando != null}
        onOpenChange={(o) => {
          if (!o) setEditando(null);
        }}
        movimiento={editando}
      />
    </>
  );
}
