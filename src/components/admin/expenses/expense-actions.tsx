"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsRightLeftIcon,
  CheckBadgeIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  ShoppingCartIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteGastoAction,
  dismissDuplicadoAction,
  vistoBuenoGastoAction,
} from "@/app/admin/expenses/actions";
import { createCompraAction } from "@/app/admin/inventory/compras/actions";
import { ExpenseVerifyDialog } from "./expense-verify-dialog";
import { RepartoDialog } from "./reparto-dialog";
import { CompraLinkDialog } from "./compra-link-dialog";
import { esCategoriaCompra } from "@/types/compras";
// Fuente única sincronizada con el API: antes un Set local sin
// GASOLINA/VISITA escondía el menú "Repartir" para esas categorías.
import { CATEGORIAS_REPARTIBLES } from "@/lib/admin/categorias-gasto";
import type { Gasto } from "@/types/expenses";

interface ExpenseActionsProps {
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** URL firmada de la foto del comprobante (bucket privado), si tiene. */
  fotoUrl?: string;
}

export function ExpenseActions({ gasto, aircraft, providers, fotoUrl }: ExpenseActionsProps) {
  const router = useRouter();
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openReparto, setOpenReparto] = useState(false);
  const [openCrearCompra, setOpenCrearCompra] = useState(false);
  const [openLigarCompra, setOpenLigarCompra] = useState(false);
  const [pending, startTransition] = useTransition();

  const repartible =
    !gasto.vuelo_id && CATEGORIAS_REPARTIBLES.has(gasto.categoria);
  const enCompra = !!gasto.compra_id;
  // Misma regla que la casilla "Unir en compra" (fuente única en types/compras).
  const compraPosible = !enCompra && esCategoriaCompra(gasto.categoria);

  const dismiss = () => {
    startTransition(async () => {
      const r = await dismissDuplicadoAction(gasto.id);
      if (r.ok) toast.success("Marcado como no duplicado");
      else toast.error(r.error ?? "Error");
    });
  };

  const darVistoBueno = () => {
    startTransition(async () => {
      const r = await vistoBuenoGastoAction(gasto.id);
      if (r.ok) toast.success("Visto bueno registrado");
      else toast.error(r.error ?? "Error");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const r = await deleteGastoAction(gasto.id);
      if (r.ok) {
        toast.success("Gasto eliminado");
        setOpenDelete(false);
      } else {
        toast.error(r.error ?? "Error al eliminar");
      }
    });
  };

  /** Este gasto ES la factura de mercancía: nace la compra y se abre. */
  const crearCompra = () => {
    startTransition(async () => {
      const r = await createCompraAction({ gasto_mercancia_id: gasto.id });
      if (r.ok && r.data) {
        toast.success(`Compra #${r.data.folio} creada`);
        setOpenCrearCompra(false);
        router.push(`/admin/inventory/compras/${r.data.id}`);
      } else {
        toast.error(r.error ?? "No se pudo crear la compra");
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
          {gasto.requiere_visto_bueno === true && (
            <DropdownMenuItem onClick={darVistoBueno} className="gap-2">
              <CheckBadgeIcon className="h-4 w-4" />
              Dar visto bueno (prellenado IA)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Verificar / editar
          </DropdownMenuItem>
          {enCompra && gasto.compra && (
            <DropdownMenuItem
              onClick={() => router.push(`/admin/inventory/compras/${gasto.compra!.id}`)}
              className="gap-2"
            >
              <ShoppingCartIcon className="h-4 w-4" />
              Ver compra #{gasto.compra.folio}
            </DropdownMenuItem>
          )}
          {compraPosible && (
            <>
              <DropdownMenuItem onClick={() => setOpenCrearCompra(true)} className="gap-2">
                <ShoppingCartIcon className="h-4 w-4" />
                Crear compra con esta factura
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenLigarCompra(true)} className="gap-2">
                <ShoppingCartIcon className="h-4 w-4" />
                Agregar a una compra abierta
              </DropdownMenuItem>
            </>
          )}
          {repartible && (
            <DropdownMenuItem onClick={() => setOpenReparto(true)} className="gap-2">
              <ArrowsRightLeftIcon className="h-4 w-4" />
              Repartir entre aviones
            </DropdownMenuItem>
          )}
          {gasto.duplicado_sospechado && (
            <DropdownMenuItem onClick={dismiss} className="gap-2">
              <CheckBadgeIcon className="h-4 w-4" />
              No es duplicado
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setOpenDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExpenseVerifyDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        gasto={gasto}
        aircraft={aircraft}
        providers={providers}
        fotoUrl={fotoUrl}
      />

      {repartible && (
        <RepartoDialog
          open={openReparto}
          onOpenChange={setOpenReparto}
          gasto={{
            id: gasto.id,
            categoria: gasto.categoria,
            monto: Number(gasto.monto),
            moneda: gasto.moneda,
            fecha_gasto: gasto.fecha_gasto,
            descripcion:
              [
                (gasto.notas ?? "").split("\n")[0].trim() || null,
                gasto.proveedor?.nombre ?? null,
              ]
                .filter(Boolean)
                .join(" · ") || null,
          }}
        />
      )}

      {compraPosible && (
        <CompraLinkDialog
          open={openLigarCompra}
          onOpenChange={setOpenLigarCompra}
          gasto={gasto}
        />
      )}

      <AlertDialog open={openCrearCompra} onOpenChange={setOpenCrearCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear una compra con esta factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Este gasto queda como la factura de MERCANCÍA de una compra nueva. En la compra
              capturas las refacciones y ligas el envío y los impuestos cuando lleguen; al
              recibirla en bodega entra cada pieza con su costo real.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                crearCompra();
              }}
              disabled={pending}
            >
              {pending ? "Creando…" : "Crear compra"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se borra el registro del gasto.
              {enCompra && " Deja de contar en su compra."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
