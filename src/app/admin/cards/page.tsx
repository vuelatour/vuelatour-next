import { CreditCardIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { CardsTable } from "@/components/admin/cards/cards-table";
import { CardCreateButton } from "@/components/admin/cards/card-create-button";
import { apiServer } from "@/lib/api/server";
import { listCards } from "@/lib/api/cards-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { EmptyState } from "@/components/admin/empty-state";

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
        <EmptyState
            icon={CreditCardIcon}
            title="Sin tarjetas registradas"
            description="Registra la primera tarjeta y vincúlala a un titular."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <CardsTable cards={cards} users={users} bankAccounts={bankAccounts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
