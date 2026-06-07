import Link from "next/link";
import { CpuChipIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAircraft } from "@/lib/api/aircraft";
import { listEngines } from "@/lib/api/engines-server";
import { fmtDecimal } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Horas de aviso antes de agotar el TBO. */
const PROXIMO_HRS = 100;

const POSICION: Record<string, string> = {
  UNICO: "Único",
  IZQUIERDO: "Izquierdo",
  DERECHO: "Derecho",
};

function restantes(totales: string, turm: string, tbo: string): number {
  return Number(tbo) - (Number(totales) - Number(turm));
}

export default async function EnginesListPage() {
  const [enginesRes, aircraftRes] = await Promise.all([
    listEngines({ limit: 200 }),
    listAircraft({ limit: 200 }),
  ]);
  const engines = enginesRes.data;
  const matriculas = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));

  const rows = engines
    .map((e) => ({ ...e, rest: restantes(e.horas_totales, e.turm, e.tbo_horas) }))
    .sort((a, b) => a.rest - b.rest);

  const vencidos = rows.filter((r) => r.rest <= 0).length;
  const proximos = rows.filter((r) => r.rest > 0 && r.rest <= PROXIMO_HRS).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Flota</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Motores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {engines.length} {engines.length === 1 ? "motor" : "motores"} en la flota
          {vencidos > 0 && (
            <span className="text-destructive"> · {vencidos} con overhaul vencido</span>
          )}
          {proximos > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> · {proximos} próximo(s)</span>
          )}
        </p>
      </div>

      {engines.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CpuChipIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin motores registrados</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>Posición</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Horas totales</TableHead>
                  <TableHead className="text-right">TURM</TableHead>
                  <TableHead className="text-right">TBO</TableHead>
                  <TableHead className="text-right">Restantes</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const matricula = matriculas.get(e.aeronave_id) ?? "—";
                  const estado =
                    e.rest <= 0 ? "vencido" : e.rest <= PROXIMO_HRS ? "proximo" : "ok";
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link
                          href={`/admin/aircraft/${e.aeronave_id}`}
                          className="font-mono font-semibold hover:underline"
                        >
                          {matricula}
                        </Link>
                      </TableCell>
                      <TableCell>{POSICION[e.posicion] ?? e.posicion}</TableCell>
                      <TableCell className="font-mono text-xs">{e.numero_serie}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {e.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(e.horas_totales)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(e.turm)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(e.tbo_horas)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          estado === "vencido" ? "text-destructive font-semibold" : ""
                        }`}
                      >
                        {fmtDecimal(e.rest)}
                      </TableCell>
                      <TableCell className="text-center">
                        {estado === "vencido" ? (
                          <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                            Overhaul vencido
                          </Badge>
                        ) : estado === "proximo" ? (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                            Próximo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
