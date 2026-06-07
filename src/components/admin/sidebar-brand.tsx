import Link from "next/link";
import { VuelatourLogo } from "@/components/icons/vuelatour-logo";

export function SidebarBrand() {
  return (
    <Link
      href="/admin"
      className="flex flex-col items-start justify-center gap-1 px-4 h-16 border-b border-navy-800 shrink-0"
    >
      <VuelatourLogo variant="dark" className="h-7 w-auto md:h-7" priority />
      <p className="text-[10px] text-navy-400 truncate">Aero Charter Cancún</p>
    </Link>
  );
}
