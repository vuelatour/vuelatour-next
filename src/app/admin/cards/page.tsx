import { CreditCardIcon } from "@heroicons/react/24/outline";
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
import { CardActions } from "@/components/admin/cards/card-actions";
import { CardCreateButton } from "@/components/admin/cards/card-create-button";
import { apiServer } from "@/lib/api/server";
import { listCards } from "@/lib/api/cards-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";

export const dynamic = "force-dynamic";

interface UsuarioMinimo {
  id: string;
  nombre: string;
  email: string;
}

interface UsuarioListResponse {
  data: UsuarioMinimo[];
}

export default async function CardsPage() {
  const [cardsRes, accountsRes, usersRes] = await Promise.all([
    listCards({ limit: 200 }),
    listBankAccounts({ limit: 200, activa: true }),
    apiServer<UsuarioListResponse>("/v1/users", {
      searchParams: { limit: 200 },
      cache: "no-store",
    }),
  ]);

  const cards = cardsRes.data;
  const count = cardsRes.count;
  const users = usersRes.data.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email }));
  const bankAccounts = accountsRes.data.map((a) => ({
    id: a.id,
    alias: a.alias,
    banco: a.banco,
  }));

  const userById = new Map(users.map((u) => [u.id, u]));
  const accountById = new Map(bankAccounts.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Tarjetas corporativas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "tarjeta registrada" : "tarjetas registradas"}.
          </p>
        </div>
        <CardCreateButton users={users} bankAccounts={bankAccounts} />
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CreditCardIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin tarjetas registradas</CardTitle>
            <CardDescription>
              Registra la primera tarjeta y vincúlala a un titular.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Terminación</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Usuario vinculado</TableHead>
                  <TableHead>Banco / Cuenta</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => {
                  const linkedUser = c.usuario_id ? userById.get(c.usuario_id) : null;
                  const linkedAccount = c.cuenta_bancaria_id
                    ? accountById.get(c.cuenta_bancaria_id)
                    : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">**** {c.terminacion}</TableCell>
                      <TableCell>{c.nombre_titular}</TableCell>
                      <TableCell>
                        {linkedUser ? (
                          <div className="text-xs">
                            <div className="font-medium">{linkedUser.nombre}</div>
                            <div className="text-muted-foreground">{linkedUser.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin vincular</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {c.banco && <div>{c.banco}</div>}
                          {linkedAccount && (
                            <div className="text-muted-foreground">{linkedAccount.alias}</div>
                          )}
                          {!c.banco && !linkedAccount && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.activa ? (
                          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                            Activa
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <CardActions card={c} users={users} bankAccounts={bankAccounts} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
