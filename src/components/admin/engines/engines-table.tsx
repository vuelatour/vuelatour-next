"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDecimal } from "@/lib/format";

const POSICION: Record<string, string> = {
  UNICO: "Único",
  IZQUIERDO: "Izquierdo",
  DERECHO: "Derecho",
};

/** Fila-viewmodel serializable armada por la página (matrícula ya resuelta). */
export interface EngineRow {
  id: string;
  aeronave_id: string;
  matricula: string;
  posicion: string;
  numero_serie: string;
  tipo: string;
  horas_totales: string;
  turm: string;
  tbo_horas: string;
  rest: number;
  estado: "vencido" | "proximo" | "ok";
}

const columns: Array<DataTableColumn<EngineRow>> = [
  {
    key: "aeronave",
    header: "Aeronave",
    cell: (e) => (
      <Link
        href={`/admin/aircraft/${e.aeronave_id}`}
        className="font-mono font-semibold hover:underline"
      >
        {e.matricula}
      </Link>
    ),
  },
  {
    key: "posicion",
    header: "Posición",
    cell: (e) => POSICION[e.posicion] ?? e.posicion,
  },
  {
    key: "serie",
    header: "Serie",
    cellClassName: "font-mono text-xs",
    cell: (e) => e.numero_serie,
  },
  {
    key: "tipo",
    header: "Tipo",
    cell: (e) => (
      <Badge variant="outline" className="text-xs">
        {e.tipo}
      </Badge>
    ),
  },
  {
    key: "horas_totales",
    header: "Horas totales",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => fmtDecimal(e.horas_totales),
  },
  {
    key: "turm",
    header: "TURM",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => fmtDecimal(e.turm),
  },
  {
    key: "tbo",
    header: "TBO",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => fmtDecimal(e.tbo_horas),
  },
  {
    key: "restantes",
    header: "Restantes",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) =>
      e.estado === "vencido" ? (
        <span className="text-destructive font-semibold">{fmtDecimal(e.rest)}</span>
      ) : (
        fmtDecimal(e.rest)
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (e) =>
      e.estado === "vencido" ? (
        <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
          Overhaul vencido
        </Badge>
      ) : e.estado === "proximo" ? (
        <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
          Próximo
        </Badge>
      ) : (
        <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
          OK
        </Badge>
      ),
  },
];

export function EnginesTable({ engines }: { engines: EngineRow[] }) {
  return <DataTable columns={columns} rows={engines} rowKey={(e) => e.id} />;
}
