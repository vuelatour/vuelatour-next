"use client";

import { useMemo, useState, useTransition } from "react";
import { LinkIcon, EllipsisHorizontalIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buscarCobrosCandidatosAction,
  linkMovimientoAction,
  linkMovimientoCobroAction,
} from "@/app/admin/conciliacion/actions";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import type { CobroCandidato, MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string | number) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });

interface MovimientoActionsProps {
  movimiento: MovimientoBancario;
  gastos: { value: string; label: string }[];
}

/**
 * Acciones de conciliación manual de un movimiento bancario.
 * CARGO ↔ gasto (opciones precargadas por la página) y
 * ABONO ↔ cobro de vuelo (candidatos buscados al abrir el diálogo,
 * ordenados por cercanía de monto y fecha). Mismo diálogo para ambos.
 */
export function MovimientoActions({ movimiento, gastos }: MovimientoActionsProps) {
  const esAbono = movimiento.tipo === "ABONO";
  const [openLink, setOpenLink] = useState(false);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  // null = buscando; lista = resultado (solo aplica a ABONOS).
  const [candidatos, setCandidatos] = useState<CobroCandidato[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Qué tiene vinculado realmente el movimiento (manda sobre el tipo al
  // desvincular, por si un dato viejo quedó cruzado distinto).
  const vinculadoACobro = movimiento.cobro_id != null;

  const abrirVincular = () => {
    setSeleccion("");
    setOpenLink(true);
    if (!esAbono) return;
    // El API no expone un listado global de cobros: se buscan candidatos
    // cercanos al abrir (vuelos ±60 días → sus cobros bancarios).
    setCandidatos(null);
    void buscarCobrosCandidatosAction({
      fecha: movimiento.fecha,
      monto: movimiento.monto,
      cuenta_bancaria_id: movimiento.cuenta_bancaria_id,
    }).then((r) => {
      if (r.ok) setCandidatos(r.data ?? []);
      else {
        setCandidatos([]);
        toast.error(r.error ?? "No se pudieron buscar cobros");
      }
    });
  };

  const opcionesCobros = useMemo(
    () =>
      (candidatos ?? []).map((c) => ({
        value: c.id,
        label: `Vuelo #${c.folio ?? "—"} · $${fmtMoney(c.monto)} ${c.moneda} · ${c.metodo_cobro.replaceAll("_", " ")}`,
        description:
          [
            c.cliente,
            fmtDateCancun(c.fecha_cobro),
            c.neto !== Number(c.monto) ? `depósito neto $${fmtMoney(c.neto)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
    [candidatos],
  );

  const desvincular = () => {
    startTransition(async () => {
      const r = vinculadoACobro
        ? await linkMovimientoCobroAction(movimiento.id, null)
        : await linkMovimientoAction(movimiento.id, null);
      if (r.ok) {
        toast.success(vinculadoACobro ? "Cobro desvinculado" : "Gasto desvinculado");
        setConfirmarDesvincular(false);
      } else toast.error(r.error ?? "Error");
    });
  };

  const vincular = () => {
    if (!seleccion) {
      toast.error(esAbono ? "Selecciona un cobro" : "Selecciona un gasto");
      return;
    }
    startTransition(async () => {
      const r = esAbono
        ? await linkMovimientoCobroAction(movimiento.id, seleccion)
        : await linkMovimientoAction(movimiento.id, seleccion);
      if (r.ok) {
        toast.success(esAbono ? "Cobro vinculado" : "Gasto vinculado");
        setOpenLink(false);
        setSeleccion("");
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {movimiento.conciliado ? (
            <DropdownMenuItem
              onClick={() => setConfirmarDesvincular(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <XMarkIcon className="h-4 w-4" />
              {vinculadoACobro ? "Desvincular cobro" : "Desvincular gasto"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={abrirVincular} className="gap-2">
              <LinkIcon className="h-4 w-4" />
              {esAbono ? "Vincular cobro" : "Vincular gasto"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{esAbono ? "Vincular cobro" : "Vincular gasto"}</DialogTitle>
            <DialogDescription>
              {esAbono
                ? `Abono de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el cobro de vuelo que corresponde.`
                : `Cargo de ${fmtMoney(movimiento.monto)} del ${fmtDateOnly(movimiento.fecha)}. Selecciona el gasto capturado que corresponde.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{esAbono ? "Cobro" : "Gasto"}</Label>
            {esAbono && candidatos === null ? (
              <p className="text-sm text-muted-foreground">Buscando cobros cercanos…</p>
            ) : (
              <SearchableSelect
                options={esAbono ? opcionesCobros : gastos}
                value={seleccion}
                onChange={setSeleccion}
                placeholder={esAbono ? "Buscar por folio, cliente o monto" : "Buscar gasto"}
                emptyText={
                  esAbono
                    ? "Sin cobros candidatos cerca de la fecha del abono"
                    : "Sin resultados"
                }
              />
            )}
            {esAbono && (
              <p className="text-xs text-muted-foreground">
                Se muestran cobros por transferencia, HSBC link, BillPocket o cheque de
                vuelos con fecha cercana (±60 días), ordenados por cercanía de monto y
                fecha. Los cobros con comisión bancaria se comparan por el depósito neto.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenLink(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={vincular} disabled={pending}>
              {pending ? "Vinculando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación antes de desvincular (regla permanente del cliente). */}
      <AlertDialog open={confirmarDesvincular} onOpenChange={setConfirmarDesvincular}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {vinculadoACobro ? "¿Desvincular este cobro?" : "¿Desvincular este gasto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento bancario volverá a quedar pendiente de conciliar y el{" "}
              {vinculadoACobro ? "cobro" : "gasto"} quedará libre para vincularse con otro
              movimiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                desvincular();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Desvinculando…" : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
