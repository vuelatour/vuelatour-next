"use client";

import { useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { ExpenseVerifyDialog } from "@/components/admin/expenses/expense-verify-dialog";
import type { Gasto } from "@/types/expenses";

/**
 * Botón «Editar» de una línea del historial de gastos del vuelo (pedido del
 * cliente 10-sep-2026): abre el MISMO modal «Verificar / editar» que el menú
 * «…» de la tabla de gastos y de la pantalla Gastos, con el gasto tal como
 * está HOY (el historial solo muestra lo que cambió). Al guardar, el modal
 * refresca la página: la tabla y el historial se actualizan juntos.
 */
export function HistorialGastoEditar({
  gasto,
  aircraft,
  providers,
  fotoUrl,
}: {
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  fotoUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Abrir el gasto para verificarlo o corregirlo (mismo modal que en Gastos)"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        Editar
      </button>
      <ExpenseVerifyDialog
        open={open}
        onOpenChange={setOpen}
        gasto={gasto}
        aircraft={aircraft}
        providers={providers}
        fotoUrl={fotoUrl}
      />
    </>
  );
}
