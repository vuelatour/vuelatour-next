import { BanknotesIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { BankAccountsTable } from "@/components/admin/bank-accounts/bank-accounts-table";
import { BankAccountCreateButton } from "@/components/admin/bank-accounts/bank-account-create-button";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  const { data: accounts, count } = await listBankAccounts({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cuentas bancarias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "cuenta activa" : "cuentas activas"} para operación financiera.
          </p>
        </div>
        <BankAccountCreateButton />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
            icon={BanknotesIcon}
            title="Sin cuentas registradas"
            description="Crea la primera cuenta para empezar a registrar movimientos."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <BankAccountsTable accounts={accounts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
