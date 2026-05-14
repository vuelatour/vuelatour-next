import Link from "next/link";

export function SidebarBrand() {
  return (
    <Link
      href="/admin"
      className="flex items-center gap-3 px-4 h-16 border-b border-navy-800 shrink-0"
    >
      <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center text-white text-sm font-bold tracking-tight">
        VT
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">Vuelatour</p>
        <p className="text-[10px] text-navy-400 truncate">Aero Charter Cancún</p>
      </div>
    </Link>
  );
}
