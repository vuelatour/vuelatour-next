import Link from "next/link";
import { CalculatorIcon, PlusIcon } from "@heroicons/react/24/outline";
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

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<EstadoVuelo, string> = {
  SOLICITUD: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  COTIZADO: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  CONFIRMADO: "bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30",
  EN_VUELO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  COMPLETADO: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADO: "bg-destructive/15 text-destructive border-destructive/30",
};

const ESTADO_LABELS: Record<EstadoVuelo, string> = {
  SOLICITUD: "Solicitud",
  COTIZADO: "Cotizado",
  CONFIRMADO: "Confirmado",
  EN_VUELO: "En vuelo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

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
                            ? new Date(q.fecha_vuelo).toLocaleDateString("es-MX", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
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
                        <Badge variant="outline" className={ESTADO_STYLES[q.estado]}>
                          {ESTADO_LABELS[q.estado]}
                        </Badge>
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
