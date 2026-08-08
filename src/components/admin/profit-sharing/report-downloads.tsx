"use client";

import { useState } from "react";
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
  ArchiveBoxArrowDownIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { descargarDelApi } from "@/lib/download";

type Kind = "pdf" | "xlsx" | "dinero" | "cierre";

export function ReportDownloads({ desde, hasta }: { desde: string; hasta: string }) {
  const [loading, setLoading] = useState<Kind | null>(null);

  const download = async (kind: Kind, path: string, filename: string, openInTab = false) => {
    setLoading(kind);
    const err = await descargarDelApi(path, {
      filename,
      openInTab,
      query: { desde, hasta },
    });
    if (err) toast.error("No se pudo generar el reporte", { description: err });
    setLoading(null);
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
          download("dinero", "/v1/profit-sharing/dinero.xlsx", `dinero-${desde}-a-${hasta}.xlsx`)
        }
        title="Libro «Dinero» del periodo (réplica del control manual): dinero-vlos con filas coloreadas por avión y clave vt+cliente, otros ingresos, otros gastos y utilidades. Costo proveedor y comisiones van vacíos hasta definir sus reglas."
      >
        <TableCellsIcon className="h-4 w-4" />
        {loading === "dinero" ? "Generando…" : "Dinero (Excel)"}
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
