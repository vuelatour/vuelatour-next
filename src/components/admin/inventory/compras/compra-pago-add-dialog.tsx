"use client";

import { useState, useTransition } from "react";
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
import { addPagoCompraAction } from "@/app/admin/inventory/compras/actions";
import { BOTON_VINCULAR_GASTO } from "@/lib/admin/compras-estado";
import { COMPRA_ROL_OPTIONS, type CompraRol, type GastoCandidatoCompra } from "@/types/compras";
import { GastoCandidatoSelector } from "./gasto-candidato-selector";

/**
 * «Vincular gasto ya registrado» (21-oct-2026): liga un gasto que YA está en
 * Gastos como pago de esta compra (mercancía, envío, impuestos u otro). Es el
 * caso del cliente «ya registramos el gasto; cuando llegue, vincular». Los
 * candidatos los da el API; el rol se sugiere y la oficina lo confirma.
 */
export function CompraPagoAddDialog({
  open,
  onOpenChange,
  compraId,
  folio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
  folio?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gasto, setGasto] = useState<GastoCandidatoCompra | null>(null);
  const [rol, setRol] = useState<CompraRol>("OTRO");

  const cambiarOpen = (o: boolean) => {
    if (!o) {
      setGasto(null);
      setRol("OTRO");
    }
    onOpenChange(o);
  };

  const elegir = (g: GastoCandidatoCompra | null) => {
    setGasto(g);
    if (g) setRol(g.rol_sugerido);
  };

  const confirmar = () => {
    if (!gasto) {
      toast.error("Elige el gasto que pagó esta compra");
      return;
    }
    if (rol === "MERCANCIA" && !gasto.puede_mercancia) {
      toast.error("Ese gasto no puede ser la factura de mercancía (solo Refacción, Otro u Operaciones): elige otro rol.");
      return;
    }
    startTransition(async () => {
      const r = await addPagoCompraAction(compraId, { gasto_id: gasto.id, rol });
      if (r.ok) {
        toast.success(
          rol === "MERCANCIA"
            ? `Gasto vinculado a la compra${folio != null ? ` #${folio}` : ""} como su factura de mercancía`
            : `Pago vinculado a la compra${folio != null ? ` #${folio}` : ""}`,
        );
        cambiarOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo vincular el gasto");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cambiarOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {BOTON_VINCULAR_GASTO}
            {folio != null ? ` · compra #${folio}` : ""}
          </DialogTitle>
          <DialogDescription>
            Elige un gasto que ya está en Gastos y di qué pagó: la factura de mercancía (el gasto de la
            compra), el envío, los impuestos u otro cargo. El gasto conserva su factura y su cruce bancario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Gasto" required>
            <GastoCandidatoSelector value={gasto?.id ?? ""} onChange={elegir} />
          </Field>
          <Field label="¿Qué pagó?" required hint={gasto ? "Sugerido por lo que dice el gasto; corrígelo si hace falta." : undefined}>
            <SearchableSelect
              options={COMPRA_ROL_OPTIONS.map((o) => ({
                ...o,
                disabled: o.value === "MERCANCIA" && !!gasto && !gasto.puede_mercancia,
              }))}
              value={rol}
              onChange={(v) => setRol(v as CompraRol)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => cambiarOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !gasto}>
            {pending ? "Vinculando…" : "Vincular gasto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
