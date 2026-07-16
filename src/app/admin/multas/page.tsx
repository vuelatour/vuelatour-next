import { ReceiptPercentIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { listMultas } from "@/lib/api/multas-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listPilots } from "@/lib/api/pilots-server";
import { MultaCreateButton } from "@/components/admin/multas/multa-create-button";
import { MultasTable } from "@/components/admin/multas/multas-table";
import type { Multa } from "@/types/multas";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function MultasPage() {
  const [multasRes, aircraftRes, pilotsRes] = await Promise.all([
    listMultas().catch(() => ({ data: [] as Multa[], count: 0, limit: 0, offset: 0 })),
    listAircraft({ limit: 100 }).catch(() => ({ data: [], count: 0, limit: 0, offset: 0 })),
    listPilots({ limit: 100 }).catch(() => ({ data: [], count: 0, limit: 0, offset: 0 })),
  ]);
  const multas = multasRes.data;
  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const pilots = pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Multas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro histórico de multas a aeronaves y pilotos.
          </p>
        </div>
        <MultaCreateButton aircraft={aircraft} pilots={pilots} />
      </div>

      {multas.length === 0 ? (
        <EmptyState
            icon={ReceiptPercentIcon}
            title="Sin multas registradas"
            description="Usa “Registrar multa” para agregar la primera."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <MultasTable multas={multas} aircraft={aircraft} pilots={pilots} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
