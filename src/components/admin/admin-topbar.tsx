"use client";

import { useState } from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UserMenu } from "./user-menu";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";
import { SidebarFooter } from "./sidebar-footer";
import { filterNavGroupsForRole } from "@/lib/admin/nav-items";
import type { MeResponse } from "@/types/me";

export function AdminTopbar({ me, pageTitle }: { me: MeResponse; pageTitle?: string }) {
  const [open, setOpen] = useState(false);
  const groups = filterNavGroupsForRole(me.rol);

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menú"
          >
            <Bars3Icon className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 p-0 sm:max-w-72 bg-navy-900 border-navy-800 text-white"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menú de navegación</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full">
              <SidebarBrand />
              <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
              <SidebarFooter />
            </div>
          </SheetContent>
        </Sheet>
        {pageTitle && (
          <h1 className="text-base md:text-lg font-semibold truncate">{pageTitle}</h1>
        )}
      </div>
      <UserMenu me={me} />
    </header>
  );
}
