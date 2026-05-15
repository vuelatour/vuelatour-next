"use client";

import { ArrowRightStartOnRectangleIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeResponse } from "@/types/me";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg p-1.5 pr-3 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-8 w-8">
          {me.avatar_url && <AvatarImage src={me.avatar_url} alt={me.nombre} />}
          <AvatarFallback className="bg-brand-600 text-white text-xs font-semibold">
            {initials(me.nombre)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-xs font-medium">{me.nombre}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {me.rol}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          <span className="font-medium text-sm">{me.nombre}</span>
          <span className="text-xs text-muted-foreground truncate">{me.email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => router.push("/admin/account")}
          className="gap-2"
        >
          <Cog6ToothIcon className="h-4 w-4" />
          Configuración de la cuenta
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault();
            startTransition(() => {
              void signOut();
            });
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          {pending ? "Cerrando…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
