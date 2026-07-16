"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { AirportActions } from "@/components/admin/airports/airport-actions";
import { fmtUsd } from "@/lib/format";
import type { Airport } from "@/types/airports";

function Check({ value }: { value: boolean }) {
  return value ? (
    <CheckIcon className="h-4 w-4 text-green-600 inline" />
  ) : (
    <XMarkIcon className="h-4 w-4 text-muted-foreground inline" />
  );
}

const columns: Array<DataTableColumn<Airport>> = [
  {
    key: "iata",
    header: "IATA",
    cell: (a) => (
      <>
        <div className="font-mono font-semibold">{a.iata}</div>
        {a.icao && (
          <div className="text-[10px] font-mono text-muted-foreground">{a.icao}</div>
        )}
      </>
    ),
  },
  {
    key: "nombre",
    header: "Nombre / Ciudad",
    cell: (a) => (
      <>
        <div className="text-sm font-medium">{a.nombre}</div>
        {a.ciudad && <div className="text-xs text-muted-foreground">{a.ciudad}</div>}
      </>
    ),
  },
  {
    key: "pais",
    header: "País",
    cell: (a) => (
      <Badge variant="outline" className="font-mono text-xs">
        {a.pais}
      </Badge>
    ),
  },
  {
    key: "tuas",
    header: "TUAS / pax",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) => fmtUsd(a.tuas_default_usd_pax),
  },
  {
    key: "xa",
    header: "XA",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => <Check value={a.tuas_aplica_xa} />,
  },
  {
    key: "xb",
    header: "XB",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => <Check value={a.tuas_aplica_xb} />,
  },
  {
    key: "n",
    header: "N",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => <Check value={a.tuas_aplica_n} />,
  },
  {
    key: "pase",
    header: "Pase exenta",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => <Check value={a.tuas_pase_abordar_exenta} />,
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) =>
      a.activo ? (
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
          Activo
        </Badge>
      ) : (
        <Badge variant="secondary">Inactivo</Badge>
      ),
  },
  {
    key: "acciones",
    header: "",
    headClassName: "w-12",
    noLink: true,
    cell: (a) => <AirportActions airport={a} />,
  },
];

export function AirportsTable({ airports }: { airports: Airport[] }) {
  return (
    <DataTable
      columns={columns}
      rows={airports}
      rowKey={(a) => a.id}
      searchText={(a) => `${a.iata} ${a.icao ?? ""} ${a.nombre} ${a.ciudad ?? ""} ${a.pais}`}
      searchPlaceholder="Buscar aeropuerto (IATA, nombre, ciudad)…"
    />
  );
}
