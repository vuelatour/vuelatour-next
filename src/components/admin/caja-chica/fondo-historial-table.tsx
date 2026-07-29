"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import type { Gasto } from "@/types/expenses";

/** Fila-viewmodel SERIALIZABLE que arma la página (server) del fondo. */
export interface MovimientoFondoRow {
  key: string;
  fechaFmt: string;
  tipoLabel: string;
  esGasto: boolean;
  descripcion: string | null;
  negativo: boolean;
  /** Monto absoluto ya formateado en la moneda del fondo. */
  montoAbsFmt: string;
  saldoFmt: string;
  /** Vuelo del gasto: el folio enlaza a su detalle (auditar el efectivo). */
  vueloId: string | null;
  vueloFolio: number | null;
  /** Gasto editable desde aquí (solo movimientos con origen "gasto"). */
  gasto: Gasto | null;
  /** URL firmada de la foto del comprobante, si tiene. */
  fotoUrl?: string;
}

export function FondoHistorialTable({
  movimientos,
  aircraft,
  providers,
}: {
  movimientos: MovimientoFondoRow[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}) {
  const columns: Array<DataTableColumn<MovimientoFondoRow>> = [
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "whitespace-nowrap align-top",
      cell: (m) => m.fechaFmt,
    },
    {
      key: "concepto",
      header: "Concepto",
      // La descripción (desglose del gasto) ENVUELVE con sus saltos de línea
      // en vez de alargar la tabla: todo se lee sin scroll horizontal.
      cellClassName: "align-top max-w-xl",
      cell: (m) => (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            {m.tipoLabel}
            {m.esGasto && (
              <Badge variant="outline" className="text-muted-foreground">
                gasto
              </Badge>
            )}
            {m.vueloId && m.vueloFolio != null && (
              <Link
                href={`/admin/flights/${m.vueloId}`}
                className="font-mono text-xs text-brand-600 hover:underline"
                title="Abrir el detalle del vuelo de este gasto"
              >
                #{m.vueloFolio}
              </Link>
            )}
          </span>
          {m.descripcion && (
            <span className="text-xs text-muted-foreground whitespace-pre-line break-words">
              {m.descripcion}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "monto",
      header: "Monto",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap align-top",
      cell: (m) => (
        <span className={m.negativo ? "text-destructive" : "text-emerald-600"}>
          {m.negativo ? "−" : "+"}
          {m.montoAbsFmt}
        </span>
      ),
    },
    {
      key: "saldo",
      header: "Saldo",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap align-top text-muted-foreground",
      cell: (m) => m.saldoFmt,
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      // Editar/eliminar el gasto sin salir de caja chica; al cambiar el medio
      // de pago (p.ej. era tarjeta), el movimiento desaparece del fondo
      // automáticamente.
      cell: (m) =>
        m.gasto && (
          <ExpenseActions
            gasto={m.gasto}
            aircraft={aircraft}
            providers={providers}
            fotoUrl={m.fotoUrl}
          />
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.key}
      searchText={(m) =>
        `${m.fechaFmt} ${m.tipoLabel} ${m.descripcion ?? ""} ${
          m.vueloFolio != null ? `#${m.vueloFolio}` : ""
        }`
      }
      searchPlaceholder="Buscar movimiento (concepto, descripción, vuelo, fecha)…"
    />
  );
}
