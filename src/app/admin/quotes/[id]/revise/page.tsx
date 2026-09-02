import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { getQuote } from "@/lib/api/quotes-server";
import { getClient } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import { ApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

interface RevisePageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviseQuotePage({ params }: RevisePageProps) {
  const { id } = await params;

  let quote;
  try {
    quote = await getQuote(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Revisable mientras no se haya cobrado/facturado (el backend valida lo
  // mismo); atajamos para no entrar a un form que no se puede guardar.
  // CANCELADA sí pasa (decisión del equipo, 1-sep-2026): la revisión de una
  // cancelada es para efectos financieros/documentales — en balances la
  // venta es lo cobrado, así que el cobro no bloquea; solo la factura.
  const esCancelada = quote.estado === "CANCELADO";
  if (quote.facturado || (!esCancelada && quote.cobrado)) {
    notFound();
  }

  // Vuelo de SERVICIO (taller/parada técnica sin pasajeros): no se cotiza ni
  // se asigna a una cotización (el backend rechaza igual con 409). Aviso
  // amable en vez del cotizador.
  const escalasActivas = (quote.escalas ?? []).filter((e) => !e.cancelada_at);
  const esVueloServicio =
    escalasActivas.length > 0 &&
    escalasActivas.some((e) => e.tipo_parada === "SERVICIO") &&
    escalasActivas.every((e) => !(Number(e.pasajeros) > 0));
  if (esVueloServicio) {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/flights/${quote.id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al vuelo
        </Link>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm max-w-2xl">
          <WrenchScrewdriverIcon className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">
              Vuelo de servicio: no se cotiza.
            </p>
            <p className="text-muted-foreground">
              Este vuelo lleva el avión a taller o parada técnica sin
              pasajeros; no es un viaje del cliente y no se le asigna
              cotización. Si sí es un viaje del cliente, quita la marca de
              Servicio en sus tramos o captura los pasajeros, y vuelve a
              intentar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [aircraftRes, routesRes, airportsRes, client] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
    listAirports({ limit: 200, activo: true }),
    getClient(quote.cliente_id).catch(() => null),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
    asientos: Number(a.asientos) || 0,
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd
      ? Number(a.tarifa_hora_broker_usd)
      : null,
  }));

  const routes = routesRes.data.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    es_redondo_auto: r.es_redondo_auto,
    num_aterrizajes: r.num_aterrizajes,
    tramos: r.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: t.requiere_pernocta,
      pernocta_costo_usd:
        t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
      tipo_parada: t.tipo_parada,
      servicio_notas: t.servicio_notas,
    })),
  }));

  const airports = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/quotes/${quote.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Cotización #{quote.folio}
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Revisar cotización
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edita parámetros y agrega un motivo. Se generará la versión v
          {quote.cotizacion_version + 1} y la actual queda en el historial.
        </p>
      </div>
      {/* Aviso ámbar para canceladas (1-sep-2026): mismo patrón del aviso de
          vuelo de servicio de esta página. */}
      {esCancelada && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm max-w-3xl">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Vuelo cancelado: editas la cotización para efectos
              financieros/documentales.
            </p>
            <p className="text-muted-foreground">
              En balances la venta sigue siendo lo cobrado y el vuelo NO se
              reactiva: permanece CANCELADO, sus tramos cancelados no reviven
              y la tripulación no recibe avisos.
            </p>
          </div>
        </div>
      )}
      <QuoteCalculator
        mode="revise"
        aircraft={aircraft}
        routes={routes}
        airports={airports}
        initialQuote={quote}
        clientName={client?.nombre ?? quote.cliente_id}
        clientEsInterno={client?.es_interno ?? false}
      />
    </div>
  );
}
