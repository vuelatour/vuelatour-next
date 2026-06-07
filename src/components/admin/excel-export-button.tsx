"use client";

import { useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

/** Descarga un Excel desde un endpoint del API (blob + token de sesión). Reutilizable. */
export function ExcelExportButton({
  path,
  filename,
  label = "Exportar Excel",
  query,
}: {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
}) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = Object.entries(query ?? {}).filter(
        (e): e is [string, string] => e[1] != null && e[1] !== "",
      );
      const qs = params.length ? `?${new URLSearchParams(params).toString()}` : "";
      const res = await fetch(`${env.API_URL}${path}${qs}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        toast.error("No se pudo exportar");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo exportar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" disabled={loading} onClick={run}>
      <TableCellsIcon className="h-4 w-4" />
      {loading ? "Generando…" : label}
    </Button>
  );
}
