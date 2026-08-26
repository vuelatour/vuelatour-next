"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MEDIO_PAGO_LABELS } from "@/components/admin/expenses/expenses-table";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";

/** Fila serializable armada por el server component de /admin/gastos-personales. */
export interface GastoPersonalRow {
  id: string;
  fecha_gasto: string | null;
  /** Primera línea de notas · proveedor. */
  descripcion: string | null;
  notas: string | null;
  /** Total pagado (propina incluida): no se desglosa aquí. */
  monto: number;
  moneda: string;
  medio_pago: string;
  /** Nombre de quien capturó el gasto. */
  capturo: string | null;
  /** Path del comprobante en el bucket privado (decide imagen vs PDF). */
  foto_path: string | null;
  /** URL firmada del comprobante (el server la firma al cargar la página). */
  foto_url: string | null;
}

/** Resumen del mes de UNA moneda (nunca se mezclan MXN y USD). */
export interface GastosPersonalesResumenMoneda {
  moneda: string;
  total: number;
  cantidad: number;
  /** Desglose por medio de pago (código crudo; el label se resuelve aquí). */
  porMedio: Array<{ medio: string; total: number }>;
}

const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

/**
 * Cards del mes POR MONEDA: total y # de gastos, con el desglose por medio
 * de pago (label legible de MEDIO_PAGO_LABELS, fallback al código crudo).
 */
export function GastosPersonalesResumen({
  resumen,
}: {
  resumen: GastosPersonalesResumenMoneda[];
}) {
  if (resumen.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {resumen.map((r) => (
        <Card key={r.moneda}>
          <CardContent className="space-y-2 p-4">
            <div>
              <p className="text-xs text-muted-foreground">
                Total del mes ({r.moneda})
              </p>
              <p className="font-mono text-xl font-semibold">
                {fmtMonto(r.total, r.moneda)}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.cantidad} {r.cantidad === 1 ? "gasto" : "gastos"}
              </p>
            </div>
            <div className="space-y-1 border-t border-border pt-2">
              {r.porMedio.map((m) => (
                <div
                  key={m.medio}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground">
                    {MEDIO_PAGO_LABELS[m.medio] ?? m.medio}
                  </span>
                  <span className="font-mono font-medium">
                    {fmtMonto(m.total, r.moneda)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Tabla de seguimiento de gastos personales del dueño (solo lectura). */
export function GastosPersonalesTable({ gastos }: { gastos: GastoPersonalRow[] }) {
  const columns = useMemo<Array<DataTableColumn<GastoPersonalRow>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (g) => fmtDateOnly(g.fecha_gasto),
      },
      {
        key: "descripcion",
        header: "Descripción",
        cell: (g) =>
          g.descripcion ? (
            <span
              className="block max-w-[280px] truncate text-xs text-muted-foreground"
              title={g.notas ?? g.descripcion}
            >
              {g.descripcion}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        // El monto ES el total pagado (propina incluida): no se desglosa.
        cell: (g) => fmtMonto(g.monto, g.moneda),
      },
      {
        key: "pago",
        header: "Medio de pago",
        cellClassName: "whitespace-nowrap",
        cell: (g) => (
          <span className="text-xs">
            {MEDIO_PAGO_LABELS[g.medio_pago] ?? g.medio_pago}
          </span>
        ),
      },
      {
        key: "capturo",
        header: "Capturó",
        cellClassName: "text-muted-foreground",
        cell: (g) => g.capturo ?? "—",
      },
      {
        key: "comprobante",
        header: "Comp.",
        cell: (g) =>
          g.foto_path && g.foto_url ? (
            <ComprobantePreview
              path={g.foto_path}
              url={g.foto_url}
              alt="Comprobante · Gasto personal"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      rows={gastos}
      rowKey={(g) => g.id}
      searchText={(g) =>
        [
          g.descripcion ?? "",
          g.notas ?? "",
          g.medio_pago,
          MEDIO_PAGO_LABELS[g.medio_pago] ?? "",
          g.capturo ?? "",
        ].join(" ")
      }
      searchPlaceholder="Buscar gasto (descripción, medio de pago, quién capturó)…"
    />
  );
}
