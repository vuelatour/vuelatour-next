"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { MEDIO_PAGO_LABELS } from "@/components/admin/expenses/expenses-table";
import {
  removePagoCompraAction,
  updatePagoRolAction,
} from "@/app/admin/inventory/compras/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  COMPRA_ROL_OPTIONS,
  fmtMontoMoneda,
  type CompraDetalle,
  type CompraPago,
  type CompraRol,
} from "@/types/compras";
import { CompraPagoAddDialog } from "./compra-pago-add-dialog";

/**
 * Pagos ligados a la compra: cada uno es un gasto con su factura y su cruce
 * bancario. Aquí solo se liga/desliga y se corrige el rol; el gasto se edita
 * en /admin/expenses.
 */
export function CompraPagosCard({
  compra,
  fotoUrls,
}: {
  compra: CompraDetalle;
  /** URLs firmadas de las facturas (bucket privado) por path. */
  fotoUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openAdd, setOpenAdd] = useState(false);
  const [quitar, setQuitar] = useState<CompraPago | null>(null);

  const cambiarRol = (p: CompraPago, rol: CompraRol) => {
    if (rol === p.compra_rol) return;
    startTransition(async () => {
      // PATCH atómico del rol: si falla, el pago sigue ligado con su rol
      // anterior (antes era DELETE + POST y podía quedar desligado).
      const r = await updatePagoRolAction(compra.id, p.id, rol);
      if (r.ok) toast.success("Rol del pago actualizado");
      else toast.error(r.error ?? "No se pudo cambiar el rol");
      router.refresh();
    });
  };

  const confirmarQuitar = () => {
    if (!quitar) return;
    startTransition(async () => {
      const r = await removePagoCompraAction(compra.id, quitar.id);
      if (r.ok) {
        toast.success("Pago desligado de la compra");
        setQuitar(null);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo quitar el pago");
      }
    });
  };

  // Totales por moneda (nunca se mezclan MXN y USD).
  const totales = compra.pagos.reduce<Record<string, number>>((acc, p) => {
    acc[p.moneda] = (acc[p.moneda] ?? 0) + Number(p.monto);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">
              Pagos{" "}
              <span className="text-sm font-normal text-muted-foreground">({compra.pagos.length})</span>
            </CardTitle>
            <CardDescription>
              Las facturas que componen la compra (mercancía, envío, impuestos). Envío e impuestos se
              reparten al costo de las refacciones.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpenAdd(true)}>
            <PlusIcon className="h-4 w-4" />
            Agregar pago
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {compra.pagos.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Sin pagos ligados. Agrega la factura de mercancía y, cuando lleguen, las de envío e
            impuestos.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Pagó</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {compra.pagos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateOnly(p.fecha_gasto)}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <SearchableSelect
                      options={COMPRA_ROL_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label.split(" (")[0],
                      }))}
                      value={p.compra_rol}
                      onChange={(v) => cambiarRol(p, v as CompraRol)}
                      className="h-8"
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>{categoriaGastoLabel(p.categoria)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtMontoMoneda(p.monto, p.moneda)}
                    {p.moneda !== compra.moneda && p.tc_gasto != null && (
                      <p className="text-[10px] text-muted-foreground">TC {Number(p.tc_gasto).toFixed(4)}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{MEDIO_PAGO_LABELS[p.medio_pago] ?? p.medio_pago}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block max-w-[180px] truncate" title={p.notas ?? undefined}>
                      {p.proveedor?.nombre ?? ((p.notas ?? "").split("\n")[0].trim() || "—")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.foto_url && fotoUrls[p.foto_url] ? (
                      <ComprobantePreview
                        path={p.foto_url}
                        url={fotoUrls[p.foto_url]}
                        alt={`Factura · ${p.categoria}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin foto</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.conciliado ? (
                      <span className="text-emerald-600" title="Conciliado con el estado de cuenta">
                        ✓ Conciliado
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin conciliar</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setQuitar(p)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                      title="Quitar de la compra"
                      disabled={pending}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {compra.pagos.length > 0 && (
          <div className="flex justify-end gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {Object.entries(totales).map(([moneda, total]) => (
              <span key={moneda}>
                Pagado {moneda}:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtMontoMoneda(total, moneda)}
                </span>
              </span>
            ))}
          </div>
        )}
      </CardContent>

      <CompraPagoAddDialog open={openAdd} onOpenChange={setOpenAdd} compraId={compra.id} />

      <AlertDialog open={quitar !== null} onOpenChange={(o) => !o && setQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este pago de la compra?</AlertDialogTitle>
            <AlertDialogDescription>
              El gasto no se borra: vuelve a ser un gasto suelto en la bandeja. El costo de las
              refacciones se recalcula sin este cargo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarQuitar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar pago"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
