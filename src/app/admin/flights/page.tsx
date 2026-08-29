import Link from "next/link";
import {
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { FlightsFilterBar } from "@/components/admin/flights/flights-filter-bar";
import {
  FlightsTable,
  type FlightRow,
} from "@/components/admin/flights/flights-table";
import { listFlightsAll, getCobroStatus, getTacoStatus } from "@/lib/api/flights-server";
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
    cobro?: string;
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
      // SIN cap (anti-cap-200): prod ya rebasó los 200 vuelos y el corte
      // silencioso hacía parecer "no guardado" un vuelo que sí existía.
      listFlightsAll({
        estado: estadoFilter,
        piloto_id: sp.piloto_id || undefined,
        aeronave_id: sp.aeronave_id || undefined,
        cobro: sp.cobro || undefined,
        desde: sp.desde || undefined,
        hasta: sp.hasta || undefined,
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
  // azul para que operación vea toda la agenda en un solo lugar.
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

  // Semáforo de cobro: el flag `cobrado` ya viene en la fila; el batch trae
  // el total para distinguir PARCIAL de SIN COBRO. Solo se consultan filas
  // con precio y sin cobrar (las verdes no necesitan round-trip). Si el rol
  // no alcanza, null degrada a "Por cobrar" sin reventar la página.
  const cobroRelevantes = flightsRes.data.filter(
    (v) =>
      !v.cobrado && Number(v.monto_total_usd) > 0 && v.cotizacion_abierta !== true,
  );
  const cobroStatus = await getCobroStatus(
    cobroRelevantes.map((v) => v.id),
  ).catch(() => null);

  // Filas-viewmodel serializables para el componente cliente (sin Maps).
  // La tabla incluye TAMBIÉN las filas en cotización (azules).
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
    // Cuándo se capturó (para ordenar las filas sin fecha de vuelo). El
    // listado del API puede no mandar fecha_solicitud: created_at ≈ lo mismo.
    fecha_solicitud: v.fecha_solicitud ?? v.created_at ?? null,
    monto_total_usd: v.monto_total_usd,
    estado: v.estado,
    falta_taco: faltaTaco(v.id),
    en_cotizacion: esCotizacion(v),
    cobrado: v.cobrado,
    es_interno: clientsById.get(v.cliente_id)?.es_interno === true,
    cotizacion_abierta: v.cotizacion_abierta === true,
    total_cobrado_usd:
      cobroStatus === null ? null : (cobroStatus[v.id]?.total_cobrado ?? 0),
    sin_tc_count: cobroStatus?.[v.id]?.sin_tc_count ?? 0,
  }));
  // Orden por fecha de vuelo (recientes primero); SIN fecha PRIMERO
  // (auditoría 29-ago: al fondo, una fila recién creada sin fecha parecía
  // "no guardada"). Entre las sin fecha, la solicitud más nueva arriba.
  rows.sort((a, b) => {
    if (!a.fecha_vuelo || !b.fecha_vuelo) {
      if (!a.fecha_vuelo && !b.fecha_vuelo)
        return (b.fecha_solicitud ?? "").localeCompare(a.fecha_solicitud ?? "");
      return a.fecha_vuelo ? 1 : -1;
    }
    return b.fecha_vuelo.localeCompare(a.fecha_vuelo);
  });
  const sinFecha = rows.filter((r) => !r.fecha_vuelo).length;
  // Corte defensivo del anti-cap (count cambió a media carga): avisar en vez
  // de dejar que un vuelo "desaparezca" en silencio.
  const huboCorte = flightsRes.data.length < flightsRes.count;

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

      {huboCorte && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            Mostrando {rows.length} de {flightsRes.count} vuelos — usa los
            filtros para acotar la lista.
          </span>
        </div>
      )}

      {sinFecha > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            {sinFecha === 1
              ? "Hay 1 vuelo sin fecha de vuelo"
              : `Hay ${sinFecha} vuelos sin fecha de vuelo`}
            : aparecen al inicio de la tabla con la etiqueta{" "}
            <span className="font-medium">Sin fecha</span>. Ponles fecha desde
            su detalle para que entren a la agenda.
          </span>
        </div>
      )}

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
          cobro: sp.cobro ?? "",
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
            <FlightsTable rows={rows} huboCorte={huboCorte} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
