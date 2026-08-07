"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FondoActions } from "./fondo-actions";
import type { CajaFondo } from "@/types/caja-chica";

const money = (n: number, moneda: string) =>
  n.toLocaleString("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 2 });

export function FondosTable({
  fondos,
  usuarios,
}: {
  fondos: CajaFondo[];
  usuarios: { id: string; nombre: string }[];
}) {
  const columns: Array<DataTableColumn<CajaFondo>> = [
    {
      key: "persona",
      header: "Persona",
      cellClassName: "font-medium",
      cell: (f) => f.usuario?.nombre ?? "—",
    },
    {
      key: "rol",
      header: "Rol",
      cellClassName: "text-muted-foreground",
      cell: (f) => f.usuario?.rol ?? "—",
    },
    {
      key: "moneda",
      header: "Moneda",
      cellClassName: "text-muted-foreground",
      cell: (f) => f.moneda,
    },
    {
      key: "saldo",
      header: "Saldo",
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums font-medium",
      cell: (f) => (
        // Acumulada: el número es lo POR REPONER (crece al gastar) — ámbar
        // cuando hay deuda, nunca "rojo de sobregiro".
        <span
          className={
            f.es_acumulada
              ? f.saldo > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
              : f.saldo < 0
                ? "text-destructive"
                : undefined
          }
        >
          {money(f.saldo, f.moneda)}
          {f.es_acumulada && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              por reponer
            </span>
          )}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      // La celda de acciones no debe navegar al abrir el menú.
      noLink: true,
      cell: (f) => <FondoActions fondo={f} usuarios={usuarios} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={fondos}
      rowKey={(f) => f.id}
      rowHref={(f) => `/admin/caja-chica/${f.id}`}
    />
  );
}
