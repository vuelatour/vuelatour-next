import { NAV_GROUPS } from "./nav-items";

/** Páginas fuera del sidebar que igual queremos titular en el topbar. */
const EXTRA_TITLES: Record<string, string> = {
  "/admin/account": "Mi cuenta",
};

/**
 * Mapea un pathname a un título legible buscando en nav-items.
 * Si no encuentra match exacto, intenta el prefijo más largo que coincida.
 * Si todo falla, devuelve undefined (el topbar no muestra título).
 */
export function getPageTitleFromPathname(pathname: string): string | undefined {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];

  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  const exact = allItems.find((i) => i.href === pathname);
  if (exact) return exact.label;

  // Match por prefijo (ej. /admin/aircraft/abc-123 -> "Aeronaves")
  const sorted = [...allItems].sort((a, b) => b.href.length - a.href.length);
  for (const item of sorted) {
    if (item.href === "/admin") continue; // /admin matchea todo, lo manejamos arriba
    if (pathname.startsWith(`${item.href}/`)) return item.label;
  }

  if (pathname === "/admin") return "Dashboard";
  return undefined;
}
