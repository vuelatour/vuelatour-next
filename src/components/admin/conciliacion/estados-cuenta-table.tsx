"use client";

import { useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { estadoCuentaUrlAction } from "@/app/admin/conciliacion/actions";
import { fmtDateTime } from "@/lib/datetime";
import type { EstadoCuentaArchivo } from "@/types/conciliacion";

/**
 * Estados de cuenta importados: cada importación archiva el archivo original
 * (CSV/Excel/PDF) y aquí se consulta y descarga (URL firmada de 1 h).
 */
export function EstadosCuentaTable({ estados }: { estados: EstadoCuentaArchivo[] }) {
  const [descargando, setDescargando] = useState<string | null>(null);

  const descargar = async (id: string) => {
    setDescargando(id);
    try {
      const res = await estadoCuentaUrlAction(id);
      if (res.ok && res.data) {
        window.open(res.data.url, "_blank");
      } else {
        toast.error(res.error ?? "No se pudo generar la descarga");
      }
    } catch (err) {
      // Fallo de transporte (red): la action no alcanzó a responder.
      toast.error(err instanceof Error ? err.message : "No se pudo generar la descarga");
    } finally {
      setDescargando(null);
    }
  };

  const columns: Array<DataTableColumn<EstadoCuentaArchivo>> = [
    {
      key: "fecha",
      header: "Importado",
      cellClassName: "whitespace-nowrap",
      cell: (e) => fmtDateTime(e.created_at),
    },
    {
      key: "archivo",
      header: "Archivo",
      cellClassName: "max-w-[280px]",
      cell: (e) => (
        <span className="block truncate font-mono text-xs" title={e.filename}>
          {e.filename}
        </span>
      ),
    },
    {
      key: "cuenta",
      header: "Cuenta",
      cellClassName: "whitespace-nowrap",
      cell: (e) =>
        e.cuenta ? (
          <>
            {e.cuenta.alias ?? "Cuenta"}{" "}
            <span className="text-muted-foreground">
              · {e.cuenta.banco ?? ""} ({e.cuenta.moneda ?? ""})
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "movimientos",
      header: "Movimientos",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (e) => e.movimientos_importados ?? "—",
    },
    {
      key: "descargar",
      header: "",
      headClassName: "w-32",
      cell: (e) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={descargando === e.id}
          onClick={() => void descargar(e.id)}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {descargando === e.id ? "Abriendo…" : "Descargar"}
        </Button>
      ),
    },
  ];

  return <DataTable columns={columns} rows={estados} rowKey={(e) => e.id} />;
}
