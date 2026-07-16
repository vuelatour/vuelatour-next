"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import type { DashboardVueloSemana } from "@/types/dashboards";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  // Columna `date`: fija a mediodía UTC para no correr el día por zona horaria.
  const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

const columns: Array<DataTableColumn<DashboardVueloSemana>> = [
  {
    key: "folio",
    header: "Folio",
    cellClassName: "font-mono text-sm",
    cell: (v) => (v.folio != null ? `#${v.folio}` : "—"),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "text-sm",
    cell: (v) => (
      <>
        {v.origen_iata ?? "—"} → {v.destino_iata ?? "—"}
      </>
    ),
  },
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "text-sm",
    cell: (v) => fmtDate(v.fecha_vuelo),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (v) => (
      <Badge variant={v.estado === "EN_VUELO" ? "default" : "secondary"}>
        {v.estado}
      </Badge>
    ),
  },
];

export function VuelosSemanaTable({ vuelos }: { vuelos: DashboardVueloSemana[] }) {
  return <DataTable columns={columns} rows={vuelos} rowKey={(v) => v.id} />;
}
