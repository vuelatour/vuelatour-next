"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import { FacturacionBadge } from "@/components/admin/expenses/facturacion-badge";
import { fmtDateOnly } from "@/lib/datetime";
import type { Gasto } from "@/types/expenses";

const ESTATUS_STYLE: Record<string, string> = {
  FACTURA: "border-emerald-500/50 text-emerald-600",
  VALE: "border-amber-500/50 text-amber-600",
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

const ORIGEN_BADGE: Record<string, { label: string; cls: string }> = {
  OFICINA: { label: "Oficina", cls: "border-sky-500/50 text-sky-600" },
  SISTEMA: { label: "Sistema", cls: "border-violet-500/50 text-violet-600" },
};

// Mismas etiquetas que el alta/verificación de gastos (fuente: expense-create).
const MEDIO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CORP: "Tarjeta corporativa",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  TRANSFERENCIA: "Transferencia",
  BODEGA: "Bodega (inventario)",
};

const fmtMoney = (monto: string, moneda: string) =>
  Number(monto).toLocaleString("es-MX", { style: "currency", currency: moneda });

export function FlightGastosTable({
  gastos,
  fotoUrls,
  aircraft,
  providers,
}: {
  gastos: Gasto[];
  fotoUrls: Record<string, string>;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}) {
  const columns: Array<DataTableColumn<Gasto>> = [
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "whitespace-nowrap align-top",
      cell: (g) => fmtDateOnly(g.fecha_gasto),
    },
    {
      key: "categoria",
      header: "Categoría",
      cellClassName: "align-top",
      cell: (g) => (
        <>
          {g.categoria}
          {g.lugar ? (
            <p className="text-[11px] text-muted-foreground font-mono">{g.lugar}</p>
          ) : null}
        </>
      ),
    },
    {
      key: "monto",
      header: "Monto",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums whitespace-nowrap align-top",
      // El monto ES el total pagado (ticket + propina): lo que llega al
      // banco. La propina solo se anota como sub-línea informativa.
      cell: (g) => (
        <>
          {fmtMoney(g.monto, g.moneda)}
          {Number(g.propina ?? 0) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              incl. propina {fmtMoney(g.propina!, g.moneda)}
            </p>
          )}
        </>
      ),
    },
    {
      key: "medio",
      header: "Pago",
      cellClassName: "align-top whitespace-nowrap text-xs",
      // Con tarjeta corporativa se enseña CUÁL pagó (el server la sella con
      // la asignada al capturador; oficina la corrige en Verificar).
      cell: (g) => (
        <>
          {MEDIO_PAGO_LABELS[g.medio_pago] ?? g.medio_pago}
          {g.medio_pago === "TARJETA_CORP" && g.tarjeta_terminacion && (
            <span className="ml-1 font-mono text-[11px] text-muted-foreground">
              **** {g.tarjeta_terminacion}
            </span>
          )}
        </>
      ),
    },
    {
      key: "desglose",
      header: "Desglose / notas",
      cellClassName: "align-top max-w-md",
      cell: (g) =>
        g.notas ? (
          <p className="text-xs text-muted-foreground whitespace-pre-line">{g.notas}</p>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "capturo",
      header: "Capturó",
      cellClassName: "align-top text-muted-foreground",
      cell: (g) => (
        <span className="inline-flex items-center gap-1.5">
          {g.captura?.nombre ?? "—"}
          {g.origen && ORIGEN_BADGE[g.origen] && (
            <Badge variant="outline" className={ORIGEN_BADGE[g.origen].cls}>
              {ORIGEN_BADGE[g.origen].label}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "comprobante",
      header: "Comp.",
      cellClassName: "align-top",
      cell: (g) => (
        <div className="flex items-center gap-2">
          {g.foto_url && fotoUrls[g.foto_url] && (
            <ComprobantePreview
              path={g.foto_url}
              url={fotoUrls[g.foto_url]}
              alt={`Comprobante · ${g.categoria}`}
            />
          )}
          <Badge
            variant="outline"
            className={ESTATUS_STYLE[g.estatus_comprobante] ?? ""}
          >
            {g.estatus_comprobante === "SIN_COMPROBANTE"
              ? "Sin comp."
              : g.estatus_comprobante === "VALE"
                ? "Vale"
                : "Factura"}
          </Badge>
        </div>
      ),
    },
    {
      // Mismo semáforo "¿ya lo facturé?" que en Gastos (oficina).
      key: "facturacion",
      header: "Facturación",
      cellClassName: "align-top",
      cell: (g) => <FacturacionBadge gasto={g} />,
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      cellClassName: "align-top",
      // Mismas acciones que en Gastos: verificar/editar, corregir el vuelo y
      // eliminar, sin salir del vuelo.
      cell: (g) => (
        <ExpenseActions
          gasto={g}
          aircraft={aircraft}
          providers={providers}
          fotoUrl={g.foto_url ? fotoUrls[g.foto_url] : undefined}
        />
      ),
    },
  ];

  return <DataTable columns={columns} rows={gastos} rowKey={(g) => g.id} />;
}
