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
import type { Gasto } from "@/types/expenses";

export type EstatusFacturacion = "PENDIENTE" | "SOLICITADA" | "FACTURADA";

/** Estados del seguimiento de facturación de oficina, con su semáforo. */
export const FACTURACION_ESTADOS: Array<{
  value: EstatusFacturacion;
  label: string;
  dot: string;
}> = [
  { value: "PENDIENTE", label: "Pendiente", dot: "bg-red-500" },
  { value: "SOLICITADA", label: "Solicitada", dot: "bg-amber-400" },
  { value: "FACTURADA", label: "Facturada", dot: "bg-emerald-500" },
];

const PILL_STYLE: Record<string, string> = {
  PENDIENTE: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  SOLICITADA:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  FACTURADA:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

/**
 * ¿Ya facturamos este gasto? Semáforo de OFICINA — independiente del
 * comprobante que entregó el piloto (ese no se toca): 🔴 Pendiente →
 * 🟡 Solicitada → 🟢 Facturada. Clic abre el menú de estados; sin
 * confirmación porque es reversible con el mismo control.
 */
export function FacturacionBadge({ gasto }: { gasto: Gasto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Gastos previos a la migración pueden venir sin el campo: se pintan
  // Pendiente (el arranque es conservador a propósito — jamás afirmar
  // "facturado" en falso).
  const actual = (gasto.estatus_facturacion as EstatusFacturacion) ?? "PENDIENTE";
  const info =
    FACTURACION_ESTADOS.find((e) => e.value === actual) ?? FACTURACION_ESTADOS[0];

  const marcar = (estatus: EstatusFacturacion) => {
    if (estatus === actual) return;
    startTransition(async () => {
      const res = await marcarFacturacionAction(gasto.id, estatus);
      if (res.ok) {
        const label = FACTURACION_ESTADOS.find((e) => e.value === estatus)?.label;
        toast.success(`Facturación: ${label}`);
        router.refresh();
      } else {
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
          (PILL_STYLE[actual] ?? PILL_STYLE.PENDIENTE)
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
