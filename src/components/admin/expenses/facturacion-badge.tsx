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
  etiquetaFacturacionTabla,
  FACTURACION_ESTADOS,
  TITULO_FACTURACION_BADGE,
  type EstatusFacturacion,
} from "@/lib/admin/facturacion-estatus";
import { llamarSinLanzar } from "@/lib/admin/reparto-gasto";
import type { Gasto } from "@/types/expenses";

// Fuente ÚNICA de estados, etiquetas y colores: @/lib/admin/facturacion-estatus
// (módulo PURO — lo usan también los diálogos, el filtro de Gastos y el
// historial del vuelo, que es Server Component y no puede importar de aquí).

/**
 * ¿Ya facturamos este gasto? Semáforo de OFICINA — independiente del
 * comprobante que entregó el piloto (ese no se toca): 🔴 Pendiente →
 * 🟡 Solicitada → 🟢 Facturada → ⚪ No requiere factura. Clic abre el menú de
 * estados; sin confirmación porque es reversible con el mismo control.
 *
 * `compacta` (14-oct-2026, tabla única de Gastos): el pill dice
 * `etiquetaFacturacionTabla` («No requiere» en vez de «No requiere factura»,
 * así la columna no se ensancha) y el title antepone la etiqueta completa. El
 * menú y el filtro siguen con la etiqueta completa. Sin la prop (Gastos del
 * vuelo) la etiqueta y el title son los de siempre. En los dos casos el
 * disparador y los renglones del menú llevan la manita (`cursor-pointer`).
 */
export function FacturacionBadge({ gasto, compacta = false }: { gasto: Gasto; compacta?: boolean }) {
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
      // Sin lanzar: un fallo de transporte (red, deploy) no tumba la tabla
      // al error boundary; se dice en un toast.
      const r = await llamarSinLanzar(() => marcarFacturacionAction(gasto.id, estatus));
      if (!r.ok) {
        toast.error(r.error || "No se pudo actualizar");
        return;
      }
      const res = r.valor;
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
        title={compacta ? `${info.label} · ${TITULO_FACTURACION_BADGE}` : TITULO_FACTURACION_BADGE}
        className={
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 " +
          info.pill
        }
      >
        <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
        {pending ? "…" : compacta ? etiquetaFacturacionTabla(gasto.estatus_facturacion) : info.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FACTURACION_ESTADOS.map((e) => (
          <DropdownMenuItem key={e.value} onClick={() => marcar(e.value)} className="cursor-pointer">
            <span className={`mr-2 h-2 w-2 rounded-full ${e.dot}`} />
            {e.label}
            {e.value === actual && <CheckIcon className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
