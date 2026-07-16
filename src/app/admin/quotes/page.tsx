import Link from "next/link";
import { CalculatorIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { QuotesFilterBar } from "@/components/admin/quotes/quotes-filter-bar";
import { QuotesTable, type QuoteListRow } from "@/components/admin/quotes/quotes-table";
import { listQuotes } from "@/lib/api/quotes-server";
import { listClients } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listPilots } from "@/lib/api/pilots-server";
import { listAirports } from "@/lib/api/airports-server";
import { NewReservaButton } from "@/components/admin/flights/new-reserva-button";
import { EmptyState } from "@/components/admin/empty-state";

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

  const [quotesRes, clientsRes, aircraftRes, pilotsRes, airportsRes] =
    await Promise.all([
      listQuotes({
        estado: sp.estado || undefined,
        cliente_id: sp.cliente_id || undefined,
        q: sp.q || undefined,
        limit: 200,
      }),
      listClients({ limit: 200, activo: true }),
      listAircraft({ limit: 100, activa: true }),
      listPilots({ estado: "ACTIVO", limit: 200 }),
      listAirports({ limit: 200, activo: true }),
    ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const { data: quotes, count } = quotesRes;

  // Filas planas y serializables para el componente cliente (lookups resueltos).
  const rows: QuoteListRow[] = quotes.map((q) => ({
    id: q.id,
    folio: q.folio,
    clienteNombre: clientsById.get(q.cliente_id)?.nombre ?? null,
    esExterno: q.es_externo,
    operadorExterno: q.operador_externo,
    ruta: (q.ruta_iatas && q.ruta_iatas.length > 0
      ? q.ruta_iatas
      : [q.origen_iata, q.destino_iata]
    ).join(" → "),
    fechaVuelo: q.fecha_vuelo,
    montoTotalUsd: q.monto_total_usd,
    version: q.cotizacion_version,
    estado: q.estado,
    sinAsignar:
      q.estado === "CONFIRMADO" && !q.es_externo && (!q.piloto_id || !q.aeronave_id),
    faltaPiloto: !q.piloto_id,
  }));
  const sinAsignar = rows.filter((r) => r.sinAsignar).length;

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
        <div className="flex items-center gap-2">
          {/* Flujo principal (acuerdo con cliente): primero la estructura base
              OPERATIVA (avión, ruta real, piloto, hora, cliente); el precio se
              arma después con "Cotizar" desde el detalle — o nunca, si el
              vuelo no lo necesita aún. */}
          <NewReservaButton
            clients={clientsRes.data.map((c) => ({
              id: c.id,
              nombre: c.nombre,
              rfc: c.rfc,
            }))}
            airports={airportsRes.data.map((a) => ({
              iata: a.iata,
              nombre: a.nombre,
            }))}
            aircraft={aircraftRes.data.map((a) => ({
              id: a.id,
              matricula: a.matricula,
              modelo: a.modelo,
            }))}
            pilots={pilotsRes.data.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              es_piloto_externo: p.es_piloto_externo,
            }))}
          />
        </div>
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
        <EmptyState
            icon={CalculatorIcon}
            title="Sin cotizaciones"
            description="Cuando guardes una cotización aparecerá aquí con su folio e historial."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <QuotesTable quotes={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
