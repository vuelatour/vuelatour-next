"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import type { EstadoVuelo } from "@/types/quotes-persisted";

/** Fila-viewmodel serializable: la página resuelve nombres/lookup y aplana. */
export interface FlightRow {
  id: string;
  folio: number;
  cliente_nombre: string | null;
  es_externo: boolean;
  operador_externo: string | null;
  /** Ruta completa ya unida, p. ej. "CUN → CTM → CUN". */
  ruta: string;
  matricula: string | null;
  piloto_nombre: string | null;
  fecha_vuelo: string | null;
  monto_total_usd: string;
  estado: EstadoVuelo;
  falta_taco: boolean;
}

const columns: Array<DataTableColumn<FlightRow>> = [
  {
    key: "folio",
    header: "Folio",
    headClassName: "w-20",
    cellClassName: "font-mono text-xs",
    cell: (v) => <>#{v.folio}</>,
  },
  {
    key: "cliente",
    header: "Cliente",
    cell: (v) => (
      <>
        <p className="font-medium text-sm">{v.cliente_nombre ?? "—"}</p>
        {v.es_externo && (
          <p className="text-[10px] text-muted-foreground">
            Externo {v.operador_externo ?? ""}
          </p>
        )}
      </>
    ),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-mono text-xs",
    cell: (v) => v.ruta,
  },
  {
    key: "aeronave",
    header: "Aeronave",
    cellClassName: "text-xs",
    cell: (v) =>
      v.es_externo ? (
        <Badge variant="outline" className="text-[10px]">
          Externo
        </Badge>
      ) : v.matricula ? (
        <span className="font-mono">{v.matricula}</span>
      ) : (
        <span className="text-muted-foreground">Sin asignar</span>
      ),
  },
  {
    key: "piloto",
    header: "Piloto",
    cellClassName: "text-xs",
    cell: (v) =>
      v.piloto_nombre ?? <span className="text-muted-foreground">Sin asignar</span>,
  },
  {
    key: "fecha",
    header: "Fecha vuelo",
    cellClassName: "text-xs",
    cell: (v) =>
      v.fecha_vuelo ? (
        fmtDate(v.fecha_vuelo)
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "total",
    header: "Total USD",
    headClassName: "text-right",
    cellClassName: "text-right font-mono",
    cell: (v) => fmtUsd(v.monto_total_usd),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (v) => (
      <div className="flex items-center justify-center gap-1.5">
        {v.falta_taco && (
          <span
            title="Tacómetro incompleto"
            className="inline-flex items-center text-amber-600 dark:text-amber-400"
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
          </span>
        )}
        <Badge variant="outline" className={ESTADO_STYLES[v.estado]}>
          {ESTADO_LABELS[v.estado]}
        </Badge>
      </div>
    ),
  },
];

export function FlightsTable({ rows }: { rows: FlightRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(v) => v.id}
      rowHref={(v) => `/admin/flights/${v.id}`}
      searchText={(v) =>
        `#${v.folio} ${v.cliente_nombre ?? ""} ${v.operador_externo ?? ""} ${v.ruta} ${v.matricula ?? ""} ${v.piloto_nombre ?? ""}`
      }
      searchPlaceholder="Buscar vuelo (folio, cliente, ruta, matrícula, piloto)…"
    />
  );
}
