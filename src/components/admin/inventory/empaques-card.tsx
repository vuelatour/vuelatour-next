"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  ArchiveBoxIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  PlusIcon,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/form-field";
import {
  createEmpaqueAction,
  deleteEmpaqueAction,
  updateEmpaqueAction,
} from "@/app/admin/inventory/actions";
import { normalizarCodigo } from "@/app/admin/inventory/schema";
import type { InventarioEmpaque } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

interface EmpaquesCardProps {
  itemId: string;
  itemNombre: string;
  /** Código de barras de la UNIDAD: un empaque nunca puede repetirlo. */
  itemCodigo: string | null;
  unidad?: string | null;
  empaques: InventarioEmpaque[];
}

/**
 * Card "Empaques" de la ficha del ítem: cajas/presentaciones con su factor
 * (unidades por empaque) y su propio código de barras. Alta, edición,
 * activar/desactivar y borrado (con confirmación; si ya tiene movimientos el
 * API responde 409 y se ofrece desactivar).
 */
export function EmpaquesCard({ itemId, itemNombre, itemCodigo, unidad, empaques }: EmpaquesCardProps) {
  const [openForm, setOpenForm] = useState(false);
  const [editando, setEditando] = useState<InventarioEmpaque | null>(null);
  const [aBorrar, setABorrar] = useState<InventarioEmpaque | null>(null);
  const [aDesactivar, setADesactivar] = useState<InventarioEmpaque | null>(null);
  const [pending, startTransition] = useTransition();
  const etiquetaUnidad = unidad?.trim() || "unidades";

  const borrar = () => {
    if (!aBorrar) return;
    const emp = aBorrar;
    startTransition(async () => {
      const res = await deleteEmpaqueAction(itemId, emp.id);
      if (res.ok) {
        toast.success(`Empaque «${emp.nombre}» eliminado`);
        setABorrar(null);
        return;
      }
      if (res.status === 409) {
        toast.error(`«${emp.nombre}» ya tiene movimientos en el cardex`, {
          description: "No se puede borrar; desactívalo para que ya no se use.",
          action: {
            label: "Desactivar",
            onClick: () => cambiarActivo(emp, false),
          },
        });
        setABorrar(null);
        return;
      }
      toast.error(res.error ?? "No se pudo eliminar el empaque");
    });
  };

  const cambiarActivo = (emp: InventarioEmpaque, activo: boolean) => {
    startTransition(async () => {
      const res = await updateEmpaqueAction(itemId, emp.id, { activo });
      if (res.ok) {
        toast.success(activo ? `«${emp.nombre}» reactivado` : `«${emp.nombre}» desactivado`);
        setADesactivar(null);
      } else {
        toast.error(res.error ?? "No se pudo actualizar el empaque");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Empaques (cajas)</CardTitle>
          <CardDescription>
            Presentaciones con su propio código de barras. Al escanear la caja, el movimiento se
            rebaja en {etiquetaUnidad}.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => {
            setEditando(null);
            setOpenForm(true);
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Agregar empaque
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {empaques.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            <ArchiveBoxIcon className="h-6 w-6 shrink-0" />
            Sin empaques. Si el producto también se maneja por caja (p. ej. caja de 6 botellas),
            agrégala con cuántas unidades trae y su código de barras.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {empaques.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <ArchiveBoxIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium flex items-center gap-2">
                    {e.nombre}
                    {!e.activo && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Inactivo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {num(Number(e.factor))} {etiquetaUnidad} por empaque
                    {e.codigo ? (
                      <>
                        {" · "}
                        <span className="font-mono">{e.codigo}</span>
                      </>
                    ) : (
                      " · sin código de barras"
                    )}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <EllipsisHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">Acciones</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => {
                        setEditando(e);
                        setOpenForm(true);
                      }}
                    >
                      <PencilIcon className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    {e.activo ? (
                      <DropdownMenuItem className="gap-2" onClick={() => setADesactivar(e)}>
                        <ArchiveBoxIcon className="h-4 w-4" />
                        Desactivar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="gap-2" onClick={() => cambiarActivo(e, true)}>
                        <ArchiveBoxIcon className="h-4 w-4" />
                        Reactivar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="gap-2 text-destructive focus:text-destructive"
                      onClick={() => setABorrar(e)}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <EmpaqueFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        itemId={itemId}
        itemNombre={itemNombre}
        itemCodigo={itemCodigo}
        unidad={etiquetaUnidad}
        empaque={editando}
        otros={empaques.filter((e) => e.id !== editando?.id)}
      />

      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{aBorrar?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita el empaque de {itemNombre}. Si ya se usó en algún movimiento, no se
              puede borrar: se te ofrecerá desactivarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                borrar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aDesactivar} onOpenChange={(o) => !o && setADesactivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar «{aDesactivar?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de ofrecerse al capturar movimientos y su código de barras ya no abre este
              ítem. El cardex histórico queda intacto. Se puede reactivar después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                if (aDesactivar) cambiarActivo(aDesactivar, false);
              }}
              disabled={pending}
            >
              {pending ? "Desactivando…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type EmpaqueFormValues = { nombre: string; factor: string; codigo: string };

function EmpaqueFormDialog({
  open,
  onOpenChange,
  itemId,
  itemNombre,
  itemCodigo,
  unidad,
  empaque,
  otros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: string;
  itemNombre: string;
  itemCodigo: string | null;
  unidad: string;
  /** null = alta. */
  empaque: InventarioEmpaque | null;
  /** Los demás empaques del ítem (para no repetir códigos). */
  otros: InventarioEmpaque[];
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!empaque;
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<EmpaqueFormValues>({ defaultValues: defaults(empaque) });

  useEffect(() => {
    if (open) reset(defaults(empaque));
  }, [open, empaque, reset]);

  const factor = Number(watch("factor"));

  const onSubmit = handleSubmit((values) => {
    const codigo = normalizarCodigo(values.codigo);
    if (codigo && itemCodigo && codigo === normalizarCodigo(itemCodigo)) {
      toast.error("El código del empaque no puede ser el mismo que el de la unidad.");
      return;
    }
    if (codigo && otros.some((o) => o.codigo && normalizarCodigo(o.codigo) === codigo)) {
      toast.error(`El código ${codigo} ya lo tiene otro empaque de este ítem.`);
      return;
    }
    startTransition(async () => {
      const res = isEdit
        ? await updateEmpaqueAction(itemId, empaque!.id, {
            nombre: values.nombre.trim(),
            factor: values.factor,
            codigo: values.codigo,
          })
        : await createEmpaqueAction(itemId, {
            nombre: values.nombre.trim(),
            factor: values.factor,
            codigo: values.codigo,
          });
      if (res.ok) {
        toast.success(isEdit ? "Empaque actualizado" : "Empaque agregado");
        onOpenChange(false);
      } else if (res.fieldErrors) {
        const k = Object.keys(res.fieldErrors)[0];
        toast.error(`${k}: ${res.fieldErrors[k]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(res.error ?? "No se pudo guardar el empaque");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar empaque" : "Nuevo empaque"}</DialogTitle>
          <DialogDescription>
            {itemNombre} · un movimiento por empaque rebaja «unidades por empaque» × cantidad.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Caja de 6" {...register("nombre", { required: "Requerido" })} />
          </Field>
          <Field
            label={`Unidades por empaque (${unidad})`}
            required
            hint={factor > 0 ? `1 empaque = ${num(factor)} ${unidad}` : "Cuántas unidades trae"}
            error={errors.factor?.message}
          >
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="6"
              {...register("factor", {
                required: "Requerido",
                validate: (v) => Number(v) > 0 || "Debe ser mayor a 0",
              })}
            />
          </Field>
          <Field
            label="Código de barras del empaque"
            hint="El impreso en la caja (ITF-14 / GTIN), sin espacios. Distinto al de la unidad."
            error={errors.codigo?.message}
          >
            <Input
              placeholder="00021400062160"
              inputMode="numeric"
              className="font-mono"
              {...register("codigo")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar empaque"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaults(e: InventarioEmpaque | null): EmpaqueFormValues {
  return {
    nombre: e?.nombre ?? "",
    factor: e ? String(e.factor) : "",
    codigo: e?.codigo ?? "",
  };
}
