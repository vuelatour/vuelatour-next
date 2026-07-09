"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  amarrarGastosAction,
  deleteRecibidaAction,
  signRecibidaAction,
  updateRecibidaAction,
} from "@/app/admin/facturas-recibidas/actions";
import type { FacturaRecibida } from "@/types/invoices";

export interface GastoOption {
  id: string;
  label: string;
  monto: number;
  moneda: string;
}

export function RecibidaActions({
  recibida,
  gastos,
}: {
  recibida: FacturaRecibida;
  gastos: GastoOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Una factura puede amparar VARIOS gastos (VIP SAESA: varios aterrizajes).
  const [gastoIds, setGastoIds] = useState<string[]>(
    recibida.gastos?.map((g) => g.id) ?? (recibida.gasto_id ? [recibida.gasto_id] : []),
  );
  const [filtro, setFiltro] = useState("");
  const [categoria, setCategoria] = useState(recibida.categoria_sugerida ?? "");
  const [notas, setNotas] = useState(recibida.notas ?? "");

  const toggle = (id: string) =>
    setGastoIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Los gastos ya amarrados a esta factura pueden no venir en la lista general
  // (p.ej. ya tienen estatus FACTURA); se muestran igual para poder quitarlos.
  const amarrados: GastoOption[] = (recibida.gastos ?? [])
    .filter((g) => !gastos.some((o) => o.id === g.id))
    .map((g) => ({
      id: g.id,
      label: `${g.fecha_gasto ?? ""} · ${g.categoria} · ${Number(g.monto).toLocaleString("es-MX")} ${g.moneda}${g.lugar ? ` · ${g.lugar}` : ""}`,
      monto: Number(g.monto),
      moneda: g.moneda,
    }));
  const opciones = [...amarrados, ...gastos];
  const visibles = filtro
    ? opciones.filter((g) => g.label.toLowerCase().includes(filtro.toLowerCase()))
    : opciones;

  const suma = opciones
    .filter((g) => gastoIds.includes(g.id))
    .reduce((acc, g) => acc + g.monto, 0);
  const totalFactura = recibida.total != null ? Number(recibida.total) : null;
  const cuadra = totalFactura != null && Math.abs(suma - totalFactura) < 0.01;

  const link = () => {
    startTransition(async () => {
      const res = await amarrarGastosAction(recibida.id, gastoIds);
      if (!res.ok) {
        toast.error(res.error ?? "Error");
        return;
      }
      if (categoria !== (recibida.categoria_sugerida ?? "") || notas !== (recibida.notas ?? "")) {
        await updateRecibidaAction(recibida.id, {
          categoria_sugerida: categoria || undefined,
          notas: notas || undefined,
        });
      }
      toast.success(
        gastoIds.length === 0
          ? "Factura desamarrada"
          : `Factura amarrada a ${gastoIds.length} gasto${gastoIds.length === 1 ? "" : "s"}`,
      );
      setLinkOpen(false);
    });
  };

  const descartar = () => {
    startTransition(async () => {
      const res = await updateRecibidaAction(recibida.id, { estado: "DESCARTADA" });
      if (res.ok) toast.success("Factura descartada");
      else toast.error(res.error ?? "Error");
    });
  };

  const descargar = () => {
    if (!recibida.xml_url) return;
    startTransition(async () => {
      const res = await signRecibidaAction(recibida.xml_url!);
      if (res.ok && res.data) window.open(res.data, "_blank");
      else toast.error(res.error ?? "No se pudo descargar");
    });
  };

  const eliminar = () => {
    startTransition(async () => {
      const res = await deleteRecibidaAction(recibida.id);
      if (res.ok) {
        toast.success("Factura eliminada");
        setDeleteOpen(false);
      } else toast.error(res.error ?? "Error");
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
          <DropdownMenuItem onClick={() => setLinkOpen(true)} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Amarrar a gastos
          </DropdownMenuItem>
          {recibida.xml_url && (
            <DropdownMenuItem onClick={descargar} className="gap-2">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Descargar XML
            </DropdownMenuItem>
          )}
          {recibida.estado !== "DESCARTADA" && (
            <DropdownMenuItem onClick={descartar} className="gap-2">
              <XCircleIcon className="h-4 w-4" />
              Descartar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Amarrar factura a gastos</DialogTitle>
            <DialogDescription>
              {recibida.emisor_nombre ?? recibida.emisor_rfc ?? "Proveedor"} ·{" "}
              {recibida.total ?? "—"} {recibida.moneda ?? ""}. Una factura puede amparar
              varios gastos (p.ej. varios aterrizajes); los amarrados quedan con
              comprobante FACTURA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Gastos amparados</Label>
              <Input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Filtra por fecha, categoría, monto o lugar…"
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {visibles.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    Sin gastos que coincidan con el filtro.
                  </p>
                ) : (
                  visibles.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={gastoIds.includes(g.id)}
                        onChange={() => toggle(g.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      <span className="truncate">{g.label}</span>
                    </label>
                  ))
                )}
              </div>
              {gastoIds.length > 0 && (
                <p
                  className={
                    "text-xs " +
                    (totalFactura == null
                      ? "text-muted-foreground"
                      : cuadra
                        ? "text-emerald-600"
                        : "text-amber-600")
                  }
                >
                  Suma de {gastoIds.length} gasto{gastoIds.length === 1 ? "" : "s"}:{" "}
                  {suma.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  {totalFactura != null && (
                    <>
                      {" "}
                      / total factura:{" "}
                      {totalFactura.toLocaleString("es-MX", { minimumFractionDigits: 2 })}{" "}
                      {cuadra ? "✓ cuadra" : "— no cuadra (revisa montos o gastos faltantes)"}
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Categoría sugerida</Label>
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="refacción, taller…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notas</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={link} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta factura recibida?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita del buzón el registro de {recibida.emisor_nombre ?? recibida.emisor_rfc ?? "este proveedor"}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                eliminar();
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
