"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import {
  estadoOverhaulBadge,
  type EngineRow,
} from "@/components/admin/engines/engines-table";
import { fmtDecimal } from "@/lib/format";

const POSICION: Record<string, string> = {
  UNICA: "Única",
  IZQUIERDA: "Izquierda",
  DERECHA: "Derecha",
};

/**
 * Fila-viewmodel serializable armada por la página: MISMA tabla que los
 * motores (sin Tipo). Los derivados vienen del API — aquí solo se pintan.
 */
export interface PropellerRow {
  id: string;
  aeronave_id: string;
  matricula: string;
  posicion: string;
  numero_serie: string;
  horas_vida: number | null;
  desde_ovh: number | null;
  tbo_horas: string | null;
  rest: number | null;
  estado: EngineRow["estado"];
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
    key: "horas_vida",
    header: "Horas de vida",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) => (p.horas_vida != null ? fmtDecimal(p.horas_vida, 1) : "—"),
  },
  {
    key: "desde_ovh",
    header: "Desde OVH",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) => (p.desde_ovh != null ? fmtDecimal(p.desde_ovh, 1) : "—"),
  },
  {
    key: "tbo",
    header: "TBO",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) => (p.tbo_horas ? fmtDecimal(p.tbo_horas) : "—"),
  },
  {
    key: "restantes",
    header: "Restantes",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (p) =>
      p.rest == null ? (
        "—"
      ) : p.estado === "vencido" ? (
        <span className="text-destructive font-semibold">{fmtDecimal(p.rest, 1)}</span>
      ) : (
        fmtDecimal(p.rest, 1)
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (p) => estadoOverhaulBadge(p.estado),
  },
];

export function PropellersTable({ propellers }: { propellers: PropellerRow[] }) {
  return <DataTable columns={columns} rows={propellers} rowKey={(p) => p.id} />;
}
