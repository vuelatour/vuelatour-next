import Link from "next/link";
import { CalculatorIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { QuotesFilterBar } from "@/components/admin/quotes/quotes-filter-bar";
import { QuotesTable, type QuoteListRow } from "@/components/admin/quotes/quotes-table";
import { listQuotesAll } from "@/lib/api/quotes-server";
import { getCobroStatus } from "@/lib/api/flights-server";
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
      // SIN cap (anti-cap-200): con el corte, una cotización recién creada
      // podía quedar fuera y parecer "no guardada" (auditoría 29-ago).
      listQuotesAll({
        estado: sp.estado || undefined,
        cliente_id: sp.cliente_id || undefined,
        q: sp.q || undefined,
      }),
      listClients({ limit: 200, activo: true }),
      // TODA la flota (no solo activa): la columna "Avión" debe resolver la
      // matrícula aunque el avión ya esté dado de baja; el alta de reserva
      // filtra las activas abajo.
      listAircraft({ limit: 100 }),
      listPilots({ estado: "ACTIVO", limit: 200 }),
      listAirports({ limit: 200, activo: true }),
    ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const { data: quotes, count } = quotesRes;

  // Semáforo de cobro (cotización y vuelo comparten id): batch solo para
  // filas con precio y sin cobrar; null degrada a "Por cobrar" sin romper.
  // SOLICITUD/COTIZADO también entran: un anticipo debe verse "Parcial"
  // igual que en la lista de vuelos.
  const cobroRelevantes = quotes.filter(
    (q) =>
      !q.cobrado &&
      Number(q.monto_total_usd) > 0 &&
      q.cotizacion_abierta !== true,
  );
  const cobroStatus = await getCobroStatus(
    cobroRelevantes.map((q) => q.id),
  ).catch(() => null);

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
    // Avión cotizado (pedido 3-sep): matrícula de la flota o, en externos,
    // la matrícula del avión ajeno; multi-avión agrega "+N".
    avionMatricula: q.es_externo
      ? (q.avion_externo_matricula ?? null)
      : (q.aeronave_id ? (aircraftById.get(q.aeronave_id)?.matricula ?? null) : null),
    avionModelo: q.es_externo
      ? null
      : (q.aeronave_id ? (aircraftById.get(q.aeronave_id)?.modelo ?? null) : null),
    avionesExtra: Math.max(0, (q.participacion_aviones?.length ?? 1) - 1),
    fechaVuelo: q.fecha_vuelo,
    // Cuándo se capturó: ordena las filas sin fecha de vuelo (nuevas arriba).
    fechaSolicitud: q.fecha_solicitud ?? q.created_at ?? null,
    montoTotalUsd: q.monto_total_usd,
    version: q.cotizacion_version,
    estado: q.estado,
    sinAsignar:
      q.estado === "CONFIRMADO" && !q.es_externo && (!q.piloto_id || !q.aeronave_id),
    faltaPiloto: !q.piloto_id,
    cobrado: q.cobrado,
    esInterno: clientsById.get(q.cliente_id)?.es_interno === true,
    cotizacionAbierta: q.cotizacion_abierta === true,
    totalCobradoUsd:
      cobroStatus === null ? null : (cobroStatus[q.id]?.total_cobrado ?? 0),
    sinTcCount: cobroStatus?.[q.id]?.sin_tc_count ?? 0,
  }));
  // Orden por fecha de vuelo (recientes primero); SIN fecha PRIMERO
  // (auditoría 29-ago: al fondo, una cotización recién creada sin fecha
  // parecía "no guardada"). Entre las sin fecha, la solicitud más nueva
  // arriba.
  rows.sort((a, b) => {
    if (!a.fechaVuelo || !b.fechaVuelo) {
      if (!a.fechaVuelo && !b.fechaVuelo)
        return (b.fechaSolicitud ?? "").localeCompare(a.fechaSolicitud ?? "");
      return a.fechaVuelo ? 1 : -1;
    }
    return b.fechaVuelo.localeCompare(a.fechaVuelo);
  });
  const sinAsignar = rows.filter((r) => r.sinAsignar).length;
  const sinFecha = rows.filter((r) => !r.fechaVuelo).length;
  // Corte defensivo del anti-cap (count cambió a media carga): avisar en vez
  // de dejar que una cotización "desaparezca" en silencio.
  const huboCorte = quotes.length < count;

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
            aircraft={aircraftRes.data
              .filter((a) => a.activa)
              .map((a) => ({
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

      {huboCorte && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            Mostrando {quotes.length} de {count} cotizaciones — usa los
            filtros para acotar la lista.
          </span>
        </div>
      )}

      {sinFecha > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            {sinFecha === 1
              ? "Hay 1 cotización sin fecha de vuelo"
              : `Hay ${sinFecha} cotizaciones sin fecha de vuelo`}
            : aparecen al inicio de la tabla con la etiqueta{" "}
            <span className="font-medium">Sin fecha</span>. Ábrelas y ponles
            fecha para que entren a la agenda.
          </span>
        </div>
      )}

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
            <QuotesTable quotes={rows} huboCorte={huboCorte} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
