import Link from "next/link";
import { fmtDate } from "@/lib/datetime";
import { CalculatorIcon, PlusIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { QuotesFilterBar } from "@/components/admin/quotes/quotes-filter-bar";
import { listQuotes } from "@/lib/api/quotes-server";
import { listClients } from "@/lib/api/clients-server";
import { fmtUsd } from "@/lib/format";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";

export const dynamic = "force-dynamic";


interface QuotesPageProps {
  searchParams: Promise<{
    estado?: string;
    cliente_id?: string;
    q?: string;
  }>;
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const sp = await searchParams;

  const [quotesRes, clientsRes] = await Promise.all([
    listQuotes({
      estado: sp.estado || undefined,
      cliente_id: sp.cliente_id || undefined,
      q: sp.q || undefined,
      limit: 200,
    }),
    listClients({ limit: 200, activo: true }),
  ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const { data: quotes, count } = quotesRes;
  const sinAsignar = quotes.filter(
    (q) => q.estado === "CONFIRMADO" && !q.es_externo && (!q.piloto_id || !q.aeronave_id),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "cotización" : "cotizaciones"} en el rango.
          </p>
        </div>
        <Link href="/admin/quotes/new" className={buttonVariants({ size: "lg" })}>
          <PlusIcon className="h-4 w-4" />
          Nueva cotización
        </Link>
      </div>

      {sinAsignar > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm text-violet-700 dark:text-violet-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            {sinAsignar === 1
              ? "Hay 1 vuelo confirmado sin asignar piloto/avión."
              : `Hay ${sinAsignar} vuelos confirmados sin asignar piloto/avión.`}{" "}
            Asígnalos en{" "}
            <Link href="/admin/flights?estado=CONFIRMADO" className="underline font-medium">
              Vuelos
            </Link>
            ; en el calendario aparecen en morado.
          </span>
        </div>
      )}

      <QuotesFilterBar
        clients={clientsRes.data.map((c) => ({ id: c.id, nombre: c.nombre }))}
        initial={{
          estado: sp.estado ?? "",
          cliente_id: sp.cliente_id ?? "",
          q: sp.q ?? "",
        }}
      />

      {quotes.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CalculatorIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin cotizaciones</CardTitle>
            <CardDescription>
              Cuando guardes una cotización aparecerá aquí con su folio e historial.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Folio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Fecha vuelo</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead>v</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => {
                  const cli = clientsById.get(q.cliente_id);
                  return (
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          #{q.folio}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          <p className="font-medium text-sm">{cli?.nombre ?? "—"}</p>
                          {q.es_externo && (
                            <p className="text-[10px] text-muted-foreground">
                              Externo {q.operador_externo ?? ""}
                            </p>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          {q.origen_iata} → {q.destino_iata}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          {q.fecha_vuelo
                            ? fmtDate(q.fecha_vuelo)
                            : <span className="text-muted-foreground">—</span>}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          {fmtUsd(q.monto_total_usd)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Link href={`/admin/quotes/${q.id}`} className="block">
                          v{q.cotizacion_version}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/admin/quotes/${q.id}`}
                          className="inline-flex flex-col items-center gap-1"
                        >
                          <Badge variant="outline" className={ESTADO_STYLES[q.estado]}>
                            {ESTADO_LABELS[q.estado]}
                          </Badge>
                          {q.estado === "CONFIRMADO" &&
                            !q.es_externo &&
                            (!q.piloto_id || !q.aeronave_id) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                                <ExclamationTriangleIcon className="h-3 w-3" />
                                {!q.piloto_id ? "Falta piloto" : "Falta avión"}
                              </span>
                            )}
                        </Link>
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
