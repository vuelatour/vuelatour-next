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

/**
 * Fila-viewmodel serializable armada por la página. Los derivados (horas de
 * vida, desde OVH, restantes) vienen del API: aquí solo se pintan.
 */
export interface EngineRow {
  id: string;
  aeronave_id: string;
  matricula: string;
  posicion: string;
  numero_serie: string;
  tipo: string;
  horas_vida: number | null;
  desde_ovh: number | null;
  tbo_horas: string | null;
  rest: number | null;
  estado: "vencido" | "proximo" | "ok" | "sin_tbo";
}

export function estadoOverhaulBadge(estado: EngineRow["estado"]) {
  switch (estado) {
    case "vencido":
      return (
        <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
          Overhaul vencido
        </Badge>
      );
    case "proximo":
      return (
        <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
          Próximo
        </Badge>
      );
    case "ok":
      return (
        <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
          OK
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Sin TBO
        </Badge>
      );
  }
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
    key: "horas_vida",
    header: "Horas de vida",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => (e.horas_vida != null ? fmtDecimal(e.horas_vida, 1) : "—"),
  },
  {
    key: "desde_ovh",
    header: "Desde OVH",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => (e.desde_ovh != null ? fmtDecimal(e.desde_ovh, 1) : "—"),
  },
  {
    key: "tbo",
    header: "TBO",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) => (e.tbo_horas ? fmtDecimal(e.tbo_horas) : "—"),
  },
  {
    key: "restantes",
    header: "Restantes",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (e) =>
      e.rest == null ? (
        "—"
      ) : e.estado === "vencido" ? (
        <span className="text-destructive font-semibold">{fmtDecimal(e.rest, 1)}</span>
      ) : (
        fmtDecimal(e.rest, 1)
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (e) => estadoOverhaulBadge(e.estado),
  },
];

export function EnginesTable({ engines }: { engines: EngineRow[] }) {
  return <DataTable columns={columns} rows={engines} rowKey={(e) => e.id} />;
}
