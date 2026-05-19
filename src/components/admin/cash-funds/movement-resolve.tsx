"use client";

import { useTransition } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveMovementAction } from "@/app/admin/cash-funds/actions";

interface Props {
  movementId: string;
  fondoId: string;
}

export function MovementResolve({ movementId, fondoId }: Props) {
  const [pending, startTransition] = useTransition();

  const resolve = (estado: "AUTORIZADO" | "RECHAZADO") => {
    startTransition(async () => {
      const result = await resolveMovementAction(movementId, fondoId, estado);
      if (result.ok) {
        toast.success(estado === "AUTORIZADO" ? "Movimiento autorizado" : "Movimiento rechazado");
      } else {
        toast.error(result.error ?? "Error al resolver");
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        className="h-7 gap-1 bg-green-600 text-white hover:bg-green-600/90"
        disabled={pending}
        onClick={() => resolve("AUTORIZADO")}
      >
        <CheckIcon className="h-3.5 w-3.5" />
        Autorizar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1"
        disabled={pending}
        onClick={() => resolve("RECHAZADO")}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
        Rechazar
      </Button>
    </div>
  );
}
