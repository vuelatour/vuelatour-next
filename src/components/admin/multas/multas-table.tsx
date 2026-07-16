"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MultaActions } from "@/components/admin/multas/multa-actions";
import { fmtDateOnly } from "@/lib/datetime";
import type { Multa, MultaEstado } from "@/types/multas";

const ESTADO: Record<MultaEstado, { label: string; cls: string }> = {
  PENDIENTE: {
    label: "Pendiente",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  PAGADA: {
    label: "Pagada",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  CANCELADA: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};

function fmtMoney(v: string | null, moneda: string): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}

interface MultasTableProps {
  multas: Multa[];
  aircraft: Array<{ id: string; matricula: string }>;
  pilots: Array<{ id: string; nombre: string }>;
}

export function MultasTable({ multas, aircraft, pilots }: MultasTableProps) {
  const columns: Array<DataTableColumn<Multa>> = [
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "text-sm text-muted-foreground whitespace-nowrap",
      cell: (m) => fmtDateOnly(m.fecha),
    },
    {
      key: "descripcion",
      header: "Descripción",
      cellClassName: "max-w-xs",
      cell: (m) => <p className="text-sm truncate">{m.descripcion}</p>,
    },
    {
      key: "avion",
      header: "Avión",
      cellClassName: "font-mono text-sm",
      cell: (m) => m.aeronave?.matricula ?? "—",
    },
    {
      key: "piloto",
      header: "Piloto",
      cellClassName: "text-sm",
      cell: (m) => m.piloto?.nombre ?? "—",
    },
    {
      key: "autoridad",
      header: "Autoridad",
      cellClassName: "text-sm text-muted-foreground",
      cell: (m) => m.autoridad ?? "—",
    },
    {
      key: "monto",
      header: "Monto",
      headClassName: "text-right",
      cellClassName: "text-right font-mono text-sm",
      cell: (m) => fmtMoney(m.monto, m.moneda),
    },
    {
      key: "estado",
      header: "Estado",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (m) => (
        <Badge variant="outline" className={ESTADO[m.estado].cls}>
          {ESTADO[m.estado].label}
        </Badge>
      ),
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      noLink: true,
      cell: (m) => <MultaActions multa={m} aircraft={aircraft} pilots={pilots} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={multas}
      rowKey={(m) => m.id}
      searchText={(m) =>
        `${m.descripcion} ${m.aeronave?.matricula ?? ""} ${m.piloto?.nombre ?? ""} ${m.autoridad ?? ""}`
      }
      searchPlaceholder="Buscar multa (concepto, matrícula, autoridad)…"
    />
  );
}
