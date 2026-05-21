"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  NoSymbolIcon,
  PauseCircleIcon,
} from "@heroicons/react/24/outline";
import { setPilotAccessAction } from "@/app/admin/pilots/actions";
import { Button } from "@/components/ui/button";
import type { EstadoUsuario } from "@/types/me";

interface Props {
  id: string;
  estado: EstadoUsuario;
  size?: "sm" | "default";
}

const LABELS: Record<EstadoUsuario, { text: string; icon: typeof CheckCircleIcon; cls: string }> = {
  ACTIVO: {
    text: "Activo",
    icon: CheckCircleIcon,
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  INVITADO: {
    text: "Invitado",
    icon: PauseCircleIcon,
    cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  },
  INACTIVO: {
    text: "Bloqueado",
    icon: NoSymbolIcon,
    cls: "bg-muted text-muted-foreground border-border",
  },
};

export function AccessToggle({ id, estado, size = "default" }: Props) {
  const [pending, startTransition] = useTransition();
  const current = LABELS[estado];
  const Icon = current.icon;

  const toggle = (next: EstadoUsuario) => {
    startTransition(async () => {
      const res = await setPilotAccessAction(id, next);
      if (res.ok) toast.success(`Acceso → ${next}`);
      else toast.error(res.error ?? "Error al cambiar estado");
    });
  };

  const isActive = estado === "ACTIVO";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${current.cls}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {current.text}
      </span>
      {isActive ? (
        <Button
          size={size}
          variant="outline"
          onClick={() => toggle("INACTIVO")}
          disabled={pending}
        >
          Revocar acceso
        </Button>
      ) : (
        <Button
          size={size}
          onClick={() => toggle("ACTIVO")}
          disabled={pending}
        >
          Activar acceso
        </Button>
      )}
    </div>
  );
}
