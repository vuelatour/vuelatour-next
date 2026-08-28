"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ArchiveBoxArrowDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
  deleteCompraAction,
  recibirCompraAction,
} from "@/app/admin/inventory/compras/actions";
import type { CompraDetalle } from "@/types/compras";

type Confirmacion = "recibir" | "recalcular" | "eliminar" | null;

/**
 * Acciones de la compra. Recibir genera las ENTRADAS al inventario con el
 * costo final; sobre una compra recibida, "Recalcular" vuelve a correr el
 * mismo cálculo (cargos ligados después). Todo con confirmación.
 */
export function CompraActions({ compra }: { compra: CompraDetalle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirmacion>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);

  const abierta = compra.estado === "ABIERTA";
  const sinLineas = compra.lineas.length === 0;

  // Cargos sin TC: el API rechaza recibir (400) para no dejar el costo en
  // bodega incompleto; la oficina puede capturar el TC o recibir de todos
  // modos (los cargos sin TC quedan fuera del costo, con aviso).
  const [sinTc, setSinTc] = useState<string | null>(null);
  const recibir = (forzar = false) => {
    startTransition(async () => {
      const r = await recibirCompraAction(compra.id, forzar);
      if (!r.ok && !forzar && /sin tipo de cambio/i.test(r.error ?? "")) {
        setSinTc(r.error ?? "Hay cargos sin tipo de cambio.");
        return;
      }
      if (r.ok && r.data) {
        setConfirm(null);
        toast.success(
          abierta ? "Compra recibida en bodega" : "Costos recalculados",
        );
        if (r.data.resumen.avisos.length > 0) setAvisos(r.data.resumen.avisos);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo procesar la compra");
      }
    });
  };

  const eliminar = () => {
    startTransition(async () => {
      const r = await deleteCompraAction(compra.id);
      if (r.ok) {
        toast.success("Compra eliminada; sus pagos vuelven a ser gastos sueltos");
        setConfirm(null);
        router.push("/admin/inventory/compras");
      } else {
        toast.error(r.error ?? "No se pudo eliminar");
      }
    });
  };

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {abierta ? (
          <>
            <Button
              variant="outline"
              className="gap-2 text-destructive"
              onClick={() => setConfirm("eliminar")}
              disabled={pending}
            >
              <TrashIcon className="h-4 w-4" />
              Eliminar
            </Button>
            <Button
              className="gap-2"
              onClick={() => setConfirm("recibir")}
              disabled={pending || sinLineas}
              title={sinLineas ? "Agrega las líneas de la compra antes de recibirla" : undefined}
            >
              <ArchiveBoxArrowDownIcon className="h-4 w-4" />
              Recibir en bodega
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setConfirm("recalcular")}
            disabled={pending}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Recalcular costos
          </Button>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "recibir" && "¿Recibir la compra en bodega?"}
              {confirm === "recalcular" && "¿Recalcular el costo en bodega?"}
              {confirm === "eliminar" && `¿Eliminar la compra #${compra.folio}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "recibir" &&
                `Se registra una ENTRADA al inventario por cada una de las ${compra.lineas.length} líneas con su costo final (factura + envío e impuestos prorrateados). Después ya no se editan las líneas.`}
              {confirm === "recalcular" &&
                "Las entradas del inventario se actualizan con el costo final vigente (útil si ligaste envío o impuestos después de recibir)."}
              {confirm === "eliminar" &&
                "Se borra la compra y sus líneas. Los pagos ligados NO se borran: vuelven a ser gastos sueltos en la bandeja."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "eliminar") eliminar();
                else recibir(false);
              }}
              disabled={pending}
              className={confirm === "eliminar" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {pending
                ? "Procesando…"
                : confirm === "recibir"
                  ? "Recibir en bodega"
                  : confirm === "recalcular"
                    ? "Recalcular"
                    : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Avisos del API al recibir (sin TC, pagos sin factura…): se muestran
          completos, no en un toast que desaparece. */}
      <Dialog open={avisos !== null} onOpenChange={(o) => !o && setAvisos(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Listo, con avisos</DialogTitle>
            <DialogDescription>
              La operación se completó. Revisa estos puntos:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {(avisos ?? []).map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setAvisos(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={sinTc !== null} onOpenChange={(o) => !o && setSinTc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cargos sin tipo de cambio</AlertDialogTitle>
            <AlertDialogDescription>
              {sinTc} Captura el TC en la compra (o en el gasto del cargo) para
              que el costo en bodega quede completo, o recibe de todos modos:
              esos cargos quedarán fuera del costo y la compra lo avisará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Capturar el TC</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                setSinTc(null);
                recibir(true);
              }}
            >
              Recibir de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
