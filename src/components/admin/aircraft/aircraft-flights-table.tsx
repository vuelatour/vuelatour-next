"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import type { FlightListItem } from "@/types/flights";

/** Ruta completa (origen → escalas → destino) o el par origen/destino. */
function rutaDe(f: FlightListItem): string {
  return (
    f.ruta_iatas && f.ruta_iatas.length > 0
      ? f.ruta_iatas
      : [f.origen_iata, f.destino_iata]
  ).join(" → ");
}

const columns: Array<DataTableColumn<FlightListItem>> = [
  {
    key: "folio",
    header: "Folio",
    cellClassName: "font-mono text-sm",
    cell: (f) => <>#{f.folio}</>,
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-medium",
    cell: (f) => rutaDe(f),
  },
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "text-sm text-muted-foreground",
    cell: (f) => fmtDate(f.fecha_vuelo),
  },
  {
    key: "pax",
    header: "Pax",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (f) => f.pasajeros,
  },
  {
    key: "monto",
    header: "Monto",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (f) => fmtUsd(f.monto_total_usd),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (f) => (
      <Badge variant="outline" className={ESTADO_STYLES[f.estado]}>
        {ESTADO_LABELS[f.estado]}
      </Badge>
    ),
  },
  {
    key: "ver",
    header: "",
    cellClassName: "text-right",
    cell: (f) => (
      <Link
        href={`/admin/flights/${f.id}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        Ver
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </Link>
    ),
  },
];

/** Vuelos de una aeronave (expediente): lista que crece con el uso. */
export function AircraftFlightsTable({ flights }: { flights: FlightListItem[] }) {
  return (
    <DataTable
      columns={columns}
      rows={flights}
      rowKey={(f) => f.id}
      rowClassName={() => "group"}
      searchText={(f) => `#${f.folio} ${rutaDe(f)} ${ESTADO_LABELS[f.estado]}`}
      searchPlaceholder="Buscar vuelo (folio, ruta, estado)…"
    />
  );
}
