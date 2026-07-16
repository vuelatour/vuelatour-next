import { CpuChipIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PropellersTable,
  type PropellerRow,
} from "@/components/admin/propellers/propellers-table";
import { listAircraft } from "@/lib/api/aircraft";
import { listPropellers } from "@/lib/api/propellers-server";

export const dynamic = "force-dynamic";

export default async function PropellersListPage() {
  const [propsRes, aircraftRes] = await Promise.all([
    listPropellers({ limit: 200 }),
    listAircraft({ limit: 200 }),
  ]);
  const propellers = propsRes.data;
  const matriculas = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));

  const rows: PropellerRow[] = propellers.map((p) => ({
    id: p.id,
    aeronave_id: p.aeronave_id,
    matricula: matriculas.get(p.aeronave_id) ?? "—",
    posicion: p.posicion,
    numero_serie: p.numero_serie,
    fabricante: p.fabricante,
    horas_totales: p.horas_totales,
    tbo_horas: p.tbo_horas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Flota</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Hélices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {propellers.length} {propellers.length === 1 ? "hélice" : "hélices"} en la flota
        </p>
      </div>

      {propellers.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CpuChipIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin hélices registradas</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <PropellersTable propellers={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
