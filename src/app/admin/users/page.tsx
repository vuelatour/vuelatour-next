import { UserCircleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { UsersTable } from "@/components/admin/users/users-table";
import { UserInviteButton } from "@/components/admin/users/user-invite-button";
import { getMe } from "@/lib/api/me";
import { listUsers } from "@/lib/api/users-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [usersRes, me] = await Promise.all([listUsers({ limit: 200 }), getMe()]);
  const { data: users, count } = usersRes;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "usuario" : "usuarios"}. Invita a alguien con su correo de Google
            o deja que entre solo si es de un dominio de la empresa; desde aquí se asigna rol y estado.
          </p>
        </div>
        <UserInviteButton />
      </div>

      {users.length === 0 ? (
        <EmptyState
            icon={UserCircleIcon}
            title="Sin usuarios"
            description="Cuando alguien se loguee con Google aparecerá aquí."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <UsersTable users={users} meId={me.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
