"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { IssuingEntityActions } from "@/components/admin/issuing-entities/issuing-entity-actions";
import type { IssuingEntity } from "@/types/issuing-entities";

const columns: Array<DataTableColumn<IssuingEntity>> = [
  {
    key: "codigo",
    header: "Código",
    cell: (e) => (
      <Badge variant="outline" className="font-mono">
        {e.codigo}
      </Badge>
    ),
  },
  {
    key: "razon",
    header: "Razón social",
    cellClassName: "font-medium",
    cell: (e) => e.razon_social,
  },
  {
    key: "rfc",
    header: "RFC",
    cellClassName: "font-mono text-xs",
    cell: (e) => e.rfc ?? "—",
  },
  {
    key: "cp",
    header: "CP",
    cellClassName: "font-mono text-xs",
    cell: (e) => e.codigo_postal ?? "—",
  },
  {
    key: "regimen",
    header: "Régimen",
    cellClassName: "font-mono text-xs",
    cell: (e) => e.regimen_fiscal_sat ?? "—",
  },
  {
    key: "pac",
    header: "PAC",
    cellClassName: "text-xs",
    cell: (e) => e.pac_proveedor ?? "—",
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (e) =>
      e.activa ? (
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
          Activa
        </Badge>
      ) : (
        <Badge variant="secondary">Inactiva</Badge>
      ),
  },
  {
    key: "acciones",
    header: "",
    headClassName: "w-12",
    noLink: true,
    cell: (e) => <IssuingEntityActions entity={e} />,
  },
];

export function IssuingEntitiesTable({ entities }: { entities: IssuingEntity[] }) {
  return <DataTable columns={columns} rows={entities} rowKey={(e) => e.id} />;
}
