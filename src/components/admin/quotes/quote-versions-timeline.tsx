import { fmtUsd } from "@/lib/format";
import { fmtDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { CotizacionVersion } from "@/types/quotes-persisted";

export function QuoteVersionsTimeline({
  versions,
  currentVersion,
}: {
  versions: CotizacionVersion[];
  currentVersion: number;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Sin versiones registradas todavía.
      </p>
    );
  }

  // Mostramos de más reciente a más antigua.
  const ordered = [...versions].sort((a, b) => b.version - a.version);

  return (
    <ol className="space-y-4 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
      {ordered.map((v) => {
        const isCurrent = v.version === currentVersion;
        return (
          <li key={v.id} className="pl-6 relative">
            <span
              className={cn(
                "absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2",
                isCurrent
                  ? "bg-brand-600 border-brand-600"
                  : "bg-background border-border",
              )}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium font-mono">
                v{v.version}
                {isCurrent && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-brand-600 dark:text-brand-400 font-sans">
                    actual
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(v.created_at)}
              </p>
            </div>
            <p className="text-sm font-mono font-semibold mt-0.5">
              {fmtUsd(v.monto_total_usd)}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.origen_iata} → {v.destino_iata} · {v.pasajeros}{" "}
              {v.pasajeros === 1 ? "pax" : "pax"} · {v.tarifa_tipo}
            </p>
            {v.motivo && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                &ldquo;{v.motivo}&rdquo;
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
