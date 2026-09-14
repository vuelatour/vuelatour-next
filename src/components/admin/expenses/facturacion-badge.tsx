"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon } from "@heroicons/react/24/outline";
import { marcarFacturacionAction } from "@/app/admin/expenses/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  estadoFacturacion,
  FACTURACION_ESTADOS,
  type EstatusFacturacion,
} from "@/lib/admin/facturacion-estatus";
import type { Gasto } from "@/types/expenses";

// Fuente ÚNICA de estados, etiquetas y colores: @/lib/admin/facturacion-estatus
// (módulo PURO — lo usan también los diálogos, el filtro de Gastos y el
// historial del vuelo, que es Server Component y no puede importar de aquí).

/**
 * ¿Ya facturamos este gasto? Semáforo de OFICINA — independiente del
 * comprobante que entregó el piloto (ese no se toca): 🔴 Pendiente →
 * 🟡 Solicitada → 🟢 Facturada → ⚪ No requiere factura. Clic abre el menú de
 * estados; sin confirmación porque es reversible con el mismo control.
 */
export function FacturacionBadge({ gasto }: { gasto: Gasto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Gastos previos a la migración pueden venir sin el campo: se pintan
  // Pendiente (el arranque es conservador a propósito — jamás afirmar
  // "facturado" en falso).
  const info = estadoFacturacion(gasto.estatus_facturacion);
  const actual = info.value;

  const marcar = (estatus: EstatusFacturacion) => {
    if (estatus === actual) return;
    startTransition(async () => {
      const res = await marcarFacturacionAction(gasto.id, estatus);
      if (res.ok) {
        const label = estadoFacturacion(estatus).label;
        toast.success(`Facturación: ${label}`);
        router.refresh();
      } else {
        // Incluye el 400 «esta opción necesita la migración…» del API cuando
        // NO_FACTURABLE todavía no existe en la BD: se muestra tal cual.
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        title="Seguimiento de facturación de oficina (no toca el comprobante del piloto). Clic para cambiar."
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 " +
          info.pill
        }
      >
        <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
        {pending ? "…" : info.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FACTURACION_ESTADOS.map((e) => (
          <DropdownMenuItem key={e.value} onClick={() => marcar(e.value)}>
            <span className={`mr-2 h-2 w-2 rounded-full ${e.dot}`} />
            {e.label}
            {e.value === actual && <CheckIcon className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
