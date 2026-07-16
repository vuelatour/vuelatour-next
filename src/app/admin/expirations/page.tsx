import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { ExpirationCreateButton } from "@/components/admin/expirations/expiration-create-button";
import { ExpirationsFilterBar } from "@/components/admin/expirations/expirations-filter-bar";
import {
  ExpirationsTable,
  type ExpirationRow,
} from "@/components/admin/expirations/expirations-table";
import { listExpirations } from "@/lib/api/expirations-server";
import { listDocumentTypes } from "@/lib/api/document-types-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { listEngines } from "@/lib/api/engines-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

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

  // Filas-viewmodel serializables: el objetivo va resuelto (sin Maps al cliente).
  const rows: ExpirationRow[] = expiraciones.map((e) => ({
    ...e,
    objetivo: targetLabel(e),
  }));

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
            <ExpirationsTable
              rows={rows}
              documentTypes={typesRes.data}
              aircraft={aircraftOpts}
              pilots={pilotOpts}
              engines={engineOpts}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
