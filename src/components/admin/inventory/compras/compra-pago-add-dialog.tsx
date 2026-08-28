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
  listGastosSinCompraAction,
  type GastoCandidato,
} from "@/app/admin/inventory/compras/actions";
import { fmtDateOnly } from "@/lib/datetime";
import {
  COMPRA_ROL_OPTIONS,
  fmtMontoMoneda,
  sugerirRolCompra,
  type CompraRol,
} from "@/types/compras";

/**
 * Liga un gasto YA capturado (con su factura) como pago de esta compra.
 * Candidatos: gastos sin compra de los últimos 60 días.
 */
export function CompraPagoAddDialog({
  open,
  onOpenChange,
  compraId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // null = aún no llegan (se vacía al cerrar para recargar en cada apertura).
  const [candidatos, setCandidatos] = useState<GastoCandidato[] | null>(null);
  const cargando = open && candidatos === null;
  const [gastoId, setGastoId] = useState("");
  const [rol, setRol] = useState<CompraRol>("OTRO");

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void listGastosSinCompraAction().then((r) => {
      if (cancel) return;
      if (r.ok && r.data) setCandidatos(r.data);
      else {
        setCandidatos([]);
        toast.error(r.error ?? "No se pudieron cargar los gastos");
      }
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  const cambiarOpen = (o: boolean) => {
    if (!o) {
      setCandidatos(null);
      setGastoId("");
    }
    onOpenChange(o);
  };

  const elegir = (id: string) => {
    setGastoId(id);
    const g = (candidatos ?? []).find((c) => c.id === id);
    if (g) setRol(sugerirRolCompra(g.categoria, [g.proveedor, g.descripcion].join(" ")));
  };

  const confirmar = () => {
    if (!gastoId) {
      toast.error("Elige el gasto que pagó esta compra");
      return;
    }
    startTransition(async () => {
      const r = await addPagoCompraAction(compraId, { gasto_id: gastoId, rol });
      if (r.ok) {
        toast.success("Pago ligado a la compra");
        cambiarOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo ligar el pago");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cambiarOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar pago a la compra</DialogTitle>
          <DialogDescription>
            Elige un gasto ya capturado (con su factura) y di qué pagó: mercancía, envío,
            impuestos u otro. El gasto conserva su cruce bancario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Gasto" required hint="Gastos sin compra de los últimos 60 días.">
            <SearchableSelect
              options={(candidatos ?? []).map((g) => ({
                value: g.id,
                label: `${fmtDateOnly(g.fecha_gasto)} · ${g.categoria} · ${fmtMontoMoneda(g.monto, g.moneda)}`,
                description: [g.proveedor, g.descripcion].filter(Boolean).join(" · ") || undefined,
              }))}
              value={gastoId}
              onChange={elegir}
              placeholder={cargando ? "Cargando gastos…" : "Elige el gasto"}
              emptyText="Sin gastos disponibles en los últimos 60 días"
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
          <Button onClick={confirmar} disabled={pending || !gastoId}>
            {pending ? "Ligando…" : "Agregar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
