"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import type { EstadoVuelo } from "@/types/quotes-persisted";

/** Fila-viewmodel serializable que arma la página (lookups ya resueltos). */
export interface QuoteListRow {
  id: string;
  folio: number;
  clienteNombre: string | null;
  esExterno: boolean;
  operadorExterno: string | null;
  /** Ruta ya unida, p. ej. "CUN → MID → CUN". */
  ruta: string;
  fechaVuelo: string | null;
  montoTotalUsd: string;
  version: number;
  estado: EstadoVuelo;
  /** CONFIRMADO no externo sin piloto o sin avión asignado. */
  sinAsignar: boolean;
  faltaPiloto: boolean;
}

const columns: Array<DataTableColumn<QuoteListRow>> = [
  {
    key: "folio",
    header: "Folio",
    headClassName: "w-20",
    cellClassName: "font-mono text-xs",
    cell: (q) => <>#{q.folio}</>,
  },
  {
    key: "cliente",
    header: "Cliente",
    cell: (q) => (
      <>
        <p className="font-medium text-sm">{q.clienteNombre ?? "—"}</p>
        {q.esExterno && (
          <p className="text-[10px] text-muted-foreground">
            Externo {q.operadorExterno ?? ""}
          </p>
        )}
      </>
    ),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-mono text-xs",
    cell: (q) => q.ruta,
  },
  {
    key: "fecha",
    header: "Fecha vuelo",
    cellClassName: "text-xs",
    cell: (q) =>
      q.fechaVuelo
        ? fmtDate(q.fechaVuelo)
        : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "total",
    header: "Total USD",
    headClassName: "text-right",
    cellClassName: "text-right font-mono",
    cell: (q) => fmtUsd(q.montoTotalUsd),
  },
  {
    key: "version",
    header: "v",
    cellClassName: "text-xs text-muted-foreground",
    cell: (q) => <>v{q.version}</>,
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (q) => (
      <span className="inline-flex flex-col items-center gap-1">
        <Badge variant="outline" className={ESTADO_STYLES[q.estado]}>
          {ESTADO_LABELS[q.estado]}
        </Badge>
        {q.sinAsignar && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
            <ExclamationTriangleIcon className="h-3 w-3" />
            {q.faltaPiloto ? "Falta piloto" : "Falta avión"}
          </span>
        )}
      </span>
    ),
  },
];

export function QuotesTable({ quotes }: { quotes: QuoteListRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={quotes}
      rowKey={(q) => q.id}
      rowHref={(q) => `/admin/quotes/${q.id}`}
      searchText={(q) =>
        `#${q.folio} ${q.clienteNombre ?? ""} ${q.operadorExterno ?? ""} ${q.ruta}`
      }
      searchPlaceholder="Buscar cotización (folio, cliente, ruta)…"
    />
  );
}
