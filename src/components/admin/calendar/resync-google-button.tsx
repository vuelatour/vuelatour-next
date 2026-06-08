"use client";

import { useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

/** Dispara la re-sincronización de vuelos redondos a Google Calendar (ADMIN). */
export function ResyncGoogleButton() {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
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
        toast.error("No se pudo re-sincronizar");
        return;
      }
      const data = (await res.json()) as { enabled: boolean; total: number };
      if (!data.enabled) {
        toast.warning("La sincronización con Google no está activa en este ambiente.");
      } else {
        toast.success(`${data.total} vuelo(s) redondo(s) re-sincronizado(s) a Google Calendar.`);
      }
    } catch {
      toast.error("No se pudo re-sincronizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" disabled={loading} onClick={run}>
      <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Sincronizando…" : "Re-sincronizar Google"}
    </Button>
  );
}
