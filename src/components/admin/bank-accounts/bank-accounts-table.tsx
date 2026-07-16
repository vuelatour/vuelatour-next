"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { BankAccountActions } from "@/components/admin/bank-accounts/bank-account-actions";
import type { BankAccount } from "@/types/bank-accounts";

const RAZON_LABELS: Record<string, string> = {
  AEROCHARTER: "Aerocharter",
  AERODINAMICA: "Aerodinámica",
  OTRA: "Otra",
};

const columns: Array<DataTableColumn<BankAccount>> = [
  {
    key: "alias",
    header: "Alias",
    cellClassName: "font-medium",
    cell: (a) => a.alias,
  },
  {
    key: "banco",
    header: "Banco",
    cell: (a) => a.banco,
  },
  {
    key: "moneda",
    header: "Moneda",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => (
      <Badge variant="outline" className="font-mono text-xs">
        {a.moneda}
      </Badge>
    ),
  },
  {
    key: "razon",
    header: "Razón social",
    cellClassName: "text-xs",
    cell: (a) => RAZON_LABELS[a.razon_social] ?? a.razon_social,
  },
  {
    key: "cuenta",
    header: "Cuenta / CLABE",
    cell: (a) => (
      <div className="text-xs font-mono space-y-0.5">
        {a.numero_cuenta && <div>{a.numero_cuenta}</div>}
        {a.clabe && <div className="text-muted-foreground">{a.clabe}</div>}
        {!a.numero_cuenta && !a.clabe && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) =>
      a.activa ? (
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
          Activa
        </Badge>
      ) : (
        <Badge variant="secondary">Inactiva</Badge>
      ),
  },
  {
    key: "acciones",
    header: "",
    headClassName: "w-12",
    noLink: true,
    cell: (a) => <BankAccountActions account={a} />,
  },
];

export function BankAccountsTable({ accounts }: { accounts: BankAccount[] }) {
  return <DataTable columns={columns} rows={accounts} rowKey={(a) => a.id} />;
}
