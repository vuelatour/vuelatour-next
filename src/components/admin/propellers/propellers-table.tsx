"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDecimal } from "@/lib/format";

const POSICION: Record<string, string> = {
  UNICA: "Única",
  IZQUIERDA: "Izquierda",
  DERECHA: "Derecha",
};

/** Fila-viewmodel serializable armada por la página (matrícula ya resuelta). */
export interface PropellerRow {
  id: string;
  aeronave_id: string;
  matricula: string;
  posicion: string;
  numero_serie: string;
  fabricante: string | null;
  horas_totales: string;
  tbo_horas: string | null;
}

const columns: Array<DataTableColumn<PropellerRow>> = [
  {
    key: "aeronave",
    header: "Aeronave",
    cell: (p) => (
      <Link
        href={`/admin/aircraft/${p.aeronave_id}`}
        className="font-mono font-semibold hover:underline"
      >
        {p.matricula}
      </Link>
    ),
  },
  {
    key: "posicion",
    header: "Posición",
    cell: (p) => POSICION[p.posicion] ?? p.posicion,
  },
  {
    key: "serie",
    header: "Serie",
    cellClassName: "font-mono text-xs",
    cell: (p) => p.numero_serie,
  },
  {
    key: "fabricante",
    header: "Fabricante",
    cellClassName: "text-sm text-muted-foreground",
    cell: (p) => p.fabricante ?? "—",
  },
  {
    key: "horas_totales",
    header: "Horas totales",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) => fmtDecimal(p.horas_totales),
  },
  {
    key: "tbo",
    header: "TBO",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) => (p.tbo_horas ? `${fmtDecimal(p.tbo_horas)} hrs` : "—"),
  },
];

export function PropellersTable({ propellers }: { propellers: PropellerRow[] }) {
  return <DataTable columns={columns} rows={propellers} rowKey={(p) => p.id} />;
}
