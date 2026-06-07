import Link from "next/link";
import { ChevronRightIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/api/me";
import { getDashboardOperativo } from "@/lib/api/dashboards-server";
import { getFleetUpcoming } from "@/lib/api/engineering-server";
import { filterNavGroupsForRole } from "@/lib/admin/nav-items";
import type { DashboardOperativo } from "@/types/dashboards";
import type { FleetUpcoming } from "@/types/engineering";

export const dynamic = "force-dynamic";

function currentPeriod(): { desde: string; hasta: string } {
  const now = new Date();
  const desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { desde: desde.toISOString().slice(0, 10), hasta: now.toISOString().slice(0, 10) };
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminDashboardPage() {
  const me = await getMe();
  const periodo = currentPeriod();

  const [operativo, upcoming] = await Promise.all([
    getDashboardOperativo(periodo).catch(() => null as DashboardOperativo | null),
    getFleetUpcoming(45).catch(() => null as FleetUpcoming | null),
  ]);

  const proximos = [
    ...(upcoming?.vencimientos ?? []).map((v) => ({
      id: `v-${v.id}`,
      label: v.tipo_documento?.nombre ?? "Vencimiento",
      matricula: v.aeronave?.matricula,
      fecha: v.fecha_vencimiento,
      critico: v.tipo_documento?.es_critico ?? false,
    })),
    ...(upcoming?.mantenimientos ?? []).map((m) => ({
      id: `m-${m.id}`,
      label: m.descripcion,
      matricula: m.aeronave?.matricula,
      fecha: m.fecha_programada,
      critico: false,
    })),
  ]
    .map((x) => ({ ...x, dias: daysUntil(x.fecha) }))
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 6);

  const grupos = filterNavGroupsForRole(me.rol)
    .map((g) => ({ ...g, items: g.items.filter((it) => it.href !== "/admin") }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Bienvenido,</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{me.nombre}</h1>
        </div>
        <Badge className="bg-brand-600/15 text-brand-600 hover:bg-brand-600/20 border-brand-600/30">
          {me.rol}
        </Badge>
      </div>

      {operativo && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Solicitudes de hoy" value={operativo.hoy.solicitudes_del_dia} />
          <Kpi label="Cotizaciones pendientes" value={operativo.hoy.cotizaciones_pendientes} />
          <Kpi label="Vuelos de la semana" value={operativo.vuelos_semana_total} />
        </div>
      )}

      {proximos.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Próximos vencimientos y servicios</CardTitle>
              <CardDescription>Documentos y mantenimientos en los próximos 45 días.</CardDescription>
            </div>
            <Link
              href="/admin/ingenieria"
              className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Ver todo <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {proximos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  {p.critico && <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 shrink-0" />}
                  <span className="truncate">
                    {p.label}
                    {p.matricula && (
                      <span className="text-muted-foreground font-mono"> · {p.matricula}</span>
                    )}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    p.dias <= 0
                      ? "bg-destructive/15 text-destructive border-destructive/30"
                      : p.dias <= 15
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : ""
                  }
                >
                  {p.dias <= 0 ? "Vencido" : `${p.dias} d`}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {grupos.map((g) => (
        <div key={g.label} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-brand-600/40 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
