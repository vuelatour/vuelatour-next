"use client";

import { fmtDateOnly } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import {
  RecibidaActions,
  type GastoOption,
} from "@/components/admin/recibidas/recibida-actions";
import type { FacturaRecibida } from "@/types/invoices";

const ESTADO: Record<FacturaRecibida["estado"], { label: string; cls: string }> = {
  SIN_CLASIFICAR: {
    label: "Sin clasificar",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  CLASIFICADA: {
    label: "Clasificada",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  DESCARTADA: { label: "Descartada", cls: "bg-muted text-muted-foreground border-border" },
};

const fmtDate = fmtDateOnly;

function fmtMoney(v: string | null, moneda: string | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda ?? ""}`.trim();
}

export function RecibidasTable({
  recibidas,
  gastos,
}: {
  recibidas: FacturaRecibida[];
  gastos: GastoOption[];
}) {
  const columns: Array<DataTableColumn<FacturaRecibida>> = [
    {
      key: "emisor",
      header: "Emisor",
      cell: (r) => (
        <>
          <p className="font-medium">{r.emisor_nombre ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground font-mono">{r.emisor_rfc ?? ""}</p>
        </>
      ),
    },
    {
      key: "conceptos",
      header: "Conceptos",
      cellClassName: "max-w-xs",
      cell: (r) => <p className="text-sm truncate">{r.conceptos_resumen ?? "—"}</p>,
    },
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "text-sm text-muted-foreground",
      cell: (r) => fmtDate(r.fecha_emision),
    },
    {
      key: "total",
      header: "Total",
      headClassName: "text-right",
      cellClassName: "text-right font-mono text-sm",
      cell: (r) => fmtMoney(r.total, r.moneda),
    },
    {
      key: "gasto",
      header: "Gasto",
      cellClassName: "text-sm text-muted-foreground",
      cell: (r) =>
        r.gastos && r.gastos.length > 1 ? (
          <span title={r.gastos.map((g) => `${g.categoria} · ${fmtMoney(g.monto, g.moneda)}`).join("\n")}>
            {r.gastos.length} gastos ·{" "}
            {fmtMoney(
              String(r.gastos.reduce((acc, g) => acc + Number(g.monto), 0)),
              r.gastos[0]?.moneda ?? r.moneda,
            )}
          </span>
        ) : r.gastos && r.gastos.length === 1 ? (
          `${r.gastos[0].categoria} · ${fmtMoney(r.gastos[0].monto, r.gastos[0].moneda)}`
        ) : r.gasto ? (
          `${r.gasto.categoria} · ${fmtMoney(r.gasto.monto, r.gasto.moneda)}`
        ) : (
          "—"
        ),
    },
    {
      key: "estado",
      header: "Estado",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (r) => (
        <Badge variant="outline" className={ESTADO[r.estado].cls}>
          {ESTADO[r.estado].label}
        </Badge>
      ),
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      noLink: true,
      cell: (r) => <RecibidaActions recibida={r} gastos={gastos} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={recibidas}
      rowKey={(r) => r.id}
      searchText={(r) =>
        `${r.emisor_nombre ?? ""} ${r.emisor_rfc ?? ""} ${r.uuid_fiscal ?? ""} ${r.conceptos_resumen ?? ""}`
      }
      searchPlaceholder="Buscar factura (emisor, RFC, UUID, concepto)…"
    />
  );
}
