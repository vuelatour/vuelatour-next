export function SidebarFooter() {
  return (
    <div className="shrink-0 border-t border-navy-800 px-4 py-3 bg-navy-950">
      <div className="flex items-center gap-2 text-[10px] text-navy-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span>Sistema operativo</span>
        <span className="ml-auto">v0.1.0</span>
      </div>
    </div>
  );
}
