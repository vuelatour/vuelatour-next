import Link from "next/link";
import {
  ArrowRightIcon,
  PaperAirplaneIcon,
  ClockIcon,
  CameraIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPilots } from "@/lib/api/pilots-server";
import { InvitePilotDialog } from "@/components/admin/pilots/invite-pilot-dialog";
import { AccessToggle } from "@/components/admin/pilots/access-toggle";
import type { PilotListItem } from "@/types/pilots";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

export default async function PilotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; externo?: string }>;
}) {
  const params = await searchParams;
  const { data: pilots, count } = await listPilots({
    q: params.q,
    estado: params.estado,
    externo: params.externo === "true" ? true : params.externo === "false" ? false : undefined,
    limit: 200,
  });

  const activos = pilots.filter((p) => p.estado === "ACTIVO").length;
  const invitados = pilots.filter((p) => p.estado === "INVITADO").length;
  const bloqueados = pilots.filter((p) => p.estado === "INACTIVO").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pilotos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "piloto" : "pilotos"}. Gestiona acceso a la app móvil,
            invita nuevos pilotos y consulta su actividad operativa.
          </p>
        </div>
        <InvitePilotDialog />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Activos" value={activos} tone="success" />
        <StatCard label="Invitados" value={invitados} tone="warning" />
        <StatCard label="Bloqueados" value={bloqueados} tone="muted" />
        <StatCard label="Total" value={count} tone="info" />
      </div>

      <form className="flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por nombre o email…"
          className="max-w-sm"
        />
        <select
          name="estado"
          defaultValue={params.estado ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="INVITADO">Invitados</option>
          <option value="INACTIVO">Bloqueados</option>
        </select>
        <select
          name="externo"
          defaultValue={params.externo ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="false">Base (con app)</option>
          <option value="true">Externos</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {pilots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay pilotos que coincidan con el filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pilots.map((p) => (
            <PilotCard key={p.id} pilot={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "muted" | "info";
}) {
  const toneCls = {
    success: "text-green-600 dark:text-green-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    muted: "text-muted-foreground",
    info: "text-brand-500",
  }[tone];

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function PilotCard({ pilot }: { pilot: PilotListItem }) {
  return (
    <Card className="hover:border-brand-500/40 transition-colors">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            {pilot.avatar_url && <AvatarImage src={pilot.avatar_url} alt={pilot.nombre} />}
            <AvatarFallback>{initials(pilot.nombre)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <Link
              href={`/admin/pilots/${pilot.id}`}
              className="font-semibold truncate hover:text-brand-500 transition-colors block"
            >
              {pilot.nombre}
            </Link>
            <p className="text-xs text-muted-foreground truncate">{pilot.email}</p>
            {pilot.es_piloto_externo && (
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Externo
              </span>
            )}
          </div>
        </div>

        {pilot.es_piloto_externo ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
            Sin acceso al sistema: la oficina captura sus tacómetros y gastos.
          </p>
        ) : (
          <AccessToggle id={pilot.id} estado={pilot.estado} size="sm" />
        )}

        <div className="grid grid-cols-5 gap-2 pt-2 border-t border-border">
          <Metric icon={PaperAirplaneIcon} value={pilot.stats.vuelos_mes} label="vuelos mes" />
          <Metric
            icon={ClockIcon}
            value={`${pilot.stats.horas_mes ?? 0} h`}
            label="horas mes"
          />
          <Metric icon={ClockIcon} value={pilot.stats.vuelos_proximos} label="próximos" />
          <Metric icon={CameraIcon} value={pilot.stats.capturas_mes} label="capturas" />
          <Metric icon={ReceiptPercentIcon} value={pilot.stats.gastos_mes} label="gastos" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>Último vuelo: {timeAgo(pilot.stats.ultimo_vuelo)}</span>
          <Link
            href={`/admin/pilots/${pilot.id}`}
            className="inline-flex items-center gap-1 text-brand-500 hover:underline font-medium"
          >
            Ver detalle <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof PaperAirplaneIcon;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="h-4 w-4 text-muted-foreground mb-1" />
      <span className="font-semibold text-sm">{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}
