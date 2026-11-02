"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon } from "@heroicons/react/24/outline";
import { marcarFacturacionAction } from "@/app/admin/expenses/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  AYUDA_NO_OBTENIDA,
  BOTON_NO_OBTENIDA,
  ETIQUETA_MOTIVO_NO_OBTENIDA,
  MOTIVO_NO_OBTENIDA_MAX,
  PLACEHOLDER_MOTIVO_NO_OBTENIDA,
  TITULO_NO_OBTENIDA,
  estadoFacturacion,
  etiquetaFacturacionTabla,
  FACTURACION_ESTADOS,
  motivoNoObtenidaValido,
  tituloBadgeFacturacion,
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
 * 🟡 Solicitada → 🟢 Facturada → ⚪ No requiere factura → 🟣 No obtenida (con
 * motivo, 2-nov-2026). Clic abre el menú de estados; sin confirmación porque
 * es reversible con el mismo control, salvo «No obtenida», que pide el motivo
 * en un diálogo (y volver a elegirla edita el motivo).
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
  // «No obtenida»: diálogo con el motivo (prellenado si ya lo tenía).
  const [motivoAbierto, setMotivoAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  // Gastos previos a la migración pueden venir sin el campo: se pintan
  // Pendiente (el arranque es conservador a propósito — jamás afirmar
  // "facturado" en falso).
  const info = estadoFacturacion(gasto.estatus_facturacion);
  const actual = info.value;

  const aplicar = (estatus: EstatusFacturacion, nota?: string) => {
    startTransition(async () => {
      // Sin lanzar: un fallo de transporte (red, deploy) no tumba la tabla
      // al error boundary; se dice en un toast.
      const r = await llamarSinLanzar(() =>
        nota === undefined
          ? marcarFacturacionAction(gasto.id, estatus)
          : marcarFacturacionAction(gasto.id, estatus, nota),
      );
      if (!r.ok) {
        toast.error(r.error || "No se pudo actualizar");
        return;
      }
      const res = r.valor;
      if (res.ok) {
        const label = estadoFacturacion(estatus).label;
        toast.success(`Facturación: ${label}`);
        setMotivoAbierto(false);
        router.refresh();
      } else {
        // Incluye el 400 «esta opción necesita la migración…» del API cuando
        // NO_FACTURABLE / NO_OBTENIDA todavía no existen en la BD: tal cual.
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });
  };

  const marcar = (estatus: EstatusFacturacion) => {
    if (estadoFacturacion(estatus).requiereNota) {
      // Siempre abre (aunque ya sea el estatus): editar el motivo.
      setMotivo(gasto.facturacion_nota ?? "");
      setMotivoAbierto(true);
      return;
    }
    if (estatus === actual) return;
    aplicar(estatus);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          title={tituloBadgeFacturacion(gasto, compacta)}
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

      <Dialog open={motivoAbierto} onOpenChange={(o) => !o && setMotivoAbierto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{TITULO_NO_OBTENIDA}</DialogTitle>
            <DialogDescription>{AYUDA_NO_OBTENIDA}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`motivo-no-obtenida-${gasto.id}`} className="text-sm font-medium">
              {ETIQUETA_MOTIVO_NO_OBTENIDA}
            </label>
            <Textarea
              id={`motivo-no-obtenida-${gasto.id}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={PLACEHOLDER_MOTIVO_NO_OBTENIDA}
              maxLength={MOTIVO_NO_OBTENIDA_MAX}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoAbierto(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              disabled={pending || !motivoNoObtenidaValido(motivo)}
              title={!motivoNoObtenidaValido(motivo) ? "Escribe el motivo" : undefined}
              onClick={() => aplicar("NO_OBTENIDA", motivo.trim())}
            >
              {pending ? "Guardando…" : BOTON_NO_OBTENIDA}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
