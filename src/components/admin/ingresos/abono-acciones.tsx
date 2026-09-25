"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PlusCircleIcon,
  SparklesIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clasificarAbonoAction } from "@/app/admin/ingresos/actions";
import {
  RegistrarIngresoDialog,
  type CatalogosIngreso,
} from "@/components/admin/ingresos/registrar-ingreso-dialog";
import { CobroDesdeAbonoDialog } from "@/components/admin/ingresos/cobro-desde-abono-dialog";
import { VincularAbonoDialog } from "@/components/admin/ingresos/vincular-abono-dialog";
import { SugerenciasAbonosDialog } from "@/components/admin/ingresos/sugerencias-abonos-dialog";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import type { AbonoPendiente } from "@/types/ingresos";

type Accion =
  | "vincular"
  | "cobro"
  | "anticipo"
  | "otro"
  | "traspaso"
  | "reverso"
  | "ia"
  | null;

/**
 * Menú de un ABONO sin identificar («Por conciliar»), en el orden de lo más
 * frecuente y seguro primero: ligarlo a lo que ya existe, registrar el cobro
 * del vuelo que falta, anticipo, otro ingreso, y las dos cosas que NO son
 * ingreso (traspaso, reverso). Los diálogos se montan solo al abrirlos.
 */
export function AbonoAcciones({
  abono,
  catalogos,
  cuentasIa,
}: {
  abono: AbonoPendiente;
  catalogos: CatalogosIngreso;
  cuentasIa: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion>(null);
  const [pending, start] = useTransition();
  const cerrar = (o: boolean) => {
    if (!o) setAccion(null);
  };

  const clasificar = (tipo: "TRASPASO" | "REVERSO") => {
    start(async () => {
      const r = await clasificarAbonoAction(abono.id, tipo);
      if (r.ok) {
        toast.success(
          tipo === "TRASPASO"
            ? "Clasificado como traspaso entre cuentas"
            : "Clasificado como reverso de un cargo",
        );
        setAccion(null);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo clasificar");
      }
    });
  };

  const monto = fmtMonto(abono.monto, abono.cuenta_moneda ?? undefined);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">¿Qué es este abono?</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-72">
          <DropdownMenuItem onClick={() => setAccion("vincular")} className="cursor-pointer gap-2">
            <LinkIcon className="h-4 w-4" />
            Vincular a un cobro o ingreso
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAccion("cobro")} className="cursor-pointer gap-2">
            <PaperAirplaneIcon className="h-4 w-4" />
            Es el pago de un vuelo (registrar su cobro)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAccion("anticipo")} className="cursor-pointer gap-2">
            <ClockIcon className="h-4 w-4" />
            Es un anticipo (el vuelo aún no existe)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAccion("otro")} className="cursor-pointer gap-2">
            <PlusCircleIcon className="h-4 w-4" />
            Registrar como otro ingreso
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAccion("traspaso")} className="cursor-pointer gap-2">
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Es un traspaso entre cuentas
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAccion("reverso")} className="cursor-pointer gap-2">
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Es el reverso de un cargo
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAccion("ia")} className="cursor-pointer gap-2">
            <SparklesIcon className="h-4 w-4" />
            Sugerir con IA
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {accion === "vincular" && <VincularAbonoDialog abono={abono} open onOpenChange={cerrar} />}
      {accion === "cobro" && <CobroDesdeAbonoDialog abono={abono} open onOpenChange={cerrar} />}
      {(accion === "anticipo" || accion === "otro") && (
        <RegistrarIngresoDialog
          {...catalogos}
          open
          onOpenChange={cerrar}
          abono={abono}
          forzarCategoria={accion === "anticipo" ? "ANTICIPO_CLIENTE" : null}
        />
      )}
      {accion === "ia" && (
        <SugerenciasAbonosDialog
          open
          onOpenChange={cerrar}
          movimientoIds={[abono.id]}
          cuentas={cuentasIa}
          abonos={[abono]}
          catalogos={catalogos}
        />
      )}

      <AlertDialog open={accion === "traspaso" || accion === "reverso"} onOpenChange={cerrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accion === "traspaso" ? "¿Es un traspaso entre cuentas?" : "¿Es el reverso de un cargo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Abono de ${monto} del ${fmtDateOnly(abono.fecha)}. `}
              {accion === "traspaso"
                ? "Dinero que pasó de una cuenta propia a otra: NO es un ingreso. Queda conciliado como «Traspaso entre cuentas»."
                : "El banco devolvió un cargo anterior: NO es un ingreso. Queda conciliado como «Reverso de un cargo»."}
              {" "}Se puede quitar desde Conciliación si fue un error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clasificar(accion === "traspaso" ? "TRASPASO" : "REVERSO");
              }}
              disabled={pending}
            >
              {pending ? "Clasificando…" : "Sí, clasificar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
