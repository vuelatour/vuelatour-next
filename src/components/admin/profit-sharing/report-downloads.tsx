"use client";

import { useState } from "react";
import { DocumentArrowDownIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

export function ReportDownloads({ desde, hasta }: { desde: string; hasta: string }) {
  const [loading, setLoading] = useState<null | "pdf" | "xlsx">(null);

  const download = async (kind: "pdf" | "xlsx") => {
    setLoading(kind);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ desde, hasta }).toString();
      const res = await fetch(`${env.API_URL}/v1/profit-sharing/${kind}?${qs}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        toast.error("No se pudo generar el reporte");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (kind === "pdf") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte-mensual-${desde}-a-${hasta}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar el reporte");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() => download("pdf")}
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
        {loading === "pdf" ? "Generando…" : "PDF socios"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() => download("xlsx")}
      >
        <TableCellsIcon className="h-4 w-4" />
        {loading === "xlsx" ? "Generando…" : "Excel mensual"}
      </Button>
    </div>
  );
}
