"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ProviderActions } from "@/components/admin/providers/provider-actions";
import type { Provider } from "@/types/providers";

const TIPO_LABELS: Record<string, string> = {
  NACIONAL: "Nacional",
  EXTRANJERO: "Extranjero",
  GENERICO_LOCAL: "Genérico",
};

const columns: Array<DataTableColumn<Provider>> = [
  {
    key: "nombre",
    header: "Nombre",
    cellClassName: "font-medium",
    cell: (p) => p.nombre,
  },
  {
    key: "rfc",
    header: "RFC",
    cellClassName: "font-mono text-xs",
    cell: (p) => p.rfc ?? "—",
  },
  {
    key: "tipo",
    header: "Tipo",
    cell: (p) => (
      <Badge variant="outline" className="text-xs">
        {TIPO_LABELS[p.tipo] ?? p.tipo}
      </Badge>
    ),
  },
  {
    key: "pais",
    header: "País",
    cell: (p) =>
      p.pais ? (
        <span className="font-mono text-xs">{p.pais}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "contacto",
    header: "Contacto",
    cell: (p) => (
      <div className="text-xs space-y-0.5">
        {p.contacto && <div>{p.contacto}</div>}
        {p.email && <div className="text-muted-foreground break-all">{p.email}</div>}
        {p.telefono && <div className="text-muted-foreground">{p.telefono}</div>}
        {!p.contacto && !p.email && !p.telefono && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (p) =>
      p.activo ? (
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
    cell: (p) => <ProviderActions provider={p} />,
  },
];

export function ProvidersTable({ providers }: { providers: Provider[] }) {
  return (
    <DataTable
      columns={columns}
      rows={providers}
      rowKey={(p) => p.id}
      searchText={(p) => `${p.nombre} ${p.rfc ?? ""}`}
      searchPlaceholder="Buscar proveedor (nombre, RFC)…"
    />
  );
}
