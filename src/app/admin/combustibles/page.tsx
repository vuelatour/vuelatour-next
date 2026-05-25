import Image from "next/image";
import Link from "next/link";
import { BeakerIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listFuelLoads, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";

export const dynamic = "force-dynamic";

export default async function CombustiblesPage() {
  const [{ data: loads, count }, aircraftRes] = await Promise.all([
    listFuelLoads(),
    listAircraft({ limit: 100 }),
  ]);

  const matriculaById = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));
  const fotos = await signFuelPhotos(
    loads.map((l) => l.foto_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Operación</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Combustibles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {count} {count === 1 ? "carga registrada" : "cargas registradas"} (incluye las del mecánico).
        </p>
      </div>

      {loads.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <BeakerIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin cargas de combustible</CardTitle>
            <CardDescription>
              Las cargas que registre el mecánico (o los pilotos) aparecerán aquí, vinculadas a su
              aeronave y vuelo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Recibo</TableHead>
                  <TableHead>Vuelo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((l) => {
                  const url = l.foto_url ? fotos[l.foto_url] : null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">
                        {l.aeronave_id ? (matriculaById.get(l.aeronave_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.fecha_gasto
                          ? new Date(l.fecha_gasto).toLocaleDateString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {l.moneda} {Number(l.monto).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs">{l.medio_pago}</TableCell>
                      <TableCell>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
                            <Image
                              src={url}
                              alt="Recibo"
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 rounded-md object-cover ring-1 ring-border"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.vuelo_id ? (
                          <Link href={`/admin/flights/${l.vuelo_id}`} className="text-brand-600 hover:underline">
                            Ver vuelo
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
