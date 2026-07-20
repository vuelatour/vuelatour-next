import Link from "next/link";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { FlightsFilterBar } from "@/components/admin/flights/flights-filter-bar";
import {
  FlightsTable,
  type FlightRow,
} from "@/components/admin/flights/flights-table";
import { listFlights, getTacoStatus } from "@/lib/api/flights-server";
import { listClients } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";


interface FlightsPageProps {
  searchParams: Promise<{
    estado?: string;
    piloto_id?: string;
    aeronave_id?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function FlightsPage({ searchParams }: FlightsPageProps) {
  const sp = await searchParams;

  // Filtro default: vuelos activos (no solicitud/cotizado/cancelado).
  // Si el user no pasa estado, mostramos todos los operativos (CONFIRMADO+).
  const estadoFilter = sp.estado as EstadoVuelo | undefined;

  const [flightsRes, clientsRes, aircraftRes, pilotsRes] =
    await Promise.all([
      listFlights({
        estado: estadoFilter,
        piloto_id: sp.piloto_id || undefined,
        aeronave_id: sp.aeronave_id || undefined,
        desde: sp.desde || undefined,
        hasta: sp.hasta || undefined,
        limit: 200,
      }),
      // Best-effort: /v1/clients está restringido por rol (PII fiscal); un
      // rol operativo sin acceso ve la lista de vuelos sin nombre de cliente.
      listClients({ limit: 200, activo: true }).catch(() => ({
        data: [] as Awaited<ReturnType<typeof listClients>>["data"],
      })),
      listAircraft({ limit: 100, activa: true }),
      listUsers({ rol: "PILOTO", limit: 50 }),
    ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const pilotsById = new Map(pilotsRes.data.map((p) => [p.id, p]));

  // Vuelos = lifecycle operativo (CONFIRMADO en adelante). Lo que sigue en
  // SOLICITUD/COTIZADO se administra en /admin/quotes, pero se LISTA aquí en
  // azul para que la numeración de folios no tenga "huecos" (#16 → #14
  // parecía un vuelo borrado).
  const esCotizacion = (v: { estado: string }) =>
    v.estado === "SOLICITUD" || v.estado === "COTIZADO";
  const operativos = estadoFilter
    ? flightsRes.data
    : flightsRes.data.filter((v) => !esCotizacion(v));
  const enCotizacion = estadoFilter
    ? []
    : flightsRes.data.filter(esCotizacion);

  // Tacómetro incompleto: solo importa en vuelos propios ya en curso/cerrados.
  const tacoRelevantes = operativos.filter(
    (v) => !v.es_externo && (v.estado === "EN_VUELO" || v.estado === "COMPLETADO"),
  );
  const tacoStatus = await getTacoStatus(tacoRelevantes.map((v) => v.id)).catch(
    () => ({}) as Record<string, { falta: boolean }>,
  );
  const faltaTaco = (id: string) => tacoStatus[id]?.falta === true;

  // Filas-viewmodel serializables para el componente cliente (sin Maps).
  // La tabla incluye TAMBIÉN las filas en cotización (azules): el orden del
  // API las intercala por folio/fecha natural.
  const rows: FlightRow[] = flightsRes.data.map((v) => ({
    id: v.id,
    folio: v.folio,
    cliente_nombre: clientsById.get(v.cliente_id)?.nombre ?? null,
    es_externo: v.es_externo,
    operador_externo: v.operador_externo,
    ruta: (v.ruta_iatas && v.ruta_iatas.length > 0
      ? v.ruta_iatas
      : [v.origen_iata, v.destino_iata]
    ).join(" → "),
    matricula: v.aeronave_id
      ? (aircraftById.get(v.aeronave_id)?.matricula ?? null)
      : null,
    piloto_nombre: v.piloto_id
      ? (pilotsById.get(v.piloto_id)?.nombre ?? null)
      : null,
    fecha_vuelo: v.fecha_vuelo,
    monto_total_usd: v.monto_total_usd,
    estado: v.estado,
    falta_taco: faltaTaco(v.id),
    en_cotizacion: esCotizacion(v),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Vuelos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {operativos.length}{" "}
            {operativos.length === 1 ? "vuelo" : "vuelos"} en el rango.
            {enCotizacion.length > 0 && (
              <>
                {" "}
                {enCotizacion.length === 1
                  ? "1 más sigue en cotización"
                  : `${enCotizacion.length} más siguen en cotización`}{" "}
                (fila azul — los cotizados abren su detalle de vuelo; edita el
                precio en{" "}
                <Link href="/admin/quotes" className="underline text-brand-600">
                  Cotizaciones
                </Link>
                ).
              </>
            )}
          </p>
        </div>
        {/* TODOS los vuelos nacen igual (cotización normal en Cotizaciones);
            cubrir con externo se decide después, desde el detalle del vuelo. */}
      </div>

      <FlightsFilterBar
        aircraft={aircraftRes.data.map((a) => ({
          id: a.id,
          label: `${a.matricula} — ${a.modelo}`,
        }))}
        pilots={pilotsRes.data.map((p) => ({
          id: p.id,
          nombre: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
        }))}
        initial={{
          estado: sp.estado ?? "",
          piloto_id: sp.piloto_id ?? "",
          aeronave_id: sp.aeronave_id ?? "",
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
        }}
      />

      {operativos.length === 0 ? (
        <EmptyState icon={PaperAirplaneIcon} title="Sin vuelos activos" description={<>Cuando confirmes una cotización en{" "}
              <Link href="/admin/quotes" className="underline">
                Cotizaciones
              </Link>{" "}
              aparecerá aquí para asignar piloto, iniciar y completar.</>} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <FlightsTable rows={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
