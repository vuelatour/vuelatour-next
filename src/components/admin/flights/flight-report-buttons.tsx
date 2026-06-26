"use client";

import { useState } from "react";
import { DocumentArrowDownIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

/**
 * Descarga el reporte consolidado de un vuelo (cotización + ingreso + tacómetro
 * + combustible + gastos) en PDF o Excel. Usa el token de sesión para autenticar
 * la descarga directa contra la API.
 */
export function FlightReportButtons({
  flightId,
  folio,
  size = "sm",
}: {
  flightId: string;
  folio?: number | string | null;
  size?: "sm" | "default";
}) {
  const [loading, setLoading] = useState<"pdf" | "xlsx" | null>(null);
  const fol = folio != null ? String(folio) : flightId.slice(0, 8);

  const download = async (kind: "pdf" | "xlsx") => {
    setLoading(kind);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${env.API_URL}/v1/flights/${flightId}/reporte.${kind}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        toast.error("No se pudo generar el reporte del vuelo");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `vuelo-${fol}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar el reporte del vuelo");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        variant="outline"
        size={size}
        className="gap-2"
        disabled={loading !== null}
        onClick={() => download("pdf")}
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
        {loading === "pdf" ? "Generando…" : "Reporte PDF"}
      </Button>
      <Button
        variant="outline"
        size={size}
        className="gap-2"
        disabled={loading !== null}
        onClick={() => download("xlsx")}
      >
        <TableCellsIcon className="h-4 w-4" />
        {loading === "xlsx" ? "Generando…" : "Reporte Excel"}
      </Button>
    </div>
  );
}
