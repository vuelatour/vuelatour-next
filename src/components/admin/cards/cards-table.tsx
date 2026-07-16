"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { CardActions } from "@/components/admin/cards/card-actions";
import type {
  BankAccountOption,
  UserOption,
} from "@/components/admin/cards/card-form-dialog";
import type { Card } from "@/types/cards";

export function CardsTable({
  cards,
  users,
  bankAccounts,
}: {
  cards: Card[];
  users: UserOption[];
  bankAccounts: BankAccountOption[];
}) {
  const columns = useMemo<Array<DataTableColumn<Card>>>(() => {
    const userById = new Map(users.map((u) => [u.id, u]));
    const accountById = new Map(bankAccounts.map((b) => [b.id, b]));
    return [
      {
        key: "terminacion",
        header: "Terminación",
        cellClassName: "font-mono font-semibold",
        cell: (c) => `**** ${c.terminacion}`,
      },
      {
        key: "titular",
        header: "Titular",
        cell: (c) => c.nombre_titular,
      },
      {
        key: "usuario",
        header: "Usuario vinculado",
        cell: (c) => {
          const linkedUser = c.usuario_id ? userById.get(c.usuario_id) : null;
          return linkedUser ? (
            <div className="text-xs">
              <div className="font-medium">{linkedUser.nombre}</div>
              <div className="text-muted-foreground">{linkedUser.email}</div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin vincular</span>
          );
        },
      },
      {
        key: "banco",
        header: "Banco / Cuenta",
        cell: (c) => {
          const linkedAccount = c.cuenta_bancaria_id
            ? accountById.get(c.cuenta_bancaria_id)
            : null;
          return (
            <div className="text-xs space-y-0.5">
              {c.banco && <div>{c.banco}</div>}
              {linkedAccount && (
                <div className="text-muted-foreground">{linkedAccount.alias}</div>
              )}
              {!c.banco && !linkedAccount && (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          );
        },
      },
      {
        key: "estado",
        header: "Estado",
        headClassName: "text-center",
        cellClassName: "text-center",
        cell: (c) =>
          c.activa ? (
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
        cell: (c) => (
          <CardActions card={c} users={users} bankAccounts={bankAccounts} />
        ),
      },
    ];
  }, [users, bankAccounts]);

  return <DataTable columns={columns} rows={cards} rowKey={(c) => c.id} />;
}
