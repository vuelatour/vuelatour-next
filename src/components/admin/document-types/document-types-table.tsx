"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { DocumentTypeActions } from "@/components/admin/document-types/document-type-actions";
import { AMBITO_OPTIONS, FORMA_OPTIONS, labelOf } from "@/app/admin/document-types/schema";
import type { DocumentType } from "@/types/expirations";

const AMBITO_STYLES: Record<string, string> = {
  AERONAVE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  PILOTO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  MOTOR: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

const columns: Array<DataTableColumn<DocumentType>> = [
  {
    key: "nombre",
    header: "Nombre",
    cellClassName: "text-sm font-medium",
    cell: (t) => t.nombre,
  },
  {
    key: "ambito",
    header: "Ámbito",
    cell: (t) => (
      <Badge variant="outline" className={AMBITO_STYLES[t.ambito]}>
        {labelOf(AMBITO_OPTIONS, t.ambito)}
      </Badge>
    ),
  },
  {
    key: "forma",
    header: "Forma",
    cellClassName: "text-xs",
    cell: (t) => labelOf(FORMA_OPTIONS, t.forma_default),
  },
  {
    key: "umbral",
    header: "Umbral alerta",
    headClassName: "text-right",
    cellClassName: "text-right text-sm font-mono",
    cell: (t) => (t.forma_default === "PERMANENTE" ? "—" : `${t.umbral_alerta_dias} días`),
  },
  {
    key: "critico",
    header: "Crítico",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (t) =>
      t.es_critico ? (
        <span
          title="Vencido: avión en rojo + recordatorio semanal a administración (no bloquea asignar)"
          className="inline-flex items-center text-destructive"
        >
          <ExclamationTriangleIcon className="h-4 w-4" />
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (t) =>
      t.activo ? (
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
    cell: (t) => <DocumentTypeActions documentType={t} />,
  },
];

export function DocumentTypesTable({ tipos }: { tipos: DocumentType[] }) {
  return <DataTable columns={columns} rows={tipos} rowKey={(t) => t.id} />;
}
