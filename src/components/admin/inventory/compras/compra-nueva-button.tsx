"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCompraAction } from "@/app/admin/inventory/compras/actions";

/**
 * Alta de una compra vacía: se llena en su detalle (proveedor, líneas,
 * pagos). Las compras que nacen de una factura ya capturada se crean desde
 * el menú del gasto en /admin/expenses.
 */
export function CompraNuevaButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const crear = () => {
    startTransition(async () => {
      const r = await createCompraAction({});
      if (r.ok && r.data) {
        toast.success(`Compra #${r.data.folio} creada`);
        router.push(`/admin/inventory/compras/${r.data.id}`);
      } else {
        toast.error(r.error ?? "No se pudo crear la compra");
      }
    });
  };

  return (
    <Button onClick={crear} disabled={pending} className="gap-2">
      <PlusIcon className="h-4 w-4" />
      {pending ? "Creando…" : "Nueva compra"}
    </Button>
  );
}
