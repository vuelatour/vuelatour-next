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
import { listPropellers } from "@/lib/api/propellers-server";
import { fmtDecimal } from "@/lib/format";

export const dynamic = "force-dynamic";

const POSICION: Record<string, string> = {
  UNICA: "Única",
  IZQUIERDA: "Izquierda",
  DERECHA: "Derecha",
};

export default async function PropellersListPage() {
  const [propsRes, aircraftRes] = await Promise.all([
    listPropellers({ limit: 200 }),
    listAircraft({ limit: 200 }),
  ]);
  const propellers = propsRes.data;
  const matriculas = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>Posición</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Fabricante</TableHead>
                  <TableHead className="text-right">Horas totales</TableHead>
                  <TableHead className="text-right">TBO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propellers.map((p) => {
                  const matricula = matriculas.get(p.aeronave_id) ?? "—";
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/admin/aircraft/${p.aeronave_id}`}
                          className="font-mono font-semibold hover:underline"
                        >
                          {matricula}
                        </Link>
                      </TableCell>
                      <TableCell>{POSICION[p.posicion] ?? p.posicion}</TableCell>
                      <TableCell className="font-mono text-xs">{p.numero_serie}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.fabricante ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(p.horas_totales)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.tbo_horas ? `${fmtDecimal(p.tbo_horas)} hrs` : "—"}
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
