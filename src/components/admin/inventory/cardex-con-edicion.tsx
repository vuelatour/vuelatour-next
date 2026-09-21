"use client";

import { useState } from "react";
import { CardexTable } from "./cardex-table";
import {
  EditarCostoDialog,
  type MovimientoCostoEditable,
} from "./editar-costo-dialog";
import {
  EliminarMovimientoDialog,
  type MovimientoEliminable,
} from "./eliminar-movimiento-dialog";
import type { InventarioMovimiento } from "@/types/inventory";

interface CardexConEdicionProps {
  itemId: string;
  itemNombre: string;
  unidad?: string | null;
  movimientos: InventarioMovimiento[];
  /** ADMIN/MECANICO (mismo rol del PATCH del API): habilita "Editar costo". */
  puedeEditarCosto: boolean;
  /**
   * SOLO ADMIN (mismo rol del DELETE del API) y solo si el API desplegado
   * conoce la baja: habilita el bote de "Eliminar movimiento".
   */
  puedeEliminar?: boolean;
}

/**
 * Cardex del detalle del ítem + los diálogos de fila: corregir el costo de
 * una ENTRADA (la carga masiva dejó entradas a $0 que el cliente completa con
 * el precio real) y ELIMINAR un movimiento con justificación (21-sep-2026).
 * El wrapper cliente solo carga el estado de los diálogos; la tabla sigue
 * siendo la misma CardexTable.
 */
export function CardexConEdicion({
  itemId,
  itemNombre,
  unidad,
  movimientos,
  puedeEditarCosto,
  puedeEliminar = false,
}: CardexConEdicionProps) {
  const [editando, setEditando] = useState<MovimientoCostoEditable | null>(null);
  const [eliminando, setEliminando] = useState<MovimientoEliminable | null>(null);

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
        onEliminar={
          puedeEliminar
            ? (m) => setEliminando({ id: m.id, itemId, itemNombre, unidad })
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
      {/* `key` por movimiento: cada baja arranca con su motivo en blanco y su
          propia vista previa — jamás se hereda lo escrito para otra fila. */}
      {eliminando && (
        <EliminarMovimientoDialog
          key={eliminando.id}
          open
          onOpenChange={(o) => {
            if (!o) setEliminando(null);
          }}
          movimiento={eliminando}
        />
      )}
    </>
  );
}
