import { CpuChipIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PropellersTable,
  type PropellerRow,
} from "@/components/admin/propellers/propellers-table";
import { listPropellers } from "@/lib/api/propellers-server";

export const dynamic = "force-dynamic";

/** Horas de aviso antes de agotar el TBO (mismo umbral que motores). */
const PROXIMO_HRS = 100;

export default async function PropellersListPage() {
  const propsRes = await listPropellers({ limit: 200 });
  const propellers = propsRes.data;

  // Misma tabla que los motores (sin Tipo): derivados vivos del API, nunca
  // fórmulas locales. Sin dato = "—".
  const rows: PropellerRow[] = propellers
    .map((p): PropellerRow => {
      const rest = p.tbo_restante ?? null;
      return {
        id: p.id,
        aeronave_id: p.aeronave_id,
        matricula: p.aeronave?.matricula ?? "—",
        posicion: p.posicion,
        numero_serie: p.numero_serie,
        horas_vida: p.horas_actuales ?? null,
        desde_ovh: p.horas_desde_overhaul ?? null,
        tbo_horas: p.tbo_horas,
        rest,
        estado:
          rest == null
            ? "sin_tbo"
            : rest <= 0
              ? "vencido"
              : rest <= PROXIMO_HRS
                ? "proximo"
                : "ok",
      };
    })
    .sort(
      (a, b) =>
        (a.rest ?? Number.POSITIVE_INFINITY) - (b.rest ?? Number.POSITIVE_INFINITY),
    );

  const vencidos = rows.filter((r) => r.estado === "vencido").length;
  const proximos = rows.filter((r) => r.estado === "proximo").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Flota</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Hélices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {propellers.length} {propellers.length === 1 ? "hélice" : "hélices"} en la flota
          {vencidos > 0 && (
            <span className="text-destructive"> · {vencidos} con overhaul vencido</span>
          )}
          {proximos > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> · {proximos} próxima(s)</span>
          )}
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
