import { UserCircleIcon } from "@heroicons/react/24/outline";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
import { UserActions } from "@/components/admin/users/user-actions";
import { UserInviteButton } from "@/components/admin/users/user-invite-button";
import { getMe } from "@/lib/api/me";
import { listUsers } from "@/lib/api/users-server";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const ESTADO_STYLES: Record<string, string> = {
  ACTIVO:
    "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20",
  INVITADO:
    "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
  INACTIVO: "bg-muted text-muted-foreground border-border",
};

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
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <UserCircleIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin usuarios</CardTitle>
            <CardDescription>
              Cuando alguien se loguee con Google aparecerá aquí.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Fondo</TableHead>
                  <TableHead className="text-center">Tarjeta</TableHead>
                  <TableHead className="text-center">Externo</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === me.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.nombre} />}
                            <AvatarFallback className="bg-brand-600/15 text-brand-600 text-xs">
                              {initials(u.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium flex items-center gap-2">
                              {u.nombre}
                              {isSelf && (
                                <Badge variant="outline" className="text-[10px]">Tú</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {u.rol}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={ESTADO_STYLES[u.estado] ?? ""}>{u.estado}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {u.tiene_fondo_caja ? "✓" : "—"}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {u.tarjeta_terminacion ? `**** ${u.tarjeta_terminacion}` : "—"}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {u.es_piloto_externo ? "✓" : "—"}
                      </TableCell>
                      <TableCell>
                        <UserActions user={u} isSelf={isSelf} />
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
