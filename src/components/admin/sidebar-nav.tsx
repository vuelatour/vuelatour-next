"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { filterNavGroupsForRole } from "@/lib/admin/nav-items";
import { useConteoPorFacturar } from "@/hooks/use-conteo-por-facturar";
import type { Rol } from "@/types/me";

interface SidebarNavProps {
  rol: Rol;
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Importa NAV_GROUPS (con sus íconos) localmente en el cliente. El padre
 * solo pasa el rol como string. Esto evita serializar funciones React
 * (componentes de Heroicons) por la frontera Server→Client de Next 16/React 19.
 */
export function SidebarNav({ rol, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const groups = filterNavGroupsForRole(rol);
  // Badge «por facturar» (24-sep-2026): solo si el rol ve el ítem que lo
  // lleva. El conteo se comparte entre las dos instancias del menú.
  const conBadge = groups.some((g) => g.items.some((i) => i.badge === "por_facturar"));
  const porFacturar = useConteoPorFacturar(conBadge);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 mb-2 text-[10px] uppercase tracking-wider text-navy-400 font-semibold">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const badge =
              item.badge === "por_facturar" && porFacturar != null && porFacturar > 0
                ? porFacturar
                : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-navy-200 hover:bg-navy-800 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {badge != null && (
                  <span
                    className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white tabular-nums"
                    aria-label={`${badge} ${badge === 1 ? "vuelo" : "vuelos"} por facturar`}
                    title={`${badge} ${badge === 1 ? "vuelo pide" : "vuelos piden"} factura y aún no está registrada`}
                  >
                    {badge}
                  </span>
                )}
                {item.comingSoon && !active && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-navy-800 text-navy-300 group-hover:bg-navy-700">
                    Próx.
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
