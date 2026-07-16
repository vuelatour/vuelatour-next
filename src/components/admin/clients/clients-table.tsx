"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ClientActions } from "@/components/admin/clients/client-actions";
import { datosFiscalesCompletos, RFC_EXTRANJERO, type Client } from "@/types/clients";

const CANAL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LANDING: "Landing",
  LLAMADA: "Llamada",
  REFERIDO: "Referido",
};

const columns: Array<DataTableColumn<Client>> = [
  {
    key: "nombre",
    header: "Nombre",
    cellClassName: "font-medium",
    cell: (c) => c.nombre,
  },
  {
    key: "contacto",
    header: "Contacto",
    cell: (c) => (
      <div className="text-xs space-y-0.5">
        {c.telefono && <div className="text-muted-foreground">{c.telefono}</div>}
        {c.email && (
          <div className="text-muted-foreground break-all">{c.email}</div>
        )}
        {!c.telefono && !c.email && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
  {
    key: "fiscales",
    header: "RFC / Datos fiscales",
    cell: (c) => (
      <div className="space-y-1">
        <div className="font-mono text-xs">
          {c.rfc ?? "—"}
          {c.rfc === RFC_EXTRANJERO && (
            <span className="ml-1 font-sans text-[11px] text-muted-foreground">
              (extranjero{c.pais_residencia ? `: ${c.pais_residencia}` : ""})
            </span>
          )}
        </div>
        {datosFiscalesCompletos(c) ? (
          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20 text-[11px]">
            Datos fiscales completos
          </Badge>
        ) : (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 text-[11px]">
            Faltan datos fiscales
          </Badge>
        )}
      </div>
    ),
  },
  {
    key: "canal",
    header: "Canal",
    cell: (c) =>
      c.canal_origen ? (
        <Badge variant="outline" className="text-xs">
          {CANAL_LABELS[c.canal_origen] ?? c.canal_origen}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "tipo",
    header: "Tipo",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (c) =>
      c.es_broker ? (
        <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 hover:bg-brand-600/20 text-xs">
          Broker
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs">Directo</Badge>
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (c) =>
      c.activo ? (
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
    cell: (c) => <ClientActions client={c} />,
  },
];

export function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <DataTable
      columns={columns}
      rows={clients}
      rowKey={(c) => c.id}
      searchText={(c) =>
        `${c.nombre} ${c.rfc ?? ""} ${c.razon_social_default ?? ""} ${c.email ?? ""} ${c.telefono ?? ""}`
      }
      searchPlaceholder="Buscar cliente (nombre, RFC, email, teléfono)…"
    />
  );
}
