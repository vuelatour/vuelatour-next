import { BanknotesIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BankAccountActions } from "@/components/admin/bank-accounts/bank-account-actions";
import { BankAccountCreateButton } from "@/components/admin/bank-accounts/bank-account-create-button";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const RAZON_LABELS: Record<string, string> = {
  AEROCHARTER: "Aerocharter",
  AERODINAMICA: "Aerodinámica",
  OTRA: "Otra",
};

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead className="text-center">Moneda</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead>Cuenta / CLABE</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.alias}</TableCell>
                    <TableCell>{a.banco}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono text-xs">
                        {a.moneda}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {RAZON_LABELS[a.razon_social] ?? a.razon_social}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono space-y-0.5">
                        {a.numero_cuenta && <div>{a.numero_cuenta}</div>}
                        {a.clabe && <div className="text-muted-foreground">{a.clabe}</div>}
                        {!a.numero_cuenta && !a.clabe && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {a.activa ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <BankAccountActions account={a} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
