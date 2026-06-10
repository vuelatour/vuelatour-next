import { ShieldCheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { fmtDateOnly } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpirationActions } from "@/components/admin/expirations/expiration-actions";
import { ExpirationCreateButton } from "@/components/admin/expirations/expiration-create-button";
import { ExpirationsFilterBar } from "@/components/admin/expirations/expirations-filter-bar";
import { listExpirations } from "@/lib/api/expirations-server";
import { listDocumentTypes } from "@/lib/api/document-types-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { listEngines } from "@/lib/api/engines-server";
import { fmtDecimal } from "@/lib/format";
import type { EstadoVencimiento } from "@/types/expirations";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<EstadoVencimiento, string> = {
  VIGENTE: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  PROXIMO: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  VENCIDO: "bg-destructive/15 text-destructive border-destructive/30",
  PERMANENTE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  INDETERMINADO: "bg-muted text-muted-foreground border-border",
};

const ESTADO_LABELS: Record<EstadoVencimiento, string> = {
  VIGENTE: "Vigente",
  PROXIMO: "Próximo",
  VENCIDO: "Vencido",
  PERMANENTE: "Permanente",
  INDETERMINADO: "Sin dato",
};

interface ExpirationsPageProps {
  searchParams: Promise<{
    ambito?: string;
    estado?: string;
    aeronave_id?: string;
    piloto_id?: string;
  }>;
}

export default async function ExpirationsPage({ searchParams }: ExpirationsPageProps) {
  const sp = await searchParams;

  const [expRes, typesRes, aircraftRes, pilotsRes, enginesRes] = await Promise.all([
    listExpirations({
      ambito: sp.ambito || undefined,
      estado: sp.estado || undefined,
      aeronave_id: sp.aeronave_id || undefined,
      piloto_id: sp.piloto_id || undefined,
      limit: 500,
    }),
    listDocumentTypes({ limit: 200, activo: true }),
    listAircraft({ limit: 100 }),
    listUsers({ rol: "PILOTO", limit: 100 }),
    listEngines({ limit: 100 }),
  ]);

  const expiraciones = expRes.data;
  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const pilotsById = new Map(pilotsRes.data.map((p) => [p.id, p]));
  const enginesById = new Map(enginesRes.data.map((e) => [e.id, e]));

  const aircraftOpts = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
  }));
  const pilotOpts = pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const engineOpts = enginesRes.data.map((e) => ({
    id: e.id,
    numero_serie: e.numero_serie,
    aeronave_id: e.aeronave_id,
  }));

  const vencidos = expiraciones.filter((e) => e.estado === "VENCIDO").length;
  const proximos = expiraciones.filter((e) => e.estado === "PROXIMO").length;

  const targetLabel = (e: (typeof expiraciones)[number]): string => {
    if (e.aeronave_id) return aircraftById.get(e.aeronave_id)?.matricula ?? "Aeronave";
    if (e.piloto_id) return pilotsById.get(e.piloto_id)?.nombre ?? "Piloto";
    if (e.motor_id) return enginesById.get(e.motor_id)?.numero_serie ?? "Motor";
    return "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Vencimientos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {expiraciones.length} {expiraciones.length === 1 ? "registro" : "registros"}
            {vencidos > 0 && (
              <>
                {" · "}
                <span className="text-destructive">{vencidos} vencido(s)</span>
              </>
            )}
            {proximos > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">
                  {proximos} próximo(s)
                </span>
              </>
            )}
            .
          </p>
        </div>
        <ExpirationCreateButton
          documentTypes={typesRes.data}
          aircraft={aircraftOpts}
          pilots={pilotOpts}
          engines={engineOpts}
        />
      </div>

      <ExpirationsFilterBar
        aircraft={aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }))}
        pilots={pilotOpts}
        initial={{
          ambito: sp.ambito ?? "",
          estado: sp.estado ?? "",
          aeronave_id: sp.aeronave_id ?? "",
          piloto_id: sp.piloto_id ?? "",
        }}
      />

      {expiraciones.length === 0 ? (
        <EmptyState
            icon={ShieldCheckIcon}
            title="Sin vencimientos en el rango"
            description="Registra el primer documento o ajusta los filtros."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiraciones.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        {e.tipo?.es_critico && (
                          <span title="Documento crítico" className="text-destructive">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="font-medium">{e.tipo?.nombre ?? "—"}</span>
                      </div>
                      {e.referencia && (
                        <div className="text-[10px] text-muted-foreground">
                          Ref. {e.referencia}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{targetLabel(e)}</TableCell>
                    <TableCell className="text-xs">
                      {e.vence_por === "FECHA" && e.fecha_vencimiento
                        ? fmtDateOnly(e.fecha_vencimiento)
                        : e.vence_por === "HORAS" && e.horas_limite
                          ? `${fmtDecimal(e.horas_limite)} hrs`
                          : "Permanente"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {e.dias_restantes !== null
                        ? e.dias_restantes < 0
                          ? `hace ${Math.abs(e.dias_restantes)} d`
                          : `${e.dias_restantes} d`
                        : e.horas_restantes !== null
                          ? `${fmtDecimal(e.horas_restantes)} hrs`
                          : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ESTADO_STYLES[e.estado]}>
                        {ESTADO_LABELS[e.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ExpirationActions
                        expiration={e}
                        documentTypes={typesRes.data}
                        aircraft={aircraftOpts}
                        pilots={pilotOpts}
                        engines={engineOpts}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
