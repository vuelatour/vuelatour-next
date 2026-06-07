"use client";

import { useState } from "react";
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
  ArchiveBoxArrowDownIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

type Kind = "pdf" | "xlsx" | "cierre";

export function ReportDownloads({ desde, hasta }: { desde: string; hasta: string }) {
  const [loading, setLoading] = useState<Kind | null>(null);

  const download = async (kind: Kind, path: string, filename: string, openInTab = false) => {
    setLoading(kind);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ desde, hasta }).toString();
      const res = await fetch(`${env.API_URL}${path}?${qs}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        toast.error("No se pudo generar el reporte");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (openInTab) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
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
    <div className="flex gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() => download("pdf", "/v1/profit-sharing/pdf", "reparto.pdf", true)}
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
        {loading === "pdf" ? "Generando…" : "PDF socios"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() =>
          download("xlsx", "/v1/profit-sharing/xlsx", `reporte-mensual-${desde}-a-${hasta}.xlsx`)
        }
      >
        <TableCellsIcon className="h-4 w-4" />
        {loading === "xlsx" ? "Generando…" : "Excel mensual"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() =>
          download("cierre", "/v1/invoices/cierre", `cierre-${desde}-a-${hasta}.zip`)
        }
        title="Paquete .zip: reporte por avión en Excel + XML/PDF de las facturas timbradas del periodo."
      >
        <ArchiveBoxArrowDownIcon className="h-4 w-4" />
        {loading === "cierre" ? "Generando…" : "Cierre (zip)"}
      </Button>
    </div>
  );
}
