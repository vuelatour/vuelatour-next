"use client";

import { useMemo } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { UserActions } from "@/components/admin/users/user-actions";
import type { User } from "@/types/users";

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

/**
 * Dispositivos con avisos push (3-sep-2026): "Sin app" en rojo = a este
 * usuario NO le llegan avisos (eventos, vuelos) — oficina debe hablarle por
 * otro medio. "—" = piloto externo (nunca usa la app) o API sin el dato.
 */
function PushBadge({ user: u }: { user: User }) {
  if (u.es_piloto_externo) {
    return (
      <span className="text-xs text-muted-foreground" title="Piloto externo: no usa la app.">
        —
      </span>
    );
  }
  if (u.push_dispositivos === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (u.push_dispositivos === 0) {
    return (
      <Badge
        className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20"
        title="No tiene la app con notificaciones permitidas: no recibirá avisos push. Pídele que abra la app y acepte las notificaciones."
      >
        Sin app
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="font-mono text-[11px]"
      title="Dispositivos con avisos push activos."
    >
      {u.push_dispositivos} disp.
    </Badge>
  );
}

function buildColumns(meId: string): Array<DataTableColumn<User>> {
  return [
    {
      key: "usuario",
      header: "Usuario",
      cell: (u) => (
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
              {u.id === meId && (
                <Badge variant="outline" className="text-[10px]">Tú</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "rol",
      header: "Rol",
      cell: (u) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-xs">
            {u.rol}
          </Badge>
          {u.es_piloto && u.rol !== "PILOTO" && (
            <Badge
              variant="outline"
              className="font-mono text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
              title="Doble rol: también vuela — aparece en los selectores de piloto y suma horas."
            >
              +PILOTO
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (u) => <Badge className={ESTADO_STYLES[u.estado] ?? ""}>{u.estado}</Badge>,
    },
    {
      key: "push",
      header: "Push",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (u) => <PushBadge user={u} />,
    },
    {
      key: "fondo",
      header: "Fondo",
      headClassName: "text-center",
      cellClassName: "text-center text-xs",
      cell: (u) => (u.tiene_fondo_caja ? "✓" : "—"),
    },
    {
      key: "tarjeta",
      header: "Tarjeta",
      headClassName: "text-center",
      cellClassName: "text-center font-mono text-xs",
      cell: (u) => (u.tarjeta_terminacion ? `**** ${u.tarjeta_terminacion}` : "—"),
    },
    {
      key: "externo",
      header: "Externo",
      headClassName: "text-center",
      cellClassName: "text-center text-xs",
      cell: (u) => (u.es_piloto_externo ? "✓" : "—"),
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-12",
      noLink: true,
      cell: (u) => <UserActions user={u} isSelf={u.id === meId} />,
    },
  ];
}

export function UsersTable({ users, meId }: { users: User[]; meId: string }) {
  const columns = useMemo(() => buildColumns(meId), [meId]);
  return (
    <DataTable
      columns={columns}
      rows={users}
      rowKey={(u) => u.id}
      searchText={(u) => `${u.nombre} ${u.email ?? ""} ${u.rol}`}
      searchPlaceholder="Buscar usuario (nombre, correo, rol)…"
    />
  );
}
