import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";
import { SidebarFooter } from "./sidebar-footer";
import { AdminTopbar } from "./admin-topbar";
import { NotificationsProvider } from "./notifications/notifications-provider";
import type { MeResponse } from "@/types/me";

interface AdminShellProps {
  me: MeResponse;
  children: React.ReactNode;
}

export function AdminShell({ me, children }: AdminShellProps) {
  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-background">
        {/* Sidebar desktop fija */}
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-navy-900 border-r border-navy-800 text-white">
          <SidebarBrand />
          <SidebarNav rol={me.rol} />
          <SidebarFooter />
        </aside>

        {/* Main column con offset por sidebar */}
        <div className="lg:pl-64 flex flex-col min-h-screen">
          <AdminTopbar me={me} />
          <main className="flex-1 px-4 lg:px-6 py-6 lg:py-8">{children}</main>
        </div>
      </div>
    </NotificationsProvider>
  );
}
