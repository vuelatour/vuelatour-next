import { fmtUsd } from "@/lib/format";
import { fmtDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { CotizacionVersion } from "@/types/quotes-persisted";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «por Itzi Canales»: quién hizo la versión (9-nov-2026, API 0.0.132; pedido
 * de la oficina: «pueden poner quién hace cada versión»). El nombre lo manda
 * el API (`creado_por_nombre`); sin nombre —usuario que ya no existe, API
 * anterior— o si llegara un uuid, null: no se pinta nada (nunca un id).
 */
export function textoAutorVersion(
  v: Pick<CotizacionVersion, "creado_por_nombre"> | null | undefined,
): string | null {
  const nombre = (v?.creado_por_nombre ?? "").trim().replace(/\s+/g, " ");
  if (!nombre || UUID_RE.test(nombre)) return null;
  return `por ${nombre}`;
}

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
        const autor = textoAutorVersion(v);
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
                {autor && (
                  <span className="font-medium text-foreground" data-autor-version>
                    {" · "}
                    {autor}
                  </span>
                )}
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
