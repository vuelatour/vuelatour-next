"use client";

/**
 * «Gastos sin banco» / «Cobros sin banco» cuando la lista NO se pudo leer
 * (14-oct-2026): el aviso en lugar de la tabla. Jamás la tabla vacía — vacía
 * diría «no falta nada» y lo que pasó es que el API no contestó. «Reintentar»
 * hace `router.refresh()` (vuelve a correr el Server Component sin recargar
 * toda la aplicación), como `TarjetaErrorCarga`. Textos en
 * `lib/admin/conciliacion-vista.ts`.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  BOTON_REINTENTAR_LISTA,
  MSG_LISTA_SIN_BANCO_NO_CARGO,
  TEXTO_REINTENTANDO_LISTA,
} from "@/lib/admin/conciliacion-vista";
import { cn } from "@/lib/utils";

export function AvisoListaSinBancoNoCargo() {
  const router = useRouter();
  const [refrescando, empezar] = useTransition();
  return (
    <div role="alert" data-lista-no-cargo="" className="space-y-2 px-4 pb-4 text-sm">
      <p className="text-amber-700 dark:text-amber-300">{MSG_LISTA_SIN_BANCO_NO_CARGO}</p>
      <button
        type="button"
        onClick={() => empezar(() => router.refresh())}
        disabled={refrescando}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowPathIcon className={cn("h-4 w-4", refrescando && "animate-spin")} aria-hidden />
        {refrescando ? TEXTO_REINTENTANDO_LISTA : BOTON_REINTENTAR_LISTA}
      </button>
    </div>
  );
}
