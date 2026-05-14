"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/admin/nav-items";

interface SidebarNavProps {
  groups: NavGroup[];
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ groups, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

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
