"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  addPagoCompraAction,
  listComprasAbiertasAction,
} from "@/app/admin/inventory/compras/actions";
import { fmtDateOnly } from "@/lib/datetime";
import {
  COMPRA_ROL_OPTIONS,
  fmtMontoMoneda,
  sugerirRolCompra,
  type CompraListItem,
  type CompraRol,
} from "@/types/compras";
import type { Gasto } from "@/types/expenses";

/**
 * "Agregar a una compra abierta": liga este gasto (factura de envío,
 * impuestos…) como pago de una compra que ya existe.
 */
export function CompraLinkDialog({
  open,
  onOpenChange,
  gasto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // null = aún no llegan (se vacía al cerrar para recargar en cada apertura).
  const [compras, setCompras] = useState<CompraListItem[] | null>(null);
  const cargando = open && compras === null;
  const [compraId, setCompraId] = useState("");
  const [rol, setRol] = useState<CompraRol>(() =>
    sugerirRolCompra(gasto.categoria, [gasto.proveedor?.nombre, gasto.notas].join(" ")),
  );

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void listComprasAbiertasAction().then((r) => {
      if (cancel) return;
      if (r.ok && r.data) setCompras(r.data);
      else {
        setCompras([]);
        toast.error(r.error ?? "No se pudieron cargar las compras");
      }
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  const cambiarOpen = (o: boolean) => {
    if (!o) {
      setCompras(null);
      setCompraId("");
    }
    onOpenChange(o);
  };

  const confirmar = () => {
    if (!compraId) {
      toast.error("Elige la compra");
      return;
    }
    startTransition(async () => {
      const r = await addPagoCompraAction(compraId, { gasto_id: gasto.id, rol });
      if (r.ok && r.data) {
        const id = r.data.id;
        toast.success(`Gasto ligado a la compra #${r.data.folio}`, {
          action: { label: "Ver compra", onClick: () => router.push(`/admin/inventory/compras/${id}`) },
        });
        cambiarOpen(false);
      } else {
        toast.error(r.error ?? "No se pudo ligar el gasto");
      }
    });
  };

  const monto = fmtMontoMoneda(gasto.monto, gasto.moneda);

  return (
    <Dialog open={open} onOpenChange={cambiarOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar a una compra abierta · {monto}</DialogTitle>
          <DialogDescription>
            Este gasto pasa a ser un pago de la compra elegida (envío, impuestos u otro). Conserva
            su factura y su cruce bancario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Compra" required>
            <SearchableSelect
              options={(compras ?? []).map((c) => ({
                value: c.id,
                label: `#${c.folio} · ${c.proveedor?.nombre ?? "Sin proveedor"} · ${fmtDateOnly(c.fecha)}`,
                description: [c.referencia, `${c.n_pagos} pagos`, fmtMontoMoneda(c.total, c.moneda)]
                  .filter(Boolean)
                  .join(" · "),
              }))}
              value={compraId}
              onChange={setCompraId}
              placeholder={cargando ? "Cargando compras…" : "Elige la compra"}
              emptyText="No hay compras abiertas: crea una con la factura de mercancía"
              disabled={cargando}
            />
          </Field>
          <Field label="¿Qué pagó?" required>
            <SearchableSelect
              options={COMPRA_ROL_OPTIONS}
              value={rol}
              onChange={(v) => setRol(v as CompraRol)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => cambiarOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !compraId}>
            {pending ? "Ligando…" : "Agregar a la compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
