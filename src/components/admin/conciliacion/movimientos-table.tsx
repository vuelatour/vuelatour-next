"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MovimientoActions } from "@/components/admin/conciliacion/movimiento-actions";
import { fmtDateOnly } from "@/lib/datetime";
import type { MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

interface MovimientosTableProps {
  movimientos: MovimientoBancario[];
  gastos: { value: string; label: string }[];
}

export function MovimientosTable({ movimientos, gastos }: MovimientosTableProps) {
  const columns = useMemo<Array<DataTableColumn<MovimientoBancario>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (m) => fmtDate(m.fecha),
      },
      {
        key: "descripcion",
        header: "Descripción",
        cellClassName: "text-muted-foreground truncate max-w-[280px]",
        cell: (m) => m.descripcion ?? "—",
      },
      {
        key: "tipo",
        header: "Tipo",
        cell: (m) => (
          <Badge
            variant="outline"
            className={
              m.tipo === "CARGO"
                ? "border-brand-600/50 text-brand-600"
                : "border-emerald-500/50 text-emerald-600"
            }
          >
            {m.tipo === "CARGO" ? "Cargo" : "Abono"}
          </Badge>
        ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums",
        cell: (m) => fmtMoney(m.monto),
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        cell: (m) =>
          m.conciliado && m.gasto ? (
            // Verificable de un clic: al vuelo del gasto (donde se
            // ve su desglose) o, sin vuelo, a la lista de gastos.
            <Link
              href={
                m.gasto.vuelo_id
                  ? `/admin/flights/${m.gasto.vuelo_id}`
                  : "/admin/expenses"
              }
              className="text-sm text-emerald-600 hover:underline"
              title="Ver el gasto con el que se concilió"
            >
              {m.gasto.categoria} · ${fmtMoney(m.gasto.monto)}
              {m.gasto.vuelo?.folio != null && (
                <span className="text-muted-foreground"> · vuelo #{m.gasto.vuelo.folio}</span>
              )}
            </Link>
          ) : m.conciliado && m.cobro_id ? (
            m.cobro?.vuelo_id ? (
              <Link
                href={`/admin/flights/${m.cobro.vuelo_id}`}
                className="text-sm text-emerald-600 hover:underline"
                title="Ver el vuelo cuyo cobro se concilió"
              >
                Cobro de vuelo
                {m.cobro.vuelo?.folio != null && <> #{m.cobro.vuelo.folio}</>}
              </Link>
            ) : (
              <span className="text-sm text-emerald-600">Cobro de vuelo</span>
            )
          ) : (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Pendiente
            </Badge>
          ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        cell: (m) =>
          m.tipo === "CARGO" && <MovimientoActions movimiento={m} gastos={gastos} />,
      },
    ],
    [gastos],
  );

  return (
    <DataTable
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.id}
      searchText={(m) => `${m.descripcion ?? ""} ${m.monto} ${m.referencia ?? ""}`}
      searchPlaceholder="Buscar movimiento (descripción, monto, referencia)…"
    />
  );
}
