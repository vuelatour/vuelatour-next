"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";
import {
  tituloBotonResync,
  toastResyncFallo,
  toastResyncGoogle,
  type ToastResyncGoogle,
} from "@/lib/admin/calendar-sync";
import type { CalendarResyncResultado } from "@/types/calendar";

/**
 * Backfill manual del calendario del sistema → Google Calendar (ADMIN).
 * Desde el 12-sep-2026 el API sincroniza en una sola pasada vuelos,
 * descansos de piloto, eventos de flota y mantenimientos con fecha, y
 * devuelve los conteos por tipo: el toast los canta (helper puro
 * `toastResyncGoogle`, que también tolera el `{enabled, total}` del API viejo
 * y el caso «apagado»).
 *
 * Se llama DIRECTO al API (no por server action) a propósito: el backfill de
 * la ventana [hoy−30d, hoy+365d] es secuencial contra Google y puede tardar
 * más que el límite de una función de Vercel. Al terminar, `router.refresh()`
 * vuelve a pedir el estado en el servidor para que el chip de al lado muestre
 * la nueva fecha de re-sincronización.
 *
 * Desde el 12-sep-2026 la sync es AUTOMÁTICA (cola en el API): este botón ya
 * NO es el camino normal, solo el backfill de la ventana para el arranque o
 * una duda. Con `automatica` el tooltip lo dice (`tituloBotonResync`) para que
 * nadie crea que hay que pulsarlo después de cada cambio.
 */
export function ResyncGoogleButton({
  automatica = false,
}: {
  /** `syncEsAutomatica(estado)` del estado que ya pide la página. */
  automatica?: boolean;
} = {}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const mostrar = (t: ToastResyncGoogle) => {
    const fn =
      t.tono === "success" ? toast.success : t.tono === "warning" ? toast.warning : toast.error;
    fn(t.texto, { description: t.detalle, duration: 8000 });
  };

  const run = async () => {
    setLoading(true);
    // El backfill de un año puede tardar: el operador tiene que ver que algo
    // está pasando (si no, vuelve a pulsar el botón).
    const cargando = toast.loading("Re-sincronizando con Google Calendar…", {
      description:
        "Se publican los vuelos, descansos, eventos y mantenimientos de la ventana. Puede tardar un par de minutos.",
    });
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${env.API_URL}/v1/calendar/resync`, {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        mostrar(toastResyncFallo(res.status));
        return;
      }
      const data = (await res.json()) as CalendarResyncResultado;
      mostrar(toastResyncGoogle(data));
      // El chip de estado se pinta en el servidor: refrescar para que muestre
      // la nueva fecha de «última re-sincronización manual».
      router.refresh();
    } catch {
      mostrar(toastResyncFallo());
    } finally {
      toast.dismiss(cargando);
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={loading}
      onClick={run}
      title={tituloBotonResync(automatica)}
    >
      <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Sincronizando…" : "Re-sincronizar Google"}
    </Button>
  );
}
